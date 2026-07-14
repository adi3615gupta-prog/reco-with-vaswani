import * as XLSX from 'xlsx-js-style';

export interface GSTR3BDataBlock {
  month: string;
  igst: number;
  cgst: number;
  sgst: number;
  taxable: number;
}

export async function parseGSTR3BFile(file: File): Promise<GSTR3BDataBlock[]> {
  const buffer = await file.arrayBuffer();
  // Parse workbook (handles both .xlsx and .csv files automatically)
  const wb = XLSX.read(buffer, { type: 'array' });
  
  const months = [
    'April', 'May', 'June', 'July', 'August', 'September', 
    'October', 'November', 'December', 'January', 'February', 'March'
  ];
  
  // Initialize the default 12-month data blocks
  const dataBlocks: GSTR3BDataBlock[] = months.map(m => ({ month: m, igst: 0, cgst: 0, sgst: 0, taxable: 0 }));

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json<any>(sheet, { header: 1, defval: '' });
    
    let headerRowIndex = -1;
    
    // 1. Metadata Headers: Find the actual tabular data headers dynamically (skips 1 or 2 metadata rows)
    for (let i = 0; i < Math.min(json.length, 10); i++) {
      const row = json[i] || [];
      const values = Object.values(row).map(v => String(v).toLowerCase().trim());
      
      const hasParticulars = values.some(v => v.includes('particulars'));
      const hasApril = values.some(v => v === 'april' || v === 'apr' || v.startsWith('apr-') || v.startsWith('april '));
      const hasTotal = values.some(v => v.includes('total'));

      if (hasParticulars && hasApril && hasTotal) {
        headerRowIndex = i;
        break;
      }
    }

    if (headerRowIndex === -1) continue; 

    const headers = json[headerRowIndex] as string[];
    const monthIndices: Record<string, number> = {};
    let totalIdx = -1;
    let particularsIdx = -1;

    // Map exact column positions robustly
    headers.forEach((h, idx) => {
      const val = String(h).trim();
      
      for (const m of months) {
        const mLower = m.toLowerCase();
        const shortM = mLower.substring(0, 3);
        if (val === mLower || val.startsWith(mLower + '-') || val.startsWith(mLower + ' ') || val === shortM || val.startsWith(shortM + '-')) {
          monthIndices[m] = idx;
          break;
        }
      }

      if (val.includes('total')) totalIdx = idx;
      if (val.includes('particulars')) particularsIdx = idx;
    });

    if (particularsIdx === -1 || totalIdx === -1) continue;

    let currentCategoryHeading = '';

    // 2. Data Extractor
    for (let i = headerRowIndex + 1; i < json.length; i++) {
      const row = json[i] || [];
      const particularsStr = String(row[particularsIdx] || '').trim();
      const totalVal = row[totalIdx];
      
      // Sub-heading validation: Null, Blank or '-' in the Total column
      const totalStr = String(totalVal || '').replace(/,/g, '').trim();
      const totalIsBlank = totalStr === '' || totalStr === '-' || isNaN(parseFloat(totalStr));

      if (!particularsStr) continue;

      // 3. Store category sub-heading and skip/filter out the row
      if (totalIsBlank) {
        currentCategoryHeading = particularsStr;
        continue; 
      }

      // 4. Look for ITC claim sections or Outward supplies
      const particularsLower = particularsStr.toLowerCase();
      const headingLower = currentCategoryHeading.toLowerCase();
      
      const isEligibleITC = headingLower.includes('all other itc') || headingLower.includes('net itc');
      const isOutward = headingLower.includes('outward taxable supplies') || headingLower.includes('outward supplies');
      
      const isTargetSection = isEligibleITC || isOutward;

      const isIgst = particularsLower.includes('integrated') || particularsLower.includes('igst');
      const isCgst = particularsLower.includes('central') || particularsLower.includes('cgst');
      const isSgst = particularsLower.includes('state') || particularsLower.includes('sgst') || particularsLower.includes('ut tax');
      const isTaxable = particularsLower.includes('taxable');

      if (isTargetSection && (isIgst || isCgst || isSgst || (isTaxable && isOutward))) {
        months.forEach(m => {
          const mIdx = monthIndices[m];
          if (mIdx !== undefined) {
            // Fill empty cells with 0
            const cellVal = String(row[mIdx] || '0').replace(/,/g, '');
            const val = parseFloat(cellVal) || 0; 
            
            const target = dataBlocks.find(b => b.month === m);
            if (target) {
              if (isIgst) target.igst += val;
              else if (isCgst) target.cgst += val;
              else if (isSgst) target.sgst += val;
              else if (isTaxable && isOutward) target.taxable += val;
            }
          }
        });
      }
    }
  }

  return dataBlocks;
}