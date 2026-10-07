import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Upload, FileSpreadsheet, QrCode, Search, CheckCircle2, 
  AlertTriangle, XCircle, RefreshCw, Download, Settings, 
  Volume2, VolumeX, ShieldCheck, MapPin, User, ChevronRight, 
  BarChart3, Layers, PlusCircle, Sparkles, AlertOctagon, HelpCircle
} from 'lucide-react';
import confetti from 'canvas-confetti';

import { parseStockExcel, exportAuditReport, normalizeChassis } from './utils/excelParser';
import { playSuccessBeep, playWarningBeep, playDuplicateBuzz, playErrorBeep } from './utils/soundFx';
import { AuditSyncService, getSavedFirebaseConfig } from './utils/syncEngine';
import CameraScanner from './components/CameraScanner';
import StaffLeaderboard from './components/StaffLeaderboard';
import FirebaseSettingsModal from './components/FirebaseSettingsModal';

const DEFAULT_STAFF_LIST = ['Divya (Staff)', 'Ramesh (Audit)', 'Suresh (Godown)', 'Kiran (Inventory)', 'Admin'];
const DEFAULT_LOCATIONS = ['SURYA SHOWROOM', 'RUMI MOTORS', 'MAIN GODOWN', 'SERVICE YARD'];

export default function App() {
  // Session & Stock state
  const [sessionName, setSessionName] = useState('October 2026 Vehicle Audit');
  const [vehicles, setVehicles] = useState([]);
  const [unexpectedScans, setUnexpectedScans] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [filterOnlyStock, setFilterOnlyStock] = useState(true);

  // Active User Profile
  const [currentStaff, setCurrentStaff] = useState('Divya (Staff)');
  const [currentLocation, setCurrentLocation] = useState('SURYA SHOWROOM');
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Scan input & camera
  const [scanInput, setScanInput] = useState('');
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [lastScanResult, setLastScanResult] = useState(null);

  // Table Filters
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'pending' | 'verified' | 'mismatch' | 'unexpected'
  const [searchTerm, setSearchTerm] = useState('');

  // Modals & Real-time
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [recentEvents, setRecentEvents] = useState([]);
  const syncServiceRef = useRef(null);
  const scanInputRef = useRef(null);

  // Auto-focus input on desktop for continuous barcode gun scanning
  useEffect(() => {
    const handleKeyDown = (e) => {
      // If pressing Enter or typing while not in an input, focus scanInput
      if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
          if (scanInputRef.current) {
            scanInputRef.current.focus();
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Initialize Real-time synchronization
  useEffect(() => {
    const sessionId = sessionName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    
    syncServiceRef.current = new AuditSyncService(sessionId, (remoteData) => {
      if (remoteData.type === 'SCAN_EVENT') {
        applyRemoteScan(remoteData.payload);
      } else if (remoteData.type === 'FIREBASE_SNAPSHOT') {
        applyFirebaseSnapshot(remoteData.payload);
      }
    });

    return () => {
      if (syncServiceRef.current) {
        syncServiceRef.current.destroy();
      }
    };
  }, [sessionName]);

  // Fast O(1) map for instant chassis lookups
  const vehicleMap = useMemo(() => {
    const map = new Map();
    vehicles.forEach((v) => {
      map.set(v.normalizedChassis, v);
    });
    return map;
  }, [vehicles]);

  // Calculate live statistics
  const stats = useMemo(() => {
    const total = vehicles.length;
    const verified = vehicles.filter(v => v.status === 'verified').length;
    const mismatch = vehicles.filter(v => v.status === 'mismatch').length;
    const pending = vehicles.filter(v => v.status === 'pending').length;
    const totalFound = verified + mismatch;
    const percentage = total > 0 ? Math.round((totalFound / total) * 100) : 0;

    // Staff breakdown counts
    const staffBreakdown = {};
    vehicles.forEach(v => {
      if (v.scannedBy && (v.status === 'verified' || v.status === 'mismatch')) {
        if (!staffBreakdown[v.scannedBy]) {
          staffBreakdown[v.scannedBy] = { count: 0, lastActive: v.scannedAt };
        }
        staffBreakdown[v.scannedBy].count += 1;
        if (v.scannedAt > (staffBreakdown[v.scannedBy].lastActive || 0)) {
          staffBreakdown[v.scannedBy].lastActive = v.scannedAt;
        }
      }
    });

    // Also include unexpected scans in staff counts
    unexpectedScans.forEach(u => {
      if (u.scannedBy) {
        if (!staffBreakdown[u.scannedBy]) {
          staffBreakdown[u.scannedBy] = { count: 0, lastActive: u.scannedAt };
        }
        staffBreakdown[u.scannedBy].count += 1;
      }
    });

    return { total, verified, mismatch, pending, totalFound, percentage, staffBreakdown };
  }, [vehicles, unexpectedScans]);

  // Trigger celebration confetti when reaching 100%
  useEffect(() => {
    if (stats.total > 0 && stats.totalFound === stats.total) {
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 }
      });
    }
  }, [stats.totalFound, stats.total]);

  // Load sample data bundled with real Yamaha Oct 7, 2026 data
  const handleLoadSample = async () => {
    try {
      setIsLoadingFile(true);
      const res = await fetch('/sample-stock.xlsx');
      const buffer = await res.arrayBuffer();
      const parsed = await parseStockExcel(buffer, filterOnlyStock);
      setVehicles(parsed.vehicles);
      setUnexpectedScans([]);
      setRecentEvents([]);
      setIsLoaded(true);
      setSessionName(`Yamaha Stock Audit — ${new Date().toLocaleDateString('en-IN')}`);
      setIsLoadingFile(false);
    } catch (err) {
      console.error('Failed to load sample stock:', err);
      alert('Error loading sample stock: ' + err.message);
      setIsLoadingFile(false);
    }
  };

  // Handle file upload
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsLoadingFile(true);
      const parsed = await parseStockExcel(file, filterOnlyStock);
      setVehicles(parsed.vehicles);
      setUnexpectedScans([]);
      setRecentEvents([]);
      setIsLoaded(true);
      setSessionName(`${file.name.replace(/\.[^/.]+$/, '')} Audit`);
      setIsLoadingFile(false);
    } catch (err) {
      console.error('Excel parse error:', err);
      alert('Failed to parse Excel file: ' + err.message);
      setIsLoadingFile(false);
    }
  };

  // Remote scan event handler
  const applyRemoteScan = (scanEvent) => {
    setRecentEvents(prev => [scanEvent, ...prev.slice(0, 20)]);

    if (scanEvent.status === 'unexpected') {
      setUnexpectedScans(prev => {
        if (prev.some(u => u.normalizedChassis === scanEvent.normalizedChassis)) return prev;
        return [scanEvent, ...prev];
      });
      return;
    }

    setVehicles(prev => prev.map(v => {
      if (v.normalizedChassis === scanEvent.normalizedChassis) {
        return {
          ...v,
          status: scanEvent.status,
          scannedAt: scanEvent.scannedAt,
          scannedBy: scanEvent.scannedBy,
          scannedLocation: scanEvent.scannedLocation
        };
      }
      return v;
    }));
  };

  const applyFirebaseSnapshot = (data) => {
    if (!data) return;
    if (data.recentScans) {
      setRecentEvents(data.recentScans.slice(0, 25));
    }
    if (data.scannedMap) {
      setVehicles(prev => prev.map(v => {
        const remoteRecord = data.scannedMap[v.normalizedChassis];
        if (remoteRecord) {
          return {
            ...v,
            status: remoteRecord.status,
            scannedAt: remoteRecord.scannedAt,
            scannedBy: remoteRecord.scannedBy,
            scannedLocation: remoteRecord.scannedLocation
          };
        }
        return v;
      }));
    }
  };

  // Process a chassis scan (from Camera, Hardware Gun, or Manual)
  const processScan = (rawText) => {
    const normalized = normalizeChassis(rawText);
    if (!normalized || normalized.length < 3) return;

    const existing = vehicleMap.get(normalized);
    const now = Date.now();

    // Case 1: Chassis exists in stock list
    if (existing) {
      // Check if already scanned
      if (existing.status === 'verified' || existing.status === 'mismatch') {
        if (soundEnabled) playDuplicateBuzz();
        const alertObj = {
          type: 'duplicate',
          message: `Already scanned by ${existing.scannedBy || 'Staff'} at ${new Date(existing.scannedAt).toLocaleTimeString('en-IN')}`,
          vehicle: existing
        };
        setLastScanResult(alertObj);
        return;
      }

      // Check location match
      const isLocMismatch = existing.location && 
        currentLocation && 
        !existing.location.includes(currentLocation) && 
        !currentLocation.includes(existing.location);

      const status = isLocMismatch ? 'mismatch' : 'verified';

      const scanEvent = {
        id: `${normalized}_${now}`,
        chassisNo: existing.chassisNo,
        normalizedChassis: normalized,
        model: existing.model,
        colour: existing.colour,
        expectedLocation: existing.location,
        scannedLocation: currentLocation,
        scannedBy: currentStaff,
        scannedAt: now,
        status
      };

      // Play audio feedback
      if (soundEnabled) {
        if (isLocMismatch) {
          playWarningBeep();
        } else {
          playSuccessBeep();
        }
      }

      // Optimistic instant state update
      setVehicles(prev => prev.map(v => {
        if (v.normalizedChassis === normalized) {
          return {
            ...v,
            status,
            scannedAt: now,
            scannedBy: currentStaff,
            scannedLocation: currentLocation
          };
        }
        return v;
      }));

      setRecentEvents(prev => [scanEvent, ...prev.slice(0, 20)]);
      setLastScanResult({
        type: status,
        message: isLocMismatch 
          ? `LOCATION MISMATCH: Recorded at ${existing.location}, but found at ${currentLocation}!`
          : `VERIFIED: ${existing.model} (${existing.colour}) matched!`,
        vehicle: existing
      });

      // Broadcast to other devices
      if (syncServiceRef.current) {
        syncServiceRef.current.broadcastScan(scanEvent);
      }

      return;
    }

    // Case 2: Chassis NOT found in uploaded stock
    if (soundEnabled) playErrorBeep();

    const alreadyUnexpected = unexpectedScans.find(u => u.normalizedChassis === normalized);
    if (alreadyUnexpected) {
      setLastScanResult({
        type: 'duplicate',
        message: `Already logged unexpected vehicle: ${rawText}`,
        vehicle: { chassisNo: rawText }
      });
      return;
    }

    const unexpectedEvent = {
      id: `${normalized}_${now}`,
      chassisNo: rawText.trim().toUpperCase(),
      normalizedChassis: normalized,
      model: 'Unknown / Surplus Floor Unit',
      scannedLocation: currentLocation,
      scannedBy: currentStaff,
      scannedAt: now,
      status: 'unexpected'
    };

    setUnexpectedScans(prev => [unexpectedEvent, ...prev]);
    setRecentEvents(prev => [unexpectedEvent, ...prev.slice(0, 20)]);
    setLastScanResult({
      type: 'unexpected',
      message: `UNEXPECTED VEHICLE: Chassis ${rawText} not found in uploaded stock list!`,
      vehicle: { chassisNo: rawText }
    });

    if (syncServiceRef.current) {
      syncServiceRef.current.broadcastScan(unexpectedEvent);
    }
  };

  const handleManualScanSubmit = (e) => {
    e.preventDefault();
    if (!scanInput.trim()) return;
    processScan(scanInput);
    setScanInput('');
  };

  const handleExport = () => {
    if (!isLoaded || vehicles.length === 0) return;
    exportAuditReport({
      name: sessionName,
      createdAt: Date.now(),
      vehicles,
      unexpectedScans,
      currentStaff
    });
  };

  // Filtered vehicles for table view
  const filteredVehicles = useMemo(() => {
    let list = vehicles;

    if (activeTab === 'pending') {
      list = list.filter(v => v.status === 'pending');
    } else if (activeTab === 'verified') {
      list = list.filter(v => v.status === 'verified');
    } else if (activeTab === 'mismatch') {
      list = list.filter(v => v.status === 'mismatch');
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(v => 
        v.chassisNo.toLowerCase().includes(q) ||
        v.model.toLowerCase().includes(q) ||
        v.colour.toLowerCase().includes(q) ||
        (v.engineNo && v.engineNo.toLowerCase().includes(q))
      );
    }

    return list;
  }, [vehicles, activeTab, searchTerm]);

  return (
    <div className="app-layout">
      {/* Top Navbar */}
      <header className="navbar">
        <div className="nav-left">
          <div className="brand-logo">
            <span className="logo-icon">⚡</span>
            <div className="brand-titles">
              <h1>StockAudit Pro</h1>
              <span className="brand-subtitle">High-Speed Real-Time Inventory Tally</span>
            </div>
          </div>
        </div>

        <div className="nav-center">
          {isLoaded && (
            <div className="session-pill">
              <span className="session-dot"></span>
              <span className="session-title">{sessionName}</span>
            </div>
          )}
        </div>

        <div className="nav-right">
          {/* Staff Selector */}
          <div className="control-selector">
            <User size={16} className="text-cyan" />
            <select 
              value={currentStaff} 
              onChange={(e) => setCurrentStaff(e.target.value)}
              className="styled-select"
            >
              {DEFAULT_STAFF_LIST.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>

          {/* Location Selector */}
          <div className="control-selector">
            <MapPin size={16} className="text-emerald" />
            <select 
              value={currentLocation} 
              onChange={(e) => setCurrentLocation(e.target.value)}
              className="styled-select"
            >
              {DEFAULT_LOCATIONS.map(loc => (
                <option key={loc} value={loc}>{loc}</option>
              ))}
            </select>
          </div>

          {/* Sound Mute Toggle */}
          <button 
            type="button" 
            onClick={() => setSoundEnabled(!soundEnabled)} 
            className={`icon-btn ${soundEnabled ? 'active-sound' : 'muted-sound'}`}
            title={soundEnabled ? 'Audio Feedback Enabled (Click to Mute)' : 'Audio Feedback Muted'}
          >
            {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>

          {/* Cloud Settings */}
          <button 
            type="button" 
            onClick={() => setIsSettingsOpen(true)} 
            className="icon-btn" 
            title="Real-Time Cloud Sync Settings"
          >
            <Settings size={18} />
          </button>

          {/* Export Report */}
          {isLoaded && (
            <button 
              type="button" 
              onClick={handleExport} 
              className="btn btn-primary export-btn"
            >
              <Download size={16} />
              <span>Export Report</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="main-content">
        {!isLoaded ? (
          /* Empty / Upload State */
          <div className="upload-container">
            <div className="upload-hero-card glass-card">
              <div className="upload-icon-circle">
                <FileSpreadsheet size={44} className="text-cyan" />
              </div>
              <h2>Start Physical Stock Audit</h2>
              <p className="upload-desc">
                Upload your master Excel stock sheet (e.g. <code>STOCK 07.10.2026.xlsx</code>) or load sample Yamaha data to start rapid scanning.
              </p>

              <div className="upload-dropzone">
                <input 
                  type="file" 
                  id="excel-file-input" 
                  accept=".xlsx, .xls, .csv" 
                  onChange={handleFileUpload} 
                  className="file-input-hidden" 
                />
                <label htmlFor="excel-file-input" className="dropzone-label">
                  <Upload size={36} className="text-cyan mb-2" />
                  <strong>Click to browse or drag & drop Excel (.xlsx)</strong>
                  <span className="file-hint">Automatically parses CHASIS NO, MODEL, COLOUR & LOCATION</span>
                </label>
              </div>

              <div className="filter-checkbox-row">
                <label className="toggle-label">
                  <input 
                    type="checkbox" 
                    checked={filterOnlyStock} 
                    onChange={(e) => setFilterOnlyStock(e.target.checked)} 
                  />
                  <span>Automatically exclude vehicles marked as "SOLD" in Excel</span>
                </label>
              </div>

              <div className="divider-row">
                <span>OR TRY INSTANTLY</span>
              </div>

              <button 
                type="button" 
                onClick={handleLoadSample} 
                disabled={isLoadingFile}
                className="btn btn-secondary load-sample-btn"
              >
                <Sparkles size={18} className="text-amber" />
                <span>{isLoadingFile ? 'Parsing Excel Data...' : '⚡ Load Sample Stock File (Oct 7, 2026 Yamaha Data)'}</span>
              </button>
            </div>
          </div>
        ) : (
          /* Active Audit Workspace */
          <div className="workspace-grid">
            {/* Top KPI Metrics Banner */}
            <div className="kpi-banner">
              <div className="kpi-card total-card">
                <span className="kpi-title">TOTAL STOCK</span>
                <strong className="kpi-value">{stats.total}</strong>
                <span className="kpi-sub">Vehicles Expected</span>
              </div>

              <div className="kpi-card verified-card">
                <div className="kpi-header-row">
                  <span className="kpi-title">PHYSICALLY VERIFIED</span>
                  <span className="kpi-badge-pct">{stats.percentage}%</span>
                </div>
                <strong className="kpi-value text-emerald">{stats.totalFound}</strong>
                <div className="kpi-progress-bar">
                  <div 
                    className="kpi-progress-fill bg-emerald" 
                    style={{ width: `${stats.percentage}%` }}
                  ></div>
                </div>
              </div>

              <div className="kpi-card pending-card">
                <span className="kpi-title">PENDING / MISSING</span>
                <strong className="kpi-value text-amber">{stats.pending}</strong>
                <span className="kpi-sub">Awaiting Physical Scan</span>
              </div>

              <div className="kpi-card mismatch-card">
                <span className="kpi-title">LOCATION MISMATCH</span>
                <strong className="kpi-value text-crimson">{stats.mismatch}</strong>
                <span className="kpi-sub">Wrong Branch/Godown</span>
              </div>

              <div className="kpi-card unexpected-card">
                <span className="kpi-title">UNEXPECTED ON FLOOR</span>
                <strong className="kpi-value text-purple">{unexpectedScans.length}</strong>
                <span className="kpi-sub">Not in Stock Sheet</span>
              </div>
            </div>

            {/* High-Speed Scanning Station */}
            <div className="scan-station-card glass-card">
              <div className="scan-header">
                <div className="scan-station-title">
                  <span className="laser-dot"></span>
                  <h2>Rapid-Fire Scanning Station</h2>
                </div>
                <div className="scan-station-status">
                  <span className="badge-location">📍 {currentLocation}</span>
                  <span className="badge-user">👤 Auditing as: <strong>{currentStaff}</strong></span>
                </div>
              </div>

              <form onSubmit={handleManualScanSubmit} className="scan-input-form">
                <div className="scan-input-wrapper">
                  <Search size={22} className="scan-icon" />
                  <input
                    ref={scanInputRef}
                    type="text"
                    value={scanInput}
                    onChange={(e) => setScanInput(e.target.value)}
                    placeholder="Scan VIN / Chassis Barcode (or type 17-digit Chassis No & hit Enter)..."
                    className="scan-text-input"
                    autoFocus
                  />
                  {scanInput && (
                    <button 
                      type="button" 
                      onClick={() => setScanInput('')} 
                      className="clear-input-btn"
                    >
                      ×
                    </button>
                  )}
                </div>

                <button 
                  type="submit" 
                  className="btn btn-primary submit-scan-btn"
                >
                  Verify Chassis
                </button>

                <button 
                  type="button" 
                  onClick={() => setIsCameraOpen(true)} 
                  className="btn btn-camera-pulse"
                >
                  <QrCode size={20} />
                  <span>Launch Camera</span>
                </button>
              </form>

              {/* Dynamic Scan Result Banner */}
              {lastScanResult && (
                <div className={`scan-feedback-banner feedback-${lastScanResult.type} animate-slide-down`}>
                  <div className="feedback-icon">
                    {lastScanResult.type === 'verified' && <CheckCircle2 size={26} className="text-emerald" />}
                    {lastScanResult.type === 'mismatch' && <AlertTriangle size={26} className="text-amber" />}
                    {lastScanResult.type === 'duplicate' && <AlertOctagon size={26} className="text-crimson" />}
                    {lastScanResult.type === 'unexpected' && <HelpCircle size={26} className="text-purple" />}
                  </div>
                  <div className="feedback-text">
                    <strong className="feedback-heading">{lastScanResult.message}</strong>
                    {lastScanResult.vehicle && (
                      <span className="feedback-details">
                        Chassis: <code>{lastScanResult.vehicle.chassisNo}</code>
                        {lastScanResult.vehicle.model && ` • Model: ${lastScanResult.vehicle.model}`}
                        {lastScanResult.vehicle.colour && ` • Colour: ${lastScanResult.vehicle.colour}`}
                        {lastScanResult.vehicle.location && ` • Expected: ${lastScanResult.vehicle.location}`}
                      </span>
                    )}
                  </div>
                  <button 
                    type="button" 
                    onClick={() => setLastScanResult(null)} 
                    className="feedback-dismiss"
                  >
                    ×
                  </button>
                </div>
              )}
            </div>

            {/* Split Content: Table & Leaderboard */}
            <div className="content-split-grid">
              {/* Left Column: Data Table & Filters */}
              <div className="table-section-card glass-card">
                <div className="table-controls">
                  <div className="table-tabs">
                    <button 
                      type="button" 
                      onClick={() => setActiveTab('all')} 
                      className={`tab-btn ${activeTab === 'all' ? 'active' : ''}`}
                    >
                      All Stock ({vehicles.length})
                    </button>
                    <button 
                      type="button" 
                      onClick={() => setActiveTab('pending')} 
                      className={`tab-btn ${activeTab === 'pending' ? 'active' : ''}`}
                    >
                      Missing ({stats.pending})
                    </button>
                    <button 
                      type="button" 
                      onClick={() => setActiveTab('verified')} 
                      className={`tab-btn ${activeTab === 'verified' ? 'active' : ''}`}
                    >
                      Verified ({stats.verified})
                    </button>
                    <button 
                      type="button" 
                      onClick={() => setActiveTab('mismatch')} 
                      className={`tab-btn ${activeTab === 'mismatch' ? 'active' : ''}`}
                    >
                      Location Mismatch ({stats.mismatch})
                    </button>
                    {unexpectedScans.length > 0 && (
                      <button 
                        type="button" 
                        onClick={() => setActiveTab('unexpected')} 
                        className={`tab-btn ${activeTab === 'unexpected' ? 'active' : ''}`}
                      >
                        Unexpected ({unexpectedScans.length})
                      </button>
                    )}
                  </div>

                  <div className="table-search-box">
                    <Search size={16} className="search-icon-sm" />
                    <input 
                      type="text" 
                      value={searchTerm} 
                      onChange={(e) => setSearchTerm(e.target.value)} 
                      placeholder="Search chassis, model, colour..." 
                      className="table-search-input" 
                    />
                  </div>
                </div>

                {/* Table Content */}
                <div className="table-responsive-wrapper">
                  {activeTab === 'unexpected' ? (
                    /* Unexpected Vehicles Table */
                    <table className="audit-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Chassis No Scanned</th>
                          <th>Audited Location</th>
                          <th>Scanned By</th>
                          <th>Timestamp</th>
                          <th>Remarks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {unexpectedScans.map((u, i) => (
                          <tr key={u.id || i} className="row-unexpected">
                            <td>{i + 1}</td>
                            <td><code className="chassis-pill">{u.chassisNo}</code></td>
                            <td>{u.scannedLocation}</td>
                            <td><strong>{u.scannedBy}</strong></td>
                            <td>{new Date(u.scannedAt).toLocaleTimeString('en-IN')}</td>
                            <td><span className="badge-purple">Not found in stock sheet</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    /* Main Vehicles Table */
                    <table className="audit-table">
                      <thead>
                        <tr>
                          <th>Status</th>
                          <th>Chassis Number</th>
                          <th>Model & Colour</th>
                          <th>Expected Location</th>
                          <th>Audited Location</th>
                          <th>Verified By</th>
                          <th>Scan Time</th>
                          <th>Quick Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredVehicles.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="empty-table-cell">
                              No vehicles match the selected filter.
                            </td>
                          </tr>
                        ) : (
                          filteredVehicles.slice(0, 100).map((v) => {
                            const isVerified = v.status === 'verified';
                            const isMismatch = v.status === 'mismatch';
                            const isPending = v.status === 'pending';

                            return (
                              <tr 
                                key={v.id} 
                                className={`row-${v.status} ${lastScanResult?.vehicle?.id === v.id ? 'highlight-row' : ''}`}
                              >
                                <td>
                                  {isVerified && <span className="status-badge status-badge-verified">✓ VERIFIED</span>}
                                  {isMismatch && <span className="status-badge status-badge-mismatch">⚠️ MISMATCH</span>}
                                  {isPending && <span className="status-badge status-badge-pending">PENDING</span>}
                                </td>
                                <td>
                                  <code className="chassis-pill">{v.chassisNo}</code>
                                </td>
                                <td>
                                  <div className="model-cell">
                                    <strong>{v.model}</strong>
                                    {v.colour && <span className="colour-tag">{v.colour}</span>}
                                  </div>
                                </td>
                                <td>{v.location}</td>
                                <td>{v.scannedLocation || '—'}</td>
                                <td>{v.scannedBy ? <strong>{v.scannedBy}</strong> : '—'}</td>
                                <td>{v.scannedAt ? new Date(v.scannedAt).toLocaleTimeString('en-IN') : '—'}</td>
                                <td>
                                  {isPending ? (
                                    <button 
                                      type="button" 
                                      onClick={() => processScan(v.chassisNo)} 
                                      className="action-btn verify-now-btn"
                                      title="Manually Mark as Verified"
                                    >
                                      Verify
                                    </button>
                                  ) : (
                                    <button 
                                      type="button" 
                                      onClick={() => {
                                        setVehicles(prev => prev.map(item => item.id === v.id ? { ...item, status: 'pending', scannedAt: null, scannedBy: null } : item));
                                      }} 
                                      className="action-btn undo-btn"
                                      title="Reset to Pending"
                                    >
                                      Undo
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  )}
                </div>
                {filteredVehicles.length > 100 && (
                  <div className="table-pagination-note">
                    Showing first 100 of {filteredVehicles.length} vehicles. Use search bar to pinpoint any chassis number.
                  </div>
                )}
              </div>

              {/* Right Column: Live Leaderboard & Live Stream */}
              <StaffLeaderboard 
                staffStats={stats.staffBreakdown}
                recentEvents={recentEvents}
                totalTarget={stats.total}
                verifiedCount={stats.totalFound}
              />
            </div>
          </div>
        )}
      </main>

      {/* Camera Scanner Modal */}
      {isCameraOpen && (
        <CameraScanner 
          onScan={(decoded) => {
            processScan(decoded);
          }}
          onClose={() => setIsCameraOpen(false)}
        />
      )}

      {/* Cloud Settings Modal */}
      {isSettingsOpen && (
        <FirebaseSettingsModal 
          onClose={() => setIsSettingsOpen(false)}
          onSave={() => {
            // Re-trigger sync reconnect
            const sessionId = sessionName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
            if (syncServiceRef.current) syncServiceRef.current.destroy();
            syncServiceRef.current = new AuditSyncService(sessionId, (remoteData) => {
              if (remoteData.type === 'SCAN_EVENT') applyRemoteScan(remoteData.payload);
            });
          }}
        />
      )}
    </div>
  );
}
