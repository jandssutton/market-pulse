// lib/claude-analysis.js — AI classification + suggested-response drafting.
// Calls the Anthropic Messages API server-side. Output is strict JSON we persist
// to captured_posts.analysis and fan out into post_mentions / suggested_responses.
//
// Two prompts: classifyPost() reads a captured thread and returns structured
// intelligence; draftResponses() turns an approved-for-drafting post into
// human-sounding, ToS-safe suggested responses (never auto-posted).

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';

async function callClaude({ system, user, maxTokens = 1500 }) {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  return parseJson(text);
}

// Models occasionally wrap JSON in prose or fences; extract the object safely.
function parseJson(text) {
  let t = (text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = t.indexOf('{'), end = t.lastIndexOf('}');
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  return JSON.parse(t);
}

// ---------------------------------------------------------------------------
// CLASSIFY
// ---------------------------------------------------------------------------
const CLASSIFY_SYSTEM = `You are a local-market intelligence analyst for a residential garage-door
repair company (Inside Track Garage Door) operating in the Memphis metro and DeSoto County, MS.
You read a single social/forum post or thread and extract structured competitive intelligence.

You ONLY analyze text that was provided to you. Do not invent details, names, or quotes that are
not present. If something is unknown, use null. Be conservative with sentiment and intent.

Return ONLY a JSON object, no prose, with EXACTLY this shape:
{
  "request_category": one of ["company_recommendation","repair","spring_repair","opener_repair",
     "broken_door","off_track","emergency","overhead_door","installation","other"],
  "urgency": one of ["emergency","high","medium","low"],
  "city": string or null,            // the city/market if stated or clearly implied
  "competitors_mentioned": [
     { "name": string, "sentiment": "positive"|"neutral"|"negative",
       "mentioned_by": string|null, "unprompted": boolean }
  ],
  "itg_mentioned": boolean,          // is "Inside Track" mentioned?
  "likely_intent": string,           // one short sentence on what the homeowner wants
  "should_respond": boolean,         // should Inside Track engage this thread?
  "reason": string,                  // one sentence justifying should_respond
  "best_angle": one of ["same_day","professional_diagnosis","spring_repair","opener_repair",
     "safety_concern","local_company","financing","warranty","no_pressure_inspection"] or null,
  "competitor_responses_quality": string|null,  // how well rivals replied, if any did
  "market_insight": string,          // one sentence of actionable market insight
  "confidence": number               // 0..1, your confidence in this classification
}`;

export async function classifyPost(post) {
  const user = `Platform: ${post.platform}
Group/community: ${post.group_name || 'unknown'}
City hint: ${post.city || 'unknown'}
Posted: ${post.post_datetime || 'unknown'}

POST / THREAD TEXT:
"""
${(post.raw_text || '').slice(0, 6000)}
"""

Classify this per the schema.`;
  return callClaude({ system: CLASSIFY_SYSTEM, user, maxTokens: 1200 });
}

// ---------------------------------------------------------------------------
// DRAFT SUGGESTED RESPONSES (human approves before anything is posted)
// ---------------------------------------------------------------------------
const DRAFT_SYSTEM = `You write suggested replies for Inside Track Garage Door to post in local
community threads. A human reviewer ALWAYS edits and approves before anything is posted; you never
post. Write replies that sound like a real local technician/owner, not marketing copy.

Hard rules:
- Sound local and human; short for public comments, a bit longer for private messages.
- Never attack or name competitors. Never use false urgency.
- Never make unverified claims. Do NOT guarantee availability unless told it is confirmed.
- Do NOT diagnose a problem sight-unseen; offer to inspect.
- Include the phone number or booking link ONLY when the type calls for it.
- No spammy phrasing, no ALL CAPS, no excessive emojis.

Return ONLY JSON:
{ "responses": [
    { "resp_type": one of ["fb_group_public","private_message","nextdoor","google_review",
        "referral_thanks","urgent_repair","price_sensitive","safety_focused","after_hours"],
      "angle": one of ["same_day","professional_diagnosis","spring_repair","opener_repair",
        "safety_concern","local_company","financing","warranty","no_pressure_inspection"] or null,
      "body": string,
      "confidence": number }
] }`;

export async function draftResponses(post, classification, { phone, bookingUrl } = {}) {
  const user = `Context for the reply (do not repeat it verbatim):
City: ${classification?.city || post.city || 'local area'}
Request: ${classification?.request_category || post.request_category}
Urgency: ${classification?.urgency || post.urgency}
Best angle: ${classification?.best_angle || 'n/a'}
Homeowner intent: ${classification?.likely_intent || 'n/a'}

Original post text:
"""
${(post.raw_text || '').slice(0, 3000)}
"""

Business contact to use only where appropriate:
Phone: ${phone || '(set ITG_PHONE)'}
Booking link: ${bookingUrl || '(set ITG_BOOKING_URL)'}

Produce 2-3 suggested responses of DIFFERENT types appropriate to this thread.`;
  return callClaude({ system: DRAFT_SYSTEM, user, maxTokens: 1500 });
}
