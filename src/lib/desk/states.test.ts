import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CENTRAL_RTI, STATE_PROFILES, commissionFor, districtFilingFee, parseRupees, rtiRulesFor } from "./states.ts";
import { STATES } from "./types.ts";

describe("state profiles", () => {
  it("covers UP, Rajasthan, MP and Delhi with a fee, a grievance portal and a commission", () => {
    assert.deepEqual([...STATES], ["UP", "RJ", "MP", "DL"]);
    for (const code of STATES) {
      const p = STATE_PROFILES[code];
      assert.ok(p.rti.fee > 0, code);
      assert.match(p.grievance.url, /^https:\/\//, code);
      assert.ok(p.rti.commission, code);
    }
    assert.match(STATE_PROFILES.DL.rti.commission, /Central Information Commission/);
  });

  it("uses central rules for a central authority", () => {
    assert.equal(rtiRulesFor("MP", "central"), CENTRAL_RTI);
    assert.equal(rtiRulesFor("MP", "state").firstAppealFee, 50);
  });

  it("reads rupee amounts and picks the commission and fee", () => {
    assert.equal(parseRupees("₹1,80,000"), 180000);
    assert.equal(parseRupees("2.5 lakh"), 250000);
    assert.equal(parseRupees("1 crore"), 10000000);
    assert.ok(Number.isNaN(parseRupees("")));
    assert.equal(commissionFor(4_00_000), "district");
    assert.equal(commissionFor(60_00_000), "state");
    assert.equal(commissionFor(3_00_00_000), "national");
    assert.equal(districtFilingFee(5_00_000), 0);
    assert.equal(districtFilingFee(7_00_000), 200);
  });
});
