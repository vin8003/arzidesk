import type { StepKind } from "../desk/types.ts";
import type { GateKind, RecipeKind } from "./types.ts";

/**
 * The one list of portal recipes. The companion loads `file` (relative to
 * companion/recipes/) at `version`; a test checks each module exports the
 * same id and version, and that `kind` matches its folder (read/ or submit/),
 * which is what the auto-merge policy keys on.
 */

export type RecipePurpose = "file" | "track" | "reconcile" | "check";

export type RecipeMeta = {
  id: string;
  version: number;
  kind: RecipeKind;
  file: string;
  purpose: RecipePurpose;
  stepKinds: readonly StepKind[];
  portal: { name: string; origin: string };
  title: { en: string; hi: string };
  gates: readonly GateKind[];
};

export const RECIPES = [
  {
    id: "rtionline.file_rti",
    version: 1,
    kind: "submit",
    file: "submit/rtionline-file-rti.ts",
    purpose: "file",
    stepKinds: ["rti_application"],
    portal: { name: "RTI Online (DoPT)", origin: "https://rtionline.gov.in" },
    title: { en: "File on RTI Online", hi: "RTI ऑनलाइन पर दाखिल करें" },
    gates: ["accept_terms", "otp", "captcha", "payment"],
  },
  {
    id: "rtionline.status",
    version: 1,
    kind: "read",
    file: "read/rtionline-status.ts",
    purpose: "track",
    stepKinds: ["rti_application", "first_appeal"],
    portal: { name: "RTI Online (DoPT)", origin: "https://rtionline.gov.in" },
    title: { en: "Check status on RTI Online", hi: "RTI ऑनलाइन पर स्थिति देखें" },
    gates: ["captcha", "otp"],
  },
  {
    id: "rtionline.reconcile",
    version: 1,
    kind: "read",
    file: "read/rtionline-reconcile.ts",
    purpose: "reconcile",
    stepKinds: ["rti_application"],
    portal: { name: "RTI Online (DoPT)", origin: "https://rtionline.gov.in" },
    title: { en: "Payment reconciliation", hi: "भुगतान मिलान" },
    gates: ["captcha", "otp"],
  },
  {
    id: "pmkisan.status",
    version: 1,
    kind: "read",
    file: "read/pmkisan-status.ts",
    purpose: "check",
    stepKinds: ["status_check"],
    portal: { name: "PM-Kisan", origin: "https://pmkisan.gov.in" },
    title: { en: "Know Your Status on PM-Kisan", hi: "पीएम-किसान पर स्थिति देखें" },
    gates: ["captcha", "otp"],
  },
] as const satisfies readonly RecipeMeta[];

export type RecipeId = (typeof RECIPES)[number]["id"];

export function recipeMeta(id: string): RecipeMeta | null {
  return (RECIPES as readonly RecipeMeta[]).find((r) => r.id === id) ?? null;
}
