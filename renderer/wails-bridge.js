// wails-bridge.js
// Bridges window.api calls to Wails v2 Go bindings (window.go.main.App)
(function () {
  'use strict';

  // Guard against uninitialized window.go
  window.go = window.go || {};
  window.go.main = window.go.main || {};
  window.go.main.App = window.go.main.App || {};

  const call = (method, ...args) => window.go.main.App[method](...args);

  window.api = {
    // Katalog game (tab "Game") — tetap punya spesifikasi sistem.
    loadLibrary: () => call('LoadLibrary'),
    saveLibrary: (games) => call('SaveLibrary', games),
    steamImport: (url) => call('SteamImport', url),

    // Katalog software (tab "Software") — tanpa spesifikasi.
    loadSoftware: () => call('LoadSoftware'),
    saveSoftware: (items) => call('SaveSoftware', items),
    importSoftware: (url) => call('ImportSoftware', url),

    // Dipakai kedua katalog.
    pickThumbnail: () => call('PickThumbnail'),
    deleteThumbnail: (ref) => call('DeleteThumbnail', ref),
    openExternal: (url) => call('OpenExternal', url),
    copyText: (text) => call('CopyText', text),
  };
})();
