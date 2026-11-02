import path from 'path';
import fs from 'fs';
import XLSX from 'xlsx';

/**
 * Initialize SQLite database tables and indexes for the Monthly Audit Suite
 */
export function initMonthlyAuditDatabase(db) {
    db.serialize(() => {
        // Enable foreign keys
        db.run(`PRAGMA foreign_keys = ON;`);

        // 1. Master Monthly Audits Header
        db.run(`
            CREATE TABLE IF NOT EXISTS monthly_audits (
                id TEXT PRIMARY KEY,
                client_gstin TEXT NOT NULL,
                client_name TEXT NOT NULL,
                fy TEXT NOT NULL,
                month TEXT NOT NULL,
                auditor_name TEXT,
                team_members TEXT,
                audit_type TEXT DEFAULT 'Monthly Statutory Audit',
                turnover_inc_gst REAL DEFAULT 0,
                turnover_books REAL DEFAULT 0,
                turnover_gst REAL DEFAULT 0,
                turnover_variance REAL DEFAULT 0,
                audit_start_date TEXT,
                audit_end_date TEXT,
                status TEXT DEFAULT 'Draft',
                audit_status TEXT DEFAULT 'DRAFT',
                prepared_by TEXT,
                prepared_at INTEGER,
                reviewed_by TEXT,
                reviewed_at INTEGER,
                senior_review_notes TEXT,
                released_by TEXT,
                released_at INTEGER,
                release_channel TEXT,
                general_summary TEXT,
                metadata TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                UNIQUE(client_gstin, fy, month)
            );
        `);

        // 2. Audit Checklists Table
        db.run(`
            CREATE TABLE IF NOT EXISTS audit_checklists (
                id TEXT PRIMARY KEY,
                audit_id TEXT NOT NULL,
                section_key TEXT NOT NULL,
                item_key TEXT NOT NULL,
                item_title TEXT NOT NULL,
                status TEXT DEFAULT 'Pending',
                sample_checked TEXT,
                remarks TEXT,
                amount_involved REAL DEFAULT 0,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY (audit_id) REFERENCES monthly_audits(id) ON DELETE CASCADE
            );
        `);

        // 3. Current Year Observations Table
        db.run(`
            CREATE TABLE IF NOT EXISTS audit_observations (
                id TEXT PRIMARY KEY,
                audit_id TEXT NOT NULL,
                client_gstin TEXT NOT NULL,
                section_key TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                severity TEXT NOT NULL DEFAULT 'Medium',
                risk_category TEXT,
                financial_exposure REAL DEFAULT 0,
                voucher_ref TEXT,
                auditor_recommendation TEXT,
                management_response TEXT,
                status TEXT DEFAULT 'Open',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY (audit_id) REFERENCES monthly_audits(id) ON DELETE CASCADE
            );
        `);

        // 4. Cross-Month Persistent Pending Points Table
        db.run(`
            CREATE TABLE IF NOT EXISTS audit_pending_points (
                id TEXT PRIMARY KEY,
                client_gstin TEXT NOT NULL,
                client_name TEXT NOT NULL,
                origin_audit_id TEXT NOT NULL,
                origin_fy TEXT NOT NULL,
                origin_month TEXT NOT NULL,
                point_title TEXT NOT NULL,
                point_description TEXT NOT NULL,
                category TEXT NOT NULL,
                severity TEXT NOT NULL DEFAULT 'Medium',
                status TEXT NOT NULL DEFAULT 'Pending',
                assigned_to TEXT,
                target_date TEXT,
                resolution_remarks TEXT,
                resolved_in_month TEXT,
                verified_by TEXT,
                created_at INTEGER NOT NULL,
                cleared_at INTEGER,
                updated_at INTEGER NOT NULL
            );
        `);

        // 5. Verification Data JSON Snapshot Cache Table
        db.run(`
            CREATE TABLE IF NOT EXISTS audit_verification_data (
                audit_id TEXT PRIMARY KEY,
                sales_reco_data TEXT,
                purchase_reco_data TEXT,
                cash_compliance_data TEXT,
                statutory_compliance_data TEXT,
                bank_loan_data TEXT,
                journal_reco_data TEXT,
                roc_loan_data TEXT,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY (audit_id) REFERENCES monthly_audits(id) ON DELETE CASCADE
            );
        `);

        // Migration safety for newly added columns if table already exists
        db.run(`ALTER TABLE monthly_audits ADD COLUMN vouching_registers TEXT;`, () => {});
        db.run(`ALTER TABLE audit_verification_data ADD COLUMN journal_reco_data TEXT;`, () => {});
        db.run(`ALTER TABLE audit_verification_data ADD COLUMN roc_loan_data TEXT;`, () => {});

        // Performance Indexes
        db.run(`CREATE INDEX IF NOT EXISTS idx_monthly_audits_client ON monthly_audits (client_gstin, fy);`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_monthly_audits_status ON monthly_audits (status);`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_audit_checklists_audit_id ON audit_checklists (audit_id);`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_audit_observations_audit_id ON audit_observations (audit_id);`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_audit_observations_client ON audit_observations (client_gstin);`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_pending_points_client ON audit_pending_points (client_gstin, status);`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_pending_points_origin ON audit_pending_points (origin_audit_id);`);
    });
}

/**
 * Express Route Handlers for Monthly Audit Suite
 */
export default function setupMonthlyAuditRoutes(app, db, defaultUserDataPath = '.') {
    // Ensure DB tables exist
    initMonthlyAuditDatabase(db);

    const safePathSegment = (str) => {
        if (!str) return 'UNKNOWN';
        return String(str).replace(/[<>:"/\\|?*]+/g, '_').trim();
    };

    // ─── 1. GET ALL MONTHLY AUDITS (FILTER BY GSTIN & FY & MONTH) ─────────
    app.get('/api/monthly-audits', (req, res) => {
        const gstin = req.query.gstin || req.query.client_gstin || req.query.clientGstin;
        const fy = req.query.fy;
        const month = req.query.month;
        let query = `SELECT * FROM monthly_audits WHERE 1=1`;
        const params = [];

        if (gstin) {
            query += ` AND client_gstin = ?`;
            params.push(gstin);
        }
        if (fy) {
            query += ` AND fy = ?`;
            params.push(fy);
        }
        if (month) {
            query += ` AND month = ?`;
            params.push(month);
        }
        query += ` ORDER BY fy DESC, month ASC`;

        db.all(query, params, (err, rows) => {
            if (err) {
                return res.status(500).json({ success: false, error: err.message });
            }
            res.json({ success: true, audits: rows || [] });
        });
    });

    // ─── 2. GET FULL MONTHLY AUDIT BUNDLE BY ID ────────────────────────────
    app.get('/api/monthly-audits/:id', (req, res) => {
        const { id } = req.params;

        db.get(`SELECT * FROM monthly_audits WHERE id = ?`, [id], (err, audit) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            if (!audit) return res.status(404).json({ success: false, error: 'Audit not found' });

            // Fetch checklists
            db.all(`SELECT * FROM audit_checklists WHERE audit_id = ? ORDER BY section_key, item_key`, [id], (errCheck, checklists) => {
                if (errCheck) return res.status(500).json({ success: false, error: errCheck.message });

                // Fetch observations
                db.all(`SELECT * FROM audit_observations WHERE audit_id = ? ORDER BY created_at DESC`, [id], (errObs, observations) => {
                    if (errObs) return res.status(500).json({ success: false, error: errObs.message });

                    // Fetch verification snapshot
                    db.get(`SELECT * FROM audit_verification_data WHERE audit_id = ?`, [id], (errData, vData) => {
                        if (errData) return res.status(500).json({ success: false, error: errData.message });

                        res.json({
                            success: true,
                            audit,
                            checklists: checklists || [],
                            observations: observations || [],
                            verificationData: vData || null
                        });
                    });
                });
            });
        });
    });

    // ─── 3. UPSERT MONTHLY AUDIT HEADER ────────────────────────────────────
    app.post('/api/monthly-audits', (req, res) => {
        const b = req.body || {};
        const client_gstin = b.client_gstin || b.clientGstin;
        const client_name = b.client_name || b.clientName || 'Client';
        const fy = b.fy;
        const month = b.month;
        const id = b.id;
        const auditor_name = b.auditor_name || b.auditorName;
        const team_members = b.team_members || b.teamMembers;
        const audit_type = b.audit_type || b.auditType || 'Monthly Statutory Audit';
        const turnover_inc_gst = b.turnover_inc_gst ?? b.turnoverIncGst ?? 0;
        const turnover_books = b.turnover_books ?? b.turnoverBooks ?? 0;
        const turnover_gst = b.turnover_gst ?? b.turnoverGst ?? 0;
        const turnover_variance = b.turnover_variance ?? b.turnoverVariance ?? 0;
        const audit_start_date = b.audit_start_date || b.auditStartDate || null;
        const audit_end_date = b.audit_end_date || b.auditEndDate || null;
        const status = b.status || 'Draft';
        const audit_status = b.audit_status || b.auditStatus || 'DRAFT';
        const prepared_by = b.prepared_by || b.preparedBy || null;
        const reviewed_by = b.reviewed_by || b.reviewedBy || null;
        const senior_review_notes = b.senior_review_notes || b.seniorReviewNotes || null;
        const release_channel = b.release_channel || b.releaseChannel || null;
        const general_summary = b.general_summary || b.generalSummary || '';
        const metadata = b.metadata;
        const vouching_registers = b.vouching_registers || b.vouchingRegisters;

        if (!client_gstin || !fy || !month) {
            return res.status(400).json({ success: false, error: 'client_gstin, fy, and month are required' });
        }

        const now = Date.now();
        const auditId = id || `audit_${client_gstin}_${fy}_${month}`.replace(/[^a-zA-Z0-9_-]/g, '_');
        const teamStr = Array.isArray(team_members) ? JSON.stringify(team_members) : (team_members || '[]');
        const metaStr = typeof metadata === 'object' ? JSON.stringify(metadata) : (metadata || '{}');
        const regStr = vouching_registers ? (typeof vouching_registers === 'object' ? JSON.stringify(vouching_registers) : vouching_registers) : null;

        const sql = `
            INSERT INTO monthly_audits (
                id, client_gstin, client_name, fy, month, auditor_name, team_members,
                audit_type, turnover_inc_gst, turnover_books, turnover_gst, turnover_variance,
                audit_start_date, audit_end_date, status, audit_status, prepared_by,
                prepared_at, reviewed_by, senior_review_notes, release_channel, general_summary,
                metadata, vouching_registers, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(client_gstin, fy, month) DO UPDATE SET
                client_name = excluded.client_name,
                auditor_name = COALESCE(excluded.auditor_name, monthly_audits.auditor_name),
                team_members = excluded.team_members,
                audit_type = excluded.audit_type,
                turnover_inc_gst = excluded.turnover_inc_gst,
                turnover_books = excluded.turnover_books,
                turnover_gst = excluded.turnover_gst,
                turnover_variance = excluded.turnover_variance,
                audit_start_date = excluded.audit_start_date,
                audit_end_date = excluded.audit_end_date,
                status = COALESCE(excluded.status, monthly_audits.status),
                audit_status = COALESCE(excluded.audit_status, monthly_audits.audit_status),
                prepared_by = COALESCE(excluded.prepared_by, monthly_audits.prepared_by),
                reviewed_by = COALESCE(excluded.reviewed_by, monthly_audits.reviewed_by),
                senior_review_notes = COALESCE(excluded.senior_review_notes, monthly_audits.senior_review_notes),
                release_channel = COALESCE(excluded.release_channel, monthly_audits.release_channel),
                general_summary = excluded.general_summary,
                metadata = excluded.metadata,
                vouching_registers = COALESCE(excluded.vouching_registers, monthly_audits.vouching_registers),
                updated_at = excluded.updated_at
        `;

        db.run(sql, [
            auditId,
            client_gstin,
            client_name,
            fy,
            month,
            auditor_name || null,
            teamStr,
            audit_type,
            turnover_inc_gst,
            turnover_books,
            turnover_gst,
            turnover_variance,
            audit_start_date,
            audit_end_date,
            status,
            audit_status,
            prepared_by,
            prepared_by ? now : null,
            reviewed_by,
            senior_review_notes,
            release_channel,
            general_summary,
            metaStr,
            regStr,
            now,
            now
        ], function (err) {
            if (err) return res.status(500).json({ success: false, error: err.message });
            res.json({ success: true, id: auditId, message: 'Monthly audit saved successfully' });
        });
    });

    // ─── 4. SUBMIT DRAFT FOR SENIOR REVIEW (JUNIOR ACTION WITH SENIOR SELECTION) ───
    app.post('/api/monthly-audits/:id/submit-review', (req, res) => {
        const { id } = req.params;
        const preparedBy = req.body.preparedBy || req.body.prepared_by;
        const reviewedBy = req.body.reviewedBy || req.body.reviewed_by;
        const notes = req.body.notes || req.body.general_summary;
        const now = Date.now();

        const sql = `
            UPDATE monthly_audits SET
                audit_status = 'SUBMITTED_FOR_REVIEW',
                status = 'Under Review',
                prepared_by = COALESCE(?, prepared_by),
                reviewed_by = COALESCE(?, reviewed_by),
                prepared_at = ?,
                general_summary = CASE WHEN ? THEN ? ELSE general_summary END,
                updated_at = ?
            WHERE id = ?
        `;

        db.run(sql, [preparedBy || null, reviewedBy || null, now, notes ? 1 : 0, notes || '', now, id], function (err) {
            if (err) return res.status(500).json({ success: false, error: err.message });
            if (this.changes === 0) return res.status(404).json({ success: false, error: 'Audit not found' });
            res.json({
                success: true,
                message: 'Audit submitted for senior review successfully',
                audit_status: 'SUBMITTED_FOR_REVIEW',
                reviewed_by: reviewedBy
            });
        });
    });

    // ─── 5. SENIOR REVIEW & SIGN-OFF (SENIOR ACTION) ────────────────────────
    app.post('/api/monthly-audits/:id/senior-review', (req, res) => {
        const { id } = req.params;
        const action = req.body.action; // 'APPROVE' | 'REQUEST_REVISION' | 'REVISE'
        const reviewedBy = req.body.reviewedBy || req.body.reviewed_by;
        const reviewNotes = req.body.reviewNotes || req.body.seniorReviewNotes || req.body.senior_review_notes;
        const now = Date.now();

        const isApprove = action === 'APPROVE';
        const isRevise = action === 'REQUEST_REVISION' || action === 'REVISE';

        if (!isApprove && !isRevise) {
            return res.status(400).json({ success: false, error: 'action must be APPROVE or REQUEST_REVISION' });
        }

        const newAuditStatus = isApprove ? 'APPROVED' : 'REVISION_REQUESTED';
        const newStatus = isApprove ? 'Completed' : 'Draft';

        const sql = `
            UPDATE monthly_audits SET
                audit_status = ?,
                status = ?,
                reviewed_by = COALESCE(?, reviewed_by),
                reviewed_at = ?,
                senior_review_notes = COALESCE(?, senior_review_notes),
                updated_at = ?
            WHERE id = ?
        `;

        db.run(sql, [newAuditStatus, newStatus, reviewedBy || null, now, reviewNotes || null, now, id], function (err) {
            if (err) return res.status(500).json({ success: false, error: err.message });
            if (this.changes === 0) return res.status(404).json({ success: false, error: 'Audit not found' });
            res.json({ success: true, audit_status: newAuditStatus, message: isApprove ? 'Audit approved and signed off' : 'Revision requested from junior' });
        });
    });

    // ─── 6. RELEASE REPORT TO CLIENT ───────────────────────────────────────
    app.post('/api/monthly-audits/:id/release-client', (req, res) => {
        const { id } = req.params;
        const { releasedBy, channel, workbookBase64, filename, clientName, gstin, fy, month } = req.body;
        const now = Date.now();

        db.get(`SELECT * FROM monthly_audits WHERE id = ?`, [id], (err, audit) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            if (!audit) return res.status(404).json({ success: false, error: 'Audit not found' });

            if (audit.audit_status !== 'APPROVED') {
                return res.status(400).json({ success: false, error: 'Audit must be APPROVED before release to client' });
            }

            let savedPath = null;
            if (workbookBase64 && filename) {
                try {
                    const cName = safePathSegment(clientName || audit.client_name);
                    const cGstin = safePathSegment(gstin || audit.client_gstin);
                    const cFy = safePathSegment(fy || audit.fy);
                    const cMonth = safePathSegment(month || audit.month);

                    const folderName = `${cName} - ${cGstin}`;
                    const targetDir = path.resolve(defaultUserDataPath, 'gst_returns_data', folderName, cFy, cMonth, 'Released to Client');
                    fs.mkdirSync(targetDir, { recursive: true });

                    const safeFile = safePathSegment(filename);
                    const fullFilePath = path.join(targetDir, safeFile);
                    fs.writeFileSync(fullFilePath, Buffer.from(workbookBase64, 'base64'));
                    savedPath = fullFilePath;

                    if (req.body.pdfBase64 && req.body.pdfFilename) {
                        const safePdfFile = safePathSegment(req.body.pdfFilename);
                        const fullPdfPath = path.join(targetDir, safePdfFile);
                        fs.writeFileSync(fullPdfPath, Buffer.from(req.body.pdfBase64, 'base64'));
                    }
                } catch (writeErr) {
                    console.error('[Monthly Audit API] Error writing released workbook:', writeErr);
                }
            }

            const sql = `
                UPDATE monthly_audits SET
                    audit_status = 'RELEASED',
                    released_by = COALESCE(?, released_by),
                    released_at = ?,
                    release_channel = ?,
                    updated_at = ?
                WHERE id = ?
            `;

            db.run(sql, [releasedBy || 'Auditor', now, channel || 'DIRECTORY', now, id], function (updateErr) {
                if (updateErr) return res.status(500).json({ success: false, error: updateErr.message });
                res.json({
                    success: true,
                    audit_status: 'RELEASED',
                    savedPath,
                    message: 'Report successfully released to client'
                });
            });
        });
    });

    // ─── 7. BATCH UPSERT CHECKLIST ITEMS ───────────────────────────────────
    app.post('/api/monthly-audits/:id/checklists/batch', (req, res) => {
        const { id } = req.params;
        const { items } = req.body;

        if (!Array.isArray(items)) {
            return res.status(400).json({ success: false, error: 'items must be an array' });
        }

        const now = Date.now();
        db.serialize(() => {
            db.run(`BEGIN TRANSACTION`);
            const stmt = db.prepare(`
                INSERT INTO audit_checklists (
                    id, audit_id, section_key, item_key, item_title, status,
                    sample_checked, remarks, amount_involved, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    status = excluded.status,
                    sample_checked = excluded.sample_checked,
                    remarks = excluded.remarks,
                    amount_involved = excluded.amount_involved,
                    updated_at = excluded.updated_at
            `);

            items.forEach((item) => {
                const sectionKey = item.section_key || item.sectionKey || 'general';
                const itemKey = item.item_key || item.itemKey || 'item';
                const itemTitle = item.item_title || item.itemTitle || 'Checklist Item';
                const amountInvolved = item.amount_involved ?? item.amountInvolved ?? 0;
                const sampleChecked = item.sample_checked ?? item.sampleChecked ?? '';
                const itemId = item.id || `${id}_${sectionKey}_${itemKey}`;

                stmt.run([
                    itemId,
                    id,
                    sectionKey,
                    itemKey,
                    itemTitle,
                    item.status || 'Pending',
                    sampleChecked,
                    item.remarks || '',
                    amountInvolved,
                    now
                ]);
            });

            stmt.finalize();
            db.run(`COMMIT`, (err) => {
                if (err) return res.status(500).json({ success: false, error: err.message });
                res.json({ success: true, count: items.length, message: 'Checklists updated successfully' });
            });
        });
    });

    // ─── 8. UPSERT SINGLE OBSERVATION ──────────────────────────────────────
    app.post('/api/monthly-audits/:id/observations', (req, res) => {
        const { id } = req.params;
        const b = req.body || {};
        const title = b.title;

        if (!title) {
            return res.status(400).json({ success: false, error: 'title is required' });
        }

        const observationId = b.obsId || b.id || `obs_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const client_gstin = b.client_gstin || b.clientGstin || '';
        const section_key = b.section_key || b.sectionKey || 'general';
        const description = b.description || '';
        const severity = b.severity || 'Medium';
        const risk_category = b.risk_category || b.riskCategory || 'Internal Controls';
        const financial_exposure = b.financial_exposure ?? b.financialExposure ?? 0;
        const voucher_ref = b.voucher_ref || b.voucherRef || '';
        const auditor_recommendation = b.auditor_recommendation || b.auditorRecommendation || '';
        const management_response = b.management_response || b.managementResponse || '';
        const status = b.status || 'Open';
        const now = Date.now();

        const sql = `
            INSERT INTO audit_observations (
                id, audit_id, client_gstin, section_key, title, description,
                severity, risk_category, financial_exposure, voucher_ref,
                auditor_recommendation, management_response, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                description = excluded.description,
                severity = excluded.severity,
                risk_category = excluded.risk_category,
                financial_exposure = excluded.financial_exposure,
                voucher_ref = excluded.voucher_ref,
                auditor_recommendation = excluded.auditor_recommendation,
                management_response = excluded.management_response,
                status = excluded.status,
                updated_at = excluded.updated_at
        `;

        db.run(sql, [
            observationId,
            id,
            client_gstin,
            section_key,
            title,
            description,
            severity,
            risk_category,
            financial_exposure,
            voucher_ref,
            auditor_recommendation,
            management_response,
            status,
            now,
            now
        ], function (err) {
            if (err) return res.status(500).json({ success: false, error: err.message });
            res.json({ success: true, id: observationId, message: 'Observation saved' });
        });
    });

    // ─── 9. DELETE OBSERVATION ─────────────────────────────────────────────
    app.delete('/api/monthly-audits/:id/observations/:obsId', (req, res) => {
        const { id, obsId } = req.params;
        db.run(`DELETE FROM audit_observations WHERE id = ? AND audit_id = ?`, [obsId, id], function (err) {
            if (err) return res.status(500).json({ success: false, error: err.message });
            res.json({ success: true, message: 'Observation deleted' });
        });
    });

    // ─── 10. GET CROSS-MONTH PENDING POINTS ────────────────────────────────
    app.get('/api/audit-pending-points', (req, res) => {
        const gstin = req.query.gstin || req.query.client_gstin || req.query.clientGstin;
        const status = req.query.status;
        let query = `SELECT * FROM audit_pending_points WHERE 1=1`;
        const params = [];

        if (gstin) {
            query += ` AND client_gstin = ?`;
            params.push(gstin);
        }
        if (status) {
            const statuses = status.split(',').map(s => s.trim());
            query += ` AND status IN (${statuses.map(() => '?').join(',')})`;
            params.push(...statuses);
        }
        query += ` ORDER BY created_at DESC`;

        db.all(query, params, (err, rows) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            res.json({ success: true, points: rows || [] });
        });
    });

    // ─── 11. CREATE OR PROMOTE PENDING POINT ───────────────────────────────
    app.post('/api/audit-pending-points', (req, res) => {
        const b = req.body || {};
        const client_gstin = b.client_gstin || b.clientGstin;
        const point_title = b.point_title || b.pointTitle || b.title;

        if (!client_gstin || !point_title) {
            return res.status(400).json({ success: false, error: 'client_gstin and point_title required' });
        }

        const pointId = b.id || `pt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const client_name = b.client_name || b.clientName || 'Client';
        const origin_audit_id = b.origin_audit_id || b.originAuditId || '';
        const origin_fy = b.origin_fy || b.originFy || '';
        const origin_month = b.origin_month || b.originMonth || '';
        const point_description = b.point_description || b.pointDescription || b.description || '';
        const category = b.category || 'General Audit';
        const severity = b.severity || 'Medium';
        const status = b.status || 'Pending';
        const assigned_to = b.assigned_to || b.assignedTo || '';
        const target_date = b.target_date || b.targetDate || null;
        const now = Date.now();

        const sql = `
            INSERT INTO audit_pending_points (
                id, client_gstin, client_name, origin_audit_id, origin_fy, origin_month,
                point_title, point_description, category, severity, status, assigned_to,
                target_date, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                point_title = excluded.point_title,
                point_description = excluded.point_description,
                category = excluded.category,
                severity = excluded.severity,
                status = excluded.status,
                assigned_to = excluded.assigned_to,
                target_date = excluded.target_date,
                updated_at = excluded.updated_at
        `;

        db.run(sql, [
            pointId,
            client_gstin,
            client_name,
            origin_audit_id,
            origin_fy,
            origin_month,
            point_title,
            point_description,
            category,
            severity,
            status,
            assigned_to,
            target_date,
            now,
            now
        ], function (err) {
            if (err) return res.status(500).json({ success: false, error: err.message });
            res.json({ success: true, id: pointId, message: 'Pending point saved' });
        });
    });

    // ─── 12. UPDATE PENDING POINT STATUS & RESOLUTION ───────────────────────
    app.put('/api/audit-pending-points/:id', (req, res) => {
        const { id } = req.params;
        const b = req.body || {};
        const status = b.status;
        const resolution_remarks = b.resolution_remarks || b.resolutionRemarks;
        const resolved_in_month = b.resolved_in_month || b.resolvedInMonth;
        const verified_by = b.verified_by || b.verifiedBy;
        const now = Date.now();

        const isCleared = status === 'Cleared';
        const sql = `
            UPDATE audit_pending_points SET
                status = COALESCE(?, status),
                resolution_remarks = COALESCE(?, resolution_remarks),
                resolved_in_month = COALESCE(?, resolved_in_month),
                verified_by = COALESCE(?, verified_by),
                cleared_at = CASE WHEN ? THEN ? ELSE cleared_at END,
                updated_at = ?
            WHERE id = ?
        `;

        db.run(sql, [
            status || null,
            resolution_remarks || null,
            resolved_in_month || null,
            verified_by || null,
            isCleared ? 1 : 0,
            now,
            now,
            id
        ], function (err) {
            if (err) return res.status(500).json({ success: false, error: err.message });
            if (this.changes === 0) return res.status(404).json({ success: false, error: 'Point not found' });
            res.json({ success: true, message: 'Pending point updated successfully' });
        });
    });

    // ─── 13. CACHE VERIFICATION SCAN DATA SNAPSHOT ─────────────────────────
    app.post('/api/monthly-audits/:id/save-verification-data', (req, res) => {
        const { id } = req.params;
        const b = req.body || {};
        const sales_reco_data = b.sales_reco_data || b.sales;
        const purchase_reco_data = b.purchase_reco_data || b.purchase;
        const cash_compliance_data = b.cash_compliance_data || b.cashCompliance;
        const statutory_compliance_data = b.statutory_compliance_data || b.labor;
        const bank_loan_data = b.bank_loan_data || b.bankLoans;
        const journal_reco_data = b.journal_reco_data || b.journal;
        const roc_loan_data = b.roc_loan_data || b.rocLoans;

        const now = Date.now();
        const sql = `
            INSERT INTO audit_verification_data (
                audit_id, sales_reco_data, purchase_reco_data, cash_compliance_data,
                statutory_compliance_data, bank_loan_data, journal_reco_data, roc_loan_data, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(audit_id) DO UPDATE SET
                sales_reco_data = COALESCE(excluded.sales_reco_data, audit_verification_data.sales_reco_data),
                purchase_reco_data = COALESCE(excluded.purchase_reco_data, audit_verification_data.purchase_reco_data),
                cash_compliance_data = COALESCE(excluded.cash_compliance_data, audit_verification_data.cash_compliance_data),
                statutory_compliance_data = COALESCE(excluded.statutory_compliance_data, audit_verification_data.statutory_compliance_data),
                bank_loan_data = COALESCE(excluded.bank_loan_data, audit_verification_data.bank_loan_data),
                journal_reco_data = COALESCE(excluded.journal_reco_data, audit_verification_data.journal_reco_data),
                roc_loan_data = COALESCE(excluded.roc_loan_data, audit_verification_data.roc_loan_data),
                updated_at = excluded.updated_at
        `;

        db.run(sql, [
            id,
            typeof sales_reco_data === 'object' ? JSON.stringify(sales_reco_data) : (sales_reco_data || null),
            typeof purchase_reco_data === 'object' ? JSON.stringify(purchase_reco_data) : (purchase_reco_data || null),
            typeof cash_compliance_data === 'object' ? JSON.stringify(cash_compliance_data) : (cash_compliance_data || null),
            typeof statutory_compliance_data === 'object' ? JSON.stringify(statutory_compliance_data) : (statutory_compliance_data || null),
            typeof bank_loan_data === 'object' ? JSON.stringify(bank_loan_data) : (bank_loan_data || null),
            typeof journal_reco_data === 'object' ? JSON.stringify(journal_reco_data) : (journal_reco_data || null),
            typeof roc_loan_data === 'object' ? JSON.stringify(roc_loan_data) : (roc_loan_data || null),
            now
        ], function (err) {
            if (err) return res.status(500).json({ success: false, error: err.message });
            res.json({ success: true, message: 'Verification data cached successfully' });
        });
    });

    // ─── 14. DIRECT CLIENT DIRECTORY AUTO-SAVE ─────────────────────────────
    app.post('/api/monthly-audits/:id/save-directory', (req, res) => {
        const { id } = req.params;
        const { workbookBase64, filename, clientName, gstin, fy, month } = req.body;

        if (!workbookBase64 || !filename) {
            return res.status(400).json({ success: false, error: 'workbookBase64 and filename are required' });
        }

        try {
            const cName = safePathSegment(clientName || 'Client');
            const cGstin = safePathSegment(gstin || 'GSTIN');
            const cFy = safePathSegment(fy || 'FY');
            const cMonth = safePathSegment(month || 'Month');

            const folderName = `${cName} - ${cGstin}`;
            const targetDir = path.resolve(defaultUserDataPath, 'gst_returns_data', folderName, cFy, cMonth, 'Audit Working');
            fs.mkdirSync(targetDir, { recursive: true });

            const safeFilename = safePathSegment(filename);
            const fullPath = path.join(targetDir, safeFilename);

            const buffer = Buffer.from(workbookBase64, 'base64');
            fs.writeFileSync(fullPath, buffer);

            res.json({
                success: true,
                savedPath: fullPath,
                filename: safeFilename,
                size: buffer.length,
                message: 'Working paper auto-saved to client directory successfully'
            });
        } catch (err) {
            console.error('[Monthly Audit API] Error saving to directory:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // ─── 15. PROFITABILITY STATUS FROM EXCEL FILE (CONFINED & VALIDATED) ──────
    app.get('/api/monthly-audits/profitability/from-file', (req, res) => {
        const filePath = req.query.filePath || req.query.path;
        if (!filePath) {
            return res.status(400).json({ success: false, error: 'filePath parameter is required' });
        }
        try {
            const resolvedPath = path.resolve(String(filePath).trim().replace(/^["']|["']$/g, ''));
            const baseDir = path.resolve(userDataPath, 'gst_returns_data');
            const allowedUserData = path.resolve(userDataPath);
            const cwdPath = path.resolve(process.cwd());

            if (!resolvedPath.startsWith(baseDir) && !resolvedPath.startsWith(allowedUserData) && !resolvedPath.startsWith(cwdPath)) {
                return res.status(403).json({ success: false, error: 'Access denied: path outside authorized directory' });
            }

            if (!fs.existsSync(resolvedPath)) {
                return res.status(404).json({ success: false, error: 'File not found at specified path' });
            }

            const wb = XLSX.readFile(resolvedPath);
            const sheetName = wb.SheetNames[0];
            const ws = wb.Sheets[sheetName];
            const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1 });

            let companyName = 'DYP INFRAPROJECTS PRIVATE LIMITED';
            let cin = 'U45309PN2017PTC173221';
            let registeredAddress = 'Kohinoor Majestic, 1st Floor, Office No. 126 & 127,Plot No. 85/186, Chinchwad, Pune - 411019. Maharashtra (India).';
            let periodEndedDate = '31-March-2026';

            let revenueFromOperations = 234202771;
            let otherIncome = 2034582;
            let costOfMaterialsConsumed = 179319171;
            let changeInInventories = -6873231;
            let employeeBenefitExpenses = 36176399;
            let financeCosts = 4614888;
            let depreciationAmortization = 2488741;
            let otherExpenses = 8727832;

            for (let r = 0; r < rawRows.length; r++) {
                const row = rawRows[r];
                if (!Array.isArray(row) || row.length === 0) continue;
                const lineStr = row.map(c => String(c || '').trim()).join(' ');

                if (r === 0 && row[0] && typeof row[0] === 'string' && row[0].trim().length > 3) {
                    companyName = String(row[0]).trim();
                }
                if (lineStr.includes('CIN:')) {
                    const match = lineStr.match(/CIN:\s*([A-Z0-9]+)/i);
                    if (match) cin = match[1];
                }
                if (lineStr.includes('Address:')) {
                    registeredAddress = lineStr.replace(/^\s*\(\s*Address:\s*/i, '').replace(/\)\s*$/, '').trim();
                }
                if (lineStr.includes('ended')) {
                    const match = lineStr.match(/ended\s+(?:on\s+)?([0-9a-zA-Z-]+)/i);
                    if (match) periodEndedDate = match[1];
                }

                const partCol = String(row[0] || '').toLowerCase().trim();
                const numericVals = row.filter(c => typeof c === 'number' && !isNaN(c));
                const lastNum = numericVals.length > 0 ? numericVals[numericVals.length - 1] : null;

                if (partCol.includes('revenue from operations') && lastNum !== null) {
                    revenueFromOperations = lastNum;
                } else if (partCol.includes('other income') && lastNum !== null) {
                    otherIncome = lastNum;
                } else if (partCol.includes('cost of material') && lastNum !== null) {
                    costOfMaterialsConsumed = lastNum;
                } else if (partCol.includes('change in inventories') && lastNum !== null) {
                    changeInInventories = lastNum;
                } else if (partCol.includes('employee benefit') && lastNum !== null) {
                    employeeBenefitExpenses = lastNum;
                } else if (partCol.includes('finance cost') && lastNum !== null) {
                    financeCosts = lastNum;
                } else if (partCol.includes('depreciation') && lastNum !== null) {
                    depreciationAmortization = lastNum;
                } else if (partCol.includes('other expenses') && lastNum !== null) {
                    otherExpenses = lastNum;
                }
            }

            const totalIncome = revenueFromOperations + otherIncome;
            const totalExpenses =
                costOfMaterialsConsumed +
                changeInInventories +
                employeeBenefitExpenses +
                financeCosts +
                depreciationAmortization +
                otherExpenses;
            const profitBeforeTax = totalIncome - totalExpenses;
            const ebitda = profitBeforeTax + financeCosts + depreciationAmortization;

            const den = revenueFromOperations > 0 ? revenueFromOperations : totalIncome;
            const ebitdaMarginPct = den > 0 ? Number(((ebitda / den) * 100).toFixed(2)) : 0;
            const pbtMarginPct = den > 0 ? Number(((profitBeforeTax / den) * 100).toFixed(2)) : 0;
            const materialConsumptionPct = den > 0 ? Number(((costOfMaterialsConsumed / den) * 100).toFixed(2)) : 0;
            const employeeCostPct = den > 0 ? Number(((employeeBenefitExpenses / den) * 100).toFixed(2)) : 0;
            const financeCostPct = den > 0 ? Number(((financeCosts / den) * 100).toFixed(2)) : 0;

            res.json({
                success: true,
                fromDefault: false,
                filePath: resolvedPath,
                statement: {
                    companyName,
                    cin,
                    registeredAddress,
                    periodEndedDate,
                    sourceFilePath: resolvedPath,
                    revenueFromOperations,
                    otherIncome,
                    totalIncome,
                    costOfMaterialsConsumed,
                    changeInInventories,
                    employeeBenefitExpenses,
                    financeCosts,
                    depreciationAmortization,
                    otherExpenses,
                    totalExpenses,
                    profitBeforeTax,
                    ebitda,
                    ebitdaMarginPct,
                    pbtMarginPct,
                    materialConsumptionPct,
                    employeeCostPct,
                    financeCostPct,
                    notes: {
                        note18: `Revenue from Operations: ₹${revenueFromOperations.toLocaleString('en-IN')}`,
                        note19: `Other Income: ₹${otherIncome.toLocaleString('en-IN')}`,
                        note20: `Cost of Material Consumed: ₹${costOfMaterialsConsumed.toLocaleString('en-IN')}`,
                        note21: `Change in Inventories of WIP and Finished Goods: ${changeInInventories < 0 ? `(₹${Math.abs(changeInInventories).toLocaleString('en-IN')})` : `₹${changeInInventories.toLocaleString('en-IN')}`}`,
                        note22: `Employee Benefit Expenses: ₹${employeeBenefitExpenses.toLocaleString('en-IN')}`,
                        note23: `Finance Costs: ₹${financeCosts.toLocaleString('en-IN')}`,
                        note24: `Depreciation and Amortization Expenses: ₹${depreciationAmortization.toLocaleString('en-IN')}`,
                        note25: `Other Expenses: ₹${otherExpenses.toLocaleString('en-IN')}`
                    }
                }
            });
        } catch (err) {
            console.error('[Monthly Audit API] Error reading profitability from file:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });
}
