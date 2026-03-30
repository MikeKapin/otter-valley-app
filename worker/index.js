import { handleAuth } from './auth.js';
import { handleVisits } from './visits.js';
import { handleRanges } from './ranges.js';
import { handleHazard } from './hazard.js';
import { handleAdmin } from './admin.js';
import { handleEvents } from './events.js';
import { handleCron } from './cron.js';

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const origin = request.headers.get('Origin');
    const cors = corsHeaders(origin);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    // Only handle /api/* routes
    if (!path.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    try {
      let response;

      if (path.startsWith('/api/auth/')) {
        response = await handleAuth(request, env, path);
      } else if (path.startsWith('/api/visits/')) {
        response = await handleVisits(request, env, path);
      } else if (path.startsWith('/api/ranges/')) {
        response = await handleRanges(request, env, path);
      } else if (path.startsWith('/api/hazard/')) {
        response = await handleHazard(request, env, path);
      } else if (path.startsWith('/api/admin/')) {
        response = await handleAdmin(request, env, path);
      } else if (path === '/api/events') {
        response = await handleEvents(request, env);
      } else {
        response = jsonResponse({ error: 'Not found' }, 404);
      }

      // Add CORS headers to every response
      const newHeaders = new Headers(response.headers);
      Object.entries(cors).forEach(([k, v]) => newHeaders.set(k, v));
      return new Response(response.body, { status: response.status, headers: newHeaders });
    } catch (err) {
      console.error('Worker error:', err);
      return jsonResponse({ error: 'Internal server error' }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    await handleCron(env);
  },
};
