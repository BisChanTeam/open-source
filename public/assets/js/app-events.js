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

// Wire DOM events.
if (ui.btnLogin) ui.btnLogin.onclick = onLogin;
if (ui.btnRegister) ui.btnRegister.onclick = onRegister;
if (ui.btnLogout) ui.btnLogout.onclick = logout;
if (ui.showRegister && ui.showLogin && ui.loginForm && ui.registerForm) {
  ui.showRegister.onclick = () => {
    ui.loginForm.classList.add('hidden');
    ui.registerForm.classList.remove('hidden');
  };
  ui.showLogin.onclick = () => {
    ui.registerForm.classList.add('hidden');
    ui.loginForm.classList.remove('hidden');
  };
}
if (ui.btnSettings) ui.btnSettings.onclick = openSettings;
if (ui.settingsClose) ui.settingsClose.onclick = closeSettings;
if (ui.settingsModal) {
  ui.settingsModal.addEventListener('click', (e) => {
    if (e.target === ui.settingsModal) closeSettings();
  });
}

if (ui.profileForm) {
  ui.profileForm.addEventListener('submit', (e) => {
    e.preventDefault();
    updateProfile().catch((err) => alert(err.message));
  });
}

if (ui.passwordForm) {
  ui.passwordForm.addEventListener('submit', (e) => {
    e.preventDefault();
    updatePassword().catch((err) => alert(err.message));
  });
}
if (ui.deleteForm) {
  ui.deleteForm.addEventListener('submit', (e) => {
    e.preventDefault();
    deleteAccount().catch((err) => alert(err.message));
  });
}

if (ui.form && ui.input) {
  ui.form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!state.activeChat) return alert('Выберите чат.');
    const text = ui.input.value.trim();
    if (!text) return;
    ui.input.value = '';
    sendMessage(text);
  });
}

if (ui.input) {
  ui.input.addEventListener('input', () => {
    setTyping(true);
    clearTimeout(state.typingSendTimer);
    state.typingSendTimer = setTimeout(() => setTyping(false), 1200);
  });
}

if (ui.attachFileBtn && ui.attachFileInput) {
  ui.attachFileBtn.addEventListener('click', () => {
    if (!state.activeChat) {
      alert('Выберите чат.');
      return;
    }
    if (state.uploadingFile) return;
    ui.attachFileInput.click();
  });
  ui.attachFileInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadChatFile(file).catch((err) => alert(err.message));
  });
}

if (ui.avatarInput) {
  ui.avatarInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setPreviewAvatar(file);
      uploadAvatar(file).catch((err) => alert(err.message));
    }
  });
}

if (ui.settingsAvatar) {
  ui.settingsAvatar.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setPreviewAvatar(file);
      uploadAvatar(file).catch((err) => alert(err.message));
    }
  });
}

if (ui.settingsName) {
  ui.settingsName.addEventListener('input', () => updateProfilePreview());
}

if (ui.settingsUsername) {
  ui.settingsUsername.addEventListener('input', () => updateProfilePreview());
}