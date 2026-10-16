import { createFileRoute } from "@tanstack/react-router";

/** Razorpay webhook: `payment.captured` / `order.paid` credit the wallet once, even if the browser closed. */
async function handleWebhook(request: Request): Promise<Response> {
  const raw = await request.text();
  const signature = request.headers.get("x-razorpay-signature") ?? "";
  const { assertWebhook } = await import("@/lib/billing/razorpay.server");
  if (!assertWebhook(raw, signature)) {
    return new Response("invalid signature", { status: 400 });
  }
  let event: unknown;
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response("invalid json", { status: 400 });
  }
  const { applyRazorpayEvent } = await import("@/lib/wallet/service.server");
  const result = await applyRazorpayEvent(event as Parameters<typeof applyRazorpayEvent>[0]);
  return Response.json({ ok: true, credited: result.credited });
}

export const Route = createFileRoute("/api/billing/razorpay")({
  server: {
    handlers: {
      POST: ({ request }) => handleWebhook(request),
    },
  },
});
