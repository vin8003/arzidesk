import type { JobResult } from "../../../src/lib/automation/types.ts";
import type { FieldSpec, Kit, Recipe } from "../types.ts";

/**
 * rtionline.gov.in → View Status. Registration number + email, the operator
 * types the security code, the citizen reads out the OTP, and the status
 * (and the reply, once disposed of) is read off the page.
 * Page shape checked 17 Oct 2026: request/status.php, fields registration_no,
 * Email, 6_letters_code; OTP goes to the email and mobile given at filing.
 */

type Payload = { registrationNo: string; email: string };

const ORIGIN = "https://rtionline.gov.in";

const REG: FieldSpec = { key: "registration_no", describe: "Registration number", name: "registration_no", label: [/registration\s*(number|no)/i], kinds: ["text"] };
const EMAIL: FieldSpec = { key: "email", describe: "Email ID", name: "Email", label: [/e-?mail/i], kinds: ["text"] };
const OTP: FieldSpec = { key: "otp", describe: "OTP", label: [/\botp\b|one\s*time\s*password/i], kinds: ["text"] };

type Phase = "form" | "otp" | "result" | "unknown";

async function phase(kit: Kit<Payload>): Promise<Phase> {
  if (await kit.has(OTP)) return "otp";
  // The result can sit under the form, so look for it first. A typed registration
  // number is an input value, not page text, so it cannot fake a result.
  const text = await kit.text();
  if (text.toUpperCase().includes(kit.payload.registrationNo) && kit.lib.parseRtiStatus(text).status) return "result";
  if (await kit.has(REG)) return "form";
  return "unknown";
}

async function rejected(kit: Kit<Payload>): Promise<boolean> {
  return /(invalid|incorrect|wrong|mismatch)[^\n]{0,40}(security|captcha|code|otp)|(security|captcha|code|otp)[^\n]{0,40}(invalid|incorrect|wrong|mismatch)/i.test(await kit.text());
}

const recipe: Recipe<Payload> = {
  id: "rtionline.status",
  version: 1,

  async canary(kit) {
    await kit.goto(`${ORIGIN}/request/status.php`);
    await kit.checkpoint("status_form");
  },

  async run(kit): Promise<JobResult> {
    const p = kit.payload;
    await kit.goto(`${ORIGIN}/request/status.php`);
    await kit.checkpoint("status_form");

    let at: Phase = "form";
    for (let attempt = 1; attempt <= 3 && at === "form"; attempt += 1) {
      await kit.fill(REG, p.registrationNo);
      await kit.fill(EMAIL, p.email);
      await kit.gate("captcha", "Type the security code shown on the page, then press Continue.", {
        until: async () => (await phase(kit)) !== "form",
        onContinue: () => kit.click({ value: "Submit" }),
      });
      await kit.settle();
      at = await phase(kit);
      if (at === "form") {
        if (attempt === 3) kit.fail("portal_rejected", "The portal did not accept the security code three times.");
        await kit.warn((await rejected(kit)) ? "Security code not accepted; trying again." : "Still on the form; trying again.");
      }
    }

    if (at === "otp") {
      await kit.checkpoint("status_otp");
      for (let attempt = 1; attempt <= 3 && at === "otp"; attempt += 1) {
        await kit.gate("otp", "Ask the citizen for the OTP sent to their email or mobile, type it, then press Continue.", {
          until: async () => (await phase(kit)) === "result",
          onContinue: () => kit.click({ name: /submit|verify|view/i }),
        });
        await kit.settle();
        at = await phase(kit);
        if (at === "otp" && attempt === 3) kit.fail("portal_rejected", "The OTP was not accepted three times.");
      }
    }

    await kit.checkpoint("status_result");
    const text = await kit.text();
    const s = kit.lib.parseRtiStatus(text);
    if (!s.status) kit.fail("drift", "The status page did not show a status line.");
    await kit.screenshot("rti-status");
    return {
      summary: `Status on RTI Online: ${s.status}`,
      portalStatus: s.status,
      replyText: s.replyText || undefined,
      replyOn: s.stage === "disposed" || s.stage === "rejected" ? (s.actionOn ?? undefined) : undefined,
    };
  },
};

export default recipe;
