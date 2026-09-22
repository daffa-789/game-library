package main

import (
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// ---------------------------------------------------------------------------
// Ukuran & posisi jendela
//
// Windows menempatkan jendela yang lebih tinggi dari work area dengan bagian
// atas keluar layar. Akibatnya title bar — beserta tombol minimize, maximize,
// dan close — tidak terlihat dan tidak bisa dijangkau. Ukuran bawaan aplikasi
// (1400x880, warisan dari versi Electron) persis terkena kasus ini di laptop
// 1080p dengan scaling 125%, yang work area-nya cuma ~816px.
// ---------------------------------------------------------------------------

const (
	windowWidth     = 1400
	windowHeight    = 880
	windowMinWidth  = 980
	windowMinHeight = 620

	// Jatah untuk taskbar + title bar + border, dihitung dalam pixel logis.
	// runtime.Screen.Size memberi tinggi layar penuh (bukan work area), jadi
	// sisanya dikurangi dulu supaya title bar pasti aman di dalam layar.
	taskbarAllowance    = 48
	titleBarAllowance   = 32
	windowEdgeAllowance = 16
)

// fitWindowSize membatasi ukuran awal jendela agar tidak lebih besar dari layar
// tempat aplikasi berjalan. Mengembalikan ukuran yang diminta kalau memang muat.
func fitWindowSize(desiredW, desiredH, screenW, screenH int) (int, int) {
	if screenW <= 0 || screenH <= 0 {
		return desiredW, desiredH
	}

	maxW := screenW - windowEdgeAllowance
	maxH := screenH - taskbarAllowance - titleBarAllowance

	w, h := desiredW, desiredH
	if w > maxW {
		w = maxW
	}
	if h > maxH {
		h = maxH
	}

	// Jangan sampai jendela jadi terlalu kecil untuk dipakai; kalau layarnya
	// memang sempit, ikut mengecil tapi tetap positip.
	if w < 640 {
		w = minInt(w, maxW)
	}
	if h < 480 {
		h = minInt(h, maxH)
	}
	if w <= 0 {
		w = desiredW
	}
	if h <= 0 {
		h = desiredH
	}
	return w, h
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// ensureWindowFitsScreen dipanggil dari startup: mengecilkan jendela bila
// ukurannya tidak muat, lalu menengahkan posisinya supaya title bar selalu
// terjangkau. Gagal membaca informasi layar bukan masalah — jendela dibiarkan
// apa adanya.
func (a *App) ensureWindowFitsScreen() {
	if a.ctx == nil {
		return
	}

	screens, err := runtime.ScreenGetAll(a.ctx)
	if err != nil || len(screens) == 0 {
		runtime.WindowCenter(a.ctx)
		return
	}

	screen := screens[0]
	for _, s := range screens {
		if s.IsCurrent || (s.IsPrimary && !screen.IsCurrent) {
			screen = s
		}
	}

	curW, curH := runtime.WindowGetSize(a.ctx)
	targetW, targetH := fitWindowSize(curW, curH, screen.Size.Width, screen.Size.Height)
	if targetW != curW || targetH != curH {
		runtime.WindowSetSize(a.ctx, targetW, targetH)
	}
	runtime.WindowCenter(a.ctx)
}
