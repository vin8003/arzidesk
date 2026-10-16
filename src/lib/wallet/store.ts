import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import type { CheckoutSession } from "@/lib/billing/types";
import { inrToPaise, parseTopup, type WalletSnapshot } from "./pricing";

export type TopupResult =
  | { kind: "preview"; wallet: WalletSnapshot }
  | { kind: "unset"; wallet: WalletSnapshot }
  | { kind: "checkout"; wallet: WalletSnapshot; checkout: CheckoutSession };

export const getWallet = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<WalletSnapshot> => {
    const { readWallet } = await import("./service.server");
    return readWallet(context.userId);
  });

export const startTopup = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { amountInr: number }) => ({ amountInr: parseTopup(input?.amountInr) }))
  .handler(async ({ context, data }): Promise<TopupResult> => {
    const { topupMode, createTopupCheckout } = await import("@/lib/billing/razorpay.server");
    const { grant, rememberOrder } = await import("./ledger.server");
    const { accountOf, readWallet } = await import("./service.server");
    const mode = topupMode();
    const amountPaise = inrToPaise(data.amountInr);

    if (mode === "unset") return { kind: "unset", wallet: await readWallet(context.userId) };
    if (mode === "preview") {
      await grant({ userId: context.userId, amountPaise, note: "Preview top-up (no payment taken)" });
      return { kind: "preview", wallet: await readWallet(context.userId) };
    }

    const account = await accountOf(context.userId);
    const checkout = await createTopupCheckout({
      userId: context.userId,
      name: account.name,
      email: account.email,
      amountPaise,
    });
    await rememberOrder({ orderId: checkout.orderId, userId: context.userId, amountPaise: checkout.amount });
    return { kind: "checkout", wallet: await readWallet(context.userId), checkout };
  });

export const confirmTopup = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { paymentId?: string; orderId?: string; signature?: string }) => ({
    paymentId: String(input?.paymentId ?? "").trim(),
    orderId: String(input?.orderId ?? "").trim(),
    signature: String(input?.signature ?? "").trim(),
  }))
  .handler(async ({ context, data }): Promise<WalletSnapshot> => {
    const { creditVerifiedPayment } = await import("./service.server");
    return creditVerifiedPayment({ userId: context.userId, ...data });
  });
