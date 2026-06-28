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

// Backward-compatible loader for pages that still include /assets/app.js.
(function loadSplitAppScripts() {
  if (window.__bischanSplitScriptsLoaded) return;
  window.__bischanSplitScriptsLoaded = true;

  const scripts = [
    '/assets/js/app-core.js',
    '/assets/js/app-auth.js',
    '/assets/js/app-events.js',
    '/assets/js/app-polling.js',
  ];

  const appendScript = (src) =>
    new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        if (existing.dataset.bischanLoaded === 'true') {
          resolve();
          return;
        }
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), {
          once: true,
        });
        return;
      }

      const script = document.createElement('script');
      script.src = src;
      script.defer = true;
      script.dataset.bischanSplit = 'true';
      script.addEventListener(
        'load',
        () => {
          script.dataset.bischanLoaded = 'true';
          resolve();
        },
        { once: true },
      );
      script.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), {
        once: true,
      });
      document.head.appendChild(script);
    });

  (async () => {
    for (const src of scripts) {
      // Keep execution order deterministic for dependent scripts.
      await appendScript(src);
    }
  })().catch((error) => {
    console.error('[app-loader]', error.message);
  });
})();
