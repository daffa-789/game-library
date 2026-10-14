// constants.js
// Deskriptor katalog (satu-satunya tempat perbedaan Game vs Software) plus
// konstanta tampilan yang dipakai bersama oleh komponen React.
//
// Catatan port: bagian load/save/applyPrefill/extraFields dari app.js lama yang
// menyentuh DOM dipindahkan ke komponen. Di sini hanya disimpan data murni dan
// fungsi tanpa efek samping.

const txt = (v) => (v == null ? '' : String(v));

export { txt };

// Spesifikasi sistem hanya ada di katalog game. Entri software disimpan tanpa
// spesifikasi apa pun: yang ditanyakan pembeli adalah versi, lisensi, platform,
// ukuran, dan harganya.
export const SPEC_FIELDS = [
  ['os', 'OS'],
  ['cpu', 'Processor'],
  ['ram', 'Memory (RAM)'],
  ['gpu', 'Graphics (GPU)'],
  ['dx', 'DirectX'],
  ['net', 'Network'],
  ['storage', 'Storage'],
  ['sound', 'Sound Card'],
  ['notes', 'Additional Notes'],
];

export const SPEC_PLACEHOLDER = {
  os: 'mis. Windows 10 64-bit',
  cpu: 'mis. Intel Core i5-7500 | AMD Ryzen 5 1400',
  ram: 'mis. 8 GB RAM',
  gpu: 'mis. NVIDIA GTX 1060 3GB | AMD RX 580 4GB',
  dx: 'mis. Version 9.0c',
  net: 'mis. Broadband Internet connection',
  storage: 'mis. 90 GB available space',
  sound: 'mis. DirectX compatible sound card',
  notes: 'opsional — catatan tambahan',
};

export const PLACEHOLDER_IMG = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 460 215">' +
  '<rect width="460" height="215" fill="#1c2a3a"/>' +
  '<text x="230" y="103" font-family="Segoe UI,Arial" font-size="19" fill="#55677a" text-anchor="middle">Tidak ada gambar</text>' +
  '<text x="230" y="127" font-family="Segoe UI,Arial" font-size="12" fill="#3d4d5e" text-anchor="middle">Tambahkan thumbnail lewat tombol Edit</text>' +
  '</svg>'
);

// Hanya referensi gambar yang benar-benar tersimpan di folder aplikasi yang
// boleh dihapus atau diekspor: URL luar dan placeholder bukan file kita.
export function isStoredThumb(ref) {
  return !!ref && (ref.startsWith('/thumbnails/') || ref.startsWith('glib://') || ref.startsWith('slib://'));
}

/* ==========================================================================
   Link unduhan (mirror)
   ========================================================================== */

// MAX_LINKS batas jumlah mirror per entri. Samakan dengan maxLinks di
// electron/lib/links.js supaya UI tidak membolehkan lebih dari yang disimpan.
export const MAX_LINKS = 20;

// withScheme menambahkan https:// bila URL ditempel tanpa skema.
export function withScheme(value) {
  const s = txt(value).trim();
  if (!s) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return s;
  return 'https://' + s;
}

// isValidLinkURL true hanya untuk http/https yang punya hostname. Skema lain
// (javascript:, file:, dst) selalu ditolak.
export function isValidLinkURL(value) {
  const s = withScheme(value);
  if (!s) return false;
  try {
    const u = new URL(s);
    return (u.protocol === 'http:' || u.protocol === 'https:') && !!u.hostname;
  } catch (err) {
    return false;
  }
}

// linksOf mengubah referensi apa pun menjadi daftar mirror { label, url }.
// Mendukung bentuk baru (item.links) maupun field `link` tunggal versi lama,
// jadi data lama tetap tampil walau belum pernah dibuka di versi ini.
export function linksOf(item) {
  const raw = (item && Array.isArray(item.links) && item.links.length)
    ? item.links
    : (item && item.link ? [{ url: item.link }] : []);

  const out = [];
  for (const entry of raw) {
    if (out.length >= MAX_LINKS) break;
    const isObj = entry && typeof entry === 'object';
    const url = withScheme(isObj ? entry.url : entry);
    if (!isValidLinkURL(url)) continue;
    out.push({ label: isObj ? txt(entry.label).trim() : '', url });
  }
  return out;
}

// cleanLinks merapikan baris editor sebelum disimpan: hanya URL valid, label
// dirapikan, duplikat dibuang, dan jumlah dibatasi MAX_LINKS.
export function cleanLinks(list) {
  const out = [];
  const seen = new Set();
  for (const entry of Array.isArray(list) ? list : []) {
    if (out.length >= MAX_LINKS) break;
    const url = withScheme(entry && entry.url);
    if (!isValidLinkURL(url)) continue;
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label: txt(entry && entry.label).trim(), url });
  }
  return out;
}

// linkText menggabungkan semua mirror jadi satu teks: dipakai pencarian dan
// tombol "Copy Semua Link".
export function linkText(item) {
  return linksOf(item).map((l) => l.url).join('\n');
}

// linkSearchText versi untuk pencarian: label ikut dicari.
export function linkSearchText(item) {
  return linksOf(item).map((l) => `${l.label} ${l.url}`).join(' ');
}

// Baris field form diratakan jadi daftar field (dipakai untuk baca/tulis nilai).
export function formFields(def) {
  return def.formRows.flat();
}

/* ==========================================================================
   Deskriptor katalog
   ========================================================================== */

export const CATALOGS = {
  game: {
    key: 'game',
    noun: 'game',
    nounCap: 'Game',
    heading: 'Semua Game',
    searchPlaceholder: 'Cari judul game...  (Ctrl+F)',
    addLabel: 'Tambah Game',
    emptySub: 'Tambahkan game pertama Anda beserta link download dan spesifikasinya.',
    emptyAddLabel: '+ Tambah Game Pertama',
    formRows: [
      [
        { k: 'title', l: 'Judul Game *', p: 'mis. Grand Theft Auto V', req: true },
      ],
      [
        { k: 'genre', l: 'Genre', p: 'mis. Action, RPG' },
        { k: 'price', l: 'Harga', p: 'mis. Rp 25.000' },
      ],
    ],
    hasSpecs: true,
    linkLabel: 'LINK DOWNLOAD (MIRROR)',
    linkTitle: 'Link Download',
    linksHint: 'Satu baris untuk tiap layanan penyimpanan (Gofile, PixelDrain, Google Drive, MEGA, ...). Label dikenali otomatis dari URL.',
    linkLabelPlaceholder: 'Layanan (mis. Gofile)',
    linkUrlPlaceholder: 'https://gofile.io/d/xxxxxxxx',
    categoryField: null,
    sortOptions: [['new', 'Terbaru'], ['az', 'Judul A–Z'], ['za', 'Judul Z–A']],
    // Pencarian mencakup judul, genre, dan semua link mirror.
    haystack: (g) => [g.title, g.genre, linkSearchText(g)],
    cardSub: (g) => [g.genre, g.size].filter(Boolean).join(' · '),
    chips: (g) => [
      g.genre ? ['chip', g.genre] : null,
      g.size ? ['chip', `Ukuran: ${g.size}`] : null,
      g.price ? ['chip accent', g.price] : null,
    ].filter(Boolean),
    detailPanel: (g) => {
      const min = g.specs && g.specs.min ? g.specs.min : null;
      const rec = g.specs && g.specs.rec ? g.specs.rec : null;
      const filled = SPEC_FIELDS.some(([k]) => (min && min[k]) || (rec && rec[k]));
      if (!filled) {
        return {
          title: 'System Requirements',
          empty: 'Spesifikasi sistem belum diisi untuk game ini. Klik Edit untuk menambahkan.',
        };
      }
      return {
        title: 'System Requirements',
        fields: SPEC_FIELDS,
        columns: [['MINIMUM:', min], ['RECOMMENDED:', rec]],
      };
    },
    websiteField: null,
    prefillFields: ['title', 'genre', 'price'],
    prefillOnlyWhenEmpty: false,
    // steamAppId hanya dikomit saat simpan (pendingSteamAppId dari impor).
    extraFields: (pendingSteamAppId, old) => ({ steamAppId: pendingSteamAppId || txt(old && old.steamAppId) }),
    import: {
      kind: 'steam',
      button: 'Steam Link',
      title: 'Impor dari Steam',
      label: 'Link halaman Steam Store',
      placeholder: 'https://store.steampowered.com/app/271590/',
      fetchLabel: 'Ambil Data Steam',
      needUrl: 'Masukkan link Steam Store terlebih dahulu.',
      okToast: 'Data terisi otomatis — tinggal isi link download',
      failToast: 'Gagal mengambil data dari Steam.',
    },
  },

  software: {
    key: 'software',
    noun: 'software',
    nounCap: 'Software',
    heading: 'Semua Software',
    searchPlaceholder: 'Cari nama software, kategori, versi...  (Ctrl+F)',
    addLabel: 'Tambah Software',
    emptySub: 'Tambahkan software pertama Anda beserta link download-nya — tanpa spesifikasi.',
    emptyAddLabel: '+ Tambah Software Pertama',
    formRows: [
      [
        { k: 'title', l: 'Nama Software *', p: 'mis. Adobe Photoshop 2025', req: true },
      ],
      [
        { k: 'website', l: 'Situs Resmi', p: 'https://www.adobe.com/products/photoshop.html' },
      ],
      [
        { k: 'category', l: 'Kategori', p: 'mis. Desain Grafis' },
        { k: 'version', l: 'Versi', p: 'mis. 26.1 atau LTSC 2021' },
      ],
      [
        { k: 'license', l: 'Lisensi', p: 'mis. Trial, Full, Portable, Gratis' },
        { k: 'platform', l: 'Platform', p: 'mis. Windows 10/11' },
      ],
      [
        { k: 'size', l: 'Ukuran File', p: 'mis. 4 GB' },
        { k: 'price', l: 'Harga', p: 'mis. Rp 75.000' },
      ],
    ],
    hasSpecs: false,
    linkLabel: 'LINK DOWNLOAD (MIRROR)',
    linkTitle: 'Link Download',
    linksHint: 'Satu baris untuk tiap layanan penyimpanan (Gofile, PixelDrain, Google Drive, MEGA, ...). Label dikenali otomatis dari URL.',
    linkLabelPlaceholder: 'Layanan (mis. Gofile)',
    linkUrlPlaceholder: 'https://pixeldrain.com/u/xxxxxxxx',
    categoryField: 'category',
    sortOptions: [['new', 'Terbaru'], ['az', 'Nama A–Z'], ['za', 'Nama Z–A'], ['cat', 'Kategori']],
    // Pencarian mencakup judul, metadata software, dan semua link mirror.
    haystack: (s) => [s.title, s.category, s.version, s.license, s.platform, s.website, linkSearchText(s)],
    cardSub: (s) => [s.category, s.version, s.size].filter(Boolean).join(' · '),
    chips: (s) => [
      s.category ? ['chip', s.category] : null,
      s.version ? ['chip', `Versi ${s.version}`] : null,
      s.license ? ['chip', s.license] : null,
      s.platform ? ['chip', s.platform] : null,
      s.size ? ['chip', `Ukuran: ${s.size}`] : null,
      s.price ? ['chip accent', s.price] : null,
    ].filter(Boolean),
    detailPanel: (s) => ({
      title: 'Informasi Software',
      rows: [
        ['Kategori', s.category],
        ['Versi', s.version],
        ['Lisensi', s.license],
        ['Platform', s.platform],
        ['Ukuran File', s.size],
      ].filter(([, v]) => v && String(v).trim()),
    }),
    websiteField: 'website',
    prefillFields: ['title', 'category', 'version', 'license', 'platform', 'website'],
    prefillOnlyWhenEmpty: true,
    extraFields: () => ({}),
    import: {
      kind: 'website',
      button: 'Impor dari Situs',
      title: 'Impor dari Situs Resmi',
      label: 'Link halaman resmi software',
      placeholder: 'https://www.example.com/product',
      fetchLabel: 'Ambil Data',
      needUrl: 'Masukkan link halaman software terlebih dahulu.',
      okToast: 'Data terisi otomatis — tinggal isi link download',
      failToast: 'Gagal mengambil data dari situs.',
    },
  },
};
