'use strict';

// Minimal signed-cookie session auth. No external session store — a signed
// token carrying an expiry timestamp, verified with HMAC. Stateless + light.
const crypto = require('crypto');
const config = require('../config');

/**
 * Signs a payload object into a signed token.
 * @param {object} payload
 * @returns {string}
 */
function sign(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', config.sessionSecret).update(data).digest('base64url');
  return data + '.' + mac;
}

/**
 * Verifies and decodes a signed session token.
 * @param {string} token
 * @returns {object|null}
 */
function verify(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [data, mac] = token.split('.');
  const expected = crypto.createHmac('sha256', config.sessionSecret).update(data).digest('base64url');
  // constant-time compare
  if (mac.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (!payload.exp || typeof payload.exp !== 'number' || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Constant-time credential check to avoid timing leaks on username/password.
 * @param {string} user
 * @param {string} pass
 * @returns {boolean}
 */
function checkCredentials(user, pass) {
  if (typeof user !== 'string' || typeof pass !== 'string') return false;
  const uOk = safeEqual(user, config.admin.user);
  const pOk = safeEqual(pass, config.admin.pass);
  return uOk && pOk;
}

/**
 * Compares two values in constant time.
 * @param {string|Buffer} a
 * @param {string|Buffer} b
 * @returns {boolean}
 */
function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) {
    // Still do a compare against itself to keep timing roughly constant.
    crypto.timingSafeEqual(ab, ab);
    return false;
  }
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Issues a new signed admin session token.
 * @returns {string}
 */
function issueToken() {
  return sign({ sub: config.admin.user, exp: Date.now() + config.sessionTtlMs });
}

const COOKIE = 'hm_session';

/**
 * Express middleware: require a valid session, else 401.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function requireAuth(req, res, next) {
  const token = parseCookie(req.headers.cookie || '')[COOKIE];
  const payload = verify(token);
  if (!payload) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  req.user = payload.sub;
  next();
}

/**
 * Parses cookie header string into key-value map.
 * @param {string} str
 * @returns {Record<string, string>}
 */
function parseCookie(str) {
  return str.split(';').reduce((acc, pair) => {
    const idx = pair.indexOf('=');
    if (idx > -1) {
      const k = pair.slice(0, idx).trim();
      const v = pair.slice(idx + 1).trim();
      if (k) acc[k] = decodeURIComponent(v);
    }
    return acc;
  }, {});
}

module.exports = { checkCredentials, issueToken, requireAuth, verify, COOKIE, parseCookie };
