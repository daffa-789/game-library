// wails-bridge.js
// Bridges window.api calls to Wails v2 Go bindings (window.go.main.App)
(function () {
  'use strict';

  function getBackend() {
    return new Promise((resolve) => {
      if (window.go && window.go.main && window.go.main.App) {
        return resolve(window.go.main.App);
      }
      const start = Date.now();
      const timer = setInterval(() => {
        if (window.go && window.go.main && window.go.main.App) {
          clearInterval(timer);
          resolve(window.go.main.App);
        } else if (Date.now() - start > 5000) {
          clearInterval(timer);
          console.warn('[wails-bridge] Timeout: window.go.main.App tidak ditemukan.');
          resolve(null);
        }
      }, 30);
    });
  }

  window.api = {
    loadLibrary: async function () {
      const b = await getBackend();
      return b ? b.LoadLibrary() : [];
    },
    saveLibrary: async function (games) {
      const b = await getBackend();
      return b ? b.SaveLibrary(games) : undefined;
    },
    pickThumbnail: async function () {
      const b = await getBackend();
      return b ? b.PickThumbnail() : '';
    },
    deleteThumbnail: async function (ref) {
      const b = await getBackend();
      return b ? b.DeleteThumbnail(ref) : undefined;
    },
    openExternal: async function (url) {
      const b = await getBackend();
      return b ? b.OpenExternal(url) : undefined;
    },
    copyText: async function (text) {
      const b = await getBackend();
      return b ? b.CopyText(text) : undefined;
    },
    steamImport: async function (url) {
      const b = await getBackend();
      if (!b) throw new Error('Backend Go Wails belum siap.');
      return b.SteamImport(url);
    },
  };
})();
