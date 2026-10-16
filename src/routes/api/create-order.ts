import { createFileRoute } from "@tanstack/react-router";

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

/** REST twin of `startTopup` for scripts and the Razorpay docs flow: creates a wallet top-up order. */
async function handleCreateOrder(request: Request): Promise<Response> {
  const { requireUserId, UnauthorizedError } = await import("@/lib/auth/verify.server");
  const { assertSameSiteRequest, CrossSiteRequestError } = await import("@/lib/auth/isolation.server");
  const { RazorpayHttpError, createOrder, CURRENCY } = await import("@/lib/billing/razorpay.server");
  const { paymentsLive } = await import("@/lib/billing/live");
  const { parseTopup, inrToPaise } = await import("@/lib/wallet/pricing");
  const { rememberOrder } = await import("@/lib/wallet/ledger.server");

  try {
    assertSameSiteRequest();
    const userId = await requireUserId();
    if (!paymentsLive()) {
      return json({ error: "Payments are not connected yet." }, 500);
    }

    let body: { amountInr?: unknown } = {};
    const raw = await request.text();
    if (raw.trim()) {
      try {
        body = JSON.parse(raw) as typeof body;
      } catch {
        return json({ error: "Invalid JSON" }, 400);
      }
    }

    let amountInr: number;
    try {
      amountInr = parseTopup(body.amountInr);
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : "Invalid amount." }, 400);
    }

    const order = await createOrder({
      amount: inrToPaise(amountInr),
      currency: CURRENCY,
      notes: { user_id: userId, purpose: "wallet_topup" },
    });
    await rememberOrder({ orderId: order.id, userId, amountPaise: Number(order.amount) });

    return json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
    });
  } catch (err) {
    if (err instanceof CrossSiteRequestError) return json({ error: err.message }, 403);
    if (err instanceof UnauthorizedError) return json({ error: "Unauthorized" }, 401);
    if (err instanceof RazorpayHttpError) {
      const status = err.status === 401 ? 401 : err.status >= 400 && err.status < 500 ? err.status : 500;
      return json({ error: err.message }, status);
    }
    return json({ error: err instanceof Error ? err.message : "Could not create order" }, 500);
  }
}

export const Route = createFileRoute("/api/create-order")({
  server: {
    handlers: {
      POST: ({ request }) => handleCreateOrder(request),
    },
  },
});
