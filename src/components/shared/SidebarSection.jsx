import { useState } from 'react';

export default function SidebarSection({ label, children }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="sidebar-section">
      <button className="sidebar-section-hd" onClick={() => setOpen((v) => !v)}>
        <span className="sidebar-label">{label}</span>
        <span className="sidebar-chevron" aria-hidden>{open ? '▴' : '▾'}</span>
      </button>
      {open && children}
    </div>
  );
}
