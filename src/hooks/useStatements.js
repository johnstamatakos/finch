import { useState, useEffect, useMemo } from 'react';

export function useStatements() {
  const [savedStatements, setSavedStatements] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { refresh(); }, []);

  const refresh = () =>
    fetch('/api/statements')
      .then((r) => r.json())
      .then((data) => setSavedStatements(Array.isArray(data) ? data : []))
      .catch(() => {});

  const sortedStatements = useMemo(() =>
    [...savedStatements].sort((a, b) => {
      const aKey = (a.period?.year ?? 0) * 12 + (a.period?.month ?? 0);
      const bKey = (b.period?.year ?? 0) * 12 + (b.period?.month ?? 0);
      return bKey - aKey;
    }),
    [savedStatements]
  );

  const renameStatement = async (id, newName) => {
    const res = await fetch(`/api/statements/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    });
    if (res.ok) await refresh();
  };

  const deleteStatement = async (id, onDeleted) => {
    if (!window.confirm('Delete this statement? This cannot be undone.')) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/statements/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || 'Delete failed.');
      onDeleted?.(id);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Save one or more month groups from the review modal.
  // groups = [{ name, transactions, existingStatementId? }]
  // cursor = Plaid cursor to advance after all groups are saved (optional)
  const saveGroups = async (groups, cursor) => {
    setIsLoading(true);
    setError(null);
    let savedCount = 0, skippedCount = 0, totalDupes = 0;
    try {
      for (const group of groups) {
        if (group.existingStatementId) {
          const res = await fetch(`/api/statements/${group.existingStatementId}/append`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transactions: group.transactions }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Append failed.');
          savedCount++;
          totalDupes += group.transactions.length - (data.appendedCount || 0);
        } else {
          const res = await fetch('/api/statements', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: group.name, monthlyIncome: 0, transactions: group.transactions }),
          });
          const data = await res.json();
          if (res.status === 409) {
            skippedCount++;
          } else if (!res.ok) {
            throw new Error(data.error || 'Save failed.');
          } else {
            savedCount++;
            totalDupes += data.duplicateCount || 0;
          }
        }
      }

      if (cursor) {
        await fetch('/api/plaid/advance-cursor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cursor }),
        });
      }

      await refresh();

      if (skippedCount > 0 || totalDupes > 0) {
        let msg = savedCount > 0 ? `Saved ${savedCount} statement${savedCount !== 1 ? 's' : ''}.` : '';
        if (skippedCount > 0) msg += ` ${skippedCount} month${skippedCount !== 1 ? 's' : ''} already existed and were skipped.`;
        if (totalDupes > 0) msg += ` ${totalDupes} duplicate transaction${totalDupes !== 1 ? 's' : ''} skipped.`;
        setError(msg.trim());
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    savedStatements,
    sortedStatements,
    refresh,
    renameStatement,
    deleteStatement,
    saveGroups,
    isLoading,
    error,
    clearError: () => setError(null),
  };
}
