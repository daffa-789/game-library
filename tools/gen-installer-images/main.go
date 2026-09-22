// Command gen-installer-images membuat bitmap branding untuk wizard NSIS
// (build/windows/installer/resources/).
//
// NSIS minta BMP 24-bit tanpa kompresi dengan ukuran yang pas:
//   - sidebar (halaman Welcome/Finish): 164 x 314
//   - header  (di atas setiap halaman) : 150 x 57
//
// Pakai:  go run ./tools/gen-installer-images
package main

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"image"
	"image/color"
	_ "image/png"
	"os"
	"path/filepath"
)

const (
	sidebarW, sidebarH = 164, 314
	headerW, headerH   = 150, 57

	// Palet tema Steam yang dipakai aplikasi (lihat renderer/styles.css).
	bgTop    = 0x171a21
	bgBottom = 0x1b2838
	accent   = 0x66c0f4
)

func main() {
	root, err := projectRoot()
	if err != nil {
		fail(err)
	}

	icon, err := loadRGBA(filepath.Join(root, "build", "appicon.png"))
	if err != nil {
		fail(fmt.Errorf("gagal membaca ikon aplikasi: %w", err))
	}

	outDir := filepath.Join(root, "build", "windows", "installer", "resources")
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		fail(err)
	}

	side := makeSidebar(icon)
	head := makeHeader(icon)

	if err := writeBMP(filepath.Join(outDir, "sidebar.bmp"), side); err != nil {
		fail(err)
	}
	if err := writeBMP(filepath.Join(outDir, "header.bmp"), head); err != nil {
		fail(err)
	}

	fmt.Printf("sidebar.bmp (%dx%d) + header.bmp (%dx%d) -> %s\n",
		sidebarW, sidebarH, headerW, headerH, outDir)
}

// ---------------------------------------------------------------------------
// Komposisi gambar
// ---------------------------------------------------------------------------

func makeSidebar(icon image.Image) *image.RGBA {
	img := image.NewRGBA(image.Rect(0, 0, sidebarW, sidebarH))
	verticalGradient(img, colorRGBA(bgTop), colorRGBA(bgBottom))

	// Bingkai kanan tipis supaya menyatu dengan halaman wizard.
	for y := 0; y < sidebarH; y++ {
		img.Set(sidebarW-1, y, colorRGBA(0x0d141b))
	}

	// Ikon aplikasi, 128 px, sedikit di atas tengah.
	size := 128
	y := 74
	compositeCentered(img, scaleArea(icon, size, size), sidebarW/2, y+size/2)

	// Garis aksen + panel bawah.
	c := colorRGBA(accent)
	for px := 32; px < sidebarW-32; px++ {
		img.Set(px, 232, c)
		img.Set(px, 233, blend(c, colorRGBA(bgBottom), 0.55))
	}
	return img
}

func makeHeader(icon image.Image) *image.RGBA {
	img := image.NewRGBA(image.Rect(0, 0, headerW, headerH))
	horizontalGradient(img, colorRGBA(bgBottom), colorRGBA(bgTop))

	size := 41
	compositeCentered(img, scaleArea(icon, size, size), 8+size/2, headerH/2)

	c := colorRGBA(accent)
	for x := 0; x < headerW; x++ {
		img.Set(x, headerH-1, c)
	}
	return img
}

// ---------------------------------------------------------------------------
// Helper gambar (tanpa dependensi eksternal)
// ---------------------------------------------------------------------------

func loadRGBA(path string) (image.Image, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	decoded, _, err := image.Decode(bytes.NewReader(raw))
	if err != nil {
		return nil, err
	}
	return decoded, nil
}

// scaleArea meresize dengan rata-rata area (box filter): bersih untuk downscale
// karena tidak membuang pixel sumber.
func scaleArea(src image.Image, w, h int) *image.RGBA {
	dst := image.NewRGBA(image.Rect(0, 0, w, h))
	b := src.Bounds()
	sx := float64(b.Dx()) / float64(w)
	sy := float64(b.Dy()) / float64(h)

	for dy := 0; dy < h; dy++ {
		y0 := b.Min.Y + int(float64(dy)*sy)
		y1 := b.Min.Y + int(float64(dy+1)*sy)
		if y1 <= y0 {
			y1 = y0 + 1
		}
		for dx := 0; dx < w; dx++ {
			x0 := b.Min.X + int(float64(dx)*sx)
			x1 := b.Min.X + int(float64(dx+1)*sx)
			if x1 <= x0 {
				x1 = x0 + 1
			}
			var r, g, bl, a, n uint64
			for yy := y0; yy < y1 && yy < b.Max.Y; yy++ {
				for xx := x0; xx < x1 && xx < b.Max.X; xx++ {
					rr, gg, bb, aa := src.At(xx, yy).RGBA()
					r += uint64(rr >> 8)
					g += uint64(gg >> 8)
					bl += uint64(bb >> 8)
					a += uint64(aa >> 8)
					n++
				}
			}
			if n == 0 {
				continue
			}
			// Premultiplied alpha tidak dipakai di sumber, jadi normalisasi
			// warna berdasarkan alpha rata-rata.
			al := uint64(a / n)
			var rOut, gOut, bOut uint64
			if al == 0 {
				rOut, gOut, bOut = 0, 0, 0
			} else {
				rOut = r / n * 255 / al
				gOut = g / n * 255 / al
				bOut = bl / n * 255 / al
			}
			dst.SetRGBA(dx, dy, color.RGBA{R: uint8(rOut), G: uint8(gOut), B: uint8(bOut), A: uint8(al)})
		}
	}
	return dst
}

// compositeCentered menempelkan src alpha-blend di tengah (cx, cy) pada dst.
func compositeCentered(dst *image.RGBA, src *image.RGBA, cx, cy int) {
	sb := src.Bounds()
	ox := cx - sb.Dx()/2
	oy := cy - sb.Dy()/2
	db := dst.Bounds()

	for y := sb.Min.Y; y < sb.Max.Y; y++ {
		dy := oy + y
		if dy < db.Min.Y || dy >= db.Max.Y {
			continue
		}
		for x := sb.Min.X; x < sb.Max.X; x++ {
			dx := ox + x
			if dx < db.Min.X || dx >= db.Max.X {
				continue
			}
			s := src.RGBAAt(x, y)
			if s.A == 0 {
				continue
			}
			d := dst.RGBAAt(dx, dy)
			dst.SetRGBA(dx, dy, color.RGBA{
				R: uint8((uint32(s.R)*uint32(s.A) + uint32(d.R)*uint32(255-s.A)) / 255),
				G: uint8((uint32(s.G)*uint32(s.A) + uint32(d.G)*uint32(255-s.A)) / 255),
				B: uint8((uint32(s.B)*uint32(s.A) + uint32(d.B)*uint32(255-s.A)) / 255),
				A: 255,
			})
		}
	}
}

func verticalGradient(img *image.RGBA, top, bottom color.RGBA) {
	b := img.Bounds()
	for y := b.Min.Y; y < b.Max.Y; y++ {
		t := float64(y-b.Min.Y) / float64(b.Dy()-1)
		c := lerpColor(top, bottom, t)
		for x := b.Min.X; x < b.Max.X; x++ {
			img.SetRGBA(x, y, c)
		}
	}
}

func horizontalGradient(img *image.RGBA, left, right color.RGBA) {
	b := img.Bounds()
	for x := b.Min.X; x < b.Max.X; x++ {
		t := float64(x-b.Min.X) / float64(b.Dx()-1)
		c := lerpColor(left, right, t)
		for y := b.Min.Y; y < b.Max.Y; y++ {
			img.SetRGBA(x, y, c)
		}
	}
}

func lerpColor(a, b color.RGBA, t float64) color.RGBA {
	return color.RGBA{
		R: uint8(float64(a.R) + (float64(b.R)-float64(a.R))*t),
		G: uint8(float64(a.G) + (float64(b.G)-float64(a.G))*t),
		B: uint8(float64(a.B) + (float64(b.B)-float64(a.B))*t),
		A: 255,
	}
}

func blend(c, over color.RGBA, t float64) color.RGBA {
	return lerpColor(c, over, t)
}

func colorRGBA(hexVal uint32) color.RGBA {
	return color.RGBA{R: uint8(hexVal >> 16), G: uint8(hexVal >> 8), B: uint8(hexVal), A: 255}
}

// writeBMP menyimpan sebagai BMP 24-bit BGR, bottom-up, baris di-pad ke 4 byte.
func writeBMP(path string, img *image.RGBA) error {
	b := img.Bounds()
	w, h := b.Dx(), b.Dy()
	// Baris BMP 24-bit harus di-pad sampai kelipatan 4 byte.
	rowSize := ((w*3 + 3) / 4) * 4
	pixelSize := rowSize * h
	fileSize := 14 + 40 + pixelSize

	buf := new(bytes.Buffer)
	binary.Write(buf, binary.LittleEndian, []byte("BM"))
	binary.Write(buf, binary.LittleEndian, uint32(fileSize))
	binary.Write(buf, binary.LittleEndian, uint32(0))
	binary.Write(buf, binary.LittleEndian, uint32(14+40))
	binary.Write(buf, binary.LittleEndian, uint32(40)) // BITMAPINFOHEADER
	binary.Write(buf, binary.LittleEndian, uint32(w))
	binary.Write(buf, binary.LittleEndian, uint32(h))
	binary.Write(buf, binary.LittleEndian, uint16(1))
	binary.Write(buf, binary.LittleEndian, uint16(24))
	binary.Write(buf, binary.LittleEndian, uint32(0)) // BI_RGB
	binary.Write(buf, binary.LittleEndian, uint32(pixelSize))
	binary.Write(buf, binary.LittleEndian, uint32(2835))
	binary.Write(buf, binary.LittleEndian, uint32(2835))
	binary.Write(buf, binary.LittleEndian, uint32(0))
	binary.Write(buf, binary.LittleEndian, uint32(0))

	rows := make([]byte, pixelSize)
	for y := 0; y < h; y++ {
		dst := (h - 1 - y) * rowSize // bottom-up
		for x := 0; x < w; x++ {
			c := img.RGBAAt(b.Min.X+x, b.Min.Y+y)
			rows[dst+x*3+0] = c.B
			rows[dst+x*3+1] = c.G
			rows[dst+x*3+2] = c.R
		}
	}
	buf.Write(rows)

	return os.WriteFile(path, buf.Bytes(), 0o644)
}

// ---------------------------------------------------------------------------

func projectRoot() (string, error) {
	wd, err := os.Getwd()
	if err != nil {
		return "", err
	}
	// Tool dipanggil dari repo root (`go run ./tools/...`) atau dari direktorinya.
	if _, err := os.Stat(filepath.Join(wd, "wails.json")); err == nil {
		return wd, nil
	}
	return filepath.Abs(filepath.Join(wd, "..", ".."))
}

func fail(err error) {
	fmt.Fprintln(os.Stderr, "error:", err)
	os.Exit(1)
}
