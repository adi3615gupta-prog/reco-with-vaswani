import { toast } from 'sonner';
import type { ExportWorkerRequest, ExportWorkerResponse } from './types';
import { exportToXlsx } from './builders/masterExport';
import { exportMonthlyComparison } from './builders/monthlyComparisonExport';
import { exportMonthlyDiffSheets } from './builders/monthlyDiffExport';
import { exportPartyWise } from './builders/partyWiseExport';
import { exportDebitNotes21Col } from './builders/debitNotes21Col';

/**
 * Initiates an asynchronous, off-main-thread Excel export via Web Worker.
 * If Web Workers are unsupported or running in Node.js, seamlessly falls back to synchronous export.
 */
export async function exportWorkbookAsync(
  request: ExportWorkerRequest,
  onProgress?: (progress: { stage: string; currentSheet: number; totalSheets: number; percent: number }) => void
): Promise<void> {
  const TOAST_ID = 'excel-export-progress';
  const isWorkerSupported = typeof window !== 'undefined' && typeof window.Worker !== 'undefined';

  if (!isWorkerSupported) {
    // Synchronous fallback (Headless / Node.js test environment)
    return executeSynchronousFallback(request);
  }

  return new Promise((resolve, reject) => {
    let worker: Worker | null = null;
    toast.loading('Starting spreadsheet generation in background...', { id: TOAST_ID });

    try {
      worker = new Worker(new URL('../../workers/excelExport.worker.ts', import.meta.url), {
        type: 'module'
      });

      worker.onmessage = (e: MessageEvent<ExportWorkerResponse>) => {
        const msg = e.data;
        if (!msg) return;

        if (msg.type === 'PROGRESS') {
          if (onProgress) {
            onProgress({
              stage: msg.stage,
              currentSheet: msg.currentSheet,
              totalSheets: msg.totalSheets,
              percent: msg.percent
            });
          }
          toast.loading(`${msg.stage} (${msg.percent}%)`, { id: TOAST_ID });
        } else if (msg.type === 'SUCCESS') {
          try {
            const blob = new Blob([msg.buffer], {
              type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = msg.filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);

            toast.success(`Export complete: ${msg.filename}`, { id: TOAST_ID });
            resolve();
          } catch (dlErr: any) {
            toast.error(`Download trigger failed: ${dlErr?.message || dlErr}`, { id: TOAST_ID });
            reject(dlErr);
          } finally {
            worker?.terminate();
            worker = null;
          }
        } else if (msg.type === 'ERROR') {
          toast.error(`Export failed: ${msg.error}`, { id: TOAST_ID });
          worker?.terminate();
          worker = null;
          reject(new Error(msg.error));
        }
      };

      worker.onerror = (err) => {
        const errorMsg = err.message || 'Worker execution failed';
        toast.error(`Export failed: ${errorMsg}`, { id: TOAST_ID });
        worker?.terminate();
        worker = null;
        reject(new Error(errorMsg));
      };

      worker.postMessage(request);
    } catch (workerErr: any) {
      if (worker) {
        worker.terminate();
        worker = null;
      }
      toast.loading('Worker unavailable, using direct synchronous export...', { id: TOAST_ID });
      executeSynchronousFallback(request)
        .then(() => {
          toast.success('Export completed successfully', { id: TOAST_ID });
          resolve();
        })
        .catch((syncErr) => {
          toast.error(`Export failed: ${syncErr?.message || syncErr}`, { id: TOAST_ID });
          reject(syncErr);
        });
    }
  });
}

function executeSynchronousFallback(request: ExportWorkerRequest): Promise<void> {
  const { exportType, payload } = request;
  try {
    switch (exportType) {
      case 'MASTER':
        exportToXlsx(
          payload.results,
          payload.filename || 'GST_Reconciliation_Master_Report.xlsx',
          payload.companyName,
          payload.appliedGstins,
          payload.conflicts,
          payload.gstr3bData,
          payload.debitNotes,
          payload.rawBooksData,
          payload.raw2bData
        );
        break;
      case 'MONTHLY_COMPARISON':
        exportMonthlyComparison(
          payload.rows,
          payload.filename || 'Monthly_Tax_Comparison.xlsx',
          payload.debitNotes,
          payload.companyName,
          payload.appliedGstins,
          payload.conflicts,
          payload.gstr3bData
        );
        break;
      case 'MONTHLY_DIFF':
        exportMonthlyDiffSheets(
          payload.rows,
          payload.filename || 'Monthly_Difference_Sheets.xlsx',
          payload.debitNotes,
          payload.companyName
        );
        break;
      case 'PARTY_WISE':
        exportPartyWise(
          payload.parties,
          payload.filename || 'Party_Wise_Report.xlsx',
          payload.companyName,
          payload.statusFilter,
          payload.appliedGstins,
          payload.conflicts
        );
        break;
      case 'DEBIT_NOTES':
        exportDebitNotes21Col(
          payload.rows,
          payload.filename || 'Reconciled_Debit_Notes_21Col.xlsx',
          payload.companyName
        );
        break;
      default:
        throw new Error(`Unsupported fallback export type: ${exportType}`);
    }
    return Promise.resolve();
  } catch (err: any) {
    return Promise.reject(err);
  }
}
