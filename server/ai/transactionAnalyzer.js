import { createMessage } from './providers/index.js';

const BASE_CATEGORIES = [
  'Auto', 'Home', 'Utilities', 'Credit Cards', 'Student Loans',
  'Subscriptions', 'Shopping', 'Groceries', 'Restaurants', 'Other',
];

const BASE_GUIDE = `- Auto: gas stations, car payments, auto insurance, parking, car repair, Uber/Lyft (passenger)
- Home: rent, mortgage, home insurance, furniture, home repair
- Utilities: electric, gas, water, internet, phone bill, cable
- Credit Cards: credit card payments (not purchases)
- Student Loans: student loan payments
- Subscriptions: Netflix, Spotify, Hulu, Disney+, gym memberships, software subscriptions
- Shopping: Amazon, clothing, electronics, general retail, department stores
- Groceries: Whole Foods, Trader Joe's, Costco, supermarkets, grocery stores
- Restaurants: restaurants, cafes, fast food, bars, DoorDash, Uber Eats, Grubhub
- Other: deposits, paychecks, refunds, transfers, ATM, and anything else`;

function buildSystemPrompt(customCategories) {
  const allCategories = [...BASE_CATEGORIES, ...customCategories];
  const customGuide = customCategories.length > 0
    ? `\n\nCustom categories — use when transactions clearly match:\n${customCategories.map((c) => `- ${c}`).join('\n')}`
    : '';

  return `You are a bank transaction categorizer. Given a JSON array of transactions (each with a source/merchant and optional bank activity type), return a JSON array with a category, isRecurring flag, and confidence level for each one — in the same order.

Valid categories: ${allCategories.join(', ')}

Category guide:
${BASE_GUIDE}${customGuide}

isRecurring: true for fixed-schedule charges — subscriptions, rent, loan payments, utilities, insurance, phone bills

confidence: your certainty about the category assignment
- "high" — merchant name clearly identifies the category (e.g. "Netflix" → Subscriptions, "Shell Gas" → Auto, "Whole Foods" → Groceries)
- "medium" — reasonable inference from keywords or context (e.g. "MTG PMT" → Home, "LOAN PMT" → Student Loans, "AUTO INS" → Auto)
- "low" — ambiguous, generic, or unclear description

Return ONLY a valid JSON array — no markdown, no explanation. Include the i field from the input:
[{"i":0,"category":"Restaurants","isRecurring":false,"confidence":"high"},...]`;
}

const BATCH_SIZE = 80; // safe ceiling for Haiku's 4096-token output limit

export async function analyzeTransactions(transactions, customCategories = []) {
  const systemPrompt = buildSystemPrompt(customCategories);
  const categoryMap = {};

  for (let start = 0; start < transactions.length; start += BATCH_SIZE) {
    const batch = transactions.slice(start, start + BATCH_SIZE);
    const batchMap = await categorizeBatch(batch, start, systemPrompt);
    Object.assign(categoryMap, batchMap);
  }

  return transactions.map((t, i) => ({
    ...t,
    category: categoryMap[i]?.category || 'Other',
    isRecurring: Boolean(categoryMap[i]?.isRecurring),
    confidence: categoryMap[i]?.confidence || 'low',
  }));
}

async function categorizeBatch(batch, offset, systemPrompt) {
  const input = batch.map((t, idx) => {
    const entry = { i: offset + idx, source: t.source, isDeposit: t.amount > 0 };
    if (t.activity) entry.activity = t.activity;
    return entry;
  });

  let jsonText = await createMessage({
    maxTokens: 4096,
    systemPrompt,
    userMessage: JSON.stringify(input),
  });

  jsonText = jsonText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  const s = jsonText.indexOf('[');
  const e = jsonText.lastIndexOf(']');
  if (s !== -1 && e !== -1) jsonText = jsonText.slice(s, e + 1);

  let categories;
  try {
    categories = JSON.parse(jsonText);
  } catch {
    console.error('AI parse failed. batch offset:', offset);
    console.error('Raw (first 300):', jsonText.slice(0, 300));
    throw new Error('Failed to parse AI response. Please try again.');
  }

  if (!Array.isArray(categories)) {
    throw new Error('Unexpected response format from AI. Please try again.');
  }

  const map = {};
  for (const item of categories) {
    if (typeof item.i === 'number') map[item.i] = item;
  }
  return map;
}
