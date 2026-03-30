// Email helper — V1: logs to console + stores in D1
// Wire up Resend or MailChannels when ready

export async function sendHazardEmail(env, report) {
  const subject = '⚠️ URGENT: Safety Hazard Report — Otter Valley R&G';
  const body = [
    `Reporter: ${report.member_name}`,
    report.range_id ? `Range: ${report.range_id}` : 'Range: Not specified',
    `Description: ${report.description}`,
    report.photo_url ? `Photo: attached` : 'Photo: none',
    `Time: ${report.created_at}`,
  ].join('\n');

  console.log(`[Email] To: ${env.CLUB_EMAIL}`);
  console.log(`[Email] Subject: ${subject}`);
  console.log(`[Email] Body:\n${body}`);

  // TODO: Wire up Resend API when ready
  // await fetch('https://api.resend.com/emails', {
  //   method: 'POST',
  //   headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ from: 'app@ottervalleyrodandgunclub.com', to: env.CLUB_EMAIL, subject, text: body })
  // });
}

export async function sendDigestEmail(env, data) {
  const subject = 'Otter Valley R&G — Daily Activity Summary';
  const body = [
    `Total visits today: ${data.total_visits}`,
    `Unique members: ${data.unique_members}`,
    '',
    'Visits by range:',
    ...data.per_range.map(r => `  ${r.range_id}: ${r.count}`),
    '',
    data.new_hazards > 0 ? `⚠️ ${data.new_hazards} new hazard report(s)` : 'No new hazard reports',
  ].join('\n');

  console.log(`[Email] To: ${env.CLUB_EMAIL}`);
  console.log(`[Email] Subject: ${subject}`);
  console.log(`[Email] Body:\n${body}`);
}
