// Konfigurasi Vite untuk renderer React (JSX).
//
// base: './' wajib karena hasil build dimuat Electron lewat file://, bukan
// dari HTTP root. Tanpa itu semua path /assets/... akan 404.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// CSP hanya disuntikkan pada hasil build. Saat dev, Vite menyuntikkan skrip
// inline untuk HMR yang akan diblokir oleh script-src 'self', sehingga dev
// sengaja dibiarkan tanpa meta CSP (jendela tetap terisolasi: contextIsolation
// aktif, nodeIntegration mati, sandbox aktif).
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' thumb: data: blob: https: http:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

function injectCspOnBuild() {
  return {
    name: 'softgame-inject-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html
        .replace(
          '<head>',
          `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
        )
        // crossorigin memicu permintaan CORS yang selalu gagal untuk file://,
        // sehingga modul React tidak pernah dieksekusi di Electron.
        .replace(/\s+crossorigin(?=[\s>])/g, '')
    },
  }
}

export default defineConfig({
  root: '.',
  base: './',
  plugins: [react(), injectCspOnBuild()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Electron memuat berkas lokal; sourcemap berguna saat menelusuri error.
    sourcemap: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})
