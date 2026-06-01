/**
 * Tally XML Parser - Handles flat sibling structures and proper encoding
 * Supports UTF-8, UTF-16 LE/BE, and detects encoding automatically
 */

interface TallyRow {
  date: string;
  particulars: string;
  vchType: string;
  vchNo: string;
  vchRef: string;
  vchRefDate: string;
  gstin: string;
  amount: string;
  addlCost: string;
  grossAmount: string;
  ledAmts: string[];
}

interface TallyParseResult {
  companyInfo: {
    name: string;
    addr1: string;
    addr2: string;
    addr3: string;
    dateRange: string;
  };
  headers: string[];
  rows: any[][];
}

/**
 * Detect and handle different encodings
 * Note: Browsers don't support UTF-16 in TextDecoder, so we decode manually
 */
export const decodeFileBuffer = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  
  // Check for UTF-16 BOM (Byte Order Mark)
  if (bytes[0] === 0xFF && bytes[1] === 0xFE) {
    console.log("Detected UTF-16 LE encoding");
    return decodeUtf16LE(buffer);
  }
  
  if (bytes[0] === 0xFE && bytes[1] === 0xFF) {
    console.log("Detected UTF-16 BE encoding");
    return decodeUtf16BE(buffer);
  }
  
  // Check for UTF-8 BOM
  if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    console.log("Detected UTF-8 encoding");
    return new TextDecoder('utf-8').decode(buffer.slice(3)); // Skip BOM
  }
  
  // Default to UTF-8
  console.log("No BOM detected, assuming UTF-8");
  try {
    const decoded = new TextDecoder('utf-8').decode(buffer);
    // Validate it's proper UTF-8
    if (decoded.includes('\uFFFD')) throw new Error("Invalid UTF-8");
    return decoded;
  } catch {
    // Fall back to UTF-16 LE if UTF-8 fails
    console.warn("UTF-8 decoding failed, trying UTF-16 LE");
    return decodeUtf16LE(buffer);
  }
};

/**
 * Decode UTF-16 LE manually (browsers don't support this in TextDecoder)
 */
const decodeUtf16LE = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  const chars: string[] = [];
  
  for (let i = 0; i < bytes.length - 1; i += 2) {
    const code = bytes[i] | (bytes[i + 1] << 8);
    
    // Handle surrogate pairs for characters outside BMP
    if (code >= 0xD800 && code <= 0xDBFF && i + 3 < bytes.length) {
      const hi = code;
      const lo = bytes[i + 2] | (bytes[i + 3] << 8);
      if (lo >= 0xDC00 && lo <= 0xDFFF) {
        const codePoint = 0x10000 + ((hi & 0x3FF) << 10) | (lo & 0x3FF);
        chars.push(String.fromCodePoint(codePoint));
        i += 2;
        continue;
      }
    }
    
    chars.push(String.fromCharCode(code));
  }
  
  return chars.join('');
};

/**
 * Decode UTF-16 BE manually (browsers don't support this in TextDecoder)
 */
const decodeUtf16BE = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  const chars: string[] = [];
  
  for (let i = 0; i < bytes.length - 1; i += 2) {
    const code = (bytes[i] << 8) | bytes[i + 1];
    
    // Handle surrogate pairs for characters outside BMP
    if (code >= 0xD800 && code <= 0xDBFF && i + 3 < bytes.length) {
      const hi = code;
      const lo = (bytes[i + 2] << 8) | bytes[i + 3];
      if (lo >= 0xDC00 && lo <= 0xDFFF) {
        const codePoint = 0x10000 + ((hi & 0x3FF) << 10) | (lo & 0x3FF);
        chars.push(String.fromCodePoint(codePoint));
        i += 2;
        continue;
      }
    }
    
    chars.push(String.fromCharCode(code));
  }
  
  return chars.join('');
};

/**
 * Extract text from element, handling namespaces
 */
const getElementText = (element: Element | null): string => {
  return element?.textContent?.trim() || "";
};

/**
 * Find next sibling element by tag name
 */
const getNextSiblingByTag = (element: Element, tagName: string): Element | null => {
  let sibling = element.nextElementSibling;
  while (sibling) {
    if (sibling.localName === tagName || sibling.nodeName.split(':').pop() === tagName) {
      return sibling;
    }
    sibling = sibling.nextElementSibling;
  }
  return null;
};

/**
 * Get all following siblings until a specific tag is encountered
 */
const getSiblingsUntilTag = (element: Element, stopTagName: string): Element[] => {
  const siblings: Element[] = [];
  let sibling = element.nextElementSibling;
  
  while (sibling) {
    if (sibling.localName === stopTagName || sibling.nodeName.split(':').pop() === stopTagName) {
      break;
    }
    siblings.push(sibling);
    sibling = sibling.nextElementSibling;
  }
  
  return siblings;
};

/**
 * Extract values from siblings with a specific tag name
 */
const extractMultipleSiblings = (element: Element, tagName: string): string[] => {
  const values: string[] = [];
  let sibling = element.nextElementSibling;
  
  while (sibling) {
    if (sibling.localName === tagName || sibling.nodeName.split(':').pop() === tagName) {
      values.push(getElementText(sibling));
    } else if (sibling.localName === "DBCFIXED" || sibling.nodeName.split(':').pop() === "DBCFIXED") {
      break; // Stop at next row marker
    }
    sibling = sibling.nextElementSibling;
  }
  
  return values;
};

/**
 * Parse Tally Columnar Register XML with flat sibling structure
 */
export const parseTallyXML = (xmlText: string): TallyParseResult => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "text/xml");

  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    throw new Error("Invalid XML format. Please ensure it is a valid Tally export.");
  }

  // Extract company information
  let companyName = "DYP INFRAPROJECTS PVT.LTD.";
  let addr1 = "Kohinoor Majestic, 2nd Floor, Office No. 112 & 113,";
  let addr2 = "Plot No. 185/186, Behind Hyundai Showroom,";
  let addr3 = "Thermax Chowk, Chinchwad, Pune 411016";
  let dateRange = "";

  // Try to find company info in the document
  const companyElements = doc.querySelectorAll("[*|localName='DSPCOMPANYNAME'], DSPCOMPANYNAME, COMPANYNAME");
  if (companyElements.length > 0) {
    companyName = getElementText(companyElements[0]).trim();
  }

  const reportTitleElements = doc.querySelectorAll("[*|localName='DSPREPTITLE'], DSPREPTITLE, REPORTTITLE");
  if (reportTitleElements.length > 0) {
    dateRange = getElementText(reportTitleElements[0]).trim();
  }

  // Find all DBCFIXED elements (row markers)
  const allElements = Array.from(doc.querySelectorAll("*"));
  const dbcfixedIndices = allElements
    .map((el, idx) => (el.localName === "DBCFIXED" || el.nodeName.split(':').pop() === "DBCFIXED") ? idx : -1)
    .filter(idx => idx !== -1);

  if (dbcfixedIndices.length === 0) {
    throw new Error("No valid data rows found. Please ensure you exported a 'Columnar Register' from Tally in XML format.");
  }

  const rows: TallyRow[] = [];
  let maxLedgerCols = 0;
  let minDate: Date | null = null;
  let maxDate: Date | null = null;

  // Parse each row starting from DBCFIXED
  for (let i = 0; i < dbcfixedIndices.length; i++) {
    const currentIdx = dbcfixedIndices[i];
    const nextFixedIdx = dbcfixedIndices[i + 1] ?? allElements.length;
    
    // Get DBCFIXED element
    const fixedEl = allElements[currentIdx] as Element;
    
    // Extract fields from DBCFIXED (date and particulars are inside)
    const date = getElementText(fixedEl.querySelector("DBCDATE")) || getElementText(fixedEl.querySelector("[*|localName='DBCDATE']"));
    const particulars = getElementText(fixedEl.querySelector("DBCPARTY")) || getElementText(fixedEl.querySelector("[*|localName='DBCPARTY']"));

    // Extract fields from siblings between current DBCFIXED and next DBCFIXED
    const rowElements = allElements.slice(currentIdx + 1, nextFixedIdx);
    
    // Helper to get first matching element in row
    const getRowFieldValue = (tagName: string): string => {
      const el = rowElements.find(e => e.localName === tagName || e.nodeName.split(':').pop() === tagName);
      return el ? getElementText(el) : "";
    };

    // Helper to get all matching elements in row
    const getRowFieldValues = (tagName: string): string[] => {
      return rowElements
        .filter(e => e.localName === tagName || e.nodeName.split(':').pop() === tagName)
        .map(e => getElementText(e));
    };

    const vchType = getRowFieldValue("DBCVCHTYPE");
    const vchNo = getRowFieldValue("DBCVCHNO");
    const vchRef = getRowFieldValue("DBCVCHREF");
    const vchRefDate = getRowFieldValue("DBCVCHREFDATE");
    const gstin = getRowFieldValue("DBCGSTIN");
    const amount = getRowFieldValue("DBCAMOUNT");
    const addlCost = getRowFieldValue("DBCADDLCOST");
    const grossAmount = getRowFieldValue("DBCGROSSAMT");
    const ledAmts = getRowFieldValues("DBCLEDAMT");

    // Skip empty rows
    if (!date && !particulars && !vchNo && !grossAmount && ledAmts.length === 0) {
      continue;
    }

    // Track date range
    if (date) {
      try {
        const d = new Date(date);
        if (!isNaN(d.getTime())) {
          if (!minDate || d < minDate) minDate = d;
          if (!maxDate || d > maxDate) maxDate = d;
        }
      } catch (e) {
        console.warn("Invalid date:", date);
      }
    }

    if (ledAmts.length > maxLedgerCols) maxLedgerCols = ledAmts.length;

    rows.push({
      date,
      particulars,
      vchType,
      vchNo,
      vchRef,
      vchRefDate,
      gstin,
      amount,
      addlCost,
      grossAmount,
      ledAmts
    });
  }

  // Determine date range
  if (!dateRange && (minDate || maxDate)) {
    const fmt = (d: Date) => d.toLocaleDateString('en-GB', { 
      day: 'numeric', 
      month: 'short', 
      year: '2-digit' 
    }).replace(/ /g, '-');
    
    dateRange = minDate && maxDate 
      ? `${fmt(minDate)} to ${fmt(maxDate)}`
      : "Custom Register Export";
  }

  // Extract column headers from XML
  const colNameElements = doc.querySelectorAll("[*|localName='DBCCOLNAME'], DBCCOLNAME");
  const colTitleElements = doc.querySelectorAll("[*|localName='DSPCOLTITLE'], DSPCOLTITLE");
  
  const dynamicHeaders = Array.from(colNameElements).length > 0
    ? Array.from(colNameElements).map(el => getElementText(el))
    : Array.from(colTitleElements).map(el => getElementText(el));

  // Ensure we have enough column headers
  while (dynamicHeaders.length < maxLedgerCols) {
    dynamicHeaders.push(`Column ${dynamicHeaders.length + 1}`);
  }

  // Build final headers
  const headers = [
    "Date",
    "Particulars",
    "Voucher Type",
    "Voucher No.",
    "Voucher Ref. No.",
    "Voucher Ref. Date",
    "GSTIN/UIN",
    "Value",
    "Addi. Cost",
    "Gross Total",
    ...dynamicHeaders.slice(0, maxLedgerCols)
  ];

  // Convert rows to 2D array format
  const parsedRows = rows.map(row => [
    row.date,
    row.particulars,
    row.vchType,
    row.vchNo,
    row.vchRef,
    row.vchRefDate,
    row.gstin,
    row.amount,
    row.addlCost,
    row.grossAmount,
    ...row.ledAmts
  ]);

  return {
    companyInfo: { name: companyName, addr1, addr2, addr3, dateRange },
    headers,
    rows: parsedRows
  };
};
