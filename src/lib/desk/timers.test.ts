import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  consumerLimitation,
  daysBetween,
  faaDecisionDue,
  firstAppealLastDay,
  grievanceFollowUp,
  noticeComplyBy,
  rtiReplyDue,
  secondAppealLastDay,
  todayIst,
} from "./timers.ts";

describe("RTI clocks", () => {
  it("gives the PIO 30 days, 35 via an APIO, 48 hours for life or liberty", () => {
    assert.equal(rtiReplyDue("2026-10-01"), "2026-10-31");
    assert.equal(rtiReplyDue("2026-10-01", { viaApio: true }), "2026-11-05");
    assert.equal(rtiReplyDue("2026-10-01", { lifeLiberty: true }), "2026-10-03");
    assert.equal(rtiReplyDue("not a date"), "");
  });

  it("opens the first appeal for 30 days from the reply, or from the missed deadline", () => {
    assert.equal(firstAppealLastDay("2026-10-31"), "2026-11-30");
    assert.equal(firstAppealLastDay("2026-10-31", "2026-10-20"), "2026-11-19");
  });

  it("gives the FAA 30 days and the second appeal 90", () => {
    assert.equal(faaDecisionDue("2026-11-10"), "2026-12-10");
    assert.equal(secondAppealLastDay("2026-12-10"), "2027-03-10");
    assert.equal(secondAppealLastDay("2026-12-10", "2026-12-01"), "2027-03-01");
  });
});

describe("other clocks", () => {
  it("follows up a grievance after 30 days", () => {
    assert.equal(grievanceFollowUp("2026-01-31"), "2026-03-02");
  });

  it("runs a notice 15 days from delivery, or sending + 5 days transit", () => {
    assert.equal(noticeComplyBy("2026-10-01", "2026-10-03"), "2026-10-18");
    assert.equal(noticeComplyBy("2026-10-01"), "2026-10-21");
  });

  it("limits a consumer complaint to two years", () => {
    assert.equal(consumerLimitation("2026-07-20"), "2028-07-20");
    assert.equal(consumerLimitation(""), "");
  });

  it("does day math across months and in IST", () => {
    assert.equal(addDays("2026-02-27", 2), "2026-03-01");
    assert.equal(daysBetween("2026-10-01", "2026-10-31"), 30);
    assert.equal(todayIst(new Date("2026-01-31T19:00:00Z")), "2026-02-01");
  });
});
