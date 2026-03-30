export async function sendHazardEmail(env, report) {
  console.log('[Email] Hazard report:', JSON.stringify(report));
}

export async function sendDigestEmail(env, data) {
  console.log('[Email] Daily digest:', JSON.stringify(data));
}
