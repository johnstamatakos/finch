import { Router } from 'express';
import {
  getRules, setRule, deleteRule,
  normalizeMerchantKey, buildCollapsedKeys, findBestRuleKey,
} from '../utils/rulesStore.js';
import { listStatements, getStatement } from '../utils/statementStore.js';
import { refineRules } from '../ai/rulesRefiner.js';
import { asyncHandler } from '../utils/requestHelpers.js';

const router = Router();

// Must be registered before /:key to avoid shadowing
router.post('/rules/refine', asyncHandler(async (_req, res) => {
  const rules = await getRules();
  return res.json(await refineRules(rules));
}));

router.post('/rules/test', asyncHandler(async (req, res) => {
  const { description } = req.body;
  if (typeof description !== 'string') return res.status(400).json({ error: 'description required.' });
  const rules = await getRules();
  const ruleKeys = Object.keys(rules);
  const norm = normalizeMerchantKey(description);
  const bestKey = findBestRuleKey(norm, ruleKeys, buildCollapsedKeys(ruleKeys));

  if (bestKey) {
    const rule = rules[bestKey];
    return res.json({ matched: true, key: bestKey, category: rule.category, isRecurring: rule.isRecurring, normalizedInput: norm });
  }
  return res.json({ matched: false, normalizedInput: norm });
}));

router.get('/rules/suggestions', asyncHandler(async (_req, res) => {
  const [allStatements, rules] = await Promise.all([listStatements(), getRules()]);
  const ruleKeys = Object.keys(rules);
  const collapsedRuleKeys = buildCollapsedKeys(ruleKeys);

  const freq = new Map(); // normKey → { count, lastSeen, exampleDescription }
  await Promise.all(allStatements.map(async (meta) => {
    const stmt = await getStatement(meta.id);
    if (!stmt) return;
    for (const tx of (stmt.transactions || [])) {
      if (tx.isDeposit || tx.ruleApplied) continue;
      const norm = normalizeMerchantKey(tx.description);
      if (!norm) continue;
      const e = freq.get(norm) || { count: 0, lastSeen: '', exampleDescription: tx.description };
      e.count += 1;
      if (tx.date > e.lastSeen) { e.lastSeen = tx.date; e.exampleDescription = tx.description; }
      freq.set(norm, e);
    }
  }));

  const suggestions = Array.from(freq.entries())
    .filter(([normKey, e]) => e.count >= 2 && !findBestRuleKey(normKey, ruleKeys, collapsedRuleKeys))
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 20)
    .map(([normalizedKey, e]) => {
      const redundantKeys = ruleKeys.filter((r) =>
        r === normalizedKey ||
        (r.startsWith(normalizedKey) && (r[normalizedKey.length] === ' ' || r[normalizedKey.length] === '*'))
      );
      return {
        normalizedKey,
        count: e.count,
        lastSeen: e.lastSeen,
        exampleDescription: e.exampleDescription,
        redundantRules: redundantKeys.map((r) => ({ key: r, ...rules[r] })),
      };
    });

  return res.json(suggestions);
}));

router.get('/rules/stats', asyncHandler(async (_req, res) => {
  const [allStatements, rules] = await Promise.all([listStatements(), getRules()]);
  const ruleKeys = Object.keys(rules);
  if (ruleKeys.length === 0) return res.json({});

  const collapsedKeys = buildCollapsedKeys(ruleKeys);
  const stats = Object.fromEntries(ruleKeys.map((k) => [k, { matchCount: 0, lastMatchedDate: null }]));

  await Promise.all(allStatements.map(async (meta) => {
    const stmt = await getStatement(meta.id);
    if (!stmt) return;
    for (const tx of (stmt.transactions || [])) {
      if (!tx.ruleApplied || tx.isDeposit) continue;
      const norm = normalizeMerchantKey(tx.description);
      const bestKey = findBestRuleKey(norm, ruleKeys, collapsedKeys);
      if (bestKey && stats[bestKey]) {
        stats[bestKey].matchCount += 1;
        if (!stats[bestKey].lastMatchedDate || tx.date > stats[bestKey].lastMatchedDate) {
          stats[bestKey].lastMatchedDate = tx.date;
        }
      }
    }
  }));

  return res.json(stats);
}));

router.get('/rules', asyncHandler(async (_req, res) => {
  return res.json(await getRules());
}));

router.post('/rules', asyncHandler(async (req, res) => {
  const { merchant, category, isRecurring } = req.body;
  if (!merchant || !category) return res.status(400).json({ error: 'merchant and category required.' });
  await setRule(merchant, category, isRecurring);
  return res.json({ ok: true });
}));

router.delete('/rules/:key', asyncHandler(async (req, res) => {
  const deleted = await deleteRule(decodeURIComponent(req.params.key));
  if (!deleted) return res.status(404).json({ error: 'Rule not found.' });
  return res.json({ ok: true });
}));

export default router;
