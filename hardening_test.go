package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
	"unicode/utf8"
)

// ---------------------------------------------------------------------------
// Bukti untuk perbaikan hasil perombakan: truncation aman-rune, isolasi path
// thumbnail, whitelist ekstensi, dan invalidasi cache library.
// ---------------------------------------------------------------------------

func TestHard_TruncateUTF8KeepsRunesIntact(t *testing.T) {
	// 66 karakter 3-byte (198 byte) + "漢" = 201 byte; batas 200 byte jatuh di
	// tengah rune terakhir.
	full := strings.Repeat("あ", 66) + "漢"
	got := truncateUTF8(full, 200)

	if len(got) > 200 {
		t.Fatalf("truncateUTF8 melewatkan batas byte: %d > 200", len(got))
	}
	if !utf8.ValidString(got) {
		t.Fatalf("hasil truncation bukan UTF-8 valid: %q", got)
	}
	if got != strings.Repeat("あ", 66) {
		t.Errorf("hasil pemotongan salah, dapat %q", got)
	}

	// Batas ASCII harus tetap presisi (dipakai test lama).
	if len(truncateUTF8(strings.Repeat("A", 600), 400)) != 400 {
		t.Errorf("truncation ASCII harus tepat 400 byte")
	}
}

func TestHard_SanitizeGameNeverSplitsUTF8(t *testing.T) {
	app, _ := setupTestApp(t)
	title := strings.Repeat("é", 150) // 300 byte, batas Title 200 byte

	sanitized := app.sanitizeGame(Game{ID: "x", Title: title}, "2026-01-01T00:00:00Z")
	if !utf8.ValidString(sanitized.Title) {
		t.Fatalf("Title hasil sanitasi rusak: %q", sanitized.Title)
	}
	if len(sanitized.Title) != 200 {
		t.Errorf("expected 200 bytes, got %d", len(sanitized.Title))
	}
}

func TestHard_SafeThumbPathRejectsEscapes(t *testing.T) {
	app, tempDir := setupTestApp(t)
	sibling := filepath.Join(tempDir, "thumbnails_backup")
	if err := os.MkdirAll(sibling, 0o755); err != nil {
		t.Fatalf("setup: %v", err)
	}
	secret := filepath.Join(sibling, "loot.png")
	if err := os.WriteFile(secret, []byte("TOP_SECRET"), 0o644); err != nil {
		t.Fatalf("setup: %v", err)
	}

	bad := []string{
		"/thumbnails/../library.json",
		"thumbnails/..\\..\\secrets.png",
		"/thumbnails/sub/dir.png",
		"/thumbnails/C:/Windows/win.ini",
		"/thumbnails/PAGEFILE.SYS",
		"/thumbnails/shell.exe",
		"/thumbnails/report.html",
		"/thumbnails/double.png.svg.exe",
		"/thumbnails/.hidden.png",
		"/thumbnails/../../thumbnails_backup/loot.png",
		"", "   ", ".", "..", "/", "\\",
	}
	for _, ref := range bad {
		if got, ok := app.safeThumbPath(ref); ok {
			t.Errorf("safeThumbPath(%q) seharusnya ditolak, dapat %q", ref, got)
		}
	}

	good := []string{
		"/thumbnails/a1b2c3.png",
		"glib://thumb/old.jpg",
		"a1b2c3.webp",
	}
	for _, ref := range good {
		got, ok := app.safeThumbPath(ref)
		if !ok {
			t.Errorf("safeThumbPath(%q) seharusnya diterima", ref)
			continue
		}
		if filepath.Dir(got) != filepath.Clean(app.thumbsDir) {
			t.Errorf("safeThumbPath(%q) keluar dari folder thumbnails: %q", ref, got)
		}
	}
}

func TestHard_ThumbnailHandlerSecurityHeaders(t *testing.T) {
	app, tempDir := setupTestApp(t)

	writeThumb := func(name, content string) {
		t.Helper()
		if err := os.WriteFile(filepath.Join(tempDir, "thumbnails", name), []byte(content), 0o644); err != nil {
			t.Fatalf("setup: %v", err)
		}
	}
	writeThumb("pic.png", "PNGDATA")
	writeThumb("vector.svg", `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`)

	handler := app.ThumbnailHandler()

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/thumbnails/vector.svg", nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 untuk svg, got %d", rr.Code)
	}
	if ct := rr.Header().Get("Content-Type"); !strings.HasPrefix(ct, "image/svg+xml") {
		t.Errorf("expected Content-Type svg, got %q", ct)
	}
	if csp := rr.Header().Get("Content-Security-Policy"); !strings.Contains(csp, "sandbox") {
		t.Errorf("SVG tanpa header CSP sandbox: %q", csp)
	}
	if nosniff := rr.Header().Get("X-Content-Type-Options"); nosniff != "nosniff" {
		t.Errorf("expected X-Content-Type-Options nosniff, got %q", nosniff)
	}
	if cc := rr.Header().Get("Cache-Control"); !strings.Contains(cc, "max-age=86400") {
		t.Errorf("expected Cache-Control lama, got %q", cc)
	}

	// File di luar whitelist ekstensi tidak boleh dilayani, walaupun ada di disk.
	if err := os.WriteFile(filepath.Join(tempDir, "thumbnails", "notimage.exe"), []byte("MZ"), 0o644); err != nil {
		t.Fatalf("setup: %v", err)
	}
	rrExe := httptest.NewRecorder()
	handler.ServeHTTP(rrExe, httptest.NewRequest(http.MethodGet, "/thumbnails/notimage.exe", nil))
	if rrExe.Code == http.StatusOK {
		t.Errorf("file non-gambar di folder thumbnails seharusnya tidak dilayani")
	}
}

func TestHard_ThumbnailOpsStayInsideFolder(t *testing.T) {
	app, tempDir := setupTestApp(t)

	// Tanpa jendela Wails, PickThumbnail harus berhenti rapi (bukan panic/error).
	if ref, err := app.PickThumbnail(); err != nil || ref != "" {
		t.Errorf("PickThumbnail tanpa ctx seharusnya (\"\", nil), dapat (%q, %v)", ref, err)
	}

	// newThumbName selalu menghasilkan nama dengan ekstensi whitelist + unik.
	first, err := app.newThumbName(".png")
	if err != nil || !strings.HasSuffix(first, ".png") {
		t.Fatalf("newThumbName: %q err=%v", first, err)
	}
	second, _ := app.newThumbName(".png")
	if first == second {
		t.Errorf("newThumbName menghasilkan nama duplikat: %q", first)
	}

	// DeleteThumbnail hanya boleh menghapus file di dalam folder thumbnails.
	outside := filepath.Join(tempDir, "keepme.png")
	if err := os.WriteFile(outside, []byte("data"), 0o644); err != nil {
		t.Fatalf("setup: %v", err)
	}
	if err := app.DeleteThumbnail("../keepme.png"); err != nil {
		t.Errorf("DeleteThumbnail seharusnya toleran: %v", err)
	}
	if _, err := os.Stat(outside); err != nil {
		t.Errorf("file di luar folder thumbnails ikut terhapus")
	}
}

func TestHard_LibraryCacheStaysConsistent(t *testing.T) {
	app, tempDir := setupTestApp(t)

	if err := app.SaveLibrary([]Game{{ID: "c1", Title: "Awal"}}); err != nil {
		t.Fatalf("SaveLibrary: %v", err)
	}
	games, err := app.LoadLibrary()
	if err != nil || len(games) != 1 || games[0].Title != "Awal" {
		t.Fatalf("load setelah save salah: %d game, err=%v", len(games), err)
	}

	// Hasil kedua harus datang dari cache (fingerprint sama) tetapi tetap identik.
	cached, err := app.LoadLibrary()
	if err != nil || len(cached) != 1 || cached[0].Title != "Awal" {
		t.Fatalf("cache load salah: %d game, err=%v", len(cached), err)
	}

	// Sunting file dari luar aplikasi (ukuran berubah) → cache harus terinvalidate.
	libFile := filepath.Join(tempDir, "library.json")
	raw, err := os.ReadFile(libFile)
	if err != nil {
		t.Fatalf("setup baca: %v", err)
	}
	edited := strings.Replace(string(raw), `"title": "Awal"`, `"title": "Diubah Luar"`, 1)
	if edited == string(raw) {
		t.Fatalf("setup: konten tidak berubah, uji tidak berarti")
	}
	if err := os.WriteFile(libFile, []byte(edited), 0o644); err != nil {
		t.Fatalf("setup edit: %v", err)
	}
	// Jaga mtime berbeda supaya fingerprint pasti berubah di filesystem dengan
	// resolusi waktu kasar.
	now := time.Now()
	if err := os.Chtimes(libFile, now.Add(2*time.Second), now.Add(2*time.Second)); err != nil {
		t.Logf("chtimes gagal: %v", err)
	}
	fresh, err := app.LoadLibrary()
	if err != nil || len(fresh) != 1 || fresh[0].Title != "Diubah Luar" {
		t.Fatalf("cache tidak terinvalidate setelah file diubah dari luar: %+v err=%v", fresh, err)
	}
}

func TestHard_LibraryNormalizesLegacyAndRejectsOversize(t *testing.T) {
	app, tempDir := setupTestApp(t)
	libFile := filepath.Join(tempDir, "library.json")

	legacy := `{"games":[{"id":"l1","title":"Lama","thumbnail":"glib://thumb/a1b2.png"}]}`
	if err := os.WriteFile(libFile, []byte(legacy), 0o644); err != nil {
		t.Fatalf("setup: %v", err)
	}
	games, err := app.LoadLibrary()
	if err != nil || len(games) != 1 {
		t.Fatalf("load legacy: %v", err)
	}
	if games[0].Thumbnail != "/thumbnails/a1b2.png" {
		t.Errorf("normalisasi ref lama gagal: %q", games[0].Thumbnail)
	}

	// File raksasa dianggap rusak: diarsipkan, bukan membuat aplikasi ke-OOM.
	if err := os.WriteFile(libFile, []byte(`{"games":[]}`), 0o644); err != nil {
		t.Fatalf("setup huge: %v", err)
	}
	if err := os.Truncate(libFile, maxLibraryFileBytes+1); err != nil {
		t.Fatalf("setup truncate: %v", err)
	}
	app.mu.Lock()
	app.libraryFinger = "stale"
	app.libraryCache = []Game{{ID: "stale"}}
	app.libraryCached = true
	app.mu.Unlock()

	got, err := app.LoadLibrary()
	if err != nil || len(got) != 0 {
		t.Fatalf("library raksasa seharusnya dianggap kosong, dapat %d game err=%v", len(got), err)
	}
	entries, err := os.ReadDir(tempDir)
	if err != nil {
		t.Fatalf("baca folder data: %v", err)
	}
	archived := false
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), "library.json.rusak-") {
			archived = true
		}
	}
	if !archived {
		t.Errorf("library.json raksasa tidak diarsipkan ke .rusak-<ts>")
	}
}

func TestHard_WindowFitsScreenKeepsTitleBarVisible(t *testing.T) {
	// Kasus nyata: laptop 1920x1080 dengan scaling 125% -> layar logis 1536x864,
	// work area ~816px. Jendela setinggi 880px tidak muat dan Windows menggeser
	// bagian atas jendela keluar layar sehingga title bar (dan tombol close)
	// tidak terlihat sama sekali.
	cases := []struct {
		name           string
		dw, dh, sw, sh int
		wantW, wantH   int
	}{
		{"LayarLegaTetapAsli", 1400, 880, 2560, 1440, 1400, 880},
		{"Laptop1080pScale125", 1400, 880, 1536, 864, 1400, 784},
		{"Laptop1080pScale100", 1400, 880, 1920, 1080, 1400, 880},
		{"LayarKecil", 1400, 880, 1024, 600, 1008, 520},
		{"LayarTidakDiketahui", 1400, 880, 0, 0, 1400, 880},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			gotW, gotH := fitWindowSize(tc.dw, tc.dh, tc.sw, tc.sh)
			if gotW != tc.wantW || gotH != tc.wantH {
				t.Errorf("fitWindowSize(%dx%d pada layar %dx%d) = (%d,%d), ingin (%d,%d)",
					tc.dw, tc.dh, tc.sw, tc.sh, gotW, gotH, tc.wantW, tc.wantH)
			}
			if tc.sw > 0 && tc.sh > 0 {
				if gotH > tc.sh-taskbarAllowance-titleBarAllowance {
					t.Errorf("tinggi %d masih melebihi work area layar %d", gotH, tc.sh)
				}
				if gotW > tc.sw {
					t.Errorf("lebar %d melebihi lebar layar %d", gotW, tc.sw)
				}
			}
			if gotW <= 0 || gotH <= 0 {
				t.Errorf("ukuran harus positip, dapat %dx%d", gotW, gotH)
			}
		})
	}
}

func TestHard_OpenExternalRequiresHost(t *testing.T) {
	app, _ := setupTestApp(t)
	for _, bad := range []string{"https:///path", "http://", "//example.com/x", "mailto:a@b.c"} {
		if err := app.OpenExternal(bad); err == nil {
			t.Errorf("OpenExternal(%q) seharusnya ditolak", bad)
		}
	}
}

func TestHard_SteamImageDestValidation(t *testing.T) {
	app, _ := setupTestApp(t)

	ok := []string{
		"https://shared.akamai.steamstatic.com/store_item_assets/header.jpg",
		"https://cdn.cloudflare.steamstatic.com/steam/apps/271590/header.jpg",
		"https://store.steampowered.com/img/a.png",
	}
	for _, raw := range ok {
		if _, valid := app.steamImageDest("271590", raw); !valid {
			t.Errorf("URL Steam pende (%q) seharusnya diterima", raw)
		}
	}

	bad := []string{
		"http://shared.akamai.steamstatic.com/a.jpg",      // bukan https
		"https://evil.com/a.jpg",                          // host asing
		"https://notsteamstatic.com/a.jpg",                // suffix menipu
		"https://steamstatic.com.evil.net/a.jpg",          // host tempel
		"https://shared.akamai.steamstatic.com/shell.php", // ekstensi berbahaya
		"javascript:alert(1)",                             // bukan URL gambar
	}
	for _, raw := range bad {
		if got, valid := app.steamImageDest("271590", raw); valid {
			t.Errorf("URL berbahaya (%q) diterima: %q", raw, got)
		}
	}
}

func TestHard_ParseSysReqFallsBackToH4Format(t *testing.T) {
	app, _ := setupTestApp(t)

	// Format baru Steam: <h4><strong>Label:</strong> nilai</h4>
	h4 := `<h4><strong>Minimum:</strong></h4><h4><strong>OS:</strong> Windows 11 64-bit</h4>` +
		`<h4><strong>Processor:</strong> Ryzen 5 5600</h4><h4><strong>Memory:</strong> 16 GB RAM</h4>` +
		`<h4><strong>Graphics:</strong> RTX 3060</h4><h4><strong>Storage:</strong> 120 GB available space</h4>`
	specs := app.parseSysReq(h4)
	if specs.OS != "Windows 11 64-bit" || specs.CPU != "Ryzen 5 5600" || specs.RAM != "16 GB RAM" ||
		specs.GPU != "RTX 3060" || specs.Storage != "120 GB available space" {
		t.Fatalf("format h4 tidak terparse: %+v", specs)
	}

	// Format <li> lama tetap menang bila keduanya ada.
	both := `<li><strong>OS:</strong> Dari LI</li><h4><strong>OS:</strong> Dari H4</h4>`
	if got := app.parseSysReq(both).OS; got != "Dari LI" {
		t.Errorf("prioritas <li> hilang, dapat %q", got)
	}
}
