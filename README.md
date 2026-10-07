# StockAudit-Pro ⚡

**Ultra-Fast Real-Time Vehicle Stock Audit & Barcode Tally System**

StockAudit Pro is an offline-first, high-speed progressive web application designed for automobile dealerships, showrooms, and godowns to conduct physical vehicle stock audits with multi-staff real-time synchronization.

---

## 🚀 Key Features

- **⚡ Zero-Lag Instant Scanning:**
  - $O(1)$ Hash Map indexing of 10,000+ chassis numbers for sub-millisecond retrieval.
  - Zero-latency hardware-accelerated sound synthesis via **Web Audio API** (distinct beeps for Verified, Warning, Duplicate, and Unexpected).
  - Tactile haptic vibration feedback for mobile devices.

- **👥 Multi-Staff Live Synchronization (Approach 1):**
  - Multiple staff members can scan bikes simultaneously across godowns and showrooms.
  - Automatically records **Exact Timestamp**, **Verified By (Staff Name)**, and **Audited Location**.
  - **Live Duplicate Prevention:** Instantly alerts if another staff member has already verified the vehicle.
  - **Live Leaderboard & Activity Feed:** Real-time metrics showing scan counts per staff member.

- **📁 Client-Side Excel Ingestion & Export:**
  - Drag-and-drop `.xlsx` master sheets (supports sheets with `CHASIS NO`, `MODEL`, `COLOUR`, `LOCATION`, `SOLD/STOCK`).
  - Auto-filters unsold active inventory.
  - Generates comprehensive multi-sheet reconciliation reports (`Summary`, `Verified`, `Missing/Pending`, `Unexpected on Floor`, `Location Mismatches`).

- **📷 Dual Scanning Modes:**
  - **Built-in Mobile Camera Scanner:** High-speed barcode/QR scanner with reticle animation and flashlight/torch support.
  - **Hardware Laser Scanner Gun Support:** Continuous rapid HID barcode gun capture without screen clicks.

---

## 🛠️ Tech Stack

- **Framework:** React + Vite
- **Styling:** Custom Vanilla CSS Design System (Glassmorphic dark mode, high refresh rate support)
- **Scanning Engine:** `html5-qrcode` + Browser Barcode Detector
- **Audio & Haptics:** Web Audio API (`AudioContext`) + Vibration API
- **Spreadsheet Engine:** SheetJS (`xlsx`)
- **Real-Time Sync:** Firebase Firestore + BroadcastChannel API

---

## 🏃 Getting Started

### Prerequisites
- Node.js (v18+)
- npm or yarn

### Installation
```bash
# Clone the repository
git clone https://github.com/Shiv290899/StockAudit-Pro.git
cd StockAudit-Pro

# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 📊 Deployment

Build production bundle:
```bash
npm run build
```
The static `/dist` directory can be deployed for free on **Vercel**, **Netlify**, or **GitHub Pages**.
