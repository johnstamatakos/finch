import { useState } from 'react';
import { CATEGORIES, CATEGORY_COLORS } from '../constants/categories.js';

const STORAGE_KEY = 'budget-buddy-custom-categories';

// Extra colors cycled for user-created categories
const CUSTOM_PALETTE = [
  '#0ea5e9', '#a855f7', '#14b8a6', '#f43f5e', '#84cc16',
  '#fb923c', '#38bdf8', '#c084fc', '#34d399', '#fbbf24',
];

function loadCustom() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

export function useCategories() {
  const [customCategories, setCustomCategories] = useState(loadCustom);

  const allCategories = [
    ...CATEGORIES,
    ...customCategories.filter((c) => !CATEGORIES.includes(c)),
  ].sort((a, b) => {
    if (a === 'Other') return 1;
    if (b === 'Other') return -1;
    return a.localeCompare(b);
  });

  const addCategory = (name) => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    if (allCategories.some((c) => c.toLowerCase() === trimmed.toLowerCase())) return null;
    const updated = [...customCategories, trimmed];
    setCustomCategories(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return trimmed;
  };

  const getCategoryColor = (name) => {
    if (CATEGORY_COLORS[name]) return CATEGORY_COLORS[name];
    // Stable color based on name hash
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    return CUSTOM_PALETTE[hash % CUSTOM_PALETTE.length];
  };

  return { allCategories, customCategories, addCategory, getCategoryColor };
}
