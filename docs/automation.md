# Assisted filing automation

ArziDesk files on the portals itself. A **companion** on the kiosk PC drives a real Chrome window through each portal. The operator steps in only for what a machine must not do: **credentials, captchas, OTPs, payments, and accepting a portal's terms**. Everything else is automated: navigation, form filling, dropdown matching, read-back checks, receipt capture, and status tracking. When a portal changes and an integration breaks, the break is detected, the recipe is rewritten, and the new version is shipped.

## Decisions

| Question | Decision |
|---|---|
| Where the browser runs | **Local companion** on the operator's PC (Node + Playwright, headed Chrome, persistent profile). It uses the kiosk's Indian IP, the operator sees the real window, and nothing sensitive passes through ArziDesk servers. |
| Who handles the human gates | **The operator at the kiosk**, with the citizen present for OTPs. |
| Repair autonomy | **Auto-merge for read-only recipes**, human review for anything that can submit. |
| First real submit target | **Central RTI** on rtionline.gov.in. |

## How it fits

```text
ArziDesk (Vercel)                                 Kiosk PC
┌───────────────────────────────┐        ┌─────────────────────────────────────┐
│ Case page                     │        │ arzidesk companion (npm run         │
│  └ "File automatically" ──────┼─queue──┼▶ companion -- run)                  │
│ filing_jobs / job_events      │◀─poll──┤  ├ claims job, gets portal payload  │
│ job_artifacts / recipe_health │        │  ├ loads recipe (sha-256 checked)   │
│ /api/runner/* (device token)  │◀events─┤  ├ drives Chrome, overlay for gates │
│                               │        │  └ uploads redacted artifacts,      │
│ receipt → case_steps.filed_on │◀finish─┤     receipt, field inventories      │
│ timers + auto-appeal run      │        └─────────────────────────────────────┘
└──────────┬────────────────────┘
           │ recipe drift (repository_dispatch, redacted bundle only)
           ▼
GitHub: recipe-repair → PR → CI → auto-merge (read/) or review (submit/)
```

### Jobs

`filing_jobs` holds one row per attempt at one portal action for one case step. Each job has a state:

```text
queued → running ⇄ waiting_human → submitting → succeeded
                 ↘ failed                     ↘ needs_reconcile
         cancelled (operator, any time before submitting)
```

- The **payload** is built on the server from the case record when the job is queued (`src/lib/automation/payload.ts`). It contains only what the portal's fields take. The model never decides what goes where.
- **`submitting`** is reported *before* the irreversible click. If anything goes wrong after that point (a crash, a timeout, an unreadable result), the job becomes **`needs_reconcile`** and is never retried. rtionline.gov.in states that registration numbers can take 24–48 working hours to appear after payment and that paying again must be avoided. The operator then runs the read-only "payment reconciliation" recipe or records the outcome by hand.
- A step that already has a filing date cannot get another submit job, and only one active job can exist per case step (a partial unique index enforces this).
- On success the receipt is written back to `case_steps` (`filed_on`, `reference`, `mode`). The statutory timers and the automatic first appeal then run as before.

### Human gates

A recipe calls `ctx.gate(kind, message, { until })`. The companion then:

1. reports `waiting_human` with the gate kind, which the case page shows ("Needs you: type the security code in the companion window"),
2. shows an overlay inside the portal tab with the instruction and a **Continue** button,
3. resumes as soon as the `until` condition holds (for example, the OTP field appeared or the payment page returned) or the operator presses Continue.

| Gate | Example |
|---|---|
| `accept_terms` | Tick rtionline's "I have read and understood the guidelines" |
| `login` | A portal password (never seen or stored by ArziDesk) |
| `captcha` | Security code images |
| `otp` | Codes sent to the citizen's email or mobile |
| `payment` | SBI ePay / UPI for the ₹10 RTI fee (pass-through, never collected by ArziDesk) |
| `assist` | Fallback when a recipe cannot place a value: the overlay shows the value and the field to put it in |

Gates time out after 15 minutes. The job then fails cleanly, or becomes `needs_reconcile` if submission had already started.

### Recipes

A recipe is a self-contained TypeScript module in `companion/recipes/{read,submit}/`. It exports `{ id, version, run, canary? }` and imports nothing at runtime. The kit (`companion/src/kit.ts`) is passed in as `ctx`:

- `ctx.field(key, labelPattern)` finds an input by its visible label, including the table layouts NIC portals use (`<th>label</th><td><input>`), then falls back to name or id. It never relies on a full CSS path.
- `ctx.fill`, `ctx.choose` (fuzzy option matching, then the server's field mapper, then an `assist` gate), `ctx.check`.
- `ctx.checkpoint(stepId)` records a **field inventory** (labels, types, names, option lists; never values). It feeds drift detection.
- `ctx.verify(expected)` reads every field back from the DOM and aborts on any mismatch before submitting.
- `ctx.submit(label, fn)` marks the irreversible boundary.
- `ctx.text()` and `ctx.artifact()` capture receipts.

The registry (`src/lib/automation/recipes.ts`) is the single list of recipe ids, versions, kinds and file paths. The server serves recipe sources from `/api/runner/recipes`, and the companion verifies each file's SHA-256 against the manifest and, when a public key is pinned, its Ed25519 signature. It then caches and imports the file. A repaired recipe reaches every kiosk on the next job, with no reinstall.

| Recipe | Kind | Gates | Writes back |
|---|---|---|---|
| `rtionline.status` | read | captcha, otp | Reply text and date when disposed of; status in notes |
| `rtionline.reconcile` | read | captcha, otp | Registration number for a `needs_reconcile` job |
| `pmkisan.status` | read | captcha, otp | Status-check finding (eKYC, bank seeding, land seeding…) |
| `rtionline.file_rti` | submit | accept_terms, otp, captcha, payment | `filed_on`, registration number, receipt |

### Self-healing

1. **Fingerprints.** Every checkpoint sends its field inventory. `recipe_health` keeps the last inventory that led to success for each recipe step. A changed fingerprint on a failure is classified as **drift**, not a one-off.
2. **Canaries.**
   - The companion runs each recipe's `canary()` once a day when idle. The canary opens the public pages and checkpoints them. It never ticks terms boxes, types captchas or submits.
   - `.github/workflows/recipe-canary.yml` does the same headless from CI against the baselines committed in `companion/recipes/fixtures/<recipe>/baseline.json` (written with `canary --offline --write-baseline`).
   - A NIC site that blocks the CI IP reports `unreachable`, not drift.
3. **Runtime fallback.** A field the recipe cannot place goes to `/api/runner/map-fields`. That endpoint sends Grok the field labels, option lists and payload key names, never the values, and gets back a mapping. If that fails too, the operator gets an `assist` gate. A live filing should not die because a label changed.
4. **Repair pipeline.**
   - A drift failure or canary failure fires `repository_dispatch` (`recipe-broken`) with a **redacted** bundle (`/api/automation/repair-bundle/:jobId`): the error, the step, the current and last-good inventories, and the DOM with every input value and every payload string stripped. Screenshots never leave the operator's account.
   - `.github/workflows/recipe-repair.yml` runs Claude Code on that bundle. Claude updates the recipe and its fixture, bumps the version, runs `npm run companion:test`, and opens a PR.
5. **Merge policy.** `scripts/recipe-pr-class.mjs` classifies the PR from its changed paths:
   - **read**: only `companion/recipes/read/**`, their fixtures, and the matching registry version bump. Auto-merge is enabled once CI is green.
   - **submit or anything else**: labelled `needs-human-review`, with CODEOWNERS review required.

   Branch protection with required checks must be switched on in the GitHub settings for auto-merge to wait for CI.

### Privacy and trust

- Credentials, OTPs and card or UPI details are typed by the operator into the portal. ArziDesk never receives them. The Chrome profile on the kiosk keeps portal sessions, so logging in is not needed every time.
- Payloads travel only to the operator's own paired companion, which authenticates with a device token stored as a SHA-256 hash and can be revoked.
- Artifacts are capped at 1.5 MB each. Screenshots and receipts are visible only to the operator's account. DOM snapshots are redacted on the kiosk before upload.
- The model still never sees mobile, email or BPL numbers. The field mapper receives labels and key names only.

## Portal notes (recon 17 Oct 2026, public pages only)

**rtionline.gov.in** (DoPT, NIC, "Version 2.0")
- Filing works without a login. The path is `guidelines.php?request` → tick `CHECKBOX_1` → `request/request_email_check.php` (email, then an OTP) → the request form → **Make Payment** (non-BPL) → SBI gateway → registration number. BPL applicants upload a BPL certificate and pay nothing.
- The request text is limited to 3,000 characters, using only `A-Z a-z 0-9` and `, . - _ ( ) / @ : & ? \ %`. A longer text goes as a PDF supporting document whose file name has no spaces. Aadhaar and PAN must not be uploaded.
- **View Status** (`request/status.php`) takes `registration_no` (max 21), `Email` and a captcha `6_letters_code`, then sends an OTP to the email and mobile.
- **Payment Reconciliation** (`request/status_pendingPayment.php`) takes `Email` and `cell` (mobile) plus a captcha, then an OTP.
- A first appeal needs the registration number and email of the online request, and is allowed only after 30 days or after a reply.
- Labels are `<th>` cells beside `<td>` inputs, not `<label>` elements.
- The request form sits behind the guidelines tick, so it was **not** inspected. The mock portal (`companion/test/mock-portal.ts`) simulates it from the documented field list and is marked SIMULATED. The recipe finds every control by label, and the first live run's checkpoints become its known-good shape in `recipe_health`.
- PM-Kisan answers HTTP 500 to a `HeadlessChrome` user agent. The companion runs headed Chrome, and canaries present a normal Chrome UA.

**pmkisan.gov.in**
- **Know Your Status** (`BeneficiaryStatus_New.aspx`) takes the registration number (`ContentPlaceHolder1_txtBox`, max 12) and a captcha, then "Get OTP" to the registered mobile.

## Running it

```bash
# In ArziDesk: Companion → "Connect a kiosk PC" shows a pairing code.
npm run companion -- pair ABCD-1234 --server https://arzidesk.example
npm run companion -- run            # leave it running; it opens Chrome when a job arrives
npm run companion -- canary         # check every recipe's public pages now
npm run companion:test              # every recipe end to end in headless Chrome against the mock portal
# Live check of the whole loop against a running ArziDesk, with the mock portal standing in for the real ones:
ARZIDESK_HOME=<paired home> node companion/test/e2e-server.ts [count] [--pending]
```

Environment on the server:

| Variable | For |
|---|---|
| `XAI_API_KEY` | Runtime field mapper (optional; without it, unmatched fields become `assist` gates) |
| `GITHUB_REPAIR_TOKEN`, `GITHUB_REPAIR_REPO` | Fire `recipe-broken` dispatches (`owner/repo`; fine-grained token with Contents read and write on this repo, which `repository_dispatch` requires) |
| `REPAIR_BUNDLE_SECRET` | Bearer secret the repair workflow uses to fetch redacted bundles |

Repository secrets:
- `ANTHROPIC_API_KEY` for the repair agent.
- `ARZIDESK_URL` and `REPAIR_BUNDLE_SECRET` for fetching the redacted bundle.
- `REPAIR_PR_TOKEN`: a fine-grained token with Contents and Pull requests write. PRs opened with the default `GITHUB_TOKEN` do not trigger CI, so auto-merge would wait forever.

Repository settings:
- Turn on **Allow auto-merge**.
- Protect `main`, with the `ci / check` status required.
- Turn on **Require review from Code Owners**, so `CODEOWNERS` actually holds submit-path repairs for review.

Recipe signing (optional, recommended before real kiosks):
1. Run `node scripts/sign-recipes.mjs keygen` once and keep the private key off the server.
2. Pair kiosks with `ARZIDESK_RECIPE_PUBLIC_KEY` set to the printed public key.
3. Run `RECIPE_SIGNING_KEY=… npm run recipes:sign` for each release, which writes `companion/recipes/signatures.json`.

A kiosk with a pinned key refuses unsigned recipes, so sign every merged repair before kiosks can run it.

## Phases

| Phase | Scope | State |
|---|---|---|
| 0 | Recon of rtionline and PM-Kisan public pages | Done (above) |
| 1 | Jobs, device pairing, runner API, companion, gates, overlay, read recipes, fingerprints, canaries, repair and merge pipeline | Built |
| 2 | `rtionline.file_rti` submit path with read-back verification, submit boundary, reconcile | Built; the first live run must be watched, because the form was not reachable without accepting the guidelines |
| 3 | rtionline first appeal, CPGRAMS grievance | Next |
| 4 | e-Jagriti complaint, NCH docket (document store needed for uploads) | Later |
| 5 | State RTI portals (UP, RJ, MP, DL) where online filing exists | Later |

Known gaps:
- The BPL certificate upload is an `assist` gate until citizen documents are stored.
- The companion needs Node 24 or newer (it runs TypeScript directly) and `npm install` on the kiosk. A one-file installer is the next packaging step.
- There is no per-filing automation price yet; filings are free beyond the draft.

## Verified so far (17 Oct 2026)

- **Unit tests** (`npm run test:unit`, `src/lib/automation/*.test.ts`) cover payload building and the portal character set, the job lifecycle (no clean failure after the submit click), offers, fingerprints and diffs, read-back, the receipt and status parsers, and option matching.
- **Recipe tests** (`npm run companion:test`) run every recipe in headless Chrome against the mock portal, with a test operator at each gate. They cover:
  - a full central RTI filing, and a BPL filing with the card attached;
  - a wrong security code at the email check and at the form (the submit boundary is lifted);
  - a renamed field rescued through the assist gate and flagged for repair;
  - payment taken with no registration number, which ends in `after_submit_unknown`;
  - a value the portal truncates, which stops before the submit click;
  - status, reconciliation, PM-Kisan, canaries, redaction, and the loader's hash and signature checks.
- **The live loop**, run against the dev server and the mock portal:
  - The operator queues the job from the case page, and a paired companion claims it.
  - The recipe is fetched through the manifest with its SHA-256 checked, and the filing runs.
  - The receipt is stored, and the step shows the filing date, the registration number and "reply due" without a reload.
  - A follow-up status check writes the reply into the step.
  - A stuck payment becomes "check before retrying", blocks a second filing, and is settled by the reconciliation recipe.
- **Real portals**: the canaries load all four public pages and match their committed baselines.
- **Not verified**: the RTI Online request form, the email OTP page and the payment return page on the real portal. They sit behind the guidelines tick and a real payment. The first live filing should be watched end to end; its checkpoints then become the baseline.

