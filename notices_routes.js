import path from 'path';
import fs from 'fs';
import {
    initGstNoticesDatabase,
    upsertNotice,
    getNoticesByClient,
    getNoticeById,
    saveAttachment,
    getAttachmentsByNoticeId,
    saveNoticeReply,
    getNoticesSummary
} from './notices/db.js';
import { runNoticesAutopilot } from './notices/autopilot.js';

export function setupNoticesRoutes(app, db) {
    const browserState = { current: null };

    // Initialize Database Tables & Indexes
    initGstNoticesDatabase(db);

    // ─── 0. RUN AUTOPILOT NOTICE SCRAPER (SSE STREAM) ──────────────────────
    app.post('/api/notices/autopilot', (req, res) => {
        const { gstin, portal_username, portal_password } = req.body;
        if (!gstin) {
            return res.status(400).json({ success: false, error: 'gstin required' });
        }
        runNoticesAutopilot({
            db,
            gstin,
            portal_username,
            portal_password,
            req,
            res,
            browserState
        });
    });

    // ─── 0.1 CANCEL RUNNING AUTOPILOT ──────────────────────────────────────
    app.post('/api/notices/autopilot/cancel', async (req, res) => {
        try {
            if (browserState.current) {
                console.log('[Notices API] Cancelling active Playwright browser process');
                await browserState.current.close().catch(() => {});
                browserState.current = null;
            }
            res.json({ success: true, message: 'Autopilot session cancelled' });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // ─── 1. GET ALL NOTICES FOR CLIENT ──────────────────────────────────────
    app.get('/api/notices/:gstin', async (req, res) => {
        try {
            const { gstin } = req.params;
            const { notice_type, status, financial_year } = req.query;
            const notices = await getNoticesByClient(db, gstin, {
                notice_type,
                status,
                financial_year
            });
            res.json({ success: true, count: notices.length, notices });
        } catch (err) {
            console.error('[Notices API] Error fetching notices:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // ─── 2. GET NOTICE DETAIL WITH ATTACHMENTS & DRAFT REPLY ────────────────
    app.get('/api/notices/detail/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const notice = await getNoticeById(db, id);
            if (!notice) {
                return res.status(404).json({ success: false, error: 'Notice not found' });
            }
            res.json({ success: true, notice });
        } catch (err) {
            console.error('[Notices API] Error fetching notice detail:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // ─── 3. GET SUMMARY KPI COUNTS FOR CLIENT ──────────────────────────────
    app.get('/api/notices/summary/:gstin', async (req, res) => {
        try {
            const { gstin } = req.params;
            const summary = await getNoticesSummary(db, gstin);
            res.json({ success: true, summary });
        } catch (err) {
            console.error('[Notices API] Error fetching summary:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // ─── 4. SAVE OR UPDATE DRAFT LEGAL REPLY ────────────────────────────────
    app.post('/api/notices/reply/save', async (req, res) => {
        try {
            const replyData = req.body;
            if (!replyData.notice_id || !replyData.reply_form) {
                return res.status(400).json({ success: false, error: 'notice_id and reply_form required' });
            }
            const result = await saveNoticeReply(db, replyData);
            res.json({ success: true, result });
        } catch (err) {
            console.error('[Notices API] Error saving reply:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // ─── 5. UPDATE NOTICE STATUS ────────────────────────────────────────────
    app.post('/api/notices/status/update', (req, res) => {
        const { id, status } = req.body;
        if (!id || !status) {
            return res.status(400).json({ success: false, error: 'id and status required' });
        }
        const now = Date.now();
        db.run(`UPDATE gst_notices SET status = ?, updated_at = ? WHERE id = ?`, [status, now, id], function (err) {
            if (err) {
                return res.status(500).json({ success: false, error: err.message });
            }
            res.json({ success: true, updated: this.changes });
        });
    });

    // ─── 6. DOWNLOAD NOTICE ATTACHMENT ──────────────────────────────────────
    app.get('/api/notices/attachment/download/:id', (req, res) => {
        const { id } = req.params;
        db.get(`SELECT * FROM gst_notice_attachments WHERE id = ?`, [id], (err, row) => {
            if (err || !row) {
                return res.status(404).json({ success: false, error: 'Attachment record not found' });
            }
            const filePath = row.file_path;
            if (!fs.existsSync(filePath)) {
                return res.status(404).json({ success: false, error: 'File does not exist on disk' });
            }
            res.download(filePath, row.file_name);
        });
    });

    // ─── 7. MULTI-RETURN CROSS-RECONCILIATION ────────────────────────────────
    app.post('/api/notices/reconcile/:noticeId', async (req, res) => {
        try {
            const { noticeId } = req.params;
            const notice = await getNoticeById(db, noticeId);
            if (!notice) {
                return res.status(404).json({ success: false, error: 'Notice not found' });
            }

            const { reconcileNoticeDiscrepancy } = await import('./src/lib/noticeReconciliation.js');

            // Fetch 2B invoices for client
            const twoBInvoices = await new Promise((resolve) => {
                db.all(`SELECT * FROM gstr2b_invoices WHERE client_gstin = ?`, [notice.client_gstin], (err, rows) => {
                    resolve(rows || []);
                });
            });

            const recoResult = reconcileNoticeDiscrepancy({
                noticeId: notice.id,
                referenceNo: notice.reference_no,
                gstin: notice.client_gstin,
                financialYear: notice.financial_year,
                taxPeriod: notice.tax_period,
                totalDemanded: notice.total_demanded
            }, { twoBInvoices });

            res.json({ success: true, reconciliation: recoResult });
        } catch (err) {
            console.error('[Notices API] Error reconciling notice:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // ─── 8. EXPORT RECONCILIATION ANNEXURE (ZERO-MERGE EXCEL) ───────────────
    app.get('/api/notices/reconcile/export/:noticeId', async (req, res) => {
        try {
            const { noticeId } = req.params;
            const notice = await getNoticeById(db, noticeId);
            if (!notice) {
                return res.status(404).json({ success: false, error: 'Notice not found' });
            }

            const { reconcileNoticeDiscrepancy, generateNoticeAnnexureExcel } = await import('./src/lib/noticeReconciliation.js');
            const xlsx = await import('xlsx');
            const XLSX = xlsx.default || xlsx;

            const twoBInvoices = await new Promise((resolve) => {
                db.all(`SELECT * FROM gstr2b_invoices WHERE client_gstin = ?`, [notice.client_gstin], (err, rows) => {
                    resolve(rows || []);
                });
            });

            const recoResult = reconcileNoticeDiscrepancy({
                noticeId: notice.id,
                referenceNo: notice.reference_no,
                gstin: notice.client_gstin,
                financialYear: notice.financial_year,
                taxPeriod: notice.tax_period,
                totalDemanded: notice.total_demanded
            }, { twoBInvoices });

            const wb = generateNoticeAnnexureExcel(recoResult, {
                companyName: notice.client_gstin,
                officerName: notice.issuing_officer
            });

            const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="Notice_Annexure_${notice.reference_no}.xlsx"`);
            res.send(buffer);
        } catch (err) {
            console.error('[Notices API] Error exporting annexure:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });
}

export default setupNoticesRoutes;
