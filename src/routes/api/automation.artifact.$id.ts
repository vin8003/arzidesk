import { createFileRoute } from "@tanstack/react-router";

/** A job's screenshot or receipt, for the operator who owns it. */
async function handle(id: string): Promise<Response> {
  const { requireUserId, UnauthorizedError } = await import("@/lib/auth/verify.server");
  const { artifactFor } = await import("@/lib/automation/rows.server");
  try {
    const userId = await requireUserId();
    const a = await artifactFor(userId, id.slice(0, 64));
    if (!a) return new Response("not found", { status: 404 });
    const binary = a.contentType.startsWith("image/") || a.contentType === "application/pdf";
    const body = binary ? Buffer.from(a.body, "base64") : a.body;
    return new Response(body, {
      headers: {
        "Content-Type": a.contentType,
        "Cache-Control": "private, no-store",
        "Content-Disposition": `inline; filename="${a.name.replace(/[^\w.-]/g, "_") || "artifact"}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return new Response("unauthorized", { status: 401 });
    throw err;
  }
}

export const Route = createFileRoute("/api/automation/artifact/$id")({
  server: { handlers: { GET: ({ params }) => handle(params.id) } },
});
