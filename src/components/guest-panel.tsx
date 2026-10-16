import { LangToggle } from "@/components/lang-toggle";
import { Button } from "@/components/ui/button";
import type { OutputLang } from "@/lib/lang";

const COPY = {
  en: {
    title: "Filing desk for RTI, stuck payments and consumer complaints.",
    lead: "For advocates and e-Mitra / CSC operators in Uttar Pradesh, Rajasthan, Madhya Pradesh and Delhi. Enter the citizen's facts once; ArziDesk drafts each filing in the right format, keeps every statutory clock, and drafts the appeal when a deadline passes.",
    create: "Create a free account",
    signIn: "Sign in",
    trial: "Prepaid wallet with free starting credit. Pay per draft, from ₹10. No subscription.",
    points: [
      ["Government money stuck", "PM-Kisan, MGNREGA wages, pension. Public status check, grievance, RTI to the block office after 30 days, automatic first appeal."],
      ["RTI", "Central RTI for rtionline.gov.in, or the state's postal format. Reply, first appeal and second appeal deadlines on a timer."],
      ["Consumer complaint", "NCH docket text, legal notice, and a District Commission complaint file with affidavit and index for self-filing on e-Jagriti."],
      ["You stay in control", "Nothing is filed for you. Every draft is editable, printable and checked by you; government fees are paid by the citizen at cost."],
    ],
    language: "Language",
    gate: "Sign in to see this page",
    gateLead: "Cases, drafts and the wallet are private to your account.",
  },
  hi: {
    title: "RTI, अटके भुगतान और उपभोक्ता शिकायतों के लिए फ़ाइलिंग डेस्क।",
    lead: "उत्तर प्रदेश, राजस्थान, मध्य प्रदेश और दिल्ली के अधिवक्ताओं और ई-मित्र / CSC संचालकों के लिए। नागरिक के तथ्य एक बार डालें; ArziDesk हर फ़ाइलिंग सही प्रारूप में ड्राफ्ट करता है, हर वैधानिक समय-सीमा याद रखता है, और समय बीतने पर अपील ड्राफ्ट करता है।",
    create: "मुफ़्त अकाउंट बनाएँ",
    signIn: "लॉगिन",
    trial: "प्रीपेड वॉलेट, शुरुआती क्रेडिट मुफ़्त। हर ड्राफ्ट पर भुगतान, ₹10 से। कोई सदस्यता नहीं।",
    points: [
      ["सरकारी पैसा अटका", "पीएम-किसान, मनरेगा मज़दूरी, पेंशन। सार्वजनिक स्थिति, शिकायत, 30 दिन बाद ब्लॉक को RTI, अपने आप प्रथम अपील।"],
      ["RTI", "rtionline.gov.in के लिए केंद्रीय RTI, या राज्य का डाक प्रारूप। जवाब, प्रथम और द्वितीय अपील की समय-सीमा टाइमर पर।"],
      ["उपभोक्ता शिकायत", "NCH डॉकेट टेक्स्ट, कानूनी नोटिस, और ई-जागृति पर स्वयं दाखिल करने के लिए शपथ पत्र व अनुक्रमणिका सहित ज़िला आयोग परिवाद।"],
      ["नियंत्रण आपके पास", "आपकी ओर से कुछ दाखिल नहीं होता। हर ड्राफ्ट संपादन योग्य, प्रिंट योग्य और आपके द्वारा जाँचा जाता है; सरकारी फ़ीस नागरिक वास्तविक दर पर देता है।"],
    ],
    language: "भाषा",
    gate: "यह पेज देखने के लिए लॉगिन करें",
    gateLead: "केस, ड्राफ्ट और वॉलेट केवल आपके अकाउंट में रहते हैं।",
  },
} as const;

/** Signed-out view. The full pitch on Today; a short gate everywhere else. */
export function GuestPanel({
  lang,
  onLang,
  variant = "gate",
}: {
  lang: OutputLang;
  onLang?: (next: OutputLang) => void;
  variant?: "landing" | "gate";
}) {
  const c = COPY[lang];

  if (variant === "gate") {
    return (
      <div className="empty max-w-xl">
        <p className="empty-title">{c.gate}</p>
        <p className="empty-text">{c.gateLead}</p>
        <div className="empty-actions">
          <Button asChild>
            <a href="/login">{c.signIn}</a>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <section className="landing">
      <h1 className="landing-title">{c.title}</h1>
      <p className="landing-lead">{c.lead}</p>
      <div className="mt-7 flex flex-wrap items-center gap-3">
        <Button asChild size="lg">
          <a href="/login?mode=register">{c.create}</a>
        </Button>
        <Button asChild size="lg" variant="outline">
          <a href="/login">{c.signIn}</a>
        </Button>
      </div>
      <p className="mt-3 text-sm text-muted">{c.trial}</p>
      <dl className="landing-grid">
        {c.points.map(([title, body]) => (
          <div key={title}>
            <dt>
              <h2>{title}</h2>
            </dt>
            <dd>
              <p>{body}</p>
            </dd>
          </div>
        ))}
      </dl>
      {onLang ? (
        <div className="mt-10">
          <LangToggle lang={lang} onLang={onLang} ariaLabel={c.language} />
        </div>
      ) : null}
    </section>
  );
}
