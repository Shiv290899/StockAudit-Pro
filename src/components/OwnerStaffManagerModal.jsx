import React, { useState } from 'react';
import { X, Users, Key, Plus, Trash2, Check, ShieldAlert } from 'lucide-react';
import { getStaffRoster, updateStaffPin, addStaffMember, deleteStaffMember } from '../utils/authStore';

export default function OwnerStaffManagerModal({ onClose, onRosterChanged }) {
  const [roster, setRoster] = useState(getStaffRoster());
  const [editingId, setEditingId] = useState(null);
  const [editPinVal, setEditPinVal] = useState('');
  
  // Add new staff form
  const [newName, setNewName] = useState('');
  const [newPin, setNewPin] = useState('');
  const [msg, setMsg] = useState('');

  const handleSavePin = (id) => {
    if (!editPinVal.trim() || editPinVal.length < 3) {
      setMsg('PIN must be at least 3-4 digits');
      return;
    }
    const updated = updateStaffPin(id, editPinVal);
    setRoster(updated);
    setEditingId(null);
    setEditPinVal('');
    setMsg('PIN updated successfully!');
    if (onRosterChanged) onRosterChanged(updated);
    setTimeout(() => setMsg(''), 2500);
  };

  const handleAddStaff = (e) => {
    e.preventDefault();
    if (!newName.trim() || !newPin.trim()) return;
    const updated = addStaffMember(newName, newPin);
    setRoster(updated);
    setNewName('');
    setNewPin('');
    setMsg(`Added staff ${newName} with PIN ${newPin}`);
    if (onRosterChanged) onRosterChanged(updated);
    setTimeout(() => setMsg(''), 2500);
  };

  const handleDeleteStaff = (id, name) => {
    if (confirm(`Remove staff ${name}?`)) {
      const updated = deleteStaffMember(id);
      setRoster(updated);
      if (onRosterChanged) onRosterChanged(updated);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card max-w-lg">
        <div className="modal-header">
          <div className="modal-title-with-icon">
            <Users className="text-cyan" size={20} />
            <h3>Manage Staff & Secret PIN Codes</h3>
          </div>
          <button type="button" onClick={onClose} className="icon-btn">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          <div className="info-banner">
            <ShieldAlert size={18} className="text-amber flex-shrink-0" />
            <p>
              Only the <strong>Owner</strong> can view and change staff PIN codes. When staff log in on their phones, they must enter their specific PIN to prevent scanning under someone else's name.
            </p>
          </div>

          {msg && (
            <div className="status-alert alert-success mb-3">
              <Check size={16} />
              <span>{msg}</span>
            </div>
          )}

          {/* Staff List */}
          <div className="staff-roster-table-box">
            <table className="roster-table">
              <thead>
                <tr>
                  <th>Staff Name</th>
                  <th>Designation</th>
                  <th>Secret PIN</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {roster.map((s) => (
                  <tr key={s.id}>
                    <td><strong>{s.name}</strong></td>
                    <td className="text-muted text-xs">{s.role || 'Staff'}</td>
                    <td>
                      {editingId === s.id ? (
                        <div className="pin-edit-inline">
                          <input 
                            type="text" 
                            maxLength={6}
                            value={editPinVal}
                            onChange={(e) => setEditPinVal(e.target.value.replace(/[^0-9]/g, ''))}
                            className="pin-edit-input"
                            autoFocus
                          />
                          <button 
                            type="button" 
                            onClick={() => handleSavePin(s.id)}
                            className="btn-tiny-save"
                          >
                            Save
                          </button>
                          <button 
                            type="button" 
                            onClick={() => setEditingId(null)}
                            className="btn-tiny-cancel"
                          >
                            ×
                          </button>
                        </div>
                      ) : (
                        <div className="pin-display">
                          <code className="pin-badge">{s.pin}</code>
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="table-actions-row">
                        {editingId !== s.id && (
                          <button 
                            type="button" 
                            onClick={() => {
                              setEditingId(s.id);
                              setEditPinVal(s.pin);
                            }}
                            className="text-btn text-cyan"
                          >
                            Change PIN
                          </button>
                        )}
                        <button 
                          type="button" 
                          onClick={() => handleDeleteStaff(s.id, s.name)}
                          className="icon-btn-tiny text-crimson"
                          title="Remove Staff"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Add New Staff Member */}
          <form onSubmit={handleAddStaff} className="add-staff-form mt-4">
            <h4>Add New Staff Member</h4>
            <div className="add-staff-inputs">
              <input 
                type="text" 
                placeholder="Staff Name (e.g. Rahul)" 
                value={newName} 
                onChange={(e) => setNewName(e.target.value)}
                className="add-input"
                required
              />
              <input 
                type="text" 
                maxLength={6}
                placeholder="4-Digit PIN (e.g. 9988)" 
                value={newPin} 
                onChange={(e) => setNewPin(e.target.value.replace(/[^0-9]/g, ''))}
                className="add-input pin-field"
                required
              />
              <button type="submit" className="btn btn-primary btn-add-staff">
                <Plus size={16} />
                <span>Add</span>
              </button>
            </div>
          </form>
        </div>

        <div className="modal-footer">
          <button type="button" onClick={onClose} className="btn btn-secondary">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
