import { createFileRoute } from "@tanstack/react-router";

/** `companion pair <code>`: trade a one-time pairing code for a device token. The code is the only credential. */
async function handle(request: Request): Promise<Response> {
  const { withoutDevice, str } = await import("@/lib/automation/runner-http.server");
  const { redeemPairing } = await import("@/lib/automation/rows.server");
  return withoutDevice(request, async (body) => redeemPairing(str(body.code, 20), str(body.name, 80), str(body.version, 40)));
}

export const Route = createFileRoute("/api/runner/pair")({
  server: { handlers: { POST: ({ request }) => handle(request) } },
});
