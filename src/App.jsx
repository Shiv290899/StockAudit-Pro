import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Upload, FileSpreadsheet, QrCode, Search, CheckCircle2, 
  AlertTriangle, XCircle, RefreshCw, Download, Settings, 
  Volume2, VolumeX, ShieldCheck, MapPin, User, ChevronRight, 
  BarChart3, Layers, PlusCircle, Sparkles, AlertOctagon, HelpCircle,
  LayoutGrid, ListFilter, Camera, KeyRound, LogOut, Shield, Users, Lock, Radio, Wifi
} from 'lucide-react';
import confetti from 'canvas-confetti';

import { parseStockExcel, exportAuditReport, normalizeChassis } from './utils/excelParser';
import { playSuccessBeep, playWarningBeep, playDuplicateBuzz, playErrorBeep } from './utils/soundFx';
import { getStaffRoster, getActiveUser, setActiveUser } from './utils/authStore';
import { P2PSyncService, generateRoomCode } from './utils/p2pSync';

import CameraScanner from './components/CameraScanner';
import StaffLeaderboard from './components/StaffLeaderboard';
import OwnerStaffManagerModal from './components/OwnerStaffManagerModal';
import StaffPinModal from './components/StaffPinModal';
import LoginModal from './components/LoginModal';
import P2PSettingsModal from './components/P2PSettingsModal';

const DEFAULT_LOCATIONS = ['SURYA SHOWROOM', 'RUMI MOTORS', 'MAIN GODOWN', 'SERVICE YARD'];
const LOCAL_STORAGE_STOCK_KEY = 'stockaudit_vehicles_data';
const LOCAL_STORAGE_SESSION_KEY = 'stockaudit_session_name';
const LOCAL_STORAGE_ROOM_KEY = 'stockaudit_p2p_room';

export default function App() {
  // Authentication & Role
  const [currentUser, setCurrentUser] = useState(getActiveUser() || { role: 'owner', name: 'Owner / Admin' });
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  
  // Staff Roster & PIN verification
  const [roster, setRoster] = useState(getStaffRoster());
  const [selectedStaffToAuth, setSelectedStaffToAuth] = useState(null);
  const [isStaffManagerOpen, setIsStaffManagerOpen] = useState(false);

  // Active auditor details
  const [activeStaffName, setActiveStaffName] = useState('Divya');
  const [currentLocation, setCurrentLocation] = useState('SURYA SHOWROOM');
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Stock Session state
  const [sessionName, setSessionName] = useState(() => {
    return localStorage.getItem(LOCAL_STORAGE_SESSION_KEY) || 'October 2026 Vehicle Audit';
  });
  const [vehicles, setVehicles] = useState(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_STOCK_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [unexpectedScans, setUnexpectedScans] = useState([]);
  const [isLoaded, setIsLoaded] = useState(() => vehicles.length > 0);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [filterOnlyStock, setFilterOnlyStock] = useState(true);

  // Scanner state
  const [scanInput, setScanInput] = useState('');
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [lastScanResult, setLastScanResult] = useState(null);

  // View & Filter modes
  const [viewMode, setViewMode] = useState('cards');
  const [activeTab, setActiveTab] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // P2P Room State
  const [p2pRoomCode, setP2pRoomCode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const roomFromUrl = params.get('room');
    if (roomFromUrl) return roomFromUrl.toUpperCase();
    return localStorage.getItem(LOCAL_STORAGE_ROOM_KEY) || generateRoomCode();
  });
  const [p2pStatus, setP2pStatus] = useState('disconnected');
  const [connectedStaffCount, setConnectedStaffCount] = useState(0);
  const [isP2PModalOpen, setIsP2PModalOpen] = useState(false);

  // Modals & Real-time
  const [recentEvents, setRecentEvents] = useState([]);
  const p2pServiceRef = useRef(null);
  const scanInputRef = useRef(null);

  // Save room code & vehicles to localStorage
  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_ROOM_KEY, p2pRoomCode);
  }, [p2pRoomCode]);

  useEffect(() => {
    if (vehicles.length > 0) {
      try {
        localStorage.setItem(LOCAL_STORAGE_STOCK_KEY, JSON.stringify(vehicles));
        localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, sessionName);
      } catch (e) {
        console.warn('Storage save error:', e);
      }
    }
  }, [vehicles, sessionName]);

  // Initialize P2P Service
  useEffect(() => {
    const isHost = currentUser.role === 'owner';

    if (p2pServiceRef.current) {
      p2pServiceRef.current.destroy();
    }

    p2pServiceRef.current = new P2PSyncService(p2pRoomCode, isHost, {
      onRemoteScan: (scanEvent) => {
        applyRemoteScan(scanEvent);
      },
      onStatusChange: (status, count) => {
        setP2pStatus(status);
        setConnectedStaffCount(count);
      },
      onPeerConnect: (peerId, count) => {
        setConnectedStaffCount(count);
      },
      onPeerDisconnect: (peerId, count) => {
        setConnectedStaffCount(count);
      },
      getInitialState: () => {
        return {
          sessionName,
          vehicles,
          unexpectedScans,
          recentEvents
        };
      },
      onInitialSync: (payload) => {
        if (payload) {
          if (payload.sessionName) setSessionName(payload.sessionName);
          if (payload.vehicles && payload.vehicles.length > 0) {
            setVehicles(payload.vehicles);
            setIsLoaded(true);
          }
          if (payload.unexpectedScans) setUnexpectedScans(payload.unexpectedScans);
          if (payload.recentEvents) setRecentEvents(payload.recentEvents);
        }
      }
    });

    return () => {
      if (p2pServiceRef.current) p2pServiceRef.current.destroy();
    };
  }, [p2pRoomCode, currentUser.role]);

  const vehicleMap = useMemo(() => {
    const map = new Map();
    vehicles.forEach((v) => map.set(v.normalizedChassis, v));
    return map;
  }, [vehicles]);

  const stats = useMemo(() => {
    const total = vehicles.length;
    const verified = vehicles.filter(v => v.status === 'verified').length;
    const mismatch = vehicles.filter(v => v.status === 'mismatch').length;
    const pending = vehicles.filter(v => v.status === 'pending').length;
    const totalFound = verified + mismatch;
    const percentage = total > 0 ? Math.round((totalFound / total) * 100) : 0;

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
      alert('Error loading sample stock: ' + err.message);
      setIsLoadingFile(false);
    }
  };

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
      alert('Failed to parse Excel file: ' + err.message);
      setIsLoadingFile(false);
    }
  };

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

  const processScan = (rawText) => {
    const normalized = normalizeChassis(rawText);
    if (!normalized || normalized.length < 3) return;

    const existing = vehicleMap.get(normalized);
    const now = Date.now();

    if (existing) {
      if (existing.status === 'verified' || existing.status === 'mismatch') {
        if (soundEnabled) playDuplicateBuzz();
        setLastScanResult({
          type: 'duplicate',
          message: `Already scanned by ${existing.scannedBy || 'Staff'} at ${new Date(existing.scannedAt).toLocaleTimeString('en-IN')}`,
          vehicle: existing
        });
        return;
      }

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
        scannedBy: activeStaffName,
        scannedAt: now,
        status
      };

      if (soundEnabled) {
        if (isLocMismatch) playWarningBeep();
        else playSuccessBeep();
      }

      setVehicles(prev => prev.map(v => {
        if (v.normalizedChassis === normalized) {
          return {
            ...v,
            status,
            scannedAt: now,
            scannedBy: activeStaffName,
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

      // Broadcast to host and other staff over P2P WebRTC
      if (p2pServiceRef.current) {
        p2pServiceRef.current.broadcastScan(scanEvent);
      }
      return;
    }

    // Unexpected chassis
    if (soundEnabled) playErrorBeep();
    const unexpectedEvent = {
      id: `${normalized}_${now}`,
      chassisNo: rawText.trim().toUpperCase(),
      normalizedChassis: normalized,
      model: 'Unknown / Surplus Floor Unit',
      scannedLocation: currentLocation,
      scannedBy: activeStaffName,
      scannedAt: now,
      status: 'unexpected'
    };

    setUnexpectedScans(prev => [unexpectedEvent, ...prev]);
    setRecentEvents(prev => [unexpectedEvent, ...prev.slice(0, 20)]);
    setLastScanResult({
      type: 'unexpected',
      message: `UNEXPECTED VEHICLE: Chassis ${rawText} not in uploaded stock!`,
      vehicle: { chassisNo: rawText }
    });

    if (p2pServiceRef.current) {
      p2pServiceRef.current.broadcastScan(unexpectedEvent);
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
      currentStaff: currentUser.name || activeStaffName
    });
  };

  const handleResetAudit = () => {
    if (confirm('Are you sure you want to reset this audit session? (You can download the Excel report first).')) {
      localStorage.removeItem(LOCAL_STORAGE_STOCK_KEY);
      localStorage.removeItem(LOCAL_STORAGE_SESSION_KEY);
      setVehicles([]);
      setUnexpectedScans([]);
      setRecentEvents([]);
      setIsLoaded(false);
    }
  };

  const filteredVehicles = useMemo(() => {
    let list = vehicles;
    if (activeTab === 'pending') list = list.filter(v => v.status === 'pending');
    else if (activeTab === 'verified') list = list.filter(v => v.status === 'verified');
    else if (activeTab === 'mismatch') list = list.filter(v => v.status === 'mismatch');

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(v => 
        v.chassisNo.toLowerCase().includes(q) ||
        v.model.toLowerCase().includes(q) ||
        v.colour.toLowerCase().includes(q)
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
              <span className="brand-subtitle">
                {currentUser.role === 'owner' ? '👑 Owner Master Dashboard' : '📱 Staff Scanner Portal'}
              </span>
            </div>
          </div>
        </div>

        <div className="nav-center">
          {/* P2P Live Room Code Badge */}
          <button 
            type="button" 
            onClick={() => setIsP2PModalOpen(true)}
            className={`p2p-badge-btn ${p2pStatus === 'connected' ? 'connected' : 'disconnected'}`}
            title="Click to view P2P Room Code & QR"
          >
            <Radio size={14} className={p2pStatus === 'connected' ? 'text-emerald animate-pulse' : 'text-muted'} />
            <span className="badge-room-label">ROOM:</span>
            <strong>{p2pRoomCode}</strong>
            {currentUser.role === 'owner' && (
              <span className="badge-connected-count">({connectedStaffCount} staff)</span>
            )}
          </button>
        </div>

        <div className="nav-right">
          {/* Active Staff Identity Badge */}
          <div className="control-selector">
            <User size={15} className="text-cyan" />
            <select 
              value={activeStaffName} 
              onChange={(e) => {
                const targetStaff = roster.find(s => s.name === e.target.value);
                if (targetStaff) {
                  setSelectedStaffToAuth(targetStaff);
                }
              }}
              className="styled-select"
            >
              {roster.map(s => (
                <option key={s.id} value={s.name}>{s.name} ({s.role || 'Staff'})</option>
              ))}
            </select>
          </div>

          {/* Location Selector */}
          <div className="control-selector">
            <MapPin size={15} className="text-emerald" />
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

          {/* Owner-Only: Staff & PIN Manager */}
          {currentUser.role === 'owner' && (
            <button 
              type="button" 
              onClick={() => setIsStaffManagerOpen(true)}
              className="icon-btn"
              title="Manage Staff & Secret PIN Codes"
            >
              <KeyRound size={17} className="text-amber" />
            </button>
          )}

          {/* Sound Toggle */}
          <button 
            type="button" 
            onClick={() => setSoundEnabled(!soundEnabled)} 
            className={`icon-btn ${soundEnabled ? 'active-sound' : 'muted-sound'}`}
            title="Audio Feedback"
          >
            {soundEnabled ? <Volume2 size={17} /> : <VolumeX size={17} />}
          </button>

          {/* Export Report (Owner) */}
          {isLoaded && currentUser.role === 'owner' && (
            <button 
              type="button" 
              onClick={handleExport} 
              className="btn btn-primary export-btn"
            >
              <Download size={15} />
              <span className="export-text">Export Report</span>
            </button>
          )}

          {/* Switch Role / Login */}
          <button 
            type="button" 
            onClick={() => setIsLoginModalOpen(true)} 
            className="icon-btn" 
            title="Switch Portal (Owner / Staff)"
          >
            <Shield size={17} className="text-cyan" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
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
                Upload master Excel stock sheet (e.g. <code>STOCK 07.10.2026.xlsx</code>) or load Yamaha sample data.
              </p>

              {currentUser.role === 'owner' ? (
                <>
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
                      <span className="file-hint">Parses CHASIS NO, MODEL, COLOUR & LOCATION</span>
                    </label>
                  </div>

                  <div className="filter-checkbox-row">
                    <label className="toggle-label">
                      <input 
                        type="checkbox" 
                        checked={filterOnlyStock} 
                        onChange={(e) => setFilterOnlyStock(e.target.checked)} 
                      />
                      <span>Exclude vehicles marked as "SOLD" in Excel</span>
                    </label>
                  </div>

                  <div className="divider-row"><span>OR TRY INSTANTLY</span></div>

                  <button 
                    type="button" 
                    onClick={handleLoadSample} 
                    disabled={isLoadingFile}
                    className="btn btn-secondary load-sample-btn"
                  >
                    <Sparkles size={18} className="text-amber" />
                    <span>{isLoadingFile ? 'Parsing Excel Data...' : '⚡ Load Sample Stock File (Oct 7, 2026 Yamaha Data)'}</span>
                  </button>
                </>
              ) : (
                <div className="staff-waiting-box">
                  <p>Awaiting Owner to upload master inventory file, or connecting to Owner room <strong>{p2pRoomCode}</strong>.</p>
                  <button 
                    type="button" 
                    onClick={() => setIsP2PModalOpen(true)} 
                    className="btn btn-primary mt-3"
                  >
                    Enter Owner Room Code
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
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
                  <div className="kpi-progress-fill bg-emerald" style={{ width: `${stats.percentage}%` }}></div>
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
                  <span className="badge-user">
                    👤 Authenticated Auditor: <strong>{activeStaffName}</strong>
                  </span>
                </div>
              </div>

              <form onSubmit={handleManualScanSubmit} className="scan-input-form">
                <div className="scan-input-wrapper">
                  <Search size={20} className="scan-icon" />
                  <input
                    ref={scanInputRef}
                    type="text"
                    value={scanInput}
                    onChange={(e) => setScanInput(e.target.value)}
                    placeholder="Scan Barcode or type 17-digit Chassis No..."
                    className="scan-text-input"
                  />
                  {scanInput && (
                    <button type="button" onClick={() => setScanInput('')} className="clear-input-btn">×</button>
                  )}
                </div>

                <button type="submit" className="btn btn-primary submit-scan-btn">
                  Verify Chassis
                </button>

                <button 
                  type="button" 
                  onClick={() => setIsCameraOpen(true)} 
                  className="btn btn-camera-pulse mobile-primary-scan-btn"
                >
                  <Camera size={20} />
                  <span>Launch Camera Scanner</span>
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
                      </span>
                    )}
                  </div>
                  <button type="button" onClick={() => setLastScanResult(null)} className="feedback-dismiss">×</button>
                </div>
              )}
            </div>

            {/* Split Content: Vehicles & Leaderboard */}
            <div className="content-split-grid">
              <div className="table-section-card glass-card">
                <div className="table-controls">
                  <div className="table-tabs">
                    <button type="button" onClick={() => setActiveTab('all')} className={`tab-btn ${activeTab === 'all' ? 'active' : ''}`}>
                      All ({vehicles.length})
                    </button>
                    <button type="button" onClick={() => setActiveTab('pending')} className={`tab-btn ${activeTab === 'pending' ? 'active' : ''}`}>
                      Missing ({stats.pending})
                    </button>
                    <button type="button" onClick={() => setActiveTab('verified')} className={`tab-btn ${activeTab === 'verified' ? 'active' : ''}`}>
                      Verified ({stats.verified})
                    </button>
                    <button type="button" onClick={() => setActiveTab('mismatch')} className={`tab-btn ${activeTab === 'mismatch' ? 'active' : ''}`}>
                      Mismatch ({stats.mismatch})
                    </button>
                    {unexpectedScans.length > 0 && (
                      <button type="button" onClick={() => setActiveTab('unexpected')} className={`tab-btn ${activeTab === 'unexpected' ? 'active' : ''}`}>
                        Unexpected ({unexpectedScans.length})
                      </button>
                    )}
                  </div>

                  <div className="table-right-controls">
                    <div className="view-mode-toggle">
                      <button 
                        type="button" 
                        onClick={() => setViewMode('cards')} 
                        className={`view-mode-btn ${viewMode === 'cards' ? 'active' : ''}`}
                        title="Mobile Cards View"
                      >
                        <LayoutGrid size={16} />
                      </button>
                      <button 
                        type="button" 
                        onClick={() => setViewMode('table')} 
                        className={`view-mode-btn ${viewMode === 'table' ? 'active' : ''}`}
                        title="Desktop Table View"
                      >
                        <ListFilter size={16} />
                      </button>
                    </div>

                    <div className="table-search-box">
                      <Search size={16} className="search-icon-sm" />
                      <input 
                        type="text" 
                        value={searchTerm} 
                        onChange={(e) => setSearchTerm(e.target.value)} 
                        placeholder="Search chassis, model..." 
                        className="table-search-input" 
                      />
                    </div>
                  </div>
                </div>

                {/* Mobile Cards Grid */}
                {viewMode === 'cards' ? (
                  <div className="mobile-cards-grid">
                    {filteredVehicles.slice(0, 100).map((v) => {
                      const isVerified = v.status === 'verified';
                      const isMismatch = v.status === 'mismatch';
                      const isPending = v.status === 'pending';

                      return (
                        <div key={v.id} className={`vehicle-mobile-card ${v.status}`}>
                          <div className="card-top-row">
                            <div>
                              {isVerified && <span className="status-badge status-badge-verified">✓ VERIFIED</span>}
                              {isMismatch && <span className="status-badge status-badge-mismatch">⚠️ MISMATCH</span>}
                              {isPending && <span className="status-badge status-badge-pending">PENDING</span>}
                            </div>
                            <span className="card-location-tag">📍 {v.location}</span>
                          </div>

                          <div className="card-model-row">
                            <h3 className="card-model-title">{v.model}</h3>
                            {v.colour && <span className="card-colour-pill">{v.colour}</span>}
                          </div>

                          <div className="card-chassis-box">
                            <span className="card-chassis-label">CHASSIS / VIN:</span>
                            <strong className="card-chassis-num">{v.chassisNo}</strong>
                          </div>

                          {(isVerified || isMismatch) && (
                            <div className="card-audit-info">
                              <span>👤 Verified by: <strong>{v.scannedBy}</strong></span>
                              <span>🕒 {new Date(v.scannedAt).toLocaleTimeString('en-IN')}</span>
                            </div>
                          )}

                          <div className="card-action-row">
                            {isPending ? (
                              <button 
                                type="button" 
                                onClick={() => processScan(v.chassisNo)} 
                                className="btn-card-verify"
                              >
                                ✓ Mark as Verified
                              </button>
                            ) : (
                              <button 
                                type="button" 
                                onClick={() => {
                                  setVehicles(prev => prev.map(item => item.id === v.id ? { ...item, status: 'pending', scannedAt: null, scannedBy: null } : item));
                                }} 
                                className="btn-card-undo"
                              >
                                Undo Verification
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* Table View */
                  <div className="table-responsive-wrapper">
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
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredVehicles.slice(0, 100).map((v) => (
                          <tr key={v.id} className={`row-${v.status}`}>
                            <td>
                              {v.status === 'verified' && <span className="status-badge status-badge-verified">✓ VERIFIED</span>}
                              {v.status === 'mismatch' && <span className="status-badge status-badge-mismatch">⚠️ MISMATCH</span>}
                              {v.status === 'pending' && <span className="status-badge status-badge-pending">PENDING</span>}
                            </td>
                            <td><code className="chassis-pill">{v.chassisNo}</code></td>
                            <td>
                              <div className="model-cell">
                                <strong>{v.model}</strong>
                                {v.colour && <span className="colour-tag">{v.colour}</span>}
                              </div>
                            </td>
                            <td>{v.location}</td>
                            <td>{v.scannedLocation || '—'}</td>
                            <td>{v.scannedBy || '—'}</td>
                            <td>{v.scannedAt ? new Date(v.scannedAt).toLocaleTimeString('en-IN') : '—'}</td>
                            <td>
                              {v.status === 'pending' ? (
                                <button type="button" onClick={() => processScan(v.chassisNo)} className="action-btn verify-now-btn">
                                  Verify
                                </button>
                              ) : (
                                <button 
                                  type="button" 
                                  onClick={() => {
                                    setVehicles(prev => prev.map(item => item.id === v.id ? { ...item, status: 'pending', scannedAt: null, scannedBy: null } : item));
                                  }} 
                                  className="action-btn undo-btn"
                                >
                                  Undo
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Owner controls: Reset / Archive Audit */}
                {currentUser.role === 'owner' && (
                  <div className="owner-bottom-toolbar mt-3">
                    <button type="button" onClick={handleResetAudit} className="btn-tiny-reset">
                      Archive / Reset Current Audit
                    </button>
                    <span className="text-dim text-xs">🔒 Zero-Setup P2P Live Sync Enabled</span>
                  </div>
                )}
              </div>

              {/* Leaderboard Column */}
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

      {/* Floating Bottom Dock for Mobile Floor Staff */}
      {isLoaded && (
        <div className="mobile-bottom-dock">
          <div className="dock-stat-item">
            <span className="dock-label">Found</span>
            <strong className="dock-val text-emerald">{stats.totalFound}</strong>
          </div>

          <button 
            type="button" 
            onClick={() => setIsCameraOpen(true)} 
            className="dock-scan-btn"
            title="Scan Chassis Barcode or Text Sticker"
          >
            <Camera size={26} />
            <span>SCAN</span>
          </button>

          <div className="dock-stat-item">
            <span className="dock-label">Pending</span>
            <strong className="dock-val text-amber">{stats.pending}</strong>
          </div>
        </div>
      )}

      {/* Hybrid Camera / OCR Scanner Modal */}
      {isCameraOpen && (
        <CameraScanner 
          onScan={(decoded) => processScan(decoded)}
          onClose={() => setIsCameraOpen(false)}
        />
      )}

      {/* Owner Staff PIN Manager Modal */}
      {isStaffManagerOpen && (
        <OwnerStaffManagerModal 
          onClose={() => setIsStaffManagerOpen(false)}
          onRosterChanged={(updated) => setRoster(updated)}
        />
      )}

      {/* Staff PIN Verification Modal */}
      {selectedStaffToAuth && (
        <StaffPinModal 
          staff={selectedStaffToAuth}
          onClose={() => setSelectedStaffToAuth(null)}
          onSuccess={(authStaff) => {
            setActiveStaffName(authStaff.name);
            setSelectedStaffToAuth(null);
          }}
        />
      )}

      {/* Role / Login Modal */}
      {isLoginModalOpen && (
        <LoginModal 
          onLoginSuccess={(user) => {
            setCurrentUser(user);
            setIsLoginModalOpen(false);
          }}
        />
      )}

      {/* Zero-Setup P2P Settings / Room Modal */}
      {isP2PModalOpen && (
        <P2PSettingsModal 
          roomCode={p2pRoomCode}
          isHost={currentUser.role === 'owner'}
          connectedCount={connectedStaffCount}
          p2pStatus={p2pStatus}
          onJoinRoom={(code) => setP2pRoomCode(code)}
          onRegenerateRoom={() => setP2pRoomCode(generateRoomCode())}
          onClose={() => setIsP2PModalOpen(false)}
        />
      )}
    </div>
  );
}
