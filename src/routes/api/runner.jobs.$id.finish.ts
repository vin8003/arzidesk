import { createFileRoute } from "@tanstack/react-router";
import type { FailureClass, JobResult } from "@/lib/automation/types";

function readResult(raw: unknown): JobResult {
  const r = (raw ?? {}) as Record<string, unknown>;
  const s = (k: string, max: number) => (typeof r[k] === "string" && r[k] ? (r[k] as string).slice(0, max) : undefined);
  const day = (k: string) => {
    const v = s(k, 10);
    return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
  };
  return {
    summary: s("summary", 300) ?? "",
    reference: s("reference", 60)?.toUpperCase(),
    filedOn: day("filedOn"),
    portalStatus: s("portalStatus", 300),
    replyOn: day("replyOn"),
    replyText: s("replyText", 12_000),
    finding: s("finding", 40),
    notes: s("notes", 2000),
    receiptArtifactId: s("receiptArtifactId", 64),
  };
}

/** The end of a run: a result, or a classified failure. */
async function handle(request: Request, id: string): Promise<Response> {
  const { withDevice, str } = await import("@/lib/automation/runner-http.server");
  const { finishJob } = await import("@/lib/automation/rows.server");
  const { FAILURE_CLASSES } = await import("@/lib/automation/types");
  return withDevice(request, async (device, body) => {
    if (body.ok === true) {
      const softDrift = (Array.isArray(body.softDrift) ? body.softDrift : []).map((s) => String(s).slice(0, 80)).slice(0, 10);
      return finishJob(device, id.slice(0, 64), { ok: true, result: readResult(body.result), softDrift });
    }
    const failure = (FAILURE_CLASSES as readonly string[]).includes(String(body.failure)) ? (String(body.failure) as FailureClass) : "internal";
    return finishJob(device, id.slice(0, 64), { ok: false, failure, error: str(body.error, 1000) || "Failed", stepId: str(body.stepId, 80) || undefined });
  });
}

export const Route = createFileRoute("/api/runner/jobs/$id/finish")({
  server: { handlers: { POST: ({ request, params }) => handle(request, params.id) } },
});
