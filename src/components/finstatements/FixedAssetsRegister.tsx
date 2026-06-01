// ============================================================
// Fixed Assets Register — Schedule III Note 2/3
// Interactive grid with inline editing, computed columns,
// and ₹ Indian-locale formatting.
// ============================================================

import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { FixedAssetEntry } from '@/lib/finStatements.types';
import {
  getFixedAssets,
  addFixedAssetEntry,
  updateFixedAssetEntry,
  deleteFixedAssetEntry,
  clearFixedAssets,
} from '@/lib/finStatements.storage';
import { toast } from 'sonner';
import {
  Plus,
  Trash2,
  AlertTriangle,
  PackageOpen,
  Building2,
  X,
  Check,
  Eraser,
} from 'lucide-react';

// ---- Helpers ----

const INR = (v: number): string =>
  '₹' + v.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const grossClosing = (e: FixedAssetEntry) =>
  e.gross_block_opening + e.additions - e.deductions;

const totalDepreciation = (e: FixedAssetEntry) =>
  e.depreciation_opening + e.depreciation_for_year;

const netBlock = (e: FixedAssetEntry) =>
  grossClosing(e) - totalDepreciation(e);

const uid = () => 'fa_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);

// ---- Types ----

interface Props {
  onDataChanged: () => void;
}

type NumericField = 'gross_block_opening' | 'additions' | 'deductions' | 'depreciation_opening' | 'depreciation_for_year';

const NUMERIC_FIELDS: { key: NumericField; label: string; short: string }[] = [
  { key: 'gross_block_opening',   label: 'Gross Block Opening', short: 'GB Opening' },
  { key: 'additions',             label: 'Additions',           short: 'Additions' },
  { key: 'deductions',            label: 'Deductions',          short: 'Deductions' },
  { key: 'depreciation_opening',  label: 'Depreciation Opening', short: 'Dep Opening' },
  { key: 'depreciation_for_year', label: 'Depreciation for Year', short: 'Dep for Year' },
];

// ---- Component ----

function FixedAssetsRegister({ onDataChanged }: Props) {
  const [entries, setEntries] = useState<FixedAssetEntry[]>([]);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // -- Add-form state --
  const [newAssetClass, setNewAssetClass] = useState('');
  const [newValues, setNewValues] = useState<Record<NumericField, string>>({
    gross_block_opening: '',
    additions: '',
    deductions: '',
    depreciation_opening: '',
    depreciation_for_year: '',
  });

  // -- Inline-edit state --
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  // -- Load --
  const reload = useCallback(() => {
    setEntries(getFixedAssets());
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // Focus inline-edit input when it appears
  useEffect(() => {
    if (editingCell && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingCell]);

  // -- Add entry --
  const handleAdd = () => {
    const assetClass = newAssetClass.trim();
    if (!assetClass) {
      toast.error('Asset class name is required');
      return;
    }

    const entry: FixedAssetEntry = {
      id: uid(),
      client_id: '',
      asset_class: assetClass,
      gross_block_opening:   parseFloat(newValues.gross_block_opening)   || 0,
      additions:             parseFloat(newValues.additions)             || 0,
      deductions:            parseFloat(newValues.deductions)            || 0,
      depreciation_opening:  parseFloat(newValues.depreciation_opening)  || 0,
      depreciation_for_year: parseFloat(newValues.depreciation_for_year) || 0,
    };

    addFixedAssetEntry(entry);
    reload();
    onDataChanged();
    toast.success(`Added "${assetClass}"`);

    // Reset form
    setNewAssetClass('');
    setNewValues({
      gross_block_opening: '',
      additions: '',
      deductions: '',
      depreciation_opening: '',
      depreciation_for_year: '',
    });
  };

  // -- Delete entry --
  const handleDelete = (id: string, name: string) => {
    deleteFixedAssetEntry(id);
    reload();
    onDataChanged();
    toast.success(`Deleted "${name}"`);
  };

  // -- Clear all --
  const handleClearAll = () => {
    clearFixedAssets();
    reload();
    onDataChanged();
    setShowClearConfirm(false);
    toast.success('All fixed assets cleared');
  };

  // -- Inline edit --
  const startEdit = (id: string, field: string, currentValue: string | number) => {
    setEditingCell({ id, field });
    setEditValue(String(currentValue));
  };

  const cancelEdit = () => {
    setEditingCell(null);
    setEditValue('');
  };

  const commitEdit = () => {
    if (!editingCell) return;

    const { id, field } = editingCell;
    if (field === 'asset_class') {
      const v = editValue.trim();
      if (!v) {
        toast.error('Asset class cannot be empty');
        return;
      }
      updateFixedAssetEntry(id, { asset_class: v });
    } else {
      const num = parseFloat(editValue) || 0;
      updateFixedAssetEntry(id, { [field]: num });
    }

    reload();
    onDataChanged();
    setEditingCell(null);
    setEditValue('');
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commitEdit();
    if (e.key === 'Escape') cancelEdit();
  };

  // -- Summary totals --
  const totals = entries.reduce(
    (acc, e) => ({
      gross_block_opening: acc.gross_block_opening + e.gross_block_opening,
      additions: acc.additions + e.additions,
      deductions: acc.deductions + e.deductions,
      gross_closing: acc.gross_closing + grossClosing(e),
      depreciation_opening: acc.depreciation_opening + e.depreciation_opening,
      depreciation_for_year: acc.depreciation_for_year + e.depreciation_for_year,
      total_depreciation: acc.total_depreciation + totalDepreciation(e),
      net_block: acc.net_block + netBlock(e),
    }),
    {
      gross_block_opening: 0,
      additions: 0,
      deductions: 0,
      gross_closing: 0,
      depreciation_opening: 0,
      depreciation_for_year: 0,
      total_depreciation: 0,
      net_block: 0,
    },
  );

  // -- Render helpers --
  const renderCell = (entry: FixedAssetEntry, field: string, displayValue: string, rawValue: string | number) => {
    const isEditing = editingCell?.id === entry.id && editingCell?.field === field;

    if (isEditing) {
      return (
        <div className="flex items-center gap-1">
          <input
            ref={editInputRef}
            type={field === 'asset_class' ? 'text' : 'number'}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleEditKeyDown}
            className="w-full bg-[rgba(6,182,212,0.1)] border border-cyan-500/40 rounded px-2 py-1
                       text-white text-sm outline-none focus:border-cyan-400 transition-colors"
          />
          <button onClick={commitEdit} className="text-emerald-400 hover:text-emerald-300 shrink-0">
            <Check size={14} />
          </button>
          <button onClick={cancelEdit} className="text-red-400 hover:text-red-300 shrink-0">
            <X size={14} />
          </button>
        </div>
      );
    }

    return (
      <span
        onClick={() => startEdit(entry.id, field, rawValue)}
        className="cursor-pointer hover:text-cyan-300 transition-colors block w-full"
        title="Click to edit"
      >
        {displayValue}
      </span>
    );
  };

  // ---- JSX ----

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
            <Building2 size={20} className="text-cyan-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Fixed Assets Register</h2>
            <p className="text-xs text-slate-400">Schedule III · Note 2 / Note 3</p>
          </div>
        </div>

        {entries.length > 0 && (
          <div className="relative">
            {showClearConfirm ? (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-1.5 animate-in fade-in">
                <AlertTriangle size={14} className="text-red-400" />
                <span className="text-xs text-red-300">Clear all assets?</span>
                <button
                  onClick={handleClearAll}
                  className="text-xs bg-red-500/20 hover:bg-red-500/30 text-red-300 px-2 py-0.5 rounded transition-colors"
                >
                  Yes
                </button>
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="text-xs bg-slate-500/20 hover:bg-slate-500/30 text-slate-300 px-2 py-0.5 rounded transition-colors"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowClearConfirm(true)}
                className="flex items-center gap-1.5 text-xs text-red-400/70 hover:text-red-400 transition-colors"
              >
                <Eraser size={14} />
                Clear All
              </button>
            )}
          </div>
        )}
      </div>

      {/* Add Form */}
      <div className="bg-[rgba(15,23,42,0.45)] backdrop-blur-xl border border-white/5 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Plus size={15} className="text-cyan-400" />
          <span className="text-sm font-medium text-cyan-300">Add New Asset</span>
        </div>

        <div className="grid grid-cols-12 gap-2 items-end">
          {/* Asset Class */}
          <div className="col-span-3">
            <label className="text-[11px] text-slate-400 mb-1 block">Asset Class</label>
            <input
              type="text"
              placeholder="e.g. Plant & Machinery"
              value={newAssetClass}
              onChange={(e) => setNewAssetClass(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              className="w-full bg-[rgba(6,182,212,0.05)] border border-white/10 rounded-lg px-3 py-2
                         text-sm text-white placeholder-slate-500 outline-none
                         focus:border-cyan-500/50 transition-colors"
            />
          </div>

          {/* Numeric fields */}
          {NUMERIC_FIELDS.map((f) => (
            <div key={f.key} className="col-span-1.5 flex-1">
              <label className="text-[11px] text-slate-400 mb-1 block truncate" title={f.label}>
                {f.short}
              </label>
              <input
                type="number"
                placeholder="0"
                value={newValues[f.key]}
                onChange={(e) =>
                  setNewValues((prev) => ({ ...prev, [f.key]: e.target.value }))
                }
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                className="w-full bg-[rgba(6,182,212,0.05)] border border-white/10 rounded-lg px-3 py-2
                           text-sm text-white placeholder-slate-500 outline-none
                           focus:border-cyan-500/50 transition-colors [appearance:textfield]
                           [&::-webkit-outer-spin-button]:appearance-none
                           [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
          ))}

          {/* Add button */}
          <div className="col-span-1">
            <button
              onClick={handleAdd}
              className="w-full bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/30
                         text-cyan-300 rounded-lg px-3 py-2 text-sm font-medium
                         transition-colors flex items-center justify-center gap-1.5"
            >
              <Plus size={15} />
              Add
            </button>
          </div>
        </div>
      </div>

      {/* Data Grid */}
      {entries.length === 0 ? (
        /* Empty state */
        <div className="bg-[rgba(15,23,42,0.45)] backdrop-blur-xl border border-white/5 rounded-xl py-16 flex flex-col items-center gap-3">
          <div className="p-4 rounded-full bg-cyan-500/5 border border-cyan-500/10">
            <PackageOpen size={32} className="text-cyan-500/40" />
          </div>
          <p className="text-slate-400 text-sm">No fixed assets registered yet</p>
          <p className="text-slate-500 text-xs">Use the form above to add your first asset class</p>
        </div>
      ) : (
        <div className="bg-[rgba(15,23,42,0.45)] backdrop-blur-xl border border-white/5 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              {/* Column headers */}
              <thead>
                <tr className="border-b border-white/5">
                  {/* Merged header groups */}
                  <th
                    className="px-4 py-2 text-left text-[11px] font-medium text-slate-400 uppercase tracking-wider border-b border-white/5"
                    rowSpan={2}
                  >
                    Asset Class
                  </th>
                  <th
                    className="px-2 py-1.5 text-center text-[11px] font-semibold text-cyan-400 uppercase tracking-wider border-b border-white/5 border-l border-white/5"
                    colSpan={4}
                  >
                    Gross Block
                  </th>
                  <th
                    className="px-2 py-1.5 text-center text-[11px] font-semibold text-teal-400 uppercase tracking-wider border-b border-white/5 border-l border-white/5"
                    colSpan={3}
                  >
                    Depreciation
                  </th>
                  <th
                    className="px-2 py-1.5 text-center text-[11px] font-semibold text-emerald-400 uppercase tracking-wider border-b border-white/5 border-l border-white/5"
                    rowSpan={2}
                  >
                    Net Block
                  </th>
                  <th className="px-2 py-1.5 border-b border-white/5" rowSpan={2}></th>
                </tr>
                <tr className="border-b border-white/10">
                  {/* Gross Block sub-headers */}
                  <th className="px-3 py-2 text-right text-[11px] font-medium text-slate-400 border-l border-white/5">
                    Opening
                  </th>
                  <th className="px-3 py-2 text-right text-[11px] font-medium text-slate-400">
                    Additions
                  </th>
                  <th className="px-3 py-2 text-right text-[11px] font-medium text-slate-400">
                    Deductions
                  </th>
                  <th className="px-3 py-2 text-right text-[11px] font-medium text-cyan-400/60">
                    Closing
                  </th>
                  {/* Depreciation sub-headers */}
                  <th className="px-3 py-2 text-right text-[11px] font-medium text-slate-400 border-l border-white/5">
                    Opening
                  </th>
                  <th className="px-3 py-2 text-right text-[11px] font-medium text-slate-400">
                    For Year
                  </th>
                  <th className="px-3 py-2 text-right text-[11px] font-medium text-teal-400/60">
                    Total
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-white/[0.03]">
                {entries.map((entry) => (
                  <tr
                    key={entry.id}
                    className="hover:bg-white/[0.02] transition-colors group"
                  >
                    {/* Asset Class */}
                    <td className="px-4 py-2.5 font-medium text-white max-w-[200px]">
                      {renderCell(entry, 'asset_class', entry.asset_class, entry.asset_class)}
                    </td>

                    {/* Gross Block Opening */}
                    <td className="px-3 py-2.5 text-right text-slate-300 border-l border-white/5">
                      {renderCell(entry, 'gross_block_opening', INR(entry.gross_block_opening), entry.gross_block_opening)}
                    </td>

                    {/* Additions */}
                    <td className="px-3 py-2.5 text-right text-slate-300">
                      {renderCell(entry, 'additions', INR(entry.additions), entry.additions)}
                    </td>

                    {/* Deductions */}
                    <td className="px-3 py-2.5 text-right text-slate-300">
                      {renderCell(entry, 'deductions', INR(entry.deductions), entry.deductions)}
                    </td>

                    {/* Gross Block Closing (computed) */}
                    <td className="px-3 py-2.5 text-right font-medium text-cyan-300">
                      {INR(grossClosing(entry))}
                    </td>

                    {/* Depreciation Opening */}
                    <td className="px-3 py-2.5 text-right text-slate-300 border-l border-white/5">
                      {renderCell(entry, 'depreciation_opening', INR(entry.depreciation_opening), entry.depreciation_opening)}
                    </td>

                    {/* Depreciation for Year */}
                    <td className="px-3 py-2.5 text-right text-slate-300">
                      {renderCell(entry, 'depreciation_for_year', INR(entry.depreciation_for_year), entry.depreciation_for_year)}
                    </td>

                    {/* Total Depreciation (computed) */}
                    <td className="px-3 py-2.5 text-right font-medium text-teal-300">
                      {INR(totalDepreciation(entry))}
                    </td>

                    {/* Net Block (computed) */}
                    <td className="px-3 py-2.5 text-right font-semibold text-emerald-300 border-l border-white/5">
                      {INR(netBlock(entry))}
                    </td>

                    {/* Delete */}
                    <td className="px-3 py-2.5 text-center">
                      <button
                        onClick={() => handleDelete(entry.id, entry.asset_class)}
                        className="opacity-0 group-hover:opacity-100 text-red-400/60 hover:text-red-400
                                   transition-all p-1 rounded hover:bg-red-500/10"
                        title="Delete asset"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>

              {/* Summary / Totals row */}
              <tfoot>
                <tr className="border-t-2 border-cyan-500/20 bg-[rgba(6,182,212,0.04)]">
                  <td className="px-4 py-3 font-semibold text-cyan-300 text-sm">
                    Total ({entries.length} asset{entries.length !== 1 ? 's' : ''})
                  </td>
                  <td className="px-3 py-3 text-right font-semibold text-slate-200 border-l border-white/5">
                    {INR(totals.gross_block_opening)}
                  </td>
                  <td className="px-3 py-3 text-right font-semibold text-slate-200">
                    {INR(totals.additions)}
                  </td>
                  <td className="px-3 py-3 text-right font-semibold text-slate-200">
                    {INR(totals.deductions)}
                  </td>
                  <td className="px-3 py-3 text-right font-bold text-cyan-300">
                    {INR(totals.gross_closing)}
                  </td>
                  <td className="px-3 py-3 text-right font-semibold text-slate-200 border-l border-white/5">
                    {INR(totals.depreciation_opening)}
                  </td>
                  <td className="px-3 py-3 text-right font-semibold text-slate-200">
                    {INR(totals.depreciation_for_year)}
                  </td>
                  <td className="px-3 py-3 text-right font-bold text-teal-300">
                    {INR(totals.total_depreciation)}
                  </td>
                  <td className="px-3 py-3 text-right font-bold text-emerald-300 border-l border-white/5">
                    {INR(totals.net_block)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default FixedAssetsRegister;
