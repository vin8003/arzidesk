import { createFileRoute } from "@tanstack/react-router";
import type { ArtifactKind } from "@/lib/automation/types";

const KINDS = new Set<ArtifactKind>(["screenshot", "dom", "receipt", "inventory"]);

/** Screenshot (base64 PNG), receipt, redacted DOM or inventory for a job. */
async function handle(request: Request, id: string): Promise<Response> {
  const { withDevice, str } = await import("@/lib/automation/runner-http.server");
  const { addArtifact, appendEvent, JobError } = await import("@/lib/automation/rows.server");
  return withDevice(request, async (device, body) => {
    const kind = String(body.kind ?? "") as ArtifactKind;
    if (!KINDS.has(kind)) throw new JobError("Unknown artifact kind.", 400);
    const artifactId = await addArtifact(device, id.slice(0, 64), {
      kind,
      name: str(body.name, 120),
      contentType: str(body.contentType, 80) || "application/octet-stream",
      body: typeof body.body === "string" ? body.body : "",
      shareable: body.shareable === true,
    });
    if (kind === "screenshot" || kind === "receipt") await appendEvent(device.userId, id.slice(0, 64), "artifact", `Saved ${kind}: ${str(body.name, 80)}`);
    return { id: artifactId };
  });
}

export const Route = createFileRoute("/api/runner/jobs/$id/artifacts")({
  server: { handlers: { POST: ({ request, params }) => handle(request, params.id) } },
});
