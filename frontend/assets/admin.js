// === Admin Dashboard ===
// Security note: All user-generated text is escaped via esc() before rendering.
// The innerHTML usage here renders only trusted template strings with escaped values.
const API = 'https://otter-valley-app.mikekapin139.workers.dev/api';
const RANGES = {
  rifle: 'Rifle Range', 'outdoor-pistol': 'Outdoor Pistol Range',
  'indoor-pistol': 'Indoor Pistol Range', archery: 'Archery Range',
  'sporting-clays': 'Sporting Clays Range', fishing: 'Fishing Pond',
};

function getAdminToken() { return localStorage.getItem('ov_admin_token'); }
function esc(s) { const d = document.createElement('div'); d.textContent = String(s || ''); return d.innerHTML; }

async function adminApi(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getAdminToken() };
  const res = await fetch(API + path, { ...opts, headers });
  if (res.status === 401) { adminLogout(); throw new Error('Session expired'); }
  if (path.includes('export') && res.ok) return res;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function showToast(msg, type = 'success') {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = 'toast toast-' + type;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// --- Auth ---
const loginDiv = document.getElementById('admin-login');
const dashDiv = document.getElementById('admin-dashboard');
const logoutBtn = document.getElementById('admin-logout-btn');

function checkAuth() {
  if (getAdminToken()) { loginDiv.classList.add('hidden'); dashDiv.classList.remove('hidden'); logoutBtn.style.display = ''; loadTab('activity'); }
  else { loginDiv.classList.remove('hidden'); dashDiv.classList.add('hidden'); logoutBtn.style.display = 'none'; }
}

window.adminLogout = function() {
  localStorage.removeItem('ov_admin_token');
  checkAuth();
};

document.getElementById('admin-login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('admin-error');
  errEl.classList.add('hidden');
  try {
    const res = await fetch(API + '/admin/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: document.getElementById('admin-user').value, password: document.getElementById('admin-pass').value }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    localStorage.setItem('ov_admin_token', data.token);
    checkAuth();
  } catch (err) { errEl.textContent = err.message; errEl.classList.remove('hidden'); }
});

checkAuth();

// --- Tabs ---
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    loadTab(tab.dataset.tab);
  });
});

const content = document.getElementById('tab-content');
function setContent(html) { content.innerHTML = html; }

async function loadTab(tab) {
  setContent('<div class="loading-overlay"><div class="spinner"></div></div>');
  if (tab === 'activity') await loadActivity();
  else if (tab === 'ranges') await loadRanges();
  else if (tab === 'hazards') await loadHazards();
  else if (tab === 'export') loadExport();
}

// --- Activity Tab ---
async function loadActivity() {
  try {
    const [stats, visits] = await Promise.all([
      adminApi('/admin/stats?period=week'),
      adminApi('/admin/visits?limit=20'),
    ]);

    let html = '<h3 class="mt-2">Currently Signed In</h3>';
    const signedIn = stats.currently_signed_in || [];
    if (signedIn.length === 0) {
      html += '<p class="text-dim text-sm">No one currently at any range</p>';
    } else {
      html += '<div class="stat-row">';
      for (const v of signedIn) {
        html += '<div class="stat-card" style="text-align:left;padding:0.75rem">'
          + '<strong class="text-gold">' + esc(v.first_name) + ' ' + esc(v.last_name) + '</strong>'
          + '<div class="text-sm text-dim">' + esc(RANGES[v.range_id] || v.range_id) + '</div></div>';
      }
      html += '</div>';
    }

    html += '<div class="stat-row mt-2">'
      + '<div class="stat-card"><div class="stat-value">' + esc(stats.total_visits) + '</div><div class="stat-label">Visits (week)</div></div>'
      + '<div class="stat-card"><div class="stat-value">' + esc(stats.unique_members) + '</div><div class="stat-label">Unique Members</div></div></div>';

    if (stats.per_range && stats.per_range.length) {
      const max = stats.per_range[0].count;
      html += '<h3 class="mt-2 mb-1">Range Usage (This Week)</h3><div class="bar-chart">';
      for (const r of stats.per_range) {
        const pct = max > 0 ? Math.round((r.count / max) * 100) : 0;
        const name = RANGES[r.range_id] || r.range_id;
        html += '<div class="bar-row"><span class="bar-label">' + esc(name) + '</span>'
          + '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%"></div></div>'
          + '<span class="bar-value">' + esc(r.count) + '</span></div>';
      }
      html += '</div>';
    }

    html += '<h3 class="mt-3 mb-1">Recent Visits</h3>';
    html += buildVisitsTable(visits.visits);
    setContent(html);
  } catch (e) { setContent('<p class="text-red mt-2">' + esc(e.message) + '</p>'); }
}

function buildVisitsTable(visits) {
  if (!visits.length) return '<p class="text-dim text-sm">No visits found</p>';
  let html = '<div style="overflow-x:auto"><table class="data-table"><thead><tr>'
    + '<th>Date/Time</th><th>Member</th><th>Range</th><th>Source</th></tr></thead><tbody>';
  for (const v of visits) {
    const date = v.signed_in_at ? v.signed_in_at.replace('T', ' ').slice(0, 16) : '';
    html += '<tr><td>' + esc(date) + '</td>'
      + '<td>' + esc((v.first_name || '') + ' ' + (v.last_name || '')) + '</td>'
      + '<td>' + esc(RANGES[v.range_id] || v.range_id) + '</td>'
      + '<td><span class="badge badge-' + esc(v.source) + '">' + esc(v.source) + '</span></td></tr>';
  }
  html += '</tbody></table></div>';
  return html;
}

// --- Ranges Tab ---
async function loadRanges() {
  try {
    const rangeData = await fetch(API + '/ranges/status').then(r => r.json());
    const ranges = rangeData.ranges || [];

    let html = '<h3 class="mt-2 mb-1">Range Status</h3><div class="range-grid">';
    for (const [id, name] of Object.entries(RANGES)) {
      const rs = ranges.find(r => r.range_id === id) || { status: 'open', note: '' };
      html += '<div class="card" style="padding:1rem">'
        + '<strong>' + esc(name) + '</strong>'
        + '<div class="mt-1"><span class="status-dot ' + esc(rs.status) + '"></span>' + esc(rs.status) + '</div>'
        + (rs.note ? '<div class="text-dim text-sm">' + esc(rs.note) + '</div>' : '')
        + '<div class="mt-1"><select id="status-' + id + '" style="font-size:0.8rem;padding:0.4rem;min-height:36px">'
        + '<option value="open"' + (rs.status === 'open' ? ' selected' : '') + '>Open</option>'
        + '<option value="closed"' + (rs.status === 'closed' ? ' selected' : '') + '>Closed</option>'
        + '<option value="reserved"' + (rs.status === 'reserved' ? ' selected' : '') + '>Reserved</option></select>'
        + '<input type="text" id="note-' + id + '" placeholder="Note" value="' + esc(rs.note) + '" style="font-size:0.8rem;padding:0.4rem;margin-top:0.5rem;min-height:36px">'
        + '<button class="btn btn-gold mt-1" style="font-size:0.8rem;padding:0.4rem 0.8rem;min-height:36px" onclick="updateRange(\'' + id + '\')">Save</button>'
        + '</div></div>';
    }
    html += '</div>';
    setContent(html);
  } catch (e) { setContent('<p class="text-red mt-2">' + esc(e.message) + '</p>'); }
}

window.updateRange = async function(id) {
  const status = document.getElementById('status-' + id).value;
  const note = document.getElementById('note-' + id).value;
  try {
    await adminApi('/admin/ranges/' + id, { method: 'PUT', body: JSON.stringify({ status, note }) });
    showToast(RANGES[id] + ' updated');
  } catch (e) { showToast(e.message, 'error'); }
};

// --- Hazards Tab ---
async function loadHazards() {
  try {
    const data = await adminApi('/admin/hazards');
    let html = '<h3 class="mt-2 mb-1">Hazard Reports</h3>'
      + '<div class="filter-pills"><button class="pill active" onclick="filterHazards(\'\')">All</button>'
      + '<button class="pill" onclick="filterHazards(\'new\')">New</button>'
      + '<button class="pill" onclick="filterHazards(\'reviewed\')">Reviewed</button>'
      + '<button class="pill" onclick="filterHazards(\'resolved\')">Resolved</button></div>'
      + '<div id="hazard-list">' + buildHazardList(data.hazards) + '</div>';
    setContent(html);
  } catch (e) { setContent('<p class="text-red mt-2">' + esc(e.message) + '</p>'); }
}

function buildHazardList(hazards) {
  if (!hazards || !hazards.length) return '<p class="text-dim text-sm mt-2">No hazard reports</p>';
  let html = '';
  for (const h of hazards) {
    html += '<div class="card card-urgent mt-1" style="padding:0.75rem">'
      + '<div class="flex-between"><strong>' + esc(h.first_name + ' ' + h.last_name) + '</strong>'
      + '<span class="badge badge-' + esc(h.status) + '">' + esc(h.status) + '</span></div>'
      + '<div class="text-sm text-dim">' + esc(h.created_at) + (h.range_id ? ' — ' + esc(RANGES[h.range_id] || h.range_id) : '') + '</div>'
      + '<p class="text-sm mt-1">' + esc(h.description) + '</p>';
    if (h.status !== 'resolved') {
      html += '<div class="flex gap-1 mt-1">';
      if (h.status === 'new') html += '<button class="btn btn-outline" style="font-size:0.75rem;padding:0.3rem 0.6rem;min-height:auto" onclick="updateHazard(' + h.id + ',\'reviewed\')">Mark Reviewed</button>';
      html += '<button class="btn btn-gold" style="font-size:0.75rem;padding:0.3rem 0.6rem;min-height:auto" onclick="updateHazard(' + h.id + ',\'resolved\')">Mark Resolved</button></div>';
    }
    html += '</div>';
  }
  return html;
}

window.updateHazard = async function(id, status) {
  try {
    await adminApi('/admin/hazards/' + id, { method: 'PUT', body: JSON.stringify({ status }) });
    showToast('Report updated');
    loadHazards();
  } catch (e) { showToast(e.message, 'error'); }
};

window.filterHazards = async function(status) {
  document.querySelectorAll('#tab-content .pill').forEach(p => p.classList.remove('active'));
  event.target.classList.add('active');
  try {
    const params = status ? '?status=' + status : '';
    const data = await adminApi('/admin/hazards' + params);
    document.getElementById('hazard-list').innerHTML = buildHazardList(data.hazards);
  } catch (e) { showToast(e.message, 'error'); }
};

// --- Export Tab ---
function loadExport() {
  const today = new Date().toISOString().split('T')[0];
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  setContent('<h3 class="mt-2 mb-2">Export Visit Log</h3>'
    + '<div class="card"><div class="form-group"><label>From</label>'
    + '<input type="date" id="export-from" value="' + monthAgo + '"></div>'
    + '<div class="form-group"><label>To</label>'
    + '<input type="date" id="export-to" value="' + today + '"></div>'
    + '<button class="btn btn-gold btn-block" onclick="downloadCSV()">Download CSV</button></div>');
}

window.downloadCSV = async function() {
  const from = document.getElementById('export-from').value;
  const to = document.getElementById('export-to').value;
  try {
    const res = await adminApi('/admin/export?from=' + from + '&to=' + to);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'otter-valley-visits-' + from + '-to-' + to + '.csv';
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV downloaded');
  } catch (e) { showToast(e.message, 'error'); }
};
