import { useState, useMemo, useEffect } from 'react';
import { Download, FileText, FileSpreadsheet, CheckCircle2, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  getClientSetup,
  aggregateNotes,
  getMasterGroupCodes
} from '@/lib/finStatements.storage';
import * as XLSX from 'xlsx-js-style';
import PrintableView from './PrintableView';

export default function ExportPanel() {
  const [isPrinting, setIsPrinting] = useState(false);
  const client = getClientSetup();

  // Excel Export
  const handleExcelExport = () => {
    try {
      toast.info('Generating Excel workbook...');
      const rawNotes = aggregateNotes(true);
      const noteMap = new Map<number, number>();
      let c = 1;
      rawNotes.forEach(n => noteMap.set(n.note_reference, c++));

      const getNote = (staticRef: number) => {
        const note = rawNotes.find(n => n.note_reference === staticRef);
        return {
          cy: note ? note.cy_grand_total : 0,
          py: note ? note.py_grand_total : 0,
          displayNum: note ? noteMap.get(staticRef)?.toString() : ''
        };
      };

      const wb = XLSX.utils.book_new();

      // --- Style Helpers ---
      const headerStyle = { font: { bold: true, sz: 12 }, alignment: { horizontal: 'center' } };
      const subHeaderStyle = { font: { bold: true, sz: 11 }, alignment: { horizontal: 'left' } };
      const boldStyle = { font: { bold: true } };
      const numStyle = { alignment: { horizontal: 'right' } };

      // --- BALANCE SHEET SHEET ---
      const bsData = [
        [{ v: client.company_name || 'COMPANY NAME', t: 's', s: headerStyle }, '', '', ''],
        [{ v: 'Balance Sheet as at 31st March', t: 's', s: { font: { italic: true }, alignment: { horizontal: 'center' } } }, '', '', ''],
        ['', '', '', ''],
        [{ v: 'Particulars', t: 's', s: boldStyle }, { v: 'Note No.', t: 's', s: boldStyle }, { v: 'Current Year (Rs)', t: 's', s: boldStyle }, { v: 'Previous Year (Rs)', t: 's', s: boldStyle }],
        [{ v: 'I. EQUITY AND LIABILITIES', t: 's', s: subHeaderStyle }, '', '', ''],
        [{ v: "1. Shareholders' funds", t: 's', s: subHeaderStyle }, '', '', ''],
        ['(a) Share capital', getNote(18).displayNum, getNote(18).cy, getNote(18).py],
        ['(b) Reserves and surplus', getNote(19).displayNum, getNote(19).cy, getNote(19).py],
        [{ v: '3. Non-current liabilities', t: 's', s: subHeaderStyle }, '', '', ''],
        ['(a) Long-term borrowings', getNote(21).displayNum, getNote(21).cy, getNote(21).py],
        ['(b) Deferred tax liabilities (Net)', getNote(22).displayNum, getNote(22).cy, getNote(22).py],
        ['(c) Long-term provisions', getNote(24).displayNum, getNote(24).cy, getNote(24).py],
        [{ v: '4. Current liabilities', t: 's', s: subHeaderStyle }, '', '', ''],
        ['(a) Short-term borrowings', getNote(25).displayNum, getNote(25).cy, getNote(25).py],
        ['(b) Trade payables', getNote(26).displayNum, getNote(26).cy, getNote(26).py],
        ['(c) Other current liabilities', getNote(28).displayNum, getNote(28).cy + getNote(27).cy, getNote(28).py + getNote(27).py],
        ['(d) Short-term provisions', getNote(29).displayNum, getNote(29).cy, getNote(29).py],
        ['', '', '', ''],
        [{ v: 'II. ASSETS', t: 's', s: subHeaderStyle }, '', '', ''],
        [{ v: '1. Non-current assets', t: 's', s: subHeaderStyle }, '', '', ''],
        ['(a) Property, Plant and Equipment', getNote(1).displayNum, getNote(1).cy, getNote(1).py],
        ['(b) Intangible assets', getNote(2).displayNum, getNote(2).cy, getNote(2).py],
        ['(c) Non-current investments', getNote(5).displayNum, getNote(5).cy, getNote(5).py],
        ['(d) Long-term loans and advances', getNote(6).displayNum, getNote(6).cy, getNote(6).py],
        ['(e) Other non-current assets', getNote(9).displayNum, getNote(9).cy + getNote(7).cy, getNote(9).py + getNote(7).py],
        [{ v: '2. Current assets', t: 's', s: subHeaderStyle }, '', '', ''],
        ['(a) Inventories', getNote(10).displayNum, getNote(10).cy, getNote(10).py],
        ['(b) Trade receivables', getNote(11).displayNum, getNote(11).cy, getNote(11).py],
        ['(c) Cash and cash equivalents', getNote(12).displayNum, getNote(12).cy, getNote(12).py],
        ['(d) Short-term loans and advances', getNote(14).displayNum, getNote(14).cy, getNote(14).py],
        ['(e) Other current assets', getNote(17).displayNum, getNote(17).cy + getNote(15).cy + getNote(16).cy, getNote(17).py + getNote(15).py + getNote(16).py],
      ];
      const wsBS = XLSX.utils.aoa_to_sheet(bsData);
      wsBS['!cols'] = [{ wch: 40 }, { wch: 10 }, { wch: 20 }, { wch: 20 }];
      wsBS['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } }];
      XLSX.utils.book_append_sheet(wb, wsBS, 'Balance Sheet');

      // --- P&L SHEET ---
      const plData = [
        [{ v: client.company_name || 'COMPANY NAME', t: 's', s: headerStyle }, '', '', ''],
        [{ v: 'Statement of Profit & Loss for the year ended 31st March', t: 's', s: { font: { italic: true }, alignment: { horizontal: 'center' } } }, '', '', ''],
        ['', '', '', ''],
        [{ v: 'Particulars', t: 's', s: boldStyle }, { v: 'Note No.', t: 's', s: boldStyle }, { v: 'Current Year (Rs)', t: 's', s: boldStyle }, { v: 'Previous Year (Rs)', t: 's', s: boldStyle }],
        ['I. Revenue from operations', getNote(30).displayNum, getNote(30).cy, getNote(30).py],
        ['II. Other income', getNote(31).displayNum, getNote(31).cy, getNote(31).py],
        ['', '', '', ''],
        [{ v: 'IV. Expenses:', t: 's', s: boldStyle }, '', '', ''],
        ['Cost of materials consumed', getNote(32).displayNum, getNote(32).cy, getNote(32).py],
        ['Purchases of Stock-in-Trade', getNote(33).displayNum, getNote(33).cy, getNote(33).py],
        ['Changes in inventories', getNote(34).displayNum, getNote(34).cy, getNote(34).py],
        ['Employee benefits expense', getNote(35).displayNum, getNote(35).cy, getNote(35).py],
        ['Finance costs', getNote(36).displayNum, getNote(36).cy, getNote(36).py],
        ['Depreciation and amortization', getNote(37).displayNum, getNote(37).cy, getNote(37).py],
        ['Other expenses', getNote(38).displayNum, getNote(38).cy, getNote(38).py],
        ['', '', '', ''],
        [{ v: 'VI. Tax expense:', t: 's', s: boldStyle }, '', '', ''],
        ['(1) Current tax', getNote(39).displayNum, getNote(39).cy, getNote(39).py],
      ];
      const wsPL = XLSX.utils.aoa_to_sheet(plData);
      wsPL['!cols'] = [{ wch: 40 }, { wch: 10 }, { wch: 20 }, { wch: 20 }];
      wsPL['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } }];
      XLSX.utils.book_append_sheet(wb, wsPL, 'Profit & Loss');

      // --- NOTES SHEET ---
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const notesData: any[][] = [
        [{ v: client.company_name || 'COMPANY NAME', t: 's', s: headerStyle }, '', ''],
        [{ v: 'Notes forming part of the financial statements', t: 's', s: { font: { italic: true }, alignment: { horizontal: 'center' } } }, '', ''],
        ['', '', '']
      ];
      
      rawNotes.forEach(note => {
        notesData.push([
          { v: `Note ${noteMap.get(note.note_reference)}: ${note.note_title}`, t: 's', s: boldStyle },
          { v: 'Current Year (Rs)', t: 's', s: boldStyle },
          { v: 'Previous Year (Rs)', t: 's', s: boldStyle }
        ]);
        note.line_items.forEach(item => {
          notesData.push([item.particulars, item.cy_total, item.py_total]);
        });
        notesData.push([{ v: 'Total', t: 's', s: boldStyle }, { v: note.cy_grand_total, t: 'n', s: boldStyle }, { v: note.py_grand_total, t: 'n', s: boldStyle }]);
        notesData.push(['', '', '']);
      });

      const wsNotes = XLSX.utils.aoa_to_sheet(notesData);
      wsNotes['!cols'] = [{ wch: 50 }, { wch: 20 }, { wch: 20 }];
      wsNotes['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 2 } }];
      XLSX.utils.book_append_sheet(wb, wsNotes, 'Notes');

      // Download
      XLSX.writeFile(wb, `${client.company_name || 'Financial_Statements'}_Sch_III.xlsx`);
      toast.success('Excel file generated successfully');
    } catch (error) {
      console.error(error);
      toast.error('Failed to generate Excel file');
    }
  };

  // PDF Export
  useEffect(() => {
    if (isPrinting) {
      // Small delay to let React render PrintableView, then print
      const timer = setTimeout(() => {
        window.print();
        setIsPrinting(false);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isPrinting]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Download className="w-5 h-5 text-cyan-400" />
            Export Statements
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Download print-ready Schedule III Financial Statements.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* PDF Card */}
        <div className="bg-[rgba(15,23,42,0.45)] backdrop-blur-xl border border-white/5 rounded-2xl p-6 flex flex-col items-center justify-center text-center space-y-4 hover:bg-white/[0.02] transition-colors">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
            <FileText className="w-8 h-8 text-rose-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Export to PDF</h3>
            <p className="text-xs text-slate-400 mt-1">Generates a highly formatted, print-ready document with signatory blocks.</p>
          </div>
          <button
            onClick={() => setIsPrinting(true)}
            disabled={isPrinting}
            className="mt-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white text-xs font-black uppercase tracking-wider shadow-lg shadow-rose-600/20 transition-all active:scale-95 disabled:opacity-50"
          >
            {isPrinting ? 'Preparing...' : 'Generate PDF'}
          </button>
        </div>

        {/* Excel Card */}
        <div className="bg-[rgba(15,23,42,0.45)] backdrop-blur-xl border border-white/5 rounded-2xl p-6 flex flex-col items-center justify-center text-center space-y-4 hover:bg-white/[0.02] transition-colors">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <FileSpreadsheet className="w-8 h-8 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Export to Excel</h3>
            <p className="text-xs text-slate-400 mt-1">Generates a multi-sheet XLSX workbook (BS, P&L, Notes) with raw data.</p>
          </div>
          <button
            onClick={handleExcelExport}
            className="mt-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-black uppercase tracking-wider shadow-lg shadow-emerald-600/20 transition-all active:scale-95"
          >
            Download Excel
          </button>
        </div>

      </div>

      {/* Hidden Print View */}
      {isPrinting && <PrintableView />}

    </div>
  );
}
