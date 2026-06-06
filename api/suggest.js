// api/suggest.js — POST /api/suggest { post_id }
// Generates 2-3 suggested responses for a post via Claude and stores them as
// pending_approval. NEVER posts anything. Human approval happens in /api/approvals.
import { callerRole, readBody, json } from '../lib/http.js';
import { admin, COMPANY_ID, audit } from '../lib/db.js';
import { draftResponses } from '../lib/claude-analysis.js';

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

  let out;
  try {
    out = await draftResponses(post, post.analysis, {
      phone: process.env.ITG_PHONE, bookingUrl: process.env.ITG_BOOKING_URL,
    });
  } catch (e) { return json(res, 502, { error: 'draft_failed', detail: e.message }); }

  const rows = (out.responses || []).map(r => ({
    company_id: COMPANY_ID, post_id,
    resp_type: r.resp_type, angle: r.angle || null,
    body: r.body, confidence: r.confidence ?? null,
    ai_generated: true, status: 'pending_approval',
  }));
  if (!rows.length) return json(res, 200, { suggestions: [] });

  const { data, error } = await admin.from('suggested_responses').insert(rows).select();
  if (error) return json(res, 400, { error: error.message });
  await audit('suggest', 'captured_posts', post_id, null, { count: rows.length }, user.id);
  return json(res, 201, { suggestions: data });
}
