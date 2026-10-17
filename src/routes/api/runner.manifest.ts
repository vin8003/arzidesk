import { createFileRoute } from "@tanstack/react-router";

/** Current recipe versions with their SHA-256 (and signature, when the release was signed). */
async function handle(request: Request): Promise<Response> {
  const { withDevice } = await import("@/lib/automation/runner-http.server");
  const { recipeManifest } = await import("@/lib/automation/recipe-files.server");
  return withDevice(request, async () => ({ recipes: recipeManifest() }));
}

export const Route = createFileRoute("/api/runner/manifest")({
  server: { handlers: { GET: ({ request }) => handle(request) } },
});
