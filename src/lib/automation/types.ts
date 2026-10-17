import type { StepKind } from "../desk/types.ts";

/**
 * Shared between the app and the kiosk companion. Erasable TypeScript only
 * (no enums, no namespaces): the companion runs these files with Node's type
 * stripping, unbundled.
 */

export const JOB_STATUSES = [
  "queued",
  "running",
  "waiting_human",
  "submitting",
  "succeeded",
  "failed",
  "needs_reconcile",
  "cancelled",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/** A job in one of these holds the case step: no second job can start. */
export const ACTIVE_STATUSES = ["queued", "running", "waiting_human", "submitting"] as const;

export const GATE_KINDS = ["accept_terms", "login", "captcha", "otp", "payment", "assist"] as const;
export type GateKind = (typeof GATE_KINDS)[number];

/** What the operator must do now. Shown on the case page and in the portal tab overlay. */
export type Gate = {
  kind: GateKind;
  message: string;
  /** assist: the field and value the operator should put in by hand. */
  field?: string;
  value?: string;
  since: string;
};

export type RecipeKind = "read" | "submit";

/**
 * Why a job ended badly. `drift` means the portal no longer looks like the
 * recipe expects and triggers the repair pipeline; the rest do not.
 */
export const FAILURE_CLASSES = [
  "drift",
  "portal_down",
  "portal_rejected",
  "validation",
  "human_timeout",
  "cancelled",
  "after_submit_unknown",
  "internal",
] as const;
export type FailureClass = (typeof FAILURE_CLASSES)[number];

/** What a recipe hands back. Every field is optional; the server decides what to write to the case. */
export type JobResult = {
  summary: string;
  /** rtionline registration number, NCH docket, etc. */
  reference?: string;
  /** YYYY-MM-DD the portal accepted the filing. */
  filedOn?: string;
  /** Status text as the portal shows it. */
  portalStatus?: string;
  replyOn?: string;
  replyText?: string;
  /** status_check finding code from schemes.ts. */
  finding?: string;
  notes?: string;
  receiptArtifactId?: string;
};

/** One form control as the portal shows it. Never carries a value. */
export type FieldInfo = {
  /** name, else id, else a slug of the label. */
  key: string;
  label: string;
  tag: string;
  type: string;
  name: string;
  id: string;
  required: boolean;
  /** select / radio: visible option texts, capped. */
  options?: string[];
};

export type Inventory = {
  url: string;
  title: string;
  fields: FieldInfo[];
};

export type JobEventKind = "log" | "status" | "gate" | "checkpoint" | "warning" | "error" | "artifact";

export type ArtifactKind = "screenshot" | "dom" | "receipt" | "inventory";

/** What the companion gets when it claims a job. */
export type ClaimedJob = {
  id: string;
  recipeId: string;
  recipeVersion: number;
  caseId: string;
  stepKind: StepKind;
  title: string;
  payload: Record<string, unknown>;
  /** Strings the companion must scrub from any DOM it uploads. */
  redact: string[];
};

/** Case page view of a job. */
export type JobView = {
  id: string;
  recipeId: string;
  recipeVersion: number;
  stepKind: StepKind;
  status: JobStatus;
  gate: Gate | null;
  result: JobResult | null;
  error: string;
  failure: FailureClass | null;
  deviceName: string;
  createdAt: string;
  updatedAt: string;
  submitStartedAt: string | null;
  events: Array<{ id: string; kind: JobEventKind; text: string; createdAt: string }>;
  artifacts: Array<{ id: string; kind: ArtifactKind; name: string; contentType: string; createdAt: string }>;
};

export type DeviceView = {
  id: string;
  name: string;
  companionVersion: string;
  lastSeenAt: string | null;
  online: boolean;
  createdAt: string;
};
