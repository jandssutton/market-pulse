# Market Pulse — AI Analysis Prompts

Two Claude calls, both in `lib/claude-analysis.js`, both returning strict JSON
that is parsed defensively (`parseJson` strips fences/prose and extracts the
object). Default model `claude-sonnet-4-5` (override with `ANTHROPIC_MODEL`).

## 1. Classification — `classifyPost(post)`
Reads one captured post/thread and returns structured intelligence. The system
prompt pins the analyst role, forbids inventing details, and fixes the output
shape:

Output contract:
```json
{
  "request_category": "company_recommendation|repair|spring_repair|opener_repair|
                       broken_door|off_track|emergency|overhead_door|installation|other",
  "urgency": "emergency|high|medium|low",
  "city": "string|null",
  "competitors_mentioned": [
    { "name": "string", "sentiment": "positive|neutral|negative",
      "mentioned_by": "string|null", "unprompted": true }
  ],
  "itg_mentioned": true,
  "likely_intent": "one sentence",
  "should_respond": true,
  "reason": "one sentence",
  "best_angle": "same_day|professional_diagnosis|spring_repair|opener_repair|
                 safety_concern|local_company|financing|warranty|no_pressure_inspection|null",
  "competitor_responses_quality": "string|null",
  "market_insight": "one sentence",
  "confidence": 0.0
}
```
Guardrails baked into the prompt: analyze only the provided text; use `null` for
unknowns; be conservative with sentiment and intent. The result is written to
`captured_posts.analysis`, and `competitors_mentioned` is materialized into
`post_mentions` after alias resolution.

This covers every Claude output the spec asks for in §12 (request category,
urgency, city, competitors + sentiment, response quality, intent, should-respond,
recommended angle, reason, market insight). Ranking impact is handled separately
by the scoring engine rather than guessed by the model.

## 2. Response drafting — `draftResponses(post, classification)`
Produces 2–3 suggested replies of different types. **It never posts.** A human
approves/edits first. The system prompt enforces the §8 rules:
- sound local and human; short for public comments, longer for private messages
- never attack or name competitors; never use false urgency
- no unverified claims; don't guarantee availability unless confirmed
- don't diagnose sight-unseen — offer to inspect
- include phone/booking link only when the type calls for it
- no spammy phrasing, no ALL CAPS, minimal emojis

Output contract:
```json
{ "responses": [
    { "resp_type": "fb_group_public|private_message|nextdoor|google_review|
                    referral_thanks|urgent_repair|price_sensitive|safety_focused|after_hours",
      "angle": "same_day|…|no_pressure_inspection|null",
      "body": "string",
      "confidence": 0.0 }
] }
```
Rows are stored in `suggested_responses` with `status='pending_approval'`.

## Why JSON-only
Strict JSON lets the routes fan the output directly into typed tables
(`post_mentions`, `suggested_responses`) and into the alert engine without brittle
text parsing. The defensive parser tolerates the occasional fence or stray
sentence; if parsing fails the route returns a 502 and the post simply stays
unanalyzed for a retry — no partial/garbage writes.
