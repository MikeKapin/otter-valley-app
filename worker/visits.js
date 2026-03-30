import { requireAuth } from './auth.js';

const VALID_RANGES = ['rifle', 'outdoor-pistol', 'indoor-pistol', 'archery', 'sporting-clays', 'fishing'];

export async function handleVisits(request, env, path) {
  const member = await requireAuth(request, env);
  if (!member) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  if (path === '/api/visits/checkin' && request.method === 'POST') {
    return checkin(request, env, member);
  }
  if (path === '/api/visits/checkout' && request.method === 'POST') {
    return checkout(env, member);
  }
  if (path === '/api/visits/current' && request.method === 'GET') {
    return current(env, member);
  }
  if (path === '/api/visits/history' && request.method === 'GET') {
    return history(request, env, member);
  }
  if (path === '/api/visits/stats' && request.method === 'GET') {
    return stats(env, member);
  }

  return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
}

async function checkin(request, env, member) {
  const body = await request.json();
  const { range_id, source } = body;

  if (!range_id || !VALID_RANGES.includes(range_id)) {
    return new Response(JSON.stringify({ error: 'Invalid range_id' }), { status: 400 });
  }

  // Check for active visit
  const active = await env.DB.prepare(
    'SELECT id, range_id FROM visits WHERE member_id = ? AND signed_out_at IS NULL'
  ).bind(member.id).first();

  if (active) {
    return new Response(JSON.stringify({
      error: 'Already signed in',
      active_visit: active,
      message: `You are currently signed in to ${active.range_id}. Sign out first.`
    }), { status: 409 });
  }

  const result = await env.DB.prepare(
    'INSERT INTO visits (member_id, range_id, source) VALUES (?, ?, ?)'
  ).bind(member.id, range_id, source || 'manual').run();

  const visit = await env.DB.prepare('SELECT * FROM visits WHERE id = ?').bind(result.meta.last_row_id).first();

  return new Response(JSON.stringify({ success: true, visit }), { status: 201 });
}

async function checkout(env, member) {
  const active = await env.DB.prepare(
    'SELECT id, range_id, signed_in_at FROM visits WHERE member_id = ? AND signed_out_at IS NULL'
  ).bind(member.id).first();

  if (!active) {
    return new Response(JSON.stringify({ error: 'No active visit to sign out from' }), { status: 404 });
  }

  await env.DB.prepare(
    "UPDATE visits SET signed_out_at = datetime('now') WHERE id = ?"
  ).bind(active.id).run();

  const visit = await env.DB.prepare('SELECT * FROM visits WHERE id = ?').bind(active.id).first();

  return new Response(JSON.stringify({ success: true, visit }));
}

async function current(env, member) {
  const active = await env.DB.prepare(
    'SELECT * FROM visits WHERE member_id = ? AND signed_out_at IS NULL'
  ).bind(member.id).first();

  return new Response(JSON.stringify({ visit: active || null }));
}

async function history(request, env, member) {
  const url = new URL(request.url);
  const range = url.searchParams.get('range');
  const limit = parseInt(url.searchParams.get('limit')) || 50;
  const offset = parseInt(url.searchParams.get('offset')) || 0;

  let query = 'SELECT * FROM visits WHERE member_id = ?';
  const params = [member.id];

  if (range && VALID_RANGES.includes(range)) {
    query += ' AND range_id = ?';
    params.push(range);
  }

  query += ' ORDER BY signed_in_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const { results } = await env.DB.prepare(query).bind(...params).all();
  return new Response(JSON.stringify({ visits: results }));
}

async function stats(env, member) {
  // Current season: April 1 to March 31
  const now = new Date();
  const seasonStart = now.getMonth() >= 3
    ? `${now.getFullYear()}-04-01`
    : `${now.getFullYear() - 1}-04-01`;

  const total = await env.DB.prepare(
    'SELECT COUNT(*) as count FROM visits WHERE member_id = ?'
  ).bind(member.id).first();

  const season = await env.DB.prepare(
    'SELECT COUNT(*) as count FROM visits WHERE member_id = ? AND signed_in_at >= ?'
  ).bind(member.id, seasonStart).first();

  const { results: perRange } = await env.DB.prepare(
    'SELECT range_id, COUNT(*) as count FROM visits WHERE member_id = ? GROUP BY range_id ORDER BY count DESC'
  ).bind(member.id).all();

  const lastVisit = await env.DB.prepare(
    'SELECT signed_in_at FROM visits WHERE member_id = ? ORDER BY signed_in_at DESC LIMIT 1'
  ).bind(member.id).first();

  return new Response(JSON.stringify({
    total_visits: total.count,
    season_visits: season.count,
    per_range: perRange,
    most_visited: perRange.length > 0 ? perRange[0].range_id : null,
    last_visit: lastVisit ? lastVisit.signed_in_at : null,
  }));
}
