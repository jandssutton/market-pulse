# Market Pulse — standalone install (separate project)

Fully isolated from the inspection app: its own GitHub repo, its own Vercel
project, its own URL. Shares only the Supabase database (already an isolated
`market_pulse` schema). It cannot affect the existing system.

## A. New repo
1. github.com → New repository → name `market-pulse` → Create.
2. Open it, press `.` for the browser editor.
3. Drag ALL the files from this zip into the editor (api/, lib/, the .html files,
   vercel.json, package.json, db/, etc.). They go at the ROOT of the repo.
4. Source Control → message "market pulse" → Commit & Push.

## B. New Vercel project
1. vercel.com → Add New → Project → import the `market-pulse` repo.
2. Framework preset: Other. Root directory: leave as the repo root.
3. Add env vars (Settings → Environment Variables), then Deploy:
   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
   MARKET_PULSE_COMPANY_ID = d1d1d1d1-0000-4000-8000-000000000001,
   ANTHROPIC_API_KEY, CRON_SECRET (any long random string).
   Optional later: GOOGLE_PLACES_API_KEY, REDDIT_*, RESEND_*, SLACK_WEBHOOK_URL,
   MARKET_PULSE_ALERT_CHANNELS, ITG_PHONE, ITG_BOOKING_URL.
4. Vercel gives you a URL like market-pulse-xxxx.vercel.app. The bare URL shows
   the hub (index.html). Later you can point pulse.insidetrackapps.com at it.

## C. Database (Supabase)
SQL Editor → run db/schema.sql, then db/seed.sql.
Settings → API → Exposed schemas → add `market_pulse`.

## D. Make it real
1. mp_users table: replace placeholder rows with your real Supabase login ids +
   roles. Set MARKET_PULSE_COMPANY_ID to match the seed company id.
2. markets table: edit each market's zip_codes (Memphis, Jackson) to match where
   each truck works.
3. Hit /api/cron/places-discovery once (Authorization: Bearer <CRON_SECRET>) to
   populate competitors, then POST /api/scores?recompute=1.

## E. Optional cleanup of the inspection repo
To return inside-track-inspection to exactly how it was, delete what was added
there earlier: the `api/market-pulse/` folder, the `lib/market-pulse/` folder,
and the three .html pages (hub, executive-market-dashboard, social-capture).
Nothing else was touched.

## Pages
/ (hub) · /executive-market-dashboard.html · /social-capture.html
## Endpoints
/api/posts · /api/markets · /api/analyze · /api/suggest · /api/approvals ·
/api/competitors · /api/scores (POST ?recompute=1) · /api/import ·
/api/cron/places-discovery|reddit-sync|google-reviews-sync
