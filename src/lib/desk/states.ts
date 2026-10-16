import type { AuthorityLevel, StateCode } from "./types.ts";

/**
 * Per-state filing facts. Fees and portals change and secondary sources disagree,
 * so every figure marked `verify: true` is shown to the operator as "check before
 * paying", and the fee on a filing is always editable. Sources are listed in
 * docs/state-rules.md.
 */
export type Link = { label: string; labelHi: string; url: string };

export type RtiRules = {
  /** Rules that prescribe fee and format. */
  rules: string;
  rulesHi: string;
  fee: number;
  firstAppealFee: number;
  secondAppealFee: number;
  verify: boolean;
  /** Soft cap on the application body, in words (0 = none). */
  wordLimit: number;
  /** Payment modes accepted by post or by hand. */
  payModes: string;
  payModesHi: string;
  /** Payee line for a postal order / DD. */
  payee: string;
  payeeHi: string;
  /** State online RTI portal, if one is confirmed. */
  portal: Link | null;
  /** Who hears second appeals. */
  commission: string;
  commissionHi: string;
  notes: string[];
  notesHi: string[];
};

export type StateProfile = {
  code: StateCode;
  name: string;
  nameHi: string;
  rti: RtiRules;
  grievance: Link & { helpline: string };
  pension: Link | null;
  consumerState: string;
  consumerStateHi: string;
  /** Local name for the block office (Delhi has none). */
  blockOffice: string;
  blockOfficeHi: string;
};

export const CENTRAL_RTI: RtiRules = {
  rules: "Right to Information Rules, 2012 (Government of India)",
  rulesHi: "सूचना का अधिकार नियम, 2012 (भारत सरकार)",
  fee: 10,
  firstAppealFee: 0,
  secondAppealFee: 0,
  verify: false,
  wordLimit: 500,
  payModes: "Online on rtionline.gov.in, or Indian Postal Order / demand draft / banker's cheque / cash against receipt",
  payModesHi: "rtionline.gov.in पर ऑनलाइन, या भारतीय पोस्टल ऑर्डर / डिमांड ड्राफ्ट / बैंकर्स चेक / रसीद पर नकद",
  payee: "Accounts Officer, <public authority>",
  payeeHi: "लेखा अधिकारी, <लोक प्राधिकरण>",
  portal: { label: "RTI Online (central)", labelHi: "RTI ऑनलाइन (केंद्र)", url: "https://rtionline.gov.in" },
  commission: "Central Information Commission",
  commissionHi: "केंद्रीय सूचना आयोग",
  notes: [
    "rtionline.gov.in is for central ministries and their offices only. A state department filed there is returned without refund.",
    "The text box takes about 3,000 characters in English letters and basic punctuation. Put a Hindi or longer application in a PDF attachment.",
    "Do not upload Aadhaar, PAN or other ID. A BPL applicant uploads only the BPL card.",
  ],
  notesHi: [
    "rtionline.gov.in केवल केंद्रीय मंत्रालयों और उनके कार्यालयों के लिए है। राज्य विभाग का आवेदन वहाँ लौटा दिया जाता है, फ़ीस वापस नहीं होती।",
    "टेक्स्ट बॉक्स में लगभग 3,000 अक्षर, अंग्रेज़ी अक्षर और सामान्य विराम चिह्न ही जाते हैं। हिंदी या लंबा आवेदन PDF में लगाएँ।",
    "आधार, PAN या अन्य पहचान पत्र अपलोड न करें। BPL आवेदक केवल BPL कार्ड लगाएँ।",
  ],
};

export const STATE_PROFILES: Record<StateCode, StateProfile> = {
  UP: {
    code: "UP",
    name: "Uttar Pradesh",
    nameHi: "उत्तर प्रदेश",
    rti: {
      rules: "Uttar Pradesh Right to Information Rules, 2015",
      rulesHi: "उत्तर प्रदेश सूचना का अधिकार नियमावली, 2015",
      fee: 10,
      firstAppealFee: 0,
      secondAppealFee: 0,
      verify: true,
      wordLimit: 500,
      payModes: "Cash against receipt, demand draft, banker's cheque or Indian Postal Order",
      payModesHi: "रसीद पर नकद, डिमांड ड्राफ्ट, बैंकर्स चेक या भारतीय पोस्टल ऑर्डर",
      payee: "Public Information Officer / Accounts Officer of the office (a blank crossed IPO is commonly accepted)",
      payeeHi: "कार्यालय के जन सूचना अधिकारी / लेखा अधिकारी (खाली क्रॉस्ड IPO आमतौर पर स्वीकार)",
      portal: { label: "UP RTI Online", labelHi: "UP RTI ऑनलाइन", url: "https://rtionline.up.gov.in" },
      commission: "Uttar Pradesh State Information Commission",
      commissionHi: "उत्तर प्रदेश राज्य सूचना आयोग",
      notes: [
        "The 2015 rules cap an application at 500 words and one subject. Split unrelated questions into separate applications.",
        "UP RTI Online covers many state departments, not all. File by post where the office is not listed.",
      ],
      notesHi: [
        "2015 की नियमावली में आवेदन 500 शब्द और एक विषय तक सीमित है। अलग विषय के प्रश्न अलग आवेदन में भेजें।",
        "UP RTI ऑनलाइन पर कई राज्य विभाग हैं, सभी नहीं। जो कार्यालय सूची में न हो, उसे डाक से भेजें।",
      ],
    },
    grievance: {
      label: "IGRS / Jansunwai",
      labelHi: "IGRS / जनसुनवाई",
      url: "https://jansunwai.up.nic.in",
      helpline: "1076",
    },
    pension: { label: "UP social security pension", labelHi: "UP सामाजिक सुरक्षा पेंशन", url: "https://sspy-up.gov.in" },
    consumerState: "Uttar Pradesh",
    consumerStateHi: "उत्तर प्रदेश",
    blockOffice: "Block Development Officer, Kshetra Panchayat",
    blockOfficeHi: "खंड विकास अधिकारी, क्षेत्र पंचायत",
  },
  RJ: {
    code: "RJ",
    name: "Rajasthan",
    nameHi: "राजस्थान",
    rti: {
      rules: "Rajasthan Right to Information Rules, 2005",
      rulesHi: "राजस्थान सूचना का अधिकार नियम, 2005",
      fee: 10,
      firstAppealFee: 0,
      secondAppealFee: 0,
      verify: true,
      wordLimit: 0,
      payModes: "Cash against receipt, demand draft, banker's cheque or Indian Postal Order",
      payModesHi: "रसीद पर नकद, डिमांड ड्राफ्ट, बैंकर्स चेक या भारतीय पोस्टल ऑर्डर",
      payee: "Accounts Officer / Public Information Officer of the office",
      payeeHi: "कार्यालय के लेखा अधिकारी / लोक सूचना अधिकारी",
      portal: null,
      commission: "Rajasthan State Information Commission",
      commissionHi: "राजस्थान राज्य सूचना आयोग",
      notes: [
        "No statewide online RTI portal is confirmed here. File by Speed Post or by hand and keep the receipt.",
        "The High Court and courts have separate rules and a ₹50 fee; this desk drafts for government offices.",
      ],
      notesHi: [
        "राज्यव्यापी ऑनलाइन RTI पोर्टल की पुष्टि नहीं है। स्पीड पोस्ट या हाथ से जमा करें और रसीद रखें।",
        "हाईकोर्ट और अदालतों के नियम और ₹50 फ़ीस अलग हैं; यह डेस्क सरकारी कार्यालयों के लिए ड्राफ्ट करता है।",
      ],
    },
    grievance: {
      label: "Rajasthan Sampark",
      labelHi: "राजस्थान संपर्क",
      url: "https://sampark.rajasthan.gov.in",
      helpline: "181",
    },
    pension: { label: "Rajasthan social security pension", labelHi: "राजस्थान सामाजिक सुरक्षा पेंशन", url: "https://ssp.rajasthan.gov.in" },
    consumerState: "Rajasthan",
    consumerStateHi: "राजस्थान",
    blockOffice: "Block Development Officer, Panchayat Samiti",
    blockOfficeHi: "विकास अधिकारी, पंचायत समिति",
  },
  MP: {
    code: "MP",
    name: "Madhya Pradesh",
    nameHi: "मध्य प्रदेश",
    rti: {
      rules: "Madhya Pradesh Right to Information (Fees and Appeal) Rules, 2005",
      rulesHi: "मध्य प्रदेश सूचना का अधिकार (फ़ीस एवं अपील) नियम, 2005",
      fee: 10,
      firstAppealFee: 50,
      secondAppealFee: 100,
      verify: true,
      wordLimit: 0,
      payModes: "Cash against receipt, demand draft, banker's cheque, Indian Postal Order, or online on the state portal",
      payModesHi: "रसीद पर नकद, डिमांड ड्राफ्ट, बैंकर्स चेक, भारतीय पोस्टल ऑर्डर, या राज्य पोर्टल पर ऑनलाइन",
      payee: "Accounts Officer / Public Information Officer of the office",
      payeeHi: "कार्यालय के लेखा अधिकारी / लोक सूचना अधिकारी",
      portal: { label: "MP RTI Online", labelHi: "MP RTI ऑनलाइन", url: "https://rtionline.mp.gov.in" },
      commission: "Madhya Pradesh State Information Commission",
      commissionHi: "मध्य प्रदेश राज्य सूचना आयोग",
      notes: [
        "Sources disagree on MP fees: application ₹10 or ₹50, first appeal ₹50 or nil, second appeal ₹100 or nil. Confirm with the office before paying.",
      ],
      notesHi: [
        "MP की फ़ीस पर स्रोत अलग-अलग हैं: आवेदन ₹10 या ₹50, प्रथम अपील ₹50 या शून्य, द्वितीय अपील ₹100 या शून्य। भुगतान से पहले कार्यालय से पुष्टि करें।",
      ],
    },
    grievance: {
      label: "CM Helpline",
      labelHi: "सीएम हेल्पलाइन",
      url: "https://cmhelpline.mp.gov.in",
      helpline: "181",
    },
    pension: { label: "MP social security portal", labelHi: "MP सामाजिक सुरक्षा पोर्टल", url: "https://socialsecurity.mp.gov.in" },
    consumerState: "Madhya Pradesh",
    consumerStateHi: "मध्य प्रदेश",
    blockOffice: "Chief Executive Officer, Janpad Panchayat",
    blockOfficeHi: "मुख्य कार्यपालन अधिकारी, जनपद पंचायत",
  },
  DL: {
    code: "DL",
    name: "Delhi",
    nameHi: "दिल्ली",
    rti: {
      rules: "RTI fee rules followed by the Government of NCT of Delhi",
      rulesHi: "दिल्ली सरकार (GNCTD) द्वारा लागू RTI फ़ीस नियम",
      fee: 10,
      firstAppealFee: 0,
      secondAppealFee: 0,
      verify: true,
      wordLimit: 0,
      payModes: "Indian Postal Order, demand draft, banker's cheque or cash against receipt",
      payModesHi: "भारतीय पोस्टल ऑर्डर, डिमांड ड्राफ्ट, बैंकर्स चेक या रसीद पर नकद",
      payee: "Accounts Officer, <department>",
      payeeHi: "लेखा अधिकारी, <विभाग>",
      portal: null,
      commission: "Central Information Commission (Delhi has no State Information Commission)",
      commissionHi: "केंद्रीय सूचना आयोग (दिल्ली में राज्य सूचना आयोग नहीं है)",
      notes: [
        "Delhi Government departments are not on rtionline.gov.in. File by post or by hand unless the department lists its own online route.",
        "Delhi has no blocks. Address the District Social Welfare Office or the SDM office instead of a block officer.",
      ],
      notesHi: [
        "दिल्ली सरकार के विभाग rtionline.gov.in पर नहीं हैं। डाक से या हाथ से जमा करें, जब तक विभाग अपना ऑनलाइन तरीका न बताए।",
        "दिल्ली में ब्लॉक नहीं हैं। खंड अधिकारी की जगह ज़िला समाज कल्याण कार्यालय या SDM कार्यालय को लिखें।",
      ],
    },
    grievance: {
      label: "Delhi PGMS",
      labelHi: "दिल्ली PGMS",
      url: "https://pgms.delhi.gov.in",
      helpline: "",
    },
    pension: { label: "Delhi e-District", labelHi: "दिल्ली ई-डिस्ट्रिक्ट", url: "https://edistrict.delhigovt.nic.in" },
    consumerState: "Delhi",
    consumerStateHi: "दिल्ली",
    blockOffice: "District Social Welfare Officer / Sub-Divisional Magistrate",
    blockOfficeHi: "ज़िला समाज कल्याण अधिकारी / उपखंड मजिस्ट्रेट",
  },
};

export const CPGRAMS: Link & { helpline: string } = {
  label: "CPGRAMS (central grievances)",
  labelHi: "CPGRAMS (केंद्रीय शिकायत)",
  url: "https://pgportal.gov.in",
  helpline: "",
};

export function stateProfile(code: StateCode): StateProfile {
  return STATE_PROFILES[code];
}

/** RTI rules that apply to a filing: central rules for a central authority, else the state's. */
export function rtiRulesFor(state: StateCode, level: AuthorityLevel): RtiRules {
  return level === "central" ? CENTRAL_RTI : STATE_PROFILES[state].rti;
}

export function stateName(code: StateCode, lang: "hi" | "en"): string {
  const p = STATE_PROFILES[code];
  return lang === "hi" ? p.nameHi : p.name;
}

/** Consumer commission pecuniary limits (Consumer Protection Jurisdiction Rules, 2021), in rupees. */
export const DISTRICT_LIMIT_INR = 50_00_000;
export const STATE_LIMIT_INR = 2_00_00_000;

export type CommissionLevel = "district" | "state" | "national";

export function commissionFor(claimInr: number): CommissionLevel {
  if (!Number.isFinite(claimInr) || claimInr <= DISTRICT_LIMIT_INR) return "district";
  if (claimInr <= STATE_LIMIT_INR) return "state";
  return "national";
}

/**
 * Filing fee at the District Commission by claim value (Consumer Protection
 * (Consumer Disputes Redressal Commissions) Rules, 2020, as reported; verify).
 */
export function districtFilingFee(claimInr: number): number {
  if (!Number.isFinite(claimInr) || claimInr <= 5_00_000) return 0;
  if (claimInr <= 10_00_000) return 200;
  if (claimInr <= 20_00_000) return 400;
  if (claimInr <= 50_00_000) return 1000;
  return 2000;
}

/** Parse "₹1,20,000" / "120000" / "1.2 lakh" into rupees; NaN when unreadable. */
export function parseRupees(raw: string): number {
  const text = String(raw ?? "").toLowerCase().replace(/[₹,\s]/g, "").replace(/rs\.?/g, "");
  if (!text) return Number.NaN;
  const lakh = /^([\d.]+)(lakh|lac|l)$/.exec(text);
  if (lakh) return Math.round(Number(lakh[1]) * 1_00_000);
  const crore = /^([\d.]+)(crore|cr)$/.exec(text);
  if (crore) return Math.round(Number(crore[1]) * 1_00_00_000);
  const n = Number(text);
  return Number.isFinite(n) ? Math.round(n) : Number.NaN;
}

export const NCH: Link & { helpline: string; whatsapp: string } = {
  label: "National Consumer Helpline",
  labelHi: "राष्ट्रीय उपभोक्ता हेल्पलाइन",
  url: "https://consumerhelpline.gov.in",
  helpline: "1915",
  whatsapp: "8800001915",
};

export const E_JAGRITI: Link = {
  label: "e-Jagriti (consumer commission e-filing)",
  labelHi: "ई-जागृति (उपभोक्ता आयोग ई-फ़ाइलिंग)",
  url: "https://e-jagriti.gov.in",
};

export const CIC: Link = {
  label: "Central Information Commission",
  labelHi: "केंद्रीय सूचना आयोग",
  url: "https://cic.gov.in",
};
