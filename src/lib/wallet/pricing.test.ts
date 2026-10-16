import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PRICES_INR,
  DEFAULT_WELCOME_INR,
  chargeFor,
  formatInr,
  inrToPaise,
  parsePriceList,
  parseTopup,
  parseWelcome,
} from "./pricing.ts";

describe("wallet pricing", () => {
  it("charges the first draft, frees the first redraft, charges again after", () => {
    assert.equal(chargeFor(25, 0), 25);
    assert.equal(chargeFor(25, 1), 0);
    assert.equal(chargeFor(25, 2), 25);
  });

  it("formats paise as rupees", () => {
    assert.equal(formatInr(2500), "₹25");
    assert.equal(formatInr(123456), "₹1,234.56");
    assert.equal(inrToPaise(99), 9900);
  });

  it("reads an admin price list, keeping defaults for bad or missing keys", () => {
    const prices = parsePriceList('{"rti_application": 30, "nch": -5, "legal_notice": "abc"}');
    assert.equal(prices.rti_application, 30);
    assert.equal(prices.nch, DEFAULT_PRICES_INR.nch);
    assert.equal(prices.legal_notice, DEFAULT_PRICES_INR.legal_notice);
    assert.deepEqual(parsePriceList("not json"), DEFAULT_PRICES_INR);
  });

  it("bounds top-ups and the welcome credit", () => {
    assert.equal(parseTopup(500), 500);
    assert.throws(() => parseTopup(99), /Minimum/);
    assert.throws(() => parseTopup(25_000), /Maximum/);
    assert.throws(() => parseTopup(100.5), /whole rupee/);
    assert.equal(parseWelcome(""), DEFAULT_WELCOME_INR);
    assert.equal(parseWelcome("0"), 0);
  });
});
