import type { CheckoutSession } from "./types";

export type CheckoutConfirmation = {
  paymentId: string;
  orderId: string;
  signature: string;
};

type RazorpayInstance = {
  open: () => void;
  on: (event: string, cb: (response: Record<string, unknown>) => void) => void;
};

type RazorpayCtor = new (options: Record<string, unknown>) => RazorpayInstance;

function razorpayCtor(): RazorpayCtor | null {
  const w = window as unknown as { Razorpay?: RazorpayCtor };
  return w.Razorpay ?? null;
}

function loadScript(): Promise<RazorpayCtor> {
  const existing = razorpayCtor();
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => {
      const ctor = razorpayCtor();
      if (ctor) resolve(ctor);
      else reject(new Error("Razorpay Checkout did not load."));
    };
    script.onerror = () => reject(new Error("Could not load Razorpay Checkout."));
    document.head.appendChild(script);
  });
}

function errorDescription(response: Record<string, unknown>, fallback: string): string {
  const error = response.error;
  if (error && typeof error === "object" && "description" in error) {
    const description = (error as { description?: unknown }).description;
    if (typeof description === "string" && description.trim()) return description;
  }
  return fallback;
}

/** Opens Razorpay Checkout. Resolves the signed payment, or null if the sheet was dismissed. */
export async function openRazorpayCheckout(session: CheckoutSession): Promise<CheckoutConfirmation | null> {
  const Razorpay = await loadScript();
  return new Promise((resolve, reject) => {
    const checkout = new Razorpay({
      key: session.keyId,
      order_id: session.orderId,
      amount: session.amount,
      currency: session.currency,
      name: session.name,
      description: session.description,
      theme: { color: "#1f6f5c" },
      prefill: {
        name: session.prefillName,
        email: session.prefillEmail,
      },
      handler: (response: {
        razorpay_payment_id?: string;
        razorpay_order_id?: string;
        razorpay_signature?: string;
      }) => {
        const paymentId = String(response.razorpay_payment_id ?? "");
        const orderId = String(response.razorpay_order_id ?? "");
        const signature = String(response.razorpay_signature ?? "");
        if (!paymentId || !orderId || !signature) {
          reject(new Error("Payment did not return a signature."));
          return;
        }
        resolve({ paymentId, orderId, signature });
      },
      modal: {
        ondismiss: () => resolve(null),
      },
    });
    checkout.on("payment.failed", (response) => {
      reject(new Error(errorDescription(response, "Payment failed.")));
    });
    checkout.open();
  });
}
