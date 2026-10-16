import { CPGRAMS, STATE_PROFILES, type Link } from "./states.ts";
import type { Scheme, StateCode } from "./types.ts";

/** A status the operator can read off a public portal, and what to do about it. */
export type Finding = {
  code: string;
  label: string;
  labelHi: string;
  /** A fix the citizen can make without a complaint (eKYC, bank seeding). */
  fix: string;
  fixHi: string;
  /** True when a grievance / RTI is the right next step. */
  escalate: boolean;
};

export type SchemeGuide = {
  id: Scheme;
  name: string;
  nameHi: string;
  /** What the operator looks up first. */
  idLabel: string;
  idLabelHi: string;
  statusLinks: (state: StateCode) => Link[];
  findings: Finding[];
  /** Where the grievance goes. */
  grievanceTargets: (state: StateCode) => Array<Link & { helpline: string; level: "central" | "state"; department: string; departmentHi: string }>;
  /** Suggested PIO offices for the RTI after 30 days. The operator types the actual address. */
  pioSuggestions: (state: StateCode) => string[];
  /** Law and rules the drafts may rely on. Plain statements, no case law. */
  legalHooks: string[];
  helpline: string;
};

const PAID: Finding = {
  code: "paid",
  label: "Money has been credited",
  labelHi: "पैसा खाते में आ गया है",
  fix: "Nothing to file. Close the case.",
  fixHi: "कुछ दाखिल नहीं करना है। केस बंद करें।",
  escalate: false,
};

const OTHER: Finding = {
  code: "other",
  label: "Something else (write it in notes)",
  labelHi: "कुछ और (नोट में लिखें)",
  fix: "",
  fixHi: "",
  escalate: true,
};

export const SCHEME_GUIDES: Record<Scheme, SchemeGuide> = {
  pmkisan: {
    id: "pmkisan",
    name: "PM-Kisan instalment",
    nameHi: "पीएम-किसान किस्त",
    idLabel: "PM-Kisan registration number",
    idLabelHi: "पीएम-किसान रजिस्ट्रेशन नंबर",
    statusLinks: () => [
      { label: "PM-Kisan: Know your status", labelHi: "पीएम-किसान: अपनी स्थिति जानें", url: "https://pmkisan.gov.in" },
    ],
    findings: [
      {
        code: "ekyc_pending",
        label: "eKYC not done",
        labelHi: "eKYC नहीं हुआ",
        fix: "Do OTP eKYC on pmkisan.gov.in or biometric eKYC at a CSC. Instalments resume after eKYC; no complaint needed.",
        fixHi: "pmkisan.gov.in पर OTP eKYC या CSC पर बायोमेट्रिक eKYC करें। eKYC के बाद किस्त आती है; शिकायत की ज़रूरत नहीं।",
        escalate: false,
      },
      {
        code: "aadhaar_bank",
        label: "Aadhaar not seeded / bank account inactive for DBT",
        labelHi: "आधार बैंक से लिंक नहीं / DBT के लिए खाता निष्क्रिय",
        fix: "Get Aadhaar seeded (NPCI mapping) at the bank branch, or open an India Post Payments Bank account. Then check status again.",
        fixHi: "बैंक शाखा में आधार सीडिंग (NPCI मैपिंग) कराएँ, या इंडिया पोस्ट पेमेंट्स बैंक खाता खोलें। फिर स्थिति दोबारा देखें।",
        escalate: false,
      },
      {
        code: "land_seeding",
        label: "Land seeding shows No",
        labelHi: "लैंड सीडिंग 'No' दिख रही है",
        fix: "Land records must be verified by the revenue office (Lekhpal / Patwari / Tehsil). If verification is pending for long, file the grievance.",
        fixHi: "भूमि अभिलेख का सत्यापन राजस्व कार्यालय (लेखपाल / पटवारी / तहसील) करता है। लंबे समय से लंबित हो तो शिकायत करें।",
        escalate: true,
      },
      {
        code: "pending_approval",
        label: "Pending approval at district / state",
        labelHi: "ज़िला / राज्य स्तर पर स्वीकृति लंबित",
        fix: "",
        fixHi: "",
        escalate: true,
      },
      {
        code: "payment_failed",
        label: "Payment failed / FTO not processed",
        labelHi: "भुगतान विफल / FTO प्रोसेस नहीं",
        fix: "",
        fixHi: "",
        escalate: true,
      },
      {
        code: "rejected",
        label: "Rejected or marked ineligible",
        labelHi: "अस्वीकृत या अपात्र चिह्नित",
        fix: "",
        fixHi: "",
        escalate: true,
      },
      PAID,
      OTHER,
    ],
    grievanceTargets: (state) => [
      {
        ...CPGRAMS,
        level: "central",
        department: "Department of Agriculture and Farmers Welfare",
        departmentHi: "कृषि एवं किसान कल्याण विभाग",
      },
      {
        ...STATE_PROFILES[state].grievance,
        level: "state",
        department: "State Agriculture Department (PM-Kisan nodal office)",
        departmentHi: "राज्य कृषि विभाग (पीएम-किसान नोडल कार्यालय)",
      },
    ],
    pioSuggestions: (state) =>
      state === "DL"
        ? ["Public Information Officer, Office of the District Magistrate (PM-Kisan nodal), <district>"]
        : [
            "Public Information Officer, Office of the Deputy Director (Agriculture) / District Agriculture Officer, <district>",
            "Public Information Officer, Office of the Tehsildar (land record verification), <tehsil>",
            `Public Information Officer, Office of the ${STATE_PROFILES[state].blockOffice}, <block>`,
          ],
    legalHooks: [
      "PM-Kisan pays eligible landholding farmer families ₹6,000 a year in three instalments by direct benefit transfer.",
      "The state government verifies beneficiary data (land records, Aadhaar, bank); the Centre releases funds after state approval.",
      "Under the RTI Act, an applicant may ask for the status of their own application, the reasons for rejection or stoppage, and the names of officials who acted on it.",
    ],
    helpline: "155261",
  },
  mgnrega: {
    id: "mgnrega",
    name: "MGNREGA wages",
    nameHi: "मनरेगा मज़दूरी",
    idLabel: "Job card number",
    idLabelHi: "जॉब कार्ड नंबर",
    statusLinks: () => [
      { label: "NREGA MIS: job card, muster roll, wage list, FTO", labelHi: "नरेगा MIS: जॉब कार्ड, मस्टर रोल, वेज लिस्ट, FTO", url: "https://nrega.nic.in" },
    ],
    findings: [
      {
        code: "muster_open",
        label: "Muster roll not closed / work not measured",
        labelHi: "मस्टर रोल बंद नहीं / काम की नाप नहीं हुई",
        fix: "",
        fixHi: "",
        escalate: true,
      },
      {
        code: "wage_list_missing",
        label: "Muster roll closed but no wage list",
        labelHi: "मस्टर रोल बंद, पर वेज लिस्ट नहीं बनी",
        fix: "",
        fixHi: "",
        escalate: true,
      },
      {
        code: "fto_unsigned",
        label: "FTO generated but not signed at block",
        labelHi: "FTO बना पर ब्लॉक पर हस्ताक्षर नहीं",
        fix: "",
        fixHi: "",
        escalate: true,
      },
      {
        code: "payment_rejected",
        label: "Payment rejected (account / Aadhaar problem)",
        labelHi: "भुगतान अस्वीकृत (खाता / आधार की समस्या)",
        fix: "Correct the account or Aadhaar mapping at the bank or post office, then ask the block to regenerate the payment.",
        fixHi: "बैंक या डाकघर में खाता या आधार मैपिंग ठीक कराएँ, फिर ब्लॉक से भुगतान दोबारा बनवाएँ।",
        escalate: true,
      },
      {
        code: "attendance_missing",
        label: "Name missing from muster roll",
        labelHi: "मस्टर रोल में नाम नहीं",
        fix: "",
        fixHi: "",
        escalate: true,
      },
      PAID,
      OTHER,
    ],
    grievanceTargets: (state) => [
      {
        ...STATE_PROFILES[state].grievance,
        level: "state",
        department: "Rural Development Department (MGNREGA)",
        departmentHi: "ग्राम्य विकास विभाग (मनरेगा)",
      },
      {
        ...CPGRAMS,
        level: "central",
        department: "Department of Rural Development",
        departmentHi: "ग्रामीण विकास विभाग",
      },
    ],
    pioSuggestions: (state) => [
      `Public Information Officer, Office of the Programme Officer (MGNREGA) / ${STATE_PROFILES[state].blockOffice}, <block>`,
      "Public Information Officer, Office of the District Programme Coordinator (MGNREGA), <district>",
    ],
    legalHooks: [
      "Section 3(3), Mahatma Gandhi NREGA, 2005: wages are to be paid weekly and in any case within a fortnight of the date the work was done.",
      "Schedule II of the Act provides compensation for delayed wages at 0.05% of unpaid wages per day of delay beyond the sixteenth day after the muster roll closes.",
      "Muster rolls, wage lists and FTO details are public records under the Act and can be sought under the RTI Act.",
    ],
    helpline: "",
  },
  pension: {
    id: "pension",
    name: "Old age / widow / disability pension",
    nameHi: "वृद्धावस्था / विधवा / दिव्यांग पेंशन",
    idLabel: "Pension / application ID",
    idLabelHi: "पेंशन / आवेदन आईडी",
    statusLinks: (state) => {
      const links: Link[] = [
        { label: "NSAP (central pension schemes)", labelHi: "NSAP (केंद्रीय पेंशन योजनाएँ)", url: "https://nsap.nic.in" },
      ];
      const own = STATE_PROFILES[state].pension;
      if (own) links.unshift(own);
      return links;
    },
    findings: [
      {
        code: "verification_pending",
        label: "Application pending verification",
        labelHi: "आवेदन सत्यापन के लिए लंबित",
        fix: "",
        fixHi: "",
        escalate: true,
      },
      {
        code: "sanctioned_unpaid",
        label: "Sanctioned but money not credited",
        labelHi: "स्वीकृत पर पैसा नहीं आया",
        fix: "",
        fixHi: "",
        escalate: true,
      },
      {
        code: "stopped_kyc",
        label: "Stopped for life certificate / KYC / Aadhaar",
        labelHi: "जीवन प्रमाण / KYC / आधार के कारण रुकी",
        fix: "Submit the life certificate or KYC at the office or a CSC first. File the grievance only if payment does not resume.",
        fixHi: "पहले कार्यालय या CSC पर जीवन प्रमाण पत्र या KYC जमा करें। भुगतान फिर भी शुरू न हो तो शिकायत करें।",
        escalate: true,
      },
      {
        code: "rejected",
        label: "Rejected (age / income / other)",
        labelHi: "अस्वीकृत (आयु / आय / अन्य)",
        fix: "",
        fixHi: "",
        escalate: true,
      },
      PAID,
      OTHER,
    ],
    grievanceTargets: (state) => [
      {
        ...STATE_PROFILES[state].grievance,
        level: "state",
        department: "Social Welfare / Social Justice Department",
        departmentHi: "समाज कल्याण / सामाजिक न्याय विभाग",
      },
      {
        ...CPGRAMS,
        level: "central",
        department: "Department of Rural Development (NSAP)",
        departmentHi: "ग्रामीण विकास विभाग (NSAP)",
      },
    ],
    pioSuggestions: (state) =>
      state === "DL"
        ? ["Public Information Officer, Office of the District Social Welfare Officer, Department of Social Welfare, <district>"]
        : [
            "Public Information Officer, Office of the District Social Welfare Officer, <district>",
            `Public Information Officer, Office of the ${STATE_PROFILES[state].blockOffice}, <block>`,
          ],
    legalHooks: [
      "The National Social Assistance Programme (IGNOAPS, IGNWPS, IGNDPS) funds old age, widow and disability pensions; states add their own share and run sanction and payment.",
      "Under the RTI Act, an applicant may ask for the status of their own pension file, the sanction order, payment records and the reasons for stoppage.",
    ],
    helpline: "",
  },
};

export function schemeGuide(scheme: Scheme): SchemeGuide {
  return SCHEME_GUIDES[scheme];
}

export function findingFor(scheme: Scheme, code: string): Finding | null {
  return SCHEME_GUIDES[scheme].findings.find((f) => f.code === code) ?? null;
}
