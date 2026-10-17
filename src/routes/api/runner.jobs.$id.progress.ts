import { createFileRoute } from "@tanstack/react-router";
import type { Gate, JobEventKind } from "@/lib/automation/types";

const EVENT_KINDS = new Set<JobEventKind>(["log", "status", "gate", "checkpoint", "warning", "error", "artifact"]);

function readGate(raw: unknown, kinds: readonly string[]): Gate | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  const g = raw as Record<string, unknown>;
  const kind = String(g.kind ?? "");
  if (!kinds.includes(kind)) return undefined;
  return {
    kind: kind as Gate["kind"],
    message: String(g.message ?? "").slice(0, 300),
    field: typeof g.field === "string" ? g.field.slice(0, 120) : undefined,
    value: typeof g.value === "string" ? g.value.slice(0, 3000) : undefined,
    since: new Date().toISOString(),
  };
}

/** Events, checkpoints, status and the current human gate for a running job. Answers whether to stop. */
async function handle(request: Request, id: string): Promise<Response> {
  const { withDevice } = await import("@/lib/automation/runner-http.server");
  const { reportProgress } = await import("@/lib/automation/rows.server");
  const { GATE_KINDS } = await import("@/lib/automation/types");
  return withDevice(request, async (device, body) => {
    const events = (Array.isArray(body.events) ? body.events : []).slice(0, 50).flatMap((e: unknown) => {
      const ev = e as Record<string, unknown>;
      const kind = String(ev?.kind ?? "") as JobEventKind;
      if (!EVENT_KINDS.has(kind)) return [];
      const data = ev.data === undefined ? undefined : JSON.stringify(ev.data).length < 600_000 ? ev.data : undefined;
      return [{ kind, text: String(ev.text ?? "").slice(0, 600), data }];
    });
    const status = body.status === "running" || body.status === "waiting_human" || body.status === "submitting" ? body.status : undefined;
    return reportProgress(device, id.slice(0, 64), { events, status, gate: readGate(body.gate, GATE_KINDS), clearSubmit: body.clearSubmit === true });
  });
}

export const Route = createFileRoute("/api/runner/jobs/$id/progress")({
  server: { handlers: { POST: ({ request, params }) => handle(request, params.id) } },
});
