import { useState, useEffect, useCallback } from 'react';
import { usePlaidLink } from 'react-plaid-link';

/**
 * Manages the full Plaid connection + sync flow.
 *
 * @param {object} callbacks
 *   onReviewData({ groups, duplicateCount, cursor }) — called when sync returns data to review
 *   onError(message) — called on any error
 */
export function usePlaidSync({ onReviewData, onError }) {
  const [isConnected, setIsConnected] = useState(false);
  const [syncState, setSyncState] = useState('idle'); // 'idle' | 'linking' | 'syncing'
  const [linkToken, setLinkToken] = useState(null);

  // Check initial connection status
  useEffect(() => {
    fetch('/api/plaid/status')
      .then((r) => r.json())
      .then((d) => setIsConnected(!!d.connected))
      .catch(() => {});
  }, []);

  const handleSync = useCallback(async () => {
    setSyncState('syncing');
    try {
      const res = await fetch('/api/plaid/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync failed.');
      if (data.groups?.length > 0) {
        onReviewData({ groups: data.groups, duplicateCount: data.duplicateCount || 0, cursor: data.cursor });
      } else {
        onError(data.message || 'No new transactions found.');
      }
    } catch (err) {
      onError(err.message);
    } finally {
      setSyncState('idle');
    }
  }, [onReviewData, onError]);

  const handlePlaidSuccess = useCallback(async (publicToken) => {
    setSyncState('syncing');
    try {
      const res = await fetch('/api/plaid/exchange-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicToken }),
      });
      if (!res.ok) throw new Error('Failed to connect account.');
      setIsConnected(true);
      setLinkToken(null);
      await handleSync();
    } catch (err) {
      onError(err.message);
      setSyncState('idle');
    }
  }, [handleSync, onError]);

  const { open: openPlaidLink, ready: plaidReady } = usePlaidLink({
    token: linkToken,
    onSuccess: handlePlaidSuccess,
    onExit: () => { setSyncState('idle'); setLinkToken(null); },
  });

  // Open the Plaid widget as soon as the token is ready
  useEffect(() => {
    if (linkToken && plaidReady) openPlaidLink();
  }, [linkToken, plaidReady, openPlaidLink]);

  const handleSyncClick = useCallback(async () => {
    if (syncState !== 'idle') return;
    if (isConnected) {
      await handleSync();
    } else {
      setSyncState('linking');
      try {
        const res = await fetch('/api/plaid/link-token', { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to connect to bank.');
        setLinkToken(data.linkToken);
      } catch (err) {
        onError(err.message);
        setSyncState('idle');
      }
    }
  }, [syncState, isConnected, handleSync, onError]);

  return { isConnected, syncState, handleSyncClick };
}
