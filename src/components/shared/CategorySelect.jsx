import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './CategorySelect.css';

export default function CategorySelect({ value, categories, onChange, onCreateCategory }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0, above: false });
  const triggerRef = useRef(null);
  const dropRef = useRef(null);
  const searchRef = useRef(null);

  const filtered = categories.filter((c) =>
    c.toLowerCase().includes(search.toLowerCase())
  );
  const exactMatch = categories.some(
    (c) => c.toLowerCase() === search.trim().toLowerCase()
  );
  const canCreate = search.trim().length > 0 && !exactMatch;

  const openDrop = () => {
    const rect = triggerRef.current.getBoundingClientRect();
    const dropW = Math.max(rect.width, 220);
    const dropH = Math.min(300, filtered.length * 36 + 80);
    const spaceBelow = window.innerHeight - rect.bottom;
    const above = spaceBelow < dropH + 8 && rect.top > dropH + 8;
    // Keep within viewport horizontally
    const left = Math.min(rect.left, window.innerWidth - dropW - 8);

    setPos({
      top: above ? rect.top - dropH - 4 : rect.bottom + 4,
      left,
      width: dropW,
      above,
    });
    setOpen(true);
    setSearch('');
  };

  useEffect(() => {
    if (!open) return;
    // Focus search box
    const t = setTimeout(() => searchRef.current?.focus(), 0);
    // Close on outside click
    const onMouseDown = (e) => {
      if (
        !triggerRef.current?.contains(e.target) &&
        !dropRef.current?.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    // Close on scroll anywhere
    const onScroll = () => setOpen(false);
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  const select = (cat) => {
    onChange(cat);
    setOpen(false);
  };

  const handleCreate = () => {
    const name = search.trim();
    if (!name) return;
    const created = onCreateCategory(name);
    onChange(created || name);
    setOpen(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (e.key === 'Enter') {
      if (filtered.length === 1) select(filtered[0]);
      else if (canCreate) handleCreate();
    }
    if (e.key === 'ArrowDown') {
      // Move focus to first option
      dropRef.current?.querySelector('.cat-opt')?.focus();
      e.preventDefault();
    }
  };

  return (
    <div className="cat-sel" ref={triggerRef}>
      <button
        className="cat-trigger"
        type="button"
        onClick={openDrop}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="cat-trigger-label">{value}</span>
        <span className="cat-chevron" aria-hidden>▾</span>
      </button>

      {open && createPortal(
        <div
          ref={dropRef}
          className={`cat-drop ${pos.above ? 'above' : ''}`}
          role="listbox"
          style={{ top: pos.top, left: pos.left, width: pos.width }}
        >
          <div className="cat-search-wrap">
            <span className="cat-search-icon">⌕</span>
            <input
              ref={searchRef}
              className="cat-search-input"
              type="text"
              placeholder="Search categories..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              aria-label="Search categories"
            />
            {search && (
              <button
                className="cat-search-clear"
                onMouseDown={(e) => { e.preventDefault(); setSearch(''); }}
                type="button"
                tabIndex={-1}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>

          <div className="cat-list" role="group" onWheel={(e) => e.stopPropagation()}>
            {filtered.map((c) => (
              <button
                key={c}
                className={`cat-opt${c === value ? ' cat-opt-active' : ''}`}
                role="option"
                aria-selected={c === value}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); select(c); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(c); }
                  if (e.key === 'Escape') setOpen(false);
                }}
              >
                {c === value && <span className="cat-check" aria-hidden>✓</span>}
                <span className="cat-opt-label">{highlight(c, search)}</span>
              </button>
            ))}

            {filtered.length === 0 && !canCreate && (
              <div className="cat-empty">No categories match</div>
            )}
          </div>

          {/* Always-visible create footer — active when typing a new name, hint when idle */}
          <div className="cat-create-wrap">
            {canCreate ? (
              <button
                className="cat-create-btn"
                type="button"
                onMouseDown={(e) => { e.preventDefault(); handleCreate(); }}
              >
                <span className="cat-create-plus">+</span>
                Create <strong>"{search.trim()}"</strong>
              </button>
            ) : !exactMatch && (
              <button
                className="cat-create-btn cat-create-hint"
                type="button"
                onMouseDown={(e) => { e.preventDefault(); searchRef.current?.focus(); }}
              >
                <span className="cat-create-plus">+</span>
                New category…
              </button>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

/** Wraps the matched substring in a <mark> */
function highlight(text, query) {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark>{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}
