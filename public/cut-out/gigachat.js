// MIT License

// Copyright (c) 2026 SupromTeam

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

// Cut-out GigaChat integration removed from src/server/index.js.
// Dependencies: https, uuid, log().

const GIGACHAT_ENABLED = process.env.GIGACHAT_ENABLED === 'true';
const GIGACHAT_AUTH_KEY = process.env.GIGACHAT_AUTH_KEY || '';
const GIGACHAT_MODEL = process.env.GIGACHAT_MODEL || 'GigaChat';
const GIGACHAT_SCOPE = process.env.GIGACHAT_SCOPE || 'GIGACHAT_API_PERS';
const GIGACHAT_USER_ID = process.env.GIGACHAT_USER_ID || 'gigachat';
const GIGACHAT_TOKEN_URL =
  process.env.GIGACHAT_TOKEN_URL ||
  'https://ngw.devices.sberbank.ru:9443/api/v2/oauth';
const GIGACHAT_CHAT_URL =
  process.env.GIGACHAT_CHAT_URL ||
  'https://gigachat.devices.sberbank.ru/api/v1/chat/completions';

const getGigaChatUser = () => ({
  id: GIGACHAT_USER_ID,
  nickname: 'GigaChat',
  username: GIGACHAT_USER_ID,
  avatar: '/assets/favicon.ico',
  blocked: false,
  isAdmin: false,
  online: true,
  lastSeen: new Date().toISOString(),
});

const isReservedUsername = (username) =>
  typeof username === 'string' &&
  username.toLowerCase() === GIGACHAT_USER_ID.toLowerCase();

let gigachatToken = null;
let gigachatTokenExpiresAt = 0;

const requestJson = (url, { method = 'GET', headers = {}, body = '' } = {}) =>
  new Promise((resolve, reject) => {
    const req = https.request(url, { method, headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        let payload = {};
        if (data) {
          try {
            payload = JSON.parse(data);
          } catch (err) {
            return reject(new Error(`Bad JSON from ${url}`));
          }
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const message =
            payload.error_description || payload.error || `HTTP ${res.statusCode}`;
          const error = new Error(message);
          error.statusCode = res.statusCode;
          error.payload = payload;
          return reject(error);
        }
        return resolve(payload);
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });

const getGigaChatToken = async () => {
  if (!GIGACHAT_ENABLED) return null;
  if (!GIGACHAT_AUTH_KEY) {
    log('warn', 'gigachat_missing_auth_key');
    return null;
  }
  if (gigachatToken && Date.now() < gigachatTokenExpiresAt - 60 * 1000) {
    return gigachatToken;
  }
  log('info', 'gigachat_token_request');
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    scope: GIGACHAT_SCOPE,
  }).toString();
  const payload = await requestJson(GIGACHAT_TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${GIGACHAT_AUTH_KEY}`,
      RqUID: uuid(),
    },
    body,
  });
  const token = payload.access_token;
  const expiresRaw = payload.expires_at || payload.expiresAt;
  let expiresAt = 0;
  if (expiresRaw) {
    const val = Number(expiresRaw);
    if (!Number.isNaN(val)) {
      expiresAt = val > 1e12 ? val : val * 1000;
    }
  }
  if (!expiresAt && payload.expires_in) {
    expiresAt = Date.now() + Number(payload.expires_in) * 1000;
  }
  if (!expiresAt) {
    expiresAt = Date.now() + 25 * 60 * 1000;
  }
  gigachatToken = token;
  gigachatTokenExpiresAt = expiresAt;
  log('info', 'gigachat_token_received', { expiresAt });
  return token;
};

const sendToGigaChat = async (text) => {
  if (!GIGACHAT_ENABLED) return null;
  const token = await getGigaChatToken();
  if (!token) return null;
  log('info', 'gigachat_request', { model: GIGACHAT_MODEL });
  const body = JSON.stringify({
    model: GIGACHAT_MODEL,
    messages: [{ role: 'user', content: text }],
    stream: false,
  });
  try {
    const payload = await requestJson(GIGACHAT_CHAT_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body,
    });
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content === 'string' && content.trim()) {
      log('info', 'gigachat_response', { length: content.trim().length });
      return content.trim();
    }
    log('warn', 'gigachat_empty_response');
    return null;
  } catch (err) {
    log('error', 'gigachat_request_failed', { error: err.message });
    return null;
  }
};

// LOG_MESSAGES entries:
// {
//   gigachat_missing_auth_key: '\u0047\u0069\u0067\u0061\u0043\u0068\u0061\u0074\u003a \u043e\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u0435\u0442 \u043a\u043b\u044e\u0447 \u0430\u0432\u0442\u043e\u0440\u0438\u0437\u0430\u0446\u0438\u0438',
//   gigachat_token_request: '\u0047\u0069\u0067\u0061\u0043\u0068\u0061\u0074\u003a \u0437\u0430\u043f\u0440\u043e\u0441 \u0442\u043e\u043a\u0435\u043d\u0430',
//   gigachat_token_received: '\u0047\u0069\u0067\u0061\u0043\u0068\u0061\u0074\u003a \u0442\u043e\u043a\u0435\u043d \u043f\u043e\u043b\u0443\u0447\u0435\u043d',
//   gigachat_request: '\u0047\u0069\u0067\u0061\u0043\u0068\u0061\u0074\u003a \u0437\u0430\u043f\u0440\u043e\u0441 \u043a \u043c\u043e\u0434\u0435\u043b\u0438',
//   gigachat_response: '\u0047\u0069\u0067\u0061\u0043\u0068\u0061\u0074\u003a \u043e\u0442\u0432\u0435\u0442 \u043f\u043e\u043b\u0443\u0447\u0435\u043d',
//   gigachat_empty_response: '\u0047\u0069\u0067\u0061\u0043\u0068\u0061\u0074\u003a \u043f\u0443\u0441\u0442\u043e\u0439 \u043e\u0442\u0432\u0435\u0442',
//   gigachat_request_failed: '\u0047\u0069\u0067\u0061\u0043\u0068\u0061\u0074\u003a \u043e\u0448\u0438\u0431\u043a\u0430 \u0437\u0430\u043f\u0440\u043e\u0441\u0430',
// }

// /api/me addition:
// if (GIGACHAT_ENABLED && !cleanUsers.some((u) => u.id === GIGACHAT_USER_ID)) {
//   cleanUsers.push(getGigaChatUser());
// }

// Registration/profile guards:
// if (isReservedUsername(cleanUsername)) {
//   return res.status(409).json({ error: '\u042d\u0442\u043e \u0438\u043c\u044f \u0437\u0430\u0440\u0435\u0437\u0435\u0440\u0432\u0438\u0440\u043e\u0432\u0430\u043d\u043e' });
// }

// WS DM handling (bot reply):
// if (to === GIGACHAT_USER_ID) {
//   const response = await sendToGigaChat(trimmed);
//   if (response) {
//     const botMsg = {
//       id: uuid(),
//       chatId,
//       from: GIGACHAT_USER_ID,
//       to: me.id,
//       text: response,
//       createdAt: new Date().toISOString(),
//     };
//     messages.push(botMsg);
//     await saveMessages(messages);
//     broadcastTo([me.id], { type: 'message', message: botMsg });
//   }
// }
