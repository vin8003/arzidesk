/**
 * Second pass over a stripped DOM before it leaves the kiosk: every payload
 * string, plus anything shaped like an email, a mobile number, an Aadhaar
 * number or a PAN, becomes [REDACTED]. What is left is the form's structure
 * and the portal's own words, which is all a recipe repair needs.
 */

const PATTERNS: RegExp[] = [
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
  /(?<!\d)(?:\+?91[\s-]?)?[6-9]\d{9}(?!\d)/g,
  /(?<!\d)\d{4}\s?\d{4}\s?\d{4}(?!\d)/g,
  /\b[A-Z]{5}\d{4}[A-Z]\b/g,
];

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Also matches the value with its whitespace collapsed or HTML-escaped, as pages often echo it. */
function variants(value: string): string[] {
  const v = value.trim();
  const collapsed = v.replace(/\s+/g, " ");
  const escaped = collapsed.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return [...new Set([v, collapsed, escaped])].filter((x) => x.length >= 4);
}

export function redactText(text: string, values: string[]): string {
  let out = text;
  const all = values.flatMap(variants).sort((a, b) => b.length - a.length);
  for (const v of all) out = out.replace(new RegExp(escapeRe(v), "gi"), "[REDACTED]");
  for (const re of PATTERNS) out = out.replace(re, "[REDACTED]");
  return out;
}

export const MAX_DOM_CHARS = 400_000;

export function redactDom(html: string, values: string[]): string {
  return redactText(html, values).slice(0, MAX_DOM_CHARS);
}
