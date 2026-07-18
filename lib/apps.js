'use strict';

const { execFile } = require('child_process');
const config = require('../config');

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = execFile(cmd, args, { timeout: opts.timeout || 6000, encoding: 'utf8' }, (error, stdout, stderr) => {
      resolve({ ok: !error, code: error && typeof error.code === 'number' ? error.code : 0, stdout: String(stdout || ''), stderr: String(stderr || ''), error: error ? String(error.message || error) : null });
    });
    child.on('error', (error) => resolve({ ok: false, code: -1, stdout: '', stderr: '', error: String(error.message || error) }));
  });
}

function appById(id) {
  return config.monitoredApps.find((a) => a.id === id) || null;
}

function systemctlArgs(app, action = 'show') {
  if (['restart', 'start', 'stop'].includes(action)) {
    return app.serviceScope === 'user'
      ? ['--user', action, app.service]
      : [action, app.service];
  }
  return app.serviceScope === 'user'
    ? ['--user', 'show', app.service, '-p', 'ActiveState', '-p', 'SubState', '--value']
    : ['show', app.service, '-p', 'ActiveState', '-p', 'SubState', '--value'];
}

async function serviceState(app) {
  const out = await run('systemctl', systemctlArgs(app), { timeout: 3500 });
  const lines = out.stdout.trim().split('\n').filter(Boolean);
  return {
    active: lines[0] || (out.ok ? 'unknown' : 'error'),
    sub: lines[1] || 'unknown',
    ok: out.ok,
  };
}

async function httpCheck(app) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), app.timeoutMs || 3000);
  try {
    const r = await fetch(app.url, { method: 'GET', redirect: 'manual', signal: controller.signal, headers: { 'User-Agent': 'server-monitoring-health/1.0' } });
    return { ok: r.status >= 200 && r.status < 400, httpCode: r.status, latencyMs: Date.now() - started, error: null };
  } catch (e) {
    return { ok: false, httpCode: 0, latencyMs: Date.now() - started, error: e.name === 'AbortError' ? 'timeout' : String(e.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

async function healthFor(app) {
  const [svc, http] = await Promise.all([serviceState(app), httpCheck(app)]);
  let status = 'down';
  if (http.ok && svc.active === 'active') status = 'up';
  else if (http.ok || svc.active === 'active') status = 'degraded';
  return {
    id: app.id,
    name: app.name,
    url: app.publicUrl || app.url,
    status,
    httpCode: http.httpCode,
    latencyMs: http.latencyMs,
    error: http.error,
    service: app.service,
    serviceActive: svc.active,
    serviceSub: svc.sub,
    checkedAt: Date.now(),
    restartable: !!app.restartable,
    startable: !!app.startable,
    stoppable: !!app.stoppable,
  };
}

async function listAppHealth() {
  return Promise.all(config.monitoredApps.map(healthFor));
}

async function restartApp(id) {
  const app = appById(id);
  if (!app) return { ok: false, status: 404, error: 'app not found' };
  if (!app.restartable) return { ok: false, status: 403, error: 'restart disabled for this app' };
  const restartCmd = app.serviceScope === 'user' ? ['systemctl', systemctlArgs(app, 'restart')] : ['sudo', ['-n', 'systemctl', 'restart', app.service]];
  const main = await run(restartCmd[0], restartCmd[1], { timeout: 15000 });
  const restarted = [{ service: app.service, ok: main.ok, error: main.error || main.stderr.trim() || null }];
  for (const svc of app.restartAlso || []) {
    const out = await run('sudo', ['-n', 'systemctl', 'restart', svc], { timeout: 15000 });
    restarted.push({ service: svc, ok: out.ok, error: out.error || out.stderr.trim() || null });
  }
  return { ok: restarted.every((x) => x.ok), restarted };
}

async function controlApp(id, action) {
  const app = appById(id);
  if (!app) return { ok: false, status: 404, error: 'app not found' };
  if (!['start', 'stop'].includes(action)) return { ok: false, status: 400, error: 'invalid action' };
  const flag = action === 'start' ? 'startable' : 'stoppable';
  if (!app[flag]) return { ok: false, status: 403, error: `${action} disabled for this app` };
  const cmd = app.serviceScope === 'user'
    ? ['systemctl', systemctlArgs(app, action)]
    : ['sudo', ['-n', 'systemctl', action, app.service]];
  const main = await run(cmd[0], cmd[1], { timeout: 15000 });
  return { ok: main.ok, action, service: app.service, error: main.error || main.stderr.trim() || null };
}

module.exports = { listAppHealth, restartApp, controlApp, appById, healthFor };
