import { useState, useRef } from 'react';
import './UploadView.css';

export default function UploadView({ onAnalyze, showBack, onBack }) {
  const [file, setFile] = useState(null);
  const [income, setIncome] = useState('');
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const handleFile = (f) => {
    const allowed = ['application/pdf', 'text/csv', 'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
    const ext = f.name.split('.').pop().toLowerCase();
    if (!allowed.includes(f.type) && !['pdf','csv','xlsx','xls'].includes(ext)) {
      alert('Please upload a PDF, CSV, or Excel file.');
      return;
    }
    setFile(f);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const onSubmit = (e) => {
    e.preventDefault();
    if (!file) return;
    onAnalyze(file, parseFloat(income) || 0);
  };

  return (
    <div className="upload-page">
      {showBack && (
        <button className="upload-back-btn" onClick={onBack}>← Back to statements</button>
      )}
      <div className="upload-header">
        <div className="logo-mark">$</div>
        <h1>Budget Buddy</h1>
        <p>Upload a bank statement and AI will categorize every transaction instantly</p>
      </div>

      <form className="upload-card" onSubmit={onSubmit}>
        <div
          className={`dropzone ${dragging ? 'dragging' : ''} ${file ? 'has-file' : ''}`}
          onClick={() => inputRef.current.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.csv,.xlsx,.xls"
            style={{ display: 'none' }}
            onChange={(e) => e.target.files[0] && handleFile(e.target.files[0])}
          />
          {file ? (
            <>
              <div className="file-icon">
                {file.name.endsWith('.pdf') ? '📄' : '📊'}
              </div>
              <p className="file-name">{file.name}</p>
              <p className="file-size">{(file.size / 1024).toFixed(0)} KB — click to change</p>
            </>
          ) : (
            <>
              <div className="upload-icon">↑</div>
              <p className="drop-label">Drop your statement here</p>
              <p className="drop-sub">PDF, CSV, or Excel · up to 10 MB</p>
            </>
          )}
        </div>

        <div className="income-field">
          <label htmlFor="income">Monthly net income (optional)</label>
          <div className="income-input-wrap">
            <span className="currency-sign">$</span>
            <input
              id="income"
              type="number"
              min="0"
              step="0.01"
              placeholder="e.g. 5000"
              value={income}
              onChange={(e) => setIncome(e.target.value)}
            />
          </div>
          <p className="income-hint">Used to show how much of your income you're spending</p>
        </div>

        <button type="submit" className="analyze-btn" disabled={!file}>
          Analyze with AI
        </button>
      </form>

      <p className="upload-note">
        Tip: Export your statement as a PDF or CSV from your bank's website. Scanned image PDFs won't work.
      </p>
    </div>
  );
}
