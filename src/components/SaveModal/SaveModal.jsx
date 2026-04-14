import { useState, useEffect, useRef } from 'react';
import './SaveModal.css';

export default function SaveModal({ defaultName, onSave, onCancel }) {
  const [name, setName] = useState(defaultName || '');
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (name.trim()) onSave(name.trim());
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <h2>Save Statement</h2>
        <p>Give this statement a name so you can find it later.</p>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            className="modal-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. January 2024"
            maxLength={80}
          />
          <div className="modal-actions">
            <button type="button" className="modal-btn-ghost" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="modal-btn-primary" disabled={!name.trim()}>
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
