import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Copy, MonitorSmartphone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { GuestPanel } from "@/components/guest-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { createPairingCode, listMyDevices, revokeMyDevice } from "@/lib/automation/store";
import type { DeviceView } from "@/lib/automation/types";
import { useDeskLang } from "@/lib/lang";

export const Route = createFileRoute("/companion")({ component: CompanionPage });

function since(iso: string | null, hi: boolean): string {
  if (!iso) return hi ? "कभी नहीं" : "never";
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 90) return hi ? "अभी" : "just now";
  const m = Math.round(s / 60);
  if (m < 90) return hi ? `${m} मिनट पहले` : `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 36) return hi ? `${h} घंटे पहले` : `${h} h ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function CompanionPage() {
  const { lang, onLang } = useDeskLang();
  const { user, isPending } = useCurrentUserState();
  const hi = lang === "hi";
  const [devices, setDevices] = useState<DeviceView[] | null>(null);
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<DeviceView | null>(null);
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  useEffect(() => {
    if (!user) return;
    const load = () => listMyDevices().then(setDevices).catch(() => setDevices([]));
    void load();
    const timer = setInterval(load, code ? 3_000 : 30_000);
    return () => clearInterval(timer);
  }, [user, code]);

  async function makeCode() {
    setBusy(true);
    try {
      setCode(await createPairingCode());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : hi ? "कोड नहीं बना" : "Could not make a code");
    } finally {
      setBusy(false);
    }
  }

  async function remove(d: DeviceView) {
    try {
      setDevices(await revokeMyDevice({ data: { id: d.id } }));
      toast.success(hi ? "पीसी हटाया गया" : "PC removed");
    } catch {
      toast.error(hi ? "हटाया नहीं जा सका" : "Could not remove");
    }
  }

  const pairCmd = code ? `npm run companion -- pair ${code.code} --server ${origin}` : "";

  return (
    <AppShell lang={lang} onLang={onLang} active="companion">
      {isPending ? <div className="skeleton h-40" /> : null}
      {!isPending && !user ? <GuestPanel lang={lang} /> : null}
      {user ? (
        <div className="max-w-3xl">
          <header className="page-head">
            <div className="page-head-text">
              <p className="eyebrow">{hi ? "पोर्टल पर अपने आप दाखिल" : "Filing on the portals"}</p>
              <h1 className="page-title">{hi ? "कम्पैनियन" : "Companion"}</h1>
              <p className="mt-2 max-w-2xl text-sm text-muted">
                {hi
                  ? "कम्पैनियन आपके कियोस्क पीसी पर Chrome चलाकर RTI ऑनलाइन, पीएम-किसान जैसे पोर्टल पर फ़ॉर्म भरता है। लॉग-इन, सुरक्षा कोड, OTP और भुगतान आप करते हैं; पासवर्ड और भुगतान का विवरण ArziDesk तक नहीं आता।"
                  : "The companion runs Chrome on your kiosk PC and fills RTI Online, PM-Kisan and other portals for you. You do the sign-ins, security codes, OTPs and payments; passwords and payment details never reach ArziDesk."}
              </p>
            </div>
          </header>

          <section className="card card-pad stack-tight">
            <h2 className="section-title">{hi ? "कियोस्क पीसी जोड़ें" : "Connect a kiosk PC"}</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
              <li>
                {hi ? "उस पीसी पर Node.js 24+ और Google Chrome हों, और ArziDesk का कोड हो:" : "On that PC, have Node.js 24+, Google Chrome and the ArziDesk code:"}
                <pre className="mono mt-1 overflow-x-auto rounded-md bg-elevated px-3 py-2 text-[0.8125rem]">git clone https://github.com/vin8003/arzidesk.git && cd arzidesk && npm install</pre>
              </li>
              <li>
                {hi ? "पेयरिंग कोड बनाएँ (10 मिनट चलता है) और दिखाया गया आदेश उस पीसी पर चलाएँ।" : "Make a pairing code (valid 10 minutes) and run the command shown on that PC."}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button size="sm" onClick={() => void makeCode()} disabled={busy}>
                    {code ? (hi ? "नया कोड" : "New code") : hi ? "पेयरिंग कोड बनाएँ" : "Make a pairing code"}
                  </Button>
                  {code ? <span className="mono text-lg font-semibold tracking-wider">{code.code}</span> : null}
                </div>
                {code ? (
                  <div className="mt-2 flex items-start gap-2">
                    <pre className="mono flex-1 overflow-x-auto rounded-md bg-elevated px-3 py-2 text-[0.8125rem]">{pairCmd}</pre>
                    <Button
                      size="icon"
                      variant="outline"
                      aria-label={hi ? "कॉपी" : "Copy"}
                      onClick={() => void navigator.clipboard.writeText(pairCmd).then(() => toast.success(hi ? "कॉपी हो गया" : "Copied"))}
                    >
                      <Copy className="size-4" aria-hidden />
                    </Button>
                  </div>
                ) : null}
              </li>
              <li>
                {hi ? "फिर उसे चालू छोड़ दें:" : "Then leave it running:"}
                <pre className="mono mt-1 overflow-x-auto rounded-md bg-elevated px-3 py-2 text-[0.8125rem]">npm run companion -- run</pre>
              </li>
            </ol>
          </section>

          <section className="stack">
            <h2 className="section-title">{hi ? "जुड़े हुए पीसी" : "Connected PCs"}</h2>
            {devices === null ? <div className="skeleton mt-3 h-16" /> : null}
            {devices && !devices.length ? (
              <p className="mt-3 text-sm text-muted">{hi ? "अभी कोई नहीं।" : "None yet."}</p>
            ) : null}
            <ul className="mt-3 flex flex-col gap-2">
              {devices?.map((d) => (
                <li key={d.id} className="card card-pad flex flex-wrap items-center gap-3">
                  <MonitorSmartphone className="size-5 text-muted" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{d.name}</span>
                    <span className="text-[0.8125rem] text-muted">
                      {hi ? "आख़िरी बार" : "Last seen"} {since(d.lastSeenAt, hi)}
                      {d.companionVersion ? ` · v${d.companionVersion}` : ""}
                    </span>
                  </span>
                  <Badge tone={d.online ? "ok" : "muted"} dot>
                    {d.online ? (hi ? "चालू" : "Online") : hi ? "बंद" : "Offline"}
                  </Badge>
                  <Button size="icon" variant="ghost" aria-label={hi ? "हटाएँ" : "Remove"} onClick={() => setRemoving(d)}>
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          </section>

          <ConfirmDialog
            open={Boolean(removing)}
            onOpenChange={(open) => !open && setRemoving(null)}
            title={hi ? "यह पीसी हटाएँ?" : "Remove this PC?"}
            text={hi ? "इसका टोकन तुरंत बंद हो जाएगा। दोबारा जोड़ने के लिए नया कोड चाहिए।" : "Its token stops working at once. Connecting it again needs a new code."}
            confirmLabel={hi ? "हटाएँ" : "Remove"}
            cancelLabel={hi ? "रहने दें" : "Keep"}
            danger
            onConfirm={() => {
              if (removing) void remove(removing);
              setRemoving(null);
            }}
          />
        </div>
      ) : null}
    </AppShell>
  );
}
