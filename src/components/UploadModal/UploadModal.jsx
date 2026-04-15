import { useState, useRef } from 'react';
import './UploadModal.css';

export default function UploadModal({ onAnalyze, onClose }) {
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const handleFile = (f) => {
    const allowed = ['text/csv', 'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
    const ext = f.name.split('.').pop().toLowerCase();
    if (!allowed.includes(f.type) && !['csv', 'xlsx', 'xls'].includes(ext)) {
      alert('Please upload a CSV or Excel file (.csv, .xlsx, .xls).');
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
    onAnalyze(file);
  };

  return (
    <div className="upload-modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="upload-modal-card">
        <div className="upload-modal-header">
          <h2>Upload Statement</h2>
          <button className="upload-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <form onSubmit={onSubmit}>
          <div
            className={`upload-dropzone ${dragging ? 'dragging' : ''} ${file ? 'has-file' : ''}`}
            onClick={() => inputRef.current.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              style={{ display: 'none' }}
              onChange={(e) => e.target.files[0] && handleFile(e.target.files[0])}
            />
            {file ? (
              <>
                <div className="upload-file-icon">📊</div>
                <p className="upload-file-name">{file.name}</p>
                <p className="upload-file-size">{(file.size / 1024).toFixed(0)} KB — click to change</p>
              </>
            ) : (
              <>
                <div className="upload-icon-wrap">↑</div>
                <p className="upload-drop-label">Drop your statement here</p>
                <p className="upload-drop-sub">CSV or Excel · up to 10 MB</p>
              </>
            )}
          </div>

          <button type="submit" className="upload-submit-btn" disabled={!file}>
            Analyze with AI
          </button>
        </form>
      </div>
    </div>
  );
}
