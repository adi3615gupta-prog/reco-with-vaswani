import * as XLSX from 'xlsx-js-style';
import type { ExportWorkerRequest, ExportWorkerResponse } from '../lib/excel/types';
import { removeAllMergesFromWorkbook, assertZeroMerges } from '../lib/excel/styles/zeroMergeGuard';
import { buildMasterWorkbook } from '../lib/excel/builders/masterExport';
import { buildMonthlyComparisonWorkbook } from '../lib/excel/builders/monthlyComparisonExport';
import { buildDebitNotes21ColSheet } from '../lib/excel/builders/debitNotes21Col';
import { appendMonthlyDifferenceSheets } from '../lib/excel/builders/monthlyDiffExport';
import { appendExecutiveSummary, appendMethodologySheet } from '../lib/excel/builders/executiveSummary';
import { buildPartyWiseWorkbook } from '../lib/excel/builders/partyWiseExport';

self.onmessage = async (e: MessageEvent<ExportWorkerRequest>) => {
  const req = e.data;
  if (!req || req.type !== 'EXPORT_WORKBOOK') return;

  try {
    const { exportType, payload } = req;
    let wb: XLSX.WorkBook;
    let filename = payload?.filename || 'Export.xlsx';

    self.postMessage({
      type: 'PROGRESS',
      stage: `Initializing ${exportType} export...`,
      currentSheet: 0,
      totalSheets: 1,
      percent: 10
    } satisfies ExportWorkerResponse);

    switch (exportType) {
      case 'MASTER': {
        filename = payload?.filename || 'GST_Reconciliation_Master_Report.xlsx';
        self.postMessage({
          type: 'PROGRESS',
          stage: 'Generating Master Reconciliation sheets...',
          currentSheet: 1,
          totalSheets: 5,
          percent: 30
        } satisfies ExportWorkerResponse);

        wb = buildMasterWorkbook(
          payload.results,
          payload.companyName,
          payload.appliedGstins,
          payload.conflicts,
          payload.gstr3bData,
          payload.debitNotes,
          payload.rawBooksData,
          payload.raw2bData
        );
        break;
      }

      case 'MONTHLY_COMPARISON': {
        filename = payload?.filename || 'Monthly_Tax_Comparison.xlsx';
        self.postMessage({
          type: 'PROGRESS',
          stage: 'Generating Monthly Tax Comparison matrix...',
          currentSheet: 1,
          totalSheets: 4,
          percent: 35
        } satisfies ExportWorkerResponse);

        wb = buildMonthlyComparisonWorkbook(
          payload.rows,
          payload.debitNotes,
          payload.companyName,
          payload.appliedGstins,
          payload.conflicts,
          payload.gstr3bData
        );
        break;
      }

      case 'MONTHLY_DIFF': {
        filename = payload?.filename || 'Monthly_Difference_Sheets.xlsx';
        self.postMessage({
          type: 'PROGRESS',
          stage: 'Generating 12 Monthly Difference sheets...',
          currentSheet: 1,
          totalSheets: 14,
          percent: 30
        } satisfies ExportWorkerResponse);

        wb = XLSX.utils.book_new();
        const tabs = [
          { name: '🏠 Home', target: 'Executive Summary' },
          { name: '📊 Summary', target: 'Executive Summary' },
          { name: '📖 Guide', target: '📖 Methodology & Legend' }
        ];

        const counts: Record<string, number> = {};
        let totalDiff = 0;
        for (const r of payload.rows || []) {
          if (r.status === 'Prior FY (Excluded)') continue;
          counts[r.status] = (counts[r.status] || 0) + 1;
          const num = typeof r.totalDiff === 'number' ? r.totalDiff : parseFloat(String(r.totalDiff || 0).replace(/[^\d.-]/g, '')) || 0;
          totalDiff += num;
        }

        const breakdown = Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .map(([st, c]) => ({ label: st, value: c }));

        const stats = [
          { label: 'Total Records Analysed', value: (payload.rows || []).length },
          { label: 'Net Tax Difference', value: `₹${totalDiff.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
        ];

        appendExecutiveSummary(wb, payload.companyName, 'Monthly Difference Breakdown', stats, breakdown, tabs);
        appendMonthlyDifferenceSheets(wb, payload.rows, payload.debitNotes, payload.companyName, tabs);
        appendMethodologySheet(wb, payload.companyName, tabs);
        break;
      }

      case 'PARTY_WISE': {
        filename = payload?.filename || 'Party_Wise_Report.xlsx';
        self.postMessage({
          type: 'PROGRESS',
          stage: 'Aggregating Vendor summaries & details...',
          currentSheet: 1,
          totalSheets: 4,
          percent: 40
        } satisfies ExportWorkerResponse);

        wb = buildPartyWiseWorkbook(
          payload.parties,
          payload.companyName,
          payload.statusFilter,
          payload.appliedGstins,
          payload.conflicts
        );
        break;
      }

      case 'DEBIT_NOTES': {
        filename = payload?.filename || 'Reconciled_Debit_Notes_21Col.xlsx';
        self.postMessage({
          type: 'PROGRESS',
          stage: 'Building 21-column Debit Notes register...',
          currentSheet: 1,
          totalSheets: 1,
          percent: 50
        } satisfies ExportWorkerResponse);

        wb = XLSX.utils.book_new();
        const ws = buildDebitNotes21ColSheet(payload.rows, payload.companyName);
        XLSX.utils.book_append_sheet(wb, ws, 'Debit Notes Reconciled');
        break;
      }

      default:
        throw new Error(`Unsupported export type: ${exportType}`);
    }

    self.postMessage({
      type: 'PROGRESS',
      stage: 'Applying Zero-Merge verification and serializing XLSX binary...',
      currentSheet: wb.SheetNames.length,
      totalSheets: wb.SheetNames.length,
      percent: 85
    } satisfies ExportWorkerResponse);

    removeAllMergesFromWorkbook(wb);
    assertZeroMerges(wb);

    wb.Props = {
      Title: filename.replace('.xlsx', ''),
      Subject: 'Vaswani Enterprise Report',
      Author: 'Vaswani Return Enterprise Suite',
      Company: payload?.companyName || 'Client Organization',
      CreatedDate: new Date()
    };

    const outputArray = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const arrayBuffer = outputArray.buffer instanceof ArrayBuffer
      ? outputArray.buffer
      : new Uint8Array(outputArray).buffer;

    self.postMessage({
      type: 'PROGRESS',
      stage: 'Workbook ready for download',
      currentSheet: wb.SheetNames.length,
      totalSheets: wb.SheetNames.length,
      percent: 100
    } satisfies ExportWorkerResponse);

    self.postMessage(
      {
        type: 'SUCCESS',
        buffer: arrayBuffer,
        filename
      } satisfies ExportWorkerResponse,
      [arrayBuffer]
    );
  } catch (err: any) {
    self.postMessage({
      type: 'ERROR',
      error: err?.message || String(err) || 'Failed to export spreadsheet'
    } satisfies ExportWorkerResponse);
  }
};
