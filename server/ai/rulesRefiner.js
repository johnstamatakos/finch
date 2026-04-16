import { anthropic } from './claudeClient.js';

const SYSTEM_PROMPT = `You manage merchant-categorization rules for a personal finance app.

HOW MATCHING WORKS:
- Rules use prefix matching with word boundaries
- Rule key "sunoco" matches: "sunoco", "sunoco #0338384100", "sunoco gas station"
- Rule key "starbucks coffee" matches: "starbucks coffee", "starbucks coffee shop"
  but NOT "starbucks latte" (different word after "coffee")
- When two rules match, the LONGER key wins
- "amazon.com" is NOT covered by "amazon" — the dot is not a word boundary

YOUR TASK:
Given a JSON array of rules (each with key, category, isRecurring), generate a list of
specific, actionable improvement suggestions. Four suggestion types:

1. "delete" — the rule is redundant (already covered by a more general rule with same category)
   Required fields: key, currentCategory, currentIsRecurring, reason
   Condition: another rule B exists whose key is a word-boundary prefix of this rule's key
              AND both rules share the same category

2. "recategorize" — the rule's category or isRecurring flag is likely wrong
   Required fields: key, currentCategory, currentIsRecurring, newCategory, newIsRecurring, reason
   Use this when: the merchant is well-known and the assigned category is clearly off
   Examples: netflix/spotify/hulu → Subscriptions + isRecurring=true
             whole foods/trader joe's → Groceries
             amazon prime → Subscriptions + isRecurring=true
             lyft/uber → Auto

3. "consolidate" — two rules are clearly the same merchant with different key forms AND the same category
   Required fields: deleteKey, keepKey, category, isRecurring, reason
   The deleteKey rule is removed; keepKey rule is kept (or created if needed)
   Examples: "wal-mart" + "walmart" (both → Shopping), "mcdonald's" + "mcdonalds" (both → Restaurants)
   Do NOT use for same-merchant rules with different categories — use "conflict" instead

4. "conflict" — two rules refer to the same real-world merchant but have different categories, creating ambiguity
   Required fields: keepKey, keepCategory, keepIsRecurring, deleteKey, deleteCategory, deleteIsRecurring, reason
   Use this when:
   a) Two keys are alternate spellings/forms of the same merchant but disagree on category
      Example: "walmart" → Shopping AND "wal-mart" → Groceries
   b) One key is a word-boundary prefix of another AND the distinction looks accidental (not intentional)
      AND they have different categories
      Example: "target" → Shopping AND "target store" → Household (likely the same merchant, both should be one category)
   Recommend keeping the key/category you think is MORE ACCURATE (keepKey/keepCategory)
   The user will see both options and choose which to keep
   Do NOT flag intentional splits — these are fine:
     "amazon" + "amazon prime"   (general shopping vs recurring subscription — different merchants)
     "google" + "google *youtube" (different services)
     "apple" + "apple.com"       (store vs website — different transaction types)

GUIDELINES:
- Be conservative — only flag clear, high-confidence cases
- Do not suggest recategorizing if the current category is reasonable
- Aim for 2–8 suggestions total; skip anything uncertain
- Do not generate a suggestion if the change would make no real difference
- For "delete": double-check the prefix+word-boundary condition (space required after prefix key)
- For "conflict": only flag when both keys clearly represent the same real-world merchant

Return ONLY valid JSON, no explanation:
{
  "suggestions": [
    {
      "type": "delete",
      "key": "starbucks coffee shop",
      "currentCategory": "Restaurants",
      "currentIsRecurring": false,
      "reason": "Covered by 'starbucks' rule with same category via prefix match"
    },
    {
      "type": "recategorize",
      "key": "amazon prime",
      "currentCategory": "Shopping",
      "currentIsRecurring": false,
      "newCategory": "Subscriptions",
      "newIsRecurring": true,
      "reason": "Amazon Prime is a recurring subscription, not a shopping expense"
    },
    {
      "type": "consolidate",
      "deleteKey": "wal-mart",
      "keepKey": "walmart",
      "category": "Shopping",
      "isRecurring": false,
      "reason": "Same merchant — 'walmart' is the canonical normalized form"
    },
    {
      "type": "conflict",
      "keepKey": "target",
      "keepCategory": "Shopping",
      "keepIsRecurring": false,
      "deleteKey": "target store",
      "deleteCategory": "Household",
      "deleteIsRecurring": false,
      "reason": "Both keys match the same Target stores but disagree on category; Shopping is the more accurate classification"
    }
  ],
  "summary": "Found 4 improvements: 1 redundant rule, 1 miscategorization, 1 duplicate, 1 category conflict"
}

If nothing is found: { "suggestions": [], "summary": "Your rules look clean — no changes needed." }`;

export async function refineRules(rules) {
  const entries = Object.entries(rules).map(([key, value]) => ({
    key,
    category: typeof value === 'string' ? value : value.category,
    isRecurring: typeof value === 'string' ? false : Boolean(value.isRecurring),
  }));

  if (entries.length < 2) {
    return { suggestions: [], summary: 'Not enough rules to analyze — add more rules first.' };
  }

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: JSON.stringify(entries) }],
  });

  let text = '';
  for (const block of message.content) {
    if (block.type === 'text') { text = block.text; break; }
  }

  const json = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const parsed = JSON.parse(json);

  return {
    suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
    summary: parsed.summary || '',
  };
}
