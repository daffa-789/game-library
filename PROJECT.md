# Project: SoftGame Library Migration (Electron to Wails v2)

## Architecture
- **Backend**: Go 1.25+ with Wails v2.16.0 framework, split into focused files in `package main`:
  - `main.go`: Entry point, Wails options, single instance lock (`com.daffa.softgamelibrary`), window sizing (1400x880, min 980x620), dark theme background `#171a21`, asset server configuration with dynamic thumbnail fallback handler.
  - `app.go`: Data models, `App` struct, lifecycle (`startup`, `RestoreWindow`), shared `*http.Client` with connection pooling, guard-rail constants (max games, max file/thumbnail bytes, timeouts), image extension whitelist.
  - `library.go`: `LoadLibrary` / `SaveLibrary`, atomic write with retry, corrupt-file quarantine, in-memory parse cache keyed by file fingerprint, sample data.
  - `thumbnails.go`: AssetServer handler, `PickThumbnail`, `DeleteThumbnail`, and the single `safeThumbPath` validation gateway.
  - `steam.go`: `SteamImport`, header image download (host + size + content-type validated), `<li>`/`<h4>` system requirement parsing, rune-safe truncation.
  - `sanitize.go`: Field sanitisation with named length limits, UUID v4 generation.
  - `system.go`: `OpenExternal` (url.Parse scheme/host validation) and `CopyText`.
- **Data Persistence**:
  - `%APPDATA%\softgame-library\library.json`: JSON database of games with atomic write (`.tmp` + rename) and corrupted file backup (`.rusak-<timestamp>`).
  - `%APPDATA%\softgame-library\thumbnails\`: Local directory for stored thumbnails, served dynamically to WebView2 via `AssetServer.Handler` on path `/thumbnails/*`.
- **Frontend**: Vanilla HTML5/CSS3/ES6 in `renderer/` (no bundler or npm dependencies).
  - `wails-bridge.js`: Shim mapping `window.api.*` calls to `window.go.main.App.*`.
  - `styles.css`: Steam dark theme, Epic Games grid layout, responsive design, `content-visibility: auto` cards.
  - `app.js`: State management, search, sort, modals, game CRUD, thumbnail preview. Grid uses keyed reconciliation plus an element pool (cards are reused, not rebuilt), a cached lowercase search index, rAF-coalesced renders with a timeout fallback, and delegated events.
- **Packaging**:
  - Portable: `wails build -clean -trimpath -ldflags "-s -w"` → `build/bin/SoftGameLibrary.exe` (~11.4 MB).
  - Installer: `wails build ... -nsis -installscope user` → `build/bin/GameLibrary-Setup-<version>-amd64.exe` (~5.3 MB), scripted by `build/windows/installer/project.nsi` (Indonesian wizard, per-user scope, WebView2 bootstrapper, LZMA, catalog preserved on uninstall).

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Wails v2 Project Configuration | `wails.json` setup with `renderer` frontend dir, `GameLibrary` output binary, metadata | M1 | ORIGINAL_REQUEST §R3 |
| 2 | Go Module & Manifest Setup | `go.mod`, `build/windows/info.json`, `build/windows/wails.exe.manifest`, app icons | M1 | ORIGINAL_REQUEST §R3 |
| 3 | Data Schema Compatibility | Structs for `Game`, `SpecsContainer`, `SystemSpecs` matching 100% of existing `library.json` | M1 | ORIGINAL_REQUEST §R1 |
| 4 | Atomic Library Persistence | `LoadLibrary` and `SaveLibrary` with `.tmp` write, rename, corrupt backup, sample data fallback | M1 | ORIGINAL_REQUEST §R1 |
| 5 | Dynamic Thumbnail Asset Server | `AssetServer.Handler` serving `%APPDATA%\softgame-library\thumbnails\` on `/thumbnails/*` with path sanitization | M1 | ORIGINAL_REQUEST §R1 |
| 6 | Native Thumbnail Picker | `PickThumbnail` using Wails file dialog, copying image to AppData with hex filename | M1 | ORIGINAL_REQUEST §R1 |
| 7 | Thumbnail Deletion | `DeleteThumbnail` removing image file from AppData with path safety checks | M1 | ORIGINAL_REQUEST §R1 |
| 8 | Single Instance Lock | Windows mutex focusing existing window on secondary launch attempt | M1 | Survey (main.js parity) |
| 9 | External URL Browser Opener | `OpenExternal` opening HTTP/HTTPS URLs in Windows default browser via runtime | M2 | ORIGINAL_REQUEST §R1 |
| 10 | System Clipboard Text Copy | `CopyText` copying links to Windows clipboard via runtime | M2 | ORIGINAL_REQUEST §R1 |
| 11 | Steam Store API Client | `SteamImport` fetching `store.steampowered.com/api/appdetails` with custom User-Agent | M2 | ORIGINAL_REQUEST §R1 |
| 12 | Steam HTML SysReq Parser | Regex parser extracting 9 min/rec specs (`os`, `cpu`, `ram`, `gpu`, `dx`, `net`, `storage`, `sound`, `notes`) | M2 | ORIGINAL_REQUEST §R1 |
| 13 | Steam Thumbnail Downloader | Downloading Steam `header_image` to `%APPDATA%\softgame-library\thumbnails\` and returning URL ref | M2 | ORIGINAL_REQUEST §R1 |
| 14 | Frontend Wails API Shim | `renderer/wails-bridge.js` providing `window.api` interface to `window.go.main.App` | M3 | ORIGINAL_REQUEST §R2 |
| 15 | Frontend Asset & HTML Adaptation | Updating `index.html` for `wails-bridge.js` inclusion and fixing `logo.svg` relative path | M3 | ORIGINAL_REQUEST §R2 |
| 16 | Frontend Bug & Scheme Fix | Guarding `#f-thumburl` in `app.js:546` and updating thumbnail deletion check for `/thumbnails/` | M3 | Survey (frontend handoff) |
| 17 | Game Catalog UI Integrity | Preserving grid cards, hover effects, search, sort (Terbaru, A-Z, Z-A), and responsive layout | M3 | ORIGINAL_REQUEST §R2 |
| 18 | Add/Edit/Delete Game Modals | Full CRUD form integration with input validation and toast notifications | M3 | ORIGINAL_REQUEST §R2 |
| 19 | Steam Link UI Workflow | Steam Link button, URL modal, auto-fill pre-population of form, and status messages | M3 | ORIGINAL_REQUEST §R2 |
| 20 | Portable Build Compilation | Compiling standalone executable in `build/bin/` with size < 15 MB | M4 | ORIGINAL_REQUEST §R3 |
| 21 | Electron Files Cleanup | Pruning `main.js`, `preload.js`, `dist/`, obsolete devDependencies, and node_modules | M4 | ORIGINAL_REQUEST §R3 |
| 22 | Project Documentation Update | Updating `README.md` with Wails v2 build, run, and dev instructions | M4 | ORIGINAL_REQUEST §R3 |
| 23 | E2E Test Suite Validation | 100% pass across all 4 tiers of opaque-box E2E tests | M5 | Acceptance Criteria |
| 24 | Adversarial Hardening (Tier 5) | White-box edge case testing and robustness verification | M5 | Acceptance Criteria |
| 25 | Backend Module Split | `app.go` divided into `app.go`/`library.go`/`thumbnails.go`/`steam.go`/`sanitize.go`/`system.go` with unchanged `window.api` contract | M6 | Optimisation pass |
| 26 | Path & Input Hardening | Single `safeThumbPath` gateway, image extension whitelist, size caps, trusted Steam image hosts, SVG sandbox headers, rune-safe truncation | M6 | Optimisation pass |
| 27 | Library Parse Cache | mtime+size fingerprint cache, batched timestamps, encoder-based JSON writes | M6 | Optimisation pass |
| 28 | Frontend Render Optimisation | Keyed grid reconciliation + element pool, cached search index, rAF-coalesced render with timeout fallback, delegated detail events, `content-visibility` cards | M6 | Optimisation pass |
| 29 | Windows Installer (NSIS) | `GameLibrary-Setup-<ver>-amd64.exe`: Indonesian wizard, per-user scope, WebView2 bootstrapper, LZMA, catalog preserved on uninstall | M6 | ORIGINAL_REQUEST (installer exe) |
| 30 | Build Script Surface | `npm run dev/test/build/installer` with `-trimpath -ldflags "-s -w"` | M6 | ORIGINAL_REQUEST (installer exe) |

---

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| E2E | E2E Testing Track | Independent opaque-box test runner & suites (Tiers 1-4) published via `TEST_READY.md` | none | DONE |
| M1 | Backend Core & Persistence | `wails.json`, `go.mod`, `main.go`, `app.go` (`LoadLibrary`, `SaveLibrary`, `PickThumbnail`, `DeleteThumbnail`, `AssetServer.Handler`) | none | DONE |
| M2 | Utilities & Steam Import | `OpenExternal`, `CopyText`, `SteamImport` (API fetch, HTML spec parsing, image download) | M1 | DONE |
| M3 | Frontend Vanilla Integration | `wails-bridge.js`, `index.html`, `app.js` fixes, asset paths, UI event binding | M1, M2 | DONE |
| M4 | Portable Build & Cleanup | `wails build` < 15MB, prune `main.js`/`preload.js`/`dist/`, update `package.json` & `README.md` | M3 | DONE |
| M5 | Final E2E Pass & Hardening | 100% E2E test pass (Phase 1) + Adversarial hardening Tier 5 (Phase 2) + Forensic Audit | E2E, M4 | DONE |
| M6 | Optimisation & Installer | Backend module split, path/input hardening, parse cache, keyed grid rendering, NSIS per-user installer + build scripts | M5 | DONE |

---

## Interface Contracts

### Frontend ↔ Go Backend Contract (`window.api` ↔ `window.go.main.App`)
```typescript
interface SystemSpecs {
  os: string;
  cpu: string;
  ram: string;
  gpu: string;
  dx: string;
  net: string;
  storage: string;
  sound: string;
  notes: string;
}

interface SpecsContainer {
  min: SystemSpecs;
  rec: SystemSpecs;
}

interface Game {
  id: string;
  title: string;
  thumbnail: string;
  link: string;
  genre: string;
  size: string;
  price: string;
  steamAppId: string;
  specs: SpecsContainer;
  createdAt: string;
  updatedAt: string;
}

interface SteamImportResult {
  appId: string;
  title: string;
  thumbnail: string;
  genre: string;
  developer: string;
  releaseDate: string;
  price: string;
  specs: SpecsContainer;
}

// Backend API exposed on window.go.main.App and bridged to window.api
interface BackendAPI {
  LoadLibrary(): Promise<Game[]>;
  SaveLibrary(games: Game[]): Promise<void>;
  PickThumbnail(): Promise<string>; // returns "/thumbnails/<hex>.<ext>" or ""
  DeleteThumbnail(ref: string): Promise<void>;
  OpenExternal(url: string): Promise<void>;
  CopyText(text: string): Promise<void>;
  SteamImport(url: string): Promise<SteamImportResult>;
}
```

### Storage Contract
- Library file: `%APPDATA%\softgame-library\library.json`
- Thumbnails directory: `%APPDATA%\softgame-library\thumbnails\`
- URL scheme in frontend: `/thumbnails/<filename>` (legacy `glib://thumb/<filename>` normalized on load)

---

## Code Layout
```
c:\Users\Daffa\Desktop\Libray Game\
├── go.mod / go.sum
├── wails.json
├── package.json                 # npm run dev | test | build | installer
├── main.go                      # Wails bootstrap & options
├── app.go                       # Models, App struct, lifecycle, HTTP client, limits
├── library.go                   # Persistence: load/save, atomic write, parse cache
├── thumbnails.go                # Asset handler, picker, deletion, safeThumbPath
├── steam.go                     # Steam import, image download, sysreq parsing
├── sanitize.go                  # Field sanitisation, UUID v4, rune-safe truncation
├── system.go                    # OpenExternal, CopyText
├── app_test.go                  # Unit tests (9)
├── app_stress_test.go           # Stress/concurrency tests (12)
├── boundary_adversarial_test.go # Adversarial white-box tests (7)
├── hardening_test.go            # Refactor proof tests (10)
├── build/
│   ├── appicon.png
│   ├── bin/                     # SoftGameLibrary.exe, GameLibrary-Setup-<ver>-amd64.exe
│   └── windows/
│       ├── icon.ico
│       ├── info.json
│       ├── wails.exe.manifest
│       └── installer/
│           ├── project.nsi      # Installer script (customise here)
│           ├── wails_tools.nsh  # Regenerated by Wails; do not edit
│           └── resources/       # sidebar.bmp + header.bmp (generated)
├── tools/
│   └── gen-installer-images/    # NSIS wizard artwork generator (stdlib only)
├── renderer/
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   ├── wails-bridge.js
│   └── assets/logo.svg
└── tests/
    ├── e2e/                     # Tiers 1-4 (161 assertions), test_utils.ps1
    └── stress/                  # Load & resilience runners
```
