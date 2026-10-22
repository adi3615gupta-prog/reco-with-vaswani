import { reconcile, type ReconciliationOptions } from '../lib/reconciliation';
import type { InvoiceRecord } from '../lib/fileParser';
import { reconcileDebitNotes, type DebitNoteEngineResult } from '../lib/debitNoteEngine';

export interface ReconciliationWorkerMessage {
  type: 'RUN_RECONCILIATION' | 'RUN_DEBIT_NOTE_RECONCILIATION';
  tallyRecords?: InvoiceRecord[];
  twoBRecords?: InvoiceRecord[];
  prRecords?: any[];
  options?: ReconciliationOptions & { debitNotes?: { pr: any[]; twoB: any[] } };
}

export type ReconciliationWorkerResponse =
  | { type: 'PROGRESS'; stage: string; percent: number }
  | { type: 'SUCCESS'; results: any[]; debitNoteResult?: DebitNoteEngineResult }
  | { type: 'DEBIT_NOTE_SUCCESS'; result: DebitNoteEngineResult }
  | { type: 'ERROR'; error: string };

self.onmessage = (event: MessageEvent<ReconciliationWorkerMessage>) => {
  const { type, tallyRecords = [], twoBRecords = [], prRecords = [], options } = event.data;

  if (type === 'RUN_DEBIT_NOTE_RECONCILIATION') {
    try {
      self.postMessage({ type: 'PROGRESS', stage: 'Initializing Debit Note multi-pass reconciliation engine…', percent: 10 });
      const pr = prRecords.length > 0 ? prRecords : tallyRecords;
      self.postMessage({
        type: 'PROGRESS',
        stage: `Matching ${pr.length.toLocaleString()} PR Debit Notes vs ${twoBRecords.length.toLocaleString()} Portal Credit/Debit Notes…`,
        percent: 30
      });
      const result = reconcileDebitNotes(pr, twoBRecords);
      self.postMessage({ type: 'PROGRESS', stage: 'Debit Note reconciliation complete', percent: 100 });
      self.postMessage({ type: 'DEBIT_NOTE_SUCCESS', result });
    } catch (err: any) {
      self.postMessage({ type: 'ERROR', error: err?.message || 'Failed to execute debit note reconciliation in Web Worker' } as ReconciliationWorkerResponse);
    }
    return;
  }

  if (type === 'RUN_RECONCILIATION') {
    try {
      self.postMessage({ type: 'PROGRESS', stage: 'Initializing reconciliation engine…', percent: 5 });

      const totalRecords = tallyRecords.length + twoBRecords.length;
      self.postMessage({
        type: 'PROGRESS',
        stage: `Processing ${tallyRecords.length.toLocaleString()} Books records vs ${twoBRecords.length.toLocaleString()} GSTR-2B records…`,
        percent: 10
      });

      // Inject the onProgress callback so the worker emits fine-grained updates
      const optionsWithProgress: ReconciliationOptions = {
        ...(options || {}),
        onProgress: (stage: string, percent: number) => {
          self.postMessage({ type: 'PROGRESS', stage, percent } as ReconciliationWorkerResponse);
        },
      };

      const results = reconcile(tallyRecords, twoBRecords, optionsWithProgress);

      let debitNoteResult: DebitNoteEngineResult | undefined;
      if (options?.debitNotes && (options.debitNotes.pr?.length || options.debitNotes.twoB?.length)) {
        self.postMessage({
          type: 'PROGRESS',
          stage: 'Running 6-pass Debit Note reconciliation engine…',
          percent: 92
        });
        debitNoteResult = reconcileDebitNotes(options.debitNotes.pr || [], options.debitNotes.twoB || []);
      }

      self.postMessage({
        type: 'PROGRESS',
        stage: `Reconciled ${results.length.toLocaleString()} records. Finalising summaries…`,
        percent: 96
      });

      self.postMessage({ type: 'SUCCESS', results, debitNoteResult } as ReconciliationWorkerResponse);
    } catch (err: any) {
      self.postMessage({ type: 'ERROR', error: err?.message || 'Failed to execute reconciliation in Web Worker' } as ReconciliationWorkerResponse);
    }
  }
};
