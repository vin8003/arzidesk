import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MIN_ORDER_PAISE, parseOrderAmount } from "./amount.ts";

describe("create-order amount", () => {
  it("accepts whole paise from 100 up and rejects below", () => {
    assert.equal(parseOrderAmount(50000), 50000);
    assert.equal(parseOrderAmount("25000"), 25000);
    assert.equal(MIN_ORDER_PAISE, 100);
    assert.throws(() => parseOrderAmount(99), /100 paise/);
    assert.throws(() => parseOrderAmount("nope"), /100 paise/);
  });
});
