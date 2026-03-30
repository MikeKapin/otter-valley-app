// === Otter Valley R&G Club — Member App ===

const API = '/api';
const RANGES = {
  rifle: { name: 'Rifle Range', icon: '🎯' },
  'outdoor-pistol': { name: 'Outdoor Pistol Range', icon: '🔫' },
  'indoor-pistol': { name: 'Indoor Pistol Range', icon: '🏠' },
  archery: { name: 'Archery Range', icon: '🏹' },
  'sporting-clays': { name: 'Sporting Clays Range', icon: '🥏' },
  fishing: { name: 'Fishing Pond', icon: '🎣' },
};

// --- Auth ---
function getToken() { return localStorage.getItem('ov_token'); }
function getMember() { try { return JSON.parse(localStorage.getItem('ov_member')); } catch { return null; } }
function logout() { localStorage.removeItem('ov_token'); localStorage.removeItem('ov_member'); window.location.href = '/index.html'; }

if (!getToken()) window.location.href = '/index.html';

const member = getMember();
if (member) document.getElementById('user-greeting').textContent = member.first_name;

// --- API helper ---
async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(API + path, { ...opts, headers: { ...headers, ...opts.headers } });
  if (res.status === 401) { logout(); throw new Error('Session expired'); }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// --- Toast ---
function showToast(message, type = 'success') {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = 'toast toast-' + type;
  t.textContent = message;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// --- Date helpers ---
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + (iso.includes('T') ? '' : 'T00:00:00'));
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso + (iso.includes('T') ? '' : 'T00:00:00'));
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
function fmtDuration(inTime, outTime) {
  if (!outTime) return '';
  const mins = Math.round((new Date(outTime) - new Date(inTime)) / 60000);
  if (mins < 60) return mins + ' min';
  return Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm';
}

// --- Safe text escaping for user-generated content ---
function esc(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// --- Router ---
const page = document.getElementById('page-content');

function getRoute() {
  const hash = location.hash.slice(1) || 'home';
  const [route, qs] = hash.split('?');
  const params = new URLSearchParams(qs || '');
  return { route, params };
}

function setPage(html) {
  // All dynamic HTML is built from trusted constants (RANGES, hardcoded rules)
  // or API data from our own backend. User text is escaped via esc().
  page.innerHTML = html;
}

function navigate() {
  const { route, params } = getRoute();
  document.querySelectorAll('.bottom-nav a').forEach(a => {
    const nav = a.dataset.nav;
    a.classList.toggle('active', nav === route || (nav === 'more' && ['events', 'hazard', 'contact', 'account', 'more'].includes(route)));
  });
  const routes = { home: renderHome, checkin: renderCheckin, visits: renderVisits, rules: renderRules, events: renderEvents, hazard: renderHazard, contact: renderContact, account: renderAccount, more: renderMore };
  const fn = routes[route] || renderHome;
  setPage('<div class="loading-overlay"><div class="spinner"></div></div>');
  fn(params);
}

window.addEventListener('hashchange', navigate);
navigate();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// =====================
// VIEWS
// =====================

async function renderHome() {
  let currentVisit = null, rangeStatus = [], nextEvent = null;
  try {
    const [visitData, rangeData, eventData] = await Promise.all([
      api('/visits/current'), api('/ranges/status'), api('/events'),
    ]);
    currentVisit = visitData.visit;
    rangeStatus = rangeData.ranges;
    nextEvent = eventData.events && eventData.events[0];
  } catch (e) { console.error(e); }

  let html = '<h2 class="mt-2">Welcome back, ' + esc(member?.first_name || 'Member') + '</h2>';

  if (currentVisit) {
    const r = RANGES[currentVisit.range_id] || { name: currentVisit.range_id, icon: '' };
    html += '<div class="card card-gold mt-2">'
      + '<p>' + esc(r.icon) + ' You\'re at <strong>' + esc(r.name) + '</strong> since ' + esc(fmtTime(currentVisit.signed_in_at)) + '</p>'
      + '<button class="btn btn-outline btn-block mt-1" onclick="doCheckout()">Sign Out</button></div>';
  } else {
    html += '<a href="#checkin" class="btn btn-gold btn-block mt-2" style="font-size:1.1rem;padding:1rem">&#9989; Sign In to Range</a>';
  }

  html += '<h3 class="mt-3 mb-1">Range Status</h3><div class="range-grid">';
  for (const [id, info] of Object.entries(RANGES)) {
    const rs = rangeStatus.find(r => r.range_id === id);
    const st = rs ? rs.status : 'open';
    const note = rs && rs.note ? ' — ' + esc(rs.note) : '';
    html += '<div class="card" style="padding:0.75rem;text-align:center">'
      + '<span class="status-dot ' + st + '"></span><strong>' + esc(info.name) + '</strong>'
      + '<div class="text-dim text-sm">' + esc(st) + note + '</div></div>';
  }
  html += '</div>';

  if (nextEvent) {
    html += '<h3 class="mt-2 mb-1">Next Event</h3>'
      + '<div class="card"><div class="event-date">' + esc(fmtDate(nextEvent.date)) + ' ' + esc(nextEvent.time || '') + '</div>'
      + '<div class="event-title">' + esc(nextEvent.title) + '</div>'
      + '<div class="event-desc">' + esc(nextEvent.description) + '</div></div>';
  }

  html += '<div class="range-grid mt-2">'
    + '<a href="#rules" class="range-card"><span class="range-icon">📖</span><span class="range-name">Range Rules</span></a>'
    + '<a href="#hazard" class="range-card" style="border-color:var(--red-urgent)"><span class="range-icon">⚠️</span><span class="range-name">Report Hazard</span></a>'
    + '</div>';

  setPage(html);
}

window.doCheckout = async function() {
  try { await api('/visits/checkout', { method: 'POST' }); showToast('Signed out successfully'); navigate(); }
  catch (e) { showToast(e.message, 'error'); }
};

async function renderCheckin(params) {
  const rangeParam = params.get('range');
  const source = rangeParam ? 'qr' : 'manual';

  let currentVisit = null;
  try { const data = await api('/visits/current'); currentVisit = data.visit; } catch (e) {}

  if (currentVisit) {
    const r = RANGES[currentVisit.range_id] || { name: currentVisit.range_id, icon: '' };
    setPage('<div class="success-screen">'
      + '<p class="text-dim">You\'re currently signed in to</p>'
      + '<h2 class="mt-1">' + esc(r.icon) + ' ' + esc(r.name) + '</h2>'
      + '<p class="text-dim mt-1">Since ' + esc(fmtTime(currentVisit.signed_in_at)) + '</p>'
      + '<button class="btn btn-outline btn-block mt-2" onclick="doCheckout()">Sign Out First</button>'
      + '<a href="#home" class="btn btn-gold btn-block mt-1">Back to Home</a></div>');
    return;
  }

  if (rangeParam && RANGES[rangeParam]) { showConfirmation(rangeParam, source); return; }

  let html = '<h2 class="mt-2 mb-1">Sign In to Range</h2><p class="text-dim mb-2">Select your range</p><div class="range-grid">';
  for (const [id, info] of Object.entries(RANGES)) {
    html += '<div class="range-card" onclick="selectRange(\'' + id + '\')">'
      + '<span class="range-icon">' + info.icon + '</span><span class="range-name">' + esc(info.name) + '</span></div>';
  }
  html += '</div>';
  setPage(html);
}

window.selectRange = function(id) { showConfirmation(id, 'manual'); };

function showConfirmation(rangeId, source) {
  const r = RANGES[rangeId];
  setPage('<div class="success-screen">'
    + '<div style="font-size:3rem;margin-bottom:1rem">' + r.icon + '</div>'
    + '<h2>' + esc(r.name) + '</h2>'
    + '<p class="text-dim mt-1">Confirm your sign-in</p>'
    + '<button class="btn btn-gold btn-block mt-2" id="confirm-btn" onclick="confirmCheckin(\'' + rangeId + '\',\'' + source + '\')">Confirm Sign-In</button>'
    + '<a href="#checkin" class="btn btn-outline btn-block mt-1">Cancel</a></div>');
}

window.confirmCheckin = async function(rangeId, source) {
  const btn = document.getElementById('confirm-btn');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div>';

  if (!navigator.onLine) {
    const queue = JSON.parse(localStorage.getItem('ov_pending_checkins') || '[]');
    queue.push({ range_id: rangeId, source, timestamp: new Date().toISOString() });
    localStorage.setItem('ov_pending_checkins', JSON.stringify(queue));
    showCheckinSuccess(rangeId, true);
    return;
  }

  try {
    await api('/visits/checkin', { method: 'POST', body: JSON.stringify({ range_id: rangeId, source }) });
    showCheckinSuccess(rangeId, false);
  } catch (e) { showToast(e.message, 'error'); btn.disabled = false; btn.textContent = 'Confirm Sign-In'; }
};

function showCheckinSuccess(rangeId, offline) {
  const r = RANGES[rangeId];
  const now = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  setPage('<div class="success-screen">'
    + '<div class="checkmark-circle"></div>'
    + '<h2>Signed In!</h2>'
    + '<p class="mt-1">' + r.icon + ' ' + esc(r.name) + ' at ' + esc(now) + '</p>'
    + (offline ? '<p class="text-dim text-sm mt-1">(Offline — will sync when connected)</p>' : '')
    + '<a href="#home" class="btn btn-gold btn-block mt-2">Done</a></div>');
}

async function renderVisits() {
  let stats = {}, visits = [];
  try {
    [stats, { visits }] = await Promise.all([api('/visits/stats'), api('/visits/history')]);
  } catch (e) { setPage('<p class="text-dim mt-2">Could not load visits</p>'); return; }

  const mostVisited = stats.most_visited ? (RANGES[stats.most_visited]?.name || stats.most_visited) : '—';
  let html = '<h2 class="mt-2">My Visits</h2>'
    + '<div class="stat-row">'
    + '<div class="stat-card"><div class="stat-value">' + (stats.season_visits || 0) + '</div><div class="stat-label">This Season</div></div>'
    + '<div class="stat-card"><div class="stat-value">' + (stats.total_visits || 0) + '</div><div class="stat-label">All Time</div></div></div>'
    + '<div class="card" style="padding:0.75rem"><p class="text-sm text-dim">Most visited: <strong class="text-gold">' + esc(mostVisited) + '</strong></p></div>';

  html += '<div class="filter-pills mt-2"><button class="pill active" onclick="filterVisits(\'\')">All</button>';
  for (const [id, info] of Object.entries(RANGES)) {
    html += '<button class="pill" onclick="filterVisits(\'' + id + '\')">' + esc(info.name) + '</button>';
  }
  html += '</div><div id="visits-list">' + renderVisitList(visits) + '</div>';
  setPage(html);
}

function renderVisitList(visits) {
  if (!visits.length) return '<p class="text-dim text-center mt-2">No visits yet</p>';
  let html = '';
  for (const v of visits) {
    const r = RANGES[v.range_id] || { name: v.range_id, icon: '' };
    const dur = fmtDuration(v.signed_in_at, v.signed_out_at);
    html += '<div class="card" style="padding:0.75rem">'
      + '<div class="flex-between"><strong>' + esc(r.icon) + ' ' + esc(r.name) + '</strong><span class="badge badge-' + v.source + '">' + esc(v.source) + '</span></div>'
      + '<div class="text-sm text-dim mt-1">' + esc(fmtDate(v.signed_in_at)) + ' at ' + esc(fmtTime(v.signed_in_at))
      + (dur ? ' — ' + esc(dur) : (v.signed_out_at ? '' : ' (active)')) + '</div></div>';
  }
  return html;
}

window.filterVisits = async function(rangeId) {
  document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
  event.target.classList.add('active');
  try {
    const params = rangeId ? '?range=' + rangeId : '';
    const data = await api('/visits/history' + params);
    document.getElementById('visits-list').innerHTML = renderVisitList(data.visits);
  } catch (e) { showToast(e.message, 'error'); }
};

async function renderRules() {
  const rules = [
    { title: 'General Range Rules', content: '<ul>'
      + '<li>All members must sign in before using any range</li>'
      + '<li>Eye and ear protection required on all firing ranges</li>'
      + '<li>All firearms must be unloaded and cased when not on the firing line</li>'
      + '<li>Always keep firearms pointed in a safe direction</li>'
      + '<li>No alcohol or drugs permitted on range property</li>'
      + '<li>Members are responsible for their guests at all times</li>'
      + '<li>Clean up your shooting area before leaving</li>'
      + '<li>Report any unsafe conditions immediately</li>'
      + '<li>Range hours: Dawn to Dusk unless otherwise posted</li>'
      + '<li>No shooting during organized events unless participating</li></ul>' },
    { title: 'Rifle Range', content: '<ul>'
      + '<li>Maximum caliber: .50 BMG</li>'
      + '<li>Distances: 25, 50, 100, 200 yards</li>'
      + '<li>Bench rest and prone shooting positions available</li>'
      + '<li>All shots must impact the berm</li>'
      + '<li>Cease fire when anyone is down range</li></ul>' },
    { title: 'Outdoor Pistol Range', content: '<ul>'
      + '<li>Handguns only — no rifles or shotguns</li>'
      + '<li>Maximum distance: 25 yards</li>'
      + '<li>Draw from holster permitted for licensed members only</li>'
      + '<li>No rapid fire without Range Officer present</li></ul>' },
    { title: 'Indoor Pistol Range', content: '<ul>'
      + '<li>Handguns and .22LR rifles only</li>'
      + '<li>Lead-free ammunition recommended</li>'
      + '<li>Maximum 4 shooters at a time</li>'
      + '<li>No steel-core or armor-piercing ammunition</li></ul>' },
    { title: 'Archery Range', content: '<ul>'
      + '<li>Broadheads on designated targets only</li>'
      + '<li>Field points for 3D targets</li>'
      + '<li>Walk the course in posted direction only</li>'
      + '<li>Retrieve arrows together — never walk ahead</li></ul>' },
    { title: 'Sporting Clays Range', content: '<ul>'
      + '<li>Shotguns only — maximum 12 gauge</li>'
      + '<li>Non-toxic shot only (#7.5 or smaller)</li>'
      + '<li>Follow the stations in order</li>'
      + '<li>Do not load until at your station and ready to call</li></ul>' },
    { title: 'Fishing Pond', content: '<ul>'
      + '<li>Catch and release only</li>'
      + '<li>Barbless hooks recommended</li>'
      + '<li>No live bait — artificial lures only</li>'
      + '<li>Pack out all fishing line and litter</li></ul>' },
  ];

  let html = '<h2 class="mt-2 mb-2">Range Rules</h2>';
  for (const rule of rules) {
    html += '<div class="accordion-item">'
      + '<button class="accordion-header" onclick="this.parentElement.classList.toggle(\'open\')">' + esc(rule.title) + '</button>'
      + '<div class="accordion-body">' + rule.content + '</div></div>';
  }
  html += '<div class="card card-urgent mt-2"><p class="text-sm"><strong>No trespassing. No hunting allowed on club property.</strong></p></div>';
  setPage(html);
}

async function renderEvents() {
  let events = [];
  try { const data = await api('/events'); events = data.events; } catch (e) {}

  let html = '<h2 class="mt-2 mb-2">Upcoming Events</h2>';
  if (!events.length) { html += '<p class="text-dim">No upcoming events</p>'; }
  for (const evt of events) {
    const gcalUrl = 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(evt.title)
      + '&dates=' + evt.date.replace(/-/g, '') + '/' + evt.date.replace(/-/g, '')
      + '&details=' + encodeURIComponent(evt.description);
    html += '<div class="card event-card">'
      + '<div class="event-date">' + esc(fmtDate(evt.date)) + ' ' + esc(evt.time || '') + '</div>'
      + '<div class="event-title">' + esc(evt.title) + '</div>'
      + '<div class="event-desc">' + esc(evt.description) + '</div>'
      + '<div class="flex-between mt-1">'
      + '<span class="event-tag">' + esc(evt.category) + '</span>'
      + '<a href="' + gcalUrl + '" target="_blank" class="text-sm">Add to Calendar ↗</a></div></div>';
  }
  setPage(html);
}

async function renderHazard() {
  setPage('<h2 class="mt-2 text-red">⚠️ Report a Safety Hazard</h2>'
    + '<div class="card card-urgent mt-2"><form id="hazard-form">'
    + '<div class="form-group"><label>What happened? <span class="text-dim">(min 20 characters)</span></label>'
    + '<textarea id="hazard-desc" required minlength="20" placeholder="Describe the unsafe condition or act..."></textarea></div>'
    + '<div class="form-group"><label>Where?</label><select id="hazard-range"><option value="">Not at a range</option>'
    + Object.entries(RANGES).map(([id, r]) => '<option value="' + id + '">' + esc(r.name) + '</option>').join('')
    + '</select></div>'
    + '<div class="form-group"><label>Add Photo <span class="text-dim">(optional)</span></label>'
    + '<input type="file" id="hazard-photo" accept="image/*" capture="environment" style="color:var(--cream)">'
    + '<div id="photo-preview" class="mt-1"></div></div>'
    + '<button type="submit" class="btn btn-red btn-block" id="hazard-btn">Submit Report</button>'
    + '</form></div>');

  document.getElementById('hazard-photo').addEventListener('change', function() {
    const file = this.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = document.createElement('img');
      img.src = e.target.result;
      img.style.cssText = 'max-width:100%;border-radius:8px;max-height:200px';
      const preview = document.getElementById('photo-preview');
      preview.textContent = '';
      preview.appendChild(img);
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('hazard-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('hazard-btn');
    btn.disabled = true; btn.textContent = 'Submitting...';

    const desc = document.getElementById('hazard-desc').value;
    const rangeId = document.getElementById('hazard-range').value;
    let photo = null;
    const photoFile = document.getElementById('hazard-photo').files[0];
    if (photoFile) {
      photo = await new Promise(resolve => { const r = new FileReader(); r.onload = e => resolve(e.target.result); r.readAsDataURL(photoFile); });
    }

    try {
      await api('/hazard/report', { method: 'POST', body: JSON.stringify({ range_id: rangeId || undefined, description: desc, photo }) });
      setPage('<div class="success-screen"><div class="checkmark-circle"></div>'
        + '<h2>Report Submitted</h2><p class="text-dim mt-1">Thank you for keeping our club safe.</p>'
        + '<a href="#home" class="btn btn-gold btn-block mt-2">Back to Home</a></div>');
    } catch (err) { showToast(err.message, 'error'); btn.disabled = false; btn.textContent = 'Submit Report'; }
  });
}

function renderContact() {
  setPage('<h2 class="mt-2">Contact</h2>'
    + '<div class="card mt-2"><h3>Otter Valley Rod &amp; Gun Club</h3>'
    + '<p class="mt-1">9908 Plank Road (formerly Highway 19)<br>Straffordville, Ontario</p>'
    + '<p class="text-dim text-sm mt-1">Between Eden and Straffordville</p>'
    + '<p class="mt-2"><strong>Email:</strong> <a href="mailto:ovrag@hotmail.com">ovrag@hotmail.com</a></p>'
    + '<div class="mt-2 flex gap-1" style="flex-wrap:wrap">'
    + '<a href="https://www.google.com/maps/search/9908+Plank+Road+Straffordville+Ontario" target="_blank" class="btn btn-gold">Get Directions</a>'
    + '<a href="https://www.facebook.com/OtterValleyRodGunClub" target="_blank" class="btn btn-outline">Facebook</a></div></div>');
}

async function renderAccount() {
  let m = getMember();
  try { const data = await api('/auth/me'); m = data.member; } catch (e) {}

  setPage('<h2 class="mt-2">Account</h2>'
    + '<div class="card mt-2"><p><strong>' + esc(m.first_name) + ' ' + esc(m.last_name) + '</strong></p>'
    + '<p class="text-dim text-sm">' + esc(m.email) + '</p>'
    + (m.membership_number ? '<p class="text-sm mt-1">Membership #: ' + esc(m.membership_number) + '</p>' : '') + '</div>'
    + '<button class="btn btn-outline btn-block mt-2" onclick="logout()">Sign Out</button>'
    + '<p class="text-center text-dim text-sm mt-3">Otter Valley R&G App v1.0</p>');
}

function renderMore() {
  setPage('<h2 class="mt-2">More</h2>'
    + '<div style="display:flex;flex-direction:column;gap:0.5rem;margin-top:1rem">'
    + '<a href="#events" class="card" style="display:flex;align-items:center;gap:1rem;padding:1rem"><span style="font-size:1.5rem">📅</span><span>Events</span></a>'
    + '<a href="#hazard" class="card" style="display:flex;align-items:center;gap:1rem;padding:1rem;border-color:var(--red-urgent)"><span style="font-size:1.5rem">⚠️</span><span>Report a Hazard</span></a>'
    + '<a href="#contact" class="card" style="display:flex;align-items:center;gap:1rem;padding:1rem"><span style="font-size:1.5rem">📞</span><span>Contact</span></a>'
    + '<a href="#account" class="card" style="display:flex;align-items:center;gap:1rem;padding:1rem"><span style="font-size:1.5rem">👤</span><span>Account</span></a></div>');
}

// --- Offline sync ---
window.addEventListener('online', async () => {
  document.body.classList.remove('offline');
  const queue = JSON.parse(localStorage.getItem('ov_pending_checkins') || '[]');
  if (queue.length === 0) return;
  let synced = 0;
  for (const item of queue) {
    try { await api('/visits/checkin', { method: 'POST', body: JSON.stringify(item) }); synced++; } catch (e) {}
  }
  localStorage.removeItem('ov_pending_checkins');
  if (synced > 0) showToast(synced + ' visit(s) synced');
});

window.addEventListener('offline', () => { document.body.classList.add('offline'); });
if (!navigator.onLine) document.body.classList.add('offline');
