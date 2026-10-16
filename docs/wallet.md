# Wallet and payments

Code: `src/lib/wallet/pricing.ts` (pure), `ledger.server.ts` (writes), `service.server.ts` (reads, payment crediting), `store.ts` (server functions), `src/lib/billing/razorpay.server.ts` (Razorpay API), `src/lib/billing/checkout.ts` (Checkout.js in the browser).

## Model

- `wallets(user_id, balance_paise ≥ 0)` and `wallet_ledger(kind, amount_paise, balance_after, task, case_id, step_id, ref, note)`.
- Ledger kinds: `welcome`, `topup`, `debit`, `refund`, `grant`.
- **Every balance change and its ledger row are one SQL statement** (a data-modifying CTE). A debit only happens `where balance_paise >= amount`, so two drafts at once can never overdraw.
- `ref` + a partial unique index make the welcome credit (ref = user id), each top-up (ref = Razorpay payment id) and each refund (ref = the debit id) land **once**, even if the browser and the webhook both report the same payment.

## A draft

1. Price = admin price for the task; the first redraft of a step is free (`chargeFor`).
2. No `XAI_API_KEY` → refuse before charging.
3. Debit. Not enough balance → `PAYWALL` with balance and amount needed; the UI links to /wallet.
4. Grok call. On timeout / HTTP error / unparseable reply → automatic refund.

## Top-ups

| Keys | Database | What "Top up" does |
|---|---|---|
| none | PGLite (no `DATABASE_URL`) | **Preview**: credits the wallet without payment (kind `grant`, note says so) |
| none | Postgres | Refuses: "payments are not connected" |
| `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` | any | Razorpay Standard Checkout |

Live path: `startTopup` creates an order (notes: user id, purpose) and stores it in `wallet_orders` → Checkout.js → `confirmTopup` / `POST /api/verify-payment` checks HMAC-SHA256(`order_id|payment_id`), that the order belongs to this user, and that Razorpay's order amount equals the stored amount → credit. The browser never sends the amount that gets credited.

Webhook backstop: `POST /api/billing/razorpay` (set `RAZORPAY_WEBHOOK_SECRET`, subscribe to `payment.captured` and/or `order.paid`) credits the order's owner once, using the stored order amount.

## Going live (individual Razorpay account is enough)

1. Sign up at razorpay.com as an individual / proprietor, finish KYC, add the live site URL.
2. Test with `rzp_test_…` keys first (test card 4111 1111 1111 1111). Then switch to live keys.
3. Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` (server only) and optionally `RAZORPAY_WEBHOOK_SECRET` with a webhook to `https://<your-domain>/api/billing/razorpay`.

## GST note

The service is the draft; government fees never pass through the wallet. If turnover later needs a GSTIN, the per-draft price is the taxable value; nothing else changes.
