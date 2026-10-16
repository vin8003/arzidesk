/** True when Razorpay Key Id + Key Secret are in the process env. Safe on the client (always false there). */
export function paymentsLive(): boolean {
  if (typeof process === "undefined") return false;
  const id = (process.env.RAZORPAY_KEY_ID ?? "").trim();
  const secret = (process.env.RAZORPAY_KEY_SECRET ?? "").trim();
  return Boolean(id && secret);
}
