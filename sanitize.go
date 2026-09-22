package main

import (
	"crypto/rand"
	"fmt"
	"strings"
	"time"
)

// ---------------------------------------------------------------------------
// Sanitasi input: semua data yang masuk ke disk melewati fungsi ini.
// Batas panjang memakai truncateUTF8 supaya pemotongan tidak memecah rune.
// ---------------------------------------------------------------------------

const (
	maxLenID         = 64
	maxLenTitle      = 200
	maxLenRef        = 2000
	maxLenGenre      = 120
	maxLenSize       = 60
	maxLenPrice      = 60
	maxLenSteamAppID = 20
	maxLenSpecField  = 400
)

// sanitizeGame membersihkan satu entri game. `now` adalah timestamp RFC3339
// yang sama untuk seluruh batch pada satu kali simpan.
func (a *App) sanitizeGame(g Game, now string) Game {
	trim := func(s string, limit int) string {
		return truncateUTF8(strings.TrimSpace(s), limit)
	}

	if g.ID == "" {
		g.ID = newGameID()
	}
	if g.CreatedAt == "" {
		g.CreatedAt = now
	}
	g.UpdatedAt = now

	g.ID = trim(g.ID, maxLenID)
	g.Title = trim(g.Title, maxLenTitle)
	g.Thumbnail = trim(g.Thumbnail, maxLenRef)
	g.Link = trim(g.Link, maxLenRef)
	g.Genre = trim(g.Genre, maxLenGenre)
	g.Size = trim(g.Size, maxLenSize)
	g.Price = trim(g.Price, maxLenPrice)
	g.SteamAppID = trim(g.SteamAppID, maxLenSteamAppID)

	g.Specs.Min = sanitizeSpecs(g.Specs.Min, trim)
	g.Specs.Rec = sanitizeSpecs(g.Specs.Rec, trim)
	return g
}

func sanitizeSpecs(s SystemSpecs, trim func(string, int) string) SystemSpecs {
	return SystemSpecs{
		OS:      trim(s.OS, maxLenSpecField),
		CPU:     trim(s.CPU, maxLenSpecField),
		RAM:     trim(s.RAM, maxLenSpecField),
		GPU:     trim(s.GPU, maxLenSpecField),
		DX:      trim(s.DX, maxLenSpecField),
		Net:     trim(s.Net, maxLenSpecField),
		Storage: trim(s.Storage, maxLenSpecField),
		Sound:   trim(s.Sound, maxLenSpecField),
		Notes:   trim(s.Notes, maxLenSpecField),
	}
}

// newGameID menghasilkan UUID v4 tanpa dependensi eksternal.
func newGameID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		// Praktis tidak terjadi di Windows; fallback tetap unik secara praktis.
		return fmt.Sprintf("g-%d", time.Now().UnixNano())
	}
	b[6] = (b[6] & 0x0f) | 0x40 // versi 4
	b[8] = (b[8] & 0x3f) | 0x80 // varian RFC 4122
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}
