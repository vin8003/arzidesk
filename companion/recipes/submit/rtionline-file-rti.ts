import type { JobResult } from "../../../src/lib/automation/types.ts";
import type { FieldSpec, Kit, Recipe } from "../types.ts";

/**
 * rtionline.gov.in → Submit Request, without a portal login.
 *
 * guidelines (operator ticks) → email check (+ OTP) → request form (filled
 * here, read back) → security code (operator) → Make Payment / Submit
 * (submit boundary) → payment (operator) → registration number.
 *
 * Checked 17 Oct 2026: guidelines.php?request posts CHECKBOX_1 to
 * request/request_email_check.php. The request form sits behind that tick and
 * was not inspected, so every control here is found by its label, phases are
 * detected rather than assumed, and the first live run's checkpoints become
 * the known-good shape. A page that does not match fails as drift before the
 * submit boundary, never after.
 */

type Payload = {
  ministry: string;
  publicAuthority: string;
  name: string;
  gender: string;
  address: string;
  pincode: string;
  country: string;
  state: string;
  area: string;
  literate: boolean;
  education: string;
  mobile: string;
  email: string;
  bpl: boolean;
  bplCardNo: string;
  bplYear: string;
  bplAuthority: string;
  lifeLiberty: boolean;
  text: string;
};

const ORIGIN = "https://rtionline.gov.in";

const F = {
  agree: { key: "agree", describe: "I have read and understood the guidelines", name: "CHECKBOX_1", label: [/read and understood/i], kinds: ["checkbox"] },
  email: { key: "email", describe: "Email ID", name: "Email", label: [/e-?mail/i], kinds: ["text"] },
  otp: { key: "otp", describe: "OTP", label: [/\botp\b|one\s*time\s*password/i], kinds: ["text"] },
  captcha: { key: "captcha", describe: "Security code", name: "6_letters_code", label: [/security\s*code|captcha/i], kinds: ["text"] },
  ministry: { key: "ministry", describe: "Ministry / Department", label: [/ministry|department|apex\s*body/i], kinds: ["select"] },
  authority: { key: "public_authority", describe: "Public Authority", label: [/public\s*authority/i], kinds: ["select"] },
  name: { key: "name", describe: "Name", label: [/^\W*name\b/i, /applicant'?s?\s*name/i], kinds: ["text"] },
  gender: { key: "gender", describe: "Gender", label: [/gender/i], kinds: ["radio", "select"] },
  address: { key: "address", describe: "Address", label: [/address/i], kinds: ["text", "textarea"] },
  pincode: { key: "pincode", describe: "Pincode", label: [/pin\s*code|pincode/i], kinds: ["text"] },
  country: { key: "country", describe: "Country", label: [/country/i], kinds: ["select", "radio"] },
  state: { key: "state", describe: "State", label: [/^\W*state\b/i], kinds: ["select"] },
  area: { key: "area", describe: "Status (Rural / Urban)", label: [/^\W*status\b/i, /rural|urban/i], kinds: ["radio", "select"] },
  eduStatus: { key: "edu_status", describe: "Educational Status", label: [/educational\s*status/i], kinds: ["radio", "select"] },
  eduDetail: { key: "edu_detail", describe: "Education (Below 12th / 12th Pass / Graduate / Above Graduate)", label: [/qualification/i, /educational?\b/i], kinds: ["select"] },
  mobile: { key: "mobile", describe: "Mobile Number", label: [/mobile/i], kinds: ["text"] },
  citizenship: { key: "citizenship", describe: "Citizenship", label: [/citizenship/i], kinds: ["select", "radio"] },
  bpl: { key: "bpl", describe: "Is the Requester Below Poverty Line?", label: [/below\s*poverty\s*line/i, /\bbpl\b(?!\s*card)/i], kinds: ["radio", "select"] },
  bplCard: { key: "bpl_card", describe: "BPL Card No.", label: [/bpl\s*card\s*(no|number)/i], kinds: ["text"] },
  bplYear: { key: "bpl_year", describe: "Year of Issue", label: [/year\s*of\s*issue/i], kinds: ["text", "select"] },
  bplAuthority: { key: "bpl_authority", describe: "Issuing Authority", label: [/issuing\s*authority/i], kinds: ["text"] },
  bplFile: { key: "bpl_file", describe: "Upload BPL Card", label: [/upload|bpl\s*card|attach/i], kinds: ["file"] },
  life: { key: "life_liberty", describe: "Does it concern the life or Liberty of a Person?", label: [/life\s*(or|and)\s*liberty/i], kinds: ["radio", "select"] },
  text: { key: "text", describe: "Text for RTI Request application", label: [/text\s*for\s*rti|request\s*(application\s*)?text|rti\s*request\s*application/i], kinds: ["textarea"] },
} satisfies Record<string, FieldSpec>;

type Phase = "guidelines" | "email" | "otp" | "form" | "receipt" | "pending" | "elsewhere" | "confirm" | "unknown";

/** The request form, recognised by more than one control so that one renamed label is drift, not a lost page. */
async function onForm(kit: Kit<Payload>): Promise<boolean> {
  if (await kit.has(F.text)) return true;
  return (await kit.has(F.ministry)) && (await kit.has(F.name)) && (await kit.has(F.pincode));
}

async function phase(kit: Kit<Payload>, home: string): Promise<Phase> {
  const url = new URL(kit.page.url());
  if (url.host !== home) return "elsewhere";
  const text = await kit.text();
  const form = await onForm(kit);
  if (kit.lib.findRtiRegistration(text) && !form) return "receipt";
  if (/registration number will be generated|after reconciliation|transaction (is )?(pending|failed)|payment (is )?(pending|failed)/i.test(text)) return "pending";
  if (form) return "form";
  if (await kit.has(F.otp)) return "otp";
  if (await kit.has(F.agree)) return "guidelines";
  if (await kit.has(F.email)) return "email";
  if (/make\s*payment|pay\s*now|payment\s*(mode|gateway|option)|amount\s*(payable|to be paid)/i.test(text)) return "confirm";
  return "unknown";
}

function badCode(text: string): boolean {
  return /(invalid|incorrect|wrong|mismatch|not match)[^\n]{0,40}(security|captcha|code)|(security|captcha)\s*code[^\n]{0,40}(invalid|incorrect|wrong|mismatch|not match)/i.test(text);
}

async function fillForm(kit: Kit<Payload>): Promise<Array<{ spec: FieldSpec; value: string }>> {
  const p = kit.payload;
  const check: Array<{ spec: FieldSpec; value: string }> = [];
  const ministry = await kit.pick(F.ministry, p.ministry, { publicValue: true, waitForOptions: true });
  check.push({ spec: F.ministry, value: ministry });
  if (await kit.has(F.authority)) {
    const pa = await kit.pick(F.authority, p.publicAuthority || p.ministry, { publicValue: true, waitForOptions: true });
    check.push({ spec: F.authority, value: pa });
  }
  await kit.fill(F.name, p.name);
  check.push({ spec: F.name, value: p.name });
  check.push({ spec: F.gender, value: await kit.pick(F.gender, p.gender) });
  await kit.fill(F.address, p.address);
  check.push({ spec: F.address, value: p.address });
  await kit.fill(F.pincode, p.pincode);
  check.push({ spec: F.pincode, value: p.pincode });
  if (await kit.has(F.country)) check.push({ spec: F.country, value: await kit.pick(F.country, p.country) });
  if (await kit.has(F.state)) check.push({ spec: F.state, value: await kit.pick(F.state, p.state, { publicValue: true, waitForOptions: true }) });
  if (await kit.has(F.area)) check.push({ spec: F.area, value: await kit.pick(F.area, p.area) });
  if (await kit.has(F.eduStatus)) check.push({ spec: F.eduStatus, value: await kit.pick(F.eduStatus, p.literate ? "Literate" : "Illiterate") });
  if (p.literate && p.education && (await kit.has(F.eduDetail))) check.push({ spec: F.eduDetail, value: await kit.pick(F.eduDetail, p.education) });
  if (p.mobile && (await kit.has(F.mobile))) {
    await kit.fill(F.mobile, p.mobile);
    check.push({ spec: F.mobile, value: p.mobile });
  }
  // The form usually carries the verified email over; type it only into an empty, editable box.
  if (await kit.has(F.email)) {
    const box = await kit.field(F.email);
    if ((await box.isEditable().catch(() => false)) && !(await box.inputValue().catch(() => ""))) await kit.fill(F.email, p.email);
  }
  if (await kit.has(F.citizenship)) await kit.pick(F.citizenship, "Indian").catch(() => "Indian");
  check.push({ spec: F.bpl, value: await kit.pick(F.bpl, p.bpl) });
  if (p.bpl) {
    await kit.fill(F.bplCard, p.bplCardNo);
    check.push({ spec: F.bplCard, value: p.bplCardNo });
    if (await kit.has({ ...F.bplYear, kinds: ["select"] })) await kit.pick({ ...F.bplYear, kinds: ["select"] }, p.bplYear);
    else await kit.fill(F.bplYear, p.bplYear);
    await kit.fill(F.bplAuthority, p.bplAuthority);
    await kit.gate("assist", "Attach the citizen's BPL card as a PDF (no spaces in the file name) in the upload box, then press Continue.", {
      field: "Upload BPL Card",
      until: async () => {
        if (!(await kit.has(F.bplFile))) return false;
        return (await kit.field(F.bplFile)).evaluate((el) => ((el as HTMLInputElement).files?.length ?? 0) > 0);
      },
    });
  }
  if (await kit.has(F.life)) check.push({ spec: F.life, value: await kit.pick(F.life, p.lifeLiberty) });
  await kit.fill(F.text, p.text);
  check.push({ spec: F.text, value: p.text });
  return check;
}

const recipe: Recipe<Payload> = {
  id: "rtionline.file_rti",
  version: 1,

  async canary(kit) {
    await kit.goto(`${ORIGIN}/guidelines.php?request`);
    await kit.checkpoint("guidelines");
  },

  async run(kit): Promise<JobResult> {
    const p = kit.payload;
    await kit.goto(`${ORIGIN}/guidelines.php?request`);
    const home = new URL(kit.page.url()).host;
    await kit.checkpoint("guidelines");
    const at = () => phase(kit, home);

    // 1. Terms: the operator reads and ticks, with the citizen.
    for (let i = 0; i < 3 && (await at()) === "guidelines"; i += 1) {
      await kit.gate("accept_terms", "Read the guidelines with the citizen. If they agree, tick “I have read and understood the above guidelines” and press Submit on the page.", {
        until: async () => (await at()) !== "guidelines",
      });
      await kit.settle();
    }
    if ((await at()) === "guidelines") kit.fail("human_timeout", "The guidelines were not accepted.");

    // 2. Email check, and its OTP.
    for (let attempt = 1; attempt <= 3 && (await at()) === "email"; attempt += 1) {
      if (attempt === 1) await kit.checkpoint("email_check");
      else await kit.warn(badCode(await kit.text()) ? "Security code not accepted; trying again." : "Still on the email check; trying again.");
      await kit.fill(F.email, p.email);
      if (await kit.has(F.captcha)) {
        await kit.gate("captcha", "Type the security code shown on the page, then press Continue.", {
          until: async () => ["otp", "form"].includes(await at()),
          onContinue: () => kit.click({ name: /submit|send\s*otp|get\s*otp|verify|proceed/i }),
        });
      } else {
        await kit.click({ name: /submit|send\s*otp|get\s*otp|verify|proceed/i });
      }
      await kit.settle();
    }
    if ((await at()) === "email") kit.fail("portal_rejected", "The email check did not go through three times.");
    if ((await at()) === "otp") {
      await kit.checkpoint("email_otp");
      await kit.gate("otp", "Ask the citizen for the OTP sent to their email, type it, then press Continue.", {
        until: async () => (await at()) === "form",
        onContinue: () => kit.click({ name: /submit|verify|proceed/i }),
      });
      await kit.settle();
    }
    const reached = await at();
    if (reached !== "form") kit.fail("drift", `Expected the request form after the email check, found "${reached}".`);

    // 3. The form, filled and read back.
    await kit.checkpoint("request_form");
    let check = await fillForm(kit);
    await kit.verify(check);
    await kit.screenshot("request-form-filled");

    // 4. Security code, then the irreversible click. A refused code means nothing was filed.
    const button = p.bpl ? { name: /^\s*submit\s*$/i } : { name: /make\s*payment|pay/i };
    let after: Phase = "form";
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      if (await kit.has(F.captcha)) {
        await kit.gate("captcha", "Check the filled form, type the security code at the bottom, then press Continue.");
      }
      after = await kit.submit(p.bpl ? "Submitting the RTI request" : "Going to payment", async () => {
        await kit.click(button);
        await kit.settle(1500);
        return at();
      });
      if (after !== "form") break;
      const text = await kit.text();
      if (!badCode(text) && attempt === 1) {
        // Back on the form without a code error: the portal rejected a field. Its message is the evidence.
        await kit.submitRejected("the form came back without a registration");
        kit.fail("portal_rejected", "The portal returned the form. Check the message on the page and the case facts.");
      }
      await kit.submitRejected("security code not accepted");
      if (attempt === 3) kit.fail("portal_rejected", "The security code was not accepted three times.");
      // Some portals clear the form with a wrong code; fill and check it again before retrying.
      const kept = (await kit.has(F.name)) ? await (await kit.field(F.name)).inputValue().catch(() => "") : "";
      if (!kept) {
        check = await fillForm(kit);
        await kit.verify(check);
      }
    }

    // 5. Payment, by the operator.
    if (!p.bpl && after !== "receipt") {
      await kit.gate("payment", "Pay the RTI fee on the payment page (net banking, card or UPI). Do not close this window; it carries on by itself.", {
        until: async () => ["receipt", "pending"].includes(await at()),
        timeoutMs: 25 * 60 * 1000,
      });
      await kit.settle(2000);
    }

    // 6. The registration number.
    await kit.waitFor(async () => ["receipt", "pending"].includes(await at()), 20_000);
    const text = await kit.text();
    const reg = kit.lib.findRtiRegistration(text);
    await kit.checkpoint("receipt");
    const shot = await kit.screenshot(reg ? "rti-receipt" : "after-payment", { receipt: Boolean(reg) });
    if (!reg) {
      kit.fail("after_submit_unknown", "No registration number on the page. The portal may still be reconciling the payment: do not pay again; run Payment reconciliation after 48 working hours.");
    }
    return { summary: "Filed on RTI Online", reference: reg!, filedOn: kit.today(), receiptArtifactId: shot ?? undefined };
  },
};

export default recipe;
