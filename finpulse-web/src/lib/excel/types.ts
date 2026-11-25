export interface ColumnMapping {
  supplierName: string;
  gstin: string;
  invoiceNo: string;
  invoiceDate: string;
  igst: string;
  cgst: string;
  sgst: string;
  // Optional — used only for compliance audit columns in exports
  taxableValue?: string;
  nilRated?: string;
  nonTaxable?: string;
  pos?: string;
  returnPeriod?: string;
  filingStatus?: string;
  filingDate?: string;
}

export interface MonthlyComparisonRow {
  partyTally: string;
  gstinTally: string;
  invoiceTally: string;
  cgstTally: number | string;
  sgstTally: number | string;
  igstTally: number | string;
  partyCmp: string;
  gstinCmp: string;
  invoiceCmp: string;
  cgstCmp: number | string;
  sgstCmp: number | string;
  igstCmp: number | string;
  status: string;
  totalDiff: number | string;
  dateTally?: string;
  dateCmp?: string;
  taxableTally?: number | string;
  taxableCmp?: number | string;
  // Compliance audit columns (optional — added to side-by-side sheet only)
  itcEligibility?: string;
  gstr1Status?: string;
  filingDate?: string;
  daysOld?: number | string;
  taxRatePct?: number | string;
  posCompliance?: string;
  rule37Warning?: string;
  remark?: string;
}

export interface DebitNoteRecord {
  invoiceDate: string;
  cgst: number;
  sgst: number;
  igst: number;
  gstin?: string;
  supplierName?: string;
  invoiceNo?: string;
  noteNo?: string;
  taxableValue?: number;
}

export type ExportType =
  | 'MASTER'
  | 'MONTHLY_COMPARISON'
  | 'MONTHLY_DIFF'
  | 'PARTY_WISE'
  | 'DEBIT_NOTES';

export interface ExportWorkerRequest {
  type: 'EXPORT_WORKBOOK';
  exportType: ExportType;
  payload: any;
}

export type ExportWorkerResponse =
  | {
      type: 'PROGRESS';
      stage: string;
      currentSheet: number;
      totalSheets: number;
      percent: number;
    }
  | {
      type: 'SUCCESS';
      buffer: ArrayBuffer;
      filename: string;
    }
  | {
      type: 'ERROR';
      error: string;
    };
