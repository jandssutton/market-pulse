// lib/alerts.js — evaluate a captured/classified post against alert rules and
// dispatch. Dashboard alerts are just rows; email goes via Resend; Slack via an
// incoming webhook; SMS is optional (left as a stub to wire to a provider).
import { admin, COMPANY_ID } from './db.js';

// Decide which alerts a post should raise. Returns [{alert_type, severity, message}].
export function evaluatePost(post, classification, { majorCompetitorIds = [], unansweredMinutes = 15 } = {}) {
  const out = [];
  const cat = classification?.request_category || post.request_category;
  const urg = classification?.urgency || post.urgency;
  const city = classification?.city || post.city;

  if (urg === 'emergency' || cat === 'emergency')
    out.push({ alert_type: 'urgent_repair_post', severity: 'critical',
      message: `Emergency garage-door post in ${city || 'target area'}` });
  if (cat === 'spring_repair')
    out.push({ alert_type: 'spring_repair_request', severity: 'high',
      message: `Spring repair request in ${city || 'target area'}` });
  if (cat === 'opener_repair')
    out.push({ alert_type: 'opener_repair_request', severity: 'medium',
      message: `Opener repair request in ${city || 'target area'}` });
  if (city)
    out.push({ alert_type: 'target_city_post', severity: 'low',
      message: `New recommendation post in ${city}` });
  if (post.itg_mentioned || classification?.itg_mentioned)
    out.push({ alert_type: 'itg_mentioned', severity: 'high',
      message: `Inside Track was mentioned in a thread` });

  for (const m of classification?.competitors_mentioned || []) {
    if (m.sentiment === 'negative')
      out.push({ alert_type: 'negative_competitor_mention', severity: 'medium',
        message: `Negative mention of a competitor — opportunity to win the customer` });
  }
  if ((classification?.competitors_mentioned || []).some(m => majorCompetitorIds.includes(m.competitor_id)))
    out.push({ alert_type: 'major_competitor_mentioned', severity: 'high',
      message: `A major competitor is being recommended` });

  if (classification?.should_respond && (urg === 'emergency' || urg === 'high'))
    out.push({ alert_type: 'high_value_opportunity', severity: 'high',
      message: `High-value opportunity: ${classification?.reason || 'respond fast'}` });

  return out;
}

// Persist alerts (dedupe per post+type) and dispatch enabled channels.
export async function raiseAlerts(post, alerts, { channels = ['dashboard'] } = {}) {
  for (const a of alerts) {
    const { data: existing } = await admin.from('alerts').select('id')
      .eq('company_id', COMPANY_ID).eq('post_id', post.id)
      .eq('alert_type', a.alert_type).maybeSingle();
    if (existing) continue;

    const { data: row } = await admin.from('alerts').insert({
      company_id: COMPANY_ID, alert_type: a.alert_type, severity: a.severity,
      post_id: post.id, message: a.message, channels, status: 'new',
    }).select().single();

    for (const ch of channels) {
      try {
        if (ch === 'email') await sendEmail(a, post);
        else if (ch === 'slack') await sendSlack(a, post);
        else if (ch === 'sms') await sendSms(a, post); // optional stub
      } catch (e) { console.error(`[alerts] ${ch} dispatch failed:`, e.message); }
    }
    if (row) await admin.from('alerts').update({ status: 'sent' }).eq('id', row.id);
  }
}

async function sendEmail(a, post) {
  if (!process.env.RESEND_API_KEY || !process.env.ALERT_EMAIL_TO) return;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: process.env.ALERT_EMAIL_FROM || 'marketpulse@insidetrackapps.com',
      to: process.env.ALERT_EMAIL_TO.split(','),
      subject: `[Market Pulse] ${a.severity.toUpperCase()}: ${a.alert_type}`,
      text: `${a.message}\n\nPlatform: ${post.platform}\nGroup: ${post.group_name || ''}\nURL: ${post.original_url || '(manual entry)'}\n`,
    }),
  });
}

async function sendSlack(a, post) {
  if (!process.env.SLACK_WEBHOOK_URL) return;
  await fetch(process.env.SLACK_WEBHOOK_URL, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: `*[Market Pulse] ${a.severity.toUpperCase()}* — ${a.message}\n${post.original_url || '(manual entry)'}` }),
  });
}

// Optional: wire to an SMS provider (Twilio, etc.). Left as a no-op stub.
async function sendSms(_a, _post) { /* configure provider before enabling */ }
