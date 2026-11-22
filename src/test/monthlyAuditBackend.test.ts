import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import { initMonthlyAuditDatabase } from '../../monthly_audit_routes.js';
import { calculateProfitability } from '../lib/monthlyAuditEngine';

describe('Monthly Audit Backend Database & Logic Tests', () => {
    let db: sqlite3.Database;
    const testDir = path.resolve('./temp_test_monthly_audit');

    beforeEach(async () => {
        // Use in-memory database for testing
        db = new sqlite3.Database(':memory:');
        initMonthlyAuditDatabase(db);
        fs.mkdirSync(testDir, { recursive: true });
    });

    afterEach(async () => {
        await new Promise<void>((resolve) => db.close(() => resolve()));
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
    });

    it('Schema Verification: creates all 6 tables and performance indexes', async () => {
        const tables = await new Promise<string[]>((resolve, reject) => {
            db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;", (err, rows: any[]) => {
                if (err) reject(err);
                else resolve(rows.map(r => r.name));
            });
        });

        expect(tables).toContain('monthly_audits');
        expect(tables).toContain('audit_checklists');
        expect(tables).toContain('audit_observations');
        expect(tables).toContain('audit_pending_points');
        expect(tables).toContain('audit_verification_data');
        expect(tables).toContain('audit_voucher_samples');
        expect(tables).toContain('monthly_audit_clients');

        const indexes = await new Promise<string[]>((resolve, reject) => {
            db.all("SELECT name FROM sqlite_master WHERE type='index' ORDER BY name;", (err, rows: any[]) => {
                if (err) reject(err);
                else resolve(rows.map(r => r.name));
            });
        });

        expect(indexes).toContain('idx_monthly_audit_clients_name');
        expect(indexes).toContain('idx_monthly_audit_clients_gstin');
        expect(indexes).toContain('idx_monthly_audit_clients_tally');
        expect(indexes).toContain('idx_monthly_audits_client');
        expect(indexes).toContain('idx_monthly_audits_status');
        expect(indexes).toContain('idx_audit_checklists_audit_id');
        expect(indexes).toContain('idx_audit_observations_audit_id');
        expect(indexes).toContain('idx_pending_points_client');
        expect(indexes).toContain('idx_voucher_samples_audit');
        expect(indexes).toContain('idx_voucher_samples_status');
    });

    it('Master Audit Header: inserts and enforces unique (client_gstin, fy, month)', async () => {
        const auditId = 'audit_27AAGCD4105L1ZO_2025-26_October';
        const now = Date.now();

        await new Promise<void>((resolve, reject) => {
            db.run(`
                INSERT INTO monthly_audits (
                    id, client_gstin, client_name, fy, month, auditor_name, team_members,
                    audit_type, turnover_inc_gst, turnover_books, turnover_gst, turnover_variance,
                    audit_start_date, audit_end_date, status, audit_status, prepared_by,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                auditId, '27AAGCD4105L1ZO', 'DYP INFRAPROJECTS PVT LTD', '2025-26', 'October',
                'CA Balasaheb Patil', JSON.stringify(['Article A', 'Article B']),
                'Monthly Statutory Audit', 12500000, 11000000, 11000000, 0,
                '2025-10-01', '2025-10-05', 'Draft', 'DRAFT', 'Junior Auditor',
                now, now
            ], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        const record = await new Promise<any>((resolve, reject) => {
            db.get(`SELECT * FROM monthly_audits WHERE id = ?`, [auditId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        expect(record).toBeDefined();
        expect(record.client_name).toBe('DYP INFRAPROJECTS PVT LTD');
        expect(record.audit_status).toBe('DRAFT');
        expect(record.turnover_inc_gst).toBe(12500000);

        // Attempt duplicate insert on same (gstin, fy, month) should fail constraint
        const duplicateAttempt = new Promise<void>((resolve, reject) => {
            db.run(`
                INSERT INTO monthly_audits (id, client_gstin, client_name, fy, month, created_at, updated_at)
                VALUES ('audit_dup', '27AAGCD4105L1ZO', 'DYP INFRAPROJECTS', '2025-26', 'October', 1, 1)
            `, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        await expect(duplicateAttempt).rejects.toThrow();
    });

    it('Maker-Checker Workflow: transitions Draft -> Submitted -> Approved -> Released', async () => {
        const auditId = 'audit_mc_test';
        const now = Date.now();

        // 1. Create Draft
        await new Promise<void>((resolve, reject) => {
            db.run(`
                INSERT INTO monthly_audits (
                    id, client_gstin, client_name, fy, month, status, audit_status, prepared_by, created_at, updated_at
                ) VALUES (?, '27TESTGSTIN1234', 'Test Corp', '2025-26', 'September', 'Draft', 'DRAFT', 'Junior A', ?, ?)
            `, [auditId, now, now], (err) => (err ? reject(err) : resolve()));
        });

        // 2. Junior Submits for Review
        await new Promise<void>((resolve, reject) => {
            db.run(`
                UPDATE monthly_audits SET
                    audit_status = 'SUBMITTED_FOR_REVIEW',
                    status = 'Under Review',
                    prepared_by = 'Junior A',
                    prepared_at = ?,
                    updated_at = ?
                WHERE id = ?
            `, [now + 100, now + 100, auditId], (err) => (err ? reject(err) : resolve()));
        });

        let current = await new Promise<any>((resolve, reject) => {
            db.get(`SELECT audit_status, status FROM monthly_audits WHERE id = ?`, [auditId], (err, row) => (err ? reject(err) : resolve(row)));
        });
        expect(current.audit_status).toBe('SUBMITTED_FOR_REVIEW');

        // 3. Senior Requests Revision
        await new Promise<void>((resolve, reject) => {
            db.run(`
                UPDATE monthly_audits SET
                    audit_status = 'REVISION_REQUESTED',
                    status = 'Draft',
                    reviewed_by = 'Partner B',
                    senior_review_notes = 'Please check cash payments > 10,000 in Daybook',
                    updated_at = ?
                WHERE id = ?
            `, [now + 200, auditId], (err) => (err ? reject(err) : resolve()));
        });

        current = await new Promise<any>((resolve, reject) => {
            db.get(`SELECT audit_status, senior_review_notes FROM monthly_audits WHERE id = ?`, [auditId], (err, row) => (err ? reject(err) : resolve(row)));
        });
        expect(current.audit_status).toBe('REVISION_REQUESTED');
        expect(current.senior_review_notes).toContain('cash payments');

        // 4. Senior Approves
        await new Promise<void>((resolve, reject) => {
            db.run(`
                UPDATE monthly_audits SET
                    audit_status = 'APPROVED',
                    status = 'Completed',
                    reviewed_by = 'Partner B',
                    reviewed_at = ?,
                    updated_at = ?
                WHERE id = ?
            `, [now + 300, now + 300, auditId], (err) => (err ? reject(err) : resolve()));
        });

        current = await new Promise<any>((resolve, reject) => {
            db.get(`SELECT audit_status, reviewed_by FROM monthly_audits WHERE id = ?`, [auditId], (err, row) => (err ? reject(err) : resolve(row)));
        });
        expect(current.audit_status).toBe('APPROVED');
        expect(current.reviewed_by).toBe('Partner B');

        // 5. Released to Client
        await new Promise<void>((resolve, reject) => {
            db.run(`
                UPDATE monthly_audits SET
                    audit_status = 'RELEASED',
                    released_by = 'Junior A',
                    released_at = ?,
                    release_channel = 'DIRECTORY',
                    updated_at = ?
                WHERE id = ?
            `, [now + 400, now + 400, auditId], (err) => (err ? reject(err) : resolve()));
        });

        current = await new Promise<any>((resolve, reject) => {
            db.get(`SELECT audit_status, release_channel FROM monthly_audits WHERE id = ?`, [auditId], (err, row) => (err ? reject(err) : resolve(row)));
        });
        expect(current.audit_status).toBe('RELEASED');
        expect(current.release_channel).toBe('DIRECTORY');
    });

    it('Checklists & Cascading Deletes: items are cascade deleted on audit removal', async () => {
        const auditId = 'audit_cascade_test';
        const now = Date.now();

        await new Promise<void>((resolve, reject) => {
            db.run(`
                INSERT INTO monthly_audits (id, client_gstin, client_name, fy, month, created_at, updated_at)
                VALUES (?, '27TESTCASCADE', 'Cascade Client', '2025-26', 'August', ?, ?)
            `, [auditId, now, now], (err) => (err ? reject(err) : resolve()));
        });

        // Insert 2 checklist items
        await new Promise<void>((resolve, reject) => {
            db.run(`
                INSERT INTO audit_checklists (id, audit_id, section_key, item_key, item_title, status, updated_at)
                VALUES ('chk_1', ?, 'registers', 'sales_reg', 'Sales Register Vouching', 'Verified', ?)
            `, [auditId, now], (err) => (err ? reject(err) : resolve()));
        });

        await new Promise<void>((resolve, reject) => {
            db.run(`
                INSERT INTO audit_checklists (id, audit_id, section_key, item_key, item_title, status, updated_at)
                VALUES ('chk_2', ?, 'workings', 'gst_reco', 'GST 3B/R1 Working', 'Pending', ?)
            `, [auditId, now], (err) => (err ? reject(err) : resolve()));
        });

        let chkCount = await new Promise<number>((resolve, reject) => {
            db.get(`SELECT COUNT(*) as cnt FROM audit_checklists WHERE audit_id = ?`, [auditId], (err, row: any) => (err ? reject(err) : resolve(row.cnt)));
        });
        expect(chkCount).toBe(2);

        // Delete master audit
        await new Promise<void>((resolve, reject) => {
            db.run(`DELETE FROM monthly_audits WHERE id = ?`, [auditId], (err) => (err ? reject(err) : resolve()));
        });

        chkCount = await new Promise<number>((resolve, reject) => {
            db.get(`SELECT COUNT(*) as cnt FROM audit_checklists WHERE audit_id = ?`, [auditId], (err, row: any) => (err ? reject(err) : resolve(row.cnt)));
        });
        expect(chkCount).toBe(0);
    });

    it('Cross-Month Pending Points: tracks lifecycle Pending -> In Progress -> Cleared', async () => {
        const pointId = 'pt_1001';
        const now = Date.now();

        // 1. Create Pending Point from October
        await new Promise<void>((resolve, reject) => {
            db.run(`
                INSERT INTO audit_pending_points (
                    id, client_gstin, client_name, origin_audit_id, origin_fy, origin_month,
                    point_title, point_description, category, severity, status, assigned_to,
                    created_at, updated_at
                ) VALUES (?, '27TESTGSTIN', 'DYP Infra', 'audit_oct', '2025-26', 'October',
                    'ROC Form CHG-1 Satisfaction Pending', 'Bank loan closed but charge not satisfied with MCA',
                    'ROC Compliance', 'High', 'Pending', 'Associate Rahul', ?, ?)
            `, [pointId, now, now], (err) => (err ? reject(err) : resolve()));
        });

        let pt = await new Promise<any>((resolve, reject) => {
            db.get(`SELECT * FROM audit_pending_points WHERE id = ?`, [pointId], (err, row) => (err ? reject(err) : resolve(row)));
        });
        expect(pt.status).toBe('Pending');
        expect(pt.cleared_at).toBeNull();

        // 2. Update to In Progress
        await new Promise<void>((resolve, reject) => {
            db.run(`
                UPDATE audit_pending_points SET
                    status = 'In Progress',
                    resolution_remarks = 'Form CHG-4 draft filed with ROC, waiting for SRN generation',
                    updated_at = ?
                WHERE id = ?
            `, [now + 1000, pointId], (err) => (err ? reject(err) : resolve()));
        });

        pt = await new Promise<any>((resolve, reject) => {
            db.get(`SELECT * FROM audit_pending_points WHERE id = ?`, [pointId], (err, row) => (err ? reject(err) : resolve(row)));
        });
        expect(pt.status).toBe('In Progress');

        // 3. Clear Point in November
        await new Promise<void>((resolve, reject) => {
            db.run(`
                UPDATE audit_pending_points SET
                    status = 'Cleared',
                    resolution_remarks = 'MCA approved Form CHG-4, SRN F12345678 verified',
                    resolved_in_month = 'November',
                    verified_by = 'CA Balasaheb',
                    cleared_at = ?,
                    updated_at = ?
                WHERE id = ?
            `, [now + 2000, now + 2000, pointId], (err) => (err ? reject(err) : resolve()));
        });

        pt = await new Promise<any>((resolve, reject) => {
            db.get(`SELECT * FROM audit_pending_points WHERE id = ?`, [pointId], (err, row) => (err ? reject(err) : resolve(row)));
        });
        expect(pt.status).toBe('Cleared');
        expect(pt.resolved_in_month).toBe('November');
        expect(pt.cleared_at).toBeGreaterThan(0);
    });

    it('Direct Client Folder Auto-Save: correctly creates folder and writes binary buffer', () => {
        const clientName = 'DYP INFRAPROJECTS PRIVATE LIMITED';
        const gstin = '27AAGCD4105L1ZO';
        const fy = '2025-26';
        const month = 'October';
        const filename = 'Monthly_Audit_Working_Paper_DYP_October.xlsx';

        const folderName = `${clientName} - ${gstin}`;
        const targetDir = path.resolve(testDir, 'gst_returns_data', folderName, fy, month, 'Audit Working');
        fs.mkdirSync(targetDir, { recursive: true });

        const dummyPayload = Buffer.from('PK_TEST_EXCEL_ZIP_BINARY_DATA').toString('base64');
        const targetFile = path.join(targetDir, filename);
        fs.writeFileSync(targetFile, Buffer.from(dummyPayload, 'base64'));

        expect(fs.existsSync(targetFile)).toBe(true);
        const readContent = fs.readFileSync(targetFile, 'utf8');
        expect(readContent).toBe('PK_TEST_EXCEL_ZIP_BINARY_DATA');
    });

    it('Profitability Statement: accurately calculates Schedule III metrics & margins modeled on E:\\Book1.xlsx', () => {
        const stmt = calculateProfitability({
            companyName: 'DYP INFRAPROJECTS PRIVATE LIMITED',
            cin: 'U45309PN2017PTC173221',
            registeredAddress: 'Kohinoor Majestic, Chinchwad, Pune',
            periodEndedDate: '31-March-2026',
            revenueFromOperations: 234202771,
            otherIncome: 2034582,
            costOfMaterialsConsumed: 179319171,
            changeInInventories: -6873231,
            employeeBenefitExpenses: 36176399,
            financeCosts: 4614888,
            depreciationAmortization: 2488741,
            otherExpenses: 8727832
        });

        expect(stmt.totalIncome).toBe(236237353);
        expect(stmt.totalExpenses).toBe(224453800);
        expect(stmt.profitBeforeTax).toBe(11783553);
        expect(stmt.ebitda).toBe(18887182);
        expect(stmt.ebitdaMarginPct).toBe(8.06);
        expect(stmt.pbtMarginPct).toBe(5.03);
        expect(stmt.materialConsumptionPct).toBe(76.57);
        expect(stmt.employeeCostPct).toBe(15.45);
        expect(stmt.financeCostPct).toBe(1.97);
    });

    it('Voucher Sampling (Approach A): inserts, updates status, and cascade deletes with audit', async () => {
        const auditId = 'audit_vouchers_test';
        const now = Date.now();

        // 1. Create audit
        await new Promise<void>((resolve, reject) => {
            db.run(`
                INSERT INTO monthly_audits (id, client_gstin, client_name, fy, month, created_at, updated_at)
                VALUES (?, '27TESTVOUCH', 'Voucher Client', '2026-27', 'April', ?, ?)
            `, [auditId, now, now], (err) => (err ? reject(err) : resolve()));
        });

        // 2. Insert sample vouchers
        await new Promise<void>((resolve, reject) => {
            db.run(`
                INSERT INTO audit_voucher_samples (
                    id, audit_id, register_key, voucher_type, voucher_number,
                    date, party_name, amount, sampling_rule, stratum, status, created_at, updated_at
                ) VALUES (?, ?, 'sales', 'Sales', 'INV-001', '2026-04-10', 'Tata Motors Ltd', 150000, 'Stratified Sampling', 'High Value', 'Pending', ?, ?)
            `, ['samp_1', auditId, now, now], (err) => (err ? reject(err) : resolve()));
        });

        await new Promise<void>((resolve, reject) => {
            db.run(`
                INSERT INTO audit_voucher_samples (
                    id, audit_id, register_key, voucher_type, voucher_number,
                    date, party_name, amount, sampling_rule, stratum, status, created_at, updated_at
                ) VALUES (?, ?, 'purchase', 'Purchase', 'PUR-102', '2026-04-15', 'JSW Steel Ltd', 85000, 'Stratified Sampling', 'Medium Value', 'Pending', ?, ?)
            `, ['samp_2', auditId, now, now], (err) => (err ? reject(err) : resolve()));
        });

        let samples = await new Promise<any[]>((resolve, reject) => {
            db.all(`SELECT * FROM audit_voucher_samples WHERE audit_id = ?`, [auditId], (err, rows) => (err ? reject(err) : resolve(rows)));
        });
        expect(samples.length).toBe(2);

        // 3. Update status & remarks
        await new Promise<void>((resolve, reject) => {
            db.run(`
                UPDATE audit_voucher_samples SET
                    status = 'Verified',
                    auditor_remarks = 'E-way bill & e-invoice QR scanned and verified',
                    supporting_doc_ref = 'EWB# 1234567890',
                    verified_by = 'Senior Auditor',
                    verified_at = ?,
                    updated_at = ?
                WHERE id = 'samp_1'
            `, [now + 10, now + 10], (err) => (err ? reject(err) : resolve()));
        });

        const samp1 = await new Promise<any>((resolve, reject) => {
            db.get(`SELECT * FROM audit_voucher_samples WHERE id = 'samp_1'`, (err, row) => (err ? reject(err) : resolve(row)));
        });
        expect(samp1.status).toBe('Verified');
        expect(samp1.auditor_remarks).toContain('E-way bill');
        expect(samp1.verified_by).toBe('Senior Auditor');

        // 4. Cascade delete when monthly audit is deleted
        await new Promise<void>((resolve, reject) => {
            db.run(`DELETE FROM monthly_audits WHERE id = ?`, [auditId], (err) => (err ? reject(err) : resolve()));
        });

        const remainingSamples = await new Promise<any[]>((resolve, reject) => {
            db.all(`SELECT * FROM audit_voucher_samples WHERE audit_id = ?`, [auditId], (err, rows) => (err ? reject(err) : resolve(rows)));
        });
        expect(remainingSamples.length).toBe(0);
    });

    it('Monthly Audit Clients: inserts, updates, queries and deletes independent audit clients', async () => {
        const now = Date.now();
        const clientId = 'mac_dyp_infra_001';

        // 1. Insert new client
        await new Promise<void>((resolve, reject) => {
            db.run(`
                INSERT INTO monthly_audit_clients (
                    id, client_name, company_name, tally_company_name, tally_guid,
                    gstin, pan, email, phone, address, state, financial_year, is_active,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
            `, [
                clientId,
                'DYP INFRAPROJECTS PVT.LTD.',
                'DYP INFRAPROJECTS PVT.LTD.',
                'DYP INFRAPROJECTS PVT.LTD.',
                'e119f621-ae19-4689-81bf-1b5bdf1b5eef',
                '27AAGCD4105L1ZO',
                'AAGCD4105L',
                'audit@dypinfra.com',
                '+91 98200 12345',
                'Navi Mumbai, Maharashtra',
                'Maharashtra',
                '20220401',
                now,
                now
            ], (err) => (err ? reject(err) : resolve()));
        });

        // 2. Query client
        const client = await new Promise<any>((resolve, reject) => {
            db.get(`SELECT * FROM monthly_audit_clients WHERE id = ?`, [clientId], (err, row) => (err ? reject(err) : resolve(row)));
        });
        expect(client).toBeDefined();
        expect(client.client_name).toBe('DYP INFRAPROJECTS PVT.LTD.');
        expect(client.tally_company_name).toBe('DYP INFRAPROJECTS PVT.LTD.');
        expect(client.gstin).toBe('27AAGCD4105L1ZO');

        // 3. Update client notes
        await new Promise<void>((resolve, reject) => {
            db.run(`UPDATE monthly_audit_clients SET notes = 'Statutory audit client' WHERE id = ?`, [clientId], (err) => (err ? reject(err) : resolve()));
        });
        const updated = await new Promise<any>((resolve, reject) => {
            db.get(`SELECT * FROM monthly_audit_clients WHERE id = ?`, [clientId], (err, row) => (err ? reject(err) : resolve(row)));
        });
        expect(updated.notes).toBe('Statutory audit client');

        // 4. Delete client
        await new Promise<void>((resolve, reject) => {
            db.run(`DELETE FROM monthly_audit_clients WHERE id = ?`, [clientId], (err) => (err ? reject(err) : resolve()));
        });
        const deleted = await new Promise<any>((resolve, reject) => {
            db.get(`SELECT * FROM monthly_audit_clients WHERE id = ?`, [clientId], (err, row) => (err ? reject(err) : resolve(row)));
        });
        expect(deleted).toBeUndefined();
    });
});
