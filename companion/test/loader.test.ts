import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RECIPES } from "../../src/lib/automation/recipes.ts";
import type { Api } from "../src/api.ts";
import { checkSignature, loadRemoteRecipe, sha256, signedMessage, type ManifestEntry } from "../src/recipes.ts";
import { redactText } from "../src/redact.ts";
import { classify } from "../src/runner.ts";

/** The trust chain for hot-updated recipes: hash from the manifest, optional signature, never a mismatch. */

process.env.ARZIDESK_HOME = mkdtempSync(join(tmpdir(), "arzi-home-"));

const meta = RECIPES.find((r) => r.id === "rtionline.status")!;
const source = readFileSync(new URL(`../recipes/${meta.file}`, import.meta.url), "utf8");

function api(entry: ManifestEntry, body: string): Api {
  return {
    post: async () => {
      throw new Error("unused");
    },
    get: async <T>() => ({ recipes: [entry] }) as T,
    getText: async () => body,
  };
}

describe("recipe loader", () => {
  it("imports a recipe whose source matches the manifest hash", async () => {
    const entry: ManifestEntry = { id: meta.id, version: meta.version, kind: meta.kind, file: meta.file, sha256: sha256(source), signature: null };
    const { recipe } = await loadRemoteRecipe(api(entry, source), meta.id);
    assert.equal(recipe.id, meta.id);
  });

  it("refuses a source that does not match its hash", async () => {
    const entry: ManifestEntry = { id: meta.id, version: 99, kind: meta.kind, file: meta.file, sha256: sha256(source), signature: null };
    await assert.rejects(loadRemoteRecipe(api(entry, source + "\n// tampered"), meta.id), /did not match its manifest hash/);
  });

  it("checks Ed25519 signatures when a key is pinned", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
    const base = { id: meta.id, version: 98, kind: meta.kind, file: meta.file, sha256: sha256(source) };
    const good: ManifestEntry = { ...base, signature: sign(null, Buffer.from(signedMessage(base)), privateKey).toString("base64") };
    assert.equal(checkSignature(good, pem), true);
    assert.equal(checkSignature({ ...good, version: 97 }, pem), false);
    await assert.rejects(loadRemoteRecipe(api({ ...good, signature: null }, source), meta.id, { publicKey: pem }), /not signed with the pinned key/);
    const { recipe } = await loadRemoteRecipe(api(good, source), meta.id, { publicKey: pem });
    assert.equal(recipe.version, meta.version);
  });
});

describe("redaction and failure classes", () => {
  it("scrubs payload strings and identity-shaped numbers", () => {
    const out = redactText("Ramesh Kumar, 9876543210, ramesh@x.in, 1234 5678 9012, ABCDE1234F, House 12", ["Ramesh Kumar", "House 12"]);
    assert.equal(out, "[REDACTED], [REDACTED], [REDACTED], [REDACTED], [REDACTED], [REDACTED]");
  });

  it("classifies thrown errors", () => {
    assert.equal(classify(new Error("page.goto: net::ERR_NAME_NOT_RESOLVED")), "portal_down");
    assert.equal(classify(Object.assign(new Error("waiting for locator('#x')"), { name: "TimeoutError" })), "drift");
    assert.equal(classify(new Error("Target page, context or browser has been closed")), "cancelled");
    assert.equal(classify(new Error("boom")), "internal");
  });
});
