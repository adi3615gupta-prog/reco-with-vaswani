import { describe, it, expect } from 'vitest';
import { computeLimitationDueDate, getNoticeAlertStatus } from '../../notices/db.js';

describe('GST Notices Limitation & Countdown Engine (NOTICES-03, T-12-02)', () => {
    it('should calculate 7-day limitation for DRC-01B and DRC-01C per Rule 88C/88D', () => {
        const dueDateB = computeLimitationDueDate('DRC-01B', '2024-05-10');
        expect(dueDateB).toBe('2024-05-17');

        const dueDateC = computeLimitationDueDate('DRC-01C', '2024-05-10');
        expect(dueDateC).toBe('2024-05-17');
    });

    it('should calculate 30-day statutory limitation for ASMT-10, DRC-01, and DRC-01A', () => {
        const dueDateAsmt = computeLimitationDueDate('ASMT-10', '2024-06-01');
        expect(dueDateAsmt).toBe('2024-07-01');

        const dueDateDrc1 = computeLimitationDueDate('DRC-01', '2024-06-01');
        expect(dueDateDrc1).toBe('2024-07-01');

        const dueDateDrc1A = computeLimitationDueDate('DRC-01A', '2024-06-01');
        expect(dueDateDrc1A).toBe('2024-07-01');
    });

    it('should parse DD/MM/YYYY slash format correctly', () => {
        const dueDate = computeLimitationDueDate('DRC-01B', '15/04/2024');
        expect(dueDate).toBe('2024-04-22');
    });

    it('should assign correct color badges based on remaining days', () => {
        const today = new Date();

        // Target: 2 days in future -> CRITICAL (Red)
        const d2 = new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const alert2 = getNoticeAlertStatus(d2);
        expect(alert2.status).toBe('CRITICAL');
        expect(alert2.badgeColor).toBe('red');

        // Target: 6 days in future -> URGENT (Amber)
        const d6 = new Date(today.getTime() + 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const alert6 = getNoticeAlertStatus(d6);
        expect(alert6.status).toBe('URGENT');
        expect(alert6.badgeColor).toBe('amber');

        // Target: 20 days in future -> NORMAL (Emerald)
        const d20 = new Date(today.getTime() + 20 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const alert20 = getNoticeAlertStatus(d20);
        expect(alert20.status).toBe('NORMAL');
        expect(alert20.badgeColor).toBe('emerald');

        // Target: 5 days in past -> EXPIRED (Crimson)
        const dPast = new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const alertPast = getNoticeAlertStatus(dPast);
        expect(alertPast.status).toBe('EXPIRED');
        expect(alertPast.badgeColor).toBe('crimson');
    });
});
