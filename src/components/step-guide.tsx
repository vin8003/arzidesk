import { ExternalLink } from "lucide-react";
import { schemeGuide } from "@/lib/desk/schemes";
import {
  CIC,
  CENTRAL_RTI,
  CPGRAMS,
  E_JAGRITI,
  NCH,
  STATE_PROFILES,
  commissionFor,
  districtFilingFee,
  parseRupees,
  rtiRulesFor,
  type Link as PortalLink,
} from "@/lib/desk/states";
import type { CaseRecord, StepKind } from "@/lib/desk/types";
import type { OutputLang } from "@/lib/lang";

function Portal({ link, lang }: { link: PortalLink; lang: OutputLang }) {
  return (
    <a href={link.url} target="_blank" rel="noreferrer noopener" className="link-accent inline-flex items-center gap-1">
      {lang === "hi" ? link.labelHi : link.label}
      <ExternalLink className="size-3" aria-hidden />
    </a>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-3">
      <dt className="text-xs font-medium text-muted sm:pt-0.5">{label}</dt>
      <dd className="text-[0.8125rem] leading-relaxed">{children}</dd>
    </div>
  );
}

/** Where this step is filed, what it costs the citizen, and the rules that apply. Static facts only. */
export function StepGuide({ kind, record, mode, lang }: { kind: StepKind; record: CaseRecord; mode: string; lang: OutputLang }) {
  const hi = lang === "hi";
  const state = STATE_PROFILES[record.state];
  const rules = rtiRulesFor(record.state, record.details.authorityLevel);
  const verify = rules.verify ? (hi ? " (स्थानीय रूप से पुष्टि करें)" : " (confirm locally)") : "";

  if (kind === "status_check" && record.scheme) {
    const guide = schemeGuide(record.scheme);
    return (
      <dl className="flex flex-col gap-2">
        <Row label={hi ? "सार्वजनिक स्थिति" : "Public status"}>
          <span className="flex flex-wrap gap-x-3 gap-y-1">
            {guide.statusLinks(record.state).map((l) => (
              <Portal key={l.url} link={l} lang={lang} />
            ))}
          </span>
        </Row>
        <Row label={hi ? "खोजें" : "Look up by"}>{hi ? guide.idLabelHi : guide.idLabel}</Row>
        {guide.helpline ? <Row label={hi ? "हेल्पलाइन" : "Helpline"}>{guide.helpline}</Row> : null}
        <Row label={hi ? "ध्यान दें" : "Note"}>
          {hi
            ? "पोर्टल पर OTP या CAPTCHA नागरिक के सामने भरें। ArziDesk पोर्टल पर कुछ नहीं भरता।"
            : "Enter any OTP or CAPTCHA with the citizen present. ArziDesk never logs into a portal for you."}
        </Row>
      </dl>
    );
  }

  if (kind === "grievance") {
    const targets = record.scheme ? schemeGuide(record.scheme).grievanceTargets(record.state) : [{ ...CPGRAMS, level: "central" as const, department: "", departmentHi: "" }];
    return (
      <dl className="flex flex-col gap-2">
        {targets.map((tg) => (
          <Row key={tg.url} label={tg.level === "central" ? (hi ? "केंद्र" : "Central") : state.name}>
            <Portal link={tg} lang={lang} />
            {tg.department ? <span className="text-muted"> · {hi ? tg.departmentHi : tg.department}</span> : null}
            {tg.helpline ? <span className="text-muted"> · {hi ? "हेल्पलाइन" : "helpline"} {tg.helpline}</span> : null}
          </Row>
        ))}
        <Row label={hi ? "फ़ीस" : "Fee"}>{hi ? "कोई फ़ीस नहीं।" : "Free."}</Row>
        <Row label={hi ? "अगला कदम" : "Next"}>
          {hi ? "30 दिन में हल न हो तो ब्लॉक कार्यालय को RTI।" : "Not resolved in 30 days → RTI to the block office."}
        </Row>
      </dl>
    );
  }

  if (kind === "rti_application") {
    const central = mode === "central_online";
    return (
      <dl className="flex flex-col gap-2">
        <Row label={hi ? "नियम" : "Rules"}>{hi ? rules.rulesHi : rules.rules}</Row>
        <Row label={hi ? "फ़ीस" : "Fee"}>
          {record.applicant.bpl ? (hi ? "BPL: शुल्क नहीं (धारा 7(5))" : "BPL: no fee (s.7(5))") : `₹${rules.fee}${verify}`}
        </Row>
        <Row label={hi ? "भुगतान" : "Payment"}>
          {central ? (hi ? "पोर्टल पर नेट बैंकिंग / कार्ड / UPI" : "Net banking / card / UPI on the portal") : hi ? rules.payModesHi : rules.payModes}
          {!central ? <span className="text-muted"> · {hi ? "देय" : "payable to"} {hi ? rules.payeeHi : rules.payee}</span> : null}
        </Row>
        <Row label={hi ? "कहाँ" : "Where"}>
          {central ? (
            <Portal link={CENTRAL_RTI.portal!} lang={lang} />
          ) : mode === "state_online" && rules.portal ? (
            <Portal link={rules.portal} lang={lang} />
          ) : hi ? (
            "PIO के पते पर स्पीड पोस्ट / हाथ से; रसीद रखें"
          ) : (
            "Speed Post or by hand to the PIO's address; keep the receipt"
          )}
        </Row>
        {(central ? CENTRAL_RTI.notes : rules.notes).map((n, i) => (
          <Row key={n} label={i === 0 ? (hi ? "ध्यान दें" : "Note") : ""}>
            {hi ? (central ? CENTRAL_RTI.notesHi[i] : rules.notesHi[i]) : n}
          </Row>
        ))}
      </dl>
    );
  }

  if (kind === "first_appeal") {
    return (
      <dl className="flex flex-col gap-2">
        <Row label={hi ? "किसे" : "To"}>
          {record.details.faaAddress.trim() || (hi ? "प्रथम अपीलीय अधिकारी (PIO के जवाब में नाम होता है)" : "First Appellate Authority (named in the PIO's reply)")}
        </Row>
        <Row label={hi ? "फ़ीस" : "Fee"}>{rules.firstAppealFee ? `₹${rules.firstAppealFee}${verify}` : hi ? "कोई फ़ीस नहीं" : "No fee"}</Row>
        <Row label={hi ? "निर्णय" : "Decision"}>{hi ? "30 दिन में, अधिकतम 45 दिन (धारा 19(6))" : "Within 30 days, 45 at most (s.19(6))"}</Row>
      </dl>
    );
  }

  if (kind === "second_appeal") {
    const central = record.details.authorityLevel === "central" || record.state === "DL";
    return (
      <dl className="flex flex-col gap-2">
        <Row label={hi ? "किसे" : "To"}>{hi ? rules.commissionHi : rules.commission}</Row>
        {central ? (
          <Row label={hi ? "ऑनलाइन" : "Online"}>
            <Portal link={CIC} lang={lang} />
          </Row>
        ) : null}
        <Row label={hi ? "फ़ीस" : "Fee"}>{rules.secondAppealFee ? `₹${rules.secondAppealFee}${verify}` : hi ? "कोई फ़ीस नहीं" : "No fee"}</Row>
        <Row label={hi ? "समय" : "Time limit"}>{hi ? "प्रथम अपील निर्णय (या उसकी तिथि) से 90 दिन" : "90 days from the first appellate order (or when it was due)"}</Row>
      </dl>
    );
  }

  if (kind === "nch") {
    return (
      <dl className="flex flex-col gap-2">
        <Row label={hi ? "कहाँ" : "Where"}>
          <Portal link={NCH} lang={lang} /> · {hi ? "फ़ोन" : "call"} {NCH.helpline} · WhatsApp {NCH.whatsapp}
        </Row>
        <Row label={hi ? "फ़ीस" : "Fee"}>{hi ? "मुफ़्त" : "Free"}</Row>
        <Row label={hi ? "अगला कदम" : "Next"}>{hi ? "30 दिन में हल न हो तो कानूनी नोटिस।" : "Not resolved in 30 days → legal notice."}</Row>
      </dl>
    );
  }

  if (kind === "legal_notice") {
    return (
      <dl className="flex flex-col gap-2">
        <Row label={hi ? "कैसे" : "How"}>{hi ? "स्पीड पोस्ट, डिलीवरी प्रमाण के साथ; ट्रैकिंग नंबर दर्ज करें" : "Speed Post with proof of delivery; record the tracking number"}</Row>
        <Row label={hi ? "समय" : "Time given"}>{hi ? "प्राप्ति से 15 दिन" : "15 days from receipt"}</Row>
        <Row label={hi ? "किसे" : "To"}>{record.details.opponent || "—"}</Row>
      </dl>
    );
  }

  if (kind === "consumer_complaint") {
    const claim = parseRupees(record.details.claimValue);
    const level = commissionFor(claim);
    const fee = districtFilingFee(claim);
    return (
      <dl className="flex flex-col gap-2">
        <Row label={hi ? "आयोग" : "Commission"}>
          {level === "district"
            ? hi
              ? `ज़िला उपभोक्ता आयोग, ${record.applicant.district || "—"}`
              : `District Commission, ${record.applicant.district || "—"}`
            : hi
              ? "दावा ज़िला आयोग की सीमा से ऊपर है — राज्य / राष्ट्रीय आयोग"
              : "Claim is above the District Commission's limit — State / National Commission"}
        </Row>
        <Row label={hi ? "ई-फ़ाइलिंग" : "E-filing"}>
          <Portal link={E_JAGRITI} lang={lang} />
        </Row>
        <Row label={hi ? "फ़ीस" : "Fee"}>
          {Number.isFinite(claim) ? (fee ? `₹${fee}` : hi ? "शून्य (₹5 लाख तक)" : "Nil (up to ₹5 lakh)") : hi ? "दावा राशि डालें" : "Enter the claim value"}
          <span className="text-muted"> · {hi ? "पुष्टि करें" : "verify"}</span>
        </Row>
        <Row label={hi ? "कौन दाखिल करे" : "Who files"}>
          {hi
            ? "नागरिक स्वयं (पार्टी-इन-पर्सन), या उनके वकील। गैर-वकील एजेंट के लिए आयोग की अनुमति चाहिए।"
            : "The citizen in person, or their advocate. A non-advocate agent needs the Commission's leave."}
        </Row>
      </dl>
    );
  }

  return null;
}
