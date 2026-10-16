import { nextAction, stepViews } from "./flows";
import { todayIst } from "./timers";
import type { AutomationResult } from "./automation";

/**
 * Automatic first appeal. When an RTI's reply deadline lapses (or the reply is
 * recorded as refused / partial) on a case with auto-appeal on, draft the first
 * appeal without waiting for a click. The operator agreed to this per case when
 * opening it; the appeal is debited from the wallet like any other draft and is
 * never filed automatically — it waits on the case page to be printed and filed.
 */
export async function runAutoAppeals(userId: string, limit = 3): Promise<AutomationResult> {
  const { loadCases } = await import("./rows.server");
  const { runDraft } = await import("./draft.server");
  const out: AutomationResult = { drafted: [], blockedByWallet: [], aiUnavailable: false };
  const today = todayIst();
  const rows = await loadCases(userId, { status: "open", limit: 500 });
  const due = rows.filter(({ record, steps }) => {
    if (!record.autoAppeal) return false;
    const action = nextAction(record, stepViews(record, steps, today), today);
    return action.code === "draft" && action.kind === "first_appeal" && action.autoAppeal;
  });
  for (const { record } of due) {
    if (out.drafted.length >= limit) break;
    const res = await runDraft({ userId, caseId: record.id, kind: "first_appeal", auto: true });
    if (res.ok) {
      out.drafted.push({ caseId: record.id, title: record.title });
      continue;
    }
    if (res.error === "AI_UNAVAILABLE") {
      out.aiUnavailable = true;
      break;
    }
    if (res.error === "PAYWALL") {
      out.blockedByWallet.push({ caseId: record.id, title: record.title });
    }
  }
  return out;
}

