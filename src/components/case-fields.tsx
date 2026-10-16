import type { ReactNode } from "react";
import { Field, Hint, Input, Label, Select, Textarea } from "@/components/ui/field";
import { schemeGuide } from "@/lib/desk/schemes";
import type { Applicant, CaseDetails, Flow, Scheme, StateCode } from "@/lib/desk/types";
import type { OutputLang } from "@/lib/lang";

function Text({
  id,
  label,
  value,
  onChange,
  hint,
  placeholder,
  type = "text",
  required,
  inputMode,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: ReactNode;
  placeholder?: string;
  type?: string;
  required?: boolean;
  inputMode?: "text" | "numeric" | "tel" | "email";
}) {
  return (
    <Field>
      <Label htmlFor={id}>
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </Label>
      <Input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      />
      {hint ? <Hint>{hint}</Hint> : null}
    </Field>
  );
}

function Area({
  id,
  label,
  value,
  onChange,
  hint,
  placeholder,
  required,
  rows = 4,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: ReactNode;
  placeholder?: string;
  required?: boolean;
  rows?: number;
}) {
  return (
    <Field className="sm:col-span-2">
      <Label htmlFor={id}>
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </Label>
      <Textarea
        id={id}
        value={value}
        rows={rows}
        placeholder={placeholder}
        className="min-h-24"
        onChange={(e) => onChange(e.target.value)}
        required={required}
      />
      {hint ? <Hint>{hint}</Hint> : null}
    </Field>
  );
}

function Check({ id, label, checked, onChange, hint }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5 text-sm sm:col-span-2">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 accent-[var(--color-accent)]"
      />
      <span>
        <span className="font-medium">{label}</span>
        {hint ? <span className="mt-0.5 block text-[0.8125rem] text-muted">{hint}</span> : null}
      </span>
    </label>
  );
}

export function ApplicantFields({
  value,
  onChange,
  lang,
}: {
  value: Applicant;
  onChange: (next: Applicant) => void;
  lang: OutputLang;
}) {
  const hi = lang === "hi";
  const set = <K extends keyof Applicant>(key: K) => (v: Applicant[K]) => onChange({ ...value, [key]: v });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Text id="a-name" label={hi ? "नागरिक का नाम" : "Citizen's name"} value={value.name} onChange={set("name")} required />
      <Text
        id="a-rel"
        label={hi ? "पिता / पति का नाम" : "Father's / husband's name"}
        value={value.relation}
        onChange={set("relation")}
        placeholder={hi ? "जैसे: पुत्र श्री मोहन लाल" : "e.g. S/o Shri Mohan Lal"}
      />
      <Text id="a-addr" label={hi ? "मकान / गली" : "House / street"} value={value.address} onChange={set("address")} />
      <Text id="a-vil" label={hi ? "गाँव / वार्ड" : "Village / ward"} value={value.village} onChange={set("village")} />
      <Text id="a-block" label={hi ? "ब्लॉक / तहसील" : "Block / tehsil"} value={value.block} onChange={set("block")} />
      <Text id="a-dist" label={hi ? "ज़िला" : "District"} value={value.district} onChange={set("district")} required />
      <Text id="a-pin" label={hi ? "पिन कोड" : "PIN code"} value={value.pincode} onChange={set("pincode")} inputMode="numeric" />
      <Text
        id="a-mob"
        label={hi ? "मोबाइल" : "Mobile"}
        value={value.mobile}
        onChange={set("mobile")}
        inputMode="tel"
        hint={hi ? "केवल दस्तावेज़ में छपता है; AI को नहीं भेजा जाता।" : "Printed on the document only; never sent to the AI."}
      />
      <Text id="a-email" label={hi ? "ईमेल (वैकल्पिक)" : "Email (optional)"} value={value.email} onChange={set("email")} type="email" inputMode="email" />
      <Check
        id="a-bpl"
        label={hi ? "गरीबी रेखा से नीचे (BPL)" : "Below the poverty line (BPL)"}
        checked={value.bpl}
        onChange={set("bpl")}
        hint={hi ? "RTI फ़ीस नहीं लगती (धारा 7(5))। BPL कार्ड की प्रति लगाएँ।" : "No RTI fee under s.7(5). Attach a copy of the BPL card."}
      />
      {value.bpl ? <Text id="a-bplno" label={hi ? "BPL कार्ड संख्या" : "BPL card number"} value={value.bplCard} onChange={set("bplCard")} /> : null}
    </div>
  );
}

export function DetailsFields({
  flow,
  state,
  scheme,
  value,
  onChange,
  lang,
}: {
  flow: Flow;
  state: StateCode;
  scheme: Scheme | null;
  value: CaseDetails;
  onChange: (next: CaseDetails) => void;
  lang: OutputLang;
}) {
  const hi = lang === "hi";
  const set = <K extends keyof CaseDetails>(key: K) => (v: CaseDetails[K]) => onChange({ ...value, [key]: v });

  if (flow === "consumer") {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <Text id="d-opp" label={hi ? "कंपनी / विक्रेता" : "Company / seller"} value={value.opponent} onChange={set("opponent")} required />
        <Text id="d-oppaddr" label={hi ? "कंपनी का पता" : "Company's address"} value={value.opponentAddress} onChange={set("opponentAddress")} />
        <Text id="d-prod" label={hi ? "सामान / सेवा" : "Product / service"} value={value.product} onChange={set("product")} />
        <Text id="d-buy" label={hi ? "खरीद की तिथि" : "Date of purchase"} value={value.purchaseOn} onChange={set("purchaseOn")} type="date" />
        <Text id="d-paid" label={hi ? "भुगतान (₹)" : "Amount paid (₹)"} value={value.amountPaid} onChange={set("amountPaid")} inputMode="numeric" />
        <Text
          id="d-claim"
          label={hi ? "कुल दावा (₹)" : "Total claim (₹)"}
          value={value.claimValue}
          onChange={set("claimValue")}
          hint={hi ? "₹5 लाख तक ज़िला आयोग में फ़ीस शून्य; ₹50 लाख तक ज़िला आयोग।" : "Nil fee up to ₹5 lakh; District Commission up to ₹50 lakh."}
        />
        <Text
          id="d-cause"
          label={hi ? "समस्या कब हुई" : "Cause of action date"}
          value={value.causeOn}
          onChange={set("causeOn")}
          type="date"
          hint={hi ? "दो साल की समय-सीमा इसी से चलती है (धारा 69)।" : "The two-year limit runs from here (s.69)."}
        />
        <Text
          id="d-adv"
          label={hi ? "अधिवक्ता का नाम (वैकल्पिक)" : "Advocate's name (optional)"}
          value={value.advocate}
          onChange={set("advocate")}
          hint={hi ? "खाली हो तो नोटिस नागरिक के नाम से जाएगा।" : "Leave empty and the notice goes in the citizen's own name."}
        />
        <Area id="d-relief" label={hi ? "क्या चाहिए" : "Relief wanted"} value={value.reliefWanted} onChange={set("reliefWanted")} rows={2} />
        <Area id="d-docs" label={hi ? "उपलब्ध दस्तावेज़" : "Documents in hand"} value={value.documents} onChange={set("documents")} rows={2} />
        <Area
          id="d-facts"
          label={hi ? "क्या हुआ" : "What happened"}
          value={value.facts}
          onChange={set("facts")}
          required
          rows={5}
          hint={hi ? "तारीखें और राशि लिखें। AI इन्हीं तथ्यों से ड्राफ्ट करता है, नई बातें नहीं जोड़ता।" : "Give dates and amounts. The AI drafts only from these facts and adds none of its own."}
        />
      </div>
    );
  }

  const guide = scheme ? schemeGuide(scheme) : null;
  const pioHint =
    flow === "money" && guide ? (
      <>
        {hi ? "सुझाव (स्थानीय रूप से जाँचें):" : "Suggestions (check locally):"}{" "}
        {guide.pioSuggestions(state).map((s, i) => (
          <button key={s} type="button" className="link-accent text-left" onClick={() => set("pioAddress")(s)}>
            {i > 0 ? " · " : ""}
            {s}
          </button>
        ))}
      </>
    ) : hi ? (
      "जन सूचना अधिकारी का पदनाम और पूरा डाक पता। AI पता नहीं बनाता।"
    ) : (
      "Designation and full postal address of the PIO. The AI never makes up an address."
    );

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {flow === "money" && guide ? (
        <>
          <Text id="d-ben" label={hi ? guide.idLabelHi : guide.idLabel} value={value.beneficiaryId} onChange={set("beneficiaryId")} />
          <Text
            id="d-amt"
            label={hi ? "कितना पैसा अटका" : "What is stuck"}
            value={value.amountStuck}
            onChange={set("amountStuck")}
            placeholder={hi ? "जैसे: 3 किस्त, ₹2,000 प्रत्येक" : "e.g. 3 instalments of ₹2,000"}
          />
          <Text id="d-since" label={hi ? "कब से" : "Since when"} value={value.since} onChange={set("since")} placeholder={hi ? "जैसे: फ़रवरी 2026" : "e.g. Feb 2026"} />
          <Text id="d-auth" label={hi ? "विभाग" : "Department"} value={value.authority} onChange={set("authority")} />
        </>
      ) : null}

      {flow === "rti" ? (
        <>
          <Field>
            <Label htmlFor="d-level">{hi ? "किसका कार्यालय" : "Whose office holds the information"}</Label>
            <Select id="d-level" value={value.authorityLevel} onChange={(e) => set("authorityLevel")(e.target.value as CaseDetails["authorityLevel"])}>
              <option value="state">{hi ? "राज्य सरकार / स्थानीय निकाय" : "State government / local body"}</option>
              <option value="central">{hi ? "भारत सरकार (केंद्रीय)" : "Government of India (central)"}</option>
            </Select>
            <Hint>
              {value.authorityLevel === "central"
                ? hi
                  ? "rtionline.gov.in पर ऑनलाइन, ₹10।"
                  : "Online on rtionline.gov.in, ₹10."
                : hi
                  ? "राज्य का डाक प्रारूप, या राज्य पोर्टल जहाँ उपलब्ध।"
                  : "The state's postal format, or the state portal where there is one."}
            </Hint>
          </Field>
          <Text id="d-auth" label={hi ? "लोक प्राधिकरण" : "Public authority"} value={value.authority} onChange={set("authority")} required />
          <Area
            id="d-info"
            label={hi ? "क्या जानना है" : "What the citizen wants to know"}
            value={value.infoWanted}
            onChange={set("infoWanted")}
            required
            rows={3}
            hint={hi ? "अपनी भाषा में लिखें; AI इसे क्रमांकित प्रश्नों में बदलेगा।" : "In plain words; the AI turns it into numbered requests."}
          />
          <Check
            id="d-life"
            label={hi ? "जीवन या स्वतंत्रता का मामला" : "Concerns life or liberty"}
            checked={value.lifeLiberty}
            onChange={set("lifeLiberty")}
            hint={hi ? "48 घंटे में जवाब (धारा 7(1) का परंतुक)।" : "Reply due in 48 hours (proviso to s.7(1))."}
          />
        </>
      ) : null}

      <Area id="d-pio" label={hi ? "जन सूचना अधिकारी (PIO) का पता" : "PIO designation and address"} value={value.pioAddress} onChange={set("pioAddress")} rows={2} hint={pioHint} />
      <Area
        id="d-faa"
        label={hi ? "प्रथम अपीलीय अधिकारी का पता (वैकल्पिक)" : "First Appellate Authority address (optional)"}
        value={value.faaAddress}
        onChange={set("faaAddress")}
        rows={2}
        hint={hi ? "आमतौर पर PIO से वरिष्ठ अधिकारी, उसी कार्यालय में। RTI जवाब में लिखा होता है।" : "Usually the PIO's senior in the same office; the PIO's reply must name them."}
      />
      <Area
        id="d-facts"
        label={hi ? "क्या हुआ" : "What happened"}
        value={value.facts}
        onChange={set("facts")}
        required={flow === "money"}
        rows={5}
        hint={hi ? "तारीखें, कहाँ गए, क्या कहा गया। AI इन्हीं तथ्यों से ड्राफ्ट करता है।" : "Dates, offices visited, what was said. The AI drafts only from these facts."}
      />
    </div>
  );
}
