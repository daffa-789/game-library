# TEST_READY: Opaque-Box E2E Test Suite Publication

## Test Runner Command
To execute the complete E2E test suite across all 4 tiers:
```powershell
pwsh -ExecutionPolicy Bypass -File tests/e2e/run_tests.ps1
```

To execute individual tiers:
```powershell
pwsh -ExecutionPolicy Bypass -File tests/e2e/run_tests.ps1 -Tier 1   # Tier 1: Feature Coverage (70 tests)
pwsh -ExecutionPolicy Bypass -File tests/e2e/run_tests.ps1 -Tier 2   # Tier 2: Boundary & Corner Cases (70 tests)
pwsh -ExecutionPolicy Bypass -File tests/e2e/run_tests.ps1 -Tier 3   # Tier 3: Pairwise Combinations (14 tests)
pwsh -ExecutionPolicy Bypass -File tests/e2e/run_tests.ps1 -Tier 4   # Tier 4: Real-World Scenarios (7 scenarios)
```

To filter specific tests by ID or name regex:
```powershell
pwsh -ExecutionPolicy Bypass -File tests/e2e/run_tests.ps1 -Filter "Steam"
pwsh -ExecutionPolicy Bypass -File tests/e2e/run_tests.ps1 -Filter "T3\."
```

---

## Test Suite Execution Summary
| Test Suite Tier | Total Tests | Passed | Failed | Pass Rate | Execution Time |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Tier 1: Feature Coverage** | 70 | 70 | 0 | 100.0% | ~16.4s |
| **Tier 2: Boundary & Corner Cases** | 70 | 70 | 0 | 100.0% | ~4.5s |
| **Tier 3: Pairwise Combinations** | 14 | 14 | 0 | 100.0% | ~8.1s |
| **Tier 4: Real-World Scenarios** | 7 | 7 | 0 | 100.0% | ~1.0s |
| **TOTAL ACROSS ALL TIERS** | **161** | **161** | **0** | **100.0%** | **~32.6s** |

---

## Feature Checklist & Test Mapping
| # | Feature Name | Tier 1 (Features) | Tier 2 (Boundaries) | Tier 3 (Combos) | Tier 4 (Scenarios) | Total Tests | Status |
|---|---|:---:|:---:|:---:|:---:|:---:|:---:|
| F1 | Wails v2 Configuration & Build | T1.1.1–T1.1.5 (5) | T2.1.1–T2.1.5 (5) | T3.13 | S1 | 12 | PASS |
| F2 | Executable Size & RAM Efficiency | T1.2.1–T1.2.5 (5) | T2.2.1–T2.2.5 (5) | T3.13 | - | 11 | PASS |
| F3 | Library Data Loading (`LoadLibrary`) | T1.3.1–T1.3.5 (5) | T2.3.1–T2.3.5 (5) | T3.1, T3.3, T3.12 | S1, S2, S6, S7 | 16 | PASS |
| F4 | Library Data Saving (`SaveLibrary`) | T1.4.1–T1.4.5 (5) | T2.4.1–T2.4.5 (5) | T3.1, T3.2, T3.6 | S1, S5, S6, S7 | 16 | PASS |
| F5 | Data Persistence & Atomicity | T1.5.1–T1.5.5 (5) | T2.5.1–T2.5.5 (5) | T3.2, T3.3 | S1, S2, S5, S6 | 16 | PASS |
| F6 | Thumbnail Import & Serving | T1.6.1–T1.6.5 (5) | T2.6.1–T2.6.5 (5) | T3.4, T3.5, T3.12 | S2, S3, S5 | 15 | PASS |
| F7 | Thumbnail Deletion | T1.7.1–T1.7.5 (5) | T2.7.1–T2.7.5 (5) | T3.4, T3.9 | S5 | 13 | PASS |
| F8 | Steam Import API & Specs Parsing | T1.8.1–T1.8.5 (5) | T2.8.1–T2.8.5 (5) | T3.5, T3.6 | S3 | 13 | PASS |
| F9 | OS Integration (Browser & Clipboard) | T1.9.1–T1.9.5 (5) | T2.9.1–T2.9.5 (5) | T3.10, T3.11 | S4 | 13 | PASS |
| F10 | Frontend Bridge & UI State | T1.10.1–T1.10.5 (5) | T2.10.1–T2.10.5 (5) | T3.10, T3.11 | S1, S2, S3 | 15 | PASS |
| F11 | Search & Filter Operations | T1.11.1–T1.11.5 (5) | T2.11.1–T2.11.5 (5) | T3.7, T3.8 | S4, S7 | 14 | PASS |
| F12 | Sort Operations (New, A-Z, Z-A) | T1.12.1–T1.12.5 (5) | T2.12.1–T2.12.5 (5) | T3.7 | S2, S4, S7 | 14 | PASS |
| F13 | Game CRUD (Add, Edit, Delete) | T1.13.1–T1.13.5 (5) | T2.13.1–T2.13.5 (5) | T3.8, T3.9, T3.14 | S3, S5 | 15 | PASS |
| F14 | Project Cleanup & Hygiene | T1.14.1–T1.14.5 (5) | T2.14.1–T2.14.5 (5) | T3.14 | - | 11 | PASS |

---

## File Structure
```
tests/e2e/
├── run_tests.ps1           # Master test runner with color reporting & tier switches
├── test_utils.ps1          # Assertions, PE binary parser, and sandbox isolation helpers
├── tier1_features.ps1      # Tier 1: 70 feature verification tests
├── tier2_boundaries.ps1    # Tier 2: 70 boundary and corner case tests
├── tier3_combinations.ps1  # Tier 3: 14 pairwise interaction tests
└── tier4_scenarios.ps1     # Tier 4: 7 real-world end-to-end workflows
```

## Opaque-Box Verification Capabilities
1. **Binary Properties**: Validates PE executable signatures ("MZ", PE00), AMD64 architecture (0x8664), Windows GUI subsystem (suppressing console popup), and size strict threshold (< 15 MB).
2. **Filesystem & AppData**: Validates automatic directory initialization in `%APPDATA%\libray-game`, sample SVG generation, and hex-named thumbnail assets.
3. **Database Integrity & Atomicity**: Verifies `.tmp` file atomic write and rename strategy, and `.rusak-<ts>` corruption auto-recovery.
4. **Network & Steam API**: Verifies Steam Store API requests, English localization parameters, PC requirements HTML table parsing, and header image downloading.
5. **Project Hygiene**: Enforces absence of obsolete Electron files (`main.js`, `preload.js`, `dist/`), removal of Electron npm dependencies, and presence of Wails documentation.
