import React, { useState, useEffect } from 'react';
import { 
    ShieldAlert, 
    FileText, 
    Download, 
    RefreshCw, 
    Clock, 
    AlertTriangle, 
    CheckCircle2, 
    ExternalLink, 
    Copy, 
    Check, 
    Sparkles, 
    Calendar, 
    Paperclip, 
    X,
    Filter,
    FileSpreadsheet,
    Scale,
    Printer
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { reconcileNoticeDiscrepancy, generateNoticeAnnexureExcel, NoticeReconciliationResult } from '@/lib/noticeReconciliation';
import { generateAsmt11Reply, generateDrc06Reply } from '@/lib/noticeReplyGenerator';
import * as XLSX from 'xlsx';

interface GstNotice {
    id: string;
    client_gstin: string;
    portal_source: string;
    notice_type: string;
    form_description: string;
    reference_no: string;
    din: string;
    financial_year: string;
    tax_period: string;
    issue_date: string;
    due_date: string;
    issuing_officer: string;
    issuing_jurisdiction: string;
    section_cited: string;
    tax_demanded: number;
    interest_demanded: number;
    penalty_demanded: number;
    total_demanded: number;
    status: string;
    alert?: {
        status: string;
        daysRemaining: number;
        badgeColor: string;
        label: string;
    };
    attachments?: Array<{
        id: string;
        file_name: string;
        file_type: string;
        file_path: string;
    }>;
}

export default function GstNoticesDashboard() {
    const { toast } = useToast();
    const [notices, setNotices] = useState<GstNotice[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [scanning, setScanning] = useState<boolean>(false);
    const [scanMessage, setScanMessage] = useState<string>('');
    const [activeFilter, setActiveFilter] = useState<string>('ALL');
    const [selectedNotice, setSelectedNotice] = useState<GstNotice | null>(null);
    const [inspectorOpen, setInspectorOpen] = useState<boolean>(false);
    const [recoModalOpen, setRecoModalOpen] = useState<boolean>(false);
    const [recoResult, setRecoResult] = useState<NoticeReconciliationResult | null>(null);
    const [replyModalOpen, setReplyModalOpen] = useState<boolean>(false);
    const [replyDraft, setReplyDraft] = useState<{ html: string; text: string; subject: string; formName: string } | null>(null);
    const [selectedReplyForm, setSelectedReplyForm] = useState<'ASMT-11' | 'DRC-06'>('ASMT-11');
    const [copiedField, setCopiedField] = useState<string | null>(null);

    // Active client from local storage or default
    const [currentGstin, setCurrentGstin] = useState<string>(() => {
        return localStorage.getItem('last_active_gstin') || '27AABCS1429B1Z1';
    });

    const fetchNotices = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/notices/${currentGstin}`);
            const data = await res.json();
            if (data.success) {
                setNotices(data.notices || []);
            }
        } catch (e: any) {
            console.error('Error loading notices:', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchNotices();
    }, [currentGstin]);

    const handleCopy = (text: string, fieldId: string) => {
        navigator.clipboard.writeText(text);
        setCopiedField(fieldId);
        toast({ title: 'Copied to Clipboard', description: text });
        setTimeout(() => setCopiedField(null), 2000);
    };

    const handleStartAutopilotScan = async () => {
        setScanning(true);
        setScanMessage('Initializing Playwright browser cascade...');
        try {
            const response = await fetch('/api/notices/autopilot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gstin: currentGstin })
            });

            if (!response.body) throw new Error('No SSE stream available');

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');
                for (const line of lines) {
                    if (line.startsWith('data:')) {
                        try {
                            const payload = JSON.parse(line.replace('data:', '').trim());
                            if (payload.message) setScanMessage(payload.message);
                            if (payload.error) {
                                toast({ title: 'Autopilot Notice', description: payload.error, variant: 'destructive' });
                            }
                        } catch (e) {}
                    }
                }
            }
        } catch (err: any) {
            toast({ title: 'Scan Error', description: err.message, variant: 'destructive' });
        } finally {
            setScanning(false);
            setScanMessage('');
            fetchNotices();
        }
    };

    const handleInspect = async (notice: GstNotice) => {
        setSelectedNotice(notice);
        setInspectorOpen(true);
        try {
            const res = await fetch(`/api/notices/detail/${notice.id}`);
            const data = await res.json();
            if (data.success && data.notice) {
                setSelectedNotice(data.notice);
            }
        } catch (e) {}
    };

    const handleOpenReconciliation = async (notice: GstNotice) => {
        setSelectedNotice(notice);
        setRecoModalOpen(true);
        try {
            const result = reconcileNoticeDiscrepancy({
                noticeId: notice.id,
                referenceNo: notice.reference_no,
                gstin: notice.client_gstin,
                financialYear: notice.financial_year,
                taxPeriod: notice.tax_period,
                totalDemanded: notice.total_demanded
            }, { twoBInvoices: [] });
            setRecoResult(result);
        } catch (e) {}
    };

    const handleOpenReplyStudio = (notice: GstNotice) => {
        setSelectedNotice(notice);
        const result = reconcileNoticeDiscrepancy({
            noticeId: notice.id,
            referenceNo: notice.reference_no,
            gstin: notice.client_gstin,
            financialYear: notice.financial_year,
            taxPeriod: notice.tax_period,
            totalDemanded: notice.total_demanded
        }, { twoBInvoices: [] });

        setRecoResult(result);

        // Auto select form based on notice type
        const isDrc = notice.notice_type.includes('DRC') || notice.notice_type.includes('SCN');
        const formType = isDrc ? 'DRC-06' : 'ASMT-11';
        setSelectedReplyForm(formType);

        const draft = formType === 'DRC-06'
            ? generateDrc06Reply(notice, result, { companyLegalName: notice.client_gstin })
            : generateAsmt11Reply(notice, result, { companyLegalName: notice.client_gstin });

        setReplyDraft(draft);
        setReplyModalOpen(true);
    };

    const handleExportAnnexure = (reco: NoticeReconciliationResult) => {
        if (!selectedNotice) return;
        const wb = generateNoticeAnnexureExcel(reco, {
            companyName: selectedNotice.client_gstin,
            officerName: selectedNotice.issuing_officer
        });
        XLSX.writeFile(wb, `Notice_Annexure_${selectedNotice.reference_no}.xlsx`);
        toast({ title: 'Export Generated', description: 'Zero-Merge Excel Annexure saved.' });
    };

    // Filter notices
    const filteredNotices = notices.filter(n => {
        if (activeFilter === 'ALL') return true;
        if (activeFilter === 'PENDING') return n.status === 'PENDING_REPLY';
        if (activeFilter === 'ASMT') return n.notice_type.includes('ASMT');
        if (activeFilter === 'DRC') return n.notice_type.includes('DRC');
        if (activeFilter === 'CLOSED') return n.status === 'CLOSED' || n.status === 'REPLIED';
        return true;
    });

    // KPI sums
    const totalCount = notices.length;
    const pendingCount = notices.filter(n => n.status === 'PENDING_REPLY').length;
    const urgentCount = notices.filter(n => n.alert?.status === 'CRITICAL' || n.alert?.status === 'URGENT').length;
    const totalDemandedSum = notices.reduce((sum, n) => sum + (n.total_demanded || 0), 0);

    return (
        <div className="min-h-screen bg-[#090D16] text-slate-100 p-6 space-y-6">
            {/* Header Title & Autopilot Action */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-5">
                <div>
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                            <ShieldAlert className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
                                GST Notices & Orders Autonomous Suite
                                <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-400 border-amber-500/30">
                                    Phase 12
                                </Badge>
                            </h1>
                            <p className="text-xs text-slate-400 mt-0.5">
                                Autonomous 1-login portal scraping, limitation countdown calendar & AI statutory defense engine
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <Button
                        onClick={handleStartAutopilotScan}
                        disabled={scanning}
                        className="bg-amber-500 hover:bg-amber-600 text-black font-bold text-xs px-4 py-2 rounded-lg shadow-lg shadow-amber-500/20 transition-all flex items-center gap-2"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
                        {scanning ? 'Scanning Portal...' : 'Scan Portal Notices'}
                    </Button>
                </div>
            </div>

            {/* Scanning Progress Banner */}
            {scanning && (
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <RefreshCw className="w-4 h-4 text-amber-400 animate-spin" />
                        <span className="text-xs font-mono text-amber-300">{scanMessage}</span>
                    </div>
                    <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={() => fetch('/api/notices/autopilot/cancel', { method: 'POST' })}
                        className="text-xs text-slate-400 hover:text-white"
                    >
                        Cancel
                    </Button>
                </div>
            )}

            {/* 4-Card KPI Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-slate-900/60 border border-white/10 backdrop-blur-md">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-400">Total Notices Scanned</span>
                        <FileText className="w-4 h-4 text-blue-400" />
                    </div>
                    <p className="text-2xl font-black font-mono text-white mt-2">{totalCount}</p>
                    <p className="text-[11px] text-slate-400 mt-1">Across 3 portal endpoints</p>
                </div>

                <div className="p-4 rounded-xl bg-slate-900/60 border border-amber-500/30 backdrop-blur-md bg-amber-500/5">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-amber-400">Action Required (&le; 7 Days)</span>
                        <Clock className="w-4 h-4 text-amber-400" />
                    </div>
                    <p className="text-2xl font-black font-mono text-amber-300 mt-2">{urgentCount}</p>
                    <p className="text-[11px] text-amber-400/80 mt-1">Imminent statutory deadlines</p>
                </div>

                <div className="p-4 rounded-xl bg-slate-900/60 border border-white/10 backdrop-blur-md">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-400">Total Disputed Demand</span>
                        <Scale className="w-4 h-4 text-red-400" />
                    </div>
                    <p className="text-2xl font-black font-mono text-white mt-2">
                        ₹{totalDemandedSum.toLocaleString('en-IN')}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">Tax, Interest & Penalties</p>
                </div>

                <div className="p-4 rounded-xl bg-slate-900/60 border border-emerald-500/30 backdrop-blur-md bg-emerald-500/5">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-emerald-400">Replied / Closed</span>
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    </div>
                    <p className="text-2xl font-black font-mono text-emerald-300 mt-2">
                        {totalCount - pendingCount}
                    </p>
                    <p className="text-[11px] text-emerald-400/80 mt-1">Formal closures & replies filed</p>
                </div>
            </div>

            {/* Filter Pills Toolbar */}
            <div className="flex flex-wrap items-center gap-2">
                {[
                    { id: 'ALL', label: 'All Notices' },
                    { id: 'PENDING', label: 'Pending Reply' },
                    { id: 'ASMT', label: 'Scrutiny (ASMT-10)' },
                    { id: 'DRC', label: 'Demand SCN (DRC-01/01B)' },
                    { id: 'CLOSED', label: 'Closed / Replied' }
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveFilter(tab.id)}
                        className={`text-xs px-3.5 py-1.5 rounded-full font-medium transition-all ${
                            activeFilter === tab.id
                                ? 'bg-amber-500 text-black font-bold shadow-md shadow-amber-500/20'
                                : 'bg-slate-800/60 text-slate-300 hover:bg-slate-800 border border-white/5'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Main Notices Ledger Table */}
            <div className="rounded-xl border border-white/10 bg-slate-900/60 backdrop-blur-md overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead className="bg-[#0c1220] border-b border-white/10 text-slate-400 font-mono uppercase tracking-wider text-[11px]">
                            <tr>
                                <th className="py-3 px-4">Form / Type</th>
                                <th className="py-3 px-4">Reference / DIN</th>
                                <th className="py-3 px-4">Period</th>
                                <th className="py-3 px-4">Issue Date</th>
                                <th className="py-3 px-4">Due Date & Countdown</th>
                                <th className="py-3 px-4 text-right">Demanded (₹)</th>
                                <th className="py-3 px-4 text-center">Status</th>
                                <th className="py-3 px-4 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 text-slate-300">
                            {filteredNotices.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="py-8 text-center text-slate-400">
                                        {loading ? 'Loading notices...' : 'No notices found for this client. Click "Scan Portal Notices" to fetch.'}
                                    </td>
                                </tr>
                            ) : (
                                filteredNotices.map((n) => {
                                    const alertColor = n.alert?.badgeColor === 'crimson' 
                                        ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                                        : n.alert?.badgeColor === 'red'
                                        ? 'bg-red-500/10 text-red-400 border-red-500/30'
                                        : n.alert?.badgeColor === 'amber'
                                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';

                                    return (
                                        <tr key={n.id} className="hover:bg-blue-500/5 transition-colors">
                                            <td className="py-3 px-4">
                                                <div className="font-bold text-white flex items-center gap-2">
                                                    <span className="p-1 rounded bg-slate-800 text-blue-400 font-mono text-[10px]">
                                                        {n.notice_type}
                                                    </span>
                                                    <span className="truncate max-w-[180px]" title={n.form_description}>
                                                        {n.form_description || n.notice_type}
                                                    </span>
                                                </div>
                                            </td>

                                            <td className="py-3 px-4 font-mono text-[11px]">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-slate-200">{n.reference_no}</span>
                                                    <button 
                                                        onClick={() => handleCopy(n.reference_no, n.id)}
                                                        className="text-slate-400 hover:text-white"
                                                    >
                                                        {copiedField === n.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                                    </button>
                                                </div>
                                                {n.din && <div className="text-[10px] text-slate-400">DIN: {n.din}</div>}
                                            </td>

                                            <td className="py-3 px-4 font-mono">
                                                {n.financial_year} {n.tax_period ? `(${n.tax_period})` : ''}
                                            </td>

                                            <td className="py-3 px-4 font-mono text-slate-400">
                                                {n.issue_date || 'N/A'}
                                            </td>

                                            <td className="py-3 px-4">
                                                <Badge variant="outline" className={`text-[10px] font-mono px-2 py-0.5 ${alertColor}`}>
                                                    {n.alert?.label || n.due_date || 'No Date'}
                                                </Badge>
                                            </td>

                                            <td className="py-3 px-4 text-right font-mono font-bold text-white">
                                                ₹{Number(n.total_demanded || 0).toLocaleString('en-IN')}
                                            </td>

                                            <td className="py-3 px-4 text-center">
                                                <Badge variant="outline" className="text-[10px] bg-slate-800 text-slate-300 border-white/10">
                                                    {n.status}
                                                </Badge>
                                            </td>

                                            <td className="py-3 px-4">
                                                <div className="flex items-center justify-center gap-1.5">
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => handleInspect(n)}
                                                        className="h-7 text-[11px] px-2 text-slate-300 hover:text-white hover:bg-slate-800"
                                                    >
                                                        Inspect
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => handleOpenReconciliation(n)}
                                                        className="h-7 text-[11px] px-2 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                                                    >
                                                        Reconcile
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        onClick={() => handleOpenReplyStudio(n)}
                                                        className="h-7 text-[11px] px-2.5 bg-purple-600/80 hover:bg-purple-600 text-white font-medium rounded"
                                                    >
                                                        Draft Reply
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Slide-over Notice Inspector Drawer */}
            {inspectorOpen && selectedNotice && (
                <div className="fixed inset-y-0 right-0 w-full sm:w-[500px] bg-[#0c1220] border-l border-white/10 p-6 z-50 shadow-2xl flex flex-col justify-between overflow-y-auto">
                    <div className="space-y-5">
                        <div className="flex items-center justify-between border-b border-white/10 pb-3">
                            <div>
                                <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-500/30">
                                    {selectedNotice.notice_type}
                                </Badge>
                                <h3 className="text-base font-bold text-white mt-1">Notice Details Inspector</h3>
                            </div>
                            <Button size="sm" variant="ghost" onClick={() => setInspectorOpen(false)}>
                                <X className="w-4 h-4 text-slate-400" />
                            </Button>
                        </div>

                        <div className="space-y-3 text-xs">
                            <div className="p-3 rounded-lg bg-slate-900 border border-white/5 space-y-1">
                                <span className="text-slate-400 text-[11px]">Notice Reference Number</span>
                                <p className="font-mono font-bold text-white">{selectedNotice.reference_no}</p>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="p-3 rounded-lg bg-slate-900 border border-white/5 space-y-1">
                                    <span className="text-slate-400 text-[11px]">Issue Date</span>
                                    <p className="font-mono text-white">{selectedNotice.issue_date || 'N/A'}</p>
                                </div>
                                <div className="p-3 rounded-lg bg-slate-900 border border-white/5 space-y-1">
                                    <span className="text-slate-400 text-[11px]">Response Due Date</span>
                                    <p className="font-mono text-amber-400 font-bold">{selectedNotice.due_date || 'N/A'}</p>
                                </div>
                            </div>

                            <div className="p-3 rounded-lg bg-slate-900 border border-white/5 space-y-1">
                                <span className="text-slate-400 text-[11px]">Issuing Authority</span>
                                <p className="text-white">{selectedNotice.issuing_officer || 'The Proper Officer'}</p>
                                <p className="text-slate-400 text-[11px]">{selectedNotice.issuing_jurisdiction || 'Jurisdiction'}</p>
                            </div>

                            <div className="p-3 rounded-lg bg-slate-900 border border-white/5 space-y-2">
                                <span className="text-slate-400 text-[11px]">Demanded Liabilities Breakdown</span>
                                <div className="grid grid-cols-3 gap-2 font-mono text-[11px] text-center">
                                    <div className="p-2 rounded bg-slate-800/60">
                                        <div className="text-slate-400 text-[10px]">Tax</div>
                                        <div className="text-white">₹{selectedNotice.tax_demanded || 0}</div>
                                    </div>
                                    <div className="p-2 rounded bg-slate-800/60">
                                        <div className="text-slate-400 text-[10px]">Interest</div>
                                        <div className="text-white">₹{selectedNotice.interest_demanded || 0}</div>
                                    </div>
                                    <div className="p-2 rounded bg-slate-800/60">
                                        <div className="text-slate-400 text-[10px]">Penalty</div>
                                        <div className="text-white">₹{selectedNotice.penalty_demanded || 0}</div>
                                    </div>
                                </div>
                            </div>

                            {/* Attachments Section */}
                            <div className="space-y-2 pt-2">
                                <span className="text-slate-400 text-[11px] font-bold">Downloaded Evidence & Attachments</span>
                                {(!selectedNotice.attachments || selectedNotice.attachments.length === 0) ? (
                                    <p className="text-slate-400 text-[11px] italic">No local attachments found.</p>
                                ) : (
                                    selectedNotice.attachments.map(att => (
                                        <div key={att.id} className="p-2.5 rounded bg-slate-900 border border-white/10 flex items-center justify-between">
                                            <div className="flex items-center gap-2 truncate">
                                                <Paperclip className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                                                <span className="truncate text-slate-200">{att.file_name}</span>
                                            </div>
                                            <a 
                                                href={`/api/notices/attachment/download/${att.id}`} 
                                                download 
                                                className="text-xs text-blue-400 hover:text-blue-300 font-medium ml-2"
                                            >
                                                Download
                                            </a>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="border-t border-white/10 pt-4 mt-6 flex gap-3">
                        <Button
                            onClick={() => {
                                setInspectorOpen(false);
                                handleOpenReconciliation(selectedNotice);
                            }}
                            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs"
                        >
                            Cross-Reconcile
                        </Button>
                        <Button
                            onClick={() => {
                                setInspectorOpen(false);
                                handleOpenReplyStudio(selectedNotice);
                            }}
                            className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-medium text-xs"
                        >
                            Draft Reply
                        </Button>
                    </div>
                </div>
            )}

            {/* Reconciliation Modal */}
            <Dialog open={recoModalOpen} onOpenChange={setRecoModalOpen}>
                <DialogContent className="max-w-2xl bg-[#0c1220] border-white/10 text-white">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-base font-bold">
                            <Scale className="w-5 h-5 text-blue-400" />
                            Multi-Return Cross-Reconciliation Proof
                        </DialogTitle>
                    </DialogHeader>

                    {recoResult && (
                        <div className="space-y-4 text-xs">
                            <div className="grid grid-cols-3 gap-3 p-3 rounded-lg bg-slate-900 border border-white/10 font-mono">
                                <div>
                                    <span className="text-slate-400 text-[11px]">Notice Demanded</span>
                                    <p className="text-sm font-bold text-white">₹{recoResult.totalDemanded.toLocaleString('en-IN')}</p>
                                </div>
                                <div>
                                    <span className="text-emerald-400 text-[11px]">Verified & Explained</span>
                                    <p className="text-sm font-bold text-emerald-400">₹{recoResult.explainedAmount.toLocaleString('en-IN')}</p>
                                </div>
                                <div>
                                    <span className="text-slate-400 text-[11px]">Unexplained Residual</span>
                                    <p className="text-sm font-bold text-slate-300">₹{recoResult.unexplainedResidual.toLocaleString('en-IN')}</p>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <h4 className="font-bold text-slate-200">Identified Statutory Defenses:</h4>
                                {recoResult.explanations.map((exp, idx) => (
                                    <div key={idx} className="p-3 rounded-lg bg-slate-900/60 border border-white/10 space-y-1">
                                        <div className="flex justify-between items-center">
                                            <span className="font-bold text-blue-400">{exp.category}</span>
                                            <span className="font-mono text-emerald-400 font-bold">₹{exp.amount.toLocaleString('en-IN')}</span>
                                        </div>
                                        <p className="text-slate-300 text-[11px]"><strong>Ground:</strong> {exp.statutoryGround}</p>
                                        <p className="text-slate-400 text-[11px]">{exp.legalRemarks}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <DialogFooter className="flex justify-between items-center gap-3">
                        {recoResult && (
                            <Button 
                                variant="outline" 
                                onClick={() => handleExportAnnexure(recoResult)}
                                className="border-white/20 text-xs flex items-center gap-2 hover:bg-slate-800"
                            >
                                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                                Export Zero-Merge Annexure
                            </Button>
                        )}
                        <Button 
                            onClick={() => {
                                setRecoModalOpen(false);
                                if (selectedNotice) handleOpenReplyStudio(selectedNotice);
                            }}
                            className="bg-purple-600 hover:bg-purple-700 text-xs font-bold"
                        >
                            Proceed to Draft Reply
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Legal Reply Studio Modal */}
            <Dialog open={replyModalOpen} onOpenChange={setReplyModalOpen}>
                <DialogContent className="max-w-4xl bg-[#0c1220] border-white/10 text-white max-h-[90vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="flex items-center justify-between text-base font-bold pr-6">
                            <span className="flex items-center gap-2">
                                <Sparkles className="w-5 h-5 text-purple-400" />
                                Statutory Legal Reply Drafter Studio
                            </span>
                            <div className="flex gap-2">
                                <Button
                                    size="sm"
                                    variant={selectedReplyForm === 'ASMT-11' ? 'default' : 'outline'}
                                    onClick={() => {
                                        setSelectedReplyForm('ASMT-11');
                                        if (selectedNotice && recoResult) {
                                            setReplyDraft(generateAsmt11Reply(selectedNotice, recoResult, { companyLegalName: selectedNotice.client_gstin }));
                                        }
                                    }}
                                    className="text-xs h-7"
                                >
                                    Form ASMT-11
                                </Button>
                                <Button
                                    size="sm"
                                    variant={selectedReplyForm === 'DRC-06' ? 'default' : 'outline'}
                                    onClick={() => {
                                        setSelectedReplyForm('DRC-06');
                                        if (selectedNotice && recoResult) {
                                            setReplyDraft(generateDrc06Reply(selectedNotice, recoResult, { companyLegalName: selectedNotice.client_gstin }));
                                        }
                                    }}
                                    className="text-xs h-7"
                                >
                                    Form DRC-06
                                </Button>
                            </div>
                        </DialogTitle>
                    </DialogHeader>

                    {replyDraft && (
                        <div className="flex-1 overflow-y-auto p-4 rounded-lg bg-white text-slate-900 border border-white/10 my-2">
                            <div dangerouslySetInnerHTML={{ __html: replyDraft.html }} />
                        </div>
                    )}

                    <DialogFooter className="flex justify-between items-center gap-3 pt-3">
                        <Button 
                            variant="outline" 
                            onClick={() => {
                                if (replyDraft) handleCopy(replyDraft.text, 'draftText');
                            }}
                            className="border-white/20 text-xs flex items-center gap-2 hover:bg-slate-800"
                        >
                            <Copy className="w-3.5 h-3.5" />
                            Copy Plain Text
                        </Button>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                onClick={() => window.print()}
                                className="border-white/20 text-xs flex items-center gap-2 hover:bg-slate-800"
                            >
                                <Printer className="w-3.5 h-3.5" />
                                Print / Save PDF
                            </Button>
                            <Button 
                                onClick={async () => {
                                    if (!selectedNotice || !replyDraft) return;
                                    await fetch('/api/notices/reply/save', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            notice_id: selectedNotice.id,
                                            client_gstin: selectedNotice.client_gstin,
                                            reply_form: selectedReplyForm,
                                            reply_subject: replyDraft.subject,
                                            full_draft_html: replyDraft.html,
                                            status: 'DRAFT'
                                        })
                                    });
                                    toast({ title: 'Reply Draft Saved', description: 'Draft saved to database.' });
                                    setReplyModalOpen(false);
                                }}
                                className="bg-emerald-600 hover:bg-emerald-700 text-xs font-bold"
                            >
                                Save Draft to DB
                            </Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
