import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import {
  recalculateAnnualWorking,
  createEmptyAnnualWorking,
  GSTR3B_MONTHS,
  GSTR3BMonthKey
} from '../src/lib/gstr3bEngine';

const filePath = 'D:/My software/full and final/6. September-2026/3B working/DYP Infraprojects Private Limited GSTR-3B Working September-26.xlsx';
if (!fs.existsSync(filePath)) {
  console.error('File not found:', filePath);
  process.exit(1);
}

const buf = fs.readFileSync(filePath);
const wb = XLSX.read(buf, { type: 'buffer' });

const annual = createEmptyAnnualWorking();
annual.profile.financialYear = '2026-27';

// 1. Business details
if (wb.SheetNames.includes('Business Details')) {
  const bdRows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets['Business Details'], { header: 1, defval: '' });
  for (const r of bdRows) {
    const lbl = String(r[0] || '').toUpperCase();
    const val = String(r[1] || '').trim();
    if (!val) continue;
    if (lbl.includes('FIRM NAME')) annual.profile.firmName = val;
    if (lbl.includes('GST NO')) annual.profile.gstin = val.toUpperCase();
    if (lbl.includes('ADDRESS')) annual.profile.address = val;
    if (lbl.includes('CONTACT PERSON')) annual.profile.contact = val;
    if (lbl.includes('NATURE OF BUSINESS')) annual.profile.natureOfBusiness = val;
    if (lbl.includes('AUTHORISED SIGNATORY')) annual.profile.authorisedSignatory = val;
    if (lbl.includes('FILING EMAIL')) annual.profile.filingEmail = val;
    if (lbl.includes('FILING MOBILE')) annual.profile.filingPhone = val;
    if (lbl.includes('REGISTRATION DATE')) annual.profile.registrationDate = val;
  }
}

const parseNum = (v: any) => {
  if (typeof v === 'number') return v;
  const s = String(v || '').replace(/[^0-9.-]/g, '');
  const parsed = parseFloat(s);
  return isNaN(parsed) ? 0 : parsed;
};

const parseRowTax = (r: any[]) => {
  const isColBLabel = Boolean(r[1] && typeof r[1] === 'string' && r[1].trim());
  let taxable = 0, cgst = 0, sgst = 0, igst = 0, total = 0;
  if (isColBLabel) {
    taxable = parseNum(r[2]);
    cgst = parseNum(r[3]);
    sgst = parseNum(r[4]);
    igst = parseNum(r[5]);
    total = parseNum(r[6]) || (cgst + sgst + igst);
  } else {
    taxable = parseNum(r[1]);
    cgst = parseNum(r[2]);
    sgst = parseNum(r[3]);
    igst = parseNum(r[4]);
    total = parseNum(r[5]) || (cgst + sgst + igst);
  }
  return { taxable, cgst, sgst, igst, total };
};

const monthMap: Record<string, string> = {
  April: '01 - April',
  May: '02 - May',
  June: '03 - June',
  July: '04 - July',
  August: '05 - August',
  September: '06 - September',
  October: '07 - October',
  November: '08 - November',
  December: '09 - December',
  January: '10 - January',
  February: '11 - February',
  March: '12 - March'
};

for (const sheetName of wb.SheetNames) {
  if (sheetName.toLowerCase().includes('consolidated') ||
      sheetName.toLowerCase().includes('payment') ||
      sheetName.toLowerCase().includes('details') ||
      sheetName.toLowerCase().includes('introduction') ||
      sheetName.toLowerCase().includes('summary') ||
      sheetName.toLowerCase().includes('range')) {
    continue;
  }

  const matchedMonth = GSTR3B_MONTHS.find(m => sheetName.toLowerCase().includes(m.toLowerCase()));
  if (!matchedMonth) continue;

  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' });
  const mData = annual.months[matchedMonth];
  const yrMatch = sheetName.match(/20\d{2}/);
  if (yrMatch) mData.year = yrMatch[0];

  let inInwardSection = false;

  for (let rIdx = 0; rIdx < rows.length; rIdx++) {
    const r = rows[rIdx] || [];
    const rowTxt = r.map((c: any) => String(c)).join(' ').toUpperCase();

    if (rowTxt.includes('INWARD SUPPLIES')) inInwardSection = true;

    if (rowTxt.includes('SALES (B2B)')) mData.outward.b2b = parseRowTax(r);
    else if (rowTxt.includes('SALES (B2C)')) mData.outward.b2c = parseRowTax(r);
    else if (rowTxt.includes('SEZ SUPPLY WITH PAYMENT')) mData.outward.sezWithPayment = parseRowTax(r);
    else if (rowTxt.includes('SEZ SUPPLY WITHOUT-PAYMENT') || rowTxt.includes('SEZ SUPPLY WITHOUT PAYMENT')) mData.outward.sezWithoutPayment = parseRowTax(r);
    else if (rowTxt.includes('ZERO RATED')) mData.outward.zeroRated = parseRowTax(r);
    else if (rowTxt.includes('NIL RATED')) mData.outward.nilRated = parseRowTax(r);
    else if (rowTxt.includes('EXEMPT SALE') || rowTxt.includes('EXEMPTED SALE')) mData.outward.exempt = parseRowTax(r);
    else if (rowTxt.includes('ADVANCES COLLECTED') || rowTxt.includes('ADVANCE RECEIVED')) mData.outward.advanceReceived = parseRowTax(r);
    else if (rowTxt.includes('RENT RECEIVED')) mData.outward.rentReceived = parseRowTax(r);
    else if (rowTxt.includes('SALE INCREASED THROUGH AMENDMENT') || rowTxt.includes('SALE INCREASE')) mData.outward.saleIncreaseAmendment = parseRowTax(r);
    else if (rowTxt.includes('SALE DECREASED THROUGH AMENDMENT') || rowTxt.includes('SALE DECREASE')) mData.outward.saleDecreaseAmendment = parseRowTax(r);
    else if (!inInwardSection && (rowTxt.includes('(-) CREDIT NOTE') || rowTxt.includes('CREDIT NOTE'))) mData.outward.creditNote = parseRowTax(r);
    else if (rowTxt.includes('ADVANCES SETTLED') || rowTxt.includes('ADVANCE ADJUSTED')) mData.outward.advanceAdjusted = parseRowTax(r);
    else if (rowTxt.includes('RCM ON TRANSPORT')) mData.outward.rcmTransport = parseRowTax(r);
    else if (rowTxt.includes('RCM ON SECURITY')) mData.outward.rcmSecurity = parseRowTax(r);
    else if (rowTxt.includes('RCM ON GUEST HOUSE')) mData.outward.rcmGuestHouse = parseRowTax(r);
    else if (rowTxt.includes('RCM ON ADVOCATE')) mData.outward.rcmAdvocate = parseRowTax(r);
    else if (rowTxt.includes('REVERSE CHARGE ON INWARD')) mData.outward.rcmInward = parseRowTax(r);
    else if (rowTxt.includes('ITC (AS PER BOOKS)')) mData.inward.itcBooks = parseNum(r[6] || r[7] || r[3] || 0);
    else if (rowTxt.includes('ITC AS PER GSTR 2B') || rowTxt.includes('ITC AS PER 2B')) mData.inward.itc2b = parseRowTax(r);
    else if (rowTxt.includes('IMPORT PURCHASE') || rowTxt.includes('IMPORT OF GOODS')) mData.inward.importGoods = parseRowTax(r);
    else if (inInwardSection && (rowTxt.includes('(+) CREDIT NOTES') || rowTxt.includes('CREDIT NOTES'))) mData.inward.creditNotes = parseRowTax(r);
    else if (rowTxt.includes('OPENING CREDIT BAL')) mData.inward.openingCreditBal = parseRowTax(r);
    else if (rowTxt.includes('(-) DEBIT NOTES') || (inInwardSection && rowTxt.includes('DEBIT NOTES'))) mData.inward.debitNotes = parseRowTax(r);
    else if (rowTxt.includes('ITC REVERSED') || rowTxt.includes('INELIGIBLE CREDIT')) mData.inward.itcReversed = parseRowTax(r);
    else if (rowTxt.includes('(-) ADJUSTMENT') || rowTxt.includes('ADJUSTMENT')) {
      mData.setoff.adjustment = parseRowTax(r);
      if (mData.setoff.adjustment.cgst !== 0 || mData.setoff.adjustment.sgst !== 0 || mData.setoff.adjustment.igst !== 0) {
        mData.setoff.isManualAdjustment = true;
      }
    }
    else if (rowTxt.includes('TDS/TCS') || rowTxt.includes('GST TDS')) mData.settlement.tdsTcsOpeningCash = parseRowTax(r);
    else if (rowTxt.includes('LATE FEES')) {
      const cgst = parseNum(r[3] !== undefined && typeof r[2] === 'number' ? r[3] : r[4]);
      const sgst = parseNum(r[4] !== undefined && typeof r[2] === 'number' ? r[4] : r[5]);
      mData.settlement.lateFees = { cgst, sgst, total: cgst + sgst };
    } else if (rowTxt.includes('INTEREST')) {
      const cgst = parseNum(r[3] !== undefined && typeof r[2] === 'number' ? r[3] : r[4]);
      const sgst = parseNum(r[4] !== undefined && typeof r[2] === 'number' ? r[4] : r[5]);
      const igst = parseNum(r[5] !== undefined && typeof r[2] === 'number' ? r[5] : r[6]);
      mData.settlement.interest = { cgst, sgst, igst, total: cgst + sgst + igst };
    } else if (rowTxt.includes('PAID THROUGH CASH') || rowTxt.includes('PMT-06')) {
      mData.settlement.gstPaidThroughCash = parseRowTax(r);
    }
  }
}

// Perform full chaining and statutory calculation across all 12 months
const finalAnnual = recalculateAnnualWorking(annual);

// Target Storage Directory
const targetDir = path.resolve('gst_returns_data', `${finalAnnual.profile.firmName} - ${finalAnnual.profile.gstin}`, '2026-27');
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

// 1. Write annual working JSONs
const annualJsonPath = path.join(targetDir, 'annual_gstr3b_working.json');
const fyJsonPath = path.join(targetDir, 'gstr3b_2026-27.json');

fs.writeFileSync(annualJsonPath, JSON.stringify(finalAnnual, null, 2), 'utf8');
fs.writeFileSync(fyJsonPath, JSON.stringify(finalAnnual, null, 2), 'utf8');
console.log('✅ Successfully wrote annual working to:', annualJsonPath);

// 2. Write individual month JSONs
for (const m of GSTR3B_MONTHS) {
  const mFolder = monthMap[m];
  if (!mFolder) continue;
  const monthDir = path.join(targetDir, mFolder);
  if (!fs.existsSync(monthDir)) fs.mkdirSync(monthDir, { recursive: true });

  const mData = finalAnnual.months[m];
  const mFile = path.join(monthDir, `gstr3b_${m}.json`);
  fs.writeFileSync(mFile, JSON.stringify(mData, null, 2), 'utf8');
}

console.log('✅ All 12 monthly folders synchronized successfully for DYP INFRAPROJECTS 2026-27!');
