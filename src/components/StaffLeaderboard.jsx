import React from 'react';
import { Users, Zap, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';

export default function StaffLeaderboard({ staffStats, recentEvents, totalTarget, verifiedCount }) {
  const staffList = Object.entries(staffStats).sort((a, b) => b[1].count - a[1].count);

  return (
    <div className="analytics-sidebar-grid">
      {/* Staff Leaderboard Card */}
      <div className="card glass-card leaderboard-card">
        <div className="card-header">
          <div className="header-title">
            <Users size={18} className="text-cyan" />
            <h3>Live Staff Leaderboard</h3>
          </div>
          <span className="live-pill">
            <span className="dot pulse"></span>
            SYNCED
          </span>
        </div>

        {staffList.length === 0 ? (
          <div className="empty-substate">
            <p>No scans recorded yet. Staff members start scanning to appear on the board.</p>
          </div>
        ) : (
          <div className="staff-metrics-list">
            {staffList.map(([name, data], idx) => {
              const percentage = totalTarget > 0 ? Math.round((data.count / totalTarget) * 100) : 0;
              return (
                <div key={name} className="staff-metric-item">
                  <div className="staff-metric-header">
                    <div className="staff-identity">
                      <span className={`staff-badge rank-${idx + 1}`}>#{idx + 1}</span>
                      <strong className="staff-name">{name}</strong>
                    </div>
                    <div className="staff-count-tag">
                      <span className="count-number">{data.count}</span>
                      <span className="count-label">vehicles</span>
                    </div>
                  </div>
                  <div className="staff-progress-rail">
                    <div 
                      className="staff-progress-fill" 
                      style={{ width: `${Math.min(100, Math.max(8, (data.count / (verifiedCount || 1)) * 100))}%` }}
                    ></div>
                  </div>
                  <div className="staff-subinfo">
                    <span>Last: {data.lastActive ? new Date(data.lastActive).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Just now'}</span>
                    <span>{percentage}% of total</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Live Scan Activity Stream */}
      <div className="card glass-card live-feed-card">
        <div className="card-header">
          <div className="header-title">
            <Zap size={18} className="text-emerald" />
            <h3>Live Activity Feed</h3>
          </div>
          <span className="badge-neutral">{recentEvents.length} events</span>
        </div>

        {recentEvents.length === 0 ? (
          <div className="empty-substate">
            <Clock size={24} className="text-muted" />
            <p>Awaiting first barcode scan...</p>
          </div>
        ) : (
          <div className="live-feed-list">
            {recentEvents.slice(0, 8).map((evt, index) => {
              const isMatch = evt.status === 'verified';
              const isMismatch = evt.status === 'mismatch';
              const isDuplicate = evt.status === 'duplicate';
              const isUnexpected = evt.status === 'unexpected';

              let badgeClass = 'status-badge-verified';
              let badgeText = 'VERIFIED';
              if (isMismatch) {
                badgeClass = 'status-badge-mismatch';
                badgeText = 'LOCATION MISMATCH';
              } else if (isDuplicate) {
                badgeClass = 'status-badge-duplicate';
                badgeText = 'DUPLICATE SCAN';
              } else if (isUnexpected) {
                badgeClass = 'status-badge-unexpected';
                badgeText = 'UNEXPECTED';
              }

              return (
                <div key={evt.id || index} className={`feed-item ${index === 0 ? 'flash-enter' : ''}`}>
                  <div className="feed-item-top">
                    <span className="feed-chassis">{evt.chassisNo}</span>
                    <span className={`status-badge ${badgeClass}`}>{badgeText}</span>
                  </div>
                  <div className="feed-item-bottom">
                    <span className="feed-staff">👤 {evt.scannedBy || 'Staff'}</span>
                    <span className="feed-model">{evt.model || 'Floor Vehicle'}</span>
                    <span className="feed-time">
                      {new Date(evt.scannedAt).toLocaleTimeString('en-IN', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                      })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
