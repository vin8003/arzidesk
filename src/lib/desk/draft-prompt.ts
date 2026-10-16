import { z } from "zod";
import { CONSUMER_CONTEXT, MONEY_CONTEXT, RTI_CONTEXT, langRule, todayLine } from "../ai/context.ts";
import { DEFAULT_FAST_MODEL, isReasoningModel } from "../ai/models.ts";
import { REPAIR_NOTE } from "../ai/retry.ts";
import { list, obj, responsesJsonFormat, str } from "../ai/schema.ts";
import { schemeGuide, findingFor } from "./schemes.ts";
import { CENTRAL_RTI, STATE_PROFILES, commissionFor, districtFilingFee, parseRupees, rtiRulesFor } from "./states.ts";
import type { CaseBundle, CaseStep, DraftKind, StepKind } from "./types.ts";

export const DRAFT_TIMEOUT_MS = 60_000;
export const COMPLAINT_TIMEOUT_MS = 120_000;
export const DRAFT_MIN_RETRY_MS = 20_000;
export const DRAFT_MAX_OUTPUT_TOKENS = 5_000;
export const COMPLAINT_MAX_OUTPUT_TOKENS = 10_000;

/** rtionline.gov.in text box: keep a margin under its ~3,000 character limit. */
export const CENTRAL_ONLINE_CHAR_BUDGET = 2_800;
export const GRIEVANCE_CHAR_BUDGET = 1_800;
export const NCH_CHAR_BUDGET = 1_200;

export const DRAFT_JSON_SCHEMA = obj({
  subject: str("one-line subject"),
  sections: list(obj({ heading: str(), text: str() }), "body sections in order; the app adds addresses, dates and signatures"),
  points: list(str(), "numbered items: RTI information points or appeal grounds; empty when not used"),
  prayer: str("the specific relief, demand or action asked for"),
  annexures: list(str(), "documents to attach"),
  filingNotes: list(str(), "operator checklist; not printed"),
  warnings: list(str(), "missing facts, placeholders left, risks"),
});

const draftSchema = z.object({
  subject: z.string().catch(""),
  sections: z
    .array(z.object({ heading: z.string().catch(""), text: z.string().catch("") }))
    .catch([]),
  points: z.array(z.string()).catch([]),
  prayer: z.string().catch(""),
  annexures: z.array(z.string()).catch([]),
  filingNotes: z.array(z.string()).catch([]),
  warnings: z.array(z.string()).catch([]),
});

export type ParsedDraft = z.infer<typeof draftSchema>;

/** Lenient parse of the model's JSON. Throws "PARSE" when nothing usable came back. */
export function parseDraft(text: string, pull: (t: string) => unknown): ParsedDraft {
  const parsed = draftSchema.parse(pull(text));
  const clean = (s: string) => s.split("\u0000").join("").trim();
  const out: ParsedDraft = {
    subject: clean(parsed.subject),
    sections: parsed.sections
      .map((s) => ({ heading: clean(s.heading), text: clean(s.text) }))
      .filter((s) => s.text),
    points: parsed.points.map(clean).filter(Boolean),
    prayer: clean(parsed.prayer),
    annexures: parsed.annexures.map(clean).filter(Boolean),
    filingNotes: parsed.filingNotes.map(clean).filter(Boolean),
    warnings: parsed.warnings.map(clean).filter(Boolean),
  };
  if (!out.sections.length && !out.points.length) throw new Error("PARSE");
  return out;
}

export const DRAFT_SYSTEM = `You draft filings for Indian citizens, prepared by a lawyer or an e-Mitra / CSC operator who will check, print and file them. The citizen signs and files; you are not their lawyer.

Hard rules:
- Use only the facts in the user message. Never invent names, addresses, dates, amounts, ID numbers, reference numbers, phone numbers, URLs, officer names or portal menu names. Where a fact the draft needs is missing, write a bracketed placeholder like [date of application] and add a warning.
- Do not write addresses, the date line, signature blocks or "From/To" headers. The application adds them from the case record.
- Cite only Acts and sections given in the context below or in the user message. No case law.
- Plain, polite, specific language a government clerk can act on. No threats, no exaggeration, no abuse of officials.
- Return ONLY a JSON object matching the schema. The first character of your reply must be {.

${RTI_CONTEXT}

${CONSUMER_CONTEXT}

${MONEY_CONTEXT}`;

type KindSpec = {
  instruction: (b: CaseBundle) => string;
  /** Character budget for the whole body (0 = none). */
  charBudget: (b: CaseBundle, step: CaseStep | null) => number;
};

function stepOf(b: CaseBundle, kind: StepKind): CaseStep | null {
  return b.steps.find((s) => s.kind === kind) ?? null;
}

function wordLimitLine(b: CaseBundle): string {
  const rules = rtiRulesFor(b.record.state, b.record.details.authorityLevel);
  return rules.wordLimit ? `Keep the application body under ${rules.wordLimit} words (${rules.rules}).` : "";
}

export const KIND_SPECS: Record<DraftKind, KindSpec> = {
  grievance: {
    instruction: () =>
      `Kind: public grievance for an online grievance portal (CPGRAMS or the state portal named below).
- sections: exactly one section, heading "Grievance", whose text is the complete grievance ready to paste: who is affected (name, village, district), the scheme and ID, what is stuck and since when, what the public status page shows, what the citizen already did, and the specific action asked for. End by asking that the action taken be communicated.
- points: [] (empty).
- prayer: the specific action in one sentence.
- annexures: documents worth uploading (passbook page, status screenshot, ID number slip) — only those the facts suggest.
- filingNotes: which department/ministry to pick and that the registration number must be noted for the 30-day follow-up.`,
    charBudget: () => GRIEVANCE_CHAR_BUDGET,
  },
  rti_application: {
    instruction: (b) => {
      const money = b.record.flow === "money";
      return `Kind: RTI application under s.6(1) of the RTI Act, 2005.
- points: 4 to 8 numbered requests for existing records, each one specific and answerable from a file. ${
        money
          ? "Cover: the current status of the applicant's own case and the date of each action; certified copies of file notings and orders on the applicant's application / grievance; the reasons recorded for delay, rejection or stoppage; the name and designation of the officer responsible at each stage; the action taken on the grievance with its date; and, for wages or instalments, the payment / FTO details."
          : "Ask only for what the applicant wants to know, broken into separate points."
      }
- sections: at most one short section, heading "Reference", of one or two sentences giving context (e.g. the grievance number and date). Use [] if no context is needed.
- prayer: one line on the form of information wanted (e.g. certified copies by post) and, if BPL, that no fee is payable under s.7(5).
- annexures: e.g. copy of BPL card, copy of grievance acknowledgement.
- filingNotes: fee, payment mode and where to file, from the filing facts below.
- warnings: flag any point that asks for third-party personal information (exempt under s.8(1)(j) as amended) and rephrase it in the points to ask for the applicant's own records or aggregate data.
${wordLimitLine(b)}`;
    },
    charBudget: (b, step) => (step?.mode === "central_online" || (b.record.details.authorityLevel === "central" && !step?.mode) ? CENTRAL_ONLINE_CHAR_BUDGET : 0),
  },
  first_appeal: {
    instruction: () => `Kind: first appeal under s.19(1) of the RTI Act, 2005, to the First Appellate Authority.
- points: the grounds of appeal, numbered. Tie each ground to the facts: deadline missed (s.7(1)) and deemed refusal (s.7(2)); no reasons or no appeal details (s.7(8)); information incomplete — go point by point through the original RTI points against the reply text if given; wrong exemption claimed; fee demanded after delay (s.7(6)).
- sections: one section, heading "Facts", with the dates of application, payment, reply (or none) in sequence.
- prayer: direct the PIO to supply complete, point-wise information free of charge under s.7(6) within a fixed time (e.g. 15 days), and any other relief the facts support.
- annexures: copy of the RTI application, proof of posting / online acknowledgement, fee proof, the PIO's reply if any.
- filingNotes: whom to address, the fee for this state, and the 30-day decision clock.`,
    charBudget: () => 0,
  },
  second_appeal: {
    instruction: () => `Kind: second appeal under s.19(3) of the RTI Act, 2005, to the Information Commission.
- points: the grounds, numbered: PIO's failure (as in the first appeal), the First Appellate Authority's failure to decide within 30/45 days or an order that does not cure the defect.
- sections: one section, heading "Facts", with the full chronology: application, reply, first appeal, FAA order (or none), with dates.
- prayer: direct disclosure free of charge under s.7(6); impose penalty on the PIO under s.20(1); recommend disciplinary action under s.20(2); award compensation to the appellant under s.19(8)(b); any other relief.
- annexures: RTI application, PIO reply, first appeal, FAA order, postal proofs.
- filingNotes: which Commission, number of copies, online filing route if any.`,
    charBudget: () => 0,
  },
  nch: {
    instruction: () => `Kind: complaint text for the National Consumer Helpline (NCH) web form / app.
- sections: exactly one section, heading "Complaint", whose text is ready to paste: product or service, company, date, amount paid, what went wrong, what the consumer already tried (with dates), and the relief wanted.
- points: [] (empty).
- prayer: the relief in one sentence (refund / replacement / repair / service restored).
- annexures: bill, warranty card, screenshots, emails — only those the facts mention.
- filingNotes: choose the sector and company name in the NCH form; note the docket number for the follow-up.`,
    charBudget: () => NCH_CHAR_BUDGET,
  },
  legal_notice: {
    instruction: (b) => `Kind: legal notice to the opposite party before a consumer complaint, ${
      b.record.details.advocate.trim()
        ? `issued by Advocate ${b.record.details.advocate.trim()} on instructions of the complainant ("my client")`
        : "issued by the complainant personally (first person)"
    }.
- sections: one section, heading "Notice", of numbered paragraphs: purchase / service with date and amount; the defect or deficiency; complaints made (including the NCH docket number if given) and the response; why this is a deficiency in service / defect / unfair trade practice under the Consumer Protection Act, 2019.
- points: [] (empty).
- prayer: the demand — refund / replacement / repair / compensation with amounts from the facts (placeholders if not given) — within 15 days of receipt, failing which a complaint will be filed before the District Consumer Disputes Redressal Commission at the opposite party's cost.
- annexures: copies sent with the notice (bill, warranty, correspondence).
- filingNotes: send by Speed Post with proof of delivery; keep the receipt and tracking number.`,
    charBudget: () => 0,
  },
  consumer_complaint: {
    instruction: (b) => {
      const claim = parseRupees(b.record.details.claimValue);
      const level = commissionFor(claim);
      const fee = districtFilingFee(claim);
      return `Kind: consumer complaint under s.35 of the Consumer Protection Act, 2019, for the complainant to file in person on e-Jagriti.
- sections, in this order and with these headings: "Facts of the complaint" (numbered paragraphs with dates and amounts), "Deficiency in service / defect / unfair trade practice", "Pre-litigation steps" (NCH docket, legal notice date and response), "Cause of action", "Jurisdiction" (pecuniary: the claim of ${
        Number.isFinite(claim) ? `₹${claim.toLocaleString("en-IN")}` : "[claim amount]"
      } is within the ${level === "district" ? "District Commission's limit of ₹50 lakh" : `${level} commission's limit`}; territorial: s.34(2)), "Limitation" (within two years under s.69), "Fee" (${
        fee === 0 ? "nil up to ₹5 lakh" : `₹${fee}`
      }).
- points: [] (empty).
- prayer: lettered reliefs (a), (b), (c)… — refund with the amount, compensation for harassment and mental agony, litigation costs, interest (use a placeholder rate), and "any other relief this Commission deems fit".
- annexures: list of documents as "Annexure C-1: …", "Annexure C-2: …".
- filingNotes: e-Jagriti steps in general terms (register, choose District Commission, upload complaint, affidavit and annexures as PDFs), copies for each opposite party.
- The application adds the cause title, memo of parties, index, verification and affidavit — do not write them.${
        level !== "district" ? "\n- warnings: the claim exceeds the District Commission's limit; the operator must file before the State or National Commission." : ""
      }`;
    },
    charBudget: () => 0,
  },
};

function line(label: string, value: string | null | undefined): string {
  const v = String(value ?? "").trim();
  return v ? `${label}: ${v}` : "";
}

function stepFacts(step: CaseStep | null, label: string): string {
  if (!step) return "";
  const parts = [
    line(`${label} filed on`, step.filedOn),
    line(`${label} reference / registration number`, step.reference),
    line(`${label} filing mode`, step.mode),
    step.viaApio ? `${label} went to an Assistant PIO` : "",
    line(`${label} reply / decision received on`, step.replyOn),
    line(`${label} outcome recorded`, step.outcome),
    step.replyText.trim() ? `${label} reply text (as received):\n${step.replyText.trim().slice(0, 3000)}` : "",
    step.kind === "rti_application" && step.doc?.points.length
      ? `${label} points asked:\n${step.doc.points.map((p, i) => `${i + 1}. ${p}`).join("\n")}`
      : "",
  ].filter(Boolean);
  return parts.join("\n");
}

/** The filing facts block: state rules, fees, where it goes. */
function filingFacts(kind: DraftKind, b: CaseBundle, step: CaseStep | null): string {
  const { record } = b;
  const state = STATE_PROFILES[record.state];
  const out: string[] = [`State: ${state.name}`];
  if (kind === "rti_application" || kind === "first_appeal" || kind === "second_appeal") {
    const rules = rtiRulesFor(record.state, record.details.authorityLevel);
    out.push(
      `Public authority level: ${record.details.authorityLevel === "central" ? "Government of India" : `Government of ${state.name}`}`,
      `Rules: ${rules.rules}`,
      `Application fee: ₹${rules.fee}; first appeal fee: ${rules.firstAppealFee ? `₹${rules.firstAppealFee}` : "nil"}; second appeal fee: ${
        rules.secondAppealFee ? `₹${rules.secondAppealFee}` : "nil"
      }${rules.verify ? " (fees to be confirmed locally)" : ""}`,
      `Payment modes: ${rules.payModes}`,
      `Second appeal lies to: ${rules.commission}`,
    );
    if (record.applicant.bpl) out.push("Applicant is below the poverty line (BPL card held): no fee under s.7(5).");
    const mode = step?.mode || (record.details.authorityLevel === "central" ? "central_online" : "postal");
    out.push(`Filing mode: ${mode}${mode === "central_online" ? ` (rtionline.gov.in; ${CENTRAL_RTI.notes[1]})` : ""}`);
    if (record.details.lifeLiberty) out.push("The information concerns the life or liberty of a person: ask for a reply within 48 hours under the proviso to s.7(1).");
  }
  if (kind === "grievance") {
    out.push(`State grievance portal: ${state.grievance.label} (${state.grievance.url})`, "Central portal: CPGRAMS (pgportal.gov.in)");
  }
  if (kind === "consumer_complaint" || kind === "legal_notice" || kind === "nch") {
    out.push(`Consumer commission: District Consumer Disputes Redressal Commission, ${record.applicant.district || "[district]"}, ${state.consumerState}`);
  }
  return out.join("\n");
}

/** User message for one draft. Contact details (mobile, email, BPL card no.) never go to the model. */
export function buildDraftUser(kind: DraftKind, b: CaseBundle, opts: { extra?: string; now?: Date } = {}): string {
  const { record } = b;
  const a = record.applicant;
  const d = record.details;
  const step = stepOf(b, kind);
  const lang = kind === "rti_application" && step?.mode === "central_online" ? "en" : record.lang;
  const budget = KIND_SPECS[kind].charBudget(b, step);

  const money: string[] = [];
  if (record.flow === "money" && record.scheme) {
    const guide = schemeGuide(record.scheme);
    const status = stepOf(b, "status_check");
    const finding = status?.outcome ? findingFor(record.scheme, status.outcome) : null;
    money.push(
      `Scheme: ${guide.name}`,
      line(guide.idLabel, d.beneficiaryId),
      line("Amount / instalments stuck", d.amountStuck),
      line("Stuck since", d.since),
      finding ? `Public status page shows: ${finding.label}` : "",
      line("Status check notes", status?.notes),
      `Relevant rules:\n${guide.legalHooks.map((h) => `- ${h}`).join("\n")}`,
    );
  }

  const consumer: string[] =
    record.flow === "consumer"
      ? [
          line("Opposite party (company / seller)", d.opponent),
          line("Product or service", d.product),
          line("Date of purchase / service", d.purchaseOn),
          line("Amount paid (₹)", d.amountPaid),
          line("Total claim (₹)", d.claimValue),
          line("Relief wanted", d.reliefWanted),
          line("Cause of action arose on", d.causeOn),
          line("Documents in hand", d.documents),
        ]
      : [];

  const rti: string[] =
    record.flow !== "consumer"
      ? [line("Public authority", d.authority), line("Information wanted (operator's words)", d.infoWanted)]
      : [];

  const history = [
    stepFacts(stepOf(b, "grievance"), "Grievance"),
    stepFacts(stepOf(b, "rti_application"), "RTI application"),
    stepFacts(stepOf(b, "first_appeal"), "First appeal"),
    stepFacts(stepOf(b, "nch"), "NCH complaint"),
    stepFacts(stepOf(b, "legal_notice"), "Legal notice"),
  ].filter(Boolean);

  return [
    langRule(lang),
    todayLine(opts.now),
    KIND_SPECS[kind].instruction(b),
    budget ? `Keep sections + points + prayer under ${budget} characters in total.` : "",
    "",
    "Filing facts:",
    filingFacts(kind, b, step),
    "",
    "Applicant:",
    [line("Name", a.name), line("Father's / husband's name", a.relation), line("Village", a.village), line("Block", a.block), line("District", a.district)]
      .filter(Boolean)
      .join("\n") || "(not given)",
    "",
    "Case facts:",
    [...money, ...rti, ...consumer, line("Facts in the operator's words", d.facts)].filter(Boolean).join("\n") || "(not given)",
    history.length ? `\nWhat has happened so far:\n${history.join("\n\n")}` : "",
    opts.extra?.trim() ? `\nOperator's instructions for this draft:\n${opts.extra.trim().slice(0, 1500)}` : "",
  ]
    .filter((part) => part !== "")
    .join("\n");
}

/** Body for POST https://api.x.ai/v1/responses (no tools). `legacy` is the plain-JSON fallback request. */
export function draftXaiBody(
  instructions: string,
  input: string,
  opts: { model: string; maxOutputTokens: number; legacy?: boolean; repair?: { previous: string } },
) {
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [{ role: "user", content: input }];
  if (opts.repair) {
    messages.push({ role: "assistant", content: opts.repair.previous.slice(0, 4000) });
    messages.push({ role: "user", content: REPAIR_NOTE });
  }
  const model = opts.legacy ? DEFAULT_FAST_MODEL : opts.model;
  return {
    model,
    instructions,
    input: messages,
    ...(isReasoningModel(model) ? {} : { temperature: 0.2 }),
    max_output_tokens: opts.maxOutputTokens,
    text: opts.legacy
      ? { format: { type: "json_object" as const } }
      : responsesJsonFormat("filing_draft", DRAFT_JSON_SCHEMA),
  };
}
