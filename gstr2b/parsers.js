import fs from 'fs';
import path from 'path';
import os from 'os';
import * as xlsxModule from 'xlsx';
const XLSX = xlsxModule.default || xlsxModule;
import JSZip from 'jszip';

// ─── STRING & NUMBER CLEANING HELPERS ─────────────────────────────────────────

export const cleanStr = (val) => val === undefined || val === null ? '' : String(val).trim();

export const cleanNum = (val) => {
    if (!val) return 0;
    const n = parseFloat(String(val).replace(/,/g, '').trim());
    return isNaN(n) ? 0 : n;
};

export const parseExcelDate = (val) => {
    if (!val) return '';
    if (typeof val === 'number') {
        try {
            if (XLSX.SSF && typeof XLSX.SSF.parse_date_code === 'function') {
                const p = XLSX.SSF.parse_date_code(val);
                if (p && p.y && p.m && p.d) {
                    const d = String(p.d).padStart(2, '0');
                    const m = String(p.m).padStart(2, '0');
                    return `${d}/${m}/${p.y}`;
                }
            }
        } catch (e) {}
        const date = new Date((val - (25567 + 2)) * 86400 * 1000);
        const d = String(date.getUTCDate()).padStart(2, '0');
        const m = String(date.getUTCMonth() + 1).padStart(2, '0');
        const y = date.getUTCFullYear();
        return `${d}/${m}/${y}`;
    }
    return String(val).trim();
};

// ─── GSTR-2B EXCEL PARSER ─────────────────────────────────────────────────────

export const parseGstr2bExcelHelper = (filePath, fallbackGstin = '', fallbackPeriod = '') => {
    let wb;
    try {
        wb = XLSX.readFile(filePath);
    } catch (e) {
        console.error('[GSTR-2B Parser] Failed reading Excel file:', e.message);
        return null;
    }

    let dealerName = '';
    let detectedGstin = fallbackGstin;
    let finYear = '';
    let detectedPeriod = fallbackPeriod;
    const allInvoices = [];

    for (const sheetName of wb.SheetNames) {
        const ws = wb.Sheets[sheetName];
        if (!ws) continue;
        const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        if (!rawRows || rawRows.length === 0) continue;

        // Extract metadata from top header rows
        for (let r = 0; r < Math.min(6, rawRows.length); r++) {
            const row = rawRows[r] || [];
            const r0 = cleanStr(row[0]).toLowerCase();
            if (r0.includes('dealer name') && !dealerName) {
                dealerName = cleanStr(row[2] || row[1]);
            }
            if (r0.includes('gstin') && !detectedGstin) {
                const matched = (row[2] || row[1] || '').toString().match(/[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}/i);
                if (matched) detectedGstin = matched[0].toUpperCase();
            }
            if (r0.includes('finyear') && !finYear) {
                finYear = cleanStr(row[2] || row[1]);
            }
            if (r0.includes('period') && !detectedPeriod) {
                detectedPeriod = cleanStr(row[2] || row[1]);
            }
        }

        // Identify table header row
        let headerRowIdx = -1;
        const colMap = {};

        for (let r = 0; r < Math.min(15, rawRows.length); r++) {
            const row = rawRows[r] || [];
            const joined = row.map(c => cleanStr(c).toLowerCase()).join(' ');
            if (joined.includes('gstin of supplier') || joined.includes('supplier gstin')) {
                headerRowIdx = r;
                const nextRow = rawRows[r + 1] || [];
                const maxLen = Math.max(row.length, nextRow.length);
                for (let idx = 0; idx < maxLen; idx++) {
                    const c = (cleanStr(row[idx]) + ' ' + cleanStr(nextRow[idx])).toLowerCase();
                    if (colMap.supplier_name === undefined && (c.includes('trade/legal') || c.includes('supplier name') || c.includes('legal name'))) colMap.supplier_name = idx;
                    else if (colMap.ctin === undefined && (c.includes('gstin of supplier') || c.includes('supplier gstin'))) colMap.ctin = idx;
                    else if (colMap.pos === undefined && (c.includes('pos') || c.includes('place of supply'))) colMap.pos = idx;
                    else if (colMap.inv_typ === undefined && (c.includes('invoice type') || c.includes('note type'))) colMap.inv_typ = idx;
                    else if (colMap.rchrg === undefined && (c.includes('reverse charge') || c.includes('attract reverse'))) colMap.rchrg = idx;
                    else if (colMap.inum === undefined && (c.includes('invoice no') || c.includes('note no') || c.includes('doc no') || c.includes('invoice number') || c.includes('note number'))) colMap.inum = idx;
                    else if (colMap.idt === undefined && (c.includes('invoice date') || c.includes('note date') || c.includes('doc date'))) colMap.idt = idx;
                    else if (colMap.total_val === undefined && (c.includes('invoice value') || c.includes('note value') || c.includes('doc value'))) colMap.total_val = idx;
                    else if (colMap.txval === undefined && c.includes('taxable value')) colMap.txval = idx;
                    else if (colMap.rate === undefined && (c.includes('tax rate') || c.includes('rate') || c.includes('applicable %'))) colMap.rate = idx;
                    else if (colMap.igst === undefined && (c === 'igst' || c.includes('integrated tax'))) colMap.igst = idx;
                    else if (colMap.cgst === undefined && (c === 'cgst' || c.includes('central tax'))) colMap.cgst = idx;
                    else if (colMap.sgst === undefined && (c === 'sgst' || c.includes('state/ut tax') || c.includes('state tax'))) colMap.sgst = idx;
                    else if (colMap.cess === undefined && c.includes('cess')) colMap.cess = idx;
                    else if (colMap.period === undefined && (c.trim() === 'period' || c.startsWith('period') || c.includes('return period'))) colMap.period = idx;
                    else if (colMap.source_period === undefined && (c.includes('filling period') || c.includes('filing period'))) colMap.source_period = idx;
                    else if (colMap.filing_date === undefined && (c.includes('filling date') || c.includes('filing date'))) colMap.filing_date = idx;
                    else if (colMap.itc_eligible === undefined && (c.includes('itc availibility') || c.includes('itc availability') || c.includes('itc eligible'))) colMap.itc_eligible = idx;
                    else if (colMap.reason === undefined && c.includes('reason')) colMap.reason = idx;
                }
                break;
            }
        }

        if (headerRowIdx === -1 || colMap.ctin === undefined || colMap.inum === undefined) continue;

        const nextRow = rawRows[headerRowIdx + 1] || [];
        const isNextRowSubHeader = nextRow.some(cell => {
            const sc = cleanStr(cell).toLowerCase();
            return sc.includes('invoice') || sc.includes('tax') || sc.includes('note') || sc.includes('date');
        });
        const dataStartIdx = isNextRowSubHeader ? headerRowIdx + 2 : headerRowIdx + 1;

        const isCdnr = sheetName.toUpperCase().includes('CDNR');
        const isRejected = sheetName.toUpperCase().includes('REJECTED');
        const sectionName = sheetName.toUpperCase();

        for (let r = dataStartIdx; r < rawRows.length; r++) {
            const row = rawRows[r] || [];
            const ctin = cleanStr(row[colMap.ctin]).toUpperCase();
            if (!ctin || ctin.length < 10) continue;

            const inum = cleanStr(row[colMap.inum]);
            if (!inum) continue;

            const idt = parseExcelDate(row[colMap.idt]);
            const supplierName = cleanStr(row[colMap.supplier_name]);
            const pos = cleanStr(row[colMap.pos]);
            const invTyp = cleanStr(row[colMap.inv_typ]) || (isCdnr ? 'Credit Note' : 'Regular');
            const rchrg = cleanStr(row[colMap.rchrg]).toLowerCase().startsWith('y') ? 'Y' : 'N';
            const totalVal = cleanNum(row[colMap.total_val]);
            const txval = cleanNum(row[colMap.txval]);
            const igst = cleanNum(row[colMap.igst]);
            const cgst = cleanNum(row[colMap.cgst]);
            const sgst = cleanNum(row[colMap.sgst]);
            const cess = cleanNum(row[colMap.cess]);
            const filingDate = parseExcelDate(row[colMap.filing_date]);
            const sourcePeriod = cleanStr(row[colMap.source_period]);
            const rawPeriod = colMap.period !== undefined ? cleanStr(row[colMap.period]) : '';
            const normalizedPeriod = rawPeriod ? rawPeriod.replace(/,/g, '').trim() : (fallbackPeriod || detectedPeriod);
            const itcRaw = cleanStr(row[colMap.itc_eligible]).toLowerCase();
            const itcEligible = isRejected ? 'N' : (itcRaw.startsWith('n') ? 'N' : 'Y');
            const reason = cleanStr(row[colMap.reason]);

            allInvoices.push({
                section: sectionName,
                return_period: normalizedPeriod,
                ctin,
                supplier_name: supplierName,
                inum,
                idt,
                inv_typ: invTyp,
                pos,
                rchrg,
                txval,
                igst,
                cgst,
                sgst,
                cess,
                total_val: totalVal || (txval + igst + cgst + sgst + cess),
                filing_date: filingDate,
                source_period: sourcePeriod,
                itc_available: itcEligible,
                itc_reason: reason
            });
        }
    }

    return {
        dealerName,
        gstin: detectedGstin || fallbackGstin,
        finYear,
        period: detectedPeriod || fallbackPeriod,
        invoices: allInvoices
    };
};

// ─── GSTR-2B JSON PARSER ──────────────────────────────────────────────────────

export const parseGstr2bJsonHelper = (jsonData, fallbackGstin = '', fallbackPeriod = '') => {
    if (!jsonData) return null;
    let raw = jsonData;
    if (typeof jsonData === 'string') {
        try {
            raw = JSON.parse(fs.readFileSync(jsonData, 'utf8'));
        } catch (e) {
            console.error('[GSTR-2B JSON Parser] Failed reading JSON file:', e.message);
            return null;
        }
    }
    const gstin = raw.gstin || raw.data?.gstin || fallbackGstin;
    const fp = raw.fp || raw.data?.fp || fallbackPeriod;
    const allInvoices = [];

    const docData = raw.data?.docdata || raw.docdata || raw;

    const extractAmounts = (obj) => {
        let txval = 0, igst = 0, cgst = 0, sgst = 0, cess = 0;
        const items = obj.items || obj.itms;
        if (Array.isArray(items) && items.length > 0) {
            for (const itm of items) {
                const d = itm.itm_det || itm;
                txval += cleanNum(d.txval ?? itm.txval);
                igst += cleanNum(d.iamt ?? d.igst ?? itm.iamt ?? itm.igst);
                cgst += cleanNum(d.camt ?? d.cgst ?? itm.camt ?? itm.cgst);
                sgst += cleanNum(d.samt ?? d.sgst ?? itm.samt ?? itm.sgst);
                cess += cleanNum(d.csamt ?? d.cess ?? itm.csamt ?? itm.cess);
            }
        } else {
            txval = cleanNum(obj.txval);
            igst = cleanNum(obj.igst ?? obj.iamt);
            cgst = cleanNum(obj.cgst ?? obj.camt);
            sgst = cleanNum(obj.sgst ?? obj.samt);
            cess = cleanNum(obj.cess ?? obj.csamt);
        }
        return { txval, igst, cgst, sgst, cess };
    };

    // 1. Process B2B & B2BA
    const processB2bGroup = (groupList, isAmendment = false) => {
        for (const item of (groupList || [])) {
            const ctin = (item.ctin || '').toUpperCase();
            const supplierName = item.trdnm || item.cfs || '';
            for (const inv of (item.inv || [])) {
                const { txval, igst, cgst, sgst, cess } = extractAmounts(inv);
                const itcAvl = (inv.itcavl || 'Y').toUpperCase() === 'Y' ? 'Y' : 'N';
                allInvoices.push({
                    section: isAmendment ? 'B2BA' : 'B2B',
                    ctin,
                    supplier_name: supplierName,
                    inum: inv.inum || '',
                    idt: inv.dt || inv.idt || '',
                    inv_typ: inv.typ || inv.inv_typ || 'Regular',
                    pos: inv.pos || '',
                    rchrg: inv.rev || inv.rchrg || 'N',
                    txval,
                    igst,
                    cgst,
                    sgst,
                    cess,
                    total_val: cleanNum(inv.val) || (txval + igst + cgst + sgst + cess),
                    filing_date: inv.supfildt || inv.srctyp || '',
                    source_period: inv.supprd || inv.irn || '',
                    itc_available: itcAvl,
                    itc_reason: inv.rsn || ''
                });
            }
        }
    };

    processB2bGroup(docData.b2b, false);
    processB2bGroup(docData.b2ba, true);

    // 2. Process CDNR & CDNRA
    const processCdnrGroup = (groupList, isAmendment = false) => {
        for (const item of (groupList || [])) {
            const ctin = (item.ctin || '').toUpperCase();
            const supplierName = item.trdnm || item.cfs || '';
            for (const nt of (item.nt || [])) {
                const { txval, igst, cgst, sgst, cess } = extractAmounts(nt);
                const itcAvl = (nt.itcavl || 'Y').toUpperCase() === 'Y' ? 'Y' : 'N';
                allInvoices.push({
                    section: isAmendment ? 'CDNRA' : 'CDNR',
                    ctin,
                    supplier_name: supplierName,
                    inum: nt.nt_num || nt.inum || '',
                    idt: nt.nt_dt || nt.dt || nt.idt || '',
                    inv_typ: nt.ntty || nt.typ || 'Credit',
                    pos: nt.pos || '',
                    rchrg: nt.rev || nt.rchrg || 'N',
                    txval,
                    igst,
                    cgst,
                    sgst,
                    cess,
                    total_val: cleanNum(nt.val) || (txval + igst + cgst + sgst + cess),
                    filing_date: nt.supfildt || '',
                    source_period: nt.supprd || '',
                    itc_available: itcAvl,
                    itc_reason: nt.rsn || ''
                });
            }
        }
    };

    processCdnrGroup(docData.cdnr, false);
    processCdnrGroup(docData.cdnra, true);

    // 3. Process ISD
    for (const item of (docData.isd || [])) {
        const ctin = (item.ctin || '').toUpperCase();
        const supplierName = item.trdnm || item.cfs || '';
        for (const doc of (item.doclist || [])) {
            const { txval, igst, cgst, sgst, cess } = extractAmounts(doc);
            const itcAvl = (doc.itcavl || 'Y').toUpperCase() === 'Y' ? 'Y' : 'N';
            allInvoices.push({
                section: 'ISD',
                ctin,
                supplier_name: supplierName,
                inum: doc.docnum || doc.inum || '',
                idt: doc.docdt || doc.dt || '',
                inv_typ: doc.doctyp || 'ISD',
                pos: '',
                rchrg: 'N',
                txval,
                igst,
                cgst,
                sgst,
                cess,
                total_val: cleanNum(doc.val) || (txval + igst + cgst + sgst + cess),
                filing_date: '',
                source_period: '',
                itc_available: itcAvl,
                itc_reason: ''
            });
        }
    }

    // 4. Process IMPG
    for (const doc of [...(docData.impg || []), ...(docData.impgsez || [])]) {
        const igst = cleanNum(doc.igst ?? doc.iamt);
        const cess = cleanNum(doc.cess ?? doc.csamt);
        const txval = cleanNum(doc.txval);
        allInvoices.push({
            section: 'IMPG',
            ctin: 'CUSTOMS',
            supplier_name: 'Import of Goods',
            inum: doc.boenum || doc.inum || '',
            idt: doc.boedt || doc.dt || '',
            inv_typ: 'Import',
            pos: doc.portcode || '',
            rchrg: 'N',
            txval,
            igst,
            cgst: 0,
            sgst: 0,
            cess,
            total_val: cleanNum(doc.val) || (txval + igst + cess),
            filing_date: '',
            source_period: '',
            itc_available: 'Y',
            itc_reason: ''
        });
    }

    return {
        gstin,
        period: fp,
        invoices: allInvoices
    };
};

// ─── GSTR-2B ZIP PARSER ───────────────────────────────────────────────────────

export const parseGstr2bZipHelper = async (zipPath, fallbackGstin = '', fallbackPeriod = '') => {
    try {
        const zipData = fs.readFileSync(zipPath);
        const zip = await JSZip.loadAsync(zipData);
        const files = Object.keys(zip.files);

        const excelFile = files.find(f => f.toLowerCase().endsWith('.xlsx') || f.toLowerCase().endsWith('.xls'));
        if (excelFile) {
            const buffer = await zip.files[excelFile].async('nodebuffer');
            const tempExcelPath = path.join(os.tmpdir(), `temp_2b_${Date.now()}.xlsx`);
            fs.writeFileSync(tempExcelPath, buffer);
            const res = parseGstr2bExcelHelper(tempExcelPath, fallbackGstin, fallbackPeriod);
            try { fs.unlinkSync(tempExcelPath); } catch (e) {}
            if (res && res.invoices.length > 0) return res;
        }

        const jsonFile = files.find(f => f.toLowerCase().endsWith('.json'));
        if (jsonFile) {
            const jsonText = await zip.files[jsonFile].async('string');
            const rawJson = JSON.parse(jsonText);
            return parseGstr2bJsonHelper(rawJson, fallbackGstin, fallbackPeriod);
        }
    } catch (err) {
        console.error('[GSTR-2B Parser] ZIP extract error:', err);
    }
    return null;
};

// ─── GSTR-1 JSON PARSER ───────────────────────────────────────────────────────

export const parseGstr1DataHelper = (raw, fallbackGstin = '', fallbackPeriod = '') => {
    const summary = {
        gstin: raw?.gstin || fallbackGstin,
        period: raw?.fp || fallbackPeriod,
        fileType: 'JSON',
        fileName: 'Portal_GSTR1',
        counts: { b2b: 0, b2cl: 0, b2cs: 0, exp: 0, nil: 0, cdnr: 0, at: 0, totalDocs: 0 },
        breakdowns: {
            b2b: { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
            b2c: { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
            zeroRated: { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
            nilRated: { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
            exempt: { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
            creditNote: { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
            advanceReceived: { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
            advanceAdjusted: { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
            rcmOutward: { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 }
        },
        totalOutwardTaxable: 0,
        totalOutwardTax: 0
    };

    if (!raw) return summary;
    if (raw.data && typeof raw.data === 'object') raw = raw.data;

    const secList = raw.sec_list || raw.cur_sum || raw.secList || raw.data || [];
    if (Array.isArray(secList) && secList.length > 0) {
        for (const sec of secList) {
            const secCd = String(sec.sec_nm || sec.sec || sec.cd || '').toUpperCase();
            const txval = cleanNum(sec.txval || sec.taxable || sec.tx_val || sec.tax_val || (sec.ttl_val ? Math.max(0, sec.ttl_val - cleanNum(sec.ttl_tax)) : sec.ttl_tax) || 0);
            const igst = cleanNum(sec.ttl_igst || sec.iamt || sec.igst || 0);
            const cgst = cleanNum(sec.ttl_cgst || sec.camt || sec.cgst || 0);
            const sgst = cleanNum(sec.ttl_sgst || sec.samt || sec.sgst || 0);

            if (secCd.includes('B2B') || secCd === '4A') {
                summary.breakdowns.b2b.taxable += txval;
                summary.breakdowns.b2b.igst += igst;
                summary.breakdowns.b2b.cgst += cgst;
                summary.breakdowns.b2b.sgst += sgst;
                summary.counts.b2b += cleanNum(sec.ttl_rec || sec.ttl_doc || 1);
            } else if (secCd.includes('B2C') || secCd === '5A' || secCd === '7') {
                summary.breakdowns.b2c.taxable += txval;
                summary.breakdowns.b2c.igst += igst;
                summary.breakdowns.b2c.cgst += cgst;
                summary.breakdowns.b2c.sgst += sgst;
                summary.counts.b2cs += 1;
            } else if (secCd.includes('EXP') || secCd === '6A') {
                summary.breakdowns.zeroRated.taxable += txval;
                summary.breakdowns.zeroRated.igst += igst;
                summary.counts.exp += 1;
            } else if (secCd.includes('NIL') || secCd === '8') {
                summary.breakdowns.nilRated.taxable += txval;
                summary.counts.nil += 1;
            } else if (secCd.includes('CDN') || secCd === '9B') {
                summary.breakdowns.creditNote.taxable += txval;
                summary.breakdowns.creditNote.igst += igst;
                summary.breakdowns.creditNote.cgst += cgst;
                summary.breakdowns.creditNote.sgst += sgst;
                summary.counts.cdnr += 1;
            }
        }
    }

    for (const group of (raw.b2b || [])) {
        for (const inv of (group.inv || [])) {
            summary.counts.b2b++;
            const isRcm = String(inv.rchrg || '').toUpperCase() === 'Y';
            for (const itm of (inv.itms || inv.items || [])) {
                const d = itm.itm_det || itm;
                const txval = cleanNum(d.txval);
                const igst = cleanNum(d.iamt || d.igst);
                const cgst = cleanNum(d.camt || d.cgst);
                const sgst = cleanNum(d.samt || d.sgst);
                summary.breakdowns.b2b.taxable += txval;
                summary.breakdowns.b2b.igst += igst;
                summary.breakdowns.b2b.cgst += cgst;
                summary.breakdowns.b2b.sgst += sgst;
                if (isRcm) {
                    summary.breakdowns.rcmOutward.taxable += txval;
                    summary.breakdowns.rcmOutward.igst += igst;
                    summary.breakdowns.rcmOutward.cgst += cgst;
                    summary.breakdowns.rcmOutward.sgst += sgst;
                }
            }
        }
    }

    for (const row of (raw.b2cs || [])) {
        summary.counts.b2cs++;
        const txval = cleanNum(row.txval);
        const igst = cleanNum(row.iamt || row.igst);
        const cgst = cleanNum(row.camt || row.cgst);
        const sgst = cleanNum(row.samt || row.sgst);
        summary.breakdowns.b2c.taxable += txval;
        summary.breakdowns.b2c.igst += igst;
        summary.breakdowns.b2c.cgst += cgst;
        summary.breakdowns.b2c.sgst += sgst;
    }

    for (const group of (raw.exp || [])) {
        for (const inv of (group.inv || [])) {
            summary.counts.exp++;
            for (const itm of (inv.itms || inv.items || [])) {
                const d = itm.itm_det || itm;
                summary.breakdowns.zeroRated.taxable += cleanNum(d.txval);
                summary.breakdowns.zeroRated.igst += cleanNum(d.iamt || d.igst);
            }
        }
    }

    for (const n of (raw.nil?.inv || [])) {
        summary.counts.nil++;
        summary.breakdowns.nilRated.taxable += cleanNum(n.nil_amt);
        summary.breakdowns.exempt.taxable += cleanNum(n.expt_amt) + cleanNum(n.ngsup_amt);
    }

    for (const group of [...(raw.cdnr || []), ...(raw.cdnur || [])]) {
        for (const nt of (group.nt || [group])) {
            if (!nt.nt_num && !nt.inum) continue;
            summary.counts.cdnr++;
            const isCredit = String(nt.ntty || '').toUpperCase().startsWith('C');
            const factor = isCredit ? 1 : -1;
            for (const itm of (nt.itms || nt.items || [])) {
                const d = itm.itm_det || itm;
                summary.breakdowns.creditNote.taxable += cleanNum(d.txval) * factor;
                summary.breakdowns.creditNote.igst += cleanNum(d.iamt || d.igst) * factor;
                summary.breakdowns.creditNote.cgst += cleanNum(d.camt || d.cgst) * factor;
                summary.breakdowns.creditNote.sgst += cleanNum(d.samt || d.sgst) * factor;
            }
        }
    }

    for (const k of Object.keys(summary.breakdowns)) {
        const b = summary.breakdowns[k];
        b.total = b.igst + b.cgst + b.sgst;
    }

    summary.totalOutwardTaxable = summary.breakdowns.b2b.taxable + summary.breakdowns.b2c.taxable + summary.breakdowns.zeroRated.taxable;
    summary.totalOutwardTax = summary.breakdowns.b2b.total + summary.breakdowns.b2c.total + summary.breakdowns.zeroRated.total;
    summary.counts.totalDocs = summary.counts.b2b + summary.counts.b2cl + summary.counts.b2cs + summary.counts.exp + summary.counts.cdnr;

    return summary;
};

// ─── GSTR-1 EXCEL PARSER ──────────────────────────────────────────────────────

export const parseGstr1ExcelHelper = (filePath, fallbackGstin = '', fallbackPeriod = '') => {
    let wb;
    try {
        wb = XLSX.readFile(filePath);
    } catch (e) {
        console.error('[GSTR-1 Parser] Failed reading Excel file:', e.message);
        return null;
    }

    const summary = {
        gstin: fallbackGstin,
        period: fallbackPeriod,
        fileType: 'EXCEL',
        fileName: path.basename(filePath),
        counts: { b2b: 0, b2cl: 0, b2cs: 0, exp: 0, nil: 0, cdnr: 0, at: 0, totalDocs: 0 },
        breakdowns: {
            b2b: { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
            b2c: { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
            zeroRated: { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
            nilRated: { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
            exempt: { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
            creditNote: { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
            advanceReceived: { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
            advanceAdjusted: { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
            rcmOutward: { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 }
        },
        totalOutwardTaxable: 0,
        totalOutwardTax: 0
    };

    for (const sheetName of wb.SheetNames) {
        const ws = wb.Sheets[sheetName];
        if (!ws) continue;
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
        if (!rows || rows.length === 0) continue;
        const sName = sheetName.toLowerCase().replace(/[^a-z0-9]/g, '');

        for (const row of rows) {
            const keys = Object.keys(row);
            const findVal = (terms) => {
                const k = keys.find(key => terms.some(t => key.toLowerCase().includes(t)));
                return k ? cleanNum(row[k]) : 0;
            };

            const txval = findVal(['taxable value', 'taxable val', 'txval', 'taxable']);
            const igst = findVal(['integrated tax', 'igst', 'iamt']);
            const cgst = findVal(['central tax', 'cgst', 'camt']);
            const sgst = findVal(['state/ut tax', 'state tax', 'sgst', 'samt']);

            if (sName.includes('b2b')) {
                summary.counts.b2b++;
                summary.breakdowns.b2b.taxable += txval;
                summary.breakdowns.b2b.igst += igst;
                summary.breakdowns.b2b.cgst += cgst;
                summary.breakdowns.b2b.sgst += sgst;
            } else if (sName.includes('b2c')) {
                summary.counts.b2cs++;
                summary.breakdowns.b2c.taxable += txval;
                summary.breakdowns.b2c.igst += igst;
                summary.breakdowns.b2c.cgst += cgst;
                summary.breakdowns.b2c.sgst += sgst;
            } else if (sName.includes('exp')) {
                summary.counts.exp++;
                summary.breakdowns.zeroRated.taxable += txval;
                summary.breakdowns.zeroRated.igst += igst;
            } else if (sName.includes('nil')) {
                summary.counts.nil++;
                const nilVal = findVal(['nil rated', 'nil']);
                const exemptVal = findVal(['exempted', 'exempt', 'non-gst']);
                summary.breakdowns.nilRated.taxable += nilVal;
                summary.breakdowns.exempt.taxable += exemptVal;
            } else if (sName.includes('cdn')) {
                summary.counts.cdnr++;
                summary.breakdowns.creditNote.taxable += txval;
                summary.breakdowns.creditNote.igst += igst;
                summary.breakdowns.creditNote.cgst += cgst;
                summary.breakdowns.creditNote.sgst += sgst;
            }
        }
    }

    for (const k of Object.keys(summary.breakdowns)) {
        const b = summary.breakdowns[k];
        b.total = b.igst + b.cgst + b.sgst;
    }

    summary.totalOutwardTaxable = summary.breakdowns.b2b.taxable + summary.breakdowns.b2c.taxable + summary.breakdowns.zeroRated.taxable;
    summary.totalOutwardTax = summary.breakdowns.b2b.total + summary.breakdowns.b2c.total + summary.breakdowns.zeroRated.total;
    summary.counts.totalDocs = summary.counts.b2b + summary.counts.b2cs + summary.counts.exp + summary.counts.cdnr;

    return summary;
};

// ─── GSTR-1 ZIP PARSER ────────────────────────────────────────────────────────

export const parseGstr1ZipHelper = async (zipPath, gstin = '', returnPeriod = '') => {
    try {
        const data = fs.readFileSync(zipPath);
        const zip = await JSZip.loadAsync(data);
        const files = Object.keys(zip.files);

        const jsonFile = files.find(f => f.toLowerCase().endsWith('.json'));
        if (jsonFile) {
            const text = await zip.files[jsonFile].async('text');
            return parseGstr1DataHelper(JSON.parse(text), gstin, returnPeriod);
        }

        const xlsxFile = files.find(f => f.toLowerCase().endsWith('.xlsx'));
        if (xlsxFile) {
            const buf = await zip.files[xlsxFile].async('nodebuffer');
            const tempPath = path.join(os.tmpdir(), `gstr1_${Date.now()}.xlsx`);
            fs.writeFileSync(tempPath, buf);
            const res = parseGstr1ExcelHelper(tempPath, gstin, returnPeriod);
            try { fs.unlinkSync(tempPath); } catch (e) {}
            return res;
        }
    } catch (e) {
        console.error('[GSTR-1 Parser] Error extracting ZIP:', e.message);
    }
    return null;
};
