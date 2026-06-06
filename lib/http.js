// lib/http.js — request helpers shared by API routes.
import { createClient } from '@supabase/supabase-js';

// A Supabase client bound to the CALLER's JWT, scoped to the market_pulse schema.
// RLS applies, so these calls are safe to expose to the browser.
export function userClient(req) {
  const auth = req.headers?.authorization || '';
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
    db: { schema: 'market_pulse' },
  });
}

// Resolve the caller's mp_users role (or null). Used to gate write routes in code
// as a fast-fail; RLS is still the real enforcement.
export async function callerRole(req) {
  const sb = userClient(req);
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { user: null, role: null };
  const { data } = await sb.from('mp_users').select('role').eq('id', user.id).maybeSingle();
  return { user, role: data?.role || null };
}

export function readBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise((resolve) => {
    let raw = ''; req.on('data', c => (raw += c));
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { resolve({}); } });
  });
}

export const json = (res, code, payload) => {
  res.statusCode = code;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(payload));
};
