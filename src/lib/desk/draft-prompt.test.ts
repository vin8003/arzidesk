import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pullJson } from "../ai/json.ts";
import { DEFAULT_FAST_MODEL } from "../ai/models.ts";
import {
  CENTRAL_ONLINE_CHAR_BUDGET,
  DRAFT_JSON_SCHEMA,
  DRAFT_SYSTEM,
  buildDraftUser,
  draftXaiBody,
  parseDraft,
} from "./draft-prompt.ts";
import { bundle, record, step } from "./fixtures.ts";

describe("draft prompt", () => {
  it("never sends contact details to the model", () => {
    const rec = record("rti", {
      applicant: { ...record("rti").applicant, mobile: "9876543210", email: "citizen@example.com", bpl: true, bplCard: "BPL-12345" },
    });
    const user = buildDraftUser("rti_application", bundle(rec));
    assert.doesNotMatch(user, /9876543210/);
    assert.doesNotMatch(user, /citizen@example\.com/);
    assert.doesNotMatch(user, /BPL-12345/);
    assert.match(user, /below the poverty line/);
    assert.match(user, /Ramesh Kumar/);
  });

  it("forbids invented facts and tools, and asks for JSON only", () => {
    assert.match(DRAFT_SYSTEM, /Never invent names, addresses, dates/);
    assert.match(DRAFT_SYSTEM, /first character of your reply must be \{/);
    assert.doesNotMatch(DRAFT_SYSTEM, /web_search/);
  });

  it("keeps a central online RTI in English and under the portal budget", () => {
    const rec = record("rti", { lang: "hi", details: { ...record("rti").details, authorityLevel: "central" } });
    const user = buildDraftUser("rti_application", bundle(rec, [step("rti_application", { mode: "central_online" })]));
    assert.match(user, /^Output language: English/);
    assert.match(user, new RegExp(`under ${CENTRAL_ONLINE_CHAR_BUDGET} characters`));
  });

  it("carries the UP word limit, the state fee and earlier filings into an RTI", () => {
    const rec = record("money", { lang: "en" });
    const b = bundle(rec, [
      step("status_check", { status: "done", outcome: "land_seeding" }),
      step("grievance", { filedOn: "2026-08-01", reference: "GOVUP/E/2026/0001" }),
    ]);
    const user = buildDraftUser("rti_application", b);
    assert.match(user, /500 words/);
    assert.match(user, /Uttar Pradesh Right to Information Rules, 2015/);
    assert.match(user, /GOVUP\/E\/2026\/0001/);
    assert.match(user, /Land seeding shows No/);
  });

  it("puts the reply text and the RTI points into a first appeal", () => {
    const rec = record("rti");
    const b = bundle(rec, [
      step("rti_application", {
        filedOn: "2026-08-01",
        replyOn: "2026-08-25",
        outcome: "partial",
        replyText: "Point 1: information not available.",
        doc: { kind: "rti_application", lang: "en", subject: "s", sections: [], points: ["Copy of the muster roll"], prayer: "", annexures: [], filingNotes: [], warnings: [], model: "m", generatedAt: "" },
      }),
    ]);
    const user = buildDraftUser("first_appeal", b);
    assert.match(user, /Point 1: information not available/);
    assert.match(user, /1\. Copy of the muster roll/);
    assert.match(user, /s\.19\(1\)/);
  });

  it("sends the same /v1/responses body shape as CiteBench, with a json_object legacy fallback", () => {
    const body = draftXaiBody("sys", "user", { model: "grok-x", maxOutputTokens: 100 });
    assert.equal(body.model, "grok-x");
    assert.equal(body.instructions, "sys");
    assert.equal(body.text.format.type, "json_schema");
    assert.equal(body.temperature, 0.2);
    const legacy = draftXaiBody("sys", "user", { model: "grok-x", maxOutputTokens: 100, legacy: true, repair: { previous: "bad" } });
    assert.equal(legacy.model, DEFAULT_FAST_MODEL);
    assert.equal(legacy.text.format.type, "json_object");
    assert.equal(legacy.input.length, 3);
    assert.deepEqual((DRAFT_JSON_SCHEMA as { required: string[] }).required, ["subject", "sections", "points", "prayer", "annexures", "filingNotes", "warnings"]);
  });

  it("parses lenient JSON and rejects an empty draft", () => {
    const parsed = parseDraft('```json\n{"subject":"S","sections":[{"heading":"H","text":"T"}],"points":["a",""],"prayer":"P"}\n```', pullJson);
    assert.deepEqual(parsed.points, ["a"]);
    assert.deepEqual(parsed.annexures, []);
    assert.throws(() => parseDraft('{"subject":"S","sections":[],"points":[]}', pullJson), /PARSE/);
  });
});
