# Market Pulse — API & Import Strategy

The honest version: most of the valuable conversation lives on platforms that do
**not** offer a compliant way to search and pull other people's posts. The system
is therefore built so that manual/authorized capture is first-class, and official
APIs are used wherever they genuinely exist. Nothing here bypasses logins,
CAPTCHAs, rate limits, or private-group restrictions, and nothing impersonates a
user.

## Per-platform reality

| Platform            | Compliant ingestion in v1                         | Method (`capture_method`) |
|---------------------|---------------------------------------------------|---------------------------|
| Facebook Groups     | No public group-search API. Manual entry / screenshot by an authorized member. | `manual_entry`, `screenshot_upload` |
| Facebook Pages      | Your own page via Graph API; competitors' pages are manual. | `manual_entry` |
| Nextdoor            | No public API. Manual / screenshot by an authorized member. | `manual_entry`, `screenshot_upload` |
| Reddit              | Official OAuth API on local subreddits.           | `official_api` (cron)     |
| Google Reviews      | Places API → rating + review *count* only (no review-text scraping). Your own reviews via Business Profile API. | `official_api` (cron) |
| Public forums / Q&A | Manual entry; RSS where a site offers it.         | `manual_entry`            |
| Anything else       | CSV import of data you already have rights to.    | `csv_import`              |

So in practice: **Reddit and Google auto-sync; everything else is human-entered
or imported.** That is a feature, not a gap — it keeps the whole system inside
platform terms and gives every row an auditable provenance.

## Ingestion paths

**Manual capture** — `POST /api/posts`. The Capture modal records platform,
group, city, URL, optional screenshot, and `capture_method`. Deduped on
`content_hash`.

**CSV import** — `POST /api/import?type=…` takes parsed rows matching the
templates in `csv-templates/`:
- `competitors.csv` — upserts by normalized name.
- `captured_posts.csv` — inserts with `capture_method='csv_import'`, deduped.
- `tracked_groups.csv` — the sources you watch.
- `post_mentions.csv`, `competitor_responses.csv` — keyed to a post's URL for
  back-loading historical data.

**Reddit cron** — `GET /api/cron/reddit-sync` (hourly). Client-credentials OAuth,
pulls `r/{sub}/new` for the configured subreddits, keeps keyword matches, dedupes,
inserts `capture_method='official_api'`. No-op unless `REDDIT_*` is set.

**Google cron** — `GET /api/cron/google-reviews-sync` (daily). Places Place
Details per competitor `google_place_id`, updates rating/review count and writes a
`google_snapshots` row so velocity is trackable. No-op unless
`GOOGLE_PLACES_API_KEY` is set.

Both crons require the `CRON_SECRET` bearer token. Confirm current API
terms/quotas/pricing at setup before enabling.

## After capture
Any captured post can be enriched with `POST /api/analyze` (Claude classification
→ mentions + alerts) and `POST /api/suggest` (Claude draft replies → pending
approval). Scores recompute via `POST /api/scores/recompute`.

## Route summary
```
GET  /api/posts                 feed (filters: city, platform, urgency, category, should_respond, from, to, q)
POST /api/posts                 manual capture (admin/mktg/reviewer)
POST /api/analyze               classify a post → mentions + alerts
POST /api/suggest               draft suggested responses (pending approval)
POST /api/approvals             approve/edit/reject/assign/mark-responded (admin/mktg)
GET  /api/competitors           list
POST /api/competitors           create (admin/mktg)
PATCH /api/competitors          update (admin/mktg)
GET  /api/scores                ranking + city rankings + named rankings
POST /api/scores/recompute      recompute month (admin/mktg)
POST /api/import?type=…         CSV-row import (admin/mktg)
GET  /api/cron/reddit-sync      hourly (CRON_SECRET)
GET  /api/cron/google-reviews-sync  daily (CRON_SECRET)
```
