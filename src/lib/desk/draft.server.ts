import { pullJson } from "@/lib/ai/json";
import { fastModel, researchModel } from "@/lib/ai/models";
import { sendWithFallback } from "@/lib/ai/retry";
import { XaiHttpError, asErrorMessage, collectFromOutput, type XaiResponse } from "@/lib/ai/xai-response";
import { chargeFor, inrToPaise } from "@/lib/wallet/pricing";
import { assembleDraft } from "./assemble";
import {
  COMPLAINT_MAX_OUTPUT_TOKENS,
  COMPLAINT_TIMEOUT_MS,
  DRAFT_MAX_OUTPUT_TOKENS,
  DRAFT_MIN_RETRY_MS,
  DRAFT_SYSTEM,
  DRAFT_TIMEOUT_MS,
  buildDraftUser,
  draftXaiBody,
  parseDraft,
} from "./draft-prompt";
import type { DraftResult } from "./draft";
import type { CaseBundle, DraftDoc, DraftKind } from "./types";

/**
 * One Grok call per draft. Same xAI request shape and retry policy as CiteBench:
 * POST /v1/responses with a strict JSON schema, one legacy-body fallback on a
 * shape rejection, one repair turn on unparseable JSON. The wallet is debited
 * before the call and refunded if the call fails, so a failed draft costs nothing.
 */
export async function runDraft(opts: {
  userId: string;
  caseId: string;
  kind: DraftKind;
  extra?: string;
  mode?: string;
  /** Set by the auto-appeal runner so the ledger says why it was charged. */
  auto?: boolean;
}): Promise<DraftResult> {
  const { addEvent, ensureStep, loadBundle, patchStep, saveDraft, touchCase, NotFoundError } = await import("./rows.server");
  const { debit, readPrices, refund, InsufficientBalanceError } = await import("@/lib/wallet/ledger.server");

  let bundle: CaseBundle;
  try {
    bundle = await loadBundle(opts.userId, opts.caseId);
  } catch (err) {
    if (err instanceof NotFoundError) return { ok: false, error: "NOT_FOUND" };
    throw err;
  }
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return { ok: false, error: "AI_UNAVAILABLE" };

  let step = await ensureStep(opts.userId, bundle.record, opts.kind);
  if (opts.mode !== undefined && opts.mode !== step.mode) {
    step = await patchStep(opts.userId, step, { mode: opts.mode });
    bundle = { ...bundle, steps: [...bundle.steps.filter((s) => s.kind !== opts.kind), step] };
  }

  const prices = await readPrices();
  const chargePaise = inrToPaise(chargeFor(prices[opts.kind], step.generations));

  let debitId: string | null = null;
  try {
    const res = await debit({
      userId: opts.userId,
      amountPaise: chargePaise,
      task: opts.kind,
      caseId: bundle.record.id,
      stepId: step.id,
      note: `${opts.auto ? "Auto-draft" : "Draft"}: ${opts.kind.replace(/_/g, " ")} · ${bundle.record.title}`.slice(0, 200),
    });
    debitId = res.debitId;
  } catch (err) {
    if (err instanceof InsufficientBalanceError) {
      return { ok: false, error: "PAYWALL", balancePaise: err.balancePaise, neededPaise: err.neededPaise };
    }
    throw err;
  }

  const complex = opts.kind === "consumer_complaint";
  const model = complex ? researchModel() : fastModel();
  const timeoutMs = complex ? COMPLAINT_TIMEOUT_MS : DRAFT_TIMEOUT_MS;
  const maxOutputTokens = complex ? COMPLAINT_MAX_OUTPUT_TOKENS : DRAFT_MAX_OUTPUT_TOKENS;
  const user = buildDraftUser(opts.kind, bundle, { extra: opts.extra });
  const lang = opts.kind === "rti_application" && step.mode === "central_online" ? "en" : bundle.record.lang;

  const deadline = Date.now() + timeoutMs;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const post = async (body: object): Promise<string> => {
    const res = await fetch("https://api.x.ai/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new XaiHttpError(res.status, await res.text().catch(() => ""));
    const payload = (await res.json()) as XaiResponse;
    const err = asErrorMessage(payload.error);
    if (err) throw new Error(err);
    return collectFromOutput(payload).text;
  };

  try {
    const { value: parsed } = await sendWithFallback({
      tag: `draft:${opts.kind}`,
      send: post,
      build: ({ legacy, repair }) => draftXaiBody(DRAFT_SYSTEM, user, { model, maxOutputTokens, legacy, repair }),
      parse: (text) => parseDraft(text, pullJson),
      deadline,
      minRetryMs: DRAFT_MIN_RETRY_MS,
    });
    const doc: DraftDoc = {
      kind: opts.kind,
      lang,
      ...parsed,
      model,
      generatedAt: new Date().toISOString(),
    };
    const docText = assembleDraft(opts.kind, doc, bundle);
    await saveDraft(opts.userId, step, doc, docText);
    const paid = chargePaise > 0 ? ` · ₹${chargePaise / 100}` : " · free regeneration";
    await addEvent(
      opts.userId,
      bundle.record.id,
      opts.auto ? "auto_draft" : "draft",
      `${opts.auto ? "Auto-drafted" : "Drafted"} ${opts.kind.replace(/_/g, " ")}${paid}`,
    );
    await touchCase(opts.userId, bundle.record.id);
    const { balanceOf } = await import("@/lib/wallet/ledger.server");
    return {
      ok: true,
      bundle: await loadBundle(opts.userId, bundle.record.id),
      chargedPaise: chargePaise,
      balancePaise: await balanceOf(opts.userId),
    };
  } catch (err) {
    await refund(opts.userId, debitId).catch((e) => console.error("[draft] refund failed", e));
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[draft:${opts.kind}]`, message);
    if (message.includes("abort") || message.toLowerCase().includes("timeout")) return { ok: false, error: "TIMEOUT" };
    if (message === "PARSE" || message.includes("JSON")) return { ok: false, error: "PARSE" };
    return { ok: false, error: message };
  } finally {
    clearTimeout(timer);
  }
}

