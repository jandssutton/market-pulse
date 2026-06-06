// api/cron/places-discovery.js — GET /api/cron/places-discovery (CRON_SECRET)
//
// THE automation that keeps each market's competitor list current with zero
// manual list-building. For every active market it runs a Google Places text
// search ("garage door repair") biased to the market's center, then upserts each
// result as a competitor SCOPED TO THAT MARKET (deduped by place_id). New finds
// land as tier='unknown', discovered=true — they show up in a review queue for
// you to promote/flag/merge. It also writes a google_snapshot so rating/review
// velocity starts tracking immediately.
//
// This is per-location by construction: a market's zip-defined geography is the
// search area, so Precision-Memphis and Precision-Jackson come back as separate
// local listings under their own markets — never a national rollup.
//
// No-op unless GOOGLE_PLACES_API_KEY is set. Confirm Places API terms/quotas at setup.
import { admin, COMPANY_ID } from '../../lib/db.js';

const QUERIES = ['garage door repair', 'garage door company', 'overhead door'];

export default async function handler(req, res) {
  if ((req.headers.authorization || '') !== `Bearer ${process.env.CRON_SECRET}`)
    return res.status(401).json({ error: 'unauthorized' });
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return res.status(200).json({ skipped: 'places_not_configured' });

  const { data: markets } = await admin.from('markets')
    .select('id,name,center_lat,center_lng,search_radius_m,anchor_cities')
    .eq('company_id', COMPANY_ID).eq('active', true);

  const summary = [];
  for (const m of markets || []) {
    const seen = new Map(); // place_id -> result
    for (const query of QUERIES) {
      const results = await placesText(query, m, key).catch(() => []);
      for (const r of results) if (r.place_id) seen.set(r.place_id, r);
    }

    let created = 0, updated = 0;
    for (const r of seen.values()) {
      // is this our own listing? skip flipping is_self automatically — leave that to curation
      const { data: existing } = await admin.from('competitors')
        .select('id').eq('market_id', m.id).eq('google_place_id', r.place_id).maybeSingle();

      const fields = {
        company_id: COMPANY_ID, market_id: m.id, name: r.name,
        google_place_id: r.place_id, google_rating: r.rating ?? null,
        google_review_count: r.user_ratings_total ?? null,
        service_area: m.name,
      };
      if (existing) {
        await admin.from('competitors').update({
          google_rating: fields.google_rating, google_review_count: fields.google_review_count,
        }).eq('id', existing.id);
        updated++;
        await snapshot(existing.id, r);
      } else {
        const { data: ins } = await admin.from('competitors')
          .insert({ ...fields, discovered: true, tier: 'unknown', org_type: 'unknown' })
          .select('id').single();
        created++;
        if (ins) await snapshot(ins.id, r);
      }
    }
    summary.push({ market: m.name, found: seen.size, created, updated });
  }
  return res.status(200).json({ markets: summary });
}

async function placesText(query, market, key) {
  let url = `https://maps.googleapis.com/maps/api/place/textsearch/json`
    + `?query=${encodeURIComponent(query)}&key=${key}`;
  if (market.center_lat != null && market.center_lng != null) {
    url += `&location=${market.center_lat},${market.center_lng}&radius=${market.search_radius_m || 30000}`;
  } else if (market.anchor_cities?.length) {
    url = `https://maps.googleapis.com/maps/api/place/textsearch/json`
      + `?query=${encodeURIComponent(query + ' ' + market.anchor_cities[0])}&key=${key}`;
  }
  const r = await fetch(url);
  const data = await r.json();
  return data.results || [];
}

async function snapshot(competitor_id, r) {
  try {
    await admin.from('google_snapshots').insert({
      company_id: COMPANY_ID, competitor_id,
      rating: r.rating ?? null, review_count: r.user_ratings_total ?? null,
      capture_method: 'official_api',
    });
  } catch { /* best effort */ }
}
