'use strict';

const { execFile } = require('child_process');

function rebootServer() {
  return new Promise((resolve) => {
    const child = execFile('sudo', ['-n', 'systemctl', 'reboot'], { timeout: 3000 }, (error) => {
      resolve({ ok: !error, error: error ? String(error.message || error) : null });
    });
    child.on('error', (error) => resolve({ ok: false, error: String(error.message || error) }));
  });
}

module.exports = { rebootServer };
