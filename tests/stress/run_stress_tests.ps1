# Empirical Stress Test Runner
# Verifies persistence, concurrency, data boundaries, and corrupt file recovery.

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host " Running Persistence & Concurrency Adversarial Stress Tests" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan

$GoExe = "C:\Program Files\Go\bin\go.exe"
if (-not (Test-Path $GoExe)) {
    $GoCmd = Get-Command go -ErrorAction SilentlyContinue
    if ($GoCmd) {
        $GoExe = $GoCmd.Source
    } else {
        Write-Error "Go binary not found!"
        exit 1
    }
}

Write-Host "Using Go binary: $GoExe" -ForegroundColor Yellow

# Execute stress tests
& $GoExe test -v -run "TestStress.*" .
$exitCode = $LASTEXITCODE

if ($exitCode -eq 0) {
    Write-Host "`nAll Persistence & Concurrency Stress Tests PASSED!" -ForegroundColor Green
} else {
    Write-Host "`nStress Tests FAILED with exit code $exitCode" -ForegroundColor Red
}

exit $exitCode
