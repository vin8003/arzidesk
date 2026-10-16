import assert from "node:assert/strict";
import test from "node:test";
import { databaseUrlSource, resolveDatabaseUrl } from "./database-url.mjs";

test("DATABASE_URL_MY wins over the platform URL", () => {
  const env = { DATABASE_URL_MY: " postgres://mine ", DATABASE_URL: "postgres://platform" };
  assert.equal(resolveDatabaseUrl(env), "postgres://mine");
  assert.equal(databaseUrlSource(env), "DATABASE_URL_MY");
});

test("falls back to DATABASE_URL and treats blank as unset", () => {
  assert.equal(resolveDatabaseUrl({ DATABASE_URL: "  postgres://platform " }), "postgres://platform");
  assert.equal(databaseUrlSource({ DATABASE_URL_MY: "   ", DATABASE_URL: "" }), undefined);
  assert.equal(resolveDatabaseUrl({}), undefined);
});
