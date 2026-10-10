import React, { useState } from 'react';
import { Shield, Users, Lock, UserCheck, AlertCircle } from 'lucide-react';
import { DEFAULT_OWNER_CREDS, DEFAULT_STAFF_LOGIN, setActiveUser } from '../utils/authStore';

export default function LoginModal({ onLoginSuccess }) {
  const [role, setRole] = useState('owner'); // 'owner' | 'staff'
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('123');
  const [errorMsg, setErrorMsg] = useState('');

  const handleRoleSwitch = (newRole) => {
    setRole(newRole);
    setErrorMsg('');
    if (newRole === 'owner') {
      setUsername(DEFAULT_OWNER_CREDS.username);
      setPassword(DEFAULT_OWNER_CREDS.password);
    } else {
      setUsername(DEFAULT_STAFF_LOGIN.username);
      setPassword(DEFAULT_STAFF_LOGIN.password);
    }
  };

  const handleLogin = (e) => {
    e.preventDefault();
    if (role === 'owner') {
      if (username === DEFAULT_OWNER_CREDS.username && password === DEFAULT_OWNER_CREDS.password) {
        const userObj = { role: 'owner', name: 'Owner / Admin' };
        setActiveUser(userObj);
        onLoginSuccess(userObj);
      } else {
        setErrorMsg('Invalid Owner credentials (default: admin / 123)');
      }
    } else {
      if (username === DEFAULT_STAFF_LOGIN.username && password === DEFAULT_STAFF_LOGIN.password) {
        const userObj = { role: 'staff', name: 'Floor Staff' };
        setActiveUser(userObj);
        onLoginSuccess(userObj);
      } else {
        setErrorMsg('Invalid Staff credentials (default: staff / 123)');
      }
    }
  };

  return (
    <div className="login-fullscreen-backdrop">
      <div className="login-card glass-card">
        <div className="login-header text-center">
          <div className="login-brand-icon">⚡</div>
          <h2>StockAudit Pro Portal</h2>
          <p className="login-subtitle">Choose your access role to continue</p>
        </div>

        {/* Role Selector Tabs */}
        <div className="role-selector-tabs">
          <button 
            type="button" 
            onClick={() => handleRoleSwitch('owner')}
            className={`role-tab-btn ${role === 'owner' ? 'active-role' : ''}`}
          >
            <Shield size={16} />
            <span>Owner Dashboard</span>
          </button>

          <button 
            type="button" 
            onClick={() => handleRoleSwitch('staff')}
            className={`role-tab-btn ${role === 'staff' ? 'active-role' : ''}`}
          >
            <Users size={16} />
            <span>Staff Scanner</span>
          </button>
        </div>

        <form onSubmit={handleLogin} className="login-form">
          <div className="form-group">
            <label>Username</label>
            <input 
              type="text" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="login-input"
              required 
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="login-input"
              required 
            />
          </div>

          {errorMsg && (
            <div className="status-alert alert-danger mb-3">
              <AlertCircle size={15} />
              <span>{errorMsg}</span>
            </div>
          )}

          <button type="submit" className="btn btn-primary w-full login-submit-btn">
            {role === 'owner' ? 'Access Owner Dashboard' : 'Open Staff Scanner'}
          </button>

          <div className="login-hints text-center mt-3">
            <small>
              {role === 'owner' ? (
                <>Owner Default: <code>admin</code> / <code>123</code></>
              ) : (
                <>Staff Default: <code>staff</code> / <code>123</code> (then choose name & PIN)</>
              )}
            </small>
          </div>
        </form>
      </div>
    </div>
  );
}
