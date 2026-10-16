import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { dueState, formatDay } from "@/lib/dates";
import { ACTION_COPY, FLOW_COPY, STEP_COPY, t } from "@/lib/desk/copy";
import type { NextAction } from "@/lib/desk/flows";
import type { CaseSummary } from "@/lib/desk/store";
import type { OutputLang } from "@/lib/lang";

export function actionLabel(next: NextAction, lang: OutputLang): string {
  const base = t(ACTION_COPY[next.code], lang);
  if ((next.code === "draft" || next.code === "file") && next.kind) {
    return `${base}: ${t(STEP_COPY[next.kind].name, lang)}`;
  }
  if (next.code === "wait" && next.kind) {
    return `${t(STEP_COPY[next.kind].name, lang)} · ${lang === "hi" ? "जवाब की प्रतीक्षा" : "awaiting reply"}`;
  }
  return base;
}

export function DueBadge({ on, today, lang, overdue }: { on: string | null; today: string; lang: OutputLang; overdue?: boolean }) {
  const state = dueState(on, today);
  if (!state || !on) return null;
  const hi = lang === "hi";
  let tone: BadgeTone = "muted";
  let text = formatDay(on, lang, today);
  if (state.kind === "overdue" || overdue) {
    tone = "danger";
    text = hi ? `${Math.abs(state.days)} दिन देर · ${text}` : `${Math.abs(state.days)}d late · ${text}`;
  } else if (state.kind === "today") {
    tone = "warn";
    text = hi ? "आज" : "Today";
  } else if (state.kind === "tomorrow") {
    tone = "warn";
    text = hi ? "कल" : "Tomorrow";
  } else if (state.kind === "soon") {
    tone = "warn";
    text = hi ? `${state.days} दिन में · ${text}` : `in ${state.days}d · ${text}`;
  }
  return <Badge tone={tone}>{text}</Badge>;
}

export function CaseRow({ item, lang, today }: { item: CaseSummary; lang: OutputLang; today: string }) {
  return (
    <Link to="/cases/$id" params={{ id: item.id }} className="list-row">
      <span className="list-main">
        <span className="list-title">{item.title}</span>
        <span className="list-meta">
          <span>{t(FLOW_COPY[item.flow].short, lang)}</span>
          <span>{item.state}</span>
          {item.district ? <span>{item.district}</span> : null}
          <span className={item.next.overdue ? "text-danger" : "text-fg"}>
            {item.status === "closed" ? (lang === "hi" ? "बंद" : "Closed") : actionLabel(item.next, lang)}
          </span>
        </span>
      </span>
      <span className="list-end">
        {item.status === "open" ? <DueBadge on={item.next.on} today={today} lang={lang} overdue={item.next.overdue} /> : null}
        {item.next.autoAppeal ? <Badge tone="accent">{lang === "hi" ? "ऑटो-अपील" : "Auto-appeal"}</Badge> : null}
        <ChevronRight className="size-4" aria-hidden />
      </span>
    </Link>
  );
}
