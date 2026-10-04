// ---------------------------------------------------------------------------
// Jembatan IPC
//
// Dipisah dari main.js supaya daftar channel bisa dipakai ulang oleh skrip
// smoke test tanpa harus menjalankan seluruh proses utama.
// ---------------------------------------------------------------------------
import { ipcMain } from 'electron'
import { loadLibrary, saveLibrary, loadSoftware, saveSoftware } from './store.js'
import { steamSearch, steamImport } from './steam.js'
import { importSoftware } from './website.js'
import { pickThumbnail, saveThumbnail, deleteThumbnail } from './thumbnails.js'
import { openExternal, copyText } from './system.js'

// Setiap handler mengembalikan nilai yang bisa diserialisasi; error dilempar
// ulang sebagai Error biasa supaya renderer bisa menampilkan pesan aslinya.
function handle(channel, fn) {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return await fn(...args)
    } catch (err) {
      throw new Error(err?.message || String(err))
    }
  })
}

// registerIpc memasang seluruh handler. `getWindow` dipakai oleh aksi yang
// butuh jendela aktif (mis. memunculkan kembali jendela yang terminimasi).
export function registerIpc(getWindow) {
  // Katalog
  handle('softgame:loadLibrary', () => loadLibrary())
  handle('softgame:saveLibrary', (games) => saveLibrary(games))
  handle('softgame:loadSoftware', () => loadSoftware())
  handle('softgame:saveSoftware', (items) => saveSoftware(items))

  // Impor
  handle('softgame:steamSearch', (term) => steamSearch(term))
  handle('softgame:steamImport', (url) => steamImport(url))
  handle('softgame:importSoftware', (url) => importSoftware(url))

  // Thumbnail
  handle('softgame:pickThumbnail', () => pickThumbnail())
  handle('softgame:saveThumbnail', (ref, title) => saveThumbnail(ref, title))
  handle('softgame:deleteThumbnail', (ref) => deleteThumbnail(ref))

  // Sistem
  handle('softgame:openExternal', (url) => openExternal(url))
  handle('softgame:copyText', (text) => copyText(text))
  handle('softgame:restoreWindow', () => {
    const win = getWindow?.()
    if (!win || win.isDestroyed()) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  })
}
