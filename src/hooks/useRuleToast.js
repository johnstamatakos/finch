import { useState, useRef } from 'react';

const DISMISS_MS = 5000;

export function useRuleToast() {
  const [pendingRule, setPendingRule] = useState(null); // { description, category }
  const timerRef = useRef(null);

  const triggerToast = (description, category) => {
    clearTimeout(timerRef.current);
    setPendingRule({ description, category });
    timerRef.current = setTimeout(() => setPendingRule(null), DISMISS_MS);
  };

  const saveRule = async () => {
    if (!pendingRule) return;
    clearTimeout(timerRef.current);
    setPendingRule(null);
    await fetch('/api/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchant: pendingRule.description, category: pendingRule.category }),
    });
  };

  const dismissToast = () => {
    clearTimeout(timerRef.current);
    setPendingRule(null);
  };

  return { pendingRule, triggerToast, saveRule, dismissToast };
}
