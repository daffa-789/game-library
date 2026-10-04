// Toolbar.jsx
// Header atas: brand, tab katalog (Game / Software) dengan jumlah entri, kotak
// pencarian, dan dua tombol aksi (impor & tambah). Label tombol mengikuti
// deskriptor katalog yang sedang aktif.
import logo from '../logo.svg';
import { CATALOGS } from '../constants';
import { SearchIcon, SteamPlusIcon, AddIcon } from '../icons';

export default function Toolbar({
  tab,
  onTab,
  counts,
  query,
  placeholder,
  onQuery,
  addLabel,
  importLabel,
  onAdd,
  onImport,
  searchRef,
}) {
  return (
    <header id="topbar">
      <div className="brand">
        <img src={logo} alt="logo" draggable="false" />
        <div className="brand-text">SOFT<span>GAME</span></div>
      </div>

      <nav className="tabs" id="tabs" role="tablist" aria-label="Katalog">
        {Object.keys(CATALOGS).map((key) => {
          const on = tab === key;
          const n = counts[key];
          return (
            <button
              key={key}
              type="button"
              role="tab"
              data-tab={key}
              className={`tab${on ? ' active' : ''}`}
              aria-selected={on}
              onClick={() => onTab(key)}
            >
              {CATALOGS[key].nounCap} <span className="tab-count">{n ? n : ''}</span>
            </button>
          );
        })}
      </nav>

      <div className="searchbox">
        <SearchIcon />
        <input
          ref={searchRef}
          id="search"
          type="text"
          placeholder={placeholder}
          autoComplete="off"
          spellCheck="false"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
        />
      </div>

      <div className="topbar-actions">
        <button id="btn-import" className="btn steam" onClick={onImport}>
          <SteamPlusIcon />
          <span className="label">{importLabel}</span>
        </button>
        <button id="btn-add" className="btn green" onClick={onAdd}>
          <AddIcon />
          <span className="label">{addLabel}</span>
        </button>
      </div>
    </header>
  );
}
