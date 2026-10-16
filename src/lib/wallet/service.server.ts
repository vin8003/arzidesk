import { getSql } from "@/lib/db";
import type { WalletSnapshot } from "./pricing";

/** Server-only wallet reads and payment crediting. Imported lazily from server-function handlers. */

export async function readWallet(userId: string): Promise<WalletSnapshot> {
  const { ensureWallet, readPrices, readWelcomeInr, recentLedger } = await import("./ledger.server");
  const { paymentsLive, topupMode } = await import("@/lib/billing/razorpay.server");
  const balancePaise = await ensureWallet(userId);
  const [prices, welcomeInr, recent] = await Promise.all([readPrices(), readWelcomeInr(), recentLedger(userId, 30)]);
  return {
    balancePaise,
    prices,
    welcomeInr,
    paymentsLive: paymentsLive(),
    topupMode: topupMode(),
    recent,
  };
}

export async function accountOf(userId: string): Promise<{ name: string; email: string }> {
  const sql = await getSql();
  const rows = await sql<{ name: string | null; email: string | null }>`
    select name, email from "user" where id = ${userId} limit 1
  `;
  const email = rows[0]?.email?.trim() || "";
  return {
    name: rows[0]?.name?.trim() || "Operator",
    email: email.endsWith("@arzidesk.app") ? "" : email,
  };
}

/** Verify a Checkout result and credit the wallet. The browser is never trusted with the amount. */
export async function creditVerifiedPayment(opts: {
  userId: string;
  paymentId: string;
  orderId: string;
  signature: string;
}): Promise<WalletSnapshot> {
  const { assertOrderCheckout, fetchOrder, RazorpayHttpError } = await import("@/lib/billing/razorpay.server");
  const { creditTopup, orderOwner } = await import("./ledger.server");
  if (!opts.orderId || !opts.paymentId || !opts.signature) {
    throw new RazorpayHttpError(400, "Missing payment fields.");
  }
  if (!assertOrderCheckout(opts.orderId, opts.paymentId, opts.signature)) {
    throw new RazorpayHttpError(400, "Payment signature did not match.");
  }
  const owner = await orderOwner(opts.orderId);
  if (!owner || owner.userId !== opts.userId) {
    throw new RazorpayHttpError(400, "Payment does not belong to this account.");
  }
  const order = await fetchOrder(opts.orderId);
  if (Number(order.amount) !== owner.amountPaise) {
    throw new RazorpayHttpError(400, "Payment amount does not match the order.");
  }
  await creditTopup({ userId: opts.userId, amountPaise: owner.amountPaise, paymentId: opts.paymentId, orderId: opts.orderId });
  return readWallet(opts.userId);
}

type RazorpayPaymentEntity = {
  id?: string;
  order_id?: string;
  amount?: number;
  status?: string;
};

export type RazorpayEvent = {
  event?: string;
  payload?: {
    payment?: { entity?: RazorpayPaymentEntity };
    order?: { entity?: { id?: string; amount?: number } };
  };
};

/**
 * Webhook backstop: if the browser closed before /api/verify-payment ran, a
 * `payment.captured` or `order.paid` event still credits the wallet once.
 */
export async function applyRazorpayEvent(event: RazorpayEvent): Promise<{ credited: boolean }> {
  const name = String(event.event ?? "");
  if (name !== "payment.captured" && name !== "order.paid") return { credited: false };
  const payment = event.payload?.payment?.entity;
  const orderId = payment?.order_id || event.payload?.order?.entity?.id || "";
  const paymentId = payment?.id || "";
  if (!orderId || !paymentId) return { credited: false };
  const { creditTopup, orderOwner } = await import("./ledger.server");
  const owner = await orderOwner(orderId);
  if (!owner) return { credited: false };
  if (payment?.amount != null && Number(payment.amount) !== owner.amountPaise) return { credited: false };
  const res = await creditTopup({ userId: owner.userId, amountPaise: owner.amountPaise, paymentId, orderId });
  return { credited: res.credited };
}
