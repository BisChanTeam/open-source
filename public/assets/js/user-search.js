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

(() => {
  const input = document.getElementById('user-search-input');
  const button = document.getElementById('user-search-btn');
  const status = document.getElementById('user-search-status');
  const result = document.getElementById('user-search-result');
  const chatList = document.getElementById('chat-list');

  if (!input || !button || !status || !result) return;

  const isJwtLike = (value) =>
    typeof value === 'string' && /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(value);

  const findTokenInStorage = (storage) => {
    if (!storage) return null;
    const knownKeys = [
      'bischan_token',
      'token',
      'authToken',
      'bischan_token',
      'bischanToken',
      'bisToken',
      'jwt',
    ];
    for (const key of knownKeys) {
      const value = storage.getItem(key);
      if (isJwtLike(value)) return value;
    }
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      const value = storage.getItem(key);
      if (isJwtLike(value)) return value;
    }
    return null;
  };

  const getAuthToken = () =>
    findTokenInStorage(localStorage) || findTokenInStorage(sessionStorage) || null;

  const clearResult = () => {
    result.innerHTML = '';
  };

  const setStatus = (text) => {
    status.textContent = text || '';
  };

  const DEFAULT_AVATAR = 'https://files-bisfd.ru/img/logo/bischan.png';

  const escapeHtml = (value) =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const normalizeAvatarUrl = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return DEFAULT_AVATAR;
    if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('/')) {
      return raw;
    }
    return '/' + raw.replace(/^\/+/, '');
  };

  const renderUser = (user) => {
    const avatar = normalizeAvatarUrl(user.avatar);
    const nickname = user.nickname || 'User';
    const username = user.username ? `@${user.username}` : '';
    const online = user.online ? 'Online' : user.lastSeen ? 'Offline' : 'Offline';

    result.innerHTML = `
      <div class="preview-card">
        <img class="preview-avatar" src="${avatar}" alt="Avatar" onerror="this.onerror=null;this.src='${DEFAULT_AVATAR}';">
        <div class="preview-meta">
          <div class="preview-name">${escapeHtml(nickname)}</div>
          <div class="preview-username muted">${escapeHtml(username)}</div>
          <div class="muted" style="margin-top:6px;">${online}</div>
        </div>
      </div>
      <div class="actions" style="margin-top:10px;">
        <button id="user-search-open-chat" type="button">Open chat</button>
      </div>
    `;
  };

  const tryClickExistingChat = (user) => {
    const chatList = document.getElementById('chat-list');
    if (!chatList) return false;
    const candidates = chatList.querySelectorAll(
      '[data-user-id],[data-id],[data-chat-id],[data-target],[data-uid],[data-username]',
    );
    for (const el of candidates) {
      const data = el.dataset || {};
      const userId =
        data.userId || data.id || data.uid || data.target || data.chatId || '';
      const uname = data.username || '';
      if (userId === user.id || uname === user.username) {
        el.click();
        return true;
      }
    }
    return false;
  };

  const openChatForUser = async (user) => {
    const token = getAuthToken();
    if (!token) {
      setStatus('Пользователь не авторизован. Войдите в аккаунт.');
      return;
    }

    const openers = [
      window.openChatByUserId,
      window.openChat,
      window.openDirectChat,
      window.selectChat,
      window.BisChan?.openChat,
      window.BisChan?.openChatByUserId,
      window.BisChanApp?.openChat,
      window.BisChanApp?.openChatByUserId,
      window.app?.openChat,
      window.app?.openChatByUserId,
    ].filter((fn) => typeof fn === 'function');

    for (const fn of openers) {
      try {
        fn(user.id, user);
        return;
      } catch (_) {}
    }

    if (tryClickExistingChat(user)) return;

    try {
      const response = await fetch('/api/dm/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId: user.id, username: user.username }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus(payload.error || 'Не удалось открыть чат.');
        return;
      }

      sessionStorage.setItem('bischan_open_chat', user.username || user.id);
      location.reload();
      return;
    } catch (_) {
      setStatus('Не удалось открыть чат. Проверьте соединение и попробуйте снова.');
    }
  };

  const tryClickByText = (needle) => {
    if (!needle) return false;
    const chatList = document.getElementById('chat-list');
    if (!chatList) return false;
    const items = chatList.querySelectorAll('button, a, div');
    for (const el of items) {
      const text = (el.textContent || '').trim();
      if (!text) continue;
      if (text.includes(needle)) {
        el.click();
        return true;
      }
    }
    return false;
  };

  const autoOpenPendingChat = () => {
    const pending = sessionStorage.getItem('bischan_open_chat');
    if (!pending) return;
    const needle = pending.startsWith('@') ? pending : `@${pending}`;
    let attempts = 0;

    const timer = setInterval(() => {
      attempts += 1;
      if (
        tryClickExistingChat({ id: pending, username: pending }) ||
        tryClickByText(needle) ||
        tryClickByText(pending)
      ) {
        clearInterval(timer);
        sessionStorage.removeItem('bischan_open_chat');
      } else if (attempts > 20) {
        clearInterval(timer);
        sessionStorage.removeItem('bischan_open_chat');
      }
    }, 250);
  };

  const runSearch = async () => {
    const raw = String(input.value || '').trim();
    if (!raw) {
      setStatus('Введите username.');
      clearResult();
      return;
    }

    const token = getAuthToken();
    if (!token) {
      setStatus('Пользователь не авторизован. Войдите в аккаунт.');
      clearResult();
      return;
    }

    setStatus('Поиск...');
    clearResult();

    try {
      const params = new URLSearchParams({ username: raw.replace(/^@/, '') });
      const response = await fetch(`/api/users/find?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus(payload.error || 'Не удалось найти пользователя.');
        return;
      }

      if (!payload.user) {
        setStatus('Пользователь не найден.');
        return;
      }

      setStatus('');
      renderUser(payload.user);

      const openButton = document.getElementById('user-search-open-chat');
      if (openButton) {
        openButton.addEventListener('click', () => openChatForUser(payload.user));
      }
    } catch (err) {
      setStatus('Ошибка сети. Попробуйте снова.');
    }
  };

  button.addEventListener('click', runSearch);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      runSearch();
    }
  });

  autoOpenPendingChat();

  // --- Pin direct chats (client-side) -----------------------------------
  const PIN_STORAGE_KEY = 'bischan_pins_v1';

  const loadPins = () => {
    try {
      const raw = localStorage.getItem(PIN_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const savePins = (pins) => {
    localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify(pins));
  };

  const getChatKey = (el) => {
    if (!el) return null;
    const data = el.dataset || {};
    return data.userId || data.id || data.uid || data.target || data.chatId || data.username || null;
  };

  const addPinButton = (el) => {
    if (!el || el.querySelector('.pin-btn')) return;
    const key = getChatKey(el);
    if (!key) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pin-btn ghost';
    btn.textContent = 'Закрепить';
    btn.style.marginLeft = '8px';

    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      const pins = loadPins();
      const idx = pins.indexOf(key);
      if (idx === -1) pins.unshift(key);
      else pins.splice(idx, 1);
      savePins(pins);
      updatePinUI();
    });

    el.appendChild(btn);
  };

  let pinUiUpdating = false;

  const updatePinUI = () => {
    if (!chatList || pinUiUpdating) return;
    pinUiUpdating = true;

    try {
      const pins = loadPins();
      const items = Array.from(chatList.children);

      items.forEach((el) => {
        addPinButton(el);
        const key = getChatKey(el);
        const btn = el.querySelector('.pin-btn');
        if (!btn || !key) return;

        const isPinned = pins.includes(key);
        btn.textContent = isPinned ? 'Открепить' : 'Закрепить';

        if (isPinned) {
          el.dataset.pinned = 'true';
        } else {
          delete el.dataset.pinned;
        }
      });

      const sorted = [...items].sort((a, b) => {
        const aIdx = pins.indexOf(getChatKey(a));
        const bIdx = pins.indexOf(getChatKey(b));
        const aPinned = aIdx !== -1;
        const bPinned = bIdx !== -1;
        if (aPinned && bPinned) return aIdx - bIdx;
        if (aPinned) return -1;
        if (bPinned) return 1;
        return 0;
      });

      const changed = sorted.some((el, index) => el !== items[index]);
      if (changed) {
        const fragment = document.createDocumentFragment();
        sorted.forEach((el) => fragment.appendChild(el));
        chatList.appendChild(fragment);
      }
    } finally {
      pinUiUpdating = false;
    }
  };

  if (chatList) {
    const observer = new MutationObserver(() => updatePinUI());
    observer.observe(chatList, { childList: true, subtree: false });
    updatePinUI();
  }
})();