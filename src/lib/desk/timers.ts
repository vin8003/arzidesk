/**
 * Statutory clocks, as plain YYYY-MM-DD arithmetic in Indian time.
 *
 * RTI Act, 2005: s.7(1) 30 days to reply (48 hours for life or liberty); s.5(2)
 * adds 5 days when the application went to an Assistant PIO; s.7(2) no reply in
 * time is a deemed refusal; s.19(1) first appeal within 30 days of the deadline
 * or the reply; s.19(6) the appellate authority decides in 30 days (45 at most);
 * s.19(3) second appeal within 90 days.
 *
 * Consumer Protection Act, 2019: s.69 two years from the cause of action.
 * Grievance and NCH follow-ups (30 days) and the legal-notice period (15 days)
 * are working conventions, not statute.
 */

export const RTI_REPLY_DAYS = 30;
export const RTI_APIO_EXTRA_DAYS = 5;
export const RTI_LIFE_LIBERTY_DAYS = 2;
export const FIRST_APPEAL_WINDOW_DAYS = 30;
export const FAA_DECISION_DAYS = 30;
export const FAA_DECISION_MAX_DAYS = 45;
export const SECOND_APPEAL_WINDOW_DAYS = 90;
export const GRIEVANCE_FOLLOW_UP_DAYS = 30;
export const NCH_FOLLOW_UP_DAYS = 30;
export const NOTICE_COMPLY_DAYS = 15;
/** Speed Post transit assumed when the delivery date is unknown. */
export const POST_TRANSIT_DAYS = 5;
export const CONSUMER_LIMITATION_YEARS = 2;

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})/;

function parse(iso: string): Date | null {
  const m = DAY_RE.exec(String(iso ?? ""));
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function isDay(value: unknown): value is string {
  return typeof value === "string" && parse(value) !== null;
}

export function addDays(iso: string, days: number): string {
  const d = parse(iso);
  if (!d) return "";
  d.setUTCDate(d.getUTCDate() + days);
  return fmt(d);
}

export function addYears(iso: string, years: number): string {
  const d = parse(iso);
  if (!d) return "";
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return fmt(d);
}

/** Whole days from `from` to `to`; positive when `to` is later. */
export function daysBetween(from: string, to: string): number {
  const a = parse(from);
  const b = parse(to);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** Today's date in India. */
export function todayIst(now: Date = new Date()): string {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

/** Last day for the PIO to reply. */
export function rtiReplyDue(filedOn: string, opts: { viaApio?: boolean; lifeLiberty?: boolean } = {}): string {
  if (!isDay(filedOn)) return "";
  if (opts.lifeLiberty) return addDays(filedOn, RTI_LIFE_LIBERTY_DAYS);
  return addDays(filedOn, RTI_REPLY_DAYS + (opts.viaApio ? RTI_APIO_EXTRA_DAYS : 0));
}

/** Last day to file the first appeal: 30 days from the reply, or from the reply deadline if none came. */
export function firstAppealLastDay(replyDue: string, replyOn?: string | null): string {
  const from = replyOn && isDay(replyOn) ? replyOn : replyDue;
  return isDay(from) ? addDays(from, FIRST_APPEAL_WINDOW_DAYS) : "";
}

export function faaDecisionDue(appealFiledOn: string): string {
  return isDay(appealFiledOn) ? addDays(appealFiledOn, FAA_DECISION_DAYS) : "";
}

export function faaDecisionOuterDay(appealFiledOn: string): string {
  return isDay(appealFiledOn) ? addDays(appealFiledOn, FAA_DECISION_MAX_DAYS) : "";
}

/** Last day for the second appeal: 90 days from the FAA's order, or from when it was due. */
export function secondAppealLastDay(faaDue: string, decisionOn?: string | null): string {
  const from = decisionOn && isDay(decisionOn) ? decisionOn : faaDue;
  return isDay(from) ? addDays(from, SECOND_APPEAL_WINDOW_DAYS) : "";
}

export function grievanceFollowUp(filedOn: string): string {
  return isDay(filedOn) ? addDays(filedOn, GRIEVANCE_FOLLOW_UP_DAYS) : "";
}

export function nchFollowUp(filedOn: string): string {
  return isDay(filedOn) ? addDays(filedOn, NCH_FOLLOW_UP_DAYS) : "";
}

/** Day the notice period ends: 15 days from delivery (or sending + transit). */
export function noticeComplyBy(sentOn: string, deliveredOn?: string | null): string {
  const received = deliveredOn && isDay(deliveredOn) ? deliveredOn : isDay(sentOn) ? addDays(sentOn, POST_TRANSIT_DAYS) : "";
  return received ? addDays(received, NOTICE_COMPLY_DAYS) : "";
}

/** Last day to file a consumer complaint (s.69 CPA 2019). Delay can be condoned for sufficient cause. */
export function consumerLimitation(causeOn: string): string {
  return isDay(causeOn) ? addYears(causeOn, CONSUMER_LIMITATION_YEARS) : "";
}
