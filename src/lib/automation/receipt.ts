import { RTI_REG_NO } from "./payload.ts";

/**
 * Reading results off portal pages, from their visible text. Lenient on
 * layout, strict on what gets written back: anything not recognised for sure
 * is left for the operator.
 */

/** dd/mm/yyyy or dd-mm-yyyy (also with a month name) → YYYY-MM-DD. */
export function isoFromIndian(text: string): string | null {
  const months = "jan feb mar apr may jun jul aug sep oct nov dec".split(" ");
  let m = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/.exec(text);
  if (m) {
    const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  m = /\b(\d{1,2})[\s/-]([A-Za-z]{3})[A-Za-z]*[\s/-](\d{4})\b/.exec(text);
  if (m) {
    const mo = months.indexOf(m[2].toLowerCase()) + 1;
    if (mo) return `${m[3]}-${String(mo).padStart(2, "0")}-${String(Number(m[1])).padStart(2, "0")}`;
  }
  return null;
}

export function findRtiRegistration(text: string): string | null {
  const m = RTI_REG_NO.exec(text.toUpperCase());
  return m ? m[0] : null;
}

/** Text after a label on the same line or the next non-empty one. */
export function valueAfter(text: string, label: RegExp): string | null {
  const lines = text.split(/\n/).map((l) => l.trim());
  for (let i = 0; i < lines.length; i += 1) {
    const m = label.exec(lines[i]);
    if (!m) continue;
    const rest = lines[i].slice(m.index + m[0].length).replace(/^[\s:\-–]+/, "").trim();
    if (rest) return rest;
    for (let j = i + 1; j < lines.length; j += 1) if (lines[j]) return lines[j];
  }
  return null;
}

export type RtiStatus = {
  registrationNo: string | null;
  /** As the portal writes it, e.g. "REQUEST DISPOSED OF". */
  status: string;
  stage: "received" | "forwarded" | "transferred" | "disposed" | "rejected" | "fee_due" | "documents_due" | "unknown";
  actionOn: string | null;
  replyText: string;
};

export function parseRtiStatus(text: string): RtiStatus {
  const status = (valueAfter(text, /^(current\s+)?status\b/i) ?? "").replace(/\s+/g, " ").trim();
  const s = status.toUpperCase();
  const stage: RtiStatus["stage"] = /DISPOSED/.test(s)
    ? "disposed"
    : /REJECT/.test(s)
      ? "rejected"
      : /TRANSFER/.test(s)
        ? "transferred"
        : /ADDITIONAL FEE|FEE (REQUIRED|DUE)/.test(s)
          ? "fee_due"
          : /SUPPORTING DOCUMENT/.test(s)
            ? "documents_due"
            : /FORWARD|CPIO/.test(s)
              ? "forwarded"
              : /RECEIVED|REGISTERED/.test(s)
                ? "received"
                : "unknown";
  const actionOn = isoFromIndian(valueAfter(text, /date of (action|reply|disposal)/i) ?? "");
  const reply = valueAfter(text, /^(reply|remarks?|cpio reply)\b/i) ?? "";
  return {
    registrationNo: findRtiRegistration(text),
    status,
    stage,
    actionOn,
    replyText: stage === "disposed" || stage === "rejected" ? reply.slice(0, 12_000) : "",
  };
}

export type PmKisanStatus = {
  finding: "paid" | "ekyc_pending" | "aadhaar_bank" | "land_seeding" | "pending_approval" | "payment_failed" | "rejected" | "other";
  /** The lines that decided it, for the notes. */
  evidence: string[];
};

function flag(text: string, label: RegExp): "yes" | "no" | null {
  const raw = valueAfter(text, label);
  if (!raw) return null;
  const v = raw.replace(/^status\b[\s:\-–]*/i, "");
  if (/^(yes|y|done|completed|active|seeded|हाँ)/i.test(v)) return "yes";
  if (/^(no|n|pending|not|inactive|नहीं)/i.test(v)) return "no";
  return null;
}

export function parsePmKisanStatus(text: string): PmKisanStatus {
  const evidence: string[] = [];
  const note = (label: string, v: string | null) => {
    if (v) evidence.push(`${label}: ${v}`);
  };
  const ekyc = flag(text, /e-?kyc(\s+status)?/i);
  const land = flag(text, /land\s+seeding/i);
  const bank = flag(text, /aadhaar\s+(bank\s+)?(account\s+)?seeding|npci/i);
  note("eKYC", ekyc);
  note("Land seeding", land);
  note("Aadhaar-bank seeding", bank);

  const upper = text.toUpperCase();
  let finding: PmKisanStatus["finding"] = "other";
  if (/\b(REJECTED|INELIGIBLE|NOT ELIGIBLE)\b/.test(upper)) finding = "rejected";
  else if (ekyc === "no") finding = "ekyc_pending";
  else if (land === "no") finding = "land_seeding";
  else if (bank === "no") finding = "aadhaar_bank";
  else if (/PAYMENT\s+(FAILED|RETURNED|REJECTED)|TRANSACTION\s+FAILED/.test(upper)) finding = "payment_failed";
  else if (/PENDING\s+(FOR|AT)\s+(APPROVAL|STATE|DISTRICT)|WAITING FOR APPROVAL|RFT NOT SIGNED|FTO NOT PROCESSED/.test(upper)) finding = "pending_approval";
  else if (/PAYMENT\s+(SUCCESS|CREDITED)|CREDITED\s+(TO|IN)\s+(A\/C|ACCOUNT)/.test(upper)) finding = "paid";

  const last = /(\d{1,2})(st|nd|rd|th)?\s+installment[^\n]*/i.exec(text);
  if (last) evidence.push(last[0].trim().slice(0, 160));
  return { finding, evidence };
}
