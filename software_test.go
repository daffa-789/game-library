package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"unicode/utf8"
)

// ---------------------------------------------------------------------------
// Katalog software (tab "Software"): persistence, skema JSON tanpa spesifikasi,
// dan migrasi dari dua aplikasi lama.
// ---------------------------------------------------------------------------

func readRawLibrary(t *testing.T, tempDir string) string {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join(tempDir, "library.json"))
	if err != nil {
		t.Fatalf("baca library.json: %v", err)
	}
	return string(raw)
}

func TestLoadSoftware_SampleDataHasNoSpecs(t *testing.T) {
	app, tempDir := setupTestApp(t)

	items, err := app.LoadSoftware()
	if err != nil {
		t.Fatalf("LoadSoftware gagal: %v", err)
	}
	if len(items) != 3 {
		t.Fatalf("expected 3 sample software, got %d", len(items))
	}
	if items[0].Title == "" || items[0].Category == "" || items[0].Link == "" {
		t.Errorf("data contoh software tidak lengkap: %+v", items[0])
	}

	// Katalog game tetap dibuat beriringan dalam satu file.
	games, err := app.LoadLibrary()
	if err != nil || len(games) != 2 {
		t.Fatalf("katalog game contoh hilang saat software dibuat: %d games err=%v", len(games), err)
	}

	raw := readRawLibrary(t, tempDir)
	if !strings.Contains(raw, `"software"`) || !strings.Contains(raw, `"games"`) {
		t.Errorf("library.json harus memuat kedua katalog, dapat: %s", raw)
	}

	// "specs" memang boleh muncul di file — tapi hanya sebagai milik game.
	// Bentuk JSON entri software tidak boleh punya kunci spesifikasi apa pun.
	var shape struct {
		Software []map[string]json.RawMessage `json:"software"`
	}
	if err := json.Unmarshal([]byte(raw), &shape); err != nil {
		t.Fatalf("bentuk JSON tidak terbaca: %v", err)
	}
	for _, entry := range shape.Software {
		for _, banned := range []string{"requirements", "specs", "cpu", "ram", "gpu"} {
			if _, ok := entry[banned]; ok {
				t.Errorf("entri software tidak boleh punya field %q, dapat kunci: %v", banned, keysOf(entry))
			}
		}
	}
}

func keysOf(m map[string]json.RawMessage) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}

func TestSaveSoftware_KeepsGamesIntact(t *testing.T) {
	app, _ := setupTestApp(t)

	if _, err := app.LoadLibrary(); err != nil {
		t.Fatalf("load awal: %v", err)
	}
	before, err := app.LoadLibrary()
	if err != nil || len(before) != 2 {
		t.Fatalf("setup: %d games err=%v", len(before), err)
	}

	if err := app.SaveSoftware([]Software{{Title: "App A", Link: "https://drive.example/a"}}); err != nil {
		t.Fatalf("SaveSoftware: %v", err)
	}

	after, err := app.LoadLibrary()
	if err != nil || len(after) != 2 {
		t.Fatalf("menyimpan software tidak boleh mengubah katalog game: %d err=%v", len(after), err)
	}
	if after[0].ID != before[0].ID || after[0].Title != before[0].Title {
		t.Errorf("game pertama berubah: %+v", after[0])
	}
}

func TestSaveLibrary_KeepsSoftwareIntact(t *testing.T) {
	app, _ := setupTestApp(t)

	if err := app.SaveSoftware([]Software{{Title: "App B", Link: "https://drive.example/b"}}); err != nil {
		t.Fatalf("SaveSoftware: %v", err)
	}
	if err := app.SaveLibrary([]Game{{Title: "Game C", Link: "https://drive.example/c"}}); err != nil {
		t.Fatalf("SaveLibrary: %v", err)
	}

	items, err := app.LoadSoftware()
	if err != nil || len(items) != 1 || items[0].Title != "App B" {
		t.Fatalf("menyimpan game tidak boleh mengubah katalog software: %+v err=%v", items, err)
	}
}

func TestSaveSoftware_SanitizesIDsAndLimits(t *testing.T) {
	app, _ := setupTestApp(t)

	long := strings.Repeat("é", 400)
	items := []Software{{Title: long, Link: long, Website: long, Version: strings.Repeat("1", 300)}}
	if err := app.SaveSoftware(items); err != nil {
		t.Fatalf("SaveSoftware: %v", err)
	}

	loaded, err := app.LoadSoftware()
	if err != nil || len(loaded) != 1 {
		t.Fatalf("load setelah simpan: %d err=%v", len(loaded), err)
	}
	saved := loaded[0]
	if saved.ID == "" {
		t.Errorf("ID kosong seharusnya diisi otomatis")
	}
	if saved.CreatedAt == "" || saved.UpdatedAt == "" {
		t.Errorf("timestamp harus terisi: %+v", saved)
	}
	if len(saved.Title) > maxLenTitle || !utf8.ValidString(saved.Title) {
		t.Errorf("Title tidak terpotong aman: %d byte", len(saved.Title))
	}
	if len(saved.Version) > maxLenVersion {
		t.Errorf("Version tidak dipotong ke %d byte, dapat %d", maxLenVersion, len(saved.Version))
	}
}

func TestSaveSoftware_CapsBatchSize(t *testing.T) {
	app, _ := setupTestApp(t)

	items := make([]Software, maxSoftware+10)
	for i := range items {
		items[i] = Software{ID: "cap", Title: "x", Link: "y"}
	}
	if err := app.SaveSoftware(items); err != nil {
		t.Fatalf("SaveSoftware: %v", err)
	}
	loaded, err := app.LoadSoftware()
	if err != nil || len(loaded) != maxSoftware {
		t.Fatalf("batch harus dipotong ke maxSoftware, dapat %d err=%v", len(loaded), err)
	}
}

// ---------------------------------------------------------------------------
// Migrasi dari dua aplikasi lama
// ---------------------------------------------------------------------------

func writeLegacyFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", filepath.Dir(path), err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("tulis %s: %v", path, err)
	}
}

func TestBootstrap_MergesLegacyGameAndSoftwareCatalogs(t *testing.T) {
	cfg := t.TempDir()
	writeLegacyFile(t, filepath.Join(cfg, appDataDirName, "placeholder.txt"), "jangan dihapus")

	writeLegacyFile(t, filepath.Join(cfg, "libray-game", "library.json"),
		`{"games":[{"id":"g1","title":"Game Lama","thumbnail":"glib://thumb/old.png","specs":{"min":{"os":"Windows 10"}}}]}`)
	writeLegacyFile(t, filepath.Join(cfg, "libray-game", "thumbnails", "old.png"), "DATA-LAMA")

	// Software lama masih menyimpan blok "requirements": field itu tidak ada di
	// struct Software, jadi otomatis hilang saat diserap ke katalog gabungan.
	writeLegacyFile(t, filepath.Join(cfg, "software-library", "library.json"),
		`{"software":[{"id":"s1","title":"Sw Lama","link":"https://drive.example/s1","website":"https://example.com","thumbnail":"slib://thumb/sw.png","requirements":{"min":{"ram":"8 GB"}}}]}`)
	writeLegacyFile(t, filepath.Join(cfg, "software-library", "thumbnails", "sw.png"), "SW-IMG")

	app := newAppWithDataDir(filepath.Join(cfg, appDataDirName))
	app.legacyDirs = legacyDataDirs(cfg)

	games, err := app.LoadLibrary()
	if err != nil || len(games) != 1 || games[0].Title != "Game Lama" {
		t.Fatalf("game lama tidak termigrasi: %+v err=%v", games, err)
	}
	if games[0].Thumbnail != "/thumbnails/old.png" {
		t.Errorf("prefix glib:// tidak dinormalisasi: %q", games[0].Thumbnail)
	}
	if games[0].Specs.Min.OS != "Windows 10" {
		t.Errorf("spesifikasi game harus ikut termigrasi: %+v", games[0].Specs)
	}

	items, err := app.LoadSoftware()
	if err != nil || len(items) != 1 || items[0].Title != "Sw Lama" {
		t.Fatalf("software lama tidak termigrasi: %+v err=%v", items, err)
	}
	if items[0].Thumbnail != "/thumbnails/sw.png" {
		t.Errorf("prefix slib:// tidak dinormalisasi: %q", items[0].Thumbnail)
	}

	raw := readRawLibrary(t, filepath.Join(cfg, appDataDirName))
	if !strings.Contains(raw, "Game Lama") || !strings.Contains(raw, "Sw Lama") {
		t.Errorf("hasil migrasi tidak tersimpan: %s", raw)
	}
	if strings.Contains(raw, "requirements") || strings.Contains(raw, "8 GB") {
		t.Errorf("spesifikasi software tidak boleh ikut tersimpan: %s", raw)
	}

	// Thumbnail dari kedua aplikasi lama ikut disalin, dan sumber aslinya
	// tidak pernah disentuh (masih bisa dipakai bila user kembali ke build lama).
	for _, pair := range []struct{ dir, file, want string }{
		{appDataDirName, "old.png", "DATA-LAMA"},
		{appDataDirName, "sw.png", "SW-IMG"},
		{"libray-game", "old.png", "DATA-LAMA"},
		{"software-library", "sw.png", "SW-IMG"},
	} {
		got, err := os.ReadFile(filepath.Join(cfg, pair.dir, "thumbnails", pair.file))
		if err != nil || string(got) != pair.want {
			t.Errorf("thumbnail %s/%s hilang: %v (%q)", pair.dir, pair.file, err, got)
		}
	}
}

func TestBootstrap_LegacyThumbNameCollisionKeepsFirst(t *testing.T) {
	cfg := t.TempDir()
	writeLegacyFile(t, filepath.Join(cfg, "libray-game", "library.json"),
		`{"games":[{"id":"g1","title":"G","thumbnail":"old.png"}]}`)
	writeLegacyFile(t, filepath.Join(cfg, "libray-game", "thumbnails", "old.png"), "DARI-GAME")
	writeLegacyFile(t, filepath.Join(cfg, "software-library", "library.json"),
		`{"software":[{"id":"s1","title":"S","thumbnail":"old.png"}]}`)
	writeLegacyFile(t, filepath.Join(cfg, "software-library", "thumbnails", "old.png"), "DARI-SW")

	app := newAppWithDataDir(filepath.Join(cfg, appDataDirName))
	app.legacyDirs = legacyDataDirs(cfg)
	if _, err := app.LoadSoftware(); err != nil {
		t.Fatalf("LoadSoftware: %v", err)
	}

	got, err := os.ReadFile(filepath.Join(app.thumbsDir, "old.png"))
	if err != nil {
		t.Fatalf("thumbnail hasil migrasi tidak ada: %v", err)
	}
	if string(got) != "DARI-GAME" {
		t.Errorf("nama file yang bentrok harus memakai yang pertama: %q", got)
	}
}

func TestBootstrap_NoLegacyDataFallsBackToSamples(t *testing.T) {
	app, tempDir := setupTestApp(t)
	app.legacyDirs = legacyDataDirs(t.TempDir()) // folder kosong, tidak ada apa pun

	games, err := app.LoadLibrary()
	if err != nil || len(games) != 2 {
		t.Fatalf("data contoh game tidak dibuat: %d err=%v", len(games), err)
	}
	items, err := app.LoadSoftware()
	if err != nil || len(items) != 3 {
		t.Fatalf("data contoh software tidak dibuat: %d err=%v", len(items), err)
	}
	if _, err := os.Stat(filepath.Join(tempDir, "library.json")); err != nil {
		t.Errorf("library.json seharusnya ditulis: %v", err)
	}
}

// ---------------------------------------------------------------------------
// ImportSoftware: metadata halaman resmi, TANPA kebutuhan sistem
// ---------------------------------------------------------------------------

const softwarePage = `<!DOCTYPE html><html><head>
<title>Super Retouch Pro | VendorX</title>
<meta property="og:title" content="Super Retouch Pro 2025">
<meta property="og:description" content="Photo editor for Windows and macOS with free trial. Version: 26.1.0">
<meta property="og:site_name" content="VendorX">
<meta name="keywords" content="graphic design, photo editor">
<meta property="og:image" content="%s">
</head><body>
<h1>System Requirements</h1>
<p>Operating System: Windows 10 (64-bit)</p>
<p>Memory: 8 GB RAM</p>
<p>Graphics: NVIDIA GTX 1050</p>
<script>var notMetadata = "Version: 99.99.99";</script>
</body></html>`

func TestImportSoftware_ParsesMetadataAndImage(t *testing.T) {
	app, _ := setupTestApp(t)

	var pageHTML string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/logo.png" {
			w.Header().Set("Content-Type", "image/png")
			_, _ = w.Write([]byte("\x89PNG\r\n\x1a\nfake-png-bytes"))
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(pageHTML))
	}))
	defer srv.Close()
	pageHTML = fmt.Sprintf(softwarePage, srv.URL+"/logo.png")

	res, err := app.ImportSoftware(srv.URL)
	if err != nil {
		t.Fatalf("ImportSoftware: %v", err)
	}
	if res.Title != "Super Retouch Pro 2025" {
		t.Errorf("og:title tidak dipakai: %q", res.Title)
	}
	if res.Category != "Desain Grafis" {
		t.Errorf("kategori salah tebak: %q", res.Category)
	}
	if res.License != "Trial" {
		t.Errorf("lisensi salah tebak: %q", res.License)
	}
	if res.Version != "26.1.0" {
		t.Errorf("versi salah ambil: %q", res.Version)
	}
	if !strings.Contains(res.Platform, "Windows") || !strings.Contains(res.Platform, "macOS") {
		t.Errorf("platform salah tebak: %q", res.Platform)
	}
	if res.Website == "" {
		t.Errorf("website seharusnya terisi dari URL sumber")
	}
	if !strings.HasPrefix(res.Thumbnail, thumbURLPrefix) {
		t.Fatalf("gambar tidak terunduh: %q", res.Thumbnail)
	}
	if _, err := os.Stat(filepath.Join(app.thumbsDir, strings.TrimPrefix(res.Thumbnail, thumbURLPrefix))); err != nil {
		t.Errorf("file thumbnail tidak ada di disk: %v", err)
	}

	// Metadata teks dari blok "System Requirements" tidak boleh ikut terbawa:
	// hasil di atas memang tidak punya field untuk itu, dan bentuk JSON-nya pun
	// tidak akan pernah punya kunci requirements.
	body, err := json.Marshal(res)
	if err != nil {
		t.Fatalf("marshal hasil impor: %v", err)
	}
	if strings.Contains(string(body), "requirements") || strings.Contains(string(body), "8 GB") {
		t.Errorf("hasil impor masih membawa kebutuhan sistem: %s", body)
	}
}

func TestImportSoftware_RejectsBadInput(t *testing.T) {
	app, _ := setupTestApp(t)

	if _, err := app.ImportSoftware("   "); err == nil {
		t.Errorf("URL kosong seharusnya ditolak")
	}
	if _, err := app.ImportSoftware("ftp://example.com/app"); err == nil {
		t.Errorf("skema non-http seharusnya ditolak")
	}
	if _, err := app.ImportSoftware("https://user:pass@example.com/app"); err == nil {
		t.Errorf("URL dengan kredensial seharusnya ditolak")
	}
}

func TestImportSoftware_ReportsServerErrors(t *testing.T) {
	app, _ := setupTestApp(t)

	for _, code := range []int{http.StatusNotFound, http.StatusForbidden} {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(code)
		}))
		_, err := app.ImportSoftware(srv.URL)
		srv.Close()
		if err == nil {
			t.Errorf("HTTP %d seharusnya menghasilkan pesan error", code)
			continue
		}
		if !strings.Contains(err.Error(), fmt.Sprintf("%d", code)) {
			t.Errorf("pesan error seharusnya menyebut kode status: %q", err.Error())
		}
	}
}

func TestImportSoftware_StillWorksWithoutImage(t *testing.T) {
	app, _ := setupTestApp(t)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		// og:image menunjuk ke host yang tidak menerima koneksi: gambar gagal
		// diambil, tapi impor metadata harus tetap jalan.
		_, _ = w.Write([]byte(`<html><head>
<meta property="og:title" content="Plain Utility">
<meta property="og:image" content="http://127.0.0.1:1/nope.png">
</head><body>free download for windows</body></html>`))
	}))
	defer srv.Close()

	res, err := app.ImportSoftware(srv.URL)
	if err != nil {
		t.Fatalf("impor tanpa gambar seharusnya tetap sukses: %v", err)
	}
	if res.Title != "Plain Utility" || res.Thumbnail != "" {
		t.Errorf("hasil tidak seperti diharapkan: %+v", res)
	}
}
