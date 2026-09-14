'use strict';

const fs = require('fs');
const { execFile } = require('child_process');
const config = require('../config');

/**
 * Initiates a graceful server reboot via systemctl.
 * @returns {Promise<{ ok: boolean, error: string|null }>}
 */
function rebootServer() {
  return new Promise((resolve) => {
    const child = execFile('sudo', ['-n', 'systemctl', 'reboot'], { timeout: 3000 }, (error) => {
      resolve({ ok: !error, error: error ? String(error.message || error) : null });
    });
    child.on('error', (error) => resolve({ ok: false, error: String(error.message || error) }));
  });
}

/**
 * Returns available system feature flags based on server configuration.
 * @returns {{ hermes: { available: boolean, chatHistory: boolean, stateDbConfigured: boolean } }}
 */
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

module.exports = { rebootServer, featureFlags };
