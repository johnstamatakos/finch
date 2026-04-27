import { useState, useEffect } from 'react';
import { CATEGORIES, CATEGORY_COLORS } from '../constants/categories.js';

// Extra colors cycled for user-created categories
const CUSTOM_PALETTE = [
  '#0ea5e9', '#a855f7', '#14b8a6', '#f43f5e', '#84cc16',
  '#fb923c', '#38bdf8', '#c084fc', '#34d399', '#fbbf24',
];

export function useCategories() {
  const [customCategories, setCustomCategories] = useState([]);

  useEffect(() => {
    fetch('/api/categories')
      .then((r) => r.json())
      .then((data) => Array.isArray(data) && setCustomCategories(data))
      .catch(() => {});
  }, []);

  const allCategories = [
    ...CATEGORIES,
    ...customCategories.filter((c) => !CATEGORIES.includes(c)),
  ].sort((a, b) => {
    if (a === 'Other') return 1;
    if (b === 'Other') return -1;
    return a.localeCompare(b);
  });

  const addCategory = async (name) => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    if (allCategories.some((c) => c.toLowerCase() === trimmed.toLowerCase())) return null;
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) return null;
      const { name: added } = await res.json();
      setCustomCategories((prev) => [...prev, added]);
      return added;
    } catch {
      return null;
    }
  };

  const removeCategory = async (name) => {
    try {
      const res = await fetch(`/api/categories/${encodeURIComponent(name)}`, { method: 'DELETE' });
      if (!res.ok) return false;
      setCustomCategories((prev) => prev.filter((c) => c !== name));
      return true;
    } catch {
      return false;
    }
  };

  const getCategoryColor = (name) => {
    if (CATEGORY_COLORS[name]) return CATEGORY_COLORS[name];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    return CUSTOM_PALETTE[hash % CUSTOM_PALETTE.length];
  };

  return { allCategories, customCategories, addCategory, removeCategory, getCategoryColor };
}
