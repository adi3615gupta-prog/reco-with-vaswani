import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    ArrowLeft, UploadCloud, Database, Settings2, FileSpreadsheet, CheckCircle2, Trash2, GitCompare, Activity, AlertTriangle, Download, Search, Server, Loader2, RefreshCw, X, ShieldAlert, Edit2, Check, Plus, FileText, ChevronDown, ChevronRight, ChevronUp, Zap, Users, ArrowRight, Wallet, Eye, EyeOff, CalendarClock, History, HardDrive
} from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/confirm-dialog';
import * as XLSX from 'xlsx-js-style';
import ExcelJS from 'exceljs';
import { FileUploadZone } from '@/components/FileUploadZone';
import { parseFile } from '@/lib/fileParser';
import { exportTdsReport, computeAdvanceTdsAudit, computeMultiLedgerPans, exportMultiLedgerPanWorkbook, type AdvanceTdsResult, type MultiLedgerPanInfo } from '@/lib/tdsEngine';
import { pingTally, fetchCompanyInfo, fetchTdsTransactions, fetchExpenseLedgerMaster, fetchTaxLedgerMaster, fetchPartyBalances, clearTallyMetadataCache, type TallyCompanyInfo, type TdsMasterLedger } from '@/lib/tallyApi';
import { safeApiFetch } from '@/lib/api';
import { saveLocalRecoSnapshot } from '@/lib/gdrive';
import { RecoHistoryModal } from '@/components/RecoHistoryModal';
import { TdsGroupTree, type GroupTreeData, type GroupTreeNode } from '@/components/TdsGroupTree';

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
    { old_section: '194I(a)', new_section_2025: '393(1)_Sl_2ii_Da', nature_of_payment: 'Rent for Plant & Machinery', single_bill_threshold: 50000, annual_aggregate_threshold: 600000, rate_individual_huf: 2.0, rate_company_others: 2.0, rate_missing_pan_206AA: 20.0 },
    { old_section: '194I(b)', new_section_2025: '393(1)_Sl_2ii_Db', nature_of_payment: 'Rent for Land, Building & Furniture', single_bill_threshold: 50000, annual_aggregate_threshold: 600000, rate_individual_huf: 10.0, rate_company_others: 10.0, rate_missing_pan_206AA: 20.0 },
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
        <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden transition-all">
            <button onClick={() => setIsOpen(!isOpen)} className="w-full flex items-center justify-between p-5 hover:bg-slate-50 transition-colors group">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-50 border border-indigo-200/80 rounded-xl flex items-center justify-center text-indigo-600 shadow-2xs"><Icon className="w-5 h-5" /></div>
                    <div className="text-left">
                        <h2 className="text-base font-bold text-slate-900">{title}</h2>
                        {subtitle && <p className="text-xs text-slate-500 mt-0.5 font-medium">{subtitle}</p>}
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {badge}
                    {isOpen ? <ChevronUp className="w-5 h-5 text-slate-600 group-hover:text-slate-700 transition-colors" /> : <ChevronDown className="w-5 h-5 text-slate-600 group-hover:text-slate-700 transition-colors" />}
                </div>
            </button>
            {isOpen && <div className="p-5 pt-0 border-t border-slate-100">{children}</div>}
        </div>
    );
}

// ─── Stepper Component ───────────────────────────────────────
function StepperNav({ steps, activeStep, onStepClick }: { steps: { label: string; icon: React.ElementType; ready: boolean; info?: string; disabled?: boolean }[]; activeStep: number; onStepClick: (i: number) => void }) {
    return (
        <div className="flex items-stretch gap-1 bg-white p-1 rounded-xl border border-slate-200/80 shadow-xs">
            {steps.map((step, i) => {
                const Icon = step.icon;
                const isActive = activeStep === i;
                const isDisabled = step.disabled;
                return (
                    <button
                        key={i}
                        onClick={() => !isDisabled && onStepClick(i)}
                        disabled={isDisabled}
                        className={`flex-1 min-w-0 relative py-1.5 px-2 rounded-lg font-bold text-xs transition-all flex flex-col items-center gap-0.5 group ${isActive
                                ? 'bg-indigo-600 text-white shadow-xs'
                                : isDisabled
                                    ? 'text-slate-600 cursor-not-allowed opacity-40'
                                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                            }`}
                    >
                        <div className="flex items-center gap-2">
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black transition-all ${step.ready && !isActive ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                    isActive ? 'bg-white/20 text-white' :
                                        'bg-slate-100 text-slate-600 border border-slate-200'
                                }`}>
                                {step.ready && !isActive ? <CheckCircle2 className="w-3.5 h-3.5" /> : <span>{i + 1}</span>}
                            </div>
                            <Icon className="w-4 h-4 hidden sm:block" />
                        </div>
                        <span className="truncate max-w-full text-[11px] tracking-wide uppercase">{step.label}</span>
                        {step.info && <span className={`text-[10px] font-semibold truncate max-w-full ${isActive ? 'text-white/90' : 'text-slate-600'}`}>{step.info}</span>}
                        {i < steps.length - 1 && (
                            <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-10 hidden lg:block">
                                <ChevronRight className={`w-3.5 h-3.5 ${isActive ? 'text-indigo-200' : 'text-slate-700'}`} />
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
                case 'Matched': return 'bg-emerald-600 text-white shadow-xs';
                case 'Short Deducted': return 'bg-amber-600 text-white shadow-xs';
                case 'Excess Deducted': return 'bg-indigo-600 text-white shadow-xs';
                case 'Missing in 26Q': return 'bg-rose-600 text-white shadow-xs';
                case 'Missing in Books': return 'bg-blue-600 text-white shadow-xs';
                case 'Under Threshold': return 'bg-slate-700 text-white shadow-xs';
                default: return 'bg-indigo-600 text-white shadow-xs';
            }
        }
        return 'bg-white text-slate-700 hover:text-slate-900 hover:bg-slate-50 border border-slate-200 shadow-2xs font-semibold';
    };
    return (
        <div className="flex flex-wrap gap-1.5">
            {STATUS_FILTERS.map(s => (
                <button
                    key={s}
                    onClick={() => onChange(s)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wide whitespace-nowrap transition-all ${getChipStyle(s, active === s)}`}
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
    const confirm = useConfirm();
    const [activeStep, setActiveStep] = useState(0);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);

    // Database Seed Rules
    const [rules, setRules] = useState<TdsSection[]>(FALLBACK_TDS_SECTIONS);

    const handleRestoreTdsSession = (payload: any) => {
        if (payload.results) {
            setReconResults(payload.results);
            setActiveStep(3);
        }
        if (payload.summary) {
            setReconSummary(payload.summary);
        }
        if (payload.financialYear) {
            setSelectedFY(payload.financialYear);
        }
        toast.success(`Restored TDS Session: ${payload.companyName || 'Snapshot'} (${payload.financialYear || selectedFY})`);
    };

    const handleSaveTdsRun = async () => {
        if (!reconResults) {
            toast.error("No active reconciliation results to save");
            return;
        }
        try {
            toast.loading("Saving TDS run to SQLite database...");
            await saveLocalRecoSnapshot({
                version: '1.0',
                timestamp: new Date().toISOString(),
                companyName: companyInfo?.name || 'Company',
                financialYear: selectedFY,
                mode: 'input',
                moduleType: 'tds-reco',
                moduleName: 'TDS Audit & Reconciliation',
                results: reconResults,
                summary: reconSummary,
            });
            toast.dismiss();
            toast.success(`Saved TDS reconciliation for '${companyInfo?.name || 'Company'}' (${selectedFY}) to SQLite!`);
        } catch (err: any) {
            toast.dismiss();
            toast.error("Save failed", { description: err.message });
        }
    };

    // Group Mapping State (Database-backed templates)
    const [groupTree, setGroupTree] = useState<GroupTreeData | null>(null);
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
    // Strict: only ledgers mapped in Step 1 (directly or via their group) are reconciled
    const [strictModeOnlyMapped, setStrictModeOnlyMapped] = useState<boolean>(true);

    const today = new Date();

    // Financial Year Selection
    const currentFY = today.getMonth() >= 3 ? `${today.getFullYear()}-${String(today.getFullYear() + 1).slice(-2)}` : `${today.getFullYear() - 1}-${String(today.getFullYear()).slice(-2)}`;
    const FY_OPTIONS = [
        `${today.getFullYear() - 3}-${String(today.getFullYear() - 2).slice(-2)}`,
        `${today.getFullYear() - 2}-${String(today.getFullYear() - 1).slice(-2)}`,
        `${today.getFullYear() - 1}-${String(today.getFullYear()).slice(-2)}`,
        `${today.getFullYear()}-${String(today.getFullYear() + 1).slice(-2)}`,
    ];
    const [selectedFY, setSelectedFY] = useState<string>(currentFY);

    // Multi-Channel Ingestion State
    const [tdsIngestChannel, setTdsIngestChannel] = useState<'ITR_JSON' | 'MANUAL'>('ITR_JSON');
    const [itrJsonFile, setItrJsonFile] = useState<File | null>(null);
    const [itrParsedTdsRecords, setItrParsedTdsRecords] = useState<any[] | null>(null);

    // Imported Ledger Filter State (for filtering ledger mappings by uploaded template)
    const [importedLedgerNames, setImportedLedgerNames] = useState<Set<string>>(new Set());
    const [ledgerFilterMode, setLedgerFilterMode] = useState<'mapped' | 'unmapped' | 'all' | 'imported'>('mapped');

    // Compute fromDate and toDate from selected Financial Year
    const fyStartYear = parseInt(selectedFY.split('-')[0]);
    const fyFromDate = `${fyStartYear}-04-01`;
    const fyToDate = `${fyStartYear + 1}-03-31`;

    // Tally Live API State
    const [tallyPort, setTallyPort] = useState(9000);
  // Phase 40: Scoped Tally Session Unmount Teardown
  useEffect(() => {
    return () => {
      setConnectionStatus('disconnected');
      setCompanyInfo(null);
      clearTallyMetadataCache();
    };
  }, []);

    const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
    const [companyInfo, setCompanyInfo] = useState<TallyCompanyInfo | null>(null);
    const [fromDate, setFromDate] = useState(fyFromDate);
    const [toDate, setToDate] = useState(fyToDate);
    const [isFetchingTally, setIsFetchingTally] = useState(false);
    const [tallyDirectData, setTallyDirectData] = useState<any[] | null>(null);
    const [showTemplateMenu, setShowTemplateMenu] = useState(false);
    const [showGroupTemplateMenu, setShowGroupTemplateMenu] = useState(false);

    const unmappedFetchedLedgers = useMemo(() => {
        if (!tallyDirectData || tallyDirectData.length === 0) return [];
        const distinctLedgers = Array.from(new Set(tallyDirectData.map((t: any) => t.ledgerName))).filter((l: any) => l && typeof l === 'string' && !l.toUpperCase().includes('CGST') && !l.toUpperCase().includes('SGST') && !l.toUpperCase().includes('IGST') && !l.toUpperCase().includes('ROUND OFF') && !l.toUpperCase().includes('ROUNDING'));
        const mappedSet = new Set(ledgerMappings.filter(m => m.sectionCode || m.isTdsLedger).map(m => m.ledgerName.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '')));
        return distinctLedgers.filter((l: string) => {
            const norm = l.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
            return !mappedSet.has(norm);
        });
    }, [tallyDirectData, ledgerMappings]);

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
    const [multiLedgerPans, setMultiLedgerPans] = useState<MultiLedgerPanInfo[]>([]);
    const [advanceTdsResults, setAdvanceTdsResults] = useState<AdvanceTdsResult[]>([]);
    const [activeResultsSubTab, setActiveResultsSubTab] = useState<'RECONCILIATION' | 'SPLIT_PANS' | 'ADVANCE_AUDIT'>('RECONCILIATION');
    const [mappingTreeTab, setMappingTreeTab] = useState<'EXPENSE' | 'DUTIES'>('EXPENSE');
    const [showEnterpriseMapping, setShowEnterpriseMapping] = useState(false);
    const [showAdvancedVouchers, setShowAdvancedVouchers] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
    const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

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
            const res = await safeApiFetch('/api/tds/rules');
            if (res.ok) { const data = await res.json(); if (data && data.length > 0) setRules(data); }
        } catch (err) { console.error("Rules fetch failed, falling back to local defaults.", err); }
    };

    const loadMappings = async () => {
        try {
            const res = await safeApiFetch('/api/tds/ledgers');
            if (res.ok) { const data = await res.json(); setLedgerMappings(data); }
        } catch (err) { console.error("Failed to fetch ledger mappings", err); }
    };

    const loadSuggestions = async () => {
        try {
            const res = await safeApiFetch('/api/tds/auto-map');
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
            const res = await safeApiFetch('/api/tds/group-mappings');
            if (res.ok) { const data = await res.json(); setGroupMappings(data); }
        } catch (err) { console.error("Failed to fetch group mappings", err); }
    };

    const [taxTree, setTaxTree] = useState<GroupTreeData | null>(null);

    const loadTaxTree = async () => {
        try {
            const res = await safeApiFetch('/api/tds/group-tree?side=TAX');
            if (res.ok) setTaxTree(await res.json());
        } catch (err) { console.error('Failed to fetch Duties & Taxes tree', err); }
    };

    // Ticking TDS on a Duties & Taxes ledger marks it as a TDS ledger (its section is kept as is)
    const handleSetLedgerTds = async (ledgerName: string, isTds: boolean, sectionCode: string | null) => {
        try {
            const res = await safeApiFetch('/api/tds/ledgers/update', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ledgerName, sectionCode, isTdsLedger: isTds })
            });
            if (!res.ok) return toast.error('Failed to update TDS flag');
            loadTaxTree(); loadMappings();
        } catch (err) { toast.error('Connection error updating TDS flag'); }
    };

    const loadGroupTree = async () => {
        try {
            const res = await safeApiFetch('/api/tds/group-tree');
            if (res.ok) setGroupTree(await res.json());
        } catch (err) { console.error("Failed to fetch group tree", err); }
    };

    // Group tree actions: a group section applies to every ledger and sub-group beneath it
    const handleSetGroupSection = async (path: string[], sectionCode: string | null) => {
        try {
            const res = await safeApiFetch('/api/tds/group-tree/section', {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path, sectionCode })
            });
            if (!res.ok) return toast.error('Failed to update group section');
            toast.success(sectionCode ? `${path[path.length - 1]} → ${sectionCode}` : `${path[path.length - 1]} section cleared`);
            loadGroupTree(); loadTaxTree(); loadGroupMappings(); loadMappings();
        } catch (err) { toast.error('Connection error updating group'); }
    };

    const handleSetLedgerSectionFromTree = async (ledgerName: string, sectionCode: string) => {
        try {
            const res = await safeApiFetch('/api/tds/ledgers/update', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ledgerName, sectionCode, isTdsLedger: false })
            });
            if (!res.ok) return toast.error('Failed to update ledger');
            loadGroupTree(); loadTaxTree(); loadMappings(); loadSuggestions();
        } catch (err) { toast.error('Connection error updating ledger'); }
    };

    // Back to inheriting from the group (clears the ledger's own section without blocking inheritance)
    const handleClearLedgerOverride = async (ledgerName: string) => {
        try {
            const res = await safeApiFetch('/api/tds/ledgers/update', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ledgerName, clearOverride: true })
            });
            if (!res.ok) return toast.error('Failed to clear ledger override');
            loadGroupTree(); loadTaxTree(); loadMappings(); loadSuggestions();
        } catch (err) { toast.error('Connection error clearing override'); }
    };

    const loadParties = async () => {
        try {
            const res = await safeApiFetch('/api/tds/parties');
            if (res.ok) { const data = await res.json(); setParties(data); }
        } catch (err) { console.error("Failed to fetch party master", err); }
    };

    useEffect(() => { loadRules(); loadMappings(); loadSuggestions(); loadParties(); loadGroupMappings(); loadGroupTree(); loadTaxTree(); }, []);

    // ─── Group Mapping CRUD ──────────────────────────────────
    const handleAddGroupMapping = async () => {
        if (!newExpenseGroup.trim()) return toast.error('Enter a valid Expense Group name');
        try {
            const res = await safeApiFetch('/api/tds/group-mappings', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ expenseGroup: newExpenseGroup.trim(), subGroup: newSubGroup.trim() || undefined, subGroup2: newSubGroup2.trim() || undefined, sectionCode: newGroupSectionCode })
            });
            if (res.ok) { toast.success('Group mapping template added!'); setNewExpenseGroup(''); setNewSubGroup(''); setNewSubGroup2(''); loadGroupMappings(); }
            else toast.error('Failed to add group mapping template');
        } catch (err) { toast.error('Connection error adding template'); }
    };

    const handleRemoveGroupMapping = async (id: string) => {
        try {
            const res = await safeApiFetch(`/api/tds/group-mappings/${id}`, { method: 'DELETE' });
            if (res.ok) { toast.success('Template mapping removed'); loadGroupMappings(); }
            else toast.error('Failed to remove mapping');
        } catch (err) { toast.error('Connection error removing mapping'); }
    };

    // ─── Ledger Mapping CRUD ─────────────────────────────────
    const handleAddMapping = async () => {
        if (!newLedgerName.trim()) return toast.error('Enter a valid Tally ledger name');
        try {
            const res = await safeApiFetch('/api/tds/ledgers/update', {
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
            const res = await safeApiFetch('/api/tds/ledgers/update', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ledgerName, sectionCode: isTdsLedger ? null : sectionCode, isTdsLedger })
            });
            if (res.ok) { toast.success('Ledger configuration updated!'); loadMappings(); loadSuggestions(); }
            else toast.error('Failed to update ledger');
        } catch (err) { toast.error('Connection error updating ledger'); }
    };

    const handleRemoveMapping = async (ledgerName: string) => {
        try {
            const res = await safeApiFetch(`/api/tds/ledgers/${encodeURIComponent(ledgerName)}`, { method: 'DELETE' });
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
                const res = await safeApiFetch('/api/tds/parties/confirm-name-matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ matches: confirmedMatches }) });
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
            const res = await safeApiFetch('/api/tds/confirm-mapping', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mappings: mappingsToConfirm }) });
            if (res.ok) { toast.success(`Successfully confirmed ${mappingsToConfirm.length} ledger mappings!`); loadMappings(); loadSuggestions(); }
            else toast.error("Failed to confirm auto-mappings");
        } catch (err) { toast.error("Error connecting to server for auto-mapping confirmation"); }
    };

    // ─── Party Master CRUD ───────────────────────────────────
    const startEditingParty = (p: any) => { setEditingPartyId(p.id); setEditPan(p.pan_number || ''); setEditEntityType(p.entity_type || 'Unknown'); };

    const handleSavePartyEdit = async (id: string) => {
        try {
            const res = await safeApiFetch(`/api/tds/parties/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entityType: editEntityType, panNumber: editPan.trim().toUpperCase() }) });
            if (res.ok) { toast.success("Party details updated!"); setEditingPartyId(null); loadParties(); }
            else toast.error("Failed to update party details");
        } catch (err) { toast.error("Error communicating with party database"); }
    };

    const syncPartiesFromTallyData = async (tallyTxns: any[]) => {
        const distinctParties = Array.from(new Map(tallyTxns.filter(t => t.partyName).map(t => [t.partyName.toUpperCase().trim(), { partyName: t.partyName, pan: t.partyPan }])).values());
        try {
            const res = await safeApiFetch('/api/tds/process-pan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parties: distinctParties }) });
            if (res.ok) loadParties();
        } catch (err) { console.error("Failed to sync party metadata to DB", err); }
    };

    // Discovers Tally group templates (e.g. Indirect Expenses > Legal & Professional Charges > Advocate Fees => 194J(b))
    // from the ledger hierarchies of fetched vouchers and persists them into Tally_Group_Mappings.
    const autoDiscoverGroupTemplates = async (tallyTxns: any[]) => {
        const hierarchies = Array.from(new Map(
            tallyTxns
                .filter(t => Array.isArray(t.parentGroupHierarchy) && t.parentGroupHierarchy.length > 0)
                .map(t => [(t.parentGroupHierarchy as string[]).join('>').toUpperCase(), t.parentGroupHierarchy as string[]])
        ).values());
        if (hierarchies.length === 0) return;
        try {
            const res = await safeApiFetch('/api/tds/auto-discover-groups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hierarchies }) });
            if (res.ok) {
                const data = await res.json();
                if (data.inserted > 0) toast.success(`${data.inserted} group template${data.inserted === 1 ? '' : 's'} auto-discovered from Tally`);
                await loadGroupMappings();
                loadGroupTree(); loadTaxTree();
            }
        } catch (err) { console.error("Failed to auto-discover group templates", err); }
    };

    const syncLedgersFromTallyData = async (tallyTxns: any[], replaceAuto = false) => {
        const distinctLedgers = Array.from(new Map(tallyTxns.filter(t => t.ledgerName).map(t => [t.ledgerName.toUpperCase().trim(), { ledgerName: t.ledgerName, parentGroup: t.parentGroup || 'Expense', parentGroupPath: t.parentGroupPath || '' }])).values());
        if (distinctLedgers.length === 0) return;
        try {
            const res = await safeApiFetch('/api/tds/extract-ledgers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ledgers: distinctLedgers, replaceAuto }) });
            if (res.ok) {
                // Templates must exist before reloading ledgers, so inherited sections are computed from them
                await autoDiscoverGroupTemplates(tallyTxns);
                loadMappings(); loadSuggestions();
            }
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
        setTimeout(() => window.URL.revokeObjectURL(url), 60000);
    };

    const handleRemoveUnmappedLedgers = async () => {
        const unmapped = ledgerMappings.filter(m => !m.sectionCode && !m.inheritedSectionCode && !m.isTdsLedger);
        if (unmapped.length === 0) {
            toast.info("No unmapped ledgers found in list.");
            return;
        }
        const ok = await confirm({
            title: 'Remove Unmapped Ledgers',
            description: `Are you sure you want to remove ${unmapped.length} unmapped ledgers from the list?`,
            confirmText: 'Remove Ledgers',
            variant: 'destructive',
        });
        if (!ok) return;
        
        // Optimistically remove unmapped ledgers & switch filter to mapped
        const removedCount = unmapped.length;
        setLedgerMappings(prev => prev.filter(m => !!m.sectionCode || !!m.inheritedSectionCode || m.isTdsLedger));
        setLedgerFilterMode('mapped');
        toast.success(`Removed ${removedCount} unmapped ledgers.`);

        try {
            let res = await safeApiFetch('/api/tds/remove-unmapped', { method: 'POST' });
            if (!res.ok) {
                await safeApiFetch('/api/tds/ledgers-unmapped', { method: 'DELETE' });
            }
        } catch (err) {
            console.error("Backend delete call:", err);
        }
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
                    const res = await safeApiFetch('/api/tds/confirm-mapping', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mappings: newMappings }) });
                    if (res.ok) { 
                        toast.success(`Imported ${newMappings.length} mappings!`);
                        const importedSet = new Set(newMappings.map(m => m.ledgerName.toLowerCase().trim()));
                        setImportedLedgerNames(importedSet);
                        setLedgerFilterMode('imported');
                        loadMappings(); 
                        loadSuggestions(); 
                    }
                    else toast.error("Database import mapping save failed");
                } else toast.error('No valid ledger mappings found in Excel file');
            } catch (error) { toast.error('Invalid Excel file'); }
        };
        reader.readAsArrayBuffer(file); event.target.value = '';
    };

    // ─── Mapping template: every group and every ledger, with the section to set ───
    // Blank section = keep as it is. INHERIT = remove the group's own section / return the ledger to inheritance.
    const exportGroupMappings = async (side: 'EXPENSE' | 'TAX' = 'EXPENSE') => {
        let tree: GroupTreeData | null = null;
        try {
            const res = await safeApiFetch(`/api/tds/group-tree?side=${side}`);
            if (res.ok) tree = await res.json();
        } catch (err) { tree = null; }
        if (!tree) return toast.error('Could not read the group tree from the server');

        type TemplateRow = { type: 'Group' | 'Ledger'; path: string[]; ledgerName: string; section: string; inherited: string };
        const out: TemplateRow[] = [];
        const walk = (node: GroupTreeNode) => {
            if (!node.virtual) out.push({
                type: 'Group',
                path: node.path,
                ledgerName: '',
                section: node.explicitSectionCode || '',
                inherited: node.explicitSectionCode ? '' : (node.effectiveSectionCode || '')
            });
            node.ledgers.forEach(l => out.push({
                type: 'Ledger',
                path: node.path,
                ledgerName: l.ledgerName,
                section: l.sectionCode || '',
                inherited: l.sectionCode ? '' : (l.inheritedSectionCode || '')
            }));
            node.children.forEach(walk);
        };
        tree.roots.forEach(walk);
        if (out.length === 0) return toast.error('There are no ledgers to export yet. Fetch vouchers from Tally first.');

        const depth = Math.max(3, ...out.map(r => r.path.length));
        const workbook = new ExcelJS.Workbook();
        const ws = workbook.addWorksheet('TDS Mapping Template');
        const wsRef = workbook.addWorksheet('Valid Sections List');
        const wsHelp = workbook.addWorksheet('How To Fill');

        const headerStyle = (row: ExcelJS.Row, argb: string) => {
            row.eachCell(cell => {
                cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
            });
        };

        wsRef.columns = [
            { header: 'Section Code', key: 'old_section', width: 16 },
            { header: 'New Section (IT Act 2025)', key: 'new_section_2025', width: 25 },
            { header: 'Nature of Payment', key: 'nature_of_payment', width: 45 }
        ];
        rules.forEach(s => wsRef.addRow({ old_section: s.old_section, new_section_2025: s.new_section_2025, nature_of_payment: s.nature_of_payment }));
        wsRef.addRow({ old_section: 'EXCLUDE', new_section_2025: '', nature_of_payment: 'Excluded from TDS (not subject to TDS)' });
        headerStyle(wsRef.getRow(1), 'FF0F172A');

        wsHelp.columns = [{ header: 'How to fill the template', key: 'text', width: 110 }];
        [
            'Each Group row sets the TDS section for that group. Its ledgers and sub-groups inherit it.',
            'Each Ledger row sets the TDS section for that one ledger. It overrides its group.',
            'Pick a section from the dropdown in the "TDS Section Code" column.',
            'Leave the cell blank to keep the current setting unchanged.',
            'Type INHERIT to remove a group\'s own section, or to return a ledger to its group.',
            'Do not edit the Type, Level or Ledger Name columns. They identify the row.',
            'The "Currently Inherited" column is for information only and is ignored on import.'
        ].forEach(t => wsHelp.addRow({ text: t }));
        headerStyle(wsHelp.getRow(1), 'FF475569');

        const levelColumns = Array.from({ length: depth }, (_, i) => ({ header: `Level ${i + 1}`, key: `level${i + 1}`, width: 30 }));
        const sectionCol = depth + 3;
        ws.columns = [
            { header: 'Type', key: 'type', width: 10 },
            ...levelColumns,
            { header: 'Ledger Name', key: 'ledgerName', width: 42 },
            { header: 'TDS Section Code', key: 'section', width: 22 },
            { header: 'Currently Inherited', key: 'inherited', width: 22 }
        ];
        out.forEach(r => {
            const row: Record<string, string> = { type: r.type, ledgerName: r.ledgerName, section: r.section, inherited: r.inherited };
            r.path.forEach((name, i) => { row[`level${i + 1}`] = name; });
            ws.addRow(row);
        });
        headerStyle(ws.getRow(1), 'FF1E3A8A');

        const sectionRange = `'Valid Sections List'!$A$2:$A$${rules.length + 2}`;
        const totalRows = out.length + 200;
        for (let r = 2; r <= totalRows; r++) {
            ws.getCell(r, sectionCol).dataValidation = {
                type: 'list', allowBlank: true, formulae: [sectionRange], showErrorMessage: true,
                errorTitle: 'Invalid TDS Section Code', error: 'Pick a section from the list, or type INHERIT.'
            };
        }

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = side === 'TAX' ? 'TDS_Payable_Ledger_Template.xlsx' : 'TDS_Mapping_Template.xlsx';
        a.click();
        setTimeout(() => window.URL.revokeObjectURL(url), 60000);
        const groupCount = out.filter(r => r.type === 'Group').length;
        toast.success(`Exported ${groupCount} groups and ${out.length - groupCount} ledgers`);
    };

    // Reads the template: Group rows (no Ledger Name) and Ledger rows (Ledger Name filled).
    const importGroupMappings = (event: React.ChangeEvent<HTMLInputElement>, side: 'EXPENSE' | 'TAX' = 'EXPENSE') => {
        const file = event.target.files?.[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' });
                if (json.length === 0) return toast.error('The file has no rows');

                const headers = Object.keys(json[0]);
                const levelKeys = headers
                    .map(h => ({ h, m: /^level\s*(\d+)$/i.exec(h.trim()) }))
                    .filter(x => x.m)
                    .sort((a, b) => Number(a.m![1]) - Number(b.m![1]))
                    .map(x => x.h);
                const legacyKeys = ['Expense Group', 'Sub-Group', 'Sub-Group 2'].filter(h => headers.includes(h));
                const groupKeys = levelKeys.length ? levelKeys : legacyKeys;
                const sectionKey = headers.find(h => ['TDS Section Code', 'Section', 'Section Code'].includes(h.trim()));
                const ledgerKey = headers.find(h => h.trim() === 'Ledger Name');
                if (groupKeys.length === 0 || !sectionKey) {
                    return toast.error('Use the template columns: Level 1..N, Ledger Name and TDS Section Code');
                }

                // Accept the section code or the IT Act 2025 section name; store the code
                const toOld = new Map<string, string>();
                rules.forEach(s => { toOld.set(s.old_section, s.old_section); toOld.set(s.new_section_2025, s.old_section); });
                toOld.set('EXCLUDE', 'EXCLUDE');

                const groups: { path: string[]; sectionCode: string | null }[] = [];
                const ledgers: { ledgerName: string; sectionCode: string | null }[] = [];
                let invalid = 0;
                for (const row of json) {
                    const raw = String(row[sectionKey] ?? '').trim();
                    if (!raw) continue; // blank = keep as it is
                    let sectionCode: string | null = null;
                    if (raw.toUpperCase() !== 'INHERIT') {
                        sectionCode = toOld.get(raw) ?? null;
                        if (!sectionCode) { invalid++; continue; }
                    }
                    const ledgerName = ledgerKey ? String(row[ledgerKey] ?? '').trim() : '';
                    if (ledgerName) {
                        ledgers.push({ ledgerName, sectionCode });
                        continue;
                    }
                    const path = groupKeys.map(k => String(row[k] ?? '').trim()).filter(Boolean);
                    if (path.length > 0) groups.push({ path, sectionCode });
                }
                if (groups.length === 0 && ledgers.length === 0) {
                    return toast.error('Nothing to import: fill the TDS Section Code column');
                }

                const res = await safeApiFetch('/api/tds/group-tree/import', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ items: groups, ledgers })
                });
                if (!res.ok) return toast.error('Import failed');
                const r = await res.json();
                toast.success(
                    `Imported: ${r.created} groups added, ${r.updated} updated, ${r.removed} cleared, ` +
                    `${r.ledgersSet} ledgers set, ${r.ledgersCleared} back to inherit` +
                    (invalid ? `, ${invalid} unknown sections skipped` : '')
                );
                loadGroupTree(); loadTaxTree(); loadGroupMappings(); loadMappings(); loadSuggestions();
            } catch (error) { toast.error('Invalid Excel file'); }
        };
        reader.readAsArrayBuffer(file); event.target.value = '';
    };

    // ─── TDS Payable ledger template (Duties & Taxes): one row per ledger, mark YES / NO ───
    const exportTaxTemplate = async () => {
        let tree: GroupTreeData | null = null;
        try {
            const res = await safeApiFetch('/api/tds/group-tree?side=TAX');
            if (res.ok) tree = await res.json();
        } catch (err) { tree = null; }
        if (!tree) return toast.error('Could not read the Duties & Taxes ledgers from the server');

        const rowsOut: { path: string[]; ledgerName: string; tds: string }[] = [];
        const walk = (node: GroupTreeNode) => {
            node.ledgers.forEach(l => rowsOut.push({ path: node.path, ledgerName: l.ledgerName, tds: l.isTdsLedger ? 'YES' : 'NO' }));
            node.children.forEach(walk);
        };
        tree.roots.forEach(walk);
        if (rowsOut.length === 0) return toast.error('No Duties & Taxes ledgers yet. Fetch vouchers from Tally first.');

        const depth = Math.max(3, ...rowsOut.map(r => r.path.length));
        const workbook = new ExcelJS.Workbook();
        const ws = workbook.addWorksheet('TDS Payable Ledgers');
        const wsHelp = workbook.addWorksheet('How To Fill');

        wsHelp.columns = [{ header: 'How to fill the template', key: 'text', width: 100 }];
        [
            'Mark YES in the "TDS Ledger" column for every ledger that is a TDS payable ledger.',
            'Mark NO to take a ledger off the TDS list. Leave the cell blank to keep it unchanged.',
            'Do not edit the Level or Ledger Name columns. They identify the ledger.'
        ].forEach(t => wsHelp.addRow({ text: t }));
        wsHelp.getRow(1).eachCell(cell => {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF475569' } };
        });

        const levelColumns = Array.from({ length: depth }, (_, i) => ({ header: `Level ${i + 1}`, key: `level${i + 1}`, width: 30 }));
        ws.columns = [
            ...levelColumns,
            { header: 'Ledger Name', key: 'ledgerName', width: 42 },
            { header: 'TDS Ledger (YES/NO)', key: 'tds', width: 22 }
        ];
        rowsOut.forEach(r => {
            const row: Record<string, string> = { ledgerName: r.ledgerName, tds: r.tds };
            r.path.forEach((name, i) => { row[`level${i + 1}`] = name; });
            ws.addRow(row);
        });
        ws.getRow(1).eachCell(cell => {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
        });

        const tdsCol = depth + 2;
        for (let r = 2; r <= rowsOut.length + 200; r++) {
            ws.getCell(r, tdsCol).dataValidation = {
                type: 'list', allowBlank: true, formulae: ['"YES,NO"'], showErrorMessage: true,
                errorTitle: 'Invalid value', error: 'Choose YES or NO.'
            };
        }

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'TDS_Payable_Ledger_Template.xlsx';
        a.click();
        setTimeout(() => window.URL.revokeObjectURL(url), 60000);
        toast.success(`Exported ${rowsOut.length} Duties & Taxes ledgers`);
    };

    // Reads YES / NO from the TDS column; blank rows are left unchanged
    const importTaxTemplate = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' });
                if (json.length === 0) return toast.error('The file has no rows');

                const headers = Object.keys(json[0]);
                const ledgerKey = headers.find(h => h.trim() === 'Ledger Name');
                const tdsKey = headers.find(h => /^tds/i.test(h.trim()));
                if (!ledgerKey || !tdsKey) return toast.error('Use the template columns: Ledger Name and TDS Ledger (YES/NO)');

                const ledgers: { ledgerName: string; tds: boolean }[] = [];
                let invalid = 0;
                for (const row of json) {
                    const ledgerName = String(row[ledgerKey] ?? '').trim();
                    if (!ledgerName) continue;
                    const raw = String(row[tdsKey] ?? '').trim().toUpperCase();
                    if (!raw) continue; // blank = keep as it is
                    if (raw === 'YES') ledgers.push({ ledgerName, tds: true });
                    else if (raw === 'NO') ledgers.push({ ledgerName, tds: false });
                    else invalid++;
                }
                if (ledgers.length === 0) return toast.error('Nothing to import: fill the TDS column with YES or NO');

                const res = await safeApiFetch('/api/tds/group-tree/import', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ items: [], ledgers })
                });
                if (!res.ok) return toast.error('Import failed');
                const r = await res.json();
                toast.success(`Imported: ${r.ledgersSet} ledgers updated` + (invalid ? `, ${invalid} rows without YES/NO skipped` : ''));
                loadTaxTree(); loadMappings();
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
            const distinctNames = overridePartyNames && overridePartyNames.length > 0
                ? overridePartyNames
                : (tallyDirectData && tallyDirectData.length > 0
                    ? Array.from(new Set(tallyDirectData.map(t => t.partyName)))
                    : undefined);

            const balances = await fetchPartyBalances(fromDate, toDate, { host: 'localhost', port: tallyPort }, distinctNames);
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
            // TDS-flagged ledgers from both sides (expense and Duties & Taxes)
            let taxTdsNames: string[] = [];
            try {
                const taxRes = await safeApiFetch('/api/tds/ledgers?side=TAX');
                if (taxRes.ok) taxTdsNames = (await taxRes.json()).filter((l: any) => l.isTdsLedger).map((l: any) => l.ledgerName);
            } catch (err) { console.error('Failed to read TDS ledger flags', err); }
            const tdsLedgerNames = [...ledgerMappings.filter(m => m.isTdsLedger).map(m => m.ledgerName), ...taxTdsNames];
            clearTallyMetadataCache(); // read the live Tally master, not a previous company's cache
            const data = await fetchTdsTransactions(fromDate, toDate, { host: 'localhost', port: tallyPort }, groupMappings, purchaseTypes, journalTypes, tdsLedgerNames);
            setTallyDirectData(data);
            await syncPartiesFromTallyData(data);

            // Full expense ledger master (every ledger under Direct / Indirect Expenses / Purchase Accounts),
            // independent of the date range. Voucher-derived ledgers are merged in as well.
            let masterLedgers: TdsMasterLedger[] = [];
            try {
                masterLedgers = await fetchExpenseLedgerMaster({ host: 'localhost', port: tallyPort });
            } catch (err) {
                toast.warning('Could not read full ledger master from Tally', { description: String(err) });
            }
            const masterAsTxns = masterLedgers.map(l => ({ ledgerName: l.ledgerName, parentGroup: l.parentGroup, parentGroupPath: l.parentGroupPath, parentGroupHierarchy: l.parentGroupHierarchy }));
            // The master is the source of truth for the expense tree. Only if it was read successfully,
            // stale auto rows are cleared; otherwise fall back to the voucher ledgers without clearing anything.
            let taxMaster: TdsMasterLedger[] = [];
            try {
                taxMaster = await fetchTaxLedgerMaster({ host: 'localhost', port: tallyPort });
            } catch (err) {
                toast.warning('Could not read Duties & Taxes ledgers from Tally', { description: String(err) });
            }
            const taxAsTxns = taxMaster.map(l => ({ ledgerName: l.ledgerName, parentGroup: l.parentGroup, parentGroupPath: l.parentGroupPath, parentGroupHierarchy: l.parentGroupHierarchy }));
            // Stale auto rows are cleared only when both Tally masters were read successfully
            const bothRead = masterLedgers.length > 0 && taxMaster.length > 0;
            if (masterLedgers.length + taxMaster.length > 0) await syncLedgersFromTallyData([...masterAsTxns, ...taxAsTxns], bothRead);
            else await syncLedgersFromTallyData(data);

            // Pass the parsed party names immediately to fetchBalances to bypass React state update delay
            const parsedPartyNames = Array.from(new Set(data.map(t => t.partyName)));
            fetchBalances(parsedPartyNames);
            toast.success(`Fetched ${data.length} vouchers and ${masterLedgers.length} expense ledgers from Tally master`);
        } catch (err) { toast.error('Fetch failed', { description: String(err) }); }
        finally { setIsFetchingTally(false); }
    };

    // ─── Reconciliation Engine ───────────────────────────────
    const handleRunEngine = async () => {
        let effectiveChannel: 'FORM26Q' | 'ITR_JSON' | 'MANUAL' = 'FORM26Q';
        if (form26qFile) {
            effectiveChannel = 'FORM26Q';
        } else if (itrParsedTdsRecords && itrParsedTdsRecords.length > 0) {
            effectiveChannel = 'ITR_JSON';
        } else if (manualTdsRecords.length > 0 || manualBooksTransactions.length > 0) {
            effectiveChannel = 'MANUAL';
        } else {
            return toast.error("Please upload Form 26Q Excel file or ITR JSON first.");
        }

        if (effectiveChannel !== 'MANUAL' && !tallyDirectData) {
            return toast.error("Please fetch Tally data via Live API.");
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
            if (effectiveChannel === 'MANUAL') {
                tallyTransactions = manualBooksTransactions.map(t => ({ date: t.date, partyName: t.partyName, partyPan: t.partyPan, ledgerName: t.ledgerName, amount: parseFloat(String(t.amount)), actualTdsDeducted: parseFloat(String(t.actualTdsDeducted)), voucherNumber: t.voucherNumber }));
            } else {
                tallyTransactions = tallyDirectData || [];
            }
            if (tallyTransactions.length === 0) throw new Error("No valid Books transactions found.");
            if (effectiveChannel !== 'MANUAL') { await syncPartiesFromTallyData(tallyTransactions); await syncLedgersFromTallyData(tallyTransactions); }

            let form26qRecords: any[] = [];
            if (effectiveChannel === 'MANUAL') {
                form26qRecords = manualTdsRecords.map(t => ({ partyPan: t.partyPan, partyName: t.partyName, section: t.section, amountPaid: parseFloat(String(t.amountPaid)), tdsDeducted: parseFloat(String(t.tdsDeducted)) }));
            } else if (effectiveChannel === 'ITR_JSON') {
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
                .replace(/[A-Z]{2}[-\s]?\d{1,2}[-\s]?[A-Z]{1,4}[-\s]?\d{1,4}/gi, '')
                .replace(/\(.*?\)/g, '')
                .replace(/\b(DRIVER|VEHICLE|LORRY|TRUCK|TANKER|CAB|AUTO|TRANSPORTER|TRANSPORT|TEMPO|BUS|TRAILER)\b/gi, '')
                .replace(/[-\s\(\)]+(CR|DR)\b$/gi, '')
                .replace(/\b(M\/S\.?|MS\.?|MR\.?|MRS\.?|SHREE|SHRI)\b/gi, '')
                .replace(/\b(PVT|PRIVATE|LTD|LIMITED|LLP|INC|CO|COMPANY|CORP|CORPORATION|ENTERPRISES?|TRADERS?|INDUSTRIES|AGENC(?:Y|IES)|BROTHERS|BROS|SONS|ASSOCIATES|AND|&)\b/gi, '')
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
            const response = await safeApiFetch('/api/tds/reconcile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    transactions: tallyTxns,
                    form26qRecords: tracesRecords,
                    confirmedMatches: confirmedNameMatchesList,
                    strictMode: strictModeOnlyMapped
                })
            });
            if (!response.ok) throw new Error("Failed to process reconciliation on the server.");
            const data = await response.json();
            const mappedResults = data.results.map((r: any) => {
                const candidates = [
                    r.name_in_books,
                    r.party_name,
                    r.name_in_26q
                ].filter(Boolean).map((n: string) => n.toUpperCase().trim());

                let closingBal = 0;
                for (const name of candidates) {
                    if (partyBalances.has(name)) { closingBal = partyBalances.get(name)!; break; }
                    const clean = name.replace(/\s*\([^)]*\)/g, '').trim();
                    if (clean && partyBalances.has(clean)) { closingBal = partyBalances.get(clean)!; break; }
                    const alpha = name.replace(/[^A-Z0-9]/g, '');
                    if (alpha && partyBalances.has(alpha)) { closingBal = partyBalances.get(alpha)!; break; }
                }

                return {
                    partyName: r.party_name, partyPan: r.party_pan, panInBooks: r.pan_in_books || '—', panIn26Q: r.pan_in_26q || '—',
                    nameInBooks: r.name_in_books || '—', nameIn26Q: r.name_in_26q || '—', section: r.section_code,
                    ledgers: r.ledgers, tdsLedgers: r.tds_ledgers, booksSpend: r.books_spend || 0,
                    booksTaxable: r.books_taxable, taxableBasis: r.taxable_basis || r.taxableBasis || '', rateApplied: r.books_rate_applied || 0, booksRequiredTds: r.books_required_tds,
                    booksActualTds: r.books_actual_tds, tracesTaxable: r.traces_taxable, tracesTds: r.traces_tds,
                    taxableVariance: r.taxable_variance, tdsVariance: r.tds_variance, status: r.status,
                    reason: r.reason || '', closingBalance: closingBal
                };
            });
            const partyMasterSectionMap = new Map<string, string>();
            parties.forEach(p => {
                if (p.party_name && (p as any).mapped_section_code) {
                    partyMasterSectionMap.set(p.party_name.toUpperCase().trim(), (p as any).mapped_section_code);
                }
            });
            const advanceAuditResults = computeAdvanceTdsAudit(tallyTxns, ledgerMappings, rules, partyMasterSectionMap, (partyBalances as any).openingBalancesCr || partyBalances);
            setAdvanceTdsResults(advanceAuditResults);

            const splitPans = computeMultiLedgerPans(mappedResults);
            setMultiLedgerPans(splitPans);

            setReconSummary(data.summary);
            setReconResults(mappedResults);
            setActiveStep(3);
            setExpandedRows(new Set());
            toast.success("TDS Reconciliation engine executed successfully!");

            // Auto-save session snapshot locally to PC hard drive
            saveLocalRecoSnapshot({
                version: '1.0',
                timestamp: new Date().toISOString(),
                companyName: companyInfo?.name || 'Company',
                financialYear: selectedFY,
                mode: 'input',
                moduleType: 'tds-reco',
                moduleName: 'TDS Audit & Reconciliation',
                results: mappedResults,
                summary: data.summary,
            }).catch(err => console.error('Auto-save local snapshot error:', err));
        } catch (err: any) { toast.error("Reconciliation failed", { description: err.message }); }
        finally { setIsProcessing(false); }
    };

    const handleReset = () => { setForm26qFile(null); setItrJsonFile(null); setItrParsedTdsRecords(null); setTallyDirectData(null); setReconResults(null); setReconSummary(null); setMultiLedgerPans([]); setActiveStep(0); toast.info("Reconciliation state cleared."); };

    const handleFullReset = async () => {
        const ok = await confirm({
            title: 'Reset TDS Module',
            description: "Are you sure you want to completely reset the TDS module? This will delete all ledger mappings, transactions, and vendor edits from the database to start fresh.",
            confirmText: 'Reset Everything',
            variant: 'destructive',
        });
        if (!ok) return;
        try {
            // The server only resets when it receives the explicit confirmation token
            const res = await safeApiFetch('/api/tds/reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ confirm: 'RESET_ALL_TDS_DATA' })
            });
            if (res.ok) {
                setForm26qFile(null); setTallyDirectData(null); setReconResults(null); setReconSummary(null);
                setLedgerMappings([]); setGroupMappings([]); setGroupTree(null); setTaxTree(null);
                setSuggestions([]); setSelectedSuggestions({});
                setSuggestedSections({}); setParties([]); setPartyBalances(new Map()); setActiveStep(0);
                toast.success("TDS Module completely reset successfully!");
            } else {
                const body = await res.json().catch(() => ({} as { error?: string }));
                toast.error(body.error || 'Failed to reset database tables');
            }
        } catch (err) { toast.error("Error communicating with reset server"); }
    };

    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'Matched': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
            case 'Short Deducted': return 'bg-amber-50 text-amber-700 border-amber-200';
            case 'Excess Deducted': return 'bg-indigo-50 text-indigo-700 border-indigo-200';
            case 'Missing in 26Q': return 'bg-rose-50 text-rose-700 border-rose-200';
            case 'Missing in Books': return 'bg-blue-50 text-blue-700 border-blue-200';
            case 'Under Threshold': return 'bg-slate-100 text-slate-700 border-slate-200';
            default: return 'bg-slate-100 text-slate-700 border-slate-200';
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
    const step1Ready = !!tallyDirectData;
    const step2Ready = !!form26qFile || (!!itrParsedTdsRecords && itrParsedTdsRecords.length > 0) || manualTdsRecords.length > 0;
    const step3Ready = parties.length > 0;

    const steps = [
        { label: 'Tally Ingestion & Mappings', icon: Database, ready: step1Ready, info: tallyDirectData ? `${tallyDirectData.length} vouchers` : 'Fetch Tally' },
        { label: 'Form 26Q Ingestion', icon: UploadCloud, ready: step2Ready, info: form26qFile ? form26qFile.name.slice(0, 14) : 'Upload 26Q' },
        { label: 'Vendor Review', icon: Users, ready: step3Ready, info: step3Ready ? `${parties.length} vendors` : 'Review Vendors' },
        { label: 'Audit & Reconciliation', icon: Activity, ready: !!reconResults, info: reconResults ? `${reconResults.length} records` : 'Run Engine', disabled: !reconResults }
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
        <div className="w-full max-w-6xl mx-auto space-y-2 silk-reveal">
            {/* Header */}
            <header className="bg-white/95 backdrop-blur-xl shadow-xs rounded-2xl px-5 py-2.5 flex flex-wrap items-center justify-between gap-4 border border-slate-200/80">
                <div className="flex items-center gap-3">
                    <button onClick={onBack} className="w-10 h-10 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900 flex items-center justify-center transition-all shadow-2xs group" title="Return to Master Central Hub">
                        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
                    </button>
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200/70 flex items-center justify-center text-indigo-600 shrink-0 shadow-2xs">
                        <FileSpreadsheet className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-base sm:text-lg font-bold tracking-wide uppercase text-slate-900 leading-tight">
                                TDS Reconciliation & TRACES Consolidator
                            </h1>
                            <span className="text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-200 uppercase tracking-wider">
                                Suite 02 · Live
                            </span>
                        </div>
                        <p className="text-xs text-slate-500 font-mono">
                            Map expenses → Ingest data → Review vendors → Audit variances & Form 26Q
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2.5 w-full md:w-auto">
                    {partyBalances.size > 0 && (
                        <div className="px-3 py-1.5 bg-teal-50 border border-teal-200 rounded-xl text-xs font-bold text-teal-700 flex items-center gap-1.5 shadow-2xs">
                            <Wallet className="w-3.5 h-3.5" /> {partyBalances.size} balances scanned
                        </div>
                    )}
                    <button
                        onClick={() => setIsHistoryOpen(true)}
                        className="h-9 px-3.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
                        title="View and restore saved TDS reconciliation sessions from SQLite database"
                    >
                        <History className="w-3.5 h-3.5 text-indigo-600" /> Saved Runs
                    </button>
                    {reconResults && (
                        <button
                            onClick={handleSaveTdsRun}
                            className="h-9 px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                            title="Save current TDS reconciliation run to SQLite database"
                        >
                            <HardDrive className="w-3.5 h-3.5" /> Save TDS Run
                        </button>
                    )}
                    <button onClick={handleFullReset} className="h-9 px-4 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-2xs ml-auto md:ml-0 cursor-pointer" title="Resets Tally database tables, files, and results to start fresh">
                        <Trash2 className="w-3.5 h-3.5" /> Full Reset
                    </button>
                </div>
            </header>

            {/* Navigation Stepper */}
            <StepperNav steps={steps} activeStep={activeStep} onStepClick={setActiveStep} />

            {/* ═══════════════ STEP 0: TALLY INGESTION & AUTO-MAPPINGS ═══════════════ */}
            {activeStep === 0 && (
                <div className="space-y-4 animate-pop-in">
                    {/* Card 1: Assessment Period & TallyPrime Connection */}
                    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-4">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                            <div>
                                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                    <CalendarClock className="w-5 h-5 text-indigo-600" />
                                    Assessment Period & TallyPrime Connection
                                </h3>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    Select the financial year and fetch transactions live from your running TallyPrime company.
                                </p>
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                                {FY_OPTIONS.map(fy => (
                                    <button
                                        key={fy}
                                        onClick={() => { setSelectedFY(fy); const yr = parseInt(fy.split('-')[0]); setFromDate(`${yr}-04-01`); setToDate(`${yr + 1}-03-31`); }}
                                        className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider border transition-all ${selectedFY === fy
                                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-indigo-300 hover:bg-white'
                                        }`}
                                    >
                                        FY {fy}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Live Tally Connection Row */}
                        <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200/90 space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-lg bg-teal-50 border border-teal-200/70 text-teal-600 flex items-center justify-center">
                                        <Server className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                                            TallyPrime Live Gateway
                                            {connectionStatus === 'connected' ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                                    Connected: {companyInfo?.name || 'Company'}
                                                </span>
                                            ) : connectionStatus === 'connecting' ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                                    <Loader2 className="w-2.5 h-2.5 animate-spin" /> Connecting...
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                                    Disconnected (Port {tallyPort})
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-[11px] text-slate-500">Local XML Server HTTP Port (Default: 9000)</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        value={tallyPort}
                                        onChange={e => setTallyPort(Number(e.target.value))}
                                        className="w-20 h-8 bg-white border border-slate-300 rounded-lg px-2.5 text-xs text-slate-900 font-bold focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100 outline-none shadow-2xs"
                                        title="TallyPrime HTTP XML Server Port"
                                    />
                                    <button
                                        onClick={connectToTally}
                                        disabled={connectionStatus === 'connecting'}
                                        className="h-8 px-4 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                                    >
                                        {connectionStatus === 'connecting' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                                        {connectionStatus === 'connected' ? 'Re-Connect' : 'Connect'}
                                    </button>
                                </div>
                            </div>

                            {/* Date range & Fetch button */}
                            <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-slate-200/60">
                                <div className="flex items-center gap-1.5 flex-1 min-w-[280px]">
                                    <label className="text-xs font-semibold text-slate-600 shrink-0">Period:</label>
                                    <input
                                        type="date"
                                        value={fromDate}
                                        onChange={e => setFromDate(e.target.value)}
                                        className="flex-1 h-8 bg-white border border-slate-300 rounded-lg px-2.5 text-xs text-slate-900 font-semibold focus:border-indigo-500 outline-none shadow-2xs"
                                    />
                                    <span className="text-xs text-slate-400">to</span>
                                    <input
                                        type="date"
                                        value={toDate}
                                        onChange={e => setToDate(e.target.value)}
                                        className="flex-1 h-8 bg-white border border-slate-300 rounded-lg px-2.5 text-xs text-slate-900 font-semibold focus:border-indigo-500 outline-none shadow-2xs"
                                    />
                                </div>

                                <button
                                    onClick={handleFetchTally}
                                    disabled={isFetchingTally || connectionStatus !== 'connected'}
                                    className="h-8 px-5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-2 shadow-xs cursor-pointer"
                                >
                                    {isFetchingTally ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
                                    {isFetchingTally ? 'Fetching Vouchers & Masters...' : 'Fetch Tally Vouchers'}
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setShowAdvancedVouchers(!showAdvancedVouchers)}
                                    className="h-8 px-2.5 text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold transition-all shadow-2xs flex items-center gap-1 cursor-pointer"
                                    title="Configure custom purchase/journal voucher type names"
                                >
                                    <Settings2 className="w-3.5 h-3.5 text-slate-500" />
                                    <span>Voucher Types</span>
                                    {showAdvancedVouchers ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                </button>
                            </div>

                            {/* Collapsible custom voucher types */}
                            {showAdvancedVouchers && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200 animate-in fade-in">
                                    <div>
                                        <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1">Custom Purchase Voucher Types</label>
                                        <input
                                            type="text"
                                            value={customPurchaseVouchers}
                                            onChange={e => handleCustomPurchaseChange(e.target.value)}
                                            placeholder="e.g. Purchase GST, Inward Supply"
                                            className="w-full h-8 bg-white border border-slate-300 rounded-lg px-2.5 text-xs text-slate-900 placeholder-slate-400 focus:border-indigo-500 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1">Custom Journal Voucher Types</label>
                                        <input
                                            type="text"
                                            value={customJournalVouchers}
                                            onChange={e => handleCustomJournalChange(e.target.value)}
                                            placeholder="e.g. TDS Journal, Provision"
                                            className="w-full h-8 bg-white border border-slate-300 rounded-lg px-2.5 text-xs text-slate-900 placeholder-slate-400 focus:border-indigo-500 outline-none"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Card 2: Auto-Mapping Summary & Reconciliation Mode (Shown once Tally vouchers are loaded) */}
                    {tallyDirectData && (
                        <div className="bg-white border border-emerald-200/90 rounded-2xl p-5 shadow-xs space-y-4 animate-in fade-in">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center shrink-0 shadow-2xs">
                                        <CheckCircle2 className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                            Auto-Mapping Active from Tally Group Hierarchy
                                            <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">
                                                100% Automated
                                            </span>
                                        </h4>
                                        <p className="text-xs text-slate-500 mt-0.5">
                                            Every expense ledger automatically inherits its statutory TDS section from parent & sub-groups.
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
                                        <input
                                            type="checkbox"
                                            id="strictModeCheckbox"
                                            checked={strictModeOnlyMapped}
                                            onChange={(e) => setStrictModeOnlyMapped(e.target.checked)}
                                            className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                                        />
                                        <label htmlFor="strictModeCheckbox" className="text-xs font-bold text-slate-700 cursor-pointer select-none">
                                            Strict Mode
                                        </label>
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${strictModeOnlyMapped ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-slate-200/70 text-slate-600'}`}>
                                            {strictModeOnlyMapped ? 'ON' : 'OFF'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Stats Counter Bar */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Vouchers Loaded</span>
                                    <span className="text-xl font-black text-slate-900">{tallyDirectData.length}</span>
                                </div>
                                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Group Templates</span>
                                    <span className="text-xl font-black text-indigo-600">{groupMappings.length}</span>
                                </div>
                                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Ledgers Mapped</span>
                                    <span className="text-xl font-black text-emerald-600">
                                        {ledgerMappings.filter(m => m.sectionCode || m.inheritedSectionCode || m.isTdsLedger).length}
                                    </span>
                                </div>
                                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Unmapped Ledgers</span>
                                    <span className={`text-xl font-black ${unmappedFetchedLedgers.length > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                                        {unmappedFetchedLedgers.length}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Card 3: Unmapped Ledgers Quick Assigner (Only if unmapped ledgers exist) */}
                    {tallyDirectData && unmappedFetchedLedgers.length > 0 && (
                        <div className="bg-white border border-amber-200 rounded-2xl p-5 shadow-xs space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                                    <div>
                                        <h4 className="text-sm font-bold text-slate-900">
                                            {unmappedFetchedLedgers.length} Ledgers Require Attention
                                        </h4>
                                        <p className="text-xs text-slate-500">
                                            These expense ledgers have no inherited group template. Assign a TDS section below or leave unmapped.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-xl bg-slate-50/60">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-slate-100 text-slate-700 sticky top-0 border-b border-slate-200 font-bold uppercase text-[10px]">
                                        <tr>
                                            <th className="px-4 py-2.5">Ledger Name</th>
                                            <th className="px-4 py-2.5">Assign TDS Section</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200">
                                        {unmappedFetchedLedgers.map((ledgerName, idx) => (
                                            <tr key={idx} className="hover:bg-white transition-colors">
                                                <td className="px-4 py-2.5 text-slate-900 font-semibold">{ledgerName}</td>
                                                <td className="px-4 py-2.5">
                                                    <select
                                                        defaultValue=""
                                                        onChange={(e) => {
                                                            if (e.target.value) {
                                                                handleUpdateLedgerConfig(ledgerName, { sectionCode: e.target.value, isTdsLedger: false });
                                                            }
                                                        }}
                                                        className="h-7 bg-white border border-slate-300 rounded-lg px-2 text-xs text-indigo-700 font-bold focus:border-indigo-500 outline-none shadow-2xs"
                                                    >
                                                        <option value="">-- Select Section --</option>
                                                        {rules.map((r, ri) => (
                                                            <option key={ri} value={r.old_section}>{r.old_section} - {r.nature_of_payment}</option>
                                                        ))}
                                                    </select>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Card 4: Enterprise Hierarchy & Template Customization (Collapsible, closed by default) */}
                    <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden">
                        <button
                            type="button"
                            onClick={() => setShowEnterpriseMapping(!showEnterpriseMapping)}
                            className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors group text-left cursor-pointer"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 bg-slate-100 text-slate-600 rounded-xl flex items-center justify-center shrink-0">
                                    <Settings2 className="w-4 h-4" />
                                </div>
                                <div>
                                    <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                        Enterprise Group Hierarchy & Template Customization
                                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                                            Optional
                                        </span>
                                    </h4>
                                    <p className="text-xs text-slate-500 mt-0.5 font-medium">
                                        Inspect or override statutory section inheritance across full Tally expense groups and Duties & Taxes.
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {showEnterpriseMapping ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                            </div>
                        </button>

                        {showEnterpriseMapping && (
                            <div className="p-5 pt-2 border-t border-slate-100 space-y-4">
                                {/* Sub-Tab Switcher */}
                                <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
                                    <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
                                        <button
                                            type="button"
                                            onClick={() => setMappingTreeTab('EXPENSE')}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${mappingTreeTab === 'EXPENSE' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
                                        >
                                            📁 Expense Groups & Ledgers Tree
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setMappingTreeTab('DUTIES')}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${mappingTreeTab === 'DUTIES' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
                                        >
                                            🧾 Duties & Taxes (TDS Payable Ledgers)
                                        </button>
                                    </div>

                                    {mappingTreeTab === 'EXPENSE' ? (
                                        <div className="flex items-center gap-2">
                                            <button type="button" onClick={() => exportGroupMappings('EXPENSE')} className="text-xs font-bold flex items-center gap-1.5 text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs transition-colors cursor-pointer">
                                                <Download className="w-3.5 h-3.5" /> Export Tree
                                            </button>
                                            <label className="text-xs font-bold flex items-center gap-1.5 text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs cursor-pointer transition-colors">
                                                <UploadCloud className="w-3.5 h-3.5" /> Import
                                                <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => importGroupMappings(e, 'EXPENSE')} />
                                            </label>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <button type="button" onClick={exportTaxTemplate} className="text-xs font-bold flex items-center gap-1.5 text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs transition-colors cursor-pointer">
                                                <Download className="w-3.5 h-3.5" /> Export Taxes
                                            </button>
                                            <label className="text-xs font-bold flex items-center gap-1.5 text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs cursor-pointer transition-colors">
                                                <UploadCloud className="w-3.5 h-3.5" /> Import
                                                <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={importTaxTemplate} />
                                            </label>
                                        </div>
                                    )}
                                </div>

                                {mappingTreeTab === 'EXPENSE' ? (
                                    <TdsGroupTree
                                        data={groupTree}
                                        sections={rules}
                                        onSetGroupSection={handleSetGroupSection}
                                        onSetLedgerSection={handleSetLedgerSectionFromTree}
                                        onClearLedgerOverride={handleClearLedgerOverride}
                                    />
                                ) : (
                                    <TdsGroupTree
                                        data={taxTree}
                                        sections={rules}
                                        onSetGroupSection={handleSetGroupSection}
                                        onSetLedgerSection={handleSetLedgerSectionFromTree}
                                        onClearLedgerOverride={handleClearLedgerOverride}
                                        showTds={true}
                                        tickOnly={true}
                                        onSetLedgerTds={handleSetLedgerTds}
                                    />
                                )}
                            </div>
                        )}
                    </div>

                    {/* Step 0 Bottom Action Bar */}
                    <div className="flex items-center justify-between pt-2">
                        <span className="text-xs font-semibold text-slate-500">
                            {tallyDirectData ? `Ready: ${tallyDirectData.length} vouchers loaded` : 'Connect Tally and click Fetch Vouchers to begin'}
                        </span>
                        <button
                            onClick={() => setActiveStep(1)}
                            disabled={!tallyDirectData}
                            className="h-10 px-6 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 shadow-xs cursor-pointer"
                        >
                            Continue to Form 26Q Ingestion <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* ═══════════════ STEP 1: FORM 26Q INGESTION ═══════════════ */}
            {activeStep === 1 && (
                <div className="space-y-4 animate-pop-in">
                    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-4">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <div>
                                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                    <FileSpreadsheet className="w-5 h-5 text-emerald-600" /> Form 26Q (TRACES Return)
                                </h3>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    Upload the Form 26Q Excel workbook downloaded from TRACES. Requires columns: <b>PAN, Name, Section, Amount Paid, TDS Deposited</b>.
                                </p>
                            </div>
                            <button
                                onClick={export26QTemplate}
                                className="h-8 px-3.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
                            >
                                <Download className="w-3.5 h-3.5" /> Download Template
                            </button>
                        </div>

                        {!form26qFile ? (
                            <FileUploadZone
                                onFileSelect={async (f) => { setForm26qFile(f); toast.success('Form 26Q Loaded'); }}
                                label="Upload Form 26Q Excel"
                                description="Drag and drop your .xlsx workbook or click to browse"
                            />
                        ) : (
                            <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                                        <CheckCircle2 className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <span className="text-xs font-bold text-slate-900 block">{form26qFile.name}</span>
                                        <span className="text-[11px] text-emerald-700 font-medium">Form 26Q ready for reconciliation</span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setForm26qFile(null)}
                                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-white rounded-lg transition-colors border border-transparent hover:border-slate-200 cursor-pointer"
                                    title="Remove file"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="flex justify-between items-center pt-2">
                        <button
                            onClick={() => setActiveStep(0)}
                            className="h-10 px-5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 shadow-2xs cursor-pointer"
                        >
                            <ArrowLeft className="w-4 h-4" /> Back to Tally Ingestion
                        </button>
                        <button
                            onClick={() => setActiveStep(2)}
                            disabled={!form26qFile && !itrParsedTdsRecords && manualTdsRecords.length === 0}
                            className="h-10 px-6 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 shadow-xs cursor-pointer"
                        >
                            Continue to Vendor Review <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* ═══════════════ STEP 2: VENDOR MASTERS REVIEW ═══════════════ */}
            {activeStep === 2 && (
                <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs animate-pop-in space-y-4">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-slate-100">
                        <div>
                            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                <Users className="w-5 h-5 text-indigo-600" />
                                Vendor Master Profile & Closing Balances
                            </h2>
                            <p className="text-xs text-slate-500 mt-0.5">
                                Audit vendor PAN mappings, Entity Types, and live Closing Balances scanned from Tally. Edit missing PANs directly.
                            </p>
                        </div>
                        <div className="flex items-center gap-2.5 w-full sm:w-auto">
                            {connectionStatus === 'connected' && (
                                <button
                                    onClick={() => fetchBalances()}
                                    disabled={isFetchingBalances}
                                    className="h-9 px-3.5 bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
                                >
                                    {isFetchingBalances ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wallet className="w-3.5 h-3.5" />}
                                    Refresh Balances
                                </button>
                            )}
                            <div className="relative flex-1 sm:w-64">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type="text"
                                    value={partySearchTerm}
                                    onChange={(e) => setPartySearchTerm(e.target.value)}
                                    placeholder="Search vendors, PANs..."
                                    className="w-full h-9 bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 rounded-xl pl-9 pr-3 text-xs text-slate-900 focus:border-indigo-500 outline-none transition-all"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white max-h-[480px] overflow-y-auto">
                        <table className="w-full text-left text-xs whitespace-nowrap">
                            <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 sticky top-0 z-10 font-bold uppercase text-[10px]">
                                <tr>
                                    <th className="px-4 py-3">Vendor Name</th>
                                    <th className="px-4 py-3">PAN</th>
                                    <th className="px-4 py-3">Entity Type</th>
                                    <th className="px-4 py-3 text-right">Closing Balance</th>
                                    <th className="px-4 py-3 text-center w-24">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredParties.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                                            <div className="flex flex-col items-center gap-2">
                                                <Users className="w-8 h-8 text-slate-300" />
                                                <span>No vendor profiles found. Fetch Tally vouchers in Step 1 to extract parties.</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : filteredParties.map((p) => {
                                    const isEditing = editingPartyId === p.id;
                                    const pUpper = p.party_name.toUpperCase().trim();
                                    const pClean = pUpper.replace(/\s*\([^)]*\)/g, '').trim();
                                    const pAlpha = pUpper.replace(/[^A-Z0-9]/g, '');
                                    const bal = partyBalances.get(pUpper) ?? partyBalances.get(pClean) ?? partyBalances.get(pAlpha) ?? 0;
                                    return (
                                        <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                                            <td className="px-4 py-2.5 text-slate-900 font-semibold max-w-[260px] truncate" title={p.party_name}>{p.party_name}</td>
                                            <td className="px-4 py-2.5 font-mono text-xs">
                                                {isEditing ? (
                                                    <input
                                                        type="text"
                                                        value={editPan}
                                                        onChange={e => setEditPan(e.target.value)}
                                                        maxLength={10}
                                                        onKeyDown={e => e.key === 'Enter' && handleSavePartyEdit(p.id)}
                                                        className="w-28 bg-white border border-slate-300 rounded-lg px-2 py-0.5 text-xs text-slate-900 font-mono font-bold focus:border-indigo-500 outline-none shadow-2xs"
                                                    />
                                                ) : (
                                                    p.pan_number ? (
                                                        <span className="text-slate-800 font-bold">{p.pan_number}</span>
                                                    ) : (
                                                        <span className="text-rose-600 font-medium italic">Missing PAN</span>
                                                    )
                                                )}
                                            </td>
                                            <td className="px-4 py-2.5">
                                                {isEditing ? (
                                                    <select
                                                        value={editEntityType}
                                                        onChange={e => setEditEntityType(e.target.value)}
                                                        className="bg-white border border-slate-300 rounded-lg px-2 py-0.5 text-xs text-slate-900 focus:border-indigo-500 outline-none shadow-2xs"
                                                    >
                                                        <option value="Individual">P - Individual</option>
                                                        <option value="HUF">H - HUF</option>
                                                        <option value="Company">C - Company</option>
                                                        <option value="Firm">F - Firm / LLP</option>
                                                        <option value="AOP">A - AOP</option>
                                                        <option value="Trust">T - Trust</option>
                                                        <option value="Unknown">Unknown</option>
                                                    </select>
                                                ) : (
                                                    <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                                                        p.entity_type === 'Company' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                                                        p.entity_type === 'Individual' ? 'bg-teal-50 text-teal-700 border border-teal-200' :
                                                        p.entity_type === 'Firm' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' :
                                                        p.entity_type === 'HUF' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                                                        'bg-slate-100 text-slate-600 border border-slate-200'
                                                    }`}>
                                                        {p.entity_type}
                                                    </span>
                                                )}
                                            </td>
                                            <td className={`px-4 py-2.5 text-right font-mono text-xs font-bold ${bal < 0 ? 'text-rose-600' : bal > 0 ? 'text-teal-700' : 'text-slate-400'}`}>
                                                {fmtBal(bal)}
                                            </td>
                                            <td className="px-4 py-2.5 text-center">
                                                {isEditing ? (
                                                    <div className="flex gap-1.5 justify-center">
                                                        <button onClick={() => handleSavePartyEdit(p.id)} className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-2xs flex items-center gap-1 cursor-pointer">
                                                            <Check className="w-3 h-3" /> Save
                                                        </button>
                                                        <button onClick={() => setEditingPartyId(null)} className="px-2 py-1 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 rounded-lg text-xs font-bold shadow-2xs cursor-pointer">
                                                            Cancel
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button onClick={() => startEditingParty(p)} className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 hover:text-slate-900 rounded-lg text-xs font-semibold shadow-2xs flex items-center gap-1 mx-auto cursor-pointer">
                                                        <Edit2 className="w-3 h-3" /> Edit
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Step 2 Action Bar */}
                    <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-2">
                        <button
                            onClick={() => setActiveStep(1)}
                            className="h-10 px-5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 shadow-2xs cursor-pointer"
                        >
                            <ArrowLeft className="w-4 h-4" /> Back to 26Q Ingestion
                        </button>
                        <div className="flex items-center gap-2.5">
                            {(tallyDirectData || form26qFile) && (
                                <button
                                    onClick={handleReset}
                                    className="h-11 px-4 bg-white hover:bg-rose-50 text-rose-600 hover:text-rose-700 rounded-xl font-bold transition-all border border-rose-200 flex items-center gap-1.5 text-xs uppercase tracking-wider shadow-2xs cursor-pointer"
                                >
                                    <Trash2 className="w-4 h-4" /> Clear Data
                                </button>
                            )}
                            <button
                                onClick={handleRunEngine}
                                disabled={isProcessing}
                                className="h-11 px-8 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-40 shadow-xs flex items-center gap-2 cursor-pointer"
                            >
                                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                                {isProcessing ? 'Analyzing Thresholds & Verifying...' : 'Run Reconciliation Engine'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════ STEP 3: AUDIT & RECONCILIATION RESULTS ═══════════════ */}
            {activeStep === 3 && reconResults && (
                <div className="space-y-6 animate-pop-in">
                    {/* Summary KPI Cards */}
                    {reconSummary && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                            {[
                                { label: 'Total Parties', val: reconSummary.total_parties_analyzed, color: 'text-slate-900', bg: 'bg-white border-slate-200' },
                                { label: 'Matched', val: reconSummary.matched_count, color: 'text-emerald-700', bg: 'bg-emerald-50/60 border-emerald-200' },
                                { label: 'Short Deducted', val: reconSummary.short_deducted_count, color: 'text-amber-700', bg: 'bg-amber-50/60 border-amber-200' },
                                { label: 'Excess Deducted', val: reconSummary.excess_deducted_count, color: 'text-indigo-700', bg: 'bg-indigo-50/60 border-indigo-200' },
                                { label: 'Missing in 26Q', val: reconSummary.missing_in_26q_count, color: 'text-rose-700', bg: 'bg-rose-50/60 border-rose-200' },
                                { label: 'Missing in Books', val: reconSummary.missing_in_books_count, color: 'text-blue-700', bg: 'bg-blue-50/60 border-blue-200' },
                            ].map((c, i) => (
                                <div key={i} className={`${c.bg} border rounded-xl p-3.5 text-center shadow-xs`}>
                                    <span className="text-[11px] text-slate-500 block mb-1 uppercase tracking-wider font-semibold">{c.label}</span>
                                    <span className={`text-2xl font-black ${c.color}`}>{c.val}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Results Container Card */}
                    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs">
                        <div className="flex flex-col gap-4 mb-5">
                            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3">
                                {/* Sub-Tab Navigation Bar */}
                                <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0">
                                    <button
                                        onClick={() => setActiveResultsSubTab('RECONCILIATION')}
                                        className={`px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                                            activeResultsSubTab === 'RECONCILIATION'
                                                ? 'bg-white text-indigo-700 shadow-xs border border-slate-200'
                                                : 'text-slate-600 hover:text-slate-900'
                                        }`}
                                    >
                                        26Q Reconciliation Report
                                    </button>
                                    <button
                                        onClick={() => setActiveResultsSubTab('SPLIT_PANS')}
                                        className={`px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                                            activeResultsSubTab === 'SPLIT_PANS'
                                                ? 'bg-white text-amber-700 shadow-xs border border-slate-200'
                                                : 'text-slate-600 hover:text-slate-900'
                                        }`}
                                    >
                                        <span>Multi-Ledger Split PANs</span>
                                        {multiLedgerPans.length > 0 && (
                                            <span className="px-1.5 py-0.2 bg-amber-100 text-amber-800 border border-amber-300 rounded-full text-[10px] font-bold">
                                                {multiLedgerPans.length}
                                            </span>
                                        )}
                                    </button>
                                    <button
                                        onClick={() => setActiveResultsSubTab('ADVANCE_AUDIT')}
                                        className={`px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                                            activeResultsSubTab === 'ADVANCE_AUDIT'
                                                ? 'bg-white text-indigo-700 shadow-xs border border-slate-200'
                                                : 'text-slate-600 hover:text-slate-900'
                                        }`}
                                    >
                                        <span>Advance TDS Audit</span>
                                        {advanceTdsResults.length > 0 && (
                                            <span className="px-1.5 py-0.2 bg-rose-100 text-rose-800 border border-rose-300 rounded-full text-[10px] font-bold">
                                                {advanceTdsResults.length}
                                            </span>
                                        )}
                                    </button>
                                </div>

                                {/* Controls & Actions */}
                                <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                                    <div className="relative flex-1 sm:w-56">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        <input
                                            type="text"
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            placeholder="Search party, PAN..."
                                            className="w-full h-9 bg-slate-50 border border-slate-300 rounded-lg pl-9 pr-3 text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:border-indigo-500 outline-hidden transition-all"
                                        />
                                    </div>
                                    {multiLedgerPans.length > 0 && (
                                        <button
                                            onClick={() => exportMultiLedgerPanWorkbook(multiLedgerPans, companyInfo?.name || 'Company')}
                                            className="h-9 px-3.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-xs transition-colors flex items-center gap-1.5 whitespace-nowrap shadow-xs cursor-pointer"
                                        >
                                            <Download className="w-3.5 h-3.5" /> Split PAN Workbook
                                        </button>
                                    )}
                                    <button
                                        onClick={() => exportTdsReport(reconResults, companyInfo?.name || 'TDS_Report', advanceTdsResults)}
                                        className="h-9 px-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-xs transition-colors flex items-center gap-1.5 whitespace-nowrap shadow-xs cursor-pointer"
                                    >
                                        <Download className="w-3.5 h-3.5" /> Export Excel
                                    </button>
                                    <button
                                        onClick={handleReset}
                                        className="h-9 px-3 bg-white hover:bg-rose-50 text-slate-600 hover:text-rose-600 rounded-lg font-bold text-xs flex items-center gap-1.5 border border-slate-300 transition-colors cursor-pointer"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" /> Reset
                                    </button>
                                </div>
                            </div>

                            {activeResultsSubTab === 'RECONCILIATION' && (
                                <StatusFilterChips active={statusFilter} onChange={setStatusFilter} counts={statusCounts} />
                            )}
                        </div>

                        {/* SUB-TAB 1: 26Q Reconciliation Table */}
                        {activeResultsSubTab === 'RECONCILIATION' && (
                            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white overflow-x-auto shadow-xs">
                                <table className="w-full text-left text-xs whitespace-nowrap">
                                    <thead className="bg-slate-100 border-b border-slate-200 text-slate-700">
                                        <tr>
                                            <th className="px-2 py-3 font-semibold w-7"></th>
                                            <th className="px-3 py-3 font-semibold">Party Name (Books)</th>
                                            <th className="px-3 py-3 font-semibold">Party Name (26Q)</th>
                                            <th className="px-3 py-3 font-semibold">PAN (Books)</th>
                                            <th className="px-3 py-3 font-semibold">PAN (26Q)</th>
                                            <th className="px-3 py-3 font-semibold text-center">Section</th>
                                            <th className="px-3 py-3 font-semibold text-right">Req. TDS</th>
                                            <th className="px-3 py-3 font-semibold text-right">Actual TDS (Books)</th>
                                            <th className="px-3 py-3 font-semibold text-right">TDS (26Q)</th>
                                            <th className="px-3 py-3 font-semibold text-right">Books Var (Req - Actual)</th>
                                            <th className="px-3 py-3 font-semibold text-right">Return Var (Req - 26Q)</th>
                                            <th className="px-3 py-3 font-semibold text-center">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {filteredResults.length === 0 ? (
                                            <tr><td colSpan={12} className="px-4 py-12 text-center text-slate-400 font-medium">No parties match your search or filter.</td></tr>
                                        ) : filteredResults.map((r, i) => {
                                            const isExpanded = expandedRows.has(i);
                                            const sectionRule = rules.find(rule => rule.old_section === r.section);
                                            const applicableRate = getApplicableTdsRate(r.partyPan, r.party_entity_type || 'Unknown', sectionRule);
                                            const requiredTds = r.booksRequiredTds !== undefined ? r.booksRequiredTds : Math.round(r.booksTaxable * applicableRate);
                                            const booksTdsVariance = requiredTds - (r.booksActualTds || 0);
                                            const returnTdsVariance = requiredTds - (r.tracesTds || 0);

                                            return (
                                                <React.Fragment key={i}>
                                                    <tr onClick={() => toggleRowExpand(i)} className={`hover:bg-slate-50 cursor-pointer transition-colors group ${r.isMultiLedgerPan ? 'bg-amber-50/40 hover:bg-amber-50/70 border-l-3 border-amber-500' : ''}`}>
                                                        <td className="px-2 py-3 text-center"><ChevronRight className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} /></td>
                                                        <td className="px-3 py-3 text-slate-900 font-semibold max-w-[200px] truncate" title={r.nameInBooks || r.partyName}>
                                                            <div className="flex items-center gap-1.5 overflow-hidden">
                                                                <span className="truncate">{r.nameInBooks && r.nameInBooks !== '—' ? r.nameInBooks : (r.partyName || '—')}</span>
                                                                {r.isMultiLedgerPan && (
                                                                    <span className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300" title={`Multi-ledger PAN: Shared by ${r.multiLedgerCount || 2} distinct Tally Party Ledgers`}>
                                                                        <AlertTriangle className="w-2.5 h-2.5 text-amber-600" /> Split PAN
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-3 text-slate-600 max-w-[180px] truncate" title={r.nameIn26Q}>{r.nameIn26Q || '—'}</td>
                                                        <td className="px-3 py-3 font-mono text-[11px] text-slate-700">{r.panInBooks === 'PAN-MISSING' ? <span className="text-rose-600 font-semibold italic">Missing</span> : r.panInBooks}</td>
                                                        <td className="px-3 py-3 font-mono text-[11px] text-slate-700">{r.panIn26Q || '—'}</td>
                                                        <td className="px-3 py-3 text-center"><span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">{r.section}</span></td>
                                                        <td className="px-3 py-3 text-right font-mono text-[11px] text-slate-900 font-bold">{fmtAmt(requiredTds)}</td>
                                                        <td className="px-3 py-3 text-right font-mono text-[11px] text-indigo-700 font-bold">{fmtAmt(r.booksActualTds)}</td>
                                                        <td className="px-3 py-3 text-right font-mono text-[11px] text-emerald-700 font-bold">{fmtAmt(r.tracesTds)}</td>
                                                        <td className={`px-3 py-3 text-right font-mono text-[11px] font-bold ${booksTdsVariance > 5 ? 'text-amber-700' : booksTdsVariance < -5 ? 'text-indigo-700' : 'text-slate-400'}`}>{booksTdsVariance !== 0 ? fmtAmt(booksTdsVariance) : '—'}</td>
                                                        <td className={`px-3 py-3 text-right font-mono text-[11px] font-bold ${returnTdsVariance > 5 ? 'text-amber-700' : returnTdsVariance < -5 ? 'text-indigo-700' : 'text-slate-400'}`}>{returnTdsVariance !== 0 ? fmtAmt(returnTdsVariance) : '—'}</td>
                                                        <td className="px-3 py-3 text-center"><span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${getStatusStyle(r.status)}`}>{r.status}</span></td>
                                                    </tr>
                                                    {isExpanded && (
                                                        <tr>
                                                            <td colSpan={12} className="bg-slate-50/80 px-6 py-4 border-t border-slate-200">
                                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                                                                    {/* Books Card */}
                                                                    <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
                                                                        <div className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                                                                            <Database className="w-3.5 h-3.5" /> Books Data
                                                                        </div>
                                                                        <div className="space-y-1.5">
                                                                            <div className="flex justify-between"><span className="text-slate-500">Name in Books</span><span className="text-slate-900 font-semibold truncate max-w-[160px]" title={r.nameInBooks}>{r.nameInBooks}</span></div>
                                                                            <div className="flex justify-between"><span className="text-slate-500">PAN in Books</span><span className="text-slate-800 font-mono font-medium">{r.panInBooks}</span></div>
                                                                            <div className="flex justify-between"><span className="text-slate-500">Expense Ledgers</span><span className="text-slate-700 truncate max-w-[160px]" title={r.ledgers}>{r.ledgers || '—'}</span></div>
                                                                            <div className="flex justify-between"><span className="text-slate-500">TDS Ledgers</span><span className="text-slate-700 truncate max-w-[160px]" title={r.tdsLedgers}>{r.tdsLedgers || '—'}</span></div>
                                                                            <div className="border-t border-slate-100 pt-1.5 mt-1.5"></div>
                                                                            <div className="flex justify-between"><span className="text-slate-500">Total Spend</span><span className="text-slate-900 font-bold">{fmtAmt(r.booksSpend)}</span></div>
                                                                            <div className="flex justify-between"><span className="text-slate-500">Taxable Amount</span><span className="text-slate-900 font-bold">{fmtAmt(r.booksTaxable)}</span></div>
                                                                            <div className="flex justify-between gap-2"><span className="text-slate-500">Taxable Basis</span><span className="text-indigo-700 font-medium text-right text-[11px] truncate max-w-[220px]" title={r.taxableBasis}>{r.taxableBasis || '—'}</span></div>
                                                                            <div className="flex justify-between"><span className="text-slate-500">Rate Applied</span><span className="text-slate-800 font-medium">{applicableRate * 100}%</span></div>
                                                                            <div className="flex justify-between"><span className="text-slate-500">Required TDS</span><span className="text-slate-900 font-bold">{fmtAmt(requiredTds)}</span></div>
                                                                            <div className="flex justify-between"><span className="text-slate-500">Actual TDS</span><span className="text-indigo-700 font-bold">{fmtAmt(r.booksActualTds)}</span></div>
                                                                        </div>
                                                                    </div>
                                                                    {/* 26Q Card */}
                                                                    <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
                                                                        <div className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                                                                            <FileText className="w-3.5 h-3.5" /> Form 26Q / TRACES
                                                                        </div>
                                                                        <div className="space-y-1.5">
                                                                            <div className="flex justify-between"><span className="text-slate-500">Name in 26Q</span><span className="text-slate-900 font-semibold truncate max-w-[160px]" title={r.nameIn26Q}>{r.nameIn26Q}</span></div>
                                                                            <div className="flex justify-between"><span className="text-slate-500">PAN in 26Q</span><span className="text-slate-800 font-mono font-medium">{r.panIn26Q}</span></div>
                                                                            <div className="border-t border-slate-100 pt-1.5 mt-1.5"></div>
                                                                            <div className="flex justify-between"><span className="text-slate-500">Taxable (26Q)</span><span className="text-slate-900 font-bold">{fmtAmt(r.tracesTaxable)}</span></div>
                                                                            <div className="flex justify-between"><span className="text-slate-500">TDS (26Q)</span><span className="text-emerald-700 font-bold">{fmtAmt(r.tracesTds)}</span></div>
                                                                        </div>
                                                                    </div>
                                                                    {/* Variance & Reason Card */}
                                                                    <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
                                                                        <div className="text-[10px] font-bold text-amber-700 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                                                                            <Activity className="w-3.5 h-3.5" /> Variance & Analysis
                                                                        </div>
                                                                        <div className="space-y-1.5">
                                                                            <div className="flex justify-between"><span className="text-slate-500">Taxable Variance</span><span className={`font-bold ${r.taxableVariance > 0 ? 'text-amber-700' : r.taxableVariance < 0 ? 'text-indigo-700' : 'text-emerald-700'}`}>{fmtAmt(r.taxableVariance)}</span></div>
                                                                            <div className="flex justify-between"><span className="text-slate-500">Books TDS Variance</span><span className={`font-bold ${booksTdsVariance > 5 ? 'text-amber-700' : booksTdsVariance < -5 ? 'text-indigo-700' : 'text-emerald-700'}`}>{fmtAmt(booksTdsVariance)}</span></div>
                                                                            <div className="flex justify-between"><span className="text-slate-500">26Q TDS Variance</span><span className={`font-bold ${returnTdsVariance > 5 ? 'text-amber-700' : returnTdsVariance < -5 ? 'text-indigo-700' : 'text-emerald-700'}`}>{fmtAmt(returnTdsVariance)}</span></div>
                                                                            <div className="flex justify-between"><span className="text-slate-500">Closing Balance</span><span className={`font-bold font-mono ${(r.closingBalance || 0) < 0 ? 'text-rose-700' : 'text-teal-700'}`}>{fmtBal(r.closingBalance || 0)}</span></div>
                                                                            <div className="border-t border-slate-100 pt-1.5 mt-1.5"></div>
                                                                            <div>
                                                                                <span className="text-slate-500 block mb-1">Reason / Notes</span>
                                                                                <div className="p-2 bg-slate-50 rounded-lg border border-slate-200 text-slate-700 text-[11px] leading-relaxed">
                                                                                    {r.reason || 'No specific discrepancy remarks recorded.'}
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )}
                                                </React.Fragment>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* SUB-TAB 2: Multi-Ledger Split PANs Table */}
                        {activeResultsSubTab === 'SPLIT_PANS' && (
                            <div className="space-y-4">
                                <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-4">
                                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                                        <div>
                                            <div className="flex items-center gap-1.5 text-amber-800 font-bold text-xs uppercase tracking-wider mb-1">
                                                <AlertTriangle className="w-4 h-4 text-amber-600" /> Multiple Ledger Audit Warning
                                            </div>
                                            <h3 className="text-base font-bold text-slate-900">PANs with Multiple Tally Party Names Detected</h3>
                                            <p className="text-xs text-slate-600 mt-1 max-w-3xl leading-relaxed">
                                                The following PANs have 2 or more distinct vendor ledger names in Tally (e.g. driver accounts, vehicle prefixes, or branch ledgers). They are presented separately below to preserve book integrity while auditing aggregate TDS liabilities against 26Q.
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Mini KPI Cards */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <div className="bg-white border border-slate-200 rounded-xl p-3.5 text-center shadow-xs">
                                        <span className="text-xs text-slate-500 block mb-1 uppercase tracking-wider font-semibold">Flagged PANs</span>
                                        <span className="text-2xl font-black text-amber-600">{multiLedgerPans.length}</span>
                                    </div>
                                    <div className="bg-white border border-slate-200 rounded-xl p-3.5 text-center shadow-xs">
                                        <span className="text-xs text-slate-500 block mb-1 uppercase tracking-wider font-semibold">Total Split Party Ledgers</span>
                                        <span className="text-2xl font-black text-indigo-600">
                                            {multiLedgerPans.reduce((sum, p) => sum + p.ledgers.length, 0)}
                                        </span>
                                    </div>
                                    <div className="bg-white border border-slate-200 rounded-xl p-3.5 text-center shadow-xs">
                                        <span className="text-xs text-slate-500 block mb-1 uppercase tracking-wider font-semibold">Total Spend Across Split PANs</span>
                                        <span className="text-2xl font-black text-emerald-600">
                                            {fmtAmt(multiLedgerPans.reduce((sum, p) => sum + p.totalSpend, 0))}
                                        </span>
                                    </div>
                                </div>

                                {/* Table */}
                                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs overflow-x-auto">
                                    <table className="w-full text-left text-xs whitespace-nowrap">
                                        <thead className="bg-slate-100 border-b border-slate-200 text-slate-700">
                                            <tr>
                                                <th className="px-4 py-3 font-semibold">PAN Number</th>
                                                <th className="px-4 py-3 font-semibold">Tally Party Name (Books)</th>
                                                <th className="px-4 py-3 font-semibold text-center">Section</th>
                                                <th className="px-4 py-3 font-semibold text-right">Ledger Spend (₹)</th>
                                                <th className="px-4 py-3 font-semibold text-right">Ledger Actual TDS (₹)</th>
                                                <th className="px-4 py-3 font-semibold text-right">Total PAN Spend (₹)</th>
                                                <th className="px-4 py-3 font-semibold text-right">26Q Taxable (₹)</th>
                                                <th className="px-4 py-3 font-semibold text-right">26Q TDS (₹)</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {multiLedgerPans.length === 0 ? (
                                                <tr>
                                                    <td colSpan={8} className="px-4 py-10 text-center text-slate-400 font-medium">
                                                        No PANs with multiple ledger names were found.
                                                    </td>
                                                </tr>
                                            ) : (
                                                multiLedgerPans.map((panGroup, groupIdx) => (
                                                    <React.Fragment key={groupIdx}>
                                                        {panGroup.ledgers.map((l, ledgerIdx) => (
                                                            <tr key={ledgerIdx} className="hover:bg-slate-50 transition-colors">
                                                                {ledgerIdx === 0 && (
                                                                    <td rowSpan={panGroup.ledgers.length} className="px-4 py-3 font-mono font-bold text-amber-700 align-top border-r border-slate-200 bg-amber-50/20">
                                                                        {panGroup.pan}
                                                                        <div className="text-[10px] font-normal text-slate-500 mt-0.5">
                                                                            {panGroup.ledgers.length} ledgers
                                                                        </div>
                                                                    </td>
                                                                )}
                                                                <td className="px-4 py-3 text-slate-900 font-semibold">
                                                                    {l.partyName}
                                                                </td>
                                                                <td className="px-4 py-3 text-center">
                                                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                                                        {l.section}
                                                                    </span>
                                                                </td>
                                                                <td className="px-4 py-3 text-right font-mono font-bold text-slate-800">
                                                                    {fmtAmt(l.spend)}
                                                                </td>
                                                                <td className="px-4 py-3 text-right font-mono font-bold text-indigo-700">
                                                                    {fmtAmt(l.actualTds)}
                                                                </td>
                                                                {ledgerIdx === 0 && (
                                                                    <>
                                                                        <td rowSpan={panGroup.ledgers.length} className="px-4 py-3 text-right font-mono font-bold text-emerald-700 align-top border-l border-slate-200 bg-slate-50/50">
                                                                            {fmtAmt(panGroup.totalSpend)}
                                                                        </td>
                                                                        <td rowSpan={panGroup.ledgers.length} className="px-4 py-3 text-right font-mono font-bold text-slate-800 align-top bg-slate-50/50">
                                                                            {fmtAmt(panGroup.tracesTaxable)}
                                                                        </td>
                                                                        <td rowSpan={panGroup.ledgers.length} className="px-4 py-3 text-right font-mono font-bold text-teal-700 align-top bg-slate-50/50">
                                                                            {fmtAmt(panGroup.tracesTds)}
                                                                        </td>
                                                                    </>
                                                                )}
                                                            </tr>
                                                        ))}
                                                    </React.Fragment>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* SUB-TAB 3: Advance Payment TDS Audit Table */}
                        {activeResultsSubTab === 'ADVANCE_AUDIT' && (
                            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs overflow-x-auto">
                                <table className="w-full text-left text-xs whitespace-nowrap">
                                    <thead className="bg-slate-100 border-b border-slate-200 text-slate-700">
                                        <tr>
                                            <th className="px-3.5 py-3 font-semibold">Party Name</th>
                                            <th className="px-3.5 py-3 font-semibold">PAN</th>
                                            <th className="px-3.5 py-3 font-semibold text-center">Section</th>
                                            <th className="px-3.5 py-3 font-semibold text-right">Expenses Credited</th>
                                            <th className="px-3.5 py-3 font-semibold text-right">Opening Balance (Cr)</th>
                                            <th className="px-3.5 py-3 font-semibold text-right">Payments Made</th>
                                            <th className="px-3.5 py-3 font-semibold text-right">Advance (Pay &gt; Exp)</th>
                                            <th className="px-3.5 py-3 font-semibold text-right">Req TDS</th>
                                            <th className="px-3.5 py-3 font-semibold text-right">Actual TDS</th>
                                            <th className="px-3.5 py-3 font-semibold text-right">Shortfall</th>
                                            <th className="px-3.5 py-3 font-semibold text-center">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {advanceTdsResults.length === 0 ? (
                                            <tr>
                                                <td colSpan={11} className="px-4 py-12 text-center text-slate-500">
                                                    <div className="flex flex-col items-center gap-2">
                                                        <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                                                        <span className="text-sm font-semibold text-slate-800">No Advance Payment TDS Shortfalls Found!</span>
                                                        <span className="text-xs text-slate-500">Current year payments made to all Sundry Creditors are fully covered by expense bills or TDS.</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : advanceTdsResults
                                            .filter(r => !searchTerm || r.partyName.toLowerCase().includes(searchTerm.toLowerCase()) || r.partyPan.toLowerCase().includes(searchTerm.toLowerCase()))
                                            .map((r, i) => {
                                                const getAdvBadgeStyle = (st: string) => {
                                                    if (st === 'Un-deducted Advance TDS' || st === 'Short Deducted') return 'bg-rose-50 text-rose-700 border-rose-200';
                                                    if (st === 'Unmapped Advance Payment') return 'bg-amber-50 text-amber-700 border-amber-200';
                                                    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
                                                };
                                                return (
                                                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                                                        <td className="px-3.5 py-3 text-slate-900 font-semibold max-w-[220px] truncate" title={r.partyName}>{r.partyName}</td>
                                                        <td className="px-3.5 py-3 font-mono text-xs text-slate-700">{r.partyPan}</td>
                                                        <td className="px-3.5 py-3 text-center">
                                                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${r.section === 'UNMAPPED' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-indigo-50 text-indigo-700 border border-indigo-200'}`}>
                                                                {r.section}
                                                            </span>
                                                        </td>
                                                        <td className="px-3.5 py-3 text-right font-mono text-xs text-slate-800">{fmtAmt(r.currentYearExpenses)}</td>
                                                        <td className="px-3.5 py-3 text-right font-mono text-xs text-teal-700 font-medium">{fmtAmt(r.openingBalanceCr || 0)}</td>
                                                        <td className="px-3.5 py-3 text-right font-mono text-xs text-indigo-700 font-bold">{fmtAmt(r.currentYearPayments)}</td>
                                                        <td className="px-3.5 py-3 text-right font-mono text-xs text-amber-700 font-bold">{fmtAmt(r.advanceAmount)}</td>
                                                        <td className="px-3.5 py-3 text-right font-mono text-xs text-slate-900 font-bold">{fmtAmt(r.requiredTdsOnAdvance)} ({r.rateApplied}%)</td>
                                                        <td className="px-3.5 py-3 text-right font-mono text-xs text-indigo-700 font-bold">{fmtAmt(r.actualTdsDeducted)}</td>
                                                        <td className={`px-3.5 py-3 text-right font-mono text-xs font-black ${r.tdsShortfallOnAdvance > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                                                            {r.tdsShortfallOnAdvance > 0 ? fmtAmt(r.tdsShortfallOnAdvance) : '₹0'}
                                                        </td>
                                                        <td className="px-3.5 py-3 text-center">
                                                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${getAdvBadgeStyle(r.status)}`}>
                                                                {r.status}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        }
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* Navigation Footer */}
                    <div className="flex justify-between items-center pt-2">
                        <button
                            onClick={() => setActiveStep(2)}
                            className="h-10 px-5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl font-bold text-xs transition-all flex items-center gap-2 shadow-xs cursor-pointer"
                        >
                            <ArrowLeft className="w-4 h-4" /> Back to Vendor Review
                        </button>
                    </div>
                </div>
            )}

            {/* Fuzzy PAN Matches dialog */}
            {showPanMatchesDialog && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl animate-pop-in flex flex-col max-h-[90vh]">
                        <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg">
                                    <ShieldAlert className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-slate-900">PAN Mismatch Mappings</h3>
                                    <p className="text-xs text-slate-500">Confirm matching names from 26Q to map their PANs.</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowPanMatchesDialog(false)}
                                className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-5 overflow-y-auto space-y-3 flex-1">
                            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2">
                                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                                <div>These parties have a missing PAN in Tally but exact same names were found in 26Q with valid PANs.</div>
                            </div>
                            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white max-h-[280px] overflow-y-auto shadow-xs">
                                <table className="w-full text-left text-xs whitespace-nowrap">
                                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 sticky top-0 z-10">
                                        <tr>
                                            <th className="px-4 py-2.5 font-semibold w-12 text-center">✓</th>
                                            <th className="px-4 py-2.5 font-semibold">Party Name</th>
                                            <th className="px-4 py-2.5 font-semibold text-center">PAN (from 26Q)</th>
                                            <th className="px-4 py-2.5 font-semibold text-center">Section</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {pendingPanMatches.map((m, i) => (
                                            <tr key={i} className="hover:bg-slate-50">
                                                <td className="px-4 py-2.5 text-center">
                                                    <input
                                                        type="checkbox"
                                                        checked={!!selectedPanMatches[m.partyName]}
                                                        onChange={(e) => setSelectedPanMatches({ ...selectedPanMatches, [m.partyName]: e.target.checked })}
                                                        className="w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer"
                                                    />
                                                </td>
                                                <td className="px-4 py-2.5 text-slate-900 font-semibold">{m.partyName}</td>
                                                <td className="px-4 py-2.5 text-center font-mono text-indigo-700 font-bold">{m.suggestedPan}</td>
                                                <td className="px-4 py-2.5 text-center">
                                                    <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded font-bold text-[10px] text-slate-700">
                                                        {m.section}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div className="p-4 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row justify-between items-center gap-3">
                            <button
                                onClick={handleSkipPanMatches}
                                className="w-full sm:w-auto px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold cursor-pointer"
                            >
                                Skip & Reconcile (Keep Separate)
                            </button>
                            <button
                                onClick={handleConfirmPanMatches}
                                className="w-full sm:w-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                                <Check className="w-4 h-4" /> Confirm & Reconcile
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Suggested Name Matches confirmation dialog */}
            {showNameMatchesDialog && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl animate-pop-in flex flex-col max-h-[90vh]">
                        <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg">
                                    <GitCompare className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-slate-900">Verify Party Linkages (Name-Based)</h3>
                                    <p className="text-xs text-slate-500 font-medium mt-0.5">Confirm if the following parties matched by name are the same business entity.</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowNameMatchesDialog(false)}
                                className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-5 overflow-y-auto space-y-3 flex-1">
                            <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-xs text-indigo-800 flex items-start gap-2">
                                <Activity className="w-4 h-4 shrink-0 mt-0.5 text-indigo-600" />
                                <div>
                                    Unchecked linkages will be treated as separate, distinct entities in the final reconciliation results, preventing incorrect merging (e.g. Rudra Land Developers vs Mauli Land Developers).
                                </div>
                            </div>
                            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white max-h-[350px] overflow-y-auto shadow-xs">
                                <table className="w-full text-left text-xs whitespace-nowrap">
                                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 sticky top-0 z-10">
                                        <tr>
                                            <th className="px-4 py-2.5 font-semibold w-12 text-center">Link?</th>
                                            <th className="px-4 py-2.5 font-semibold">Party in Books (Tally)</th>
                                            <th className="px-4 py-2.5 font-semibold">Party in 26Q (TRACES)</th>
                                            <th className="px-4 py-2.5 font-semibold text-center">Match Type</th>
                                            <th className="px-4 py-2.5 font-semibold text-center">Confidence</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {suggestedNameMatches.map((m, i) => {
                                            const key = `${m.booksName}_${m.tracesName}`;
                                            const isChecked = !!selectedNameMatches[key];
                                            return (
                                                <tr key={i} className="hover:bg-slate-50">
                                                    <td className="px-4 py-2.5 text-center">
                                                        <input
                                                            type="checkbox"
                                                            checked={isChecked}
                                                            onChange={(e) => setSelectedNameMatches({ ...selectedNameMatches, [key]: e.target.checked })}
                                                            className="w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-2.5 text-slate-900 font-semibold max-w-[200px] truncate" title={m.booksName}>{m.booksName}</td>
                                                    <td className="px-4 py-2.5 text-slate-600 max-w-[200px] truncate" title={m.tracesName}>{m.tracesName}</td>
                                                    <td className="px-4 py-2.5 text-center">
                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${m.type === 'Exact Name' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                                                            {m.type}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-2.5 text-center font-mono font-bold text-slate-600">
                                                        {Math.round(m.similarity * 100)}%
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div className="p-4 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row justify-between items-center gap-3">
                            <button
                                onClick={handleSkipNameMatches}
                                className="w-full sm:w-auto px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold cursor-pointer"
                            >
                                Keep All Separate & Reconcile
                            </button>
                            <button
                                onClick={handleConfirmNameMatches}
                                className="w-full sm:w-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                                <Check className="w-4 h-4" /> Confirm Linkages & Reconcile
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* SAVED TDS RECONCILIATIONS MODAL */}
            <RecoHistoryModal
                isOpen={isHistoryOpen}
                onClose={() => setIsHistoryOpen(false)}
                onRestoreSession={handleRestoreTdsSession}
            />
        </div>
    );
}