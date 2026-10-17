import { deviceForToken, JobError, type DeviceRow } from "./rows.server";

/**
 * Companion → ArziDesk calls: bearer device token, JSON in and out. Errors
 * become `{ error }` with a status the companion can act on (401: re-pair,
 * 409: state moved on, 413: artifact too big).
 */

const MAX_BODY = 4 * 1024 * 1024;

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function readBody(request: Request): Promise<unknown> {
  if (request.method === "GET") return {};
  const raw = await request.text();
  if (raw.length > MAX_BODY) throw new JobError("Request too large.", 413);
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new JobError("Invalid JSON.", 400);
  }
}

export async function withDevice(request: Request, fn: (device: DeviceRow, body: Record<string, unknown>) => Promise<unknown>): Promise<Response> {
  try {
    const header = request.headers.get("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    const version = request.headers.get("x-companion-version") ?? undefined;
    const device = token ? await deviceForToken(token, version) : null;
    if (!device) return json({ error: "This companion is not paired or was removed. Pair it again." }, 401);
    const body = (await readBody(request)) as Record<string, unknown>;
    return json(await fn(device, body ?? {}));
  } catch (err) {
    if (err instanceof JobError) return json({ error: err.message }, err.status);
    console.error("[runner]", err);
    return json({ error: err instanceof Error ? err.message : "Server error" }, 500);
  }
}

export async function withoutDevice(request: Request, fn: (body: Record<string, unknown>) => Promise<unknown>): Promise<Response> {
  try {
    const body = (await readBody(request)) as Record<string, unknown>;
    return json(await fn(body ?? {}));
  } catch (err) {
    if (err instanceof JobError) return json({ error: err.message }, err.status);
    console.error("[runner]", err);
    return json({ error: err instanceof Error ? err.message : "Server error" }, 500);
  }
}

export const str = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");
