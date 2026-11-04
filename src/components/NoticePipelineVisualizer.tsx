import React from 'react';
import { motion } from 'framer-motion';
import { Download, FileSearch, ShieldCheck, Sparkles, FileCheck, CheckCircle2, Clock } from 'lucide-react';

export type PipelineStage = 1 | 2 | 3 | 4 | 5;

interface NoticePipelineVisualizerProps {
    currentStage: PipelineStage;
    isProcessing: boolean;
    stageMessage?: string;
    onViewPrivacyVault?: () => void;
}

const STAGES = [
    {
        stage: 1,
        title: 'Portal Sync / Ingest',
        subtitle: 'Playwright / PDF Ingest',
        icon: Download,
        color: 'text-blue-700 font-bold',
        bgColor: 'bg-blue-500/10',
        borderColor: 'border-blue-500/30'
    },
    {
        stage: 2,
        title: 'Local OCR & Extraction',
        subtitle: 'Zero Cloud Storage',
        icon: FileSearch,
        color: 'text-amber-700 font-bold',
        bgColor: 'bg-amber-500/10',
        borderColor: 'border-amber-500/30'
    },
    {
        stage: 3,
        title: 'Zero-Trust PII Masking',
        subtitle: 'Local Regex Tokenizer',
        icon: ShieldCheck,
        color: 'text-emerald-700 font-bold',
        bgColor: 'bg-emerald-500/10',
        borderColor: 'border-emerald-500/30'
    },
    {
        stage: 4,
        title: 'Gemini Statutory AI',
        subtitle: 'Indian GST Legal Reasoning',
        icon: Sparkles,
        color: 'text-purple-700 font-bold',
        bgColor: 'bg-purple-500/10',
        borderColor: 'border-purple-500/30'
    },
    {
        stage: 5,
        title: 'Re-Hydration & Export',
        subtitle: 'DRC-06 / ASMT-11 Ready',
        icon: FileCheck,
        color: 'text-cyan-700 font-bold',
        bgColor: 'bg-cyan-500/10',
        borderColor: 'border-cyan-500/30'
    }
];

export const NoticePipelineVisualizer: React.FC<NoticePipelineVisualizerProps> = ({
    currentStage,
    isProcessing,
    stageMessage,
    onViewPrivacyVault
}) => {
    return (
        <div className="rounded-2xl border border-slate-200/80 bg-white shadow-xs p-5 relative overflow-hidden">
            {/* Top Bar with Live Processing Message */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-3 border-b border-slate-200">
                <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
                        Autonomous 5-Stage Defense Pipeline
                    </span>
                    {isProcessing && (
                        <span className="text-xs font-mono text-purple-700 font-bold animate-pulse ml-2">
                            • {stageMessage || 'Processing stage...'}
                        </span>
                    )}
                </div>

                {onViewPrivacyVault && (
                    <button
                        onClick={onViewPrivacyVault}
                        className="text-[11px] font-mono px-3 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 font-bold border border-emerald-500/30 transition-all flex items-center gap-1.5 self-start sm:self-auto"
                    >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Inspect Privacy Vault Diff
                    </button>
                )}
            </div>

            {/* Stepper Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 relative">
                {STAGES.map((s, idx) => {
                    const isCompleted = currentStage > s.stage;
                    const isCurrent = currentStage === s.stage;
                    const Icon = s.icon;

                    return (
                        <motion.div
                            key={s.stage}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.08 }}
                            className={`p-3.5 rounded-xl border transition-all relative overflow-hidden flex flex-col justify-between ${
                                isCurrent
                                    ? `${s.bgColor} ${s.borderColor} shadow-lg shadow-black/40 ring-1 ring-white/20`
                                    : isCompleted
                                    ? 'bg-emerald-50/70 border-emerald-200'
                                    : 'bg-slate-50 border-slate-200 border-slate-200 opacity-50'
                            }`}
                        >
                            {/* Animated Active Top Glow */}
                            {isCurrent && isProcessing && (
                                <motion.div
                                    layoutId="pipelineGlow"
                                    className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-400 via-purple-500 to-blue-400 animate-pulse"
                                />
                            )}

                            <div className="flex items-center justify-between mb-2">
                                <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                                    isCompleted 
                                        ? 'bg-emerald-100 text-emerald-800 font-bold' 
                                        : isCurrent 
                                        ? 'bg-blue-600 text-white font-bold' 
                                        : 'bg-slate-100 text-slate-700 font-bold'
                                }`}>
                                    0{s.stage}
                                </span>
                                {isCompleted ? (
                                    <CheckCircle2 className="w-4 h-4 text-emerald-700 font-bold" />
                                ) : isCurrent && isProcessing ? (
                                    <Clock className="w-4 h-4 text-amber-700 font-bold animate-spin" />
                                ) : (
                                    <Icon className={`w-4 h-4 ${s.color}`} />
                                )}
                            </div>

                            <div>
                                <h4 className={`text-xs font-bold leading-tight ${
                                    isCurrent ? 'text-blue-950 font-bold' : isCompleted ? 'text-emerald-950 font-bold' : 'text-slate-700 font-medium'
                                }`}>
                                    {s.title}
                                </h4>
                                <p className="text-[10px] text-slate-600 mt-0.5 font-mono">
                                    {s.subtitle}
                                </p>
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
};
