// LibraryBar.jsx
// Toolbar di atas grid: judul + jumlah hasil, filter kategori (khusus software),
// dan pilihan urutan.
export default function LibraryBar({ heading, count, def, sort, onSort, filterCat, categories, onFilterCat }) {
  return (
    <div className="toolbar">
      <h1 id="lib-title">
        {heading} <span id="lib-count">{count}</span>
      </h1>

      {/* Filter kategori hanya dibangun untuk katalog yang punya field kategori. */}
      {def.categoryField && (
        <label className="sort-wrap" id="filter-cat-wrap">
          <span>Kategori</span>
          <select id="filter-cat" value={filterCat} onChange={(e) => onFilterCat(e.target.value)}>
            <option value="">Semua kategori</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
      )}

      <label className="sort-wrap">
        <span>Urutkan</span>
        <select id="sort" value={sort} onChange={(e) => onSort(e.target.value)}>
          {def.sortOptions.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
