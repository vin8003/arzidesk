export const CURRENCY = "INR";
export const MIN_ORDER_PAISE = 100;

/** Razorpay orders are integer paise. Below 100 is rejected. */
export function parseOrderAmount(raw: unknown): number {
  const amount = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(amount) || amount < MIN_ORDER_PAISE) {
    throw new Error("Amount must be at least 100 paise.");
  }
  return Math.round(amount);
}
