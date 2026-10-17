import { useState, type ChangeEvent } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Bot, CheckCircle2, FileCheck2, Loader2, MonitorSmartphone, Square } from "lucide-react";
import { toast } from "sonner";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Field, Hint, Input, Label } from "@/components/ui/field";
import { GATE_COPY, STATUS_COPY, isActive } from "@/lib/automation/jobs";
import type { Problem } from "@/lib/automation/payload";
import { cancelFilingJob, reconcileByHand, startJob, type AutomationView, type JobOptions, type RecipeOffer } from "@/lib/automation/store";
import type { JobStatus, JobView } from "@/lib/automation/types";
import { t } from "@/lib/desk/copy";
import type { CaseRecord, StepKind } from "@/lib/desk/types";
import type { OutputLang } from "@/lib/lang";
import { cn } from "@/lib/utils";

const TONE: Record<JobStatus, BadgeTone> = {
  queued: "muted",
  running: "accent",
  waiting_human: "warn",
  submitting: "accent",
  succeeded: "ok",
  failed: "danger",
  needs_reconcile: "danger",
  cancelled: "muted",
};

function ProblemList({ items, lang, tone }: { items: Problem[]; lang: OutputLang; tone: "warn" | "danger" }) {
  if (!items.length) return null;
  return (
    <div className={cn("callout text-[0.8125rem]", tone === "danger" ? "is-danger" : "is-warn")}>
      <AlertTriangle className="size-4" aria-hidden />
      <ul className="flex flex-col gap-1">
        {items.map((p) => (
          <li key={`${p.field}-${p.en}`}>{lang === "hi" ? p.hi : p.en}</li>
        ))}
      </ul>
    </div>
  );
}

function JobCard({ job, lang, onChanged }: { job: JobView; lang: OutputLang; onChanged: () => void }) {
  const hi = lang === "hi";
  const [busy, setBusy] = useState(false);
  const active = isActive(job.status);
  const receipt = job.artifacts.find((a) => a.kind === "receipt") ?? job.artifacts.filter((a) => a.kind === "screenshot").at(-1);

  async function cancel() {
    setBusy(true);
    try {
      await cancelFilingJob({ data: { jobId: job.id } });
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : hi ? "रद्द नहीं हुआ" : "Could not cancel");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {active ? <Loader2 className="size-4 animate-spin text-accent" aria-hidden /> : job.status === "succeeded" ? <CheckCircle2 className="size-4 text-ok" aria-hidden /> : <Bot className="size-4 text-muted" aria-hidden />}
        <Badge tone={TONE[job.status]}>{t(STATUS_COPY[job.status], lang)}</Badge>
        {job.deviceName ? (
          <span className="text-[0.8125rem] text-muted">
            {hi ? "पीसी" : "PC"}: {job.deviceName}
          </span>
        ) : null}
        {active && job.status !== "submitting" ? (
          <button type="button" className="link-quiet ml-auto inline-flex items-center gap-1 text-[0.8125rem]" disabled={busy} onClick={() => void cancel()}>
            <Square className="size-3" aria-hidden />
            {hi ? "रोकें" : "Stop"}
          </button>
        ) : null}
      </div>

      {job.status === "waiting_human" && job.gate ? (
        <div className="callout is-warn text-sm" role="status">
          <AlertTriangle className="size-4" aria-hidden />
          <span>
            <span className="font-semibold">{t(GATE_COPY[job.gate.kind], lang)}.</span> {job.gate.message}{" "}
            <span className="text-muted">{hi ? "कम्पैनियन की Chrome विंडो में।" : "In the companion's Chrome window."}</span>
          </span>
        </div>
      ) : null}
      {job.status === "queued" ? (
        <p className="text-[0.8125rem] text-muted">
          {hi ? "कियोस्क पीसी पर कम्पैनियन चालू हो तो कुछ सेकंड में शुरू होगा।" : "Starts within seconds once the companion is running on the kiosk PC."}
        </p>
      ) : null}
      {job.status === "submitting" ? (
        <p className="text-[0.8125rem] font-medium">{hi ? "पोर्टल पर जमा हो रहा है। विंडो बंद न करें।" : "Submitting on the portal. Do not close the window."}</p>
      ) : null}
      {job.status === "succeeded" && job.result ? (
        <p className="text-sm">
          {job.result.summary}
          {job.result.reference ? (
            <>
              {" · "}
              <span className="mono font-medium">{job.result.reference}</span>
            </>
          ) : null}
        </p>
      ) : null}
      {(job.status === "failed" || job.status === "cancelled") && job.error ? <p className="text-[0.8125rem] text-danger">{job.error}</p> : null}

      {receipt ? (
        <a className="link-accent inline-flex items-center gap-1.5 text-[0.8125rem]" href={`/api/automation/artifact/${receipt.id}`} target="_blank" rel="noreferrer">
          <FileCheck2 className="size-3.5" aria-hidden />
          {receipt.kind === "receipt" ? (hi ? "रसीद देखें" : "View receipt") : hi ? "आख़िरी स्क्रीन देखें" : "View last screen"}
        </a>
      ) : null}

      {job.events.length ? (
        <details className="text-[0.8125rem]" open={active}>
          <summary className="cursor-pointer text-muted">{hi ? "क्या-क्या हुआ" : "What happened"}</summary>
          <ol className="mt-2 flex flex-col gap-1">
            {job.events.slice(-8).map((e) => (
              <li key={e.id} className={cn(e.kind === "error" ? "text-danger" : e.kind === "warning" ? "text-warn" : "text-muted")}>
                <time className="mono mr-2 text-subtle">{new Date(e.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>
                {e.text}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </div>
  );
}

function Reconcile({ job, offer, lang, onStart, onChanged }: { job: JobView; offer: RecipeOffer | undefined; lang: OutputLang; onStart: (o: RecipeOffer) => void; onChanged: () => void }) {
  const hi = lang === "hi";
  const [reference, setReference] = useState("");
  const [confirmNot, setConfirmNot] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save(p: { reference?: string; notFiled?: boolean }) {
    setBusy(true);
    try {
      await reconcileByHand({ data: { jobId: job.id, ...p } });
      toast.success(p.reference ? (hi ? "दाखिला दर्ज हुआ; टाइमर चालू" : "Filing recorded; the clock is running") : hi ? "दर्ज हुआ" : "Recorded");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : hi ? "सेव नहीं हुआ" : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="callout is-danger flex-col items-stretch gap-3 text-[0.8125rem]">
      <span className="flex items-start gap-2">
        <AlertTriangle className="size-4 shrink-0" aria-hidden />
        <span>
          {hi
            ? "जमा करने के बाद नतीजा नहीं दिखा। पोर्टल ने आवेदन ले लिया हो सकता है। दोबारा भुगतान या दाखिल न करें; पहले मिलान करें।"
            : "The result after submitting was not seen. The portal may have taken it. Do not pay or file again; reconcile first."}
        </span>
      </span>
      <div className="flex flex-wrap gap-2">
        {offer ? (
          <Button size="sm" variant="outline" disabled={!offer.ready || busy} onClick={() => onStart(offer)}>
            {t(offer.title, lang)}
          </Button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Field className="min-w-56 flex-1">
          <Label htmlFor={`rec-${job.id}`}>{hi ? "रजिस्ट्रेशन नंबर मिला?" : "Got the registration number?"}</Label>
          <Input id={`rec-${job.id}`} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="DOPAT/R/E/26/00123" />
        </Field>
        <Button size="sm" disabled={!reference.trim() || busy} onClick={() => void save({ reference })}>
          {hi ? "दर्ज करें" : "Record"}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmNot(true)}>
          {hi ? "दाखिल नहीं हुआ" : "It was not filed"}
        </Button>
      </div>
      <ConfirmDialog
        open={confirmNot}
        onOpenChange={setConfirmNot}
        title={hi ? "पक्का दाखिल नहीं हुआ?" : "Sure it was not filed?"}
        text={
          hi
            ? "भुगतान मिलान में कोई रजिस्ट्रेशन नहीं दिखा और पैसा नहीं कटा, तभी चुनें। इसके बाद नया प्रयास हो सकेगा।"
            : "Only if payment reconciliation shows no registration and no money was deducted. A new attempt is then allowed."
        }
        confirmLabel={hi ? "हाँ, दाखिल नहीं हुआ" : "Yes, not filed"}
        cancelLabel={hi ? "रहने दें" : "Keep"}
        danger
        onConfirm={() => void save({ notFiled: true })}
      />
    </div>
  );
}

function StartForm({ offer, record, lang, onCancel, onStarted }: { offer: RecipeOffer; record: CaseRecord; lang: OutputLang; onCancel: () => void; onStarted: () => void }) {
  const hi = lang === "hi";
  const [opts, setOpts] = useState<JobOptions>({ ...offer.defaults });
  const [problems, setProblems] = useState<Problem[]>(offer.problems);
  const [busy, setBusy] = useState(false);
  const fields = new Set(problems.map((p) => p.field));
  const set = (k: keyof JobOptions) => (e: ChangeEvent<HTMLInputElement>) => {
    setOpts((o) => ({ ...o, [k]: e.target.value }));
    // A warning about a field goes once the operator edits that field; the server checks again on send.
    setProblems((list) => list.filter((p) => p.field !== k));
  };

  async function go() {
    setBusy(true);
    try {
      const res = await startJob({ data: { caseId: record.id, stepKind: offer.stepKind, recipeId: offer.recipeId, options: opts } });
      if (!res.ok) {
        setProblems(res.problems);
        return;
      }
      toast.success(hi ? "कम्पैनियन को भेजा गया" : "Sent to the companion");
      onStarted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : hi ? "शुरू नहीं हुआ" : "Could not start");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field className="sm:col-span-2">
          <Label htmlFor="af-min">{hi ? "मंत्रालय / विभाग (पोर्टल की सूची से मिलाया जाएगा)" : "Ministry / Department (matched to the portal's list)"}</Label>
          <Input id="af-min" value={opts.ministry ?? ""} onChange={set("ministry")} />
        </Field>
        <Field className="sm:col-span-2">
          <Label htmlFor="af-pa">{hi ? "लोक प्राधिकरण (वैकल्पिक)" : "Public authority (optional)"}</Label>
          <Input id="af-pa" value={opts.publicAuthority ?? ""} onChange={set("publicAuthority")} />
          <Hint>{hi ? "खाली हो तो मंत्रालय का नाम ही चुना जाएगा।" : "Left empty, the ministry's own entry is picked."}</Hint>
        </Field>
        <Field>
          <Label htmlFor="af-email">{hi ? "ईमेल (OTP और जवाब यहाँ आएँगे)" : "Email (the OTP and the reply go here)"}</Label>
          <Input id="af-email" type="email" value={opts.email ?? ""} onChange={set("email")} />
        </Field>
        {fields.has("name") || opts.name !== undefined ? (
          <Field>
            <Label htmlFor="af-name">{hi ? "नाम अंग्रेज़ी अक्षरों में" : "Name in English letters"}</Label>
            <Input id="af-name" value={opts.name ?? ""} onChange={set("name")} placeholder="Ramesh Kumar" />
          </Field>
        ) : null}
        {fields.has("address") || opts.address !== undefined ? (
          <Field className="sm:col-span-2">
            <Label htmlFor="af-addr">{hi ? "पता अंग्रेज़ी अक्षरों में" : "Address in English letters"}</Label>
            <Input id="af-addr" value={opts.address ?? ""} onChange={set("address")} />
          </Field>
        ) : null}
        {record.applicant.bpl ? (
          <>
            <Field>
              <Label htmlFor="af-bply">{hi ? "BPL कार्ड जारी होने का वर्ष" : "BPL card year of issue"}</Label>
              <Input id="af-bply" inputMode="numeric" maxLength={4} value={opts.bplYear ?? ""} onChange={set("bplYear")} />
            </Field>
            <Field>
              <Label htmlFor="af-bpla">{hi ? "जारी करने वाला अधिकारी" : "Issuing authority"}</Label>
              <Input id="af-bpla" value={opts.bplAuthority ?? ""} onChange={set("bplAuthority")} />
            </Field>
          </>
        ) : null}
      </div>
      <ProblemList items={problems.filter((p) => p.severity === "block")} lang={lang} tone="danger" />
      <ProblemList items={[...offer.warnings, ...problems.filter((p) => p.severity === "warn")]} lang={lang} tone="warn" />
      <p className="text-[0.8125rem] text-muted">
        {record.applicant.bpl
          ? hi
            ? "कम्पैनियन पोर्टल पर सब भर देगा और पढ़कर जाँचेगा। आप केवल दिशानिर्देश पर टिक, सुरक्षा कोड, OTP और BPL कार्ड की PDF लगाएँगे। BPL पर फ़ीस नहीं।"
            : "The companion fills everything on the portal and reads it back. You only tick the guidelines, type the security codes and OTP, and attach the BPL card PDF. No fee for BPL."
          : hi
            ? "कम्पैनियन पोर्टल पर सब भर देगा और पढ़कर जाँचेगा। आप केवल दिशानिर्देश पर टिक, सुरक्षा कोड, OTP और ₹10 भुगतान करेंगे।"
            : "The companion fills everything on the portal and reads it back. You only tick the guidelines, type the security codes and OTP, and pay the ₹10 fee."}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void go()} disabled={busy}>
          <Bot className="size-4" aria-hidden />
          {busy ? (hi ? "भेज रहे हैं…" : "Sending…") : hi ? "कम्पैनियन को भेजें" : "Send to the companion"}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          {hi ? "रद्द" : "Cancel"}
        </Button>
      </div>
    </div>
  );
}

export function AutoFilePanel({
  record,
  kind,
  automation,
  lang,
  onChanged,
}: {
  record: CaseRecord;
  kind: StepKind;
  automation: AutomationView | null;
  lang: OutputLang;
  onChanged: () => void;
}) {
  const hi = lang === "hi";
  const [form, setForm] = useState<RecipeOffer | null>(null);
  const [busy, setBusy] = useState(false);
  if (!automation) return null;
  const offers = automation.offers.filter((o) => o.stepKind === kind);
  const jobs = automation.jobs.filter((j) => j.stepKind === kind);
  if (!offers.length && !jobs.length) return null;

  const latest = jobs[0] ?? null;
  const live = jobs.find((j) => isActive(j.status)) ?? null;
  const stuck = jobs.find((j) => j.status === "needs_reconcile") ?? null;
  const online = automation.devices.some((d) => d.online);
  const paired = automation.devices.length > 0;
  const reconcileOffer = offers.find((o) => o.purpose === "reconcile");
  const mainOffers = offers.filter((o) => o.purpose !== "reconcile");

  async function quickStart(o: RecipeOffer) {
    if (o.recipeId === "rtionline.file_rti") {
      setForm(o);
      return;
    }
    setBusy(true);
    try {
      const res = await startJob({ data: { caseId: record.id, stepKind: o.stepKind, recipeId: o.recipeId } });
      if (!res.ok) toast.error(hi ? res.problems[0]?.hi : res.problems[0]?.en);
      else toast.success(hi ? "कम्पैनियन को भेजा गया" : "Sent to the companion");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : hi ? "शुरू नहीं हुआ" : "Could not start");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5 flex flex-col gap-3 border-t border-border pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">{hi ? "पोर्टल पर अपने आप" : "On the portal, automatically"}</h3>
        <span className={cn("inline-flex items-center gap-1 text-xs", online ? "text-ok" : "text-muted")}>
          <MonitorSmartphone className="size-3.5" aria-hidden />
          {online ? (hi ? "कम्पैनियन चालू" : "Companion online") : paired ? (hi ? "कम्पैनियन बंद" : "Companion offline") : hi ? "कम्पैनियन जुड़ा नहीं" : "No companion yet"}
        </span>
        {!paired ? (
          <Link to="/companion" className="link-accent text-xs">
            {hi ? "जोड़ें" : "Connect one"}
          </Link>
        ) : null}
      </div>

      {stuck ? <Reconcile job={stuck} offer={reconcileOffer} lang={lang} onStart={(o) => void quickStart(o)} onChanged={onChanged} /> : null}
      {latest && (live === latest || latest.status !== "needs_reconcile") ? <JobCard job={live ?? latest} lang={lang} onChanged={onChanged} /> : null}

      {!live && !form
        ? mainOffers.map((o) => (
            <div key={o.recipeId} className="flex flex-col gap-2">
              {o.problems.length ? <ProblemList items={o.problems} lang={lang} tone="warn" /> : null}
              <div className="flex flex-wrap items-center gap-3">
                <Button size="sm" variant={o.kind === "submit" ? "primary" : "outline"} disabled={busy || (o.recipeId !== "rtionline.file_rti" && !o.ready) || Boolean(stuck && o.kind === "submit")} onClick={() => void quickStart(o)}>
                  <Bot className="size-3.5" aria-hidden />
                  {t(o.title, lang)}
                </Button>
                <span className="text-xs text-muted">{o.portal}</span>
              </div>
            </div>
          ))
        : null}

      {form ? (
        <StartForm
          offer={form}
          record={record}
          lang={lang}
          onCancel={() => setForm(null)}
          onStarted={() => {
            setForm(null);
            onChanged();
          }}
        />
      ) : null}
    </div>
  );
}
