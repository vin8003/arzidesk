import type { BrowserContext } from "playwright";
import type { ClaimedJob, FailureClass, JobResult } from "../../src/lib/automation/types.ts";
import type { Mapping } from "../../src/lib/automation/match.ts";
import type { Recipe } from "../recipes/types.ts";
import { ApiError, type Api } from "./api.ts";
import { runCanaries } from "./canary.ts";
import { profileDir, saveConfig, type CompanionConfig } from "./config.ts";
import { createKit, KitFailure, type JobChannel, type KitOptions } from "./kit.ts";
import { bindOverlay } from "./overlay.ts";
import { loadLocalRecipe, loadRemoteRecipe } from "./recipes.ts";

/**
 * The kiosk loop: poll ArziDesk, run each job in the operator's Chrome
 * (persistent profile, so portal sessions survive), report every step, and
 * once a day check the recipes' public pages headless.
 */

export type RunOptions = {
  once?: boolean;
  localRecipes?: boolean;
  headless?: boolean;
  /** Skip the daily canary (tests). */
  noCanary?: boolean;
  pollMs?: number;
  print?: (line: string) => void;
};

const CANARY_EVERY_MS = 24 * 60 * 60 * 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function launchBrowser(headless: boolean): Promise<BrowserContext> {
  const { chromium } = await import("playwright");
  const base = { headless, viewport: null, args: ["--start-maximized"], acceptDownloads: false };
  try {
    return await chromium.launchPersistentContext(profileDir(), { ...base, channel: "chrome" });
  } catch {
    // No Google Chrome on this PC: Playwright's own Chromium.
    return chromium.launchPersistentContext(profileDir(), base);
  }
}

export function httpChannel(api: Api, jobId: string): JobChannel {
  return {
    progress: (report) => api.post<{ cancel: boolean }>(`/api/runner/jobs/${jobId}/progress`, report),
    async artifact(a) {
      try {
        return (await api.post<{ id: string }>(`/api/runner/jobs/${jobId}/artifacts`, a)).id;
      } catch {
        return null;
      }
    },
    async mapFields(req) {
      try {
        return (await api.post<{ mapping: Mapping }>("/api/runner/map", { kind: "fields", ...req })).mapping;
      } catch {
        return null;
      }
    },
    async mapOption(req) {
      try {
        return await api.post<{ option: string | null; confidence: number }>("/api/runner/map", { kind: "option", ...req });
      } catch {
        return null;
      }
    },
  };
}

/** A thrown error that is not a KitFailure, classified. */
export function classify(err: unknown): FailureClass {
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  if (/net::ERR_|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ERR_CONNECTION/i.test(msg)) return "portal_down";
  if (/TimeoutError|waiting for locator|strict mode violation|not attached|not visible|element is not/i.test(msg)) return "drift";
  if (/Target page, context or browser has been closed/i.test(msg)) return "cancelled";
  return "internal";
}

export async function runJob(
  api: Api,
  context: BrowserContext,
  job: ClaimedJob,
  opts: {
    localRecipes?: boolean;
    publicKey?: string;
    print?: (s: string) => void;
    loadRecipe?: (id: string) => Promise<Recipe>;
    /** Tests: plays the operator at each gate. */
    autopilot?: KitOptions<unknown>["autopilot"];
  } = {},
): Promise<{ ok: boolean; result?: JobResult; failure?: FailureClass; error?: string; softDrift?: string[] }> {
  const print = opts.print ?? console.log;
  await bindOverlay(context);
  const page = await context.newPage();
  const channel = httpChannel(api, job.id);
  const kit = createKit({ page, payload: job.payload, redact: job.redact, channel, recipeId: job.recipeId, title: job.title, print, autopilot: opts.autopilot });
  print(`▶ ${job.recipeId} for "${job.title}"`);
  try {
    const recipe = opts.loadRecipe
      ? await opts.loadRecipe(job.recipeId)
      : opts.localRecipes
        ? await loadLocalRecipe(job.recipeId)
        : (await loadRemoteRecipe(api, job.recipeId, { publicKey: opts.publicKey, print })).recipe;
    await channel.progress({ events: [{ kind: "log", text: `Recipe ${recipe.id}@${recipe.version}` }] });
    const result = await recipe.run(kit);
    await kit.overlay({ message: `Done. ${result.summary}`, tone: "done", canContinue: false });
    await api.post(`/api/runner/jobs/${job.id}/finish`, { ok: true, result, softDrift: [...kit.softDrift] });
    print(`✓ ${result.summary}${result.reference ? ` · ${result.reference}` : ""}`);
    setTimeout(() => void page.close().catch(() => {}), 8_000).unref();
    return { ok: true, result, softDrift: [...kit.softDrift] };
  } catch (err) {
    const failure = err instanceof KitFailure ? err.failure : classify(err);
    const stepId = err instanceof KitFailure && err.stepId ? err.stepId : kit.currentStep();
    const message = (err instanceof Error ? err.message : String(err)).split("\n")[0].slice(0, 900);
    if (failure === "drift" || failure === "internal" || failure === "validation" || failure === "portal_rejected") {
      await kit.captureFailure().catch(() => {});
    }
    await kit.overlay({ message: `Stopped: ${message}`, tone: "error", canContinue: false }).catch(() => {});
    try {
      await api.post(`/api/runner/jobs/${job.id}/finish`, { ok: false, failure, error: message, stepId });
    } catch (e) {
      print(`! could not report the failure: ${e instanceof Error ? e.message : String(e)}`);
    }
    print(`✗ ${failure}: ${message}`);
    // Left open so the operator can see where it stopped.
    return { ok: false, failure, error: message };
  } finally {
    kit.close();
  }
}

export async function runLoop(cfg: CompanionConfig, api: Api, opts: RunOptions = {}): Promise<void> {
  const print = opts.print ?? console.log;
  let context: BrowserContext | null = null;
  let closed = true;
  let backoff = 5_000;
  const ensure = async () => {
    if (context && !closed) return context;
    context = await launchBrowser(Boolean(opts.headless));
    closed = false;
    context.on("close", () => {
      closed = true;
    });
    return context;
  };
  print(`ArziDesk companion · ${cfg.name} · ${cfg.server}`);
  print("Waiting for jobs. Leave this window open; Chrome opens when a job arrives. Ctrl+C to stop.");
  for (;;) {
    let job: ClaimedJob | null = null;
    try {
      job = (await api.post<{ job: ClaimedJob | null }>("/api/runner/claim")).job;
      backoff = 5_000;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        print(`✗ ${err.message}`);
        process.exitCode = 2;
        return;
      }
      print(`! ${err instanceof Error ? err.message : String(err)} (retrying in ${backoff / 1000}s)`);
      await sleep(backoff);
      backoff = Math.min(backoff * 2, 60_000);
      continue;
    }
    if (job) {
      await runJob(api, await ensure(), job, { localRecipes: opts.localRecipes, publicKey: cfg.recipePublicKey, print });
      continue;
    }
    if (opts.once) return;
    if (!opts.noCanary && (!cfg.lastCanaryAt || Date.now() - Date.parse(cfg.lastCanaryAt) > CANARY_EVERY_MS)) {
      const results = await runCanaries({
        load: (id) => (opts.localRecipes ? loadLocalRecipe(id) : loadRemoteRecipe(api, id, { publicKey: cfg.recipePublicKey }).then((r) => r.recipe)),
        print,
      }).catch((err: unknown) => {
        print(`! canary failed: ${err instanceof Error ? err.message : String(err)}`);
        return [];
      });
      if (results.length) {
        const res = await api
          .post<{ drift: string[] }>("/api/runner/canary", { results: results.map(({ dom: _dom, ...r }) => r) })
          .catch(() => ({ drift: [] as string[] }));
        if (res.drift.length) print(`! portal pages changed: ${res.drift.join(", ")} (repair requested)`);
      }
      cfg.lastCanaryAt = new Date().toISOString();
      saveConfig(cfg);
    }
    await sleep(opts.pollMs ?? 4_000);
  }
}
