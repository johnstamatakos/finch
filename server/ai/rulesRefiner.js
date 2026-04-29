import { createMessage } from './providers/index.js';
import { analyzeRulesAlgorithmically } from '../utils/rulesAnalyzer.js';

/**
 * Simplified AI prompt for the harder cases that algorithmic analysis can't handle:
 *   - Brand name deduplication (wal-mart vs walmart)
 *   - Obvious miscategorizations for well-known brands
 *
 * The prefix-matching explanation is intentionally omitted here — the algorithm
 * handles structural redundancy. The AI focuses only on world-knowledge tasks.
 */
const AI_SYSTEM_PROMPT = `You manage merchant-categorization rules for a personal finance app.

YOUR TASK:
Given a JSON array of rules (each with key, category, isRecurring), look for two specific types of issues:

1. "consolidate" — two rules are the SAME real-world merchant spelled differently, with the SAME category
   Required fields: deleteKey, keepKey, category, isRecurring, reason
   Examples: "wal-mart"+"walmart" (both Shopping), "mcdonald's"+"mcdonalds" (both Restaurants)
   Skip if the categories differ — that's a conflict, not a consolidation
   Skip if the difference is meaningful (e.g. "amazon" vs "amazon prime" are different services)

2. "recategorize" — a well-known brand is assigned a clearly wrong category
   Required fields: key, currentCategory, currentIsRecurring, newCategory, newIsRecurring, reason
   Only flag clear cases where a brand's category is unambiguously wrong
   Examples: netflix/spotify/hulu → Subscriptions + isRecurring=true
             whole foods/trader joe's → Groceries (if miscategorized)
             amazon prime → Subscriptions + isRecurring=true (if under Shopping)

GUIDELINES:
- Be conservative — only flag cases you are highly confident about
- Aim for 0–5 suggestions; skip anything uncertain
- Do NOT flag prefix redundancies (e.g. "peco energy" vs "peco energy payments...") — those are handled separately
- Do NOT flag "amazon" + "amazon prime" as a consolidation — they are intentionally different

Return ONLY valid JSON, no explanation:
{
  "suggestions": [],
  "summary": "..."
}`;

/**
 * Hybrid rules refinement:
 *   Phase 1 — algorithmic detection (prefix redundancy, debit card/automated payment patterns)
 *   Phase 2 — AI detection (brand-name deduplication, miscategorizations)
 *
 * Falls back gracefully if AI is unavailable or returns unparseable output.
 *
 * @param {Record<string, string | { category: string, isRecurring: boolean }>} rules
 * @returns {Promise<{ suggestions: any[], summary: string }>}
 */
export async function refineRules(rules) {
  const entries = Object.entries(rules).map(([key, value]) => ({
    key,
    category: typeof value === 'string' ? value : value.category,
    isRecurring: typeof value === 'string' ? false : Boolean(value.isRecurring),
  }));

  if (entries.length < 2) {
    return { suggestions: [], summary: 'Not enough rules to analyze — add more rules first.' };
  }

  // Phase 1: algorithmic (always runs, no network call)
  const algorithmicSuggestions = analyzeRulesAlgorithmically(rules);

  // Phase 2: AI for brand-identity and miscategorization cases
  // Pass the full rules list — the AI prompt is focused on consolidation + recategorization only
  let aiSuggestions = [];
  let aiSummary = '';

  try {
    const text = await createMessage({
      maxTokens: 2048,
      systemPrompt: AI_SYSTEM_PROMPT,
      userMessage: JSON.stringify(entries),
    });

    const json = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const parsed = JSON.parse(json);

    if (Array.isArray(parsed.suggestions)) {
      aiSuggestions = parsed.suggestions
        // Filter out any AI suggestions that duplicate algorithmic ones
        .filter((s) => {
          if (s.type === 'delete') {
            return !algorithmicSuggestions.some((a) => a.type === 'delete' && a.key === s.key);
          }
          return true;
        })
        .map((s) => ({ ...s, _source: 'ai' }));
    }
    aiSummary = parsed.summary || '';
  } catch (err) {
    // AI unavailable or bad output — algorithmic results still returned
    console.warn('[rulesRefiner] AI phase skipped:', err.message);
  }

  const all = [...algorithmicSuggestions, ...aiSuggestions];

  // Build summary
  const counts = {};
  for (const s of all) counts[s.type] = (counts[s.type] || 0) + 1;
  const parts = Object.entries(counts).map(([t, n]) => `${n} ${t === 'delete' ? 'redundant rule' : t}${n !== 1 ? 's' : ''}`);
  const summary = all.length === 0
    ? 'Your rules look clean — no changes needed.'
    : `Found ${all.length} improvement${all.length !== 1 ? 's' : ''}: ${parts.join(', ')}`;

  return { suggestions: all, summary };
}
