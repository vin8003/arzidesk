#!/usr/bin/env node
/**
 * Nitro/Rolldown 3 can emit a circular `_ssr/ssr.mjs` ↔ `_ssr/ssr2.mjs` pair:
 *   - ssr.mjs exports `ssr_exports` without defining it → SyntaxError on every
 *     request (`{ error: true, status: 500, unhandled: true }`)
 *   - ssr2.mjs imports `__exportAll` from ssr.mjs while ssr.mjs is still
 *     evaluating → TypeError: __exportAll$1 is not a function
 *
 * Patch both files after the Nitro build. Safe to re-run.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const SSR_EXPORT_HELPER = `var ssr_exports = /* @__PURE__ */ __exportAll({
	a: () => getServerFnById,
	c: () => __exportAll,
	createServerEntry: () => createServerEntry,
	default: () => server_default,
	i: () => TSS_SERVER_FUNCTION,
	n: () => createMiddleware,
	o: () => getRequest,
	r: () => createServerFn,
	s: () => ssr_exports,
	t: () => server_exports,
});
`;

const LOCAL_EXPORT_ALL = `var __defProp$ssr = Object.defineProperty;
var __exportAll$1 = (all, no_symbols) => {
	let target = {};
	for (var name in all) __defProp$ssr(target, name, {
		get: all[name],
		enumerable: true
	});
	if (!no_symbols) __defProp$ssr(target, Symbol.toStringTag, { value: "Module" });
	return target;
};
`;

export function patchSsrMjs(source) {
  if (!source.includes("ssr_exports as s")) return source;
  if (/\b(?:var|let|const)\s+ssr_exports\b/.test(source)) return source;
  return source.replace(
    /(\/\/#endregion\n)(export \{[^}]*ssr_exports as s)/,
    `$1${SSR_EXPORT_HELPER}$2`,
  );
}

export function patchSsr2Mjs(source) {
  if (!source.includes('from "./ssr.mjs"')) return source;
  let next = source.replace(
    /import \{ c as __exportAll\$1 \} from "\.\/ssr\.mjs";\n/,
    LOCAL_EXPORT_ALL,
  );
  // If the helper was inserted before a later import, hoist remaining imports
  // by leaving node:async_hooks where it is (it is already above in Nitro output
  // after we also move it). The replacement only removes the circular import.
  return next;
}

function walkFiles(root, found = []) {
  if (!existsSync(root)) return found;
  let entries = [];
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      walkFiles(full, found);
    } else if (/\.(mjs|js)$/.test(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

export function fixSsrExports(log = console.log) {
  const roots = [
    join(ROOT, ".vercel"),
    join(ROOT, ".output"),
  ];
  let patched = 0;
  const files = [];
  for (const root of roots) walkFiles(root, files);
  for (const file of files) {
    let before;
    try {
      before = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (!before.includes("ssr_exports") && !before.includes('from "./ssr.mjs"')) continue;
    let after = patchSsrMjs(before);
    after = patchSsr2Mjs(after);
    if (after !== before) {
      writeFileSync(file, after);
      patched += 1;
      log(`[fix-ssr-exports] patched ${file}`);
    }
  }
  if (!patched) log("[fix-ssr-exports] nothing to patch");
  return patched;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  fixSsrExports();
}
