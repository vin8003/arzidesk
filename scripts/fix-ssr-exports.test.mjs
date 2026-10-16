import assert from "node:assert/strict";
import { test } from "node:test";
import { patchSsrMjs, patchSsr2Mjs } from "./fix-ssr-exports.mjs";

test("defines ssr_exports when the Nitro chunk forgot it", () => {
  const src = `import "./ssr2.mjs";
var __exportAll = (all) => all;
//#endregion
export { createServerFn as r, ssr_exports as s, server_exports as t };
`;
  const out = patchSsrMjs(src);
  assert.match(out, /var ssr_exports =/);
  assert.match(out, /export \{ createServerFn as r, ssr_exports as s/);
});

test("is idempotent", () => {
  const src = `var ssr_exports = {};
export { ssr_exports as s };
`;
  assert.equal(patchSsrMjs(src), src);
});

test("breaks the ssr2 → ssr circular import", () => {
  const src = `import { n as setCookie } from "../_libs/h3-v2+rou3.mjs";
import { c as __exportAll$1 } from "./ssr.mjs";
import { AsyncLocalStorage } from "node:async_hooks";
var server_exports = /* @__PURE__ */ __exportAll$1({ setCookie: () => setCookie$1 });
`;
  const out = patchSsr2Mjs(src);
  assert.equal(out.includes('from "./ssr.mjs"'), false);
  assert.match(out, /var __exportAll\$1 =/);
  assert.match(out, /var server_exports = \/\* @__PURE__ \*\/ __exportAll\$1/);
});
