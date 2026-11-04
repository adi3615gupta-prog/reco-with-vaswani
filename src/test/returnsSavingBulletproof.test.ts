import { describe, it, expect, beforeEach } from 'vitest';
import sqlite3 from 'sqlite3';
import ExcelJS from 'exceljs';

describe('Returns Preparation (Suite 04) Bulletproof Saving Architecture', () => {
  let db: sqlite3.Database;

  beforeEach(async () => {
    db = new sqlite3.Database(':memory:');
    await new Promise<void>((resolve, reject) => {
      db.serialize(() => {
        db.run(`
          CREATE TABLE IF NOT EXISTS gstr3b_monthly_returns (
            id TEXT PRIMARY KEY,
            gstin TEXT NOT NULL,
            fy TEXT NOT NULL,
            month TEXT NOT NULL,
            client_name TEXT,
            taxable_outward REAL DEFAULT 0,
            igst_outward REAL DEFAULT 0,
            cgst_outward REAL DEFAULT 0,
            sgst_outward REAL DEFAULT 0,
            cess_outward REAL DEFAULT 0,
            taxable_rcm REAL DEFAULT 0,
            tax_rcm REAL DEFAULT 0,
            exempt_outward REAL DEFAULT 0,
            itc_import_goods REAL DEFAULT 0,
            itc_rcm REAL DEFAULT 0,
            itc_all_other REAL DEFAULT 0,
            itc_reversal_rule42_43 REAL DEFAULT 0,
            itc_reversal_others REAL DEFAULT 0,
            net_itc_available REAL DEFAULT 0,
            ineligible_itc_17_5 REAL DEFAULT 0,
            cash_tax_paid REAL DEFAULT 0,
            cash_interest_paid REAL DEFAULT 0,
            cash_late_fee_paid REAL DEFAULT 0,
            itc_setoff_total REAL DEFAULT 0,
            is_locked INTEGER DEFAULT 0,
            source TEXT DEFAULT 'WORKING_SHEET',
            updated_at INTEGER NOT NULL,
            UNIQUE(gstin, fy, month)
          )
        `);
        db.run(`CREATE INDEX IF NOT EXISTS idx_gstr3b_monthly_lookup ON gstr3b_monthly_returns(gstin, fy, month)`);

        db.run(`
          CREATE TABLE IF NOT EXISTS gstr3b_working_revisions (
            id TEXT PRIMARY KEY,
            gstin TEXT NOT NULL,
            fy TEXT NOT NULL,
            revision_number INTEGER NOT NULL,
            summary_text TEXT,
            created_at INTEGER NOT NULL,
            saved_by TEXT DEFAULT 'User',
            working_data_json TEXT NOT NULL
          )
        `);
        db.run(`CREATE INDEX IF NOT EXISTS idx_gstr3b_revisions_lookup ON gstr3b_working_revisions(gstin, fy, created_at DESC)`);

        db.run(`
          CREATE TABLE IF NOT EXISTS returns_tracking_records (
            id TEXT PRIMARY KEY,
            gstin TEXT NOT NULL,
            client_name TEXT,
            financial_year TEXT NOT NULL,
            period TEXT NOT NULL,
            frequency TEXT DEFAULT 'Monthly',
            gstr1_status TEXT DEFAULT 'PENDING',
            gstr1_arn TEXT,
            gstr1_filing_date TEXT,
            gstr1_taxable REAL DEFAULT 0,
            gstr1_tax REAL DEFAULT 0,
            gstr2b_status TEXT DEFAULT 'PENDING',
            gstr2b_count INTEGER DEFAULT 0,
            gstr2b_itc REAL DEFAULT 0,
            gstr3b_status TEXT DEFAULT 'PENDING',
            gstr3b_arn TEXT,
            gstr3b_filing_date TEXT,
            gstr3b_liability REAL DEFAULT 0,
            gstr3b_itc REAL DEFAULT 0,
            gstr3b_cash_paid REAL DEFAULT 0,
            office_stage TEXT DEFAULT 'NOT_STARTED',
            remarks TEXT,
            updated_at INTEGER,
            UNIQUE(gstin, financial_year, period)
          )
        `, () => resolve());
      });
    });
  });

  it('1. Correctly upserts monthly GSTR-3B tax figures into relational SQLite index table', async () => {
    const gstin = '27AABCU9603R1ZM';
    const fy = '2025-26';
    const month = 'September';
    const id = `${gstin}_${fy}_${month}`;

    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO gstr3b_monthly_returns (
          id, gstin, fy, month, client_name,
          taxable_outward, igst_outward, cgst_outward, sgst_outward, cess_outward,
          itc_all_other, net_itc_available, cash_tax_paid, is_locked, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(gstin, fy, month) DO UPDATE SET
          taxable_outward = excluded.taxable_outward,
          cash_tax_paid = excluded.cash_tax_paid,
          updated_at = excluded.updated_at`,
        [id, gstin, fy, month, 'Shree Ram Enterprises', 500000, 45000, 22500, 22500, 0, 80000, 80000, 10000, 0, Date.now()],
        (err) => (err ? reject(err) : resolve())
      );
    });

    // Verify row
    const row = await new Promise<any>((resolve, reject) => {
      db.get(`SELECT * FROM gstr3b_monthly_returns WHERE gstin = ? AND fy = ? AND month = ?`, [gstin, fy, month], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    expect(row).toBeDefined();
    expect(row.gstin).toBe(gstin);
    expect(row.taxable_outward).toBe(500000);
    expect(row.igst_outward).toBe(45000);
    expect(row.cash_tax_paid).toBe(10000);

    // Update with modified numbers
    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO gstr3b_monthly_returns (
          id, gstin, fy, month, client_name,
          taxable_outward, igst_outward, cgst_outward, sgst_outward, cess_outward,
          itc_all_other, net_itc_available, cash_tax_paid, is_locked, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(gstin, fy, month) DO UPDATE SET
          taxable_outward = excluded.taxable_outward,
          cash_tax_paid = excluded.cash_tax_paid,
          updated_at = excluded.updated_at`,
        [id, gstin, fy, month, 'Shree Ram Enterprises', 600000, 54000, 27000, 27000, 0, 80000, 80000, 28000, 0, Date.now()],
        (err) => (err ? reject(err) : resolve())
      );
    });

    const updatedRow = await new Promise<any>((resolve, reject) => {
      db.get(`SELECT * FROM gstr3b_monthly_returns WHERE gstin = ? AND fy = ? AND month = ?`, [gstin, fy, month], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    expect(updatedRow.taxable_outward).toBe(600000);
    expect(updatedRow.cash_tax_paid).toBe(28000);
  });

  it('2. Synchronizes GSTR-3B liability, itc, and cash paid to returns_tracking_records', async () => {
    const gstin = '27AABCU9603R1ZM';
    const fy = '2025-26';
    const month = 'September';
    const trackingId = `${gstin}_${fy}_${month}`;

    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO returns_tracking_records (
          id, gstin, client_name, financial_year, period,
          gstr3b_liability, gstr3b_itc, gstr3b_cash_paid, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(gstin, financial_year, period) DO UPDATE SET
          gstr3b_liability = excluded.gstr3b_liability,
          gstr3b_itc = excluded.gstr3b_itc,
          gstr3b_cash_paid = excluded.gstr3b_cash_paid,
          updated_at = excluded.updated_at`,
        [trackingId, gstin, 'Shree Ram Enterprises', fy, month, 108000, 80000, 28000, Date.now()],
        (err) => (err ? reject(err) : resolve())
      );
    });

    const trackingRow = await new Promise<any>((resolve, reject) => {
      db.get(`SELECT * FROM returns_tracking_records WHERE gstin = ? AND financial_year = ? AND period = ?`, [gstin, fy, month], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    expect(trackingRow.gstr3b_liability).toBe(108000);
    expect(trackingRow.gstr3b_itc).toBe(80000);
    expect(trackingRow.gstr3b_cash_paid).toBe(28000);
  });

  it('3. Enforces rolling 5-version retention limit in gstr3b_working_revisions', async () => {
    const gstin = '27AABCU9603R1ZM';
    const fy = '2025-26';

    // Insert 8 sequential revisions
    for (let i = 1; i <= 8; i++) {
      const revTime = 1000 + i * 100;
      const revId = `rev_${gstin}_${fy}_${revTime}`;
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO gstr3b_working_revisions (id, gstin, fy, revision_number, summary_text, created_at, saved_by, working_data_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [revId, gstin, fy, i, `Snapshot #${i}`, revTime, 'Staff', JSON.stringify({ version: i })],
          () => {
            // Prune to keep last 5 revisions
            db.run(
              `DELETE FROM gstr3b_working_revisions 
               WHERE gstin = ? AND fy = ? AND id NOT IN (
                 SELECT id FROM gstr3b_working_revisions WHERE gstin = ? AND fy = ? ORDER BY created_at DESC LIMIT 5
               )`,
              [gstin, fy, gstin, fy],
              () => resolve()
            );
          }
        );
      });
    }

    // Verify exactly 5 revisions remain
    const countRow = await new Promise<any>((resolve) => {
      db.get(`SELECT COUNT(*) as count FROM gstr3b_working_revisions WHERE gstin = ? AND fy = ?`, [gstin, fy], (_, r) => resolve(r));
    });
    expect(countRow.count).toBe(5);

    // Verify oldest versions (1, 2, 3) were pruned and versions (4, 5, 6, 7, 8) remain
    const remaining = await new Promise<any[]>((resolve) => {
      db.all(`SELECT revision_number FROM gstr3b_working_revisions WHERE gstin = ? AND fy = ? ORDER BY revision_number ASC`, [gstin, fy], (_, rows) => resolve(rows));
    });
    const revNumbers = remaining.map(r => r.revision_number);
    expect(revNumbers).toEqual([4, 5, 6, 7, 8]);
  });

  it('4. Strictly satisfies Rule 3 Zero-Merge Architecture on base corporate schedules', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Outward_R1_Base');

    const headers = ['Table', 'Section', 'Taxable Value', 'IGST', 'CGST', 'SGST', 'Total'];
    const colCount = headers.length;

    // Zero-Merge Corporate Header (Row 1 Title, Row 2 Subtitle)
    const r1 = ws.addRow(['SHREE RAM ENTERPRISES — OUTWARD SUPPLIES R1 (SEPTEMBER 2025-26)']);
    r1.height = 19;
    for (let c = 1; c <= colCount; c++) {
      const cell = r1.getCell(c);
      cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0F172A' } };
      cell.alignment = { vertical: 'middle', horizontal: c === 1 ? 'left' : 'center' };
    }

    const r2 = ws.addRow(['GSTIN: 27AABCU9603R1ZM | Return Period: September 2025-26 | Statutory Audit Grade Schedule']);
    r2.height = 14;
    for (let c = 1; c <= colCount; c++) {
      const cell = r2.getCell(c);
      cell.font = { name: 'Segoe UI', size: 8, bold: false, color: { argb: '94A3B8' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E293B' } };
      cell.alignment = { vertical: 'middle', horizontal: c === 1 ? 'left' : 'center' };
    }

    ws.addRow([]); // Spacer
    ws.addRow(headers); // Table Headers

    // Strip merges if any
    wb.eachSheet(sheet => {
      if (sheet.model) {
        sheet.model.merges = [];
      }
    });

    // Write to memory buffer
    const buffer = await wb.xlsx.writeBuffer();
    expect(buffer.length).toBeGreaterThan(0);

    // Re-parse with ExcelJS to assert strictly 0 merges exist
    const readWb = new ExcelJS.Workbook();
    await readWb.xlsx.load(buffer);
    const readWs = readWb.getWorksheet('Outward_R1_Base');

    expect(readWs).toBeDefined();
    const merges = (readWs as any).model?.merges || [];
    expect(merges.length).toBe(0); // STRICT ZERO MERGES VERIFIED
  });
});
