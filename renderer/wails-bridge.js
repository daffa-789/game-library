// wails-bridge.js
// Bridges window.api calls to Wails v2 Go bindings (window.go.main.App)
(function () {
  'use strict';

  // Guard against uninitialized window.go
  window.go = window.go || {};
  window.go.main = window.go.main || {};
  window.go.main.App = window.go.main.App || {};

  window.api = {
    loadLibrary: () => window.go.main.App.LoadLibrary(),
    saveLibrary: (games) => window.go.main.App.SaveLibrary(games),
    pickThumbnail: () => window.go.main.App.PickThumbnail(),
    deleteThumbnail: (ref) => window.go.main.App.DeleteThumbnail(ref),
    openExternal: (url) => window.go.main.App.OpenExternal(url),
    copyText: (text) => window.go.main.App.CopyText(text),
    steamImport: (url) => window.go.main.App.SteamImport(url),
  };
})();
