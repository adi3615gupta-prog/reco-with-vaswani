import XLSXStyle from 'xlsx-js-style';
const XLSX: any = (XLSXStyle as any).default || XLSXStyle;
import type { InvoiceRecord } from '../../reconciliation';
import { formatDateStr } from '../styles/formatters';

export async function parseGSTR1File(file: File): Promise<{ records: InvoiceRecord[]; hsnData: any[]; docData: any[] }> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false });

  const records: InvoiceRecord[] = [];

  const safeNum = (val: unknown): number => {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    const n = parseFloat(String(val).replace(/[₹,\s]/g, ''));
    return isNaN(n) ? 0 : n;
  };

  const safeStr = (val: unknown): string => String(val || '').trim();

  // Category 1: Standard Layout Sheets (Headers on Row 1)
  const processStandardSheet = (sheetName: string, typeLabel: string) => {
    if (!wb.SheetNames.includes(sheetName)) return;
    const sheet = wb.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

    for (const row of json) {
      const gstin = safeStr(row['GSTIN'] || row['E-Commerce Operator GSTIN']);
      let invoiceNo = safeStr(row['Invoice No'] || row['Note No']);

      if (!invoiceNo) {
        if (sheetName === 'B2CS') invoiceNo = `B2CS-${safeStr(row['POS'])}-${safeStr(row['Tax Rate'])}`;
        else if (sheetName === 'ECO') invoiceNo = `ECO-${gstin || safeStr(row['Type'])}`;
        else if (sheetName === 'ADVREC' || sheetName === 'ADVADJ') invoiceNo = `${sheetName}-${safeStr(row['POS'])}`;
        else continue;
      }

      const isCreditNote = safeStr(row['Note Type']).toUpperCase().includes('C');
      const mult = isCreditNote ? -1 : 1;

      records.push({
        supplierName: safeStr(row['Receiver Name'] || row['E-Commerce Operator Name']) || `Unregistered (${typeLabel})`,
        gstin,
        invoiceNo,
        invoiceDate: formatDateStr(row['Invoice Date'] || row['Note Date']),
        taxableValue: safeNum(row['Taxable Value']) * mult,
        igst: safeNum(row['IGST']) * mult,
        cgst: safeNum(row['CGST']) * mult,
        sgst: safeNum(row['SGST']) * mult,
        source: '2B',
        sourceLabel: `GSTR-1 (${typeLabel})`
      });
    }
  };

  processStandardSheet('B2B', 'B2B');
  processStandardSheet('B2CL', 'B2CL');
  processStandardSheet('B2CS', 'B2CS');
  processStandardSheet('CDNR', 'CDNR');
  processStandardSheet('CDNUR', 'CDNUR');
  processStandardSheet('EXP', 'EXP');
  processStandardSheet('ECO', 'ECO');
  processStandardSheet('ADVREC', 'ADVREC');
  processStandardSheet('ADVADJ', 'ADVADJ');

  // Category 2: Metadata Layout Sheets (Headers on Row 7 / Index 6)
  const processMetadataSheet = (sheetName: string) => {
    if (!wb.SheetNames.includes(sheetName)) return [];
    const sheet = wb.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { range: 6, defval: '' });
    return json.filter(row => Object.keys(row).some(k => !k.startsWith('__EMPTY') && String(row[k]).trim() !== ''));
  };

  const hsnData = processMetadataSheet('HSN');
  const docData = processMetadataSheet('DOC');

  return { records, hsnData, docData };
}

export async function parseMultipleGSTR1Files(files: File[]): Promise<{ records: InvoiceRecord[]; hsnData: any[]; docData: any[] }> {
  const allRecords: InvoiceRecord[] = [];
  const allHsnData: any[] = [];
  const allDocData: any[] = [];

  for (const file of files) {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array', cellDates: false });

    const safeNum = (val: unknown): number => {
      if (typeof val === 'number') return val;
      if (!val) return 0;
      const n = parseFloat(String(val).replace(/[₹,\s]/g, ''));
      return isNaN(n) ? 0 : n;
    };
    const safeStr = (val: unknown): string => String(val || '').trim();

    const processStandardSheet = (target: string, typeLabel: string) => {
      let sheetName = wb.SheetNames.find(s => s.toUpperCase() === target.toUpperCase());
      if (!sheetName && wb.SheetNames.length === 1 && file.name.toUpperCase().includes(target.toUpperCase())) {
        sheetName = wb.SheetNames[0];
      }
      if (!sheetName) return;

      const sheet = wb.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

      for (const row of json) {
        const gstin = safeStr(row['GSTIN'] || row['E-Commerce Operator GSTIN']);
        let invoiceNo = safeStr(row['Invoice No'] || row['Note No'] || row['Document Number']);

        if (!invoiceNo) {
          const period = safeStr(row['Return Period'] || row['Original Period']);
          if (target === 'B2CS') {
            invoiceNo = `B2CS${period ? '-' + period : ''}-${safeStr(row['POS'])}-${safeStr(row['Tax Rate'])}`;
          } else if (target === 'ECO') {
            invoiceNo = `ECO${period ? '-' + period : ''}-${gstin || safeStr(row['Type'])}`;
          } else if (target === 'ADVREC' || target === 'ADVADJ') {
            invoiceNo = `${target}-${safeStr(row['POS'])}`;
          } else continue;
        }

        const isCreditNote = safeStr(row['Note Type'] || row['Document Type']).toUpperCase().includes('C');
        const mult = isCreditNote ? -1 : 1;

        allRecords.push({
          supplierName: safeStr(row['Receiver Name'] || row['E-Commerce Operator Name'] || row['Trade/Legal Name']) || `Unregistered (${typeLabel})`,
          gstin,
          invoiceNo,
          invoiceDate: formatDateStr(row['Invoice Date'] || row['Note Date'] || row['Document Date']),
          taxableValue: safeNum(row['Taxable Value']) * mult,
          igst: safeNum(row['IGST'] || row['Integrated Tax']) * mult,
          cgst: safeNum(row['CGST'] || row['Central Tax']) * mult,
          sgst: safeNum(row['SGST'] || row['State/UT Tax']) * mult,
          source: '2B',
          sourceLabel: `GSTR-1 (${typeLabel})`
        });
      }
    };

    processStandardSheet('B2B', 'B2B');
    processStandardSheet('B2CL', 'B2CL');
    processStandardSheet('B2CS', 'B2CS');
    processStandardSheet('CDNR', 'CDNR');
    processStandardSheet('CDNUR', 'CDNUR');
    processStandardSheet('EXP', 'EXP');
    processStandardSheet('ECO', 'ECO');
    processStandardSheet('ADVREC', 'ADVREC');
    processStandardSheet('ADVADJ', 'ADVADJ');

    const processNilRatedSheet = () => {
      let sheetName = wb.SheetNames.find(s => s.toUpperCase().includes('NIL RATED'));
      if (!sheetName && wb.SheetNames.length === 1 && file.name.toUpperCase().includes('NIL')) {
        sheetName = wb.SheetNames[0];
      }
      if (!sheetName) return;

      const sheet = wb.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

      for (const row of json) {
        const desc = safeStr(row['Description']);
        const period = safeStr(row['Return Period']);
        if (!desc && !period) continue;

        const nilValue = safeNum(row['Nil Rated Supplies']) + safeNum(row['Exempted(Other than Nil Rated/Non GST Supply)']) + safeNum(row['Non GST Supplies']);
        if (nilValue === 0) continue;

        const periodStr = period ? `-${period}` : '';

        allRecords.push({
          supplierName: 'Unregistered (Nil Rated)',
          gstin: '',
          invoiceNo: `NIL${periodStr}-${desc.substring(0, 15)}`,
          invoiceDate: '',
          taxableValue: nilValue,
          igst: 0,
          cgst: 0,
          sgst: 0,
          source: '2B',
          sourceLabel: 'GSTR-1 (Nil Rated)'
        });
      }
    };

    processNilRatedSheet();

    const processMetadataSheet = (target: string) => {
      let sheetName = wb.SheetNames.find(s => s.toUpperCase() === target.toUpperCase());
      if (!sheetName && wb.SheetNames.length === 1 && file.name.toUpperCase().includes(target.toUpperCase())) {
        sheetName = wb.SheetNames[0];
      }
      if (!sheetName) return [];
      const sheet = wb.Sheets[sheetName];
      const jsonSkip6 = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { range: 6, defval: '' });
      const jsonNoSkip = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      const json = (jsonNoSkip.length > 0 && Object.keys(jsonNoSkip[0]).some(k => k.toLowerCase().includes('hsn') || k.toLowerCase().includes('document'))) ? jsonNoSkip : jsonSkip6;
      return json.filter(row => Object.keys(row).some(k => !k.startsWith('__EMPTY') && String(row[k]).trim() !== ''));
    };

    allHsnData.push(...processMetadataSheet('HSN'));
    allDocData.push(...processMetadataSheet('DOC'));
  }

  return { records: allRecords, hsnData: allHsnData, docData: allDocData };
}
