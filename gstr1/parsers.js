import path from 'path';
import fs from 'fs';
import os from 'os';
import * as xlsxModule from 'xlsx';
const XLSX = xlsxModule.default || xlsxModule;
import JSZip from 'jszip';

const cleanNum = (val) => {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    const str = String(val).replace(/,/g, '').trim();
    const parsed = parseFloat(str);
    return isNaN(parsed) ? 0 : parsed;
};

const cleanStr = (val) => {
    return val === null || val === undefined ? '' : String(val).trim();
};

const normalizePeriod = (periodStr) => {
    if (!periodStr) return '';
    const cleaned = String(periodStr).replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
    const parts = cleaned.split(' ');
    if (parts.length >= 2) {
        const mon = parts[0];
        const yr = parts[1];
        const capMon = mon.charAt(0).toUpperCase() + mon.slice(1).toLowerCase();
        return `${capMon} ${yr}`;
    }
    return cleaned;
};

/**
 * parseGstr1Json — Extracts both high-level summary and flat itemized invoice list
 * from official GST Portal GSTR-1 JSON.
 */
export function parseGstr1Json(raw, fallbackGstin = '', fallbackPeriod = '') {
    if (!raw) return null;
    if (raw.data && typeof raw.data === 'object') raw = raw.data;

    const gstin = cleanStr(raw.gstin || fallbackGstin).toUpperCase();
    let period = normalizePeriod(raw.fp || fallbackPeriod);

    // If fp is MMYYYY (e.g. "042025")
    if (/^\d{6}$/.test(period)) {
        const mNum = parseInt(period.slice(0, 2), 10);
        const yNum = period.slice(2);
        const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        if (mNum >= 1 && mNum <= 12) {
            period = `${months[mNum - 1]} ${yNum}`;
        }
    }

    const summary = {
        gstin,
        period,
        counts: { b2b: 0, b2cl: 0, b2cs: 0, exp: 0, nil: 0, cdnr: 0, cdnur: 0, at: 0, hsn: 0, docs: 0, totalDocs: 0 },
        breakdowns: {
            b2b: { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, total: 0 },
            b2cl: { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, total: 0 },
            b2cs: { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, total: 0 },
            zeroRated: { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, total: 0 },
            nilRated: { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, total: 0 },
            exempt: { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, total: 0 },
            creditNote: { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, total: 0 },
            creditNoteUr: { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, total: 0 },
            advanceReceived: { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, total: 0 },
            rcmOutward: { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, total: 0 }
        },
        totalOutwardTaxable: 0,
        totalOutwardTax: 0,
        totalOutwardCess: 0
    };

    const invoices = [];

    // 1. Parse B2B
    for (const group of (raw.b2b || [])) {
        const ctin = cleanStr(group.ctin).toUpperCase();
        const cname = cleanStr(group.cname || group.trade_name || '');
        for (const inv of (group.inv || [])) {
            summary.counts.b2b++;
            const inum = cleanStr(inv.inum);
            const idt = cleanStr(inv.idt);
            const val = cleanNum(inv.val);
            const pos = cleanStr(inv.pos);
            const rchrg = cleanStr(inv.rchrg || 'N').toUpperCase();
            const invTyp = cleanStr(inv.inv_typ || 'Regular');

            for (const itm of (inv.itms || [])) {
                const d = itm.itm_det || itm;
                const rt = cleanNum(d.rt);
                const txval = cleanNum(d.txval);
                const iamt = cleanNum(d.iamt);
                const camt = cleanNum(d.camt);
                const samt = cleanNum(d.samt);
                const csamt = cleanNum(d.csamt);

                summary.breakdowns.b2b.taxable += txval;
                summary.breakdowns.b2b.igst += iamt;
                summary.breakdowns.b2b.cgst += camt;
                summary.breakdowns.b2b.sgst += samt;
                summary.breakdowns.b2b.cess += csamt;

                if (rchrg === 'Y') {
                    summary.breakdowns.rcmOutward.taxable += txval;
                    summary.breakdowns.rcmOutward.igst += iamt;
                    summary.breakdowns.rcmOutward.cgst += camt;
                    summary.breakdowns.rcmOutward.sgst += samt;
                }

                invoices.push({
                    section: 'B2B',
                    ctin,
                    cname,
                    inum,
                    idt,
                    val,
                    pos,
                    rchrg,
                    inv_typ: invTyp,
                    rt,
                    txval,
                    iamt,
                    camt,
                    samt,
                    csamt,
                    return_period: period
                });
            }
        }
    }

    // 2. Parse B2CL (Large unregistered supplies > 2.5L)
    for (const group of (raw.b2cl || [])) {
        const pos = cleanStr(group.pos);
        for (const inv of (group.inv || [])) {
            summary.counts.b2cl++;
            const inum = cleanStr(inv.inum);
            const idt = cleanStr(inv.idt);
            const val = cleanNum(inv.val);

            for (const itm of (inv.itms || [])) {
                const d = itm.itm_det || itm;
                const rt = cleanNum(d.rt);
                const txval = cleanNum(d.txval);
                const iamt = cleanNum(d.iamt);
                const csamt = cleanNum(d.csamt);

                summary.breakdowns.b2cl.taxable += txval;
                summary.breakdowns.b2cl.igst += iamt;
                summary.breakdowns.b2cl.cess += csamt;

                invoices.push({
                    section: 'B2CL',
                    ctin: 'UNREGISTERED',
                    cname: 'B2C Large Consumer',
                    inum,
                    idt,
                    val,
                    pos,
                    rchrg: 'N',
                    inv_typ: 'B2CL',
                    rt,
                    txval,
                    iamt,
                    camt: 0,
                    samt: 0,
                    csamt,
                    return_period: period
                });
            }
        }
    }

    // 3. Parse B2CS (Small retail supplies)
    for (const row of (raw.b2cs || [])) {
        summary.counts.b2cs++;
        const pos = cleanStr(row.pos);
        const rt = cleanNum(row.rt);
        const txval = cleanNum(row.txval);
        const iamt = cleanNum(row.iamt);
        const camt = cleanNum(row.camt);
        const samt = cleanNum(row.samt);
        const csamt = cleanNum(row.csamt);

        summary.breakdowns.b2cs.taxable += txval;
        summary.breakdowns.b2cs.igst += iamt;
        summary.breakdowns.b2cs.cgst += camt;
        summary.breakdowns.b2cs.sgst += samt;
        summary.breakdowns.b2cs.cess += csamt;

        invoices.push({
            section: 'B2CS',
            ctin: 'B2CS',
            cname: 'Retail Consumer Small',
            inum: `B2CS_${pos}_${rt}%`,
            idt: period,
            val: txval + iamt + camt + samt + csamt,
            pos,
            rchrg: 'N',
            inv_typ: 'B2CS',
            rt,
            txval,
            iamt,
            camt,
            samt,
            csamt,
            return_period: period
        });
    }

    // 4. Parse CDNR (Credit/Debit Notes Registered)
    for (const group of (raw.cdnr || [])) {
        const ctin = cleanStr(group.ctin).toUpperCase();
        const cname = cleanStr(group.cname || '');
        for (const nt of (group.nt || [])) {
            summary.counts.cdnr++;
            const inum = cleanStr(nt.nt_num);
            const idt = cleanStr(nt.nt_dt);
            const val = cleanNum(nt.val);
            const pos = cleanStr(nt.pos);
            const rchrg = cleanStr(nt.rchrg || 'N').toUpperCase();
            const ntTyp = cleanStr(nt.ntty || 'C'); // 'C' = Credit Note, 'D' = Debit Note

            for (const itm of (nt.itms || [])) {
                const d = itm.itm_det || itm;
                const rt = cleanNum(d.rt);
                const txval = cleanNum(d.txval);
                const iamt = cleanNum(d.iamt);
                const camt = cleanNum(d.camt);
                const samt = cleanNum(d.samt);
                const csamt = cleanNum(d.csamt);

                summary.breakdowns.creditNote.taxable += txval;
                summary.breakdowns.creditNote.igst += iamt;
                summary.breakdowns.creditNote.cgst += camt;
                summary.breakdowns.creditNote.sgst += samt;
                summary.breakdowns.creditNote.cess += csamt;

                invoices.push({
                    section: 'CDNR',
                    ctin,
                    cname,
                    inum,
                    idt,
                    val,
                    pos,
                    rchrg,
                    inv_typ: ntTyp === 'C' ? 'Credit Note' : 'Debit Note',
                    rt,
                    txval,
                    iamt,
                    camt,
                    samt,
                    csamt,
                    return_period: period
                });
            }
        }
    }

    // 5. Parse EXP (Export supplies)
    for (const group of (raw.exp || [])) {
        const expTyp = cleanStr(group.exp_typ || 'WOPAY');
        for (const inv of (group.inv || [])) {
            summary.counts.exp++;
            const inum = cleanStr(inv.inum);
            const idt = cleanStr(inv.idt);
            const val = cleanNum(inv.val);

            for (const itm of (inv.itms || [])) {
                const txval = cleanNum(itm.txval);
                const iamt = cleanNum(itm.iamt);
                const csamt = cleanNum(itm.csamt);

                summary.breakdowns.zeroRated.taxable += txval;
                summary.breakdowns.zeroRated.igst += iamt;
                summary.breakdowns.zeroRated.cess += csamt;

                invoices.push({
                    section: 'EXP',
                    ctin: 'EXPORT',
                    cname: 'Foreign Recipient',
                    inum,
                    idt,
                    val,
                    pos: '96',
                    rchrg: 'N',
                    inv_typ: `Export (${expTyp})`,
                    rt: cleanNum(itm.rt),
                    txval,
                    iamt,
                    camt: 0,
                    samt: 0,
                    csamt,
                    return_period: period
                });
            }
        }
    }

    // 5.1 Parse CDNUR (Unregistered Credit/Debit Notes)
    for (const group of (raw.cdnur || [])) {
        const pos = cleanStr(group.pos);
        const ntTyp = cleanStr(group.ntty || 'C');
        const inum = cleanStr(group.nt_num);
        const idt = cleanStr(group.nt_dt);
        const val = cleanNum(group.val);
        for (const itm of (group.itms || [])) {
            const d = itm.itm_det || itm;
            const rt = cleanNum(d.rt);
            const txval = cleanNum(d.txval);
            const iamt = cleanNum(d.iamt);
            const camt = cleanNum(d.camt);
            const samt = cleanNum(d.samt);
            const csamt = cleanNum(d.csamt);

            summary.breakdowns.creditNoteUr.taxable += txval;
            summary.breakdowns.creditNoteUr.igst += iamt;
            summary.breakdowns.creditNoteUr.cgst += camt;
            summary.breakdowns.creditNoteUr.sgst += samt;
            summary.breakdowns.creditNoteUr.cess += csamt;

            invoices.push({
                section: 'CDNUR',
                ctin: 'UNREGISTERED',
                cname: 'Unregistered Consumer',
                inum,
                idt,
                val,
                pos,
                rchrg: 'N',
                inv_typ: ntTyp === 'C' ? 'Credit Note' : 'Debit Note',
                rt,
                txval,
                iamt,
                camt,
                samt,
                csamt,
                return_period: period
            });
        }
    }

    // 5.2 Parse Nil Rated (raw.nil)
    if (raw.nil && Array.isArray(raw.nil.inv)) {
        const descMap = {
            'INTRAB2B': 'Intra-state supplies to registered person',
            'INTRAB2C': 'Intra-state supplies to unregistered person',
            'INTRB2B': 'Inter-state supplies to registered person',
            'INTRB2C': 'Inter-state supplies to unregistered person'
        };

        for (const nilItm of raw.nil.inv) {
            const rawSplyTy = cleanStr(nilItm.sply_ty).toUpperCase();
            const friendlyDesc = descMap[rawSplyTy] || cleanStr(nilItm.sply_ty) || 'Intra-state supplies to registered person';
            const nilAmt = cleanNum(nilItm.nil_amt);
            const exptAmt = cleanNum(nilItm.expt_amt);
            const ngsupAmt = cleanNum(nilItm.ngsup_amt);

            summary.breakdowns.nilRated.taxable += nilAmt;
            summary.breakdowns.exempt.taxable += exptAmt;

            invoices.push({
                section: 'NIL',
                ctin: 'NIL',
                cname: friendlyDesc,
                inum: `NIL_${rawSplyTy || 'GEN'}`,
                idt: period,
                val: nilAmt + exptAmt + ngsupAmt,
                txval: nilAmt,
                camt: exptAmt,
                samt: ngsupAmt,
                exempt_amt: exptAmt,
                nongst_amt: ngsupAmt,
                item_desc: friendlyDesc,
                return_period: period
            });
        }
    }

    // 5.3 Parse HSN Summary (raw.hsn)
    const hsnData = (raw.hsn && Array.isArray(raw.hsn.data)) ? raw.hsn.data : (Array.isArray(raw.hsn) ? raw.hsn : []);
    for (let hIdx = 0; hIdx < hsnData.length; hIdx++) {
        const h = hsnData[hIdx];
        const hCode = cleanStr(h.hsn_sc || `HSN_${hIdx + 1}`);
        invoices.push({
            section: 'HSN',
            ctin: 'HSN',
            cname: cleanStr(h.desc),
            inum: hCode,
            hsn_sc: hCode,
            item_desc: cleanStr(h.desc),
            uqc: cleanStr(h.uqc),
            qty: cleanNum(h.qty),
            val: cleanNum(h.val),
            txval: cleanNum(h.txval),
            rt: cleanNum(h.rt),
            iamt: cleanNum(h.iamt),
            camt: cleanNum(h.camt),
            samt: cleanNum(h.samt),
            csamt: cleanNum(h.csamt),
            return_period: period
        });
    }

    // 5.4 Parse Document Issued Summary (raw.doc_issue)
    if (raw.doc_issue && Array.isArray(raw.doc_issue.doc_res)) {
        for (let drIdx = 0; drIdx < raw.doc_issue.doc_res.length; drIdx++) {
            const dr = raw.doc_issue.doc_res[drIdx];
            const docTyp = cleanStr(dr.doc_typ || 'Invoices for outward supply');
            const docList = Array.isArray(dr.docs) ? dr.docs : [];
            for (let dIdx = 0; dIdx < docList.length; dIdx++) {
                const d = docList[dIdx];
                const fromNum = cleanStr(d.from || `DOC_${drIdx + 1}_${dIdx + 1}`);
                invoices.push({
                    section: 'DOC',
                    ctin: 'DOC',
                    inum: fromNum,
                    from_num: fromNum,
                    to_num: cleanStr(d.to),
                    tot_num: cleanNum(d.totnum),
                    cancelled: cleanNum(d.cancel),
                    net_issued: cleanNum(d.net_issue),
                    doc_typ: docTyp,
                    inv_typ: docTyp,
                    return_period: period
                });
            }
        }
    }

    // 5.5 Parse ECO (raw.eco)
    for (let eIdx = 0; eIdx < (raw.eco || []).length; eIdx++) {
        const e = (raw.eco || [])[eIdx];
        const etin = cleanStr(e.etin || `ECO_${eIdx + 1}`);
        invoices.push({
            section: 'ECO',
            ctin: etin,
            cname: cleanStr(e.ename || 'E-Commerce Operator'),
            inum: etin,
            inv_typ: cleanStr(e.typ || 'ECOM'),
            txval: cleanNum(e.txval),
            iamt: cleanNum(e.iamt),
            camt: cleanNum(e.camt),
            samt: cleanNum(e.samt),
            csamt: cleanNum(e.csamt),
            return_period: period
        });
    }

    // 5.6 Parse Advance Received (raw.at)
    for (const a of (raw.at || [])) {
        const pos = cleanStr(a.pos);
        for (const itm of (a.itms || [])) {
            invoices.push({
                section: 'ADVREC',
                ctin: 'ADVANCE',
                pos,
                rt: cleanNum(itm.rt),
                txval: cleanNum(itm.ad_amt || itm.txval),
                iamt: cleanNum(itm.iamt),
                camt: cleanNum(itm.camt),
                samt: cleanNum(itm.samt),
                csamt: cleanNum(itm.csamt),
                return_period: period
            });
        }
    }

    // 5.7 Parse Advance Adjusted (raw.txpd or raw.atadj)
    for (const adj of (raw.txpd || raw.atadj || [])) {
        const pos = cleanStr(adj.pos);
        for (const itm of (adj.itms || [])) {
            invoices.push({
                section: 'ADVADJ',
                ctin: 'ADV_ADJUSTED',
                pos,
                rt: cleanNum(itm.rt),
                txval: cleanNum(itm.ad_amt || itm.txval),
                iamt: cleanNum(itm.iamt),
                camt: cleanNum(itm.camt),
                samt: cleanNum(itm.samt),
                csamt: cleanNum(itm.csamt),
                return_period: period
            });
        }
    }

    // 6. Section Summary List fallback (if raw is a portal secsum)
    const secList = raw.sec_list || raw.cur_sum || raw.secList || [];
    if (invoices.length === 0 && Array.isArray(secList) && secList.length > 0) {
        for (const sec of secList) {
            const secCd = String(sec.sec_nm || sec.sec || sec.cd || '').toUpperCase();
            const txval = cleanNum(sec.txval || sec.taxable || sec.tx_val || sec.tax_val || 0);
            const igst = cleanNum(sec.ttl_igst || sec.iamt || sec.igst || 0);
            const cgst = cleanNum(sec.ttl_cgst || sec.camt || sec.cgst || 0);
            const samt = cleanNum(sec.ttl_sgst || sec.samt || sec.sgst || 0);
            const csamt = cleanNum(sec.ttl_cess || sec.csamt || sec.cess || 0);

            if (secCd.includes('B2B') || secCd === '4A') {
                summary.breakdowns.b2b.taxable += txval;
                summary.breakdowns.b2b.igst += igst;
                summary.breakdowns.b2b.cgst += cgst;
                summary.breakdowns.b2b.sgst += samt;
                summary.breakdowns.b2b.cess += csamt;
                summary.counts.b2b += cleanNum(sec.ttl_rec || sec.ttl_doc || 1);
            } else if (secCd.includes('B2C') || secCd === '5A' || secCd === '7') {
                summary.breakdowns.b2cs.taxable += txval;
                summary.breakdowns.b2cs.igst += igst;
                summary.breakdowns.b2cs.cgst += cgst;
                summary.breakdowns.b2cs.sgst += samt;
                summary.breakdowns.b2cs.cess += csamt;
                summary.counts.b2cs += 1;
            } else if (secCd.includes('EXP') || secCd === '6A') {
                summary.breakdowns.zeroRated.taxable += txval;
                summary.breakdowns.zeroRated.igst += igst;
                summary.breakdowns.zeroRated.cess += csamt;
                summary.counts.exp += 1;
            } else if (secCd.includes('CDN') || secCd === '9B') {
                summary.breakdowns.creditNote.taxable += txval;
                summary.breakdowns.creditNote.igst += igst;
                summary.breakdowns.creditNote.cgst += cgst;
                summary.breakdowns.creditNote.sgst += samt;
                summary.breakdowns.creditNote.cess += csamt;
                summary.counts.cdnr += 1;
            }
        }
    }

    // Totals calculation
    let totTx = 0;
    let totTax = 0;
    let totCess = 0;

    for (const k of Object.keys(summary.breakdowns)) {
        const b = summary.breakdowns[k];
        b.total = (b.cgst || 0) + (b.sgst || 0) + (b.igst || 0) + (b.cess || 0);
        if (k !== 'rcmOutward') {
            totTx += (b.taxable || 0);
            totTax += (b.cgst || 0) + (b.sgst || 0) + (b.igst || 0);
            totCess += (b.cess || 0);
        }
    }

    summary.totalOutwardTaxable = Math.round(totTx * 100) / 100;
    summary.totalOutwardTax = Math.round(totTax * 100) / 100;
    summary.totalOutwardCess = Math.round(totCess * 100) / 100;
    summary.counts.totalDocs = summary.counts.b2b + summary.counts.b2cl + summary.counts.b2cs + summary.counts.cdnr + summary.counts.exp;

    return { summary, invoices };
}

/**
 * parseGstr1Excel — Extracts summary and invoices from official GSTR-1 Excel.
 */
export function parseGstr1Excel(filePath, fallbackGstin = '', fallbackPeriod = '') {
    if (!fs.existsSync(filePath)) return null;
    let wb;
    try {
        wb = XLSX.readFile(filePath, { cellDates: true });
    } catch (e) {
        return null;
    }

    const invoices = [];
    const gstin = fallbackGstin.toUpperCase();
    const period = normalizePeriod(fallbackPeriod);

    const summary = {
        gstin,
        period,
        counts: { b2b: 0, b2cl: 0, b2cs: 0, exp: 0, nil: 0, cdnr: 0, cdnur: 0, at: 0, hsn: 0, docs: 0, totalDocs: 0 },
        breakdowns: {
            b2b: { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, total: 0 },
            b2cl: { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, total: 0 },
            b2cs: { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, total: 0 },
            zeroRated: { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, total: 0 },
            nilRated: { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, total: 0 },
            exempt: { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, total: 0 },
            creditNote: { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, total: 0 },
            creditNoteUr: { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, total: 0 },
            advanceReceived: { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, total: 0 },
            rcmOutward: { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, total: 0 }
        },
        totalOutwardTaxable: 0,
        totalOutwardTax: 0,
        totalOutwardCess: 0
    };

    for (const sheetName of wb.SheetNames) {
        const upper = sheetName.toUpperCase().replace(/\s+/g, '');
        const ws = wb.Sheets[sheetName];
        if (!ws) continue;
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        if (rows.length < 2) continue;

        let headerIdx = -1;
        for (let i = 0; i < Math.min(8, rows.length); i++) {
            const rowStr = rows[i].map(c => String(c).toLowerCase()).join(' ');
            if (rowStr.includes('taxable') || rowStr.includes('invoice') || rowStr.includes('gstin') || rowStr.includes('rate')) {
                headerIdx = i;
                break;
            }
        }
        if (headerIdx === -1) continue;

        const headers = rows[headerIdx].map(c => String(c).trim().toLowerCase());
        const getCol = (key) => headers.findIndex(h => h.includes(key));

        const ctinIdx = getCol('gstin') !== -1 ? getCol('gstin') : getCol('recipient');
        const cnameIdx = getCol('name') !== -1 ? getCol('name') : getCol('receiver');
        const inumIdx = getCol('invoice number') !== -1 ? getCol('invoice number') : getCol('inv no');
        const idtIdx = getCol('date');
        const valIdx = getCol('invoice value') !== -1 ? getCol('invoice value') : getCol('value');
        const txvalIdx = getCol('taxable value') !== -1 ? getCol('taxable value') : getCol('taxable');
        const igstIdx = getCol('integrated') !== -1 ? getCol('integrated') : getCol('igst');
        const cgstIdx = getCol('central') !== -1 ? getCol('central') : getCol('cgst');
        const samtIdx = getCol('state') !== -1 ? getCol('state') : getCol('sgst');
        const csamtIdx = getCol('cess');
        const rtIdx = getCol('rate');
        const posIdx = getCol('place of supply') !== -1 ? getCol('place of supply') : getCol('pos');
        const rchrgIdx = getCol('reverse charge') !== -1 ? getCol('reverse charge') : getCol('rchrg');
        const nilIdx = getCol('nil');
        const exemptIdx = getCol('exempt');
        const nongstIdx = getCol('non-gst') !== -1 ? getCol('non-gst') : getCol('non gst');
        const descIdx = getCol('description') !== -1 ? getCol('description') : getCol('supply');

        for (let r = headerIdx + 1; r < rows.length; r++) {
            const row = rows[r];
            if (!row || row.length === 0) continue;
            const txval = txvalIdx !== -1 ? cleanNum(row[txvalIdx]) : 0;
            const igst = igstIdx !== -1 ? cleanNum(row[igstIdx]) : 0;
            const cgst = cgstIdx !== -1 ? cleanNum(row[cgstIdx]) : 0;
            const samt = samtIdx !== -1 ? cleanNum(row[samtIdx]) : 0;
            const csamt = csamtIdx !== -1 ? cleanNum(row[csamtIdx]) : 0;
            const nilAmt = nilIdx !== -1 ? cleanNum(row[nilIdx]) : 0;
            const exptAmt = exemptIdx !== -1 ? cleanNum(row[exemptIdx]) : 0;
            const ngsupAmt = nongstIdx !== -1 ? cleanNum(row[nongstIdx]) : 0;

            let sec = 'B2B';
            if (upper.includes('B2CL') || upper.includes('5A')) sec = 'B2CL';
            else if (upper.includes('B2CS') || upper.includes('7')) sec = 'B2CS';
            else if (upper.includes('CDNR') || upper.includes('9B')) sec = 'CDNR';
            else if (upper.includes('CDNUR')) sec = 'CDNUR';
            else if (upper.includes('EXP') || upper.includes('6A')) sec = 'EXP';
            else if (upper.includes('NIL') || upper.includes('EXEMPT') || upper === '8' || upper.startsWith('8')) sec = 'NIL';
            else if (upper.includes('HSN') || upper === '12') sec = 'HSN';
            else if (upper.includes('DOC') || upper === '13') sec = 'DOC';
            else if (upper.includes('ECO') || upper === '14') sec = 'ECO';
            else if (upper.includes('ADVREC') || upper.includes('AT') || upper === '11A') sec = 'ADVREC';
            else if (upper.includes('ADVADJ') || upper.includes('TXPD') || upper === '11B') sec = 'ADVADJ';

            if (sec === 'NIL') {
                if (nilAmt === 0 && exptAmt === 0 && ngsupAmt === 0 && txval === 0) continue;
            } else {
                if (txval === 0 && igst === 0 && cgst === 0 && samt === 0) continue;
            }

            const ctin = ctinIdx !== -1 ? cleanStr(row[ctinIdx]).toUpperCase() : '';
            const cname = cnameIdx !== -1 ? cleanStr(row[cnameIdx]) : '';
            const inum = inumIdx !== -1 ? cleanStr(row[inumIdx]) : `DOC_${r}`;
            const idt = idtIdx !== -1 ? cleanStr(row[idtIdx]) : period;
            const val = valIdx !== -1 ? cleanNum(row[valIdx]) : (txval + igst + cgst + samt + csamt);
            const rt = rtIdx !== -1 ? cleanNum(row[rtIdx]) : 0;
            const pos = posIdx !== -1 ? cleanStr(row[posIdx]) : '';
            const rchrg = rchrgIdx !== -1 ? cleanStr(row[rchrgIdx]).toUpperCase() : 'N';

            const finalTxval = sec === 'NIL' ? (txval || nilAmt) : txval;
            invoices.push({
                section: sec,
                ctin: sec === 'NIL' ? 'NIL' : ctin,
                cname: sec === 'NIL' ? ((descIdx !== -1 ? cleanStr(row[descIdx]) : '') || 'Nil Rated Supplies') : cname,
                inum: sec === 'NIL' ? `NIL_${r}` : inum,
                idt,
                val: sec === 'NIL' ? (nilAmt + exptAmt + ngsupAmt) : val,
                pos,
                rchrg,
                inv_typ: sec,
                rt,
                txval: finalTxval,
                nil_amt: nilAmt,
                exempt_amt: exptAmt,
                nongst_amt: ngsupAmt,
                iamt: igst,
                camt: sec === 'NIL' ? exptAmt : cgst,
                samt: sec === 'NIL' ? ngsupAmt : samt,
                csamt,
                return_period: period
            });

            if (sec === 'B2B') {
                summary.counts.b2b++;
                summary.breakdowns.b2b.taxable += txval;
                summary.breakdowns.b2b.igst += igst;
                summary.breakdowns.b2b.cgst += cgst;
                summary.breakdowns.b2b.sgst += samt;
                summary.breakdowns.b2b.cess += csamt;
            } else if (sec === 'B2CL') {
                summary.counts.b2cl++;
                summary.breakdowns.b2cl.taxable += txval;
                summary.breakdowns.b2cl.igst += igst;
                summary.breakdowns.b2cl.cess += csamt;
            } else if (sec === 'B2CS') {
                summary.counts.b2cs++;
                summary.breakdowns.b2cs.taxable += txval;
                summary.breakdowns.b2cs.igst += igst;
                summary.breakdowns.b2cs.cgst += cgst;
                summary.breakdowns.b2cs.sgst += samt;
                summary.breakdowns.b2cs.cess += csamt;
            } else if (sec === 'CDNR') {
                summary.counts.cdnr++;
                summary.breakdowns.creditNote.taxable += txval;
                summary.breakdowns.creditNote.igst += igst;
                summary.breakdowns.creditNote.cgst += cgst;
                summary.breakdowns.creditNote.sgst += samt;
                summary.breakdowns.creditNote.cess += csamt;
            } else if (sec === 'EXP') {
                summary.counts.exp++;
                summary.breakdowns.zeroRated.taxable += txval;
                summary.breakdowns.zeroRated.igst += igst;
                summary.breakdowns.zeroRated.cess += csamt;
            } else if (sec === 'NIL') {
                summary.counts.nil = (summary.counts.nil || 0) + 1;
                summary.breakdowns.nilRated.taxable += nilAmt;
                summary.breakdowns.exempt.taxable += exptAmt;
            }
        }
    }

    let totTx = 0, totTax = 0, totCess = 0;
    for (const k of Object.keys(summary.breakdowns)) {
        const b = summary.breakdowns[k];
        b.total = (b.cgst || 0) + (b.sgst || 0) + (b.igst || 0) + (b.cess || 0);
        if (k !== 'rcmOutward') {
            totTx += (b.taxable || 0);
            totTax += (b.cgst || 0) + (b.sgst || 0) + (b.igst || 0);
            totCess += (b.cess || 0);
        }
    }

    summary.totalOutwardTaxable = Math.round(totTx * 100) / 100;
    summary.totalOutwardTax = Math.round(totTax * 100) / 100;
    summary.totalOutwardCess = Math.round(totCess * 100) / 100;
    summary.counts.totalDocs = invoices.length;

    return { summary, invoices };
}

/**
 * parseGstr1Zip — Extracts and parses GSTR-1 from ZIP archive.
 */
export async function parseGstr1Zip(zipPath, fallbackGstin = '', fallbackPeriod = '') {
    try {
        const data = fs.readFileSync(zipPath);
        const zip = await JSZip.loadAsync(data);
        const jsonFile = Object.keys(zip.files).find(f => f.toLowerCase().endsWith('.json'));
        if (jsonFile) {
            const text = await zip.files[jsonFile].async('text');
            return parseGstr1Json(JSON.parse(text), fallbackGstin, fallbackPeriod);
        }
        const xlsxFile = Object.keys(zip.files).find(f => f.toLowerCase().endsWith('.xlsx') || f.toLowerCase().endsWith('.xls'));
        if (xlsxFile) {
            const buf = await zip.files[xlsxFile].async('nodebuffer');
            const tempPath = path.join(os.tmpdir(), `gstr1_${Date.now()}.xlsx`);
            fs.writeFileSync(tempPath, buf);
            const res = parseGstr1Excel(tempPath, fallbackGstin, fallbackPeriod);
            try { fs.unlinkSync(tempPath); } catch (e) {}
            return res;
        }
        return null;
    } catch (e) {
        return null;
    }
}
