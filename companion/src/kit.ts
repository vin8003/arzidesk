import type { Locator, Page } from "playwright";
import { fingerprint } from "../../src/lib/automation/fingerprint.ts";
import { GATE_TIMEOUT_MS } from "../../src/lib/automation/jobs.ts";
import { pickOption, type Mapping, type MapperRequest, type OptionRequest } from "../../src/lib/automation/match.ts";
import { findRtiRegistration, isoFromIndian, parsePmKisanStatus, parseRtiStatus } from "../../src/lib/automation/receipt.ts";
import type { ArtifactKind, FailureClass, Gate, GateKind, Inventory, JobEventKind } from "../../src/lib/automation/types.ts";
import { compareReadback, describeMismatches } from "../../src/lib/automation/verify.ts";
import type { ClickTarget, FieldSpec, GateOptions, Kit } from "../recipes/types.ts";
import { rewriteUrl } from "./config.ts";
import { inventoryInPage, markInPage, radioLabelsInPage, readInPage, strippedDomInPage, type MarkResult } from "./dom.ts";
import { showOverlay, onOverlayAction, type OverlayState } from "./overlay.ts";
import { redactDom } from "./redact.ts";

/** A classified stop. Anything else thrown by a recipe is `internal`. */
export class KitFailure extends Error {
  readonly failure: FailureClass;
  readonly stepId: string;
  constructor(failure: FailureClass, message: string, stepId = "") {
    super(message);
    this.name = "KitFailure";
    this.failure = failure;
    this.stepId = stepId;
  }
}

export type ProgressReport = {
  events?: Array<{ kind: JobEventKind; text: string; data?: unknown }>;
  status?: "running" | "waiting_human" | "submitting";
  gate?: Gate | null;
  /** The portal refused the submit: lift the reconcile boundary. */
  clearSubmit?: boolean;
};

/** Where a kit reports to: the ArziDesk runner API, a test, or the canary collector. */
export interface JobChannel {
  progress(report: ProgressReport): Promise<{ cancel: boolean }>;
  artifact(a: { kind: ArtifactKind; name: string; contentType: string; body: string; shareable: boolean }): Promise<string | null>;
  mapFields?(req: MapperRequest): Promise<Mapping | null>;
  mapOption?(req: OptionRequest): Promise<{ option: string | null; confidence: number } | null>;
}

export type KitOptions<P> = {
  page: Page;
  payload: P;
  redact: string[];
  channel: JobChannel;
  recipeId: string;
  title: string;
  dryRun?: boolean;
  gateTimeoutMs?: number;
  /** Tests: plays the operator at each gate. */
  autopilot?: (gate: Gate, page: Page) => Promise<void>;
  print?: (line: string) => void;
};

export type RunKit<P> = Kit<P> & {
  /** Steps where a label had to be found by the fallback: the recipe needs a repair even if the job succeeded. */
  readonly softDrift: Set<string>;
  currentStep(): string;
  captureFailure(): Promise<void>;
  overlay(state: Partial<OverlayState>): Promise<void>;
  close(): void;
};

const MIN_MAP_CONFIDENCE = 0.6;

function istToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function sources(label: FieldSpec["label"]): Array<{ source: string; flags: string }> {
  if (!label) return [];
  return (Array.isArray(label) ? label : [label]).map((re) => ({ source: re.source, flags: re.flags.replace("g", "") }));
}

export function createKit<P>(opts: KitOptions<P>): RunKit<P> {
  const { page, channel } = opts;
  const dryRun = Boolean(opts.dryRun);
  const print = opts.print ?? (() => {});
  const gateTimeout = opts.gateTimeoutMs ?? GATE_TIMEOUT_MS;
  const softDrift = new Set<string>();
  const assisted = new Set<string>();
  let step = "start";
  let cancelled = false;
  let inSubmit = false;
  let tokenSeq = 0;
  let pressed: "continue" | "stop" | null = null;
  let overlayState: OverlayState = { title: opts.title, message: "Starting…", tone: "work", canContinue: false };

  page.setDefaultTimeout(20_000);
  onOverlayAction(page, (action) => {
    pressed = action;
    if (action === "stop") cancelled = true;
  });
  const redraw = () => void showOverlay(page, overlayState);
  page.on("load", redraw);
  page.on("domcontentloaded", redraw);

  const fail = (failure: FailureClass, message: string): never => {
    throw new KitFailure(failure, message, step);
  };

  const live = () => {
    if (cancelled) fail("cancelled", "Stopped by the operator.");
  };

  async function send(report: ProgressReport): Promise<void> {
    const res = await channel.progress(report).catch((err: unknown) => {
      print(`! could not reach ArziDesk: ${err instanceof Error ? err.message : String(err)}`);
      return { cancel: false };
    });
    if (res.cancel && !inSubmit) cancelled = true;
  }

  async function event(kind: JobEventKind, text: string, data?: unknown): Promise<void> {
    print(`${kind === "warning" ? "!" : "·"} ${text}`);
    await send({ events: [{ kind, text, data }] });
  }

  async function overlay(state: Partial<OverlayState>): Promise<void> {
    overlayState = { ...overlayState, ...state };
    await showOverlay(page, overlayState);
  }

  async function inventory(): Promise<Inventory> {
    const fields = await page.evaluate(inventoryInPage).catch(() => []);
    return { url: page.url().replace(/[?#].*$/, ""), title: await page.title().catch(() => ""), fields };
  }

  async function mark(spec: FieldSpec): Promise<{ res: MarkResult; token: string }> {
    tokenSeq += 1;
    const token = `${spec.key.replace(/[^\w-]/g, "_")}-${tokenSeq}`;
    const res = await page.evaluate(markInPage, { token, name: spec.name, id: spec.id, css: spec.css, labels: sources(spec.label), kinds: spec.kinds });
    return { res, token };
  }

  /** Redacted DOM and inventory of the page a recipe no longer matches: what the repair pipeline works from. */
  const evidenced = new Set<string>();
  async function evidence(): Promise<void> {
    if (evidenced.has(step)) return;
    evidenced.add(step);
    const inv = await inventory();
    const dom = await page.evaluate(strippedDomInPage).catch(() => "");
    if (dom) await channel.artifact({ kind: "dom", name: `${step}.html`, contentType: "text/html", body: redactDom(dom, opts.redact), shareable: true }).catch(() => null);
    await channel.artifact({ kind: "inventory", name: `${step}.json`, contentType: "application/json", body: JSON.stringify(inv), shareable: true }).catch(() => null);
  }

  /** The model fallback: labels and key names to ArziDesk, a control key back. */
  async function viaMapper(spec: FieldSpec): Promise<{ res: MarkResult; token: string } | null> {
    if (!channel.mapFields || dryRun) return null;
    const inv = await inventory();
    const mapping = await channel.mapFields({ recipeId: opts.recipeId, keys: [{ key: spec.key, description: spec.describe }], fields: inv.fields }).catch(() => null);
    const hit = mapping?.[spec.key];
    if (!hit?.field || hit.confidence < MIN_MAP_CONFIDENCE) return null;
    const info = inv.fields.find((f) => f.key === hit.field);
    if (!info) return null;
    const found = await mark({ ...spec, label: undefined, name: info.name || undefined, id: info.id || undefined });
    if (!found.res.found) return null;
    softDrift.add(step);
    await event("warning", `"${spec.describe}" was placed by the fallback on ${step}; a recipe repair is due.`, { drift: true, stepId: step, key: spec.key });
    await evidence();
    return found;
  }

  async function locate(spec: FieldSpec): Promise<{ loc: Locator; res: Extract<MarkResult, { found: true }>; token: string } | null> {
    let found = await mark(spec);
    if (!found.res.found) {
      const mapped = await viaMapper(spec);
      if (!mapped) return null;
      found = mapped;
    }
    if (!found.res.found) return null;
    return { loc: page.locator(`[data-arzi="${found.token}"]`), res: found.res, token: found.token };
  }

  async function gate(kind: GateKind, message: string, g: GateOptions = {}): Promise<void> {
    if (dryRun) fail("internal", "A canary reached a human gate; canaries must stop before gates.");
    live();
    const info: Gate = { kind, message, field: g.field, value: g.value, since: new Date().toISOString() };
    pressed = null;
    await send({ status: "waiting_human", gate: info, events: [{ kind: "gate", text: `Needs the operator: ${kind}` }] });
    await overlay({ message, tone: "gate", canContinue: true, value: g.value });
    page.bringToFront().catch(() => {});
    if (opts.autopilot) void opts.autopilot(info, page).catch((err) => print(`autopilot: ${err}`));
    const started = Date.now();
    let lastBeat = Date.now();
    let byPage = false;
    for (;;) {
      live();
      if (g.until && (await g.until().catch(() => false))) {
        byPage = true;
        break;
      }
      if (pressed === "continue") break;
      if (Date.now() - started > (g.timeoutMs ?? gateTimeout)) fail("human_timeout", `No one finished the ${kind} step in time.`);
      if (Date.now() - lastBeat > 20_000) {
        lastBeat = Date.now();
        await send({});
      }
      await page.waitForTimeout(400).catch(() => {});
    }
    pressed = null;
    await overlay({ message: "Working…", tone: "work", canContinue: false, value: undefined });
    await send({ status: inSubmit ? "submitting" : "running", gate: null, events: [{ kind: "gate", text: `${kind} done` }] });
    if (!byPage && g.onContinue) await g.onContinue();
  }

  async function assist(spec: FieldSpec, value: string, what: string): Promise<void> {
    if (dryRun) fail("drift", `Cannot find "${spec.describe}".`);
    softDrift.add(step);
    assisted.add(spec.key);
    await event("warning", `"${spec.describe}" not found on ${step}; asked the operator.`, { drift: true, stepId: step, key: spec.key });
    await evidence();
    await gate("assist", what, { field: spec.describe, value });
  }

  const kit: RunKit<P> = {
    page,
    payload: opts.payload,
    dryRun,
    softDrift,
    lib: {
      findRtiRegistration,
      parseRtiStatus,
      parsePmKisanStatus,
      isoFromIndian,
      pickOption: (wanted, options) => pickOption(wanted, options),
    },
    currentStep: () => step,

    log: (text) => event("log", text),
    warn: (text) => event("warning", text),

    async goto(url) {
      live();
      const target = rewriteUrl(url);
      let status = 0;
      try {
        const res = await page.goto(target, { waitUntil: "domcontentloaded", timeout: 45_000 });
        status = res?.status() ?? 0;
      } catch (err) {
        fail("portal_down", `Could not open ${new URL(url).host}: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
      }
      if (status >= 500) fail("portal_down", `${new URL(url).host} answered ${status}.`);
      await showOverlay(page, overlayState);
    },

    async checkpoint(stepId) {
      step = stepId;
      const inv = await inventory();
      await send({ events: [{ kind: "checkpoint", text: `At ${stepId}`, data: { stepId, fingerprint: fingerprint(inv), inventory: inv } }] });
      print(`· at ${stepId} (${inv.fields.length} fields)`);
      return inv;
    },

    inventory,

    async text() {
      return page.evaluate(() => document.body?.innerText ?? "").catch(() => "");
    },

    async has(spec) {
      // Asked while the portal navigates: "not there yet".
      return mark(spec)
        .then((m) => m.res.found)
        .catch(() => false);
    },

    async field(spec) {
      live();
      const hit = await locate(spec);
      if (!hit) fail("drift", `Cannot find "${spec.describe}" on ${step}.`);
      return hit!.loc.first();
    },

    async fill(spec, value) {
      live();
      if (dryRun) fail("internal", "Canaries never type.");
      const hit = await locate({ ...spec, kinds: spec.kinds ?? ["text", "textarea"] });
      if (!hit) return assist(spec, value, `Type this into "${spec.describe}", then press Continue.`);
      const loc = hit.loc.first();
      await loc.fill(value);
      await loc.dispatchEvent("change").catch(() => {});
      await loc.dispatchEvent("blur").catch(() => {});
    },

    async pick(spec, value, o = {}) {
      live();
      if (dryRun) fail("internal", "Canaries never choose.");
      const wanted = typeof value === "boolean" ? (value ? "Yes" : "No") : value;
      const hit = await locate({ ...spec, kinds: spec.kinds ?? ["select", "radio", "checkbox"] });
      if (!hit) {
        await assist(spec, wanted, `Choose "${wanted}" for "${spec.describe}", then press Continue.`);
        return wanted;
      }
      const { loc, res, token } = hit;
      if (res.type === "checkbox") {
        const on = typeof value === "boolean" ? value : /^(yes|true|1)$/i.test(value);
        await loc.first().setChecked(on);
        return on ? "true" : "false";
      }
      if (res.group) {
        const labels = await page.evaluate(radioLabelsInPage, token);
        const p = pickOption(wanted, labels, { min: 0.5, margin: 0.01 });
        if (!p) {
          await assist(spec, wanted, `Choose "${wanted}" for "${spec.describe}", then press Continue.`);
          return wanted;
        }
        await loc.nth(labels.indexOf(p.option)).check({ force: true });
        await loc.nth(labels.indexOf(p.option)).dispatchEvent("click").catch(() => {});
        await kit.settle(300);
        return p.option;
      }
      const select = loc.first();
      const readOptions = () => select.evaluate((el) => Array.from((el as HTMLSelectElement).options).map((x) => x.text.replace(/\s+/g, " ").trim()));
      let options = await readOptions();
      if (o.waitForOptions && options.filter(Boolean).length <= 1) {
        await kit.waitFor(async () => (await readOptions()).filter(Boolean).length > 1, 15_000);
        options = await readOptions();
      }
      let choice = pickOption(wanted, options)?.option ?? null;
      if (!choice && o.publicValue && channel.mapOption) {
        const m = await channel.mapOption({ recipeId: opts.recipeId, wanted, options }).catch(() => null);
        if (m?.option && m.confidence >= MIN_MAP_CONFIDENCE) {
          choice = m.option;
          await event("log", `Matched "${spec.describe}" with the fallback.`);
        }
      }
      if (!choice) {
        assisted.add(spec.key);
        await gate("assist", `Choose "${wanted}" in "${spec.describe}", then press Continue.`, { field: spec.describe, value: wanted });
        return (await page.evaluate(readInPage, token)) ?? wanted;
      }
      // selectOption fires input + change itself; a second change makes AJAX-fed dropdowns load twice.
      await select.selectOption({ label: options.find((x) => x === choice) ?? choice });
      await kit.settle(500);
      return choice;
    },

    async click(target) {
      live();
      if (dryRun) fail("internal", "Canaries never click.");
      let loc: Locator | null = null;
      if (target.css) loc = page.locator(target.css).first();
      else if (target.value !== undefined) {
        const v = target.value;
        const all = page.locator("input[type=submit], input[type=button], button");
        const n = await all.count();
        for (let i = 0; i < n && !loc; i += 1) {
          const el = all.nth(i);
          const text = ((await el.getAttribute("value")) ?? (await el.innerText().catch(() => ""))).trim();
          if (typeof v === "string" ? text.toLowerCase() === v.toLowerCase() : v.test(text)) loc = el;
        }
      } else if (target.name !== undefined) {
        loc = page.getByRole(target.role ?? "button", { name: target.name }).first();
        if (!(await loc.count())) {
          const label = target.name;
          loc = page
            .locator("input[type=submit], input[type=button], button, a")
            .filter({ hasText: typeof label === "string" ? label : label })
            .first();
          if (!(await loc.count())) {
            const byValue = page.locator(`input[type=submit][value], input[type=button][value]`);
            const n = await byValue.count();
            loc = null;
            for (let i = 0; i < n && !loc; i += 1) {
              const val = (await byValue.nth(i).getAttribute("value")) ?? "";
              if (typeof label === "string" ? val.toLowerCase().includes(label.toLowerCase()) : label.test(val)) loc = byValue.nth(i);
            }
          }
        }
      }
      if (!loc || !(await loc.count())) fail("drift", `Cannot find the button ${String(target.name ?? target.value ?? target.css)} on ${step}.`);
      await loc!.click();
      await kit.settle();
    },

    async settle(ms = 400) {
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
      await page.waitForTimeout(ms).catch(() => {});
    },

    async waitFor(cond, timeoutMs) {
      const end = Date.now() + timeoutMs;
      while (Date.now() < end) {
        live();
        if (await cond().catch(() => false)) return true;
        await page.waitForTimeout(400).catch(() => {});
      }
      return false;
    },

    gate,

    async verify(expected) {
      live();
      const want: Record<string, string> = {};
      const got: Record<string, string | null> = {};
      for (const { spec, value } of expected) {
        if (assisted.has(spec.key)) continue;
        want[spec.key] = value;
        const { res, token } = await mark(spec);
        got[spec.key] = res.found ? await page.evaluate(readInPage, token) : null;
      }
      const bad = compareReadback(want, got);
      if (bad.length) fail("validation", `The form does not hold what was filled (${describeMismatches(bad)}). Nothing was submitted.`);
      await event("log", `Read back ${Object.keys(want).length} fields: all match.`);
    },

    async submit(label, fn) {
      live();
      if (dryRun) fail("internal", "Canaries never submit.");
      inSubmit = true;
      await send({ status: "submitting", events: [{ kind: "status", text: `Submitting: ${label}` }] });
      await overlay({ message: `${label}. Do not close this window.`, tone: "work", canContinue: false });
      return fn();
    },

    async submitRejected(reason) {
      inSubmit = false;
      await send({ status: "running", clearSubmit: true, events: [{ kind: "warning", text: `The portal did not accept it: ${reason}` }] });
    },

    async screenshot(name, o = {}) {
      try {
        await page.evaluate(() => {
          const el = document.getElementById("arzidesk-overlay");
          if (el) el.style.display = "none";
        });
        let buf = await page.screenshot({ fullPage: true, type: "png" });
        let type = "image/png";
        if (buf.length > 1_000_000) {
          buf = await page.screenshot({ fullPage: true, type: "jpeg", quality: 60 });
          type = "image/jpeg";
        }
        await page.evaluate(() => {
          const el = document.getElementById("arzidesk-overlay");
          if (el) el.style.display = "";
        });
        return channel.artifact({ kind: o.receipt ? "receipt" : "screenshot", name, contentType: type, body: buf.toString("base64"), shareable: false });
      } catch (err) {
        print(`! screenshot failed: ${err instanceof Error ? err.message : String(err)}`);
        return null;
      }
    },

    fail,
    today: istToday,

    async captureFailure() {
      evidenced.delete(step);
      await evidence();
      await kit.screenshot(`${step}-failure`);
    },

    overlay,

    close() {
      page.off("load", redraw);
      page.off("domcontentloaded", redraw);
    },
  };
  return kit;
}

export type { ClickTarget };
