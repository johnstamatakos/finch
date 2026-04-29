import { Router } from 'express';
import { CountryCode, Products } from 'plaid';
import { plaidClient } from '../plaid/plaidClient.js';
import { getPlaidConfig, savePlaidConfig, hasPlaidConfig } from '../utils/plaidStore.js';
import { processTransactions } from '../utils/processTransactions.js';
import { deduplicateTransactions, listStatements } from '../utils/statementStore.js';
import { asyncHandler } from '../utils/requestHelpers.js';
import { MONTH_NAMES } from '../utils/deriveStatementMeta.js';

const router = Router();

router.post('/plaid/link-token', asyncHandler(async (_req, res) => {
  let response;
  try {
    response = await plaidClient.linkTokenCreate({
      user: { client_user_id: 'finch-user' },
      client_name: 'Finch',
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: 'en',
    });
  } catch (err) {
    console.error('[Plaid] link-token failed:', err.response?.data || err.message);
    const e = new Error('Failed to create link token.');
    e.status = 500;
    throw e;
  }
  return res.json({ linkToken: response.data.link_token });
}));

router.post('/plaid/exchange-token', asyncHandler(async (req, res) => {
  const { publicToken } = req.body;
  if (!publicToken) return res.status(400).json({ error: 'publicToken is required.' });
  let response;
  try {
    response = await plaidClient.itemPublicTokenExchange({ public_token: publicToken });
  } catch (err) {
    console.error('[Plaid] exchange-token failed:', err.response?.data || err.message);
    const e = new Error('Failed to connect bank account.');
    e.status = 500;
    throw e;
  }
  await savePlaidConfig({ accessToken: response.data.access_token, cursor: undefined });
  return res.json({ ok: true });
}));

router.post('/plaid/sync', asyncHandler(async (_req, res) => {
  const config = await getPlaidConfig();
  if (!config.accessToken) {
    return res.status(400).json({ error: 'No bank account connected. Please link your account first.' });
  }

  let cursor = config.cursor;
  let added = [];
  let hasMore = true;

  try {
    while (hasMore) {
      const params = { access_token: config.accessToken };
      if (cursor) params.cursor = cursor;

      const response = await plaidClient.transactionsSync(params);
      const { data } = response;

      added = added.concat(data.added);
      cursor = data.next_cursor;
      hasMore = data.has_more;
    }
  } catch (err) {
    console.error('[Plaid] sync failed:', err.response?.data || err.message);
    const e = new Error('Sync failed. Please try again.');
    e.status = 500;
    throw e;
  }

  if (added.length === 0) {
    await savePlaidConfig({ cursor });
    return res.json({ groups: [], duplicateCount: 0, message: 'No new transactions.' });
  }

  const rawTransactions = added.map((t) => ({
    source: t.merchant_name || t.name || 'Unknown',
    amount: -(t.amount),
    date: t.date,
    activity: t.payment_channel || '',
  }));

  const withRules = await processTransactions(rawTransactions);

  const { unique, duplicateCount } = await deduplicateTransactions(withRules);

  if (unique.length === 0) {
    return res.json({ groups: [], duplicateCount, message: 'All synced transactions already exist.' });
  }

  const byMonth = {};
  for (const t of unique) {
    const ym = t.date ? t.date.slice(0, 7) : 'unknown';
    if (!byMonth[ym]) byMonth[ym] = [];
    byMonth[ym].push(t);
  }

  const savedStatements = await listStatements();
  const statementByPeriod = new Map(
    savedStatements
      .filter((s) => s.period)
      .map((s) => [`${s.period.year}-${String(s.period.month).padStart(2, '0')}`, s.id])
  );

  const currentYM = new Date().toISOString().slice(0, 7);

  const groups = Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .filter(([ym]) => ym === currentYM || !statementByPeriod.has(ym))
    .map(([ym, transactions]) => {
      const [year, month] = ym.split('-');
      const name = `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;
      const existingStatementId = statementByPeriod.get(ym) || null;
      return { ym, name, transactions, existingStatementId };
    });

  return res.json({ groups, duplicateCount, cursor });
}));

router.post('/plaid/advance-cursor', asyncHandler(async (req, res) => {
  const { cursor } = req.body;
  if (!cursor) return res.status(400).json({ error: 'cursor is required.' });
  await savePlaidConfig({ cursor });
  return res.json({ ok: true });
}));

router.get('/plaid/status', asyncHandler(async (_req, res) => {
  const connected = await hasPlaidConfig();
  return res.json({ connected });
}));

export default router;
