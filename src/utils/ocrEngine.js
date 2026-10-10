import { createWorker } from 'tesseract.js';

let workerPromise = null;

// Initialize Tesseract OCR worker lazily
async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await createWorker('eng');
      await worker.setParameters({
        tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-/: ',
      });
      return worker;
    })();
  }
  return workerPromise;
}

// Extract potential Chassis / VIN numbers from OCR text
export function extractChassisFromText(text) {
  if (!text) return null;
  const clean = text.toUpperCase().replace(/\s+/g, ' ');

  // 1. Check for labeled VIN / Chassis pattern (e.g. "CHASSIS / VIN: 1G1JC54548R123456")
  const labeledRegex = /(?:CHASIS|CHASSIS|VIN|FRAME|VEHICLE ID)[\s:./-]*([A-Z0-9]{10,17})/i;
  const labeledMatch = clean.match(labeledRegex);
  if (labeledMatch && labeledMatch[1]) {
    return sanitizeVin(labeledMatch[1]);
  }

  // 2. Check for exact 17-character VIN standard pattern (e.g. "1G1JC54548R123456" or "ME1RG9153R0029133")
  const vin17Regex = /\b([A-Z0-9]{17})\b/g;
  const matches17 = clean.match(vin17Regex);
  if (matches17 && matches17.length > 0) {
    // Pick the match that has both letters and numbers
    const valid = matches17.find(m => /[A-Z]/.test(m) && /[0-9]/.test(m));
    if (valid) return sanitizeVin(valid);
    return sanitizeVin(matches17[0]);
  }

  // 3. Fallback: Any 10-17 char alphanumeric token with both letters & digits
  const tokens = clean.split(/[^A-Z0-9]/).filter(t => t.length >= 10 && t.length <= 18);
  for (const token of tokens) {
    if (/[A-Z]/.test(token) && /[0-9]/.test(token)) {
      return sanitizeVin(token);
    }
  }

  return null;
}

function sanitizeVin(str) {
  return str.replace(/[^A-Z0-9]/g, '').trim();
}

// Perform OCR on a canvas element
export async function recognizeTextFromCanvas(canvas) {
  try {
    const worker = await getWorker();
    const result = await worker.recognize(canvas);
    const rawText = result?.data?.text || '';
    const detectedChassis = extractChassisFromText(rawText);
    return {
      rawText,
      detectedChassis,
      confidence: result?.data?.confidence || 0
    };
  } catch (err) {
    console.warn('OCR recognition error:', err);
    return { rawText: '', detectedChassis: null, confidence: 0 };
  }
}
