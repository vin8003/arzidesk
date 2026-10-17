import type { JobResult } from "../../../src/lib/automation/types.ts";
import type { FieldSpec, Kit, Recipe } from "../types.ts";

/**
 * rtionline.gov.in → Payment Reconciliation, for a filing whose result was
 * not seen after submitting. Lists the payments made from the email (and
 * mobile) and finds the registration number generated since the attempt.
 * Page shape checked 17 Oct 2026: request/status_pendingPayment.php,
 * fields Email, cell, 6_letters_code; OTP to the email.
 */

type Payload = { email: string; mobile: string; filedAfter: string };

const ORIGIN = "https://rtionline.gov.in";
const REG_ALL = /\b[A-Z][A-Z0-9]{1,11}\/[RA]\/[A-Z]\/\d{2}\/\d{1,7}\b/g;

const EMAIL: FieldSpec = { key: "email", describe: "Email ID used for filing", name: "Email", label: [/e-?mail/i], kinds: ["text"] };
const MOBILE: FieldSpec = { key: "mobile", describe: "Mobile number used for filing", name: "cell", label: [/mobile/i], kinds: ["text"] };
const OTP: FieldSpec = { key: "otp", describe: "OTP", label: [/\botp\b|one\s*time\s*password/i], kinds: ["text"] };

async function onForm(kit: Kit<Payload>): Promise<boolean> {
  return (await kit.has(EMAIL)) && (await kit.has({ key: "captcha", describe: "Security code", name: "6_letters_code", label: [/security\s*code/i] }));
}

const recipe: Recipe<Payload> = {
  id: "rtionline.reconcile",
  version: 1,

  async canary(kit) {
    await kit.goto(`${ORIGIN}/request/status_pendingPayment.php`);
    await kit.checkpoint("reconcile_form");
  },

  async run(kit): Promise<JobResult> {
    const p = kit.payload;
    await kit.goto(`${ORIGIN}/request/status_pendingPayment.php`);
    await kit.checkpoint("reconcile_form");
    await kit.fill(EMAIL, p.email);
    if (p.mobile) await kit.fill(MOBILE, p.mobile);
    await kit.gate("captcha", "Type the security code shown on the page, then press Continue.", {
      until: async () => !(await onForm(kit)),
      onContinue: () => kit.click({ value: "Submit" }),
    });
    await kit.settle();
    if (await kit.has(OTP)) {
      await kit.checkpoint("reconcile_otp");
      await kit.gate("otp", "Ask the citizen for the OTP sent to their email, type it, then press Continue.", {
        until: async () => !(await kit.has(OTP)),
        onContinue: () => kit.click({ name: /submit|verify|view/i }),
      });
      await kit.settle();
    }
    if (await onForm(kit)) kit.fail("portal_rejected", "The portal stayed on the form; the security code or OTP was not accepted.");

    await kit.checkpoint("reconcile_result");
    const text = (await kit.text()).toUpperCase();
    const found: Array<{ reg: string; on: string | null }> = [];
    for (const line of text.split("\n")) {
      for (const m of line.matchAll(REG_ALL)) found.push({ reg: m[0], on: kit.lib.isoFromIndian(line) });
    }
    const since = found.filter((f) => !f.on || f.on >= p.filedAfter);
    const unique = [...new Set(since.map((f) => f.reg))];
    await kit.screenshot("rti-reconciliation");
    if (unique.length === 1) {
      const hit = since.find((f) => f.reg === unique[0])!;
      return { summary: "Payment reconciled: registration number found", reference: unique[0], filedOn: hit.on ?? undefined };
    }
    if (!unique.length) {
      return { summary: `No registration number generated since ${p.filedAfter}. If money was deducted, wait 48 working hours and check again.` };
    }
    return { summary: `${unique.length} registrations found since ${p.filedAfter}; record the right one by hand.`, notes: unique.join(", ") };
  },
};

export default recipe;
