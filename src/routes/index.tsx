import { useEffect, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Coins, FileSearch, IndianRupee, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { CaseRow } from "@/components/case-row";
import { GuestPanel } from "@/components/guest-panel";
import { Button } from "@/components/ui/button";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { formatLongDay, hourInIndia } from "@/lib/dates";
import { runAutomations } from "@/lib/desk/automation";
import { FLOW_COPY, t } from "@/lib/desk/copy";
import { getDashboard, type Dashboard } from "@/lib/desk/store";
import type { Flow } from "@/lib/desk/types";
import { useDeskLang, type OutputLang } from "@/lib/lang";
import { formatInr } from "@/lib/wallet/pricing";
import { announceWallet, useWallet } from "@/lib/wallet/use-wallet";

export const Route = createFileRoute("/")({ component: Today });

const AUTO_KEY = "arzidesk.auto-run";
const AUTO_EVERY_MS = 30 * 60_000;

const FLOW_ICON: Record<Flow, typeof Coins> = { money: IndianRupee, rti: FileSearch, consumer: ShoppingBag };

function greeting(lang: OutputLang): string {
  const h = hourInIndia();
  if (lang === "hi") return h < 12 ? "सुप्रभात" : h < 17 ? "नमस्कार" : "शुभ संध्या";
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function shouldAutoRun(): boolean {
  try {
    const last = Number(sessionStorage.getItem(AUTO_KEY) ?? 0);
    if (Date.now() - last < AUTO_EVERY_MS) return false;
    sessionStorage.setItem(AUTO_KEY, String(Date.now()));
    return true;
  } catch {
    return true;
  }
}

function Today() {
  const { lang, onLang } = useDeskLang();
  const { user, isPending } = useCurrentUserState();
  const [board, setBoard] = useState<Dashboard | null>(null);
  const [error, setError] = useState(false);
  const { wallet } = useWallet();
  const hi = lang === "hi";

  useEffect(() => {
    if (!user) return;
    let live = true;
    const load = () =>
      getDashboard()
        .then((next) => {
          if (live) setBoard(next);
        })
        .catch(() => {
          if (live) setError(true);
        });
    void load();
    // Automatic first appeals: drafted in the background once the reply deadline lapses.
    if (shouldAutoRun()) {
      runAutomations()
        .then((res) => {
          if (res.drafted.length) {
            toast.success(
              hi
                ? `${res.drafted.length} प्रथम अपील अपने आप ड्राफ्ट हुई। दाखिल करने से पहले जाँचें।`
                : `${res.drafted.length} first appeal${res.drafted.length > 1 ? "s" : ""} drafted automatically. Check before filing.`,
            );
            announceWallet();
            void load();
          }
          if (res.blockedByWallet.length) {
            toast.warning(
              hi
                ? `${res.blockedByWallet.length} अपील बकाया है पर वॉलेट में बैलेंस कम है।`
                : `${res.blockedByWallet.length} appeal${res.blockedByWallet.length > 1 ? "s are" : " is"} due but the wallet is short. Top up to draft.`,
            );
          }
        })
        .catch(() => undefined);
    }
    return () => {
      live = false;
    };
  }, [user, hi]);

  if (isPending) {
    return (
      <AppShell lang={lang} onLang={onLang} active="today">
        <div className="skeleton h-40" />
      </AppShell>
    );
  }

  if (!user) {
    return (
      <AppShell lang={lang} onLang={onLang} active="today">
        <GuestPanel lang={lang} onLang={onLang} variant="landing" />
      </AppShell>
    );
  }

  const name = user.displayName?.split(" ")[0] || "";

  return (
    <AppShell lang={lang} onLang={onLang} active="today">
      <header className="page-head">
        <div className="page-head-text">
          <p className="eyebrow">{board ? formatLongDay(board.today, lang) : " "}</p>
          <h1 className="page-title">
            {greeting(lang)}
            {name && !name.includes("@") ? `, ${name}` : ""}
          </h1>
          {board ? (
            <p className="stat-row mt-2">
              <span>
                <strong>{board.counts.open}</strong> {hi ? "खुले केस" : "open"}
              </span>
              <span className={board.counts.overdue ? "text-danger" : ""}>
                <strong className={board.counts.overdue ? "!text-danger" : ""}>{board.counts.overdue}</strong> {hi ? "देर से" : "overdue"}
              </span>
              <span>
                <strong>{board.counts.dueSoon}</strong> {hi ? "7 दिन में" : "due in 7 days"}
              </span>
              <span>
                <strong>{board.counts.waiting}</strong> {hi ? "जवाब की प्रतीक्षा" : "waiting on government"}
              </span>
              {wallet ? (
                <span>
                  {hi ? "वॉलेट" : "Wallet"} <strong>{formatInr(wallet.balancePaise)}</strong>
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
      </header>

      <section className="stack-tight" aria-label={hi ? "नई फ़ाइलिंग" : "Start a filing"}>
        <div className="grid gap-3 md:grid-cols-3">
          {(["money", "rti", "consumer"] as const).map((flow) => {
            const Icon = FLOW_ICON[flow];
            return (
              <Link key={flow} to="/cases/new" search={{ flow }} className="path transition-colors hover:bg-elevated">
                <span className="path-icon">
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="path-title">{t(FLOW_COPY[flow].name, lang)}</span>
                <span className="path-text">{t(FLOW_COPY[flow].steps, lang)}</span>
              </Link>
            );
          })}
        </div>
      </section>

      {error ? (
        <p className="callout is-danger stack" role="alert">
          {hi ? "केस लोड नहीं हुए। पेज रिफ्रेश करें।" : "Could not load your cases. Refresh the page."}
        </p>
      ) : null}

      {!board && !error ? <div className="skeleton stack h-48" /> : null}

      {board ? (
        <>
          <section className="stack">
            <div className="section-head">
              <h2 className="section-title">{hi ? "अभी करना है" : "Needs action"}</h2>
              <span className="count">{board.act.length}</span>
            </div>
            {board.act.length ? (
              <ul className="list mt-3">
                {board.act.map((item) => (
                  <li key={item.id}>
                    <CaseRow item={item} lang={lang} today={board.today} />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="empty mt-3">
                <p className="empty-title">{hi ? "अभी कुछ बकाया नहीं" : "Nothing needs you right now"}</p>
                <p className="empty-text">
                  {hi
                    ? "नई फ़ाइलिंग शुरू करें। जवाब की समय-सीमा बीतने पर केस यहाँ अपने आप आ जाते हैं।"
                    : "Start a filing above. Cases come back here on their own when a reply deadline passes."}
                </p>
                <div className="empty-actions">
                  <Button asChild>
                    <Link to="/cases/new">{hi ? "नई फ़ाइलिंग" : "New filing"}</Link>
                  </Button>
                </div>
              </div>
            )}
          </section>

          {board.waiting.length ? (
            <section className="stack">
              <div className="section-head">
                <h2 className="section-title">{hi ? "सरकार के जवाब की प्रतीक्षा" : "Waiting on government"}</h2>
                <span className="count">{board.waiting.length}</span>
              </div>
              <ul className="list mt-3">
                {board.waiting.map((item) => (
                  <li key={item.id}>
                    <CaseRow item={item} lang={lang} today={board.today} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}

      <p className="fineprint stack">
        {hi
          ? "ArziDesk ड्राफ्टिंग सहायता है, कानूनी सलाह नहीं। दाखिल करने से पहले हर तथ्य, फ़ीस और पता जाँचें। सरकारी फ़ीस अलग से वास्तविक दर पर दिखाएँ।"
          : "ArziDesk is drafting assistance, not legal advice. Check every fact, fee and address before filing. Show government fees to the citizen separately, at cost."}
      </p>
    </AppShell>
  );
}
