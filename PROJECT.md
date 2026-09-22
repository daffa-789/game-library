# Project: Game Library Migration (Electron to Wails v2)

## Architecture
- **Backend**: Go 1.23+ with Wails v2.16.0 framework.
  - `main.go`: Entry point, Wails options, single instance lock (`com.daffa.libraygame`), window sizing (1400x880, min 980x620), dark theme background `#171a21`, asset server configuration with dynamic thumbnail fallback handler.
  - `app.go`: Application struct `App`, lifecycle (`startup`, `RestoreWindow`), and 7 API methods exposed to frontend (`LoadLibrary`, `SaveLibrary`, `PickThumbnail`, `DeleteThumbnail`, `OpenExternal`, `CopyText`, `SteamImport`).
- **Data Persistence**:
  - `%APPDATA%\libray-game\library.json`: JSON database of games with atomic write (`.tmp` + `os.Rename`) and corrupted file backup (`.rusak-<timestamp>`).
  - `%APPDATA%\libray-game\thumbnails\`: Local directory for stored thumbnails, served dynamically to WebView2 via `AssetServer.Handler` on path `/thumbnails/*`.
- **Frontend**: Vanilla HTML5/CSS3/ES6 in `renderer/` (no bundler or npm dependencies).
  - `wails-bridge.js`: Shim mapping `window.api.*` calls to `window.go.main.App.*`.
  - `styles.css`: Steam dark theme, Epic Games grid layout, responsive design.
  - `app.js`: State management, search, sort, modals, game CRUD, thumbnail preview.
- **Packaging**: Portable Windows x64 executable compiled via `wails build -clean -ldflags "-s -w" -trimpath` to `build/bin/GameLibrary.exe` (< 15 MB).

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Wails v2 Project Configuration | `wails.json` setup with `renderer` frontend dir, `GameLibrary` output binary, metadata | M1 | ORIGINAL_REQUEST §R3 |
| 2 | Go Module & Manifest Setup | `go.mod`, `build/windows/info.json`, `build/windows/wails.exe.manifest`, app icons | M1 | ORIGINAL_REQUEST §R3 |
| 3 | Data Schema Compatibility | Structs for `Game`, `SpecsContainer`, `SystemSpecs` matching 100% of existing `library.json` | M1 | ORIGINAL_REQUEST §R1 |
| 4 | Atomic Library Persistence | `LoadLibrary` and `SaveLibrary` with `.tmp` write, rename, corrupt backup, sample data fallback | M1 | ORIGINAL_REQUEST §R1 |
| 5 | Dynamic Thumbnail Asset Server | `AssetServer.Handler` serving `%APPDATA%\libray-game\thumbnails\` on `/thumbnails/*` with path sanitization | M1 | ORIGINAL_REQUEST §R1 |
| 6 | Native Thumbnail Picker | `PickThumbnail` using Wails file dialog, copying image to AppData with hex filename | M1 | ORIGINAL_REQUEST §R1 |
| 7 | Thumbnail Deletion | `DeleteThumbnail` removing image file from AppData with path safety checks | M1 | ORIGINAL_REQUEST §R1 |
| 8 | Single Instance Lock | Windows mutex focusing existing window on secondary launch attempt | M1 | Survey (main.js parity) |
| 9 | External URL Browser Opener | `OpenExternal` opening HTTP/HTTPS URLs in Windows default browser via runtime | M2 | ORIGINAL_REQUEST §R1 |
| 10 | System Clipboard Text Copy | `CopyText` copying links to Windows clipboard via runtime | M2 | ORIGINAL_REQUEST §R1 |
| 11 | Steam Store API Client | `SteamImport` fetching `store.steampowered.com/api/appdetails` with custom User-Agent | M2 | ORIGINAL_REQUEST §R1 |
| 12 | Steam HTML SysReq Parser | Regex parser extracting 9 min/rec specs (`os`, `cpu`, `ram`, `gpu`, `dx`, `net`, `storage`, `sound`, `notes`) | M2 | ORIGINAL_REQUEST §R1 |
| 13 | Steam Thumbnail Downloader | Downloading Steam `header_image` to `%APPDATA%\libray-game\thumbnails\` and returning URL ref | M2 | ORIGINAL_REQUEST §R1 |
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

---

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| E2E | E2E Testing Track | Independent opaque-box test runner & suites (Tiers 1-4) published via `TEST_READY.md` | none | IN_PROGRESS |
| M1 | Backend Core & Persistence | `wails.json`, `go.mod`, `main.go`, `app.go` (`LoadLibrary`, `SaveLibrary`, `PickThumbnail`, `DeleteThumbnail`, `AssetServer.Handler`) | none | DONE |
| M2 | Utilities & Steam Import | `OpenExternal`, `CopyText`, `SteamImport` (API fetch, HTML spec parsing, image download) | M1 | DONE |
| M3 | Frontend Vanilla Integration | `wails-bridge.js`, `index.html`, `app.js` fixes, asset paths, UI event binding | M1, M2 | DONE |
| M4 | Portable Build & Cleanup | `wails build` < 15MB, prune `main.js`/`preload.js`/`dist/`, update `package.json` & `README.md` | M3 | IN_PROGRESS |
| M5 | Final E2E Pass & Hardening | 100% E2E test pass (Phase 1) + Adversarial hardening Tier 5 (Phase 2) + Forensic Audit | E2E, M4 | PLANNED |

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
- Library file: `%APPDATA%\libray-game\library.json`
- Thumbnails directory: `%APPDATA%\libray-game\thumbnails\`
- URL scheme in frontend: `/thumbnails/<filename>` (legacy `glib://thumb/<filename>` normalized on load)

---

## Code Layout
```
c:\Users\Daffa\Desktop\Libray Game\
├── go.mod
├── go.sum
├── wails.json
├── main.go
├── app.go
├── build/
│   ├── appicon.png
│   ├── bin/
│   │   └── GameLibrary.exe
│   └── windows/
│       ├── icon.ico
│       ├── info.json
│       └── wails.exe.manifest
├── renderer/
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   ├── wails-bridge.js
│   └── assets/
│       └── logo.svg
├── tests/
│   └── e2e/
│       ├── test_runner.ps1 (or .go)
│       ├── tier1_features/
│       ├── tier2_boundaries/
│       ├── tier3_combinations/
│       └── tier4_scenarios/
└── README.md
```
