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

const sanitizeUser = (user) => {
  if (!user) return null;
  const { passwordHash, email, contacts, ...rest } = user;
  return rest;
};

const sanitizeUserForViewer = (user, viewerId) => {
  if (!user) return null;
  const safe = sanitizeUser(user);
  if (viewerId && user.id === viewerId) return safe;
  const privacy = safe.privacy || {};
  if (privacy.showOnline === false) safe.online = false;
  if (privacy.showLastSeen === false) safe.lastSeen = null;
  return safe;
};

const chatIdFor = (a, b) => [a, b].sort().join(':');

const normalizeUsername = (value) =>
  typeof value === 'string' ? value.trim().replace(/^@/, '') : '';

const isDisplayNameAllowed = (nickname) =>
  typeof nickname === 'string' &&
  /^(?=.{2,32}$)[\p{L}\p{N} _.-]+$/u.test(nickname);

const isUsernameAllowed = (username) =>
  typeof username === 'string' && /^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(username);

module.exports = {
  sanitizeUser,
  sanitizeUserForViewer,
  chatIdFor,
  normalizeUsername,
  isDisplayNameAllowed,
  isUsernameAllowed,
};
