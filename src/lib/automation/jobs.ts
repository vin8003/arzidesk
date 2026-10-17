import type { StepPatch } from "../desk/schema.ts";
import { recipeMeta } from "./recipes.ts";
import { ACTIVE_STATUSES, type FailureClass, type GateKind, type JobResult, type JobStatus } from "./types.ts";

/** The job lifecycle. Pure; the store applies it and the runner API refuses anything else. */

const NEXT: Record<JobStatus, readonly JobStatus[]> = {
  queued: ["running", "cancelled", "failed"],
  running: ["waiting_human", "submitting", "succeeded", "failed", "cancelled", "running"],
  waiting_human: ["running", "submitting", "succeeded", "failed", "cancelled", "waiting_human"],
  // Past the submit click there is no clean failure: unknown means reconcile.
  submitting: ["waiting_human", "running", "succeeded", "needs_reconcile", "submitting"],
  succeeded: [],
  failed: [],
  needs_reconcile: ["succeeded", "failed"],
  cancelled: [],
};

export function canMove(from: JobStatus, to: JobStatus): boolean {
  return NEXT[from].includes(to);
}

export function isActive(status: JobStatus): boolean {
  return (ACTIVE_STATUSES as readonly string[]).includes(status);
}

export function isFinal(status: JobStatus): boolean {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}

/**
 * Where a failure report really lands. Once the submit boundary was crossed,
 * any failure (crash, timeout, unreadable receipt) means nobody knows whether
 * the portal took it, so the job waits for reconciliation instead of failing.
 */
export function settleFailure(opts: { submitStarted: boolean; failure: FailureClass }): { status: JobStatus; failure: FailureClass } {
  if (opts.submitStarted && opts.failure !== "portal_rejected") return { status: "needs_reconcile", failure: "after_submit_unknown" };
  if (opts.failure === "cancelled") return { status: "cancelled", failure: "cancelled" };
  return { status: "failed", failure: opts.failure };
}

/** A recipe failure worth repairing: the portal moved under the recipe. */
export function wantsRepair(failure: FailureClass | null): boolean {
  return failure === "drift";
}

/** A gate left this long fails the job (or sends it to reconcile). */
export const GATE_TIMEOUT_MS = 15 * 60 * 1000;

/** A device that has not polled for this long is shown as offline. */
export const DEVICE_ONLINE_MS = 90 * 1000;

/** A running job whose device went quiet this long is treated as abandoned. */
export const JOB_STALE_MS = 20 * 60 * 1000;

/** What a successful job writes to its case step. Null: nothing to write. */
export function stepPatchFor(recipeId: string, result: JobResult, today: string): StepPatch | null {
  const meta = recipeMeta(recipeId);
  if (!meta) return null;
  switch (meta.purpose) {
    case "file":
    case "reconcile": {
      if (!result.reference) return null;
      return {
        filedOn: result.filedOn ?? today,
        reference: result.reference,
        mode: "central_online",
      };
    }
    case "track": {
      const patch: StepPatch = {};
      if (result.replyText) patch.replyText = result.replyText;
      if (result.replyOn) patch.replyOn = result.replyOn;
      return Object.keys(patch).length ? patch : null;
    }
    case "check": {
      if (!result.finding) return null;
      return { status: "done", outcome: result.finding, notes: result.notes ?? result.portalStatus ?? "" };
    }
  }
}

export const GATE_COPY: Record<GateKind, { en: string; hi: string }> = {
  accept_terms: { en: "Read the portal's guidelines and tick the box", hi: "पोर्टल के दिशानिर्देश पढ़कर बॉक्स पर टिक करें" },
  login: { en: "Sign in on the portal", hi: "पोर्टल पर लॉग-इन करें" },
  captcha: { en: "Type the security code", hi: "सुरक्षा कोड भरें" },
  otp: { en: "Enter the OTP the citizen received", hi: "नागरिक को मिला OTP भरें" },
  payment: { en: "Pay the fee on the payment page", hi: "भुगतान पेज पर फ़ीस भरें" },
  assist: { en: "Fill one field by hand", hi: "एक खाना हाथ से भरें" },
};

export const STATUS_COPY: Record<JobStatus, { en: string; hi: string }> = {
  queued: { en: "Waiting for the companion", hi: "कम्पैनियन का इंतज़ार" },
  running: { en: "Working on the portal", hi: "पोर्टल पर काम चल रहा है" },
  waiting_human: { en: "Needs you", hi: "आपकी ज़रूरत है" },
  submitting: { en: "Submitting", hi: "जमा हो रहा है" },
  succeeded: { en: "Done", hi: "हो गया" },
  failed: { en: "Stopped", hi: "रुक गया" },
  needs_reconcile: { en: "Check before retrying", hi: "दोबारा करने से पहले जाँचें" },
  cancelled: { en: "Cancelled", hi: "रद्द" },
};
