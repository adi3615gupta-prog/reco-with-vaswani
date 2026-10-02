import { describe, it, expect, vi } from 'vitest';
import { reconcileTds, exportTdsReport, computeBooksTdsLiability, computeAdvanceTdsAudit, type TdsReconciliationResult } from '../lib/tdsEngine';
import * as XLSX from 'xlsx-js-style';

vi.mock('xlsx-js-style', () => {
    return {
        writeFile: vi.fn(),
        utils: {
            book_new: () => ({ SheetNames: [], Sheets: {} }),
            aoa_to_sheet: (aoa: any[][]) => {
                const ws: any = {};
                let maxC = 0;
                aoa.forEach((row, r) => {
                    if (row.length - 1 > maxC) maxC = row.length - 1;
                    row.forEach((cell, c) => {
                        const addr = String.fromCharCode(65 + c) + (r + 1);
                        if (cell && typeof cell === 'object' && ('t' in cell || 'f' in cell || 'v' in cell)) {
                            ws[addr] = { ...cell };
                        } else {
                            ws[addr] = { t: 's', v: cell !== undefined && cell !== null ? cell : '' };
                        }
                    });
                });
                ws['!ref'] = `A1:${String.fromCharCode(65 + maxC)}${aoa.length}`;
                return ws;
            },
            book_append_sheet: vi.fn(),
            decode_range: (ref: string) => {
                const parts = ref.split(':');
                const endPart = parts[1];
                const endColChar = endPart.match(/[A-Z]+/)?.[0] || 'A';
                const endRowStr = endPart.match(/[0-9]+/)?.[0] || '1';
                return {
                    s: { r: 0, c: 0 },
                    e: { r: parseInt(endRowStr, 10) - 1, c: endColChar.charCodeAt(0) - 65 }
                };
            },
            encode_cell: (cell: { r: number; c: number }) => {
                return String.fromCharCode(65 + cell.c) + (cell.r + 1);
            }
        }
    };
});

describe('TDS Engine', () => {
    it('should reconcile books vs traces correctly', () => {
        const booksLiability = {
            'PAN123_194C': {
                partyName: 'Vendor A',
                annualSpend: 150000,
                taxableAmount: 150000,
                requiredTds: 3000,
                actualTds: 3000,
                ledgers: new Set(['Contractor Exp']),
                reason: 'Threshold crossed.'
            }
        };

        const tracesData = [
            {
                partyPan: 'PAN123',
                partyName: 'Vendor A',
                section: '194C',
                amountPaid: 150000,
                tdsDeducted: 3000
            }
        ];

        const results = reconcileTds(booksLiability, tracesData);
        expect(results).toHaveLength(1);
        expect(results[0].status).toBe('Matched');
        expect(results[0].panInBooks).toBe('PAN123');
        expect(results[0].panIn26Q).toBe('PAN123');
        expect(results[0].nameInBooks).toBe('Vendor A');
        expect(results[0].nameIn26Q).toBe('Vendor A');
        expect(results[0].taxableVariance).toBe(0);
        expect(results[0].tdsVariance).toBe(0);
    });

    it('should reconcile books vs traces using Name and Fuzzy matching when PAN is missing in Books', () => {
        const booksLiability = {
            'NOPAN-VENDOR B_194C': {
                partyName: 'Vendor B',
                annualSpend: 200000,
                taxableAmount: 200000,
                requiredTds: 4000,
                actualTds: 4000,
                ledgers: new Set(['Contractor Exp']),
                reason: 'Threshold crossed.'
            },
            'NOPAN-VENDOR C_194C': {
                partyName: 'Vendor C',
                annualSpend: 100000,
                taxableAmount: 100000,
                requiredTds: 2000,
                actualTds: 2000,
                ledgers: new Set(['Contractor Exp']),
                reason: 'Threshold crossed.'
            }
        };

        const tracesData = [
            {
                partyPan: 'ABCDB9999F',
                partyName: 'Vendor B',
                section: '194C',
                amountPaid: 200000,
                tdsDeducted: 4000
            },
            {
                partyPan: 'ABDCC8888F',
                partyName: 'Vendar C',
                section: '194C',
                amountPaid: 100000,
                tdsDeducted: 2000
            }
        ];

        const results = reconcileTds(booksLiability, tracesData);

        const bResult = results.find(r => r.nameInBooks === 'Vendor B')!;
        expect(bResult).toBeDefined();
        expect(bResult.status).toBe('Matched');
        expect(bResult.panInBooks).toBe('PAN-MISSING');
        expect(bResult.panIn26Q).toBe('ABCDB9999F');
        expect(bResult.nameIn26Q).toBe('Vendor B');
        expect(bResult.reason).toContain('[Name Match]');

        const cResult = results.find(r => r.nameInBooks === 'Vendor C')!;
        expect(cResult).toBeDefined();
        expect(cResult.status).toBe('Matched');
        expect(cResult.panInBooks).toBe('PAN-MISSING');
        expect(cResult.panIn26Q).toBe('ABDCC8888F');
        expect(cResult.nameIn26Q).toBe('Vendar C');
        expect(cResult.reason).toContain('[Fuzzy Name Match]');
    });

    it('should reconcile books vs traces when party name in books has suffix like - CR and PAN is missing', () => {
        const booksLiability = {
            'NOPAN-ML INDUSTRIES - CR_194I(b)': {
                partyName: 'ML INDUSTRIES - CR',
                annualSpend: 2625000,
                taxableAmount: 2625000,
                requiredTds: 262500,
                actualTds: 262500,
                ledgers: new Set(['FACTORY RENT']),
                reason: 'Threshold crossed.'
            }
        };

        const tracesData = [
            {
                partyPan: 'ABWFM1780A',
                partyName: 'ML INDUSTRIES',
                section: '194I(b)',
                amountPaid: 2625000,
                tdsDeducted: 262500
            }
        ];

        const results = reconcileTds(booksLiability, tracesData);
        expect(results).toHaveLength(1);
        expect(results[0].status).toBe('Matched');
        expect(results[0].panInBooks).toBe('PAN-MISSING');
        expect(results[0].panIn26Q).toBe('ABWFM1780A');
        expect(results[0].nameInBooks).toBe('ML INDUSTRIES - CR');
        expect(results[0].nameIn26Q).toBe('ML INDUSTRIES');
        expect(results[0].reason).toContain('[Name Match]');
    });

    it('should reconcile books vs traces when PAN contains spaces', () => {
        const booksLiability = {
            'BUDPA3038A_194C': {
                partyName: 'INDIA CONSTRUCTION',
                annualSpend: 913608,
                taxableAmount: 913608,
                requiredTds: 18272,
                actualTds: 18272,
                ledgers: new Set(['Contractor Exp']),
                reason: 'Threshold crossed.'
            }
        };

        const tracesData = [
            {
                partyPan: 'BUDPA 3038 A',
                partyName: 'INDIA CONSTRUCTION',
                section: '194C',
                amountPaid: 913608,
                tdsDeducted: 18272
            }
        ];

        const results = reconcileTds(booksLiability, tracesData);
        expect(results).toHaveLength(1);
        expect(results[0].status).toBe('Matched');
        expect(results[0].panInBooks).toBe('BUDPA3038A');
        expect(results[0].panIn26Q).toBe('BUDPA3038A');
        expect(results[0].nameInBooks).toBe('INDIA CONSTRUCTION');
        expect(results[0].nameIn26Q).toBe('INDIA CONSTRUCTION');
    });

    it('should generate workbook with formulas in exportTdsReport', () => {
        const results: TdsReconciliationResult[] = [
            {
                partyName: 'Vendor A',
                partyPan: 'PAN123',
                panInBooks: 'PAN123',
                panIn26Q: 'PAN123',
                nameInBooks: 'Vendor A',
                nameIn26Q: 'Vendor A',
                section: '194C',
                ledgers: 'Contractor Exp',
                booksSpend: 100000,
                booksTaxable: 100000,
                rateApplied: 2.0,
                booksRequiredTds: 2000,
                booksActualTds: 2000,
                tracesTaxable: 80000,
                tracesTds: 1600,
                taxableVariance: 20000,
                tdsVariance: 400,
                status: 'Short Deducted'
            }
        ];

        exportTdsReport(results, 'Test Company');

        expect(XLSX.utils.book_append_sheet).toHaveBeenCalled();
        const ws = (XLSX.utils.book_append_sheet as any).mock.calls[0][1] as XLSX.WorkSheet;

        // J5: Req. TDS (Books)
        const cellJ5 = ws['J5'];
        expect(cellJ5).toBeDefined();
        expect((cellJ5 as any).f).toBe('ROUND(G5*I5/100, 0)');
        expect((cellJ5 as any).v).toBe(2000);

        // Col N is Books TDS Variance (J5 - K5)
        const cellN5 = ws['N5'];
        expect(cellN5).toBeDefined();
        expect((cellN5 as any).f).toBe('J5-K5');
        expect((cellN5 as any).v).toBe(0);

        // Col O is 26Q TDS Variance (J5 - M5)
        const cellO5 = ws['O5'];
        expect(cellO5).toBeDefined();
        expect((cellO5 as any).f).toBe('J5-M5');
        expect((cellO5 as any).v).toBe(400);

        // Col P is Taxable Variance (G5 - L5)
        const cellP5 = ws['P5'];
        expect(cellP5).toBeDefined();
        expect((cellP5 as any).f).toBe('G5-L5');
        expect((cellP5 as any).v).toBe(20000);

        // Check GRAND TOTAL formulas (R=5, Excel row 6)
        const cellF6 = ws['F6']; // GRAND TOTAL for Books Spend
        expect(cellF6).toBeDefined();
        expect((cellF6 as any).f).toBe('SUM(F5:F5)');
        expect((cellF6 as any).v).toBe(100000);

        const cellG6 = ws['G6']; // GRAND TOTAL for Books Taxable
        expect(cellG6).toBeDefined();
        expect((cellG6 as any).f).toBe('SUM(G5:G5)');
        expect((cellG6 as any).v).toBe(100000);

        const cellJ6 = ws['J6']; // GRAND TOTAL for Req TDS
        expect(cellJ6).toBeDefined();
        expect((cellJ6 as any).f).toBe('SUM(J5:J5)');
        expect((cellJ6 as any).v).toBe(2000);

        const cellO6 = ws['O6']; // GRAND TOTAL for 26Q TDS Variance
        expect(cellO6).toBeDefined();
        expect((cellO6 as any).f).toBe('SUM(O5:O5)');
        expect((cellO6 as any).v).toBe(400);

        const cellP6 = ws['P6']; // GRAND TOTAL for Taxable Variance
        expect(cellP6).toBeDefined();
        expect((cellP6 as any).f).toBe('SUM(P5:P5)');
        expect((cellP6 as any).v).toBe(20000);
    });

    it('should only match by name if the match is in the confirmedMatches list', () => {
        const booksLiability = {
            'NOPAN-RUDRA LAND DEVELOPERS_194C': {
                partyName: 'Rudra Land Developers',
                annualSpend: 150000,
                taxableAmount: 150000,
                requiredTds: 3000,
                actualTds: 3000,
                ledgers: new Set<string>(['Contractor Exp']),
                tdsLedgers: new Set<string>([]),
                maxSingleBill: 150000,
                reason: 'Threshold crossed.'
            }
        };

        const tracesData = [
            {
                partyPan: 'ABCDC1234F',
                partyName: 'Mauli Land Developers',
                section: '194C',
                amountPaid: 150000,
                tdsDeducted: 3000
            }
        ];

        // Case 1: Not confirmed -> should keep separate (2 results)
        const resultsSeparate = reconcileTds(booksLiability, tracesData, []);
        expect(resultsSeparate).toHaveLength(2);

        // Case 2: Confirmed -> should match (1 result)
        const resultsMatched = reconcileTds(booksLiability, tracesData, [
            { booksName: 'Rudra Land Developers', tracesName: 'Mauli Land Developers' }
        ]);
        expect(resultsMatched).toHaveLength(1);
        expect(resultsMatched[0].status).toBe('Matched');
    });

    it('should prioritize 26Q rate if party is matched in 26Q', () => {
        const booksLiability = {
            'NOPAN-VENDOR A_194C': {
                partyName: 'Vendor A',
                annualSpend: 150000,
                taxableAmount: 150000,
                requiredTds: 30000, // 20% originally applied
                actualTds: 1500,
                ledgers: new Set<string>(['Contractor Exp']),
                tdsLedgers: new Set<string>([]),
                maxSingleBill: 150000,
                rateApplied: 20.0,
                reason: 'Higher TDS Rate of 20% applied under Section 206AA due to missing PAN. Otherwise, simple Individual rate of 1% would apply.'
            }
        };

        const tracesData = [
            {
                partyPan: 'ABCDE1234F',
                partyName: 'Vendor A',
                section: '194C',
                amountPaid: 150000,
                tdsDeducted: 3000 // 2% rate in 26Q
            }
        ];

        const results = reconcileTds(booksLiability, tracesData);
        expect(results).toHaveLength(1);
        expect(results[0].rateApplied).toBe(2.0); // Uses 26Q rate (2%)
        expect(results[0].booksRequiredTds).toBe(3000); // 2% of 150000
        expect(results[0].tdsVariance).toBe(0); // 3000 - 3000 = 0
        expect(results[0].status).toBe('Matched');
        expect(results[0].reason).toContain('Form 26Q');
    });

    it('should use Books PAN if party is not in 26Q but has valid Books PAN', () => {
        const booksLiability = {
            'ABCCO1234F_194C': { // Company PAN
                partyName: 'Vendor B',
                annualSpend: 150000,
                taxableAmount: 150000,
                requiredTds: 3000, // 2% applied based on Company PAN
                actualTds: 3000,
                ledgers: new Set<string>(['Contractor Exp']),
                tdsLedgers: new Set<string>([]),
                maxSingleBill: 150000,
                rateApplied: 2.0,
                reason: 'Threshold crossed.'
            }
        };

        const tracesData: any[] = []; // Not in 26Q

        const results = reconcileTds(booksLiability, tracesData);
        expect(results).toHaveLength(1);
        expect(results[0].rateApplied).toBe(2.0); // 2% based on Company PAN
        expect(results[0].booksRequiredTds).toBe(3000);
        expect(results[0].status).toBe('Missing in 26Q');
        expect(results[0].reason).not.toContain('applied as PAN is missing');
    });

    it('should use individual rate fallback if Books PAN is missing and party is not matched in 26Q', () => {
        const booksLiability = {
            'NOPAN-VENDOR C_194C': {
                partyName: 'Vendor C',
                annualSpend: 150000,
                taxableAmount: 150000,
                requiredTds: 30000, // 20% originally applied
                actualTds: 1500,
                ledgers: new Set<string>(['Contractor Exp']),
                tdsLedgers: new Set<string>([]),
                maxSingleBill: 150000,
                rateApplied: 20.0,
                reason: 'Higher TDS Rate of 20% applied under Section 206AA due to missing PAN. Otherwise, simple Individual rate of 1% would apply.'
            }
        };

        const tracesData: any[] = []; // Not in 26Q

        const results = reconcileTds(booksLiability, tracesData);
        expect(results).toHaveLength(1);
        expect(results[0].rateApplied).toBe(1.0); // Fallback to individual rate of 1% for 194C
        expect(results[0].booksRequiredTds).toBe(1500); // 1% of 150000
        expect(results[0].status).toBe('Missing in 26Q');
        expect(results[0].reason).toContain('Individual fallback');
    });

    it('should compute net balance by subtracting credit adjustments and show details in reason', () => {
        const sectionsMaster = [
            {
                old_section: '194C',
                new_section_2025: '194C',
                nature_of_payment: 'Contractors',
                single_bill_threshold: 30000,
                annual_aggregate_threshold: 100000,
                rate_individual_huf: 1.0,
                rate_company_others: 2.0,
                rate_missing_pan_206AA: 20.0
            }
        ];

        const transactions = [
            {
                date: new Date('2025-09-17'),
                partyName: 'J S KABIN',
                partyPan: 'ABCDE1234F',
                ledgerName: 'Purchase - Labour Charges',
                amount: 36400,
                actualTdsDeducted: 0
            },
            {
                date: new Date('2025-12-04'),
                partyName: 'J S KABIN',
                partyPan: 'ABCDE1234F',
                ledgerName: 'Purchase - Labour Charges',
                amount: -18402, // Credit adjustment
                actualTdsDeducted: 0
            }
        ];

        const mappings = [
            { ledgerName: 'Purchase - Labour Charges', sectionCode: '194C' }
        ];

        const booksLiability = computeBooksTdsLiability(transactions, mappings, sectionsMaster);
        const key = 'ABCDE1234F_194C';
        expect(booksLiability[key]).toBeDefined();
        expect(booksLiability[key].annualSpend).toBe(17998); // 36400 - 18402
        expect(booksLiability[key].grossSpend).toBe(36400);
        expect(booksLiability[key].reversalAmount).toBe(18402);
        expect(booksLiability[key].reason).toContain('Spend: ₹17,998 (Gross: ₹36,400 | Reversals: ₹18,402)');
    });

    it('should compute advance TDS audit when current year payments exceed expense bills', () => {
        const sectionsMaster = [
            {
                old_section: '194C',
                new_section_2025: '194C',
                nature_of_payment: 'Contractors',
                single_bill_threshold: 30000,
                annual_aggregate_threshold: 100000,
                rate_individual_huf: 1.0,
                rate_company_others: 2.0,
                rate_missing_pan_206AA: 20.0
            }
        ];

        const transactions = [
            {
                date: new Date('2025-05-10'),
                partyName: 'ABC ADVANCE SUPPLIER',
                partyPan: 'ABCPP1234F', // Individual/HUF PAN (4th char = P)
                ledgerName: 'Labour Expenses',
                amount: 50000,
                actualTdsDeducted: 0,
                isPayment: false
            },
            {
                date: new Date('2025-06-15'),
                partyName: 'ABC ADVANCE SUPPLIER',
                partyPan: 'ABCPP1234F',
                ledgerName: 'Payment / Disbursement',
                amount: 0,
                actualTdsDeducted: 0,
                isPayment: true,
                paymentAmount: 150000 // Payment > Expense (150000 > 50000 -> Advance = 100000)
            }
        ];

        const mappings = [
            { ledgerName: 'Labour Expenses', sectionCode: '194C' }
        ];

        const advanceAudit = computeAdvanceTdsAudit(transactions, mappings, sectionsMaster);
        expect(advanceAudit).toHaveLength(1);
        expect(advanceAudit[0].partyName).toBe('ABC ADVANCE SUPPLIER');
        expect(advanceAudit[0].currentYearExpenses).toBe(50000);
        expect(advanceAudit[0].currentYearPayments).toBe(150000);
        expect(advanceAudit[0].advanceAmount).toBe(100000);
        expect(advanceAudit[0].section).toBe('194C');
        expect(advanceAudit[0].requiredTdsOnAdvance).toBe(1000); // 1% of 100,000 for Individual PAN
        expect(advanceAudit[0].status).toBe('Un-deducted Advance TDS');
    });

    it('should correctly account for Opening Credit Balance in Advance TDS calculation (GREENVELI LANDSCAPE test case)', () => {
        const sectionsMaster = [
            {
                old_section: '194C',
                new_section_2025: '393(1)_Sl_8i',
                nature_of_payment: 'Payment to Contractors',
                single_bill_threshold: 30000,
                annual_aggregate_threshold: 100000,
                rate_individual_huf: 1.0,
                rate_company_others: 2.0,
                rate_missing_pan_206AA: 20.0
            }
        ];

        const transactions = [
            {
                date: new Date('2025-05-10'),
                partyName: 'GREENVELI LANDSCAPE',
                partyPan: 'AAACG1234F',
                ledgerName: 'Bank Payment',
                amount: 0,
                actualTdsDeducted: 0,
                isPayment: true,
                paymentAmount: 715724,
                openingBalanceCr: 797372 // Opening Cr balance exceeds payments
            }
        ];

        const mappings = [
            { ledgerName: 'Landscaping Charges', sectionCode: '194C' }
        ];

        const partyOpeningBalances = new Map<string, number>([
            ['GREENVELI LANDSCAPE', 797372]
        ]);

        const advanceAudit = computeAdvanceTdsAudit(transactions, mappings, sectionsMaster, undefined, partyOpeningBalances);
        // Should evaluate Advance Amount = MAX(0, 715724 - (0 + 797372)) = 0, and be excluded from advance results
        expect(advanceAudit).toHaveLength(0);
    });

    it('should correctly calculate Section 194Q taxable base exceeding 50L threshold (Roof\'s India test case)', () => {
        const sectionsMaster = [
            {
                old_section: '194Q',
                new_section_2025: '393(1)_Sl_8ii',
                nature_of_payment: 'Purchase of Goods',
                single_bill_threshold: null,
                annual_aggregate_threshold: 5000000,
                rate_individual_huf: 0.1,
                rate_company_others: 0.1,
                rate_missing_pan_206AA: 5.0
            }
        ];

        const transactions = [
            {
                date: new Date('2025-08-01'),
                partyName: "Roof's India",
                partyPan: 'AAACR1234F', // Company PAN
                ledgerName: 'Purchase Account 194Q',
                amount: 8569526,
                actualTdsDeducted: 0
            }
        ];

        const mappings = [
            { ledgerName: 'Purchase Account 194Q', sectionCode: '194Q' }
        ];

        const booksLiability = computeBooksTdsLiability(transactions, mappings, sectionsMaster);
        const key = 'AAACR1234F_194Q';
        expect(booksLiability[key]).toBeDefined();
        expect(booksLiability[key].annualSpend).toBe(8569526);
        expect(booksLiability[key].taxableAmount).toBe(3569526); // 85,69,526 - 50,00,000
        expect(booksLiability[key].requiredTds).toBe(3570); // 35,69,526 * 0.1% = 3569.526 -> 3570
        expect(booksLiability[key].reason).toContain('TDS Status: Applicable | Total Spend: ₹85,69,526 | Exempt Threshold: ₹50,00,000 | Taxable Base: ₹35,69,526 | Book TDS: ₹0');

        const results = reconcileTds(booksLiability, []);
        expect(results).toHaveLength(1);
        expect(results[0].booksTaxable).toBe(3569526);
        expect(results[0].booksRequiredTds).toBe(3570);
    });
});
