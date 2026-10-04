// Grid.jsx
// Grid katalog. Tiap kartu memakai key={item.id} agar React memakai kembali
// node yang sama (keyed reconciliation), bukan membangun ulang seluruh grid.
import Card from './Card';

export default function Grid({ items, def, selectedId, onSelect, onCopy, onDelete }) {
  return (
    <div id="grid" className="grid">
      {items.map((item) => (
        <Card
          key={item.id}
          item={item}
          sub={def.cardSub(item)}
          selected={item.id === selectedId}
          onSelect={onSelect}
          onCopy={onCopy}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
