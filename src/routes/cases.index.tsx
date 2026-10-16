import { useEffect, useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Plus, Search } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { CaseRow } from "@/components/case-row";
import { GuestPanel } from "@/components/guest-panel";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { FLOW_COPY, t } from "@/lib/desk/copy";
import { stateName } from "@/lib/desk/states";
import { listCases, type CaseSummary } from "@/lib/desk/store";
import { todayIst } from "@/lib/desk/timers";
import { FLOWS, STATES, type Flow, type StateCode } from "@/lib/desk/types";
import { useDeskLang } from "@/lib/lang";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/cases/")({ component: CasesPage });

type StatusFilter = "open" | "closed" | "all";

function CasesPage() {
  const { lang, onLang } = useDeskLang();
  const { user, isPending } = useCurrentUserState();
  const [items, setItems] = useState<CaseSummary[] | null>(null);
  const [status, setStatus] = useState<StatusFilter>("open");
  const [flow, setFlow] = useState<Flow | "all">("all");
  const [state, setState] = useState<StateCode | "all">("all");
  const [q, setQ] = useState("");
  const hi = lang === "hi";
  const today = todayIst();

  useEffect(() => {
    if (!user) return;
    listCases({ data: { status: "all" } })
      .then(setItems)
      .catch(() => setItems([]));
  }, [user]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (items ?? []).filter((c) => {
      if (status !== "all" && c.status !== status) return false;
      if (flow !== "all" && c.flow !== flow) return false;
      if (state !== "all" && c.state !== state) return false;
      if (!needle) return true;
      return [c.title, c.applicantName, c.district].some((v) => v.toLowerCase().includes(needle));
    });
  }, [items, status, flow, state, q]);

  return (
    <AppShell lang={lang} onLang={onLang} active="cases">
      {isPending ? <div className="skeleton h-40" /> : null}
      {!isPending && !user ? <GuestPanel lang={lang} /> : null}
      {!isPending && user ? (
        <>
          <header className="page-head">
            <div className="page-head-text">
              <h1 className="page-title">{hi ? "केस" : "Cases"}</h1>
              <p className="page-lead">
                {hi ? "हर नागरिक की समस्या एक केस है। अगला कदम और उसकी तिथि यहाँ दिखती है।" : "One case per citizen problem, with its next step and the date that matters."}
              </p>
            </div>
            <div className="page-head-actions">
              <Button asChild>
                <Link to="/cases/new">
                  <Plus className="size-4" aria-hidden />
                  {hi ? "नई फ़ाइलिंग" : "New filing"}
                </Link>
              </Button>
            </div>
          </header>

          <div className="toolbar stack-tight">
            <div role="radiogroup" aria-label={hi ? "स्थिति" : "Status"} className="seg">
              {(["open", "closed", "all"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={status === s}
                  className={cn("seg-btn", status === s && "is-on")}
                  onClick={() => setStatus(s)}
                >
                  {s === "open" ? (hi ? "खुले" : "Open") : s === "closed" ? (hi ? "बंद" : "Closed") : hi ? "सभी" : "All"}
                </button>
              ))}
            </div>
            <Select value={flow} onChange={(e) => setFlow(e.target.value as Flow | "all")} aria-label={hi ? "प्रकार" : "Flow"} className="w-auto">
              <option value="all">{hi ? "सभी प्रकार" : "All flows"}</option>
              {FLOWS.map((f) => (
                <option key={f} value={f}>
                  {t(FLOW_COPY[f].name, lang)}
                </option>
              ))}
            </Select>
            <Select value={state} onChange={(e) => setState(e.target.value as StateCode | "all")} aria-label={hi ? "राज्य" : "State"} className="w-auto">
              <option value="all">{hi ? "सभी राज्य" : "All states"}</option>
              {STATES.map((s) => (
                <option key={s} value={s}>
                  {stateName(s, lang)}
                </option>
              ))}
            </Select>
            <div className="relative min-w-48 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" aria-hidden />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={hi ? "नाम, ज़िला या शीर्षक" : "Name, district or title"}
                className="w-full pl-9"
                aria-label={hi ? "खोजें" : "Search"}
              />
            </div>
          </div>

          {items === null ? <div className="skeleton stack-tight h-48" /> : null}
          {items !== null && shown.length ? (
            <ul className="list stack-tight">
              {shown.map((item) => (
                <li key={item.id}>
                  <CaseRow item={item} lang={lang} today={today} />
                </li>
              ))}
            </ul>
          ) : null}
          {items !== null && !shown.length ? (
            <div className="empty stack-tight">
              <p className="empty-title">{items.length ? (hi ? "कोई मेल नहीं" : "No case matches") : hi ? "अभी कोई केस नहीं" : "No cases yet"}</p>
              <p className="empty-text">
                {items.length
                  ? hi
                    ? "फ़िल्टर बदलें या खोज साफ़ करें।"
                    : "Change a filter or clear the search."
                  : hi
                    ? "पहली फ़ाइलिंग शुरू करें: पैसा अटका, RTI या उपभोक्ता शिकायत।"
                    : "Start the first filing: money stuck, RTI or a consumer complaint."}
              </p>
            </div>
          ) : null}
        </>
      ) : null}
    </AppShell>
  );
}
