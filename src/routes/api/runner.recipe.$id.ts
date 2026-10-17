import { createFileRoute } from "@tanstack/react-router";

/** One recipe's source. The companion checks it against the manifest hash before importing it. */
async function handle(request: Request, id: string): Promise<Response> {
  const { deviceForToken } = await import("@/lib/automation/rows.server");
  const { recipeSource } = await import("@/lib/automation/recipe-files.server");
  const header = request.headers.get("authorization") ?? "";
  const device = header.startsWith("Bearer ") ? await deviceForToken(header.slice(7).trim()) : null;
  if (!device) return new Response("unauthorized", { status: 401 });
  const body = recipeSource(decodeURIComponent(id));
  if (body === null) return new Response("not found", { status: 404 });
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

export const Route = createFileRoute("/api/runner/recipe/$id")({
  server: { handlers: { GET: ({ request, params }) => handle(request, params.id) } },
});
