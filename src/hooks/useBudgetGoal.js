import { useState } from 'react';

const KEY = 'finch_budget_goal';

export function useBudgetGoal() {
  const [budgetGoal, setBudgetGoalState] = useState(() => {
    const stored = localStorage.getItem(KEY);
    return stored ? parseFloat(stored) : 0;
  });

  const setBudgetGoal = (val) => {
    setBudgetGoalState(val);
    if (val > 0) localStorage.setItem(KEY, String(val));
    else localStorage.removeItem(KEY);
  };

  return [budgetGoal, setBudgetGoal];
}
