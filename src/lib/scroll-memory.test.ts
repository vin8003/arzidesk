import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pathKey, readScroll, rememberScroll } from "./scroll-memory.ts";

class MemoryStorage {
  map = new Map<string, string>();
  getItem(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
}

describe("scroll-memory", () => {
  it("pathKey drops a bare question mark and keeps search", () => {
    assert.equal(pathKey("/matters", ""), "/matters");
    assert.equal(pathKey("/matters", "?"), "/matters");
    assert.equal(pathKey("/research", "?matter=abc"), "/research?matter=abc");
    assert.equal(pathKey("/research", "matter=abc"), "/research?matter=abc");
    assert.equal(pathKey(""), "/");
    assert.equal(pathKey("/diary", undefined), "/diary");
    assert.equal(pathKey("/diary", { from: "today" }), "/diary");
  });

  it("round-trips a list offset and ignores empty values", () => {
    const store = new MemoryStorage();
    rememberScroll("/", 842, store);
    assert.equal(readScroll("/", store), 842);
    rememberScroll("/", 0, store);
    assert.equal(readScroll("/", store), 0);
    rememberScroll("/diary", Number.NaN, store);
    assert.equal(readScroll("/diary", store), 0);
  });

  it("keeps paths independent", () => {
    const store = new MemoryStorage();
    rememberScroll("/", 400, store);
    rememberScroll("/diary", 120, store);
    assert.equal(readScroll("/", store), 400);
    assert.equal(readScroll("/diary", store), 120);
    assert.equal(readScroll("/matters", store), 0);
  });
});
