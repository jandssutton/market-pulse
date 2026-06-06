// lib/dedupe.js — data-integrity helpers: competitor alias resolution and
// duplicate-post detection. Pure where possible so they can be unit-tested.
import crypto from 'crypto';

// Normalize a company name for fuzzy matching: lowercase, strip non-alphanumerics,
// drop common garage-door suffixes so "ABC Garage Doors LLC" == "abc".
const NOISE = /\b(garage|doors?|overhead|repair|service|services|company|co|llc|inc|the)\b/g;
export function normName(s) {
  return (s || '')
    .toLowerCase()
    .replace(NOISE, ' ')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

// Resolve a raw mention string to a competitor id using exact + alias + fuzzy.
// `competitors`: [{id, name}], `aliases`: [{competitor_id, alias_norm}]
// Returns { competitor_id, method } or { competitor_id: null, method: 'unmatched' }.
export function resolveCompetitor(rawName, competitors, aliases) {
  const target = normName(rawName);
  if (!target) return { competitor_id: null, method: 'unmatched' };

  // 1) alias exact (normalized with the SAME function, so JS and DB agree).
  //    Accepts either a raw `alias` string or a precomputed `alias_norm`.
  const alias = aliases.find(a => normName(a.alias ?? a.alias_norm) === target);
  if (alias) return { competitor_id: alias.competitor_id, method: 'alias' };

  // 2) competitor name exact (normalized)
  const exact = competitors.find(c => normName(c.name) === target);
  if (exact) return { competitor_id: exact.id, method: 'name_exact' };

  // 3) containment (handles "abc" vs "abcgaragedoor") with a length guard to
  //    avoid trivially-short false positives.
  if (target.length >= 4) {
    const contained = competitors.find(c => {
      const n = normName(c.name);
      return n.length >= 4 && (n.includes(target) || target.includes(n));
    });
    if (contained) return { competitor_id: contained.id, method: 'fuzzy_contains' };
  }

  return { competitor_id: null, method: 'unmatched' };
}

// Content fingerprint for duplicate-post detection. Same platform + group +
// near-identical text collapses to one hash. Whitespace/case-insensitive.
export function contentHash({ platform, group_name, raw_text, original_url }) {
  // Prefer URL when present (most reliable dedupe key), else text fingerprint.
  const basis = original_url
    ? `url:${original_url.trim().toLowerCase()}`
    : `txt:${platform}|${(group_name || '').toLowerCase()}|${(raw_text || '')
        .toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 500)}`;
  return crypto.createHash('sha256').update(basis).digest('hex').slice(0, 32);
}
