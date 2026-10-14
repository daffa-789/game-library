; ============================================================================
; SoftGame Library — script installer Windows (Inno Setup 6)
;
; Versi Rust native (eframe/egui), pengganti versi Electron di
; C:\Program Files\SoftGame Library.
;
; Build installer:
;   "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer\softgame.iss
; Hasil: installer\output\SoftGameLibrary-Setup-3.0.0.exe
;
; Instalasi per-user (tanpa UAC/admin):
;   %LOCALAPPDATA%\Programs\SoftGame Library
; Data katalog (%APPDATA%\softgame-library) TIDAK disentuh installer.
; ============================================================================

#define MyAppName "SoftGame Library"
#define MyAppVersion "3.0.0"
#define MyAppPublisher "Daffa"
#define MyAppURL "https://github.com/daffa-789/game-library"
#define MyAppExeName "SoftGame Library.exe"

[Setup]
; GUID stabil — jangan diubah setelah rilis (dipakai untuk deteksi upgrade)
AppId={{8A3C9B42-7D1E-4F6A-9C5B-2E8D4A1F6C3B}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
VersionInfoVersion={#MyAppVersion}
VersionInfoProductName={#MyAppName}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={localappdata}\Programs\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
DisableDirPage=no
PrivilegesRequired=lowest
AllowNoIcons=yes
OutputDir=output
OutputBaseFilename=SoftGameLibrary-Setup-{#MyAppVersion}
SetupIconFile=icon\softgame-icon.ico
UninstallDisplayName={#MyAppName} {#MyAppVersion}
UninstallDisplayIcon={app}\assets\icon.ico
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
; Binary utama (rename jadi "SoftGame Library.exe" biar seragam dengan versi lama)
Source: "..\target\release\softgame-library.exe"; DestDir: "{app}"; DestName: "{#MyAppExeName}"; Flags: ignoreversion
; Ikon aplikasi: dipakai shortcut + fallback ikon jendela saat runtime
Source: "icon\softgame-icon.ico"; DestDir: "{app}"; DestName: "icon.ico"; Flags: ignoreversion
Source: "icon\softgame-icon.ico"; DestDir: "{app}\assets"; DestName: "icon.ico"; Flags: ignoreversion
Source: "icon\softgame-icon-256.png"; DestDir: "{app}\assets"; DestName: "icon-256.png"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\icon.ico"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\icon.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent
