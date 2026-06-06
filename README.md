# Market Pulse

Local market-intelligence & competitor-popularity tracking for **Inside Track
Garage Door**. Standalone module — its own `market_pulse` Postgres schema, its own
roles, no contact with the Operations Hub (scheduling, HCP, inspections, invoices,
payroll, job workflow).

It answers: **who is winning the local garage-door conversation online, where, why
homeowners recommend them, how fast rivals respond, and where Inside Track has
openings.** It is not a posting tool — nothing is published without human approval.

## Layout
```
market-pulse/
├── db/
│   ├── schema.sql      market_pulse schema: 16 tables, enums, stat views, RLS
│   └── seed.sql        deterministic demo data (incl. sample scores/rankings)
├── lib/
│   ├── db.js           Supabase service-role client + audit helper
│   ├── http.js         caller-JWT client + role guard
│   ├── dedupe.js       alias matching + duplicate detection (unit-tested)
│   ├── scoring.js      0–100 popularity engine (normalize + weight)
│   ├── claude-analysis.js  classification + response-drafting prompts
│   └── alerts.js       alert evaluation + dispatch (email/Slack/SMS)
├── api/
│   ├── posts.js        capture + feed (market-scoped)
│   ├── markets.js      list/create markets (zip territories)
│   ├── analyze.js      Claude classify → mentions → alerts
│   ├── suggest.js      Claude draft replies (pending approval)
│   ├── approvals.js    approve/edit/reject (admin/mktg only)
│   ├── competitors.js  competitor CRUD
│   ├── scores.js       recompute + read rankings (per market)
│   ├── import.js       CSV-row import
│   └── cron/
│       ├── places-discovery.js     auto-find competitors per market (daily)
│       ├── reddit-sync.js          official Reddit API (hourly)
│       └── google-reviews-sync.js  Places rating/review refresh (daily)
├── csv-templates/      competitors · captured_posts · post_mentions ·
│                       competitor_responses · tracked_groups
├── frontend/
│   ├── hub.html                          central launcher (all tools)
│   ├── executive-market-dashboard.html   fully-built reference screen
│   ├── social-capture.html               manual post-capture interface
│   ├── shared/itg-header.html            reusable ITG global header + app-switcher
│   └── frontend-component-structure.md    screens B–E + role matrix
├── docs/
│   ├── architecture.md   product architecture · deployment · compliance
│   ├── data-model.md     tables, relationships, integrity
│   ├── wireframes.md     all five screens
│   ├── scoring.md        formula + worked example + adjustable weights
│   ├── api-import-strategy.md   per-platform compliant ingestion reality
│   ├── ai-prompts.md     Claude classification + drafting contracts
│   ├── alert-logic.md    alert rules, severities, channels
│   ├── social-capture-sop.md       how to run the one manual task
│   └── deployment-upload-guide.md  step-by-step upload instructions
├── package.json
└── vercel.json          cron schedules
```

## Quick start
1. Supabase SQL editor → run `db/schema.sql`, then `db/seed.sql`.
2. Supabase API settings → expose the `market_pulse` schema.
3. Deploy to Vercel; set env vars (see `docs/architecture.md`).
4. Replace placeholder `mp_users` ids with real `auth.users` uids; set
   `MARKET_PULSE_COMPANY_ID`.
5. Open `frontend/executive-market-dashboard.html`; swap `DATA` for
   `fetch('/api/scores')` and build out B–E.

## Compliance, in one line
Official APIs where they exist (Reddit, Google Places); manual/authorized capture
everywhere they don't (Facebook, Nextdoor); every row stamped with a
`capture_method`; nothing auto-posts. See `docs/api-import-strategy.md`.

## Roles
admin · marketing_manager · reviewer · read_only_partner. Only admin and
marketing_manager approve responses. Enforced by RLS + per-route checks.
