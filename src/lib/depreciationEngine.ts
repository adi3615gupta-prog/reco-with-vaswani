import * as XLSX from 'xlsx-js-style';

// ─── Types ──────────────────────────────────────────────────────────

export interface CompaniesActData {
  companyName: string;
  assets: CompaniesActAssetRow[];
  fyStart: string; // e.g. '2024-04-01'
  fyEnd: string;   // e.g. '2025-03-31'
}

export interface CompaniesActAssetRow {
  name: string;
  type: string; // "Tangible Asset" or "Intangible Asset"
  category: string; // e.g. "Computers", "Plant and Equipment"
  costOfPurchase: number;
  residualValue: number;
  datePutInPlace: string; // YYYY-MM-DD
  dateOfRetirement: string; // YYYY-MM-DD or empty
  usefulLife: number;
  method: 'WDV' | 'SLM';
  dateOfSale: string; // YYYY-MM-DD or empty
  saleValue: number;
  openingAccumulatedDep: number;
}

export interface IncomeTaxData {
  blocks: IncomeTaxBlock[];
  additions: IncomeTaxAddition[];
  fyStart: string;
  fyEnd: string;
}

export interface IncomeTaxBlock {
  blockName: string; // e.g. "7. Plant/ Machinery 40%: computer"
  rate: number; // e.g. 0.40
  openingWdv: number;
  deletions: number;
  isAllAssetsSold?: boolean;
}

export interface IncomeTaxAddition {
  blockName: string;
  assetName: string;
  dateOfPurchase: string;
  amount: number;
  datePutToUse: string;
  additionalDepreciation: number;
}

// ─── Helpers ────────────────────────────────────────────────────────

// Convert JS Date or YYYY-MM-DD string to Excel Date number
export function toExcelDate(dateStr: string): number {
  if (!dateStr) return 0;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 0;
  // Excel epoch is 1900-01-01, but there is a leap year bug in 1900.
  // JS time is ms since 1970-01-01.
  const excelEpoch = new Date(Date.UTC(1899, 11, 30)); 
  return Math.floor((d.getTime() - excelEpoch.getTime()) / (1000 * 60 * 60 * 24));
}

// ─── Companies Act Calculations ─────────────────────────────────────

export function calculateCompaniesAct(data: CompaniesActData) {
  // We need to return an array of rows exactly matching the Excel format.
  const results = [];
  let index = 0;
  
  for (const asset of data.assets) {
    const putInPlace = new Date(asset.datePutInPlace);
    const retirement = asset.dateOfRetirement ? new Date(asset.dateOfRetirement) : null;
    const fyStartDate = new Date(data.fyStart);
    const fyEndDate = new Date(data.fyEnd);
    
    // Calculate SLM/WDV rate
    let wdvRate = 0;
    if (asset.method === 'WDV' && asset.usefulLife > 0 && asset.costOfPurchase > 0) {
       // WDV Rate = 1 - (Residual/Cost)^(1/Life)
       const residual = asset.residualValue || (asset.costOfPurchase * 0.05); // Default 5%
       wdvRate = 1 - Math.pow((residual / asset.costOfPurchase), 1 / asset.usefulLife);
    }
    
    // Depreciation for the period
    let depForPeriod = 0;
    let openingWdv = asset.costOfPurchase - asset.openingAccumulatedDep;
    
    // Days in use this FY
    let useStart = putInPlace > fyStartDate ? putInPlace : fyStartDate;
    let useEnd = fyEndDate;
    if (asset.dateOfSale) {
      const saleDate = new Date(asset.dateOfSale);
      if (saleDate < fyEndDate) useEnd = saleDate;
    }
    
    let daysInUse = 0;
    if (useStart <= useEnd) {
      daysInUse = Math.floor((useEnd.getTime() - useStart.getTime()) / (1000 * 3600 * 24)) + 1;
    }
    const daysInYear = Math.floor((fyEndDate.getTime() - fyStartDate.getTime()) / (1000 * 3600 * 24)) + 1;
    
    if (asset.method === 'WDV') {
      depForPeriod = openingWdv * wdvRate * (daysInUse / daysInYear);
    } else {
      const annualDep = (asset.costOfPurchase - asset.residualValue) / asset.usefulLife;
      depForPeriod = annualDep * (daysInUse / daysInYear);
    }
    
    // Cap depreciation so Closing WDV >= Residual
    if (openingWdv - depForPeriod < asset.residualValue) {
      depForPeriod = openingWdv - asset.residualValue;
    }
    if (depForPeriod < 0) depForPeriod = 0;
    
    const closingAccumulated = asset.openingAccumulatedDep + depForPeriod;
    const closingWdv = asset.costOfPurchase - closingAccumulated;
    
    let gainLoss = 0;
    if (asset.saleValue > 0) {
      gainLoss = asset.saleValue - (openingWdv - depForPeriod);
    }
    
    results.push({
      company: index === 0 ? data.companyName : null,
      name: asset.name,
      type: asset.type,
      category: asset.category,
      cost: asset.costOfPurchase,
      residual: asset.residualValue,
      datePutInPlace: toExcelDate(asset.datePutInPlace),
      dateOfRetirement: asset.dateOfRetirement ? toExcelDate(asset.dateOfRetirement) : null,
      life: asset.usefulLife,
      method: asset.method,
      wdvRateManual: null,
      rateWdv: wdvRate,
      slmDep: asset.method === 'SLM' ? depForPeriod : "",
      dateOfSale: asset.dateOfSale ? toExcelDate(asset.dateOfSale) : null,
      saleOfAsset: asset.dateOfSale ? "Yes" : null,
      saleValue: asset.saleValue || null,
      gainLoss: gainLoss,
      dateTillDepProvided: null,
      accDepOpening: null,
      openingAccDepApr1: asset.openingAccumulatedDep,
      forPeriodEnded: depForPeriod,
      closingAccDep: closingAccumulated,
      closingNetWdv: closingWdv
    });
    
    index++;
  }
  
  return results;
}

// ─── Income Tax Calculations ─────────────────────────────────────────

export function calculateIncomeTax(data: IncomeTaxData) {
  // 180 day rule date: October 4th of the financial year
  // If leap year, it's October 3rd. We calculate 180 days from the end of the year.
  // March 31 minus 180 days:
  const fyEnd = new Date(data.fyEnd);
  const cutoffDate = new Date(fyEnd.getTime() - (180 * 24 * 60 * 60 * 1000));
  
  const results: any[] = [];
  
  let totalOpening = 0;
  let totalAdditionsUpTo = 0;
  let totalAdditionsAfter = 0;
  let totalTotal = 0;
  let totalDep = 0;
  let totalClosing = 0;
  let totalStcg = 0;
  let totalStcl = 0;
  
  for (const block of data.blocks) {
    const adds = data.additions.filter(a => a.blockName === block.blockName);
    
    let addUpTo = 0;
    let addAfter = 0;
    
    for (const add of adds) {
      const putToUse = new Date(add.datePutToUse);
      if (putToUse < cutoffDate) {
        addUpTo += add.amount;
      } else {
        addAfter += add.amount;
      }
    }
    
    const totalWdv = block.openingWdv + addUpTo + addAfter - block.deletions;
    let shortTermCapitalGain = 0;
    let shortTermCapitalLoss = 0;
    let dep = 0;
    let closingWdv = 0;
    
    // Check Section 50 Scenarios
    if (totalWdv < 0) {
      // Scenario B: Sale consideration exceeds Block Value (STCG)
      shortTermCapitalGain = Math.abs(totalWdv);
      closingWdv = 0;
      dep = 0;
    } else if ((block as any).isAllAssetsSold) {
      // Scenario C: Block is empty / ceases to exist physically (STCL)
      shortTermCapitalLoss = totalWdv;
      closingWdv = 0;
      dep = 0;
    } else {
      // Scenario A: Normal Sale, block continues
      let baseForFullDep = block.openingWdv + addUpTo - block.deletions;
      let baseForHalfDep = addAfter;
      
      if (baseForFullDep < 0) {
        // Deletions ate into the < 180 days additions
        baseForHalfDep += baseForFullDep; 
        baseForFullDep = 0;
      }
      
      if (baseForHalfDep < 0) {
         baseForHalfDep = 0; 
      }
      
      dep = (baseForFullDep * block.rate) + (baseForHalfDep * (block.rate / 2));
      closingWdv = totalWdv - dep;
    }
    
    results.push({
      block: block.blockName,
      rateStr: (block.rate * 100) + "%",
      openingWdv: block.openingWdv,
      addUpTo,
      addAfter,
      deletions: block.deletions || null,
      total: totalWdv,
      dep,
      closingWdv,
      stcg: shortTermCapitalGain || null,
      stcl: shortTermCapitalLoss || null,
      blockNot: null
    });
    
    totalOpening += block.openingWdv;
    totalAdditionsUpTo += addUpTo;
    totalAdditionsAfter += addAfter;
    totalTotal += totalWdv;
    totalDep += dep;
    totalClosing += closingWdv;
    totalStcg += shortTermCapitalGain;
    totalStcl += shortTermCapitalLoss;
  }
  
  return { 
    blockResults: results, 
    totals: { 
      totalOpening, 
      totalAdditionsUpTo, 
      totalAdditionsAfter, 
      totalTotal, 
      totalDep, 
      totalClosing,
      totalStcg,
      totalStcl
    }, 
    cutoffDate, 
    fyStart: data.fyStart, 
    fyEnd: data.fyEnd 
  };
}

// ─── Export to Excel Functions ──────────────────────────────────────

const PALETTE = {
  headerBg: "1E293B", // Slate 800
  headerFg: "FFFFFF",
  borderLight: "CBD5E1", // Slate 300
  borderDark: "1E293B",
  zebraBg: "F8FAFC", // Slate 50
  totalBg: "F1F5F9"  // Slate 100
};

const fontConfig = { name: "Segoe UI", sz: 10 };

const styles = {
  title: {
    font: { name: fontConfig.name, sz: 14, bold: true, color: { rgb: "0F172A" } },
    alignment: { horizontal: "left", vertical: "center" }
  },
  subtitle: {
    font: { name: fontConfig.name, sz: 10, italic: true, color: { rgb: "475569" } },
    alignment: { horizontal: "left", vertical: "center" }
  },
  header: {
    fill: { fgColor: { rgb: PALETTE.headerBg } },
    font: { name: fontConfig.name, sz: 10, bold: true, color: { rgb: PALETTE.headerFg } },
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
    border: {
      top: { style: "thin", color: { rgb: PALETTE.borderDark } },
      bottom: { style: "medium", color: { rgb: PALETTE.borderDark } },
      left: { style: "thin", color: { rgb: PALETTE.borderDark } },
      right: { style: "thin", color: { rgb: PALETTE.borderDark } }
    }
  },
  dataLabel: {
    font: fontConfig,
    alignment: { horizontal: "left", vertical: "center" },
    border: {
      bottom: { style: "thin", color: { rgb: "E2E8F0" } },
      left: { style: "thin", color: { rgb: "E2E8F0" } },
      right: { style: "thin", color: { rgb: "E2E8F0" } }
    }
  },
  dataLabelZebra: {
    fill: { fgColor: { rgb: PALETTE.zebraBg } },
    font: fontConfig,
    alignment: { horizontal: "left", vertical: "center" },
    border: {
      bottom: { style: "thin", color: { rgb: "E2E8F0" } },
      left: { style: "thin", color: { rgb: "E2E8F0" } },
      right: { style: "thin", color: { rgb: "E2E8F0" } }
    }
  },
  dataNumber: {
    font: fontConfig,
    alignment: { horizontal: "right", vertical: "center" },
    numFmt: "₹#,##0",
    border: {
      bottom: { style: "thin", color: { rgb: "E2E8F0" } },
      left: { style: "thin", color: { rgb: "E2E8F0" } },
      right: { style: "thin", color: { rgb: "E2E8F0" } }
    }
  },
  dataNumberZebra: {
    fill: { fgColor: { rgb: PALETTE.zebraBg } },
    font: fontConfig,
    alignment: { horizontal: "right", vertical: "center" },
    numFmt: "₹#,##0",
    border: {
      bottom: { style: "thin", color: { rgb: "E2E8F0" } },
      left: { style: "thin", color: { rgb: "E2E8F0" } },
      right: { style: "thin", color: { rgb: "E2E8F0" } }
    }
  },
  dataPercent: {
    font: fontConfig,
    alignment: { horizontal: "right", vertical: "center" },
    numFmt: "0.0%",
    border: {
      bottom: { style: "thin", color: { rgb: "E2E8F0" } },
      left: { style: "thin", color: { rgb: "E2E8F0" } },
      right: { style: "thin", color: { rgb: "E2E8F0" } }
    }
  },
  dataPercentZebra: {
    fill: { fgColor: { rgb: PALETTE.zebraBg } },
    font: fontConfig,
    alignment: { horizontal: "right", vertical: "center" },
    numFmt: "0.0%",
    border: {
      bottom: { style: "thin", color: { rgb: "E2E8F0" } },
      left: { style: "thin", color: { rgb: "E2E8F0" } },
      right: { style: "thin", color: { rgb: "E2E8F0" } }
    }
  },
  dataCenter: {
    font: fontConfig,
    alignment: { horizontal: "center", vertical: "center" },
    border: {
      bottom: { style: "thin", color: { rgb: "E2E8F0" } },
      left: { style: "thin", color: { rgb: "E2E8F0" } },
      right: { style: "thin", color: { rgb: "E2E8F0" } }
    }
  },
  dataCenterZebra: {
    fill: { fgColor: { rgb: PALETTE.zebraBg } },
    font: fontConfig,
    alignment: { horizontal: "center", vertical: "center" },
    border: {
      bottom: { style: "thin", color: { rgb: "E2E8F0" } },
      left: { style: "thin", color: { rgb: "E2E8F0" } },
      right: { style: "thin", color: { rgb: "E2E8F0" } }
    }
  },
  dataDate: {
    font: fontConfig,
    alignment: { horizontal: "center", vertical: "center" },
    numFmt: "yyyy-mm-dd",
    border: {
      bottom: { style: "thin", color: { rgb: "E2E8F0" } },
      left: { style: "thin", color: { rgb: "E2E8F0" } },
      right: { style: "thin", color: { rgb: "E2E8F0" } }
    }
  },
  dataDateZebra: {
    fill: { fgColor: { rgb: PALETTE.zebraBg } },
    font: fontConfig,
    alignment: { horizontal: "center", vertical: "center" },
    numFmt: "yyyy-mm-dd",
    border: {
      bottom: { style: "thin", color: { rgb: "E2E8F0" } },
      left: { style: "thin", color: { rgb: "E2E8F0" } },
      right: { style: "thin", color: { rgb: "E2E8F0" } }
    }
  },
  totalLabel: {
    fill: { fgColor: { rgb: PALETTE.totalBg } },
    font: { name: fontConfig.name, sz: 10, bold: true, color: { rgb: "0F172A" } },
    alignment: { horizontal: "left", vertical: "center" },
    border: {
      top: { style: "thin", color: { rgb: "0F172A" } },
      bottom: { style: "double", color: { rgb: "0F172A" } }
    }
  },
  totalNumber: {
    fill: { fgColor: { rgb: PALETTE.totalBg } },
    font: { name: fontConfig.name, sz: 10, bold: true, color: { rgb: "0F172A" } },
    alignment: { horizontal: "right", vertical: "center" },
    numFmt: "₹#,##0",
    border: {
      top: { style: "thin", color: { rgb: "0F172A" } },
      bottom: { style: "double", color: { rgb: "0F172A" } }
    }
  }
};

function cell(value: any, styleName: keyof typeof styles, formula?: string) {
  const c: any = { v: value, s: styles[styleName] };
  if (value instanceof Date) {
    c.v = toExcelDate(value.toISOString().split('T')[0]);
    c.t = 'n';
  } else if (typeof value === 'number') {
    c.t = 'n';
  } else if (typeof value === 'boolean') {
    c.t = 'b';
  } else {
    c.t = 's';
  }
  if (formula) {
    c.f = formula;
  }
  return c;
}

function gridToSheet(grid: any[][]): any {
  const ws: any = {};
  let maxCol = 0;
  let maxRow = grid.length;
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r];
    if (row.length > maxCol) maxCol = row.length;
    for (let c = 0; c < row.length; c++) {
      const cellVal = row[c];
      if (cellVal !== undefined && cellVal !== null) {
        const cellRef = XLSX.utils.encode_cell({ r, c });
        ws[cellRef] = cellVal;
      }
    }
  }
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow - 1, c: maxCol - 1 } });
  return ws;
}

// Generate Companies Act Grid data
function buildCompaniesActGrid(data: CompaniesActData): any[][] {
  const grid: any[][] = [];
  grid.push([cell("Companies Act Fixed Assets Register (Schedule II)", "title")]);
  grid.push([cell("Financial Year Start:", "subtitle"), cell(toExcelDate(data.fyStart), "dataDate")]);
  grid.push([cell("Financial Year End:", "subtitle"), cell(toExcelDate(data.fyEnd), "dataDate")]);
  grid.push([]); // Empty row
  
  const headers = [
    "Company Name", "Asset Name", "Asset Type", "Category", "Cost of Purchase", 
    "Residual Value", "Date Put in Place", "Date of Retirement", "Useful Life (Yrs)", 
    "Depreciation Method", "WDV Rate (Manual)", "Calculated WDV Rate", 
    "Calculated Depreciation for Period", "Date of Sale", "Sale of Asset", "Sale Value", 
    "Gain / (Loss) on Sale", "Accumulated Dep. Opening", "Period Depreciation", "Closing Acc. Dep", "Closing Net WDV"
  ];
  grid.push(headers.map(h => cell(h, "header")));
  
  const calculated = calculateCompaniesAct(data);
  calculated.forEach((r, idx) => {
    const rowNum = idx + 6; // Data rows start at row 6 (1-based)
    const isZebra = idx % 2 === 1;
    const labelStyle = isZebra ? "dataLabelZebra" : "dataLabel";
    const numStyle = isZebra ? "dataNumberZebra" : "dataNumber";
    const dateStyle = isZebra ? "dataDateZebra" : "dataDate";
    const percentStyle = isZebra ? "dataPercentZebra" : "dataPercent";
    const centerStyle = isZebra ? "dataCenterZebra" : "dataCenter";
    
    grid.push([
      cell(data.companyName, labelStyle),
      cell(r.name, labelStyle),
      cell(r.type, labelStyle),
      cell(r.category, labelStyle),
      cell(r.cost, numStyle),
      cell(null, numStyle, `=E${rowNum}*0.05`), // Residual formula
      cell(r.datePutInPlace, dateStyle),
      cell(r.dateOfRetirement, dateStyle),
      cell(r.life, centerStyle),
      cell(r.method, centerStyle),
      cell(r.wdvRateManual, percentStyle),
      cell(null, percentStyle, `=IF(J${rowNum}="WDV", 1-((F${rowNum}/E${rowNum})^(1/I${rowNum})), 1/I${rowNum})`), // Calculated rate
      cell(null, numStyle, `=MAX(0, MIN(IF(J${rowNum}="WDV", (E${rowNum}-R${rowNum})*L${rowNum}, (E${rowNum}-F${rowNum})*L${rowNum}) * (MAX(0, (IF(N${rowNum}<>0, MIN(N${rowNum}, $B$3), $B$3) - MAX(G${rowNum}, $B$2) + 1)) / ($B$3 - $B$2 + 1)), E${rowNum}-R${rowNum}-F${rowNum}))`), // LIVE formula period dep
      cell(r.dateOfSale, dateStyle),
      cell(r.saleOfAsset, centerStyle),
      cell(r.saleValue, numStyle),
      cell(null, numStyle, `=IF(N${rowNum}<>0, P${rowNum}-(E${rowNum}-R${rowNum}-S${rowNum}), 0)`), // Gain/Loss
      cell(r.openingAccDepApr1, numStyle), // Accumulated Dep Opening
      cell(null, numStyle, `=M${rowNum}`), // Period Dep references Column M
      cell(null, numStyle, `=R${rowNum}+S${rowNum}`), // Closing Accumulated
      cell(null, numStyle, `=E${rowNum}-T${rowNum}`)  // Closing Net WDV
    ]);
  });
  
  const totalRowNum = calculated.length + 6;
  grid.push([
    cell("Total", "totalLabel"),
    null, null, null,
    cell(null, "totalNumber", `=SUM(E6:E${totalRowNum-1})`), // Cost
    cell(null, "totalNumber", `=SUM(F6:F${totalRowNum-1})`), // Residual
    null, null, null, null, null, null, null, null, null,
    cell(null, "totalNumber", `=SUM(P6:P${totalRowNum-1})`), // Sale Value
    cell(null, "totalNumber", `=SUM(Q6:Q${totalRowNum-1})`), // Gain/Loss
    cell(null, "totalNumber", `=SUM(R6:R${totalRowNum-1})`), // Opening Acc Dep
    cell(null, "totalNumber", `=SUM(S6:S${totalRowNum-1})`), // Period Dep
    cell(null, "totalNumber", `=SUM(T6:T${totalRowNum-1})`), // Closing Acc Dep
    cell(null, "totalNumber", `=SUM(U6:U${totalRowNum-1})`)  // Net WDV
  ]);
  
  return grid;
}

// Generate Income Tax Grid data
function buildIncomeTaxGrid(data: IncomeTaxData): any[][] {
  const calc = calculateIncomeTax(data);
  const formattedCutoff = calc.cutoffDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-');
  
  const grid: any[][] = [];
  grid.push([cell("Income Tax Act Depreciation Schedule (Section 32)", "title")]);
  grid.push([cell("Financial Year Start:", "subtitle"), cell(toExcelDate(data.fyStart), "dataDate")]);
  grid.push([cell("Financial Year End:", "subtitle"), cell(toExcelDate(data.fyEnd), "dataDate")]);
  grid.push([]); // Empty row
  
  const headersRow1 = [
    "Block Name", "Rate", "Opening WDV as of 01-Apr", "Additions Put To Use", null, "Deletions during the year", "Total WDV for Dep", "Depreciation", "Closing WDV as of 31-Mar", "Short Term Capital Gain", "Block Ceased to Exist"
  ];
  const headersRow2 = [
    null, null, null, `up to ${formattedCutoff}`, `after ${formattedCutoff}`, null, null, null, null, null, null
  ];
  grid.push(headersRow1.map(h => h ? cell(h, "header") : null));
  grid.push(headersRow2.map(h => h ? cell(h, "header") : null));
  
  calc.blockResults.forEach((r: any, idx: number) => {
    const rowNum = idx + 7; // Rows start at 7 (1-based)
    const isZebra = idx % 2 === 1;
    const labelStyle = isZebra ? "dataLabelZebra" : "dataLabel";
    const numStyle = isZebra ? "dataNumberZebra" : "dataNumber";
    const percentStyle = isZebra ? "dataPercentZebra" : "dataPercent";
    const centerStyle = isZebra ? "dataCenterZebra" : "dataCenter";
    
    grid.push([
      cell(r.block, labelStyle),
      cell(r.rateStr ? parseFloat(r.rateStr)/100 : 0.15, percentStyle),
      cell(r.openingWdv, numStyle),
      cell(r.addUpTo || 0, numStyle),
      cell(r.addAfter || 0, numStyle),
      cell(r.deletions || 0, numStyle),
      cell(null, numStyle, `=C${rowNum}+D${rowNum}+E${rowNum}-F${rowNum}`), // Total WDV
      cell(null, numStyle, `=IF(G${rowNum}<=0, 0, (G${rowNum} - MIN(E${rowNum}, G${rowNum})) * B${rowNum} + MIN(E${rowNum}, G${rowNum}) * (B${rowNum}/2))`), // Depreciation formula
      cell(null, numStyle, `=MAX(0, G${rowNum}-H${rowNum})`), // Closing WDV
      cell(null, numStyle, `=IF(G${rowNum}<0, ABS(G${rowNum}), 0)`), // STCG
      cell(null, centerStyle, `=IF(G${rowNum}<=0, "Yes", "No")`) // Block ceased
    ]);
  });
  
  const totalRowNum = calc.blockResults.length + 7;
  grid.push([
    cell("Total", "totalLabel"),
    null,
    cell(null, "totalNumber", `=SUM(C7:C${totalRowNum-1})`), // Opening
    cell(null, "totalNumber", `=SUM(D7:D${totalRowNum-1})`), // Up to
    cell(null, "totalNumber", `=SUM(E7:E${totalRowNum-1})`), // After
    cell(null, "totalNumber", `=SUM(F7:F${totalRowNum-1})`), // Deletions
    cell(null, "totalNumber", `=SUM(G7:G${totalRowNum-1})`), // Total WDV
    cell(null, "totalNumber", `=SUM(H7:H${totalRowNum-1})`), // Depreciation
    cell(null, "totalNumber", `=SUM(I7:I${totalRowNum-1})`), // Closing
    cell(null, "totalNumber", `=SUM(J7:J${totalRowNum-1})`)  // STCG
  ]);
  
  // Additions sub-table
  grid.push([]);
  grid.push([]);
  grid.push([cell("Detailed Additions Log Book", "title")]);
  
  const addHeaders = ["Block Name", "Asset Name", "Date of Purchase", "Purchase Amount", "Additional Depreciation Rate", "Date Put To Use"];
  grid.push(addHeaders.map(h => cell(h, "header")));
  
  data.additions.forEach((add, idx) => {
    const isZebra = idx % 2 === 1;
    const labelStyle = isZebra ? "dataLabelZebra" : "dataLabel";
    const numStyle = isZebra ? "dataNumberZebra" : "dataNumber";
    const dateStyle = isZebra ? "dataDateZebra" : "dataDate";
    
    grid.push([
      cell(add.blockName, labelStyle),
      cell(add.assetName, labelStyle),
      cell(add.dateOfPurchase, dateStyle),
      cell(add.amount, numStyle),
      cell(add.additionalDepreciation || 0, isZebra ? "dataPercentZebra" : "dataPercent"),
      cell(add.datePutToUse, dateStyle)
    ]);
  });
  
  return grid;
}

export function exportCompaniesAct(data: CompaniesActData) {
  const grid = buildCompaniesActGrid(data);
  const ws = gridToSheet(grid);
  
  const wscols = Array(25).fill(0).map(() => ({ wch: 15 }));
  wscols[0] = { wch: 18 }; // Company
  wscols[1] = { wch: 28 }; // Asset Name
  wscols[3] = { wch: 18 }; // Category
  wscols[12] = { wch: 18 }; // Depreciation for period
  ws['!cols'] = wscols;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "FAR");
  XLSX.writeFile(wb, "FAR_Export_Companies_Act.xlsx");
}

export function exportIncomeTax(data: IncomeTaxData) {
  const grid = buildIncomeTaxGrid(data);
  const ws = gridToSheet(grid);
  
  const wscols = Array(15).fill(0).map(() => ({ wch: 15 }));
  wscols[0] = { wch: 28 }; // Block
  ws['!cols'] = wscols;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Income Tax");
  XLSX.writeFile(wb, "Income_Tax_Depreciation.xlsx");
}

// ─── Combined 3-Sheet Comprehensive Export ────────────────────────────
export function exportComprehensiveReport(
  compData: CompaniesActData,
  itData: IncomeTaxData,
  assetBlockMapping: Record<string, string>
) {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Companies Act FAR
  const compGrid = buildCompaniesActGrid(compData);
  const wsComp = gridToSheet(compGrid);
  const wscols1 = Array(25).fill(0).map(() => ({ wch: 15 }));
  wscols1[0] = { wch: 18 }; // Company
  wscols1[1] = { wch: 28 }; // Asset Name
  wscols1[3] = { wch: 18 }; // Category
  wscols1[12] = { wch: 18 }; // Depreciation for period
  wsComp['!cols'] = wscols1;
  XLSX.utils.book_append_sheet(wb, wsComp, "FAR");

  // Sheet 2: Income Tax
  const itGrid = buildIncomeTaxGrid(itData);
  const wsIt = gridToSheet(itGrid);
  const wscols2 = Array(15).fill(0).map(() => ({ wch: 15 }));
  wscols2[0] = { wch: 28 }; // Block
  wsIt['!cols'] = wscols2;
  XLSX.utils.book_append_sheet(wb, wsIt, "Income Tax");

  // Sheet 3: Deferred Tax Variance
  const dtaGrid: any[][] = [];
  dtaGrid.push([cell("Deferred Tax Asset / (Liability) Variance Schedule", "title")]);
  dtaGrid.push([cell("Corporate Tax Rate:", "subtitle"), cell(0.30, "dataPercent")]); // Cell B2 is 30%
  dtaGrid.push([]);
  
  const headers3 = [
    "Asset Category", "Companies Act Depreciation (Schedule II)", "Mapped IT Block", "Income Tax Depreciation (Sec 32)", "Depreciation Variance", "Deferred Tax Impact", "Classification"
  ];
  dtaGrid.push(headers3.map(h => cell(h, "header")));
  
  const uniqueCategories = Array.from(new Set(compData.assets.map(a => a.category)));
  uniqueCategories.forEach((cat, idx) => {
    const rowNum = idx + 5; // Data rows start at Row 5 in Excel
    const isZebra = idx % 2 === 1;
    const labelStyle = isZebra ? "dataLabelZebra" : "dataLabel";
    const numStyle = isZebra ? "dataNumberZebra" : "dataNumber";
    const centerStyle = isZebra ? "dataCenterZebra" : "dataCenter";
    
    // Find mapped IT block for any asset in this category as default hint
    const sampleAsset = compData.assets.find(a => a.category === cat);
    const mappedBlock = sampleAsset ? (assetBlockMapping[sampleAsset.name] || 'Plant & Machinery 15%') : 'Plant & Machinery 15%';

    dtaGrid.push([
      cell(cat, labelStyle),
      cell(null, numStyle, `=SUMIF(FAR!$D$6:$D$500, A${rowNum}, FAR!$S$6:$S$500)`), // SUMIF from FAR
      cell(mappedBlock, labelStyle),
      cell(null, numStyle, `=SUMIF('Income Tax'!$A$7:$A$500, C${rowNum}, 'Income Tax'!$H$7:$H$500)`), // SUMIF from Income Tax
      cell(null, numStyle, `=B${rowNum}-D${rowNum}`), // Variance
      cell(null, numStyle, `=E${rowNum}*$B$2`), // Deferred Tax Impact
      cell(null, centerStyle, `=IF(E${rowNum}>0, "Deferred Tax Asset (DTA)", "Deferred Tax Liability (DTL)")`) // Classification
    ]);
  });
  
  // Total Row
  const totalRowNumDta = uniqueCategories.length + 5;
  dtaGrid.push([
    cell("Total Summary", "totalLabel"),
    cell(null, "totalNumber", `=SUM(B5:B${totalRowNumDta-1})`), // Total Companies Dep
    null,
    cell(null, "totalNumber", `=SUM(D5:D${totalRowNumDta-1})`), // Total IT Dep
    cell(null, "totalNumber", `=SUM(E5:E${totalRowNumDta-1})`), // Total Variance
    cell(null, "totalNumber", `=SUM(F5:F${totalRowNumDta-1})`), // Total DTA/DTL
    null
  ]);

  const wsDta = gridToSheet(dtaGrid);
  const wscols3 = [
    { wch: 28 }, // Category Name
    { wch: 28 }, // Companies Act Dep
    { wch: 22 }, // Mapped IT Block
    { wch: 24 }, // Income Tax Dep
    { wch: 20 }, // Variance
    { wch: 18 }, // Deferred Tax Impact
    { wch: 24 }  // Classification
  ];
  wsDta['!cols'] = wscols3;
  XLSX.utils.book_append_sheet(wb, wsDta, "Deferred Tax");

  XLSX.writeFile(wb, `Comprehensive_Depreciation_Report_${compData.companyName.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`);
}

export function exportWorkingTemplate(assets: CompaniesActAssetRow[]) {
  const headers = [
    "Asset Name",
    "Category (Tally Group)",
    "Type (Tangible/Intangible)",
    "Original Cost of Purchase",
    "Opening Accumulated Depreciation",
    "Date of Put in Use (YYYY-MM-DD)",
    "Useful Life (Years)",
    "Residual Value",
    "Depreciation Method (WDV/SLM)",
    "Date of Sale (YYYY-MM-DD)",
    "Sale Value"
  ];
  
  const rows: any[][] = [headers];
  for (const a of assets) {
    rows.push([
      a.name,
      a.category,
      a.type,
      a.costOfPurchase,
      a.openingAccumulatedDep,
      a.datePutInPlace,
      a.usefulLife,
      a.residualValue,
      a.method,
      a.dateOfSale || "",
      a.saleValue || 0
    ]);
  }
  
  const ws = XLSX.utils.aoa_to_sheet(rows);
  
  // Format column widths
  const wscols = headers.map(h => ({ wch: h.length + 5 }));
  ws['!cols'] = wscols;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Fixed Assets Input");
  
  XLSX.writeFile(wb, "Fixed_Assets_Working_Template.xlsx");
}

export function parseWorkingTemplate(sheetData: any[][]): CompaniesActAssetRow[] {
  const assets: CompaniesActAssetRow[] = [];
  
  // Skip header row
  for (let i = 1; i < sheetData.length; i++) {
    const row = sheetData[i];
    if (!row || row.length === 0 || !row[0]) continue;
    
    // Helper to format dates correctly
    const parseDateValue = (val: any): string => {
      if (!val) return '';
      if (typeof val === 'number') {
        // Handle Excel numeric dates (accounting for Excel 1900 date system)
        const dateObj = new Date((val - 25569) * 86400 * 1000);
        return dateObj.toISOString().split('T')[0];
      }
      return String(val).trim();
    };

    assets.push({
      name: String(row[0]).trim(),
      category: String(row[1] || 'Fixed Assets').trim(),
      type: String(row[2] || 'Tangible Asset').trim(),
      costOfPurchase: Number(row[3]) || 0,
      openingAccumulatedDep: Number(row[4]) || 0,
      datePutInPlace: parseDateValue(row[5]),
      usefulLife: Number(row[6]) || 5,
      residualValue: Number(row[7]) || 0,
      method: String(row[8] || 'WDV').trim().toUpperCase() === 'SLM' ? 'SLM' : 'WDV',
      dateOfSale: parseDateValue(row[9]),
      saleValue: Number(row[10]) || 0,
      dateOfRetirement: ''
    });
  }
  
  return assets;
}
