# Market Pulse — Architecture, Deployment & Compliance

## What it is
A market-intelligence module that tells Inside Track who is winning the local
garage-door conversation online, where, why, how fast rivals respond, and where
ITG has openings. It is **not** a posting tool and it is **not** part of the
Operations Hub.

## Hard separation from the Operations Hub
- Lives in its own Postgres schema `market_pulse` — zero shared tables with
  scheduling, HCP, inspections, invoices, payroll, or job workflow.
- Its own role table (`mp_users`) with module-specific roles, so Market Pulse
  permissions never leak into ops permissions.
- Shares only the Supabase **project** (one database, one auth) and the Vercel
  deployment. You can run it against the same company id as the rest of the
  business, but nothing in the Operations Hub reads or writes Market Pulse data.
- No hard foreign key into `public.companies`; `company_id` is a plain uuid
  defaulted from `MARKET_PULSE_COMPANY_ID`. That keeps the module independently
  deployable and franchise-portable.

## Stack
- **Postgres (Supabase)** — schema, RLS, scoring views.
- **Vercel serverless** (`/api/*`) — capture, AI analysis, suggestions,
  approvals, scoring, import, two cron syncs.
- **Supabase Auth** — same users; `mp_users.role` maps each to a Market Pulse role.
- **Claude (Anthropic API)** — post classification + response drafting.
- **Resend / Slack** — alert delivery. SMS is a stubbed channel.
- **Vanilla JS frontend** — five screens, same shell and design tokens as the
  existing portal.

## Data flow
```
capture (manual / CSV / Reddit API / Places API)
   → captured_posts (deduped by content_hash, capture_method recorded)
   → POST /api/analyze → Claude classify → analysis jsonb
        → post_mentions (alias-resolved to competitors)
        → alerts (evaluated + dispatched)
   → POST /api/suggest → Claude draft → suggested_responses (pending_approval)
        → POST /api/approvals (admin/mktg) → approved → human copies & posts
   → POST /api/scores/recompute → lib/scoring.js
        → market_scores + city_rankings → dashboards
```

## Compliance posture (built into the data model, not bolted on)
- Every captured row stores a `capture_method`
  (`manual_entry`, `screenshot_upload`, `csv_import`, `authorized_export`,
  `official_api`) for an auditable provenance trail.
- **No scraping of platforms that disallow it.** Facebook Groups and Nextdoor
  have no compliant search API, so the system is built for manual / authorized-
  member capture and screenshot upload — never login bypass, never CAPTCHA
  defeat, never private-group access without authorization.
- `tracked_groups.is_private` + `authorized` make it explicit that private
  sources may only be captured by an authorized member.
- **Reddit** uses the official OAuth API; **Google** uses the Places API for
  rating and review *counts* only (no review-text scraping).
- **Nothing auto-posts.** Suggested responses always require human approval;
  the v1 loop is Approve → Copy → human posts → Mark responded.
- Captured data is deletable; `audit_log` records who did what.

## Deployment plan
1. **Supabase**: create (or reuse) a project. In the SQL editor run
   `db/schema.sql`, then `db/seed.sql`. The `market_pulse` schema and RLS install
   cleanly alongside any existing Operations Hub tables.
2. Expose the schema to the API: in Supabase → API settings, add `market_pulse`
   to the exposed schemas (the clients are already scoped to it).
3. **Vercel**: deploy this folder. Set the env vars below. `vercel.json` registers
   the two cron jobs (Reddit hourly, Google daily at 06:00 UTC).
4. Map real `auth.users` uids into `mp_users` with the right roles (the seed ids
   are placeholders).
5. Set the live company id in `MARKET_PULSE_COMPANY_ID` (must equal the seed
   `company_id` if you keep the demo rows).
6. Open `frontend/executive-market-dashboard.html`, swap `DATA` for the
   `fetch('/api/scores')` call, and wire the other four screens per
   `frontend-component-structure.md`.

### Environment variables
```
SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
MARKET_PULSE_COMPANY_ID
ANTHROPIC_API_KEY, ANTHROPIC_MODEL            # default claude-sonnet-4-5
RESEND_API_KEY, ALERT_EMAIL_FROM, ALERT_EMAIL_TO
SLACK_WEBHOOK_URL                              # optional
MARKET_PULSE_ALERT_CHANNELS                    # e.g. dashboard,email,slack
CRON_SECRET                                    # protects the cron routes
REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USER_AGENT, REDDIT_SUBREDDITS   # optional
GOOGLE_PLACES_API_KEY                          # optional
ITG_PHONE, ITG_BOOKING_URL                     # used only in drafted responses
```
Anything optional is a clean no-op when unset, so you can ship manual-capture-only
first and switch on Reddit/Google later.
