import { anthropic } from './claudeClient.js';

const SYSTEM_PROMPT = `You are a personal finance analyst. Given monthly bank statement summaries, generate 4–6 short, specific, data-driven insights.

Each insight is a JSON object: { "type": "warning"|"positive"|"info", "message": "..." }
- "warning": high spend, rising category, spending > income
- "positive": spending down, good savings rate, improvement vs prior month
- "info": neutral observation, pattern, breakdown

Rules:
- Reference actual dollar amounts and category names
- For multiple months, compare month-over-month or to the average
- Each message must be under 90 characters
- Be direct — skip filler like "It looks like..." or "You might want to..."
- Return ONLY a valid JSON array, no markdown fences

Example output:
[
  {"type":"warning","message":"Restaurants up 34% month-over-month ($380 → $510)"},
  {"type":"info","message":"Recurring charges: $1,240/mo — 38% of total spending"},
  {"type":"positive","message":"Shopping down 22% vs last month, saving ~$120"}
]`;

export async function generateInsights(statements) {
  const data = statements.map((s) => ({
    period: s.period?.label ?? s.name,
    income: s.monthlyIncome || 0,
    totalExpenses: s.summary?.totalExpenses ?? 0,
    byCategory: s.summary?.byCategory ?? {},
    transactionCount: s.summary?.transactionCount ?? 0,
  }));

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: JSON.stringify(data) }],
  });

  let text = '';
  for (const block of message.content) {
    if (block.type === 'text') { text = block.text; break; }
  }

  // Strip markdown fences if Haiku wraps anyway
  const json = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  return JSON.parse(json);
}
