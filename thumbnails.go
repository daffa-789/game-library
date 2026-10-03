package main

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"unicode"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	// thumbURLPrefix prefix URL thumbnail yang dipakai frontend & AssetServer.
	thumbURLPrefix = "/thumbnails/"

	// legacyThumbPrefix skema lama (Electron) yang masih bisa muncul di
	// library.json; dinormalisasi saat load.
	legacyThumbPrefix = "glib://thumb/"
)

// legacyThumbPrefixes semua skema lama yang dikenal: glib:// dari Game Library
// lama, slib:// dari Software Library lama. Keduanya menunjuk ke file di dalam
// folder thumbnails yang sekarang dipakai bersama.
var legacyThumbPrefixes = []string{legacyThumbPrefix, "slib://thumb/"}

// ---------------------------------------------------------------------------
// Keamanan path
// ---------------------------------------------------------------------------

// hasKnownThumbPrefix true bila referensi memakai salah satu prefix lama,
// sehingga perlu dinormalisasi ke /thumbnails/.
func hasKnownThumbPrefix(ref string) bool {
	for _, prefix := range legacyThumbPrefixes {
		if strings.HasPrefix(ref, prefix) {
			return true
		}
	}
	return false
}

// trimThumbPrefix membuang prefix referensi thumbnail dan mengembalikan nama
// file mentah (belum divalidasi).
func trimThumbPrefix(ref string) string {
	ref = strings.TrimSpace(ref)
	for _, prefix := range legacyThumbPrefixes {
		ref = strings.TrimPrefix(ref, prefix)
	}
	ref = strings.TrimPrefix(ref, thumbURLPrefix)
	ref = strings.TrimPrefix(ref, "thumbnails/")
	return ref
}

// safeThumbPath adalah satu-satunya gerbang menuju file thumbnail. Referensi
// apa pun yang bukan nama file polos di dalam a.thumbsDir ditolak, sehingga
// traversal (../../), path absolut, drive label, null byte, direktori induk,
// dan ekstensi non-gambar tidak bisa diakses maupun dihapus.
func (a *App) safeThumbPath(ref string) (string, bool) {
	name := trimThumbPrefix(ref)
	if name == "" || len(name) > 200 {
		return "", false
	}
	// Pemisah / control char / dot-sequence → tolak sebelum menyentuh filesystem.
	if strings.ContainsAny(name, "/\\\x00") || strings.Contains(name, "..") || strings.HasPrefix(name, ".") {
		return "", false
	}
	if filepath.IsAbs(name) || strings.ContainsRune(name, ':') {
		return "", false
	}
	if !allowedThumbExt[strings.ToLower(filepath.Ext(name))] {
		return "", false
	}

	target := filepath.Join(a.thumbsDir, name)
	cleanDir := filepath.Clean(a.thumbsDir)
	rel, err := filepath.Rel(cleanDir, filepath.Clean(target))
	if err != nil || rel != name || filepath.Dir(rel) != "." {
		return "", false
	}
	return target, true
}

// ---------------------------------------------------------------------------
// Thumbnail HTTP Handler (Mounted on AssetServer.Handler)
// ---------------------------------------------------------------------------

func (a *App) ThumbnailHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.EqualFold(r.Method, http.MethodGet) {
			w.Header().Set("Allow", http.MethodGet)
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		if !strings.HasPrefix(r.URL.Path, thumbURLPrefix) {
			http.NotFound(w, r)
			return
		}

		target, ok := a.safeThumbPath(r.URL.Path)
		if !ok {
			http.NotFound(w, r)
			return
		}

		fi, err := os.Stat(target)
		if err != nil || fi.IsDir() {
			http.NotFound(w, r)
			return
		}

		// Nama file acak (hex) → isi tidak berubah → boleh di-cache agresif.
		w.Header().Set("Cache-Control", fmt.Sprintf("public, max-age=%d, immutable", thumbCacheMaxAge))
		w.Header().Set("X-Content-Type-Options", "nosniff")
		if strings.EqualFold(filepath.Ext(target), ".svg") {
			// SVG dapat membawa skrip. Saat dipakai sebagai <img> ia sudah
			// terisolasi; header ini menutup jalur kalau file dibuka sebagai
			// dokumen mandiri di origin aplikasi.
			w.Header().Set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox")
		}

		// ServeFile menangani Range, Last-Modified, dan ETag secara bawaan.
		http.ServeFile(w, r, target)
	})
}

// ---------------------------------------------------------------------------
// Backend API: Manajemen Thumbnail & Dialog Native
// ---------------------------------------------------------------------------

// PickThumbnail membuka dialog pilih gambar, menyalin hasilnya ke folder data,
// dan mengembalikan referensi /thumbnails/<nama>.
func (a *App) PickThumbnail() (string, error) {
	if a.ctx == nil {
		return "", nil
	}
	filePath, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Pilih Gambar Thumbnail",
		Filters: []runtime.FileFilter{
			{
				DisplayName: "Gambar (*.png;*.jpg;*.jpeg;*.webp;*.gif;*.svg;*.bmp;*.ico)",
				Pattern:     "*.png;*.jpg;*.jpeg;*.webp;*.gif;*.svg;*.bmp;*.ico",
			},
		},
	})
	if err != nil || filePath == "" {
		return "", nil
	}

	ext := strings.ToLower(filepath.Ext(filePath))
	if !allowedThumbExt[ext] {
		return "", fmt.Errorf("Format gambar tidak didukung: %s", ext)
	}

	src, err := os.Open(filePath)
	if err != nil {
		return "", fmt.Errorf("gagal membuka gambar sumber: %w", err)
	}
	defer src.Close()

	fi, err := src.Stat()
	if err != nil {
		return "", fmt.Errorf("gagal membaca informasi gambar: %w", err)
	}
	if fi.IsDir() || fi.Size() <= 0 {
		return "", fmt.Errorf("Yang dipilih bukan file gambar")
	}
	if fi.Size() > maxThumbnailBytes {
		return "", fmt.Errorf("Ukuran gambar terlalu besar (maks %d MB)", maxThumbnailBytes>>20)
	}

	name, err := a.newThumbName(ext)
	if err != nil {
		return "", err
	}
	destPath := filepath.Join(a.thumbsDir, name)

	dst, err := os.Create(destPath)
	if err != nil {
		return "", fmt.Errorf("gagal menyimpan gambar thumbnail: %w", err)
	}

	written, copyErr := io.Copy(dst, io.LimitReader(src, maxThumbnailBytes+1))
	// Handle harus ditutup sebelum Remove: Windows menolak menghapus file yang
	// masih terbuka, dan hasil salinan gagal akan tertinggal selamanya.
	closeErr := dst.Close()
	if copyErr != nil || closeErr != nil || written > maxThumbnailBytes {
		_ = os.Remove(destPath)
		if copyErr != nil {
			return "", fmt.Errorf("gagal menyalin file thumbnail: %w", copyErr)
		}
		return "", fmt.Errorf("Ukuran gambar terlalu besar (maks %d MB)", maxThumbnailBytes>>20)
	}

	return thumbURLPrefix + name, nil
}

// DeleteThumbnail menghapus file thumbnail; input di luar whitelist diabaikan
// secara diam-diam (panggilan tidak boleh gagal untuk ref yang sudah basi).
func (a *App) DeleteThumbnail(ref string) error {
	target, ok := a.safeThumbPath(ref)
	if !ok {
		return nil
	}
	if fi, err := os.Stat(target); err != nil || fi.IsDir() {
		return nil
	}
	_ = os.Remove(target)
	return nil
}

// newThumbName menghasilkan nama file acak dengan ekstensi yang sudah diizinkan.
func (a *App) newThumbName(ext string) (string, error) {
	buf := make([]byte, 10)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("gagal membuat nama file acak: %w", err)
	}
	name := hex.EncodeToString(buf) + ext
	// Pastikan tidak menabrak file yang sudah ada.
	for i := 0; i < 3; i++ {
		if _, err := os.Stat(filepath.Join(a.thumbsDir, name)); os.IsNotExist(err) {
			return name, nil
		}
		if _, err := rand.Read(buf); err != nil {
			return "", fmt.Errorf("gagal membuat nama file acak: %w", err)
		}
		name = hex.EncodeToString(buf) + ext
	}
	return name, nil
}

// ---------------------------------------------------------------------------
// Ekspor: menyimpan gambar entri ke lokasi pilihan user
// ---------------------------------------------------------------------------

const (
	// maxFileNameLen batas panjang nama file (tanpa ekstensi) yang diturunkan
	// dari judul entri.
	maxFileNameLen = 80

	// forbiddenFileNameChars karakter yang tidak boleh ada di nama file Windows.
	forbiddenFileNameChars = `<>:"/\|?*`
)

// safeFileName menurunkan nama file yang aman dari judul entri: karakter
// terlarang diganti tanda hubung supaya masih mirip judul aslinya, whitespace
// dirapikan jadi satu spasi, dan panjang dipotong dengan truncateUTF8 agar
// tidak memecah rune di tengah.
func safeFileName(title, ext string) string {
	var b strings.Builder
	for _, r := range title {
		switch {
		case r < 0x20 || r == 0x7f:
			// Control character dibuang, bukan diganti: diganti spasi pun
			// namanya jadi aneh di Explorer.
		case strings.ContainsRune(forbiddenFileNameChars, r):
			b.WriteRune('-')
		case unicode.IsSpace(r):
			b.WriteRune(' ')
		default:
			b.WriteRune(r)
		}
	}

	name := strings.Trim(strings.TrimSpace(b.String()), ". ")
	if name == "" {
		name = "thumbnail"
	}
	return truncateUTF8(name, maxFileNameLen) + ext
}

// exportThumbBytes membaca gambar yang ditunjuk sebuah referensi thumbnail.
// Ini satu-satunya jalan keluar data gambar dari folder aplikasi: ref diikat
// gerbang safeThumbPath yang sama dengan yang dipakai handler dan penghapusan,
// jadi tidak bisa menunjuk ke luar folder thumbnails.
func (a *App) exportThumbBytes(ref string) ([]byte, string, error) {
	target, ok := a.safeThumbPath(ref)
	if !ok {
		return nil, "", fmt.Errorf("Entri ini tidak punya gambar tersimpan")
	}
	data, err := os.ReadFile(target)
	if err != nil {
		return nil, "", fmt.Errorf("File gambar tidak ditemukan di folder data")
	}
	if len(data) == 0 {
		return nil, "", fmt.Errorf("File gambar kosong")
	}
	return data, strings.ToLower(filepath.Ext(target)), nil
}

// SaveThumbnail membuka dialog Simpan Sebagai lalu menyalin gambar entri ke
// lokasi pilihan user. Dialog dibatalkan = "" tanpa error.
func (a *App) SaveThumbnail(ref, title string) (string, error) {
	if a.ctx == nil {
		return "", nil
	}
	data, ext, err := a.exportThumbBytes(ref)
	if err != nil {
		return "", err
	}

	dest, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "Simpan Gambar Thumbnail",
		DefaultFilename: safeFileName(title, ext),
		Filters: []runtime.FileFilter{
			{DisplayName: "Gambar (" + ext + ")", Pattern: "*" + ext},
		},
	})
	if err != nil || dest == "" {
		return "", nil
	}
	if err := os.WriteFile(dest, data, 0o644); err != nil {
		return "", fmt.Errorf("Gagal menyimpan gambar di lokasi itu")
	}
	return dest, nil
}
