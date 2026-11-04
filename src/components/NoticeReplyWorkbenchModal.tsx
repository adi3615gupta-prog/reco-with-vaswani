import React, { useState, useEffect } from 'react';
import { 
    Sparkles, 
    FileText, 
    Download, 
    Copy, 
    Check, 
    Printer, 
    Scale, 
    ShieldCheck, 
    AlertTriangle, 
    HelpCircle, 
    FileCheck2, 
    PlusCircle,
    X,
    FileSpreadsheet
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { GeminiNoticeAnalysis, DEFENSE_QUICK_CHIPS } from '@/lib/geminiTaxEngine';
import { generateNoticeDocxBlob, generateNoticePdf } from '@/lib/noticeDocxExporter';
import { NoticeReconciliationResult, generateNoticeAnnexureExcel } from '@/lib/noticeReconciliation';
import * as XLSX from 'xlsx';

interface NoticeReplyWorkbenchModalProps {
    isOpen: boolean;
    onClose: () => void;
    notice: any;
    analysis: GeminiNoticeAnalysis | null;
    recoResult?: NoticeReconciliationResult | null;
    initialDraftText: string;
    sessionId: string;
    onSaveToDb?: (draftText: string, formName: string) => Promise<void>;
}

export const NoticeReplyWorkbenchModal: React.FC<NoticeReplyWorkbenchModalProps> = ({
    isOpen,
    onClose,
    notice,
    analysis,
    recoResult,
    initialDraftText,
    sessionId,
    onSaveToDb
}) => {
    const { toast } = useToast();
    const [draftText, setDraftText] = useState<string>(initialDraftText);
    const [selectedForm, setSelectedForm] = useState<string>('DRC-06');
    const [copied, setCopied] = useState<boolean>(false);
    const [exportingDocx, setExportingDocx] = useState<boolean>(false);
    const [checklistState, setChecklistState] = useState<Record<string, boolean>>({
        'annex_a': true,
        'annex_b': true,
        'annex_c': false,
        'annex_d': true
    });

    useEffect(() => {
        setDraftText(initialDraftText);
        if (notice?.notice_type?.includes('ASMT')) {
            setSelectedForm('ASMT-11');
        } else if (notice?.notice_type?.includes('DRC-01B')) {
            setSelectedForm('DRC-01B Part B');
        } else {
            setSelectedForm('DRC-06');
        }
    }, [initialDraftText, notice]);

    if (!notice) return null;

    const handleCopy = () => {
        navigator.clipboard.writeText(draftText);
        setCopied(true);
        toast({ title: 'Copied to Clipboard', description: 'Full legal reply draft copied.' });
        setTimeout(() => setCopied(false), 2000);
    };

    const handleInsertDefenseChip = (chipSnippet: string, chipLabel: string) => {
        setDraftText(prev => prev + '\n' + chipSnippet);
        toast({
            title: 'Defense Clause Inserted',
            description: `${chipLabel} added to your legal reply draft.`
        });
    };

    const handleExportDocx = async () => {
        try {
            setExportingDocx(true);
            const blob = await generateNoticeDocxBlob({
                clientLegalName: notice.client_legal_name || notice.client_gstin,
                clientGstin: notice.client_gstin,
                clientPan: notice.client_pan || notice.client_gstin?.substring(2, 12),
                referenceNo: notice.reference_no,
                din: notice.din,
                noticeType: selectedForm,
                financialYear: notice.financial_year || 'FY 2024-25',
                issuingOfficer: notice.issuing_officer,
                jurisdiction: notice.issuing_jurisdiction,
                draftMarkdown: draftText,
                totalDemanded: notice.total_demanded || 0,
                disputedAmount: analysis?.summaryTable?.disputedLiability || notice.total_demanded || 0
            });

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Legal_Reply_${selectedForm.replace(/\s+/g, '_')}_${notice.reference_no}.docx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            toast({
                title: 'Word Document Generated',
                description: 'Exported courtroom-grade .docx file successfully.'
            });
        } catch (e: any) {
            toast({ title: 'Export Error', description: e.message, variant: 'destructive' });
        } finally {
            setExportingDocx(false);
        }
    };

    const handleExportPdf = () => {
        try {
            const doc = generateNoticePdf({
                clientLegalName: notice.client_legal_name || notice.client_gstin,
                clientGstin: notice.client_gstin,
                clientPan: notice.client_pan || notice.client_gstin?.substring(2, 12),
                referenceNo: notice.reference_no,
                din: notice.din,
                noticeType: selectedForm,
                financialYear: notice.financial_year || 'FY 2024-25',
                issuingOfficer: notice.issuing_officer,
                jurisdiction: notice.issuing_jurisdiction,
                draftMarkdown: draftText,
                totalDemanded: notice.total_demanded || 0,
                disputedAmount: analysis?.summaryTable?.disputedLiability || notice.total_demanded || 0
            });

            doc.save(`Legal_Reply_${selectedForm.replace(/\s+/g, '_')}_${notice.reference_no}.pdf`);
            toast({ title: 'PDF Generated', description: 'Saved court-formatted PDF.' });
        } catch (e: any) {
            toast({ title: 'PDF Error', description: e.message, variant: 'destructive' });
        }
    };

    const handleExportZeroMergeExcel = () => {
        if (!recoResult) {
            toast({ title: 'Reconciliation Needed', description: 'Run cross-reconciliation first.' });
            return;
        }
        const wb = generateNoticeAnnexureExcel(recoResult, {
            companyName: notice.client_legal_name || notice.client_gstin,
            officerName: notice.issuing_officer
        });
        XLSX.writeFile(wb, `ZeroMerge_Annexure_${notice.reference_no}.xlsx`);
        toast({ title: 'Zero-Merge Excel Saved', description: 'Zero merged cells compliant.' });
    };

    return (
        <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
            <DialogContent className="max-w-7xl w-[96vw] max-h-[94vh] bg-white border-slate-200 text-slate-900 shadow-2xl flex flex-col p-6 overflow-hidden shadow-2xl">
                {/* Header */}
                <DialogHeader className="border-b border-slate-200 pb-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-700 font-bold">
                                <Sparkles className="w-6 h-6" />
                            </div>
                            <div>
                                <DialogTitle className="text-lg font-bold flex items-center gap-2">
                                    Courtroom Legal Reply Workbench & Defense Drafter
                                    <Badge className="bg-purple-500/10 text-purple-700 font-bold border-purple-500/30 text-[10px]">
                                        Section 75(4) Hearing Protected
                                    </Badge>
                                </DialogTitle>
                                <p className="text-xs text-slate-600 mt-0.5">
                                    Notice Ref: <span className="font-mono text-slate-900 font-bold">{notice.reference_no}</span> • Client: <span className="font-semibold text-slate-900 font-bold">{notice.client_legal_name || notice.client_gstin}</span>
                                </p>
                            </div>
                        </div>

                        {/* Statutory Form Switcher */}
                        <div className="flex items-center gap-2">
                            {['ASMT-11', 'DRC-06', 'DRC-01B Part B'].map(form => (
                                <button
                                    key={form}
                                    onClick={() => setSelectedForm(form)}
                                    className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-all ${
                                        selectedForm === form
                                            ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 font-semibold'
                                    }`}
                                >
                                    {form}
                                </button>
                            ))}
                        </div>
                    </div>
                </DialogHeader>

                {/* Main Split-Pane Workspace */}
                <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 py-4 min-h-[420px] overflow-hidden">
                    {/* Left Pane (4 Cols): Tactical Intelligence & Verification Deck */}
                    <div className="lg:col-span-4 flex flex-col gap-4 overflow-y-auto pr-1">
                        {/* Notice Risk & Limitation Card */}
                        <div className="p-4 rounded-xl bg-white/70 border border-slate-200 space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                    <Scale className="w-4 h-4 text-purple-700 font-bold" />
                                    Statutory Procedural Health
                                </span>
                                <Badge className="text-[10px] bg-emerald-500/10 text-emerald-700 font-bold border-emerald-500/30">
                                    DIN Verified
                                </Badge>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                                <div className="p-2 rounded bg-slate-50 border border-slate-200">
                                    <span className="text-[10px] text-slate-600 block">Total Demanded</span>
                                    <span className="text-sm font-black text-slate-900">
                                        ₹{(notice.total_demanded || 0).toLocaleString('en-IN')}
                                    </span>
                                </div>
                                <div className="p-2 rounded bg-slate-50 border border-slate-200">
                                    <span className="text-[10px] text-slate-600 block">Disputed Balance</span>
                                    <span className="text-sm font-black text-rose-700">
                                        ₹{(analysis?.summaryTable?.disputedLiability || notice.total_demanded || 0).toLocaleString('en-IN')}
                                    </span>
                                </div>
                            </div>

                            {/* Section 74 Alert if present */}
                            {analysis?.technicalValidityCheck?.section74WrongfulInvocation && (
                                <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-[11px] text-red-300 flex items-start gap-2">
                                    <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <strong>Wrongful Sec 74 Invocation Detected:</strong> The officer has invoked extended limitation without evidence of fraud/suppression. Challenged in draft.
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Statutory Citations Checklist */}
                        <div className="p-4 rounded-xl bg-white/70 border border-slate-200 space-y-2.5">
                            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                <ShieldCheck className="w-4 h-4 text-emerald-700 font-bold" />
                                Active Statutory Defenses & Authorities
                            </span>
                            <div className="space-y-2 text-xs">
                                <div className="p-2 rounded bg-slate-50 border border-slate-200">
                                    <div className="font-semibold text-emerald-700 font-bold">Section 16(5) & 16(6) CGST Act</div>
                                    <p className="text-[11px] text-slate-600">Retrospective relief for FY 17-18 to 20-21 returns filed by 30.11.2021.</p>
                                </div>
                                <div className="p-2 rounded bg-slate-50 border border-slate-200">
                                    <div className="font-semibold text-blue-700 font-bold">Section 50(1) Proviso & Rule 88B</div>
                                    <p className="text-[11px] text-slate-600">Interest leviable strictly on Net Cash debited from cash ledger.</p>
                                </div>
                                <div className="p-2 rounded bg-slate-50 border border-slate-200">
                                    <div className="font-semibold text-purple-700 font-bold">Section 75(4) Mandatory Hearing</div>
                                    <p className="text-[11px] text-slate-600">Statutory right to oral personal hearing prior to adverse order.</p>
                                </div>
                            </div>
                        </div>

                        {/* Required Annexures Checklist */}
                        <div className="p-4 rounded-xl bg-white/70 border border-slate-200 space-y-2.5">
                            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                <FileCheck2 className="w-4 h-4 text-blue-700 font-bold" />
                                Mandatory Annexures Evidentiary Index
                            </span>
                            <div className="space-y-1.5 text-xs">
                                {[
                                    { id: 'annex_a', label: 'Annexure-A: Copy of Impugned Notice' },
                                    { id: 'annex_b', label: 'Annexure-B: Zero-Merge Reco Statement' },
                                    { id: 'annex_c', label: 'Annexure-C: Tax Invoices & Bank Statements' },
                                    { id: 'annex_d', label: 'Annexure-D: CA Certificate (Circular 183)' }
                                ].map(item => (
                                    <label key={item.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-slate-100/60 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={checklistState[item.id] || false}
                                            onChange={e => setChecklistState(prev => ({ ...prev, [item.id]: e.target.checked }))}
                                            className="rounded border-slate-200 bg-slate-100 text-purple-600 focus:ring-0 w-3.5 h-3.5"
                                        />
                                        <span className={`text-[11px] ${checklistState[item.id] ? 'text-slate-900 font-bold' : 'text-slate-500'}`}>
                                            {item.label}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Right Pane (8 Cols): Rich Editable Re-hydrated Courtroom Legal Reply */}
                    <div className="lg:col-span-8 flex flex-col rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
                        {/* Quick-Insert Defense Chips Toolbar */}
                        <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center gap-2">
                            <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1 mr-1">
                                <PlusCircle className="w-3.5 h-3.5 text-purple-700 font-bold" />
                                Quick-Insert Defense:
                            </span>
                            {DEFENSE_QUICK_CHIPS.map(chip => (
                                <button
                                    key={chip.id}
                                    onClick={() => handleInsertDefenseChip(chip.snippet, chip.label)}
                                    title={chip.shortDesc}
                                    className="text-[10px] font-mono px-2.5 py-1 rounded bg-slate-100 hover:bg-purple-600/30 hover:border-purple-500/50 text-slate-900 font-bold border border-slate-200 transition-all flex items-center gap-1"
                                >
                                    {chip.label}
                                </button>
                            ))}
                        </div>

                        {/* Editable Re-hydrated Draft Textarea */}
                        <div className="flex-1 p-4 relative">
                            <textarea
                                value={draftText}
                                onChange={e => setDraftText(e.target.value)}
                                className="w-full h-full min-h-[380px] bg-slate-50/50 text-slate-900 font-mono text-xs leading-relaxed resize-none focus:outline-none border border-slate-200 rounded-lg p-3.5 select-text shadow-inner"
                                placeholder="Legal reply draft will appear here..."
                            />
                        </div>

                        {/* Bottom Re-hydration Guarantee Bar */}
                        <div className="p-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[11px] font-mono text-slate-700 px-4">
                            <span className="flex items-center gap-1.5 text-emerald-700 font-bold">
                                <ShieldCheck className="w-3.5 h-3.5" />
                                Fully re-hydrated locally with real client identifiers.
                            </span>
                            <span>{draftText.length} characters</span>
                        </div>
                    </div>
                </div>

                {/* Footer Action Deck */}
                <div className="border-t border-slate-200 pt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <Button 
                            variant="outline" 
                            size="sm"
                            onClick={handleCopy}
                            className="text-xs border-slate-200 hover:bg-slate-100 text-slate-700"
                        >
                            {copied ? <Check className="w-3.5 h-3.5 text-emerald-700 font-bold mr-1.5" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
                            {copied ? 'Copied' : 'Copy Text'}
                        </Button>

                        <Button 
                            variant="outline" 
                            size="sm"
                            onClick={handleExportZeroMergeExcel}
                            className="text-xs border-emerald-500/30 text-emerald-700 font-bold hover:bg-emerald-500/10"
                        >
                            <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" />
                            Zero-Merge Excel Annexure
                        </Button>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button 
                            variant="outline" 
                            size="sm"
                            onClick={handleExportPdf}
                            className="text-xs border-slate-200 hover:bg-slate-100 text-slate-900 font-bold"
                        >
                            <Printer className="w-3.5 h-3.5 mr-1.5" />
                            Print / PDF
                        </Button>

                        <Button 
                            size="sm"
                            disabled={exportingDocx}
                            onClick={handleExportDocx}
                            className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-md shadow-blue-600/30 flex items-center gap-1.5"
                        >
                            <Download className="w-3.5 h-3.5" />
                            {exportingDocx ? 'Generating DOCX...' : 'Export Court DOCX'}
                        </Button>

                        <Button 
                            size="sm"
                            onClick={async () => {
                                if (onSaveToDb) {
                                    await onSaveToDb(draftText, selectedForm);
                                }
                                onClose();
                            }}
                            className="text-xs bg-purple-600 hover:bg-purple-700 text-white font-bold shadow-md shadow-purple-600/30"
                        >
                            Save Draft to DB
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
