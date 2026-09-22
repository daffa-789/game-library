'use strict';

const { app, BrowserWindow, ipcMain, dialog, clipboard, shell, protocol, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const THUMB_SCHEME = 'glib';

// Folder data aplikasi: %APPDATA%/libray-game
app.setPath('userData', path.join(app.getPath('appData'), 'libray-game'));
const dataDir = app.getPath('userData');
const dataFile = path.join(dataDir, 'library.json');
const thumbsDir = path.join(dataDir, 'thumbnails');

let mainWindow = null;

function ensureDirs() {
  fs.mkdirSync(thumbsDir, { recursive: true });
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

function capsuleSvg(title, subtitle) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="460" height="215" viewBox="0 0 460 215">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#2a475e"/><stop offset="1" stop-color="#141d28"/>
  </linearGradient></defs>
  <rect width="460" height="215" fill="url(#g)"/>
  <circle cx="392" cy="28" r="110" fill="#66c0f4" opacity="0.07"/>
  <circle cx="60" cy="212" r="130" fill="#66c0f4" opacity="0.05"/>
  <rect x="26" y="26" width="54" height="54" rx="12" fill="#66c0f4" opacity="0.14"/>
  <rect x="38" y="47" width="30" height="8" rx="3" fill="#66c0f4" opacity="0.75"/>
  <rect x="49" y="36" width="8" height="30" rx="3" fill="#66c0f4" opacity="0.75"/>
  <circle cx="96" cy="42" r="4" fill="#66c0f4" opacity="0.6"/>
  <circle cx="106" cy="52" r="4" fill="#66c0f4" opacity="0.6"/>
  <circle cx="86" cy="52" r="4" fill="#66c0f4" opacity="0.6"/>
  <circle cx="96" cy="62" r="4" fill="#66c0f4" opacity="0.6"/>
  <text x="230" y="112" font-family="Segoe UI, Arial" font-size="34" font-weight="700" fill="#e5e5e5" text-anchor="middle">${title}</text>
  <text x="230" y="140" font-family="Segoe UI, Arial" font-size="13" fill="#8f98a0" text-anchor="middle">${subtitle}</text>
</svg>`;
}

function createSampleData() {
  const s1 = 'sample-gta.svg';
  const s2 = 'sample-elden.svg';
  const writeIfMissing = (name, svg) => {
    const p = path.join(thumbsDir, name);
    if (!fs.existsSync(p)) fs.writeFileSync(p, svg, 'utf8');
  };
  writeIfMissing(s1, capsuleSvg('GTA V', 'thumbnail contoh · ganti lewat tombol Edit'));
  writeIfMissing(s2, capsuleSvg('ELDEN RING', 'thumbnail contoh · ganti lewat tombol Edit'));

  const now = new Date().toISOString();
  return [
    {
      id: crypto.randomUUID(),
      title: 'Grand Theft Auto V (Contoh)',
      thumbnail: `${THUMB_SCHEME}://thumb/${s1}`,
      link: 'https://drive.google.com/file/d/1CONTOH-GANTI-DENGAN-LINK-DRIVE-ASLI/view',
      genre: 'Action, Open World',
      size: '90 GB',
      price: 'Rp 25.000',
      specs: {
        min: {
          os: 'Windows 10 64-bit',
          cpu: 'Intel Core i3-4150 | AMD FX-4300 or equivalent',
          ram: '4 GB RAM',
          gpu: 'NVIDIA GeForce GTX 950 / GTX 1050 with 2 GB VRAM | AMD Radeon R9 270 / R9 370 with 2 GB VRAM',
          dx: 'Version 9.0c',
          net: 'Broadband Internet connection',
          storage: '90 GB available space',
          sound: 'DirectX 9.0c compatible sound card',
          notes: 'Mouse and Keyboard supported',
        },
        rec: {
          os: 'Windows 10, Windows 11 64-bit',
          cpu: 'Intel Core i5-7500 | AMD Ryzen 5 1400 or equivalent',
          ram: '8 GB RAM',
          gpu: 'NVIDIA GeForce GTX 1060 with 3 GB VRAM or more | AMD Radeon RX 580 with 4 GB VRAM or more',
          dx: 'Version 9.0c',
          net: 'Broadband Internet connection',
          storage: '90 GB available space',
          sound: 'DirectX 9.0c compatible sound card',
          notes: '',
        },
      },
      createdAt: now,
      updatedAt: now,
    },
    {
      id: crypto.randomUUID(),
      title: 'ELDEN RING (Contoh)',
      thumbnail: `${THUMB_SCHEME}://thumb/${s2}`,
      link: 'https://drive.google.com/file/d/1CONTOH-GANTI-DENGAN-LINK-DRIVE-ASLI/view',
      genre: 'Action RPG',
      size: '60 GB',
      price: 'Rp 30.000',
      specs: {
        min: {
          os: 'Windows 10 64-bit',
          cpu: 'Intel Core i5-8400 | AMD Ryzen 3 3300X',
          ram: '12 GB RAM',
          gpu: 'NVIDIA GeForce GTX 1060 3GB | AMD Radeon RX 580 4GB',
          dx: 'Version 12',
          net: 'Broadband Internet connection',
          storage: '60 GB available space',
          sound: 'Windows Compatible Audio Device',
          notes: '',
        },
        rec: {
          os: 'Windows 10, Windows 11 64-bit',
          cpu: 'Intel Core i7-8700 | AMD Ryzen 5 3600X',
          ram: '16 GB RAM',
          gpu: 'NVIDIA GeForce GTX 1070 8GB | AMD Radeon RX VEGA 56 8GB',
          dx: 'Version 12',
          net: 'Broadband Internet connection',
          storage: '60 GB available space',
          sound: 'Windows Compatible Audio Device',
          notes: '',
        },
      },
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function sanitizeGames(games) {
  const str = (v, max) => String(v == null ? '' : v).slice(0, max);
  const spec = (s) => {
    const src = s && typeof s === 'object' ? s : {};
    const out = {};
    for (const k of ['os', 'cpu', 'ram', 'gpu', 'dx', 'net', 'storage', 'sound', 'notes']) {
      out[k] = str(src[k], 400);
    }
    return out;
  };
  return games.slice(0, 5000).map((g) => ({
    id: str(g && g.id, 64) || crypto.randomUUID(),
    title: str(g && g.title, 200),
    thumbnail: str(g && g.thumbnail, 2000),
    link: str(g && g.link, 2000),
    genre: str(g && g.genre, 120),
    size: str(g && g.size, 60),
    price: str(g && g.price, 60),
    steamAppId: str(g && g.steamAppId, 20),
    specs: {
      min: spec(g && g.specs && g.specs.min),
      rec: spec(g && g.specs && g.specs.rec),
    },
    createdAt: str(g && g.createdAt, 40),
    updatedAt: str(g && g.updatedAt, 40),
  }));
}

function loadLibrary() {
  ensureDirs();
  if (!fs.existsSync(dataFile)) {
    const games = createSampleData();
    saveLibraryData(games);
    return games;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    if (Array.isArray(parsed && parsed.games)) return sanitizeGames(parsed.games);
    return [];
  } catch (err) {
    // File rusak: simpan salinannya supaya bisa dipulihkan manual
    try {
      fs.renameSync(dataFile, `${dataFile}.rusak-${Date.now()}`);
    } catch (_) { /* ignore */ }
    return [];
  }
}

function saveLibraryData(games) {
  ensureDirs();
  const tmp = `${dataFile}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ games }, null, 2), 'utf8');
  fs.renameSync(tmp, dataFile);
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------

ipcMain.handle('data:load', () => loadLibrary());

ipcMain.handle('data:save', (e, games) => {
  if (!Array.isArray(games)) throw new Error('Format data tidak valid');
  saveLibraryData(sanitizeGames(games));
  return true;
});

ipcMain.handle('thumb:pickAndImport', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Pilih Gambar Thumbnail',
    filters: [{ name: 'Gambar', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp'] }],
    properties: ['openFile'],
  });
  if (res.canceled || !res.filePaths[0]) return null;
  const src = res.filePaths[0];
  const ext = (path.extname(src) || '.png').toLowerCase();
  const name = crypto.randomBytes(10).toString('hex') + ext;
  fs.copyFileSync(src, path.join(thumbsDir, name));
  return `${THUMB_SCHEME}://thumb/${name}`;
});

ipcMain.handle('thumb:delete', (e, ref) => {
  try {
    const last = String(ref || '').split('/').pop() || '';
    const name = path.basename(last);
    if (name && name !== '.' && name !== '..') {
      const p = path.join(thumbsDir, name);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  } catch (_) { /* best effort */ }
  return true;
});

ipcMain.handle('shell:openExternal', async (e, url) => {
  const u = String(url || '');
  if (!/^https?:\/\//i.test(u)) throw new Error('URL tidak valid');
  await shell.openExternal(u);
  return true;
});

ipcMain.handle('clipboard:write', (e, text) => {
  clipboard.writeText(String(text == null ? '' : text));
  return true;
});

// ---------------------------------------------------------------------------
// Impor data game dari link Steam Store (API publik Steam)
// ---------------------------------------------------------------------------

const STEAM_LABEL_MAP = {
  os: 'os', processor: 'cpu', memory: 'ram', graphics: 'gpu', directx: 'dx',
  storage: 'storage', network: 'net', 'sound card': 'sound', 'additional notes': 'notes',
};

function htmlToText(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseSteamRequirements(html) {
  const out = {};
  const re = /<li>\s*<strong>\s*([^:<>]+?)\s*:?\s*<\/strong>([\s\S]*?)<\/li>/gi;
  let m;
  while ((m = re.exec(html || '')) !== null) {
    const key = STEAM_LABEL_MAP[m[1].toLowerCase().trim()];
    if (key) out[key] = htmlToText(m[2]).slice(0, 400);
  }
  return out;
}

ipcMain.handle('steam:import', async (e, url) => {
  const m = String(url || '').match(/store\.steampowered\.com\/app\/(\d+)/i);
  if (!m) throw new Error('Link tidak dikenali. Gunakan link seperti https://store.steampowered.com/app/271590/');
  const appId = m[1];

  const res = await fetch(
    `https://store.steampowered.com/api/appdetails?appids=${appId}&l=english`,
    { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) GameLibrary/1.0' } },
  );
  if (!res.ok) throw new Error('Gagal menghubungi Steam Store (HTTP ' + res.status + ')');
  const body = await res.json();
  const entry = body && body[appId];
  if (!entry || !entry.success || !entry.data) {
    throw new Error('Data game tidak ditemukan di Steam. Cek lagi link-nya.');
  }
  const data = entry.data;

  const specs = {
    min: parseSteamRequirements(data.pc_requirements && data.pc_requirements.minimum),
    rec: parseSteamRequirements(data.pc_requirements && data.pc_requirements.recommended),
  };

  // Unduh gambar header Steam (460x215) dan simpan sebagai thumbnail lokal
  let thumbnail = '';
  try {
    const imgRes = await fetch(data.header_image, { headers: { 'User-Agent': 'Mozilla/5.0 GameLibrary/1.0' } });
    if (imgRes.ok) {
      const buf = Buffer.from(await imgRes.arrayBuffer());
      const ext = (path.extname(new URL(data.header_image).pathname) || '.jpg').toLowerCase();
      const name = `steam-${appId}-${crypto.randomBytes(4).toString('hex')}${ext}`;
      ensureDirs();
      fs.writeFileSync(path.join(thumbsDir, name), buf);
      thumbnail = `${THUMB_SCHEME}://thumb/${name}`;
    }
  } catch (_) { /* thumbnail opsional: biarkan kosong bila gagal */ }

  return {
    appId,
    title: data.name || '',
    thumbnail,
    genre: (data.genres || []).map((g) => g.description).join(', '),
    developer: (data.developers || []).join(', '),
    releaseDate: (data.release_date && data.release_date.date) || '',
    price: (data.price_overview && data.price_overview.final_formatted) || '',
    specs,
  };
});

// ---------------------------------------------------------------------------
// Protocol glib://thumb/<file> untuk menampilkan thumbnail lokal
// ---------------------------------------------------------------------------

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.bmp': 'image/bmp',
};

function registerThumbProtocol() {
  protocol.handle(THUMB_SCHEME, (request) => {
    try {
      const u = new URL(request.url);
      const name = path.basename(decodeURIComponent(u.pathname));
      const p = path.join(thumbsDir, name);
      if (!p.startsWith(thumbsDir + path.sep) || !fs.existsSync(p)) {
        return new Response(null, { status: 404 });
      }
      const mime = MIME[path.extname(name).toLowerCase()] || 'application/octet-stream';
      return new Response(fs.readFileSync(p), { headers: { 'content-type': mime } });
    } catch (_) {
      return new Response(null, { status: 404 });
    }
  });
}

// ---------------------------------------------------------------------------
// Icon aplikasi (hanya saat development, dipakai electron-builder saat build)
// ---------------------------------------------------------------------------

function pngToIco(png) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // count
  const entry = Buffer.alloc(16);
  entry[0] = 0; entry[1] = 0; // 256px -> 0
  entry[2] = 0; entry[3] = 0;
  entry.writeUInt16LE(1, 4);  // color planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(22, 12); // data offset
  return Buffer.concat([header, entry, png]);
}

async function generateIcon() {
  const iconPath = path.join(__dirname, 'assets', 'icon.ico');
  if (fs.existsSync(iconPath)) return;
  const win = new BrowserWindow({
    width: 256, height: 256, show: false, frame: false, transparent: true,
    webPreferences: { offscreen: true },
  });
  try {
    await win.loadFile(path.join(__dirname, 'assets', 'icon.html'));
    await new Promise((r) => setTimeout(r, 400));
    const image = win.webContents.capturePage();
    const png = (await image).toPNG();
    fs.writeFileSync(path.join(__dirname, 'assets', 'icon-256.png'), png);
    fs.writeFileSync(iconPath, pngToIco(png));
    console.log('[icon] icon.ico dibuat di', iconPath);
  } catch (err) {
    console.warn('[icon] gagal membuat icon:', err.message);
  } finally {
    win.destroy();
  }
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 880,
    minWidth: 980,
    minHeight: 620,
    backgroundColor: '#171a21',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  Menu.setApplicationMenu(null);

  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) e.preventDefault();
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (process.env.OPEN_DEVTOOLS) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  protocol.registerSchemesAsPrivileged([
    { scheme: THUMB_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ]);

  app.setAppUserModelId('com.daffa.libraygame');

  app.whenReady().then(async () => {
    ensureDirs();
    registerThumbProtocol();
    if (process.argv.includes('--make-icon')) {
      await generateIcon();
      app.exit(0);
      return;
    }
    if (!app.isPackaged) await generateIcon();
    createWindow();
  });

  app.on('window-all-closed', () => app.quit());
}
