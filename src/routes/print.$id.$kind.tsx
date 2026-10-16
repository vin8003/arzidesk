import { useEffect, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { STEP_COPY, t } from "@/lib/desk/copy";
import { getCase } from "@/lib/desk/store";
import { STEP_KINDS, type CaseBundle, type StepKind } from "@/lib/desk/types";
import { useDeskLang } from "@/lib/lang";

export const Route = createFileRoute("/print/$id/$kind")({ component: PrintPage });

/** A clean sheet for printing or saving as PDF: the edited draft text only, no app chrome. */
function PrintPage() {
  const { id, kind } = Route.useParams();
  const { lang } = useDeskLang();
  const { user, isPending } = useCurrentUserState();
  const [bundle, setBundle] = useState<CaseBundle | null>(null);
  const [failed, setFailed] = useState(false);
  const hi = lang === "hi";
  const stepKind = (STEP_KINDS as readonly string[]).includes(kind) ? (kind as StepKind) : null;

  useEffect(() => {
    if (!user) return;
    getCase({ data: { id } })
      .then(setBundle)
      .catch(() => setFailed(true));
  }, [user, id]);

  const step = bundle?.steps.find((s) => s.kind === stepKind);
  const docLang = step?.doc?.lang ?? bundle?.record.lang ?? "en";

  return (
    <main className="min-h-dvh bg-bg px-4 py-6 text-fg print:bg-white print:p-0">
      <div className="no-print mx-auto mb-4 flex max-w-[46rem] flex-wrap items-center justify-between gap-3">
        <Link to="/cases/$id" params={{ id }} className="back-link">
          <ArrowLeft className="size-4" aria-hidden />
          {hi ? "केस पर वापस" : "Back to the case"}
        </Link>
        <Button onClick={() => window.print()} disabled={!step?.docText}>
          <Printer className="size-4" aria-hidden />
          {hi ? "प्रिंट / PDF" : "Print / save PDF"}
        </Button>
      </div>
      {isPending || (!bundle && !failed && user) ? <div className="skeleton mx-auto h-96 max-w-[46rem]" /> : null}
      {!isPending && !user ? (
        <p className="mx-auto max-w-[46rem] text-sm text-muted">
          <a href="/login" className="link-accent">
            {hi ? "लॉगिन करें" : "Sign in"}
          </a>{" "}
          {hi ? "ताकि ड्राफ्ट दिखे।" : "to see this draft."}
        </p>
      ) : null}
      {failed || (bundle && !step?.docText) ? (
        <p className="mx-auto max-w-[46rem] text-sm text-muted">{hi ? "इस कदम का कोई ड्राफ्ट नहीं है।" : "There is no draft for this step yet."}</p>
      ) : null}
      {step?.docText ? (
        <article className="paper print-paper mx-auto max-w-[46rem]" lang={docLang}>
          <div className="doc doc-sheet print-sheet">
            <p className="doc-head no-print">
              {stepKind ? t(STEP_COPY[stepKind].name, lang) : ""} · {bundle?.record.title}
            </p>
            <div className="print-text">{step.docText}</div>
          </div>
        </article>
      ) : null}
    </main>
  );
}
