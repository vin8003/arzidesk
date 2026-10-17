import { createFileRoute } from "@tanstack/react-router";

/**
 * Daily canary results from a companion: the public pages of each recipe,
 * fingerprinted. A page that no longer matches its last good shape fires a repair.
 */
async function handle(request: Request): Promise<Response> {
  const { withDevice, str } = await import("@/lib/automation/runner-http.server");
  const { healthFor, recordCheckpoint } = await import("@/lib/automation/rows.server");
  const { noteCanaryDrift } = await import("@/lib/automation/repair.server");
  const { recipeMeta } = await import("@/lib/automation/recipes");
  return withDevice(request, async (_device, body) => {
    const drift: string[] = [];
    for (const raw of (Array.isArray(body.results) ? body.results : []).slice(0, 40)) {
      const r = (raw ?? {}) as Record<string, unknown>;
      const meta = recipeMeta(str(r.recipeId, 60));
      const stepId = str(r.stepId, 80);
      if (!meta || !stepId || r.unreachable === true) continue;
      await recordCheckpoint({ recipeId: meta.id, recipeVersion: meta.version }, { stepId, fingerprint: str(r.fingerprint, 32), inventory: r.inventory });
      const h = await healthFor(meta.id, stepId);
      if (h?.goodFingerprint && h.lastFingerprint && h.goodFingerprint !== h.lastFingerprint) {
        drift.push(`${meta.id}#${stepId}`);
        await noteCanaryDrift(meta.id, meta.version, stepId);
      }
    }
    return { drift };
  });
}

export const Route = createFileRoute("/api/runner/canary")({
  server: { handlers: { POST: ({ request }) => handle(request) } },
});
