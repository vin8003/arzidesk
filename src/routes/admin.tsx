import { Link, Outlet, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import { adminSession } from "@/lib/admin/store";
import { signOut } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin")({ component: AdminLayout });

export function AdminLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isLogin = pathname === "/admin/login";
  const { user, isPending } = useCurrentUserState();
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (isLogin) return;
    if (isPending) return;
    if (!user) {
      navigate({ to: "/admin/login" });
      return;
    }
    adminSession()
      .then((s) => setEmail(s.email))
      .catch((err) => {
        const msg = String(err?.message ?? err);
        if (/unauthorized/i.test(msg)) navigate({ to: "/admin/login" });
        else setBlocked(true);
      });
  }, [isLogin, isPending, user, navigate]);

  if (isLogin) return <Outlet />;

  if (blocked) {
    return (
      <main className="grid min-h-dvh place-items-center bg-bg px-4 text-fg">
        <div className="max-w-sm text-center">
          <p className="font-display text-2xl">Desk only.</p>
          <p className="mt-3 text-sm text-muted">This login is not on the admin list.</p>
          <Link to="/" className="link-accent mt-6 inline-block text-sm">
            Back to ArziDesk
          </Link>
        </div>
      </main>
    );
  }

  if (!email) {
    return (
      <main className="grid min-h-dvh place-items-center bg-bg">
        <div className="skeleton h-10 w-48" />
      </main>
    );
  }

  return (
    <div className="shell min-h-dvh bg-bg text-fg">
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/admin" className="brand">
            <BrandMark className="size-7" />
            <span className="brand-word">Admin</span>
          </Link>
          <nav className="admin-tabs" aria-label="Admin">
            <Link to="/admin" className={cn("admin-tab", pathname === "/admin" && "is-on")}>
              Stats
            </Link>
            <Link to="/admin/users" className={cn("admin-tab", pathname.startsWith("/admin/users") && "is-on")}>
              Users
            </Link>
            <Link to="/admin/prices" className={cn("admin-tab", pathname.startsWith("/admin/prices") && "is-on")}>
              Prices
            </Link>
          </nav>
          <div className="topbar-actions text-xs text-muted">
            <span className="hidden max-w-[10rem] truncate sm:inline">{email}</span>
            <button
              type="button"
              className="link-quiet px-2 py-1"
              onClick={() => void signOut().then(() => navigate({ to: "/admin/login" }))}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <Outlet />
      </main>
    </div>
  );
}
