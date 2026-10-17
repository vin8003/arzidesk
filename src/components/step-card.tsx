import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Check, ChevronDown, Copy, Printer, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { AutoFilePanel } from "@/components/auto-file-panel";
import { DueBadge } from "@/components/case-row";
import { StepGuide } from "@/components/step-guide";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Hint, Input, Label, Select, Textarea } from "@/components/ui/field";
import type { AutomationView } from "@/lib/automation/store";
import { formatDay } from "@/lib/dates";
import { countChars, countWords, nonAsciiCount } from "@/lib/desk/assemble";
import { MODE_COPY, OUTCOME_COPY, PHASE_COPY, STEP_COPY, t } from "@/lib/desk/copy";
import { draftStep } from "@/lib/desk/draft";
import { CENTRAL_ONLINE_CHAR_BUDGET, GRIEVANCE_CHAR_BUDGET, NCH_CHAR_BUDGET } from "@/lib/desk/draft-prompt";
import { OUTCOMES_BY_KIND, type StepPhase, type StepView } from "@/lib/desk/flows";
import { schemeGuide } from "@/lib/desk/schemes";
import { rtiRulesFor } from "@/lib/desk/states";
import type { StepPatch } from "@/lib/desk/schema";
import { saveStep } from "@/lib/desk/store";
import { isDraftKind, type CaseBundle, type CaseRecord, type RtiMode } from "@/lib/desk/types";
import type { OutputLang } from "@/lib/lang";
import { chargeFor, formatInr, inrToPaise, type PriceList } from "@/lib/wallet/pricing";
import { announceWallet } from "@/lib/wallet/use-wallet";
import { cn } from "@/lib/utils";

const PHASE_TONE: Record<StepPhase, BadgeTone> = {
  upcoming: "muted",
  ready: "accent",
  drafted: "warn",
  waiting: "muted",
  lapsed: "danger",
  resolved: "ok",
  escalate: "danger",
  fix: "warn",
  skipped: "muted",
};

const SKIPPABLE = new Set(["grievance", "nch", "second_appeal", "status_check", "legal_notice"]);

function defaultMode(record: CaseRecord): RtiMode {
  if (record.details.authorityLevel === "central") return "central_online";
  return "postal";
}

function errorText(error: string, lang: OutputLang): string {
  const hi = lang === "hi";
  if (error === "AI_UNAVAILABLE") return hi ? "AI अभी जुड़ा नहीं है (XAI_API_KEY सेट करें)। वॉलेट से कुछ नहीं कटा।" : "AI is not connected yet (set XAI_API_KEY). Nothing was charged.";
  if (error === "TIMEOUT") return hi ? "ड्राफ्ट में बहुत समय लगा। पैसा वापस हो गया; फिर कोशिश करें।" : "The draft took too long. The charge was refunded; try again.";
  if (error === "PARSE") return hi ? "AI का जवाब पढ़ा नहीं जा सका। पैसा वापस हो गया; फिर कोशिश करें।" : "Could not read the AI's reply. The charge was refunded; try again.";
  if (error === "NOT_FOUND") return hi ? "केस नहीं मिला।" : "Case not found.";
  return hi ? `ड्राफ्ट नहीं बना: ${error}. पैसा वापस हो गया।` : `Draft failed: ${error}. The charge was refunded.`;
}

export function StepCard({
  bundle,
  view,
  index,
  current,
  lang,
  today,
  prices,
  onBundle,
  automation,
  onAutomation,
}: {
  bundle: CaseBundle;
  view: StepView;
  index: number;
  current: boolean;
  lang: OutputLang;
  today: string;
  prices: PriceList | null;
  onBundle: (next: CaseBundle) => void;
  automation: AutomationView | null;
  /** Something changed on the automation side (job started, cancelled, reconciled): refetch. */
  onAutomation: () => void;
}) {
  const hi = lang === "hi";
  const { record } = bundle;
  const step = view.step;
  const kind = view.kind;
  const [open, setOpen] = useState(current);
  const [extra, setExtra] = useState("");
  const [text, setText] = useState(step?.docText ?? "");
  const [busy, setBusy] = useState<null | "draft" | "save" | "file" | "outcome" | "skip">(null);
  const [paywall, setPaywall] = useState<{ balance: number; needed: number } | null>(null);
  const [mode, setMode] = useState<string>(step?.mode || (kind === "rti_application" ? defaultMode(record) : ""));
  const [filedOn, setFiledOn] = useState(step?.filedOn ?? today);
  const [reference, setReference] = useState(step?.reference ?? "");
  const [viaApio, setViaApio] = useState(step?.viaApio ?? false);
  const [deliveredOn, setDeliveredOn] = useState(step?.deliveredOn ?? "");
  const [replyOn, setReplyOn] = useState(step?.replyOn ?? "");
  const [outcome, setOutcome] = useState(step?.outcome ?? "");
  const [replyText, setReplyText] = useState(step?.replyText ?? "");
  const [notes, setNotes] = useState(step?.notes ?? "");

  useEffect(() => setOpen((was) => was || current), [current]);
  useEffect(() => setText(step?.docText ?? ""), [step?.docText]);
  useEffect(() => {
    setFiledOn(step?.filedOn ?? today);
    setReference(step?.reference ?? "");
    setViaApio(step?.viaApio ?? false);
    setDeliveredOn(step?.deliveredOn ?? "");
    setReplyOn(step?.replyOn ?? "");
    setOutcome(step?.outcome ?? "");
    setReplyText(step?.replyText ?? "");
    setNotes(step?.notes ?? "");
    if (step?.mode) setMode(step.mode);
  }, [step?.updatedAt, step?.filedOn, step?.reference, step?.viaApio, step?.deliveredOn, step?.replyOn, step?.outcome, step?.replyText, step?.notes, step?.mode, today]);

  const draftable = isDraftKind(kind);
  const price = draftable && prices ? prices[kind] : 0;
  const nextCharge = draftable ? chargeFor(price, step?.generations ?? 0) : 0;
  const hasDoc = Boolean(step?.doc || step?.docText);
  const filed = Boolean(step?.filedOn);
  const dirty = text !== (step?.docText ?? "");

  async function patch(p: StepPatch, tag: NonNullable<typeof busy>, ok?: string) {
    setBusy(tag);
    try {
      const next = await saveStep({ data: { caseId: record.id, kind, patch: p } });
      onBundle(next);
      if (ok) toast.success(ok);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : hi ? "सेव नहीं हुआ।" : "Could not save.");
    } finally {
      setBusy(null);
    }
  }

  async function draft() {
    if (!draftable) return;
    if (dirty && !window.confirm(hi ? "आपके बदलाव नए ड्राफ्ट से बदल जाएँगे। आगे बढ़ें?" : "Your edits will be replaced by the new draft. Continue?")) return;
    setBusy("draft");
    setPaywall(null);
    try {
      const res = await draftStep({ data: { caseId: record.id, kind, extra, mode: kind === "rti_application" ? mode : undefined } });
      if (!res.ok) {
        if (res.error === "PAYWALL") {
          setPaywall({ balance: res.balancePaise ?? 0, needed: res.neededPaise ?? inrToPaise(price) });
          toast.error(hi ? "वॉलेट में बैलेंस कम है।" : "Wallet balance is too low.");
        } else {
          toast.error(errorText(res.error, lang));
        }
        return;
      }
      onBundle(res.bundle);
      announceWallet({ balancePaise: res.balancePaise });
      setOpen(true);
      toast.success(
        res.chargedPaise
          ? hi
            ? `ड्राफ्ट तैयार · ${formatInr(res.chargedPaise)} कटे`
            : `Draft ready · ${formatInr(res.chargedPaise)} charged`
          : hi
            ? "ड्राफ्ट तैयार · मुफ़्त"
            : "Draft ready · free",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : errorText("", lang));
    } finally {
      setBusy(null);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(hi ? "कॉपी हो गया" : "Copied");
    } catch {
      toast.error(hi ? "कॉपी नहीं हुआ" : "Could not copy");
    }
  }

  const rules = rtiRulesFor(record.state, record.details.authorityLevel);
  const chars = countChars(text);
  const words = countWords(text);
  const checks: Array<{ tone: "warn" | "danger"; text: string }> = [];
  if (kind === "rti_application" && mode === "central_online") {
    if (chars > 3000) checks.push({ tone: "danger", text: hi ? `${chars} अक्षर — पोर्टल ~3,000 तक लेता है। छोटा करें या PDF लगाएँ।` : `${chars} characters — the portal takes about 3,000. Shorten it or attach a PDF.` });
    else if (chars > CENTRAL_ONLINE_CHAR_BUDGET) checks.push({ tone: "warn", text: hi ? "पोर्टल सीमा के पास।" : "Close to the portal's limit." });
    const odd = nonAsciiCount(text);
    if (odd) checks.push({ tone: "warn", text: hi ? `${odd} अक्षर अंग्रेज़ी नहीं हैं; पोर्टल इन्हें अस्वीकार कर सकता है।` : `${odd} characters are not basic English; the portal may reject them.` });
  }
  if ((kind === "rti_application" || kind === "first_appeal") && mode !== "central_online" && rules.wordLimit && words > rules.wordLimit + 80) {
    checks.push({ tone: "warn", text: hi ? `${words} शब्द; ${rules.rulesHi} में ${rules.wordLimit} शब्द की सीमा (पता/हस्ताक्षर छोड़कर)।` : `${words} words; ${rules.rules} cap the body at ${rules.wordLimit} (excluding address and signature).` });
  }
  if (kind === "grievance" && chars > GRIEVANCE_CHAR_BUDGET * 1.15) checks.push({ tone: "warn", text: hi ? "शिकायत लंबी है; पोर्टल पर कट सकती है।" : "Long for a grievance box; the portal may cut it." });
  if (kind === "nch" && chars > NCH_CHAR_BUDGET * 1.2) checks.push({ tone: "warn", text: hi ? "NCH फ़ॉर्म के लिए लंबा।" : "Long for the NCH form." });

  const outcomes = OUTCOMES_BY_KIND[kind];
  const dueLabel =
    kind === "rti_application"
      ? hi ? "जवाब की अंतिम तिथि" : "Reply due by"
      : kind === "first_appeal"
        ? hi ? "निर्णय की तिथि" : "Decision due by"
        : kind === "legal_notice"
          ? hi ? "पालन की अंतिम तिथि" : "Comply by"
          : hi ? "फ़ॉलो-अप" : "Follow up on";

  const finding = kind === "status_check" && record.scheme && step?.outcome ? schemeGuide(record.scheme).findings.find((f) => f.code === step.outcome) : null;

  return (
    <li className={cn("step", current && "is-current", view.phase === "upcoming" && "is-later")}>
      <div className="step-rail" aria-hidden>
        <span className={cn("step-num", (view.phase === "resolved" || filed || (kind === "status_check" && step?.status === "done")) && "is-done")}>
          {view.phase === "resolved" || filed || (kind === "status_check" && step?.status === "done") ? <Check className="size-3.5" /> : index + 1}
        </span>
      </div>
      <div className="step-body card">
        <button type="button" className="step-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <span className="min-w-0 flex-1 text-left">
            <span className="flex flex-wrap items-center gap-2">
              <span className="section-title">{t(STEP_COPY[kind].name, lang)}</span>
              <Badge tone={PHASE_TONE[view.phase]}>{t(PHASE_COPY[view.phase], lang)}</Badge>
              {draftable && prices && !hasDoc ? <Badge>{price ? formatInr(inrToPaise(price)) : hi ? "मुफ़्त" : "Free"}</Badge> : null}
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] text-muted">
              {step?.filedOn ? (
                <span>
                  {hi ? "दाखिल" : "Filed"} {formatDay(step.filedOn, lang, today)}
                  {step.reference ? ` · ${step.reference}` : ""}
                </span>
              ) : null}
              {view.dueOn && !step?.outcome ? (
                <span className="inline-flex items-center gap-1.5">
                  {dueLabel} <DueBadge on={view.dueOn} today={today} lang={lang} />
                </span>
              ) : null}
              {view.lastDay && !filed ? (
                <span className="inline-flex items-center gap-1.5">
                  {hi ? "दाखिल करने की अंतिम तिथि" : "Last day to file"} <DueBadge on={view.lastDay} today={today} lang={lang} />
                </span>
              ) : null}
              {step?.outcome && kind !== "status_check" ? <span>{t(OUTCOME_COPY[step.outcome] ?? { en: step.outcome, hi: step.outcome }, lang)}</span> : null}
              {finding ? <span>{hi ? finding.labelHi : finding.label}</span> : null}
            </span>
          </span>
          <ChevronDown className={cn("size-4 shrink-0 text-subtle transition-transform", open && "rotate-180")} aria-hidden />
        </button>

        {open ? (
          <div className="step-content">
            <p className="text-sm text-muted">{t(STEP_COPY[kind].what, lang)}</p>
            {view.phase === "upcoming" ? (
              <p className="callout mt-3 text-[0.8125rem]">
                {hi ? "पिछला कदम अभी पूरा नहीं हुआ। ज़रूरत हो तो पहले ही शुरू कर सकते हैं।" : "The step before this is still running. You can start this one early if you need to."}
              </p>
            ) : null}

            <div className="panel mt-4">
              <StepGuide kind={kind} record={record} mode={mode} lang={lang} />
            </div>

            {kind === "status_check" ? (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field>
                  <Label htmlFor={`${kind}-finding`}>{hi ? "पोर्टल पर क्या दिखा" : "What the portal shows"}</Label>
                  <Select id={`${kind}-finding`} value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                    <option value="">{hi ? "चुनें…" : "Choose…"}</option>
                    {record.scheme
                      ? schemeGuide(record.scheme).findings.map((f) => (
                          <option key={f.code} value={f.code}>
                            {hi ? f.labelHi : f.label}
                          </option>
                        ))
                      : null}
                  </Select>
                </Field>
                <Field className="sm:col-span-2">
                  <Label htmlFor={`${kind}-notes`}>{hi ? "नोट (स्क्रीन पर लिखा संदेश, तिथि)" : "Notes (exact message on screen, dates)"}</Label>
                  <Textarea id={`${kind}-notes`} value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-20" />
                </Field>
                {(() => {
                  const f = record.scheme ? schemeGuide(record.scheme).findings.find((x) => x.code === outcome) : null;
                  return f?.fix ? (
                    <p className="callout is-warn text-[0.8125rem] sm:col-span-2">
                      <AlertTriangle className="size-4" aria-hidden />
                      <span>{hi ? f.fixHi : f.fix}</span>
                    </p>
                  ) : null;
                })()}
                <div className="flex flex-wrap gap-2 sm:col-span-2">
                  <Button
                    disabled={!outcome || busy !== null}
                    onClick={() => void patch({ status: "done", outcome, notes }, "save", hi ? "स्थिति दर्ज हुई" : "Status recorded")}
                  >
                    {busy === "save" ? (hi ? "सेव…" : "Saving…") : hi ? "स्थिति दर्ज करें" : "Record status"}
                  </Button>
                </div>
              </div>
            ) : null}

            {draftable ? (
              <>
                {kind === "rti_application" ? (
                  <Field className="mt-4 max-w-sm">
                    <Label htmlFor={`${kind}-mode`}>{hi ? "कैसे दाखिल होगा" : "Filing route"}</Label>
                    <Select id={`${kind}-mode`} value={mode} onChange={(e) => setMode(e.target.value)} disabled={filed}>
                      {record.details.authorityLevel === "central" ? <option value="central_online">{t(MODE_COPY.central_online, lang)}</option> : null}
                      {record.details.authorityLevel === "state" && rules.portal ? <option value="state_online">{t(MODE_COPY.state_online, lang)}</option> : null}
                      <option value="postal">{t(MODE_COPY.postal, lang)}</option>
                      <option value="by_hand">{t(MODE_COPY.by_hand, lang)}</option>
                    </Select>
                    <Hint>
                      {mode === "central_online"
                        ? hi
                          ? "केवल अनुरोध का अंग्रेज़ी टेक्स्ट बनेगा; नाम, पता और फ़ीस पोर्टल के अपने खानों में भरें।"
                          : "Only the English request text is drafted; name, address and fee go in the portal's own fields."
                        : hi
                          ? `${rules.rulesHi} के अनुसार पूरा आवेदन, प्रिंट के लिए।`
                          : `The full application in the format of the ${rules.rules}, ready to print.`}
                    </Hint>
                  </Field>
                ) : null}

                {paywall ? (
                  <div className="callout is-warn mt-4 text-[0.8125rem]">
                    <AlertTriangle className="size-4" aria-hidden />
                    <span>
                      {hi
                        ? `इस ड्राफ्ट के लिए ${formatInr(paywall.needed)} चाहिए; वॉलेट में ${formatInr(paywall.balance)} है। `
                        : `This draft needs ${formatInr(paywall.needed)}; the wallet has ${formatInr(paywall.balance)}. `}
                      <Link to="/wallet" className="link-accent">
                        {hi ? "टॉप-अप करें" : "Top up"}
                      </Link>
                    </span>
                  </div>
                ) : null}

                {!hasDoc ? (
                  <div className="mt-4 flex flex-col gap-3">
                    <Field>
                      <Label htmlFor={`${kind}-extra`}>{hi ? "इस ड्राफ्ट के लिए निर्देश (वैकल्पिक)" : "Instructions for this draft (optional)"}</Label>
                      <Textarea
                        id={`${kind}-extra`}
                        value={extra}
                        onChange={(e) => setExtra(e.target.value)}
                        className="min-h-16"
                        placeholder={hi ? "जैसे: 2024-25 की वेज लिस्ट भी माँगें" : "e.g. also ask for the 2024-25 wage lists"}
                      />
                    </Field>
                    <div className="flex flex-wrap items-center gap-3">
                      <Button onClick={() => void draft()} disabled={busy !== null}>
                        <Sparkles className="size-4" aria-hidden />
                        {busy === "draft"
                          ? hi ? "Grok ड्राफ्ट कर रहा है…" : "Drafting with Grok…"
                          : `${hi ? "ड्राफ्ट करें" : "Draft"} · ${nextCharge ? formatInr(inrToPaise(nextCharge)) : hi ? "मुफ़्त" : "free"}`}
                      </Button>
                      {busy === "draft" ? (
                        <span className="text-[0.8125rem] text-muted">
                          {hi ? "आमतौर पर 15–60 सेकंड। विफल होने पर पैसा वापस।" : "Usually 15–60 seconds. Refunded if it fails."}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 flex flex-col gap-3">
                    {step?.doc?.warnings.length ? (
                      <div className="callout is-warn text-[0.8125rem]">
                        <AlertTriangle className="size-4" aria-hidden />
                        <ul className="flex flex-col gap-1">
                          {step.doc.warnings.map((w) => (
                            <li key={w}>{w}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {step?.doc?.filingNotes.length ? (
                      <details className="panel text-[0.8125rem]">
                        <summary className="cursor-pointer font-medium">{hi ? "दाखिल करने की चेकलिस्ट" : "Filing checklist"}</summary>
                        <ul className="mt-2 list-disc space-y-1 pl-5">
                          {step.doc.filingNotes.map((n) => (
                            <li key={n}>{n}</li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                    <Field>
                      <Label htmlFor={`${kind}-text`}>{hi ? "ड्राफ्ट (संपादन करें)" : "Draft (edit freely)"}</Label>
                      <Textarea
                        id={`${kind}-text`}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        className="draft-text min-h-80"
                        spellCheck={false}
                      />
                      <span className="flex flex-wrap gap-x-3 text-xs text-muted tabular-nums">
                        <span>
                          {chars.toLocaleString("en-IN")} {hi ? "अक्षर" : "characters"}
                        </span>
                        <span>
                          {words.toLocaleString("en-IN")} {hi ? "शब्द" : "words"}
                        </span>
                        {step?.doc?.model ? <span>Grok · {step.doc.model}</span> : null}
                      </span>
                    </Field>
                    {checks.map((c) => (
                      <p key={c.text} className={cn("callout text-[0.8125rem]", c.tone === "danger" ? "is-danger" : "is-warn")}>
                        <AlertTriangle className="size-4" aria-hidden />
                        <span>{c.text}</span>
                      </p>
                    ))}
                    <div className="toolbar">
                      <Button size="sm" disabled={!dirty || busy !== null} onClick={() => void patch({ docText: text }, "save", hi ? "सेव हुआ" : "Saved")}>
                        {busy === "save" ? (hi ? "सेव…" : "Saving…") : hi ? "बदलाव सेव करें" : "Save edits"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void copy()}>
                        <Copy className="size-3.5" aria-hidden />
                        {hi ? "कॉपी" : "Copy"}
                      </Button>
                      <Button size="sm" variant="outline" asChild>
                        <Link to="/print/$id/$kind" params={{ id: record.id, kind }} target="_blank">
                          <Printer className="size-3.5" aria-hidden />
                          {hi ? "प्रिंट" : "Print"}
                        </Link>
                      </Button>
                      <span className="toolbar-sep" aria-hidden />
                      <Button size="sm" variant="ghost" disabled={busy !== null || filed} onClick={() => void draft()}>
                        <RefreshCw className="size-3.5" aria-hidden />
                        {busy === "draft"
                          ? hi ? "ड्राफ्ट हो रहा है…" : "Drafting…"
                          : `${hi ? "दोबारा ड्राफ्ट" : "Redraft"} · ${nextCharge ? formatInr(inrToPaise(nextCharge)) : hi ? "मुफ़्त" : "free"}`}
                      </Button>
                    </div>
                    {!filed ? (
                      <Field>
                        <Label htmlFor={`${kind}-extra2`}>{hi ? "दोबारा ड्राफ्ट के लिए निर्देश" : "Instructions for a redraft"}</Label>
                        <Input id={`${kind}-extra2`} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder={hi ? "जैसे: छोटा करें, बिंदु 3 हटाएँ" : "e.g. shorter, drop point 3"} />
                      </Field>
                    ) : null}
                  </div>
                )}

                <div className="mt-5 border-t border-border pt-4">
                  <h3 className="text-sm font-semibold">{filed ? (hi ? "दाखिल करने का रिकॉर्ड" : "Filing record") : hi ? "दाखिल करने के बाद दर्ज करें" : "Record the filing"}</h3>
                  <div className="mt-3 grid gap-4 sm:grid-cols-3">
                    <Field>
                      <Label htmlFor={`${kind}-filed`}>
                        {kind === "rti_application" || kind === "first_appeal"
                          ? hi ? "प्राप्ति / दाखिल तिथि" : "Received / filed on"
                          : kind === "legal_notice"
                            ? hi ? "भेजने की तिथि" : "Sent on"
                            : hi ? "दाखिल तिथि" : "Filed on"}
                      </Label>
                      <Input id={`${kind}-filed`} type="date" value={filedOn ?? ""} max={today} onChange={(e) => setFiledOn(e.target.value)} />
                    </Field>
                    <Field>
                      <Label htmlFor={`${kind}-ref`}>
                        {kind === "nch"
                          ? hi ? "डॉकेट नंबर" : "Docket number"
                          : kind === "legal_notice"
                            ? hi ? "स्पीड पोस्ट ट्रैकिंग" : "Speed Post tracking"
                            : kind === "consumer_complaint"
                              ? hi ? "परिवाद / ई-जागृति नंबर" : "Complaint / e-Jagriti no."
                              : hi ? "रजिस्ट्रेशन / रसीद नंबर" : "Registration / receipt no."}
                      </Label>
                      <Input id={`${kind}-ref`} value={reference} onChange={(e) => setReference(e.target.value)} />
                    </Field>
                    {kind === "legal_notice" ? (
                      <Field>
                        <Label htmlFor={`${kind}-deliv`}>{hi ? "डिलीवरी तिथि" : "Delivered on"}</Label>
                        <Input id={`${kind}-deliv`} type="date" value={deliveredOn ?? ""} max={today} onChange={(e) => setDeliveredOn(e.target.value)} />
                      </Field>
                    ) : null}
                    {kind === "rti_application" ? (
                      <label className="flex cursor-pointer items-center gap-2 text-sm sm:pt-6">
                        <input type="checkbox" checked={viaApio} onChange={(e) => setViaApio(e.target.checked)} className="size-4 accent-[var(--color-accent)]" />
                        {hi ? "सहायक PIO को दिया (+5 दिन)" : "Given to an Assistant PIO (+5 days)"}
                      </label>
                    ) : null}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={filed ? "outline" : "primary"}
                      disabled={!filedOn || busy !== null}
                      onClick={() =>
                        void patch(
                          {
                            filedOn,
                            reference,
                            mode: kind === "rti_application" ? mode : step?.mode,
                            viaApio,
                            deliveredOn: deliveredOn || null,
                            ...(dirty ? { docText: text } : {}),
                          },
                          "file",
                          hi ? "दाखिला दर्ज हुआ; टाइमर चालू" : "Filing recorded; the clock is running",
                        )
                      }
                    >
                      {busy === "file" ? (hi ? "सेव…" : "Saving…") : filed ? (hi ? "रिकॉर्ड अपडेट करें" : "Update record") : hi ? "दाखिल हुआ" : "Mark as filed"}
                    </Button>
                    {filed ? (
                      <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void patch({ filedOn: null }, "file", hi ? "दाखिला हटाया" : "Filing removed")}>
                        {hi ? "दाखिला हटाएँ" : "Undo filing"}
                      </Button>
                    ) : null}
                  </div>
                </div>

                {filed && outcomes.length ? (
                  <div className="mt-5 border-t border-border pt-4">
                    <h3 className="text-sm font-semibold">
                      {kind === "rti_application" || kind === "first_appeal" || kind === "second_appeal"
                        ? hi ? "जवाब / निर्णय" : "Reply / decision"
                        : hi ? "परिणाम" : "Outcome"}
                    </h3>
                    <div className="mt-3 grid gap-4 sm:grid-cols-2">
                      <Field>
                        <Label htmlFor={`${kind}-outcome`}>{hi ? "क्या हुआ" : "What happened"}</Label>
                        <Select id={`${kind}-outcome`} value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                          <option value="">{hi ? "अभी कुछ नहीं" : "Nothing yet"}</option>
                          {outcomes.map((o) => (
                            <option key={o} value={o}>
                              {t(OUTCOME_COPY[o], lang)}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field>
                        <Label htmlFor={`${kind}-replyon`}>{hi ? "जवाब / आदेश की तिथि" : "Reply / order dated"}</Label>
                        <Input id={`${kind}-replyon`} type="date" value={replyOn ?? ""} max={today} onChange={(e) => setReplyOn(e.target.value)} />
                      </Field>
                      {kind !== "grievance" && kind !== "nch" ? (
                        <Field className="sm:col-span-2">
                          <Label htmlFor={`${kind}-reply`}>{hi ? "जवाब का पाठ (अपील के लिए)" : "Reply text (used for the appeal)"}</Label>
                          <Textarea id={`${kind}-reply`} value={replyText} onChange={(e) => setReplyText(e.target.value)} className="min-h-24" />
                          <Hint>
                            {hi ? "बिंदुवार जवाब चिपकाएँ; अपील हर अधूरे बिंदु को पकड़ेगी।" : "Paste the reply point by point; the appeal will take up each incomplete point."}
                          </Hint>
                        </Field>
                      ) : null}
                    </div>
                    <div className="mt-3">
                      <Button
                        size="sm"
                        disabled={busy !== null}
                        onClick={() => void patch({ outcome, replyOn: replyOn || null, replyText }, "outcome", hi ? "दर्ज हुआ" : "Recorded")}
                      >
                        {busy === "outcome" ? (hi ? "सेव…" : "Saving…") : hi ? "दर्ज करें" : "Save outcome"}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}

            <AutoFilePanel record={record} kind={kind} automation={automation} lang={lang} onChanged={onAutomation} />

            {SKIPPABLE.has(kind) && !filed ? (
              <div className="mt-4 text-right">
                {step?.status === "skipped" ? (
                  <button
                    type="button"
                    className="link-quiet text-[0.8125rem]"
                    disabled={busy !== null}
                    onClick={() => void patch({ status: hasDoc ? "drafted" : "pending" }, "skip")}
                  >
                    {hi ? "यह कदम वापस लें" : "Bring this step back"}
                  </button>
                ) : (
                  <button type="button" className="link-quiet text-[0.8125rem]" disabled={busy !== null} onClick={() => void patch({ status: "skipped" }, "skip")}>
                    {hi ? "यह कदम छोड़ें" : "Skip this step"}
                  </button>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}
