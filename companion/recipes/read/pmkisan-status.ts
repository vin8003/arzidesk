import type { JobResult } from "../../../src/lib/automation/types.ts";
import type { FieldSpec, Kit, Recipe } from "../types.ts";

/**
 * pmkisan.gov.in → Know Your Status. Registration number, the operator types
 * the captcha, the farmer reads out the OTP from the registered mobile, and
 * the eKYC / land seeding / bank seeding flags become the desk's finding.
 * Page shape checked 17 Oct 2026: BeneficiaryStatus_New.aspx,
 * ContentPlaceHolder1_txtBox (max 12), ContentPlaceHolder1_txtcaptcha, "Get OTP".
 */

type Payload = { registrationNo: string };

const ORIGIN = "https://pmkisan.gov.in";

const REG: FieldSpec = { key: "registration_no", describe: "Registration number", id: "ContentPlaceHolder1_txtBox", label: [/registration\s*(no|number)/i], kinds: ["text"] };
const CAPTCHA: FieldSpec = { key: "captcha", describe: "Captcha code", id: "ContentPlaceHolder1_txtcaptcha", label: [/captcha/i], kinds: ["text"] };
const OTP: FieldSpec = { key: "otp", describe: "OTP", label: [/\botp\b/i], kinds: ["text"] };

const RESULT = /e-?kyc|land\s+seeding|installment|instalment|beneficiary\s+name/i;

async function hasResult(kit: Kit<Payload>): Promise<boolean> {
  if (await kit.has(OTP)) return false;
  return RESULT.test(await kit.text());
}

const recipe: Recipe<Payload> = {
  id: "pmkisan.status",
  version: 1,

  async canary(kit) {
    await kit.goto(`${ORIGIN}/BeneficiaryStatus_New.aspx`);
    await kit.checkpoint("kys_form");
  },

  async run(kit): Promise<JobResult> {
    await kit.goto(`${ORIGIN}/BeneficiaryStatus_New.aspx`);
    await kit.checkpoint("kys_form");
    await kit.fill(REG, kit.payload.registrationNo);
    if (!(await kit.has(CAPTCHA))) kit.fail("drift", "No captcha box next to the registration number.");
    await kit.gate("captcha", "Type the captcha code shown on the page, then press Continue.", {
      until: async () => (await kit.has(OTP)) || (await hasResult(kit)),
      onContinue: () => kit.click({ value: /get\s*otp/i }),
    });
    await kit.settle();

    if (await kit.has(OTP)) {
      await kit.checkpoint("kys_otp");
      await kit.gate("otp", "Ask the farmer for the OTP sent to their registered mobile, type it, then press Continue.", {
        until: () => hasResult(kit),
        onContinue: () => kit.click({ name: /verify|submit|get\s*data|get\s*details/i }),
      });
      await kit.settle(1500);
    }
    if (!(await hasResult(kit))) kit.fail("portal_rejected", "The status did not appear; the captcha or OTP may have been wrong.");

    await kit.checkpoint("kys_result");
    const parsed = kit.lib.parsePmKisanStatus(await kit.text());
    await kit.screenshot("pmkisan-status");
    if (parsed.finding === "other") {
      return { summary: "Status opened, but it did not match a known finding. Record it from the screenshot.", notes: parsed.evidence.join("; ") };
    }
    return {
      summary: `PM-Kisan status read: ${parsed.finding.replace(/_/g, " ")}`,
      finding: parsed.finding,
      portalStatus: parsed.finding,
      notes: parsed.evidence.join("; "),
    };
  },
};

export default recipe;
