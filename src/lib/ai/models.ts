/**
 * Grok model IDs per action. Same xAI endpoints and auth everywhere; only the model varies.
 * Override per deploy with XAI_MODEL_RESEARCH / XAI_MODEL_FAST (same env names as CiteBench).
 */
export const DEFAULT_FAST_MODEL = "grok-4.20-0309-non-reasoning";
export const DEFAULT_RESEARCH_MODEL = "grok-4.20-0309-reasoning";

type Env = NodeJS.Dict<string | undefined>;

function pick(value: string | undefined, fallback: string): string {
  const trimmed = (value ?? "").trim();
  return trimmed || fallback;
}

/** Long, structured drafts: the consumer commission complaint file. */
export function researchModel(env: Env = process.env): string {
  return pick(env.XAI_MODEL_RESEARCH, DEFAULT_RESEARCH_MODEL);
}

/** Grievances, RTI applications, appeals, NCH text, legal notices. */
export function fastModel(env: Env = process.env): string {
  return pick(env.XAI_MODEL_FAST, DEFAULT_FAST_MODEL);
}

export function isReasoningModel(model: string): boolean {
  return /reasoning/i.test(model) && !/non-reasoning/i.test(model);
}
