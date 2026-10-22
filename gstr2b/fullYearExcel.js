import * as xlsxModule from 'xlsx';
const XLSX = xlsxModule.default || xlsxModule;

/**
 * removeAllMergesFromWorkbook — Defense-in-depth zero-merge enforcement.
 * Strips all '!merges' arrays from every worksheet in the workbook
 * to guarantee 100% filterable and sortable spreadsheets for CAs.
 */
export function removeAllMergesFromWorkbook(wb) {
    if (!wb || !wb.SheetNames) return wb;
    for (const name of wb.SheetNames) {
        const ws = wb.Sheets[name];
        if (ws) {
            ws['!merges'] = [];
            delete ws['!merges'];
        }
    }
    return wb;
}

/**
 * generateGstr2bFullYearWorkbook — Generates 12-Month Consolidated GSTR-2B Workbook
 * matching the exact architecture of GSTR2B_SectionWiseSummary_Amendment_152638.xlsx
 * 
 * Sheets created:
 * 1. B2B (Invoices + Month-wise Summary + Party-wise Summary)
 * 2. CDNR (Notes + Month-wise Summary + Party-wise Summary)
 * 3. ECO
 * 4. ISD
 * 5. IMPG
 * 6. IMPGSEZ
 * 7. B2B(Rejected)
 * 8. CDNR(Rejected)
 * 
 * Strict architectural rule: ZERO CELL MERGES (ws['!merges'] = [])
 */

const MONTH_ORDER = [
    'April', 'May', 'June', 'July', 'August', 'September',
    'October', 'November', 'December', 'January', 'February', 'March'
];

function cleanVal(v) {
    return v === null || v === undefined ? '' : v;
}

function round2(num) {
    return Math.round((Number(num) || 0) * 100) / 100;
}

function formatGeneratedTimestamp() {
    const d = new Date();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const day = String(d.getDate()).padStart(2, '0');
    const mon = months[d.getMonth()];
    const yr = d.getFullYear();
    const hrs = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    const secs = String(d.getSeconds()).padStart(2, '0');
    return `${day}-${mon}-${yr} ${hrs}:${mins}:${secs}`;
}

export function generateGstr2bFullYearWorkbook({
    clientInfo = {},
    financialYear = '2025-2026',
    invoices = []
}) {
    const wb = XLSX.utils.book_new();
    const dealerName = clientInfo.trade_name || clientInfo.legal_name || 'DEALER';
    const gstin = (clientInfo.gstin || '').toUpperCase();
    const timestampStr = formatGeneratedTimestamp();

    // ─── 1. GROUP INVOICES BY SECTION ──────────────────────────────────────────
    const b2bInvoices = [];
    const cdnrInvoices = [];
    const ecoInvoices = [];
    const isdInvoices = [];
    const impgInvoices = [];
    const impgSezInvoices = [];
    const b2bRejected = [];
    const cdnrRejected = [];

    for (const inv of invoices) {
        const sec = (inv.section || 'B2B').toUpperCase();
        const isEligible = inv.itc_available !== 'N';

        if (sec.includes('REJECTED') || !isEligible) {
            if (sec.includes('CDNR')) {
                cdnrRejected.push(inv);
            } else {
                b2bRejected.push(inv);
            }
        } else if (sec.includes('CDNR')) {
            cdnrInvoices.push(inv);
        } else if (sec.includes('ISD')) {
            isdInvoices.push(inv);
        } else if (sec.includes('IMPGSEZ') || sec.includes('IMPG-SEZ')) {
            impgSezInvoices.push(inv);
        } else if (sec.includes('IMPG')) {
            impgInvoices.push(inv);
        } else if (sec.includes('ECO')) {
            ecoInvoices.push(inv);
        } else {
            // Default B2B / B2BA
            b2bInvoices.push(inv);
        }
    }

    // ─── 2. CALCULATE MONTH-WISE & PARTY-WISE SUMMARIES ─────────────────────────
    const monthStats = {};
    MONTH_ORDER.forEach(m => {
        monthStats[m.toUpperCase()] = {
            b2b: { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 },
            cdnr: { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 }
        };
    });

    const partyStats = {};

    const getMonthNameFromPeriod = (periodStr, idt) => {
        const p = (periodStr || '').toLowerCase().trim();
        for (const m of MONTH_ORDER) {
            if (p.includes(m.toLowerCase())) return m.toUpperCase();
        }
        // Handle MMYYYY (e.g. "042025", "122024") or MM-YYYY (e.g. "04-2025")
        const mmMatch = p.match(/^(0[1-9]|1[0-2])[\s\-\/]?(20\d{2})$/);
        if (mmMatch) {
            const mNum = parseInt(mmMatch[1], 10);
            const calendarOrder = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
            return calendarOrder[mNum - 1].toUpperCase();
        }
        if (idt) {
            const cleanDate = String(idt).trim().replace(/\//g, '-');
            const parts = cleanDate.split('-');
            if (parts.length >= 3) {
                // If format is YYYY-MM-DD
                if (parts[0].length === 4) {
                    const mNum = parseInt(parts[1], 10);
                    if (mNum >= 1 && mNum <= 12) {
                        const calendarOrder = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
                        return calendarOrder[mNum - 1].toUpperCase();
                    }
                } else {
                    // Format is DD-MM-YYYY
                    const mNum = parseInt(parts[1], 10);
                    if (mNum >= 1 && mNum <= 12) {
                        const calendarOrder = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
                        return calendarOrder[mNum - 1].toUpperCase();
                    }
                }
            }
        }
        return 'APRIL';
    };

    b2bInvoices.forEach(inv => {
        const mKey = getMonthNameFromPeriod(inv.return_period, inv.idt);
        if (monthStats[mKey]) {
            monthStats[mKey].b2b.taxable += Number(inv.txval) || 0;
            monthStats[mKey].b2b.cgst += Number(inv.cgst) || 0;
            monthStats[mKey].b2b.sgst += Number(inv.sgst) || 0;
            monthStats[mKey].b2b.igst += Number(inv.igst) || 0;
            monthStats[mKey].b2b.cess += Number(inv.cess) || 0;
        }

        const partyName = (inv.supplier_name || inv.ctin || 'UNKNOWN').trim().toUpperCase();
        if (!partyStats[partyName]) {
            partyStats[partyName] = {
                b2b: { taxable: 0, cgst: 0, sgst: 0, igst: 0 },
                cdnr: { taxable: 0, cgst: 0, sgst: 0, igst: 0 }
            };
        }
        partyStats[partyName].b2b.taxable += Number(inv.txval) || 0;
        partyStats[partyName].b2b.cgst += Number(inv.cgst) || 0;
        partyStats[partyName].b2b.sgst += Number(inv.sgst) || 0;
        partyStats[partyName].b2b.igst += Number(inv.igst) || 0;
    });

    cdnrInvoices.forEach(inv => {
        const mKey = getMonthNameFromPeriod(inv.return_period, inv.idt);
        if (monthStats[mKey]) {
            monthStats[mKey].cdnr.taxable += Number(inv.txval) || 0;
            monthStats[mKey].cdnr.cgst += Number(inv.cgst) || 0;
            monthStats[mKey].cdnr.sgst += Number(inv.sgst) || 0;
            monthStats[mKey].cdnr.igst += Number(inv.igst) || 0;
            monthStats[mKey].cdnr.cess += Number(inv.cess) || 0;
        }

        const partyName = (inv.supplier_name || inv.ctin || 'UNKNOWN').trim().toUpperCase();
        if (!partyStats[partyName]) {
            partyStats[partyName] = {
                b2b: { taxable: 0, cgst: 0, sgst: 0, igst: 0 },
                cdnr: { taxable: 0, cgst: 0, sgst: 0, igst: 0 }
            };
        }
        partyStats[partyName].cdnr.taxable += Number(inv.txval) || 0;
        partyStats[partyName].cdnr.cgst += Number(inv.cgst) || 0;
        partyStats[partyName].cdnr.sgst += Number(inv.sgst) || 0;
        partyStats[partyName].cdnr.igst += Number(inv.igst) || 0;
    });

    const sortedParties = Object.keys(partyStats).sort((a, b) => {
        const totA = partyStats[a].b2b.taxable + partyStats[a].cdnr.taxable;
        const totB = partyStats[b].b2b.taxable + partyStats[b].cdnr.taxable;
        return totB - totA;
    });

    // ─── 3. BUILD SHEET: B2B ──────────────────────────────────────────────────
    const b2bSheetData = [];

    // Header metadata rows (1 to 7)
    b2bSheetData.push(['GSTR-2B - B2B Invoices']);
    b2bSheetData.push(['Dealer Name:', null, dealerName]);
    b2bSheetData.push(['GSTIN:', null, gstin]);
    b2bSheetData.push(['FinYear:', null, financialYear]);
    
    // Row 5 category headers
    const row5 = new Array(75).fill(null);
    row5[57] = 'B2B'; // Col BF
    row5[63] = 'CREDIT NOTE'; // Col BL
    row5[69] = 'NET'; // Col BR
    b2bSheetData.push(row5);

    // Row 6 sub-category headers & timestamp
    const row6 = new Array(75).fill(null);
    row6[0] = `GENERATED DATE & TIME :- ${timestampStr}`;
    row6[33] = 'B2B'; // Col AH
    row6[39] = 'CREDIT NOTE'; // Col AN
    row6[45] = 'NET'; // Col AT
    b2bSheetData.push(row6);

    // Row 7 empty spacer
    b2bSheetData.push([]);

    // Row 8 Headers (Exact match with reference file)
    const b2bRow8 = [
        'Period', 'Trade/Legal name', 'GSTIN of supplier', 'POS', 'Invoice Type', 'Reverse Charge',
        'Invoice No', 'Invoice Date', 'Invoice Value', 'Taxable Value', 'Tax Rate', 'IGST', 'CGST', 'SGST', 'Cess',
        'GSTR-1/5 Filling Period', 'GSTR-1/5 Filling Date', 'ITC Availibility', 'Reason', 'Source Type',
        'E-Invoice Applicable', 'IRN', 'IRN Generated Date', 'ITC Claim Status', 'ITC Claim Period',
        null,
        'MONTHS', 'TAXABLE', 'CGST', 'SGST', 'IGST', // Col AA-AE (Col 27-31)
        null,
        'MONTHS', 'TAXABLE', 'CGST', 'SGST', 'IGST', // Col AG-AK (Col 33-37)
        null,
        'MONTHS', 'TAXABLE', 'CGST', 'SGST', 'IGST', // Col AM-AQ (Col 39-43)
        null,
        'MONTHS', 'TAXABLE', 'CGST', 'SGST', 'IGST', // Col AS-AW (Col 45-49)
        null, null,
        'PARTY NAME', 'TAXABLE', 'CGST', 'SGST', 'IGST', // Col AZ-BD (Col 52-56)
        null,
        'PARTY NAME', 'TAXABLE', 'CGST', 'SGST', 'IGST', // Col BF-BJ (Col 58-62)
        null,
        'PARTY NAME', 'TAXABLE', 'CGST', 'SGST', 'IGST', // Col BL-BP (Col 64-68)
        null,
        'PARTY NAME', 'TAXABLE', 'CGST', 'SGST', 'IGST'  // Col BR-BV (Col 70-74)
    ];
    b2bSheetData.push(b2bRow8);

    // Data rows (Row 9 onwards)
    const maxDataRows = Math.max(b2bInvoices.length, MONTH_ORDER.length, sortedParties.length);

    for (let r = 0; r < maxDataRows; r++) {
        const row = new Array(75).fill(null);
        const excelRowIdx = r + 9;

        // 1. Raw Invoice Details (Cols 0 to 24)
        if (r < b2bInvoices.length) {
            const inv = b2bInvoices[r];
            row[0] = inv.return_period || '';
            row[1] = inv.supplier_name || '';
            row[2] = (inv.ctin || '').toUpperCase();
            row[3] = inv.pos || '';
            row[4] = inv.inv_typ || 'Regular';
            row[5] = inv.rchrg === 'Y' ? 'Yes' : 'No';
            row[6] = inv.inum || '';
            row[7] = inv.idt || '';
            row[8] = round2(inv.total_val || (inv.txval + inv.igst + inv.cgst + inv.sgst + inv.cess));
            row[9] = round2(inv.txval);
            row[10] = 0; // Tax rate default
            row[11] = round2(inv.igst);
            row[12] = round2(inv.cgst);
            row[13] = round2(inv.sgst);
            row[14] = round2(inv.cess);
            row[15] = inv.source_period || '';
            row[16] = inv.filing_date || '';
            row[17] = inv.itc_available === 'Y' ? 'Yes' : 'No';
            row[18] = inv.itc_reason || '';
            row[19] = '';
            row[20] = '';
            row[21] = '';
            row[22] = '';
            row[23] = '';
            row[24] = '';

            // Helper formulas in AA to AE
            const mText = getMonthNameFromPeriod(inv.return_period, inv.idt);
            row[26] = mText; // Col AA
            row[27] = round2(inv.txval); // Col AB
            row[28] = round2(inv.cgst);  // Col AC
            row[29] = round2(inv.sgst);  // Col AD
            row[30] = round2(inv.igst);  // Col AE

            // Helper formulas in AZ to BD
            row[51] = inv.supplier_name || inv.ctin || ''; // Col AZ
            row[52] = round2(inv.txval); // Col BA
            row[53] = round2(inv.cgst);  // Col BB
            row[54] = round2(inv.sgst);  // Col BC
            row[55] = round2(inv.igst);  // Col BD
        }

        // 2. Month-wise Summary Table (Cols AG to AW) — Rows 0 to 11
        if (r < MONTH_ORDER.length) {
            const mName = MONTH_ORDER[r].toUpperCase();
            const s = monthStats[mName] || { b2b: {}, cdnr: {} };

            // B2B Month
            row[32] = mName; // Col AG
            row[33] = round2(s.b2b.taxable); // Col AH
            row[34] = round2(s.b2b.cgst);    // Col AI
            row[35] = round2(s.b2b.sgst);    // Col AJ
            row[36] = round2(s.b2b.igst);    // Col AK

            // Credit Note Month
            row[38] = mName; // Col AM
            row[39] = round2(s.cdnr.taxable); // Col AN
            row[40] = round2(s.cdnr.cgst);    // Col AO
            row[41] = round2(s.cdnr.sgst);    // Col AP
            row[42] = round2(s.cdnr.igst);    // Col AQ

            // Net Month
            row[44] = mName; // Col AS
            row[45] = round2(s.b2b.taxable - s.cdnr.taxable); // Col AT
            row[46] = round2(s.b2b.cgst - s.cdnr.cgst);       // Col AU
            row[47] = round2(s.b2b.sgst - s.cdnr.sgst);       // Col AV
            row[48] = round2(s.b2b.igst - s.cdnr.igst);       // Col AW
        }

        // 3. Party-wise Summary Table (Cols BF to BV)
        if (r < sortedParties.length) {
            const pName = sortedParties[r];
            const ps = partyStats[pName] || { b2b: {}, cdnr: {} };

            // B2B Party
            row[57] = pName; // Col BF
            row[58] = round2(ps.b2b.taxable); // Col BG
            row[59] = round2(ps.b2b.cgst);    // Col BH
            row[60] = round2(ps.b2b.sgst);    // Col BI
            row[61] = round2(ps.b2b.igst);    // Col BJ

            // Credit Note Party
            row[63] = pName; // Col BL
            row[64] = round2(ps.cdnr.taxable); // Col BM
            row[65] = round2(ps.cdnr.cgst);    // Col BN
            row[66] = round2(ps.cdnr.sgst);    // Col BO
            row[67] = round2(ps.cdnr.igst);    // Col BP

            // Net Party
            row[69] = pName; // Col BR
            row[70] = round2(ps.b2b.taxable - ps.cdnr.taxable); // Col BS
            row[71] = round2(ps.b2b.cgst - ps.cdnr.cgst);       // Col BT
            row[72] = round2(ps.b2b.sgst - ps.cdnr.sgst);       // Col BU
            row[73] = round2(ps.b2b.igst - ps.cdnr.igst);       // Col BV
        }

        b2bSheetData.push(row);
    }

    const b2bWs = XLSX.utils.aoa_to_sheet(b2bSheetData);
    b2bWs['!merges'] = []; // STRICT ZERO MERGES
    XLSX.utils.book_append_sheet(wb, b2bWs, 'B2B');

    // ─── 4. BUILD SHEET: CDNR ─────────────────────────────────────────────────
    const cdnrSheetData = [];
    cdnrSheetData.push(['GSTR-2B - CDNR Invoices']);
    cdnrSheetData.push(['Dealer Name:', null, dealerName]);
    cdnrSheetData.push(['GSTIN:', null, gstin]);
    cdnrSheetData.push(['FinYear:', null, financialYear]);
    cdnrSheetData.push(new Array(51).fill(null));

    const cdnrRow6 = new Array(51).fill(null);
    cdnrRow6[0] = `GENERATED DATE & TIME :- ${timestampStr}`;
    cdnrSheetData.push(cdnrRow6);
    cdnrSheetData.push([]);

    const cdnrRow8 = [
        'Period', 'Trade/Legal name', 'GSTIN of supplier', 'POS', 'Invoice Type', 'Reverse Charge',
        'Note Type', 'Note No', 'Note Date', 'Invoice Value', 'Taxable Value', 'Tax Rate', 'IGST', 'CGST', 'SGST', 'Cess',
        'GSTR-1/5 Filling Period', 'GSTR-1/5 Filling Date', 'ITC Availibility', 'Reason', 'Source Type',
        'E-Invoice Applicable', 'IRN', 'IRN Generated Date', 'ITC Claim Status', 'ITC Claim Period',
        null,
        'MONTHS', 'TAXABLE', 'CGST', 'SGST', 'IGST', // Col AB-AF (Col 28-32)
        null,
        'MONTHS', 'TAXABLE', 'CGST', 'SGST', 'IGST', // Col AH-AL (Col 34-38)
        null,
        'PARTY NAME', 'TAXABLE', 'CGST', 'SGST', 'IGST', // Col AN-AR (Col 40-44)
        null,
        'PARTY NAME', 'TAXABLE', 'CGST', 'SGST', 'IGST'  // Col AT-AX (Col 46-50)
    ];
    cdnrSheetData.push(cdnrRow8);

    const cdnrMaxRows = Math.max(cdnrInvoices.length, MONTH_ORDER.length, sortedParties.length);

    for (let r = 0; r < cdnrMaxRows; r++) {
        const row = new Array(51).fill(null);

        // Raw CDNR items
        if (r < cdnrInvoices.length) {
            const inv = cdnrInvoices[r];
            row[0] = inv.return_period || '';
            row[1] = inv.supplier_name || '';
            row[2] = (inv.ctin || '').toUpperCase();
            row[3] = inv.pos || '';
            row[4] = inv.inv_typ || 'Credit Note';
            row[5] = inv.rchrg === 'Y' ? 'Yes' : 'No';
            row[6] = 'Credit';
            row[7] = inv.inum || '';
            row[8] = inv.idt || '';
            row[9] = round2(inv.total_val || (inv.txval + inv.igst + inv.cgst + inv.sgst + inv.cess));
            row[10] = round2(inv.txval);
            row[11] = 0;
            row[12] = round2(inv.igst);
            row[13] = round2(inv.cgst);
            row[14] = round2(inv.sgst);
            row[15] = round2(inv.cess);
            row[16] = inv.source_period || '';
            row[17] = inv.filing_date || '';
            row[18] = inv.itc_available === 'Y' ? 'Yes' : 'No';
            row[19] = inv.itc_reason || '';

            // Helper formulas
            const mText = getMonthNameFromPeriod(inv.return_period, inv.idt);
            row[27] = mText;
            row[28] = round2(inv.txval);
            row[29] = round2(inv.cgst);
            row[30] = round2(inv.sgst);
            row[31] = round2(inv.igst);

            row[39] = inv.supplier_name || inv.ctin || '';
            row[40] = round2(inv.txval);
            row[41] = round2(inv.cgst);
            row[42] = round2(inv.sgst);
            row[43] = round2(inv.igst);
        }

        // CDNR Month Summary
        if (r < MONTH_ORDER.length) {
            const mName = MONTH_ORDER[r].toUpperCase();
            const s = monthStats[mName] || { cdnr: {} };
            row[33] = mName;
            row[34] = round2(s.cdnr.taxable);
            row[35] = round2(s.cdnr.cgst);
            row[36] = round2(s.cdnr.sgst);
            row[37] = round2(s.cdnr.igst);
        }

        // CDNR Party Summary
        if (r < sortedParties.length) {
            const pName = sortedParties[r];
            const ps = partyStats[pName] || { cdnr: {} };
            row[45] = pName;
            row[46] = round2(ps.cdnr.taxable);
            row[47] = round2(ps.cdnr.cgst);
            row[48] = round2(ps.cdnr.sgst);
            row[49] = round2(ps.cdnr.igst);
        }

        cdnrSheetData.push(row);
    }

    const cdnrWs = XLSX.utils.aoa_to_sheet(cdnrSheetData);
    cdnrWs['!merges'] = []; // STRICT ZERO MERGES
    XLSX.utils.book_append_sheet(wb, cdnrWs, 'CDNR');

    // ─── 5. BUILD SHEET: ECO ──────────────────────────────────────────────────
    const ecoSheetData = [
        ['GSTR-2B - ECO Invoices'],
        ['Dealer Name:', null, dealerName],
        ['GSTIN:', null, gstin],
        ['FinYear:', null, financialYear],
        [],
        [`GENERATED DATE & TIME :- ${timestampStr}`],
        [],
        [
            'Period', 'Trade/Legal name', 'GSTIN of supplier', 'POS', 'Invoice Type',
            'Invoice No', 'Invoice Date', 'Invoice Value', 'Taxable Value', 'Tax Rate',
            'IGST', 'CGST', 'SGST', 'Cess', 'GSTR-1/5 Filling Period', 'GSTR-1/5 Filling Date',
            'ITC Availibility', 'Reason', 'Source Type', 'E-Invoice Applicable', 'IRN',
            'IRN Generated Date', 'ITC Claim Status', 'ITC Claim Period'
        ]
    ];
    ecoInvoices.forEach(inv => {
        ecoSheetData.push([
            inv.return_period || '', inv.supplier_name || '', (inv.ctin || '').toUpperCase(),
            inv.pos || '', inv.inv_typ || 'Regular', inv.inum || '', inv.idt || '',
            round2(inv.total_val), round2(inv.txval), 0, round2(inv.igst), round2(inv.cgst),
            round2(inv.sgst), round2(inv.cess), inv.source_period || '', inv.filing_date || '',
            inv.itc_available === 'Y' ? 'Yes' : 'No', inv.itc_reason || '', '', '', '', '', '', ''
        ]);
    });
    const ecoWs = XLSX.utils.aoa_to_sheet(ecoSheetData);
    ecoWs['!merges'] = [];
    XLSX.utils.book_append_sheet(wb, ecoWs, 'ECO');

    // ─── 6. BUILD SHEET: ISD ──────────────────────────────────────────────────
    const isdSheetData = [
        ['GSTR-2B - ISD Invoices'],
        ['Dealer Name:', null, dealerName],
        ['GSTIN:', null, gstin],
        ['FinYear:', null, financialYear],
        [],
        [`GENERATED DATE & TIME :- ${timestampStr}`],
        [],
        [
            'Period', 'Trade/Legal name', 'GSTIN of ISD', 'ISD Document type', 'ISD Document number',
            'ISD Document date', 'Original Invoice Number', 'Original Invoice date', 'IGST', 'CGST',
            'SGST', 'Cess', 'ISD GSTR-6 Period', 'ISD GSTR-6 Filing Date', 'Eligibility of ITC',
            'ITC Claim Status', 'ITC Claim Period'
        ]
    ];
    isdInvoices.forEach(inv => {
        isdSheetData.push([
            inv.return_period || '', inv.supplier_name || '', (inv.ctin || '').toUpperCase(),
            'ISD Invoice', inv.inum || '', inv.idt || '', '', '', round2(inv.igst),
            round2(inv.cgst), round2(inv.sgst), round2(inv.cess), inv.source_period || '',
            inv.filing_date || '', inv.itc_available === 'Y' ? 'Yes' : 'No', '', ''
        ]);
    });
    const isdWs = XLSX.utils.aoa_to_sheet(isdSheetData);
    isdWs['!merges'] = [];
    XLSX.utils.book_append_sheet(wb, isdWs, 'ISD');

    // ─── 7. BUILD SHEET: IMPG ─────────────────────────────────────────────────
    const impgSheetData = [
        ['GSTR-2B - IMPG Invoices'],
        ['Dealer Name:', null, dealerName],
        ['GSTIN:', null, gstin],
        ['FinYear:', null, financialYear],
        [],
        [`GENERATED DATE & TIME :- ${timestampStr}`],
        [],
        [
            'Period', 'Icegate Reference Date', 'Port Code', 'Bill Number', 'Bill Date',
            'Taxable Value', 'IGST', 'Cess', 'Amended (Yes)', 'ITC Claim Status', 'ITC Claim Period'
        ]
    ];
    impgInvoices.forEach(inv => {
        impgSheetData.push([
            inv.return_period || '', '', inv.pos || '', inv.inum || '', inv.idt || '',
            round2(inv.txval), round2(inv.igst), round2(inv.cess), '', '', ''
        ]);
    });
    const impgWs = XLSX.utils.aoa_to_sheet(impgSheetData);
    impgWs['!merges'] = [];
    XLSX.utils.book_append_sheet(wb, impgWs, 'IMPG');

    // ─── 8. BUILD SHEET: IMPGSEZ ──────────────────────────────────────────────
    const impgSezSheetData = [
        ['GSTR-2B - IMPGSEZ Invoices'],
        ['Dealer Name:', null, dealerName],
        ['GSTIN:', null, gstin],
        ['FinYear:', null, financialYear],
        [],
        [`GENERATED DATE & TIME :- ${timestampStr}`],
        [],
        [
            'Period', 'Trade/Legal name', 'GSTIN of supplier', 'Icegate Reference Date',
            'Port Code', 'Bill Number', 'Bill Date', 'Taxable Value', 'IGST', 'Cess',
            'Amended (Yes)', 'ITC Claim Status', 'ITC Claim Period'
        ]
    ];
    impgSezInvoices.forEach(inv => {
        impgSezSheetData.push([
            inv.return_period || '', inv.supplier_name || '', (inv.ctin || '').toUpperCase(),
            '', inv.pos || '', inv.inum || '', inv.idt || '', round2(inv.txval),
            round2(inv.igst), round2(inv.cess), '', '', ''
        ]);
    });
    const impgSezWs = XLSX.utils.aoa_to_sheet(impgSezSheetData);
    impgSezWs['!merges'] = [];
    XLSX.utils.book_append_sheet(wb, impgSezWs, 'IMPGSEZ');

    // ─── 9. BUILD SHEET: B2B(Rejected) ────────────────────────────────────────
    const b2bRejSheetData = [
        ['GSTR-2B - B2B Invoices (Rejected)'],
        ['Dealer Name:', null, dealerName],
        ['GSTIN:', null, gstin],
        ['FinYear:', null, financialYear],
        [],
        [`GENERATED DATE & TIME :- ${timestampStr}`],
        [],
        [
            'Period', 'Trade/Legal name', 'GSTIN of supplier', 'POS', 'Invoice Type', 'Reverse Charge',
            'Invoice No', 'Invoice Date', 'Invoice Value', 'Taxable Value', 'Tax Rate', 'IGST', 'CGST', 'SGST', 'Cess',
            'GSTR-1/5 Filling Period', 'GSTR-1/5 Filling Date', 'ITC Availibility', 'Reason', 'Source Type',
            'E-Invoice Applicable', 'IRN', 'IRN Generated Date'
        ]
    ];
    b2bRejected.forEach(inv => {
        b2bRejSheetData.push([
            inv.return_period || '', inv.supplier_name || '', (inv.ctin || '').toUpperCase(),
            inv.pos || '', inv.inv_typ || 'Regular', inv.rchrg === 'Y' ? 'Yes' : 'No',
            inv.inum || '', inv.idt || '', round2(inv.total_val), round2(inv.txval), 0,
            round2(inv.igst), round2(inv.cgst), round2(inv.sgst), round2(inv.cess),
            inv.source_period || '', inv.filing_date || '', 'No', inv.itc_reason || 'Ineligible ITC',
            '', '', '', ''
        ]);
    });
    const b2bRejWs = XLSX.utils.aoa_to_sheet(b2bRejSheetData);
    b2bRejWs['!merges'] = [];
    XLSX.utils.book_append_sheet(wb, b2bRejWs, 'B2B(Rejected)');

    // ─── 10. BUILD SHEET: CDNR(Rejected) ──────────────────────────────────────
    const cdnrRejSheetData = [
        ['GSTR-2B - CDNR Invoices (Rejected)'],
        ['Dealer Name:', null, dealerName],
        ['GSTIN:', null, gstin],
        ['FinYear:', null, financialYear],
        [],
        [`GENERATED DATE & TIME :- ${timestampStr}`],
        [],
        [
            'Period', 'Trade/Legal name', 'GSTIN of supplier', 'POS', 'Invoice Type', 'Reverse Charge',
            'Note Type', 'Note No', 'Note Date', 'Invoice Value', 'Taxable Value', 'Tax Rate', 'IGST',
            'CGST', 'SGST', 'Cess', 'GSTR-1/5 Filling Period', 'GSTR-1/5 Filling Date', 'ITC Availibility',
            'Reason', 'Source Type', 'E-Invoice Applicable', 'IRN', 'IRN Generated Date'
        ]
    ];
    cdnrRejected.forEach(inv => {
        cdnrRejSheetData.push([
            inv.return_period || '', inv.supplier_name || '', (inv.ctin || '').toUpperCase(),
            inv.pos || '', inv.inv_typ || 'Credit Note', inv.rchrg === 'Y' ? 'Yes' : 'No',
            'Credit', inv.inum || '', inv.idt || '', round2(inv.total_val), round2(inv.txval),
            0, round2(inv.igst), round2(inv.cgst), round2(inv.sgst), round2(inv.cess),
            inv.source_period || '', inv.filing_date || '', 'No', inv.itc_reason || 'Ineligible ITC',
            '', '', '', ''
        ]);
    });
    const cdnrRejWs = XLSX.utils.aoa_to_sheet(cdnrRejSheetData);
    cdnrRejWs['!merges'] = [];
    XLSX.utils.book_append_sheet(wb, cdnrRejWs, 'CDNR(Rejected)');

    // Final Zero-Merge Defense-in-Depth Guardrail
    removeAllMergesFromWorkbook(wb);

    return wb;
}
