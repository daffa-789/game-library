; =============================================================================
;  Game Library — skrip installer NSIS (Wails v2)
;
;  Berkas ini dipakai oleh `wails build -nsis`. Nilai !define di bawah MENANG
;  atas default dari wails_tools.nsh, jadi nama aplikasi, nama berkas exe, dan
;  kunci registry uninstall dikontrol dari sini.
;
;  Catatan: wails_tools.nsh ditulis ulang oleh Wails setiap build, jadi semua
;  kustomisasi harus berada di berkas ini, sebelum !include-nya.
; =============================================================================

Unicode true

; --- Identitas produk -------------------------------------------------------
; INFO_PROJECTNAME menentukan default ${PRODUCT_EXECUTABLE}. Disamakan dengan
; "outputfilename" di wails.json (GameLibrary.exe) supaya pintasan Start Menu
; dan Desktop menunjuk ke berkas yang benar-benar ada.
!define INFO_PROJECTNAME        "GameLibrary"
!define INFO_COMPANYNAME        "Daffa"
!define INFO_PRODUCTNAME        "Game Library"
!define PRODUCT_EXECUTABLE      "GameLibrary.exe"
!define UNINST_KEY_NAME         "GameLibrary"
!define INSTALL_FOLDER_NAME     "Game Library"

; Instal per-pengguna: tanpa prompt UAC. Data aplikasi memang sudah berada di
; %APPDATA% milik pengguna yang sama. `wails build -installscope user` juga
; mendefinisikan ini dari command line, jadi jangan menimpa bila sudah ada.
!ifndef REQUEST_EXECUTION_LEVEL
  !define REQUEST_EXECUTION_LEVEL "user"
!endif

!include "wails_tools.nsh"

; --- Kompresi ---------------------------------------------------------------
; LZMA solid memangkas ukuran installer secara signifikan.
SetCompressor /SOLID lzma
SetCompressorDictSize 32

; --- Metadata versi berkas --------------------------------------------------
VIProductVersion "${INFO_PRODUCTVERSION}.0"
VIFileVersion    "${INFO_PRODUCTVERSION}.0"

VIAddVersionKey "CompanyName"     "${INFO_COMPANYNAME}"
VIAddVersionKey "FileDescription" "Installer ${INFO_PRODUCTNAME}"
VIAddVersionKey "ProductVersion"  "${INFO_PRODUCTVERSION}"
VIAddVersionKey "FileVersion"     "${INFO_PRODUCTVERSION}"
VIAddVersionKey "LegalCopyright"  "${INFO_COPYRIGHT}"
VIAddVersionKey "ProductName"     "${INFO_PRODUCTNAME}"

ManifestDPIAware true

!include "MUI.nsh"

!define MUI_ICON "..\icon.ico"
!define MUI_UNICON "..\icon.ico"

; Branding wizard. Bitmap dibuat oleh `go run ./tools/gen-installer-images`
; (sidebar 164x314, header 150x57, BMP 24-bit — syarat NSIS).
!define MUI_WELCOMEFINISHPAGE_BITMAP "resources\sidebar.bmp"
!define MUI_HEADER_BITMAP "resources\header.bmp"

!define MUI_WELCOMEPAGE_TITLE "Selamat Datang di Instalasi ${INFO_PRODUCTNAME}"
!define MUI_WELCOMEPAGE_TEXT "Installer ini akan memasang ${INFO_PRODUCTNAME} versi ${INFO_PRODUCTVERSION} di komputer Anda.$\n$\nKatalog game (library.json) beserta thumbnail disimpan di:$\n$APPDATA\libray-game$\n$\nFolder tersebut TIDAK ikut terhapus saat uninstall, jadi koleksi Anda tetap aman.$\n$\nSilakan tutup ${INFO_PRODUCTNAME} yang sedang berjalan sebelum melanjutkan."

!define MUI_DIRECTORYPAGE_TEXT_TOP "Pilih folder pemasangan. Instalasi ini bersifat per-pengguna sehingga tidak membutuhkan hak administrator."

!define MUI_FINISHPAGE_RUN "$INSTDIR\${PRODUCT_EXECUTABLE}"
!define MUI_FINISHPAGE_RUN_TEXT "Jalankan ${INFO_PRODUCTNAME} sekarang"
!define MUI_FINISHPAGE_RUN_CHECKED
!define MUI_FINISHPAGE_TEXT "${INFO_PRODUCTNAME} sudah terpasang.$\n$\nBuka aplikasinya, tempel link Steam Store, lalu klik tombol Steam Link untuk mengisi data game secara otomatis."

!define MUI_UNCONFIRMPAGE_TEXT_TOP "Program akan dihapus dari folder pemasangannya. Katalog game dan thumbnail di $APPDATA\libray-game tetap dipertahankan."

!define MUI_ABORTWARNING

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

; Bahasa pertama dipakai sebagai default installer.
!insertmacro MUI_LANGUAGE "Indonesian"
!insertmacro MUI_LANGUAGE "English"

Name "${INFO_PRODUCTNAME}"
OutFile "..\..\bin\GameLibrary-Setup-${INFO_PRODUCTVERSION}-${ARCH}.exe"
InstallDir "$LOCALAPPDATA\Programs\${INSTALL_FOLDER_NAME}"
ShowInstDetails show
ShowUninstDetails show

Function .onInit
  !insertmacro wails.checkArchitecture
FunctionEnd

Section
  !insertmacro wails.setShellContext

  ; WebView2 Runtime dibutuhkan sebagai mesin rendering; dipasang otomatis
  ; bila belum ada di sistem.
  !insertmacro wails.webview2runtime

  SetOutPath $INSTDIR

  !insertmacro wails.files

  CreateShortcut "$SMPROGRAMS\${INFO_PRODUCTNAME}.lnk" "$INSTDIR\${PRODUCT_EXECUTABLE}"
  CreateShortCut "$DESKTOP\${INFO_PRODUCTNAME}.lnk" "$INSTDIR\${PRODUCT_EXECUTABLE}"

  !insertmacro wails.associateFiles
  !insertmacro wails.associateCustomProtocols

  WriteRegStr HKCU "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_KEY}" "Readme" "$APPDATA\libray-game"

  !insertmacro wails.writeUninstaller
SectionEnd

Section "uninstall"
  !insertmacro wails.setShellContext

  ; Hanya menghapus berkas data WebView2 milik aplikasi, BUKAN folder
  ; $APPDATA\libray-game, agar katalog pengguna tidak hilang karena uninstall.
  RMDir /r "$AppData\${PRODUCT_EXECUTABLE}"

  RMDir /r $INSTDIR

  Delete "$SMPROGRAMS\${INFO_PRODUCTNAME}.lnk"
  Delete "$DESKTOP\${INFO_PRODUCTNAME}.lnk"

  !insertmacro wails.unassociateFiles
  !insertmacro wails.unassociateCustomProtocols

  !insertmacro wails.deleteUninstaller
SectionEnd
