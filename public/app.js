'use strict';

// Server Monitoring frontend — vanilla JS, no build step.
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const state = {
  view: 'overview',
  source: 'whatsapp',
  search: '',
  offset: 0,
  limit: 30,
  total: 0,
  sse: null,
  showLogic: false,
  lastTranscript: null,
  historyRange: '1d',
  historyMetric: 'cpu',
  appsTimer: null,
  systemPanel: 'status',
  features: { hermes: { available: true, chatHistory: true } },
};

// --- Helpers ---
function fmtBytes(n) {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(n) / Math.log(1024));
  return (n / Math.pow(1024, i)).toFixed(i ? 1 : 0) + ' ' + u[i];
}
function fmtNum(n) { return (n || 0).toLocaleString('id-ID'); }
function fmtUptime(s) {
  s = Math.floor(s);
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60);
  if (d) return `${d}h ${h}j`;
  if (h) return `${h}j ${m}m`;
  return `${m}m`;
}
function fmtDate(ts) {
  if (!ts) return '-';
  const d = new Date(ts * (ts < 1e12 ? 1000 : 1));
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) + ' ' +
    d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}
function gaugeClass(p) { return p >= 90 ? 'g-crit' : p >= 70 ? 'g-warn' : 'g-ok'; }

function openModal({ title = 'Konfirmasi', message = '', confirmText = 'Lanjut', cancelText = 'Batal', tone = 'info', input = false, placeholder = '' }) {
  return new Promise((resolve) => {
    const modal = $('#modal');
    const inputEl = $('#modal-input');
    $('#modal-title').textContent = title;
    $('#modal-message').textContent = message;
    $('#modal-ok').textContent = confirmText;
    $('#modal-cancel').textContent = cancelText;
    $('#modal-icon').textContent = tone === 'danger' ? '!' : tone === 'success' ? '✓' : 'i';
    $('#modal-icon').className = 'modal-icon ' + tone;
    inputEl.hidden = !input;
    inputEl.value = '';
    inputEl.placeholder = placeholder;
    modal.hidden = false;
    const cleanup = (value) => {
      modal.hidden = true;
      $('#modal-ok').onclick = null;
      $('#modal-cancel').onclick = null;
      $('[data-modal-cancel]').onclick = null;
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') cleanup(null);
      if (e.key === 'Enter' && !modal.hidden) cleanup(input ? inputEl.value : true);
    };
    $('#modal-ok').onclick = () => cleanup(input ? inputEl.value : true);
    $('#modal-cancel').onclick = () => cleanup(null);
    $('[data-modal-cancel]').onclick = () => cleanup(null);
    document.addEventListener('keydown', onKey);
    requestAnimationFrame(() => (input ? inputEl : $('#modal-ok')).focus());
  });
}

async function api(path, opts) {
  const r = await fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts));
  if (r.status === 401) { showLogin(); throw new Error('unauthorized'); }
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
  return r.json();
}

// --- Auth ---
function showLogin() {
  if (state.sse) { state.sse.close(); state.sse = null; }
  $('#app').hidden = true;
  $('#login').hidden = false;
}
function applyFeatures(features) {
  state.features = features || state.features;
  const hasHermes = !!state.features?.hermes?.chatHistory;
  document.body.classList.toggle('no-hermes', !hasHermes);
  $$('[data-view="chats"]').forEach((el) => { el.hidden = !hasHermes; });
  $$('.activity-card').forEach((el) => { el.hidden = !hasHermes; });
  if (!hasHermes) {
    const heroP = $('.hero-copy p');
    if (heroP) heroP.textContent = 'Data VPS real-time, app production, history resource, dan kontrol server ringan.';
    if (state.view === 'chats') {
      state.view = 'overview';
      $$('.view').forEach((v) => { v.hidden = v.id !== 'view-overview'; });
      $$('.tab').forEach((x) => x.classList.toggle('active', x.dataset.view === 'overview'));
    }
  }
}

async function refreshFeatures() {
  try {
    const f = await api('/api/features');
    applyFeatures(f);
    return f;
  } catch (_) { return state.features; }
}

async function showApp(features = null) {
  $('#login').hidden = true;
  $('#app').hidden = false;
  applyFeatures(features || state.features);
  await refreshFeatures();
  startMetrics();
  if (state.features?.hermes?.chatHistory) loadStats();
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#login-btn');
  const err = $('#login-error');
  err.hidden = true;
  btn.disabled = true; btn.textContent = 'Masuk…';
  try {
    await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ user: $('#login-user').value, pass: $('#login-pass').value }),
    });
    showApp();
  } catch (e2) {
    err.textContent = e2.message === 'unauthorized' ? 'Username atau password salah.' : e2.message;
    err.hidden = false;
  } finally {
    btn.disabled = false; btn.textContent = 'Masuk';
  }
});

$('#logout-btn').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' }).catch(() => {});
  showLogin();
});

// --- Theme ---
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('hm-theme', theme);
  const btn = $('#theme-btn');
  if (btn) btn.textContent = theme === 'light' ? '☀' : '☾';
  const themeMeta = $('meta[name="theme-color"]:not([media])');
  if (themeMeta) themeMeta.content = theme === 'light' ? '#F3F7FB' : '#07111F';
  $$('.brand-mark').forEach((img) => {
    img.src = theme === 'light'
      ? '/logo-light.png?v=20260601-servermonitor13'
      : '/logo-dark.png?v=20260601-servermonitor13';
  });
}
applyTheme(localStorage.getItem('hm-theme') || 'dark');
$('#theme-btn').addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
});

// --- Live metrics via SSE ---
function startMetrics() {
  if (state.sse) state.sse.close();
  const es = new EventSource('/api/metrics/stream');
  state.sse = es;
  es.onmessage = (ev) => {
    try { renderMetrics(JSON.parse(ev.data)); } catch (e) {}
  };
  es.onerror = () => { /* browser auto-reconnects */ };
}

function metricCard(id, label, hasGauge = true) {
  return `<div class="card metric" data-metric="${id}">
    <div class="metric-top"><span class="metric-label">${label}</span>${hasGauge ? '<span class="metric-percent">--</span>' : ''}</div>
    <div class="metric-value">--</div>
    ${hasGauge ? '<div class="gauge"><div class="gauge-fill" style="width:0%"></div></div>' : ''}
    <div class="metric-sub">--</div>
  </div>`;
}

function ensureMetricShell() {
  if (!$('#metric-cards').dataset.ready) {
    $('#metric-cards').innerHTML = [
      metricCard('cpu', 'CPU'),
      metricCard('mem', 'Memori'),
      metricCard('disk', 'Disk'),
      metricCard('swap', 'Swap'),
    ].join('');
    $('#metric-cards').dataset.ready = '1';
  }
  if (!$('#system-cards').dataset.ready) {
    $('#system-cards').innerHTML = [
      metricCard('uptime', 'Uptime Server', false),
      metricCard('load', 'Load 1 / 5 / 15', false),
      metricCard('syscpu', 'CPU'),
      metricCard('sysmem', 'Memori'),
      metricCard('sysdisk', 'Disk Root'),
      metricCard('sysswap', 'Swap'),
    ].join('');
    $('#system-cards').dataset.ready = '1';
  }
}

function updateMetric(id, value, sub, percent = null) {
  const el = $(`[data-metric="${id}"]`);
  if (!el) return;
  $('.metric-value', el).textContent = value;
  $('.metric-sub:last-child', el).textContent = sub;
  const pct = $('.metric-percent', el);
  const fill = $('.gauge-fill', el);
  if (typeof percent === 'number') {
    if (pct) pct.textContent = percent.toFixed(0) + '%';
    if (fill) {
      fill.style.width = Math.min(100, Math.max(0, percent)) + '%';
      fill.className = 'gauge-fill ' + gaugeClass(percent);
    }
  }
}

function renderMetrics(m) {
  ensureMetricShell();
  $('#host-name').textContent = m.host.name;
  const sysHost = $('#system-host');
  const sysMeta = $('#system-meta');
  if (sysHost) sysHost.textContent = m.host.name;
  if (sysMeta) sysMeta.textContent = `${m.host.platform} ${m.host.release} · uptime ${fmtUptime(m.uptime.system)} · ${m.cpu.load.cores} core`;
  const cpu = m.cpu.percent;
  const heroCpu = $('#hero-cpu');
  const heroRam = $('#hero-ram');
  const heroDisk = $('#hero-disk');
  if (heroCpu) heroCpu.textContent = cpu.toFixed(0) + '%';
  if (heroRam) heroRam.textContent = m.mem.usedPercent.toFixed(0) + '%';
  if (heroDisk) heroDisk.textContent = m.disk.usedPercent.toFixed(0) + '%';

  updateMetric('cpu', cpu.toFixed(1) + '%', `load ${m.cpu.load.one.toFixed(2)} · ${m.cpu.load.cores} core`, cpu);
  updateMetric('mem', fmtBytes(m.mem.used), `dari ${fmtBytes(m.mem.total)} · sisa ${fmtBytes(m.mem.available)}`, m.mem.usedPercent);
  updateMetric('disk', fmtBytes(m.disk.used), `dari ${fmtBytes(m.disk.total)} · sisa ${fmtBytes(m.disk.avail)}`, m.disk.usedPercent);
  updateMetric('swap', fmtBytes(m.mem.swapUsed), `dari ${fmtBytes(m.mem.swapTotal)}`, m.mem.swapPercent);

  updateMetric('uptime', fmtUptime(m.uptime.system), m.host.platform + ' · ' + m.host.release, null);
  updateMetric('load', `${m.cpu.load.one.toFixed(2)}`, `${m.cpu.load.five.toFixed(2)} · ${m.cpu.load.fifteen.toFixed(2)}`, null);
  updateMetric('syscpu', cpu.toFixed(1) + '%', `${m.cpu.load.cores} core tersedia`, cpu);
  updateMetric('sysmem', m.mem.usedPercent.toFixed(1) + '%', `${fmtBytes(m.mem.used)} / ${fmtBytes(m.mem.total)}`, m.mem.usedPercent);
  updateMetric('sysdisk', m.disk.usedPercent.toFixed(1) + '%', `${fmtBytes(m.disk.used)} / ${fmtBytes(m.disk.total)}`, m.disk.usedPercent);
  updateMetric('sysswap', m.mem.swapPercent.toFixed(1) + '%', `${fmtBytes(m.mem.swapUsed)} / ${fmtBytes(m.mem.swapTotal)}`, m.mem.swapPercent);
}

// --- Tab switching ---
$$('.tab').forEach((t) => {
  t.addEventListener('click', () => {
    if (t.dataset.view === 'chats' && !state.features?.hermes?.chatHistory) return;
    state.view = t.dataset.view;
    $$('.tab').forEach((x) => x.classList.toggle('active', x === t));
    $$('.view').forEach((v) => { v.hidden = v.id !== 'view-' + state.view; });
    if (state.view === 'chats' && !$('#session-list').dataset.loaded) loadSessions(true);
    if (state.view === 'system') setSystemPanel(state.systemPanel || 'status');
    else stopAppsRefresh();
  });
});

function setSystemPanel(panel) {
  state.systemPanel = panel;
  $$('#system-subnav button').forEach((b) => b.classList.toggle('active', b.dataset.systemPanel === panel));
  $$('.system-panel').forEach((el) => { el.hidden = el.dataset.panel !== panel; });
  if (panel === 'apps') {
    loadApps();
    startAppsRefresh();
  } else {
    stopAppsRefresh();
  }
  if (panel === 'history') loadHistory();
}

$$('#system-subnav button').forEach((b) => {
  b.addEventListener('click', () => setSystemPanel(b.dataset.systemPanel));
});

// --- Stats (overview source bars) ---
async function loadStats() {
  try {
    const s = await api('/api/stats');
    const max = Math.max(...s.bySource.map((b) => b.sessions), 1);
    $('#source-bars').innerHTML = s.bySource.map((b) => `
      <div class="sbar-row">
        <div class="sbar-top"><span class="sbar-name">${b.source}</span><span class="sbar-count">${fmtNum(b.sessions)} sesi</span></div>
        <div class="sbar-track"><div class="sbar-fill" style="width:${(b.sessions / max) * 100}%"></div></div>
      </div>`).join('') +
      `<div class="sbar-row" style="margin-top:8px;border-top:1px solid var(--line);padding-top:12px">
        <div class="sbar-top"><span class="sbar-name" style="color:var(--text)">Total</span><span class="sbar-count">${fmtNum(s.totals.sessions)} sesi · ${fmtNum(s.userMessages)} pesan user</span></div>
      </div>`;
  } catch (e) {
    $$('.activity-card').forEach((el) => { el.hidden = true; });
  }
}

// --- Source filter UI ---
const SOURCES = ['all', 'telegram', 'whatsapp', 'cron', 'cli', 'api_server'];
const SRC_LABEL = { all: 'Semua', telegram: 'Telegram', whatsapp: 'WhatsApp', cron: 'Cron', cli: 'CLI', api_server: 'API' };
$('#source-filter').innerHTML = SOURCES.map((s) =>
  `<button data-src="${s}" class="${s === state.source ? 'active' : ''}">${SRC_LABEL[s]}</button>`).join('');
$$('#source-filter button').forEach((b) => {
  b.addEventListener('click', () => {
    state.source = b.dataset.src;
    $$('#source-filter button').forEach((x) => x.classList.toggle('active', x === b));
    loadSessions(true);
  });
});

let searchTimer = null;
$('#chat-search').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.search = e.target.value.trim(); loadSessions(true); }, 300);
});
$('#load-more').addEventListener('click', () => loadSessions(false));

// --- Session list ---
async function loadSessions(reset) {
  const list = $('#session-list');
  if (reset) { state.offset = 0; list.innerHTML = '<div class="skeleton"></div>'.repeat(4); }
  try {
    const data = await api(`/api/sessions?source=${state.source}&limit=${state.limit}&offset=${state.offset}&q=${encodeURIComponent(state.search)}`);
    state.total = data.total;
    list.dataset.loaded = '1';
    const rows = data.sessions.map((s) => `
      <div class="session-item" data-id="${encodeURIComponent(s.id)}">
        <span class="src-badge src-${s.source}">${SRC_LABEL[s.source] || s.source}</span>
        <div class="session-main">
          <div class="session-title">${escapeHtml(s.title)}</div>
          <div class="session-sub">${s.user || '—'}${s.parts > 1 ? ` · ${s.parts} bagian` : ''}</div>
        </div>
        <div class="session-meta">
          <div class="session-msgs">${fmtNum(s.messageCount)}</div>
          <div class="session-date">${fmtDate(s.lastAt || s.startedAt)}</div>
        </div>
      </div>`).join('');
    if (reset) list.innerHTML = rows || '<div class="empty">Tidak ada sesi.</div>';
    else list.insertAdjacentHTML('beforeend', rows);
    state.offset += data.sessions.length;
    $('#session-more').hidden = state.offset >= state.total;
    bindSessionClicks();
  } catch (e) {
    if (reset) list.innerHTML = `<div class="empty">Gagal memuat: ${e.message}</div>`;
  }
}

function bindSessionClicks() {
  $$('.session-item').forEach((el) => {
    if (el.dataset.bound) return;
    el.dataset.bound = '1';
    el.addEventListener('click', () => openTranscript(decodeURIComponent(el.dataset.id)));
  });
}

// --- Transcript drawer ---
const ROLE_LABEL = { user: 'Kamu', assistant: 'Vera', tool: 'Logika' };

async function openTranscript(id) {
  const drawer = $('#drawer');
  drawer.hidden = false;
  $('#drawer-body').innerHTML = '<div class="skeleton"></div>'.repeat(5);
  try {
    const data = await api(`/api/sessions/${encodeURIComponent(id)}/messages?limit=3000`);
    state.lastTranscript = data;
    $('#drawer-title').textContent = data.session.title;
    const parts = data.session.parts > 1 ? ` · ${data.session.parts} bagian digabung` : '';
    $('#drawer-meta').textContent =
      `${SRC_LABEL[data.session.source] || data.session.source} · ${data.session.user || '—'} · ${data.messages.length} pesan${parts}`;
    renderTranscript();
  } catch (e) {
    $('#drawer-body').innerHTML = `<div class="empty">Gagal memuat: ${e.message}</div>`;
  }
}

// An assistant turn that is empty (only made a tool call) is treated as logic.
function isLogic(m) {
  return m.role === 'tool' || (m.role === 'assistant' && !(m.content && m.content.trim()));
}

function renderTranscript() {
  const data = state.lastTranscript;
  if (!data) return;
  const body = $('#drawer-body');
  const visible = state.showLogic ? data.messages : data.messages.filter((m) => !isLogic(m));

  if (!visible.length) {
    body.innerHTML = '<div class="empty">Tidak ada pesan.</div>';
    return;
  }
  body.innerHTML = visible.map((m) => {
    const logic = isLogic(m);
    const role = m.role;
    const label = logic ? (m.toolName ? m.toolName : 'logika') : (ROLE_LABEL[role] || role);
    const cls = logic ? 'tool' : role;
    return `<div class="msg msg-${cls}">
      <span class="msg-role">${escapeHtml(label)}</span>
      <div class="msg-bubble">${escapeHtml(m.content) || '<em style="opacity:.5">(tanpa teks)</em>'}</div>
    </div>`;
  }).join('');
  // Always land on the latest message.
  requestAnimationFrame(() => { body.scrollTop = body.scrollHeight; });
}

$('#logic-toggle').addEventListener('click', () => {
  state.showLogic = !state.showLogic;
  $('#logic-toggle').classList.toggle('on', state.showLogic);
  $('#logic-toggle').setAttribute('aria-pressed', String(state.showLogic));
  renderTranscript();
});

$$('[data-close]').forEach((el) => el.addEventListener('click', () => { $('#drawer').hidden = true; }));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#drawer').hidden = true; });

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// --- Production apps + history ---
function startAppsRefresh() {
  stopAppsRefresh();
  state.appsTimer = setInterval(() => { if (state.view === 'system') loadApps(); }, 30000);
}
function stopAppsRefresh() {
  if (state.appsTimer) clearInterval(state.appsTimer);
  state.appsTimer = null;
}
async function loadApps() {
  const box = $('#app-health-list');
  if (!box) return;
  box.innerHTML = box.dataset.loaded ? box.innerHTML : '<div class="skeleton"></div>'.repeat(2);
  try {
    const data = await api('/api/apps');
    box.dataset.loaded = '1';
    box.innerHTML = data.apps.map((app) => `
      <div class="app-card app-${app.status}">
        <div class="app-main">
          <div class="app-title-row"><h3>${escapeHtml(app.name)}</h3><span class="status-pill ${app.status}">${app.status.toUpperCase()}</span></div>
          <a href="${escapeHtml(app.url)}" target="_blank" rel="noreferrer">${escapeHtml(app.url)}</a>
          <div class="app-meta mono">HTTP ${app.httpCode || '—'} · ${app.latencyMs}ms · ${escapeHtml(app.serviceActive)}/${escapeHtml(app.serviceSub)}</div>
          <div class="app-meta">Terakhir cek ${fmtDate(app.checkedAt)}</div>
        </div>
        <div class="app-actions">
          ${app.startable ? `<button class="btn-ghost control-app" data-action="start" data-app="${escapeHtml(app.id)}">Start</button>` : ''}
          ${app.stoppable ? `<button class="btn-ghost control-app stop" data-action="stop" data-app="${escapeHtml(app.id)}">Stop</button>` : ''}
          ${app.restartable ? `<button class="btn-ghost restart-app" data-app="${escapeHtml(app.id)}">Restart</button>` : ''}
        </div>
      </div>`).join('');
    $$('.restart-app').forEach((b) => b.addEventListener('click', () => restartApp(b.dataset.app)));
    $$('.control-app').forEach((b) => b.addEventListener('click', () => controlApp(b.dataset.app, b.dataset.action)));
  } catch (e) {
    box.innerHTML = `<div class="empty">Gagal cek app: ${escapeHtml(e.message)}</div>`;
  }
}
async function restartApp(id) {
  const appName = id === 'apsone' ? 'Project Work UAPS' : 'Taka FinTrack';
  const ok = await openModal({
    title: `Restart ${appName}?`,
    message: 'Aplikasi bisa offline sebentar saat service direstart.',
    confirmText: 'Restart app',
    tone: 'danger',
  });
  if (!ok) return;
  try {
    await api(`/api/apps/${encodeURIComponent(id)}/restart`, { method: 'POST', body: '{}' });
    await openModal({ title: 'Restart dikirim', message: `${appName} sedang dicek ulang.`, confirmText: 'Oke', tone: 'success', cancelText: 'Tutup' });
    setTimeout(loadApps, 5000);
  } catch (e) {
    await openModal({ title: 'Gagal restart', message: e.message, confirmText: 'Oke', tone: 'danger', cancelText: 'Tutup' });
  }
}
async function controlApp(id, action) {
  const appName = id === 'apsone' ? 'Project Work UAPS' : 'Taka FinTrack';
  const label = action === 'start' ? 'Start' : 'Stop';
  const ok = await openModal({
    title: `${label} ${appName}?`,
    message: action === 'stop'
      ? 'Aplikasi akan dibuat offline sampai kamu start lagi.'
      : 'Service aplikasi akan dinyalakan kembali.',
    confirmText: label,
    tone: action === 'stop' ? 'danger' : 'success',
  });
  if (!ok) return;
  try {
    await api(`/api/apps/${encodeURIComponent(id)}/${action}`, { method: 'POST', body: '{}' });
    await openModal({ title: `${label} dikirim`, message: `${appName} sedang dicek ulang.`, confirmText: 'Oke', tone: 'success', cancelText: 'Tutup' });
    setTimeout(loadApps, 4000);
  } catch (e) {
    await openModal({ title: `${label} gagal`, message: e.message, confirmText: 'Oke', tone: 'danger', cancelText: 'Tutup' });
  }
}
function statsFor(points, key) {
  const vals = points.map((p) => Number(p[key] || 0));
  if (!vals.length) return { cur: 0, avg: 0, max: 0, min: 0, delta: 0 };
  const cur = vals[vals.length - 1];
  return {
    cur,
    avg: vals.reduce((a, b) => a + b, 0) / vals.length,
    max: Math.max(...vals),
    min: Math.min(...vals),
    delta: cur - vals[0],
  };
}
function axisLabel(ts) {
  const d = new Date(ts);
  if (state.historyRange === '1d') return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  if (state.historyRange === '7d') return d.toLocaleDateString('id-ID', { weekday: 'short', day: '2-digit' });
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
}
function chartSvg(points, key) {
  if (points.length < 2) return '<div class="empty small">Grafik sedang mengumpulkan data.</div>';
  const w = 360, h = 150, padX = 18, padTop = 16, plotBottom = 112, labelY = 138;
  const vals = points.map((p) => Math.max(0, Math.min(100, Number(p[key] || 0))));
  let min = Math.min(...vals), max = Math.max(...vals);
  if (max - min < 8) { min = Math.max(0, min - 4); max = Math.min(100, max + 4); }
  const y = (v) => plotBottom - ((v - min) / Math.max(1, max - min)) * (plotBottom - padTop);
  const x = (i) => padX + (i / Math.max(1, vals.length - 1)) * (w - padX * 2);
  const pts = vals.map((v, i) => ({ x: x(i), y: y(v), v, ts: points[i].ts }));
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const area = `${d} L${w - padX} ${plotBottom} L${padX} ${plotBottom} Z`;
  const last = pts[pts.length - 1];
  const first = pts[0];
  const tickIndexes = [0, Math.floor((pts.length - 1) / 3), Math.floor((pts.length - 1) * 2 / 3), pts.length - 1]
    .filter((v, i, a) => a.indexOf(v) === i);
  const ticks = tickIndexes.map((i) => {
    const p = pts[i];
    const anchor = i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle';
    return `<line class="axis-tick" x1="${p.x.toFixed(1)}" y1="${plotBottom}" x2="${p.x.toFixed(1)}" y2="${plotBottom + 5}" />
      <text x="${p.x.toFixed(1)}" y="${labelY}" text-anchor="${anchor}" class="axis-label">${axisLabel(p.ts)}</text>`;
  }).join('');
  return `<svg class="focus-chart ${key}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${key} trend">
    <defs>
      <linearGradient id="area-${key}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="currentColor" stop-opacity=".22"/>
        <stop offset="1" stop-color="currentColor" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <rect class="chart-panel-bg" x="0" y="0" width="${w}" height="${h}" rx="18" />
    <path class="chart-grid" d="M${padX} ${padTop}H${w - padX} M${padX} ${(padTop + plotBottom) / 2}H${w - padX} M${padX} ${plotBottom}H${w - padX}" />
    ${ticks}
    <path class="focus-area" d="${area}" />
    <path class="focus-line" d="${d}" />
    <circle class="first-dot" cx="${first.x.toFixed(1)}" cy="${first.y.toFixed(1)}" r="2.4" />
    <circle class="focus-dot" cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="3.6" />
    <text x="${padX}" y="14" class="chart-scale">${max.toFixed(0)}%</text>
    <text x="${padX}" y="${plotBottom - 4}" class="chart-scale">${min.toFixed(0)}%</text>
  </svg>`;}
function renderHistory(data) {
  const box = $('#history-charts');
  const labels = { cpu: 'CPU usage', ram: 'RAM usage', disk: 'Disk usage' };
  const desc = { cpu: 'Beban prosesor VPS', ram: 'Pemakaian memori aktif', disk: 'Pemakaian storage root' };
  const key = state.historyMetric;
  const st = statsFor(data.points, key);
  const deltaTone = st.delta >= 0 ? 'up' : 'down';
  box.innerHTML = `<div class="chart-hero chart-${key}">
    <div class="chart-summary">
      <div>
        <span class="chart-kicker">${labels[key]}</span>
        <h3>${st.cur.toFixed(1)}%</h3>
        <p>${desc[key]} dalam ${state.historyRange === '1d' ? '24 jam' : state.historyRange === '7d' ? '7 hari' : '30 hari'} terakhir.</p>
      </div>
      <span class="delta-pill ${deltaTone}">${st.delta >= 0 ? '+' : ''}${st.delta.toFixed(1)}%</span>
    </div>
    ${chartSvg(data.points, key)}
    <div class="chart-stat-row">
      <div><span>Avg</span><strong>${st.avg.toFixed(1)}%</strong></div>
      <div><span>Peak</span><strong>${st.max.toFixed(1)}%</strong></div>
      <div><span>Low</span><strong>${st.min.toFixed(1)}%</strong></div>
      <div><span>Sample</span><strong>${data.points.length}</strong></div>
    </div>
  </div>`;
}
async function loadHistory() {
  const box = $('#history-charts');
  if (!box) return;
  box.innerHTML = '<div class="skeleton chart-loading"></div>';
  try {
    const data = await api(`/api/history?range=${state.historyRange}`);
    renderHistory(data);
  } catch (e) { box.innerHTML = `<div class="empty">Gagal memuat grafik: ${escapeHtml(e.message)}</div>`; }
}
$('#refresh-apps')?.addEventListener('click', loadApps);
$$('#history-range button').forEach((b) => b.addEventListener('click', () => {
  state.historyRange = b.dataset.range;
  $$('#history-range button').forEach((x) => x.classList.toggle('active', x === b));
  loadHistory();
}));
$$('#history-metric button').forEach((b) => b.addEventListener('click', () => {
  state.historyMetric = b.dataset.metric;
  $$('#history-metric button').forEach((x) => x.classList.toggle('active', x === b));
  loadHistory();
}));
$('#reboot-btn')?.addEventListener('click', async () => {
  const text = await openModal({
    title: 'Restart VPS?',
    message: 'Ketik RESTART SERVER untuk konfirmasi. Dashboard akan offline sebentar.',
    confirmText: 'Restart VPS',
    tone: 'danger',
    input: true,
    placeholder: 'RESTART SERVER',
  });
  if (text !== 'RESTART SERVER') return;
  try {
    await api('/api/system/reboot', { method: 'POST', body: JSON.stringify({ confirm: text }) });
    await openModal({ title: 'Restart dijadwalkan', message: 'VPS akan reboot. Tunggu 1-2 menit lalu buka ulang dashboard.', confirmText: 'Oke', tone: 'success', cancelText: 'Tutup' });
  } catch (e) {
    await openModal({ title: 'Gagal restart VPS', message: e.message, confirmText: 'Oke', tone: 'danger', cancelText: 'Tutup' });
  }
});

// --- Mobile overscroll guard ---
function installRubberBandGuard() {
  const guarded = ['.content', '.drawer-body', '.login-screen'];
  guarded.forEach((selector) => {
    const el = $(selector);
    if (!el || el.dataset.overscrollGuard === '1') return;
    el.dataset.overscrollGuard = '1';
    let startY = 0;
    el.addEventListener('touchstart', (ev) => {
      if (!ev.touches || ev.touches.length !== 1) return;
      startY = ev.touches[0].clientY;
      if (el.scrollTop <= 0) el.scrollTop = 1;
      const max = el.scrollHeight - el.clientHeight;
      if (el.scrollTop >= max) el.scrollTop = Math.max(0, max - 1);
    }, { passive: true });
    el.addEventListener('touchmove', (ev) => {
      if (!ev.touches || ev.touches.length !== 1) return;
      const currentY = ev.touches[0].clientY;
      const deltaY = currentY - startY;
      const max = el.scrollHeight - el.clientHeight;
      if (max <= 0) {
        ev.preventDefault();
        return;
      }
      const pullingDownAtTop = el.scrollTop <= 0 && deltaY > 0;
      const pullingUpAtBottom = el.scrollTop >= max && deltaY < 0;
      if (pullingDownAtTop || pullingUpAtBottom) ev.preventDefault();
    }, { passive: false });
  });
}

// --- Boot ---
(async function init() {
  installRubberBandGuard();
  try {
    const me = await fetch('/api/me').then((r) => r.json());
    if (me.authed) showApp(me.features); else showLogin();
  } catch (e) { showLogin(); }
})();
