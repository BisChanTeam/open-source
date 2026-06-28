/*
MIT License

Copyright (c) 2026 SupromTeam

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

const path = require('path');
const fs = require('fs/promises');
const net = require('net');
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { WebSocketServer, WebSocket } = require('ws');
const { v4: uuid } = require('uuid');
const { createStorage } = require('./utils/storage');
const {
  sanitizeUser,
  sanitizeUserForViewer,
  chatIdFor,
  normalizeUsername,
  isDisplayNameAllowed,
  isUsernameAllowed,
} = require('./utils/users');
const { registerApiRoutes } = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET =
  process.env.JWT_SECRET ||
  process.env.BISCHAN_TOKEN ||
  process.env['BISCHAN-TOKEN'] ||
  'env.\u0411\u0438\u0441\u0427\u0430\u043d-secret';
const LOG_LEVEL = (process.env.LOG_LEVEL || 'info').toLowerCase();
const IP_FILTER_ENABLED = process.env.BISCHAN_IP_FILTER_ENABLED !== 'false';
const HOME_COUNTRY_CODES = new Set(
  String(process.env.BISCHAN_HOME_COUNTRIES || 'RU')
    .split(',')
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean),
);
const IP_INTEL_BASE_URL =
  process.env.BISCHAN_IP_INTEL_URL || 'http://ip-api.com/json';
const IP_INTEL_SHARED_KEY = process.env.BISCHAN_IP_INTEL_KEY || '';
const IP_INTEL_TIMEOUT_MS = Number(
  process.env.BISCHAN_IP_INTEL_TIMEOUT_MS || 2500,
);
const IP_INTEL_CACHE_MS = Number(
  process.env.BISCHAN_IP_INTEL_CACHE_MS || 24 * 60 * 60 * 1000,
);
const IP_PERSIST_DEBOUNCE_MS = Number(
  process.env.BISCHAN_IP_PERSIST_DEBOUNCE_MS || 1500,
);
const HELP_ORIG_USERNAME = 'helpOrig';
const HELP_ORIG_AUTO_REPLY =
  '\u041f\u043e\u0434\u0434\u0435\u0440\u0436\u043a\u0430 \u0437\u0434\u0435\u0441\u044c \u043d\u0435 \u0440\u0430\u0431\u043e\u0442\u0430\u0435\u0442, \u043d\u0430\u043f\u0438\u0448\u0438\u0442\u0435 \u043d\u0430 \u043f\u043e\u0447\u0442\u0443 supromteam@ya.ru';
const UNSAFE_PASSWORDS_URL =
  process.env.UNSAFE_PASSWORDS_URL ||
  'https://biscdn.ru/safe-system/unsafe_passwords.txt';
  //'https://bisfd.github.io/safe-system/unsafe_passwords.txt';
const UNSAFE_PASSWORDS_USER_AGENT =
  process.env.UNSAFE_PASSWORDS_USER_AGENT ||
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';
const UNSAFE_PASSWORDS_REFRESH_MS = Number(
  process.env.UNSAFE_PASSWORDS_REFRESH_MS || 6 * 60 * 60 * 1000,
);

const LOG_MESSAGES = {
  uploads_prepare_failed: '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043f\u043e\u0434\u0433\u043e\u0442\u043e\u0432\u0438\u0442\u044c \u043f\u0430\u043f\u043a\u0443 uploads',
  http_request: '\u0048\u0054\u0054\u0050 \u0437\u0430\u043f\u0440\u043e\u0441',
  auth_missing_token: '\u0041\u0075\u0074\u0068\u003a \u043e\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u0435\u0442 \u0442\u043e\u043a\u0435\u043d',
  auth_user_not_found: '\u0041\u0075\u0074\u0068\u003a \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d',
  auth_user_blocked: '\u0041\u0075\u0074\u0068\u003a \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c \u0437\u0430\u0431\u043b\u043e\u043a\u0438\u0440\u043e\u0432\u0430\u043d',
  auth_ok: '\u0041\u0075\u0074\u0068\u003a \u0443\u0441\u043f\u0435\u0448\u043d\u043e',
  auth_error: '\u0041\u0075\u0074\u0068\u003a \u043e\u0448\u0438\u0431\u043a\u0430',
  user_register: '\u0420\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u044f',
  user_login: '\u0412\u0445\u043e\u0434',
  api_me_help: '\u0041\u0050\u0049 \u002f\u006d\u0065 \u0028\u0068\u0065\u006c\u0070\u0029',
  api_me: '\u0041\u0050\u0049 \u002f\u006d\u0065',
  avatar_updated: '\u0410\u0432\u0430\u0442\u0430\u0440 \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d',
  file_uploaded: '\u0424\u0430\u0439\u043b \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043d',
  profile_updated: '\u041f\u0440\u043e\u0444\u0438\u043b\u044c \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d',
  password_updated: '\u041f\u0430\u0440\u043e\u043b\u044c \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d',
  account_deleted: '\u0410\u043a\u043a\u0430\u0443\u043d\u0442 \u0443\u0434\u0430\u043b\u0435\u043d',
  read_state_updated: '\u041f\u0440\u043e\u0447\u0438\u0442\u0430\u043d\u043e',
  admin_users_list: '\u0410\u0434\u043c\u0438\u043d\u003a \u0441\u043f\u0438\u0441\u043e\u043a \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u0435\u0439',
  admin_block: '\u0410\u0434\u043c\u0438\u043d\u003a \u0431\u043b\u043e\u043a\u0438\u0440\u043e\u0432\u043a\u0430 \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044f',
  admin_mute: '\u0410\u0434\u043c\u0438\u043d\u003a \u043c\u0443\u0442 \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044f',
  admin_reports_list: '\u0410\u0434\u043c\u0438\u043d\u003a \u0441\u043f\u0438\u0441\u043e\u043a \u0436\u0430\u043b\u043e\u0431',
  report_created: '\u0416\u0430\u043b\u043e\u0431\u0430 \u0441\u043e\u0437\u0434\u0430\u043d\u0430',
  privacy_updated: '\u041f\u0440\u0438\u0432\u0430\u0442\u043d\u043e\u0441\u0442\u044c \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u0430',
  muted_message_blocked: '\u041c\u0443\u0442\u003a \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435 \u0437\u0430\u0431\u043b\u043e\u043a\u0438\u0440\u043e\u0432\u0430\u043d\u043e',
  unsafe_passwords_loaded:
    '\u041f\u0430\u0440\u043e\u043b\u0438: \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d \u0441\u043f\u0438\u0441\u043e\u043a \u043d\u0435\u0431\u0435\u0437\u043e\u043f\u0430\u0441\u043d\u044b\u0445 \u043f\u0430\u0440\u043e\u043b\u0435\u0439',
  unsafe_passwords_load_failed:
    '\u041f\u0430\u0440\u043e\u043b\u0438: \u043d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u0441\u043f\u0438\u0441\u043e\u043a \u043d\u0435\u0431\u0435\u0437\u043e\u043f\u0430\u0441\u043d\u044b\u0445 \u043f\u0430\u0440\u043e\u043b\u0435\u0439',
  server_started: '\u0421\u0435\u0440\u0432\u0435\u0440 \u0437\u0430\u043f\u0443\u0449\u0435\u043d',
  presence: '\u041f\u0440\u0438\u0441\u0443\u0442\u0441\u0442\u0432\u0438\u0435',
  ws_missing_token: '\u0057\u0053\u003a \u043e\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u0435\u0442 \u0442\u043e\u043a\u0435\u043d',
  ws_user_missing_or_blocked: '\u0057\u0053\u003a \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c \u043e\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u0435\u0442 \u0438\u043b\u0438 \u0437\u0430\u0431\u043b\u043e\u043a\u0438\u0440\u043e\u0432\u0430\u043d',
  ws_connected: '\u0057\u0053\u003a \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0435\u043d\u0438\u0435',
  ws_bad_packet: '\u0057\u0053\u003a \u043d\u0435\u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u044b\u0439 \u043f\u0430\u043a\u0435\u0442',
  ws_message: '\u0057\u0053\u003a \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435',
  ws_typing: '\u0057\u0053\u003a \u043f\u0435\u0447\u0430\u0442\u044c',
  ws_disconnected: '\u0057\u0053\u003a \u043e\u0442\u043a\u043b\u044e\u0447\u0435\u043d\u0438\u0435',
  ws_auth_error: '\u0057\u0053\u003a\u043e\u0448\u0438\u0431\u043a\u0430 \u0430\u0432\u0442\u043e\u0440\u0438\u0437\u0430\u0446\u0438\u0438',
  ip_filter_ready: 'IP filter: state loaded',
  ip_filter_lookup_failed: 'IP filter: lookup failed',
  ip_filter_blocked: 'IP filter: blocked foreign static IP',
  ip_filter_state_save_failed: 'IP filter: state save failed',
  ip_filter_rate_limited: 'IP filter: intel provider rate limit',
  ip_filter_state_load_failed: 'IP filter: state load failed',
  server_shutting_down: '\u0421\u0435\u0440\u0432\u0435\u0440 \u0437\u0430\u0432\u0435\u0440\u0448\u0430\u0435\u0442 \u0440\u0430\u0431\u043e\u0442\u0443',
  data_bad_json: '\u0414\u0430\u043d\u043d\u044b\u0435: \u043f\u043e\u0432\u0440\u0435\u0436\u0434\u0435\u043d JSON',
  uploads_cleanup_failed: 'Uploads: cleanup failed',
};

const log = (level, event, meta = {}) => {
  const levels = { debug: 0, info: 1, warn: 2, error: 3 };
  const current = levels[LOG_LEVEL] ?? 1;
  if ((levels[level] ?? 1) < current) return;
  const stamp = new Date().toISOString();
  const message = LOG_MESSAGES[event] || event;
  const payload =
    meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  const line = `[${stamp}] [${level}] ${message}${payload}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
};

const normalizePasswordCandidate = (value) =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

const unsafePasswords = new Set();
const loadUnsafePasswords = async () => {
  const response = await fetch(UNSAFE_PASSWORDS_URL, {
    cache: 'no-store',
    headers: {
      'user-agent': UNSAFE_PASSWORDS_USER_AGENT,
      accept: 'text/plain,*/*',
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const text = await response.text();
  const next = new Set();
  text.split(/\r?\n/).forEach((line) => {
    const normalized = normalizePasswordCandidate(line);
    if (!normalized) return;
    next.add(normalized);
  });
  if (!next.size) {
    throw new Error('Unsafe password list is empty');
  }
  unsafePasswords.clear();
  next.forEach((value) => unsafePasswords.add(value));
  log('info', 'unsafe_passwords_loaded', {
    source: UNSAFE_PASSWORDS_URL,
    count: unsafePasswords.size,
  });
};

const unsafePasswordsInit = loadUnsafePasswords().catch((err) => {
  log('warn', 'unsafe_passwords_load_failed', {
    source: UNSAFE_PASSWORDS_URL,
    error: err.message,
  });
});

if (
  Number.isFinite(UNSAFE_PASSWORDS_REFRESH_MS) &&
  UNSAFE_PASSWORDS_REFRESH_MS > 0
) {
  const timer = setInterval(() => {
    loadUnsafePasswords().catch((err) => {
      log('warn', 'unsafe_passwords_load_failed', {
        source: UNSAFE_PASSWORDS_URL,
        error: err.message,
      });
    });
  }, UNSAFE_PASSWORDS_REFRESH_MS);
  if (typeof timer.unref === 'function') timer.unref();
}

const isUnsafePassword = async (password) => {
  await unsafePasswordsInit;
  const normalized = normalizePasswordCandidate(password);
  if (!normalized) return false;
  return unsafePasswords.has(normalized);
};


const ROOT_DIR = path.resolve(__dirname, '../..');
const resolveDirFromEnv = (envName, fallbackPath) => {
  const value = process.env[envName];
  return value ? path.resolve(value) : fallbackPath;
};
const DATA_DIR = resolveDirFromEnv('BISCHAN_DATA_DIR', path.join(__dirname, 'data'));
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');
const GROUPS_FILE = path.join(DATA_DIR, 'groups.json');
const CHANNELS_FILE = path.join(DATA_DIR, 'channels.json');
const REPORTS_FILE = path.join(DATA_DIR, 'reports.json');
const IP_AUDIT_FILE = path.join(DATA_DIR, 'ip_audit.json');
const BLOCKED_IPS_FILE = path.join(DATA_DIR, 'blocked_ips.json');
const AVATARS_DIR = resolveDirFromEnv(
  'BISCHAN_AVATARS_DIR',
  '/var/www/userphoto.ru/avatars'
);

const FILES_DIR = resolveDirFromEnv(
  'BISCHAN_FILES_DIR',
  '/var/www/userphoto.ru/files'
);

const buildIpIntelUrl = (ip) => {
  const base = String(IP_INTEL_BASE_URL || '').trim().replace(/\/+$/, '');
  if (!base) return '';
  if (base.includes('{ip}')) return base.replace('{ip}', encodeURIComponent(ip));
  return `${base}/${encodeURIComponent(ip)}?fields=status,message,country,countryCode,mobile,proxy,hosting,isp,org,as,asname,query`;
};

const STATIC_NETWORK_MARKERS = [
  /\bstatic\b/i,
  /\bdatacenter\b/i,
  /\bdata[\s-]?center\b/i,
  /\bhosting\b/i,
  /\bserver\b/i,
  /\bcloud\b/i,
  /\bvps\b/i,
  /\bcolo(?:cation)?\b/i,
  /\benterprise\b/i,
  /\bbusiness\b/i,
  /\bcorporat(?:e|ion)\b/i,
];

const toUpper = (value) => String(value || '').trim().toUpperCase();

const normalizeClientIp = (rawValue) => {
  if (!rawValue) return '';
  let value = String(rawValue).trim();
  if (!value) return '';
  if (value.startsWith('[') && value.includes(']')) {
    const end = value.indexOf(']');
    value = value.slice(1, end);
  }
  if (value.includes(','))
    value = value
      .split(',')
      .map((part) => part.trim())
      .find(Boolean) || '';
  if (!value) return '';
  if (value.startsWith('::ffff:')) value = value.slice('::ffff:'.length);
  if (net.isIP(value) === 0 && value.includes('.')) {
    const lastColon = value.lastIndexOf(':');
    if (lastColon > 0) {
      const maybeIp = value.slice(0, lastColon);
      const maybePort = value.slice(lastColon + 1);
      if (/^\d+$/.test(maybePort) && net.isIP(maybeIp) === 4) {
        value = maybeIp;
      }
    }
  }
  return net.isIP(value) ? value : '';
};

const extractClientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  const candidate =
    typeof forwarded === 'string' && forwarded
      ? forwarded
      : req.socket.remoteAddress || '';
  return normalizeClientIp(candidate);
};

const isPrivateOrLocalIp = (ip) => {
  const family = net.isIP(ip);
  if (!family) return true;
  if (family === 4) {
    const parts = ip.split('.').map((part) => Number(part));
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    return false;
  }
  const lowered = ip.toLowerCase();
  if (lowered === '::1' || lowered === '::') return true;
  if (lowered.startsWith('fc') || lowered.startsWith('fd')) return true;
  if (
    lowered.startsWith('fe8') ||
    lowered.startsWith('fe9') ||
    lowered.startsWith('fea') ||
    lowered.startsWith('feb')
  ) {
    return true;
  }
  return false;
};

const isLikelyStaticForeignIp = (intel) => {
  if (!intel || typeof intel !== 'object') return false;
  if (intel.mobile === true) return false;
  if (intel.hosting === true) return true;
  const sourceText = [intel.asname, intel.as, intel.org, intel.isp]
    .filter(Boolean)
    .join(' ');
  return STATIC_NETWORK_MARKERS.some((pattern) => pattern.test(sourceText));
};

const isForeignCountry = (countryCode) => {
  const normalized = toUpper(countryCode);
  if (!normalized) return false;
  return !HOME_COUNTRY_CODES.has(normalized);
};

Promise.all([
  fs.mkdir(AVATARS_DIR, { recursive: true }),
  fs.mkdir(FILES_DIR, { recursive: true }),
]).catch((err) => {
  log('error', 'uploads_prepare_failed', { error: err.message });
});

const ipAudit = new Map();
const blockedForeignStaticIps = new Set();
const ipIntelCache = new Map();
let ipIntelRateLimitedUntil = 0;
let persistIpStateTimer = null;

const readJsonFile = async (filePath, fallback) => {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed;
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
};

const writeJsonFile = async (filePath, data) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
};

const persistIpFilterStateNow = async () => {
  const blocked = Array.from(blockedForeignStaticIps).sort();
  const audit = Array.from(ipAudit.values()).sort((a, b) =>
    String(a.ip).localeCompare(String(b.ip)),
  );
  await writeJsonFile(BLOCKED_IPS_FILE, blocked);
  await writeJsonFile(IP_AUDIT_FILE, audit);
};

const scheduleIpFilterPersist = () => {
  if (persistIpStateTimer) return;
  const waitMs =
    Number.isFinite(IP_PERSIST_DEBOUNCE_MS) && IP_PERSIST_DEBOUNCE_MS > 0
      ? IP_PERSIST_DEBOUNCE_MS
      : 1500;
  persistIpStateTimer = setTimeout(() => {
    persistIpStateTimer = null;
    persistIpFilterStateNow().catch((err) => {
      log('warn', 'ip_filter_state_save_failed', { error: err.message });
    });
  }, waitMs);
  if (typeof persistIpStateTimer.unref === 'function') {
    persistIpStateTimer.unref();
  }
};

const rememberIp = (ip, patch = {}) => {
  const now = new Date().toISOString();
  const existing = ipAudit.get(ip) || {
    ip,
    firstSeenAt: now,
    lastSeenAt: now,
    hits: 0,
    blocked: false,
    foreign: null,
    countryCode: null,
    country: null,
    staticLikely: null,
    mobile: null,
    hosting: null,
    proxy: null,
    reason: null,
  };
  existing.lastSeenAt = now;
  existing.hits += 1;
  Object.assign(existing, patch);
  ipAudit.set(ip, existing);
  scheduleIpFilterPersist();
  return existing;
};

const loadIpFilterState = async () => {
  const [blockedRaw, auditRaw] = await Promise.all([
    readJsonFile(BLOCKED_IPS_FILE, []),
    readJsonFile(IP_AUDIT_FILE, []),
  ]);

  if (Array.isArray(blockedRaw)) {
    blockedRaw.forEach((candidate) => {
      const normalized = normalizeClientIp(candidate);
      if (normalized) blockedForeignStaticIps.add(normalized);
    });
  }

  if (Array.isArray(auditRaw)) {
    auditRaw.forEach((entry) => {
      if (!entry || typeof entry !== 'object') return;
      const normalized = normalizeClientIp(entry.ip);
      if (!normalized) return;
      ipAudit.set(normalized, {
        ip: normalized,
        firstSeenAt: entry.firstSeenAt || new Date().toISOString(),
        lastSeenAt: entry.lastSeenAt || new Date().toISOString(),
        hits: Number(entry.hits) || 0,
        blocked: !!entry.blocked,
        foreign: typeof entry.foreign === 'boolean' ? entry.foreign : null,
        countryCode: entry.countryCode || null,
        country: entry.country || null,
        staticLikely:
          typeof entry.staticLikely === 'boolean' ? entry.staticLikely : null,
        mobile: typeof entry.mobile === 'boolean' ? entry.mobile : null,
        hosting: typeof entry.hosting === 'boolean' ? entry.hosting : null,
        proxy: typeof entry.proxy === 'boolean' ? entry.proxy : null,
        reason: entry.reason || null,
      });
    });
  }

  log('info', 'ip_filter_ready', {
    blocked: blockedForeignStaticIps.size,
    observed: ipAudit.size,
    enabled: IP_FILTER_ENABLED,
    homeCountries: Array.from(HOME_COUNTRY_CODES),
  });
};

const ipFilterStateReady = loadIpFilterState().catch((err) => {
  log('warn', 'ip_filter_state_load_failed', { error: err.message });
});

const checkIpIntel = async (ip) => {
  if (!IP_FILTER_ENABLED) return null;
  const now = Date.now();
  if (ipIntelRateLimitedUntil > now) return null;
  const cached = ipIntelCache.get(ip);
  const cacheTtl =
    Number.isFinite(IP_INTEL_CACHE_MS) && IP_INTEL_CACHE_MS > 0
      ? IP_INTEL_CACHE_MS
      : 24 * 60 * 60 * 1000;
  if (cached && now - cached.checkedAt < cacheTtl) return cached.payload;

  const targetUrl = buildIpIntelUrl(ip);
  if (!targetUrl) return null;

  const timeoutMs =
    Number.isFinite(IP_INTEL_TIMEOUT_MS) && IP_INTEL_TIMEOUT_MS > 0
      ? IP_INTEL_TIMEOUT_MS
      : 2500;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = {
      accept: 'application/json,text/plain,*/*',
      'user-agent':
        'BisChanIPFilter/1.0 (+https://example.local/ip-filter; Node.js)',
    };
    if (IP_INTEL_SHARED_KEY) {
      headers['x-ip-check-key'] = IP_INTEL_SHARED_KEY;
    }

    const response = await fetch(targetUrl, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
      headers,
    });

    const remaining = Number(response.headers.get('x-rl'));
    const ttlSec = Number(response.headers.get('x-ttl'));
    if (Number.isFinite(remaining) && remaining <= 0 && Number.isFinite(ttlSec)) {
      ipIntelRateLimitedUntil = Date.now() + Math.max(ttlSec, 1) * 1000;
      log('warn', 'ip_filter_rate_limited', {
        waitMs: Math.max(ttlSec, 1) * 1000,
      });
    }
    if (!response.ok) {
      if (response.status === 429) {
        ipIntelRateLimitedUntil = Date.now() + 60 * 1000;
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    let normalizedPayload = null;

    // Native ip-api.com response.
    if (payload && payload.status === 'success') {
      normalizedPayload = payload;
    }

    // Response from standalone ip-check-service.js.
    if (
      !normalizedPayload &&
      payload &&
      payload.ok === true &&
      (typeof payload.blocked === 'boolean' || typeof payload.foreign === 'boolean')
    ) {
      const intel = payload.intel && typeof payload.intel === 'object' ? payload.intel : {};
      normalizedPayload = {
        status: 'success',
        query: payload.ip || ip,
        country: payload.country || null,
        countryCode: payload.countryCode || null,
        mobile:
          typeof intel.mobile === 'boolean'
            ? intel.mobile
            : typeof payload.mobile === 'boolean'
              ? payload.mobile
              : null,
        hosting:
          typeof intel.hosting === 'boolean'
            ? intel.hosting
            : typeof payload.hosting === 'boolean'
              ? payload.hosting
              : null,
        proxy:
          typeof intel.proxy === 'boolean'
            ? intel.proxy
            : typeof payload.proxy === 'boolean'
              ? payload.proxy
              : null,
        isp: intel.isp || payload.isp || null,
        org: intel.org || payload.org || null,
        as: intel.as || payload.as || null,
        asname: intel.asname || payload.asname || null,
        _preclassified: {
          blocked: typeof payload.blocked === 'boolean' ? payload.blocked : null,
          foreign: typeof payload.foreign === 'boolean' ? payload.foreign : null,
          staticLikely:
            typeof payload.staticLikely === 'boolean' ? payload.staticLikely : null,
          reason: payload.reason || null,
        },
      };
    }

    if (!normalizedPayload) {
      const message = payload && payload.message ? payload.message : 'lookup_failed';
      throw new Error(message);
    }

    ipIntelCache.set(ip, { checkedAt: Date.now(), payload: normalizedPayload });
    return normalizedPayload;
  } finally {
    clearTimeout(timer);
  }
};

const inspectClientIp = async (ip) => {
  if (!ip) return { blocked: false, reason: null, foreign: null };

  if (isPrivateOrLocalIp(ip)) {
    rememberIp(ip, { blocked: false, reason: 'private_or_local', foreign: false });
    return { blocked: false, reason: 'private_or_local', foreign: false };
  }

  if (blockedForeignStaticIps.has(ip)) {
    rememberIp(ip, {
      blocked: true,
      reason: 'blocked_foreign_static',
      foreign: true,
      staticLikely: true,
    });
    return { blocked: true, reason: 'blocked_foreign_static', foreign: true };
  }

  if (!IP_FILTER_ENABLED) {
    rememberIp(ip, { blocked: false, reason: 'filter_disabled' });
    return { blocked: false, reason: 'filter_disabled', foreign: null };
  }

  const intel = await checkIpIntel(ip);
  if (!intel) {
    rememberIp(ip, { blocked: false, reason: 'intel_unavailable' });
    return { blocked: false, reason: 'intel_unavailable', foreign: null };
  }

  const countryCode = toUpper(intel.countryCode);
  const preclassified = intel._preclassified || null;
  const foreign =
    preclassified && typeof preclassified.foreign === 'boolean'
      ? preclassified.foreign
      : isForeignCountry(countryCode);
  const staticLikely =
    preclassified && typeof preclassified.staticLikely === 'boolean'
      ? preclassified.staticLikely
      : foreign
        ? isLikelyStaticForeignIp(intel)
        : false;
  const blockedByPolicy =
    preclassified && typeof preclassified.blocked === 'boolean'
      ? preclassified.blocked
      : foreign && staticLikely;

  rememberIp(ip, {
    blocked: blockedByPolicy,
    foreign,
    countryCode: countryCode || null,
    country: intel.country || null,
    staticLikely,
    mobile: typeof intel.mobile === 'boolean' ? intel.mobile : null,
    hosting: typeof intel.hosting === 'boolean' ? intel.hosting : null,
    proxy: typeof intel.proxy === 'boolean' ? intel.proxy : null,
    reason: blockedByPolicy ? 'blocked_foreign_static' : 'allowed',
  });

  if (!blockedByPolicy) {
    return { blocked: false, reason: 'allowed', foreign };
  }

  blockedForeignStaticIps.add(ip);
  scheduleIpFilterPersist();
  log('warn', 'ip_filter_blocked', {
    ip,
    countryCode: countryCode || null,
    country: intel.country || null,
    as: intel.as || null,
    asname: intel.asname || null,
    isp: intel.isp || null,
    mobile: intel.mobile === true,
    hosting: intel.hosting === true,
    proxy: intel.proxy === true,
  });
  return { blocked: true, reason: 'blocked_foreign_static', foreign: true };
};

const denyBlockedIp = (req, res) => {
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(403).json({
      error: 'access_denied',
      reason: 'foreign_static_ip_blocked',
    });
  }
  return res
    .status(403)
    .send('Access denied: traffic from this IP is blocked.');
};

// Storage helpers ------------------------------------------------------------
const {
  loadUsers,
  loadMessages,
  loadGroups,
  loadChannels,
  loadReports,
  saveUsers,
  saveMessages,
  saveReports,
  removeFileIfExists,
} = createStorage({
  files: {
    usersFile: USERS_FILE,
    messagesFile: MESSAGES_FILE,
    groupsFile: GROUPS_FILE,
    channelsFile: CHANNELS_FILE,
    reportsFile: REPORTS_FILE,
  },
  log,
});

// Shared map used by both API routes and WebSocket layer.
const liveSockets = new Map(); // userId -> ws
// Multer config for uploads --------------------------------------------------
const avatarStorage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, AVATARS_DIR),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuid()}${ext}`);
  },
});

const filesStorage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, FILES_DIR),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuid()}${ext}`);
  },
});

const upload = multer({
  storage: avatarStorage,
  limits: {
    fileSize: 2 * 1024 * 1024,
  },
});

const fileUpload = multer({
  storage: filesStorage,
  limits: {
    fileSize: 20 * 1024 * 1024,
  },
});

// Express setup --------------------------------------------------------------
app.use(express.json());
app.use(async (req, res, next) => {
  const clientIp = extractClientIp(req);
  req.clientIp = clientIp;

  if (!clientIp) return next();

  try {
    await ipFilterStateReady;
    const decision = await inspectClientIp(clientIp);
    if (decision.blocked) return denyBlockedIp(req, res);
    return next();
  } catch (err) {
    log('warn', 'ip_filter_lookup_failed', { ip: clientIp, error: err.message });
    rememberIp(clientIp, { blocked: false, reason: 'lookup_error' });
    return next();
  }
});
app.use((req, res, next) => {
  const startedAt = Date.now();
  const ip = req.clientIp || extractClientIp(req);
  res.on('finish', () => {
    if (req.originalUrl.startsWith('/api/me')) return;
    log('info', 'http_request', {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      ms: Date.now() - startedAt,
      ip,
    });
  });
  next();
});
app.use('/assets', express.static(path.join(ROOT_DIR, 'assets')));
app.use('/avatars', express.static(AVATARS_DIR));
app.use('/files', express.static(FILES_DIR));
app.use(express.static(path.join(ROOT_DIR, 'public')));

// Explicit admin page route so it does not fall through to 404.
app.get(['/admin', '/admin/'], (_, res) =>
  res.sendFile(path.join(ROOT_DIR, 'public', 'admin.html')),
);
app.get(['/privacy', '/privacy/', '/privacy-policy', '/privacy-policy/'], (_, res) =>
  res.sendFile(path.join(ROOT_DIR, 'public', 'privacy.html')),
);
app.get(
  ['/terms', '/terms/', '/terms-of-service', '/terms-of-service/', '/user-agreement', '/user-agreement/'],
  (_, res) => res.sendFile(path.join(ROOT_DIR, 'public', 'terms.html')),
);

app.get('/api/health', (_, res) => res.json({ ok: true }));

// Auth middleware to guard private routes.
const auth = async (req, res, next) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    log('warn', 'auth_missing_token');
    return res.status(401).json({ error: '\u041e\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u0435\u0442 \u0442\u043e\u043a\u0435\u043d' });
  }
  try {
    const token = header.replace('Bearer ', '');
    const payload = jwt.verify(token, JWT_SECRET);
    const users = await loadUsers();
    const me = users.find((u) => u.id === payload.id);
    if (!me) {
      log('warn', 'auth_user_not_found');
      return res.status(401).json({ error: '\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d' });
    }
    if (me.blocked) {
      log('warn', 'auth_user_blocked', { userId: me.id });
      return res.status(403).json({ error: '\u0414\u043e\u0441\u0442\u0443\u043f \u0437\u0430\u0431\u043b\u043e\u043a\u0438\u0440\u043e\u0432\u0430\u043d. \u041e\u0431\u0440\u0430\u0442\u0438\u0442\u0435\u0441\u044c \u0432 \u043f\u043e\u0434\u0434\u0435\u0440\u0436\u043a\u0443: supromteam@ya.ru' });
    }
    req.user = me;
    req.users = users;
    log('debug', 'auth_ok', { userId: me.id });
    return next();
  } catch (err) {
    log('warn', 'auth_error', { error: err.message });
    return res.status(401).json({ error: '\u041d\u0435\u0432\u0435\u0440\u043d\u044b\u0439 \u0442\u043e\u043a\u0435\u043d' });
  }
};

// API routes -----------------------------------------------------------------
registerApiRoutes(app, {
  auth,
  upload,
  fileUpload,
  log,
  loadUsers,
  loadMessages,
  loadGroups,
  loadChannels,
  loadReports,
  saveUsers,
  saveMessages,
  saveReports,
  removeFileIfExists,
  sanitizeUser,
  sanitizeUserForViewer,
  normalizeUsername,
  isDisplayNameAllowed,
  isUsernameAllowed,
  HELP_ORIG_USERNAME,
  liveSockets,
  JWT_SECRET,
  jwt,
  bcrypt,
  uuid,
  isUnsafePassword,
});
// HTTP 404 fallback for API + static.
app.use((req, res) => {
  res.status(404).sendFile(
    path.join(ROOT_DIR, 'public', '404.html')
  );
});

// WebSocket chat -------------------------------------------------------------
const server = app.listen(PORT, () => {
  const address = server.address();
  const listeningPort =
    address && typeof address === 'object' ? address.port : PORT;
  log('info', 'server_started', { port: listeningPort });
});

const wss = new WebSocketServer({ server });
const broadcastTo = (userIds, payload) => {
  const message = JSON.stringify(payload);
  userIds.forEach((id) => {
    const ws = liveSockets.get(id);
    if (!ws) return;
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
      return;
    }
    liveSockets.delete(id);
  });
};

const setPresence = async (userId, online) => {
  const users = await loadUsers();
  const user = users.find((u) => u.id === userId);
  if (!user) return;
  const now = new Date().toISOString();
  user.online = online;
  user.lastSeen = now;
  await saveUsers(users);
  log('info', 'presence', { userId, online });
  broadcastTo(
    Array.from(liveSockets.keys()),
    { type: 'presence', userId, online, lastSeen: user.lastSeen },
  );
};

wss.on('connection', async (ws, req) => {
  const clientIp = extractClientIp(req);
  if (clientIp) {
    try {
      await ipFilterStateReady;
      const decision = await inspectClientIp(clientIp);
      if (decision.blocked) {
        ws.close(4403, 'IP blocked');
        return;
      }
    } catch (err) {
      log('warn', 'ip_filter_lookup_failed', { ip: clientIp, error: err.message });
      rememberIp(clientIp, { blocked: false, reason: 'lookup_error' });
    }
  }

  // Simple token handshake via query string.
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get('token');
  if (!token) {
    log('warn', 'ws_missing_token');
    return ws.close(
      4000,
      '\u041e\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u0435\u0442 \u0442\u043e\u043a\u0435\u043d',
    );
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const users = await loadUsers();
    const me = users.find((u) => u.id === payload.id);
    if (!me || me.blocked) {
      log('warn', 'ws_user_missing_or_blocked', { userId: payload.id });
      return ws.close(
        4001,
        '\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c \u043e\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u0435\u0442 \u0438\u043b\u0438 \u0437\u0430\u0431\u043b\u043e\u043a\u0438\u0440\u043e\u0432\u0430\u043d',
      );
    }
    liveSockets.set(me.id, ws);
    await setPresence(me.id, true);
    ws.send(JSON.stringify({ type: 'hello', user: sanitizeUser(me) }));
    log('info', 'ws_connected', { userId: me.id });

    ws.on('message', async (raw) => {
      let packet;
      try {
        packet = JSON.parse(raw.toString());
      } catch (err) {
        log('warn', 'ws_bad_packet', { error: err.message });
        return;
      }

      if (packet.type === 'message') {
        const { to, text, scope } = packet;
        if (!to || !text) return;
        const trimmed = String(text).trim();
        if (!trimmed) return;
        const users = await loadUsers();
        const current = users.find((u) => u.id === me.id);
        if (current && current.mutedUntil && Date.now() < current.mutedUntil) {
          ws.send(
            JSON.stringify({
              type: 'error',
              error: 'muted',
              mutedUntil: current.mutedUntil,
            }),
          );
          log('warn', 'muted_message_blocked', {
            userId: me.id,
            mutedUntil: current.mutedUntil,
          });
          return;
        }
        const messages = await loadMessages();
        if (scope === 'channel') {
          const channels = await loadChannels();
          const channel = channels.find((c) => c.id === to);
          if (!channel) return;
          const chatId = `channel:${channel.id}`;
          const newMsg = {
            id: uuid(),
            chatId,
            from: me.id,
            to,
            text: trimmed,
            createdAt: new Date().toISOString(),
            scope: 'channel',
          };
          messages.push(newMsg);
          await saveMessages(messages);
          broadcastTo(Array.from(liveSockets.keys()), {
            type: 'message',
            message: newMsg,
          });
          log('info', 'ws_message', {
            from: me.id,
            to,
            scope: 'channel',
            length: trimmed.length,
          });
        } else {
          if (scope && scope !== 'dm') return;
          const target = users.find((u) => u.id === to);
          if (!target) return;
          if (
            target.privacy &&
            target.privacy.allowDms === false &&
            target.username !== HELP_ORIG_USERNAME
          ) {
            ws.send(
              JSON.stringify({
                type: 'error',
                error: 'dm_disabled',
                userId: target.id,
              }),
            );
            return;
          }
          const chatId = chatIdFor(me.id, to);
          const newMsg = {
            id: uuid(),
            chatId,
            from: me.id,
            to,
            text: trimmed,
            createdAt: new Date().toISOString(),
          };
          messages.push(newMsg);
          await saveMessages(messages);
          broadcastTo([me.id, to], { type: 'message', message: newMsg });
          log('info', 'ws_message', { from: me.id, to, length: trimmed.length });
          if (target.username === HELP_ORIG_USERNAME && me.id !== target.id) {
            const replyMsg = {
              id: uuid(),
              chatId,
              from: target.id,
              to: me.id,
              text: HELP_ORIG_AUTO_REPLY,
              createdAt: new Date().toISOString(),
            };
            messages.push(replyMsg);
            await saveMessages(messages);
            broadcastTo([me.id, target.id], { type: 'message', message: replyMsg });
            log('info', 'ws_message', {
              from: target.id,
              to: me.id,
              length: HELP_ORIG_AUTO_REPLY.length,
            });
          }
        }
      }

      if (packet.type === 'typing') {
        const { to, isTyping } = packet;
        if (!to) return;
        log('debug', 'ws_typing', { from: me.id, to, isTyping: !!isTyping });
        broadcastTo([to], { type: 'typing', from: me.id, isTyping: !!isTyping });
      }
    });

    ws.on('close', async () => {
      if (liveSockets.get(me.id) === ws) {
        liveSockets.delete(me.id);
        await setPresence(me.id, false);
      }
      log('info', 'ws_disconnected', { userId: me.id });
    });
  } catch (err) {
    log('warn', 'ws_auth_error', { error: err.message });
    ws.close(
      4002,
      '\u041d\u0435\u0432\u0435\u0440\u043d\u044b\u0439 \u0442\u043e\u043a\u0435\u043d',
    );
  }
});

// Graceful shutdown so data is flushed.
const shutdown = async () => {
  log('info', 'server_shutting_down');
  if (persistIpStateTimer) {
    clearTimeout(persistIpStateTimer);
    persistIpStateTimer = null;
  }
  try {
    await persistIpFilterStateNow();
  } catch (err) {
    log('warn', 'ip_filter_state_save_failed', { error: err.message });
  }
  wss.clients.forEach((client) => client.close(1001, 'Server closing'));
  server.close(() => process.exit(0));
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
