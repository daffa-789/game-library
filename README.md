# Game Library

A lightweight, portable digital game catalog application built with **Wails v2** (Go + Microsoft Edge WebView2) and modern vanilla web technologies (HTML5, CSS3, ES6).

Game Library allows users to manage their game collection, view system requirements, auto-import game metadata from the Steam Store API, manage thumbnails locally, and quickly share or open download links (Google Drive).

---

## Architecture & Technology Stack

- **Backend**: Go 1.23+ powered by **Wails v2.16.0**
  - High performance, minimal memory footprint (~30–50 MB RAM vs ~150–200 MB in Electron).
  - Native Windows single-instance mutex (`com.daffa.libraygame`) focusing existing window on subsequent launches.
  - Native runtime integration for file picker dialogs, system clipboard, and default browser launching.
  - Custom dynamic asset handler (`AssetServer.Handler`) serving local thumbnails securely from AppData.
- **Frontend**: Vanilla HTML5, CSS3, and JavaScript (ES6) in `renderer/`
  - Steam-inspired dark UI theme (`#171a21`, `#1b2838`, `#66c0f4`).
  - Epic Games style responsive grid card layout (`repeat(auto-fill, minmax(250px, 1fr))`).
  - Lightweight bridge shim (`wails-bridge.js`) interfacing UI events seamlessly with Go backend bindings.
  - Zero npm dependencies, bundlers, or heavy frontend frameworks.
- **Output**: Single portable standalone executable in `build/bin/GameLibrary.exe` (~11.41 MB, well below the 15 MB limit).

---

## Key Features

1. **Steam Store Auto-Import**:
   - Paste any public Steam game store link (e.g., `https://store.steampowered.com/app/271590/Grand_Theft_Auto_V/`).
   - Automatically retrieves game title, developer, release date, genres, and pricing.
   - Parses minimum and recommended system requirements (OS, CPU, RAM, GPU, DirectX, Network, Storage, Sound, Notes).
   - Automatically downloads and caches official Steam header banner images as local thumbnails.

2. **Full Game Library Management (CRUD)**:
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
   - Atomic disk commits (`.tmp` write followed by `os.Rename`) preventing database corruption during unexpected shutdowns.
   - Automatic corrupted database recovery with timestamped backups (`library.json.rusak-<timestamp>`) and fallback initialization.

---

## System Requirements

- **Operating System**: Windows 10 / Windows 11 (64-bit)
- **Web Engine**: Microsoft Edge WebView2 Evergreen Runtime (pre-installed on Windows 10/11)
- **Development & Compilation**:
  - Go 1.23 or newer (`go version`)
  - Wails v2 CLI 2.16.0 or newer (`wails version`)

---

## Data Persistence Locations

Game Library stores all user data in standard Windows Application Data directories:

- **Database**: `%APPDATA%\libray-game\library.json`
- **Cached Thumbnails**: `%APPDATA%\libray-game\thumbnails\`

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
wails build -clean -ldflags "-s -w" -trimpath -o GameLibrary.exe
```

The resulting binary will be output to:
```
build/bin/GameLibrary.exe
```

### Build Verification & Metrics
- **Format**: Windows PE x64 standalone executable
- **Size**: ~11.41 MB (strictly < 15 MB)
- **Dependencies**: Uses system WebView2 runtime; no external DLLs or Node.js runtime required.

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
├── app.go                 # Core Go backend API & business logic
├── app_test.go            # Unit tests for Go backend services
├── main.go                # Application entry point, Wails options & asset server
├── wails.json             # Wails v2 project configuration
├── go.mod                 # Go module definition
├── go.sum                 # Go module dependencies checksums
├── package.json           # Project metadata & build scripts
├── build/
│   ├── appicon.png        # Source application icon
│   ├── bin/
│   │   └── GameLibrary.exe # Compiled standalone portable executable
│   └── windows/
│       ├── icon.ico       # Windows application icon
│       ├── info.json      # Executable metadata configuration
│       └── wails.exe.manifest # DPI awareness & Windows assembly manifest
├── renderer/              # Vanilla frontend assets
│   ├── index.html         # Main UI layout & modal structures
│   ├── styles.css         # Steam dark theme & Epic Games grid styles
│   ├── app.js             # UI controller, state management, event listeners
│   ├── wails-bridge.js    # Shim translating window.api to window.go.main.App
│   └── assets/
│       └── logo.svg       # Vector application logo
└── tests/
    └── e2e/               # Automated multi-tier verification test suite
```

---

## License

MIT License © 2026 Daffa.
