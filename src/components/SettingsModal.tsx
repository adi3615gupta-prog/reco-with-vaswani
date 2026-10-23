import React, { useState, useEffect } from 'react';
import {
  Settings, Database, Server, RefreshCw, Check, Copy, FolderOpen,
  X, CheckCircle2, AlertTriangle, HardDrive, Laptop, Sparkles, Sliders
} from 'lucide-react';
import { toast } from 'sonner';
import { pingTally, fetchCompanyInfo } from '@/lib/tallyApi';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'storage' | 'tally' | 'appearance'>('storage');

  // Storage / Data Path State
  const [currentDataPath, setCurrentDataPath] = useState<string>('');
  const [newPathInput, setNewPathInput] = useState<string>('');
  const [serverHost, setServerHost] = useState<string>('');
  const [serverIps, setServerIps] = useState<string[]>([]);
  const [isLoadingStorage, setIsLoadingStorage] = useState(false);
  const [isSavingStorage, setIsSavingStorage] = useState(false);

  // Tally Bridge State
  const [tallyHost, setTallyHost] = useState<string>('localhost');
  const [tallyPort, setTallyPort] = useState<number>(() => {
    const saved = localStorage.getItem('np_tally_port');
    return saved ? parseInt(saved, 10) : 9000;
  });
  const [isTestingTally, setIsTestingTally] = useState(false);
  const [tallyStatus, setTallyStatus] = useState<'unknown' | 'online' | 'offline'>('unknown');
  const [tallyCompany, setTallyCompany] = useState<string>('');

  // Fetch current storage config on open
  useEffect(() => {
    if (!isOpen) return;

    const fetchConfig = async () => {
      setIsLoadingStorage(true);
      try {
        const res = await fetch('/api/returns/storage-config');
        if (res.ok) {
          const data = await res.json();
          if (data && data.success) {
            setCurrentDataPath(data.dataPath || '');
            setNewPathInput(data.dataPath || '');
            setServerHost(data.serverHost || '');
            setServerIps(Array.isArray(data.serverIps) ? data.serverIps : []);
          }
        }
      } catch (e) {
        console.warn('Failed fetching storage config:', e);
      } finally {
        setIsLoadingStorage(false);
      }
    };

    fetchConfig();
  }, [isOpen]);

  // Handle saving new data path
  const handleSaveDataPath = async () => {
    if (!newPathInput.trim()) {
      toast.error('Data path cannot be empty');
      return;
    }
    setIsSavingStorage(true);
    try {
      const res = await fetch('/api/returns/storage-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataPath: newPathInput.trim() })
      });
      const data = await res.json();
      if (data && data.success) {
        setCurrentDataPath(data.dataPath);
        toast.success('Data Storage Path Updated', {
          description: `All client returns and batches will be stored in: ${data.dataPath}`
        });
      } else {
        toast.error('Failed to update data path', { description: data?.message || 'Server error' });
      }
    } catch (e: any) {
      toast.error('Failed to save data path', { description: e.message });
    } finally {
      setIsSavingStorage(false);
    }
  };

  // Handle testing TallyPrime connection
  const handleTestTally = async () => {
    setIsTestingTally(true);
    setTallyStatus('unknown');
    setTallyCompany('');
    try {
      const config = { host: tallyHost, port: tallyPort };
      const isAlive = await pingTally(config);
      if (isAlive) {
        setTallyStatus('online');
        localStorage.setItem('np_tally_port', String(tallyPort));
        try {
          const info = await fetchCompanyInfo(config);
          if (info && info.name) {
            setTallyCompany(info.name);
          }
        } catch {
          // company fetch optional
        }
        toast.success('TallyPrime Connected!', {
          description: `Tally XML Server active on ${tallyHost}:${tallyPort}`
        });
      } else {
        setTallyStatus('offline');
        toast.error('Tally Not Reachable', {
          description: `Ensure TallyPrime is open and acts as an XML Server on port ${tallyPort}.`
        });
      }
    } catch (e: any) {
      setTallyStatus('offline');
      toast.error('Connection failed', { description: e.message });
    } finally {
      setIsTestingTally(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fadeIn">
      <div 
        className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] transition-all transform animate-scaleUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white dark:from-slate-900 dark:to-slate-950">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400 shadow-sm">
              <Settings className="w-5 h-5 animate-spin-slow" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                System Settings &amp; Connectivity
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300">
                  Global Hub
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Manage shared data storage paths, live TallyPrime XML port, and workspace controls.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-all"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-100 dark:border-slate-800 px-6 bg-slate-50/50 dark:bg-slate-950/40">
          <button
            onClick={() => setActiveTab('storage')}
            className={`py-3 px-4 font-bold text-xs border-b-2 flex items-center gap-2 transition-all ${
              activeTab === 'storage'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>Data Path &amp; LAN Storage</span>
          </button>
          <button
            onClick={() => setActiveTab('tally')}
            className={`py-3 px-4 font-bold text-xs border-b-2 flex items-center gap-2 transition-all ${
              activeTab === 'tally'
                ? 'border-pink-600 text-pink-600 dark:text-pink-400 dark:border-pink-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Server className="w-4 h-4" />
            <span>TallyPrime Live Bridge</span>
          </button>
          <button
            onClick={() => setActiveTab('appearance')}
            className={`py-3 px-4 font-bold text-xs border-b-2 flex items-center gap-2 transition-all ${
              activeTab === 'appearance'
                ? 'border-amber-600 text-amber-600 dark:text-amber-400 dark:border-amber-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Theme &amp; Preferences</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* TAB 1: DATA STORAGE PATH */}
          {activeTab === 'storage' && (
            <div className="space-y-5 animate-fadeIn">
              <div className="p-4 rounded-2xl bg-blue-50/60 dark:bg-blue-500/5 border border-blue-200/60 dark:border-blue-500/20 text-xs text-slate-600 dark:text-slate-300 space-y-1">
                <p className="font-bold text-blue-900 dark:text-blue-300 flex items-center gap-1.5">
                  <HardDrive className="w-4 h-4 text-blue-600" />
                  Centralized Returns &amp; Client Database Storage
                </p>
                <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                  All GSTR-2B batches, GSTR-1 matrices, IMS client actions, and reconciliation workbooks are saved in this folder. Set a shared LAN directory (e.g. <code className="font-mono bg-white dark:bg-slate-800 px-1 py-0.5 rounded border border-blue-200">\\SERVER\ReturnsData</code>) to allow multi-user office synchronization.
                </p>
              </div>

              {/* Current Active Path */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Current Active Storage Path
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 font-mono text-xs text-slate-800 dark:text-slate-200 truncate select-all">
                    {isLoadingStorage ? 'Loading server path...' : currentDataPath || 'Local application directory'}
                  </div>
                  <button
                    onClick={() => {
                      if (currentDataPath) {
                        navigator.clipboard.writeText(currentDataPath);
                        toast.success('Path copied to clipboard');
                      }
                    }}
                    className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all shadow-sm"
                    title="Copy path"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Modify Path Input */}
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Change Data Storage Directory
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newPathInput}
                    onChange={(e) => setNewPathInput(e.target.value)}
                    placeholder="e.g. D:\VaswaniReturnsData or \\SERVER\SharedReturns"
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                  <button
                    onClick={handleSaveDataPath}
                    disabled={isSavingStorage}
                    className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs shadow-md shadow-blue-500/10 flex items-center gap-1.5 transition-all disabled:opacity-50"
                  >
                    {isSavingStorage ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    <span>Save Path</span>
                  </button>
                </div>
              </div>

              {/* Server Host & IPs */}
              {serverIps.length > 0 && (
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 flex items-center justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1.5">
                    <Laptop className="w-4 h-4 text-slate-400" /> Server LAN IP:
                  </span>
                  <div className="flex gap-1.5 font-mono text-[11px] font-bold text-slate-800 dark:text-slate-200">
                    {serverIps.slice(0, 3).map((ip, i) => (
                      <span key={i} className="px-2 py-0.5 rounded bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600">
                        {ip}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: TALLYPRIME LIVE BRIDGE */}
          {activeTab === 'tally' && (
            <div className="space-y-5 animate-fadeIn">
              <div className="p-4 rounded-2xl bg-pink-50/60 dark:bg-pink-500/5 border border-pink-200/60 dark:border-pink-500/20 text-xs text-slate-600 dark:text-slate-300 space-y-1">
                <p className="font-bold text-pink-900 dark:text-pink-300 flex items-center gap-1.5">
                  <Server className="w-4 h-4 text-pink-600" />
                  Real-Time TallyPrime Direct XML Bridge (Port 9000)
                </p>
                <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                  Connects directly to the TallyPrime XML Server running on your workstation or LAN server to fetch Daybooks, Trial Balances, Purchase Vouchers, and TDS records without manual Excel export.
                </p>
              </div>

              {/* Host & Port Configuration */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Tally Host IP / Domain</label>
                  <input
                    type="text"
                    value={tallyHost}
                    onChange={(e) => setTallyHost(e.target.value)}
                    placeholder="localhost or 192.168.1.50"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">XML Port</label>
                  <input
                    type="number"
                    value={tallyPort}
                    onChange={(e) => setTallyPort(Number(e.target.value))}
                    placeholder="9000"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500"
                  />
                </div>
              </div>

              {/* Connection Status Box */}
              <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 block">Bridge Status</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    {tallyStatus === 'online' && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        TallyPrime Online &amp; Ready
                      </span>
                    )}
                    {tallyStatus === 'offline' && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-600 dark:text-rose-400">
                        <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                        Tally Server Unreachable
                      </span>
                    )}
                    {tallyStatus === 'unknown' && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500">
                        <span className="w-2.5 h-2.5 rounded-full bg-slate-400"></span>
                        Status Unverified
                      </span>
                    )}
                  </div>
                  {tallyCompany && (
                    <span className="text-[11px] text-slate-600 dark:text-slate-300 font-medium block mt-1">
                      Active Company: <strong className="text-slate-900 dark:text-white">{tallyCompany}</strong>
                    </span>
                  )}
                </div>

                <button
                  onClick={handleTestTally}
                  disabled={isTestingTally}
                  className="px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-700 text-white font-bold text-xs shadow-md shadow-pink-500/10 flex items-center gap-1.5 transition-all disabled:opacity-50"
                >
                  {isTestingTally ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  <span>Test Connection</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: THEME & PREFERENCES */}
          {activeTab === 'appearance' && (
            <div className="space-y-5 animate-fadeIn">
              <div className="p-4 rounded-2xl bg-amber-50/60 dark:bg-amber-500/5 border border-amber-200/60 dark:border-amber-500/20 text-xs text-slate-600 dark:text-slate-300 space-y-1">
                <p className="font-bold text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-600" />
                  Luminous Fluid Corporate Experience
                </p>
                <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                  Clean Apple &amp; Stripe-inspired visual hierarchy with responsive micro-animations, elevated frosted cards, and monospaced financial tables.
                </p>
              </div>

              <div className="space-y-3">
                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-900 dark:text-white block">Fluid Micro-Animations</span>
                    <span className="text-[11px] text-slate-500">60 FPS spring transitions on cards, buttons, and drawers</span>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold text-xs">
                    Enabled
                  </span>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-900 dark:text-white block">Zero-Merge Table Architecture</span>
                    <span className="text-[11px] text-slate-500">Ensures all Excel exports remain 100% sortable &amp; XLOOKUP safe</span>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 font-bold text-xs">
                    Active
                  </span>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-900 dark:text-white block">Tabular Figures (JetBrains Mono)</span>
                    <span className="text-[11px] text-slate-500">Guarantees razor-sharp vertical alignment for multi-currency values</span>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 font-bold text-xs">
                    Locked
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 flex items-center justify-between">
          <span className="text-[10px] font-mono text-slate-400">
            VASWANI ENTERPRISE • ALL CONFIGURATIONS PERSISTED
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold text-xs hover:opacity-90 transition-all shadow-sm"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
