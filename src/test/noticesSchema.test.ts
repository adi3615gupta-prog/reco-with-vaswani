import { describe, it, expect, beforeEach } from 'vitest';
import sqlite3 from 'sqlite3';
import {
    initGstNoticesDatabase,
    upsertNotice,
    getNoticesByClient,
    getNoticeById,
    saveAttachment,
    getAttachmentsByNoticeId,
    getNoticesSummary
} from '../../notices/db.js';

describe('GST Notices Database Schema & Persistence (NOTICES-02, T-12-01)', () => {
    let db: any;

    beforeEach(async () => {
        db = new sqlite3.Database(':memory:');
        initGstNoticesDatabase(db);
        await new Promise((resolve) => setTimeout(resolve, 50));
    });

    it('should create tables without error and persist a notice via upsert', async () => {
        const noticeData = {
            client_gstin: '27AABCS1429B1Z1',
            portal_source: 'ADDITIONAL_NOTICES',
            notice_type: 'ASMT-10',
            form_description: 'Scrutiny of Returns under Section 61',
            reference_no: 'ZA270324001234M',
            din: 'DIN202403271429888',
            financial_year: '2023-24',
            tax_period: 'Q3',
            issue_date: '2024-03-15',
            issuing_officer: 'Assistant Commissioner Range IV',
            issuing_jurisdiction: 'Mumbai Division II',
            section_cited: 'Section 61',
            tax_demanded: 150000,
            interest_demanded: 18000,
            penalty_demanded: 15000,
            status: 'PENDING_REPLY'
        };

        const result: any = await upsertNotice(db, noticeData);
        expect(result.id).toBeDefined();
        expect(result.client_gstin).toBe('27AABCS1429B1Z1');
        expect(result.reference_no).toBe('ZA270324001234M');

        const notices: any = await getNoticesByClient(db, '27AABCS1429B1Z1');
        expect(notices.length).toBe(1);
        expect(notices[0].notice_type).toBe('ASMT-10');
        expect(notices[0].total_demanded).toBe(183000);
        expect(notices[0].due_date).toBe('2024-04-14');
    });

    it('should avoid duplicate records on re-scan and update existing record', async () => {
        const notice1 = {
            client_gstin: '27AABCS1429B1Z1',
            reference_no: 'ZA270324001234M',
            notice_type: 'DRC-01',
            financial_year: '2022-23',
            issue_date: '2024-01-10',
            tax_demanded: 50000
        };

        await upsertNotice(db, notice1);

        const notice2 = {
            client_gstin: '27AABCS1429B1Z1',
            reference_no: 'ZA270324001234M',
            notice_type: 'DRC-01',
            financial_year: '2022-23',
            issue_date: '2024-01-10',
            tax_demanded: 75000
        };

        await upsertNotice(db, notice2);

        const list: any = await getNoticesByClient(db, '27AABCS1429B1Z1');
        expect(list.length).toBe(1);
        expect(list[0].tax_demanded).toBe(75000);
    });

    it('should save attachments and link them to the notice', async () => {
        const notice: any = await upsertNotice(db, {
            client_gstin: '27AABCS1429B1Z1',
            reference_no: 'REF-999',
            notice_type: 'DRC-01',
            financial_year: '2023-24',
            issue_date: '2024-02-01'
        });

        const att: any = await saveAttachment(db, {
            notice_id: notice.id,
            client_gstin: '27AABCS1429B1Z1',
            file_name: 'DRC_01_SCN_NOTICE.pdf',
            file_type: 'PDF',
            file_path: '/downloads/notices/27AABCS1429B1Z1/REF-999/DRC_01_SCN_NOTICE.pdf',
            file_hash: 'sha256abc123'
        });

        expect(att.id).toBeDefined();

        const attachments: any = await getAttachmentsByNoticeId(db, notice.id);
        expect(attachments.length).toBe(1);
        expect(attachments[0].file_name).toBe('DRC_01_SCN_NOTICE.pdf');

        const detail: any = await getNoticeById(db, notice.id);
        expect(detail.attachments.length).toBe(1);
    });

    it('should aggregate summary statistics accurately', async () => {
        await upsertNotice(db, {
            client_gstin: '27AABCS1429B1Z1',
            reference_no: 'REF-1',
            notice_type: 'DRC-01B',
            financial_year: '2023-24',
            issue_date: '2024-03-01',
            tax_demanded: 10000,
            status: 'PENDING_REPLY'
        });

        await upsertNotice(db, {
            client_gstin: '27AABCS1429B1Z1',
            reference_no: 'REF-2',
            notice_type: 'DRC-01',
            financial_year: '2023-24',
            issue_date: '2024-03-01',
            tax_demanded: 50000,
            status: 'REPLIED'
        });

        const summary: any = await getNoticesSummary(db, '27AABCS1429B1Z1');
        expect(summary.total_notices).toBe(2);
        expect(summary.pending_reply_count).toBe(1);
        expect(summary.resolved_count).toBe(1);
        expect(summary.total_demand_amount).toBe(60000);
    });
});
