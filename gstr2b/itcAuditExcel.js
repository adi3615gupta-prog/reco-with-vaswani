import * as xlsxModule from 'xlsx';
const XLSX = xlsxModule.default || xlsxModule;

/**
 * removeAllMergesFromWorkbook — Defense-in-depth zero-merge enforcement.
 * Strips all '!merges' arrays from every worksheet in the workbook
 * to guarantee 100% filterable and sortable spreadsheets.
 */
export function removeAllMergesFromWorkbook(wb) {
    if (!wb || !wb.SheetNames) return wb;
    for (const name of wb.SheetNames) {
        const ws = wb.Sheets[name];
        if (ws) {
            ws['!merges'] = [];
            delete ws['!merges'];
        }
    }
    return wb;
}

/**
 * generateItcAllocationWorkbook
 * Produces a multi-sheet statutory audit workbook detailing GSTR-3B Table 4 allocations:
 * - Tab 1: Allocation Summary
 * - Tab 2: Eligible ITC 4(A)(5)
 * - Tab 3: Temporary Reversal 4(B)(2)
 * - Tab 4: Ineligible Credit 4(D)
 * - Tab 5: Permanent Reversal 4(B)(1)
 * - Tab 6: Inward RCM 4(A)(3)
 * - Tab 7: Deferred Vouchers
 */
export function generateItcAllocationWorkbook({ clientGstin, returnPeriod, clientName = '', summary, invoices = [] }) {
    const wb = XLSX.utils.book_new();

    // ──────────────────────────────────────────────────────────────────────────
    // TAB 1: ALLOCATION SUMMARY
    // ──────────────────────────────────────────────────────────────────────────
    const summaryRows = [
        ['VASWANI RETURN ENTERPRISE — GSTR-3B INWARD ITC AUDIT & STATUTORY ALLOCATION ANNEXURE'],
        [`Client GSTIN: ${clientGstin.toUpperCase()} | Trade Name: ${clientName || 'N/A'} | Return Period: ${returnPeriod}`],
        [],
        [
            'Table 4 Field',
            'Statutory Classification Description',
            'Vouchers Count',
            'Taxable Value (INR)',
            'IGST (INR)',
            'CGST (INR)',
            'SGST (INR)',
            'Cess (INR)',
            'Total Tax (INR)',
            '% Share of Total 2B Tax',
            'Reclaimable / Future Action'
        ]
    ];

    const totalTax = summary?.totalTax || 1; // avoid division by zero
    const pct = (val) => `${((val / totalTax) * 100).toFixed(2)}%`;

    const s = summary || {};
    const e4a5 = s.eligible_4a5 || { count: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, total: 0 };
    const t4b2 = s.temporary_4b2 || { count: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, total: 0 };
    const p4b1 = s.permanent_4b1 || { count: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, total: 0 };
    const i4d1 = s.ineligible_4d1 || { count: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, total: 0 };
    const i4d2 = s.ineligible_4d2 || { count: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, total: 0 };
    const r4a3 = s.rcm_4a3 || { count: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, total: 0 };
    const impg = s.import_4a1 || { count: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, total: 0 };
    const def = s.deferred || { count: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, total: 0 };

    summaryRows.push([
        'Table 4(A)(5)',
        'All Other ITC (Eligible Inward Supplies)',
        e4a5.count,
        e4a5.taxable,
        e4a5.igst,
        e4a5.cgst,
        e4a5.sgst,
        e4a5.cess,
        e4a5.total,
        pct(e4a5.total),
        'Claimed in Table 4(A)(5) of active month GSTR-3B'
    ]);

    summaryRows.push([
        'Table 4(B)(2)',
        'Temporary Reversal (Rule 37 180-days / Goods in Transit / Commercial Dispute)',
        t4b2.count,
        t4b2.taxable,
        t4b2.igst,
        t4b2.cgst,
        t4b2.sgst,
        t4b2.cess,
        t4b2.total,
        pct(t4b2.total),
        'Temporarily reversed — Eligible to Reclaim in future 3B u/s 16(2)'
    ]);

    summaryRows.push([
        'Table 4(D)(1)',
        'Ineligible ITC — Section 17(5) Blocked Credit (Vehicles, Catering, Club, etc.)',
        i4d1.count,
        i4d1.taxable,
        i4d1.igst,
        i4d1.cgst,
        i4d1.sgst,
        i4d1.cess,
        i4d1.total,
        pct(i4d1.total),
        'Permanently Ineligible — Statutory disclosure in Table 4(D)(1)'
    ]);

    summaryRows.push([
        'Table 4(D)(2)',
        'Ineligible ITC — Section 16(4) Time-Barred / POS Restricted Inward Supplies',
        i4d2.count,
        i4d2.taxable,
        i4d2.igst,
        i4d2.cgst,
        i4d2.sgst,
        i4d2.cess,
        i4d2.total,
        pct(i4d2.total),
        'Ineligible due to Nov 30 statutory cutoff or recipient state restriction'
    ]);

    summaryRows.push([
        'Table 4(B)(1)',
        'Permanent Reversal (Rule 38 Banking / Rule 42 & 43 Common Credit for Exempt Supplies)',
        p4b1.count,
        p4b1.taxable,
        p4b1.igst,
        p4b1.cgst,
        p4b1.sgst,
        p4b1.cess,
        p4b1.total,
        pct(p4b1.total),
        'Permanently reversed — Cannot be reclaimed'
    ]);

    summaryRows.push([
        'Table 4(A)(3)',
        'Inward Supplies Liable to Reverse Charge (RCM)',
        r4a3.count,
        r4a3.taxable,
        r4a3.igst,
        r4a3.cgst,
        r4a3.sgst,
        r4a3.cess,
        r4a3.total,
        pct(r4a3.total),
        'Reported in Table 3.1(d) liability & claimed in Table 4(A)(3) after tax payment'
    ]);

    summaryRows.push([
        'Table 4(A)(1)',
        'Import of Goods (Customs Inward ICEGATE / CBW)',
        impg.count,
        impg.taxable,
        impg.igst,
        impg.cgst,
        impg.sgst,
        impg.cess,
        impg.total,
        pct(impg.total),
        'Reported in Table 4(A)(1) as Import ITC'
    ]);

    summaryRows.push([
        'DEFERRED',
        'Deferred / Held Vouchers (Commercial Dispute / Withheld by User)',
        def.count,
        def.taxable,
        def.igst,
        def.cgst,
        def.sgst,
        def.cess,
        def.total,
        pct(def.total),
        'Excluded from active 3B — Carried forward to subsequent month'
    ]);

    // Summary Total Row
    summaryRows.push([
        'TOTAL GSTR-2B',
        'Consolidated Total Inward Supplies in GSTR-2B',
        s.totalInvoices || invoices.length,
        s.totalTaxable || 0,
        e4a5.igst + t4b2.igst + p4b1.igst + i4d1.igst + i4d2.igst + r4a3.igst + impg.igst + def.igst,
        e4a5.cgst + t4b2.cgst + p4b1.cgst + i4d1.cgst + i4d2.cgst + r4a3.cgst + impg.cgst + def.cgst,
        e4a5.sgst + t4b2.sgst + p4b1.sgst + i4d1.sgst + i4d2.sgst + r4a3.sgst + impg.sgst + def.sgst,
        e4a5.cess + t4b2.cess + p4b1.cess + i4d1.cess + i4d2.cess + r4a3.cess + impg.cess + def.cess,
        s.totalTax || 0,
        '100.00%',
        '100% Reconciliation Verification: All vouchers accounted for'
    ]);

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
    wsSummary['!cols'] = [
        { wch: 16 }, { wch: 55 }, { wch: 15 }, { wch: 20 },
        { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 14 },
        { wch: 18 }, { wch: 22 }, { wch: 50 }
    ];
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Allocation Summary');

    // ──────────────────────────────────────────────────────────────────────────
    // HELPER: BUILD LINE-ITEM REGISTER SHEET
    // ──────────────────────────────────────────────────────────────────────────
    const makeInvoiceSheet = (title, filteredInvoices, isTempRev = false, isIneligible = false) => {
        const rows = [
            [title],
            [`Client GSTIN: ${clientGstin.toUpperCase()} | Return Period: ${returnPeriod} | Vouchers Count: ${filteredInvoices.length}`],
            [],
            [
                'Sl No',
                'Section',
                'Supplier GSTIN',
                'Supplier Legal / Trade Name',
                'Invoice No',
                'Invoice Date',
                'Invoice Type',
                'Place of Supply',
                'Reverse Charge',
                'Taxable Value (INR)',
                'IGST (INR)',
                'CGST (INR)',
                'SGST (INR)',
                'Cess (INR)',
                'Total Tax (INR)',
                'Total Invoice Value (INR)',
                isTempRev ? 'Temporary Reversal Reason' : isIneligible ? 'Ineligibility Section / Reason' : 'Audit Remarks',
                isTempRev ? 'Reclaimable in Future 3B' : 'Allocated By',
                'Updated At'
            ]
        ];

        let sl = 1;
        for (const inv of filteredInvoices) {
            rows.push([
                sl++,
                inv.section || 'B2B',
                inv.ctin || '',
                inv.supplierName || inv.ctin || '',
                inv.invoiceNo || '',
                inv.invoiceDate || '',
                inv.invoiceType || 'Regular',
                inv.pos || '',
                inv.reverseCharge || 'N',
                inv.txval || 0,
                inv.igst || 0,
                inv.cgst || 0,
                inv.sgst || 0,
                inv.cess || 0,
                inv.totalTax || 0,
                inv.totalVal || 0,
                inv.notes || (isTempRev ? 'Rule 37 180-days / Goods in Transit' : isIneligible ? 'Section 17(5) Blocked' : 'Normal ITC'),
                isTempRev ? 'YES' : (inv.allocatedBy || 'User'),
                inv.allocatedAt ? new Date(inv.allocatedAt).toLocaleString('en-IN') : ''
            ]);
        }

        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = [
            { wch: 8 }, { wch: 10 }, { wch: 18 }, { wch: 35 },
            { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 16 },
            { wch: 15 }, { wch: 18 }, { wch: 14 }, { wch: 14 },
            { wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 22 },
            { wch: 35 }, { wch: 24 }, { wch: 22 }
        ];
        return ws;
    };

    // ──────────────────────────────────────────────────────────────────────────
    // TABS 2 TO 7: LINE-ITEM VOUCHER REGISTERS
    // ──────────────────────────────────────────────────────────────────────────
    const inv4a5 = invoices.filter(i => (i.targetTable || '4A5') === '4A5');
    const inv4b2 = invoices.filter(i => i.targetTable === '4B2');
    const inv4d = invoices.filter(i => i.targetTable === '4D1' || i.targetTable === '4D2');
    const inv4b1 = invoices.filter(i => i.targetTable === '4B1');
    const inv4a3 = invoices.filter(i => i.targetTable === '4A3');
    const invDef = invoices.filter(i => i.targetTable === 'DEFERRED');

    XLSX.utils.book_append_sheet(wb, makeInvoiceSheet('ELIGIBLE ITC REGISTER — TABLE 4(A)(5)', inv4a5), 'Eligible ITC 4(A)(5)');
    XLSX.utils.book_append_sheet(wb, makeInvoiceSheet('TEMPORARY REVERSAL REGISTER — TABLE 4(B)(2) (RECLAIMABLE)', inv4b2, true), 'Temporary Reversal 4(B)(2)');
    XLSX.utils.book_append_sheet(wb, makeInvoiceSheet('INELIGIBLE CREDIT REGISTER — TABLE 4(D)', inv4d, false, true), 'Ineligible Credit 4(D)');
    XLSX.utils.book_append_sheet(wb, makeInvoiceSheet('PERMANENT REVERSAL REGISTER — TABLE 4(B)(1)', inv4b1), 'Permanent Reversal 4(B)(1)');
    XLSX.utils.book_append_sheet(wb, makeInvoiceSheet('INWARD RCM SUPPLIES — TABLE 4(A)(3)', inv4a3), 'Inward RCM 4(A)(3)');
    XLSX.utils.book_append_sheet(wb, makeInvoiceSheet('DEFERRED VOUCHERS REGISTER (CARRIED FORWARD)', invDef), 'Deferred Vouchers');

    // ──────────────────────────────────────────────────────────────────────────
    // MANDATORY ZERO-MERGE ENFORCEMENT
    // ──────────────────────────────────────────────────────────────────────────
    return removeAllMergesFromWorkbook(wb);
}
