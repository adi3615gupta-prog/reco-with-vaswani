// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import sqlite3 from 'sqlite3';
import { initGstr1Database, bulkSaveGstr1Invoices, recalculateGstr1Batch } from '../../gstr1/db.js';
import { initGstr2bDatabase, bulkSaveGstr2bInvoices, markGstr2bMonthRequested } from '../../gstr2b/db.js';
import { generateGstr1FullYearWorkbook } from '../../gstr1/fullYearExcel.js';

describe('Autopilot Concurrency, Cancellation & SQLite Integrity (AUTO-01..08, SEC-12)', () => {
  let db: sqlite3.Database;

  beforeEach(async () => {
    db = new sqlite3.Database(':memory:');
    initGstr1Database(db);
    initGstr2bDatabase(db);
    // Wait for in-memory tables to be created
    await new Promise((r) => setTimeout(r, 50));
  });

  it('GSTR-1 multi-rate B2CS rows never overwrite on conflict due to surrogate differentiator', async () => {
    const clientGstin = '27AABCS1429B1Z1';
    const period = 'November 2024';
    const invoices = [
      {
        section: 'B2CS',
        ctin: 'B2CS',
        pos: '27',
        rt: 5,
        txval: 10000,
        iamt: 0,
        camt: 250,
        samt: 250,
        val: 10500,
        return_period: period
      },
      {
        section: 'B2CS',
        ctin: 'B2CS',
        pos: '27',
        rt: 12,
        txval: 20000,
        iamt: 0,
        camt: 1200,
        samt: 1200,
        val: 22400,
        return_period: period
      },
      {
        section: 'B2CS',
        ctin: 'B2CS',
        pos: '27',
        rt: 18,
        txval: 30000,
        iamt: 0,
        camt: 2700,
        samt: 2700,
        val: 35400,
        return_period: period
      }
    ];

    const saveRes = await bulkSaveGstr1Invoices(db, clientGstin, period, invoices);
    expect(saveRes.count).toBe(3);

    // Verify all 3 distinct rows are preserved in SQLite
    const rows = await new Promise<any[]>((resolve) => {
      db.all(
        'SELECT section, rt, txval, inum FROM gstr1_invoices WHERE client_gstin = ? AND return_period = ?',
        [clientGstin, period],
        (err, r) => resolve(r || [])
      );
    });

    expect(rows.length).toBe(3);
    const rates = rows.map((r) => r.rt).sort((a, b) => a - b);
    expect(rates).toEqual([5, 12, 18]);

    // Check batch totals
    const batch = await new Promise<any>((resolve) => {
      db.get(
        'SELECT total_invoices, total_taxable, total_tax FROM gstr1_batches WHERE client_gstin = ? AND return_period = ?',
        [clientGstin, period],
        (err, r) => resolve(r || null)
      );
    });

    expect(batch).not.toBeNull();
    expect(batch.total_invoices).toBe(3);
    expect(batch.total_taxable).toBe(60000);
    expect(batch.total_tax).toBe(8300); // 500 + 2400 + 5400
  });

  it('GSTR-2B scoped deletion never wipes prior periods seen in amended rows', async () => {
    const clientGstin = '27AABCS1429B1Z1';

    // 1. Ingest April 2024 invoices
    const aprilInvoices = [
      {
        section: 'B2B',
        ctin: '27SUPPLIER1A1Z1',
        supplier_name: 'Vendor A',
        inum: 'INV-APR-01',
        idt: '15/04/2024',
        txval: 50000,
        igst: 9000,
        cgst: 0,
        sgst: 0,
        cess: 0,
        total_val: 59000,
        return_period: 'April 2024'
      }
    ];
    await bulkSaveGstr2bInvoices(db, clientGstin, 'April 2024', aprilInvoices);

    // Verify April invoice exists
    let aprilRows = await new Promise<any[]>((resolve) => {
      db.all(
        'SELECT * FROM gstr2b_invoices WHERE client_gstin = ? AND inum = ?',
        [clientGstin, 'INV-APR-01'],
        (err, r) => resolve(r || [])
      );
    });
    expect(aprilRows.length).toBe(1);

    // 2. Ingest May 2024 invoices that include an amended row referencing April date
    const mayInvoices = [
      {
        section: 'B2BA',
        ctin: '27SUPPLIER1A1Z1',
        supplier_name: 'Vendor A',
        inum: 'INV-APR-01-AMEND',
        idt: '15/04/2024', // Old invoice date
        txval: 60000,
        igst: 10800,
        cgst: 0,
        sgst: 0,
        cess: 0,
        total_val: 70800,
        return_period: 'May 2024'
      },
      {
        section: 'B2B',
        ctin: '27SUPPLIER2B2Z2',
        supplier_name: 'Vendor B',
        inum: 'INV-MAY-01',
        idt: '20/05/2024',
        txval: 20000,
        igst: 3600,
        cgst: 0,
        sgst: 0,
        cess: 0,
        total_val: 23600,
        return_period: 'May 2024'
      }
    ];
    await bulkSaveGstr2bInvoices(db, clientGstin, 'May 2024', mayInvoices);

    // GOLDEN CHECK: April invoice MUST NOT be deleted by May ingestion!
    aprilRows = await new Promise<any[]>((resolve) => {
      db.all(
        'SELECT * FROM gstr2b_invoices WHERE client_gstin = ? AND inum = ?',
        [clientGstin, 'INV-APR-01'],
        (err, r) => resolve(r || [])
      );
    });
    expect(aprilRows.length).toBe(1);
    expect(aprilRows[0].txval).toBe(50000);

    // May invoices must also exist
    const mayRows = await new Promise<any[]>((resolve) => {
      db.all(
        'SELECT * FROM gstr2b_invoices WHERE client_gstin = ? AND inum LIKE ?',
        [clientGstin, '%MAY%'],
        (err, r) => resolve(r || [])
      );
    });
    expect(mayRows.length).toBe(1);
  });

  it('GSTR-2B REQUESTED state tracks 20-minute generation window', async () => {
    const clientGstin = '27AABCS1429B1Z1';
    const period = 'November 2024';

    await markGstr2bMonthRequested(db, clientGstin, period);

    const batch = await new Promise<any>((resolve) => {
      db.get(
        'SELECT status, requested_at FROM gstr2b_batches WHERE client_gstin = ? AND return_period = ?',
        [clientGstin, period],
        (err, r) => resolve(r || null)
      );
    });

    expect(batch).not.toBeNull();
    expect(batch.status).toBe('REQUESTED');
    expect(batch.requested_at).toBeGreaterThan(0);
    expect(Date.now() - batch.requested_at).toBeLessThan(5000);
  });

  it('GSTR-1 Full Year Excel workbook enforces strict Zero-Merge architecture', () => {
    const wb = generateGstr1FullYearWorkbook({
      gstin: '27AABCS1429B1Z1',
      financialYear: '2024-25',
      b2bInvoices: [
        {
          return_period: 'April 2024',
          ctin: '27SUPPLIER1A1Z1',
          cname: 'Alpha Traders',
          inum: 'INV-101',
          idt: '05-04-2024',
          val: 11800,
          pos: '27',
          rchrg: 'N',
          inv_typ: 'Regular',
          rt: 18,
          txval: 10000,
          camt: 900,
          samt: 900
        }
      ],
      b2clInvoices: [],
      b2csInvoices: [],
      cdnrInvoices: [],
      expInvoices: [],
      hsnInvoices: [],
      docInvoices: [],
      batches: []
    });

    expect(wb).toBeDefined();
    for (const sheetName of Object.keys(wb.Sheets)) {
      const ws = wb.Sheets[sheetName];
      const merges = ws['!merges'] || [];
      expect(merges.length).toBe(0);
    }
  });
});

