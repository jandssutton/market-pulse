# Market Pulse — Data Model

All objects live in the `market_pulse` schema. Every tenant table carries
`company_id` and is protected by RLS. Enums keep categorical fields clean.

## Tables

**mp_users** — module role mapping (`id` = auth uid; role ∈ admin,
marketing_manager, reviewer, read_only_partner).

**scoring_config** — one row per company; the eight scoring weights (must sum to
1.00, enforced by a CHECK) plus `unanswered_alert_minutes`. Admin-adjustable.

**market_sources** — platform catalog with the ToS-respecting `ingestion` method
and a `compliance_note` per platform.

**tracked_groups** — specific groups/pages/subreddits watched; `is_private` +
`authorized` flags gate private-source capture.

**competitors** — full profile (name, service area, website, phone, Google
rating/review count + `google_place_id`, Facebook URL, owner, response style,
strengths, weaknesses, notes). Classification via `tier` (major/minor/unknown),
`org_type` (franchise/local_independent/lead_gen/unknown), and `scam_concern`.
The ITG self-row is `is_self = true` (one per company, partial-unique index) and
is excluded from competitor rankings.

**competitor_aliases** — alternate names → competitor; `alias_norm` generated
column mirrors the JS `normName()` so SQL and app matching agree.

**google_snapshots** — point-in-time rating + review_count per competitor, so
review *velocity* (Δ reviews / time) is computable.

**captured_posts** — the core intel row: platform, group, city/market, request
category, urgency, post + detected timestamps, original URL, screenshot path,
`capture_method`, raw text, `itg_mentioned`, `itg_should_respond`, AI `analysis`
jsonb, `confidence`, `content_hash` (dedupe), `reviewed` (human-review queue).

**post_mentions** — one row per competitor mentioned in a post: resolved
`competitor_id` + `raw_name`, `mentioned_by`, `sentiment`, `unprompted`,
`is_winner`.

**post_comments** — optional per-comment granularity within a thread.

**competitor_responses** — how a rival replied: `resp_type`, `tone`, the
attribute booleans (price/availability/emergency/warranty/reputation mentioned),
`call_to_action`, `response_minutes`, `effectiveness_score`.

**suggested_responses** — AI-drafted ITG replies: `resp_type`, `angle`, `body`,
`confidence`, `status` (draft → pending_approval → approved → posted/rejected).

**response_approvals** — the approval trail: `action`
(approved/edited/rejected/assigned/marked_responded), `edited_body`,
`assigned_to`, `deadline`, `responded`, `acted_by` (admin/mktg only).

**market_scores** — computed 0–100 score per competitor per month, with the
normalized component breakdown + weight snapshot in `components` jsonb, and
`rank_overall`. Service-role write only.

**city_rankings** — per-city, per-month competitor rank by mentions (score breaks
ties). Service-role write only.

**alerts** — `alert_type`, `severity`, linked post/competitor, `message`,
`channels[]`, `status` (new/sent/acknowledged/dismissed).

**audit_log** — actor, action, entity, before/after jsonb. Admin-readable.

## Key relationships
```
captured_posts 1───* post_mentions *───1 competitors
captured_posts 1───* post_comments
captured_posts 1───* competitor_responses *───1 competitors
captured_posts 1───* suggested_responses 1───* response_approvals
competitors    1───* competitor_aliases
competitors    1───* google_snapshots
competitors    1───* market_scores  (per month)
competitors    1───* city_rankings  (per city/month)
```

## Stat views (feed the scoring engine)
- `v_response_times` — recomputes response minutes from timestamps (source of truth).
- `v_competitor_mentions_monthly` — mentions, unique recommenders, positive/negative,
  unprompted, cities covered, urgent appearances, last seen.
- `v_competitor_speed_monthly` — avg response minutes + response count.
- `v_competitor_google` — latest rating/review count + 30-day review velocity.
- `v_unanswered_posts` — open recommendation threads with age in minutes
  (drives the "unanswered > 15 min" alert).

## Data-integrity features (spec §14)
- **Duplicate detection** — `content_hash` unique per company (URL-keyed when a
  URL exists, else a normalized text fingerprint); capture + import + crons all
  check it.
- **Alias matching** — `normName()` + `resolveCompetitor()` (alias → exact →
  fuzzy-contains), unit-tested.
- **Manual correction** — reviewers can edit posts/mentions; analyze is idempotent
  (clears and rewrites AI-derived mentions on re-run).
- **Confidence scores** — stored on posts and suggested responses.
- **Audit trail** — `audit_log` + `response_approvals`.
- **Source backup** — `screenshot_path` + `original_url` + `capture_method`.
- **Human review queue** — `captured_posts.reviewed`.
