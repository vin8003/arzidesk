import { createFileRoute } from "@tanstack/react-router";

async function authorized(request: Request): Promise<boolean> {
  const { timingSafeEqual } = await import("node:crypto");
  const secret = (process.env.REPAIR_BUNDLE_SECRET ?? "").trim();
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * For the recipe-repair workflow: the redacted evidence for one broken
 * recipe step. Off unless REPAIR_BUNDLE_SECRET is set.
 * GET /api/automation/repair-bundle?recipeId=…&stepId=…[&jobId=…]
 */
async function handle(request: Request): Promise<Response> {
  if (!(await authorized(request))) return new Response("unauthorized", { status: 401 });
  const { repairBundle } = await import("@/lib/automation/repair.server");
  const url = new URL(request.url);
  const bundle = await repairBundle({
    jobId: url.searchParams.get("jobId")?.slice(0, 64) || null,
    recipeId: (url.searchParams.get("recipeId") ?? "").slice(0, 60),
    stepId: (url.searchParams.get("stepId") ?? "").slice(0, 80),
  });
  if (!bundle) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(bundle, { headers: { "Cache-Control": "no-store" } });
}

export const Route = createFileRoute("/api/automation/repair-bundle")({
  server: { handlers: { GET: ({ request }) => handle(request) } },
});
