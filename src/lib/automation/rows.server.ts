import { createHash, randomBytes, randomInt } from "node:crypto";
import { getSql } from "@/lib/db";
import { addEvent, ensureStep, loadBundle, newCaseId, patchStep, touchCase } from "@/lib/desk/rows.server";
import { todayIst } from "@/lib/desk/timers";
import { describeDiff, diffInventory, diffIsEmpty } from "./fingerprint";
import { canMove, DEVICE_ONLINE_MS, isActive, JOB_STALE_MS, settleFailure, stepPatchFor } from "./jobs";
import { recipeMeta } from "./recipes";
import type {
  ArtifactKind,
  ClaimedJob,
  DeviceView,
  FailureClass,
  Gate,
  Inventory,
  JobEventKind,
  JobResult,
  JobStatus,
  JobView,
} from "./types";
import type { StepKind } from "@/lib/desk/types";

/** Server-only rows for filing jobs and kiosk devices. Every user-facing query is scoped by user id. */

export class JobError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "JobError";
  }
}

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return value == null ? "" : String(value);
}

function isoOrNull(value: unknown): string | null {
  return value == null ? null : iso(value);
}

function json<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// --- devices ----------------------------------------------------------------

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const PAIRING_TTL_MS = 10 * 60 * 1000;

function pairingCode(): string {
  let s = "";
  for (let i = 0; i < 8; i += 1) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

export async function createPairing(userId: string): Promise<{ code: string; expiresAt: string }> {
  const sql = await getSql();
  await sql`delete from runner_pairings where user_id = ${userId} and (used_at is not null or expires_at < now())`;
  const code = pairingCode();
  const expiresAt = new Date(Date.now() + PAIRING_TTL_MS).toISOString();
  await sql`insert into runner_pairings (code, user_id, expires_at) values (${code}, ${userId}, ${expiresAt})`;
  return { code, expiresAt };
}

export async function redeemPairing(rawCode: string, name: string, version: string): Promise<{ deviceId: string; token: string }> {
  const code = rawCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^(.{4})(.{4})$/, "$1-$2");
  const sql = await getSql();
  const rows = await sql<{ user_id: string }>`
    update runner_pairings set used_at = now()
    where code = ${code} and used_at is null and expires_at > now()
    returning user_id
  `;
  if (!rows[0]) throw new JobError("Pairing code is wrong or expired. Make a new one in ArziDesk → Companion.", 401);
  const token = `arzi_${randomBytes(24).toString("base64url")}`;
  const deviceId = newCaseId("dev");
  await sql`
    insert into runner_devices (id, user_id, name, token_hash, companion_version, last_seen_at)
    values (${deviceId}, ${rows[0].user_id}, ${name.slice(0, 80) || "Kiosk PC"}, ${hashToken(token)}, ${version.slice(0, 40)}, now())
  `;
  return { deviceId, token };
}

export type DeviceRow = { id: string; userId: string; name: string };

export async function deviceForToken(token: string, version?: string): Promise<DeviceRow | null> {
  if (!token.startsWith("arzi_")) return null;
  const sql = await getSql();
  const rows = await sql<{ id: string; user_id: string; name: string }>`
    update runner_devices set last_seen_at = now(), companion_version = coalesce(${version?.slice(0, 40) ?? null}, companion_version)
    where token_hash = ${hashToken(token)} and revoked_at is null
    returning id, user_id, name
  `;
  return rows[0] ? { id: rows[0].id, userId: rows[0].user_id, name: rows[0].name } : null;
}

export async function listDevices(userId: string): Promise<DeviceView[]> {
  const sql = await getSql();
  const rows = await sql<Record<string, unknown>>`
    select * from runner_devices where user_id = ${userId} and revoked_at is null order by created_at desc
  `;
  const now = Date.now();
  return rows.map((r) => {
    const seen = isoOrNull(r.last_seen_at);
    return {
      id: String(r.id),
      name: String(r.name ?? ""),
      companionVersion: String(r.companion_version ?? ""),
      lastSeenAt: seen,
      online: Boolean(seen && now - Date.parse(seen) < DEVICE_ONLINE_MS),
      createdAt: iso(r.created_at),
    };
  });
}

export async function revokeDevice(userId: string, id: string): Promise<void> {
  const sql = await getSql();
  await sql`update runner_devices set revoked_at = now() where id = ${id} and user_id = ${userId}`;
}

// --- jobs -------------------------------------------------------------------

type JobRow = {
  id: string;
  userId: string;
  caseId: string;
  stepKind: StepKind;
  recipeId: string;
  recipeVersion: number;
  status: JobStatus;
  payload: Record<string, unknown>;
  redact: string[];
  gate: Gate | null;
  result: JobResult | null;
  error: string;
  failure: FailureClass | null;
  deviceId: string | null;
  cancelRequested: boolean;
  submitStartedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function mapJob(r: Record<string, unknown>): JobRow {
  return {
    id: String(r.id),
    userId: String(r.user_id),
    caseId: String(r.case_id),
    stepKind: String(r.step_kind) as StepKind,
    recipeId: String(r.recipe_id),
    recipeVersion: Number(r.recipe_version),
    status: String(r.status) as JobStatus,
    payload: json(r.payload, {}),
    redact: json(r.redact, []),
    gate: json<Gate | null>(r.gate, null),
    result: json<JobResult | null>(r.result, null),
    error: String(r.error ?? ""),
    failure: r.failure ? (String(r.failure) as FailureClass) : null,
    deviceId: r.device_id ? String(r.device_id) : null,
    cancelRequested: Boolean(r.cancel_requested),
    submitStartedAt: isoOrNull(r.submit_started_at),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

async function jobById(id: string): Promise<JobRow | null> {
  const sql = await getSql();
  const rows = await sql<Record<string, unknown>>`select * from filing_jobs where id = ${id} limit 1`;
  return rows[0] ? mapJob(rows[0]) : null;
}

export async function insertJob(opts: {
  userId: string;
  caseId: string;
  stepKind: StepKind;
  recipeId: string;
  recipeVersion: number;
  payload: object;
  redact: string[];
}): Promise<string> {
  const sql = await getSql();
  const id = newCaseId("job");
  try {
    await sql`
      insert into filing_jobs (id, user_id, case_id, step_kind, recipe_id, recipe_version, payload, redact)
      values (
        ${id}, ${opts.userId}, ${opts.caseId}, ${opts.stepKind}, ${opts.recipeId}, ${opts.recipeVersion},
        ${JSON.stringify(opts.payload)}::jsonb, ${JSON.stringify(opts.redact)}::jsonb
      )
    `;
  } catch (err) {
    if (String(err instanceof Error ? err.message : err).includes("filing_jobs_one_active")) {
      throw new JobError("A job for this step is already running. Wait for it or cancel it first.", 409);
    }
    throw err;
  }
  await appendEvent(opts.userId, id, "status", "Queued for the companion");
  return id;
}

export async function appendEvent(userId: string, jobId: string, kind: JobEventKind, text: string, data?: unknown): Promise<void> {
  const sql = await getSql();
  await sql`
    insert into job_events (id, job_id, user_id, kind, text, data)
    values (${newCaseId("je")}, ${jobId}, ${userId}, ${kind}, ${text.slice(0, 600)}, ${data === undefined ? null : JSON.stringify(data)}::jsonb)
  `;
}

/** Jobs whose companion went silent: settle them so the step is not held forever. */
export async function sweepStale(userId: string): Promise<void> {
  const sql = await getSql();
  const cutoff = new Date(Date.now() - JOB_STALE_MS).toISOString();
  const rows = await sql<Record<string, unknown>>`
    select * from filing_jobs
    where user_id = ${userId} and status in ('running', 'waiting_human', 'submitting') and updated_at < ${cutoff}
  `;
  for (const job of rows.map(mapJob)) {
    const settled = settleFailure({ submitStarted: Boolean(job.submitStartedAt), failure: "human_timeout" });
    await sql`
      update filing_jobs set status = ${settled.status}, failure = ${settled.failure}, gate = null,
        error = ${"The companion stopped reporting."}, finished_at = now(), updated_at = now()
      where id = ${job.id} and status = ${job.status}
    `;
    await appendEvent(job.userId, job.id, "error", settled.status === "needs_reconcile" ? "Companion went silent after submitting. Check before retrying." : "Companion went silent; job stopped.");
  }
}

export async function listJobs(userId: string, caseId: string): Promise<JobView[]> {
  const sql = await getSql();
  const rows = await sql<Record<string, unknown>>`
    select j.*, d.name as device_name from filing_jobs j
    left join runner_devices d on d.id = j.device_id
    where j.user_id = ${userId} and j.case_id = ${caseId}
    order by j.created_at desc limit 20
  `;
  if (!rows.length) return [];
  const ids = rows.map((r) => String(r.id));
  const [events, artifacts] = await Promise.all([
    sql<Record<string, unknown>>`
      select id, job_id, kind, text, created_at from job_events
      where user_id = ${userId} and job_id = any(${ids}::text[]) and kind <> 'checkpoint'
      order by created_at
    `,
    sql<Record<string, unknown>>`
      select id, job_id, kind, name, content_type, created_at from job_artifacts
      where user_id = ${userId} and job_id = any(${ids}::text[]) and kind in ('screenshot', 'receipt')
      order by created_at
    `,
  ]);
  return rows.map((r) => {
    const job = mapJob(r);
    return {
      id: job.id,
      recipeId: job.recipeId,
      recipeVersion: job.recipeVersion,
      stepKind: job.stepKind,
      status: job.status,
      gate: job.gate,
      result: job.result,
      error: job.error,
      failure: job.failure,
      deviceName: String(r.device_name ?? ""),
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      submitStartedAt: job.submitStartedAt,
      events: events
        .filter((e) => e.job_id === job.id)
        .slice(-60)
        .map((e) => ({ id: String(e.id), kind: String(e.kind) as JobEventKind, text: String(e.text ?? ""), createdAt: iso(e.created_at) })),
      artifacts: artifacts
        .filter((a) => a.job_id === job.id)
        .map((a) => ({ id: String(a.id), kind: String(a.kind) as ArtifactKind, name: String(a.name ?? ""), contentType: String(a.content_type), createdAt: iso(a.created_at) })),
    };
  });
}

export async function userJob(userId: string, jobId: string): Promise<JobRow> {
  const job = await jobById(jobId);
  if (!job || job.userId !== userId) throw new JobError("Job not found.", 404);
  return job;
}

export async function cancelJob(userId: string, jobId: string): Promise<void> {
  const job = await userJob(userId, jobId);
  const sql = await getSql();
  if (job.status === "queued") {
    await sql`update filing_jobs set status = 'cancelled', failure = 'cancelled', finished_at = now(), updated_at = now() where id = ${job.id} and status = 'queued'`;
    await appendEvent(userId, job.id, "status", "Cancelled before the companion picked it up");
    return;
  }
  if (job.status === "submitting") throw new JobError("It is submitting on the portal now. Let it finish.", 409);
  if (!isActive(job.status)) return;
  await sql`update filing_jobs set cancel_requested = true, updated_at = now() where id = ${job.id}`;
  await appendEvent(userId, job.id, "status", "Cancel requested");
}

// --- runner side ------------------------------------------------------------

export async function claimNext(device: DeviceRow): Promise<ClaimedJob | null> {
  await sweepStale(device.userId);
  const sql = await getSql();
  const rows = await sql<Record<string, unknown>>`
    update filing_jobs set status = 'running', device_id = ${device.id}, started_at = now(), updated_at = now()
    where id = (
      select id from filing_jobs
      where user_id = ${device.userId} and status = 'queued'
      order by created_at limit 1
      for update skip locked
    ) and status = 'queued'
    returning *
  `;
  if (!rows[0]) return null;
  const job = mapJob(rows[0]);
  await appendEvent(device.userId, job.id, "status", `Picked up by ${device.name}`);
  const bundle = await loadBundle(device.userId, job.caseId);
  return {
    id: job.id,
    recipeId: job.recipeId,
    recipeVersion: job.recipeVersion,
    caseId: job.caseId,
    stepKind: job.stepKind,
    title: bundle.record.title,
    payload: job.payload,
    redact: job.redact,
  };
}

async function deviceJob(device: DeviceRow, jobId: string): Promise<JobRow> {
  const job = await jobById(jobId);
  if (!job || job.userId !== device.userId || job.deviceId !== device.id) throw new JobError("Job not found for this device.", 404);
  return job;
}

export type ProgressReport = {
  events?: Array<{ kind: JobEventKind; text: string; data?: unknown }>;
  status?: "running" | "waiting_human" | "submitting";
  gate?: Gate | null;
  /** The portal turned the submit down (wrong captcha): nothing was filed, lift the boundary. */
  clearSubmit?: boolean;
};

export async function reportProgress(device: DeviceRow, jobId: string, report: ProgressReport): Promise<{ cancel: boolean; status: JobStatus }> {
  const job = await deviceJob(device, jobId);
  if (!isActive(job.status)) return { cancel: true, status: job.status };
  for (const ev of report.events ?? []) {
    await appendEvent(device.userId, job.id, ev.kind, ev.text, ev.data);
    if (ev.kind === "checkpoint") await recordCheckpoint(job, ev.data);
  }
  const next = report.status ?? job.status;
  if (!canMove(job.status, next)) throw new JobError(`Cannot move a ${job.status} job to ${next}.`, 409);
  const gate = report.gate === undefined ? job.gate : report.gate;
  const sql = await getSql();
  await sql`
    update filing_jobs set
      status = ${next},
      gate = ${gate ? JSON.stringify(gate) : null}::jsonb,
      submit_started_at = case
        when ${next === "submitting"}::boolean then coalesce(submit_started_at, now())
        when ${Boolean(report.clearSubmit) && next === "running"}::boolean then null
        else submit_started_at end,
      updated_at = now()
    where id = ${job.id}
  `;
  return { cancel: job.cancelRequested && next !== "submitting", status: next };
}

const MAX_ARTIFACT_BYTES = 1.5 * 1024 * 1024;

export async function addArtifact(
  device: DeviceRow,
  jobId: string,
  a: { kind: ArtifactKind; name: string; contentType: string; body: string; shareable: boolean },
): Promise<string> {
  const job = await deviceJob(device, jobId);
  if (a.body.length > MAX_ARTIFACT_BYTES * 1.37) throw new JobError("Artifact too large.", 413);
  // Screenshots and receipts show citizen data; only redacted DOM and inventories may leave the account.
  const shareable = a.shareable && (a.kind === "dom" || a.kind === "inventory");
  const id = newCaseId("art");
  const sql = await getSql();
  await sql`
    insert into job_artifacts (id, job_id, user_id, kind, name, content_type, body, shareable)
    values (${id}, ${job.id}, ${device.userId}, ${a.kind}, ${a.name.slice(0, 120)}, ${a.contentType.slice(0, 80)}, ${a.body}, ${shareable})
  `;
  return id;
}

export async function artifactFor(userId: string, id: string): Promise<{ contentType: string; body: string; name: string } | null> {
  const sql = await getSql();
  const rows = await sql<Record<string, unknown>>`select content_type, body, name from job_artifacts where id = ${id} and user_id = ${userId} limit 1`;
  return rows[0] ? { contentType: String(rows[0].content_type), body: String(rows[0].body), name: String(rows[0].name ?? "") } : null;
}

export type FinishReport =
  | { ok: true; result: JobResult; softDrift?: string[] }
  | { ok: false; failure: FailureClass; error: string; stepId?: string };

export async function finishJob(device: DeviceRow, jobId: string, report: FinishReport): Promise<{ status: JobStatus }> {
  const job = await deviceJob(device, jobId);
  if (!isActive(job.status)) return { status: job.status };
  const sql = await getSql();
  if (report.ok) {
    // Case first, job second: whoever sees "succeeded" must also see the filing on the step.
    await applyResult(job, report.result).catch(async (err: unknown) => {
      console.error("[automation] could not write the result to the case", err);
      await appendEvent(device.userId, job.id, "error", "The portal accepted it, but the case could not be updated. Record it by hand.");
    });
    await sql`
      update filing_jobs set status = 'succeeded', gate = null, result = ${JSON.stringify(report.result)}::jsonb,
        finished_at = now(), updated_at = now()
      where id = ${job.id}
    `;
    await appendEvent(device.userId, job.id, "status", report.result.summary || "Done");
    await promoteCheckpoints(job);
    if (report.softDrift?.length) {
      // It worked only because the fallback found a field: repair now, before the next run needs the operator.
      const { noteDrift } = await import("./repair.server");
      for (const stepId of report.softDrift.slice(0, 10)) await noteDrift(job, stepId, { force: true });
    }
    return { status: "succeeded" };
  }
  const settled = settleFailure({ submitStarted: Boolean(job.submitStartedAt), failure: report.failure });
  await sql`
    update filing_jobs set status = ${settled.status}, failure = ${settled.failure}, gate = null,
      error = ${report.error.slice(0, 1000)}, finished_at = now(), updated_at = now()
    where id = ${job.id}
  `;
  await appendEvent(device.userId, job.id, "error", report.error.slice(0, 600));
  if (settled.status === "needs_reconcile") {
    const bundle = await loadBundle(job.userId, job.caseId);
    await addEvent(job.userId, job.caseId, "automation", "Portal filing needs checking: the result after submitting was not seen. Do not file again until reconciled.");
    await touchCase(job.userId, bundle.record.id);
  }
  if (report.failure === "drift" && report.stepId) {
    const { noteDrift } = await import("./repair.server");
    await noteDrift(job, report.stepId);
  }
  return { status: settled.status };
}

/** Write a success to the case step and the history, the same way a manual record does. */
async function applyResult(job: JobRow, result: JobResult): Promise<void> {
  const meta = recipeMeta(job.recipeId);
  let filedFallback = todayIst();
  if (meta?.purpose === "reconcile" || job.status === "needs_reconcile") {
    // The filing happened when the stuck job submitted, not when it was reconciled.
    const sql = await getSql();
    const first = await sql<{ submit_started_at: unknown }>`
      select submit_started_at from filing_jobs
      where case_id = ${job.caseId} and step_kind = ${job.stepKind} and submit_started_at is not null
      order by submit_started_at desc limit 1
    `;
    const at = first[0]?.submit_started_at;
    if (at) filedFallback = new Date(iso(at)).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  }
  const patch = stepPatchFor(job.recipeId, result, filedFallback);
  const bundle = await loadBundle(job.userId, job.caseId);
  if (patch) {
    const step = await ensureStep(job.userId, bundle.record, job.stepKind);
    await patchStep(job.userId, step, patch);
  }
  const what = meta?.title.en ?? job.recipeId;
  const ref = result.reference ? ` · ${result.reference}` : "";
  await addEvent(job.userId, job.caseId, "automation", `${what}: ${result.summary || "done"}${ref}`.slice(0, 500));
  if (meta?.purpose === "reconcile" && result.reference) {
    const sql = await getSql();
    const open = await sql<{ id: string }>`
      select id from filing_jobs where case_id = ${job.caseId} and step_kind = ${job.stepKind} and status = 'needs_reconcile'
    `;
    for (const o of open) {
      await sql`update filing_jobs set status = 'succeeded', result = ${JSON.stringify(result)}::jsonb, updated_at = now() where id = ${o.id}`;
      await appendEvent(job.userId, o.id, "status", `Reconciled: ${result.reference}`);
    }
  }
  await touchCase(job.userId, job.caseId);
}

/** Operator settles a needs_reconcile job by hand. */
export async function resolveReconcile(userId: string, jobId: string, outcome: { reference?: string; notFiled?: boolean }): Promise<void> {
  const job = await userJob(userId, jobId);
  if (job.status !== "needs_reconcile") throw new JobError("This job does not need reconciling.", 409);
  const sql = await getSql();
  if (outcome.reference) {
    const result: JobResult = { summary: "Reconciled by the operator", reference: outcome.reference.trim().toUpperCase().slice(0, 60) };
    await sql`update filing_jobs set status = 'succeeded', result = ${JSON.stringify(result)}::jsonb, updated_at = now() where id = ${job.id}`;
    await appendEvent(userId, job.id, "status", `Operator recorded ${result.reference}`);
    await applyResult(job, result);
    return;
  }
  if (outcome.notFiled) {
    await sql`update filing_jobs set status = 'failed', error = 'Operator confirmed the portal did not take it.', updated_at = now() where id = ${job.id}`;
    await appendEvent(userId, job.id, "status", "Operator confirmed it was not filed; a new attempt is allowed");
  }
}

export async function hasOpenReconcile(userId: string, caseId: string, stepKind: StepKind): Promise<boolean> {
  const sql = await getSql();
  const rows = await sql`select 1 from filing_jobs where user_id = ${userId} and case_id = ${caseId} and step_kind = ${stepKind} and status = 'needs_reconcile' limit 1`;
  return rows.length > 0;
}

// --- recipe health ----------------------------------------------------------

type Checkpoint = { stepId: string; fingerprint: string; inventory: Inventory };

function readCheckpoint(data: unknown): Checkpoint | null {
  const d = data as Partial<Checkpoint> | null;
  if (!d || typeof d.stepId !== "string" || typeof d.fingerprint !== "string" || !d.inventory || !Array.isArray(d.inventory.fields)) return null;
  return { stepId: d.stepId.slice(0, 80), fingerprint: d.fingerprint.slice(0, 32), inventory: d.inventory };
}

export async function recordCheckpoint(job: { recipeId: string; recipeVersion: number }, data: unknown): Promise<void> {
  const cp = readCheckpoint(data);
  if (!cp) return;
  const sql = await getSql();
  await sql`
    insert into recipe_health (recipe_id, step_id, recipe_version, last_fingerprint, last_inventory, updated_at)
    values (${job.recipeId}, ${cp.stepId}, ${job.recipeVersion}, ${cp.fingerprint}, ${JSON.stringify(cp.inventory)}::jsonb, now())
    on conflict (recipe_id, step_id) do update set
      recipe_version = excluded.recipe_version,
      last_fingerprint = excluded.last_fingerprint,
      last_inventory = excluded.last_inventory,
      updated_at = now()
  `;
}

/** Every page a successful run saw becomes the new known-good shape. */
async function promoteCheckpoints(job: JobRow): Promise<void> {
  const sql = await getSql();
  const rows = await sql<{ data: unknown }>`select data from job_events where job_id = ${job.id} and kind = 'checkpoint'`;
  for (const row of rows) {
    const cp = readCheckpoint(json(row.data, null));
    if (!cp) continue;
    await sql`
      insert into recipe_health (recipe_id, step_id, recipe_version, good_fingerprint, good_inventory, last_fingerprint, last_inventory, last_ok_at, fail_count, updated_at)
      values (${job.recipeId}, ${cp.stepId}, ${job.recipeVersion}, ${cp.fingerprint}, ${JSON.stringify(cp.inventory)}::jsonb,
              ${cp.fingerprint}, ${JSON.stringify(cp.inventory)}::jsonb, now(), 0, now())
      on conflict (recipe_id, step_id) do update set
        recipe_version = excluded.recipe_version,
        good_fingerprint = excluded.good_fingerprint,
        good_inventory = excluded.good_inventory,
        last_ok_at = now(),
        fail_count = 0,
        updated_at = now()
    `;
  }
}

export type HealthRow = {
  recipeId: string;
  stepId: string;
  recipeVersion: number;
  goodFingerprint: string;
  goodInventory: Inventory | null;
  lastFingerprint: string;
  lastInventory: Inventory | null;
  failCount: number;
  lastDispatchAt: string | null;
};

export async function healthFor(recipeId: string, stepId: string): Promise<HealthRow | null> {
  const sql = await getSql();
  const rows = await sql<Record<string, unknown>>`select * from recipe_health where recipe_id = ${recipeId} and step_id = ${stepId} limit 1`;
  const r = rows[0];
  if (!r) return null;
  return {
    recipeId,
    stepId,
    recipeVersion: Number(r.recipe_version),
    goodFingerprint: String(r.good_fingerprint ?? ""),
    goodInventory: json<Inventory | null>(r.good_inventory, null),
    lastFingerprint: String(r.last_fingerprint ?? ""),
    lastInventory: json<Inventory | null>(r.last_inventory, null),
    failCount: Number(r.fail_count ?? 0),
    lastDispatchAt: isoOrNull(r.last_dispatch_at),
  };
}

export function driftLines(h: HealthRow | null): string[] {
  if (!h?.goodInventory || !h.lastInventory) return [];
  const d = diffInventory(h.goodInventory, h.lastInventory);
  return diffIsEmpty(d) ? [] : describeDiff(d);
}

export { jobById };
