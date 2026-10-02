import { reconcile, type ReconciliationOptions } from '../lib/reconciliation';
import type { InvoiceRecord } from '../lib/fileParser';

export interface ReconciliationWorkerMessage {
  type: 'RUN_RECONCILIATION';
  tallyRecords: InvoiceRecord[];
  twoBRecords: InvoiceRecord[];
  options?: ReconciliationOptions;
}

export type ReconciliationWorkerResponse =
  | { type: 'PROGRESS'; stage: string; percent: number }
  | { type: 'SUCCESS'; results: any[] }
  | { type: 'ERROR'; error: string };

self.onmessage = (event: MessageEvent<ReconciliationWorkerMessage>) => {
  const { type, tallyRecords, twoBRecords, options } = event.data;

  if (type === 'RUN_RECONCILIATION') {
    try {
      self.postMessage({ type: 'PROGRESS', stage: 'Initializing multi-pass matching engine...', percent: 15 });

      const totalCount = tallyRecords.length + twoBRecords.length;
      self.postMessage({
        type: 'PROGRESS',
        stage: `Executing reconciliation for ${tallyRecords.length} Purchase Register vs ${twoBRecords.length} GSTR-2B records...`,
        percent: 45
      });

      const results = reconcile(tallyRecords, twoBRecords, options);

      self.postMessage({ type: 'PROGRESS', stage: `Reconciled ${results.length} total matched groups. Finalizing summaries...`, percent: 90 });

      self.postMessage({
        type: 'SUCCESS',
        results
      });
    } catch (err: any) {
      self.postMessage({ type: 'ERROR', error: err?.message || 'Failed to execute reconciliation in Web Worker' });
    }
  }
};
