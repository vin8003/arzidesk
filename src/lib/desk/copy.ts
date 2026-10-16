import type { OutputLang } from "../lang.ts";
import type { NextActionCode, StepPhase } from "./flows.ts";
import type { Flow, StepKind } from "./types.ts";

type Pair = { en: string; hi: string };

export const FLOW_COPY: Record<Flow, { name: Pair; short: Pair; lead: Pair; steps: Pair }> = {
  money: {
    name: { en: "Government money stuck", hi: "सरकारी पैसा अटका" },
    short: { en: "Money stuck", hi: "पैसा अटका" },
    lead: {
      en: "PM-Kisan, MGNREGA wages or pension not received. Check the public status first, then grievance, then RTI to the block office, then an automatic first appeal.",
      hi: "पीएम-किसान, मनरेगा मज़दूरी या पेंशन नहीं आई। पहले सार्वजनिक स्थिति देखें, फिर शिकायत, फिर ब्लॉक कार्यालय को RTI, फिर अपने आप प्रथम अपील।",
    },
    steps: { en: "Status check → Grievance → RTI after 30 days → First appeal", hi: "स्थिति जाँच → शिकायत → 30 दिन बाद RTI → प्रथम अपील" },
  },
  rti: {
    name: { en: "RTI application", hi: "RTI आवेदन" },
    short: { en: "RTI", hi: "RTI" },
    lead: {
      en: "Central RTI online on rtionline.gov.in, or the state's postal format for UP, Rajasthan, MP and Delhi. Reply and appeal deadlines run on a timer.",
      hi: "केंद्रीय RTI rtionline.gov.in पर ऑनलाइन, या UP, राजस्थान, MP और दिल्ली के लिए राज्य का डाक प्रारूप। जवाब और अपील की समय-सीमा टाइमर पर चलती है।",
    },
    steps: { en: "RTI → First appeal → Second appeal", hi: "RTI → प्रथम अपील → द्वितीय अपील" },
  },
  consumer: {
    name: { en: "Consumer complaint", hi: "उपभोक्ता शिकायत" },
    short: { en: "Consumer", hi: "उपभोक्ता" },
    lead: {
      en: "Fake seeds, a dead product, a refused refund. NCH docket first, then a legal notice, then a District Commission complaint file the citizen can file in person.",
      hi: "नकली बीज, खराब सामान, रिफ़ंड से इनकार। पहले NCH डॉकेट, फिर कानूनी नोटिस, फिर ज़िला आयोग के लिए परिवाद फ़ाइल जिसे नागरिक स्वयं दाखिल करे।",
    },
    steps: { en: "NCH docket → Legal notice → Commission complaint", hi: "NCH डॉकेट → कानूनी नोटिस → आयोग में परिवाद" },
  },
};

export const STEP_COPY: Record<StepKind, { name: Pair; what: Pair }> = {
  status_check: {
    name: { en: "Check public status", hi: "सार्वजनिक स्थिति देखें" },
    what: {
      en: "Look the citizen up on the public portal and record what it says. Many cases are a fix (eKYC, bank seeding), not a complaint.",
      hi: "सार्वजनिक पोर्टल पर नागरिक की स्थिति देखें और दर्ज करें। कई मामलों में शिकायत नहीं, सुधार (eKYC, बैंक सीडिंग) चाहिए।",
    },
  },
  grievance: {
    name: { en: "Grievance", hi: "शिकायत" },
    what: {
      en: "Paste-ready grievance for CPGRAMS or the state portal. Record the registration number; the RTI opens 30 days later if nothing moves.",
      hi: "CPGRAMS या राज्य पोर्टल के लिए तैयार शिकायत। रजिस्ट्रेशन नंबर दर्ज करें; 30 दिन में कुछ न हो तो RTI खुलती है।",
    },
  },
  rti_application: {
    name: { en: "RTI application", hi: "RTI आवेदन" },
    what: {
      en: "Numbered requests for the records, in the right format for the filing route. The reply clock starts on the day it is filed.",
      hi: "रिकॉर्ड के लिए क्रमांकित प्रश्न, दाखिल करने के तरीके के सही प्रारूप में। जवाब की घड़ी दाखिल करने के दिन से चलती है।",
    },
  },
  first_appeal: {
    name: { en: "First appeal", hi: "प्रथम अपील" },
    what: {
      en: "To the First Appellate Authority under s.19(1), within 30 days of the reply or of the missed deadline.",
      hi: "धारा 19(1) के अंतर्गत प्रथम अपीलीय अधिकारी को, जवाब या समय-सीमा चूकने के 30 दिन के भीतर।",
    },
  },
  second_appeal: {
    name: { en: "Second appeal", hi: "द्वितीय अपील" },
    what: {
      en: "To the Information Commission under s.19(3), within 90 days, asking for disclosure, penalty and compensation.",
      hi: "धारा 19(3) के अंतर्गत सूचना आयोग को, 90 दिन के भीतर, सूचना, दंड और क्षतिपूर्ति की माँग के साथ।",
    },
  },
  nch: {
    name: { en: "NCH complaint", hi: "NCH शिकायत" },
    what: {
      en: "Free complaint on the National Consumer Helpline (1915 / WhatsApp 8800001915 / web). Record the docket number.",
      hi: "राष्ट्रीय उपभोक्ता हेल्पलाइन (1915 / व्हाट्सऐप 8800001915 / वेब) पर मुफ़्त शिकायत। डॉकेट नंबर दर्ज करें।",
    },
  },
  legal_notice: {
    name: { en: "Legal notice", hi: "कानूनी नोटिस" },
    what: {
      en: "Demand with 15 days to comply, sent by Speed Post. Record the tracking number and delivery date.",
      hi: "15 दिन में पालन की माँग, स्पीड पोस्ट से। ट्रैकिंग नंबर और डिलीवरी तिथि दर्ज करें।",
    },
  },
  consumer_complaint: {
    name: { en: "Commission complaint file", hi: "आयोग परिवाद फ़ाइल" },
    what: {
      en: "Complaint under s.35 with memo of parties, index, affidavit and list of documents, for the citizen to file in person on e-Jagriti.",
      hi: "धारा 35 के अंतर्गत परिवाद, पक्षकार विवरण, अनुक्रमणिका, शपथ पत्र और दस्तावेज़ सूची के साथ, ई-जागृति पर स्वयं दाखिल करने के लिए।",
    },
  },
};

export const PHASE_COPY: Record<StepPhase, Pair> = {
  upcoming: { en: "Later", hi: "बाद में" },
  ready: { en: "Ready", hi: "तैयार" },
  drafted: { en: "Drafted · not filed", hi: "ड्राफ्ट · दाखिल नहीं" },
  waiting: { en: "Filed · waiting", hi: "दाखिल · प्रतीक्षा" },
  lapsed: { en: "Deadline passed", hi: "समय-सीमा बीती" },
  resolved: { en: "Resolved", hi: "हल" },
  escalate: { en: "Not resolved", hi: "हल नहीं" },
  fix: { en: "Citizen to fix", hi: "नागरिक सुधार करे" },
  skipped: { en: "Skipped", hi: "छोड़ा" },
};

export const ACTION_COPY: Record<NextActionCode, Pair> = {
  check_status: { en: "Check public status", hi: "सार्वजनिक स्थिति देखें" },
  fix: { en: "Citizen fix, then re-check", hi: "नागरिक सुधार करे, फिर जाँचें" },
  draft: { en: "Draft", hi: "ड्राफ्ट करें" },
  file: { en: "File and record", hi: "दाखिल करें और दर्ज करें" },
  wait: { en: "Waiting until", hi: "प्रतीक्षा" },
  record_outcome: { en: "Record the outcome", hi: "परिणाम दर्ज करें" },
  track: { en: "Filed · track hearings", hi: "दाखिल · सुनवाई देखें" },
  close: { en: "Close the case", hi: "केस बंद करें" },
  done: { en: "Nothing pending", hi: "कुछ लंबित नहीं" },
};

export const OUTCOME_COPY: Record<string, Pair> = {
  full: { en: "Full information / relief given", hi: "पूरी सूचना / राहत मिली" },
  partial: { en: "Partial or incomplete", hi: "आंशिक या अधूरी" },
  refused: { en: "Refused / rejected", hi: "इनकार / अस्वीकृत" },
  no_reply: { en: "No reply", hi: "कोई जवाब नहीं" },
  transferred: { en: "Transferred, no information", hi: "स्थानांतरित, सूचना नहीं" },
  resolved: { en: "Resolved", hi: "हल हुआ" },
  unresolved: { en: "Not resolved", hi: "हल नहीं हुआ" },
};

export const MODE_COPY: Record<string, Pair> = {
  central_online: { en: "Online · rtionline.gov.in", hi: "ऑनलाइन · rtionline.gov.in" },
  state_online: { en: "Online · state RTI portal", hi: "ऑनलाइन · राज्य RTI पोर्टल" },
  postal: { en: "Speed Post", hi: "स्पीड पोस्ट" },
  by_hand: { en: "By hand", hi: "हाथ से" },
};

export function t(pair: Pair, lang: OutputLang): string {
  return pair[lang];
}
