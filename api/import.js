// api/import.js — POST /api/import?type=competitors|captured_posts|post_mentions|
//                       competitor_responses|tracked_groups
// Body: { rows: [ {...}, ... ] }  (parse CSV client-side or via a CSV lib; this
// endpoint takes already-parsed JSON rows that match the csv-templates headers).
// All imports are tagged capture_method='csv_import' where applicable and run
// idempotently where a natural key exists. Admin/marketing_manager only.
import { callerRole, readBody, json } from '../lib/http.js';
import { admin, COMPANY_ID, audit } from '../lib/db.js';
import { contentHash, normName } from '../lib/dedupe.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
  const { user, role } = await callerRole(req);
  if (!user) return json(res, 401, { error: 'unauthenticated' });
  if (!['admin', 'marketing_manager'].includes(role)) return json(res, 403, { error: 'forbidden' });

  const type = req.query?.type;
  const { rows } = await readBody(req);
  if (!Array.isArray(rows) || !rows.length) return json(res, 400, { error: 'rows_required' });

  let result;
  try {
    if (type === 'competitors') result = await importCompetitors(rows);
    else if (type === 'captured_posts') result = await importPosts(rows);
    else if (type === 'tracked_groups') result = await importGroups(rows);
    else return json(res, 400, { error: 'unsupported_type' });
  } catch (e) { return json(res, 400, { error: e.message }); }

  await audit('import', type, null, null, { count: result.inserted }, user.id);
  return json(res, 200, { type, ...result });
}

async function importCompetitors(rows) {
  // upsert by normalized name to avoid duplicates
  const { data: existing } = await admin.from('competitors')
    .select('id,name').eq('company_id', COMPANY_ID);
  const byNorm = Object.fromEntries((existing || []).map(c => [normName(c.name), c.id]));
  let inserted = 0, updated = 0;
  for (const r of rows) {
    const payload = {
      company_id: COMPANY_ID, name: r.name, service_area: r.service_area || null,
      website: r.website || null, phone: r.phone || null,
      google_rating: num(r.google_rating), google_review_count: int(r.google_review_count),
      facebook_url: r.facebook_url || null, tier: r.tier || 'unknown',
      org_type: r.org_type || 'unknown', scam_concern: bool(r.scam_concern), notes: r.notes || null,
    };
    const id = byNorm[normName(r.name)];
    if (id) { await admin.from('competitors').update(payload).eq('id', id); updated++; }
    else { await admin.from('competitors').insert(payload); inserted++; }
  }
  return { inserted, updated };
}

async function importPosts(rows) {
  let inserted = 0, duplicates = 0;
  for (const r of rows) {
    const hash = contentHash(r);
    const { data: dup } = await admin.from('captured_posts')
      .select('id').eq('company_id', COMPANY_ID).eq('content_hash', hash).maybeSingle();
    if (dup) { duplicates++; continue; }
    await admin.from('captured_posts').insert({
      company_id: COMPANY_ID, platform: r.platform, group_name: r.group_name || null,
      city: r.city || null, market: r.market || null, request_category: r.request_category || null,
      urgency: r.urgency || null, post_datetime: r.post_datetime || null,
      original_url: r.original_url || null, raw_text: r.raw_text || null,
      capture_method: 'csv_import', content_hash: hash,
    });
    inserted++;
  }
  return { inserted, duplicates };
}

async function importGroups(rows) {
  let inserted = 0;
  for (const r of rows) {
    await admin.from('tracked_groups').insert({
      company_id: COMPANY_ID, platform: r.platform, name: r.name, city: r.city || null,
      market: r.market || null, url: r.url || null, is_private: bool(r.is_private),
      authorized: bool(r.authorized), notes: r.notes || null,
    });
    inserted++;
  }
  return { inserted };
}

const num = v => (v === '' || v == null ? null : Number(v));
const int = v => (v === '' || v == null ? null : parseInt(v, 10));
const bool = v => v === true || v === 'true' || v === '1' || v === 'yes';
