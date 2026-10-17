import { stateName } from "../desk/states.ts";
import type { CaseBundle, CaseStep } from "../desk/types.ts";

/**
 * Case record → the exact values a portal's fields take. Built on the server
 * when a job is queued, so the companion never sees anything the portal does
 * not ask for. Pure: no I/O.
 */

export type Problem = {
  /** Which input is wrong: a case field or a job option. */
  field: string;
  en: string;
  hi: string;
  /** block: the job cannot start. warn: it can, but the operator should look. */
  severity: "block" | "warn";
};

export type Built<P> = { ok: true; payload: P; warnings: Problem[]; redact: string[] } | { ok: false; problems: Problem[] };

/**
 * rtionline.gov.in accepts only these in the request text (guidelines page,
 * checked 17 Oct 2026). Space and line breaks are kept.
 */
export const RTI_ONLINE_ALLOWED = /[A-Za-z0-9 ,.\-_()/@:&?\\%\n]/;
export const RTI_ONLINE_TEXT_LIMIT = 3000;

const SWAPS: Array<[RegExp, string, string]> = [
  [/\r\n?/g, "\n", "line ending"],
  [/[‘’ʼ']/g, "", "apostrophe"],
  [/[“”"`]/g, "", "quote mark"],
  [/[–—−]/g, "-", "dash"],
  [/…/g, "...", "ellipsis"],
  [/₹\s?/g, "Rs. ", "rupee sign"],
  [/;/g, ",", "semicolon"],
  [/!/g, ".", "exclamation mark"],
  [/#/g, "No. ", "hash"],
  [/\+/g, " and ", "plus sign"],
  [/[[{<]/g, "(", "bracket"],
  [/[\]}>]/g, ")", "bracket"],
  [/\|/g, "/", "pipe"],
  [/[~=]/g, "-", "symbol"],
  [/[*$^]/g, "", "symbol"],
  [/\t/g, " ", "tab"],
  [/\u00a0/g, " ", "non-breaking space"],
];

export type PortalText = {
  text: string;
  /** What was swapped, for the operator to see. */
  changes: string[];
  /** Characters still not allowed (Devanagari, emoji…). */
  rejected: string[];
};

/** Make text safe for rtionline's allowed set without changing its meaning more than needed. */
export function toRtiOnlineText(input: string): PortalText {
  let text = input;
  const changes = new Set<string>();
  for (const [re, to, what] of SWAPS) {
    const next = text.replace(re, to);
    if (next !== text && what !== "line ending") changes.add(what);
    text = next;
  }
  text = text
    .split("\n")
    .map((line) => line.replace(/ {2,}/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const rejected = new Set<string>();
  for (const ch of text) if (!RTI_ONLINE_ALLOWED.test(ch)) rejected.add(ch);
  return { text, changes: [...changes], rejected: [...rejected] };
}

const ASCII_NAME = /^[A-Za-z][A-Za-z .'-]*$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE = /^[6-9]\d{9}$/;
const PIN = /^[1-9]\d{5}$/;

/** RTI Online registration numbers, e.g. DOPAT/R/E/26/00123 (ministry code / R or A / E or P / year / serial). */
export const RTI_REG_NO = /\b[A-Z][A-Z0-9]{1,11}\/[RA]\/[A-Z]\/\d{2}\/\d{1,7}\b/;

export function cleanMobile(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits.slice(-10);
}

export type RtiOnlineOptions = {
  /** Ministry / Department as it should be picked in the first dropdown. */
  ministry?: string;
  /** Public authority within it, when the second dropdown applies. */
  publicAuthority?: string;
  /** Name and address in English letters, when the case holds them in Hindi. */
  name?: string;
  address?: string;
  /** Email the OTP and the reply go to; defaults to the citizen's. */
  email?: string;
  bplYear?: string;
  bplAuthority?: string;
};

export type RtiOnlinePayload = {
  ministry: string;
  publicAuthority: string;
  name: string;
  gender: "Male" | "Female" | "Third Gender";
  address: string;
  pincode: string;
  country: "India";
  state: string;
  area: "Rural" | "Urban";
  literate: boolean;
  /** Only when literate. */
  education: "" | "Below 12th" | "12th Pass" | "Graduate" | "Above Graduate";
  mobile: string;
  email: string;
  bpl: boolean;
  bplCardNo: string;
  bplYear: string;
  bplAuthority: string;
  lifeLiberty: boolean;
  text: string;
};

const GENDER_LABEL = { male: "Male", female: "Female", other: "Third Gender" } as const;
const EDU_LABEL = { below_12: "Below 12th", "12": "12th Pass", graduate: "Graduate", above_graduate: "Above Graduate" } as const;

function block(field: string, en: string, hi: string): Problem {
  return { field, en, hi, severity: "block" };
}
function warn(field: string, en: string, hi: string): Problem {
  return { field, en, hi, severity: "warn" };
}

function joinAddress(b: CaseBundle): string {
  const a = b.record.applicant;
  return [a.address, a.village, a.block, a.district].map((s) => s.trim()).filter(Boolean).join(", ");
}

/** Values long enough to identify someone; the companion strips these from uploaded DOM. */
function redactList(values: string[]): string[] {
  const out = new Set<string>();
  for (const v of values) {
    const s = v.trim();
    if (s.length >= 4) out.add(s);
    for (const line of s.split("\n")) if (line.trim().length >= 12) out.add(line.trim());
  }
  return [...out].sort((a, b) => b.length - a.length);
}

export function rtiOnlinePayload(bundle: CaseBundle, step: CaseStep | null, opts: RtiOnlineOptions = {}): Built<RtiOnlinePayload> {
  const { record } = bundle;
  const a = record.applicant;
  const problems: Problem[] = [];
  const warnings: Problem[] = [];

  if (record.details.authorityLevel !== "central") {
    problems.push(block("authorityLevel", "RTI Online takes central public authorities only. This case is for a state office.", "RTI ऑनलाइन केवल केंद्रीय कार्यालयों के लिए है। यह केस राज्य कार्यालय का है।"));
  }
  if (step?.filedOn) {
    problems.push(block("filedOn", "This step is already marked as filed.", "यह कदम पहले से दाखिल दर्ज है।"));
  }
  if (step && step.mode && step.mode !== "central_online") {
    problems.push(block("mode", "Set the filing route to RTI Online (central) and redraft first.", "पहले दाखिल करने का तरीका RTI ऑनलाइन (केंद्र) चुनें और ड्राफ्ट दोबारा बनाएँ।"));
  }

  const ministry = (opts.ministry ?? record.details.authority).trim();
  if (!ministry) problems.push(block("ministry", "Name the Ministry / Department to pick on the portal.", "पोर्टल पर चुनने के लिए मंत्रालय / विभाग लिखें।"));
  const publicAuthority = (opts.publicAuthority ?? "").trim();

  const name = (opts.name ?? a.name).trim();
  if (!name) problems.push(block("name", "The citizen's name is missing.", "नागरिक का नाम नहीं है।"));
  else if (!ASCII_NAME.test(name)) problems.push(block("name", "RTI Online needs the name in English letters. Type it in the job form.", "RTI ऑनलाइन के लिए नाम अंग्रेज़ी अक्षरों में चाहिए। जॉब फ़ॉर्म में लिखें।"));

  const addressRaw = (opts.address ?? joinAddress(bundle)).trim();
  const address = toRtiOnlineText(addressRaw.replace(/\n+/g, ", "));
  if (!address.text) problems.push(block("address", "The address is missing.", "पता नहीं है।"));
  else if (address.rejected.length) problems.push(block("address", "RTI Online needs the address in English letters. Type it in the job form.", "RTI ऑनलाइन के लिए पता अंग्रेज़ी अक्षरों में चाहिए। जॉब फ़ॉर्म में लिखें।"));

  const pincode = a.pincode.replace(/\s/g, "");
  if (!PIN.test(pincode)) problems.push(block("pincode", "A six-digit PIN code is needed.", "छह अंकों का पिन कोड चाहिए।"));

  if (!a.gender) problems.push(block("gender", "Set the citizen's gender in the case facts.", "केस के तथ्यों में लिंग चुनें।"));
  if (!a.area) problems.push(block("area", "Set rural or urban in the case facts.", "केस के तथ्यों में ग्रामीण / शहरी चुनें।"));
  if (!a.education) problems.push(block("education", "Set the citizen's education in the case facts.", "केस के तथ्यों में शिक्षा चुनें।"));

  const email = (opts.email ?? a.email).trim().toLowerCase();
  if (!EMAIL.test(email)) problems.push(block("email", "RTI Online sends an OTP and the reply to an email address. Add one.", "RTI ऑनलाइन OTP और जवाब ईमेल पर भेजता है। ईमेल जोड़ें।"));

  const mobile = a.mobile ? cleanMobile(a.mobile) : "";
  if (mobile && !MOBILE.test(mobile)) warnings.push(warn("mobile", "The mobile number does not look valid; it will be left empty on the portal.", "मोबाइल नंबर सही नहीं लगता; पोर्टल पर खाली छोड़ा जाएगा।"));

  const bplYear = (opts.bplYear ?? "").trim();
  const bplAuthority = toRtiOnlineText(opts.bplAuthority ?? "").text;
  if (a.bpl) {
    if (!a.bplCard.trim()) problems.push(block("bplCard", "A BPL applicant needs the BPL card number.", "BPL आवेदक के लिए BPL कार्ड संख्या चाहिए।"));
    if (!/^(19|20)\d{2}$/.test(bplYear)) problems.push(block("bplYear", "Enter the BPL card's year of issue.", "BPL कार्ड जारी होने का वर्ष लिखें।"));
    if (!bplAuthority) problems.push(block("bplAuthority", "Enter who issued the BPL card.", "BPL कार्ड किसने जारी किया, लिखें।"));
    warnings.push(warn("bplUpload", "You will be asked to attach the BPL card PDF in the portal window.", "पोर्टल विंडो में BPL कार्ड की PDF लगाने को कहा जाएगा।"));
  }

  const source = step?.docText ?? "";
  if (!source.trim()) problems.push(block("text", "Draft the RTI request text first.", "पहले RTI अनुरोध का ड्राफ्ट बनाएँ।"));
  const body = toRtiOnlineText(source);
  if (body.rejected.length) {
    problems.push(block("text", `The text has characters RTI Online rejects: ${body.rejected.slice(0, 8).join(" ")}. Edit the draft in English.`, `टेक्स्ट में ऐसे अक्षर हैं जो RTI ऑनलाइन नहीं लेता: ${body.rejected.slice(0, 8).join(" ")}। ड्राफ्ट अंग्रेज़ी में सुधारें।`));
  }
  if (body.text.length > RTI_ONLINE_TEXT_LIMIT) {
    problems.push(block("text", `The text is ${body.text.length} characters; RTI Online takes ${RTI_ONLINE_TEXT_LIMIT}. Shorten the draft.`, `टेक्स्ट ${body.text.length} अक्षर का है; RTI ऑनलाइन ${RTI_ONLINE_TEXT_LIMIT} तक लेता है। ड्राफ्ट छोटा करें।`));
  }
  if (body.changes.length) {
    warnings.push(warn("text", `Adjusted for the portal: ${body.changes.join(", ")}.`, `पोर्टल के लिए बदला गया: ${body.changes.join(", ")}।`));
  }

  if (problems.length) return { ok: false, problems: [...problems, ...warnings] };

  const payload: RtiOnlinePayload = {
    ministry,
    publicAuthority,
    name,
    gender: GENDER_LABEL[a.gender as keyof typeof GENDER_LABEL],
    address: address.text,
    pincode,
    country: "India",
    state: stateName(record.state, "en"),
    area: a.area === "urban" ? "Urban" : "Rural",
    literate: a.education !== "illiterate",
    education: a.education && a.education !== "illiterate" ? EDU_LABEL[a.education] : "",
    mobile: MOBILE.test(mobile) ? mobile : "",
    email,
    bpl: a.bpl,
    bplCardNo: a.bpl ? a.bplCard.trim() : "",
    bplYear: a.bpl ? bplYear : "",
    bplAuthority: a.bpl ? bplAuthority : "",
    lifeLiberty: record.details.lifeLiberty,
    text: body.text,
  };
  return {
    ok: true,
    payload,
    warnings,
    redact: redactList([payload.name, payload.address, payload.email, payload.mobile, payload.pincode, payload.bplCardNo, payload.text, a.name]),
  };
}

export type RtiStatusPayload = { registrationNo: string; email: string };

export function rtiStatusPayload(bundle: CaseBundle, step: CaseStep | null, opts: { email?: string } = {}): Built<RtiStatusPayload> {
  const problems: Problem[] = [];
  const reg = (step?.reference ?? "").trim().toUpperCase();
  if (!RTI_REG_NO.test(reg)) {
    problems.push(block("reference", "Record the RTI Online registration number (like DOPAT/R/E/26/00123) first.", "पहले RTI ऑनलाइन रजिस्ट्रेशन नंबर (जैसे DOPAT/R/E/26/00123) दर्ज करें।"));
  }
  const email = (opts.email ?? bundle.record.applicant.email).trim().toLowerCase();
  if (!EMAIL.test(email)) problems.push(block("email", "The email used when filing is needed.", "दाखिल करते समय दिया गया ईमेल चाहिए।"));
  if (problems.length) return { ok: false, problems };
  const registrationNo = RTI_REG_NO.exec(reg)![0];
  return { ok: true, payload: { registrationNo, email }, warnings: [], redact: redactList([email, registrationNo, bundle.record.applicant.name]) };
}

export type RtiReconcilePayload = { email: string; mobile: string; filedAfter: string };

export function rtiReconcilePayload(bundle: CaseBundle, opts: { email?: string; filedAfter: string }): Built<RtiReconcilePayload> {
  const email = (opts.email ?? bundle.record.applicant.email).trim().toLowerCase();
  if (!EMAIL.test(email)) return { ok: false, problems: [block("email", "The email used when filing is needed.", "दाखिल करते समय दिया गया ईमेल चाहिए।")] };
  const mobile = bundle.record.applicant.mobile ? cleanMobile(bundle.record.applicant.mobile) : "";
  return {
    ok: true,
    payload: { email, mobile: MOBILE.test(mobile) ? mobile : "", filedAfter: opts.filedAfter },
    warnings: [],
    redact: redactList([email, mobile, bundle.record.applicant.name]),
  };
}

export type PmKisanStatusPayload = { registrationNo: string };

/** PM-Kisan registration numbers: state code + digits, e.g. UP123456789 (portal max length 12). */
export const PMKISAN_REG_NO = /^[A-Z]{2}\d{8,10}$/;

export function pmKisanStatusPayload(bundle: CaseBundle): Built<PmKisanStatusPayload> {
  if (bundle.record.scheme !== "pmkisan") {
    return { ok: false, problems: [block("scheme", "Only PM-Kisan cases have this check.", "यह जाँच केवल पीएम-किसान केस के लिए है।")] };
  }
  const reg = bundle.record.details.beneficiaryId.replace(/\s/g, "").toUpperCase();
  if (!PMKISAN_REG_NO.test(reg)) {
    return {
      ok: false,
      problems: [block("beneficiaryId", "Add the PM-Kisan registration number (like UP123456789) in the case facts.", "केस के तथ्यों में पीएम-किसान रजिस्ट्रेशन नंबर (जैसे UP123456789) जोड़ें।")],
    };
  }
  return { ok: true, payload: { registrationNo: reg }, warnings: [], redact: redactList([reg, bundle.record.applicant.name]) };
}
