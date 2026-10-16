import { createFileRoute } from "@tanstack/react-router";
async function authorized(request: Request): Promise<boolean> {
  const { timingSafeEqual } = await import("node:crypto");
  const secret = (process.env.CRON_SECRET ?? "").trim();
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const given = Buffer.from(header);
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Daily sweep for automatic first appeals across all operators. Vercel Cron
 * sends `Authorization: Bearer $CRON_SECRET`; without CRON_SECRET the route is off.
 * The desk also runs the same sweep for the signed-in operator when Today loads.
 */
async function handle(request: Request): Promise<Response> {
  if (!(await authorized(request))) return new Response("unauthorized", { status: 401 });
  const { getSql } = await import("@/lib/db");
  const { runAutoAppeals } = await import("@/lib/desk/automation.server");
  const sql = await getSql();
  const users = await sql<{ user_id: string }>`
    select distinct user_id from cases where status = 'open' and auto_appeal = true and flow in ('money', 'rti')
    limit 500
  `;
  let drafted = 0;
  let blocked = 0;
  for (const { user_id } of users) {
    const res = await runAutoAppeals(user_id, 5);
    drafted += res.drafted.length;
    blocked += res.blockedByWallet.length;
    if (res.aiUnavailable) return Response.json({ ok: false, error: "AI_UNAVAILABLE", drafted, blocked });
  }
  return Response.json({ ok: true, users: users.length, drafted, blocked });
}

export const Route = createFileRoute("/api/cron/auto-appeals")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});
