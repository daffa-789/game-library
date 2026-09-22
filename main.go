package main

import (
	"embed"
	"log"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

//go:embed all:renderer
var assets embed.FS

func main() {
	app := NewApp()

	err := wails.Run(&options.App{
		Title:             "Game Library",
		Width:             1400,
		Height:            880,
		MinWidth:          980,
		MinHeight:         620,
		DisableResize:     false,
		Fullscreen:        false,
		Frameless:         false,
		StartHidden:       false,
		HideWindowOnClose: false,
		BackgroundColour:  &options.RGBA{R: 23, G: 26, B: 33, A: 255}, // #171a21 (Steam background)
		AssetServer: &assetserver.Options{
			Assets:  assets,
			Handler: app.ThumbnailHandler(),
		},
		OnStartup: app.startup,
		Bind: []interface{}{
			app,
		},
		SingleInstanceLock: &options.SingleInstanceLock{
			UniqueId: "com.daffa.libraygame",
			OnSecondInstanceLaunch: func(options.SecondInstanceData) {
				app.RestoreWindow()
			},
		},
		Windows: &windows.Options{
			WebviewIsTransparent: false,
			WindowIsTranslucent:  false,
			DisableWindowIcon:    false,
			Theme:                windows.Dark,
		},
	})

	if err != nil {
		log.Fatalf("Fatal application error: %v", err)
	}
}
