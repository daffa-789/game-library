package main

import (
	"fmt"
	"net/url"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// ---------------------------------------------------------------------------
// Backend API: Integrasi Sistem (Browser & Clipboard)
// ---------------------------------------------------------------------------

// OpenExternal hanya mengizinkan skema http/https supaya aplikasi tidak pernah
// jadi jalan masuk untuk meluncurkan protokol berbahaya dari data yang diimpor.
func (a *App) OpenExternal(urlStr string) error {
	trimmed := strings.TrimSpace(urlStr)
	parsed, err := url.Parse(trimmed)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
		return fmt.Errorf("URL tidak valid")
	}
	if a.ctx != nil {
		runtime.BrowserOpenURL(a.ctx, parsed.String())
	}
	return nil
}

func (a *App) CopyText(text string) error {
	if a.ctx == nil {
		return nil
	}
	return runtime.ClipboardSetText(a.ctx, text)
}
