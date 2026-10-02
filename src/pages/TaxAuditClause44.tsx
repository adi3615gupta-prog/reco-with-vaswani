import React, { useState } from 'react';
import {
  ArrowLeft, Search, Download, AlertTriangle, CheckCircle2,
  Zap, FileText, RefreshCw, Server, WifiOff, Wifi,
  ChevronDown, ChevronUp, Info, Shield, Upload
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import * as XLSX from 'xlsx-js-style';
import {
  pingTally,
  fetchClause44Data,
  type Clause44Result,
  type TallyConnectionConfig,
} from '@/lib/tallyApi';

interface TaxAuditClause44Props {
  onBack: () => void;
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

export default function TaxAuditClause44({ onBack }: TaxAuditClause44Props) {
  const [tallyPort, setTallyPort] = useState(9000);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');

  const currentYear = new Date().getFullYear();
  const fyStart = new Date().getMonth() < 3 ? currentYear - 1 : currentYear;
  const [fromDate, setFromDate] = useState(`${fyStart}-04-01`);
  const [toDate, setToDate] = useState(`${fyStart + 1}-03-31`);
  const [taxLedgersInput, setTaxLedgersInput] = useState('');

  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<Clause44Result | null>(null);

  const [activeTab, setActiveTab] = useState<'consolidated' | 'review'>('consolidated');
  const [searchConsolidated, setSearchConsolidated] = useState('');
  const [searchReview, setSearchReview] = useState('');
  const [expandedReview, setExpandedReview] = useState<number | null>(null);

  const config: TallyConnectionConfig = { host: 'localhost', port: tallyPort };

  const handleExportTemplate = () => {
    const ledgers = taxLedgersInput.split(',').map(s => s.trim()).filter(Boolean);
    const sheetData = [
      ['Duties & Taxes Ledger Name'],
      ...ledgers.map(l => [l])
    ];
    if (sheetData.length === 1) {
      sheetData.push(['']); // Empty row if no ledgers
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    
    ws['!cols'] = [{ wch: 50 }];
    if (ws['A1']) {
      ws['A1'].s = { font: { bold: true }, fill: { fgColor: { rgb: "E2E8F0" } } };
    }

    XLSX.utils.book_append_sheet(wb, ws, 'Tax Ledgers');
    XLSX.writeFile(wb, 'Tax_Ledgers_Template.xlsx');
    toast.success('Excel template exported!');
  };

  const handleImportTemplate = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx, .xls';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const wb = XLSX.read(data, { type: 'array' });
          const wsName = wb.SheetNames[0];
          const ws = wb.Sheets[wsName];
          const jsonData = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1 });
          
          const ledgers: string[] = [];
          // Skip header (row 0), assume ledgers are in column A
          for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            if (row && row.length > 0 && typeof row[0] === 'string' && row[0].trim()) {
              ledgers.push(row[0].trim());
            }
          }
          
          if (ledgers.length > 0) {
            setTaxLedgersInput(ledgers.join(', '));
            toast.success(`Imported ${ledgers.length} ledgers successfully.`);
          } else {
            toast.error('No ledgers found in the first column.');
          }
        } catch (err) {
          toast.error('Failed to parse Excel file.');
        }
      };
      reader.readAsArrayBuffer(file);
    };
    input.click();
  };

  const handleConnect = async () => {
    setConnectionStatus('connecting');
    const ok = await pingTally(config);
    setConnectionStatus(ok ? 'connected' : 'error');
    if (ok) toast.success('Tally Prime connected!');
    else toast.error('Could not reach Tally Prime. Ensure it is open on the specified port.');
  };

  const handleRun = async () => {
    if (!taxLedgersInput.trim()) {
      toast.error('Please enter at least one Duties & Taxes ledger name.');
      return;
    }
    if (connectionStatus !== 'connected') {
      toast.error('Please connect to Tally Prime first.');
      return;
    }
    setIsRunning(true);
    setResult(null);
    try {
      const data = await fetchClause44Data(fromDate, toDate, taxLedgersInput, config);
      setResult(data);
      if (data.gstApplicable.length + data.nonGst.length === 0 && data.manualReview.length === 0) {
        toast.warning('No expense/purchase vouchers found for the selected date range.');
      } else {
        toast.success(`Clause 44 analysis complete — ${data.gstApplicable.length + data.nonGst.length} ledgers bifurcated, ${data.manualReview.length} composite vouchers flagged.`);
      }
    } catch (err: any) {
      toast.error('Analysis failed: ' + (err?.message || String(err)));
    } finally {
      setIsRunning(false);
    }
  };

  // Consolidate GST and Non-GST rows into a single structure
  const consolidatedRows = React.useMemo(() => {
    if (!result) return [];

    const map = new Map<string, { ledgerName: string; primaryGroup: string; subGroup1: string; subGroup2: string; gstAmount: number; nonGstAmount: number }>();

    for (const r of result.gstApplicable) {
      const key = r.ledgerName;
      if (!map.has(key)) {
        map.set(key, {
          ledgerName: r.ledgerName,
          primaryGroup: r.primaryGroup || 'INDIRECT EXPENSES',
          subGroup1: r.subGroup1 || '',
          subGroup2: r.subGroup2 || '',
          gstAmount: 0,
          nonGstAmount: 0
        });
      }
      map.get(key)!.gstAmount += r.amount;
    }

    for (const r of result.nonGst) {
      const key = r.ledgerName;
      if (!map.has(key)) {
        map.set(key, {
          ledgerName: r.ledgerName,
          primaryGroup: r.primaryGroup || 'INDIRECT EXPENSES',
          subGroup1: r.subGroup1 || '',
          subGroup2: r.subGroup2 || '',
          gstAmount: 0,
          nonGstAmount: 0
        });
      }
      map.get(key)!.nonGstAmount += r.amount;
    }

    return Array.from(map.values())
      .map(r => ({
        ...r,
        totalAmount: r.gstAmount + r.nonGstAmount
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount);
  }, [result]);

  const handleExport = () => {
    if (!result) return;
    try {
      // Helper for beautiful Excel styles
      const applyTitleStyle = (ws: any) => {
        if (ws['A1'] && !ws['A1'].s) {
          ws['A1'].s = { font: { bold: true, sz: 14, color: { rgb: "4F46E5" } } }; // Indigo
        }
      };
      
      const applyHeaderStyle = (ws: any, rowIdx: number, colCount: number) => {
        for (let c = 0; c < colCount; c++) {
          const cell = ws[XLSX.utils.encode_cell({ r: rowIdx, c })];
          if (cell) {
            cell.s = {
              font: { bold: true, color: { rgb: "FFFFFF" } },
              fill: { fgColor: { rgb: "374151" } }, // Gray-700
              alignment: { vertical: "center", wrapText: true },
              border: { bottom: { style: "medium", color: { rgb: "000000" } } }
            };
          }
        }
      };

      const applyTotalStyle = (ws: any, rowIdx: number, colCount: number) => {
        for (let c = 0; c < colCount; c++) {
          const cell = ws[XLSX.utils.encode_cell({ r: rowIdx, c })];
          if (cell) {
            cell.s = {
              font: { bold: true },
              fill: { fgColor: { rgb: "E5E7EB" } }, // Gray-200
              border: { top: { style: "thin", color: { rgb: "000000" } }, bottom: { style: "double", color: { rgb: "000000" } } }
            };
          }
        }
      };

      const formatNumbers = (ws: any, startR: number, endR: number, cols: number[]) => {
        for (let r = startR; r <= endR; r++) {
          for (const c of cols) {
            const cell = ws[XLSX.utils.encode_cell({ r, c })];
            if (cell && typeof cell.v === 'number') {
              cell.z = '#,##0.00';
            }
          }
        }
      };

      // Group ledgers to combine GST and Non-GST vouchers for the same ledger
      const groupedLedgersMap = new Map<string, {
        ledgerName: string,
        primaryGroup: string,
        amount: number,
        voucherBreakdown: any[],
      }>();

      const allRawRows = [
        ...result.gstApplicable.map(r => ({ ...r, classification: 'GST-Applicable' as const })),
        ...result.nonGst.map(r => ({ ...r, classification: 'Non-GST' as const })),
      ];

      for (const ledger of allRawRows) {
        if (!ledger.voucherBreakdown || ledger.voucherBreakdown.length === 0) continue;
        
        let existing = groupedLedgersMap.get(ledger.ledgerName);
        if (!existing) {
          existing = {
            ledgerName: ledger.ledgerName,
            primaryGroup: ledger.primaryGroup,
            amount: 0,
            voucherBreakdown: []
          };
          groupedLedgersMap.set(ledger.ledgerName, existing);
        }
        
        existing.amount += ledger.amount;
        
        // Add classification info to each voucher so we can display it in the unified sheet
        const vchs = ledger.voucherBreakdown.map(v => ({
           ...v,
           classification: ledger.classification
        }));
        existing.voucherBreakdown.push(...vchs);
      }

      const MAX_LEDGER_SHEETS = 1500; // Increased limit so all ledgers are included
      const uniqueLedgers = Array.from(groupedLedgersMap.values())
        .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
        .slice(0, MAX_LEDGER_SHEETS);

      // Sort vouchers in each ledger chronologically
      uniqueLedgers.forEach(l => {
        l.voucherBreakdown.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      });

      // Pre-calculate ledger sheet names to allow cross-linking
      const usedSheetNames = new Set<string>(['Clause 44 Consolidated', 'How Values Are Calculated', 'All Voucher Details', 'Table C - Manual Review']);
      const ledgerSheetNameMap = new Map<string, string>();
      for (const ledger of uniqueLedgers) {
        let baseSheetName = ledger.ledgerName.replace(/[\\/:*?[\]]/g, '-').trim().substring(0, 28);
        if (!baseSheetName) baseSheetName = 'Ledger';
        let sheetName = baseSheetName;
        let counter = 1;
        while (usedSheetNames.has(sheetName.toUpperCase())) {
          const suffix = ` (${counter})`;
          sheetName = baseSheetName.substring(0, 31 - suffix.length) + suffix;
          counter++;
        }
        usedSheetNames.add(sheetName.toUpperCase());
        ledgerSheetNameMap.set(ledger.ledgerName, sheetName);
      }

      // ── Sheet 1: Clause 44 Consolidated ─────────────────────────────────────
      const sheetData: (string | number)[][] = [
        [`Tax Audit Form 3CD — Clause 44 Consolidated Expenditure Report`],
        [`Company: ${result.companyName || 'Company'}`],
        [`Period: ${fromDate} to ${toDate}`],
        [],
        ['Primary Grouping (Tally)', 'Sub-Grouping 1', 'Sub-Grouping 2', 'Expense Ledger Name', 'Total Expenditure (Rs.)', 'GST-Applicable Expenditure (Rs.)', 'Non-GST Expenditure (Rs.)']
      ];

      for (const r of consolidatedRows) {
        sheetData.push([
          r.primaryGroup,
          r.subGroup1 || '-',
          r.subGroup2 || '-',
          r.ledgerName,
          r.totalAmount,
          r.gstAmount,
          r.nonGstAmount
        ]);
      }

      const totalExpSum = consolidatedRows.reduce((s, r) => s + r.totalAmount, 0);
      const gstExpSum = consolidatedRows.reduce((s, r) => s + r.gstAmount, 0);
      const nonGstExpSum = consolidatedRows.reduce((s, r) => s + r.nonGstAmount, 0);
      sheetData.push(['TOTAL', '', '', '', totalExpSum, gstExpSum, nonGstExpSum]);

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(sheetData);
      ws['!cols'] = [
        { wch: 25 }, { wch: 25 }, { wch: 25 }, { wch: 40 }, { wch: 22 }, { wch: 30 }, { wch: 22 }
      ];

      applyTitleStyle(ws);
      applyHeaderStyle(ws, 4, 7);
      formatNumbers(ws, 5, 4 + consolidatedRows.length, [4, 5, 6]);
      applyTotalStyle(ws, 5 + consolidatedRows.length, 7);

      // Add hyperlinks to Ledger names
      for (let i = 0; i < consolidatedRows.length; i++) {
        const r = consolidatedRows[i];
        const targetSheet = ledgerSheetNameMap.get(r.ledgerName);
        if (targetSheet) {
          const cell = ws[XLSX.utils.encode_cell({ r: i + 5, c: 3 })];
          if (cell) {
            cell.l = { Target: `#'${targetSheet}'!A1`, Tooltip: 'Click to view ledger details' };
            cell.s = { font: { color: { rgb: "0563C1" }, underline: true } };
          }
        }
      }
      XLSX.utils.book_append_sheet(wb, ws, 'Clause 44 Consolidated');

      // ── Sheet 2: How Values Are Calculated ───────────────────────────────────
      const calcData: (string | number)[][] = [
        ['HOW VALUES ARE CALCULATED — Clause 44 Bifurcation Logic'],
        [],
        ['STEP', 'DESCRIPTION'],
        ['Step 1 — Fetch Vouchers',
         'All Purchase, Journal, Payment & Expense vouchers within the selected date range are fetched from TallyPrime.'],
        ['Step 2 — Identify Expense Ledgers',
         'Each voucher line item is scanned. Ledgers under "Direct Expenses", "Indirect Expenses", or "Purchase Accounts" (including all sub-groups) are identified as expense lines.'],
        ['Step 3 — Check for Tax Ledgers',
         'The same voucher is scanned for any ledger matching your "Duties & Taxes Ledger Template". The match is exact (case-insensitive, trimmed whitespace).'],
        ['Step 4 — GST-Applicable (Table A)',
         'If a tax ledger IS found in the voucher → ALL expense line amounts from that voucher are added to "GST-Applicable Expenditure" for the respective ledger.'],
        ['Step 5 — Non-GST (Table B)',
         'If NO tax ledger is found in the voucher → ALL expense line amounts are added to "Non-GST Expenditure" for the respective ledger.'],
        ['Step 6 — Manual Review (Table C)',
         'Vouchers that are GST-applicable AND have MORE THAN ONE unique expense ledger are flagged. These are still counted in Table A, but listed separately for audit reference.'],
        ['Step 7 — Consolidation',
         'Amounts for each unique expense ledger are summed across all vouchers in the period. Total = GST Amount + Non-GST Amount.'],
        [],
        ['KEY RULE',
         'A voucher is classified as EITHER GST or Non-GST based on whether a Duties & Taxes ledger appears ANYWHERE in that voucher. The "All Voucher Details" sheet and individual ledger sheets show the exact voucher-by-voucher trail.'],
        [],
        ['TAX LEDGERS USED IN THIS ANALYSIS', ''],
        [taxLedgersInput || '(not set)', ''],
        [],
        ['PERIOD', `${fromDate} to ${toDate}`],
        ['COMPANY', result.companyName || 'Unknown'],
        ['GST-Applicable Ledgers', result.gstApplicable.length],
        ['Non-GST Ledgers', result.nonGst.length],
        ['Manual Review Vouchers', result.manualReview.length],
      ];
      const wsCalc = XLSX.utils.aoa_to_sheet(calcData);
      wsCalc['!cols'] = [{ wch: 38 }, { wch: 100 }];
      applyTitleStyle(wsCalc);
      applyHeaderStyle(wsCalc, 2, 2);
      // Format the stats section headers
      if (wsCalc['A13']) wsCalc['A13'].s = { font: { bold: true }, fill: { fgColor: { rgb: "E5E7EB" } } };
      XLSX.utils.book_append_sheet(wb, wsCalc, 'How Values Are Calculated');

      // ── Sheet 3: All Voucher Details ─────────────────────────────────────────
      const allVoucherData: (string | number)[][] = [
        ['ALL VOUCHER DETAILS — Complete Track Record'],
        [`Company: ${result.companyName || 'Company'} | Period: ${fromDate} to ${toDate}`],
        [],
        ['Expense Ledger Name', 'Primary Group', 'Classification', 'Voucher No.', 'Date', 'Voucher Type', 'Amount (Rs.)', 'Tax Ledgers Found in Voucher'],
      ];

      for (const r of result.gstApplicable) {
        for (const v of (r.voucherBreakdown || [])) {
          allVoucherData.push([
            r.ledgerName, r.primaryGroup || '-', 'GST-Applicable',
            v.voucherNumber, v.date, v.voucherType, v.amount,
            v.taxLedgersFound.join(', '),
          ]);
        }
      }
      for (const r of result.nonGst) {
        for (const v of (r.voucherBreakdown || [])) {
          allVoucherData.push([
            r.ledgerName, r.primaryGroup || '-', 'Non-GST',
            v.voucherNumber, v.date, v.voucherType, v.amount, '-',
          ]);
        }
      }

      const wsAll = XLSX.utils.aoa_to_sheet(allVoucherData);
      wsAll['!cols'] = [{ wch: 40 }, { wch: 22 }, { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 16 }, { wch: 18 }, { wch: 50 }];

      applyTitleStyle(wsAll);
      applyHeaderStyle(wsAll, 3, 8);
      formatNumbers(wsAll, 4, allVoucherData.length - 1, [6]);

      // Add hyperlinks to Ledger names
      for (let i = 4; i < allVoucherData.length; i++) {
        const ledgerName = allVoucherData[i][0] as string;
        const targetSheet = ledgerSheetNameMap.get(ledgerName);
        if (targetSheet) {
          const cell = wsAll[XLSX.utils.encode_cell({ r: i, c: 0 })];
          if (cell) {
            cell.l = { Target: `#'${targetSheet}'!A1`, Tooltip: 'Click to view ledger details' };
            cell.s = { font: { color: { rgb: "0563C1" }, underline: true } };
          }
        }
      }
      XLSX.utils.book_append_sheet(wb, wsAll, 'All Voucher Details');

      // ── Sheets 4+: Per-Ledger Drill-Down ────────────────────────────────────
      for (const ledger of uniqueLedgers) {
        const sheetName = ledgerSheetNameMap.get(ledger.ledgerName);
        if (!sheetName || !ledger.voucherBreakdown) continue;

        const ledgerData: (string | number)[][] = [
          ['⬅ Back to Consolidated Report'],
          [`Ledger: ${ledger.ledgerName}`],
          [`Group: ${ledger.primaryGroup || '-'}  |  Total: Rs.${fmt(ledger.amount)}`],
          [`Period: ${fromDate} to ${toDate}`],
          [],
          ['#', 'Voucher No.', 'Date', 'Voucher Type', 'Amount (Rs.)', 'Cumulative Total (Rs.)', 'Tax Ledgers Found', 'Classification'],
        ];
        let running = 0;
        ledger.voucherBreakdown.forEach((v, i) => {
          running += v.amount;
          ledgerData.push([
            i + 1, v.voucherNumber, v.date, v.voucherType,
            v.amount, running,
            v.taxLedgersFound.join(', ') || '-',
            v.classification,
          ]);
        });
        ledgerData.push([]);
        ledgerData.push(['TOTAL', '', '', '', ledger.amount, '', '', '']);
        const wsLedger = XLSX.utils.aoa_to_sheet(ledgerData);
        wsLedger['!cols'] = [{ wch: 5 }, { wch: 20 }, { wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 22 }, { wch: 40 }, { wch: 25 }];
        
        applyHeaderStyle(wsLedger, 5, 8);
        formatNumbers(wsLedger, 6, 6 + ledger.voucherBreakdown.length, [4, 5]);
        applyTotalStyle(wsLedger, 7 + ledger.voucherBreakdown.length, 8);

        // Add "Back to Top" hyperlink
        if (wsLedger['A1']) {
          wsLedger['A1'].l = { Target: "#'Clause 44 Consolidated'!A1", Tooltip: "Return to summary" };
          wsLedger['A1'].s = { font: { color: { rgb: "0563C1" }, underline: true, bold: true } };
        }
        
        XLSX.utils.book_append_sheet(wb, wsLedger, sheetName);
      }

      // ── Sheet: Table C Manual Review ─────────────────────────────────────────
      const reviewData = [
        ['Table C — Composite Vouchers Requiring Manual Review'],
        ['Voucher No.', 'Date', 'Type', 'Expense Ledgers', 'Tax Ledgers Found', 'Reason'],
        ...result.manualReview.map(r => [
          r.voucherNumber, r.date, r.voucherType,
          r.expenseLedgers.map(e => `${e.name}: Rs.${fmt(e.amount)}`).join(' | '),
          r.taxLedgersFound.join(', '),
          r.reason,
        ]),
      ];
      const wsReview = XLSX.utils.aoa_to_sheet(reviewData);
      wsReview['!cols'] = [{ wch: 18 }, { wch: 14 }, { wch: 16 }, { wch: 60 }, { wch: 40 }, { wch: 60 }];
      
      applyTitleStyle(wsReview);
      applyHeaderStyle(wsReview, 1, 6);
      
      XLSX.utils.book_append_sheet(wb, wsReview, 'Table C - Manual Review');

      const safeFileName = `Clause44_${(result.companyName || 'Company').replace(/[^a-zA-Z0-9_\-]/g, '_')}_${fromDate}_to_${toDate}.xlsx`;
      XLSX.writeFile(wb, safeFileName);
      toast.success(`Excel exported with full calculation trail (${allLedgerRows.length} ledger sheets)!`);
    } catch (err: any) {
      console.error('Export Error:', err);
      toast.error('Export failed: ' + (err.message || 'Unknown error'));
    }
  };

  const consolidatedFiltered = consolidatedRows.filter(r =>
    r.ledgerName.toLowerCase().includes(searchConsolidated.toLowerCase()) ||
    r.primaryGroup.toLowerCase().includes(searchConsolidated.toLowerCase()) ||
    r.subGroup1.toLowerCase().includes(searchConsolidated.toLowerCase()) ||
    r.subGroup2.toLowerCase().includes(searchConsolidated.toLowerCase())
  );

  const reviewFiltered = (result?.manualReview || []).filter(r =>
    r.voucherNumber.toLowerCase().includes(searchReview.toLowerCase()) ||
    r.expenseLedgers.some(e => e.name.toLowerCase().includes(searchReview.toLowerCase()))
  );

  const totalExpense = consolidatedFiltered.reduce((s, r) => s + r.totalAmount, 0);
  const gstTotal = consolidatedFiltered.reduce((s, r) => s + r.gstAmount, 0);
  const nonGstTotal = consolidatedFiltered.reduce((s, r) => s + r.nonGstAmount, 0);
  const reviewTotal = (result?.manualReview || []).reduce((s, r) => s + r.expenseLedgers.reduce((ss, e) => ss + e.amount, 0), 0);

  const connBadge = {
    disconnected: { color: 'text-slate-400', bg: 'bg-slate-800', icon: <WifiOff className="w-3 h-3" />, label: 'Not Connected' },
    connecting:   { color: 'text-yellow-400', bg: 'bg-yellow-500/10', icon: <RefreshCw className="w-3 h-3 animate-spin" />, label: 'Connecting...' },
    connected:    { color: 'text-emerald-400', bg: 'bg-emerald-500/10', icon: <Wifi className="w-3 h-3" />, label: 'Connected' },
    error:        { color: 'text-red-400', bg: 'bg-red-500/10', icon: <WifiOff className="w-3 h-3" />, label: 'Connection Failed' },
  }[connectionStatus];

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100">
      {/* Header */}
      <div className="sticky top-0 z-40 border-b border-slate-800/80 bg-[#0d1421]/90 backdrop-blur-xl px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-black text-white tracking-tight flex items-center gap-2">
              <Shield className="w-5 h-5 text-violet-400" />
              Tax Audit Form 3CD Clause 44
            </h1>
            <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-widest mt-0.5">
              Expenditure Break-Up Under GST &nbsp;|&nbsp; Winman Ready Output
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {result && (
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 text-xs font-bold uppercase tracking-wider transition-all"
            >
              <Download className="w-3.5 h-3.5" /> Export Excel
            </button>
          )}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${connBadge.bg} border border-white/5 text-[10px] font-bold uppercase tracking-wider ${connBadge.color}`}>
            {connBadge.icon} {connBadge.label}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">

        {/* Config Panel */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-5"
        >
          <div className="flex items-center gap-2 mb-2">
            <Server className="w-4 h-4 text-violet-400" />
            <span className="text-sm font-bold text-white">Configuration</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">From Date (FY Start)</label>
              <input
                type="date"
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
                className="w-full h-10 bg-slate-950 border border-slate-700 rounded-xl px-3 text-sm text-white focus:border-violet-500 outline-none transition-colors"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">To Date (FY End)</label>
              <input
                type="date"
                value={toDate}
                onChange={e => setToDate(e.target.value)}
                className="w-full h-10 bg-slate-950 border border-slate-700 rounded-xl px-3 text-sm text-white focus:border-violet-500 outline-none transition-colors"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Tally Port</label>
              <input
                type="number"
                value={tallyPort}
                onChange={e => setTallyPort(Number(e.target.value))}
                className="w-full h-10 bg-slate-950 border border-slate-700 rounded-xl px-3 text-sm text-white focus:border-violet-500 outline-none transition-colors"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={handleConnect}
                disabled={connectionStatus === 'connecting'}
                className="w-full h-10 rounded-xl font-bold text-sm uppercase tracking-wider transition-all bg-violet-600/20 hover:bg-violet-600/40 text-violet-300 border border-violet-500/30 flex items-center justify-center gap-2"
              >
                {connectionStatus === 'connecting'
                  ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Connecting...</>
                  : connectionStatus === 'connected'
                    ? <><Wifi className="w-3.5 h-3.5 text-emerald-400" /> Re-Test</>
                    : <><Server className="w-3.5 h-3.5" /> Connect Tally</>
                }
              </button>
            </div>
          </div>

          {/* Tax Ledger Template */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Duties &amp; Taxes Ledger Template
                <span className="ml-2 text-violet-400 normal-case font-medium tracking-normal">
                  (comma-separated, exact names from Tally Chart of Accounts)
                </span>
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleImportTemplate}
                  className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-bold uppercase transition-colors border border-slate-700"
                  title="Import from Excel file"
                >
                  <Upload className="w-3 h-3" /> Import Template
                </button>
                <button
                  onClick={handleExportTemplate}
                  className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-bold uppercase transition-colors border border-slate-700"
                  title="Export to Excel file"
                >
                  <Download className="w-3 h-3" /> Export
                </button>
              </div>
            </div>
            <textarea
              value={taxLedgersInput}
              onChange={e => setTaxLedgersInput(e.target.value)}
              rows={3}
              placeholder="CGST Input, SGST Input, IGST @ 18%, RCM CGST, RCM SGST, IGST @ 5%"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:border-violet-500 outline-none transition-colors resize-none placeholder:text-slate-600 font-mono"
            />
            <div className="flex items-start gap-1.5 mt-2">
              <Info className="w-3 h-3 text-slate-500 mt-0.5 flex-shrink-0" />
              <p className="text-[10px] text-slate-500 leading-relaxed">
                Names are matched exactly after trimming leading/trailing spaces. Enter them exactly as they appear in Tally's Chart of Accounts.
                A voucher is GST-applicable only if it contains one of these ledgers.
              </p>
            </div>
          </div>

          <button
            onClick={handleRun}
            disabled={isRunning || connectionStatus !== 'connected'}
            className={`w-full h-12 rounded-xl font-black text-sm uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
              isRunning || connectionStatus !== 'connected'
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white shadow-lg shadow-violet-900/30'
            }`}
          >
            {isRunning
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Fetching vouchers and bifurcating...</>
              : <><Zap className="w-4 h-4" /> Run Clause 44 Analysis</>
            }
          </button>
        </motion.div>

        {/* Results */}
        <AnimatePresence>
          {result && (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              {/* Summary Cards */}
              <div className="grid grid-cols-3 gap-4">
                <SummaryCard
                  color="violet"
                  icon={<CheckCircle2 className="w-5 h-5" />}
                  label="GST-Applicable Expenditure"
                  value={`Rs.${fmt(result.gstApplicable.reduce((s, r) => s + r.amount, 0))}`}
                  sub={`${result.gstApplicable.length} ledgers`}
                />
                <SummaryCard
                  color="blue"
                  icon={<FileText className="w-5 h-5" />}
                  label="Non-GST Expenditure"
                  value={`Rs.${fmt(result.nonGst.reduce((s, r) => s + r.amount, 0))}`}
                  sub={`${result.nonGst.length} ledgers`}
                />
                <SummaryCard
                  color="amber"
                  icon={<AlertTriangle className="w-5 h-5" />}
                  label="Requires Manual Review"
                  value={`${result.manualReview.length} vouchers`}
                  sub={result.manualReview.length > 0 ? `Rs.${fmt(reviewTotal)} composite amount` : 'Clean pass'}
                />
              </div>

              {/* Company + FY badge */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-slate-800" />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">
                  {result.companyName} &nbsp;|&nbsp; {fromDate} to {toDate}
                </span>
                <div className="flex-1 h-px bg-slate-800" />
              </div>

              {/* Tab bar & Export button */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800 w-fit">
                  {([
                    { id: 'consolidated', label: `Consolidated Expenditure (${consolidatedRows.length})`, color: 'violet' },
                    { id: 'review',       label: `Table C — Manual Review (${result.manualReview.length})`, color: 'amber' },
                  ] as const).map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                        activeTab === tab.id
                          ? tab.color === 'violet' ? 'bg-violet-600/30 text-violet-300 border border-violet-500/30'
                            : 'bg-amber-600/30 text-amber-300 border border-amber-500/30'
                          : 'text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={handleExport}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-lg shadow-emerald-950/20 border border-emerald-500/30"
                >
                  <Download className="w-4 h-4" /> Export Excel
                </button>
              </div>

              {/* Consolidated Report */}
              {activeTab === 'consolidated' && (
                <ConsolidatedResultTable
                  rows={consolidatedFiltered}
                  totalExp={totalExpense}
                  totalGst={gstTotal}
                  totalNonGst={nonGstTotal}
                  search={searchConsolidated}
                  onSearch={setSearchConsolidated}
                  emptyMsg="No expense or purchase ledgers found for Clause 44."
                  tableLabel="Clause 44 Consolidated Expenditure Statement"
                />
              )}

              {/* Table C */}
              {activeTab === 'review' && (
                <motion.div
                  key="review-tab"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-slate-900/60 border border-amber-500/20 rounded-2xl overflow-hidden"
                >
                  <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
                    <div>
                      <h3 className="font-bold text-amber-300 text-sm">Table C — Composite Vouchers: Manual Review Required</h3>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        These vouchers have multiple expense ledgers alongside a GST tax ledger. Auto-linking is not reliable — review manually before entering in Winman.
                      </p>
                    </div>
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        value={searchReview}
                        onChange={e => setSearchReview(e.target.value)}
                        placeholder="Search voucher / ledger..."
                        className="pl-8 pr-3 h-9 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white focus:border-amber-500 outline-none w-52"
                      />
                    </div>
                  </div>

                  {reviewFiltered.length === 0 ? (
                    <div className="py-16 text-center">
                      <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
                      <p className="text-slate-400 font-semibold text-sm">
                        {(result.manualReview || []).length === 0 ? 'No composite vouchers found — clean pass!' : 'No results for your search.'}
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-800/60">
                      {reviewFiltered.map((r, i) => (
                        <div key={i} className="px-6 py-4">
                          <button
                            className="w-full flex items-center justify-between text-left"
                            onClick={() => setExpandedReview(expandedReview === i ? null : i)}
                          >
                            <div className="flex items-center gap-4">
                              <div className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
                              <div>
                                <span className="text-sm font-bold text-white">{r.voucherNumber || 'No Number'}</span>
                                <span className="mx-2 text-slate-600">·</span>
                                <span className="text-xs text-slate-400">{r.date}</span>
                                <span className="mx-2 text-slate-600">·</span>
                                <span className="text-xs text-slate-500 uppercase">{r.voucherType}</span>
                              </div>
                              <div className="flex gap-2">
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold">
                                  {r.expenseLedgers.length} expense lines
                                </span>
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 font-bold">
                                  {r.taxLedgersFound.length} tax ledger(s)
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-slate-400">
                              <span className="font-mono font-bold">
                                Rs.{fmt(r.expenseLedgers.reduce((s, e) => s + e.amount, 0))}
                              </span>
                              {expandedReview === i ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </div>
                          </button>

                          <AnimatePresence>
                            {expandedReview === i && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                              >
                                <div className="mt-4 ml-6 space-y-3">
                                  <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-800">
                                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Expense Ledgers in Voucher</p>
                                      {r.expenseLedgers.map((e, j) => (
                                        <div key={j} className="flex justify-between items-center py-1 text-xs border-b border-slate-800/50 last:border-0">
                                          <span className="text-slate-300">{e.name}</span>
                                          <span className="font-mono text-slate-400">Rs.{fmt(e.amount)}</span>
                                        </div>
                                      ))}
                                    </div>
                                    <div className="bg-slate-950/60 rounded-xl p-3 border border-amber-500/10">
                                      <p className="text-[10px] font-bold text-amber-500/70 uppercase tracking-wider mb-2">Tax Ledgers Found</p>
                                      {r.taxLedgersFound.map((t, j) => (
                                        <div key={j} className="py-1 text-xs text-amber-300">{t}</div>
                                      ))}
                                      <p className="text-[10px] text-slate-500 mt-3 leading-relaxed">{r.reason}</p>
                                    </div>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// Sub-components

function SummaryCard({ color, icon, label, value, sub }: {
  color: 'violet' | 'blue' | 'amber';
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  const palette = {
    violet: 'border-violet-500/20 bg-violet-500/5 text-violet-400',
    blue:   'border-blue-500/20 bg-blue-500/5 text-blue-400',
    amber:  'border-amber-500/20 bg-amber-500/5 text-amber-400',
  }[color];
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`rounded-2xl border p-5 ${palette}`}
    >
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-widest opacity-70">{label}</span>
      </div>
      <div className="text-2xl font-black text-white tracking-tight">{value}</div>
      <div className="text-[11px] text-slate-500 mt-1 font-medium">{sub}</div>
    </motion.div>
  );
}

interface ConsolidatedRow {
  ledgerName: string;
  primaryGroup: string;
  subGroup1: string;
  subGroup2: string;
  totalAmount: number;
  gstAmount: number;
  nonGstAmount: number;
}

function ConsolidatedResultTable({
  rows,
  totalExp,
  totalGst,
  totalNonGst,
  search,
  onSearch,
  emptyMsg,
  tableLabel
}: {
  rows: ConsolidatedRow[];
  totalExp: number;
  totalGst: number;
  totalNonGst: number;
  search: string;
  onSearch: (v: string) => void;
  emptyMsg: string;
  tableLabel: string;
}) {
  return (
    <motion.div
      key={tableLabel}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-slate-900/60 border border-violet-500/20 rounded-2xl overflow-hidden shadow-2xl"
    >
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
        <h3 className="font-bold text-sm text-violet-400">{tableLabel}</h3>
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={e => onSearch(e.target.value)}
            placeholder="Filter ledger or group..."
            className="pl-8 pr-3 h-9 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white focus:border-violet-500 outline-none w-52"
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="py-14 text-center">
          <FileText className="w-8 h-8 text-slate-700 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">{emptyMsg}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-[150px_150px_150px_1fr_120px_120px_120px] px-6 py-2 bg-slate-950/40 text-[10px] font-bold uppercase tracking-widest text-slate-500 border-b border-slate-800">
            <span>Primary Group</span>
            <span>Sub-Grouping 1</span>
            <span>Sub-Grouping 2</span>
            <span>Expense / Purchase Ledger Name</span>
            <span className="text-right">Total Exp (Rs.)</span>
            <span className="text-right">GST Exp (Rs.)</span>
            <span className="text-right">Non-GST Exp (Rs.)</span>
          </div>
          <div className="divide-y divide-slate-800/40 max-h-[500px] overflow-y-auto font-mono">
            {rows.map((r, i) => (
              <motion.div
                key={r.ledgerName}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.01, duration: 0.15 }}
                className="grid grid-cols-[150px_150px_150px_1fr_120px_120px_120px] px-6 py-3 hover:bg-slate-800/30 transition-colors items-center text-xs"
              >
                <span className="text-violet-400 font-bold truncate pr-3 font-sans">{r.primaryGroup}</span>
                <span className="text-slate-400 truncate pr-3 font-sans">{r.subGroup1 || '-'}</span>
                <span className="text-slate-500 truncate pr-3 font-sans">{r.subGroup2 || '-'}</span>
                <span className="text-slate-200 font-semibold truncate pr-3 font-sans">{r.ledgerName}</span>
                <span className="text-right text-emerald-400 font-bold">{fmt(r.totalAmount)}</span>
                <span className="text-right text-violet-300">{fmt(r.gstAmount)}</span>
                <span className="text-right text-blue-300">{fmt(r.nonGstAmount)}</span>
              </motion.div>
            ))}
          </div>
          <div className="grid grid-cols-[150px_150px_150px_1fr_120px_120px_120px] px-6 py-4 border-t border-slate-700 bg-slate-950/60 font-bold items-center font-mono">
            <span className="text-sm text-white uppercase tracking-wider font-sans">TOTAL</span>
            <span></span>
            <span></span>
            <span></span>
            <span className="text-sm font-black text-right text-emerald-400">{fmt(totalExp)}</span>
            <span className="text-sm font-black text-right text-violet-300">{fmt(totalGst)}</span>
            <span className="text-sm font-black text-right text-blue-300">{fmt(totalNonGst)}</span>
          </div>
        </>
      )}
    </motion.div>
  );
}
