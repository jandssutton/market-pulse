// api/posts.js — capture a market post and list the post feed.
//   GET  /api/posts?city=&platform=&urgency=&category=&should_respond=&from=&to=&q=
//   POST /api/posts   { platform, group_name, city, market, request_category,
//                       urgency, post_datetime, original_url, raw_text, screenshot_path,
//                       capture_method, itg_mentioned, tracked_group_id, source_id }
//
// Capture is human/authorized only: capture_method records HOW the data was
// obtained (manual_entry, screenshot_upload, csv_import, authorized_export,
// official_api). Duplicate posts collapse on a content fingerprint.
import { userClient, callerRole, readBody, json } from '../lib/http.js';
import { admin, COMPANY_ID, audit } from '../lib/db.js';
import { contentHash } from '../lib/dedupe.js';

export default async function handler(req, res) {
  if (req.method === 'GET') return list(req, res);
  if (req.method === 'POST') return create(req, res);
  return json(res, 405, { error: 'method_not_allowed' });
}

async function list(req, res) {
  const sb = userClient(req);
  const q = req.query || {};
  let query = sb.from('captured_posts').select('*').order('post_datetime', { ascending: false }).limit(200);
  if (q.market_id) query = query.eq('market_id', q.market_id);
  if (q.city) query = query.eq('city', q.city);
  if (q.platform) query = query.eq('platform', q.platform);
  if (q.urgency) query = query.eq('urgency', q.urgency);
  if (q.category) query = query.eq('request_category', q.category);
  if (q.should_respond != null) query = query.eq('itg_should_respond', q.should_respond === 'true');
  if (q.from) query = query.gte('post_datetime', q.from);
  if (q.to) query = query.lte('post_datetime', q.to);
  if (q.q) query = query.ilike('raw_text', `%${q.q}%`);
  const { data, error } = await query;
  if (error) return json(res, 400, { error: error.message });
  return json(res, 200, { posts: data });
}

async function create(req, res) {
  const { user, role } = await callerRole(req);
  if (!user) return json(res, 401, { error: 'unauthenticated' });
  if (!['admin', 'marketing_manager', 'reviewer'].includes(role))
    return json(res, 403, { error: 'forbidden' });

  const b = await readBody(req);
  if (!b.platform) return json(res, 400, { error: 'platform_required' });

  const hash = contentHash(b);
  // dedupe (service role read so we can see across users)
  const { data: dup } = await admin.from('captured_posts')
    .select('id').eq('company_id', COMPANY_ID).eq('content_hash', hash).maybeSingle();
  if (dup) return json(res, 200, { post_id: dup.id, duplicate: true });

  const row = {
    company_id: COMPANY_ID,
    market_id: b.market_id || null,
    source_id: b.source_id || null,
    tracked_group_id: b.tracked_group_id || null,
    platform: b.platform,
    group_name: b.group_name || null,
    city: b.city || null,
    market: b.market || null,
    request_category: b.request_category || null,
    urgency: b.urgency || null,
    post_datetime: b.post_datetime || null,
    original_url: b.original_url || null,
    screenshot_path: b.screenshot_path || null,
    capture_method: b.capture_method || 'manual_entry',
    raw_text: b.raw_text || null,
    itg_mentioned: !!b.itg_mentioned,
    content_hash: hash,
    created_by: user.id,
  };
  const { data, error } = await admin.from('captured_posts').insert(row).select().single();
  if (error) return json(res, 400, { error: error.message });
  await audit('create', 'captured_posts', data.id, null, row, user.id);
  return json(res, 201, { post: data });
}
