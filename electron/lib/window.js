// ---------------------------------------------------------------------------
// Ukuran & posisi jendela
//
// Windows menempatkan jendela yang lebih tinggi dari work area dengan bagian
// atas keluar layar. Akibatnya title bar - beserta tombol minimize, maximize,
// dan close - tidak terlihat dan tidak bisa dijangkau. Ukuran bawaan aplikasi
// (1400x880) persis terkena kasus ini di laptop 1080p dengan scaling 125%.
// ---------------------------------------------------------------------------
import { screen } from 'electron'

export const windowWidth = 1400
export const windowHeight = 880
export const windowMinWidth = 980
export const windowMinHeight = 620

// Jatah untuk taskbar + title bar + border, dihitung dalam pixel logis.
const taskbarAllowance = 48
const titleBarAllowance = 32
const windowEdgeAllowance = 16

// fitWindowSize membatasi ukuran awal jendela agar tidak lebih besar dari layar
// tempat aplikasi berjalan. Mengembalikan ukuran yang diminta kalau memang muat.
export function fitWindowSize(desiredW, desiredH, screenW, screenH) {
  if (!screenW || !screenH) return [desiredW, desiredH]

  const maxW = screenW - windowEdgeAllowance
  const maxH = screenH - taskbarAllowance - titleBarAllowance

  let w = desiredW
  let h = desiredH
  if (w > maxW) w = maxW
  if (h > maxH) h = maxH

  // Jangan sampai jendela jadi terlalu kecil untuk dipakai; kalau layarnya
  // memang sempit, ikut mengecil tapi tetap positip.
  if (w < 640) w = Math.min(w, maxW)
  if (h < 480) h = Math.min(h, maxH)
  if (w <= 0) w = desiredW
  if (h <= 0) h = desiredH
  return [w, h]
}

// ensureWindowFitsScreen mengecilkan jendela bila ukurannya tidak muat, lalu
// menengahkan posisinya supaya title bar selalu terjangkau.
export function ensureWindowFitsScreen(win) {
  if (!win || win.isDestroyed()) return
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const area = display.workAreaSize

  const [curW, curH] = win.getSize()
  const [targetW, targetH] = fitWindowSize(curW, curH, area.width, area.height)
  if (targetW !== curW || targetH !== curH) win.setSize(targetW, targetH)
  win.center()
}
