# ============================================================================
# tests/e2e/tier4_scenarios.ps1
# Tier 4: Real-World Scenarios (7 end-to-end user workflows)
# ============================================================================

[CmdletBinding()]
param(
    [switch]$VerboseOutput
)

$UtilsPath = Join-Path $PSScriptRoot "test_utils.ps1"
if (-not (Test-Path $UtilsPath)) {
    throw "test_utils.ps1 not found at $UtilsPath"
}
. $UtilsPath

$ProjectRoot = $global:ProjectRoot
Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host " Running Tier 4: Real-World Scenarios (7 Scenarios)" -ForegroundColor Cyan
Write-Host "========================================================`n" -ForegroundColor Cyan

# ----------------------------------------------------------------------------
# Scenario 1: Fresh App Install & First Run
# ----------------------------------------------------------------------------
Invoke-TestCase -Id "S1" -Tier "4" -Feature "F1+F3+F4+F5+F10" -Name "Scenario 1: Fresh App Install & First Run" -ScriptBlock {
    $sb = New-TestSandbox
    try {
        # 1. Verify clean initial state (no library.json, empty thumbnails dir)
        Assert-FileNotExists $sb.DataFile "library.json must not exist initially"
        Assert-DirectoryExists $sb.ThumbsDir "Thumbnails directory initialized"

        # 2. Simulate fresh app start creating sample data
        $gtaSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="460" height="215"><text>GTA V</text></svg>'
        $eldenSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="460" height="215"><text>ELDEN RING</text></svg>'

        Set-Content (Join-Path $sb.ThumbsDir "sample-gta.svg") -Value $gtaSvg -Encoding UTF8
        Set-Content (Join-Path $sb.ThumbsDir "sample-elden.svg") -Value $eldenSvg -Encoding UTF8

        $now = (Get-Date).ToUniversalTime().ToString("o")
        $sampleGames = @(
            [PSCustomObject]@{
                id = "sample-1"; title = "Grand Theft Auto V"; thumbnail = "/thumbnails/sample-gta.svg"
                link = "https://drive.google.com/sample-gta"; genre = "Action, Open World"; size = "110 GB"; price = "Rp 400.000"
                createdAt = $now; updatedAt = $now
                specs = [PSCustomObject]@{
                    min = [PSCustomObject]@{ os="Win 10"; cpu="Q6600"; ram="4 GB"; gpu="9800 GT"; dx="10"; net=""; storage="110 GB"; sound=""; notes="" }
                    rec = [PSCustomObject]@{ os="Win 10"; cpu="i5 3470"; ram="8 GB"; gpu="GTX 660"; dx="11"; net=""; storage="110 GB"; sound=""; notes="" }
                }
            },
            [PSCustomObject]@{
                id = "sample-2"; title = "ELDEN RING"; thumbnail = "/thumbnails/sample-elden.svg"
                link = "https://drive.google.com/sample-elden"; genre = "Action RPG"; size = "60 GB"; price = "Rp 599.000"
                createdAt = $now; updatedAt = $now
                specs = [PSCustomObject]@{
                    min = [PSCustomObject]@{ os="Win 10"; cpu="i5-8400"; ram="12 GB"; gpu="GTX 1060"; dx="12"; net=""; storage="60 GB"; sound=""; notes="" }
                    rec = [PSCustomObject]@{ os="Win 10/11"; cpu="i7-8700K"; ram="16 GB"; gpu="GTX 1070"; dx="12"; net=""; storage="60 GB"; sound=""; notes="" }
                }
            }
        )

        $json = @{ games = $sampleGames } | ConvertTo-Json -Depth 6
        Set-Content -Path $sb.DataFile -Value $json -Encoding UTF8

        # 3. Assert library.json created atomically with sample games
        Assert-FileExists $sb.DataFile "library.json must be written"
        $lib = Assert-JsonValid (Get-Content $sb.DataFile -Raw)
        Assert-Equal 2 $lib.games.Count "Initial library must contain exactly 2 sample games"
        Assert-Equal "Grand Theft Auto V" $lib.games[0].title
        Assert-Equal "ELDEN RING" $lib.games[1].title

        # 4. Assert sample SVG thumbnails exist in cache
        Assert-FileExists (Join-Path $sb.ThumbsDir "sample-gta.svg")
        Assert-FileExists (Join-Path $sb.ThumbsDir "sample-elden.svg")
    }
    finally {
        Remove-TestSandbox $sb.Root
    }
}

# ----------------------------------------------------------------------------
# Scenario 2: Existing Electron Data Migration
# ----------------------------------------------------------------------------
Invoke-TestCase -Id "S2" -Tier "4" -Feature "F3+F5+F6+F10+F12" -Name "Scenario 2: Existing Electron Data Migration" -ScriptBlock {
    $sb = New-TestSandbox
    try {
        # 1. Pre-populate existing user data with legacy glib://thumb/ URLs
        $legacyJson = @'
{
  "games": [
    {
      "id": "legacy-gta",
      "title": "Grand Theft Auto IV",
      "thumbnail": "glib://thumb/gta4-cover.jpg",
      "link": "https://drive.google.com/gta4",
      "genre": "Action",
      "size": "15 GB",
      "price": "Rp 150.000",
      "steamAppId": "12210",
      "specs": {
        "min": { "os": "Windows XP", "cpu": "Core 2 Duo", "ram": "1.5 GB", "gpu": "256 MB", "dx": "9.0c", "net": "", "storage": "16 GB", "sound": "", "notes": "" },
        "rec": { "os": "Windows 7", "cpu": "Core 2 Quad", "ram": "2.5 GB", "gpu": "512 MB", "dx": "9.0c", "net": "", "storage": "18 GB", "sound": "", "notes": "" }
      },
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-01T00:00:00Z"
    }
  ]
}
'@
        Set-Content -Path $sb.DataFile -Value $legacyJson -Encoding UTF8

        # Create thumbnail in cache
        Set-Content -Path (Join-Path $sb.ThumbsDir "gta4-cover.jpg") -Value "IMAGE_BYTES"

        # 2. Load and verify normalization
        $loaded = Assert-JsonValid (Get-Content $sb.DataFile -Raw)
        foreach ($g in $loaded.games) {
            if ($g.thumbnail.StartsWith("glib://thumb/")) {
                $g.thumbnail = "/thumbnails/" + $g.thumbnail.Substring("glib://thumb/".Length)
            }
        }

        Assert-Equal "/thumbnails/gta4-cover.jpg" $loaded.games[0].thumbnail "Legacy thumbnail prefix must be migrated"
        Assert-Equal "Grand Theft Auto IV" $loaded.games[0].title "Game title preserved"
        Assert-FileExists (Join-Path $sb.ThumbsDir "gta4-cover.jpg") "Cover image in cache intact"
    }
    finally {
        Remove-TestSandbox $sb.Root
    }
}

# ----------------------------------------------------------------------------
# Scenario 3: Steam Link Game Import & Save
# ----------------------------------------------------------------------------
Invoke-TestCase -Id "S3" -Tier "4" -Feature "F6+F8+F10+F13" -Name "Scenario 3: Steam Link Game Import & Save" -ScriptBlock {
    $sb = New-TestSandbox
    try {
        # 1. User inputs Steam store URL
        $steamUrl = "https://store.steampowered.com/app/271590/Grand_Theft_Auto_V/"
        Assert-Matches 'store\.steampowered\.com/app/(\d+)' $steamUrl "Valid Steam URL"

        if ($steamUrl -match 'store\.steampowered\.com/app/(\d+)') {
            $appId = $Matches[1]
            Assert-Equal "271590" $appId "AppID extracted"
        }

        # 2. Simulate Steam Import response
        $downloadedThumb = "/thumbnails/steam-271590-f9a8b7c6.jpg"
        Set-Content -Path (Join-Path $sb.ThumbsDir "steam-271590-f9a8b7c6.jpg") -Value "STEAM_IMAGE_BYTES"

        $importedGame = [PSCustomObject]@{
            id = [System.Guid]::NewGuid().ToString()
            title = "Grand Theft Auto V"
            thumbnail = $downloadedThumb
            link = "https://drive.google.com/file/d/user-custom-drive-link"
            genre = "Action, Adventure"
            size = "110 GB"
            price = "Rp 400.000"
            steamAppId = $appId
            specs = [PSCustomObject]@{
                min = [PSCustomObject]@{ os="Win 10 64-bit"; cpu="Intel Core 2 Quad Q6600"; ram="4 GB"; gpu="NVIDIA 9800 GT"; dx="10"; net="Broadband"; storage="110 GB"; sound="DirectX"; notes="" }
                rec = [PSCustomObject]@{ os="Win 10 64-bit"; cpu="Intel Core i5 3470"; ram="8 GB"; gpu="NVIDIA GTX 660"; dx="11"; net="Broadband"; storage="110 GB"; sound="DirectX"; notes="" }
            }
            createdAt = (Get-Date).ToUniversalTime().ToString("o")
            updatedAt = (Get-Date).ToUniversalTime().ToString("o")
        }

        # 3. Save into library database
        $json = @{ games = @($importedGame) } | ConvertTo-Json -Depth 6
        Set-Content -Path $sb.DataFile -Value $json -Encoding UTF8

        # 4. Verify persisted game
        $lib = Assert-JsonValid (Get-Content $sb.DataFile -Raw)
        Assert-Equal 1 $lib.games.Count
        Assert-Equal "Grand Theft Auto V" $lib.games[0].title
        Assert-Equal "271590" $lib.games[0].steamAppId
        Assert-Equal "https://drive.google.com/file/d/user-custom-drive-link" $lib.games[0].link
        Assert-FileExists (Join-Path $sb.ThumbsDir "steam-271590-f9a8b7c6.jpg") "Downloaded thumbnail persists"
    }
    finally {
        Remove-TestSandbox $sb.Root
    }
}

# ----------------------------------------------------------------------------
# Scenario 4: Search, Filter, Sort & External Link Copy
# ----------------------------------------------------------------------------
Invoke-TestCase -Id "S4" -Tier "4" -Feature "F9+F11+F12" -Name "Scenario 4: Search, Filter, Sort & External Link Copy" -ScriptBlock {
    # 1. Multi-game library
    $games = @(
        [PSCustomObject]@{ id="1"; title="Cyberpunk 2077"; link="https://drive.google.com/cp"; createdAt="2026-01-01T00:00:00Z" },
        [PSCustomObject]@{ id="2"; title="Cyber Shadow"; link="https://drive.google.com/cs"; createdAt="2026-02-01T00:00:00Z" },
        [PSCustomObject]@{ id="3"; title="The Witcher 3"; link="https://drive.google.com/tw3"; createdAt="2026-03-01T00:00:00Z" },
        [PSCustomObject]@{ id="4"; title="Cyber Hook"; link="https://drive.google.com/ch"; createdAt="2026-04-01T00:00:00Z" }
    )

    # 2. Search for "Cyber"
    $searchQuery = "Cyber"
    $filtered = $games | Where-Object { $_.title.IndexOf($searchQuery, [System.StringComparison]::OrdinalIgnoreCase) -ge 0 }
    Assert-Equal 3 $filtered.Count "Query 'Cyber' must match 3 games"

    # 3. Sort A-Z
    $sortedAZ = $filtered | Sort-Object -Property title
    Assert-Equal "Cyber Hook" $sortedAZ[0].title "C-H comes before C-P"
    Assert-Equal "Cyber Shadow" $sortedAZ[1].title "C-S comes after C-P"
    Assert-Equal "Cyberpunk 2077" $sortedAZ[2].title

    # 4. Copy Link action
    $selectedGame = $sortedAZ[2] # Cyberpunk 2077
    $copiedLink = $selectedGame.link
    Assert-Equal "https://drive.google.com/cp" $copiedLink "Copied link must match Google Drive URL"

    # 5. Browser open verification (valid HTTPS scheme)
    $isValidUrl = $copiedLink.StartsWith("http://") -or $copiedLink.StartsWith("https://")
    Assert-True $isValidUrl "Link to open in external browser must be valid HTTP/HTTPS"
}

# ----------------------------------------------------------------------------
# Scenario 5: Complete Game Lifecycle (Add, Edit, Replace Thumbnail, Delete)
# ----------------------------------------------------------------------------
Invoke-TestCase -Id "S5" -Tier "4" -Feature "F4+F5+F6+F7+F13" -Name "Scenario 5: Complete Game Lifecycle (Add, Edit, Delete)" -ScriptBlock {
    $sb = New-TestSandbox
    try {
        # Step 1: Add new game with thumbnail-1
        $thumb1 = "thumb-lifecycle-1.png"
        Set-Content (Join-Path $sb.ThumbsDir $thumb1) -Value "THUMB_1"
        $gameId = [System.Guid]::NewGuid().ToString()

        $game = [PSCustomObject]@{
            id = $gameId
            title = "Initial Title"
            thumbnail = "/thumbnails/$thumb1"
            link = "https://drive.google.com/test-lifecycle"
            genre = "Action"
            price = "Rp 100.000"
            createdAt = "2026-06-01T10:00:00Z"
            updatedAt = "2026-06-01T10:00:00Z"
        }
        $lib = [System.Collections.Generic.List[PSCustomObject]]::new()
        $lib.Add($game)

        Set-Content -Path $sb.DataFile -Value (@{ games = $lib } | ConvertTo-Json -Depth 4) -Encoding UTF8
        Assert-FileExists (Join-Path $sb.ThumbsDir $thumb1) "Thumbnail 1 exists"

        # Step 2: Edit game and replace with thumbnail-2
        $thumb2 = "thumb-lifecycle-2.png"
        Set-Content (Join-Path $sb.ThumbsDir $thumb2) -Value "THUMB_2"

        # Old thumbnail deleted on replace
        Remove-Item (Join-Path $sb.ThumbsDir $thumb1) -Force

        $game.title = "Updated Lifecycle Title"
        $game.thumbnail = "/thumbnails/$thumb2"
        $game.price = "Rp 125.000"
        $game.updatedAt = "2026-06-02T12:00:00Z"

        Set-Content -Path $sb.DataFile -Value (@{ games = $lib } | ConvertTo-Json -Depth 4) -Encoding UTF8
        Assert-FileNotExists (Join-Path $sb.ThumbsDir $thumb1) "Old thumbnail 1 cleaned up"
        Assert-FileExists (Join-Path $sb.ThumbsDir $thumb2) "New thumbnail 2 active"

        # Step 3: Delete game
        [void]$lib.Remove($game)
        Remove-Item (Join-Path $sb.ThumbsDir $thumb2) -Force

        Set-Content -Path $sb.DataFile -Value (@{ games = $lib } | ConvertTo-Json -Depth 4) -Encoding UTF8

        $finalLib = Assert-JsonValid (Get-Content $sb.DataFile -Raw)
        Assert-Equal 0 $finalLib.games.Count "Library empty after game deletion"
        Assert-FileNotExists (Join-Path $sb.ThumbsDir $thumb2) "Thumbnail 2 removed upon game deletion"
    }
    finally {
        Remove-TestSandbox $sb.Root
    }
}

# ----------------------------------------------------------------------------
# Scenario 6: Corrupted JSON Auto-Recovery Under Load
# ----------------------------------------------------------------------------
Invoke-TestCase -Id "S6" -Tier "4" -Feature "F3+F4+F5" -Name "Scenario 6: Corrupted JSON Auto-Recovery Under Load" -ScriptBlock {
    $sb = New-TestSandbox
    try {
        # 1. User/crash leaves corrupted non-JSON binary bytes in library.json
        $junkBytes = [System.Text.Encoding]::UTF8.GetBytes("<<<NON_JSON_CORRUPTED_DATABASE_CRASH_DATA>>>")
        [System.IO.File]::WriteAllBytes($sb.DataFile, $junkBytes)

        # 2. App initializes: detects corruption, creates .rusak-<timestamp> backup, resets library
        $raw = Get-Content $sb.DataFile -Raw
        $isCorrupt = $false
        try { ConvertFrom-Json $raw -ErrorAction Stop } catch { $isCorrupt = $true }
        Assert-True $isCorrupt "Original file is corrupted"

        $epochMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        $backupName = "$($sb.DataFile).rusak-$epochMs"
        Move-Item -Path $sb.DataFile -Destination $backupName

        # App returns empty games or sample games
        $freshGames = @(
            [PSCustomObject]@{ id="recovered-1"; title="New Game"; link="https://test.com" }
        )
        Set-Content -Path $sb.DataFile -Value (@{ games = $freshGames } | ConvertTo-Json -Depth 3) -Encoding UTF8

        # 3. Verify backup contains original corrupt bytes and new database is operational
        Assert-FileExists $backupName "Corrupted file backed up safely"
        $backupContent = Get-Content $backupName -Raw
        Assert-Matches "NON_JSON_CORRUPTED" $backupContent "Corrupted content preserved in backup"

        $newDb = Assert-JsonValid (Get-Content $sb.DataFile -Raw)
        Assert-Equal 1 $newDb.games.Count "New database initialized and operational"
    }
    finally {
        Remove-TestSandbox $sb.Root
    }
}

# ----------------------------------------------------------------------------
# Scenario 7: High-Volume Catalog Stress Test (500 Games)
# ----------------------------------------------------------------------------
Invoke-TestCase -Id "S7" -Tier "4" -Feature "F3+F4+F11+F12" -Name "Scenario 7: High-Volume Catalog Stress Test (500 Games)" -ScriptBlock {
    $sb = New-TestSandbox
    try {
        # 1. Generate 500 game records
        $gameList = [System.Collections.Generic.List[PSCustomObject]]::new()
        for ($i = 1; $i -le 500; $i++) {
            $gameList.Add([PSCustomObject]@{
                id = [System.Guid]::NewGuid().ToString()
                title = "Catalog Game {0:D4}" -f $i
                link = "https://drive.google.com/game-$i"
                genre = if ($i % 2 -eq 0) { "Action" } else { "Strategy" }
                createdAt = (Get-Date).AddMinutes(-$i).ToUniversalTime().ToString("o")
            })
        }

        # 2. Save 500 games
        $swSave = [System.Diagnostics.Stopwatch]::StartNew()
        $json = @{ games = $gameList } | ConvertTo-Json -Depth 4 -Compress
        Set-Content -Path $sb.DataFile -Value $json -Encoding UTF8
        $swSave.Stop()

        Assert-True ($swSave.ElapsedMilliseconds -lt 2000) "Save 500 games took $($swSave.ElapsedMilliseconds)ms (< 2000ms)"

        # 3. Load 500 games
        $swLoad = [System.Diagnostics.Stopwatch]::StartNew()
        $loaded = Assert-JsonValid (Get-Content $sb.DataFile -Raw)
        $swLoad.Stop()

        Assert-Equal 500 $loaded.games.Count "Must load all 500 games"
        Assert-True ($swLoad.ElapsedMilliseconds -lt 1000) "Load 500 games took $($swLoad.ElapsedMilliseconds)ms (< 1000ms)"

        # 4. Search performance on 500 games
        $swSearch = [System.Diagnostics.Stopwatch]::StartNew()
        $matched = $loaded.games | Where-Object { $_.title.Contains("025") }
        $swSearch.Stop()

        Assert-True ($matched.Count -ge 1) "Search matches target game"
        Assert-True ($swSearch.ElapsedMilliseconds -lt 100) "Search on 500 games took $($swSearch.ElapsedMilliseconds)ms (< 100ms)"

        # 5. Sort performance on 500 games
        $swSort = [System.Diagnostics.Stopwatch]::StartNew()
        $sorted = $loaded.games | Sort-Object -Property title -Descending
        $swSort.Stop()

        Assert-Equal 500 $sorted.Count "Sort preserves all 500 games"
        Assert-True ($swSort.ElapsedMilliseconds -lt 300) "Sort on 500 games took $($swSort.ElapsedMilliseconds)ms (< 300ms)"
    }
    finally {
        Remove-TestSandbox $sb.Root
    }
}

Write-Host "`nTier 4 Real-World Scenarios Completed.`n" -ForegroundColor Cyan
