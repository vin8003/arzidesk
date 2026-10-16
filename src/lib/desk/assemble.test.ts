import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assembleDraft, countWords, nonAsciiCount } from "./assemble.ts";
import { bundle, record, step } from "./fixtures.ts";
import type { DraftDoc, DraftKind } from "./types.ts";

function doc(kind: DraftKind, over: Partial<DraftDoc> = {}): DraftDoc {
  return {
    kind,
    lang: "en",
    subject: "Status of PM-Kisan instalments",
    sections: [{ heading: "Reference", text: "Grievance GOVUP/E/2026/0001 dated 01-08-2026." }],
    points: ["Certified copy of file notings", "Name and designation of the officer"],
    prayer: "Please supply certified copies by post.",
    annexures: ["Copy of grievance acknowledgement"],
    filingNotes: ["Pay ₹10 by IPO"],
    warnings: [],
    model: "grok",
    generatedAt: "",
    ...over,
  };
}

describe("assembleDraft", () => {
  it("builds a postal RTI with the PIO address, fee line and signature from the case record", () => {
    const rec = record("rti");
    const text = assembleDraft("rti_application", doc("rti_application"), bundle(rec, [step("rti_application", { mode: "postal" })]));
    assert.match(text, /APPLICATION UNDER SECTION 6\(1\)/);
    assert.match(text, /Uttar Pradesh Right to Information Rules, 2015/);
    assert.match(text, /PIO, Office of the BDO, Sadar, Sitapur/);
    assert.match(text, /\(1\) Certified copy of file notings/);
    assert.match(text, /Fee: ₹10 paid by/);
    assert.match(text, /Mobile: 9000000001/);
    assert.doesNotMatch(text, /Pay ₹10 by IPO/, "filing notes stay off the printed page");
  });

  it("states the BPL exemption instead of a fee", () => {
    const rec = record("rti", { applicant: { ...record("rti").applicant, bpl: true, bplCard: "BPL-1" } });
    const text = assembleDraft("rti_application", doc("rti_application"), bundle(rec));
    assert.match(text, /no fee is payable under section 7\(5\)/);
    assert.match(text, /BPL-1/);
  });

  it("says no appeal fee for a BPL appellant where the appeal is free, and asks exemption where it is not", () => {
    const bpl = { ...record("rti").applicant, bpl: true, bplCard: "BPL-1" };
    const up = assembleDraft("first_appeal", doc("first_appeal"), bundle(record("rti", { applicant: bpl })));
    assert.match(up, /No fee is payable for this appeal/);
    assert.doesNotMatch(up, /section 7\(5\)/);
    const mp = assembleDraft("first_appeal", doc("first_appeal"), bundle(record("rti", { state: "MP", applicant: bpl })));
    assert.match(mp, /Fee: ₹50\. The appellant is below the poverty line and requests exemption/);
  });

  it("gives only the request text for rtionline.gov.in", () => {
    const rec = record("rti");
    const text = assembleDraft("rti_application", doc("rti_application"), bundle(rec, [step("rti_application", { mode: "central_online" })]));
    assert.doesNotMatch(text, /To,/);
    assert.match(text, /^Status of PM-Kisan instalments/);
    assert.equal(nonAsciiCount(text), 0);
  });

  it("writes a deemed-refusal first appeal when no reply came", () => {
    const rec = record("rti");
    const b = bundle(rec, [step("rti_application", { filedOn: "2026-08-01", reference: "RTI/1" })]);
    const text = assembleDraft("first_appeal", doc("first_appeal", { points: ["No reply within 30 days"] }), b);
    assert.match(text, /FIRST APPEAL UNDER SECTION 19\(1\)/);
    assert.match(text, /deemed refusal under section 7\(2\)/);
    assert.match(text, /31-08-2026/);
    assert.match(text, /\(A\) No reply within 30 days/);
  });

  it("assembles a consumer complaint file with parties, index, affidavit and annexures", () => {
    const rec = record("consumer", {
      state: "MP",
      details: { ...record("consumer").details, opponent: "Sample Seeds Pvt Ltd", opponentAddress: "Indore", claimValue: "1,80,000" },
    });
    const text = assembleDraft(
      "consumer_complaint",
      doc("consumer_complaint", { annexures: ["Bill dated 10-06-2026"], prayer: "(a) Refund ₹9,600" }),
      bundle(rec),
    );
    assert.match(text, /DISTRICT CONSUMER DISPUTES REDRESSAL COMMISSION, SITAPUR, MADHYA PRADESH/);
    assert.match(text, /VERSUS/);
    assert.match(text, /MEMO OF PARTIES/);
    assert.match(text, /AFFIDAVIT/);
    assert.match(text, /Annexure C-1: Bill dated 10-06-2026/);
    assert.match(text, /\(a\) Refund ₹9,600/);
  });

  it("signs a legal notice by the advocate when one is named", () => {
    const rec = record("consumer", { details: { ...record("consumer").details, advocate: "A. Sharma", opponent: "Shop" } });
    const text = assembleDraft("legal_notice", doc("legal_notice"), bundle(rec));
    assert.match(text, /Under instructions from and on behalf of my client, Ramesh Kumar/);
    assert.match(text, /Advocate A\. Sharma/);
  });

  it("counts words", () => {
    assert.equal(countWords("  one two\nthree "), 3);
  });
});
