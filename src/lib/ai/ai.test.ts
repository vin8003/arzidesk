import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CONSUMER_CONTEXT, HINDI_RULE, RTI_CONTEXT, langRule, todayIst } from "./context.ts";
import { pullJson } from "./json.ts";
import {
  DEFAULT_FAST_MODEL,
  DEFAULT_RESEARCH_MODEL,
  fastModel,
  isReasoningModel,
  researchModel,
} from "./models.ts";
import { REPAIR_NOTE, sendWithFallback, withRepairRetry, withRepairTurn } from "./retry.ts";
import { chatJsonFormat, obj, str } from "./schema.ts";
import { XaiHttpError, collectFromOutput } from "./xai-response.ts";

const parseObj = (text: string) => {
  const value = pullJson(text) as { ok?: boolean };
  if (!value.ok) throw new Error("PARSE");
  return value;
};

describe("models", () => {
  it("defaults research to the reasoning variant and everything else to the fast one", () => {
    assert.equal(researchModel({}), DEFAULT_RESEARCH_MODEL);
    assert.equal(fastModel({}), DEFAULT_FAST_MODEL);
    assert.ok(isReasoningModel(DEFAULT_RESEARCH_MODEL));
    assert.ok(!isReasoningModel(DEFAULT_FAST_MODEL));
  });

  it("honours env overrides and ignores blanks", () => {
    assert.equal(researchModel({ XAI_MODEL_RESEARCH: " grok-x " }), "grok-x");
    assert.equal(fastModel({ XAI_MODEL_FAST: "  " }), DEFAULT_FAST_MODEL);
  });
});

describe("context", () => {
  it("dates in IST", () => {
    assert.equal(todayIst(new Date("2026-01-31T19:00:00Z")), "2026-02-01");
    assert.equal(todayIst(new Date("2026-01-31T18:00:00Z")), "2026-01-31");
  });

  it("has one Hindi rule and the RTI / consumer clocks", () => {
    assert.equal(langRule("hi"), HINDI_RULE);
    assert.match(langRule("en"), /English/);
    assert.match(RTI_CONTEXT, /s\.7\(1\)[\s\S]*30 days[\s\S]*s\.19\(1\)/);
    assert.match(RTI_CONTEXT, /Digital Personal Data Protection/);
    assert.match(CONSUMER_CONTEXT, /s\.69: two years/);
  });
});

describe("pullJson", () => {
  it("reads plain, fenced, prefixed and trailing-comma JSON", () => {
    assert.deepEqual(pullJson('{"a":1}'), { a: 1 });
    assert.deepEqual(pullJson('```json\n{"a":1}\n```'), { a: 1 });
    assert.deepEqual(pullJson('Here you go: {"a":[1,2,],}'), { a: [1, 2] });
  });

  it("throws PARSE on no object", () => {
    assert.throws(() => pullJson("sorry"), /PARSE/);
  });
});

describe("withRepairRetry", () => {
  it("retries once with repair only when parsing fails", async () => {
    const calls: boolean[] = [];
    const out = await withRepairRetry({
      call: async ({ repair }) => {
        calls.push(repair);
        return repair ? '{"ok":true}' : "not json";
      },
      parse: parseObj,
    });
    assert.deepEqual(calls, [false, true]);
    assert.equal(out.retried, true);
  });

  it("does not retry a timeout or HTTP error thrown by the call", async () => {
    let n = 0;
    await assert.rejects(
      withRepairRetry({
        call: async () => {
          n += 1;
          throw new Error("This operation was aborted");
        },
        parse: parseObj,
      }),
      /aborted/,
    );
    assert.equal(n, 1);
  });

  it("skips the retry when the time budget is nearly spent", async () => {
    let n = 0;
    await assert.rejects(
      withRepairRetry({
        call: async () => {
          n += 1;
          return "nope";
        },
        parse: parseObj,
        deadline: 1_000,
        minRetryMs: 500,
        now: () => 900,
      }),
      /PARSE/,
    );
    assert.equal(n, 1);
  });
});

describe("sendWithFallback", () => {
  it("resends the legacy body once when xAI rejects the request shape", async () => {
    const sent: Array<{ legacy: boolean }> = [];
    const out = await sendWithFallback({
      tag: "test",
      send: async (body) => {
        sent.push(body as { legacy: boolean });
        if (!(body as { legacy: boolean }).legacy) throw new XaiHttpError(400, "bad schema");
        return '{"ok":true}';
      },
      build: ({ legacy }) => ({ legacy }),
      parse: parseObj,
    });
    assert.deepEqual(sent, [{ legacy: false }, { legacy: true }]);
    assert.equal(out.legacy, true);
  });

  it("does not fall back on a 401 or 500", async () => {
    for (const status of [401, 500]) {
      let n = 0;
      await assert.rejects(
        sendWithFallback({
          tag: "test",
          send: async () => {
            n += 1;
            throw new XaiHttpError(status, "");
          },
          build: () => ({}),
          parse: parseObj,
        }),
        new RegExp(`xAI API error ${status}`),
      );
      assert.equal(n, 1);
    }
  });

  it("passes the previous reply to the repair attempt", async () => {
    const repairs: Array<string | undefined> = [];
    await sendWithFallback({
      tag: "test",
      send: async (body) => ((body as { repair?: string }).repair ? '{"ok":true}' : "half {"),
      build: ({ repair }) => {
        repairs.push(repair?.previous);
        return { repair: repair?.previous };
      },
      parse: parseObj,
    });
    assert.deepEqual(repairs, [undefined, "half {"]);
  });
});

describe("withRepairTurn", () => {
  it("appends the previous reply and the repair note", () => {
    const base = [{ role: "user", content: "x" }];
    assert.equal(withRepairTurn(base), base);
    const out = withRepairTurn(base, { previous: "bad" });
    assert.equal(out.length, 3);
    assert.equal(out[2].content, REPAIR_NOTE);
  });
});

describe("schema helpers", () => {
  it("builds strict chat response_format with every key required", () => {
    const format = chatJsonFormat("x", obj({ a: str(), b: str() }));
    assert.equal(format.type, "json_schema");
    assert.equal(format.json_schema.strict, true);
    assert.deepEqual((format.json_schema.schema as { required: string[] }).required, ["a", "b"]);
    assert.equal((format.json_schema.schema as { additionalProperties: boolean }).additionalProperties, false);
  });
});

describe("collectFromOutput", () => {
  it("does not double the text when output_text and message blocks are both present", () => {
    const out = collectFromOutput({
      output_text: '{"a":1}',
      output: [
        { type: "web_search_call", action: { query: "q1" } },
        { type: "message", content: [{ text: '{"a":1}', annotations: [{ url: "https://indiankanoon.org/doc/1/" }] }] },
      ],
    });
    assert.equal(out.text, '{"a":1}');
    assert.deepEqual(out.queries, ["q1"]);
    assert.deepEqual(out.urls, ["https://indiankanoon.org/doc/1/"]);
  });

  it("joins message blocks when output_text is absent", () => {
    const out = collectFromOutput({ output: [{ type: "message", content: [{ text: '{"a"' }, { text: ":1}" }] }] });
    assert.equal(out.text, '{"a":1}');
  });
});
