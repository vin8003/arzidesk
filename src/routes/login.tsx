import { useState, type FormEvent } from "react";
import { Eye, EyeOff, FileSearch, IndianRupee, ShoppingBag } from "lucide-react";
import { Link, createFileRoute, Navigate } from "@tanstack/react-router";
import { GROK_PROVIDERS, authClient, authEnabled, signIn } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { chambersAuth } from "@/lib/seed-user";
import { BrandMark } from "@/components/brand-mark";
import { LangToggle } from "@/components/lang-toggle";
import { Button } from "@/components/ui/button";
import { Field, Hint, Input, Label } from "@/components/ui/field";

type LoginSearch = { mode?: "register" };

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    mode: search.mode === "register" ? "register" : undefined,
  }),
  component: Login,
});

function stashToken(token: string | null | undefined) {
  if (!token || typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem("grok-auth.bearer-token", token);
  } catch {
    /* ignore */
  }
}

function friendlyError(message: string, hi: boolean) {
  const m = message.toLowerCase();
  if (m.includes("invalid email") || m.includes("invalid password") || m.includes("user not found")) {
    return hi
      ? "यूज़रनेम या पासवर्ड गलत है। नया अकाउंट है तो एक बार रजिस्टर करें।"
      : "Username or password is wrong. New here? Register once.";
  }
  if (m.includes("already exists") || m.includes("already registered")) {
    return hi ? "यह अकाउंट पहले से है। लॉगिन करें।" : "That account already exists. Sign in instead.";
  }
  if (m.includes("invalid origin")) {
    return hi
      ? "लॉगिन इस पेज से नहीं खुल पाया। पेज रिफ्रेश करके फिर कोशिश करें।"
      : "Sign-in was blocked for this page. Refresh and try again.";
  }
  return message;
}

function Login() {
  const { mode: startMode } = Route.useSearch();
  const { user, isPending } = useCurrentUserState();
  const [mode, setMode] = useState<"in" | "up">(startMode === "register" ? "up" : "in");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [lang, setLang] = useState<"hi" | "en">("en");

  const hi = lang === "hi";

  if (isPending) {
    return (
      <main className="grid min-h-dvh place-items-center bg-bg text-fg">
        <div className="h-10 w-48 skeleton" />
      </main>
    );
  }
  if (user) return <Navigate to="/" />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!username.trim() || password.length < 8) {
      setError(
        hi
          ? "यूज़रनेम और कम से कम 8 अक्षर का पासवर्ड चाहिए।"
          : "Username and a password of at least 8 characters are required.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await chambersAuth({
        data: { username, password, mode },
      });
      if (!result.ok) throw new Error(result.error || "Sign in failed");
      if (!result.token) throw new Error("Sign in failed");
      stashToken(result.token);
      try {
        await authClient.getSession();
      } catch {
        /* bearer is in sessionStorage — a full load will pick it up */
      }
      window.location.assign("/");
      return;
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Failed";
      setError(friendlyError(raw, hi));
    } finally {
      setBusy(false);
    }
  }

  const points = [
    {
      icon: IndianRupee,
      title: hi ? "अटका सरकारी पैसा" : "Stuck government money",
      body: hi ? "पीएम-किसान, मनरेगा, पेंशन: स्थिति जाँच, शिकायत, 30 दिन बाद RTI, अपने आप अपील।" : "PM-Kisan, MGNREGA, pension: status check, grievance, RTI after 30 days, automatic appeal.",
    },
    {
      icon: FileSearch,
      title: hi ? "सही प्रारूप में RTI" : "RTI in the right format",
      body: hi ? "केंद्रीय ऑनलाइन या UP, राजस्थान, MP, दिल्ली का डाक प्रारूप; हर समय-सीमा टाइमर पर।" : "Central online, or the postal format for UP, Rajasthan, MP and Delhi; every deadline on a timer.",
    },
    {
      icon: ShoppingBag,
      title: hi ? "उपभोक्ता शिकायत" : "Consumer complaints",
      body: hi ? "NCH डॉकेट, कानूनी नोटिस, और स्वयं दाखिल करने के लिए आयोग परिवाद फ़ाइल।" : "NCH docket, legal notice, and a commission complaint file for self-filing.",
    },
  ];


  return (
    <main className="auth-page">
      <aside className="auth-aside">
        <Link to="/" className="brand">
          <BrandMark className="size-9" />
          <span className="brand-word">ArziDesk</span>
        </Link>
        <div>
          <h2 className="auth-aside-title">
            {hi ? "हर अर्ज़ी, सही दफ़्तर, सही समय पर।" : "Every filing, to the right office, on time."}
          </h2>
          <ul className="auth-points">
            {points.map((pt) => (
              <li key={pt.title}>
                <span className="auth-point-icon" aria-hidden>
                  <pt.icon className="size-[1.1rem]" />
                </span>
                <span>
                  <strong>{pt.title}</strong>
                  <span>{pt.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="max-w-sm text-xs leading-relaxed text-subtle">
          {hi
            ? "ArziDesk ड्राफ्टिंग सहायता है, कानूनी सलाह नहीं। दाखिल करने से पहले तथ्य, फ़ीस और पते जाँचें।"
            : "ArziDesk is drafting assistance, not legal advice. Check facts, fees and addresses before you file."}
        </p>
      </aside>

      <section className="auth-main">
        <div className="stagger-in w-full max-w-sm">
          <div className="mb-8 flex items-center justify-between">
            <Link to="/" className="brand auth-brand-mobile">
              <BrandMark className="size-8" />
              <span className="brand-word">ArziDesk</span>
            </Link>
            <LangToggle
              lang={lang}
              onLang={(next) => setLang(next)}
              ariaLabel={hi ? "भाषा" : "Language"}
              className="ml-auto"
            />
          </div>

          <h1 className="page-title">
            {mode === "in" ? (hi ? "वापसी पर स्वागत" : "Welcome back") : hi ? "खाता बनाएँ" : "Create your account"}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {hi ? "मुफ़्त शुरुआती क्रेडिट के साथ प्रीपेड वॉलेट। हर ड्राफ्ट पर भुगतान, कोई सदस्यता नहीं।" : "Prepaid wallet with free starting credit. Pay per draft; no subscription."}
          </p>

          <div role="tablist" className="seg seg-fill mt-6">
            {(["in", "up"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                className={"seg-btn" + (mode === m ? " is-on" : "")}
                onClick={() => {
                  setMode(m);
                  setError(null);
                }}
              >
                {m === "in" ? (hi ? "लॉगिन" : "Sign in") : hi ? "रजिस्टर" : "Register"}
              </button>
            ))}
          </div>

          <form className="mt-5 flex flex-col gap-4" onSubmit={onSubmit}>
            <Field>
              <Label htmlFor="username">{hi ? "ईमेल या यूज़रनेम" : "Email or username"}</Label>
              <Input
                id="username"
                name="username"
                autoComplete="username"
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={hi ? "जैसे: emitra.sitapur@example.com" : "e.g. emitra.sitapur@example.com"}
                spellCheck={false}
                disabled={busy}
              />
            </Field>
            <Field>
              <Label htmlFor="password">{hi ? "पासवर्ड" : "Password"}</Label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPw ? "text" : "password"}
                  autoComplete={mode === "up" ? "new-password" : "current-password"}
                  value={password}
                  minLength={8}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy}
                  className="pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? (hi ? "पासवर्ड छुपाएँ" : "Hide password") : hi ? "पासवर्ड दिखाएँ" : "Show password"}
                  className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted hover:text-fg"
                >
                  {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <Hint>{hi ? "कम से कम 8 अक्षर।" : "At least 8 characters."}</Hint>
            </Field>
            {error ? (
              <p className="rounded-md bg-danger/12 px-3.5 py-3 text-sm leading-relaxed text-danger" role="alert">
                {error}
              </p>
            ) : null}
            <Button type="submit" size="lg" disabled={busy} className="w-full">
              {busy
                ? hi ? "रुकिए…" : "Please wait…"
                : mode === "in"
                  ? hi ? "अंदर जाएँ" : "Sign in"
                  : hi ? "खाता बनाएँ" : "Create account"}
            </Button>
          </form>

          {authEnabled ? (
            <>
              <div className="mt-6 flex items-center gap-3">
                <span className="hairline flex-1" />
                <span className="text-xs text-subtle">{hi ? "या" : "or"}</span>
                <span className="hairline flex-1" />
              </div>
              <div className="mt-4 flex flex-col gap-2">
                {GROK_PROVIDERS.map((p) => (
                  <Button
                    key={p.providerId}
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={busy}
                    onClick={() => void signIn(p.providerId, { callbackURL: "/" })}
                  >
                    {hi ? `${p.label} से जारी रखें` : `Continue with ${p.label}`}
                  </Button>
                ))}
              </div>
            </>
          ) : (
            <p className="mt-6 text-sm text-muted">{hi ? "लॉगिन अभी बंद है।" : "Sign-in is disabled."}</p>
          )}
          <p className="mt-6 text-xs leading-relaxed text-subtle">
            {hi
              ? "केस, ड्राफ्ट और वॉलेट उसी अकाउंट पर रहते हैं जिससे आप लॉगिन करते हैं।"
              : "Cases, drafts and the wallet stay on the account you sign in with."}
          </p>
        </div>
      </section>
    </main>
  );
}
