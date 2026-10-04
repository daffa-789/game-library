// ---------------------------------------------------------------------------
// Preload: satu-satunya jembatan antara renderer dan proses utama.
//
// CommonJS (.cjs) karena preload berjalan di konteks sandbox; renderer hanya
// melihat objek window.softgame yang isinya fungsi, tanpa akses Node apa pun.
// ---------------------------------------------------------------------------
const { contextBridge, ipcRenderer } = require('electron')

const call = (channel, ...args) => ipcRenderer.invoke(channel, ...args)

contextBridge.exposeInMainWorld('softgame', {
  // Katalog
  loadLibrary: () => call('softgame:loadLibrary'),
  saveLibrary: (games) => call('softgame:saveLibrary', games),
  loadSoftware: () => call('softgame:loadSoftware'),
  saveSoftware: (items) => call('softgame:saveSoftware', items),

  // Impor
  steamSearch: (term) => call('softgame:steamSearch', term),
  steamImport: (url) => call('softgame:steamImport', url),
  importSoftware: (url) => call('softgame:importSoftware', url),

  // Thumbnail
  pickThumbnail: () => call('softgame:pickThumbnail'),
  saveThumbnail: (ref, title) => call('softgame:saveThumbnail', ref, title),
  deleteThumbnail: (ref) => call('softgame:deleteThumbnail', ref),

  // Sistem
  openExternal: (url) => call('softgame:openExternal', url),
  copyText: (text) => call('softgame:copyText', text),
  restoreWindow: () => call('softgame:restoreWindow'),
})
