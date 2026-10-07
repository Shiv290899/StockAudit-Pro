import * as XLSX from 'xlsx';

// Clean and normalize chassis / VIN number for 100% reliable matching
export function normalizeChassis(val) {
  if (!val) return '';
  return String(val)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim();
}

// Convert Excel serial date to human readable date
export function formatExcelDate(serial) {
  if (!serial) return '';
  if (typeof serial === 'string' && serial.includes('/')) return serial;
  const num = Number(serial);
  if (isNaN(num)) return String(serial);
  // Excel epoch is 1899-12-30
  const utcDays = Math.floor(num - 25569);
  const date = new Date(utcDays * 86400 * 1000);
  if (isNaN(date.getTime())) return String(serial);
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

// Parse an uploaded ArrayBuffer or File
export async function parseStockExcel(fileOrBuffer, filterOnlyStock = true) {
  let data;
  if (fileOrBuffer instanceof ArrayBuffer) {
    data = new Uint8Array(fileOrBuffer);
  } else {
    data = new Uint8Array(await fileOrBuffer.arrayBuffer());
  }

  const workbook = XLSX.read(data, { type: 'array' });
  
  // Pick the best sheet: preferably "STOCK", otherwise first sheet
  let sheetName = workbook.SheetNames.find(n => n.toUpperCase().trim() === 'STOCK');
  if (!sheetName) {
    sheetName = workbook.SheetNames.find(n => n.toUpperCase().includes('STOCK')) || workbook.SheetNames[0];
  }

  const worksheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

  if (rawRows.length < 2) {
    throw new Error('Excel sheet appears to be empty or lacks headers.');
  }

  // Find header row (search first 5 rows for chassis/chasis column)
  let headerIndex = -1;
  let headers = [];

  for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
    const row = rawRows[i].map(c => String(c).trim().toUpperCase());
    if (row.some(c => c.includes('CHASIS') || c.includes('CHASSIS') || c.includes('VIN'))) {
      headerIndex = i;
      headers = row;
      break;
    }
  }

  if (headerIndex === -1) {
    // Default to row 0
    headerIndex = 0;
    headers = rawRows[0].map(c => String(c).trim().toUpperCase());
  }

  // Identify column indices
  const getCol = (keywords) => {
    return headers.findIndex(h => keywords.some(k => h.includes(k)));
  };

  const idxChassis = getCol(['CHASIS', 'CHASSIS', 'VIN']);
  const idxModel = getCol(['MODEL']);
  const idxColour = getCol(['COLOUR', 'COLOR']);
  const idxLocation = getCol(['LOCATION', 'BRANCH', 'GODOWN', 'SHOWROOM']);
  const idxStatus = getCol(['SOLD', 'STATUS', 'STOCK']);
  const idxEngine = getCol(['ENGINE']);
  const idxYear = getCol(['YEAR']);
  const idxModelCode = getCol(['MODEL CODE']);
  const idxColorCode = getCol(['CL. CODE', 'COLOR CODE', 'COLOUR CODE']);
  const idxBillDate = getCol(['BILL DATE']);
  const idxInvNo = getCol(['INV NO', 'INVOICE']);

  if (idxChassis === -1) {
    throw new Error('Could not find CHASIS NO column in the Excel file.');
  }

  const vehicles = [];
  const rows = rawRows.slice(headerIndex + 1);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rawChassis = row[idxChassis];
    const normalized = normalizeChassis(rawChassis);

    if (!normalized || normalized.length < 4) continue;

    const rawStatus = idxStatus !== -1 ? String(row[idxStatus]).trim().toUpperCase() : 'STOCK';
    const isSold = rawStatus.includes('SOLD');

    // If filterOnlyStock is true, ignore already sold vehicles
    if (filterOnlyStock && isSold) {
      continue;
    }

    const vehicle = {
      id: normalized,
      chassisNo: String(rawChassis).trim(),
      normalizedChassis: normalized,
      model: idxModel !== -1 ? String(row[idxModel]).trim() : 'Unknown Model',
      colour: idxColour !== -1 ? String(row[idxColour]).trim() : '',
      location: idxLocation !== -1 && row[idxLocation] ? String(row[idxLocation]).trim().toUpperCase() : 'MAIN GODOWN',
      engineNo: idxEngine !== -1 ? String(row[idxEngine]).trim() : '',
      year: idxYear !== -1 ? String(row[idxYear]).trim() : '',
      modelCode: idxModelCode !== -1 ? String(row[idxModelCode]).trim() : '',
      colorCode: idxColorCode !== -1 ? String(row[idxColorCode]).trim() : '',
      billDate: idxBillDate !== -1 ? formatExcelDate(row[idxBillDate]) : '',
      invNo: idxInvNo !== -1 ? String(row[idxInvNo]).trim() : '',
      excelStatus: rawStatus || 'STOCK',
      
      // Audit status fields
      status: 'pending', // 'pending' | 'verified' | 'mismatch'
      scannedAt: null,
      scannedBy: null,
      scannedLocation: null
    };

    vehicles.push(vehicle);
  }

  return {
    sheetName,
    totalRows: vehicles.length,
    vehicles
  };
}

// Generate an audit reconciliation report and trigger browser download
export function exportAuditReport(auditSession) {
  const { name, createdAt, vehicles, unexpectedScans = [], currentStaff = 'Admin' } = auditSession;

  const verified = vehicles.filter(v => v.status === 'verified');
  const pending = vehicles.filter(v => v.status === 'pending');
  const locationMismatches = vehicles.filter(v => v.status === 'mismatch');

  // Sheet 1: Summary KPI
  const summaryData = [
    ['VEHICLE PHYSICAL STOCK AUDIT REPORT', ''],
    ['Session Name', name || 'Stock Audit'],
    ['Generated On', new Date().toLocaleString('en-IN')],
    ['Generated By', currentStaff],
    ['', ''],
    ['AUDIT METRICS', 'COUNT'],
    ['Total Stock Expected in Excel', vehicles.length],
    ['Physically Verified (Found)', verified.length + locationMismatches.length],
    ['Verified at Matching Location', verified.length],
    ['Location Mismatch Warning', locationMismatches.length],
    ['Missing / Not Scanned (Pending)', pending.length],
    ['Unexpected / Not in Excel (Surplus)', unexpectedScans.length],
    ['Audit Completion Rate', `${Math.round(((verified.length + locationMismatches.length) / (vehicles.length || 1)) * 100)}%`]
  ];

  // Sheet 2: Verified Vehicles
  const verifiedHeaders = ['No', 'Chassis Number', 'Model', 'Colour', 'Expected Location', 'Audited Location', 'Verified By', 'Scanned Time', 'Engine No', 'Bill Date', 'Inv No'];
  const verifiedRows = [...verified, ...locationMismatches].map((v, i) => [
    i + 1,
    v.chassisNo,
    v.model,
    v.colour,
    v.location,
    v.scannedLocation || v.location,
    v.scannedBy || 'Staff',
    v.scannedAt ? new Date(v.scannedAt).toLocaleTimeString('en-IN') : '',
    v.engineNo,
    v.billDate,
    v.invNo
  ]);

  // Sheet 3: Missing / Pending Vehicles
  const missingHeaders = ['No', 'Chassis Number', 'Model', 'Colour', 'Expected Location', 'Engine No', 'Bill Date', 'Inv No'];
  const missingRows = pending.map((v, i) => [
    i + 1,
    v.chassisNo,
    v.model,
    v.colour,
    v.location,
    v.engineNo,
    v.billDate,
    v.invNo
  ]);

  // Sheet 4: Unexpected Vehicles (Found on floor, not in Excel list)
  const unexpectedHeaders = ['No', 'Chassis Number Scanned', 'Audited Location', 'Scanned By', 'Scanned Timestamp', 'Remarks'];
  const unexpectedRows = unexpectedScans.map((u, i) => [
    i + 1,
    u.chassisNo,
    u.scannedLocation || 'Godown',
    u.scannedBy || 'Staff',
    u.scannedAt ? new Date(u.scannedAt).toLocaleString('en-IN') : '',
    'Physically present but NOT found in active stock sheet'
  ]);

  const wb = XLSX.utils.book_new();

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  const wsVerified = XLSX.utils.aoa_to_sheet([verifiedHeaders, ...verifiedRows]);
  const wsMissing = XLSX.utils.aoa_to_sheet([missingHeaders, ...missingRows]);
  const wsUnexpected = XLSX.utils.aoa_to_sheet([unexpectedHeaders, ...unexpectedRows]);

  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');
  XLSX.utils.book_append_sheet(wb, wsVerified, 'Verified Stock');
  XLSX.utils.book_append_sheet(wb, wsMissing, 'Missing - Pending');
  XLSX.utils.book_append_sheet(wb, wsUnexpected, 'Unexpected On Floor');

  const fileName = `Stock_Audit_Reconciliation_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
