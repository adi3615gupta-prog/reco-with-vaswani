import React, { useState, useEffect, useRef } from 'react';
import {
  Key, X, Search, Building2, Check, Eye, EyeOff, Save,
  Download, FileSpreadsheet, Sparkles, RefreshCw, AlertCircle,
  ExternalLink, UserCheck, Trash2
} from 'lucide-react';
import { toast } from 'sonner';
import { getApiBase, safeApiFetch } from '@/lib/api';
import * as XLSX from 'xlsx';
import { parseCredentialsImportExcel, generateCredentialsTemplateExcel } from '@/lib/imsEngine';

export interface VaultClient {
  id: string;
  gstin: string;
  trade_name: string;
  legal_name?: string;
  phone?: string;
  email?: string;
  address?: string;
  portal_username?: string;
  portal_password?: string;
}

interface CredentialsVaultModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectClient?: (client: VaultClient) => void;
  selectedGstin?: string;
}

export default function CredentialsVaultModal({
  isOpen,
  onClose,
  onSelectClient,
  selectedGstin
}: CredentialsVaultModalProps) {
  const [clients, setClients] = useState<VaultClient[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'CONFIGURED' | 'MISSING'>('ALL');
  const [editedCredentials, setEditedCredentials] = useState<Record<string, Partial<VaultClient>>>({});
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [savingGstin, setSavingGstin] = useState<string | null>(null);
  const [deletingGstin, setDeletingGstin] = useState<string | null>(null);
  const [mirrorMode, setMirrorMode] = useState<boolean>(true);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      fetchClients();
    }
  }, [isOpen]);

  const fetchClients = async () => {
    setLoading(true);
    try {
      const res = await safeApiFetch('/api/ims/credentials');
      const data = await res.json();
      if (data.success && Array.isArray(data.clients)) {
        setClients(data.clients);
      }
    } catch (err: any) {
      toast.error('Failed to load credentials vault', { description: err?.message });
    } finally {
      setLoading(false);
    }
  };

  const configuredCount = clients.filter(c => c.portal_username && c.portal_password).length;
  const missingCount = clients.length - configuredCount;

  // Filter clients
  const filteredClients = clients.filter(c => {
    const q = search.toLowerCase();
    const matchesSearch =
      (c.trade_name || '').toLowerCase().includes(q) ||
      (c.legal_name || '').toLowerCase().includes(q) ||
      c.gstin.toLowerCase().includes(q) ||
      (c.portal_username || '').toLowerCase().includes(q);

    if (!matchesSearch) return false;
    const isConfigured = Boolean(c.portal_username && c.portal_password);
    if (filter === 'CONFIGURED') return isConfigured;
    if (filter === 'MISSING') return !isConfigured;
    return true;
  });

  // Save single client update
  const handleSaveClient = async (gstin: string) => {
    const update = editedCredentials[gstin];
    if (!update) return;

    setSavingGstin(gstin);
    try {
      const res = await safeApiFetch('/api/ims/credentials/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gstin,
          portal_username: update.portal_username,
          portal_password: update.portal_password,
          phone: update.phone,
          trade_name: update.trade_name
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed saving credentials');

      // Update local state
      setClients(prev => prev.map(c => {
        if (c.gstin === gstin) {
          return {
            ...c,
            portal_username: update.portal_username !== undefined ? update.portal_username : c.portal_username,
            portal_password: update.portal_password !== undefined ? update.portal_password : c.portal_password,
            phone: update.phone !== undefined ? update.phone : c.phone
          };
        }
        return c;
      }));

      setEditedCredentials(prev => {
        const next = { ...prev };
        delete next[gstin];
        return next;
      });

      toast.success(`Saved credentials for ${gstin}`);
    } catch (err: any) {
      toast.error('Save failed', { description: err?.message });
    } finally {
      setSavingGstin(null);
    }
  };

  // Delete single client
  const handleDeleteClient = async (gstin: string, tradeName: string) => {
    if (!window.confirm(`Are you sure you want to delete client "${tradeName || gstin}" (${gstin})? This will remove credentials and related IMS data.`)) {
      return;
    }

    setDeletingGstin(gstin);
    try {
      const res = await safeApiFetch(`/api/ims/clients/${encodeURIComponent(gstin)}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed deleting client');
      }

      setClients(prev => prev.filter(c => c.gstin !== gstin));
      toast.success(`Deleted client ${gstin}`);
    } catch (err: any) {
      toast.error('Failed to delete client', { description: err?.message });
    } finally {
      setDeletingGstin(null);
    }
  };

  // Download Excel template
  const handleDownloadTemplate = async () => {
    try {
      const blob = await generateCredentialsTemplateExcel(clients);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `GST_Client_Credentials_Template_${new Date().getFullYear()}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Downloaded Credentials Vault Template');
    } catch (err: any) {
      toast.error('Failed generating template', { description: err?.message });
    }
  };

  // Import Excel sheet (Adds, Updates every detail, and Deletes clients missing from sheet)
  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const toastId = toast.loading('Reading & Synchronizing Credentials Excel...');
    try {
      const records = await parseCredentialsImportExcel(file);
      if (!records || records.length === 0) {
        toast.error('No valid client credential rows found. Please ensure the Excel contains a GSTIN column.', { id: toastId });
        return;
      }

      const res = await safeApiFetch('/api/ims/credentials/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clients: records, deleteMissing: mirrorMode })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed synchronizing credentials');
      }

      await fetchClients();
      if (data.deletedCount > 0) {
        toast.success(`Synchronized ${data.importedCount} clients (${data.deletedCount} deleted, ${data.addedCount || 0} added, ${data.updatedCount || 0} updated)!`, { id: toastId });
      } else {
        toast.success(`Synchronized ${data.importedCount} clients (${data.addedCount || 0} added, ${data.updatedCount || 0} updated)!`, { id: toastId });
      }
    } catch (err: any) {
      toast.error('Import failed', { id: toastId, description: err?.message });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 md:p-6 animate-fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-5xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between gap-4 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shadow-inner">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base md:text-lg font-bold text-white flex items-center gap-2">
                Client Credentials Vault
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Shared Across All Modules
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Configure GST Portal Usernames & Passwords once. Automatically used for GSTR-3B, IMS, and 2B Autopilot.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2">
              <div className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-center">
                <span className="text-[10px] text-slate-400 block font-semibold">Total</span>
                <span className="text-xs font-bold text-white">{clients.length}</span>
              </div>
              <div className="px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
                <span className="text-[10px] text-emerald-400 block font-semibold">Configured</span>
                <span className="text-xs font-bold text-emerald-300">{configuredCount}</span>
              </div>
              <div className="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
                <span className="text-[10px] text-amber-400 block font-semibold">Missing</span>
                <span className="text-xs font-bold text-amber-300">{missingCount}</span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="p-4 border-b border-slate-800 bg-slate-900 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 flex-1 max-w-lg">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search Client Name, GSTIN, Username..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                  filter === 'ALL' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                All ({clients.length})
              </button>
              <button
                onClick={() => setFilter('CONFIGURED')}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                  filter === 'CONFIGURED' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                Configured ({configuredCount})
              </button>
              <button
                onClick={() => setFilter('MISSING')}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                  filter === 'MISSING' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                Missing ({missingCount})
              </button>
            </div>
          </div>

          {/* Bulk Controls */}
          <div className="flex items-center gap-2">
            <label 
              className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer select-none px-2.5 py-1.5 bg-slate-950/80 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors"
              title="When checked, uploading an Excel will add new clients, update all details, AND delete any client missing from the sheet"
            >
              <input
                type="checkbox"
                checked={mirrorMode}
                onChange={e => setMirrorMode(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-slate-700 text-amber-500 focus:ring-0 bg-slate-900 cursor-pointer accent-amber-500"
              />
              <span className="font-semibold text-slate-300">Sync &amp; Prune (Mirror Sheet)</span>
            </label>

            <button
              onClick={handleDownloadTemplate}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 border border-slate-700 transition-all hover:border-amber-500/50"
              title="Download Excel with clients"
            >
              <Download className="w-3.5 h-3.5 text-amber-400" />
              Download Template
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-950 transition-all hover:scale-[1.02]"
              title="Import completed Excel"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Import Excel
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImportExcel}
              accept=".xlsx,.xls"
              className="hidden"
            />
          </div>
        </div>

        {/* Clients Table */}
        <div className="flex-1 overflow-y-auto max-h-[50vh] p-4">
          {loading ? (
            <div className="text-center py-12 text-slate-400 space-y-2">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto text-amber-400" />
              <p className="text-xs">Loading Credentials Vault...</p>
            </div>
          ) : filteredClients.length === 0 ? (
            <div className="text-center py-12 text-slate-500 space-y-2">
              <Key className="w-10 h-10 mx-auto text-slate-600" />
              <p className="text-sm font-semibold">No clients match your filter.</p>
            </div>
          ) : (
            <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950/60 shadow-inner">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-900 border-b border-slate-800 text-[10px] uppercase font-bold text-slate-400 sticky top-0 z-10">
                  <tr>
                    <th className="py-2.5 px-3 w-10 text-center">#</th>
                    <th className="py-2.5 px-3 min-w-[180px]">Client / Trade Name</th>
                    <th className="py-2.5 px-3 min-w-[150px]">GSTIN</th>
                    <th className="py-2.5 px-3 min-w-[180px]">Portal Username</th>
                    <th className="py-2.5 px-3 min-w-[200px]">Portal Password</th>
                    <th className="py-2.5 px-3 min-w-[120px]">Phone</th>
                    <th className="py-2.5 px-3 text-center w-36">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-sans">
                  {filteredClients.map((c, i) => {
                    const edited = editedCredentials[c.gstin];
                    const currentUsername = edited?.portal_username !== undefined ? edited.portal_username : (c.portal_username || '');
                    const currentPassword = edited?.portal_password !== undefined ? edited.portal_password : (c.portal_password || '');
                    const currentPhone = edited?.phone !== undefined ? edited.phone : (c.phone || '');
                    const isEdited = Boolean(edited);
                    const isConfigured = Boolean(currentUsername && currentPassword);
                    const isPasswordVisible = Boolean(showPasswords[c.gstin]);
                    const isSelected = selectedGstin === c.gstin;

                    return (
                      <tr
                        key={c.gstin}
                        className={`transition-colors ${isSelected ? 'bg-blue-950/30' : 'hover:bg-slate-900/60'}`}
                      >
                        <td className="py-2.5 px-3 text-center text-slate-500 font-mono text-[11px]">{i + 1}</td>
                        <td className="py-2.5 px-3 font-semibold text-slate-200">
                          <div className="flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                            <span className="truncate max-w-[180px]" title={c.trade_name || c.legal_name}>
                              {c.trade_name || c.legal_name || 'Client'}
                            </span>
                            {isSelected && (
                              <span className="px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-400 text-[9px] font-bold border border-blue-500/40">
                                Active 3B
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-400 text-[11px] font-bold">
                          {c.gstin}
                        </td>
                        <td className="py-2.5 px-3">
                          <input
                            type="text"
                            placeholder="Enter Username"
                            value={currentUsername}
                            onChange={e => {
                              const val = e.target.value;
                              setEditedCredentials(prev => ({
                                ...prev,
                                [c.gstin]: {
                                  portal_username: val,
                                  portal_password: prev[c.gstin]?.portal_password !== undefined ? prev[c.gstin].portal_password : (c.portal_password || ''),
                                  phone: prev[c.gstin]?.phone !== undefined ? prev[c.gstin].phone : (c.phone || ''),
                                  trade_name: c.trade_name
                                }
                              }));
                            }}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white placeholder:text-slate-600 focus:border-amber-500 outline-none"
                          />
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="relative">
                            <input
                              type={isPasswordVisible ? 'text' : 'password'}
                              placeholder="Enter Password"
                              value={currentPassword}
                              onChange={e => {
                                const val = e.target.value;
                                setEditedCredentials(prev => ({
                                  ...prev,
                                  [c.gstin]: {
                                    portal_username: prev[c.gstin]?.portal_username !== undefined ? prev[c.gstin].portal_username : (c.portal_username || ''),
                                    portal_password: val,
                                    phone: prev[c.gstin]?.phone !== undefined ? prev[c.gstin].phone : (c.phone || ''),
                                    trade_name: c.trade_name
                                  }
                                }));
                              }}
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-2.5 pr-8 py-1 text-xs text-white placeholder:text-slate-600 focus:border-amber-500 outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPasswords(prev => ({ ...prev, [c.gstin]: !isPasswordVisible }))}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                              title={isPasswordVisible ? 'Hide password' : 'Show password'}
                            >
                              {isPasswordVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <input
                            type="text"
                            placeholder="Phone"
                            value={currentPhone}
                            onChange={e => {
                              const val = e.target.value;
                              setEditedCredentials(prev => ({
                                ...prev,
                                [c.gstin]: {
                                  portal_username: prev[c.gstin]?.portal_username !== undefined ? prev[c.gstin].portal_username : (c.portal_username || ''),
                                  portal_password: prev[c.gstin]?.portal_password !== undefined ? prev[c.gstin].portal_password : (c.portal_password || ''),
                                  phone: val,
                                  trade_name: c.trade_name
                                }
                              }));
                            }}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white placeholder:text-slate-600 focus:border-amber-500 outline-none font-mono"
                          />
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {isEdited && (
                              <button
                                onClick={() => handleSaveClient(c.gstin)}
                                disabled={savingGstin === c.gstin}
                                className="px-2 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all"
                              >
                                {savingGstin === c.gstin ? (
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Save className="w-3 h-3" />
                                )}
                                Save
                              </button>
                            )}

                            {onSelectClient && (
                              <button
                                onClick={() => {
                                  onSelectClient(c);
                                  onClose();
                                }}
                                className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all"
                                title="Select this client for GSTR-3B Working"
                              >
                                <UserCheck className="w-3 h-3" /> Use
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleDeleteClient(c.gstin, c.trade_name || c.legal_name || '')}
                              disabled={deletingGstin === c.gstin}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors ml-1"
                              title={`Delete client ${c.gstin}`}
                            >
                              {deletingGstin === c.gstin ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin text-rose-400" />
                              ) : (
                                <Trash2 className="w-3.5 h-3.5" />
                              )}
                            </button>
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

        {/* Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex justify-between items-center text-xs text-slate-400">
          <span>
            🔒 Passwords are stored in your local SQLite offline vault and never uploaded to any public cloud.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold text-xs"
          >
            Close Vault
          </button>
        </div>
      </div>
    </div>
  );
}
