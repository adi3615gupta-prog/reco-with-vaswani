import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { parseTallyVouchers } from './tallyApi';

describe('Tally API parsing logic', () => {
  it('should parse Sales vouchers with correct tax values', async () => {
    // Read the saved test vouchers XML
    const vouchersXml = fs.readFileSync(path.join(__dirname, '../../tests/test-tally13.xml'), 'utf8');

    // Run the parser as Sales
    const results = await parseTallyVouchers(
      [vouchersXml],
      { host: 'localhost', port: 9000 },
      'Sales',
      ['ITC', 'DUTIES & TAXES', 'DUTIES AND TAXES', 'INPUT'],
      ['OUTPUT', 'DUTIES & TAXES', 'DUTIES AND TAXES'],
      [] // Empty custom mappings to test auto-detection
    );

    console.log(`[TEST] Parsed ${results.length} vouchers from XML.`);
    
    // Find Voucher MH202526/001
    const v1 = results.find(v => v.voucherNumber === 'MH202526/001');
    expect(v1).toBeDefined();
    console.log(`[TEST] Voucher MH202526/001 values -> CGST: ${v1?.cgst}, SGST: ${v1?.sgst}, Total: ${v1?.totalAmount}`);
    
    expect(v1?.cgst).toBe(16143.28);
    expect(v1?.sgst).toBe(16143.28);
    expect(v1?.totalAmount).toBe(211656);
  });
});
