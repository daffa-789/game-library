# ============================================================================
# tests/e2e/test_utils.ps1
# Opaque-Box Test Utilities & Assertions for SoftGame Library E2E Test Suite
# ============================================================================

$global:ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")

# Ensure Go and Wails are discoverable on PATH
$GoPaths = @(
    "C:\Program Files\Go\bin",
    "$env:USERPROFILE\go\bin",
    "C:\Go\bin"
)
foreach ($gp in $GoPaths) {
    if ((Test-Path $gp) -and ($env:PATH -notlike "*$gp*")) {
        $env:PATH = "$gp;$env:PATH"
    }
}

# Test Results Collection
if (-not $global:TestResults) {
    $global:TestResults = [System.Collections.Generic.List[PSCustomObject]]::new()
}

function Reset-TestResults {
    if ($global:TestResults) {
        $global:TestResults.Clear()
    } else {
        $global:TestResults = [System.Collections.Generic.List[PSCustomObject]]::new()
    }
}

function Get-TestResults {
    return $global:TestResults
}

# ----------------------------------------------------------------------------
# Test Execution Wrapper
# ----------------------------------------------------------------------------
function Invoke-TestCase {
    param(
        [Parameter(Mandatory=$true)][string]$Id,
        [Parameter(Mandatory=$true)][string]$Tier,
        [Parameter(Mandatory=$true)][string]$Feature,
        [Parameter(Mandatory=$true)][string]$Name,
        [Parameter(Mandatory=$true)][scriptblock]$ScriptBlock,
        [switch]$VerboseOutput
    )

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $passed = $false
    $skipped = $false
    $errorMessage = ""

    try {
        & $ScriptBlock
        $passed = $true
    }
    catch {
        $errorMessage = $_.Exception.Message
        if ($_.CategoryInfo.Category -eq "InvalidOperation" -and $errorMessage -like "*SKIP*") {
            $skipped = $true
            $passed = $false
        } else {
            $passed = $false
        }
    }
    finally {
        $sw.Stop()
    }

    $result = [PSCustomObject]@{
        Id        = $Id
        Tier      = $Tier
        Feature   = $Feature
        Name      = $Name
        Passed    = $passed
        Skipped   = $skipped
        Error     = $errorMessage
        Duration  = [math]::Round($sw.Elapsed.TotalMilliseconds, 2)
    }

    $global:TestResults.Add($result)

    if ($passed) {
        Write-Host "  [PASS] " -ForegroundColor Green -NoNewline
        Write-Host "$Id - $Name " -ForegroundColor White -NoNewline
        Write-Host "($($result.Duration)ms)" -ForegroundColor DarkGray
    }
    elseif ($skipped) {
        Write-Host "  [SKIP] " -ForegroundColor Yellow -NoNewline
        Write-Host "$Id - $Name " -ForegroundColor Yellow -NoNewline
        Write-Host "($errorMessage)" -ForegroundColor DarkGray
    }
    else {
        Write-Host "  [FAIL] " -ForegroundColor Red -NoNewline
        Write-Host "$Id - $Name " -ForegroundColor Red -NoNewline
        Write-Host "($($result.Duration)ms)" -ForegroundColor DarkGray
        Write-Host "         Error: $errorMessage" -ForegroundColor DarkRed
    }
}


# ----------------------------------------------------------------------------
# Assertions
# ----------------------------------------------------------------------------

function Assert-True {
    param(
        $Condition,
        [string]$Message = "Assertion failed: condition was not true",
        [string]$Details = ""
    )
    if (-not $Condition) {
        $msg = $Message
        if ($Details) { $msg += " ($Details)" }
        throw $msg
    }
}

function Assert-False {
    param(
        $Condition,
        [string]$Message = "Assertion failed: condition was not false",
        [string]$Details = ""
    )
    if ($Condition) {
        $msg = $Message
        if ($Details) { $msg += " ($Details)" }
        throw $msg
    }
}


function Assert-Equal {
    param(
        $Expected,
        $Actual,
        [string]$Message = "Assertion failed: values are not equal",
        [string]$Details = ""
    )
    if ($Expected -ne $Actual) {
        $msg = "$Message (Expected: '$Expected', Actual: '$Actual')"
        if ($Details) { $msg += " [$Details]" }
        throw $msg
    }
}

function Assert-NotEqual {
    param(
        $Expected,
        $Actual,
        [string]$Message = "Assertion failed: values are equal",
        [string]$Details = ""
    )
    if ($Expected -eq $Actual) {
        $msg = "$Message (Expected not equal to '$Expected', Actual was '$Actual')"
        if ($Details) { $msg += " [$Details]" }
        throw $msg
    }
}

function Assert-Matches {
    param(
        [string]$Pattern,
        [string]$Actual,
        [string]$Message = "Assertion failed: string did not match regex pattern"
    )
    if ($Actual -notmatch $Pattern) {
        throw "$Message (Pattern: '$Pattern', Actual: '$Actual')"
    }
}

function Assert-FileExists {
    param(
        [string]$Path,
        [string]$Message = "Expected file to exist"
    )
    if (-not (Test-Path $Path -PathType Leaf)) {
        throw "${Message}: '$Path' was not found."
    }
}

function Assert-FileNotExists {
    param(
        [string]$Path,
        [string]$Message = "Expected file to NOT exist"
    )
    if (Test-Path $Path) {
        throw "${Message}: '$Path' still exists."
    }
}

function Assert-DirectoryExists {
    param(
        [string]$Path,
        [string]$Message = "Expected directory to exist"
    )
    if (-not (Test-Path $Path -PathType Container)) {
        throw "${Message}: '$Path' was not found."
    }
}

function Assert-JsonValid {
    param(
        [string]$JsonString,
        [string]$Message = "JSON string is invalid"
    )
    try {
        $obj = ConvertFrom-Json $JsonString -ErrorAction Stop
        return $obj
    }
    catch {
        throw "${Message}: $($_.Exception.Message)"
    }
}


# ----------------------------------------------------------------------------
# Go Source Inspection
#
# Backend Go proyek ini dipecah ke beberapa berkas (app.go, library.go,
# thumbnails.go, steam.go, sanitize.go, system.go). Pemeriksaan "apakah
# perilaku X diimplementasikan" tidak boleh terikat pada satu nama berkas,
# jadi baca seluruh berkas *.go non-test sebagai satu kesatuan.
# ----------------------------------------------------------------------------

function Get-GoSource {
    param(
        [Parameter(Mandatory = $true)][string]$Root
    )
    $files = @(Get-ChildItem -Path $Root -Filter "*.go" -File |
        Where-Object { $_.Name -notlike "*_test.go" } |
        Sort-Object Name)
    if ($files.Count -eq 0) { return "" }
    return (($files | ForEach-Object { Get-Content -LiteralPath $_.FullName -Raw }) -join "`r`n")
}


# ----------------------------------------------------------------------------
# PE Binary Inspection (MZ header, Machine, Subsystem, Size)
# ----------------------------------------------------------------------------

function Get-PeBinaryInfo {
    param(
        [Parameter(Mandatory=$true)][string]$FilePath
    )

    if (-not (Test-Path $FilePath -PathType Leaf)) {
        return $null
    }

    $fi = Get-Item $FilePath
    $fileBytes = [System.IO.File]::ReadAllBytes($FilePath)
    $len = $fileBytes.Length

    if ($len -lt 64) {
        return [PSCustomObject]@{
            IsValidPe   = $false
            Size        = $len
            Error       = "File is smaller than 64 bytes"
        }
    }

    # DOS Header: MZ signature (0x4D, 0x5A)
    $isMz = ($fileBytes[0] -eq 0x4D -and $fileBytes[1] -eq 0x5A)
    if (-not $isMz) {
        return [PSCustomObject]@{
            IsValidPe   = $false
            Size        = $len
            Error       = "File does not start with DOS 'MZ' header"
        }
    }

    # e_lfanew at offset 0x3C (little-endian 32-bit integer)
    $e_lfanew = [System.BitConverter]::ToInt32($fileBytes, 0x3C)
    if ($e_lfanew -le 0 -or ($e_lfanew + 24) -gt $len) {
        return [PSCustomObject]@{
            IsValidPe   = $false
            Size        = $len
            Error       = "Invalid PE header offset (e_lfanew: $e_lfanew)"
        }
    }

    # PE Signature: "PE\0\0" (0x50, 0x45, 0x00, 0x00)
    $isPe = ($fileBytes[$e_lfanew] -eq 0x50 -and
             $fileBytes[$e_lfanew + 1] -eq 0x45 -and
             $fileBytes[$e_lfanew + 2] -eq 0x00 -and
             $fileBytes[$e_lfanew + 3] -eq 0x00)
    if (-not $isPe) {
        return [PSCustomObject]@{
            IsValidPe   = $false
            Size        = $len
            Error       = "Missing PE signature at offset $e_lfanew"
        }
    }

    # COFF File Header: Machine at e_lfanew + 4 (2 bytes)
    # 0x8664 = AMD64 (x64), 0x014C = i386 (x86), 0xAA64 = ARM64
    $machine = [System.BitConverter]::ToUInt16($fileBytes, $e_lfanew + 4)
    $machineName = switch ($machine) {
        0x8664 { "AMD64" }
        0x014C { "I386" }
        0xAA64 { "ARM64" }
        default { "Unknown (0x{0:X4})" -f $machine }
    }

    # SizeOfOptionalHeader at e_lfanew + 20
    $optHeaderSize = [System.BitConverter]::ToUInt16($fileBytes, $e_lfanew + 20)
    $subsystem = 0
    $subsystemName = "Unknown"

    if ($optHeaderSize -ge 70 -and ($e_lfanew + 24 + $optHeaderSize) -le $len) {
        $optHeaderOffset = $e_lfanew + 24
        $magic = [System.BitConverter]::ToUInt16($fileBytes, $optHeaderOffset)
        # Magic 0x20B = PE32+ (64-bit), 0x10B = PE32 (32-bit)
        $subsystemOffset = if ($magic -eq 0x20B) { $optHeaderOffset + 68 } else { $optHeaderOffset + 68 }
        if (($subsystemOffset + 2) -le $len) {
            $subsystem = [System.BitConverter]::ToUInt16($fileBytes, $subsystemOffset)
            $subsystemName = switch ($subsystem) {
                2 { "Windows GUI" }
                3 { "Windows CUI (Console)" }
                default { "Subsystem-$subsystem" }
            }
        }
    }

    return [PSCustomObject]@{
        IsValidPe     = $true
        Size          = $len
        SizeMB        = [math]::Round($len / 1MB, 2)
        Machine       = $machine
        MachineName   = $machineName
        Subsystem     = $subsystem
        SubsystemName = $subsystemName
        IsX64         = ($machine -eq 0x8664)
        IsGui         = ($subsystem -eq 2)
        Under15MB     = ($len -lt 15728640)
    }
}

# ----------------------------------------------------------------------------
# Test Sandboxes
# ----------------------------------------------------------------------------

function New-TestSandbox {
    $tempBase = [System.IO.Path]::GetTempPath()
    $guid = [System.Guid]::NewGuid().ToString("N")
    $sandboxPath = Join-Path $tempBase "softgame-library-test-$guid"
    $thumbsPath = Join-Path $sandboxPath "thumbnails"

    $null = New-Item -ItemType Directory -Path $sandboxPath -Force
    $null = New-Item -ItemType Directory -Path $thumbsPath -Force

    return [PSCustomObject]@{
        Root       = $sandboxPath
        DataFile   = Join-Path $sandboxPath "library.json"
        ThumbsDir  = $thumbsPath
    }
}

function Remove-TestSandbox {
    param([string]$SandboxRoot)
    if ($SandboxRoot -and (Test-Path $SandboxRoot)) {
        Remove-Item -Path $SandboxRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
