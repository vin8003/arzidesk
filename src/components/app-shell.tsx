import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { FilePlus2, FolderOpen, LayoutDashboard, MonitorSmartphone, Wallet } from "lucide-react";
import { AccountMenu } from "@/components/account-menu";
import { BrandMark } from "@/components/brand-mark";
import { WalletChip } from "@/components/wallet-chip";
import { adminNavFlag } from "@/lib/admin/store";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import type { OutputLang } from "@/lib/lang";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", key: "today", icon: LayoutDashboard },
  { to: "/cases", key: "cases", icon: FolderOpen },
  { to: "/cases/new", key: "new", icon: FilePlus2 },
  { to: "/wallet", key: "wallet", icon: Wallet },
  { to: "/companion", key: "companion", icon: MonitorSmartphone },
] as const;

export type NavKey = (typeof NAV)[number]["key"];

const LABELS: Record<OutputLang, Record<NavKey, string>> = {
  en: { today: "Today", cases: "Cases", new: "New filing", wallet: "Wallet", companion: "Companion" },
  hi: { today: "आज", cases: "केस", new: "नई फ़ाइलिंग", wallet: "वॉलेट", companion: "कम्पैनियन" },
};

let adminCache: { userId: string; admin: boolean } | null = null;

function useIsAdmin(userId: string | undefined) {
  const [admin, setAdmin] = useState(() => (adminCache && adminCache.userId === userId ? adminCache.admin : false));
  useEffect(() => {
    if (!userId) {
      setAdmin(false);
      return;
    }
    let live = true;
    adminNavFlag()
      .then((row) => {
        adminCache = { userId, admin: Boolean(row?.admin) };
        if (live) setAdmin(adminCache.admin);
      })
      .catch(() => {
        if (live) setAdmin(false);
      });
    return () => {
      live = false;
    };
  }, [userId]);
  return admin;
}

export function AppShell({
  lang,
  onLang,
  active,
  children,
}: {
  lang: OutputLang;
  onLang: (next: OutputLang) => void;
  active: NavKey | "none";
  children: ReactNode;
}) {
  const { user } = useCurrentUserState();
  const isAdmin = useIsAdmin(user?.id);
  const labels = LABELS[lang];
  const app = "ArziDesk";

  return (
    <div className="shell">
      <a href="#main" className="skip-link">
        {lang === "hi" ? "मुख्य भाग पर जाएँ" : "Skip to content"}
      </a>

      <aside className="sidebar no-print" aria-label={app}>
        <div className="side-top">
          <Link to="/" className="brand" aria-label={app}>
            <BrandMark className="size-6" />
            <span className="brand-word" translate="no">
              {app}
            </span>
          </Link>
        </div>

        <nav className="side-nav" aria-label={app}>
          {NAV.map((item) => {
            const Icon = item.icon;
            const on = active === item.key;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn("side-link", on && "is-on")}
                aria-current={on ? "page" : undefined}
              >
                <Icon className="size-4" aria-hidden />
                {labels[item.key]}
              </Link>
            );
          })}
        </nav>

        <div className="side-foot">
          {user ? <WalletChip lang={lang} /> : null}
          <AccountMenu lang={lang} onLang={onLang} isAdmin={isAdmin} />
        </div>
      </aside>

      <div className="shell-col">
        <header className="topbar no-print">
          <div className="topbar-inner">
            <Link to="/" className="brand" aria-label={app}>
              <BrandMark className="size-6" />
              <span className="brand-word" translate="no">
                {app}
              </span>
            </Link>
            <div className="topbar-actions">
              {user ? <WalletChip lang={lang} compact /> : null}
              <AccountMenu lang={lang} onLang={onLang} isAdmin={isAdmin} compact />
            </div>
          </div>
        </header>

        <main id="main" className="shell-main" tabIndex={-1}>
          {children}
        </main>
      </div>

      <nav className="tabbar no-print" aria-label={app}>
        <div className="tabbar-inner">
          {NAV.map((item) => {
            const Icon = item.icon;
            const on = active === item.key;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn("tab-link", on && "is-on")}
                aria-current={on ? "page" : undefined}
              >
                <Icon className="size-5" strokeWidth={on ? 2.1 : 1.75} aria-hidden />
                {labels[item.key]}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
