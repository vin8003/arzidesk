import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { FLOW_STEPS } from "@/lib/desk/flows";
import type { StepKind } from "@/lib/desk/types";
import { buildFor, offersFor, readOptions, todayLike, type AutomationView, type JobOptions } from "./offers";
import { RTI_REG_NO, type Problem } from "./payload";
import { recipeMeta } from "./recipes";
import type { DeviceView } from "./types";

export type { AutomationView, JobOptions, RecipeOffer } from "./offers";

async function openReconcileKinds(userId: string, caseId: string): Promise<Set<StepKind>> {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const rows = await sql<{ step_kind: string }>`
    select distinct step_kind from filing_jobs where user_id = ${userId} and case_id = ${caseId} and status = 'needs_reconcile'
  `;
  return new Set(rows.map((r) => r.step_kind as StepKind));
}

export const getAutomation = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { caseId: string }) => ({ caseId: String(input?.caseId ?? "").slice(0, 64) }))
  .handler(async ({ context, data }): Promise<AutomationView> => {
    const { loadBundle } = await import("@/lib/desk/rows.server");
    const { listDevices, listJobs, sweepStale } = await import("./rows.server");
    const bundle = await loadBundle(context.userId, data.caseId);
    await sweepStale(context.userId);
    const [devices, jobs, reconcile] = await Promise.all([
      listDevices(context.userId),
      listJobs(context.userId, data.caseId),
      openReconcileKinds(context.userId, data.caseId),
    ]);
    return { devices, jobs, offers: offersFor(bundle, reconcile) };
  });

export const startJob = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { caseId: string; stepKind: StepKind; recipeId: string; options?: JobOptions }) => ({
    caseId: String(input?.caseId ?? "").slice(0, 64),
    stepKind: String(input?.stepKind ?? "") as StepKind,
    recipeId: String(input?.recipeId ?? "").slice(0, 60),
    options: readOptions(input?.options),
  }))
  .handler(async ({ context, data }): Promise<{ ok: true; jobId: string } | { ok: false; problems: Problem[] }> => {
    const { loadBundle } = await import("@/lib/desk/rows.server");
    const { hasOpenReconcile, insertJob, jobById } = await import("./rows.server");
    const meta = recipeMeta(data.recipeId);
    if (!meta || !meta.stepKinds.includes(data.stepKind)) throw new Error("This recipe does not fit this step.");
    const bundle = await loadBundle(context.userId, data.caseId);
    if (!FLOW_STEPS[bundle.record.flow].includes(data.stepKind)) throw new Error("This step is not part of this case's flow.");
    const blocked = (en: string, hi: string) => ({ ok: false as const, problems: [{ field: "job", en, hi, severity: "block" as const }] });

    if (meta.kind === "submit" && (await hasOpenReconcile(context.userId, data.caseId, data.stepKind))) {
      return blocked(
        "An earlier attempt may have gone through on the portal. Reconcile it before filing again.",
        "पिछला प्रयास पोर्टल पर हो चुका हो सकता है। दोबारा दाखिल करने से पहले मिलान करें।",
      );
    }
    let filedAfter = todayLike();
    if (meta.purpose === "reconcile") {
      if (!(await hasOpenReconcile(context.userId, data.caseId, data.stepKind))) return blocked("Nothing to reconcile on this step.", "इस कदम पर मिलान के लिए कुछ नहीं है।");
      const { getSql } = await import("@/lib/db");
      const sql = await getSql();
      const rows = await sql<{ id: string }>`
        select id from filing_jobs where case_id = ${data.caseId} and step_kind = ${data.stepKind} and status = 'needs_reconcile' order by created_at desc limit 1
      `;
      const stuck = rows[0] ? await jobById(rows[0].id) : null;
      if (stuck?.submitStartedAt) filedAfter = stuck.submitStartedAt.slice(0, 10);
    }
    const built = buildFor(meta, bundle, data.stepKind, data.options, filedAfter);
    if (!built.ok) return { ok: false, problems: built.problems };
    const jobId = await insertJob({
      userId: context.userId,
      caseId: data.caseId,
      stepKind: data.stepKind,
      recipeId: meta.id,
      recipeVersion: meta.version,
      payload: built.payload,
      redact: built.redact,
    });
    const { addEvent } = await import("@/lib/desk/rows.server");
    await addEvent(context.userId, data.caseId, "automation", `${meta.title.en}: queued for the companion`);
    return { ok: true, jobId };
  });

export const cancelFilingJob = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { jobId: string }) => ({ jobId: String(input?.jobId ?? "").slice(0, 64) }))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const { cancelJob } = await import("./rows.server");
    await cancelJob(context.userId, data.jobId);
    return { ok: true };
  });

export const reconcileByHand = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { jobId: string; reference?: string; notFiled?: boolean }) => {
    const reference = String(input?.reference ?? "").trim().toUpperCase().slice(0, 60);
    if (reference && !RTI_REG_NO.test(reference)) throw new Error("That does not look like an RTI Online registration number.");
    return { jobId: String(input?.jobId ?? "").slice(0, 64), reference: reference || undefined, notFiled: Boolean(input?.notFiled) };
  })
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const { resolveReconcile } = await import("./rows.server");
    await resolveReconcile(context.userId, data.jobId, { reference: data.reference, notFiled: data.notFiled });
    return { ok: true };
  });

export const createPairingCode = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ code: string; expiresAt: string }> => {
    const { createPairing } = await import("./rows.server");
    return createPairing(context.userId);
  });

export const listMyDevices = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<DeviceView[]> => {
    const { listDevices } = await import("./rows.server");
    return listDevices(context.userId);
  });

export const revokeMyDevice = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => ({ id: String(input?.id ?? "").slice(0, 64) }))
  .handler(async ({ context, data }): Promise<DeviceView[]> => {
    const { listDevices, revokeDevice } = await import("./rows.server");
    await revokeDevice(context.userId, data.id);
    return listDevices(context.userId);
  });
