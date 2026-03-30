import { requireAuth } from './auth.js';
import { sendHazardEmail } from './email.js';

const VALID_RANGES = ['rifle', 'outdoor-pistol', 'indoor-pistol', 'archery', 'sporting-clays', 'fishing'];

export async function handleHazard(request, env, path) {
  if (path === '/api/hazard/report' && request.method === 'POST') {
    return submitReport(request, env);
  }
  return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
}

async function submitReport(request, env) {
  const member = await requireAuth(request, env);
  if (!member) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const body = await request.json();
  const { range_id, description, photo } = body;

  if (!description || description.trim().length < 20) {
    return new Response(JSON.stringify({ error: 'Description must be at least 20 characters' }), { status: 400 });
  }

  if (range_id && !VALID_RANGES.includes(range_id)) {
    return new Response(JSON.stringify({ error: 'Invalid range_id' }), { status: 400 });
  }

  // Store base64 photo as data URL if provided
  const photo_url = photo ? photo : null;

  const result = await env.DB.prepare(
    'INSERT INTO hazard_reports (member_id, range_id, description, photo_url) VALUES (?, ?, ?, ?)'
  ).bind(member.id, range_id || null, description.trim(), photo_url).run();

  // Get member name for email
  const memberData = await env.DB.prepare('SELECT first_name, last_name FROM members WHERE id = ?').bind(member.id).first();

  await sendHazardEmail(env, {
    member_name: `${memberData.first_name} ${memberData.last_name}`,
    range_id,
    description: description.trim(),
    photo_url,
    created_at: new Date().toISOString(),
  });

  return new Response(JSON.stringify({
    success: true,
    message: 'Report submitted. Thank you for keeping our club safe.',
    report_id: result.meta.last_row_id,
  }), { status: 201 });
}
