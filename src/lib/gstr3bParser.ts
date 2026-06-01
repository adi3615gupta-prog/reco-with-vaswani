import * as XLSX from 'xlsx-js-style';

export interface GSTR3BDataBlock {
  level1: string; // Main heading
  level2: string; // Sub-category
  level3: string; // Component (e.g. IGST Amount, CGST Amount)
  values: {
    April: number;
    May: number;
    June: number;
    July: number;
    August: number;
    September: number;
    October: number;
    November: number;
    December: number;
    January: number;
    February: number;
    March: number;
    Total: number;
  };
}

export async function parseGSTR3BFile(file: File): Promise<GSTR3BDataBlock[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  
  // Target Sheet: Sheet1
  const sheetName = wb.SheetNames.includes('Sheet1') ? 'Sheet1' : wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  
  // Read all rows starting from Row index 1 (Excel Row 2 starts at range index 1)
  const rawRows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' });
  
  if (rawRows.length < 2) {
    throw new Error("Excel sheet contains insufficient rows. Ensure column headers are on Row 2.");
  }
  
  // Headers are in Row index 1 (Excel Row 2)
  const headerRow = rawRows[1];
  if (!headerRow || headerRow.length === 0) {
    throw new Error("Could not find column headers on Row 2.");
  }
  
  const expectedCols = [
    'Particulars', 'April', 'May', 'June', 'July', 'August', 'September', 
    'October', 'November', 'December', 'January', 'February', 'March', 'Total'
  ];
  
  const colIndexes: Record<string, number> = {};
  headerRow.forEach((val: any, idx: number) => {
    const s = String(val).trim();
    const matched = expectedCols.find(col => col.toLowerCase() === s.toLowerCase());
    if (matched) {
      colIndexes[matched] = idx;
    }
  });
  
  // Fallback for Particulars if not matched exactly
  if (colIndexes['Particulars'] === undefined) {
    colIndexes['Particulars'] = 0;
  }
  
  // Fallback for month columns if they weren't matched exactly
  expectedCols.forEach((col, idx) => {
    if (colIndexes[col] === undefined) {
      colIndexes[col] = idx;
    }
  });

  const parsedBlocks: GSTR3BDataBlock[] = [];
  
  let currentLevel1 = '';
  let currentLevel2 = '';
  
  // Level 1 headings
  const level1Headings = [
    '4(A) ITC Available (whether in full or part)',
    '4(B) ITC Reversed',
    '(C) Net ITC Available (A) – (B)',
    '(D) Ineligible ITC'
  ];
  
  // Level 2 sub-categories
  const level2Categories = [
    '(1) Import of goods',
    '(2) Import of services',
    '(3) Inward supplies liable to reverse charge (other than 1 & 2 above)',
    '(4) Inward supplies from ISD',
    '(5) All other ITC',
    '(1) As per rules 38, 42 & 43 of CGST Rules and section 17(5)',
    '(2) Others'
  ];
  
  // Level 3 components
  const level3Components = [
    'IGST Amount',
    'CGST Amount',
    'SGST Amount',
    'Cess Amount',
    'Total ITC'
  ];

  // We start reading data from Row index 2 (Excel Row 3)
  for (let i = 2; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!row || row.length === 0) continue;
    
    const particularsVal = String(row[colIndexes['Particulars']] || '').trim();
    if (!particularsVal) continue;
    
    // Check for Level 1 matching
    const l1Match = level1Headings.find(h => 
      particularsVal.toLowerCase() === h.toLowerCase() || 
      particularsVal.replace(/\s+/g, ' ').toLowerCase().includes(h.replace(/\s+/g, ' ').split(' (')[0].toLowerCase())
    );
    
    if (l1Match || particularsVal.includes('4(A)') || particularsVal.includes('4(B)') || particularsVal.includes('(C) Net') || particularsVal.includes('(D) Ineligible')) {
      currentLevel1 = l1Match || particularsVal;
      currentLevel2 = ''; // Reset level 2 on new level 1
      continue;
    }
    
    // Check for Level 2 matching
    const l2Match = level2Categories.find(c => 
      particularsVal.toLowerCase().includes(c.split(' (')[0].toLowerCase()) ||
      particularsVal.toLowerCase().includes(c.slice(0, 15).toLowerCase())
    );
    
    if (l2Match || particularsVal.startsWith('(1)') || particularsVal.startsWith('(2)') || particularsVal.startsWith('(3)') || particularsVal.startsWith('(4)') || particularsVal.startsWith('(5)')) {
      currentLevel2 = l2Match || particularsVal;
      continue;
    }
    
    // Check for Level 3 component matching
    const l3Match = level3Components.find(c => particularsVal.toLowerCase() === c.toLowerCase() || particularsVal.toLowerCase().includes(c.toLowerCase()));
    if (l3Match) {
      const safeFloat = (val: any): number => {
        if (val === null || val === undefined || val === '') return 0.0;
        if (typeof val === 'number') return val;
        const n = parseFloat(String(val).replace(/[₹,\s]/g, ''));
        return isNaN(n) ? 0.0 : n;
      };
      
      const values = {
        April: safeFloat(row[colIndexes['April']]),
        May: safeFloat(row[colIndexes['May']]),
        June: safeFloat(row[colIndexes['June']]),
        July: safeFloat(row[colIndexes['July']]),
        August: safeFloat(row[colIndexes['August']]),
        September: safeFloat(row[colIndexes['September']]),
        October: safeFloat(row[colIndexes['October']]),
        November: safeFloat(row[colIndexes['November']]),
        December: safeFloat(row[colIndexes['December']]),
        January: safeFloat(row[colIndexes['January']]),
        February: safeFloat(row[colIndexes['February']]),
        March: safeFloat(row[colIndexes['March']]),
        Total: safeFloat(row[colIndexes['Total']]),
      };
      
      parsedBlocks.push({
        level1: currentLevel1 || 'Unknown Heading',
        level2: currentLevel2 || 'General Category',
        level3: l3Match,
        values
      });
    }
  }
  
  return parsedBlocks;
}
