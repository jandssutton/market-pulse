// api/cron/reddit-sync.js — GET /api/cron/reddit-sync   (Vercel Cron; CRON_SECRET)
//
// Pulls recent posts from configured local subreddits via Reddit's OFFICIAL OAuth
// API and stores keyword matches as captured_posts (capture_method='official_api').
// This is the only auto-ingestion path that respects platform rules out of the box;
// Facebook Groups / Nextdoor have no compliant public search API, so those stay
// manual/authorized-export. No-op unless REDDIT_* env vars are set.
//
// Setup notes (confirm current terms/quotas at setup):
//   REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USER_AGENT
//   REDDIT_SUBREDDITS  e.g. "memphis,Southaven,olivebranch"
import { admin, COMPANY_ID } from '../../lib/db.js';
import { contentHash } from '../../lib/dedupe.js';

const KEYWORDS = [
  'garage door', 'garage door repair', 'garage door spring', 'garage door opener',
  'broken garage door', 'garage door off track', 'overhead door', 'garage door installer',
];

export default async function handler(req, res) {
  if ((req.headers.authorization || '') !== `Bearer ${process.env.CRON_SECRET}`)
    return res.status(401).json({ error: 'unauthorized' });
  if (!process.env.REDDIT_CLIENT_ID) return res.status(200).json({ skipped: 'reddit_not_configured' });

  const subs = (process.env.REDDIT_SUBREDDITS || 'memphis').split(',').map(s => s.trim());
  let token;
  try { token = await redditToken(); }
  catch (e) { return res.status(502).json({ error: 'reddit_auth_failed', detail: e.message }); }

  let inserted = 0, scanned = 0;
  for (const sub of subs) {
    const posts = await redditNew(sub, token).catch(() => []);
    for (const p of posts) {
      scanned++;
      const text = `${p.title} ${p.selftext || ''}`.toLowerCase();
      if (!KEYWORDS.some(k => text.includes(k))) continue;

      const row = {
        platform: 'reddit', group_name: `r/${sub}`,
        raw_text: `${p.title}\n\n${p.selftext || ''}`.slice(0, 8000),
        original_url: `https://www.reddit.com${p.permalink}`,
        post_datetime: new Date(p.created_utc * 1000).toISOString(),
      };
      const hash = contentHash(row);
      const { data: dup } = await admin.from('captured_posts')
        .select('id').eq('company_id', COMPANY_ID).eq('content_hash', hash).maybeSingle();
      if (dup) continue;
      await admin.from('captured_posts').insert({
        company_id: COMPANY_ID, ...row, capture_method: 'official_api', content_hash: hash,
      });
      inserted++;
    }
  }
  return res.status(200).json({ subs, scanned, inserted });
}

async function redditToken() {
  const basic = Buffer.from(`${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`).toString('base64');
  const r = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: { authorization: `Basic ${basic}`, 'content-type': 'application/x-www-form-urlencoded',
      'user-agent': process.env.REDDIT_USER_AGENT || 'market-pulse/1.0' },
    body: 'grant_type=client_credentials',
  });
  if (!r.ok) throw new Error(`token ${r.status}`);
  return (await r.json()).access_token;
}

async function redditNew(sub, token) {
  const r = await fetch(`https://oauth.reddit.com/r/${sub}/new?limit=50`, {
    headers: { authorization: `Bearer ${token}`, 'user-agent': process.env.REDDIT_USER_AGENT || 'market-pulse/1.0' },
  });
  if (!r.ok) throw new Error(`listing ${r.status}`);
  return ((await r.json()).data?.children || []).map(c => c.data);
}
