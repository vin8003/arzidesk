import { FLOW_STEPS } from "../desk/flows.ts";
import type { CaseBundle, StepKind } from "../desk/types.ts";
import {
  pmKisanStatusPayload,
  rtiOnlinePayload,
  rtiReconcilePayload,
  rtiStatusPayload,
  RTI_REG_NO,
  type Built,
  type Problem,
  type RtiOnlineOptions,
} from "./payload.ts";
import { RECIPES, type RecipeMeta } from "./recipes.ts";
import type { DeviceView, JobView } from "./types.ts";

/** Which portal recipes a case can use now, and the payload each would get. Pure. */

/** What the case page can offer for each step. */
export type RecipeOffer = {
  recipeId: string;
  stepKind: StepKind;
  kind: RecipeMeta["kind"];
  purpose: RecipeMeta["purpose"];
  title: { en: string; hi: string };
  portal: string;
  ready: boolean;
  problems: Problem[];
  warnings: Problem[];
  /** Prefill for the job form (rtionline.file_rti). */
  defaults: RtiOnlineOptions;
};

export type AutomationView = {
  devices: DeviceView[];
  jobs: JobView[];
  offers: RecipeOffer[];
};

export type JobOptions = RtiOnlineOptions;

export function readOptions(raw: unknown): JobOptions {
  const o = (raw ?? {}) as Record<string, unknown>;
  const s = (k: string, max: number) => (typeof o[k] === "string" ? (o[k] as string).slice(0, max) : undefined);
  return {
    ministry: s("ministry", 240),
    publicAuthority: s("publicAuthority", 240),
    name: s("name", 120),
    address: s("address", 400),
    email: s("email", 160),
    bplYear: s("bplYear", 4),
    bplAuthority: s("bplAuthority", 160),
  };
}

/** Build the payload a recipe needs from the case. Pure apart from the reconcile flag. */
export function buildFor(meta: RecipeMeta, bundle: CaseBundle, stepKind: StepKind, opts: JobOptions, filedAfter = ""): Built<object> {
  const step = bundle.steps.find((s) => s.kind === stepKind) ?? null;
  switch (meta.id) {
    case "rtionline.file_rti":
      return rtiOnlinePayload(bundle, step, opts);
    case "rtionline.status":
      return rtiStatusPayload(bundle, step, { email: opts.email });
    case "rtionline.reconcile":
      return rtiReconcilePayload(bundle, { email: opts.email, filedAfter });
    case "pmkisan.status":
      return pmKisanStatusPayload(bundle);
    default:
      return { ok: false, problems: [{ field: "recipe", en: "Unknown recipe.", hi: "अज्ञात रेसिपी।", severity: "block" }] };
  }
}

/** Which recipes make sense for this case right now, and whether each could start. */
export function offersFor(bundle: CaseBundle, openReconcile: Set<StepKind>): RecipeOffer[] {
  const { record } = bundle;
  const steps = FLOW_STEPS[record.flow];
  const out: RecipeOffer[] = [];
  for (const meta of RECIPES as readonly RecipeMeta[]) {
    for (const kind of meta.stepKinds) {
      if (!steps.includes(kind)) continue;
      const step = bundle.steps.find((s) => s.kind === kind) ?? null;
      if (meta.id === "rtionline.file_rti") {
        if (record.details.authorityLevel !== "central" || step?.filedOn) continue;
        if (step?.mode && step.mode !== "central_online") continue;
      }
      if (meta.id === "rtionline.status" && !(step?.filedOn && RTI_REG_NO.test(step.reference.toUpperCase()))) continue;
      if (meta.id === "rtionline.reconcile" && !openReconcile.has(kind)) continue;
      if (meta.id === "pmkisan.status" && record.scheme !== "pmkisan") continue;
      const defaults: RtiOnlineOptions =
        meta.id === "rtionline.file_rti" ? { ministry: record.details.authority, publicAuthority: "", email: record.applicant.email } : {};
      const built = buildFor(meta, bundle, kind, defaults, todayLike());
      out.push({
        recipeId: meta.id,
        stepKind: kind,
        kind: meta.kind,
        purpose: meta.purpose,
        title: meta.title,
        portal: meta.portal.name,
        ready: built.ok && !(meta.id === "rtionline.file_rti" && openReconcile.has(kind)),
        problems: built.ok ? [] : built.problems.filter((p) => p.severity === "block"),
        warnings: built.ok ? built.warnings : built.problems.filter((p) => p.severity === "warn"),
        defaults,
      });
    }
  }
  return out;
}

export function todayLike(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

