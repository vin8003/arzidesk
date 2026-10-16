import { emptyApplicant, emptyDetails, type CaseBundle, type CaseRecord, type CaseStep, type Flow, type StepKind } from "./types.ts";

/** Test helpers: a case record and steps without a database. */
export function record(flow: Flow, over: Partial<CaseRecord> = {}): CaseRecord {
  return {
    id: "case_test",
    flow,
    state: "UP",
    lang: "en",
    title: "Test case",
    scheme: flow === "money" ? "pmkisan" : null,
    status: "open",
    outcome: "",
    applicant: { ...emptyApplicant(), name: "Ramesh Kumar", relation: "S/o Mohan Lal", village: "Rampur", district: "Sitapur", mobile: "9000000001", bplCard: "" },
    details: { ...emptyDetails(), pioAddress: "PIO, Office of the BDO, Sadar, Sitapur" },
    autoAppeal: true,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...over,
  };
}

export function step(kind: StepKind, over: Partial<CaseStep> = {}): CaseStep {
  return {
    id: `st_${kind}`,
    caseId: "case_test",
    kind,
    status: "pending",
    doc: null,
    docText: "",
    generations: 0,
    filedOn: null,
    reference: "",
    mode: "",
    viaApio: false,
    deliveredOn: null,
    replyOn: null,
    replyText: "",
    outcome: "",
    notes: "",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...over,
  };
}

export function bundle(rec: CaseRecord, steps: CaseStep[] = []): CaseBundle {
  return { record: rec, steps, events: [] };
}
