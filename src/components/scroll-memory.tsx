import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { installScrollMemory, pathKey, restoreScroll } from "@/lib/scroll-memory";

/** Keeps Today / Diary / Matters / the file where you left them after opening an entry. */
export function ScrollMemory() {
  const key = useRouterState({
    select: (s) => pathKey(s.location.pathname, s.location.search),
  });

  useEffect(() => installScrollMemory(), []);
  useEffect(() => restoreScroll(key), [key]);

  return null;
}
