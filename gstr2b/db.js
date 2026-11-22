import { randomUUID, createHash } from 'crypto';

// ─── CANONICAL RETURN PERIOD HELPERS (D-11 / G2B-BP-08, D-10 / G2B-BP-07) ──
export const CANONICAL_MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * normalizeReturnPeriod: Converts all GST period variants ("042025", "04-2025", "04/2025",
 * "2025-04", "April, 2025", "Apr 2025", "Apr-25", or invoice idt fallback) into canonical
 * "Month YYYY" (e.g. "April 2025").
 */
export function normalizeReturnPeriod(periodStr, idtFallback = '') {
    const raw = String(periodStr || '').trim();

    // 1. "042025" -> MMYYYY (6 digits)
    const m6 = raw.match(/^(\d{2})(\d{4})$/);
    if (m6) {
        const mm = parseInt(m6[1], 10);
        const yyyy = m6[2];
        if (mm >= 1 && mm <= 12) {
            return `${CANONICAL_MONTH_NAMES[mm - 1]} ${yyyy}`;
        }
    }

    // 2. "04-2025" or "04/2025" or "4-2025"
    const mSep = raw.match(/^(\d{1,2})[-/](\d{4})$/);
    if (mSep) {
        const mm = parseInt(mSep[1], 10);
        const yyyy = mSep[2];
        if (mm >= 1 && mm <= 12) {
            return `${CANONICAL_MONTH_NAMES[mm - 1]} ${yyyy}`;
        }
    }

    // 3. "2025-04" or "2025/04" or "2025-4"
    const mIso = raw.match(/^(\d{4})[-/](\d{1,2})$/);
    if (mIso) {
        const yyyy = mIso[1];
        const mm = parseInt(mIso[2], 10);
        if (mm >= 1 && mm <= 12) {
            return `${CANONICAL_MONTH_NAMES[mm - 1]} ${yyyy}`;
        }
    }

    // 4. "April, 2025", "Apr 2025", "APR-2025", "april   2025"
    const mWord = raw.match(/^([a-zA-Z]+)[\s,.-]+(\d{4})$/);
    if (mWord) {
        const prefix = mWord[1].substring(0, 3).toLowerCase();
        const yyyy = mWord[2];
        const idx = CANONICAL_MONTH_NAMES.findIndex(m => m.toLowerCase().startsWith(prefix));
        if (idx !== -1) {
            return `${CANONICAL_MONTH_NAMES[idx]} ${yyyy}`;
        }
    }

    // 5. "Apr-25", "April-25", "Apr 25" (2-digit year)
    const mShortYear = raw.match(/^([a-zA-Z]{3,9})[-/\s]+(\d{2})$/);
    if (mShortYear) {
        const prefix = mShortYear[1].substring(0, 3).toLowerCase();
        const yy = parseInt(mShortYear[2], 10);
        const yyyy = 2000 + yy;
        const idx = CANONICAL_MONTH_NAMES.findIndex(m => m.toLowerCase().startsWith(prefix));
        if (idx !== -1) {
            return `${CANONICAL_MONTH_NAMES[idx]} ${yyyy}`;
        }
    }

    // 6. When periodStr fails to match, inspect idtFallback
    if (idtFallback) {
        const rawIdt = String(idtFallback).trim();
        const dmy = rawIdt.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
        if (dmy) {
            const mm = parseInt(dmy[2], 10);
            const yyyy = dmy[3];
            if (mm >= 1 && mm <= 12) {
                return `${CANONICAL_MONTH_NAMES[mm - 1]} ${yyyy}`;
            }
        }
        const ymd = rawIdt.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
        if (ymd) {
            const yyyy = ymd[1];
            const mm = parseInt(ymd[2], 10);
            if (mm >= 1 && mm <= 12) {
                return `${CANONICAL_MONTH_NAMES[mm - 1]} ${yyyy}`;
            }
        }
    }

    // 7. Fallback: clean multiple spaces and commas
    if (!raw) return '';
    return raw.replace(/,/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * buildStrictPeriodFilter: Generates exact deduplicated period candidates with ZERO %Month% LIKE wildcards.
 * Returns { canonical, clause: 'return_period IN (?, ?, ...)', params: [...] }
 */
export function buildStrictPeriodFilter(period) {
    const canonical = normalizeReturnPeriod(period);
    const m = canonical.match(/^([A-Za-z]+)\s+(\d{4})$/);

    if (m) {
        const mName = m[1];
        const yMatch = m[2];
        const mIdx = CANONICAL_MONTH_NAMES.findIndex(name => name.toLowerCase() === mName.toLowerCase());
        if (mIdx !== -1) {
            const fullMonth = CANONICAL_MONTH_NAMES[mIdx];
            const shortMonth = fullMonth.substring(0, 3);
            const mNum = String(mIdx + 1).padStart(2, '0');

            const candidates = [
                canonical,
                `${fullMonth}, ${yMatch}`,
                `${mNum}${yMatch}`,
                `${mNum}-${yMatch}`,
                `${mNum}/${yMatch}`,
                `${yMatch}-${mNum}`,
                `${shortMonth} ${yMatch}`,
                `${shortMonth}-${yMatch}`,
                String(period || '').trim()
            ];

            const unique = Array.from(new Set(candidates.filter(Boolean)));
            return {
                canonical,
                clause: `return_period IN (${unique.map(() => '?').join(', ')})`,
                params: unique
            };
        }
    }

    const raw = String(period || '').trim();
    const clean = raw.replace(/,/g, '').replace(/\s+/g, ' ').trim();
    const unique = Array.from(new Set([raw, clean].filter(Boolean)));
    return {
        canonical: clean || raw,
        clause: `return_period IN (${unique.map(() => '?').join(', ')})`,
        params: unique
    };
}

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
            requested_at INTEGER,
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

        // Table 5: Tally 2B Posted Invoices & Audit Ledger
        db.run(`CREATE TABLE IF NOT EXISTS tally_2b_posted_entries (
            id TEXT PRIMARY KEY,
            client_gstin TEXT NOT NULL,
            financial_year TEXT NOT NULL,
            return_period TEXT NOT NULL,
            section TEXT DEFAULT 'B2B',
            supplier_gstin TEXT NOT NULL,
            supplier_name TEXT,
            invoice_number TEXT NOT NULL,
            invoice_date TEXT NOT NULL,
            taxable_value REAL DEFAULT 0,
            igst REAL DEFAULT 0,
            cgst REAL DEFAULT 0,
            sgst REAL DEFAULT 0,
            cess REAL DEFAULT 0,
            total_value REAL DEFAULT 0,
            voucher_type TEXT DEFAULT 'Purchase',
            tally_voucher_no TEXT,
            status TEXT DEFAULT 'POSTED',
            tally_company TEXT,
            posted_at INTEGER NOT NULL,
            UNIQUE(client_gstin, supplier_gstin, invoice_number, invoice_date)
        )`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_tally_2b_posted_client ON tally_2b_posted_entries(client_gstin, return_period)`);

        // Table 6: Tally 2B Rejections & Failure Audit Log
        db.run(`CREATE TABLE IF NOT EXISTS tally_2b_rejections (
            id TEXT PRIMARY KEY,
            client_gstin TEXT NOT NULL,
            financial_year TEXT NOT NULL,
            return_period TEXT NOT NULL,
            section TEXT DEFAULT 'B2B',
            supplier_gstin TEXT NOT NULL,
            supplier_name TEXT,
            invoice_number TEXT NOT NULL,
            invoice_date TEXT NOT NULL,
            taxable_value REAL DEFAULT 0,
            total_value REAL DEFAULT 0,
            voucher_type TEXT DEFAULT 'Purchase',
            rejection_reason TEXT NOT NULL,
            tally_company TEXT,
            rejected_at INTEGER NOT NULL
        )`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_tally_2b_rejections_client ON tally_2b_rejections(client_gstin, financial_year)`);

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

        // Phase 36 Bulletproof Telemetry & Checksum Verification Migrations
        addCol("verify_status TEXT DEFAULT 'UNVERIFIED'");
        addCol("verify_warning TEXT");
        addCol("portal_summary_json TEXT");
        addCol("verify_diff_json TEXT");
        addCol("last_error TEXT");
        addCol("job_id TEXT");
        addCol("impgsez_count INTEGER DEFAULT 0");
        addCol("eco_count INTEGER DEFAULT 0");
    });
}

// ─── 2. RECALCULATE BATCH METRICS & UPSERT BATCH ────────────────────────────
export function recalculate2bBatchMetrics(db, clientGstin, returnPeriod) {
    return new Promise((resolve, reject) => {
        const normGstin = String(clientGstin || '').trim().toUpperCase();
        const normPeriod = normalizeReturnPeriod(returnPeriod) || String(returnPeriod || '').trim();
        const pf = buildStrictPeriodFilter(normPeriod);

        const query = `
            SELECT 
                COUNT(*) as total_invoices,
                SUM(CASE WHEN UPPER(section) LIKE '%B2B%' AND UPPER(section) NOT LIKE '%REJECTED%' THEN 1 ELSE 0 END) as b2b_count,
                SUM(CASE WHEN UPPER(section) LIKE '%B2BA%' THEN 1 ELSE 0 END) as b2ba_count,
                SUM(CASE WHEN UPPER(section) LIKE '%CDNR%' AND UPPER(section) NOT LIKE '%REJECTED%' THEN 1 ELSE 0 END) as cdnr_count,
                SUM(CASE WHEN UPPER(section) LIKE '%CDNRA%' THEN 1 ELSE 0 END) as cdnra_count,
                SUM(CASE WHEN UPPER(section) LIKE '%ISD%' THEN 1 ELSE 0 END) as isd_count,
                SUM(CASE WHEN (UPPER(section) LIKE '%IMPGSEZ%' OR UPPER(section) LIKE '%IMPG-SEZ%') THEN 1 ELSE 0 END) as impgsez_count,
                SUM(CASE WHEN UPPER(section) LIKE '%ECO%' THEN 1 ELSE 0 END) as eco_count,
                SUM(CASE WHEN UPPER(section) LIKE '%IMPG%' AND UPPER(section) NOT LIKE '%SEZ%' THEN 1 ELSE 0 END) as impg_count,
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
            WHERE UPPER(TRIM(client_gstin)) = ? AND (${pf.clause})
        `;

        db.get(query, [normGstin, ...pf.params], (err, row) => {
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

            db.get(`SELECT status FROM gstr2b_batches WHERE UPPER(TRIM(client_gstin)) = ? AND return_period = ?`, [normGstin, normPeriod], (bErr, existingBatch) => {
                if (bErr) return reject(bErr);

                let targetStatus = 'SYNCED';
                if (totalInvs === 0) {
                    targetStatus = (existingBatch && existingBatch.status === 'NIL_SYNCED') ? 'NIL_SYNCED' : 'PENDING';
                }

                const upsertQuery = `
                    INSERT INTO gstr2b_batches (
                        id, client_gstin, return_period, status,
                        total_invoices, b2b_count, b2ba_count, cdnr_count, cdnra_count, isd_count, impg_count, impgsez_count, eco_count,
                        eligible_itc_igst, eligible_itc_cgst, eligible_itc_sgst, eligible_itc_cess,
                        eligible_itc_total, rcm_igst, rcm_cgst, rcm_sgst, rcm_total,
                        cdnr_igst, cdnr_cgst, cdnr_sgst, cdnr_total, impg_igst, isd_total,
                        ineligible_itc_total, eligible_itc_txval, rcm_txval, cdnr_txval,
                        ineligible_itc_txval, ineligible_itc_igst, ineligible_itc_cgst, ineligible_itc_sgst, ineligible_itc_cess,
                        downloaded_at, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(client_gstin, return_period) DO UPDATE SET
                        status = excluded.status,
                        total_invoices = excluded.total_invoices,
                        b2b_count = excluded.b2b_count,
                        b2ba_count = excluded.b2ba_count,
                        cdnr_count = excluded.cdnr_count,
                        cdnra_count = excluded.cdnra_count,
                        isd_count = excluded.isd_count,
                        impg_count = excluded.impg_count,
                        impgsez_count = excluded.impgsez_count,
                        eco_count = excluded.eco_count,
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
                        last_error = CASE WHEN excluded.status IN ('SYNCED', 'NIL_SYNCED') THEN NULL ELSE gstr2b_batches.last_error END,
                        updated_at = excluded.updated_at
                `;

                db.run(upsertQuery, [
                    batchId, normGstin, normPeriod, targetStatus,
                    totalInvs, row?.b2b_count || 0, row?.b2ba_count || 0, row?.cdnr_count || 0, row?.cdnra_count || 0,
                    row?.isd_count || 0, row?.impg_count || 0, row?.impgsez_count || 0, row?.eco_count || 0,
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
                        impgsez_count: row?.impgsez_count || 0,
                        impgsezCount: row?.impgsez_count || 0,
                        eco_count: row?.eco_count || 0,
                        ecoCount: row?.eco_count || 0,
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
export function bulkSaveGstr2bInvoices(db, clientGstin, returnPeriod, invoices, excelPath = null, jsonPath = null, options = {}) {
    return new Promise((resolve, reject) => {
        if (!invoices || invoices.length === 0) return resolve({ count: 0 });

        const normGstin = String(clientGstin || '').trim().toUpperCase();
        const normPeriod = normalizeReturnPeriod(returnPeriod) || String(returnPeriod || '').trim();

        db.serialize(() => {
            db.run('BEGIN TRANSACTION');

            const now = Date.now();
            const affectedPeriods = new Set();
            if (normPeriod) affectedPeriods.add(normPeriod);
            for (const inv of invoices) {
                const rowPeriod = (inv.return_period ? normalizeReturnPeriod(inv.return_period) : '') || normPeriod || normalizeReturnPeriod('', inv.idt);
                if (rowPeriod) affectedPeriods.add(rowPeriod);
            }

            let txError = null;
            // Clean out stale invoices and stale non-canonical alias batch rows for affected periods
            for (const p of affectedPeriods) {
                const pf = buildStrictPeriodFilter(p);
                db.run(`DELETE FROM gstr2b_invoices WHERE UPPER(TRIM(client_gstin)) = ? AND (${pf.clause})`, [normGstin, ...pf.params], (delErr) => {
                    if (delErr && !txError) txError = delErr;
                });
                db.run(`DELETE FROM gstr2b_batches WHERE UPPER(TRIM(client_gstin)) = ? AND (${pf.clause}) AND return_period != ?`, [normGstin, ...pf.params, p], (delBatchErr) => {
                    if (delBatchErr && !txError) txError = delBatchErr;
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
                    source_period = COALESCE(excluded.source_period, gstr2b_invoices.source_period),
                    filing_date = COALESCE(excluded.filing_date, gstr2b_invoices.filing_date)
            `);

            for (const inv of invoices) {
                if (txError) break;
                const rawSec = (inv.section || 'B2B').toUpperCase();
                const normSec = (rawSec.includes('CDNRA') || rawSec === 'CDNRA') ? 'CDNRA'
                    : (rawSec.includes('CDNR') || rawSec === 'CDNR') ? 'CDNR'
                    : (rawSec.includes('B2BA') || rawSec === 'B2BA') ? 'B2BA'
                    : (rawSec.includes('B2B') || rawSec === 'B2B') ? 'B2B'
                    : (rawSec.includes('IMPGSEZ') || rawSec.includes('IMPG-SEZ')) ? 'IMPGSEZ'
                    : (rawSec.includes('IMPG') || rawSec === 'IMPG') ? 'IMPG'
                    : (rawSec.includes('ISD') || rawSec === 'ISD') ? 'ISD'
                    : (rawSec.includes('ECO') || rawSec === 'ECO') ? 'ECO'
                    : rawSec;
                let normDate = String(inv.idt || '').trim().replace(/\//g, '-');
                const isoMatch = normDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
                if (isoMatch) {
                    normDate = `${isoMatch[3]}-${isoMatch[2]}-${isoMatch[1]}`;
                }
                const normInum = String(inv.inum || '').trim().toUpperCase();
                const normCtin = String(inv.ctin || '').trim().toUpperCase();
                const rowPeriod = (inv.return_period ? normalizeReturnPeriod(inv.return_period) : '') || normPeriod || normalizeReturnPeriod('', inv.idt);
                const invKey = `${normGstin}|${rowPeriod}|${normSec}|${normCtin}|${normInum}|${normDate}`.toUpperCase();
                const id = inv.id || createHash('md5').update(invKey).digest('hex');

                stmt.run([
                    id, 'BATCH', normGstin, rowPeriod, normSec,
                    normCtin, inv.supplier_name || null, normInum, normDate, inv.inv_typ || 'Regular',
                    inv.pos || null, inv.rchrg || 'N', inv.itc_available || 'Y', inv.itc_reason || null,
                    inv.txval || 0, inv.igst || 0, inv.cgst || 0, inv.sgst || 0, inv.cess || 0,
                    inv.total_val || 0, inv.source_period || null, inv.filing_date || null, now
                ], (runErr) => {
                    if (runErr && !txError) txError = runErr;
                });
            }

            stmt.finalize(() => {
                if (txError) {
                    console.error('[GSTR-2B DB] Error during bulk insert, rolling back:', txError.message);
                    db.run('ROLLBACK', () => reject(txError));
                    return;
                }

                db.run('COMMIT', async (commitErr) => {
                    if (commitErr) {
                        console.error('[GSTR-2B DB] Error committing transaction, rolling back:', commitErr.message);
                        db.run('ROLLBACK', () => reject(commitErr));
                        return;
                    }

                try {
                    let lastMetrics = null;
                    let lastVerifyStatus = 'UNVERIFIED';
                    let lastVerifyWarning = null;

                    for (const p of affectedPeriods) {
                        try {
                            const m = await recalculate2bBatchMetrics(db, normGstin, p);
                            if (p === normPeriod || !lastMetrics) lastMetrics = m;

                            if (excelPath || jsonPath) {
                                await new Promise((r) => {
                                    db.run(
                                        `UPDATE gstr2b_batches SET excel_path = COALESCE(?, excel_path), json_path = COALESCE(?, json_path) WHERE UPPER(TRIM(client_gstin)) = ? AND return_period = ?`,
                                        [excelPath, jsonPath, normGstin, p],
                                        () => r()
                                    );
                                });
                            }

                            if (options.portalSummary) {
                                const v = verifyGstr2bBatchChecksum(m, options.portalSummary);
                                lastVerifyStatus = v.verifyStatus;
                                lastVerifyWarning = v.verifyWarning;
                                await updateGstr2bBatchVerification(db, normGstin, p, {
                                    verifyStatus: v.verifyStatus,
                                    verifyWarning: v.verifyWarning,
                                    portalSummary: options.portalSummary,
                                    verifyDiff: v.verifyDiff,
                                    jobId: options.jobId
                                });
                            } else if (options.jobId) {
                                await updateGstr2bBatchVerification(db, normGstin, p, {
                                    jobId: options.jobId
                                });
                            }
                        } catch (e) {}
                    }

                    resolve({
                        count: invoices.length,
                        metrics: lastMetrics,
                        ...lastMetrics,
                        verifyStatus: lastVerifyStatus,
                        verifyWarning: lastVerifyWarning
                    });
                } catch (mErr) {
                    resolve({ count: invoices.length });
                }
            });
        });
    });
});
}

// ─── 4. PERSIST GSTR-1 SUMMARY IN SQLITE ────────────────────────────────────
export function saveGstr1Summary(db, clientGstin, returnPeriod, summary) {
    return new Promise((resolve) => {
        if (!summary || !clientGstin || !returnPeriod) return resolve();
        try {
            const normGstin = String(clientGstin).trim().toUpperCase();
            const normPeriod = normalizeReturnPeriod(returnPeriod) || String(returnPeriod).trim();
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
                [normGstin, normPeriod, jsonStr, taxable, tax, now],
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
        const normGstin = String(clientGstin).trim().toUpperCase();
        const normPeriod = normalizeReturnPeriod(returnPeriod) || String(returnPeriod).trim();
        const pf = buildStrictPeriodFilter(normPeriod);
        const now = Date.now();
        const batchId = randomUUID();

        // Remove stale non-canonical alias rows so legacy duplicate rows do not persist
        db.run(
            `DELETE FROM gstr2b_batches WHERE UPPER(TRIM(client_gstin)) = ? AND (${pf.clause}) AND return_period != ?`,
            [normGstin, ...pf.params, normPeriod],
            () => {}
        );

        const query = `
            INSERT INTO gstr2b_batches (
                id, client_gstin, return_period, status,
                total_invoices, b2b_count, b2ba_count, cdnr_count, cdnra_count, isd_count, impg_count, impgsez_count, eco_count,
                eligible_itc_igst, eligible_itc_cgst, eligible_itc_sgst, eligible_itc_cess, eligible_itc_total,
                rcm_igst, rcm_cgst, rcm_sgst, rcm_total,
                cdnr_igst, cdnr_cgst, cdnr_sgst, cdnr_total,
                impg_igst, isd_total, ineligible_itc_total,
                excel_path, json_path, downloaded_at, created_at, updated_at,
                verify_status, last_error
            ) VALUES (?, ?, ?, 'NIL_SYNCED', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ?, ?, ?, ?, ?, 'VERIFIED', NULL)
            ON CONFLICT(client_gstin, return_period) DO UPDATE SET
                status = 'NIL_SYNCED',
                total_invoices = 0,
                b2b_count = 0,
                b2ba_count = 0,
                cdnr_count = 0,
                cdnra_count = 0,
                isd_count = 0,
                impg_count = 0,
                impgsez_count = 0,
                eco_count = 0,
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
                verify_status = 'VERIFIED',
                last_error = NULL,
                updated_at = excluded.updated_at
        `;

        db.run(query, [batchId, normGstin, normPeriod, excelPath, jsonPath, now, now, now], (err) => {
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

        const normGstin = String(clientGstin).trim().toUpperCase();
        const normPeriod = normalizeReturnPeriod(returnPeriod) || String(returnPeriod).trim();

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
            const pf = buildStrictPeriodFilter(normPeriod);
            const wherePeriod = pf.clause.replace(/return_period/g, 'i.return_period');
            const params = [normGstin, ...pf.params];

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
            WHERE UPPER(TRIM(i.client_gstin)) = ? AND ${wherePeriod}
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
                clientGstin: normGstin,
                returnPeriod: normPeriod,
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

        const normGstin = String(clientGstin).trim().toUpperCase();
        const defaultPeriod = normalizeReturnPeriod(returnPeriod) || String(returnPeriod).trim();
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

            let allocErr = null;
            for (const item of allocations) {
                const id = item.id || randomUUID();
                const invId = item.invoiceId || item.invoice_id || item.id;
                const target = item.targetTable || item.target_table || '4A5';
                const notes = item.notes || '';
                const user = item.allocatedBy || item.allocated_by || 'User';
                const itemPeriod = item.returnPeriod || item.return_period || defaultPeriod;
                const retPeriod = normalizeReturnPeriod(itemPeriod) || itemPeriod;

                stmt.run([
                    id,
                    normGstin,
                    retPeriod,
                    invId,
                    target,
                    notes,
                    user,
                    now,
                    now
                ], (err) => {
                    if (err && !allocErr) allocErr = err;
                });
            }

            stmt.finalize(() => {
                if (allocErr) {
                    console.error('[GSTR-3B Allocation] Error during allocation insert, rolling back:', allocErr.message);
                    db.run('ROLLBACK', () => reject(allocErr));
                    return;
                }

                db.run('COMMIT', (err) => {
                    if (err) {
                        db.run('ROLLBACK', () => reject(err));
                        return;
                    }
                    resolve({ success: true, updatedCount: allocations.length });
                });
            });
        });
    });
}

// ─── 7. PHASE 36 CHECKSUM VERIFICATION & ERROR RECORDING (D-12 / G2B-BP-09) ──

/**
 * verifyGstr2bBatchChecksum: Compares parsed metrics against live/portal summary.
 * Returns { verifyStatus: 'VERIFIED' | 'PARTIAL_VERIFY' | 'UNVERIFIED', verifyWarning, verifyDiff }
 */
export function verifyGstr2bBatchChecksum(parsedMetrics, portalSummary) {
    if (!portalSummary || (portalSummary.totalInvoices == null && portalSummary.eligibleItcTotal == null)) {
        return { verifyStatus: 'UNVERIFIED', verifyWarning: null, verifyDiff: null };
    }

    const portalInvoices = Number.isFinite(portalSummary.totalInvoices) ? portalSummary.totalInvoices : null;
    const portalItc = Number.isFinite(portalSummary.eligibleItcTotal) ? portalSummary.eligibleItcTotal : null;
    const parsedInvoices = Number(parsedMetrics?.total_invoices ?? parsedMetrics?.totalInvoices ?? 0);
    const parsedItc = Number(parsedMetrics?.eligible_itc_total ?? parsedMetrics?.eligibleItcTotal ?? parsedMetrics?.eligibleItc?.total ?? 0);

    const countMismatch = portalInvoices != null && portalInvoices !== parsedInvoices;
    const itcDiff = portalItc != null ? Math.round(Math.abs(portalItc - parsedItc) * 100) / 100 : 0;
    const itcMismatch = portalItc != null && itcDiff > 2.0;

    const diff = {
        portalInvoices,
        parsedInvoices,
        portalItc,
        parsedItc,
        itcDiff
    };

    if (countMismatch || itcMismatch) {
        const warnings = [];
        if (countMismatch) warnings.push(`Portal invoices: ${portalInvoices} vs Parsed: ${parsedInvoices}`);
        if (itcMismatch) warnings.push(`Portal ITC: ₹${portalItc} vs Parsed: ₹${parsedItc} (Diff: ₹${itcDiff})`);
        return {
            verifyStatus: 'PARTIAL_VERIFY',
            verifyWarning: warnings.join('; '),
            verifyDiff: diff
        };
    }

    return {
        verifyStatus: 'VERIFIED',
        verifyWarning: null,
        verifyDiff: diff
    };
}

/**
 * updateGstr2bBatchVerification: Idempotently updates verification status and warnings on gstr2b_batches.
 */
export function updateGstr2bBatchVerification(db, clientGstin, returnPeriod, { verifyStatus, verifyWarning, warning, portalSummary, verifyDiff, diff, jobId } = {}) {
    return new Promise((resolve) => {
        if (!clientGstin || !returnPeriod) return resolve({ success: false });
        const gUpper = String(clientGstin).trim().toUpperCase();
        const normPeriod = normalizeReturnPeriod(returnPeriod) || String(returnPeriod).trim();
        const pf = buildStrictPeriodFilter(normPeriod);
        const status = verifyStatus || 'UNVERIFIED';
        const warn = verifyWarning || warning || null;
        const portalJson = portalSummary ? JSON.stringify(portalSummary) : null;
        const diffJson = (verifyDiff || diff) ? JSON.stringify(verifyDiff || diff) : null;
        const jId = jobId || null;
        const now = Date.now();

        const sql = `
            UPDATE gstr2b_batches
            SET verify_status = ?,
                verify_warning = ?,
                portal_summary_json = COALESCE(?, portal_summary_json),
                verify_diff_json = COALESCE(?, verify_diff_json),
                job_id = COALESCE(?, job_id),
                updated_at = ?
            WHERE UPPER(TRIM(client_gstin)) = ? AND (${pf.clause})
        `;
        db.run(sql, [status, warn, portalJson, diffJson, jId, now, gUpper, ...pf.params], (err) => {
            resolve({ success: !err });
        });
    });
}

/**
 * recordGstr2bMonthError: Records month-level autopilot failure while strictly protecting
 * valid SYNCED/NIL_SYNCED data (Golden Rule zero-data-loss).
 */
export function recordGstr2bMonthError(db, clientGstin, returnPeriod, errorMessage, jobId = null) {
    return new Promise((resolve, reject) => {
        if (!clientGstin || !returnPeriod) return resolve({ success: false });
        const gUpper = String(clientGstin).trim().toUpperCase();
        const normPeriod = normalizeReturnPeriod(returnPeriod) || String(returnPeriod).trim();
        const now = Date.now();
        const batchId = randomUUID();
        const msg = String(errorMessage || 'Unknown error');

        const sql = `
            INSERT INTO gstr2b_batches (
                id, client_gstin, return_period, status, last_error, job_id, created_at, updated_at
            ) VALUES (?, ?, ?, 'FAILED', ?, ?, ?, ?)
            ON CONFLICT(client_gstin, return_period) DO UPDATE SET
                status = CASE 
                    WHEN gstr2b_batches.status IN ('SYNCED', 'PUSHED_TO_3B', 'NIL_SYNCED') THEN gstr2b_batches.status 
                    ELSE 'FAILED' 
                END,
                last_error = excluded.last_error,
                job_id = COALESCE(excluded.job_id, gstr2b_batches.job_id),
                updated_at = excluded.updated_at
        `;
        db.run(sql, [batchId, gUpper, normPeriod, msg, jobId, now, now], (err) => {
            if (err) return reject(err);
            resolve({ success: true, status: 'FAILED' });
        });
    });
}

export function markGstr2bMonthRequested(db, clientGstin, returnPeriod) {
    return new Promise((resolve) => {
        const normGstin = String(clientGstin || '').trim().toUpperCase();
        const normPeriod = normalizeReturnPeriod(returnPeriod) || String(returnPeriod || '').trim();
        const now = Date.now();
        const batchId = randomUUID();
        db.run(`
            INSERT INTO gstr2b_batches (id, client_gstin, return_period, status, requested_at, created_at, updated_at)
            VALUES (?, ?, ?, 'REQUESTED', ?, ?, ?)
            ON CONFLICT(client_gstin, return_period) DO UPDATE SET
                status = 'REQUESTED',
                requested_at = excluded.requested_at,
                updated_at = excluded.updated_at
        `, [batchId, normGstin, normPeriod, now, now, now], () => resolve(true));
    });
}
