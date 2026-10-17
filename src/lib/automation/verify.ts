/**
 * Read-back check before anything irreversible: every value the recipe put
 * on the page is read back from the DOM and compared with the payload.
 * A mismatch stops the job before the submit click.
 */

export type Mismatch = { key: string; expected: string; actual: string };

export function normValue(v: string): string {
  return v.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim().toLowerCase();
}

/**
 * Compare by meaning, not bytes: whitespace and case are ignored (portals
 * upper-case and trim on input). A field the portal truncated is a mismatch.
 */
export function compareReadback(expected: Record<string, string>, actual: Record<string, string | null | undefined>): Mismatch[] {
  const out: Mismatch[] = [];
  for (const [key, want] of Object.entries(expected)) {
    const got = actual[key];
    if (got == null) {
      out.push({ key, expected: want, actual: "(missing)" });
      continue;
    }
    if (normValue(got) !== normValue(want)) out.push({ key, expected: want, actual: got });
  }
  return out;
}

/** Shortened, value-free description for logs that leave the kiosk. */
export function describeMismatches(m: Mismatch[]): string {
  return m.map((x) => `${x.key}: expected ${x.expected.length} chars, page has ${x.actual === "(missing)" ? "nothing" : `${x.actual.length} chars`}`).join("; ");
}
