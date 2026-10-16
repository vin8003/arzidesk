import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  checkoutSignature,
  orderCheckoutSignature,
  verifyCheckoutSignature,
  verifyOrderCheckoutSignature,
  verifyWebhookSignature,
  webhookSignature,
} from "./signatures.ts";

describe("razorpay signatures", () => {
  it("accepts a matching order Checkout HMAC (order_id|payment_id)", () => {
    const secret = "test_key_secret";
    const sig = orderCheckoutSignature("order_abc", "pay_xyz", secret);
    assert.equal(verifyOrderCheckoutSignature("order_abc", "pay_xyz", sig, secret), true);
    assert.equal(verifyOrderCheckoutSignature("order_other", "pay_xyz", sig, secret), false);
    assert.equal(verifyOrderCheckoutSignature("order_abc", "pay_xyz", sig, "other"), false);
    assert.equal(verifyOrderCheckoutSignature("", "pay_xyz", sig, secret), false);
  });

  it("accepts a matching subscription Checkout HMAC and rejects a flipped one", () => {
    const secret = "test_key_secret";
    const sig = checkoutSignature("pay_abc", "sub_xyz", secret);
    assert.equal(verifyCheckoutSignature("pay_abc", "sub_xyz", sig, secret), true);
    assert.equal(verifyCheckoutSignature("pay_abc", "sub_other", sig, secret), false);
    assert.equal(verifyCheckoutSignature("pay_abc", "sub_xyz", sig, "other"), false);
    assert.equal(verifyCheckoutSignature("", "sub_xyz", sig, secret), false);
  });

  it("accepts a matching webhook HMAC of the raw body", () => {
    const secret = "whsec_test";
    const body = '{"event":"payment.captured"}';
    const sig = webhookSignature(body, secret);
    assert.equal(verifyWebhookSignature(body, sig, secret), true);
    assert.equal(verifyWebhookSignature(body + " ", sig, secret), false);
    assert.equal(verifyWebhookSignature(body, "00" + sig.slice(2), secret), false);
  });
});
