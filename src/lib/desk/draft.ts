import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { DRAFT_KINDS, type CaseBundle, type DraftKind } from "./types";

export type DraftError = "AI_UNAVAILABLE" | "PAYWALL" | "TIMEOUT" | "PARSE" | "NOT_FOUND" | string;

export type DraftResult =
  | { ok: true; bundle: CaseBundle; chargedPaise: number; balancePaise: number }
  | { ok: false; error: DraftError; balancePaise?: number; neededPaise?: number };

export const draftStep = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { caseId: string; kind: DraftKind; extra?: string; mode?: string }) => {
    const kind = String(input?.kind ?? "") as DraftKind;
    if (!(DRAFT_KINDS as readonly string[]).includes(kind)) throw new Error("Unknown draft kind.");
    return {
      caseId: String(input?.caseId ?? "").slice(0, 64),
      kind,
      extra: String(input?.extra ?? "").slice(0, 1500),
      mode: input?.mode === undefined ? undefined : String(input.mode).slice(0, 40),
    };
  })
  .handler(async ({ context, data }): Promise<DraftResult> => {
    const { runDraft } = await import("./draft.server");
    return runDraft({ userId: context.userId, ...data });
  });
