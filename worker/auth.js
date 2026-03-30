// --- Crypto helpers (Web Crypto API — no Node.js crypto in Workers) ---

const PBKDF2_ITERATIONS = 100000;

function arrayBufferToBase64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function base64ToArrayBuffer(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function base64url(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return atob(str);
}

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const hash = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return arrayBufferToBase64(salt) + ':' + arrayBufferToBase64(hash);
}

async function verifyPassword(password, stored) {
  const [saltB64, hashB64] = stored.split(':');
  const salt = base64ToArrayBuffer(saltB64);
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const hash = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return arrayBufferToBase64(hash) === hashB64;
}

// --- JWT helpers (HMAC-SHA256) ---

async function signJWT(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  payload.iat = now;
  payload.exp = now + 30 * 24 * 60 * 60; // 30 days

  const encoder = new TextEncoder();
  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const data = encoder.encode(`${headerB64}.${payloadB64}`);

  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, data);
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  return `${headerB64}.${payloadB64}.${sigB64}`;
}

async function verifyJWT(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const encoder = new TextEncoder();
  const data = encoder.encode(`${parts[0]}.${parts[1]}`);

  const sigBytes = Uint8Array.from(base64urlDecode(parts[2]), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify('HMAC', key, sigBytes, data);
  if (!valid) return null;

  const payload = JSON.parse(base64urlDecode(parts[1]));
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

// --- Auth middleware ---

export async function requireAuth(request, env) {
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const payload = await verifyJWT(token, env.JWT_SECRET);
  return payload;
}

// --- Route handler ---

export async function handleAuth(request, env, path) {
  if (path === '/api/auth/register' && request.method === 'POST') {
    return register(request, env);
  }
  if (path === '/api/auth/login' && request.method === 'POST') {
    return login(request, env);
  }
  if (path === '/api/auth/me' && request.method === 'GET') {
    return me(request, env);
  }
  return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
}

async function register(request, env) {
  const body = await request.json();
  const { first_name, last_name, email, password, membership_number } = body;

  if (!first_name || !last_name || !email || !password) {
    return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 });
  }
  if (password.length < 6) {
    return new Response(JSON.stringify({ error: 'Password must be at least 6 characters' }), { status: 400 });
  }

  const existing = await env.DB.prepare('SELECT id FROM members WHERE email = ?').bind(email.toLowerCase()).first();
  if (existing) {
    return new Response(JSON.stringify({ error: 'Email already registered' }), { status: 409 });
  }

  const password_hash = await hashPassword(password);
  const result = await env.DB.prepare(
    'INSERT INTO members (first_name, last_name, email, password_hash, membership_number) VALUES (?, ?, ?, ?, ?)'
  ).bind(first_name, last_name, email.toLowerCase(), password_hash, membership_number || null).run();

  const token = await signJWT({ id: result.meta.last_row_id, email: email.toLowerCase(), first_name }, env.JWT_SECRET);
  return new Response(JSON.stringify({ token, member: { id: result.meta.last_row_id, first_name, last_name, email: email.toLowerCase() } }), { status: 201 });
}

async function login(request, env) {
  const body = await request.json();
  const { email, password } = body;

  if (!email || !password) {
    return new Response(JSON.stringify({ error: 'Email and password required' }), { status: 400 });
  }

  const member = await env.DB.prepare('SELECT * FROM members WHERE email = ?').bind(email.toLowerCase()).first();
  if (!member) {
    return new Response(JSON.stringify({ error: 'Invalid email or password' }), { status: 401 });
  }

  const valid = await verifyPassword(password, member.password_hash);
  if (!valid) {
    return new Response(JSON.stringify({ error: 'Invalid email or password' }), { status: 401 });
  }

  await env.DB.prepare('UPDATE members SET last_login = datetime(\'now\') WHERE id = ?').bind(member.id).run();

  const token = await signJWT({ id: member.id, email: member.email, first_name: member.first_name }, env.JWT_SECRET);
  return new Response(JSON.stringify({
    token,
    member: { id: member.id, first_name: member.first_name, last_name: member.last_name, email: member.email, membership_number: member.membership_number }
  }));
}

async function me(request, env) {
  const payload = await requireAuth(request, env);
  if (!payload) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const member = await env.DB.prepare('SELECT id, first_name, last_name, email, membership_number, created_at, last_login FROM members WHERE id = ?').bind(payload.id).first();
  if (!member) {
    return new Response(JSON.stringify({ error: 'Member not found' }), { status: 404 });
  }

  return new Response(JSON.stringify({ member }));
}

// Export helpers for use by other modules
export { hashPassword, verifyPassword, signJWT, verifyJWT };
