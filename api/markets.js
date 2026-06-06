// api/markets.js — market (territory) management.
//   GET  /api/markets                list markets for the dropdowns
//   POST /api/markets  { name, state, zip_codes[], anchor_cities[], center_lat, center_lng }
//                                     create a market (admin/marketing_manager)
import { userClient, callerRole, readBody, json } from '../lib/http.js';
import { admin, COMPANY_ID, audit } from '../lib/db.js';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const sb = userClient(req);
    const { data, error } = await sb.from('markets').select('*').eq('active', true).order('name');
    if (error) return json(res, 400, { error: error.message });
    return json(res, 200, { markets: data });
  }
  if (req.method === 'POST') {
    const { user, role } = await callerRole(req);
    if (!user) return json(res, 401, { error: 'unauthenticated' });
    if (!['admin', 'marketing_manager'].includes(role)) return json(res, 403, { error: 'forbidden' });
    const b = await readBody(req);
    if (!b.name) return json(res, 400, { error: 'name_required' });
    const row = {
      company_id: COMPANY_ID, name: b.name, state: b.state || null,
      zip_codes: b.zip_codes || [], anchor_cities: b.anchor_cities || [],
      center_lat: b.center_lat ?? null, center_lng: b.center_lng ?? null,
      search_radius_m: b.search_radius_m || 30000,
    };
    const { data, error } = await admin.from('markets').insert(row).select().single();
    if (error) return json(res, 400, { error: error.message });
    await audit('create', 'markets', data.id, null, row, user.id);
    return json(res, 201, { market: data });
  }
  return json(res, 405, { error: 'method_not_allowed' });
}
