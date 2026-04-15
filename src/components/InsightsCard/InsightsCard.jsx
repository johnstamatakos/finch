import { useState, useEffect, useRef } from 'react';
import './InsightsCard.css';

const TYPE_ICON = {
  warning:  '↑',
  positive: '↓',
  info:     '→',
};

function formatTs(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export default function InsightsCard({ statements }) {
  const [state, setState] = useState('idle'); // idle | loading | done | error
  const [insights, setInsights] = useState([]);
  const [generatedAt, setGeneratedAt] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const prevKeyRef = useRef(null);

  const stmtKey = statements.map((s) => s.id).sort().join(',');

  useEffect(() => {
    if (statements.length === 0) return;
    if (stmtKey === prevKeyRef.current && state === 'done') return;
    prevKeyRef.current = stmtKey;
    fetchInsights(false);
  }, [stmtKey]); // eslint-disable-line react-hooks/exhaustive-deps

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
    <div className="insights-card">
      <div className="insights-header">
        <span className="insights-title">
          <span className="insights-spark">✦</span>
          AI Insights
        </span>
        <div className="insights-header-right">
          {generatedAt && state === 'done' && (
            <span className="insights-ts">Updated {formatTs(generatedAt)}</span>
          )}
          <button
            className="insights-refresh"
            onClick={() => fetchInsights(true)}
            disabled={state === 'loading'}
            title="Regenerate insights"
          >
            {state === 'loading' ? '…' : '↺'}
          </button>
        </div>
      </div>

      <div className="insights-body">
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
          <ul className="insights-list">
            {insights.map((insight, i) => (
              <li key={i} className={`insights-item insights-item-${insight.type}`}>
                <span className="insights-icon">{TYPE_ICON[insight.type] ?? '→'}</span>
                <span className="insights-msg">{insight.message}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
