import { getSql } from "@/lib/db";
import { recipeMeta } from "./recipes";
import { driftLines, healthFor, jobById, type HealthRow } from "./rows.server";

/**
 * The self-healing hook. A drift failure (or canary drift) fires one GitHub
 * `repository_dispatch` per recipe step at most every six hours; the
 * recipe-repair workflow then pulls the redacted bundle below, rewrites the
 * recipe and opens a PR. Nothing here carries citizen data: only field
 * inventories, the DOM the companion already redacted, and the error.
 */

const DISPATCH_EVERY_MS = 6 * 60 * 60 * 1000;

export async function noteDrift(
  job: { id: string; recipeId: string; recipeVersion: number },
  stepId: string,
  opts: { force?: boolean } = {},
): Promise<void> {
  const sql = await getSql();
  await sql`
    insert into recipe_health (recipe_id, step_id, recipe_version, last_fail_at, fail_count, updated_at)
    values (${job.recipeId}, ${stepId}, ${job.recipeVersion}, now(), 1, now())
    on conflict (recipe_id, step_id) do update set last_fail_at = now(), fail_count = recipe_health.fail_count + 1, updated_at = now()
  `;
  const health = await healthFor(job.recipeId, stepId);
  // A changed page is proof; an unchanged one gets a second chance before anyone is woken up.
  const changed = Boolean(health && health.goodFingerprint && health.lastFingerprint && health.goodFingerprint !== health.lastFingerprint);
  if (!opts.force && !changed && (health?.failCount ?? 0) < 2) return;
  await dispatch({ jobId: job.id, recipeId: job.recipeId, recipeVersion: job.recipeVersion, stepId, source: "job" }, health);
}

export async function noteCanaryDrift(recipeId: string, recipeVersion: number, stepId: string): Promise<void> {
  await dispatch({ jobId: null, recipeId, recipeVersion, stepId, source: "canary" }, await healthFor(recipeId, stepId));
}

type DispatchPayload = { jobId: string | null; recipeId: string; recipeVersion: number; stepId: string; source: "job" | "canary" };

export function repairConfigured(): boolean {
  return Boolean(process.env.GITHUB_REPAIR_TOKEN?.trim() && process.env.GITHUB_REPAIR_REPO?.trim());
}

async function dispatch(payload: DispatchPayload, health: HealthRow | null): Promise<void> {
  if (!repairConfigured()) {
    console.warn(`[repair] drift on ${payload.recipeId}#${payload.stepId}; GITHUB_REPAIR_TOKEN / GITHUB_REPAIR_REPO not set, no dispatch`);
    return;
  }
  if (health?.lastDispatchAt && Date.now() - Date.parse(health.lastDispatchAt) < DISPATCH_EVERY_MS) return;
  const meta = recipeMeta(payload.recipeId);
  const sql = await getSql();
  // Claim the dispatch slot first so two failing kiosks do not both fire.
  const claimed = await sql`
    update recipe_health set last_dispatch_at = now()
    where recipe_id = ${payload.recipeId} and step_id = ${payload.stepId}
      and (last_dispatch_at is null or last_dispatch_at < ${new Date(Date.now() - DISPATCH_EVERY_MS).toISOString()})
    returning recipe_id
  `;
  if (!claimed.length) return;
  const repo = process.env.GITHUB_REPAIR_REPO!.trim();
  const res = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${process.env.GITHUB_REPAIR_TOKEN!.trim()}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      event_type: "recipe-broken",
      client_payload: { ...payload, kind: meta?.kind ?? "submit", file: meta?.file ?? "" },
    }),
  }).catch((err: unknown) => err as Error);
  if (res instanceof Error || !res.ok) {
    console.error("[repair] dispatch failed", res instanceof Error ? res.message : `${res.status} ${await res.text().catch(() => "")}`);
    await sql`update recipe_health set last_dispatch_at = null where recipe_id = ${payload.recipeId} and step_id = ${payload.stepId}`;
  }
}

export type RepairBundle = {
  recipe: { id: string; version: number; kind: string; file: string };
  stepId: string;
  error: string;
  failure: string | null;
  /** + / - / ~ lines between the last good inventory and what the failing run saw. */
  drift: string[];
  goodInventory: unknown;
  lastInventory: unknown;
  /** Redacted on the kiosk: no input values, no payload strings. */
  dom: Array<{ name: string; body: string }>;
  events: Array<{ kind: string; text: string }>;
};

export async function repairBundle(opts: { jobId?: string | null; recipeId: string; stepId: string }): Promise<RepairBundle | null> {
  const meta = recipeMeta(opts.recipeId);
  if (!meta) return null;
  const health = await healthFor(opts.recipeId, opts.stepId);
  const bundle: RepairBundle = {
    recipe: { id: meta.id, version: meta.version, kind: meta.kind, file: meta.file },
    stepId: opts.stepId,
    error: "",
    failure: null,
    drift: driftLines(health),
    goodInventory: health?.goodInventory ?? null,
    lastInventory: health?.lastInventory ?? null,
    dom: [],
    events: [],
  };
  if (opts.jobId) {
    const job = await jobById(opts.jobId);
    if (!job || job.recipeId !== opts.recipeId) return null;
    bundle.error = job.error;
    bundle.failure = job.failure;
    const sql = await getSql();
    const [dom, events] = await Promise.all([
      sql<{ name: string; body: string }>`
        select name, body from job_artifacts where job_id = ${job.id} and shareable = true and kind = 'dom' order by created_at desc limit 3
      `,
      sql<{ kind: string; text: string }>`
        select kind, text from job_events where job_id = ${job.id} and kind in ('log', 'warning', 'error') order by created_at limit 80
      `,
    ]);
    bundle.dom = dom.map((d) => ({ name: String(d.name), body: String(d.body).slice(0, 400_000) }));
    // Event text is written by the recipe and the kit; it never includes payload values.
    bundle.events = events.map((e) => ({ kind: String(e.kind), text: String(e.text) }));
  }
  return bundle;
}
