import { findingFor } from "./schemes.ts";
import {
  consumerLimitation,
  faaDecisionDue,
  firstAppealLastDay,
  grievanceFollowUp,
  nchFollowUp,
  noticeComplyBy,
  rtiReplyDue,
  secondAppealLastDay,
} from "./timers.ts";
import type { CaseRecord, CaseStep, Flow, StepKind } from "./types.ts";

export const FLOW_STEPS: Record<Flow, readonly StepKind[]> = {
  money: ["status_check", "grievance", "rti_application", "first_appeal", "second_appeal"],
  rti: ["rti_application", "first_appeal", "second_appeal"],
  consumer: ["nch", "legal_notice", "consumer_complaint"],
};

/** Outcomes that end the case well, and those that send it to the next step. */
export const GOOD_OUTCOMES = ["full", "resolved"] as const;
export const BAD_OUTCOMES = ["partial", "refused", "no_reply", "unresolved", "transferred"] as const;

export const OUTCOMES_BY_KIND: Record<StepKind, readonly string[]> = {
  status_check: [],
  grievance: ["resolved", "unresolved"],
  rti_application: ["full", "partial", "refused", "no_reply", "transferred"],
  first_appeal: ["full", "partial", "refused", "no_reply"],
  second_appeal: ["full", "partial", "refused"],
  nch: ["resolved", "unresolved"],
  legal_notice: ["resolved", "unresolved"],
  consumer_complaint: ["resolved", "unresolved"],
};

/**
 * Where a step stands.
 * upcoming: an earlier step still has a chance of solving it.
 * ready: draft (or do) it now. drafted: a draft exists, not yet filed.
 * waiting: filed, inside the reply / decision period. lapsed: that period ran out with no outcome.
 * resolved: the case can close. escalate: unhelpful outcome, the next step opens.
 * fix: the citizen must fix something first (eKYC, bank seeding). skipped: the operator skipped it.
 */
export type StepPhase =
  | "upcoming"
  | "ready"
  | "drafted"
  | "waiting"
  | "lapsed"
  | "resolved"
  | "escalate"
  | "fix"
  | "skipped";

export type StepView = {
  kind: StepKind;
  phase: StepPhase;
  step: CaseStep | null;
  /** End of the reply / decision / notice period once filed. */
  dueOn: string | null;
  /** Last day to file this step (appeal window, limitation), once it opens. */
  lastDay: string | null;
};

export type NextActionCode = "check_status" | "fix" | "draft" | "file" | "wait" | "record_outcome" | "track" | "close" | "done";

export type NextAction = {
  code: NextActionCode;
  kind: StepKind | null;
  /** The date that matters for this action (reply due, last day to file). */
  on: string | null;
  overdue: boolean;
  /** True when this is a first appeal the desk may draft on its own (auto-appeal). */
  autoAppeal: boolean;
};

function dueFor(kind: StepKind, step: CaseStep, record: CaseRecord): string | null {
  const filed = step.filedOn ?? "";
  if (!filed) return null;
  switch (kind) {
    case "grievance":
      return grievanceFollowUp(filed) || null;
    case "rti_application":
      return rtiReplyDue(filed, { viaApio: step.viaApio, lifeLiberty: record.details.lifeLiberty }) || null;
    case "first_appeal":
      return faaDecisionDue(filed) || null;
    case "nch":
      return nchFollowUp(filed) || null;
    case "legal_notice":
      return noticeComplyBy(filed, step.deliveredOn) || null;
    default:
      return null;
  }
}

function lastDayFor(kind: StepKind, prev: StepView | null, record: CaseRecord): string | null {
  if (kind === "first_appeal" && prev?.kind === "rti_application" && prev.dueOn) {
    return firstAppealLastDay(prev.dueOn, prev.step?.replyOn) || null;
  }
  if (kind === "second_appeal" && prev?.kind === "first_appeal" && prev.dueOn) {
    return secondAppealLastDay(prev.dueOn, prev.step?.replyOn) || null;
  }
  if (kind === "consumer_complaint") return consumerLimitation(record.details.causeOn) || null;
  return null;
}

function opensNext(phase: StepPhase): boolean {
  return phase === "escalate" || phase === "lapsed" || phase === "skipped";
}

/** Every step of the case's flow with its phase, in order. Pure; `today` is YYYY-MM-DD. */
export function stepViews(record: CaseRecord, steps: CaseStep[], today: string): StepView[] {
  const byKind = new Map(steps.map((s) => [s.kind, s]));
  const views: StepView[] = [];
  let prev: StepView | null = null;

  for (const kind of FLOW_STEPS[record.flow]) {
    const step = byKind.get(kind) ?? null;
    const unlocked = prev === null || opensNext(prev.phase);
    const lastDay = unlocked ? lastDayFor(kind, prev, record) : null;
    let phase: StepPhase;
    let dueOn: string | null = null;

    if (step?.status === "skipped") {
      phase = "skipped";
    } else if (kind === "status_check") {
      if (step?.status === "done" && step.outcome) {
        const finding = record.scheme ? findingFor(record.scheme, step.outcome) : null;
        if (step.outcome === "paid") phase = "resolved";
        else if (finding && !finding.escalate) phase = "fix";
        else phase = "escalate";
      } else {
        phase = "ready";
      }
    } else if (step?.filedOn) {
      dueOn = dueFor(kind, step, record);
      const outcome = step.outcome;
      if ((GOOD_OUTCOMES as readonly string[]).includes(outcome)) phase = "resolved";
      else if ((BAD_OUTCOMES as readonly string[]).includes(outcome)) phase = "escalate";
      else if (dueOn && today > dueOn) phase = "lapsed";
      else phase = "waiting";
    } else if (step?.doc || step?.docText) {
      phase = "drafted";
    } else {
      phase = unlocked ? "ready" : "upcoming";
    }

    const view: StepView = { kind, phase, step, dueOn, lastDay };
    views.push(view);
    prev = view;
  }
  return views;
}

/** The one thing the operator should do next on this case. */
export function nextAction(record: CaseRecord, views: StepView[], today: string): NextAction {
  const none: NextAction = { code: "done", kind: null, on: null, overdue: false, autoAppeal: false };
  if (record.status === "closed") return none;

  for (let i = 0; i < views.length; i += 1) {
    const v = views[i];
    const isLast = i === views.length - 1;
    switch (v.phase) {
      case "ready": {
        if (v.kind === "status_check") return { ...none, code: "check_status", kind: v.kind };
        const prev = views[i - 1];
        const auto =
          v.kind === "first_appeal" &&
          record.autoAppeal &&
          prev?.kind === "rti_application" &&
          (prev.phase === "lapsed" || prev.phase === "escalate");
        return {
          code: "draft",
          kind: v.kind,
          on: v.lastDay,
          overdue: Boolean(v.lastDay && today > v.lastDay),
          autoAppeal: auto,
        };
      }
      case "drafted":
        return { ...none, code: "file", kind: v.kind, on: v.lastDay, overdue: Boolean(v.lastDay && today > v.lastDay) };
      case "waiting":
        if (!v.dueOn) return { ...none, code: "track", kind: v.kind };
        return { ...none, code: "wait", kind: v.kind, on: v.dueOn };
      case "fix":
        return { ...none, code: "fix", kind: v.kind };
      case "resolved":
        return { ...none, code: "close", kind: v.kind };
      case "lapsed":
        if (isLast) return { ...none, code: "record_outcome", kind: v.kind, on: v.dueOn, overdue: true };
        break;
      case "escalate":
        if (isLast) return { ...none, code: "done", kind: v.kind };
        break;
      case "skipped":
        break;
      case "upcoming":
        return { ...none, code: "draft", kind: v.kind };
    }
  }
  return none;
}

/** Date used to sort the dashboard: what is due soonest comes first. */
export function sortDate(action: NextAction): string | null {
  return action.on;
}
