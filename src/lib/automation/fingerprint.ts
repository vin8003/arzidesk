import type { FieldInfo, Inventory } from "./types.ts";

/**
 * Structural fingerprints of portal forms, for drift detection. Two pages
 * with the same controls, labels and options hash the same however their
 * markup is nested. Values never enter an inventory.
 */

export function normLabel(text: string): string {
  return text
    .replace(/[*:]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function fieldLine(f: FieldInfo): string {
  const opts = f.options?.length ? `[${f.options.map(normLabel).join("|")}]` : "";
  return `${f.tag}:${f.type}:${f.name || f.id}:${normLabel(f.label)}:${f.required ? 1 : 0}${opts}`;
}

/** 64-bit FNV-1a as 16 hex chars. Same result in Node and in the page. */
export function fnv64(text: string): string {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < text.length; i += 1) {
    h ^= BigInt(text.charCodeAt(i));
    h = (h * prime) & mask;
  }
  return h.toString(16).padStart(16, "0");
}

/** Hidden inputs and per-request tokens (captcha image urls, viewstate) are left out on purpose. */
export function fingerprint(inv: Pick<Inventory, "fields">): string {
  const lines = inv.fields.filter((f) => f.type !== "hidden").map(fieldLine).sort();
  return fnv64(lines.join("\n"));
}

export type InventoryDiff = {
  added: FieldInfo[];
  removed: FieldInfo[];
  changed: Array<{ before: FieldInfo; after: FieldInfo; what: string[] }>;
};

function identity(f: FieldInfo): string {
  return f.name || f.id || normLabel(f.label);
}

export function diffInventory(before: Pick<Inventory, "fields">, after: Pick<Inventory, "fields">): InventoryDiff {
  const a = new Map(before.fields.filter((f) => f.type !== "hidden").map((f) => [identity(f), f]));
  const b = new Map(after.fields.filter((f) => f.type !== "hidden").map((f) => [identity(f), f]));
  const diff: InventoryDiff = { added: [], removed: [], changed: [] };
  for (const [key, f] of b) if (!a.has(key)) diff.added.push(f);
  for (const [key, f] of a) {
    const g = b.get(key);
    if (!g) {
      diff.removed.push(f);
      continue;
    }
    const what: string[] = [];
    if (f.tag !== g.tag || f.type !== g.type) what.push("type");
    if (normLabel(f.label) !== normLabel(g.label)) what.push("label");
    if (f.required !== g.required) what.push("required");
    if ((f.options ?? []).map(normLabel).join("|") !== (g.options ?? []).map(normLabel).join("|")) what.push("options");
    if (what.length) diff.changed.push({ before: f, after: g, what });
  }
  return diff;
}

export function diffIsEmpty(d: InventoryDiff): boolean {
  return !d.added.length && !d.removed.length && !d.changed.length;
}

/** One line per difference, for logs, PR bodies and the case page. */
export function describeDiff(d: InventoryDiff): string[] {
  return [
    ...d.added.map((f) => `+ ${f.tag}[${f.name || f.id}] "${f.label}"`),
    ...d.removed.map((f) => `- ${f.tag}[${f.name || f.id}] "${f.label}"`),
    ...d.changed.map((c) => `~ ${c.after.tag}[${c.after.name || c.after.id}] ${c.what.join(", ")}`),
  ];
}
