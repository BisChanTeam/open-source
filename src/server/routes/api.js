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

const registerApiRoutes = (app, deps) => {
  const {
    auth,
    upload,
    fileUpload = upload,
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
    isUnsafePassword = async () => false,
  } = deps;
const UNSAFE_PASSWORD_ERROR =
  '\u042d\u0442\u043e\u0442 \u043f\u0430\u0440\u043e\u043b\u044c \u043d\u0430\u0439\u0434\u0435\u043d \u0432 \u0441\u043f\u0438\u0441\u043a\u0435 \u043d\u0435\u0431\u0435\u0437\u043e\u043f\u0430\u0441\u043d\u044b\u0445. \u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u0434\u0440\u0443\u0433\u043e\u0439.';

const ensureSecretChats = (user) => {
  if (!user) return [];
  user.secretChats = Array.isArray(user.secretChats) ? user.secretChats : [];
  return user.secretChats;
};

const findTargetUser = (users, { userId, username }) => {
  if (userId) return users.find((u) => u.id === userId);
  const cleanUsername = normalizeUsername(username);
  return users.find(
    (u) => u.username && u.username.toLowerCase() === cleanUsername.toLowerCase(),
  );
};
const FILE_UPLOAD_LIMIT_BYTES = 20 * 1024 * 1024;
const runSingleUpload = (uploader, fieldName, req, res) =>
  new Promise((resolve, reject) => {
    uploader.single(fieldName)(req, res, (err) => {
      if (err) return reject(err);
      return resolve();
    });
  });

app.post('/api/register', async (req, res) => {
  const { nickname, username, password } = req.body || {};
  if (!nickname || !username || !password) {
    return res
      .status(400)
      .json({
        error:
          '\u0418\u043c\u044f, \u0438\u043c\u044f \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044f \u0438 \u043f\u0430\u0440\u043e\u043b\u044c \u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u044b',
      });
  }
  if (!isDisplayNameAllowed(nickname)) {
    return res.status(400).json({
      error: '\u0418\u043c\u044f: \u043e\u0442 2 \u0434\u043e 32 \u0441\u0438\u043c\u0432\u043e\u043b\u043e\u0432, \u0431\u0443\u043a\u0432\u044b/\u0446\u0438\u0444\u0440\u044b/\u043f\u0440\u043e\u0431\u0435\u043b\u044b \u0438 ._-',
    });
  }
  const cleanUsername = normalizeUsername(username);
  if (!isUsernameAllowed(cleanUsername)) {
    return res.status(400).json({
      error:
        '\u0418\u043c\u044f \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044f: \u0441 \u0431\u0443\u043a\u0432\u044b, 5-32 \u0441\u0438\u043c\u0432\u043e\u043b\u0430, \u0442\u043e\u043b\u044c\u043a\u043e \u043b\u0430\u0442\u0438\u043d\u0438\u0446\u0430/\u0446\u0438\u0444\u0440\u044b/\u043f\u043e\u0434\u0447\u0435\u0440\u043a\u0438\u0432\u0430\u043d\u0438\u0435',
    });
  }
  const users = await loadUsers();
  const existingUsername = users.find(
    (u) => u.username && u.username.toLowerCase() === cleanUsername.toLowerCase(),
  );
  if (existingUsername) {
    return res
      .status(409)
      .json({ error: '\u0418\u043c\u044f \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044f \u0443\u0436\u0435 \u0437\u0430\u043d\u044f\u0442\u043e, \u0432\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u0434\u0440\u0443\u0433\u043e\u0435' });
  }
  if (await isUnsafePassword(password)) {
    return res.status(400).json({ error: UNSAFE_PASSWORD_ERROR });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const newUser = {
    id: uuid(),
    nickname,
    username: cleanUsername,
    passwordHash,
    avatar: '',
    blocked: false,
    mutedUntil: null,
    isAdmin: users.length === 0 || cleanUsername.toLowerCase() === 'admin',
    online: false,
    lastSeen: null,
    contacts: [],
    privacy: {
      showOnline: true,
      showLastSeen: true,
      allowDms: true,
    },
    secretChats: [],
    readByChat: {},
  };
  users.push(newUser);
  await saveUsers(users);
  const token = jwt.sign({ id: newUser.id }, JWT_SECRET, { expiresIn: '30d' });
  log('info', 'user_register', { nickname, userId: newUser.id });
  return res.json({ token, user: sanitizeUser(newUser) });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res
      .status(400)
      .json({
        error:
          '\u0418\u043c\u044f \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044f \u0438 \u043f\u0430\u0440\u043e\u043b\u044c \u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u044b',
      });
  }
  const cleanUsername = normalizeUsername(username);
  const users = await loadUsers();
  const user = users.find(
    (u) => u.username && u.username.toLowerCase() === cleanUsername.toLowerCase(),
  );
  if (!user) return res.status(404).json({ error: '\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d' });
  if (user.blocked) {
    return res.status(403).json({
      error:
        '\u0410\u043a\u043a\u0430\u0443\u043d\u0442 \u0437\u0430\u0431\u043b\u043e\u043a\u0438\u0440\u043e\u0432\u0430\u043d. \u0415\u0441\u043b\u0438 \u0441\u0447\u0438\u0442\u0430\u0435\u0442\u0435, \u0447\u0442\u043e \u044d\u0442\u043e \u043e\u0448\u0438\u0431\u043a\u0430, \u043e\u0431\u0440\u0430\u0442\u0438\u0442\u0435\u0441\u044c \u0432 \u043f\u043e\u0434\u0434\u0435\u0440\u0436\u043a\u0443: supromteam@ya.ru',
    });
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: '\u041d\u0435\u0432\u0435\u0440\u043d\u044b\u0439 \u043f\u0430\u0440\u043e\u043b\u044c' });
  const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '30d' });
  log('info', 'user_login', { userId: user.id, nickname: user.nickname });
  return res.json({ token, user: sanitizeUser(user) });
});

app.get('/api/me', auth, async (req, res) => {
  const users = req.users || (await loadUsers());
  const messages = await loadMessages();
  const groups = await loadGroups();
  const channels = await loadChannels();
  const channelIds = new Set(channels.map((c) => c.id));
  const isChannelMessage = (message) =>
    message.scope === 'channel' ||
    String(message.chatId || '').startsWith('channel:');
  const channelIdFromMessage = (message) => {
    if (String(message.chatId || '').startsWith('channel:')) {
      return String(message.chatId || '').split(':')[1];
    }
    return message.to;
  };
  const visibleMessages = messages.filter((m) => {
    if (isChannelMessage(m)) {
      const channelId = channelIdFromMessage(m);
      return channelIds.has(channelId);
    }
    return m.from === req.user.id || m.to === req.user.id;
  });
  const secretChats = [];
  const secretPeerIds = new Set();
  const seenSecretChatIds = new Set();
  ensureSecretChats(req.user).forEach((chat) => {
    if (!chat || typeof chat.id !== 'string' || !chat.id.startsWith('secret:')) {
      return;
    }
    if (!chat.peerId || chat.peerId === req.user.id) return;
    if (seenSecretChatIds.has(chat.id)) return;
    const peer = users.find((u) => u.id === chat.peerId);
    if (!peer || peer.blocked) return;
    seenSecretChatIds.add(chat.id);
    secretPeerIds.add(peer.id);
    secretChats.push({
      id: chat.id,
      peerId: peer.id,
      createdAt: chat.createdAt || null,
    });
  });
  const directPeers = new Set([req.user.id]);
  const contactIds = Array.isArray(req.user.contacts) ? req.user.contacts : [];
  contactIds.forEach((id) => directPeers.add(id));
  secretPeerIds.forEach((id) => directPeers.add(id));
  visibleMessages.forEach((message) => {
    if (isChannelMessage(message)) return;
    if (message.from === req.user.id) directPeers.add(message.to);
    if (message.to === req.user.id) directPeers.add(message.from);
  });
  const cleanUsers = users
    .filter((u) => !u.blocked && directPeers.has(u.id))
    .map((u) => sanitizeUserForViewer(u, req.user.id));

  // Special response for the dedicated help account.
  if (req.user.username === HELP_ORIG_USERNAME) {
    const helpMessage = {
      message:
        '\u0414\u043e\u0431\u0440\u043e \u043f\u043e\u0436\u0430\u043b\u043e\u0432\u0430\u0442\u044c \u0432 \u0441\u043b\u0443\u0436\u0431\u0443 \u043f\u043e\u0434\u0434\u0435\u0440\u0436\u043a\u0438 \u0411\u0438\u0441\u0427\u0430\u043d! \u041c\u044b \u0437\u0434\u0435\u0441\u044c, \u0447\u0442\u043e\u0431\u044b \u043f\u043e\u043c\u043e\u0447\u044c \u0432\u0430\u043c \u0441 \u043b\u044e\u0431\u044b\u043c\u0438 \u0432\u043e\u043f\u0440\u043e\u0441\u0430\u043c\u0438 \u0438\u043b\u0438 \u043f\u0440\u043e\u0431\u043b\u0435\u043c\u0430\u043c\u0438. \u041f\u043e\u0436\u0430\u043b\u0443\u0439\u0441\u0442\u0430, \u043e\u043f\u0438\u0448\u0438\u0442\u0435 \u0432\u0430\u0448\u0443 \u043f\u0440\u043e\u0431\u043b\u0435\u043c\u0443, \u0438 \u043c\u044b \u043f\u043e\u0441\u0442\u0430\u0440\u0430\u0435\u043c\u0441\u044f \u043f\u043e\u043c\u043e\u0447\u044c \u043a\u0430\u043a \u043c\u043e\u0436\u043d\u043e \u0441\u043a\u043e\u0440\u0435\u0435.',
    };
    log('info', 'api_me_help', { userId: req.user.id });
    return res.json(helpMessage);
  }
  return res.json({
    user: sanitizeUser(req.user),
    users: cleanUsers,
    messages: visibleMessages,
    readByChat: req.user.readByChat || {},
    secretChats,
    groups,
    channels,
  });
});

app.get('/api/users/find', auth, async (req, res) => {
  const query = normalizeUsername(req.query.username);
  if (!query) {
    return res.status(400).json({ error: '\u041d\u0443\u0436\u0435\u043d username' });
  }
  if (!isUsernameAllowed(query)) {
    return res.status(400).json({
      error:
        '\u0418\u043c\u044f \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044f: \u0441 \u0431\u0443\u043a\u0432\u044b, 5-32 \u0441\u0438\u043c\u0432\u043e\u043b\u0430, \u0442\u043e\u043b\u044c\u043a\u043e \u043b\u0430\u0442\u0438\u043d\u0438\u0446\u0430/\u0446\u0438\u0444\u0440\u044b/\u043f\u043e\u0434\u0447\u0435\u0440\u043a\u0438\u0432\u0430\u043d\u0438\u0435',
    });
  }
  const users = req.users || (await loadUsers());
  const target = users.find(
    (u) => u.username && u.username.toLowerCase() === query.toLowerCase(),
  );
  if (!target || target.blocked) {
    return res.status(404).json({ error: '\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d' });
  }
  return res.json({ user: sanitizeUserForViewer(target, req.user.id) });
});

app.post('/api/dm/start', auth, async (req, res) => {
  const { userId, username } = req.body || {};
  if (!userId && !username) {
    return res.status(400).json({ error: '\u041d\u0443\u0436\u0435\u043d userId \u0438\u043b\u0438 username' });
  }
  const users = req.users || (await loadUsers());
  const current = users.find((u) => u.id === req.user.id);
  if (!current) {
    return res.status(404).json({ error: '\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d' });
  }
  const target = findTargetUser(users, { userId, username });
  if (!target || target.blocked) {
    return res.status(404).json({ error: '\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d' });
  }
  if (target.id === current.id) {
    return res.status(400).json({ error: '\u041d\u0435\u043b\u044c\u0437\u044f \u043f\u0438\u0441\u0430\u0442\u044c \u0441\u0430\u043c\u043e\u043c\u0443 \u0441\u0435\u0431\u0435' });
  }
  current.contacts = Array.isArray(current.contacts) ? current.contacts : [];
  if (!current.contacts.includes(target.id)) {
    current.contacts.push(target.id);
    await saveUsers(users);
  }
  return res.json({ user: sanitizeUserForViewer(target, req.user.id) });
});

app.post('/api/secret/start', auth, async (req, res) => {
  const { userId, username } = req.body || {};
  if (!userId && !username) {
    return res.status(400).json({ error: '\u041d\u0443\u0436\u0435\u043d userId \u0438\u043b\u0438 username' });
  }
  const users = req.users || (await loadUsers());
  const current = users.find((u) => u.id === req.user.id);
  if (!current) {
    return res.status(404).json({ error: '\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d' });
  }
  const target = findTargetUser(users, { userId, username });
  if (!target || target.blocked) {
    return res.status(404).json({ error: '\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d' });
  }
  if (target.id === current.id) {
    return res.status(400).json({ error: '\u041d\u0435\u043b\u044c\u0437\u044f \u043f\u0438\u0441\u0430\u0442\u044c \u0441\u0430\u043c\u043e\u043c\u0443 \u0441\u0435\u0431\u0435' });
  }
  if (
    target.privacy &&
    target.privacy.allowDms === false &&
    target.username !== HELP_ORIG_USERNAME
  ) {
    return res.status(403).json({ error: 'dm_disabled' });
  }
  const currentSecretChats = ensureSecretChats(current);
  const targetSecretChats = ensureSecretChats(target);
  const existing = currentSecretChats.find((chat) => chat.peerId === target.id);
  if (existing) {
    const mirrorExists = targetSecretChats.some((chat) => chat.id === existing.id);
    if (!mirrorExists) {
      targetSecretChats.push({
        id: existing.id,
        peerId: current.id,
        createdAt: existing.createdAt || new Date().toISOString(),
      });
      await saveUsers(users);
    }
    return res.json({
      secretChat: {
        id: existing.id,
        peerId: target.id,
        createdAt: existing.createdAt || null,
      },
      user: sanitizeUserForViewer(target, req.user.id),
    });
  }
  const createdAt = new Date().toISOString();
  const chatId = `secret:${uuid()}`;
  currentSecretChats.push({
    id: chatId,
    peerId: target.id,
    createdAt,
  });
  targetSecretChats.push({
    id: chatId,
    peerId: current.id,
    createdAt,
  });
  await saveUsers(users);
  return res.json({
    secretChat: {
      id: chatId,
      peerId: target.id,
      createdAt,
    },
    user: sanitizeUserForViewer(target, req.user.id),
  });
});

app.post('/api/avatar', auth, upload.single('avatar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '\u0424\u0430\u0439\u043b \u043d\u0435 \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043d' });
  const users = req.users || (await loadUsers());
  const idx = users.findIndex((u) => u.id === req.user.id);
  if (idx === -1) {
    await removeFileIfExists(req.file.path);
    return res.status(404).json({ error: '\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d' });
  }
  users[idx].avatar = `https://userphoto.ru/avatars/${req.file.filename}`;
  await saveUsers(users);
  log('info', 'avatar_updated', { userId: users[idx].id });
  return res.json({ avatar: users[idx].avatar });
});

app.post('/api/files', auth, async (req, res) => {
  try {
    await runSingleUpload(fileUpload, 'file', req, res);
  } catch (err) {
    if (err && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: 'File is too large. Maximum size: 20 MB.',
      });
    }
    return res.status(400).json({
      error: err?.message || 'File upload failed.',
    });
  }
  if (!req.file) return res.status(400).json({ error: 'File not uploaded.' });
  const uploaded = {
    url: `https://userphoto.ru/files/${req.file.filename}`,
    name: req.file.originalname || req.file.filename,
    size: req.file.size || 0,
    mimeType: req.file.mimetype || 'application/octet-stream',
    uploadedAt: new Date().toISOString(),
  };
  log('info', 'file_uploaded', {
    userId: req.user.id,
    fileName: uploaded.name,
    size: uploaded.size,
    mimeType: uploaded.mimeType,
  });
  return res.json({ file: uploaded, maxSizeBytes: FILE_UPLOAD_LIMIT_BYTES });
});

app.patch('/api/account/profile', auth, async (req, res) => {
  const { nickname, username } = req.body || {};
  if (!nickname || !username) {
    return res.status(400).json({ error: '\u0418\u043c\u044f \u0438 \u0438\u043c\u044f \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044f \u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u044b' });
  }
  if (!isDisplayNameAllowed(nickname)) {
    return res.status(400).json({
      error: '\u0418\u043c\u044f: \u043e\u0442 2 \u0434\u043e 32 \u0441\u0438\u043c\u0432\u043e\u043b\u043e\u0432, \u0431\u0443\u043a\u0432\u044b/\u0446\u0438\u0444\u0440\u044b/\u043f\u0440\u043e\u0431\u0435\u043b\u044b \u0438 ._-',
    });
  }
  const cleanUsername = normalizeUsername(username);
  if (!isUsernameAllowed(cleanUsername)) {
    return res.status(400).json({
      error: '\u0418\u043c\u044f \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044f: \u0441 \u0431\u0443\u043a\u0432\u044b, 5-32 \u0441\u0438\u043c\u0432\u043e\u043b\u0430, \u0442\u043e\u043b\u044c\u043a\u043e \u043b\u0430\u0442\u0438\u043d\u0438\u0446\u0430/\u0446\u0438\u0444\u0440\u044b/\u043f\u043e\u0434\u0447\u0435\u0440\u043a\u0438\u0432\u0430\u043d\u0438\u0435',
    });
  }
  const users = req.users || (await loadUsers());
  const taken = users.find(
    (u) =>
      u.id !== req.user.id &&
      u.username &&
      u.username.toLowerCase() === cleanUsername.toLowerCase(),
  );
  if (taken) {
    return res.status(409).json({ error: '\u0418\u043c\u044f \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044f \u0443\u0436\u0435 \u0437\u0430\u043d\u044f\u0442\u043e' });
  }
  const idx = users.findIndex((u) => u.id === req.user.id);
  if (idx === -1) {
    return res.status(404).json({ error: '\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d' });
  }
  users[idx].nickname = nickname;
  users[idx].username = cleanUsername;
  await saveUsers(users);
  log('info', 'profile_updated', { userId: users[idx].id });
  return res.json({ user: sanitizeUser(users[idx]) });
});

app.patch('/api/account/privacy', auth, async (req, res) => {
  const { showOnline, showLastSeen, allowDms } = req.body || {};
  if (
    typeof showOnline !== 'boolean' &&
    typeof showLastSeen !== 'boolean' &&
    typeof allowDms !== 'boolean'
  ) {
    return res.status(400).json({
      error:
        '\u041d\u0443\u0436\u0435\u043d \u043a\u043e\u043c\u0431\u043e: showOnline/showLastSeen/allowDms',
    });
  }
  const users = req.users || (await loadUsers());
  const idx = users.findIndex((u) => u.id === req.user.id);
  if (idx === -1) {
    return res.status(404).json({ error: '\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d' });
  }
  const nextPrivacy = {
    showOnline: true,
    showLastSeen: true,
    allowDms: true,
    ...(users[idx].privacy || {}),
  };
  if (typeof showOnline === 'boolean') nextPrivacy.showOnline = showOnline;
  if (typeof showLastSeen === 'boolean') nextPrivacy.showLastSeen = showLastSeen;
  if (typeof allowDms === 'boolean') nextPrivacy.allowDms = allowDms;
  users[idx].privacy = nextPrivacy;
  await saveUsers(users);
  log('info', 'privacy_updated', { userId: users[idx].id });
  return res.json({ privacy: nextPrivacy });
});

app.patch('/api/account/password', auth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: '\u0422\u0435\u043a\u0443\u0449\u0438\u0439 \u0438 \u043d\u043e\u0432\u044b\u0439 \u043f\u0430\u0440\u043e\u043b\u044c \u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u044b' });
  }
  if (await isUnsafePassword(newPassword)) {
    return res.status(400).json({ error: UNSAFE_PASSWORD_ERROR });
  }
  const users = req.users || (await loadUsers());
  const idx = users.findIndex((u) => u.id === req.user.id);
  if (idx === -1) {
    return res.status(404).json({ error: '\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d' });
  }
  const ok = await bcrypt.compare(currentPassword, users[idx].passwordHash);
  if (!ok) return res.status(401).json({ error: '\u041d\u0435\u0432\u0435\u0440\u043d\u044b\u0439 \u043f\u0430\u0440\u043e\u043b\u044c' });
  users[idx].passwordHash = await bcrypt.hash(newPassword, 10);
  await saveUsers(users);
  log('info', 'password_updated', { userId: users[idx].id });
  return res.json({ ok: true });
});

app.delete('/api/account', auth, async (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: '\u041f\u0430\u0440\u043e\u043b\u044c \u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u0435\u043d' });
  const users = req.users || (await loadUsers());
  const idx = users.findIndex((u) => u.id === req.user.id);
  if (idx === -1) {
    return res.status(404).json({ error: '\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d' });
  }
  const ok = await bcrypt.compare(password, users[idx].passwordHash);
  if (!ok) return res.status(401).json({ error: '\u041d\u0435\u0432\u0435\u0440\u043d\u044b\u0439 \u043f\u0430\u0440\u043e\u043b\u044c' });
  const nextUsers = users
    .filter((u) => u.id !== req.user.id)
    .map((u) => {
      if (!Array.isArray(u.secretChats)) return u;
      u.secretChats = u.secretChats.filter((chat) => chat.peerId !== req.user.id);
      return u;
    });
  await saveUsers(nextUsers);
  const messages = await loadMessages();
  const nextMessages = messages.filter(
    (m) => m.from !== req.user.id && m.to !== req.user.id,
  );
  await saveMessages(nextMessages);
  const ws = liveSockets.get(req.user.id);
  if (ws)
    ws.close(
      4004,
      '\u0410\u043a\u043a\u0430\u0443\u043d\u0442 \u0443\u0434\u0430\u043b\u0435\u043d',
    );
  log('info', 'account_deleted', { userId: req.user.id });
  return res.json({ ok: true });
});

app.post('/api/read', auth, async (req, res) => {
  const { chatId, lastReadAt } = req.body || {};
  if (!chatId || !lastReadAt) {
    return res.status(400).json({ error: '\u041d\u0443\u0436\u043d\u044b chatId \u0438 lastReadAt' });
  }
  const idValue = String(chatId);
  const users = req.users || (await loadUsers());
  const idx = users.findIndex((u) => u.id === req.user.id);
  if (idx === -1) return res.status(404).json({ error: '\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d' });
  if (idValue.startsWith('channel:')) {
    const channels = await loadChannels();
    const channelId = idValue.split(':')[1];
    const exists = channels.some((channel) => channel.id === channelId);
    if (!exists) {
      return res.status(404).json({ error: '\u041a\u0430\u043d\u0430\u043b \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d' });
    }
  } else if (idValue.startsWith('secret:')) {
    const secretChats = ensureSecretChats(users[idx]);
    const exists = secretChats.some((chat) => chat && chat.id === idValue);
    if (!exists) {
      return res.status(403).json({ error: '\u041d\u0435\u0432\u0435\u0440\u043d\u044b\u0439 chatId' });
    }
  } else {
    const parts = idValue.split(':');
    if (parts.length !== 2 || !parts.includes(req.user.id)) {
      return res.status(403).json({ error: '\u041d\u0435\u0432\u0435\u0440\u043d\u044b\u0439 chatId' });
    }
  }
  const readAt = Number(lastReadAt);
  if (!Number.isFinite(readAt)) {
    return res.status(400).json({ error: '\u041d\u0435\u0432\u0435\u0440\u043d\u044b\u0439 lastReadAt' });
  }
  users[idx].readByChat = users[idx].readByChat || {};
  const prev = Number(users[idx].readByChat[chatId]) || 0;
  users[idx].readByChat[chatId] = Math.max(prev, readAt);
  await saveUsers(users);
  log('info', 'read_state_updated', { userId: req.user.id, chatId });
  return res.json({ ok: true, readByChat: users[idx].readByChat });
});

app.post('/api/report', auth, async (req, res) => {
  const { targetUserId, messageId, reason } = req.body || {};
  const trimmed = String(reason || '').trim();
  if (!targetUserId) {
    return res.status(400).json({ error: '\u041d\u0443\u0436\u0435\u043d targetUserId' });
  }
  if (!trimmed || trimmed.length < 3 || trimmed.length > 500) {
    return res.status(400).json({
      error:
        '\u041e\u043f\u0438\u0448\u0438\u0442\u0435 \u043f\u0440\u0438\u0447\u0438\u043d\u0443 (3-500 \u0441\u0438\u043c\u0432\u043e\u043b\u043e\u0432)',
    });
  }
  if (targetUserId === req.user.id) {
    return res.status(400).json({ error: '\u041d\u0435\u043b\u044c\u0437\u044f \u0436\u0430\u043b\u043e\u0432\u0430\u0442\u044c\u0441\u044f \u043d\u0430 \u0441\u0435\u0431\u044f' });
  }
  const users = req.users || (await loadUsers());
  const target = users.find((u) => u.id === targetUserId);
  if (!target) {
    return res.status(404).json({ error: '\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d' });
  }
  if (messageId) {
    const messages = await loadMessages();
    const exists = messages.some((m) => m.id === messageId);
    if (!exists) {
      return res.status(404).json({ error: '\u0421\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u043e' });
    }
  }
  const reports = await loadReports();
  const report = {
    id: uuid(),
    reporterId: req.user.id,
    targetUserId,
    messageId: messageId || null,
    reason: trimmed,
    createdAt: new Date().toISOString(),
    resolved: false,
  };
  reports.push(report);
  await saveReports(reports);
  log('info', 'report_created', {
    reportId: report.id,
    reporterId: report.reporterId,
    targetUserId,
  });
  return res.json({ ok: true, reportId: report.id });
});

app.get('/api/admin/users', auth, async (req, res) => {
  if (!req.user.isAdmin && req.user.username !== HELP_ORIG_USERNAME) {
    return res.status(403).json({ error: '\u0422\u043e\u043b\u044c\u043a\u043e \u0434\u043b\u044f \u0430\u0434\u043c\u0438\u043d\u043e\u0432' });
  }
  const users = req.users || (await loadUsers());
  log('info', 'admin_users_list', { userId: req.user.id });
  return res.json({ users: users.map(sanitizeUser) });
});

app.post('/api/admin/block', auth, async (req, res) => {
  if (!req.user.isAdmin && req.user.username !== HELP_ORIG_USERNAME) {
    return res.status(403).json({ error: '\u0422\u043e\u043b\u044c\u043a\u043e \u0434\u043b\u044f \u0430\u0434\u043c\u0438\u043d\u043e\u0432' });
  }
  const { userId, blocked } = req.body || {};
  const users = req.users || (await loadUsers());
  const target = users.find((u) => u.id === userId);
  if (!target) return res.status(404).json({ error: '\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d' });
  target.blocked = !!blocked;
  await saveUsers(users);
  log('info', 'admin_block', { targetId: target.id, blocked: target.blocked });
  // Disconnect blocked user if online.
  const ws = liveSockets.get(userId);
  if (ws) ws.close(4003, 'Blocked by admin');
  return res.json({ users: users.map(sanitizeUser) });
});

app.get('/api/admin/reports', auth, async (req, res) => {
  if (!req.user.isAdmin && req.user.username !== HELP_ORIG_USERNAME) {
    return res.status(403).json({ error: '\u0422\u043e\u043b\u044c\u043a\u043e \u0434\u043b\u044f \u0430\u0434\u043c\u0438\u043d\u043e\u0432' });
  }
  const reports = await loadReports();
  log('info', 'admin_reports_list', { userId: req.user.id });
  return res.json({ reports });
});

app.post('/api/admin/mute', auth, async (req, res) => {
  if (!req.user.isAdmin && req.user.username !== HELP_ORIG_USERNAME) {
    return res.status(403).json({ error: '\u0422\u043e\u043b\u044c\u043a\u043e \u0434\u043b\u044f \u0430\u0434\u043c\u0438\u043d\u043e\u0432' });
  }
  const { userId, minutes } = req.body || {};
  if (!userId || typeof minutes !== 'number' || minutes < 0) {
    return res.status(400).json({ error: '\u041d\u0443\u0436\u043d\u044b userId \u0438 minutes (>= 0)' });
  }
  if (minutes > 43200) {
    return res.status(400).json({ error: '\u041c\u0430\u043a\u0441\u0438\u043c\u0443\u043c 43200 \u043c\u0438\u043d\u0443\u0442' });
  }
  const users = req.users || (await loadUsers());
  const target = users.find((u) => u.id === userId);
  if (!target) return res.status(404).json({ error: '\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d' });
  target.mutedUntil = minutes === 0 ? null : Date.now() + minutes * 60 * 1000;
  await saveUsers(users);
  log('info', 'admin_mute', { targetId: target.id, mutedUntil: target.mutedUntil });
  const ws = liveSockets.get(userId);
  if (ws && target.mutedUntil) {
    ws.send(
      JSON.stringify({
        type: 'muted',
        mutedUntil: target.mutedUntil,
      }),
    );
  }
  return res.json({ user: sanitizeUser(target) });
});


};

module.exports = { registerApiRoutes };
