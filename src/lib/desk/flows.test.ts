import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FLOW_STEPS, nextAction, stepViews } from "./flows.ts";
import { record, step } from "./fixtures.ts";

const today = "2026-10-16";

function phases(rec: ReturnType<typeof record>, steps: ReturnType<typeof step>[]) {
  return stepViews(rec, steps, today).map((v) => `${v.kind}:${v.phase}`);
}

describe("money flow", () => {
  it("starts with the free public status check", () => {
    const rec = record("money");
    const action = nextAction(rec, stepViews(rec, [], today), today);
    assert.equal(action.code, "check_status");
    assert.deepEqual(FLOW_STEPS.money, ["status_check", "grievance", "rti_application", "first_appeal", "second_appeal"]);
  });

  it("stops at a citizen fix (eKYC) instead of a complaint", () => {
    const rec = record("money");
    const steps = [step("status_check", { status: "done", outcome: "ekyc_pending" })];
    assert.equal(phases(rec, steps)[0], "status_check:fix");
    assert.equal(nextAction(rec, stepViews(rec, steps, today), today).code, "fix");
  });

  it("closes when the money has come", () => {
    const rec = record("money");
    const steps = [step("status_check", { status: "done", outcome: "paid" })];
    assert.equal(nextAction(rec, stepViews(rec, steps, today), today).code, "close");
  });

  it("waits 30 days on a grievance, then opens the RTI to the block office", () => {
    const rec = record("money");
    const waiting = [step("status_check", { status: "done", outcome: "payment_failed" }), step("grievance", { filedOn: "2026-10-01", status: "filed" })];
    const w = nextAction(rec, stepViews(rec, waiting, today), today);
    assert.equal(w.code, "wait");
    assert.equal(w.on, "2026-10-31");

    const lapsed = [step("status_check", { status: "done", outcome: "payment_failed" }), step("grievance", { filedOn: "2026-09-01", status: "filed" })];
    const views = stepViews(rec, lapsed, today);
    assert.equal(views[1].phase, "lapsed");
    assert.equal(views[2].phase, "ready");
    const a = nextAction(rec, views, today);
    assert.equal(a.code, "draft");
    assert.equal(a.kind, "rti_application");
  });

  it("queues an automatic first appeal when the RTI reply deadline lapses", () => {
    const rec = record("money");
    const steps = [
      step("status_check", { status: "done", outcome: "payment_failed" }),
      step("grievance", { filedOn: "2026-07-01", status: "filed", outcome: "unresolved" }),
      step("rti_application", { filedOn: "2026-09-01", status: "filed" }),
    ];
    const views = stepViews(rec, steps, today);
    assert.equal(views[2].phase, "lapsed");
    assert.equal(views[3].lastDay, "2026-10-31");
    const a = nextAction(rec, views, today);
    assert.deepEqual([a.code, a.kind, a.autoAppeal, a.on, a.overdue], ["draft", "first_appeal", true, "2026-10-31", false]);
  });

  it("does not auto-appeal when the operator turned it off", () => {
    const rec = record("money", { autoAppeal: false });
    const steps = [
      step("status_check", { status: "done", outcome: "payment_failed" }),
      step("grievance", { filedOn: "2026-07-01", outcome: "unresolved" }),
      step("rti_application", { filedOn: "2026-09-01" }),
    ];
    assert.equal(nextAction(rec, stepViews(rec, steps, today), today).autoAppeal, false);
  });
});

describe("rti flow", () => {
  it("drafts, files, waits, then appeals a partial reply at once", () => {
    const rec = record("rti");
    assert.equal(nextAction(rec, stepViews(rec, [], today), today).kind, "rti_application");
    const drafted = [step("rti_application", { docText: "x", status: "drafted" })];
    assert.equal(nextAction(rec, stepViews(rec, drafted, today), today).code, "file");
    const partial = [step("rti_application", { filedOn: "2026-10-05", replyOn: "2026-10-12", outcome: "partial" })];
    const views = stepViews(rec, partial, today);
    assert.equal(views[0].phase, "escalate");
    assert.equal(views[1].lastDay, "2026-11-11");
  });

  it("closes on full information", () => {
    const rec = record("rti");
    const steps = [step("rti_application", { filedOn: "2026-10-05", outcome: "full" })];
    assert.equal(nextAction(rec, stepViews(rec, steps, today), today).code, "close");
  });

  it("flags a first appeal filed after its window as overdue", () => {
    const rec = record("rti");
    const steps = [step("rti_application", { filedOn: "2026-07-01" })];
    const a = nextAction(rec, stepViews(rec, steps, today), today);
    assert.equal(a.kind, "first_appeal");
    assert.equal(a.overdue, true);
  });
});

describe("consumer flow", () => {
  it("goes NCH → notice → complaint, with the two-year limit on the complaint", () => {
    const rec = record("consumer", { details: { ...record("consumer").details, causeOn: "2026-07-20" } });
    const steps = [
      step("nch", { filedOn: "2026-08-01", outcome: "unresolved" }),
      step("legal_notice", { filedOn: "2026-09-01", deliveredOn: "2026-09-03" }),
    ];
    const views = stepViews(rec, steps, today);
    assert.equal(views[1].dueOn, "2026-09-18");
    assert.equal(views[1].phase, "lapsed");
    assert.equal(views[2].lastDay, "2028-07-20");
    assert.equal(nextAction(rec, views, today).kind, "consumer_complaint");
  });

  it("lets the operator skip NCH", () => {
    const rec = record("consumer");
    const steps = [step("nch", { status: "skipped" })];
    assert.equal(nextAction(rec, stepViews(rec, steps, today), today).kind, "legal_notice");
  });

  it("reports nothing to do on a closed case", () => {
    const rec = record("consumer", { status: "closed" });
    assert.equal(nextAction(rec, stepViews(rec, [], today), today).code, "done");
  });
});
