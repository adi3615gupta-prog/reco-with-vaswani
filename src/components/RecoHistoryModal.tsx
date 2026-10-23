import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Cloud, History, RefreshCw, X, FolderOpen, Trash2, Calendar, FileText, CheckCircle2, AlertCircle, ArrowRight, HardDrive } from 'lucide-react';
import {
  listDriveRecoSnapshots,
  downloadDriveRecoSnapshot,
  deleteDriveRecoSnapshot,
  checkGDriveStatus,
  listLocalRecoSnapshots,
  downloadLocalRecoSnapshot,
  deleteLocalRecoSnapshot,
  type RecoSnapshotMeta,
  type RecoSnapshotPayload
} from '@/lib/gdrive';
import { toast } from 'sonner';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onRestoreSession: (payload: RecoSnapshotPayload) => void;
  onOpenConnectModal?: () => void;
}

const fmt = (n: number) =>
  n === 0 ? '0.00' : new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

export function RecoHistoryModal({ isOpen, onClose, onRestoreSession, onOpenConnectModal }: Props) {
  const [activeTab, setActiveTab] = useState<'local' | 'gdrive'>('local');
  const [snapshots, setSnapshots] = useState<RecoSnapshotMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [isConfigured, setIsConfigured] = useState(false);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      if (activeTab === 'local') {
        const localFiles = await listLocalRecoSnapshots();
        setSnapshots(localFiles);
      } else {
        const status = await checkGDriveStatus();
        setIsConfigured(status.configured);
        if (!status.configured) {
          setSnapshots([]);
          return;
        }
        const files = await listDriveRecoSnapshots();
        setSnapshots(files);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to fetch history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchHistory();
    }
  }, [isOpen, activeTab]);

  if (!isOpen) return null;

  const handleRestore = async (fileId: string) => {
    setRestoringId(fileId);
    try {
      const payload = activeTab === 'local'
        ? await downloadLocalRecoSnapshot(fileId)
        : await downloadDriveRecoSnapshot(fileId);
      onRestoreSession(payload);
      toast.success(`Restored session: ${payload.companyName} (${payload.financialYear}) successfully!`);
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to download snapshot payload');
    } finally {
      setRestoringId(null);
    }
  };

  const handleDelete = async (fileId: string, fileName: string) => {
    if (!confirm(`Are you sure you want to delete snapshot '${fileName}'?`)) return;
    try {
      if (activeTab === 'local') {
        await deleteLocalRecoSnapshot(fileId);
      } else {
        await deleteDriveRecoSnapshot(fileId);
      }
      toast.success(`Deleted snapshot '${fileName}'`);
      setSnapshots(snapshots.filter((s) => s.id !== fileId));
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete snapshot');
    }
  };

  return createPortal(
    <>
      <div className="fixed inset-0 z-[99999] bg-black/75 backdrop-blur-md" onClick={onClose} />
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto bg-slate-900 border border-sky-500/40 rounded-3xl shadow-2xl shadow-sky-500/20 w-full max-w-4xl overflow-hidden animate-in zoom-in-95 fade-in duration-200">
          
          {/* Header */}
          <div className="bg-gradient-to-r from-sky-950 via-indigo-950 to-slate-900 px-6 py-5 flex items-center justify-between border-b border-sky-500/30">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center shadow-lg">
                <History className="w-5 h-5 text-sky-300 animate-pulse" />
              </div>
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-wider">Reconciliation History & Backups</h3>
                <p className="text-[10.5px] text-sky-200/70 mt-0.5">Open, inspect, and restore previous reconciliation sessions</p>
              </div>
            </div>
            
            {/* Tab Switcher */}
            <div className="flex items-center gap-2 bg-slate-950/80 p-1 border border-slate-800 rounded-2xl">
              <button
                onClick={() => setActiveTab('local')}
                className={`px-3 py-1.5 rounded-xl font-black text-[10px] uppercase tracking-wider flex items-center gap-1.5 transition-all ${
                  activeTab === 'local'
                    ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <HardDrive className="w-3.5 h-3.5" />
                Local PC History
              </button>
              <button
                onClick={() => setActiveTab('gdrive')}
                className={`px-3 py-1.5 rounded-xl font-black text-[10px] uppercase tracking-wider flex items-center gap-1.5 transition-all ${
                  activeTab === 'gdrive'
                    ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Cloud className="w-3.5 h-3.5" />
                Google Drive
              </button>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={fetchHistory}
                disabled={loading}
                className="p-2 hover:bg-slate-800 text-slate-400 hover:text-sky-300 rounded-xl transition-colors"
                title="Refresh history"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="p-6 max-h-[65vh] overflow-y-auto custom-scrollbar">
            
            {activeTab === 'gdrive' && !isConfigured ? (
              <div className="p-12 text-center space-y-4 bg-slate-950/60 border border-slate-800 rounded-2xl">
                <div className="w-12 h-12 rounded-full bg-sky-500/10 border border-sky-500/30 mx-auto flex items-center justify-center">
                  <Cloud className="w-6 h-6 text-sky-400" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-white uppercase tracking-wider">Google Drive Disconnected</h4>
                  <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
                    Connect your Google Drive account to view, search, and restore your past cloud reconciliation snapshots.
                  </p>
                </div>
                <button
                  onClick={() => {
                    onClose();
                    onOpenConnectModal?.();
                  }}
                  className="px-6 py-2.5 bg-gradient-to-r from-sky-600 to-indigo-600 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-lg shadow-sky-500/20 hover:scale-105 transition-all"
                >
                  Connect Google Drive
                </button>
              </div>
            ) : loading ? (
              <div className="p-16 text-center space-y-3">
                <RefreshCw className="w-8 h-8 text-sky-400 animate-spin mx-auto" />
                <p className="text-xs font-bold text-slate-300 uppercase tracking-widest">
                  Fetching {activeTab === 'local' ? 'Local PC' : 'Google Drive'} snapshots...
                </p>
              </div>
            ) : snapshots.length === 0 ? (
              <div className="p-12 text-center space-y-3 bg-slate-950/60 border border-slate-800 rounded-2xl">
                <FileText className="w-10 h-10 text-slate-600 mx-auto" />
                <div>
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">No Saved Snapshots Found</h4>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Run a reconciliation and click <strong>'{activeTab === 'local' ? 'Save Session to PC' : 'Save to Drive'}'</strong> to store a backup.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {snapshots.map((snap) => {
                  const isRestoring = restoringId === snap.id;
                  const dateStr = snap.createdTime ? new Date(snap.createdTime).toLocaleString('en-IN', {
                    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                  }) : 'Unknown Date';

                  return (
                    <div
                      key={snap.id}
                      className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 hover:border-sky-500/40 transition-all flex flex-wrap items-center justify-between gap-4 group"
                    >
                      <div className="flex items-center gap-4 min-w-0 flex-1">
                        <div className="w-10 h-10 rounded-xl bg-purple-950/60 border border-purple-500/30 flex items-center justify-center flex-shrink-0 group-hover:border-sky-400/50 transition-colors">
                          <FolderOpen className="w-5 h-5 text-purple-300 group-hover:text-sky-300 transition-colors" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-extrabold text-sm text-white truncate uppercase tracking-wide">
                              {snap.companyName}
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-emerald-950 border border-emerald-500/30 text-[9.5px] font-mono font-bold text-emerald-300">
                              {snap.moduleName || (snap.moduleType === 'tds-reco' ? 'TDS Audit & Reco' : 'GST 2B Reco')}
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-sky-950 border border-sky-500/30 text-[9.5px] font-mono font-bold text-sky-300">
                              {snap.financialYear}
                            </span>
                          </div>

                          <div className="flex items-center gap-4 mt-1.5 text-[10px] text-slate-400 font-mono">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-slate-500" />
                              {dateStr}
                            </span>
                            <span>{snap.invoiceCount} invoices</span>
                            {snap.totalVariance !== 0 ? (
                              <span className="text-yellow-400 font-bold">₹{fmt(snap.totalVariance)} variance</span>
                            ) : (
                              <span className="text-emerald-400 font-bold flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> All Matched
                              </span>
                            )}
                            {snap.fileSize && <span className="text-slate-500">{snap.fileSize}</span>}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleDelete(snap.id, snap.name)}
                          className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-rose-500/50 text-slate-400 hover:text-rose-400 transition-colors"
                          title="Delete snapshot"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => handleRestore(snap.id)}
                          disabled={isRestoring}
                          className="px-4 py-2.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 disabled:opacity-50 text-white rounded-xl font-bold text-[11px] uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-sky-500/20 transition-all hover:scale-105 active:scale-95"
                        >
                          {isRestoring ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              Restoring...
                            </>
                          ) : (
                            <>
                              <ArrowRight className="w-3.5 h-3.5" />
                              Restore Session
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between">
            <span className="text-[10px] font-mono text-slate-500">
              {snapshots.length} cloud snapshot{snapshots.length === 1 ? '' : 's'} available
            </span>
            <button
              onClick={onClose}
              className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all"
            >
              Close History
            </button>
          </div>

        </div>
      </div>
    </>,
    document.body
  );
}
