import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { DRAFT_KINDS, type DraftKind } from "@/lib/desk/types";
import { inrToPaise, parsePrice, parseWelcome, type PriceList } from "@/lib/wallet/pricing";

export const adminSession = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ email: string }> => {
    const admin = await (await import("./guard.server")).requireAdmin(context.userId);
    return { email: admin.email };
  });

export const adminNavFlag = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ admin: boolean }> => {
    try {
      await (await import("./guard.server")).requireAdmin(context.userId);
      return { admin: true };
    } catch {
      return { admin: false };
    }
  });

export type AdminStats = {
  users: number;
  users7d: number;
  walletFloatPaise: number;
  topupsPaise: number;
  topups7dPaise: number;
  grantsPaise: number;
  welcomePaise: number;
  spentPaise: number;
  refundsPaise: number;
  drafts: number;
  byTask: Array<{ task: string; count: number; paise: number }>;
  cases: number;
  openCases: number;
  byFlow: Array<{ flow: string; count: number }>;
  byState: Array<{ state: string; count: number }>;
  paymentsLive: boolean;
};

function n(value: unknown): number {
  const x = Number(value ?? 0);
  return Number.isFinite(x) ? x : 0;
}

export const adminStats = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<AdminStats> => {
    await (await import("./guard.server")).requireAdmin(context.userId);
    const { paymentsLive } = await import("@/lib/billing/live");
    const sql = await getSql();
    const [users, ledger, ledger7, byTask, cases, byFlow, byState, float] = await Promise.all([
      sql<{ total: number; recent: number }>`
        select count(*)::int as total,
               count(*) filter (where "createdAt" > now() - interval '7 days')::int as recent
        from "user"
      `,
      sql<{ kind: string; paise: number; count: number }>`
        select kind, coalesce(sum(amount_paise), 0)::bigint as paise, count(*)::int as count
        from wallet_ledger group by kind
      `,
      sql<{ paise: number }>`
        select coalesce(sum(amount_paise), 0)::bigint as paise from wallet_ledger
        where kind = 'topup' and created_at > now() - interval '7 days'
      `,
      sql<{ task: string; count: number; paise: number }>`
        select coalesce(task, '') as task, count(*)::int as count, coalesce(-sum(amount_paise), 0)::bigint as paise
        from wallet_ledger where kind = 'debit' group by task order by count desc
      `,
      sql<{ total: number; open: number }>`
        select count(*)::int as total, count(*) filter (where status = 'open')::int as open from cases
      `,
      sql<{ flow: string; count: number }>`select flow, count(*)::int as count from cases group by flow order by count desc`,
      sql<{ state: string; count: number }>`select state, count(*)::int as count from cases group by state order by count desc`,
      sql<{ paise: number }>`select coalesce(sum(balance_paise), 0)::bigint as paise from wallets`,
    ]);
    const kind = (k: string) => ledger.find((r) => r.kind === k);
    const drafts = await sql<{ count: number }>`select coalesce(sum(generations), 0)::int as count from case_steps`;
    return {
      users: n(users[0]?.total),
      users7d: n(users[0]?.recent),
      walletFloatPaise: n(float[0]?.paise),
      topupsPaise: n(kind("topup")?.paise),
      topups7dPaise: n(ledger7[0]?.paise),
      grantsPaise: n(kind("grant")?.paise),
      welcomePaise: n(kind("welcome")?.paise),
      spentPaise: -n(kind("debit")?.paise),
      refundsPaise: n(kind("refund")?.paise),
      drafts: n(drafts[0]?.count),
      byTask: byTask.map((r) => ({ task: r.task, count: n(r.count), paise: n(r.paise) })),
      cases: n(cases[0]?.total),
      openCases: n(cases[0]?.open),
      byFlow: byFlow.map((r) => ({ flow: r.flow, count: n(r.count) })),
      byState: byState.map((r) => ({ state: r.state, count: n(r.count) })),
      paymentsLive: paymentsLive(),
    };
  });

export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  balancePaise: number;
  toppedUpPaise: number;
  spentPaise: number;
  cases: number;
};

export const adminUsers = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { q?: string } | undefined) => ({ q: String(input?.q ?? "").trim().slice(0, 80) }))
  .handler(async ({ context, data }): Promise<AdminUserRow[]> => {
    await (await import("./guard.server")).requireAdmin(context.userId);
    const sql = await getSql();
    const like = `%${data.q.toLowerCase()}%`;
    const rows = await sql<Record<string, unknown>>`
      select u.id, u.name, u.email, u."createdAt" as created_at,
             coalesce(w.balance_paise, 0)::bigint as balance,
             coalesce((select sum(amount_paise) from wallet_ledger l where l.user_id = u.id and l.kind = 'topup'), 0)::bigint as topped,
             coalesce((select -sum(amount_paise) from wallet_ledger l where l.user_id = u.id and l.kind = 'debit'), 0)::bigint as spent,
             (select count(*) from cases c where c.user_id = u.id)::int as cases
      from "user" u
      left join wallets w on w.user_id = u.id
      where ${data.q} = '' or lower(u.email) like ${like} or lower(u.name) like ${like}
      order by u."createdAt" desc
      limit 200
    `;
    return rows.map((r) => ({
      id: String(r.id),
      name: String(r.name ?? ""),
      email: String(r.email ?? ""),
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at ?? ""),
      balancePaise: n(r.balance),
      toppedUpPaise: n(r.topped),
      spentPaise: n(r.spent),
      cases: n(r.cases),
    }));
  });

export const adminCredit = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { userId: string; amountInr: number; note?: string }) => {
    const amount = Math.round(Number(input?.amountInr));
    if (!Number.isFinite(amount) || amount < 1 || amount > 50_000) throw new Error("Enter ₹1 to ₹50,000.");
    return {
      userId: String(input?.userId ?? "").slice(0, 80),
      amountInr: amount,
      note: String(input?.note ?? "").trim().slice(0, 160),
    };
  })
  .handler(async ({ context, data }): Promise<{ balancePaise: number }> => {
    const admin = await (await import("./guard.server")).requireAdmin(context.userId);
    const { grant } = await import("@/lib/wallet/ledger.server");
    const sql = await getSql();
    const exists = await sql<{ id: string }>`select id from "user" where id = ${data.userId} limit 1`;
    if (!exists[0]) throw new Error("User not found.");
    const balancePaise = await grant({
      userId: data.userId,
      amountPaise: inrToPaise(data.amountInr),
      note: `Admin credit by ${admin.email}${data.note ? ` · ${data.note}` : ""}`,
    });
    return { balancePaise };
  });

export const adminPricing = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ prices: PriceList; welcomeInr: number }> => {
    await (await import("./guard.server")).requireAdmin(context.userId);
    const { readPrices, readWelcomeInr } = await import("@/lib/wallet/ledger.server");
    return { prices: await readPrices(), welcomeInr: await readWelcomeInr() };
  });

export const adminSavePricing = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { prices: Partial<Record<DraftKind, number>>; welcomeInr: number }) => {
    const prices = {} as PriceList;
    for (const kind of DRAFT_KINDS) prices[kind] = parsePrice(input?.prices?.[kind], -1);
    if (Object.values(prices).some((v) => v < 0)) throw new Error("Every price must be ₹0 or more.");
    return { prices, welcomeInr: parseWelcome(input?.welcomeInr) };
  })
  .handler(async ({ context, data }): Promise<{ prices: PriceList; welcomeInr: number }> => {
    const admin = await (await import("./guard.server")).requireAdmin(context.userId);
    const { SETTINGS_PRICES, SETTINGS_WELCOME, writeSetting } = await import("@/lib/wallet/ledger.server");
    await writeSetting(SETTINGS_PRICES, JSON.stringify(data.prices), admin.id);
    await writeSetting(SETTINGS_WELCOME, String(data.welcomeInr), admin.id);
    return data;
  });
