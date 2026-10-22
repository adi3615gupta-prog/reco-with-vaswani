import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import nodemailer from 'nodemailer';

/**
 * Standardizes invoice dates (ISO YYYY-MM-DD or DD/MM/YYYY) to standard DD-MM-YYYY
 * to ensure UNIQUE(client_gstin, return_period, ctin, inum, idt) constraint integrity.
 */
function normalizeImsDate(d) {
    if (!d) return '';
    const s = String(d).trim();
    const isoMatch = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (isoMatch) {
        return `${isoMatch[3].padStart(2, '0')}-${isoMatch[2].padStart(2, '0')}-${isoMatch[1]}`;
    }
    const dmyMatch = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (dmyMatch) {
        return `${dmyMatch[1].padStart(2, '0')}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[3]}`;
    }
    return s.replace(/\//g, '-');
}

/**
 * setupImsRoutes — Backend API routes and database schema for GST IMS (Invoice Management System)
 * 
 * Scaled for high-volume CA practice (300+ clients):
 * - Inward invoice persistence across tax periods
 * - Batch multi-client ingestion & fast bulk transactions
 * - Tokenized public client review links with zero file clutter
 * - Direct real-time decision submission (Accept / Reject / Pending + Remarks)
 * - Automatic dynamic GSTR-2B eligible ITC calculation
 * - Bridge to GSTR-3B Table 4 & official GSTN IMS Action payload generation
 */
export default function setupImsRoutes(app, db) {
    let activeBrowserInstance = null;

    // ─── 1. DATABASE SCHEMA INITIALIZATION ──────────────────────────────────────
    db.serialize(() => {
        // Table 1: IMS Batches per client & tax period
        db.run(`CREATE TABLE IF NOT EXISTS ims_batches (
            id TEXT PRIMARY KEY,
            client_gstin TEXT NOT NULL,
            return_period TEXT NOT NULL,
            status TEXT DEFAULT 'SYNCED',
            total_invoices INTEGER DEFAULT 0,
            accepted_count INTEGER DEFAULT 0,
            rejected_count INTEGER DEFAULT 0,
            pending_count INTEGER DEFAULT 0,
            no_action_count INTEGER DEFAULT 0,
            eligible_itc_igst REAL DEFAULT 0,
            eligible_itc_cgst REAL DEFAULT 0,
            eligible_itc_sgst REAL DEFAULT 0,
            eligible_itc_cess REAL DEFAULT 0,
            eligible_itc_total REAL DEFAULT 0,
            created_at INTEGER,
            updated_at INTEGER,
            UNIQUE(client_gstin, return_period)
        )`);

        // Table 2: Inward Invoices detail line items
        db.run(`CREATE TABLE IF NOT EXISTS ims_invoices (
            id TEXT PRIMARY KEY,
            batch_id TEXT,
            client_gstin TEXT NOT NULL,
            return_period TEXT NOT NULL,
            ctin TEXT NOT NULL,
            supplier_name TEXT,
            inum TEXT NOT NULL,
            idt TEXT NOT NULL,
            inv_typ TEXT DEFAULT 'R',
            pos TEXT,
            rchrg TEXT DEFAULT 'N',
            txval REAL DEFAULT 0,
            igst REAL DEFAULT 0,
            cgst REAL DEFAULT 0,
            sgst REAL DEFAULT 0,
            cess REAL DEFAULT 0,
            total_val REAL DEFAULT 0,
            source TEXT DEFAULT 'GSTR-1',
            source_period TEXT,
            action TEXT DEFAULT 'NO_ACTION',
            client_remarks TEXT,
            reviewed_at INTEGER,
            reviewed_by TEXT,
            UNIQUE(client_gstin, return_period, ctin, inum, idt)
        )`);

        // Table 3: Tokenized public client review access
        db.run(`CREATE TABLE IF NOT EXISTS ims_review_tokens (
            token TEXT PRIMARY KEY,
            client_gstin TEXT NOT NULL,
            return_period TEXT NOT NULL,
            created_at INTEGER,
            expires_at INTEGER,
            is_active INTEGER DEFAULT 1
        )`);

        // Performance Indexes
        db.run(`CREATE INDEX IF NOT EXISTS idx_ims_batches_period ON ims_batches(return_period)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_ims_invoices_batch ON ims_invoices(batch_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_ims_invoices_gstin_period ON ims_invoices(client_gstin, return_period)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_ims_tokens_lookup ON ims_review_tokens(token, is_active)`);

        // Safe migrations for clients credentials & 2-Phase IMS Generation
        db.run(`ALTER TABLE clients ADD COLUMN portal_username TEXT`, (err) => { /* ignore */ });
        db.run(`ALTER TABLE clients ADD COLUMN portal_password TEXT`, (err) => { /* ignore */ });
        db.run(`ALTER TABLE ims_batches ADD COLUMN generation_status TEXT DEFAULT 'NOT_REQUESTED'`, (err) => { /* ignore */ });
        db.run(`ALTER TABLE ims_batches ADD COLUMN generation_requested_at INTEGER`, (err) => { /* ignore */ });

        // Table 4: Gmail SMTP Settings for Broadcast & Client Emails
        db.run(`CREATE TABLE IF NOT EXISTS ims_email_settings (
            id TEXT PRIMARY KEY DEFAULT 'primary',
            sender_name TEXT,
            sender_email TEXT,
            app_password TEXT,
            subject_template TEXT,
            firm_name TEXT,
            ca_phone TEXT,
            public_base_url TEXT,
            updated_at INTEGER
        )`);
    });

    // ─── HELPER: Recalculate Batch Metrics ─────────────────────────────────────
    const recalculateBatchMetrics = (clientGstin, returnPeriod) => {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT 
                    COUNT(*) as total_invoices,
                    SUM(CASE WHEN UPPER(action) = 'ACCEPT' THEN 1 ELSE 0 END) as accepted_count,
                    SUM(CASE WHEN UPPER(action) = 'REJECT' THEN 1 ELSE 0 END) as rejected_count,
                    SUM(CASE WHEN UPPER(action) = 'PENDING' THEN 1 ELSE 0 END) as pending_count,
                    SUM(CASE WHEN action IS NULL OR UPPER(action) = 'NO_ACTION' OR action = '' THEN 1 ELSE 0 END) as no_action_count,
                    SUM(CASE 
                        WHEN UPPER(action) = 'ACCEPT' AND UPPER(COALESCE(rchrg, 'N')) != 'Y' THEN
                            CASE 
                                WHEN UPPER(COALESCE(inv_typ, 'R')) IN ('C', 'CR') OR UPPER(COALESCE(source, '')) IN ('CDNR', 'CDNRA') THEN -COALESCE(igst, 0)
                                ELSE COALESCE(igst, 0)
                            END
                        ELSE 0 
                    END) as eligible_itc_igst,
                    SUM(CASE 
                        WHEN UPPER(action) = 'ACCEPT' AND UPPER(COALESCE(rchrg, 'N')) != 'Y' THEN
                            CASE 
                                WHEN UPPER(COALESCE(inv_typ, 'R')) IN ('C', 'CR') OR UPPER(COALESCE(source, '')) IN ('CDNR', 'CDNRA') THEN -COALESCE(cgst, 0)
                                ELSE COALESCE(cgst, 0)
                            END
                        ELSE 0 
                    END) as eligible_itc_cgst,
                    SUM(CASE 
                        WHEN UPPER(action) = 'ACCEPT' AND UPPER(COALESCE(rchrg, 'N')) != 'Y' THEN
                            CASE 
                                WHEN UPPER(COALESCE(inv_typ, 'R')) IN ('C', 'CR') OR UPPER(COALESCE(source, '')) IN ('CDNR', 'CDNRA') THEN -COALESCE(sgst, 0)
                                ELSE COALESCE(sgst, 0)
                            END
                        ELSE 0 
                    END) as eligible_itc_sgst,
                    SUM(CASE 
                        WHEN UPPER(action) = 'ACCEPT' AND UPPER(COALESCE(rchrg, 'N')) != 'Y' THEN
                            CASE 
                                WHEN UPPER(COALESCE(inv_typ, 'R')) IN ('C', 'CR') OR UPPER(COALESCE(source, '')) IN ('CDNR', 'CDNRA') THEN -COALESCE(cess, 0)
                                ELSE COALESCE(cess, 0)
                            END
                        ELSE 0 
                    END) as eligible_itc_cess
                FROM ims_invoices
                WHERE client_gstin = ? AND return_period = ?
            `;

            db.get(query, [clientGstin, returnPeriod], (err, row) => {
                if (err) return reject(err);

                const total = row ? (row.total_invoices || 0) : 0;
                const accepted = row ? (row.accepted_count || 0) : 0;
                const rejected = row ? (row.rejected_count || 0) : 0;
                const pending = row ? (row.pending_count || 0) : 0;
                const noAction = row ? (row.no_action_count || 0) : 0;

                const igst = row ? Math.max(0, Math.round((row.eligible_itc_igst || 0) * 100) / 100) : 0;
                const cgst = row ? Math.max(0, Math.round((row.eligible_itc_cgst || 0) * 100) / 100) : 0;
                const sgst = row ? Math.max(0, Math.round((row.eligible_itc_sgst || 0) * 100) / 100) : 0;
                const cess = row ? Math.max(0, Math.round((row.eligible_itc_cess || 0) * 100) / 100) : 0;
                const totalItc = Math.round((igst + cgst + sgst + cess) * 100) / 100;

                // Determine dynamic status
                let status = 'SYNCED';
                if (total > 0 && noAction === 0) {
                    status = 'REVIEWED';
                } else if (accepted > 0 || rejected > 0 || pending > 0) {
                    status = 'PARTIALLY_REVIEWED';
                }

                const updateQuery = `
                    UPDATE ims_batches
                    SET total_invoices = ?, accepted_count = ?, rejected_count = ?, pending_count = ?, no_action_count = ?,
                        eligible_itc_igst = ?, eligible_itc_cgst = ?, eligible_itc_sgst = ?, eligible_itc_cess = ?, eligible_itc_total = ?,
                        status = CASE WHEN status = 'PUSHED_TO_3B' THEN 'PUSHED_TO_3B' ELSE ? END,
                        generation_status = 'DOWNLOADED',
                        updated_at = ?
                    WHERE client_gstin = ? AND return_period = ?
                `;

                db.run(updateQuery, [
                    total, accepted, rejected, pending, noAction,
                    igst, cgst, sgst, cess, totalItc,
                    status, Date.now(),
                    clientGstin, returnPeriod
                ], (uErr) => {
                    if (uErr) return reject(uErr);
                    resolve({ total, accepted, rejected, pending, noAction, totalItc, status });
                });
            });
        });
    };

    // ─── 2. MASTER SUMMARY API (Scaled for 300+ Clients) ───────────────────────
    app.get('/api/ims/summary', (req, res) => {
        const period = req.query.period || 'November 2025';

        // Select all registered clients, joined with their IMS batch for this period
        const sql = `
            SELECT 
                c.id as client_id,
                c.gstin,
                c.trade_name,
                c.legal_name,
                c.email,
                c.phone,
                b.id as batch_id,
                COALESCE(b.status, 'NOT_SYNCED') as status,
                COALESCE(b.total_invoices, 0) as total_invoices,
                COALESCE(b.accepted_count, 0) as accepted_count,
                COALESCE(b.rejected_count, 0) as rejected_count,
                COALESCE(b.pending_count, 0) as pending_count,
                COALESCE(b.no_action_count, 0) as no_action_count,
                COALESCE(b.eligible_itc_igst, 0) as eligible_itc_igst,
                COALESCE(b.eligible_itc_cgst, 0) as eligible_itc_cgst,
                COALESCE(b.eligible_itc_sgst, 0) as eligible_itc_sgst,
                COALESCE(b.eligible_itc_cess, 0) as eligible_itc_cess,
                COALESCE(b.eligible_itc_total, 0) as eligible_itc_total,
                b.updated_at,
                COALESCE(b.generation_status, 'NOT_REQUESTED') as generation_status,
                b.generation_requested_at,
                t.token as active_token,
                t.expires_at as token_expires_at
            FROM clients c
            LEFT JOIN ims_batches b ON c.gstin = b.client_gstin AND b.return_period = ?
            LEFT JOIN ims_review_tokens t ON c.gstin = t.client_gstin AND t.return_period = ? AND t.is_active = 1
            ORDER BY c.trade_name COLLATE NOCASE ASC
        `;

        db.all(sql, [period, period], (err, rows) => {
            if (err) {
                console.error('Error fetching IMS summary:', err);
                return res.status(500).json({ success: false, error: 'Database error fetching IMS summary' });
            }

            // Calculate aggregate high-level KPIs across all clients
            let totalClients = rows.length;
            let syncedClients = 0;
            let reviewedClients = 0;
            let pendingClients = 0;
            let pushedClients = 0;
            let totalEligibleItc = 0;

            rows.forEach(r => {
                if (r.status !== 'NOT_SYNCED') syncedClients++;
                if (r.status === 'REVIEWED') reviewedClients++;
                if (r.status === 'SYNCED' || r.status === 'PARTIALLY_REVIEWED' || r.status === 'DISPATCHED') pendingClients++;
                if (r.status === 'PUSHED_TO_3B') {
                    reviewedClients++;
                    pushedClients++;
                }
                totalEligibleItc += r.eligible_itc_total || 0;
            });

            res.json({
                success: true,
                period,
                stats: {
                    totalClients,
                    syncedClients,
                    reviewedClients,
                    pendingClients,
                    pushedClients,
                    totalEligibleItc: Math.round(totalEligibleItc * 100) / 100
                },
                clients: rows
            });
        });
    });

    // ─── 2B. RESET / CANCEL GENERATION STATUS ──────────────────────────────────
    app.post('/api/ims/reset-generation', (req, res) => {
        const { gstin, period, all, resetAll } = req.body;
        const targetPeriod = period || 'November 2025';
        const isAll = Boolean(all || resetAll || !gstin);
        let sql = `UPDATE ims_batches SET generation_status = 'NOT_REQUESTED', generation_requested_at = NULL, status = CASE WHEN status = 'REQUESTED_WAITING' THEN 'NOT_SYNCED' ELSE status END WHERE return_period = ?`;
        let params = [targetPeriod];
        if (!isAll && gstin) {
            sql += ` AND client_gstin = ?`;
            params.push(gstin);
        }
        db.run(sql, params, function(err) {
            if (err) {
                console.error('Error resetting generation status:', err);
                return res.status(500).json({ success: false, error: err.message });
            }
            res.json({ success: true, message: 'Generation status reset successfully', changes: this.changes });
        });
    });

    // ─── 3. FETCH INVOICES FOR A SINGLE CLIENT ────────────────────────────────
    app.get('/api/ims/invoices/:gstin', (req, res) => {
        const { gstin } = req.params;
        const period = req.query.period || 'November 2025';
        const actionFilter = req.query.action;
        const search = req.query.search;

        let query = `
            SELECT * FROM ims_invoices
            WHERE client_gstin = ? AND return_period = ?
        `;
        const params = [gstin, period];

        if (actionFilter && actionFilter !== 'ALL') {
            query += ` AND UPPER(action) = ?`;
            params.push(actionFilter.toUpperCase());
        }

        if (search) {
            query += ` AND (ctin LIKE ? OR supplier_name LIKE ? OR inum LIKE ?)`;
            const s = `%${search}%`;
            params.push(s, s, s);
        }

        query += ` ORDER BY idt DESC, inum ASC`;

        db.all(query, params, (err, invoices) => {
            if (err) {
                console.error('Error fetching IMS invoices:', err);
                return res.status(500).json({ success: false, error: 'Failed to fetch invoices' });
            }

            // Also get batch row
            db.get(`SELECT * FROM ims_batches WHERE client_gstin = ? AND return_period = ?`, [gstin, period], (bErr, batch) => {
                res.json({
                    success: true,
                    gstin,
                    period,
                    batch: batch || null,
                    count: invoices.length,
                    invoices
                });
            });
        });
    });

    // ─── 4. INGEST IMS INVOICES (Single Client / Desktop Drop) ────────────────
    app.post('/api/ims/ingest', async (req, res) => {
        const { gstin, period, invoices } = req.body;

        if (!gstin || !period || !Array.isArray(invoices)) {
            return res.status(400).json({ success: false, error: 'gstin, period and invoices array are required' });
        }

        const batchId = randomUUID();
        const now = Date.now();

        // 1. Ensure Batch exists or upsert
        db.run(`
            INSERT INTO ims_batches (id, client_gstin, return_period, status, created_at, updated_at)
            VALUES (?, ?, ?, 'SYNCED', ?, ?)
            ON CONFLICT(client_gstin, return_period) DO UPDATE SET status = 'SYNCED', generation_status = 'DOWNLOADED', updated_at = ?
        `, [batchId, gstin, period, now, now, now], async (batchErr) => {
            if (batchErr) {
                console.error('Error creating batch:', batchErr);
                return res.status(500).json({ success: false, error: 'Failed to initialize batch' });
            }

            // 2. Fetch current batch_id in case it was already existing
            db.get(`SELECT id FROM ims_batches WHERE client_gstin = ? AND return_period = ?`, [gstin, period], (fetchErr, row) => {
                const activeBatchId = row ? row.id : batchId;

                // 3. Batch insert invoices
                db.serialize(() => {
                    db.run('BEGIN TRANSACTION');

                    const insertStmt = db.prepare(`
                        INSERT INTO ims_invoices (
                            id, batch_id, client_gstin, return_period, ctin, supplier_name,
                            inum, idt, inv_typ, pos, rchrg, txval, igst, cgst, sgst, cess, total_val,
                            source, source_period, action, client_remarks, reviewed_at, reviewed_by
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(client_gstin, return_period, ctin, inum, idt) DO UPDATE SET
                            batch_id = excluded.batch_id,
                            supplier_name = excluded.supplier_name,
                            txval = excluded.txval,
                            igst = excluded.igst,
                            cgst = excluded.cgst,
                            sgst = excluded.sgst,
                            cess = excluded.cess,
                            total_val = excluded.total_val,
                            source = excluded.source,
                            source_period = excluded.source_period
                    `);

                    for (const inv of invoices) {
                        const action = inv.action ? inv.action.toUpperCase() : 'NO_ACTION';
                        insertStmt.run([
                            randomUUID(), activeBatchId, gstin, period,
                            inv.ctin || '', inv.supplier_name || inv.cname || '',
                            inv.inum || '', inv.idt || '',
                            inv.inv_typ || 'R', inv.pos || '', inv.rchrg || 'N',
                            Number(inv.txval) || 0, Number(inv.igst) || 0,
                            Number(inv.cgst) || 0, Number(inv.sgst) || 0, Number(inv.cess) || 0,
                            Number(inv.total_val || inv.val) || 0,
                            inv.source || 'GSTR-1', inv.source_period || period,
                            action, inv.client_remarks || null,
                            inv.reviewed_at || null, inv.reviewed_by || null
                        ], (rErr) => {
                            if (rErr) console.warn('[IMS Ingestion] Ingest row warning:', rErr.message);
                        });
                    }

                    insertStmt.finalize();

                    db.run('COMMIT', async (commitErr) => {
                        if (commitErr) {
                            console.error('Commit error on IMS ingest:', commitErr);
                            return res.status(500).json({ success: false, error: 'Database transaction commit failed' });
                        }

                        try {
                            const updated = await recalculateBatchMetrics(gstin, period);
                            res.json({ success: true, message: `Successfully ingested ${invoices.length} invoices`, metrics: updated });
                        } catch (calcErr) {
                            console.error('Error recalculating metrics:', calcErr);
                            res.json({ success: true, message: `Ingested ${invoices.length} invoices, recalculation pending` });
                        }
                    });
                });
            });
        });
    });

    // ─── 5. BULK INGEST MULTI-CLIENT (Folder Drop of 300+ Files) ──────────────
    app.post('/api/ims/batch-ingest-multi', async (req, res) => {
        const { period, clientsData } = req.body;
        if (!period || !Array.isArray(clientsData)) {
            return res.status(400).json({ success: false, error: 'period and clientsData array required' });
        }

        const now = Date.now();
        let totalInsertedInvoices = 0;
        let successfulClients = 0;

        try {
            for (const item of clientsData) {
                const { gstin, invoices } = item;
                if (!gstin || !Array.isArray(invoices) || invoices.length === 0) continue;

                const batchId = randomUUID();

                await new Promise((resolve, reject) => {
                    db.run(`
                        INSERT INTO ims_batches (id, client_gstin, return_period, status, created_at, updated_at)
                        VALUES (?, ?, ?, 'SYNCED', ?, ?)
                        ON CONFLICT(client_gstin, return_period) DO UPDATE SET status = 'SYNCED', generation_status = 'DOWNLOADED', updated_at = ?
                    `, [batchId, gstin, period, now, now, now], (err) => {
                        if (err) return reject(err);
                        resolve(true);
                    });
                });

                const batchRow = await new Promise((resolve) => {
                    db.get(`SELECT id FROM ims_batches WHERE client_gstin = ? AND return_period = ?`, [gstin, period], (err, row) => {
                        resolve(row);
                    });
                });
                const activeBatchId = batchRow ? batchRow.id : batchId;

                await new Promise((resolve, reject) => {
                    db.serialize(() => {
                        db.run('BEGIN TRANSACTION');
                        const stmt = db.prepare(`
                            INSERT INTO ims_invoices (
                                id, batch_id, client_gstin, return_period, ctin, supplier_name,
                                inum, idt, inv_typ, pos, rchrg, txval, igst, cgst, sgst, cess, total_val,
                                source, source_period, action
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            ON CONFLICT(client_gstin, return_period, ctin, inum, idt) DO UPDATE SET
                                batch_id = excluded.batch_id,
                                supplier_name = excluded.supplier_name,
                                txval = excluded.txval,
                                igst = excluded.igst,
                                cgst = excluded.cgst,
                                sgst = excluded.sgst,
                                total_val = excluded.total_val,
                                source = excluded.source,
                                source_period = excluded.source_period
                        `);

                        for (const inv of invoices) {
                            stmt.run([
                                randomUUID(), activeBatchId, gstin, period,
                                inv.ctin || '', inv.supplier_name || inv.cname || '',
                                inv.inum || '', inv.idt || '',
                                inv.inv_typ || 'R', inv.pos || '', inv.rchrg || 'N',
                                Number(inv.txval) || 0, Number(inv.igst) || 0,
                                Number(inv.cgst) || 0, Number(inv.sgst) || 0, Number(inv.cess) || 0,
                                Number(inv.total_val || inv.val) || 0,
                                inv.source || 'GSTR-1', inv.source_period || period,
                                inv.action ? inv.action.toUpperCase() : 'NO_ACTION'
                            ], (rErr) => {
                                if (rErr) console.warn('[IMS Ingestion] Batch upload row warning:', rErr.message);
                            });
                        }

                        stmt.finalize();
                        db.run('COMMIT', (cErr) => {
                            if (cErr) return reject(cErr);
                            resolve(true);
                        });
                    });
                });

                await recalculateBatchMetrics(gstin, period);
                totalInsertedInvoices += invoices.length;
                successfulClients++;
            }

            res.json({
                success: true,
                message: `Bulk processed ${successfulClients} clients with ${totalInsertedInvoices} total invoices`,
                processedClients: successfulClients,
                totalInvoices: totalInsertedInvoices
            });
        } catch (error) {
            console.error('Bulk ingestion error:', error);
            res.status(500).json({ success: false, error: error.message || 'Failed bulk ingestion' });
        }
    });

    // ─── 6. TOKEN GENERATION (Single or Bulk 300+ Clients) ────────────────────
    app.post('/api/ims/generate-tokens', (req, res) => {
        const { period, gstins } = req.body;
        if (!period) return res.status(400).json({ success: false, error: 'period is required' });

        const now = Date.now();
        const expiresAt = now + (30 * 24 * 60 * 60 * 1000); // 30 days valid
        const host = req.headers.host || 'localhost:3001';
        const protocol = req.headers['x-forwarded-proto'] || 'http';

        let targetGstins = Array.isArray(gstins) && gstins.length > 0 ? gstins : null;

        // If no gstins provided, generate for all clients in the system
        const sql = targetGstins 
            ? `SELECT gstin, trade_name, phone, email FROM clients WHERE gstin IN (${targetGstins.map(() => '?').join(',')})`
            : `SELECT gstin, trade_name, phone, email FROM clients`;

        db.all(sql, targetGstins || [], (err, clientRows) => {
            if (err) return res.status(500).json({ success: false, error: 'Database error fetching clients' });

            const results = [];
            const gstinsList = clientRows.map(c => c.gstin);
            if (gstinsList.length === 0) {
                return res.json({ success: true, count: 0, tokens: [] });
            }

            // Step 1: Deactivate old tokens for these clients and period first
            const placeholders = gstinsList.map(() => '?').join(',');
            db.run(`UPDATE ims_review_tokens SET is_active = 0 WHERE return_period = ? AND client_gstin IN (${placeholders})`, [period, ...gstinsList], (deactErr) => {
                if (deactErr) return res.status(500).json({ success: false, error: 'Failed deactivating old tokens' });

                // Step 2: Insert new active tokens
                db.serialize(() => {
                    db.run('BEGIN TRANSACTION');

                    const insertTokenStmt = db.prepare(`
                        INSERT INTO ims_review_tokens (token, client_gstin, return_period, created_at, expires_at, is_active)
                        VALUES (?, ?, ?, ?, ?, 1)
                    `);

                    const updateBatchStatusStmt = db.prepare(`
                        UPDATE ims_batches 
                        SET status = CASE WHEN status = 'SYNCED' THEN 'DISPATCHED' ELSE status END
                        WHERE client_gstin = ? AND return_period = ?
                    `);

                    for (const client of clientRows) {
                        const token = randomUUID().replace(/-/g, '') + randomUUID().substring(0, 8);
                        insertTokenStmt.run([token, client.gstin, period, now, expiresAt]);
                        updateBatchStatusStmt.run([client.gstin, period]);

                        const reviewUrl = `${protocol}://${host}/#/ims-review/${token}`;
                        results.push({
                            gstin: client.gstin,
                            tradeName: client.trade_name,
                            phone: client.phone,
                            email: client.email,
                            token,
                            reviewUrl
                        });
                    }

                    insertTokenStmt.finalize();
                    updateBatchStatusStmt.finalize();

                    db.run('COMMIT', (commitErr) => {
                        if (commitErr) return res.status(500).json({ success: false, error: 'Failed saving review tokens' });
                        res.json({ success: true, count: results.length, tokens: results });
                    });
                });
            });
        });
    });

    // Client direct URL redirect to React HashRouter
    app.get('/ims-review/:token', (req, res) => {
        res.redirect(`/#/ims-review/${req.params.token}`);
    });

    // ─── 7. PUBLIC CLIENT REVIEW (Zero-login, Token-based Access) ─────────────
    app.get('/api/ims/public/review/:token', (req, res) => {
        const { token } = req.params;
        const now = Date.now();

        db.get(`
            SELECT t.*, c.trade_name, c.legal_name, c.phone, c.email
            FROM ims_review_tokens t
            JOIN clients c ON t.client_gstin = c.gstin
            WHERE t.token = ? AND t.is_active = 1
        `, [token], (err, tokenRow) => {
            if (err || !tokenRow) {
                return res.status(404).json({ success: false, error: 'Invalid or expired review link. Please contact your Chartered Accountant.' });
            }

            if (tokenRow.expires_at < now) {
                return res.status(410).json({ success: false, error: 'This review link has expired. Please request a new link from your CA.' });
            }

            const { client_gstin, return_period } = tokenRow;

            // Fetch batch & invoices
            db.get(`SELECT * FROM ims_batches WHERE client_gstin = ? AND return_period = ?`, [client_gstin, return_period], (bErr, batch) => {
                db.all(`
                    SELECT id, ctin, supplier_name, inum, idt, inv_typ, pos, rchrg, txval, igst, cgst, sgst, cess, total_val, source, action, client_remarks
                    FROM ims_invoices
                    WHERE client_gstin = ? AND return_period = ?
                    ORDER BY idt DESC, inum ASC
                `, [client_gstin, return_period], (iErr, invoices) => {
                    if (iErr) return res.status(500).json({ success: false, error: 'Failed to load invoices' });

                    res.json({
                        success: true,
                        client: {
                            gstin: client_gstin,
                            tradeName: tokenRow.trade_name,
                            legalName: tokenRow.legal_name,
                            period: return_period
                        },
                        batch: batch || {
                            total_invoices: invoices.length,
                            status: 'DISPATCHED'
                        },
                        invoices
                    });
                });
            });
        });
    });

    // ─── 8. PUBLIC CLIENT SUBMIT DECISIONS ─────────────────────────────────────
    app.post('/api/ims/public/submit/:token', (req, res) => {
        const { token } = req.params;
        const { decisions } = req.body; // Array of { id, action: 'ACCEPT'|'REJECT'|'PENDING', remarks }

        if (!Array.isArray(decisions) || decisions.length === 0) {
            return res.status(400).json({ success: false, error: 'decisions array is required' });
        }

        db.get(`SELECT client_gstin, return_period, expires_at FROM ims_review_tokens WHERE token = ? AND is_active = 1`, [token], (err, tokenRow) => {
            if (err || !tokenRow) {
                return res.status(403).json({ success: false, error: 'Invalid review session' });
            }

            const { client_gstin, return_period } = tokenRow;
            const now = Date.now();

            db.serialize(() => {
                db.run('BEGIN TRANSACTION');

                const updateStmt = db.prepare(`
                    UPDATE ims_invoices
                    SET action = ?, client_remarks = ?, reviewed_at = ?, reviewed_by = 'CLIENT'
                    WHERE id = ? AND client_gstin = ? AND return_period = ?
                `);

                for (const d of decisions) {
                    const action = (d.action || 'NO_ACTION').toUpperCase();
                    updateStmt.run([action, d.remarks || null, now, d.id, client_gstin, return_period]);
                }

                updateStmt.finalize();

                db.run('COMMIT', async (commitErr) => {
                    if (commitErr) return res.status(500).json({ success: false, error: 'Failed to persist decisions' });

                    try {
                        const metrics = await recalculateBatchMetrics(client_gstin, return_period);
                        res.json({
                            success: true,
                            message: 'Review successfully submitted to your CA! Thank you.',
                            metrics
                        });
                    } catch (mErr) {
                        res.json({ success: true, message: 'Decisions recorded successfully' });
                    }
                });
            });
        });
    });

    // ─── 9. CA MANUAL ACTIONS UPDATE (Desktop UI) ─────────────────────────────
    app.post('/api/ims/update-actions', (req, res) => {
        const { gstin, period, updates } = req.body;
        if (!gstin || !period || !Array.isArray(updates)) {
            return res.status(400).json({ success: false, error: 'gstin, period and updates array are required' });
        }

        const now = Date.now();
        db.serialize(() => {
            db.run('BEGIN TRANSACTION');
            const stmt = db.prepare(`
                UPDATE ims_invoices
                SET action = ?, client_remarks = COALESCE(?, client_remarks), reviewed_at = ?, reviewed_by = 'CA'
                WHERE id = ? AND client_gstin = ? AND return_period = ?
            `);

            for (const u of updates) {
                stmt.run([u.action.toUpperCase(), u.remarks || null, now, u.id, gstin, period]);
            }

            stmt.finalize();
            db.run('COMMIT', async (commitErr) => {
                if (commitErr) return res.status(500).json({ success: false, error: 'Failed updating actions' });

                const metrics = await recalculateBatchMetrics(gstin, period);
                res.json({ success: true, message: 'Updated actions successfully', metrics });
            });
        });
    });

    // ─── 10. PUSH APPROVED 2B ITC TO GSTR-3B TABLE 4 ─────────────────────────
    app.post('/api/ims/push-to-3b', (req, res) => {
        const { gstin, period } = req.body;
        if (!gstin || !period) {
            return res.status(400).json({ success: false, error: 'gstin and period are required' });
        }

        db.get(`SELECT * FROM ims_batches WHERE client_gstin = ? AND return_period = ?`, [gstin, period], (err, batch) => {
            if (err || !batch) {
                return res.status(404).json({ success: false, error: 'No IMS batch found for this client and period' });
            }

            // Query full statutory breakdown across accepted invoices
            const queryBreakdown = `
                SELECT 
                    -- 1. All Other ITC (Table 4A5: B2B, not RCM, not CDNR)
                    SUM(CASE WHEN UPPER(COALESCE(action, 'NO_ACTION')) = 'ACCEPT' AND UPPER(COALESCE(rchrg, 'N')) != 'Y' AND UPPER(COALESCE(inv_typ, 'R')) NOT IN ('C', 'CR') AND UPPER(COALESCE(source, '')) NOT IN ('CDNR', 'CDNRA', 'IMPG') THEN COALESCE(txval, 0) ELSE 0 END) as itc_txval,
                    SUM(CASE WHEN UPPER(COALESCE(action, 'NO_ACTION')) = 'ACCEPT' AND UPPER(COALESCE(rchrg, 'N')) != 'Y' AND UPPER(COALESCE(inv_typ, 'R')) NOT IN ('C', 'CR') AND UPPER(COALESCE(source, '')) NOT IN ('CDNR', 'CDNRA', 'IMPG') THEN COALESCE(igst, 0) ELSE 0 END) as itc_igst,
                    SUM(CASE WHEN UPPER(COALESCE(action, 'NO_ACTION')) = 'ACCEPT' AND UPPER(COALESCE(rchrg, 'N')) != 'Y' AND UPPER(COALESCE(inv_typ, 'R')) NOT IN ('C', 'CR') AND UPPER(COALESCE(source, '')) NOT IN ('CDNR', 'CDNRA', 'IMPG') THEN COALESCE(cgst, 0) ELSE 0 END) as itc_cgst,
                    SUM(CASE WHEN UPPER(COALESCE(action, 'NO_ACTION')) = 'ACCEPT' AND UPPER(COALESCE(rchrg, 'N')) != 'Y' AND UPPER(COALESCE(inv_typ, 'R')) NOT IN ('C', 'CR') AND UPPER(COALESCE(source, '')) NOT IN ('CDNR', 'CDNRA', 'IMPG') THEN COALESCE(sgst, 0) ELSE 0 END) as itc_sgst,
                    SUM(CASE WHEN UPPER(COALESCE(action, 'NO_ACTION')) = 'ACCEPT' AND UPPER(COALESCE(rchrg, 'N')) != 'Y' AND UPPER(COALESCE(inv_typ, 'R')) NOT IN ('C', 'CR') AND UPPER(COALESCE(source, '')) NOT IN ('CDNR', 'CDNRA', 'IMPG') THEN COALESCE(cess, 0) ELSE 0 END) as itc_cess,

                    -- 2. Inward Reverse Charge (Table 4A3 & Table 3.1d)
                    SUM(CASE WHEN UPPER(COALESCE(action, 'NO_ACTION')) = 'ACCEPT' AND UPPER(COALESCE(rchrg, 'N')) = 'Y' THEN COALESCE(txval, 0) ELSE 0 END) as rcm_txval,
                    SUM(CASE WHEN UPPER(COALESCE(action, 'NO_ACTION')) = 'ACCEPT' AND UPPER(COALESCE(rchrg, 'N')) = 'Y' THEN COALESCE(igst, 0) ELSE 0 END) as rcm_igst,
                    SUM(CASE WHEN UPPER(COALESCE(action, 'NO_ACTION')) = 'ACCEPT' AND UPPER(COALESCE(rchrg, 'N')) = 'Y' THEN COALESCE(cgst, 0) ELSE 0 END) as rcm_cgst,
                    SUM(CASE WHEN UPPER(COALESCE(action, 'NO_ACTION')) = 'ACCEPT' AND UPPER(COALESCE(rchrg, 'N')) = 'Y' THEN COALESCE(sgst, 0) ELSE 0 END) as rcm_sgst,

                    -- 3. Inward Credit Notes (Table 4 Row 38 / 4B2)
                    SUM(CASE WHEN UPPER(COALESCE(action, 'NO_ACTION')) = 'ACCEPT' AND (UPPER(COALESCE(inv_typ, '')) IN ('C', 'CR') OR UPPER(COALESCE(source, '')) IN ('CDNR', 'CDNRA')) THEN COALESCE(txval, 0) ELSE 0 END) as cdnr_txval,
                    SUM(CASE WHEN UPPER(COALESCE(action, 'NO_ACTION')) = 'ACCEPT' AND (UPPER(COALESCE(inv_typ, '')) IN ('C', 'CR') OR UPPER(COALESCE(source, '')) IN ('CDNR', 'CDNRA')) THEN COALESCE(igst, 0) ELSE 0 END) as cdnr_igst,
                    SUM(CASE WHEN UPPER(COALESCE(action, 'NO_ACTION')) = 'ACCEPT' AND (UPPER(COALESCE(inv_typ, '')) IN ('C', 'CR') OR UPPER(COALESCE(source, '')) IN ('CDNR', 'CDNRA')) THEN COALESCE(cgst, 0) ELSE 0 END) as cdnr_cgst,
                    SUM(CASE WHEN UPPER(COALESCE(action, 'NO_ACTION')) = 'ACCEPT' AND (UPPER(COALESCE(inv_typ, '')) IN ('C', 'CR') OR UPPER(COALESCE(source, '')) IN ('CDNR', 'CDNRA')) THEN COALESCE(sgst, 0) ELSE 0 END) as cdnr_sgst,

                    -- 4. Import of Goods (Table 4A1)
                    SUM(CASE WHEN UPPER(COALESCE(action, 'NO_ACTION')) = 'ACCEPT' AND (UPPER(COALESCE(inv_typ, '')) = 'IMPG' OR UPPER(COALESCE(source, '')) = 'IMPG') THEN COALESCE(igst, 0) ELSE 0 END) as impg_igst
                FROM ims_invoices
                WHERE client_gstin = ? AND return_period = ?
            `;

            db.get(queryBreakdown, [gstin, period], (bdErr, bd) => {
                // Update batch status to PUSHED_TO_3B
                db.run(`UPDATE ims_batches SET status = 'PUSHED_TO_3B', updated_at = ? WHERE client_gstin = ? AND return_period = ?`, [Date.now(), gstin, period], (uErr) => {
                    if (uErr) return res.status(500).json({ success: false, error: 'Failed updating batch status' });

                    const itcIgst = bd ? Math.round((bd.itc_igst || 0) * 100) / 100 : (batch.eligible_itc_igst || 0);
                    const itcCgst = bd ? Math.round((bd.itc_cgst || 0) * 100) / 100 : (batch.eligible_itc_cgst || 0);
                    const itcSgst = bd ? Math.round((bd.itc_sgst || 0) * 100) / 100 : (batch.eligible_itc_sgst || 0);
                    const itcCess = bd ? Math.round((bd.itc_cess || 0) * 100) / 100 : (batch.eligible_itc_cess || 0);
                    const itcTxval = bd ? Math.round((bd.itc_txval || 0) * 100) / 100 : 0;
                    const itcTotal = Math.round((itcIgst + itcCgst + itcSgst + itcCess) * 100) / 100;

                    const rcmIgst = bd ? Math.round((bd.rcm_igst || 0) * 100) / 100 : 0;
                    const rcmCgst = bd ? Math.round((bd.rcm_cgst || 0) * 100) / 100 : 0;
                    const rcmSgst = bd ? Math.round((bd.rcm_sgst || 0) * 100) / 100 : 0;
                    const rcmTxval = bd ? Math.round((bd.rcm_txval || 0) * 100) / 100 : 0;
                    const rcmTotal = Math.round((rcmIgst + rcmCgst + rcmSgst) * 100) / 100;

                    const cdnrIgst = bd ? Math.round((bd.cdnr_igst || 0) * 100) / 100 : 0;
                    const cdnrCgst = bd ? Math.round((bd.cdnr_cgst || 0) * 100) / 100 : 0;
                    const cdnrSgst = bd ? Math.round((bd.cdnr_sgst || 0) * 100) / 100 : 0;
                    const cdnrTxval = bd ? Math.round((bd.cdnr_txval || 0) * 100) / 100 : 0;
                    const cdnrTotal = Math.round((cdnrIgst + cdnrCgst + cdnrSgst) * 100) / 100;

                    const impgIgst = bd ? Math.round((bd.impg_igst || 0) * 100) / 100 : 0;

                    res.json({
                        success: true,
                        message: 'Eligible ITC successfully calculated for GSTR-3B Table 4',
                        gstin,
                        period,
                        itc2b: {
                            taxable: itcTxval,
                            igst: itcIgst,
                            cgst: itcCgst,
                            sgst: itcSgst,
                            cess: itcCess,
                            total: itcTotal
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
                        importGoods: {
                            taxable: 0,
                            igst: impgIgst,
                            cgst: 0,
                            sgst: 0,
                            total: impgIgst
                        },
                        counts: {
                            totalInvoices: batch.total_invoices,
                            accepted: batch.accepted_count,
                            rejected: batch.rejected_count,
                            pending: batch.pending_count
                        }
                    });
                });
            });
        });
    });

    // ─── 11. GENERATE OFFICIAL GSTN IMS ACTION PAYLOAD (FOR PORTAL UPLOAD) ────
    app.get('/api/ims/portal-action-payload/:gstin', async (req, res) => {
        const { gstin } = req.params;
        const period = req.query.period || 'April 2025';

        db.all(`
            SELECT ctin, inum, idt, inv_typ, action, client_remarks, txval, igst, cgst, sgst, cess, total_val, pos, rchrg, source, source_period, supplier_name
            FROM ims_invoices
            WHERE client_gstin = ? AND return_period = ?
        `, [gstin, period], async (err, rows) => {
            if (err) return res.status(500).json({ success: false, error: 'Database error' });

            const safeRows = rows || [];
            // Create a lookup map: key = `${ctin}_${inum}`
            const actionMap = new Map();
            safeRows.forEach(r => {
                const key = `${(r.ctin || '').trim().toUpperCase()}_${String(r.inum || '').trim().toUpperCase()}`;
                let actCode = 'N';
                const a = (r.action || '').toUpperCase();
                if (a === 'ACCEPT' || a === 'A') actCode = 'A';
                else if (a === 'REJECT' || a === 'R') actCode = 'R';
                else if (a === 'PENDING' || a === 'P') actCode = 'P';
                else actCode = 'N';

                actionMap.set(key, {
                    action: actCode,
                    remarks: r.client_remarks || undefined
                });
            });

            // Try to find the original portal downloaded JSON/ZIP in scratch/downloads to preserve hashes & exact GSTN fields
            let originalJson = null;
            try {
                const tempDir = path.join(process.cwd(), 'scratch', 'downloads');
                if (fs.existsSync(tempDir)) {
                    const files = fs.readdirSync(tempDir);
                    const clientFiles = files
                        .filter(f => f.toUpperCase().includes(gstin.toUpperCase()) && (f.endsWith('.json') || f.endsWith('.zip')))
                        .sort((a, b) => b.localeCompare(a));

                    for (const f of clientFiles) {
                        const fullP = path.join(tempDir, f);
                        if (f.endsWith('.json')) {
                            const raw = fs.readFileSync(fullP, 'utf8');
                            const parsed = JSON.parse(raw);
                            if (parsed.imsDetails || parsed.rtin) {
                                originalJson = parsed;
                                break;
                            }
                        } else if (f.endsWith('.zip')) {
                            const zipBuf = fs.readFileSync(fullP);
                            const zip = await JSZip.loadAsync(zipBuf);
                            for (const zName of Object.keys(zip.files)) {
                                if (zName.endsWith('.json')) {
                                    const jsonStr = await zip.files[zName].async('string');
                                    const parsed = JSON.parse(jsonStr);
                                    if (parsed.imsDetails || parsed.rtin) {
                                        originalJson = parsed;
                                        break;
                                    }
                                }
                            }
                            if (originalJson) break;
                        }
                    }
                }
            } catch (scanErr) {
                console.warn('[IMS Payload] Error looking for original download:', scanErr.message);
            }

            // Build official GSTN IMS Offline Tool V2.0 upload schema:
            // Root: { "rtin": gstin, "reqtyp": "SAVE", "invdata": { "b2b": [...], "b2ba": [...], ... } }
            const invdata = {};
            let totalActed = 0;

            if (originalJson && originalJson.imsDetails) {
                // Preserves 100% of GSTN's original invoice data & maps to IMS Offline Utility V2.0 format
                const sectionMap = {
                    b2b: 'b2b',
                    b2ba: 'b2ba',
                    cdnr: 'b2bcn',
                    b2bcn: 'b2bcn',
                    cdnra: 'b2bcna',
                    b2bcna: 'b2bcna',
                    b2bdn: 'b2bdn',
                    b2bdna: 'b2bdna',
                    ecom: 'ecom',
                    ecoma: 'ecoma'
                };

                for (const sec of Object.keys(sectionMap)) {
                    const list = originalJson.imsDetails[sec];
                    if (Array.isArray(list) && list.length > 0) {
                        const targetSec = sectionMap[sec];
                        if (!invdata[targetSec]) invdata[targetSec] = [];
                        const isNote = targetSec.includes('dn') || targetSec.includes('cn');
                        const isAmended = targetSec.endsWith('a');

                        list.forEach(inv => {
                            const ctin = (inv.stin || inv.ctin || '').trim().toUpperCase();
                            const docNum = String(inv.nt_num || inv.inum || '').trim().toUpperCase();
                            const match = actionMap.get(`${ctin}_${docNum}`);
                            let act = 'N';
                            if (match && match.action) act = match.action;
                            else if (inv.action && inv.action !== 'N') act = inv.action;

                            if (act !== 'N') totalActed++;

                            const rec = {
                                stin: inv.stin || inv.ctin,
                                ...(isNote
                                    ? {
                                        ...(isAmended ? { ont_num: inv.ont_num || '', ont_dt: String(inv.ont_dt || '').replace(/\//g, '-') } : {}),
                                        nt_num: String(inv.nt_num || inv.inum || ''),
                                        inv_typ: inv.inv_typ || 'R',
                                        nt_dt: String(inv.nt_dt || inv.idt || '').replace(/\//g, '-')
                                    }
                                    : {
                                        ...(isAmended ? { oinum: inv.oinum || '', oidt: String(inv.oidt || '').replace(/\//g, '-') } : {}),
                                        inum: String(inv.inum || ''),
                                        inv_typ: inv.inv_typ || 'R',
                                        idt: String(inv.idt || '').replace(/\//g, '-')
                                    }),
                                val: Math.round(Number(inv.val || 0) * 100) / 100,
                                action: act,
                                pos: String(inv.pos || '27'),
                                txval: Math.round(Number(inv.txval || 0) * 100) / 100,
                                iamt: Math.round(Number(inv.iamt || inv.igst || 0) * 100) / 100,
                                camt: Math.round(Number(inv.camt || inv.cgst || 0) * 100) / 100,
                                samt: Math.round(Number(inv.samt || inv.sgst || 0) * 100) / 100,
                                cess: Math.round(Number(inv.cess || 0) * 100) / 100
                            };

                            // Section-specific optional fields
                            if ((targetSec === 'b2bcn' || targetSec === 'b2bcna' || targetSec === 'b2ba' || targetSec === 'b2bdna' || targetSec === 'ecoma') && inv.itcRedReq && inv.itcRedReq !== 'NA') {
                                rec.itcRedReq = inv.itcRedReq;
                                if (inv.declIgst !== undefined && inv.declIgst !== 'NA') rec.declIgst = inv.declIgst;
                                if (inv.declCgst !== undefined && inv.declCgst !== 'NA') rec.declCgst = inv.declCgst;
                                if (inv.declSgst !== undefined && inv.declSgst !== 'NA') rec.declSgst = inv.declSgst;
                                if (inv.declCess !== undefined && inv.declCess !== 'NA') rec.declCess = inv.declCess;
                            }

                            if (match && match.remarks && inv.isRemarksBlocked !== 'Y' && match.remarks !== 'NA') {
                                rec.remarks = match.remarks;
                            } else if (inv.remarks && inv.remarks !== 'NA') {
                                rec.remarks = inv.remarks;
                            }

                            rec.srcform = inv.srcform || 'R1';
                            rec.rtnprd = String(inv.rtnprd || '092026');
                            rec.srcfilstatus = inv.srcfilstatus || 'Filed';
                            rec.ispendactblocked = inv.ispendactblocked || 'N';
                            rec.isRemarksBlocked = inv.isRemarksBlocked || 'N';
                            if (targetSec === 'b2bcn' || targetSec === 'b2bcna' || targetSec === 'b2ba' || targetSec === 'b2bdna' || targetSec === 'ecoma') {
                                rec.itcRedReqBlocked = inv.itcRedReqBlocked || 'N';
                            }
                            if (inv.isEdit === 'Y') {
                                rec.isEdit = 'Y';
                            }

                            invdata[targetSec].push(rec);
                        });
                    }
                }
            } else {
                // Reconstruct from database records segregating into official GSTN sections
                const b2bList = [];
                const b2bcnList = [];
                const b2bdnList = [];
                const b2baList = [];

                safeRows.forEach(r => {
                    let actCode = 'N';
                    const a = (r.action || '').toUpperCase();
                    if (a === 'ACCEPT' || a === 'A') actCode = 'A';
                    else if (a === 'REJECT' || a === 'R') actCode = 'R';
                    else if (a === 'PENDING' || a === 'P') actCode = 'P';
                    if (actCode !== 'N') totalActed++;

                    const typUpper = (r.inv_typ || 'R').toUpperCase();
                    const srcUpper = (r.source || '').toUpperCase();
                    const isCredit = typUpper === 'C' || typUpper === 'CR' || srcUpper.includes('CDNR');
                    const isDebit = typUpper === 'D' || typUpper === 'DR';
                    const isAmended = typUpper.includes('B2BA') || srcUpper.includes('1A');

                    const rec = {
                        stin: r.ctin,
                        ...(isCredit || isDebit
                            ? {
                                nt_num: String(r.inum || '').trim(),
                                inv_typ: isCredit ? 'C' : 'D',
                                nt_dt: String(r.idt || '').replace(/\//g, '-')
                            }
                            : {
                                inum: String(r.inum || '').trim(),
                                inv_typ: r.inv_typ || 'R',
                                idt: String(r.idt || '').replace(/\//g, '-')
                            }),
                        val: Math.round(Number(r.total_val || 0) * 100) / 100,
                        action: actCode,
                        pos: String(r.pos || '27'),
                        txval: Math.round(Number(r.txval || 0) * 100) / 100,
                        iamt: Math.round(Number(r.igst || 0) * 100) / 100,
                        camt: Math.round(Number(r.cgst || 0) * 100) / 100,
                        samt: Math.round(Number(r.sgst || 0) * 100) / 100,
                        cess: Math.round(Number(r.cess || 0) * 100) / 100,
                        srcform: r.source || 'R1',
                        rtnprd: String(r.source_period || '092026'),
                        srcfilstatus: 'Filed',
                        ispendactblocked: 'N',
                        isRemarksBlocked: 'N'
                    };
                    if (r.client_remarks && r.client_remarks !== 'NA') rec.remarks = r.client_remarks;

                    if (isCredit) {
                        b2bcnList.push(rec);
                    } else if (isDebit) {
                        b2bdnList.push(rec);
                    } else if (isAmended) {
                        b2baList.push(rec);
                    } else {
                        b2bList.push(rec);
                    }
                });

                if (b2bList.length > 0) invdata.b2b = b2bList;
                if (b2bcnList.length > 0) invdata.b2bcn = b2bcnList;
                if (b2bdnList.length > 0) invdata.b2bdn = b2bdnList;
                if (b2baList.length > 0) invdata.b2ba = b2baList;
            }

            const now = new Date();
            const day = String(now.getDate()).padStart(2, '0');
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const year = now.getFullYear();
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const seconds = String(now.getSeconds()).padStart(2, '0');
            const dateStr = `${day}${month}${year}`;
            const timeStr = `${hours}_${minutes}_${seconds}`;

            const finalPayload = {
                rtin: gstin,
                reqtyp: 'SAVE',
                invdata: invdata
            };

            res.json({
                success: true,
                gstin,
                period,
                totalActions: totalActed,
                payload: finalPayload,
                filename: `${dateStr}_${timeStr}_${gstin}_IMS_Output_JSON.json`
            });
        });
    });

    // ─── 12. FETCH CLIENT CREDENTIALS VAULT ───────────────────────────────────
    app.get('/api/ims/credentials', (req, res) => {
        db.all(`
            SELECT id, gstin, trade_name, legal_name, phone, email, portal_username, portal_password
            FROM clients
            ORDER BY trade_name COLLATE NOCASE ASC
        `, [], (err, rows) => {
            if (err) return res.status(500).json({ success: false, error: 'Database error fetching credentials' });

            const safeRows = rows || [];
            const configured = safeRows.filter(r => r.portal_username && r.portal_password).length;

            res.json({
                success: true,
                total: safeRows.length,
                configured,
                missing: safeRows.length - configured,
                clients: safeRows
            });
        });
    });

    // ─── 13. UPDATE SINGLE CLIENT CREDENTIALS ─────────────────────────────────
    app.post('/api/ims/credentials/update', (req, res) => {
        const { gstin, portal_username, portal_password, phone, email, trade_name } = req.body;
        if (!gstin) return res.status(400).json({ success: false, error: 'gstin is required' });

        const cleanGstin = String(gstin).trim().toUpperCase();
        const id = randomUUID();
        const cleanUser = portal_username !== undefined ? String(portal_username).trim() : null;
        const cleanPass = portal_password !== undefined ? String(portal_password).trim() : null;
        const cleanPhone = phone !== undefined ? String(phone).trim() : null;
        const cleanEmail = email !== undefined ? String(email).trim() : null;
        const cleanTrade = trade_name !== undefined ? String(trade_name).trim() : null;

        db.run(`
            INSERT INTO clients (id, gstin, trade_name, legal_name, phone, email, portal_username, portal_password)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(gstin) DO UPDATE SET
                portal_username = COALESCE(?, portal_username),
                portal_password = COALESCE(?, portal_password),
                phone = COALESCE(?, phone),
                email = COALESCE(?, email),
                trade_name = COALESCE(?, trade_name)
        `, [
            id,
            cleanGstin,
            cleanTrade || cleanGstin,
            cleanTrade || cleanGstin,
            cleanPhone,
            cleanEmail,
            cleanUser,
            cleanPass,
            cleanUser,
            cleanPass,
            cleanPhone,
            cleanEmail,
            cleanTrade
        ], function(err) {
            if (err) return res.status(500).json({ success: false, error: 'Failed updating client credentials' });
            res.json({ success: true, message: 'Credentials updated successfully', changes: this.changes });
        });
    });

    // ─── 13b. DELETE A CLIENT ──────────────────────────────────────────────────
    app.delete('/api/ims/clients/:gstin', (req, res) => {
        const { gstin } = req.params;
        if (!gstin) return res.status(400).json({ success: false, error: 'gstin is required' });

        db.serialize(() => {
            db.run('DELETE FROM clients WHERE gstin = ?', [gstin]);
            db.run('DELETE FROM ims_batches WHERE client_gstin = ?', [gstin]);
            db.run('DELETE FROM ims_invoices WHERE client_gstin = ?', [gstin]);
            db.run('DELETE FROM ims_review_tokens WHERE client_gstin = ?', [gstin], function(err) {
                if (err) return res.status(500).json({ success: false, error: 'Failed deleting client' });
                res.json({ success: true, message: `Client ${gstin} deleted successfully` });
            });
        });
    });

    // ─── 14. BULK IMPORT CREDENTIALS FROM EXCEL/JSON ──────────────────────────
    app.post('/api/ims/credentials/bulk-import', (req, res) => {
        const { clients, deleteMissing = true } = req.body;
        if (!Array.isArray(clients) || clients.length === 0) {
            return res.status(400).json({ success: false, error: 'clients array is required' });
        }

        // Map valid clients by GSTIN
        const validClientsMap = new Map();
        for (const c of clients) {
            const gstin = String(c.gstin || '').trim().toUpperCase().replace(/[\s-]/g, '');
            if (gstin && gstin.length >= 10) {
                validClientsMap.set(gstin, c);
            }
        }

        if (validClientsMap.size === 0) {
            return res.status(400).json({ success: false, error: 'No valid GSTINs found in imported clients' });
        }

        db.all('SELECT gstin FROM clients', (err, existingRows) => {
            if (err) return res.status(500).json({ success: false, error: 'Failed reading existing clients' });

            const existingGstins = new Set((existingRows || []).map(r => r.gstin));
            const toDeleteGstins = deleteMissing
                ? Array.from(existingGstins).filter(g => !validClientsMap.has(g))
                : [];

            let addedCount = 0;
            let updatedCount = 0;

            for (const gstin of validClientsMap.keys()) {
                if (existingGstins.has(gstin)) {
                    updatedCount++;
                } else {
                    addedCount++;
                }
            }

            db.serialize(() => {
                db.run('BEGIN TRANSACTION');

                // 1. Delete clients missing from sheet (if deleteMissing enabled)
                if (toDeleteGstins.length > 0) {
                    const deleteClientStmt = db.prepare('DELETE FROM clients WHERE gstin = ?');
                    const deleteBatchesStmt = db.prepare('DELETE FROM ims_batches WHERE client_gstin = ?');
                    const deleteInvoicesStmt = db.prepare('DELETE FROM ims_invoices WHERE client_gstin = ?');
                    const deleteTokensStmt = db.prepare('DELETE FROM ims_review_tokens WHERE client_gstin = ?');

                    for (const g of toDeleteGstins) {
                        deleteClientStmt.run(g);
                        deleteBatchesStmt.run(g);
                        deleteInvoicesStmt.run(g);
                        deleteTokensStmt.run(g);
                    }

                    deleteClientStmt.finalize();
                    deleteBatchesStmt.finalize();
                    deleteInvoicesStmt.finalize();
                    deleteTokensStmt.finalize();
                }

                // 2. Upsert all clients from the sheet (altering every detail as per sheet)
                const upsertStmt = db.prepare(`
                    INSERT INTO clients (id, gstin, trade_name, legal_name, phone, email, portal_username, portal_password)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(gstin) DO UPDATE SET
                        trade_name = excluded.trade_name,
                        legal_name = excluded.legal_name,
                        phone = excluded.phone,
                        email = excluded.email,
                        portal_username = excluded.portal_username,
                        portal_password = excluded.portal_password
                `);

                for (const [gstin, c] of validClientsMap.entries()) {
                    const id = c.id || randomUUID();
                    const cleanTrade = String(c.trade_name || c.tradeName || c.legal_name || c.legalName || '').trim() || gstin;
                    const cleanLegal = String(c.legal_name || c.legalName || c.trade_name || c.tradeName || '').trim() || cleanTrade;
                    const cleanPhone = String(c.phone || '').trim().replace(/\.0$/, '');
                    const cleanEmail = String(c.email || '').trim();
                    const cleanUser = String(c.portal_username || c.portalUsername || '').trim();
                    const cleanPass = String(c.portal_password || c.portalPassword || '').trim();

                    upsertStmt.run([
                        id,
                        gstin,
                        cleanTrade,
                        cleanLegal,
                        cleanPhone,
                        cleanEmail,
                        cleanUser,
                        cleanPass
                    ]);
                }

                upsertStmt.finalize();

                db.run('COMMIT', (commitErr) => {
                    if (commitErr) return res.status(500).json({ success: false, error: 'Commit failed on bulk credentials import' });
                    res.json({
                        success: true,
                        message: `Successfully synchronized ${validClientsMap.size} clients (${toDeleteGstins.length} deleted, ${addedCount} added, ${updatedCount} altered)`,
                        importedCount: validClientsMap.size,
                        deletedCount: toDeleteGstins.length,
                        addedCount,
                        updatedCount
                    });
                });
            });
        });
    });

    // ─── 14b. DIRECT ARCHIVE UPLOAD (ZIP / XLSX / JSON) ────────────────────────
    app.post('/api/ims/upload-archive', async (req, res) => {
        const { fileBase64, fileName, gstin, period } = req.body;
        if (!fileBase64 || !fileName) {
            return res.status(400).json({ success: false, error: 'fileBase64 and fileName are required' });
        }

        const buffer = Buffer.from(fileBase64, 'base64');
        const returnPeriod = period || 'November 2025';

        // Extract target GSTIN from parameter, or detect from filename (e.g. IMS_27AZNPB4348J1Z4_12102026_1.zip)
        let targetGstin = gstin;
        if (!targetGstin) {
            const match = fileName.match(/\b\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}\b/);
            if (match) targetGstin = match[0];
        }

        let invoices = [];
        const lower = fileName.toLowerCase();
        if (lower.endsWith('.zip')) {
            invoices = await parseImsZipHelper(buffer, targetGstin || '', returnPeriod);
        } else if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
            invoices = parseImsExcelHelper(buffer, targetGstin || '', returnPeriod);
        } else if (lower.endsWith('.json')) {
            try {
                const jsonObj = JSON.parse(buffer.toString('utf8'));
                if (!targetGstin && jsonObj.gstin) targetGstin = jsonObj.gstin;
                invoices = parseImsJsonHelper(jsonObj, targetGstin || '', returnPeriod);
            } catch (e) {
                return res.status(400).json({ success: false, error: 'Invalid JSON file content' });
            }
        }

        if (invoices.length === 0) {
            return res.status(400).json({ success: false, error: 'No valid inward invoices found in uploaded file' });
        }

        if (!targetGstin && invoices[0]?.client_gstin) {
            targetGstin = invoices[0].client_gstin;
        }
        if (!targetGstin) {
            targetGstin = 'PORTAL_IMPORT';
        }

        const batchId = randomUUID();
        const now = Date.now();

        await new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                db.run(`
                    INSERT INTO ims_batches (id, client_gstin, return_period, status, created_at, updated_at)
                    VALUES (?, ?, ?, 'SYNCED', ?, ?)
                    ON CONFLICT(client_gstin, return_period) DO UPDATE SET updated_at = ?
                `, [batchId, targetGstin, returnPeriod, now, now, now]);

                const insertStmt = db.prepare(`
                    INSERT INTO ims_invoices (
                        id, batch_id, client_gstin, return_period, ctin, supplier_name,
                        inum, idt, inv_typ, pos, rchrg, txval, igst, cgst, sgst, cess, total_val,
                        source, source_period, action, client_remarks, reviewed_at, reviewed_by
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(client_gstin, return_period, ctin, inum, idt) DO UPDATE SET
                        batch_id = excluded.batch_id,
                        supplier_name = excluded.supplier_name,
                        txval = excluded.txval,
                        igst = excluded.igst,
                        cgst = excluded.cgst,
                        sgst = excluded.sgst,
                        cess = excluded.cess,
                        total_val = excluded.total_val,
                        source = excluded.source,
                        source_period = excluded.source_period
                `);

                for (const inv of invoices) {
                    insertStmt.run([
                        randomUUID(), batchId, targetGstin, returnPeriod,
                        inv.ctin, inv.supplier_name, inv.inum, inv.idt,
                        inv.inv_typ || 'R', inv.pos || '', inv.rchrg || 'N',
                        inv.txval, inv.igst, inv.cgst, inv.sgst, inv.cess, inv.total_val,
                        inv.source || 'GSTR-1', inv.source_period || returnPeriod,
                        inv.action || 'NO_ACTION', null, null, null
                    ], (rErr) => {
                        if (rErr) console.warn('[IMS Ingestion] Single upload row warning:', rErr.message);
                    });
                }
                insertStmt.finalize();
                db.run('COMMIT', (err) => {
                    if (err) return reject(err);
                    resolve(true);
                });
            });
        });

        await recalculateBatchMetrics(targetGstin, returnPeriod);

        res.json({
            success: true,
            message: `Successfully ingested ${invoices.length} inward records from ${fileName}!`,
            gstin: targetGstin,
            period: returnPeriod,
            invoiceCount: invoices.length
        });
    });

    // ─── 15. LIVE BROWSER IMS AUTOMATION VIA PLAYWRIGHT ─────────────────────────
    app.post('/api/ims/portal-sync-browser', async (req, res) => {
        const { gstin, period, username: customUser, password: customPass, phase } = req.body;
        if (!gstin) {
            return res.status(400).json({ success: false, error: 'gstin is required' });
        }

        const returnPeriod = period || 'November 2025';

        // 1. Resolve username & password from DB if not supplied in body
        let portalUser = customUser;
        let portalPass = customPass;
        let tradeName = '';

        const clientRow = await new Promise((resolve) => {
            db.get('SELECT trade_name, portal_username, portal_password FROM clients WHERE gstin = ?', [gstin], (err, row) => {
                resolve(row || null);
            });
        });

        if (clientRow) {
            tradeName = clientRow.trade_name || '';
            if (!portalUser) portalUser = clientRow.portal_username || '';
            if (!portalPass) portalPass = clientRow.portal_password || '';
        }

        // Check if generation was already requested for this client & period
        const batchRow = await new Promise((resolve) => {
            db.get('SELECT status, generation_status, generation_requested_at FROM ims_batches WHERE client_gstin = ? AND return_period = ?', [gstin, returnPeriod], (err, row) => {
                resolve(row || null);
            });
        });

        const reqPhase = String(phase || '').toUpperCase();
        let isPhase2 = reqPhase === 'PHASE_2';
        if (!isPhase2 && reqPhase !== 'PHASE_1' && batchRow) {
            if (batchRow.generation_status === 'REQUESTED' || 
                batchRow.generation_status === 'READY' || 
                batchRow.status === 'REQUESTED_WAITING') {
                isPhase2 = true;
            } else if (batchRow.generation_requested_at && (Date.now() - batchRow.generation_requested_at < 24 * 60 * 60 * 1000)) {
                isPhase2 = true;
            }
        }
        console.log(`[IMS Automation] Automation session for ${gstin} (${returnPeriod}). Execution Phase: ${isPhase2 ? 'PHASE_2 (Collect Ready Download)' : 'PHASE_1 (Generate Request)'}`);

        // 2. Launch Playwright Chromium in headed mode
        let playwright;
        try {
            playwright = await import('playwright');
        } catch (e) {
            return res.status(500).json({
                success: false,
                error: 'Playwright is not available on this server.'
            });
        }

        if (activeBrowserInstance) {
            console.log('[IMS Automation] Terminating existing browser session before launching new...');
            try {
                await activeBrowserInstance.close().catch(() => {});
            } catch (e) {}
            activeBrowserInstance = null;
        }

        let browser;
        try {
            console.log(`[IMS Automation] Launching visible browser for GSTIN ${gstin}...`);
            const browserLaunchOptions = {
                headless: false,
                slowMo: 300,
                args: [
                    '--start-maximized',
                    '--disable-blink-features=AutomationControlled',
                    '--no-sandbox',
                    '--no-first-run',
                    '--no-default-browser-check'
                ]
            };

            // Strategy: Directly launch dedicated visible browser (bundled Chromium pops up independently of user's personal Chrome session)
            try {
                browser = await playwright.chromium.launch(browserLaunchOptions);
                console.log('[IMS Automation] Launched dedicated bundled Chromium');
            } catch (e) {
                try {
                    browser = await playwright.chromium.launch({ ...browserLaunchOptions, channel: 'msedge' });
                    console.log('[IMS Automation] Launched system Microsoft Edge');
                } catch (edgeErr) {
                    browser = await playwright.chromium.launch({ ...browserLaunchOptions, channel: 'chrome' });
                    console.log('[IMS Automation] Launched system Google Chrome');
                }
            }

            const context = await browser.newContext({ viewport: null, acceptDownloads: true });
            const page = await context.newPage();

            // Close browser cleanly if user aborts HTTP request from UI
            req.on('close', async () => {
                if (browser && !capturedJson) {
                    console.log('[IMS Automation] Request cancelled by user, closing browser');
                    await browser.close().catch(() => {});
                }
            });

            await page.bringToFront().catch(() => {});

            const browserPid = browser && typeof browser.process === 'function' ? browser.process()?.pid : null;
            // Helper to bring the browser to foreground on Windows desktop
            const focusDesktopWindow = () => {
                try {
                    let psParts = ['$wshell = New-Object -ComObject WScript.Shell; $wshell.SendKeys(\'%\');'];
                    if (browserPid) {
                        psParts.push(`$wshell.AppActivate(${browserPid});`);
                    }
                    psParts.push(`$wshell.AppActivate('Goods & Services Tax');`);
                    psParts.push(`$wshell.AppActivate('Goods and Services Tax');`);
                    psParts.push(`$wshell.AppActivate('Goods & Services Tax (GST) | Login');`);
                    psParts.push(`$wshell.AppActivate('GST | Login');`);
                    psParts.push(`$wshell.AppActivate('Login');`);
                    const psCmd = `powershell -NoProfile -Command "${psParts.join(' ')}"`;
                    exec(psCmd, () => {});
                } catch (e) {}
            };

            let capturedJson = null;

            // Intercept REST responses from the GST Portal for IMS / Inward supplies
            page.on('response', async (response) => {
                try {
                    const url = response.url().toLowerCase();
                    if ((url.includes('/ims/') || url.includes('inward') || url.includes('getinward') || url.includes('/supplies/')) &&
                        (response.request().resourceType() === 'xhr' || response.request().resourceType() === 'fetch')) {
                        const ct = response.headers()['content-type'] || '';
                        if (ct.includes('application/json')) {
                            const json = await response.json().catch(() => null);
                            if (json && (json.b2b || json.sec_list || json.invoices || Array.isArray(json))) {
                                console.log('[IMS Automation] Captured IMS inward API response from portal stream!');
                                capturedJson = json;
                            }
                        }
                    }
                } catch (err) {
                    // Ignore streaming / non-JSON responses
                }
            });

            // Listen for file download event (ZIP, JSON or Excel exported by portal)
            page.on('download', async (download) => {
                try {
                    const fileName = download.suggestedFilename();
                    console.log(`[IMS Automation] Detected download event: ${fileName}`);
                    const tempDir = path.join(process.cwd(), 'scratch', 'downloads');
                    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
                    const filePath = path.join(tempDir, `${gstin}_${Date.now()}_${fileName}`);
                    await download.saveAs(filePath);
                    console.log(`[IMS Automation] Saved download to ${filePath}`);

                    if (fileName.toLowerCase().endsWith('.zip')) {
                        console.log(`[IMS Automation] Detected ZIP download: ${fileName}. Extracting & parsing...`);
                        const zipInvoices = await parseImsZipHelper(filePath, gstin, returnPeriod);
                        if (zipInvoices.length > 0) {
                            capturedJson = zipInvoices;
                            console.log(`[IMS Automation] Successfully extracted ${zipInvoices.length} invoices from ZIP archive!`);
                        }
                    } else if (fileName.toLowerCase().endsWith('.json')) {
                        const content = fs.readFileSync(filePath, 'utf8');
                        capturedJson = JSON.parse(content);
                    } else if (fileName.toLowerCase().endsWith('.xlsx') || fileName.toLowerCase().endsWith('.xls')) {
                        console.log(`[IMS Automation] Parsing downloaded Excel file: ${fileName}`);
                        const excelInvoices = parseImsExcelHelper(filePath, gstin, returnPeriod);
                        if (excelInvoices.length > 0) {
                            capturedJson = excelInvoices;
                        }
                    }
                } catch (err) {
                    console.error('[IMS Automation] Error saving/parsing downloaded file:', err);
                }
            });

            // Navigate to GST Portal Login if not already there
            if (!page.url().includes('services.gst.gov.in/services/login')) {
                console.log(`[IMS Automation] Navigating to GST login for ${gstin}...`);
                await page.goto('https://services.gst.gov.in/services/login', { waitUntil: 'domcontentloaded', timeout: 35000 });
            }
            await page.bringToFront().catch(() => {});
            focusDesktopWindow();

            // Wait for AngularJS login form to mount & auto-fill Username & Password
            try {
                await page.waitForSelector('#username', { timeout: 15000 });
                if (portalUser) {
                    await page.fill('#username', portalUser);
                }
                if (portalPass) {
                    await page.waitForSelector('#user_pass', { timeout: 5000 });
                    await page.fill('#user_pass', portalPass);
                }
                // Focus CAPTCHA field so staff can immediately type
                await page.focus('#captcha').catch(() => {});
                focusDesktopWindow();
            } catch (e) {
                console.log('[IMS Automation] Notice waiting for login inputs:', e.message);
            }

            // Inject assistive guidance overlay banner
            await page.evaluate(({ clientName, clientGstin, hasCreds }) => {
                const banner = document.createElement('div');
                banner.id = 'antigravity-ims-banner';
                banner.style.cssText = `
                    position: fixed; top: 0; left: 0; right: 0; z-index: 9999999;
                    background: linear-gradient(135deg, #0f172a, #1e293b);
                    color: #f8fafc; padding: 10px 18px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                    font-size: 13px; font-weight: 500; display: flex; justify-content: space-between; align-items: center;
                    border-bottom: 3px solid #6366f1; box-shadow: 0 4px 20px rgba(0,0,0,0.4);
                `;
                banner.innerHTML = `
                    <div style="display:flex;align-items:center;gap:10px;">
                        <span style="background:#6366f1;color:#fff;font-size:10px;font-weight:bold;padding:3px 8px;border-radius:6px;text-transform:uppercase;">
                            ⚡ Antigravity IMS Sync
                        </span>
                        <span>
                            ${hasCreds ? 'Credentials auto-filled from Vault! Please enter the visual CAPTCHA & click Login.' : 'Please enter your Login details & CAPTCHA.'}
                        </span>
                    </div>
                    <div style="font-size:12px;color:#94a3b8;font-family:monospace;">
                        Client: <strong style="color:#38bdf8;">${clientName || clientGstin}</strong> (${clientGstin})
                    </div>
                `;
                document.body.prepend(banner);
            }, { clientName: tradeName, clientGstin: gstin, hasCreds: Boolean(portalUser && portalPass) });

            // Wait for user to complete login (URL MUST change away from /login and contain /auth/ or /dashboard, 180s)
            console.log('[IMS Automation] Waiting for user to complete CAPTCHA & login...');
            await page.waitForFunction(() => {
                const url = window.location.href;
                const isAuth = url.includes('/auth/') || url.includes('/dashboard');
                const isNotLogin = !url.includes('/login');
                const hasNoLoginInputs = !document.querySelector('#username') && !document.querySelector('#user_pass');
                return (isAuth && isNotLogin) || (isNotLogin && hasNoLoginInputs);
            }, null, { timeout: 180000 });

            console.log('[IMS Automation] User logged in successfully!');

            // Update banner
            await page.evaluate(() => {
                const banner = document.getElementById('antigravity-ims-banner');
                if (banner) {
                    banner.innerHTML = `
                        <div style="display:flex;align-items:center;gap:10px;">
                            <span style="background:#10b981;color:#fff;font-size:10px;font-weight:bold;padding:3px 8px;border-radius:6px;">
                                ✓ LOGGED IN
                            </span>
                            <span>Auto-navigating to <strong>Invoice Management System (IMS)</strong>...</span>
                        </div>
                    `;
                }
            });

            await page.waitForTimeout(2000);

            // Auto-dismiss common GST portal popups (Remind Me Later / Close)
            try {
                const remindLaterBtn = page.locator('button:has-text("Remind Me Later"), a:has-text("Remind Me Later"), button:has-text("Remind me later")').first();
                if (await remindLaterBtn.isVisible({ timeout: 2500 })) {
                    await remindLaterBtn.click();
                    console.log('[IMS Automation] Dismissed "Remind Me Later" popup');
                }
            } catch (e) {}

            try {
                const closeBtn = page.locator('.modal-header .close, button:has-text("Close"), button[aria-label="Close"]').first();
                if (await closeBtn.isVisible({ timeout: 2500 })) {
                    await closeBtn.click();
                    console.log('[IMS Automation] Dismissed modal popup');
                }
            } catch (e) {}

            await page.waitForTimeout(1000);

            // Update banner with active status
            await page.evaluate(() => {
                const banner = document.getElementById('antigravity-ims-banner');
                if (banner) {
                    banner.innerHTML = `
                        <div style="display:flex;align-items:center;gap:12px;">
                            <span style="background:#10b981;color:#fff;font-size:11px;font-weight:bold;padding:4px 10px;border-radius:6px;">
                                ⚡ AUTOPILOT ACTIVE
                            </span>
                            <span style="font-size:13px;">
                                Navigating to IMS & Inward Supplies... If needed, you can click <strong>&quot;Download Details&quot;</strong> anytime. Antigravity captures automatically!
                            </span>
                        </div>
                    `;
                }
            });

            const startTime = Date.now();
            const gstinUpper = (gstin || '').trim().toUpperCase();

            // Helper to check disk for recent download (scratch folder or user Downloads folder for ZIP, JSON, or Excel)
            const checkDiskForDownload = async () => {
                const checkFolder = async (folderPath) => {
                    if (!fs.existsSync(folderPath)) return null;
                    let files = [];
                    try { files = fs.readdirSync(folderPath); } catch (e) { return null; }

                    const matchingFiles = files
                        .filter(f => {
                            const lower = f.toLowerCase();
                            const isExt = lower.endsWith('.zip') || lower.endsWith('.json') || lower.endsWith('.xlsx');
                            if (!isExt) return false;

                            // Check if the filename contains ANY 15-character GSTIN
                            const fileGstinMatch = f.match(/\b\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}\b/i);
                            if (fileGstinMatch) {
                                // MUST strictly belong to the current client! Never grab another client's file!
                                return fileGstinMatch[0].toUpperCase() === gstinUpper;
                            }

                            // If no GSTIN is in filename, only accept generic IMS download if created during this session
                            const isGenericMatch = lower.includes('ims') || lower.includes('inward') || lower.startsWith('ims_');
                            return isGenericMatch;
                        })
                        .map(f => {
                            try {
                                return { path: path.join(folderPath, f), time: fs.statSync(path.join(folderPath, f)).mtimeMs, name: f };
                            } catch (e) {
                                return null;
                            }
                        })
                        .filter(f => f !== null && f.time >= (startTime - 5000))
                        .sort((a, b) => b.time - a.time);

                    for (const item of matchingFiles.slice(0, 5)) {
                        const lower = item.name.toLowerCase();
                        try {
                            if (lower.endsWith('.zip')) {
                                const invs = await parseImsZipHelper(item.path, gstinUpper, returnPeriod);
                                if (invs && invs.length > 0) return invs;
                            } else if (lower.endsWith('.json')) {
                                const raw = JSON.parse(fs.readFileSync(item.path, 'utf8'));
                                const invs = parseImsJsonHelper(raw, gstinUpper, returnPeriod);
                                if (invs && invs.length > 0) return invs;
                            } else if (lower.endsWith('.xlsx')) {
                                const invs = parseImsExcelHelper(item.path, gstinUpper, returnPeriod);
                                if (invs && invs.length > 0) return invs;
                            }
                        } catch (e) {}
                    }
                    return null;
                };

                // Check scratch downloads folder
                const scratchRes = await checkFolder(path.join(process.cwd(), 'scratch', 'downloads'));
                if (scratchRes) return scratchRes;

                // Check Windows user Downloads folder
                const userRes = await checkFolder(path.join(os.homedir(), 'Downloads'));
                if (userRes) return userRes;

                return null;
            };
            let lastNavStep = '';
            let isGenerationRequested = false;
            let generationRequestedTimestamp = null;

            while (!capturedJson && (Date.now() - startTime < 180000)) {
                if (page.isClosed()) {
                    console.log('[IMS Automation] Browser window was closed by user');
                    break;
                }

                // Check disk immediately
                const diskInvoices = await checkDiskForDownload();
                if (diskInvoices && diskInvoices.length > 0) {
                    console.log(`[IMS Automation] Detected and extracted ${diskInvoices.length} invoices from downloaded file!`);
                    capturedJson = diskInvoices;
                    break;
                }

                try {
                    const currentUrl = page.url();
                    console.log(`[IMS Automation] Current Portal URL: ${currentUrl}`);

                    // ─── HELPER: Update On-Screen Assistive Banner ───
                    const updateStatusBanner = async (stepText, color = '#6366f1') => {
                        await page.evaluate(({ stepText, color }) => {
                            const b = document.getElementById('antigravity-ims-banner');
                            if (b) {
                                b.innerHTML = `
                                    <div style="display:flex;align-items:center;gap:12px;">
                                        <span style="background:${color};color:#fff;font-size:11px;font-weight:bold;padding:4px 10px;border-radius:6px;box-shadow:0 2px 6px rgba(0,0,0,0.2);">
                                            ⚡ AUTOPILOT
                                        </span>
                                        <span style="font-size:13px;font-weight:500;">
                                            ${stepText}
                                        </span>
                                    </div>
                                    <div style="font-size:11px;color:#94a3b8;">
                                        Manual override: You can click &quot;Download Details&quot; anytime
                                    </div>
                                `;
                            }
                        }, { stepText, color }).catch(() => {});
                    };

                    // ─── 0. AUTO-DISMISS BLOCKING POPUPS / MODALS ───
                    await page.evaluate(() => {
                        // Dismiss common popups
                        const btns = Array.from(document.querySelectorAll('button, a, input[type="button"]'));
                        const dismiss = btns.find(b => {
                            const t = (b.textContent || b.value || '').toUpperCase();
                            return t.includes('REMIND ME LATER') || t.includes('MAYBE LATER') || t === 'CLOSE' || (b.className || '').includes('close');
                        });
                        if (dismiss) dismiss.click();

                        // Force dismiss backdrop if stuck
                        const backdrops = document.querySelectorAll('.modal-backdrop');
                        if (backdrops.length > 0) {
                            const closeBtn = document.querySelector('.modal.in button.close, .modal.in button');
                            if (closeBtn) closeBtn.click();
                        }
                    }).catch(() => {});

                    // ─── STEP 1: ON HOME PAGE (/auth/home) -> GO TO DASHBOARD ───
                    const isHomePage = currentUrl.includes('/auth/home') || 
                        (!currentUrl.includes('/dashboard') && !currentUrl.includes('/ims') && !currentUrl.includes('inward'));

                    if (isHomePage) {
                        console.log('[IMS Automation] Step 1: Detected Home Page -> Clicking "Dashboard"...');
                        await updateStatusBanner('Step 1/7: On Home Page ➔ Clicking "Dashboard"...', '#f59e0b');

                        let clickedDashboard = false;

                        // Try finding Dashboard link or button
                        try {
                            const dashLoc = page.locator('ul.navbar-nav li a[href*="dashboard"], a:has-text("Dashboard"), button:has-text("CONTINUE TO DASHBOARD"), a:has-text("CONTINUE TO DASHBOARD"), button:has-text("Dashboard"), a[href*="dashboard"]').first();
                            if (await dashLoc.isVisible({ timeout: 1500 })) {
                                await dashLoc.click();
                                clickedDashboard = true;
                                console.log('[IMS Automation] Clicked Dashboard button via Playwright locator');
                            }
                        } catch (e) {}

                        // Fallback DOM click
                        if (!clickedDashboard) {
                            await page.evaluate(() => {
                                const elements = Array.from(document.querySelectorAll('a, button, li'));
                                const dash = elements.find(el => {
                                    const t = (el.innerText || el.textContent || '').trim().toUpperCase();
                                    const h = (el.getAttribute('href') || '').toLowerCase();
                                    return t === 'DASHBOARD' || t.includes('CONTINUE TO DASHBOARD') || h.includes('/dashboard');
                                });
                                if (dash) dash.click();
                            }).catch(() => {});
                        }

                        await page.waitForTimeout(1500);

                        // If still on /auth/home, navigate directly to /services/auth/dashboard
                        const afterDashUrl = page.url();
                        if (afterDashUrl.includes('/auth/home') || (!afterDashUrl.includes('/dashboard') && !afterDashUrl.includes('/ims'))) {
                            console.log('[IMS Automation] Navigating directly to https://services.gst.gov.in/services/auth/dashboard...');
                            await page.goto('https://services.gst.gov.in/services/auth/dashboard', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
                            await page.waitForTimeout(1500);
                        }

                        // DO NOT run Services or other steps in this cycle — wait for Dashboard to load!
                        continue;
                    }

                    // ─── STEPS 2, 3, 4: ON DASHBOARD -> SERVICES -> RETURNS -> IMS DASHBOARD ───
                    if (currentUrl.includes('/dashboard') && !currentUrl.includes('/ims') && !currentUrl.includes('inward')) {
                        console.log('[IMS Automation] Steps 2-4: On Dashboard -> Opening Services ➔ Returns ➔ IMS Dashboard...');
                        await updateStatusBanner('Steps 2-4: Opening Services ➔ Returns ➔ Invoice Management System (IMS)...', '#6366f1');

                        // Check if direct IMS tile is on Dashboard first
                        let clickedDirectIms = false;
                        try {
                            const directTile = page.locator('text="Invoice Management System", a[href*="ims"], button:has-text("IMS")').first();
                            if (await directTile.isVisible({ timeout: 1000 })) {
                                await directTile.click();
                                clickedDirectIms = true;
                                console.log('[IMS Automation] Clicked direct IMS tile on Dashboard!');
                            }
                        } catch (e) {}

                        if (!clickedDirectIms) {
                            // Step 2: Open Services dropdown (Bootstrap 3 requires parent .open and click)
                            await page.evaluate(() => {
                                const servicesLink = document.querySelector('li.dropdown.drpdwn > a') ||
                                    Array.from(document.querySelectorAll('a.dropdown-toggle, li.dropdown > a')).find(a => (a.textContent || '').trim().startsWith('Services'));
                                if (servicesLink) {
                                    servicesLink.click();
                                    if (servicesLink.parentElement) {
                                        servicesLink.parentElement.classList.add('open');
                                        const menu = servicesLink.parentElement.querySelector('.dropdown-menu');
                                        if (menu) menu.style.display = 'block';
                                    }
                                }
                            }).catch(() => {});

                            try {
                                const servicesBtn = page.locator('li.dropdown.drpdwn > a, a.dropdown-toggle:has-text("Services")').first();
                                if (await servicesBtn.isVisible({ timeout: 1000 })) {
                                    await servicesBtn.click();
                                }
                            } catch (e) {}

                            await page.waitForTimeout(400);

                            // Step 3: Hover/click Returns submenu
                            await page.evaluate(() => {
                                const retLink = Array.from(document.querySelectorAll('li.has-sub > a, .dropdown-menu > li > a')).find(a => (a.textContent || '').trim().startsWith('Returns'));
                                if (retLink) {
                                    retLink.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
                                    retLink.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
                                    retLink.click();
                                    if (retLink.parentElement) {
                                        retLink.parentElement.classList.add('open');
                                        const subMenu = retLink.parentElement.querySelector('ul, .dropdown-menu, .sub-menu');
                                        if (subMenu) subMenu.style.display = 'block';
                                    }
                                }
                            }).catch(() => {});

                            try {
                                const returnsItem = page.locator('.dropdown-menu a:has-text("Returns"), li.has-sub a:has-text("Returns")').first();
                                if (await returnsItem.isVisible({ timeout: 1000 })) {
                                    await returnsItem.hover();
                                    await returnsItem.click().catch(() => {});
                                }
                            } catch (e) {}

                            await page.waitForTimeout(400);

                            // Step 4: Click Invoice Management System (IMS) Dashboard
                            let clickedIms = false;
                            try {
                                const imsItem = page.locator('a:has-text("Invoice Management System (IMS) Dashboard"), a:has-text("Invoice Management System"), a:has-text("IMS Dashboard")').first();
                                if (await imsItem.isVisible({ timeout: 1500 })) {
                                    await imsItem.click();
                                    clickedIms = true;
                                    console.log('[IMS Automation] Clicked IMS Dashboard via locator!');
                                }
                            } catch (e) {}

                            if (!clickedIms) {
                                await page.evaluate(() => {
                                    const ims = Array.from(document.querySelectorAll('a, button')).find(a => {
                                        const t = (a.innerText || a.textContent || '').trim().toUpperCase();
                                        return t.includes('INVOICE MANAGEMENT SYSTEM') || t === 'IMS' || t.includes('IMS DASHBOARD');
                                    });
                                    if (ims) ims.click();
                                }).catch(() => {});
                            }
                        }

                        await page.waitForTimeout(2000);
                        continue;
                    }

                    // ─── CHECK 1: ARE WE ON THE OFFLINE INWARD DOWNLOAD SCREEN? (Screenshot 2 & 3) ───
                    // Detect by page text/buttons (regardless of whether URL contains 'inward')
                    const isOfflineInwardScreen = await page.evaluate(() => {
                        const bodyText = (document.body.innerText || '').toUpperCase();
                        return bodyText.includes('GENERATE JSON FILE TO DOWNLOAD') ||
                               bodyText.includes('CLICK HERE TO DOWNLOAD') ||
                               bodyText.includes('OFFLINE DOWNLOAD AND UPLOAD FOR IMS-INWARD SUPPLIES') ||
                               bodyText.includes('DOWNLOAD DATA FOR IMS- INWARD SUPPLIES');
                    }).catch(() => false);

                    if (isOfflineInwardScreen) {
                        console.log(`[IMS Automation] Detected Offline Download Screen (isPhase2=${isPhase2})...`);

                        await updateStatusBanner(
                            isPhase2 
                                ? 'Phase 2: Locating generated IMS download link on GST Portal...' 
                                : 'Checking for ready download link or requesting generation...', 
                            '#10b981'
                        );

                        // Allow Angular 2.5 seconds to fetch & populate the generated files table via AJAX
                        await page.waitForTimeout(2500);

                        // Priority Step: Find and click "Click here to download file" link
                        let clickedDlLink = false;
                        const dlLocators = [
                            'table tr td a:has-text("Click here to download file")',
                            'table tr td a:has-text("Click here to download")',
                            'table tr td a:has-text("Click here")',
                            'table tr td a:has-text("Download file")',
                            'table tr td a:has-text("Download JSON")',
                            'table tbody tr td a',
                            'table tr td a',
                            'a:has-text("Click here to download file")',
                            'a:has-text("Click here to download")'
                        ];

                        for (const sel of dlLocators) {
                            try {
                                const dlEl = page.locator(sel).first();
                                if (await dlEl.isVisible({ timeout: 1000 })) {
                                    const text = (await dlEl.innerText().catch(() => '')).trim();
                                    const isNavTab = await dlEl.evaluate(el => Boolean(el.closest('.nav-tabs, .nav, ul.nav, .nav-item, h1, h2, h3, h4, h5'))).catch(() => false);
                                    if (!isNavTab && text.toLowerCase() !== 'download' && text.toLowerCase() !== 'upload' && !text.toLowerCase().includes('download data for ims')) {
                                        console.log(`[IMS Automation] Found ready file download link via locator "${sel}" (text: "${text}")! Clicking now...`);
                                        await updateStatusBanner('Step 7/7: Clicking "Click here to download file"...', '#10b981');
                                        await dlEl.click({ force: true });
                                        clickedDlLink = true;
                                        break;
                                    }
                                }
                            } catch (e) {}
                        }

                        // DOM fallback for download link (strictly inside table rows or matching exact "Click here to download" link text)
                        if (!clickedDlLink) {
                            clickedDlLink = await page.evaluate(() => {
                                const tableLinks = Array.from(document.querySelectorAll('table tbody tr td a, table tr td a'));
                                const tblDl = tableLinks.find(el => {
                                    if (el.closest('.nav, .nav-tabs, ul, h1, h2, h3, h4')) return false;
                                    const t = (el.innerText || el.textContent || '').trim().toLowerCase();
                                    return t.includes('download') || t.includes('click here');
                                });
                                if (tblDl) {
                                    tblDl.click();
                                    return true;
                                }

                                const allLinks = Array.from(document.querySelectorAll('a'));
                                const clickHere = allLinks.find(el => {
                                    if (el.closest('.nav, .nav-tabs, ul, h1, h2, h3, h4')) return false;
                                    const t = (el.innerText || el.textContent || '').trim().toLowerCase();
                                    return t.includes('click here to download file') || t.includes('click here to download');
                                });
                                if (clickHere) {
                                    clickHere.click();
                                    return true;
                                }

                                return false;
                            }).catch(() => false);

                            if (clickedDlLink) {
                                console.log('[IMS Automation] Clicked "Click here to download file" via DOM fallback!');
                                await updateStatusBanner('Step 7/7: Clicking "Click here to download file"...', '#10b981');
                            }
                        }

                        // If download link was triggered, wait for file to download
                        if (clickedDlLink) {
                            console.log('[IMS Automation] Triggered download! Waiting up to 10s for file capture / disk arrival...');
                            for (let w = 0; w < 10; w++) {
                                await page.waitForTimeout(1000);
                                if (capturedJson) break;
                                const diskInvs = await checkDiskForDownload();
                                if (diskInvs && diskInvs.length > 0) {
                                    capturedJson = diskInvs;
                                    break;
                                }
                            }
                            if (capturedJson) {
                                console.log('[IMS Automation] File successfully captured!');
                                break;
                            }
                            await page.waitForTimeout(2000);
                            continue;
                        }

                        // ─── STRICT PHASE 2 RULE: NEVER CLICK "GENERATE JSON FILE TO DOWNLOAD" ───
                        if (isPhase2) {
                            console.log('[IMS Automation] [Phase 2] Download link not yet visible. Checking if portal table is still loading or compiling...');

                            const stillProcessing = await page.evaluate(() => {
                                const text = (document.body.innerText || '').toUpperCase();
                                return text.includes('IN PROGRESS') || 
                                       text.includes('BEING PROCESSED') || 
                                       text.includes('UNDER PROCESS') ||
                                       text.includes('REQUEST IS IN PROGRESS');
                            }).catch(() => false);

                            if (stillProcessing) {
                                console.log('[IMS Automation] [Phase 2] GST Portal indicates file is still compiling. Waiting 4s before re-checking...');
                                await updateStatusBanner('⏳ GST Portal is still compiling file. Waiting for download link to appear...', '#f59e0b');
                                await page.waitForTimeout(4000);
                                continue;
                            }

                            // Do NOT click generate button in Phase 2
                            console.log('[IMS Automation] [Phase 2] Waiting for table to render download link...');
                            await updateStatusBanner('⏳ Phase 2: Waiting for generated download link in table...', '#10b981');
                            await page.waitForTimeout(3000);
                            continue;
                        }

                        // ─── PHASE 1 ONLY: CHECK IF ALREADY IN PROGRESS BEFORE CLICKING GENERATE ───
                        const alreadyInProgress = await page.evaluate(() => {
                            const text = (document.body.innerText || '').toUpperCase();
                            return text.includes('IN PROGRESS') || 
                                   text.includes('BEING PROCESSED') || 
                                   text.includes('UNDER PROCESS') ||
                                   text.includes('REQUEST IS IN PROGRESS');
                        }).catch(() => false);

                        if (alreadyInProgress) {
                            console.log('[IMS Automation] [Phase 1] Generation is ALREADY in progress on the portal! Marking as REQUESTED without re-triggering...');
                            isGenerationRequested = true;
                            generationRequestedTimestamp = batchRow?.generation_requested_at || Date.now();
                            await updateStatusBanner('✓ Generation already in progress on portal! Closing browser & queued for Phase 2...', '#f59e0b');
                            await page.waitForTimeout(2500);
                            break;
                        }

                        console.log('[IMS Automation] [Phase 1] No existing download file found. Clicking "GENERATE JSON FILE TO DOWNLOAD"...');
                        await updateStatusBanner('Step 6/7: Clicking "GENERATE JSON FILE TO DOWNLOAD"...', '#8b5cf6');

                        let clickedGen = false;
                        const genLocators = [
                            'button:has-text("GENERATE JSON FILE TO DOWNLOAD")',
                            'button:has-text("GENERATE JSON FILE")',
                            'button:has-text("GENERATE JSON")',
                            'input[value*="GENERATE JSON"]',
                            'a:has-text("GENERATE JSON FILE TO DOWNLOAD")',
                            'a:has-text("GENERATE JSON FILE")',
                            'text="GENERATE JSON FILE TO DOWNLOAD"',
                            'text="GENERATE JSON"'
                        ];

                        for (const gSel of genLocators) {
                            try {
                                const genEl = page.locator(gSel).first();
                                if (await genEl.isVisible({ timeout: 1500 })) {
                                    await genEl.scrollIntoViewIfNeeded().catch(() => {});
                                    await genEl.click({ force: true });
                                    clickedGen = true;
                                    console.log(`[IMS Automation] Clicked "GENERATE JSON FILE TO DOWNLOAD" button via locator "${gSel}"!`);
                                    break;
                                }
                            } catch (e) {}
                        }

                        if (!clickedGen) {
                            clickedGen = await page.evaluate(() => {
                                const btns = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], a, div, span, [role="button"]'));
                                const gen = btns.find(b => {
                                    const t = (b.innerText || b.textContent || b.value || '').trim().toUpperCase();
                                    return t.includes('GENERATE JSON FILE TO DOWNLOAD') || t.includes('GENERATE JSON');
                                });
                                if (gen) {
                                    gen.scrollIntoView();
                                    gen.focus();
                                    gen.click();
                                    gen.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                                    return true;
                                }
                                return false;
                            }).catch(() => false);

                            if (clickedGen) {
                                console.log('[IMS Automation] Clicked "GENERATE JSON FILE TO DOWNLOAD" via DOM evaluate fallback!');
                            }
                        }

                        // Check for download link or 20-minute waiting message
                        await page.waitForTimeout(2000);

                        // Auto-dismiss confirmation modal if GST portal shows one ("Request Accepted", etc.)
                        try {
                            const confirmBtn = page.locator('.modal button:has-text("OK"), .modal button:has-text("Ok"), button:has-text("OK"), button:has-text("Close")').first();
                            if (await confirmBtn.isVisible({ timeout: 1500 })) {
                                await confirmBtn.click();
                                console.log('[IMS Automation] Dismissed generation confirmation popup');
                            }
                        } catch (e) {}

                        // Check if link appeared immediately
                        try {
                            const dlLinkAfterGen = page.locator('table tr td a, a:has-text("Click here to download file"), a:has-text("Click here to download")').first();
                            if (await dlLinkAfterGen.isVisible({ timeout: 2500 })) {
                                console.log('[IMS Automation] "Click here to download file" link appeared immediately! Clicking now...');
                                await updateStatusBanner('Step 7/7: Clicking "Click here to download file"...', '#10b981');
                                await dlLinkAfterGen.click();
                                await page.waitForTimeout(3000);
                                continue;
                            }
                        } catch (waitErr) {}

                        // File generation queued by GST portal
                        console.log('[IMS Automation] File generation queued by GST Portal (~20m wait). Closing browser and saving state...');
                        isGenerationRequested = true;
                        generationRequestedTimestamp = Date.now();
                        await updateStatusBanner('✓ Generation Requested! Portal takes ~20 mins. Closing browser & moving to next client...', '#f59e0b');
                        await page.waitForTimeout(2500);
                        break;
                    }

                    // ─── CHECK 2: ARE WE ON THE IMS DASHBOARD (Card view with Inward / Outward)? (Screenshot 1) ───
                    if (currentUrl.includes('/ims')) {
                        console.log('[IMS Automation] Step 5: On IMS Dashboard -> Clicking "OFFLINE" button on Inward Supplies card...');
                        await updateStatusBanner('Step 5/7: On IMS Dashboard ➔ Clicking "OFFLINE"...', '#3b82f6');

                        let clickedOffline = false;
                        // A. Check for the OFFLINE button directly on the Inward Supplies card (Screenshot 1)
                        try {
                            const offBtn = page.locator('button:has-text("OFFLINE"), a:has-text("OFFLINE"), text="OFFLINE"').first();
                            if (await offBtn.isVisible({ timeout: 1500 })) {
                                await offBtn.click();
                                clickedOffline = true;
                                console.log('[IMS Automation] Clicked OFFLINE button on IMS Dashboard card!');
                            }
                        } catch (e) {}

                        // B. Fallback: DOM click on OFFLINE
                        if (!clickedOffline) {
                            await page.evaluate(() => {
                                const btn = Array.from(document.querySelectorAll('button, a, div, span')).find(el => {
                                    const t = (el.innerText || el.textContent || '').trim().toUpperCase();
                                    return t === 'OFFLINE';
                                });
                                if (btn) btn.click();
                            }).catch(() => {});
                        }

                        await page.waitForTimeout(2000);
                        continue;
                    }
                } catch (e) {
                    console.log('[IMS Automation] Navigation notice:', e.message);
                }

                await page.waitForTimeout(2000);
            }

            if (capturedJson) {
                console.log('[IMS Automation] Ingesting captured IMS data into database...');
                const invoices = Array.isArray(capturedJson) && capturedJson.length > 0 && capturedJson[0].inum
                    ? capturedJson
                    : parseImsJsonHelper(capturedJson, gstin, returnPeriod);

                if (invoices && invoices.length > 0) {
                    const batchId = randomUUID();
                    const now = Date.now();

                    await new Promise((resolve, reject) => {
                        db.serialize(() => {
                            db.run('BEGIN TRANSACTION');
                            db.run(`
                                INSERT INTO ims_batches (id, client_gstin, return_period, status, created_at, updated_at)
                                VALUES (?, ?, ?, 'SYNCED', ?, ?)
                                ON CONFLICT(client_gstin, return_period) DO UPDATE SET status = 'SYNCED', generation_status = 'DOWNLOADED', updated_at = ?
                            `, [batchId, gstin, returnPeriod, now, now, now]);

                            const insertStmt = db.prepare(`
                                INSERT INTO ims_invoices (
                                    id, batch_id, client_gstin, return_period, ctin, supplier_name,
                                    inum, idt, inv_typ, pos, rchrg, txval, igst, cgst, sgst, cess, total_val,
                                    source, source_period, action, client_remarks, reviewed_at, reviewed_by
                                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                ON CONFLICT(client_gstin, return_period, ctin, inum, idt) DO UPDATE SET
                                    batch_id = excluded.batch_id,
                                    supplier_name = excluded.supplier_name,
                                    txval = excluded.txval,
                                    igst = excluded.igst,
                                    cgst = excluded.cgst,
                                    sgst = excluded.sgst,
                                    cess = excluded.cess,
                                    total_val = excluded.total_val,
                                    source = excluded.source,
                                    source_period = excluded.source_period
                            `);

                            for (const inv of invoices) {
                                insertStmt.run([
                                    randomUUID(), batchId, gstin, returnPeriod,
                                    inv.ctin, inv.supplier_name, inv.inum, inv.idt,
                                    inv.inv_typ || 'R', inv.pos || '', inv.rchrg || 'N',
                                    inv.txval, inv.igst, inv.cgst, inv.sgst, inv.cess, inv.total_val,
                                    inv.source || 'GSTR-1', inv.source_period || returnPeriod,
                                    inv.action || 'NO_ACTION', null, null, null
                                ], (rErr) => {
                                    if (rErr) console.warn('[IMS Automation] Portal sync row warning:', rErr.message);
                                });
                            }
                            insertStmt.finalize();
                            db.run('COMMIT', (err) => {
                                if (err) return reject(err);
                                resolve(true);
                            });
                        });
                    });

                    await recalculateBatchMetrics(gstin, returnPeriod);
                } else {
                    console.log(`[IMS Automation] No valid invoices extracted for ${gstin}`);
                }

                // Show success in banner
                await page.evaluate(({ count }) => {
                    const banner = document.getElementById('antigravity-ims-banner');
                    if (banner) {
                        banner.style.background = '#059669';
                        banner.innerHTML = `
                            <div style="display:flex;align-items:center;gap:10px;">
                                <span style="font-weight:bold;font-size:14px;">🎉 SUCCESS!</span>
                                <span>Captured and synced <strong>${count} inward invoices</strong> into Antigravity! Closing browser...</span>
                            </div>
                        `;
                    }
                }, { count: invoices.length });

                await page.waitForTimeout(3000);
                await browser.close().catch(() => {});

                return res.json({
                    success: true,
                    phaseResult: 'DOWNLOADED',
                    message: `Successfully captured & synced ${invoices.length} IMS inward invoices from GST Portal!`,
                    gstin,
                    period: returnPeriod,
                    invoiceCount: invoices.length
                });
            } else if (isGenerationRequested) {
                await browser.close().catch(() => {});
                activeBrowserInstance = null;

                const reqTime = generationRequestedTimestamp || Date.now();
                const reqBatchId = randomUUID();

                await new Promise((resolve) => {
                    db.run(`
                        INSERT INTO ims_batches (id, client_gstin, return_period, status, generation_status, generation_requested_at, created_at, updated_at)
                        VALUES (?, ?, ?, 'REQUESTED_WAITING', 'REQUESTED', ?, ?, ?)
                        ON CONFLICT(client_gstin, return_period) DO UPDATE SET 
                            status = 'REQUESTED_WAITING',
                            generation_status = 'REQUESTED',
                            generation_requested_at = ?,
                            updated_at = ?
                    `, [reqBatchId, gstin, returnPeriod, reqTime, reqTime, reqTime, reqTime, reqTime], () => resolve(true));
                });

                return res.json({
                    success: true,
                    phaseResult: 'REQUESTED',
                    gstin,
                    period: returnPeriod,
                    requestedAt: reqTime,
                    message: 'Generation request submitted to GST Portal (takes ~20 mins). Browser closed — queued for Phase 2.'
                });
            } else {
                await browser.close().catch(() => {});
                return res.status(408).json({
                    success: false,
                    error: 'Timed out waiting for IMS download or data from GST Portal. Please ensure you clicked Inward Supplies or Download.'
                });
            }

        } catch (err) {
            if (browser) await browser.close().catch(() => {});
            console.error('[IMS Automation] Error during browser sync:', err);
            return res.status(500).json({
                success: false,
                error: err.message || 'Error occurred during assisted portal sync'
            });
        }
    });

    // ─── 16. 1-CLICK SCAN & INGEST ALL FROM DOWNLOADS / LOCAL FOLDER ─────────────
    app.post('/api/ims/scan-downloads', async (req, res) => {
        const { period, customFolder } = req.body;
        const returnPeriod = period || 'November 2025';

        const foldersToScan = [];
        if (customFolder && fs.existsSync(customFolder)) {
            foldersToScan.push(customFolder);
        }
        const scratchDir = path.join(process.cwd(), 'scratch', 'downloads');
        if (fs.existsSync(scratchDir)) foldersToScan.push(scratchDir);

        const userDownloads = path.join(os.homedir(), 'Downloads');
        if (fs.existsSync(userDownloads)) foldersToScan.push(userDownloads);

        const clientGstinsMap = new Map();
        await new Promise((resolve) => {
            db.all('SELECT gstin, trade_name FROM clients', (err, rows) => {
                if (rows) {
                    rows.forEach(r => {
                        if (r.gstin) clientGstinsMap.set(r.gstin.toUpperCase(), r.trade_name || r.gstin);
                    });
                }
                resolve(true);
            });
        });

        const results = [];
        const processedGstins = new Set();
        const scannedFiles = new Set();

        for (const folder of foldersToScan) {
            let fileList = [];
            try {
                fileList = fs.readdirSync(folder);
            } catch (e) {
                continue;
            }

            for (const fname of fileList) {
                const lower = fname.toLowerCase();
                const isMatch = lower.endsWith('.zip') || lower.endsWith('.json') || lower.endsWith('.xlsx');
                if (!isMatch) continue;

                // Match valid GSTIN or IMS filename keywords
                const gstinMatch = fname.match(/\b\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}\b/);
                const hasImsKeyword = lower.includes('ims') || lower.includes('inward');
                if (!gstinMatch && !hasImsKeyword) continue;

                const fullPath = path.join(folder, fname);
                if (scannedFiles.has(fullPath)) continue;
                scannedFiles.add(fullPath);

                let targetGstin = gstinMatch ? gstinMatch[0].toUpperCase() : '';

                try {
                    let invoices = [];
                    if (lower.endsWith('.zip')) {
                        invoices = await parseImsZipHelper(fullPath, targetGstin, returnPeriod);
                    } else if (lower.endsWith('.json')) {
                        const content = fs.readFileSync(fullPath, 'utf8');
                        const parsedJson = JSON.parse(content);
                        if (!targetGstin && (parsedJson.gstin || parsedJson.rtin)) {
                            targetGstin = (parsedJson.gstin || parsedJson.rtin).toUpperCase();
                        }
                        invoices = parseImsJsonHelper(parsedJson, targetGstin, returnPeriod);
                    } else if (lower.endsWith('.xlsx')) {
                        invoices = parseImsExcelHelper(fullPath, targetGstin, returnPeriod);
                    }

                    if (invoices.length > 0) {
                        if (!targetGstin && invoices[0].client_gstin) {
                            targetGstin = invoices[0].client_gstin.toUpperCase();
                        }

                        if (targetGstin) {
                            const batchId = randomUUID();
                            const now = Date.now();

                            await new Promise((resolve, reject) => {
                                db.serialize(() => {
                                    db.run('BEGIN TRANSACTION');
                                    db.run(`
                                        INSERT INTO ims_batches (id, client_gstin, return_period, status, created_at, updated_at)
                                        VALUES (?, ?, ?, 'SYNCED', ?, ?)
                                        ON CONFLICT(client_gstin, return_period) DO UPDATE SET status = 'SYNCED', generation_status = 'DOWNLOADED', updated_at = ?
                                    `, [batchId, targetGstin, returnPeriod, now, now, now]);

                                    const insertStmt = db.prepare(`
                                        INSERT INTO ims_invoices (
                                            id, batch_id, client_gstin, return_period, ctin, supplier_name,
                                            inum, idt, inv_typ, pos, rchrg, txval, igst, cgst, sgst, cess, total_val,
                                            source, source_period, action, client_remarks, reviewed_at, reviewed_by
                                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                        ON CONFLICT(client_gstin, return_period, ctin, inum, idt) DO UPDATE SET
                                            batch_id = excluded.batch_id,
                                            supplier_name = excluded.supplier_name,
                                            txval = excluded.txval,
                                            igst = excluded.igst,
                                            cgst = excluded.cgst,
                                            sgst = excluded.sgst,
                                            cess = excluded.cess,
                                            total_val = excluded.total_val,
                                            source = excluded.source,
                                            source_period = excluded.source_period
                                    `);

                                    for (const inv of invoices) {
                                        insertStmt.run([
                                            randomUUID(), batchId, targetGstin, returnPeriod,
                                            inv.ctin, inv.supplier_name, inv.inum, inv.idt,
                                            inv.inv_typ || 'R', inv.pos || '', inv.rchrg || 'N',
                                            inv.txval, inv.igst, inv.cgst, inv.sgst, inv.cess, inv.total_val,
                                            inv.source || 'GSTR-1', inv.source_period || returnPeriod,
                                            inv.action || 'NO_ACTION', null, null, null
                                        ], (rErr) => {
                                            if (rErr) console.warn('[IMS Ingestion] Scan-downloads row warning:', rErr.message);
                                        });
                                    }
                                    insertStmt.finalize();
                                    db.run('COMMIT', (err) => {
                                        if (err) return reject(err);
                                        resolve(true);
                                    });
                                });
                            });

                            await recalculateBatchMetrics(targetGstin, returnPeriod);

                            // Also ensure client exists in clients table if not already
                            await new Promise((resolve) => {
                                db.run(`
                                    INSERT OR IGNORE INTO clients (id, gstin, trade_name)
                                    VALUES (?, ?, ?)
                                `, [randomUUID(), targetGstin, clientGstinsMap.get(targetGstin) || targetGstin], () => resolve(true));
                            });

                            results.push({
                                fileName: fname,
                                gstin: targetGstin,
                                tradeName: clientGstinsMap.get(targetGstin) || targetGstin,
                                invoiceCount: invoices.length
                            });
                            processedGstins.add(targetGstin);
                        }
                    }
                } catch (err) {
                    console.warn(`[IMS Scan] Notice parsing file ${fname}:`, err.message);
                }
            }
        }

        const totalInvoices = results.reduce((acc, r) => acc + r.invoiceCount, 0);
        res.json({
            success: true,
            message: `Scanned and ingested ${results.length} files across ${processedGstins.size} clients (${totalInvoices} total invoices)!`,
            results,
            totalInvoices,
            clientsCount: processedGstins.size
        });
    });

    // ─── EMAIL SETTINGS: GET CONFIGURATION ──────────────────────────────────────
    app.get('/api/ims/email-settings', (req, res) => {
        db.get(`SELECT * FROM ims_email_settings WHERE id = 'primary'`, (err, row) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            res.json({
                success: true,
                settings: row || {
                    id: 'primary',
                    sender_name: '',
                    sender_email: '',
                    app_password: '',
                    subject_template: 'Action Required: GST IMS Inward Invoices Review for {period} - {client_name}',
                    firm_name: '',
                    ca_phone: '',
                    public_base_url: ''
                },
                isConfigured: !!(row && row.sender_email && row.app_password)
            });
        });
    });

    // ─── EMAIL SETTINGS: SAVE CONFIGURATION ─────────────────────────────────────
    app.post('/api/ims/email-settings/save', (req, res) => {
        const { sender_name, sender_email, app_password, subject_template, firm_name, ca_phone, public_base_url } = req.body;
        const now = Date.now();
        db.run(`
            INSERT INTO ims_email_settings (id, sender_name, sender_email, app_password, subject_template, firm_name, ca_phone, public_base_url, updated_at)
            VALUES ('primary', ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                sender_name = excluded.sender_name,
                sender_email = excluded.sender_email,
                app_password = excluded.app_password,
                subject_template = excluded.subject_template,
                firm_name = excluded.firm_name,
                ca_phone = excluded.ca_phone,
                public_base_url = excluded.public_base_url,
                updated_at = excluded.updated_at
        `, [
            sender_name || '',
            (sender_email || '').trim(),
            (app_password || '').trim(),
            subject_template || 'Action Required: GST IMS Inward Invoices Review for {period} - {client_name}',
            firm_name || '',
            ca_phone || '',
            (public_base_url || '').trim(),
            now
        ], (err) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            res.json({ success: true, message: 'Gmail SMTP settings saved successfully!' });
        });
    });

    // ─── EMAIL SETTINGS: TEST GMAIL SMTP CONNECTION ─────────────────────────────
    app.post('/api/ims/email-settings/test', async (req, res) => {
        const { sender_email, app_password, sender_name, test_recipient } = req.body;

        let email = (sender_email || '').trim();
        let pass = (app_password || '').replace(/\s+/g, '').trim();
        let name = (sender_name || 'GST Compliance Team').trim();

        // If not passed in body, try reading from DB
        if (!email || !pass) {
            const saved = await new Promise((resolve) => {
                db.get(`SELECT * FROM ims_email_settings WHERE id = 'primary'`, (err, r) => resolve(r));
            });
            if (saved) {
                email = email || saved.sender_email;
                pass = pass || (saved.app_password || '').replace(/\s+/g, '').trim();
                name = name || saved.sender_name || 'GST Compliance Team';
            }
        }

        if (!email || !pass) {
            return res.status(400).json({
                success: false,
                error: 'Sender Gmail address and 16-character App Password are required to test connection.'
            });
        }

        try {
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: email,
                    pass: pass
                }
            });

            await transporter.verify();

            const recipient = (test_recipient || email).trim();
            await transporter.sendMail({
                from: `"${name}" <${email}>`,
                to: recipient,
                subject: '✅ Gmail SMTP Connection Verified — GST IMS Compliance Hub',
                html: `
                    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
                        <div style="background: linear-gradient(135deg, #1e3a8a, #0284c7); padding: 16px 20px; border-radius: 8px; color: #ffffff; margin-bottom: 20px;">
                            <h2 style="margin: 0; font-size: 20px;">Gmail SMTP Test Successful!</h2>
                            <p style="margin: 4px 0 0 0; opacity: 0.9; font-size: 13px;">CA Practice GST Automation Hub</p>
                        </div>
                        <p style="color: #334155; font-size: 14px; line-height: 1.6;">
                            Your Gmail account <strong>${email}</strong> has been successfully authenticated with Google's secure mail servers.
                        </p>
                        <div style="background: #f8fafc; border-left: 4px solid #10b981; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
                            <p style="margin: 0; color: #065f46; font-size: 13px; font-weight: 500;">
                                Ready to broadcast IMS review sheets & 1-click links to your clients!
                            </p>
                        </div>
                        <p style="color: #64748b; font-size: 12px; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 12px;">
                            Sent at: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} (IST)
                        </p>
                    </div>
                `
            });

            res.json({
                success: true,
                message: `Successfully connected to Gmail! Test verification email sent to ${recipient}.`
            });
        } catch (err) {
            console.error('[Gmail SMTP Test Error]:', err);
            let userFriendlyMsg = err.message || 'Failed connecting to Gmail SMTP';
            if (userFriendlyMsg.includes('Invalid login') || userFriendlyMsg.includes('Username and Password not accepted') || userFriendlyMsg.includes('535')) {
                userFriendlyMsg = 'Authentication failed. Please verify you entered a 16-character Google App Password (not your regular Gmail login password) and that 2-Step Verification is active on your Google Account.';
            }
            res.status(400).json({ success: false, error: userFriendlyMsg });
        }
    });

    // ─── UPDATE CLIENT EMAIL DIRECTLY ──────────────────────────────────────────
    app.post('/api/ims/client-email/update', (req, res) => {
        const { gstin, email } = req.body;
        if (!gstin) return res.status(400).json({ success: false, error: 'gstin is required' });

        db.run(`UPDATE clients SET email = ? WHERE gstin = ?`, [(email || '').trim() || null, gstin], (err) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            res.json({ success: true, email: (email || '').trim() });
        });
    });

    // ─── BROADCAST IMS REVIEW EMAILS WITH EXCEL ATTACHMENTS ───────────────────
    app.post('/api/ims/broadcast-email', async (req, res) => {
        const { period, gstins, customSubject, customNote } = req.body;

        if (!period) {
            return res.status(400).json({ success: false, error: 'Tax return period is required' });
        }

        // 1. Fetch saved email settings
        const settings = await new Promise((resolve) => {
            db.get(`SELECT * FROM ims_email_settings WHERE id = 'primary'`, (err, r) => resolve(r));
        });

        if (!settings || !settings.sender_email || !settings.app_password) {
            return res.status(400).json({
                success: false,
                error: 'Gmail integration is not configured yet. Please configure your Gmail address and 16-character Google App Password first.'
            });
        }

        const senderEmail = settings.sender_email.trim();
        const appPassword = settings.app_password.replace(/\s+/g, '').trim();
        const senderName = (settings.sender_name || 'GST Compliance Team').trim();
        const firmName = (settings.firm_name || 'Chartered Accountants').trim();
        const caPhone = (settings.ca_phone || '').trim();

        // Setup Nodemailer Gmail transporter
        let transporter;
        try {
            transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: senderEmail,
                    pass: appPassword
                }
            });
            await transporter.verify();
        } catch (authErr) {
            return res.status(400).json({
                success: false,
                error: `Gmail connection failed: ${authErr.message}. Please check your Google App Password.`
            });
        }

        // Determine base URL for tokenized link
        let baseUrl = (settings.public_base_url || '').trim();
        if (!baseUrl) {
            const reqHost = req.get('host') || 'localhost:3001';
            const protocol = req.protocol || 'http';
            if (reqHost.includes(':3001')) {
                baseUrl = `${protocol}://${reqHost.replace(':3001', ':8080')}`;
            } else {
                baseUrl = `${protocol}://${reqHost}`;
            }
        }
        baseUrl = baseUrl.replace(/\/+$/, '');

        // 2. Fetch target clients
        let clientQuery = `
            SELECT c.gstin, c.trade_name, c.legal_name, c.email, c.phone,
                   COALESCE(b.total_invoices, 0) as total_invoices,
                   COALESCE(b.eligible_itc_total, 0) as eligible_itc_total,
                   t.token as active_token, t.expires_at as token_expires_at
            FROM clients c
            LEFT JOIN ims_batches b ON c.gstin = b.client_gstin AND b.return_period = ?
            LEFT JOIN ims_review_tokens t ON c.gstin = t.client_gstin AND t.return_period = ? AND t.is_active = 1
        `;

        const queryParams = [period, period];
        if (Array.isArray(gstins) && gstins.length > 0) {
            clientQuery += ` WHERE c.gstin IN (${gstins.map(() => '?').join(',')})`;
            queryParams.push(...gstins);
        } else {
            // Broadcast to clients who have invoices in this period
            clientQuery += ` WHERE b.total_invoices > 0`;
        }

        const clients = await new Promise((resolve, reject) => {
            db.all(clientQuery, queryParams, (err, rows) => {
                if (err) return reject(err);
                resolve(rows || []);
            });
        });

        if (clients.length === 0) {
            return res.json({
                success: true,
                message: 'No clients found matching the selection with invoices for this period.',
                total: 0,
                sent: 0,
                failed: 0,
                results: []
            });
        }

        const results = [];
        let sentCount = 0;
        let failedCount = 0;
        let missingEmailCount = 0;
        let noInvoicesCount = 0;

        const now = Date.now();
        const expiresAt = now + (30 * 24 * 60 * 60 * 1000); // 30 days

        for (const client of clients) {
            const clientGstin = client.gstin;
            const clientEmail = (client.email || '').trim();
            const tradeName = client.trade_name || clientGstin;
            const legalName = client.legal_name || tradeName;

            // Check if client has email
            if (!clientEmail || !clientEmail.includes('@')) {
                missingEmailCount++;
                results.push({
                    gstin: clientGstin,
                    tradeName,
                    email: clientEmail,
                    status: 'MISSING_EMAIL',
                    error: 'Client has no valid email address registered in Clients Master'
                });
                continue;
            }

            // Fetch invoices for this client
            const invoices = await new Promise((resolve) => {
                db.all(`
                    SELECT * FROM ims_invoices 
                    WHERE client_gstin = ? AND return_period = ? 
                    ORDER BY idt DESC, inum ASC
                `, [clientGstin, period], (err, invs) => resolve(invs || []));
            });

            if (invoices.length === 0) {
                noInvoicesCount++;
                results.push({
                    gstin: clientGstin,
                    tradeName,
                    email: clientEmail,
                    status: 'NO_INVOICES',
                    error: 'No inward invoices found for this tax period'
                });
                continue;
            }

            // Ensure active token
            let token = client.active_token;
            if (!token || (client.token_expires_at && client.token_expires_at < now)) {
                token = randomUUID().replace(/-/g, '') + randomUUID().substring(0, 8);
                await new Promise((resolve) => {
                    db.serialize(() => {
                        db.run(`UPDATE ims_review_tokens SET is_active = 0 WHERE client_gstin = ? AND return_period = ?`, [clientGstin, period]);
                        db.run(`
                            INSERT INTO ims_review_tokens (token, client_gstin, return_period, created_at, expires_at, is_active)
                            VALUES (?, ?, ?, ?, ?, 1)
                        `, [token, clientGstin, period, now, expiresAt], () => resolve(true));
                    });
                });
            }

            const reviewUrl = `${baseUrl}/#/ims-review/${token}`;

            // Generate customized Excel attachment buffer
            let excelBuffer;
            try {
                excelBuffer = await generateImsExcelBuffer(client, invoices, period);
            } catch (xErr) {
                console.error(`[IMS Broadcast] Failed to generate Excel for ${clientGstin}:`, xErr);
                failedCount++;
                results.push({
                    gstin: clientGstin,
                    tradeName,
                    email: clientEmail,
                    status: 'EXCEL_GEN_ERROR',
                    error: `Excel generation failed: ${xErr.message}`
                });
                continue;
            }

            const safePeriodName = period.replace(/[^a-zA-Z0-9]/g, '_');
            const excelFilename = `IMS_Inward_Review_${clientGstin}_${safePeriodName}.xlsx`;

            // Calculate metrics for email summary
            const totalTxval = invoices.reduce((acc, i) => acc + (Number(i.txval) || 0), 0);
            const totalTax = invoices.reduce((acc, i) => acc + (Number(i.igst) || 0) + (Number(i.cgst) || 0) + (Number(i.sgst) || 0) + (Number(i.cess) || 0), 0);

            // Compose Subject
            let emailSubject = customSubject || settings.subject_template || 'Action Required: GST IMS Inward Invoices Review for {period} - {client_name}';
            emailSubject = emailSubject
                .replace(/{period}/g, period)
                .replace(/{client_name}/g, tradeName)
                .replace(/{gstin}/g, clientGstin);

            // Compose Email HTML
            const emailHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GST IMS Review</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.5;">
    <div style="max-width: 680px; margin: 30px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
        
        <!-- Header Banner -->
        <div style="background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%); padding: 32px 28px; color: #ffffff; text-align: left;">
            <div style="font-size: 11px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: #93c5fd; margin-bottom: 6px;">
                ${firmName || 'GST COMPLIANCE DIVISION'}
            </div>
            <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #ffffff; line-height: 1.3;">
                Action Required: Inward Invoices Review
            </h1>
            <p style="margin: 8px 0 0 0; font-size: 14px; color: #cbd5e1;">
                GST Invoice Management System (IMS) • Period: <strong style="color: #67e8f9;">${period}</strong>
            </p>
        </div>

        <!-- Body Content -->
        <div style="padding: 28px;">
            <p style="font-size: 15px; margin: 0 0 16px 0; color: #334155;">
                Dear <strong>${tradeName}</strong> <span style="color: #64748b;">(${legalName})</span>,
            </p>
            <p style="font-size: 14px; margin: 0 0 20px 0; color: #475569; line-height: 1.6;">
                In accordance with GSTN rules, inward invoices uploaded by your suppliers for <strong>${period}</strong> are now available on the <strong>Invoice Management System (IMS)</strong>.
                Kindly review the vendor bills to ensure only legitimate Input Tax Credit (ITC) is availed in your upcoming GSTR-3B return.
            </p>

            ${customNote ? `
            <div style="background: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 4px; margin-bottom: 20px; font-size: 13.5px; color: #92400e;">
                <strong>Notice from CA Office:</strong> ${customNote}
            </div>` : ''}

            <!-- Summary KPI Box -->
            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; margin-bottom: 24px;">
                <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; margin-bottom: 12px;">
                    Summary of Inward Supplies (${period})
                </div>
                <table style="width: 100%; border-collapse: collapse; text-align: left;">
                    <tr>
                        <td style="padding: 6px 0; font-size: 13px; color: #64748b;">Client GSTIN:</td>
                        <td style="padding: 6px 0; font-size: 13px; font-weight: 600; color: #0f172a; text-align: right; font-family: monospace;">${clientGstin}</td>
                    </tr>
                    <tr>
                        <td style="padding: 6px 0; font-size: 13px; color: #64748b;">Total Vendor Bills:</td>
                        <td style="padding: 6px 0; font-size: 13px; font-weight: 700; color: #1e3a8a; text-align: right;">${invoices.length} Invoices</td>
                    </tr>
                    <tr>
                        <td style="padding: 6px 0; font-size: 13px; color: #64748b;">Total Taxable Value:</td>
                        <td style="padding: 6px 0; font-size: 13px; font-weight: 600; color: #0f172a; text-align: right;">₹${totalTxval.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    </tr>
                    <tr style="border-top: 1px dashed #cbd5e1;">
                        <td style="padding: 10px 0 4px 0; font-size: 14px; font-weight: 600; color: #065f46;">Total Input Tax Credit (ITC):</td>
                        <td style="padding: 10px 0 4px 0; font-size: 16px; font-weight: 700; color: #059669; text-align: right;">₹${totalTax.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    </tr>
                </table>
            </div>

            <!-- Primary 1-Click Action Button -->
            <div style="text-align: center; margin: 32px 0 28px 0;">
                <a href="${reviewUrl}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #2563eb, #1d4ed8); color: #ffffff; font-size: 15px; font-weight: 700; padding: 14px 32px; border-radius: 8px; text-decoration: none; box-shadow: 0 4px 10px rgba(37, 99, 235, 0.35); letter-spacing: 0.3px;">
                    👉 Open 1-Click Online Review Portal
                </a>
                <div style="font-size: 12px; color: #64748b; margin-top: 8px;">
                    Works instantly on Smartphones & Desktop • No login or password required
                </div>
            </div>

            <!-- Attached File Notice -->
            <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 14px 18px; margin-bottom: 24px;">
                <div style="display: flex; align-items: center;">
                    <div style="font-size: 13.5px; color: #166534; line-height: 1.5;">
                        <strong>📎 Itemized Excel Spreadsheet Attached:</strong><br/>
                        We have also attached <code>${excelFilename}</code> to this email. You can view vendor-wise breakdowns or select Accept / Reject directly inside the sheet.
                    </div>
                </div>
            </div>

            <!-- Instructions Bullet Points -->
            <div style="font-size: 13px; color: #475569; line-height: 1.6; border-top: 1px solid #e2e8f0; padding-top: 20px;">
                <strong>What actions to take?</strong>
                <ul style="margin: 8px 0 0 0; padding-left: 20px;">
                    <li><strong>ACCEPT:</strong> Goods / services received and bill is valid. Eligible ITC will be credited in 2B/3B.</li>
                    <li><strong>REJECT:</strong> Invoice not received, canceled, or incorrect party. ITC will NOT be claimed.</li>
                    <li><strong>PENDING:</strong> Goods in transit or pending verification. Invoice will rollover to next tax period.</li>
                </ul>
            </div>
        </div>

        <!-- Footer -->
        <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 28px; text-align: left; font-size: 12px; color: #64748b;">
            <div style="font-weight: 600; color: #334155; margin-bottom: 4px;">${firmName}</div>
            ${caPhone ? `<div>Helpdesk Contact: ${caPhone}</div>` : ''}
            <div style="margin-top: 8px; color: #94a3b8; font-size: 11px;">
                This is an automated compliance notification regarding GST Invoice Management System.
            </div>
        </div>
    </div>
</body>
</html>
            `;

            try {
                await transporter.sendMail({
                    from: `"${senderName}" <${senderEmail}>`,
                    to: clientEmail,
                    subject: emailSubject,
                    html: emailHtml,
                    attachments: [
                        {
                            filename: excelFilename,
                            content: excelBuffer,
                            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                        }
                    ]
                });

                // Update batch status to DISPATCHED
                db.run(`UPDATE ims_batches SET status = 'DISPATCHED', updated_at = ? WHERE client_gstin = ? AND return_period = ?`, [now, clientGstin, period]);

                sentCount++;
                results.push({
                    gstin: clientGstin,
                    tradeName,
                    email: clientEmail,
                    invoiceCount: invoices.length,
                    status: 'SENT',
                    reviewUrl
                });
            } catch (sendErr) {
                console.error(`[IMS Broadcast] Failed to send email to ${clientEmail}:`, sendErr);
                failedCount++;
                results.push({
                    gstin: clientGstin,
                    tradeName,
                    email: clientEmail,
                    status: 'SEND_FAILED',
                    error: sendErr.message || 'SMTP transmission failure'
                });
            }
        }

        res.json({
            success: true,
            message: `Broadcast complete! Successfully delivered to ${sentCount} client(s).`,
            total: clients.length,
            sent: sentCount,
            failed: failedCount,
            missingEmail: missingEmailCount,
            noInvoices: noInvoicesCount,
            results
        });
    });
}

// ─── HELPER: PARSE RAW GSTN IMS JSON PAYLOAD ──────────────────────────────────
function parseImsJsonHelper(rawJson, clientGstin, returnPeriod) {
    const invoices = [];
    if (!rawJson) return invoices;

    const targetGstin = (clientGstin || rawJson.rtin || rawJson.gstin || '').trim().toUpperCase();

    // 1. Direct array of invoice objects
    if (Array.isArray(rawJson)) {
        return rawJson.map((inv, idx) => ({
            id: randomUUID(),
            client_gstin: targetGstin,
            return_period: returnPeriod,
            ctin: (inv.ctin || inv.stin || '').trim().toUpperCase(),
            supplier_name: inv.supplier_name || inv.tradenm || inv.cname || '',
            inum: String(inv.inum || inv.doc_num || '').trim(),
            idt: normalizeImsDate(inv.idt || inv.doc_dt),
            inv_typ: inv.inv_typ || inv.typ || 'R',
            pos: String(inv.pos || ''),
            rchrg: inv.rchrg || 'N',
            txval: Number(inv.txval) || 0,
            igst: Number(inv.igst || inv.iamt) || 0,
            cgst: Number(inv.cgst || inv.camt) || 0,
            sgst: Number(inv.sgst || inv.samt) || 0,
            cess: Number(inv.cess || inv.csamt) || 0,
            total_val: Number(inv.total_val || inv.val) || 0,
            source: inv.source || inv.srcform || inv.srctyp || 'GSTR-1',
            source_period: inv.source_period || inv.rtnprd || inv.fp || returnPeriod,
            action: inv.action ? (inv.action === 'N' ? 'NO_ACTION' : inv.action.toUpperCase()) : 'NO_ACTION'
        }));
    }

    // 2. Official Portal IMS JSON Schema (container can be rawJson.imsDetails or rawJson directly)
    const details = rawJson.imsDetails || rawJson;
    const imsSections = ['b2b', 'b2ba', 'cdnr', 'cdnra', 'isd'];
    let foundImsFormat = false;

    for (const sec of imsSections) {
        const list = details[sec];
        if (Array.isArray(list) && list.length > 0) {
            const first = list[0];
            // If the element has stin or (inum and no nested inv array), it's the official flat IMS format!
            if (first && (first.stin || (first.inum && !first.inv))) {
                foundImsFormat = true;
                for (const inv of list) {
                    const ctin = (inv.stin || inv.ctin || '').trim().toUpperCase();
                    if (!ctin && !inv.inum) continue;

                    const inum = String(inv.inum || inv.doc_num || '').trim();
                    const idt = normalizeImsDate(inv.idt || inv.doc_dt);
                    const txval = Number(inv.txval) || 0;
                    const igst = Number(inv.iamt || inv.igst) || 0;
                    const cgst = Number(inv.camt || inv.cgst) || 0;
                    const sgst = Number(inv.samt || inv.sgst) || 0;
                    const cess = Number(inv.cess || inv.csamt) || 0;
                    const total_val = Number(inv.val || inv.total_val) || Math.round((txval + igst + cgst + sgst + cess) * 100) / 100;

                    let defaultTyp = 'R';
                    if (sec === 'b2ba') defaultTyp = 'B2BA';
                    else if (sec === 'cdnr') defaultTyp = inv.ntty === 'C' ? 'C' : 'D';
                    else if (sec === 'cdnra') defaultTyp = 'CDNRA';
                    else if (sec === 'isd') defaultTyp = 'ISD';

                    invoices.push({
                        id: randomUUID(),
                        client_gstin: targetGstin,
                        return_period: returnPeriod,
                        ctin,
                        supplier_name: inv.tradenm || inv.cname || inv.supplier_name || '',
                        inum,
                        idt,
                        inv_typ: inv.inv_typ || defaultTyp,
                        pos: String(inv.pos || ''),
                        rchrg: inv.rchrg || 'N',
                        txval: Math.round(txval * 100) / 100,
                        igst: Math.round(igst * 100) / 100,
                        cgst: Math.round(cgst * 100) / 100,
                        sgst: Math.round(sgst * 100) / 100,
                        cess: Math.round(cess * 100) / 100,
                        total_val: Math.round(total_val * 100) / 100,
                        source: inv.srcform || inv.srctyp || (sec === 'b2ba' ? 'GSTR-1A' : 'GSTR-1'),
                        source_period: inv.rtnprd || inv.fp || returnPeriod,
                        action: inv.action ? (inv.action === 'N' ? 'NO_ACTION' : inv.action.toUpperCase()) : 'NO_ACTION'
                    });
                }
            }
        }
    }

    if (foundImsFormat && invoices.length > 0) {
        console.log(`[IMS Automation] Parsed ${invoices.length} invoices from official IMS JSON schema!`);
        return invoices;
    }

    // 3. Nested GSTR-2B Supplier Hierarchy Format
    const b2bList = rawJson.b2b || (rawJson.sec_list && rawJson.sec_list.b2b) || [];
    if (Array.isArray(b2bList)) {
        for (const supplier of b2bList) {
            const ctin = (supplier.ctin || '').trim().toUpperCase();
            const cname = supplier.cname || supplier.trade_name || '';
            const invList = supplier.inv || [];
            for (const inv of invList) {
                let txval = 0, igst = 0, cgst = 0, sgst = 0, cess = 0;
                if (Array.isArray(inv.itms)) {
                    for (const itm of inv.itms) {
                        const d = itm.itm_det || itm;
                        txval += Number(d.txval) || 0;
                        igst += Number(d.iamt) || 0;
                        cgst += Number(d.camt) || 0;
                        sgst += Number(d.samt) || 0;
                        cess += Number(d.csamt) || 0;
                    }
                } else {
                    txval = Number(inv.txval) || 0;
                    igst = Number(inv.iamt) || 0;
                    cgst = Number(inv.camt) || 0;
                    sgst = Number(inv.samt) || 0;
                    cess = Number(inv.csamt) || 0;
                }
                const inum = String(inv.inum || '').trim();
                const idt = normalizeImsDate(inv.idt);
                invoices.push({
                    id: randomUUID(),
                    client_gstin: clientGstin,
                    return_period: returnPeriod,
                    ctin,
                    supplier_name: cname,
                    inum,
                    idt,
                    inv_typ: inv.inv_typ || 'R',
                    pos: String(inv.pos || ''),
                    rchrg: inv.rchrg || 'N',
                    txval: Math.round(txval * 100) / 100,
                    igst: Math.round(igst * 100) / 100,
                    cgst: Math.round(cgst * 100) / 100,
                    sgst: Math.round(sgst * 100) / 100,
                    cess: Math.round(cess * 100) / 100,
                    total_val: Number(inv.val) || Math.round((txval + igst + cgst + sgst + cess) * 100) / 100,
                    source: inv.srctyp || 'GSTR-1',
                    source_period: inv.fp || returnPeriod,
                    action: inv.action ? inv.action.toUpperCase() : 'NO_ACTION'
                });
            }
        }
    }

    // CDNR Section
    const cdnrList = rawJson.cdnr || (rawJson.sec_list && rawJson.sec_list.cdnr) || [];
    if (Array.isArray(cdnrList)) {
        for (const supplier of cdnrList) {
            const ctin = (supplier.ctin || '').trim().toUpperCase();
            const cname = supplier.cname || supplier.trade_name || '';
            const ntList = supplier.nt || [];
            for (const nt of ntList) {
                let txval = 0, igst = 0, cgst = 0, sgst = 0, cess = 0;
                if (Array.isArray(nt.itms)) {
                    for (const itm of nt.itms) {
                        const d = itm.itm_det || itm;
                        txval += Number(d.txval) || 0;
                        igst += Number(d.iamt) || 0;
                        cgst += Number(d.camt) || 0;
                        sgst += Number(d.samt) || 0;
                        cess += Number(d.csamt) || 0;
                    }
                } else {
                    txval = Number(nt.txval) || 0;
                    igst = Number(nt.iamt) || 0;
                    cgst = Number(nt.camt) || 0;
                    sgst = Number(nt.samt) || 0;
                    cess = Number(nt.csamt) || 0;
                }
                const nt_num = String(nt.nt_num || nt.inum || '').trim();
                const nt_dt = normalizeImsDate(nt.nt_dt || nt.idt);
                invoices.push({
                    id: randomUUID(),
                    client_gstin: clientGstin,
                    return_period: returnPeriod,
                    ctin,
                    supplier_name: cname,
                    inum: nt_num,
                    idt: nt_dt,
                    inv_typ: nt.ntty === 'C' ? 'C' : 'D',
                    pos: String(nt.pos || ''),
                    rchrg: nt.rchrg || 'N',
                    txval: Math.round(txval * 100) / 100,
                    igst: Math.round(igst * 100) / 100,
                    cgst: Math.round(cgst * 100) / 100,
                    sgst: Math.round(sgst * 100) / 100,
                    cess: Math.round(cess * 100) / 100,
                    total_val: Number(nt.val) || Math.round((txval + igst + cgst + sgst + cess) * 100) / 100,
                    source: nt.srctyp || 'GSTR-1',
                    source_period: nt.fp || returnPeriod,
                    action: nt.action ? nt.action.toUpperCase() : 'NO_ACTION'
                });
            }
        }
    }

    return invoices;
}

// ─── HELPER: PARSE OFFICIAL GSTN IMS INWARD EXCEL EXPORT (.XLSX) ─────────────
function parseImsExcelHelper(bufferOrFilePath, clientGstin, returnPeriod) {
    const invoices = [];
    try {
        const xlsxLib = XLSX.default || XLSX;
        const wb = typeof bufferOrFilePath === 'string'
            ? xlsxLib.readFile(bufferOrFilePath)
            : xlsxLib.read(bufferOrFilePath, { type: 'buffer' });

        for (const sheetName of wb.SheetNames) {
            const upperSheet = sheetName.toUpperCase();
            // Skip summary overview sheets
            if (upperSheet.includes('ALL OTHER') || upperSheet.includes('IMPORT OF GOODS') || upperSheet.includes('SUMMARY')) {
                continue;
            }

            const sheet = wb.Sheets[sheetName];
            if (!sheet) continue;
            const rows = xlsxLib.utils.sheet_to_json(sheet, { header: 1, defval: '' });
            if (rows.length < 2) continue;

            // Determine default invoice type based on sheet name
            let defaultType = 'R';
            if (upperSheet.includes('B2BA')) defaultType = 'B2BA';
            else if (upperSheet.includes('CDNR') || upperSheet.includes('CREDIT') || upperSheet.includes('DEBIT')) defaultType = 'C';
            else if (upperSheet.includes('CDNRA')) defaultType = 'CDNRA';
            else if (upperSheet.includes('ISD')) defaultType = 'ISD';

            // Find first data row (row having a 15-character GSTIN in any cell)
            let firstDataRowIdx = -1;
            for (let r = 0; r < Math.min(25, rows.length); r++) {
                const hasGstin = rows[r].some(cell => /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(String(cell || '').trim()));
                if (hasGstin) {
                    firstDataRowIdx = r;
                    break;
                }
            }

            if (firstDataRowIdx === -1) {
                // Fallback: look for row where column 0 or 2 has an alphanumeric ID and row has numeric values
                for (let r = 2; r < Math.min(15, rows.length); r++) {
                    if (rows[r].length >= 5 && typeof rows[r][rows[r].length - 1] !== 'undefined') {
                        const cell0 = String(rows[r][0] || '').trim();
                        if (cell0 && cell0 !== 'TOTAL' && !cell0.includes('Total') && cell0.length > 5) {
                            firstDataRowIdx = r;
                            break;
                        }
                    }
                }
            }

            if (firstDataRowIdx === -1) continue;

            // Build combined column headers from all rows before firstDataRowIdx
            const maxCols = Math.max(...rows.slice(0, firstDataRowIdx).map(r => r.length));
            const colHeaders = [];
            for (let c = 0; c < maxCols; c++) {
                const parts = [];
                for (let r = 0; r < firstDataRowIdx; r++) {
                    const val = String(rows[r][c] || '').trim();
                    if (val && !parts.includes(val)) parts.push(val);
                }
                colHeaders.push(parts.join(' / ').toUpperCase());
            }

            let ctinCol = -1, nameCol = -1, inumCol = -1, idtCol = -1, valCol = -1;
            let txvalCol = -1, igstCol = -1, cgstCol = -1, sgstCol = -1, cessCol = -1, posCol = -1, statusCol = -1;
            let sourceCol = -1, periodCol = -1, rchrgCol = -1;

            colHeaders.forEach((h, c) => {
                if (h.includes('GSTIN OF SUPPLIER') || (h.includes('GSTIN') && ctinCol === -1)) ctinCol = c;
                if (h.includes('TRADE/LEGAL NAME') || h.includes('SUPPLIER NAME') || h.includes('LEGAL NAME')) nameCol = c;
                if (h.includes('INVOICE DETAILS / INVOICE NUMBER') || (h.includes('INVOICE NUMBER') && inumCol === -1) || h.includes('NOTE NUMBER')) inumCol = c;
                if ((h.includes('INVOICE DATE') || h.includes('NOTE DATE')) && (idtCol === -1 || h.includes('INVOICE DETAILS'))) idtCol = c;
                if (h.includes('INVOICE VALUE') || h.includes('NOTE VALUE')) valCol = c;
                if (h.includes('TAXABLE VALUE')) txvalCol = c;
                if (h.includes('INTEGRATED TAX') && igstCol === -1) igstCol = c;
                if (h.includes('CENTRAL TAX') && cgstCol === -1) cgstCol = c;
                if (h.includes('STATE') && sgstCol === -1) sgstCol = c;
                if (h.includes('CESS') && cessCol === -1) cessCol = c;
                if (h.includes('PLACE OF SUPPLY') || h.includes('POS')) posCol = c;
                if (h.includes('REVERSE CHARGE') || h.includes('RCHRG')) rchrgCol = c;
                if (h.includes('STATUS')) statusCol = c;
                if (h.includes('SOURCE RETURN PERIOD') || h.includes('RETURN PERIOD')) periodCol = c;
                else if (h.includes('SOURCE') && sourceCol === -1) sourceCol = c;
            });

            // Special check for B2BA / CDNRA: ensure inumCol and idtCol target the revised details columns
            if (upperSheet.includes('B2BA') || upperSheet.includes('CDNRA')) {
                colHeaders.forEach((h, c) => {
                    if (h.includes('INVOICE DETAILS / INVOICE NUMBER') || (h.includes('REVISED') && h.includes('NUMBER'))) inumCol = c;
                    if (h.includes('INVOICE DETAILS') && h.includes('INVOICE DATE')) idtCol = c;
                });
            }

            for (let r = firstDataRowIdx; r < rows.length; r++) {
                const row = rows[r];
                if (!row || row.length === 0) continue;

                const inum = inumCol !== -1 ? String(row[inumCol] || '').trim() : '';
                if (!inum || inum.toUpperCase().includes('TOTAL')) continue;

                const ctin = ctinCol !== -1 ? String(row[ctinCol] || '').trim().toUpperCase() : '';
                const name = nameCol !== -1 ? String(row[nameCol] || '').trim() : '';
                const idt = idtCol !== -1 ? normalizeImsDate(row[idtCol]) : '';
                const txval = txvalCol !== -1 ? Number(row[txvalCol]) || 0 : 0;
                const igst = igstCol !== -1 ? Number(row[igstCol]) || 0 : 0;
                const cgst = cgstCol !== -1 ? Number(row[cgstCol]) || 0 : 0;
                const sgst = sgstCol !== -1 ? Number(row[sgstCol]) || 0 : 0;
                const cess = cessCol !== -1 ? Number(row[cessCol]) || 0 : 0;
                const totalVal = valCol !== -1 ? Number(row[valCol]) || 0 : (txval + igst + cgst + sgst + cess);
                const pos = posCol !== -1 ? String(row[posCol] || '').trim() : '';
                const rchrg = rchrgCol !== -1 ? (String(row[rchrgCol] || '').trim().toUpperCase().startsWith('Y') ? 'Y' : 'N') : 'N';
                const sourcePeriod = periodCol !== -1 && String(row[periodCol] || '').trim() ? String(row[periodCol] || '').trim() : returnPeriod;

                let action = 'NO_ACTION';
                if (statusCol !== -1) {
                    const s = String(row[statusCol] || '').toUpperCase().trim();
                    if (s.includes('ACCEPT')) action = 'ACCEPT';
                    else if (s.includes('REJECT')) action = 'REJECT';
                    else if (s.includes('PENDING')) action = 'PENDING';
                }

                invoices.push({
                    id: randomUUID(),
                    client_gstin: clientGstin,
                    return_period: returnPeriod,
                    ctin,
                    supplier_name: name,
                    inum,
                    idt,
                    inv_typ: defaultType,
                    pos,
                    rchrg,
                    txval: Math.round(txval * 100) / 100,
                    igst: Math.round(igst * 100) / 100,
                    cgst: Math.round(cgst * 100) / 100,
                    sgst: Math.round(sgst * 100) / 100,
                    cess: Math.round(cess * 100) / 100,
                    total_val: Math.round(totalVal * 100) / 100,
                    source: defaultType === 'B2BA' ? 'GSTR-1A' : 'GSTR-1',
                    source_period: sourcePeriod,
                    action
                });
            }
        }
    } catch (err) {
        console.error('[IMS Automation] Error parsing IMS Excel:', err);
    }

    return invoices;
}

// ─── HELPER: PARSE OFFICIAL GSTN IMS INWARD ZIP ARCHIVE (.ZIP) ───────────────
async function parseImsZipHelper(zipFilePathOrBuffer, clientGstin, returnPeriod) {
    const invoices = [];
    try {
        const buf = typeof zipFilePathOrBuffer === 'string'
            ? fs.readFileSync(zipFilePathOrBuffer)
            : zipFilePathOrBuffer;

        const zip = await JSZip.loadAsync(buf);
        let detectedGstin = (clientGstin || '').trim().toUpperCase();

        // Check if the ZIP's internal files explicitly belong to a different GSTIN
        for (const fname of Object.keys(zip.files)) {
            const match = fname.match(/\b\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}\b/i);
            if (match) {
                const foundGstin = match[0].toUpperCase();
                if (detectedGstin && foundGstin !== detectedGstin) {
                    console.warn(`[IMS Automation] ZIP archive contains files for ${foundGstin}, but requested client is ${detectedGstin}. Skipping cross-client file.`);
                    return [];
                }
                if (!detectedGstin) {
                    detectedGstin = foundGstin;
                }
                break;
            }
        }

        for (const [fname, entry] of Object.entries(zip.files)) {
            if (entry.dir) continue;
            const lower = fname.toLowerCase();

            if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
                console.log(`[IMS Automation] Parsing Excel file inside ZIP: ${fname}`);
                const excelBuf = await entry.async('nodebuffer');
                const excelInvoices = parseImsExcelHelper(excelBuf, detectedGstin || '', returnPeriod);
                invoices.push(...excelInvoices);
            } else if (lower.endsWith('.json')) {
                console.log(`[IMS Automation] Parsing JSON file inside ZIP: ${fname}`);
                const jsonStr = await entry.async('string');
                try {
                    const jsonObj = JSON.parse(jsonStr);
                    const jsonInvoices = parseImsJsonHelper(jsonObj, detectedGstin || '', returnPeriod);
                    invoices.push(...jsonInvoices);
                } catch (e) {
                    console.warn(`[IMS Automation] Error parsing JSON ${fname}:`, e.message);
                }
            }
        }
    } catch (err) {
        console.error('[IMS Automation] Error reading ZIP file:', err);
    }
    return invoices;
}

// ─── HELPER: GENERATE CLIENT IMS REVIEW EXCEL WORKBOOK (.XLSX) ───────────────
async function generateImsExcelBuffer(client, invoices, period) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'GST IMS Automation Hub';
    workbook.lastModifiedBy = 'Chartered Accountants';
    workbook.created = new Date();
    workbook.modified = new Date();

    const sheet = workbook.addWorksheet('IMS Inward Invoices', {
        views: [{ state: 'frozen', ySplit: 7 }]
    });

    const CARD_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    const TOTAL_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    const BORDER_STYLE = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
    };

    // Row 1: Title Banner (Unmerged single cell architecture)
    const titleCell = sheet.getCell('A1');
    titleCell.value = 'GST INVOICE MANAGEMENT SYSTEM (IMS) — INWARD INVOICES REVIEW';
    titleCell.font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    titleCell.alignment = { horizontal: 'left', vertical: 'middle' };
    sheet.getRow(1).height = 32;

    // Row 2: Client Details
    const clientCell = sheet.getCell('A2');
    clientCell.value = `Client: ${client.trade_name || client.tradeName || ''} (${client.legal_name || client.legalName || ''})  |  GSTIN: ${client.gstin}  |  Period: ${period}`;
    clientCell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF1E293B' } };
    clientCell.fill = CARD_FILL;
    clientCell.alignment = { horizontal: 'left', vertical: 'middle' };
    sheet.getRow(2).height = 22;

    // Row 3: Top KPI Metrics
    const totalTxval = invoices.reduce((acc, i) => acc + (Number(i.txval) || 0), 0);
    const totalTax = invoices.reduce((acc, i) => acc + (Number(i.igst) || 0) + (Number(i.cgst) || 0) + (Number(i.sgst) || 0) + (Number(i.cess) || 0), 0);
    const kpiCell = sheet.getCell('A3');
    kpiCell.value = `Total Invoices: ${invoices.length}  |  Total Taxable: ₹${totalTxval.toLocaleString('en-IN', { minimumFractionDigits: 2 })}  |  Total Tax (ITC): ₹${totalTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    kpiCell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF047857' } };
    kpiCell.fill = CARD_FILL;
    kpiCell.alignment = { horizontal: 'left', vertical: 'middle' };
    sheet.getRow(3).height = 22;

    // Row 4: Action Instructions Banner
    const instructionCell = sheet.getCell('A4');
    instructionCell.value = `📌 INSTRUCTIONS: Choose ACCEPT, REJECT, or PENDING in Column P ("Your Decision"). Submit via email or online link.`;
    instructionCell.font = { name: 'Segoe UI', size: 9.5, italic: false, color: { argb: 'FF78350F' } };
    instructionCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
    instructionCell.alignment = { horizontal: 'left', vertical: 'middle' };
    sheet.getRow(4).height = 24;

    // Row 5: Table Column Headers
    const headers = [
        { header: 'S.No', key: 'sno', width: 7 },
        { header: 'Supplier GSTIN', key: 'ctin', width: 18 },
        { header: 'Supplier Trade / Legal Name', key: 'supplier_name', width: 34 },
        { header: 'Invoice Number', key: 'inum', width: 18 },
        { header: 'Invoice Date', key: 'idt', width: 14 },
        { header: 'Doc Type', key: 'inv_typ', width: 12 },
        { header: 'Place of Supply', key: 'pos', width: 14 },
        { header: 'RCM', key: 'rchrg', width: 8 },
        { header: 'Taxable Value (₹)', key: 'txval', width: 18 },
        { header: 'IGST (₹)', key: 'igst', width: 16 },
        { header: 'CGST (₹)', key: 'cgst', width: 16 },
        { header: 'SGST (₹)', key: 'sgst', width: 16 },
        { header: 'Cess (₹)', key: 'cess', width: 12 },
        { header: 'Total Value (₹)', key: 'total_val', width: 18 },
        { header: 'Source', key: 'source', width: 12 },
        { header: 'Your Decision (Choose)', key: 'action', width: 22 },
        { header: 'Client Remarks / Notes', key: 'client_remarks', width: 30 }
    ];

    sheet.columns = headers;
    sheet.getRow(7).values = headers.map(h => h.header);
    sheet.getRow(7).height = 28;

    sheet.getRow(7).eachCell((cell) => {
        cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = HEADER_FILL;
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = BORDER_STYLE;
    });

    // Populate Invoices
    let currentRowIdx = 8;
    invoices.forEach((inv, index) => {
        const row = sheet.getRow(currentRowIdx);
        row.height = 22;
        const isEven = index % 2 === 0;
        const rowBg = isEven ? 'FFFFFFFF' : 'FFF8FAFC';

        const actionText = (inv.action || '').toUpperCase();
        let displayAction = 'NO_ACTION';
        if (actionText === 'ACCEPT') displayAction = 'ACCEPT';
        else if (actionText === 'REJECT') displayAction = 'REJECT';
        else if (actionText === 'PENDING') displayAction = 'PENDING';

        row.values = [
            index + 1,
            inv.ctin || '',
            inv.supplier_name || '',
            inv.inum || '',
            inv.idt || '',
            inv.inv_typ === 'C' ? 'Credit Note' : (inv.inv_typ === 'D' ? 'Debit Note' : 'Invoice'),
            inv.pos || '',
            inv.rchrg || 'N',
            Number(inv.txval) || 0,
            Number(inv.igst) || 0,
            Number(inv.cgst) || 0,
            Number(inv.sgst) || 0,
            Number(inv.cess) || 0,
            Number(inv.total_val) || 0,
            inv.source || 'GSTR-1',
            displayAction,
            inv.client_remarks || ''
        ];

        // Format Cells
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            cell.font = { name: 'Segoe UI', size: 9.5 };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
            cell.border = BORDER_STYLE;

            if ([1, 4, 5, 6, 7, 8, 15].includes(colNumber)) {
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
            } else if ([9, 10, 11, 12, 13, 14].includes(colNumber)) {
                cell.alignment = { horizontal: 'right', vertical: 'middle' };
                cell.numFmt = '#,##0.00';
            } else if (colNumber === 16) {
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
                if (displayAction === 'ACCEPT') {
                    cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF059669' } };
                } else if (displayAction === 'REJECT') {
                    cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFDC2626' } };
                } else if (displayAction === 'PENDING') {
                    cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFD97706' } };
                }
            } else {
                cell.alignment = { horizontal: 'left', vertical: 'middle' };
            }
        });

        // Dropdown data validation on Decision column (Col 16)
        row.getCell(16).dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: ['"ACCEPT,REJECT,PENDING,NO_ACTION"'],
            showErrorMessage: true,
            errorTitle: 'Invalid Selection',
            error: 'Please choose ACCEPT, REJECT, or PENDING from the dropdown.'
        };

        currentRowIdx++;
    });

    // Total Row
    if (invoices.length > 0) {
        const totalRow = sheet.getRow(currentRowIdx);
        totalRow.height = 26;
        totalRow.getCell(1).value = '';
        totalRow.getCell(3).value = 'TOTAL';
        totalRow.getCell(9).value = { formula: `SUM(I8:I${currentRowIdx - 1})` };
        totalRow.getCell(10).value = { formula: `SUM(J8:J${currentRowIdx - 1})` };
        totalRow.getCell(11).value = { formula: `SUM(K8:K${currentRowIdx - 1})` };
        totalRow.getCell(12).value = { formula: `SUM(L8:L${currentRowIdx - 1})` };
        totalRow.getCell(13).value = { formula: `SUM(M8:M${currentRowIdx - 1})` };
        totalRow.getCell(14).value = { formula: `SUM(N8:N${currentRowIdx - 1})` };

        totalRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF0F172A' } };
            cell.fill = TOTAL_FILL;
            cell.border = BORDER_STYLE;
            if ([9, 10, 11, 12, 13, 14].includes(colNumber)) {
                cell.alignment = { horizontal: 'right', vertical: 'middle' };
                cell.numFmt = '#,##0.00';
            } else {
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
            }
        });
    }

    return await workbook.xlsx.writeBuffer();
}

