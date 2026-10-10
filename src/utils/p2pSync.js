import Peer from 'peerjs';

// Clean peer room code generator
export function generateRoomCode() {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

const PEER_PREFIX = 'stockaudit_v1_';

export class P2PSyncService {
  constructor(roomCode, isHost = false, callbacks = {}) {
    this.roomCode = String(roomCode).toUpperCase().trim();
    this.isHost = isHost;
    this.callbacks = callbacks; // onRemoteScan, onPeerConnect, onPeerDisconnect, onStatusChange, onInitialSync
    this.peer = null;
    this.connections = []; // list of active DataConnections
    this.hostConnection = null; // for client: connection to host
    this.status = 'connecting'; // 'connecting' | 'connected' | 'disconnected' | 'error'

    this.init();
  }

  init() {
    try {
      const peerId = this.isHost 
        ? `${PEER_PREFIX}host_${this.roomCode}`
        : `${PEER_PREFIX}client_${this.roomCode}_${Math.random().toString(36).substring(2, 7)}`;

      this.peer = new Peer(peerId, {
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' }
          ]
        }
      });

      this.peer.on('open', (id) => {
        if (this.isHost) {
          this.status = 'connected';
          if (this.callbacks.onStatusChange) this.callbacks.onStatusChange('connected', 0);
        } else {
          // Client connects to host
          this.connectToHost();
        }
      });

      this.peer.on('connection', (conn) => {
        if (this.isHost) {
          this.handleIncomingClientConnection(conn);
        }
      });

      this.peer.on('error', (err) => {
        console.warn('PeerJS error:', err);
        this.status = 'error';
        if (this.callbacks.onStatusChange) this.callbacks.onStatusChange('error', this.connections.length, err.message);
      });

      this.peer.on('disconnected', () => {
        this.status = 'disconnected';
        if (this.callbacks.onStatusChange) this.callbacks.onStatusChange('disconnected', this.connections.length);
      });
    } catch (err) {
      console.warn('P2P initialization error:', err);
      this.status = 'error';
    }
  }

  // HOST: Handle incoming staff connection
  handleIncomingClientConnection(conn) {
    conn.on('open', () => {
      this.connections.push(conn);
      if (this.callbacks.onPeerConnect) this.callbacks.onPeerConnect(conn.peer, this.connections.length);
      if (this.callbacks.onStatusChange) this.callbacks.onStatusChange('connected', this.connections.length);

      // Send initial full state to newly connected staff
      if (this.callbacks.getInitialState) {
        const state = this.callbacks.getInitialState();
        conn.send({ type: 'INITIAL_STATE_SYNC', payload: state });
      }
    });

    conn.on('data', (data) => {
      this.handleReceivedMessage(data, conn);
    });

    conn.on('close', () => {
      this.connections = this.connections.filter(c => c !== conn);
      if (this.callbacks.onPeerDisconnect) this.callbacks.onPeerDisconnect(conn.peer, this.connections.length);
      if (this.callbacks.onStatusChange) this.callbacks.onStatusChange('connected', this.connections.length);
    });
  }

  // CLIENT: Connect to host peer
  connectToHost() {
    const hostPeerId = `${PEER_PREFIX}host_${this.roomCode}`;
    const conn = this.peer.connect(hostPeerId, { reliable: true });

    conn.on('open', () => {
      this.hostConnection = conn;
      this.status = 'connected';
      if (this.callbacks.onStatusChange) this.callbacks.onStatusChange('connected', 1);
    });

    conn.on('data', (data) => {
      this.handleReceivedMessage(data, conn);
    });

    conn.on('close', () => {
      this.hostConnection = null;
      this.status = 'disconnected';
      if (this.callbacks.onStatusChange) this.callbacks.onStatusChange('disconnected', 0);
    });

    conn.on('error', (err) => {
      console.warn('Connection to host error:', err);
    });
  }

  // Handle incoming message
  handleReceivedMessage(data, senderConn) {
    if (!data || !data.type) return;

    if (data.type === 'SCAN_EVENT') {
      if (this.callbacks.onRemoteScan) {
        this.callbacks.onRemoteScan(data.payload);
      }

      // If Host received a scan from one staff, relay it to all other staff
      if (this.isHost) {
        this.connections.forEach(clientConn => {
          if (clientConn !== senderConn && clientConn.open) {
            clientConn.send(data);
          }
        });
      }
    } else if (data.type === 'INITIAL_STATE_SYNC') {
      if (this.callbacks.onInitialSync) {
        this.callbacks.onInitialSync(data.payload);
      }
    }
  }

  // Broadcast a new scan event
  broadcastScan(scanEvent) {
    const msg = { type: 'SCAN_EVENT', payload: scanEvent };

    if (this.isHost) {
      // Host sends to all connected clients
      this.connections.forEach(c => {
        if (c.open) c.send(msg);
      });
    } else if (this.hostConnection && this.hostConnection.open) {
      // Client sends to host
      this.hostConnection.send(msg);
    }
  }

  destroy() {
    if (this.connections) {
      this.connections.forEach(c => c.close());
      this.connections = [];
    }
    if (this.hostConnection) {
      this.hostConnection.close();
      this.hostConnection = null;
    }
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
  }
}
