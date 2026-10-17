import { useCallback, useEffect, useRef, useState } from "react";
import { isActive } from "./jobs";
import { getAutomation, type AutomationView } from "./store";

/**
 * Automation state for one case. Polls every 2.5 s while a job is live (so
 * the operator sees each gate as it comes) and every 30 s otherwise (device
 * online state). Calls `onSettled` when a job leaves the live states, so the
 * case page can reload the step the job just wrote to.
 */
export function useAutomation(caseId: string | null, onSettled: () => void) {
  const [view, setView] = useState<AutomationView | null>(null);
  const live = useRef<Set<string>>(new Set());
  const settled = useRef(onSettled);
  settled.current = onSettled;

  const refresh = useCallback(async () => {
    if (!caseId) return;
    try {
      const next = await getAutomation({ data: { caseId } });
      const nowLive = new Set(next.jobs.filter((j) => isActive(j.status)).map((j) => j.id));
      const ended = [...live.current].some((id) => !nowLive.has(id));
      live.current = nowLive;
      setView(next);
      if (ended) settled.current();
    } catch {
      /* keep the last view; the next tick retries */
    }
  }, [caseId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const anyLive = Boolean(view?.jobs.some((j) => isActive(j.status)));
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, anyLive ? 2_500 : 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [anyLive, refresh]);

  return { automation: view, refreshAutomation: refresh };
}
