import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { nextAction, stepViews, type NextAction } from "./flows";
import { createCaseSchema, readApplicant, readDetails, stepPatchSchema, updateCaseSchema, type CreateCaseInput } from "./schema";
import { SCHEME_GUIDES } from "./schemes";
import { todayIst } from "./timers";
import type { CaseBundle, CaseRecord, CaseStep, Flow, Scheme, StateCode, StepKind } from "./types";

export type CaseSummary = {
  id: string;
  title: string;
  flow: Flow;
  state: StateCode;
  scheme: Scheme | null;
  status: "open" | "closed";
  applicantName: string;
  district: string;
  next: NextAction;
  updatedAt: string;
  createdAt: string;
};

export type Dashboard = {
  today: string;
  counts: { open: number; overdue: number; dueSoon: number; waiting: number; closed: number };
  /** Something to do now: draft, file, record an outcome, close. Overdue first. */
  act: CaseSummary[];
  /** Filed and inside the reply / decision period. */
  waiting: CaseSummary[];
  recent: CaseSummary[];
};

function summarize(record: CaseRecord, steps: CaseStep[], today: string): CaseSummary {
  const views = stepViews(record, steps, today);
  return {
    id: record.id,
    title: record.title,
    flow: record.flow,
    state: record.state,
    scheme: record.scheme,
    status: record.status,
    applicantName: record.applicant.name,
    district: record.applicant.district,
    next: nextAction(record, views, today),
    updatedAt: record.updatedAt,
    createdAt: record.createdAt,
  };
}

function byDate(a: CaseSummary, b: CaseSummary): number {
  const x = a.next.on ?? "9999-12-31";
  const y = b.next.on ?? "9999-12-31";
  if (x !== y) return x < y ? -1 : 1;
  return a.updatedAt < b.updatedAt ? 1 : -1;
}

export function buildDashboard(rows: Array<{ record: CaseRecord; steps: CaseStep[] }>, today: string): Dashboard {
  const all = rows.map((r) => summarize(r.record, r.steps, today));
  const open = all.filter((c) => c.status === "open");
  const soon = (on: string | null) => Boolean(on && on >= today && on <= addDaysIso(today, 7));
  const act = open.filter((c) => !["wait", "track", "done"].includes(c.next.code));
  const waiting = open.filter((c) => c.next.code === "wait" || c.next.code === "track");
  act.sort((a, b) => Number(b.next.overdue) - Number(a.next.overdue) || byDate(a, b));
  waiting.sort(byDate);
  return {
    today,
    counts: {
      open: open.length,
      overdue: act.filter((c) => c.next.overdue).length,
      dueSoon: open.filter((c) => soon(c.next.on)).length,
      waiting: waiting.length,
      closed: all.length - open.length,
    },
    act: act.slice(0, 50),
    waiting: waiting.slice(0, 50),
    recent: [...all].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)).slice(0, 8),
  };
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Dashboard> => {
    const { loadCases } = await import("./rows.server");
    const rows = await loadCases(context.userId, { status: "all", limit: 500 });
    return buildDashboard(rows, todayIst());
  });

export const listCases = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { status?: "open" | "closed" | "all" } | undefined) => ({
    status: input?.status === "open" || input?.status === "closed" ? input.status : ("all" as const),
  }))
  .handler(async ({ context, data }): Promise<CaseSummary[]> => {
    const { loadCases } = await import("./rows.server");
    const today = todayIst();
    const rows = await loadCases(context.userId, { status: data.status, limit: 1000 });
    return rows.map((r) => summarize(r.record, r.steps, today));
  });

export const getCase = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => ({ id: String(input?.id ?? "").slice(0, 64) }))
  .handler(async ({ context, data }): Promise<CaseBundle> => {
    const { loadBundle } = await import("./rows.server");
    return loadBundle(context.userId, data.id);
  });

function autoTitle(input: z.output<typeof createCaseSchema>): string {
  const name = input.applicant.name.trim() || "Citizen";
  if (input.flow === "money") {
    const scheme = input.scheme ? SCHEME_GUIDES[input.scheme].name : "Government payment";
    return `${name} · ${scheme}`;
  }
  if (input.flow === "rti") {
    const who = input.details.authority.trim();
    return `${name} · RTI${who ? ` · ${who}` : ""}`;
  }
  const opp = input.details.opponent.trim();
  return `${name}${opp ? ` v. ${opp}` : " · consumer complaint"}`;
}

export const createCase = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: CreateCaseInput) => createCaseSchema.parse(input))
  .handler(async ({ context, data }): Promise<{ id: string }> => {
    const { addEvent, newCaseId, touchCase } = await import("./rows.server");
    const sql = await getSql();
    const id = newCaseId("case");
    const scheme = data.flow === "money" ? (data.scheme ?? "pmkisan") : null;
    const title = data.title.trim() || autoTitle({ ...data, scheme });
    await sql`
      insert into cases (id, user_id, flow, state, lang, title, scheme, applicant, details, auto_appeal)
      values (
        ${id}, ${context.userId}, ${data.flow}, ${data.state}, ${data.lang}, ${title}, ${scheme},
        ${JSON.stringify(data.applicant)}::jsonb, ${JSON.stringify(data.details)}::jsonb, ${data.autoAppeal}
      )
    `;
    await addEvent(context.userId, id, "created", "Case opened");
    await touchCase(context.userId, id);
    return { id };
  });

export const updateCase = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: z.input<typeof updateCaseSchema>) => updateCaseSchema.parse(input))
  .handler(async ({ context, data }): Promise<CaseBundle> => {
    const { loadBundle, touchCase } = await import("./rows.server");
    const current = await loadBundle(context.userId, data.id);
    const record = current.record;
    const applicant = data.applicant !== undefined ? readApplicant({ ...record.applicant, ...(data.applicant as object) }) : record.applicant;
    const details = data.details !== undefined ? readDetails({ ...record.details, ...(data.details as object) }) : record.details;
    const sql = await getSql();
    await sql`
      update cases set
        title = ${data.title?.trim() || record.title},
        lang = ${data.lang ?? record.lang},
        auto_appeal = ${data.autoAppeal ?? record.autoAppeal},
        applicant = ${JSON.stringify(applicant)}::jsonb,
        details = ${JSON.stringify(details)}::jsonb,
        updated_at = now()
      where id = ${record.id} and user_id = ${context.userId}
    `;
    await touchCase(context.userId, record.id);
    return loadBundle(context.userId, record.id);
  });

export const setCaseStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; status: "open" | "closed"; outcome?: string }) => ({
    id: String(input?.id ?? "").slice(0, 64),
    status: input?.status === "closed" ? ("closed" as const) : ("open" as const),
    outcome: String(input?.outcome ?? "").slice(0, 300),
  }))
  .handler(async ({ context, data }): Promise<CaseBundle> => {
    const { addEvent, loadBundle, touchCase } = await import("./rows.server");
    await loadBundle(context.userId, data.id);
    const sql = await getSql();
    await sql`
      update cases set status = ${data.status}, outcome = ${data.outcome}, updated_at = now()
      where id = ${data.id} and user_id = ${context.userId}
    `;
    await addEvent(
      context.userId,
      data.id,
      data.status,
      data.status === "closed" ? `Case closed${data.outcome ? `: ${data.outcome}` : ""}` : "Case reopened",
    );
    await touchCase(context.userId, data.id);
    return loadBundle(context.userId, data.id);
  });

export const deleteCase = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => ({ id: String(input?.id ?? "").slice(0, 64) }))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const sql = await getSql();
    await sql`delete from cases where id = ${data.id} and user_id = ${context.userId}`;
    return { ok: true };
  });

const EVENT_TEXT: Partial<Record<StepKind, string>> = {
  status_check: "Status check",
  grievance: "Grievance",
  rti_application: "RTI application",
  first_appeal: "First appeal",
  second_appeal: "Second appeal",
  nch: "NCH complaint",
  legal_notice: "Legal notice",
  consumer_complaint: "Consumer complaint",
};

export const saveStep = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: z.input<typeof stepPatchSchema>) => stepPatchSchema.parse(input))
  .handler(async ({ context, data }): Promise<CaseBundle> => {
    const { addEvent, ensureStep, loadBundle, patchStep, touchCase } = await import("./rows.server");
    const bundle = await loadBundle(context.userId, data.caseId);
    const step = await ensureStep(context.userId, bundle.record, data.kind);
    const next = await patchStep(context.userId, step, data.patch);
    const label = EVENT_TEXT[data.kind] ?? data.kind;
    const p = data.patch;
    if (p.filedOn && p.filedOn !== step.filedOn) {
      await addEvent(context.userId, data.caseId, "filed", `${label} filed on ${p.filedOn}${next.reference ? ` · ${next.reference}` : ""}`);
    }
    if (p.outcome !== undefined && p.outcome !== step.outcome && p.outcome) {
      await addEvent(context.userId, data.caseId, "outcome", `${label}: ${p.outcome.replace(/_/g, " ")}`);
    }
    if (p.replyOn && p.replyOn !== step.replyOn) {
      await addEvent(context.userId, data.caseId, "reply", `${label}: reply received on ${p.replyOn}`);
    }
    if (p.status === "skipped" && step.status !== "skipped") {
      await addEvent(context.userId, data.caseId, "skipped", `${label} skipped`);
    }
    await touchCase(context.userId, data.caseId);
    return loadBundle(context.userId, data.caseId);
  });
