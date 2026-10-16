# Local development

```bash
npm install
npm run dev     # http://localhost:8080
```

No env needed: the in-memory PGLite database applies `migrations/*.sql` on boot (and is wiped on restart), sign-in works with any username + 8-character password, top-ups credit the wallet without payment, and each new account gets the welcome credit. A throwaway local account such as `qa-operator` / `qa-local-only-2026` is fine; it disappears with the dev server.

Use **New filing → Fill a sample** for a ready-made case in each flow (fictional citizens).

## Trying drafts without spending xAI credit

Set `XAI_API_KEY` for real drafts. To click through the draft → debit → auto-appeal path with no key, preload a fetch stub that answers `https://api.x.ai/v1/responses` with a canned JSON draft:

```bash
XAI_API_KEY=local-stub NODE_OPTIONS="--import ./path/to/your-stub.mjs" npm run dev
```

The stub only needs to return `{ "output_text": "<JSON matching DRAFT_JSON_SCHEMA>" }`. Nothing in the app changes for this.

## Auto-appeal locally

Open an RTI case, draft it, and mark it filed with a date more than 30 days ago. Opening Today drafts the first appeal (once per 30 minutes per browser session; clear `sessionStorage["arzidesk.auto-run"]` to rerun).

## Tests

```bash
npm run typecheck
npm run test:unit
```

`npm test` also runs `scripts/**/*.test.mjs`, which expect the `.grok/` sandbox fixtures (gitignored).

## Deploy (Vercel)

`npm run build` writes `.vercel/output` (Mumbai, 180 s functions, daily cron at 09:00 IST) and migrates `DATABASE_URL` if set. Set `XAI_API_KEY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `DATABASE_URL`, the auth variables (same as CiteBench), `ADMIN_EMAILS` and `CRON_SECRET`.
