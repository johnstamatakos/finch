import { useState, useEffect } from 'react';
import { CATEGORIES, getCategoryColor } from '../constants/categories.js';

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

  const renameCategory = async (oldName, newName) => {
    try {
      const res = await fetch(`/api/categories/${encodeURIComponent(oldName)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newName }),
      });
      if (!res.ok) return null;
      const { name } = await res.json();
      setCustomCategories((prev) => prev.map((c) => (c === oldName ? name : c)));
      return name;
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

  return { allCategories, customCategories, addCategory, renameCategory, removeCategory, getCategoryColor };
}
