import { useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { FileSearch, IndianRupee, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { ApplicantFields, DetailsFields } from "@/components/case-fields";
import { GuestPanel } from "@/components/guest-panel";
import { Button } from "@/components/ui/button";
import { Field, Hint, Label, Select } from "@/components/ui/field";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { FLOW_COPY, t } from "@/lib/desk/copy";
import { SAMPLES } from "@/lib/desk/samples";
import { SCHEME_GUIDES } from "@/lib/desk/schemes";
import { STATE_PROFILES, stateName } from "@/lib/desk/states";
import { createCase } from "@/lib/desk/store";
import { FLOWS, SCHEMES, STATES, emptyApplicant, emptyDetails, type Flow, type Scheme, type StateCode } from "@/lib/desk/types";
import { useDeskLang } from "@/lib/lang";
import { cn } from "@/lib/utils";

type NewSearch = { flow?: Flow };

export const Route = createFileRoute("/cases/new")({
  validateSearch: (search: Record<string, unknown>): NewSearch => ({
    flow: (FLOWS as readonly string[]).includes(String(search.flow)) ? (search.flow as Flow) : undefined,
  }),
  component: NewCase,
});

const ICONS = { money: IndianRupee, rti: FileSearch, consumer: ShoppingBag } as const;

function NewCase() {
  const { lang, onLang } = useDeskLang();
  const { user, isPending } = useCurrentUserState();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const hi = lang === "hi";

  const [flow, setFlow] = useState<Flow>(search.flow ?? "money");
  const [state, setState] = useState<StateCode>("UP");
  const [draftLang, setDraftLang] = useState<"hi" | "en">("hi");
  const [scheme, setScheme] = useState<Scheme>("pmkisan");
  const [autoAppeal, setAutoAppeal] = useState(true);
  const [applicant, setApplicant] = useState(emptyApplicant);
  const [details, setDetails] = useState(emptyDetails);
  const [busy, setBusy] = useState(false);

  function pickFlow(next: Flow) {
    setFlow(next);
    void navigate({ to: "/cases/new", search: { flow: next }, replace: true });
  }

  function fillSample() {
    const s = SAMPLES[flow];
    setState(s.state);
    if (s.scheme) setScheme(s.scheme);
    setApplicant(s.applicant);
    setDetails(s.details);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!applicant.name.trim() || !applicant.district.trim()) {
      toast.error(hi ? "नागरिक का नाम और ज़िला ज़रूरी है।" : "Citizen's name and district are required.");
      return;
    }
    setBusy(true);
    try {
      const { id } = await createCase({
        data: {
          flow,
          state,
          lang: draftLang,
          scheme: flow === "money" ? scheme : null,
          title: "",
          autoAppeal,
          applicant,
          details,
        },
      });
      await navigate({ to: "/cases/$id", params: { id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : hi ? "केस नहीं बना।" : "Could not create the case.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell lang={lang} onLang={onLang} active="new">
      {isPending ? <div className="skeleton h-40" /> : null}
      {!isPending && !user ? <GuestPanel lang={lang} /> : null}
      {!isPending && user ? (
        <form onSubmit={onSubmit} className="max-w-3xl">
          <header className="page-head">
            <div className="page-head-text">
              <h1 className="page-title">{hi ? "नई फ़ाइलिंग" : "New filing"}</h1>
              <p className="page-lead">{t(FLOW_COPY[flow].lead, lang)}</p>
            </div>
          </header>

          <div className="stack-tight grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label={hi ? "प्रकार" : "Flow"}>
            {FLOWS.map((f) => {
              const Icon = ICONS[f];
              const on = f === flow;
              return (
                <button
                  key={f}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => pickFlow(f)}
                  className={cn("path text-left transition-colors hover:bg-elevated", on && "is-primary !border-accent")}
                >
                  <span className="path-icon">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="path-title">{t(FLOW_COPY[f].name, lang)}</span>
                  <span className="path-text">{t(FLOW_COPY[f].steps, lang)}</span>
                </button>
              );
            })}
          </div>

          <section className="card card-pad stack">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="section-title">{hi ? "कहाँ और किस भाषा में" : "Where, and in which language"}</h2>
              <button type="button" className="link-accent text-sm" onClick={fillSample}>
                {hi ? "नमूना भरें" : "Fill a sample"}
              </button>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Field>
                <Label htmlFor="n-state">{hi ? "राज्य" : "State"}</Label>
                <Select id="n-state" value={state} onChange={(e) => setState(e.target.value as StateCode)}>
                  {STATES.map((s) => (
                    <option key={s} value={s}>
                      {stateName(s, lang)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field>
                <Label htmlFor="n-lang">{hi ? "ड्राफ्ट की भाषा" : "Draft language"}</Label>
                <Select id="n-lang" value={draftLang} onChange={(e) => setDraftLang(e.target.value as "hi" | "en")}>
                  <option value="hi">हिन्दी</option>
                  <option value="en">English</option>
                </Select>
                <Hint>{hi ? "rtionline.gov.in के लिए अंग्रेज़ी अपने आप।" : "rtionline.gov.in text is always English."}</Hint>
              </Field>
              {flow === "money" ? (
                <Field>
                  <Label htmlFor="n-scheme">{hi ? "योजना" : "Scheme"}</Label>
                  <Select id="n-scheme" value={scheme} onChange={(e) => setScheme(e.target.value as Scheme)}>
                    {SCHEMES.map((s) => (
                      <option key={s} value={s}>
                        {hi ? SCHEME_GUIDES[s].nameHi : SCHEME_GUIDES[s].name}
                      </option>
                    ))}
                  </Select>
                  {scheme === "mgnrega" && state === "DL" ? (
                    <Hint className="text-warn">{hi ? "मनरेगा ग्रामीण योजना है; दिल्ली में लागू है या नहीं, जाँचें।" : "MGNREGA is a rural scheme; check it applies in Delhi."}</Hint>
                  ) : null}
                </Field>
              ) : null}
            </div>
            {STATE_PROFILES[state].rti.verify && flow !== "consumer" ? (
              <p className="callout is-warn mt-4 text-[0.8125rem]">
                {hi ? STATE_PROFILES[state].rti.notesHi[0] : STATE_PROFILES[state].rti.notes[0]}
              </p>
            ) : null}
          </section>

          <section className="card card-pad stack-tight">
            <h2 className="section-title">{hi ? "नागरिक" : "Citizen"}</h2>
            <div className="mt-4">
              <ApplicantFields value={applicant} onChange={setApplicant} lang={lang} />
            </div>
          </section>

          <section className="card card-pad stack-tight">
            <h2 className="section-title">{hi ? "मामला" : "The problem"}</h2>
            <div className="mt-4">
              <DetailsFields flow={flow} state={state} scheme={flow === "money" ? scheme : null} value={details} onChange={setDetails} lang={lang} />
            </div>
            {flow !== "consumer" ? (
              <label className="mt-5 flex cursor-pointer items-start gap-2.5 border-t border-border pt-4 text-sm">
                <input
                  type="checkbox"
                  checked={autoAppeal}
                  onChange={(e) => setAutoAppeal(e.target.checked)}
                  className="mt-0.5 size-4 accent-[var(--color-accent)]"
                />
                <span>
                  <span className="font-medium">{hi ? "प्रथम अपील अपने आप ड्राफ्ट करें" : "Draft the first appeal automatically"}</span>
                  <span className="mt-0.5 block text-[0.8125rem] text-muted">
                    {hi
                      ? "RTI का जवाब समय पर न आए या अधूरा हो, तो अपील अपने आप ड्राफ्ट होकर वॉलेट से कटेगी। दाखिल आप ही करेंगे।"
                      : "When the RTI reply is late or incomplete, the appeal is drafted on its own and charged to the wallet. You still check and file it."}
                  </span>
                </span>
              </label>
            ) : null}
          </section>

          <div className="stack-tight flex flex-wrap items-center gap-3 pb-10">
            <Button type="submit" size="lg" disabled={busy}>
              {busy ? (hi ? "बन रहा है…" : "Creating…") : hi ? "केस खोलें" : "Open the case"}
            </Button>
            <span className="text-sm text-muted">{hi ? "केस खोलना मुफ़्त है। केवल ड्राफ्ट पर कटौती होती है।" : "Opening a case is free. Only drafts are charged."}</span>
          </div>
        </form>
      ) : null}
    </AppShell>
  );
}
