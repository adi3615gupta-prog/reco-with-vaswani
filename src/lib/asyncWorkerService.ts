import { parseFile, type InvoiceRecord } from './fileParser';
import { reconcile, type ReconciliationOptions, type ReconciliationResult } from './reconciliation';
import type { FileParserWorkerResponse } from '../workers/fileParser.worker';
import type { ReconciliationWorkerResponse } from '../workers/reconciliation.worker';

export type ProgressCallback = (stage: string, percent: number) => void;

/**
 * Parses an uploaded Excel or XML file asynchronously using a background Web Worker.
 * Falls back gracefully to main-thread execution if Web Workers are unavailable or fail.
 */
export async function parseFileAsync(
  file: File,
  options?: { findHeader?: boolean; raw?: boolean },
  onProgress?: ProgressCallback
): Promise<{ headers: string[]; rows: Record<string, unknown>[] }> {
  // If options was passed as second param callback (overload convenience)
  if (typeof options === 'function') {
    onProgress = options as unknown as ProgressCallback;
    options = undefined;
  }

  return new Promise(async (resolve, reject) => {
    try {
      if (typeof window !== 'undefined' && window.Worker) {
        onProgress?.(`Reading ${file.name}...`, 10);
        const arrayBuffer = await file.arrayBuffer();

        const worker = new Worker(new URL('../workers/fileParser.worker.ts', import.meta.url), { type: 'module' });

        worker.onmessage = (e: MessageEvent<FileParserWorkerResponse>) => {
          const msg = e.data;
          if (msg.type === 'PROGRESS') {
            onProgress?.(msg.stage, msg.percent);
          } else if (msg.type === 'SUCCESS') {
            worker.terminate();
            resolve(msg.data);
          } else if (msg.type === 'ERROR') {
            worker.terminate();
            console.warn('Web Worker parsing failed, falling back to main thread:', msg.error);
            fallbackParseFile(file, options, onProgress).then(resolve).catch(reject);
          }
        };

        worker.onerror = (err) => {
          worker.terminate();
          console.warn('Web Worker error, falling back to main thread:', err);
          fallbackParseFile(file, options, onProgress).then(resolve).catch(reject);
        };

        const bufferCopy = arrayBuffer.slice(0);
        worker.postMessage({ type: 'PARSE_FILE', buffer: bufferCopy, fileName: file.name, options }, [bufferCopy]);
      } else {
        fallbackParseFile(file, options, onProgress).then(resolve).catch(reject);
      }
    } catch (err) {
      fallbackParseFile(file, options, onProgress).then(resolve).catch(reject);
    }
  });
}

async function fallbackParseFile(
  file: File,
  options?: { findHeader?: boolean; raw?: boolean },
  onProgress?: ProgressCallback
): Promise<{ headers: string[]; rows: Record<string, unknown>[] }> {
  onProgress?.(`Parsing ${file.name} on main thread...`, 50);
  const result = await parseFile(file, options);
  onProgress?.('Parsing completed', 100);
  return result;
}

/**
 * Runs multi-pass invoice reconciliation in a background Web Worker.
 * Falls back gracefully to main-thread execution if Web Workers are unavailable.
 */
export async function reconcileAsync(
  tallyRecords: InvoiceRecord[],
  twoBRecords: InvoiceRecord[],
  options?: ReconciliationOptions,
  onProgress?: ProgressCallback
): Promise<ReconciliationResult[]> {
  return new Promise((resolve, reject) => {
    try {
      if (typeof window !== 'undefined' && window.Worker) {
        onProgress?.('Initializing background reconciliation worker...', 10);

        const worker = new Worker(new URL('../workers/reconciliation.worker.ts', import.meta.url), { type: 'module' });

        worker.onmessage = (e: MessageEvent<ReconciliationWorkerResponse>) => {
          const msg = e.data;
          if (msg.type === 'PROGRESS') {
            onProgress?.(msg.stage, msg.percent);
          } else if (msg.type === 'SUCCESS') {
            worker.terminate();
            onProgress?.('Reconciliation completed', 100);
            resolve(msg.results);
          } else if (msg.type === 'ERROR') {
            worker.terminate();
            console.warn('Reconciliation Worker failed, falling back to main thread:', msg.error);
            fallbackReconcile(tallyRecords, twoBRecords, options, onProgress).then(resolve).catch(reject);
          }
        };

        worker.onerror = (err) => {
          worker.terminate();
          console.warn('Reconciliation Worker error, falling back to main thread:', err);
          fallbackReconcile(tallyRecords, twoBRecords, options, onProgress).then(resolve).catch(reject);
        };

        worker.postMessage({ type: 'RUN_RECONCILIATION', tallyRecords, twoBRecords, options });
      } else {
        fallbackReconcile(tallyRecords, twoBRecords, options, onProgress).then(resolve).catch(reject);
      }
    } catch (err) {
      fallbackReconcile(tallyRecords, twoBRecords, options, onProgress).then(resolve).catch(reject);
    }
  });
}

async function fallbackReconcile(
  tallyRecords: InvoiceRecord[],
  twoBRecords: InvoiceRecord[],
  options?: ReconciliationOptions,
  onProgress?: ProgressCallback
): Promise<ReconciliationResult[]> {
  onProgress?.('Running reconciliation on main thread...', 50);
  const results = reconcile(tallyRecords, twoBRecords, options);
  onProgress?.('Reconciliation completed', 100);
  return results;
}
