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

// BisChan front-end: minimal vanilla JS chat UI with WebSocket glue. By: SupromTeam
const PRIMARY_TOKEN_KEY = 'bischan_token';
const LEGACY_TOKEN_KEY = 'БисЧан_token';
const state = {
  token:
    localStorage.getItem(PRIMARY_TOKEN_KEY) ||
    localStorage.getItem(LEGACY_TOKEN_KEY) ||
    '',
  user: null,
  users: [],
  groups: [],
  channels: [],
  messages: [],
  activeChat: null,
  activeGroupId: null,
  socket: null,
  pollTimer: null,
  lastReadByChat: {},
  lastSyncedReadByChat: {},
  typingIndicatorTimer: null,
  typingSendTimer: null,
  previewAvatarUrl: '',
  uploadingFile: false,
};

// Cache DOM nodes for speed.
const ui = {
  loginView: document.getElementById('login-view'),
  appView: document.getElementById('app-view'),
  loginForm: document.getElementById('login-form'),
  registerForm: document.getElementById('register-form'),
  showRegister: document.getElementById('show-register'),
  showLogin: document.getElementById('show-login'),
  loginUsername: document.getElementById('login-username'),
  loginPass: document.getElementById('login-pass'),
  registerName: document.getElementById('register-name'),
  registerUsername: document.getElementById('register-username'),
  registerPass: document.getElementById('register-pass'),
  btnLogin: document.getElementById('btn-login'),
  btnRegister: document.getElementById('btn-register'),
  btnLogout: document.getElementById('btn-logout'),
  btnSettings: document.getElementById('btn-settings'),
  settingsModal: document.getElementById('settings-modal'),
  settingsClose: document.getElementById('settings-close'),
  profileForm: document.getElementById('profile-form'),
  passwordForm: document.getElementById('password-form'),
  deleteForm: document.getElementById('delete-form'),
  settingsName: document.getElementById('settings-name'),
  settingsUsername: document.getElementById('settings-username'),
  settingsAvatar: document.getElementById('settings-avatar'),
  previewAvatar: document.getElementById('preview-avatar'),
  previewName: document.getElementById('preview-name'),
  previewUsername: document.getElementById('preview-username'),
  currentPassword: document.getElementById('current-password'),
  newPassword: document.getElementById('new-password'),
  deletePassword: document.getElementById('delete-password'),
  adminLink: document.getElementById('admin-link'),
  avatarInput: document.getElementById('avatar-input'),
  groupList: document.getElementById('group-list'),
  channelList: document.getElementById('channel-list'),
  chatList: document.getElementById('chat-list'),
  chatTitle: document.getElementById('chat-title'),
  chatStatus: document.getElementById('chat-status'),
  typingIndicator: document.getElementById('typing-indicator'),
  messages: document.getElementById('messages'),
  form: document.getElementById('message-form'),
  input: document.getElementById('message-input'),
  attachFileBtn: document.getElementById('attach-file-btn'),
  attachFileInput: document.getElementById('attach-file-input'),
  themeToggle: document.getElementById('theme-toggle'),
};
const FILE_UPLOAD_LIMIT_BYTES = 20 * 1024 * 1024;
if (ui.attachFileBtn) ui.attachFileBtn.disabled = true;

// HTTP helper with JWT header support.
const api = async (path, options = {}) => {
  const headers = options.headers || {};
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const startedAt = Date.now();
  const method = options.method || 'GET';
  let res;
  try {
    res = await fetch(path, { ...options, headers });
  } catch (err) {
    
    throw err;
  }
  const ms = Date.now() - startedAt;
  console.info(
    `[${new Date().toISOString()}] [info] HTTP запрос ${JSON.stringify({
      method,
      url: path,
      status: res.status,
      ms,
    })}`,
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  const data = await res.json();
  if (path === '/api/me' && data?.user?.id) {
    console.info(
      `[${new Date().toISOString()}] [info] API /me ${JSON.stringify({
        userId: data.user.id,
      })}`,
    );
  }
  return data;
};

const saveToken = (token) => {
  state.token = token;
  if (token) {
    localStorage.setItem(PRIMARY_TOKEN_KEY, token);
    localStorage.setItem(LEGACY_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(PRIMARY_TOKEN_KEY);
    localStorage.removeItem(LEGACY_TOKEN_KEY);
  }
};

const readInputValue = (element, label) => {
  if (!element) throw new Error(`Поле "${label}" не найдено.`);
  return element.value;
};

const toggleViews = (authed) => {
  ui.loginView.classList.toggle('hidden', authed);
  ui.appView.classList.toggle('hidden', !authed);
  if (!ui.themeToggle) return;
  if (authed) {
    const topActions = document.querySelector('.top-actions');
    if (topActions) topActions.appendChild(ui.themeToggle);
  } else {
    document.body.prepend(ui.themeToggle);
  }
};

// Build chat id deterministically (matches server).
const chatIdFor = (a, b) => [a, b].sort().join(':');
const channelChatIdFor = (channelId) => `channel:${channelId}`;

const normalizeUsername = (value) => String(value || '').replace(/^@/, '').trim();
const isUsernameAllowed = (value) => /^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(value);
const isDisplayNameAllowed = (value) =>
  /^(?=.{2,32}$)[\p{L}\p{N} _.-]+$/u.test(value);
const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
const linkifyText = (value) => {
  const escaped = escapeHtml(value);
  const withLinks = escaped.replace(
    /\b(https?:\/\/[^\s<"]+)/gi,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>',
  );
  return withLinks.replace(
    /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi,
    '<a href="mailto:$1">$1</a>',
  );
};
const formatFileSize = (bytes) => {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

const getUnreadCountByChatId = (chatId) => {
  if (!state.user) return 0;
  const lastRead = state.lastReadByChat[chatId] || 0;
  return state.messages.filter((m) => {
    if (m.chatId !== chatId) return false;
    if (m.from === state.user.id) return false;
    const createdAt = new Date(m.createdAt).getTime();
    return createdAt > lastRead;
  }).length;
};

const mergeMessages = (incoming) => {
  const existing = new Set(state.messages.map((m) => m.id));
  const added = [];
  incoming.forEach((msg) => {
    if (!existing.has(msg.id)) {
      state.messages.push(msg);
      added.push(msg);
    }
  });
  return added;
};

const mergeReadByChat = (incoming) => {
  if (!incoming) return;
  Object.entries(incoming).forEach(([chatId, ts]) => {
    const next = Number(ts) || 0;
    const prev = state.lastReadByChat[chatId] || 0;
    if (next > prev) state.lastReadByChat[chatId] = next;
  });
};

const persistRead = async (chatId, lastReadAt) => {
  const previous = state.lastSyncedReadByChat[chatId] || 0;
  if (lastReadAt <= previous) return;
  state.lastSyncedReadByChat[chatId] = lastReadAt;
  try {
    await api('/api/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, lastReadAt }),
    });
  } catch (err) {
    console.warn('[read]', err.message);
  }
};

const getActiveChatId = () => {
  if (!state.activeChat) return null;
  if (state.activeChat.type === 'channel') {
    return channelChatIdFor(state.activeChat.id);
  }
  return chatIdFor(state.user.id, state.activeChat.id);
};

const getChannelsForGroup = (groupId) =>
  state.channels.filter((channel) => channel.groupId === groupId);

const ensureActiveGroup = () => {
  if (state.activeGroupId && state.groups.some((g) => g.id === state.activeGroupId)) {
    return;
  }
  state.activeGroupId = state.groups[0]?.id || null;
};

const renderGroupList = () => {
  if (!ui.groupList) return;
  if (!state.groups.length) {
    ui.groupList.innerHTML = '<p class="muted">No groups yet.</p>';
    return;
  }
  ensureActiveGroup();
  ui.groupList.innerHTML = state.groups
    .map((group) => {
      const active = group.id === state.activeGroupId ? 'active' : '';
      const name = escapeHtml(group.name || 'Group');
      const description = escapeHtml(group.description || '');
      return `
        <div class="group ${active}" data-id="${group.id}">
          <div class="group-icon">G</div>
          <div style="flex:1">
            <div>${name}</div>
            <div class="status">${description || 'Group'}</div>
          </div>
        </div>
      `;
    })
    .join('');
  ui.groupList.querySelectorAll('.group').forEach((node) => {
    node.onclick = () => {
      const groupId = node.dataset.id;
      state.activeGroupId = groupId;
      const channels = getChannelsForGroup(groupId);
      if (channels.length) {
        const activeChannelId = state.activeChat?.type === 'channel' ? state.activeChat.id : null;
        if (!activeChannelId || !channels.some((c) => c.id === activeChannelId)) {
          state.activeChat = { type: 'channel', id: channels[0].id };
        }
      }
      renderMessages();
    };
  });
};

const renderChannelList = () => {
  if (!ui.channelList) return;
  if (!state.groups.length) {
    ui.channelList.innerHTML = '<p class="muted">Add a group first.</p>';
    return;
  }
  ensureActiveGroup();
  if (!state.activeGroupId) {
    ui.channelList.innerHTML = '<p class="muted">Select a group.</p>';
    return;
  }
  const list = getChannelsForGroup(state.activeGroupId);
  if (!list.length) {
    ui.channelList.innerHTML = '<p class="muted">No channels yet.</p>';
    return;
  }
  ui.channelList.innerHTML = list
    .map((channel) => {
      const active =
        state.activeChat?.type === 'channel' && state.activeChat.id === channel.id
          ? 'active'
          : '';
      const chatId = channelChatIdFor(channel.id);
      const unreadCount = getUnreadCountByChatId(chatId);
      const unreadBadge = unreadCount
        ? `<div class="unread-badge">${unreadCount}</div>`
        : '';
      const name = escapeHtml(channel.name || 'channel');
      const description = escapeHtml(channel.description || '');
      return `
        <div class="channel ${active}" data-id="${channel.id}">
          <div class="channel-hash">#</div>
          <div style="flex:1">
            <div>${name}</div>
            <div class="status">${description || 'Channel'}</div>
          </div>
          ${unreadBadge}
        </div>
      `;
    })
    .join('');
  ui.channelList.querySelectorAll('.channel').forEach((node) => {
    node.onclick = () => {
      state.activeChat = { type: 'channel', id: node.dataset.id };
      renderMessages();
    };
  });
};

const renderDirectChats = () => {
  const others = state.users.filter((u) => u.id !== state.user.id);
  if (!others.length) {
    ui.chatList.innerHTML =
      '<p class="muted">Пока нет собеседников. Пригласите друзей или коллег.</p>';
    return;
  }
  ui.chatList.innerHTML = others
    .map((u) => {
      const online = u.online ? 'online' : '';
      const active =
        state.activeChat?.type === 'dm' && state.activeChat.id === u.id
          ? 'active'
          : '';
      const chatId = chatIdFor(state.user.id, u.id);
      const unreadCount = getUnreadCountByChatId(chatId);
      const unreadBadge = unreadCount
        ? `<div class="unread-badge">${unreadCount}</div>`
        : '';
      const avatar = escapeHtml(u.avatar || '/assets/favicon.ico');
      const nickname = escapeHtml(u.nickname || '');
      const handle = u.username ? `<div class="muted">@${escapeHtml(u.username)}</div>` : '';
      return `
        <div class="user ${active}" data-id="${u.id}">
          <img src="${avatar}" class="avatar" alt="${nickname}">
          <div style="flex:1">
            <div>${nickname}</div>
            ${handle}
            <div class="status">${u.online ? 'в сети' : 'не в сети'}</div>
          </div>
          ${unreadBadge}
          <div class="status-dot ${online}"></div>
        </div>
      `;
    })
    .join('');
  ui.chatList.querySelectorAll('.user').forEach((node) => {
    node.onclick = () => {
      state.activeChat = { type: 'dm', id: node.dataset.id };
      renderMessages();
    };
  });
};

const renderSidebar = () => {
  renderGroupList();
  renderChannelList();
  renderDirectChats();
};

// Render messages for the current dialog.
const renderMessages = () => {
  ui.messages.innerHTML = '';
  ui.typingIndicator.classList.add('hidden');

  if (!state.activeChat) {
    ui.chatTitle.textContent = 'Выберите чат';
    ui.chatStatus.textContent = 'Выберите диалог слева, чтобы начать общение';
    ui.input.disabled = true;
    if (ui.attachFileBtn) ui.attachFileBtn.disabled = true;
    ui.input.placeholder = 'Выберите чат...';
    renderSidebar();
    return;
  }

  if (state.activeChat.type === 'channel') {
    const channel = state.channels.find((c) => c.id === state.activeChat.id);
    if (!channel) {
      ui.chatTitle.textContent = 'Channel not found';
      ui.chatStatus.textContent = 'No access to this channel';
      ui.input.disabled = true;
      if (ui.attachFileBtn) ui.attachFileBtn.disabled = true;
      ui.input.placeholder = 'Select a channel...';
      renderSidebar();
      return;
    }
    const group = state.groups.find((g) => g.id === channel.groupId);
    ui.input.disabled = false;
    if (ui.attachFileBtn) ui.attachFileBtn.disabled = state.uploadingFile;
    ui.input.placeholder = `Message #${channel.name}...`;
    ui.chatTitle.textContent = `#${channel.name}`;
    ui.chatStatus.textContent = group ? group.name : 'Channel';

    const chatId = channelChatIdFor(channel.id);
    const history = state.messages
      .filter((m) => m.chatId === chatId)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    history.forEach((m) => {
      const self = m.from === state.user.id;
      const authorUser = state.users.find((u) => u.id === m.from);
      const author = self
        ? 'You'
        : authorUser?.nickname || (m.from === 'gigachat' ? 'GigaChat' : 'Unknown');
      const authorLabel = escapeHtml(author);
      const handle = !self && authorUser?.username ? ` @${escapeHtml(authorUser.username)}` : '';
      const text = linkifyText(m.text);
      const bubble = document.createElement('div');
      bubble.className = `bubble ${self ? 'me' : 'they'}`;
      bubble.innerHTML = `
        <div>${text}</div>
        <div class="meta">${authorLabel}${handle} ? ${new Date(m.createdAt).toLocaleTimeString()}</div>
      `;
      ui.messages.appendChild(bubble);
    });
    if (history.length) {
      const lastMessage = history[history.length - 1];
      const lastReadAt = new Date(lastMessage.createdAt).getTime();
      state.lastReadByChat[chatId] = lastReadAt;
      persistRead(chatId, lastReadAt);
    }
    ui.messages.scrollTop = ui.messages.scrollHeight;
    renderSidebar();
    return;
  }

  const partner = state.users.find((u) => u.id === state.activeChat.id);
  if (!partner) {
    ui.chatTitle.textContent = 'Чат не найден';
    ui.chatStatus.textContent = 'Собеседник не найден';
    ui.input.disabled = true;
    if (ui.attachFileBtn) ui.attachFileBtn.disabled = true;
    ui.input.placeholder = 'Выберите чат...';
    renderSidebar();
    return;
  }
  ui.input.disabled = false;
  if (ui.attachFileBtn) ui.attachFileBtn.disabled = state.uploadingFile;
  ui.input.placeholder = partner.username
    ? `Сообщение @${partner.username}...`
    : 'Сообщение...';
  ui.chatTitle.textContent = partner.nickname;
  const presence = partner.online
    ? 'в сети'
    : `был(а) ${new Date(partner.lastSeen || Date.now()).toLocaleTimeString()}`;
  ui.chatStatus.textContent = partner.username
    ? `@${partner.username} ? ${presence}`
    : presence;

  const chatId = chatIdFor(state.user.id, partner.id);
  const history = state.messages
    .filter((m) => m.chatId === chatId)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  history.forEach((m) => {
    const self = m.from === state.user.id;
    const author = self ? '??' : partner.nickname;
    const authorLabel = escapeHtml(author);
    const handle = !self && partner.username ? ` @${escapeHtml(partner.username)}` : '';
    const text = linkifyText(m.text);
    const bubble = document.createElement('div');
    bubble.className = `bubble ${self ? 'me' : 'they'}`;
    bubble.innerHTML = `
      <div>${text}</div>
      <div class="meta">${authorLabel}${handle} ? ${new Date(m.createdAt).toLocaleTimeString()}</div>
    `;
    ui.messages.appendChild(bubble);
  });
  if (history.length) {
    const lastMessage = history[history.length - 1];
    const lastReadAt = new Date(lastMessage.createdAt).getTime();
    state.lastReadByChat[chatId] = lastReadAt;
    persistRead(chatId, lastReadAt);
  }
  ui.messages.scrollTop = ui.messages.scrollHeight;
  renderSidebar();
};

// WebSocket lifecycle.

const connectSocket = () => {
  if (!state.token) return;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}?token=${encodeURIComponent(state.token)}`);
  state.socket = ws;

  ws.onopen = () => console.log('[ws] connected');

  ws.onmessage = (event) => {
    const payload = JSON.parse(event.data);
    if (payload.type === 'message') {
      state.messages.push(payload.message);
      const activeChatId = getActiveChatId();
      if (activeChatId && payload.message.chatId === activeChatId) {
        renderMessages();
      } else {
        renderSidebar();
      }
    }
    if (payload.type === 'presence') {
      state.users = state.users.map((u) =>
        u.id === payload.userId ? { ...u, online: payload.online, lastSeen: payload.lastSeen } : u,
      );
      if (state.user?.id === payload.userId) {
        state.user = { ...state.user, online: payload.online, lastSeen: payload.lastSeen };
      }
      renderMessages();
    }
    if (
      payload.type === 'typing' &&
      state.activeChat?.type === 'dm' &&
      payload.from === state.activeChat.id
    ) {
      ui.typingIndicator.classList.remove('hidden');
      clearTimeout(state.typingIndicatorTimer);
      state.typingIndicatorTimer = setTimeout(
        () => ui.typingIndicator.classList.add('hidden'),
        1500,
      );
    }
  };

  ws.onclose = (evt) => {
    console.warn('[ws] closed', evt.code, evt.reason);
    ui.typingIndicator.classList.add('hidden');
    if (evt.code === 4003) {
      alert('Доступ заблокирован администратором.');
      logout();
      return;
    }
    if ([4000, 4001, 4002].includes(evt.code)) {
      logout();
      return;
    }
    // goOffline();
    // Attempt a light retry in case of network hiccup.
    setTimeout(() => {
      if (state.token) connectSocket();
    }, 1500);
  };
};

const setTyping = (isTyping) => {
  if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return;
  if (!state.activeChat || state.activeChat.type !== 'dm') return;
  state.socket.send(
    JSON.stringify({ type: 'typing', to: state.activeChat.id, isTyping }),
  );
};

const sendMessage = (text) => {
  if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return;
  if (!state.activeChat) return;
  const payload = { type: 'message', text };
  if (state.activeChat.type === 'channel') {
    payload.to = state.activeChat.id;
    payload.scope = 'channel';
  } else {
    payload.to = state.activeChat.id;
    payload.scope = 'dm';
  }
  state.socket.send(JSON.stringify(payload));
};

// Load current user + initial data.
const bootstrap = async () => {
  const { user, users, messages, readByChat, groups, channels } = await api('/api/me');
  state.user = user;
  state.users = users;
  state.groups = groups || [];
  state.channels = channels || [];
  state.messages = messages;
  mergeReadByChat(readByChat);
  state.lastSyncedReadByChat = { ...state.lastReadByChat };
  if (!state.activeGroupId && state.groups.length) {
    state.activeGroupId = state.groups[0].id;
  }
  toggleViews(true);
  ui.adminLink.classList.toggle('hidden', !user.isAdmin);
  renderSidebar();
  renderMessages();
  connectSocket();
  startPolling();
  syncSettingsForm();
};
