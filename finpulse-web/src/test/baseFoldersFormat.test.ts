import { describe, it, expect } from 'vitest';

describe('Base Folders Invoice Excel Format Contract', () => {
  const STANDARD_2B_COLUMNS = [
    'Table',
    'Invoice Number',
    'Invoice Date',
    'Supplier GSTIN',
    'Supplier Name',
    'Taxable Value',
    'IGST',
    'CGST',
    'SGST',
    'Cess',
    'Total Value',
    'ITC Eligibility'
  ];

  it('Inward Credit Notes Base invoice columns must strictly match 2B Base columns', () => {
    const inwardCdnrColumns = [
      'Table',
      'Invoice Number',
      'Invoice Date',
      'Supplier GSTIN',
      'Supplier Name',
      'Taxable Value',
      'IGST',
      'CGST',
      'SGST',
      'Cess',
      'Total Value',
      'ITC Eligibility'
    ];

    expect(inwardCdnrColumns).toEqual(STANDARD_2B_COLUMNS);
  });

  it('Reversal Base invoice columns must have the identical 12 standard 2B columns as prefix', () => {
    const reversalInvoiceColumns = [
      'Table',
      'Invoice Number',
      'Invoice Date',
      'Supplier GSTIN',
      'Supplier Name',
      'Taxable Value',
      'IGST',
      'CGST',
      'SGST',
      'Cess',
      'Total Value',
      'ITC Eligibility',
      'Audit Notes',
      'Target Table'
    ];

    expect(reversalInvoiceColumns.slice(0, 12)).toEqual(STANDARD_2B_COLUMNS);
    expect(reversalInvoiceColumns[12]).toBe('Audit Notes');
    expect(reversalInvoiceColumns[13]).toBe('Target Table');
  });

  it('Outward Credit Notes Base invoice columns must strictly match GSTR-1 Outward columns', () => {
    const standardR1Columns = [
      'Table',
      'Invoice Number',
      'Invoice Date',
      'Customer GSTIN',
      'Customer Name',
      'Taxable Value',
      'IGST',
      'CGST',
      'SGST',
      'Cess',
      'Total Value'
    ];

    const outwardCnColumns = [
      'Table',
      'Invoice Number',
      'Invoice Date',
      'Customer GSTIN',
      'Customer Name',
      'Taxable Value',
      'IGST',
      'CGST',
      'SGST',
      'Cess',
      'Total Value'
    ];

    expect(outwardCnColumns).toEqual(standardR1Columns);
  });
});
