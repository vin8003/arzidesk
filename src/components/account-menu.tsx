import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Languages, LogOut, Monitor, Moon, Shield, Sun, Wallet } from "lucide-react";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { signOut } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { applyTheme, themePreference, type ThemePreference } from "@/lib/theme";
import type { OutputLang } from "@/lib/lang";

const COPY = {
  en: {
    account: "Account",
    plan: "Wallet and prices",
    admin: "Admin desk",
    language: "Language",
    theme: "Theme",
    system: "Match system",
    light: "Light",
    dark: "Dark",
    signOut: "Sign out",
    signingOut: "Signing out…",
    signIn: "Sign in",
  },
  hi: {
    account: "अकाउंट",
    plan: "वॉलेट और दरें",
    admin: "एडमिन डेस्क",
    language: "भाषा",
    theme: "थीम",
    system: "सिस्टम जैसा",
    light: "लाइट",
    dark: "डार्क",
    signOut: "बाहर जाएँ",
    signingOut: "निकल रहे हैं…",
    signIn: "लॉगिन",
  },
} as const;

export function initialOf(label: string) {
  return label.trim().charAt(0).toUpperCase() || "·";
}

export function AccountMenu({
  lang,
  onLang,
  isAdmin,
  compact = false,
}: {
  lang: OutputLang;
  onLang: (next: OutputLang) => void;
  isAdmin: boolean;
  compact?: boolean;
}) {
  const c = COPY[lang];
  const navigate = useNavigate();
  const { user, isPending } = useCurrentUserState();
  const [theme, setTheme] = useState<ThemePreference>("system");
  const [leaving, setLeaving] = useState(false);

  useEffect(() => setTheme(themePreference()), []);

  if (isPending) return <div className={compact ? "skeleton size-9" : "skeleton h-11 w-full"} />;
  if (!user) {
    return (
      <a href="/login" className={compact ? "link-accent px-2 text-sm" : "account-btn link-accent text-sm"}>
        {c.signIn}
      </a>
    );
  }

  const name = user.displayName?.trim() || user.primaryEmail?.split("@")[0] || c.account;
  const email = user.primaryEmail && !user.primaryEmail.endsWith("@arzidesk.app") ? user.primaryEmail : "";

  return (
    <Menu>
      <MenuTrigger asChild>
        {compact ? (
          <button type="button" className="icon-btn" aria-label={c.account}>
            <span className="avatar" aria-hidden>
              {initialOf(name)}
            </span>
          </button>
        ) : (
          <button type="button" className="account-btn">
            <span className="avatar" aria-hidden>
              {initialOf(name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[0.8125rem] font-medium">{name}</span>
              {email ? <span className="block truncate text-xs text-muted">{email}</span> : null}
            </span>
          </button>
        )}
      </MenuTrigger>
      <MenuContent align={compact ? "end" : "start"} side={compact ? "bottom" : "top"} className="w-64">
        <MenuLabel>
          <span className="block truncate text-[0.8125rem] font-medium text-fg">{name}</span>
          {email ? <span className="block truncate">{email}</span> : null}
        </MenuLabel>
        <MenuSeparator />
        <MenuItem icon={<Wallet className="size-4" />} onSelect={() => navigate({ to: "/wallet" })}>
          {c.plan}
        </MenuItem>
        {isAdmin ? (
          <MenuItem icon={<Shield className="size-4" />} onSelect={() => navigate({ to: "/admin" })}>
            {c.admin}
          </MenuItem>
        ) : null}
        <MenuSeparator />
        <MenuLabel>{c.language}</MenuLabel>
        <MenuRadioGroup value={lang} onValueChange={(next) => onLang(next as OutputLang)}>
          <MenuRadioItem value="en" icon={<Languages className="size-4" />}>
            English
          </MenuRadioItem>
          <MenuRadioItem value="hi" icon={<Languages className="size-4" />}>
            हिन्दी
          </MenuRadioItem>
        </MenuRadioGroup>
        <MenuSeparator />
        <MenuLabel>{c.theme}</MenuLabel>
        <MenuRadioGroup
          value={theme}
          onValueChange={(next) => {
            applyTheme(next as ThemePreference);
            setTheme(next as ThemePreference);
          }}
        >
          <MenuRadioItem value="system" icon={<Monitor className="size-4" />}>
            {c.system}
          </MenuRadioItem>
          <MenuRadioItem value="light" icon={<Sun className="size-4" />}>
            {c.light}
          </MenuRadioItem>
          <MenuRadioItem value="dark" icon={<Moon className="size-4" />}>
            {c.dark}
          </MenuRadioItem>
        </MenuRadioGroup>
        <MenuSeparator />
        <MenuItem
          icon={<LogOut className="size-4" />}
          disabled={leaving}
          onSelect={() => {
            setLeaving(true);
            void signOut().catch(() => setLeaving(false));
          }}
        >
          {leaving ? c.signingOut : c.signOut}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
