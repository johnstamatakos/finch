import { Router } from 'express';
import { generateInsights } from '../ai/insightsAnalyzer.js';
import { getCachedInsights, setCachedInsights } from '../utils/insightsCache.js';
import { getStatement } from '../utils/statementStore.js';
import { asyncHandler } from '../utils/requestHelpers.js';

const router = Router();

router.post('/insights', asyncHandler(async (req, res) => {
  const { statements, force } = req.body;
  if (!Array.isArray(statements) || statements.length === 0) {
    return res.status(400).json({ error: 'statements array required.' });
  }

  const ids = statements.map((s) => s.id);

  if (!force) {
    const cached = await getCachedInsights(ids);
    if (cached) return res.json(cached);
  }

  // Load full statements (with transactions) for algorithmic analysis.
  // Claude still only receives compact summaries — transactions stay server-side.
  const fullStatements = (await Promise.all(ids.map((id) => getStatement(id)))).filter(Boolean);

  const insights = await generateInsights(fullStatements);
  const result = { insights, generatedAt: new Date().toISOString() };
  await setCachedInsights(ids, insights);
  return res.json(result);
}));

export default router;
