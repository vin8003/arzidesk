import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classify, readRecipes, registryChangeIsReadBumpOnly } from "./recipe-pr-class.mjs";

const registrySource = readFileSync(new URL("../src/lib/automation/recipes.ts", import.meta.url), "utf8");

describe("recipe PR classifier", () => {
  it("reads the registry", () => {
    const r = readRecipes(registrySource);
    assert.equal(r.get("rtionline.status")?.kind, "read");
    assert.equal(r.get("rtionline.file_rti")?.kind, "submit");
  });

  it("auto-merges read recipes with their fixtures", () => {
    assert.equal(
      classify(["companion/recipes/read/rtionline-status.ts", "companion/recipes/fixtures/rtionline.status/baseline.json"], { registryDiff: "", registrySource }),
      "read",
    );
  });

  it("sends submit recipes, the kit, the server and unknown paths to a human", () => {
    for (const p of [
      "companion/recipes/submit/rtionline-file-rti.ts",
      "companion/recipes/fixtures/rtionline.file_rti/baseline.json",
      "companion/src/kit.ts",
      "src/lib/automation/rows.server.ts",
      ".github/workflows/recipe-automerge.yml",
      "companion/recipes/read/../submit/x.ts",
    ]) {
      assert.equal(classify(["companion/recipes/read/rtionline-status.ts", p], { registryDiff: "", registrySource }), "submit", p);
    }
    assert.equal(classify([], { registryDiff: "", registrySource }), "submit");
  });

  it("allows a registry change only when it bumps read recipe versions", () => {
    const lines = registrySource.split("\n");
    const lineOf = (id) => {
      const i = lines.findIndex((l) => l.includes(`id: "${id}"`));
      return i + 2; // 1-based number of the version line right under the id
    };
    const statusAt = lineOf("rtionline.status");
    const fileAt = lineOf("rtionline.file_rti");
    assert.match(lines[statusAt - 1], /version:/);
    const bump = (at) => `@@ -${at} +${at} @@\n-    version: 0,\n${"+" + lines[at - 1]}`;
    assert.equal(registryChangeIsReadBumpOnly(bump(statusAt), registrySource), true);
    // Same text, but on the submit recipe's line: a human reviews.
    assert.equal(registryChangeIsReadBumpOnly(bump(fileAt), registrySource), false);
    const kindFlip = `@@ -${statusAt + 1} +${statusAt + 1} @@\n-    kind: "submit",\n+    kind: "read",`;
    assert.equal(registryChangeIsReadBumpOnly(kindFlip, registrySource), false);
    assert.equal(classify(["src/lib/automation/recipes.ts", "companion/recipes/read/pmkisan-status.ts"], { registryDiff: kindFlip, registrySource }), "submit");
    assert.equal(classify(["src/lib/automation/recipes.ts", "companion/recipes/read/rtionline-status.ts"], { registryDiff: bump(statusAt), registrySource }), "read");
  });
});
