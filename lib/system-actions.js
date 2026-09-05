'use strict';

const fs = require('fs');
const { execFile } = require('child_process');
const config = require('../config');

// System maintenance: status reporting
function rebootServer() {
  return new Promise((resolve) => {
    const child = execFile('sudo', ['-n', 'systemctl', 'reboot'], { timeout: 3000 }, (error) => {
      resolve({ ok: !error, error: error ? String(error.message || error) : null });
    });
    child.on('error', (error) => resolve({ ok: false, error: String(error.message || error) }));
  });
}

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
