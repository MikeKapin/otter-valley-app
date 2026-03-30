import { hashPassword, verifyPassword, signJWT, verifyJWT } from './auth.js';

const VALID_RANGES = ['rifle', 'outdoor-pistol', 'indoor-pistol', 'archery', 'sporting-clays', 'fishing'];

async function requireAdmin(request, env) {
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const payload = await verifyJWT(token, env.JWT_SECRET);
  if (!payload || payload.role !== 'admin') return null;
  return payload;
}

export async function handleAdmin(request, env, path) {
  // Admin login — no auth required
  if (path === '/api/admin/login' && request.method === 'POST') {
    return adminLogin(request, env);
  }
  // Admin setup — creates first admin (only works if no admins exist)
  if (path === '/api/admin/setup' && request.method === 'POST') {
    return adminSetup(request, env);
  }

  // All other endpoints require admin auth
  const admin = await requireAdmin(request, env);
  if (!admin) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  if (path === '/api/admin/visits' && request.method === 'GET') return adminVisits(request, env);
  if (path === '/api/admin/stats' && request.method === 'GET') return adminStats(request, env);
  if (path === '/api/admin/hazards' && request.method === 'GET') return adminHazards(request, env);
  if (path.match(/^\/api\/admin\/hazards\/\d+$/) && request.method === 'PUT') return updateHazard(request, env, path);
  if (path.match(/^\/api\/admin\/ranges\/[\w-]+$/) && request.method === 'PUT') return updateRange(request, env, path);
  if (path === '/api/admin/export' && request.method === 'GET') return exportCSV(request, env);

  return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
}

async function adminLogin(request, env) {
  const { username, password } = await request.json();
  if (!username || !password) {
    return new Response(JSON.stringify({ error: 'Username and password required' }), { status: 400 });
  }

  const admin = await env.DB.prepare('SELECT * FROM admins WHERE username = ?').bind(username).first();
  if (!admin) {
    return new Response(JSON.stringify({ error: 'Invalid credentials' }), { status: 401 });
  }

  const valid = await verifyPassword(password, admin.password_hash);
  if (!valid) {
    return new Response(JSON.stringify({ error: 'Invalid credentials' }), { status: 401 });
  }

  const token = await signJWT({ id: admin.id, username: admin.username, role: 'admin' }, env.JWT_SECRET);
  return new Response(JSON.stringify({ token }));
}

async function adminSetup(request, env) {
  const existing = await env.DB.prepare('SELECT COUNT(*) as count FROM admins').first();
  if (existing.count > 0) {
    return new Response(JSON.stringify({ error: 'Admin already exists. Use login.' }), { status: 403 });
  }

  const { username, password } = await request.json();
  if (!username || !password || password.length < 8) {
    return new Response(JSON.stringify({ error: 'Username and password (min 8 chars) required' }), { status: 400 });
  }

  const password_hash = await hashPassword(password);
  await env.DB.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').bind(username, password_hash).run();

  const token = await signJWT({ id: 1, username, role: 'admin' }, env.JWT_SECRET);
  return new Response(JSON.stringify({ success: true, token }), { status: 201 });
}

async function adminVisits(request, env) {
  const url = new URL(request.url);
  const date = url.searchParams.get('date');
  const range = url.searchParams.get('range');
  const member = url.searchParams.get('member');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const limit = parseInt(url.searchParams.get('limit')) || 100;
  const offset = parseInt(url.searchParams.get('offset')) || 0;

  let query = `SELECT v.*, m.first_name, m.last_name, m.email
    FROM visits v JOIN members m ON v.member_id = m.id WHERE 1=1`;
  const params = [];

  if (date) { query += ` AND DATE(v.signed_in_at) = ?`; params.push(date); }
  if (range) { query += ` AND v.range_id = ?`; params.push(range); }
  if (member) { query += ` AND (m.first_name LIKE ? OR m.last_name LIKE ?)`; params.push(`%${member}%`, `%${member}%`); }
  if (from) { query += ` AND v.signed_in_at >= ?`; params.push(from); }
  if (to) { query += ` AND v.signed_in_at <= ? || ' 23:59:59'`; params.push(to); }

  query += ` ORDER BY v.signed_in_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const { results } = await env.DB.prepare(query).bind(...params).all();
  return new Response(JSON.stringify({ visits: results }));
}

async function adminStats(request, env) {
  const url = new URL(request.url);
  const period = url.searchParams.get('period') || 'week';

  let dateFilter;
  const now = new Date();
  if (period === 'week') {
    const weekAgo = new Date(now - 7 * 86400000).toISOString().split('T')[0];
    dateFilter = weekAgo;
  } else if (period === 'month') {
    const monthAgo = new Date(now - 30 * 86400000).toISOString().split('T')[0];
    dateFilter = monthAgo;
  } else {
    // season: April 1 to March 31
    dateFilter = now.getMonth() >= 3
      ? `${now.getFullYear()}-04-01`
      : `${now.getFullYear() - 1}-04-01`;
  }

  const { results: perRange } = await env.DB.prepare(
    'SELECT range_id, COUNT(*) as count FROM visits WHERE signed_in_at >= ? GROUP BY range_id ORDER BY count DESC'
  ).bind(dateFilter).all();

  const totalVisits = await env.DB.prepare(
    'SELECT COUNT(*) as count FROM visits WHERE signed_in_at >= ?'
  ).bind(dateFilter).first();

  const uniqueMembers = await env.DB.prepare(
    'SELECT COUNT(DISTINCT member_id) as count FROM visits WHERE signed_in_at >= ?'
  ).bind(dateFilter).first();

  const { results: perDay } = await env.DB.prepare(
    'SELECT DATE(signed_in_at) as day, COUNT(*) as count FROM visits WHERE signed_in_at >= ? GROUP BY day ORDER BY day'
  ).bind(dateFilter).all();

  const currentlyIn = await env.DB.prepare(
    `SELECT v.range_id, m.first_name, m.last_name, v.signed_in_at
     FROM visits v JOIN members m ON v.member_id = m.id WHERE v.signed_out_at IS NULL`
  ).all();

  return new Response(JSON.stringify({
    period,
    total_visits: totalVisits.count,
    unique_members: uniqueMembers.count,
    per_range: perRange,
    per_day: perDay,
    currently_signed_in: currentlyIn.results,
  }));
}

async function adminHazards(request, env) {
  const url = new URL(request.url);
  const status = url.searchParams.get('status');

  let query = `SELECT h.*, m.first_name, m.last_name FROM hazard_reports h JOIN members m ON h.member_id = m.id`;
  const params = [];

  if (status) { query += ` WHERE h.status = ?`; params.push(status); }
  query += ` ORDER BY h.created_at DESC`;

  const { results } = params.length
    ? await env.DB.prepare(query).bind(...params).all()
    : await env.DB.prepare(query).all();

  return new Response(JSON.stringify({ hazards: results }));
}

async function updateHazard(request, env, path) {
  const id = path.split('/').pop();
  const { status } = await request.json();

  if (!['new', 'reviewed', 'resolved'].includes(status)) {
    return new Response(JSON.stringify({ error: 'Invalid status' }), { status: 400 });
  }

  await env.DB.prepare('UPDATE hazard_reports SET status = ? WHERE id = ?').bind(status, id).run();
  return new Response(JSON.stringify({ success: true }));
}

async function updateRange(request, env, path) {
  const range_id = path.split('/').pop();
  if (!VALID_RANGES.includes(range_id)) {
    return new Response(JSON.stringify({ error: 'Invalid range_id' }), { status: 400 });
  }

  const { status, note } = await request.json();
  if (!['open', 'closed', 'reserved'].includes(status)) {
    return new Response(JSON.stringify({ error: 'Invalid status' }), { status: 400 });
  }

  await env.DB.prepare(
    "UPDATE range_status SET status = ?, note = ?, updated_at = datetime('now') WHERE range_id = ?"
  ).bind(status, note || '', range_id).run();

  return new Response(JSON.stringify({ success: true }));
}

async function exportCSV(request, env) {
  const url = new URL(request.url);
  const from = url.searchParams.get('from') || '2020-01-01';
  const to = url.searchParams.get('to') || '2099-12-31';

  const { results } = await env.DB.prepare(
    `SELECT DATE(v.signed_in_at) as date, TIME(v.signed_in_at) as time,
            m.first_name || ' ' || m.last_name as member_name,
            v.range_id, v.signed_out_at, v.source
     FROM visits v JOIN members m ON v.member_id = m.id
     WHERE v.signed_in_at >= ? AND v.signed_in_at <= ? || ' 23:59:59'
     ORDER BY v.signed_in_at DESC`
  ).bind(from, to).all();

  let csv = 'Date,Time,Member Name,Range,Duration,Source\n';
  for (const row of results) {
    const duration = row.signed_out_at
      ? Math.round((new Date(row.signed_out_at) - new Date(`${row.date}T${row.time}`)) / 60000) + ' min'
      : '';
    csv += `${row.date},${row.time},"${row.member_name}",${row.range_id},${duration},${row.source}\n`;
  }

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="otter-valley-visits-${from}-to-${to}.csv"`,
    },
  });
}
