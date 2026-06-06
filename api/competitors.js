// api/competitors.js — competitor profile management.
//   GET  /api/competitors                  list competitors (+ latest score if present)
//   POST /api/competitors  { ...profile }   create  (admin/marketing_manager)
//   PATCH /api/competitors { id, ...fields } update  (admin/marketing_manager)
// Reads run with the caller JWT (RLS); writes go through service role after a
// role check so audit rows are written with the actor.
import { userClient, callerRole, readBody, json } from '../lib/http.js';
import { admin, COMPANY_ID, audit } from '../lib/db.js';

const FIELDS = ['name','service_area','website','phone','google_place_id','google_rating',
  'google_review_count','facebook_url','owner_manager','response_style','strengths',
  'weaknesses','tier','org_type','scam_concern','manual_popularity','notes','is_self'];

export default async function handler(req, res) {
  if (req.method === 'GET') return list(req, res);
  const { user, role } = await callerRole(req);
  if (!user) return json(res, 401, { error: 'unauthenticated' });
  if (!['admin', 'marketing_manager'].includes(role)) return json(res, 403, { error: 'forbidden' });

  if (req.method === 'POST') return create(req, res, user);
  if (req.method === 'PATCH') return patch(req, res, user);
  return json(res, 405, { error: 'method_not_allowed' });
}

async function list(req, res) {
  const sb = userClient(req);
  const { data, error } = await sb.from('competitors').select('*').order('name');
  if (error) return json(res, 400, { error: error.message });
  return json(res, 200, { competitors: data });
}

function pick(b) {
  const row = {};
  for (const f of FIELDS) if (b[f] !== undefined) row[f] = b[f];
  return row;
}

async function create(req, res, user) {
  const b = await readBody(req);
  if (!b.name) return json(res, 400, { error: 'name_required' });
  const row = { company_id: COMPANY_ID, ...pick(b) };
  const { data, error } = await admin.from('competitors').insert(row).select().single();
  if (error) return json(res, 400, { error: error.message });
  await audit('create', 'competitors', data.id, null, row, user.id);
  return json(res, 201, { competitor: data });
}

async function patch(req, res, user) {
  const b = await readBody(req);
  if (!b.id) return json(res, 400, { error: 'id_required' });
  const update = pick(b);
  const { data, error } = await admin.from('competitors')
    .update(update).eq('company_id', COMPANY_ID).eq('id', b.id).select().single();
  if (error) return json(res, 400, { error: error.message });
  await audit('update', 'competitors', b.id, null, update, user.id);
  return json(res, 200, { competitor: data });
}
