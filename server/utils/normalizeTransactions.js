import { randomUUID, createHash } from 'crypto';
import { normalizeMerchantKey } from './rulesStore.js';

function fingerprint(date, description, amount) {
  const key = `${date}|${normalizeMerchantKey(description)}|${amount}`;
  return createHash('sha256').update(key).digest('hex').slice(0, 16);
}

const VALID_CATEGORIES = [
  'Auto', 'Home', 'Utilities', 'Credit Cards', 'Student Loans',
  'Subscriptions', 'Shopping', 'Groceries', 'Restaurants', 'Other', 'Transfers',
];

export function normalizeTransactions(transactions) {
  return transactions.map((t) => {
    const amount = parseFloat(t.amount) || 0;
    const isDeposit = amount > 0;

    let category = t.category || 'Other';
    if (!VALID_CATEGORIES.includes(category) || isDeposit) {
      category = 'Other';
    }

    const description = String(t.source || t.description || '').trim();
    const date = t.date || '';
    const normalizedAmount = parseFloat(amount.toFixed(2));

    return {
      id: randomUUID(),
      fingerprint: fingerprint(date, description, normalizedAmount),
      date,
      description,
      activity: String(t.activity || '').trim(),
      amount: normalizedAmount,
      category,
      isRecurring: Boolean(t.isRecurring),
      isDeposit,
    };
  }).filter((t) => t.description.length > 0 || t.amount !== 0);
}
