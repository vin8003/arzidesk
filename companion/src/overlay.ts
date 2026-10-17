import type { BrowserContext, Page } from "playwright";

/**
 * The ArziDesk panel inside the portal tab: what the job is doing, what the
 * operator must do now, Continue and Stop. Lives in a shadow root so portal
 * CSS cannot touch it, and is redrawn after every navigation.
 */

export type OverlayState = {
  title: string;
  message: string;
  tone: "work" | "gate" | "done" | "error";
  /** Show Continue (gates). */
  canContinue: boolean;
  /** assist gates: the value to put in by hand, with a copy button. */
  value?: string;
};

type Action = "continue" | "stop";
type Handler = (action: Action) => void;

const handlers = new WeakMap<Page, Handler>();
const bound = new WeakSet<BrowserContext>();

/** Wire the page → companion callback once per browser context. */
export async function bindOverlay(context: BrowserContext): Promise<void> {
  if (bound.has(context)) return;
  bound.add(context);
  await context.exposeBinding("__arzideskAction", (source, action: string) => {
    const h = handlers.get(source.page);
    if (h && (action === "continue" || action === "stop")) h(action);
  });
}

export function onOverlayAction(page: Page, handler: Handler): void {
  handlers.set(page, handler);
}

function render(state: OverlayState): void {
  const id = "arzidesk-overlay";
  let host = document.getElementById(id);
  if (!host) {
    host = document.createElement("div");
    host.id = id;
    host.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;";
    host.attachShadow({ mode: "open" });
    (document.body ?? document.documentElement).appendChild(host);
  }
  const root = host.shadowRoot!;
  const tones: Record<string, string> = { work: "#2563eb", gate: "#d97706", done: "#16a34a", error: "#dc2626" };
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  root.innerHTML = `
    <style>
      .card{font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;background:#fff;color:#111;width:320px;max-width:calc(100vw - 32px);
        border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.25);border-top:4px solid ${tones[state.tone]};padding:12px 14px}
      .head{display:flex;justify-content:space-between;align-items:center;font-weight:600;font-size:12px;letter-spacing:.02em;color:#555}
      .msg{margin:8px 0 10px;font-size:15px;font-weight:600}
      .val{display:flex;gap:6px;margin-bottom:10px}
      .val code{flex:1;background:#f3f4f6;border-radius:6px;padding:6px 8px;font-size:13px;word-break:break-all;max-height:120px;overflow:auto}
      .row{display:flex;gap:8px;justify-content:flex-end}
      button{font:inherit;border:0;border-radius:8px;padding:7px 12px;cursor:pointer}
      .go{background:${tones.gate};color:#fff;font-weight:600}
      .stop{background:#f3f4f6;color:#333}
    </style>
    <div class="card" role="status" aria-live="polite">
      <div class="head"><span>ARZIDESK</span><span>${esc(state.title)}</span></div>
      <div class="msg">${esc(state.message)}</div>
      ${state.value ? `<div class="val"><code>${esc(state.value)}</code><button class="stop" data-a="copy">Copy</button></div>` : ""}
      <div class="row">
        ${state.tone === "done" || state.tone === "error" ? "" : `<button class="stop" data-a="stop">Stop</button>`}
        ${state.canContinue ? `<button class="go" data-a="continue">Continue</button>` : ""}
      </div>
    </div>`;
  root.querySelectorAll("button").forEach((b) => {
    b.addEventListener("click", () => {
      const a = b.getAttribute("data-a");
      if (a === "copy") {
        void navigator.clipboard?.writeText(state.value ?? "");
        return;
      }
      const fn = (window as unknown as { __arzideskAction?: (x: string) => void }).__arzideskAction;
      fn?.(a ?? "");
    });
  });
}

export async function showOverlay(page: Page, state: OverlayState): Promise<void> {
  await page.evaluate(render, state).catch(() => {
    /* page mid-navigation; redrawn on load */
  });
}
