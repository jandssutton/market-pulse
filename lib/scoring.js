// lib/scoring.js — Market popularity scoring (0..100) per competitor per month.
//
// Why normalization lives here, not in SQL: the score is RELATIVE — a competitor's
// mention volume only means something compared to the rest of the field. Min-max
// normalization across the live set is awkward in a view but trivial here, and the
// weights are admin-adjustable (read from scoring_config). Heavy aggregation stays
// in SQL views; the cross-competitor math stays in code.
//
// Formula (default weights, all configurable, must sum to 1.00):
//   25% mention volume        20% unique recommenders   15% positive sentiment
//   10% response speed        10% google strength       10% review velocity
//    5% city coverage          5% recency
import { admin, COMPANY_ID } from './db.js';

const DEFAULT_WEIGHTS = {
  w_mention_volume: 0.25, w_unique_reco: 0.20, w_positive_sent: 0.15,
  w_response_speed: 0.10, w_google_strength: 0.10, w_review_velocity: 0.10,
  w_city_coverage: 0.05, w_recency: 0.05,
};

// min-max normalize a numeric field across rows to 0..1. Flat field => 0.
function normalize(rows, field, { invert = false } = {}) {
  const vals = rows.map(r => Number(r[field]) || 0);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min;
  return rows.map(r => {
    if (span === 0) return 0;
    const x = ((Number(r[field]) || 0) - min) / span;
    return invert ? 1 - x : x;
  });
}

// recency: newer last_seen => closer to 1, decaying over `windowDays`.
function recencyScore(lastSeen, windowDays = 30) {
  if (!lastSeen) return 0;
  const ageDays = (Date.now() - new Date(lastSeen).getTime()) / 86400000;
  return Math.max(0, 1 - ageDays / windowDays);
}

// google strength: blend rating (0..5 -> 0..1) and log review_count.
function googleStrength(rating, count) {
  const r = (Number(rating) || 0) / 5;
  const c = Math.min(1, Math.log10((Number(count) || 0) + 1) / 3); // ~1000 reviews ~= 1.0
  return 0.6 * r + 0.4 * c;
}

export async function computeScores({ periodMonth, market_id = null, company_id = COMPANY_ID } = {}) {
  const month = periodMonth || new Date().toISOString().slice(0, 7) + '-01';

  // Resolve which markets to score. Passing market_id scores one; omitting it
  // scores every active market independently so each location stands alone.
  let markets;
  if (market_id) markets = [{ id: market_id }];
  else {
    const { data } = await admin.from('markets').select('id').eq('company_id', company_id).eq('active', true);
    markets = data || [];
  }

  const results = [];
  for (const m of markets) results.push(await scoreOneMarket({ month, market_id: m.id, company_id }));
  return { month, markets: results.length, results };
}

async function scoreOneMarket({ month, market_id, company_id }) {
  // weights
  const { data: cfg } = await admin.from('scoring_config')
    .select('*').eq('company_id', company_id).maybeSingle();
  const w = cfg || DEFAULT_WEIGHTS;

  // competitor universe for THIS market (exclude the ITG self-row)
  const { data: comps } = await admin.from('competitors')
    .select('id,name,is_self').eq('company_id', company_id).eq('market_id', market_id);
  const competitors = (comps || []).filter(c => !c.is_self);
  if (!competitors.length) return { market_id, scored: 0 };

  // raw stats from views
  const [{ data: mentions }, { data: speed }, { data: google }] = await Promise.all([
    admin.from('v_competitor_mentions_monthly').select('*')
      .eq('company_id', company_id).eq('period_month', month),
    admin.from('v_competitor_speed_monthly').select('*')
      .eq('company_id', company_id).eq('period_month', month),
    admin.from('v_competitor_google').select('*').eq('company_id', company_id),
  ]);

  const mById = Object.fromEntries((mentions || []).map(r => [r.competitor_id, r]));
  const sById = Object.fromEntries((speed || []).map(r => [r.competitor_id, r]));
  const gById = Object.fromEntries((google || []).map(r => [r.competitor_id, r]));

  // assemble per-competitor raw rows
  const rows = competitors.map(c => {
    const m = mById[c.id] || {};
    const s = sById[c.id] || {};
    const g = gById[c.id] || {};
    return {
      competitor_id: c.id,
      name: c.name,
      mentions: m.mentions || 0,
      unique_recommenders: m.unique_recommenders || 0,
      positive_mentions: m.positive_mentions || 0,
      cities_count: m.cities_count || 0,
      last_seen: m.last_seen || null,
      avg_response_minutes: s.avg_response_minutes ?? null,
      google_strength_raw: googleStrength(g.rating, g.review_count),
      reviews_last_30d: g.reviews_last_30d || 0,
    };
  });

  // normalized 0..1 vectors
  const nMention   = normalize(rows, 'mentions');
  const nUnique    = normalize(rows, 'unique_recommenders');
  const nPositive  = normalize(rows, 'positive_mentions');
  // response speed: fewer minutes is better => invert; missing speed scores 0
  const speedRows  = rows.map(r => ({ v: r.avg_response_minutes == null ? null : r.avg_response_minutes }));
  const present    = speedRows.filter(r => r.v != null).map(r => r.v);
  const sMin = present.length ? Math.min(...present) : 0;
  const sMax = present.length ? Math.max(...present) : 0;
  const nSpeed = speedRows.map(r => {
    if (r.v == null) return 0;
    if (sMax - sMin === 0) return 1;
    return 1 - (r.v - sMin) / (sMax - sMin);
  });
  const nGoogle    = normalize(rows, 'google_strength_raw');
  const nVelocity  = normalize(rows, 'reviews_last_30d');
  const nCity      = normalize(rows, 'cities_count');
  const nRecency   = rows.map(r => recencyScore(r.last_seen));

  // weighted 0..100
  const scored = rows.map((r, i) => {
    const components = {
      mention_volume:  nMention[i],
      unique_reco:     nUnique[i],
      positive_sent:   nPositive[i],
      response_speed:  nSpeed[i],
      google_strength: nGoogle[i],
      review_velocity: nVelocity[i],
      city_coverage:   nCity[i],
      recency:         nRecency[i],
    };
    const score = 100 * (
      w.w_mention_volume  * components.mention_volume  +
      w.w_unique_reco     * components.unique_reco     +
      w.w_positive_sent   * components.positive_sent   +
      w.w_response_speed  * components.response_speed  +
      w.w_google_strength * components.google_strength +
      w.w_review_velocity * components.review_velocity +
      w.w_city_coverage   * components.city_coverage   +
      w.w_recency         * components.recency
    );
    return {
      company_id, market_id, competitor_id: r.competitor_id, period_month: month,
      score: Math.round(score * 100) / 100,
      components: { normalized: components, weights: w, raw: r },
    };
  });

  scored.sort((a, b) => b.score - a.score);
  scored.forEach((s, idx) => { s.rank_overall = idx + 1; });

  // persist (service role; upsert on company+market+competitor+month)
  await admin.from('market_scores')
    .upsert(scored, { onConflict: 'company_id,market_id,competitor_id,period_month' });

  await computeCityRankings({ month, market_id, company_id, scoreById:
    Object.fromEntries(scored.map(s => [s.competitor_id, s.score])) });

  return { market_id, scored: scored.length, top: scored.slice(0, 10) };
}

// Per-city rankings WITHIN a market: rank competitors by mentions (score breaks ties).
async function computeCityRankings({ month, market_id, company_id, scoreById }) {
  const { data: mentions } = await admin.from('post_mentions')
    .select('competitor_id, captured_posts!inner(city, post_datetime, detected_at, company_id, market_id)')
    .eq('company_id', company_id);

  const byCity = {}; // city -> competitor_id -> count
  for (const m of mentions || []) {
    const p = m.captured_posts;
    if (!p || !m.competitor_id || p.market_id !== market_id) continue;
    const d = (p.post_datetime || p.detected_at || '').slice(0, 7) + '-01';
    if (d !== month) continue;
    const city = p.city || 'Unknown';
    byCity[city] = byCity[city] || {};
    byCity[city][m.competitor_id] = (byCity[city][m.competitor_id] || 0) + 1;
  }

  const rows = [];
  for (const [city, counts] of Object.entries(byCity)) {
    const ranked = Object.entries(counts)
      .map(([competitor_id, mentions]) => ({
        company_id, market_id, city, period_month: month, competitor_id,
        mentions, score: scoreById[competitor_id] || 0,
      }))
      .sort((a, b) => b.mentions - a.mentions || b.score - a.score);
    ranked.forEach((r, i) => { r.rank = i + 1; });
    rows.push(...ranked);
  }
  if (rows.length) {
    await admin.from('city_rankings')
      .upsert(rows, { onConflict: 'company_id,market_id,city,period_month,competitor_id' });
  }
  return rows.length;
}
