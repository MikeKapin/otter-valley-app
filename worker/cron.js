import { sendDigestEmail } from './email.js';

export async function handleCron(env) {
  const today = new Date().toISOString().split('T')[0];

  const totalVisits = await env.DB.prepare(
    'SELECT COUNT(*) as count FROM visits WHERE DATE(signed_in_at) = ?'
  ).bind(today).first();

  const uniqueMembers = await env.DB.prepare(
    'SELECT COUNT(DISTINCT member_id) as count FROM visits WHERE DATE(signed_in_at) = ?'
  ).bind(today).first();

  const { results: perRange } = await env.DB.prepare(
    'SELECT range_id, COUNT(*) as count FROM visits WHERE DATE(signed_in_at) = ? GROUP BY range_id ORDER BY count DESC'
  ).bind(today).all();

  const newHazards = await env.DB.prepare(
    "SELECT COUNT(*) as count FROM hazard_reports WHERE DATE(created_at) = ? AND status = 'new'"
  ).bind(today).first();

  await sendDigestEmail(env, {
    date: today,
    total_visits: totalVisits.count,
    unique_members: uniqueMembers.count,
    per_range: perRange,
    new_hazards: newHazards.count,
  });

  console.log(`[Cron] Daily digest sent for ${today}: ${totalVisits.count} visits, ${newHazards.count} new hazards`);
}
