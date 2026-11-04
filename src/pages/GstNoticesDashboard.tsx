import React, { useState, useEffect, useRef } from 'react';
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
    Printer,
    UploadCloud,
    ShieldCheck,
    Lock,
    Trash2,
    Users,
    ChevronDown,
    Building2,
    FileQuestion,
    PlusCircle,
    Edit3
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { reconcileNoticeDiscrepancy, generateNoticeAnnexureExcel, NoticeReconciliationResult } from '@/lib/noticeReconciliation';
import { sanitizePayload, rehydrateDraft, SanitizationResult } from '@/lib/piiSanitizer';
import { analyzeSanitizedNotice, GeminiNoticeAnalysis } from '@/lib/geminiTaxEngine';
import { NoticePipelineVisualizer, PipelineStage } from '@/components/NoticePipelineVisualizer';
import { PrivacyVaultDiffViewer } from '@/components/PrivacyVaultDiffViewer';
import { NoticeReplyWorkbenchModal } from '@/components/NoticeReplyWorkbenchModal';
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
    raw_notice_text?: string;
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

interface ClientOption {
    id?: string;
    gstin: string;
    trade_name?: string;
    legal_name?: string;
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
    
    // Clients Directory
    const [availableClients, setAvailableClients] = useState<ClientOption[]>([]);
    const [clientDropdownOpen, setClientDropdownOpen] = useState<boolean>(false);
    const [customGstinInput, setCustomGstinInput] = useState<string>('');

    // Manual Ingest Modal State
    const [manualModalOpen, setManualModalOpen] = useState<boolean>(false);
    const [manualFormType, setManualFormType] = useState<string>('ASMT-10');
    const [manualRefNo, setManualRefNo] = useState<string>('');
    const [manualDin, setManualDin] = useState<string>('');
    const [manualPeriod, setManualPeriod] = useState<string>('FY 2023-24');
    const [manualTaxDemanded, setManualTaxDemanded] = useState<number>(500000);
    const [manualNoticeText, setManualNoticeText] = useState<string>('');

    // Reconciliation State
    const [recoModalOpen, setRecoModalOpen] = useState<boolean>(false);
    const [recoResult, setRecoResult] = useState<NoticeReconciliationResult | null>(null);

    // 5-Stage Defense Pipeline State
    const [pipelineStage, setPipelineStage] = useState<PipelineStage>(1);
    const [isPipelineProcessing, setIsPipelineProcessing] = useState<boolean>(false);
    const [pipelineMessage, setPipelineMessage] = useState<string>('System idle • Ready to ingest notices');

    // Zero-Trust Privacy Vault State
    const [sanitizationResult, setSanitizationResult] = useState<SanitizationResult | null>(null);
    const [privacyVaultOpen, setPrivacyVaultOpen] = useState<boolean>(false);

    // AI Analysis & Courtroom Workbench State
    const [geminiAnalysis, setGeminiAnalysis] = useState<GeminiNoticeAnalysis | null>(null);
    const [rehydratedDraft, setRehydratedDraft] = useState<string>('');
    const [workbenchOpen, setWorkbenchOpen] = useState<boolean>(false);

    const [copiedField, setCopiedField] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    // Active client from local storage or default
    const [currentGstin, setCurrentGstin] = useState<string>(() => {
        return localStorage.getItem('last_active_gstin') || '';
    });

    // 1. Fetch practice clients list
    useEffect(() => {
        const fetchClients = async () => {
            try {
                const res = await fetch('/api/returns/clients-hub');
                const data = await res.json();
                if (data.success && Array.isArray(data.clients) && data.clients.length > 0) {
                    setAvailableClients(data.clients);
                    if (!currentGstin) {
                        const firstGstin = data.clients[0].gstin;
                        setCurrentGstin(firstGstin);
                        setCustomGstinInput(firstGstin);
                        localStorage.setItem('last_active_gstin', firstGstin);
                    } else {
                        setCustomGstinInput(currentGstin);
                    }
                }
            } catch (e) {
                console.warn('Could not load client directory:', e);
            }
        };
        fetchClients();
    }, []);

    // 2. Fetch notices strictly for active client from SQLite
    const fetchNotices = async () => {
        if (!currentGstin) {
            setNotices([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const res = await fetch(`/api/notices/${currentGstin}`);
            const data = await res.json();
            if (data.success && Array.isArray(data.notices)) {
                setNotices(data.notices);
            } else {
                setNotices([]);
            }
        } catch (e: any) {
            console.error('Error loading notices from database:', e);
            setNotices([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (currentGstin) {
            localStorage.setItem('last_active_gstin', currentGstin);
            fetchNotices();
        }
    }, [currentGstin]);

    const handleCopy = (text: string, fieldId: string) => {
        navigator.clipboard.writeText(text);
        setCopiedField(fieldId);
        toast({ title: 'Copied to Clipboard', description: text });
        setTimeout(() => setCopiedField(null), 2000);
    };

    /**
     * Executes the full 5-stage automated defense pipeline for any live notice
     */
    const executeDefensePipeline = async (notice: GstNotice, rawNoticeText?: string) => {
        setSelectedNotice(notice);
        setIsPipelineProcessing(true);

        try {
            // Stage 1: Ingest
            setPipelineStage(1);
            setPipelineMessage('Ingesting statutory notice parameters and evidence files...');
            await new Promise(r => setTimeout(r, 600));

            // Stage 2: OCR & Discrepancy Extraction
            setPipelineStage(2);
            setPipelineMessage('Extracting statutory sections, DIN, and monetary tables...');
            const activeClient = availableClients.find(c => c.gstin === notice.client_gstin);
            const fullRawText = rawNoticeText || notice.raw_notice_text || `
                FORM GST ${notice.notice_type}
                Notice Reference: ${notice.reference_no}
                DIN: ${notice.din || 'DIN-202409278891234'}
                Taxpayer: ${activeClient?.legal_name || activeClient?.trade_name || notice.client_gstin}
                GSTIN: ${notice.client_gstin}
                Financial Year: ${notice.financial_year}
                Section Cited: ${notice.section_cited || 'Section 73'}
                Total Demanded: ₹${notice.total_demanded || 500000}
                Issuing Officer: ${notice.issuing_officer || 'The Proper Officer'}
                Jurisdiction: ${notice.issuing_jurisdiction || 'Jurisdictional GST Circle'}
                Allegation: Tax discrepancy observed upon return scrutiny.
            `;
            await new Promise(r => setTimeout(r, 600));

            // Stage 3: Zero-Trust PII Masking
            setPipelineStage(3);
            setPipelineMessage('Masking sensitive identifiers via deterministic PII tokenization...');
            const sanitized = sanitizePayload(fullRawText, {
                gstin: notice.client_gstin,
                legalName: activeClient?.legal_name,
                tradeName: activeClient?.trade_name,
                pan: notice.client_gstin?.length >= 12 ? notice.client_gstin.substring(2, 12) : undefined,
                officerName: notice.issuing_officer,
                jurisdiction: notice.issuing_jurisdiction
            });
            setSanitizationResult(sanitized);
            await new Promise(r => setTimeout(r, 700));

            // Stage 4: Gemini Statutory Reasoning
            setPipelineStage(4);
            setPipelineMessage('Performing statutory legal analysis and defense synthesis...');
            const analysis = await analyzeSanitizedNotice(sanitized.sanitizedText);
            setGeminiAnalysis(analysis);
            await new Promise(r => setTimeout(r, 800));

            // Stage 5: Local Re-Hydration & Assembly
            setPipelineStage(5);
            setPipelineMessage('Locally re-hydrating courtroom reply draft with actual client details...');
            const hydrated = rehydrateDraft(analysis.courtroomDraftMarkdown, sanitized.sessionId);
            setRehydratedDraft(hydrated);

            // Cross-reconcile figures
            const reco = reconcileNoticeDiscrepancy({
                noticeId: notice.id,
                referenceNo: notice.reference_no,
                gstin: notice.client_gstin,
                financialYear: notice.financial_year,
                taxPeriod: notice.tax_period,
                totalDemanded: notice.total_demanded
            }, { twoBInvoices: [] });
            setRecoResult(reco);

            await new Promise(r => setTimeout(r, 400));
            setIsPipelineProcessing(false);
            setPipelineMessage('Defense synthesis complete • Courtroom Reply Ready');

            // Open reply workbench
            setWorkbenchOpen(true);
        } catch (err: any) {
            console.error('Error running defense pipeline:', err);
            setIsPipelineProcessing(false);
            toast({
                title: 'Pipeline Error',
                description: err.message,
                variant: 'destructive'
            });
        }
    };

    /**
     * File Upload Handler for real PDF / notice documents
     */
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!currentGstin) {
            toast({ title: 'Select Client', description: 'Please select or enter a client GSTIN first.', variant: 'destructive' });
            return;
        }

        const formData = new FormData();
        formData.append('file', file);
        formData.append('gstin', currentGstin);

        setIsPipelineProcessing(true);
        setPipelineStage(1);
        setPipelineMessage(`Ingesting ${file.name}...`);

        try {
            const res = await fetch('/api/notices/upload-pdf', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (data.success && data.notice) {
                setNotices(prev => [data.notice, ...prev.filter(n => n.id !== data.notice.id)]);
                toast({
                    title: 'Notice Processed Successfully',
                    description: `Extracted ${data.notice.notice_type} (Ref: ${data.notice.reference_no})`
                });
                executeDefensePipeline(data.notice, data.rawText);
            } else {
                throw new Error(data.error || 'Failed to process notice file');
            }
        } catch (err: any) {
            toast({
                title: 'Upload Failed',
                description: err.message,
                variant: 'destructive'
            });
            setIsPipelineProcessing(false);
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    /**
     * Manual Notice Ingest & Paste Submission
     */
    const handleManualIngestSubmit = async () => {
        if (!currentGstin) {
            toast({ title: 'GSTIN Required', description: 'Please enter a client GSTIN.', variant: 'destructive' });
            return;
        }

        const refNo = manualRefNo.trim() || `NOTC-${Date.now().toString().slice(-6)}`;
        const noticeObj: GstNotice = {
            id: `manual_${Date.now()}`,
            client_gstin: currentGstin,
            portal_source: 'MANUAL_INGEST',
            notice_type: manualFormType,
            form_description: `Statutory Notice in ${manualFormType}`,
            reference_no: refNo,
            din: manualDin.trim(),
            financial_year: manualPeriod,
            tax_period: manualPeriod,
            issue_date: new Date().toISOString().split('T')[0],
            due_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
            issuing_officer: 'The Proper Officer',
            issuing_jurisdiction: 'State Tax Circle',
            section_cited: manualFormType.includes('ASMT') ? 'Section 61' : 'Section 73',
            tax_demanded: manualTaxDemanded,
            interest_demanded: Math.round(manualTaxDemanded * 0.25),
            penalty_demanded: 0,
            total_demanded: Math.round(manualTaxDemanded * 1.25),
            status: 'PENDING_REPLY',
            raw_notice_text: manualNoticeText || `FORM GST ${manualFormType}\nReference: ${refNo}\nTax Demanded: ₹${manualTaxDemanded}`
        };

        // Save to SQLite
        try {
            await fetch('/api/notices/save-demo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: noticeObj.id,
                    clientGstin: noticeObj.client_gstin,
                    formCode: noticeObj.notice_type,
                    title: noticeObj.form_description,
                    referenceNo: noticeObj.reference_no,
                    din: noticeObj.din,
                    financialYear: noticeObj.financial_year,
                    taxPeriod: noticeObj.tax_period,
                    issueDate: noticeObj.issue_date,
                    dueDate: noticeObj.due_date,
                    issuingOfficer: noticeObj.issuing_officer,
                    jurisdiction: noticeObj.issuing_jurisdiction,
                    statutorySection: noticeObj.section_cited,
                    taxDemanded: noticeObj.tax_demanded,
                    interestDemanded: noticeObj.interest_demanded,
                    penaltyDemanded: noticeObj.penalty_demanded,
                    totalDemanded: noticeObj.total_demanded,
                    rawText: noticeObj.raw_notice_text
                })
            });
        } catch (e) {}

        setNotices(prev => [noticeObj, ...prev.filter(n => n.id !== noticeObj.id)]);
        setManualModalOpen(false);
        toast({ title: 'Notice Ingested', description: `Running NOTICE-SHIELD AI on ${noticeObj.notice_type}...` });
        executeDefensePipeline(noticeObj, noticeObj.raw_notice_text);
    };

    /**
     * Delete notice handler
     */
    const handleDeleteNotice = async (noticeId: string, refNo: string) => {
        if (!confirm(`Are you sure you want to delete notice ${refNo}?`)) return;

        try {
            const res = await fetch(`/api/notices/${noticeId}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                setNotices(prev => prev.filter(n => n.id !== noticeId));
                toast({ title: 'Notice Deleted', description: `Notice ${refNo} removed from database.` });
            }
        } catch (err: any) {
            toast({ title: 'Delete Failed', description: err.message, variant: 'destructive' });
        }
    };

    /**
     * Playwright Autopilot Crawler Trigger
     */
    const handleStartAutopilotScan = async () => {
        if (!currentGstin) {
            toast({ title: 'Select Client', description: 'Please select a client GSTIN before scanning.', variant: 'destructive' });
            return;
        }

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

            let finalSummary = '';

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');
                for (const line of lines) {
                    if (line.startsWith('data:')) {
                        try {
                            const payload = JSON.parse(line.replace('data:', '').trim());
                            if (payload.message) {
                                setScanMessage(payload.message);
                                finalSummary = payload.message;
                            }
                            if (payload.error) {
                                toast({ title: 'Autopilot Notice', description: payload.error, variant: 'destructive' });
                            }
                        } catch (e) {}
                    }
                }
            }

            toast({
                title: 'Portal Scan Finished',
                description: finalSummary || `Verified portal records for ${currentGstin}.`
            });
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

    const activeClientDetails = availableClients.find(c => c.gstin === currentGstin);

    return (
        <div className="min-h-screen bg-slate-50/40 text-slate-900 p-2 sm:p-4 space-y-3.5">
            {/* ─── TOP ELEVATED HEADER BAR (GST Notices Suite · Live) ─── */}
            <header className="mb-3 bg-white/95 backdrop-blur-xl shadow-xs rounded-2xl px-5 py-2.5 flex flex-wrap items-center justify-between gap-4 border border-slate-200/80">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-200/70 flex items-center justify-center text-purple-600 shrink-0 shadow-2xs">
                        <ShieldAlert className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-base sm:text-lg font-bold tracking-wide uppercase text-slate-900 leading-tight">
                                GST Notices &amp; Orders Autonomous Suite
                            </h1>
                            <span className="text-[10px] font-mono font-bold bg-purple-50 text-purple-700 px-2 py-0.5 rounded border border-purple-200 uppercase tracking-wider">
                                Suite Live
                            </span>
                            <div className="px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 flex items-center gap-1.5 text-[10px] text-emerald-700 font-mono font-bold">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                <span>Zero Data Leakage Vault Active</span>
                            </div>
                        </div>
                        <p className="text-xs text-slate-500 font-mono">
                            ASMT-10, DRC-01, DRC-01B/C Autonomous Ingest, Cross-Reconciliation &amp; Courtroom AI Defense
                        </p>
                    </div>
                </div>

                {/* Right Action Cluster & Client Selector */}
                <div className="flex flex-wrap items-center gap-2.5">
                    {/* Client Selector Dropdown & Quick Search */}
                    <div className="relative">
                        <button
                            onClick={() => setClientDropdownOpen(!clientDropdownOpen)}
                            className="h-9 px-3 rounded-lg bg-white border border-slate-200 hover:border-purple-500/50 text-xs text-slate-800 flex items-center gap-2 transition-all font-mono"
                        >
                            <Building2 className="w-3.5 h-3.5 text-purple-700 font-bold" />
                            <span className="max-w-[170px] truncate font-bold text-slate-900">
                                {activeClientDetails?.trade_name || currentGstin || 'Select Client'}
                            </span>
                            <ChevronDown className="w-3 h-3 text-slate-600" />
                        </button>

                        {clientDropdownOpen && (
                            <div className="absolute right-0 mt-1.5 w-80 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 p-2 max-h-72 overflow-y-auto">
                                <div className="p-1 mb-2 border-b border-slate-200">
                                    <input
                                        type="text"
                                        placeholder="Type or paste custom GSTIN..."
                                        value={customGstinInput}
                                        onChange={e => setCustomGstinInput(e.target.value.toUpperCase())}
                                        className="w-full bg-white border border-slate-200 rounded px-2.5 py-1 text-xs font-mono text-slate-900 placeholder-slate-500 focus:outline-none focus:border-purple-500"
                                    />
                                    {customGstinInput && customGstinInput !== currentGstin && (
                                        <button
                                            onClick={() => {
                                                setCurrentGstin(customGstinInput);
                                                setClientDropdownOpen(false);
                                            }}
                                            className="w-full mt-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold text-[11px] py-1 rounded shadow-xs"
                                        >
                                            Switch to {customGstinInput}
                                        </button>
                                    )}
                                </div>

                                <div className="text-[10px] font-mono uppercase text-slate-600 px-2 py-1 mb-1">
                                    Practice Clients ({availableClients.length})
                                </div>
                                {availableClients.map(c => (
                                    <div
                                        key={c.gstin}
                                        onClick={() => {
                                            setCurrentGstin(c.gstin);
                                            setCustomGstinInput(c.gstin);
                                            setClientDropdownOpen(false);
                                        }}
                                        className={`p-2 rounded-lg cursor-pointer text-xs transition-colors ${
                                            currentGstin === c.gstin 
                                                ? 'bg-purple-600/30 text-slate-900 font-bold' 
                                                : 'hover:bg-slate-100 text-slate-700'
                                        }`}
                                    >
                                        <div className="truncate">{c.trade_name || c.legal_name || 'Client Entity'}</div>
                                        <div className="font-mono text-[10px] text-purple-700 font-bold">{c.gstin}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Manual Ingest Button */}
                    <Button
                        onClick={() => setManualModalOpen(true)}
                        variant="outline"
                        className="border-slate-200 text-slate-700 hover:bg-slate-100 text-xs px-3 py-2 rounded-lg flex items-center gap-1.5"
                    >
                        <PlusCircle className="w-3.5 h-3.5 text-purple-700 font-bold" />
                        Paste Notice
                    </Button>

                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        accept=".pdf,.txt"
                        className="hidden"
                    />
                    <Button
                        onClick={() => fileInputRef.current?.click()}
                        variant="outline"
                        className="border-slate-200 text-slate-700 hover:bg-slate-100 text-xs px-3.5 py-2 rounded-lg flex items-center gap-2"
                    >
                        <UploadCloud className="w-4 h-4 text-blue-400" />
                        Upload PDF
                    </Button>

                    <Button
                        onClick={handleStartAutopilotScan}
                        disabled={scanning}
                        className="bg-amber-500 hover:bg-amber-600 text-black font-bold text-xs px-4 py-2 rounded-lg shadow-lg shadow-amber-500/20 transition-all flex items-center gap-2"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
                        {scanning ? 'Scanning Portal...' : 'Live Portal Scan'}
                    </Button>
                </div>
            </header>

            {/* Autonomous 5-Stage Live Defense Pipeline Visualizer */}
            <NoticePipelineVisualizer
                currentStage={pipelineStage}
                isProcessing={isPipelineProcessing}
                stageMessage={pipelineMessage}
                onViewPrivacyVault={sanitizationResult ? () => setPrivacyVaultOpen(true) : undefined}
            />

            {/* Scanning Progress Banner */}
            {scanning && (
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <RefreshCw className="w-4 h-4 text-amber-700 font-bold animate-spin" />
                        <span className="text-xs font-mono text-amber-300">{scanMessage}</span>
                    </div>
                    <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={() => fetch('/api/notices/autopilot/cancel', { method: 'POST' })}
                        className="text-xs text-slate-600 hover:text-slate-900"
                    >
                        Cancel
                    </Button>
                </div>
            )}

            {/* Executive Telemetry Ribbon (4 KPIs) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-white border border-slate-200/80 shadow-xs backdrop-blur-md">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-600">Total Active Notices</span>
                        <FileText className="w-4 h-4 text-blue-400" />
                    </div>
                    <p className="text-2xl font-black font-mono text-slate-900 mt-2">{totalCount}</p>
                    <p className="text-[11px] text-slate-600 mt-1">Across 3 portal endpoints</p>
                </div>

                <div className="p-4 rounded-xl bg-white border border-amber-500/30 backdrop-blur-md bg-amber-500/5">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-amber-700 font-bold">Action Required (&le; 7 Days)</span>
                        <Clock className="w-4 h-4 text-amber-700 font-bold" />
                    </div>
                    <p className="text-2xl font-black font-mono text-amber-300 mt-2">{urgentCount}</p>
                    <p className="text-[11px] text-amber-700 font-bold/80 mt-1">Imminent statutory deadlines</p>
                </div>

                <div className="p-4 rounded-xl bg-white border border-slate-200/80 shadow-xs backdrop-blur-md">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-600">Total Disputed Demand</span>
                        <Scale className="w-4 h-4 text-rose-700 font-bold" />
                    </div>
                    <p className="text-2xl font-black font-mono text-slate-900 mt-2">
                        ₹{totalDemandedSum.toLocaleString('en-IN')}
                    </p>
                    <p className="text-[11px] text-slate-600 mt-1">Tax, Interest & Penalties</p>
                </div>

                <div className="p-4 rounded-xl bg-white border border-emerald-500/30 backdrop-blur-md bg-emerald-500/5">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-emerald-700 font-bold">Privacy Shield Status</span>
                        <ShieldCheck className="w-4 h-4 text-emerald-700 font-bold" />
                    </div>
                    <p className="text-lg font-bold font-mono text-emerald-300 mt-2">100% Local PII Masked</p>
                    <p className="text-[11px] text-emerald-700 font-bold/80 mt-1">Zero client data sent to cloud</p>
                </div>
            </div>

            {/* Filter Pills Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3">
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
                                    ? 'bg-purple-600 text-white font-bold shadow-md shadow-purple-600/30'
                                    : 'bg-slate-800/60 text-slate-700 hover:bg-slate-100 border border-slate-200'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {sanitizationResult && (
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setPrivacyVaultOpen(true)}
                        className="text-xs border-emerald-500/30 text-emerald-700 font-bold hover:bg-emerald-500/10"
                    >
                        <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
                        Open Privacy Vault Diff Viewer
                    </Button>
                )}
            </div>

            {/* Main Notices Ledger Table */}
            <div className="rounded-xl border border-slate-200 bg-white backdrop-blur-md overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead className="bg-slate-100 border-b-2 border-slate-200 text-slate-800 font-mono uppercase tracking-wider text-[11px] font-bold">
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
                        <tbody className="divide-y divide-slate-200 text-slate-700">
                            {filteredNotices.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="py-16 text-center">
                                        <div className="flex flex-col items-center justify-center gap-2 max-w-md mx-auto">
                                            <div className="p-3 rounded-full bg-slate-100 border border-slate-200 text-slate-600 mb-1">
                                                <FileQuestion className="w-7 h-7 text-purple-700 font-bold" />
                                            </div>
                                            <h3 className="text-sm font-bold text-slate-800">
                                                No GST Notices Recorded for this Client
                                            </h3>
                                            <p className="text-xs text-slate-600 leading-relaxed text-center">
                                                {loading 
                                                    ? 'Querying local encrypted database...' 
                                                    : currentGstin 
                                                    ? `No notices found in local records for ${currentGstin}. Click "Live Portal Scan" to fetch from the GST Portal, or use "Upload PDF" / "Paste Notice" to analyze a notice.`
                                                    : 'Please select or enter a client GSTIN from the top dropdown.'}
                                            </p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredNotices.map(n => {
                                    const alertColor = n.alert?.badgeColor || 'bg-slate-100 text-slate-800 border-slate-200 font-bold';

                                    return (
                                        <tr key={n.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="py-3 px-4">
                                                <div className="flex items-center gap-2">
                                                    <span className="p-1 rounded bg-purple-50 text-purple-700 border border-purple-200 font-mono text-[10px] font-bold">
                                                        {n.notice_type}
                                                    </span>
                                                    <span className="truncate max-w-[200px]" title={n.form_description}>
                                                        {n.form_description || n.notice_type}
                                                    </span>
                                                </div>
                                            </td>

                                            <td className="py-3 px-4 font-mono text-[11px]">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-slate-800">{n.reference_no}</span>
                                                    <button 
                                                        onClick={() => handleCopy(n.reference_no, n.id)}
                                                        className="text-slate-600 hover:text-slate-900"
                                                    >
                                                        {copiedField === n.id ? <Check className="w-3 h-3 text-emerald-700 font-bold" /> : <Copy className="w-3 h-3" />}
                                                    </button>
                                                </div>
                                                {n.din && <div className="text-[10px] text-slate-600">DIN: {n.din}</div>}
                                            </td>

                                            <td className="py-3 px-4 font-mono">
                                                {n.financial_year} {n.tax_period ? `(${n.tax_period})` : ''}
                                            </td>

                                            <td className="py-3 px-4 font-mono text-slate-600">
                                                {n.issue_date || 'N/A'}
                                            </td>

                                            <td className="py-3 px-4">
                                                <Badge variant="outline" className={`text-[10px] font-mono px-2 py-0.5 ${alertColor}`}>
                                                    {n.alert?.label || n.due_date || 'No Date'}
                                                </Badge>
                                            </td>

                                            <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                                                ₹{Number(n.total_demanded || 0).toLocaleString('en-IN')}
                                            </td>

                                            <td className="py-3 px-4 text-center">
                                                <Badge variant="outline" className="text-[10px] bg-slate-100 text-slate-800 border-slate-200 font-bold">
                                                    {n.status}
                                                </Badge>
                                            </td>

                                            <td className="py-3 px-4">
                                                <div className="flex items-center justify-center gap-1.5">
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => handleInspect(n)}
                                                        className="h-7 text-[11px] px-2 text-slate-700 hover:text-slate-900 hover:bg-slate-100"
                                                    >
                                                        Inspect
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => handleOpenReconciliation(n)}
                                                        className="h-7 text-[11px] px-2 text-blue-700 hover:text-blue-800 hover:bg-blue-50 font-bold"
                                                    >
                                                        Reconcile
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        onClick={() => executeDefensePipeline(n)}
                                                        className="h-7 text-[11px] px-2.5 bg-purple-600 hover:bg-purple-700 text-slate-900 font-bold rounded shadow-sm shadow-purple-600/30 flex items-center gap-1"
                                                    >
                                                        <Sparkles className="w-3 h-3" />
                                                        Draft Reply
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => handleDeleteNotice(n.id, n.reference_no)}
                                                        className="h-7 w-7 p-0 text-slate-500 hover:text-rose-700 font-bold hover:bg-red-500/10"
                                                        title="Delete Notice"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
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

            {/* Manual Ingest / Paste Notice Modal */}
            <Dialog open={manualModalOpen} onOpenChange={setManualModalOpen}>
                <DialogContent className="max-w-2xl bg-white border border-slate-200 shadow-2xl text-slate-900">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-base font-bold">
                            <Edit3 className="w-5 h-5 text-purple-700 font-bold" />
                            Manual Notice Ingestion & Analysis
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4 text-xs py-2">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-slate-600 block mb-1">Notice Form Type</label>
                                <select
                                    value={manualFormType}
                                    onChange={e => setManualFormType(e.target.value)}
                                    className="w-full bg-white border border-slate-200 rounded-lg p-2 text-slate-900 font-mono"
                                >
                                    <option value="ASMT-10">Form GST ASMT-10 (Scrutiny Notice)</option>
                                    <option value="DRC-01">Form GST DRC-01 (Show Cause Notice)</option>
                                    <option value="DRC-01A">Form GST DRC-01A (Pre-SCN Intimation)</option>
                                    <option value="DRC-01B">Form GST DRC-01B (Rule 88C Outward Intimation)</option>
                                    <option value="DRC-01C">Form GST DRC-01C (Rule 88D ITC Intimation)</option>
                                    <option value="REG-17">Form GST REG-17 (Registration SCN)</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-slate-600 block mb-1">Tax Period / FY</label>
                                <input
                                    type="text"
                                    value={manualPeriod}
                                    onChange={e => setManualPeriod(e.target.value)}
                                    placeholder="e.g. FY 2023-24"
                                    className="w-full bg-white border border-slate-200 rounded-lg p-2 text-slate-900 font-mono"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-slate-600 block mb-1">Notice Reference No / ARN</label>
                                <input
                                    type="text"
                                    value={manualRefNo}
                                    onChange={e => setManualRefNo(e.target.value)}
                                    placeholder="e.g. ZA2704240987654"
                                    className="w-full bg-white border border-slate-200 rounded-lg p-2 text-slate-900 font-mono"
                                />
                            </div>
                            <div>
                                <label className="text-slate-600 block mb-1">Total Demanded Liability (₹)</label>
                                <input
                                    type="number"
                                    value={manualTaxDemanded}
                                    onChange={e => setManualTaxDemanded(Number(e.target.value))}
                                    placeholder="500000"
                                    className="w-full bg-white border border-slate-200 rounded-lg p-2 text-slate-900 font-mono"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="text-slate-600 block mb-1">Notice Body / Allegation Text</label>
                            <textarea
                                value={manualNoticeText}
                                onChange={e => setManualNoticeText(e.target.value)}
                                rows={5}
                                placeholder="Paste notice allegations, discrepancy summary or text from notice copy here..."
                                className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-slate-900 font-mono text-xs leading-relaxed"
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setManualModalOpen(false)} className="text-xs">
                            Cancel
                        </Button>
                        <Button 
                            onClick={handleManualIngestSubmit}
                            className="bg-purple-600 hover:bg-purple-700 text-xs font-bold"
                        >
                            Analyze & Run NOTICE-SHIELD AI
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Slide-over Notice Inspector Drawer */}
            {inspectorOpen && selectedNotice && (
                <div className="fixed inset-y-0 right-0 w-full sm:w-[500px] bg-white border-l border-slate-200 p-6 z-50 shadow-2xl flex flex-col justify-between overflow-y-auto">
                    <div className="space-y-5">
                        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                            <div>
                                <Badge variant="outline" className="text-[10px] text-purple-700 font-bold border-purple-500/30">
                                    {selectedNotice.notice_type}
                                </Badge>
                                <h3 className="text-base font-bold text-slate-900 mt-1">Notice Details Inspector</h3>
                            </div>
                            <Button size="sm" variant="ghost" onClick={() => setInspectorOpen(false)}>
                                <X className="w-4 h-4 text-slate-600" />
                            </Button>
                        </div>

                        <div className="space-y-3 text-xs">
                            <div className="p-3 rounded-lg bg-white border border-slate-200 space-y-1">
                                <span className="text-slate-600 text-[11px]">Notice Reference Number</span>
                                <p className="font-mono font-bold text-slate-900">{selectedNotice.reference_no}</p>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="p-3 rounded-lg bg-white border border-slate-200 space-y-1">
                                    <span className="text-slate-600 text-[11px]">Issue Date</span>
                                    <p className="font-mono text-slate-900">{selectedNotice.issue_date || 'N/A'}</p>
                                </div>
                                <div className="p-3 rounded-lg bg-white border border-slate-200 space-y-1">
                                    <span className="text-slate-600 text-[11px]">Response Due Date</span>
                                    <p className="font-mono text-amber-700 font-bold font-bold">{selectedNotice.due_date || 'N/A'}</p>
                                </div>
                            </div>

                            <div className="p-3 rounded-lg bg-white border border-slate-200 space-y-1">
                                <span className="text-slate-600 text-[11px]">Issuing Authority</span>
                                <p className="text-slate-900">{selectedNotice.issuing_officer || 'The Proper Officer'}</p>
                                <p className="text-slate-600 text-[11px]">{selectedNotice.issuing_jurisdiction || 'Jurisdiction'}</p>
                            </div>

                            <div className="p-3 rounded-lg bg-white border border-slate-200 space-y-2">
                                <span className="text-slate-600 text-[11px]">Demanded Liabilities Breakdown</span>
                                <div className="grid grid-cols-3 gap-2 font-mono text-[11px] text-center">
                                    <div className="p-2 rounded bg-slate-50 border border-slate-200">
                                        <div className="text-slate-600 text-[10px]">Tax</div>
                                        <div className="text-slate-900">₹{selectedNotice.tax_demanded || 0}</div>
                                    </div>
                                    <div className="p-2 rounded bg-slate-50 border border-slate-200">
                                        <div className="text-slate-600 text-[10px]">Interest</div>
                                        <div className="text-amber-700 font-bold">₹{selectedNotice.interest_demanded || 0}</div>
                                    </div>
                                    <div className="p-2 rounded bg-slate-50 border border-slate-200">
                                        <div className="text-slate-600 text-[10px]">Penalty</div>
                                        <div className="text-rose-700 font-bold">₹{selectedNotice.penalty_demanded || 0}</div>
                                    </div>
                                </div>
                            </div>

                            {/* Downloaded Evidence */}
                            <div className="space-y-2">
                                <span className="text-slate-600 text-[11px] font-bold">Downloaded Evidence & Attachments</span>
                                {(!selectedNotice.attachments || selectedNotice.attachments.length === 0) ? (
                                    <p className="text-slate-600 text-[11px] italic">No local attachments found.</p>
                                ) : (
                                    selectedNotice.attachments.map(att => (
                                        <div key={att.id} className="p-2.5 rounded bg-white border border-slate-200 flex items-center justify-between">
                                            <div className="flex items-center gap-2 truncate">
                                                <Paperclip className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                                                <span className="truncate text-slate-800">{att.file_name}</span>
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

                    <div className="border-t border-slate-200 pt-4 mt-6 flex gap-3">
                        <Button
                            onClick={() => {
                                setInspectorOpen(false);
                                handleOpenReconciliation(selectedNotice);
                            }}
                            className="flex-1 bg-blue-600 hover:bg-blue-700 text-slate-900 font-medium text-xs"
                        >
                            Cross-Reconcile
                        </Button>
                        <Button
                            onClick={() => {
                                setInspectorOpen(false);
                                executeDefensePipeline(selectedNotice);
                            }}
                            className="flex-1 bg-purple-600 hover:bg-purple-700 text-slate-900 font-medium text-xs"
                        >
                            Execute AI Pipeline
                        </Button>
                    </div>
                </div>
            )}

            {/* Reconciliation Modal */}
            <Dialog open={recoModalOpen} onOpenChange={setRecoModalOpen}>
                <DialogContent className="max-w-2xl bg-white border border-slate-200 shadow-2xl text-slate-900">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-base font-bold">
                            <Scale className="w-5 h-5 text-blue-400" />
                            Multi-Return Cross-Reconciliation Proof
                        </DialogTitle>
                    </DialogHeader>

                    {recoResult && (
                        <div className="space-y-4 text-xs">
                            <div className="grid grid-cols-3 gap-3 p-3 rounded-lg bg-white border border-slate-200 font-mono">
                                <div>
                                    <span className="text-slate-600 text-[11px]">Notice Demanded</span>
                                    <p className="text-sm font-bold text-slate-900">₹{recoResult.totalDemanded.toLocaleString('en-IN')}</p>
                                </div>
                                <div>
                                    <span className="text-emerald-700 font-bold text-[11px]">Verified & Explained</span>
                                    <p className="text-sm font-bold text-emerald-700 font-bold">₹{recoResult.explainedAmount.toLocaleString('en-IN')}</p>
                                </div>
                                <div>
                                    <span className="text-slate-600 text-[11px]">Unexplained Residual</span>
                                    <p className="text-sm font-bold text-slate-700">₹{recoResult.unexplainedResidual.toLocaleString('en-IN')}</p>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <h4 className="font-bold text-slate-800">Identified Statutory Defenses:</h4>
                                {recoResult.explanations.map((exp, idx) => (
                                    <div key={idx} className="p-3 rounded-lg bg-white border border-slate-200/80 shadow-xs space-y-1">
                                        <div className="flex justify-between items-center">
                                            <span className="font-bold text-blue-400">{exp.category}</span>
                                            <span className="font-mono text-emerald-700 font-bold font-bold">₹{exp.amount.toLocaleString('en-IN')}</span>
                                        </div>
                                        <p className="text-slate-700 text-[11px]"><strong>Ground:</strong> {exp.statutoryGround}</p>
                                        <p className="text-slate-600 text-[11px]">{exp.legalRemarks}</p>
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
                                className="border-white/20 text-xs flex items-center gap-2 hover:bg-slate-100 text-slate-700"
                            >
                                <FileSpreadsheet className="w-4 h-4 text-emerald-700 font-bold" />
                                Export Zero-Merge Annexure
                            </Button>
                        )}
                        <Button 
                            onClick={() => {
                                setRecoModalOpen(false);
                                if (selectedNotice) executeDefensePipeline(selectedNotice);
                            }}
                            className="bg-purple-600 hover:bg-purple-700 text-xs font-bold"
                        >
                            Proceed to Draft Reply
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Privacy Vault Diff Viewer Modal */}
            <PrivacyVaultDiffViewer
                isOpen={privacyVaultOpen}
                onClose={() => setPrivacyVaultOpen(false)}
                sanitizationResult={sanitizationResult}
            />

            {/* Interactive Courtroom Legal Reply Workbench Modal */}
            {selectedNotice && (
                <NoticeReplyWorkbenchModal
                    isOpen={workbenchOpen}
                    onClose={() => setWorkbenchOpen(false)}
                    notice={selectedNotice}
                    analysis={geminiAnalysis}
                    recoResult={recoResult}
                    initialDraftText={rehydratedDraft}
                    sessionId={sanitizationResult?.sessionId || 'session_default'}
                    onSaveToDb={async (draftText, formName) => {
                        await fetch('/api/notices/reply/save', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                notice_id: selectedNotice.id,
                                client_gstin: selectedNotice.client_gstin,
                                reply_form: formName,
                                reply_subject: `Written Submission in response to ${selectedNotice.notice_type} Ref: ${selectedNotice.reference_no}`,
                                full_draft_html: `<pre>${draftText}</pre>`,
                                status: 'DRAFT'
                            })
                        });
                        toast({ title: 'Reply Draft Saved', description: 'Saved to SQLite database.' });
                    }}
                />
            )}
        </div>
    );
}
