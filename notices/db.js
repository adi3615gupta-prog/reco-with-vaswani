import { randomUUID } from 'crypto';

// ─── 1. DATABASE SCHEMA INITIALIZATION ──────────────────────────────────────
export function initGstNoticesDatabase(db) {
    db.serialize(() => {
        // Table 1: Master Notices & Orders
        db.run(`CREATE TABLE IF NOT EXISTS gst_notices (
            id TEXT PRIMARY KEY,
            client_gstin TEXT NOT NULL,
            portal_source TEXT NOT NULL,
            notice_type TEXT NOT NULL,
            form_description TEXT,
            reference_no TEXT NOT NULL,
            din TEXT,
            financial_year TEXT NOT NULL,
            tax_period TEXT,
            issue_date TEXT,
            due_date TEXT,
            issuing_officer TEXT,
            issuing_jurisdiction TEXT,
            section_cited TEXT,
            tax_demanded REAL DEFAULT 0,
            interest_demanded REAL DEFAULT 0,
            penalty_demanded REAL DEFAULT 0,
            total_demanded REAL DEFAULT 0,
            status TEXT DEFAULT 'PENDING_REPLY',
            raw_notice_text TEXT,
            created_at INTEGER,
            updated_at INTEGER,
            UNIQUE(client_gstin, reference_no)
        )`);

        // Table 2: Notice Attachments & Evidence Files
        db.run(`CREATE TABLE IF NOT EXISTS gst_notice_attachments (
            id TEXT PRIMARY KEY,
            notice_id TEXT NOT NULL,
            client_gstin TEXT NOT NULL,
            file_name TEXT NOT NULL,
            file_type TEXT,
            file_path TEXT NOT NULL,
            file_hash TEXT,
            downloaded_at INTEGER,
            FOREIGN KEY(notice_id) REFERENCES gst_notices(id) ON DELETE CASCADE
        )`);

        // Table 3: Notice Replies & Legal Defense Drafts
        db.run(`CREATE TABLE IF NOT EXISTS gst_notice_replies (
            id TEXT PRIMARY KEY,
            notice_id TEXT NOT NULL,
            client_gstin TEXT NOT NULL,
            reply_form TEXT NOT NULL,
            reply_subject TEXT,
            preliminary_objections TEXT,
            factual_rebuttal TEXT,
            legal_grounds TEXT,
            statutory_citations TEXT,
            annexure_path TEXT,
            full_draft_html TEXT,
            status TEXT DEFAULT 'DRAFT',
            filed_arn TEXT,
            filed_date TEXT,
            created_at INTEGER,
            updated_at INTEGER,
            FOREIGN KEY(notice_id) REFERENCES gst_notices(id) ON DELETE CASCADE
        )`);

        // Helpful Indexes
        db.run(`CREATE INDEX IF NOT EXISTS idx_gst_notices_client ON gst_notices(client_gstin)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_gst_notices_status ON gst_notices(status)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_gst_notices_due ON gst_notices(due_date)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_gst_notices_att_nid ON gst_notice_attachments(notice_id)`);
    });
}

// ─── 2. LIMITATION & DEADLINE CALCULATION UTILITIES ─────────────────────────
export function computeLimitationDueDate(noticeType, issueDate, explicitDays = null) {
    if (!issueDate) return null;

    // Normalize date format if DD/MM/YYYY
    let parsedDate;
    if (typeof issueDate === 'string' && issueDate.includes('/')) {
        const parts = issueDate.split('/');
        if (parts.length === 3) {
            // DD/MM/YYYY -> YYYY-MM-DD
            parsedDate = new Date(`${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}T00:00:00Z`);
        }
    } else {
        parsedDate = new Date(issueDate);
    }

    if (isNaN(parsedDate.getTime())) return null;

    let offsetDays = 30; // standard default
    const typeUpper = (noticeType || '').toUpperCase().trim();

    if (explicitDays != null && !isNaN(Number(explicitDays))) {
        offsetDays = Number(explicitDays);
    } else if (typeUpper.includes('DRC-01B') || typeUpper.includes('DRC-01C')) {
        offsetDays = 7; // Rule 88C & 88D 7-day response mandate
    } else if (typeUpper.includes('ASMT-10') || typeUpper.includes('DRC-01') || typeUpper.includes('DRC-01A')) {
        offsetDays = 30; // Section 61 & 73/74 30-day response window
    } else if (typeUpper.includes('REG-03') || typeUpper.includes('REG-17') || typeUpper.includes('REG-23')) {
        offsetDays = 7; // Registration clarification/show-cause window
    } else if (typeUpper.includes('ASMT-13') || typeUpper.includes('DRC-07')) {
        offsetDays = 90; // Order appeal limitation window (Section 107)
    }

    const dueDateObj = new Date(parsedDate.getTime() + offsetDays * 24 * 60 * 60 * 1000);
    return dueDateObj.toISOString().split('T')[0];
}

export function getNoticeAlertStatus(dueDate) {
    if (!dueDate) {
        return { status: 'NORMAL', daysRemaining: 999, badgeColor: 'emerald', label: 'No Deadline' };
    }

    const target = new Date(`${dueDate}T00:00:00Z`);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const diffMs = target.getTime() - today.getTime();
    const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (daysRemaining < 0) {
        return {
            status: 'EXPIRED',
            daysRemaining,
            badgeColor: 'crimson',
            label: `Overdue by ${Math.abs(daysRemaining)}d`
        };
    }
    if (daysRemaining <= 3) {
        return {
            status: 'CRITICAL',
            daysRemaining,
            badgeColor: 'red',
            label: `${daysRemaining}d Left (Critical)`
        };
    }
    if (daysRemaining <= 7) {
        return {
            status: 'URGENT',
            daysRemaining,
            badgeColor: 'amber',
            label: `${daysRemaining}d Left (Urgent)`
        };
    }
    return {
        status: 'NORMAL',
        daysRemaining,
        badgeColor: 'emerald',
        label: `${daysRemaining}d Left`
    };
}

// ─── 3. QUERY HELPER FUNCTIONS (PARAMETERIZED FOR T-12-01) ─────────────────
export function upsertNotice(db, data) {
    return new Promise((resolve, reject) => {
        const id = data.id || randomUUID();
        const now = Date.now();
        const gstin = (data.client_gstin || '').trim().toUpperCase();
        const refNo = (data.reference_no || '').trim();

        // Calculate due date if missing
        let dueDate = data.due_date;
        if (!dueDate && data.issue_date) {
            dueDate = computeLimitationDueDate(data.notice_type, data.issue_date);
        }

        const totalDemanded = (Number(data.tax_demanded) || 0) +
                              (Number(data.interest_demanded) || 0) +
                              (Number(data.penalty_demanded) || 0);

        const sql = `
            INSERT INTO gst_notices (
                id, client_gstin, portal_source, notice_type, form_description,
                reference_no, din, financial_year, tax_period, issue_date,
                due_date, issuing_officer, issuing_jurisdiction, section_cited,
                tax_demanded, interest_demanded, penalty_demanded, total_demanded,
                status, raw_notice_text, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(client_gstin, reference_no) DO UPDATE SET
                portal_source = excluded.portal_source,
                notice_type = excluded.notice_type,
                form_description = COALESCE(excluded.form_description, gst_notices.form_description),
                din = COALESCE(excluded.din, gst_notices.din),
                financial_year = excluded.financial_year,
                tax_period = COALESCE(excluded.tax_period, gst_notices.tax_period),
                issue_date = COALESCE(excluded.issue_date, gst_notices.issue_date),
                due_date = COALESCE(excluded.due_date, gst_notices.due_date),
                issuing_officer = COALESCE(excluded.issuing_officer, gst_notices.issuing_officer),
                issuing_jurisdiction = COALESCE(excluded.issuing_jurisdiction, gst_notices.issuing_jurisdiction),
                section_cited = COALESCE(excluded.section_cited, gst_notices.section_cited),
                tax_demanded = CASE WHEN excluded.tax_demanded > 0 THEN excluded.tax_demanded ELSE gst_notices.tax_demanded END,
                interest_demanded = CASE WHEN excluded.interest_demanded > 0 THEN excluded.interest_demanded ELSE gst_notices.interest_demanded END,
                penalty_demanded = CASE WHEN excluded.penalty_demanded > 0 THEN excluded.penalty_demanded ELSE gst_notices.penalty_demanded END,
                total_demanded = CASE WHEN excluded.total_demanded > 0 THEN excluded.total_demanded ELSE gst_notices.total_demanded END,
                updated_at = ?
        `;

        db.run(sql, [
            id, gstin, data.portal_source || 'ADDITIONAL_NOTICES', data.notice_type || 'OTHER',
            data.form_description || '', refNo, data.din || '', data.financial_year || '',
            data.tax_period || '', data.issue_date || '', dueDate || '', data.issuing_officer || '',
            data.issuing_jurisdiction || '', data.section_cited || '', Number(data.tax_demanded) || 0,
            Number(data.interest_demanded) || 0, Number(data.penalty_demanded) || 0, totalDemanded,
            data.status || 'PENDING_REPLY', data.raw_notice_text || '', now, now, now
        ], function (err) {
            if (err) return reject(err);
            resolve({ id, client_gstin: gstin, reference_no: refNo });
        });
    });
}

export function getNoticesByClient(db, gstin, filters = {}) {
    return new Promise((resolve, reject) => {
        const gstinUpper = (gstin || '').trim().toUpperCase();
        let sql = `SELECT * FROM gst_notices WHERE client_gstin = ?`;
        const params = [gstinUpper];

        if (filters.notice_type) {
            sql += ` AND notice_type = ?`;
            params.push(filters.notice_type);
        }
        if (filters.status) {
            sql += ` AND status = ?`;
            params.push(filters.status);
        }
        if (filters.financial_year) {
            sql += ` AND financial_year = ?`;
            params.push(filters.financial_year);
        }

        sql += ` ORDER BY due_date ASC, created_at DESC`;

        db.all(sql, params, (err, rows) => {
            if (err) return reject(err);
            const enriched = (rows || []).map(r => ({
                ...r,
                alert: getNoticeAlertStatus(r.due_date)
            }));
            resolve(enriched);
        });
    });
}

export function getNoticeById(db, id) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT * FROM gst_notices WHERE id = ?`, [id], (err, notice) => {
            if (err) return reject(err);
            if (!notice) return resolve(null);

            // Fetch attachments
            db.all(`SELECT * FROM gst_notice_attachments WHERE notice_id = ?`, [id], (attErr, attachments) => {
                if (attErr) return reject(attErr);

                // Fetch latest draft reply
                db.get(`SELECT * FROM gst_notice_replies WHERE notice_id = ? ORDER BY updated_at DESC LIMIT 1`, [id], (repErr, reply) => {
                    if (repErr) return reject(repErr);

                    resolve({
                        ...notice,
                        alert: getNoticeAlertStatus(notice.due_date),
                        attachments: attachments || [],
                        reply: reply || null
                    });
                });
            });
        });
    });
}

export function saveAttachment(db, data) {
    return new Promise((resolve, reject) => {
        const id = data.id || randomUUID();
        const now = Date.now();
        const sql = `
            INSERT INTO gst_notice_attachments (
                id, notice_id, client_gstin, file_name, file_type, file_path, file_hash, downloaded_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        db.run(sql, [
            id, data.notice_id, (data.client_gstin || '').trim().toUpperCase(),
            data.file_name, data.file_type || 'PDF', data.file_path, data.file_hash || '', now
        ], function (err) {
            if (err) return reject(err);
            resolve({ id, file_name: data.file_name });
        });
    });
}

export function getAttachmentsByNoticeId(db, noticeId) {
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM gst_notice_attachments WHERE notice_id = ?`, [noticeId], (err, rows) => {
            if (err) return reject(err);
            resolve(rows || []);
        });
    });
}

export function saveNoticeReply(db, data) {
    return new Promise((resolve, reject) => {
        const id = data.id || randomUUID();
        const now = Date.now();
        const sql = `
            INSERT INTO gst_notice_replies (
                id, notice_id, client_gstin, reply_form, reply_subject,
                preliminary_objections, factual_rebuttal, legal_grounds,
                statutory_citations, annexure_path, full_draft_html,
                status, filed_arn, filed_date, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                reply_form = excluded.reply_form,
                reply_subject = excluded.reply_subject,
                preliminary_objections = excluded.preliminary_objections,
                factual_rebuttal = excluded.factual_rebuttal,
                legal_grounds = excluded.legal_grounds,
                statutory_citations = excluded.statutory_citations,
                annexure_path = excluded.annexure_path,
                full_draft_html = excluded.full_draft_html,
                status = excluded.status,
                filed_arn = excluded.filed_arn,
                filed_date = excluded.filed_date,
                updated_at = ?
        `;
        db.run(sql, [
            id, data.notice_id, (data.client_gstin || '').trim().toUpperCase(),
            data.reply_form, data.reply_subject || '', data.preliminary_objections || '',
            data.factual_rebuttal || '', data.legal_grounds || '',
            typeof data.statutory_citations === 'object' ? JSON.stringify(data.statutory_citations) : (data.statutory_citations || '[]'),
            data.annexure_path || '', data.full_draft_html || '', data.status || 'DRAFT',
            data.filed_arn || '', data.filed_date || '', now, now, now
        ], function (err) {
            if (err) return reject(err);
            resolve({ id, notice_id: data.notice_id, status: data.status || 'DRAFT' });
        });
    });
}

export function getNoticesSummary(db, gstin) {
    return new Promise((resolve, reject) => {
        const gstinUpper = (gstin || '').trim().toUpperCase();
        const sql = `
            SELECT 
                COUNT(*) as total_notices,
                SUM(CASE WHEN status != 'CLOSED' AND status != 'REPLIED' THEN 1 ELSE 0 END) as pending_reply_count,
                SUM(CASE WHEN status = 'CLOSED' OR status = 'REPLIED' THEN 1 ELSE 0 END) as resolved_count,
                SUM(total_demanded) as total_demand_amount,
                SUM(tax_demanded) as total_tax_amount,
                SUM(interest_demanded) as total_interest_amount,
                SUM(penalty_demanded) as total_penalty_amount
            FROM gst_notices
            WHERE client_gstin = ?
        `;
        db.get(sql, [gstinUpper], (err, row) => {
            if (err) return reject(err);

            // Compute urgent count (< 7 days)
            db.all(`SELECT due_date, status FROM gst_notices WHERE client_gstin = ? AND status != 'CLOSED' AND status != 'REPLIED'`, [gstinUpper], (dErr, notices) => {
                if (dErr) return reject(dErr);
                let urgentCount = 0;
                let criticalCount = 0;

                (notices || []).forEach(n => {
                    const alert = getNoticeAlertStatus(n.due_date);
                    if (alert.status === 'CRITICAL' || alert.status === 'EXPIRED') {
                        criticalCount++;
                        urgentCount++;
                    } else if (alert.status === 'URGENT') {
                        urgentCount++;
                    }
                });

                resolve({
                    total_notices: row?.total_notices || 0,
                    pending_reply_count: row?.pending_reply_count || 0,
                    resolved_count: row?.resolved_count || 0,
                    urgent_count: urgentCount,
                    critical_count: criticalCount,
                    total_demand_amount: row?.total_demand_amount || 0,
                    total_tax_amount: row?.total_tax_amount || 0,
                    total_interest_amount: row?.total_interest_amount || 0,
                    total_penalty_amount: row?.total_penalty_amount || 0
                });
            });
        });
    });
}
