import { randomUUID } from 'crypto';

// ─── 1. DATABASE SCHEMA INITIALIZATION ──────────────────────────────────────
export function initGstr1Database(db) {
    db.serialize(() => {
        // Table 1: GSTR-1 Batches per client & return period
        db.run(`CREATE TABLE IF NOT EXISTS gstr1_batches (
            id TEXT PRIMARY KEY,
            client_gstin TEXT NOT NULL,
            return_period TEXT NOT NULL,
            status TEXT DEFAULT 'PENDING',
            total_invoices INTEGER DEFAULT 0,
            b2b_count INTEGER DEFAULT 0,
            b2cl_count INTEGER DEFAULT 0,
            b2cs_count INTEGER DEFAULT 0,
            cdnr_count INTEGER DEFAULT 0,
            exp_count INTEGER DEFAULT 0,
            total_taxable REAL DEFAULT 0,
            total_igst REAL DEFAULT 0,
            total_cgst REAL DEFAULT 0,
            total_sgst REAL DEFAULT 0,
            total_cess REAL DEFAULT 0,
            total_tax REAL DEFAULT 0,
            excel_path TEXT,
            json_path TEXT,
            downloaded_at INTEGER,
            requested_at INTEGER,
            created_at INTEGER,
            updated_at INTEGER,
            UNIQUE(client_gstin, return_period)
        )`);

        db.run(`ALTER TABLE gstr1_batches ADD COLUMN requested_at INTEGER`, () => {});

        // Table 2: Line-item invoices from GSTR-1 (Outward Supplies)
        db.run(`CREATE TABLE IF NOT EXISTS gstr1_invoices (
            id TEXT PRIMARY KEY,
            batch_id TEXT,
            client_gstin TEXT NOT NULL,
            return_period TEXT NOT NULL,
            section TEXT DEFAULT 'B2B',
            ctin TEXT NOT NULL,
            cname TEXT,
            inum TEXT NOT NULL,
            idt TEXT NOT NULL,
            inv_typ TEXT DEFAULT 'Regular',
            pos TEXT,
            rchrg TEXT DEFAULT 'N',
            rt REAL DEFAULT 0,
            txval REAL DEFAULT 0,
            iamt REAL DEFAULT 0,
            camt REAL DEFAULT 0,
            samt REAL DEFAULT 0,
            csamt REAL DEFAULT 0,
            val REAL DEFAULT 0,
            created_at INTEGER,
            UNIQUE(client_gstin, return_period, section, ctin, inum, idt)
        )`);

        // Table 3: GSTR-1 Raw Summaries per client & return period
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
        db.run(`CREATE INDEX IF NOT EXISTS idx_gstr1_batches_period ON gstr1_batches(return_period)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_gstr1_invoices_batch ON gstr1_invoices(batch_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_gstr1_invoices_client ON gstr1_invoices(client_gstin, return_period)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_gstr1_summaries_client ON gstr1_summaries(client_gstin, return_period)`);
    });
}

// ─── 2. BULK INGEST PARSED GSTR-1 INVOICES ──────────────────────────────────
export function bulkSaveGstr1Invoices(db, clientGstin, returnPeriod, invoices, excelPath = null, jsonPath = null) {
    return new Promise((resolve, reject) => {
        if (!invoices || invoices.length === 0) return resolve({ count: 0 });

        db.serialize(() => {
            db.run('BEGIN TRANSACTION');

            const stmt = db.prepare(`
                INSERT INTO gstr1_invoices (
                    id, batch_id, client_gstin, return_period, section,
                    ctin, cname, inum, idt, inv_typ,
                    pos, rchrg, rt, txval, iamt, camt, samt, csamt, val, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(client_gstin, return_period, section, ctin, inum, idt) DO UPDATE SET
                    cname = excluded.cname,
                    inv_typ = excluded.inv_typ,
                    pos = excluded.pos,
                    rchrg = excluded.rchrg,
                    rt = excluded.rt,
                    txval = excluded.txval,
                    iamt = excluded.iamt,
                    camt = excluded.camt,
                    samt = excluded.samt,
                    csamt = excluded.csamt,
                    val = excluded.val
            `);

            const now = Date.now();
            const affectedPeriods = new Set();
            if (returnPeriod) affectedPeriods.add(returnPeriod);

            for (const inv of invoices) {
                const id = randomUUID();
                const sec = (inv.section || 'B2B').toUpperCase();
                const period = inv.return_period || returnPeriod;
                affectedPeriods.add(period);

                stmt.run([
                    id,
                    null,
                    clientGstin.toUpperCase(),
                    period,
                    sec,
                    (inv.ctin || 'B2CS').toUpperCase(),
                    inv.cname || '',
                    inv.inum || 'N/A',
                    inv.idt || '',
                    inv.inv_typ || 'Regular',
                    inv.pos || '',
                    inv.rchrg || 'N',
                    Number(inv.rt) || 0,
                    Number(inv.txval) || 0,
                    Number(inv.iamt) || 0,
                    Number(inv.camt) || 0,
                    Number(inv.samt) || 0,
                    Number(inv.csamt) || 0,
                    Number(inv.val) || 0,
                    now
                ]);
            }

            stmt.finalize((err) => {
                if (err) {
                    db.run('ROLLBACK');
                    return reject(err);
                }
                db.run('COMMIT');

                // Recalculate metrics per affected period
                for (const p of affectedPeriods) {
                    recalculateGstr1Batch(db, clientGstin.toUpperCase(), p, excelPath, jsonPath);
                }

                resolve({ count: invoices.length });
            });
        });
    });
}

// ─── 3. RECALCULATE BATCH TOTALS ────────────────────────────────────────────
function recalculateGstr1Batch(db, clientGstin, returnPeriod, excelPath = null, jsonPath = null) {
    db.all(
        `SELECT section,
                COUNT(*) as count,
                SUM(txval) as tot_txval,
                SUM(iamt) as tot_iamt,
                SUM(camt) as tot_camt,
                SUM(samt) as tot_samt,
                SUM(csamt) as tot_csamt
         FROM gstr1_invoices
         WHERE client_gstin = ? AND return_period = ?
         GROUP BY section`,
        [clientGstin, returnPeriod],
        (err, rows) => {
            if (err || !rows) return;

            let b2bCount = 0, b2clCount = 0, b2csCount = 0, cdnrCount = 0, expCount = 0;
            let totalTxval = 0, totalIgst = 0, totalCgst = 0, totalSgst = 0, totalCess = 0;
            let totalInvs = 0;

            for (const r of rows) {
                const sec = (r.section || '').toUpperCase();
                const cnt = r.count || 0;
                const tx = r.tot_txval || 0;
                const ig = r.tot_iamt || 0;
                const cg = r.tot_camt || 0;
                const sg = r.tot_samt || 0;
                const cs = r.tot_csamt || 0;

                totalInvs += cnt;
                totalTxval += tx;
                totalIgst += ig;
                totalCgst += cg;
                totalSgst += sg;
                totalCess += cs;

                if (sec === 'B2B') b2bCount = cnt;
                else if (sec === 'B2CL') b2clCount = cnt;
                else if (sec === 'B2CS') b2csCount = cnt;
                else if (sec === 'CDNR') cdnrCount = cnt;
                else if (sec === 'EXP') expCount = cnt;
            }

            const totalTax = totalIgst + totalCgst + totalSgst + totalCess;
            const now = Date.now();
            const batchId = randomUUID();

            db.run(
                `INSERT INTO gstr1_batches (
                    id, client_gstin, return_period, status,
                    total_invoices, b2b_count, b2cl_count, b2cs_count, cdnr_count, exp_count,
                    total_taxable, total_igst, total_cgst, total_sgst, total_cess, total_tax,
                    excel_path, json_path, downloaded_at, created_at, updated_at
                ) VALUES (?, ?, ?, 'SYNCED', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(client_gstin, return_period) DO UPDATE SET
                    status = 'SYNCED',
                    total_invoices = excluded.total_invoices,
                    b2b_count = excluded.b2b_count,
                    b2cl_count = excluded.b2cl_count,
                    b2cs_count = excluded.b2cs_count,
                    cdnr_count = excluded.cdnr_count,
                    exp_count = excluded.exp_count,
                    total_taxable = excluded.total_taxable,
                    total_igst = excluded.total_igst,
                    total_cgst = excluded.total_cgst,
                    total_sgst = excluded.total_sgst,
                    total_cess = excluded.total_cess,
                    total_tax = excluded.total_tax,
                    excel_path = COALESCE(excluded.excel_path, gstr1_batches.excel_path),
                    json_path = COALESCE(excluded.json_path, gstr1_batches.json_path),
                    downloaded_at = excluded.downloaded_at,
                    updated_at = excluded.updated_at`,
                [
                    batchId, clientGstin, returnPeriod,
                    totalInvs, b2bCount, b2clCount, b2csCount, cdnrCount, expCount,
                    totalTxval, totalIgst, totalCgst, totalSgst, totalCess, totalTax,
                    excelPath, jsonPath, now, now, now
                ]
            );
        }
    );
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
                [clientGstin.toUpperCase(), returnPeriod, jsonStr, taxable, tax, now],
                () => resolve()
            );
        } catch (e) {
            resolve();
        }
    });
}

// ─── 5. MARK MONTH GENERATION AS REQUESTED (20-MIN TIMER) ───────────────────
export function markGstr1MonthRequested(db, clientGstin, returnPeriod) {
    return new Promise((resolve) => {
        if (!clientGstin || !returnPeriod) return resolve(false);
        const id = randomUUID();
        const now = Date.now();
        db.run(
            `INSERT INTO gstr1_batches (id, client_gstin, return_period, status, requested_at, created_at, updated_at)
             VALUES (?, ?, ?, 'REQUESTED', ?, ?, ?)
             ON CONFLICT(client_gstin, return_period) DO UPDATE SET
                status = CASE WHEN gstr1_batches.status = 'SYNCED' THEN 'SYNCED' ELSE 'REQUESTED' END,
                requested_at = excluded.requested_at,
                updated_at = excluded.updated_at`,
            [id, clientGstin.toUpperCase(), returnPeriod, now, now, now],
            (err) => resolve(!err)
        );
    });
}

// ─── 6. MARK MONTH AS SYNCED FOR EMPTY / NIL RETURNS ─────────────────────────
export function markGstr1MonthSyncedEmpty(db, clientGstin, returnPeriod, excelPath = null, jsonPath = null) {
    return new Promise((resolve) => {
        if (!clientGstin || !returnPeriod) return resolve(false);
        const id = randomUUID();
        const now = Date.now();
        db.run(
            `INSERT INTO gstr1_batches (
                id, client_gstin, return_period, status,
                total_invoices, b2b_count, b2cl_count, b2cs_count, cdnr_count, exp_count,
                total_taxable, total_igst, total_cgst, total_sgst, total_cess, total_tax,
                excel_path, json_path, downloaded_at, created_at, updated_at
            ) VALUES (?, ?, ?, 'SYNCED', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ?, ?, ?, ?, ?)
            ON CONFLICT(client_gstin, return_period) DO UPDATE SET
                status = 'SYNCED',
                total_invoices = 0,
                excel_path = COALESCE(excluded.excel_path, gstr1_batches.excel_path),
                json_path = COALESCE(excluded.json_path, gstr1_batches.json_path),
                downloaded_at = excluded.downloaded_at,
                updated_at = excluded.updated_at`,
            [id, clientGstin.toUpperCase(), returnPeriod, excelPath, jsonPath, now, now, now],
            (err) => resolve(!err)
        );
    });
}


