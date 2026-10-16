# ArziDesk

Assisted filing desk for **advocates and e-Mitra / CSC operators** in **Uttar Pradesh, Rajasthan, Madhya Pradesh and Delhi**. The operator enters a citizen's facts once; ArziDesk drafts each filing in the right format with Grok, keeps every statutory clock, and drafts the appeal itself when a deadline passes. The operator checks, prints and files. Nothing is filed on anyone's behalf.

English and Hindi (UI and drafts). **Not legal advice.** Drafting assistance only.

Sibling of [CiteBench](https://github.com/vin8003/nyayasetu) and [GSTSlip](https://github.com/vin8003/gstslip). It uses the same stack, the same Grok (xAI) request code, the same Better Auth sign-in and the same Razorpay Checkout.

---

## The three flows

| Flow | Steps | Clocks |
|---|---|---|
| **Government money stuck**: PM-Kisan, MGNREGA wages, old age / widow / disability pension | 1. Check the public status (free, with the right portal links and a list of findings; eKYC or bank seeding is a *fix*, not a complaint) → 2. Grievance (CPGRAMS or the state portal) → 3. RTI to the block office → 4. **Automatic first appeal** → 5. Second appeal | Grievance follow-up 30 days; RTI reply 30 days (35 via APIO, 48 h for life or liberty); first-appeal window 30 days |
| **RTI** | 1. RTI application: **central online** (rtionline.gov.in text, English, ≤ 3,000 chars) or the **state postal format** (UP / Rajasthan / MP / Delhi), or the state online portal where one exists → 2. First appeal → 3. Second appeal | Reply due, first appeal last day, FAA decision (30/45 days), second appeal last day (90 days) |
| **Consumer complaint** | 1. NCH docket text (1915 / WhatsApp 8800001915 / web) → 2. Legal notice (15 days to comply) → 3. **District Commission complaint file** for self-filing on e-Jagriti: cause title, memo of parties, index, complaint under s.35 CPA 2019, verification, affidavit, list of documents | NCH follow-up 30 days; notice 15 days from delivery; two-year limitation (s.69) |

Every step can be drafted early, skipped (where it makes sense), edited freely, copied, or printed on a clean A4 sheet. Filing records (date, registration / docket / Speed Post number, APIO, delivery date) and outcomes (reply received, partial, refused, no reply) drive the next step.

**Automatic first appeal.** On cases with auto-appeal on (default, set when the case is opened), when the RTI reply deadline lapses or the reply is recorded as refused / partial, the first appeal is drafted without a click and charged to the wallet. It runs when the operator opens Today, and daily at 09:00 IST through Vercel Cron (`/api/cron/auto-appeals`, needs `CRON_SECRET`). It never files anything.

Details: [docs/flows.md](docs/flows.md) · state facts and sources: [docs/state-rules.md](docs/state-rules.md).

---

## Paywall: prepaid wallet, pay per draft

| Task | Default price |
|---|---|
| Grievance | ₹15 |
| RTI application | ₹25 |
| First appeal | ₹25 |
| Second appeal | ₹49 |
| NCH complaint text | ₹10 |
| Legal notice | ₹49 |
| Commission complaint file | ₹99 |
| Status check, case records, timers, edits, printing | Free |

- New accounts get a **₹50 welcome credit** (admin can change it).
- Top-ups of **₹100–₹20,000** through Razorpay Standard Checkout (UPI / card / net banking), with one-tap ₹100 / 250 / 500 / 1,000 / 2,000 packs.
- The wallet is **debited before** the Grok call and **refunded automatically** if the call fails or times out.
- The **first redraft** of each step is free; later redrafts are charged again.
- **Government fees are never collected.** The citizen pays the ₹10 RTI fee (or the state's appeal fee) directly. This keeps the operator's service charge a separate line and the fee a pass-through at cost (GST "pure agent" rule).
- Prices and the welcome credit are editable in **/admin/prices**; admins can credit any wallet in **/admin/users**.

Details: [docs/wallet.md](docs/wallet.md).

---

## Trust rules

- **Grok only**, through the same `POST https://api.x.ai/v1/responses` call, strict JSON schema, legacy-body fallback and one repair retry as CiteBench (`src/lib/ai/*`). Drafts use **no tools and no web search**.
- The model writes only the subject, body, numbered points and prayer. **Addresses, parties, dates, fee lines and signature blocks come from the case record** (`src/lib/desk/assemble.ts`), so a draft cannot carry an invented address or reference number. Missing facts become `[placeholders]` and warnings.
- **Mobile, email and BPL card number are never sent to the model.** They are printed on the document locally.
- RTI drafts ask for the applicant's **own records**, because of the DPDP-amended s.8(1)(j) (in force since 13 Nov 2025). Third-party questions are flagged.
- No portal logins, no CAPTCHA handling, no auto-filing. The operator files with the citizen present.
- State fees and portals that secondary sources disagree on are marked **"confirm locally"** in the UI ([docs/state-rules.md](docs/state-rules.md)).

---

## Quick start

```bash
git clone https://github.com/vin8003/arzidesk.git
cd arzidesk
npm install
npm run dev
```

Open [http://localhost:8080](http://localhost:8080), register any username, then use **New filing → Fill a sample**.

| You want | Set |
|---|---|
| Click through locally (in-memory DB, free preview top-ups) | Nothing |
| Real drafts | `XAI_API_KEY` |
| Real top-ups | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` (optional `RAZORPAY_WEBHOOK_SECRET`) |
| Persistent data (deploy) | `DATABASE_URL` |
| Google / X sign-in on a real domain | `GROK_AUTH_*`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET` (same as CiteBench) |
| Admin desk in production | `ADMIN_EMAILS` |
| Daily auto-appeal sweep | `CRON_SECRET` |

Without `XAI_API_KEY`, drafting returns "AI is not connected yet" and **nothing is charged**. Everything else works.

See [.env.example](.env.example) and [docs/local-development.md](docs/local-development.md).

---

## Commands

```bash
npm run dev          # Vite on 0.0.0.0:8080
npm run typecheck    # tsc --noEmit
npm run test:unit    # flows, timers, prompts, document assembly, wallet, states, AI helpers, auth
npm test             # scripts tests (need the .grok/ sandbox fixtures) + test:unit
npm run lint
npm run build        # Vercel output (Mumbai region, 180 s functions, daily cron), then migrate
```

---

## How the pieces fit

```text
Browser (TanStack Start + React, Tailwind v4, CiteBench design system)
  ├── Today       needs action (overdue first) · waiting on government · start a flow
  ├── Cases       filter by flow / state / status, search
  ├── New filing  flow → state → citizen → facts (samples for each flow)
  ├── Case file   step rail: guide (portal, fee, rules) · draft · edit · print · filing record · outcome · history
  ├── Wallet      balance · top-up packs · price list · ledger
  └── Admin       stats · operators (credit) · prices
Server functions (authMiddleware, every query scoped by user id)
  ├── desk/store          cases, steps, events, dashboard
  ├── desk/draft          wallet debit → Grok /v1/responses → assemble → save (refund on failure)
  ├── desk/automation     automatic first appeals (Today + /api/cron/auto-appeals)
  ├── wallet/store        wallet, top-up (Razorpay / preview), verified credit
  └── admin/store         stats, operators, credit, prices
Pure modules (unit-tested): desk/flows · desk/timers · desk/states · desk/schemes · desk/draft-prompt · desk/assemble · wallet/pricing
```

Schema: `migrations/0001_auth.sql` (Better Auth), `0002_wallet.sql` (wallets, ledger, orders, settings), `0003_cases.sql` (cases, steps, events). Architecture: [docs/architecture.md](docs/architecture.md).

---

## Disclaimer

ArziDesk is not a lawyer and not a filing system. Every draft must be checked against the citizen's documents and the office's current rules before it is signed and filed. Fees and portal details change; the ones marked "confirm locally" are known to vary.
