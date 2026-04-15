import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { join } from 'path';

// Stored at <repo-root>/data/rules.json — already covered by the data/ gitignore
const RULES_PATH = fileURLToPath(new URL('../../data/rules.json', import.meta.url));

/** Lowercase + collapse whitespace for consistent key matching */
function normalize(source) {
  return (source || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

async function loadRules() {
  try {
    if (!existsSync(RULES_PATH)) return {};
    return JSON.parse(await readFile(RULES_PATH, 'utf8'));
  } catch {
    return {};
  }
}

async function saveRules(rules) {
  await writeFile(RULES_PATH, JSON.stringify(rules, null, 2));
}

/**
 * Called when a statement is saved or updated.
 * Records every expense transaction's source → category as a learned rule.
 * A later correction overwrites the earlier one.
 */
export async function learnFromTransactions(transactions) {
  const rules = await loadRules();
  let changed = false;
  const knownCategories = new Set(Object.values(rules));

  for (const t of transactions) {
    if (t.isDeposit) continue;
    const key = normalize(t.description);
    if (!key) continue;

    if (rules[key] === undefined) {
      if (!knownCategories.has(t.category)) {
        console.log(`[rules] New category: ${t.category}`);
        knownCategories.add(t.category);
      }
      console.log(`[rules] New rule: "${key}" → ${t.category}`);
      rules[key] = t.category;
      changed = true;
    } else if (rules[key] !== t.category) {
      console.log(`[rules] Rule updated: "${key}" ${rules[key]} → ${t.category}`);
      rules[key] = t.category;
      changed = true;
    }
  }

  if (changed) await saveRules(rules);
}

export async function getRules() {
  return loadRules();
}

export async function setRule(merchant, category) {
  const key = normalize(merchant);
  if (!key) return;
  const rules = await loadRules();
  const isNew = rules[key] === undefined;
  const categoryIsNew = !Object.values(rules).includes(category);
  if (isNew && categoryIsNew) console.log(`[rules] New category: ${category}`);
  if (isNew) console.log(`[rules] New rule: "${key}" → ${category}`);
  else console.log(`[rules] Rule updated: "${key}" ${rules[key]} → ${category}`);
  rules[key] = category;
  await saveRules(rules);
}

export async function deleteRule(merchant) {
  const key = normalize(merchant);
  const rules = await loadRules();
  if (rules[key] === undefined) return false;
  console.log(`[rules] Rule deleted: "${key}"`);
  delete rules[key];
  await saveRules(rules);
  return true;
}

/**
 * Called after Claude categorizes a freshly-uploaded statement.
 * Overrides any categories that match a previously learned rule.
 */
export async function applyRules(transactions) {
  const rules = await loadRules();
  if (Object.keys(rules).length === 0) return transactions;
  return transactions.map((t) => {
    if (t.isDeposit) return { ...t, ruleApplied: true };
    const learned = rules[normalize(t.description)];
    if (learned) {
      console.log(`[rules] Rule applied: "${t.description}" → ${learned}`);
      return { ...t, category: learned, ruleApplied: true };
    }
    return { ...t, ruleApplied: false };
  });
}
