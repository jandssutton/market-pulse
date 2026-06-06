-- ============================================================================
-- Market Pulse — seed data (demo). Deterministic UUIDs. Run AFTER schema.sql.
-- The company_id below should equal your MARKET_PULSE_COMPANY_ID env var.
-- mp_users ids are illustrative — replace with real auth.users uids in prod.
-- ============================================================================
set search_path = market_pulse, public;

-- Company anchor (used as company_id everywhere)
-- d1d1d1d1-0000-4000-8000-000000000001

-- ---- users (role mapping) -------------------------------------------------
insert into mp_users (id, company_id, email, full_name, role) values
 ('11111111-0000-4000-8000-000000000001','d1d1d1d1-0000-4000-8000-000000000001','justin@insidetrack...','Justin (Owner)','admin'),
 ('11111111-0000-4000-8000-000000000002','d1d1d1d1-0000-4000-8000-000000000001','mktg@insidetrack...','Marketing Manager','marketing_manager'),
 ('11111111-0000-4000-8000-000000000003','d1d1d1d1-0000-4000-8000-000000000001','review@insidetrack...','Reviewer','reviewer'),
 ('11111111-0000-4000-8000-000000000004','d1d1d1d1-0000-4000-8000-000000000001','partner@insidetrack...','Partner (read only)','read_only_partner');

-- ---- scoring config (default weights) -------------------------------------
insert into scoring_config (company_id) values ('d1d1d1d1-0000-4000-8000-000000000001');

-- ---- markets (zip-defined territories; one per location) ------------------
-- Memphis market id: aa000000-0000-4000-8000-000000000001
-- Jackson  market id: aa000000-0000-4000-8000-000000000002
insert into markets (id, company_id, name, state, zip_codes, anchor_cities, center_lat, center_lng, search_radius_m) values
 ('aa000000-0000-4000-8000-000000000001','d1d1d1d1-0000-4000-8000-000000000001','Memphis Metro + DeSoto','TN',
   array['38103','38016','38018','38002','38133','38135','38138','38139','38017','38654','38671','38672','38632','38651'],
   array['Memphis','Cordova','Bartlett','Lakeland','Arlington','Germantown','Collierville','Olive Branch','Southaven','Hernando','Nesbit'],
   35.0840, -89.9000, 35000),
 ('aa000000-0000-4000-8000-000000000002','d1d1d1d1-0000-4000-8000-000000000001','Jackson MS','MS',
   array['39201','39211','39157','39042','39056','39047','39208'],
   array['Jackson','Ridgeland','Brandon','Clinton','Madison','Pearl'],
   32.2988, -90.1848, 35000);

-- ---- market sources (ingestion paths, compliance-forward) -----------------
insert into market_sources (id, company_id, platform, display_name, ingestion, compliance_note) values
 ('20000000-0000-4000-8000-000000000001','d1d1d1d1-0000-4000-8000-000000000001','facebook_group','Facebook Groups','manual_entry','No compliant group-search API; manual/authorized-member capture only.'),
 ('20000000-0000-4000-8000-000000000002','d1d1d1d1-0000-4000-8000-000000000001','nextdoor','Nextdoor','manual_entry','No public API; manual/screenshot capture by an authorized member only.'),
 ('20000000-0000-4000-8000-000000000003','d1d1d1d1-0000-4000-8000-000000000001','reddit','Reddit','official_api','Official OAuth API; local subreddits only.'),
 ('20000000-0000-4000-8000-000000000004','d1d1d1d1-0000-4000-8000-000000000001','google_reviews','Google Reviews','official_api','Places API for rating/review counts (no review-text scraping).');

-- ---- tracked groups -------------------------------------------------------
insert into tracked_groups (id, company_id, market_id, source_id, platform, name, city, market, is_private, authorized) values
 ('30000000-0000-4000-8000-000000000001','d1d1d1d1-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','facebook_group','Olive Branch Community','Olive Branch','DeSoto County',true,true),
 ('30000000-0000-4000-8000-000000000002','d1d1d1d1-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','nextdoor','Southaven Neighbors','Southaven','DeSoto County',true,true),
 ('30000000-0000-4000-8000-000000000003','d1d1d1d1-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000003','reddit','r/memphis','Memphis','Memphis metro',false,false);

-- ---- competitors (incl. the ITG self-row) ---------------------------------
insert into competitors
 (id, company_id, market_id, name, is_self, service_area, website, phone, google_place_id, google_rating, google_review_count, tier, org_type, scam_concern, strengths, weaknesses) values
 ('c0000000-0000-4000-8000-000000000000','d1d1d1d1-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001','Inside Track Garage Door',true,'Memphis metro + DeSoto County',null,null,null,5.0,12,'unknown','local_independent',false,'Fast, local, no-pressure inspections',null),
 ('c0000000-0000-4000-8000-000000000001','d1d1d1d1-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001','Precision Garage Door',false,'Memphis metro','','', 'PLACE_PRECISION',4.6,820,'major','franchise',false,'Brand recognition, broad coverage','Premium pricing, upsell reputation'),
 ('c0000000-0000-4000-8000-000000000002','d1d1d1d1-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001','A-1 Overhead Door',false,'DeSoto County','','','PLACE_A1',4.8,310,'major','local_independent',false,'Strong local reputation, fast','Limited after-hours'),
 ('c0000000-0000-4000-8000-000000000003','d1d1d1d1-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001','Memphis Door Pros',false,'Memphis','','','PLACE_MDP',4.2,140,'minor','local_independent',false,'Cheap','Slow responses, mixed reviews'),
 ('c0000000-0000-4000-8000-000000000004','d1d1d1d1-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001','QuickFix Garage Leads',false,'unknown','','',null,3.1,18,'minor','lead_gen',true,'Aggressive online presence','Lead-gen reseller, not a real local crew');

insert into competitor_aliases (company_id, competitor_id, alias) values
 ('d1d1d1d1-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','Precision Doors'),
 ('d1d1d1d1-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','Precision Overhead'),
 ('d1d1d1d1-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000002','A1 Overhead'),
 ('d1d1d1d1-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000003','MDP');

-- ---- google snapshots (so velocity is computable: now vs 30+ days ago) -----
insert into google_snapshots (company_id, competitor_id, captured_at, rating, review_count) values
 ('d1d1d1d1-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001', now() - interval '35 days', 4.6, 795),
 ('d1d1d1d1-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001', now(), 4.6, 820),
 ('d1d1d1d1-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000002', now() - interval '35 days', 4.8, 298),
 ('d1d1d1d1-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000002', now(), 4.8, 310),
 ('d1d1d1d1-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000003', now() - interval '35 days', 4.2, 138),
 ('d1d1d1d1-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000003', now(), 4.2, 140);

-- ---- captured posts -------------------------------------------------------
insert into captured_posts
 (id, company_id, market_id, source_id, tracked_group_id, platform, group_name, city, market, request_category, urgency, post_datetime, original_url, capture_method, raw_text, itg_mentioned, itg_should_respond, confidence, content_hash, reviewed) values
 ('40000000-0000-4000-8000-000000000001','d1d1d1d1-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','facebook_group','Olive Branch Community','Olive Branch','DeSoto County','spring_repair','high', now() - interval '2 hours','https://facebook.com/groups/ob/posts/1','manual_entry','My garage door spring snapped this morning and the door won''t open. Who do yall recommend in Olive Branch?',false,true,0.92,'hash_post_1',true),
 ('40000000-0000-4000-8000-000000000002','d1d1d1d1-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','nextdoor','Southaven Neighbors','Southaven','DeSoto County','company_recommendation','medium', now() - interval '1 day','https://nextdoor.com/p/2','screenshot_upload','Looking for a reliable garage door company. Used Precision before but they were pricey. Any local folks?',false,true,0.88,'hash_post_2',true),
 ('40000000-0000-4000-8000-000000000003','d1d1d1d1-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000003','reddit','r/memphis','Memphis','Memphis metro','opener_repair','low', now() - interval '3 days','https://reddit.com/r/memphis/3','official_api','Garage door opener stopped working, just clicks. Worth repairing or replacing? Recommendations welcome.',false,false,0.81,'hash_post_3',false);

-- ---- post mentions --------------------------------------------------------
insert into post_mentions (company_id, post_id, competitor_id, raw_name, mention_count, mentioned_by, sentiment, unprompted, is_winner) values
 ('d1d1d1d1-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000002','A-1 Overhead',2,'Sarah M','positive',true,true),
 ('d1d1d1d1-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','Precision',1,'Dave R','neutral',false,false),
 ('d1d1d1d1-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000001','Precision',1,'(original poster)','negative',false,false),
 ('d1d1d1d1-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000002','A-1 Overhead',1,'Mike T','positive',true,true),
 ('d1d1d1d1-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000003','c0000000-0000-4000-8000-000000000003','Memphis Door Pros',1,'u/midtowner','neutral',true,false);

-- ---- competitor responses -------------------------------------------------
insert into competitor_responses
 (company_id, post_id, competitor_id, responder_name, response_datetime, response_minutes, resp_type, tone, availability_mentioned, emergency_mentioned, call_to_action, effectiveness_score) values
 ('d1d1d1d1-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000002','A-1 Overhead', now() - interval '90 minutes', 30,'ask_to_call','professional',true,true,'Call us, we can come today',82),
 ('d1d1d1d1-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000001','Precision', now() - interval '20 hours', 240,'direct_pitch','generic',false,false,'DM us for a quote',55);

-- ---- suggested responses (pending approval; never auto-posted) -------------
insert into suggested_responses (id, company_id, post_id, resp_type, angle, body, confidence, ai_generated, status) values
 ('50000000-0000-4000-8000-000000000001','d1d1d1d1-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','fb_group_public','spring_repair','Hi! Sorry about the spring — that''s a same-day fix for us most days. We''re local here in DeSoto County. Happy to take a look and give you a straight quote before any work. Feel free to message me.',0.9,true,'pending_approval'),
 ('50000000-0000-4000-8000-000000000002','d1d1d1d1-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002','private_message','local_company','Hey! Saw your post — we''re a small local crew (two trucks, based right here). No pressure and no upsell games; we''ll inspect, tell you what''s actually going on, and give you a flat quote. If it helps I can swing by this week.',0.86,true,'pending_approval');

-- ---- one approval example -------------------------------------------------
insert into response_approvals (company_id, suggested_response_id, action, acted_by) values
 ('d1d1d1d1-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','approved','11111111-0000-4000-8000-000000000002');
update suggested_responses set status='approved' where id='50000000-0000-4000-8000-000000000001';

-- ---- alerts ---------------------------------------------------------------
insert into alerts (company_id, alert_type, severity, post_id, message, channels, status) values
 ('d1d1d1d1-0000-4000-8000-000000000001','spring_repair_request','high','40000000-0000-4000-8000-000000000001','Spring repair request in Olive Branch','{dashboard,email}','sent'),
 ('d1d1d1d1-0000-4000-8000-000000000001','negative_competitor_mention','medium','40000000-0000-4000-8000-000000000002','Negative mention of Precision — opportunity to win the customer','{dashboard}','new');

-- ---- sample computed scores (so dashboards render before first recompute) --
-- These mirror what lib/scoring.js would write. Rank 1 = biggest threat.
insert into market_scores (company_id, market_id, competitor_id, period_month, score, components, rank_overall) values
 ('d1d1d1d1-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000002', date_trunc('month',now())::date, 86.40,
   '{"normalized":{"mention_volume":1.0,"unique_reco":1.0,"positive_sent":1.0,"response_speed":1.0,"google_strength":0.74,"review_velocity":0.5,"city_coverage":1.0,"recency":0.95}}', 1),
 ('d1d1d1d1-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001', date_trunc('month',now())::date, 61.20,
   '{"normalized":{"mention_volume":0.66,"unique_reco":0.5,"positive_sent":0.0,"response_speed":0.0,"google_strength":1.0,"review_velocity":1.0,"city_coverage":1.0,"recency":0.9}}', 2),
 ('d1d1d1d1-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000003', date_trunc('month',now())::date, 22.10,
   '{"normalized":{"mention_volume":0.33,"unique_reco":0.5,"positive_sent":0.0,"response_speed":0.0,"google_strength":0.45,"review_velocity":0.5,"city_coverage":0.5,"recency":0.6}}', 3);

insert into city_rankings (company_id, market_id, city, period_month, competitor_id, mentions, score, rank) values
 ('d1d1d1d1-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001','Olive Branch', date_trunc('month',now())::date,'c0000000-0000-4000-8000-000000000002',2,86.40,1),
 ('d1d1d1d1-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001','Olive Branch', date_trunc('month',now())::date,'c0000000-0000-4000-8000-000000000001',1,61.20,2),
 ('d1d1d1d1-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001','Southaven', date_trunc('month',now())::date,'c0000000-0000-4000-8000-000000000002',1,86.40,1),
 ('d1d1d1d1-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001','Southaven', date_trunc('month',now())::date,'c0000000-0000-4000-8000-000000000001',1,61.20,2),
 ('d1d1d1d1-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001','Memphis', date_trunc('month',now())::date,'c0000000-0000-4000-8000-000000000003',1,22.10,1);
