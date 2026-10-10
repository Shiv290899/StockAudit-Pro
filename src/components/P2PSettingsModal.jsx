import React, { useState } from 'react';
import { X, Wifi, Radio, Copy, Check, Users, ShieldCheck, ArrowRight, RefreshCw, QrCode } from 'lucide-react';

export default function P2PSettingsModal({ 
  roomCode, 
  isHost, 
  connectedCount, 
  p2pStatus, 
  onJoinRoom, 
  onRegenerateRoom,
  onClose 
}) {
  const [inputCode, setInputCode] = useState('');
  const [copied, setCopied] = useState(false);

  const joinUrl = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleJoinSubmit = (e) => {
    e.preventDefault();
    if (!inputCode.trim()) return;
    onJoinRoom(inputCode.trim().toUpperCase());
    onClose();
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card max-w-md">
        <div className="modal-header">
          <div className="modal-title-with-icon">
            <Radio className="text-cyan" size={20} />
            <h3>Zero-Setup Live Sync (P2P)</h3>
          </div>
          <button type="button" onClick={onClose} className="icon-btn">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {/* Status Indicator */}
          <div className="p2p-status-pill mb-3">
            <span className={`status-dot ${p2pStatus === 'connected' ? 'dot-active' : 'dot-idle'}`}></span>
            <span>
              {p2pStatus === 'connected' 
                ? isHost 
                  ? `Live Host Active (${connectedCount} Staff Devices Connected)`
                  : 'Connected to Owner Host (Live)'
                : 'Waiting for Connection...'}
            </span>
          </div>

          {isHost ? (
            /* OWNER HOST VIEW */
            <div className="p2p-host-section">
              <div className="room-code-hero">
                <span className="room-label">YOUR AUDIT ROOM CODE</span>
                <strong className="room-code-display">{roomCode}</strong>
                <p className="room-subtext">Share this 4-digit code with staff to sync their scans live.</p>
              </div>

              {/* Direct Link Share */}
              <div className="share-link-box mt-3">
                <div className="link-text-preview">{joinUrl}</div>
                <button type="button" onClick={handleCopyLink} className="btn-copy">
                  {copied ? <Check size={14} className="text-emerald" /> : <Copy size={14} />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>

              {/* QR Code preview for quick mobile camera scan */}
              <div className="qr-preview-box mt-3">
                <div className="qr-frame">
                  <img 
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(joinUrl)}`}
                    alt="Scan to join audit"
                    className="qr-image"
                  />
                </div>
                <p className="qr-hint">Staff can scan this QR code with their phone camera to join instantly!</p>
              </div>

              <div className="host-actions-row mt-3">
                <button type="button" onClick={onRegenerateRoom} className="text-btn text-cyan">
                  <RefreshCw size={13} className="inline mr-1" />
                  Generate New Room Code
                </button>
              </div>
            </div>
          ) : (
            /* STAFF CLIENT VIEW */
            <div className="p2p-client-section">
              <form onSubmit={handleJoinSubmit} className="join-room-form">
                <label className="join-label">Enter 4-Digit Owner Room Code:</label>
                <div className="join-input-row">
                  <input 
                    type="text" 
                    maxLength={6}
                    value={inputCode}
                    onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                    placeholder="e.g. 7291"
                    className="room-input-field"
                    autoFocus
                  />
                  <button type="submit" className="btn btn-primary btn-join">
                    <span>Connect</span>
                    <ArrowRight size={15} />
                  </button>
                </div>
              </form>

              <div className="info-banner mt-3">
                <p>
                  Ask the Owner for the 4-digit code displayed on their screen, or scan the QR code on the Owner's screen.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" onClick={onClose} className="btn btn-secondary">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
