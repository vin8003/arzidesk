import type { OutputLang } from "@/lib/lang";

/*
 * Calendar dates in ArziDesk are plain YYYY-MM-DD strings in Indian time.
 * Formatting pins the time zone so the server render and the browser agree.
 */

const LOCALE: Record<OutputLang, string> = { en: "en-IN", hi: "hi-IN" };

function parse(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
}

export function isoDay(value: string | null | undefined): string {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(value ?? ""));
  return m ? m[1] : "";
}

/** Whole days from `from` to `to` (both YYYY-MM-DD). */
export function daysBetween(from: string, to: string): number {
  const a = parse(from);
  const b = parse(to);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** "13 Oct" or, outside this year, "13 Oct 2025". */
export function formatDay(iso: string | null | undefined, lang: OutputLang, today?: string): string {
  const d = parse(String(iso ?? ""));
  if (!d) return "";
  const sameYear = today ? today.slice(0, 4) === String(iso).slice(0, 4) : true;
  return new Intl.DateTimeFormat(LOCALE[lang], {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: "UTC",
  }).format(d);
}

/** "Tue, 14 Oct" */
export function formatWeekday(iso: string, lang: OutputLang): string {
  const d = parse(iso);
  if (!d) return "";
  return new Intl.DateTimeFormat(LOCALE[lang], { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(d);
}

/** "Tuesday, 13 October" */
export function formatLongDay(iso: string, lang: OutputLang): string {
  const d = parse(iso);
  if (!d) return "";
  return new Intl.DateTimeFormat(LOCALE[lang], { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(d);
}

/** Hour of day in India, for greetings. */
export function hourInIndia(now = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(now));
}

export type DueState = { kind: "overdue" | "today" | "tomorrow" | "soon" | "later"; days: number };

export function dueState(iso: string | null | undefined, today: string): DueState | null {
  const day = isoDay(iso);
  if (!day) return null;
  const days = daysBetween(today, day);
  if (days < 0) return { kind: "overdue", days };
  if (days === 0) return { kind: "today", days };
  if (days === 1) return { kind: "tomorrow", days };
  if (days <= 7) return { kind: "soon", days };
  return { kind: "later", days };
}
