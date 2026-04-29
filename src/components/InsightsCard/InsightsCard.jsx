import { useState, useEffect, useRef } from 'react';
import { formatCurrency, formatDate } from '../../utils/formatters.js';
import './InsightsCard.css';

const TYPE_ICON = {
  duplicate:  '⚠',
  suspicious: '⚑',
  saving:     '✂',
  warning:    '↑',
  positive:   '↓',
  info:       '→',
};

const GROUPS = [
  { label: 'Needs Attention', types: new Set(['duplicate', 'suspicious', 'warning']) },
  { label: 'Opportunities',   types: new Set(['saving']) },
  { label: 'Observations',    types: new Set(['positive', 'info']) },
];

function formatTs(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export default function InsightsCard({ statements }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState('idle'); // idle | loading | done | error
  const [insights, setInsights] = useState([]);
  const [generatedAt, setGeneratedAt] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const prevKeyRef = useRef(null);

  const stmtKey = statements.map((s) => s.id).sort().join(',');

  useEffect(() => {
    if (!open || statements.length === 0) return;
    if (stmtKey === prevKeyRef.current && state === 'done') return;
    prevKeyRef.current = stmtKey;
    fetchInsights(false);
  }, [open, stmtKey]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchInsights(force) {
    setState('loading');
    setErrorMsg('');
    try {
      const res = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statements, force }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate insights.');
      setInsights(data.insights || []);
      setGeneratedAt(data.generatedAt);
      setState('done');
    } catch (err) {
      setErrorMsg(err.message);
      setState('error');
    }
  }

  if (statements.length === 0) return null;

  return (
    <div className={`insights-card${open ? ' open' : ''}`}>
      <button
        className="insights-header"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="insights-title">
          <span className="insights-spark">✦</span>
          AI Insights
        </span>
        <div className="insights-header-right">
          {open && generatedAt && state === 'done' && (
            <span className="insights-ts">Updated {formatTs(generatedAt)}</span>
          )}
          {open && (
            <span
              className="insights-refresh"
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); fetchInsights(true); }}
              onKeyDown={(e) => e.key === 'Enter' && (e.stopPropagation(), fetchInsights(true))}
              title="Regenerate insights"
              aria-disabled={state === 'loading'}
            >
              {state === 'loading' ? '…' : '↺'}
            </span>
          )}
          <span className={`insights-chevron${open ? ' open' : ''}`}>▾</span>
        </div>
      </button>

      {open && (
        <div className="insights-body">
          {state === 'idle' && (
            <div className="insights-idle">
              <button className="insights-generate-btn" onClick={() => fetchInsights(false)}>
                Generate Insights
              </button>
            </div>
          )}

          {state === 'loading' && (
            <div className="insights-skeleton">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="insights-skel-row">
                  <div className="insights-skel-icon" />
                  <div className="insights-skel-line" style={{ width: `${60 + i * 7}%` }} />
                </div>
              ))}
            </div>
          )}

          {state === 'error' && (
            <div className="insights-error">
              <span>Could not generate insights — {errorMsg}</span>
              <button className="insights-retry" onClick={() => fetchInsights(false)}>Retry</button>
            </div>
          )}

          {state === 'done' && insights.length > 0 && (
            <div className="insights-groups">
              {GROUPS.map(({ label, types }) => {
                const items = insights.filter((ins) => types.has(ins.type));
                if (items.length === 0) return null;
                return (
                  <div key={label} className="insights-group">
                    <div className="insights-section-hd">{label}</div>
                    <ul className="insights-list">
                      {items.map((insight, i) => (
                        <li key={i} className={`insights-item insights-item-${insight.type}`}>
                          <span className="insights-icon">{TYPE_ICON[insight.type] ?? '→'}</span>
                          <div className="insights-item-body">
                            <span className="insights-msg">{insight.message}</span>
                            {insight.transactions?.length > 0 && (
                              <ul className="insights-tx-list">
                                {insight.transactions.map((tx) => (
                                  <li key={tx.id} className="insights-tx-row">
                                    <span className="itx-date">{formatDate(tx.date)}</span>
                                    <span className="itx-desc">{tx.description}</span>
                                    <span className="itx-amt">−{formatCurrency(tx.amount)}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
