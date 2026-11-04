import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft, Download, Save, RefreshCw, CheckCircle2, AlertTriangle,
  Search, ShieldCheck, CheckSquare, Square, X, Filter, Sparkles,
  Info, ExternalLink, HelpCircle, Layers, ArrowUpRight, Clock,
  FileSpreadsheet, Loader2, Tag, ChevronDown, Lock
} from 'lucide-react';
import { toast } from 'sonner';
import { getApiBase, safeApiFetch } from '@/lib/api';

export type StatutoryTargetTable = 
  | '4A5'       // All Other ITC (Eligible)
  | '4B2'       // Temporary Reversals (Rule 37 180-days, Goods in transit - Reclaimable)
  | '4D1'       // Ineligible ITC: Section 17(5) Blocked Credit
  | '4D2'       // Ineligible ITC: Section 16(4) Time-Barred / POS Restricted
  | '4B1'       // Permanent Reversals (Rule 38, 42, 43 - Non-reclaimable)
  | '4A3'       // Inward RCM Supplies
  | '4A1'       // Import of Goods
  | 'DEFERRED'; // Held / Carried forward

export interface CategorySummary {
  count: number;
  taxable: number;
  igst: number;
  cgst: number;
  sgst: number;
  cess: number;
  total: number;
}

export interface AllocationSummary {
  totalInvoices: number;
  totalTaxable: number;
  totalTax: number;
  eligible_4a5: CategorySummary;
  temporary_4b2: CategorySummary;
  permanent_4b1: CategorySummary;
  ineligible_4d1: CategorySummary;
  ineligible_4d2: CategorySummary;
  rcm_4a3: CategorySummary;
  import_4a1: CategorySummary;
  deferred: CategorySummary;
}

export interface Gstr2bInvoiceRow {
  id: string;
  batchId?: string;
  clientGstin: string;
  returnPeriod: string;
  section: string;
  ctin: string;
  supplierName: string;
  invoiceNo: string;
  invoiceDate: string;
  invoiceType: string;
  pos?: string;
  reverseCharge: string;
  itcAvailable: string;
  itcReason?: string;
  txval: number;
  igst: number;
  cgst: number;
  sgst: number;
  cess: number;
  totalVal: number;
  totalTax: number;
  targetTable: StatutoryTargetTable;
  notes: string;
  allocatedBy?: string;
  allocatedAt?: number | null;
}

export interface Gstr3bItcAllocationWorkbenchProps {
  clientGstin: string;
  clientName?: string;
  returnPeriod: string;
  onBack: () => void;
  onApplyAllocations: (summary: AllocationSummary, invoices: Gstr2bInvoiceRow[]) => void;
  isLocked?: boolean;
}

const emptyCat = (): CategorySummary => ({ count: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, total: 0 });

const TARGET_TABLE_OPTIONS: { id: StatutoryTargetTable; label: string; shortLabel: string; table: string; color: string; desc: string }[] = [
  { id: '4A5', label: 'Eligible ITC (Claimed)', shortLabel: '4(A)(5) Eligible', table: 'Table 4(A)(5)', color: 'bg-emerald-50 text-emerald-800 border-emerald-300', desc: 'All other ITC - Inward supplies eligible for set-off' },
  { id: '4B2', label: 'Temporary Reversal (Reclaimable)', shortLabel: '4(B)(2) Temp Reversal', table: 'Table 4(B)(2)', color: 'bg-indigo-50 text-indigo-800 border-indigo-300', desc: 'Rule 37 180-days unpaid / goods not received / disputes - Reclaimable in future 3B' },
  { id: '4D1', label: 'Ineligible u/s 17(5) Blocked', shortLabel: '4(D)(1) Blocked', table: 'Table 4(D)(1)', color: 'bg-rose-50 text-rose-800 border-rose-300', desc: 'Motor vehicles, catering, club membership, personal consumption' },
  { id: '4D2', label: 'Ineligible u/s 16(4) Time-Barred', shortLabel: '4(D)(2) Time-Barred', table: 'Table 4(D)(2)', color: 'bg-amber-50 text-amber-800 border-amber-300', desc: 'Cutoff passed (Nov 30) or recipient state restriction' },
  { id: '4B1', label: 'Permanent Reversal Rule 38/42/43', shortLabel: '4(B)(1) Perm Reversal', table: 'Table 4(B)(1)', color: 'bg-purple-50 text-purple-800 border-purple-300', desc: 'Non-reclaimable common credit reversals for exempt supplies' },
  { id: '4A3', label: 'Inward RCM Supplies', shortLabel: '4(A)(3) RCM', table: 'Table 4(A)(3)', color: 'bg-blue-50 text-blue-800 border-blue-300', desc: 'Reverse charge supplies paid in cash & claimed as ITC' },
  { id: '4A1', label: 'Import of Goods', shortLabel: '4(A)(1) Import', table: 'Table 4(A)(1)', color: 'bg-cyan-50 text-cyan-800 border-cyan-300', desc: 'Customs ICEGATE / CBW bills of entry' },
  { id: 'DEFERRED', label: 'Deferred / On Hold', shortLabel: 'Deferred (Hold)', table: 'Held', color: 'bg-slate-100 text-slate-700 border-slate-300', desc: 'Excluded from current 3B - Carried forward' },
];

export default function Gstr3bItcAllocationWorkbench({
  clientGstin,
  clientName,
  returnPeriod,
  onBack,
  onApplyAllocations,
  isLocked = false
}: Gstr3bItcAllocationWorkbenchProps) {
  const [invoices, setInvoices] = useState<Gstr2bInvoiceRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'all' | '4A5' | '4B2' | '4D' | '4B1' | '4A3' | 'DEFERRED'>('all');

  // Load invoices and allocations from server API
  const fetchAllocations = async () => {
    if (!clientGstin || !returnPeriod || clientGstin === 'Not Specified' || clientGstin.length < 5) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await safeApiFetch(`/api/gstr3b/itc-allocations/${encodeURIComponent(clientGstin)}?period=${encodeURIComponent(returnPeriod)}`);
      const data = await res.json();
      if (data && data.success) {
        setInvoices(data.invoices || []);
      } else {
        toast.error(data?.error || 'Failed to fetch GSTR-2B invoices');
      }
    } catch (err: any) {
      console.error('[ITC Workbench] Fetch error:', err);
      toast.error('Network error loading GSTR-2B invoices');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllocations();
  }, [clientGstin, returnPeriod]);

  // Recalculate summary metrics dynamically from current in-memory invoices
  const summary: AllocationSummary = useMemo(() => {
    const s: AllocationSummary = {
      totalInvoices: invoices.length,
      totalTaxable: 0,
      totalTax: 0,
      eligible_4a5: emptyCat(),
      temporary_4b2: emptyCat(),
      permanent_4b1: emptyCat(),
      ineligible_4d1: emptyCat(),
      ineligible_4d2: emptyCat(),
      rcm_4a3: emptyCat(),
      import_4a1: emptyCat(),
      deferred: emptyCat()
    };

    for (const inv of invoices) {
      s.totalTaxable += inv.txval || 0;
      s.totalTax += inv.totalTax || 0;

      let cat: CategorySummary;
      switch (inv.targetTable) {
        case '4A5': cat = s.eligible_4a5; break;
        case '4B2': cat = s.temporary_4b2; break;
        case '4B1': cat = s.permanent_4b1; break;
        case '4D1': cat = s.ineligible_4d1; break;
        case '4D2': cat = s.ineligible_4d2; break;
        case '4A3': cat = s.rcm_4a3; break;
        case '4A1': cat = s.import_4a1; break;
        case 'DEFERRED': cat = s.deferred; break;
        default: cat = s.eligible_4a5; break;
      }

      cat.count += 1;
      cat.taxable += inv.txval || 0;
      cat.igst += inv.igst || 0;
      cat.cgst += inv.cgst || 0;
      cat.sgst += inv.sgst || 0;
      cat.cess += inv.cess || 0;
      cat.total += inv.totalTax || 0;
    }

    // Round all metrics to 2 decimal places
    const round2 = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;
    s.totalTaxable = round2(s.totalTaxable);
    s.totalTax = round2(s.totalTax);
    [s.eligible_4a5, s.temporary_4b2, s.permanent_4b1, s.ineligible_4d1, s.ineligible_4d2, s.rcm_4a3, s.import_4a1, s.deferred].forEach(c => {
      c.taxable = round2(c.taxable);
      c.igst = round2(c.igst);
      c.cgst = round2(c.cgst);
      c.sgst = round2(c.sgst);
      c.cess = round2(c.cess);
      c.total = round2(c.total);
    });

    return s;
  }, [invoices]);

  // Combined Ineligible total (4D1 + 4D2)
  const ineligibleCombined = useMemo(() => {
    return {
      count: (summary.ineligible_4d1.count || 0) + (summary.ineligible_4d2.count || 0),
      total: Math.round(((summary.ineligible_4d1.total || 0) + (summary.ineligible_4d2.total || 0)) * 100) / 100
    };
  }, [summary]);

  // Filtered invoices based on search and active tab
  const filteredInvoices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return invoices.filter(inv => {
      // 1. Search Query Filter
      if (q) {
        const matchesCtin = (inv.ctin || '').toLowerCase().includes(q);
        const matchesName = (inv.supplierName || '').toLowerCase().includes(q);
        const matchesInum = (inv.invoiceNo || '').toLowerCase().includes(q);
        const matchesNotes = (inv.notes || '').toLowerCase().includes(q);
        if (!matchesCtin && !matchesName && !matchesInum && !matchesNotes) return false;
      }

      // 2. Tab Filter
      if (activeTab === 'all') return true;
      if (activeTab === '4A5') return inv.targetTable === '4A5';
      if (activeTab === '4B2') return inv.targetTable === '4B2';
      if (activeTab === '4D') return inv.targetTable === '4D1' || inv.targetTable === '4D2';
      if (activeTab === '4B1') return inv.targetTable === '4B1';
      if (activeTab === '4A3') return inv.targetTable === '4A3' || inv.targetTable === '4A1';
      if (activeTab === 'DEFERRED') return inv.targetTable === 'DEFERRED';

      return true;
    });
  }, [invoices, searchQuery, activeTab]);

  // Helper to persist allocations directly to backend SQLite
  const persistAllocations = async (itemsToSave: { invoiceId: string; targetTable: StatutoryTargetTable; notes?: string }[], showToast = false) => {
    if (!itemsToSave.length || !clientGstin) return false;
    try {
      const payload = {
        clientGstin,
        returnPeriod,
        allocations: itemsToSave.map(item => ({
          invoiceId: item.invoiceId,
          targetTable: item.targetTable,
          notes: item.notes || ''
        }))
      };
      const res = await safeApiFetch('/api/gstr3b/itc-allocations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data && data.success) {
        if (showToast) toast.success(`Saved allocations for ${data.updatedCount || itemsToSave.length} vouchers to database!`);
        return true;
      }
    } catch (err: any) {
      console.error('[ITC Workbench] Auto-save error:', err);
    }
    return false;
  };

  // Change individual invoice destination & auto-persist
  const handleUpdateSingleInvoice = (id: string, targetTable: StatutoryTargetTable, notes?: string, persistNow = true) => {
    if (isLocked) {
      toast.error('Working Sheet is Locked', { description: 'Unlock 3B Working Sheet to reallocate vouchers.' });
      return;
    }
    setInvoices(prev => prev.map(inv => {
      if (inv.id === id) {
        return {
          ...inv,
          targetTable,
          notes: notes !== undefined ? notes : inv.notes,
          allocatedBy: 'User',
          allocatedAt: Date.now()
        };
      }
      return inv;
    }));

    if (persistNow) {
      persistAllocations([{ invoiceId: id, targetTable, notes }]);
    }
  };

  // Bulk move selected invoices to destination & auto-persist
  const handleBulkMove = (targetTable: StatutoryTargetTable, defaultNote?: string) => {
    if (isLocked) {
      toast.error('Working Sheet is Locked', { description: 'Unlock 3B Working Sheet to bulk move vouchers.' });
      return;
    }
    if (selectedIds.size === 0) return;
    const itemsToSave: { invoiceId: string; targetTable: StatutoryTargetTable; notes?: string }[] = [];
    setInvoices(prev => prev.map(inv => {
      if (selectedIds.has(inv.id)) {
        const finalNote = defaultNote ? defaultNote : inv.notes;
        itemsToSave.push({ invoiceId: inv.id, targetTable, notes: finalNote });
        return {
          ...inv,
          targetTable,
          notes: finalNote,
          allocatedBy: 'User',
          allocatedAt: Date.now()
        };
      }
      return inv;
    }));

    // Auto-save all bulk moved items immediately to backend
    persistAllocations(itemsToSave, false);
    toast.success(`Moved ${selectedIds.size} vouchers to ${targetTable} & saved to database!`);
    setSelectedIds(new Set());
  };

  // Select / Deselect All
  const handleSelectAllFiltered = () => {
    if (selectedIds.size === filteredInvoices.length && filteredInvoices.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredInvoices.map(i => i.id)));
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Save current allocations to SQLite
  const handleSaveToBackend = async (showToast = true, customInvoices?: Gstr2bInvoiceRow[]) => {
    if (isLocked) {
      if (showToast) toast.error('Working Sheet is Locked', { description: 'Unlock 3B Working Sheet to save allocations.' });
      return false;
    }
    setSaving(true);
    const targetList = customInvoices || invoices;
    try {
      const payload = {
        clientGstin,
        returnPeriod,
        allocations: targetList.map(i => ({
          invoiceId: i.id,
          targetTable: i.targetTable,
          notes: i.notes || ''
        }))
      };
      const res = await safeApiFetch(`/api/gstr3b/itc-allocations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data && data.success) {
        if (showToast) toast.success(`Saved allocations for ${data.updatedCount || targetList.length} vouchers to database!`);
        return true;
      } else {
        toast.error(data?.error || 'Failed saving allocations');
        return false;
      }
    } catch (err: any) {
      console.error('[ITC Workbench] Save error:', err);
      toast.error('Network error saving allocations');
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Export Zero-Merge Excel Audit Annexure
  const handleExportExcel = () => {
    const apiBase = getApiBase();
    const url = `${apiBase}/api/gstr3b/export-itc-allocations?gstin=${encodeURIComponent(clientGstin)}&period=${encodeURIComponent(returnPeriod)}&clientName=${encodeURIComponent(clientName || '')}`;
    window.open(url, '_blank');
  };

  // Apply to 3B Working Sheet and return to Table 4 view
  const handleApplyTo3b = async () => {
    if (isLocked) {
      toast.error('Working Sheet is Locked', { description: 'Unlock 3B Working Sheet to apply allocations.' });
      return;
    }
    await handleSaveToBackend(false);
    onApplyAllocations(summary, invoices);
  };

  // Handle navigation back to main GSTR-3B sheet: auto-save and sync allocations
  const handleBack = async () => {
    if (!isLocked) {
      await handleSaveToBackend(false);
      onApplyAllocations(summary, invoices);
    }
    onBack();
  };

  const formatCurrency = (val: number) => {
    return '₹' + (val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const totalAllocated = 
    summary.eligible_4a5.total + 
    summary.temporary_4b2.total + 
    summary.permanent_4b1.total + 
    summary.ineligible_4d1.total + 
    summary.ineligible_4d2.total + 
    summary.rcm_4a3.total + 
    summary.import_4a1.total + 
    summary.deferred.total;

  const isReconciled = Math.abs(totalAllocated - summary.totalTax) < 0.05;

  return (
    <div className="w-full bg-slate-50 min-h-[calc(100vh-140px)] p-4 sm:p-6 space-y-5 animate-in fade-in duration-200">
      
      {/* ─── STICKY TOP NAVIGATION BAR ────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 sticky top-2 z-20">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors cursor-pointer shadow-xs"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>← Back to GSTR-3B Working Sheet</span>
          </button>
          
          <div className="h-5 w-px bg-slate-200 hidden sm:block" />

          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900 text-sm">{clientName || 'Client'}</span>
              <span className="text-[11px] font-mono bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded font-semibold">
                {clientGstin}
              </span>
              <span className="text-[11px] bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded-full font-medium">
                Period: <strong className="text-slate-900">{returnPeriod}</strong>
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Voucher-Level GSTR-2B Inward ITC Allocation, Statutory Reversals & Audit Defense Workbench
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end md:self-auto flex-wrap">
          {isLocked && (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-300 px-2.5 py-1 rounded-lg">
              <Lock className="w-3.5 h-3.5 text-rose-600" />
              <span>Locked (Read-Only)</span>
            </span>
          )}

          {isReconciled ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>100% Reconciled ({summary.totalInvoices} Bills)</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-300 px-2.5 py-1 rounded-lg">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              <span>Reconciliation Diff: {formatCurrency(Math.abs(totalAllocated - summary.totalTax))}</span>
            </span>
          )}

          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors cursor-pointer shadow-xs"
            title="Download multi-tab audit workbook strictly enforcing zero merged cells"
          >
            <Download className="w-3.5 h-3.5 text-slate-600" />
            <span>Export Audit Sheet</span>
          </button>

          <button
            type="button"
            onClick={() => handleSaveToBackend(true)}
            disabled={isLocked || saving}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors cursor-pointer shadow-xs ${
              isLocked || saving ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5 text-indigo-600" />}
            <span>Save Allocations</span>
          </button>

          <button
            type="button"
            onClick={handleApplyTo3b}
            disabled={isLocked || saving}
            className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 rounded-lg shadow-sm transition-all cursor-pointer ${
              isLocked || saving ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Apply Allocations & Recalculate 3B</span>
          </button>
        </div>
      </div>

      {/* ─── KPI METRIC SUMMARY CARDS ────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {/* Total 2B */}
        <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Total 2B Inward</div>
          <div className="text-base font-bold text-slate-900 mt-1 tabular-nums">{formatCurrency(summary.totalTax)}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">{summary.totalInvoices} Bills (Taxable {formatCurrency(summary.totalTaxable)})</div>
        </div>

        {/* 4(A)(5) Eligible */}
        <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">4(A)(5) Eligible</span>
            <span className="text-[9px] bg-emerald-200 text-emerald-900 font-bold px-1.5 py-0.2 rounded">Claimed</span>
          </div>
          <div className="text-base font-bold text-emerald-900 mt-1 tabular-nums">{formatCurrency(summary.eligible_4a5.total)}</div>
          <div className="text-[11px] text-emerald-700 mt-0.5">{summary.eligible_4a5.count} Bills (Pushed to 4A5)</div>
        </div>

        {/* 4(B)(2) Temporary Reversal */}
        <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-800">4(B)(2) Temp Rev</span>
            <span className="text-[9px] bg-indigo-200 text-indigo-900 font-bold px-1.5 py-0.2 rounded">Reclaimable</span>
          </div>
          <div className="text-base font-bold text-indigo-900 mt-1 tabular-nums">{formatCurrency(summary.temporary_4b2.total)}</div>
          <div className="text-[11px] text-indigo-700 mt-0.5">{summary.temporary_4b2.count} Bills (Rule 37 / Transit)</div>
        </div>

        {/* 4(D) Ineligible */}
        <div className="bg-rose-50/60 border border-rose-200 rounded-xl p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-800">4(D) Ineligible</span>
            <span className="text-[9px] bg-rose-200 text-rose-900 font-bold px-1.5 py-0.2 rounded">Blocked</span>
          </div>
          <div className="text-base font-bold text-rose-900 mt-1 tabular-nums">{formatCurrency(ineligibleCombined.total)}</div>
          <div className="text-[11px] text-rose-700 mt-0.5">{ineligibleCombined.count} Bills (Sec 17(5) / 16(4))</div>
        </div>

        {/* 4(B)(1) Permanent Reversal */}
        <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800">4(B)(1) Perm Rev</span>
            <span className="text-[9px] bg-amber-200 text-amber-900 font-bold px-1.5 py-0.2 rounded">Non-Reclaim</span>
          </div>
          <div className="text-base font-bold text-amber-900 mt-1 tabular-nums">{formatCurrency(summary.permanent_4b1.total)}</div>
          <div className="text-[11px] text-amber-700 mt-0.5">{summary.permanent_4b1.count} Bills (Rule 38/42/43)</div>
        </div>

        {/* 4(A)(3) RCM */}
        <div className="bg-blue-50/60 border border-blue-200 rounded-xl p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-800">4(A)(3) RCM</span>
            <span className="text-[9px] bg-blue-200 text-blue-900 font-bold px-1.5 py-0.2 rounded">RCM Paid</span>
          </div>
          <div className="text-base font-bold text-blue-900 mt-1 tabular-nums">{formatCurrency(summary.rcm_4a3.total)}</div>
          <div className="text-[11px] text-blue-700 mt-0.5">{summary.rcm_4a3.count} Bills (Table 3.1d & 4A3)</div>
        </div>

        {/* Deferred */}
        <div className="bg-slate-100/70 border border-slate-300 rounded-xl p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700">Deferred / Hold</span>
            <span className="text-[9px] bg-slate-200 text-slate-800 font-bold px-1.5 py-0.2 rounded">Hold</span>
          </div>
          <div className="text-base font-bold text-slate-800 mt-1 tabular-nums">{formatCurrency(summary.deferred.total)}</div>
          <div className="text-[11px] text-slate-600 mt-0.5">{summary.deferred.count} Bills (Carried Fwd)</div>
        </div>
      </div>

      {/* ─── STATUTORY CATEGORY TABS (SELECTION & QUICK FILTER) ───────────── */}
      <div className="bg-white border border-slate-200 rounded-xl p-2 shadow-2xs flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setActiveTab('all')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'all'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <span>All Bills</span>
          <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${activeTab === 'all' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'}`}>
            {summary.totalInvoices}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('4A5')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === '4A5'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-emerald-800 hover:bg-emerald-50'
          }`}
        >
          <span>Eligible ITC [4(A)(5)]</span>
          <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${activeTab === '4A5' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'}`}>
            {summary.eligible_4a5.count} | {formatCurrency(summary.eligible_4a5.total)}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('4B2')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === '4B2'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-indigo-800 hover:bg-indigo-50'
          }`}
        >
          <span>Temporary Reversal [4(B)(2)] (Reclaimable)</span>
          <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${activeTab === '4B2' ? 'bg-white/20 text-white' : 'bg-indigo-100 text-indigo-800'}`}>
            {summary.temporary_4b2.count} | {formatCurrency(summary.temporary_4b2.total)}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('4D')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === '4D'
              ? 'bg-rose-600 text-white shadow-xs'
              : 'text-rose-800 hover:bg-rose-50'
          }`}
        >
          <span>Ineligible ITC [4(D)] (Blocked)</span>
          <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${activeTab === '4D' ? 'bg-white/20 text-white' : 'bg-rose-100 text-rose-800'}`}>
            {ineligibleCombined.count} | {formatCurrency(ineligibleCombined.total)}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('4B1')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === '4B1'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'text-amber-800 hover:bg-amber-50'
          }`}
        >
          <span>Permanent Reversal [4(B)(1)]</span>
          <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${activeTab === '4B1' ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'}`}>
            {summary.permanent_4b1.count} | {formatCurrency(summary.permanent_4b1.total)}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('4A3')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === '4A3'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-blue-800 hover:bg-blue-50'
          }`}
        >
          <span>Inward RCM [4(A)(3)]</span>
          <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${activeTab === '4A3' ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-800'}`}>
            {summary.rcm_4a3.count}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('DEFERRED')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'DEFERRED'
              ? 'bg-slate-700 text-white shadow-xs'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <span>Deferred (Hold)</span>
          <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${activeTab === 'DEFERRED' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-800'}`}>
            {summary.deferred.count}
          </span>
        </button>
      </div>

      {/* ─── SEARCH & FLOATING BULK MOVE TOOLBAR ──────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Supplier GSTIN, Name, Invoice No, or Notes..."
            className="w-full pl-9 pr-8 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:border-indigo-500 outline-none transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Bulk Action Controls */}
        {selectedIds.size > 0 ? (
          <div className="flex items-center gap-2 flex-wrap animate-in fade-in duration-150 bg-indigo-50/70 border border-indigo-200 px-3 py-1.5 rounded-lg">
            <span className="text-xs font-bold text-indigo-950 flex items-center gap-1">
              <CheckSquare className="w-3.5 h-3.5 text-indigo-600" />
              <span>{selectedIds.size} Selected</span>
            </span>

            <div className="h-4 w-px bg-indigo-200" />

            <button
              type="button"
              disabled={isLocked}
              onClick={() => handleBulkMove('4A5')}
              className={`px-2 py-1 text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors shadow-2xs cursor-pointer ${
                isLocked ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              Move to Eligible [4(A)(5)]
            </button>

            <button
              type="button"
              disabled={isLocked}
              onClick={() => handleBulkMove('4B2', 'Rule 37 180-days unpaid')}
              className={`px-2 py-1 text-[11px] font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded transition-colors shadow-2xs cursor-pointer ${
                isLocked ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              Move to Temp Reversal [4(B)(2)]
            </button>

            <button
              type="button"
              disabled={isLocked}
              onClick={() => handleBulkMove('4D1', 'Section 17(5) Blocked Credit')}
              className={`px-2 py-1 text-[11px] font-bold bg-rose-600 hover:bg-rose-700 text-white rounded transition-colors shadow-2xs cursor-pointer ${
                isLocked ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              Move to Ineligible [4(D)(1)]
            </button>

            <button
              type="button"
              disabled={isLocked}
              onClick={() => handleBulkMove('4B1', 'Rule 38/42/43 Reversal')}
              className={`px-2 py-1 text-[11px] font-bold bg-amber-600 hover:bg-amber-700 text-white rounded transition-colors shadow-2xs cursor-pointer ${
                isLocked ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              Move to Perm Reversal [4(B)(1)]
            </button>

            <button
              type="button"
              disabled={isLocked}
              onClick={() => handleBulkMove('DEFERRED', 'Deferred to subsequent month')}
              className={`px-2 py-1 text-[11px] font-bold bg-slate-600 hover:bg-slate-700 text-white rounded transition-colors shadow-2xs cursor-pointer ${
                isLocked ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              Defer / Hold
            </button>

            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="text-[11px] text-slate-500 hover:text-slate-800 underline ml-1 cursor-pointer"
            >
              Clear
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>Showing <strong>{filteredInvoices.length}</strong> of {invoices.length} vouchers</span>
            <button
              type="button"
              onClick={handleSelectAllFiltered}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer"
            >
              Select All in View
            </button>
          </div>
        )}
      </div>

      {/* ─── DATA TABLE ───────────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-500 gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
            <span className="text-xs font-medium">Loading GSTR-2B inward bills and allocations...</span>
          </div>
        ) : filteredInvoices.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-2">
            <Info className="w-8 h-8 text-slate-300" />
            <span className="text-sm font-semibold text-slate-700">No invoices found for this selection</span>
            <span className="text-xs text-slate-500">Try adjusting your search terms or switching category tabs above</span>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50/90 text-slate-700 font-semibold border-b border-slate-200 sticky top-0 z-10 backdrop-blur-xs">
                <tr>
                  <th className="py-2.5 px-3 w-10 text-center border-r border-slate-200">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === filteredInvoices.length && filteredInvoices.length > 0}
                      onChange={handleSelectAllFiltered}
                      className="rounded text-indigo-600 cursor-pointer"
                    />
                  </th>
                  <th className="py-2.5 px-3 w-16 border-r border-slate-200">Section</th>
                  <th className="py-2.5 px-3 w-56 border-r border-slate-200">Supplier Details</th>
                  <th className="py-2.5 px-3 w-36 border-r border-slate-200">Invoice No & Date</th>
                  <th className="py-2.5 px-3 w-28 text-right border-r border-slate-200">Taxable (₹)</th>
                  <th className="py-2.5 px-3 w-24 text-right border-r border-slate-200">IGST (₹)</th>
                  <th className="py-2.5 px-3 w-24 text-right border-r border-slate-200">CGST (₹)</th>
                  <th className="py-2.5 px-3 w-24 text-right border-r border-slate-200">SGST (₹)</th>
                  <th className="py-2.5 px-3 w-28 text-right border-r border-slate-200">Total Tax (₹)</th>
                  <th className="py-2.5 px-3 w-14 text-center border-r border-slate-200">RCM</th>
                  <th className="py-2.5 px-3 w-56 border-r border-slate-200">Statutory 3B Destination</th>
                  <th className="py-2.5 px-3 min-w-[220px]">Audit Reason & Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredInvoices.map((inv) => {
                  const isSelected = selectedIds.has(inv.id);
                  const currentOpt = TARGET_TABLE_OPTIONS.find(o => o.id === inv.targetTable) || TARGET_TABLE_OPTIONS[0];

                  return (
                    <tr
                      key={inv.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isSelected ? 'bg-indigo-50/40' : inv.targetTable === '4B2' ? 'bg-indigo-50/15' : inv.targetTable === '4D1' || inv.targetTable === '4D2' ? 'bg-rose-50/15' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-2 px-3 text-center border-r border-slate-100">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(inv.id)}
                          className="rounded text-indigo-600 cursor-pointer"
                        />
                      </td>

                      {/* Section */}
                      <td className="py-2 px-3 border-r border-slate-100 font-mono text-[11px] font-semibold text-slate-700">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                          (inv.section || '').includes('CDNR') ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-800'
                        }`}>
                          {inv.section || 'B2B'}
                        </span>
                      </td>

                      {/* Supplier */}
                      <td className="py-2 px-3 border-r border-slate-100">
                        <div className="font-bold text-slate-900 truncate max-w-[210px]" title={inv.supplierName}>
                          {inv.supplierName || inv.ctin}
                        </div>
                        <div className="font-mono text-[10px] text-slate-500">{inv.ctin}</div>
                      </td>

                      {/* Invoice No & Date */}
                      <td className="py-2 px-3 border-r border-slate-100">
                        <div className="font-bold text-slate-900 truncate max-w-[130px]" title={inv.invoiceNo}>
                          {inv.invoiceNo}
                        </div>
                        <div className="text-[10px] text-slate-500">{inv.invoiceDate}</div>
                      </td>

                      {/* Taxable */}
                      <td className="py-2 px-3 text-right tabular-nums font-mono text-slate-800 border-r border-slate-100">
                        {(inv.txval || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>

                      {/* IGST */}
                      <td className="py-2 px-3 text-right tabular-nums font-mono text-indigo-700 border-r border-slate-100">
                        {(inv.igst || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>

                      {/* CGST */}
                      <td className="py-2 px-3 text-right tabular-nums font-mono text-slate-700 border-r border-slate-100">
                        {(inv.cgst || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>

                      {/* SGST */}
                      <td className="py-2 px-3 text-right tabular-nums font-mono text-slate-700 border-r border-slate-100">
                        {(inv.sgst || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>

                      {/* Total Tax */}
                      <td className="py-2 px-3 text-right tabular-nums font-mono font-bold text-slate-900 border-r border-slate-100 bg-slate-50/50">
                        {(inv.totalTax || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>

                      {/* RCM */}
                      <td className="py-2 px-3 text-center border-r border-slate-100 font-semibold">
                        {inv.reverseCharge === 'Y' ? (
                          <span className="text-[10px] bg-blue-100 text-blue-800 border border-blue-200 px-1 py-0.2 rounded font-bold">
                            RCM
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400">N</span>
                        )}
                      </td>

                      {/* Destination Selector Dropdown */}
                      <td className="py-2 px-3 border-r border-slate-100">
                        <select
                          value={inv.targetTable}
                          onChange={(e) => handleUpdateSingleInvoice(inv.id, e.target.value as StatutoryTargetTable)}
                          className={`w-full text-xs font-semibold rounded-lg px-2 py-1 border transition-colors outline-none cursor-pointer ${currentOpt.color}`}
                        >
                          {TARGET_TABLE_OPTIONS.map(opt => (
                            <option key={opt.id} value={opt.id} className="bg-white text-slate-900 font-normal">
                              {opt.shortLabel} — {opt.table}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Audit Notes with Clickable Suggestion Chips */}
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={inv.notes || ''}
                          onChange={(e) => handleUpdateSingleInvoice(inv.id, inv.targetTable, e.target.value, false)}
                          onBlur={(e) => handleUpdateSingleInvoice(inv.id, inv.targetTable, e.target.value, true)}
                          placeholder="Optional audit reason / remarks..."
                          className="w-full text-[11px] bg-slate-50 focus:bg-white border border-slate-200 focus:border-indigo-400 rounded px-2 py-1 text-slate-800 outline-none transition-colors"
                        />
                        {/* Quick Reason Chips */}
                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                          {inv.targetTable === '4B2' ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleUpdateSingleInvoice(inv.id, inv.targetTable, 'Rule 37: 180 Days Unpaid')}
                                className="text-[9px] bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-1.5 py-0.2 rounded border border-indigo-200 cursor-pointer"
                              >
                                + Rule 37 180-days
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateSingleInvoice(inv.id, inv.targetTable, 'Goods in Transit / Not Received')}
                                className="text-[9px] bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-1.5 py-0.2 rounded border border-indigo-200 cursor-pointer"
                              >
                                + Goods in Transit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateSingleInvoice(inv.id, inv.targetTable, 'Commercial Invoice Dispute')}
                                className="text-[9px] bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-1.5 py-0.2 rounded border border-indigo-200 cursor-pointer"
                              >
                                + Price Dispute
                              </button>
                            </>
                          ) : inv.targetTable === '4D1' ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleUpdateSingleInvoice(inv.id, inv.targetTable, 'Sec 17(5)(a) Motor Vehicle blocked')}
                                className="text-[9px] bg-rose-50 hover:bg-rose-100 text-rose-700 px-1.5 py-0.2 rounded border border-rose-200 cursor-pointer"
                              >
                                + Motor Vehicle 17(5)(a)
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateSingleInvoice(inv.id, inv.targetTable, 'Sec 17(5)(b) Food / Catering / Club')}
                                className="text-[9px] bg-rose-50 hover:bg-rose-100 text-rose-700 px-1.5 py-0.2 rounded border border-rose-200 cursor-pointer"
                              >
                                + Catering / Food 17(5)(b)
                              </button>
                            </>
                          ) : inv.targetTable === '4D2' ? (
                            <button
                              type="button"
                              onClick={() => handleUpdateSingleInvoice(inv.id, inv.targetTable, 'Sec 16(4) Time-Barred past Nov 30')}
                              className="text-[9px] bg-amber-50 hover:bg-amber-100 text-amber-700 px-1.5 py-0.2 rounded border border-amber-200 cursor-pointer"
                            >
                              + Sec 16(4) Time-Barred
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
