import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Hint, Input, Label } from "@/components/ui/field";
import { adminPricing, adminSavePricing } from "@/lib/admin/store";
import { STEP_COPY } from "@/lib/desk/copy";
import { DRAFT_KINDS, type DraftKind } from "@/lib/desk/types";
import { DEFAULT_PRICES_INR, DEFAULT_WELCOME_INR } from "@/lib/wallet/pricing";

export const Route = createFileRoute("/admin/prices")({ component: AdminPricesPage });

function AdminPricesPage() {
  const [prices, setPrices] = useState<Record<DraftKind, string> | null>(null);
  const [welcome, setWelcome] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    adminPricing()
      .then((res) => {
        setPrices(Object.fromEntries(DRAFT_KINDS.map((k) => [k, String(res.prices[k])])) as Record<DraftKind, string>);
        setWelcome(String(res.welcomeInr));
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Could not load"));
  }, []);

  async function save() {
    if (!prices) return;
    setBusy(true);
    try {
      const res = await adminSavePricing({
        data: {
          prices: Object.fromEntries(DRAFT_KINDS.map((k) => [k, Number(prices[k])])) as Record<DraftKind, number>,
          welcomeInr: Number(welcome),
        },
      });
      setPrices(Object.fromEntries(DRAFT_KINDS.map((k) => [k, String(res.prices[k])])) as Record<DraftKind, string>);
      setWelcome(String(res.welcomeInr));
      toast.success("Prices saved. New drafts use them right away.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  if (!prices) return <div className="skeleton h-48" />;

  return (
    <div className="max-w-2xl">
      <h1 className="page-title">Prices</h1>
      <p className="page-lead">Per-draft price in rupees, debited from the operator's wallet. ₹0 makes a draft free. The first redraft of a step is always free.</p>
      <div className="card card-pad stack-tight grid gap-4 sm:grid-cols-2">
        {DRAFT_KINDS.map((k) => (
          <Field key={k}>
            <Label htmlFor={`p-${k}`}>{STEP_COPY[k].name.en}</Label>
            <Input
              id={`p-${k}`}
              inputMode="numeric"
              value={prices[k]}
              onChange={(e) => setPrices({ ...prices, [k]: e.target.value.replace(/[^\d]/g, "") })}
            />
            <Hint>Default ₹{DEFAULT_PRICES_INR[k]}</Hint>
          </Field>
        ))}
        <Field>
          <Label htmlFor="p-welcome">Welcome credit for new accounts</Label>
          <Input id="p-welcome" inputMode="numeric" value={welcome} onChange={(e) => setWelcome(e.target.value.replace(/[^\d]/g, ""))} />
          <Hint>Default ₹{DEFAULT_WELCOME_INR}. Given once, when the wallet is first opened.</Hint>
        </Field>
      </div>
      <div className="stack-tight">
        <Button onClick={() => void save()} disabled={busy}>
          {busy ? "Saving…" : "Save prices"}
        </Button>
      </div>
    </div>
  );
}
