// Jalankan mode pengembangan: Vite dev server + Electron, satu perintah.
//
// Tanpa dependensi tambahan (tidak pakai concurrently/wait-on): server Vite
// dibuat lewat API-nya, lalu Electron dijalankan sebagai proses anak dengan
// VITE_DEV_SERVER_URL supaya jendela memuat dari server itu.
import { createServer } from 'vite'
import { spawn } from 'node:child_process'
import electronPath from 'electron'

const server = await createServer()
await server.listen()

const url = server.resolvedUrls?.local?.[0]
if (!url) {
  console.error('Gagal mendapatkan URL dev server Vite.')
  await server.close()
  process.exit(1)
}

console.log(`\n  SoftGame Library (dev) -> ${url}\n`)

// ELECTRON_RUN_AS_NODE membuat Electron berjalan sebagai Node biasa, sehingga
// require('electron') mengembalikan undefined dan jendela tidak pernah muncul.
// Variabel ini kadang disetel oleh shell/IDE; buang dari lingkungan anak.
const childEnv = { ...process.env, VITE_DEV_SERVER_URL: url }
delete childEnv.ELECTRON_RUN_AS_NODE

// Argumen tambahan diteruskan apa adanya ke Electron, mis.
//   bun run dev -- --no-sandbox --in-process-gpu
// Berguna di lingkungan terbatas (VM/remote desktop) yang tidak bisa
// menjalankan proses GPU/sandbox Chromium.
const extraArgs = process.argv.slice(2)

const child = spawn(electronPath, ['.', ...extraArgs], {
  stdio: 'inherit',
  env: childEnv,
})

child.on('close', async (code) => {
  await server.close()
  process.exit(code ?? 0)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    child.kill()
  })
}
