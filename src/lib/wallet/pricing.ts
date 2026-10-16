import type { DraftKind } from "../desk/types.ts";

/**
 * Prepaid wallet. Every AI draft debits a fixed task price; the status check,
 * filing records, timers and printing are free. The first regeneration of a
 * draft is free, later ones are charged again. Government fees are never
 * collected here: the operator pays them on the portal or by postal order and
 * shows them to the citizen as a separate line.
 */

export const PAISE = 100;

export const DEFAULT_PRICES_INR: Record<DraftKind, number> = {
  grievance: 15,
  rti_application: 25,
  first_appeal: 25,
  second_appeal: 49,
  nch: 10,
  legal_notice: 49,
  consumer_complaint: 99,
};

export type PriceList = Record<DraftKind, number>;

/** Credit given once to a new account, in rupees. */
export const DEFAULT_WELCOME_INR = 50;

/** One-tap top-up amounts, in rupees. */
export const TOPUP_PACKS_INR = [100, 250, 500, 1000, 2000] as const;
export const MIN_TOPUP_INR = 100;
export const MAX_TOPUP_INR = 20_000;

/** Free regenerations per step before the price applies again. */
export const FREE_REGENERATIONS = 1;

export const MAX_TASK_PRICE_INR = 2_000;

export type LedgerKind = "welcome" | "topup" | "debit" | "refund" | "grant";

export type LedgerEntry = {
  id: string;
  kind: LedgerKind;
  amountPaise: number;
  balanceAfterPaise: number;
  task: string | null;
  caseId: string | null;
  note: string;
  createdAt: string;
};

export type WalletSnapshot = {
  balancePaise: number;
  prices: PriceList;
  welcomeInr: number;
  /** True when Razorpay keys are set — top-up opens Checkout. */
  paymentsLive: boolean;
  /** "preview" credits without charging (no database URL, no keys); "unset" refuses. */
  topupMode: "razorpay" | "preview" | "unset";
  recent: LedgerEntry[];
};

export function inrToPaise(inr: number): number {
  return Math.round(inr * PAISE);
}

export function formatInr(paise: number): string {
  const rupees = paise / PAISE;
  const whole = Number.isInteger(rupees);
  return `₹${rupees.toLocaleString("en-IN", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** Clamp an admin-entered price; bad input falls back to the default. */
export function parsePrice(raw: unknown, fallback: number): number {
  const n = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(MAX_TASK_PRICE_INR, Math.round(n));
}

export function parsePriceList(raw: unknown): PriceList {
  let obj: Record<string, unknown> = {};
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object") obj = parsed as Record<string, unknown>;
    } catch {
      obj = {};
    }
  } else if (raw && typeof raw === "object") {
    obj = raw as Record<string, unknown>;
  }
  const out = { ...DEFAULT_PRICES_INR };
  for (const key of Object.keys(DEFAULT_PRICES_INR) as DraftKind[]) {
    if (key in obj) out[key] = parsePrice(obj[key], DEFAULT_PRICES_INR[key]);
  }
  return out;
}

export function parseWelcome(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
  if (raw === undefined || raw === null || String(raw).trim() === "" || !Number.isFinite(n) || n < 0) {
    return DEFAULT_WELCOME_INR;
  }
  return Math.min(1_000, Math.round(n));
}

/** Top-up amount in rupees from the browser; throws on anything outside the allowed range. */
export function parseTopup(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
  if (!Number.isFinite(n) || !Number.isInteger(n)) throw new Error("Enter a whole rupee amount.");
  if (n < MIN_TOPUP_INR) throw new Error(`Minimum top-up is ₹${MIN_TOPUP_INR}.`);
  if (n > MAX_TOPUP_INR) throw new Error(`Maximum top-up is ₹${MAX_TOPUP_INR.toLocaleString("en-IN")}.`);
  return n;
}

/** Price of the next generation of a step: free for the first FREE_REGENERATIONS re-drafts. */
export function chargeFor(price: number, generationsSoFar: number): number {
  if (generationsSoFar <= 0) return price;
  return generationsSoFar <= FREE_REGENERATIONS ? 0 : price;
}
