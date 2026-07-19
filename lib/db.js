'use strict';

// Read-only access to the live Hermes state.db.
const Database = require('better-sqlite3');
const config = require('../config');
const fs = require('fs');

let db = null;
let groupsCache = null;
let groupsCacheAt = 0;

function getDb() {
  if (db) return db;
  db = new Database(config.stateDbPath, { readonly: true, fileMustExist: true });
  db.pragma('busy_timeout = 3000');
  db.pragma('query_only = ON');
  return db;
}

/**
 * Returns DB connectivity status and ping latency in ms.
 */
function health() {
  const start = Date.now();
  getDb().prepare('SELECT 1').get();
  return { status: 'ok', latencyMs: Date.now() - start };
}

function checkSqliteDb(dbPath, { optional = false } = {}) {
  if (!dbPath || !fs.existsSync(dbPath)) {
    return optional
      ? { reachable: null, reason: 'not configured' }
      : { reachable: false, reason: 'missing' };
  }

  const started = Date.now();
  let conn;
  try {
    conn = new Database(dbPath, { readonly: true });
    conn.prepare('SELECT 1 AS ok').get();
    return { reachable: true, latencyMs: Date.now() - started };
  } catch (e) {
    return { reachable: false, latencyMs: Date.now() - started, error: String(e.message || e) };
  } finally {
    if (conn) conn.close();
  }
}

/**
 * Masks user IDs for privacy, e.g., '123456789' -> '1234***789'.
 * @param {string | number} uid The user ID to mask.
 * @returns {string | null} The masked ID or null.
 */

function maskId(uid) {
  if (!uid) return null;
  const s = String(uid);
  if (s.length <= 6) return s;
  return s.slice(0, 4) + '***' + s.slice(-3);
}

function loadLineage() {
  const d = getDb();
  const rows = d.prepare(
    `SELECT id, source, user_id, title, message_count, tool_call_count,
            started_at, ended_at, parent_session_id, input_tokens, output_tokens
     FROM sessions`
  ).all();
  const byId = new Map();
  rows.forEach((r) => byId.set(r.id, r));
  const rootCache = new Map();

  function rootOf(id) {
    if (rootCache.has(id)) return rootCache.get(id);
    const seen = new Set();
    let cur = id;
    while (true) {
      const s = byId.get(cur);
      const p = s && s.parent_session_id;
      if (!s || !p || p === '' || !byId.has(p) || seen.has(p)) break;
      seen.add(cur);
      cur = p;
    }
    rootCache.set(id, cur);
    return cur;
  }
  return { rows, byId, rootOf };
}

function titleBase(title) {
  if (!title || !String(title).trim()) return '';
  return String(title).trim().replace(/\s+#\d+$/u, '').trim();
}

function groupKeyFor(row) {
  // If the gateway/platform knows the sender/chat id, this is the identity Umar
  // expects: same Telegram/WA number = one history, even across sessions.
  if (row.user_id && String(row.user_id).trim()) {
    return `identity:${row.source}:${row.user_id}`;
  }
  // Umar wants every undetected sender/chat (`—`) collapsed into one clean
  // bucket. If user_id is missing, do not keep showing many topic rows with the
  // same unknown identity; merge them per platform.
  return `unknown:${row.source}`;
}

function chooseTitle(parts, fallback) {
  const sorted = parts.slice().sort((a, b) => (a.started_at || 0) - (b.started_at || 0));
  const titled = sorted.find((p) => p.title && p.title.trim());
  return (titled && titled.title.trim()) || fallback || '(tanpa judul)';
}

function stats() {
  const d = getDb();
  const groups = Array.from(buildGroups().values());
  const bySourceMap = new Map();
  const totals = { sessions: groups.length, messages: 0, tools: 0 };
  for (const g of groups) {
    totals.messages += g.messageCount || 0;
    totals.tools += g.toolCount || 0;
    bySourceMap.set(g.source, (bySourceMap.get(g.source) || 0) + 1);
  }
  const bySource = Array.from(bySourceMap.entries())
    .map(([source, sessions]) => ({ source, sessions }))
    .sort((a, b) => b.sessions - a.sessions);
  const userMsgs = d.prepare("SELECT COUNT(*) AS c FROM messages WHERE role='user'").get();
  const tokens = d.prepare(
    "SELECT COALESCE(SUM(input_tokens),0) AS input, COALESCE(SUM(output_tokens),0) AS output FROM sessions"
  ).get();
  const identityGroups = groups.filter((g) => g.user_id).length;
  return { bySource, totals, userMessages: userMsgs.c, tokens, identityGroups };
}

function buildGroups() {
  const now = Date.now();
  if (groupsCache && (now - groupsCacheAt) < config.dbCacheTtlMs) return groupsCache;

  const { rows, byId, rootOf } = loadLineage();
  const groups = new Map();

  for (const r of rows) {
    const key = groupKeyFor(r);
    let g = groups.get(key);
    if (!g) {
      g = {
        id: key,
        source: r.source,
        user_id: r.user_id || null,
        members: [],
        parts: 0,
        messageCount: 0,
        toolCount: 0,
        startedAt: null,
        lastAt: null,
        inputTokens: 0,
        outputTokens: 0,
      };
      groups.set(key, g);
    }
    g.members.push(r.id);
    g.parts += 1;
    g.messageCount += r.message_count || 0;
    g.toolCount += r.tool_call_count || 0;
    g.inputTokens += r.input_tokens || 0;
    g.outputTokens += r.output_tokens || 0;
    if ((r.started_at != null) && (g.startedAt == null || r.started_at < g.startedAt)) g.startedAt = r.started_at;
    const end = r.ended_at || r.started_at;
    if ((end != null) && (g.lastAt == null || end > g.lastAt)) g.lastAt = end;
  }

  for (const g of groups.values()) {
    const parts = g.members.map((id) => byId.get(id)).filter(Boolean);
    const platform = g.source === 'telegram' ? 'Telegram' : g.source === 'whatsapp' ? 'WhatsApp' : g.source === 'cron' ? 'Cron' : g.source === 'cli' ? 'CLI' : g.source;
    g.title = g.user_id
      ? `${platform} · ${maskId(g.user_id)}`
      : (g.id.startsWith('unknown:')
        ? `${platform} · tidak terdeteksi`
        : (titleBase(chooseTitle(parts, '(tanpa judul)')) || `${platform} · tidak terdeteksi`));
  }
  groupsCache = groups;
  groupsCacheAt = now;
  return groups;
}

function sessions({ source = null, limit = 30, offset = 0, search = null } = {}) {
  let list = Array.from(buildGroups().values());
  if (source && source !== 'all') list = list.filter((g) => g.source === source);
  if (search) {
    const q = search.toLowerCase();
    list = list.filter((g) =>
      g.title.toLowerCase().includes(q) || g.id.toLowerCase().includes(q) || String(g.user_id || '').toLowerCase().includes(q));
  }
  list.sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));

  const total = list.length;
  const lim = Math.min(100, Math.max(1, limit));
  const off = Math.max(0, offset);
  const page = list.slice(off, off + lim);

  return {
    total,
    totalPages: Math.ceil(total / lim),
    sessions: page.map((g) => ({
      id: g.id,
      source: g.source,
      user: maskId(g.user_id),
      title: g.title,
      messageCount: g.messageCount,
      toolCount: g.toolCount,
      parts: g.parts,
      startedAt: g.startedAt,
      lastAt: g.lastAt,
      inputTokens: g.inputTokens,
      outputTokens: g.outputTokens,
    })),
  };
}

function session(groupId) {
  const groups = buildGroups();
  const g = groups.get(groupId);
  if (!g) return null;
  return {
    id: g.id,
    source: g.source,
    user: maskId(g.user_id),
    title: g.title,
    messageCount: g.messageCount,
    toolCount: g.toolCount,
    parts: g.parts,
    startedAt: g.startedAt,
    lastAt: g.lastAt,
    inputTokens: g.inputTokens,
    outputTokens: g.outputTokens,
  };
}

function messages(groupId, { limit = 5000 } = {}) {
  const d = getDb();
  const groups = buildGroups();
  const group = groups.get(groupId);
  if (!group) return null;
  const ids = group.members;
  const placeholders = ids.map(() => '?').join(',');
  const msgs = d.prepare(
    `SELECT id, session_id, role, content, tool_name, timestamp
     FROM messages
     WHERE session_id IN (${placeholders}) AND role IN ('user','assistant','tool')
     ORDER BY timestamp ASC, id ASC
     LIMIT ?`
  ).all(...ids, Math.min(10000, limit));

  return {
    session: {
      id: groupId,
      source: group.source,
      user: maskId(group.user_id),
      title: group.title,
      parts: group.parts,
    },
    messages: msgs.map((m) => ({
      id: m.id,
      role: m.role,
      content: typeof m.content === 'string' ? m.content.slice(0, 8000) : '',
      toolName: m.tool_name || null,
      ts: m.timestamp,
    })),
  };
}

module.exports = { stats, sessions, session, messages, maskId, health, checkSqliteDb };
