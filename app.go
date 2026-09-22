package main

import (
	"context"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// ---------------------------------------------------------------------------
// Konstanta batas (guard rails) — semua nilai dipakai bersama oleh layer
// persistensi, thumbnail, dan impor Steam.
// ---------------------------------------------------------------------------

const (
	// appDataDirName nama folder data di %APPDATA% (jangan diubah: kompatibel
	// dengan library.json hasil migrasi Electron).
	appDataDirName = "libray-game"

	// maxGames batas jumlah game yang disimpan ke disk.
	maxGames = 5000

	// maxLibraryFileBatas ukuran maksimum library.json yang mau dibaca.
	// File di atas ini dianggap rusak supaya app tidak ke-habisan memori.
	maxLibraryFileBytes = 64 << 20 // 64 MiB

	// maxThumbnailBytes ukuran maksimum satu file thumbnail (unduh / impor).
	maxThumbnailBytes = 25 << 20 // 25 MiB

	steamAPITimeout   = 15 * time.Second
	steamImageTimeout = 45 * time.Second
	steamUserAgent    = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) GameLibrary/1.0"
	thumbCacheMaxAge  = 86400
)

// allowedThumbExt whitelist ekstensi gambar yang boleh disimpan di folder
// thumbnails dan disajikan lewat AssetServer. Mencegah file berbahaya
// (mis. .exe, .html) masuk ke origin aplikasi.
var allowedThumbExt = map[string]bool{
	".png": true, ".jpg": true, ".jpeg": true, ".webp": true,
	".gif": true, ".svg": true, ".bmp": true, ".ico": true,
}

// ---------------------------------------------------------------------------
// Data Models (100% kompatibel dengan library.json lama)
// ---------------------------------------------------------------------------

type SystemSpecs struct {
	OS      string `json:"os"`
	CPU     string `json:"cpu"`
	RAM     string `json:"ram"`
	GPU     string `json:"gpu"`
	DX      string `json:"dx"`
	Net     string `json:"net"`
	Storage string `json:"storage"`
	Sound   string `json:"sound"`
	Notes   string `json:"notes"`
}

type SpecsContainer struct {
	Min SystemSpecs `json:"min"`
	Rec SystemSpecs `json:"rec"`
}

type Game struct {
	ID         string         `json:"id"`
	Title      string         `json:"title"`
	Thumbnail  string         `json:"thumbnail"`
	Link       string         `json:"link"`
	Genre      string         `json:"genre"`
	Size       string         `json:"size"`
	Price      string         `json:"price"`
	SteamAppID string         `json:"steamAppId"`
	Specs      SpecsContainer `json:"specs"`
	CreatedAt  string         `json:"createdAt"`
	UpdatedAt  string         `json:"updatedAt"`
}

type LibraryFile struct {
	Games []Game `json:"games"`
}

type SteamImportResult struct {
	AppID       string         `json:"appId"`
	Title       string         `json:"title"`
	Thumbnail   string         `json:"thumbnail"`
	Genre       string         `json:"genre"`
	Developer   string         `json:"developer"`
	ReleaseDate string         `json:"releaseDate"`
	Price       string         `json:"price"`
	Specs       SpecsContainer `json:"specs"`
}

// ---------------------------------------------------------------------------
// App Struct & Lifecycle
// ---------------------------------------------------------------------------

type App struct {
	ctx context.Context

	dataDir   string
	dataFile  string
	thumbsDir string

	// mu melindungi file library + cache di bawahnya (bukan field lain).
	mu sync.Mutex
	// libraryCache menyimpan hasil parse terakhir supaya LoadLibrary tidak
	// selalu membaca + unmarshal file dari disk. invalidate() dipanggil setiap
	// kali file ditulis ulang; fingerprint file tetap dicek untuk mendeteksi
	// perubahan dari luar aplikasi.
	libraryCache  []Game
	libraryFinger string
	libraryCached bool

	client *http.Client
}

func NewApp() *App {
	configDir, err := os.UserConfigDir()
	if err != nil || configDir == "" {
		configDir = os.Getenv("APPDATA")
		if configDir == "" {
			configDir = "."
		}
	}
	return newAppWithDataDir(filepath.Join(configDir, appDataDirName))
}

func newAppWithDataDir(dataDir string) *App {
	a := &App{
		dataDir:   dataDir,
		dataFile:  filepath.Join(dataDir, "library.json"),
		thumbsDir: filepath.Join(dataDir, "thumbnails"),
		client:    newHTTPClient(steamAPITimeout),
	}
	_ = os.MkdirAll(a.thumbsDir, 0o755)
	return a
}

// newHTTPClient membuat client dengan connection pool yang layak. Timeout bisa
// dioverride per-request lewat context (dipakai untuk unduh gambar yang lebih
// panjang timeout-nya daripada panggilan API).
func newHTTPClient(timeout time.Duration) *http.Client {
	return &http.Client{
		Timeout: timeout,
		Transport: &http.Transport{
			Proxy:                 http.ProxyFromEnvironment,
			DialContext:           (&net.Dialer{Timeout: 10 * time.Second, KeepAlive: 30 * time.Second}).DialContext,
			ForceAttemptHTTP2:     true,
			MaxIdleConns:          16,
			MaxIdleConnsPerHost:   6,
			IdleConnTimeout:       90 * time.Second,
			TLSHandshakeTimeout:   10 * time.Second,
			ExpectContinueTimeout: time.Second,
		},
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return http.ErrUseLastResponse
			}
			return nil
		},
	}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// requestCtx memakai context jendela Wails bila sudah tersedia, sehingga semua
// request outbound ikut dibatalkan saat aplikasi ditutup.
func (a *App) requestCtx(timeout time.Duration) (context.Context, context.CancelFunc) {
	parent := a.ctx
	if parent == nil {
		parent = context.Background()
	}
	return context.WithTimeout(parent, timeout)
}

// RestoreWindow dipanggil ketika instance kedua mencoba dibuka: tampilkan
// jendela yang sudah ada alih-alih menjalankan aplikasi kedua.
func (a *App) RestoreWindow() {
	if a.ctx == nil {
		return
	}
	runtime.WindowUnminimise(a.ctx)
	runtime.Show(a.ctx)
}
