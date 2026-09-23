# SoftGame Library

A lightweight, portable digital game catalog application built with **Wails v2** (Go + Microsoft Edge WebView2) and modern vanilla web technologies (HTML5, CSS3, ES6).

SoftGame Library allows users to manage their game dan software catalog, view system requirements, auto-import game metadata from the Steam Store API, manage thumbnails locally, and quickly share or open download links (Google Drive).

---

## Architecture & Technology Stack

- **Backend**: Go 1.23+ powered by **Wails v2.16.0**
  - High performance, minimal memory footprint (~30–50 MB RAM vs ~150–200 MB in Electron).
  - Native Windows single-instance mutex (`com.daffa.softgamelibrary`) focusing existing window on subsequent launches.
  - Native runtime integration for file picker dialogs, system clipboard, and default browser launching.
  - Custom dynamic asset handler (`AssetServer.Handler`) serving local thumbnails securely from AppData.
- **Frontend**: Vanilla HTML5, CSS3, and JavaScript (ES6) in `renderer/`
  - Steam-inspired dark UI theme (`#171a21`, `#1b2838`, `#66c0f4`).
  - Epic Games style responsive grid card layout (`repeat(auto-fill, minmax(250px, 1fr))`).
  - Keyed incremental grid rendering: cards are reused (plus an element pool) instead of being rebuilt on every keystroke, so thumbnails are not re-decoded and the grid does not flicker while searching.
  - Cached lowercase search index per game, render passes coalesced to one per animation frame, and event delegation instead of per-render listeners.
  - `content-visibility: auto` on cards so the browser skips layout/paint of off-screen cards in large libraries.
  - Lightweight bridge shim (`wails-bridge.js`) interfacing UI events seamlessly with Go backend bindings.
  - Zero npm dependencies, bundlers, or heavy frontend frameworks.
- **Output**:
  - Portable standalone executable: `build/bin/SoftGameLibrary.exe` (~11.4 MB, below the 15 MB budget).
  - Windows installer: `build/bin/GameLibrary-Setup-<version>-amd64.exe` (~5.3 MB, LZMA, per-user install, Indonesian UI).

---

## Key Features

1. **Steam Store Auto-Import**:
   - Paste any public Steam game store link (e.g., `https://store.steampowered.com/app/271590/Grand_Theft_Auto_V/`).
   - Automatically retrieves game title, developer, release date, genres, and pricing.
   - Parses minimum and recommended system requirements (OS, CPU, RAM, GPU, DirectX, Network, Storage, Sound, Notes).
   - Automatically downloads and caches official Steam header banner images as local thumbnails.

2. **Full SoftGame Library Management (CRUD)**:
   - Add, edit, and delete game entries with comprehensive details.
   - Real-time title search and multi-criteria sorting (Terbaru, A-Z, Z-A).
   - Form input validation preventing invalid entries.

3. **Local Thumbnail Management**:
   - Native Windows file picker supporting PNG, JPG, JPEG, WEBP, GIF, SVG, and BMP images.
   - Unique hex-hashed filename storage in AppData with path-traversal protection.
   - Automatic thumbnail cleanup upon replacement or game deletion.

4. **One-Click Sharing & Browser Integration**:
   - Copy download links (Google Drive) directly to clipboard with toast notification feedback.
   - "Buka di Browser" button opens download links directly in the default Windows browser.

5. **Robust Data Persistence & Recovery**:
   - Atomic disk commits (`.tmp` write followed by rename) preventing database corruption during unexpected shutdowns.
   - Automatic corrupted database recovery with timestamped backups (`library.json.rusak-<timestamp>`) and fallback initialization.
   - In-memory parse cache keyed by file fingerprint (mtime + size), so opening the library does not re-read and re-parse the JSON on every call; external edits are still detected.

6. **Hardening**:
   - Single validated gateway (`safeThumbPath`) for every thumbnail read/write/delete: rejects separators, `..`, absolute paths, drive letters, null bytes, dot files, and any extension outside the image whitelist.
   - Downloaded and picked images are size-capped (25 MB) and content-checked; Steam image URLs must be HTTPS on trusted Valve hosts.
   - SVG responses carry `Content-Security-Policy: ... sandbox` and `X-Content-Type-Options: nosniff`, so a stored SVG cannot script against the app origin.
   - All field truncation is rune-safe, so multi-byte titles (CJK, accents, emoji) never turn into mojibake at the length limit.
   - Outbound HTTP requests run under a deadline tied to the window context, and `OpenExternal` validates via `url.Parse` (http/https with a host only).

---

## System Requirements

- **Operating System**: Windows 10 / Windows 11 (64-bit)
- **Web Engine**: Microsoft Edge WebView2 Evergreen Runtime (pre-installed on Windows 10/11)
- **Development & Compilation**:
  - Go 1.25 or newer (`go version`)
  - Wails v2 CLI 2.16.0 or newer (`wails version`)
  - NSIS 3.x only when building the installer (`makensis -VERSION`)

---

## Data Persistence Locations

SoftGame Library stores all user data in standard Windows Application Data directories:

- **Database**: `%APPDATA%\softgame-library\library.json`
- **Cached Thumbnails**: `%APPDATA%\softgame-library\thumbnails\`

Legacy thumbnail references (from prior Electron versions using `glib://thumb/*`) are automatically normalized to `/thumbnails/*` upon load.

---

## Development Workflow

To run the application in live-development mode with hot-reloading:

```powershell
# Ensure Go and Wails are in PATH
$env:PATH = "C:\Program Files\Go\bin;C:\Users\Daffa\go\bin;" + $env:PATH

# Start Wails dev server
wails dev
```

---

## Building the Portable Standalone Executable

To produce an optimized, standalone Windows 64-bit portable executable:

```powershell
# Set environment PATH
$env:PATH = "C:\Program Files\Go\bin;C:\Users\Daffa\go\bin;" + $env:PATH

# Compile with stripped symbols and trimmed paths
wails build -clean -ldflags "-s -w" -trimpath -o SoftGameLibrary.exe
```

The resulting binary will be output to:
```
build/bin/SoftGameLibrary.exe
```

### Build Verification & Metrics
- **Format**: Windows PE x64 standalone executable
- **Size**: ~11.4 MB (strictly < 15 MB)
- **Dependencies**: Uses system WebView2 runtime; no external DLLs or Node.js runtime required.

---

## Building the Windows Installer (NSIS)

The installer is produced by Wails' NSIS integration, so it packages the same
binary plus the WebView2 bootstrapper into a single setup executable.

Prerequisite (one-time): [NSIS 3.x](https://nsis.sourceforge.io/Download) must be
installed and `makensis` reachable. Installed via winget it lands in
`C:\Program Files (x86)\NSIS`, which is added to `PATH` by the installer itself:

```powershell
winget install -e --id NSIS.NSIS
```

Build portable exe **and** installer in one step:

```powershell
$env:PATH = "C:\Program Files\Go\bin;C:\Users\Daffa\go\bin;C:\Program Files (x86)\NSIS;" + $env:PATH

npm run installer
# sama dengan:
wails build -clean -platform windows/amd64 -trimpath -ldflags "-s -w" -o SoftGameLibrary.exe -nsis -installscope user
```

Output:

```
build/bin/GameLibrary-Setup-1.0.0-amd64.exe
```

Installer behaviour (defined in `build/windows/installer/project.nsi`):

- Indonesian wizard with an English fallback language.
- Branded wizard artwork: sidebar (164x314) and header (150x57) 24-bit BMPs are
  generated from `build/appicon.png` by `go run ./tools/gen-installer-images`
  (also wired into `npm run installer` and available as `npm run assets:installer`).
  NSIS rejects other formats/sizes, so regenerate after changing the app icon.
- **Per-user install** (`%LOCALAPPDATA%\Programs\SoftGame Library`) — no UAC prompt.
- Registers in *Apps & features* / `HKCU\...\Uninstall\GameLibrary`, creates Start
  Menu and Desktop shortcuts, and offers "Jalankan SoftGame Library sekarang".
- Installs the WebView2 Runtime automatically when the system lacks it.
- Uninstall removes program files and shortcuts but **keeps** the catalog in
  `%APPDATA%\softgame-library`, so a reinstall restores the collection.
- LZMA solid compression (~5.3 MB for a 11.4 MB executable).

Silent install / uninstall for testing:

```powershell
.\build\bin\GameLibrary-Setup-1.0.0-amd64.exe /S /D=C:\temp\gl
& "C:\temp\gl\uninstall.exe" /S
```

> `build/windows/installer/wails_tools.nsh` is regenerated by Wails on every
> build. Keep all customisation in `project.nsi`, before its `!include`.

---

## Testing & Quality Assurance

### Go Unit Tests
Run backend unit tests verifying library persistence, atomic writes, thumbnail routing, sysreq parsing, and Steam import logic:

```powershell
$env:PATH = "C:\Program Files\Go\bin;C:\Users\Daffa\go\bin;" + $env:PATH
go test -v ./...
```

### End-to-End (E2E) Test Suite
Run the automated multi-tier PowerShell verification suites:

```powershell
# Run all test tiers (Features, Boundaries, Combinations, Scenarios)
pwsh -File tests/e2e/run_tests.ps1
```

---

## Project Structure

```
c:\Users\Daffa\Desktop\Libray Game\
├── main.go                # Application entry point, Wails options & asset server
├── app.go                 # Models, App struct, lifecycle, HTTP client, guard-rail constants
├── library.go             # LoadLibrary / SaveLibrary, atomic write, parse cache, sample data
├── thumbnails.go          # Asset server handler, picker, deletion, path validation
├── steam.go               # Steam Store import, header image download, sysreq parsing
├── sanitize.go            # Field sanitisation, rune-safe truncation, UUID v4
├── system.go              # OpenExternal & CopyText (OS integration)
├── app_test.go            # Unit tests for Go backend services
├── app_stress_test.go     # Concurrency, capacity, and resilience stress tests
├── boundary_adversarial_test.go  # White-box adversarial edge cases
├── hardening_test.go      # Proofs for the refactor: UTF-8 safety, path isolation, cache
├── wails.json             # Wails v2 project configuration
├── go.mod / go.sum        # Go module definition & checksums
├── package.json           # Project metadata & build scripts (dev/test/build/installer)
├── build/
│   ├── appicon.png        # Source application icon
│   ├── bin/               # SoftGameLibrary.exe + GameLibrary-Setup-<ver>-amd64.exe (gitignored)
│   └── windows/
│       ├── icon.ico       # Windows application icon
│       ├── info.json      # Executable metadata configuration
│       ├── wails.exe.manifest # DPI awareness & Windows assembly manifest
│       └── installer/
│           ├── project.nsi    # NSIS installer script (Indonesian wizard, per-user scope)
│           └── wails_tools.nsh # Regenerated by Wails each build (do not hand-edit)
├── renderer/              # Vanilla frontend assets
│   ├── index.html         # Main UI layout & modal structures
│   ├── styles.css         # Steam dark theme & Epic Games grid styles
│   ├── app.js             # UI controller, keyed grid rendering, state management
│   ├── wails-bridge.js    # Shim translating window.api to window.go.main.App
│   └── assets/
│       └── logo.svg       # Vector application logo
└── tests/
    ├── e2e/               # Automated multi-tier verification test suite (Tiers 1-4)
    └── stress/            # Load & resilience PowerShell stress runners
```

---

## License

MIT License © 2026 Daffa.
