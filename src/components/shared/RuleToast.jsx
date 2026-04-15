import './RuleToast.css';

export default function RuleToast({ pendingRule, onSave, onDismiss }) {
  if (!pendingRule) return null;
  return (
    <div className="rule-toast">
      <span className="rule-toast-msg">
        Save <strong>"{pendingRule.description}"</strong> → {pendingRule.category} as a rule?
      </span>
      <div className="rule-toast-actions">
        <button className="rule-toast-save" onClick={onSave}>Save Rule</button>
        <button className="rule-toast-skip" onClick={onDismiss}>Skip</button>
      </div>
    </div>
  );
}
