import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { adminCredit, adminUsers, type AdminUserRow } from "@/lib/admin/store";
import { formatInr } from "@/lib/wallet/pricing";

export const Route = createFileRoute("/admin/users")({ component: AdminUsersPage });

function AdminUsersPage() {
  const [rows, setRows] = useState<AdminUserRow[] | null>(null);
  const [q, setQ] = useState("");
  const [credit, setCredit] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  function load(query = q) {
    adminUsers({ data: { q: query } })
      .then(setRows)
      .catch((err) => toast.error(err instanceof Error ? err.message : "Could not load"));
  }

  useEffect(() => {
    load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function give(row: AdminUserRow) {
    const amount = Number(credit[row.id] ?? "");
    if (!Number.isFinite(amount) || amount < 1) {
      toast.error("Enter a rupee amount.");
      return;
    }
    setBusy(row.id);
    try {
      const res = await adminCredit({ data: { userId: row.id, amountInr: amount, note: "manual credit" } });
      setRows((list) => (list ?? []).map((r) => (r.id === row.id ? { ...r, balancePaise: res.balancePaise } : r)));
      setCredit((c) => ({ ...c, [row.id]: "" }));
      toast.success(`Credited ₹${amount} to ${row.email || row.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not credit");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <h1 className="page-title">Operators</h1>
      <p className="page-lead">Wallet balances and lifetime spend. Credit a wallet for offline payments, refunds or a pilot.</p>
      <form
        className="stack-tight flex max-w-md gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
      >
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Email or name" className="flex-1" />
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>
      {!rows ? <div className="skeleton stack-tight h-40" /> : null}
      {rows ? (
        <div className="stack-tight overflow-x-auto">
          <table className="data-table w-full min-w-[40rem]">
            <thead>
              <tr>
                <th>Operator</th>
                <th className="text-right">Cases</th>
                <th className="text-right">Topped up</th>
                <th className="text-right">Spent</th>
                <th className="text-right">Balance</th>
                <th>Credit (₹)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span className="block font-medium">{r.name || "—"}</span>
                    <span className="block text-xs text-muted">{r.email}</span>
                  </td>
                  <td className="text-right tabular-nums">{r.cases}</td>
                  <td className="text-right tabular-nums">{formatInr(r.toppedUpPaise)}</td>
                  <td className="text-right tabular-nums">{formatInr(r.spentPaise)}</td>
                  <td className="text-right font-medium tabular-nums">{formatInr(r.balancePaise)}</td>
                  <td>
                    <span className="flex gap-1.5">
                      <Input
                        value={credit[r.id] ?? ""}
                        inputMode="numeric"
                        onChange={(e) => setCredit((c) => ({ ...c, [r.id]: e.target.value.replace(/[^\d]/g, "") }))}
                        className="w-20"
                        aria-label={`Credit for ${r.email}`}
                      />
                      <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => void give(r)}>
                        Add
                      </Button>
                    </span>
                  </td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={6} className="text-muted">
                    No operators found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
