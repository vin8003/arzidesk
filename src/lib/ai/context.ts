/** Prompt fragments shared by every Grok call so each draft gets the same legal context. */

/** Today's date in India (YYYY-MM-DD), for deadlines and "within N days" arithmetic. */
export function todayIst(now: Date = new Date()): string {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

export function todayLine(now: Date = new Date()): string {
  return `Today's date (India): ${todayIst(now)}.`;
}

export const RTI_CONTEXT = `Right to Information Act, 2005 (as in force):
- s.6(1): request in writing in English, Hindi or the official language of the area, with the prescribed fee. s.6(2): no reason need be given and no personal details beyond contact.
- s.7(1): the PIO must reply within 30 days of receipt (48 hours where it concerns life or liberty); s.5(2) adds 5 days when filed with an Assistant PIO. s.7(2): no reply in time is a deemed refusal. s.7(5): no fee from a person below the poverty line. s.7(6): information is free of charge when the time limit is missed. s.7(8): a rejection must give reasons, the appeal period and the appellate authority.
- s.6(3): a request meant for another public authority must be transferred within 5 days.
- s.19(1): first appeal within 30 days of the deadline or the reply, to the officer senior to the PIO. s.19(6): decided within 30 days, 45 at most with reasons. s.19(3): second appeal to the Information Commission within 90 days. s.18: complaint to the Commission. s.20: penalty on the PIO up to ₹250 per day, ₹25,000 maximum.
- Since 13 November 2025, s.8(1)(j) (as amended by s.44(3) of the Digital Personal Data Protection Act, 2023) exempts personal information of third parties without a public-interest override. Ask for the applicant's OWN records, the status of their own file, reasons recorded, file notings, action taken and officials' names and designations — not other people's personal details.
- Good RTI questions ask for existing records ("copy of", "date on which", "name and designation of the officer"), one point each, numbered. Do not ask "why" or for opinions; ask for "the reasons recorded on file".`;

export const CONSUMER_CONTEXT = `Consumer Protection Act, 2019:
- s.2(7) consumer; s.2(11) deficiency in service; s.2(10) defect in goods; s.2(47) unfair trade practice.
- s.34: District Commission hears complaints up to ₹50 lakh (Jurisdiction Rules, 2021); it can be filed where the complainant resides or personally works for gain, or where the opposite party carries on business, or where the cause of action arose.
- s.35: complaint may be filed electronically (e-Jagriti). s.38: procedure. s.39: reliefs — repair, replacement, refund, compensation, punitive damages, costs. s.69: two years from the cause of action.
- Filing fee at the District Commission is nil up to ₹5 lakh.
- The National Consumer Helpline (1915, consumerhelpline.gov.in) is a free pre-litigation step; its docket number shows the trader was given a chance.
- A legal notice gives the opposite party a fixed time (usually 15 days) to refund or remedy before the complaint is filed.`;

export const MONEY_CONTEXT = `Stuck government payments:
- PM-Kisan: ₹6,000 a year in three instalments by direct benefit transfer; states verify land, Aadhaar and bank data before release.
- Mahatma Gandhi NREGA, 2005: s.3(3) wages within a fortnight of the work; Schedule II compensation for delay at 0.05% of unpaid wages per day beyond the sixteenth day after the muster roll closes.
- Pensions under NSAP (IGNOAPS / IGNWPS / IGNDPS) and state schemes are sanctioned and paid by the state social welfare machinery.
- A grievance asks the department to act; an RTI after 30 days asks for the records of what it did (or did not do) and who is responsible.`;

export const HINDI_RULE =
  "Output language: Hindi. Write formal official Hindi in Devanagari script, as used in applications to government offices. Keep Act names, section numbers, ID numbers, URLs and amounts in their original form.";

export const ENGLISH_RULE = "Output language: English (Indian official usage).";

export function langRule(lang: string): string {
  return lang === "hi" ? HINDI_RULE : ENGLISH_RULE;
}
