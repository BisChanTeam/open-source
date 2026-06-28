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

// Auth flows ---------------------------------------------------------------
const onLogin = async () => {
  try {
    const username = normalizeUsername(
      readInputValue(ui.loginUsername, 'Имя пользователя'),
    );
    const password = readInputValue(ui.loginPass, 'Пароль').trim();
    if (!username) return alert('Введите имя пользователя.');
    if (!isUsernameAllowed(username)) {
      return alert(
        'Имя пользователя: только латиница, 5-32 символа, разрешены буквы/цифры/подчёркивание',
      );
    }
    const { token, user } = await api('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    saveToken(token);
    state.user = user;
    await bootstrap();
  } catch (err) {
    alert(err.message);
  }
};

const onRegister = async () => {
  try {
    const nickname = readInputValue(ui.registerName, 'Имя').trim();
    const username = normalizeUsername(
      readInputValue(ui.registerUsername, 'Имя пользователя'),
    );
    const password = readInputValue(ui.registerPass, 'Пароль').trim();
    if (!nickname) return alert('Введите имя.');
    if (!isDisplayNameAllowed(nickname)) {
      return alert('Имя: 2-32 символа, буквы/цифры/пробелы и ._-');
    }
    if (!username) return alert('Введите имя пользователя.');
    if (!isUsernameAllowed(username)) {
      return alert(
        'Имя пользователя: только латиница, 5-32 символа, разрешены буквы/цифры/подчёркивание',
      );
    }
    const { token, user } = await api('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname, username, password }),
    });
    saveToken(token);
    state.user = user;
    await bootstrap();
  } catch (err) {
    alert(err.message);
  }
};

const logout = () => {
  saveToken('');
  state.user = null;
  state.users = [];
  state.groups = [];
  state.channels = [];
  state.messages = [];
  state.activeChat = null;
  state.activeGroupId = null;
  state.lastReadByChat = {};
  state.lastSyncedReadByChat = {};
  state.uploadingFile = false;
  if (ui.attachFileBtn) {
    ui.attachFileBtn.disabled = true;
    ui.attachFileBtn.textContent = 'Файл';
  }
  if (ui.attachFileInput) ui.attachFileInput.value = '';
  stopPolling();
  if (state.socket) state.socket.close();
  toggleViews(false);
};

// Avatar upload.
const uploadAvatar = async (file) => {
  const form = new FormData();
  form.append('avatar', file);
  const data = await api('/api/avatar', { method: 'POST', body: form });
  state.user.avatar = data.avatar;
  // Refresh user list to show new avatar locally.
  state.users = state.users.map((u) =>
    u.id === state.user.id ? { ...u, avatar: data.avatar } : u,
  );
  if (state.previewAvatarUrl) {
    URL.revokeObjectURL(state.previewAvatarUrl);
    state.previewAvatarUrl = '';
  }
  updateProfilePreview();
  renderSidebar();
};

const setFileUploadBusy = (busy) => {
  state.uploadingFile = !!busy;
  if (!ui.attachFileBtn) return;
  ui.attachFileBtn.disabled = busy || !state.activeChat;
  ui.attachFileBtn.textContent = busy ? 'Загрузка...' : 'Файл';
};

const uploadChatFile = async (file) => {
  if (!file) return;
  if (!state.activeChat) {
    throw new Error('Select chat first.');
  }
  if (file.size > FILE_UPLOAD_LIMIT_BYTES) {
    throw new Error(
      `File is too large. Maximum: ${formatFileSize(FILE_UPLOAD_LIMIT_BYTES)}.`,
    );
  }
  if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
    throw new Error('No connection. Try again.');
  }
  setFileUploadBusy(true);
  const form = new FormData();
  form.append('file', file);
  try {
    const data = await api('/api/files', { method: 'POST', body: form });
    const uploaded = data?.file;
    if (!uploaded?.url) throw new Error('File upload failed.');
    const url = new URL(uploaded.url, location.origin).toString();
    const name = uploaded.name || file.name || 'file';
    const size = formatFileSize(uploaded.size ?? file.size);
    sendMessage(`[FILE] ${name} (${size}) ${url}`);
  } finally {
    setFileUploadBusy(false);
    if (ui.attachFileInput) ui.attachFileInput.value = '';
  }
};

const updateProfilePreview = (overrides = {}) => {
  if (!ui.previewAvatar || !state.user) return;
  const name = (ui.settingsName?.value || state.user.nickname || '').trim();
  const usernameValue = normalizeUsername(
    ui.settingsUsername?.value || state.user.username || '',
  );
  ui.previewName.textContent = name || 'Без имени';
  if (usernameValue) {
    ui.previewUsername.textContent = `@${usernameValue}`;
    ui.previewUsername.classList.remove('hidden');
  } else {
    ui.previewUsername.textContent = '';
    ui.previewUsername.classList.add('hidden');
  }
  const avatar = overrides.avatarUrl || state.user.avatar || 'https://files-bisfd.ru/img/bischan-staff-avatars/default.jpg';
  ui.previewAvatar.src = avatar;
};

const setPreviewAvatar = (file) => {
  if (!ui.previewAvatar) return;
  if (state.previewAvatarUrl) {
    URL.revokeObjectURL(state.previewAvatarUrl);
    state.previewAvatarUrl = '';
  }
  if (!file) {
    updateProfilePreview();
    return;
  }
  state.previewAvatarUrl = URL.createObjectURL(file);
  updateProfilePreview({ avatarUrl: state.previewAvatarUrl });
};

const syncSettingsForm = () => {
  if (!state.user) return;
  if (ui.settingsName) ui.settingsName.value = state.user.nickname || '';
  if (ui.settingsUsername) ui.settingsUsername.value = state.user.username || '';
  if (ui.currentPassword) ui.currentPassword.value = '';
  if (ui.newPassword) ui.newPassword.value = '';
  if (ui.deletePassword) ui.deletePassword.value = '';
  updateProfilePreview();
};

const openSettings = () => {
  if (!ui.settingsModal) return;
  syncSettingsForm();
  ui.settingsModal.classList.remove('hidden');
};

const closeSettings = () => {
  if (!ui.settingsModal) return;
  ui.settingsModal.classList.add('hidden');
};

const updateProfile = async () => {
  const nickname = ui.settingsName.value.trim();
  const username = normalizeUsername(ui.settingsUsername.value);
  if (!isDisplayNameAllowed(nickname)) {
    return alert('Имя: 2-32 символа, буквы/цифры/пробелы/._-');
  }
  if (!isUsernameAllowed(username)) {
    return alert('Username должен содержать только латиницу, длиной 5-32, разрешены буквы, цифры и подчёркивание.');
  }
  const { user } = await api('/api/account/profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname, username }),
  });
  state.user = user;
  state.users = state.users.map((u) => (u.id === user.id ? user : u));
  renderSidebar();
  renderMessages();
  syncSettingsForm();
  alert('Профиль обновлён.');
};

const updatePassword = async () => {
  const currentPassword = ui.currentPassword.value.trim();
  const newPassword = ui.newPassword.value.trim();
  if (!currentPassword || !newPassword) return alert('Заполните оба поля пароля.');
  if (newPassword.length < 6) return alert('Новый пароль должен быть не короче 6 символов.');
  await api('/api/account/password', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  ui.currentPassword.value = '';
  ui.newPassword.value = '';
  alert('Пароль изменён.');
};

const deleteAccount = async () => {
  const password = ui.deletePassword.value.trim();
  if (!password) return alert('Введите пароль для подтверждения.');
  if (!confirm('Вы точно хотите удалить аккаунт? Это действие необратимо.')) return;
  await api('/api/account', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  alert('Аккаунт удалён.');
  closeSettings();
  logout();
};