import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bundle, record, step } from "../desk/fixtures.ts";
import { emptyDetails } from "../desk/types.ts";
import { describeDiff, diffInventory, diffIsEmpty, fingerprint, fnv64 } from "./fingerprint.ts";
import { canMove, settleFailure, stepPatchFor } from "./jobs.ts";
import { pickOption, readMapping, readOptionPick, similarity } from "./match.ts";
import { pmKisanStatusPayload, rtiOnlinePayload, rtiStatusPayload, toRtiOnlineText, RTI_ONLINE_ALLOWED } from "./payload.ts";
import { RECIPES } from "./recipes.ts";
import { findRtiRegistration, isoFromIndian, parsePmKisanStatus, parseRtiStatus } from "./receipt.ts";
import type { FieldInfo } from "./types.ts";
import { compareReadback } from "./verify.ts";

const centralRti = () =>
  record("rti", {
    applicant: {
      ...record("rti").applicant,
      address: "House 12, Main Road",
      pincode: "261001",
      email: "Ramesh@Example.in",
      gender: "male",
      area: "rural",
      education: "12",
    },
    details: { ...emptyDetails(), authorityLevel: "central", authority: "Department of Agriculture and Farmers Welfare" },
  });

const draftText = "Please provide:\n1. Certified copy of the file noting on my PM-Kisan instalments (Reg. No. UP123456789).\n2. Reasons for non-payment since Feb 2026.";

describe("RTI Online text", () => {
  it("swaps characters the portal rejects and reports what changed", () => {
    const out = toRtiOnlineText("Applicant’s request; “urgent” – fee ₹10 paid! #3 [a]");
    assert.equal(out.rejected.length, 0);
    for (const ch of out.text) assert.ok(RTI_ONLINE_ALLOWED.test(ch), `kept bad char ${ch}`);
    assert.match(out.text, /Applicants request, urgent - fee Rs\. 10 paid\. No\. 3 \(a\)/);
    assert.ok(out.changes.includes("rupee sign"));
  });

  it("rejects Devanagari instead of mangling it", () => {
    const out = toRtiOnlineText("सूचना चाहिए");
    assert.ok(out.rejected.length > 0);
  });
});

describe("rtiOnlinePayload", () => {
  it("builds the portal payload from a complete central case", () => {
    const rec = centralRti();
    const st = step("rti_application", { mode: "central_online", docText: draftText, status: "drafted" });
    const res = rtiOnlinePayload(bundle(rec, [st]), st);
    assert.ok(res.ok, JSON.stringify(!res.ok && res.problems));
    if (!res.ok) return;
    assert.equal(res.payload.email, "ramesh@example.in");
    assert.equal(res.payload.gender, "Male");
    assert.equal(res.payload.state, "Uttar Pradesh");
    assert.equal(res.payload.education, "12th Pass");
    assert.equal(res.payload.literate, true);
    assert.equal(res.payload.mobile, "9000000001");
    assert.equal(res.payload.address, "House 12, Main Road, Rampur, Sitapur");
    assert.ok(res.redact.includes("ramesh@example.in"));
    assert.ok(res.redact.includes("Ramesh Kumar"));
  });

  it("blocks state authorities, missing facts and over-long text", () => {
    const rec = record("rti", { details: { ...emptyDetails(), authorityLevel: "state", authority: "BDO Sadar" } });
    const st = step("rti_application", { mode: "central_online", docText: "x".repeat(3100) });
    const res = rtiOnlinePayload(bundle(rec, [st]), st);
    assert.equal(res.ok, false);
    if (res.ok) return;
    const fields = res.problems.filter((p) => p.severity === "block").map((p) => p.field);
    for (const f of ["authorityLevel", "pincode", "gender", "area", "education", "email", "text"]) assert.ok(fields.includes(f), `expected ${f}`);
  });

  it("needs English letters for the name, and accepts an override", () => {
    const rec = centralRti();
    rec.applicant.name = "रमेश कुमार";
    const st = step("rti_application", { mode: "central_online", docText: draftText });
    assert.equal(rtiOnlinePayload(bundle(rec, [st]), st).ok, false);
    assert.equal(rtiOnlinePayload(bundle(rec, [st]), st, { name: "Ramesh Kumar" }).ok, true);
  });

  it("refuses a step that is already filed", () => {
    const rec = centralRti();
    const st = step("rti_application", { mode: "central_online", docText: draftText, filedOn: "2026-10-01" });
    const res = rtiOnlinePayload(bundle(rec, [st]), st);
    assert.equal(res.ok, false);
  });

  it("asks BPL applicants for card year and issuer", () => {
    const rec = centralRti();
    rec.applicant.bpl = true;
    rec.applicant.bplCard = "UP/BPL/1234";
    const st = step("rti_application", { mode: "central_online", docText: draftText });
    assert.equal(rtiOnlinePayload(bundle(rec, [st]), st).ok, false);
    const ok = rtiOnlinePayload(bundle(rec, [st]), st, { bplYear: "2019", bplAuthority: "Tehsildar, Sitapur" });
    assert.ok(ok.ok);
    if (ok.ok) assert.ok(ok.warnings.some((w) => w.field === "bplUpload"));
  });
});

describe("status payloads", () => {
  it("needs a real RTI Online registration number", () => {
    const rec = centralRti();
    assert.equal(rtiStatusPayload(bundle(rec), step("rti_application", { reference: "speed post 123" })).ok, false);
    const res = rtiStatusPayload(bundle(rec), step("rti_application", { reference: "dopat/r/e/26/00123" }));
    assert.ok(res.ok);
    if (res.ok) assert.equal(res.payload.registrationNo, "DOPAT/R/E/26/00123");
  });

  it("reads the PM-Kisan registration number from the case", () => {
    const rec = record("money", { details: { ...emptyDetails(), beneficiaryId: "up 123456789" } });
    const res = pmKisanStatusPayload(bundle(rec));
    assert.ok(res.ok);
    if (res.ok) assert.equal(res.payload.registrationNo, "UP123456789");
    assert.equal(pmKisanStatusPayload(bundle(record("money"))).ok, false);
  });
});

describe("job lifecycle", () => {
  it("never fails cleanly after the submit click", () => {
    assert.deepEqual(settleFailure({ submitStarted: true, failure: "drift" }), { status: "needs_reconcile", failure: "after_submit_unknown" });
    assert.deepEqual(settleFailure({ submitStarted: false, failure: "drift" }), { status: "failed", failure: "drift" });
    assert.deepEqual(settleFailure({ submitStarted: true, failure: "portal_rejected" }), { status: "failed", failure: "portal_rejected" });
    assert.equal(canMove("submitting", "failed"), false);
    assert.equal(canMove("submitting", "needs_reconcile"), true);
    assert.equal(canMove("succeeded", "running"), false);
    assert.equal(canMove("queued", "cancelled"), true);
  });

  it("writes the receipt to the step, and nothing without one", () => {
    assert.deepEqual(stepPatchFor("rtionline.file_rti", { summary: "", reference: "DOPAT/R/E/26/00123" }, "2026-10-17"), {
      filedOn: "2026-10-17",
      reference: "DOPAT/R/E/26/00123",
      mode: "central_online",
    });
    assert.equal(stepPatchFor("rtionline.file_rti", { summary: "" }, "2026-10-17"), null);
    assert.deepEqual(stepPatchFor("pmkisan.status", { summary: "", finding: "ekyc_pending", notes: "eKYC: no" }, "2026-10-17"), {
      status: "done",
      outcome: "ekyc_pending",
      notes: "eKYC: no",
    });
    assert.deepEqual(stepPatchFor("rtionline.status", { summary: "", replyOn: "2026-10-10", replyText: "Information enclosed" }, "x"), {
      replyText: "Information enclosed",
      replyOn: "2026-10-10",
    });
  });

  it("keeps registry kinds in step with their folders", () => {
    for (const r of RECIPES) assert.ok(r.file.startsWith(`${r.kind}/`), `${r.id} lives in ${r.file}`);
    assert.equal(new Set(RECIPES.map((r) => r.id)).size, RECIPES.length);
  });
});

const field = (over: Partial<FieldInfo>): FieldInfo => ({ key: "k", label: "", tag: "INPUT", type: "text", name: "", id: "", required: false, ...over });

describe("fingerprints", () => {
  const a = { fields: [field({ name: "registration_no", label: "* Enter Registration Number", required: true }), field({ name: "Email", label: "Enter Email Id" })] };

  it("ignores order, markup noise and hidden tokens", () => {
    const b = { fields: [a.fields[1], { ...a.fields[0], label: "*  Enter Registration Number :" }, field({ name: "__VIEWSTATE", type: "hidden" })] };
    assert.equal(fingerprint(a), fingerprint(b));
    assert.equal(fnv64("abc"), fnv64("abc"));
    assert.notEqual(fnv64("abc"), fnv64("abd"));
  });

  it("describes what moved", () => {
    const b = { fields: [{ ...a.fields[0], label: "Enter Request Number" }, field({ name: "cell", label: "Mobile Number" })] };
    const d = diffInventory(a, b);
    assert.equal(diffIsEmpty(d), false);
    assert.deepEqual(describeDiff(d).sort(), ['+ INPUT[cell] "Mobile Number"', '- INPUT[Email] "Enter Email Id"', "~ INPUT[registration_no] label"].sort());
  });
});

describe("read-back", () => {
  it("ignores case and whitespace, catches truncation", () => {
    assert.deepEqual(compareReadback({ name: "Ramesh Kumar" }, { name: "  RAMESH   KUMAR " }), []);
    const m = compareReadback({ text: "abc def" }, { text: "abc" });
    assert.equal(m.length, 1);
    assert.equal(compareReadback({ email: "a@b.in" }, {})[0].actual, "(missing)");
  });
});

describe("receipts and status pages", () => {
  it("finds registration numbers and dates", () => {
    assert.equal(findRtiRegistration("Your Registration Number is : MOAFW/R/E/26/01234 dated 17/10/2026"), "MOAFW/R/E/26/01234");
    assert.equal(findRtiRegistration("no number here"), null);
    assert.equal(isoFromIndian("17/10/2026"), "2026-10-17");
    assert.equal(isoFromIndian("5-Mar-2026"), "2026-03-05");
    assert.equal(isoFromIndian("31/13/2026"), null);
  });

  it("reads a disposed RTI status with its reply", () => {
    const page = [
      "Registration Number",
      "DOPAT/R/E/26/00123",
      "Status",
      "REQUEST DISPOSED OF",
      "Date of Action",
      "10/10/2026",
      "Reply",
      "The information sought is enclosed as annexure.",
    ].join("\n");
    const s = parseRtiStatus(page);
    assert.equal(s.stage, "disposed");
    assert.equal(s.actionOn, "2026-10-10");
    assert.equal(s.registrationNo, "DOPAT/R/E/26/00123");
    assert.match(s.replyText, /enclosed/);
    assert.equal(parseRtiStatus("Status : RTI REQUEST RECEIVED").stage, "received");
    assert.equal(parseRtiStatus("Status : RTI REQUEST RECEIVED").replyText, "");
  });

  it("turns PM-Kisan flags into the desk's findings", () => {
    assert.equal(parsePmKisanStatus("eKYC Status : No\nLand Seeding : Yes").finding, "ekyc_pending");
    assert.equal(parsePmKisanStatus("eKYC Status : Yes\nLand Seeding : No").finding, "land_seeding");
    assert.equal(parsePmKisanStatus("eKYC Status : Yes\nLand Seeding : Yes\nAadhaar Bank Account Seeding Status : No").finding, "aadhaar_bank");
    assert.equal(parsePmKisanStatus("eKYC: Yes\n20th Installment: Payment Success, credited to A/c").finding, "paid");
    assert.equal(parsePmKisanStatus("Eligibility: Ineligible").finding, "rejected");
    assert.equal(parsePmKisanStatus("nothing recognisable").finding, "other");
  });
});

describe("what a case is offered", () => {
  const draftStep = () => step("rti_application", { mode: "central_online", docText: draftText, status: "drafted" });

  it("offers filing on RTI Online for a central RTI, and nothing for a state one", async () => {
    const { offersFor } = await import("./offers.ts");
    const offers = offersFor(bundle(centralRti(), [draftStep()]), new Set());
    assert.deepEqual(offers.map((o) => [o.recipeId, o.ready]), [["rtionline.file_rti", true]]);
    const state = record("rti", { details: { ...emptyDetails(), authorityLevel: "state" } });
    assert.deepEqual(offersFor(bundle(state, [draftStep()]), new Set()), []);
  });

  it("swaps filing for status tracking once filed, and blocks a new filing while one is unreconciled", async () => {
    const { offersFor } = await import("./offers.ts");
    const filed = step("rti_application", { mode: "central_online", docText: draftText, filedOn: "2026-10-17", reference: "DOPAT/R/E/26/00042" });
    assert.deepEqual(offersFor(bundle(centralRti(), [filed]), new Set()).map((o) => o.recipeId), ["rtionline.status"]);
    const stuck = offersFor(bundle(centralRti(), [draftStep()]), new Set(["rti_application"]));
    assert.deepEqual(stuck.map((o) => [o.recipeId, o.ready]), [
      ["rtionline.file_rti", false],
      ["rtionline.reconcile", true],
    ]);
  });

  it("offers the PM-Kisan status check on PM-Kisan money cases only", async () => {
    const { offersFor } = await import("./offers.ts");
    const pm = record("money", { details: { ...emptyDetails(), beneficiaryId: "UP123456789" } });
    assert.deepEqual(offersFor(bundle(pm), new Set()).map((o) => [o.recipeId, o.stepKind, o.ready]), [["pmkisan.status", "status_check", true]]);
    assert.deepEqual(offersFor(bundle(record("money", { scheme: "mgnrega" })), new Set()), []);
  });
});

describe("matching", () => {
  const ministries = [
    "--Select--",
    "Department of Agriculture and Farmers Welfare",
    "Department of Agricultural Research and Education",
    "Ministry of Rural Development",
    "Department of Rural Development",
  ];

  it("picks the right office despite word order and connectors", () => {
    assert.equal(pickOption("Ministry of Agriculture & Farmers Welfare", ministries)?.option, "Department of Agriculture and Farmers Welfare");
    assert.equal(pickOption("Department of Agriculture and Farmers Welfare", ministries)?.score, 1);
  });

  it("refuses to guess between near-twins", () => {
    assert.equal(pickOption("Rural Development", ministries), null);
    assert.equal(pickOption("Railways", ministries), null);
    assert.ok(similarity("Farmers Welfare Agriculture", "Agriculture and Farmers Welfare") > 0.9);
  });

  it("only trusts model answers that name real controls and options", () => {
    const fields = [field({ key: "Email", name: "Email", label: "Email" })];
    const req = { recipeId: "x", keys: [{ key: "email", description: "applicant email" }], fields };
    assert.deepEqual(readMapping({ mapping: [{ key: "email", field: "Email", confidence: 0.9 }, { key: "evil", field: "Email", confidence: 1 }] }, req), {
      email: { field: "Email", confidence: 0.9 },
    });
    assert.deepEqual(readMapping({ mapping: [{ key: "email", field: "made_up", confidence: 2 }] }, req), { email: { field: null, confidence: 1 } });
    assert.deepEqual(readOptionPick({ option: "Nope", confidence: 0.9 }, { recipeId: "x", wanted: "a", options: ["A"] }), { option: null, confidence: 0.9 });
  });
});
