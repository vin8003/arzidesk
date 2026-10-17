/**
 * Live check against a running ArziDesk (npm run dev): claims the next queued
 * job with this PC's paired token, fetches the recipe through the manifest
 * (SHA-256 checked), and runs it headless against the mock portal with the
 * test operator at every gate. Everything the server sees is real.
 *
 *   ARZIDESK_HOME=<dir with companion.json> node companion/test/e2e-server.ts [count] [--pending] [--rename]
 */
import { httpApi } from "../src/api.ts";
import { loadConfig } from "../src/config.ts";
import { runJob } from "../src/runner.ts";
import type { ClaimedJob } from "../../src/lib/automation/types.ts";
import { startMock } from "./mock-portal.ts";
import { operator } from "./operator.ts";

const cfg = loadConfig();
if (!cfg) throw new Error("Not paired: set ARZIDESK_HOME to a paired companion home.");
const mock = await startMock({ pendingAfterPayment: process.argv.includes("--pending"), renameTextLabel: process.argv.includes("--rename") });
process.env.ARZIDESK_PORTALS = JSON.stringify({ "https://rtionline.gov.in": mock.rti, "https://pmkisan.gov.in": mock.pmkisan });
const api = httpApi(cfg);
const { chromium } = await import("playwright");
const browser = await chromium.launch({ headless: true, channel: "chrome" }).catch(() => chromium.launch({ headless: true }));
const max = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 1);
try {
  for (let n = 0; n < max; n += 1) {
    const { job } = await api.post<{ job: ClaimedJob | null }>("/api/runner/claim");
    if (!job) {
      console.log("no queued job");
      break;
    }
    const ctx = await browser.newContext();
    const out = await runJob(api, ctx, job, { publicKey: cfg.recipePublicKey, autopilot: operator() });
    console.log(JSON.stringify({ job: job.id, recipe: job.recipeId, ...out }));
    await ctx.close();
  }
} finally {
  await browser.close();
  await mock.close();
}
