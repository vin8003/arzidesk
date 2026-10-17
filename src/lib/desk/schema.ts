import { z } from "zod";
import {
  AREAS,
  EDUCATIONS,
  emptyApplicant,
  emptyDetails,
  FLOWS,
  GENDERS,
  RTI_MODES,
  SCHEMES,
  STATES,
  STEP_KINDS,
  type Applicant,
  type CaseDetails,
} from "./types.ts";

const text = (max: number) =>
  z
    .string()
    .catch("")
    .transform((v) => v.slice(0, max));

const day = z
  .string()
  .nullable()
  .catch(null)
  .transform((v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null));

export const applicantSchema = z.object({
  name: text(120),
  relation: text(160),
  address: text(300),
  village: text(120),
  block: text(120),
  district: text(120),
  pincode: text(10),
  mobile: text(20),
  email: text(160),
  bpl: z.boolean().catch(false),
  bplCard: text(60),
  gender: z.enum([...GENDERS, ""]).catch(""),
  area: z.enum([...AREAS, ""]).catch(""),
  education: z.enum([...EDUCATIONS, ""]).catch(""),
});

export const detailsSchema = z.object({
  beneficiaryId: text(80),
  amountStuck: text(160),
  since: text(80),
  facts: text(4000),
  infoWanted: text(2000),
  authorityLevel: z.enum(["central", "state"]).catch("state"),
  authority: text(240),
  pioAddress: text(400),
  faaAddress: text(400),
  lifeLiberty: z.boolean().catch(false),
  opponent: text(200),
  opponentAddress: text(400),
  product: text(240),
  purchaseOn: text(10),
  amountPaid: text(40),
  claimValue: text(40),
  reliefWanted: text(600),
  causeOn: text(10),
  documents: text(800),
  advocate: text(120),
});

export function readApplicant(raw: unknown): Applicant {
  return applicantSchema.parse({ ...emptyApplicant(), ...((raw as object) ?? {}) });
}

export function readDetails(raw: unknown): CaseDetails {
  return detailsSchema.parse({ ...emptyDetails(), ...((raw as object) ?? {}) });
}

export const createCaseSchema = z.object({
  flow: z.enum(FLOWS),
  state: z.enum(STATES),
  lang: z.enum(["hi", "en"]).catch("hi"),
  scheme: z.enum(SCHEMES).nullable().catch(null),
  title: text(160),
  autoAppeal: z.boolean().catch(true),
  applicant: z.unknown().transform(readApplicant),
  details: z.unknown().transform(readDetails),
});

export type CreateCaseInput = z.input<typeof createCaseSchema>;

export const updateCaseSchema = z.object({
  id: z.string().min(1).max(64),
  title: text(160).optional(),
  lang: z.enum(["hi", "en"]).optional(),
  autoAppeal: z.boolean().optional(),
  applicant: z.unknown().optional(),
  details: z.unknown().optional(),
});

export const stepPatchSchema = z.object({
  caseId: z.string().min(1).max(64),
  kind: z.enum(STEP_KINDS),
  patch: z.object({
    docText: z.string().max(60_000).optional(),
    filedOn: day.optional(),
    reference: text(160).optional(),
    mode: z.union([z.enum(RTI_MODES), z.string().max(40)]).optional(),
    viaApio: z.boolean().optional(),
    deliveredOn: day.optional(),
    replyOn: day.optional(),
    replyText: z.string().max(12_000).optional(),
    outcome: text(40).optional(),
    notes: z.string().max(4_000).optional(),
    status: z.enum(["pending", "drafted", "filed", "done", "skipped"]).optional(),
  }),
});

export type StepPatch = z.infer<typeof stepPatchSchema>["patch"];
