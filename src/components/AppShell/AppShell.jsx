import './AppShell.css';

const NAV_ITEMS = [
  { key: 'dashboard',    label: 'Dashboard',     icon: '▤' },
  { key: 'transactions', label: 'Transactions',   icon: '↕' },
  { key: 'statements',   label: 'Statements',     icon: '≡' },
  { key: 'rules',        label: 'Rules',          icon: '⚙' },
];

export default function AppShell({ page, onPageChange, onUpload, sidebar, children }) {
  return (
    <div className="shell">
      <header className="shell-header">
        <div className="shell-logo">
          <img src="/logo.png" alt="Finch" className="shell-logo-img" />
        </div>

        <nav className="shell-nav" aria-label="Main navigation">
          {NAV_ITEMS.map(({ key, label }) => (
            <button
              key={key}
              className={`shell-tab${page === key ? ' shell-tab-active' : ''}`}
              onClick={() => onPageChange(key)}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="shell-actions">
          <button className="shell-upload-btn" onClick={onUpload}>
            + Upload
          </button>
        </div>
      </header>

      <div className="shell-body">
        {sidebar && <aside className="shell-sidebar">{sidebar}</aside>}
        <main className="shell-main">{children}</main>
      </div>

      {/* Bottom nav — mobile only */}
      <nav className="shell-bottom-nav" aria-label="Main navigation">
        {NAV_ITEMS.map(({ key, label, icon }) => (
          <button
            key={key}
            className={`shell-bottom-tab${page === key ? ' active' : ''}`}
            onClick={() => onPageChange(key)}
          >
            <span className="shell-bottom-icon" aria-hidden>{icon}</span>
            <span className="shell-bottom-label">{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
