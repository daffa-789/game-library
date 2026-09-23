# ============================================================================
# tests/e2e/run_tests.ps1
# Master Opaque-Box E2E Test Runner for SoftGame Library (katalog game + software)
# Tiers 1-4 (>= 172 tests)
# ============================================================================

[CmdletBinding()]
param(
    [Parameter(Position=0)]
    [ValidateSet("1", "2", "3", "4", "all", "All")]
    [string]$Tier = "all",

    [string]$Filter = "",
    [switch]$VerboseOutput,
    [switch]$Help
)

if ($Help) {
    Write-Host @"
Usage: pwsh -File tests/e2e/run_tests.ps1 [-Tier <1|2|3|4|all>] [-Filter <regex>] [-VerboseOutput]

Options:
  -Tier <1|2|3|4|all>   Run specific tier or all tiers (default: all)
  -Filter <regex>       Filter tests by ID or name matching regex
  -VerboseOutput        Display extended diagnostic information
  -Help                 Display this help message
"@
    exit 0
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir "..\..")

# Load common utilities
$UtilsPath = Join-Path $ScriptDir "test_utils.ps1"
if (-not (Test-Path $UtilsPath)) {
    Write-Error "test_utils.ps1 not found at $UtilsPath"
    exit 1
}
. $UtilsPath

Reset-TestResults

$banner = @"
================================================================================
   GAME LIBRARY MIGRATION - E2E OPAQUE-BOX TEST HARNESS (TIERS 1-4)
================================================================================
 Project Root: $ProjectRoot
 Test Target : >= 172 Tests across Tiers 1-4
 Execution   : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss UTC')
 Selected    : Tier $Tier $(if ($Filter) { "(Filter: '$Filter')" })
================================================================================
"@
Write-Host $banner -ForegroundColor DarkCyan

$masterSw = [System.Diagnostics.Stopwatch]::StartNew()

# ----------------------------------------------------------------------------
# Execute Selected Tiers
# ----------------------------------------------------------------------------
$tiersToRun = switch ($Tier.ToLower()) {
    "1" { @(1) }
    "2" { @(2) }
    "3" { @(3) }
    "4" { @(4) }
    default { @(1, 2, 3, 4) }
}

foreach ($t in $tiersToRun) {
    switch ($t) {
        1 {
            $t1Path = Join-Path $ScriptDir "tier1_features.ps1"
            if (Test-Path $t1Path) {
                . $t1Path -VerboseOutput:$VerboseOutput
            } else {
                Write-Warning "tier1_features.ps1 not found"
            }
        }
        2 {
            $t2Path = Join-Path $ScriptDir "tier2_boundaries.ps1"
            if (Test-Path $t2Path) {
                . $t2Path -VerboseOutput:$VerboseOutput
            } else {
                Write-Warning "tier2_boundaries.ps1 not found"
            }
        }
        3 {
            $t3Path = Join-Path $ScriptDir "tier3_combinations.ps1"
            if (Test-Path $t3Path) {
                . $t3Path -VerboseOutput:$VerboseOutput
            } else {
                Write-Warning "tier3_combinations.ps1 not found"
            }
        }
        4 {
            $t4Path = Join-Path $ScriptDir "tier4_scenarios.ps1"
            if (Test-Path $t4Path) {
                . $t4Path -VerboseOutput:$VerboseOutput
            } else {
                Write-Warning "tier4_scenarios.ps1 not found"
            }
        }
    }
}

$masterSw.Stop()

# ----------------------------------------------------------------------------
# Process and Summarize Results
# ----------------------------------------------------------------------------
$allResults = @(Get-TestResults | Where-Object { $null -ne $_ })

if ($Filter) {
    $allResults = @($allResults | Where-Object { $_.Id -match $Filter -or $_.Name -match $Filter })
}

$tier1Results = @($allResults | Where-Object { $_.Tier -eq "1" })
$tier2Results = @($allResults | Where-Object { $_.Tier -eq "2" })
$tier3Results = @($allResults | Where-Object { $_.Tier -eq "3" })
$tier4Results = @($allResults | Where-Object { $_.Tier -eq "4" })

$totalCount   = $allResults.Count
$passedCount  = @($allResults | Where-Object { $_.Passed }).Count
$failedCount  = @($allResults | Where-Object { -not $_.Passed -and -not $_.Skipped }).Count
$skippedCount = @($allResults | Where-Object { $_.Skipped }).Count

Write-Host "`n================================================================================" -ForegroundColor DarkCyan
Write-Host "                           TEST EXECUTION SUMMARY" -ForegroundColor DarkCyan
Write-Host "================================================================================" -ForegroundColor DarkCyan

Write-Host ("{0,-35} | {1,8} | {2,8} | {3,8} | {4,8}" -f "Test Suite Tier", "Total", "Pass", "Fail", "Pass %") -ForegroundColor White
Write-Host ("-" * 75) -ForegroundColor DarkGray

function Format-TierRow($name, $list) {
    $items = @($list | Where-Object { $null -ne $_ })
    $tot = $items.Count
    if ($tot -eq 0) { return }
    $p = @($items | Where-Object { $_.Passed }).Count
    $f = @($items | Where-Object { -not $_.Passed -and -not $_.Skipped }).Count
    $pct = if ($tot -gt 0) { [math]::Round(($p / $tot) * 100, 1) } else { 0 }
    $color = if ($f -eq 0) { "Green" } else { "Yellow" }
    Write-Host ("{0,-35} | {1,8} | {2,8} | {3,8} | {4,7}%" -f $name, $tot, $p, $f, $pct) -ForegroundColor $color
}


Format-TierRow "Tier 1: Feature Coverage" $tier1Results
Format-TierRow "Tier 2: Boundary & Corner Cases" $tier2Results
Format-TierRow "Tier 3: Pairwise Combinations" $tier3Results
Format-TierRow "Tier 4: Real-World Scenarios" $tier4Results

Write-Host ("-" * 75) -ForegroundColor DarkGray
$totalPct = if ($totalCount -gt 0) { [math]::Round(($passedCount / $totalCount) * 100, 1) } else { 0 }
$finalColor = if ($failedCount -eq 0) { "Green" } else { "Red" }
Write-Host ("{0,-35} | {1,8} | {2,8} | {3,8} | {4,7}%" -f "TOTAL ACROSS ALL TIERS", $totalCount, $passedCount, $failedCount, $totalPct) -ForegroundColor $finalColor

Write-Host "`nTotal Time: $([math]::Round($masterSw.Elapsed.TotalSeconds, 2)) seconds" -ForegroundColor DarkGray

if ($failedCount -gt 0) {
    Write-Host "`nFailed Tests Detail ($failedCount tests):" -ForegroundColor Red
    $failedTests = $allResults | Where-Object { -not $_.Passed -and -not $_.Skipped }
    foreach ($ft in $failedTests) {
        Write-Host "  - [$($ft.Id)] $($ft.Name)" -ForegroundColor Red
        Write-Host "    Reason: $($ft.Error)" -ForegroundColor DarkRed
    }
}

Write-Host "`n================================================================================" -ForegroundColor DarkCyan
if ($failedCount -eq 0) {
    Write-Host " RESULT: ALL $totalCount TESTS PASSED (SUCCESS)" -ForegroundColor Green
    Write-Host "================================================================================`n" -ForegroundColor DarkCyan
    exit 0
} else {
    Write-Host " RESULT: $failedCount TESTS FAILED OUT OF $totalCount (BASELINE RECORDED)" -ForegroundColor Red
    Write-Host "================================================================================`n" -ForegroundColor DarkCyan
    exit 1
}
