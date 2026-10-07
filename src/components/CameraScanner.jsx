import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Camera, CameraOff, Flashlight, RefreshCw, X } from 'lucide-react';

export default function CameraScanner({ onScan, onClose, isScanningActive }) {
  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const scannerRef = useRef(null);
  const lastScannedTime = useRef(0);
  const containerId = 'interactive-camera-box';

  useEffect(() => {
    let html5QrCode = null;

    async function initCamera() {
      try {
        const devices = await Html5Qrcode.getCameras();
        if (!devices || devices.length === 0) {
          setErrorMsg('No camera found on this device. Please connect a camera or use manual input/barcode gun.');
          setIsInitializing(false);
          return;
        }

        setCameras(devices);

        // Pick back/environment camera if available
        const backCamera = devices.find(d => 
          d.label.toLowerCase().includes('back') || 
          d.label.toLowerCase().includes('rear') ||
          d.label.toLowerCase().includes('environment')
        ) || devices[devices.length - 1];

        const camId = backCamera ? backCamera.id : devices[0].id;
        setSelectedCameraId(camId);

        html5QrCode = new Html5Qrcode(containerId, {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.CODE_93,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.DATA_MATRIX
          ],
          verbose: false
        });
        scannerRef.current = html5QrCode;

        await startScanner(html5QrCode, camId);
        setIsInitializing(false);
      } catch (err) {
        console.error('Camera init error:', err);
        setErrorMsg('Camera access denied or unavailable. You can use manual entry or a hardware scanner.');
        setIsInitializing(false);
      }
    }

    initCamera();

    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().then(() => {
          scannerRef.current.clear();
        }).catch(() => {});
      }
    };
  }, []);

  async function startScanner(instance, cameraId) {
    if (!instance) return;
    try {
      const config = {
        fps: 20, // 20 frames per second for ultra-fast detection
        qrbox: (viewfinderWidth, viewfinderHeight) => {
          // Optimized scanning rectangle for barcodes & QR
          const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
          return {
            width: Math.floor(viewfinderWidth * 0.85),
            height: Math.floor(minEdge * 0.6)
          };
        },
        aspectRatio: 1.333334
      };

      await instance.start(
        cameraId,
        config,
        (decodedText) => {
          const now = Date.now();
          // 400ms throttle between reads
          if (now - lastScannedTime.current > 400) {
            lastScannedTime.current = now;
            onScan(decodedText);
          }
        },
        () => {
          // Frame scan error (ignored, ordinary search frame)
        }
      );

      // Check for torch capability
      try {
        const capabilities = instance.getRunningTrackCapabilities();
        if (capabilities && capabilities.torch) {
          setHasTorch(true);
        }
      } catch {
        setHasTorch(false);
      }
    } catch (err) {
      console.error('Failed to start camera:', err);
      setErrorMsg('Failed to stream camera video.');
    }
  }

  const switchCamera = async () => {
    if (!scannerRef.current || cameras.length <= 1) return;
    const currentIndex = cameras.findIndex(c => c.id === selectedCameraId);
    const nextIndex = (currentIndex + 1) % cameras.length;
    const nextCamera = cameras[nextIndex];
    setSelectedCameraId(nextCamera.id);

    try {
      await scannerRef.current.stop();
      await startScanner(scannerRef.current, nextCamera.id);
    } catch (err) {
      console.error('Switch camera error:', err);
    }
  };

  const toggleTorch = async () => {
    if (!scannerRef.current || !hasTorch) return;
    try {
      const nextTorch = !torchOn;
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ torch: nextTorch }]
      });
      setTorchOn(nextTorch);
    } catch (err) {
      console.error('Torch toggle error:', err);
    }
  };

  return (
    <div className="camera-modal-backdrop">
      <div className="camera-scanner-card">
        <div className="camera-header">
          <div className="camera-title-badge">
            <span className="live-pulse"></span>
            <strong>High-Speed Camera Scanner</strong>
          </div>
          <div className="camera-actions">
            {cameras.length > 1 && (
              <button 
                type="button" 
                onClick={switchCamera} 
                className="icon-btn" 
                title="Switch Camera"
              >
                <RefreshCw size={18} />
              </button>
            )}
            {hasTorch && (
              <button 
                type="button" 
                onClick={toggleTorch} 
                className={`icon-btn ${torchOn ? 'active-torch' : ''}`} 
                title="Toggle Torch/Flashlight"
              >
                <Flashlight size={18} />
              </button>
            )}
            <button 
              type="button" 
              onClick={onClose} 
              className="icon-btn close-btn" 
              title="Close Scanner"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="camera-viewport-wrapper">
          <div id={containerId} className="camera-feed-box"></div>
          
          {/* Laser overlay animation */}
          <div className="scanner-target-reticle">
            <div className="reticle-corner top-left"></div>
            <div className="reticle-corner top-right"></div>
            <div className="reticle-corner bottom-left"></div>
            <div className="reticle-corner bottom-right"></div>
            <div className="laser-sweep-line"></div>
          </div>

          {isInitializing && (
            <div className="camera-overlay-status">
              <div className="spinner"></div>
              <p>Initializing camera sensor...</p>
            </div>
          )}

          {errorMsg && (
            <div className="camera-overlay-status error">
              <CameraOff size={32} />
              <p>{errorMsg}</p>
            </div>
          )}
        </div>

        <div className="camera-footer">
          <p className="scanner-tip">
            💡 Point at the <strong>17-character VIN/Chassis barcode or QR tag</strong>. Instant audio feedback will confirm the match.
          </p>
        </div>
      </div>
    </div>
  );
}
