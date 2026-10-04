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

const child = spawn(electronPath, ['.'], {
  stdio: 'inherit',
  env: { ...process.env, VITE_DEV_SERVER_URL: url },
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
