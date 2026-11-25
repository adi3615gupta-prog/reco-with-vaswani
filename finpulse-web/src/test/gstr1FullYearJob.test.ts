// @vitest-environment node
import { describe, it, expect } from 'vitest';
import sqlite3 from 'sqlite3';
import { initGstr1Database } from '../../gstr1/db.js';
import { buildGstr1FullYearWorkbookFromDb } from '../../gstr1/fullYearExcel.js';
import { createAndRunAutopilotJob, getJob } from '../../gstr1/jobs.js';
import { hasReturnPeriodEnded } from '../../gstr1/autopilot.js';

describe('hasReturnPeriodEnded (GSTR-1 exists only after the month is over)', () => {
  const today = new Date(2026, 10, 17); // 17 Nov 2026
  it('allows months that are over and skips the running and future months', () => {
    expect(hasReturnPeriodEnded('October 2026', today)).toBe(true);
    expect(hasReturnPeriodEnded('April 2026', today)).toBe(true);
    expect(hasReturnPeriodEnded('November 2026', today)).toBe(false);
    expect(hasReturnPeriodEnded('March 2027', today)).toBe(false);
    expect(hasReturnPeriodEnded('November 2026', new Date(2026, 11, 1))).toBe(true); // from 1 Dec
  });
});

describe('GSTR-1 12-Month job manager & consolidated workbook', () => {
  it('runs a full-year job, tracks month chips, marks a failed month as PARTIAL and blocks duplicates', async () => {
    const gstin = '27AAAAA0000A1Z5';
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));

    const runnerFn = async ({ onEvent }: any) => {
      await gate;
      const months = ['April 2025', 'May 2025'].map((period, i) => ({ period, status: i ? 'FAILED' : 'SYNCED', count: i ? 0 : 3 }));
      for (const m of months) onEvent('MONTH_DONE', m);
      return { success: true, message: 'done', months };
    };

    const { jobId } = createAndRunAutopilotJob({ db: null, gstin, financialYear: '2025-26', isFullYear: true, runnerFn });
    expect(() => createAndRunAutopilotJob({ db: null, gstin, runnerFn })).toThrow(/already running/);

    release();
    await new Promise((r) => setTimeout(r, 20));
    const snap = getJob(jobId);
    expect(snap.status).toBe('PARTIAL');
    expect(snap.totalTargetMonths).toBe(12);
    expect(snap.months.map((m: any) => m.status)).toEqual(['SYNCED', 'FAILED']);
  });

  it('builds the 12-sheet SectionWiseSummary from SQLite with zero merges', async () => {
    const db = new sqlite3.Database(':memory:');
    initGstr1Database(db);
    await new Promise((r) => setTimeout(r, 50));

    const { wb, filename } = await buildGstr1FullYearWorkbookFromDb(db, '27aaaaa0000a1z5', '2025-26');
    expect(filename).toBe('GSTR1_SectionWiseSummary_27AAAAA0000A1Z5_202526.xlsx');
    expect(wb.SheetNames).toEqual(['B2B', 'B2CL', 'B2CS', 'Nil Rated', 'CDNR', 'ECO', 'CDNUR', 'EXP', 'ADVREC', 'ADVADJ', 'HSN', 'DOC']);
    for (const name of wb.SheetNames) expect(wb.Sheets[name]['!merges'] || []).toHaveLength(0);
  });
});
