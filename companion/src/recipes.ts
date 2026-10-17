import { createHash, createPublicKey, verify } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { RECIPES } from "../../src/lib/automation/recipes.ts";
import type { Recipe } from "../recipes/types.ts";
import type { Api } from "./api.ts";
import { recipeCacheDir } from "./config.ts";

/**
 * Recipes arrive from the paired ArziDesk, so a repaired recipe reaches every
 * kiosk on its next job. Each file is checked against the manifest's SHA-256
 * and, when a public key is pinned, its Ed25519 signature over
 * `id@version:sha256`. A file that fails either check is never imported.
 */

export type ManifestEntry = { id: string; version: number; kind: string; file: string; sha256: string; signature: string | null };

const LOCAL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../recipes");

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function signedMessage(e: Pick<ManifestEntry, "id" | "version" | "sha256">): string {
  return `${e.id}@${e.version}:${e.sha256}`;
}

export function checkSignature(entry: ManifestEntry, publicKeyPem: string): boolean {
  if (!entry.signature) return false;
  try {
    return verify(null, Buffer.from(signedMessage(entry)), createPublicKey(publicKeyPem), Buffer.from(entry.signature, "base64"));
  } catch {
    return false;
  }
}

function asRecipe(mod: unknown, id: string): Recipe {
  const m = mod as { default?: Recipe; recipe?: Recipe };
  const r = m.default ?? m.recipe;
  if (!r || r.id !== id || typeof r.run !== "function" || typeof r.version !== "number") throw new Error(`Recipe file for ${id} does not export the recipe.`);
  return r;
}

/** Development: run the recipe straight from companion/recipes. */
export async function loadLocalRecipe(id: string): Promise<Recipe> {
  const meta = RECIPES.find((r) => r.id === id);
  if (!meta) throw new Error(`Unknown recipe ${id}`);
  return asRecipe(await import(pathToFileURL(join(LOCAL_DIR, meta.file)).href), id);
}

/** Per server connection: a manifest is only ever trusted for the server that sent it. */
const manifestCache = new WeakMap<Api, { at: number; entries: ManifestEntry[] }>();

export async function manifest(api: Api, force = false): Promise<ManifestEntry[]> {
  const hit = manifestCache.get(api);
  if (!force && hit && Date.now() - hit.at < 60_000) return hit.entries;
  const res = await api.get<{ recipes: ManifestEntry[] }>("/api/runner/manifest");
  manifestCache.set(api, { at: Date.now(), entries: res.recipes });
  return res.recipes;
}

export async function loadRemoteRecipe(api: Api, id: string, opts: { publicKey?: string; print?: (s: string) => void } = {}): Promise<{ recipe: Recipe; entry: ManifestEntry }> {
  const entries = await manifest(api);
  const entry = entries.find((e) => e.id === id);
  if (!entry) throw new Error(`ArziDesk does not offer recipe ${id}.`);
  if (opts.publicKey && !checkSignature(entry, opts.publicKey)) {
    throw new Error(`Recipe ${id}@${entry.version} is not signed with the pinned key; refusing to run it.`);
  }
  const file = join(recipeCacheDir(), `${id.replace(/[^\w.-]/g, "_")}@${entry.version}-${entry.sha256.slice(0, 12)}.ts`);
  if (!existsSync(file) || sha256(readFileSync(file, "utf8")) !== entry.sha256) {
    const body = await api.getText(`/api/runner/recipe/${encodeURIComponent(id)}`);
    if (sha256(body) !== entry.sha256) throw new Error(`Recipe ${id} did not match its manifest hash; refusing to run it.`);
    writeFileSync(file, body, { mode: 0o600 });
    opts.print?.(`· fetched recipe ${id}@${entry.version}`);
  }
  return { recipe: asRecipe(await import(pathToFileURL(file).href), id), entry };
}
