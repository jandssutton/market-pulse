// api/scores.js — popularity scores + rankings.
//   POST /api/scores/recompute   recompute market_scores + city_rankings for a month
//                                (admin/marketing_manager)  body: { month? }
//   GET  /api/scores?month=YYYY-MM-01    overall ranking + per-city + named rankings
//
// The GET shape powers the Executive + Competitor Ranking + City dashboards.
import { userClient, callerRole, readBody, json } from '../lib/http.js';
import { COMPANY_ID } from '../lib/db.js';
import { computeScores } from '../lib/scoring.js';

export default async function handler(req, res) {
  const isRecompute = (req.url || '').includes('/recompute') || req.query?.recompute === '1';
  if (req.method === 'POST' && isRecompute) return recompute(req, res);
  if (req.method === 'GET') return read(req, res);
  return json(res, 405, { error: 'method_not_allowed' });
}

async function recompute(req, res) {
  const { user, role } = await callerRole(req);
  if (!user) return json(res, 401, { error: 'unauthenticated' });
  if (!['admin', 'marketing_manager'].includes(role)) return json(res, 403, { error: 'forbidden' });
  const { month, market_id } = await readBody(req);
  const result = await computeScores({ periodMonth: month, market_id: market_id || null });
  return json(res, 200, result);
}

async function read(req, res) {
  const sb = userClient(req);
  const month = req.query?.month || new Date().toISOString().slice(0, 7) + '-01';
  const marketId = req.query?.market_id || null;

  // overall ranking joined to competitor profile
  let q = sb.from('market_scores')
    .select('score, rank_overall, components, competitor_id, market_id, competitors!inner(name,tier,org_type,google_rating,google_review_count)')
    .eq('period_month', month).order('rank_overall');
  if (marketId) q = q.eq('market_id', marketId);
  const { data: scores, error } = await q;
  if (error) return json(res, 400, { error: error.message });

  const ranking = (scores || []).map(s => ({
    rank: s.rank_overall, competitor_id: s.competitor_id, name: s.competitors.name,
    tier: s.competitors.tier, org_type: s.competitors.org_type,
    google_rating: s.competitors.google_rating, google_review_count: s.competitors.google_review_count,
    score: Number(s.score), components: s.components?.normalized || {},
  }));

  // per-city top competitors
  let cq = sb.from('city_rankings')
    .select('city, rank, mentions, score, market_id, competitors!inner(name)')
    .eq('period_month', month).order('city').order('rank');
  if (marketId) cq = cq.eq('market_id', marketId);
  const { data: city } = await cq;

  // named rankings derived from the same set
  const named = {
    most_mentioned: [...ranking].sort((a, b) => (b.components.mention_volume || 0) - (a.components.mention_volume || 0)).slice(0, 5),
    fastest_response: [...ranking].sort((a, b) => (b.components.response_speed || 0) - (a.components.response_speed || 0)).slice(0, 5),
    best_reviewed: [...ranking].sort((a, b) => (b.google_rating || 0) - (a.google_rating || 0)).slice(0, 5),
    strongest_google: [...ranking].sort((a, b) => (b.components.google_strength || 0) - (a.components.google_strength || 0)).slice(0, 5),
    biggest_threat: ranking.slice(0, 5), // top overall score = biggest threat
  };

  return json(res, 200, { month, ranking, city_rankings: city || [], named });
}
