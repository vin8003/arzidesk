import { randomUUID } from "node:crypto";
import { getSql } from "@/lib/db";
import { FLOW_STEPS, nextAction, stepViews } from "./flows";
import { readApplicant, readDetails, type StepPatch } from "./schema";
import { todayIst } from "./timers";
import type { CaseBundle, CaseEvent, CaseRecord, CaseStep, DraftDoc, StepKind } from "./types";

/** Server-only row access for cases. Every query is scoped by the verified user id. */

export class NotFoundError extends Error {
  constructor() {
    super("NOT_FOUND");
    this.name = "NotFoundError";
  }
}

export function newCaseId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value ?? "");
}

function day(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(value));
  return m ? m[1] : null;
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

export function mapCase(row: Record<string, unknown>): CaseRecord {
  return {
    id: String(row.id),
    flow: String(row.flow) as CaseRecord["flow"],
    state: String(row.state) as CaseRecord["state"],
    lang: row.lang === "en" ? "en" : "hi",
    title: String(row.title ?? ""),
    scheme: row.scheme ? (String(row.scheme) as CaseRecord["scheme"]) : null,
    status: row.status === "closed" ? "closed" : "open",
    outcome: String(row.outcome ?? ""),
    applicant: readApplicant(json(row.applicant, {})),
    details: readDetails(json(row.details, {})),
    autoAppeal: Boolean(row.auto_appeal),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export function mapStep(row: Record<string, unknown>): CaseStep {
  return {
    id: String(row.id),
    caseId: String(row.case_id),
    kind: String(row.kind) as StepKind,
    status: String(row.status ?? "pending") as CaseStep["status"],
    doc: json<DraftDoc | null>(row.doc, null),
    docText: String(row.doc_text ?? ""),
    generations: Number(row.generations ?? 0),
    filedOn: day(row.filed_on),
    reference: String(row.reference ?? ""),
    mode: String(row.mode ?? ""),
    viaApio: Boolean(row.via_apio),
    deliveredOn: day(row.delivered_on),
    replyOn: day(row.reply_on),
    replyText: String(row.reply_text ?? ""),
    outcome: String(row.outcome ?? ""),
    notes: String(row.notes ?? ""),
    updatedAt: iso(row.updated_at),
  };
}

function mapEvent(row: Record<string, unknown>): CaseEvent {
  return {
    id: String(row.id),
    kind: String(row.kind),
    text: String(row.text ?? ""),
    createdAt: iso(row.created_at),
  };
}

export async function loadBundle(userId: string, caseId: string): Promise<CaseBundle> {
  const sql = await getSql();
  const rows = await sql<Record<string, unknown>>`
    select * from cases where id = ${caseId} and user_id = ${userId} limit 1
  `;
  if (!rows[0]) throw new NotFoundError();
  const [steps, events] = await Promise.all([
    sql<Record<string, unknown>>`select * from case_steps where case_id = ${caseId} and user_id = ${userId}`,
    sql<Record<string, unknown>>`
      select * from case_events where case_id = ${caseId} and user_id = ${userId}
      order by created_at desc limit 100
    `,
  ]);
  return { record: mapCase(rows[0]), steps: steps.map(mapStep), events: events.map(mapEvent) };
}

export async function loadCases(
  userId: string,
  opts: { status?: "open" | "closed" | "all"; limit?: number } = {},
): Promise<Array<{ record: CaseRecord; steps: CaseStep[] }>> {
  const sql = await getSql();
  const status = opts.status ?? "all";
  const limit = Math.max(1, Math.min(1000, opts.limit ?? 500));
  const rows =
    status === "all"
      ? await sql<Record<string, unknown>>`
          select * from cases where user_id = ${userId} order by updated_at desc limit ${limit}
        `
      : await sql<Record<string, unknown>>`
          select * from cases where user_id = ${userId} and status = ${status} order by updated_at desc limit ${limit}
        `;
  if (!rows.length) return [];
  const ids = rows.map((r) => String(r.id));
  const steps = await sql<Record<string, unknown>>`
    select * from case_steps where user_id = ${userId} and case_id = any(${ids}::text[])
  `;
  const byCase = new Map<string, CaseStep[]>();
  for (const s of steps.map(mapStep)) {
    const list = byCase.get(s.caseId) ?? [];
    list.push(s);
    byCase.set(s.caseId, list);
  }
  return rows.map((r) => {
    const record = mapCase(r);
    return { record, steps: byCase.get(record.id) ?? [] };
  });
}

export async function addEvent(userId: string, caseId: string, kind: string, text: string): Promise<void> {
  const sql = await getSql();
  await sql`
    insert into case_events (id, case_id, user_id, kind, text)
    values (${newCaseId("ev")}, ${caseId}, ${userId}, ${kind}, ${text.slice(0, 500)})
  `;
}

/** Find or create the step row for (case, kind). */
export async function ensureStep(userId: string, record: CaseRecord, kind: StepKind): Promise<CaseStep> {
  if (!FLOW_STEPS[record.flow].includes(kind)) throw new Error("This step is not part of this case's flow.");
  const sql = await getSql();
  await sql`
    insert into case_steps (id, case_id, user_id, kind)
    values (${newCaseId("st")}, ${record.id}, ${userId}, ${kind})
    on conflict (case_id, kind) do nothing
  `;
  const rows = await sql<Record<string, unknown>>`
    select * from case_steps where case_id = ${record.id} and kind = ${kind} and user_id = ${userId} limit 1
  `;
  if (!rows[0]) throw new NotFoundError();
  return mapStep(rows[0]);
}

export async function patchStep(userId: string, step: CaseStep, patch: StepPatch): Promise<CaseStep> {
  const next: CaseStep = {
    ...step,
    ...(patch.docText !== undefined ? { docText: patch.docText } : {}),
    ...(patch.filedOn !== undefined ? { filedOn: patch.filedOn } : {}),
    ...(patch.reference !== undefined ? { reference: patch.reference } : {}),
    ...(patch.mode !== undefined ? { mode: patch.mode } : {}),
    ...(patch.viaApio !== undefined ? { viaApio: patch.viaApio } : {}),
    ...(patch.deliveredOn !== undefined ? { deliveredOn: patch.deliveredOn } : {}),
    ...(patch.replyOn !== undefined ? { replyOn: patch.replyOn } : {}),
    ...(patch.replyText !== undefined ? { replyText: patch.replyText } : {}),
    ...(patch.outcome !== undefined ? { outcome: patch.outcome } : {}),
    ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
    ...(patch.status !== undefined ? { status: patch.status } : {}),
  };
  // Filing moves the status forward unless the operator set one explicitly.
  if (patch.status === undefined && patch.filedOn && (next.status === "pending" || next.status === "drafted")) {
    next.status = "filed";
  }
  if (patch.status === undefined && patch.filedOn === null && next.status === "filed") {
    next.status = next.doc || next.docText ? "drafted" : "pending";
  }
  const sql = await getSql();
  await sql`
    update case_steps set
      doc_text = ${next.docText},
      filed_on = ${next.filedOn},
      reference = ${next.reference},
      mode = ${next.mode},
      via_apio = ${next.viaApio},
      delivered_on = ${next.deliveredOn},
      reply_on = ${next.replyOn},
      reply_text = ${next.replyText},
      outcome = ${next.outcome},
      notes = ${next.notes},
      status = ${next.status},
      updated_at = now()
    where id = ${step.id} and user_id = ${userId}
  `;
  return next;
}

export async function saveDraft(
  userId: string,
  step: CaseStep,
  doc: DraftDoc,
  docText: string,
): Promise<CaseStep> {
  const sql = await getSql();
  const status = step.status === "pending" ? "drafted" : step.status;
  await sql`
    update case_steps set
      doc = ${JSON.stringify(doc)}::jsonb,
      doc_text = ${docText},
      generations = generations + 1,
      status = ${status},
      updated_at = now()
    where id = ${step.id} and user_id = ${userId}
  `;
  return { ...step, doc, docText, generations: step.generations + 1, status };
}

/** Recompute and store the dashboard columns after any change. */
export async function touchCase(userId: string, caseId: string): Promise<void> {
  const bundle = await loadBundle(userId, caseId);
  const today = todayIst();
  const action = nextAction(bundle.record, stepViews(bundle.record, bundle.steps, today), today);
  const sql = await getSql();
  await sql`
    update cases set
      next_action = ${action.kind ? `${action.code}:${action.kind}` : action.code},
      next_on = ${action.on},
      updated_at = now()
    where id = ${caseId} and user_id = ${userId}
  `;
}
