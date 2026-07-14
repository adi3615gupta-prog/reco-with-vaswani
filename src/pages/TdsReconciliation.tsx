import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    ArrowLeft, UploadCloud, Database, Settings2, FileSpreadsheet, CheckCircle2, Trash2, GitCompare, Activity, AlertTriangle, Download, Search, Server, Loader2, RefreshCw, X, ShieldAlert, Edit2, Check, Plus, FileText, ChevronDown, ChevronRight, ChevronUp, Zap, Users, ArrowRight, Wallet, Eye, EyeOff
} from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx-js-style';
import ExcelJS from 'exceljs';
import { FileUploadZone } from '@/components/FileUploadZone';
import { parseFile } from '@/lib/fileParser';
import { exportTdsReport } from '@/lib/tdsEngine';
import { pingTally, fetchCompanyInfo, fetchTdsTransactions, fetchPartyBalances, clearTallyMetadataCache, type TallyCompanyInfo } from '@/lib/tallyApi';
import { getApiBase, getAuthToken } from '@/lib/api';

// Phase 1: Statutory TDS Master Data
export interface TdsSection {
    id?: string;
    old_section: string;
    new_section_2025: string;
    nature_of_payment: string;
    single_bill_threshold: number | null;
    annual_aggregate_threshold: number;
    rate_individual_huf: number;
    rate_company_others: number;
    rate_missing_pan_206AA: number;
}

// Fallback Rules for UI reference if backend fails to reply (Aligned with TDS Amendment & Implementation Report V2 FY 2025-26)
const FALLBACK_TDS_SECTIONS: TdsSection[] = [
    { old_section: '192A', new_section_2025: '393(1)_EPF', nature_of_payment: 'EPF Premature Withdrawal', single_bill_threshold: null, annual_aggregate_threshold: 50000, rate_individual_huf: 10.0, rate_company_others: 10.0, rate_missing_pan_206AA: 20.0 },
    { old_section: '193', new_section_2025: '393(1)_Securities', nature_of_payment: 'Interest on Securities', single_bill_threshold: null, annual_aggregate_threshold: 10000, rate_individual_huf: 10.0, rate_company_others: 10.0, rate_missing_pan_206AA: 20.0 },
    { old_section: '194', new_section_2025: '393(1)_Sl_1iii', nature_of_payment: 'Dividend', single_bill_threshold: null, annual_aggregate_threshold: 10000, rate_individual_huf: 10.0, rate_company_others: 10.0, rate_missing_pan_206AA: 20.0 },
    { old_section: '194A', new_section_2025: '393(1)_Sl_1i', nature_of_payment: 'Interest (Other than Banks)', single_bill_threshold: null, annual_aggregate_threshold: 10000, rate_individual_huf: 10.0, rate_company_others: 10.0, rate_missing_pan_206AA: 20.0 },
    { old_section: '194A(Bank)', new_section_2025: '393(1)_Sl_1i_Bank', nature_of_payment: 'Interest (Bank/Post Office - Sr Citizen 1L, Others 50k)', single_bill_threshold: null, annual_aggregate_threshold: 50000, rate_individual_huf: 10.0, rate_company_others: 10.0, rate_missing_pan_206AA: 20.0 },
    { old_section: '194C', new_section_2025: '393(1)_Sl_6i', nature_of_payment: 'Payment to Contractors', single_bill_threshold: 30000, annual_aggregate_threshold: 100000, rate_individual_huf: 1.0, rate_company_others: 2.0, rate_missing_pan_206AA: 20.0 },
    { old_section: '194D', new_section_2025: '393(1)_Sl_3i', nature_of_payment: 'Insurance Commission', single_bill_threshold: null, annual_aggregate_threshold: 20000, rate_individual_huf: 5.0, rate_company_others: 10.0, rate_missing_pan_206AA: 20.0 },
    { old_section: '194DA', new_section_2025: '393(1)_Sl_3ii', nature_of_payment: 'Life Insurance Maturity', single_bill_threshold: null, annual_aggregate_threshold: 100000, rate_individual_huf: 2.0, rate_company_others: 2.0, rate_missing_pan_206AA: 20.0 },
    { old_section: '194G', new_section_2025: '393(1)_Sl_1iv', nature_of_payment: 'Lottery Commission', single_bill_threshold: null, annual_aggregate_threshold: 20000, rate_individual_huf: 2.0, rate_company_others: 2.0, rate_missing_pan_206AA: 20.0 },
    { old_section: '194H', new_section_2025: '393(1)_Sl_1ii', nature_of_payment: 'Commission or Brokerage', single_bill_threshold: null, annual_aggregate_threshold: 20000, rate_individual_huf: 2.0, rate_company_others: 2.0, rate_missing_pan_206AA: 20.0 },
    { old_section: '194I(a)', new_section_2025: '393(1)_Sl_2ii_Da', nature_of_payment: 'Rent for Plant & Machinery', single_bill_threshold: null, annual_aggregate_threshold: 600000, rate_individual_huf: 2.0, rate_company_others: 2.0, rate_missing_pan_206AA: 20.0 },
    { old_section: '194I(b)', new_section_2025: '393(1)_Sl_2ii_Db', nature_of_payment: 'Rent for Land, Building & Furniture', single_bill_threshold: null, annual_aggregate_threshold: 600000, rate_individual_huf: 10.0, rate_company_others: 10.0, rate_missing_pan_206AA: 20.0 },
    { old_section: '194IA', new_section_2025: '393(1)_Sl_2ii_E', nature_of_payment: 'Transfer of Immovable Property', single_bill_threshold: null, annual_aggregate_threshold: 5000000, rate_individual_huf: 1.0, rate_company_others: 1.0, rate_missing_pan_206AA: 20.0 },
    { old_section: '194IB', new_section_2025: '393(1)_Sl_2ii_F', nature_of_payment: 'Payment of Rent by Individual/HUF (Non-Audit)', single_bill_threshold: 50000, annual_aggregate_threshold: 600000, rate_individual_huf: 2.0, rate_company_others: 2.0, rate_missing_pan_206AA: 20.0 },
    { old_section: '194IC', new_section_2025: '393(1)_Sl_2ii_G', nature_of_payment: 'Consideration under Development Agreement', single_bill_threshold: null, annual_aggregate_threshold: 0, rate_individual_huf: 10.0, rate_company_others: 10.0, rate_missing_pan_206AA: 20.0 },
    { old_section: '194J(a)', new_section_2025: '393(1)_Sl_6iii_a', nature_of_payment: 'Fees for Technical Services / Royalty / Call Centres', single_bill_threshold: null, annual_aggregate_threshold: 50000, rate_individual_huf: 2.0, rate_company_others: 2.0, rate_missing_pan_206AA: 20.0 },
    { old_section: '194J(b)', new_section_2025: '393(1)_Sl_6iii_b', nature_of_payment: 'Fees for Professional Services', single_bill_threshold: null, annual_aggregate_threshold: 50000, rate_individual_huf: 10.0, rate_company_others: 10.0, rate_missing_pan_206AA: 20.0 },
    { old_section: '194LA', new_section_2025: '393(1)_Sl_7i', nature_of_payment: 'Compulsory Land Acquisition', single_bill_threshold: null, annual_aggregate_threshold: 500000, rate_individual_huf: 10.0, rate_company_others: 10.0, rate_missing_pan_206AA: 20.0 },
    { old_section: '194M', new_section_2025: '393(1)_Sl_8iii', nature_of_payment: 'Payments by Individual/HUF (Contract/Prof/Commission)', single_bill_threshold: null, annual_aggregate_threshold: 5000000, rate_individual_huf: 2.0, rate_company_others: 2.0, rate_missing_pan_206AA: 20.0 },
    { old_section: '194Q', new_section_2025: '393(1)_Sl_8ii', nature_of_payment: 'Purchase of Goods', single_bill_threshold: null, annual_aggregate_threshold: 5000000, rate_individual_huf: 0.1, rate_company_others: 0.1, rate_missing_pan_206AA: 5.0 },
    { old_section: '194R', new_section_2025: '393(1)_Sl_8iv', nature_of_payment: 'Benefits or Perquisites of Business', single_bill_threshold: null, annual_aggregate_threshold: 20000, rate_individual_huf: 10.0, rate_company_others: 10.0, rate_missing_pan_206AA: 20.0 },
    { old_section: '194S', new_section_2025: '393(1)_Sl_8v', nature_of_payment: 'Virtual Digital Asset (Crypto)', single_bill_threshold: null, annual_aggregate_threshold: 50000, rate_individual_huf: 1.0, rate_company_others: 1.0, rate_missing_pan_206AA: 20.0 },
    { old_section: '194T', new_section_2025: '393(3)', nature_of_payment: 'Payments to Partners by Partnership Firm/LLP', single_bill_threshold: null, annual_aggregate_threshold: 20000, rate_individual_huf: 10.0, rate_company_others: 10.0, rate_missing_pan_206AA: 20.0 },
    { old_section: '194O', new_section_2025: '393(1)_Sl_8i', nature_of_payment: 'Payment by E-Commerce Operator', single_bill_threshold: null, annual_aggregate_threshold: 500000, rate_individual_huf: 0.1, rate_company_others: 0.1, rate_missing_pan_206AA: 5.0 }
];

interface TdsReconciliationProps {
    onBack: () => void;
}

// ─── Reusable Collapsible Section ────────────────────────────
function CollapsibleSection({ title, subtitle, icon: Icon, children, defaultOpen = false, badge }: {
    title: string; subtitle?: string; icon: React.ElementType; children: React.ReactNode; defaultOpen?: boolean; badge?: React.ReactNode;
}) {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    return (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl shadow-xl overflow-hidden transition-all">
            <button onClick={() => setIsOpen(!isOpen)} className="w-full flex items-center justify-between p-5 hover:bg-slate-800/30 transition-colors group">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-500/10 border border-purple-500/20 rounded-lg"><Icon className="w-5 h-5 text-purple-400" /></div>
                    <div className="text-left">
                        <h2 className="text-lg font-bold text-white">{title}</h2>
                        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {badge}
                    {isOpen ? <ChevronUp className="w-5 h-5 text-slate-400 group-hover:text-white transition-colors" /> : <ChevronDown className="w-5 h-5 text-slate-400 group-hover:text-white transition-colors" />}
                </div>
            </button>
            {isOpen && <div className="p-5 pt-0 border-t border-slate-800/50">{children}</div>}
        </div>
    );
}

// ─── Stepper Component ───────────────────────────────────────
function StepperNav({ steps, activeStep, onStepClick }: { steps: { label: string; icon: React.ElementType; ready: boolean; info?: string; disabled?: boolean }[]; activeStep: number; onStepClick: (i: number) => void }) {
    return (
        <div className="flex items-stretch gap-1 bg-slate-950/50 p-1.5 rounded-2xl border border-slate-800/80 backdrop-blur-md">
            {steps.map((step, i) => {
                const Icon = step.icon;
                const isActive = activeStep === i;
                const isDisabled = step.disabled;
                return (
                    <button
                        key={i}
                        onClick={() => !isDisabled && onStepClick(i)}
                        disabled={isDisabled}
                        className={`flex-1 min-w-0 relative py-3 px-3 rounded-xl font-bold text-xs transition-all flex flex-col items-center gap-1.5 group ${isActive
                                ? 'bg-gradient-to-br from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-900/30'
                                : isDisabled
                                    ? 'text-slate-600 cursor-not-allowed opacity-40'
                                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                            }`}
                    >
                        <div className="flex items-center gap-2">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black transition-all ${step.ready && !isActive ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                                    isActive ? 'bg-white/20 text-white' :
                                        'bg-slate-800 text-slate-500 border border-slate-700'
                                }`}>
                                {step.ready && !isActive ? <CheckCircle2 className="w-3.5 h-3.5" /> : <span>{i + 1}</span>}
                            </div>
                            <Icon className="w-4 h-4 hidden sm:block" />
                        </div>
                        <span className="truncate max-w-full text-[11px] tracking-wide uppercase">{step.label}</span>
                        {step.info && <span className={`text-[9px] font-medium truncate max-w-full ${isActive ? 'text-white/60' : 'text-slate-500'}`}>{step.info}</span>}
                        {i < steps.length - 1 && (
                            <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-10 hidden lg:block">
                                <ChevronRight className={`w-3.5 h-3.5 ${isActive ? 'text-purple-300' : 'text-slate-700'}`} />
                            </div>
                        )}
                    </button>
                );
            })}
        </div>
    );
}

// ─── Status Filter Chips ─────────────────────────────────────
const STATUS_FILTERS = ['All', 'Matched', 'Short Deducted', 'Excess Deducted', 'Missing in 26Q', 'Missing in Books', 'Under Threshold'] as const;
type StatusFilter = typeof STATUS_FILTERS[number];

function StatusFilterChips({ active, onChange, counts }: { active: StatusFilter; onChange: (f: StatusFilter) => void; counts: Record<string, number> }) {
    const getChipStyle = (status: string, isActive: boolean) => {
        if (isActive) {
            switch (status) {
                case 'Matched': return 'bg-emerald-500 text-white shadow-emerald-900/30';
                case 'Short Deducted': return 'bg-amber-500 text-white shadow-amber-900/30';
                case 'Excess Deducted': return 'bg-purple-500 text-white shadow-purple-900/30';
                case 'Missing in 26Q': return 'bg-rose-500 text-white shadow-rose-900/30';
                case 'Missing in Books': return 'bg-blue-500 text-white shadow-blue-900/30';
                case 'Under Threshold': return 'bg-slate-600 text-white shadow-slate-900/30';
                default: return 'bg-purple-600 text-white shadow-purple-900/30';
            }
        }
        return 'bg-slate-800/60 text-slate-400 hover:text-white hover:bg-slate-700/60 border border-slate-700/50';
    };
    return (
        <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map(s => (
                <button
                    key={s}
                    onClick={() => onChange(s)}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all shadow-md ${getChipStyle(s, active === s)}`}
                >
                    {s} {counts[s] !== undefined && <span className="ml-1 opacity-70">({counts[s]})</span>}
                </button>
            ))}
        </div>
    );
}

// ═════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════
export default function TdsReconciliation({ onBack }: TdsReconciliationProps) {
    const [activeStep, setActiveStep] = useState(0);

    // Database Seed Rules
    const [rules, setRules] = useState<TdsSection[]>(FALLBACK_TDS_SECTIONS);

    // Group Mapping State (Database-backed templates)
    const [groupMappings, setGroupMappings] = useState<{ id: string; expenseGroup: string; subGroup: string; subGroup2: string; sectionCode: string }[]>([]);
    const [newExpenseGroup, setNewExpenseGroup] = useState('');
    const [newSubGroup, setNewSubGroup] = useState('');
    const [newSubGroup2, setNewSubGroup2] = useState('');
    const [newGroupSectionCode, setNewGroupSectionCode] = useState('194C');

    // Ledger Mapping State (Database-backed)
    const [ledgerMappings, setLedgerMappings] = useState<{ id: string; ledgerName: string; parentGroup?: string | null; sectionCode: string | null; inheritedSectionCode?: string | null; inheritedGroupName?: string | null; isTdsLedger: boolean; userValidated: boolean }[]>([]);
    const [newLedgerName, setNewLedgerName] = useState('');
    const [newSectionCode, setNewSectionCode] = useState('194C');
    const [isNewLedgerTds, setIsNewLedgerTds] = useState(false);

    // Fuzzy Match & Name Confirms
    const [pendingPanMatches, setPendingPanMatches] = useState<{ partyName: string; suggestedPan: string; section: string }[]>([]);
    const [showPanMatchesDialog, setShowPanMatchesDialog] = useState(false);
    const [selectedPanMatches, setSelectedPanMatches] = useState<Record<string, boolean>>({});
    const [tempTallyTransactions, setTempTallyTransactions] = useState<any[]>([]);
    const [tempForm26qRecords, setTempForm26qRecords] = useState<any[]>([]);

    // Auto Map Preview UI State
    const [suggestions, setSuggestions] = useState<{ id: string; ledgerName: string; parentGroup: string; suggestedSection: string; isProbable: boolean }[]>([]);
    const [selectedSuggestions, setSelectedSuggestions] = useState<Record<string, boolean>>({});
    const [suggestedSections, setSuggestedSections] = useState<Record<string, string>>({});

    // Party Master State (Database-backed)
    const [parties, setParties] = useState<{ id: string; party_name: string; pan_number: string; entity_type: string; user_edited: boolean }[]>([]);
    const [partySearchTerm, setPartySearchTerm] = useState('');
    const [editingPartyId, setEditingPartyId] = useState<string | null>(null);
    const [editPan, setEditPan] = useState('');
    const [editEntityType, setEditEntityType] = useState('');

    // Ingestion State
    const [form26qFile, setForm26qFile] = useState<File | null>(null);
    const [tallyFile, setTallyFile] = useState<File | null>(null);

    // Multi-Channel Ingestion State
    const [tdsIngestChannel, setTdsIngestChannel] = useState<'TALLY_EXCEL' | 'ITR_JSON' | 'MANUAL'>('TALLY_EXCEL');
    const [itrJsonFile, setItrJsonFile] = useState<File | null>(null);
    const [itrParsedTdsRecords, setItrParsedTdsRecords] = useState<any[] | null>(null);

    const today = new Date();
    // Manual Entry States
    const [manualBooksTransactions, setManualBooksTransactions] = useState<any[]>([
        { id: 'm-books-1', date: today.toISOString().slice(0, 10), partyName: 'DUMMY VENDOR PVT LTD', partyPan: 'ABCDE1234F', ledgerName: 'Audit Fees', amount: 120000, actualTdsDeducted: 12000, voucherNumber: 'PUR-001' }
    ]);
    const [manualTdsRecords, setManualTdsRecords] = useState<any[]>([
        { id: 'm-tds-1', partyPan: 'ABCDE1234F', partyName: 'DUMMY VENDOR PVT LTD', section: '194J(b)', amountPaid: 120000, tdsDeducted: 12000 }
    ]);

    // Temp manual input state
    const [newManualBook, setNewManualBook] = useState({ date: today.toISOString().slice(0, 10), partyName: '', partyPan: '', ledgerName: '', amount: '', actualTds: '', voucherNo: '' });
    const [newManualTds, setNewManualTds] = useState({ partyPan: '', partyName: '', section: '194C', amountPaid: '', tdsDeducted: '' });

    // Results State (Reconciliation)
    const [isProcessing, setIsProcessing] = useState(false);
    const [reconSummary, setReconSummary] = useState<any>(null);
    const [reconResults, setReconResults] = useState<any[] | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
    const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

    // Tally Live API State
    const [tallyPort, setTallyPort] = useState(9000);
    const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
    const [companyInfo, setCompanyInfo] = useState<TallyCompanyInfo | null>(null);
    const [fromDate, setFromDate] = useState(today.getMonth() >= 3 ? `${today.getFullYear()}-04-01` : `${today.getFullYear() - 1}-04-01`);
    const [toDate, setToDate] = useState(today.toISOString().slice(0, 10));
    const [isFetchingTally, setIsFetchingTally] = useState(false);
    const [tallyDirectData, setTallyDirectData] = useState<any[] | null>(null);
    const [showTemplateMenu, setShowTemplateMenu] = useState(false);
    const [showGroupTemplateMenu, setShowGroupTemplateMenu] = useState(false);

    // Party Balance State
    const [partyBalances, setPartyBalances] = useState<Map<string, number>>(new Map());
    const [isFetchingBalances, setIsFetchingBalances] = useState(false);

    // Name Confirmation State
    const [suggestedNameMatches, setSuggestedNameMatches] = useState<{ booksName: string; tracesName: string; type: 'Exact Name' | 'Fuzzy Name'; similarity: number }[]>([]);
    const [showNameMatchesDialog, setShowNameMatchesDialog] = useState(false);
    const [selectedNameMatches, setSelectedNameMatches] = useState<Record<string, boolean>>({});

    const [customPurchaseVouchers, setCustomPurchaseVouchers] = useState(() => {
        return localStorage.getItem('tdsCustomPurchaseVouchers') || '';
    });
    const [customJournalVouchers, setCustomJournalVouchers] = useState(() => {
        return localStorage.getItem('tdsCustomJournalVouchers') || '';
    });

    const handleCustomPurchaseChange = (val: string) => {
        setCustomPurchaseVouchers(val);
        localStorage.setItem('tdsCustomPurchaseVouchers', val);
    };

    const handleCustomJournalChange = (val: string) => {
        setCustomJournalVouchers(val);
        localStorage.setItem('tdsCustomJournalVouchers', val);
    };

    // ITR JSON Parser helpers
    const getPrimitiveValue = (v: any): string => {
        if (v === null || v === undefined) return '';
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
            return String(v).trim();
        }
        if (typeof v === 'object') {
            if (v.value !== undefined) return getPrimitiveValue(v.value);
            for (const key of Object.keys(v)) {
                const inner = v[key];
                if (typeof inner === 'string' || typeof inner === 'number') {
                    return String(inner).trim();
                }
            }
        }
        return '';
    };

    const findValueByKey = (obj: any, keySubstrings: string[]): string => {
        if (!obj || typeof obj !== 'object') return '';
        for (const k of Object.keys(obj)) {
            const kl = k.toLowerCase();
            if (keySubstrings.some(sub => kl.includes(sub))) {
                const valStr = getPrimitiveValue(obj[k]);
                if (valStr) return valStr;
            }
        }
        for (const k of Object.keys(obj)) {
            const val = obj[k];
            if (val && typeof val === 'object') {
                const found = findValueByKey(val, keySubstrings);
                if (found) return found;
            }
        }
        return '';
    };

    const handleItrFileUpload = (file: File) => {
        if (!file.name.endsWith('.json')) {
            toast.error('Please upload a valid JSON file.');
            return;
        }
        setItrJsonFile(file);
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const json = JSON.parse(event.target?.result as string);
                const extracted: any[] = [];
                const traverseAndExtract = (obj: any) => {
                    if (!obj || typeof obj !== 'object') return;
                    const keys = Object.keys(obj);
                    const tanKey = keys.find(k => {
                        const kl = k.toLowerCase();
                        return (kl.includes('tan') || kl.includes('pan')) && !kl.includes('status');
                    });
                    if (tanKey) {
                        const valStr = String(obj[tanKey]).trim().toUpperCase();
                        const TAN_PAN_REGEX = /^([A-Z]{4}[0-9]{5}[A-Z]{1})|([A-Z]{5}[0-9]{4}[A-Z]{1})$/i;
                        if (valStr.length >= 10 && valStr.length <= 12 && TAN_PAN_REGEX.test(valStr)) {
                            const localTan = valStr;
                            const nameVal = findValueByKey(obj, ['name']);
                            const localName = nameVal || 'Deductor ' + localTan;
                            const grossVal = findValueByKey(obj, ['gross', 'amtpaid', 'amountpaid', 'receipt']);
                            const localGross = parseFloat(grossVal.replace(/,/g, '')) || 0;
                            const tdsVal = findValueByKey(obj, ['taxdeducted', 'tdsclaimed', 'tdsdeposited', 'totaltds', 'amttds', 'deductedownhands', 'claimedownhands']);
                            const localTds = parseFloat(tdsVal.replace(/,/g, '')) || 0;
                            let localSection = findValueByKey(obj, ['section', 'sec']) || '194C';
                            if (localSection.startsWith('9')) localSection = '1' + localSection;
                            if (localSection === '194J') localSection = '194J(b)';
                            extracted.push({ partyPan: localTan, partyName: localName, section: localSection, amountPaid: localGross || (localTds * 10), tdsDeducted: localTds });
                            return;
                        }
                    }
                    if (Array.isArray(obj)) { obj.forEach(item => traverseAndExtract(item)); }
                    else { Object.values(obj).forEach(val => traverseAndExtract(val)); }
                };
                traverseAndExtract(json);
                if (extracted.length > 0) {
                    setItrParsedTdsRecords(extracted);
                    toast.success(`Parsed ITR JSON successfully: Found ${extracted.length} TDS credits!`);
                } else {
                    toast.warning('No standard TDS schedule credits found in this JSON file.');
                    setItrParsedTdsRecords([]);
                }
            } catch (err) {
                toast.error('Failed to parse ITR JSON file. Invalid JSON format.');
                console.error(err);
            }
        };
        reader.readAsText(file);
    };

    // Manual CRUD handlers
    const handleAddManualBookRow = () => {
        if (!newManualBook.partyName.trim()) return toast.error("Enter party name");
        if (!newManualBook.ledgerName.trim()) return toast.error("Enter ledger name");
        if (!newManualBook.amount) return toast.error("Enter gross amount");
        const newRow = {
            id: 'm-books-' + Date.now(), date: newManualBook.date, partyName: newManualBook.partyName.trim(),
            partyPan: newManualBook.partyPan.trim().toUpperCase(), ledgerName: newManualBook.ledgerName.trim(),
            amount: parseFloat(newManualBook.amount), actualTdsDeducted: parseFloat(newManualBook.actualTds || '0'),
            voucherNumber: newManualBook.voucherNo.trim() || `VOUCH-${Date.now().toString().slice(-4)}`
        };
        setManualBooksTransactions([...manualBooksTransactions, newRow]);
        setNewManualBook({ date: today.toISOString().slice(0, 10), partyName: '', partyPan: '', ledgerName: '', amount: '', actualTds: '', voucherNo: '' });
        toast.success("Transaction row added!");
    };

    const handleDeleteManualBookRow = (id: string) => { setManualBooksTransactions(manualBooksTransactions.filter(r => r.id !== id)); toast.info("Transaction row removed"); };

    const handleAddManualTdsRow = () => {
        if (!newManualTds.partyPan.trim()) return toast.error("Enter Party PAN/TAN");
        if (!newManualTds.partyName.trim()) return toast.error("Enter Party Name");
        if (!newManualTds.amountPaid) return toast.error("Enter Amount Paid");
        const newRow = {
            id: 'm-tds-' + Date.now(), partyPan: newManualTds.partyPan.trim().toUpperCase(),
            partyName: newManualTds.partyName.trim(), section: newManualTds.section,
            amountPaid: parseFloat(newManualTds.amountPaid), tdsDeducted: parseFloat(newManualTds.tdsDeducted || '0')
        };
        setManualTdsRecords([...manualTdsRecords, newRow]);
        setNewManualTds({ partyPan: '', partyName: '', section: '194C', amountPaid: '', tdsDeducted: '' });
        toast.success("TDS record row added!");
    };

    const handleDeleteManualTdsRow = (id: string) => { setManualTdsRecords(manualTdsRecords.filter(r => r.id !== id)); toast.info("TDS record row removed"); };

    // Load static rules from DB
    const loadRules = async () => {
        try {
            const res = await fetch(`${getApiBase()}/api/tds/rules`);
            if (res.ok) { const data = await res.json(); if (data && data.length > 0) setRules(data); }
        } catch (err) { console.error("Rules fetch failed, falling back to local defaults.", err); }
    };

    const loadMappings = async () => {
        try {
            const res = await fetch(`${getApiBase()}/api/tds/ledgers`);
            if (res.ok) { const data = await res.json(); setLedgerMappings(data); }
        } catch (err) { console.error("Failed to fetch ledger mappings", err); }
    };

    const loadSuggestions = async () => {
        try {
            const res = await fetch(`${getApiBase()}/api/tds/auto-map`);
            if (res.ok) {
                const data = await res.json();
                setSuggestions(data);
                const initialSelected: Record<string, boolean> = {};
                const initialSections: Record<string, string> = {};
                data.forEach((s: any) => { initialSelected[s.ledgerName] = s.isProbable; initialSections[s.ledgerName] = s.suggestedSection; });
                setSelectedSuggestions(initialSelected);
                setSuggestedSections(initialSections);
            }
        } catch (err) { console.error("Failed to fetch auto-map suggestions", err); }
    };

    const loadGroupMappings = async () => {
        try {
            const res = await fetch(`${getApiBase()}/api/tds/group-mappings`);
            if (res.ok) { const data = await res.json(); setGroupMappings(data); }
        } catch (err) { console.error("Failed to fetch group mappings", err); }
    };

    const loadParties = async () => {
        try {
            const res = await fetch(`${getApiBase()}/api/tds/parties`);
            if (res.ok) { const data = await res.json(); setParties(data); }
        } catch (err) { console.error("Failed to fetch party master", err); }
    };

    useEffect(() => { loadRules(); loadMappings(); loadSuggestions(); loadParties(); loadGroupMappings(); }, []);

    // ─── Group Mapping CRUD ──────────────────────────────────
    const handleAddGroupMapping = async () => {
        if (!newExpenseGroup.trim()) return toast.error('Enter a valid Expense Group name');
        try {
            const res = await fetch(`${getApiBase()}/api/tds/group-mappings`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ expenseGroup: newExpenseGroup.trim(), subGroup: newSubGroup.trim() || undefined, subGroup2: newSubGroup2.trim() || undefined, sectionCode: newGroupSectionCode })
            });
            if (res.ok) { toast.success('Group mapping template added!'); setNewExpenseGroup(''); setNewSubGroup(''); setNewSubGroup2(''); loadGroupMappings(); }
            else toast.error('Failed to add group mapping template');
        } catch (err) { toast.error('Connection error adding template'); }
    };

    const handleRemoveGroupMapping = async (id: string) => {
        try {
            const res = await fetch(`${getApiBase()}/api/tds/group-mappings/${id}`, { method: 'DELETE' });
            if (res.ok) { toast.success('Template mapping removed'); loadGroupMappings(); }
            else toast.error('Failed to remove mapping');
        } catch (err) { toast.error('Connection error removing mapping'); }
    };

    // ─── Ledger Mapping CRUD ─────────────────────────────────
    const handleAddMapping = async () => {
        if (!newLedgerName.trim()) return toast.error('Enter a valid Tally ledger name');
        try {
            const res = await fetch(`${getApiBase()}/api/tds/ledgers/update`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ledgerName: newLedgerName.trim(), sectionCode: isNewLedgerTds ? null : newSectionCode, isTdsLedger: isNewLedgerTds })
            });
            if (res.ok) { toast.success('Ledger configuration saved!'); setNewLedgerName(''); setIsNewLedgerTds(false); loadMappings(); loadSuggestions(); }
            else toast.error('Failed to map ledger');
        } catch (err) { toast.error('Connection error mapping ledger'); }
    };

    const handleUpdateLedgerConfig = async (ledgerName: string, updates: { sectionCode?: string | null, isTdsLedger?: boolean }) => {
        const existing = ledgerMappings.find(m => m.ledgerName === ledgerName);
        if (!existing) return;
        const sectionCode = updates.sectionCode !== undefined ? updates.sectionCode : existing.sectionCode;
        const isTdsLedger = updates.isTdsLedger !== undefined ? updates.isTdsLedger : existing.isTdsLedger;
        try {
            const res = await fetch(`${getApiBase()}/api/tds/ledgers/update`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ledgerName, sectionCode: isTdsLedger ? null : sectionCode, isTdsLedger })
            });
            if (res.ok) { toast.success('Ledger configuration updated!'); loadMappings(); loadSuggestions(); }
            else toast.error('Failed to update ledger');
        } catch (err) { toast.error('Connection error updating ledger'); }
    };

    const handleRemoveMapping = async (ledgerName: string) => {
        try {
            const res = await fetch(`${getApiBase()}/api/tds/ledgers/${encodeURIComponent(ledgerName)}`, { method: 'DELETE' });
            if (res.ok) { toast.success('Mapping removed'); loadMappings(); loadSuggestions(); }
            else toast.error('Failed to remove mapping');
        } catch (err) { toast.error('Connection error removing mapping'); }
    };

    const isPanValid = (pan: string) => /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i.test(pan || '');
    const isPanMissing = (pan: string) => !pan || pan === 'PAN-MISSING' || pan === 'PAN MISSING' || pan === 'UNREGISTERED' || !isPanValid(pan);

    // ─── Fuzzy PAN Matches ───────────────────────────────────
    const handleConfirmPanMatches = async () => {
        const confirmedMatches = pendingPanMatches.filter(m => selectedPanMatches[m.partyName]).map(m => ({ partyName: m.partyName, panNumber: m.suggestedPan }));
        if (confirmedMatches.length > 0) {
            try {
                const res = await fetch(`${getApiBase()}/api/tds/parties/confirm-name-matches`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ matches: confirmedMatches }) });
                if (!res.ok) toast.error("Failed to map PANs in vendor profile");
                else { toast.success(`Successfully mapped PANs for ${confirmedMatches.length} vendors!`); loadParties(); }
            } catch (err) { console.error("Failed to post confirm name matches", err); }
        }
        setShowPanMatchesDialog(false);
        const nameConfirmedList = suggestedNameMatches
            .filter(m => selectedNameMatches[`${m.booksName}_${m.tracesName}`])
            .map(m => ({ booksName: m.booksName, tracesName: m.tracesName }));
        runReconciliation(tempTallyTransactions, tempForm26qRecords, nameConfirmedList);
    };

    const handleSkipPanMatches = () => {
        setShowPanMatchesDialog(false);
        const nameConfirmedList = suggestedNameMatches
            .filter(m => selectedNameMatches[`${m.booksName}_${m.tracesName}`])
            .map(m => ({ booksName: m.booksName, tracesName: m.tracesName }));
        runReconciliation(tempTallyTransactions, tempForm26qRecords, nameConfirmedList);
    };

    // ─── Name Linkage Confirmations ──────────────────────────
    const handleConfirmNameMatches = () => {
        const confirmedList = suggestedNameMatches
            .filter(m => selectedNameMatches[`${m.booksName}_${m.tracesName}`])
            .map(m => ({ booksName: m.booksName, tracesName: m.tracesName }));
        setShowNameMatchesDialog(false);

        // Chain to PAN mapping if needed
        const fuzzyMatches = checkForFuzzyMatches(tempTallyTransactions, tempForm26qRecords);
        if (fuzzyMatches.length > 0) {
            setPendingPanMatches(fuzzyMatches);
            const initialSelected: Record<string, boolean> = {};
            fuzzyMatches.forEach(m => { initialSelected[m.partyName] = true; });
            setSelectedPanMatches(initialSelected);
            setShowPanMatchesDialog(true);
        } else {
            runReconciliation(tempTallyTransactions, tempForm26qRecords, confirmedList);
        }
    };

    const handleSkipNameMatches = () => {
        setShowNameMatchesDialog(false);
        // Skip all (empty array = no name merges allowed)
        const fuzzyMatches = checkForFuzzyMatches(tempTallyTransactions, tempForm26qRecords);
        if (fuzzyMatches.length > 0) {
            setPendingPanMatches(fuzzyMatches);
            const initialSelected: Record<string, boolean> = {};
            fuzzyMatches.forEach(m => { initialSelected[m.partyName] = true; });
            setSelectedPanMatches(initialSelected);
            setShowPanMatchesDialog(true);
        } else {
            runReconciliation(tempTallyTransactions, tempForm26qRecords, []);
        }
    };

    // Auto mapping confirmation handler
    const handleConfirmAutoMappings = async () => {
        const mappingsToConfirm = suggestions.filter(s => selectedSuggestions[s.ledgerName]).map(s => ({ ledgerName: s.ledgerName, sectionCode: suggestedSections[s.ledgerName] || s.suggestedSection }));
        if (mappingsToConfirm.length === 0) return toast.error("Please select at least one mapping to confirm.");
        try {
            const res = await fetch(`${getApiBase()}/api/tds/confirm-mapping`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mappings: mappingsToConfirm }) });
            if (res.ok) { toast.success(`Successfully confirmed ${mappingsToConfirm.length} ledger mappings!`); loadMappings(); loadSuggestions(); }
            else toast.error("Failed to confirm auto-mappings");
        } catch (err) { toast.error("Error connecting to server for auto-mapping confirmation"); }
    };

    // ─── Party Master CRUD ───────────────────────────────────
    const startEditingParty = (p: any) => { setEditingPartyId(p.id); setEditPan(p.pan_number || ''); setEditEntityType(p.entity_type || 'Unknown'); };

    const handleSavePartyEdit = async (id: string) => {
        try {
            const res = await fetch(`${getApiBase()}/api/tds/parties/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entityType: editEntityType, panNumber: editPan.trim().toUpperCase() }) });
            if (res.ok) { toast.success("Party details updated!"); setEditingPartyId(null); loadParties(); }
            else toast.error("Failed to update party details");
        } catch (err) { toast.error("Error communicating with party database"); }
    };

    const syncPartiesFromTallyData = async (tallyTxns: any[]) => {
        const distinctParties = Array.from(new Map(tallyTxns.filter(t => t.partyName).map(t => [t.partyName.toUpperCase().trim(), { partyName: t.partyName, pan: t.partyPan }])).values());
        try {
            const res = await fetch(`${getApiBase()}/api/tds/process-pan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parties: distinctParties }) });
            if (res.ok) loadParties();
        } catch (err) { console.error("Failed to sync party metadata to DB", err); }
    };

    const syncLedgersFromTallyData = async (tallyTxns: any[]) => {
        const distinctLedgers = Array.from(new Map(tallyTxns.filter(t => t.ledgerName).map(t => [t.ledgerName.toUpperCase().trim(), { ledgerName: t.ledgerName, parentGroup: t.parentGroup || 'Expense', parentGroupPath: t.parentGroupPath || '' }])).values());
        if (distinctLedgers.length === 0) return;
        try {
            const res = await fetch(`${getApiBase()}/api/tds/extract-ledgers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ledgers: distinctLedgers }) });
            if (res.ok) { loadMappings(); loadSuggestions(); }
        } catch (err) { console.error("Failed to sync ledgers to DB", err); }
    };

    // ─── Template Import/Export ──────────────────────────────
    const exportLedgerMappings = async () => {
        // Sort mappings by group name first, then by ledger name
        const sortedMappings = [...ledgerMappings].sort((a, b) => {
            const groupA = (a.inheritedGroupName || a.parentGroup || 'Other').toUpperCase();
            const groupB = (b.inheritedGroupName || b.parentGroup || 'Other').toUpperCase();
            if (groupA !== groupB) return groupA.localeCompare(groupB);
            return a.ledgerName.localeCompare(b.ledgerName);
        });

        let dataToExport = sortedMappings.map(m => ({ 
            ledgerName: m.ledgerName, 
            sectionCode: m.sectionCode || m.inheritedSectionCode || '',
            isTdsLedger: m.isTdsLedger ? 'YES' : 'NO',
            parentGroup: m.inheritedGroupName || m.parentGroup || 'Other'
        }));
        
        if (dataToExport.length === 0) {
            dataToExport = [{ ledgerName: 'Example Audit Fees', sectionCode: '194J(b)', isTdsLedger: 'NO', parentGroup: 'Indirect Expenses' }];
        }

        const workbook = new ExcelJS.Workbook();
        const ws = workbook.addWorksheet('TDS Ledger Mappings');
        const wsRef = workbook.addWorksheet('Valid Sections List');

        // Setup Reference Tab
        wsRef.columns = [
            { header: 'Section Code', key: 'old_section', width: 16 },
            { header: 'New Section (IT Act 2025)', key: 'new_section_2025', width: 25 },
            { header: 'Nature of Payment', key: 'nature_of_payment', width: 45 },
            { header: 'Single Bill Threshold', key: 'single_bill_threshold', width: 22 },
            { header: 'Annual Threshold', key: 'annual_aggregate_threshold', width: 22 },
            { header: 'Individual/HUF Rate (%)', key: 'rate_individual_huf', width: 24 },
            { header: 'Company/Others Rate (%)', key: 'rate_company_others', width: 24 },
            { header: 'Missing PAN Rate (206AA) (%)', key: 'rate_missing_pan_206AA', width: 28 }
        ];

        rules.forEach(s => {
            wsRef.addRow({
                old_section: s.old_section,
                new_section_2025: s.new_section_2025,
                nature_of_payment: s.nature_of_payment,
                single_bill_threshold: s.single_bill_threshold !== null ? s.single_bill_threshold : 'N/A',
                annual_aggregate_threshold: s.annual_aggregate_threshold,
                rate_individual_huf: `${s.rate_individual_huf}%`,
                rate_company_others: `${s.rate_company_others}%`,
                rate_missing_pan_206AA: `${s.rate_missing_pan_206AA}%`
            });
        });

        // Header style for Reference tab
        wsRef.getRow(1).eachCell(cell => {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
        });

        // Setup Primary Tab
        ws.columns = [
            { header: 'Tally Ledger Name', key: 'ledgerName', width: 38 },
            { header: 'TDS Section Code', key: 'sectionCode', width: 22 },
            { header: 'TDS Tax Ledger (YES/NO)', key: 'isTdsLedger', width: 25 },
            { header: 'Tally Parent Group', key: 'parentGroup', width: 35 }
        ];

        dataToExport.forEach(row => ws.addRow(row));

        ws.getRow(1).eachCell(cell => {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
        });

        // Configure Native Excel Data Validation Dropdown Lists for Column B & Column C
        const totalRows = Math.max(dataToExport.length + 50, 1000);
        const sectionRange = `'Valid Sections List'!$A$2:$A$${rules.length + 1}`;

        for (let r = 2; r <= totalRows; r++) {
            const cellB = ws.getCell(`B${r}`);
            cellB.dataValidation = {
                type: 'list',
                allowBlank: true,
                formulae: [sectionRange],
                showErrorMessage: true,
                errorTitle: 'Invalid TDS Section Code',
                error: 'Please select a valid TDS Section Code from the dropdown list.'
            };

            const cellC = ws.getCell(`C${r}`);
            cellC.dataValidation = {
                type: 'list',
                allowBlank: true,
                formulae: ['"YES,NO"'],
                showErrorMessage: true,
                errorTitle: 'Invalid Option',
                error: 'Please select YES or NO.'
            };
        }

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'TDS_Ledger_Mappings_Template.xlsx';
        a.click();
        window.URL.revokeObjectURL(url);
    };

    const importLedgerMappings = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer); const workbook = XLSX.read(data, { type: 'array' }); const sheetName = workbook.SheetNames[0]; const worksheet = workbook.Sheets[sheetName]; const json = XLSX.utils.sheet_to_json(worksheet);
                const validSections = new Set(rules.map(s => s.old_section).concat(rules.map(s => s.new_section_2025)));
                const newMappings = json.map((row: any) => {
                    const isTds = String(row['TDS Tax Ledger (YES/NO)'] || '').trim().toUpperCase() === 'YES';
                    const secCode = String(row['TDS Section Code'] || '').trim();
                    return {
                        ledgerName: String(row['Tally Ledger Name'] || '').trim(),
                        sectionCode: isTds ? null : secCode,
                        isTdsLedger: isTds
                    };
                }).filter(m => m.ledgerName && (m.isTdsLedger || validSections.has(m.sectionCode || '')));
                if (newMappings.length > 0) {
                    const res = await fetch(`${getApiBase()}/api/tds/confirm-mapping`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mappings: newMappings }) });
                    if (res.ok) { toast.success(`Imported ${newMappings.length} mappings!`); loadMappings(); loadSuggestions(); }
                    else toast.error("Database import mapping save failed");
                } else toast.error('No valid ledger mappings found in Excel file');
            } catch (error) { toast.error('Invalid Excel file'); }
        };
        reader.readAsArrayBuffer(file); event.target.value = '';
    };

    const exportGroupMappings = async () => {
        let dataToExport = groupMappings.map(m => ({ 
            expenseGroup: m.expenseGroup, 
            subGroup: m.subGroup || '', 
            subGroup2: m.subGroup2 || '', 
            sectionCode: m.sectionCode 
        }));
        if (dataToExport.length === 0) dataToExport = [{ expenseGroup: 'Indirect Expenses', subGroup: 'PROFESSIONAL AND CONSULTING FEES', subGroup2: '', sectionCode: '194J(b)' }];
        
        const workbook = new ExcelJS.Workbook();
        const ws = workbook.addWorksheet('TDS Group Mappings');
        const wsRef = workbook.addWorksheet('Valid Sections List');

        // Setup Reference Tab
        wsRef.columns = [
            { header: 'Section Code', key: 'old_section', width: 16 },
            { header: 'New Section (IT Act 2025)', key: 'new_section_2025', width: 25 },
            { header: 'Nature of Payment', key: 'nature_of_payment', width: 45 },
            { header: 'Single Bill Threshold', key: 'single_bill_threshold', width: 22 },
            { header: 'Annual Threshold', key: 'annual_aggregate_threshold', width: 22 },
            { header: 'Individual/HUF Rate (%)', key: 'rate_individual_huf', width: 24 },
            { header: 'Company/Others Rate (%)', key: 'rate_company_others', width: 24 },
            { header: 'Missing PAN Rate (206AA) (%)', key: 'rate_missing_pan_206AA', width: 28 }
        ];

        rules.forEach(s => {
            wsRef.addRow({
                old_section: s.old_section,
                new_section_2025: s.new_section_2025,
                nature_of_payment: s.nature_of_payment,
                single_bill_threshold: s.single_bill_threshold !== null ? s.single_bill_threshold : 'N/A',
                annual_aggregate_threshold: s.annual_aggregate_threshold,
                rate_individual_huf: `${s.rate_individual_huf}%`,
                rate_company_others: `${s.rate_company_others}%`,
                rate_missing_pan_206AA: `${s.rate_missing_pan_206AA}%`
            });
        });

        wsRef.getRow(1).eachCell(cell => {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
        });

        // Setup Primary Tab
        ws.columns = [
            { header: 'Expense Group', key: 'expenseGroup', width: 30 },
            { header: 'Sub-Group', key: 'subGroup', width: 35 },
            { header: 'Sub-Group 2', key: 'subGroup2', width: 30 },
            { header: 'TDS Section Code', key: 'sectionCode', width: 22 }
        ];

        dataToExport.forEach(row => ws.addRow(row));

        ws.getRow(1).eachCell(cell => {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
        });

        // Add Native Data Validation Dropdowns for Column D (D2:D1000)
        const totalRows = Math.max(dataToExport.length + 50, 1000);
        const sectionRange = `'Valid Sections List'!$A$2:$A$${rules.length + 1}`;

        for (let r = 2; r <= totalRows; r++) {
            const cellD = ws.getCell(`D${r}`);
            cellD.dataValidation = {
                type: 'list',
                allowBlank: true,
                formulae: [sectionRange],
                showErrorMessage: true,
                errorTitle: 'Invalid TDS Section Code',
                error: 'Please select a valid TDS Section Code from the dropdown list.'
            };
        }

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'TDS_Group_Mappings_Template.xlsx';
        a.click();
        window.URL.revokeObjectURL(url);
    };

    const importGroupMappings = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer); const workbook = XLSX.read(data, { type: 'array' }); const sheetName = workbook.SheetNames[0]; const worksheet = workbook.Sheets[sheetName]; const json = XLSX.utils.sheet_to_json(worksheet);
                const validSections = new Set(rules.map(s => s.old_section).concat(rules.map(s => s.new_section_2025)));
                const newMappings = json.map((row: any) => ({ expenseGroup: String(row['Expense Group'] || '').trim(), subGroup: String(row['Sub-Group'] || '').trim() || undefined, subGroup2: String(row['Sub-Group 2'] || '').trim() || undefined, sectionCode: String(row['TDS Section Code'] || '').trim() })).filter(m => m.expenseGroup && validSections.has(m.sectionCode));
                if (newMappings.length > 0) {
                    let successCount = 0;
                    for (const m of newMappings) { const res = await fetch(`${getApiBase()}/api/tds/group-mappings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(m) }); if (res.ok) successCount++; }
                    toast.success(`Imported ${successCount} group mapping templates!`); loadGroupMappings();
                } else toast.error('No valid group mappings found in Excel file');
            } catch (error) { toast.error('Invalid Excel file'); }
        };
        reader.readAsArrayBuffer(file); event.target.value = '';
    };

    const export26QTemplate = () => {
        const dataToExport = [{ 'PAN': 'ABCDE1234F', 'Name': 'Example Vendor Pvt Ltd', 'Section': '194C', 'Amount Paid': 100000, 'TDS Deposited': 2000 }];
        const ws = XLSX.utils.json_to_sheet(dataToExport); const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Form 26Q Data');
        const refData = rules.map(s => ({ 'Section Code': s.old_section, 'New Section (IT Act 2025)': s.new_section_2025, 'Nature of Payment': s.nature_of_payment, 'Single Bill Threshold': s.single_bill_threshold !== null ? s.single_bill_threshold : 'N/A', 'Annual Threshold': s.annual_aggregate_threshold, 'Individual/HUF Rate (%)': `${s.rate_individual_huf}%`, 'Company/Others Rate (%)': `${s.rate_company_others}%`, 'Missing PAN Rate (206AA) (%)': `${s.rate_missing_pan_206AA}%` }));
        const wsRef = XLSX.utils.json_to_sheet(refData);
        wsRef['!cols'] = [{ wch: 15 }, { wch: 25 }, { wch: 40 }, { wch: 20 }, { wch: 20 }, { wch: 22 }, { wch: 22 }, { wch: 28 }];
        XLSX.utils.book_append_sheet(wb, wsRef, 'Valid Sections List');
        XLSX.writeFile(wb, 'Form_26Q_Template.xlsx');
    };

    // ─── Tally Connection ────────────────────────────────────
    const connectToTally = async () => {
        setConnectionStatus('connecting');
        try {
            const alive = await pingTally({ host: 'localhost', port: tallyPort });
            if (!alive) { setConnectionStatus('error'); return toast.error('Cannot reach Tally. Ensure it is open as a Server.'); }
            clearTallyMetadataCache();
            const info = await fetchCompanyInfo({ host: 'localhost', port: tallyPort });
            setCompanyInfo(info);
            setConnectionStatus('connected');
            toast.success('Connected to Tally!');
            // Auto-fetch party balances when connected
            fetchBalances();
        } catch (err) { setConnectionStatus('error'); toast.error('Connection failed'); }
    };

    const fetchBalances = async (overridePartyNames?: string[]) => {
        setIsFetchingBalances(true);
        try {
            // If explicit names are provided, use them. Otherwise, try to fallback to tallyDirectData.
            // Never fall back to the full database parties map to avoid massive TTDL queries (limits to 80 names max).
            const distinctNames = overridePartyNames && overridePartyNames.length > 0
                ? overridePartyNames
                : (tallyDirectData && tallyDirectData.length > 0
                    ? Array.from(new Set(tallyDirectData.map(t => t.partyName)))
                    : []);
            const partyNamesList = distinctNames.length > 0 && distinctNames.length < 80
                ? distinctNames
                : undefined;

            const balances = await fetchPartyBalances(fromDate, toDate, { host: 'localhost', port: tallyPort }, partyNamesList);
            setPartyBalances(balances);
            toast.success(`Scanned ${balances.size} party balances from Tally`);
        } catch (err) {
            console.error("Failed to fetch party balances", err);
            toast.error("Failed to scan party balances");
        } finally {
            setIsFetchingBalances(false);
        }
    };

    const handleFetchTally = async () => {
        setIsFetchingTally(true);
        try {
            const purchaseTypes = customPurchaseVouchers.split(/[.,;]/).map(s => s.trim()).filter(s => s.length > 0);
            const journalTypes = customJournalVouchers.split(/[.,;]/).map(s => s.trim()).filter(s => s.length > 0);
            const tdsLedgerNames = ledgerMappings.filter(m => m.isTdsLedger).map(m => m.ledgerName);
            const data = await fetchTdsTransactions(fromDate, toDate, { host: 'localhost', port: tallyPort }, groupMappings, purchaseTypes, journalTypes, tdsLedgerNames);
            setTallyDirectData(data);
            await syncPartiesFromTallyData(data);
            await syncLedgersFromTallyData(data);
            // Pass the parsed party names immediately to fetchBalances to bypass React state update delay
            const parsedPartyNames = Array.from(new Set(data.map(t => t.partyName)));
            fetchBalances(parsedPartyNames);
            toast.success(`Fetched ${data.length} expense/payment vouchers from Tally!`);
        } catch (err) { toast.error('Fetch failed', { description: String(err) }); }
        finally { setIsFetchingTally(false); }
    };

    // ─── Reconciliation Engine ───────────────────────────────
    const handleRunEngine = async () => {
        if (tdsIngestChannel === 'TALLY_EXCEL') {
            if (!tallyFile && !tallyDirectData) return toast.error("Please provide Tally data via API or File Upload.");
            if (!form26qFile) return toast.error("Please upload Form 26Q data.");
        } else if (tdsIngestChannel === 'ITR_JSON') {
            if (!tallyFile && !tallyDirectData) return toast.error("Please provide Tally data via API or File Upload.");
            if (!itrParsedTdsRecords || itrParsedTdsRecords.length === 0) return toast.error("Please upload and parse a valid ITR JSON file first.");
        } else if (tdsIngestChannel === 'MANUAL') {
            if (manualBooksTransactions.length === 0) return toast.error("Please add at least one Books transaction in the Manual grid.");
            if (manualTdsRecords.length === 0) return toast.error("Please add at least one TDS/Traces record in the Manual grid.");
        }
        setIsProcessing(true);
        try {
            const parseTallyAmount = (amountStr: string, isTdsLedger: boolean, row: any) => {
                if (!amountStr) return 0;
                const cleanStr = String(amountStr).replace(/,/g, '').trim();
                let val = parseFloat(cleanStr);
                if (isNaN(val)) return 0;

                const upperStr = cleanStr.toUpperCase();
                const isCr = upperStr.includes('CR') || val < 0 || (row && row['Credit'] && parseFloat(String(row['Credit']).replace(/,/g, '')) > 0);
                const isDr = upperStr.includes('DR') || (val > 0 && !upperStr.includes('CR')) || (row && row['Debit'] && parseFloat(String(row['Debit']).replace(/,/g, '')) > 0);

                const finalIsCr = isCr && !isDr;

                if (isTdsLedger) {
                    return finalIsCr ? Math.abs(val) : -Math.abs(val);
                } else {
                    return finalIsCr ? -Math.abs(val) : Math.abs(val);
                }
            };

            let tallyTransactions: any[] = [];
            if (tdsIngestChannel === 'MANUAL') {
                tallyTransactions = manualBooksTransactions.map(t => ({ date: t.date, partyName: t.partyName, partyPan: t.partyPan, ledgerName: t.ledgerName, amount: parseFloat(String(t.amount)), actualTdsDeducted: parseFloat(String(t.actualTdsDeducted)), voucherNumber: t.voucherNumber }));
            } else {
                tallyTransactions = tallyDirectData || [];
                if (!tallyDirectData && tallyFile) {
                    const parsedTally = await parseFile(tallyFile, { findHeader: true, raw: false });
                    const hasLedgerColumn = parsedTally.headers.some(h => { const hl = h.toLowerCase().trim(); return hl === 'ledger name' || hl === 'expense ledger' || hl === 'ledger' || hl === 'account name'; });
                    const tdsLedgersSet = new Set(ledgerMappings.filter(m => m.isTdsLedger).map(m => m.ledgerName.toUpperCase().trim()));
                    const mappedExpenseLedgersSet = new Set(ledgerMappings.filter(m => m.sectionCode).map(m => m.ledgerName.toUpperCase().trim()));
                    if (hasLedgerColumn) {
                        const vouchersMap = new Map<string, any[]>();
                        parsedTally.rows.forEach(r => {
                            const vchNo = String(r['Voucher No'] || r['Voucher Number'] || r['Voucher No.'] || r['Vch No.'] || r['Vch No'] || '').trim();
                            const party = String(r['Party Name'] || r['Particulars'] || 'Unknown Party').trim().toUpperCase();
                            const dateVal = String(r['Date'] || r['Voucher Date'] || '');
                            const key = vchNo ? `VCH-${vchNo}` : `TR-${dateVal}-${party}`;
                            if (!vouchersMap.has(key)) vouchersMap.set(key, []);
                            vouchersMap.get(key)!.push(r);
                        });
                        tallyTransactions = [];
                        for (const [key, rows] of vouchersMap.entries()) {
                            const firstRow = rows[0];
                            let dateStr = '';
                            const dateVal = firstRow['Date'] || firstRow['Voucher Date'];
                            if (typeof dateVal === 'number') { const d = new Date(Math.round((dateVal - 25569) * 86400 * 1000)); dateStr = d.toISOString().split('T')[0]; }
                            else { const d = new Date(String(dateVal || new Date())); dateStr = isNaN(d.getTime()) ? new Date().toISOString().split('T')[0] : d.toISOString().split('T')[0]; }
                            let partyName = '', partyPan = '', voucherNumber = '';
                            for (const r of rows) { const pName = String(r['Party Name'] || r['Particulars'] || '').trim(); if (pName && !partyName) partyName = pName; const pPan = String(r['PAN'] || r['Party PAN'] || r['PAN No'] || r['PAN Number'] || '').trim(); if (pPan && !partyPan) partyPan = pPan; const vNum = String(r['Voucher No'] || r['Voucher Number'] || r['Voucher No.'] || r['Vch No.'] || r['Vch No'] || '').trim(); if (vNum && !voucherNumber) voucherNumber = vNum; }
                            if (!partyName) partyName = 'Unknown Party';

                            const expenseRows = [];
                            let totalTdsAmount = 0;
                            let tdsLedgerName = '';

                            for (const r of rows) {
                                const ledgerNameRaw = String(r['Ledger Name'] || r['Expense Ledger'] || r['Ledger'] || r['Account Name'] || '').trim();
                                const ledgerNameUpper = ledgerNameRaw.toUpperCase().trim();
                                const amountStr = String(r['Amount'] || r['Gross Amount'] || r['Debit'] || r['Credit'] || '0');
                                const isTdsCol = tdsLedgersSet.has(ledgerNameUpper) || ledgerNameUpper.includes('TDS') || ledgerNameUpper.includes('TAX DEDUCTED') || ledgerNameUpper.includes('TAX PAYABLE');
                                const val = parseTallyAmount(amountStr, isTdsCol, r);

                                if (isTdsCol) {
                                    totalTdsAmount += val;
                                    tdsLedgerName = ledgerNameRaw;
                                } else if (Math.abs(val) > 0 && !ledgerNameUpper.includes('CGST') && !ledgerNameUpper.includes('SGST') && !ledgerNameUpper.includes('IGST') && !ledgerNameUpper.includes('ROUND OFF') && !ledgerNameUpper.includes('ROUNDING')) {
                                    expenseRows.push({ name: ledgerNameRaw, nameUpper: ledgerNameUpper, amount: val });
                                }

                                const rowTdsDeductedStr = String(r['TDS Deducted'] || r['TDS Amount'] || r['Actual TDS'] || '0');
                                const rowTdsDeducted = parseTallyAmount(rowTdsDeductedStr, true, r);
                                if (rowTdsDeducted > 0) {
                                    totalTdsAmount += rowTdsDeducted;
                                    if (!tdsLedgerName) tdsLedgerName = 'TDS';
                                }
                            }

                            const mappedExpenseRows = expenseRows.filter(e => mappedExpenseLedgersSet.has(e.nameUpper));
                            const targets = mappedExpenseRows.length > 0 ? mappedExpenseRows : expenseRows;
                            const totalTargetAmount = targets.reduce((sum, e) => sum + Math.abs(e.amount), 0);

                            if (expenseRows.length > 0) {
                                expenseRows.forEach(e => {
                                    const isTarget = targets.includes(e);
                                    const allocatedTds = isTarget && totalTargetAmount > 0 ? (Math.abs(e.amount) / totalTargetAmount) * totalTdsAmount : 0;
                                    tallyTransactions.push({ date: dateStr, partyName, partyPan, ledgerName: e.name, amount: e.amount, actualTdsDeducted: Math.round(allocatedTds * 100) / 100, tdsLedgerName: allocatedTds > 0 ? (tdsLedgerName || 'TDS') : '', voucherNumber });
                                });
                            } else if (totalTdsAmount > 0) {
                                tallyTransactions.push({ date: dateStr, partyName, partyPan, ledgerName: tdsLedgerName || 'TDS', amount: 0, actualTdsDeducted: totalTdsAmount, tdsLedgerName: tdsLedgerName || 'TDS', voucherNumber });
                            }
                        }
                    } else {
                        const stdKeys = new Set(['date', 'particulars', 'voucher type', 'voucher no.', 'voucher no', 'voucher ref. no.', 'voucher ref. no', 'voucher ref. date', 'gstin/uin', 'gstin', 'narration', 'value', 'gross total', 'addi. cost', 'amount', 'pan', 'party name', 'ledger name', 'tds deducted']);
                        tallyTransactions = [];
                        parsedTally.rows.forEach(r => {
                            const dateVal = r['Date'] || r['Voucher Date']; if (!dateVal) return;
                            let dateStr = '';
                            if (typeof dateVal === 'number') { const d = new Date(Math.round((dateVal - 25569) * 86400 * 1000)); dateStr = d.toISOString().split('T')[0]; }
                            else { const d = new Date(String(dateVal)); dateStr = isNaN(d.getTime()) ? new Date().toISOString().split('T')[0] : d.toISOString().split('T')[0]; }
                            const partyNameStr = String(r['Particulars'] || r['Party Name'] || 'Unknown Party').trim();
                            const gstinVal = String(r['GSTIN/UIN'] || r['GSTIN'] || '').trim();
                            const vchNo = String(r['Voucher No.'] || r['Voucher No'] || r['Voucher Number'] || '');
                            let extractedPan = ''; if (gstinVal && gstinVal.length === 15) extractedPan = gstinVal.substring(2, 12).toUpperCase();

                            const expenseColumns = [];
                            let rowTdsAmount = 0;
                            let tdsLedgerName = '';
                            Object.keys(r).forEach(k => {
                                const kLower = k.toLowerCase().trim(); if (stdKeys.has(kLower)) return;
                                const valStr = String(r[k] || '0');
                                if (!valStr || valStr === '0') return;
                                const isTdsCol = tdsLedgersSet.has(k.toUpperCase().trim()) || kLower.includes('tds') || kLower.includes('tax deducted') || kLower.includes('tax payable');
                                const val = parseTallyAmount(valStr, isTdsCol, r);
                                if (val === 0) return;

                                if (isTdsCol) {
                                    rowTdsAmount += val;
                                    tdsLedgerName = k;
                                } else {
                                    expenseColumns.push({ name: k, nameUpper: k.toUpperCase().trim(), amount: val });
                                }
                            });

                            const mappedExpenseColumns = expenseColumns.filter(e => mappedExpenseLedgersSet.has(e.nameUpper));
                            const targets = mappedExpenseColumns.length > 0 ? mappedExpenseColumns : expenseColumns;
                            const totalTargetAmount = targets.reduce((sum, e) => sum + Math.abs(e.amount), 0);

                            if (expenseColumns.length > 0) {
                                expenseColumns.forEach(e => {
                                    const isTarget = targets.includes(e);
                                    const allocatedTds = isTarget && totalTargetAmount > 0 ? (Math.abs(e.amount) / totalTargetAmount) * rowTdsAmount : 0;
                                    tallyTransactions.push({ date: dateStr, partyName: partyNameStr, partyPan: extractedPan, ledgerName: e.name, amount: e.amount, actualTdsDeducted: Math.round(allocatedTds * 100) / 100, tdsLedgerName: allocatedTds > 0 ? (tdsLedgerName || 'TDS') : '', voucherNumber: vchNo });
                                });
                            } else if (rowTdsAmount > 0) {
                                tallyTransactions.push({ date: dateStr, partyName: partyNameStr, partyPan: extractedPan, ledgerName: tdsLedgerName || 'TDS', amount: 0, actualTdsDeducted: rowTdsAmount, tdsLedgerName: tdsLedgerName || 'TDS', voucherNumber: vchNo });
                            }
                        });
                    }
                }
            }
            if (tallyTransactions.length === 0) throw new Error("No valid Books transactions found.");
            if (tdsIngestChannel !== 'MANUAL') { await syncPartiesFromTallyData(tallyTransactions); await syncLedgersFromTallyData(tallyTransactions); }

            let form26qRecords: any[] = [];
            if (tdsIngestChannel === 'MANUAL') {
                form26qRecords = manualTdsRecords.map(t => ({ partyPan: t.partyPan, partyName: t.partyName, section: t.section, amountPaid: parseFloat(String(t.amountPaid)), tdsDeducted: parseFloat(String(t.tdsDeducted)) }));
            } else if (tdsIngestChannel === 'ITR_JSON') {
                form26qRecords = itrParsedTdsRecords || [];
            } else {
                const parsed26Q = await parseFile(form26qFile!, { findHeader: true });
                form26qRecords = parsed26Q.rows.map(r => {
                    const findValue = (aliases: string[]) => { const keys = Object.keys(r); for (const alias of aliases) { const foundKey = keys.find(k => k.toLowerCase().trim() === alias.toLowerCase()); if (foundKey) return String(r[foundKey] || '').trim(); } for (const alias of aliases) { const foundKey = keys.find(k => k.toLowerCase().includes(alias.toLowerCase())); if (foundKey) return String(r[foundKey] || '').trim(); } return ''; };
                    const panVal = findValue(['pan', 'deductee pan', 'pan number', 'pan of deductee', 'pan of the deductee', 'deductor pan', 'pan of deductor', 'pan in 26q']);
                    const nameVal = findValue(['name', 'deductee name', 'name of deductee', 'name of the deductee', 'deductor name', 'name of deductor', 'party name', 'name in 26q']);
                    const secVal = findValue(['section', 'section code', 'tds section code', 'section under which deducted', 'sec code', 'sec']);
                    const amtVal = findValue(['amount paid', 'taxable amount', 'amount paid/credited', 'amount credited', 'gross amount', 'gross value', 'amount', 'taxable value', 'assessable value']);
                    const tdsVal = findValue(['tds deposited', 'tds deducted', 'tds amount', 'tds deposited/deducted', 'tds', 'tax deducted', 'tax deposited']);
                    const safeParseFloat = (val: string): number => { if (!val) return 0; const clean = val.replace(/[^0-9.-]/g, ''); const num = parseFloat(clean); return isNaN(num) ? 0 : num; };
                    return { partyPan: panVal, partyName: nameVal, section: secVal, amountPaid: safeParseFloat(amtVal), tdsDeducted: safeParseFloat(tdsVal) };
                }).filter(t => t.partyPan);
            }

            setTempTallyTransactions(tallyTransactions);
            setTempForm26qRecords(form26qRecords);

            // Compute Suggested Name-based mappings (Exact name & Fuzzy name matches)
            const suggestedMatches = computeSuggestedNameMatches(tallyTransactions, form26qRecords);
            if (suggestedMatches.length > 0) {
                setSuggestedNameMatches(suggestedMatches);
                const initialSelected: Record<string, boolean> = {};
                suggestedMatches.forEach(m => {
                    // Pre-check exact matches, fuzzy matches can be checked/unchecked by default
                    initialSelected[`${m.booksName}_${m.tracesName}`] = true;
                });
                setSelectedNameMatches(initialSelected);
                setShowNameMatchesDialog(true);
                setIsProcessing(false);
                return;
            }

            // No suggested name matches, check if we need to do PAN mapping
            const fuzzyMatches = checkForFuzzyMatches(tallyTransactions, form26qRecords);
            if (fuzzyMatches.length > 0) {
                setPendingPanMatches(fuzzyMatches);
                const initialSelected: Record<string, boolean> = {}; fuzzyMatches.forEach(m => { initialSelected[m.partyName] = true; }); setSelectedPanMatches(initialSelected);
                setShowPanMatchesDialog(true); setIsProcessing(false); return;
            }

            await runReconciliation(tallyTransactions, form26qRecords);
        } catch (err: any) { toast.error("Reconciliation failed", { description: err.message }); setIsProcessing(false); }
    };

    const computeSuggestedNameMatches = (tallyTxns: any[], tracesRecords: any[]) => {
        const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i;
        const normalizePartyName = (name: string) => {
            if (!name) return '';
            let n = name.toUpperCase()
                .replace(/[-\s\(\)]+(CR|DR)\b$/g, '')
                .replace(/\b(M\/S\.?|MS\.?|MR\.?|MRS\.?|SHREE|SHRI)\b/g, '')
                .replace(/\b(PVT|PRIVATE|LTD|LIMITED|LLP|INC|CO|COMPANY|CORP|CORPORATION|ENTERPRISES?|TRADERS?|INDUSTRIES|AGENC(?:Y|IES)|BROTHERS|BROS|SONS|ASSOCIATES|AND|&)\b/g, '')
                .replace(/[^A-Z0-9]/g, '')
                .trim();
            if (n.endsWith('S')) n = n.slice(0, -1);
            return n;
        };

        function levenshteinDistance(s1: string, s2: string): number {
            const track = Array(s2.length + 1).fill(null).map(() => Array(s1.length + 1).fill(null));
            for (let i = 0; i <= s1.length; i += 1) track[0][i] = i;
            for (let j = 0; j <= s2.length; j += 1) track[j][0] = j;
            for (let j = 1; j <= s2.length; j += 1) {
                for (let i = 1; i <= s1.length; i += 1) {
                    const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1;
                    track[j][i] = Math.min(
                        track[j][i - 1] + 1,
                        track[j - 1][i] + 1,
                        track[j - 1][i - 1] + indicator
                    );
                }
            }
            return track[s2.length][s1.length];
        }

        const booksParties = Array.from(new Set(tallyTxns.map(t => t.partyName.trim()))).filter(Boolean);
        const tracesParties = Array.from(new Set(tracesRecords.map(r => r.partyName.trim()))).filter(Boolean);

        const booksPanMap = new Map<string, string>();
        tallyTxns.forEach(t => { if (t.partyPan && PAN_REGEX.test(t.partyPan)) booksPanMap.set(t.partyName.trim().toUpperCase(), t.partyPan.trim().toUpperCase()); });
        const tracesPanMap = new Map<string, string>();
        tracesRecords.forEach(r => { if (r.partyPan && PAN_REGEX.test(r.partyPan)) tracesPanMap.set(r.partyName.trim().toUpperCase(), r.partyPan.trim().toUpperCase()); });

        const matches: { booksName: string; tracesName: string; type: 'Exact Name' | 'Fuzzy Name'; similarity: number }[] = [];
        const matchedBooksNames = new Set<string>();
        const matchedTracesNames = new Set<string>();

        // Phase 1: Exact Name matches
        for (const bp of booksParties) {
            const bpUpper = bp.toUpperCase().trim();
            const bpNorm = normalizePartyName(bp);
            if (!bpNorm) continue;

            const bpPan = booksPanMap.get(bpUpper);

            for (const tp of tracesParties) {
                const tpUpper = tp.toUpperCase().trim();
                const tpNorm = normalizePartyName(tp);
                if (!tpNorm || matchedTracesNames.has(tpUpper)) continue;

                const tpPan = tracesPanMap.get(tpUpper);
                if (bpPan && tpPan && bpPan === tpPan) continue; // Mapped by PAN
                if (bpPan && tpPan && bpPan !== tpPan) continue; // Different PANs

                if (bpNorm === tpNorm) {
                    matches.push({ booksName: bp, tracesName: tp, type: 'Exact Name', similarity: 1.0 });
                    matchedBooksNames.add(bpUpper);
                    matchedTracesNames.add(tpUpper);
                    break;
                }
            }
        }

        // Phase 2: Fuzzy Name matches
        for (const bp of booksParties) {
            const bpUpper = bp.toUpperCase().trim();
            if (matchedBooksNames.has(bpUpper)) continue;
            const bpNorm = normalizePartyName(bp);
            if (!bpNorm) continue;

            const bpPan = booksPanMap.get(bpUpper);

            let bestMatch: { tp: string; sim: number } | null = null;
            let highestSim = 0.7;

            for (const tp of tracesParties) {
                const tpUpper = tp.toUpperCase().trim();
                if (matchedTracesNames.has(tpUpper)) continue;
                const tpNorm = normalizePartyName(tp);
                if (!tpNorm) continue;

                const tpPan = tracesPanMap.get(tpUpper);
                if (bpPan && tpPan && bpPan !== tpPan) continue; // Different PANs

                let sim = 0;
                if (bpNorm.length >= 5 && tpNorm.length >= 5 && (bpNorm.includes(tpNorm) || tpNorm.includes(bpNorm))) {
                    sim = 0.9;
                } else {
                    const maxLen = Math.max(bpNorm.length, tpNorm.length);
                    if (maxLen >= 4) {
                        const dist = levenshteinDistance(bpNorm, tpNorm);
                        sim = 1 - dist / maxLen;
                    }
                }

                if (sim >= highestSim) {
                    highestSim = sim;
                    bestMatch = { tp, sim };
                }
            }

            if (bestMatch) {
                matches.push({ booksName: bp, tracesName: bestMatch.tp, type: 'Fuzzy Name', similarity: parseFloat(bestMatch.sim.toFixed(2)) });
                matchedBooksNames.add(bpUpper);
                matchedTracesNames.add(bestMatch.tp.toUpperCase().trim());
            }
        }

        return matches;
    };

    const checkForFuzzyMatches = (tallyTxns: any[], tracesRecords: any[]) => {
        const matches: { partyName: string; suggestedPan: string; section: string }[] = [];
        const tallyPartiesWithMissingPan = Array.from(new Set(tallyTxns.filter(t => { const nameKey = (t.partyName || '').toUpperCase().trim(); const dbParty = parties.find(p => p.party_name.toUpperCase().trim() === nameKey); const currentPan = dbParty?.pan_number || t.partyPan || t.pan || ''; return isPanMissing(currentPan); }).map(t => t.partyName.trim())));
        tallyPartiesWithMissingPan.forEach(partyName => {
            const key = partyName.toUpperCase().trim();
            const match26q = (tracesRecords || []).find(r => { const rName = (r.partyName || '').toUpperCase().trim(); return rName === key && !isPanMissing(r.partyPan); });
            if (match26q) matches.push({ partyName, suggestedPan: match26q.partyPan.toUpperCase(), section: match26q.section || '194C' });
        });
        return matches;
    };

    const runReconciliation = async (tallyTxns: any[], tracesRecords: any[], confirmedNameMatchesList?: { booksName: string; tracesName: string }[]) => {
        setIsProcessing(true);
        try {
            const response = await fetch(`${getApiBase()}/api/tds/reconcile`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    transactions: tallyTxns,
                    form26qRecords: tracesRecords,
                    confirmedMatches: confirmedNameMatchesList
                })
            });
            if (!response.ok) throw new Error("Failed to process reconciliation on the server.");
            const data = await response.json();
            const mappedResults = data.results.map((r: any) => {
                const partyNameUpper = (r.name_in_books || r.name_in_26q || r.party_name || '').toUpperCase().trim();
                const closingBal = partyBalances.get(partyNameUpper) || 0;
                return {
                    partyName: r.party_name, partyPan: r.party_pan, panInBooks: r.pan_in_books || '—', panIn26Q: r.pan_in_26q || '—',
                    nameInBooks: r.name_in_books || '—', nameIn26Q: r.name_in_26q || '—', section: r.section_code,
                    ledgers: r.ledgers, tdsLedgers: r.tds_ledgers, booksSpend: r.books_spend || 0,
                    booksTaxable: r.books_taxable, rateApplied: r.books_rate_applied || 0, booksRequiredTds: r.books_required_tds,
                    booksActualTds: r.books_actual_tds, tracesTaxable: r.traces_taxable, tracesTds: r.traces_tds,
                    taxableVariance: r.taxable_variance, tdsVariance: r.tds_variance, status: r.status,
                    reason: r.reason || '', closingBalance: closingBal
                };
            });
            setReconSummary(data.summary); setReconResults(mappedResults); setActiveStep(4); setExpandedRows(new Set());
            toast.success("TDS Reconciliation engine executed successfully!");
        } catch (err: any) { toast.error("Reconciliation failed", { description: err.message }); }
        finally { setIsProcessing(false); }
    };

    const handleReset = () => { setTallyFile(null); setForm26qFile(null); setItrJsonFile(null); setItrParsedTdsRecords(null); setTallyDirectData(null); setReconResults(null); setReconSummary(null); setActiveStep(0); toast.info("Reconciliation state cleared."); };

    const handleFullReset = async () => {
        if (!window.confirm("Are you sure you want to completely reset the TDS module? This will delete all ledger mappings, transactions, and vendor edits from the database to start fresh.")) return;
        try {
            const res = await fetch(`${getApiBase()}/api/tds/reset`, { method: 'POST' });
            if (res.ok) {
                setTallyFile(null); setForm26qFile(null); setTallyDirectData(null); setReconResults(null); setReconSummary(null);
                setLedgerMappings([]); setGroupMappings([]); setSuggestions([]); setSelectedSuggestions({});
                setSuggestedSections({}); setParties([]); setPartyBalances(new Map()); setActiveStep(0);
                toast.success("TDS Module completely reset successfully!");
            } else toast.error("Failed to reset database tables");
        } catch (err) { toast.error("Error communicating with reset server"); }
    };

    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'Matched': return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
            case 'Short Deducted': return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
            case 'Excess Deducted': return 'bg-purple-500/15 text-purple-400 border-purple-500/30';
            case 'Missing in 26Q': return 'bg-rose-500/15 text-rose-400 border-rose-500/30';
            case 'Missing in Books': return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
            default: return 'bg-slate-800 text-slate-300 border-slate-700';
        }
    };

    const filteredParties = parties.filter(p => p.party_name.toLowerCase().includes(partySearchTerm.toLowerCase()) || (p.pan_number || '').toLowerCase().includes(partySearchTerm.toLowerCase()) || p.entity_type.toLowerCase().includes(partySearchTerm.toLowerCase()));

    const statusCounts = useMemo(() => {
        const counts: Record<string, number> = { 'All': 0 };
        STATUS_FILTERS.forEach(s => { if (s !== 'All') counts[s] = 0; });
        reconResults?.forEach(r => { counts['All']++; if (counts[r.status] !== undefined) counts[r.status]++; });
        return counts;
    }, [reconResults]);

    const filteredResults = useMemo(() => {
        let results = reconResults || [];
        if (statusFilter !== 'All') results = results.filter(r => r.status === statusFilter);
        if (searchTerm) results = results.filter(r => (r.partyName || '').toLowerCase().includes(searchTerm.toLowerCase()) || (r.partyPan || '').toLowerCase().includes(searchTerm.toLowerCase()) || (r.section || '').toLowerCase().includes(searchTerm.toLowerCase()));
        // Recalculate required TDS based on PAN status for display
        return results.map(r => {
            const partyInfo = parties.find(p => (p.pan_number && p.pan_number === r.partyPan) || (p.party_name && p.party_name === r.partyName));
            return { ...r, party_entity_type: partyInfo?.entity_type || 'Unknown' } as any;
        });
    }, [reconResults, statusFilter, searchTerm, parties]);

    const toggleRowExpand = (i: number) => {
        setExpandedRows(prev => { const next = new Set(prev); if (next.has(i)) next.delete(i); else next.add(i); return next; });
    };

    // ─── Stepper readiness ───────────────────────────────────
    const step1Ready = !!(tallyDirectData || tallyFile);
    const step2Ready = ledgerMappings.length > 0 || groupMappings.length > 0;
    const step3Ready = !!form26qFile;
    const step4Ready = parties.length > 0;

    const steps = [
        { label: 'Tally Ingestion', icon: Database, ready: step1Ready, info: tallyDirectData ? `${tallyDirectData.length} vouchers` : (tallyFile ? tallyFile.name.slice(0, 12) : 'Fetch Tally Data') },
        { label: 'Ledger Mappings', icon: Settings2, ready: step2Ready, info: ledgerMappings.length > 0 ? `${ledgerMappings.length} mappings` : 'Map ledgers' },
        { label: '26Q Ingestion', icon: UploadCloud, ready: step3Ready, info: form26qFile ? form26qFile.name.slice(0, 12) : 'Upload 26Q' },
        { label: 'Vendor Review', icon: Users, ready: step4Ready, info: step4Ready ? `${parties.length} vendors` : 'Review Vendors' },
        { label: 'Results', icon: Activity, ready: !!reconResults, info: reconResults ? `${reconResults.length} records` : 'Run engine', disabled: !reconResults }
    ];

    /**
     * Determines the applicable TDS rate based on PAN availability and entity type.
     * @param pan The Permanent Account Number (PAN) of the party.
     * @param entityType The type of the entity ('Individual', 'Company', etc.).
     * @param sectionRule The TDS section rule object.
     * @returns The applicable TDS rate (e.g., 0.10 for 10%).
     */
    const getApplicableTdsRate = (pan: string | null | undefined, entityType: string, sectionRule: TdsSection | undefined): number => {
        if (!sectionRule) return 0.20; // Fallback to higher rate if rule is not found

        const panTrimmed = pan?.trim().toUpperCase();
        const isPanInvalid = !panTrimmed || panTrimmed.length !== 10 || !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i.test(panTrimmed);

        if (isPanInvalid) {
            return sectionRule.rate_missing_pan_206AA / 100;
        }

        // Determine entity type from PAN structure, which overrides any manual setting.
        const fourthChar = panTrimmed.charAt(3);
        if (['P', 'H'].includes(fourthChar)) { // P for Individual, H for HUF
            return sectionRule.rate_individual_huf / 100;
        }

        // If not explicitly an Individual/HUF via PAN, it's another entity type.
        return sectionRule.rate_company_others / 100;
    };

    // Format balance for display
    const fmtBal = (val: number) => {
        if (val === 0) return '—';
        const abs = Math.abs(val);
        const formatted = '₹' + abs.toLocaleString('en-IN', { maximumFractionDigits: 0 });
        if (val < 0) return `${formatted} Cr`;
        return `${formatted} Dr`;
    };

    const fmtAmt = (val: number) => '₹' + Math.abs(val).toLocaleString('en-IN', { maximumFractionDigits: 0 });

    return (
        <div className="w-full max-w-6xl mx-auto space-y-5 silk-reveal">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-slate-800 pb-5">
                <div>
                    <button onClick={onBack} className="text-slate-400 hover:text-white flex items-center gap-2 font-bold uppercase tracking-wider text-[10px] mb-3 transition-colors">
                        <ArrowLeft className="w-3 h-3" /> Back to Hub
                    </button>
                    <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
                        <FileSpreadsheet className="w-8 h-8 text-purple-500" /> TDS Reconciliation
                    </h1>
                    <p className="text-slate-400 font-medium mt-1 text-sm">Map expenses → Ingest data → Review vendors → Audit variances</p>
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto">
                    {partyBalances.size > 0 && (
                        <div className="px-3 py-1.5 bg-teal-500/10 border border-teal-500/20 rounded-lg text-[10px] font-bold text-teal-400 flex items-center gap-1.5">
                            <Wallet className="w-3.5 h-3.5" /> {partyBalances.size} balances scanned
                        </div>
                    )}
                    <button onClick={handleFullReset} className="h-9 px-4 bg-red-600/10 hover:bg-red-600/20 text-red-400 border border-red-500/20 hover:border-red-500/35 rounded-lg font-bold text-[10px] uppercase tracking-wider transition-all flex items-center gap-2 shadow-md shadow-red-950/20 ml-auto md:ml-0" title="Resets Tally database tables, files, and results to start fresh">
                        <Trash2 className="w-3.5 h-3.5 text-red-400" /> Full Reset
                    </button>
                </div>
            </div>

            {/* Navigation Stepper */}
            <StepperNav steps={steps} activeStep={activeStep} onStepClick={setActiveStep} />

            {/* ═══════════════ STEP 0: TALLY DATA INGESTION ═══════════════ */}
            {activeStep === 0 && (
                <div className="space-y-5 animate-pop-in">
                    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-xl">
                        <h3 className="text-lg font-bold text-white mb-1.5 flex items-center gap-2"><Database className="w-5 h-5 text-indigo-400" /> Tally Data Ingestion</h3>
                        <p className="text-xs text-slate-400 mb-5">Fetch ledger balances and transactions directly from Tally or upload your Tally Books registers.</p>
                        
                        <div className="mb-5 p-4 bg-slate-950 rounded-xl border border-slate-800">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-xs font-bold text-slate-300 flex items-center gap-2"><Server className="w-4 h-4 text-teal-400" /> Live Tally API Connection</span>
                                <div className="flex items-center gap-2">
                                    <input type="number" value={tallyPort} onChange={e => setTallyPort(Number(e.target.value))} className="w-20 h-7 bg-slate-900 border border-slate-700 rounded px-2 text-xs text-white" />
                                    <button onClick={connectToTally} disabled={connectionStatus === 'connecting'} className="h-7 px-3 bg-teal-600 hover:bg-teal-500 text-white rounded text-xs font-bold transition-colors shadow-lg shadow-teal-900/20 disabled:opacity-50">{connectionStatus === 'connecting' ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Connect'}</button>
                                </div>
                            </div>
                            {connectionStatus === 'connected' && (
                                <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                                    <div className="flex items-center gap-2 text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-1 rounded w-fit border border-emerald-500/20"><CheckCircle2 className="w-3 h-3" /> Connected: {companyInfo?.name}</div>
                                    <div className="flex gap-2">
                                        <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="flex-1 h-8 bg-slate-900 border border-slate-700 rounded px-2 text-xs text-white focus:border-teal-500 outline-none" />
                                        <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="flex-1 h-8 bg-slate-900 border border-slate-700 rounded px-2 text-xs text-white focus:border-teal-500 outline-none" />
                                        <button onClick={handleFetchTally} disabled={isFetchingTally} className="h-8 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded text-xs font-bold transition-colors flex items-center gap-2">{isFetchingTally ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Fetch Vouchers</button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3 pt-1">
                                        <div><label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Custom Purchase Vouchers</label><input type="text" value={customPurchaseVouchers} onChange={e => handleCustomPurchaseChange(e.target.value)} placeholder="e.g. Purchase GST" className="w-full h-8 bg-slate-900 border border-slate-700 rounded px-2.5 text-xs text-white placeholder-slate-600 focus:border-purple-500 outline-none" /></div>
                                        <div><label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Custom Journal Vouchers</label><input type="text" value={customJournalVouchers} onChange={e => handleCustomJournalChange(e.target.value)} placeholder="e.g. TDS Journal" className="w-full h-8 bg-slate-900 border border-slate-700 rounded px-2.5 text-xs text-white placeholder-slate-600 focus:border-purple-500 outline-none" /></div>
                                    </div>
                                    {tallyDirectData && <div className="text-xs text-indigo-300 font-medium pt-1">✅ {tallyDirectData.length} expense/payment vouchers fetched.</div>}
                                </div>
                            )}
                        </div>
                        
                        {!tallyDirectData && (!tallyFile ? <FileUploadZone onFileSelect={async (f) => { setTallyFile(f); toast.success('Tally Books Loaded'); }} label="Upload Tally Registers (Excel)" description="Accepts Tally Vouchers Excel Export (.xlsx)" /> : <div className="p-3.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl flex items-center justify-between"><div className="flex items-center gap-3"><CheckCircle2 className="text-indigo-400 w-5 h-5" /><span className="text-indigo-100 font-medium text-sm">{tallyFile.name}</span></div><button onClick={() => setTallyFile(null)} className="text-indigo-400 hover:text-white"><X className="w-4 h-4" /></button></div>)}
                    </div>
                    
                    <div className="flex justify-end pt-2">
                        <button onClick={() => setActiveStep(1)} disabled={!tallyDirectData && !tallyFile} className="h-10 px-6 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white rounded-xl font-bold text-sm transition-all flex items-center gap-2 shadow-lg shadow-purple-900/20">
                            Continue to Ledger Mappings <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* ═══════════════ STEP 1: LEDGER MAPPINGS ═══════════════ */}
            {activeStep === 1 && (
                <div className="space-y-4 animate-pop-in">
                    {/* Auto Map Preview */}
                    {suggestions.length > 0 && (
                        <div className="bg-gradient-to-br from-indigo-950/40 to-slate-900/60 border border-indigo-500/20 rounded-2xl p-5 shadow-xl relative overflow-hidden">
                            <div className="absolute right-0 top-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
                            <h2 className="text-lg font-bold text-white mb-1.5 flex items-center gap-2"><ShieldAlert className="w-5 h-5 text-indigo-400" /> Suggested Auto-Mappings</h2>
                            <p className="text-xs text-slate-400 mb-4">Verify these suggested section mappings and confirm to save.</p>
                            <div className="max-h-[250px] overflow-y-auto border border-slate-800/80 rounded-xl overflow-hidden mb-4 bg-slate-950/40">
                                <table className="w-full text-left text-sm whitespace-nowrap">
                                    <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 sticky top-0 z-10">
                                        <tr><th className="px-4 py-2.5 font-medium w-12 text-center">✓</th><th className="px-4 py-2.5 font-medium">Ledger Name</th><th className="px-4 py-2.5 font-medium">Section</th><th className="px-4 py-2.5 font-medium">Confidence</th></tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/50">
                                        {suggestions.map((s, i) => (
                                            <tr key={i} className="hover:bg-indigo-900/10 transition-colors">
                                                <td className="px-4 py-2.5 text-center"><input type="checkbox" checked={!!selectedSuggestions[s.ledgerName]} onChange={(e) => setSelectedSuggestions({ ...selectedSuggestions, [s.ledgerName]: e.target.checked })} className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 bg-slate-900 border-slate-700" /></td>
                                                <td className="px-4 py-2.5 text-white font-medium">{s.ledgerName}</td>
                                                <td className="px-4 py-2.5"><select value={suggestedSections[s.ledgerName] || s.suggestedSection} onChange={(e) => setSuggestedSections({ ...suggestedSections, [s.ledgerName]: e.target.value })} className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:border-purple-500 outline-none">{rules.map(r => <option key={r.old_section} value={r.old_section}>{r.old_section} - {r.nature_of_payment}</option>)}</select></td>
                                                <td className="px-4 py-2.5">{s.isProbable ? <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded text-[10px] font-bold">HIGH</span> : <span className="px-2 py-0.5 bg-slate-800 border border-slate-700 text-slate-400 rounded text-[10px] font-bold">LOW</span>}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="flex justify-end"><button onClick={handleConfirmAutoMappings} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold text-sm transition-colors shadow-lg shadow-indigo-900/30 flex items-center gap-2"><Check className="w-4 h-4" /> Confirm Selected</button></div>
                        </div>
                    )}

                    {/* Group Hierarchy Mappings - Collapsible */}
                    <CollapsibleSection title="Group Hierarchy Mappings" subtitle="Define mapping templates for Expense Groups to drive auto-classification" icon={Settings2} defaultOpen={groupMappings.length === 0}
                        badge={groupMappings.length > 0 ? <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded text-[10px] font-bold">{groupMappings.length} templates</span> : undefined}>
                        <div className="space-y-4 pt-4">
                            <div className="flex justify-end gap-2 mb-2">
                                <button onClick={exportGroupMappings} className="text-[10px] uppercase tracking-wider font-bold flex items-center gap-1 text-slate-400 hover:text-white transition-colors bg-slate-800 hover:bg-slate-700 px-2.5 py-1.5 rounded-lg border border-slate-700"><Download className="w-3 h-3" /> Export</button>
                                <label className="text-[10px] uppercase tracking-wider font-bold flex items-center gap-1 text-slate-400 hover:text-white transition-colors bg-slate-800 hover:bg-slate-700 px-2.5 py-1.5 rounded-lg border border-slate-700 cursor-pointer"><UploadCloud className="w-3 h-3" /> Import<input type="file" accept=".xlsx,.xls" className="hidden" onChange={importGroupMappings} /></label>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-4 bg-slate-950 rounded-xl border border-slate-800">
                                <div><label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Expense Group</label><input type="text" value={newExpenseGroup} onChange={e => setNewExpenseGroup(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddGroupMapping()} placeholder="e.g. Indirect Expenses" className="w-full h-9 bg-slate-900 border border-slate-700 rounded-lg px-3 text-sm text-white focus:border-purple-500 outline-none" /></div>
                                <div><label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Sub-Group</label><input type="text" value={newSubGroup} onChange={e => setNewSubGroup(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddGroupMapping()} placeholder="e.g. Professional Fees" className="w-full h-9 bg-slate-900 border border-slate-700 rounded-lg px-3 text-sm text-white focus:border-purple-500 outline-none" /></div>
                                <div><label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Sub-Group 2</label><input type="text" value={newSubGroup2} onChange={e => setNewSubGroup2(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddGroupMapping()} placeholder="Optional" className="w-full h-9 bg-slate-900 border border-slate-700 rounded-lg px-3 text-sm text-white focus:border-purple-500 outline-none" /></div>
                                <div><label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">TDS Section</label><select value={newGroupSectionCode} onChange={e => setNewGroupSectionCode(e.target.value)} className="w-full h-9 bg-slate-900 border border-slate-700 rounded-lg px-3 text-sm text-white focus:border-purple-500 outline-none">{rules.map(sec => <option key={sec.old_section} value={sec.old_section}>{sec.old_section} - {sec.nature_of_payment}</option>)}</select></div>
                                <div className="md:col-span-4 flex justify-end"><button onClick={handleAddGroupMapping} className="h-9 px-5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-bold text-sm transition-colors">Add Template</button></div>
                            </div>
                            {groupMappings.length > 0 && (
                                <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/20">
                                    <table className="w-full text-left text-sm whitespace-nowrap"><thead className="bg-slate-950 border-b border-slate-800 text-slate-400"><tr><th className="px-4 py-2.5 font-medium">Expense Group Path</th><th className="px-4 py-2.5 font-medium text-center">TDS Section</th><th className="px-4 py-2.5 font-medium text-center w-16"></th></tr></thead>
                                        <tbody className="divide-y divide-slate-800/50">{groupMappings.map((map, i) => (<tr key={i} className="hover:bg-slate-800/30"><td className="px-4 py-2.5 text-white font-medium">{map.expenseGroup}{map.subGroup && ` > ${map.subGroup}`}{map.subGroup2 && ` > ${map.subGroup2}`}</td><td className="px-4 py-2.5 text-center"><span className="px-2 py-0.5 bg-purple-500/10 border border-purple-500/20 rounded font-mono text-xs font-bold text-purple-400">{map.sectionCode}</span></td><td className="px-4 py-2.5 text-center"><button onClick={() => handleRemoveGroupMapping(map.id)} className="text-red-400 hover:text-red-300 transition-colors"><Trash2 className="w-4 h-4 mx-auto" /></button></td></tr>))}</tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </CollapsibleSection>

                    {/* Ledger Mappings - Collapsible */}
                    <CollapsibleSection title="Tally Ledger Mappings" subtitle="Define which expense ledgers attract TDS and under which section" icon={FileSpreadsheet} defaultOpen={ledgerMappings.length === 0}
                        badge={ledgerMappings.length > 0 ? <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded text-[10px] font-bold">{ledgerMappings.length} mapped</span> : undefined}>
                        <div className="space-y-4 pt-4">
                            <div className="flex justify-end gap-2 mb-2">
                                <button onClick={exportLedgerMappings} className="text-[10px] uppercase tracking-wider font-bold flex items-center gap-1 text-slate-400 hover:text-white transition-colors bg-slate-800 hover:bg-slate-700 px-2.5 py-1.5 rounded-lg border border-slate-700"><Download className="w-3 h-3" /> Export</button>
                                <label className="text-[10px] uppercase tracking-wider font-bold flex items-center gap-1 text-slate-400 hover:text-white transition-colors bg-slate-800 hover:bg-slate-700 px-2.5 py-1.5 rounded-lg border border-slate-700 cursor-pointer"><UploadCloud className="w-3 h-3" /> Import<input type="file" accept=".xlsx,.xls" className="hidden" onChange={importLedgerMappings} /></label>
                            </div>
                            <div className="flex flex-col md:flex-row gap-3 p-4 bg-slate-950 rounded-xl border border-slate-800">
                                <div className="flex-1"><label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Tally Ledger Name</label><input type="text" value={newLedgerName} onChange={e => setNewLedgerName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddMapping()} placeholder="e.g. Audit Fees" className="w-full h-9 bg-slate-900 border border-slate-700 rounded-lg px-3 text-sm text-white focus:border-purple-500 outline-none" /></div>
                                <div className="flex items-center gap-2 md:mt-5 px-2"><input type="checkbox" id="isNewLedgerTds" checked={isNewLedgerTds} onChange={e => setIsNewLedgerTds(e.target.checked)} className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 bg-slate-900 border-slate-700 cursor-pointer" /><label htmlFor="isNewLedgerTds" className="text-xs font-medium text-slate-300 cursor-pointer select-none whitespace-nowrap">TDS Tax Ledger</label></div>
                                <div className="w-full md:w-56"><label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Section</label><select value={newSectionCode} onChange={e => setNewSectionCode(e.target.value)} disabled={isNewLedgerTds} className="w-full h-9 bg-slate-900 border border-slate-700 rounded-lg px-3 text-sm text-white focus:border-purple-500 outline-none disabled:opacity-40">{rules.map(sec => <option key={sec.old_section} value={sec.old_section}>{sec.old_section} - {sec.nature_of_payment}</option>)}</select></div>
                                <div className="flex items-end"><button onClick={handleAddMapping} className="h-9 px-5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-bold text-sm transition-colors whitespace-nowrap">Add Ledger</button></div>
                            </div>
                            {ledgerMappings.length > 0 && (
                                <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/20 max-h-[300px] overflow-y-auto">
                                    <table className="w-full text-left text-sm whitespace-nowrap"><thead className="bg-slate-950 border-b border-slate-800 text-slate-400 sticky top-0 z-10"><tr><th className="px-4 py-2.5 font-medium">Tally Ledger</th><th className="px-4 py-2.5 font-medium text-center w-32">TDS Tax?</th><th className="px-4 py-2.5 font-medium">Section</th><th className="px-4 py-2.5 font-medium text-center w-16"></th></tr></thead>
                                        <tbody className="divide-y divide-slate-800/50">{ledgerMappings.map((map, i) => (<tr key={i} className="hover:bg-slate-800/30"><td className="px-4 py-2.5 text-white font-medium flex items-center gap-2">{map.ledgerName}{map.inheritedGroupName && !map.sectionCode && (<span className="px-1.5 py-0.5 bg-indigo-500/10 border border-indigo-500/20 rounded text-[9px] font-bold text-indigo-400 whitespace-nowrap" title={`Inherited from group mapping: ${map.inheritedGroupName}`}>Group: {map.inheritedGroupName}</span>)}</td><td className="px-4 py-2.5 text-center"><input type="checkbox" checked={map.isTdsLedger} onChange={(e) => handleUpdateLedgerConfig(map.ledgerName, { isTdsLedger: e.target.checked })} className="w-4 h-4 rounded text-purple-600 bg-slate-900 border-slate-700 cursor-pointer" /></td><td className="px-4 py-2.5"><select value={map.sectionCode || map.inheritedSectionCode || ''} onChange={(e) => handleUpdateLedgerConfig(map.ledgerName, { sectionCode: e.target.value || null })} className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:border-purple-500 outline-none"><option value="">-- Unmapped (Select Section) --</option>{rules.map(sec => <option key={sec.old_section} value={sec.old_section}>{sec.old_section} - {sec.nature_of_payment}</option>)}</select></td><td className="px-4 py-2.5 text-center"><button onClick={() => handleRemoveMapping(map.ledgerName)} className="text-red-400 hover:text-red-300"><Trash2 className="w-4 h-4 mx-auto" /></button></td></tr>))}</tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </CollapsibleSection>

                    {/* Buttons */}
                    <div className="flex justify-between pt-2">
                        <button onClick={() => setActiveStep(0)} className="h-10 px-6 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 rounded-xl font-bold text-sm transition-all flex items-center gap-2">
                            <ArrowLeft className="w-4 h-4" /> Back to Ingestion
                        </button>
                        <button onClick={() => setActiveStep(2)} className="h-10 px-6 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-bold text-sm transition-all flex items-center gap-2 shadow-lg shadow-purple-900/20">
                            Continue to Form 26Q Ingestion <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* ═══════════════ STEP 2: Form 26Q INGESTION ═══════════════ */}
            {activeStep === 2 && (
                <div className="space-y-5 animate-pop-in">
                    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-xl">
                        <div className="flex items-center justify-between mb-1.5">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2"><FileSpreadsheet className="w-5 h-5 text-emerald-400" /> Form 26Q (TRACES)</h3>
                            <button onClick={export26QTemplate} className="text-[10px] uppercase tracking-wider font-bold flex items-center gap-1 text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1.5 rounded-lg border border-emerald-500/20"><Download className="w-3 h-3" /> Template</button>
                        </div>
                        <p className="text-xs text-slate-400 mb-5">Upload Form 26Q Excel file from TRACES. Must have columns: <b>PAN, Name, Section, Amount Paid, TDS Deposited</b>.</p>
                        {!form26qFile ? <FileUploadZone onFileSelect={async (f) => { setForm26qFile(f); toast.success('Form 26Q Loaded'); }} label="Upload Form 26Q" description="Accepts Excel (.xlsx)" /> : <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-between"><div className="flex items-center gap-3"><CheckCircle2 className="text-emerald-400 w-5 h-5" /><span className="text-emerald-100 font-medium text-sm">{form26qFile.name}</span></div><button onClick={() => setForm26qFile(null)} className="text-emerald-400 hover:text-white"><X className="w-4 h-4" /></button></div>}
                    </div>

                    <CollapsibleSection title="Alternative Ingestion Methods (ITR JSON / Manual Grid)" subtitle="Upload filed ITR JSON or type transactions manually inside browser grid" icon={Settings2} defaultOpen={false}>
                        <div className="space-y-5 pt-4">
                            {/* Channel Tabs */}
                            <div className="flex border-b border-slate-800 pb-2 gap-4">
                                {(['ITR_JSON', 'MANUAL'] as const).map(ch => (
                                    <button key={ch} onClick={() => setTdsIngestChannel(ch === 'ITR_JSON' ? 'ITR_JSON' : 'MANUAL')} className={`pb-2 text-xs font-bold uppercase tracking-wider transition-colors ${tdsIngestChannel === ch ? 'text-purple-400 border-b-2 border-purple-400 font-extrabold' : 'text-slate-500 hover:text-slate-300'}`}>
                                        {ch === 'ITR_JSON' ? 'ITR JSON Upload' : 'Manual Grid Entry'}
                                    </button>
                                ))}
                            </div>

                            {/* ITR JSON */}
                            {tdsIngestChannel === 'ITR_JSON' && (
                                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-xl">
                                    <h3 className="text-lg font-bold text-white mb-1.5 flex items-center gap-2"><FileText className="w-5 h-5 text-emerald-400" /> ITR JSON file (TDS Credit)</h3>
                                    <p className="text-xs text-slate-400 mb-5">Upload filed ITR JSON. Auto-extracts all TDS deductions from Schedule TDS.</p>
                                    {!itrJsonFile ? (<FileUploadZone onFileSelect={handleItrFileUpload} label="Upload ITR JSON" description="Accepts .json" accepted=".json" />) : (
                                        <div className="space-y-3">
                                            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-between"><div className="flex items-center gap-3"><CheckCircle2 className="text-emerald-400 w-5 h-5" /><span className="text-emerald-100 font-medium text-sm">{itrJsonFile.name}</span></div><button onClick={() => { setItrJsonFile(null); setItrParsedTdsRecords(null); }} className="text-emerald-400 hover:text-white"><X className="w-4 h-4" /></button></div>
                                            {itrParsedTdsRecords && (<div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800"><div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Parsed {itrParsedTdsRecords.length} TDS Credits</div><div className="max-h-[140px] overflow-y-auto text-[11px] text-slate-400 font-mono space-y-1 divide-y divide-slate-900">{itrParsedTdsRecords.map((r, idx) => (<div key={idx} className="pt-1 first:pt-0 flex justify-between"><span>{r.partyName.slice(0, 15)}.. ({r.partyPan})</span><span className="text-emerald-400 font-bold">₹{r.tdsDeducted.toLocaleString()}</span></div>))}</div></div>)}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Manual Grid */}
                            {tdsIngestChannel === 'MANUAL' && (
                                <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                                    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
                                        <div><h3 className="text-lg font-bold text-white flex items-center gap-2"><Database className="w-5 h-5 text-indigo-400" /> Books Transactions</h3><p className="text-xs text-slate-400">Manually insert transactions from books.</p></div>
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                                            <div><label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Date</label><input type="date" value={newManualBook.date} onChange={e => setNewManualBook({ ...newManualBook, date: e.target.value })} className="w-full h-8 bg-slate-900 border border-slate-700 rounded px-2 text-xs text-white" /></div>
                                            <div><label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Party Name</label><input type="text" placeholder="Vendor Name" value={newManualBook.partyName} onChange={e => setNewManualBook({ ...newManualBook, partyName: e.target.value })} onKeyDown={e => e.key === 'Enter' && handleAddManualBookRow()} className="w-full h-8 bg-slate-900 border border-slate-700 rounded px-2 text-xs text-white" /></div>
                                            <div><label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">PAN</label><input type="text" placeholder="ABCDE1234F" value={newManualBook.partyPan} onChange={e => setNewManualBook({ ...newManualBook, partyPan: e.target.value })} className="w-full h-8 bg-slate-900 border border-slate-700 rounded px-2 text-xs text-white font-mono" /></div>
                                            <div><label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Ledger</label><input type="text" placeholder="e.g. Audit Fees" value={newManualBook.ledgerName} onChange={e => setNewManualBook({ ...newManualBook, ledgerName: e.target.value })} className="w-full h-8 bg-slate-900 border border-slate-700 rounded px-2 text-xs text-white" /></div>
                                            <div><label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Gross Amt (₹)</label><input type="number" placeholder="100000" value={newManualBook.amount} onChange={e => setNewManualBook({ ...newManualBook, amount: e.target.value })} onKeyDown={e => e.key === 'Enter' && handleAddManualBookRow()} className="w-full h-8 bg-slate-900 border border-slate-700 rounded px-2 text-xs text-white" /></div>
                                            <div><label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Actual TDS (₹)</label><input type="number" placeholder="10000" value={newManualBook.actualTds} onChange={e => setNewManualBook({ ...newManualBook, actualTds: e.target.value })} className="w-full h-8 bg-slate-900 border border-slate-700 rounded px-2 text-xs text-white" /></div>
                                            <div><label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Voucher No</label><input type="text" placeholder="Optional" value={newManualBook.voucherNo} onChange={e => setNewManualBook({ ...newManualBook, voucherNo: e.target.value })} className="w-full h-8 bg-slate-900 border border-slate-700 rounded px-2 text-xs text-white" /></div>
                                            <div className="flex items-end"><button onClick={handleAddManualBookRow} className="w-full h-8 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs font-bold flex items-center justify-center gap-1"><Plus className="w-3.5 h-3.5" /> Add</button></div>
                                        </div>
                                        <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/20 max-h-[180px] overflow-y-auto">
                                            <table className="w-full text-left text-xs whitespace-nowrap"><thead className="bg-slate-950 border-b border-slate-800 text-slate-400 sticky top-0"><tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Party</th><th className="px-3 py-2">Ledger</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2 text-right">TDS</th><th className="px-3 py-2 w-8"></th></tr></thead>
                                                <tbody className="divide-y divide-slate-800/50">{manualBooksTransactions.length === 0 ? (<tr><td colSpan={6} className="px-3 py-5 text-center text-slate-500">No rows yet. Add transactions above.</td></tr>) : manualBooksTransactions.map(r => (<tr key={r.id} className="hover:bg-slate-800/20"><td className="px-3 py-1.5 text-slate-300 font-mono">{r.date}</td><td className="px-3 py-1.5 text-white font-medium truncate max-w-[120px]" title={r.partyName}>{r.partyName}</td><td className="px-3 py-1.5 text-slate-300">{r.ledgerName}</td><td className="px-3 py-1.5 text-right text-white font-mono">₹{r.amount.toLocaleString()}</td><td className="px-3 py-1.5 text-right text-purple-300 font-mono">₹{r.actualTdsDeducted.toLocaleString()}</td><td className="px-3 py-1.5 text-center"><button onClick={() => handleDeleteManualBookRow(r.id)} className="text-red-400 hover:text-red-300"><Trash2 className="w-3.5 h-3.5 mx-auto" /></button></td></tr>))}</tbody>
                                            </table>
                                        </div>
                                    </div>
                                    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
                                        <div><h3 className="text-lg font-bold text-white flex items-center gap-2"><FileSpreadsheet className="w-5 h-5 text-emerald-400" /> TDS / TRACES Records</h3><p className="text-xs text-slate-400">Manually insert TDS declarations from returns or Form 26AS.</p></div>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                                            <div><label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">PAN/TAN</label><input type="text" placeholder="ABCDE1234F" value={newManualTds.partyPan} onChange={e => setNewManualTds({ ...newManualTds, partyPan: e.target.value })} onKeyDown={e => e.key === 'Enter' && handleAddManualTdsRow()} className="w-full h-8 bg-slate-900 border border-slate-700 rounded px-2 text-xs text-white font-mono" /></div>
                                            <div><label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Name</label><input type="text" placeholder="Deductor Name" value={newManualTds.partyName} onChange={e => setNewManualTds({ ...newManualTds, partyName: e.target.value })} className="w-full h-8 bg-slate-900 border border-slate-700 rounded px-2 text-xs text-white" /></div>
                                            <div><label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Section</label><select value={newManualTds.section} onChange={e => setNewManualTds({ ...newManualTds, section: e.target.value })} className="w-full h-8 bg-slate-900 border border-slate-700 rounded px-2 text-xs text-white">{rules.map(sec => <option key={sec.old_section} value={sec.old_section}>{sec.old_section}</option>)}</select></div>
                                            <div><label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Amount Paid (₹)</label><input type="number" placeholder="100000" value={newManualTds.amountPaid} onChange={e => setNewManualTds({ ...newManualTds, amountPaid: e.target.value })} className="w-full h-8 bg-slate-900 border border-slate-700 rounded px-2 text-xs text-white" /></div>
                                            <div><label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">TDS Deposited (₹)</label><input type="number" placeholder="10000" value={newManualTds.tdsDeducted} onChange={e => setNewManualTds({ ...newManualTds, tdsDeducted: e.target.value })} onKeyDown={e => e.key === 'Enter' && handleAddManualTdsRow()} className="w-full h-8 bg-slate-900 border border-slate-700 rounded px-2 text-xs text-white" /></div>
                                            <div className="flex items-end"><button onClick={handleAddManualTdsRow} className="w-full h-8 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs font-bold flex items-center justify-center gap-1"><Plus className="w-3.5 h-3.5" /> Add</button></div>
                                        </div>
                                        <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/20 max-h-[180px] overflow-y-auto">
                                            <table className="w-full text-left text-xs whitespace-nowrap"><thead className="bg-slate-950 border-b border-slate-800 text-slate-400 sticky top-0"><tr><th className="px-3 py-2">PAN</th><th className="px-3 py-2">Name</th><th className="px-3 py-2 text-center">Section</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2 text-right">TDS</th><th className="px-3 py-2 w-8"></th></tr></thead>
                                                <tbody className="divide-y divide-slate-800/50">{manualTdsRecords.length === 0 ? (<tr><td colSpan={6} className="px-3 py-5 text-center text-slate-500">No TDS records yet. Add rows above.</td></tr>) : manualTdsRecords.map(r => (<tr key={r.id} className="hover:bg-slate-800/20"><td className="px-3 py-1.5 font-mono text-slate-400">{r.partyPan}</td><td className="px-3 py-1.5 text-white font-medium truncate max-w-[120px]" title={r.partyName}>{r.partyName}</td><td className="px-3 py-1.5 text-center"><span className="px-1.5 py-0.5 bg-purple-500/10 border border-purple-500/20 rounded font-bold text-[10px] text-purple-400">{r.section}</span></td><td className="px-3 py-1.5 text-right text-white font-mono">₹{r.amountPaid.toLocaleString()}</td><td className="px-3 py-1.5 text-right text-emerald-400 font-mono">₹{r.tdsDeducted.toLocaleString()}</td><td className="px-3 py-1.5 text-center"><button onClick={() => handleDeleteManualTdsRow(r.id)} className="text-red-400 hover:text-red-300"><Trash2 className="w-3.5 h-3.5 mx-auto" /></button></td></tr>))}</tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </CollapsibleSection>

                    <div className="flex justify-between pt-2">
                        <button onClick={() => setActiveStep(1)} className="h-10 px-6 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 rounded-xl font-bold text-sm transition-all flex items-center gap-2">
                            <ArrowLeft className="w-4 h-4" /> Back to Mappings
                        </button>
                        <button onClick={() => setActiveStep(3)} disabled={!form26qFile && !itrParsedTdsRecords && manualTdsRecords.length === 0} className="h-10 px-6 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white rounded-xl font-bold text-sm transition-all flex items-center gap-2 shadow-lg shadow-purple-900/20">
                            Continue to Vendor Review <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* ═══════════════ STEP 3: VENDOR MASTERS ═══════════════ */}
            {activeStep === 3 && (
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-xl animate-pop-in">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-5">
                        <div>
                            <h2 className="text-lg font-bold text-white mb-0.5">Vendor Master Profile</h2>
                            <p className="text-xs text-slate-400">Review vendor PAN mappings, Entity Types, and <b>Closing Balances</b>. Edit missing records.</p>
                        </div>
                        <div className="flex items-center gap-3 w-full sm:w-auto">
                            {connectionStatus === 'connected' && (
                                <button onClick={() => fetchBalances()} disabled={isFetchingBalances} className="h-8 px-3 bg-teal-600/20 hover:bg-teal-600/30 text-teal-400 border border-teal-500/20 rounded-lg text-[10px] font-bold transition-colors flex items-center gap-1.5">
                                    {isFetchingBalances ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wallet className="w-3 h-3" />} Refresh Balances
                                </button>
                            )}
                            <div className="relative flex-1 sm:w-56">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                <input type="text" value={partySearchTerm} onChange={(e) => setPartySearchTerm(e.target.value)} placeholder="Search vendors, PANs..." className="w-full h-9 bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-4 text-sm text-white focus:border-purple-500 outline-none" />
                            </div>
                        </div>
                    </div>
                    <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/20 max-h-[500px] overflow-y-auto">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 sticky top-0 z-10">
                                <tr><th className="px-4 py-2.5 font-medium">Vendor Name</th><th className="px-4 py-2.5 font-medium">PAN</th><th className="px-4 py-2.5 font-medium">Entity Type</th><th className="px-4 py-2.5 font-medium text-right">Closing Balance</th><th className="px-4 py-2.5 font-medium text-center w-24">Action</th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/50">
                                {filteredParties.length === 0 ? (
                                    <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500"><div className="flex flex-col items-center gap-2"><Users className="w-8 h-8 text-slate-700" /><span>No parties registered. Sync or import Tally books in the Data tab.</span></div></td></tr>
                                ) : filteredParties.map((p) => {
                                    const isEditing = editingPartyId === p.id;
                                    const bal = partyBalances.get(p.party_name.toUpperCase()) || 0;
                                    return (
                                        <tr key={p.id} className="hover:bg-slate-800/20">
                                            <td className="px-4 py-2.5 text-white font-medium max-w-[250px] truncate" title={p.party_name}>{p.party_name}</td>
                                            <td className="px-4 py-2.5 font-mono text-xs text-slate-300">
                                                {isEditing ? <input type="text" value={editPan} onChange={e => setEditPan(e.target.value)} maxLength={10} onKeyDown={e => e.key === 'Enter' && handleSavePartyEdit(p.id)} className="w-28 bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-xs text-white font-mono focus:border-purple-500 outline-none" /> : (p.pan_number || <span className="text-red-400 italic font-sans">Missing PAN</span>)}
                                            </td>
                                            <td className="px-4 py-2.5">
                                                {isEditing ? (
                                                    <select value={editEntityType} onChange={e => setEditEntityType(e.target.value)} className="bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-xs text-white focus:border-purple-500 outline-none"><option value="Individual">P - Individual</option><option value="HUF">H - HUF</option><option value="Company">C - Company</option><option value="Firm">F - Firm / LLP</option><option value="AOP">A - AOP</option><option value="Trust">T - Trust</option><option value="Unknown">Unknown</option></select>
                                                ) : (
                                                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${p.entity_type === 'Company' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : p.entity_type === 'Individual' ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20' : p.entity_type === 'Firm' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : p.entity_type === 'HUF' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}>{p.entity_type}</span>
                                                )}
                                            </td>
                                            <td className={`px-4 py-2.5 text-right font-mono text-xs ${bal < 0 ? 'text-rose-400' : bal > 0 ? 'text-teal-400' : 'text-slate-500'}`}>{fmtBal(bal)}</td>
                                            <td className="px-4 py-2.5 text-center">
                                                {isEditing ? (
                                                    <div className="flex gap-2 justify-center">
                                                        <button onClick={() => handleSavePartyEdit(p.id)} className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Save</button>
                                                        <button onClick={() => setEditingPartyId(null)} className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-bold">Cancel</button>
                                                    </div>
                                                ) : (
                                                    <button onClick={() => startEditingParty(p)} className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white rounded text-xs font-semibold flex items-center gap-1 mx-auto"><Edit2 className="w-3 h-3" /> Edit</button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Run Engine */}
                    <div className="flex justify-between items-center gap-4 pt-3">
                        <button onClick={() => setActiveStep(2)} className="h-10 px-6 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 rounded-xl font-bold text-sm transition-all flex items-center gap-2">
                            <ArrowLeft className="w-4 h-4" /> Back to 26Q Ingestion
                        </button>
                        <div className="flex gap-3">
                            <button onClick={handleRunEngine} disabled={isProcessing}
                                className="h-12 px-8 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl font-bold transition-all disabled:opacity-40 shadow-lg shadow-purple-900/30 flex items-center gap-2.5 text-sm">
                                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                                {isProcessing ? 'Analyzing Thresholds & Verifying...' : 'Run Reconciliation Engine'}
                            </button>
                            {(tallyFile || tallyDirectData || form26qFile || itrJsonFile) && (
                                <button onClick={handleReset} className="h-12 px-5 bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl font-bold transition-all border border-slate-800 flex items-center gap-2 text-sm"><Trash2 className="w-4 h-4" /> Clear Data</button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════ STEP 4: RESULTS ═══════════════ */}
            {activeStep === 4 && reconResults && (
                <div className="space-y-5 animate-pop-in">
                    {/* Summary Cards */}
                    {reconSummary && (
                        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                            {[
                                { label: 'Total', val: reconSummary.total_parties_analyzed, color: 'text-white', bg: 'bg-slate-900/40 border-slate-800' },
                                { label: 'Matched', val: reconSummary.matched_count, color: 'text-emerald-400', bg: 'bg-emerald-500/5 border-emerald-500/20' },
                                { label: 'Short', val: reconSummary.short_deducted_count, color: 'text-amber-400', bg: 'bg-amber-500/5 border-amber-500/20' },
                                { label: 'Excess', val: reconSummary.excess_deducted_count, color: 'text-purple-400', bg: 'bg-purple-500/5 border-purple-500/20' },
                                { label: 'Missing 26Q', val: reconSummary.missing_in_26q_count, color: 'text-rose-400', bg: 'bg-rose-500/5 border-rose-500/20' },
                                { label: 'Missing Books', val: reconSummary.missing_in_books_count, color: 'text-blue-400', bg: 'bg-blue-500/5 border-blue-500/20' },
                            ].map((c, i) => (
                                <div key={i} className={`${c.bg} border rounded-xl p-3 text-center`}>
                                    <span className="text-[10px] text-slate-400 block mb-0.5 uppercase tracking-wider font-medium">{c.label}</span>
                                    <span className={`text-2xl font-black ${c.color}`}>{c.val}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Controls Bar */}
                    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-xl">
                        <div className="flex flex-col gap-4 mb-5">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                                <h2 className="text-lg font-bold text-white">Party-Wise TDS Report</h2>
                                <div className="flex items-center gap-2 w-full sm:w-auto">
                                    <div className="relative flex-1 sm:w-56">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                        <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search party, PAN..." className="w-full h-9 bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 text-sm text-white focus:border-purple-500 outline-none" />
                                    </div>
                                    <button onClick={() => exportTdsReport(reconResults, 'TDS_Report')} className="h-9 px-4 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-bold text-xs transition-colors flex items-center gap-2 whitespace-nowrap shadow-lg shadow-purple-900/20"><Download className="w-3.5 h-3.5" /> Excel</button>
                                    <button onClick={handleReset} className="h-9 px-3 bg-slate-800 hover:bg-slate-700 text-rose-400 rounded-lg font-bold text-xs flex items-center gap-1.5 border border-slate-700"><Trash2 className="w-3.5 h-3.5" /> Reset</button>
                                </div>
                            </div>
                            <StatusFilterChips active={statusFilter} onChange={setStatusFilter} counts={statusCounts} />
                        </div>

                        {/* Expandable Accordion Table */}
                        <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/30">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-slate-950 border-b border-slate-800 text-slate-400">
                                    <tr>
                                        <th className="px-3 py-2.5 font-medium w-8"></th>
                                        <th className="px-3 py-2.5 font-medium">Party Name</th>
                                        <th className="px-3 py-2.5 font-medium">PAN</th>
                                        <th className="px-3 py-2.5 font-medium text-center">Section</th>
                                        <th className="px-3 py-2.5 font-medium text-right">Closing Bal</th>
                                        <th className="px-3 py-2.5 font-medium text-right">TDS Variance</th>
                                        <th className="px-3 py-2.5 font-medium text-center">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/40">
                                    {filteredResults.length === 0 ? (
                                        <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">No parties match your filter.</td></tr>
                                    ) : filteredResults.map((r, i) => {
                                        const isExpanded = expandedRows.has(i);
                                        return (
                                            (() => {
                                                const sectionRule = rules.find(rule => rule.old_section === r.section);
                                                const applicableRate = getApplicableTdsRate(r.partyPan, r.party_entity_type || 'Unknown', sectionRule);
                                                const requiredTds = r.booksTaxable * applicableRate;
                                                const newTdsVariance = r.booksActualTds - requiredTds;
                                                return (
                                                    <React.Fragment key={i}>
                                                        <tr onClick={() => toggleRowExpand(i)} className="hover:bg-slate-800/30 cursor-pointer transition-colors group">
                                                            <td className="px-3 py-2.5 text-center"><ChevronRight className={`w-4 h-4 text-slate-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`} /></td>
                                                            <td className="px-3 py-2.5 text-white font-medium max-w-[220px] truncate" title={r.partyName}>{r.partyName}</td>
                                                            <td className="px-3 py-2.5 font-mono text-xs text-slate-400">{r.partyPan === 'PAN-MISSING' ? <span className="text-red-400 italic">Missing</span> : r.partyPan}</td>
                                                            <td className="px-3 py-2.5 text-center"><span className="text-xs font-bold text-purple-400">{r.section}</span></td>
                                                            <td className={`px-3 py-2.5 text-right font-mono text-xs ${(r.closingBalance || 0) < 0 ? 'text-rose-400' : (r.closingBalance || 0) > 0 ? 'text-teal-400' : 'text-slate-500'}`}>{fmtBal(r.closingBalance || 0)}</td>
                                                            <td className={`px-3 py-2.5 text-right font-mono text-xs font-bold ${newTdsVariance > 5 ? 'text-amber-400' : newTdsVariance < -5 ? 'text-purple-400' : 'text-slate-400'}`}>{newTdsVariance !== 0 ? fmtAmt(newTdsVariance) : '—'}</td>
                                                            <td className="px-3 py-2.5 text-center"><span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${getStatusStyle(r.status)}`}>{r.status}</span></td>
                                                        </tr>
                                                        {isExpanded && (
                                                            <tr>
                                                                <td colSpan={7} className="bg-slate-950/60 px-6 py-4 border-t border-slate-800/50">
                                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                                                                        {/* Books */}
                                                                        <div className="bg-slate-900/50 rounded-xl p-3.5 border border-slate-800">
                                                                            <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-2">📚 Books Data</div>
                                                                            <div className="space-y-1.5">
                                                                                <div className="flex justify-between"><span className="text-slate-400">Name in Books</span><span className="text-white font-medium truncate max-w-[160px]" title={r.nameInBooks}>{r.nameInBooks}</span></div>
                                                                                <div className="flex justify-between"><span className="text-slate-400">PAN in Books</span><span className="text-white font-mono">{r.panInBooks}</span></div>
                                                                                <div className="flex justify-between"><span className="text-slate-400">Expense Ledgers</span><span className="text-white truncate max-w-[160px]" title={r.ledgers}>{r.ledgers || '—'}</span></div>
                                                                                <div className="flex justify-between"><span className="text-slate-400">TDS Ledgers</span><span className="text-white truncate max-w-[160px]" title={r.tdsLedgers}>{r.tdsLedgers || '—'}</span></div>
                                                                                <div className="border-t border-slate-800 pt-1.5 mt-1.5"></div>
                                                                                <div className="flex justify-between"><span className="text-slate-400">Total Spend</span><span className="text-white font-bold">{fmtAmt(r.booksSpend)}</span></div>
                                                                                <div className="flex justify-between"><span className="text-slate-400">Taxable Amount</span><span className="text-white font-bold">{fmtAmt(r.booksTaxable)}</span></div>
                                                                                <div className="flex justify-between"><span className="text-slate-400">Rate Applied</span><span className="text-white">{applicableRate * 100}%</span></div>
                                                                                <div className="flex justify-between"><span className="text-slate-400">Required TDS</span><span className="text-rose-400 font-bold">{fmtAmt(requiredTds)}</span></div>
                                                                                <div className="flex justify-between"><span className="text-slate-400">Actual TDS</span><span className="text-purple-400 font-bold">{fmtAmt(r.booksActualTds)}</span></div>
                                                                            </div>
                                                                        </div>
                                                                        {/* 26Q */}
                                                                        <div className="bg-slate-900/50 rounded-xl p-3.5 border border-slate-800">
                                                                            <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider mb-2">📋 Form 26Q / TRACES</div>
                                                                            <div className="space-y-1.5">
                                                                                <div className="flex justify-between"><span className="text-slate-400">Name in 26Q</span><span className="text-white font-medium truncate max-w-[160px]" title={r.nameIn26Q}>{r.nameIn26Q}</span></div>
                                                                                <div className="flex justify-between"><span className="text-slate-400">PAN in 26Q</span><span className="text-white font-mono">{r.panIn26Q}</span></div>
                                                                                <div className="border-t border-slate-800 pt-1.5 mt-1.5"></div>
                                                                                <div className="flex justify-between"><span className="text-slate-400">Taxable (26Q)</span><span className="text-white font-bold">{fmtAmt(r.tracesTaxable)}</span></div>
                                                                                <div className="flex justify-between"><span className="text-slate-400">TDS (26Q)</span><span className="text-emerald-400 font-bold">{fmtAmt(r.tracesTds)}</span></div>
                                                                            </div>
                                                                        </div>
                                                                        {/* Variance & Reason */}
                                                                        <div className="bg-slate-900/50 rounded-xl p-3.5 border border-slate-800">
                                                                            <div className="text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-2">⚖️ Variance & Analysis</div>
                                                                            <div className="space-y-1.5">
                                                                                <div className="flex justify-between"><span className="text-slate-400">Taxable Variance</span><span className={`font-bold ${r.taxableVariance > 0 ? 'text-amber-400' : r.taxableVariance < 0 ? 'text-purple-400' : 'text-emerald-400'}`}>{fmtAmt(r.taxableVariance)}</span></div>
                                                                                <div className="flex justify-between"><span className="text-slate-400">TDS Variance</span><span className={`font-bold ${newTdsVariance > 5 ? 'text-amber-400' : newTdsVariance < -5 ? 'text-purple-400' : 'text-emerald-400'}`}>{fmtAmt(newTdsVariance)}</span></div>
                                                                                <div className="flex justify-between"><span className="text-slate-400">Closing Balance</span><span className={`font-bold font-mono ${(r.closingBalance || 0) < 0 ? 'text-rose-400' : 'text-teal-400'}`}>{fmtBal(r.closingBalance || 0)}</span></div>
                                                                                <div className="border-t border-slate-800 pt-1.5 mt-1.5"></div>
                                                                                <div><span className="text-slate-400 block mb-1">Reason</span><span className="text-slate-300 text-[11px] leading-relaxed block">{r.reason || '—'}</span></div>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </React.Fragment>
                                                )
                                            })()
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Fuzzy PAN Matches dialog */}
            {showPanMatchesDialog && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl animate-pop-in flex flex-col max-h-[90vh]">
                        <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-gradient-to-r from-purple-950/50 to-slate-900">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-purple-500/10 border border-purple-500/20 text-purple-400 rounded-lg"><ShieldAlert className="w-5 h-5" /></div>
                                <div><h3 className="text-lg font-bold text-white">PAN Mismatch Mappings</h3><p className="text-xs text-slate-400">Confirm matching names from 26Q to map their PANs.</p></div>
                            </div>
                            <button onClick={() => setShowPanMatchesDialog(false)} className="text-slate-400 hover:text-white p-1.5 hover:bg-slate-800 rounded-lg transition-colors"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-5 overflow-y-auto space-y-3 flex-1">
                            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300 flex items-start gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /><div>These parties have a missing PAN in Tally but exact same names were found in 26Q with valid PANs.</div></div>
                            <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/40 max-h-[280px] overflow-y-auto">
                                <table className="w-full text-left text-xs whitespace-nowrap"><thead className="bg-slate-950 border-b border-slate-800 text-slate-400 sticky top-0 z-10"><tr><th className="px-4 py-2.5 font-medium w-12 text-center">✓</th><th className="px-4 py-2.5 font-medium">Party Name</th><th className="px-4 py-2.5 font-medium text-center">PAN (from 26Q)</th><th className="px-4 py-2.5 font-medium text-center">Section</th></tr></thead>
                                    <tbody className="divide-y divide-slate-800/50">{pendingPanMatches.map((m, i) => (<tr key={i} className="hover:bg-slate-800/30"><td className="px-4 py-2.5 text-center"><input type="checkbox" checked={!!selectedPanMatches[m.partyName]} onChange={(e) => setSelectedPanMatches({ ...selectedPanMatches, [m.partyName]: e.target.checked })} className="w-4 h-4 rounded text-purple-600 bg-slate-900 border-slate-700 cursor-pointer" /></td><td className="px-4 py-2.5 text-white font-medium">{m.partyName}</td><td className="px-4 py-2.5 text-center font-mono text-purple-400 font-bold">{m.suggestedPan}</td><td className="px-4 py-2.5 text-center"><span className="px-2 py-0.5 bg-slate-800 border border-slate-700 rounded font-bold text-[10px] text-slate-400">{m.section}</span></td></tr>))}</tbody>
                                </table>
                            </div>
                        </div>
                        <div className="p-5 border-t border-slate-800 bg-slate-950/20 flex flex-col sm:flex-row justify-between items-center gap-3">
                            <button onClick={handleSkipPanMatches} className="w-full sm:w-auto px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold">Skip & Reconcile (Keep Separate)</button>
                            <button onClick={handleConfirmPanMatches} className="w-full sm:w-auto px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold shadow-lg shadow-purple-900/20 flex items-center justify-center gap-2"><Check className="w-4 h-4" /> Confirm & Reconcile</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Suggested Name Matches confirmation dialog */}
            {showNameMatchesDialog && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl animate-pop-in flex flex-col max-h-[90vh]">
                        <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-gradient-to-r from-purple-950/50 to-slate-900">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-purple-500/10 border border-purple-500/20 text-purple-400 rounded-lg"><GitCompare className="w-5 h-5" /></div>
                                <div>
                                    <h3 className="text-lg font-bold text-white">Verify Party Linkages (Name-Based)</h3>
                                    <p className="text-xs text-slate-400 font-medium mt-0.5">Confirm if the following parties matched by name are the same business entity.</p>
                                </div>
                            </div>
                            <button onClick={() => setShowNameMatchesDialog(false)} className="text-slate-400 hover:text-white p-1.5 hover:bg-slate-800 rounded-lg transition-colors"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-5 overflow-y-auto space-y-3 flex-1">
                            <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-xs text-indigo-300 flex items-start gap-2">
                                <Activity className="w-4 h-4 shrink-0 mt-0.5" />
                                <div>
                                    Unchecked linkages will be treated as separate, distinct entities in the final reconciliation results, preventing incorrect merging (e.g. Rudra Land Developers vs Mauli Land Developers).
                                </div>
                            </div>
                            <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/40 max-h-[350px] overflow-y-auto">
                                <table className="w-full text-left text-xs whitespace-nowrap">
                                    <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 sticky top-0 z-10">
                                        <tr>
                                            <th className="px-4 py-2.5 font-medium w-12 text-center">Link?</th>
                                            <th className="px-4 py-2.5 font-medium">Party in Books (Tally)</th>
                                            <th className="px-4 py-2.5 font-medium">Party in 26Q (TRACES)</th>
                                            <th className="px-4 py-2.5 font-medium text-center">Match Type</th>
                                            <th className="px-4 py-2.5 font-medium text-center">Confidence</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/50">
                                        {suggestedNameMatches.map((m, i) => {
                                            const key = `${m.booksName}_${m.tracesName}`;
                                            const isChecked = !!selectedNameMatches[key];
                                            return (
                                                <tr key={i} className="hover:bg-slate-800/30">
                                                    <td className="px-4 py-2.5 text-center">
                                                        <input
                                                            type="checkbox"
                                                            checked={isChecked}
                                                            onChange={(e) => setSelectedNameMatches({ ...selectedNameMatches, [key]: e.target.checked })}
                                                            className="w-4 h-4 rounded text-purple-600 bg-slate-900 border-slate-700 cursor-pointer"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-2.5 text-white font-medium max-w-[200px] truncate" title={m.booksName}>{m.booksName}</td>
                                                    <td className="px-4 py-2.5 text-slate-300 max-w-[200px] truncate" title={m.tracesName}>{m.tracesName}</td>
                                                    <td className="px-4 py-2.5 text-center">
                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${m.type === 'Exact Name' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
                                                            {m.type}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-2.5 text-center font-mono font-bold text-slate-400">
                                                        {Math.round(m.similarity * 100)}%
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div className="p-5 border-t border-slate-800 bg-slate-950/20 flex flex-col sm:flex-row justify-between items-center gap-3">
                            <button onClick={handleSkipNameMatches} className="w-full sm:w-auto px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold">
                                Keep All Separate & Reconcile
                            </button>
                            <button onClick={handleConfirmNameMatches} className="w-full sm:w-auto px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold shadow-lg shadow-purple-900/20 flex items-center justify-center gap-2">
                                <Check className="w-4 h-4" /> Confirm Linkages & Reconcile
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}