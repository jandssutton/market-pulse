-- ============================================================================
-- Market Pulse — market intelligence module for Inside Track Garage Door
-- Isolated in its own `market_pulse` schema. Touches NOTHING in the Operations
-- Hub (no scheduling, HCP, invoices, payroll, job workflow). Shares only the
-- Supabase project + auth.users. Company-scoped + RLS for franchise reuse.
--
-- Run order: schema.sql  then  seed.sql
-- ============================================================================

create extension if not exists pgcrypto;

drop schema if exists market_pulse cascade;
create schema market_pulse;
set search_path = market_pulse, public;

-- ---------------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------------
create type mp_role as enum ('admin','marketing_manager','reviewer','read_only_partner');

create type platform as enum (
  'facebook_group','facebook_page','nextdoor','google_reviews',
  'reddit','forum','directory_qa','manual','csv');

-- Compliance-forward: every captured row records HOW it was obtained.
create type capture_method as enum (
  'manual_entry','screenshot_upload','csv_import','authorized_export','official_api');

create type request_category as enum (
  'company_recommendation','repair','spring_repair','opener_repair',
  'broken_door','off_track','emergency','overhead_door','installation','other');

create type urgency as enum ('emergency','high','medium','low');
create type sentiment as enum ('positive','neutral','negative');

create type competitor_tier as enum ('major','minor','unknown');
create type competitor_org_type as enum ('franchise','local_independent','lead_gen','unknown');

create type response_type as enum (
  'direct_pitch','helpful_advice','ask_to_call','pm_request','generic_comment');
create type response_tone as enum (
  'professional','pushy','friendly','generic','technical','unhelpful','spammy');

create type suggested_response_type as enum (
  'fb_group_public','private_message','nextdoor','google_review','referral_thanks',
  'urgent_repair','price_sensitive','safety_focused','after_hours');
create type response_angle as enum (
  'same_day','professional_diagnosis','spring_repair','opener_repair','safety_concern',
  'local_company','financing','warranty','no_pressure_inspection');

create type suggested_status as enum ('draft','pending_approval','approved','posted','rejected');
create type approval_action as enum ('approved','edited','rejected','assigned','marked_responded');

create type alert_type as enum (
  'urgent_repair_post','spring_repair_request','opener_repair_request','target_city_post',
  'major_competitor_mentioned','itg_mentioned','negative_competitor_mention',
  'unanswered_recommendation','high_value_opportunity');
create type alert_severity as enum ('critical','high','medium','low');
create type alert_status as enum ('new','sent','acknowledged','dismissed');
create type alert_channel as enum ('dashboard','email','sms','slack');

-- ---------------------------------------------------------------------------
-- CONFIG / IDENTITY
-- ---------------------------------------------------------------------------

-- Module-local role mapping (separate from Operations Hub roles by design).
-- id = Supabase auth.users uid.
create table mp_users (
  id           uuid primary key,
  company_id   uuid not null,
  email        text,
  full_name    text,
  role         mp_role not null default 'reviewer',
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);
create index mp_users_company_idx on mp_users(company_id);

-- Adjustable scoring weights (one active row per company). Weights sum to 1.00.
create table scoring_config (
  company_id        uuid primary key,
  w_mention_volume  numeric(4,3) not null default 0.25,
  w_unique_reco     numeric(4,3) not null default 0.20,
  w_positive_sent   numeric(4,3) not null default 0.15,
  w_response_speed  numeric(4,3) not null default 0.10,
  w_google_strength numeric(4,3) not null default 0.10,
  w_review_velocity numeric(4,3) not null default 0.10,
  w_city_coverage   numeric(4,3) not null default 0.05,
  w_recency         numeric(4,3) not null default 0.05,
  unanswered_alert_minutes int not null default 15,
  updated_at        timestamptz not null default now(),
  constraint weights_sum_one check (
    round(w_mention_volume + w_unique_reco + w_positive_sent + w_response_speed
        + w_google_strength + w_review_velocity + w_city_coverage + w_recency, 3) = 1.000)
);

-- ---------------------------------------------------------------------------
-- MARKETS  (the core territory primitive — one per physical location)
-- A market is defined by its ZIP CODES, not loose city names. Every competitor,
-- captured post, score, and ranking is scoped to a market, so each location
-- (Memphis TN, Jackson MS, …) is tracked completely independently.
-- ---------------------------------------------------------------------------
create table markets (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null,
  name            text not null,                 -- "Memphis Metro", "Jackson MS"
  state           text,                          -- 'TN', 'MS'
  zip_codes       text[] not null default '{}',  -- the territory definition
  anchor_cities   text[] not null default '{}',  -- search seeds for Places discovery
  center_lat      numeric,                       -- bias point for Places search
  center_lng      numeric,
  search_radius_m int not null default 30000,    -- ~18 mi
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (company_id, name)
);
create index markets_company_idx on markets(company_id);

-- Catalog of source PLATFORMS and how each is legally ingested.
create table market_sources (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null,
  platform        platform not null,
  display_name    text not null,
  enabled         boolean not null default true,
  -- realistic, ToS-respecting ingestion path for this platform:
  ingestion       capture_method not null default 'manual_entry',
  compliance_note text,
  created_at      timestamptz not null default now(),
  unique (company_id, platform)
);

-- Specific groups/pages/communities being watched.
create table tracked_groups (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null,
  market_id     uuid references markets(id) on delete cascade,
  source_id     uuid references market_sources(id) on delete set null,
  platform      platform not null,
  name          text not null,
  city          text,
  market        text,
  url           text,
  is_private    boolean not null default false,
  -- private groups may only be captured if the operator is an authorized member
  authorized    boolean not null default false,
  active        boolean not null default true,
  notes         text,
  created_at    timestamptz not null default now()
);
create index tracked_groups_company_idx on tracked_groups(company_id);

-- ---------------------------------------------------------------------------
-- COMPETITORS
-- ---------------------------------------------------------------------------
create table competitors (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null,
  market_id          uuid references markets(id) on delete cascade,
  name               text not null,
  is_self            boolean not null default false,  -- the Inside Track row
  discovered         boolean not null default false,  -- auto-found via Places (needs curation)
  service_area       text,
  website            text,
  phone              text,
  google_place_id    text,
  google_rating      numeric(2,1),
  google_review_count int,
  facebook_url       text,
  owner_manager      text,           -- only if publicly available
  response_style     text,
  strengths          text,
  weaknesses         text,
  tier               competitor_tier not null default 'unknown',
  org_type           competitor_org_type not null default 'unknown',
  scam_concern       boolean not null default false,
  manual_popularity  int,            -- optional admin override hint
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index competitors_company_idx on competitors(company_id);
create index competitors_market_idx on competitors(company_id, market_id);
-- one ITG self-row per market (your Memphis listing != your Jackson listing)
create unique index competitors_self_uq on competitors(company_id, market_id) where is_self;
-- Places discovery dedupes on place_id within a market
create unique index competitors_place_uq on competitors(market_id, google_place_id)
  where google_place_id is not null;

-- Alias strings for fuzzy matching ("ABC Garage" == "ABC Garage Doors").
create table competitor_aliases (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null,
  competitor_id uuid not null references competitors(id) on delete cascade,
  alias         text not null,
  -- mirrors lib/dedupe.js normName(): drop common garage-door noise words, then
  -- strip to lowercase alphanumerics. Kept for optional SQL-side lookups; the JS
  -- resolver remains the single source of truth.
  alias_norm    text generated always as (
    lower(regexp_replace(
      regexp_replace(alias, '\y(garage|doors|door|overhead|repair|services|service|company|co|llc|inc|the)\y', '', 'gi'),
      '[^a-z0-9]', '', 'gi'))) stored,
  created_at    timestamptz not null default now(),
  unique (competitor_id, alias)
);
create index competitor_aliases_norm_idx on competitor_aliases(company_id, alias_norm);

-- Point-in-time Google snapshots so review VELOCITY is computable.
create table google_snapshots (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null,
  competitor_id uuid not null references competitors(id) on delete cascade,
  captured_at   timestamptz not null default now(),
  rating        numeric(2,1),
  review_count  int,
  capture_method capture_method not null default 'official_api'
);
create index google_snapshots_comp_idx on google_snapshots(competitor_id, captured_at desc);

-- ---------------------------------------------------------------------------
-- CAPTURED POSTS + MENTIONS + COMMENTS
-- ---------------------------------------------------------------------------
create table captured_posts (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null,
  market_id         uuid references markets(id) on delete cascade,
  source_id         uuid references market_sources(id) on delete set null,
  tracked_group_id  uuid references tracked_groups(id) on delete set null,
  platform          platform not null,
  group_name        text,
  city              text,
  market            text,
  request_category  request_category,
  urgency           urgency,
  post_datetime     timestamptz,
  detected_at       timestamptz not null default now(),
  original_url      text,
  screenshot_path   text,                 -- storage ref for audit
  capture_method    capture_method not null default 'manual_entry',
  raw_text          text,
  itg_mentioned     boolean not null default false,
  itg_should_respond boolean,             -- set by AI / reviewer
  analysis          jsonb,                -- raw Claude classification output
  confidence        numeric(4,3),         -- AI confidence 0..1
  content_hash      text,                 -- duplicate detection
  reviewed          boolean not null default false,  -- human review queue
  created_by        uuid,
  created_at        timestamptz not null default now()
);
create index captured_posts_company_idx on captured_posts(company_id, post_datetime desc);
create index captured_posts_city_idx on captured_posts(company_id, city);
-- duplicate guard: same source + same content fingerprint
create unique index captured_posts_dedupe on captured_posts(company_id, content_hash)
  where content_hash is not null;

-- One row per competitor mentioned in a post.
create table post_mentions (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null,
  post_id       uuid not null references captured_posts(id) on delete cascade,
  competitor_id uuid references competitors(id) on delete set null,
  raw_name      text,                 -- as written, before alias resolution
  mention_count int not null default 1,
  mentioned_by  text,                 -- handle/name of recommender (public only)
  sentiment     sentiment not null default 'neutral',
  unprompted    boolean not null default false,  -- recommended without being asked
  is_winner     boolean not null default false,  -- apparent winner of the thread
  notes         text,
  created_at    timestamptz not null default now()
);
create index post_mentions_post_idx on post_mentions(post_id);
create index post_mentions_comp_idx on post_mentions(company_id, competitor_id);

-- Individual comments in a thread (optional granularity).
create table post_comments (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null,
  post_id         uuid not null references captured_posts(id) on delete cascade,
  competitor_id   uuid references competitors(id) on delete set null,
  author_handle   text,
  body            text,
  comment_datetime timestamptz,
  is_company_response boolean not null default false,
  created_at      timestamptz not null default now()
);
create index post_comments_post_idx on post_comments(post_id);

-- ---------------------------------------------------------------------------
-- COMPETITOR RESPONSES (how rivals reply in threads)
-- ---------------------------------------------------------------------------
create table competitor_responses (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null,
  post_id            uuid not null references captured_posts(id) on delete cascade,
  competitor_id      uuid references competitors(id) on delete set null,
  responder_name     text,
  response_datetime  timestamptz,
  -- response_minutes is filled from (response_datetime - post.post_datetime) by the app;
  -- v_response_times recomputes it from timestamps as the source of truth.
  response_minutes   int,
  resp_type          response_type not null default 'generic_comment',
  tone               response_tone not null default 'generic',
  price_mentioned    boolean not null default false,
  availability_mentioned boolean not null default false,
  emergency_mentioned boolean not null default false,
  warranty_mentioned boolean not null default false,
  reputation_mentioned boolean not null default false,
  call_to_action     text,
  effectiveness_score int,   -- 0..100, reviewer/AI estimate
  created_at         timestamptz not null default now()
);
create index competitor_responses_post_idx on competitor_responses(post_id);
create index competitor_responses_comp_idx on competitor_responses(company_id, competitor_id);

-- ---------------------------------------------------------------------------
-- SUGGESTED RESPONSES + APPROVAL WORKFLOW (never auto-posts in v1)
-- ---------------------------------------------------------------------------
create table suggested_responses (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null,
  post_id       uuid not null references captured_posts(id) on delete cascade,
  resp_type     suggested_response_type not null,
  angle         response_angle,
  body          text not null,
  confidence    numeric(4,3),
  ai_generated  boolean not null default true,
  status        suggested_status not null default 'pending_approval',
  created_at    timestamptz not null default now()
);
create index suggested_responses_post_idx on suggested_responses(post_id);
create index suggested_responses_status_idx on suggested_responses(company_id, status);

create table response_approvals (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null,
  suggested_response_id uuid not null references suggested_responses(id) on delete cascade,
  action              approval_action not null,
  edited_body         text,
  assigned_to         uuid,            -- mp_users.id
  deadline            timestamptz,
  responded           boolean not null default false,
  responded_at        timestamptz,
  acted_by            uuid not null,   -- mp_users.id (admin/marketing_manager only)
  created_at          timestamptz not null default now()
);
create index response_approvals_sr_idx on response_approvals(suggested_response_id);

-- ---------------------------------------------------------------------------
-- SCORES + RANKINGS (computed by lib/scoring.js, service-role write only)
-- ---------------------------------------------------------------------------
create table market_scores (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null,
  market_id     uuid not null references markets(id) on delete cascade,
  competitor_id uuid not null references competitors(id) on delete cascade,
  period_month  date not null,        -- first of month
  score         numeric(5,2) not null,-- 0..100
  components    jsonb not null,        -- normalized subscores + weights snapshot
  rank_overall  int,                   -- rank WITHIN the market
  computed_at   timestamptz not null default now(),
  unique (company_id, market_id, competitor_id, period_month)
);
create index market_scores_period_idx on market_scores(company_id, market_id, period_month, rank_overall);

create table city_rankings (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null,
  market_id     uuid not null references markets(id) on delete cascade,
  city          text not null,
  period_month  date not null,
  competitor_id uuid not null references competitors(id) on delete cascade,
  mentions      int not null default 0,
  score         numeric(5,2) not null default 0,
  rank          int not null,
  computed_at   timestamptz not null default now(),
  unique (company_id, market_id, city, period_month, competitor_id)
);
create index city_rankings_city_idx on city_rankings(company_id, market_id, city, period_month, rank);

-- ---------------------------------------------------------------------------
-- ALERTS
-- ---------------------------------------------------------------------------
create table alerts (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null,
  alert_type    alert_type not null,
  severity      alert_severity not null default 'medium',
  post_id       uuid references captured_posts(id) on delete cascade,
  competitor_id uuid references competitors(id) on delete set null,
  message       text not null,
  channels      alert_channel[] not null default '{dashboard}',
  status        alert_status not null default 'new',
  acked_by      uuid,
  acked_at      timestamptz,
  created_at    timestamptz not null default now()
);
create index alerts_status_idx on alerts(company_id, status, created_at desc);

-- ---------------------------------------------------------------------------
-- AUDIT LOG
-- ---------------------------------------------------------------------------
create table audit_log (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null,
  actor       uuid,
  action      text not null,
  entity      text not null,
  entity_id   uuid,
  before      jsonb,
  after       jsonb,
  at          timestamptz not null default now()
);
create index audit_log_entity_idx on audit_log(company_id, entity, at desc);

-- ===========================================================================
-- HELPERS (role / company resolution from mp_users)
-- ===========================================================================
create or replace function mp_company() returns uuid
language sql stable security definer set search_path = market_pulse, public as $$
  select company_id from market_pulse.mp_users where id = auth.uid() and active;
$$;

create or replace function mp_current_role() returns mp_role
language sql stable security definer set search_path = market_pulse, public as $$
  select role from market_pulse.mp_users where id = auth.uid() and active;
$$;

-- updated_at trigger
create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger competitors_touch before update on competitors
  for each row execute function touch_updated_at();

-- ===========================================================================
-- STAT VIEWS (raw aggregates; normalization + weighting happens in scoring.js)
-- ===========================================================================

-- response time recomputed from timestamps (source of truth)
create view v_response_times as
select r.id, r.company_id, r.competitor_id, r.post_id,
       greatest(0, round(extract(epoch from (r.response_datetime - p.post_datetime))/60))::int
         as response_minutes
from competitor_responses r
join captured_posts p on p.id = r.post_id
where r.response_datetime is not null and p.post_datetime is not null;

-- per-competitor mention stats for a month
create view v_competitor_mentions_monthly as
select
  m.company_id,
  m.competitor_id,
  date_trunc('month', coalesce(p.post_datetime, p.detected_at))::date as period_month,
  sum(m.mention_count)                                   as mentions,
  count(distinct nullif(m.mentioned_by,''))              as unique_recommenders,
  count(*) filter (where m.sentiment='positive')         as positive_mentions,
  count(*) filter (where m.sentiment='negative')         as negative_mentions,
  count(*) filter (where m.unprompted)                   as unprompted_mentions,
  count(distinct p.city)                                 as cities_count,
  count(*) filter (where p.urgency in ('emergency','high')) as urgent_appearances,
  max(coalesce(p.post_datetime, p.detected_at))          as last_seen
from post_mentions m
join captured_posts p on p.id = m.post_id
where m.competitor_id is not null
group by m.company_id, m.competitor_id, date_trunc('month', coalesce(p.post_datetime,p.detected_at));

-- per-competitor average response speed for a month
create view v_competitor_speed_monthly as
select
  r.company_id, r.competitor_id,
  date_trunc('month', coalesce(p.post_datetime, p.detected_at))::date as period_month,
  round(avg(t.response_minutes))::int as avg_response_minutes,
  count(*) as responses
from competitor_responses r
join captured_posts p on p.id = r.post_id
join v_response_times t on t.id = r.id
group by r.company_id, r.competitor_id, date_trunc('month', coalesce(p.post_datetime,p.detected_at));

-- latest Google snapshot per competitor + 30-day review velocity
create view v_competitor_google as
with latest as (
  select distinct on (competitor_id) competitor_id, company_id, rating, review_count, captured_at
  from google_snapshots order by competitor_id, captured_at desc
),
prior as (
  select distinct on (competitor_id) competitor_id, review_count as prior_count, captured_at as prior_at
  from google_snapshots
  where captured_at <= now() - interval '30 days'
  order by competitor_id, captured_at desc
)
select l.company_id, l.competitor_id, l.rating, l.review_count,
       greatest(0, coalesce(l.review_count - p.prior_count, 0)) as reviews_last_30d
from latest l left join prior p on p.competitor_id = l.competitor_id;

-- unanswered recommendation posts (no competitor response, ITG hasn't acted)
create view v_unanswered_posts as
select p.*,
       round(extract(epoch from (now() - coalesce(p.post_datetime, p.detected_at)))/60)::int as age_minutes
from captured_posts p
where p.request_category in ('company_recommendation','repair','spring_repair',
      'opener_repair','broken_door','off_track','emergency','overhead_door','installation')
  and not exists (select 1 from competitor_responses r where r.post_id = p.id)
  and not exists (select 1 from suggested_responses s
                  where s.post_id = p.id and s.status in ('approved','posted'));

-- ===========================================================================
-- ROW LEVEL SECURITY
-- ===========================================================================
alter table mp_users             enable row level security;
alter table markets              enable row level security;
alter table scoring_config       enable row level security;
alter table market_sources       enable row level security;
alter table tracked_groups       enable row level security;
alter table competitors          enable row level security;
alter table competitor_aliases   enable row level security;
alter table google_snapshots     enable row level security;
alter table captured_posts       enable row level security;
alter table post_mentions        enable row level security;
alter table post_comments        enable row level security;
alter table competitor_responses enable row level security;
alter table suggested_responses  enable row level security;
alter table response_approvals   enable row level security;
alter table market_scores        enable row level security;
alter table city_rankings        enable row level security;
alter table alerts               enable row level security;
alter table audit_log            enable row level security;

-- Generic company-scoped SELECT for any active member of the company.
do $$
declare t text;
begin
  foreach t in array array[
    'markets','scoring_config','market_sources','tracked_groups','competitors','competitor_aliases',
    'google_snapshots','captured_posts','post_mentions','post_comments','competitor_responses',
    'suggested_responses','response_approvals','market_scores','city_rankings','alerts']
  loop
    execute format(
      'create policy %I_sel on market_pulse.%I for select to authenticated using (company_id = market_pulse.mp_company());',
      t, t);
  end loop;
end $$;

-- mp_users: members see their company; only admin writes.
create policy mp_users_sel on mp_users for select to authenticated
  using (company_id = mp_company());
create policy mp_users_admin on mp_users for all to authenticated
  using (company_id = mp_company() and mp_current_role() = 'admin')
  with check (company_id = mp_company() and mp_current_role() = 'admin');

-- audit_log: admin read only (no client writes; service role inserts).
create policy audit_admin_sel on audit_log for select to authenticated
  using (company_id = mp_company() and mp_current_role() = 'admin');

-- Config + competitor catalog: admin + marketing_manager write.
do $$
declare t text;
begin
  foreach t in array array[
    'markets','scoring_config','market_sources','tracked_groups','competitors',
    'competitor_aliases','google_snapshots']
  loop
    execute format($f$
      create policy %1$s_wr on market_pulse.%1$s for all to authenticated
        using (company_id = market_pulse.mp_company()
               and market_pulse.mp_current_role() in ('admin','marketing_manager'))
        with check (company_id = market_pulse.mp_company()
               and market_pulse.mp_current_role() in ('admin','marketing_manager'));
    $f$, t);
  end loop;
end $$;

-- Captured intel: admin + marketing_manager + reviewer write (data entry/correction).
do $$
declare t text;
begin
  foreach t in array array[
    'captured_posts','post_mentions','post_comments','competitor_responses','suggested_responses']
  loop
    execute format($f$
      create policy %1$s_wr on market_pulse.%1$s for all to authenticated
        using (company_id = market_pulse.mp_company()
               and market_pulse.mp_current_role() in ('admin','marketing_manager','reviewer'))
        with check (company_id = market_pulse.mp_company()
               and market_pulse.mp_current_role() in ('admin','marketing_manager','reviewer'));
    $f$, t);
  end loop;
end $$;

-- Approvals: admin + marketing_manager ONLY (spec §15).
create policy approvals_wr on response_approvals for all to authenticated
  using (company_id = mp_company() and mp_current_role() in ('admin','marketing_manager'))
  with check (company_id = mp_company() and mp_current_role() in ('admin','marketing_manager'));

-- Alerts: members can acknowledge (update); creation is service-role.
create policy alerts_ack on alerts for update to authenticated
  using (company_id = mp_company() and mp_current_role() in ('admin','marketing_manager','reviewer'))
  with check (company_id = mp_company());

-- market_scores / city_rankings: NO client write policy → service role only.
