import type { FieldInfo } from "../../src/lib/automation/types.ts";

/**
 * Functions that run inside the portal page (page.evaluate). Each is
 * self-contained: Playwright ships its source text, so no closures and no
 * imports. Labels are found the way an operator reads the form: a <label>,
 * an aria label, the header cell of a table row (NIC portals), a form-group
 * label, or the placeholder.
 */

export type MarkSpec = {
  token: string;
  name?: string;
  id?: string;
  css?: string;
  /** RegExp sources and flags, tried in order. */
  labels: Array<{ source: string; flags: string }>;
  kinds?: string[];
};

export type MarkResult = { found: false } | { found: true; tag: string; type: string; label: string; name: string; id: string; group: boolean };

/** One entry per control; radio groups become one entry with options. Values are never read. */
export function inventoryInPage(): FieldInfo[] {
  const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
  const ownText = (el: Element | null): string => {
    if (!el) return "";
    const clone = el.cloneNode(true) as Element;
    clone.querySelectorAll("input, select, textarea, script, style, option, button").forEach((n) => n.remove());
    return clean(clone.textContent);
  };
  const labelFor = (el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): string => {
    const t = el.type;
    if ((t === "radio" || t === "checkbox") && el.closest("label")) {
      const own = ownText(el.closest("label"));
      if (own) return own;
    }
    if (el.labels && el.labels.length) {
      const own = clean(el.labels[0].textContent);
      if (own) return own;
    }
    if (t === "radio" || t === "checkbox") {
      // "<input type=checkbox> I have read and understood…": the words right after the box.
      const after = clean(el.nextSibling?.textContent).slice(0, 120);
      if (after) return after;
    }
    const aria = el.getAttribute("aria-label");
    if (aria) return clean(aria);
    const by = el.getAttribute("aria-labelledby");
    if (by) {
      const txt = by
        .split(/\s+/)
        .map((id) => clean(document.getElementById(id)?.textContent))
        .join(" ");
      if (txt.trim()) return txt.trim();
    }
    const cell = el.closest("td, th");
    if (cell) {
      let prev = cell.previousElementSibling;
      while (prev) {
        const txt = ownText(prev);
        if (txt) return txt;
        prev = prev.previousElementSibling;
      }
      const row = cell.parentElement;
      const head = row?.querySelector("th");
      if (head && head !== cell && ownText(head)) return ownText(head);
    }
    const group = el.closest(".form-group, .form-field, .field, .col, [class*='col-']");
    const glabel = group?.querySelector("label");
    if (glabel && clean(glabel.textContent)) return clean(glabel.textContent);
    if ("placeholder" in el && el.placeholder) return clean(el.placeholder);
    if (el.title) return clean(el.title);
    return "";
  };
  const groupLabel = (el: HTMLInputElement): string => {
    const fs = el.closest("fieldset");
    const legend = fs?.querySelector("legend");
    if (legend && clean(legend.textContent)) return clean(legend.textContent);
    const cell = el.closest("td");
    if (cell) {
      let prev = cell.previousElementSibling;
      while (prev) {
        const txt = ownText(prev);
        if (txt) return txt;
        prev = prev.previousElementSibling;
      }
    }
    const group = el.closest(".form-group, .form-field, .field");
    const glabel = group?.querySelector("label:not(:has(input))");
    return clean(glabel?.textContent) || el.name;
  };
  const visible = (el: HTMLElement): boolean => {
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden") return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 || r.height > 0;
  };

  const out: FieldInfo[] = [];
  const seenGroups = new Set<string>();
  const els = Array.from(document.querySelectorAll("input, select, textarea")) as Array<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>;
  for (const el of els) {
    const type = el.tagName === "INPUT" ? (el as HTMLInputElement).type || "text" : el.tagName.toLowerCase();
    if (["submit", "button", "reset", "image"].includes(type)) continue;
    if (type !== "hidden" && !visible(el)) continue;
    if (type === "radio") {
      const name = el.name;
      if (seenGroups.has(name)) continue;
      seenGroups.add(name);
      const radios = Array.from(document.querySelectorAll(`input[type=radio][name="${CSS.escape(name)}"]`)) as HTMLInputElement[];
      out.push({
        key: name || el.id,
        label: groupLabel(el as HTMLInputElement),
        tag: "INPUT",
        type: "radio",
        name,
        id: el.id,
        required: radios.some((r) => r.required),
        options: radios.map((r) => labelFor(r) || r.value).slice(0, 50),
      });
      continue;
    }
    const label = labelFor(el);
    const info: FieldInfo = {
      key: el.name || el.id || label.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 60),
      label,
      tag: el.tagName,
      type,
      name: el.name,
      id: el.id,
      required: el.required || /\*/.test(label) || el.getAttribute("aria-required") === "true",
    };
    if (el.tagName === "SELECT") info.options = Array.from((el as HTMLSelectElement).options).map((o) => clean(o.text)).slice(0, 400);
    out.push(info);
  }
  return out;
}

/** Find one control by spec and tag it with data-arzi=token (radio groups: every radio). */
export function markInPage(spec: MarkSpec): MarkResult {
  const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
  const ownText = (el: Element | null): string => {
    if (!el) return "";
    const clone = el.cloneNode(true) as Element;
    clone.querySelectorAll("input, select, textarea, script, style, option, button").forEach((n) => n.remove());
    return clean(clone.textContent);
  };
  const kindOf = (el: Element): string => {
    if (el.tagName === "SELECT") return "select";
    if (el.tagName === "TEXTAREA") return "textarea";
    const t = (el as HTMLInputElement).type;
    if (t === "radio" || t === "checkbox" || t === "file") return t;
    if (["submit", "button", "reset", "image", "hidden"].includes(t)) return "other";
    return "text";
  };
  const allowed = (el: Element) => {
    if (!spec.kinds || !spec.kinds.length) return kindOf(el) !== "other";
    const k = kindOf(el);
    return spec.kinds.includes(k) || (k === "textarea" && spec.kinds.includes("text"));
  };
  const visible = (el: HTMLElement): boolean => {
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden") return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 || r.height > 0;
  };
  const labelOf = (el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): string => {
    if (el.type === "radio") {
      const fs = el.closest("fieldset")?.querySelector("legend");
      if (fs && clean(fs.textContent)) return clean(fs.textContent);
    } else if (el.labels && el.labels.length && clean(el.labels[0].textContent)) {
      return clean(el.labels[0].textContent);
    } else if (el.type === "checkbox" && clean(el.nextSibling?.textContent)) {
      return clean(el.nextSibling?.textContent).slice(0, 120);
    }
    const aria = el.getAttribute("aria-label");
    if (aria) return clean(aria);
    const cell = el.closest("td, th");
    if (cell) {
      let prev = cell.previousElementSibling;
      while (prev) {
        const txt = ownText(prev);
        if (txt) return txt;
        prev = prev.previousElementSibling;
      }
      const head = cell.parentElement?.querySelector("th");
      if (head && head !== cell && ownText(head)) return ownText(head);
    }
    const group = el.closest(".form-group, .form-field, .field, .col, [class*='col-']");
    const glabel = group?.querySelector(el.type === "radio" ? "label:not(:has(input))" : "label");
    if (glabel && clean(glabel.textContent)) return clean(glabel.textContent);
    if ("placeholder" in el && el.placeholder) return clean(el.placeholder);
    return clean(el.title);
  };
  const tag = (el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): MarkResult => {
    document.querySelectorAll(`[data-arzi="${spec.token}"]`).forEach((n) => n.removeAttribute("data-arzi"));
    const group = el.tagName === "INPUT" && (el as HTMLInputElement).type === "radio";
    if (group) {
      document.querySelectorAll(`input[type=radio][name="${CSS.escape(el.name)}"]`).forEach((r) => r.setAttribute("data-arzi", spec.token));
    } else {
      el.setAttribute("data-arzi", spec.token);
    }
    return { found: true, tag: el.tagName, type: (el as HTMLInputElement).type || el.tagName.toLowerCase(), label: labelOf(el), name: el.name, id: el.id, group };
  };

  const candidates = (Array.from(document.querySelectorAll("input, select, textarea")) as Array<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>).filter(
    (el) => allowed(el) && (visible(el) || kindOf(el) === "file"),
  );
  if (spec.id) {
    const el = candidates.find((c) => c.id === spec.id);
    if (el) return tag(el);
  }
  if (spec.name) {
    const el = candidates.find((c) => c.name === spec.name);
    if (el) return tag(el);
  }
  if (spec.css) {
    const el = document.querySelector(spec.css) as HTMLInputElement | null;
    if (el && allowed(el)) return tag(el);
  }
  for (const { source, flags } of spec.labels) {
    const re = new RegExp(source, flags);
    const el = candidates.find((c) => re.test(labelOf(c)));
    if (el) return tag(el);
  }
  return { found: false };
}

/** Current value of a marked control, as the operator would read it. */
export function readInPage(token: string): string | null {
  const els = Array.from(document.querySelectorAll(`[data-arzi="${token}"]`)) as Array<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>;
  if (!els.length) return null;
  const el = els[0];
  const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
  if (el.tagName === "SELECT") {
    const s = el as HTMLSelectElement;
    return clean(s.options[s.selectedIndex]?.text);
  }
  if (el.type === "radio") {
    const on = (els as HTMLInputElement[]).find((r) => r.checked);
    if (!on) return "";
    const lab = on.labels?.[0]?.textContent ?? on.closest("label")?.textContent ?? on.nextSibling?.textContent ?? on.value;
    return clean(lab);
  }
  if (el.type === "checkbox") return (el as HTMLInputElement).checked ? "true" : "false";
  return el.value;
}

/** Labels of a marked radio group, in order. */
export function radioLabelsInPage(token: string): string[] {
  const els = Array.from(document.querySelectorAll(`[data-arzi="${token}"]`)) as HTMLInputElement[];
  const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
  return els.map((r) => clean(r.labels?.[0]?.textContent ?? r.closest("label")?.textContent ?? r.nextSibling?.textContent ?? r.value) || r.value);
}

/**
 * A copy of the page safe to leave the kiosk: no scripts, no input values,
 * no selected options, no image data. Payload strings are scrubbed after
 * this in Node (redact.ts).
 */
export function strippedDomInPage(): string {
  const root = document.documentElement.cloneNode(true) as HTMLElement;
  root.querySelectorAll("script, style, noscript, iframe, svg, link[rel=stylesheet]").forEach((n) => n.remove());
  root.querySelectorAll("input").forEach((n) => {
    n.removeAttribute("value");
    n.removeAttribute("checked");
  });
  root.querySelectorAll("textarea").forEach((n) => (n.textContent = ""));
  root.querySelectorAll("option").forEach((n) => n.removeAttribute("selected"));
  root.querySelectorAll("img").forEach((n) => {
    const src = n.getAttribute("src") ?? "";
    if (src.startsWith("data:") || /captcha/i.test(src)) n.setAttribute("src", "about:blank");
  });
  root.querySelectorAll("[data-arzi]").forEach((n) => n.removeAttribute("data-arzi"));
  root.querySelector("#arzidesk-overlay")?.remove();
  return "<!doctype html>\n" + root.outerHTML.replace(/\s{2,}/g, " ");
}
