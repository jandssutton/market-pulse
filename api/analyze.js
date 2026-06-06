// api/analyze.js — POST /api/analyze { post_id }
// Runs Claude classification on a captured post, writes the structured result back
// to captured_posts.analysis, materializes post_mentions (with competitor alias
// resolution), then evaluates and raises alerts. Service-role work.
import { callerRole, readBody, json } from '../lib/http.js';
import { admin, COMPANY_ID, audit } from '../lib/db.js';
import { classifyPost } from '../lib/claude-analysis.js';
import { resolveCompetitor } from '../lib/dedupe.js';
import { evaluatePost, raiseAlerts } from '../lib/alerts.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
  const { user, role } = await callerRole(req);
  if (!user) return json(res, 401, { error: 'unauthenticated' });
  if (!['admin', 'marketing_manager', 'reviewer'].includes(role))
    return json(res, 403, { error: 'forbidden' });

  const { post_id } = await readBody(req);
  if (!post_id) return json(res, 400, { error: 'post_id_required' });

  const { data: post } = await admin.from('captured_posts')
    .select('*').eq('company_id', COMPANY_ID).eq('id', post_id).single();
  if (!post) return json(res, 404, { error: 'post_not_found' });

  // 1) classify
  let cls;
  try { cls = await classifyPost(post); }
  catch (e) { return json(res, 502, { error: 'classification_failed', detail: e.message }); }

  // 2) persist analysis on the post
  await admin.from('captured_posts').update({
    request_category: cls.request_category ?? post.request_category,
    urgency: cls.urgency ?? post.urgency,
    city: cls.city ?? post.city,
    itg_mentioned: cls.itg_mentioned ?? post.itg_mentioned,
    itg_should_respond: cls.should_respond ?? null,
    analysis: cls,
    confidence: cls.confidence ?? null,
  }).eq('id', post_id);

  // 3) resolve mentions to competitors and upsert post_mentions
  const [{ data: comps }, { data: aliases }] = await Promise.all([
    admin.from('competitors').select('id,name').eq('company_id', COMPANY_ID),
    admin.from('competitor_aliases').select('competitor_id,alias').eq('company_id', COMPANY_ID),
  ]);
  // clear prior AI-derived mentions for idempotency
  await admin.from('post_mentions').delete().eq('post_id', post_id);

  const majorIds = [];
  const mentionRows = (cls.competitors_mentioned || []).map(m => {
    const { competitor_id } = resolveCompetitor(m.name, comps || [], aliases || []);
    return {
      company_id: COMPANY_ID, post_id, competitor_id,
      raw_name: m.name, mention_count: 1,
      mentioned_by: m.mentioned_by || null,
      sentiment: ['positive', 'neutral', 'negative'].includes(m.sentiment) ? m.sentiment : 'neutral',
      unprompted: !!m.unprompted,
    };
  });
  if (mentionRows.length) await admin.from('post_mentions').insert(mentionRows);

  // attach competitor_id back onto classification for alert evaluation
  cls.competitors_mentioned = (cls.competitors_mentioned || []).map((m, i) => ({
    ...m, competitor_id: mentionRows[i]?.competitor_id,
  }));
  const { data: majors } = await admin.from('competitors')
    .select('id').eq('company_id', COMPANY_ID).eq('tier', 'major');
  (majors || []).forEach(c => majorIds.push(c.id));

  // 4) evaluate + raise alerts
  const { data: cfg } = await admin.from('scoring_config')
    .select('unanswered_alert_minutes').eq('company_id', COMPANY_ID).maybeSingle();
  const alerts = evaluatePost({ ...post, ...cls }, cls,
    { majorCompetitorIds: majorIds, unansweredMinutes: cfg?.unanswered_alert_minutes || 15 });
  const channels = (process.env.MARKET_PULSE_ALERT_CHANNELS || 'dashboard').split(',');
  await raiseAlerts({ ...post, itg_mentioned: cls.itg_mentioned }, alerts, { channels });

  await audit('analyze', 'captured_posts', post_id, null, { alerts: alerts.length }, user.id);
  return json(res, 200, { classification: cls, mentions: mentionRows.length, alerts: alerts.length });
}
