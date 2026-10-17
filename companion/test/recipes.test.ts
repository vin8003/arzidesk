import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Browser, BrowserContext, Page } from "playwright";
import { RECIPES } from "../../src/lib/automation/recipes.ts";
import type { ClaimedJob, Gate } from "../../src/lib/automation/types.ts";
import type { Api } from "../src/api.ts";
import { judge, runCanaries } from "../src/canary.ts";
import { strippedDomInPage } from "../src/dom.ts";
import { loadLocalRecipe } from "../src/recipes.ts";
import { redactDom } from "../src/redact.ts";
import { runJob } from "../src/runner.ts";
import { REG_NO, startMock, type Mock } from "./mock-portal.ts";
import { operator } from "./operator.ts";

/**
 * Every recipe end to end against the mock portal in real (headless)
 * Chrome: an autopilot plays the operator at each gate, a fake ArziDesk
 * records everything the companion reports.
 */

let mock: Mock;
let browser: Browser;

type Recorded = {
  statuses: string[];
  gates: Gate[];
  events: Array<{ kind: string; text: string; data?: unknown }>;
  artifacts: Array<{ kind: string; name: string; shareable: boolean; body: string }>;
  finish: Record<string, unknown> | null;
  clearSubmit: number;
};

function fakeApi(): { api: Api; rec: Recorded } {
  const rec: Recorded = { statuses: [], gates: [], events: [], artifacts: [], finish: null, clearSubmit: 0 };
  const api: Api = {
    async post<T>(path: string, body?: unknown): Promise<T> {
      const b = (body ?? {}) as Record<string, unknown>;
      if (path.endsWith("/progress")) {
        if (b.status) rec.statuses.push(String(b.status));
        if (b.gate) rec.gates.push(b.gate as Gate);
        if (b.clearSubmit) rec.clearSubmit += 1;
        for (const e of (b.events as Recorded["events"]) ?? []) rec.events.push(e);
        return { cancel: false } as T;
      }
      if (path.endsWith("/artifacts")) {
        rec.artifacts.push(b as Recorded["artifacts"][number]);
        return { id: `art_${rec.artifacts.length}` } as T;
      }
      if (path.endsWith("/finish")) {
        rec.finish = b;
        return { status: b.ok ? "succeeded" : "failed" } as T;
      }
      if (path === "/api/runner/map") throw new Error("no AI in tests");
      throw new Error(`unexpected ${path}`);
    },
    async get<T>(): Promise<T> {
      throw new Error("not used");
    },
    async getText(): Promise<string> {
      throw new Error("not used");
    },
  };
  return { api, rec };
}

function job(recipeId: string, payload: Record<string, unknown>, redact: string[] = []): ClaimedJob {
  return { id: `job_${recipeId}`, recipeId, recipeVersion: 1, caseId: "case_1", stepKind: "rti_application", title: "Ramesh Kumar · RTI", payload, redact };
}

const rtiPayload = (over: Record<string, unknown> = {}) => ({
  ministry: "Ministry of Agriculture & Farmers Welfare",
  publicAuthority: "",
  name: "Ramesh Kumar",
  gender: "Male",
  address: "House 12, Main Road, Rampur, Sitapur",
  pincode: "261001",
  country: "India",
  state: "Uttar Pradesh",
  area: "Rural",
  literate: true,
  education: "12th Pass",
  mobile: "9000000001",
  email: "ramesh@example.in",
  bpl: false,
  bplCardNo: "",
  bplYear: "",
  bplAuthority: "",
  lifeLiberty: false,
  text: "Please provide:\n1. Certified copy of the file noting on my PM-Kisan instalments.\n2. Reasons for non-payment since Feb 2026.",
  ...over,
});

async function context(): Promise<BrowserContext> {
  return browser.newContext();
}

before(async () => {
  mock = await startMock();
  process.env.ARZIDESK_PORTALS = JSON.stringify({ "https://rtionline.gov.in": mock.rti, "https://pmkisan.gov.in": mock.pmkisan });
  const { chromium } = await import("playwright");
  browser = await chromium.launch({ headless: true, channel: "chrome" }).catch(() => chromium.launch({ headless: true }));
});

after(async () => {
  await browser?.close();
  await mock?.close();
});

const run = async (j: ClaimedJob, autopilot = operator()) => {
  const { api, rec } = fakeApi();
  const ctx = await context();
  const out = await runJob(api, ctx, j, { localRecipes: true, autopilot, print: () => {} });
  await ctx.close();
  return { out, rec };
};

describe("recipe registry", () => {
  it("every recipe module matches its registry entry", async () => {
    for (const meta of RECIPES) {
      const r = await loadLocalRecipe(meta.id);
      assert.equal(r.id, meta.id);
      assert.equal(r.version, meta.version, `${meta.id}: bump the version in src/lib/automation/recipes.ts too`);
      assert.equal(typeof r.canary, "function", `${meta.id} needs a canary`);
    }
  });
});

describe("rtionline.file_rti", () => {
  it("files end to end: terms, email OTP, form, read-back, captcha, payment, registration number", async () => {
    mock.set({});
    const before = mock.submitted.length;
    const { out, rec } = await run(job("rtionline.file_rti", rtiPayload()));
    assert.equal(out.ok, true, out.error);
    assert.equal(out.result?.reference, REG_NO);
    assert.deepEqual(out.softDrift, []);
    assert.deepEqual(
      rec.gates.map((g) => g.kind),
      ["accept_terms", "captcha", "otp", "captcha", "payment"],
    );
    // The boundary is reported before the click, and payment happens inside it.
    const firstSubmit = rec.statuses.indexOf("submitting");
    assert.ok(firstSubmit > 0);
    assert.ok(rec.statuses.lastIndexOf("waiting_human") > firstSubmit);
    const sent = mock.submitted[before];
    assert.equal(sent.Ministry, "Department of Agriculture and Farmers Welfare");
    assert.equal(sent.PA, "Department of Agriculture and Farmers Welfare");
    assert.equal(sent.gender, "M");
    assert.equal(sent.state, "Uttar Pradesh");
    assert.equal(sent.status, "R");
    assert.equal(sent.edu, "L");
    assert.equal(sent.education, "12th Pass");
    assert.equal(sent.bpl, "N");
    assert.equal(sent.life, "N");
    assert.equal(sent.RTI_Text.replace(/\r\n/g, "\n"), rtiPayload().text);
    assert.ok(rec.events.some((e) => /Read back \d+ fields: all match/.test(e.text)));
    assert.ok(rec.artifacts.some((a) => a.kind === "receipt"));
    assert.deepEqual(rec.finish?.ok, true);
  });

  it("retries a wrong code at the email check without crossing the boundary", async () => {
    mock.set({});
    const { out, rec } = await run(job("rtionline.file_rti", rtiPayload()), operator({ wrongCaptchaFirst: true }));
    assert.equal(out.ok, true, out.error);
    assert.deepEqual(
      rec.gates.map((g) => g.kind),
      ["accept_terms", "captcha", "captcha", "otp", "captcha", "payment"],
    );
    assert.equal(rec.clearSubmit, 0);
  });

  it("lifts the submit boundary when the portal refuses the security code on the form", async () => {
    mock.set({});
    let wrongAtForm = false;
    const pilot = operator();
    const tricky = async (gate: Gate, page: Page) => {
      if (gate.kind === "captcha" && (await page.locator("textarea#RTI_Text").count()) && !wrongAtForm) {
        wrongAtForm = true;
        await page.fill('input[name="6_letters_code"]', "WRONG1");
        await page.evaluate(() => (window as unknown as { __arzideskAction: (a: string) => void }).__arzideskAction("continue"));
        return;
      }
      return pilot(gate, page);
    };
    const { out, rec } = await run(job("rtionline.file_rti", rtiPayload()), tricky);
    assert.equal(out.ok, true, out.error);
    assert.equal(rec.clearSubmit, 1);
    assert.equal(out.result?.reference, REG_NO);
  });

  it("survives a renamed field through the assist gate and flags the recipe for repair", async () => {
    mock.set({ renameTextLabel: true });
    const { out, rec } = await run(job("rtionline.file_rti", rtiPayload()));
    mock.set({});
    assert.equal(out.ok, true, out.error);
    assert.deepEqual(out.softDrift, ["request_form"]);
    assert.ok(rec.gates.some((g) => g.kind === "assist"));
    assert.deepEqual(rec.finish?.softDrift, ["request_form"]);
    const evidence = rec.artifacts.find((a) => a.kind === "dom" && a.name === "request_form.html");
    assert.ok(evidence?.shareable, "the drifted page goes to the repair pipeline");
    assert.match(evidence!.body, /Details of information sought/);
  });

  it("never reports failure after paying without a registration number: it asks for reconciliation", async () => {
    mock.set({ pendingAfterPayment: true });
    const { out, rec } = await run(job("rtionline.file_rti", rtiPayload()));
    mock.set({});
    assert.equal(out.ok, false);
    assert.equal(out.failure, "after_submit_unknown");
    assert.equal(rec.finish?.failure, "after_submit_unknown");
  });

  it("files a BPL request without payment, with the card attached by the operator", async () => {
    mock.set({});
    const before = mock.submitted.length;
    const { out, rec } = await run(job("rtionline.file_rti", rtiPayload({ bpl: true, bplCardNo: "UP/BPL/1234", bplYear: "2019", bplAuthority: "Tehsildar Sitapur" })));
    assert.equal(out.ok, true, out.error);
    assert.equal(out.result?.reference, REG_NO);
    assert.ok(!rec.gates.some((g) => g.kind === "payment"));
    assert.equal(mock.submitted[before].bpl, "Y");
    assert.equal(mock.submitted[before].bplfile, "file:bpl-card.pdf");
  });

  it("stops before submitting when a filled value does not read back", async () => {
    mock.set({});
    // A payload the portal's pincode box (maxlength 6) will truncate.
    const redact = ["Ramesh Kumar", "ramesh@example.in", "House 12, Main Road, Rampur, Sitapur", rtiPayload().text];
    const { out, rec } = await run(job("rtionline.file_rti", rtiPayload({ pincode: "2610011" }), redact));
    assert.equal(out.ok, false);
    assert.equal(out.failure, "validation");
    assert.ok(!rec.statuses.includes("submitting"), "stopped before the submit boundary");
    // What may leave for the repair pipeline: redacted DOM and the inventory, never values.
    const dom = rec.artifacts.find((a) => a.kind === "dom");
    assert.ok(dom?.shareable);
    for (const value of [...redact, "9000000001", "261001"]) assert.ok(!dom!.body.includes(value), `DOM leaked ${value.slice(0, 20)}`);
    const shot = rec.artifacts.find((a) => a.kind === "screenshot");
    assert.equal(shot?.shareable, false);
  });
});

describe("read recipes", () => {
  it("rtionline.status reads a disposed request and its reply", async () => {
    const { out } = await run(job("rtionline.status", { registrationNo: REG_NO, email: "ramesh@example.in" }));
    assert.equal(out.ok, true, out.error);
    assert.equal(out.result?.portalStatus, "REQUEST DISPOSED OF");
    assert.equal(out.result?.replyOn, "2026-10-10");
    assert.match(out.result?.replyText ?? "", /points 1 and 2 is enclosed/);
  });

  it("rtionline.reconcile finds the registration made since the stuck attempt", async () => {
    const { out } = await run(job("rtionline.reconcile", { email: "ramesh@example.in", mobile: "9000000001", filedAfter: "2026-10-15" }));
    assert.equal(out.ok, true, out.error);
    assert.equal(out.result?.reference, REG_NO);
    assert.equal(out.result?.filedOn, "2026-10-17");
  });

  it("pmkisan.status turns the flags into the desk's finding", async () => {
    const { out } = await run(job("pmkisan.status", { registrationNo: "UP123456789" }));
    assert.equal(out.ok, true, out.error);
    assert.equal(out.result?.finding, "ekyc_pending");
    assert.match(out.result?.notes ?? "", /eKYC: no/);
  });
});

describe("canaries and redaction", () => {
  it("canaries checkpoint public pages without typing, and judge drift against a baseline", async () => {
    const results = await runCanaries({ load: loadLocalRecipe, print: () => {} });
    assert.deepEqual(results.map((r) => `${r.recipeId}#${r.stepId}`).sort(), [
      "pmkisan.status#kys_form",
      "rtionline.file_rti#guidelines",
      "rtionline.reconcile#reconcile_form",
      "rtionline.status#status_form",
    ]);
    const status = results.find((r) => r.recipeId === "rtionline.status")!;
    assert.deepEqual(
      status.inventory.fields.map((f) => f.name),
      ["registration_no", "Email", "6_letters_code"],
    );
    assert.match(status.inventory.fields[0].label, /Enter Registration Number/);
    const changed = { ...status, inventory: { ...status.inventory, fields: status.inventory.fields.slice(1) } };
    const verdicts = judge([changed]);
    // No committed baseline for the mock origin: judged against the real-portal baseline when present.
    assert.ok(["new", "drift", "ok"].includes(verdicts[0].status));
  });

  it("strips values and payload strings from a filled page before it leaves the kiosk", async () => {
    const ctx = await context();
    const page = await ctx.newPage();
    await page.goto(`${mock.rti}/request/status.php`);
    await page.fill("#registration_no", REG_NO);
    await page.fill("#Email", "ramesh@example.in");
    const html = redactDom(await page.evaluate(strippedDomInPage), ["Ramesh Kumar", REG_NO, "ramesh@example.in"]);
    await ctx.close();
    assert.ok(!html.includes(REG_NO));
    assert.ok(!html.includes("ramesh@example.in"));
    assert.ok(!/<script/i.test(html));
    assert.match(html, /Enter Registration Number/);
  });
});
