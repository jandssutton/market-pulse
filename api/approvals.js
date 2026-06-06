// api/approvals.js — POST /api/approvals
//   { suggested_response_id, action, edited_body?, assigned_to?, deadline? }
// action ∈ approved | edited | rejected | assigned | marked_responded
//
// Enforces spec §15: ONLY admin and marketing_manager may approve responses.
// Updates the suggested_response.status and records an approval audit row.
// Approval marks a response ready for a HUMAN to copy/post — it never auto-posts.
import { callerRole, readBody, json } from '../lib/http.js';
import { admin, COMPANY_ID, audit } from '../lib/db.js';

const STATUS_FOR = {
  approved: 'approved', edited: 'approved', rejected: 'rejected',
  marked_responded: 'posted', assigned: 'pending_approval',
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
  const { user, role } = await callerRole(req);
  if (!user) return json(res, 401, { error: 'unauthenticated' });
  if (!['admin', 'marketing_manager'].includes(role))
    return json(res, 403, { error: 'approval_requires_admin_or_marketing_manager' });

  const b = await readBody(req);
  if (!b.suggested_response_id || !b.action)
    return json(res, 400, { error: 'suggested_response_id_and_action_required' });
  if (!STATUS_FOR[b.action]) return json(res, 400, { error: 'invalid_action' });

  const { data: sr } = await admin.from('suggested_responses')
    .select('*').eq('company_id', COMPANY_ID).eq('id', b.suggested_response_id).single();
  if (!sr) return json(res, 404, { error: 'suggestion_not_found' });

  // record approval
  await admin.from('response_approvals').insert({
    company_id: COMPANY_ID,
    suggested_response_id: sr.id,
    action: b.action,
    edited_body: b.edited_body || null,
    assigned_to: b.assigned_to || null,
    deadline: b.deadline || null,
    responded: b.action === 'marked_responded',
    responded_at: b.action === 'marked_responded' ? new Date().toISOString() : null,
    acted_by: user.id,
  });

  // apply to the suggestion
  const update = { status: STATUS_FOR[b.action] };
  if (b.action === 'edited' && b.edited_body) update.body = b.edited_body;
  const { data, error } = await admin.from('suggested_responses')
    .update(update).eq('id', sr.id).select().single();
  if (error) return json(res, 400, { error: error.message });

  await audit(b.action, 'suggested_responses', sr.id, { status: sr.status }, update, user.id);
  return json(res, 200, { suggestion: data });
}
