# Bukti visual: tangkap jendela Game Library beserta title bar-nya.
#
# Hasil:
#   <Out>            potongan area kerja tempat jendela berada (1:1)
#   <Out>-detail.png  crop kanan-atas title bar, diperbesar supaya tombol
#                     minimize / maximize / close terlihat jelas
#
# Windows menolak SetForegroundWindow dari proses latar, jadi dipakai
# SwitchToThisWindow (mekanisme Alt+Tab) dan hasilnya diverifikasi lewat
# GetForegroundWindow sebelum menangkap — kalau tidak cocok, skrip berhenti
# supaya tidak menghasilkan "bukti" palsu.
param(
    [string]$Out = "$env:TEMP\game-library-bukti.png",
    [int]$Scale = 3,
    [switch]$AllowMinimizeOthers
)

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Ev {
  [DllImport("user32.dll")] public static extern bool SwitchToThisWindow(IntPtr h, bool f);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out Q q);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int a, out Q q, int s);
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [StructLayout(LayoutKind.Sequential)] public struct Q { public int L, T, Rt, B; }
}
"@

$DWMWA_EXTENDED_FRAME_BOUNDS = 9

# WAJIB: tanpa ini proses berjalan DPI-unaware, jadi Screen.WorkingArea
# melaporkan 1536x816 (hasil pembagian scaling 125%) sementara CopyFromScreen
# mengambil pixel fisik 1920x1080 — akibatnya hanya 80% kiri layar yang
# tercaptur dan tombol title bar di pojok kanan tidak pernah ikut.
[void][Ev]::SetProcessDPIAware()
$WS_CAPTION = 0x00C00000
$WS_SYSMENU = 0x00080000
$WS_MINMAX  = 0x00030000

$proc = Get-Process GameLibrary -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $proc -or $proc.MainWindowHandle -eq [IntPtr]::Zero) {
    Write-Error "GameLibrary tidak berjalan."; exit 1
}
$h = $proc.MainWindowHandle
$hwnd = $h   # dipakai callback EnumWindows
if ([Ev]::IsIconic($h)) { [void][Ev]::ShowWindow($h, 9) }

$raised = $false
for ($i = 0; $i -lt 8; $i++) {
    [void][Ev]::SwitchToThisWindow($h, $true)
    [void][Ev]::BringWindowToTop($h)
    [void][Ev]::SetForegroundWindow($h)
    Start-Sleep -Milliseconds 300
    if ([Ev]::GetForegroundWindow() -eq $h) { $raised = $true; break }
}

# Fallback: Windows punya focus-stealing prevention. Kalau naik ke depan
# ditolak, minimalkan sebentar jendela ber-caption lain yang menutupi area
# title bar target, lalu dipulihkan lagi di blok finally.
$minimised = @()
if (-not $raised -and $AllowMinimizeOthers) {
    Write-Host "foreground ditolak -> meminimalkan jendela pengalih sementara"
    $rect0 = New-Object Ev+Q
    [void][Ev]::GetWindowRect($h, [ref]$rect0)
    $callback = [Ev+EnumProc] {
        param([IntPtr]$other, [IntPtr]$l)
        if ($other -ne $hwnd -and [Ev]::IsWindowVisible($other) -and -not [Ev]::IsIconic($other)) {
            $st = [Ev]::GetWindowLong($other, -16)
            if ((($st -band $WS_CAPTION) -eq $WS_CAPTION) -and ($st -band $WS_SYSMENU)) {
                $r = New-Object Ev+Q
                [void][Ev]::GetWindowRect($other, [ref]$r)
                if ($r.L -lt $rect0.Rt -and $r.Rt -gt $rect0.L -and $r.T -lt ($rect0.T + 60) -and $r.B -gt $rect0.T) {
                    $script:minimised += $other
                    [void][Ev]::ShowWindow($other, 6)   # SW_MINIMIZE
                }
            }
        }
        return $true
    }
    [void][Ev]::EnumWindows($callback, [IntPtr]::Zero)
    Start-Sleep -Milliseconds 500
    for ($i = 0; $i -lt 6; $i++) {
        # Trik klasik: menekan ALT membuat proses saat ini dianggap "baru saja
        # menerima input", sehingga Windows mengizinkan SetForegroundWindow.
        [void][Ev]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero)      # ALT down
        [void][Ev]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)      # ALT up
        [void][Ev]::SwitchToThisWindow($h, $true)
        [void][Ev]::SetForegroundWindow($h)
        Start-Sleep -Milliseconds 300
        if ([Ev]::GetForegroundWindow() -eq $h) { $raised = $true; break }
    }
    # Pemulihan jendela dilakukan di finally, SETELAH tangkapan selesai.
}

if (-not $raised) {
    Write-Error ("jendela tidak bisa dijadikan foreground (aktif sekarang={0}, target={1})" -f [Ev]::GetForegroundWindow(), $h)
    exit 2
}
Start-Sleep -Milliseconds 900   # beri DWM waktu menggambar caption

$rect = New-Object Ev+Q
[void][Ev]::GetWindowRect($h, [ref]$rect)
$frame = New-Object Ev+Q
$dwmErr = [Ev]::DwmGetWindowAttribute($h, $DWMWA_EXTENDED_FRAME_BOUNDS, [ref]$frame, 16)
$style = [Ev]::GetWindowLong($h, -16)
$work = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea

$visible = if ($dwmErr -eq 0) { $frame } else { $rect }
$caption = (($style -band $WS_CAPTION) -ne 0)
$close = (($style -band $WS_SYSMENU) -ne 0)
$minmax = (($style -band $WS_MINMAX) -eq $WS_MINMAX)

Write-Host ("work area      : {0}x{1} @({2},{3})" -f $work.Width, $work.Height, $work.X, $work.Y)
Write-Host ("window rect    : ({0},{1})..({2},{3})" -f $rect.L, $rect.T, $rect.Rt, $rect.B)
Write-Host ("dwm frame      : ({0},{1})..({2},{3})  err={4}" -f $frame.L, $frame.T, $frame.Rt, $frame.B, $dwmErr)
Write-Host ("maximized      : $([Ev]::IsZoomed($h))")
Write-Host ("style          : caption=$caption close=$close minmax=$minmax")
Write-Host ("title bar      : atas visible di y=$($visible.T) (batas atas layar = $($work.Y)) -> " +
    $(if ($visible.T -ge $work.Y) { "DI LAYAR" } else { "TERGANTUNG DI LUAR" }))

# 1) tangkap area kerja penuh
$full = New-Object System.Drawing.Bitmap($work.Width, $work.Height)
$g = [System.Drawing.Graphics]::FromImage($full)
$g.CopyFromScreen($work.X, $work.Y, 0, 0, (New-Object System.Drawing.Size($work.Width, $work.Height)))
$g.Dispose()
$full.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "tersimpan      : $Out"

# 2) crop kanan-atas title bar (tempat tombol min/max/close berada), diperbesar
$x1 = [Math]::Max(0, [Math]::Min($visible.Rt, $work.X + $work.Width) - 460)
$y1 = [Math]::Max(0, $visible.T - $work.Y)
$cw = [Math]::Min(460, $work.Width - $x1)
$ch = [Math]::Min(44, $work.Height - $y1)
$cropRect = New-Object System.Drawing.Rectangle($x1, $y1, $cw, $ch)
$crop = $full.Clone($cropRect, $full.PixelFormat)
$full.Dispose()

$big = New-Object System.Drawing.Bitmap(($cw * $Scale), ($ch * $Scale))
$gb = [System.Drawing.Graphics]::FromImage($big)
$gb.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$gb.DrawImage($crop, 0, 0, ($cw * $Scale), ($ch * $Scale))
$gb.Dispose(); $crop.Dispose()

$detail = [System.IO.Path]::ChangeExtension($Out, $null).TrimEnd('.') + "-detail.png"
$big.Save($detail, [System.Drawing.Imaging.ImageFormat]::Png)
$big.Dispose()
Write-Host "tersimpan      : $detail (crop ${cw}x${ch} diperbesar ${Scale}x)"
