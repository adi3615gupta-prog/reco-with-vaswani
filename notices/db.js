import { randomUUID } from 'crypto';
export { checkNoticeLimitation } from './limitation.js';

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

        // Table 2B: Itemized Alleged Invoices cited in Notice
        db.run(`CREATE TABLE IF NOT EXISTS gst_notice_invoices (
            id TEXT PRIMARY KEY,
            notice_id TEXT NOT NULL,
            client_gstin TEXT NOT NULL,
            supplier_gstin TEXT NOT NULL,
            supplier_name TEXT,
            invoice_number TEXT NOT NULL,
            invoice_date TEXT,
            taxable_value REAL DEFAULT 0,
            igst REAL DEFAULT 0,
            cgst REAL DEFAULT 0,
            sgst REAL DEFAULT 0,
            cess REAL DEFAULT 0,
            total_tax REAL DEFAULT 0,
            financial_year TEXT,
            alleged_reason TEXT,
            created_at INTEGER,
            FOREIGN KEY(notice_id) REFERENCES gst_notices(id) ON DELETE CASCADE
        )`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_gst_notice_invoices_nid ON gst_notice_invoices(notice_id)`);

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

        // Table 4: Cases Master (groups multi-stage notices, replies, orders, appeals & payments)
        db.run(`CREATE TABLE IF NOT EXISTS gst_cases (
            id TEXT PRIMARY KEY,
            client_gstin TEXT NOT NULL,
            client_name TEXT,
            financial_year TEXT,
            tax_period TEXT,
            case_category TEXT,
            section_invoked TEXT,
            portal_case_id TEXT,
            officer_name TEXT,
            status TEXT DEFAULT 'OPEN',
            total_tax_demanded REAL DEFAULT 0,
            total_interest_demanded REAL DEFAULT 0,
            total_penalty_demanded REAL DEFAULT 0,
            total_late_fee REAL DEFAULT 0,
            total_paid_cash REAL DEFAULT 0,
            total_paid_itc REAL DEFAULT 0,
            predeposit_paid REAL DEFAULT 0,
            source_folder_path TEXT,
            created_at INTEGER,
            updated_at INTEGER
        )`);

        // Table 5: Case Payments (DRC-03, DRC-03A adjusted, PMT-06, Pre-deposits)
        db.run(`CREATE TABLE IF NOT EXISTS gst_case_payments (
            id TEXT PRIMARY KEY,
            case_id TEXT NOT NULL,
            notice_id TEXT,
            payment_type TEXT,
            arn_no TEXT,
            drc03_ref_no TEXT,
            drc03a_adjusted INTEGER DEFAULT 0,
            linked_demand_id TEXT,
            payment_date TEXT,
            paid_via TEXT,
            igst REAL DEFAULT 0,
            cgst REAL DEFAULT 0,
            sgst REAL DEFAULT 0,
            cess REAL DEFAULT 0,
            interest_paid REAL DEFAULT 0,
            penalty_paid REAL DEFAULT 0,
            late_fee_paid REAL DEFAULT 0,
            predeposit_pct REAL DEFAULT 0,
            notes TEXT,
            FOREIGN KEY(case_id) REFERENCES gst_cases(id) ON DELETE CASCADE
        )`);

        // Table 6: Case Events & Parameter-Level Issues
        db.run(`CREATE TABLE IF NOT EXISTS gst_case_events (
            id TEXT PRIMARY KEY,
            case_id TEXT NOT NULL,
            notice_id TEXT,
            event_type TEXT,
            event_date TEXT,
            due_date TEXT,
            form_code TEXT,
            param_code TEXT,
            portal_ref_no TEXT,
            title TEXT,
            summary TEXT,
            tax_amount REAL DEFAULT 0,
            interest_amount REAL DEFAULT 0,
            penalty_amount REAL DEFAULT 0,
            meta_json TEXT,
            is_completed INTEGER DEFAULT 0,
            FOREIGN KEY(case_id) REFERENCES gst_cases(id) ON DELETE CASCADE
        )`);

        // Guarded schema extensions on existing gst_notices (reusing existing din TEXT column)
        for (const colDef of ['case_id TEXT', 'demand_id TEXT', 'param_codes_json TEXT', 'issue_breakdown_json TEXT']) {
            db.run(`ALTER TABLE gst_notices ADD COLUMN ${colDef}`, () => {});
        }

        // Helpful Indexes
        db.run(`CREATE INDEX IF NOT EXISTS idx_gst_notices_client ON gst_notices(client_gstin)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_gst_notices_status ON gst_notices(status)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_gst_notices_due ON gst_notices(due_date)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_gst_notices_att_nid ON gst_notice_attachments(notice_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_cases_gstin ON gst_cases(client_gstin)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_payments_case ON gst_case_payments(case_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_events_case ON gst_case_events(case_id)`);
    });
}

// ─── 2. LIMITATION & DEADLINE CALCULATION UTILITIES ─────────────────────────
const DEADLINE_DAYS_MAP = [
    [/DRC-01B|DRC-01C|SEC\s*125|REG-03|REG-17|REG-23|MOV-07|GSTR-10|RULE-86A|EWB-NIL/i, 7],
    [/DRC-01A|GSTR-3A|RFD-08|MOV-10/i, 15],
    [/ASMT-10|ASMT-13|DRC-01|REG-31|ADT-01|SPL-03/i, 30],
    [/DRC-07|DRC-08|APL-04|MOV-09|REG-19|SPL-07|RFD-06/i, 90],
    [/NOTIF.*22\/2024/i, 180]
];

export function computeLimitationDueDate(noticeType, issueDate, explicitDays = null) {
    if (!issueDate) return null;

    // Normalize date format if DD/MM/YYYY
    let parsedDate;
    if (typeof issueDate === 'string' && issueDate.includes('/')) {
        const parts = issueDate.split('/');
        if (parts.length === 3) {
            parsedDate = new Date(`${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}T00:00:00Z`);
        }
    } else {
        parsedDate = new Date(issueDate);
    }

    if (!parsedDate || isNaN(parsedDate.getTime())) return null;

    let offsetDays = 30;
    const typeUpper = (noticeType || '').toUpperCase().replace(/\s*[-–]\s*/g, '-').trim();

    if (explicitDays != null && !isNaN(Number(explicitDays))) {
        offsetDays = Number(explicitDays);
    } else {
        for (const [rx, days] of DEADLINE_DAYS_MAP) {
            if (rx.test(typeUpper)) {
                offsetDays = days;
                break;
            }
        }
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
                status, raw_notice_text, case_id, demand_id, param_codes_json, issue_breakdown_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                case_id = COALESCE(excluded.case_id, gst_notices.case_id),
                demand_id = COALESCE(excluded.demand_id, gst_notices.demand_id),
                param_codes_json = COALESCE(excluded.param_codes_json, gst_notices.param_codes_json),
                issue_breakdown_json = COALESCE(excluded.issue_breakdown_json, gst_notices.issue_breakdown_json),
                updated_at = ?
        `;

        db.run(sql, [
            id, gstin, data.portal_source || 'ADDITIONAL_NOTICES', data.notice_type || 'OTHER',
            data.form_description || '', refNo, data.din || '', data.financial_year || '',
            data.tax_period || '', data.issue_date || '', dueDate || '', data.issuing_officer || '',
            data.issuing_jurisdiction || '', data.section_cited || '', Number(data.tax_demanded) || 0,
            Number(data.interest_demanded) || 0, Number(data.penalty_demanded) || 0, totalDemanded,
            data.status || 'PENDING_REPLY', data.raw_notice_text || '',
            data.case_id || null, data.demand_id || null, data.param_codes_json || null, data.issue_breakdown_json || null,
            now, now, now
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

// ─── 9. DELETE NOTICE RECORD ────────────────────────────────────────────────
export function deleteNotice(db, id) {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run(`DELETE FROM gst_notice_attachments WHERE notice_id = ?`, [id]);
            db.run(`DELETE FROM gst_notice_replies WHERE notice_id = ?`, [id]);
            db.run(`DELETE FROM gst_notices WHERE id = ?`, [id], function (err) {
                if (err) return reject(err);
                resolve({ deleted: this.changes > 0 });
            });
        });
    });
}

// ─── 10. CLEAR ALL DEMO NOTICES ─────────────────────────────────────────────
export function clearDemoNotices(db) {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run(`DELETE FROM gst_notices WHERE portal_source = 'DEMO_SIMULATOR' OR id LIKE 'DEMO-%'`, function (err) {
                if (err) return reject(err);
                resolve({ deleted: this.changes });
            });
        });
    });
}

// ─── 4. STATUTORY LIMITATION & INVOICE LEDGER ENGINE (NOTICE-01, NOTICE-02) ──
// (checkNoticeLimitation re-exported from shared ./limitation.js above)

export function saveNoticeInvoices(db, noticeId, clientGstin, invoices) {
    return new Promise((resolve, reject) => {
        if (!invoices || invoices.length === 0) return resolve({ count: 0 });
        const now = Date.now();
        db.serialize(() => {
            const stmt = db.prepare(`
                INSERT INTO gst_notice_invoices (
                    id, notice_id, client_gstin, supplier_gstin, supplier_name,
                    invoice_number, invoice_date, taxable_value, igst, cgst, sgst, cess, total_tax,
                    financial_year, alleged_reason, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            for (const inv of invoices) {
                stmt.run([
                    randomUUID(),
                    noticeId,
                    (clientGstin || '').toUpperCase(),
                    (inv.supplierGstin || inv.ctin || '').toUpperCase(),
                    inv.supplierName || inv.cname || '',
                    inv.invoiceNo || inv.inum || '',
                    inv.invoiceDate || inv.idt || '',
                    Number(inv.taxableValue || inv.txval) || 0,
                    Number(inv.igst) || 0,
                    Number(inv.cgst) || 0,
                    Number(inv.sgst) || 0,
                    Number(inv.cess) || 0,
                    Number(inv.totalTax || inv.val) || 0,
                    inv.financialYear || null,
                    inv.allegedReason || null,
                    now
                ]);
            }
            stmt.finalize((err) => {
                if (err) return reject(err);
                resolve({ count: invoices.length });
            });
        });
    });
}

export function getNoticeInvoices(db, noticeId) {
    return new Promise((resolve) => {
        db.all(
            `SELECT * FROM gst_notice_invoices WHERE notice_id = ? ORDER BY invoice_date DESC`,
            [noticeId],
            (err, rows) => resolve(rows || [])
        );
    });
}

// ─── 5. CASE LIFECYCLE, DRC-03/03A PAYMENTS & TIMELINE EVENTS ───────────────
export function upsertCase(db, data) {
    return new Promise((resolve, reject) => {
        const id = data.id || randomUUID();
        const now = Date.now();
        const gstin = (data.client_gstin || 'UNASSIGNED').trim().toUpperCase();
        db.run(
            `INSERT INTO gst_cases (
                id, client_gstin, client_name, financial_year, tax_period, case_category,
                section_invoked, portal_case_id, officer_name, status,
                total_tax_demanded, total_interest_demanded, total_penalty_demanded, total_late_fee,
                total_paid_cash, total_paid_itc, predeposit_paid, source_folder_path, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                client_name = COALESCE(excluded.client_name, gst_cases.client_name),
                financial_year = COALESCE(excluded.financial_year, gst_cases.financial_year),
                case_category = COALESCE(excluded.case_category, gst_cases.case_category),
                section_invoked = COALESCE(excluded.section_invoked, gst_cases.section_invoked),
                status = excluded.status,
                total_tax_demanded = MAX(gst_cases.total_tax_demanded, excluded.total_tax_demanded),
                total_interest_demanded = MAX(gst_cases.total_interest_demanded, excluded.total_interest_demanded),
                total_penalty_demanded = MAX(gst_cases.total_penalty_demanded, excluded.total_penalty_demanded),
                total_late_fee = MAX(gst_cases.total_late_fee, excluded.total_late_fee),
                updated_at = excluded.updated_at`,
            [
                id, gstin, data.client_name || '', data.financial_year || '', data.tax_period || 'Annual',
                data.case_category || 'SCRUTINY', data.section_invoked || 'Section 73', data.portal_case_id || '',
                data.officer_name || '', data.status || 'OPEN',
                Number(data.total_tax_demanded) || 0, Number(data.total_interest_demanded) || 0,
                Number(data.total_penalty_demanded) || 0, Number(data.total_late_fee) || 0,
                Number(data.total_paid_cash) || 0, Number(data.total_paid_itc) || 0, Number(data.predeposit_paid) || 0,
                data.source_folder_path || '', now, now
            ],
            (err) => (err ? reject(err) : resolve({ id, client_gstin: gstin }))
        );
    });
}

export function addCasePayment(db, p) {
    return new Promise((resolve, reject) => {
        const id = p.id || randomUUID();
        db.run(
            `INSERT INTO gst_case_payments (
                id, case_id, notice_id, payment_type, arn_no, drc03_ref_no, drc03a_adjusted,
                linked_demand_id, payment_date, paid_via, igst, cgst, sgst, cess,
                interest_paid, penalty_paid, late_fee_paid, predeposit_pct, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                id, p.case_id, p.notice_id || null, p.payment_type || 'DRC-03', p.arn_no || '',
                p.drc03_ref_no || '', p.drc03a_adjusted ? 1 : 0, p.linked_demand_id || '',
                p.payment_date || '', p.paid_via || 'CASH',
                Number(p.igst) || 0, Number(p.cgst) || 0, Number(p.sgst) || 0, Number(p.cess) || 0,
                Number(p.interest_paid) || 0, Number(p.penalty_paid) || 0, Number(p.late_fee_paid) || 0,
                Number(p.predeposit_pct) || 0, p.notes || ''
            ],
            (err) => (err ? reject(err) : resolve({ id }))
        );
    });
}

export function addCaseEvent(db, ev) {
    return new Promise((resolve, reject) => {
        const id = ev.id || randomUUID();
        db.run(
            `INSERT INTO gst_case_events (
                id, case_id, notice_id, event_type, event_date, due_date, form_code,
                param_code, portal_ref_no, title, summary, tax_amount, interest_amount,
                penalty_amount, meta_json, is_completed
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                id, ev.case_id, ev.notice_id || null, ev.event_type || 'DOCUMENT', ev.event_date || '',
                ev.due_date || '', ev.form_code || 'OTHER', ev.param_code || '', ev.portal_ref_no || '',
                ev.title || '', ev.summary || '', Number(ev.tax_amount) || 0,
                Number(ev.interest_amount) || 0, Number(ev.penalty_amount) || 0,
                ev.meta_json || null, ev.is_completed ? 1 : 0
            ],
            (err) => (err ? reject(err) : resolve({ id }))
        );
    });
}

export function getCasesByGstin(db, gstin = '') {
    return new Promise((resolve, reject) => {
        const clean = String(gstin || '').trim().toUpperCase();
        const sql = clean && clean !== 'ALL'
            ? `SELECT * FROM gst_cases WHERE client_gstin = ? ORDER BY updated_at DESC`
            : `SELECT * FROM gst_cases ORDER BY updated_at DESC`;
        db.all(sql, clean && clean !== 'ALL' ? [clean] : [], async (err, cases) => {
            if (err) return reject(err);
            const enriched = await Promise.all((cases || []).map((c) => getCaseDetail(db, c.id)));
            resolve(enriched.filter(Boolean));
        });
    });
}

export function getCaseDetail(db, caseId) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT * FROM gst_cases WHERE id = ?`, [caseId], (err, c) => {
            if (err || !c) return resolve(null);
            db.all(`SELECT * FROM gst_case_events WHERE case_id = ? ORDER BY event_date ASC, rowid ASC`, [caseId], (eErr, events) => {
                if (eErr) return reject(eErr);
                db.all(`SELECT * FROM gst_case_payments WHERE case_id = ? ORDER BY payment_date ASC`, [caseId], (pErr, payments) => {
                    if (pErr) return reject(pErr);
                    db.all(`SELECT * FROM gst_notices WHERE case_id = ?`, [caseId], (nErr, notices) => {
                        if (nErr) return reject(nErr);
                        resolve({ ...c, events: events || [], payments: payments || [], notices: notices || [] });
                    });
                });
            });
        });
    });
}

export function deleteCase(db, caseId) {
    return new Promise((resolve, reject) => {
        db.run(`DELETE FROM gst_cases WHERE id = ?`, [caseId], function (err) {
            if (err) return reject(err);
            resolve({ deleted: this.changes > 0 });
        });
    });
}
