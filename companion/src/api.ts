import { COMPANION_VERSION, type CompanionConfig } from "./config.ts";

/** The companion's only network peer besides the portals: its paired ArziDesk. */

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export interface Api {
  post<T>(path: string, body?: unknown): Promise<T>;
  get<T>(path: string): Promise<T>;
  getText(path: string): Promise<string>;
}

export function httpApi(cfg: Pick<CompanionConfig, "server" | "token">): Api {
  const base = cfg.server.replace(/\/$/, "");
  const headers = () => ({
    Authorization: `Bearer ${cfg.token}`,
    "x-companion-version": COMPANION_VERSION,
    "Content-Type": "application/json",
  });
  async function call(path: string, init: RequestInit): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(`${base}${path}`, { ...init, headers: headers(), signal: AbortSignal.timeout(60_000) });
    } catch (err) {
      throw new ApiError(0, `Cannot reach ArziDesk at ${base}: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!res.ok) {
      let message = `${res.status} ${res.statusText}`;
      try {
        const body = (await res.json()) as { error?: string };
        if (body.error) message = body.error;
      } catch {
        /* not JSON */
      }
      throw new ApiError(res.status, message);
    }
    return res;
  }
  return {
    async post<T>(path: string, body?: unknown) {
      return (await (await call(path, { method: "POST", body: JSON.stringify(body ?? {}) })).json()) as T;
    },
    async get<T>(path: string) {
      return (await (await call(path, { method: "GET" })).json()) as T;
    },
    async getText(path: string) {
      return (await call(path, { method: "GET" })).text();
    },
  };
}

/** Pairing happens before there is a token. */
export async function pair(server: string, code: string, name: string): Promise<{ deviceId: string; token: string }> {
  const res = await fetch(`${server.replace(/\/$/, "")}/api/runner/pair`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, name, version: COMPANION_VERSION }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await res.json().catch(() => ({}))) as { deviceId?: string; token?: string; error?: string };
  if (!res.ok || !body.token || !body.deviceId) throw new ApiError(res.status, body.error ?? `Pairing failed (${res.status})`);
  return { deviceId: body.deviceId, token: body.token };
}
