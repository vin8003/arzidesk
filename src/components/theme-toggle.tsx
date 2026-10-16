import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { applyTheme, currentTheme, type ThemeChoice } from "@/lib/theme";
import type { OutputLang } from "@/lib/lang";

export function useTheme() {
  const [theme, setTheme] = useState<ThemeChoice>("light");
  useEffect(() => setTheme(currentTheme()), []);
  function toggle() {
    const next: ThemeChoice = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  }
  return { theme, toggle };
}

export function ThemeToggle({ lang }: { lang: OutputLang }) {
  const { theme, toggle } = useTheme();
  const label =
    theme === "dark"
      ? lang === "hi" ? "लाइट थीम" : "Switch to light theme"
      : lang === "hi" ? "डार्क थीम" : "Switch to dark theme";
  return (
    <button type="button" onClick={toggle} aria-label={label} title={label} className="icon-btn">
      {theme === "dark" ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
    </button>
  );
}
