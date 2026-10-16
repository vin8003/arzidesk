# Flows, steps and clocks

Code: `src/lib/desk/flows.ts` (step order, phases, next action), `src/lib/desk/timers.ts` (dates), tests in `flows.test.ts` and `timers.test.ts`.

## Step phases

| Phase | Meaning |
|---|---|
| `ready` | Draft (or do) it now |
| `upcoming` | An earlier step may still solve the problem; can be started early |
| `drafted` | Draft exists, not filed |
| `waiting` | Filed, inside the reply / decision / notice period |
| `lapsed` | That period ran out with no outcome recorded; the next step opens |
| `escalate` | Unhelpful outcome (partial, refused, no reply, unresolved); the next step opens |
| `resolved` | Full information / relief; the case can close |
| `fix` | Status check found something the citizen fixes (eKYC, bank seeding) |
| `skipped` | Operator skipped it; the next step opens |

The case's **next action** is the first actionable step: check status, citizen fix, draft, file, wait until a date, record an outcome, track hearings, or close. The dashboard sorts overdue items first, then by date.

## 1. Government money stuck

| # | Step | What the desk gives | Opens the next step when |
|---|---|---|---|
| 1 | Status check (free) | Public status links for the scheme and state, what to look up, a list of findings with fixes | A finding that needs escalation is recorded |
| 2 | Grievance (₹15) | Paste-ready text for CPGRAMS (central department) or the state portal (IGRS / Jansunwai, Rajasthan Sampark, MP CM Helpline, Delhi PGMS) | Not resolved 30 days after filing, or recorded unresolved |
| 3 | RTI to the block office (₹25) | Numbered requests for the applicant's own file: status, file notings, reasons recorded, officer names, action on the grievance, payment / FTO details. Suggested PIO offices per scheme and state | Reply deadline lapses, or the reply is partial / refused |
| 4 | First appeal (₹25, **automatic**) | Grounds tied to s.7(1), s.7(2), s.7(8), s.7(6) and the reply text point by point | FAA's 30 days lapse, or the order is unhelpful |
| 5 | Second appeal (₹49) | To the State Information Commission (Central for central authorities and for Delhi) | — |

Schemes and findings: `src/lib/desk/schemes.ts`.

## 2. RTI

Filing route per application:

- **Central online** (`central_online`): only the English request text for rtionline.gov.in, kept under ~2,800 characters; the UI flags non-ASCII characters and length. Name, address and fee go in the portal's own fields.
- **State postal / by hand**: full application in the state format (header naming the state rules, PIO address, applicant details, numbered points, fee line or BPL exemption, citizenship line, enclosures, signature block). UP's 500-word cap is checked.
- **State online**: UP and MP have state RTI portals. Same text as postal, without the printed chrome.

Then first appeal → second appeal, as in the money flow.

## 3. Consumer complaint

| # | Step | Notes |
|---|---|---|
| 1 | NCH (₹10) | Text for the NCH form; record the docket number. Follow up after 30 days. Can be skipped. |
| 2 | Legal notice (₹49) | From the advocate (if named on the case) or the complainant. Demand within 15 days of receipt; record Speed Post tracking and delivery date. |
| 3 | Commission complaint file (₹99, reasoning model) | Cause title, memo of parties, index, complaint (facts, deficiency, pre-litigation, cause of action, jurisdiction, limitation, fee), prayer, verification, affidavit, list of documents. Pecuniary level and fee from the claim value; two-year limitation from the cause date. For self-filing on e-Jagriti. |

## Automatic first appeal

`src/lib/desk/automation.server.ts` drafts up to 3 due appeals per operator when Today loads (throttled to once per 30 minutes per browser session), and up to 5 per operator in the daily cron (`/api/cron/auto-appeals`, 03:30 UTC). An appeal blocked by an empty wallet shows a top-up prompt on Today.
