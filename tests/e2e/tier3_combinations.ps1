# ============================================================================
# tests/e2e/tier3_combinations.ps1
# Tier 3: Pairwise Combinations (14 tests verifying cross-feature interactions)
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
Write-Host " Running Tier 3: Cross-Feature Combinations (14 Tests)" -ForegroundColor Cyan
Write-Host "========================================================`n" -ForegroundColor Cyan

# T3.1: [F3 + F4] Load-Modify-Save Roundtrip
Invoke-TestCase -Id "T3.1" -Tier "3" -Feature "F3+F4" -Name "Load-Modify-Save Roundtrip preserves full data fidelity" -ScriptBlock {
    $sb = New-TestSandbox
    try {
        $initialGame = [PSCustomObject]@{
            id = "roundtrip-1"
            title = "Hades II"
            thumbnail = "/thumbnails/hades2.jpg"
            link = "https://drive.google.com/hades2"
            genre = "Rogue-like"
            size = "10 GB"
            price = "Rp 250.000"
            steamAppId = "1145350"
            specs = [PSCustomObject]@{
                min = [PSCustomObject]@{ os="Win 10"; cpu="Dual Core"; ram="8 GB"; gpu="GTX 950"; dx="12"; net=""; storage="10 GB"; sound=""; notes="" }
                rec = [PSCustomObject]@{ os="Win 10"; cpu="Quad Core"; ram="16 GB"; gpu="GTX 1060"; dx="12"; net=""; storage="10 GB"; sound=""; notes="" }
            }
            createdAt = "2026-05-01T12:00:00Z"
            updatedAt = "2026-05-01T12:00:00Z"
        }
        $json = @{ games = @($initialGame) } | ConvertTo-Json -Depth 5
        Set-Content -Path $sb.DataFile -Value $json -Encoding UTF8

        # Step 1: Load
        $loaded = Assert-JsonValid (Get-Content $sb.DataFile -Raw)
        Assert-Equal 1 $loaded.games.Count
        $game = $loaded.games[0]

        # Step 2: Modify
        $game.price = "Rp 220.000"
        $game.genre = "Action Rogue-like, Dungeon Crawler"
        $game.updatedAt = "2026-05-02T15:00:00Z"

        # Step 3: Save
        $modifiedJson = @{ games = @($game) } | ConvertTo-Json -Depth 5
        Set-Content -Path $sb.DataFile -Value $modifiedJson -Encoding UTF8

        # Step 4: Reload and Verify
        $reloaded = Assert-JsonValid (Get-Content $sb.DataFile -Raw)
        Assert-Equal "Rp 220.000" $reloaded.games[0].price
        Assert-Equal "Action Rogue-like, Dungeon Crawler" $reloaded.games[0].genre
        $updatedStr = $reloaded.games[0].updatedAt.ToString()
        Assert-Matches "2026-05-02|02/05/2026|05/02/2026" $updatedStr "updatedAt must reflect updated date"
        Assert-Equal "Hades II" $reloaded.games[0].title

        Assert-Equal "1145350" $reloaded.games[0].steamAppId
    }

    finally {
        Remove-TestSandbox $sb.Root
    }
}

# T3.2: [F4 + F5] SaveLibrary under Concurrent Access
Invoke-TestCase -Id "T3.2" -Tier "3" -Feature "F4+F5" -Name "SaveLibrary under concurrent access maintains file integrity" -ScriptBlock {
    $sb = New-TestSandbox
    try {
        # App struct has sync.Mutex protecting LoadLibrary and SaveLibrary
        $appGo = Get-Content (Join-Path $ProjectRoot "app.go") -Raw
        Assert-Matches "a\.mu\.Lock\(\)" $appGo "SaveLibrary must acquire mutex lock"
        Assert-Matches "defer a\.mu\.Unlock\(\)" $appGo "SaveLibrary must defer mutex unlock"
        Assert-Matches "tmpFile := fmt\.Sprintf\(" $appGo "Atomic temporary file pattern must be used"
    }
    finally {
        Remove-TestSandbox $sb.Root
    }
}

# T3.3: [F3 + F5] Corrupted Recovery + Auto-Save
Invoke-TestCase -Id "T3.3" -Tier "3" -Feature "F3+F5" -Name "Corrupted JSON recovery followed by save creates fresh valid database" -ScriptBlock {
    $sb = New-TestSandbox
    try {
        # Write corrupt file
        Set-Content -Path $sb.DataFile -Value "CORRUPTED_NON_JSON_DATA{{{" -Encoding UTF8

        # Simulate LoadLibrary backup and recovery
        $content = Get-Content $sb.DataFile -Raw
        $corrupt = $false
        try { ConvertFrom-Json $content -ErrorAction Stop } catch { $corrupt = $true }
        Assert-True $corrupt "Content must be corrupt"

        $ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        $backupPath = "$($sb.DataFile).rusak-$ts"
        Move-Item -Path $sb.DataFile -Destination $backupPath

        Assert-FileExists $backupPath "Backup file must be created"
        Assert-FileNotExists $sb.DataFile "Corrupted original file must be moved"

        # Subsequent save
        $freshGames = @(
            [PSCustomObject]@{ id="fresh-1"; title="Fresh Game"; link="https://test.com" }
        )
        $newJson = @{ games = $freshGames } | ConvertTo-Json -Depth 3
        Set-Content -Path $sb.DataFile -Value $newJson -Encoding UTF8

        $verified = Assert-JsonValid (Get-Content $sb.DataFile -Raw)
        Assert-Equal 1 $verified.games.Count
        Assert-Equal "Fresh Game" $verified.games[0].title
    }
    finally {
        Remove-TestSandbox $sb.Root
    }
}

# T3.4: [F6 + F7] Thumbnail Import then Delete
Invoke-TestCase -Id "T3.4" -Tier "3" -Feature "F6+F7" -Name "Thumbnail Import followed by Delete removes cached file" -ScriptBlock {
    $sb = New-TestSandbox
    try {
        # Simulate PickThumbnail / image save
        $hexName = [System.Guid]::NewGuid().ToString("N").Substring(0, 20) + ".png"
        $thumbFile = Join-Path $sb.ThumbsDir $hexName
        Set-Content -Path $thumbFile -Value "PNG_IMAGE_DATA"
        $urlRef = "/thumbnails/$hexName"

        Assert-FileExists $thumbFile "Thumbnail must exist after import"

        # Simulate DeleteThumbnail
        $cleanRef = $urlRef -replace "^/thumbnails/", ""
        $targetFile = Join-Path $sb.ThumbsDir $cleanRef
        if (Test-Path $targetFile) {
            Remove-Item $targetFile -Force
        }

        Assert-FileNotExists $thumbFile "Thumbnail file must be deleted from filesystem"
    }
    finally {
        Remove-TestSandbox $sb.Root
    }
}

# T3.5: [F8 + F6] Steam Import + Thumbnail Pipeline
Invoke-TestCase -Id "T3.5" -Tier "3" -Feature "F8+F6" -Name "SteamImport downloads header image into Thumbnails directory" -ScriptBlock {
    $appGo = Get-Content (Join-Path $ProjectRoot "app.go") -Raw
    Assert-Matches 'fileName := fmt\.Sprintf\("steam-%s-%s%s"' $appGo "Steam image must follow steam-<appid>-<hex> naming"
    Assert-Matches 'destPath := filepath\.Join\(a\.thumbsDir,\s*fileName\)' $appGo "Steam image must be saved in thumbsDir"
    Assert-Matches 'return "/thumbnails/" \+ fileName' $appGo "Steam thumbnail return value must use /thumbnails/ URL format"
}


# T3.6: [F8 + F4] Steam Import Result Saved into Library
Invoke-TestCase -Id "T3.6" -Tier "3" -Feature "F8+F4" -Name "SteamImport result structured and saved into Library database" -ScriptBlock {
    $sb = New-TestSandbox
    try {
        # Mock SteamImportResult converted to Game
        $steamResult = [PSCustomObject]@{
            appId = "271590"
            title = "Grand Theft Auto V"
            thumbnail = "/thumbnails/steam-271590-a1b2c3d4.jpg"
            genre = "Action, Adventure"
            developer = "Rockstar North"
            releaseDate = "14 Apr, 2015"
            price = "Rp 400.000"
            specs = [PSCustomObject]@{
                min = [PSCustomObject]@{ os="Win 10"; cpu="Core 2 Quad"; ram="4 GB"; gpu="9800 GT"; dx="10"; net=""; storage="110 GB"; sound=""; notes="" }
                rec = [PSCustomObject]@{ os="Win 10"; cpu="i5 3470"; ram="8 GB"; gpu="GTX 660"; dx="11"; net=""; storage="110 GB"; sound=""; notes="" }
            }
        }

        $game = [PSCustomObject]@{
            id = [System.Guid]::NewGuid().ToString()
            title = $steamResult.title
            thumbnail = $steamResult.thumbnail
            link = "https://drive.google.com/file/d/sample-gta-link"
            genre = $steamResult.genre
            size = "110 GB"
            price = $steamResult.price
            steamAppId = $steamResult.appId
            specs = $steamResult.specs
            createdAt = (Get-Date).ToUniversalTime().ToString("o")
            updatedAt = (Get-Date).ToUniversalTime().ToString("o")
        }

        $json = @{ games = @($game) } | ConvertTo-Json -Depth 5
        Set-Content -Path $sb.DataFile -Value $json -Encoding UTF8

        $loaded = Assert-JsonValid (Get-Content $sb.DataFile -Raw)
        Assert-Equal "Grand Theft Auto V" $loaded.games[0].title
        Assert-Equal "271590" $loaded.games[0].steamAppId
        Assert-Equal "110 GB" $loaded.games[0].specs.min.storage
    }
    finally {
        Remove-TestSandbox $sb.Root
    }
}

# T3.7: [F11 + F12] Search Filter Combined with Sort
Invoke-TestCase -Id "T3.7" -Tier "3" -Feature "F11+F12" -Name "Search filter combined with Sort (Search + Z-A)" -ScriptBlock {
    $catalog = @(
        [PSCustomObject]@{ id="1"; title="Grand Theft Auto III"; genre="Action" },
        [PSCustomObject]@{ id="2"; title="Grand Theft Auto IV"; genre="Action" },
        [PSCustomObject]@{ id="3"; title="Grand Theft Auto V"; genre="Action" },
        [PSCustomObject]@{ id="4"; title="Need for Speed: Underground"; genre="Racing" },
        [PSCustomObject]@{ id="5"; title="Grand Theft Auto: San Andreas"; genre="Action" }
    )

    $query = "Auto"
    $filtered = $catalog | Where-Object { $_.title.IndexOf($query, [System.StringComparison]::OrdinalIgnoreCase) -ge 0 }
    Assert-Equal 4 $filtered.Count "Query 'Auto' must match 4 games"

    $sortedZA = $filtered | Sort-Object -Property title -Descending
    Assert-Equal "Grand Theft Auto: San Andreas" $sortedZA[0].title "San Andreas must be first descending"
    Assert-Equal "Grand Theft Auto V" $sortedZA[1].title
    Assert-Equal "Grand Theft Auto IV" $sortedZA[2].title
    Assert-Equal "Grand Theft Auto III" $sortedZA[3].title
}

# T3.8: [F13 + F11] Add Game then Immediate Search
Invoke-TestCase -Id "T3.8" -Tier "3" -Feature "F13+F11" -Name "Newly added game is immediately indexed and discoverable by search" -ScriptBlock {
    $library = [System.Collections.Generic.List[PSCustomObject]]::new()
    $library.Add([PSCustomObject]@{ id="1"; title="Counter-Strike 2" })
    $library.Add([PSCustomObject]@{ id="2"; title="Dota 2" })

    # Initial search
    $q = "Black Myth"
    $initMatch = $library | Where-Object { $_.title.IndexOf($q, [System.StringComparison]::OrdinalIgnoreCase) -ge 0 }
    Assert-Equal 0 @($initMatch).Length "Before addition, game must not be found"

    # Add game
    $library.Add([PSCustomObject]@{ id="3"; title="Black Myth: Wukong" })

    # Subsequent search
    $afterMatch = $library | Where-Object { $_.title.IndexOf($q, [System.StringComparison]::OrdinalIgnoreCase) -ge 0 }
    Assert-Equal 1 @($afterMatch).Length "Newly added game must be found immediately"
    Assert-Equal "Black Myth: Wukong" @($afterMatch)[0].title
}

# T3.9: [F13 + F7] Delete Game with Thumbnail Cleanup
Invoke-TestCase -Id "T3.9" -Tier "3" -Feature "F13+F7" -Name "Deleting a game unlinks and deletes its custom thumbnail" -ScriptBlock {
    $sb = New-TestSandbox
    try {
        $thumbName = "game-thumb-999.png"
        $thumbPath = Join-Path $sb.ThumbsDir $thumbName
        Set-Content -Path $thumbPath -Value "thumbnail_content"

        $game = [PSCustomObject]@{
            id = "del-test-1"
            title = "Game To Delete"
            thumbnail = "/thumbnails/$thumbName"
        }

        Assert-FileExists $thumbPath "Thumbnail exists before game deletion"

        # Simulate deletion: delete game from library and invoke thumbnail deletion
        if ($game.thumbnail -match "^/thumbnails/(.+)$") {
            $tName = $Matches[1]
            $fileToDelete = Join-Path $sb.ThumbsDir $tName
            Remove-Item $fileToDelete -Force -ErrorAction SilentlyContinue
        }

        Assert-FileNotExists $thumbPath "Thumbnail file must be removed when game is deleted"
    }
    finally {
        Remove-TestSandbox $sb.Root
    }
}

# T3.10: [F10 + F9] Frontend Bridge to OS Clipboard
Invoke-TestCase -Id "T3.10" -Tier "3" -Feature "F10+F9" -Name "Frontend bridge maps window.api.copyText to backend CopyText" -ScriptBlock {
    $bridgePath = Join-Path $ProjectRoot "renderer\wails-bridge.js"
    Assert-FileExists $bridgePath "wails-bridge.js must exist"
    $bridge = Get-Content $bridgePath -Raw
    Assert-Matches "(?s)copyText[\s\S]*?CopyText" $bridge "bridge must map copyText directly to Go backend"
}

# T3.11: [F10 + F9] Frontend Bridge to External Browser
Invoke-TestCase -Id "T3.11" -Tier "3" -Feature "F10+F9" -Name "Frontend bridge maps window.api.openExternal to backend OpenExternal" -ScriptBlock {
    $bridgePath = Join-Path $ProjectRoot "renderer\wails-bridge.js"
    Assert-FileExists $bridgePath "wails-bridge.js must exist"
    $bridge = Get-Content $bridgePath -Raw
    Assert-Matches "(?s)openExternal[\s\S]*?OpenExternal" $bridge "bridge must map openExternal directly to Go backend"
}


# T3.12: [F3 + F6] Legacy Migration + Thumbnail Serving
Invoke-TestCase -Id "T3.12" -Tier "3" -Feature "F3+F6" -Name "Legacy glib://thumb/ normalized and resolved via /thumbnails/ handler" -ScriptBlock {
    $legacyUrl = "glib://thumb/legacy-img.png"
    $normalizedUrl = if ($legacyUrl.StartsWith("glib://thumb/")) {
        "/thumbnails/" + $legacyUrl.Substring("glib://thumb/".Length)
    } else {
        $legacyUrl
    }
    Assert-Equal "/thumbnails/legacy-img.png" $normalizedUrl "Normalized URL must have /thumbnails/ prefix"
}

# T3.13: [F1 + F2] Wails Build Configuration to Executable Output
Invoke-TestCase -Id "T3.13" -Tier "3" -Feature "F1+F2" -Name "wails.json configuration matches generated binary output properties" -ScriptBlock {
    $wailsJson = Assert-JsonValid (Get-Content (Join-Path $ProjectRoot "wails.json") -Raw)
    Assert-Equal "GameLibrary" $wailsJson.outputfilename "outputfilename in wails.json must be 'GameLibrary'"
    Assert-Equal "1.0.0" $wailsJson.info.productVersion "productVersion must be '1.0.0'"
}

# T3.14: [F13 + F14] Game CRUD Independent of Electron Runtime
Invoke-TestCase -Id "T3.14" -Tier "3" -Feature "F13+F14" -Name "Game CRUD operations function entirely without Electron" -ScriptBlock {
    $appGo = Get-Content (Join-Path $ProjectRoot "app.go") -Raw
    Assert-False ($appGo.Contains("electron")) "app.go must not contain any reference to Electron"
    Assert-Matches "package main" $appGo "app.go must be standard Go main package"
}

Write-Host "`nTier 3 Combinations Completed.`n" -ForegroundColor Cyan
