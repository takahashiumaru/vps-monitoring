'use strict';

// Server Monitoring configuration.
// Env vars override these defaults so secrets never have to live in git.
const path = require('path');
const os = require('os');

module.exports = {
  port: parseInt(process.env.HM_PORT || '3002', 10),
  host: process.env.HM_HOST || '0.0.0.0',

  // Auth — single admin user. Override via env in production.
  admin: {
    user: process.env.HM_ADMIN_USER || 'admin',
    pass: process.env.HM_ADMIN_PASS || 'change-this-password',
  },

  // Session secret for signing the auth cookie. Regenerated each boot unless
  // pinned via env (pin it if you want sessions to survive restarts).
  sessionSecret: process.env.HM_SESSION_SECRET || require('crypto').randomBytes(32).toString('hex'),
  sessionTtlMs: 1000 * 60 * 60 * 12, // 12 hours

  // Read-only path to the live Hermes session DB.
  stateDbPath: process.env.HM_STATE_DB || path.join(os.homedir(), '.hermes', 'state.db'),

  // Metrics polling cadence pushed over SSE. Keep calm on a small VPS.
  metricsIntervalMs: parseInt(process.env.HM_METRICS_INTERVAL_MS || '5000', 10),

  // Cache DB-derived grouped chat summaries briefly so dashboard clicks do not
  // keep rescanning the live Hermes SQLite database.
  dbCacheTtlMs: parseInt(process.env.HM_DB_CACHE_TTL_MS || '15000', 10),

  historyDbPath: process.env.HM_HISTORY_DB || path.join(__dirname, 'data', 'metrics-history.sqlite'),
  historyIntervalMs: parseInt(process.env.HM_HISTORY_INTERVAL_MS || '60000', 10),
  historyRetentionMs: 1000 * 60 * 60 * 24 * 35,

  monitoredApps: [
    { id: 'taka-fintrack', name: 'Taka FinTrack', service: 'taka-fintrack.service', serviceScope: 'user', url: 'http://127.0.0.1:3001/', publicUrl: 'https://takahashiumaru.my.id/', timeoutMs: 3000, restartable: true, startable: true, stoppable: true },
    { id: 'apsone', name: 'Project Work UAPS', service: 'php8.3-fpm.service', serviceScope: 'system', url: 'https://apsone.web.id/', publicUrl: 'https://apsone.web.id/', timeoutMs: 4000, restartable: true, startable: true, stoppable: true, restartAlso: ['nginx.service'] },
  ],
};
