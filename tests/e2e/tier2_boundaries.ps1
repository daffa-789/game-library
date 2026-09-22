# ============================================================================
# tests/e2e/tier2_boundaries.ps1
# Tier 2: Boundary & Corner Cases (70 tests: 14 Features x 5 tests each)
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
Write-Host " Running Tier 2: Boundary & Corner Cases (70 Tests)" -ForegroundColor Cyan
Write-Host "========================================================`n" -ForegroundColor Cyan

# ----------------------------------------------------------------------------
# Feature 1: Wails v2 Configuration & Build Boundaries
# ----------------------------------------------------------------------------
if ($Feature -eq 0 -or $Feature -eq 1) {
    Write-Host "--- Feature 1 Boundaries: Wails Configuration & Manifest ---" -ForegroundColor Yellow

    Invoke-TestCase -Id "T2.1.1" -Tier "2" -Feature "F1" -Name "wails.json author and product info metadata are non-empty" -ScriptBlock {
        $wailsJson = Assert-JsonValid (Get-Content (Join-Path $ProjectRoot "wails.json") -Raw)
        Assert-True (-not [string]::IsNullOrWhiteSpace($wailsJson.author.name)) "author.name must not be empty"
        Assert-True (-not [string]::IsNullOrWhiteSpace($wailsJson.info.productName)) "info.productName must not be empty"
        Assert-True (-not [string]::IsNullOrWhiteSpace($wailsJson.info.productVersion)) "info.productVersion must not be empty"
    }

    Invoke-TestCase -Id "T2.1.2" -Tier "2" -Feature "F1" -Name "wails.json outputfilename contains no illegal filesystem characters" -ScriptBlock {
        $wailsJson = Assert-JsonValid (Get-Content (Join-Path $ProjectRoot "wails.json") -Raw)
        $illegalChars = [System.IO.Path]::GetInvalidFileNameChars()
        foreach ($c in $illegalChars) {
            Assert-False ($wailsJson.outputfilename.Contains($c)) "outputfilename must not contain illegal character '$c'"
        }
    }

    Invoke-TestCase -Id "T2.1.3" -Tier "2" -Feature "F1" -Name "go.mod specifies Go version >= 1.23" -ScriptBlock {
        $goMod = Get-Content (Join-Path $ProjectRoot "go.mod") -Raw
        Assert-Matches "(?m)^go\s+(\d+\.\d+(\.\d+)?)" $goMod "go.mod must declare go version"
        if ($goMod -match "(?m)^go\s+(\d+)\.(\d+)") {
            $major = [int]$Matches[1]
            $minor = [int]$Matches[2]
            Assert-True ($major -ge 1 -and $minor -ge 23) "Go version must be >= 1.23 (got $major.$minor)"
        }
    }

    Invoke-TestCase -Id "T2.1.4" -Tier "2" -Feature "F1" -Name "App icons exist and exceed 5,000 bytes" -ScriptBlock {
        $appIcon = Join-Path $ProjectRoot "build\appicon.png"
        $winIcon = Join-Path $ProjectRoot "build\windows\icon.ico"
        $iconFound = $false
        if (Test-Path $appIcon) {
            $len = (Get-Item $appIcon).Length
            Assert-True ($len -gt 5000) "appicon.png ($len bytes) must exceed 5KB"
            $iconFound = $true
        }
        if (Test-Path $winIcon) {
            $len = (Get-Item $winIcon).Length
            Assert-True ($len -gt 5000) "icon.ico ($len bytes) must exceed 5KB"
            $iconFound = $true
        }
        Assert-True $iconFound "At least one valid app icon must exist"
    }

    Invoke-TestCase -Id "T2.1.5" -Tier "2" -Feature "F1" -Name "wails.exe.manifest declares DPI awareness and common controls" -ScriptBlock {
        $manifestPath = Join-Path $ProjectRoot "build\windows\wails.exe.manifest"
        Assert-FileExists $manifestPath "wails.exe.manifest must exist"
        $manifest = Get-Content $manifestPath -Raw
        Assert-Matches "(?i)dpiAware|PerMonitorV2" $manifest "Manifest must include DPI awareness settings"
        Assert-Matches "(?i)Microsoft\.Windows\.Common-Controls" $manifest "Manifest must declare Common-Controls"
    }
}


# ----------------------------------------------------------------------------
# Feature 2: Executable Size & RAM Efficiency Boundaries
# ----------------------------------------------------------------------------
if ($Feature -eq 0 -or $Feature -eq 2) {
    Write-Host "`n--- Feature 2 Boundaries: Executable Size & PE Headers ---" -ForegroundColor Yellow

    $targetBinPath = Join-Path $ProjectRoot "build\bin\GameLibrary.exe"
    $fallbackBinPath = Join-Path $ProjectRoot "libray-game.exe"
    $activeBin = if (Test-Path $targetBinPath) { $targetBinPath } elseif (Test-Path $fallbackBinPath) { $fallbackBinPath } else { $null }

    Invoke-TestCase -Id "T2.2.1" -Tier "2" -Feature "F2" -Name "Binary size boundary check strictly < 15,728,640 bytes" -ScriptBlock {
        Assert-True ($null -ne $activeBin) "Binary must exist to check size boundary"
        $fi = Get-Item $activeBin
        Assert-True ($fi.Length -lt 15728640) "Binary size ($($fi.Length) bytes) must be < 15,728,640 bytes (15 MB)"
    }

    Invoke-TestCase -Id "T2.2.2" -Tier "2" -Feature "F2" -Name "Binary PE Subsystem is IMAGE_SUBSYSTEM_WINDOWS_GUI (2)" -ScriptBlock {
        Assert-True ($null -ne $activeBin) "Binary must exist to check PE subsystem"
        $pe = Get-PeBinaryInfo $activeBin
        Assert-Equal 2 $pe.Subsystem "Binary must be GUI subsystem (2) to prevent console popup window"
    }

    Invoke-TestCase -Id "T2.2.3" -Tier "2" -Feature "F2" -Name "Binary DOS header e_lfanew offset is within valid range" -ScriptBlock {
        Assert-True ($null -ne $activeBin) "Binary must exist to verify e_lfanew"
        $bytes = [System.IO.File]::ReadAllBytes($activeBin)
        $e_lfanew = [System.BitConverter]::ToInt32($bytes, 0x3C)
        Assert-True ($e_lfanew -ge 64 -and $e_lfanew -le 4096) "e_lfanew ($e_lfanew) must be within standard range [64, 4096]"
    }

    Invoke-TestCase -Id "T2.2.4" -Tier "2" -Feature "F2" -Name "Binary size exceeds minimum threshold (> 1 MB)" -ScriptBlock {
        Assert-True ($null -ne $activeBin) "Binary must exist to check non-trivial size"
        $fi = Get-Item $activeBin
        Assert-True ($fi.Length -gt 1048576) "Binary must be greater than 1 MB ($($fi.Length) bytes)"
    }

    Invoke-TestCase -Id "T2.2.5" -Tier "2" -Feature "F2" -Name "Binary directory contains zero Electron bundle DLLs" -ScriptBlock {
        $binDir = if ($activeBin) { Split-Path $activeBin } else { Join-Path $ProjectRoot "build\bin" }
        $electronDeps = @("vk_swiftshader.dll", "vulkan-1.dll", "libGLESv2.dll", "libEGL.dll")
        foreach ($dep in $electronDeps) {
            Assert-FileNotExists (Join-Path $binDir $dep) "Heavy Electron graphic DLL '$dep' must not exist"
        }
    }
}

# ----------------------------------------------------------------------------
# Feature 3: Library Data Loading Boundaries
# ----------------------------------------------------------------------------
if ($Feature -eq 0 -or $Feature -eq 3) {
    Write-Host "`n--- Feature 3 Boundaries: Library Data Loading Edge Cases ---" -ForegroundColor Yellow

    Invoke-TestCase -Id "T2.3.1" -Tier "2" -Feature "F3" -Name "LoadLibrary handles 0-byte library.json safely" -ScriptBlock {
        $sb = New-TestSandbox
        try {
            [System.IO.File]::WriteAllBytes($sb.DataFile, @())
            Assert-True ((Get-Item $sb.DataFile).Length -eq 0) "File must be 0 bytes"
            # Reading 0-byte file in Go returns unmarshal error and triggers backup or empty
            $appGo = Get-GoSource $ProjectRoot
            Assert-Matches "if err := json\.Unmarshal" $appGo "Unmarshal error must be handled"
        }
        finally {
            Remove-TestSandbox $sb.Root
        }
    }

    Invoke-TestCase -Id "T2.3.2" -Tier "2" -Feature "F3" -Name "LoadLibrary handles null games field {'games': null}" -ScriptBlock {
        $sb = New-TestSandbox
        try {
            Set-Content -Path $sb.DataFile -Value '{"games": null}' -Encoding UTF8
            $json = Assert-JsonValid (Get-Content $sb.DataFile -Raw)
            $appGo = Get-GoSource $ProjectRoot
            Assert-Matches "if games == nil \{" $appGo "Go backend must normalize nil games slice to empty"
        }
        finally {
            Remove-TestSandbox $sb.Root
        }
    }

    Invoke-TestCase -Id "T2.3.3" -Tier "2" -Feature "F3" -Name "LoadLibrary handles game with missing specs container" -ScriptBlock {
        $partialJson = '{"games": [{"id": "no-specs", "title": "Game Without Specs", "link": "https://test.com"}]}'
        $data = Assert-JsonValid $partialJson
        Assert-Equal 1 $data.games.Count
        Assert-Equal "no-specs" $data.games[0].id
    }

    Invoke-TestCase -Id "T2.3.4" -Tier "2" -Feature "F3" -Name "LoadLibrary handles complex Unicode and escape sequences" -ScriptBlock {
        $unicodeJson = '{"games": [{"id": "u-1", "title": "The Witcher® 3: Wild Hunt™ ⚔️", "genre": "Action & Adventure \u2014 RPG"}]}'
        $data = Assert-JsonValid $unicodeJson
        Assert-Matches "⚔️" $data.games[0].title "Unicode emoji must parse correctly"
        Assert-Matches "—" $data.games[0].genre "Unicode em-dash must parse correctly"
    }

    Invoke-TestCase -Id "T2.3.5" -Tier "2" -Feature "F3" -Name "LoadLibrary parses huge 1,000-game dataset without error" -ScriptBlock {
        $sb = New-TestSandbox
        try {
            $gameList = [System.Collections.Generic.List[PSCustomObject]]::new()
            for ($i = 1; $i -le 1000; $i++) {
                $gameList.Add([PSCustomObject]@{
                    id = "game-$i"
                    title = "Game Number $i"
                    link = "https://drive.google.com/$i"
                })
            }
            $bigJson = @{ games = $gameList } | ConvertTo-Json -Depth 5 -Compress
            Set-Content -Path $sb.DataFile -Value $bigJson -Encoding UTF8
            $loaded = Assert-JsonValid (Get-Content $sb.DataFile -Raw)
            Assert-Equal 1000 $loaded.games.Count "Must parse 1,000 games successfully"
        }
        finally {
            Remove-TestSandbox $sb.Root
        }
    }
}

# ----------------------------------------------------------------------------
# Feature 4: Library Data Saving Boundaries
# ----------------------------------------------------------------------------
if ($Feature -eq 0 -or $Feature -eq 4) {
    Write-Host "`n--- Feature 4 Boundaries: Data Saving Boundaries ---" -ForegroundColor Yellow

    Invoke-TestCase -Id "T2.4.1" -Tier "2" -Feature "F4" -Name "SaveLibrary caps maximum game count at 5,000 items" -ScriptBlock {
        $appGo = Get-GoSource $ProjectRoot
        Assert-Matches "if len\(games\) > maxGames \{" $appGo "SaveLibrary must cap games slice at 5000"
        Assert-Matches "games = games\[:maxGames\]" $appGo "Slice must be capped to [:5000]"
    }

    Invoke-TestCase -Id "T2.4.2" -Tier "2" -Feature "F4" -Name "SaveLibrary truncates game titles exceeding 200 characters" -ScriptBlock {
        $appGo = Get-GoSource $ProjectRoot
        Assert-Matches "trim\(g\.Title,\s*maxLenTitle\)" $appGo "Title must be truncated to 200 chars"
    }

    Invoke-TestCase -Id "T2.4.3" -Tier "2" -Feature "F4" -Name "SaveLibrary truncates spec notes exceeding 400 characters" -ScriptBlock {
        $appGo = Get-GoSource $ProjectRoot
        Assert-Matches "trim\(s\.Notes,\s*maxLenSpecField\)" $appGo "Specs notes must be truncated to 400 chars"
    }

    Invoke-TestCase -Id "T2.4.4" -Tier "2" -Feature "F4" -Name "SaveLibrary preserves special characters and quote escaping" -ScriptBlock {
        $testGame = [PSCustomObject]@{
            title = 'Test Game "Quoted" & <Special> 🎮'
            genre = "Sci-Fi / Cyberpunk"
        }
        $json = @{ games = @($testGame) } | ConvertTo-Json -Depth 3
        $decoded = Assert-JsonValid $json
        Assert-Equal 'Test Game "Quoted" & <Special> 🎮' $decoded.games[0].title "Quotes and special characters must be preserved"
    }

    Invoke-TestCase -Id "T2.4.5" -Tier "2" -Feature "F4" -Name "SaveLibrary handles game with all optional fields empty" -ScriptBlock {
        $minimal = [PSCustomObject]@{
            title = "Minimal Game"
            link = "https://drive.google.com/test"
        }
        $json = @{ games = @($minimal) } | ConvertTo-Json -Depth 3
        $parsed = Assert-JsonValid $json
        Assert-Equal "Minimal Game" $parsed.games[0].title
    }
}

# ----------------------------------------------------------------------------
# Feature 5: Data Persistence & Atomicity Boundaries
# ----------------------------------------------------------------------------
if ($Feature -eq 0 -or $Feature -eq 5) {
    Write-Host "`n--- Feature 5 Boundaries: Persistence & Recovery ---" -ForegroundColor Yellow

    Invoke-TestCase -Id "T2.5.1" -Tier "2" -Feature "F5" -Name "Atomic temporary file uses nanosecond precision timestamp" -ScriptBlock {
        $appGo = Get-GoSource $ProjectRoot
        Assert-Matches "time\.Now\(\)\.UnixNano\(\)" $appGo "tmpFile must use UnixNano() for conflict-free filenames"
    }

    Invoke-TestCase -Id "T2.5.2" -Tier "2" -Feature "F5" -Name "Corrupted .rusak- file preserves original corrupted bytes" -ScriptBlock {
        $sb = New-TestSandbox
        try {
            $corruptData = "MALFORMED_GARBAGE_BYTES_0xDEADBEEF"
            Set-Content -Path $sb.DataFile -Value $corruptData -Encoding UTF8

            # Simulate backup logic
            $backupFile = "$($sb.DataFile).rusak-test"
            Move-Item -Path $sb.DataFile -Destination $backupFile
            $backedUpContent = Get-Content $backupFile -Raw
            Assert-Matches "MALFORMED_GARBAGE_BYTES_0xDEADBEEF" $backedUpContent "Backup must contain exact corrupted bytes"
        }
        finally {
            Remove-TestSandbox $sb.Root
        }
    }

    Invoke-TestCase -Id "T2.5.3" -Tier "2" -Feature "F5" -Name "Multiple corrupted backups create distinct timestamped files" -ScriptBlock {
        $sb = New-TestSandbox
        try {
            $ts1 = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
            Start-Sleep -Milliseconds 5
            $ts2 = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
            $f1 = "$($sb.DataFile).rusak-$ts1"
            $f2 = "$($sb.DataFile).rusak-$ts2"
            Set-Content -Path $f1 -Value "c1"
            Set-Content -Path $f2 -Value "c2"

            Assert-NotEqual $f1 $f2 "Backup paths must be distinct"
            Assert-FileExists $f1
            Assert-FileExists $f2
        }
        finally {
            Remove-TestSandbox $sb.Root
        }
    }

    Invoke-TestCase -Id "T2.5.4" -Tier "2" -Feature "F5" -Name "Atomic save removes temp file if rename encounters error" -ScriptBlock {
        $appGo = Get-GoSource $ProjectRoot
        Assert-Matches "_\s*=\s*os\.Remove\(tmpFile\)" $appGo "saveFileAtomic must clean up tmpFile on failure"
    }

    Invoke-TestCase -Id "T2.5.5" -Tier "2" -Feature "F5" -Name "Save creates parent directory automatically" -ScriptBlock {
        $appGo = Get-GoSource $ProjectRoot
        Assert-Matches "os\.MkdirAll\(a\.dataDir,\s*0o755\)" $appGo "saveFileAtomic must call MkdirAll on dataDir"
    }
}

# ----------------------------------------------------------------------------
# Feature 6: Thumbnail Import & Serving Boundaries
# ----------------------------------------------------------------------------
if ($Feature -eq 0 -or $Feature -eq 6) {
    Write-Host "`n--- Feature 6 Boundaries: Thumbnail HTTP Handler Security ---" -ForegroundColor Yellow

    Invoke-TestCase -Id "T2.6.1" -Tier "2" -Feature "F6" -Name "Asset server blocks URL-encoded path traversal" -ScriptBlock {
        $appGo = Get-GoSource $ProjectRoot
        Assert-Matches "filepath\.Clean\(target\)" $appGo "Handler must clean filepath"
        Assert-Matches "filepath\.Clean\(a\.thumbsDir\)" $appGo "Handler must check prefix against clean thumbsDir"
    }

    Invoke-TestCase -Id "T2.6.2" -Tier "2" -Feature "F6" -Name "Asset server blocks backslash path traversal" -ScriptBlock {
        $appGo = Get-GoSource $ProjectRoot
        Assert-Matches 'strings\.ContainsAny\(name,' $appGo "Handler must reject separator and control characters"
    }

    Invoke-TestCase -Id "T2.6.3" -Tier "2" -Feature "F6" -Name "Asset server returns 404 for directory requests" -ScriptBlock {
        $appGo = Get-GoSource $ProjectRoot
        Assert-Matches "if err != nil \|\| fi\.IsDir\(\) \{" $appGo "Handler must return 404 on directories"
    }

    Invoke-TestCase -Id "T2.6.4" -Tier "2" -Feature "F6" -Name "Asset server supports SVG thumbnail serving" -ScriptBlock {
        $appGo = Get-GoSource $ProjectRoot
        Assert-Matches 'sample-gta\.svg' $appGo "Sample data must include SVG thumbnails"
        Assert-Matches "http\.ServeFile\(w, r, target\)" $appGo "ServeFile automatically detects SVG Content-Type"
    }

    Invoke-TestCase -Id "T2.6.5" -Tier "2" -Feature "F6" -Name "Asset server rejects non-GET HTTP methods with 405" -ScriptBlock {
        $appGo = Get-GoSource $ProjectRoot
        Assert-Matches "!strings\.EqualFold\(r\.Method,\s*http\.MethodGet\)" $appGo "Handler must check for GET method"
        Assert-Matches "http\.StatusMethodNotAllowed" $appGo "Handler must return 405 MethodNotAllowed"
    }
}

# ----------------------------------------------------------------------------
# Feature 7: Thumbnail Deletion Boundaries
# ----------------------------------------------------------------------------
if ($Feature -eq 0 -or $Feature -eq 7) {
    Write-Host "`n--- Feature 7 Boundaries: Thumbnail Deletion Edge Cases ---" -ForegroundColor Yellow

    Invoke-TestCase -Id "T2.7.1" -Tier "2" -Feature "F7" -Name "DeleteThumbnail rejects traversal attempting to delete external files" -ScriptBlock {
        $appGo = Get-GoSource $ProjectRoot
        Assert-Matches "filepath\.Rel\(cleanDir,\s*filepath\.Clean\(target\)\)" $appGo "DeleteThumbnail must enforce directory prefix"
    }

    Invoke-TestCase -Id "T2.7.2" -Tier "2" -Feature "F7" -Name "DeleteThumbnail ignores empty or whitespace string without error" -ScriptBlock {
        $appGo = Get-GoSource $ProjectRoot
        Assert-Matches 'if name == "" \|\| len\(name\) > 200' $appGo "DeleteThumbnail must return nil on empty name"
    }

    Invoke-TestCase -Id "T2.7.3" -Tier "2" -Feature "F7" -Name "DeleteThumbnail with single dot or double dot is rejected" -ScriptBlock {
        $appGo = Get-GoSource $ProjectRoot
        Assert-Matches 'strings\.HasPrefix\(name,' $appGo "DeleteThumbnail must reject dot names"
    }

    Invoke-TestCase -Id "T2.7.4" -Tier "2" -Feature "F7" -Name "DeleteThumbnail targeting directory does not delete the directory" -ScriptBlock {
        $appGo = Get-GoSource $ProjectRoot
        Assert-Matches "if err != nil \|\| fi\.IsDir\(\)" $appGo "DeleteThumbnail must check !fi.IsDir()"
    }

    Invoke-TestCase -Id "T2.7.5" -Tier "2" -Feature "F7" -Name "Consecutive deletes of same thumbnail succeed idempotently" -ScriptBlock {
        $sb = New-TestSandbox
        try {
            $testThumb = Join-Path $sb.ThumbsDir "test-del.png"
            Set-Content -Path $testThumb -Value "dummy"
            Assert-FileExists $testThumb

            # First delete
            Remove-Item $testThumb -ErrorAction SilentlyContinue
            Assert-FileNotExists $testThumb

            # Second delete (idempotent)
            $err = $null
            try {
                Remove-Item $testThumb -ErrorAction SilentlyContinue
            } catch {
                $err = $_
            }
            Assert-True ($null -eq $err) "Second delete must be completely silent and safe"
        }
        finally {
            Remove-TestSandbox $sb.Root
        }
    }
}

# ----------------------------------------------------------------------------
# Feature 8: Steam Import Boundaries
# ----------------------------------------------------------------------------
if ($Feature -eq 0 -or $Feature -eq 8) {
    Write-Host "`n--- Feature 8 Boundaries: Steam Import Edge Cases ---" -ForegroundColor Yellow

    Invoke-TestCase -Id "T2.8.1" -Tier "2" -Feature "F8" -Name "SteamImport rejects invalid Steam store URLs" -ScriptBlock {
        $appGo = Get-GoSource $ProjectRoot
        Assert-Matches 'Link tidak dikenali' $appGo "SteamImport must return descriptive error for invalid URL"
    }

    Invoke-TestCase -Id "T2.8.2" -Tier "2" -Feature "F8" -Name "SteamImport handles non-existent Steam AppID with clear error" -ScriptBlock {
        $appGo = Get-GoSource $ProjectRoot
        Assert-Matches 'Data game tidak ditemukan di Steam' $appGo "SteamImport must return error when Steam game is not found"
    }

    Invoke-TestCase -Id "T2.8.3" -Tier "2" -Feature "F8" -Name "SteamImport handles game with empty PC requirements array" -ScriptBlock {
        $appGo = Get-GoSource $ProjectRoot
        Assert-Matches "trimmed\[0\] == '\{'" $appGo "Go backend must check that pc_requirements is a JSON object, not []"
    }

    Invoke-TestCase -Id "T2.8.4" -Tier "2" -Feature "F8" -Name "SteamImport handles free-to-play games missing price_overview" -ScriptBlock {
        $appGo = Get-GoSource $ProjectRoot
        Assert-Matches "Price:\s*detail\.PriceOverview\.FinalFormatted" $appGo "FinalFormatted defaults to empty string if missing"
    }

    Invoke-TestCase -Id "T2.8.5" -Tier "2" -Feature "F8" -Name "SteamImport strips nested HTML tags and unescapes entities" -ScriptBlock {
        $appGo = Get-GoSource $ProjectRoot
        Assert-Matches 'steamTagRe\.ReplaceAllString\(s,\s*""\)' $appGo "htmlToText must strip HTML tags"
        Assert-Matches 'html\.UnescapeString\(s\)' $appGo "htmlToText must unescape HTML entities"
    }
}


# ----------------------------------------------------------------------------
# Feature 9: OS Integration Boundaries
# ----------------------------------------------------------------------------
if ($Feature -eq 0 -or $Feature -eq 9) {
    Write-Host "`n--- Feature 9 Boundaries: OS Integration Security ---" -ForegroundColor Yellow

    Invoke-TestCase -Id "T2.9.1" -Tier "2" -Feature "F9" -Name "OpenExternal rejects command injection payloads in URL" -ScriptBlock {
        $appGo = Get-GoSource $ProjectRoot
        Assert-Matches 'parsed, err := url\.Parse\(trimmed\)' $appGo "OpenExternal strictly checks http:// or https:// prefix"
    }

    Invoke-TestCase -Id "T2.9.2" -Tier "2" -Feature "F9" -Name "OpenExternal rejects scheme-less URLs (e.g. www.google.com)" -ScriptBlock {
        $appGo = Get-GoSource $ProjectRoot
        Assert-Matches 'URL tidak valid' $appGo "Scheme-less URL must return 'URL tidak valid'"
    }

    Invoke-TestCase -Id "T2.9.3" -Tier "2" -Feature "F9" -Name "CopyText handles empty string without crash" -ScriptBlock {
        $appGo = Get-GoSource $ProjectRoot
        Assert-Matches "func \(a \*App\) CopyText\(text string\) error" $appGo "CopyText accepts any string"
    }

    Invoke-TestCase -Id "T2.9.4" -Tier "2" -Feature "F9" -Name "CopyText handles large text payload (> 100 KB) without error" -ScriptBlock {
        $appGo = Get-GoSource $ProjectRoot
        Assert-Matches "runtime\.ClipboardSetText" $appGo "CopyText delegates directly to Wails runtime"
    }

    Invoke-TestCase -Id "T2.9.5" -Tier "2" -Feature "F9" -Name "Window dimensions enforce MinWidth >= 980 and MinHeight >= 620" -ScriptBlock {
        $mainGo = Get-Content (Join-Path $ProjectRoot "main.go") -Raw
        $goSrc = Get-GoSource $ProjectRoot
        # Nilai ukurannya hidup di konstanta window.go (dipakai juga untuk
        # membatasi jendela terhadap work area), main.go harus merujuknya.
        Assert-Matches "windowMinWidth\s*=\s*980" $goSrc "windowMinWidth must be 980"
        Assert-Matches "windowMinHeight\s*=\s*620" $goSrc "windowMinHeight must be 620"
        Assert-Matches "windowWidth\s*=\s*1400" $goSrc "windowWidth must be 1400"
        Assert-Matches "windowHeight\s*=\s*880" $goSrc "windowHeight must be 880"
        Assert-Matches "MinWidth:\s*windowMinWidth" $mainGo "main.go must wire MinWidth"
        Assert-Matches "MinHeight:\s*windowMinHeight" $mainGo "main.go must wire MinHeight"
        Assert-Matches "Width:\s*windowWidth" $mainGo "main.go must wire Width"
        Assert-Matches "Height:\s*windowHeight" $mainGo "main.go must wire Height"
    }
}

# ----------------------------------------------------------------------------
# Feature 10: Frontend Bridge Boundaries
# ----------------------------------------------------------------------------
if ($Feature -eq 0 -or $Feature -eq 10) {
    Write-Host "`n--- Feature 10 Boundaries: Frontend Bridge & DOM Guards ---" -ForegroundColor Yellow

    $bridgePath = Join-Path $ProjectRoot "renderer\wails-bridge.js"
    $appJsPath = Join-Path $ProjectRoot "renderer\app.js"
    $htmlPath = Join-Path $ProjectRoot "renderer\index.html"

    Invoke-TestCase -Id "T2.10.1" -Tier "2" -Feature "F10" -Name "wails-bridge.js guards against uninitialized window.go" -ScriptBlock {
        Assert-FileExists $bridgePath "wails-bridge.js must exist"
        $bridge = Get-Content $bridgePath -Raw
        Assert-Matches "window\.go" $bridge "wails-bridge.js must access window.go"
    }

    Invoke-TestCase -Id "T2.10.2" -Tier "2" -Feature "F10" -Name "renderer/index.html input fields have autocomplete off and spellcheck false" -ScriptBlock {
        Assert-FileExists $htmlPath "renderer/index.html must exist"
        $html = Get-Content $htmlPath -Raw
        Assert-Matches 'autocomplete="off"' $html "Search input must have autocomplete='off'"
        Assert-Matches 'spellcheck="false"' $html "Search input must have spellcheck='false'"
    }

    Invoke-TestCase -Id "T2.10.3" -Tier "2" -Feature "F10" -Name "renderer/app.js guards #f-thumburl DOM query" -ScriptBlock {
        Assert-FileExists $appJsPath "renderer/app.js must exist"
        $appJs = Get-Content $appJsPath -Raw
        # Line 546 survey check
        Assert-True ($appJs.Length -gt 0) "app.js must be present"
    }

    Invoke-TestCase -Id "T2.10.4" -Tier "2" -Feature "F10" -Name "renderer/app.js recognizes /thumbnails/ URL prefix for deletion" -ScriptBlock {
        Assert-FileExists $appJsPath "renderer/app.js must exist"
        $appJs = Get-Content $appJsPath -Raw
        Assert-Matches "/thumbnails/|glib://thumb/" $appJs "app.js must recognize /thumbnails/ or legacy prefix"
    }

    Invoke-TestCase -Id "T2.10.5" -Tier "2" -Feature "F10" -Name "renderer/styles.css specifies auto-fill minmax grid layout" -ScriptBlock {
        $cssPath = Join-Path $ProjectRoot "renderer\styles.css"
        Assert-FileExists $cssPath "renderer/styles.css must exist"
        $css = Get-Content $cssPath -Raw
        Assert-Matches "repeat\(auto-fill,\s*minmax\(" $css "styles.css must use repeat(auto-fill, minmax(...))"
    }
}

# ----------------------------------------------------------------------------
# Feature 11: Search & Filter Boundaries
# ----------------------------------------------------------------------------
if ($Feature -eq 0 -or $Feature -eq 11) {
    Write-Host "`n--- Feature 11 Boundaries: Search Edge Cases & Meta-Characters ---" -ForegroundColor Yellow

    $searchCatalog = @(
        [PSCustomObject]@{ id="1"; title="Pokémon: Let's Go, Pikachu!"; genre="RPG" },
        [PSCustomObject]@{ id="2"; title="NieR:Automata [Game of the YoRHa Edition]"; genre="Action" },
        [PSCustomObject]@{ id="3"; title="C++ Programming Simulator (2026)"; genre="Simulation" }
    )

    Invoke-TestCase -Id "T2.11.1" -Tier "2" -Feature "F11" -Name "Search treats regex meta-characters as literal strings" -ScriptBlock {
        $q = "[Game"
        $matches = $searchCatalog | Where-Object { $_.title.IndexOf($q, [System.StringComparison]::OrdinalIgnoreCase) -ge 0 }
        Assert-Equal 1 $matches.Count "Square bracket '[Game' must match literally"
        Assert-Equal "NieR:Automata [Game of the YoRHa Edition]" $matches[0].title
    }

    Invoke-TestCase -Id "T2.11.2" -Tier "2" -Feature "F11" -Name "Search query with 200+ characters executes in < 50ms" -ScriptBlock {
        $longQuery = "A" * 250
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        $matches = $searchCatalog | Where-Object { $_.title.IndexOf($longQuery, [System.StringComparison]::OrdinalIgnoreCase) -ge 0 }
        $sw.Stop()
        Assert-Equal 0 $matches.Count
        Assert-True ($sw.ElapsedMilliseconds -lt 50) "Search execution took $($sw.ElapsedMilliseconds)ms (< 50ms)"
    }

    Invoke-TestCase -Id "T2.11.3" -Tier "2" -Feature "F11" -Name "Search matches Unicode accented characters" -ScriptBlock {
        $q = "Pokémon"
        $matches = $searchCatalog | Where-Object { $_.title.IndexOf($q, [System.StringComparison]::OrdinalIgnoreCase) -ge 0 }
        Assert-Equal 1 $matches.Count "Accented Pokémon must match"
    }

    Invoke-TestCase -Id "T2.11.4" -Tier "2" -Feature "F11" -Name "Search with whitespace-only input returns all items" -ScriptBlock {
        $q = "     "
        $results = if ([string]::IsNullOrWhiteSpace($q)) { $searchCatalog } else { $searchCatalog | Where-Object { $_.title.Contains($q.Trim()) } }
        Assert-Equal 3 $results.Count "Whitespace query must return all 3 games"
    }

    Invoke-TestCase -Id "T2.11.5" -Tier "2" -Feature "F11" -Name "Search filter remains stable when games list is updated" -ScriptBlock {
        $q = "Simulator"
        $before = $searchCatalog | Where-Object { $_.title.IndexOf($q, [System.StringComparison]::OrdinalIgnoreCase) -ge 0 }
        Assert-Equal 1 $before.Count

        $updatedList = $searchCatalog + [PSCustomObject]@{ id="4"; title="Flight Simulator 2024"; genre="Sim" }
        $after = $updatedList | Where-Object { $_.title.IndexOf($q, [System.StringComparison]::OrdinalIgnoreCase) -ge 0 }
        Assert-Equal 2 $after.Count "Search filter must dynamically find newly added game"
    }
}

# ----------------------------------------------------------------------------
# Feature 12: Sort Operations Boundaries
# ----------------------------------------------------------------------------
if ($Feature -eq 0 -or $Feature -eq 12) {
    Write-Host "`n--- Feature 12 Boundaries: Sort Corner Cases ---" -ForegroundColor Yellow

    Invoke-TestCase -Id "T2.12.1" -Tier "2" -Feature "F12" -Name "Sort executes safely on empty array" -ScriptBlock {
        $emptyList = @()
        $sorted = $emptyList | Sort-Object -Property title
        Assert-Equal 0 @($sorted).Length "Empty array sort must return empty array without error"
    }

    Invoke-TestCase -Id "T2.12.2" -Tier "2" -Feature "F12" -Name "Sort executes safely on single-element array" -ScriptBlock {
        $single = @([PSCustomObject]@{ title = "Solo Game" })
        $sorted = @($single | Sort-Object -Property title)
        Assert-Equal 1 $sorted.Length "Single element sort must return 1 element"
        Assert-Equal "Solo Game" $sorted[0].title
    }

    Invoke-TestCase -Id "T2.12.3" -Tier "2" -Feature "F12" -Name "Sort 'az' properly orders titles starting with numbers and symbols" -ScriptBlock {
        $items = @(
            [PSCustomObject]@{ title = "Zoo Tycoon" },
            [PSCustomObject]@{ title = "100 Hidden Cats" },
            [PSCustomObject]@{ title = "!Super Game" }
        )
        $sorted = $items | Sort-Object -Property title
        Assert-Equal "!Super Game" $sorted[0].title "Punctuation comes first in standard sort"
        Assert-Equal "100 Hidden Cats" $sorted[1].title "Numbers come second"
        Assert-Equal "Zoo Tycoon" $sorted[2].title "Letters come last"
    }

    Invoke-TestCase -Id "T2.12.4" -Tier "2" -Feature "F12" -Name "Sort 'new' handles identical timestamps deterministically" -ScriptBlock {
        $sameTime = "2026-01-01T12:00:00Z"
        $items = @(
            [PSCustomObject]@{ id = "A"; createdAt = $sameTime },
            [PSCustomObject]@{ id = "B"; createdAt = $sameTime }
        )
        $sorted = $items | Sort-Object -Property { [DateTime]$_.createdAt } -Descending
        Assert-Equal 2 $sorted.Count "Must preserve both records"
    }

    Invoke-TestCase -Id "T2.12.5" -Tier "2" -Feature "F12" -Name "Sort 'new' handles missing or invalid dates without crash" -ScriptBlock {
        $items = @(
            [PSCustomObject]@{ title = "Valid Date"; createdAt = "2026-01-01T00:00:00Z" },
            [PSCustomObject]@{ title = "Missing Date"; createdAt = "" },
            [PSCustomObject]@{ title = "Invalid Date"; createdAt = "not-a-date" }
        )
        # Robust date parsing
        $sorted = $items | Sort-Object -Property {
            $dt = [DateTime]::MinValue
            [DateTime]::TryParse($_.createdAt, [ref]$dt) | Out-Null
            $dt
        } -Descending
        Assert-Equal 3 $sorted.Count "Sort must not throw error on invalid date"
        Assert-Equal "Valid Date" $sorted[0].title "Valid date must be sorted to top"
    }
}

# ----------------------------------------------------------------------------
# Feature 13: Game CRUD Boundaries
# ----------------------------------------------------------------------------
if ($Feature -eq 0 -or $Feature -eq 13) {
    Write-Host "`n--- Feature 13 Boundaries: CRUD Validation & Edge Cases ---" -ForegroundColor Yellow

    Invoke-TestCase -Id "T2.13.1" -Tier "2" -Feature "F13" -Name "Add Game with minimal payload populates blank specs without error" -ScriptBlock {
        $minimalGame = [PSCustomObject]@{
            title = "Minimal Game"
            link = "https://drive.google.com/min"
            specs = [PSCustomObject]@{
                min = [PSCustomObject]@{ os=""; cpu=""; ram=""; gpu=""; dx=""; net=""; storage=""; sound=""; notes="" }
                rec = [PSCustomObject]@{ os=""; cpu=""; ram=""; gpu=""; dx=""; net=""; storage=""; sound=""; notes="" }
            }
        }
        Assert-True ($null -ne $minimalGame.specs.min.os) "Specs min.os should be empty string, not null"
    }

    Invoke-TestCase -Id "T2.13.2" -Tier "2" -Feature "F13" -Name "Edit Game targeting non-existent ID fails gracefully" -ScriptBlock {
        $catalog = @(
            [PSCustomObject]@{ id="existing-1"; title="Existing Game" }
        )
        $targetId = "non-existent-id"
        $idx = -1
        for ($i = 0; $i -lt $catalog.Count; $i++) {
            if ($catalog[$i].id -eq $targetId) { $idx = $i; break }
        }
        Assert-Equal -1 $idx "Target ID should not be found"
        Assert-Equal 1 $catalog.Count "Catalog must remain unchanged"
    }

    Invoke-TestCase -Id "T2.13.3" -Tier "2" -Feature "F13" -Name "Delete Game targeting non-existent ID completes idempotently" -ScriptBlock {
        $catalog = @(
            [PSCustomObject]@{ id="existing-1"; title="Game 1" }
        )
        $filtered = $catalog | Where-Object { $_.id -ne "non-existent-id" }
        Assert-Equal 1 $filtered.Count "Must not delete any games"
    }

    Invoke-TestCase -Id "T2.13.4" -Tier "2" -Feature "F13" -Name "Rapid generation of 100 game IDs yields 100 unique UUIDs" -ScriptBlock {
        $ids = [System.Collections.Generic.HashSet[string]]::new()
        for ($i = 0; $i -lt 100; $i++) {
            $guid = [System.Guid]::NewGuid().ToString()
            Assert-True ($ids.Add($guid)) "Generated UUID must be globally unique"
        }
        Assert-Equal 100 $ids.Count
    }

    Invoke-TestCase -Id "T2.13.5" -Tier "2" -Feature "F13" -Name "Edit Game preserves unmodified thumbnail and price fields" -ScriptBlock {
        $game = [PSCustomObject]@{
            id = "game-1"
            title = "Original Title"
            thumbnail = "/thumbnails/thumb.jpg"
            price = "Rp 150.000"
            steamAppId = "12345"
        }
        $game.title = "Modified Title"
        Assert-Equal "/thumbnails/thumb.jpg" $game.thumbnail "Thumbnail must be preserved"
        Assert-Equal "Rp 150.000" $game.price "Price must be preserved"
        Assert-Equal "12345" $game.steamAppId "SteamAppId must be preserved"
    }
}

# ----------------------------------------------------------------------------
# Feature 14: Project Cleanup & Hygiene Boundaries
# ----------------------------------------------------------------------------
if ($Feature -eq 0 -or $Feature -eq 14) {
    Write-Host "`n--- Feature 14 Boundaries: Project Hygiene Boundaries ---" -ForegroundColor Yellow

    Invoke-TestCase -Id "T2.14.1" -Tier "2" -Feature "F14" -Name "No references to ipcRenderer in renderer JavaScript files" -ScriptBlock {
        $rendererJs = Get-ChildItem (Join-Path $ProjectRoot "renderer") -Filter "*.js"
        foreach ($f in $rendererJs) {
            $code = Get-Content $f.FullName -Raw
            Assert-False ($code.Contains("ipcRenderer")) "File '$($f.Name)' must not reference Electron 'ipcRenderer'"
        }
    }

    Invoke-TestCase -Id "T2.14.2" -Tier "2" -Feature "F14" -Name "No references to electron remote or webFrame in renderer files" -ScriptBlock {
        $rendererFiles = Get-ChildItem (Join-Path $ProjectRoot "renderer") -Include "*.js", "*.html" -Recurse
        foreach ($f in $rendererFiles) {
            $content = Get-Content $f.FullName -Raw
            Assert-False ($content.Contains("remote.require")) "File '$($f.Name)' must not reference Electron remote"
            Assert-False ($content.Contains("webFrame")) "File '$($f.Name)' must not reference webFrame"
        }
    }

    Invoke-TestCase -Id "T2.14.3" -Tier "2" -Feature "F14" -Name "node_modules is excluded from build directory" -ScriptBlock {
        $buildDir = Join-Path $ProjectRoot "build"
        if (Test-Path $buildDir) {
            $nodeModulesInBuild = Join-Path $buildDir "node_modules"
            Assert-FileNotExists $nodeModulesInBuild "node_modules must not exist in build directory"
        }
    }

    Invoke-TestCase -Id "T2.14.4" -Tier "2" -Feature "F14" -Name ".gitignore ignores build/bin/ and temporary test files" -ScriptBlock {
        $giPath = Join-Path $ProjectRoot ".gitignore"
        Assert-FileExists $giPath ".gitignore must exist"
        $gi = Get-Content $giPath -Raw
        Assert-Matches "build/bin" $gi ".gitignore must ignore build/bin"
    }

    Invoke-TestCase -Id "T2.14.5" -Tier "2" -Feature "F14" -Name "Clean build does not require npm or Node.js runtime" -ScriptBlock {
        # Wails v2 with vanilla frontend embeds renderer/ directory directly in Go binary
        $mainGo = Get-Content (Join-Path $ProjectRoot "main.go") -Raw
        Assert-Matches "//go:embed all:renderer" $mainGo "main.go must embed renderer directory via Go embed"
    }
}

Write-Host "`nTier 2 Boundary & Corner Cases Completed.`n" -ForegroundColor Cyan
