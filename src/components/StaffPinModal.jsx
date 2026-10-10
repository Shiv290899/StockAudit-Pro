import React, { useState } from 'react';
import { KeyRound, X, AlertCircle, Check } from 'lucide-react';

export default function StaffPinModal({ staff, onClose, onSuccess }) {
  const [pinInput, setPinInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (String(pinInput).trim() === String(staff.pin).trim()) {
      onSuccess(staff);
    } else {
      setErrorMsg(`Incorrect PIN for ${staff.name}. Please try again or ask Owner.`);
      setPinInput('');
    }
  };

  const handleNumClick = (num) => {
    if (pinInput.length < 6) {
      setPinInput(prev => prev + num);
      setErrorMsg('');
    }
  };

  const handleDelete = () => {
    setPinInput(prev => prev.slice(0, -1));
    setErrorMsg('');
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card max-w-sm">
        <div className="modal-header">
          <div className="modal-title-with-icon">
            <KeyRound className="text-cyan" size={20} />
            <h3>Enter Staff PIN</h3>
          </div>
          <button type="button" onClick={onClose} className="icon-btn">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body text-center">
          <p className="pin-prompt-text">
            Authenticating as <strong>{staff.name}</strong>
          </p>

          <div className="pin-dots-display">
            {[0, 1, 2, 3].map((idx) => (
              <span 
                key={idx} 
                className={`pin-dot ${idx < pinInput.length ? 'filled' : ''}`}
              />
            ))}
          </div>

          <input 
            type="password" 
            maxLength={6}
            value={pinInput}
            onChange={(e) => {
              setPinInput(e.target.value.replace(/[^0-9]/g, ''));
              setErrorMsg('');
            }}
            placeholder="Enter 4-Digit PIN"
            className="pin-screen-input"
            autoFocus
          />

          {errorMsg && (
            <div className="status-alert alert-danger mt-2">
              <AlertCircle size={15} />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Quick On-Screen Touch Numpad for Mobile */}
          <div className="mobile-numpad-grid mt-3">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
              <button 
                key={n} 
                type="button" 
                onClick={() => handleNumClick(n)}
                className="numpad-btn"
              >
                {n}
              </button>
            ))}
            <button 
              type="button" 
              onClick={() => setPinInput('')} 
              className="numpad-btn numpad-clear"
            >
              C
            </button>
            <button 
              type="button" 
              onClick={() => handleNumClick(0)} 
              className="numpad-btn"
            >
              0
            </button>
            <button 
              type="button" 
              onClick={handleDelete} 
              className="numpad-btn numpad-del"
            >
              ⌫
            </button>
          </div>

          <button 
            type="submit" 
            disabled={pinInput.length < 3}
            className="btn btn-primary w-full mt-4 py-3"
          >
            Authenticate & Start Scanning
          </button>
        </form>
      </div>
    </div>
  );
}
