import path from 'path';
import sqlite3 from 'sqlite3';

/**
 * Initialize SQLite database tables and indices for the Enterprise Unified Database Persistence Suite (Phase 31)
 * Covers: Suite 05 (Clause 44, Depreciation, SA 530), Suite 06 (CMA, Financial Statements), Suite 02 (GST Reco History)
 */
export function initAuditStorageDatabase(db) {
    db.serialize(() => {
        db.run(`PRAGMA foreign_keys = ON;`);

        // 1. Suite 05: Form 3CD Clause 44 Spend Breakdown Records
        db.run(`
            CREATE TABLE IF NOT EXISTS audit_clause44_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                client_gstin TEXT NOT NULL,
                fy TEXT NOT NULL,
                spend_data_json TEXT,
                summary_json TEXT,
                metadata TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(client_gstin, fy)
            );
        `);
        db.run(`CREATE INDEX IF NOT EXISTS idx_clause44_client_fy ON audit_clause44_records(client_gstin, fy);`);

        // 2. Suite 05: Dual Depreciation & DTA/DTL Schedules
        db.run(`
            CREATE TABLE IF NOT EXISTS audit_depreciation_assets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                client_gstin TEXT NOT NULL,
                fy TEXT NOT NULL,
                assets_data_json TEXT,
                dta_dtl_json TEXT,
                metadata TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(client_gstin, fy)
            );
        `);
        db.run(`CREATE INDEX IF NOT EXISTS idx_depreciation_client_fy ON audit_depreciation_assets(client_gstin, fy);`);

        // 3. Suite 05: SA 530 Monetary Unit Sampling Workpapers
        db.run(`
            CREATE TABLE IF NOT EXISTS audit_sa530_samples (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                client_gstin TEXT NOT NULL,
                fy TEXT NOT NULL,
                audit_area TEXT NOT NULL,
                sample_vouchers_json TEXT,
                parameters_json TEXT,
                metadata TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);
        db.run(`CREATE INDEX IF NOT EXISTS idx_sa530_client_fy ON audit_sa530_samples(client_gstin, fy);`);

        // 4. Suite 06: Bank CMA Appraisal & MPBF Projections
        db.run(`
            CREATE TABLE IF NOT EXISTS cma_appraisals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                client_gstin TEXT NOT NULL,
                fy TEXT NOT NULL,
                projection_data_json TEXT,
                mpbf_outputs_json TEXT,
                metadata TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(client_gstin, fy)
            );
        `);
        db.run(`CREATE INDEX IF NOT EXISTS idx_cma_client_fy ON cma_appraisals(client_gstin, fy);`);

        // 5. Suite 06: Schedule III & Non-Corporate Financial Statements Workspaces
        db.run(`
            CREATE TABLE IF NOT EXISTS financial_statements_workspaces (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                client_gstin TEXT NOT NULL,
                fy TEXT NOT NULL,
                taxonomy_type TEXT NOT NULL,
                workspace_data_json TEXT,
                metadata TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(client_gstin, fy, taxonomy_type)
            );
        `);
        db.run(`CREATE INDEX IF NOT EXISTS idx_fin_statements_client_fy ON financial_statements_workspaces(client_gstin, fy, taxonomy_type);`);

        // 6. Suite 02: Core GST Reconciliation History (PR vs 2B) & Vendor Dispute Notes
        db.run(`
            CREATE TABLE IF NOT EXISTS gst_reconciliation_runs (
                run_id TEXT PRIMARY KEY,
                client_gstin TEXT NOT NULL,
                fy TEXT NOT NULL,
                run_date DATETIME DEFAULT CURRENT_TIMESTAMP,
                summary_json TEXT,
                matched_records_json TEXT,
                vendor_disputes_json TEXT,
                metadata TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);
        db.run(`CREATE INDEX IF NOT EXISTS idx_reco_runs_client_fy ON gst_reconciliation_runs(client_gstin, fy);`);
    });
}

/**
 * Setup Express REST routes for unified audit persistence
 */
export default function setupAuditStorageRoutes(app, db, defaultUserDataPath = '.') {
    let activeDb = db;
    if (!activeDb) {
        const dbPath = path.join(defaultUserDataPath || process.cwd(), 'network_data.db');
        activeDb = new sqlite3.Database(dbPath);
    }

    // Initialize tables
    initAuditStorageDatabase(activeDb);

    // ─── HEALTH CHECK ────────────────────────────────────────────────────────
    app.get('/api/audit-storage/health', (req, res) => {
        activeDb.all(
            `SELECT name FROM sqlite_master WHERE type='table' AND name IN (
                'audit_clause44_records', 'audit_depreciation_assets', 'audit_sa530_samples',
                'cma_appraisals', 'financial_statements_workspaces', 'gst_reconciliation_runs'
            )`,
            [],
            (err, rows) => {
                if (err) return res.status(500).json({ success: false, error: err.message });
                res.json({
                    success: true,
                    status: 'ok',
                    initialized_tables: (rows || []).map(r => r.name),
                    timestamp: new Date().toISOString()
                });
            }
        );
    });

    // ─── 1. SUITE 05: TAX AUDIT CLAUSE 44 SPEND ──────────────────────────────
    app.post('/api/audit-storage/clause44/save', (req, res) => {
        const b = req.body || {};
        const client_gstin = String(b.client_gstin || b.clientGstin || '').trim().toUpperCase();
        const fy = String(b.fy || '').trim();

        if (!client_gstin || !fy) {
            return res.status(400).json({ success: false, error: 'client_gstin and fy are required' });
        }

        const spend_data_json = typeof b.spend_data === 'object' ? JSON.stringify(b.spend_data) : (b.spend_data_json || b.spend_data || null);
        const summary_json = typeof b.summary === 'object' ? JSON.stringify(b.summary) : (b.summary_json || b.summary || null);
        const metadata = typeof b.metadata === 'object' ? JSON.stringify(b.metadata) : (b.metadata || null);

        const sql = `
            INSERT INTO audit_clause44_records (client_gstin, fy, spend_data_json, summary_json, metadata, updated_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(client_gstin, fy) DO UPDATE SET
                spend_data_json = excluded.spend_data_json,
                summary_json = excluded.summary_json,
                metadata = excluded.metadata,
                updated_at = CURRENT_TIMESTAMP
        `;

        activeDb.run(sql, [client_gstin, fy, spend_data_json, summary_json, metadata], function (err) {
            if (err) return res.status(500).json({ success: false, error: err.message });
            res.json({
                success: true,
                message: 'Clause 44 working paper saved successfully',
                client_gstin,
                fy,
                updated_at: new Date().toISOString()
            });
        });
    });

    app.get('/api/audit-storage/clause44/:gstin/:fy', (req, res) => {
        const client_gstin = String(req.params.gstin || '').trim().toUpperCase();
        const fy = String(req.params.fy || '').trim();

        const sql = `SELECT * FROM audit_clause44_records WHERE client_gstin = ? AND fy = ? LIMIT 1`;
        activeDb.get(sql, [client_gstin, fy], (err, row) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            if (!row) return res.json({ success: true, data: null });

            try {
                res.json({
                    success: true,
                    data: {
                        id: row.id,
                        client_gstin: row.client_gstin,
                        fy: row.fy,
                        spend_data: row.spend_data_json ? JSON.parse(row.spend_data_json) : null,
                        summary: row.summary_json ? JSON.parse(row.summary_json) : null,
                        metadata: row.metadata ? JSON.parse(row.metadata) : null,
                        updated_at: row.updated_at
                    }
                });
            } catch (parseErr) {
                res.status(500).json({ success: false, error: 'Corrupt JSON data in record', detail: parseErr.message });
            }
        });
    });

    // ─── 2. SUITE 05: DEPRECIATION MODULE ────────────────────────────────────
    app.post('/api/audit-storage/depreciation/save', (req, res) => {
        const b = req.body || {};
        const client_gstin = String(b.client_gstin || b.clientGstin || '').trim().toUpperCase();
        const fy = String(b.fy || '').trim();

        if (!client_gstin || !fy) {
            return res.status(400).json({ success: false, error: 'client_gstin and fy are required' });
        }

        const assets_data_json = typeof b.assets_data === 'object' ? JSON.stringify(b.assets_data) : (b.assets_data_json || b.assets_data || null);
        const dta_dtl_json = typeof b.dta_dtl === 'object' ? JSON.stringify(b.dta_dtl) : (b.dta_dtl_json || b.dta_dtl || null);
        const metadata = typeof b.metadata === 'object' ? JSON.stringify(b.metadata) : (b.metadata || null);

        const sql = `
            INSERT INTO audit_depreciation_assets (client_gstin, fy, assets_data_json, dta_dtl_json, metadata, updated_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(client_gstin, fy) DO UPDATE SET
                assets_data_json = excluded.assets_data_json,
                dta_dtl_json = excluded.dta_dtl_json,
                metadata = excluded.metadata,
                updated_at = CURRENT_TIMESTAMP
        `;

        activeDb.run(sql, [client_gstin, fy, assets_data_json, dta_dtl_json, metadata], function (err) {
            if (err) return res.status(500).json({ success: false, error: err.message });
            res.json({
                success: true,
                message: 'Depreciation schedule saved successfully',
                client_gstin,
                fy,
                updated_at: new Date().toISOString()
            });
        });
    });

    app.get('/api/audit-storage/depreciation/:gstin/:fy', (req, res) => {
        const client_gstin = String(req.params.gstin || '').trim().toUpperCase();
        const fy = String(req.params.fy || '').trim();

        const sql = `SELECT * FROM audit_depreciation_assets WHERE client_gstin = ? AND fy = ? LIMIT 1`;
        activeDb.get(sql, [client_gstin, fy], (err, row) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            if (!row) return res.json({ success: true, data: null });

            try {
                res.json({
                    success: true,
                    data: {
                        id: row.id,
                        client_gstin: row.client_gstin,
                        fy: row.fy,
                        assets_data: row.assets_data_json ? JSON.parse(row.assets_data_json) : null,
                        dta_dtl: row.dta_dtl_json ? JSON.parse(row.dta_dtl_json) : null,
                        metadata: row.metadata ? JSON.parse(row.metadata) : null,
                        updated_at: row.updated_at
                    }
                });
            } catch (parseErr) {
                res.status(500).json({ success: false, error: 'Corrupt JSON data in record', detail: parseErr.message });
            }
        });
    });

    // ─── 3. SUITE 05: SA 530 MONETARY UNIT SAMPLING ──────────────────────────
    app.post('/api/audit-storage/sa530/save', (req, res) => {
        const b = req.body || {};
        const client_gstin = String(b.client_gstin || b.clientGstin || '').trim().toUpperCase();
        const fy = String(b.fy || '').trim();
        const audit_area = String(b.audit_area || b.auditArea || 'General Sampling').trim();

        if (!client_gstin || !fy) {
            return res.status(400).json({ success: false, error: 'client_gstin and fy are required' });
        }

        const sample_vouchers_json = typeof b.sample_vouchers === 'object' ? JSON.stringify(b.sample_vouchers) : (b.sample_vouchers_json || b.sample_vouchers || null);
        const parameters_json = typeof b.parameters === 'object' ? JSON.stringify(b.parameters) : (b.parameters_json || b.parameters || null);
        const metadata = typeof b.metadata === 'object' ? JSON.stringify(b.metadata) : (b.metadata || null);

        const sql = `
            INSERT INTO audit_sa530_samples (client_gstin, fy, audit_area, sample_vouchers_json, parameters_json, metadata, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `;

        activeDb.run(sql, [client_gstin, fy, audit_area, sample_vouchers_json, parameters_json, metadata], function (err) {
            if (err) return res.status(500).json({ success: false, error: err.message });
            res.json({
                success: true,
                id: this.lastID,
                message: 'SA 530 sample paper saved successfully',
                updated_at: new Date().toISOString()
            });
        });
    });

    app.get('/api/audit-storage/sa530/:gstin/:fy', (req, res) => {
        const client_gstin = String(req.params.gstin || '').trim().toUpperCase();
        const fy = String(req.params.fy || '').trim();

        const sql = `SELECT * FROM audit_sa530_samples WHERE client_gstin = ? AND fy = ? ORDER BY id DESC`;
        activeDb.all(sql, [client_gstin, fy], (err, rows) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            try {
                const parsed = (rows || []).map(r => ({
                    id: r.id,
                    client_gstin: r.client_gstin,
                    fy: r.fy,
                    audit_area: r.audit_area,
                    sample_vouchers: r.sample_vouchers_json ? JSON.parse(r.sample_vouchers_json) : [],
                    parameters: r.parameters_json ? JSON.parse(r.parameters_json) : null,
                    metadata: r.metadata ? JSON.parse(r.metadata) : null,
                    updated_at: r.updated_at
                }));
                res.json({ success: true, samples: parsed });
            } catch (parseErr) {
                res.status(500).json({ success: false, error: 'Corrupt JSON data in records', detail: parseErr.message });
            }
        });
    });

    // ─── 4. SUITE 06: BANK CMA APPRAISAL ─────────────────────────────────────
    app.post('/api/audit-storage/cma/save', (req, res) => {
        const b = req.body || {};
        const client_gstin = String(b.client_gstin || b.clientGstin || '').trim().toUpperCase();
        const fy = String(b.fy || '').trim();

        if (!client_gstin || !fy) {
            return res.status(400).json({ success: false, error: 'client_gstin and fy are required' });
        }

        const projection_data_json = typeof b.projection_data === 'object' ? JSON.stringify(b.projection_data) : (b.projection_data_json || b.projection_data || null);
        const mpbf_outputs_json = typeof b.mpbf_outputs === 'object' ? JSON.stringify(b.mpbf_outputs) : (b.mpbf_outputs_json || b.mpbf_outputs || null);
        const metadata = typeof b.metadata === 'object' ? JSON.stringify(b.metadata) : (b.metadata || null);

        const sql = `
            INSERT INTO cma_appraisals (client_gstin, fy, projection_data_json, mpbf_outputs_json, metadata, updated_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(client_gstin, fy) DO UPDATE SET
                projection_data_json = excluded.projection_data_json,
                mpbf_outputs_json = excluded.mpbf_outputs_json,
                metadata = excluded.metadata,
                updated_at = CURRENT_TIMESTAMP
        `;

        activeDb.run(sql, [client_gstin, fy, projection_data_json, mpbf_outputs_json, metadata], function (err) {
            if (err) return res.status(500).json({ success: false, error: err.message });
            res.json({
                success: true,
                message: 'CMA appraisal saved successfully',
                client_gstin,
                fy,
                updated_at: new Date().toISOString()
            });
        });
    });

    app.get('/api/audit-storage/cma/:gstin/:fy', (req, res) => {
        const client_gstin = String(req.params.gstin || '').trim().toUpperCase();
        const fy = String(req.params.fy || '').trim();

        const sql = `SELECT * FROM cma_appraisals WHERE client_gstin = ? AND fy = ? LIMIT 1`;
        activeDb.get(sql, [client_gstin, fy], (err, row) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            if (!row) return res.json({ success: true, data: null });

            try {
                res.json({
                    success: true,
                    data: {
                        id: row.id,
                        client_gstin: row.client_gstin,
                        fy: row.fy,
                        projection_data: row.projection_data_json ? JSON.parse(row.projection_data_json) : null,
                        mpbf_outputs: row.mpbf_outputs_json ? JSON.parse(row.mpbf_outputs_json) : null,
                        metadata: row.metadata ? JSON.parse(row.metadata) : null,
                        updated_at: row.updated_at
                    }
                });
            } catch (parseErr) {
                res.status(500).json({ success: false, error: 'Corrupt JSON data in record', detail: parseErr.message });
            }
        });
    });

    // ─── 5. SUITE 06: FINANCIAL STATEMENTS WORKSPACES ────────────────────────
    app.post('/api/audit-storage/fin-statements/save', (req, res) => {
        const b = req.body || {};
        const client_gstin = String(b.client_gstin || b.clientGstin || '').trim().toUpperCase();
        const fy = String(b.fy || '').trim();
        const taxonomy_type = String(b.taxonomy_type || b.taxonomyType || b.taxonomy || 'company').trim().toLowerCase();

        if (!client_gstin || !fy) {
            return res.status(400).json({ success: false, error: 'client_gstin and fy are required' });
        }

        const workspace_data_json = typeof b.workspace_data === 'object' ? JSON.stringify(b.workspace_data) : (b.workspace_data_json || b.workspace_data || null);
        const metadata = typeof b.metadata === 'object' ? JSON.stringify(b.metadata) : (b.metadata || null);

        const sql = `
            INSERT INTO financial_statements_workspaces (client_gstin, fy, taxonomy_type, workspace_data_json, metadata, updated_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(client_gstin, fy, taxonomy_type) DO UPDATE SET
                workspace_data_json = excluded.workspace_data_json,
                metadata = excluded.metadata,
                updated_at = CURRENT_TIMESTAMP
        `;

        activeDb.run(sql, [client_gstin, fy, taxonomy_type, workspace_data_json, metadata], function (err) {
            if (err) return res.status(500).json({ success: false, error: err.message });
            res.json({
                success: true,
                message: 'Financial statements workspace saved successfully',
                client_gstin,
                fy,
                taxonomy_type,
                updated_at: new Date().toISOString()
            });
        });
    });

    app.get('/api/audit-storage/fin-statements/:gstin/:fy', (req, res) => {
        const client_gstin = String(req.params.gstin || '').trim().toUpperCase();
        const fy = String(req.params.fy || '').trim();
        const taxonomy_type = req.query.taxonomy ? String(req.query.taxonomy).trim().toLowerCase() : null;

        let sql = `SELECT * FROM financial_statements_workspaces WHERE client_gstin = ? AND fy = ?`;
        const params = [client_gstin, fy];

        if (taxonomy_type) {
            sql += ` AND taxonomy_type = ? LIMIT 1`;
            params.push(taxonomy_type);
            activeDb.get(sql, params, (err, row) => {
                if (err) return res.status(500).json({ success: false, error: err.message });
                if (!row) return res.json({ success: true, data: null });
                try {
                    res.json({
                        success: true,
                        data: {
                            id: row.id,
                            client_gstin: row.client_gstin,
                            fy: row.fy,
                            taxonomy_type: row.taxonomy_type,
                            workspace_data: row.workspace_data_json ? JSON.parse(row.workspace_data_json) : null,
                            metadata: row.metadata ? JSON.parse(row.metadata) : null,
                            updated_at: row.updated_at
                        }
                    });
                } catch (parseErr) {
                    res.status(500).json({ success: false, error: 'Corrupt JSON data in record', detail: parseErr.message });
                }
            });
        } else {
            sql += ` ORDER BY id DESC`;
            activeDb.all(sql, params, (err, rows) => {
                if (err) return res.status(500).json({ success: false, error: err.message });
                try {
                    const parsed = (rows || []).map(r => ({
                        id: r.id,
                        client_gstin: r.client_gstin,
                        fy: r.fy,
                        taxonomy_type: r.taxonomy_type,
                        workspace_data: r.workspace_data_json ? JSON.parse(r.workspace_data_json) : null,
                        metadata: r.metadata ? JSON.parse(r.metadata) : null,
                        updated_at: r.updated_at
                    }));
                    res.json({ success: true, workspaces: parsed });
                } catch (parseErr) {
                    res.status(500).json({ success: false, error: 'Corrupt JSON data in records', detail: parseErr.message });
                }
            });
        }
    });

    // ─── 6. SUITE 02: CORE GST RECONCILIATION RUNS ───────────────────────────
    app.post('/api/audit-storage/reco-runs/save', (req, res) => {
        const b = req.body || {};
        const client_gstin = String(b.client_gstin || b.clientGstin || '').trim().toUpperCase();
        const fy = String(b.fy || '').trim();
        const run_id = String(b.run_id || b.runId || `reco_${client_gstin}_${fy}_${Date.now()}`).trim();

        if (!client_gstin || !fy) {
            return res.status(400).json({ success: false, error: 'client_gstin and fy are required' });
        }

        const summary_json = typeof b.summary === 'object' ? JSON.stringify(b.summary) : (b.summary_json || b.summary || null);
        const matched_records_json = typeof b.matched_records === 'object' ? JSON.stringify(b.matched_records) : (b.matched_records_json || b.matched_records || null);
        const vendor_disputes_json = typeof b.vendor_disputes === 'object' ? JSON.stringify(b.vendor_disputes) : (b.vendor_disputes_json || b.vendor_disputes || null);
        const metadata = typeof b.metadata === 'object' ? JSON.stringify(b.metadata) : (b.metadata || null);

        const sql = `
            INSERT INTO gst_reconciliation_runs (
                run_id, client_gstin, fy, run_date, summary_json, matched_records_json, vendor_disputes_json, metadata, updated_at
            ) VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(run_id) DO UPDATE SET
                summary_json = excluded.summary_json,
                matched_records_json = excluded.matched_records_json,
                vendor_disputes_json = excluded.vendor_disputes_json,
                metadata = excluded.metadata,
                updated_at = CURRENT_TIMESTAMP
        `;

        activeDb.run(sql, [run_id, client_gstin, fy, summary_json, matched_records_json, vendor_disputes_json, metadata], function (err) {
            if (err) return res.status(500).json({ success: false, error: err.message });
            res.json({
                success: true,
                run_id,
                message: 'GST reconciliation run saved successfully',
                client_gstin,
                fy,
                updated_at: new Date().toISOString()
            });
        });
    });

    // List runs without heavy matched_records
    app.get('/api/audit-storage/reco-runs/:gstin/:fy', (req, res) => {
        const client_gstin = String(req.params.gstin || '').trim().toUpperCase();
        const fy = String(req.params.fy || '').trim();

        const sql = `
            SELECT run_id, client_gstin, fy, run_date, summary_json, metadata, updated_at
            FROM gst_reconciliation_runs
            WHERE client_gstin = ? AND fy = ?
            ORDER BY run_date DESC
        `;
        activeDb.all(sql, [client_gstin, fy], (err, rows) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            try {
                const parsed = (rows || []).map(r => ({
                    run_id: r.run_id,
                    client_gstin: r.client_gstin,
                    fy: r.fy,
                    run_date: r.run_date,
                    summary: r.summary_json ? JSON.parse(r.summary_json) : null,
                    metadata: r.metadata ? JSON.parse(r.metadata) : null,
                    updated_at: r.updated_at
                }));
                res.json({ success: true, runs: parsed });
            } catch (parseErr) {
                res.status(500).json({ success: false, error: 'Corrupt JSON data in runs', detail: parseErr.message });
            }
        });
    });

    // Detailed run fetch with full records
    app.get('/api/audit-storage/reco-runs/detail/:runId', (req, res) => {
        const runId = String(req.params.runId || '').trim();
        const sql = `SELECT * FROM gst_reconciliation_runs WHERE run_id = ? LIMIT 1`;

        activeDb.get(sql, [runId], (err, row) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            if (!row) return res.status(404).json({ success: false, error: 'Reconciliation run not found' });

            try {
                res.json({
                    success: true,
                    data: {
                        run_id: row.run_id,
                        client_gstin: row.client_gstin,
                        fy: row.fy,
                        run_date: row.run_date,
                        summary: row.summary_json ? JSON.parse(row.summary_json) : null,
                        matched_records: row.matched_records_json ? JSON.parse(row.matched_records_json) : [],
                        vendor_disputes: row.vendor_disputes_json ? JSON.parse(row.vendor_disputes_json) : [],
                        metadata: row.metadata ? JSON.parse(row.metadata) : null,
                        updated_at: row.updated_at
                    }
                });
            } catch (parseErr) {
                res.status(500).json({ success: false, error: 'Corrupt JSON in reconciliation run details', detail: parseErr.message });
            }
        });
    });

    // Delete a run
    app.delete('/api/audit-storage/reco-runs/:runId', (req, res) => {
        const runId = String(req.params.runId || '').trim();
        const sql = `DELETE FROM gst_reconciliation_runs WHERE run_id = ?`;

        activeDb.run(sql, [runId], function (err) {
            if (err) return res.status(500).json({ success: false, error: err.message });
            if (this.changes === 0) return res.status(404).json({ success: false, error: 'Run not found' });
            res.json({ success: true, message: 'Reconciliation run deleted successfully', run_id: runId });
        });
    });
}
