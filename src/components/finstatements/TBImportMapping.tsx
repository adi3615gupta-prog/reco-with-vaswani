import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Upload, FileSpreadsheet, Check, Search, X, AlertTriangle,
  Trash2, ChevronDown, ArrowUpDown, CheckCircle2, XCircle,
  Download, RotateCcw, Filter, Layers, Link2, Unlink2, Eye, EyeOff, Wand2, CopyPlus
} from 'lucide-react';
import { toast } from 'sonner';
import XLSX from 'xlsx-js-style';
import type { TrialBalanceEntry, MasterGroupCode, MappingWarning } from '@/lib/finStatements.types';
import {
  getMasterGroupCodes,
  getTrialBalance,
  saveTrialBalance,
  clearTrialBalance,
  countUnmappedEntries,
  updateTrialBalanceEntry,
  validateMappings,
  getClientSetup,
  aggregateNotes,
  computeBalanceCheck
} from '@/lib/finStatements.storage';
import {
  generateTallyGroupRequest,
  generateTallyLedgerRequest,
  parseTallyCollectionsToTrialBalance,
  resolveMappingCode,
  getFallbackPrimaryGroup
} from '@/lib/tallyParser';
import { getSmartSuggestion } from '@/lib/smartMapping';

interface Props {
  onDataChanged?: () => void;
  fullScreen?: boolean;
}

// ===================================================================
// TB COLUMN MAPPING TYPES
// ===================================================================
interface TBColumnMapping {
  ledger_name: string;
  cy_balance: string;
  py_balance: string;
  tally_primary_group: string;
  tally_parent_group: string;
}

const TB_KNOWN_HEADERS: Record<keyof TBColumnMapping, string[]> = {
  ledger_name: ['ledger', 'ledger name', 'account', 'account name', 'particulars', 'name', 'head', 'group', 'description', 'name of ledger'],
  cy_balance: ['current year', 'cy', 'cy balance', 'current year balance', 'closing balance', 'closing', 'balance', 'debit', 'amount', 'current year amount', 'cy amount', 'this year', '31 march 2025', '31 march'],
  py_balance: ['previous year', 'py', 'py balance', 'previous year balance', 'opening balance', 'opening', 'last year', 'previous year amount', 'py amount', 'last year balance'],
  tally_primary_group: ['primary group', 'system primary grouping', 'primary'],
  tally_parent_group: ['parent group', 'system parent grouping', 'parent'],
};

function detectTBMapping(headers: string[]): Partial<TBColumnMapping> {
  const mapping: Partial<TBColumnMapping> = {};
  const lower = headers.map((h) => h.toLowerCase().trim());
  for (const [field, aliases] of Object.entries(TB_KNOWN_HEADERS) as [keyof TBColumnMapping, string[]][]) {
    for (const alias of aliases) {
      const idx = lower.findIndex((h) => h === alias || h.includes(alias));
      if (idx !== -1 && !Object.values(mapping).includes(headers[idx])) {
        mapping[field] = headers[idx];
        break;
      }
    }
  }
  return mapping;
}

// ===================================================================
// MAIN COMPONENT
// ===================================================================
export default function TBImportMapping({ onDataChanged, fullScreen = false }: Props) {
  const [step, setStep] = useState<'upload' | 'map-columns' | 'map-codes'>('upload');
  const [parsedHeaders, setParsedHeaders] = useState<string[]>([]);
  const [parsedRows, setParsedRows] = useState<Record<string, unknown>[]>([]);
  const [columnMapping, setColumnMapping] = useState<Partial<TBColumnMapping>>({});
  const [tbEntries, setTbEntries] = useState<TrialBalanceEntry[]>([]);
  const [masterCodes, setMasterCodes] = useState<MasterGroupCode[]>([]);
  const [fileName, setFileName] = useState('');
  const [warnings, setWarnings] = useState<MappingWarning[]>([]);
  const [isTallySyncing, setIsTallySyncing] = useState(false);
  const [tallyPort, setTallyPort] = useState(9000);
  const [mappingDialogEntryId, setMappingDialogEntryId] = useState<string | null>(null);
  const [recentCodes, setRecentCodes] = useState<number[]>([]);
  // For group-assign dialog
  const [groupAssignKey, setGroupAssignKey] = useState<{primary:string;parent?:string} | null>(null);

  // Filters for the mapping grid
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'mapped' | 'unmapped'>('all');
  const [navNoteFilter, setNavNoteFilter] = useState<number | null>(null);
  const [sortField, setSortField] = useState<'ledger' | 'cy' | 'py' | 'code'>('ledger');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // Load existing data on mount
  useEffect(() => {
    setMasterCodes(getMasterGroupCodes());
    const existing = getTrialBalance();
    if (existing.length > 0) {
      setTbEntries(existing);
      setStep('map-codes');
    }

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'tally_cross_nav_filter' && e.newValue) {
        try {
          const payload = JSON.parse(e.newValue);
          if (payload.status === 'unmapped') {
            setFilterStatus('unmapped');
            setNavNoteFilter(null);
            setSearchTerm('');
            setStep('map-codes');
          } else if (payload.note !== undefined) {
            setNavNoteFilter(payload.note);
            setFilterStatus('all');
            setSearchTerm('');
            setStep('map-codes');
          }
        } catch (err) {}
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);



  // Refresh warnings when entries change
  useEffect(() => {
    if (tbEntries.length > 0) {
      setWarnings(validateMappings());
    }
  }, [tbEntries]);

  // Retroactively remove zero-balance ledgers (for users who already imported)
  useEffect(() => {
    if (tbEntries.length > 0) {
      const hasZero = tbEntries.some(e => Math.abs(e.cy_balance) < 0.01 && Math.abs(e.py_balance) < 0.01);
      if (hasZero) {
        const filtered = tbEntries.filter(e => !(Math.abs(e.cy_balance) < 0.01 && Math.abs(e.py_balance) < 0.01));
        setTbEntries(filtered);
        saveTrialBalance(filtered);
      }
    }
  }, [tbEntries]);

  // ---- STEP 1: FILE UPLOAD ----
  const handleFileUpload = async (file: File) => {
    try {
      setFileName(file.name);
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

      if (json.length === 0) {
        toast.error('The file is empty or could not be parsed.');
        return;
      }

      const headers = Object.keys(json[0]);
      setParsedHeaders(headers);
      setParsedRows(json);
      setColumnMapping(detectTBMapping(headers));
      setStep('map-columns');
      toast.success(`Parsed ${json.length} rows from "${file.name}"`);
    } catch (err) {
      console.error(err);
      toast.error('Failed to parse file. Ensure it is a valid CSV or Excel file.');
    }
  };
  // ---- TALLY SYNC ----
  const handleTallySync = async () => {
    try {
      setIsTallySyncing(true);
      toast.info(`Connecting to Tally on port ${tallyPort}...`, { duration: 2000 });
      
      const groupPayload = generateTallyGroupRequest();
      const ledgerPayload = generateTallyLedgerRequest();
      
      let groupXmlResponse = '';
      let ledgerXmlResponse = '';

      if (window.electronAPI?.fetchTallyData) {
        // Desktop App (Electron) Route
        groupXmlResponse = await window.electronAPI.fetchTallyData(tallyPort, groupPayload);
        ledgerXmlResponse = await window.electronAPI.fetchTallyData(tallyPort, ledgerPayload);
      } else {
        // Web Browser Route (Relies on Vite proxy to bypass CORS)
        const fetchTally = async (payload: string) => {
          const res = await fetch('/tally-api', {
            method: 'POST',
            headers: { 'Content-Type': 'text/xml;charset=utf-8' },
            body: payload
          });
          if (!res.ok) throw new Error(`Browser fetch failed: ${res.status} ${res.statusText}`);
          return res.text();
        };
        groupXmlResponse = await fetchTally(groupPayload);
        ledgerXmlResponse = await fetchTally(ledgerPayload);
      }
      
      if (!groupXmlResponse || !ledgerXmlResponse) {
        throw new Error('Received empty response from Tally.');
      }

      const entries = parseTallyCollectionsToTrialBalance(groupXmlResponse, ledgerXmlResponse);
      
      if (entries.length === 0) {
        console.error("TALLY RAW RESPONSE (Groups):", groupXmlResponse);
        console.error("TALLY RAW RESPONSE (Ledgers):", ledgerXmlResponse);
        throw new Error('Could not parse any ledgers from Tally response. See console for raw XML.');
      }

      // Automatically apply Client ID
      const clientSetup = getClientSetup();
      const clientId = clientSetup.client_id || 'default';
      entries.forEach(e => e.client_id = clientId);

      saveTrialBalance(entries);
      setTbEntries(entries);
      setStep('map-codes');
      onDataChanged();
      toast.success(`Synced ${entries.length} ledgers directly from Tally!`);
    } catch (err: unknown) {
      console.error(err);
      toast.error(`Tally Sync Failed: ${(err as Error).message || 'Ensure Tally is open and running on port 9000.'}`);
    } finally {
      setIsTallySyncing(false);
    }
  };
  // ---- STEP 2: COLUMN MAPPING ----
  const isMappingComplete = columnMapping.ledger_name && columnMapping.cy_balance;

  const handleImportToTB = () => {
    if (!columnMapping.ledger_name || !columnMapping.cy_balance) {
      toast.error('Please map at least Ledger Name and Current Year Balance.');
      return;
    }

    const clientSetup = getClientSetup();
    const clientId = clientSetup.client_id || 'default';

    const safeNum = (val: unknown): number => {
      if (typeof val === 'number') return Math.round(val * 100) / 100;
      if (!val) return 0;
      const n = parseFloat(String(val).replace(/[₹,\s]/g, ''));
      return isNaN(n) ? 0 : Math.round(n * 100) / 100;
    };

    const entries: TrialBalanceEntry[] = parsedRows
      .map((row, idx) => {
        const ledgerName = String(row[columnMapping.ledger_name!] || '').trim();
        if (!ledgerName) return null;
        
        const parentGroup = columnMapping.tally_parent_group ? String(row[columnMapping.tally_parent_group] || '').trim() : '';
        let primaryGroup = columnMapping.tally_primary_group ? String(row[columnMapping.tally_primary_group] || '').trim() : '';
        
        primaryGroup = getFallbackPrimaryGroup(parentGroup, primaryGroup);

        const mappedCode = resolveMappingCode(parentGroup, primaryGroup);

        let suggestedCode: number | undefined;
        let confidence: number | undefined;

        if (!mappedCode && masterCodes.length > 0) {
          const suggestion = getSmartSuggestion(ledgerName, masterCodes);
          if (suggestion) {
            suggestedCode = suggestion.group_code;
            confidence = suggestion.confidence;
          }
        }

          const cyBal = safeNum(row[columnMapping.cy_balance!]);
          const pyBal = columnMapping.py_balance ? safeNum(row[columnMapping.py_balance]) : 0;

          if (cyBal === 0 && pyBal === 0) return null;

          return {
            id: `tb_${Date.now()}_${idx}`,
            client_id: clientId,
            ledger_name: ledgerName,
            cy_balance: cyBal,
            py_balance: pyBal,
            mapped_group_code: mappedCode,
            tally_parent_group: parentGroup || undefined,
            tally_primary_group: primaryGroup || undefined,
            suggested_group_code: suggestedCode,
            suggestion_confidence: confidence,
          };
      })
      .filter(Boolean) as TrialBalanceEntry[];

    if (entries.length === 0) {
      toast.error('No valid ledger entries found. Check your column mapping.');
      return;
    }

    // Replace existing data
    saveTrialBalance(entries);
    setTbEntries(entries);
    setStep('map-codes');
    onDataChanged();
    toast.success(`Imported ${entries.length} ledger entries successfully!`);
  };

  // ---- STEP 3: CODE MAPPING ----

  const handleApplyAbove = (entryId: string) => {
    const idx = displayEntries.findIndex(e => e.id === entryId);
    if (idx <= 0) return;
    const above = displayEntries[idx - 1];
    if (!above.mapped_group_code) return;
    handleCodeMapping(entryId, above.mapped_group_code);
    toast.success('Copied mapping from row above');
  };

  const handleApplyToParent = (sourceId: string) => {
    const sourceEntry = tbEntries.find(e => e.id === sourceId);
    if (!sourceEntry || !sourceEntry.mapped_group_code) return;
    
    const parentGroup = sourceEntry.tally_parent_group;
    const code = sourceEntry.mapped_group_code;
    
    let count = 0;
    setTbEntries(prev => prev.map(e => {
      if (e.tally_parent_group === parentGroup && e.mapped_group_code === null) {
        count++;
        return { ...e, mapped_group_code: code, suggested_group_code: null };
      }
      return e;
    }));
  };

  const handleCodeMapping = (entryId: string, groupCode: number | null) => {
    const updated = tbEntries.map((e) =>
      e.id === entryId ? { ...e, mapped_group_code: groupCode } : e
    );
    setTbEntries(updated);
    saveTrialBalance(updated);
    updateTrialBalanceEntry(entryId, { mapped_group_code: groupCode });
    onDataChanged();
    if (groupCode !== null) {
      setRecentCodes(prev => {
        const filtered = prev.filter(c => c !== groupCode);
        return [groupCode, ...filtered].slice(0, 5);
      });
    }
  };

  const handleGroupAssign = (code: number, primary: string, parent?: string) => {
    let count = 0;
    const updated = tbEntries.map(e => {
      const matchesPrimary = e.tally_primary_group === primary;
      const matchesParent = parent ? e.tally_parent_group === parent : true;
      if (matchesPrimary && matchesParent && e.mapped_group_code === null) {
        count++;
        return { ...e, mapped_group_code: code, suggested_group_code: null };
      }
      return e;
    });
    setTbEntries(updated);
    saveTrialBalance(updated);
    onDataChanged();
    if (code !== null) setRecentCodes(prev => [code, ...prev.filter(c => c !== code)].slice(0, 5));
    setGroupAssignKey(null);
    toast.success(`Mapped ${count} ledger${count !== 1 ? 's' : ''} in "${parent || primary}"`);
  };

  const handleClearAllMappings = () => {
    const cleared = tbEntries.map((e) => ({ ...e, mapped_group_code: null }));
    setTbEntries(cleared);
    saveTrialBalance(cleared);
    onDataChanged();
    toast.info('All mappings cleared.');
  };

  const handleMagicMapAll = () => {
    let mappedCount = 0;
    const updated = tbEntries.map(e => {
      if (e.mapped_group_code) return e;
      // Use existing suggestion if confidence is decent
      if (e.suggested_group_code && (e.suggestion_confidence || 0) > 0.35) {
        mappedCount++;
        return { ...e, mapped_group_code: e.suggested_group_code };
      }
      // Try parent group name matching
      if (e.tally_parent_group && masterCodes.length > 0) {
        const parentLower = e.tally_parent_group.toLowerCase();
        const match = masterCodes.find(m =>
          m.particulars.toLowerCase().includes(parentLower) ||
          parentLower.includes(m.particulars.toLowerCase().split(' ')[0])
        );
        if (match) {
          mappedCount++;
          return { ...e, mapped_group_code: match.group_code };
        }
      }
      return e;
    });
    if (mappedCount > 0) {
      setTbEntries(updated);
      saveTrialBalance(updated);
      onDataChanged();
      toast.success(`Auto-mapped ${mappedCount} ledgers! ✨`);
    } else {
      toast.info('No matches found. Try manual mapping for remaining ledgers.');
    }
  };

  const handleClearTB = () => {
    clearTrialBalance();
    setTbEntries([]);
    setStep('upload');
    setParsedHeaders([]);
    setParsedRows([]);
    setColumnMapping({});
    setFileName('');
    onDataChanged();
    toast.info('Trial Balance data cleared.');
  };

  const handleDeleteEntry = (id: string) => {
    const filtered = tbEntries.filter((e) => e.id !== id);
    setTbEntries(filtered);
    saveTrialBalance(filtered);
    onDataChanged();
  };

  // Filtered and sorted entries
  const displayEntries = useMemo(() => {
    let entries = [...tbEntries];

    // Search filter
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      entries = entries.filter(
        (e) =>
          e.ledger_name.toLowerCase().includes(q) ||
          (e.mapped_group_code && e.mapped_group_code.toString().includes(q))
      );
    }

    // Status filter
    if (filterStatus === 'mapped') {
      entries = entries.filter((e) => e.mapped_group_code !== null);
    } else if (filterStatus === 'unmapped') {
      entries = entries.filter((e) => e.mapped_group_code === null);
    }

    // Cross window note filter
    if (navNoteFilter !== null) {
      const validCodes = masterCodes.filter(c => c.schedule_note_reference === navNoteFilter).map(c => c.group_code);
      entries = entries.filter(e => e.mapped_group_code !== null && validCodes.includes(e.mapped_group_code));
    }

    // Sort
    entries.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'ledger':
          cmp = a.ledger_name.localeCompare(b.ledger_name);
          break;
        case 'cy':
          cmp = a.cy_balance - b.cy_balance;
          break;
        case 'py':
          cmp = a.py_balance - b.py_balance;
          break;
        case 'code':
          cmp = (a.mapped_group_code || 0) - (b.mapped_group_code || 0);
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return entries;
  }, [tbEntries, searchTerm, filterStatus, navNoteFilter, sortField, sortDir, masterCodes]);


  const mappedCount = tbEntries.filter((e) => e.mapped_group_code !== null).length;
  const unmappedCount = tbEntries.length - mappedCount;

  const mappingProgress = tbEntries.length > 0 ? (mappedCount / tbEntries.length) * 100 : 0;

  // ===================================================================
  // RENDER
  // ===================================================================

  // STEP 1: Upload
  if (step === 'upload') {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Upload className="w-5 h-5 text-cyan-400" />
            Trial Balance Import
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Upload your raw Trial Balance file (CSV or Excel). The system will parse ledger names and balances.
          </p>
        </div>

        {/* Upload Zone */}
        <div
          className="rounded-2xl border-2 border-dashed border-slate-700/60 hover:border-cyan-500/40 bg-[rgba(15,23,42,0.45)] backdrop-blur-xl p-12 text-center cursor-pointer transition-all duration-300 group"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file) handleFileUpload(file);
          }}
        >
          <label className="cursor-pointer block">
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
              }}
              className="hidden"
            />
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <FileSpreadsheet className="w-8 h-8 text-cyan-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">
                  Drop your Trial Balance file here
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Supports .csv, .xlsx, .xls formats
                </p>
              </div>
              <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">
                Drag & Drop or Click to Browse
              </span>
            </div>
          </label>
        </div>

        {/* Tally Sync Option */}
        <div className="flex items-center justify-center gap-4">
          <div className="h-px bg-slate-800 flex-1"></div>
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">OR</span>
          <div className="h-px bg-slate-800 flex-1"></div>
        </div>

        <div className="rounded-2xl border border-white/5 bg-[rgba(15,23,42,0.45)] backdrop-blur-xl p-6 text-center transition-all hover:bg-white/[0.02]">
          <div className="flex items-center justify-center gap-3 mb-4">
            <label className="text-xs font-bold text-slate-400">Tally Port:</label>
            <input 
              type="number" 
              value={tallyPort}
              onChange={(e) => setTallyPort(Number(e.target.value) || 9000)}
              className="bg-slate-950/60 border border-slate-700/60 rounded flex text-white text-xs px-2 py-1 w-20 text-center focus:border-cyan-500/50 outline-none"
            />
          </div>
          <button
            onClick={handleTallySync}
            disabled={isTallySyncing}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-black uppercase tracking-wider shadow-lg shadow-emerald-600/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed mx-auto flex items-center gap-2"
          >
            {isTallySyncing ? (
              <>
                <RotateCcw className="w-4 h-4 animate-spin" /> Syncing with Tally...
              </>
            ) : (
              <>
                <Layers className="w-4 h-4" /> Direct Import from Tally
              </>
            )}
          </button>
          <p className="text-[10px] text-slate-500 mt-3">
            Tally must be open locally with the active company selected.
          </p>
        </div>

        {/* Expected Format */}
        <div className="rounded-xl bg-slate-900/40 border border-slate-800/60 p-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
            Expected Format
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-slate-800">
                  <th className="text-left py-2 px-3 font-bold">Ledger Name</th>
                  <th className="text-right py-2 px-3 font-bold">Current Year Balance</th>
                  <th className="text-right py-2 px-3 font-bold">Previous Year Balance</th>
                </tr>
              </thead>
              <tbody className="text-slate-400">
                <tr className="border-b border-slate-800/50">
                  <td className="py-1.5 px-3">Cash on Hand</td>
                  <td className="py-1.5 px-3 text-right font-mono">1,50,000</td>
                  <td className="py-1.5 px-3 text-right font-mono">1,20,000</td>
                </tr>
                <tr className="border-b border-slate-800/50">
                  <td className="py-1.5 px-3">Bank - SBI Current A/c</td>
                  <td className="py-1.5 px-3 text-right font-mono">5,45,230</td>
                  <td className="py-1.5 px-3 text-right font-mono">3,89,100</td>
                </tr>
                <tr>
                  <td className="py-1.5 px-3">Trade Receivables</td>
                  <td className="py-1.5 px-3 text-right font-mono">12,30,000</td>
                  <td className="py-1.5 px-3 text-right font-mono">8,75,000</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // STEP 2: Column Mapping
  if (step === 'map-columns') {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Link2 className="w-5 h-5 text-cyan-400" />
              Map Columns
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Map your file columns to the required fields. File: <span className="text-cyan-400 font-mono">{fileName}</span> ({parsedRows.length} rows)
            </p>
          </div>
          <button
            onClick={() => { setStep('upload'); setParsedHeaders([]); setParsedRows([]); }}
            className="px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-slate-400 hover:text-white text-[10px] font-bold uppercase tracking-wider transition-all"
          >
            <RotateCcw className="w-3 h-3 inline mr-1" /> Re-upload
          </button>
        </div>

        {/* Column Mapping Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {([
            { key: 'ledger_name' as const, label: 'Ledger Name', required: true, desc: 'The account / ledger head name' },
            { key: 'cy_balance' as const, label: 'CY Balance', required: true, desc: 'Closing balance for current year' },
            { key: 'py_balance' as const, label: 'PY Balance', required: false, desc: 'Closing balance for prior year (optional)' },
            { key: 'tally_primary_group' as const, label: 'Primary Group', required: false, desc: 'Tally primary grouping for auto-mapping' },
            { key: 'tally_parent_group' as const, label: 'Parent Group', required: false, desc: 'Tally parent grouping for auto-mapping' },
          ]).map((field) => (
            <div
              key={field.key}
              className="rounded-xl bg-[rgba(15,23,42,0.45)] backdrop-blur-xl border border-white/5 p-4"
            >
              <div className="flex items-center gap-2 mb-3">
                <span className={`text-[10px] font-black uppercase tracking-widest ${
                  columnMapping[field.key] ? 'text-emerald-400' : field.required ? 'text-amber-400' : 'text-slate-500'
                }`}>
                  {field.label}
                </span>
                {field.required && (
                  <span className="text-[7px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-bold uppercase">Required</span>
                )}
              </div>
              <p className="text-[9px] text-slate-600 mb-3">{field.desc}</p>
              <select
                value={columnMapping[field.key] || ''}
                onChange={(e) =>
                  setColumnMapping((prev) => ({ ...prev, [field.key]: e.target.value || undefined }))
                }
                className="w-full h-9 bg-slate-950/60 border border-slate-700/60 rounded-lg px-3 text-xs text-white appearance-none cursor-pointer focus:border-cyan-500/50 outline-none transition-all"
              >
                <option value="">— Select column —</option>
                {parsedHeaders.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
              {columnMapping[field.key] && (
                <div className="mt-2 flex items-center gap-1.5 text-[9px] text-emerald-400">
                  <Check className="w-3 h-3" /> Mapped to "{columnMapping[field.key]}"
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Preview */}
        <div className="rounded-xl bg-[rgba(15,23,42,0.45)] backdrop-blur-xl border border-white/5 overflow-hidden">
          <div className="px-4 py-3 border-b border-white/5">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Eye className="w-3.5 h-3.5" /> Preview (first 5 rows)
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-950/40">
                  {parsedHeaders.slice(0, 8).map((h) => (
                    <th
                      key={h}
                      className={`px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-left whitespace-nowrap ${
                        Object.values(columnMapping).includes(h)
                          ? 'text-cyan-400 bg-cyan-500/5'
                          : 'text-slate-600'
                      }`}
                    >
                      {h}
                      {Object.values(columnMapping).includes(h) && ' ✓'}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsedRows.slice(0, 5).map((row, i) => (
                  <tr key={i} className="border-t border-white/[0.03] hover:bg-white/[0.02]">
                    {parsedHeaders.slice(0, 8).map((h) => (
                      <td
                        key={h}
                        className={`px-3 py-2 whitespace-nowrap ${
                          Object.values(columnMapping).includes(h) ? 'text-white' : 'text-slate-600'
                        }`}
                      >
                        {String(row[h] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Import Button */}
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={handleImportToTB}
            disabled={!isMappingComplete}
            className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
              isMappingComplete
                ? 'bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white shadow-lg shadow-cyan-600/20 hover:scale-[1.02]'
                : 'bg-slate-800 text-slate-600 cursor-not-allowed'
            }`}
          >
            <Download className="w-4 h-4" />
            Import {parsedRows.length} Ledgers
          </button>
        </div>
      </div>
    );
  }

  // STEP 3: Master Code Mapping Grid
  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-cyan-400" />
            Ledger Mapping
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Map each ledger to a Schedule III group code using the dropdown.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleClearAllMappings}
            className="px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-slate-400 hover:text-amber-400 text-[10px] font-bold uppercase tracking-wider transition-all"
          >
            <Unlink2 className="w-3 h-3 inline mr-1" /> Clear Mappings
          </button>
          <button
            onClick={handleClearTB}
            className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 text-[10px] font-bold uppercase tracking-wider transition-all"
          >
            <Trash2 className="w-3 h-3 inline mr-1" /> Clear TB
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="rounded-xl bg-[rgba(15,23,42,0.45)] backdrop-blur-xl border border-white/5 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            Mapping Progress
          </span>
          <span className="text-xs font-mono font-bold text-white">
            {mappedCount} / {tbEntries.length}
            <span className="text-slate-500 ml-2">({mappingProgress.toFixed(0)}%)</span>
          </span>
        </div>
        <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ease-out ${
              mappingProgress === 100
                ? 'bg-gradient-to-r from-emerald-500 to-cyan-500'
                : 'bg-gradient-to-r from-cyan-600 to-teal-600'
            }`}
            style={{ width: `${mappingProgress}%` }}
          />
        </div>
        {unmappedCount > 0 && (
          <p className="text-[9px] text-amber-400 mt-2 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            {unmappedCount} ledger{unmappedCount !== 1 ? 's' : ''} still need mapping
          </p>
        )}
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="rounded-xl bg-amber-950/20 border border-amber-500/20 p-4">
          <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> Mapping Warnings ({warnings.length})
          </p>
          <div className="space-y-1.5 max-h-32 overflow-y-auto">
            {warnings.map((w, i) => (
              <p key={i} className="text-[10px] text-amber-300/80 leading-relaxed">
                • {w.message}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search ledgers..."
            className="w-full h-9 bg-slate-950/60 border border-slate-700/60 rounded-lg pl-9 pr-3 text-xs text-white placeholder:text-slate-600 focus:border-cyan-500/50 outline-none transition-all"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {navNoteFilter !== null && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-bold">
            <Layers className="w-3.5 h-3.5" />
            Filtering by Note {navNoteFilter}
            <button onClick={() => setNavNoteFilter(null)} className="ml-2 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="flex items-center rounded-lg bg-slate-950/60 border border-slate-700/60 overflow-hidden">
          {(['all', 'unmapped', 'mapped'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-all ${
                filterStatus === s ? 'bg-cyan-500/15 text-cyan-400' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {s === 'all' ? `All (${tbEntries.length})` : s === 'unmapped' ? `Unmapped (${unmappedCount})` : `Mapped (${mappedCount})`}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={handleMagicMapAll}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 hover:from-indigo-500/30 hover:to-purple-500/30 text-indigo-400 border border-indigo-500/30 rounded-lg text-xs font-bold uppercase tracking-wider transition-all shadow-[0_0_15px_rgba(99,102,241,0.15)] hover:shadow-[0_0_20px_rgba(99,102,241,0.25)]"
          >
            <Wand2 className="w-4 h-4" />
            Magic Map All
          </button>
          <button
            onClick={() => {
              window.open('#/live-preview', 'LivePreviewWindow', 'width=800,height=900,menubar=no,toolbar=no,location=no,status=no');
            }}
            className="flex items-center gap-2 px-4 py-2.5 border rounded-lg text-xs font-bold uppercase tracking-wider transition-all bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.15)]"
          >
            <Eye className="w-4 h-4" />
            Open Live Preview
          </button>
          {!fullScreen && (
            <button
              onClick={() => {
                window.open('#/mapping-fullscreen', '_blank');
              }}
              className="flex items-center gap-2 px-4 py-2.5 border rounded-lg text-xs font-bold uppercase tracking-wider transition-all bg-sky-500/15 text-sky-400 border-sky-500/30 hover:bg-sky-500/20 shadow-[0_0_15px_rgba(14,165,233,0.15)]"
              title="Pop out to a new full-screen tab"
            >
              <ArrowUpDown className="w-4 h-4 rotate-45" />
              Pop Out Grid
            </button>
          )}
        </div>
      </div>

      {/* Main Container */}
      <div className={`flex gap-4 transition-all duration-300 w-full ${fullScreen ? 'h-[calc(100vh-140px)]' : 'h-[75vh]'}`}>
        {/* Data Grid */}
        <div className="flex-1 rounded-xl bg-[rgba(15,23,42,0.45)] backdrop-blur-xl border border-white/5 overflow-hidden transition-all duration-300 flex flex-col min-w-0 shadow-2xl">
          <div className="flex-1 overflow-x-auto overflow-y-auto">
            <table className="w-full text-sm table-fixed">
              <thead className="sticky top-0 z-20">
              <tr className="bg-slate-950 h-10 border-b border-slate-800">
                <th className="px-1.5 py-2 text-left w-[2%] text-[9px] font-bold text-slate-500 uppercase tracking-wider">#</th>
                <th className="px-1.5 py-2 text-left w-[10%] text-[9px] font-bold text-slate-500 uppercase tracking-wider">Primary Grouping</th>
                <th className="px-1.5 py-2 text-left w-[10%] text-[9px] font-bold text-slate-500 uppercase tracking-wider">Parent Grouping</th>
                <th className="px-1.5 py-2 text-left w-[20%] text-[9px] font-bold text-slate-500 uppercase tracking-wider">Final Codes</th>
                <SortableHeader
                  label="Name of Ledger"
                  field="ledger"
                  currentField={sortField}
                  currentDir={sortDir}
                  onSort={(f, d) => { setSortField(f); setSortDir(d); }}
                  className="w-[17%] px-1.5 py-2 text-[9px]"
                />
                <SortableHeader
                  label="CY Balance"
                  field="cy"
                  currentField={sortField}
                  currentDir={sortDir}
                  onSort={(f, d) => { setSortField(f); setSortDir(d); }}
                  className="w-[9%] text-right px-1.5 py-2 text-[9px]"
                />
                <SortableHeader
                  label="PY Balance"
                  field="py"
                  currentField={sortField}
                  currentDir={sortDir}
                  onSort={(f, d) => { setSortField(f); setSortDir(d); }}
                  className="w-[9%] text-right px-1.5 py-2 text-[9px]"
                />
                <th className="px-1.5 py-2 text-left w-[10%] text-[9px] font-bold text-slate-500 uppercase tracking-wider">Face Grouping</th>
                <th className="px-1.5 py-2 text-left w-[10%] text-[9px] font-bold text-slate-500 uppercase tracking-wider">Note Grouping</th>
                <th className="px-1 py-2 text-center w-[3%] text-[9px] font-bold text-slate-500 uppercase tracking-wider">Act</th>
              </tr>
            </thead>
            <tbody
              onClickCapture={(e) => {
                const chipBtn = (e.target as HTMLElement).closest('[data-chip]');
                if (chipBtn) {
                  const code = parseInt((chipBtn as HTMLElement).dataset.chip || '');
                  const rowEl = (chipBtn as HTMLElement).closest('tr');
                  const idx = rowEl ? Array.from(rowEl.parentElement!.children).indexOf(rowEl) : -1;
                  if (!isNaN(code) && idx >= 0 && displayEntries[idx]) {
                    e.stopPropagation();
                    handleCodeMapping(displayEntries[idx].id, code);
                  }
                }
              }}
            >
              {displayEntries.map((entry, idx) => {
                const prev = displayEntries[idx - 1];
                const next = displayEntries[idx + 1];
                const isPrimaryFirst = !prev || prev.tally_primary_group !== entry.tally_primary_group;
                const isPrimaryLast  = !next || next.tally_primary_group !== entry.tally_primary_group;
                const isParentFirst  = !prev || prev.tally_parent_group  !== entry.tally_parent_group  || prev.tally_primary_group !== entry.tally_primary_group;
                const isParentLast   = !next || next.tally_parent_group  !== entry.tally_parent_group  || next.tally_primary_group !== entry.tally_primary_group;
                return (
                <TBRow
                  key={entry.id}
                  entry={entry}
                  index={idx + 1}
                  masterCodes={masterCodes}
                  warning={warnings.find((w) => w.ledger_name === entry.ledger_name)}
                  onOpenDialog={() => setMappingDialogEntryId(entry.id)}
                  onDelete={() => handleDeleteEntry(entry.id)}
                  onApplyToParent={() => handleApplyToParent(entry.id)}
                  onApplyAbove={idx > 0 && displayEntries[idx-1].mapped_group_code !== null ? () => handleApplyAbove(entry.id) : undefined}
                  quickChips={[
                    ...recentCodes.slice(0,3).map(c => masterCodes.find(m => m.group_code === c)).filter(Boolean) as MasterGroupCode[],
                    ...(entry.suggested_group_code && !recentCodes.includes(entry.suggested_group_code)
                      ? [masterCodes.find(m => m.group_code === entry.suggested_group_code)].filter(Boolean) as MasterGroupCode[]
                      : [])
                  ].slice(0,3)}
                  onGroupAssign={isPrimaryFirst ? (code: number) => handleGroupAssign(code, entry.tally_primary_group || '', entry.tally_parent_group) : undefined}
                  isPrimaryFirst={isPrimaryFirst}
                  isPrimaryLast={isPrimaryLast}
                  isParentFirst={isParentFirst}
                  isParentLast={isParentLast}
                />
                );
              })}
            </tbody>
          </table>
        </div>

        {displayEntries.length === 0 && (
          <div className="text-center py-12">
            <Search className="w-8 h-8 text-slate-700 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No matching ledgers found.</p>
          </div>
        )}
      </div>
    </div>

      {/* Summary */}
      <div className="flex items-center justify-between text-[10px] text-slate-500 px-1">
        <span>
          Showing {displayEntries.length} of {tbEntries.length} ledgers
        </span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-500" /> {mappedCount} mapped
          </span>
          <span className="flex items-center gap-1">
            <XCircle className="w-3 h-3 text-amber-500" /> {unmappedCount} unmapped
          </span>
        </span>
      </div>

      {/* Render Dialog */}
      <MappingDialog
        isOpen={mappingDialogEntryId !== null}
        onClose={() => setMappingDialogEntryId(null)}
        entry={tbEntries.find(e => e.id === mappingDialogEntryId) || null}
        masterCodes={masterCodes}
        onSelect={(code) => {
          if (mappingDialogEntryId) handleCodeMapping(mappingDialogEntryId, code);
        }}
      />
    </div>
  );
}

// ===================================================================
// SORTABLE HEADER
// ===================================================================
function SortableHeader({
  label,
  field,
  currentField,
  currentDir,
  onSort,
  className = '',
}: {
  label: string;
  field: 'ledger' | 'cy' | 'py' | 'code';
  currentField: string;
  currentDir: string;
  onSort: (field: 'ledger' | 'cy' | 'py' | 'code', dir: 'asc' | 'desc') => void;
  className?: string;
}) {
  const isActive = currentField === field;
  return (
    <th
      className={`px-2 py-4 text-[10px] font-bold uppercase tracking-wider cursor-pointer select-none transition-colors hover:text-cyan-400 ${
        isActive ? 'text-cyan-400' : 'text-slate-500'
      } ${className}`}
      onClick={() => onSort(field, isActive && currentDir === 'asc' ? 'desc' : 'asc')}
    >
      <span className="flex items-center gap-1.5">
        {label}
        <ArrowUpDown className="w-4 h-4" />
      </span>
    </th>
  );
}

// ===================================================================
// TB ROW with SEARCHABLE DROPDOWN
// ===================================================================
function TBRow({
  entry,
  index,
  masterCodes,
  onOpenDialog,
  onDelete,
  onApplyToParent,
  onApplyAbove,
  quickChips = [],
  onGroupAssign,
  warning,
  isPrimaryFirst,
  isParentFirst,
  isPrimaryLast,
  isParentLast,
}: {
  entry: TrialBalanceEntry;
  index: number;
  masterCodes: MasterGroupCode[];
  onOpenDialog: () => void;
  onDelete: () => void;
  onApplyToParent?: () => void;
  onApplyAbove?: () => void;
  quickChips?: MasterGroupCode[];
  onGroupAssign?: (code: number) => void;
  warning?: MappingWarning;
  isPrimaryFirst?: boolean;
  isParentFirst?: boolean;
  isPrimaryLast?: boolean;
  isParentLast?: boolean;
}) {
  const mappedEntry = entry.mapped_group_code
    ? masterCodes.find((m) => m.group_code === entry.mapped_group_code)
    : null;
  const isMapped = entry.mapped_group_code !== null;

  return (
    <tr
      className={`transition-all duration-300 group/row animate-fade-in ${
        isPrimaryFirst ? 'border-t-2 border-t-slate-700' : 'border-t border-white/[0.03]'
      } ${
        warning ? 'bg-amber-500/[0.04]' : isMapped ? 'hover:bg-emerald-500/[0.03]' : 'hover:bg-white/[0.015]'
      }`}
    >
      <td className="px-1.5 py-2 text-slate-500 font-mono text-[9px] sticky left-0 bg-[rgba(15,23,42,0.9)] backdrop-blur-md z-10">{index}</td>
      <td className={`px-1.5 align-top ${isPrimaryFirst ? 'pt-2.5' : 'pt-1'} ${isPrimaryLast ? 'pb-2.5' : 'pb-0'}`}>
        {isPrimaryFirst && (
          <div className="flex items-center gap-1 animate-fade-in group/pg">
            <div className="w-1 self-stretch rounded-full bg-gradient-to-b from-cyan-500 to-indigo-500 opacity-70 shrink-0" style={{minHeight:'14px'}} />
            <div className="text-[10px] font-bold text-cyan-400/80 line-clamp-2 leading-tight flex-1" title={entry.tally_primary_group || '-'}>
              {entry.tally_primary_group || '-'}
            </div>
            {onGroupAssign && (
              <button
                onClick={() => {
                  const code = window.prompt(`Map ALL unmapped under "${entry.tally_primary_group}" to code #:`);
                  const n = parseInt(code || '');
                  if (!isNaN(n)) onGroupAssign(n);
                }}
                className="opacity-0 group-hover/pg:opacity-100 transition-opacity p-0.5 rounded text-cyan-500 hover:bg-cyan-500/20 text-[8px] font-bold shrink-0"
                title="Assign one code to all unmapped in this primary group"
              >⚡</button>
            )}
          </div>
        )}
      </td>
      <td className={`px-1.5 align-top ${isParentFirst ? 'pt-2' : 'pt-1'} ${isParentLast ? 'pb-2' : 'pb-0'}`}>
        {isParentFirst && (
          <div className="flex items-center gap-1 animate-fade-in">
            <div className="w-0.5 self-stretch rounded-full bg-gradient-to-b from-slate-500 to-slate-700 shrink-0" style={{minHeight:'12px'}} />
            <div className="text-[10px] font-medium text-slate-400 line-clamp-2 leading-tight" title={entry.tally_parent_group || '-'}>
              {entry.tally_parent_group || '-'}
            </div>
          </div>
        )}
      </td>
      <td className="px-1.5 py-1 align-top">
        <button
          onClick={onOpenDialog}
          className={`w-full h-7 flex items-center gap-1.5 px-2 py-0.5 rounded border text-[10px] font-medium transition-all duration-200 text-left active:scale-[0.98] ${
            isMapped
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 hover:shadow-[0_0_12px_rgba(16,185,129,0.2)]'
              : entry.suggested_group_code
              ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.1)] hover:shadow-[0_0_20px_rgba(99,102,241,0.25)]'
              : 'bg-slate-950/60 border-slate-700 text-slate-400 hover:border-cyan-500/50 hover:bg-slate-900 hover:shadow-[0_0_10px_rgba(6,182,212,0.1)]'
          }`}
        >
          {isMapped && mappedEntry ? (
            <span className="flex items-center gap-2 truncate w-full">
              <span className="font-mono font-bold text-cyan-400 bg-cyan-500/10 px-1 py-0.5 rounded text-[10px] shrink-0">{mappedEntry.group_code}</span>
              <span className="truncate">{mappedEntry.particulars}</span>
            </span>
          ) : entry.suggested_group_code ? (
            <span className="flex items-center gap-2 truncate w-full text-indigo-400">
              <span className="font-mono font-bold bg-indigo-500/20 px-1 py-0.5 rounded text-[10px] shrink-0">{entry.suggested_group_code}</span>
              <span className="truncate">Suggestion</span>
            </span>
          ) : (
            <span className="truncate text-[9px]">— Select —</span>
          )}
        </button>
        {/* Quick Chips - only shown when not mapped */}
        {!isMapped && quickChips.length > 0 && (
          <div className="flex flex-wrap gap-0.5 mt-0.5">
            {quickChips.map(chip => (
              <button
                key={chip.group_code}
                onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
                onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
                onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
                onClickCapture={(e) => {
                  e.stopPropagation();
                  // call onOpenDialog equivalent - use a custom event
                  (e.target as HTMLButtonElement).dispatchEvent(new CustomEvent('quickchip', { detail: chip.group_code, bubbles: true }));
                }}
                data-chip={chip.group_code}
                className="text-[8px] px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-400 hover:bg-cyan-500/20 hover:border-cyan-500/40 hover:text-cyan-300 transition-all"
                title={chip.particulars}
              >
                {chip.group_code}
              </button>
            ))}
          </div>
        )}
      </td>
      <td className="px-1.5 py-2 align-top">
        <div className="flex items-start gap-2">
          <span className={`w-1.5 h-1.5 mt-1 rounded-full shrink-0 transition-all duration-500 ${isMapped ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]' : 'bg-slate-600'}`} />
          <span className={`text-[11px] font-semibold line-clamp-2 leading-tight ${isMapped ? 'text-white' : 'text-slate-300'}`} title={entry.ledger_name}>{entry.ledger_name}</span>
          {warning && <span className="text-amber-400" title={warning.message}>⚠</span>}
        </div>
      </td>
      <td className="px-1.5 py-2 text-right align-top">
        <div className={`text-[10px] font-mono whitespace-nowrap ${entry.cy_balance >= 0 ? 'text-slate-300' : 'text-red-400'}`}>
          {entry.cy_balance < 0 ? '-' : ''}₹{Math.abs(entry.cy_balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </div>
      </td>
      <td className="px-1.5 py-2 text-right align-top">
        <div className={`text-[10px] font-mono whitespace-nowrap ${entry.py_balance >= 0 ? 'text-slate-400' : 'text-red-400'}`}>
          {entry.py_balance < 0 ? '-' : ''}₹{Math.abs(entry.py_balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </div>
      </td>
      <td className="px-1.5 py-2 align-top">
        <div className="text-[10px] text-slate-400 line-clamp-2 leading-tight" title={mappedEntry?.statement_category || '-'}>{mappedEntry?.statement_category || '-'}</div>
      </td>
      <td className="px-1.5 py-2 align-top">
        <div className="text-[10px] text-slate-400 line-clamp-2 leading-tight" title={mappedEntry?.particulars || '-'}>{mappedEntry?.particulars || '-'}</div>
      </td>
      <td className="px-1 py-2 text-center align-top sticky right-0 bg-[rgba(15,23,42,0.9)] backdrop-blur-md z-10 border-l border-white/5">
        <div className="flex items-center justify-center gap-0.5 flex-wrap">
          {onApplyAbove && !isMapped && (
            <button
              onClick={onApplyAbove}
              className="p-1 rounded text-violet-400 hover:text-violet-300 hover:bg-violet-500/10 transition-all duration-200 hover:scale-110 active:scale-95"
              title="Copy mapping from row above"
            >
              <span className="text-[10px] font-bold leading-none">↑</span>
            </button>
          )}
          {isMapped && onApplyToParent && (
            <button
              onClick={onApplyToParent}
              className="p-1 rounded text-cyan-500 hover:text-cyan-400 hover:bg-cyan-500/10 transition-all duration-200 hover:scale-110 active:scale-95"
              title={`Apply to all unmapped under "${entry.tally_parent_group}"`}
            >
              <CopyPlus className="w-2.5 h-2.5" />
            </button>
          )}
          <button onClick={onDelete} className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200 hover:scale-110 active:scale-95" title="Delete">
            <Trash2 className="w-2.5 h-2.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ===================================================================
// MAPPING DIALOG (MODAL)
// ===================================================================
function MappingDialog({
  isOpen,
  onClose,
  onSelect,
  masterCodes,
  entry
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (code: number | null) => void;
  masterCodes: MasterGroupCode[];
  entry: TrialBalanceEntry | null;
}) {
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const filteredCodes = useMemo(() => {
    if (!search.trim()) return masterCodes;
    const q = search.toLowerCase();
    return masterCodes.filter(
      (m) =>
        m.particulars.toLowerCase().includes(q) ||
        m.group_code.toString().includes(q) ||
        m.statement_category.toLowerCase().includes(q)
    );
  }, [masterCodes, search]);

  if (!isOpen || !entry) return null;
  const isMapped = entry.mapped_group_code !== null;


  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm" style={{animation:'fadeInBackdrop 0.18s ease'}}>
      <div className="w-full max-w-2xl bg-gradient-to-b from-slate-900 to-slate-950 border border-white/10 rounded-2xl shadow-[0_25px_80px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden max-h-[85vh]" style={{animation:'slideUpDialog 0.22s cubic-bezier(0.34,1.56,0.64,1)'}}>
        <style>{'`@keyframes fadeInBackdrop{from{opacity:0}to{opacity:1}}@keyframes slideUpDialog{from{opacity:0;transform:translateY(20px) scale(0.97)}to{opacity:1;transform:translateY(0) scale(1)}}`'}</style>
        
        {/* Header & Search */}
        <div className="p-4 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-bold text-white">Select Group Code</h3>
              <p className="text-sm text-slate-400">Mapping for: <span className="text-cyan-400 font-medium">{entry.ledger_name}</span></p>
            </div>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-cyan-500" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && filteredCodes.length > 0) {
                  onSelect(filteredCodes[0].group_code);
                  onClose();
                }
                if (e.key === 'Escape') onClose();
              }}
              placeholder="Search master codes or particulars..."
              className="w-full h-12 bg-slate-950 border-2 border-cyan-500/30 focus:border-cyan-500 rounded-xl pl-10 pr-4 text-sm font-medium text-white placeholder:text-slate-500 outline-none shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)] transition-all"
            />
          </div>
        </div>

        {/* Options List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1 bg-slate-950/30">
          {isMapped && (
            <button
              onClick={() => { onSelect(null); onClose(); }}
              className="w-full p-4 text-left text-sm font-medium text-red-400 hover:bg-red-500/10 rounded-xl flex items-center gap-3 transition-colors mb-2 border border-red-500/20"
            >
              <XCircle className="w-5 h-5" /> Clear Current Mapping
            </button>
          )}
          
          {filteredCodes.map((m) => {
            const isSelected = entry.mapped_group_code === m.group_code;
            return (
              <button
                key={m.group_code}
                onClick={() => { onSelect(m.group_code); onClose(); }}
                className={`w-full p-4 text-left rounded-xl flex items-center gap-4 transition-all duration-150 border active:scale-[0.99] ${
                  isSelected
                    ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.1)]'
                    : 'bg-slate-900/60 border-transparent hover:bg-slate-800 hover:border-slate-600 hover:shadow-[0_4px_20px_rgba(0,0,0,0.3)] text-slate-300'
                }`}
              >
                <div className={`flex items-center justify-center w-14 h-10 rounded-lg font-mono font-bold text-sm shrink-0 ${
                  isSelected ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-950 text-slate-400'
                }`}>
                  {m.group_code}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate text-[15px]">{m.particulars}</div>
                  <div className="text-xs text-slate-500 truncate mt-0.5">{m.statement_category}</div>
                </div>
                
                <div className={`px-3 py-1.5 rounded-lg font-bold text-xs shrink-0 ${
                  m.statement_type === 'BS' ? 'bg-blue-500/10 text-blue-400' : 'bg-purple-500/10 text-purple-400'
                }`}>
                  {m.statement_type} - N{m.note_reference}
                </div>
              </button>
            );
          })}
          
          {filteredCodes.length === 0 && (
            <div className="text-center py-12">
              <Search className="w-12 h-12 text-slate-700 mx-auto mb-4" />
              <p className="text-slate-400 font-medium">No master codes found matching "{search}"</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
