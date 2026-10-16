import { createFileRoute } from "@tanstack/react-router";

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

async function handleVerify(request: Request): Promise<Response> {
  const { requireUserId, UnauthorizedError } = await import("@/lib/auth/verify.server");
  const { assertSameSiteRequest, CrossSiteRequestError } = await import("@/lib/auth/isolation.server");
  const { RazorpayHttpError } = await import("@/lib/billing/razorpay.server");
  const { creditVerifiedPayment } = await import("@/lib/wallet/service.server");

  try {
    assertSameSiteRequest();
    const userId = await requireUserId();
    let body: {
      razorpay_payment_id?: unknown;
      razorpay_order_id?: unknown;
      razorpay_signature?: unknown;
    };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    const paymentId = String(body.razorpay_payment_id ?? "").trim();
    const orderId = String(body.razorpay_order_id ?? "").trim();
    const signature = String(body.razorpay_signature ?? "").trim();
    if (!paymentId || !orderId || !signature) {
      return json({ error: "Missing payment fields." }, 400);
    }

    const wallet = await creditVerifiedPayment({ userId, paymentId, orderId, signature });
    return json({ success: true, balancePaise: wallet.balancePaise });
  } catch (err) {
    if (err instanceof CrossSiteRequestError) return json({ error: err.message }, 403);
    if (err instanceof UnauthorizedError) return json({ error: "Unauthorized" }, 401);
    if (err instanceof RazorpayHttpError) {
      const status = err.status === 401 ? 401 : err.status >= 400 && err.status < 500 ? err.status : 500;
      return json({ error: err.message }, status);
    }
    return json({ error: err instanceof Error ? err.message : "Could not verify payment" }, 500);
  }
}

export const Route = createFileRoute("/api/verify-payment")({
  server: {
    handlers: {
      POST: ({ request }) => handleVerify(request),
    },
  },
});
