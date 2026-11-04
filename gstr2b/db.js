import { randomUUID, createHash } from 'crypto';

// ─── 1. DATABASE SCHEMA INITIALIZATION ──────────────────────────────────────
export function initGstr2bDatabase(db) {
    db.serialize(() => {
        // Table 1: GSTR-2B Batches per client & return period
        db.run(`CREATE TABLE IF NOT EXISTS gstr2b_batches (
            id TEXT PRIMARY KEY,
            client_gstin TEXT NOT NULL,
            return_period TEXT NOT NULL,
            status TEXT DEFAULT 'PENDING',
            total_invoices INTEGER DEFAULT 0,
            b2b_count INTEGER DEFAULT 0,
            b2ba_count INTEGER DEFAULT 0,
            cdnr_count INTEGER DEFAULT 0,
            cdnra_count INTEGER DEFAULT 0,
            isd_count INTEGER DEFAULT 0,
            impg_count INTEGER DEFAULT 0,
            eligible_itc_igst REAL DEFAULT 0,
            eligible_itc_cgst REAL DEFAULT 0,
            eligible_itc_sgst REAL DEFAULT 0,
            eligible_itc_cess REAL DEFAULT 0,
            eligible_itc_total REAL DEFAULT 0,
            ineligible_itc_total REAL DEFAULT 0,
            excel_path TEXT,
            json_path TEXT,
            downloaded_at INTEGER,
            created_at INTEGER,
            updated_at INTEGER,
            UNIQUE(client_gstin, return_period)
        )`);

        // Table 2: Line-item invoices from GSTR-2B
        db.run(`CREATE TABLE IF NOT EXISTS gstr2b_invoices (
            id TEXT PRIMARY KEY,
            batch_id TEXT,
            client_gstin TEXT NOT NULL,
            return_period TEXT NOT NULL,
            section TEXT DEFAULT 'B2B',
            ctin TEXT NOT NULL,
            supplier_name TEXT,
            inum TEXT NOT NULL,
            idt TEXT NOT NULL,
            inv_typ TEXT DEFAULT 'Regular',
            pos TEXT,
            rchrg TEXT DEFAULT 'N',
            itc_available TEXT DEFAULT 'Y',
            itc_reason TEXT,
            txval REAL DEFAULT 0,
            igst REAL DEFAULT 0,
            cgst REAL DEFAULT 0,
            sgst REAL DEFAULT 0,
            cess REAL DEFAULT 0,
            total_val REAL DEFAULT 0,
            source_period TEXT,
            filing_date TEXT,
            created_at INTEGER,
            UNIQUE(client_gstin, return_period, section, ctin, inum, idt)
        )`);

        // Table 3: GSTR-1 Summaries per client & return period
        db.run(`CREATE TABLE IF NOT EXISTS gstr1_summaries (
            client_gstin TEXT NOT NULL,
            return_period TEXT NOT NULL,
            raw_summary TEXT NOT NULL,
            total_taxable REAL DEFAULT 0,
            total_tax REAL DEFAULT 0,
            updated_at INTEGER,
            PRIMARY KEY(client_gstin, return_period)
        )`);

        // Performance Indexes
        db.run(`CREATE INDEX IF NOT EXISTS idx_gstr2b_batches_period ON gstr2b_batches(return_period)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_gstr2b_invoices_batch ON gstr2b_invoices(batch_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_gstr2b_invoices_client ON gstr2b_invoices(client_gstin, return_period)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_gstr1_summaries_client ON gstr1_summaries(client_gstin, return_period)`);

        // Table 4: GSTR-3B Inward ITC Allocations & Audit Trail
        db.run(`CREATE TABLE IF NOT EXISTS gstr3b_itc_allocations (
            id TEXT PRIMARY KEY,
            client_gstin TEXT NOT NULL,
            return_period TEXT NOT NULL,
            invoice_id TEXT NOT NULL,
            target_table TEXT NOT NULL,
            notes TEXT,
            allocated_by TEXT DEFAULT 'User',
            created_at INTEGER,
            updated_at INTEGER,
            UNIQUE(client_gstin, return_period, invoice_id)
        )`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_gstr3b_itc_alloc_client ON gstr3b_itc_allocations(client_gstin, return_period)`);

        // Migration: add separated RCM, CDNR, IMPG, ISD columns if not present
        const addCol = (colDef) => {
            db.run(`ALTER TABLE gstr2b_batches ADD COLUMN ${colDef}`, () => {});
        };
        addCol('rcm_igst REAL DEFAULT 0');
        addCol('rcm_cgst REAL DEFAULT 0');
        addCol('rcm_sgst REAL DEFAULT 0');
        addCol('rcm_total REAL DEFAULT 0');
        addCol('cdnr_igst REAL DEFAULT 0');
        addCol('cdnr_cgst REAL DEFAULT 0');
        addCol('cdnr_sgst REAL DEFAULT 0');
        addCol('cdnr_total REAL DEFAULT 0');
        addCol('impg_igst REAL DEFAULT 0');
        addCol('isd_total REAL DEFAULT 0');
        addCol('eligible_itc_txval REAL DEFAULT 0');
        addCol('rcm_txval REAL DEFAULT 0');
        addCol('cdnr_txval REAL DEFAULT 0');
        addCol('ineligible_itc_txval REAL DEFAULT 0');
        addCol('ineligible_itc_igst REAL DEFAULT 0');
        addCol('ineligible_itc_cgst REAL DEFAULT 0');
        addCol('ineligible_itc_sgst REAL DEFAULT 0');
        addCol('ineligible_itc_cess REAL DEFAULT 0');
    });
}

// ─── 2. RECALCULATE BATCH METRICS & UPSERT BATCH ────────────────────────────
export function recalculate2bBatchMetrics(db, clientGstin, returnPeriod) {
    return new Promise((resolve, reject) => {
        const query = `
            SELECT 
                COUNT(*) as total_invoices,
                SUM(CASE WHEN UPPER(section) LIKE '%B2B%' AND UPPER(section) NOT LIKE '%REJECTED%' THEN 1 ELSE 0 END) as b2b_count,
                SUM(CASE WHEN UPPER(section) LIKE '%B2BA%' THEN 1 ELSE 0 END) as b2ba_count,
                SUM(CASE WHEN UPPER(section) LIKE '%CDNR%' AND UPPER(section) NOT LIKE '%REJECTED%' THEN 1 ELSE 0 END) as cdnr_count,
                SUM(CASE WHEN UPPER(section) LIKE '%CDNRA%' THEN 1 ELSE 0 END) as cdnra_count,
                SUM(CASE WHEN UPPER(section) LIKE '%ISD%' THEN 1 ELSE 0 END) as isd_count,
                SUM(CASE WHEN UPPER(section) LIKE '%IMPG%' THEN 1 ELSE 0 END) as impg_count,
                -- 1. Table 4(A)(5) All Other ITC (strictly non-RCM, non-CDNR, non-IMPG, non-ISD)
                SUM(CASE 
                    WHEN itc_available = 'Y' AND rchrg != 'Y' AND UPPER(section) NOT LIKE '%CDNR%' AND UPPER(section) NOT LIKE '%IMPG%' AND UPPER(section) NOT LIKE '%ISD%' THEN txval
                    ELSE 0 END
                ) as eligible_txval,
                SUM(CASE 
                    WHEN itc_available = 'Y' AND rchrg != 'Y' AND UPPER(section) NOT LIKE '%CDNR%' AND UPPER(section) NOT LIKE '%IMPG%' AND UPPER(section) NOT LIKE '%ISD%' THEN igst
                    ELSE 0 END
                ) as eligible_igst,
                SUM(CASE 
                    WHEN itc_available = 'Y' AND rchrg != 'Y' AND UPPER(section) NOT LIKE '%CDNR%' AND UPPER(section) NOT LIKE '%IMPG%' AND UPPER(section) NOT LIKE '%ISD%' THEN cgst
                    ELSE 0 END
                ) as eligible_cgst,
                SUM(CASE 
                    WHEN itc_available = 'Y' AND rchrg != 'Y' AND UPPER(section) NOT LIKE '%CDNR%' AND UPPER(section) NOT LIKE '%IMPG%' AND UPPER(section) NOT LIKE '%ISD%' THEN sgst
                    ELSE 0 END
                ) as eligible_sgst,
                SUM(CASE 
                    WHEN itc_available = 'Y' AND rchrg != 'Y' AND UPPER(section) NOT LIKE '%CDNR%' AND UPPER(section) NOT LIKE '%IMPG%' AND UPPER(section) NOT LIKE '%ISD%' THEN cess
                    ELSE 0 END
                ) as eligible_cess,
                -- 2. Reverse charge supplies Table 3.1(d) & Table 4(A)(3)
                SUM(CASE WHEN itc_available = 'Y' AND rchrg = 'Y' THEN txval ELSE 0 END) as rcm_txval,
                SUM(CASE WHEN itc_available = 'Y' AND rchrg = 'Y' THEN igst ELSE 0 END) as rcm_igst,
                SUM(CASE WHEN itc_available = 'Y' AND rchrg = 'Y' THEN cgst ELSE 0 END) as rcm_cgst,
                SUM(CASE WHEN itc_available = 'Y' AND rchrg = 'Y' THEN sgst ELSE 0 END) as rcm_sgst,
                -- 3. Supplier Credit Notes (Row 38)
                SUM(CASE WHEN itc_available = 'Y' AND UPPER(section) LIKE '%CDNR%' THEN txval ELSE 0 END) as cdnr_txval,
                SUM(CASE WHEN itc_available = 'Y' AND UPPER(section) LIKE '%CDNR%' THEN igst ELSE 0 END) as cdnr_igst,
                SUM(CASE WHEN itc_available = 'Y' AND UPPER(section) LIKE '%CDNR%' THEN cgst ELSE 0 END) as cdnr_cgst,
                SUM(CASE WHEN itc_available = 'Y' AND UPPER(section) LIKE '%CDNR%' THEN sgst ELSE 0 END) as cdnr_sgst,
                -- 4. Import of Goods Table 4(A)(1)
                SUM(CASE WHEN itc_available = 'Y' AND UPPER(section) LIKE '%IMPG%' THEN igst ELSE 0 END) as impg_igst,
                -- 5. ISD Table 4(A)(4)
                SUM(CASE WHEN itc_available = 'Y' AND UPPER(section) LIKE '%ISD%' THEN (igst + cgst + sgst) ELSE 0 END) as isd_total,
                -- 6. Ineligible ITC Table 4(B)
                SUM(CASE WHEN itc_available = 'N' THEN txval ELSE 0 END) as inelig_txval,
                SUM(CASE WHEN itc_available = 'N' THEN igst ELSE 0 END) as inelig_igst,
                SUM(CASE WHEN itc_available = 'N' THEN cgst ELSE 0 END) as inelig_cgst,
                SUM(CASE WHEN itc_available = 'N' THEN sgst ELSE 0 END) as inelig_sgst,
                SUM(CASE WHEN itc_available = 'N' THEN cess ELSE 0 END) as inelig_cess,
                SUM(CASE 
                    WHEN itc_available = 'N' THEN (igst + cgst + sgst + cess)
                    ELSE 0 END
                ) as ineligible_total
            FROM gstr2b_invoices
            WHERE client_gstin = ? AND return_period = ?
        `;

        db.get(query, [clientGstin, returnPeriod], (err, row) => {
            if (err) return reject(err);

            const totalInvs = row?.total_invoices || 0;
            const eligTxval = Math.round((row?.eligible_txval || 0) * 100) / 100;
            const eligIgst = Math.round((row?.eligible_igst || 0) * 100) / 100;
            const eligCgst = Math.round((row?.eligible_cgst || 0) * 100) / 100;
            const eligSgst = Math.round((row?.eligible_sgst || 0) * 100) / 100;
            const eligCess = Math.round((row?.eligible_cess || 0) * 100) / 100;
            const eligTotal = Math.round((eligIgst + eligCgst + eligSgst + eligCess) * 100) / 100;

            const rcmTxval = Math.round((row?.rcm_txval || 0) * 100) / 100;
            const rcmIgst = Math.round((row?.rcm_igst || 0) * 100) / 100;
            const rcmCgst = Math.round((row?.rcm_cgst || 0) * 100) / 100;
            const rcmSgst = Math.round((row?.rcm_sgst || 0) * 100) / 100;
            const rcmTotal = Math.round((rcmIgst + rcmCgst + rcmSgst) * 100) / 100;

            const cdnrTxval = Math.round((row?.cdnr_txval || 0) * 100) / 100;
            const cdnrIgst = Math.round((row?.cdnr_igst || 0) * 100) / 100;
            const cdnrCgst = Math.round((row?.cdnr_cgst || 0) * 100) / 100;
            const cdnrSgst = Math.round((row?.cdnr_sgst || 0) * 100) / 100;
            const cdnrTotal = Math.round((cdnrIgst + cdnrCgst + cdnrSgst) * 100) / 100;

            const impgIgst = Math.round((row?.impg_igst || 0) * 100) / 100;
            const isdTotal = Math.round((row?.isd_total || 0) * 100) / 100;
            const ineligTxval = Math.round((row?.inelig_txval || 0) * 100) / 100;
            const ineligIgst = Math.round((row?.inelig_igst || 0) * 100) / 100;
            const ineligCgst = Math.round((row?.inelig_cgst || 0) * 100) / 100;
            const ineligSgst = Math.round((row?.inelig_sgst || 0) * 100) / 100;
            const ineligCess = Math.round((row?.inelig_cess || 0) * 100) / 100;
            const ineligTotal = Math.round((row?.ineligible_total || (ineligIgst + ineligCgst + ineligSgst + ineligCess)) * 100) / 100;

            const batchId = randomUUID();
            const now = Date.now();

            db.get(`SELECT status FROM gstr2b_batches WHERE client_gstin = ? AND return_period = ?`, [clientGstin, returnPeriod], (bErr, existingBatch) => {
                if (bErr) return reject(bErr);

                let targetStatus = 'SYNCED';
                if (totalInvs === 0) {
                    targetStatus = (existingBatch && existingBatch.status === 'NIL_SYNCED') ? 'NIL_SYNCED' : 'PENDING';
                }

                const upsertQuery = `
                    INSERT INTO gstr2b_batches (
                        id, client_gstin, return_period, status,
                        total_invoices, b2b_count, b2ba_count, cdnr_count, cdnra_count, isd_count, impg_count,
                        eligible_itc_igst, eligible_itc_cgst, eligible_itc_sgst, eligible_itc_cess,
                        eligible_itc_total, rcm_igst, rcm_cgst, rcm_sgst, rcm_total,
                        cdnr_igst, cdnr_cgst, cdnr_sgst, cdnr_total, impg_igst, isd_total,
                        ineligible_itc_total, eligible_itc_txval, rcm_txval, cdnr_txval,
                        ineligible_itc_txval, ineligible_itc_igst, ineligible_itc_cgst, ineligible_itc_sgst, ineligible_itc_cess,
                        downloaded_at, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(client_gstin, return_period) DO UPDATE SET
                        status = excluded.status,
                        total_invoices = excluded.total_invoices,
                        b2b_count = excluded.b2b_count,
                        b2ba_count = excluded.b2ba_count,
                        cdnr_count = excluded.cdnr_count,
                        cdnra_count = excluded.cdnra_count,
                        isd_count = excluded.isd_count,
                        impg_count = excluded.impg_count,
                        eligible_itc_igst = excluded.eligible_itc_igst,
                        eligible_itc_cgst = excluded.eligible_itc_cgst,
                        eligible_itc_sgst = excluded.eligible_itc_sgst,
                        eligible_itc_cess = excluded.eligible_itc_cess,
                        eligible_itc_total = excluded.eligible_itc_total,
                        rcm_igst = excluded.rcm_igst,
                        rcm_cgst = excluded.rcm_cgst,
                        rcm_sgst = excluded.rcm_sgst,
                        rcm_total = excluded.rcm_total,
                        cdnr_igst = excluded.cdnr_igst,
                        cdnr_cgst = excluded.cdnr_cgst,
                        cdnr_sgst = excluded.cdnr_sgst,
                        cdnr_total = excluded.cdnr_total,
                        impg_igst = excluded.impg_igst,
                        isd_total = excluded.isd_total,
                        ineligible_itc_total = excluded.ineligible_itc_total,
                        eligible_itc_txval = excluded.eligible_itc_txval,
                        rcm_txval = excluded.rcm_txval,
                        cdnr_txval = excluded.cdnr_txval,
                        ineligible_itc_txval = excluded.ineligible_itc_txval,
                        ineligible_itc_igst = excluded.ineligible_itc_igst,
                        ineligible_itc_cgst = excluded.ineligible_itc_cgst,
                        ineligible_itc_sgst = excluded.ineligible_itc_sgst,
                        ineligible_itc_cess = excluded.ineligible_itc_cess,
                        downloaded_at = COALESCE(gstr2b_batches.downloaded_at, excluded.downloaded_at),
                        updated_at = excluded.updated_at
                `;

                db.run(upsertQuery, [
                    batchId, clientGstin, returnPeriod, targetStatus,
                    totalInvs, row?.b2b_count || 0, row?.b2ba_count || 0, row?.cdnr_count || 0, row?.cdnra_count || 0,
                    row?.isd_count || 0, row?.impg_count || 0,
                    eligIgst, eligCgst, eligSgst, eligCess, eligTotal,
                    rcmIgst, rcmCgst, rcmSgst, rcmTotal,
                    cdnrIgst, cdnrCgst, cdnrSgst, cdnrTotal,
                    impgIgst, isdTotal, ineligTotal,
                    eligTxval, rcmTxval, cdnrTxval,
                    ineligTxval, ineligIgst, ineligCgst, ineligSgst, ineligCess,
                    now, now, now
                ], (uErr) => {
                    if (uErr) return reject(uErr);
                    resolve({
                        status: targetStatus,
                        totalInvoices: totalInvs,
                        total_invoices: totalInvs,
                        b2bCount: row?.b2b_count || 0,
                        b2b_count: row?.b2b_count || 0,
                        b2ba_count: row?.b2ba_count || 0,
                        cdnrCount: row?.cdnr_count || 0,
                        cdnr_count: row?.cdnr_count || 0,
                        cdnra_count: row?.cdnra_count || 0,
                        isd_count: row?.isd_count || 0,
                        impg_count: row?.impg_count || 0,
                        eligible_txval: eligTxval,
                        eligible_igst: eligIgst,
                        eligible_cgst: eligCgst,
                        eligible_sgst: eligSgst,
                        eligible_cess: eligCess,
                        eligible_total: eligTotal,
                        eligible_itc_txval: eligTxval,
                        eligible_itc_igst: eligIgst,
                        eligible_itc_cgst: eligCgst,
                        eligible_itc_sgst: eligSgst,
                        eligible_itc_cess: eligCess,
                        eligible_itc_total: eligTotal,
                        rcm_txval: rcmTxval,
                        rcm_igst: rcmIgst,
                        rcm_cgst: rcmCgst,
                        rcm_sgst: rcmSgst,
                        rcm_total: rcmTotal,
                        cdnr_txval: cdnrTxval,
                        cdnr_igst: cdnrIgst,
                        cdnr_cgst: cdnrCgst,
                        cdnr_sgst: cdnrSgst,
                        cdnr_total: cdnrTotal,
                        impg_igst: impgIgst,
                        isd_total: isdTotal,
                        ineligible_txval: ineligTxval,
                        ineligible_igst: ineligIgst,
                        ineligible_cgst: ineligCgst,
                        ineligible_sgst: ineligSgst,
                        ineligible_cess: ineligCess,
                        ineligible_total: ineligTotal,
                        ineligible_itc_total: ineligTotal,
                        ineligible_itc_txval: ineligTxval,
                        ineligible_itc_igst: ineligIgst,
                        ineligible_itc_cgst: ineligCgst,
                        ineligible_itc_sgst: ineligSgst,
                        ineligible_itc_cess: ineligCess,
                        eligibleItc: {
                            taxable: eligTxval,
                            igst: eligIgst,
                            cgst: eligCgst,
                            sgst: eligSgst,
                            cess: eligCess,
                            total: eligTotal
                        },
                        rcmInward: {
                            taxable: rcmTxval,
                            igst: rcmIgst,
                            cgst: rcmCgst,
                            sgst: rcmSgst,
                            total: rcmTotal
                        },
                        creditNotes: {
                            taxable: cdnrTxval,
                            igst: cdnrIgst,
                            cgst: cdnrCgst,
                            sgst: cdnrSgst,
                            total: cdnrTotal
                        },
                        ineligibleItc: {
                            taxable: ineligTxval,
                            igst: ineligIgst,
                            cgst: ineligCgst,
                            sgst: ineligSgst,
                            cess: ineligCess,
                            total: ineligTotal
                        },
                        ineligibleTotal: ineligTotal
                    });
                });
            });
        });
    });
}

// ─── 3. BULK INGEST PARSED INVOICES ─────────────────────────────────────────
export function bulkSaveGstr2bInvoices(db, clientGstin, returnPeriod, invoices, excelPath = null, jsonPath = null) {
    return new Promise((resolve, reject) => {
        if (!invoices || invoices.length === 0) return resolve({ count: 0 });

        db.serialize(() => {
            db.run('BEGIN TRANSACTION');

            const now = Date.now();
            const affectedPeriods = new Set();
            if (returnPeriod) affectedPeriods.add(returnPeriod);
            for (const inv of invoices) {
                const rowPeriod = (inv.return_period && String(inv.return_period).trim().length >= 4)
                    ? String(inv.return_period).trim()
                    : returnPeriod;
                if (rowPeriod) affectedPeriods.add(rowPeriod);
            }

            let txError = null;
            // Clean out stale invoices for affected periods so duplicate/corrupted records are cleanly replaced
            for (const p of affectedPeriods) {
                db.run('DELETE FROM gstr2b_invoices WHERE client_gstin = ? AND return_period = ?', [clientGstin, p], (delErr) => {
                    if (delErr && !txError) txError = delErr;
                });
            }

            const stmt = db.prepare(`
                INSERT INTO gstr2b_invoices (
                    id, batch_id, client_gstin, return_period, section,
                    ctin, supplier_name, inum, idt, inv_typ,
                    pos, rchrg, itc_available, itc_reason,
                    txval, igst, cgst, sgst, cess,
                    total_val, source_period, filing_date, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(client_gstin, return_period, section, ctin, inum, idt) DO UPDATE SET
                    supplier_name = excluded.supplier_name,
                    inv_typ = excluded.inv_typ,
                    pos = excluded.pos,
                    rchrg = excluded.rchrg,
                    itc_available = excluded.itc_available,
                    itc_reason = excluded.itc_reason,
                    txval = excluded.txval,
                    igst = excluded.igst,
                    cgst = excluded.cgst,
                    sgst = excluded.sgst,
                    cess = excluded.cess,
                    total_val = excluded.total_val,
                    source_period = excluded.source_period,
                    filing_date = excluded.filing_date
            `);

            for (const inv of invoices) {
                if (txError) break;
                const rawSec = (inv.section || 'B2B').toUpperCase();
                const normSec = rawSec.includes('CDNRA') ? 'CDNRA'
                    : rawSec.includes('CDNR') ? 'CDNR'
                    : rawSec.includes('B2BA') ? 'B2BA'
                    : rawSec.includes('B2B') ? 'B2B'
                    : rawSec;
                let normDate = String(inv.idt || '').trim().replace(/\//g, '-');
                const isoMatch = normDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
                if (isoMatch) {
                    normDate = `${isoMatch[3]}-${isoMatch[2]}-${isoMatch[1]}`;
                }
                const normInum = String(inv.inum || '').trim().toUpperCase();
                const normCtin = String(inv.ctin || '').trim().toUpperCase();
                const rowPeriod = (inv.return_period && String(inv.return_period).trim().length >= 4)
                    ? String(inv.return_period).trim()
                    : returnPeriod;
                const invKey = `${(clientGstin || '').trim()}|${rowPeriod}|${normSec}|${normCtin}|${normInum}|${normDate}`.toUpperCase();
                const id = inv.id || createHash('md5').update(invKey).digest('hex');

                if (rowPeriod) affectedPeriods.add(rowPeriod);

                stmt.run([
                    id, 'BATCH', clientGstin, rowPeriod, normSec,
                    normCtin, inv.supplier_name || null, normInum, normDate, inv.inv_typ || 'Regular',
                    inv.pos || null, inv.rchrg || 'N', inv.itc_available || 'Y', inv.itc_reason || null,
                    inv.txval || 0, inv.igst || 0, inv.cgst || 0, inv.sgst || 0, inv.cess || 0,
                    inv.total_val || 0, inv.source_period || null, inv.filing_date || null, now
                ], (runErr) => {
                    if (runErr && !txError) txError = runErr;
                });
            }

            stmt.finalize();

            db.run('COMMIT', async (commitErr) => {
                if (txError || commitErr) {
                    const errToReport = txError || commitErr;
                    console.error('[GSTR-2B DB] Error during bulk insert, rolling back:', errToReport.message);
                    db.run('ROLLBACK', () => reject(errToReport));
                    return;
                }

                try {
                    let lastMetrics = null;
                    for (const p of affectedPeriods) {
                        try {
                            const m = await recalculate2bBatchMetrics(db, clientGstin, p);
                            if (p === returnPeriod || !lastMetrics) lastMetrics = m;
                            if (excelPath || jsonPath) {
                                db.run(
                                    `UPDATE gstr2b_batches SET excel_path = COALESCE(?, excel_path), json_path = COALESCE(?, json_path) WHERE client_gstin = ? AND return_period = ?`,
                                    [excelPath, jsonPath, clientGstin, p]
                                );
                            }
                        } catch (e) {}
                    }

                    resolve({ count: invoices.length, metrics: lastMetrics, ...lastMetrics });
                } catch (mErr) {
                    resolve({ count: invoices.length });
                }
            });
        });
    });
}

// ─── 4. PERSIST GSTR-1 SUMMARY IN SQLITE ────────────────────────────────────
export function saveGstr1Summary(db, clientGstin, returnPeriod, summary) {
    return new Promise((resolve) => {
        if (!summary || !clientGstin || !returnPeriod) return resolve();
        try {
            const jsonStr = JSON.stringify(summary);
            const taxable = summary.totalOutwardTaxable || 0;
            const tax = summary.totalOutwardTax || 0;
            const now = Date.now();
            db.run(
                `INSERT INTO gstr1_summaries (client_gstin, return_period, raw_summary, total_taxable, total_tax, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON CONFLICT(client_gstin, return_period) DO UPDATE SET
                    raw_summary = excluded.raw_summary,
                    total_taxable = excluded.total_taxable,
                    total_tax = excluded.total_tax,
                    updated_at = excluded.updated_at`,
                [clientGstin, returnPeriod, jsonStr, taxable, tax, now],
                () => resolve()
            );
        } catch (e) {
            resolve();
        }
    });
}

// ─── 5. EXPLICIT NIL RETURN RECORDING (GOLDEN RULE ZERO-DATA-LOSS) ───────────
/**
 * markGstr2bMonthNilSynced — Explicitly records a confirmed Nil return
 * without deleting or modifying any existing invoice data (Golden Rule D-03, D-04).
 */
export function markGstr2bMonthNilSynced(db, clientGstin, returnPeriod, excelPath = null, jsonPath = null) {
    return new Promise((resolve, reject) => {
        if (!clientGstin || !returnPeriod) return resolve({ success: false });
        const now = Date.now();
        const batchId = randomUUID();

        const query = `
            INSERT INTO gstr2b_batches (
                id, client_gstin, return_period, status,
                total_invoices, b2b_count, b2ba_count, cdnr_count, cdnra_count, isd_count, impg_count,
                eligible_itc_igst, eligible_itc_cgst, eligible_itc_sgst, eligible_itc_cess, eligible_itc_total,
                rcm_igst, rcm_cgst, rcm_sgst, rcm_total,
                cdnr_igst, cdnr_cgst, cdnr_sgst, cdnr_total,
                impg_igst, isd_total, ineligible_itc_total,
                excel_path, json_path, downloaded_at, created_at, updated_at
            ) VALUES (?, ?, ?, 'NIL_SYNCED', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ?, ?, ?, ?, ?)
            ON CONFLICT(client_gstin, return_period) DO UPDATE SET
                status = 'NIL_SYNCED',
                total_invoices = 0,
                b2b_count = 0,
                b2ba_count = 0,
                cdnr_count = 0,
                cdnra_count = 0,
                isd_count = 0,
                impg_count = 0,
                eligible_itc_igst = 0,
                eligible_itc_cgst = 0,
                eligible_itc_sgst = 0,
                eligible_itc_cess = 0,
                eligible_itc_total = 0,
                rcm_igst = 0,
                rcm_cgst = 0,
                rcm_sgst = 0,
                rcm_total = 0,
                cdnr_igst = 0,
                cdnr_cgst = 0,
                cdnr_sgst = 0,
                cdnr_total = 0,
                impg_igst = 0,
                isd_total = 0,
                ineligible_itc_total = 0,
                excel_path = COALESCE(excluded.excel_path, gstr2b_batches.excel_path),
                json_path = COALESCE(excluded.json_path, gstr2b_batches.json_path),
                downloaded_at = COALESCE(gstr2b_batches.downloaded_at, excluded.downloaded_at),
                updated_at = excluded.updated_at
        `;

        db.run(query, [batchId, clientGstin.toUpperCase(), returnPeriod, excelPath, jsonPath, now, now, now], (err) => {
            if (err) return reject(err);
            resolve({ success: true, status: 'NIL_SYNCED', totalInvoices: 0 });
        });
    });
}

// ─── 6. GSTR-3B INWARD ITC ALLOCATIONS & AUDIT TRACK RECORD ─────────────────

function emptyCategorySummary() {
    return { count: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, total: 0 };
}

function addToCategory(cat, inv) {
    cat.count += 1;
    cat.taxable += (inv.txval || 0);
    cat.igst += (inv.igst || 0);
    cat.cgst += (inv.cgst || 0);
    cat.sgst += (inv.sgst || 0);
    cat.cess += (inv.cess || 0);
    cat.total += (inv.totalTax || inv.total_tax || 0);
}

function roundCategory(cat) {
    cat.taxable = Math.round((cat.taxable + Number.EPSILON) * 100) / 100;
    cat.igst = Math.round((cat.igst + Number.EPSILON) * 100) / 100;
    cat.cgst = Math.round((cat.cgst + Number.EPSILON) * 100) / 100;
    cat.sgst = Math.round((cat.sgst + Number.EPSILON) * 100) / 100;
    cat.cess = Math.round((cat.cess + Number.EPSILON) * 100) / 100;
    cat.total = Math.round((cat.total + Number.EPSILON) * 100) / 100;
}

export function getInvoicesWithAllocations(db, clientGstin, returnPeriod) {
    return new Promise((resolve, reject) => {
        if (!clientGstin || !returnPeriod) {
            return reject(new Error('clientGstin and returnPeriod are required'));
        }

        // Self-healing: Ensure allocations table exists
        db.run(`CREATE TABLE IF NOT EXISTS gstr3b_itc_allocations (
            id TEXT PRIMARY KEY,
            client_gstin TEXT NOT NULL,
            return_period TEXT NOT NULL,
            invoice_id TEXT NOT NULL,
            target_table TEXT NOT NULL,
            notes TEXT,
            allocated_by TEXT DEFAULT 'User',
            created_at INTEGER,
            updated_at INTEGER,
            UNIQUE(client_gstin, return_period, invoice_id)
        )`, () => {
            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
            let mName = returnPeriod.match(/[a-zA-Z]+/)?.[0] || '';
            let yMatch = returnPeriod.match(/\d{4}/)?.[0] || '';
            if (!mName && /^\d{6}$/.test(returnPeriod)) {
                const mIdx = parseInt(returnPeriod.substring(0, 2), 10) - 1;
                mName = monthNames[mIdx] || '';
                yMatch = returnPeriod.substring(2);
            }

            let wherePeriod = `(i.return_period = ? OR i.return_period LIKE ? OR i.return_period LIKE ?)`;
            let params = [
                clientGstin.toUpperCase(),
                returnPeriod,
                `%${mName || returnPeriod}%`,
                `%${returnPeriod.replace(',', '')}%`
            ];

            if (mName && yMatch) {
                wherePeriod = `(i.return_period = ? OR (i.return_period LIKE ? AND i.return_period LIKE ?) OR i.return_period LIKE ?)`;
                params = [
                    clientGstin.toUpperCase(),
                    returnPeriod,
                    `%${mName}%`,
                    `%${yMatch}%`,
                    `%${returnPeriod.replace(',', '')}%`
                ];
            }

            const query = `
            SELECT 
                i.id,
                i.batch_id,
                i.client_gstin,
                i.return_period,
                i.section,
                i.ctin,
                COALESCE(i.supplier_name, i.ctin) as supplier_name,
                i.inum,
                i.idt,
                COALESCE(i.inv_typ, 'Regular') as inv_typ,
                i.pos,
                COALESCE(i.rchrg, 'N') as rchrg,
                COALESCE(i.itc_available, 'Y') as itc_available,
                i.itc_reason,
                COALESCE(i.txval, 0) as txval,
                COALESCE(i.igst, 0) as igst,
                COALESCE(i.cgst, 0) as cgst,
                COALESCE(i.sgst, 0) as sgst,
                COALESCE(i.cess, 0) as cess,
                COALESCE(i.total_val, 0) as total_val,
                (COALESCE(i.igst, 0) + COALESCE(i.cgst, 0) + COALESCE(i.sgst, 0) + COALESCE(i.cess, 0)) as total_tax,
                COALESCE(a.target_table, 
                    CASE 
                        WHEN UPPER(i.rchrg) = 'Y' THEN '4A3'
                        WHEN UPPER(i.inv_typ) LIKE '%CBW%' OR UPPER(i.section) LIKE '%IMPG%' THEN '4A1'
                        WHEN UPPER(i.itc_available) = 'N' THEN '4D1'
                        ELSE '4A5'
                    END
                ) as target_table,
                a.notes,
                a.allocated_by,
                a.updated_at as allocated_at
            FROM gstr2b_invoices i
            LEFT JOIN gstr3b_itc_allocations a 
                ON UPPER(a.client_gstin) = UPPER(i.client_gstin) 
                AND a.invoice_id = i.id
            WHERE UPPER(i.client_gstin) = ? AND ${wherePeriod}
            ORDER BY 
                CASE 
                    WHEN UPPER(i.section) LIKE '%B2B%' THEN 1 
                    WHEN UPPER(i.section) LIKE '%CDNR%' THEN 2 
                    ELSE 3 
                END,
                i.idt DESC, i.inum ASC
        `;

        db.all(query, params, (err, rows) => {
            if (err) return reject(err);

            const summary = {
                totalInvoices: 0,
                totalTaxable: 0,
                totalTax: 0,
                eligible_4a5: emptyCategorySummary(),
                temporary_4b2: emptyCategorySummary(),
                permanent_4b1: emptyCategorySummary(),
                ineligible_4d1: emptyCategorySummary(),
                ineligible_4d2: emptyCategorySummary(),
                rcm_4a3: emptyCategorySummary(),
                import_4a1: emptyCategorySummary(),
                deferred: emptyCategorySummary()
            };

            const invoices = (rows || []).map(r => {
                const inv = {
                    id: r.id,
                    batchId: r.batch_id,
                    clientGstin: r.client_gstin,
                    returnPeriod: r.return_period,
                    section: r.section,
                    ctin: r.ctin,
                    supplierName: r.supplier_name,
                    invoiceNo: r.inum,
                    invoiceDate: r.idt,
                    invoiceType: r.inv_typ,
                    pos: r.pos,
                    reverseCharge: r.rchrg,
                    itcAvailable: r.itc_available,
                    itcReason: r.itc_reason,
                    txval: Math.round(((parseFloat(r.txval) || 0) + Number.EPSILON) * 100) / 100,
                    igst: Math.round(((parseFloat(r.igst) || 0) + Number.EPSILON) * 100) / 100,
                    cgst: Math.round(((parseFloat(r.cgst) || 0) + Number.EPSILON) * 100) / 100,
                    sgst: Math.round(((parseFloat(r.sgst) || 0) + Number.EPSILON) * 100) / 100,
                    cess: Math.round(((parseFloat(r.cess) || 0) + Number.EPSILON) * 100) / 100,
                    totalVal: Math.round(((parseFloat(r.total_val) || 0) + Number.EPSILON) * 100) / 100,
                    totalTax: Math.round(((parseFloat(r.total_tax) || 0) + Number.EPSILON) * 100) / 100,
                    targetTable: r.target_table || '4A5',
                    notes: r.notes || '',
                    allocatedBy: r.allocated_by || 'User',
                    allocatedAt: r.allocated_at || null
                };

                summary.totalInvoices += 1;
                summary.totalTaxable += inv.txval;
                summary.totalTax += inv.totalTax;

                switch (inv.targetTable) {
                    case '4A5':
                        addToCategory(summary.eligible_4a5, inv);
                        break;
                    case '4B2':
                        addToCategory(summary.temporary_4b2, inv);
                        break;
                    case '4B1':
                        addToCategory(summary.permanent_4b1, inv);
                        break;
                    case '4D1':
                        addToCategory(summary.ineligible_4d1, inv);
                        break;
                    case '4D2':
                        addToCategory(summary.ineligible_4d2, inv);
                        break;
                    case '4A3':
                        addToCategory(summary.rcm_4a3, inv);
                        break;
                    case '4A1':
                        addToCategory(summary.import_4a1, inv);
                        break;
                    case 'DEFERRED':
                        addToCategory(summary.deferred, inv);
                        break;
                    default:
                        addToCategory(summary.eligible_4a5, inv);
                        break;
                }

                return inv;
            });

            summary.totalTaxable = Math.round((summary.totalTaxable + Number.EPSILON) * 100) / 100;
            summary.totalTax = Math.round((summary.totalTax + Number.EPSILON) * 100) / 100;
            roundCategory(summary.eligible_4a5);
            roundCategory(summary.temporary_4b2);
            roundCategory(summary.permanent_4b1);
            roundCategory(summary.ineligible_4d1);
            roundCategory(summary.ineligible_4d2);
            roundCategory(summary.rcm_4a3);
            roundCategory(summary.import_4a1);
            roundCategory(summary.deferred);

            resolve({
                clientGstin: clientGstin.toUpperCase(),
                returnPeriod,
                summary,
                invoices
            });
        });
        });
    });
}

export function bulkSaveItcAllocations(db, clientGstin, returnPeriod, allocations) {
    return new Promise((resolve, reject) => {
        if (!clientGstin || !returnPeriod || !Array.isArray(allocations)) {
            return reject(new Error('Invalid arguments for bulkSaveItcAllocations'));
        }

        if (allocations.length === 0) {
            return resolve({ success: true, updatedCount: 0 });
        }

        const now = Date.now();
        db.serialize(() => {
            db.run('BEGIN TRANSACTION');

            const stmt = db.prepare(`
                INSERT INTO gstr3b_itc_allocations (
                    id, client_gstin, return_period, invoice_id,
                    target_table, notes, allocated_by, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(client_gstin, return_period, invoice_id) DO UPDATE SET
                    target_table = excluded.target_table,
                    notes = excluded.notes,
                    allocated_by = excluded.allocated_by,
                    updated_at = excluded.updated_at
            `);

            for (const item of allocations) {
                const id = item.id || randomUUID();
                const invId = item.invoiceId || item.invoice_id || item.id;
                const target = item.targetTable || item.target_table || '4A5';
                const notes = item.notes || '';
                const user = item.allocatedBy || item.allocated_by || 'User';
                const retPeriod = item.returnPeriod || item.return_period || returnPeriod;

                stmt.run([
                    id,
                    clientGstin.toUpperCase(),
                    retPeriod,
                    invId,
                    target,
                    notes,
                    user,
                    now,
                    now
                ]);
            }

            stmt.finalize();

            db.run('COMMIT', (err) => {
                if (err) {
                    db.run('ROLLBACK');
                    return reject(err);
                }
                resolve({ success: true, updatedCount: allocations.length });
            });
        });
    });
}
