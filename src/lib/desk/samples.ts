import { emptyApplicant, emptyDetails, type Applicant, type CaseDetails, type Flow, type Scheme, type StateCode } from "./types.ts";

/** Fictional citizens for trying a flow end to end. Names and numbers are made up. */
export type Sample = { state: StateCode; scheme: Scheme | null; applicant: Applicant; details: CaseDetails };

export const SAMPLES: Record<Flow, Sample> = {
  money: {
    state: "UP",
    scheme: "pmkisan",
    applicant: {
      ...emptyApplicant(),
      name: "Ramesh Kumar",
      relation: "S/o Shri Mohan Lal",
      village: "Village Rampur",
      block: "Block Sadar",
      district: "Sitapur",
      pincode: "261001",
      mobile: "9000000001",
    },
    details: {
      ...emptyDetails(),
      beneficiaryId: "UP000000000 (sample)",
      amountStuck: "Last 3 instalments of ₹2,000 each",
      since: "February 2026",
      facts:
        "Received instalments regularly till 2025. eKYC was done at the CSC in January 2026. Since February 2026 no instalment has come. The status page shows land seeding as No although the khatauni is in his name. He went to the tehsil twice; no written answer was given.",
      authorityLevel: "state",
      authority: "Agriculture Department, Uttar Pradesh",
      pioAddress: "Public Information Officer, Office of the Deputy Director (Agriculture), Sitapur, Uttar Pradesh",
    },
  },
  rti: {
    state: "RJ",
    scheme: null,
    applicant: {
      ...emptyApplicant(),
      name: "Sunita Devi",
      relation: "W/o Shri Bhanwar Lal",
      village: "Village Khera",
      block: "Panchayat Samiti Bassi",
      district: "Jaipur",
      pincode: "303301",
      mobile: "9000000002",
      bpl: true,
      bplCard: "BPL-0000 (sample)",
    },
    details: {
      ...emptyDetails(),
      authorityLevel: "state",
      authority: "Panchayat Samiti Bassi (MGNREGA)",
      pioAddress: "Public Information Officer, Office of the Vikas Adhikari, Panchayat Samiti Bassi, District Jaipur, Rajasthan",
      faaAddress: "First Appellate Authority, Office of the Chief Executive Officer, Zila Parishad, Jaipur, Rajasthan",
      infoWanted:
        "Why her wages for 24 days of work in June 2026 (muster roll for the pond deepening work) are not paid; copies of the muster roll, wage list and FTO; which officer is holding it.",
      facts: "She worked 24 days in June 2026 on the pond deepening work in Village Khera. Job card number is on the card (sample). Wages not received till date.",
    },
  },
  consumer: {
    state: "MP",
    scheme: null,
    applicant: {
      ...emptyApplicant(),
      name: "Mahesh Patel",
      relation: "S/o Shri Gopal Patel",
      village: "Village Sanwer",
      district: "Indore",
      pincode: "453551",
      mobile: "9000000003",
    },
    details: {
      ...emptyDetails(),
      opponent: "Sample Seeds Pvt. Ltd. (fictional)",
      opponentAddress: "Plot 00, Industrial Area, Indore, Madhya Pradesh",
      product: "Soybean seed, 4 bags of 30 kg, lot no. on the bag tag",
      purchaseOn: "2026-06-10",
      amountPaid: "9,600",
      claimValue: "1,80,000",
      reliefWanted: "Refund of ₹9,600, compensation of ₹1,50,000 for 3 acres of crop loss, ₹20,000 for harassment and ₹10,000 costs",
      causeOn: "2026-07-20",
      documents: "Bill from the dealer, bag tags with lot number, photos of the field, agriculture officer's field inspection note",
      facts:
        "Bought certified soybean seed from the company's authorised dealer. Sowed 3 acres in late June. Germination below 30% across the field. The agriculture department's field inspection on 20 July 2026 recorded poor germination. The company's toll-free number registered a complaint but nobody came.",
    },
  },
};
