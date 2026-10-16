import { paymentsLive } from "./live";
import { verifyOrderCheckoutSignature, verifyWebhookSignature } from "./signatures";
import type { CheckoutSession } from "./types";
import { resolveDatabaseUrl } from "../../../scripts/database-url.mjs";

export { paymentsLive } from "./live";
export type { CheckoutSession } from "./types";

import { CURRENCY, parseOrderAmount } from "./amount";

export { CURRENCY, MIN_ORDER_PAISE, parseOrderAmount } from "./amount";

const API = "https://api.razorpay.com/v1";

export type TopupMode = "razorpay" | "preview" | "unset";

export type RazorpayOrder = {
  id: string;
  amount: number;
  currency: string;
  status?: string;
  notes?: Record<string, string> | null;
  receipt?: string | null;
};

export class RazorpayHttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "RazorpayHttpError";
    this.status = status;
  }
}

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

/**
 * preview  — local / live preview on PGLite, no keys: credit the wallet without charging.
 * razorpay — keys present: Checkout, wallet credited only after a verified payment.
 * unset    — real database without keys: refuse, so nobody gets free credit in production.
 */
export function topupMode(): TopupMode {
  if (paymentsLive()) return "razorpay";
  if (!resolveDatabaseUrl()) return "preview";
  return "unset";
}

function authHeader(): string {
  return `Basic ${Buffer.from(`${env("RAZORPAY_KEY_ID")}:${env("RAZORPAY_KEY_SECRET")}`).toString("base64")}`;
}

async function rzp<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as {
    error?: { description?: string; reason?: string };
  } & T;
  if (!res.ok) {
    const desc = json.error?.description || json.error?.reason || `Razorpay ${res.status}`;
    throw new RazorpayHttpError(res.status, desc);
  }
  return json as T;
}

export async function createOrder(opts: {
  amount: number;
  currency?: string;
  receipt?: string;
  notes?: Record<string, string>;
}): Promise<RazorpayOrder> {
  let amount: number;
  try {
    amount = parseOrderAmount(opts.amount);
  } catch (err) {
    throw new RazorpayHttpError(400, err instanceof Error ? err.message : "Invalid amount.");
  }
  const currency = (opts.currency || CURRENCY).trim() || CURRENCY;
  const receipt = (opts.receipt || `ad_${Date.now()}`).slice(0, 40);
  return rzp<RazorpayOrder>("POST", "/orders", {
    amount,
    currency,
    receipt,
    notes: opts.notes ?? {},
  });
}

export async function createTopupCheckout(opts: {
  userId: string;
  name: string;
  email: string;
  amountPaise: number;
}): Promise<CheckoutSession> {
  const keyId = env("RAZORPAY_KEY_ID");
  if (!keyId) throw new Error("Payment account is not connected.");
  const order = await createOrder({
    amount: opts.amountPaise,
    currency: CURRENCY,
    receipt: `ad_${opts.userId.replace(/[^a-zA-Z0-9]/g, "").slice(-12)}_${Date.now()}`.slice(0, 40),
    notes: { user_id: opts.userId, purpose: "wallet_topup" },
  });
  return {
    keyId,
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    name: "ArziDesk",
    description: `Wallet top-up · ₹${(order.amount / 100).toLocaleString("en-IN")}`,
    prefillName: opts.name,
    prefillEmail: opts.email,
  };
}

export async function fetchOrder(id: string): Promise<RazorpayOrder> {
  return rzp<RazorpayOrder>("GET", `/orders/${id}`);
}

export function assertOrderCheckout(orderId: string, paymentId: string, signature: string): boolean {
  return verifyOrderCheckoutSignature(orderId, paymentId, signature, env("RAZORPAY_KEY_SECRET"));
}

export function assertWebhook(rawBody: string, signature: string): boolean {
  return verifyWebhookSignature(rawBody, signature, env("RAZORPAY_WEBHOOK_SECRET"));
}
