import { createFileRoute } from "@tanstack/react-router";

/** The companion's poll: the next queued job for this operator, or null. Also the device heartbeat. */
async function handle(request: Request): Promise<Response> {
  const { withDevice } = await import("@/lib/automation/runner-http.server");
  const { claimNext } = await import("@/lib/automation/rows.server");
  return withDevice(request, async (device) => ({ job: await claimNext(device), device: { id: device.id, name: device.name } }));
}

export const Route = createFileRoute("/api/runner/claim")({
  server: { handlers: { POST: ({ request }) => handle(request) } },
});
