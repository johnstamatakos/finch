import { createMessage } from './providers/index.js';

const SYSTEM_PROMPT = `You are a personal finance analyst. Given monthly bank statement summaries, generate 4–6 short, specific, data-driven insights.

Each insight is a JSON object: { "type": "warning"|"positive"|"info", "message": "..." }
- "warning": high spend, rising category, spending > income/deposits
- "positive": spending down, good savings rate, improvement vs prior month
- "info": neutral observation, pattern, breakdown

Key field definitions:
- "totalDeposits": sum of all incoming transfers and paychecks recorded in the statement (this is the actual income)
- "totalExpenses": sum of all outgoing charges
- "byCategory": spending breakdown by category

Rules:
- Use totalDeposits as the income figure — do NOT say income is $0 if totalDeposits > 0
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
    totalDeposits: s.summary?.totalDeposits ?? 0,   // actual bank income/deposits
    totalExpenses: s.summary?.totalExpenses ?? 0,
    byCategory: s.summary?.byCategory ?? {},
    transactionCount: s.summary?.transactionCount ?? 0,
  }));

  const text = await createMessage({
    maxTokens: 1024,
    systemPrompt: SYSTEM_PROMPT,
    userMessage: JSON.stringify(data),
  });

  // Strip markdown fences if model wraps anyway
  const json = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  return JSON.parse(json);
}
