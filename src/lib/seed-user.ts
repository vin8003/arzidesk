import { createServerFn } from "@tanstack/react-start";

function toEmail(username: string) {
  const v = username.trim().toLowerCase();
  if (!v) return "";
  if (v.includes("@")) return v;
  const local = v.replace(/[^a-z0-9._+-]/g, "");
  return local ? `${local}@arzidesk.app` : "";
}

function apiErrorMessage(err: unknown): string {
  if (err && typeof err === "object") {
    const rec = err as { message?: unknown; body?: { message?: unknown } };
    if (typeof rec.body?.message === "string" && rec.body.message.trim()) {
      return rec.body.message;
    }
    if (typeof rec.message === "string" && rec.message.trim()) return rec.message;
  }
  if (err instanceof Error && err.message) return err.message;
  return "Sign in failed";
}

type AuthUser = { name?: string | null; email?: string | null };

function pickSessionToken(payload: unknown): { token: string; user?: AuthUser } {
  const rec = (payload ?? {}) as Record<string, unknown>;
  const headers = rec.headers;
  let headerToken = "";
  if (headers instanceof Headers) {
    headerToken = headers.get("set-auth-token") ?? "";
  } else if (headers && typeof headers === "object") {
    const h = headers as Record<string, unknown>;
    const raw = h["set-auth-token"] ?? h["Set-Auth-Token"];
    if (typeof raw === "string") headerToken = raw;
  }
  const nested = rec.response as Record<string, unknown> | undefined;
  const token =
    headerToken ||
    (typeof nested?.token === "string" ? nested.token : "") ||
    (typeof rec.token === "string" ? rec.token : "");
  const user = (nested?.user ?? rec.user) as AuthUser | undefined;
  return { token, user };
}

async function signInForToken(email: string, password: string, name: string) {
  const { auth } = await import("@/lib/auth/server");
  const result = await auth.api.signInEmail({
    body: { email, password },
    returnHeaders: true,
  });
  const picked = pickSessionToken(result);
  if (!picked.token) throw new Error("Sign in failed");
  return {
    token: picked.token,
    name: picked.user?.name ?? name,
    email: picked.user?.email ?? email,
  };
}

export type ChambersAuthInput = {
  username: string;
  password: string;
  mode: "in" | "up";
};

export type ChambersAuthResult =
  | { ok: true; token: string; name: string; email: string }
  | { ok: false; error: string };

/**
 * Email/password sign-in that runs on the server (no browser Origin / CSRF).
 * Required in the Grok live-preview iframe, where `/api/auth/sign-in/email`
 * is rejected as "Invalid origin".
 */
export const chambersAuth = createServerFn({ method: "POST" })
  .validator((input: ChambersAuthInput): ChambersAuthInput => {
    const username = String(input?.username ?? "");
    const password = String(input?.password ?? "");
    const mode = input?.mode === "up" ? "up" : "in";
    return { username, password, mode };
  })
  .handler(async ({ data }): Promise<ChambersAuthResult> => {
    const email = toEmail(data.username);
    const password = data.password;
    const name = data.username.trim() || email;
    if (!email || password.length < 8) {
      return {
        ok: false,
        error: "Username and a password of at least 8 characters are required.",
      };
    }

    try {
      if (data.mode === "up") {
        const { auth } = await import("@/lib/auth/server");
        try {
          await auth.api.signUpEmail({
            body: { email, password, name },
          });
        } catch (err) {
          return { ok: false, error: apiErrorMessage(err) };
        }
      }

      const signed = await signInForToken(email, password, name);
      return { ok: true, ...signed };
    } catch (err) {
      return { ok: false, error: apiErrorMessage(err) };
    }
  });
