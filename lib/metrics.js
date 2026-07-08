'use strict';

// Reads live system metrics straight from /proc and the filesystem.
// No external deps — pure Node + Linux pseudo-files.
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');

let prevCpu = null;

function readCpuTimes() {
  const line = fs.readFileSync('/proc/stat', 'utf8').split('\n')[0];
  const parts = line.trim().split(/\s+/).slice(1).map(Number);
  // user, nice, system, idle, iowait, irq, softirq, steal
  const idle = parts[3] + (parts[4] || 0);
  const total = parts.reduce((a, b) => a + b, 0);
  return { idle, total };
}

function cpuPercent() {
  const cur = readCpuTimes();
  if (!prevCpu) {
    prevCpu = cur;
    return 0;
  }
  const idleDelta = cur.idle - prevCpu.idle;
  const totalDelta = cur.total - prevCpu.total;
  prevCpu = cur;
  if (totalDelta <= 0) return 0;
  return Math.max(0, Math.min(100, (1 - idleDelta / totalDelta) * 100));
}

function memInfo() {
  const txt = fs.readFileSync('/proc/meminfo', 'utf8');
  const map = {};
  txt.split('\n').forEach((l) => {
    const m = l.match(/^(\w+):\s+(\d+)/);
    if (m) map[m[1]] = parseInt(m[2], 10) * 1024; // kB -> bytes
  });
  const total = map.MemTotal || 0;
  const available = map.MemAvailable || 0;
  const used = total - available;
  const swapTotal = map.SwapTotal || 0;
  const swapFree = map.SwapFree || 0;
  const swapUsed = swapTotal - swapFree;
  return {
    total, used, available,
    usedPercent: total ? (used / total) * 100 : 0,
    swapTotal, swapUsed,
    swapPercent: swapTotal ? (swapUsed / swapTotal) * 100 : 0,
  };
}

function diskInfo() {
  // Root filesystem usage via df (portable, one line).
  try {
    const out = execSync('df -kP /', { encoding: 'utf8', timeout: 2000 }).trim().split('\n')[1];
    if (!out) throw new Error('No output from df');
    const cols = out.split(/\s+/);
    const total = parseInt(cols[1], 10) * 1024;
    const used = parseInt(cols[2], 10) * 1024;
    const avail = parseInt(cols[3], 10) * 1024;
    return { total, used, avail, usedPercent: total ? (used / total) * 100 : 0 };
  } catch (e) {
    console.error('[metrics] diskInfo failed:', e.message);
    return { total: 0, used: 0, avail: 0, usedPercent: 0 };
  }
}

function loadAvg() {
  const [one, five, fifteen] = os.loadavg();
  return { one, five, fifteen, cores: os.cpus().length };
}

function uptime() {
  return { system: os.uptime(), process: process.uptime() };
}

function snapshot() {
  return {
    ts: Date.now(),
    cpu: { percent: cpuPercent(), load: loadAvg() },
    mem: memInfo(),
    disk: diskInfo(),
    uptime: uptime(),
    host: { name: os.hostname(), platform: os.platform(), release: os.release() },
  };
}

/**
 * Reset stored metric history (deletes all rows from metric_samples).
 * Uses a lazy require to avoid circular dependency with lib/history.js.
 */
function resetMetrics() {
  // eslint-disable-next-line global-require
  const history = require('./history');
  history.resetSamples();
}

module.exports = { snapshot, resetMetrics };
