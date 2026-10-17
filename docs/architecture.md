# Architecture

Same template and stack as CiteBench (`vin8003/nyayasetu`) and GSTSlip (`vin8003/gstslip`): TanStack Start (React 19, file routes, server functions), Tailwind v4 with the CiteBench design tokens, Better Auth, PGLite locally / Postgres (Neon) deployed, Nitro → Vercel (`bom1`).

## Copied unchanged from CiteBench

| Area | Files |
|---|---|
| Auth | `src/lib/auth/*` (Better Auth + Grok broker for Google / X, email-or-username + password via `src/lib/seed-user.ts`, bearer token in the live preview, same-site checks), `src/routes/api/auth/$.ts`, `src/routes/login.tsx` (rebranded) |
| AI | `src/lib/ai/models.ts`, `xai-response.ts`, `retry.ts` (`sendWithFallback`), `schema.ts`, `json.ts` — call sites `fetch("https://api.x.ai/v1/responses")` with `Authorization: Bearer $XAI_API_KEY` exactly as CiteBench's letter drafter |
| Database | `src/lib/db.ts`, `scripts/migrate.mjs`, `migrations/0001_auth.sql` |
| Payments | `src/lib/billing/signatures.ts`, `checkout.ts`, `live.ts`, `razorpay.server.ts` (orders, verification, webhook; subscription code removed) |
| Platform | `vite.config.ts`, `scripts/*`, `server/*`, `public/__grok/*`, PWA plugin |

`src/lib/ai/context.ts` now carries RTI, consumer-protection and scheme context instead of criminal-law context.

## New

| Module | Role |
|---|---|
| `src/lib/desk/types.ts` | Flows, states, step kinds, case / step / draft shapes |
| `src/lib/desk/states.ts`, `schemes.ts` | Per-state RTI and grievance facts; scheme status links, findings, PIO suggestions |
| `src/lib/desk/flows.ts`, `timers.ts` | Pure flow engine and statutory date math |
| `src/lib/desk/draft-prompt.ts` | System prompt, per-kind instructions, user message (no contact data), JSON schema, request body |
| `src/lib/desk/assemble.ts` | Deterministic document chrome per kind and language |
| `src/lib/desk/draft.ts` → `draft.server.ts` | Debit → Grok → parse → assemble → save; refund on failure |
| `src/lib/desk/automation.ts` → `automation.server.ts` | Automatic first appeals |
| `src/lib/desk/store.ts`, `rows.server.ts`, `schema.ts` | Case CRUD, steps, events, dashboard; zod validation |
| `src/lib/wallet/*` | Pricing, ledger, top-ups, client hook |
| `src/lib/admin/*` | Allowlist, guard, stats, operators, prices |
| `src/lib/automation/{types,recipes,payload,jobs,offers,fingerprint,match,receipt,verify}.ts` | Pure, shared with the companion: job lifecycle, recipe registry, case → portal payload, offers, drift fingerprints, option matching, page parsers, read-back |
| `src/lib/automation/store.ts`, `rows.server.ts` | Case-page server functions; jobs, devices, pairing, reconcile, recipe health |
| `src/lib/automation/runner-http.server.ts`, `src/routes/api/runner.*` | Companion API (device token): pair, claim, progress, artifacts, finish, manifest, recipe, map, canary |
| `src/lib/automation/repair.server.ts`, `mapper.server.ts`, `recipe-files.server.ts` | Drift → GitHub dispatch and redacted bundle; Grok field mapper; recipe sources and manifest |
| `companion/` | Kiosk program: kit, gates overlay, loader, runner, canary, recipes (`read/`, `submit/`), mock portal tests |

Portal automation in full: [automation.md](automation.md).

Files named `*.server.ts` are only imported lazily inside server-function handlers or API routes, so nothing server-only reaches the browser bundle.

## Data

```text
cases        id, user_id, flow, state, lang, title, scheme, status, outcome,
             applicant jsonb, details jsonb, auto_appeal, next_action, next_on
case_steps   id, case_id, user_id, kind (unique per case), status, doc jsonb, doc_text,
             generations, filed_on, reference, mode, via_apio, delivered_on,
             reply_on, reply_text, outcome, notes
case_events  id, case_id, user_id, kind, text, created_at
wallets      user_id, balance_paise
runner_devices, runner_pairings          kiosk companions (token hash), one-time pairing codes
filing_jobs  id, case_id, step_kind, recipe_id, recipe_version, status, payload, redact,
             gate, result, failure, device_id, submit_started_at
job_events, job_artifacts, recipe_health
wallet_ledger, wallet_orders, app_settings
```
