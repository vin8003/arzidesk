const PREFIX = "arzidesk.scroll:";

export type ScrollStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function pathKey(pathname: string, search: unknown = "") {
  const path = pathname || "/";
  const q = typeof search === "string" ? search : "";
  if (!q || q === "?") return path;
  return path + (q.startsWith("?") ? q : `?${q}`);
}

export function rememberScroll(key: string, y: number, store?: ScrollStore | null) {
  const bag = store ?? storage();
  if (!bag || !key) return;
  const n = Math.max(0, Math.round(Number(y) || 0));
  try {
    bag.setItem(PREFIX + key, String(n));
  } catch {
    /* private mode */
  }
}

export function readScroll(key: string, store?: ScrollStore | null) {
  const bag = store ?? storage();
  if (!bag || !key) return 0;
  try {
    const n = Number(bag.getItem(PREFIX + key));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function storage(): ScrollStore | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function currentKey() {
  return pathKey(window.location.pathname, window.location.search);
}

function isInAppLink(a: HTMLAnchorElement) {
  if (a.hasAttribute("download")) return false;
  if (a.target && a.target !== "" && a.target !== "_self") return false;
  const href = a.getAttribute("href");
  if (!href || href.startsWith("mailto:") || href.startsWith("tel:")) return false;
  try {
    return new URL(a.href, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}

/** Save the current page before in-app navigation. Unmount is too late — the router may already have reset scroll. */
export function installScrollMemory() {
  if (typeof window === "undefined") return () => {};

  try {
    window.history.scrollRestoration = "manual";
  } catch {
    /* ignore */
  }

  const saveHere = () => rememberScroll(currentKey(), window.scrollY);

  const onClick = (event: Event) => {
    const node = event.target;
    if (!(node instanceof Element)) return;
    const a = node.closest("a[href]");
    if (!(a instanceof HTMLAnchorElement) || !isInAppLink(a)) return;
    const next = new URL(a.href, window.location.href);
    if (pathKey(next.pathname, next.search) === currentKey()) return;
    saveHere();
  };

  window.addEventListener("click", onClick, true);
  window.addEventListener("pagehide", saveHere);
  return () => {
    window.removeEventListener("click", onClick, true);
    window.removeEventListener("pagehide", saveHere);
  };
}

/**
 * Restore a remembered Y once the page is tall enough (lists load after mount).
 * No saved position means a new page — pin to the top so the previous list's
 * offset does not leak through.
 */
export function restoreScroll(key: string) {
  if (typeof window === "undefined") return () => {};
  const y = readScroll(key);
  let raf = 0;
  let tries = 0;
  const stop = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };

  if (y <= 0) {
    return stop;
  }

  const tick = () => {
    window.scrollTo(0, y);
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (Math.abs(window.scrollY - y) <= 2 || max >= y || tries++ >= 90) {
      raf = 0;
      return;
    }
    raf = requestAnimationFrame(tick);
  };
  tick();
  return stop;
}
