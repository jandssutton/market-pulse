# Uploading Market Pulse — Step by Step

This deploys on the same stack as the rest of insidetrackapps.com (GitHub →
Vercel, Supabase, Resend). Roughly 30–45 minutes the first time.

## 1. Put the code in your repo
Unzip `market-pulse.zip`. You can either drop the folder into your existing
`inside-track-inspection` repo (as `/market-pulse`) or push it as its own repo —
it's self-contained either way. Commit and push to GitHub.

## 2. Database (Supabase)
1. Open your Supabase project → **SQL Editor**.
2. Paste and run `db/schema.sql`. This creates the isolated `market_pulse`
   schema — it does not touch any Operations Hub or attribution tables.
3. Paste and run `db/seed.sql` for the demo rows (the two markets, sample
   competitors, sample scores). You can delete the seed rows later once real
   data flows.
4. Go to **Project Settings → API → Exposed schemas** and add `market_pulse`
   to the list (alongside `public`). Save.

## 3. Connect real users
The seeded `mp_users` rows use placeholder ids. For each real person:
- Make sure they have a Supabase Auth account (same logins as your other apps).
- In the SQL editor, insert an `mp_users` row mapping their `auth.users` id to a
  role (`admin`, `marketing_manager`, `reviewer`, or `read_only_partner`) and the
  company id. Only admin and marketing_manager can approve responses.

## 4. Deploy on Vercel
1. In Vercel, point a project at the repo (root = the `market-pulse` folder if
   you nested it). Framework preset: **Other**. It's plain serverless functions
   under `/api` plus static HTML in `/frontend`.
2. Add the environment variables below (Project → Settings → Environment
   Variables).
3. Deploy. `vercel.json` registers the three cron jobs automatically.

### Environment variables
Required to run at all:
```
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
MARKET_PULSE_COMPANY_ID      = d1d1d1d1-0000-4000-8000-000000000001  (match the seed, or your real id)
ANTHROPIC_API_KEY            (for post classification + suggested replies)
CRON_SECRET                  (any long random string; protects the cron URLs)
```
Turn on the automated channels when you're ready (each is a clean no-op until set):
```
GOOGLE_PLACES_API_KEY        → competitor discovery + review tracking per market
REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET / REDDIT_USER_AGENT / REDDIT_SUBREDDITS
RESEND_API_KEY / ALERT_EMAIL_FROM / ALERT_EMAIL_TO   → email alerts
SLACK_WEBHOOK_URL            → Slack alerts
MARKET_PULSE_ALERT_CHANNELS  = dashboard,email        (which channels fire)
ITG_PHONE / ITG_BOOKING_URL  (used only inside drafted replies)
ANTHROPIC_MODEL              (optional; defaults to claude-sonnet-4-5)
```

## 5. Set up your markets (the important per-location step)
The seed ships two markets — **Memphis Metro + DeSoto** and **Jackson MS** —
each with a real zip list. Review them:
- Edit a market's `zip_codes` and `anchor_cities` to match exactly where each
  truck works. The zip list IS the territory — it's what scopes competitor
  discovery and keeps the two locations' numbers separate.
- `center_lat`/`center_lng` bias the Google search to that area; the seeded
  values are already set for Memphis and Jackson.
- Add a market later by POSTing to `/api/markets` (or another seed row) — the
  whole system scales to more locations with no code change.

## 6. First run
1. Hit `/api/cron/places-discovery` once (with the `CRON_SECRET` bearer header)
   to populate competitors for each market from Google. New finds come in as
   "discovered / unknown" for you to promote, flag, or merge.
2. Hit `/api/scores/recompute` to compute popularity per market.
3. Open `frontend/executive-market-dashboard.html` (swap its `DATA` block for
   `fetch('/api/scores?market_id=…')`) and `frontend/social-capture.html` (set
   `API_BASE` and wire `getToken()` to your Supabase session).
4. Hand the **Social Capture SOP** to whoever logs Facebook/Nextdoor posts.

## 7. Shared header + the launcher
All three pages (`hub.html`, the Executive dashboard, `social-capture.html`) now
carry the same ITG header as the portal — navy bar, orange underline, logo + name
left, an app-switcher dropdown, role pill, and Sign out — over the dark Market
Pulse body. Two quick settings make it live:
- In each page's header script, set `ITG_HEADER.logo` to your real logo URL (the
  one in `portal.html`). Until you do, it shows a clean text wordmark fallback.
- Wire `ITG_HEADER.user`, `ITG_HEADER.role`, and `signout` to your Supabase
  session, and edit the `ITG_TOOLS` / `TOOLS` URL lists to your real paths.
- `hub.html` is the central launcher — drop it at your site root (e.g.
  `/hub.html`) and point the portal's "Tools" at it. Tiles are role-filtered via
  `CURRENT_ROLE`; each tool still enforces its own access on entry.
- The reusable header lives at `frontend/shared/itg-header.html` so you can paste
  the same chrome into the attribution dashboard and any future tool.

## What runs on its own after that- **Daily 05:00 UTC** — Places discovery refreshes each market's competitor list.
- **Daily 06:00 UTC** — Google ratings/review counts refresh (feeds velocity).
- **Hourly** — Reddit pulls local garage-door posts.
- **On demand** — recompute scores (or add a 4th cron if you want it nightly).

The only standing manual task is the social capture routine. Everything else is
hands-off.
