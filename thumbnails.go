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
	defer dst.Close()

	written, err := io.Copy(dst, io.LimitReader(src, maxThumbnailBytes+1))
	if err != nil || written > maxThumbnailBytes {
		_ = os.Remove(destPath)
		if err != nil {
			return "", fmt.Errorf("gagal menyalin file thumbnail: %w", err)
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
