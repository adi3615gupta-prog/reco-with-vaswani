import React, { useState } from 'react';
import { Shield, ShieldCheck, Lock, Eye, AlertCircle, Copy, Check, X } from 'lucide-react';
import { SanitizationResult } from '@/lib/piiSanitizer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface PrivacyVaultDiffViewerProps {
    isOpen: boolean;
    onClose: () => void;
    sanitizationResult: SanitizationResult | null;
}

export const PrivacyVaultDiffViewer: React.FC<PrivacyVaultDiffViewerProps> = ({
    isOpen,
    onClose,
    sanitizationResult
}) => {
    const [copied, setCopied] = useState<string | null>(null);
    const [selectedToken, setSelectedToken] = useState<string | null>(null);

    if (!sanitizationResult) return null;

    const handleCopy = (text: string, label: string) => {
        navigator.clipboard.writeText(text);
        setCopied(label);
        setTimeout(() => setCopied(null), 2000);
    };

    return (
        <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
            <DialogContent className="max-w-6xl w-[95vw] max-h-[92vh] bg-[#090D16] border-white/10 text-white flex flex-col p-6 overflow-hidden shadow-2xl">
                <DialogHeader className="border-b border-white/10 pb-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                                <ShieldCheck className="w-6 h-6" />
                            </div>
                            <div>
                                <DialogTitle className="text-lg font-bold flex items-center gap-2">
                                    Zero-Trust Privacy Vault & Payload Diff Inspector
                                    <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px]">
                                        0% Client Data Transmitted
                                    </Badge>
                                </DialogTitle>
                                <p className="text-xs text-slate-400 mt-0.5">
                                    Visual verification: Raw sensitive text vs Anonymized payload sent to Gemini API
                                </p>
                            </div>
                        </div>

                        {/* Top Security Status Chips */}
                        <div className="flex items-center gap-2">
                            <div className="px-3 py-1 rounded-lg bg-emerald-500/5 border border-emerald-500/20 flex items-center gap-2 text-xs">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                <span className="font-mono text-emerald-300 font-semibold">Local Tokenization Active</span>
                            </div>
                            <div className="px-3 py-1 rounded-lg bg-slate-800/80 border border-white/10 text-slate-300 font-mono text-xs">
                                Session ID: {sanitizationResult.sessionId.slice(0, 14)}...
                            </div>
                        </div>
                    </div>

                    {/* Stats Ribbon */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-3 text-xs font-mono">
                        <div className="p-2 rounded bg-slate-900/60 border border-white/5 text-center">
                            <span className="text-[10px] text-slate-400 block">Total Identifiers Scrubbed</span>
                            <span className="text-sm font-bold text-emerald-400">{sanitizationResult.stats.totalMasked}</span>
                        </div>
                        <div className="p-2 rounded bg-slate-900/60 border border-white/5 text-center">
                            <span className="text-[10px] text-slate-400 block">GSTINs Masked</span>
                            <span className="text-sm font-bold text-white">{sanitizationResult.stats.gstinCount}</span>
                        </div>
                        <div className="p-2 rounded bg-slate-900/60 border border-white/5 text-center">
                            <span className="text-[10px] text-slate-400 block">PANs Masked</span>
                            <span className="text-sm font-bold text-white">{sanitizationResult.stats.panCount}</span>
                        </div>
                        <div className="p-2 rounded bg-slate-900/60 border border-white/5 text-center">
                            <span className="text-[10px] text-slate-400 block">ARNs & DINs</span>
                            <span className="text-sm font-bold text-white">{sanitizationResult.stats.arnCount}</span>
                        </div>
                        <div className="p-2 rounded bg-slate-900/60 border border-white/5 text-center">
                            <span className="text-[10px] text-slate-400 block">Taxpayers & Contacts</span>
                            <span className="text-sm font-bold text-white">{sanitizationResult.stats.contactCount + sanitizationResult.stats.nameCount}</span>
                        </div>
                    </div>
                </DialogHeader>

                {/* Split-Screen Diff View */}
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 py-4 min-h-[350px] overflow-hidden">
                    {/* Left Pane: Raw Notice Text */}
                    <div className="flex flex-col rounded-xl border border-red-500/20 bg-[#0d131f] overflow-hidden">
                        <div className="p-3 bg-red-500/10 border-b border-red-500/20 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <AlertCircle className="w-4 h-4 text-red-400" />
                                <span className="text-xs font-bold text-red-300">Raw Notice Text (Host Machine Only)</span>
                            </div>
                            <Button 
                                size="sm" 
                                variant="ghost" 
                                onClick={() => handleCopy(sanitizationResult.rawText, 'raw')}
                                className="h-6 text-[10px] text-slate-400 hover:text-white px-2"
                            >
                                {copied === 'raw' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                Copy
                            </Button>
                        </div>
                        <div className="flex-1 p-4 font-mono text-[11px] leading-relaxed text-slate-300 overflow-y-auto whitespace-pre-wrap select-text">
                            {sanitizationResult.rawText}
                        </div>
                        <div className="p-2 bg-red-950/20 border-t border-red-500/10 text-[10px] text-red-300/80 font-mono text-center">
                            ⚠️ Contains client trade name, GSTIN, and contact details. Strictly blocked from leaving machine.
                        </div>
                    </div>

                    {/* Right Pane: Sanitized Payload Sent to Gemini */}
                    <div className="flex flex-col rounded-xl border border-emerald-500/20 bg-[#0c1815] overflow-hidden">
                        <div className="p-3 bg-emerald-500/10 border-b border-emerald-500/20 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                                <span className="text-xs font-bold text-emerald-300">Sanitized Payload (Transmitted to Gemini)</span>
                            </div>
                            <Button 
                                size="sm" 
                                variant="ghost" 
                                onClick={() => handleCopy(sanitizationResult.sanitizedText, 'sanitized')}
                                className="h-6 text-[10px] text-slate-400 hover:text-white px-2"
                            >
                                {copied === 'sanitized' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                Copy
                            </Button>
                        </div>
                        <div className="flex-1 p-4 font-mono text-[11px] leading-relaxed text-emerald-100/90 overflow-y-auto whitespace-pre-wrap select-text">
                            {sanitizationResult.sanitizedText}
                        </div>
                        <div className="p-2 bg-emerald-950/20 border-t border-emerald-500/10 text-[10px] text-emerald-300 font-mono text-center">
                            🛡️ 100% Anonymized. Real identity swapped back locally upon completion.
                        </div>
                    </div>
                </div>

                {/* Active Session Token Vault Table */}
                <div className="border-t border-white/10 pt-3">
                    <span className="text-xs font-bold text-slate-300 flex items-center gap-2 mb-2">
                        <Lock className="w-3.5 h-3.5 text-emerald-400" />
                        In-Memory Two-Way Cryptographic Token Mapping:
                    </span>
                    <div className="max-h-24 overflow-y-auto flex flex-wrap gap-2 text-[11px] font-mono">
                        {Object.entries(sanitizationResult.tokenMap).map(([token, real]) => (
                            <div 
                                key={token} 
                                onClick={() => setSelectedToken(token === selectedToken ? null : token)}
                                className={`px-2.5 py-1 rounded border cursor-pointer transition-all flex items-center gap-2 ${
                                    selectedToken === token 
                                        ? 'bg-emerald-500/20 border-emerald-400 text-white shadow-sm shadow-emerald-500/20' 
                                        : 'bg-slate-900/80 border-white/10 text-slate-300 hover:border-emerald-500/40'
                                }`}
                            >
                                <span className="text-emerald-400 font-bold">{token}</span>
                                <span className="text-slate-400">→</span>
                                <span className="text-slate-200">{real}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
