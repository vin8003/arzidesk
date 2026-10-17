#!/usr/bin/env node
/**
 * Merge policy for recipe pull requests (docs/automation.md):
 *   "read"   only read-only recipes, their fixtures/baselines, and the matching
 *            version lines in the registry changed → auto-merge once CI is green.
 *   "submit" anything else (submit recipes, the kit, the server, the registry
 *            beyond version bumps) → a human reviews.
 * Deterministic on purpose: it reads paths and the registry diff, never the
 * PR text, so a repair agent cannot talk its way into auto-merge.
 *
 *   node scripts/recipe-pr-class.mjs <base-ref>        prints read|submit
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REGISTRY = "src/lib/automation/recipes.ts";

/** Recipe ids whose file lives in read/, from the registry source. */
export function readRecipes(registrySource) {
  const out = new Map();
  const re = /id:\s*"([^"]+)"[\s\S]*?kind:\s*"(read|submit)"[\s\S]*?file:\s*"([^"]+)"/g;
  for (const m of registrySource.matchAll(re)) out.set(m[1], { kind: m[2], file: m[3] });
  return out;
}

/**
 * Registry hunks that only bump `version:` of read recipes. `diff` is a
 * unified diff of the registry with zero context (-U0).
 */
export function registryChangeIsReadBumpOnly(diff, registrySource) {
  const recipes = readRecipes(registrySource);
  const src = registrySource.split("\n");
  // Added lines with their line number in the new file, from the hunk headers.
  const added = [];
  let removed = 0;
  let next = 0;
  for (const l of diff.split("\n")) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(l);
    if (hunk) {
      next = Number(hunk[1]);
      continue;
    }
    if (/^\+(?!\+\+)/.test(l)) added.push({ at: next++, text: l.slice(1) });
    else if (/^-(?!--)/.test(l)) {
      if (!/^-\s*version:\s*\d+,\s*$/.test(l)) return false;
      removed += 1;
    }
  }
  if (!added.length && !removed) return true;
  for (const { at, text } of added) {
    if (!/^\s*version:\s*\d+,\s*$/.test(text)) return false;
    if (src[at - 1] !== text) return false;
    // The version line must belong to a read recipe: the nearest id above it.
    let id = null;
    for (let i = at - 1; i >= 0 && !id; i -= 1) id = /id:\s*"([^"]+)"/.exec(src[i])?.[1] ?? null;
    if (!id || recipes.get(id)?.kind !== "read") return false;
  }
  return true;
}

export function classify(paths, opts = { registryDiff: "", registrySource: "" }) {
  if (!paths.length) return "submit";
  const recipes = readRecipes(opts.registrySource);
  const readIds = [...recipes].filter(([, r]) => r.kind === "read").map(([id]) => id);
  for (const p of paths) {
    if (/^companion\/recipes\/read\/[^/]+\.ts$/.test(p)) continue;
    const fixture = /^companion\/recipes\/fixtures\/([^/]+)\//.exec(p);
    if (fixture && readIds.includes(fixture[1])) continue;
    if (p === REGISTRY && registryChangeIsReadBumpOnly(opts.registryDiff, opts.registrySource)) continue;
    return "submit";
  }
  return "read";
}

function main() {
  const base = process.argv[2] ?? "origin/main";
  const git = (...args) => execFileSync("git", args, { encoding: "utf8" });
  const paths = git("diff", "--name-only", `${base}...HEAD`).split("\n").filter(Boolean);
  const registryDiff = paths.includes(REGISTRY) ? git("diff", "-U0", `${base}...HEAD`, "--", REGISTRY) : "";
  const registrySource = readFileSync(REGISTRY, "utf8");
  process.stdout.write(`${classify(paths, { registryDiff, registrySource })}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
