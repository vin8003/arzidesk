import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { GuestPanel } from "@/components/guest-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Hint, Input, Label } from "@/components/ui/field";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { openRazorpayCheckout } from "@/lib/billing/checkout";
import { formatDay } from "@/lib/dates";
import { STEP_COPY, t } from "@/lib/desk/copy";
import { todayIst } from "@/lib/desk/timers";
import { DRAFT_KINDS, type StepKind } from "@/lib/desk/types";
import { useDeskLang } from "@/lib/lang";
import {
  FREE_REGENERATIONS,
  MAX_TOPUP_INR,
  MIN_TOPUP_INR,
  TOPUP_PACKS_INR,
  formatInr,
  inrToPaise,
  type LedgerKind,
} from "@/lib/wallet/pricing";
import { confirmTopup, startTopup } from "@/lib/wallet/store";
import { announceWallet, useWallet } from "@/lib/wallet/use-wallet";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/wallet")({ component: WalletPage });

const KIND_LABEL: Record<LedgerKind, { en: string; hi: string }> = {
  welcome: { en: "Welcome credit", hi: "स्वागत क्रेडिट" },
  topup: { en: "Top-up", hi: "टॉप-अप" },
  debit: { en: "Draft", hi: "ड्राफ्ट" },
  refund: { en: "Refund", hi: "वापसी" },
  grant: { en: "Credit", hi: "क्रेडिट" },
};

function WalletPage() {
  const { lang, onLang } = useDeskLang();
  const { user, isPending } = useCurrentUserState();
  const { wallet, reload } = useWallet();
  const [amount, setAmount] = useState<number>(500);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const hi = lang === "hi";
  const today = todayIst();

  async function topUp() {
    const value = custom.trim() ? Math.round(Number(custom)) : amount;
    if (!Number.isFinite(value) || value < MIN_TOPUP_INR || value > MAX_TOPUP_INR) {
      toast.error(hi ? `₹${MIN_TOPUP_INR} से ₹${MAX_TOPUP_INR.toLocaleString("en-IN")} तक डालें।` : `Enter ₹${MIN_TOPUP_INR} to ₹${MAX_TOPUP_INR.toLocaleString("en-IN")}.`);
      return;
    }
    setBusy(true);
    try {
      const res = await startTopup({ data: { amountInr: value } });
      if (res.kind === "unset") {
        toast.error(hi ? "भुगतान अभी जुड़ा नहीं है (Razorpay कुंजी सेट करें)।" : "Payments are not connected yet (set the Razorpay keys).");
        return;
      }
      if (res.kind === "preview") {
        announceWallet(res.wallet);
        await reload();
        toast.success(hi ? `प्रीव्यू: ${formatInr(inrToPaise(value))} जोड़े गए (कोई भुगतान नहीं)` : `Preview: ${formatInr(inrToPaise(value))} added (no payment taken)`);
        return;
      }
      const paid = await openRazorpayCheckout(res.checkout);
      if (!paid) {
        toast.message(hi ? "भुगतान बंद किया गया।" : "Checkout closed.");
        return;
      }
      const next = await confirmTopup({ data: paid });
      announceWallet(next);
      await reload();
      toast.success(hi ? "भुगतान मिला, वॉलेट में जुड़ा।" : "Payment received and added to the wallet.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : hi ? "भुगतान नहीं हुआ" : "Payment failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell lang={lang} onLang={onLang} active="wallet">
      {isPending ? <div className="skeleton h-40" /> : null}
      {!isPending && !user ? <GuestPanel lang={lang} /> : null}
      {!isPending && user ? (
        <div className="max-w-4xl">
          <header className="page-head">
            <div className="page-head-text">
              <h1 className="page-title">{hi ? "वॉलेट" : "Wallet"}</h1>
              <p className="page-lead">
                {hi
                  ? "पहले पैसा डालें, हर ड्राफ्ट पर कटौती। केस खोलना, स्थिति जाँच, टाइमर, संपादन और प्रिंट मुफ़्त हैं। विफल ड्राफ्ट का पैसा अपने आप वापस।"
                  : "Prepaid. Each draft is debited; opening cases, status checks, timers, edits and printing are free. A failed draft is refunded automatically."}
              </p>
            </div>
          </header>

          <div className="plan-grid stack-tight">
            <section className="card card-pad">
              <p className="label-sm">{hi ? "बैलेंस" : "Balance"}</p>
              <div className="plan-price mt-1 tabular-nums">{wallet ? formatInr(wallet.balancePaise) : "…"}</div>
              {wallet?.topupMode === "preview" ? (
                <p className="mt-2 text-xs text-warn">
                  {hi ? "प्रीव्यू मोड: टॉप-अप बिना भुगतान के जुड़ता है।" : "Preview mode: top-ups are added without taking payment."}
                </p>
              ) : null}
              <div className="mt-5 flex flex-wrap gap-2" role="radiogroup" aria-label={hi ? "राशि" : "Amount"}>
                {TOPUP_PACKS_INR.map((p) => (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={!custom && amount === p}
                    onClick={() => {
                      setAmount(p);
                      setCustom("");
                    }}
                    className={cn("seg-btn rounded-md border border-hairline px-3 tabular-nums", !custom && amount === p && "is-on !border-accent")}
                  >
                    ₹{p.toLocaleString("en-IN")}
                  </button>
                ))}
              </div>
              <Field className="mt-4 max-w-48">
                <Label htmlFor="w-custom">{hi ? "या अपनी राशि (₹)" : "Or your amount (₹)"}</Label>
                <Input id="w-custom" inputMode="numeric" value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^\d]/g, ""))} placeholder="750" />
                <Hint>
                  ₹{MIN_TOPUP_INR}–₹{MAX_TOPUP_INR.toLocaleString("en-IN")}
                </Hint>
              </Field>
              <div className="mt-5 border-t border-border pt-5">
                <Button size="lg" onClick={() => void topUp()} disabled={busy || !wallet}>
                  {busy ? (hi ? "रुकिए…" : "Please wait…") : hi ? "टॉप-अप करें" : "Top up"}
                </Button>
                <p className="mt-2 text-xs leading-relaxed text-subtle">
                  {wallet?.paymentsLive
                    ? hi
                      ? "Razorpay से UPI, कार्ड या नेट बैंकिंग। सत्यापित भुगतान के बाद ही जुड़ता है।"
                      : "UPI, card or net banking through Razorpay. Credited only after the payment is verified."
                    : hi
                      ? "Razorpay कुंजी सेट होते ही यहाँ असली भुगतान खुलेगा।"
                      : "Real checkout opens here once the Razorpay keys are set."}
                </p>
              </div>
            </section>

            <section className="card card-pad">
              <h2 className="section-title">{hi ? "प्रति ड्राफ्ट दर" : "Price per draft"}</h2>
              <table className="mt-3 w-full text-sm">
                <tbody>
                  {DRAFT_KINDS.map((k) => (
                    <tr key={k} className="border-b border-border last:border-0">
                      <td className="py-2">{t(STEP_COPY[k as StepKind].name, lang)}</td>
                      <td className="py-2 text-right font-medium tabular-nums">
                        {wallet ? (wallet.prices[k] ? formatInr(inrToPaise(wallet.prices[k])) : hi ? "मुफ़्त" : "Free") : "…"}
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td className="py-2 text-muted">{hi ? "स्थिति जाँच, टाइमर, प्रिंट" : "Status check, timers, print"}</td>
                    <td className="py-2 text-right text-muted">{hi ? "मुफ़्त" : "Free"}</td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-3 text-xs leading-relaxed text-subtle">
                {hi
                  ? `हर कदम का ${FREE_REGENERATIONS === 1 ? "पहला दोबारा ड्राफ्ट" : `पहले ${FREE_REGENERATIONS} दोबारा ड्राफ्ट`} मुफ़्त। सरकारी फ़ीस (RTI ₹10 आदि) यहाँ नहीं ली जाती; नागरिक उसे सीधे देता है, आपकी सेवा फ़ीस अलग लाइन में दिखाएँ।`
                  : `The first ${FREE_REGENERATIONS === 1 ? "redraft" : `${FREE_REGENERATIONS} redrafts`} of each step ${FREE_REGENERATIONS === 1 ? "is" : "are"} free. Government fees (₹10 RTI and so on) are never collected here; the citizen pays them directly — show your own service charge as a separate line.`}
              </p>
            </section>
          </div>

          <section className="stack">
            <h2 className="section-title">{hi ? "लेन-देन" : "Transactions"}</h2>
            {wallet && wallet.recent.length ? (
              <ul className="list mt-3">
                {wallet.recent.map((row) => (
                  <li key={row.id} className="list-row">
                    <span className="list-date">{formatDay(row.createdAt.slice(0, 10), lang, today)}</span>
                    <span className="list-main">
                      <span className="list-title">{row.note || t(KIND_LABEL[row.kind] ?? KIND_LABEL.grant, lang)}</span>
                      <span className="list-meta">
                        <span>{t(KIND_LABEL[row.kind] ?? KIND_LABEL.grant, lang)}</span>
                        <span>
                          {hi ? "बैलेंस" : "Balance"} {formatInr(row.balanceAfterPaise)}
                        </span>
                      </span>
                    </span>
                    <span className="list-end">
                      <Badge tone={row.amountPaise < 0 ? "muted" : "ok"} className="tabular-nums">
                        {row.amountPaise < 0 ? "−" : "+"}
                        {formatInr(Math.abs(row.amountPaise))}
                      </Badge>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="list-empty">{hi ? "अभी कोई लेन-देन नहीं।" : "No transactions yet."}</p>
            )}
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}
