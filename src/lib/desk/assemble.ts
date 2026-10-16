import { STATE_PROFILES, commissionFor, parseRupees, rtiRulesFor } from "./states.ts";
import { rtiReplyDue } from "./timers.ts";
import type { Applicant, CaseBundle, CaseStep, DraftDoc, DraftKind } from "./types.ts";

/**
 * Deterministic document chrome. The model writes the subject, body, points and
 * prayer; addresses, parties, fee lines, dates and signature blocks come from
 * the case record so a draft can never carry an invented address or number.
 */

type L = "hi" | "en";

const BLANK = "..................";

function addressLine(a: Applicant, state: string): string {
  const parts = [a.address, a.village, a.block ? `${a.block}` : "", a.district, state].map((p) => p.trim()).filter(Boolean);
  const joined = parts.join(", ");
  return a.pincode.trim() ? `${joined} – ${a.pincode.trim()}` : joined;
}

function dmy(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

function numbered(items: string[], style: "num" | "alpha" = "num"): string {
  return items
    .map((item, i) => {
      const tag = style === "alpha" ? `(${String.fromCharCode(65 + (i % 26))})` : `(${i + 1})`;
      return `${tag} ${item}`;
    })
    .join("\n");
}

function sectionsText(doc: DraftDoc, skipHeadings = false): string {
  return doc.sections
    .map((s) => (skipHeadings || !s.heading ? s.text : `${s.heading.toUpperCase()}\n${s.text}`))
    .join("\n\n");
}

function signature(a: Applicant, lang: L, place: string, role?: string): string {
  const hi = lang === "hi";
  const lines = [
    `${hi ? "स्थान" : "Place"}: ${place || BLANK}`,
    `${hi ? "दिनांक" : "Date"}: ${BLANK}`,
    "",
    `${hi ? "हस्ताक्षर" : "Signature"}: ${BLANK}`,
    `${hi ? "नाम" : "Name"}: ${a.name || BLANK}${role ? ` (${role})` : ""}`,
  ];
  if (a.mobile.trim()) lines.push(`${hi ? "मोबाइल" : "Mobile"}: ${a.mobile.trim()}`);
  if (a.email.trim()) lines.push(`${hi ? "ईमेल" : "Email"}: ${a.email.trim()}`);
  return lines.join("\n");
}

function enclosures(items: string[], lang: L): string {
  if (!items.length) return "";
  return `${lang === "hi" ? "संलग्नक" : "Enclosures"}:\n${items.map((x, i) => `${i + 1}. ${x}`).join("\n")}`;
}

function feeLine(b: CaseBundle, kind: "application" | "first" | "second", lang: L): string {
  const rules = rtiRulesFor(b.record.state, b.record.details.authorityLevel);
  const hi = lang === "hi";
  const a = b.record.applicant;
  const card = a.bplCard.trim() ? ` (${hi ? "कार्ड संख्या" : "card no."} ${a.bplCard.trim()})` : "";
  const amount = kind === "application" ? rules.fee : kind === "first" ? rules.firstAppealFee : rules.secondAppealFee;
  if (kind === "application" && a.bpl) {
    return hi
      ? `शुल्क: आवेदक गरीबी रेखा से नीचे (BPL) है; धारा 7(5) के अंतर्गत कोई शुल्क देय नहीं। BPL कार्ड${card} की प्रति संलग्न।`
      : `Fee: The applicant is below the poverty line; no fee is payable under section 7(5). Copy of BPL card${card} enclosed.`;
  }
  if (!amount) {
    return hi ? "शुल्क: इस अपील के लिए कोई शुल्क देय नहीं है।" : "Fee: No fee is payable for this appeal.";
  }
  if (a.bpl) {
    return hi
      ? `शुल्क: ₹${amount}। अपीलकर्ता गरीबी रेखा से नीचे (BPL) है और शुल्क से छूट का अनुरोध करता/करती है; BPL कार्ड${card} की प्रति संलग्न।`
      : `Fee: ₹${amount}. The appellant is below the poverty line and requests exemption; copy of BPL card${card} enclosed.`;
  }
  return hi
    ? `शुल्क: ₹${amount} — ${BLANK} (IPO / DD / नकद रसीद) संख्या ${BLANK} दिनांक ${BLANK} द्वारा जमा।`
    : `Fee: ₹${amount} paid by ${BLANK} (IPO / DD / cash receipt) No. ${BLANK} dated ${BLANK}.`;
}

function stepOf(b: CaseBundle, kind: string): CaseStep | null {
  return b.steps.find((s) => s.kind === kind) ?? null;
}

function rtiApplication(doc: DraftDoc, b: CaseBundle, step: CaseStep | null): string {
  const { record } = b;
  const lang = doc.lang;
  const hi = lang === "hi";
  const a = record.applicant;
  const state = STATE_PROFILES[record.state];
  const rules = rtiRulesFor(record.state, record.details.authorityLevel);
  const reference = doc.sections.map((s) => s.text).join(" ").trim();

  if (step?.mode === "central_online") {
    // rtionline.gov.in has its own name / address / fee fields; only the request text goes in the box.
    return [doc.subject, reference, numbered(doc.points), doc.prayer].filter(Boolean).join("\n\n");
  }

  const pio = record.details.pioAddress.trim() || `[${hi ? "जन सूचना अधिकारी का पदनाम और पता" : "designation and address of the Public Information Officer"}]`;
  const lines = [
    hi ? "सूचना का अधिकार अधिनियम, 2005 की धारा 6(1) के अंतर्गत आवेदन" : "APPLICATION UNDER SECTION 6(1) OF THE RIGHT TO INFORMATION ACT, 2005",
    `(${hi ? rules.rulesHi : rules.rules})`,
    "",
    hi ? "सेवा में," : "To,",
    hi ? "जन सूचना अधिकारी," : "The Public Information Officer,",
    pio,
    "",
    `${hi ? "विषय" : "Subject"}: ${doc.subject}`,
    "",
    `1. ${hi ? "आवेदक का नाम" : "Name of the applicant"}: ${a.name || BLANK}`,
    `2. ${hi ? "पिता / पति का नाम" : "Father's / husband's name"}: ${a.relation || BLANK}`,
    `3. ${hi ? "पता" : "Address"}: ${addressLine(a, hi ? state.nameHi : state.name) || BLANK}`,
    `4. ${hi ? "माँगी गई सूचना का विवरण" : "Particulars of the information sought"}:`,
    reference ? `   ${reference}` : "",
    numbered(doc.points),
    doc.prayer ? `5. ${doc.prayer}` : "",
    `6. ${feeLine(b, "application", lang)}`,
    `7. ${hi ? "मैं भारत का नागरिक हूँ।" : "I am a citizen of India."}`,
    record.details.lifeLiberty
      ? hi
        ? "8. यह सूचना एक व्यक्ति के जीवन / स्वतंत्रता से संबंधित है; कृपया धारा 7(1) के परंतुक के अंतर्गत 48 घंटे में सूचना दें।"
        : "8. This information concerns the life or liberty of a person; please supply it within 48 hours under the proviso to section 7(1)."
      : "",
    "",
    enclosures(doc.annexures, lang),
    "",
    signature(a, lang, a.village || a.district),
  ];
  return lines.filter((l, i, arr) => !(l === "" && arr[i - 1] === "")).join("\n").trim();
}

function firstAppeal(doc: DraftDoc, b: CaseBundle): string {
  const { record } = b;
  const lang = doc.lang;
  const hi = lang === "hi";
  const a = record.applicant;
  const state = STATE_PROFILES[record.state];
  const rti = stepOf(b, "rti_application");
  const due = rti?.filedOn ? rtiReplyDue(rti.filedOn, { viaApio: rti.viaApio, lifeLiberty: record.details.lifeLiberty }) : "";
  const faa =
    record.details.faaAddress.trim() ||
    `[${hi ? "प्रथम अपीलीय अधिकारी का पदनाम और पता (जन सूचना अधिकारी के कार्यालय में)" : "designation and address of the First Appellate Authority (in the PIO's office)"}]`;
  const lines = [
    hi ? "सूचना का अधिकार अधिनियम, 2005 की धारा 19(1) के अंतर्गत प्रथम अपील" : "FIRST APPEAL UNDER SECTION 19(1) OF THE RIGHT TO INFORMATION ACT, 2005",
    "",
    hi ? "सेवा में," : "To,",
    hi ? "प्रथम अपीलीय अधिकारी," : "The First Appellate Authority,",
    faa,
    "",
    `${hi ? "विषय" : "Subject"}: ${doc.subject}`,
    "",
    `1. ${hi ? "अपीलकर्ता का नाम और पता" : "Name and address of the appellant"}: ${a.name || BLANK}, ${addressLine(a, hi ? state.nameHi : state.name)}`,
    `2. ${hi ? "जन सूचना अधिकारी का पता" : "Public Information Officer"}: ${record.details.pioAddress.trim() || BLANK}`,
    `3. ${hi ? "RTI आवेदन की तिथि / संदर्भ" : "Date / reference of the RTI application"}: ${dmy(rti?.filedOn) || BLANK}${rti?.reference ? ` · ${rti.reference}` : ""}`,
    `4. ${hi ? "जवाब की अंतिम तिथि" : "Last date for the PIO's reply"}: ${dmy(due) || BLANK}`,
    `5. ${hi ? "जन सूचना अधिकारी का जवाब" : "PIO's reply"}: ${
      rti?.replyOn
        ? `${hi ? "दिनांक" : "dated"} ${dmy(rti.replyOn)}`
        : hi
          ? "समय-सीमा में कोई जवाब नहीं मिला (धारा 7(2) के अंतर्गत अस्वीकृत माना जाए)"
          : "No reply received within the time limit (deemed refusal under section 7(2))"
    }`,
    "",
    sectionsText(doc),
    "",
    hi ? "अपील के आधार:" : "GROUNDS OF APPEAL:",
    numbered(doc.points, "alpha"),
    "",
    hi ? "माँगी गई राहत:" : "RELIEF SOUGHT:",
    doc.prayer,
    "",
    feeLine(b, "first", lang),
    "",
    enclosures(doc.annexures, lang),
    "",
    hi
      ? "घोषणा: ऊपर दिए गए तथ्य मेरी जानकारी में सत्य हैं। इसी विषय पर कोई अपील किसी अन्य प्राधिकारी के पास लंबित नहीं है।"
      : "Declaration: The facts stated above are true to the best of my knowledge. No appeal on this matter is pending before any other authority.",
    "",
    signature(a, lang, a.village || a.district, hi ? "अपीलकर्ता" : "Appellant"),
  ];
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function secondAppeal(doc: DraftDoc, b: CaseBundle): string {
  const { record } = b;
  const lang = doc.lang;
  const hi = lang === "hi";
  const a = record.applicant;
  const state = STATE_PROFILES[record.state];
  const rules = rtiRulesFor(record.state, record.details.authorityLevel);
  const rti = stepOf(b, "rti_application");
  const fa = stepOf(b, "first_appeal");
  const lines = [
    hi ? "सूचना का अधिकार अधिनियम, 2005 की धारा 19(3) के अंतर्गत द्वितीय अपील" : "SECOND APPEAL UNDER SECTION 19(3) OF THE RIGHT TO INFORMATION ACT, 2005",
    "",
    hi ? "सेवा में," : "To,",
    hi ? "रजिस्ट्रार," : "The Registrar,",
    hi ? rules.commissionHi : rules.commission,
    "",
    `${hi ? "विषय" : "Subject"}: ${doc.subject}`,
    "",
    `1. ${hi ? "अपीलकर्ता" : "Appellant"}: ${a.name || BLANK}, ${addressLine(a, hi ? state.nameHi : state.name)}`,
    `2. ${hi ? "जन सूचना अधिकारी" : "Public Information Officer"}: ${record.details.pioAddress.trim() || BLANK}`,
    `3. ${hi ? "प्रथम अपीलीय अधिकारी" : "First Appellate Authority"}: ${record.details.faaAddress.trim() || BLANK}`,
    `4. ${hi ? "RTI आवेदन" : "RTI application"}: ${dmy(rti?.filedOn) || BLANK}${rti?.reference ? ` · ${rti.reference}` : ""}`,
    `5. ${hi ? "प्रथम अपील" : "First appeal"}: ${dmy(fa?.filedOn) || BLANK}${fa?.reference ? ` · ${fa.reference}` : ""}`,
    `6. ${hi ? "प्रथम अपीलीय आदेश" : "First appellate order"}: ${fa?.replyOn ? dmy(fa.replyOn) : hi ? "कोई आदेश नहीं" : "No order passed"}`,
    "",
    sectionsText(doc),
    "",
    hi ? "अपील के आधार:" : "GROUNDS OF APPEAL:",
    numbered(doc.points, "alpha"),
    "",
    hi ? "प्रार्थना:" : "PRAYER:",
    doc.prayer,
    "",
    feeLine(b, "second", lang),
    "",
    enclosures(doc.annexures, lang),
    "",
    hi
      ? "सत्यापन: मैं घोषित करता/करती हूँ कि ऊपर दिए गए तथ्य मेरी जानकारी और विश्वास में सत्य हैं और इसी विषय पर कोई मामला किसी न्यायालय या आयोग में लंबित नहीं है।"
      : "Verification: I declare that the facts above are true to my knowledge and belief and that no matter on the same subject is pending before any court or commission.",
    "",
    signature(a, lang, a.village || a.district, hi ? "अपीलकर्ता" : "Appellant"),
  ];
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function portalText(doc: DraftDoc): string {
  return [doc.subject, sectionsText(doc, true)].filter(Boolean).join("\n\n");
}

function legalNotice(doc: DraftDoc, b: CaseBundle): string {
  const { record } = b;
  const lang = doc.lang;
  const hi = lang === "hi";
  const a = record.applicant;
  const d = record.details;
  const state = STATE_PROFILES[record.state];
  const advocate = d.advocate.trim();
  const from = advocate
    ? `${hi ? "अधिवक्ता" : "Advocate"} ${advocate}\n[${hi ? "पता / नामांकन संख्या" : "chamber address / enrolment no."}]`
    : `${a.name || BLANK}\n${addressLine(a, hi ? state.nameHi : state.name)}`;
  const opening = advocate
    ? hi
      ? `मेरे मुवक्किल ${a.name || BLANK}${a.relation ? `, ${a.relation}` : ""}, निवासी ${addressLine(a, state.nameHi)} के निर्देश पर और उनकी ओर से मैं आपको निम्नलिखित नोटिस देता/देती हूँ:`
      : `Under instructions from and on behalf of my client, ${a.name || BLANK}${a.relation ? `, ${a.relation}` : ""}, resident of ${addressLine(a, state.name)}, I hereby serve upon you the following notice:`
    : hi
      ? `मैं, ${a.name || BLANK}${a.relation ? `, ${a.relation}` : ""}, आपको निम्नलिखित नोटिस देता/देती हूँ:`
      : `I, ${a.name || BLANK}${a.relation ? `, ${a.relation}` : ""}, hereby serve upon you the following notice:`;
  const lines = [
    hi ? "कानूनी नोटिस" : "LEGAL NOTICE",
    hi ? "स्पीड पोस्ट (डिलीवरी प्रमाण सहित) द्वारा" : "By Speed Post with proof of delivery",
    `${hi ? "दिनांक" : "Date"}: ${BLANK}`,
    "",
    `${hi ? "प्रेषक" : "From"}:`,
    from,
    "",
    `${hi ? "प्रति" : "To"}:`,
    d.opponent.trim() || BLANK,
    d.opponentAddress.trim() || `[${hi ? "विपक्षी का पता" : "address of the opposite party"}]`,
    "",
    `${hi ? "विषय" : "Subject"}: ${doc.subject}`,
    "",
    hi ? "महोदय / महोदया," : "Sir / Madam,",
    "",
    opening,
    "",
    sectionsText(doc, true),
    "",
    doc.prayer,
    "",
    enclosures(doc.annexures, lang),
    "",
    hi ? "इस नोटिस की एक प्रति अभिलेख के लिए रखी गई है।" : "A copy of this notice is retained for record.",
    "",
    `${hi ? "हस्ताक्षर" : "Signature"}: ${BLANK}`,
    advocate ? `${hi ? "अधिवक्ता" : "Advocate"} ${advocate}` : a.name || BLANK,
  ];
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function consumerComplaint(doc: DraftDoc, b: CaseBundle): string {
  const { record } = b;
  const lang = doc.lang;
  const hi = lang === "hi";
  const a = record.applicant;
  const d = record.details;
  const state = STATE_PROFILES[record.state];
  const level = commissionFor(parseRupees(d.claimValue));
  const forum =
    level === "district"
      ? hi
        ? `ज़िला उपभोक्ता विवाद प्रतितोष आयोग, ${a.district || BLANK}, ${state.consumerStateHi}`
        : `THE DISTRICT CONSUMER DISPUTES REDRESSAL COMMISSION, ${(a.district || BLANK).toUpperCase()}, ${state.consumerState.toUpperCase()}`
      : hi
        ? `[${level === "state" ? "राज्य" : "राष्ट्रीय"} उपभोक्ता विवाद प्रतितोष आयोग]`
        : `[THE ${level.toUpperCase()} CONSUMER DISPUTES REDRESSAL COMMISSION]`;
  const complainant = `${a.name || BLANK}${a.relation ? `, ${a.relation}` : ""}, ${hi ? "निवासी" : "R/o"} ${addressLine(a, hi ? state.nameHi : state.name)}`;
  const opposite = `${d.opponent.trim() || BLANK}, ${d.opponentAddress.trim() || `[${hi ? "पता" : "address"}]`}`;
  const annex = doc.annexures.length ? doc.annexures : [hi ? "बिल / रसीद की प्रति" : "Copy of bill / receipt"];
  const place = a.district || a.village;
  const head = [hi ? `समक्ष ${forum}` : `BEFORE ${forum}`, `${hi ? "उपभोक्ता परिवाद संख्या" : "Consumer Complaint No."} ${BLANK} ${hi ? "वर्ष" : "of"} 20__`];
  const parties = [
    hi ? "मामले में:" : "IN THE MATTER OF:",
    `${complainant}  …${hi ? "परिवादी" : "Complainant"}`,
    hi ? "बनाम" : "VERSUS",
    `${opposite}  …${hi ? "विपक्षी" : "Opposite Party"}`,
  ];
  const index = [
    hi ? "अनुक्रमणिका" : "INDEX",
    `1. ${hi ? "पक्षकारों का विवरण" : "Memo of parties"}`,
    `2. ${hi ? "उपभोक्ता संरक्षण अधिनियम, 2019 की धारा 35 के अंतर्गत परिवाद" : "Complaint under Section 35 of the Consumer Protection Act, 2019"}`,
    `3. ${hi ? "समर्थन में शपथ पत्र" : "Affidavit in support"}`,
    `4. ${hi ? "दस्तावेज़ों की सूची और संलग्नक" : "List of documents and annexures"}`,
  ];
  const memo = [
    hi ? "पक्षकारों का विवरण" : "MEMO OF PARTIES",
    `${hi ? "परिवादी" : "Complainant"}: ${complainant}${a.mobile.trim() ? `, ${hi ? "मोबाइल" : "Mobile"} ${a.mobile.trim()}` : ""}${a.email.trim() ? `, ${hi ? "ईमेल" : "Email"} ${a.email.trim()}` : ""}`,
    `${hi ? "विपक्षी" : "Opposite Party"}: ${opposite}`,
  ];
  const complaint = [
    hi ? "उपभोक्ता संरक्षण अधिनियम, 2019 की धारा 35 के अंतर्गत परिवाद" : "COMPLAINT UNDER SECTION 35 OF THE CONSUMER PROTECTION ACT, 2019",
    hi ? "सविनय निवेदन है:" : "MOST RESPECTFULLY SHOWETH:",
    "",
    sectionsText(doc),
    "",
    hi ? "प्रार्थना" : "PRAYER",
    hi
      ? "अतः माननीय आयोग से सविनय प्रार्थना है कि विपक्षी को निर्देशित करें:"
      : "In the light of the above, the Complainant respectfully prays that this Hon'ble Commission may be pleased to direct the Opposite Party to:",
    doc.prayer,
    "",
    `${hi ? "परिवादी (स्वयं)" : "COMPLAINANT (in person)"}`,
    a.name || BLANK,
    "",
    hi ? "सत्यापन" : "VERIFICATION",
    hi
      ? `${place || BLANK} में दिनांक ${BLANK} को सत्यापित किया गया कि इस परिवाद की बातें मेरी जानकारी और विश्वास में सत्य और सही हैं और कोई महत्वपूर्ण तथ्य छिपाया नहीं गया है।`
      : `Verified at ${place || BLANK} on ${BLANK} that the contents of this complaint are true and correct to my knowledge and belief and nothing material has been concealed.`,
    `${hi ? "परिवादी" : "Complainant"}`,
  ];
  const affidavit = [
    hi ? "शपथ पत्र" : "AFFIDAVIT",
    hi
      ? `मैं, ${a.name || BLANK}${a.relation ? `, ${a.relation}` : ""}, आयु लगभग [आयु] वर्ष, निवासी ${addressLine(a, state.nameHi)}, शपथपूर्वक कथन करता/करती हूँ:`
      : `I, ${a.name || BLANK}${a.relation ? `, ${a.relation}` : ""}, aged about [age] years, resident of ${addressLine(a, state.name)}, do hereby solemnly affirm and state as under:`,
    hi
      ? "1. कि मैं उपरोक्त परिवाद में परिवादी हूँ और मामले के तथ्यों से भली-भाँति परिचित हूँ।"
      : "1. That I am the Complainant in the above complaint and am well conversant with the facts of the case.",
    hi
      ? "2. कि संलग्न परिवाद मेरे निर्देश पर तैयार किया गया है, मुझे मेरी भाषा में पढ़कर समझाया गया है, और उसकी बातें मेरी जानकारी में सत्य और सही हैं।"
      : "2. That the accompanying complaint has been drafted on my instructions, has been read over and explained to me in my language, and its contents are true and correct to my knowledge.",
    hi ? "3. कि संलग्नक अपने मूल की सत्य प्रतियाँ हैं।" : "3. That the annexures are true copies of their originals.",
    "",
    hi ? "अभिसाक्षी" : "DEPONENT",
    "",
    hi ? "सत्यापन" : "VERIFICATION",
    hi
      ? `${place || BLANK} में दिनांक ${BLANK} को सत्यापित किया गया कि इस शपथ पत्र की बातें मेरी जानकारी में सत्य और सही हैं।`
      : `Verified at ${place || BLANK} on ${BLANK} that the contents of this affidavit are true and correct to my knowledge.`,
    hi ? "अभिसाक्षी" : "DEPONENT",
  ];
  const docs = [
    hi ? "दस्तावेज़ों की सूची" : "LIST OF DOCUMENTS",
    ...annex.map((x, i) => (/^annexure|^संलग्नक/i.test(x) ? x : `Annexure C-${i + 1}: ${x}`)),
  ];
  const rule = "—".repeat(24);
  return [head.join("\n"), parties.join("\n"), index.join("\n"), memo.join("\n"), complaint.join("\n"), affidavit.join("\n"), docs.join("\n")]
    .join(`\n\n${rule}\n\n`)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The editable, printable text for a draft. */
export function assembleDraft(kind: DraftKind, doc: DraftDoc, b: CaseBundle): string {
  const step = stepOf(b, kind);
  switch (kind) {
    case "rti_application":
      return rtiApplication(doc, b, step);
    case "first_appeal":
      return firstAppeal(doc, b);
    case "second_appeal":
      return secondAppeal(doc, b);
    case "grievance":
    case "nch":
      return portalText(doc);
    case "legal_notice":
      return legalNotice(doc, b);
    case "consumer_complaint":
      return consumerComplaint(doc, b);
  }
}

export function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

export function countChars(text: string): number {
  return [...text].length;
}

/** Characters rtionline.gov.in will reject: anything outside basic Latin letters, digits and punctuation. */
export function nonAsciiCount(text: string): number {
  return [...text].filter((ch) => ch.charCodeAt(0) > 126).length;
}
