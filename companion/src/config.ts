import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Where the companion keeps its token, Chrome profile and recipe cache. Never credentials. */

export const COMPANION_VERSION = "0.1.0";

export function homeDir(): string {
  return process.env.ARZIDESK_HOME?.trim() || join(homedir(), ".arzidesk");
}

export type CompanionConfig = {
  server: string;
  token: string;
  deviceId: string;
  name: string;
  /** Ed25519 public key (PEM) recipes must be signed with. Empty: SHA-256 against the manifest only. */
  recipePublicKey?: string;
  lastCanaryAt?: string;
};

function configPath(): string {
  return join(homeDir(), "companion.json");
}

export function loadConfig(): CompanionConfig | null {
  const path = configPath();
  if (!existsSync(path)) return null;
  try {
    const cfg = JSON.parse(readFileSync(path, "utf8")) as CompanionConfig;
    return cfg.server && cfg.token ? cfg : null;
  } catch {
    return null;
  }
}

export function saveConfig(cfg: CompanionConfig): void {
  mkdirSync(homeDir(), { recursive: true, mode: 0o700 });
  writeFileSync(configPath(), JSON.stringify(cfg, null, 2), { mode: 0o600 });
  chmodSync(configPath(), 0o600);
}

export function profileDir(): string {
  return join(homeDir(), "chrome-profile");
}

export function recipeCacheDir(): string {
  const dir = join(homeDir(), "recipes");
  mkdirSync(dir, { recursive: true });
  // Downloaded recipes are ES modules; say so instead of relying on syntax detection.
  const pkg = join(dir, "package.json");
  if (!existsSync(pkg)) writeFileSync(pkg, '{ "type": "module" }\n');
  return dir;
}

/**
 * Test hook: send a portal origin somewhere else, e.g.
 * ARZIDESK_PORTALS='{"https://rtionline.gov.in":"http://127.0.0.1:4599"}'.
 */
export function portalOverrides(): Record<string, string> {
  const raw = process.env.ARZIDESK_PORTALS?.trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k.replace(/\/$/, ""), String(v).replace(/\/$/, "")]));
  } catch {
    return {};
  }
}

export function rewriteUrl(url: string, overrides = portalOverrides()): string {
  for (const [from, to] of Object.entries(overrides)) if (url.startsWith(from)) return to + url.slice(from.length);
  return url;
}
