// api/cron/google-reviews-sync.js — GET /api/cron/google-reviews-sync (CRON_SECRET)
//
// Refreshes each competitor's Google rating + review_count via the Google Places
// API (Place Details) and writes a google_snapshots row so review VELOCITY can be
// computed over time. Uses each competitor's google_place_id. This is public
// business data and within Places API terms; it does NOT scrape review text.
// No-op unless GOOGLE_PLACES_API_KEY is set. Confirm current Places API field
// availability/pricing at setup.
import { admin, COMPANY_ID } from '../../lib/db.js';

export default async function handler(req, res) {
  if ((req.headers.authorization || '') !== `Bearer ${process.env.CRON_SECRET}`)
    return res.status(401).json({ error: 'unauthorized' });
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return res.status(200).json({ skipped: 'places_not_configured' });

  const { data: comps } = await admin.from('competitors')
    .select('id,name,google_place_id').eq('company_id', COMPANY_ID)
    .not('google_place_id', 'is', null);

  let updated = 0;
  for (const c of comps || []) {
    try {
      // Places API (Place Details) — rating + user_ratings_total only.
      const url = `https://maps.googleapis.com/maps/api/place/details/json`
        + `?place_id=${encodeURIComponent(c.google_place_id)}`
        + `&fields=rating,user_ratings_total&key=${key}`;
      const r = await fetch(url);
      const data = await r.json();
      const result = data.result || {};
      const rating = result.rating ?? null;
      const count = result.user_ratings_total ?? null;
      if (rating == null && count == null) continue;

      await admin.from('competitors').update({
        google_rating: rating, google_review_count: count,
      }).eq('id', c.id);
      await admin.from('google_snapshots').insert({
        company_id: COMPANY_ID, competitor_id: c.id,
        rating, review_count: count, capture_method: 'official_api',
      });
      updated++;
    } catch (e) { console.error('[places] failed for', c.name, e.message); }
  }
  return res.status(200).json({ competitors: (comps || []).length, updated });
}
