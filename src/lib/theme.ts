export type ThemeChoice = "light" | "dark";
export type ThemePreference = ThemeChoice | "system";

const KEY = "cb-theme";

/** Inline in <head> so the right theme paints on the very first frame (no flash). */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

/** The theme actually on screen, with "system" resolved. */
export function currentTheme(): ThemeChoice {
  if (typeof document === "undefined") return "light";
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "light" || attr === "dark") return attr;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** What the person picked: an explicit theme, or following the system. */
export function themePreference(): ThemePreference {
  if (typeof document === "undefined") return "system";
  const attr = document.documentElement.getAttribute("data-theme");
  return attr === "light" || attr === "dark" ? attr : "system";
}

export function applyTheme(next: ThemePreference) {
  const root = document.documentElement;
  if (next === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", next);
  try {
    if (next === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
  } catch {
    /* private mode: the choice just will not persist */
  }
}
