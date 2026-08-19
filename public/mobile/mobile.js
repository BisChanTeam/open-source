(function setupMobileMode() {
  const mobileQuery = window.matchMedia('(max-width: 768px)');

  const isMobileRoute = () => location.pathname.replace(/\/+$/, '') === '/mobile';

  const syncDocumentMode = () => {
    document.documentElement.classList.toggle('mobile-app', mobileQuery.matches || isMobileRoute());
  };

  const openChat = () => {
    if (!mobileQuery.matches && !isMobileRoute()) return;
    document.body.classList.add('mobile-chat-open');
  };

  const closeChat = () => {
    document.body.classList.remove('mobile-chat-open');
  };

  const redirectPhoneToMobile = () => {
    if (!mobileQuery.matches) return;
    if (isMobileRoute()) return;
    if (location.pathname !== '/' && location.pathname !== '/index.html') return;
    location.replace('/mobile/');
  };

  redirectPhoneToMobile();
  syncDocumentMode();

  if (typeof mobileQuery.addEventListener === 'function') {
    mobileQuery.addEventListener('change', syncDocumentMode);
  } else if (typeof mobileQuery.addListener === 'function') {
    mobileQuery.addListener(syncDocumentMode);
  }

  window.addEventListener('DOMContentLoaded', () => {
    const back = document.getElementById('mobile-back');
    const workspace = document.querySelector('.workspace');
    if (back) back.addEventListener('click', closeChat);
    if (!workspace) return;

    workspace.addEventListener('click', (event) => {
      const item = event.target.closest('.user, .channel');
      if (item) openChat();
    });
  });
})();
