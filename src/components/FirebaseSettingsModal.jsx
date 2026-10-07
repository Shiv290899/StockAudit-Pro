import React, { useState } from 'react';
import { X, Cloud, Key, Check, Info, AlertCircle } from 'lucide-react';
import { getSavedFirebaseConfig, saveFirebaseConfig } from '../utils/syncEngine';

export default function FirebaseSettingsModal({ onClose, onSave }) {
  const currentConfig = getSavedFirebaseConfig() || {};
  const [configJson, setConfigJson] = useState(
    currentConfig.projectId ? JSON.stringify(currentConfig, null, 2) : ''
  );
  const [statusMsg, setStatusMsg] = useState('');
  const [isError, setIsError] = useState(false);

  const handleSave = () => {
    if (!configJson.trim()) {
      saveFirebaseConfig(null);
      setStatusMsg('Switched to Zero-Config Local / BroadcastChannel Mode.');
      setIsError(false);
      setTimeout(() => {
        onSave();
        onClose();
      }, 700);
      return;
    }

    try {
      const parsed = JSON.parse(configJson);
      if (!parsed.projectId || !parsed.apiKey) {
        setIsError(true);
        setStatusMsg('Invalid JSON: Must include at least "apiKey" and "projectId".');
        return;
      }
      saveFirebaseConfig(parsed);
      setIsError(false);
      setStatusMsg('Firebase configuration saved successfully! Reloading sync...');
      setTimeout(() => {
        onSave();
        onClose();
      }, 700);
    } catch {
      setIsError(true);
      setStatusMsg('Invalid JSON format. Please paste valid Firebase config object.');
    }
  };

  const loadDemoTemplate = () => {
    const template = {
      apiKey: "AIzaSyDemoKeyExample12345",
      authDomain: "stockaudit-demo.firebaseapp.com",
      projectId: "stockaudit-demo",
      storageBucket: "stockaudit-demo.appspot.com",
      messagingSenderId: "123456789",
      appId: "1:123456789:web:abcdef123456"
    };
    setConfigJson(JSON.stringify(template, null, 2));
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-header">
          <div className="modal-title-with-icon">
            <Cloud className="text-cyan" size={22} />
            <h3>Cloud Real-Time Sync Settings</h3>
          </div>
          <button type="button" onClick={onClose} className="icon-btn">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          <div className="info-banner">
            <Info size={18} className="text-cyan flex-shrink-0" />
            <p>
              <strong>100% Free Tier (₹0):</strong> Paste your Firebase Project config below to enable instant live sync across 10+ mobile devices in the godown. Without Firebase, the app automatically uses high-speed local tab sync.
            </p>
          </div>

          <div className="form-group">
            <div className="label-row">
              <label htmlFor="firebase-config">Firebase Web App Config (JSON):</label>
              <button type="button" onClick={loadDemoTemplate} className="text-btn">
                Insert Template
              </button>
            </div>
            <textarea
              id="firebase-config"
              rows={8}
              value={configJson}
              onChange={(e) => setConfigJson(e.target.value)}
              placeholder='{&#10;  "apiKey": "...",&#10;  "projectId": "...",&#10;  ...&#10;}'
              className="code-textarea"
            />
          </div>

          {statusMsg && (
            <div className={`status-alert ${isError ? 'alert-danger' : 'alert-success'}`}>
              {isError ? <AlertCircle size={16} /> : <Check size={16} />}
              <span>{statusMsg}</span>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button 
            type="button" 
            onClick={() => {
              saveFirebaseConfig(null);
              setConfigJson('');
              setStatusMsg('Reset to local mode.');
              setTimeout(() => { onSave(); onClose(); }, 500);
            }} 
            className="btn btn-outline"
          >
            Clear / Use Local Mode
          </button>
          <button type="button" onClick={handleSave} className="btn btn-primary">
            Save & Activate Sync
          </button>
        </div>
      </div>
    </div>
  );
}
