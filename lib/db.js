// lib/db.js — Supabase service-role client for Market Pulse server code.
// Service role BYPASSES RLS. Never import this in browser code. The schema lives
// in the `market_pulse` Postgres schema, so we scope the client to it.
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.warn('[market-pulse] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set');
}

export const admin = createClient(url, serviceKey, {
  auth: { persistSession: false },
  db: { schema: 'market_pulse' },
});

// Single-tenant convenience; the schema is company-scoped for franchise reuse.
export const COMPANY_ID = process.env.MARKET_PULSE_COMPANY_ID;

// Write an audit row. Best-effort; never throws into the caller.
export async function audit(action, entity, entity_id, before, after, actor = null) {
  try {
    await admin.from('audit_log').insert({
      company_id: COMPANY_ID, actor, action, entity, entity_id, before, after,
    });
  } catch (e) {
    console.error('[market-pulse] audit failed:', e.message);
  }
}
