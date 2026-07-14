'use strict';

const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const rateLimit = require('express-rate-limit');
const Database = require('better-sqlite3');
const config = require('./config');
const metrics = require('./lib/metrics');
const db = require('./lib/db');
const auth = require('./lib/auth');
const apps = require('./lib/apps');
const history = require('./lib/history');
const systemActions = require('./lib/system-actions');
const http = require('./lib/http');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));

// --- Request logging middleware ---
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms ${ip}`);
  });
  next();
});

// --- Security headers (lightweight, no extra dep) ---
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

// --- Login: rate-limited to blunt brute force ---
// --- Helper for rate limiting ---
const createLimiter = (ms, max, message, extraOpts = {}) => rateLimit({
  windowMs: ms,
  max: max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: message },
  ...extraOpts,
});

const loginLimiter = createLimiter(15 * 60 * 1000, 10, 'too many attempts, try later');
const controlLimiter = createLimiter(10 * 60 * 1000, 3, 'terlalu banyak aksi kontrol, coba lagi nanti');
const rebootLimiter = createLimiter(10 * 60 * 1000, 1, 'restart VPS dibatasi, coba lagi nanti', { skipFailedRequests: true });

app.post('/api/login', loginLimiter, (req, res) => {
  const { user, pass } = req.body || {};
  if (!auth.checkCredentials(user, pass)) {
    return res.status(401).json({ error: 'invalid credentials' });
  }
  const token = auth.issueToken();
  res.setHeader('Set-Cookie',
    `${auth.COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(config.sessionTtlMs / 1000)}`);
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  res.setHeader('Set-Cookie', `${auth.COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
  res.json({ ok: true });
});

function featureFlags() {
  const hermesDb = !!(config.stateDbPath && fs.existsSync(config.stateDbPath));
  return {
    hermes: {
      available: hermesDb,
      chatHistory: hermesDb,
      stateDbConfigured: !!config.stateDbPath,
    },
  };
}

function parseBoundedInt(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));

app.get('/api/me', (req, res) => {
  const cookies = auth.parseCookie(req.headers.cookie || '');
  const payload = cookies[auth.COOKIE] ? auth.verify(cookies[auth.COOKIE]) : null;
  res.json({ authed: !!payload, user: payload ? payload.sub : null, features: featureFlags() });
});

app.get('/api/version', (req, res) => {
  res.json({ version: pkg.version });
});

app.get('/api/features', auth.requireAuth, (req, res) => {
  res.json(featureFlags());
});

app.get('/api/config/apps', (req, res) => {
  res.json({ apps: config.monitoredApps });
});

// --- Protected API ---
app.get('/api/stats', auth.requireAuth, (req, res) => {
  if (!featureFlags().hermes.chatHistory) return res.status(404).json({ error: 'Hermes chat history is not available on this server' });
  try { res.json(db.stats()); }
  catch (e) { console.error('[error] GET /api/stats:', e); res.status(500).json({ error: String(e.message || e) }); }
});

app.get('/api/sessions', auth.requireAuth, (req, res) => {
  if (!featureFlags().hermes.chatHistory) return res.status(404).json({ error: 'Hermes chat history is not available on this server' });
  try {
    const out = db.sessions({
      source: req.query.source || null,
      limit: parseBoundedInt(req.query.limit, 30, { min: 1, max: 100 }),
      offset: parseBoundedInt(req.query.offset, 0, { min: 0 }),
      search: req.query.q || null,
    });
    res.json(http.paginatedResponse(out.sessions, out.total, Math.floor(parseBoundedInt(req.query.offset, 0) / parseBoundedInt(req.query.limit, 30)) + 1, parseBoundedInt(req.query.limit, 30)));
  } catch (e) { console.error('[error] GET /api/sessions:', e); res.status(500).json({ error: String(e.message || e) }); }
});

app.get('/api/sessions/:id/messages', auth.requireAuth, (req, res) => {
  if (!featureFlags().hermes.chatHistory) return res.status(404).json({ error: 'Hermes chat history is not available on this server' });
  try {
    const out = db.messages(req.params.id, { limit: parseBoundedInt(req.query.limit, 500, { min: 1, max: 10000 }) });
    if (!out) return res.status(404).json({ error: 'session not found' });
    res.json(out);
  } catch (e) { console.error('[error] GET /api/sessions/:id/messages:', e); res.status(500).json({ error: String(e.message || e) }); }
});

// --- Health check for observability ---
app.get('/api/health', (req, res) => {
  const historyDb = db.checkSqliteDb(config.historyDbPath);
  const stateDb = db.checkSqliteDb(config.stateDbPath, { optional: true });
  res.json({
    status: historyDb.reachable && stateDb.reachable !== false ? 'ok' : 'degraded',
    uptime: { system: os.uptime(), process: process.uptime() },
    dbs: {
      history: historyDb,
      state: stateDb,
    },
  });
});

app.post('/api/metrics/reset', auth.requireAuth, (req, res) => {
  try {
    metrics.resetMetrics();
    res.json({ ok: true, message: 'History cleared' });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// --- Live metrics over Server-Sent Events ---
app.get('/api/metrics/stream', auth.requireAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = () => {
    try {
      res.write(`data: ${JSON.stringify(metrics.snapshot())}\n\n`);
    } catch (e) { /* client gone */ }
  };
  send();
  const timer = setInterval(send, config.metricsIntervalMs);
  req.on('close', () => clearInterval(timer));
});

// One-shot metrics (fallback if SSE unsupported).
app.get('/api/metrics', auth.requireAuth, (req, res) => {
  res.json(metrics.snapshot());
});

app.get('/api/apps', auth.requireAuth, async (req, res) => {
  try { res.json({ apps: await apps.listAppHealth() }); }
  catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});

app.post('/api/apps/:id/restart', auth.requireAuth, controlLimiter, async (req, res) => {
  try {
    const result = await apps.restartApp(req.params.id);
    if (!result.ok) return res.status(result.status || 500).json({ error: result.error || 'restart failed', result });
    res.json({ ok: true, result });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});

app.post('/api/apps/:id/:action', auth.requireAuth, controlLimiter, async (req, res) => {
  const action = req.params.action;
  if (!['start', 'stop'].includes(action)) return res.status(404).json({ error: 'unknown app action' });
  try {
    const result = await apps.controlApp(req.params.id, action);
    if (!result.ok) return res.status(result.status || 500).json({ error: result.error || `${action} failed`, result });
    res.json({ ok: true, result });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});

app.get('/api/history', auth.requireAuth, (req, res) => {
  try { res.json(history.history(req.query.range || '1d')); }
  catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});

app.post('/api/system/reboot', auth.requireAuth, rebootLimiter, (req, res) => {
  const confirm = String((req.body || {}).confirm || '').trim();
  if (confirm !== 'RESTART SERVER') return res.status(400).json({ error: 'konfirmasi harus persis: RESTART SERVER' });
  res.json({ ok: true, message: 'Restart VPS dijadwalkan. Dashboard akan offline sebentar.' });
  setTimeout(() => { systemActions.rebootServer().catch(() => {}); }, 500).unref();
});

function sendAppShell(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
}

app.get(['/', '/index.html'], sendAppShell);

// --- Static frontend (tiny, cached, no build server) ---
app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html'],
  maxAge: '1h',
  etag: true,
}));

// SPA fallback to login/dashboard shell.
app.get('*', sendAppShell);

history.start();

const server = app.listen(config.port, config.host, () => {
  console.log(`[server-monitoring] listening on http://${config.host}:${config.port}`);
  console.log(`[server-monitoring] state.db: ${config.stateDbPath}`);
});

function shutdown() {
  try { history.close(); } catch (e) {}
  server.close(() => process.exit(0));
  // SSE/live clients can keep the event loop open; do not let restart hang.
  setTimeout(() => process.exit(0), 1500).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
