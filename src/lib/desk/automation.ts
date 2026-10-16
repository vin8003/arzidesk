import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";

export type AutomationResult = {
  drafted: Array<{ caseId: string; title: string }>;
  /** Appeals that are due but the wallet could not pay for. */
  blockedByWallet: Array<{ caseId: string; title: string }>;
  aiUnavailable: boolean;
};

export const runAutomations = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<AutomationResult> => {
    const { runAutoAppeals } = await import("./automation.server");
    return runAutoAppeals(context.userId, 3);
  });
