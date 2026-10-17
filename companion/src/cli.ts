#!/usr/bin/env node
import { writeFileSync, mkdirSync } from "node:fs";
import { hostname } from "node:os";
import { dirname } from "node:path";
import { fingerprint } from "../../src/lib/automation/fingerprint.ts";
import { httpApi, pair } from "./api.ts";
import { baselinePath, judge, readBaseline, runCanaries, type Baseline } from "./canary.ts";
import { COMPANION_VERSION, homeDir, loadConfig, profileDir, saveConfig } from "./config.ts";
import { redactDom } from "./redact.ts";
import { loadLocalRecipe, loadRemoteRecipe, manifest } from "./recipes.ts";
import { runLoop } from "./runner.ts";

/**
 * arzidesk companion
 *   pair <CODE> --server <url> [--name "Kiosk 1"]   link this PC to an ArziDesk account
 *   run [--once] [--local-recipes] [--headless]       wait for jobs and run them in Chrome
 *   canary [--offline] [--recipe id] [--report file] [--write-baseline] [--headed]
 *   doctor                                            check the setup
 */

function flag(args: string[], name: string): boolean {
  return args.includes(`--${name}`);
}

function opt(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

function need(): NonNullable<ReturnType<typeof loadConfig>> {
  const cfg = loadConfig();
  if (!cfg) {
    console.error("Not paired yet. In ArziDesk open Companion → Connect a kiosk PC, then run:\n  npm run companion -- pair CODE --server https://your-arzidesk");
    process.exit(2);
  }
  return cfg;
}

async function main(): Promise<void> {
  const [cmd, ...args] = process.argv.slice(2);
  switch (cmd) {
    case "pair": {
      const code = args.find((a) => !a.startsWith("--") && a !== opt(args, "server") && a !== opt(args, "name"));
      const server = (opt(args, "server") ?? loadConfig()?.server ?? process.env.ARZIDESK_URL ?? "").replace(/\/$/, "");
      if (!code || !server) {
        console.error("Usage: companion pair <CODE> --server https://your-arzidesk [--name \"Kiosk 1\"]");
        process.exit(1);
      }
      const name = opt(args, "name") ?? hostname();
      const res = await pair(server, code, name);
      saveConfig({ server, token: res.token, deviceId: res.deviceId, name, recipePublicKey: process.env.ARZIDESK_RECIPE_PUBLIC_KEY });
      console.log(`Paired "${name}" with ${server}. Start it with:  npm run companion -- run`);
      return;
    }

    case "run": {
      const cfg = need();
      await runLoop(cfg, httpApi(cfg), { once: flag(args, "once"), localRecipes: flag(args, "local-recipes"), headless: flag(args, "headless") });
      return;
    }

    case "canary": {
      const offline = flag(args, "offline");
      const only = opt(args, "recipe") ? [opt(args, "recipe")!] : undefined;
      const cfg = offline ? null : need();
      const api = cfg ? httpApi(cfg) : null;
      const results = await runCanaries({
        load: (id) => (offline || flag(args, "local-recipes") || !api ? loadLocalRecipe(id) : loadRemoteRecipe(api, id, { publicKey: cfg?.recipePublicKey }).then((r) => r.recipe)),
        only,
        headed: flag(args, "headed"),
      });
      if (flag(args, "write-baseline")) {
        const byRecipe = new Map<string, Baseline>();
        for (const r of results) {
          if (r.unreachable || r.error) continue;
          const b = byRecipe.get(r.recipeId) ?? readBaseline(r.recipeId) ?? {};
          b[r.stepId] = { fingerprint: fingerprint(r.inventory), inventory: r.inventory };
          byRecipe.set(r.recipeId, b);
        }
        for (const [id, b] of byRecipe) {
          mkdirSync(dirname(baselinePath(id)), { recursive: true });
          writeFileSync(baselinePath(id), JSON.stringify(b, null, 2) + "\n");
          console.log(`wrote ${baselinePath(id)}`);
        }
        return;
      }
      if (offline) {
        const verdicts = judge(results);
        for (const v of verdicts) console.log(`${v.status.padEnd(11)} ${v.recipeId}#${v.stepId}${v.diff.length ? `\n  ${v.diff.join("\n  ")}` : ""}`);
        const report = opt(args, "report");
        if (report) {
          const drifted = new Set(verdicts.filter((v) => v.status === "drift").map((v) => `${v.recipeId}#${v.stepId}`));
          const payload = {
            at: new Date().toISOString(),
            verdicts,
            pages: results.filter((r) => drifted.has(`${r.recipeId}#${r.stepId}`)).map((r) => ({ ...r, dom: r.dom ? redactDom(r.dom, []) : "" })),
          };
          writeFileSync(report, JSON.stringify(payload, null, 2));
        }
        if (verdicts.some((v) => v.status === "drift")) process.exitCode = 1;
        return;
      }
      const res = await api!.post<{ drift: string[] }>("/api/runner/canary", { results: results.map(({ dom: _dom, ...r }) => r) });
      console.log(res.drift.length ? `Changed: ${res.drift.join(", ")} (repair requested)` : "All recipe pages look as expected.");
      return;
    }

    case "doctor": {
      console.log(`companion ${COMPANION_VERSION} · node ${process.version}`);
      console.log(`home: ${homeDir()}\nchrome profile: ${profileDir()}`);
      const cfg = loadConfig();
      if (!cfg) {
        console.log("not paired");
        return;
      }
      console.log(`paired as "${cfg.name}" with ${cfg.server}${cfg.recipePublicKey ? " · recipes must be signed" : ""}`);
      const entries = await manifest(httpApi(cfg), true);
      for (const e of entries) console.log(`  ${e.kind.padEnd(6)} ${e.id}@${e.version} ${e.sha256.slice(0, 12)}${e.signature ? " signed" : ""}`);
      return;
    }

    default:
      console.log(
        [
          "ArziDesk companion: runs portal filings on this PC.",
          "",
          "  npm run companion -- pair CODE --server https://your-arzidesk [--name \"Kiosk 1\"]",
          "  npm run companion -- run",
          "  npm run companion -- canary [--offline] [--recipe id] [--write-baseline]",
          "  npm run companion -- doctor",
        ].join("\n"),
      );
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
