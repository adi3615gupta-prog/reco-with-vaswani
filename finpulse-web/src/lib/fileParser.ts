/**
 * fileParser.ts - Backward compatibility re-export barrel.
 * 
 * Monolithic spreadsheet engine (>5,800 lines) decomposed into modular domain
 * subpackages under src/lib/excel/ (styles, parsers, builders).
 * All 34 exported functions, constants, and types are 100% preserved.
 */

export * from './excel';
export type { InvoiceRecord } from './reconciliation';
