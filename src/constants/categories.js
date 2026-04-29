export const CATEGORIES = [
  'Auto',
  'Home',
  'Utilities',
  'Credit Cards',
  'Student Loans',
  'Subscriptions',
  'Shopping',
  'Groceries',
  'Restaurants',
  'Other',
  'Transfers',
];

const CUSTOM_PALETTE = [
  '#0ea5e9', '#a855f7', '#14b8a6', '#f43f5e', '#84cc16',
  '#fb923c', '#38bdf8', '#c084fc', '#34d399', '#fbbf24',
];

export function getCategoryColor(name) {
  if (CATEGORY_COLORS[name]) return CATEGORY_COLORS[name];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return CUSTOM_PALETTE[hash % CUSTOM_PALETTE.length];
}

export const CATEGORY_COLORS = {
  // Built-in categories
  Auto:           '#3b82f6', // blue
  Home:           '#818cf8', // indigo (accent-adjacent)
  Utilities:      '#f59e0b', // amber (deeper than before)
  'Credit Cards': '#f43f5e', // rose
  'Student Loans':'#db2777', // deep pink (not pastel)
  Subscriptions:  '#06b6d4', // cyan
  Shopping:       '#fb923c', // orange
  Groceries:      '#22c55e', // green
  Restaurants:    '#ef4444', // red
  Other:          '#64748b', // slate muted (intentionally dim)
  Transfers:      '#475569', // darker slate

  // Custom categories
  Taxes:          '#eab308', // golden (not Easter-egg yellow)
  '529':          '#10b981', // emerald
  Work:           '#6366f1', // indigo
  School:         '#0ea5e9', // sky blue
  Pets:           '#ec4899', // hot pink (not pastel)
  Health:         '#14b8a6', // teal
  Entertainment:  '#a855f7', // vivid purple (not lavender)
  Gas:            '#f97316', // strong orange
};
