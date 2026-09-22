# E2E Test Infra: Game Library Wails v2 Migration

## Test Philosophy
- **Requirement-Driven & Opaque-Box**: Tests verify the external behavior, file system artifacts, API contracts, executable properties, and user workflows specified in `ORIGINAL_REQUEST.md`. No reliance on internal implementation details.
- **Methodology**: Systematic 4-tier methodology (Category-Partition, Boundary Value Analysis, Pairwise Combinatorial, and Real-World Workload Testing).

## Feature Inventory Coverage Matrix
| # | Feature | Requirement | Tier 1 (Feature) | Tier 2 (Boundary) | Tier 3 (Combination) | Tier 4 (Scenario) |
|---|---------|-------------|:----------------:|:-----------------:|:--------------------:|:-----------------:|
| 1 | Wails v2 Configuration & Build | ORIGINAL_REQUEST §R3 | 5 tests | 5 tests | ✓ | ✓ |
| 2 | Executable Size & RAM Efficiency | ORIGINAL_REQUEST §R3 | 5 tests | 5 tests | ✓ | ✓ |
| 3 | Library Data Loading (`LoadLibrary`) | ORIGINAL_REQUEST §R1 | 5 tests | 5 tests | ✓ | ✓ |
| 4 | Library Data Saving (`SaveLibrary`) | ORIGINAL_REQUEST §R1 | 5 tests | 5 tests | ✓ | ✓ |
| 5 | Data Persistence & Atomicity | ORIGINAL_REQUEST §R1 | 5 tests | 5 tests | ✓ | ✓ |
| 6 | Thumbnail Import & Serving | ORIGINAL_REQUEST §R1 | 5 tests | 5 tests | ✓ | ✓ |
| 7 | Thumbnail Deletion | ORIGINAL_REQUEST §R1 | 5 tests | 5 tests | ✓ | ✓ |
| 8 | Steam Import API & Specs Parsing | ORIGINAL_REQUEST §R1 | 5 tests | 5 tests | ✓ | ✓ |
| 9 | OS Integration (Browser & Clipboard) | ORIGINAL_REQUEST §R1 | 5 tests | 5 tests | ✓ | ✓ |
| 10 | Frontend Bridge & UI State | ORIGINAL_REQUEST §R2 | 5 tests | 5 tests | ✓ | ✓ |
| 11 | Search & Filter Operations | Acceptance Criteria | 5 tests | 5 tests | ✓ | ✓ |
| 12 | Sort Operations (New, A-Z, Z-A) | Acceptance Criteria | 5 tests | 5 tests | ✓ | ✓ |
| 13 | Game CRUD (Add, Edit, Delete) | Acceptance Criteria | 5 tests | 5 tests | ✓ | ✓ |
| 14 | Project Cleanup & Hygiene | ORIGINAL_REQUEST §R3 | 5 tests | 5 tests | ✓ | ✓ |

## Test Architecture
- **Runner**: `tests/e2e/run_tests.ps1` (or Go-based test runner `tests/e2e/e2e_test.go`).
- **Pass/Fail Semantics**: Each test asserts expected vs actual state; exit code 0 on all tests passing, non-zero on any failure.
- **Artifacts Checked**:
  - Binary existence at `build/bin/GameLibrary.exe`, size `< 15,728,640 bytes`.
  - Database schema & contents at `%APPDATA%\libray-game\library.json`.
  - Thumbnail cache at `%APPDATA%\libray-game\thumbnails\`.
  - Absence of pruned Electron files (`main.js`, `preload.js`, `dist/`).
  - API method contract responses.

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Expected Outcome |
|---|----------|--------------------|------------------|
| S1 | Fresh App Install & First Run | F1, F3, F4, F5, F10 | App launches, creates default `%APPDATA%\libray-game` directory, generates sample games with thumbnails, renders library grid. |
| S2 | Existing Electron Data Migration | F3, F5, F6, F10, F12 | Existing user `library.json` containing `glib://thumb/` references loads seamlessly, images resolve via `/thumbnails/`, game cards render intact. |
| S3 | Steam Link Game Import & Save | F6, F8, F10, F13 | User inputs Steam URL `https://store.steampowered.com/app/304390/`, metadata & specs auto-fill, header image downloads, user enters Google Drive link and saves game. |
| S4 | Search, Filter, Sort & External Link Copy | F9, F11, F12 | User searches for game, sorts by A-Z, copies Google Drive link to clipboard (verifying toast & clipboard content), opens in browser. |
| S5 | Complete Game Lifecycle (Add, Edit, Delete) | F4, F5, F6, F7, F13 | User adds game with custom thumbnail, edits title/price, updates thumbnail (verifying obsolete thumbnail is unlinked), then deletes game (verifying record and image deleted). |
| S6 | Corrupted JSON Auto-Recovery | F3, F4, F5 | User writes corrupted non-JSON data to `library.json`. On start, app backs up corrupted file to `.rusak-<ts>`, creates fresh sample library, and continues operating without crashing. |

## Coverage Thresholds
- **Tier 1 (Feature Coverage)**: >= 70 tests (14 features × 5 tests).
- **Tier 2 (Boundary & Corner Cases)**: >= 70 tests (14 features × 5 tests).
- **Tier 3 (Cross-Feature Combinations)**: >= 14 tests (pairwise feature interactions).
- **Tier 4 (Real-World Application Scenarios)**: >= 7 application scenarios.
- **Total Minimum Target**: >= 161 tests.
