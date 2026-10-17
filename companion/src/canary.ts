import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describeDiff, diffInventory, fingerprint } from "../../src/lib/automation/fingerprint.ts";
import { RECIPES } from "../../src/lib/automation/recipes.ts";
import type { Inventory } from "../../src/lib/automation/types.ts";
import type { Recipe } from "../recipes/types.ts";
import { strippedDomInPage } from "./dom.ts";
import { createKit, KitFailure, type JobChannel } from "./kit.ts";

/**
 * Canaries open each recipe's public pages headless and fingerprint them.
 * They never tick, type or submit. Two consumers: the kiosk companion (daily,
 * results to ArziDesk) and CI (against the baselines committed next to the
 * fixtures; drift fails the job and starts a repair).
 */

export type CanaryResult = {
  recipeId: string;
  version: number;
  stepId: string;
  fingerprint: string;
  inventory: Inventory;
  /** Public page, scripts and values stripped. For the repair agent. */
  dom?: string;
  unreachable?: boolean;
  error?: string;
};

export const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), "../recipes/fixtures");

export function baselinePath(recipeId: string): string {
  return join(FIXTURES, recipeId, "baseline.json");
}

export type Baseline = Record<string, { fingerprint: string; inventory: Inventory }>;

export function readBaseline(recipeId: string): Baseline | null {
  const path = baselinePath(recipeId);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as Baseline;
}

export async function runCanaries(opts: {
  load: (id: string) => Promise<Recipe>;
  only?: string[];
  headed?: boolean;
  print?: (s: string) => void;
}): Promise<CanaryResult[]> {
  const print = opts.print ?? console.log;
  const { chromium } = await import("playwright");
  let browser;
  try {
    browser = await chromium.launch({ headless: !opts.headed, channel: "chrome" });
  } catch {
    browser = await chromium.launch({ headless: !opts.headed });
  }
  const out: CanaryResult[] = [];
  // Some NIC sites answer 500 to a "HeadlessChrome" user agent; look like the Chrome the kiosks run.
  const probe = await browser.newPage();
  const userAgent = (await probe.evaluate(() => navigator.userAgent)).replace(/HeadlessChrome/g, "Chrome");
  await probe.close();
  const context = await browser.newContext({ userAgent, locale: "en-IN" });
  try {
    for (const meta of RECIPES) {
      if (opts.only?.length && !opts.only.includes(meta.id)) continue;
      const recipe = await opts.load(meta.id);
      if (!recipe.canary) continue;
      const page = await context.newPage();
      const seen: CanaryResult[] = [];
      const channel: JobChannel = {
        async progress(report) {
          for (const ev of report.events ?? []) {
            if (ev.kind !== "checkpoint") continue;
            const d = ev.data as { stepId: string; fingerprint: string; inventory: Inventory };
            const dom = await page.evaluate(strippedDomInPage).catch(() => "");
            seen.push({ recipeId: meta.id, version: meta.version, stepId: d.stepId, fingerprint: d.fingerprint, inventory: d.inventory, dom });
          }
          return { cancel: false };
        },
        artifact: async () => null,
      };
      const kit = createKit({ page, payload: {}, redact: [], channel, recipeId: meta.id, title: "canary", dryRun: true });
      try {
        await recipe.canary(kit);
        out.push(...seen);
        print(`· canary ${meta.id}: ${seen.map((s) => `${s.stepId}=${s.fingerprint}`).join(", ")}`);
      } catch (err) {
        const portalDown = err instanceof KitFailure && err.failure === "portal_down";
        out.push({
          recipeId: meta.id,
          version: meta.version,
          stepId: kit.currentStep(),
          fingerprint: "",
          inventory: { url: "", title: "", fields: [] },
          unreachable: portalDown,
          error: err instanceof Error ? err.message : String(err),
        });
        print(`${portalDown ? "·" : "!"} canary ${meta.id}: ${portalDown ? "portal unreachable" : err instanceof Error ? err.message : String(err)}`);
      } finally {
        kit.close();
        await page.close().catch(() => {});
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }
  return out;
}

export type CanaryVerdict = { recipeId: string; stepId: string; status: "ok" | "drift" | "new" | "unreachable" | "error"; diff: string[] };

/** Compare canary results with the committed baselines. */
export function judge(results: CanaryResult[]): CanaryVerdict[] {
  return results.map((r) => {
    if (r.unreachable) return { recipeId: r.recipeId, stepId: r.stepId, status: "unreachable", diff: [] };
    if (r.error) return { recipeId: r.recipeId, stepId: r.stepId, status: "error", diff: [r.error] };
    const base = readBaseline(r.recipeId)?.[r.stepId];
    if (!base) return { recipeId: r.recipeId, stepId: r.stepId, status: "new", diff: [] };
    if (base.fingerprint === fingerprint(r.inventory)) return { recipeId: r.recipeId, stepId: r.stepId, status: "ok", diff: [] };
    return { recipeId: r.recipeId, stepId: r.stepId, status: "drift", diff: describeDiff(diffInventory(base.inventory, r.inventory)) };
  });
}
