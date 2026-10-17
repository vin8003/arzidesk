import type { Locator, Page } from "playwright";
import type { FailureClass, GateKind, Inventory, JobResult } from "../../src/lib/automation/types.ts";
import type { PmKisanStatus, RtiStatus } from "../../src/lib/automation/receipt.ts";
import type { OptionPick } from "../../src/lib/automation/match.ts";

/**
 * The contract between a recipe and the companion. Recipes import types
 * only: at run time a recipe is a single downloaded file, and everything it
 * needs (locators, gates, parsers) comes in through `kit`.
 */

/** How to find one form control. Label patterns are tried in order; name/id win when present on the page. */
export type FieldSpec = {
  key: string;
  /** Plain words for the operator and the model fallback, e.g. "Applicant's email address". */
  describe: string;
  label?: RegExp | RegExp[];
  name?: string;
  id?: string;
  css?: string;
  /** Only controls of these kinds: "text" covers input text/email/tel/number/password and textarea. */
  kinds?: Array<"text" | "textarea" | "select" | "radio" | "checkbox" | "file">;
};

export type ClickTarget = { role?: "button" | "link"; name?: RegExp | string; css?: string; value?: RegExp | string };

export type GateOptions = {
  /** Resolves the gate without the Continue button as soon as it returns true. */
  until?: () => Promise<boolean>;
  /** What to do after Continue (e.g. press the portal's Submit). Not run when `until` resolved it. */
  onContinue?: () => Promise<void>;
  field?: string;
  value?: string;
  timeoutMs?: number;
};

export interface Kit<P = Record<string, unknown>> {
  readonly page: Page;
  readonly payload: P;
  /** Canary mode: open public pages and checkpoint them; never type, tick or submit. */
  readonly dryRun: boolean;
  /** Pure helpers shipped with the companion. */
  readonly lib: {
    findRtiRegistration(text: string): string | null;
    parseRtiStatus(text: string): RtiStatus;
    parsePmKisanStatus(text: string): PmKisanStatus;
    isoFromIndian(text: string): string | null;
    pickOption(wanted: string, options: string[]): OptionPick;
  };

  log(text: string): Promise<void>;
  warn(text: string): Promise<void>;
  /** Navigate; a network failure becomes `portal_down`. Origins can be overridden for tests. */
  goto(url: string): Promise<void>;
  /** Record the page's field inventory under `stepId` (drift detection). Returns it. */
  checkpoint(stepId: string): Promise<Inventory>;
  inventory(): Promise<Inventory>;
  /** Visible text of the page. */
  text(): Promise<string>;
  has(spec: FieldSpec): Promise<boolean>;
  field(spec: FieldSpec): Promise<Locator>;
  fill(spec: FieldSpec, value: string): Promise<void>;
  /** Select option, radio choice or checkbox, whichever the portal uses for this field. */
  pick(spec: FieldSpec, value: string | boolean, opts?: { publicValue?: boolean; waitForOptions?: boolean }): Promise<string>;
  click(target: ClickTarget): Promise<void>;
  /** Wait for the portal (navigation, AJAX). */
  settle(ms?: number): Promise<void>;
  waitFor(cond: () => Promise<boolean>, timeoutMs: number): Promise<boolean>;
  gate(kind: GateKind, message: string, opts?: GateOptions): Promise<void>;
  /** Read every field back and stop before submit on any mismatch. */
  verify(expected: Array<{ spec: FieldSpec; value: string }>): Promise<void>;
  /** The irreversible boundary: reported to ArziDesk before `fn` runs. */
  submit<T>(label: string, fn: () => Promise<T>): Promise<T>;
  /** The portal turned the submit down (wrong captcha…): nothing was filed, so the boundary is lifted. */
  submitRejected(reason: string): Promise<void>;
  screenshot(name: string, opts?: { receipt?: boolean }): Promise<string | null>;
  fail(failure: FailureClass, message: string): never;
  today(): string;
}

export type Recipe<P = Record<string, unknown>> = {
  id: string;
  version: number;
  run(kit: Kit<P>): Promise<JobResult>;
  /** Public pages only. Must not call gate(), fill(), pick() or submit(). */
  canary?(kit: Kit<P>): Promise<void>;
};
