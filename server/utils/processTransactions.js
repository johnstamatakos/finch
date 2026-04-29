import { analyzeTransactions } from '../ai/transactionAnalyzer.js';
import { normalizeTransactions } from './normalizeTransactions.js';
import { applyRules } from './rulesStore.js';
import { getCategories } from './categoriesStore.js';

/**
 * Shared pipeline: AI categorize → normalize → apply rules.
 * Used by both the CSV upload route and the Plaid sync route.
 *
 * @param {Array} rawTransactions - Pre-shaped objects: { source, amount, date, activity? }
 * @returns {Array} Normalized, categorized, rule-applied transactions (not yet deduplicated)
 */
export async function processTransactions(rawTransactions) {
  const customCategories = await getCategories();
  const analyzed   = await analyzeTransactions(rawTransactions, customCategories);
  const normalized = normalizeTransactions(analyzed);
  return applyRules(normalized);
}
