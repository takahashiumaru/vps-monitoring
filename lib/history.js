'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('../config');
const metrics = require('./metrics');

let db = null;
let lastCleanup = 0;
let timer = null;

function open() {
  if (db) return db;
  fs.mkdirSync(path.dirname(config.historyDbPath), { recursive: true });
  db = new Database(config.historyDbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS metric_samples (
      ts INTEGER PRIMARY KEY,
      cpu REAL NOT NULL,
      ram REAL NOT NULL,
      disk REAL NOT NULL,
      load1 REAL,
      load5 REAL,
      load15 REAL
    );
    CREATE INDEX IF NOT EXISTS metric_samples_ts_idx ON metric_samples(ts);
  `);
  return db;
}

function sample() {
  const snap = metrics.snapshot();
  const conn = open();
  conn.prepare('INSERT OR REPLACE INTO metric_samples (ts,cpu,ram,disk,load1,load5,load15) VALUES (?,?,?,?,?,?,?)')
    .run(Date.now(), snap.cpu.percent, snap.mem.usedPercent, snap.disk.usedPercent, snap.cpu.load.one, snap.cpu.load.five, snap.cpu.load.fifteen);
  cleanupMaybe();
}

function cleanupMaybe() {
  const now = Date.now();
  if (now - lastCleanup < 1000 * 60 * 60) return;
  lastCleanup = now;
  open().prepare('DELETE FROM metric_samples WHERE ts < ?').run(now - config.historyRetentionMs);
}

function bucketMs(range) {
  if (range === '30d') return 1000 * 60 * 60 * 2;
  if (range === '7d') return 1000 * 60 * 30;
  return 1000 * 60 * 5;
}
function rangeMs(range) {
  if (range === '30d') return 1000 * 60 * 60 * 24 * 30;
  if (range === '7d') return 1000 * 60 * 60 * 24 * 7;
  return 1000 * 60 * 60 * 24;
}

function history(range = '1d') {
  if (!['1d', '7d', '30d'].includes(range)) range = '1d';
  const since = Date.now() - rangeMs(range);
  const bucket = bucketMs(range);
  const raw = open().prepare('SELECT ts, cpu, ram, disk, load1 FROM metric_samples WHERE ts >= ? ORDER BY ts ASC').all(since);
  if (raw.length <= 288) {
    return { range, bucketMs: 0, points: raw.map((r) => ({ ts: r.ts, cpu: r.cpu, ram: r.ram, disk: r.disk, load1: r.load1 })) };
  }
  const rows = open().prepare(`
    SELECT CAST(ts / ? AS INTEGER) * ? AS bucket,
           AVG(cpu) AS cpu, AVG(ram) AS ram, AVG(disk) AS disk,
           AVG(load1) AS load1
    FROM metric_samples
    WHERE ts >= ?
    GROUP BY bucket
    ORDER BY bucket ASC
  `).all(bucket, bucket, since);
  return {
    range,
    bucketMs: bucket,
    points: rows.map((r) => ({ ts: r.bucket, cpu: r.cpu, ram: r.ram, disk: r.disk, load1: r.load1 })),
  };
}

function start() {
  open();
  sample();
  if (timer) clearInterval(timer);
  timer = setInterval(() => { try { sample(); } catch (e) { console.error('[history]', e.message || e); } }, config.historyIntervalMs);
  timer.unref();
}

function resetSamples() {
  const conn = open();
  conn.prepare('DELETE FROM metric_samples').run();
}

function close() {
  if (timer) clearInterval(timer);
  if (db) db.close();
}

module.exports = { start, sample, history, resetSamples, close };
