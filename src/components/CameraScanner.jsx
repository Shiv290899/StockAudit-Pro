import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { 
  Camera, CameraOff, Flashlight, RefreshCw, X, 
  ScanText, Barcode, Sparkles, Image, CheckCircle, AlertCircle 
} from 'lucide-react';
import { recognizeTextFromCanvas, extractChassisFromText } from '../utils/ocrEngine';

export default function CameraScanner({ onScan, onClose }) {
  const [scanMode, setScanMode] = useState('smart'); // 'smart' | 'barcode' | 'ocr'
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isOcrProcessing, setIsOcrProcessing] = useState(false);
  const [ocrDetected, setOcrDetected] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  
  const scannerRef = useRef(null);
  const videoElemRef = useRef(null);
  const ocrIntervalRef = useRef(null);
  const lastScannedTime = useRef(0);
  const containerId = 'scanner-video-container';

  useEffect(() => {
    let html5QrCode = null;
    let isMounted = true;

    async function initScanner() {
      try {
        setIsInitializing(true);
        setErrorMsg('');

        html5QrCode = new Html5Qrcode(containerId, {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.CODE_93,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.DATA_MATRIX,
            Html5QrcodeSupportedFormats.ITF
          ],
          verbose: false
        });
        scannerRef.current = html5QrCode;

        // Mobile optimal config: facingMode: environment directly requests rear camera
        const cameraConfig = { facingMode: 'environment' };
        const config = {
          fps: 15,
          qrbox: (w, h) => {
            const min = Math.min(w, h);
            return {
              width: Math.floor(w * 0.88),
              height: Math.floor(min * 0.58)
            };
          },
          aspectRatio: 1.333334
        };

        await html5QrCode.start(
          cameraConfig,
          config,
          (decodedText) => {
            const now = Date.now();
            if (now - lastScannedTime.current > 500) {
              lastScannedTime.current = now;
              handleDetectedChassis(decodedText);
            }
          },
          () => {}
        );

        if (!isMounted) return;

        // Locate internal video element for OCR snapshotting
        const video = document.querySelector(`#${containerId} video`);
        if (video) {
          videoElemRef.current = video;
        }

        // Torch support check
        try {
          const capabilities = html5QrCode.getRunningTrackCapabilities();
          if (capabilities && capabilities.torch) {
            setHasTorch(true);
          }
        } catch {
          setHasTorch(false);
        }

        setIsInitializing(false);
      } catch (err) {
        console.error('Camera startup error:', err);
        if (isMounted) {
          setIsInitializing(false);
          const isHttps = window.location.protocol === 'https:' || window.location.hostname === 'localhost';
          if (!isHttps) {
            setErrorMsg('Mobile browser requires HTTPS to access camera. Please access via https:// or use the photo upload button below.');
          } else {
            setErrorMsg('Camera permission denied or camera not found. You can upload a photo of the sticker/chassis or enter manually.');
          }
        }
      }
    }

    initScanner();

    return () => {
      isMounted = false;
      if (ocrIntervalRef.current) {
        clearInterval(ocrIntervalRef.current);
      }
      if (scannerRef.current) {
        scannerRef.current.stop().then(() => {
          scannerRef.current.clear();
        }).catch(() => {});
      }
    };
  }, []);

  // Periodic OCR reader for text stickers (e.g. "CHASSIS: 1G1JC54548R123456")
  useEffect(() => {
    if (scanMode === 'barcode') {
      if (ocrIntervalRef.current) clearInterval(ocrIntervalRef.current);
      return;
    }

    // Run OCR snapshot every 1.5 seconds in OCR/Smart mode
    ocrIntervalRef.current = setInterval(() => {
      triggerOcrFrameCapture();
    }, 1400);

    return () => {
      if (ocrIntervalRef.current) clearInterval(ocrIntervalRef.current);
    };
  }, [scanMode]);

  const handleDetectedChassis = (chassisStr) => {
    setOcrDetected(chassisStr);
    onScan(chassisStr);
    setTimeout(() => {
      setOcrDetected(null);
    }, 1500);
  };

  // Capture frame from active video element and run OCR
  const triggerOcrFrameCapture = async () => {
    const video = videoElemRef.current || document.querySelector(`#${containerId} video`);
    if (!video || video.readyState < 2 || isOcrProcessing) return;

    try {
      setIsOcrProcessing(true);
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Draw current video frame
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Crop center 70% where sticker is focused
      const cropX = canvas.width * 0.1;
      const cropY = canvas.height * 0.2;
      const cropW = canvas.width * 0.8;
      const cropH = canvas.height * 0.6;

      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = cropW;
      cropCanvas.height = cropH;
      const cropCtx = cropCanvas.getContext('2d');
      cropCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

      const result = await recognizeTextFromCanvas(cropCanvas);
      if (result.detectedChassis) {
        const now = Date.now();
        if (now - lastScannedTime.current > 700) {
          lastScannedTime.current = now;
          handleDetectedChassis(result.detectedChassis);
        }
      }
    } catch (e) {
      console.warn('OCR loop error:', e);
    } finally {
      setIsOcrProcessing(false);
    }
  };

  // Upload an image file for instant OCR analysis (great for taking high-res photos on mobile)
  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsOcrProcessing(true);
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      await new Promise(resolve => { img.onload = resolve; });

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      const res = await recognizeTextFromCanvas(canvas);
      if (res.detectedChassis) {
        handleDetectedChassis(res.detectedChassis);
      } else {
        alert(`Could not extract 17-digit Chassis No from photo. Detected text: "${res.rawText.slice(0, 80)}"`);
      }
    } catch (err) {
      alert('Photo analysis failed: ' + err.message);
    } finally {
      setIsOcrProcessing(false);
    }
  };

  const toggleTorch = async () => {
    if (!scannerRef.current || !hasTorch) return;
    try {
      const next = !torchOn;
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ torch: next }]
      });
      setTorchOn(next);
    } catch (e) {
      console.warn('Torch toggle error:', e);
    }
  };

  return (
    <div className="camera-modal-backdrop">
      <div className="camera-scanner-card mobile-optimized-scanner">
        {/* Header & Controls */}
        <div className="camera-header">
          <div className="camera-title-badge">
            <span className="live-pulse"></span>
            <strong>Smart Chassis Scanner</strong>
          </div>

          <div className="camera-actions">
            {hasTorch && (
              <button 
                type="button" 
                onClick={toggleTorch} 
                className={`icon-btn ${torchOn ? 'active-torch' : ''}`} 
                title="Torch"
              >
                <Flashlight size={18} />
              </button>
            )}

            <button 
              type="button" 
              onClick={onClose} 
              className="icon-btn close-btn" 
              title="Close"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Mode Selector Chips */}
        <div className="scanner-mode-bar">
          <button 
            type="button" 
            onClick={() => setScanMode('smart')} 
            className={`mode-chip ${scanMode === 'smart' ? 'active' : ''}`}
          >
            <Sparkles size={14} />
            <span>Smart Auto (Both)</span>
          </button>
          <button 
            type="button" 
            onClick={() => setScanMode('ocr')} 
            className={`mode-chip ${scanMode === 'ocr' ? 'active' : ''}`}
          >
            <ScanText size={14} />
            <span>Text / OCR Sticker</span>
          </button>
          <button 
            type="button" 
            onClick={() => setScanMode('barcode')} 
            className={`mode-chip ${scanMode === 'barcode' ? 'active' : ''}`}
          >
            <Barcode size={14} />
            <span>Barcode / QR</span>
          </button>
        </div>

        {/* Video Viewport */}
        <div className="camera-viewport-wrapper">
          <div id={containerId} className="camera-feed-box"></div>

          {/* Hologram Reticle */}
          <div className="scanner-target-reticle">
            <div className="reticle-corner top-left"></div>
            <div className="reticle-corner top-right"></div>
            <div className="reticle-corner bottom-left"></div>
            <div className="reticle-corner bottom-right"></div>
            <div className="laser-sweep-line"></div>
          </div>

          {/* OCR Processing Indicator */}
          {isOcrProcessing && (
            <div className="ocr-reading-tag">
              <span className="dot pulse"></span>
              <span>Reading text & VIN numbers...</span>
            </div>
          )}

          {/* Detected Success Toast */}
          {ocrDetected && (
            <div className="detected-toast-overlay">
              <CheckCircle size={24} className="text-emerald" />
              <div>
                <strong>CHASSIS DETECTED!</strong>
                <code>{ocrDetected}</code>
              </div>
            </div>
          )}

          {isInitializing && (
            <div className="camera-overlay-status">
              <div className="spinner"></div>
              <p>Opening rear camera sensor...</p>
            </div>
          )}

          {errorMsg && (
            <div className="camera-overlay-status error">
              <AlertCircle size={32} />
              <p>{errorMsg}</p>
              <label htmlFor="photo-file-fallback" className="btn btn-primary mt-3 cursor-pointer">
                <Image size={18} />
                <span>Take Photo / Upload Sticker</span>
              </label>
              <input 
                id="photo-file-fallback" 
                type="file" 
                accept="image/*" 
                capture="environment" 
                onChange={handlePhotoUpload} 
                style={{ display: 'none' }} 
              />
            </div>
          )}
        </div>

        {/* Mobile Friendly Footer Actions */}
        <div className="camera-footer mobile-camera-footer">
          <div className="footer-action-row">
            <button 
              type="button" 
              onClick={triggerOcrFrameCapture} 
              disabled={isOcrProcessing}
              className="btn btn-secondary flex-1"
            >
              <ScanText size={16} />
              <span>{isOcrProcessing ? 'Reading...' : 'Capture Text Now'}</span>
            </button>

            <label htmlFor="camera-upload-input" className="btn btn-secondary flex-1 cursor-pointer">
              <Image size={16} />
              <span>Upload Photo</span>
            </label>
            <input 
              id="camera-upload-input" 
              type="file" 
              accept="image/*" 
              capture="environment" 
              onChange={handlePhotoUpload} 
              style={{ display: 'none' }} 
            />
          </div>

          <p className="scanner-tip">
            💡 Point at <strong>printed text sticker</strong> (e.g. <code>CHASSIS / VIN: 1G1JC54548R123456</code>) or <strong>Barcode / QR</strong>.
          </p>
        </div>
      </div>
    </div>
  );
}
