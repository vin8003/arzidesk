import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "playwright";
import type { Gate } from "../../src/lib/automation/types.ts";
import { CAPTCHA, OTP } from "./mock-portal.ts";

/** Plays the kiosk operator against the mock portal: ticks, types codes, pays, attaches. */

const pdf = join(mkdtempSync(join(tmpdir(), "arzi-")), "bpl-card.pdf");
writeFileSync(pdf, "%PDF-1.4\n%test\n");

export function operator(opts: { wrongCaptchaFirst?: boolean } = {}) {
  let wrong = Boolean(opts.wrongCaptchaFirst);
  return async (gate: Gate, page: Page) => {
    const press = () => page.evaluate(() => (window as unknown as { __arzideskAction: (a: string) => void }).__arzideskAction("continue"));
    await page.waitForTimeout(150);
    switch (gate.kind) {
      case "accept_terms":
        await page.check('input[name="CHECKBOX_1"]');
        await page.click('input[type="submit"]');
        return;
      case "captcha": {
        const box = page.locator('input[name="6_letters_code"], #ContentPlaceHolder1_txtcaptcha').first();
        await box.fill(wrong ? "WRONG1" : CAPTCHA);
        wrong = false;
        await press();
        return;
      }
      case "otp":
        await page.fill('input[name="otp"]', OTP);
        await press();
        return;
      case "payment":
        await page.click("#pay");
        await page.waitForURL(/sbiepay/);
        await page.click("#paynow");
        return;
      case "assist":
        if (gate.field === "Upload BPL Card") await page.setInputFiles('input[name="bplfile"]', pdf);
        else if (/text|information/i.test(gate.field ?? "")) await page.fill("textarea#RTI_Text", gate.value ?? "");
        await press();
        return;
      default:
        await press();
    }
  };
}

