import { randomUUID } from "node:crypto";
import { getSql } from "@/lib/db";
import {
  DEFAULT_PRICES_INR,
  inrToPaise,
  parsePriceList,
  parseWelcome,
  type LedgerEntry,
  type LedgerKind,
  type PriceList,
} from "./pricing";

/**
 * Wallet writes. Each balance change and its ledger row go in ONE statement
 * (a data-modifying CTE), so a crash can never leave them out of step, and the
 * `balance_paise >= amount` guard makes a debit atomic without a transaction.
 * Credits that must land once (a payment, a refund, the welcome credit) carry a
 * `ref` covered by a unique index.
 */

export const SETTINGS_PRICES = "task_prices";
export const SETTINGS_WELCOME = "welcome_inr";

export class InsufficientBalanceError extends Error {
  readonly balancePaise: number;
  readonly neededPaise: number;
  constructor(balancePaise: number, neededPaise: number) {
    super("INSUFFICIENT_BALANCE");
    this.name = "InsufficientBalanceError";
    this.balancePaise = balancePaise;
    this.neededPaise = neededPaise;
  }
}

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  if (code === "23505") return true;
  return /duplicate key|unique constraint/i.test(String((err as Error | null)?.message ?? ""));
}

export async function readSetting(key: string): Promise<string | null> {
  try {
    const sql = await getSql();
    const rows = await sql<{ value: string }>`select value from app_settings where key = ${key} limit 1`;
    return rows[0]?.value ?? null;
  } catch {
    return null;
  }
}

export async function writeSetting(key: string, value: string, adminId: string): Promise<void> {
  const sql = await getSql();
  await sql`
    insert into app_settings (key, value, updated_at, updated_by)
    values (${key}, ${value}, now(), ${adminId})
    on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by
  `;
}

export async function readPrices(): Promise<PriceList> {
  const raw = await readSetting(SETTINGS_PRICES);
  return raw ? parsePriceList(raw) : { ...DEFAULT_PRICES_INR };
}

export async function readWelcomeInr(): Promise<number> {
  return parseWelcome(await readSetting(SETTINGS_WELCOME));
}

async function credit(opts: {
  userId: string;
  kind: Exclude<LedgerKind, "debit">;
  amountPaise: number;
  ref?: string | null;
  task?: string | null;
  caseId?: string | null;
  stepId?: string | null;
  note?: string;
}): Promise<{ credited: boolean; balancePaise: number }> {
  const sql = await getSql();
  const ref = opts.ref ?? null;
  try {
    const rows = await sql<{ balance_after: number }>`
      with up as (
        update wallets
        set balance_paise = balance_paise + ${opts.amountPaise}::bigint, updated_at = now()
        where user_id = ${opts.userId}::text
          and not exists (
            select 1 from wallet_ledger where kind = ${opts.kind}::text and ref is not null and ref = ${ref}::text
          )
        returning balance_paise
      )
      insert into wallet_ledger (id, user_id, kind, amount_paise, balance_after, task, case_id, step_id, ref, note)
      select ${newId("led")}::text, ${opts.userId}::text, ${opts.kind}::text, ${opts.amountPaise}::bigint, up.balance_paise,
             ${opts.task ?? null}::text, ${opts.caseId ?? null}::text, ${opts.stepId ?? null}::text, ${ref}::text, ${opts.note ?? ""}::text
      from up
      returning balance_after
    `;
    if (rows[0]) return { credited: true, balancePaise: Number(rows[0].balance_after) };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
  }
  return { credited: false, balancePaise: await balanceOf(opts.userId) };
}

/** Create the wallet on first touch and give the welcome credit once. */
export async function ensureWallet(userId: string): Promise<number> {
  const sql = await getSql();
  const created = await sql<{ user_id: string }>`
    insert into wallets (user_id, balance_paise) values (${userId}, 0)
    on conflict (user_id) do nothing
    returning user_id
  `;
  if (created[0]) {
    const welcome = await readWelcomeInr();
    if (welcome > 0) {
      const res = await credit({
        userId,
        kind: "welcome",
        amountPaise: inrToPaise(welcome),
        ref: userId,
        note: "Welcome credit",
      });
      return res.balancePaise;
    }
  }
  return balanceOf(userId);
}

export async function balanceOf(userId: string): Promise<number> {
  const sql = await getSql();
  const rows = await sql<{ balance_paise: number }>`select balance_paise from wallets where user_id = ${userId} limit 1`;
  return Number(rows[0]?.balance_paise ?? 0);
}

/** Take `amountPaise` from the wallet or throw InsufficientBalanceError. Returns the debit id (null when free). */
export async function debit(opts: {
  userId: string;
  amountPaise: number;
  task: string;
  caseId: string;
  stepId: string;
  note: string;
}): Promise<{ debitId: string | null; balancePaise: number }> {
  await ensureWallet(opts.userId);
  if (opts.amountPaise <= 0) return { debitId: null, balancePaise: await balanceOf(opts.userId) };
  const sql = await getSql();
  const id = newId("led");
  const rows = await sql<{ balance_after: number }>`
    with up as (
      update wallets
      set balance_paise = balance_paise - ${opts.amountPaise}::bigint, updated_at = now()
      where user_id = ${opts.userId}::text and balance_paise >= ${opts.amountPaise}::bigint
      returning balance_paise
    )
    insert into wallet_ledger (id, user_id, kind, amount_paise, balance_after, task, case_id, step_id, note)
    select ${id}::text, ${opts.userId}::text, 'debit', ${-opts.amountPaise}::bigint, up.balance_paise,
           ${opts.task}::text, ${opts.caseId}::text, ${opts.stepId}::text, ${opts.note}::text
    from up
    returning balance_after
  `;
  if (!rows[0]) throw new InsufficientBalanceError(await balanceOf(opts.userId), opts.amountPaise);
  return { debitId: id, balancePaise: Number(rows[0].balance_after) };
}

/** Give back a debit after a failed AI call. Safe to call twice. */
export async function refund(userId: string, debitId: string | null, note = "Refund: draft failed"): Promise<void> {
  if (!debitId) return;
  const sql = await getSql();
  const rows = await sql<{ amount_paise: number; task: string | null; case_id: string | null; step_id: string | null }>`
    select amount_paise, task, case_id, step_id from wallet_ledger
    where id = ${debitId} and user_id = ${userId} and kind = 'debit' limit 1
  `;
  const row = rows[0];
  if (!row) return;
  await credit({
    userId,
    kind: "refund",
    amountPaise: Math.abs(Number(row.amount_paise)),
    ref: debitId,
    task: row.task,
    caseId: row.case_id,
    stepId: row.step_id,
    note,
  });
}

/** Credit a verified Razorpay payment. Idempotent on the payment id. */
export async function creditTopup(opts: {
  userId: string;
  amountPaise: number;
  paymentId: string;
  orderId: string;
}): Promise<{ credited: boolean; balancePaise: number }> {
  await ensureWallet(opts.userId);
  const res = await credit({
    userId: opts.userId,
    kind: "topup",
    amountPaise: opts.amountPaise,
    ref: opts.paymentId,
    note: `Top-up · ${opts.orderId}`,
  });
  const sql = await getSql();
  await sql`
    update wallet_orders set status = 'paid', payment_id = ${opts.paymentId}, paid_at = coalesce(paid_at, now())
    where order_id = ${opts.orderId}
  `;
  return res;
}

/** Credit without payment: admin grants and the no-keys preview top-up. */
export async function grant(opts: { userId: string; amountPaise: number; note: string }): Promise<number> {
  await ensureWallet(opts.userId);
  const res = await credit({ userId: opts.userId, kind: "grant", amountPaise: opts.amountPaise, note: opts.note });
  return res.balancePaise;
}

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value ?? "");
}

export function mapLedger(row: Record<string, unknown>): LedgerEntry {
  return {
    id: String(row.id),
    kind: String(row.kind) as LedgerKind,
    amountPaise: Number(row.amount_paise ?? 0),
    balanceAfterPaise: Number(row.balance_after ?? 0),
    task: row.task == null ? null : String(row.task),
    caseId: row.case_id == null ? null : String(row.case_id),
    note: String(row.note ?? ""),
    createdAt: iso(row.created_at),
  };
}

export async function recentLedger(userId: string, limit = 50): Promise<LedgerEntry[]> {
  const sql = await getSql();
  const rows = await sql<Record<string, unknown>>`
    select * from wallet_ledger where user_id = ${userId}
    order by created_at desc, id desc
    limit ${Math.max(1, Math.min(200, limit))}
  `;
  return rows.map(mapLedger);
}

export async function rememberOrder(opts: { orderId: string; userId: string; amountPaise: number }): Promise<void> {
  const sql = await getSql();
  await sql`
    insert into wallet_orders (order_id, user_id, amount_paise)
    values (${opts.orderId}, ${opts.userId}, ${opts.amountPaise})
    on conflict (order_id) do nothing
  `;
}

export async function orderOwner(orderId: string): Promise<{ userId: string; amountPaise: number } | null> {
  const sql = await getSql();
  const rows = await sql<{ user_id: string; amount_paise: number }>`
    select user_id, amount_paise from wallet_orders where order_id = ${orderId} limit 1
  `;
  if (!rows[0]) return null;
  return { userId: rows[0].user_id, amountPaise: Number(rows[0].amount_paise) };
}
