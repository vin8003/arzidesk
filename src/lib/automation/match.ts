import { normLabel } from "./fingerprint.ts";
import type { FieldInfo } from "./types.ts";

/**
 * Matching payload values to what a portal offers, without a model first.
 * Used by the companion for dropdowns ("Ministry of Agriculture & Farmers
 * Welfare" vs "Agriculture and Farmers Welfare, Department of"), and by the
 * server to check what the model proposes.
 */

const STOP = new Set(["of", "and", "the", "for", "&", "department", "ministry", "dept", "govt", "government", "india", "office", "in"]);

export function tokens(text: string): string[] {
  return normLabel(text)
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !STOP.has(t));
}

/** Overlap of meaningful words, 0..1, weighted toward covering what was asked for. */
export function similarity(wanted: string, option: string): number {
  const a = tokens(wanted);
  const b = new Set(tokens(option));
  if (!a.length || !b.size) return normLabel(wanted) === normLabel(option) ? 1 : 0;
  let hit = 0;
  for (const t of a) if (b.has(t) || [...b].some((x) => x.length > 4 && (x.startsWith(t) || t.startsWith(x)))) hit += 1;
  const recall = hit / a.length;
  const precision = hit / b.size;
  return recall * 0.7 + precision * 0.3;
}

export type OptionPick = { option: string; score: number; runnerUp: number } | null;

/** Best option, or null when nothing is close or two options are too close to call. */
export function pickOption(wanted: string, options: string[], opts: { min?: number; margin?: number } = {}): OptionPick {
  const min = opts.min ?? 0.6;
  const margin = opts.margin ?? 0.15;
  const exact = options.find((o) => normLabel(o) === normLabel(wanted));
  if (exact) return { option: exact, score: 1, runnerUp: 0 };
  // The same office listed twice (a dropdown filled twice) is one candidate, not a tie.
  const unique = [...new Map(options.map((o) => [normLabel(o), o])).values()];
  const scored = unique
    .filter((o) => normLabel(o) && !/^(-+\s*)?(select|choose|--)/i.test(o.trim()))
    .map((o) => ({ option: o, score: similarity(wanted, o) }))
    .sort((x, y) => y.score - x.score);
  const best = scored[0];
  if (!best || best.score < min) return null;
  const runnerUp = scored[1]?.score ?? 0;
  // A tie is never a match, however good: two offices that read the same go to the fallback.
  if (best.score - runnerUp < margin) return null;
  return { option: best.option, score: best.score, runnerUp };
}

/** Field whose label best matches one of the patterns. */
export function findByLabel(fields: FieldInfo[], patterns: RegExp[]): FieldInfo | null {
  for (const re of patterns) {
    const hit = fields.find((f) => re.test(f.label));
    if (hit) return hit;
  }
  return null;
}

// --- model fallback ---------------------------------------------------------

export type MapperRequest = {
  recipeId: string;
  /** Payload keys the recipe could not place, with a plain description each. Never values. */
  keys: Array<{ key: string; description: string }>;
  fields: FieldInfo[];
};

export type Mapping = Record<string, { field: string | null; confidence: number }>;

export const MAPPER_SYSTEM = [
  "You map the fields of a government web form to data keys.",
  "You get the form's controls (label, tag, type, name, id, options) and a list of keys with descriptions.",
  "For each key, return the `key` (name, else id) of the one control that should receive it, or null if none fits.",
  "Never invent controls. Prefer exact label meaning over position. Confidence is 0 to 1.",
  "Return JSON only.",
].join(" ");

export function mapperUser(req: MapperRequest): string {
  const fields = req.fields
    .filter((f) => f.type !== "hidden")
    .slice(0, 120)
    .map((f) => ({ key: f.key, label: f.label.slice(0, 120), tag: f.tag, type: f.type, options: f.options?.slice(0, 30) }));
  return JSON.stringify({ recipe: req.recipeId, keys: req.keys, controls: fields });
}

export const MAPPER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["mapping"],
  properties: {
    mapping: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "field", "confidence"],
        properties: {
          key: { type: "string" },
          field: { type: ["string", "null"] },
          confidence: { type: "number" },
        },
      },
    },
  },
} as const;

/**
 * Dropdown fallback. Only for public, non-personal values (ministry and
 * public authority names): the wanted text goes to the model.
 */
export type OptionRequest = { recipeId: string; wanted: string; options: string[] };

export const OPTION_SYSTEM = [
  "You pick the dropdown option on a government web form that names the same office as the wanted text.",
  "Answer with one option exactly as written, or null if none is the same office. Confidence is 0 to 1. JSON only.",
].join(" ");

export function optionUser(req: OptionRequest): string {
  return JSON.stringify({ wanted: req.wanted.slice(0, 300), options: req.options.slice(0, 400).map((o) => o.slice(0, 200)) });
}

export const OPTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["option", "confidence"],
  properties: {
    option: { type: ["string", "null"] },
    confidence: { type: "number" },
  },
} as const;

export function readOptionPick(raw: unknown, req: OptionRequest): { option: string | null; confidence: number } {
  const option = (raw as { option?: unknown })?.option;
  const confidence = Number((raw as { confidence?: unknown })?.confidence ?? 0);
  const real = typeof option === "string" && req.options.includes(option) ? option : null;
  return { option: real, confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0 };
}

/** Keep only answers that name a real control and a key that was asked for. */
export function readMapping(raw: unknown, req: MapperRequest): Mapping {
  const out: Mapping = {};
  const asked = new Set(req.keys.map((k) => k.key));
  const real = new Set(req.fields.map((f) => f.key));
  const list = (raw as { mapping?: unknown })?.mapping;
  if (!Array.isArray(list)) return out;
  for (const item of list) {
    const key = String((item as { key?: unknown })?.key ?? "");
    const field = (item as { field?: unknown })?.field;
    const confidence = Number((item as { confidence?: unknown })?.confidence ?? 0);
    if (!asked.has(key)) continue;
    const f = typeof field === "string" && real.has(field) ? field : null;
    out[key] = { field: f, confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0 };
  }
  return out;
}
