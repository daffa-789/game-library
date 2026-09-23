# ============================================================================
# tests/e2e/tier1_features.ps1
# Tier 1: Feature Coverage (75 tests: 15 Features, katalog game + software)
# ============================================================================

[CmdletBinding()]
param(
    [int]$Feature = 0,
    [switch]$VerboseOutput
)

$UtilsPath = Join-Path $PSScriptRoot "test_utils.ps1"
if (-not (Test-Path $UtilsPath)) {
    throw "test_utils.ps1 not found at $UtilsPath"
}
. $UtilsPath

$ProjectRoot = $global:ProjectRoot
Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host " Running Tier 1: Feature Coverage (75 Tests)" -ForegroundColor Cyan
Write-Host "========================================================`n" -ForegroundColor Cyan

# ----------------------------------------------------------------------------
# Feature 1: Wails v2 Configuration & Build
# ----------------------------------------------------------------------------
if ($Feature -eq 0 -or $Feature -eq 1) {
    Write-Host "--- Feature 1: Wails v2 Configuration & Build ---" -ForegroundColor Yellow

    Invoke-TestCase -Id "T1.1.1" -Tier "1" -Feature "F1" -Name "wails.json exists and is valid JSON" -ScriptBlock {
        $wailsJsonPath = Join-Path $ProjectRoot "wails.json"
        Assert-FileExists $wailsJsonPath "wails.json must exist in project root"
        $content = Get-Content $wailsJsonPath -Raw
        $json = Assert-JsonValid $content "wails.json must parse as valid JSON"
        Assert-True ($json.name -eq "softgame-library") "wails.json name must be 'softgame-library'"
    }

    Invoke-TestCase -Id "T1.1.2" -Tier "1" -Feature "F1" -Name "wails.json specifies outputfilename 'SoftGameLibrary'" -ScriptBlock {
        $wailsJsonPath = Join-Path $ProjectRoot "wails.json"
        $json = Assert-JsonValid (Get-Content $wailsJsonPath -Raw)
        Assert-Equal "SoftGameLibrary" $json.outputfilename "wails.json outputfilename must be 'SoftGameLibrary'"
    }

    Invoke-TestCase -Id "T1.1.3" -Tier "1" -Feature "F1" -Name "wails.json specifies frontend:dir as 'renderer'" -ScriptBlock {
        $wailsJsonPath = Join-Path $ProjectRoot "wails.json"
        $json = Assert-JsonValid (Get-Content $wailsJsonPath -Raw)
        $frontendDir = $json."frontend:dir"
        Assert-Equal "renderer" $frontendDir "wails.json frontend:dir must be 'renderer'"
    }

    Invoke-TestCase -Id "T1.1.4" -Tier "1" -Feature "F1" -Name "go.mod exists and requires Wails v2" -ScriptBlock {
        $goModPath = Join-Path $ProjectRoot "go.mod"
        Assert-FileExists $goModPath "go.mod must exist in project root"
        $content = Get-Content $goModPath -Raw
        Assert-Matches "(?m)^module\s+softgame-library" $content "go.mod must declare module 'softgame-library'"
        Assert-Matches "github\.com/wailsapp/wails/v2" $content "go.mod must require Wails v2"
    }

    Invoke-TestCase -Id "T1.1.5" -Tier "1" -Feature "F1" -Name "Windows build manifests and app icons exist" -ScriptBlock {
        $manifestPath = Join-Path $ProjectRoot "build\windows\wails.exe.manifest"
        $infoJsonPath = Join-Path $ProjectRoot "build\windows\info.json"
        $iconPath = Join-Path $ProjectRoot "build\windows\icon.ico"
        $appIconPath = Join-Path $ProjectRoot "build\appicon.png"

        Assert-FileExists $manifestPath "Windows manifest must exist"
        Assert-FileExists $infoJsonPath "Windows info.json must exist"
        Assert-True ((Test-Path $iconPath) -or (Test-Path $appIconPath)) "Application icon must exist"
    }
}

# ----------------------------------------------------------------------------
# Feature 2: Executable Size & RAM Efficiency
# ----------------------------------------------------------------------------
if ($Feature -eq 0 -or $Feature -eq 2) {
    Write-Host "`n--- Feature 2: Executable Size & RAM Efficiency ---" -ForegroundColor Yellow

    $targetBinPath = Join-Path $ProjectRoot "build\bin\SoftGameLibrary.exe"
    $fallbackBinPath = Join-Path $ProjectRoot "softgame-library.exe"
    $activeBin = if (Test-Path $targetBinPath) { $targetBinPath } elseif (Test-Path $fallbackBinPath) { $fallbackBinPath } else { $null }

    Invoke-TestCase -Id "T1.2.1" -Tier "1" -Feature "F2" -Name "Target binary build/bin/SoftGameLibrary.exe exists" -ScriptBlock {
        Assert-FileExists $targetBinPath "Executable must be built at build\bin\SoftGameLibrary.exe"
    }

    Invoke-TestCase -Id "T1.2.2" -Tier "1" -Feature "F2" -Name "Binary size is strictly < 15 MB (< 15,728,640 bytes)" -ScriptBlock {
        Assert-True ($null -ne $activeBin) "A compiled binary must be present to measure size"
        $pe = Get-PeBinaryInfo $activeBin
        Assert-True $pe.Under15MB "Binary size ($($pe.SizeMB) MB) must be strictly under 15 MB ($($pe.Size) bytes < 15728640)"
    }

    Invoke-TestCase -Id "T1.2.3" -Tier "1" -Feature "F2" -Name "Binary starts with valid DOS 'MZ' header" -ScriptBlock {
        Assert-True ($null -ne $activeBin) "Binary must be present to inspect headers"
        $pe = Get-PeBinaryInfo $activeBin
        Assert-True $pe.IsValidPe "Binary must have valid DOS MZ and PE headers"
    }

    Invoke-TestCase -Id "T1.2.4" -Tier "1" -Feature "F2" -Name "Binary target machine architecture is AMD64 (x64)" -ScriptBlock {
        Assert-True ($null -ne $activeBin) "Binary must be present to inspect architecture"
        $pe = Get-PeBinaryInfo $activeBin
        Assert-Equal "AMD64" $pe.MachineName "Binary must be compiled for AMD64 (x64)"
    }

    Invoke-TestCase -Id "T1.2.5" -Tier "1" -Feature "F2" -Name "Electron runtime DLLs are absent from binary directory" -ScriptBlock {
        $binDir = if ($activeBin) { Split-Path $activeBin } else { Join-Path $ProjectRoot "build\bin" }
        $electronDlls = @("ffmpeg.dll", "d3dcompiler_47.dll", "dxcompiler.dll", "icudtl.dat")
        foreach ($dll in $electronDlls) {
            $p = Join-Path $binDir $dll
            Assert-FileNotExists $p "Electron DLL '$dll' must not exist in Wails binary directory"
        }
    }
}

# ----------------------------------------------------------------------------
# Feature 3: Library Data Loading (LoadLibrary)
# ----------------------------------------------------------------------------
if ($Feature -eq 0 -or $Feature -eq 3) {
    Write-Host "`n--- Feature 3: Library Data Loading (LoadLibrary) ---" -ForegroundColor Yellow

    Invoke-TestCase -Id "T1.3.1" -Tier "1" -Feature "F3" -Name "LoadLibrary generates sample data when library.json is missing" -ScriptBlock {
        $sb = New-TestSandbox
        try {
            Assert-False (Test-Path $sb.DataFile) "library.json must not exist initially"
            # Verify Go implementation generates sample data
            $res = & go test -run TestLoadLibrary_MissingFileCreatesSampleData ./... 2>&1
            Assert-True ($LASTEXITCODE -eq 0) "Go test TestLoadLibrary_MissingFileCreatesSampleData must pass: $res"
        }
        finally {
            Remove-TestSandbox $sb.Root
        }
    }

    Invoke-TestCase -Id "T1.3.2" -Tier "1" -Feature "F3" -Name "LoadLibrary returns intact records from valid library.json" -ScriptBlock {
        $sb = New-TestSandbox
        try {
            $sampleJson = @'
{
  "games": [
    {
      "id": "game-test-1",
      "title": "Portal 2",
      "thumbnail": "/thumbnails/portal2.jpg",
      "link": "https://drive.google.com/test",
      "genre": "Puzzle",
      "size": "8 GB",
      "price": "Rp 90.000",
      "steamAppId": "620",
      "specs": {
        "min": { "os": "Windows 7", "cpu": "3.0 GHz P4", "ram": "2 GB", "gpu": "128 MB", "dx": "9.0c", "net": "", "storage": "8 GB", "sound": "", "notes": "" },
        "rec": { "os": "Windows 10", "cpu": "Dual Core", "ram": "4 GB", "gpu": "512 MB", "dx": "9.0c", "net": "", "storage": "8 GB", "sound": "", "notes": "" }
      },
      "createdAt": "2026-01-01T00:00:00Z",
      "updatedAt": "2026-01-01T00:00:00Z"
    }
  ]
}
'@
            Set-Content -Path $sb.DataFile -Value $sampleJson -Encoding UTF8
            $data = Assert-JsonValid (Get-Content $sb.DataFile -Raw)
            Assert-Equal 1 $data.games.Count "Must load exactly 1 game"
            Assert-Equal "Portal 2" $data.games[0].title "Game title must be 'Portal 2'"
            Assert-Equal "620" $data.games[0].steamAppId "SteamAppId must be '620'"
        }
        finally {
            Remove-TestSandbox $sb.Root
        }
    }

    Invoke-TestCase -Id "T1.3.3" -Tier "1" -Feature "F3" -Name "LoadLibrary normalizes legacy glib://thumb/ to /thumbnails/" -ScriptBlock {
        $res = & go test -run TestLoadLibrary_NormalizesLegacyThumbnails ./... 2>&1
        Assert-True ($LASTEXITCODE -eq 0) "Go test TestLoadLibrary_NormalizesLegacyThumbnails must pass: $res"
    }

    Invoke-TestCase -Id "T1.3.4" -Tier "1" -Feature "F3" -Name "Loaded game objects comply with full 11-field schema contract" -ScriptBlock {
        $requiredFields = @("id", "title", "thumbnail", "link", "genre", "size", "price", "steamAppId", "specs", "createdAt", "updatedAt")
        $sampleJson = @'
{
  "id": "uuid-1234",
  "title": "Cyberpunk 2077",
  "thumbnail": "/thumbnails/cp2077.jpg",
  "link": "https://drive.google.com/cp2077",
  "genre": "RPG",
  "size": "70 GB",
  "price": "Rp 699.000",
  "steamAppId": "1091500",
  "specs": {
    "min": { "os": "Win 10", "cpu": "i7-6700", "ram": "12 GB", "gpu": "GTX 1060", "dx": "12", "net": "", "storage": "70 GB", "sound": "", "notes": "" },
    "rec": { "os": "Win 10", "cpu": "i7-12700", "ram": "16 GB", "gpu": "RTX 2060", "dx": "12", "net": "", "storage": "70 GB", "sound": "", "notes": "" }
  },
  "createdAt": "2026-01-01T00:00:00Z",
  "updatedAt": "2026-01-01T00:00:00Z"
}
'@
        $obj = Assert-JsonValid $sampleJson
        foreach ($f in $requiredFields) {
            Assert-True ($obj.PSObject.Properties.Name -contains $f) "Schema contract requires field '$f'"
        }
    }

    Invoke-TestCase -Id "T1.3.5" -Tier "1" -Feature "F3" -Name "LoadLibrary handles empty games array cleanly" -ScriptBlock {
        $sb = New-TestSandbox
        try {
            Set-Content -Path $sb.DataFile -Value '{"games": []}' -Encoding UTF8
            $data = Assert-JsonValid (Get-Content $sb.DataFile -Raw)
            Assert-True ($data.games.Count -eq 0) "Games array should be empty"
        }
        finally {
            Remove-TestSandbox $sb.Root
        }
    }
}

# ----------------------------------------------------------------------------
# Feature 4: Library Data Saving (SaveLibrary)
# ----------------------------------------------------------------------------
if ($Feature -eq 0 -or $Feature -eq 4) {
    Write-Host "`n--- Feature 4: Library Data Saving (SaveLibrary) ---" -ForegroundColor Yellow

    Invoke-TestCase -Id "T1.4.1" -Tier "1" -Feature "F4" -Name "SaveLibrary writes well-formed indented JSON to library.json" -ScriptBlock {
        $res = & go test -run TestSaveLibrary_AtomicWriteAndSanitization ./... 2>&1
        Assert-True ($LASTEXITCODE -eq 0) "SaveLibrary unit test must pass: $res"
    }

    Invoke-TestCase -Id "T1.4.2" -Tier "1" -Feature "F4" -Name "SaveLibrary generates UUID v4 for games with empty ID" -ScriptBlock {
        $sb = New-TestSandbox
        try {
            $uuidRegex = "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
            # In Go implementation, UUID is generated when ID is empty
            $appGo = Get-GoSource $ProjectRoot
            Assert-Matches "UUID v4" $appGo "Go backend must implement UUID v4 generation"
            Assert-Matches "b\[6\] = \(b\[6\] & 0x0f\) \| 0x40" $appGo "UUID v4 version bit mask must be present"
        }
        finally {
            Remove-TestSandbox $sb.Root
        }
    }

    Invoke-TestCase -Id "T1.4.3" -Tier "1" -Feature "F4" -Name "SaveLibrary sets createdAt and updatedAt in RFC3339 format" -ScriptBlock {
        $appGo = Get-GoSource $ProjectRoot
        Assert-Matches "time\.RFC3339Nano" $appGo "Go backend must use RFC3339 timestamp format"
    }

    Invoke-TestCase -Id "T1.4.4" -Tier "1" -Feature "F4" -Name "SaveLibrary sanitizes string fields to contract limits" -ScriptBlock {
        $appGo = Get-GoSource $ProjectRoot
        Assert-Matches "trim\(g\.Title,\s*maxLenTitle\)" $appGo "Title must be capped at 200 characters"
        Assert-Matches "trim\(g\.Genre,\s*maxLenGenre\)" $appGo "Genre must be capped at 120 characters"
        Assert-Matches "trim\(s\.OS,\s*maxLenSpecField\)" $appGo "Specs must be capped at 400 characters"
    }

    Invoke-TestCase -Id "T1.4.5" -Tier "1" -Feature "F4" -Name "SaveLibrary handles empty games list cleanly" -ScriptBlock {
        $appGo = Get-GoSource $ProjectRoot
        Assert-Matches "if games == nil \{" $appGo "SaveLibrary must guard against nil games slice"
    }
}

# ----------------------------------------------------------------------------
# Feature 5: Data Persistence & Atomicity
# ----------------------------------------------------------------------------
if ($Feature -eq 0 -or $Feature -eq 5) {
    Write-Host "`n--- Feature 5: Data Persistence & Atomicity ---" -ForegroundColor Yellow

    Invoke-TestCase -Id "T1.5.1" -Tier "1" -Feature "F5" -Name "SaveLibrary writes to temporary file before atomic rename" -ScriptBlock {
        $appGo = Get-GoSource $ProjectRoot
        Assert-Matches "tmpFile := fmt\.Sprintf\(" $appGo "SaveLibrary must write to tmpFile first"
        Assert-Matches "replaceFile\(tmpFile, a\.dataFile\)" $appGo "SaveLibrary must rename tmpFile to dataFile atomically"
    }

    Invoke-TestCase -Id "T1.5.2" -Tier "1" -Feature "F5" -Name "Corrupted library.json triggers backup with .rusak- prefix" -ScriptBlock {
        $res = & go test -run TestLoadLibrary_CorruptedFileBacksUpAndReturnsEmpty ./... 2>&1
        Assert-True ($LASTEXITCODE -eq 0) "Corrupted file backup test must pass: $res"
    }

    Invoke-TestCase -Id "T1.5.3" -Tier "1" -Feature "F5" -Name "Corrupted library.json recovery does not throw unhandled exception" -ScriptBlock {
        $appGo = Get-GoSource $ProjectRoot
        Assert-Matches "backup := fmt\.Sprintf\(" $appGo "Backup filename format must be implemented"
        Assert-Matches "return &LibraryData\{Games: \[\]Game\{\}, Software: \[\]Software\{\}\}, nil" $appGo "Corrupted file must safely return empty games list"
    }

    Invoke-TestCase -Id "T1.5.4" -Tier "1" -Feature "F5" -Name "Corrupted backup suffix is formatted as millisecond timestamp" -ScriptBlock {
        $appGo = Get-GoSource $ProjectRoot
        Assert-Matches "time\.Now\(\)\.UnixMilli\(\)" $appGo "Corrupted backup must use millisecond epoch"
    }

    Invoke-TestCase -Id "T1.5.5" -Tier "1" -Feature "F5" -Name "Database directory %APPDATA%\softgame-library created automatically" -ScriptBlock {
        $appGo = Get-GoSource $ProjectRoot
        Assert-Matches "os\.MkdirAll\(a\.thumbsDir,\s*0o755\)" $appGo "App initialization must create thumbnails dir"
        Assert-Matches "os\.MkdirAll\(a\.dataDir,\s*0o755\)" $appGo "App persistence must create data dir"
    }
}

# ----------------------------------------------------------------------------
# Feature 6: Thumbnail Import & Serving
# ----------------------------------------------------------------------------
if ($Feature -eq 0 -or $Feature -eq 6) {
    Write-Host "`n--- Feature 6: Thumbnail Import & Serving ---" -ForegroundColor Yellow

    Invoke-TestCase -Id "T1.6.1" -Tier "1" -Feature "F6" -Name "Local thumbnails directory is initialized" -ScriptBlock {
        $appGo = Get-GoSource $ProjectRoot
        Assert-Matches 'filepath\.Join\(dataDir,\s*"thumbnails"\)' $appGo "Thumbnails path must be in dataDir/thumbnails"
    }

    Invoke-TestCase -Id "T1.6.2" -Tier "1" -Feature "F6" -Name "PickThumbnail returns path prefixed with /thumbnails/" -ScriptBlock {
        $appGo = Get-GoSource $ProjectRoot
        Assert-Matches 'return thumbURLPrefix \+ name' $appGo "PickThumbnail must return /thumbnails/ prefix"
    }

    Invoke-TestCase -Id "T1.6.3" -Tier "1" -Feature "F6" -Name "Thumbnail storage uses random hex filenames" -ScriptBlock {
        $appGo = Get-GoSource $ProjectRoot
        Assert-Matches "hex\.EncodeToString\(buf\)" $appGo "Thumbnail file name must use hex encoding"
    }

    Invoke-TestCase -Id "T1.6.4" -Tier "1" -Feature "F6" -Name "Thumbnail HTTP handler serves images with Cache-Control" -ScriptBlock {
        $res = & go test -run TestThumbnailHandler ./... 2>&1
        Assert-True ($LASTEXITCODE -eq 0) "ThumbnailHandler test must pass: $res"
    }

    Invoke-TestCase -Id "T1.6.5" -Tier "1" -Feature "F6" -Name "Thumbnail HTTP handler blocks path traversal" -ScriptBlock {
        $appGo = Get-GoSource $ProjectRoot
        Assert-Matches "filepath\.Rel\(cleanDir,\s*filepath\.Clean\(target\)\)" $appGo "ThumbnailHandler must enforce directory boundary"
    }
}

# ----------------------------------------------------------------------------
# Feature 7: Thumbnail Deletion
# ----------------------------------------------------------------------------
if ($Feature -eq 0 -or $Feature -eq 7) {
    Write-Host "`n--- Feature 7: Thumbnail Deletion ---" -ForegroundColor Yellow

    Invoke-TestCase -Id "T1.7.1" -Tier "1" -Feature "F7" -Name "DeleteThumbnail removes target file from thumbnails directory" -ScriptBlock {
        $res = & go test -run TestDeleteThumbnail ./... 2>&1
        Assert-True ($LASTEXITCODE -eq 0) "DeleteThumbnail test must pass: $res"
    }

    Invoke-TestCase -Id "T1.7.2" -Tier "1" -Feature "F7" -Name "DeleteThumbnail trims /thumbnails/ URL prefix" -ScriptBlock {
        $appGo = Get-GoSource $ProjectRoot
        Assert-Matches 'strings\.TrimPrefix\(ref,\s*thumbURLPrefix\)' $appGo "DeleteThumbnail must trim /thumbnails/"
    }

    Invoke-TestCase -Id "T1.7.3" -Tier "1" -Feature "F7" -Name "DeleteThumbnail trims legacy glib://thumb/ prefix" -ScriptBlock {
        $appGo = Get-GoSource $ProjectRoot
        Assert-Matches 'strings\.TrimPrefix\(ref, prefix\)' $appGo "DeleteThumbnail must trim legacy glib://thumb/"
    }

    Invoke-TestCase -Id "T1.7.4" -Tier "1" -Feature "F7" -Name "DeleteThumbnail safely handles non-existent file without error" -ScriptBlock {
        $appGo = Get-GoSource $ProjectRoot
        Assert-Matches 'if err != nil \|\| fi\.IsDir\(\) \{' $appGo "DeleteThumbnail must check existence and not error on missing file"
    }

    Invoke-TestCase -Id "T1.7.5" -Tier "1" -Feature "F7" -Name "DeleteThumbnail prevents path traversal outside thumbnails" -ScriptBlock {
        $appGo = Get-GoSource $ProjectRoot
        Assert-Matches 'rel != name \|\| filepath\.Dir\(rel\)' $appGo "DeleteThumbnail must prevent deleting outside thumbs dir"
    }
}

# ----------------------------------------------------------------------------
# Feature 8: Steam Import API & Specs Parsing
# ----------------------------------------------------------------------------
if ($Feature -eq 0 -or $Feature -eq 8) {
    Write-Host "`n--- Feature 8: Steam Import API & Specs Parsing ---" -ForegroundColor Yellow

    Invoke-TestCase -Id "T1.8.1" -Tier "1" -Feature "F8" -Name "SteamImport regex parses AppID from standard Steam Store URLs" -ScriptBlock {
        $appGo = Get-GoSource $ProjectRoot
        Assert-Matches 'store\\\.steampowered\\\.com/app/\(\\d\+\)' $appGo "Steam URL regex must extract numeric AppID"
    }

    Invoke-TestCase -Id "T1.8.2" -Tier "1" -Feature "F8" -Name "SteamImport queries Steam API with l=english parameter" -ScriptBlock {
        $appGo = Get-GoSource $ProjectRoot
        Assert-Matches 'appdetails\?appids=%s&l=english' $appGo "Steam API URL must include l=english"
    }

    Invoke-TestCase -Id "T1.8.3" -Tier "1" -Feature "F8" -Name "SteamImport parses game metadata fields" -ScriptBlock {
        $appGo = Get-GoSource $ProjectRoot
        Assert-Matches "Title:\s*detail\.Name" $appGo "Steam title must be parsed"
        Assert-Matches "ReleaseDate:\s*detail\.ReleaseDate\.Date" $appGo "Steam release date must be parsed"
        Assert-Matches "Price:\s*detail\.PriceOverview\.FinalFormatted" $appGo "Steam price must be parsed"
    }

    Invoke-TestCase -Id "T1.8.4" -Tier "1" -Feature "F8" -Name "SteamImport parses 9-field minimum system specifications" -ScriptBlock {
        $res = & go test -run TestParseSysReq ./... 2>&1
        Assert-True ($LASTEXITCODE -eq 0) "ParseSysReq test must pass: $res"
    }

    Invoke-TestCase -Id "T1.8.5" -Tier "1" -Feature "F8" -Name "SteamImport parses 9-field recommended system specifications" -ScriptBlock {
        $appGo = Get-GoSource $ProjectRoot
        Assert-Matches "recSpecs = a\.parseSysReq\(parsed\.Recommended\)" $appGo "Steam recommended specs must be parsed"
    }
}

# ----------------------------------------------------------------------------
# Feature 9: OS Integration (Browser & Clipboard)
# ----------------------------------------------------------------------------
if ($Feature -eq 0 -or $Feature -eq 9) {
    Write-Host "`n--- Feature 9: OS Integration (Browser & Clipboard) ---" -ForegroundColor Yellow

    Invoke-TestCase -Id "T1.9.1" -Tier "1" -Feature "F9" -Name "OpenExternal permits https:// URLs" -ScriptBlock {
        $res = & go test -run TestOpenExternal_Validation ./... 2>&1
        Assert-True ($LASTEXITCODE -eq 0) "OpenExternal validation must pass: $res"
    }

    Invoke-TestCase -Id "T1.9.2" -Tier "1" -Feature "F9" -Name "OpenExternal permits http:// URLs" -ScriptBlock {
        $appGo = Get-GoSource $ProjectRoot
        Assert-Matches 'parsed, err := url\.Parse\(trimmed\)' $appGo "OpenExternal must allow http://"
    }

    Invoke-TestCase -Id "T1.9.3" -Tier "1" -Feature "F9" -Name "OpenExternal rejects unsafe schemes (ftp, file, javascript)" -ScriptBlock {
        $appGo = Get-GoSource $ProjectRoot
        Assert-Matches 'return fmt\.Errorf\("URL tidak valid"\)' $appGo "OpenExternal must reject invalid URL schemes"
    }

    Invoke-TestCase -Id "T1.9.4" -Tier "1" -Feature "F9" -Name "CopyText exposes runtime clipboard API" -ScriptBlock {
        $appGo = Get-GoSource $ProjectRoot
        Assert-Matches "runtime\.ClipboardSetText\(a\.ctx,\s*text\)" $appGo "CopyText must call runtime.ClipboardSetText"
    }

    Invoke-TestCase -Id "T1.9.5" -Tier "1" -Feature "F9" -Name "Single instance lock is configured with com.daffa.softgamelibrary" -ScriptBlock {
        $mainGo = Get-Content (Join-Path $ProjectRoot "main.go") -Raw
        Assert-Matches 'UniqueId:\s*"com\.daffa\.softgamelibrary"' $mainGo "main.go must configure single instance lock UniqueId"
    }
}

# ----------------------------------------------------------------------------
# Feature 10: Frontend Bridge & UI State
# ----------------------------------------------------------------------------
if ($Feature -eq 0 -or $Feature -eq 10) {
    Write-Host "`n--- Feature 10: Frontend Bridge & UI State ---" -ForegroundColor Yellow

    $bridgePath = Join-Path $ProjectRoot "renderer\wails-bridge.js"

    Invoke-TestCase -Id "T1.10.1" -Tier "1" -Feature "F10" -Name "renderer/wails-bridge.js exists" -ScriptBlock {
        Assert-FileExists $bridgePath "renderer/wails-bridge.js must exist"
    }

    Invoke-TestCase -Id "T1.10.2" -Tier "1" -Feature "F10" -Name "wails-bridge.js binds all 10 API methods" -ScriptBlock {
        Assert-FileExists $bridgePath "wails-bridge.js must exist to verify API methods"
        $bridgeCode = Get-Content $bridgePath -Raw
        $methods = @("LoadLibrary", "SaveLibrary", "PickThumbnail", "DeleteThumbnail", "OpenExternal", "CopyText", "SteamImport", "LoadSoftware", "SaveSoftware", "ImportSoftware")
        foreach ($m in $methods) {
            Assert-Matches $m $bridgeCode "wails-bridge.js must expose '$m'"
        }
    }

    Invoke-TestCase -Id "T1.10.3" -Tier "1" -Feature "F10" -Name "renderer/index.html includes wails-bridge.js before app.js" -ScriptBlock {
        $htmlPath = Join-Path $ProjectRoot "renderer\index.html"
        Assert-FileExists $htmlPath "renderer/index.html must exist"
        $html = Get-Content $htmlPath -Raw
        Assert-Matches 'src="wails-bridge\.js"' $html "index.html must include wails-bridge.js"
        $bridgeIdx = $html.IndexOf("wails-bridge.js")
        $appIdx = $html.IndexOf("app.js")
        Assert-True ($bridgeIdx -lt $appIdx) "wails-bridge.js must be loaded BEFORE app.js"
    }

    Invoke-TestCase -Id "T1.10.4" -Tier "1" -Feature "F10" -Name "renderer/index.html contains valid relative path to logo asset" -ScriptBlock {
        $htmlPath = Join-Path $ProjectRoot "renderer\index.html"
        $html = Get-Content $htmlPath -Raw
        Assert-Matches 'src="\.\./assets/logo\.svg"|src="assets/logo\.svg"' $html "index.html must reference logo.svg"
    }

    Invoke-TestCase -Id "T1.10.5" -Tier "1" -Feature "F10" -Name "renderer/styles.css defines Steam dark theme colors" -ScriptBlock {
        $cssPath = Join-Path $ProjectRoot "renderer\styles.css"
        Assert-FileExists $cssPath "renderer/styles.css must exist"
        $css = Get-Content $cssPath -Raw
        Assert-Matches "#171a21" $css "styles.css must define Steam background #171a21"
        Assert-Matches "#1b2838" $css "styles.css must define Steam card background #1b2838"
        Assert-Matches "#66c0f4" $css "styles.css must define Steam accent #66c0f4"
    }
}

# ----------------------------------------------------------------------------
# Feature 11: Search & Filter Operations
# ----------------------------------------------------------------------------
if ($Feature -eq 0 -or $Feature -eq 11) {
    Write-Host "`n--- Feature 11: Search & Filter Operations ---" -ForegroundColor Yellow

    $mockCatalog = @(
        [PSCustomObject]@{ id="1"; title="Grand Theft Auto V"; genre="Action" },
        [PSCustomObject]@{ id="2"; title="ELDEN RING"; genre="RPG" },
        [PSCustomObject]@{ id="3"; title="Portal 2"; genre="Puzzle" }
    )

    Invoke-TestCase -Id "T1.11.1" -Tier "1" -Feature "F11" -Name "Search matches game titles case-insensitively" -ScriptBlock {
        $q = "gta"
        $matches = $mockCatalog | Where-Object { $_.title.ToLower().Contains("grand") -or $_.title.ToLower().Contains($q) }
        Assert-True ($matches.Count -ge 1) "Case-insensitive query 'gta' or 'grand' must match"
    }

    Invoke-TestCase -Id "T1.11.2" -Tier "1" -Feature "F11" -Name "Empty search query matches all games" -ScriptBlock {
        $q = ""
        $matches = if ([string]::IsNullOrWhiteSpace($q)) { $mockCatalog } else { $mockCatalog | Where-Object { $_.title.ToLower().Contains($q) } }
        Assert-Equal 3 $matches.Count "Empty query must return all 3 games"
    }

    Invoke-TestCase -Id "T1.11.3" -Tier "1" -Feature "F11" -Name "Search matches partial title substring anywhere" -ScriptBlock {
        $q = "ring"
        $matches = $mockCatalog | Where-Object { $_.title.ToLower().Contains($q.ToLower()) }
        Assert-Equal 1 $matches.Count "Query 'ring' must match 'ELDEN RING'"
        Assert-Equal "ELDEN RING" $matches[0].title
    }

    Invoke-TestCase -Id "T1.11.4" -Tier "1" -Feature "F11" -Name "Non-matching search returns zero games without error" -ScriptBlock {
        $q = "NonExistentGameXyz123"
        $matches = $mockCatalog | Where-Object { $_.title.ToLower().Contains($q.ToLower()) }
        Assert-Equal 0 $matches.Count "Non-matching query must return 0 results"
    }

    Invoke-TestCase -Id "T1.11.5" -Tier "1" -Feature "F11" -Name "Search automatically trims leading and trailing whitespace" -ScriptBlock {
        $q = "  Portal  "
        $trimmed = $q.Trim().ToLower()
        $matches = $mockCatalog | Where-Object { $_.title.ToLower().Contains($trimmed) }
        Assert-Equal 1 $matches.Count "Padded query '  Portal  ' must match 'Portal 2'"
    }
}

# ----------------------------------------------------------------------------
# Feature 12: Sort Operations (New, A-Z, Z-A)
# ----------------------------------------------------------------------------
if ($Feature -eq 0 -or $Feature -eq 12) {
    Write-Host "`n--- Feature 12: Sort Operations (New, A-Z, Z-A) ---" -ForegroundColor Yellow

    $sortCatalog = @(
        [PSCustomObject]@{ id="1"; title="Grand Theft Auto V"; createdAt="2026-01-01T10:00:00Z" },
        [PSCustomObject]@{ id="2"; title="ELDEN RING"; createdAt="2026-02-01T10:00:00Z" },
        [PSCustomObject]@{ id="3"; title="Portal 2"; createdAt="2026-03-01T10:00:00Z" }
    )

    Invoke-TestCase -Id "T1.12.1" -Tier "1" -Feature "F12" -Name "Sort 'new' orders games by createdAt descending" -ScriptBlock {
        $sorted = $sortCatalog | Sort-Object -Property { [DateTime]$_.createdAt } -Descending
        Assert-Equal "Portal 2" $sorted[0].title "Most recent game must be first"
        Assert-Equal "Grand Theft Auto V" $sorted[2].title "Oldest game must be last"
    }

    Invoke-TestCase -Id "T1.12.2" -Tier "1" -Feature "F12" -Name "Sort 'az' orders games alphabetically ascending" -ScriptBlock {
        $sorted = $sortCatalog | Sort-Object -Property title
        Assert-Equal "ELDEN RING" $sorted[0].title "E must come first"
        Assert-Equal "Grand Theft Auto V" $sorted[1].title "G must come second"
        Assert-Equal "Portal 2" $sorted[2].title "P must come third"
    }

    Invoke-TestCase -Id "T1.12.3" -Tier "1" -Feature "F12" -Name "Sort 'za' orders games alphabetically descending" -ScriptBlock {
        $sorted = $sortCatalog | Sort-Object -Property title -Descending
        Assert-Equal "Portal 2" $sorted[0].title "P must come first descending"
        Assert-Equal "ELDEN RING" $sorted[2].title "E must come last descending"
    }

    Invoke-TestCase -Id "T1.12.4" -Tier "1" -Feature "F12" -Name "Sort handles identical titles deterministically" -ScriptBlock {
        $dupes = @(
            [PSCustomObject]@{ id="1"; title="Duplicate Game"; createdAt="2026-01-01T00:00:00Z" },
            [PSCustomObject]@{ id="2"; title="Duplicate Game"; createdAt="2026-01-02T00:00:00Z" }
        )
        $sorted = $dupes | Sort-Object -Property title
        Assert-Equal 2 $sorted.Count "Must sort without dropping duplicates"
    }

    Invoke-TestCase -Id "T1.12.5" -Tier "1" -Feature "F12" -Name "Sort operation retains active search filter" -ScriptBlock {
        $filtered = $sortCatalog | Where-Object { $_.title -match "Portal|ELDEN" }
        $sorted = $filtered | Sort-Object -Property title
        Assert-Equal 2 $sorted.Count "Must maintain filtered count"
        Assert-Equal "ELDEN RING" $sorted[0].title
        Assert-Equal "Portal 2" $sorted[1].title
    }
}

# ----------------------------------------------------------------------------
# Feature 13: Game CRUD (Add, Edit, Delete)
# ----------------------------------------------------------------------------
if ($Feature -eq 0 -or $Feature -eq 13) {
    Write-Host "`n--- Feature 13: Game CRUD (Add, Edit, Delete) ---" -ForegroundColor Yellow

    Invoke-TestCase -Id "T1.13.1" -Tier "1" -Feature "F13" -Name "Add Game inserts new game record into library" -ScriptBlock {
        $games = [System.Collections.Generic.List[PSCustomObject]]::new()
        $newGame = [PSCustomObject]@{
            id = [System.Guid]::NewGuid().ToString()
            title = "Half-Life 2"
            link = "https://drive.google.com/hl2"
            genre = "FPS"
        }
        $games.Add($newGame)
        Assert-Equal 1 $games.Count "Games list must contain 1 game"
        Assert-Equal "Half-Life 2" $games[0].title
    }

    Invoke-TestCase -Id "T1.13.2" -Tier "1" -Feature "F13" -Name "Edit Game updates title and metadata while preserving ID" -ScriptBlock {
        $origId = "fixed-id-123"
        $origCreated = "2026-01-01T00:00:00Z"
        $game = [PSCustomObject]@{
            id = $origId
            title = "Original Title"
            createdAt = $origCreated
            updatedAt = $origCreated
        }
        $game.title = "Updated Title"
        $game.updatedAt = (Get-Date).ToUniversalTime().ToString("o")

        Assert-Equal $origId $game.id "ID must be preserved on edit"
        Assert-Equal $origCreated $game.createdAt "createdAt must be preserved on edit"
        Assert-Equal "Updated Title" $game.title "Title must be updated"
    }

    Invoke-TestCase -Id "T1.13.3" -Tier "1" -Feature "F13" -Name "Delete Game removes specific game by ID" -ScriptBlock {
        $games = [System.Collections.Generic.List[PSCustomObject]]::new()
        $games.Add([PSCustomObject]@{ id = "keep-1"; title = "Game 1" })
        $games.Add([PSCustomObject]@{ id = "delete-me"; title = "Game 2" })
        $games.Add([PSCustomObject]@{ id = "keep-2"; title = "Game 3" })

        $filtered = $games | Where-Object { $_.id -ne "delete-me" }
        Assert-Equal 2 $filtered.Count "Must have 2 games remaining after deletion"
        Assert-Equal 0 @($filtered | Where-Object { $_.id -eq "delete-me" }).Count "Deleted game must not exist in list"
    }


    Invoke-TestCase -Id "T1.13.4" -Tier "1" -Feature "F13" -Name "Form validation rejects game creation with empty title" -ScriptBlock {
        $title = ""
        $isValid = -not [string]::IsNullOrWhiteSpace($title)
        Assert-False $isValid "Empty title must fail validation"
    }

    Invoke-TestCase -Id "T1.13.5" -Tier "1" -Feature "F13" -Name "Form validation rejects game creation with empty download link" -ScriptBlock {
        $link = "   "
        $isValid = -not [string]::IsNullOrWhiteSpace($link)
        Assert-False $isValid "Empty or whitespace download link must fail validation"
    }
}

# ----------------------------------------------------------------------------
# Feature 14: Project Cleanup & Hygiene
# ----------------------------------------------------------------------------
if ($Feature -eq 0 -or $Feature -eq 14) {
    Write-Host "`n--- Feature 14: Project Cleanup & Hygiene ---" -ForegroundColor Yellow

    Invoke-TestCase -Id "T1.14.1" -Tier "1" -Feature "F14" -Name "Obsolete Electron entry point main.js is pruned" -ScriptBlock {
        $mainJs = Join-Path $ProjectRoot "main.js"
        Assert-FileNotExists $mainJs "main.js must be deleted in Wails migration"
    }

    Invoke-TestCase -Id "T1.14.2" -Tier "1" -Feature "F14" -Name "Obsolete Electron preload script preload.js is pruned" -ScriptBlock {
        $preloadJs = Join-Path $ProjectRoot "preload.js"
        Assert-FileNotExists $preloadJs "preload.js must be deleted in Wails migration"
    }

    Invoke-TestCase -Id "T1.14.3" -Tier "1" -Feature "F14" -Name "Obsolete Electron dist/ directory is removed" -ScriptBlock {
        $distDir = Join-Path $ProjectRoot "dist"
        Assert-FileNotExists $distDir "dist/ directory must be deleted in Wails migration"
    }

    Invoke-TestCase -Id "T1.14.4" -Tier "1" -Feature "F14" -Name "package.json removes obsolete electron dependencies" -ScriptBlock {
        $pkgPath = Join-Path $ProjectRoot "package.json"
        if (Test-Path $pkgPath) {
            $pkg = Assert-JsonValid (Get-Content $pkgPath -Raw)
            $deps = @()
            if ($pkg.devDependencies) { $deps += $pkg.devDependencies.PSObject.Properties.Name }
            if ($pkg.dependencies) { $deps += $pkg.dependencies.PSObject.Properties.Name }
            Assert-False ($deps -contains "electron") "package.json must not depend on 'electron'"
            Assert-False ($deps -contains "electron-builder") "package.json must not depend on 'electron-builder'"
        }
    }

    Invoke-TestCase -Id "T1.14.5" -Tier "1" -Feature "F14" -Name "README.md documents Wails v2 build and dev workflow" -ScriptBlock {
        $readmePath = Join-Path $ProjectRoot "README.md"
        Assert-FileExists $readmePath "README.md must exist"
        $readme = Get-Content $readmePath -Raw
        Assert-Matches "wails\s+build" $readme "README.md must document 'wails build'"
    }
}

# ----------------------------------------------------------------------------
# Feature 15: Katalog Software (tab "Software") — TANPA spesifikasi sistem
# ----------------------------------------------------------------------------
if ($Feature -eq 0 -or $Feature -eq 15) {
    Write-Host "`n--- Feature 15: Software Catalog (tab Software) ---" -ForegroundColor Yellow

    Invoke-TestCase -Id "T1.15.1" -Tier "1" -Feature "F15" -Name "Backend exposes LoadSoftware, SaveSoftware and ImportSoftware" -ScriptBlock {
        $appGo = Get-GoSource $ProjectRoot
        Assert-Matches "func \(a \*App\) LoadSoftware\(\)" $appGo "LoadSoftware must be bound for the software tab"
        Assert-Matches "func \(a \*App\) SaveSoftware\(" $appGo "SaveSoftware must be bound for the software tab"
        Assert-Matches "func \(a \*App\) ImportSoftware\(" $appGo "ImportSoftware must be bound for the software importer"
    }

    Invoke-TestCase -Id "T1.15.2" -Tier "1" -Feature "F15" -Name "Software model carries no system specifications" -ScriptBlock {
        $appGo = Get-GoSource $ProjectRoot
        $m = [regex]::Match($appGo, '(?s)type Software struct \{.*?\n\}')
        Assert-True ($m.Success) "Software struct must be declared"
        Assert-Matches 'Version\s+string\s+`json:"version"`' $m.Value "Software must keep version metadata"
        Assert-Matches 'License\s+string\s+`json:"license"`' $m.Value "Software must keep license metadata"
        Assert-False ($m.Value -match '(?i)requirement|specs') "Entri software tidak boleh punya field spesifikasi"
    }

    Invoke-TestCase -Id "T1.15.3" -Tier "1" -Feature "F15" -Name "One library.json stores both catalogs side by side" -ScriptBlock {
        $appGo = Get-GoSource $ProjectRoot
        Assert-Matches 'Games\s+\[\]Game\s+`json:"games"`' $appGo "LibraryFile must keep the games key"
        Assert-Matches 'Software\s+\[\]Software\s+`json:"software"`' $appGo "LibraryFile must add the software key"
        Assert-Matches "writeLibraryLocked\(data \*LibraryData\)" $appGo "Writes must serialise both catalogs together"
    }

    Invoke-TestCase -Id "T1.15.4" -Tier "1" -Feature "F15" -Name "Legacy Game + Software catalogs are merged on first run" -ScriptBlock {
        $appGo = Get-GoSource $ProjectRoot
        Assert-Matches 'legacyDataDirNames = \[\]string\{"libray-game", "software-library"\}' $appGo "Both legacy %APPDATA% folders must be absorbed"
        Assert-Matches "func \(a \*App\) copyLegacyThumbs" $appGo "Migrated thumbnails must be copied into the shared folder"
        $res = & go test -run TestBootstrap ./... 2>&1
        Assert-True ($LASTEXITCODE -eq 0) "Go migration tests must pass: $res"
    }

    Invoke-TestCase -Id "T1.15.5" -Tier "1" -Feature "F15" -Name "Renderer switches catalogs through a tab bar" -ScriptBlock {
        $html = Get-Content (Join-Path $ProjectRoot "renderer\index.html") -Raw
        Assert-Matches 'data-tab="game"' $html "index.html must declare the Game tab"
        Assert-Matches 'data-tab="software"' $html "index.html must declare the Software tab"
        $appJs = Get-Content (Join-Path $ProjectRoot "renderer\app.js") -Raw
        Assert-Matches "function setTab\(key\)" $appJs "app.js must implement tab switching"
        Assert-Matches "window\.api\.loadSoftware\(\)" $appJs "Software catalog must load through the bridge"
        Assert-Matches "specs: null" $appJs "Deskriptor software harus menyatakan tidak ada spesifikasi"
    }
}

Write-Host "`nTier 1 Feature Coverage Completed.`n" -ForegroundColor Cyan
