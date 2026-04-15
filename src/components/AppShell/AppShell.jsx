import './AppShell.css';

const NAV_ITEMS = [
  { key: 'dashboard',    label: 'Dashboard' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'statements',   label: 'Statements' },
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
    </div>
  );
}
