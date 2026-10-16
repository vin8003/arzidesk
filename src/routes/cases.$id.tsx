import { useEffect, useMemo, useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Pencil } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { actionLabel, DueBadge } from "@/components/case-row";
import { ApplicantFields, DetailsFields } from "@/components/case-fields";
import { GuestPanel } from "@/components/guest-panel";
import { StepCard } from "@/components/step-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Field, Label, Select } from "@/components/ui/field";
import { SlideOver } from "@/components/ui/slide-over";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { formatDay } from "@/lib/dates";
import { FLOW_COPY, t } from "@/lib/desk/copy";
import { nextAction, stepViews } from "@/lib/desk/flows";
import { SCHEME_GUIDES } from "@/lib/desk/schemes";
import { stateName } from "@/lib/desk/states";
import { deleteCase, getCase, setCaseStatus, updateCase } from "@/lib/desk/store";
import { todayIst } from "@/lib/desk/timers";
import type { Applicant, CaseBundle, CaseDetails } from "@/lib/desk/types";
import { useDeskLang } from "@/lib/lang";
import { useWallet } from "@/lib/wallet/use-wallet";

export const Route = createFileRoute("/cases/$id")({ component: CasePage });

function CasePage() {
  const { id } = Route.useParams();
  const { lang, onLang } = useDeskLang();
  const { user, isPending } = useCurrentUserState();
  const navigate = useNavigate();
  const { wallet } = useWallet();
  const [bundle, setBundle] = useState<CaseBundle | null>(null);
  const [missing, setMissing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [applicant, setApplicant] = useState<Applicant | null>(null);
  const [details, setDetails] = useState<CaseDetails | null>(null);
  const [draftLang, setDraftLang] = useState<"hi" | "en">("hi");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const hi = lang === "hi";
  const today = todayIst();

  useEffect(() => {
    if (!user) return;
    getCase({ data: { id } })
      .then(setBundle)
      .catch(() => setMissing(true));
  }, [user, id]);

  const views = useMemo(() => (bundle ? stepViews(bundle.record, bundle.steps, today) : []), [bundle, today]);
  const next = useMemo(() => (bundle ? nextAction(bundle.record, views, today) : null), [bundle, views, today]);

  function openEdit() {
    if (!bundle) return;
    setApplicant(bundle.record.applicant);
    setDetails(bundle.record.details);
    setDraftLang(bundle.record.lang);
    setEditing(true);
  }

  async function saveEdit() {
    if (!bundle || !applicant || !details) return;
    setSaving(true);
    try {
      const updated = await updateCase({ data: { id: bundle.record.id, applicant, details, lang: draftLang } });
      setBundle(updated);
      setEditing(false);
      toast.success(hi ? "सेव हुआ। अगला ड्राफ्ट नए तथ्य लेगा।" : "Saved. The next draft uses the new facts.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : hi ? "सेव नहीं हुआ" : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function toggleAuto(on: boolean) {
    if (!bundle) return;
    try {
      setBundle(await updateCase({ data: { id: bundle.record.id, autoAppeal: on } }));
    } catch {
      toast.error(hi ? "सेव नहीं हुआ" : "Could not save");
    }
  }

  async function setStatus(status: "open" | "closed") {
    if (!bundle) return;
    let outcome = "";
    if (status === "closed") {
      const answer = window.prompt(hi ? "परिणाम (वैकल्पिक), जैसे: किस्त आ गई" : "Outcome (optional), e.g. instalments credited");
      if (answer === null) return;
      outcome = answer;
    }
    try {
      setBundle(await setCaseStatus({ data: { id: bundle.record.id, status, outcome } }));
    } catch {
      toast.error(hi ? "सेव नहीं हुआ" : "Could not save");
    }
  }

  async function remove() {
    if (!bundle) return;
    try {
      await deleteCase({ data: { id: bundle.record.id } });
      await navigate({ to: "/cases" });
    } catch {
      toast.error(hi ? "हटाया नहीं जा सका" : "Could not delete");
    }
  }

  const record = bundle?.record;

  return (
    <AppShell lang={lang} onLang={onLang} active="cases">
      {isPending ? <div className="skeleton h-40" /> : null}
      {!isPending && !user ? <GuestPanel lang={lang} /> : null}
      {!isPending && user && missing ? (
        <div className="empty max-w-xl">
          <p className="empty-title">{hi ? "केस नहीं मिला" : "Case not found"}</p>
          <p className="empty-text">{hi ? "यह केस हटाया गया है या किसी और अकाउंट का है।" : "It was deleted or belongs to another account."}</p>
          <div className="empty-actions">
            <Button asChild variant="outline">
              <Link to="/cases">{hi ? "सभी केस" : "All cases"}</Link>
            </Button>
          </div>
        </div>
      ) : null}
      {!isPending && user && !missing && !bundle ? <div className="skeleton h-64" /> : null}

      {bundle && record && next ? (
        <div className="max-w-4xl">
          <Link to="/cases" className="back-link">
            <ArrowLeft className="size-4" aria-hidden />
            {hi ? "सभी केस" : "All cases"}
          </Link>

          <header className="page-head mt-3">
            <div className="page-head-text">
              <p className="eyebrow">
                {t(FLOW_COPY[record.flow].name, lang)}
                {record.scheme ? ` · ${hi ? SCHEME_GUIDES[record.scheme].nameHi : SCHEME_GUIDES[record.scheme].name}` : ""} · {stateName(record.state, lang)}
              </p>
              <h1 className="page-title">{record.title}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                {record.status === "closed" ? (
                  <Badge tone="ok">{hi ? "बंद" : "Closed"}{record.outcome ? ` · ${record.outcome}` : ""}</Badge>
                ) : (
                  <>
                    <span className={next.overdue ? "font-medium text-danger" : "font-medium"}>{actionLabel(next, lang)}</span>
                    <DueBadge on={next.on} today={today} lang={lang} overdue={next.overdue} />
                  </>
                )}
                <Badge>{record.lang === "hi" ? "हिन्दी ड्राफ्ट" : "English drafts"}</Badge>
              </div>
            </div>
            <div className="page-head-actions">
              <Button variant="outline" size="sm" onClick={openEdit}>
                <Pencil className="size-3.5" aria-hidden />
                {hi ? "तथ्य बदलें" : "Edit facts"}
              </Button>
              {record.status === "open" ? (
                <Button variant="outline" size="sm" onClick={() => void setStatus("closed")}>
                  {hi ? "केस बंद करें" : "Close case"}
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={() => void setStatus("open")}>
                  {hi ? "फिर खोलें" : "Reopen"}
                </Button>
              )}
            </div>
          </header>

          <section className="card card-pad stack-tight">
            <dl className="facts">
              <div>
                <dt>{hi ? "नागरिक" : "Citizen"}</dt>
                <dd>{record.applicant.name || "—"}</dd>
              </div>
              <div>
                <dt>{hi ? "ज़िला" : "District"}</dt>
                <dd>{[record.applicant.block, record.applicant.district].filter(Boolean).join(", ") || "—"}</dd>
              </div>
              <div>
                <dt>{hi ? "मोबाइल" : "Mobile"}</dt>
                <dd className={record.applicant.mobile ? "" : "is-empty"}>{record.applicant.mobile || "—"}</dd>
              </div>
              <div>
                <dt>BPL</dt>
                <dd>{record.applicant.bpl ? (hi ? "हाँ" : "Yes") : hi ? "नहीं" : "No"}</dd>
              </div>
              {record.flow === "consumer" ? (
                <div>
                  <dt>{hi ? "विपक्षी" : "Opposite party"}</dt>
                  <dd>{record.details.opponent || "—"}</dd>
                </div>
              ) : (
                <div>
                  <dt>{hi ? "PIO" : "PIO"}</dt>
                  <dd className={record.details.pioAddress ? "" : "is-empty"}>{record.details.pioAddress || (hi ? "अभी नहीं" : "Not yet")}</dd>
                </div>
              )}
              <div>
                <dt>{hi ? "खुला" : "Opened"}</dt>
                <dd>{formatDay(record.createdAt.slice(0, 10), lang, today)}</dd>
              </div>
            </dl>
            {record.flow !== "consumer" ? (
              <label className="mt-4 flex cursor-pointer items-start gap-2.5 border-t border-border pt-4 text-sm">
                <input
                  type="checkbox"
                  checked={record.autoAppeal}
                  onChange={(e) => void toggleAuto(e.target.checked)}
                  className="mt-0.5 size-4 accent-[var(--color-accent)]"
                />
                <span>
                  <span className="font-medium">{hi ? "ऑटो प्रथम अपील" : "Automatic first appeal"}</span>
                  <span className="mt-0.5 block text-[0.8125rem] text-muted">
                    {hi
                      ? "RTI जवाब की समय-सीमा बीतने पर अपील अपने आप ड्राफ्ट होगी (वॉलेट से)।"
                      : "When the RTI reply deadline passes, the appeal is drafted automatically (charged to the wallet)."}
                  </span>
                </span>
              </label>
            ) : null}
          </section>

          <ol className="steps stack" aria-label={hi ? "कदम" : "Steps"}>
            {views.map((view, i) => (
              <StepCard
                key={view.kind}
                bundle={bundle}
                view={view}
                index={i}
                current={record.status === "open" && next.kind === view.kind}
                lang={lang}
                today={today}
                prices={wallet?.prices ?? null}
                onBundle={setBundle}
              />
            ))}
          </ol>

          {bundle.events.length ? (
            <section className="stack">
              <h2 className="section-title">{hi ? "इतिहास" : "History"}</h2>
              <ol className="timeline mt-3">
                {bundle.events.map((ev) => (
                  <li key={ev.id} className="timeline-item">
                    <time dateTime={ev.createdAt}>{formatDay(ev.createdAt.slice(0, 10), lang, today)}</time>
                    <span className="text-sm">{ev.text}</span>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          <div className="stack pb-10 text-right">
            <button type="button" className="link-quiet text-[0.8125rem] text-danger" onClick={() => setConfirmDelete(true)}>
              {hi ? "केस हटाएँ" : "Delete case"}
            </button>
          </div>

          <ConfirmDialog
            open={confirmDelete}
            onOpenChange={setConfirmDelete}
            title={hi ? "यह केस हटाएँ?" : "Delete this case?"}
            text={hi ? "सभी ड्राफ्ट और इतिहास हट जाएँगे। वॉलेट से कटी राशि वापस नहीं होगी।" : "All drafts and history go. Wallet charges are not refunded."}
            confirmLabel={hi ? "हटाएँ" : "Delete"}
            cancelLabel={hi ? "रहने दें" : "Keep"}
            danger
            onConfirm={() => void remove()}
          />

          <SlideOver
            open={editing}
            onClose={() => setEditing(false)}
            title={hi ? "तथ्य बदलें" : "Edit facts"}
            closeLabel={hi ? "बंद करें" : "Close"}
            footer={
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditing(false)}>
                  {hi ? "रद्द" : "Cancel"}
                </Button>
                <Button onClick={() => void saveEdit()} disabled={saving}>
                  {saving ? (hi ? "सेव…" : "Saving…") : hi ? "सेव करें" : "Save"}
                </Button>
              </div>
            }
          >
            {applicant && details ? (
              <div className="flex flex-col gap-6">
                <Field className="max-w-xs">
                  <Label htmlFor="e-lang">{hi ? "ड्राफ्ट की भाषा" : "Draft language"}</Label>
                  <Select id="e-lang" value={draftLang} onChange={(e) => setDraftLang(e.target.value as "hi" | "en")}>
                    <option value="hi">हिन्दी</option>
                    <option value="en">English</option>
                  </Select>
                </Field>
                <ApplicantFields value={applicant} onChange={setApplicant} lang={lang} />
                <DetailsFields flow={record.flow} state={record.state} scheme={record.scheme} value={details} onChange={setDetails} lang={lang} />
              </div>
            ) : null}
          </SlideOver>
        </div>
      ) : null}
    </AppShell>
  );
}
