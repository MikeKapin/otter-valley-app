export async function handleRanges(request, env, path) {
  if (path === '/api/ranges/status' && request.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM range_status ORDER BY range_id').all();
    return new Response(JSON.stringify({ ranges: results }));
  }
  return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
}
