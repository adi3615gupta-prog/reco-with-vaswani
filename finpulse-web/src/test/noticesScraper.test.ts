import { describe, it, expect, vi } from 'vitest';
import sqlite3 from 'sqlite3';
import { initGstNoticesDatabase } from '../../notices/db.js';

describe('GST Notices Autopilot Integration (NOTICES-01, T-12-03)', () => {
    it('should have runNoticesAutopilot exported as function', async () => {
        const { runNoticesAutopilot } = await import('../../notices/autopilot.js');
        expect(typeof runNoticesAutopilot).toBe('function');
    });

    it('should emit START event and handle browser lifecycle cleanly', async () => {
        const { runNoticesAutopilot } = await import('../../notices/autopilot.js');
        const db = new sqlite3.Database(':memory:');
        initGstNoticesDatabase(db);

        const sseEvents: string[] = [];
        const resMock: any = {
            setHeader: vi.fn(),
            flushHeaders: vi.fn(),
            write: vi.fn((data: string) => {
                sseEvents.push(data);
            }),
            end: vi.fn()
        };

        const reqMock: any = {
            on: vi.fn()
        };

        const browserState = { current: null };

        // Test with mock browserState or missing client
        try {
            const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 800));
            await Promise.race([
                runNoticesAutopilot({
                    db,
                    gstin: '27AABCS1429B1Z1',
                    portal_username: 'test_user',
                    portal_password: 'test_password',
                    req: reqMock,
                    res: resMock,
                    browserState
                }),
                timeoutPromise
            ]);
        } catch (e) {}

        // Verify initial SSE header was set and START event was emitted
        expect(resMock.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
        expect(sseEvents.some(e => e.includes('START'))).toBe(true);

        // Cleanup browser if opened
        if (browserState.current) {
            await (browserState.current as any).close().catch(() => {});
        }
    }, 15000);
});
