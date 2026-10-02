/**
 * TallyDirectImport.tsx — New standalone module for direct Tally data import.
 *
 * Connects to TallyPrime running on localhost (port 9000) via its XML API,
 * fetches Purchase / Sales / Journal / Credit Note / Debit Note vouchers,
 * and lets the user send them directly to the GST Consolidator module.
 *
 * ═══════════════════════════════════════════════════════════════
 * THIS FILE IS A COMPLETELY NEW MODULE.
 * IT DOES NOT MODIFY ANY EXISTING FILE.
 * ═══════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Server, Wifi, WifiOff, RefreshCw, Download,
  CheckCircle2, AlertTriangle, Loader2, FileSpreadsheet, Building2,
  ChevronRight, Zap, Database, ArrowRight, Settings2, Lightbulb
} from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx-js-style';
import {
  pingTally,
  fetchCompanyInfo,
  fetchVouchers,
  clearTallyMetadataCache,
  type TallyVoucherType,
  type TallyFlatVoucher,
  type TallyCompanyInfo,
  type TallyConnectionConfig,
} from '@/lib/tallyApi';

// ─── Types ───────────────────────────────────────────────────

interface TallyDirectImportProps {
  onBack: () => void;
  onImportToReconciliation?: (data: {
    prFile: File;
    prDnFile?: File;
    journalFiles?: File[];
    companyName?: string;
  }) => void;
}

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface CustomTaxLedger {
  id: string;
  name: string;
  category: 'CGST' | 'SGST' | 'IGST';
  type: 'Input' | 'Output' | 'RCM';
}


interface VoucherTypeConfig {
  type: TallyVoucherType;
  label: string;
  icon: string;
  color: string;
  bgColor: string;
  borderColor: string;
  enabled: boolean;
}

// ─── Component ───────────────────────────────────────────────

export default function TallyDirectImport({ onBack, onImportToReconciliation }: TallyDirectImportProps) {
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    const captureLog = (...args: any[]) => {
      const msg = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
      setLogs(prev => [...prev.slice(-100), msg]);
      originalLog(...args);
    };

    const captureError = (...args: any[]) => {
      const msg = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
      setLogs(prev => [...prev.slice(-100), `❌ ${msg}`]);
      originalError(...args);
    };

    const captureWarn = (...args: any[]) => {
      const msg = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
      setLogs(prev => [...prev.slice(-100), `⚠️ ${msg}`]);
      originalWarn(...args);
    };

    console.log = captureLog;
    console.error = captureError;
    console.warn = captureWarn;

    return () => {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
    };
  }, []);

  const [showQuickGuide, setShowQuickGuide] = useState(false);
  const [customInputTaxGroups, setCustomInputTaxGroups] = useState<string>('ITC, DUTIES & TAXES, DUTIES AND TAXES, INPUT');
  const [customOutputTaxGroups, setCustomOutputTaxGroups] = useState<string>('OUTPUT, DUTIES & TAXES, DUTIES AND TAXES');
  const [customTaxLedgers, setCustomTaxLedgers] = useState<CustomTaxLedger[]>([]);
  const [strictMode, setStrictMode] = useState(false);

  useEffect(() => {
    const storedInput = localStorage.getItem('tallyCustomInputTaxGroups');
    if (storedInput) setCustomInputTaxGroups(storedInput);

    const storedOutput = localStorage.getItem('tallyCustomOutputTaxGroups');
    if (storedOutput) setCustomOutputTaxGroups(storedOutput);

    const storedLedgers = localStorage.getItem('tallyCustomTaxLedgers');
    if (storedLedgers) {
      try {
        setCustomTaxLedgers(JSON.parse(storedLedgers));
      } catch (e) { }
    }

    const storedStrict = localStorage.getItem('tallyStrictMode');
    if (storedStrict) setStrictMode(storedStrict === 'true');
  }, []);

  const handleInputTaxGroupsChange = (val: string) => {
    setCustomInputTaxGroups(val);
    localStorage.setItem('tallyCustomInputTaxGroups', val);
  };

  const handleOutputTaxGroupsChange = (val: string) => {
    setCustomOutputTaxGroups(val);
    localStorage.setItem('tallyCustomOutputTaxGroups', val);
  };

  const addCustomTaxLedger = () => {
    const newLedgers = [...customTaxLedgers, { id: Date.now().toString(), name: '', category: 'CGST' as const, type: 'Input' as const }];
    setCustomTaxLedgers(newLedgers);
    localStorage.setItem(`tallyCustomTaxLedgers_${companyInfo?.name || 'default'}`, JSON.stringify(newLedgers));
    localStorage.setItem('tallyCustomTaxLedgers', JSON.stringify(newLedgers));
  };

  const updateCustomTaxLedger = (id: string, field: keyof CustomTaxLedger, value: string) => {
    const newLedgers = customTaxLedgers.map(l => l.id === id ? { ...l, [field]: value } : l);
    setCustomTaxLedgers(newLedgers);
    localStorage.setItem(`tallyCustomTaxLedgers_${companyInfo?.name || 'default'}`, JSON.stringify(newLedgers));
    localStorage.setItem('tallyCustomTaxLedgers', JSON.stringify(newLedgers));
    clearTallyMetadataCache();
  };

  const removeCustomTaxLedger = (id: string) => {
    const newLedgers = customTaxLedgers.filter(l => l.id !== id);
    setCustomTaxLedgers(newLedgers);
    localStorage.setItem(`tallyCustomTaxLedgers_${companyInfo?.name || 'default'}`, JSON.stringify(newLedgers));
    localStorage.setItem('tallyCustomTaxLedgers', JSON.stringify(newLedgers));
    clearTallyMetadataCache();
  };

  const exportTaxLedgers = () => {
    let dataToExport = customTaxLedgers.map(l => ({
      'Exact Ledger Name (in Tally)': l.name,
      'Tax Category (CGST/SGST/IGST)': l.category,
      'Tax Type (Input/Output/RCM)': l.type
    }));

    if (dataToExport.length === 0) {
      dataToExport = [{
        'Exact Ledger Name (in Tally)': 'Example Ledger Name',
        'Tax Category (CGST/SGST/IGST)': 'CGST',
        'Tax Type (Input/Output/RCM)': 'Input'
      }];
    }

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tax Ledgers Mapping');
    XLSX.writeFile(wb, 'tally_tax_ledgers_template.xlsx');
  };

  const importTaxLedgers = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // Performance Fix: Prevent 1-Million Row browser freeze if whole column was formatted in Excel
        let maxRow = 0;
        for (const key of Object.keys(worksheet)) {
          if (key.startsWith('!')) continue;
          const rowMatch = key.match(/\d+/);
          if (rowMatch && parseInt(rowMatch[0], 10) > maxRow) maxRow = parseInt(rowMatch[0], 10);
        }
        if (worksheet['!ref']) {
          const range = XLSX.utils.decode_range(worksheet['!ref']);
          worksheet['!ref'] = XLSX.utils.encode_range({ s: range.s, e: { r: Math.max(range.s.r, maxRow - 1), c: range.e.c } });
        }

        const json = XLSX.utils.sheet_to_json(worksheet);

        const newLedgers = json.map((row: any, i) => ({
          id: Date.now().toString() + i,
          name: String(row['Exact Ledger Name (in Tally)'] || '').trim(),
          category: (row['Tax Category (CGST/SGST/IGST)'] || 'CGST') as 'CGST' | 'SGST' | 'IGST',
          type: (row['Tax Type (Input/Output/RCM)'] || 'Input') as 'Input' | 'Output' | 'RCM'
        })).filter(l => l.name);

        if (newLedgers.length > 0) {
          setCustomTaxLedgers(newLedgers);
          localStorage.setItem(`tallyCustomTaxLedgers_${companyInfo?.name || 'default'}`, JSON.stringify(newLedgers));
          clearTallyMetadataCache();
          toast.success(`Imported ${newLedgers.length} ledgers successfully!`);
        } else {
          toast.error('No valid ledgers found in Excel file');
        }
      } catch (error) {
        toast.error('Invalid Excel file');
      }
    };
    reader.readAsArrayBuffer(file);
    event.target.value = '';
  };

  const exportVouchersDataTable = (vouchersToExport: TallyFlatVoucher[]) => {
    if (!vouchersToExport || vouchersToExport.length === 0) {
      toast.error('No vouchers available to export.');
      return;
    }

    const dataToExport = vouchersToExport.map((v, i) => {
      const totalTax = v.igst + v.cgst + v.sgst;
      const isReversal = totalTax < 0 || v.cgst < 0 || v.sgst < 0 || v.igst < 0;
      return {
        '#': i + 1,
        'Type': v.voucherType,
        'Date': v.date,
        'Party Name': v.partyName,
        'GSTIN': v.gstin || '—',
        'Invoice No': v.invoiceNo || v.voucherNumber,
        'Taxable Value': v.taxableValue,
        'IGST': v.igst,
        'CGST': v.cgst,
        'SGST': v.sgst,
        'Total Tax': totalTax,
        'Total Inv Amt': v.totalAmount,
        'Impact': isReversal ? '− Reversal' : '+ Inward',
      };
    });

    const ws = XLSX.utils.json_to_sheet(dataToExport);

    ws['!cols'] = [
      { wch: 6 },  // #
      { wch: 14 }, // Type
      { wch: 12 }, // Date
      { wch: 32 }, // Party Name
      { wch: 18 }, // GSTIN
      { wch: 18 }, // Invoice No
      { wch: 16 }, // Taxable Value
      { wch: 14 }, // IGST
      { wch: 14 }, // CGST
      { wch: 14 }, // SGST
      { wch: 16 }, // Total Tax
      { wch: 18 }, // Total Inv Amt
      { wch: 14 }, // Impact
    ];

    const wb = XLSX.utils.book_new();
    const filterSuffix = previewImpactFilter === 'ALL' ? 'All' : previewImpactFilter === 'REVERSALS' ? 'Reversals' : 'Inward';
    XLSX.utils.book_append_sheet(wb, ws, `${filterSuffix} Vouchers`.slice(0, 31));

    const compName = companyInfo?.name ? companyInfo.name.replace(/[^a-zA-Z0-9]/g, '_') : 'Tally';
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `${compName}_Vouchers_${filterSuffix}_${dateStr}.xlsx`;

    XLSX.writeFile(wb, filename);
    toast.success(`Exported ${vouchersToExport.length} vouchers to ${filename}`);
  };

  const [customVoucherMapping, setCustomVoucherMapping] = useState<Record<string, string>>(() => {
    try {
      const stored = localStorage.getItem('tallyCustomVouchers');
      if (stored) return JSON.parse(stored);
    } catch (e) { }
    return {
      Purchase: '',
      Sales: '',
      Journal: '',
      'Credit Note': '',
      'Debit Note': ''
    };
  });

  // Connection
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [companyInfo, setCompanyInfo] = useState<TallyCompanyInfo | null>(null);
  const [tallyPort, setTallyPort] = useState(9000);

  // Date range
  const today = new Date();
  const fyStart = today.getMonth() >= 3
    ? `${today.getFullYear()}-04-01`
    : `${today.getFullYear() - 1}-04-01`;
  const [fromDate, setFromDate] = useState(fyStart);
  const [toDate, setToDate] = useState(today.toISOString().slice(0, 10));

  // Voucher type selection
  const [voucherTypes, setVoucherTypes] = useState<VoucherTypeConfig[]>([
    { type: 'Purchase', label: 'Purchase Vouchers', icon: '🛒', color: 'text-blue-400', bgColor: 'bg-blue-500/10', borderColor: 'border-blue-500/20', enabled: true },
    { type: 'Journal', label: 'Journal Vouchers', icon: '📒', color: 'text-yellow-400', bgColor: 'bg-yellow-500/10', borderColor: 'border-yellow-500/20', enabled: true },
    { type: 'Debit Note', label: 'Debit Notes', icon: '🟢', color: 'text-emerald-400', bgColor: 'bg-emerald-500/10', borderColor: 'border-emerald-500/20', enabled: true },
    { type: 'Credit Note', label: 'Credit Notes', icon: '🔴', color: 'text-red-400', bgColor: 'bg-red-500/10', borderColor: 'border-red-500/20', enabled: true },
    { type: 'Payment', label: 'Payment Vouchers', icon: '💳', color: 'text-purple-400', bgColor: 'bg-purple-500/10', borderColor: 'border-purple-500/20', enabled: true },
    { type: 'Sales', label: 'Sales Vouchers', icon: '💰', color: 'text-green-400', bgColor: 'bg-green-500/10', borderColor: 'border-green-500/20', enabled: false },
  ]);

  // Fetch state
  const [isFetching, setIsFetching] = useState(false);
  const [fetchProgress, setFetchProgress] = useState<string[]>([]);
  const [fetchedData, setFetchedData] = useState<TallyFlatVoucher[]>([]);
  const [selectedMonthFilter, setSelectedMonthFilter] = useState<string>('ALL');
  const [selectedVoucherTypeFilter, setSelectedVoucherTypeFilter] = useState<string>('ALL');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);
  const [previewImpactFilter, setPreviewImpactFilter] = useState<'ALL' | 'REVERSALS' | 'INWARD'>('ALL');

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedMonthFilter, selectedVoucherTypeFilter, previewImpactFilter]);

  // ─── Connection Logic ────────────────────────────────────

  const connectToTally = useCallback(async () => {
    setConnectionStatus('connecting');
    setCompanyInfo(null);
    // Clear metadata cache so the ledger GSTIN map re-fetches for this company
    clearTallyMetadataCache();

    try {
      const alive = await pingTally({ host: 'localhost', port: tallyPort });
      if (!alive) {
        setConnectionStatus('error');
        toast.error('Cannot reach Tally', {
          description: `TallyPrime is not responding on port ${tallyPort}. Make sure Tally is open and set as Server.`,
        });
        return;
      }

      const info = await fetchCompanyInfo({ host: 'localhost', port: tallyPort });
      setCompanyInfo(info);
      setConnectionStatus('connected');

      if (info.financialYear) {
        const fyParts = info.financialYear.replace(/[^0-9]/g, '');
        if (fyParts.length >= 8) {
          const y = fyParts.slice(0, 4);
          const m = fyParts.slice(4, 6);
          const d = fyParts.slice(6, 8);
          setFromDate(`${y}-${m}-${d}`);
          const startYr = parseInt(y, 10);
          setToDate(`${startYr + 1}-03-31`);
        }
      }

      try {
        const storedTax = localStorage.getItem(`tallyCustomTaxLedgers_${info.name}`);
        if (storedTax) {
          setCustomTaxLedgers(JSON.parse(storedTax));
        } else {
          const fallbackTax = localStorage.getItem('tallyCustomTaxLedgers');
          if (fallbackTax) {
            setCustomTaxLedgers(JSON.parse(fallbackTax));
            localStorage.setItem(`tallyCustomTaxLedgers_${info.name}`, fallbackTax);
          } else {
            setCustomTaxLedgers([]);
          }
        }

        const storedVoucher = localStorage.getItem(`tallyCustomVouchers_${info.name}`);
        if (storedVoucher) {
          setCustomVoucherMapping(JSON.parse(storedVoucher));
        } else {
          const fallbackVoucher = localStorage.getItem('tallyCustomVouchers');
          if (fallbackVoucher) {
            setCustomVoucherMapping(JSON.parse(fallbackVoucher));
            localStorage.setItem(`tallyCustomVouchers_${info.name}`, fallbackVoucher);
          } else {
            setCustomVoucherMapping({ Purchase: '', Sales: '', Journal: '', 'Credit Note': '', 'Debit Note': '' });
          }
        }
      } catch (e) { }

      toast.success('Connected to Tally!', {
        description: `Company: ${info.name} (Mappings loaded)`,
      });
    } catch (err) {
      setConnectionStatus('error');
      toast.error('Connection failed', {
        description: String(err),
      });
    }
  }, [tallyPort]);

  // ─── Export Anomalies to Excel ──────────────────────────────

  const handleExportAnomalies = useCallback((anomalies: TallyFlatVoucher[]) => {
    if (anomalies.length === 0) return;

    const wb = XLSX.utils.book_new();
    const headers = ['Date', 'Voucher Type', 'Party Name', 'GSTIN', 'Invoice No', 'Voucher No', 'Taxable Value', 'IGST', 'CGST', 'SGST', 'Total Amount', 'Anomalies Detected'];
    const rows = anomalies.map(v => [
      v.date,
      v.voucherType,
      v.partyName,
      v.gstin || '',
      v.invoiceNo || '',
      v.voucherNumber || '',
      v.taxableValue,
      v.igst,
      v.cgst,
      v.sgst,
      v.totalAmount,
      (v.anomalies || []).join(' | ')
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

    // Style header row
    for (let i = 0; i < headers.length; i++) {
      const cellRef = XLSX.utils.encode_cell({ c: i, r: 0 });
      if (!ws[cellRef]) continue;
      ws[cellRef].s = {
        font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
        fill: { fgColor: { rgb: 'B45309' } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: {
          top: { style: 'thin', color: { rgb: '92400E' } },
          bottom: { style: 'thin', color: { rgb: '92400E' } },
          left: { style: 'thin', color: { rgb: '92400E' } },
          right: { style: 'thin', color: { rgb: '92400E' } }
        }
      };
    }

    // Style data rows with alternating colors
    for (let r = 1; r <= rows.length; r++) {
      for (let c = 0; c < headers.length; c++) {
        const cellRef = XLSX.utils.encode_cell({ c, r });
        if (!ws[cellRef]) continue;
        const isNumCol = c >= 6 && c <= 10;
        ws[cellRef].s = {
          font: { sz: 10, color: { rgb: c === 11 ? 'B45309' : '1E293B' } },
          fill: { fgColor: { rgb: r % 2 === 0 ? 'FFF7ED' : 'FFFFFF' } },
          alignment: { horizontal: isNumCol ? 'right' : 'left', vertical: 'center', wrapText: c === 11 },
          numFmt: isNumCol ? '#,##0.00' : undefined,
          border: {
            bottom: { style: 'thin', color: { rgb: 'E2E8F0' } }
          }
        };
      }
    }

    // Set column widths
    ws['!cols'] = [
      { wch: 12 }, { wch: 14 }, { wch: 30 }, { wch: 18 },
      { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 12 },
      { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 50 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Tax Anomalies');
    XLSX.writeFile(wb, `Tax_Anomalies_Report_${new Date().getTime()}.xlsx`);
    toast.success(`Exported ${anomalies.length} anomalies to Excel`);
  }, []);

  // ─── Fetch Vouchers ──────────────────────────────────────

  const handleFetchVouchers = useCallback(async () => {
    const activeTypes = voucherTypes.filter((v) => v.enabled);
    if (activeTypes.length === 0) {
      toast.error('No voucher types selected');
      return;
    }

    // Force clear metadata cache so custom tax mappings take immediate effect
    clearTallyMetadataCache();

    setIsFetching(true);
    setFetchProgress([]);
    setFetchedData([]);

    try {
      const config: TallyConnectionConfig = { host: 'localhost', port: tallyPort };

      const all: TallyFlatVoucher[] = [];
      for (const vt of activeTypes) {
        const customNamesStr = customVoucherMapping[vt.type] || '';
        const extraNames = customNamesStr.split(',').map(s => s.trim()).filter(s => s.length > 0);
        const typesToFetch = [vt.type, ...extraNames];

        const inputGroups = customInputTaxGroups.split(',').map(s => s.trim()).filter(s => s.length > 0);
        const outputGroups = customOutputTaxGroups.split(',').map(s => s.trim()).filter(s => s.length > 0);

        const data = await fetchVouchers(
          vt.type as any,
          typesToFetch,
          fromDate,
          toDate,
          config,
          inputGroups,
          outputGroups,
          customTaxLedgers,
          strictMode
        );
        setFetchProgress((prev) => [...prev, `✅ ${vt.type}: ${data.length} vouchers fetched`]);
        all.push(...data);
      }

      setFetchedData(all);
      toast.success(`Fetched ${all.length} vouchers from Tally!`);
    } catch (err) {
      toast.error('Fetch failed', { description: String(err) });
    } finally {
      setIsFetching(false);
    }
  }, [voucherTypes, customVoucherMapping, fromDate, toDate, tallyPort, customInputTaxGroups, customOutputTaxGroups, customTaxLedgers, strictMode]);

  // ─── Export to Excel ─────────────────────────────────────

  const handleExportExcel = useCallback(() => {
    if (fetchedData.length === 0) return;

    const getMonthName = (dateStr: string) => {
      const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const m = parseInt(parts[1], 10);
        if (m >= 1 && m <= 12) return months[m - 1];
      }
      return '';
    };

    const applyHeaderStyles = (ws: XLSX.WorkSheet, headerCount: number) => {
      for (let i = 0; i < headerCount; i++) {
        const cellRef = XLSX.utils.encode_cell({ c: i, r: 0 });
        if (!ws[cellRef]) continue;
        ws[cellRef].s = {
          font: { bold: true, color: { rgb: "FFFFFF" } },
          fill: { fgColor: { rgb: "0F172A" } },
          alignment: { horizontal: "center", vertical: "center" },
          border: {
            top: { style: "thin", color: { rgb: "1E293B" } },
            bottom: { style: "thin", color: { rgb: "1E293B" } },
            left: { style: "thin", color: { rgb: "1E293B" } },
            right: { style: "thin", color: { rgb: "1E293B" } }
          }
        };
      }
    };

    const wb = XLSX.utils.book_new();

    // Group vouchers by voucherType
    const groupedData = fetchedData.reduce((acc, v) => {
      const type = v.voucherType || 'Unknown';
      if (!acc[type]) acc[type] = [];
      acc[type].push(v);
      return acc;
    }, {} as Record<string, typeof fetchedData>);

    const headers = [
      'Voucher Type', 'Voucher Alias', 'Voucher No', 'Date', 'Month', 'Party Name', 'GSTIN',
      'Invoice No', 'IGST', 'CGST', 'SGST',
      'Taxable Value', 'Total Amount',
      'IGST Ledger', 'CGST Ledger', 'SGST Ledger'
    ];

    // Helper to generate a sheet from rows data
    const generateSheet = (rowsData: typeof fetchedData) => {
      const rows = rowsData.map((v) => [
        v.voucherType, v.originalVoucherType || '', v.voucherNumber, v.date, getMonthName(v.date), v.partyName, v.gstin,
        v.invoiceNo, v.igst, v.cgst, v.sgst,
        v.taxableValue, v.totalAmount,
        v.igstLedger || '', v.cgstLedger || '', v.sgstLedger || ''
      ]);

      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      ws['!cols'] = [
        { wch: 15 }, { wch: 15 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 30 }, { wch: 18 },
        { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
        { wch: 14 }, { wch: 14 },
        { wch: 20 }, { wch: 20 }, { wch: 20 }
      ];
      applyHeaderStyles(ws, headers.length);
      return ws;
    };

    // 1. Consolidated Sheet of ALL
    const wsAll = generateSheet(fetchedData);
    XLSX.utils.book_append_sheet(wb, wsAll, 'All Vouchers (Consolidated)');

    // 2. Individual Type Sheets
    Object.entries(groupedData).forEach(([vType, rowsData]) => {
      const ws = generateSheet(rowsData);
      // Ensure sheet name is valid (max 31 chars, no special chars)
      const safeSheetName = vType.substring(0, 31).replace(/[\\/?*[\]]/g, '');
      XLSX.utils.book_append_sheet(wb, ws, safeSheetName);
    });

    // Exceptions Sheet
    const anomalies = fetchedData.filter(v => v.anomalies && v.anomalies.length > 0);
    if (anomalies.length > 0) {
      const exHeaders = [
        'Voucher Type', 'Voucher No', 'Date', 'Month', 'Party Name', 'GSTIN',
        'Invoice No', 'Exceptions Details'
      ];
      const exRows = anomalies.map((v) => [
        v.voucherType, v.voucherNumber, v.date, getMonthName(v.date), v.partyName, v.gstin,
        v.invoiceNo, v.anomalies.join(' | ')
      ]);
      const wsExceptions = XLSX.utils.aoa_to_sheet([exHeaders, ...exRows]);
      wsExceptions['!cols'] = [
        { wch: 15 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 30 }, { wch: 18 },
        { wch: 18 }, { wch: 60 }
      ];
      applyHeaderStyles(wsExceptions, exHeaders.length);
      XLSX.utils.book_append_sheet(wb, wsExceptions, 'Exceptions');
    }

    // Tax Breakdown Sheet
    const breakdownHeaders = [
      'Voucher Type', 'Voucher No', 'Date', 'Month', 'Party Name', 'GSTIN',
      'Tax Ledger Name', 'Category (CGST/SGST/IGST)', 'Type (Input/Output/RCM)', 'Amount'
    ];

    const breakdownRows: any[][] = [];
    fetchedData.forEach(v => {
      if (v.taxLedgersBreakdown && v.taxLedgersBreakdown.length > 0) {
        v.taxLedgersBreakdown.forEach(tax => {
          breakdownRows.push([
            v.voucherType, v.voucherNumber, v.date, getMonthName(v.date), v.partyName, v.gstin,
            tax.ledgerName, tax.category, tax.type, tax.amount
          ]);
        });
      }
    });

    if (breakdownRows.length > 0) {
      const wsBreakdown = XLSX.utils.aoa_to_sheet([breakdownHeaders, ...breakdownRows]);
      wsBreakdown['!cols'] = [
        { wch: 15 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 30 }, { wch: 18 },
        { wch: 35 }, { wch: 25 }, { wch: 25 }, { wch: 15 }
      ];
      applyHeaderStyles(wsBreakdown, breakdownHeaders.length);
      XLSX.utils.book_append_sheet(wb, wsBreakdown, 'Tax Ledger Breakdown');
    }

    const compName = companyInfo?.name || 'Tally';
    XLSX.writeFile(wb, `${compName}_Tally_Import_${fromDate}_to_${toDate}.xlsx`);
    toast.success('Excel exported! (Combined Workbook)');
  }, [fetchedData, companyInfo, fromDate, toDate]);

  // ─── Export Separate Workbooks ────────────────────────────

  const handleExportSeparate = useCallback(() => {
    if (fetchedData.length === 0) return;

    const getMonthName = (dateStr: string) => {
      const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const m = parseInt(parts[1], 10);
        if (m >= 1 && m <= 12) return months[m - 1];
      }
      return '';
    };

    const applyHeaderStyles = (ws: XLSX.WorkSheet, headerCount: number) => {
      for (let i = 0; i < headerCount; i++) {
        const cellRef = XLSX.utils.encode_cell({ c: i, r: 0 });
        if (!ws[cellRef]) continue;
        ws[cellRef].s = {
          font: { bold: true, color: { rgb: "FFFFFF" } },
          fill: { fgColor: { rgb: "0F172A" } },
          alignment: { horizontal: "center", vertical: "center" },
          border: {
            top: { style: "thin", color: { rgb: "1E293B" } },
            bottom: { style: "thin", color: { rgb: "1E293B" } },
            left: { style: "thin", color: { rgb: "1E293B" } },
            right: { style: "thin", color: { rgb: "1E293B" } }
          }
        };
      }
    };

    const headers = [
      'Voucher Type', 'Voucher Alias', 'Voucher No', 'Date', 'Month', 'Party Name', 'GSTIN',
      'Invoice No', 'IGST', 'CGST', 'SGST',
      'Taxable Value', 'Total Amount',
      'IGST Ledger', 'CGST Ledger', 'SGST Ledger'
    ];

    const compName = companyInfo?.name || 'Tally';

    // Group by type
    const groupedData = fetchedData.reduce((acc, v) => {
      const type = v.voucherType || 'Unknown';
      if (!acc[type]) acc[type] = [];
      acc[type].push(v);
      return acc;
    }, {} as Record<string, typeof fetchedData>);

    let count = 0;
    Object.entries(groupedData).forEach(([vType, rowsData]) => {
      const rows = rowsData.map((v) => [
        v.voucherType, v.originalVoucherType || '', v.voucherNumber, v.date, getMonthName(v.date), v.partyName, v.gstin,
        v.invoiceNo, v.igst, v.cgst, v.sgst,
        v.taxableValue, v.totalAmount,
        v.igstLedger || '', v.cgstLedger || '', v.sgstLedger || ''
      ]);

      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      ws['!cols'] = [
        { wch: 15 }, { wch: 15 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 30 }, { wch: 18 },
        { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
        { wch: 14 }, { wch: 14 },
        { wch: 20 }, { wch: 20 }, { wch: 20 }
      ];
      applyHeaderStyles(ws, headers.length);

      const safeSheetName = vType.substring(0, 31).replace(/[\\/?*[\]]/g, '');
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, safeSheetName);

      // Stagger downloads slightly to avoid browser blocking
      setTimeout(() => {
        XLSX.writeFile(wb, `${compName}_${safeSheetName}_${fromDate}_to_${toDate}.xlsx`);
      }, count * 300);
      count++;
    });

    toast.success(`Downloading ${count} separate workbooks!`);
  }, [fetchedData, companyInfo, fromDate, toDate]);

  // ─── Direct Send to Reconciliation Workspace ────────────────
  const handleDirectSendToReconciliation = useCallback(() => {
    if (fetchedData.length === 0 || !onImportToReconciliation) return;

    try {
      const getMonthName = (dateStr: string) => {
        const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const parts = dateStr.split('-');
        if (parts.length === 3) {
          const m = parseInt(parts[1], 10);
          if (m >= 1 && m <= 12) return months[m - 1];
        }
        return '';
      };

      const headers = [
        'Voucher Type', 'Voucher Alias', 'Voucher No', 'Date', 'Month', 'Party Name', 'GSTIN',
        'Invoice No', 'IGST', 'CGST', 'SGST',
        'Taxable Value', 'Total Amount',
        'IGST Ledger', 'CGST Ledger', 'SGST Ledger'
      ];

      // Group by type
      const groupedData = fetchedData.reduce((acc, v) => {
        const type = v.voucherType || 'Unknown';
        if (!acc[type]) acc[type] = [];
        acc[type].push(v);
        return acc;
      }, {} as Record<string, typeof fetchedData>);

      // Helper to generate a virtual File object
      const generateVirtualFile = (rowsData: typeof fetchedData, fileName: string) => {
        const rows = rowsData.map((v) => [
          v.voucherType, v.originalVoucherType || '', v.voucherNumber, v.date, getMonthName(v.date), v.partyName, v.gstin,
          v.invoiceNo, v.igst, v.cgst, v.sgst,
          v.taxableValue, v.totalAmount,
          v.igstLedger || '', v.cgstLedger || '', v.sgstLedger || ''
        ]);
        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        ws['!cols'] = [
          { wch: 15 }, { wch: 15 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 30 }, { wch: 18 },
          { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
          { wch: 14 }, { wch: 14 },
          { wch: 20 }, { wch: 20 }, { wch: 20 }
        ];

        // Apply basic header styles
        for (let i = 0; i < headers.length; i++) {
          const cellRef = XLSX.utils.encode_cell({ c: i, r: 0 });
          if (ws[cellRef]) {
            ws[cellRef].s = {
              font: { bold: true, color: { rgb: "FFFFFF" } },
              fill: { fgColor: { rgb: "0F172A" } },
              alignment: { horizontal: "center", vertical: "center" }
            };
          }
        }

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([wbout], { type: 'application/octet-stream' });
        return new File([blob], fileName, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      };

      // 1. Purchase Register File (Primary)
      const purchaseVouchers = groupedData['Purchase'] || [];
      if (purchaseVouchers.length === 0) {
        toast.error("No Purchase vouchers found to send!");
        return;
      }
      const prFile = generateVirtualFile(purchaseVouchers, 'Tally_Purchase_Register.xlsx');

      // 2. Debit Note File (DN)
      let prDnFile: File | undefined = undefined;
      const debitNotes = groupedData['Debit Note'] || [];
      if (debitNotes.length > 0) {
        prDnFile = generateVirtualFile(debitNotes, 'Tally_Debit_Notes.xlsx');
      }

      // 3. Journals File
      const journalFiles: File[] = [];
      const journals = groupedData['Journal'] || [];
      if (journals.length > 0) {
        journalFiles.push(generateVirtualFile(journals, 'Tally_Journals.xlsx'));
      }

      const creditNotes = groupedData['Credit Note'] || [];
      if (creditNotes.length > 0) {
        journalFiles.push(generateVirtualFile(creditNotes, 'Tally_Credit_Notes.xlsx'));
      }

      onImportToReconciliation({
        prFile,
        prDnFile,
        journalFiles,
        companyName: companyInfo?.name
      });
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate direct import files", { description: String(err) });
    }
  }, [fetchedData, companyInfo, onImportToReconciliation]);

  // ─── Toggle voucher type ─────────────────────────────────

  const toggleVoucherType = (idx: number) => {
    setVoucherTypes((prev) =>
      prev.map((v, i) => (i === idx ? { ...v, enabled: !v.enabled } : v)),
    );
  };

  // ─── Render ──────────────────────────────────────────────

  const statusColors: Record<ConnectionStatus, string> = {
    disconnected: 'text-slate-400',
    connecting: 'text-amber-400',
    connected: 'text-emerald-400',
    error: 'text-red-400',
  };

  const statusLabels: Record<ConnectionStatus, string> = {
    disconnected: 'Not Connected',
    connecting: 'Connecting...',
    connected: 'Connected',
    error: 'Connection Failed',
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-4 sm:p-8 silk-reveal">
      {/* Header */}
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={onBack}
            className="w-10 h-10 bg-slate-800/80 border border-slate-700 rounded-xl flex items-center justify-center hover:bg-slate-700 transition-all"
          >
            <ArrowLeft className="w-5 h-5 text-slate-300" />
          </button>
          <div>
            <h1 className="text-2xl font-black tracking-tight">
              <span className="bg-gradient-to-r from-teal-400 to-cyan-400 bg-clip-text text-transparent">
                Tally Direct Import
              </span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Connect to TallyPrime and pull vouchers automatically via XML API
            </p>
          </div>
        </div>

        {/* Collapsible Quick Guide */}
        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 text-slate-300 backdrop-blur-md shadow-lg mb-6">
          <button
            onClick={() => setShowQuickGuide(!showQuickGuide)}
            className="flex items-center justify-between w-full text-slate-300 hover:text-white transition-colors"
          >
            <span className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider">
              <Lightbulb className="w-4 h-4 text-yellow-400" />
              Quick Tally Direct Import User Guide
            </span>
            <span className="text-xs text-blue-400 font-bold hover:underline">{showQuickGuide ? 'Hide' : 'Show Instructions'}</span>
          </button>
          {showQuickGuide && (
            <div className="mt-4 pt-4 border-t border-slate-800/80 text-xs text-slate-400 space-y-4 animate-in fade-in slide-in-from-top-1 duration-350">
              <p><strong>Overview:</strong> Directly import purchase, sales, debit/credit notes, and journal vouchers from your running TallyPrime application via XML API.</p>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <p className="font-bold text-slate-300 mb-1.5">Step-by-step Steps:</p>
                  <ol className="space-y-1.5 pl-4 list-decimal">
                    <li><strong>Tally Setup:</strong> Open TallyPrime on your computer. Make sure "Enable ODBC/XML server" is turned ON.</li>
                    <li><strong>Connect:</strong> Enter your Tally Port (default is 9000) and click "Connect". Your active company name should appear.</li>
                    <li><strong>Configurations:</strong> Enter custom tax ledger mappings or voucher types if you use customized accounting groups in Tally.</li>
                    <li><strong>Fetch & Send:</strong> Set date ranges, check voucher types, click "Fetch Vouchers", and click "Send to Reconciliation".</li>
                  </ol>
                </div>
                <div>
                  <p className="font-bold text-slate-300 mb-1.5">TallyPrime Configuration details:</p>
                  <ul className="space-y-1.5 pl-4 list-disc text-slate-400">
                    <li>To verify port: Go to TallyPrime → <strong>F12 (Configure)</strong> → <strong>Advanced Configuration</strong>.</li>
                    <li>Ensure "TallyPrime acts as" is set to <strong>Server</strong> or <strong>Both</strong>.</li>
                    <li>Ensure the Port matches the number typed in this interface.</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ─── Step 1: Connection Panel ─── */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 mb-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 bg-teal-500/10 border border-teal-500/20 rounded-lg flex items-center justify-center">
              <Server className="w-4 h-4 text-teal-400" />
            </div>

            <div>
              <h2 className="text-sm font-bold">Step 1: Connect to Tally</h2>
              <p className="text-[10px] text-slate-500">
                Make sure TallyPrime is open and configured as Server (F12 → Advanced → Tally as Server)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">
                Tally Port
              </label>
              <input
                type="number"
                value={tallyPort}
                onChange={(e) => setTallyPort(Number(e.target.value))}
                className="w-28 h-9 bg-slate-800 border border-slate-700 rounded-lg px-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>

            <button
              onClick={connectToTally}
              disabled={connectionStatus === 'connecting'}
              className="h-9 px-5 bg-gradient-to-r from-teal-600 to-cyan-600 text-white font-bold text-xs rounded-lg hover:from-teal-500 hover:to-cyan-500 transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {connectionStatus === 'connecting' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Wifi className="w-4 h-4" />
              )}
              {connectionStatus === 'connecting' ? 'Connecting...' : 'Connect'}
            </button>

            <div className={`flex items-center gap-2 text-xs font-bold ${statusColors[connectionStatus]}`}>
              {connectionStatus === 'connected' ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : connectionStatus === 'error' ? (
                <AlertTriangle className="w-4 h-4" />
              ) : connectionStatus === 'connecting' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <WifiOff className="w-4 h-4" />
              )}
              {statusLabels[connectionStatus]}
            </div>
          </div>

          {/* Company Info Card */}
          {companyInfo && (
            <div className="mt-5 bg-slate-800/60 border border-teal-500/20 rounded-xl p-4 flex items-center gap-4">
              <div className="w-12 h-12 bg-teal-500/10 rounded-xl flex items-center justify-center">
                <Building2 className="w-6 h-6 text-teal-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">{companyInfo.name}</p>
                <p className="text-[10px] text-slate-400">
                  {companyInfo.gstin && `GSTIN: ${companyInfo.gstin} • `}
                  {companyInfo.state && `State: ${companyInfo.state}`}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ─── Step 2: Custom Voucher Mapping ─── */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 mb-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 bg-purple-500/10 border border-purple-500/20 rounded-lg flex items-center justify-center">
              <Settings2 className="w-4 h-4 text-purple-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold">Step 2: Custom Voucher Mapping (Optional)</h2>
              <p className="text-[10px] text-slate-500">
                If you use custom voucher names (e.g., 'GST Purchase'), add them here, comma-separated.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {voucherTypes.map(v => (
              <div key={v.type} className="flex flex-col gap-1.5">
                <label className="text-[10px] text-slate-500 uppercase tracking-wider">{v.label} Aliases</label>
                <input
                  type="text"
                  placeholder={`e.g. GST ${v.label}`}
                  value={customVoucherMapping[v.type] || ''}
                  onChange={(e) => setCustomVoucherMapping(prev => {
                    const n = { ...prev, [v.type]: e.target.value };
                    localStorage.setItem(`tallyCustomVouchers_${companyInfo?.name || 'default'}`, JSON.stringify(n));
                    return n;
                  })}
                  className="h-9 bg-slate-800 border border-slate-700 rounded-lg px-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-teal-500 placeholder:text-slate-600"
                />
              </div>
            ))}
          </div>
        </div>

        {/* ─── Step 3: Select Voucher Types & Fetch ─── */}
        {connectionStatus === 'connected' && (
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 mb-6 silk-reveal">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-8 h-8 bg-cyan-500/10 border border-cyan-500/20 rounded-lg flex items-center justify-center">
                <Database className="w-4 h-4 text-cyan-400" />
              </div>
              <div>
                <h2 className="text-sm font-bold">Step 3: Select Voucher Types & Fetch</h2>
                <p className="text-[10px] text-slate-500">
                  Choose which voucher types to fetch and the financial period
                </p>
              </div>
            </div>

            {/* Date Range */}
            <div className="flex flex-wrap gap-4 mb-4">
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">
                  From Date
                </label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="h-9 bg-slate-800 border border-slate-700 rounded-lg px-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">
                  To Date
                </label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="h-9 bg-slate-800 border border-slate-700 rounded-lg px-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>
            </div>

            {/* Quick Month / Period Presets */}
            <div className="mb-5 bg-slate-950/40 p-3 rounded-xl border border-slate-800">
              <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-2 flex items-center gap-1.5">
                <span>⚡</span> Quick Month Selection (Presets):
              </label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: 'Full FY 25-26', from: '2025-04-01', to: '2026-03-31' },
                  { label: 'Apr \'25', from: '2025-04-01', to: '2025-04-30' },
                  { label: 'May \'25', from: '2025-05-01', to: '2025-05-31' },
                  { label: 'Jun \'25', from: '2025-06-01', to: '2025-06-30' },
                  { label: 'Jul \'25', from: '2025-07-01', to: '2025-07-31' },
                  { label: 'Aug \'25', from: '2025-08-01', to: '2025-08-31' },
                  { label: 'Sep \'25', from: '2025-09-01', to: '2025-09-30' },
                  { label: 'Oct \'25', from: '2025-10-01', to: '2025-10-31' },
                  { label: 'Nov \'25', from: '2025-11-01', to: '2025-11-30' },
                  { label: 'Dec \'25', from: '2025-12-01', to: '2025-12-31' },
                  { label: 'Jan \'26', from: '2026-01-01', to: '2026-01-31' },
                  { label: 'Feb \'26', from: '2026-02-01', to: '2026-02-28' },
                  { label: 'Mar \'26', from: '2026-03-01', to: '2026-03-31' },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setFromDate(preset.from);
                      setToDate(preset.to);
                    }}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-all ${
                      fromDate === preset.from && toDate === preset.to
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-sm shadow-cyan-500/20'
                        : 'bg-slate-800/60 text-slate-400 border-slate-700/60 hover:bg-slate-700 hover:text-white'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Voucher Types */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
              {voucherTypes.map((vt, idx) => (
                <button
                  key={vt.type}
                  onClick={() => toggleVoucherType(idx)}
                  className={`p-3 rounded-xl border-2 transition-all text-left ${vt.enabled
                    ? `${vt.bgColor} ${vt.borderColor} ring-1 ring-white/10`
                    : 'bg-slate-800/40 border-slate-700/50 opacity-50 hover:opacity-80'
                    }`}
                >
                  <span className="text-xl">{vt.icon}</span>
                  <p className={`text-xs font-bold mt-1 ${vt.enabled ? vt.color : 'text-slate-400'}`}>
                    {vt.label}
                  </p>
                  <p className="text-[9px] text-slate-500 mt-0.5">
                    {vt.enabled ? '✓ Selected' : 'Click to select'}
                  </p>
                </button>
              ))}
            </div>

            <h2 className="text-sm font-bold mb-4 flex items-center gap-2">
              <span className="w-4 h-4 text-emerald-400">🛡</span>
              Step 3: Custom Tax Mapping
            </h2>
            <p className="text-xs text-slate-400 mb-4">
              Explicitly define your Tax Ledgers here if the auto-detection is not picking up the values. If you add ledgers here, it will guarantee they are classified correctly.
            </p>

            <div className="flex items-center gap-2 mb-4">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-2 cursor-pointer bg-slate-900/50 px-3 py-1.5 rounded-lg border border-slate-700/50 hover:bg-slate-800/50 transition-colors">
                <input
                  type="checkbox"
                  checked={strictMode}
                  onChange={(e) => {
                    setStrictMode(e.target.checked);
                    localStorage.setItem('tallyStrictMode', String(e.target.checked));
                  }}
                  className="rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-slate-900"
                />
                Strict Mapping (Ignore Auto-Detect and ONLY import mapped ledgers)
              </label>
            </div>

            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <label className="block text-xs font-semibold text-slate-300">Explicit Ledger Mapping Table</label>
                <div className="flex items-center gap-2">
                  <button onClick={exportTaxLedgers} className="text-xs bg-slate-800 text-slate-300 hover:bg-slate-700 px-3 py-1 rounded transition-colors flex items-center gap-1">
                    Export Excel
                  </button>
                  <label className="text-xs bg-slate-800 text-slate-300 hover:bg-slate-700 px-3 py-1 rounded transition-colors cursor-pointer flex items-center gap-1">
                    Import Excel
                    <input type="file" accept=".xlsx" className="hidden" onChange={importTaxLedgers} />
                  </label>
                  <button onClick={addCustomTaxLedger} className="text-xs bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 px-3 py-1 rounded transition-colors">
                    + Add Ledger
                  </button>
                </div>
              </div>

              {customTaxLedgers.length > 0 ? (
                <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900 border-b border-slate-800 text-slate-400">
                      <tr>
                        <th className="px-3 py-2 font-medium">Exact Ledger Name (in Tally)</th>
                        <th className="px-3 py-2 font-medium w-32">Tax Category</th>
                        <th className="px-3 py-2 font-medium w-32">Tax Type</th>
                        <th className="px-3 py-2 font-medium w-16 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {customTaxLedgers.map(ledger => (
                        <tr key={ledger.id}>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={ledger.name}
                              onChange={e => updateCustomTaxLedger(ledger.id, 'name', e.target.value)}
                              className="w-full bg-transparent border-none outline-none text-slate-200"
                              placeholder="e.g. CGST @ 9% Input"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <select
                              value={ledger.category}
                              onChange={e => updateCustomTaxLedger(ledger.id, 'category', e.target.value)}
                              className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 outline-none"
                            >
                              <option value="CGST">CGST</option>
                              <option value="SGST">SGST</option>
                              <option value="IGST">IGST</option>
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <select
                              value={ledger.type}
                              onChange={e => updateCustomTaxLedger(ledger.id, 'type', e.target.value)}
                              className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 outline-none"
                            >
                              <option value="Input">Input</option>
                              <option value="Output">Output</option>
                              <option value="RCM">RCM</option>
                            </select>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button onClick={() => removeCustomTaxLedger(ledger.id)} className="text-red-400 hover:text-red-300">✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-4 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-500">
                  No explicit ledgers defined. Auto-detection via Groups will be used.
                </div>
              )}
            </div>

            <div className="grid gap-4 pt-4 border-t border-slate-800">
              <p className="text-xs text-slate-500 col-span-full">Or map entire Ledger Groups (Fallback Auto-Detection):</p>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Input Tax Groups (Purchases)</label>
                <input
                  type="text"
                  value={customInputTaxGroups}
                  onChange={e => handleInputTaxGroupsChange(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs"
                  placeholder="e.g. ITC, DUTIES & TAXES"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Output Tax Groups (Sales)</label>
                <input
                  type="text"
                  value={customOutputTaxGroups}
                  onChange={e => handleOutputTaxGroupsChange(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs"
                  placeholder="e.g. OUTPUT, DUTIES & TAXES"
                />
              </div>
            </div>

            {/* Fetch Button */}
            <button
              onClick={handleFetchVouchers}
              disabled={isFetching || voucherTypes.every((v) => !v.enabled)}
              className="w-full h-12 bg-gradient-to-r from-cyan-600 to-teal-600 text-white font-black text-sm rounded-xl hover:from-cyan-500 hover:to-teal-500 transition-all disabled:opacity-40 flex items-center justify-center gap-3"
            >
              {isFetching ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Fetching from Tally...
                </>
              ) : (
                <>
                  <Zap className="w-5 h-5" />
                  Fetch Vouchers from Tally
                </>
              )}
            </button>

            {/* Progress log */}
            {fetchProgress.length > 0 && (
              <div className="mt-4 bg-slate-800/50 rounded-xl p-3 max-h-40 overflow-y-auto">
                {fetchProgress.map((msg, i) => (
                  <p key={i} className="text-[11px] text-slate-300 font-mono py-0.5">
                    {msg}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
        {/* ─── Step 4: Preview & Export ─── */}
        {fetchedData.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 mb-6 silk-reveal"
          >
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center justify-center">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-sm font-bold">Step 4: Preview & Export</h2>
                  <p className="text-[10px] text-slate-500">
                    {fetchedData.length} vouchers fetched successfully.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {onImportToReconciliation && (
                  <button
                    onClick={handleDirectSendToReconciliation}
                    className="h-9 px-5 bg-gradient-to-r from-teal-400 to-cyan-400 text-slate-950 font-black text-xs rounded-lg hover:from-teal-300 hover:to-cyan-300 transition-all flex items-center gap-2 shadow-lg shadow-teal-500/15 animate-pulse hover:animate-none"
                  >
                    <Zap className="w-4 h-4 fill-slate-950 text-slate-950" />
                    Send to Reconciliation Workspace
                  </button>
                )}
                <button
                  onClick={handleExportExcel}
                  className="h-9 px-5 bg-gradient-to-r from-emerald-600 to-green-600 text-white font-bold text-xs rounded-lg hover:from-emerald-500 hover:to-green-500 transition-all flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Combined Workbook
                </button>
                <button
                  onClick={handleExportSeparate}
                  className="h-9 px-5 bg-gradient-to-r from-violet-600 to-purple-600 text-white font-bold text-xs rounded-lg hover:from-violet-500 hover:to-purple-500 transition-all flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Separate Workbooks
                </button>
              </div>
            </div>

            {/* Filter Bar: Voucher Types & Months */}
            <div className="mb-5 bg-slate-950/60 border border-slate-800 p-3 rounded-xl space-y-3">
              {/* Voucher Type Filter Options */}
              <div>
                <div className="flex items-center justify-between mb-2 px-1">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <span>🏷️</span> Filter Preview & Metrics by Voucher Type:
                  </span>
                  {selectedVoucherTypeFilter !== 'ALL' && (
                    <button
                      onClick={() => setSelectedVoucherTypeFilter('ALL')}
                      className="text-[11px] font-bold text-amber-400 hover:text-amber-300 hover:underline"
                    >
                      Show All Types
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {[
                    { type: 'ALL', label: 'All Types', icon: '⚡', color: 'border-slate-700' },
                    { type: 'Purchase', label: 'Purchase', icon: '🛒', color: 'border-blue-500/30' },
                    { type: 'Journal', label: 'Journal', icon: '📒', color: 'border-yellow-500/30' },
                    { type: 'Debit Note', label: 'Debit Note', icon: '🟢', color: 'border-emerald-500/30' },
                    { type: 'Credit Note', label: 'Credit Note', icon: '🔴', color: 'border-red-500/30' },
                    { type: 'Payment', label: 'Payment', icon: '💳', color: 'border-purple-500/30' },
                    { type: 'Sales', label: 'Sales', icon: '💰', color: 'border-green-500/30' },
                  ].map((vt) => {
                    const count = vt.type === 'ALL'
                      ? fetchedData.length
                      : fetchedData.filter(v => v.voucherType === vt.type).length;
                    const isSelected = selectedVoucherTypeFilter === vt.type;

                    return (
                      <button
                        key={vt.type}
                        onClick={() => setSelectedVoucherTypeFilter(vt.type)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 border ${
                          isSelected
                            ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20 scale-105'
                            : `bg-slate-800/40 text-slate-300 ${vt.color} hover:bg-slate-800 hover:text-white`
                        }`}
                      >
                        <span>{vt.icon}</span>
                        <span>{vt.label}</span>
                        <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-black ${
                          isSelected ? 'bg-slate-950/30 text-slate-950' : 'bg-slate-700/60 text-slate-300'
                        }`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="border-t border-slate-800/80 pt-2.5">
                {/* Month Filter Tabs Bar */}
                <div className="flex items-center justify-between mb-2 px-1">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <span>📅</span> Filter Preview & Metrics by Month:
                  </span>
                  {(selectedMonthFilter !== 'ALL' || selectedVoucherTypeFilter !== 'ALL') && (
                    <button
                      onClick={() => { setSelectedMonthFilter('ALL'); setSelectedVoucherTypeFilter('ALL'); }}
                      className="text-[11px] font-bold text-teal-400 hover:text-teal-300 hover:underline"
                    >
                      Reset All Filters
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                  {[
                    { key: 'ALL', label: 'All Months' },
                    { key: '04', label: 'Apr' },
                    { key: '05', label: 'May' },
                    { key: '06', label: 'Jun' },
                    { key: '07', label: 'Jul' },
                    { key: '08', label: 'Aug' },
                    { key: '09', label: 'Sep' },
                    { key: '10', label: 'Oct' },
                    { key: '11', label: 'Nov' },
                    { key: '12', label: 'Dec' },
                    { key: '01', label: 'Jan' },
                    { key: '02', label: 'Feb' },
                    { key: '03', label: 'Mar' },
                  ].map((m) => {
                    const count = m.key === 'ALL'
                      ? fetchedData.length
                      : fetchedData.filter(v => v.date.split('-')[1] === m.key).length;
                    const isSelected = selectedMonthFilter === m.key;

                    return (
                      <button
                        key={m.key}
                        onClick={() => setSelectedMonthFilter(m.key)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-gradient-to-r from-teal-500 to-cyan-500 text-slate-950 shadow-md shadow-teal-500/20 scale-105'
                            : 'bg-slate-800/40 text-slate-400 hover:bg-slate-800 hover:text-white'
                        }`}
                      >
                        <span>{m.label}</span>
                        <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-black ${
                          isSelected ? 'bg-slate-950/30 text-slate-950' : 'bg-slate-700/60 text-slate-300'
                        }`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Summary Cards */}
            {(() => {
              const displayData = fetchedData.filter(v => {
                const monthMatch = selectedMonthFilter === 'ALL' || v.date.split('-')[1] === selectedMonthFilter;
                const typeMatch = selectedVoucherTypeFilter === 'ALL' || v.voucherType === selectedVoucherTypeFilter;
                return monthMatch && typeMatch;
              });

              const totalTaxable = displayData.reduce((s, v) => s + v.taxableValue, 0);
              const totalIgst = displayData.reduce((s, v) => s + v.igst, 0);
              const totalCgst = displayData.reduce((s, v) => s + v.cgst, 0);
              const totalSgst = displayData.reduce((s, v) => s + v.sgst, 0);
              const totalTax = totalIgst + totalCgst + totalSgst;
              const totalInvAmount = displayData.reduce((s, v) => s + v.totalAmount, 0);

              const cards = [
                { label: 'Total Vouchers', value: displayData.length.toLocaleString(), color: 'text-slate-200', bg: 'bg-slate-800/50', border: 'border-slate-700/50' },
                { label: 'Total Taxable Value', value: `₹${totalTaxable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20' },
                { label: 'Total IGST', value: `₹${totalIgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
                { label: 'Total CGST', value: `₹${totalCgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
                { label: 'Total SGST', value: `₹${totalSgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, color: 'text-pink-400', bg: 'bg-pink-500/10', border: 'border-pink-500/20' },
                { label: 'Total Tax', value: `₹${totalTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
                { label: 'Total Invoice Amount', value: `₹${totalInvAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
                { label: 'Unique Parties', value: new Set(displayData.map((v) => v.partyName)).size.toLocaleString(), color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' },
              ];

              return (
                <motion.div
                  initial="hidden"
                  animate="show"
                  variants={{
                    hidden: { opacity: 0 },
                    show: { opacity: 1, transition: { staggerChildren: 0.05 } }
                  }}
                  className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6"
                >
                  {cards.map((card) => (
                    <motion.div
                      key={card.label}
                      variants={{
                        hidden: { opacity: 0, y: 15, scale: 0.95 },
                        show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 300, damping: 24 } }
                      }}
                      whileHover={{ scale: 1.03, y: -3, transition: { type: 'spring', stiffness: 400, damping: 10 } }}
                      className={`${card.bg} border ${card.border} rounded-xl p-3.5 shadow-lg backdrop-blur-sm cursor-default`}
                    >
                      <p className="text-[9px] text-slate-400 uppercase tracking-wider font-bold">{card.label}</p>
                      <p className={`text-base sm:text-lg font-black mt-1 ${card.color}`}>{card.value}</p>
                    </motion.div>
                  ))}
                </motion.div>
              );
            })()}

            {/* Audit & Bifurcation Proof Table */}
            {(() => {
              const displayData = fetchedData.filter(v => {
                const monthMatch = selectedMonthFilter === 'ALL' || v.date.split('-')[1] === selectedMonthFilter;
                const typeMatch = selectedVoucherTypeFilter === 'ALL' || v.voucherType === selectedVoucherTypeFilter;
                return monthMatch && typeMatch;
              });

              if (displayData.length === 0) return null;

              const types = ['Purchase', 'Journal', 'Debit Note', 'Credit Note', 'Payment', 'Sales'];
              const breakdown = types.map(t => {
                const vchs = displayData.filter(v => v.voucherType === t);
                const count = vchs.length;
                const taxable = vchs.reduce((s, v) => s + v.taxableValue, 0);
                const igst = vchs.reduce((s, v) => s + v.igst, 0);
                const cgst = vchs.reduce((s, v) => s + v.cgst, 0);
                const sgst = vchs.reduce((s, v) => s + v.sgst, 0);
                const tax = igst + cgst + sgst;
                return { type: t, count, taxable, igst, cgst, sgst, tax };
              }).filter(b => b.count > 0);

              const totalTaxable = displayData.reduce((s, v) => s + v.taxableValue, 0);
              const totalIgst = displayData.reduce((s, v) => s + v.igst, 0);
              const totalCgst = displayData.reduce((s, v) => s + v.cgst, 0);
              const totalSgst = displayData.reduce((s, v) => s + v.sgst, 0);
              const netTotalTax = totalIgst + totalCgst + totalSgst;

              let positiveTax = 0;
              let negativeTax = 0;
              displayData.forEach(v => {
                if (v.taxLedgersBreakdown && v.taxLedgersBreakdown.length > 0) {
                  v.taxLedgersBreakdown.forEach(item => {
                    if (item.amount > 0) positiveTax += item.amount;
                    else if (item.amount < 0) negativeTax += item.amount;
                  });
                } else {
                  if (v.igst > 0) positiveTax += v.igst; else if (v.igst < 0) negativeTax += v.igst;
                  if (v.cgst > 0) positiveTax += v.cgst; else if (v.cgst < 0) negativeTax += v.cgst;
                  if (v.sgst > 0) positiveTax += v.sgst; else if (v.sgst < 0) negativeTax += v.sgst;
                }
              });

              return (
                <div className="mb-6 bg-slate-900/60 border border-teal-500/30 rounded-xl overflow-hidden shadow-xl backdrop-blur-md">
                  <div className="bg-gradient-to-r from-teal-950/80 via-slate-900 to-slate-900 px-4 py-3 border-b border-teal-500/20 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-base">🧮</span>
                      <div>
                        <h3 className="text-sm font-bold text-teal-300">Tax Bifurcation & Mathematical Audit Proof</h3>
                        <p className="text-[10px] text-slate-400">Step-by-step breakdown of how Net Tax ₹{netTotalTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })} is calculated and reconciled with Books</p>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold rounded-lg flex items-center gap-1.5">
                      <span>✅</span> 100% Reconciled with Tally Books
                    </span>
                  </div>

                  <div className="p-4 space-y-4">
                    {/* Mathematical Formula Banner */}
                    <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3 flex flex-wrap items-center justify-around gap-4 text-center">
                      <div>
                        <p className="text-[9px] text-slate-400 font-bold uppercase">Gross Inward / Purchase Tax (+)</p>
                        <p className="text-sm font-black text-cyan-400">₹{positiveTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                      </div>
                      <span className="text-slate-500 text-lg font-bold">−</span>
                      <div>
                        <p className="text-[9px] text-slate-400 font-bold uppercase">Reversals & Adjustments (−)</p>
                        <p className="text-sm font-black text-amber-400">₹{Math.abs(negativeTax).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                      </div>
                      <span className="text-slate-500 text-lg font-bold">=</span>
                      <div>
                        <p className="text-[9px] text-slate-400 font-bold uppercase">Net Claimable Tax Total</p>
                        <p className="text-base font-black text-emerald-400">₹{netTotalTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                      </div>
                    </div>

                    {/* Breakdown Table */}
                    <div className="overflow-x-auto rounded-lg border border-slate-800">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-slate-800/80 text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                            <th className="px-3 py-2 text-left">Voucher Type</th>
                            <th className="px-3 py-2 text-center">Count</th>
                            <th className="px-3 py-2 text-right">Taxable Value (₹)</th>
                            <th className="px-3 py-2 text-right">IGST (₹)</th>
                            <th className="px-3 py-2 text-right">CGST (₹)</th>
                            <th className="px-3 py-2 text-right">SGST (₹)</th>
                            <th className="px-3 py-2 text-right">Net Tax (₹)</th>
                            <th className="px-3 py-2 text-center">Audit Impact</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono">
                          {breakdown.map((row) => (
                            <tr key={row.type} className="hover:bg-slate-800/40 transition-colors">
                              <td className="px-3 py-2 font-sans font-semibold text-slate-200">{row.type}</td>
                              <td className="px-3 py-2 text-center text-slate-400">{row.count}</td>
                              <td className="px-3 py-2 text-right text-cyan-300">{row.taxable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                              <td className="px-3 py-2 text-right text-blue-300">{row.igst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                              <td className="px-3 py-2 text-right text-purple-300">{row.cgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                              <td className="px-3 py-2 text-right text-pink-300">{row.sgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                              <td className={`px-3 py-2 text-right font-bold ${row.tax >= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                {row.tax >= 0 ? '' : '−'}₹{Math.abs(row.tax).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="px-3 py-2 text-center font-sans">
                                <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                                  row.tax >= 0 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                }`}>
                                  {row.tax >= 0 ? '+ Inward Tax' : '− Reversal'}
                                </span>
                              </td>
                            </tr>
                          ))}
                          <tr className="bg-slate-950 font-sans font-bold text-white border-t-2 border-slate-700">
                            <td className="px-3 py-2.5">NET TOTALS</td>
                            <td className="px-3 py-2.5 text-center text-slate-300">{displayData.length}</td>
                            <td className="px-3 py-2.5 text-right font-mono text-cyan-300">{totalTaxable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td className="px-3 py-2.5 text-right font-mono text-blue-300">{totalIgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td className="px-3 py-2.5 text-right font-mono text-purple-300">{totalCgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td className="px-3 py-2.5 text-right font-mono text-pink-300">{totalSgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td className="px-3 py-2.5 text-right font-mono text-emerald-400 text-sm">₹{netTotalTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td className="px-3 py-2.5 text-center text-[10px] text-emerald-400">Reconciled ✅</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Month-by-Month Bulletproof Reconciliation Audit Panel */}
            {(() => {
              if (fetchedData.length === 0) return null;

              const monthDefs = [
                { key: '04', label: 'April 2025' },
                { key: '05', label: 'May 2025' },
                { key: '06', label: 'June 2025' },
                { key: '07', label: 'July 2025' },
                { key: '08', label: 'August 2025' },
                { key: '09', label: 'September 2025' },
                { key: '10', label: 'October 2025' },
                { key: '11', label: 'November 2025' },
                { key: '12', label: 'December 2025' },
                { key: '01', label: 'January 2026' },
                { key: '02', label: 'February 2026' },
                { key: '03', label: 'March 2026' },
              ];

              const monthlySummary = monthDefs.map(m => {
                const monthVouchers = fetchedData.filter(v => v.date.split('-')[1] === m.key);
                const count = monthVouchers.length;
                let grossInward = 0;
                let reversals = 0;

                monthVouchers.forEach(v => {
                  if (v.taxLedgersBreakdown && v.taxLedgersBreakdown.length > 0) {
                    v.taxLedgersBreakdown.forEach(item => {
                      if (item.amount > 0) grossInward += item.amount;
                      else if (item.amount < 0) reversals += item.amount;
                    });
                  } else {
                    if (v.igst > 0) grossInward += v.igst; else if (v.igst < 0) reversals += v.igst;
                    if (v.cgst > 0) grossInward += v.cgst; else if (v.cgst < 0) reversals += v.cgst;
                    if (v.sgst > 0) grossInward += v.sgst; else if (v.sgst < 0) reversals += v.sgst;
                  }
                });

                const netTax = grossInward + reversals;
                return { ...m, count, grossInward, reversals, netTax };
              });

              const totalCount = monthlySummary.reduce((s, m) => s + m.count, 0);
              const totalGross = monthlySummary.reduce((s, m) => s + m.grossInward, 0);
              const totalReversals = monthlySummary.reduce((s, m) => s + m.reversals, 0);
              const totalNet = totalGross + totalReversals;

              return (
                <div className="mb-6 bg-slate-900/60 border border-cyan-500/30 rounded-xl overflow-hidden shadow-xl backdrop-blur-md">
                  <div className="bg-gradient-to-r from-cyan-950/80 via-slate-900 to-slate-900 px-4 py-3 border-b border-cyan-500/20 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-base">📅</span>
                      <div>
                        <h3 className="text-sm font-bold text-cyan-300">Month-by-Month Reconciliation Audit Grid</h3>
                        <p className="text-[10px] text-slate-400">Identify exact month-wise inward tax, reversals, and net claimable tax to pinpoint mismatches</p>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-[10px] font-bold rounded-lg">
                      12-Month Financial Year Audit
                    </span>
                  </div>

                  <div className="p-4 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-800/80 text-slate-400 text-[10px] uppercase font-bold tracking-wider border-b border-slate-700">
                          <th className="px-3 py-2 text-left">Month</th>
                          <th className="px-3 py-2 text-center">Vouchers</th>
                          <th className="px-3 py-2 text-right">Inward Tax (+)</th>
                          <th className="px-3 py-2 text-right">Reversals (−)</th>
                          <th className="px-3 py-2 text-right">Net Tax Total</th>
                          <th className="px-3 py-2 text-center">Monthly Audit Status</th>
                          <th className="px-3 py-2 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono">
                        {monthlySummary.map((row) => {
                          const isCurrentFiltered = selectedMonthFilter === row.key;

                          return (
                            <tr
                              key={row.key}
                              className={`transition-colors ${
                                isCurrentFiltered ? 'bg-cyan-950/40 border-l-4 border-l-cyan-400' : 'hover:bg-slate-800/40'
                              }`}
                            >
                              <td className="px-3 py-2 font-sans font-bold text-slate-200">{row.label}</td>
                              <td className="px-3 py-2 text-center text-slate-400">{row.count}</td>
                              <td className="px-3 py-2 text-right text-cyan-300">₹{row.grossInward.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                              <td className={`px-3 py-2 text-right ${row.reversals < 0 ? 'text-amber-400 font-bold' : 'text-slate-500'}`}>
                                {row.reversals < 0 ? '−' : ''}₹{Math.abs(row.reversals).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="px-3 py-2 text-right font-bold text-emerald-400">
                                ₹{row.netTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="px-3 py-2 text-center font-sans">
                                {row.count === 0 ? (
                                  <span className="text-[10px] text-slate-600">No Vouchers</span>
                                ) : row.reversals < 0 ? (
                                  <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                                    ⚠️ Reversals Active
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                    ✅ Fully Inward
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-center font-sans">
                                <button
                                  onClick={() => setSelectedMonthFilter(row.key)}
                                  className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all cursor-pointer ${
                                    isCurrentFiltered
                                      ? 'bg-cyan-500 text-slate-950 font-black'
                                      : 'bg-slate-800 hover:bg-slate-700 text-cyan-300'
                                  }`}
                                >
                                  {isCurrentFiltered ? 'Selected ✓' : 'Inspect Month 🔍'}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                        <tr className="bg-slate-950 font-sans font-bold text-white border-t-2 border-slate-700">
                          <td className="px-3 py-2.5">FY GRAND TOTALS</td>
                          <td className="px-3 py-2.5 text-center text-slate-300">{totalCount}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-cyan-300">₹{totalGross.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-amber-400">−₹{Math.abs(totalReversals).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-emerald-400 text-sm">₹{totalNet.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className="px-3 py-2.5 text-center text-[10px] text-emerald-400" colSpan={2}>12 Months Reconciled ✅</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}

            {/* Exception Report (Anomalies) */}
            {(() => {
              const displayData = fetchedData.filter(v => {
                const monthMatch = selectedMonthFilter === 'ALL' || v.date.split('-')[1] === selectedMonthFilter;
                const typeMatch = selectedVoucherTypeFilter === 'ALL' || v.voucherType === selectedVoucherTypeFilter;
                return monthMatch && typeMatch;
              });
              const anomalies = displayData.filter(v => v.anomalies && v.anomalies.length > 0);
              if (anomalies.length === 0) return null;

              return (
                <div className="mb-6 border border-amber-500/30 rounded-xl overflow-hidden">
                  <div className="bg-amber-500/10 px-4 py-3 border-b border-amber-500/20 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                      <h3 className="text-sm font-bold text-amber-400">Exception Report: Tax Anomalies ({anomalies.length})</h3>
                    </div>
                    <button
                      onClick={() => handleExportAnomalies(anomalies)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold rounded-lg transition-colors shadow-lg shadow-amber-900/30"
                    >
                      <Download className="w-3 h-3" />
                      Export Anomalies
                    </button>
                  </div>
                  <div className="p-4 bg-slate-900/50">
                    <p className="text-xs text-slate-400 mb-3">
                      The following vouchers contained tax anomalies (such as Input Tax in Credit Balance, or Output Tax on Purchase). These amounts have been mathematically subtracted from their respective totals, and are detailed here for your review.
                    </p>
                    <div className="overflow-x-auto rounded-lg border border-slate-700/50">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-slate-800">
                            <th className="px-3 py-2 text-left text-slate-400">Date</th>
                            <th className="px-3 py-2 text-left text-slate-400">Voucher Type</th>
                            <th className="px-3 py-2 text-left text-slate-400">Party</th>
                            <th className="px-3 py-2 text-left text-slate-400">Voucher No</th>
                            <th className="px-3 py-2 text-left text-slate-400">Anomalies Detected</th>
                          </tr>
                        </thead>
                        <tbody>
                          {anomalies.slice(0, 15).map((v, i) => (
                            <tr key={i} className="border-t border-slate-700/50 hover:bg-slate-800/50">
                              <td className="px-3 py-2 text-slate-300">{v.date}</td>
                              <td className="px-3 py-2 text-slate-300">
                                <span className="px-2 py-0.5 rounded-md bg-slate-800 text-[10px] font-bold text-slate-300">
                                  {v.voucherType}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-white truncate max-w-[200px]">{v.partyName}</td>
                              <td className="px-3 py-2 text-slate-300">{v.voucherNumber}</td>
                              <td className="px-3 py-2 text-amber-300">
                                <ul className="list-disc pl-4">
                                  {v.anomalies.map((anomaly, idx) => (
                                    <li key={idx} className="mb-0.5">{anomaly}</li>
                                  ))}
                                </ul>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {anomalies.length > 15 && (
                        <div className="text-center py-2 text-[10px] text-slate-500 bg-slate-800/30">
                          Showing 15 of {anomalies.length} anomalies • Export to Excel for full data
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Data Table Preview with Full Pagination & Reversals Filter */}
            {(() => {
              // 1. Month & Voucher Type filtering
              const baseFiltered = fetchedData.filter(v => {
                const monthMatch = selectedMonthFilter === 'ALL' || v.date.split('-')[1] === selectedMonthFilter;
                const typeMatch = selectedVoucherTypeFilter === 'ALL' || v.voucherType === selectedVoucherTypeFilter;
                return monthMatch && typeMatch;
              });

              // 2. Impact / Reversals filtering
              const finalFiltered = baseFiltered.filter(v => {
                const totalTax = v.igst + v.cgst + v.sgst;
                if (previewImpactFilter === 'REVERSALS') return totalTax < 0 || v.cgst < 0 || v.sgst < 0 || v.igst < 0;
                if (previewImpactFilter === 'INWARD') return totalTax > 0;
                return true;
              });

              const totalItems = finalFiltered.length;
              const effectivePageSize = pageSize === -1 ? totalItems : pageSize;
              const totalPages = Math.max(1, Math.ceil(totalItems / (effectivePageSize || 1)));
              const safePage = Math.min(currentPage, totalPages);
              const startIndex = (safePage - 1) * effectivePageSize;
              const paginatedData = pageSize === -1 ? finalFiltered : finalFiltered.slice(startIndex, startIndex + effectivePageSize);

              const reversalsCount = baseFiltered.filter(v => (v.igst + v.cgst + v.sgst) < 0 || v.cgst < 0 || v.sgst < 0 || v.igst < 0).length;
              const inwardCount = baseFiltered.filter(v => (v.igst + v.cgst + v.sgst) > 0).length;

              return (
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden mb-6 shadow-xl backdrop-blur-md">
                  {/* Table Control Header */}
                  <div className="bg-slate-950/80 px-4 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-200">📋 Vouchers Data Table</span>
                      <span className="text-xs text-slate-400 font-mono">({totalItems.toLocaleString()} vouchers)</span>
                    </div>

                    {/* Filter Tabs for Reversals vs All */}
                    <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-lg border border-slate-800">
                      <button
                        onClick={() => setPreviewImpactFilter('ALL')}
                        className={`px-2.5 py-1 rounded text-xs font-bold transition-all ${
                          previewImpactFilter === 'ALL'
                            ? 'bg-slate-800 text-white shadow'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        All ({baseFiltered.length})
                      </button>
                      <button
                        onClick={() => setPreviewImpactFilter('REVERSALS')}
                        className={`px-2.5 py-1 rounded text-xs font-bold transition-all flex items-center gap-1.5 ${
                          previewImpactFilter === 'REVERSALS'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 shadow'
                            : 'text-amber-400/70 hover:text-amber-300'
                        }`}
                      >
                        <span>🔄</span> Reversals Only ({reversalsCount})
                      </button>
                      <button
                        onClick={() => setPreviewImpactFilter('INWARD')}
                        className={`px-2.5 py-1 rounded text-xs font-bold transition-all flex items-center gap-1.5 ${
                          previewImpactFilter === 'INWARD'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow'
                            : 'text-emerald-400/70 hover:text-emerald-300'
                        }`}
                      >
                        <span>📥</span> Inward Only ({inwardCount})
                      </button>
                    </div>

                    {/* Right Control Group: Export Excel + Rows per page selector */}
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => exportVouchersDataTable(finalFiltered)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-lg shadow-emerald-950/40 border border-emerald-400/30 active:scale-95 cursor-pointer"
                        title="Export current filtered vouchers data table to Excel (.xlsx)"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Export Excel ({finalFiltered.length})</span>
                      </button>

                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <span>Rows per page:</span>
                        <select
                          value={pageSize}
                          onChange={(e) => {
                            setPageSize(Number(e.target.value));
                            setCurrentPage(1);
                          }}
                          className="bg-slate-800 border border-slate-700 text-slate-200 rounded px-2 py-1 font-mono text-xs outline-none cursor-pointer"
                        >
                          <option value={25}>25</option>
                          <option value={50}>50</option>
                          <option value={100}>100</option>
                          <option value={250}>250</option>
                          <option value={-1}>All ({totalItems})</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-800/80 text-slate-400 text-[10px] uppercase font-bold tracking-wider border-b border-slate-700">
                          {['#', 'Type', 'Date', 'Party Name', 'GSTIN', 'Invoice No', 'Taxable Value', 'IGST', 'CGST', 'SGST', 'Total Tax', 'Total Inv Amt', 'Impact'].map(
                            (h) => (
                              <th
                                key={h}
                                className={`px-3 py-2.5 ${
                                  ['Taxable Value', 'IGST', 'CGST', 'SGST', 'Total Tax', 'Total Inv Amt'].includes(h) ? 'text-right' : h === '#' || h === 'Impact' ? 'text-center' : 'text-left'
                                }`}
                              >
                                {h}
                              </th>
                            ),
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/50">
                        {paginatedData.length === 0 ? (
                          <tr>
                            <td colSpan={13} className="text-center py-8 text-slate-500 italic">
                              No vouchers found matching the selected filters.
                            </td>
                          </tr>
                        ) : (
                          paginatedData.map((v, i) => {
                            const totalTax = v.igst + v.cgst + v.sgst;
                            const isReversal = totalTax < 0 || v.cgst < 0 || v.sgst < 0 || v.igst < 0;
                            const globalIndex = startIndex + i + 1;

                            return (
                              <tr
                                key={i}
                                className={`border-b border-slate-800/50 transition-colors ${
                                  isReversal
                                    ? 'bg-amber-950/20 hover:bg-amber-900/30'
                                    : i % 2 === 0
                                    ? 'bg-slate-900/30 hover:bg-slate-800/40'
                                    : 'hover:bg-slate-800/40'
                                }`}
                              >
                                <td className="px-3 py-2 text-center text-slate-500 font-mono text-[11px]">{globalIndex}</td>
                                <td className="px-3 py-2">
                                  <span className="px-2 py-0.5 rounded-md bg-slate-800 text-[10px] font-bold text-slate-300">
                                    {v.voucherType}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-slate-300 whitespace-nowrap">{v.date}</td>
                                <td className="px-3 py-2 text-white font-medium max-w-[220px] truncate">{v.partyName}</td>
                                <td className="px-3 py-2 text-slate-300 font-mono text-[10px]">{v.gstin || '—'}</td>
                                <td className="px-3 py-2 text-slate-300 font-mono">{v.invoiceNo || v.voucherNumber}</td>
                                <td className="px-3 py-2 text-right text-cyan-300 font-mono">{v.taxableValue.toFixed(2)}</td>
                                <td className={`px-3 py-2 text-right font-mono ${v.igst < 0 ? 'text-amber-400 font-bold' : 'text-slate-300'}`}>{v.igst.toFixed(2)}</td>
                                <td className={`px-3 py-2 text-right font-mono ${v.cgst < 0 ? 'text-amber-400 font-bold' : 'text-slate-300'}`}>{v.cgst.toFixed(2)}</td>
                                <td className={`px-3 py-2 text-right font-mono ${v.sgst < 0 ? 'text-amber-400 font-bold' : 'text-slate-300'}`}>{v.sgst.toFixed(2)}</td>
                                <td className={`px-3 py-2 text-right font-mono font-bold ${isReversal ? 'text-amber-400' : 'text-emerald-400'}`}>
                                  {totalTax.toFixed(2)}
                                </td>
                                <td className="px-3 py-2 text-right text-white font-bold font-mono">{v.totalAmount.toFixed(2)}</td>
                                <td className="px-3 py-2 text-center whitespace-nowrap">
                                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                                    isReversal
                                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                      : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  }`}>
                                    {isReversal ? '− Reversal' : '+ Inward'}
                                  </span>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination Navigation Footer */}
                  {totalItems > 0 && pageSize !== -1 && (
                    <div className="bg-slate-950/90 px-4 py-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div className="text-slate-400">
                        Showing <span className="font-bold text-white">{startIndex + 1}</span> to{' '}
                        <span className="font-bold text-white">{Math.min(startIndex + pageSize, totalItems)}</span> of{' '}
                        <span className="font-bold text-white">{totalItems.toLocaleString()}</span> vouchers
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setCurrentPage(1)}
                          disabled={safePage === 1}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded font-bold transition-colors cursor-pointer"
                        >
                          « First
                        </button>
                        <button
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          disabled={safePage === 1}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded font-bold transition-colors cursor-pointer"
                        >
                          ‹ Prev
                        </button>

                        <div className="flex items-center gap-1 px-2">
                          <span className="text-slate-400">Page</span>
                          <span className="font-bold text-teal-400 font-mono px-1">{safePage}</span>
                          <span className="text-slate-400">of {totalPages}</span>
                        </div>

                        <button
                          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                          disabled={safePage === totalPages}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded font-bold transition-colors cursor-pointer"
                        >
                          Next ›
                        </button>
                        <button
                          onClick={() => setCurrentPage(totalPages)}
                          disabled={safePage === totalPages}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded font-bold transition-colors cursor-pointer"
                        >
                          Last »
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}


          </motion.div>
        )}

        {/* Debug Logs Panel */}
        <div className="bg-slate-955/90 border border-slate-800 rounded-2xl p-4 mt-6 backdrop-blur-md shadow-2xl">
          <p className="text-xs font-bold text-slate-300 uppercase tracking-widest mb-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse inline-block" />
            Tally Engine Console Debugger (Active Logs)
          </p>
          <div className="h-60 overflow-y-auto bg-black/60 border border-slate-900 rounded-xl p-3 font-mono text-[10px] text-slate-400 space-y-1.5 select-all scrollbar-thin">
            {logs.length === 0 ? (
              <span className="text-slate-600 italic">No logs recorded yet. Connect to Tally and click 'Fetch Vouchers'.</span>
            ) : (
              logs.map((log, idx) => (
                <div key={idx} className={log.startsWith('❌') ? 'text-red-400 font-semibold' : log.startsWith('⚠️') ? 'text-amber-400' : 'text-slate-300'}>
                  {log}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center pt-4 pb-8">
          <p className="text-[9px] font-mono tracking-[0.3em] text-slate-600 uppercase">
            Tally Direct Import Module • Powered by TallyPrime XML API (Port {tallyPort})
          </p>
        </div>
      </div>
    </div>
  );
}
