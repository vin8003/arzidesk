import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { adminStats, type AdminStats } from "@/lib/admin/store";
import { FLOW_COPY, STEP_COPY } from "@/lib/desk/copy";
import type { Flow, StepKind } from "@/lib/desk/types";
import { formatInr } from "@/lib/wallet/pricing";

export const Route = createFileRoute("/admin/")({ component: AdminHome });

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="card card-pad">
      <p className="label-sm">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {note ? <p className="mt-1 text-xs text-muted">{note}</p> : null}
    </div>
  );
}

function AdminHome() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminStats()
      .then(setStats)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load"));
  }, []);

  if (error) return <p className="callout is-danger">{error}</p>;
  if (!stats) return <div className="skeleton h-48" />;

  return (
    <div>
      <h1 className="page-title">Desk stats</h1>
      <p className="page-lead">
        Payments {stats.paymentsLive ? "are live (Razorpay keys set)." : "are not connected: top-ups are refused on a real database and free on the local preview."}
      </p>
      <div className="stack-tight grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Operators" value={String(stats.users)} note={`${stats.users7d} joined in 7 days`} />
        <Stat label="Top-ups (all time)" value={formatInr(stats.topupsPaise)} note={`${formatInr(stats.topups7dPaise)} in 7 days`} />
        <Stat label="Spent on drafts" value={formatInr(stats.spentPaise)} note={`${formatInr(stats.refundsPaise)} refunded on failures`} />
        <Stat label="Wallet float" value={formatInr(stats.walletFloatPaise)} note={`${formatInr(stats.welcomePaise + stats.grantsPaise)} given free`} />
        <Stat label="Cases" value={String(stats.cases)} note={`${stats.openCases} open`} />
        <Stat label="Drafts generated" value={String(stats.drafts)} />
      </div>

      <div className="stack grid gap-6 md:grid-cols-2">
        <section>
          <h2 className="section-title">Paid drafts by task</h2>
          <table className="data-table mt-3 w-full">
            <thead>
              <tr>
                <th>Task</th>
                <th className="text-right">Count</th>
                <th className="text-right">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {stats.byTask.length ? (
                stats.byTask.map((r) => (
                  <tr key={r.task}>
                    <td>{STEP_COPY[r.task as StepKind]?.name.en ?? r.task}</td>
                    <td className="text-right tabular-nums">{r.count}</td>
                    <td className="text-right tabular-nums">{formatInr(r.paise)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="text-muted">
                    No paid drafts yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
        <section>
          <h2 className="section-title">Cases by flow and state</h2>
          <table className="data-table mt-3 w-full">
            <tbody>
              {stats.byFlow.map((r) => (
                <tr key={r.flow}>
                  <td>{FLOW_COPY[r.flow as Flow]?.name.en ?? r.flow}</td>
                  <td className="text-right tabular-nums">{r.count}</td>
                </tr>
              ))}
              {stats.byState.map((r) => (
                <tr key={r.state}>
                  <td className="text-muted">{r.state}</td>
                  <td className="text-right tabular-nums">{r.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
