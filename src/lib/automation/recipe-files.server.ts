import { createHash } from "node:crypto";
import { RECIPES } from "./recipes";

/**
 * Recipe sources ship inside the server bundle (same import.meta.glob trick
 * as the migrations) and go to companions on request. The manifest carries a
 * SHA-256 per file; `companion/recipes/signatures.json`, written by
 * `npm run recipes:sign` with the offline Ed25519 key, adds a signature the
 * companion checks when it has a pinned public key.
 */

function sources(): Record<string, string> {
  return import.meta.glob("/companion/recipes/{read,submit}/*.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
}

function signatures(): Record<string, string> {
  const files = import.meta.glob("/companion/recipes/signatures.json", { import: "default", eager: true }) as Record<string, Record<string, string>>;
  return Object.values(files)[0] ?? {};
}

export type ManifestEntry = { id: string; version: number; kind: string; file: string; sha256: string; signature: string | null };

let cached: ManifestEntry[] | null = null;

export function recipeManifest(): ManifestEntry[] {
  if (cached) return cached;
  const src = sources();
  const sigs = signatures();
  cached = RECIPES.flatMap((r) => {
    const body = src[`/companion/recipes/${r.file}`];
    if (typeof body !== "string") return [];
    const sha256 = createHash("sha256").update(body).digest("hex");
    return [{ id: r.id, version: r.version, kind: r.kind, file: r.file, sha256, signature: sigs[`${r.id}@${r.version}:${sha256}`] ?? null }];
  });
  return cached;
}

export function recipeSource(id: string): string | null {
  const r = RECIPES.find((x) => x.id === id);
  if (!r) return null;
  const body = sources()[`/companion/recipes/${r.file}`];
  return typeof body === "string" ? body : null;
}
