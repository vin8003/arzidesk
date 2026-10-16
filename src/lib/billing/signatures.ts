import { createHmac, timingSafeEqual } from "node:crypto";

function equalHex(expected: string, given: string): boolean {
  if (!expected || !given) return false;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(given, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Standard Checkout (Orders): HMAC_SHA256(order_id|payment_id, key_secret). */
export function orderCheckoutSignature(orderId: string, paymentId: string, keySecret: string): string {
  return createHmac("sha256", keySecret).update(`${orderId}|${paymentId}`).digest("hex");
}

export function verifyOrderCheckoutSignature(
  orderId: string,
  paymentId: string,
  signature: string,
  keySecret: string,
): boolean {
  if (!orderId || !paymentId || !signature || !keySecret) return false;
  return equalHex(orderCheckoutSignature(orderId, paymentId, keySecret), signature);
}

/** Subscription Checkout handler: HMAC_SHA256(payment_id|subscription_id, key_secret). */
export function checkoutSignature(paymentId: string, subscriptionId: string, keySecret: string): string {
  return createHmac("sha256", keySecret).update(`${paymentId}|${subscriptionId}`).digest("hex");
}

export function verifyCheckoutSignature(
  paymentId: string,
  subscriptionId: string,
  signature: string,
  keySecret: string,
): boolean {
  if (!paymentId || !subscriptionId || !signature || !keySecret) return false;
  return equalHex(checkoutSignature(paymentId, subscriptionId, keySecret), signature);
}

/** Webhook: HMAC_SHA256(raw body, webhook_secret) vs X-Razorpay-Signature. */
export function webhookSignature(rawBody: string, webhookSecret: string): string {
  return createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
}

export function verifyWebhookSignature(rawBody: string, signature: string, webhookSecret: string): boolean {
  if (!rawBody || !signature || !webhookSecret) return false;
  return equalHex(webhookSignature(rawBody, webhookSecret), signature);
}
