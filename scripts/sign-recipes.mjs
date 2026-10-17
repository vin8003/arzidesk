#!/usr/bin/env node
/**
 * Sign recipe releases so kiosks with a pinned key run only what you signed,
 * even if the ArziDesk server itself were compromised.
 *
 *   node scripts/sign-recipes.mjs keygen [dir]   new Ed25519 key pair (private key stays outside the repo)
 *   RECIPE_SIGNING_KEY=<pem or path> npm run recipes:sign
 *                                                writes companion/recipes/signatures.json
 *
 * Each signature covers `id@version:sha256(file)`, the string the companion verifies.
 * Kiosks pin the public key with ARZIDESK_RECIPE_PUBLIC_KEY at pairing time.
 */
import { createHash, createPrivateKey, generateKeyPairSync, sign } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { RECIPES } from "../src/lib/automation/recipes.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

export function signatureFor(entry, privateKey) {
  return sign(null, Buffer.from(`${entry.id}@${entry.version}:${entry.sha256}`), privateKey).toString("base64");
}

export function entries() {
  return RECIPES.map((r) => {
    const body = readFileSync(join(ROOT, "companion/recipes", r.file), "utf8");
    return { id: r.id, version: r.version, sha256: createHash("sha256").update(body).digest("hex") };
  });
}

function main() {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === "keygen") {
    const dir = arg ?? join(homedir(), ".arzidesk-signing");
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const keyPath = join(dir, "recipes.key");
    if (existsSync(keyPath)) throw new Error(`${keyPath} exists; refusing to overwrite a signing key.`);
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    writeFileSync(keyPath, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
    console.log(`Private key: ${keyPath} (keep it off the server and out of git)\n`);
    console.log("Public key, for ARZIDESK_RECIPE_PUBLIC_KEY on each kiosk:\n");
    console.log(publicKey.export({ type: "spki", format: "pem" }));
    return;
  }
  const raw = process.env.RECIPE_SIGNING_KEY?.trim();
  if (!raw) throw new Error("Set RECIPE_SIGNING_KEY to the private key PEM or its path.");
  const pem = raw.includes("BEGIN") ? raw : readFileSync(raw, "utf8");
  const key = createPrivateKey(pem);
  const out = {};
  for (const e of entries()) out[`${e.id}@${e.version}:${e.sha256}`] = signatureFor(e, key);
  writeFileSync(join(ROOT, "companion/recipes/signatures.json"), JSON.stringify(out, null, 2) + "\n");
  console.log(`Signed ${Object.keys(out).length} recipes → companion/recipes/signatures.json`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
