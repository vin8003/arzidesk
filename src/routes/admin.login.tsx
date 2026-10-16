import { useState, type FormEvent } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Field, Hint, Input, Label } from "@/components/ui/field";
import { adminSession } from "@/lib/admin/store";
import { authClient, signOut } from "@/lib/auth/client";
import { chambersAuth } from "@/lib/seed-user";

export const Route = createFileRoute("/admin/login")({ component: AdminLogin });

function stashToken(token: string | null | undefined) {
  if (!token || typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem("grok-auth.bearer-token", token);
  } catch {
    /* ignore */
  }
}

export function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || password.length < 8) {
      setError("Email and a password of at least 8 characters are required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await chambersAuth({
        data: { username: email.trim(), password, mode: "in" },
      });
      if (!result.ok) throw new Error(result.error || "Sign in failed");
      if (!result.token) throw new Error("Sign in failed");
      stashToken(result.token);
      try {
        await authClient.getSession();
      } catch {
        /* bearer in sessionStorage */
      }
      try {
        await adminSession();
      } catch {
        await signOut().catch(() => undefined);
        throw new Error("This account is not an admin.");
      }
      navigate({ to: "/admin" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-4 py-10 text-fg">
      <div className="w-full max-w-sm">
        <Link to="/" className="brand">
          <BrandMark className="size-8" />
          <span className="brand-word text-xl">ArziDesk</span>
        </Link>
        <h1 className="mt-8 font-display text-3xl font-medium tracking-tight">Admin</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Sign in with an allowlisted account. There is no admin registration.
        </p>
        <form className="card card-pad mt-8 flex flex-col gap-4" onSubmit={onSubmit}>
          <Field>
            <Label htmlFor="admin-email">Email</Label>
            <Input
              id="admin-email"
              name="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
            <Hint>Must match ADMIN_EMAILS. On the local preview with ADMIN_EMAILS unset, any account works.</Hint>
          </Field>
          <Field>
            <Label htmlFor="admin-password">Password</Label>
            <Input
              id="admin-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              minLength={8}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
          </Field>
          {error ? (
            <p className="rounded-md bg-danger/12 px-3.5 py-3 text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" size="lg" disabled={busy} className="w-full">
            {busy ? "Checking…" : "Sign in"}
          </Button>
        </form>
        <p className="mt-6">
          <Link to="/" className="link-quiet text-sm">
            ← Desk
          </Link>
        </p>
      </div>
    </main>
  );
}
