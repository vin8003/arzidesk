import type { OutputLang } from "@/lib/lang";

export const FLOWS = ["money", "rti", "consumer"] as const;
export type Flow = (typeof FLOWS)[number];

export const STATES = ["UP", "RJ", "MP", "DL"] as const;
export type StateCode = (typeof STATES)[number];

export const SCHEMES = ["pmkisan", "mgnrega", "pension"] as const;
export type Scheme = (typeof SCHEMES)[number];

/** Who holds the information: a Government of India office or the state's own. */
export const AUTHORITY_LEVELS = ["central", "state"] as const;
export type AuthorityLevel = (typeof AUTHORITY_LEVELS)[number];

/** How an RTI goes out. `central_online` is rtionline.gov.in; `state_online` the state's own portal. */
export const RTI_MODES = ["central_online", "state_online", "postal", "by_hand"] as const;
export type RtiMode = (typeof RTI_MODES)[number];

/** Every step a case can have. Drafted steps are billed; status_check is free. */
export const STEP_KINDS = [
  "status_check",
  "grievance",
  "rti_application",
  "first_appeal",
  "second_appeal",
  "nch",
  "legal_notice",
  "consumer_complaint",
] as const;
export type StepKind = (typeof STEP_KINDS)[number];

/** Steps that produce an AI draft (and a wallet debit). */
export const DRAFT_KINDS = [
  "grievance",
  "rti_application",
  "first_appeal",
  "second_appeal",
  "nch",
  "legal_notice",
  "consumer_complaint",
] as const;
export type DraftKind = (typeof DRAFT_KINDS)[number];

export function isDraftKind(kind: string): kind is DraftKind {
  return (DRAFT_KINDS as readonly string[]).includes(kind);
}

export type StepStatus = "pending" | "drafted" | "filed" | "done" | "skipped";

/**
 * What happened after filing. RTI-type steps: full | partial | refused | no_reply | transferred.
 * Grievance / NCH / notice: resolved | unresolved. Status check: a finding code from schemes.ts.
 */
export type StepOutcome = string;

export type Applicant = {
  name: string;
  /** Father's / husband's name, as Indian forms ask. */
  relation: string;
  address: string;
  village: string;
  block: string;
  district: string;
  pincode: string;
  mobile: string;
  email: string;
  bpl: boolean;
  bplCard: string;
};

export const emptyApplicant = (): Applicant => ({
  name: "",
  relation: "",
  address: "",
  village: "",
  block: "",
  district: "",
  pincode: "",
  mobile: "",
  email: "",
  bpl: false,
  bplCard: "",
});

/** Flow-specific facts. Every field is optional text so one shape serves all three flows. */
export type CaseDetails = {
  /** money: beneficiary / registration / job card / pension id. */
  beneficiaryId: string;
  /** money: amount or instalments stuck, e.g. "3 instalments of ₹2,000". */
  amountStuck: string;
  /** money: since when, e.g. "since Feb 2026". */
  since: string;
  /** All flows: the story in the operator's words. */
  facts: string;
  /** rti: what the applicant wants to know. */
  infoWanted: string;
  /** rti: central or state public authority. */
  authorityLevel: AuthorityLevel;
  /** rti / money: name of the public authority (department / office). */
  authority: string;
  /** rti / money: PIO designation and postal address, typed by the operator. */
  pioAddress: string;
  /** rti / money: First Appellate Authority designation and address, if known. */
  faaAddress: string;
  /** rti: information concerns life or liberty (48-hour reply). */
  lifeLiberty: boolean;
  /** consumer: company / seller / service provider. */
  opponent: string;
  opponentAddress: string;
  /** consumer: goods or service bought. */
  product: string;
  /** consumer: date of purchase / service (YYYY-MM-DD). */
  purchaseOn: string;
  /** consumer: amount paid, in rupees as typed. */
  amountPaid: string;
  /** consumer: total claim value in rupees (refund + compensation), decides the commission and fee. */
  claimValue: string;
  /** consumer: what the complainant wants. */
  reliefWanted: string;
  /** consumer: date the cause of action arose (YYYY-MM-DD), for the two-year limitation. */
  causeOn: string;
  /** consumer: documents in hand (bill, warranty card, chats…). */
  documents: string;
  /** consumer: the advocate's name if a lawyer signs the notice; empty = complainant signs. */
  advocate: string;
};

export const emptyDetails = (): CaseDetails => ({
  beneficiaryId: "",
  amountStuck: "",
  since: "",
  facts: "",
  infoWanted: "",
  authorityLevel: "state",
  authority: "",
  pioAddress: "",
  faaAddress: "",
  lifeLiberty: false,
  opponent: "",
  opponentAddress: "",
  product: "",
  purchaseOn: "",
  amountPaid: "",
  claimValue: "",
  reliefWanted: "",
  causeOn: "",
  documents: "",
  advocate: "",
});

export type DraftSection = { heading: string; text: string };

/** What the model returns, kept as-is so a draft can be re-assembled without another call. */
export type DraftDoc = {
  kind: DraftKind;
  lang: OutputLang;
  subject: string;
  sections: DraftSection[];
  /** RTI-type drafts: the numbered points of information or grounds. */
  points: string[];
  prayer: string;
  annexures: string[];
  /** Checklist for the operator: fee, where to file, what to attach. Never printed in the document. */
  filingNotes: string[];
  /** Missing facts, placeholders left, risks (e.g. third-party personal information). */
  warnings: string[];
  model: string;
  generatedAt: string;
};

export type CaseStep = {
  id: string;
  caseId: string;
  kind: StepKind;
  status: StepStatus;
  doc: DraftDoc | null;
  docText: string;
  generations: number;
  filedOn: string | null;
  reference: string;
  mode: string;
  /** RTI: application went to an Assistant PIO (adds 5 days). */
  viaApio: boolean;
  /** Legal notice: date the opposite party received it. */
  deliveredOn: string | null;
  replyOn: string | null;
  replyText: string;
  outcome: StepOutcome;
  notes: string;
  updatedAt: string;
};

export type CaseRecord = {
  id: string;
  flow: Flow;
  state: StateCode;
  lang: OutputLang;
  title: string;
  scheme: Scheme | null;
  status: "open" | "closed";
  outcome: string;
  applicant: Applicant;
  details: CaseDetails;
  autoAppeal: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CaseEvent = {
  id: string;
  kind: string;
  text: string;
  createdAt: string;
};

export type CaseBundle = {
  record: CaseRecord;
  steps: CaseStep[];
  events: CaseEvent[];
};
