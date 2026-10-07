import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, setDoc, onSnapshot, updateDoc, arrayUnion } from 'firebase/firestore';

// Default demo Firebase config placeholder (can be customized via settings modal or env)
const FIREBASE_CONFIG_KEY = 'stockaudit_firebase_config';

export function getSavedFirebaseConfig() {
  try {
    const raw = localStorage.getItem(FIREBASE_CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveFirebaseConfig(config) {
  if (config) {
    localStorage.setItem(FIREBASE_CONFIG_KEY, JSON.stringify(config));
  } else {
    localStorage.removeItem(FIREBASE_CONFIG_KEY);
  }
}

// Initialize Firestore if valid config exists
let firestoreDb = null;
function getDb() {
  if (firestoreDb) return firestoreDb;
  const config = getSavedFirebaseConfig();
  if (config && config.apiKey && config.projectId) {
    try {
      const app = getApps().length === 0 ? initializeApp(config) : getApps()[0];
      firestoreDb = getFirestore(app);
      return firestoreDb;
    } catch (err) {
      console.warn('Firebase init failed, using BroadcastChannel fallback:', err);
    }
  }
  return null;
}

// Sync Provider that combines Firebase + BroadcastChannel (instant sub-50ms local sync)
export class AuditSyncService {
  constructor(sessionId, onRemoteUpdate) {
    this.sessionId = sessionId;
    this.onRemoteUpdate = onRemoteUpdate;
    this.unsubFirestore = null;
    this.broadcastChannel = null;

    this.initBroadcast();
    this.initFirebase();
  }

  initBroadcast() {
    try {
      if (window.BroadcastChannel) {
        this.broadcastChannel = new BroadcastChannel(`audit_channel_${this.sessionId}`);
        this.broadcastChannel.onmessage = (event) => {
          if (event.data && this.onRemoteUpdate) {
            this.onRemoteUpdate(event.data);
          }
        };
      }
    } catch (e) {
      console.warn('BroadcastChannel not available', e);
    }
  }

  initFirebase() {
    const db = getDb();
    if (!db) return;

    try {
      const sessionRef = doc(db, 'audit_sessions', this.sessionId);
      this.unsubFirestore = onSnapshot(sessionRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          if (this.onRemoteUpdate) {
            this.onRemoteUpdate({ type: 'FIREBASE_SNAPSHOT', payload: data });
          }
        }
      });
    } catch (e) {
      console.warn('Firestore snapshot setup failed:', e);
    }
  }

  // Broadcast a new scan event to all staff in real time
  async broadcastScan(scanEvent) {
    // 1. Local broadcast channel (sub-10ms)
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({
          type: 'SCAN_EVENT',
          payload: scanEvent
        });
      } catch (e) {
        console.warn('Broadcast send error', e);
      }
    }

    // 2. Firebase Cloud update
    const db = getDb();
    if (db) {
      try {
        const sessionRef = doc(db, 'audit_sessions', this.sessionId);
        await updateDoc(sessionRef, {
          recentScans: arrayUnion(scanEvent),
          [`scannedMap.${scanEvent.normalizedChassis}`]: {
            status: scanEvent.status,
            scannedBy: scanEvent.scannedBy,
            scannedAt: scanEvent.scannedAt,
            scannedLocation: scanEvent.scannedLocation
          }
        });
      } catch (e) {
        // If document doesn't exist yet, create it
        try {
          const sessionRef = doc(db, 'audit_sessions', this.sessionId);
          await setDoc(sessionRef, {
            recentScans: [scanEvent],
            scannedMap: {
              [scanEvent.normalizedChassis]: {
                status: scanEvent.status,
                scannedBy: scanEvent.scannedBy,
                scannedAt: scanEvent.scannedAt,
                scannedLocation: scanEvent.scannedLocation
              }
            }
          }, { merge: true });
        } catch (inner) {
          console.warn('Firebase write failed:', inner);
        }
      }
    }
  }

  destroy() {
    if (this.unsubFirestore) {
      this.unsubFirestore();
    }
    if (this.broadcastChannel) {
      this.broadcastChannel.close();
    }
  }
}
