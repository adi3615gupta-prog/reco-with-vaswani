/**
 * Suite 08: Monthly Audit Working Paper & Verification Suite
 * Modeled on CA firm standardized format (Monthly Audit Format.docx)
 * and cross-month action item tracker (Work Pending List.xlsx).
 * 
 * Refined Executive Theme & Layout matching Returns Preparation & Filing Suite:
 * - Canvas: Clean #F8FAFC light executive background
 * - Top Elevated Navbar with prominent firm header, GSTIN badge & switch client popover
 * - 12-Month horizontal timeline pill bar with status indicators
 * - Maker-Checker 4-eye review stepper & role switcher
 * - 5 high-density analytical verification tabs with zero-merge architecture
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    ArrowLeft,
    CheckCircle2,
    ClipboardCheck,
    Clock,
    AlertTriangle,
    FileSpreadsheet,
    Download,
    RefreshCw,
    Search,
    Send,
    Save,
    ShieldAlert,
    ShieldCheck,
    DollarSign,
    Check,
    X,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    UserCheck,
    FileText,
    Layers,
    Filter,
    Plus,
    Trash2,
    Calendar,
    Building2,
    Sparkles,
    Lock,
    Unlock,
    Activity,
    ExternalLink,
    AlertCircle,
    User,
    BadgeAlert,
    FileCheck2,
    UploadCloud,
    HelpCircle,
    Globe,
    Users,
    TrendingUp,
    BarChart3,
    Landmark,
    Percent,
    RotateCcw,
    Paperclip,
    Cloud,
    Inbox,
    CheckSquare,
    ListChecks,
    Settings,
    Eye,
    Zap
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { getApiBase, getAuthToken, safeApiFetch, getToken, getSessionUserFromToken } from '@/lib/api';
import {
    submitAuditForSeniorReviewInFirebase,
    approveAuditInFirebase,
    requestRevisionInFirebase,
    releaseAuditInFirebase,
    deleteAuditFromFirebase,
    subscribeToCloudAudit,
    subscribeToSeniorPendingQueue,
    fetchSeniorAuditorsFromCloud,
    fetchJuniorAuditorsFromCloud,
    isSeniorAssigned,
    type CloudAuditRecord,
    type CloudSeniorAuditor
} from '../lib/firebaseAuditSync';
import {
    type MonthlyAuditHeader,
    type AuditWorkflowStatus,
    type VouchingScopeRegister,
    type StandardChecklistItem,
    type AuditObservationItem,
    type AuditPendingPointItem,
    type FullAuditVerificationSnapshot,
    type AuditTeamMember,
    type ProfitabilityStatement,
    type MonthSales3WayRow,
    type MonthlyTaxBreakdown,
    createInitialSales3WayMatrix,
    type MonthPurchase3WayRow,
    type MonthlyPurchaseTaxBreakdown,
    createInitialPurchase3WayMatrix,
    DEFAULT_PROFITABILITY_STATEMENT,
    calculateProfitability,
    createEmptyProfitabilityStatement,
    initializeMonthlyAudit,
    autoPopulateMonthlyAudit,
    canJuniorEdit,
    canSubmitForReview,
    canSeniorReview,
    canReleaseToClient,
    type BankFacilityType,
    type BankMatchStatus,
    type BankFacilityItem,
    BANK_FACILITY_TYPES,
    BANK_MATCH_STATUSES,
    STANDARD_BANK_AUDIT_COMMENTS,
    createInitialBankFacilities,
    type AuditExcelAttachment,
    type RocLoanCategory,
    type RocChargeStatus,
    type RocLoanChargeItem,
    ROC_LOAN_CATEGORIES,
    ROC_CHARGE_STATUSES,
    STANDARD_ROC_AUDIT_COMMENTS,
    createInitialRocLoanCharges,
    type TdsSectionWorkingRow,
    type TdsMatrixTotals,
    createDefaultTdsSectionMatrix,
    calculateTdsMatrixTotals
} from '@/lib/monthlyAuditEngine';
import {
    exportMonthlyAuditToExcel,
    generateMonthlyAuditBase64,
    type MonthlyAuditExportBundle
} from '@/lib/monthlyAuditExcel';
import {
    exportMonthlyAuditToPdf,
    generateMonthlyAuditPdf
} from '@/lib/monthlyAuditPdf';
import {
    type AuditVoucherSample,
    pullAndSampleFromTally,
    exportVoucherSamplesToExcel
} from '@/lib/tallySampling';

const FINANCIAL_YEARS = ['2026-27', '2027-28', '2028-29', '2029-30', '2030-31'];
const MONTHS = [
    'April', 'May', 'June', 'July', 'August', 'September',
    'October', 'November', 'December', 'January', 'February', 'March'
];

const PERIOD_PRESETS = [
    { label: 'Q1 (Apr - Jun)', months: ['April', 'May', 'June'] },
    { label: 'Q2 (Jul - Sep)', months: ['July', 'August', 'September'] },
    { label: 'Q3 (Oct - Dec)', months: ['October', 'November', 'December'] },
    { label: 'Q4 (Jan - Mar)', months: ['January', 'February', 'March'] },
    { label: 'H1 (Apr - Sep)', months: ['April', 'May', 'June', 'July', 'August', 'September'] },
    { label: 'H2 (Oct - Mar)', months: ['October', 'November', 'December', 'January', 'February', 'March'] },
    { label: 'Full FY (12M)', months: ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March'] },
];

function getLoggedInUserTitle(): string {
    try {
        const storedName = localStorage.getItem('np_user_name') || sessionStorage.getItem('np_user_name');
        if (!storedName) return '';
        const storedDesig = localStorage.getItem('np_user_designation') || sessionStorage.getItem('np_user_designation');
        const storedDept = localStorage.getItem('np_user_department') || sessionStorage.getItem('np_user_department');
        return storedDesig ? `${storedName} (${storedDesig}${storedDept ? ` • ${storedDept}` : ''})` : storedName;
    } catch {
        return '';
    }
}

interface MonthlyAuditSuiteProps {
    onBack?: () => void;
}

export default function MonthlyAuditSuite({ onBack }: MonthlyAuditSuiteProps) {
    const confirm = useConfirm();
    // ─── Client & Navigation State (Dedicated Monthly Audit Master) ─────────────
    const [clients, setClients] = useState<Array<{ id?: string; gstin: string; legalName: string; tradeName?: string; tallyCompanyName?: string; email?: string; phone?: string; address?: string; pan?: string }>>([]);
    const [selectedClientGstin, setSelectedClientGstin] = useState<string>(() => {
        try {
            return localStorage.getItem('monthly_audit_selected_client') || '';
        } catch {
            return '';
        }
    });
    const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
    const [clientSearchQuery, setClientSearchQuery] = useState('');
    const [selectedFy, setSelectedFy] = useState<string>('2026-27');
    const [selectedMonth, setSelectedMonth] = useState<string>('April');
    const [monthStatuses, setMonthStatuses] = useState<Record<string, string>>({});

    // ─── Active Audit Bundle State ──────────────────────────────────────────────
    const [auditHeader, setAuditHeader] = useState<MonthlyAuditHeader>(() => {
        const init = initializeMonthlyAudit('', '', '2026-27', 'April');
        const userTitle = getLoggedInUserTitle();
        if (userTitle) {
            init.preparedBy = userTitle;
        }
        return init;
    });
    const [registers, setRegisters] = useState<VouchingScopeRegister[]>([
        { key: 'sales', registerName: 'Sales Register', samplingTechnique: 'Stratified Sampling', vouched: 'Partial', sampleChecked: '25% high-value', totalVouchers: 0, auditedAmount: 0, remarks: 'Verified with GST' },
        { key: 'purchase', registerName: 'Purchase Register', samplingTechnique: 'Stratified Sampling', vouched: 'Partial', sampleChecked: '30% random + high-value', totalVouchers: 0, auditedAmount: 0, remarks: 'Reconciled with 2B' },
        { key: 'journal', registerName: 'Journal Register', samplingTechnique: '100% Comprehensive Examination', vouched: 'Yes', sampleChecked: '100% all vouchers', totalVouchers: 0, auditedAmount: 0, remarks: 'Checked provisions' },
        { key: 'debit_credit_notes', registerName: 'Debit & Credit Notes', samplingTechnique: '100% Comprehensive Examination', vouched: 'Yes', sampleChecked: '100%', totalVouchers: 0, auditedAmount: 0, remarks: 'Matched with CDNR' },
        { key: 'bank_loans', registerName: 'Bank & Loan Statements', samplingTechnique: 'Systematic Selection (Interval Sampling)', vouched: 'Yes', sampleChecked: '100% statement lines', totalVouchers: 0, auditedAmount: 0, remarks: 'Interest verified' }
    ]);
    const [voucherSamples, setVoucherSamples] = useState<AuditVoucherSample[]>([]);
    const [isSamplingTally, setIsSamplingTally] = useState<boolean>(false);
    const [sampleDrawerOpen, setSampleDrawerOpen] = useState<boolean>(false);
    const [activeSampleRegisterKey, setActiveSampleRegisterKey] = useState<string | 'all'>('all');
    const [sampleSearchQuery, setSampleSearchQuery] = useState<string>('');
    const [sampleStatusFilter, setSampleStatusFilter] = useState<'all' | 'Pending' | 'Verified' | 'Query Raised' | 'Document Missing'>('all');
    const [activeVouchingRegisterTab, setActiveVouchingRegisterTab] = useState<'all' | 'sales' | 'purchase' | 'journal' | 'debit_credit_notes' | 'bank_loans'>('all');
    const [checklists, setChecklists] = useState<StandardChecklistItem[]>([]);
    const [verification, setVerification] = useState<FullAuditVerificationSnapshot>({
        sales: {
            booksTurnover: 0, r1Turnover: 0, gstr3bTurnover: 0, turnoverDifference: 0,
            taxBooks: 0, taxR1: 0, tax3b: 0, taxDifference: 0, isDrc01bTriggered: false,
            eInvoicingApplicable: false, taxAuditApplicable: false, remarks: '',
            monthlyMatrix: createInitialSales3WayMatrix()
        },
        purchase: {
            booksPurchases: 0, booksTax: 0, twoBPurchases: 0, twoBTax: 0,
            differencePurchases: 0, differenceTax: 0, missingIn2BCount: 0, missingIn2BAmount: 0,
            missingInBooksCount: 0, missingInBooksAmount: 0, sec16_4_RiskCount: 0,
            sec17_5_BlockedItcAmount: 0, eligibleItcClaimable: 0, remarks: '',
            monthlyMatrix: createInitialPurchase3WayMatrix()
        },
        journal: {
            suspenseEntriesCount: 0, suspenseAmount: 0, yearEndProvisionsCount: 0,
            yearEndProvisionsAmount: 0, tds194C_MissingPanCount: 0, tds194Q_HighVolumeCount: 0,
            tds194J_TechnicalCount: 0, form24Q_GrossSalaryBooks: 0, form24Q_GrossSalaryReturns: 0,
            salaryVariance: 0, remarks: '',
            tdsSectionMatrix: createDefaultTdsSectionMatrix()
        },
        bankLoans: {
            unreconciledChequesCount: 0, unreconciledAmount: 0, staleChequesCount: 0,
            loanAccountsCount: 0, totalPrincipalOutstanding: 0, interestServicingCheck: 'Serviced Regularly',
            form26AS_MismatchAmount: 0, aisSftHighValueMismatches: 0, remarks: '',
            facilities: createInitialBankFacilities()
        },
        rocLoans: {
            newLoansCount: 0, newLoansTotalAmount: 0, cashLoansSec269SS_Count: 0,
            formCHG1_PendingCount: 0, formCHG4_PendingCount: 0, remarks: '',
            loans: createInitialRocLoanCharges()
        },
        cashCompliance: {
            cashPaymentsExceeding10kCount: 0, cashPaymentsExceeding10kAmount: 0,
            negativeCashDaysCount: 0, minCashBalance: 0, provisionsCreatedCount: 0,
            provisionsReversedCount: 0, fixedAssetAdditionsCount: 0, fixedAssetIneligibleItcAmount: 0,
            remarks: ''
        },
        labor: {
            totalGrossSalary: 0, pfEmployeeShareCalculated: 0, pfEmployerShareCalculated: 0,
            pfAdminEdliCalculated: 0, pfTotalCalculated: 0, esicEmployeeShareCalculated: 0,
            esicEmployerShareCalculated: 0, esicTotalCalculated: 0, ptDeductedCalculated: 0,
            pfActualDepositDate: '', esicActualDepositDate: '', ptActualDepositDate: '',
            isPfDelayedSec36_1_va: false, isEsicDelayedSec36_1_va: false,
            permanentDisallowanceExposure: 0, remarks: ''
        }
    });
    const [observations, setObservations] = useState<AuditObservationItem[]>([]);
    const [pendingPoints, setPendingPoints] = useState<AuditPendingPointItem[]>([]);

    // ─── Maker-Checker Role & UI Tabs ──────────────────────────────────────────
    // Determines if the authenticated user has Senior CA Partner / Manager / Admin authority
    // Security: derived strictly from signed JWT claims rather than client-mutable localStorage flags
    const isSeniorUser = useMemo(() => {
        try {
            const claims = getSessionUserFromToken();
            if (!claims) return false;

            const jwtRole = String(claims.role || '').toLowerCase();
            const jwtDesig = String(claims.designation || '').toLowerCase();
            const jwtUsername = String(claims.username || '').toLowerCase();
            const isAdmin = jwtRole === 'admin';

            const combined = `${jwtRole} ${jwtDesig} ${jwtUsername}`;

            // Senior / Partner / Admin / Manager authority check
            return isAdmin ||
                combined.includes('admin') ||
                combined.includes('partner') ||
                combined.includes('senior') ||
                combined.includes('manager') ||
                combined.includes('principal');
        } catch {
            return false;
        }
    }, []);

    const [currentRole, setCurrentRole] = useState<'junior' | 'senior'>('junior');
    const [activeTab, setActiveTab] = useState<'scope' | 'profitability' | 'verification' | 'observations' | 'pending'>('scope');
    const [isNavDropdownOpen, setIsNavDropdownOpen] = useState(false);
    const [configuredFirmName, setConfiguredFirmName] = useState<string>('');

    const auditNavTabs = useMemo(() => [
        { id: 'scope' as const, label: '1. Basic Details & Scope', htmlLabel: '1. Basic Details &amp; Scope', icon: Building2, color: 'text-indigo-600' },
        { id: 'profitability' as const, label: '2. Profitability Status', htmlLabel: '2. Profitability Status', icon: TrendingUp, color: 'text-emerald-600' },
        { id: 'verification' as const, label: '3. Core Verification Workings (3.1–3.7)', htmlLabel: '3. Core Verification Workings (3.1–3.7)', icon: FileCheck2, color: 'text-indigo-600' },
        { id: 'observations' as const, label: '4. Current Period Observations', htmlLabel: '4. Current Period Observations', icon: AlertTriangle, color: 'text-amber-500', count: observations.length, countColor: 'bg-amber-100 text-amber-800' },
        { id: 'pending' as const, label: '5. Previous Audit Pending Points', htmlLabel: '5. Previous Audit Pending Points', icon: Clock, color: 'text-blue-600', count: pendingPoints.filter(p => p.status !== 'Cleared').length, countColor: 'bg-blue-100 text-blue-800' },
    ], [observations.length, pendingPoints]);

    const [verificationSubTab, setVerificationSubTab] = useState<'vouching' | 'gst' | 'sales' | 'purchase' | 'journal' | 'bank' | 'roc' | 'cash' | 'labor'>('gst');
    const [gstSubTab, setGstSubTab] = useState<'sales' | 'purchase'>('sales');
    const [isVerificationSubTabOpen, setIsVerificationSubTabOpen] = useState<boolean>(false);

    const isGstActive = verificationSubTab === 'gst' || verificationSubTab === 'sales' || verificationSubTab === 'purchase';
    const activeGstSubTab: 'sales' | 'purchase' = verificationSubTab === 'purchase' ? 'purchase' : (verificationSubTab === 'sales' ? 'sales' : gstSubTab);

    const verificationSubTabs = useMemo(() => [
        { 
            id: 'vouching' as const, 
            label: '3.0 Vouching Scope', 
            subtitle: '5 Core registers & sample checking checklist', 
            icon: Layers, 
            badge: 'Checklist', 
            color: 'text-indigo-600', 
            bg: 'bg-indigo-50' 
        },
        { 
            id: 'gst' as const, 
            label: 'GST Workings', 
            subtitle: 'Sales (Reco R1) & Purchase (Reco 2B)', 
            icon: FileSpreadsheet, 
            badge: 'GSTR-1 & 2B', 
            color: 'text-blue-600', 
            bg: 'bg-blue-50'
        },
        { 
            id: 'journal' as const, 
            label: '3.3 TDS Working', /* 3.3 Journal & TDS */
            subtitle: 'RCM liability & TDS 194C/J/Q/H/I deductions', 
            icon: FileCheck2, 
            badge: 'TDS & RCM', 
            color: 'text-purple-600', 
            bg: 'bg-purple-50' 
        },
        { 
            id: 'bank' as const, 
            label: '3.4 Bank, Loans & 26AS', 
            subtitle: '269SS/T loans, 26AS & AIS tax reconciliation', 
            icon: Landmark, 
            badge: 'Banking', 
            color: 'text-amber-600', 
            bg: 'bg-amber-50' 
        },
        { 
            id: 'roc' as const, 
            label: '3.5 ROC Charges', 
            subtitle: 'MCA charge registration & index of charges', 
            icon: Building2, 
            badge: 'MCA / ROC', 
            color: 'text-cyan-600', 
            bg: 'bg-cyan-50' 
        },
        { 
            id: 'cash' as const, 
            label: '3.6 Cash 40A(3) & FA', 
            subtitle: '40A(3) cash limits, 269ST & Fixed Assets', 
            icon: DollarSign, 
            badge: 'Tax Audit', 
            color: 'text-rose-600', 
            bg: 'bg-rose-50' 
        },
        { 
            id: 'labor' as const, 
            label: '3.7 Labor Compliances', 
            subtitle: 'PF / ESI / PT challans timely deposits', 
            icon: ShieldCheck, 
            badge: 'PF / ESI', 
            color: 'text-teal-600', 
            bg: 'bg-teal-50' 
        },
    ], []);
    const [salesMatrixViewMode, setSalesMatrixViewMode] = useState<'all' | 'books_r1' | 'books_3b' | 'drc01b'>('all');
    const [salesSelectedPeriod, setSalesSelectedPeriod] = useState<string>('active');
    const [purchaseMatrixViewMode, setPurchaseMatrixViewMode] = useState<'all' | 'books_2b' | 'books_3b' | 'drc01c'>('all');
    const [purchaseSelectedPeriod, setPurchaseSelectedPeriod] = useState<string>('active');
    const [pendingFilter, setPendingFilter] = useState<'All' | 'Pending' | 'In Progress' | 'Cleared'>('All');

    // ─── Excel Attachments State (Sales, Purchase & TDS Reco) ────────────────
    const salesFileInputRef = React.useRef<HTMLInputElement | null>(null);
    const purchaseFileInputRef = React.useRef<HTMLInputElement | null>(null);
    const tdsFileInputRef = React.useRef<HTMLInputElement | null>(null);
    const [salesLocalPathInput, setSalesLocalPathInput] = useState<string>('');
    const [purchaseLocalPathInput, setPurchaseLocalPathInput] = useState<string>('');
    const [tdsLocalPathInput, setTdsLocalPathInput] = useState<string>('');

    // ─── Profitability Status (Schedule III P&L) ──────────────────────────────
    const [profitability, setProfitability] = useState<ProfitabilityStatement>(DEFAULT_PROFITABILITY_STATEMENT);
    const [profitabilityFilePath, setProfitabilityFilePath] = useState<string>('');
    const [loadingProfitability, setLoadingProfitability] = useState<boolean>(false);
    const [showNotesGuidance, setShowNotesGuidance] = useState<boolean>(false);

    // ─── Tally & System State ──────────────────────────────────────────────────
    const [isTallyOnline, setIsTallyOnline] = useState<boolean>(false);
    const [isPingingTally, setIsPingingTally] = useState<boolean>(false);
    const [tallyPort, setTallyPort] = useState<number>(9000);
    const [tallyCompanyName, setTallyCompanyName] = useState<string>('');
    const [tallyGstin, setTallyGstin] = useState<string>('');
    const [tallyBooksFrom, setTallyBooksFrom] = useState<string>('');
    const [isTallyModalOpen, setIsTallyModalOpen] = useState<boolean>(false);
    const [isLoadingAudit, setIsLoadingAudit] = useState<boolean>(false);
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [isAutoPopulating, setIsAutoPopulating] = useState<boolean>(false);

    // ─── Modals State ──────────────────────────────────────────────────────────
    const [revisionModalOpen, setRevisionModalOpen] = useState(false);
    const [revisionNotes, setRevisionNotes] = useState('');
    const [releaseModalOpen, setReleaseModalOpen] = useState(false);
    const [releaseChannel, setReleaseChannel] = useState<'Directory' | 'WhatsApp' | 'Email'>('Directory');
    const [newObs, setNewObs] = useState({
        sectionKey: 'sales',
        title: '',
        description: '',
        severity: 'Medium' as 'Critical' | 'High' | 'Medium' | 'Low' | 'Info',
        riskCategory: 'GST Compliance',
        financialExposure: 0,
        voucherRef: '',
        auditorRecommendation: ''
    });
    const [resolveModalOpen, setResolveModalOpen] = useState(false);
    const [selectedPendingPoint, setSelectedPendingPoint] = useState<AuditPendingPointItem | null>(null);
    const [resolveStatus, setResolveStatus] = useState<'In Progress' | 'Cleared'>('Cleared');
    const [resolveRemarks, setResolveRemarks] = useState('');

    // ─── Firebase Cloud Sync & Senior Review Selection State ──────────────────
    const [submitReviewModalOpen, setSubmitReviewModalOpen] = useState(false);
    const [selectedSenior, setSelectedSenior] = useState('');
    const [customSeniorName, setCustomSeniorName] = useState('');
    const [submissionNotes, setSubmissionNotes] = useState('');
    const [reviewPriority, setReviewPriority] = useState<'Normal' | 'High' | 'Urgent (GST Deadline)'>('Normal');
    const [isSubmittingCloud, setIsSubmittingCloud] = useState(false);
    const [cloudAuditRecord, setCloudAuditRecord] = useState<CloudAuditRecord | null>(null);
    const [isCloudLive, setIsCloudLive] = useState(false);
    const [cloudSeniors, setCloudSeniors] = useState<Array<CloudSeniorAuditor>>([]);
    const [seniorQueueModalOpen, setSeniorQueueModalOpen] = useState(false);
    const [pendingReviewsQueue, setPendingReviewsQueue] = useState<CloudAuditRecord[]>([]);
    const [activeSeniorReviewer, setActiveSeniorReviewer] = useState<string>('ALL');
    const [queueSearchQuery, setQueueSearchQuery] = useState('');
    const [revisionSection, setRevisionSection] = useState('General Scrutiny / Overall Working Paper');
    const [revisionSeverity, setRevisionSeverity] = useState<'Mandatory Fix' | 'Clarification' | 'Advisory'>('Mandatory Fix');
    const [resolvedRevisionPoints, setResolvedRevisionPoints] = useState<Record<string, boolean>>({});

    // ─── Client Quick Add Modal State (Monthly Audit Master) ───────────────────
    const [isAddClientModalOpen, setIsAddClientModalOpen] = useState(false);
    const [newClientGstin, setNewClientGstin] = useState('');
    const [newClientLegalName, setNewClientLegalName] = useState('');
    const [newClientTradeName, setNewClientTradeName] = useState('');
    const [newClientPan, setNewClientPan] = useState('');
    const [newClientAddress, setNewClientAddress] = useState('');
    const [newClientEmail, setNewClientEmail] = useState('');
    const [newClientPhone, setNewClientPhone] = useState('');
    const [isSavingClient, setIsSavingClient] = useState(false);

    // Load Senior Auditors & Reviewers configured in Super Admin Portal
    useEffect(() => {
        let isMounted = true;
        fetchSeniorAuditorsFromCloud().then((seniors) => {
            if (isMounted && Array.isArray(seniors) && seniors.length > 0) {
                setCloudSeniors(seniors);
                // Pre-select first cloud senior if not already configured
                if (!auditHeader.reviewedBy) {
                    setSelectedSenior(seniors[0].name);
                    setAuditHeader(prev => ({ ...prev, reviewedBy: seniors[0].name }));
                }
            }
        }).catch((err) => {
            console.warn('[MonthlyAuditSuite] Could not load senior auditors from cloud:', err);
        });
        return () => { isMounted = false; };
    }, []);

    // Load CA Office Name / Firm Name from system config / Firebase
    useEffect(() => {
        let isMounted = true;
        safeApiFetch('/api/monthly-audits/firm-info')
            .then(res => res.json())
            .then(data => {
                if (isMounted && data && data.firmName) {
                    setConfiguredFirmName(data.firmName);
                    setAuditHeader(prev => {
                        if (!prev.firmName || prev.firmName.trim() === '') {
                            return { ...prev, firmName: data.firmName };
                        }
                        return prev;
                    });
                }
            })
            .catch(() => {});
        return () => { isMounted = false; };
    }, []);

    // Subscribe to Senior's real-time pending queue across all clients
    useEffect(() => {
        const unsubscribe = subscribeToSeniorPendingQueue(
            activeSeniorReviewer,
            (audits) => {
                setPendingReviewsQueue(audits);
            },
            (err) => {
                console.warn('[MonthlyAuditSuite] Pending queue listener error:', err);
            }
        );
        return () => { unsubscribe(); };
    }, [activeSeniorReviewer]);

    // Auto-detect logged-in user role from session / localStorage / active credentials
    useEffect(() => {
        try {
            const rawUser = localStorage.getItem('np_user') || sessionStorage.getItem('np_user') || localStorage.getItem('np_auth_user');
            if (rawUser) {
                const parsed = typeof rawUser === 'string' && rawUser.startsWith('{') ? JSON.parse(rawUser) : { username: rawUser };
                const nameStr = parsed.name || localStorage.getItem('np_user_name') || parsed.username || '';
                if (isSeniorUser) {
                    setCurrentRole('senior');
                    if (nameStr && !auditHeader.reviewedBy) {
                        setAuditHeader(prev => ({ ...prev, reviewedBy: nameStr }));
                    }
                } else {
                    if (nameStr && !auditHeader.preparedBy) {
                        setAuditHeader(prev => ({ ...prev, preparedBy: nameStr }));
                    }
                }
            }
        } catch {
            // keep default fallback
        }
    }, [isSeniorUser]);

    // Robust resolver to extract GSTIN, FY, Month, and Client Name from any audit record or ID
    const resolveAuditIdentifiers = (item: CloudAuditRecord) => {
        const cleanId = (item?.id || '').replace(/^audit_/i, '').replace(/^AUD_/i, '');
        const idParts = cleanId.split('_');
        const idGstinMatch = cleanId.match(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}/i);
        const nameGstinMatch = (item?.clientName || '').match(/[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}/i);

        const matchedClient = clients.find(c =>
            (c.legalName && item?.clientName && c.legalName.toLowerCase().trim() === item.clientName.toLowerCase().trim()) ||
            (c.tradeName && item?.clientName && c.tradeName.toLowerCase().trim() === item.clientName.toLowerCase().trim())
        );

        const targetGstin = (
            item?.clientGstin ||
            (item as any)?.client_gstin ||
            (item as any)?.gstin ||
            (item as any)?.clientId ||
            (item as any)?.client_id ||
            (idGstinMatch ? idGstinMatch[0].toUpperCase() : '') ||
            (nameGstinMatch ? nameGstinMatch[0].toUpperCase() : '') ||
            (matchedClient ? matchedClient.gstin : '') ||
            (idParts[0] && idParts[0].length >= 10 ? idParts[0].toUpperCase() : '') ||
            selectedClientGstin ||
            (clients[0] ? clients[0].gstin : '') ||
            ''
        ).trim().toUpperCase();

        const targetFy = (
            item?.fy ||
            (item as any)?.financialYear ||
            (idParts[1] && idParts[1].includes('-') ? idParts[1] : '') ||
            selectedFy ||
            '2026-27'
        ).trim();

        const targetMonth = (
            item?.month ||
            (idParts[2] ? idParts[2] : '') ||
            selectedMonth ||
            'April'
        ).trim();

        const targetClientName = item?.clientName || (item as any)?.client_name || matchedClient?.legalName || (targetGstin ? `Client (${targetGstin})` : 'Selected Client');

        return {
            targetGstin,
            targetFy,
            targetMonth,
            targetClientName
        };
    };

    // Helper to dismiss / delete an invalid or test cloud audit record from inbox
    const handleDismissCloudAudit = async (item: CloudAuditRecord) => {
        try {
            const toastId = toast.loading('Removing audit request from inbox...');
            await deleteAuditFromFirebase(item.id);
            setPendingReviewsQueue(prev => prev.filter(p => p.id !== item.id));
            toast.success('Audit request removed from review inbox', { id: toastId });
        } catch (err: any) {
            toast.error(`Could not remove request: ${err.message}`);
        }
    };

    // Direct 1-Click Accept & Sign-Off action from Senior Pending Inbox
    const handleDirectAcceptAndApprove = async (item: CloudAuditRecord) => {
        const { targetGstin: rawGstin, targetFy, targetMonth, targetClientName } = resolveAuditIdentifiers(item);
        let targetGstin = (rawGstin === 'UNKNOWN' ? '' : rawGstin).trim();

        // If record has no GSTIN (e.g. submitted before client was added)
        if (!targetGstin) {
            if (clients.length > 0) {
                targetGstin = selectedClientGstin || clients[0].gstin;
            }
        }

        if (!targetGstin) {
            toast.error('This audit was submitted without a client. Please add a client first, or click "Dismiss" to remove this request.', {
                duration: 6000
            });
            setSeniorQueueModalOpen(false);
            setIsAddClientModalOpen(true);
            return;
        }

        const seniorName = item?.reviewedBy || selectedSenior || (activeSeniorReviewer !== 'ALL' ? activeSeniorReviewer : '') || 'Senior CA Partner';
        const notes = 'Audit working papers verified and approved for client release.';
        const apiBase = getApiBase();

        // Dynamically register client in local clients list if not already present
        if (targetGstin && !clients.some(c => c.gstin === targetGstin)) {
            setClients(prev => [{
                gstin: targetGstin,
                legalName: targetClientName !== targetGstin && targetClientName !== 'No Client Selected' ? targetClientName : `Client (${targetGstin})`
            }, ...prev]);
        }

        const toastId = toast.loading(`Accepting & signing off ${targetClientName} (${targetMonth} ${targetFy})...`);
        setSeniorQueueModalOpen(false);

        try {
            const auditId = item.id || `audit_${targetGstin}_${targetFy}_${targetMonth}`.replace(/[^a-zA-Z0-9_-]/g, '_');

            // 1. Update SQLite backend with multiple lookup keys for guaranteed match
            await safeApiFetch(`/api/monthly-audits/${auditId}/senior-review`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'APPROVE',
                    reviewedBy: seniorName,
                    seniorReviewNotes: notes,
                    clientGstin: targetGstin,
                    fy: targetFy,
                    month: targetMonth
                })
            }).catch(() => {});

            // 2. Sync to Firebase Cloud with a 3.5s timeout guarantee so slow networks never hang
            const firebasePromise = approveAuditInFirebase({
                clientGstin: targetGstin,
                fy: targetFy,
                month: targetMonth,
                reviewedBy: seniorName,
                seniorReviewNotes: notes
            });
            const timeoutPromise = new Promise(resolve => setTimeout(() => resolve({ success: true, timeout: true }), 3500));
            await Promise.race([firebasePromise, timeoutPromise]).catch(() => {});

            // 3. Update header state and switch to this audit
            setSelectedClientGstin(targetGstin);
            setSelectedFy(targetFy);
            setSelectedMonth(targetMonth);
            setCurrentRole('senior');
            setAuditHeader(prev => ({
                ...prev,
                clientGstin: targetGstin,
                fy: targetFy,
                month: targetMonth,
                auditStatus: 'APPROVED',
                reviewedBy: seniorName,
                reviewedAt: Date.now()
            }));

            // 4. Update local pending queue immediately
            setPendingReviewsQueue(prev => prev.filter(p =>
                p.id !== item.id && !(
                    (p.clientGstin || (p as any).client_gstin) === targetGstin &&
                    p.fy === targetFy &&
                    p.month === targetMonth
                )
            ));

            toast.success(`Audit for ${targetClientName} (${targetMonth} ${targetFy}) Accepted & Signed Off!`, { id: toastId });
        } catch (err: any) {
            toast.error(`Approval failed: ${err.message}`, { id: toastId });
        }
    };

    // 1-Click Open & Review action from Senior Pending Inbox
    const handleAcceptAndReview = (item: CloudAuditRecord) => {
        const { targetGstin: rawGstin, targetFy, targetMonth, targetClientName } = resolveAuditIdentifiers(item);
        let targetGstin = (rawGstin === 'UNKNOWN' ? '' : rawGstin).trim();

        // If record has no GSTIN (e.g. submitted before client was added)
        if (!targetGstin) {
            if (clients.length > 0) {
                targetGstin = selectedClientGstin || clients[0].gstin;
            }
        }

        if (!targetGstin) {
            toast.error('This audit was submitted without a client. Please add a client first, or click "Dismiss" to remove this request.', {
                duration: 6000
            });
            setSeniorQueueModalOpen(false);
            setIsAddClientModalOpen(true);
            return;
        }

        const targetSenior = item?.reviewedBy || (item as any)?.reviewed_by || selectedSenior;

        // Dynamically register client in local clients list if not already present
        if (targetGstin && !clients.some(c => c.gstin === targetGstin)) {
            setClients(prev => [{
                gstin: targetGstin,
                legalName: targetClientName !== targetGstin && targetClientName !== 'No Client Selected' ? targetClientName : `Client (${targetGstin})`
            }, ...prev]);
        }

        setSelectedClientGstin(targetGstin);
        setSelectedFy(targetFy);
        setSelectedMonth(targetMonth);
        setCurrentRole('senior');
        setActiveTab('verification');
        if (targetSenior) {
            setSelectedSenior(targetSenior);
            setAuditHeader(prev => ({ ...prev, reviewedBy: targetSenior }));
        }
        setSeniorQueueModalOpen(false);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        toast.success(`Opened ${targetClientName} (${targetMonth} ${targetFy}) in Senior Review Mode`);
    };

    const activeClient = useMemo(() => {
        const found = clients.find(c => c.gstin === selectedClientGstin || (c.id && c.id === selectedClientGstin));
        if (found) return found;
        if (clients.length > 0 && !selectedClientGstin) return clients[0];
        let savedName = '';
        try {
            savedName = localStorage.getItem('monthly_audit_selected_client_name') || localStorage.getItem('np_company_name') || '';
        } catch {}
        return {
            id: 'temp_active',
            gstin: selectedClientGstin || '',
            legalName: savedName || tallyCompanyName || (selectedClientGstin ? `Client (${selectedClientGstin})` : 'Selected Client'),
            tradeName: savedName || tallyCompanyName || (selectedClientGstin ? `Client (${selectedClientGstin})` : 'Selected Client'),
            tallyCompanyName: tallyCompanyName || ''
        };
    }, [clients, selectedClientGstin, tallyCompanyName]);

    const filteredClients = useMemo(() => {
        if (!clientSearchQuery.trim()) return clients;
        const q = clientSearchQuery.toLowerCase();
        return clients.filter(c =>
            c.legalName.toLowerCase().includes(q) ||
            c.gstin.toLowerCase().includes(q) ||
            (c.tradeName && c.tradeName.toLowerCase().includes(q))
        );
    }, [clients, clientSearchQuery]);

    // ─── Available Financial Years (2026-27 onwards + any active/queued historical audit) ──
    const availableFinancialYears = useMemo(() => {
        const list = [...FINANCIAL_YEARS];
        if (selectedFy && !list.includes(selectedFy)) {
            list.unshift(selectedFy);
        }
        pendingReviewsQueue.forEach(p => {
            if (p.fy && !list.includes(p.fy)) {
                list.push(p.fy);
            }
        });
        return Array.from(new Set(list));
    }, [selectedFy, pendingReviewsQueue]);

    // ─── Senior CA Partner / Reviewer Options ─────────────────────────────────
    const availableSeniorOptions = useMemo(() => {
        const partners = new Set<string>();
        // 1. Super Admin Portal Configured Cloud Senior Auditors
        cloudSeniors.forEach(s => {
            if (s.name && s.name.trim()) partners.add(s.name.trim());
        });
        // 2. Audit Header specific partners
        if (auditHeader.partnerName && auditHeader.partnerName.trim()) {
            partners.add(auditHeader.partnerName.trim());
        }
        if (auditHeader.reviewedBy && auditHeader.reviewedBy.trim()) {
            partners.add(auditHeader.reviewedBy.trim());
        }
        if (Array.isArray(auditHeader.teamMembers)) {
            auditHeader.teamMembers.forEach((m: any) => {
                if (typeof m === 'object' && m && m.name) {
                    if (m.role?.includes('Partner') || m.role?.includes('Manager') || m.role?.includes('Senior')) {
                        partners.add(m.name.trim());
                    }
                }
            });
        }
        return Array.from(partners);
    }, [auditHeader.partnerName, auditHeader.reviewedBy, auditHeader.teamMembers, cloudSeniors]);

    // ─── Load Dedicated Monthly Audit Clients Master (Separate from GST) ─────────
    const fetchClients = useCallback(async () => {
        try {
            let clientList: any[] = [];
            try {
                const res = await safeApiFetch('/api/monthly-audit-clients');
                if (res.ok) {
                    const data = await res.json();
                    if (data && Array.isArray(data.clients)) {
                        clientList = data.clients;
                    }
                }
            } catch (cliErr) {
                console.warn('[MonthlyAuditSuite] /api/monthly-audit-clients fetch error:', cliErr);
            }

            if (clientList.length > 0) {
                const mapped = clientList.map((c: any) => ({
                    id: c.id,
                    gstin: c.gstin || c.id,
                    legalName: c.company_name || c.client_name || c.tally_company_name,
                    tradeName: c.tally_company_name || c.company_name || c.client_name,
                    tallyCompanyName: c.tally_company_name,
                    email: c.email,
                    phone: c.phone,
                    address: c.address,
                    pan: c.pan
                }));
                setClients(mapped);
                setSelectedClientGstin(prev => {
                    if (prev && mapped.some((m: any) => m.gstin === prev || m.id === prev)) {
                        return prev;
                    }
                    const savedGstin = localStorage.getItem('monthly_audit_selected_client');
                    if (savedGstin && mapped.some((m: any) => m.gstin === savedGstin || m.id === savedGstin)) {
                        return savedGstin;
                    }
                    return mapped[0].gstin;
                });
            } else {
                setClients([]);
            }
        } catch (err) {
            console.warn('[MonthlyAuditSuite] Could not load clients from server:', err);
        }
    }, []);

    const handleSelectClient = useCallback((c: { id?: string; gstin: string; legalName: string; tradeName?: string; tallyCompanyName?: string }) => {
        const clientIdentifier = c.gstin || c.id || '';
        setSelectedClientGstin(clientIdentifier);
        setIsClientDropdownOpen(false);
        const effectiveClientName = c.tallyCompanyName || c.tradeName || c.legalName;
        try {
            localStorage.setItem('monthly_audit_selected_client', clientIdentifier);
            localStorage.setItem('monthly_audit_selected_client_name', effectiveClientName);
            localStorage.setItem('np_company_name', effectiveClientName);
        } catch {}
        setAuditHeader(prev => ({
            ...prev,
            clientGstin: clientIdentifier,
            clientName: effectiveClientName
        }));
        window.dispatchEvent(new CustomEvent('client-selected', {
            detail: { gstin: clientIdentifier, legalName: c.legalName, tradeName: c.tradeName, tallyCompanyName: c.tallyCompanyName }
        }));
    }, []);

    useEffect(() => {
        fetchClients();
        const handleClientsUpdated = () => {
            fetchClients();
        };
        const handleClientSelected = (e: any) => {
            const { gstin, trade_name, legal_name, clientName, tallyCompanyName } = e.detail || {};
            if (gstin) {
                const cleanGstin = String(gstin).trim().toUpperCase();
                setSelectedClientGstin(cleanGstin);
                const name = tallyCompanyName || trade_name || legal_name || clientName;
                try {
                    localStorage.setItem('monthly_audit_selected_client', cleanGstin);
                    if (name) {
                        localStorage.setItem('monthly_audit_selected_client_name', name);
                        localStorage.setItem('np_company_name', name);
                    }
                } catch {}

                if (name) {
                    setAuditHeader(prev => ({
                        ...prev,
                        clientGstin: cleanGstin,
                        clientName: name
                    }));
                }
            }
        };
        window.addEventListener('clients-updated', handleClientsUpdated);
        window.addEventListener('client-selected', handleClientSelected);
        return () => {
            window.removeEventListener('clients-updated', handleClientsUpdated);
            window.removeEventListener('client-selected', handleClientSelected);
        };
    }, [fetchClients]);

    // ─── Monthly Audit Client Management (Add & Delete) ────────────────────────
    const handleSaveNewClient = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        const trimmedLegal = newClientLegalName.trim();
        const trimmedTrade = newClientTradeName.trim() || trimmedLegal;
        const trimmedGstin = newClientGstin.trim().toUpperCase();

        if (!trimmedLegal && !trimmedTrade) {
            toast.error('Please enter Client or Company Name');
            return;
        }
        if (trimmedGstin && trimmedGstin.length !== 15) {
            toast.error('GSTIN must be 15 characters (e.g. 27AAGCD4105L1ZO) or leave blank if non-GST');
            return;
        }

        setIsSavingClient(true);
        const loadingId = toast.loading(`Registering audit client "${trimmedTrade}"...`);
        try {
            const newId = `audit_cli_${Date.now()}`;
            const res = await safeApiFetch('/api/monthly-audit-clients', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    id: newId,
                    client_name: trimmedLegal,
                    company_name: trimmedTrade,
                    tally_company_name: trimmedTrade,
                    gstin: trimmedGstin,
                    pan: newClientPan.trim() || (trimmedGstin.length === 15 ? trimmedGstin.substring(2, 12) : undefined),
                    email: newClientEmail.trim() || undefined,
                    phone: newClientPhone.trim() || undefined,
                    address: newClientAddress.trim() || undefined
                })
            });

            if (res.ok) {
                toast.success(`Client "${trimmedTrade}" registered in Monthly Audit DB!`, { id: loadingId });
                const newClientObj = {
                    id: newId,
                    gstin: trimmedGstin || newId,
                    legalName: trimmedLegal,
                    tradeName: trimmedTrade,
                    tallyCompanyName: trimmedTrade,
                    email: newClientEmail.trim() || undefined,
                    phone: newClientPhone.trim() || undefined,
                    address: newClientAddress.trim() || undefined,
                    pan: newClientPan.trim() || undefined
                };

                setClients(prev => [newClientObj, ...prev.filter(c => c.id !== newId)]);
                setSelectedClientGstin(trimmedGstin || newId);
                setAuditHeader(prev => ({
                    ...prev,
                    clientName: trimmedTrade,
                    clientGstin: trimmedGstin || newId
                }));
                try {
                    localStorage.setItem('monthly_audit_selected_client', trimmedGstin || newId);
                    localStorage.setItem('monthly_audit_selected_client_name', trimmedTrade);
                    localStorage.setItem('np_company_name', trimmedTrade);
                } catch {}

                // Reset modal state
                setNewClientGstin('');
                setNewClientLegalName('');
                setNewClientTradeName('');
                setNewClientPan('');
                setNewClientAddress('');
                setNewClientEmail('');
                setNewClientPhone('');
                setIsAddClientModalOpen(false);
            } else {
                const errData = await res.json().catch(() => ({}));
                toast.error(errData.error || 'Failed to save client in Monthly Audit DB', { id: loadingId });
            }
        } catch (err: any) {
            toast.error(`Error saving client: ${err.message || err}`, { id: loadingId });
        } finally {
            setIsSavingClient(false);
        }
    };

    const handleDeleteClient = async (gstinOrId: string, legalName: string, clientId?: string) => {
        const idToDelete = clientId || gstinOrId;
        const ok = await confirm({
            title: 'Delete Monthly Audit Client?',
            message: `Are you sure you want to delete "${legalName}" from the Monthly Audit Client Master?`,
            confirmText: 'Delete Client',
            type: 'danger'
        });
        if (!ok) return;

        try {
            const res = await safeApiFetch(`/api/monthly-audit-clients/${encodeURIComponent(idToDelete)}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                toast.success(`Client "${legalName}" deleted from Monthly Audit master`);
                setClients(prev => prev.filter(c => (c.id ? c.id !== idToDelete : c.gstin !== idToDelete)));
                if (selectedClientGstin === gstinOrId || selectedClientGstin === idToDelete) {
                    const remaining = clients.filter(c => (c.id ? c.id !== idToDelete : c.gstin !== idToDelete));
                    if (remaining.length > 0) {
                        const nextClient = remaining[0];
                        setSelectedClientGstin(nextClient.gstin || nextClient.id || '');
                        setAuditHeader(prev => ({
                            ...prev,
                            clientName: nextClient.legalName || nextClient.tradeName,
                            clientGstin: nextClient.gstin || nextClient.id || ''
                        }));
                    } else {
                        setSelectedClientGstin('');
                        setAuditHeader(prev => ({ ...prev, clientName: '', clientGstin: '' }));
                    }
                }
            } else {
                toast.error('Could not delete client');
            }
        } catch (err: any) {
            toast.error(`Error deleting client: ${err.message || err}`);
        }
    };

    // ─── Live Tally XML Gateway & Active Company Extractor ──────────────────────
    const pingTally = useCallback(async (customPort?: number) => {
        const targetPort = customPort || tallyPort || 9000;
        setIsPingingTally(true);
        try {
            const res = await safeApiFetch('/api/tally/test-connection', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ port: targetPort })
            });
            const data = await res.json();
            const online = Boolean(data.success && data.isOnline);
            setIsTallyOnline(online);
            if (online) {
                const detectedCompany = data.companyName || '';
                setTallyCompanyName(detectedCompany);
                setTallyGstin(data.gstin || '');
                setTallyBooksFrom(data.booksFrom || '');

                // Automatically update auditHeader clientName so report reflects the live Tally company name!
                if (detectedCompany) {
                    setAuditHeader(prev => {
                        if (!prev.clientName || prev.clientName === 'Selected Client' || prev.clientName === 'Client Entity' || prev.clientName === 'No Client Selected') {
                            return {
                                ...prev,
                                clientName: detectedCompany,
                                clientGstin: data.gstin || prev.clientGstin
                            };
                        }
                        return prev;
                    });
                }
            } else {
                setIsTallyOnline(false);
                setTallyCompanyName('');
            }
            return data;
        } catch {
            setIsTallyOnline(false);
            setTallyCompanyName('');
            return { success: false, isOnline: false };
        } finally {
            setIsPingingTally(false);
        }
    }, [tallyPort]);

    const syncActiveTallyCompanyAsClient = useCallback(async () => {
        if (!tallyCompanyName) {
            toast.error('No active company detected from Tally Prime');
            return;
        }
        const toastId = toast.loading(`Setting "${tallyCompanyName}" as client on report...`);
        try {
            const res = await safeApiFetch('/api/monthly-audit-clients/sync-tally', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tally_company_name: tallyCompanyName,
                    gstin: tallyGstin,
                    financial_year: tallyBooksFrom
                })
            });
            const data = await res.json();
            if (data.success && data.client) {
                toast.success(`Client "${tallyCompanyName}" set on Report & saved to Monthly Audit DB!`, { id: toastId });
                await fetchClients();
                const targetGstin = data.client.gstin || data.client.id;
                setSelectedClientGstin(targetGstin);
                setAuditHeader(prev => ({
                    ...prev,
                    clientName: tallyCompanyName,
                    clientGstin: targetGstin
                }));
                try {
                    localStorage.setItem('monthly_audit_selected_client', targetGstin);
                    localStorage.setItem('monthly_audit_selected_client_name', tallyCompanyName);
                    localStorage.setItem('np_company_name', tallyCompanyName);
                } catch {}
            } else {
                toast.error(data.error || 'Could not sync Tally company', { id: toastId });
            }
        } catch (err: any) {
            toast.error(`Sync error: ${err.message || err}`, { id: toastId });
        }
    }, [tallyCompanyName, tallyGstin, tallyBooksFrom, fetchClients]);

    useEffect(() => {
        pingTally();
    }, [pingTally]);

    // ─── Fetch Monthly Audit & Pending Points ──────────────────────────────────
    const loadAudit = useCallback(async () => {
        if (!selectedClientGstin) return;
        setIsLoadingAudit(true);
        try {
            // 1. Fetch Month Audit Header
            const auditRes = await safeApiFetch(`/api/monthly-audits?client_gstin=${encodeURIComponent(selectedClientGstin)}&fy=${encodeURIComponent(selectedFy)}&month=${encodeURIComponent(selectedMonth)}`);
            if (auditRes.ok) {
                const auditsData = await auditRes.json();
                const audits = Array.isArray(auditsData) ? auditsData : (auditsData?.audits || []);
                if (Array.isArray(audits) && audits.length > 0) {
                    const found = audits[0];
                    let parsedTeam: any[] = [
                        { id: '1', name: 'CA Senior Partner', role: 'Engagement Partner', assignedAreas: 'Overall Sign-Off' },
                        { id: '2', name: 'Article Assistant', role: 'Lead Article Assistant', assignedAreas: 'Vouching & Reconciliation' }
                    ];
                    if (found.team_members) {
                        try {
                            const raw = typeof found.team_members === 'string' ? JSON.parse(found.team_members) : found.team_members;
                            if (Array.isArray(raw) && raw.length > 0) {
                                parsedTeam = raw.map((m: any, idx: number) => {
                                    if (typeof m === 'string') {
                                        return { id: `tm_${idx}`, name: m, role: 'Lead Article Assistant', assignedAreas: 'Vouching & Reconciliation' };
                                    }
                                    return {
                                        id: m.id || `tm_${idx}`,
                                        name: m.name || '',
                                        role: m.role || 'Audit Assistant',
                                        assignedAreas: m.assignedAreas || ''
                                    };
                                });
                            }
                        } catch {
                            parsedTeam = [{ id: '1', name: String(found.team_members), role: 'Audit Assistant', assignedAreas: 'Vouching' }];
                        }
                    }

                    let parsedMeta: any = {};
                    if (found.metadata) {
                        try {
                            parsedMeta = typeof found.metadata === 'string' ? JSON.parse(found.metadata) : found.metadata;
                        } catch {}
                    }

                    setAuditHeader({
                        id: found.id,
                        clientGstin: found.client_gstin,
                        clientName: found.client_name,
                        fy: found.fy,
                        month: found.month,
                        periodMode: parsedMeta.periodMode || (found.period_mode as any) || 'single',
                        selectedMonths: parsedMeta.selectedMonths || (found.selected_months as any) || [found.month || selectedMonth],
                        auditorName: found.auditor_name || parsedMeta.auditorName || '',
                        firmName: parsedMeta.firmName || found.firm_name || configuredFirmName || '',
                        firmRegistrationNo: parsedMeta.firmRegistrationNo || found.firm_registration_no || '',
                        membershipNo: parsedMeta.membershipNo || found.membership_no || '',
                        engagementRef: parsedMeta.engagementRef || found.engagement_ref || '',
                        auditStartDate: found.audit_start_date || '',
                        auditEndDate: found.audit_end_date || '',
                        teamMembers: parsedTeam,
                        auditType: found.audit_type || 'Monthly Statutory Audit',
                        turnoverIncGst: found.turnover_inc_gst || 0,
                        turnoverBooks: found.turnover_books || 0,
                        turnoverGst: found.turnover_gst || 0,
                        turnoverVariance: found.turnover_variance || 0,
                        status: found.status || 'Draft',
                        auditStatus: found.audit_status || 'DRAFT',
                        preparedBy: found.prepared_by || getLoggedInUserTitle() || '',
                        preparedAt: found.prepared_at,
                        reviewedBy: found.reviewed_by || '',
                        reviewedAt: found.reviewed_at,
                        seniorReviewNotes: found.senior_review_notes || '',
                        releasedBy: found.released_by || '',
                        releasedAt: found.released_at,
                        releaseChannel: found.release_channel || '',
                        metadata: parsedMeta,
                        createdAt: found.created_at,
                        updatedAt: found.updated_at
                    });

                    if (found.reviewed_by && found.reviewed_by.trim()) {
                        setSelectedSenior(found.reviewed_by.trim());
                    }

                    if (parsedMeta?.profitability) {
                        setProfitability(parsedMeta.profitability);
                    }

                    if (found.vouching_registers) {
                        try {
                            const parsedReg = typeof found.vouching_registers === 'string' ? JSON.parse(found.vouching_registers) : found.vouching_registers;
                            if (Array.isArray(parsedReg) && parsedReg.length > 0) {
                                setRegisters(parsedReg);
                            }
                        } catch {}
                    }

                    // Fetch detail sub-records
                    const detRes = await safeApiFetch(`/api/monthly-audits/${encodeURIComponent(found.id)}`);
                    if (detRes.ok) {
                        const det = await detRes.json();
                        if (det.checklists && det.checklists.length > 0) {
                            setChecklists(det.checklists.map((c: any) => ({
                                id: c.id,
                                sectionKey: c.section_key,
                                itemKey: c.item_key,
                                itemTitle: c.item_title,
                                status: c.status,
                                sampleChecked: c.sample_checked,
                                remarks: c.remarks || '',
                                amountInvolved: c.amount_involved || 0
                            })));
                        }
                        if (det.observations) {
                            setObservations(det.observations.map((o: any) => ({
                                id: o.id,
                                auditId: o.audit_id,
                                clientGstin: o.client_gstin,
                                sectionKey: o.section_key,
                                title: o.title,
                                description: o.description,
                                severity: o.severity,
                                riskCategory: o.risk_category || 'General',
                                financialExposure: o.financial_exposure || 0,
                                voucherRef: o.voucher_ref,
                                auditorRecommendation: o.auditor_recommendation,
                                managementResponse: o.management_response,
                                status: o.status,
                                createdAt: o.created_at,
                                updatedAt: o.updated_at
                            })));
                        }
                        if (det.voucherSamples && Array.isArray(det.voucherSamples)) {
                            setVoucherSamples(det.voucherSamples.map((s: any) => ({
                                id: s.id,
                                auditId: s.audit_id || s.auditId,
                                registerKey: s.register_key || s.registerKey,
                                registerName: s.register_name || s.registerName || s.register_key || 'Register',
                                voucherId: s.voucher_id || s.voucherId,
                                voucherType: s.voucher_type || s.voucherType,
                                voucherNumber: s.voucher_number || s.voucherNumber,
                                date: s.date,
                                partyName: s.party_name || s.partyName,
                                amount: Number(s.amount) || 0,
                                samplingRule: s.sampling_rule || s.samplingRule,
                                stratum: s.stratum,
                                status: s.status || 'Pending',
                                auditorRemarks: s.auditor_remarks || s.auditorRemarks || '',
                                supportingDocRef: s.supporting_doc_ref || s.supportingDocRef || '',
                                verifiedBy: s.verified_by || s.verifiedBy,
                                verifiedAt: s.verified_at || s.verifiedAt,
                                createdAt: s.created_at || s.createdAt,
                                updatedAt: s.updated_at || s.updatedAt
                            })));
                        }
                        if (det.verificationData) {
                            const vd = det.verificationData;
                            const safeParse = (val: any, fallback: any) => {
                                if (!val) return fallback;
                                try {
                                    return typeof val === 'string' ? JSON.parse(val) : val;
                                } catch {
                                    return fallback;
                                }
                            };
                            setVerification(prev => {
                                const parsedSales = safeParse(vd.sales_reco_data, prev.sales);
                                const parsedPurchase = safeParse(vd.purchase_reco_data, prev.purchase);
                                return {
                                    ...prev,
                                    sales: {
                                        ...prev.sales,
                                        ...parsedSales,
                                        monthlyMatrix: parsedSales?.monthlyMatrix && Array.isArray(parsedSales.monthlyMatrix) && parsedSales.monthlyMatrix.length === 12
                                            ? parsedSales.monthlyMatrix
                                            : (prev.sales?.monthlyMatrix || createInitialSales3WayMatrix()),
                                        excelAttachment: parsedSales?.excelAttachment || prev.sales?.excelAttachment
                                    },
                                    purchase: {
                                        ...prev.purchase,
                                        ...parsedPurchase,
                                        monthlyMatrix: parsedPurchase?.monthlyMatrix && Array.isArray(parsedPurchase.monthlyMatrix) && parsedPurchase.monthlyMatrix.length === 12
                                            ? parsedPurchase.monthlyMatrix
                                            : (prev.purchase?.monthlyMatrix || createInitialPurchase3WayMatrix()),
                                        excelAttachment: parsedPurchase?.excelAttachment || prev.purchase?.excelAttachment
                                    },
                                    journal: (() => {
                                        const parsedJournal = safeParse(vd.journal_reco_data, prev.journal);
                                        return {
                                            ...prev.journal,
                                            ...parsedJournal,
                                            excelAttachment: parsedJournal?.excelAttachment || prev.journal?.excelAttachment
                                        };
                                    })(),
                                    bankLoans: (() => {
                                        const parsedBank = safeParse(vd.bank_loan_data, prev.bankLoans);
                                        return {
                                            ...prev.bankLoans,
                                            ...parsedBank,
                                            facilities: parsedBank?.facilities && Array.isArray(parsedBank.facilities) && parsedBank.facilities.length > 0
                                                ? parsedBank.facilities
                                                : (prev.bankLoans?.facilities?.length ? prev.bankLoans.facilities : createInitialBankFacilities())
                                        };
                                    })(),
                                    rocLoans: (() => {
                                        const parsedRoc = safeParse(vd.roc_loan_data, prev.rocLoans);
                                        return {
                                            ...prev.rocLoans,
                                            ...parsedRoc,
                                            loans: parsedRoc?.loans && Array.isArray(parsedRoc.loans) && parsedRoc.loans.length > 0
                                                ? parsedRoc.loans
                                                : (prev.rocLoans?.loans?.length ? prev.rocLoans.loans : createInitialRocLoanCharges())
                                        };
                                    })(),
                                    cashCompliance: { ...prev.cashCompliance, ...safeParse(vd.cash_compliance_data, prev.cashCompliance) },
                                    labor: { ...prev.labor, ...safeParse(vd.statutory_compliance_data, prev.labor) }
                                };
                            });
                        }
                    }
                } else {
                    const fresh = initializeMonthlyAudit(selectedClientGstin, activeClient.legalName, selectedFy, selectedMonth);
                    const userTitle = getLoggedInUserTitle();
                    if (userTitle) fresh.preparedBy = userTitle;
                    if (configuredFirmName) fresh.firmName = configuredFirmName;
                    setAuditHeader(fresh);
                    setProfitability(createEmptyProfitabilityStatement(activeClient.legalName, '', '', `${selectedMonth} ${selectedFy}`));
                }
            }

            // 2. Fetch Cross-Month Pending Points
            const pendingRes = await safeApiFetch(`/api/audit-pending-points?client_gstin=${encodeURIComponent(selectedClientGstin)}`);
            if (pendingRes.ok) {
                const pointsData = await pendingRes.json();
                const points = Array.isArray(pointsData) ? pointsData : (pointsData?.points || []);
                if (Array.isArray(points)) {
                    setPendingPoints(points.map((p: any) => ({
                        id: p.id,
                        clientGstin: p.client_gstin,
                        clientName: p.client_name,
                        originAuditId: p.origin_audit_id,
                        originFy: p.origin_fy,
                        originMonth: p.origin_month,
                        pointTitle: p.point_title,
                        pointDescription: p.point_description,
                        category: p.category,
                        severity: p.severity,
                        status: p.status,
                        assignedTo: p.assigned_to,
                        targetDate: p.target_date,
                        resolutionRemarks: p.resolution_remarks,
                        resolvedInMonth: p.resolved_in_month,
                        verifiedBy: p.verified_by,
                        createdAt: p.created_at,
                        clearedAt: p.cleared_at,
                        updatedAt: p.updated_at
                    })));
                }
            }

            // 3. Fetch 12-Month overview statuses
            const allAuditsRes = await safeApiFetch(`/api/monthly-audits?client_gstin=${encodeURIComponent(selectedClientGstin)}&fy=${encodeURIComponent(selectedFy)}`);
            if (allAuditsRes.ok) {
                const allData = await allAuditsRes.json();
                const allList = Array.isArray(allData) ? allData : (allData?.audits || []);
                const statusMap: Record<string, string> = {};
                if (Array.isArray(allList)) {
                    allList.forEach((a: any) => {
                        if (a.month) {
                            statusMap[a.month] = a.audit_status || 'DRAFT';
                        }
                    });
                }
                setMonthStatuses(statusMap);
            }
        } catch (err) {
            console.error('[MonthlyAuditSuite] Error loading audit data:', err);
        } finally {
            setIsLoadingAudit(false);
        }
    }, [selectedClientGstin, selectedFy, selectedMonth, activeClient.legalName]);

    useEffect(() => {
        loadAudit();
    }, [loadAudit]);

    // ─── Firebase Real-Time Remote Sync ───────────────────────────────────────
    useEffect(() => {
        if (!selectedClientGstin || !selectedFy || !selectedMonth) return;

        setIsCloudLive(true);
        const unsubscribe = subscribeToCloudAudit(
            selectedClientGstin,
            selectedFy,
            selectedMonth,
            (cloudData) => {
                if (cloudData) {
                    setCloudAuditRecord(cloudData);
                    setAuditHeader(prev => {
                        let hasChange = false;
                        const next = { ...prev };
                        if (cloudData.auditStatus && cloudData.auditStatus !== prev.auditStatus) {
                            next.auditStatus = cloudData.auditStatus;
                            hasChange = true;
                            toast.info(`⚡ Firebase Cloud Update: Status is now "${cloudData.auditStatus}"`, {
                                description: cloudData.reviewedBy ? `Assigned to / Signed by: ${cloudData.reviewedBy}` : undefined
                            });
                        }
                        if (cloudData.reviewedBy && cloudData.reviewedBy !== prev.reviewedBy) {
                            next.reviewedBy = cloudData.reviewedBy;
                            setSelectedSenior(cloudData.reviewedBy);
                            hasChange = true;
                        }
                        if (cloudData.submissionNotes && cloudData.submissionNotes !== prev.generalSummary) {
                            next.generalSummary = cloudData.submissionNotes;
                            hasChange = true;
                        }
                        if (cloudData.seniorReviewNotes && cloudData.seniorReviewNotes !== prev.seniorReviewNotes) {
                            next.seniorReviewNotes = cloudData.seniorReviewNotes;
                            hasChange = true;
                        }
                        return hasChange ? next : prev;
                    });
                }
            },
            (err) => {
                console.warn('[Firebase Sync] Realtime listener error:', err);
                setIsCloudLive(false);
            }
        );

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, [selectedClientGstin, selectedFy, selectedMonth]);

    // ─── Engagement Team & Period Mode Handlers ────────────────────────────────
    const normalizedTeamMembers: AuditTeamMember[] = useMemo(() => {
        if (!auditHeader.teamMembers || !Array.isArray(auditHeader.teamMembers)) return [];
        return auditHeader.teamMembers.map((m, idx) => {
            if (typeof m === 'string') {
                return { id: `tm_${idx}`, name: m, role: 'Lead Article Assistant', assignedAreas: 'Vouching & Reconciliation' };
            }
            return {
                id: m.id || `tm_${idx}`,
                name: m.name || '',
                role: m.role || 'Audit Assistant',
                assignedAreas: m.assignedAreas || ''
            };
        });
    }, [auditHeader.teamMembers]);

    const handleAddTeamMember = () => {
        const newMember: AuditTeamMember = {
            id: `tm_${Date.now()}`,
            name: '',
            role: 'Audit Assistant',
            assignedAreas: 'Vouching & Core Verification'
        };
        setAuditHeader(prev => ({
            ...prev,
            teamMembers: [...(prev.teamMembers || []), newMember]
        }));
    };

    const handleUpdateTeamMember = (index: number, field: keyof AuditTeamMember, value: string) => {
        setAuditHeader(prev => {
            const list = [...(prev.teamMembers || [])].map((m, idx) => {
                if (typeof m === 'string') {
                    return { id: `tm_${idx}`, name: m, role: 'Lead Article Assistant', assignedAreas: 'Vouching' };
                }
                return { ...m };
            });
            if (list[index]) {
                list[index] = { ...list[index], [field]: value };
            }
            return { ...prev, teamMembers: list };
        });
    };

    const handleRemoveTeamMember = (index: number) => {
        if ((auditHeader.teamMembers?.length || 0) <= 1) {
            toast.warning('Audit engagement requires at least one team member');
            return;
        }
        setAuditHeader(prev => {
            const list = [...(prev.teamMembers || [])];
            list.splice(index, 1);
            return { ...prev, teamMembers: list };
        });
    };

    const handleToggleMonthInMultiMode = (month: string) => {
        const currentSelected = auditHeader.selectedMonths && auditHeader.selectedMonths.length > 0
            ? [...auditHeader.selectedMonths]
            : [selectedMonth];

        let updated: string[];
        if (currentSelected.includes(month)) {
            if (currentSelected.length === 1) {
                toast.warning('At least one month must remain in the audit scope');
                return;
            }
            updated = currentSelected.filter(m => m !== month);
        } else {
            updated = MONTHS.filter(m => currentSelected.includes(m) || m === month);
        }

        setAuditHeader(prev => ({
            ...prev,
            periodMode: 'multiple',
            selectedMonths: updated
        }));
    };

    const handleApplyPreset = (presetMonths: string[], label: string) => {
        setAuditHeader(prev => ({
            ...prev,
            periodMode: 'multiple',
            selectedMonths: [...presetMonths]
        }));
        toast.info(`Period scope set to ${label} (${presetMonths.length} months)`);
    };

    // ─── Profitability Status (Schedule III P&L) Handlers ──────────────────────
    const handleLoadProfitabilityFromFile = useCallback(async (customPath?: string) => {
        const target = customPath || profitabilityFilePath;
        if (!target) {
            toast.error('Please specify an Excel file path for the Profit & Loss statement');
            return;
        }
        setLoadingProfitability(true);
        try {
            const resp = await safeApiFetch(`/api/monthly-audits/profitability/from-file?filePath=${encodeURIComponent(target)}`);
            const data = await resp.json();
            if (data.success && data.statement) {
                setProfitability(data.statement);
                toast.success(
                    data.fromDefault
                        ? 'Loaded default Profitability Statement'
                        : `Loaded Profitability Statement from ${target}`
                );
            } else {
                toast.error(data.error || 'Failed to read profitability from file');
            }
        } catch (err: any) {
            toast.error(`Error loading profitability from file: ${err.message}`);
        } finally {
            setLoadingProfitability(false);
        }
    }, [profitabilityFilePath]);

    const handleUpdateProfitabilityItem = (field: keyof ProfitabilityStatement, val: any) => {
        setProfitability(prev => {
            const numFields: (keyof ProfitabilityStatement)[] = [
                'revenueFromOperations',
                'otherIncome',
                'costOfMaterialsConsumed',
                'changeInInventories',
                'employeeBenefitExpenses',
                'financeCosts',
                'depreciationAmortization',
                'otherExpenses'
            ];
            const updated = {
                ...prev,
                [field]: numFields.includes(field) ? (val === '' ? 0 : Number(val) || 0) : val
            };
            return calculateProfitability(updated);
        });
    };

    const handleUpdateProfitabilityRemark = (key: string, val: string) => {
        setProfitability(prev => ({
            ...prev,
            remarks: {
                ...(prev.remarks || {}),
                [key]: val
            }
        }));
    };

    const handleResetProfitability = () => {
        setProfitability(
            createEmptyProfitabilityStatement(
                activeClient.legalName,
                auditHeader.metadata?.cin || 'U45309PN2017PTC173221',
                '',
                `${selectedMonth} ${selectedFy}`
            )
        );
        toast.info('Statement reset to blank Schedule III template. Ready for junior manual entry.');
    };

    // ─── 3.1 Sales Register vs GSTR-1 vs GSTR-3B 12-Month Matrix Handlers ──────
    const handleUpdateSalesMatrixCell = (
        monthIndex: number,
        section: 'books' | 'gstr1' | 'gstr3b',
        field: keyof MonthlyTaxBreakdown,
        rawValue: string | number
    ) => {
        const val = rawValue === '' ? 0 : Number(rawValue) || 0;
        setVerification(prev => {
            const matrix = prev.sales?.monthlyMatrix && prev.sales.monthlyMatrix.length === 12
                ? [...prev.sales.monthlyMatrix]
                : createInitialSales3WayMatrix();

            const months = [
                'April', 'May', 'June', 'July', 'August', 'September',
                'October', 'November', 'December', 'January', 'February', 'March'
            ];

            const current = matrix[monthIndex] || {
                month: months[monthIndex],
                books: { taxable: 0, cgst: 0, sgst: 0, igst: 0, nilRated: 0, export: 0 },
                gstr1: { taxable: 0, cgst: 0, sgst: 0, igst: 0, nilRated: 0, export: 0 },
                gstr3b: { taxable: 0, cgst: 0, sgst: 0, igst: 0, nilRated: 0, export: 0 }
            };

            const updatedRow: MonthSales3WayRow = {
                ...current,
                [section]: {
                    ...current[section],
                    [field]: val
                }
            };
            matrix[monthIndex] = updatedRow;

            // Recalculate full FY totals from matrix
            let totalBooksTaxable = 0;
            let totalBooksTax = 0;
            let totalR1Taxable = 0;
            let totalR1Tax = 0;
            let total3bTaxable = 0;
            let total3bTax = 0;

            matrix.forEach(row => {
                totalBooksTaxable += row.books?.taxable || 0;
                totalBooksTax += (row.books?.cgst || 0) + (row.books?.sgst || 0) + (row.books?.igst || 0);

                totalR1Taxable += row.gstr1?.taxable || 0;
                totalR1Tax += (row.gstr1?.cgst || 0) + (row.gstr1?.sgst || 0) + (row.gstr1?.igst || 0);

                total3bTaxable += row.gstr3b?.taxable || 0;
                total3bTax += (row.gstr3b?.cgst || 0) + (row.gstr3b?.sgst || 0) + (row.gstr3b?.igst || 0);
            });

            const turnoverDiff = Math.abs(totalBooksTaxable - totalR1Taxable);
            const taxDiff = Math.abs(totalR1Tax - total3bTax);
            const taxThresholdPct = total3bTax > 0 ? (taxDiff / total3bTax) * 100 : 0;
            const isDrc01b = (totalR1Tax > total3bTax) && (taxDiff > 25000 || taxThresholdPct > 20);

            return {
                ...prev,
                sales: {
                    ...prev.sales,
                    monthlyMatrix: matrix,
                    booksTurnover: totalBooksTaxable > 0 ? totalBooksTaxable : prev.sales.booksTurnover,
                    r1Turnover: totalR1Taxable > 0 ? totalR1Taxable : prev.sales.r1Turnover,
                    gstr3bTurnover: total3bTaxable > 0 ? total3bTaxable : prev.sales.gstr3bTurnover,
                    turnoverDifference: totalBooksTaxable > 0 || totalR1Taxable > 0 ? turnoverDiff : prev.sales.turnoverDifference,
                    taxBooks: totalBooksTax > 0 ? totalBooksTax : prev.sales.taxBooks,
                    taxR1: totalR1Tax > 0 ? totalR1Tax : prev.sales.taxR1,
                    tax3b: total3bTax > 0 ? total3bTax : prev.sales.tax3b,
                    taxDifference: totalR1Tax > 0 || total3bTax > 0 ? taxDiff : prev.sales.taxDifference,
                    isDrc01bTriggered: isDrc01b,
                    drc01bReason: isDrc01b
                        ? `GSTR-1 tax exceeds GSTR-3B by ₹${taxDiff.toLocaleString('en-IN')} (${taxThresholdPct.toFixed(1)}%). Statutory DRC-01B scrutiny notice risk.`
                        : undefined,
                    eInvoicingApplicable: (totalBooksTaxable > 0 ? totalBooksTaxable : prev.sales.booksTurnover) > 50000000,
                    taxAuditApplicable: (totalBooksTaxable > 0 ? totalBooksTaxable : prev.sales.booksTurnover) > 100000000
                }
            };
        });
    };

    const handleSeedActiveMonthIntoSalesMatrix = () => {
        const months = [
            'April', 'May', 'June', 'July', 'August', 'September',
            'October', 'November', 'December', 'January', 'February', 'March'
        ];
        const monthIndex = months.findIndex(m => m.toLowerCase() === selectedMonth.toLowerCase());
        if (monthIndex < 0) {
            toast.warning(`Month "${selectedMonth}" not found in FY calendar`);
            return;
        }

        setVerification(prev => {
            const matrix = prev.sales?.monthlyMatrix && prev.sales.monthlyMatrix.length === 12
                ? [...prev.sales.monthlyMatrix]
                : createInitialSales3WayMatrix();

            const current = matrix[monthIndex] || {
                month: months[monthIndex],
                books: { taxable: 0, cgst: 0, sgst: 0, igst: 0, nilRated: 0, export: 0 },
                gstr1: { taxable: 0, cgst: 0, sgst: 0, igst: 0, nilRated: 0, export: 0 },
                gstr3b: { taxable: 0, cgst: 0, sgst: 0, igst: 0, nilRated: 0, export: 0 }
            };

            const booksTax = prev.sales.taxBooks || Math.round(prev.sales.booksTurnover * 0.18);
            const r1Tax = prev.sales.taxR1 || Math.round(prev.sales.r1Turnover * 0.18);
            const tax3b = prev.sales.tax3b || Math.round(prev.sales.gstr3bTurnover * 0.18);

            matrix[monthIndex] = {
                ...current,
                books: {
                    ...current.books,
                    taxable: prev.sales.booksTurnover || current.books.taxable,
                    cgst: current.books.cgst || Math.round(booksTax / 2),
                    sgst: current.books.sgst || Math.round(booksTax / 2)
                },
                gstr1: {
                    ...current.gstr1,
                    taxable: prev.sales.r1Turnover || current.gstr1.taxable,
                    cgst: current.gstr1.cgst || Math.round(r1Tax / 2),
                    sgst: current.gstr1.sgst || Math.round(r1Tax / 2)
                },
                gstr3b: {
                    ...current.gstr3b,
                    taxable: prev.sales.gstr3bTurnover || current.gstr3b.taxable,
                    cgst: current.gstr3b.cgst || Math.round(tax3b / 2),
                    sgst: current.gstr3b.sgst || Math.round(tax3b / 2)
                }
            };

            toast.success(`Populated ${selectedMonth} values from active audit summary into 3-way matrix!`);
            return {
                ...prev,
                sales: {
                    ...prev.sales,
                    monthlyMatrix: matrix
                }
            };
        });
    };

    const handleResetSalesMatrix = () => {
        setVerification(prev => ({
            ...prev,
            sales: {
                ...prev.sales,
                monthlyMatrix: createInitialSales3WayMatrix()
            }
        }));
        toast.info('Sales Register vs GSTR-1 vs GSTR-3B matrix cleared. Ready for junior manual entry.');
    };

    const handleUpdateSalesRemarks = (remarks: string) => {
        setVerification(prev => ({
            ...prev,
            sales: {
                ...prev.sales,
                remarks
            }
        }));
    };

    // ─── Sales Excel Working Paper Attachment Handlers ────────────────────────
    const handleSalesFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const arrayBuffer = evt.target?.result as ArrayBuffer;
                let sheetNames: string[] = [];
                try {
                    const wb = XLSX.read(arrayBuffer, { type: 'array' });
                    sheetNames = wb.SheetNames || [];
                } catch (parseErr) {
                    console.warn('[MonthlyAuditSuite] Could not read sheet names from uploaded file:', parseErr);
                }

                const uint8 = new Uint8Array(arrayBuffer);
                let binary = '';
                const len = uint8.byteLength;
                const chunkSize = 0x8000;
                for (let i = 0; i < len; i += chunkSize) {
                    binary += String.fromCharCode.apply(null, uint8.subarray(i, i + chunkSize) as any);
                }
                const base64Data = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${btoa(binary)}`;

                const attachment: AuditExcelAttachment = {
                    fileName: file.name,
                    fileSize: file.size,
                    uploadedAt: new Date().toLocaleString('en-IN'),
                    uploadedBy: auditHeader.preparedBy || 'Junior Auditor',
                    fileData: base64Data,
                    sheetNames
                };

                setVerification(prev => ({
                    ...prev,
                    sales: {
                        ...prev.sales,
                        excelAttachment: attachment
                    }
                }));

                toast.success(`Sales Excel working sheet "${file.name}" attached successfully!`);
            } catch (err: any) {
                toast.error(`Failed to process Excel attachment: ${err.message}`);
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const handleLinkSalesLocalPath = () => {
        if (!salesLocalPathInput.trim()) {
            toast.warning('Please enter a valid file path (e.g. E:\\Sales_Register.xlsx)');
            return;
        }
        const cleaned = salesLocalPathInput.trim();
        const fileName = cleaned.split(/[\/\\]/).pop() || cleaned;

        const attachment: AuditExcelAttachment = {
            fileName,
            filePath: cleaned,
            uploadedAt: new Date().toLocaleString('en-IN'),
            uploadedBy: auditHeader.preparedBy || 'Junior Auditor'
        };

        setVerification(prev => ({
            ...prev,
            sales: {
                ...prev.sales,
                excelAttachment: attachment
            }
        }));

        setSalesLocalPathInput('');
        toast.success(`Linked Sales Excel working path: ${fileName}`);
    };

    const handleRemoveSalesAttachment = () => {
        setVerification(prev => ({
            ...prev,
            sales: {
                ...prev.sales,
                excelAttachment: undefined
            }
        }));
        if (salesFileInputRef.current) {
            salesFileInputRef.current.value = '';
        }
        toast.info('Sales Excel attachment removed');
    };

    const handleDownloadSalesAttachment = () => {
        const att = verification?.sales?.excelAttachment;
        if (!att) return;

        if (att.fileData) {
            const a = document.createElement('a');
            a.href = att.fileData;
            a.download = att.fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            toast.success(`Downloaded "${att.fileName}"`);
        } else if (att.filePath) {
            toast.info(`Working file is linked to local disk: ${att.filePath}`);
        }
    };

    const matrixData = useMemo(() => {
        const list = verification?.sales?.monthlyMatrix && verification.sales.monthlyMatrix.length === 12
            ? verification.sales.monthlyMatrix
            : createInitialSales3WayMatrix();
        return list;
    }, [verification?.sales?.monthlyMatrix]);

    const matrixTotals = useMemo(() => {
        const list = verification?.sales?.monthlyMatrix && verification.sales.monthlyMatrix.length === 12
            ? verification.sales.monthlyMatrix
            : createInitialSales3WayMatrix();

        const totals = {
            books: { taxable: 0, cgst: 0, sgst: 0, igst: 0, nilRated: 0, export: 0, totalTax: 0 },
            gstr1: { taxable: 0, cgst: 0, sgst: 0, igst: 0, nilRated: 0, export: 0, totalTax: 0 },
            diffR1: { taxable: 0, cgst: 0, sgst: 0, igst: 0, nilRated: 0, export: 0, totalTax: 0 },
            gstr3b: { taxable: 0, cgst: 0, sgst: 0, igst: 0, nilRated: 0, export: 0, totalTax: 0 },
            diff3b: { taxable: 0, cgst: 0, sgst: 0, igst: 0, nilRated: 0, export: 0, totalTax: 0 },
            diffDrc: { taxable: 0, cgst: 0, sgst: 0, igst: 0, nilRated: 0, export: 0, totalTax: 0 }
        };

        list.forEach(row => {
            // Books
            totals.books.taxable += row.books?.taxable || 0;
            totals.books.cgst += row.books?.cgst || 0;
            totals.books.sgst += row.books?.sgst || 0;
            totals.books.igst += row.books?.igst || 0;
            totals.books.nilRated += row.books?.nilRated || 0;
            totals.books.export += row.books?.export || 0;
            totals.books.totalTax += (row.books?.cgst || 0) + (row.books?.sgst || 0) + (row.books?.igst || 0);

            // GSTR-1
            totals.gstr1.taxable += row.gstr1?.taxable || 0;
            totals.gstr1.cgst += row.gstr1?.cgst || 0;
            totals.gstr1.sgst += row.gstr1?.sgst || 0;
            totals.gstr1.igst += row.gstr1?.igst || 0;
            totals.gstr1.nilRated += row.gstr1?.nilRated || 0;
            totals.gstr1.export += row.gstr1?.export || 0;
            totals.gstr1.totalTax += (row.gstr1?.cgst || 0) + (row.gstr1?.sgst || 0) + (row.gstr1?.igst || 0);

            // Diff R1 (Books - GSTR-1)
            totals.diffR1.taxable += (row.books?.taxable || 0) - (row.gstr1?.taxable || 0);
            totals.diffR1.cgst += (row.books?.cgst || 0) - (row.gstr1?.cgst || 0);
            totals.diffR1.sgst += (row.books?.sgst || 0) - (row.gstr1?.sgst || 0);
            totals.diffR1.igst += (row.books?.igst || 0) - (row.gstr1?.igst || 0);
            totals.diffR1.nilRated += (row.books?.nilRated || 0) - (row.gstr1?.nilRated || 0);
            totals.diffR1.export += (row.books?.export || 0) - (row.gstr1?.export || 0);
            totals.diffR1.totalTax += ((row.books?.cgst || 0) + (row.books?.sgst || 0) + (row.books?.igst || 0)) -
                ((row.gstr1?.cgst || 0) + (row.gstr1?.sgst || 0) + (row.gstr1?.igst || 0));

            // GSTR-3B
            totals.gstr3b.taxable += row.gstr3b?.taxable || 0;
            totals.gstr3b.cgst += row.gstr3b?.cgst || 0;
            totals.gstr3b.sgst += row.gstr3b?.sgst || 0;
            totals.gstr3b.igst += row.gstr3b?.igst || 0;
            totals.gstr3b.nilRated += row.gstr3b?.nilRated || 0;
            totals.gstr3b.export += row.gstr3b?.export || 0;
            totals.gstr3b.totalTax += (row.gstr3b?.cgst || 0) + (row.gstr3b?.sgst || 0) + (row.gstr3b?.igst || 0);

            // Diff 3B (Books - GSTR-3B)
            totals.diff3b.taxable += (row.books?.taxable || 0) - (row.gstr3b?.taxable || 0);
            totals.diff3b.cgst += (row.books?.cgst || 0) - (row.gstr3b?.cgst || 0);
            totals.diff3b.sgst += (row.books?.sgst || 0) - (row.gstr3b?.sgst || 0);
            totals.diff3b.igst += (row.books?.igst || 0) - (row.gstr3b?.igst || 0);
            totals.diff3b.nilRated += (row.books?.nilRated || 0) - (row.gstr3b?.nilRated || 0);
            totals.diff3b.export += (row.books?.export || 0) - (row.gstr3b?.export || 0);
            totals.diff3b.totalTax += ((row.books?.cgst || 0) + (row.books?.sgst || 0) + (row.books?.igst || 0)) -
                ((row.gstr3b?.cgst || 0) + (row.gstr3b?.sgst || 0) + (row.gstr3b?.igst || 0));

            // Diff DRC (GSTR-1 - GSTR-3B)
            totals.diffDrc.taxable += (row.gstr1?.taxable || 0) - (row.gstr3b?.taxable || 0);
            totals.diffDrc.cgst += (row.gstr1?.cgst || 0) - (row.gstr3b?.cgst || 0);
            totals.diffDrc.sgst += (row.gstr1?.sgst || 0) - (row.gstr3b?.sgst || 0);
            totals.diffDrc.igst += (row.gstr1?.igst || 0) - (row.gstr3b?.igst || 0);
            totals.diffDrc.nilRated += (row.gstr1?.nilRated || 0) - (row.gstr3b?.nilRated || 0);
            totals.diffDrc.export += (row.gstr1?.export || 0) - (row.gstr3b?.export || 0);
            totals.diffDrc.totalTax += ((row.gstr1?.cgst || 0) + (row.gstr1?.sgst || 0) + (row.gstr1?.igst || 0)) -
                ((row.gstr3b?.cgst || 0) + (row.gstr3b?.sgst || 0) + (row.gstr3b?.igst || 0));
        });

        return totals;
    }, [verification?.sales?.monthlyMatrix]);

    // ─── 3.2 Purchase Register vs GSTR-2B Inward ITC 12-Month Matrix Handlers ──
    const handleUpdatePurchaseMatrixCell = (
        monthIndex: number,
        section: 'books' | 'gstr2b' | 'gstr3b',
        field: keyof MonthlyPurchaseTaxBreakdown,
        rawValue: string | number
    ) => {
        const val = rawValue === '' ? 0 : Number(rawValue) || 0;
        setVerification(prev => {
            const matrix = prev.purchase?.monthlyMatrix && prev.purchase.monthlyMatrix.length === 12
                ? [...prev.purchase.monthlyMatrix]
                : createInitialPurchase3WayMatrix();

            const months = [
                'April', 'May', 'June', 'July', 'August', 'September',
                'October', 'November', 'December', 'January', 'February', 'March'
            ];

            const current = matrix[monthIndex] || {
                month: months[monthIndex],
                books: { cgst: 0, sgst: 0, igst: 0, cess: 0, nilRated: 0 },
                gstr2b: { cgst: 0, sgst: 0, igst: 0, cess: 0, nilRated: 0 },
                gstr3b: { cgst: 0, sgst: 0, igst: 0, cess: 0, nilRated: 0 }
            };

            const updatedRow: MonthPurchase3WayRow = {
                ...current,
                [section]: {
                    ...current[section],
                    [field]: val
                }
            };
            matrix[monthIndex] = updatedRow;

            // Recalculate full FY tax totals from matrix
            let totalBooksTax = 0;
            let total2bTax = 0;
            let total3bTax = 0;

            matrix.forEach(row => {
                totalBooksTax += (row.books?.cgst || 0) + (row.books?.sgst || 0) + (row.books?.igst || 0) + (row.books?.cess || 0);
                total2bTax += (row.gstr2b?.cgst || 0) + (row.gstr2b?.sgst || 0) + (row.gstr2b?.igst || 0) + (row.gstr2b?.cess || 0);
                total3bTax += (row.gstr3b?.cgst || 0) + (row.gstr3b?.sgst || 0) + (row.gstr3b?.igst || 0) + (row.gstr3b?.cess || 0);
            });

            const taxDiff = Math.abs(total3bTax - total2bTax);
            const taxThresholdPct = total2bTax > 0 ? (taxDiff / total2bTax) * 100 : 0;
            const isDrc01c = (total3bTax > total2bTax) && (taxDiff > 25000 || taxThresholdPct > 20);

            return {
                ...prev,
                purchase: {
                    ...prev.purchase,
                    monthlyMatrix: matrix,
                    booksTax: totalBooksTax > 0 ? totalBooksTax : prev.purchase.booksTax,
                    twoBTax: total2bTax > 0 ? total2bTax : prev.purchase.twoBTax,
                    tax3b: total3bTax > 0 ? total3bTax : prev.purchase.tax3b,
                    taxDifference: taxDiff,
                    isDrc01cTriggered: isDrc01c,
                    drc01cReason: isDrc01c
                        ? `GSTR-3B ITC claimed exceeds GSTR-2B by ₹${taxDiff.toLocaleString('en-IN')} (${taxThresholdPct.toFixed(1)}%). Statutory Rule 88D / Form DRC-01C notice risk.`
                        : undefined
                }
            };
        });
    };

    const handleSeedActiveMonthIntoPurchaseMatrix = () => {
        const months = [
            'April', 'May', 'June', 'July', 'August', 'September',
            'October', 'November', 'December', 'January', 'February', 'March'
        ];
        const monthIndex = months.findIndex(m => m.toLowerCase() === selectedMonth.toLowerCase());
        if (monthIndex < 0) {
            toast.warning(`Month "${selectedMonth}" not found in FY calendar`);
            return;
        }

        setVerification(prev => {
            const matrix = prev.purchase?.monthlyMatrix && prev.purchase.monthlyMatrix.length === 12
                ? [...prev.purchase.monthlyMatrix]
                : createInitialPurchase3WayMatrix();

            const current = matrix[monthIndex] || {
                month: months[monthIndex],
                books: { cgst: 0, sgst: 0, igst: 0, cess: 0, nilRated: 0 },
                gstr2b: { cgst: 0, sgst: 0, igst: 0, cess: 0, nilRated: 0 },
                gstr3b: { cgst: 0, sgst: 0, igst: 0, cess: 0, nilRated: 0 }
            };

            const booksTax = prev.purchase.booksTax || 0;
            const twoBTax = prev.purchase.twoBTax || 0;
            const tax3b = prev.purchase.tax3b || twoBTax;

            matrix[monthIndex] = {
                ...current,
                books: {
                    ...current.books,
                    cgst: current.books.cgst || Math.round(booksTax / 2),
                    sgst: current.books.sgst || Math.round(booksTax / 2)
                },
                gstr2b: {
                    ...current.gstr2b,
                    cgst: current.gstr2b.cgst || Math.round(twoBTax / 2),
                    sgst: current.gstr2b.sgst || Math.round(twoBTax / 2)
                },
                gstr3b: {
                    ...current.gstr3b,
                    cgst: current.gstr3b.cgst || Math.round(tax3b / 2),
                    sgst: current.gstr3b.sgst || Math.round(tax3b / 2)
                }
            };

            toast.success(`Populated ${selectedMonth} values from active audit summary into Purchase 3-way matrix!`);
            return {
                ...prev,
                purchase: {
                    ...prev.purchase,
                    monthlyMatrix: matrix
                }
            };
        });
    };

    const handleResetPurchaseMatrix = () => {
        setVerification(prev => ({
            ...prev,
            purchase: {
                ...prev.purchase,
                monthlyMatrix: createInitialPurchase3WayMatrix()
            }
        }));
        toast.info('Purchase Register vs GSTR-2B matrix cleared. Ready for junior manual entry.');
    };

    const handleUpdatePurchaseRemarks = (remarks: string) => {
        setVerification(prev => ({
            ...prev,
            purchase: {
                ...prev.purchase,
                remarks
            }
        }));
    };

    // ─── Purchase Excel Working Paper Attachment Handlers ─────────────────────
    const handlePurchaseFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const arrayBuffer = evt.target?.result as ArrayBuffer;
                let sheetNames: string[] = [];
                try {
                    const wb = XLSX.read(arrayBuffer, { type: 'array' });
                    sheetNames = wb.SheetNames || [];
                } catch (parseErr) {
                    console.warn('[MonthlyAuditSuite] Could not read sheet names from uploaded file:', parseErr);
                }

                const uint8 = new Uint8Array(arrayBuffer);
                let binary = '';
                const len = uint8.byteLength;
                const chunkSize = 0x8000;
                for (let i = 0; i < len; i += chunkSize) {
                    binary += String.fromCharCode.apply(null, uint8.subarray(i, i + chunkSize) as any);
                }
                const base64Data = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${btoa(binary)}`;

                const attachment: AuditExcelAttachment = {
                    fileName: file.name,
                    fileSize: file.size,
                    uploadedAt: new Date().toLocaleString('en-IN'),
                    uploadedBy: auditHeader.preparedBy || 'Junior Auditor',
                    fileData: base64Data,
                    sheetNames
                };

                setVerification(prev => ({
                    ...prev,
                    purchase: {
                        ...prev.purchase,
                        excelAttachment: attachment
                    }
                }));

                toast.success(`Purchase & 2B Excel working sheet "${file.name}" attached successfully!`);
            } catch (err: any) {
                toast.error(`Failed to process Excel attachment: ${err.message}`);
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const handleLinkPurchaseLocalPath = () => {
        if (!purchaseLocalPathInput.trim()) {
            toast.warning('Please enter a valid file path (e.g. E:\\Purchase_Register.xlsx)');
            return;
        }
        const cleaned = purchaseLocalPathInput.trim();
        const fileName = cleaned.split(/[\/\\]/).pop() || cleaned;

        const attachment: AuditExcelAttachment = {
            fileName,
            filePath: cleaned,
            uploadedAt: new Date().toLocaleString('en-IN'),
            uploadedBy: auditHeader.preparedBy || 'Junior Auditor'
        };

        setVerification(prev => ({
            ...prev,
            purchase: {
                ...prev.purchase,
                excelAttachment: attachment
            }
        }));

        setPurchaseLocalPathInput('');
        toast.success(`Linked Purchase Excel working path: ${fileName}`);
    };

    const handleRemovePurchaseAttachment = () => {
        setVerification(prev => ({
            ...prev,
            purchase: {
                ...prev.purchase,
                excelAttachment: undefined
            }
        }));
        if (purchaseFileInputRef.current) {
            purchaseFileInputRef.current.value = '';
        }
        toast.info('Purchase Excel attachment removed');
    };

    const handleDownloadPurchaseAttachment = () => {
        const att = verification?.purchase?.excelAttachment;
        if (!att) return;

        if (att.fileData) {
            const a = document.createElement('a');
            a.href = att.fileData;
            a.download = att.fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            toast.success(`Downloaded "${att.fileName}"`);
        } else if (att.filePath) {
            toast.info(`Working file is linked to local disk: ${att.filePath}`);
        }
    };

    const purchaseMatrixData = useMemo(() => {
        const list = verification?.purchase?.monthlyMatrix && verification.purchase.monthlyMatrix.length === 12
            ? verification.purchase.monthlyMatrix
            : createInitialPurchase3WayMatrix();
        return list;
    }, [verification?.purchase?.monthlyMatrix]);

    const purchaseMatrixTotals = useMemo(() => {
        const list = verification?.purchase?.monthlyMatrix && verification.purchase.monthlyMatrix.length === 12
            ? verification.purchase.monthlyMatrix
            : createInitialPurchase3WayMatrix();

        const totals = {
            books: { cgst: 0, sgst: 0, igst: 0, cess: 0, nilRated: 0, totalTax: 0 },
            gstr2b: { cgst: 0, sgst: 0, igst: 0, cess: 0, nilRated: 0, totalTax: 0 },
            diff2b: { cgst: 0, sgst: 0, igst: 0, cess: 0, nilRated: 0, totalTax: 0 },
            gstr3b: { cgst: 0, sgst: 0, igst: 0, cess: 0, nilRated: 0, totalTax: 0 },
            diff3b: { cgst: 0, sgst: 0, igst: 0, cess: 0, nilRated: 0, totalTax: 0 },
            diffDrc: { cgst: 0, sgst: 0, igst: 0, cess: 0, nilRated: 0, totalTax: 0 }
        };

        list.forEach(row => {
            const bTax = (row.books?.cgst || 0) + (row.books?.sgst || 0) + (row.books?.igst || 0) + (row.books?.cess || 0);
            const twoBTax = (row.gstr2b?.cgst || 0) + (row.gstr2b?.sgst || 0) + (row.gstr2b?.igst || 0) + (row.gstr2b?.cess || 0);
            const threeBTax = (row.gstr3b?.cgst || 0) + (row.gstr3b?.sgst || 0) + (row.gstr3b?.igst || 0) + (row.gstr3b?.cess || 0);

            // Books
            totals.books.cgst += row.books?.cgst || 0;
            totals.books.sgst += row.books?.sgst || 0;
            totals.books.igst += row.books?.igst || 0;
            totals.books.cess += row.books?.cess || 0;
            totals.books.nilRated += row.books?.nilRated || 0;
            totals.books.totalTax += bTax;

            // GSTR-2B
            totals.gstr2b.cgst += row.gstr2b?.cgst || 0;
            totals.gstr2b.sgst += row.gstr2b?.sgst || 0;
            totals.gstr2b.igst += row.gstr2b?.igst || 0;
            totals.gstr2b.cess += row.gstr2b?.cess || 0;
            totals.gstr2b.nilRated += row.gstr2b?.nilRated || 0;
            totals.gstr2b.totalTax += twoBTax;

            // Diff 2B (Books - 2B)
            totals.diff2b.cgst += (row.books?.cgst || 0) - (row.gstr2b?.cgst || 0);
            totals.diff2b.sgst += (row.books?.sgst || 0) - (row.gstr2b?.sgst || 0);
            totals.diff2b.igst += (row.books?.igst || 0) - (row.gstr2b?.igst || 0);
            totals.diff2b.cess += (row.books?.cess || 0) - (row.gstr2b?.cess || 0);
            totals.diff2b.nilRated += (row.books?.nilRated || 0) - (row.gstr2b?.nilRated || 0);
            totals.diff2b.totalTax += bTax - twoBTax;

            // GSTR-3B
            totals.gstr3b.cgst += row.gstr3b?.cgst || 0;
            totals.gstr3b.sgst += row.gstr3b?.sgst || 0;
            totals.gstr3b.igst += row.gstr3b?.igst || 0;
            totals.gstr3b.cess += row.gstr3b?.cess || 0;
            totals.gstr3b.nilRated += row.gstr3b?.nilRated || 0;
            totals.gstr3b.totalTax += threeBTax;

            // Diff 3B (Books - 3B)
            totals.diff3b.cgst += (row.books?.cgst || 0) - (row.gstr3b?.cgst || 0);
            totals.diff3b.sgst += (row.books?.sgst || 0) - (row.gstr3b?.sgst || 0);
            totals.diff3b.igst += (row.books?.igst || 0) - (row.gstr3b?.igst || 0);
            totals.diff3b.cess += (row.books?.cess || 0) - (row.gstr3b?.cess || 0);
            totals.diff3b.nilRated += (row.books?.nilRated || 0) - (row.gstr3b?.nilRated || 0);
            totals.diff3b.totalTax += bTax - threeBTax;

            // Diff DRC-01C (3B - 2B)
            totals.diffDrc.cgst += (row.gstr3b?.cgst || 0) - (row.gstr2b?.cgst || 0);
            totals.diffDrc.sgst += (row.gstr3b?.sgst || 0) - (row.gstr2b?.sgst || 0);
            totals.diffDrc.igst += (row.gstr3b?.igst || 0) - (row.gstr2b?.igst || 0);
            totals.diffDrc.cess += (row.gstr3b?.cess || 0) - (row.gstr2b?.cess || 0);
            totals.diffDrc.nilRated += (row.gstr3b?.nilRated || 0) - (row.gstr2b?.nilRated || 0);
            totals.diffDrc.totalTax += threeBTax - twoBTax;
        });

        return totals;
    }, [verification?.purchase?.monthlyMatrix]);

    // ─── 3.4 Bank, Borrowings & Investments Handlers ─────────────────────────
    const handleAddBankFacility = (facilityType?: BankFacilityType) => {
        const newFacility: BankFacilityItem = {
            id: `bf_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            facilityType: facilityType || 'Bank Account',
            name: '',
            balance: 0,
            status: 'Match',
            comment: 'BRS verified - Zero discrepancy'
        };

        setVerification(prev => {
            const currentFacilities = prev.bankLoans?.facilities && prev.bankLoans.facilities.length > 0
                ? [...prev.bankLoans.facilities, newFacility]
                : [...createInitialBankFacilities(), newFacility];

            const bankCount = currentFacilities.filter(f => f.facilityType === 'Bank Account').length;
            const loanCount = currentFacilities.filter(f => f.facilityType !== 'Bank Account' && f.facilityType !== 'Fixed Deposit (FD)').length;

            return {
                ...prev,
                bankLoans: {
                    ...prev.bankLoans,
                    facilities: currentFacilities,
                    bankAccountsCount: bankCount,
                    loanAccountsCount: loanCount
                }
            };
        });
        toast.success('New banking/facility account added');
    };

    const handleUpdateBankFacility = (id: string, field: keyof BankFacilityItem, value: any) => {
        setVerification(prev => {
            const list = prev.bankLoans?.facilities && prev.bankLoans.facilities.length > 0
                ? [...prev.bankLoans.facilities]
                : createInitialBankFacilities();

            const idx = list.findIndex(f => f.id === id);
            if (idx === -1) return prev;

            const updatedItem = {
                ...list[idx],
                [field]: field === 'balance' ? (value === '' ? 0 : (isNaN(parseFloat(value)) ? 0 : parseFloat(value))) : value
            };
            list[idx] = updatedItem;

            const bankCount = list.filter(f => f.facilityType === 'Bank Account').length;
            const loanCount = list.filter(f => f.facilityType !== 'Bank Account' && f.facilityType !== 'Fixed Deposit (FD)').length;

            return {
                ...prev,
                bankLoans: {
                    ...prev.bankLoans,
                    facilities: list,
                    bankAccountsCount: bankCount,
                    loanAccountsCount: loanCount
                }
            };
        });
    };

    const handleDeleteBankFacility = (id: string) => {
        setVerification(prev => {
            const list = prev.bankLoans?.facilities && prev.bankLoans.facilities.length > 0
                ? [...prev.bankLoans.facilities]
                : createInitialBankFacilities();

            if (list.length <= 1) {
                toast.warning('At least one account/facility must remain');
                return prev;
            }

            const filtered = list.filter(f => f.id !== id);
            const bankCount = filtered.filter(f => f.facilityType === 'Bank Account').length;
            const loanCount = filtered.filter(f => f.facilityType !== 'Bank Account' && f.facilityType !== 'Fixed Deposit (FD)').length;

            return {
                ...prev,
                bankLoans: {
                    ...prev.bankLoans,
                    facilities: filtered,
                    bankAccountsCount: bankCount,
                    loanAccountsCount: loanCount
                }
            };
        });
        toast.info('Account/facility removed');
    };

    const handleResetBankFacilities = () => {
        const initial = createInitialBankFacilities();
        setVerification(prev => ({
            ...prev,
            bankLoans: {
                ...prev.bankLoans,
                facilities: initial,
                bankAccountsCount: initial.filter(f => f.facilityType === 'Bank Account').length,
                loanAccountsCount: initial.filter(f => f.facilityType !== 'Bank Account' && f.facilityType !== 'Fixed Deposit (FD)').length
            }
        }));
        toast.info('Bank & facility accounts reset to standard firm template');
    };

    const bankFacilitiesData = useMemo(() => {
        return verification?.bankLoans?.facilities && verification.bankLoans.facilities.length > 0
            ? verification.bankLoans.facilities
            : createInitialBankFacilities();
    }, [verification?.bankLoans?.facilities]);

    const bankFacilitiesTotals = useMemo(() => {
        const list = bankFacilitiesData;
        let totalBalance = 0;
        let matchCount = 0;
        let notMatchedCount = 0;
        let selfCommentCount = 0;

        list.forEach(f => {
            totalBalance += Number(f.balance || 0);
            if (f.status === 'Match') matchCount++;
            else if (f.status === 'Not Matched') notMatchedCount++;
            else if (f.status === 'Self Comment') selfCommentCount++;
        });

        return {
            totalCount: list.length,
            totalBalance,
            matchCount,
            notMatchedCount,
            selfCommentCount,
            isAllMatched: list.length > 0 && notMatchedCount === 0 && selfCommentCount === 0
        };
    }, [bankFacilitiesData]);

    // ─── 3.5 ROC Charges & Loans Mapping Handlers ────────────────────────────
    const handleAddRocLoan = (category?: RocLoanCategory) => {
        const newLoan: RocLoanChargeItem = {
            id: `roc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            lenderName: '',
            category: category || 'Secured Term Loan',
            sanctionedAmount: 0,
            disbursedDate: '',
            chargeStatus: 'Charge Created (CHG-1 Filed)',
            mcaSrnOrChgNumber: '',
            isCashReceipt: false,
            remarks: 'Charge registered with MCA within 30 days (Certificate of Registration verified)'
        };

        setVerification(prev => {
            const currentLoans = prev.rocLoans?.loans && prev.rocLoans.loans.length > 0
                ? [...prev.rocLoans.loans, newLoan]
                : [...createInitialRocLoanCharges(), newLoan];

            let cashCount = 0;
            let totalAmt = 0;
            let chg1Pending = 0;
            let chg4Pending = 0;

            currentLoans.forEach(l => {
                totalAmt += Number(l.sanctionedAmount || 0);
                if (l.isCashReceipt && l.sanctionedAmount >= 20000) cashCount++;
                if (l.chargeStatus === 'Charge Pending Creation' || l.chargeStatus === 'Overdue > 30 Days (MCA Violation)') chg1Pending++;
                if (l.chargeStatus === 'Charge Satisfied (CHG-4 Filed)') chg4Pending++;
            });

            return {
                ...prev,
                rocLoans: {
                    ...prev.rocLoans,
                    loans: currentLoans,
                    newLoansCount: currentLoans.length,
                    newLoansTotalAmount: totalAmt,
                    cashLoansSec269SS_Count: cashCount,
                    formCHG1_PendingCount: chg1Pending,
                    formCHG4_PendingCount: chg4Pending
                }
            };
        });
        toast.success('New loan borrowing entry added for ROC charge mapping');
    };

    const handleUpdateRocLoan = (id: string, field: keyof RocLoanChargeItem, value: any) => {
        setVerification(prev => {
            const list = prev.rocLoans?.loans && prev.rocLoans.loans.length > 0
                ? [...prev.rocLoans.loans]
                : createInitialRocLoanCharges();

            const idx = list.findIndex(l => l.id === id);
            if (idx === -1) return prev;

            const updatedItem = {
                ...list[idx],
                [field]: field === 'sanctionedAmount' ? (value === '' ? 0 : (isNaN(parseFloat(value)) ? 0 : parseFloat(value))) : value
            };
            list[idx] = updatedItem;

            let cashCount = 0;
            let totalAmt = 0;
            let chg1Pending = 0;
            let chg4Pending = 0;

            list.forEach(l => {
                totalAmt += Number(l.sanctionedAmount || 0);
                if (l.isCashReceipt && l.sanctionedAmount >= 20000) cashCount++;
                if (l.chargeStatus === 'Charge Pending Creation' || l.chargeStatus === 'Overdue > 30 Days (MCA Violation)') chg1Pending++;
                if (l.chargeStatus === 'Charge Satisfied (CHG-4 Filed)') chg4Pending++;
            });

            return {
                ...prev,
                rocLoans: {
                    ...prev.rocLoans,
                    loans: list,
                    newLoansCount: list.length,
                    newLoansTotalAmount: totalAmt,
                    cashLoansSec269SS_Count: cashCount,
                    formCHG1_PendingCount: chg1Pending,
                    formCHG4_PendingCount: chg4Pending
                }
            };
        });
    };

    const handleDeleteRocLoan = (id: string) => {
        setVerification(prev => {
            const list = prev.rocLoans?.loans && prev.rocLoans.loans.length > 0
                ? [...prev.rocLoans.loans]
                : createInitialRocLoanCharges();

            if (list.length <= 1) {
                toast.warning('At least one loan borrowing entry must remain');
                return prev;
            }

            const filtered = list.filter(l => l.id !== id);
            let cashCount = 0;
            let totalAmt = 0;
            let chg1Pending = 0;
            let chg4Pending = 0;

            filtered.forEach(l => {
                totalAmt += Number(l.sanctionedAmount || 0);
                if (l.isCashReceipt && l.sanctionedAmount >= 20000) cashCount++;
                if (l.chargeStatus === 'Charge Pending Creation' || l.chargeStatus === 'Overdue > 30 Days (MCA Violation)') chg1Pending++;
                if (l.chargeStatus === 'Charge Satisfied (CHG-4 Filed)') chg4Pending++;
            });

            return {
                ...prev,
                rocLoans: {
                    ...prev.rocLoans,
                    loans: filtered,
                    newLoansCount: filtered.length,
                    newLoansTotalAmount: totalAmt,
                    cashLoansSec269SS_Count: cashCount,
                    formCHG1_PendingCount: chg1Pending,
                    formCHG4_PendingCount: chg4Pending
                }
            };
        });
        toast.info('Loan borrowing entry removed');
    };

    const handleResetRocLoans = () => {
        const initial = createInitialRocLoanCharges();
        let cashCount = 0;
        let totalAmt = 0;
        let chg1Pending = 0;
        let chg4Pending = 0;

        initial.forEach(l => {
            totalAmt += Number(l.sanctionedAmount || 0);
            if (l.isCashReceipt && l.sanctionedAmount >= 20000) cashCount++;
            if (l.chargeStatus === 'Charge Pending Creation' || l.chargeStatus === 'Overdue > 30 Days (MCA Violation)') chg1Pending++;
            if (l.chargeStatus === 'Charge Satisfied (CHG-4 Filed)') chg4Pending++;
        });

        setVerification(prev => ({
            ...prev,
            rocLoans: {
                ...prev.rocLoans,
                loans: initial,
                newLoansCount: initial.length,
                newLoansTotalAmount: totalAmt,
                cashLoansSec269SS_Count: cashCount,
                formCHG1_PendingCount: chg1Pending,
                formCHG4_PendingCount: chg4Pending
            }
        }));
        toast.info('ROC loan & charge mappings reset to standard firm template');
    };

    const rocLoansData = useMemo(() => {
        return verification?.rocLoans?.loans && verification.rocLoans.loans.length > 0
            ? verification.rocLoans.loans
            : createInitialRocLoanCharges();
    }, [verification?.rocLoans?.loans]);

    const rocLoansTotals = useMemo(() => {
        const list = rocLoansData;
        let totalSanctioned = 0;
        let createdCount = 0;
        let pendingCount = 0;
        let overdueCount = 0;
        let satisfiedCount = 0;
        let unsecuredCount = 0;
        let cashViolationCount = 0;

        list.forEach(l => {
            totalSanctioned += Number(l.sanctionedAmount || 0);
            if (l.chargeStatus === 'Charge Created (CHG-1 Filed)') createdCount++;
            else if (l.chargeStatus === 'Charge Pending Creation') pendingCount++;
            else if (l.chargeStatus === 'Overdue > 30 Days (MCA Violation)') overdueCount++;
            else if (l.chargeStatus === 'Charge Satisfied (CHG-4 Filed)') satisfiedCount++;
            else if (l.chargeStatus === 'Not Applicable (Unsecured)') unsecuredCount++;

            if (l.isCashReceipt && (l.sanctionedAmount >= 20000)) cashViolationCount++;
        });

        const isFullyCompliant = overdueCount === 0 && pendingCount === 0 && cashViolationCount === 0;

        return {
            totalCount: list.length,
            totalSanctioned,
            createdCount,
            pendingCount,
            overdueCount,
            satisfiedCount,
            unsecuredCount,
            cashViolationCount,
            isFullyCompliant
        };
    }, [rocLoansData]);

    // ─── 3.3 TDS Working (Section-Wise Reconciliation & Discrepancies) ─────────
    const [tdsMatrixFilter, setTdsMatrixFilter] = useState<'all' | 'payable' | 'pending_booking' | 'matched'>('all');

    const tdsSectionMatrixData: TdsSectionWorkingRow[] = useMemo(() => {
        return verification?.journal?.tdsSectionMatrix && verification.journal.tdsSectionMatrix.length > 0
            ? verification.journal.tdsSectionMatrix
            : createDefaultTdsSectionMatrix();
    }, [verification?.journal?.tdsSectionMatrix]);

    const tdsMatrixTotals: TdsMatrixTotals = useMemo(() => {
        return calculateTdsMatrixTotals(tdsSectionMatrixData);
    }, [tdsSectionMatrixData]);

    const handleUpdateTdsSectionRow = (id: string, field: keyof TdsSectionWorkingRow, value: any) => {
        setVerification(prev => {
            const list = prev.journal?.tdsSectionMatrix && prev.journal.tdsSectionMatrix.length > 0
                ? [...prev.journal.tdsSectionMatrix]
                : createDefaultTdsSectionMatrix();

            const idx = list.findIndex(r => r.id === id);
            if (idx === -1) return prev;

            const isNumeric = ['rate', 'booksTaxable', 'booksTds', 'actualTaxable', 'actualTds', 'returnTaxable', 'returnTds'].includes(field);
            const parsedVal = isNumeric
                ? (value === '' ? 0 : (isNaN(parseFloat(value)) ? 0 : parseFloat(value)))
                : value;

            const updatedRow: TdsSectionWorkingRow = {
                ...list[idx],
                [field]: parsedVal
            };

            // Auto-compute suggested actualTds if actualTaxable was modified and rate is positive
            if (field === 'actualTaxable' && updatedRow.rate > 0) {
                updatedRow.actualTds = Math.round((Number(parsedVal) * updatedRow.rate) / 100);
            }

            list[idx] = updatedRow;

            return {
                ...prev,
                journal: {
                    ...prev.journal!,
                    tdsSectionMatrix: list
                }
            };
        });
    };

    const handleAddTdsSection = (sectionName = '194C', nature = 'Contractors / Transporters', defaultRate = 2) => {
        const newRow: TdsSectionWorkingRow = {
            id: `tds_sec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            section: sectionName,
            natureOfPayment: nature,
            rate: defaultRate,
            booksTaxable: 0,
            booksTds: 0,
            actualTaxable: 0,
            actualTds: 0,
            returnTaxable: 0,
            returnTds: 0,
            remarks: 'Statutory scrutiny verified'
        };

        setVerification(prev => {
            const list = prev.journal?.tdsSectionMatrix && prev.journal.tdsSectionMatrix.length > 0
                ? [...prev.journal.tdsSectionMatrix, newRow]
                : [...createDefaultTdsSectionMatrix(), newRow];

            return {
                ...prev,
                journal: {
                    ...prev.journal!,
                    tdsSectionMatrix: list
                }
            };
        });
        toast.success(`Added TDS Section ${sectionName} to working matrix`);
    };

    const handleDeleteTdsSection = (id: string) => {
        setVerification(prev => {
            const list = prev.journal?.tdsSectionMatrix && prev.journal.tdsSectionMatrix.length > 0
                ? [...prev.journal.tdsSectionMatrix]
                : createDefaultTdsSectionMatrix();

            if (list.length <= 1) {
                toast.warning('At least one TDS section must remain in the working matrix');
                return prev;
            }

            const filtered = list.filter(r => r.id !== id);
            return {
                ...prev,
                journal: {
                    ...prev.journal!,
                    tdsSectionMatrix: filtered
                }
            };
        });
        toast.info('TDS Section removed from matrix');
    };

    const handleResetTdsMatrix = () => {
        const initial = createDefaultTdsSectionMatrix();
        setVerification(prev => ({
            ...prev,
            journal: {
                ...prev.journal!,
                tdsSectionMatrix: initial
            }
        }));
        toast.info('TDS Section Working Matrix reset to standard statutory template');
    };

    const filteredTdsRows = useMemo(() => {
        return tdsSectionMatrixData.filter(row => {
            const bookingPending = Math.max(0, Number(row.actualTaxable || 0) - Number(row.booksTaxable || 0));
            const tdsPayable = Math.max(0, Number(row.actualTds || 0) - Number(row.returnTds || 0));
            const challanPending = Math.max(0, Number(row.booksTds || 0) - Number(row.returnTds || 0));

            if (tdsMatrixFilter === 'payable') return tdsPayable > 0;
            if (tdsMatrixFilter === 'pending_booking') return bookingPending > 0;
            if (tdsMatrixFilter === 'matched') return bookingPending === 0 && tdsPayable === 0 && challanPending === 0;
            return true;
        });
    }, [tdsSectionMatrixData, tdsMatrixFilter]);

    // ─── TDS Excel Working Paper Attachment Handlers ─────────────────────────
    const handleTdsFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const arrayBuffer = evt.target?.result as ArrayBuffer;
                let sheetNames: string[] = [];
                try {
                    const wb = XLSX.read(arrayBuffer, { type: 'array' });
                    sheetNames = wb.SheetNames || [];
                } catch (parseErr) {
                    console.warn('[MonthlyAuditSuite] Could not read sheet names from uploaded TDS working file:', parseErr);
                }

                const uint8 = new Uint8Array(arrayBuffer);
                let binary = '';
                const len = uint8.byteLength;
                const chunkSize = 0x8000;
                for (let i = 0; i < len; i += chunkSize) {
                    binary += String.fromCharCode.apply(null, uint8.subarray(i, i + chunkSize) as any);
                }
                const base64Data = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${btoa(binary)}`;

                const attachment: AuditExcelAttachment = {
                    fileName: file.name,
                    fileSize: file.size,
                    uploadedAt: new Date().toLocaleString('en-IN'),
                    uploadedBy: auditHeader.preparedBy || 'Junior Auditor',
                    fileData: base64Data,
                    sheetNames
                };

                setVerification(prev => ({
                    ...prev,
                    journal: {
                        ...prev.journal!,
                        excelAttachment: attachment
                    }
                }));

                toast.success(`TDS Excel working sheet "${file.name}" attached successfully!`);
            } catch (err: any) {
                toast.error(`Failed to process TDS Excel attachment: ${err.message}`);
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const handleLinkTdsLocalPath = () => {
        if (!tdsLocalPathInput.trim()) {
            toast.warning('Please enter a valid file path (e.g. E:\\TDS_Working_26Q.xlsx)');
            return;
        }
        const cleaned = tdsLocalPathInput.trim();
        const fileName = cleaned.split(/[\/\\]/).pop() || cleaned;

        const attachment: AuditExcelAttachment = {
            fileName,
            filePath: cleaned,
            uploadedAt: new Date().toLocaleString('en-IN'),
            uploadedBy: auditHeader.preparedBy || 'Junior Auditor'
        };

        setVerification(prev => ({
            ...prev,
            journal: {
                ...prev.journal!,
                excelAttachment: attachment
            }
        }));

        setTdsLocalPathInput('');
        toast.success(`Linked TDS Excel working path: ${fileName}`);
    };

    const handleRemoveTdsAttachment = () => {
        setVerification(prev => ({
            ...prev,
            journal: {
                ...prev.journal!,
                excelAttachment: undefined
            }
        }));
        if (tdsFileInputRef.current) {
            tdsFileInputRef.current.value = '';
        }
        toast.info('TDS Excel attachment removed');
    };

    const handleDownloadTdsAttachment = () => {
        const att = verification?.journal?.excelAttachment;
        if (!att) return;

        if (att.fileData) {
            const a = document.createElement('a');
            a.href = att.fileData;
            a.download = att.fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            toast.success(`Downloaded "${att.fileName}"`);
        } else if (att.filePath) {
            toast.info(`TDS working file is linked to local disk: ${att.filePath}`);
        }
    };

    // ─── Auto-Populate Orchestrator (Tally & GST) ──────────────────────────────
    const handleAutoPopulate = async () => {
        setIsAutoPopulating(true);
        toast.info('Scanning Tally Port 9000 & GST tables for audit evidence...');
        try {
            const result = await autoPopulateMonthlyAudit({
                clientGstin: selectedClientGstin,
                clientName: activeClient.legalName,
                fy: selectedFy,
                month: selectedMonth
            });

            setAuditHeader(prev => ({
                ...prev,
                turnoverIncGst: result.header.turnoverIncGst,
                turnoverBooks: result.header.turnoverBooks,
                turnoverGst: result.header.turnoverGst,
                turnoverVariance: result.header.turnoverVariance
            }));
            setChecklists(result.checklists);
            setVerification(result.verification);

            if (result.suggestedObservations && result.suggestedObservations.length > 0) {
                const freshObs: AuditObservationItem[] = result.suggestedObservations.map((s, idx) => ({
                    id: `OBS_AUTO_${Date.now()}_${idx}`,
                    auditId: auditHeader.id,
                    clientGstin: selectedClientGstin,
                    sectionKey: s.sectionKey,
                    title: s.title,
                    description: s.description,
                    severity: s.severity,
                    riskCategory: s.riskCategory,
                    financialExposure: s.financialExposure,
                    voucherRef: s.voucherRef,
                    auditorRecommendation: s.suggestedAction,
                    status: 'Open',
                    createdAt: Date.now(),
                    updatedAt: Date.now()
                }));

                setObservations(prev => {
                    const existingTitles = new Set(prev.map(p => p.title));
                    const newToAdd = freshObs.filter(f => !existingTitles.has(f.title));
                    return [...prev, ...newToAdd];
                });
            }

            toast.success('Audit evidence and standard verification checklists populated successfully!');
        } catch (err: any) {
            toast.error(`Auto-population failed: ${err.message || 'Check Tally connection'}`);
        } finally {
            setIsAutoPopulating(false);
        }
    };

    // ─── Save Working Paper (SQLite & Direct Client Directory Auto-Save) ────────
    const handleSaveAudit = async (showNotification = true, statusOverride?: AuditWorkflowStatus) => {
        setIsSaving(true);
        try {
            const apiBase = getApiBase();
            const targetStatus = statusOverride || auditHeader.auditStatus;
            const targetStatusDesc = targetStatus === 'APPROVED' ? 'Completed' : (targetStatus === 'SUBMITTED_FOR_REVIEW' ? 'Under Review' : auditHeader.status);

            const headerPayload = {
                id: auditHeader.id,
                client_gstin: selectedClientGstin,
                clientGstin: selectedClientGstin,
                client_name: activeClient.legalName,
                clientName: activeClient.legalName,
                fy: selectedFy,
                month: selectedMonth,
                auditor_name: auditHeader.auditorName,
                auditorName: auditHeader.auditorName,
                firm_name: auditHeader.firmName,
                firmName: auditHeader.firmName,
                firm_registration_no: auditHeader.firmRegistrationNo,
                firmRegistrationNo: auditHeader.firmRegistrationNo,
                membership_no: auditHeader.membershipNo,
                membershipNo: auditHeader.membershipNo,
                engagement_ref: auditHeader.engagementRef,
                engagementRef: auditHeader.engagementRef,
                period_mode: auditHeader.periodMode || 'single',
                periodMode: auditHeader.periodMode || 'single',
                selected_months: auditHeader.selectedMonths || [selectedMonth],
                selectedMonths: auditHeader.selectedMonths || [selectedMonth],
                audit_start_date: auditHeader.auditStartDate,
                auditStartDate: auditHeader.auditStartDate,
                audit_end_date: auditHeader.auditEndDate,
                auditEndDate: auditHeader.auditEndDate,
                team_members: auditHeader.teamMembers,
                teamMembers: auditHeader.teamMembers,
                audit_type: auditHeader.auditType,
                auditType: auditHeader.auditType,
                turnover_inc_gst: auditHeader.turnoverIncGst,
                turnoverIncGst: auditHeader.turnoverIncGst,
                turnover_books: auditHeader.turnoverBooks,
                turnoverBooks: auditHeader.turnoverBooks,
                turnover_gst: auditHeader.turnoverGst,
                turnoverGst: auditHeader.turnoverGst,
                turnover_variance: auditHeader.turnoverVariance,
                turnoverVariance: auditHeader.turnoverVariance,
                status: targetStatusDesc,
                audit_status: targetStatus,
                auditStatus: targetStatus,
                prepared_by: auditHeader.preparedBy,
                preparedBy: auditHeader.preparedBy,
                reviewed_by: auditHeader.reviewedBy,
                reviewedBy: auditHeader.reviewedBy,
                senior_review_notes: auditHeader.seniorReviewNotes,
                seniorReviewNotes: auditHeader.seniorReviewNotes,
                release_channel: auditHeader.releaseChannel,
                releaseChannel: auditHeader.releaseChannel,
                vouching_registers: registers,
                vouchingRegisters: registers,
                general_summary: auditHeader.generalSummary,
                generalSummary: auditHeader.generalSummary,
                metadata: {
                    ...(auditHeader.metadata || {}),
                    periodMode: auditHeader.periodMode || 'single',
                    selectedMonths: auditHeader.selectedMonths || [selectedMonth],
                    firmName: auditHeader.firmName,
                    firmRegistrationNo: auditHeader.firmRegistrationNo,
                    membershipNo: auditHeader.membershipNo,
                    engagementRef: auditHeader.engagementRef,
                    profitability
                }
            };

            await safeApiFetch('/api/monthly-audits', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(headerPayload)
            });

            if (checklists.length > 0) {
                const normalizedChecklists = checklists.map(c => ({
                    id: c.id,
                    section_key: c.sectionKey,
                    sectionKey: c.sectionKey,
                    item_key: c.itemKey,
                    itemKey: c.itemKey,
                    item_title: c.itemTitle,
                    itemTitle: c.itemTitle,
                    status: c.status,
                    sample_checked: c.sampleChecked,
                    sampleChecked: c.sampleChecked,
                    remarks: c.remarks || '',
                    amount_involved: c.amountInvolved || 0,
                    amountInvolved: c.amountInvolved || 0
                }));
                await safeApiFetch(`/api/monthly-audits/${encodeURIComponent(auditHeader.id)}/checklists/batch`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ items: normalizedChecklists })
                });
            }

            if (voucherSamples.length > 0) {
                await safeApiFetch(`/api/monthly-audits/${encodeURIComponent(auditHeader.id)}/samples/batch`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        samples: voucherSamples.map(s => ({
                            id: s.id,
                            register_key: s.registerKey,
                            registerKey: s.registerKey,
                            voucher_id: s.voucherId,
                            voucher_type: s.voucherType,
                            voucher_number: s.voucherNumber,
                            date: s.date,
                            party_name: s.partyName,
                            amount: s.amount,
                            sampling_rule: s.samplingRule,
                            stratum: s.stratum,
                            status: s.status,
                            auditor_remarks: s.auditorRemarks,
                            supporting_doc_ref: s.supportingDocRef,
                            verified_by: s.verifiedBy,
                            verified_at: s.verifiedAt
                        }))
                    })
                });
            }

            await safeApiFetch(`/api/monthly-audits/${encodeURIComponent(auditHeader.id)}/save-verification-data`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sales: verification.sales,
                    sales_reco_data: verification.sales,
                    purchase: verification.purchase,
                    purchase_reco_data: verification.purchase,
                    journal: verification.journal,
                    journal_reco_data: verification.journal,
                    bankLoans: verification.bankLoans,
                    bank_loan_data: verification.bankLoans,
                    rocLoans: verification.rocLoans,
                    roc_loan_data: verification.rocLoans,
                    cashCompliance: verification.cashCompliance,
                    cash_compliance_data: verification.cashCompliance,
                    labor: verification.labor,
                    statutory_compliance_data: verification.labor
                })
            });

            const exportBundle: MonthlyAuditExportBundle = {
                header: auditHeader,
                registers,
                checklists,
                verification,
                observations,
                pendingPoints,
                profitability
            };

            const base64Payload = generateMonthlyAuditBase64(exportBundle);
            const dirRes = await safeApiFetch(`/api/monthly-audits/${encodeURIComponent(auditHeader.id)}/save-directory`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(base64Payload)
            });

            if (dirRes.ok && showNotification) {
                const dirData = await dirRes.json();
                toast.success('Working Paper saved to SQLite and Auto-Saved to client directory!', {
                    description: dirData.savedPath ? `Saved to: ${dirData.savedPath}` : undefined
                });
            } else if (showNotification) {
                toast.success('Working Paper saved successfully');
            }

            setMonthStatuses(prev => ({
                ...prev,
                [selectedMonth]: auditHeader.auditStatus
            }));
        } catch (err: any) {
            if (showNotification) {
                toast.error(`Error saving working paper: ${err.message}`);
            }
        } finally {
            setIsSaving(false);
        }
    };

    // ─── Global Ctrl+S Hotkey Handler ──────────────────────────────────────────
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                handleSaveAudit();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [auditHeader, checklists, registers, verification, observations, pendingPoints]);

    // ─── Maker-Checker Review Transitions (with Firebase Cloud Remote Sync) ───
    const handleOpenSubmitReviewModal = () => {
        if (!selectedClientGstin || selectedClientGstin.trim() === '' || activeClient.legalName === 'No Client Selected') {
            toast.error('Please select or add a client first before submitting for review.', {
                action: {
                    label: 'Add Client',
                    onClick: () => setIsAddClientModalOpen(true)
                }
            });
            setIsAddClientModalOpen(true);
            return;
        }

        if (!auditHeader.preparedBy || !auditHeader.preparedBy.trim()) {
            const userTitle = getLoggedInUserTitle();
            if (userTitle) {
                setAuditHeader(prev => ({ ...prev, preparedBy: userTitle }));
            }
        }
        if (auditHeader.reviewedBy && auditHeader.reviewedBy.trim()) {
            setSelectedSenior(auditHeader.reviewedBy.trim());
        } else if (auditHeader.partnerName && auditHeader.partnerName.trim()) {
            setSelectedSenior(auditHeader.partnerName.trim());
        } else if (cloudSeniors.length > 0 && cloudSeniors[0].name) {
            setSelectedSenior(cloudSeniors[0].name);
        } else if (availableSeniorOptions.length > 0) {
            setSelectedSenior(availableSeniorOptions[0]);
        } else {
            setSelectedSenior('');
        }
        setSubmitReviewModalOpen(true);
    };

    const handleConfirmSubmitForReview = async () => {
        if (!selectedClientGstin || selectedClientGstin.trim() === '' || activeClient.legalName === 'No Client Selected') {
            toast.error('Cannot submit: Please select or add a client first.');
            setIsAddClientModalOpen(true);
            return;
        }

        const finalSenior = selectedSenior === '__custom__' ? customSeniorName.trim() : selectedSenior;
        if (!finalSenior) {
            toast.error('Please specify a Senior Partner / Reviewer');
            return;
        }

        try {
            setIsSubmittingCloud(true);
            const apiBase = getApiBase();
            const juniorName = auditHeader.preparedBy || 'Junior Article';

            // 1. Update Local Backend (SQLite)
            const res = await safeApiFetch(`/api/monthly-audits/${encodeURIComponent(auditHeader.id)}/submit-review`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    preparedBy: juniorName,
                    reviewedBy: finalSenior,
                    notes: submissionNotes,
                    priority: reviewPriority
                })
            });

            // 2. Broadcast to Firebase Cloud Firestore for Remote Senior Notification
            await submitAuditForSeniorReviewInFirebase({
                clientGstin: selectedClientGstin,
                fy: selectedFy,
                month: selectedMonth,
                clientName: activeClient.legalName,
                preparedBy: juniorName,
                reviewedBy: finalSenior,
                submissionNotes,
                priority: reviewPriority,
                turnoverBooks: auditHeader.turnoverBooks,
                turnoverGst: auditHeader.turnoverGst,
                observationsCount: observations.length,
                criticalObsCount: observations.filter(o => o.severity === 'Critical').length,
                pendingPointsCount: pendingPoints.length
            });

            toast.success(`Audit submitted to ${finalSenior} via Firebase Cloud!`);
            setAuditHeader(prev => ({
                ...prev,
                auditStatus: 'SUBMITTED_FOR_REVIEW',
                reviewedBy: finalSenior,
                preparedBy: juniorName,
                generalSummary: submissionNotes
            }));
            setSubmitReviewModalOpen(false);
            await handleSaveAudit(false);
        } catch (err: any) {
            toast.error(`Cloud submission failed: ${err.message}`);
        } finally {
            setIsSubmittingCloud(false);
        }
    };

    const handleApprove = async () => {
        const toastId = toast.loading('Accepting & signing off audit...');
        try {
            const apiBase = getApiBase();
            const seniorName = auditHeader.reviewedBy || selectedSenior || (activeSeniorReviewer !== 'ALL' ? activeSeniorReviewer : '') || 'Senior CA Partner';
            const notes = 'Audit working papers verified and approved for client release.';

            const targetGstin = (selectedClientGstin || auditHeader.clientGstin || '').trim();
            const targetFy = (selectedFy || auditHeader.fy || '2026-27').trim();
            const targetMonth = (selectedMonth || auditHeader.month || 'April').trim();

            if (!targetGstin) {
                toast.error('Cannot sign off: Missing client GSTIN.', { id: toastId });
                return;
            }

            // 1. Update Local SQLite Backend with fallback identifiers
            await safeApiFetch(`/api/monthly-audits/${encodeURIComponent(auditHeader.id)}/senior-review`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'APPROVE',
                    reviewedBy: seniorName,
                    seniorReviewNotes: notes,
                    clientGstin: targetGstin,
                    fy: targetFy,
                    month: targetMonth
                })
            }).catch(() => {});

            // 2. Sync Approval to Firebase Cloud with a 3.5s timeout guarantee
            const fbPromise = approveAuditInFirebase({
                clientGstin: targetGstin,
                fy: targetFy,
                month: targetMonth,
                reviewedBy: seniorName,
                seniorReviewNotes: notes
            });
            const timeoutPromise = new Promise(resolve => setTimeout(() => resolve({ success: true, timeout: true }), 3500));
            await Promise.race([fbPromise, timeoutPromise]).catch(() => {});

            setAuditHeader(prev => ({
                ...prev,
                auditStatus: 'APPROVED',
                reviewedBy: seniorName,
                reviewedAt: Date.now()
            }));

            // Remove from local pending queue
            setPendingReviewsQueue(prev => prev.filter(p =>
                !(
                    ((p.clientGstin || (p as any).client_gstin) === targetGstin || (p.clientGstin || (p as any).client_gstin) === selectedClientGstin) &&
                    p.fy === targetFy &&
                    p.month === targetMonth
                )
            ));

            toast.success('Audit working paper Accepted & Signed Off in Cloud & Local DB!', { id: toastId });
            await handleSaveAudit(false, 'APPROVED');
        } catch (err: any) {
            toast.error(`Approval failed: ${err.message}`, { id: toastId });
        }
    };

    const handleRequestRevision = async () => {
        if (!isSeniorUser && currentRole !== 'senior') {
            toast.error('Permission Denied: Only designated Senior CA Partners can request revisions.');
            return;
        }
        try {
            const apiBase = getApiBase();
            const seniorName = auditHeader.reviewedBy || selectedSenior || 'Senior Partner, CA';
            const finalNotes = `[${revisionSeverity.toUpperCase()}] [${revisionSection}]\n${revisionNotes.trim()}`;

            // 1. Update Local SQLite Backend
            const res = await safeApiFetch(`/api/monthly-audits/${encodeURIComponent(auditHeader.id)}/senior-review`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'REQUEST_REVISION',
                    reviewedBy: seniorName,
                    reviewed_by: seniorName,
                    reviewNotes: finalNotes,
                    seniorReviewNotes: finalNotes,
                    senior_review_notes: finalNotes
                })
            });

            // 2. Sync Revision Request to Firebase Cloud
            await requestRevisionInFirebase({
                clientGstin: selectedClientGstin,
                fy: selectedFy,
                month: selectedMonth,
                reviewedBy: seniorName,
                revisionNotes: finalNotes
            });

            if (res.ok) {
                toast.info('Revision requested in Firebase Cloud. Working paper unlocked for Junior edits.');
                setAuditHeader(prev => ({
                    ...prev,
                    auditStatus: 'REVISION_REQUESTED',
                    seniorReviewNotes: finalNotes
                }));
                setRevisionModalOpen(false);
                setRevisionNotes('');
                await handleSaveAudit(false);
            }
        } catch (err: any) {
            toast.error(`Revision request failed: ${err.message}`);
        }
    };

    const handleReleaseToClient = async () => {
        try {
            const apiBase = getApiBase();
            const resolvedClientName = activeClient?.legalName && activeClient.legalName !== 'Selected Client' && activeClient.legalName !== 'No Client Selected'
                ? activeClient.legalName
                : (auditHeader.clientName && auditHeader.clientName !== 'Client Entity' ? auditHeader.clientName : (activeClient?.gstin ? `Client (${activeClient.gstin})` : 'DYP INFRAPROJECTS PRIVATE LIMITED'));
            const resolvedGstin = activeClient?.gstin || auditHeader.clientGstin || '27AAGCD4105L1ZO';
            const resolvedPartner = (auditHeader.reviewedBy && auditHeader.reviewedBy !== 'admin' && !auditHeader.reviewedBy.includes('Vaswani'))
                ? auditHeader.reviewedBy
                : (auditHeader.auditorName && auditHeader.auditorName !== 'admin' && !auditHeader.auditorName.includes('Vaswani')
                    ? auditHeader.auditorName 
                    : 'Engagement Article (Audit Lead)');

            const exportBundle: MonthlyAuditExportBundle = {
                header: {
                    ...auditHeader,
                    clientName: resolvedClientName,
                    clientGstin: resolvedGstin,
                    reviewedBy: resolvedPartner,
                    auditorName: resolvedPartner
                },
                registers,
                checklists,
                verification,
                observations,
                pendingPoints,
                profitability
            };
            const base64Data = generateMonthlyAuditBase64(exportBundle);
            const pdfData = generateMonthlyAuditPdf(exportBundle, { autoDownload: false });

            const res = await safeApiFetch(`/api/monthly-audits/${encodeURIComponent(auditHeader.id)}/release-client`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    releasedBy: auditHeader.reviewedBy || 'Senior Partner, CA',
                    released_by: auditHeader.reviewedBy || 'Senior Partner, CA',
                    channel: releaseChannel,
                    workbookBase64: base64Data.workbookBase64,
                    filename: base64Data.filename,
                    pdfBase64: pdfData.base64,
                    pdfFilename: pdfData.fileName,
                    clientName: activeClient.legalName,
                    client_name: activeClient.legalName,
                    gstin: selectedClientGstin,
                    client_gstin: selectedClientGstin,
                    fy: selectedFy,
                    month: selectedMonth
                })
            });

            // Sync to Firebase Cloud
            await releaseAuditInFirebase({
                clientGstin: selectedClientGstin,
                fy: selectedFy,
                month: selectedMonth,
                releasedBy: auditHeader.reviewedBy || 'Senior Partner, CA',
                releaseChannel
            });

            if (res.ok) {
                const data = await res.json();
                toast.success('Monthly Audit Report released to client in Cloud & Local Archive!', {
                    description: `Auto-saved to: ${data.savedPath || 'Client Directory'}`
                });
                setAuditHeader(prev => ({
                    ...prev,
                    auditStatus: 'RELEASED',
                    releasedAt: Date.now(),
                    releaseChannel
                }));
                setReleaseModalOpen(false);
                await handleSaveAudit(false);
            }
        } catch (err: any) {
            toast.error(`Release failed: ${err.message}`);
        }
    };

    // ─── Observations Management ───────────────────────────────────────────────
    const handleAddObservation = async () => {
        if (!newObs.title.trim()) {
            toast.warning('Observation title is required');
            return;
        }

        const obsItem: AuditObservationItem = {
            id: `OBS_${Date.now()}`,
            auditId: auditHeader.id,
            clientGstin: selectedClientGstin,
            sectionKey: newObs.sectionKey,
            title: newObs.title,
            description: newObs.description,
            severity: newObs.severity,
            riskCategory: newObs.riskCategory,
            financialExposure: Number(newObs.financialExposure) || 0,
            voucherRef: newObs.voucherRef,
            auditorRecommendation: newObs.auditorRecommendation,
            status: 'Open',
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        try {
            await safeApiFetch(`/api/monthly-audits/${encodeURIComponent(auditHeader.id)}/observations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...obsItem,
                    obsId: obsItem.id,
                    client_gstin: selectedClientGstin,
                    section_key: newObs.sectionKey,
                    risk_category: newObs.riskCategory,
                    financial_exposure: Number(newObs.financialExposure) || 0,
                    voucher_ref: newObs.voucherRef,
                    auditor_recommendation: newObs.auditorRecommendation
                })
            });
            setObservations(prev => [obsItem, ...prev]);
            setNewObs({
                sectionKey: newObs.sectionKey, // retain selected section for fast sequential entry
                title: '',
                description: '',
                severity: newObs.severity, // retain selected severity
                riskCategory: newObs.riskCategory,
                financialExposure: 0,
                voucherRef: '',
                auditorRecommendation: ''
            });
            toast.success('Observation recorded');
        } catch (err: any) {
            toast.error(`Failed to add observation: ${err.message}`);
        }
    };

    const handleUpdateObservationResponse = async (obsId: string, responseText: string) => {
        const targetObs = observations.find(o => o.id === obsId);
        if (!targetObs || targetObs.managementResponse === responseText) return;

        try {
            await safeApiFetch(`/api/monthly-audits/${encodeURIComponent(auditHeader.id)}/observations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...targetObs,
                    obsId: targetObs.id,
                    client_gstin: selectedClientGstin,
                    section_key: targetObs.sectionKey,
                    risk_category: targetObs.riskCategory,
                    financial_exposure: Number(targetObs.financialExposure) || 0,
                    voucher_ref: targetObs.voucherRef,
                    auditor_recommendation: targetObs.auditorRecommendation,
                    management_response: responseText,
                    managementResponse: responseText
                })
            });
            setObservations(prev => prev.map(o => o.id === obsId ? { ...o, managementResponse: responseText } : o));
            toast.success('Management response saved');
        } catch (err: any) {
            toast.error(`Failed to update response: ${err.message}`);
        }
    };

    const handleDeleteObservation = async (obsId: string) => {
        try {
            await safeApiFetch(`/api/monthly-audits/${encodeURIComponent(auditHeader.id)}/observations/${encodeURIComponent(obsId)}`, {
                method: 'DELETE'
            });
            setObservations(prev => prev.filter(o => o.id !== obsId));
            toast.success('Observation removed');
        } catch (err: any) {
            toast.error(`Failed to delete observation: ${err.message}`);
        }
    };

    const handlePromoteToPendingPoint = async (obs: AuditObservationItem) => {
        const pointItem: AuditPendingPointItem = {
            id: `PEND_${Date.now()}`,
            clientGstin: selectedClientGstin,
            clientName: activeClient.legalName,
            originAuditId: auditHeader.id,
            originFy: selectedFy,
            originMonth: selectedMonth,
            pointTitle: obs.title,
            pointDescription: obs.description,
            category: obs.riskCategory || 'Audit Scrutiny',
            severity: obs.severity === 'Info' ? 'Low' : obs.severity,
            status: 'Pending',
            assignedTo: 'Accountant / Tax Team',
            targetDate: 'Immediate',
            resolutionRemarks: obs.auditorRecommendation,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        try {
            await safeApiFetch('/api/audit-pending-points', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...pointItem,
                    client_gstin: selectedClientGstin,
                    client_name: activeClient.legalName,
                    origin_audit_id: auditHeader.id,
                    origin_fy: selectedFy,
                    origin_month: selectedMonth,
                    point_title: obs.title,
                    point_description: obs.description,
                    assigned_to: 'Accountant / Tax Team',
                    target_date: 'Immediate',
                    resolution_remarks: obs.auditorRecommendation
                })
            });
            setPendingPoints(prev => [pointItem, ...prev]);
            toast.success('Observation promoted to Cross-Month Work Pending List!');
        } catch (err: any) {
            toast.error(`Promotion failed: ${err.message}`);
        }
    };

    // ─── Pending Points Resolution ─────────────────────────────────────────────
    const handleUpdatePendingPoint = async () => {
        if (!selectedPendingPoint) return;
        try {
            const payload = {
                status: resolveStatus,
                resolutionRemarks: resolveRemarks,
                resolution_remarks: resolveRemarks,
                resolvedInMonth: resolveStatus === 'Cleared' ? selectedMonth : undefined,
                resolved_in_month: resolveStatus === 'Cleared' ? selectedMonth : undefined,
                verifiedBy: resolveStatus === 'Cleared' ? (auditHeader.reviewedBy || 'Senior Auditor') : undefined,
                verified_by: resolveStatus === 'Cleared' ? (auditHeader.reviewedBy || 'Senior Auditor') : undefined
            };

            await safeApiFetch(`/api/audit-pending-points/${encodeURIComponent(selectedPendingPoint.id)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            setPendingPoints(prev => prev.map(p =>
                p.id === selectedPendingPoint.id
                    ? {
                        ...p,
                        status: resolveStatus,
                        resolutionRemarks: resolveRemarks,
                        resolvedInMonth: resolveStatus === 'Cleared' ? selectedMonth : p.resolvedInMonth,
                        verifiedBy: resolveStatus === 'Cleared' ? (auditHeader.reviewedBy || 'Senior Auditor') : p.verifiedBy
                    }
                    : p
            ));

            setResolveModalOpen(false);
            setSelectedPendingPoint(null);
            setResolveRemarks('');
            toast.success('Pending Point updated successfully');
        } catch (err: any) {
            toast.error(`Resolution update failed: ${err.message}`);
        }
    };

    // ─── Instant Zero-Merge Excel Export ────────────────────────────────────────
    const handleDownloadExcel = () => {
        const bundle: MonthlyAuditExportBundle = {
            header: auditHeader,
            registers,
            checklists,
            verification,
            observations,
            pendingPoints,
            profitability
        };
        exportMonthlyAuditToExcel(bundle);
        toast.success('Zero-Merge Excel Working Paper downloaded!');
    };

    // ─── Professional Corporate PDF Export ─────────────────────────────────────
    const handleDownloadPdf = () => {
        const resolvedClientName = activeClient?.legalName && activeClient.legalName !== 'Selected Client' && activeClient.legalName !== 'No Client Selected'
            ? activeClient.legalName
            : (auditHeader.clientName && auditHeader.clientName !== 'Client Entity' ? auditHeader.clientName : (activeClient?.gstin ? `Client (${activeClient.gstin})` : 'DYP INFRAPROJECTS PRIVATE LIMITED'));
        const resolvedGstin = activeClient?.gstin || auditHeader.clientGstin || '27AAGCD4105L1ZO';
        const resolvedPartner = (auditHeader.reviewedBy && auditHeader.reviewedBy !== 'admin' && !auditHeader.reviewedBy.includes('Vaswani'))
            ? auditHeader.reviewedBy
            : (auditHeader.auditorName && auditHeader.auditorName !== 'admin' && !auditHeader.auditorName.includes('Vaswani')
                ? auditHeader.auditorName 
                : 'Engagement Article (Audit Lead)');

        const bundle: MonthlyAuditExportBundle = {
            header: {
                ...auditHeader,
                clientName: resolvedClientName,
                clientGstin: resolvedGstin,
                reviewedBy: resolvedPartner,
                auditorName: resolvedPartner
            },
            registers,
            checklists,
            verification,
            observations,
            pendingPoints,
            profitability
        };
        exportMonthlyAuditToPdf(bundle);
        toast.success('Corporate Executive Audit Report (PDF) downloaded!');
    };

    // ─── Tally SA 530 Voucher Sampling Handlers (Approach A) ───────────────────
    const handlePullAndSampleFromTally = async () => {
        setIsSamplingTally(true);
        try {
            const res = await pullAndSampleFromTally({
                auditId: auditHeader.id,
                clientGstin: selectedClientGstin,
                clientName: activeClient.legalName,
                fy: selectedFy,
                month: selectedMonth,
                existingRegisters: registers,
                existingSamples: voucherSamples
            });

            setRegisters(res.updatedRegisters);
            setVoucherSamples(res.samples);

            // Automatically persist to SQLite DB backend
            try {
                await safeApiFetch(`/api/monthly-audits/${encodeURIComponent(auditHeader.id)}/samples/batch`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        replaceAll: true,
                        samples: res.samples.map(s => ({
                            id: s.id,
                            register_key: s.registerKey,
                            voucher_id: s.voucherId,
                            voucher_type: s.voucherType,
                            voucher_number: s.voucherNumber,
                            date: s.date,
                            party_name: s.partyName,
                            amount: s.amount,
                            sampling_rule: s.samplingRule,
                            stratum: s.stratum,
                            status: s.status,
                            auditor_remarks: s.auditorRemarks,
                            supporting_doc_ref: s.supportingDocRef,
                            verified_by: s.verifiedBy,
                            verified_at: s.verifiedAt
                        }))
                    })
                });
            } catch (saveErr) {
                console.warn('[Voucher Sampling] Backend save error:', saveErr);
            }

            if (res.isOnline) {
                toast.success('Live Tally Vouchers Pulled & Sampled!', {
                    description: `Extracted live vouchers from Port 9000. Generated ${res.totalSampleCount} SA 530 samples.`
                });
            } else {
                toast.info('Tally Port 9000 Offline — Demo Mode Active', {
                    description: `Generated ${res.totalSampleCount} simulated test samples across all 5 registers for ${selectedMonth} ${selectedFy}.`
                });
            }
        } catch (err: any) {
            toast.error(`Sampling failed: ${err.message}`);
        } finally {
            setIsSamplingTally(false);
        }
    };

    const handleUpdateSampleStatus = async (sampleId: string, status: AuditVoucherSample['status']) => {
        const userTitle = getLoggedInUserTitle() || 'Auditor';
        setVoucherSamples(prev => prev.map(s => {
            if (s.id === sampleId) {
                return {
                    ...s,
                    status,
                    verifiedBy: status === 'Verified' ? userTitle : s.verifiedBy,
                    verifiedAt: status === 'Verified' ? Date.now() : s.verifiedAt
                };
            }
            return s;
        }));

        try {
            await safeApiFetch(`/api/monthly-audits/${encodeURIComponent(auditHeader.id)}/samples/${encodeURIComponent(sampleId)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status,
                    verified_by: status === 'Verified' ? userTitle : undefined
                })
            });
        } catch (err) {
            console.warn('[Update Sample Status] Error:', err);
        }
    };

    const handleUpdateSampleRemarks = (sampleId: string, remarks: string) => {
        setVoucherSamples(prev => prev.map(s => s.id === sampleId ? { ...s, auditorRemarks: remarks } : s));
    };

    const handleUpdateSampleDocRef = (sampleId: string, ref: string) => {
        setVoucherSamples(prev => prev.map(s => s.id === sampleId ? { ...s, supportingDocRef: ref } : s));
    };

    const handleMarkAllFilteredVerified = async () => {
        const userTitle = getLoggedInUserTitle() || 'Auditor';
        const filteredIds = new Set(
            voucherSamples
                .filter(s => activeSampleRegisterKey === 'all' || s.registerKey === activeSampleRegisterKey)
                .map(s => s.id)
        );

        setVoucherSamples(prev => prev.map(s => {
            if (filteredIds.has(s.id)) {
                return { ...s, status: 'Verified', verifiedBy: userTitle, verifiedAt: Date.now() };
            }
            return s;
        }));

        toast.success(`Marked all ${filteredIds.size} samples as Verified`);
    };

    const handlePushSampleToObservation = async (sample: AuditVoucherSample) => {
        const obsId = `OBS_${Date.now()}`;
        const exposure = Number(sample.amount) || 0;
        const newFinding: AuditObservationItem = {
            id: obsId,
            auditId: auditHeader.id,
            clientGstin: selectedClientGstin,
            sectionKey: sample.registerKey === 'sales' ? 'sales' : (sample.registerKey === 'purchase' ? 'purchase' : 'journal'),
            title: `Vouching Query: ${sample.voucherType} #${sample.voucherNumber} (${sample.partyName})`,
            description: `Audit sample scrutiny under ${sample.samplingRule} (${sample.stratum || 'General'}). Auditor remark: ${sample.auditorRemarks || 'Supporting documentation / tax discrepancy under audit scrutiny.'}`,
            severity: exposure >= 100000 ? 'High' : 'Medium',
            riskCategory: sample.registerKey === 'sales' ? 'GST Outward' : (sample.registerKey === 'purchase' ? 'ITC Blocked/Eligibility' : 'Internal Controls'),
            financialExposure: exposure,
            voucherRef: `${sample.voucherType} #${sample.voucherNumber} Dt: ${sample.date}`,
            auditorRecommendation: 'Obtain vendor confirmation, e-way bill / physical GRN, and reconcile with GST returns.',
            status: 'Open',
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        setObservations(prev => [newFinding, ...prev]);

        try {
            await safeApiFetch(`/api/monthly-audits/${encodeURIComponent(auditHeader.id)}/observations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...newFinding,
                    obsId: newFinding.id,
                    client_gstin: selectedClientGstin,
                    section_key: newFinding.sectionKey,
                    risk_category: newFinding.riskCategory,
                    financial_exposure: newFinding.financialExposure,
                    voucher_ref: newFinding.voucherRef,
                    auditor_recommendation: newFinding.auditorRecommendation
                })
            });
            toast.success(`Created observation for voucher ${sample.voucherNumber}`, {
                description: 'Finding linked to Section 4. Current Period Observations'
            });
        } catch (err: any) {
            toast.error(`Could not save observation: ${err.message}`);
        }
    };

    const handleExportSamplingExcel = () => {
        try {
            exportVoucherSamplesToExcel(
                voucherSamples,
                registers,
                activeClient.legalName,
                `${selectedMonth} ${selectedFy}`
            );
            toast.success('Downloaded SA 530 Voucher Samples Excel Paper (Zero-Merge)');
        } catch (err: any) {
            toast.error(`Export failed: ${err.message}`);
        }
    };

    // ─── Permissions Logic ─────────────────────────────────────────────────────
    const isJuniorAllowedToEdit = canJuniorEdit(auditHeader.auditStatus);
    const isSeniorReviewAllowed = auditHeader.auditStatus !== 'APPROVED';
    const isReleaseAllowed = canReleaseToClient(auditHeader.auditStatus);

    // ─── 5 Core Registers Vouching Scope Checklist Section Renderer ────────────
    const renderVouchingScopeSection = () => {
        const totalPopCount = registers.reduce((sum, r) => sum + (Number(r.totalVouchers) || 0), 0);
        const totalSampleCount = voucherSamples.length;
        const totalAuditedVal = registers.reduce((sum, r) => sum + (Number(r.auditedAmount) || 0), 0);
        const totalVerifiedCount = voucherSamples.filter(s => s.status === 'Verified').length;
        const totalQueryCount = voucherSamples.filter(s => s.status === 'Query Raised').length;
        const totalDocMissingCount = voucherSamples.filter(s => s.status === 'Document Missing').length;

        const filteredSamples = voucherSamples.filter(s => {
            const matchesReg = activeSampleRegisterKey === 'all' || s.registerKey === activeSampleRegisterKey;
            const matchesStatus = sampleStatusFilter === 'all' || s.status === sampleStatusFilter;
            const query = sampleSearchQuery.trim().toLowerCase();
            const matchesQuery = !query ||
                (s.partyName && s.partyName.toLowerCase().includes(query)) ||
                (s.voucherNumber && s.voucherNumber.toLowerCase().includes(query)) ||
                (s.voucherType && s.voucherType.toLowerCase().includes(query)) ||
                (s.auditorRemarks && s.auditorRemarks.toLowerCase().includes(query)) ||
                String(s.amount).includes(query);
            return matchesReg && matchesStatus && matchesQuery;
        });

        return (
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-3 mb-2">
                    <div>
                        <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                            <Layers className="w-4 h-4 text-indigo-600" />
                            <span>3. 5 Core Registers Vouching Scope Checklist</span>
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Substantive audit sampling framework under ICAI Standards (SA 530) across 5 core business registers
                        </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-mono text-indigo-700 bg-indigo-50 px-2.5 py-1.5 rounded-lg border border-indigo-200 font-bold uppercase tracking-wider">
                            ICAI SA 530 Sampling
                        </span>

                        {/* Pull & Sample from Tally Button */}
                        <button
                            type="button"
                            onClick={handlePullAndSampleFromTally}
                            disabled={isSamplingTally || !isJuniorAllowedToEdit}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
                            title="Connects to Tally Prime Port 9000, pulls register vouchers, and runs ICAI SA 530 sampling"
                        >
                            <RotateCcw className={`w-3.5 h-3.5 ${isSamplingTally ? 'animate-spin' : ''}`} />
                            <span>{isSamplingTally ? 'Sampling from Tally...' : 'Pull & Sample from Tally'}</span>
                        </button>

                        {/* View Samples Drawer Button */}
                        <button
                            type="button"
                            onClick={() => {
                                setActiveSampleRegisterKey('all');
                                setSampleDrawerOpen(true);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition border border-slate-200 shadow-2xs cursor-pointer"
                        >
                            <Eye className="w-3.5 h-3.5 text-slate-600" />
                            <span>View Samples ({voucherSamples.length})</span>
                        </button>

                        {/* Export SA 530 Excel */}
                        <button
                            type="button"
                            onClick={handleExportSamplingExcel}
                            disabled={voucherSamples.length === 0}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl text-xs font-bold transition border border-emerald-200 cursor-pointer disabled:opacity-40"
                            title="Export SA 530 Voucher Working Papers to Zero-Merge Excel"
                        >
                            <Download className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="hidden sm:inline">Export Samples</span>
                        </button>
                    </div>
                </div>

                {/* Vouching Key Metrics Ribbon */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs">
                    <div className="space-y-0.5">
                        <span className="text-[10px] uppercase font-bold text-slate-400">Total Population</span>
                        <div className="text-sm font-bold text-slate-800 font-mono">
                            {totalPopCount.toLocaleString('en-IN')} <span className="text-[10px] text-slate-500 font-normal">vouchers</span>
                        </div>
                    </div>
                    <div className="space-y-0.5">
                        <span className="text-[10px] uppercase font-bold text-slate-400">Sample Drawn (SA 530)</span>
                        <div className="text-sm font-bold text-indigo-700 font-mono">
                            {totalSampleCount} <span className="text-[10px] text-indigo-500 font-normal">({totalPopCount > 0 ? Math.round((totalSampleCount / totalPopCount) * 100) : 0}%)</span>
                        </div>
                    </div>
                    <div className="space-y-0.5">
                        <span className="text-[10px] uppercase font-bold text-slate-400">Audited Sample Value</span>
                        <div className="text-sm font-bold text-slate-900 font-mono">
                            ₹{totalAuditedVal.toLocaleString('en-IN')}
                        </div>
                    </div>
                    <div className="space-y-0.5">
                        <span className="text-[10px] uppercase font-bold text-slate-400">Audit Scrutiny Status</span>
                        <div className="text-xs font-semibold flex items-center gap-2 flex-wrap">
                            <span className="text-emerald-700 font-mono">{totalVerifiedCount} Verified</span>
                            {totalQueryCount > 0 && <span className="text-amber-700 font-mono">({totalQueryCount} Queries)</span>}
                            {totalDocMissingCount > 0 && <span className="text-rose-700 font-mono">({totalDocMissingCount} Missing)</span>}
                        </div>
                    </div>
                </div>

                {/* Register Names Tabs Navigation */}
                <div className="flex items-center gap-1.5 border-b border-slate-200 overflow-x-auto pb-0 pt-1">
                    <button
                        type="button"
                        onClick={() => setActiveVouchingRegisterTab('all')}
                        className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-t-xl transition border-b-2 whitespace-nowrap cursor-pointer ${
                            activeVouchingRegisterTab === 'all'
                                ? 'border-indigo-600 text-indigo-700 bg-indigo-50/70 shadow-2xs'
                                : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                        }`}
                    >
                        <Layers className="w-3.5 h-3.5" />
                        <span>All 5 Registers (Overview)</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-slate-200/70 text-slate-700">5</span>
                    </button>
                    {registers.map(r => {
                        const count = voucherSamples.filter(s => s.registerKey === r.key).length;
                        const verified = voucherSamples.filter(s => s.registerKey === r.key && s.status === 'Verified').length;
                        const queries = voucherSamples.filter(s => s.registerKey === r.key && s.status === 'Query Raised').length;
                        const isSelected = activeVouchingRegisterTab === r.key;
                        return (
                            <button
                                key={r.key}
                                type="button"
                                onClick={() => setActiveVouchingRegisterTab(r.key as any)}
                                className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-t-xl transition border-b-2 whitespace-nowrap cursor-pointer ${
                                    isSelected
                                        ? 'border-indigo-600 text-indigo-700 bg-indigo-50/70 shadow-2xs'
                                        : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                                }`}
                            >
                                <span>{r.registerName}</span>
                                {count > 0 ? (
                                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                                        isSelected ? 'bg-indigo-200/80 text-indigo-800 font-bold' : 'bg-slate-100 text-slate-600'
                                    }`}>
                                        {count}{verified > 0 ? ` (${verified}✓)` : ''}{queries > 0 ? ` (${queries}⚠️)` : ''}
                                    </span>
                                ) : null}
                            </button>
                        );
                    })}
                </div>

                {/* TAB CONTENT 1: ALL 5 REGISTERS OVERVIEW TABLE */}
                {activeVouchingRegisterTab === 'all' && (
                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[11px] border-b border-slate-200">
                                <tr>
                                    <th className="py-3 px-4 whitespace-normal break-words">Register Name</th>
                                    <th className="py-3 px-4 whitespace-normal break-words">Sampling Technique Used (SA 530)</th>
                                    <th className="py-3 px-4 whitespace-normal break-words">Sample % Checked</th>
                                    <th className="py-3 px-4 whitespace-normal break-words">Total Vouchers</th>
                                    <th className="py-3 px-4 whitespace-normal break-words">Audited Amount (₹)</th>
                                    <th className="py-3 px-4 whitespace-normal break-words">Voucher Samples</th>
                                    <th className="py-3 px-4 whitespace-normal break-words">Auditor Notes &amp; Observations</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {registers.map((r, idx) => {
                                    const regSamples = voucherSamples.filter(s => s.registerKey === r.key);
                                    const regVerifiedCount = regSamples.filter(s => s.status === 'Verified').length;
                                    const regQueryCount = regSamples.filter(s => s.status === 'Query Raised').length;

                                    return (
                                        <tr key={r.key} className="hover:bg-slate-50/80 transition-colors">
                                            <td className="py-3 px-4 font-bold text-slate-900 whitespace-normal break-words">
                                                <button
                                                    type="button"
                                                    onClick={() => setActiveVouchingRegisterTab(r.key as any)}
                                                    className="flex items-center gap-1.5 text-left text-slate-900 hover:text-indigo-600 transition font-bold group cursor-pointer"
                                                    title={`Open ${r.registerName} Tab`}
                                                >
                                                    <span>{r.registerName}</span>
                                                    <ExternalLink className="w-3 h-3 text-slate-400 group-hover:text-indigo-600 opacity-60 group-hover:opacity-100 transition" />
                                                </button>
                                            </td>
                                            <td className="py-3 px-4">
                                                <select
                                                    disabled={!isJuniorAllowedToEdit}
                                                    value={r.samplingTechnique || (r.vouched === 'Yes' ? '100% Comprehensive Examination' : 'Stratified Sampling')}
                                                    onChange={(e) => {
                                                        const updated = [...registers];
                                                        updated[idx].samplingTechnique = e.target.value;
                                                        updated[idx].vouched = e.target.value.includes('100%') ? 'Yes' : 'Partial';
                                                        setRegisters(updated);
                                                    }}
                                                    className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-semibold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition cursor-pointer max-w-[280px]"
                                                >
                                                    <option value="Random Selection (Simple Random Sampling)">
                                                        Random Selection (Simple Random Sampling)
                                                    </option>
                                                    <option value="Systematic Selection (Interval Sampling)">
                                                        Systematic Selection (Interval Sampling)
                                                    </option>
                                                    <option value="Stratified Sampling">
                                                        Stratified Sampling (Value-Stratified)
                                                    </option>
                                                    <option value="Monetary Unit Sampling (MUS)">
                                                        Monetary Unit Sampling (MUS)
                                                    </option>
                                                    <option value="100% Comprehensive Examination">
                                                        100% Comprehensive Examination
                                                    </option>
                                                    <option value="Haphazard Selection">
                                                        Haphazard Selection
                                                    </option>
                                                </select>
                                            </td>
                                            <td className="py-3 px-4">
                                                <input
                                                    type="text"
                                                    disabled={!isJuniorAllowedToEdit}
                                                    value={r.sampleChecked}
                                                    onChange={(e) => {
                                                        const updated = [...registers];
                                                        updated[idx].sampleChecked = e.target.value;
                                                        setRegisters(updated);
                                                    }}
                                                    className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-900 font-mono w-28 focus:outline-none"
                                                />
                                            </td>
                                            <td className="py-3 px-4">
                                                <input
                                                    type="number"
                                                    disabled={!isJuniorAllowedToEdit}
                                                    value={r.totalVouchers}
                                                    onChange={(e) => {
                                                        const updated = [...registers];
                                                        updated[idx].totalVouchers = Number(e.target.value) || 0;
                                                        setRegisters(updated);
                                                    }}
                                                    className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-900 font-mono w-24 focus:outline-none"
                                                />
                                            </td>
                                            <td className="py-3 px-4">
                                                <input
                                                    type="number"
                                                    disabled={!isJuniorAllowedToEdit}
                                                    value={r.auditedAmount}
                                                    onChange={(e) => {
                                                        const updated = [...registers];
                                                        updated[idx].auditedAmount = Number(e.target.value) || 0;
                                                        setRegisters(updated);
                                                    }}
                                                    className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-900 font-mono w-32 focus:outline-none"
                                                />
                                            </td>
                                            <td className="py-3 px-4">
                                                {regSamples.length > 0 ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => setActiveVouchingRegisterTab(r.key as any)}
                                                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition shadow-2xs cursor-pointer"
                                                        title={`Inspect ${regSamples.length} sampled vouchers in ${r.registerName} Tab`}
                                                    >
                                                        <Eye className="w-3 h-3" />
                                                        <span>{regSamples.length} Samples</span>
                                                        <span className="text-[10px] text-emerald-600 font-mono font-normal">({regVerifiedCount}✓)</span>
                                                        {regQueryCount > 0 && <span className="text-[10px] text-amber-600 font-mono font-bold">({regQueryCount}⚠️)</span>}
                                                    </button>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={handlePullAndSampleFromTally}
                                                        disabled={isSamplingTally || !isJuniorAllowedToEdit}
                                                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-slate-500 hover:text-indigo-600 hover:bg-slate-50 border border-dashed border-slate-300 transition cursor-pointer"
                                                    >
                                                        <Zap className="w-3 h-3 text-amber-500" />
                                                        <span>Pull Samples</span>
                                                    </button>
                                                )}
                                            </td>
                                            <td className="py-3 px-4">
                                                <input
                                                    type="text"
                                                    disabled={!isJuniorAllowedToEdit}
                                                    value={r.remarks}
                                                    onChange={(e) => {
                                                        const updated = [...registers];
                                                        updated[idx].remarks = e.target.value;
                                                        setRegisters(updated);
                                                    }}
                                                    className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-900 w-full focus:outline-none"
                                                    placeholder="Vouching notes..."
                                                />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* TAB CONTENT 2: SPECIFIC REGISTER FOCUSED WORKING PAPER VIEW */}
                {activeVouchingRegisterTab !== 'all' && (() => {
                    const activeReg = registers.find(r => r.key === activeVouchingRegisterTab) || registers[0];
                    const activeRegIdx = registers.findIndex(r => r.key === activeVouchingRegisterTab);
                    const regVouchers = voucherSamples.filter(s => s.registerKey === activeVouchingRegisterTab);
                    const regVerified = regVouchers.filter(s => s.status === 'Verified').length;
                    const regQueries = regVouchers.filter(s => s.status === 'Query Raised').length;
                    const regMissing = regVouchers.filter(s => s.status === 'Document Missing').length;

                    const regFilteredVouchers = regVouchers.filter(s => {
                        const matchesStatus = sampleStatusFilter === 'all' || s.status === sampleStatusFilter;
                        const query = sampleSearchQuery.trim().toLowerCase();
                        const matchesQuery = !query ||
                            (s.partyName && s.partyName.toLowerCase().includes(query)) ||
                            (s.voucherNumber && s.voucherNumber.toLowerCase().includes(query)) ||
                            (s.voucherType && s.voucherType.toLowerCase().includes(query)) ||
                            (s.auditorRemarks && s.auditorRemarks.toLowerCase().includes(query)) ||
                            String(s.amount).includes(query);
                        return matchesStatus && matchesQuery;
                    });

                    return (
                        <div className="space-y-4 animate-fade-in">
                            {/* Focused Register Substantive Parameters Card */}
                            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/90 space-y-3">
                                <div className="flex items-center justify-between flex-wrap gap-2">
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-sm font-bold text-slate-900 uppercase">
                                            {activeReg.registerName} — Substantive Audit Working Paper
                                        </h3>
                                        <span className="text-[10px] font-mono text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded font-bold uppercase">
                                            {activeReg.samplingTechnique || 'Stratified Sampling'}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setActiveVouchingRegisterTab('all')}
                                            className="px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-indigo-600 bg-white border border-slate-200 rounded-lg transition"
                                        >
                                            ← Back to Overview Table
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleMarkAllFilteredVerified}
                                            disabled={!isJuniorAllowedToEdit || regVouchers.length === 0}
                                            className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-bold transition border border-slate-200 cursor-pointer disabled:opacity-40"
                                            title="Mark all samples in this register as Verified"
                                        >
                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                            <span>Mark All Verified</span>
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-5 gap-3 pt-1">
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-bold text-slate-500 uppercase">Sampling Technique</label>
                                        <select
                                            disabled={!isJuniorAllowedToEdit}
                                            value={activeReg.samplingTechnique || 'Stratified Sampling'}
                                            onChange={(e) => {
                                                const updated = [...registers];
                                                if (activeRegIdx >= 0) {
                                                    updated[activeRegIdx].samplingTechnique = e.target.value;
                                                    updated[activeRegIdx].vouched = e.target.value.includes('100%') ? 'Yes' : 'Partial';
                                                    setRegisters(updated);
                                                }
                                            }}
                                            className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-semibold focus:outline-none focus:border-indigo-500 transition"
                                        >
                                            <option value="Stratified Sampling">Stratified Sampling (Value-Stratified)</option>
                                            <option value="100% Comprehensive Examination">100% Comprehensive Examination</option>
                                            <option value="Random Selection (Simple Random Sampling)">Random Selection (Simple Random Sampling)</option>
                                            <option value="Systematic Selection (Interval Sampling)">Systematic Selection (Interval Sampling)</option>
                                            <option value="Monetary Unit Sampling (MUS)">Monetary Unit Sampling (MUS)</option>
                                            <option value="Haphazard Selection">Haphazard Selection</option>
                                        </select>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[11px] font-bold text-slate-500 uppercase">Sample % Checked</label>
                                        <input
                                            type="text"
                                            disabled={!isJuniorAllowedToEdit}
                                            value={activeReg.sampleChecked}
                                            onChange={(e) => {
                                                const updated = [...registers];
                                                if (activeRegIdx >= 0) {
                                                    updated[activeRegIdx].sampleChecked = e.target.value;
                                                    setRegisters(updated);
                                                }
                                            }}
                                            className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-mono focus:outline-none focus:border-indigo-500 transition"
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[11px] font-bold text-slate-500 uppercase">Total Population</label>
                                        <input
                                            type="number"
                                            disabled={!isJuniorAllowedToEdit}
                                            value={activeReg.totalVouchers}
                                            onChange={(e) => {
                                                const updated = [...registers];
                                                if (activeRegIdx >= 0) {
                                                    updated[activeRegIdx].totalVouchers = Number(e.target.value) || 0;
                                                    setRegisters(updated);
                                                }
                                            }}
                                            className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-mono focus:outline-none focus:border-indigo-500 transition"
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[11px] font-bold text-slate-500 uppercase">Audited Amount (₹)</label>
                                        <input
                                            type="number"
                                            disabled={!isJuniorAllowedToEdit}
                                            value={activeReg.auditedAmount}
                                            onChange={(e) => {
                                                const updated = [...registers];
                                                if (activeRegIdx >= 0) {
                                                    updated[activeRegIdx].auditedAmount = Number(e.target.value) || 0;
                                                    setRegisters(updated);
                                                }
                                            }}
                                            className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-mono focus:outline-none focus:border-indigo-500 transition"
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[11px] font-bold text-slate-500 uppercase">Auditor Notes</label>
                                        <input
                                            type="text"
                                            disabled={!isJuniorAllowedToEdit}
                                            value={activeReg.remarks}
                                            onChange={(e) => {
                                                const updated = [...registers];
                                                if (activeRegIdx >= 0) {
                                                    updated[activeRegIdx].remarks = e.target.value;
                                                    setRegisters(updated);
                                                }
                                            }}
                                            className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-indigo-500 transition"
                                            placeholder="Vouching notes..."
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Register Sampled Vouchers Inline Section */}
                            <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
                                <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-slate-800">
                                            {activeReg.registerName} Samples ({regVouchers.length})
                                        </span>
                                        <span className="text-slate-400">•</span>
                                        <span className="text-emerald-700 font-semibold">{regVerified} Verified</span>
                                        {regQueries > 0 && <span className="text-amber-700 font-bold">({regQueries} Queries)</span>}
                                        {regMissing > 0 && <span className="text-rose-700 font-bold">({regMissing} Missing)</span>}
                                    </div>

                                    {/* Register Filter Controls */}
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <div className="relative">
                                            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                                            <input
                                                type="text"
                                                placeholder="Search in this register..."
                                                value={sampleSearchQuery}
                                                onChange={e => setSampleSearchQuery(e.target.value)}
                                                className="bg-white border border-slate-200 rounded-lg pl-8 pr-2.5 py-1 text-xs text-slate-900 focus:outline-none focus:border-indigo-500 transition w-48 sm:w-56"
                                            />
                                        </div>
                                        <div className="flex items-center gap-1 bg-slate-200/60 p-0.5 rounded-lg text-xs font-semibold">
                                            {(['all', 'Pending', 'Verified', 'Query Raised', 'Document Missing'] as const).map(st => (
                                                <button
                                                    key={st}
                                                    type="button"
                                                    onClick={() => setSampleStatusFilter(st)}
                                                    className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition cursor-pointer ${
                                                        sampleStatusFilter === st
                                                            ? 'bg-white text-slate-900 shadow-2xs'
                                                            : 'text-slate-500 hover:text-slate-900'
                                                    }`}
                                                >
                                                    {st === 'all' ? 'All' : st}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="p-3.5 space-y-2.5 max-h-[500px] overflow-y-auto bg-[#F8FAFC]">
                                    {regFilteredVouchers.length === 0 ? (
                                        <div className="text-center py-10 text-slate-400 text-xs">
                                            {regVouchers.length === 0 ? (
                                                <div className="space-y-2">
                                                    <Layers className="w-8 h-8 text-slate-300 mx-auto" />
                                                    <p className="font-semibold text-slate-600">No samples drawn for {activeReg.registerName} yet.</p>
                                                    <p>Click "Pull &amp; Sample from Tally" to extract live or test vouchers under SA 530.</p>
                                                    <button
                                                        type="button"
                                                        onClick={handlePullAndSampleFromTally}
                                                        className="mt-2 px-3.5 py-1.5 bg-indigo-600 text-white rounded-xl text-xs font-bold transition hover:bg-indigo-700 cursor-pointer"
                                                    >
                                                        Pull &amp; Sample Now
                                                    </button>
                                                </div>
                                            ) : (
                                                <p>No vouchers in {activeReg.registerName} match your current filter.</p>
                                            )}
                                        </div>
                                    ) : (
                                        regFilteredVouchers.map((sample) => (
                                            <div
                                                key={sample.id}
                                                className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-3 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:border-indigo-300 transition"
                                            >
                                                {/* Voucher Metadata */}
                                                <div className="space-y-1 min-w-[220px] flex-1">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="font-mono text-[11px] font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                                            {sample.voucherNumber}
                                                        </span>
                                                        <span className="text-xs font-semibold text-slate-500 font-mono">
                                                            {sample.date}
                                                        </span>
                                                        <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded font-bold bg-slate-100 text-slate-700">
                                                            {sample.voucherType}
                                                        </span>
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                                            sample.stratum?.includes('High') ? 'bg-red-50 text-red-700 border-red-200' :
                                                            sample.stratum?.includes('Medium') ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                            'bg-slate-100 text-slate-700 border-slate-200'
                                                        }`}>
                                                            {sample.stratum || 'General Stratum'}
                                                        </span>
                                                    </div>
                                                    <div className="text-xs font-bold text-slate-900">
                                                        {sample.partyName}
                                                    </div>
                                                    <div className="text-[11px] font-mono font-bold text-indigo-700">
                                                        ₹{sample.amount.toLocaleString('en-IN')}
                                                    </div>
                                                </div>

                                                {/* Inputs: Remarks & Doc Ref */}
                                                <div className="flex-1 space-y-1.5 min-w-[200px]">
                                                    <input
                                                        type="text"
                                                        placeholder="Auditor scrutiny remarks / findings..."
                                                        value={sample.auditorRemarks || ''}
                                                        onChange={e => handleUpdateSampleRemarks(sample.id, e.target.value)}
                                                        disabled={!isJuniorAllowedToEdit}
                                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-indigo-500 transition"
                                                    />
                                                    <input
                                                        type="text"
                                                        placeholder="Supporting Doc Ref (Invoice / EWB / GRN #)..."
                                                        value={sample.supportingDocRef || ''}
                                                        onChange={e => handleUpdateSampleDocRef(sample.id, e.target.value)}
                                                        disabled={!isJuniorAllowedToEdit}
                                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-[11px] font-mono text-slate-900 focus:outline-none focus:bg-white focus:border-indigo-500 transition"
                                                    />
                                                </div>

                                                {/* Status Selector & Push to Obs Button */}
                                                <div className="flex md:flex-col items-center md:items-end gap-2 shrink-0">
                                                    <select
                                                        value={sample.status}
                                                        disabled={!isJuniorAllowedToEdit}
                                                        onChange={e => handleUpdateSampleStatus(sample.id, e.target.value as any)}
                                                        className={`border rounded-lg px-2.5 py-1 text-xs font-bold focus:outline-none cursor-pointer transition w-full ${
                                                            sample.status === 'Verified' ? 'bg-emerald-50 text-emerald-800 border-emerald-300' :
                                                            sample.status === 'Query Raised' ? 'bg-amber-50 text-amber-800 border-amber-300' :
                                                            sample.status === 'Document Missing' ? 'bg-rose-50 text-rose-800 border-rose-300' :
                                                            'bg-slate-50 text-slate-800 border-slate-300'
                                                        }`}
                                                    >
                                                        <option value="Pending">Pending</option>
                                                        <option value="Verified">Verified ✓</option>
                                                        <option value="Query Raised">Query Raised ⚠️</option>
                                                        <option value="Document Missing">Document Missing 📄</option>
                                                    </select>

                                                    <div className="flex items-center gap-1.5">
                                                        {/* Quick Tick Box (Verify Voucher) */}
                                                        <label
                                                            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] font-bold transition cursor-pointer select-none ${
                                                                sample.status === 'Verified'
                                                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300 shadow-2xs'
                                                                    : 'bg-white hover:bg-slate-50 text-slate-600 border-slate-200'
                                                            }`}
                                                            title={sample.status === 'Verified' ? 'Voucher Verified (Click to uncheck)' : 'Click to tick & verify voucher'}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                disabled={!isJuniorAllowedToEdit}
                                                                checked={sample.status === 'Verified'}
                                                                onChange={(e) => handleUpdateSampleStatus(sample.id, e.target.checked ? 'Verified' : 'Pending')}
                                                                className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 cursor-pointer accent-emerald-600"
                                                            />
                                                            <span>Verify</span>
                                                        </label>

                                                        <button
                                                            type="button"
                                                            onClick={() => handlePushSampleToObservation(sample)}
                                                            className="flex items-center gap-1 text-[11px] font-bold text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2 py-1 rounded-lg transition cursor-pointer"
                                                            title="Push this voucher deficiency into Section 4. Current Period Observations"
                                                        >
                                                            <AlertTriangle className="w-3 h-3 text-amber-600" />
                                                            <span>Push to Obs</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })()}

                {/* ICAI SA 530 Audit Sampling Technical Reference Callout */}
                <div className="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2.5">
                    <div className="font-bold text-slate-900 flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-indigo-600" />
                        <span>ICAI SA 530 — Standardized Audit Sampling Techniques Guide:</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] text-slate-600">
                        <div className="p-3 rounded-lg bg-white border border-slate-200 shadow-2xs">
                            <span className="font-bold text-slate-900 block mb-1">
                                • Random Selection (Simple Random Sampling):
                            </span>
                            <span>Items are selected using random number tables or computer generators (like audit software). Every single voucher in the population has an equal chance of selection.</span>
                        </div>
                        <div className="p-3 rounded-lg bg-white border border-slate-200 shadow-2xs">
                            <span className="font-bold text-slate-900 block mb-1">
                                • Systematic Selection (Interval Sampling):
                            </span>
                            <span>The auditor selects items at regular intervals determined by a calculated sampling gap (e.g., checking every 20th invoice voucher) after a randomly chosen starting point.</span>
                        </div>
                        <div className="p-3 rounded-lg bg-white border border-slate-200 shadow-2xs">
                            <span className="font-bold text-slate-900 block mb-1">
                                • Stratified Sampling:
                            </span>
                            <span>The population is divided into separate groups (strata) based on specific characteristics—such as grouping vouchers by monetary value (e.g., above ₹1,00,000). Random or systematic sampling is then applied to each group.</span>
                        </div>
                        <div className="p-3 rounded-lg bg-white border border-slate-200 shadow-2xs">
                            <span className="font-bold text-slate-900 block mb-1">
                                • Monetary Unit Sampling (MUS):
                            </span>
                            <span>A value-weighted selection method where the sample size, selection, and evaluation result in a conclusion in monetary amounts rather than transaction counts.</span>
                        </div>
                    </div>
                </div>

                {/* ─── MODAL / DRAWER: SA 530 SUBSTANTIVE VOUCHER SAMPLES ─────────── */}
                {sampleDrawerOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
                        <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
                            {/* Drawer Header */}
                            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <Layers className="w-5 h-5 text-indigo-600" />
                                        <h3 className="text-base font-bold text-slate-900 uppercase tracking-wide">
                                            SA 530 Substantive Audit Voucher Samples
                                        </h3>
                                        <span className="text-[11px] font-mono text-indigo-700 bg-indigo-100 px-2.5 py-0.5 rounded-full font-bold">
                                            {voucherSamples.length} Samples
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-500 mt-1">
                                        Client: <strong className="text-slate-800">{activeClient.legalName}</strong> | Period: <strong className="text-slate-800">{selectedMonth} {selectedFy}</strong> | Standard on Auditing (SA 530)
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={handleExportSamplingExcel}
                                        disabled={voucherSamples.length === 0}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
                                        title="Export Zero-Merge Excel Working Paper"
                                    >
                                        <Download className="w-3.5 h-3.5" />
                                        <span>Export Excel</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setSampleDrawerOpen(false)}
                                        className="w-8 h-8 rounded-xl bg-slate-200/80 hover:bg-slate-300 text-slate-600 flex items-center justify-center transition cursor-pointer"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            {/* Register Filter Tabs */}
                            <div className="px-5 pt-3 border-b border-slate-200 flex items-center gap-1.5 overflow-x-auto bg-white shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setActiveSampleRegisterKey('all')}
                                    className={`px-3 py-2 text-xs font-bold rounded-t-lg transition border-b-2 whitespace-nowrap cursor-pointer ${
                                        activeSampleRegisterKey === 'all'
                                            ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50'
                                            : 'border-transparent text-slate-500 hover:text-slate-800'
                                    }`}
                                >
                                    All Registers ({voucherSamples.length})
                                </button>
                                {registers.map(r => {
                                    const count = voucherSamples.filter(s => s.registerKey === r.key).length;
                                    return (
                                        <button
                                            key={r.key}
                                            type="button"
                                            onClick={() => setActiveSampleRegisterKey(r.key)}
                                            className={`px-3 py-2 text-xs font-bold rounded-t-lg transition border-b-2 whitespace-nowrap cursor-pointer ${
                                                activeSampleRegisterKey === r.key
                                                    ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50'
                                                    : 'border-transparent text-slate-500 hover:text-slate-800'
                                            }`}
                                        >
                                            {r.registerName} ({count})
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Toolbar: Search, Status Filter & Bulk Actions */}
                            <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-white shrink-0">
                                <div className="flex items-center gap-2 flex-1 min-w-[260px]">
                                    <div className="relative flex-1">
                                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                                        <input
                                            type="text"
                                            placeholder="Search by party, voucher no., amount..."
                                            value={sampleSearchQuery}
                                            onChange={e => setSampleSearchQuery(e.target.value)}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition"
                                        />
                                    </div>
                                    {sampleSearchQuery && (
                                        <button
                                            type="button"
                                            onClick={() => setSampleSearchQuery('')}
                                            className="text-xs text-slate-400 hover:text-slate-600 font-bold"
                                        >
                                            Clear
                                        </button>
                                    )}
                                </div>

                                <div className="flex items-center gap-2 flex-wrap">
                                    {/* Status Filter Dropdown / Pills */}
                                    <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
                                        {(['all', 'Pending', 'Verified', 'Query Raised', 'Document Missing'] as const).map(st => (
                                            <button
                                                key={st}
                                                type="button"
                                                onClick={() => setSampleStatusFilter(st)}
                                                className={`px-2.5 py-1 rounded-lg transition text-[11px] font-bold cursor-pointer ${
                                                    sampleStatusFilter === st
                                                        ? 'bg-white text-slate-900 shadow-2xs'
                                                        : 'text-slate-500 hover:text-slate-900'
                                                }`}
                                            >
                                                {st === 'all' ? 'All' : st}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Mark All Filtered as Verified */}
                                    <button
                                        type="button"
                                        onClick={handleMarkAllFilteredVerified}
                                        disabled={!isJuniorAllowedToEdit || filteredSamples.length === 0}
                                        className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition border border-slate-200 cursor-pointer disabled:opacity-40"
                                        title="Mark all currently visible samples as Verified"
                                    >
                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                        <span>Mark Visible Verified</span>
                                    </button>
                                </div>
                            </div>

                            {/* Samples Table / List */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#F8FAFC]">
                                {filteredSamples.length === 0 ? (
                                    <div className="text-center py-12 text-slate-400 text-xs">
                                        {voucherSamples.length === 0 ? (
                                            <div className="space-y-2">
                                                <Layers className="w-8 h-8 text-slate-300 mx-auto" />
                                                <p className="font-semibold text-slate-600">No voucher samples pulled yet.</p>
                                                <p>Click "Pull &amp; Sample from Tally" to extract live or test vouchers under SA 530.</p>
                                                <button
                                                    type="button"
                                                    onClick={handlePullAndSampleFromTally}
                                                    className="mt-2 px-3.5 py-1.5 bg-indigo-600 text-white rounded-xl text-xs font-bold transition hover:bg-indigo-700 cursor-pointer"
                                                >
                                                    Pull &amp; Sample Now
                                                </button>
                                            </div>
                                        ) : (
                                            <p>No vouchers match your current register and search filters.</p>
                                        )}
                                    </div>
                                ) : (
                                    filteredSamples.map((sample) => (
                                        <div
                                            key={sample.id}
                                            className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:border-indigo-300 transition"
                                        >
                                            {/* Voucher Metadata */}
                                            <div className="space-y-1 min-w-[240px] flex-1">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="font-mono text-[11px] font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                                        {sample.voucherNumber}
                                                    </span>
                                                    <span className="text-xs font-semibold text-slate-500">
                                                        {sample.date}
                                                    </span>
                                                    <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded font-bold bg-slate-100 text-slate-700">
                                                        {sample.voucherType}
                                                    </span>
                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                                        sample.stratum?.includes('High') ? 'bg-red-50 text-red-700 border-red-200' :
                                                        sample.stratum?.includes('Medium') ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                        'bg-slate-100 text-slate-700 border-slate-200'
                                                    }`}>
                                                        {sample.stratum || 'General Stratum'}
                                                    </span>
                                                </div>
                                                <div className="text-xs font-bold text-slate-900">
                                                    {sample.partyName}
                                                </div>
                                                <div className="text-[11px] font-mono font-bold text-indigo-700">
                                                    ₹{sample.amount.toLocaleString('en-IN')}
                                                </div>
                                            </div>

                                            {/* Inputs: Auditor Remarks & Supporting Doc */}
                                            <div className="flex-1 space-y-1.5 min-w-[220px]">
                                                <input
                                                    type="text"
                                                    placeholder="Auditor scrutiny remarks / findings..."
                                                    value={sample.auditorRemarks || ''}
                                                    onChange={e => handleUpdateSampleRemarks(sample.id, e.target.value)}
                                                    disabled={!isJuniorAllowedToEdit}
                                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-indigo-500 transition"
                                                />
                                                <input
                                                    type="text"
                                                    placeholder="Supporting Doc Ref (Invoice / EWB / GRN #)..."
                                                    value={sample.supportingDocRef || ''}
                                                    onChange={e => handleUpdateSampleDocRef(sample.id, e.target.value)}
                                                    disabled={!isJuniorAllowedToEdit}
                                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-[11px] font-mono text-slate-900 focus:outline-none focus:bg-white focus:border-indigo-500 transition"
                                                />
                                            </div>

                                                {/* Status Selector & Push to Obs Button */}
                                                <div className="flex md:flex-col items-center md:items-end gap-2 shrink-0">
                                                    <select
                                                        value={sample.status}
                                                        disabled={!isJuniorAllowedToEdit}
                                                        onChange={e => handleUpdateSampleStatus(sample.id, e.target.value as any)}
                                                        className={`border rounded-lg px-2.5 py-1 text-xs font-bold focus:outline-none cursor-pointer transition w-full ${
                                                            sample.status === 'Verified' ? 'bg-emerald-50 text-emerald-800 border-emerald-300' :
                                                            sample.status === 'Query Raised' ? 'bg-amber-50 text-amber-800 border-amber-300' :
                                                            sample.status === 'Document Missing' ? 'bg-rose-50 text-rose-800 border-rose-300' :
                                                            'bg-slate-50 text-slate-800 border-slate-300'
                                                        }`}
                                                    >
                                                        <option value="Pending">Pending</option>
                                                        <option value="Verified">Verified ✓</option>
                                                        <option value="Query Raised">Query Raised ⚠️</option>
                                                        <option value="Document Missing">Document Missing 📄</option>
                                                    </select>

                                                    <div className="flex items-center gap-1.5">
                                                        {/* Quick Tick Box (Verify Voucher) */}
                                                        <label
                                                            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] font-bold transition cursor-pointer select-none ${
                                                                sample.status === 'Verified'
                                                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300 shadow-2xs'
                                                                    : 'bg-white hover:bg-slate-50 text-slate-600 border-slate-200'
                                                            }`}
                                                            title={sample.status === 'Verified' ? 'Voucher Verified (Click to uncheck)' : 'Click to tick & verify voucher'}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                disabled={!isJuniorAllowedToEdit}
                                                                checked={sample.status === 'Verified'}
                                                                onChange={(e) => handleUpdateSampleStatus(sample.id, e.target.checked ? 'Verified' : 'Pending')}
                                                                className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 cursor-pointer accent-emerald-600"
                                                            />
                                                            <span>Verify</span>
                                                        </label>

                                                        <button
                                                            type="button"
                                                            onClick={() => handlePushSampleToObservation(sample)}
                                                            className="flex items-center gap-1 text-[11px] font-bold text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2 py-1 rounded-lg transition cursor-pointer"
                                                            title="Push this voucher deficiency into Section 4. Current Period Observations"
                                                        >
                                                            <AlertTriangle className="w-3 h-3 text-amber-600" />
                                                            <span>Push to Obs</span>
                                                        </button>
                                                    </div>
                                                </div>
                                        </div>
                                    ))
                                )}
                            </div>

                            {/* Drawer Footer */}
                            <div className="p-3.5 border-t border-slate-200 flex items-center justify-between bg-slate-50/80 text-xs text-slate-500">
                                <div>
                                    Showing <strong className="text-slate-800">{filteredSamples.length}</strong> of <strong className="text-slate-800">{voucherSamples.length}</strong> total samples
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setSampleDrawerOpen(false)}
                                    className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
                                >
                                    Close Working Paper
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="min-h-screen w-full bg-[#F8FAFC] text-slate-900 font-sans pb-16 animate-fade-in">
            {/* ─── TOP ELEVATED NAVBAR (Refined Executive Style) ─────────────────── */}
            <header className={`relative px-4 sm:px-6 pt-1 pb-1 bg-[#F8FAFC] ${isClientDropdownOpen ? 'z-50' : 'z-20'}`}>
                <div className={`max-w-[1520px] mx-auto min-h-16 bg-white/95 backdrop-blur-xl shadow-[0_4px_24px_rgba(0,0,0,0.06)] rounded-2xl px-5 py-2.5 flex flex-wrap items-center justify-between gap-3 border border-slate-200/80 relative ${isClientDropdownOpen ? 'z-50' : 'z-10'}`}>
                    {/* Client Info (ALL CAPS, enlarged, prominent) */}
                    <div className="flex items-center gap-3 min-w-0">
                        {onBack && (
                            <button
                                onClick={onBack}
                                className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 flex items-center justify-center text-slate-600 hover:text-slate-900 transition shrink-0"
                                title="Back to Workspace"
                            >
                                <ArrowLeft className="w-5 h-5" />
                            </button>
                        )}
                        <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200/70 flex items-center justify-center text-indigo-600 shrink-0 shadow-2xs">
                            <ClipboardCheck className="w-5 h-5" />
                        </div>
                        <div className="flex flex-col text-left min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h1 className="text-base sm:text-lg font-bold tracking-wide uppercase text-slate-900 leading-tight truncate" title="Report Client Entity">
                                    {auditHeader.clientName || activeClient.legalName}
                                </h1>
                                {isTallyOnline && tallyCompanyName && (
                                    auditHeader.clientName === tallyCompanyName ? (
                                        <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-bold uppercase tracking-wider shrink-0" title="Tally Prime Company Synced with Report">
                                            <Check className="w-3 h-3 text-emerald-600" />
                                            <span>Tally Synced: {tallyCompanyName}</span>
                                        </span>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={syncActiveTallyCompanyAsClient}
                                            className="flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 px-2 py-0.5 rounded border border-amber-200 transition shadow-2xs shrink-0 cursor-pointer"
                                            title="Click to put active Tally company name on this report"
                                        >
                                            <Sparkles className="w-3 h-3 text-amber-600" />
                                            <span>Use Tally Company: {tallyCompanyName}</span>
                                        </button>
                                    )
                                )}
                                <span className="text-[10px] font-mono text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 font-bold uppercase tracking-wider shrink-0">
                                    Suite 08 · Monthly Audit
                                </span>
                                <span className={`text-[10px] font-mono px-2 py-0.5 rounded border font-bold uppercase tracking-wider shrink-0 ${
                                    auditHeader.auditStatus === 'RELEASED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                    auditHeader.auditStatus === 'APPROVED' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
                                    auditHeader.auditStatus === 'SUBMITTED_FOR_REVIEW' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                    'bg-blue-50 text-blue-700 border-blue-200'
                                }`}>
                                    {auditHeader.auditStatus}
                                </span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-slate-500 font-mono flex-wrap">
                                <span>GST No. <strong className="text-slate-700">{selectedClientGstin}</strong></span>
                                <span className="text-slate-300 hidden sm:inline">•</span>
                                <span className="hidden sm:inline text-slate-600 truncate max-w-md">
                                    Period: <strong>
                                        {auditHeader.periodMode === 'multiple'
                                            ? `Multi-Month (${(auditHeader.selectedMonths || [selectedMonth]).length}M: ${(auditHeader.selectedMonths || [selectedMonth]).map(m => m.slice(0, 3)).join(', ')}) ${selectedFy}`
                                            : `${selectedMonth} ${selectedFy}`}
                                    </strong> | Standardized CA Firm Format &amp; Working Paper
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Switch Client, FY Dropdown, Tally Status & Action Deck */}
                    <div className="flex items-center gap-2 flex-wrap shrink-0">
                        {/* Switch Client Popover Dropdown */}
                        <div className={`relative ${isClientDropdownOpen ? 'z-50' : ''}`}>
                            <button
                                type="button"
                                onClick={() => setIsClientDropdownOpen(prev => !prev)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 hover:text-slate-900 shadow-2xs hover:shadow-xs transition-all text-xs font-semibold"
                            >
                                <Users className="w-3.5 h-3.5 text-slate-500" />
                                <span className="hidden sm:inline">Switch Client</span>
                                <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded-full">
                                    {clients.length}
                                </span>
                                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isClientDropdownOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {isClientDropdownOpen && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setIsClientDropdownOpen(false)} />
                                    <div className="absolute left-0 top-full mt-2 w-[calc(100vw-3rem)] sm:w-96 max-w-sm sm:max-w-md bg-white border border-slate-200 rounded-2xl shadow-2xl p-3 z-50 animate-pop-in ring-1 ring-slate-200">
                                        <div className="flex items-center justify-between mb-2 px-1">
                                            <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">
                                                Monthly Audit Client Master
                                            </span>
                                            <span className="text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded">
                                                Dedicated DB
                                            </span>
                                        </div>

                                        {/* Tally Active Company Quick-Sync Card */}
                                        {isTallyOnline && tallyCompanyName && (
                                            <div className="mb-2 p-2 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-2">
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-800 uppercase tracking-wider">
                                                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                                        <span>Active in Tally</span>
                                                    </div>
                                                    <div className="text-xs font-bold text-emerald-950 truncate font-mono">
                                                        {tallyCompanyName}
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        syncActiveTallyCompanyAsClient();
                                                        setIsClientDropdownOpen(false);
                                                    }}
                                                    className="shrink-0 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold shadow-2xs transition cursor-pointer"
                                                    title="Sets this Tally company as the active client for this Monthly Audit and puts it on the report"
                                                >
                                                    Set on Report
                                                </button>
                                            </div>
                                        )}

                                        <div className="relative mb-2">
                                            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                            <input
                                                type="text"
                                                value={clientSearchQuery}
                                                onChange={e => setClientSearchQuery(e.target.value)}
                                                placeholder="Search monthly audit clients..."
                                                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-indigo-500 transition-colors"
                                                autoFocus
                                            />
                                        </div>

                                        <div className="max-h-72 overflow-y-auto py-1 space-y-1 divide-y divide-slate-100 custom-scrollbar">
                                            {filteredClients.length === 0 ? (
                                                <div className="p-4 text-center text-xs text-slate-500">
                                                    No monthly audit clients registered yet.
                                                </div>
                                            ) : (
                                                filteredClients.map(c => {
                                                    const isCurrent = selectedClientGstin === c.gstin || (c.id && selectedClientGstin === c.id);
                                                    return (
                                                        <div
                                                            key={c.id || c.gstin}
                                                            className={`w-full p-2.5 rounded-xl transition-all flex items-center justify-between gap-2.5 ${
                                                                isCurrent
                                                                    ? 'bg-indigo-50 border border-indigo-200 text-indigo-900 font-semibold shadow-2xs'
                                                                    : 'hover:bg-slate-50 text-slate-700'
                                                            }`}
                                                        >
                                                            <button
                                                                type="button"
                                                                onClick={() => handleSelectClient(c)}
                                                                className="truncate min-w-0 flex-1 text-left cursor-pointer"
                                                            >
                                                                <div className="text-xs font-bold text-slate-900 truncate flex items-center gap-1.5">
                                                                    <Building2 className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                                                    <span className="truncate">{c.tradeName || c.legalName}</span>
                                                                </div>
                                                                <div className="text-[11px] font-mono text-slate-400 mt-0.5 flex items-center gap-2">
                                                                    <span>{c.gstin && c.gstin.length === 15 ? c.gstin : 'Non-GST Client'}</span>
                                                                    {c.tallyCompanyName && (
                                                                        <span className="text-[9px] text-emerald-700 bg-emerald-50 px-1 rounded border border-emerald-200 font-semibold">
                                                                            Tally: {c.tallyCompanyName}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </button>
                                                            <div className="flex items-center gap-1 shrink-0">
                                                                {isCurrent && (
                                                                    <span className="flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-white px-2 py-0.5 rounded-md border border-indigo-200 shadow-2xs">
                                                                        <Check className="w-3 h-3 text-indigo-600" />
                                                                        <span>Active</span>
                                                                    </span>
                                                                )}
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => handleDeleteClient(c.gstin, c.legalName, c.id)}
                                                                    className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                                                                    title="Delete client from Monthly Audit DB"
                                                                >
                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>

                                        <div className="pt-2 mt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                                            {isTallyOnline && tallyCompanyName ? (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        syncActiveTallyCompanyAsClient();
                                                        setIsClientDropdownOpen(false);
                                                    }}
                                                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition cursor-pointer"
                                                    title="Sync open Tally company"
                                                >
                                                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                                                    <span>Import Tally</span>
                                                </button>
                                            ) : (
                                                <span className="text-[10px] text-slate-400 font-mono">Tally: {isTallyOnline ? 'Online' : 'Offline'}</span>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setIsClientDropdownOpen(false);
                                                    setIsAddClientModalOpen(true);
                                                }}
                                                className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold rounded-xl shadow-2xs transition cursor-pointer"
                                            >
                                                <Plus className="w-3.5 h-3.5" />
                                                <span>Add Client</span>
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* FY Selector Dropdown */}
                        <div className="relative">
                            <select
                                value={selectedFy}
                                onChange={(e) => setSelectedFy(e.target.value)}
                                className="appearance-none bg-slate-100 hover:bg-slate-200/80 focus:bg-white text-slate-900 font-mono font-bold text-xs border border-slate-200 rounded-xl pl-3 pr-8 py-1.5 shadow-2xs transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                title="Select Financial Year"
                            >
                                {availableFinancialYears.map(fy => (
                                    <option key={fy} value={fy}>FY {fy}</option>
                                ))}
                            </select>
                            <ChevronDown className="w-3.5 h-3.5 pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                        </div>

                        {/* Tally Port 9000 Ping */}
                        <button
                            type="button"
                            onClick={() => setIsTallyModalOpen(true)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                                isTallyOnline
                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100 shadow-2xs'
                                    : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
                            }`}
                            title="Tally Port 9000 XML Connection & Client Sync"
                        >
                            <span className={`w-2.5 h-2.5 rounded-full ${isTallyOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                            <span className="hidden sm:inline">Tally Port 9000:</span>
                            <span className="font-bold">{isTallyOnline ? 'Online' : 'Offline'}</span>
                            {isTallyOnline && tallyCompanyName && (
                                <span className="hidden md:inline-block max-w-[130px] truncate text-[11px] font-mono font-bold bg-emerald-200/70 text-emerald-950 px-1.5 py-0.5 rounded">
                                    {tallyCompanyName}
                                </span>
                            )}
                            <RefreshCw className={`w-3 h-3 ${isPingingTally ? 'animate-spin' : ''}`} />
                        </button>

                        {/* 1-Click Auto-Populate Button */}
                        <button
                            type="button"
                            onClick={handleAutoPopulate}
                            disabled={isAutoPopulating}
                            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-xs disabled:opacity-50 cursor-pointer"
                        >
                            <Sparkles className={`w-3.5 h-3.5 ${isAutoPopulating ? 'animate-spin' : ''}`} />
                            <span>Auto-Populate</span>
                        </button>

                        {/* Save Working Sheet (Ctrl+S) */}
                        <button
                            type="button"
                            onClick={() => handleSaveAudit(true)}
                            disabled={isSaving}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 transition shadow-2xs cursor-pointer"
                            title="Save Working Sheet (Ctrl+S)"
                        >
                            <Save className={`w-3.5 h-3.5 text-slate-600 ${isSaving ? 'animate-spin' : ''}`} />
                            <span className="hidden sm:inline">Save</span>
                            <span className="text-[10px] font-mono text-slate-500">(Ctrl+S)</span>
                        </button>

                        {/* Zero-Merge Excel Export */}
                        <button
                            type="button"
                            onClick={handleDownloadExcel}
                            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
                            title="Export Zero-Merge Multi-Tab Analytical Excel"
                        >
                            <Download className="w-3.5 h-3.5" />
                            <span>Zero-Merge Excel</span>
                        </button>

                        {/* Professional Corporate PDF Export */}
                        <button
                            type="button"
                            onClick={handleDownloadPdf}
                            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
                            title="Export Professional Corporate Client Audit PDF Report"
                        >
                            <FileText className="w-3.5 h-3.5" />
                            <span>Executive PDF</span>
                        </button>
                    </div>
                </div>

                {/* Empty State Banner if no clients exist */}
                {clients.length === 0 && (
                    <div className="max-w-[1520px] mx-auto mt-2 p-3.5 bg-gradient-to-r from-amber-500/10 via-indigo-500/10 to-transparent border border-amber-200/80 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs shadow-2xs animate-fade-in">
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                                <Building2 className="w-4 h-4 text-amber-700" />
                            </div>
                            <div>
                                <h4 className="font-bold text-slate-900 text-xs">No Clients Configured in Master Vault</h4>
                                <p className="text-slate-600 text-[11px]">Register a client or open Client Master in System Settings to import clients from Excel.</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setIsAddClientModalOpen(true)}
                                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-2xs transition cursor-pointer flex items-center gap-1.5 text-xs"
                            >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Add Client</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => window.dispatchEvent(new CustomEvent('open-settings', { detail: { tab: 'clients' } }))}
                                className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 font-bold rounded-xl border border-slate-200 shadow-2xs transition cursor-pointer flex items-center gap-1.5 text-xs"
                            >
                                <Settings className="w-3.5 h-3.5 text-slate-500" />
                                <span>Open Client Master</span>
                            </button>
                        </div>
                    </div>
                )}

                {/* 12-Month Navigation & Period Scope Control Bar */}
                <div className="max-w-[1520px] mx-auto mt-2 bg-white/95 backdrop-blur-md px-4 py-2 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2.5 flex-wrap">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 shrink-0">
                            <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Period Scope:</span>
                        </div>

                        {/* Two Period Modes Switcher */}
                        <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-xs">
                            <button
                                type="button"
                                onClick={() => {
                                    setAuditHeader(prev => ({
                                        ...prev,
                                        periodMode: 'single',
                                        selectedMonths: [selectedMonth]
                                    }));
                                }}
                                className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                                    (auditHeader.periodMode || 'single') === 'single'
                                        ? 'bg-white text-slate-900 shadow-2xs font-bold'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                                title="Single Month Focus"
                            >
                                Single Month
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setAuditHeader(prev => ({
                                        ...prev,
                                        periodMode: 'multiple',
                                        selectedMonths: prev.selectedMonths && prev.selectedMonths.length > 0 ? prev.selectedMonths : [selectedMonth]
                                    }));
                                }}
                                className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1 ${
                                    auditHeader.periodMode === 'multiple'
                                        ? 'bg-white text-slate-900 shadow-2xs font-bold'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                                title="Multiple Months Consolidated Scope"
                            >
                                <span>Multi-Month</span>
                                {auditHeader.periodMode === 'multiple' && (
                                    <span className="bg-indigo-100 text-indigo-700 font-bold px-1.5 py-0.2 rounded-full text-[10px]">
                                        {auditHeader.selectedMonths?.length || 1}M
                                    </span>
                                )}
                            </button>
                        </div>

                        {auditHeader.periodMode === 'multiple' && (
                            <span className="text-[11px] font-mono text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-lg font-bold">
                                {auditHeader.selectedMonths?.length || 1} Months in Scope
                            </span>
                        )}
                    </div>

                    {/* Timeline Month Pills */}
                    <div className="flex items-center gap-1 overflow-x-auto scrollbar-none py-0.5 flex-1 justify-end">
                        {MONTHS.map(m => {
                            const isSingleSelected = (auditHeader.periodMode || 'single') === 'single' && selectedMonth === m;
                            const isMultiSelected = auditHeader.periodMode === 'multiple' && (auditHeader.selectedMonths || []).includes(m);
                            const isSelected = (auditHeader.periodMode || 'single') === 'single' ? isSingleSelected : isMultiSelected;
                            const status = monthStatuses[m];
                            const isReleased = status === 'RELEASED';
                            const isApproved = status === 'APPROVED';
                            const isUnderReview = status === 'SUBMITTED_FOR_REVIEW';
                            const isDraft = status === 'DRAFT' || status === 'REVISION_REQUESTED';

                            let statusDot = 'bg-slate-300';
                            if (isReleased) statusDot = 'bg-emerald-500';
                            else if (isApproved) statusDot = 'bg-indigo-500';
                            else if (isUnderReview) statusDot = 'bg-amber-500';
                            else if (isDraft) statusDot = 'bg-blue-400';

                            return (
                                <button
                                    key={m}
                                    type="button"
                                    onClick={() => {
                                        if (auditHeader.periodMode === 'multiple') {
                                            handleToggleMonthInMultiMode(m);
                                        } else {
                                            setSelectedMonth(m);
                                            setAuditHeader(prev => ({
                                                ...prev,
                                                periodMode: 'single',
                                                selectedMonths: [m]
                                            }));
                                        }
                                    }}
                                    className={`px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                                        isSelected
                                            ? 'bg-indigo-600 text-white shadow-xs font-bold scale-102'
                                            : isReleased
                                            ? 'text-emerald-700 hover:text-emerald-900 bg-emerald-50/70 border border-emerald-200'
                                            : isApproved
                                            ? 'text-indigo-700 hover:text-indigo-900 bg-indigo-50/70 border border-indigo-200'
                                            : isUnderReview
                                            ? 'text-amber-700 hover:text-amber-900 bg-amber-50/70 border border-amber-200'
                                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 bg-slate-50 border border-slate-200/60'
                                    }`}
                                    title={auditHeader.periodMode === 'multiple' ? `Click to toggle ${m} in audit scope` : `Switch to ${m}`}
                                >
                                    <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : statusDot}`} />
                                    <span>{m.slice(0, 3)}</span>
                                    {auditHeader.periodMode === 'multiple' && isSelected && (
                                        <Check className="w-3 h-3 text-white stroke-[3]" />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* ─── Maker-Checker Review Stepper & Role Control Bar ────────────── */}
                <div className="max-w-[1520px] mx-auto mt-2 bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/80 shadow-2xs px-5 py-2.5 flex flex-wrap items-center justify-between gap-4">
                    {/* Stepper Visualization */}
                    <div className="flex items-center gap-3">
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                            Workflow Stage:
                        </span>
                        <div className="flex items-center gap-2 text-xs">
                            {/* Step 1: Draft */}
                            <span className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold transition ${
                                auditHeader.auditStatus === 'DRAFT' || auditHeader.auditStatus === 'REVISION_REQUESTED'
                                    ? 'bg-blue-50 text-blue-800 border border-blue-200 shadow-2xs'
                                    : 'bg-slate-50 text-slate-400 border border-slate-200/50'
                            }`}>
                                <FileText className="w-3.5 h-3.5" /> 1. Draft
                            </span>

                            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />

                            {/* Step 2: Under Review */}
                            <span className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold transition ${
                                auditHeader.auditStatus === 'SUBMITTED_FOR_REVIEW'
                                    ? 'bg-amber-50 text-amber-800 border border-amber-200 shadow-2xs'
                                    : 'bg-slate-50 text-slate-400 border border-slate-200/50'
                            }`}>
                                <Clock className="w-3.5 h-3.5" /> 2. Senior Review
                            </span>

                            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />

                            {/* Step 3: Approved */}
                            <span className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold transition ${
                                auditHeader.auditStatus === 'APPROVED'
                                    ? 'bg-indigo-50 text-indigo-800 border border-indigo-200 shadow-2xs'
                                    : 'bg-slate-50 text-slate-400 border border-slate-200/50'
                            }`}>
                                <CheckCircle2 className="w-3.5 h-3.5" /> 3. Approved
                            </span>

                            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />

                            {/* Step 4: Released */}
                            <span className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold transition ${
                                auditHeader.auditStatus === 'RELEASED'
                                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs'
                                    : 'bg-slate-50 text-slate-400 border border-slate-200/50'
                            }`}>
                                <Send className="w-3.5 h-3.5" /> 4. Released to Client
                            </span>

                            {isCloudLive && (
                                <span className="ml-2 flex items-center gap-1 text-[10px] font-bold text-sky-700 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-full shadow-2xs">
                                    <Cloud className="w-2.5 h-2.5 text-sky-500 animate-pulse" />
                                    <span>Firebase Live</span>
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Role Switcher & Workflow Trigger Buttons */}
                    <div className="flex items-center gap-3 flex-wrap">
                        {/* Senior Review Requests Queue Trigger (Visible in Senior mode or for senior users) */}
                        {currentRole === 'senior' && (
                            <button
                                type="button"
                                onClick={() => setSeniorQueueModalOpen(true)}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer border ${
                                    pendingReviewsQueue.length > 0
                                        ? 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300 ring-2 ring-amber-400/20'
                                        : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                                }`}
                                title="Open Senior Review Requests Inbox"
                            >
                                <Inbox className="w-3.5 h-3.5 text-amber-600" />
                                <span>Review Requests</span>
                                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                                    pendingReviewsQueue.length > 0
                                        ? 'bg-amber-600 text-white animate-pulse'
                                        : 'bg-slate-200 text-slate-700'
                                }`}>
                                    {pendingReviewsQueue.length}
                                </span>
                            </button>
                        )}

                        {/* Role Switcher */}
                        <div className="flex items-center bg-slate-100 border border-slate-200 rounded-xl p-0.5 text-xs">
                            <button
                                type="button"
                                onClick={() => setCurrentRole('junior')}
                                className={`px-3 py-1 rounded-lg font-semibold transition flex items-center gap-1.5 cursor-pointer ${
                                    currentRole === 'junior'
                                        ? 'bg-white text-blue-900 shadow-xs font-bold border border-slate-200/60'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                <User className="w-3 h-3 text-blue-600" />
                                <span>Junior Article</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setCurrentRole('senior')}
                                className={`px-3 py-1 rounded-lg font-semibold transition flex items-center gap-1.5 cursor-pointer ${
                                    currentRole === 'senior'
                                        ? 'bg-white text-indigo-900 shadow-xs font-bold border border-slate-200/60'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                <UserCheck className="w-3 h-3 text-indigo-600" />
                                <span>Senior CA Partner</span>
                            </button>
                        </div>

                        {/* Audit Verification Sections Dropdown Menu (Beside Junior Article / Senior CA Partner) */}
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setIsNavDropdownOpen(prev => !prev)}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 hover:border-indigo-300 text-slate-800 font-bold text-xs shadow-2xs transition cursor-pointer group"
                                title="Select Audit Section"
                            >
                                {(() => {
                                    const currentTab = auditNavTabs.find(t => t.id === activeTab) || auditNavTabs[0];
                                    const TabIcon = currentTab.icon;
                                    return (
                                        <>
                                            <TabIcon className={`w-4 h-4 ${currentTab.color}`} />
                                            <span className="text-slate-900">{currentTab.label}</span>
                                            {currentTab.count !== undefined && (
                                                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${currentTab.countColor}`}>
                                                    {currentTab.count}
                                                </span>
                                            )}
                                            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 transition-transform duration-200 ${isNavDropdownOpen ? 'rotate-180' : ''}`} />
                                        </>
                                    );
                                })()}
                            </button>

                            {isNavDropdownOpen && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setIsNavDropdownOpen(false)} />
                                    <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-slate-200 rounded-2xl shadow-xl p-2 z-50 animate-pop-in ring-1 ring-slate-200">
                                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3 py-1.5 border-b border-slate-100 flex items-center justify-between">
                                            <span>Audit Sections &amp; Workings</span>
                                            <span className="text-[9px] font-mono font-normal text-slate-400">5 Sections</span>
                                        </div>
                                        <div className="py-1 flex flex-col gap-0.5">
                                            {auditNavTabs.map(tab => {
                                                const Icon = tab.icon;
                                                const isSelected = activeTab === tab.id;
                                                return (
                                                    <button
                                                        key={tab.id}
                                                        type="button"
                                                        onClick={() => {
                                                            setActiveTab(tab.id as any);
                                                            setIsNavDropdownOpen(false);
                                                        }}
                                                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition cursor-pointer text-left ${
                                                            isSelected
                                                                ? 'bg-indigo-50 text-indigo-900 font-bold border border-indigo-200/80 shadow-2xs'
                                                                : 'text-slate-700 hover:text-slate-900 hover:bg-slate-50'
                                                        }`}
                                                    >
                                                        <div className="flex items-center gap-2.5 truncate">
                                                            <Icon className={`w-4 h-4 shrink-0 ${tab.color}`} />
                                                            <span className="truncate">{tab.label}</span>
                                                        </div>
                                                        {tab.count !== undefined && (
                                                            <span className={`ml-2 px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold shrink-0 ${tab.countColor}`}>
                                                                {tab.count}
                                                            </span>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Junior Actions */}
                        {currentRole === 'junior' && (
                            <div className="flex items-center gap-2 flex-wrap">
                                <button
                                    type="button"
                                    onClick={handleOpenSubmitReviewModal}
                                    disabled={!canSubmitForReview(auditHeader.auditStatus)}
                                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition shadow-xs ${
                                        canSubmitForReview(auditHeader.auditStatus)
                                            ? 'bg-amber-600 hover:bg-amber-700 text-white cursor-pointer'
                                            : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                                    }`}
                                >
                                    <Send className="w-3.5 h-3.5" />
                                    <span>Submit for Senior Review</span>
                                </button>
                            </div>
                        )}

                        {/* Senior Actions */}
                        {currentRole === 'senior' && (
                            <div className="flex items-center gap-2 flex-wrap">
                                {/* Active Senior Reviewer Identity Selector */}
                                <div className="flex items-center gap-1.5 bg-indigo-50/90 border border-indigo-200/90 rounded-xl px-2.5 py-1 text-xs shadow-2xs">
                                    <UserCheck className="w-3.5 h-3.5 text-indigo-700 shrink-0" />
                                    <div className="flex flex-col">
                                        <span className="text-[8px] font-bold uppercase tracking-wider text-indigo-900 leading-none">
                                            Reviewing As:
                                        </span>
                                        <select
                                            value={activeSeniorReviewer}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setActiveSeniorReviewer(val);
                                                if (val !== 'ALL') {
                                                    setSelectedSenior(val);
                                                    setAuditHeader(prev => ({ ...prev, reviewedBy: val }));
                                                }
                                            }}
                                            className="bg-transparent font-bold text-indigo-950 text-xs focus:outline-none cursor-pointer max-w-[170px] truncate"
                                            title="Select which Senior CA Partner you are reviewing as"
                                        >
                                            <option value="ALL">🌟 All Partners (Master)</option>
                                            {availableSeniorOptions.map(opt => (
                                                <option key={opt} value={opt}>{opt}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={handleApprove}
                                    disabled={auditHeader.auditStatus === 'APPROVED'}
                                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition shadow-xs ${
                                        auditHeader.auditStatus !== 'APPROVED'
                                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
                                            : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                                    }`}
                                >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>{auditHeader.auditStatus === 'APPROVED' ? 'Approved & Signed' : 'Accept & Sign-Off'}</span>
                                    {/* Approve &amp; Sign-Off */}
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setRevisionModalOpen(true)}
                                    disabled={auditHeader.auditStatus === 'APPROVED'}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                                        auditHeader.auditStatus !== 'APPROVED'
                                            ? 'bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 cursor-pointer'
                                            : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                                    }`}
                                >
                                    <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                                    <span>Request Revision</span>
                                </button>
                            </div>
                        )}

                        {/* Release Action */}
                        <button
                            type="button"
                            onClick={() => setReleaseModalOpen(true)}
                            disabled={!isReleaseAllowed}
                            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold transition shadow-sm ${
                                isReleaseAllowed
                                    ? 'bg-gradient-to-r from-indigo-600 to-indigo-600 hover:from-indigo-500 hover:to-indigo-500 text-white shadow-indigo-200 cursor-pointer animate-pulse'
                                    : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                            }`}
                        >
                            <Send className="w-3.5 h-3.5" />
                            <span>Release Report to Client</span>
                        </button>
                    </div>
                </div>

                {/* ─── Remote Review Notification Banners ─────────────────────────── */}
                {currentRole === 'senior' && auditHeader.auditStatus === 'SUBMITTED_FOR_REVIEW' && (
                    <div className="max-w-[1520px] mx-auto mt-2 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 border border-amber-300 rounded-2xl p-4 shadow-xs flex items-center justify-between flex-wrap gap-3 animate-in fade-in">
                        <div className="flex items-start gap-3">
                            <div className="p-2.5 bg-amber-200/70 text-amber-900 rounded-xl">
                                <Clock className="w-5 h-5 text-amber-800 animate-pulse" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs font-bold text-amber-950 uppercase tracking-wider">
                                        Cloud Review Assignment Pending Your Sign-Off
                                    </span>
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-200 text-amber-900">
                                        {cloudAuditRecord?.priority || reviewPriority || 'Standard Review'}
                                    </span>
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 flex items-center gap-1">
                                        <Cloud className="w-2.5 h-2.5" /> Firebase Cloud Synced
                                    </span>
                                </div>
                                <p className="text-xs text-slate-700 mt-1">
                                    Submitted by Article: <strong className="text-slate-900">{auditHeader.preparedBy || 'Junior Article'}</strong> to Senior Partner: <strong className="text-indigo-900">{auditHeader.reviewedBy || 'Senior CA Partner'}</strong>
                                </p>
                                {(auditHeader.generalSummary || cloudAuditRecord?.submissionNotes) && (
                                    <div className="mt-2 text-xs text-amber-950 bg-white/80 border border-amber-200 rounded-xl p-2.5 font-medium shadow-2xs">
                                        <span className="font-bold text-amber-900">Junior Handover Note: </span>
                                        {auditHeader.generalSummary || cloudAuditRecord?.submissionNotes}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={handleApprove}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs cursor-pointer transition active:scale-95"
                            >
                                <CheckCircle2 className="w-4 h-4" />
                                <span>Accept &amp; Sign-Off</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setRevisionModalOpen(true)}
                                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white hover:bg-rose-50 border border-rose-200 text-rose-700 shadow-2xs cursor-pointer transition active:scale-95"
                            >
                                <AlertCircle className="w-4 h-4 text-rose-600" />
                                <span>Request Revision</span>
                            </button>
                        </div>
                    </div>
                )}

                {currentRole === 'junior' && auditHeader.auditStatus === 'SUBMITTED_FOR_REVIEW' && (
                    <div className="max-w-[1520px] mx-auto mt-2 bg-blue-50/80 border border-blue-200 rounded-2xl p-3 shadow-2xs flex items-center justify-between flex-wrap gap-2 text-xs">
                        <div className="flex items-center gap-2.5">
                            <div className="p-1.5 bg-blue-100 text-blue-700 rounded-lg">
                                <Cloud className="w-4 h-4 text-blue-600" />
                            </div>
                            <div>
                                <span className="font-bold text-blue-900">Submitted to Senior Partner: </span>
                                <strong className="text-indigo-900">{auditHeader.reviewedBy || 'Senior CA Partner'}</strong>
                                <span className="text-slate-500 ml-2">Audit working papers are synchronized in Firebase Cloud and locked for Junior editing during review.</span>
                            </div>
                        </div>
                        <span className="px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 font-bold text-[11px] flex items-center gap-1">
                            <Clock className="w-3 h-3 text-blue-600" /> Under Senior Review
                        </span>
                    </div>
                )}

                {auditHeader.auditStatus === 'REVISION_REQUESTED' && (
                    <div className="max-w-[1520px] mx-auto mt-2 bg-gradient-to-r from-rose-50 via-pink-50 to-rose-50 border border-rose-300 rounded-2xl p-4 shadow-xs space-y-3 animate-in fade-in">
                        <div className="flex items-start justify-between flex-wrap gap-3">
                            <div className="flex items-start gap-3">
                                <div className="p-2.5 bg-rose-200/70 text-rose-900 rounded-xl">
                                    <AlertCircle className="w-5 h-5 text-rose-700 animate-pulse" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-xs font-bold text-rose-950 uppercase tracking-wider">
                                            Senior Working Paper Revision Requested
                                        </span>
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-200 text-rose-900">
                                            By {auditHeader.reviewedBy || 'Senior Partner'}
                                        </span>
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                                            🔓 Unlocked for Junior Edits
                                        </span>
                                    </div>
                                    <p className="text-xs text-rose-900/80 mt-0.5">
                                        Please address all senior review queries below before re-submitting for sign-off.
                                    </p>
                                </div>
                            </div>

                            {currentRole === 'junior' && (
                                <button
                                    type="button"
                                    onClick={handleOpenSubmitReviewModal}
                                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-xs cursor-pointer transition"
                                >
                                    <Send className="w-3.5 h-3.5" />
                                    <span>Re-Submit for Senior Review</span>
                                </button>
                            )}
                        </div>

                        {/* Structured Feedback & Junior Checkoff Tracker */}
                        <div className="bg-white/90 border border-rose-200 rounded-xl p-3 text-xs space-y-2">
                            <div className="font-bold text-rose-950 flex items-center justify-between">
                                <span className="flex items-center gap-1.5">
                                    <ListChecks className="w-4 h-4 text-rose-600" />
                                    <span>Senior Review Queries &amp; Action Items:</span>
                                </span>
                                <span className="text-[11px] text-slate-500 font-normal">
                                    Check off items as you resolve them in the working papers
                                </span>
                            </div>

                            <div className="space-y-1.5 text-slate-800 font-mono text-[11px] bg-rose-50/50 p-2.5 rounded-lg border border-rose-100">
                                {(auditHeader.seniorReviewNotes || 'Please rectify findings and re-submit.')
                                    .split('\n')
                                    .filter(line => line.trim())
                                    .map((line, idx) => (
                                        <label
                                            key={idx}
                                            className="flex items-start gap-2 cursor-pointer hover:bg-rose-100/50 p-1 rounded transition"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={!!resolvedRevisionPoints[`point_${idx}`]}
                                                onChange={(e) => setResolvedRevisionPoints(prev => ({
                                                    ...prev,
                                                    [`point_${idx}`]: e.target.checked
                                                }))}
                                                className="mt-0.5 rounded border-rose-300 text-rose-600 focus:ring-rose-500"
                                            />
                                            <span className={resolvedRevisionPoints[`point_${idx}`] ? 'line-through text-slate-400' : 'text-slate-800'}>
                                                {line}
                                            </span>
                                        </label>
                                    ))}
                            </div>
                        </div>
                    </div>
                )}
            </header>

            {/* ─── STANDALONE MAIN WORKSPACE CANVAS ─────────────────────────────── */}
            <main className="max-w-[1520px] mx-auto px-4 sm:px-6 mt-4 space-y-5">
                {/* ─── TAB 1: Basic Details & Scope ─────────────────────────────────── */}
                {activeTab === 'scope' && (
                    <div className="space-y-5">
                        {/* ─── 1. AUDITOR DETAILS & ENGAGEMENT PROFILE (Form-like Structure) ─── */}
                        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6">
                            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                                    <Building2 className="w-4 h-4 text-indigo-600" />
                                    <span>1. Auditor Details &amp; Engagement Profile</span>
                                </h2>
                                <span className="text-[11px] font-mono text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200 font-bold uppercase tracking-wider">
                                    ICAI Standards (SA 210 / SQC-1)
                                </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                                <div>
                                    <label className="block text-slate-600 font-semibold mb-1.5">Engagement Article / Auditor</label>
                                    <input
                                        type="text"
                                        disabled={!isJuniorAllowedToEdit}
                                        value={auditHeader.auditorName || ''}
                                        onChange={(e) => setAuditHeader(prev => ({ ...prev, auditorName: e.target.value }))}
                                        className="w-full bg-slate-50 hover:bg-white focus:bg-white text-slate-900 font-medium border border-slate-200 rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition"
                                        placeholder="Engagement Article Assistant Name"
                                    />
                                </div>

                                <div>
                                    <label className="block text-slate-600 font-semibold mb-1.5">Chartered Accountants Firm Name</label>
                                    <input
                                        type="text"
                                        disabled={!isJuniorAllowedToEdit}
                                        value={auditHeader.firmName || ''}
                                        onChange={(e) => setAuditHeader(prev => ({ ...prev, firmName: e.target.value }))}
                                        className="w-full bg-slate-50 hover:bg-white focus:bg-white text-slate-900 font-medium border border-slate-200 rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition"
                                        placeholder="e.g. Chartered Accountants Firm Name"
                                    />
                                </div>

                                <div>
                                    <label className="block text-slate-600 font-semibold mb-1.5">Firm Registration No. (FRN)</label>
                                    <input
                                        type="text"
                                        disabled={!isJuniorAllowedToEdit}
                                        value={auditHeader.firmRegistrationNo || ''}
                                        onChange={(e) => setAuditHeader(prev => ({ ...prev, firmRegistrationNo: e.target.value }))}
                                        className="w-full bg-slate-50 hover:bg-white focus:bg-white text-slate-900 font-mono font-medium border border-slate-200 rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition"
                                        placeholder="e.g. 123456W"
                                    />
                                </div>

                                <div>
                                    <label className="block text-slate-600 font-semibold mb-1.5">Audit Engagement Type</label>
                                    <select
                                        disabled={!isJuniorAllowedToEdit}
                                        value={auditHeader.auditType}
                                        onChange={(e) => setAuditHeader(prev => ({ ...prev, auditType: e.target.value }))}
                                        className="w-full bg-slate-50 hover:bg-white focus:bg-white text-slate-900 font-medium border border-slate-200 rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition cursor-pointer"
                                    >
                                        <option value="Monthly Statutory Audit">Monthly Statutory Audit</option>
                                        <option value="Concurrent Audit">Concurrent Audit</option>
                                        <option value="Internal Audit">Internal Audit</option>
                                        <option value="Quarterly Review">Quarterly Review</option>
                                        <option value="GST Verification &amp; Reco">GST Verification &amp; Reco</option>
                                        <option value="Tax Audit Pre-Scrutiny">Tax Audit Pre-Scrutiny</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-slate-600 font-semibold mb-1.5">Engagement Ref / UDIN</label>
                                    <input
                                        type="text"
                                        disabled={!isJuniorAllowedToEdit}
                                        value={auditHeader.engagementRef || ''}
                                        onChange={(e) => setAuditHeader(prev => ({ ...prev, engagementRef: e.target.value }))}
                                        className="w-full bg-slate-50 hover:bg-white focus:bg-white text-slate-900 font-mono font-medium border border-slate-200 rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition"
                                        placeholder="e.g. EL/2026-27/01 or UDIN"
                                    />
                                </div>

                                <div>
                                    <label className="block text-slate-600 font-semibold mb-1.5">Fieldwork Start Date</label>
                                    <input
                                        type="date"
                                        disabled={!isJuniorAllowedToEdit}
                                        value={auditHeader.auditStartDate || ''}
                                        onChange={(e) => setAuditHeader(prev => ({ ...prev, auditStartDate: e.target.value }))}
                                        className="w-full bg-slate-50 hover:bg-white focus:bg-white text-slate-900 font-medium border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition"
                                    />
                                </div>

                                <div>
                                    <label className="block text-slate-600 font-semibold mb-1.5">Fieldwork End Date</label>
                                    <input
                                        type="date"
                                        disabled={!isJuniorAllowedToEdit}
                                        value={auditHeader.auditEndDate || ''}
                                        onChange={(e) => setAuditHeader(prev => ({ ...prev, auditEndDate: e.target.value }))}
                                        className="w-full bg-slate-50 hover:bg-white focus:bg-white text-slate-900 font-medium border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition"
                                    />
                                </div>
                            </div>

                            {/* ─── DESIGNATED SENIOR CA REVIEWER (MAKER-CHECKER ASSIGNMENT) ─── */}
                            <div className="mt-5 p-4 rounded-xl border border-indigo-200/90 bg-gradient-to-r from-indigo-50/70 via-slate-50 to-white flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                                        <ShieldCheck className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                                                Designated Senior Reviewer (Maker-Checker Assignment)
                                            </h3>
                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">
                                                Strict Exclusivity
                                            </span>
                                        </div>
                                        <p className="text-[11px] text-slate-500 mt-0.5">
                                            When submitted, this review request routes <strong>strictly and exclusively</strong> to this Senior Partner's review queue.
                                        </p>
                                    </div>
                                </div>

                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto">
                                    <select
                                        disabled={!isJuniorAllowedToEdit}
                                        value={selectedSenior}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setSelectedSenior(val);
                                            setAuditHeader(prev => ({ ...prev, reviewedBy: val }));
                                        }}
                                        className="bg-white border-2 border-indigo-300 text-slate-900 font-bold text-xs rounded-xl px-3.5 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-2xs min-w-[260px] disabled:cursor-not-allowed"
                                        title="Select which Senior CA Partner will review and sign-off on this monthly audit"
                                    >
                                        {availableSeniorOptions.length > 0 ? (
                                            availableSeniorOptions.map((opt) => (
                                                <option key={opt} value={opt}>{opt}</option>
                                            ))
                                        ) : (
                                            <option value="" disabled>-- No Senior Auditors Configured --</option>
                                        )}
                                        <option value="__custom__">➕ Other Senior Partner...</option>
                                    </select>

                                    {selectedSenior === '__custom__' && (
                                        <input
                                            type="text"
                                            disabled={!isJuniorAllowedToEdit}
                                            value={customSeniorName}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setCustomSeniorName(val);
                                                setAuditHeader(prev => ({ ...prev, reviewedBy: val }));
                                            }}
                                            placeholder="Enter Senior Partner Name..."
                                            className="bg-white border border-indigo-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-[200px]"
                                        />
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* ─── AUDIT ENGAGEMENT TEAM ROSTER & FIELDWORK ALLOCATION ─── */}
                        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6">
                            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                                <div className="flex items-center gap-2">
                                    <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                                        <Users className="w-4 h-4 text-indigo-600" />
                                        <span>Audit Engagement Team &amp; Fieldwork Allocation</span>
                                    </h2>
                                    <span className="text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full border border-indigo-200">
                                        {normalizedTeamMembers.length} Members
                                    </span>
                                </div>

                                {isJuniorAllowedToEdit && (
                                    <button
                                        type="button"
                                        onClick={handleAddTeamMember}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl border border-indigo-200 transition cursor-pointer shadow-2xs"
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                        <span>Add Team Member</span>
                                    </button>
                                )}
                            </div>

                            <div className="overflow-x-auto rounded-xl border border-slate-200">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[11px] border-b border-slate-200">
                                        <tr>
                                            <th className="py-2.5 px-3 w-12 text-center">#</th>
                                            <th className="py-2.5 px-3 w-64">Team Member Name</th>
                                            <th className="py-2.5 px-3 w-56">Engagement Role</th>
                                            <th className="py-2.5 px-3">Assigned Audit Areas</th>
                                            <th className="py-2.5 px-3 w-16 text-center">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {normalizedTeamMembers.map((member, idx) => (
                                            <tr key={member.id || idx} className="hover:bg-slate-50/80 transition-colors">
                                                <td className="py-2.5 px-3 text-center text-slate-400 font-mono font-bold">
                                                    {idx + 1}
                                                </td>
                                                <td className="py-2.5 px-3">
                                                    <input
                                                        type="text"
                                                        disabled={!isJuniorAllowedToEdit}
                                                        value={member.name}
                                                        onChange={(e) => handleUpdateTeamMember(idx, 'name', e.target.value)}
                                                        placeholder="e.g. Article Assistant / Team Member Name"
                                                        className="w-full bg-transparent hover:bg-slate-50 focus:bg-white text-slate-900 font-semibold border border-transparent focus:border-indigo-400 rounded-lg px-2 py-1 text-xs outline-none transition"
                                                    />
                                                </td>
                                                <td className="py-2.5 px-3">
                                                    <select
                                                        disabled={!isJuniorAllowedToEdit}
                                                        value={member.role}
                                                        onChange={(e) => handleUpdateTeamMember(idx, 'role', e.target.value)}
                                                        className="w-full bg-slate-50 hover:bg-white focus:bg-white text-slate-800 font-medium border border-slate-200 rounded-lg px-2 py-1 text-xs outline-none focus:border-indigo-500 transition cursor-pointer"
                                                    >
                                                        <option value="Engagement Partner">Engagement Partner</option>
                                                        <option value="Senior CA Reviewer">Senior CA Reviewer</option>
                                                        <option value="Lead Article Assistant">Lead Article Assistant</option>
                                                        <option value="Audit Assistant">Audit Assistant</option>
                                                        <option value="Tax / GST Specialist">Tax / GST Specialist</option>
                                                        <option value="IT Systems Auditor">IT Systems Auditor</option>
                                                    </select>
                                                </td>
                                                <td className="py-2.5 px-3">
                                                    <input
                                                        type="text"
                                                        disabled={!isJuniorAllowedToEdit}
                                                        value={member.assignedAreas || ''}
                                                        onChange={(e) => handleUpdateTeamMember(idx, 'assignedAreas', e.target.value)}
                                                        placeholder="e.g. Sales Reco, Purchase & 2B Matching, BRS, Labor Laws"
                                                        className="w-full bg-transparent hover:bg-slate-50 focus:bg-white text-slate-700 border border-transparent focus:border-indigo-400 rounded-lg px-2 py-1 text-xs outline-none transition"
                                                    />
                                                </td>
                                                <td className="py-2.5 px-3 text-center">
                                                    {isJuniorAllowedToEdit && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRemoveTeamMember(idx)}
                                                            className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                                                            title="Remove Team Member"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="mt-3 bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-[11px] text-slate-600 flex items-start gap-2">
                                <UserCheck className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                                <div>
                                    <strong className="text-slate-800">Maker-Checker Operational Hierarchy:</strong> Article assistants and junior audit team members populate substantive evidence, register verifications, and draft observations. Senior CA Reviewers and Engagement Partners verify audit findings, approve sign-offs, or request revisions before report release to the client.
                                </div>
                            </div>
                        </div>

                        {/* ─── 2. AUDIT PERIOD MODE & COVERED MONTHS CONFIGURATION ─── */}
                        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6">
                            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                                    <Calendar className="w-4 h-4 text-indigo-600" />
                                    <span>2. Audit Period Mode &amp; Covered Months Configuration</span>
                                </h2>
                                <span className={`text-[11px] font-mono px-2.5 py-1 rounded-lg border font-bold uppercase tracking-wider ${
                                    auditHeader.periodMode === 'multiple'
                                        ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                        : 'bg-blue-50 text-blue-700 border-blue-200'
                                }`}>
                                    {auditHeader.periodMode === 'multiple' ? 'Multi-Month Audit' : 'Single Month Audit'}
                                </span>
                            </div>

                            {/* Mode Selection Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setAuditHeader(prev => ({
                                            ...prev,
                                            periodMode: 'single',
                                            selectedMonths: [selectedMonth]
                                        }));
                                    }}
                                    className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                                        (auditHeader.periodMode || 'single') === 'single'
                                            ? 'bg-indigo-50/70 border-indigo-300 ring-2 ring-indigo-500/20 shadow-xs'
                                            : 'bg-slate-50/60 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                                    }`}
                                >
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className="font-bold text-xs text-slate-900 flex items-center gap-2">
                                            <Calendar className="w-4 h-4 text-indigo-600" />
                                            <span>Mode 1: Single Month Audit</span>
                                        </span>
                                        {(auditHeader.periodMode || 'single') === 'single' && (
                                            <span className="w-2 h-2 rounded-full bg-indigo-600" />
                                        )}
                                    </div>
                                    <p className="text-[11px] text-slate-500 leading-relaxed">
                                        In-depth monthly statutory audit focusing on one specific calendar month ({selectedMonth} {selectedFy}) with detailed voucher and register sampling.
                                    </p>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        setAuditHeader(prev => ({
                                            ...prev,
                                            periodMode: 'multiple',
                                            selectedMonths: prev.selectedMonths && prev.selectedMonths.length > 0 ? prev.selectedMonths : [selectedMonth]
                                        }));
                                    }}
                                    className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                                        auditHeader.periodMode === 'multiple'
                                            ? 'bg-indigo-50/70 border-indigo-300 ring-2 ring-indigo-500/20 shadow-xs'
                                            : 'bg-slate-50/60 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                                    }`}
                                >
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className="font-bold text-xs text-slate-900 flex items-center gap-2">
                                            <Layers className="w-4 h-4 text-indigo-600" />
                                            <span>Mode 2: Multiple Months Audit</span>
                                        </span>
                                        {auditHeader.periodMode === 'multiple' && (
                                            <span className="w-2 h-2 rounded-full bg-indigo-600" />
                                        )}
                                    </div>
                                    <p className="text-[11px] text-slate-500 leading-relaxed">
                                        Consolidated audit review across a custom multi-month period (e.g. Q1, Q2, H1, or custom months) consolidating turnover, returns, and compliance.
                                    </p>
                                </button>
                            </div>

                            {/* Single Month Configuration */}
                            {(auditHeader.periodMode || 'single') === 'single' ? (
                                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                                    <div className="flex items-center justify-between flex-wrap gap-2">
                                        <span className="text-xs font-bold text-slate-700">Select Audit Month:</span>
                                        <span className="text-xs font-mono font-bold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded border border-indigo-200">
                                            Active Scope: {selectedMonth} FY {selectedFy}
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
                                        {MONTHS.map(m => {
                                            const isSelected = selectedMonth === m;
                                            return (
                                                <button
                                                    key={m}
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedMonth(m);
                                                        setAuditHeader(prev => ({
                                                            ...prev,
                                                            periodMode: 'single',
                                                            selectedMonths: [m]
                                                        }));
                                                    }}
                                                    className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-between cursor-pointer ${
                                                        isSelected
                                                            ? 'bg-indigo-600 text-white shadow-xs'
                                                            : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                                                    }`}
                                                >
                                                    <span>{m}</span>
                                                    {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : (
                                /* Multiple Months Configuration */
                                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
                                    {/* Quick Presets */}
                                    <div>
                                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                                            Quick Period Presets:
                                        </span>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            {PERIOD_PRESETS.map(preset => (
                                                <button
                                                    key={preset.label}
                                                    type="button"
                                                    onClick={() => handleApplyPreset(preset.months, preset.label)}
                                                    className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 transition cursor-pointer shadow-2xs"
                                                >
                                                    {preset.label}
                                                </button>
                                            ))}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setAuditHeader(prev => ({
                                                        ...prev,
                                                        selectedMonths: [...MONTHS]
                                                    }));
                                                    toast.info('All 12 months selected in audit scope');
                                                }}
                                                className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 transition cursor-pointer shadow-2xs"
                                            >
                                                Select All (12M)
                                            </button>
                                        </div>
                                    </div>

                                    {/* Interactive Month Checklist Pills */}
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                                                Select Months in Scope (Click to Toggle):
                                            </span>
                                            <span className="text-xs font-mono font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded">
                                                {(auditHeader.selectedMonths || []).length} of 12 Months Selected
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
                                            {MONTHS.map(m => {
                                                const isChecked = (auditHeader.selectedMonths || []).includes(m);
                                                return (
                                                    <button
                                                        key={m}
                                                        type="button"
                                                        onClick={() => handleToggleMonthInMultiMode(m)}
                                                        className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-between cursor-pointer border ${
                                                            isChecked
                                                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                                                                : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                                                        }`}
                                                    >
                                                        <span>{m}</span>
                                                        <span className={`w-4 h-4 rounded flex items-center justify-center ${
                                                            isChecked ? 'bg-white/20 text-white' : 'border border-slate-300'
                                                        }`}>
                                                            {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Multi-Month Scope Summary Badge Card */}
                                    <div className="bg-white border border-indigo-200 rounded-xl p-3 flex items-center justify-between flex-wrap gap-2">
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 shrink-0">
                                                <Calendar className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <div className="text-xs font-bold text-slate-900">
                                                    {(auditHeader.selectedMonths || []).length} Months Covered in Multi-Month Audit
                                                </div>
                                                <div className="text-[11px] font-mono text-slate-500">
                                                    Scope: {(auditHeader.selectedMonths || []).join(', ') || 'No months selected'} (FY {selectedFy})
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* 3. 5 Core Registers Vouching Scope Quick Access Banner */}
                        <div className="p-5 rounded-2xl border border-indigo-200/80 bg-gradient-to-r from-indigo-50/70 via-slate-50 to-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-2xs">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                                    <Layers className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                                        <span>3. 5 Core Registers Vouching Scope Checklist</span>
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">
                                            SA 530
                                        </span>
                                    </h3>
                                    <p className="text-[11px] text-slate-500 mt-0.5">
                                        Vouching scope and audit sampling framework shifted to <strong>Audit Sections &amp; Workings</strong> for focused working paper execution.
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setActiveTab('vouching')}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer flex items-center gap-1.5 shrink-0"
                            >
                                <span>Open Vouching Scope</span>
                                <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                )}

                {/* ─── TAB 2: Profitability Status (Schedule III P&L) ────────── */}
                {activeTab === 'profitability' && (
                    <div className="space-y-5 animate-in fade-in-50 duration-200">
                        {/* Company & Statement Banner Card */}
                        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-5">
                            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2.5 flex-wrap">
                                        <h2 className="text-lg font-black text-slate-900 tracking-tight">
                                            {profitability.companyName || activeClient.legalName || 'Statement of Profit & Loss'}
                                        </h2>
                                        {profitability.cin && (
                                            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                                                CIN: {profitability.cin}
                                            </span>
                                        )}
                                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                                            <ShieldCheck className="w-3.5 h-3.5" />
                                            <span>Schedule III Part II Compliant</span>
                                        </span>
                                    </div>
                                    {profitability.registeredAddress && (
                                        <p className="text-xs text-slate-500 font-medium">
                                            {profitability.registeredAddress}
                                        </p>
                                    )}
                                    <div className="flex items-center gap-2 pt-1 text-xs text-slate-700 font-bold">
                                        <FileSpreadsheet className="w-4 h-4 text-indigo-600" />
                                        <span>Statement of Profit and Loss for period ended {profitability.periodEndedDate || `${selectedMonth} ${selectedFy}`}</span>
                                    </div>
                                </div>

                                {/* File Path, Reload & Reset Bar */}
                                <div className="flex flex-wrap items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
                                    <div className="flex items-center gap-1.5 px-2">
                                        <FileText className="w-4 h-4 text-slate-400" />
                                        <input
                                            type="text"
                                            value={profitabilityFilePath}
                                            onChange={(e) => setProfitabilityFilePath(e.target.value)}
                                            placeholder="e.g. C:\Financials\P_and_L.xlsx"
                                            className="bg-transparent border-0 text-xs font-mono font-semibold text-slate-800 focus:outline-none w-32 sm:w-40"
                                            title="Source Excel file path"
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleLoadProfitabilityFromFile(profitabilityFilePath)}
                                        disabled={loadingProfitability}
                                        className="py-1.5 px-3 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                                        title="Auto-fill figures from Excel file"
                                    >
                                        <RefreshCw className={`w-3.5 h-3.5 ${loadingProfitability ? 'animate-spin' : ''}`} />
                                        <span>{loadingProfitability ? 'Reading...' : 'Load from Excel'}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleResetProfitability}
                                        className="py-1.5 px-3 rounded-lg text-xs font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 shadow-2xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                                        title="Reset amounts to 0 for junior manual entry"
                                    >
                                        <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                                        <span>Reset to Blank (Junior Entry)</span>
                                    </button>
                                </div>
                            </div>

                            {/* Junior Working Paper Callout */}
                            <div className="mt-4 p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-200 text-xs text-indigo-900 flex items-start gap-2.5">
                                <Sparkles className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />
                                <div className="space-y-0.5">
                                    <span className="font-bold block text-indigo-950">
                                        Junior Working Paper — Schedule III Statement of Profit &amp; Loss Particulars:
                                    </span>
                                    <span className="text-indigo-800">
                                        All statutory Schedule III Part II line items (Particulars) are mentioned below. Juniors should fill up the amounts directly from the client's draft books/trial balance. Subtotals, Total Income, Total Expenses, PBT, EBITDA, and analytical ratios calculate automatically in real-time. Click <strong>Load from Excel</strong> if you want to import directly from a Profit &amp; Loss workbook (e.g. Book1.xlsx).
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* 5 High-Impact Metric Cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
                            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs flex flex-col justify-between">
                                <div className="flex items-center justify-between text-xs text-slate-500 font-semibold mb-2">
                                    <span>Revenue from Operations</span>
                                    <span className="p-1 rounded-lg bg-emerald-50 text-emerald-600">
                                        <TrendingUp className="w-4 h-4" />
                                    </span>
                                </div>
                                <div>
                                    <div className="text-xl font-black text-slate-900 tracking-tight font-mono">
                                        ₹{profitability.revenueFromOperations.toLocaleString('en-IN')}
                                    </div>
                                    <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                                        <span className="font-semibold text-emerald-700">Note 18</span> • Core Operating Turnover
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs flex flex-col justify-between">
                                <div className="flex items-center justify-between text-xs text-slate-500 font-semibold mb-2">
                                    <span>Total Income (I + II)</span>
                                    <span className="p-1 rounded-lg bg-blue-50 text-blue-600">
                                        <Landmark className="w-4 h-4" />
                                    </span>
                                </div>
                                <div>
                                    <div className="text-xl font-black text-slate-900 tracking-tight font-mono">
                                        ₹{profitability.totalIncome.toLocaleString('en-IN')}
                                    </div>
                                    <div className="text-[11px] text-slate-500 mt-1">
                                        Includes Other Income ₹{profitability.otherIncome.toLocaleString('en-IN')} (Note 19)
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs flex flex-col justify-between">
                                <div className="flex items-center justify-between text-xs text-slate-500 font-semibold mb-2">
                                    <span>Total Expenses (IV)</span>
                                    <span className="p-1 rounded-lg bg-slate-100 text-slate-600">
                                        <FileSpreadsheet className="w-4 h-4" />
                                    </span>
                                </div>
                                <div>
                                    <div className="text-xl font-black text-slate-900 tracking-tight font-mono">
                                        ₹{profitability.totalExpenses.toLocaleString('en-IN')}
                                    </div>
                                    <div className="text-[11px] text-slate-500 mt-1">
                                        Material ({profitability.materialConsumptionPct}%) + Staff ({profitability.employeeCostPct}%)
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs flex flex-col justify-between">
                                <div className="flex items-center justify-between text-xs text-slate-500 font-semibold mb-2">
                                    <span>EBITDA (Operating Profit)</span>
                                    <span className="p-1 rounded-lg bg-indigo-50 text-indigo-600">
                                        <Activity className="w-4 h-4" />
                                    </span>
                                </div>
                                <div>
                                    <div className="text-xl font-black text-indigo-900 tracking-tight font-mono">
                                        ₹{profitability.ebitda.toLocaleString('en-IN')}
                                    </div>
                                    <div className="text-[11px] text-indigo-700 font-semibold mt-1">
                                        Operating Margin: {profitability.ebitdaMarginPct}%
                                    </div>
                                </div>
                            </div>

                            <div className={`rounded-2xl border p-4 shadow-2xs flex flex-col justify-between ${
                                profitability.profitBeforeTax >= 0
                                    ? 'bg-gradient-to-br from-emerald-50 to-teal-50/50 border-emerald-200/80 text-emerald-950'
                                    : 'bg-gradient-to-br from-rose-50 to-red-50/50 border-rose-200/80 text-rose-950'
                            }`}>
                                <div className="flex items-center justify-between text-xs font-semibold mb-2">
                                    <span>Profit Before Tax (PBT)</span>
                                    <span className={`p-1 rounded-lg ${profitability.profitBeforeTax >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                        <ShieldCheck className="w-4 h-4" />
                                    </span>
                                </div>
                                <div>
                                    <div className="text-xl font-black tracking-tight font-mono">
                                        ₹{profitability.profitBeforeTax.toLocaleString('en-IN')}
                                    </div>
                                    <div className="text-[11px] font-bold mt-1">
                                        Net PBT Margin: {profitability.pbtMarginPct}%
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Interactive Schedule III Statement Table for Juniors */}
                        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
                            <div className="px-5 py-4 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50/50">
                                <div>
                                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                        <BarChart3 className="w-4 h-4 text-indigo-600" />
                                        <span>Schedule III Part II Statement of Profit and Loss Particulars</span>
                                    </h3>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        Juniors fill up the amounts &amp; audit remarks against each particular below. Auto-calculates live.
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[11px] font-mono text-slate-500 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                                        Working Paper: {profitability.sourceFilePath || 'Manual / Blank'}
                                    </span>
                                </div>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs border-collapse">
                                    <thead>
                                        <tr className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200">
                                            <th className="py-3 px-4 w-[34%]">Particulars (Schedule III Line Items)</th>
                                            <th className="py-3 px-4 text-center w-[8%]">Note No.</th>
                                            <th className="py-3 px-4 text-right w-[20%]">Current Period Amount (₹)</th>
                                            <th className="py-3 px-4 text-right w-[10%]">% of Revenue</th>
                                            <th className="py-3 px-4 w-[28%]">Audit Vouching &amp; Scrutiny Remarks</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {/* I. Revenue from Operations */}
                                        <tr className="hover:bg-slate-50/60 transition">
                                            <td className="py-3 px-4 font-bold text-slate-900">
                                                I. Revenue from Operations
                                            </td>
                                            <td className="py-3 px-4 text-center font-mono font-bold text-indigo-700">
                                                18
                                            </td>
                                            <td className="py-3 px-4 text-right">
                                                <input
                                                    type="number"
                                                    value={profitability.revenueFromOperations === 0 ? '' : profitability.revenueFromOperations}
                                                    onChange={(e) => handleUpdateProfitabilityItem('revenueFromOperations', e.target.value)}
                                                    placeholder="0.00"
                                                    className="w-full text-right font-mono font-bold text-slate-900 bg-white hover:bg-slate-50 focus:bg-white focus:ring-1 focus:ring-indigo-500 border border-slate-200 rounded px-2.5 py-1 transition"
                                                />
                                            </td>
                                            <td className="py-3 px-4 text-right font-mono font-bold text-slate-700">
                                                {profitability.revenueFromOperations > 0 ? '100.00%' : '0.00%'}
                                            </td>
                                            <td className="py-3 px-4">
                                                <input
                                                    type="text"
                                                    value={profitability.remarks?.revenue ?? 'Vouched against Sales Register & GSTR-1 Table 4/5'}
                                                    onChange={(e) => handleUpdateProfitabilityRemark('revenue', e.target.value)}
                                                    placeholder="Vouching notes..."
                                                    className="w-full text-xs text-slate-700 bg-transparent hover:bg-slate-50 focus:bg-white focus:ring-1 focus:ring-indigo-500 rounded px-2 py-1 transition border border-transparent hover:border-slate-200"
                                                />
                                            </td>
                                        </tr>

                                        {/* II. Other Income */}
                                        <tr className="hover:bg-slate-50/60 transition">
                                            <td className="py-3 px-4 font-bold text-slate-900">
                                                II. Other Income
                                            </td>
                                            <td className="py-3 px-4 text-center font-mono font-bold text-indigo-700">
                                                19
                                            </td>
                                            <td className="py-3 px-4 text-right">
                                                <input
                                                    type="number"
                                                    value={profitability.otherIncome === 0 ? '' : profitability.otherIncome}
                                                    onChange={(e) => handleUpdateProfitabilityItem('otherIncome', e.target.value)}
                                                    placeholder="0.00"
                                                    className="w-full text-right font-mono font-bold text-slate-900 bg-white hover:bg-slate-50 focus:bg-white focus:ring-1 focus:ring-indigo-500 border border-slate-200 rounded px-2.5 py-1 transition"
                                                />
                                            </td>
                                            <td className="py-3 px-4 text-right font-mono text-slate-600">
                                                {((profitability.otherIncome / (profitability.revenueFromOperations || 1)) * 100).toFixed(2)}%
                                            </td>
                                            <td className="py-3 px-4">
                                                <input
                                                    type="text"
                                                    value={profitability.remarks?.otherIncome ?? 'Interest income & non-operating receipts verified with Form 26AS/AIS'}
                                                    onChange={(e) => handleUpdateProfitabilityRemark('otherIncome', e.target.value)}
                                                    placeholder="Vouching notes..."
                                                    className="w-full text-xs text-slate-700 bg-transparent hover:bg-slate-50 focus:bg-white focus:ring-1 focus:ring-indigo-500 rounded px-2 py-1 transition border border-transparent hover:border-slate-200"
                                                />
                                            </td>
                                        </tr>

                                        {/* III. Total Income */}
                                        <tr className="bg-slate-50 font-black text-slate-900 border-y border-slate-200">
                                            <td className="py-3 px-4">
                                                III. Total Income (I + II)
                                            </td>
                                            <td className="py-3 px-4 text-center">—</td>
                                            <td className="py-3 px-4 text-right font-mono text-sm text-blue-900">
                                                ₹{profitability.totalIncome.toLocaleString('en-IN')}
                                            </td>
                                            <td className="py-3 px-4 text-right font-mono">
                                                {((profitability.totalIncome / (profitability.revenueFromOperations || 1)) * 100).toFixed(2)}%
                                            </td>
                                            <td className="py-3 px-4 text-slate-600 font-semibold italic text-[11px]">
                                                [Auto-Sum] Gross turnover &amp; other business receipts recognized
                                            </td>
                                        </tr>

                                        {/* IV. Expenses Category */}
                                        <tr className="bg-slate-100/50 font-bold text-slate-800">
                                            <td colSpan={5} className="py-2.5 px-4 text-xs uppercase tracking-wider text-slate-600">
                                                IV. Expenses (Notes 20 to 25)
                                            </td>
                                        </tr>

                                        {/* Cost of Material Consumed */}
                                        <tr className="hover:bg-slate-50/60 transition">
                                            <td className="py-2.5 px-4 pl-8 text-slate-800 font-medium">
                                                (a) Cost of Material Consumed
                                            </td>
                                            <td className="py-2.5 px-4 text-center font-mono font-bold text-indigo-700">
                                                20
                                            </td>
                                            <td className="py-2.5 px-4 text-right">
                                                <input
                                                    type="number"
                                                    value={profitability.costOfMaterialsConsumed === 0 ? '' : profitability.costOfMaterialsConsumed}
                                                    onChange={(e) => handleUpdateProfitabilityItem('costOfMaterialsConsumed', e.target.value)}
                                                    placeholder="0.00"
                                                    className="w-full text-right font-mono font-semibold text-slate-900 bg-white hover:bg-slate-50 focus:bg-white focus:ring-1 focus:ring-indigo-500 border border-slate-200 rounded px-2.5 py-1 transition"
                                                />
                                            </td>
                                            <td className="py-2.5 px-4 text-right font-mono text-slate-600">
                                                {profitability.materialConsumptionPct}%
                                            </td>
                                            <td className="py-2.5 px-4">
                                                <input
                                                    type="text"
                                                    value={profitability.remarks?.material ?? 'Purchase Register substantive vouching & store physical stock sheets'}
                                                    onChange={(e) => handleUpdateProfitabilityRemark('material', e.target.value)}
                                                    placeholder="Vouching notes..."
                                                    className="w-full text-xs text-slate-700 bg-transparent hover:bg-slate-50 focus:bg-white focus:ring-1 focus:ring-indigo-500 rounded px-2 py-1 transition border border-transparent hover:border-slate-200"
                                                />
                                            </td>
                                        </tr>

                                        {/* Change in Inventories */}
                                        <tr className="hover:bg-slate-50/60 transition">
                                            <td className="py-2.5 px-4 pl-8 text-slate-800 font-medium">
                                                (b) Change in Inventories of Work in Progress and Finished Goods
                                            </td>
                                            <td className="py-2.5 px-4 text-center font-mono font-bold text-indigo-700">
                                                21
                                            </td>
                                            <td className="py-2.5 px-4 text-right">
                                                <input
                                                    type="number"
                                                    value={profitability.changeInInventories === 0 ? '' : profitability.changeInInventories}
                                                    onChange={(e) => handleUpdateProfitabilityItem('changeInInventories', e.target.value)}
                                                    placeholder="0.00 (negative for accretion)"
                                                    className="w-full text-right font-mono font-semibold text-slate-900 bg-white hover:bg-slate-50 focus:bg-white focus:ring-1 focus:ring-indigo-500 border border-slate-200 rounded px-2.5 py-1 transition"
                                                />
                                            </td>
                                            <td className="py-2.5 px-4 text-right font-mono text-slate-600">
                                                {((profitability.changeInInventories / (profitability.revenueFromOperations || 1)) * 100).toFixed(2)}%
                                            </td>
                                            <td className="py-2.5 px-4">
                                                <input
                                                    type="text"
                                                    value={profitability.remarks?.inventory ?? 'Accretion / De-accretion of site work in progress & contracts'}
                                                    onChange={(e) => handleUpdateProfitabilityRemark('inventory', e.target.value)}
                                                    placeholder="Vouching notes..."
                                                    className="w-full text-xs text-slate-700 bg-transparent hover:bg-slate-50 focus:bg-white focus:ring-1 focus:ring-indigo-500 rounded px-2 py-1 transition border border-transparent hover:border-slate-200"
                                                />
                                            </td>
                                        </tr>

                                        {/* Employee Benefit Expenses */}
                                        <tr className="hover:bg-slate-50/60 transition">
                                            <td className="py-2.5 px-4 pl-8 text-slate-800 font-medium">
                                                (c) Employee Benefit Expenses
                                            </td>
                                            <td className="py-2.5 px-4 text-center font-mono font-bold text-indigo-700">
                                                22
                                            </td>
                                            <td className="py-2.5 px-4 text-right">
                                                <input
                                                    type="number"
                                                    value={profitability.employeeBenefitExpenses === 0 ? '' : profitability.employeeBenefitExpenses}
                                                    onChange={(e) => handleUpdateProfitabilityItem('employeeBenefitExpenses', e.target.value)}
                                                    placeholder="0.00"
                                                    className="w-full text-right font-mono font-semibold text-slate-900 bg-white hover:bg-slate-50 focus:bg-white focus:ring-1 focus:ring-indigo-500 border border-slate-200 rounded px-2.5 py-1 transition"
                                                />
                                            </td>
                                            <td className="py-2.5 px-4 text-right font-mono text-slate-600">
                                                {profitability.employeeCostPct}%
                                            </td>
                                            <td className="py-2.5 px-4">
                                                <input
                                                    type="text"
                                                    value={profitability.remarks?.employee ?? 'Salary sheets, PF/ESIC timely deposits (Sec 36(1)(va)) & Form 24Q'}
                                                    onChange={(e) => handleUpdateProfitabilityRemark('employee', e.target.value)}
                                                    placeholder="Vouching notes..."
                                                    className="w-full text-xs text-slate-700 bg-transparent hover:bg-slate-50 focus:bg-white focus:ring-1 focus:ring-indigo-500 rounded px-2 py-1 transition border border-transparent hover:border-slate-200"
                                                />
                                            </td>
                                        </tr>

                                        {/* Finance Costs */}
                                        <tr className="hover:bg-slate-50/60 transition">
                                            <td className="py-2.5 px-4 pl-8 text-slate-800 font-medium">
                                                (d) Finance Costs
                                            </td>
                                            <td className="py-2.5 px-4 text-center font-mono font-bold text-indigo-700">
                                                23
                                            </td>
                                            <td className="py-2.5 px-4 text-right">
                                                <input
                                                    type="number"
                                                    value={profitability.financeCosts === 0 ? '' : profitability.financeCosts}
                                                    onChange={(e) => handleUpdateProfitabilityItem('financeCosts', e.target.value)}
                                                    placeholder="0.00"
                                                    className="w-full text-right font-mono font-semibold text-slate-900 bg-white hover:bg-slate-50 focus:bg-white focus:ring-1 focus:ring-indigo-500 border border-slate-200 rounded px-2.5 py-1 transition"
                                                />
                                            </td>
                                            <td className="py-2.5 px-4 text-right font-mono text-slate-600">
                                                {profitability.financeCostPct}%
                                            </td>
                                            <td className="py-2.5 px-4">
                                                <input
                                                    type="text"
                                                    value={profitability.remarks?.finance ?? 'Bank term loan interest, CC limit interest & servicing charges'}
                                                    onChange={(e) => handleUpdateProfitabilityRemark('finance', e.target.value)}
                                                    placeholder="Vouching notes..."
                                                    className="w-full text-xs text-slate-700 bg-transparent hover:bg-slate-50 focus:bg-white focus:ring-1 focus:ring-indigo-500 rounded px-2 py-1 transition border border-transparent hover:border-slate-200"
                                                />
                                            </td>
                                        </tr>

                                        {/* Depreciation and Amortization */}
                                        <tr className="hover:bg-slate-50/60 transition">
                                            <td className="py-2.5 px-4 pl-8 text-slate-800 font-medium">
                                                (e) Depreciation and Amortization Expenses
                                            </td>
                                            <td className="py-2.5 px-4 text-center font-mono font-bold text-indigo-700">
                                                24
                                            </td>
                                            <td className="py-2.5 px-4 text-right">
                                                <input
                                                    type="number"
                                                    value={profitability.depreciationAmortization === 0 ? '' : profitability.depreciationAmortization}
                                                    onChange={(e) => handleUpdateProfitabilityItem('depreciationAmortization', e.target.value)}
                                                    placeholder="0.00"
                                                    className="w-full text-right font-mono font-semibold text-slate-900 bg-white hover:bg-slate-50 focus:bg-white focus:ring-1 focus:ring-indigo-500 border border-slate-200 rounded px-2.5 py-1 transition"
                                                />
                                            </td>
                                            <td className="py-2.5 px-4 text-right font-mono text-slate-600">
                                                {((profitability.depreciationAmortization / (profitability.revenueFromOperations || 1)) * 100).toFixed(2)}%
                                            </td>
                                            <td className="py-2.5 px-4">
                                                <input
                                                    type="text"
                                                    value={profitability.remarks?.depreciation ?? 'Fixed asset register depreciation working (Companies Act vs IT Act)'}
                                                    onChange={(e) => handleUpdateProfitabilityRemark('depreciation', e.target.value)}
                                                    placeholder="Vouching notes..."
                                                    className="w-full text-xs text-slate-700 bg-transparent hover:bg-slate-50 focus:bg-white focus:ring-1 focus:ring-indigo-500 rounded px-2 py-1 transition border border-transparent hover:border-slate-200"
                                                />
                                            </td>
                                        </tr>

                                        {/* Other Expenses */}
                                        <tr className="hover:bg-slate-50/60 transition">
                                            <td className="py-2.5 px-4 pl-8 text-slate-800 font-medium">
                                                (f) Other Expenses
                                            </td>
                                            <td className="py-2.5 px-4 text-center font-mono font-bold text-indigo-700">
                                                25
                                            </td>
                                            <td className="py-2.5 px-4 text-right">
                                                <input
                                                    type="number"
                                                    value={profitability.otherExpenses === 0 ? '' : profitability.otherExpenses}
                                                    onChange={(e) => handleUpdateProfitabilityItem('otherExpenses', e.target.value)}
                                                    placeholder="0.00"
                                                    className="w-full text-right font-mono font-semibold text-slate-900 bg-white hover:bg-slate-50 focus:bg-white focus:ring-1 focus:ring-indigo-500 border border-slate-200 rounded px-2.5 py-1 transition"
                                                />
                                            </td>
                                            <td className="py-2.5 px-4 text-right font-mono text-slate-600">
                                                {((profitability.otherExpenses / (profitability.revenueFromOperations || 1)) * 100).toFixed(2)}%
                                            </td>
                                            <td className="py-2.5 px-4">
                                                <input
                                                    type="text"
                                                    value={profitability.remarks?.otherExpenses ?? 'Administrative, site overheads & Sec 40A(3) cash check'}
                                                    onChange={(e) => handleUpdateProfitabilityRemark('otherExpenses', e.target.value)}
                                                    placeholder="Vouching notes..."
                                                    className="w-full text-xs text-slate-700 bg-transparent hover:bg-slate-50 focus:bg-white focus:ring-1 focus:ring-indigo-500 rounded px-2 py-1 transition border border-transparent hover:border-slate-200"
                                                />
                                            </td>
                                        </tr>

                                        {/* Total Expenses */}
                                        <tr className="bg-slate-50 font-black text-slate-900 border-y border-slate-200">
                                            <td className="py-3 px-4">
                                                Total Expenses (a to f)
                                            </td>
                                            <td className="py-3 px-4 text-center">—</td>
                                            <td className="py-3 px-4 text-right font-mono text-sm text-slate-900">
                                                ₹{profitability.totalExpenses.toLocaleString('en-IN')}
                                            </td>
                                            <td className="py-3 px-4 text-right font-mono">
                                                {((profitability.totalExpenses / (profitability.revenueFromOperations || 1)) * 100).toFixed(2)}%
                                            </td>
                                            <td className="py-3 px-4 text-slate-600 font-semibold italic text-[11px]">
                                                [Auto-Sum] Total operational, finance &amp; depreciation charges
                                            </td>
                                        </tr>

                                        {/* V. Profit / (Loss) Before Tax */}
                                        <tr className={`font-black border-t-2 ${
                                            profitability.profitBeforeTax >= 0
                                                ? 'bg-emerald-50/80 text-emerald-950 border-emerald-400'
                                                : 'bg-rose-50/80 text-rose-950 border-rose-400'
                                        }`}>
                                            <td className="py-3.5 px-4 text-sm">
                                                V. Profit / (Loss) Before Tax (III - Total Expenses)
                                            </td>
                                            <td className="py-3.5 px-4 text-center font-mono">
                                                PBT
                                            </td>
                                            <td className="py-3.5 px-4 text-right font-mono text-base">
                                                ₹{profitability.profitBeforeTax.toLocaleString('en-IN')}
                                            </td>
                                            <td className="py-3.5 px-4 text-right font-mono">
                                                {profitability.pbtMarginPct}%
                                            </td>
                                            <td className="py-3.5 px-4 font-bold text-xs">
                                                Statutory net profit before provision for income tax
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Schedule III Notes Guidance Dropdown Feature (Hidden by Default) */}
                        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden transition-all">
                            <button
                                type="button"
                                onClick={() => setShowNotesGuidance(prev => !prev)}
                                className="w-full px-5 py-3.5 flex items-center justify-between text-left hover:bg-slate-50/80 transition cursor-pointer"
                            >
                                <div className="flex items-center gap-2.5">
                                    <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
                                        <FileText className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <span className="text-sm font-bold text-slate-900 block">
                                            Schedule III Part II Notes Guidance for Junior Auditors
                                        </span>
                                        <span className="text-[11px] text-slate-500">
                                            Click to {showNotesGuidance ? 'collapse & hide' : 'expand & view'} reference definitions for Notes 18 to 25
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-semibold text-slate-500">
                                        {showNotesGuidance ? 'Hide Notes Guidance' : 'Show Notes Guidance (8 Notes)'}
                                    </span>
                                    {showNotesGuidance ? (
                                        <ChevronDown className="w-4 h-4 text-slate-500" />
                                    ) : (
                                        <ChevronRight className="w-4 h-4 text-slate-400" />
                                    )}
                                </div>
                            </button>

                            {showNotesGuidance && (
                                <div className="p-5 pt-2 border-t border-slate-100 animate-in fade-in-50 duration-150">
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs text-slate-600">
                                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                                            <span className="font-bold text-slate-900 block">Note 18: Revenue from Operations</span>
                                            <span>Sale of products, contract services, project execution receipts minus GST, matched with GSTR-1 &amp; Sales Register.</span>
                                        </div>
                                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                                            <span className="font-bold text-slate-900 block">Note 19: Other Income</span>
                                            <span>Bank FD interest, interest on income tax refund, scrap sales, dividend receipts, verified with Form 26AS/AIS.</span>
                                        </div>
                                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                                            <span className="font-bold text-slate-900 block">Note 20: Cost of Material</span>
                                            <span>Opening stock of raw materials + inward purchases during period - closing stock. Reconciled with GSTR-2B.</span>
                                        </div>
                                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                                            <span className="font-bold text-slate-900 block">Note 21: Change in Inventories</span>
                                            <span>Opening WIP/FG minus closing WIP/FG. Positive means consumption; negative (bracketed) means production accretion.</span>
                                        </div>
                                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                                            <span className="font-bold text-slate-900 block">Note 22: Employee Benefits</span>
                                            <span>Gross salaries, wages, bonus, staff welfare, employer PF &amp; ESIC contribution, verified with timely deposit dates.</span>
                                        </div>
                                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                                            <span className="font-bold text-slate-900 block">Note 23: Finance Costs</span>
                                            <span>Term loan interest, working capital CC interest, processing fees, LC charges, cross-verified with bank loan statements.</span>
                                        </div>
                                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                                            <span className="font-bold text-slate-900 block">Note 24: Depreciation</span>
                                            <span>Depreciation on tangible assets and amortization of intangible assets as per Companies Act 2013 Schedule II useful lives.</span>
                                        </div>
                                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                                            <span className="font-bold text-slate-900 block">Note 25: Other Expenses</span>
                                            <span>Rent, rates, audit fees, site running overheads, insurance, professional charges, check u/s 40A(3) for cash payments &gt; ₹10k.</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Analytical Financial Ratios & Benchmark Comparison */}
                        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-5">
                            <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                                <Percent className="w-4 h-4 text-indigo-600" />
                                <span>Key Financial Ratios &amp; Statutory Analytical Review</span>
                            </h3>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-1">
                                    <div className="text-xs font-semibold text-slate-500">Operating Margin (EBITDA / Revenue)</div>
                                    <div className="text-lg font-black font-mono text-indigo-700">{profitability.ebitdaMarginPct}%</div>
                                    <div className="text-[11px] text-slate-500">Benchmark: 8-12% for infrastructure contracts</div>
                                </div>

                                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-1">
                                    <div className="text-xs font-semibold text-slate-500">Net PBT Margin (PBT / Revenue)</div>
                                    <div className="text-lg font-black font-mono text-emerald-700">{profitability.pbtMarginPct}%</div>
                                    <div className="text-[11px] text-slate-500">Statutory earnings before tax provision</div>
                                </div>

                                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-1">
                                    <div className="text-xs font-semibold text-slate-500">Material Cost Ratio (Note 20 / Revenue)</div>
                                    <div className="text-lg font-black font-mono text-blue-700">{profitability.materialConsumptionPct}%</div>
                                    <div className="text-[11px] text-slate-500">Direct contract consumption intensity</div>
                                </div>

                                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-1">
                                    <div className="text-xs font-semibold text-slate-500">Employee Cost Ratio (Note 22 / Revenue)</div>
                                    <div className="text-lg font-black font-mono text-amber-700">{profitability.employeeCostPct}%</div>
                                    <div className="text-[11px] text-slate-500">Staff, labor wages &amp; statutory welfare</div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ─── TAB 3: Core Verification Workings (3.1–3.7) ────────────────── */}
                {activeTab === 'verification' && (
                    <div className="space-y-5">
                        {/* Sub-working Navigation Dropdown Menu */}
                        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-2.5 flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-3">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 pl-1 hidden sm:inline">
                                    Working Paper:
                                </span>
                                <div className="relative">
                                    {(() => {
                                        let currentIcon = Layers;
                                        let currentLabel = '3.0 Vouching Scope';
                                        let currentBadge = 'Checklist';
                                        let currentColor = 'text-indigo-600';
                                        let currentBg = 'bg-indigo-50';

                                        if (isGstActive) {
                                            currentIcon = FileSpreadsheet;
                                            currentLabel = 'GST Workings';
                                            currentBadge = 'GSTR-1 & 2B';
                                            currentColor = 'text-blue-600';
                                            currentBg = 'bg-blue-50';
                                        } else {
                                            const found = verificationSubTabs.find(t => t.id === verificationSubTab) || verificationSubTabs[0];
                                            currentIcon = found.icon;
                                            currentLabel = found.label;
                                            currentBadge = found.badge;
                                            currentColor = found.color;
                                            currentBg = found.bg;
                                        }
                                        const SubIcon = currentIcon;
                                        return (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={() => setIsVerificationSubTabOpen(prev => !prev)}
                                                    className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200/90 hover:border-indigo-300 text-slate-900 font-bold text-xs shadow-2xs transition cursor-pointer group"
                                                    title="Select Verification Working"
                                                >
                                                    <div className={`p-1 rounded-lg ${currentBg} ${currentColor} shrink-0`}>
                                                        <SubIcon className="w-3.5 h-3.5" />
                                                    </div>
                                                    <span className="font-extrabold">{currentLabel}</span>
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${currentBg} ${currentColor} border border-slate-200/60`}>
                                                        {currentBadge}
                                                    </span>
                                                    <ChevronDown className={`w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 transition-transform duration-200 ${isVerificationSubTabOpen ? 'rotate-180' : ''}`} />
                                                </button>

                                                {isVerificationSubTabOpen && (
                                                    <>
                                                        <div className="fixed inset-0 z-40" onClick={() => setIsVerificationSubTabOpen(false)} />
                                                        <div className="absolute left-0 top-full mt-2 w-76 sm:w-80 bg-white border border-slate-200 rounded-2xl shadow-xl p-1.5 z-50 animate-pop-in ring-1 ring-slate-200">
                                                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2.5 py-1.5 border-b border-slate-100 flex items-center justify-between">
                                                                <span>Core Verification Workings</span>
                                                                <span className="text-[9px] font-mono font-normal text-slate-400">7 Modules</span>
                                                            </div>
                                                            <div className="py-1 flex flex-col gap-0.5 max-h-[300px] overflow-y-auto">
                                                                {verificationSubTabs.map(tab => {
                                                                    const Icon = tab.icon;
                                                                    const isSelected = tab.id === 'gst' ? isGstActive : verificationSubTab === tab.id;
                                                                    return (
                                                                        <button
                                                                            key={tab.id}
                                                                            type="button"
                                                                            onClick={() => {
                                                                                setVerificationSubTab(tab.id as any);
                                                                                setIsVerificationSubTabOpen(false);
                                                                            }}
                                                                            title={tab.subtitle}
                                                                            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer text-left ${
                                                                                isSelected
                                                                                    ? 'bg-indigo-50 text-indigo-950 font-bold border border-indigo-200/90 shadow-2xs'
                                                                                    : 'text-slate-700 hover:text-slate-900 hover:bg-slate-50 border border-transparent'
                                                                            }`}
                                                                        >
                                                                            <div className="flex items-center gap-2.5 min-w-0">
                                                                                <div className={`p-1 rounded-lg ${tab.bg} ${tab.color} shrink-0`}>
                                                                                    <Icon className="w-3.5 h-3.5" />
                                                                                </div>
                                                                                <span className="font-bold text-slate-800 truncate text-xs">{tab.label}</span>
                                                                            </div>
                                                                            <span className={`ml-2 px-1.5 py-0.2 rounded-full text-[9px] font-mono font-bold shrink-0 ${tab.bg} ${tab.color} border border-slate-200/60`}>
                                                                                {tab.badge}
                                                                            </span>
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    </>
                                                )}
                                            </>
                                        );
                                    })()}
                                </div>
                            </div>

                            {/* Previous & Next Stepper Controls */}
                            {(() => {
                                const STEPPER_STEPS = [
                                    { id: 'vouching', label: '3.0 Vouching Scope' },
                                    { id: 'gst', label: 'GST Workings' },
                                    { id: 'journal', label: '3.3 TDS Working' },
                                    { id: 'bank', label: '3.4 Bank, Loans & 26AS' },
                                    { id: 'roc', label: '3.5 ROC Charges' },
                                    { id: 'cash', label: '3.6 Cash 40A(3) & FA' },
                                    { id: 'labor', label: '3.7 Labor Compliances' }
                                ] as const;

                                const currentStepIndex = (() => {
                                    if (verificationSubTab === 'vouching') return 0;
                                    if (isGstActive) return 1;
                                    if (verificationSubTab === 'journal') return 2;
                                    if (verificationSubTab === 'bank') return 3;
                                    if (verificationSubTab === 'roc') return 4;
                                    if (verificationSubTab === 'cash') return 5;
                                    if (verificationSubTab === 'labor') return 6;
                                    return 1;
                                })();

                                const handleStep = (targetIdx: number) => {
                                    const target = STEPPER_STEPS[targetIdx];
                                    if (!target) return;
                                    setVerificationSubTab(target.id as any);
                                };

                                return (
                                    <div className="flex items-center gap-1.5 text-xs">
                                        <button
                                            type="button"
                                            disabled={currentStepIndex <= 0}
                                            onClick={() => handleStep(currentStepIndex - 1)}
                                            className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 font-semibold flex items-center gap-1 transition shadow-2xs cursor-pointer"
                                            title="Previous Working"
                                        >
                                            <ChevronLeft className="w-3.5 h-3.5" />
                                            <span className="hidden sm:inline">Prev</span>
                                        </button>
                                        <span className="text-[11px] font-mono text-slate-400 px-1 font-bold">
                                            {currentStepIndex + 1} / {STEPPER_STEPS.length}
                                        </span>
                                        <button
                                            type="button"
                                            disabled={currentStepIndex >= STEPPER_STEPS.length - 1}
                                            onClick={() => handleStep(currentStepIndex + 1)}
                                            className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 font-semibold flex items-center gap-1 transition shadow-2xs cursor-pointer"
                                            title="Next Working"
                                        >
                                            <span className="hidden sm:inline">Next</span>
                                            <ChevronRight className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                );
                            })()}
                        </div>

                        {/* 3.0 Vouching Scope Checklist View */}
                        {verificationSubTab === 'vouching' && renderVouchingScopeSection()}

                        {/* ─── 3.1 & 3.2 GST Workings (Merged Container) ────────────────────────── */}
                        {isGstActive && (
                            <div className="space-y-4 animate-in fade-in-50 duration-200">
                                {/* GST Sub-Module Switcher Bar */}
                                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-2.5 flex items-center justify-between gap-3 flex-wrap">
                                    <div className="flex items-center gap-2.5">
                                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 pl-1 hidden sm:inline">
                                            GST Module:
                                        </span>
                                        <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 border border-slate-200/80">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setGstSubTab('sales');
                                                    setVerificationSubTab('gst');
                                                }}
                                                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                                                    activeGstSubTab === 'sales'
                                                        ? 'bg-white text-blue-900 shadow-2xs border border-blue-200/90 font-extrabold'
                                                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                                                }`}
                                            >
                                                <BarChart3 className="w-3.5 h-3.5 text-blue-600" />
                                                <span>3.1 Sales (Reco R1)</span>
                                                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-blue-50 text-blue-700 border border-blue-200 font-bold">
                                                    GSTR-1
                                                </span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setGstSubTab('purchase');
                                                    setVerificationSubTab('gst');
                                                }}
                                                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                                                    activeGstSubTab === 'purchase'
                                                        ? 'bg-white text-emerald-900 shadow-2xs border border-emerald-200/90 font-extrabold'
                                                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                                                }`}
                                            >
                                                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                                                <span>3.2 Purchase (Reco 2B)</span>
                                                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
                                                    GSTR-2B
                                                </span>
                                            </button>
                                        </div>
                                    </div>

                                    <div className="text-[11px] text-slate-500 pr-2 hidden md:flex items-center gap-2">
                                        <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
                                        <span>R1 Outward vs Books</span>
                                        <span className="text-slate-300">•</span>
                                        <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                                        <span>2B Inward vs Books (Sec 16(2)(aa))</span>
                                    </div>
                                </div>

                                {/* 3.1 Sales Reco View */}
                                {activeGstSubTab === 'sales' && (() => {
                            const monthsList = [
                                'April', 'May', 'June', 'July', 'August', 'September',
                                'October', 'November', 'December', 'January', 'February', 'March'
                            ];

                            const isFullFy = salesSelectedPeriod === 'FULL_FY';
                            const effectiveMonth = salesSelectedPeriod === 'active' ? selectedMonth : salesSelectedPeriod;
                            const activeMonthIdx = monthsList.findIndex(m => m.toLowerCase() === effectiveMonth.toLowerCase());
                            const safeMonthIdx = activeMonthIdx >= 0 ? activeMonthIdx : 0;
                            const activeMonthName = isFullFy ? 'FULL FY TOTAL (APR - MAR)' : monthsList[safeMonthIdx];

                            const booksRow = isFullFy
                                ? {
                                    taxable: matrixTotals.books.taxable,
                                    igst: matrixTotals.books.igst,
                                    cgst: matrixTotals.books.cgst,
                                    sgst: matrixTotals.books.sgst,
                                    nilRated: matrixTotals.books.nilRated,
                                    export: matrixTotals.books.export,
                                    totalTax: matrixTotals.books.totalTax
                                }
                                : {
                                    taxable: matrixData[safeMonthIdx]?.books?.taxable || 0,
                                    igst: matrixData[safeMonthIdx]?.books?.igst || 0,
                                    cgst: matrixData[safeMonthIdx]?.books?.cgst || 0,
                                    sgst: matrixData[safeMonthIdx]?.books?.sgst || 0,
                                    nilRated: matrixData[safeMonthIdx]?.books?.nilRated || 0,
                                    export: matrixData[safeMonthIdx]?.books?.export || 0,
                                    totalTax: (matrixData[safeMonthIdx]?.books?.igst || 0) + (matrixData[safeMonthIdx]?.books?.cgst || 0) + (matrixData[safeMonthIdx]?.books?.sgst || 0)
                                };

                            const gstr1Row = isFullFy
                                ? {
                                    taxable: matrixTotals.gstr1.taxable,
                                    igst: matrixTotals.gstr1.igst,
                                    cgst: matrixTotals.gstr1.cgst,
                                    sgst: matrixTotals.gstr1.sgst,
                                    nilRated: matrixTotals.gstr1.nilRated,
                                    export: matrixTotals.gstr1.export,
                                    totalTax: matrixTotals.gstr1.totalTax
                                }
                                : {
                                    taxable: matrixData[safeMonthIdx]?.gstr1?.taxable || 0,
                                    igst: matrixData[safeMonthIdx]?.gstr1?.igst || 0,
                                    cgst: matrixData[safeMonthIdx]?.gstr1?.cgst || 0,
                                    sgst: matrixData[safeMonthIdx]?.gstr1?.sgst || 0,
                                    nilRated: matrixData[safeMonthIdx]?.gstr1?.nilRated || 0,
                                    export: matrixData[safeMonthIdx]?.gstr1?.export || 0,
                                    totalTax: (matrixData[safeMonthIdx]?.gstr1?.igst || 0) + (matrixData[safeMonthIdx]?.gstr1?.cgst || 0) + (matrixData[safeMonthIdx]?.gstr1?.sgst || 0)
                                };

                            const gstr3bRow = isFullFy
                                ? {
                                    taxable: matrixTotals.gstr3b.taxable,
                                    igst: matrixTotals.gstr3b.igst,
                                    cgst: matrixTotals.gstr3b.cgst,
                                    sgst: matrixTotals.gstr3b.sgst,
                                    nilRated: matrixTotals.gstr3b.nilRated,
                                    export: matrixTotals.gstr3b.export,
                                    totalTax: matrixTotals.gstr3b.totalTax
                                }
                                : {
                                    taxable: matrixData[safeMonthIdx]?.gstr3b?.taxable || 0,
                                    igst: matrixData[safeMonthIdx]?.gstr3b?.igst || 0,
                                    cgst: matrixData[safeMonthIdx]?.gstr3b?.cgst || 0,
                                    sgst: matrixData[safeMonthIdx]?.gstr3b?.sgst || 0,
                                    nilRated: matrixData[safeMonthIdx]?.gstr3b?.nilRated || 0,
                                    export: matrixData[safeMonthIdx]?.gstr3b?.export || 0,
                                    totalTax: (matrixData[safeMonthIdx]?.gstr3b?.igst || 0) + (matrixData[safeMonthIdx]?.gstr3b?.cgst || 0) + (matrixData[safeMonthIdx]?.gstr3b?.sgst || 0)
                                };

                            const diffR1 = {
                                taxable: booksRow.taxable - gstr1Row.taxable,
                                igst: booksRow.igst - gstr1Row.igst,
                                cgst: booksRow.cgst - gstr1Row.cgst,
                                sgst: booksRow.sgst - gstr1Row.sgst,
                                nilRated: booksRow.nilRated - gstr1Row.nilRated,
                                export: booksRow.export - gstr1Row.export,
                                totalTax: booksRow.totalTax - gstr1Row.totalTax
                            };

                            const diff3b = {
                                taxable: booksRow.taxable - gstr3bRow.taxable,
                                igst: booksRow.igst - gstr3bRow.igst,
                                cgst: booksRow.cgst - gstr3bRow.cgst,
                                sgst: booksRow.sgst - gstr3bRow.sgst,
                                nilRated: booksRow.nilRated - gstr3bRow.nilRated,
                                export: booksRow.export - gstr3bRow.export,
                                totalTax: booksRow.totalTax - gstr3bRow.totalTax
                            };

                            const diffDrc = {
                                taxable: gstr1Row.taxable - gstr3bRow.taxable,
                                igst: gstr1Row.igst - gstr3bRow.igst,
                                cgst: gstr1Row.cgst - gstr3bRow.cgst,
                                sgst: gstr1Row.sgst - gstr3bRow.sgst,
                                nilRated: gstr1Row.nilRated - gstr3bRow.nilRated,
                                export: gstr1Row.export - gstr3bRow.export,
                                totalTax: gstr1Row.totalTax - gstr3bRow.totalTax
                            };

                            const renderDiffCell = (diff: number) => {
                                const isZero = diff === 0;
                                return (
                                    <td className="p-3 text-right font-mono text-xs">
                                        <span className={`px-2.5 py-1 rounded-lg inline-block ${
                                            isZero
                                                ? 'text-slate-400 font-normal bg-slate-50'
                                                : (diff > 0 ? 'text-amber-700 bg-amber-50 font-bold border border-amber-200' : 'text-rose-700 bg-rose-50 font-bold border border-rose-200')
                                        }`}>
                                            {isZero ? '₹0' : (diff > 0 ? `+₹${diff.toLocaleString('en-IN')}` : `-₹${Math.abs(diff).toLocaleString('en-IN')}`)}
                                        </span>
                                    </td>
                                );
                            };

                            return (
                                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-6">
                                    {/* Top Header & View Mode Switcher */}
                                    <div className="flex items-center justify-between flex-wrap gap-3 pb-4 border-b border-slate-100">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 inline-block" />
                                                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                                                    3.1 Sales Register vs GSTR-1 vs GSTR-3B Reconciliation
                                                </h3>
                                            </div>
                                            <p className="text-xs text-slate-500 mt-0.5">
                                                12-Month Outward Supplies &amp; Tax Liability 3-Way Reconciliation Matrix (April – March). Junior auditors can input values for substantive checking.
                                            </p>
                                        </div>

                                        <div className="flex items-center gap-2 flex-wrap">
                                            {verification?.sales?.isDrc01bTriggered && (
                                                <span className="px-3 py-1 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 font-bold text-xs flex items-center gap-1.5 shadow-2xs">
                                                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600 animate-pulse" />
                                                    <span>DRC-01B Notice Risk</span>
                                                </span>
                                            )}

                                            {/* View Mode Pills */}
                                            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-xs font-semibold">
                                                <button
                                                    type="button"
                                                    onClick={() => setSalesMatrixViewMode('all')}
                                                    className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                                                        salesMatrixViewMode === 'all'
                                                            ? 'bg-white text-slate-900 shadow-2xs font-bold'
                                                            : 'text-slate-600 hover:text-slate-900'
                                                    }`}
                                                    title="Show all 5 blocks side by side"
                                                >
                                                    All 5 Blocks (Comprehensive)
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setSalesMatrixViewMode('books_r1')}
                                                    className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                                                        salesMatrixViewMode === 'books_r1'
                                                            ? 'bg-white text-blue-900 shadow-2xs font-bold'
                                                            : 'text-slate-600 hover:text-slate-900'
                                                    }`}
                                                    title="Focus on Books vs GSTR-1"
                                                >
                                                    Books vs GSTR-1
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setSalesMatrixViewMode('books_3b')}
                                                    className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                                                        salesMatrixViewMode === 'books_3b'
                                                            ? 'bg-white text-purple-900 shadow-2xs font-bold'
                                                            : 'text-slate-600 hover:text-slate-900'
                                                    }`}
                                                    title="Focus on Books vs GSTR-3B"
                                                >
                                                    Books vs GSTR-3B
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setSalesMatrixViewMode('drc01b')}
                                                    className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                                                        salesMatrixViewMode === 'drc01b'
                                                            ? 'bg-white text-rose-900 shadow-2xs font-bold'
                                                            : 'text-slate-600 hover:text-slate-900'
                                                    }`}
                                                    title="GSTR-1 vs GSTR-3B DRC-01B Scrutiny"
                                                >
                                                    DRC-01B Scrutiny (R1 vs 3B)
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Quick Actions & Seed Bar */}
                                    <div className="flex items-center justify-between flex-wrap gap-2 text-xs bg-slate-50/80 p-3 rounded-xl border border-slate-200">
                                        <div className="flex items-center gap-2 text-slate-600">
                                            <Sparkles className="w-4 h-4 text-indigo-600" />
                                            <span className="font-semibold text-slate-700">Junior Entry &amp; Automation Tools:</span>
                                            <span className="text-slate-500">Auto-fill active month ({selectedMonth}) or enter monthly breakdown below.</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={handleSeedActiveMonthIntoSalesMatrix}
                                                className="flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg font-semibold transition shadow-2xs cursor-pointer"
                                                title={`Copy turnover & tax into ${selectedMonth} row`}
                                            >
                                                <Plus className="w-3.5 h-3.5 text-indigo-600" />
                                                <span>Auto-Fill Active Month ({selectedMonth})</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleResetSalesMatrix}
                                                className="flex items-center gap-1.5 px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-lg font-semibold transition cursor-pointer"
                                                title="Clear all 12 rows"
                                            >
                                                <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                                                <span>Reset Matrix</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleDownloadExcel}
                                                className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold transition shadow-2xs cursor-pointer"
                                                title="Export Zero-Merge Multi-Tab Analytical Excel"
                                            >
                                                <Download className="w-3.5 h-3.5" />
                                                <span>Export Sheet</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Executive Summary Cards */}
                                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                                        {/* Card 1: Books */}
                                        <div className="bg-blue-50/50 border border-blue-200/80 p-3.5 rounded-xl">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-blue-700 font-bold uppercase tracking-wider text-[11px]">1. Books (Sales Reg)</span>
                                                <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-mono">FY TOTAL</span>
                                            </div>
                                            <div className="text-base font-bold font-mono text-slate-900">
                                                ₹{(matrixTotals.books.taxable > 0 ? matrixTotals.books.taxable : (verification?.sales?.booksTurnover ?? 0)).toLocaleString('en-IN')}
                                            </div>
                                            <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                                                Tax: ₹{(matrixTotals.books.totalTax > 0 ? matrixTotals.books.totalTax : (verification?.sales?.taxBooks ?? 0)).toLocaleString('en-IN')}
                                            </div>
                                        </div>

                                        {/* Card 2: GSTR-1 */}
                                        <div className="bg-indigo-50/50 border border-indigo-200/80 p-3.5 rounded-xl">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-indigo-700 font-bold uppercase tracking-wider text-[11px]">2. GSTR-1 (Outward)</span>
                                                <span className="text-[10px] bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded font-mono">PORTAL</span>
                                            </div>
                                            <div className="text-base font-bold font-mono text-slate-900">
                                                ₹{(matrixTotals.gstr1.taxable > 0 ? matrixTotals.gstr1.taxable : (verification?.sales?.r1Turnover ?? 0)).toLocaleString('en-IN')}
                                            </div>
                                            <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                                                Tax: ₹{(matrixTotals.gstr1.totalTax > 0 ? matrixTotals.gstr1.totalTax : (verification?.sales?.taxR1 ?? 0)).toLocaleString('en-IN')}
                                            </div>
                                        </div>

                                        {/* Card 3: Books vs R1 Variance */}
                                        <div className={`p-3.5 rounded-xl border ${
                                            Math.abs((matrixTotals.books.taxable > 0 ? matrixTotals.diffR1.taxable : (verification?.sales?.turnoverDifference ?? 0))) === 0
                                                ? 'bg-emerald-50/50 border-emerald-200/80'
                                                : 'bg-amber-50/50 border-amber-200/80'
                                        }`}>
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-amber-800 font-bold uppercase tracking-wider text-[11px]">3. Books vs R1 Diff</span>
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                                                    Math.abs((matrixTotals.books.taxable > 0 ? matrixTotals.diffR1.taxable : (verification?.sales?.turnoverDifference ?? 0))) === 0
                                                        ? 'bg-emerald-100 text-emerald-800'
                                                        : 'bg-amber-100 text-amber-800 font-bold'
                                                }`}>
                                                    {Math.abs((matrixTotals.books.taxable > 0 ? matrixTotals.diffR1.taxable : (verification?.sales?.turnoverDifference ?? 0))) === 0 ? 'MATCHED' : 'VARIANCE'}
                                                </span>
                                            </div>
                                            <div className={`text-base font-bold font-mono ${
                                                Math.abs((matrixTotals.books.taxable > 0 ? matrixTotals.diffR1.taxable : (verification?.sales?.turnoverDifference ?? 0))) === 0
                                                    ? 'text-emerald-700'
                                                    : 'text-amber-700'
                                            }`}>
                                                ₹{Math.abs((matrixTotals.books.taxable > 0 ? matrixTotals.diffR1.taxable : (verification?.sales?.turnoverDifference ?? 0))).toLocaleString('en-IN')}
                                            </div>
                                            <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                                                Tax Diff: ₹{Math.abs((matrixTotals.books.totalTax > 0 ? matrixTotals.diffR1.totalTax : (Math.abs((verification?.sales?.taxBooks ?? 0) - (verification?.sales?.taxR1 ?? 0))))).toLocaleString('en-IN')}
                                            </div>
                                        </div>

                                        {/* Card 4: GSTR-3B */}
                                        <div className="bg-purple-50/50 border border-purple-200/80 p-3.5 rounded-xl">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-purple-700 font-bold uppercase tracking-wider text-[11px]">4. GSTR-3B (Returns)</span>
                                                <span className="text-[10px] bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded font-mono">PAID</span>
                                            </div>
                                            <div className="text-base font-bold font-mono text-slate-900">
                                                ₹{(matrixTotals.gstr3b.taxable > 0 ? matrixTotals.gstr3b.taxable : (verification?.sales?.gstr3bTurnover ?? 0)).toLocaleString('en-IN')}
                                            </div>
                                            <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                                                Tax: ₹{(matrixTotals.gstr3b.totalTax > 0 ? matrixTotals.gstr3b.totalTax : (verification?.sales?.tax3b ?? 0)).toLocaleString('en-IN')}
                                            </div>
                                        </div>

                                        {/* Card 5: DRC-01B Exposure */}
                                        <div className={`p-3.5 rounded-xl border ${
                                            verification?.sales?.isDrc01bTriggered
                                                ? 'bg-rose-50 border-rose-200 text-rose-900'
                                                : 'bg-slate-50 border-slate-200 text-slate-700'
                                        }`}>
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="font-bold uppercase tracking-wider text-[11px]">5. R1 vs 3B (DRC-01B)</span>
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                                                    verification?.sales?.isDrc01bTriggered
                                                        ? 'bg-rose-100 text-rose-800 font-bold'
                                                        : 'bg-slate-200 text-slate-700'
                                                }`}>
                                                    {verification?.sales?.isDrc01bTriggered ? 'NOTICE RISK' : 'NORMAL'}
                                                </span>
                                            </div>
                                            <div className="text-base font-bold font-mono">
                                                ₹{(matrixTotals.gstr1.totalTax > 0 ? Math.abs(matrixTotals.diffDrc.totalTax) : (verification?.sales?.taxDifference ?? 0)).toLocaleString('en-IN')}
                                            </div>
                                            <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                                                Diff Threshold: ₹25,000 / 20%
                                            </div>
                                        </div>
                                    </div>

                                    {/* DRC-01B Notice Warning Banner */}
                                    {verification?.sales?.drc01bReason && (
                                        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 flex items-start gap-2.5 shadow-2xs">
                                            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                                            <div>
                                                <span className="font-bold block mb-0.5">Statutory Scrutiny Alert — Rule 88C / Form DRC-01B Notice Risk</span>
                                                <span>{verification.sales.drc01bReason}</span>
                                                <span className="block mt-1 text-[11px] text-rose-700">
                                                    Recommendation: Auditor must report this variance to management. Taxpayer has 7 days from notice to either pay the differential tax via Form DRC-03 or file an official reply on the GST portal explaining genuine credit notes/timing differences.
                                                </span>
                                            </div>
                                        </div>
                                    )}

                                    {/* ─── Sales Excel Working Paper Attachment (Audit Evidence) ─── */}
                                    <input
                                        ref={salesFileInputRef}
                                        type="file"
                                        accept=".xlsx,.xls,.csv"
                                        onChange={handleSalesFileUpload}
                                        className="hidden"
                                    />
                                    {verification?.sales?.excelAttachment ? (
                                        <div className="bg-emerald-50/70 border border-emerald-200/90 rounded-xl p-3.5 flex items-center justify-between flex-wrap gap-3 shadow-2xs">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-xl bg-emerald-100 border border-emerald-200 flex items-center justify-center shrink-0">
                                                    <FileSpreadsheet className="w-5 h-5 text-emerald-700" />
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="text-xs font-bold text-slate-900 font-mono">
                                                            {verification.sales.excelAttachment.fileName}
                                                        </span>
                                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white uppercase tracking-wider">
                                                            Sales Working Paper Attached
                                                        </span>
                                                    </div>
                                                    <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                                                        {verification.sales.excelAttachment.fileSize && (
                                                            <span>{(verification.sales.excelAttachment.fileSize / 1024).toFixed(1)} KB</span>
                                                        )}
                                                        {verification.sales.excelAttachment.uploadedAt && (
                                                            <span>· Attached on {verification.sales.excelAttachment.uploadedAt}</span>
                                                        )}
                                                        {verification.sales.excelAttachment.uploadedBy && (
                                                            <span>by {verification.sales.excelAttachment.uploadedBy}</span>
                                                        )}
                                                        {verification.sales.excelAttachment.filePath && (
                                                            <span className="font-mono text-slate-600">({verification.sales.excelAttachment.filePath})</span>
                                                        )}
                                                    </div>
                                                    {verification.sales.excelAttachment.sheetNames && verification.sales.excelAttachment.sheetNames.length > 0 && (
                                                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                                            <span className="text-[10px] font-semibold text-slate-500">Sheets ({verification.sales.excelAttachment.sheetNames.length}):</span>
                                                            {verification.sales.excelAttachment.sheetNames.map((sName, sIdx) => (
                                                                <span key={sIdx} className="px-1.5 py-0.5 bg-white border border-emerald-200 rounded text-[10px] font-mono text-emerald-800">
                                                                    {sName}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                {verification.sales.excelAttachment.fileData && (
                                                    <button
                                                        type="button"
                                                        onClick={handleDownloadSalesAttachment}
                                                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                                                        title="Download attached Excel file"
                                                    >
                                                        <Download className="w-3.5 h-3.5" />
                                                        <span>Download Excel</span>
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => salesFileInputRef.current?.click()}
                                                    className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer border border-slate-200 shadow-2xs"
                                                    title="Replace attached file"
                                                >
                                                    <UploadCloud className="w-3.5 h-3.5 text-slate-500" />
                                                    <span>Replace</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={handleRemoveSalesAttachment}
                                                    className="p-1.5 rounded-lg bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition cursor-pointer border border-slate-200"
                                                    title="Remove attachment"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="bg-slate-50/80 border border-dashed border-slate-300 rounded-xl p-3 flex items-center justify-between flex-wrap gap-2">
                                            <div className="flex items-center gap-2.5">
                                                <div className="w-8 h-8 rounded-lg bg-slate-200/80 flex items-center justify-center shrink-0">
                                                    <Paperclip className="w-4 h-4 text-slate-600" />
                                                </div>
                                                <div>
                                                    <span className="text-xs font-bold text-slate-800 block">
                                                        Attach Sales GST Working Excel (Audit Evidence)
                                                    </span>
                                                    <span className="text-[11px] text-slate-500">
                                                        Upload client Sales Register, detailed working sheet, or GSTR-1 excel file (.xlsx, .xls, .csv)
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 flex-wrap">
                                                <button
                                                    type="button"
                                                    onClick={() => salesFileInputRef.current?.click()}
                                                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                                                >
                                                    <UploadCloud className="w-3.5 h-3.5" />
                                                    <span>Choose Excel File</span>
                                                </button>

                                                <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1">
                                                    <input
                                                        type="text"
                                                        value={salesLocalPathInput}
                                                        onChange={(e) => setSalesLocalPathInput(e.target.value)}
                                                        placeholder="e.g. E:\Sales_Working.xlsx"
                                                        className="text-xs font-mono text-slate-700 bg-transparent border-0 focus:outline-none w-36 sm:w-44"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={handleLinkSalesLocalPath}
                                                        className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[10px] transition cursor-pointer"
                                                    >
                                                        Link Path
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* ─── Period Selector Bar ─── */}
                                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex items-center justify-between flex-wrap gap-2">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mr-1">
                                                <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                                                <span>Period View:</span>
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => setSalesSelectedPeriod('active')}
                                                className={`px-3 py-1 rounded-lg text-xs transition cursor-pointer font-bold flex items-center gap-1.5 ${
                                                    salesSelectedPeriod === 'active' || salesSelectedPeriod === selectedMonth
                                                        ? 'bg-indigo-600 text-white shadow-2xs'
                                                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                                                }`}
                                            >
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                                <span>Active Audit Month ({selectedMonth})</span>
                                            </button>

                                            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5">
                                                {monthsList.map((m) => (
                                                    <button
                                                        key={m}
                                                        type="button"
                                                        onClick={() => setSalesSelectedPeriod(m)}
                                                        className={`px-2 py-0.5 rounded text-[11px] font-semibold transition cursor-pointer ${
                                                            (salesSelectedPeriod === m) || (salesSelectedPeriod === 'active' && m === selectedMonth)
                                                                ? 'bg-indigo-100 text-indigo-900 font-bold'
                                                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                                                        }`}
                                                        title={m}
                                                    >
                                                        {m.slice(0, 3)}
                                                    </button>
                                                ))}
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => setSalesSelectedPeriod('FULL_FY')}
                                                className={`px-3 py-1 rounded-lg text-xs transition cursor-pointer font-bold ${
                                                    salesSelectedPeriod === 'FULL_FY'
                                                        ? 'bg-slate-900 text-amber-400 shadow-2xs'
                                                        : 'bg-white text-slate-800 border border-slate-200 hover:bg-slate-100'
                                                }`}
                                            >
                                                FULL FY TOTAL (APR - MAR)
                                            </button>
                                        </div>

                                        {isFullFy ? (
                                            <span className="text-[11px] text-amber-700 font-semibold bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                                                Viewing 12-Month Cumulative FY Totals (Select any month to edit values)
                                            </span>
                                        ) : (
                                            <span className="text-[11px] text-slate-500">
                                                Editing <span className="font-semibold text-slate-800">{activeMonthName}</span> outward figures
                                            </span>
                                        )}
                                    </div>

                                    {/* ─── Compact 3-Way Outward Supplies Table (Columns: Taxable, IGST, CGST, SGST, Total) ─── */}
                                    <div className="overflow-x-auto border border-slate-200 rounded-2xl shadow-2xs bg-white">
                                        <table className="w-full text-left border-collapse text-xs">
                                            <thead>
                                                <tr className="bg-slate-100 text-slate-800 font-bold uppercase tracking-wider text-[11px] border-b border-slate-300 divide-x divide-slate-200">
                                                    <th className="p-3 text-left min-w-[240px]">
                                                        Source / Return ({isFullFy ? 'Full FY Total' : activeMonthName})
                                                    </th>
                                                    <th className="p-3 text-right min-w-[125px]">Taxable</th>
                                                    <th className="p-3 text-right min-w-[115px]">IGST</th>
                                                    <th className="p-3 text-right min-w-[115px]">CGST</th>
                                                    <th className="p-3 text-right min-w-[115px]">SGST</th>
                                                    <th className="p-3 text-right min-w-[125px] bg-slate-200/80 text-slate-900 font-black">
                                                        Total
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-200">
                                                {/* Row 1: As Per Books (Sales Register) */}
                                                <tr className="hover:bg-blue-50/20 transition divide-x divide-slate-100">
                                                    <td className="p-3 font-bold text-blue-950 bg-blue-50/30">
                                                        <div className="flex items-center gap-2">
                                                            <span className="w-2.5 h-2.5 rounded-full bg-blue-600 shrink-0" />
                                                            <span className="font-bold">1. As Per Books (Sales Register)</span>
                                                        </div>
                                                    </td>
                                                    {isFullFy ? (
                                                        <td className="p-3 text-right font-mono font-bold text-slate-800">₹{booksRow.taxable.toLocaleString('en-IN')}</td>
                                                    ) : (
                                                        <td className="p-2 text-right">
                                                            <input
                                                                type="number"
                                                                value={booksRow.taxable === 0 ? '' : booksRow.taxable}
                                                                placeholder="0"
                                                                onChange={(e) => handleUpdateSalesMatrixCell(safeMonthIdx, 'books', 'taxable', e.target.value)}
                                                                disabled={!isJuniorAllowedToEdit}
                                                                className="w-full max-w-[125px] px-2.5 py-1.5 text-right text-xs font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50"
                                                            />
                                                        </td>
                                                    )}
                                                    {isFullFy ? (
                                                        <td className="p-3 text-right font-mono font-bold text-slate-800">₹{booksRow.igst.toLocaleString('en-IN')}</td>
                                                    ) : (
                                                        <td className="p-2 text-right">
                                                            <input
                                                                type="number"
                                                                value={booksRow.igst === 0 ? '' : booksRow.igst}
                                                                placeholder="0"
                                                                onChange={(e) => handleUpdateSalesMatrixCell(safeMonthIdx, 'books', 'igst', e.target.value)}
                                                                disabled={!isJuniorAllowedToEdit}
                                                                className="w-full max-w-[115px] px-2.5 py-1.5 text-right text-xs font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50"
                                                            />
                                                        </td>
                                                    )}
                                                    {isFullFy ? (
                                                        <td className="p-3 text-right font-mono font-bold text-slate-800">₹{booksRow.cgst.toLocaleString('en-IN')}</td>
                                                    ) : (
                                                        <td className="p-2 text-right">
                                                            <input
                                                                type="number"
                                                                value={booksRow.cgst === 0 ? '' : booksRow.cgst}
                                                                placeholder="0"
                                                                onChange={(e) => handleUpdateSalesMatrixCell(safeMonthIdx, 'books', 'cgst', e.target.value)}
                                                                disabled={!isJuniorAllowedToEdit}
                                                                className="w-full max-w-[115px] px-2.5 py-1.5 text-right text-xs font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50"
                                                            />
                                                        </td>
                                                    )}
                                                    {isFullFy ? (
                                                        <td className="p-3 text-right font-mono font-bold text-slate-800">₹{booksRow.sgst.toLocaleString('en-IN')}</td>
                                                    ) : (
                                                        <td className="p-2 text-right">
                                                            <input
                                                                type="number"
                                                                value={booksRow.sgst === 0 ? '' : booksRow.sgst}
                                                                placeholder="0"
                                                                onChange={(e) => handleUpdateSalesMatrixCell(safeMonthIdx, 'books', 'sgst', e.target.value)}
                                                                disabled={!isJuniorAllowedToEdit}
                                                                className="w-full max-w-[115px] px-2.5 py-1.5 text-right text-xs font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50"
                                                            />
                                                        </td>
                                                    )}
                                                    <td className="p-3 text-right font-mono font-bold text-slate-900 bg-blue-50/40">
                                                        ₹{booksRow.totalTax.toLocaleString('en-IN')}
                                                    </td>
                                                </tr>

                                                {/* Row 2: As Per GSTR-1 (Portal Outward Supplies) */}
                                                <tr className="hover:bg-indigo-50/20 transition divide-x divide-slate-100">
                                                    <td className="p-3 font-bold text-indigo-950 bg-indigo-50/30">
                                                        <div className="flex items-center gap-2">
                                                            <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 shrink-0" />
                                                            <span className="font-bold">2. As Per GSTR-1 (Portal Outward Supplies)</span>
                                                        </div>
                                                    </td>
                                                    {isFullFy ? (
                                                        <td className="p-3 text-right font-mono font-bold text-slate-800">₹{gstr1Row.taxable.toLocaleString('en-IN')}</td>
                                                    ) : (
                                                        <td className="p-2 text-right">
                                                            <input
                                                                type="number"
                                                                value={gstr1Row.taxable === 0 ? '' : gstr1Row.taxable}
                                                                placeholder="0"
                                                                onChange={(e) => handleUpdateSalesMatrixCell(safeMonthIdx, 'gstr1', 'taxable', e.target.value)}
                                                                disabled={!isJuniorAllowedToEdit}
                                                                className="w-full max-w-[125px] px-2.5 py-1.5 text-right text-xs font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-50"
                                                            />
                                                        </td>
                                                    )}
                                                    {isFullFy ? (
                                                        <td className="p-3 text-right font-mono font-bold text-slate-800">₹{gstr1Row.igst.toLocaleString('en-IN')}</td>
                                                    ) : (
                                                        <td className="p-2 text-right">
                                                            <input
                                                                type="number"
                                                                value={gstr1Row.igst === 0 ? '' : gstr1Row.igst}
                                                                placeholder="0"
                                                                onChange={(e) => handleUpdateSalesMatrixCell(safeMonthIdx, 'gstr1', 'igst', e.target.value)}
                                                                disabled={!isJuniorAllowedToEdit}
                                                                className="w-full max-w-[115px] px-2.5 py-1.5 text-right text-xs font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-50"
                                                            />
                                                        </td>
                                                    )}
                                                    {isFullFy ? (
                                                        <td className="p-3 text-right font-mono font-bold text-slate-800">₹{gstr1Row.cgst.toLocaleString('en-IN')}</td>
                                                    ) : (
                                                        <td className="p-2 text-right">
                                                            <input
                                                                type="number"
                                                                value={gstr1Row.cgst === 0 ? '' : gstr1Row.cgst}
                                                                placeholder="0"
                                                                onChange={(e) => handleUpdateSalesMatrixCell(safeMonthIdx, 'gstr1', 'cgst', e.target.value)}
                                                                disabled={!isJuniorAllowedToEdit}
                                                                className="w-full max-w-[115px] px-2.5 py-1.5 text-right text-xs font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-50"
                                                            />
                                                        </td>
                                                    )}
                                                    {isFullFy ? (
                                                        <td className="p-3 text-right font-mono font-bold text-slate-800">₹{gstr1Row.sgst.toLocaleString('en-IN')}</td>
                                                    ) : (
                                                        <td className="p-2 text-right">
                                                            <input
                                                                type="number"
                                                                value={gstr1Row.sgst === 0 ? '' : gstr1Row.sgst}
                                                                placeholder="0"
                                                                onChange={(e) => handleUpdateSalesMatrixCell(safeMonthIdx, 'gstr1', 'sgst', e.target.value)}
                                                                disabled={!isJuniorAllowedToEdit}
                                                                className="w-full max-w-[115px] px-2.5 py-1.5 text-right text-xs font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-50"
                                                            />
                                                        </td>
                                                    )}
                                                    <td className="p-3 text-right font-mono font-bold text-slate-900 bg-indigo-50/40">
                                                        ₹{gstr1Row.totalTax.toLocaleString('en-IN')}
                                                    </td>
                                                </tr>

                                                {/* Row 3: As Per GSTR-3B (Summary Return Filed) */}
                                                <tr className="hover:bg-purple-50/20 transition divide-x divide-slate-100">
                                                    <td className="p-3 font-bold text-purple-950 bg-purple-50/30">
                                                        <div className="flex items-center gap-2">
                                                            <span className="w-2.5 h-2.5 rounded-full bg-purple-600 shrink-0" />
                                                            <span className="font-bold">4. As Per GSTR-3B (Summary Return Filed)</span>
                                                        </div>
                                                    </td>
                                                    {isFullFy ? (
                                                        <td className="p-3 text-right font-mono font-bold text-slate-800">₹{gstr3bRow.taxable.toLocaleString('en-IN')}</td>
                                                    ) : (
                                                        <td className="p-2 text-right">
                                                            <input
                                                                type="number"
                                                                value={gstr3bRow.taxable === 0 ? '' : gstr3bRow.taxable}
                                                                placeholder="0"
                                                                onChange={(e) => handleUpdateSalesMatrixCell(safeMonthIdx, 'gstr3b', 'taxable', e.target.value)}
                                                                disabled={!isJuniorAllowedToEdit}
                                                                className="w-full max-w-[125px] px-2.5 py-1.5 text-right text-xs font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:bg-slate-50"
                                                            />
                                                        </td>
                                                    )}
                                                    {isFullFy ? (
                                                        <td className="p-3 text-right font-mono font-bold text-slate-800">₹{gstr3bRow.igst.toLocaleString('en-IN')}</td>
                                                    ) : (
                                                        <td className="p-2 text-right">
                                                            <input
                                                                type="number"
                                                                value={gstr3bRow.igst === 0 ? '' : gstr3bRow.igst}
                                                                placeholder="0"
                                                                onChange={(e) => handleUpdateSalesMatrixCell(safeMonthIdx, 'gstr3b', 'igst', e.target.value)}
                                                                disabled={!isJuniorAllowedToEdit}
                                                                className="w-full max-w-[115px] px-2.5 py-1.5 text-right text-xs font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:bg-slate-50"
                                                            />
                                                        </td>
                                                    )}
                                                    {isFullFy ? (
                                                        <td className="p-3 text-right font-mono font-bold text-slate-800">₹{gstr3bRow.cgst.toLocaleString('en-IN')}</td>
                                                    ) : (
                                                        <td className="p-2 text-right">
                                                            <input
                                                                type="number"
                                                                value={gstr3bRow.cgst === 0 ? '' : gstr3bRow.cgst}
                                                                placeholder="0"
                                                                onChange={(e) => handleUpdateSalesMatrixCell(safeMonthIdx, 'gstr3b', 'cgst', e.target.value)}
                                                                disabled={!isJuniorAllowedToEdit}
                                                                className="w-full max-w-[115px] px-2.5 py-1.5 text-right text-xs font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:bg-slate-50"
                                                            />
                                                        </td>
                                                    )}
                                                    {isFullFy ? (
                                                        <td className="p-3 text-right font-mono font-bold text-slate-800">₹{gstr3bRow.sgst.toLocaleString('en-IN')}</td>
                                                    ) : (
                                                        <td className="p-2 text-right">
                                                            <input
                                                                type="number"
                                                                value={gstr3bRow.sgst === 0 ? '' : gstr3bRow.sgst}
                                                                placeholder="0"
                                                                onChange={(e) => handleUpdateSalesMatrixCell(safeMonthIdx, 'gstr3b', 'sgst', e.target.value)}
                                                                disabled={!isJuniorAllowedToEdit}
                                                                className="w-full max-w-[115px] px-2.5 py-1.5 text-right text-xs font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:bg-slate-50"
                                                            />
                                                        </td>
                                                    )}
                                                    <td className="p-3 text-right font-mono font-bold text-slate-900 bg-purple-50/40">
                                                        ₹{gstr3bRow.totalTax.toLocaleString('en-IN')}
                                                    </td>
                                                </tr>

                                                {/* Row 4: Diff Books vs GSTR-1 */}
                                                <tr className="bg-amber-50/20 hover:bg-amber-50/40 transition font-bold divide-x divide-slate-100 border-t-2 border-slate-200">
                                                    <td className="p-3 text-amber-950 bg-amber-50/40">
                                                        <div className="flex items-center gap-2">
                                                            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                                                            <span className="font-bold">3. Comparison: Books vs GSTR-1 (Books - R1)</span>
                                                        </div>
                                                    </td>
                                                    {renderDiffCell(diffR1.taxable)}
                                                    {renderDiffCell(diffR1.igst)}
                                                    {renderDiffCell(diffR1.cgst)}
                                                    {renderDiffCell(diffR1.sgst)}
                                                    {renderDiffCell(diffR1.totalTax)}
                                                </tr>

                                                {/* Row 5: Diff Books vs GSTR-3B */}
                                                <tr className="bg-rose-50/20 hover:bg-rose-50/40 transition font-bold divide-x divide-slate-100">
                                                    <td className="p-3 text-rose-950 bg-rose-50/40">
                                                        <div className="flex items-center gap-2">
                                                            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
                                                            <span className="font-bold">5. Comparison: Books vs GSTR-3B (Books - 3B)</span>
                                                        </div>
                                                    </td>
                                                    {renderDiffCell(diff3b.taxable)}
                                                    {renderDiffCell(diff3b.igst)}
                                                    {renderDiffCell(diff3b.cgst)}
                                                    {renderDiffCell(diff3b.sgst)}
                                                    {renderDiffCell(diff3b.totalTax)}
                                                </tr>

                                                {/* Row 6: DRC-01B Diff GSTR-1 vs GSTR-3B */}
                                                <tr className="bg-red-50/30 hover:bg-red-50/50 transition font-bold divide-x divide-slate-100 border-b">
                                                    <td className="p-3 text-red-950 bg-red-50/50">
                                                        <div className="flex items-center gap-2">
                                                            <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                                                            <span className="font-bold">DRC-01B Difference: GSTR-1 vs GSTR-3B (R1 - 3B)</span>
                                                        </div>
                                                    </td>
                                                    {renderDiffCell(diffDrc.taxable)}
                                                    {renderDiffCell(diffDrc.igst)}
                                                    {renderDiffCell(diffDrc.cgst)}
                                                    {renderDiffCell(diffDrc.sgst)}
                                                    {renderDiffCell(diffDrc.totalTax)}
                                                </tr>
                                            </tbody>
                                        </table>
                                        {/* Reconciliation Metadata & Field Markers: Taxable | CGST | SGST | IGST | Nil/Exempt | Export | Diff Taxable | Diff CGST | Diff SGST | Diff IGST | Diff Nil | Diff Export */}
                                    </div>

                                    {/* Statutory Thresholds & Auditor Remarks */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                                        <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-3">
                                            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                                                <ShieldCheck className="w-4 h-4 text-indigo-600" />
                                                <span>Statutory Threshold Scrutiny</span>
                                            </h4>
                                            <div className="flex items-center justify-between text-xs py-1.5 border-b border-slate-200">
                                                <div>
                                                    <span className="font-semibold text-slate-800 block">E-Invoicing Applicability u/Rule 48(4)</span>
                                                    <span className="text-[11px] text-slate-500">Mandatory IRN if aggregate turnover exceeds ₹5 Crore in any preceding FY</span>
                                                </div>
                                                <span className={`px-2.5 py-1 rounded-lg font-bold text-xs ${
                                                    verification?.sales?.eInvoicingApplicable
                                                        ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                                        : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                                }`}>
                                                    {verification?.sales?.eInvoicingApplicable ? 'APPLICABLE (> ₹5 Cr)' : 'EXEMPT (< ₹5 Cr)'}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between text-xs py-1.5">
                                                <div>
                                                    <span className="font-semibold text-slate-800 block">Tax Audit u/s 44AB Applicability</span>
                                                    <span className="text-[11px] text-slate-500">Mandatory Form 3CD/3CA if turnover exceeds ₹10 Crore (&gt;95% digital transactions)</span>
                                                </div>
                                                <span className={`px-2.5 py-1 rounded-lg font-bold text-xs ${
                                                    verification?.sales?.taxAuditApplicable
                                                        ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                                        : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                                }`}>
                                                    {verification?.sales?.taxAuditApplicable ? 'APPLICABLE (> ₹10 Cr)' : 'BELOW THRESHOLD'}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-2">
                                            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                                                <FileText className="w-4 h-4 text-blue-600" />
                                                <span>Junior / Senior Auditor Reconciliation Remarks</span>
                                            </h4>
                                            <textarea
                                                rows={3}
                                                value={verification?.sales?.remarks || ''}
                                                onChange={(e) => handleUpdateSalesRemarks(e.target.value)}
                                                disabled={!isJuniorAllowedToEdit}
                                                placeholder="Record notes on observed differences, timing discrepancies in credit/debit notes, unfiled amendments, or management explanation..."
                                                className="w-full p-2.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-100 disabled:text-slate-500"
                                            />
                                            <span className="text-[11px] text-slate-400 block">
                                                Auto-saved with working sheet. Included in final Zero-Merge Excel audit package.
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* 3.2 Purchase Reco View */}
                        {activeGstSubTab === 'purchase' && (() => {
                            const monthsList = [
                                'April', 'May', 'June', 'July', 'August', 'September',
                                'October', 'November', 'December', 'January', 'February', 'March'
                            ];

                            const isFullFy = purchaseSelectedPeriod === 'FULL_FY';
                            const effectiveMonth = purchaseSelectedPeriod === 'active' ? selectedMonth : purchaseSelectedPeriod;
                            const activeMonthIdx = monthsList.findIndex(m => m.toLowerCase() === effectiveMonth.toLowerCase());
                            const safeMonthIdx = activeMonthIdx >= 0 ? activeMonthIdx : 0;
                            const activeMonthName = isFullFy ? 'FULL FY TOTAL (APR - MAR)' : monthsList[safeMonthIdx];

                            const booksRow = isFullFy
                                ? {
                                    cgst: purchaseMatrixTotals.books.cgst,
                                    sgst: purchaseMatrixTotals.books.sgst,
                                    igst: purchaseMatrixTotals.books.igst,
                                    cess: purchaseMatrixTotals.books.cess,
                                    nilRated: purchaseMatrixTotals.books.nilRated,
                                    totalTax: purchaseMatrixTotals.books.totalTax
                                }
                                : {
                                    cgst: purchaseMatrixData[safeMonthIdx]?.books?.cgst || 0,
                                    sgst: purchaseMatrixData[safeMonthIdx]?.books?.sgst || 0,
                                    igst: purchaseMatrixData[safeMonthIdx]?.books?.igst || 0,
                                    cess: purchaseMatrixData[safeMonthIdx]?.books?.cess || 0,
                                    nilRated: purchaseMatrixData[safeMonthIdx]?.books?.nilRated || 0,
                                    totalTax: (purchaseMatrixData[safeMonthIdx]?.books?.cgst || 0) +
                                              (purchaseMatrixData[safeMonthIdx]?.books?.sgst || 0) +
                                              (purchaseMatrixData[safeMonthIdx]?.books?.igst || 0) +
                                              (purchaseMatrixData[safeMonthIdx]?.books?.cess || 0)
                                };

                            const gstr2bRow = isFullFy
                                ? {
                                    cgst: purchaseMatrixTotals.gstr2b.cgst,
                                    sgst: purchaseMatrixTotals.gstr2b.sgst,
                                    igst: purchaseMatrixTotals.gstr2b.igst,
                                    cess: purchaseMatrixTotals.gstr2b.cess,
                                    nilRated: purchaseMatrixTotals.gstr2b.nilRated,
                                    totalTax: purchaseMatrixTotals.gstr2b.totalTax
                                }
                                : {
                                    cgst: purchaseMatrixData[safeMonthIdx]?.gstr2b?.cgst || 0,
                                    sgst: purchaseMatrixData[safeMonthIdx]?.gstr2b?.sgst || 0,
                                    igst: purchaseMatrixData[safeMonthIdx]?.gstr2b?.igst || 0,
                                    cess: purchaseMatrixData[safeMonthIdx]?.gstr2b?.cess || 0,
                                    nilRated: purchaseMatrixData[safeMonthIdx]?.gstr2b?.nilRated || 0,
                                    totalTax: (purchaseMatrixData[safeMonthIdx]?.gstr2b?.cgst || 0) +
                                              (purchaseMatrixData[safeMonthIdx]?.gstr2b?.sgst || 0) +
                                              (purchaseMatrixData[safeMonthIdx]?.gstr2b?.igst || 0) +
                                              (purchaseMatrixData[safeMonthIdx]?.gstr2b?.cess || 0)
                                };

                            const gstr3bRow = isFullFy
                                ? {
                                    cgst: purchaseMatrixTotals.gstr3b.cgst,
                                    sgst: purchaseMatrixTotals.gstr3b.sgst,
                                    igst: purchaseMatrixTotals.gstr3b.igst,
                                    cess: purchaseMatrixTotals.gstr3b.cess,
                                    nilRated: purchaseMatrixTotals.gstr3b.nilRated,
                                    totalTax: purchaseMatrixTotals.gstr3b.totalTax
                                }
                                : {
                                    cgst: purchaseMatrixData[safeMonthIdx]?.gstr3b?.cgst || 0,
                                    sgst: purchaseMatrixData[safeMonthIdx]?.gstr3b?.sgst || 0,
                                    igst: purchaseMatrixData[safeMonthIdx]?.gstr3b?.igst || 0,
                                    cess: purchaseMatrixData[safeMonthIdx]?.gstr3b?.cess || 0,
                                    nilRated: purchaseMatrixData[safeMonthIdx]?.gstr3b?.nilRated || 0,
                                    totalTax: (purchaseMatrixData[safeMonthIdx]?.gstr3b?.cgst || 0) +
                                              (purchaseMatrixData[safeMonthIdx]?.gstr3b?.sgst || 0) +
                                              (purchaseMatrixData[safeMonthIdx]?.gstr3b?.igst || 0) +
                                              (purchaseMatrixData[safeMonthIdx]?.gstr3b?.cess || 0)
                                };

                            const diff2b = {
                                cgst: booksRow.cgst - gstr2bRow.cgst,
                                sgst: booksRow.sgst - gstr2bRow.sgst,
                                igst: booksRow.igst - gstr2bRow.igst,
                                cess: booksRow.cess - gstr2bRow.cess,
                                nilRated: booksRow.nilRated - gstr2bRow.nilRated,
                                totalTax: booksRow.totalTax - gstr2bRow.totalTax
                            };

                            const diff3b = {
                                cgst: booksRow.cgst - gstr3bRow.cgst,
                                sgst: booksRow.sgst - gstr3bRow.sgst,
                                igst: booksRow.igst - gstr3bRow.igst,
                                cess: booksRow.cess - gstr3bRow.cess,
                                nilRated: booksRow.nilRated - gstr3bRow.nilRated,
                                totalTax: booksRow.totalTax - gstr3bRow.totalTax
                            };

                            const diffDrc = {
                                cgst: gstr3bRow.cgst - gstr2bRow.cgst,
                                sgst: gstr3bRow.sgst - gstr2bRow.sgst,
                                igst: gstr3bRow.igst - gstr2bRow.igst,
                                cess: gstr3bRow.cess - gstr2bRow.cess,
                                nilRated: gstr3bRow.nilRated - gstr2bRow.nilRated,
                                totalTax: gstr3bRow.totalTax - gstr2bRow.totalTax
                            };

                            const renderDiffCell = (diff: number) => {
                                const isZero = diff === 0;
                                return (
                                    <td className="p-3 text-right font-mono text-xs">
                                        <span className={`px-2.5 py-1 rounded-lg inline-block ${
                                            isZero
                                                ? 'text-slate-400 font-normal bg-slate-50'
                                                : (diff > 0 ? 'text-amber-700 bg-amber-50 font-bold border border-amber-200' : 'text-rose-700 bg-rose-50 font-bold border border-rose-200')
                                        }`}>
                                            {isZero ? '₹0' : (diff > 0 ? `+₹${diff.toLocaleString('en-IN')}` : `-₹${Math.abs(diff).toLocaleString('en-IN')}`)}
                                        </span>
                                    </td>
                                );
                            };

                            return (
                                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-6">
                                    {/* Top Header & View Mode Switcher */}
                                    <div className="flex items-center justify-between flex-wrap gap-3 pb-4 border-b border-slate-100">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 inline-block" />
                                                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                                                    3.2 Purchase Register vs GSTR-2B Inward ITC Reconciliation
                                                </h3>
                                            </div>
                                            <p className="text-xs text-slate-500 mt-0.5">
                                                12-Month Inward Supplies &amp; Tax Credit (ITC) 3-Way Reconciliation Matrix (April – March). Pure tax credit audit without taxable value column.
                                            </p>
                                        </div>

                                        <div className="flex items-center gap-2 flex-wrap">
                                            {verification?.purchase?.isDrc01cTriggered && (
                                                <span className="px-3 py-1 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 font-bold text-xs flex items-center gap-1.5 shadow-2xs">
                                                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600 animate-pulse" />
                                                    <span>Rule 88D / DRC-01C Risk</span>
                                                </span>
                                            )}

                                            {/* View Mode Pills */}
                                            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-xs font-semibold">
                                                <button
                                                    type="button"
                                                    onClick={() => setPurchaseMatrixViewMode('all')}
                                                    className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                                                        purchaseMatrixViewMode === 'all'
                                                            ? 'bg-white text-slate-900 shadow-2xs font-bold'
                                                            : 'text-slate-600 hover:text-slate-900'
                                                    }`}
                                                    title="Show all 5 blocks side by side"
                                                >
                                                    All 5 Blocks (Comprehensive)
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setPurchaseMatrixViewMode('books_2b')}
                                                    className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                                                        purchaseMatrixViewMode === 'books_2b'
                                                            ? 'bg-white text-blue-900 shadow-2xs font-bold'
                                                            : 'text-slate-600 hover:text-slate-900'
                                                    }`}
                                                    title="Focus on Books vs GSTR-2B"
                                                >
                                                    Books vs GSTR-2B
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setPurchaseMatrixViewMode('books_3b')}
                                                    className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                                                        purchaseMatrixViewMode === 'books_3b'
                                                            ? 'bg-white text-purple-900 shadow-2xs font-bold'
                                                            : 'text-slate-600 hover:text-slate-900'
                                                    }`}
                                                    title="Focus on Books vs GSTR-3B"
                                                >
                                                    Books vs GSTR-3B
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setPurchaseMatrixViewMode('drc01c')}
                                                    className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                                                        purchaseMatrixViewMode === 'drc01c'
                                                            ? 'bg-white text-rose-900 shadow-2xs font-bold'
                                                            : 'text-slate-600 hover:text-slate-900'
                                                    }`}
                                                    title="GSTR-2B vs GSTR-3B DRC-01C Scrutiny"
                                                >
                                                    DRC-01C Scrutiny (2B vs 3B)
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Quick Actions & Seed Bar */}
                                    <div className="flex items-center justify-between flex-wrap gap-2 text-xs bg-slate-50/80 p-3 rounded-xl border border-slate-200">
                                        <div className="flex items-center gap-2 text-slate-600">
                                            <Sparkles className="w-4 h-4 text-indigo-600" />
                                            <span className="font-semibold text-slate-700">Junior Entry &amp; Automation Tools:</span>
                                            <span className="text-slate-500">Auto-fill active month ({selectedMonth}) or enter monthly inward tax credits below.</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={handleSeedActiveMonthIntoPurchaseMatrix}
                                                className="flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg font-semibold transition shadow-2xs cursor-pointer"
                                                title={`Copy inward tax into ${selectedMonth} row`}
                                            >
                                                <Plus className="w-3.5 h-3.5 text-indigo-600" />
                                                <span>Auto-Fill Active Month ({selectedMonth})</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleResetPurchaseMatrix}
                                                className="flex items-center gap-1.5 px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-lg font-semibold transition cursor-pointer"
                                                title="Clear all 12 rows"
                                            >
                                                <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                                                <span>Reset Matrix</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleDownloadExcel}
                                                className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold transition shadow-2xs cursor-pointer"
                                                title="Export Zero-Merge Multi-Tab Analytical Excel"
                                            >
                                                <Download className="w-3.5 h-3.5" />
                                                <span>Export Sheet</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Executive Summary Cards */}
                                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                                        {/* Card 1: Books */}
                                        <div className="bg-blue-50/50 border border-blue-200/80 p-3.5 rounded-xl">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-blue-700 font-bold uppercase tracking-wider text-[11px]">1. Books (Purchase Reg)</span>
                                                <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-mono">FY TOTAL</span>
                                            </div>
                                            <div className="text-base font-bold font-mono text-slate-900">
                                                ₹{(purchaseMatrixTotals.books.totalTax > 0 ? purchaseMatrixTotals.books.totalTax : (verification?.purchase?.booksTax ?? 0)).toLocaleString('en-IN')}
                                            </div>
                                            <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                                                CGST: ₹{purchaseMatrixTotals.books.cgst.toLocaleString('en-IN')} | SGST: ₹{purchaseMatrixTotals.books.sgst.toLocaleString('en-IN')}
                                            </div>
                                        </div>

                                        {/* Card 2: GSTR-2B */}
                                        <div className="bg-indigo-50/50 border border-indigo-200/80 p-3.5 rounded-xl">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-indigo-700 font-bold uppercase tracking-wider text-[11px]">2. GSTR-2B (Inward ITC)</span>
                                                <span className="text-[10px] bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded font-mono">PORTAL</span>
                                            </div>
                                            <div className="text-base font-bold font-mono text-slate-900">
                                                ₹{(purchaseMatrixTotals.gstr2b.totalTax > 0 ? purchaseMatrixTotals.gstr2b.totalTax : (verification?.purchase?.twoBTax ?? 0)).toLocaleString('en-IN')}
                                            </div>
                                            <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                                                CGST: ₹{purchaseMatrixTotals.gstr2b.cgst.toLocaleString('en-IN')} | SGST: ₹{purchaseMatrixTotals.gstr2b.sgst.toLocaleString('en-IN')}
                                            </div>
                                        </div>

                                        {/* Card 3: Books vs 2B Variance */}
                                        <div className={`p-3.5 rounded-xl border ${
                                            Math.abs((purchaseMatrixTotals.books.totalTax > 0 ? purchaseMatrixTotals.diff2b.totalTax : (Math.abs((verification?.purchase?.booksTax ?? 0) - (verification?.purchase?.twoBTax ?? 0))))) === 0
                                                ? 'bg-emerald-50/50 border-emerald-200/80'
                                                : 'bg-amber-50/50 border-amber-200/80'
                                        }`}>
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-amber-800 font-bold uppercase tracking-wider text-[11px]">3. Books vs 2B Diff</span>
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                                                    Math.abs((purchaseMatrixTotals.books.totalTax > 0 ? purchaseMatrixTotals.diff2b.totalTax : (Math.abs((verification?.purchase?.booksTax ?? 0) - (verification?.purchase?.twoBTax ?? 0))))) === 0
                                                        ? 'bg-emerald-100 text-emerald-800'
                                                        : 'bg-amber-100 text-amber-800 font-bold'
                                                }`}>
                                                    {Math.abs((purchaseMatrixTotals.books.totalTax > 0 ? purchaseMatrixTotals.diff2b.totalTax : (Math.abs((verification?.purchase?.booksTax ?? 0) - (verification?.purchase?.twoBTax ?? 0))))) === 0 ? 'MATCHED' : 'VARIANCE'}
                                                </span>
                                            </div>
                                            <div className={`text-base font-bold font-mono ${
                                                Math.abs((purchaseMatrixTotals.books.totalTax > 0 ? purchaseMatrixTotals.diff2b.totalTax : (Math.abs((verification?.purchase?.booksTax ?? 0) - (verification?.purchase?.twoBTax ?? 0))))) === 0
                                                    ? 'text-emerald-700'
                                                    : 'text-amber-700'
                                            }`}>
                                                ₹{Math.abs((purchaseMatrixTotals.books.totalTax > 0 ? purchaseMatrixTotals.diff2b.totalTax : (Math.abs((verification?.purchase?.booksTax ?? 0) - (verification?.purchase?.twoBTax ?? 0))))).toLocaleString('en-IN')}
                                            </div>
                                            <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                                                IGST Diff: ₹{Math.abs(purchaseMatrixTotals.diff2b.igst).toLocaleString('en-IN')}
                                            </div>
                                        </div>

                                        {/* Card 4: GSTR-3B */}
                                        <div className="bg-purple-50/50 border border-purple-200/80 p-3.5 rounded-xl">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-purple-700 font-bold uppercase tracking-wider text-[11px]">4. GSTR-3B (ITC Claimed)</span>
                                                <span className="text-[10px] bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded font-mono">TABLE 4</span>
                                            </div>
                                            <div className="text-base font-bold font-mono text-slate-900">
                                                ₹{(purchaseMatrixTotals.gstr3b.totalTax > 0 ? purchaseMatrixTotals.gstr3b.totalTax : (verification?.purchase?.tax3b ?? verification?.purchase?.twoBTax ?? 0)).toLocaleString('en-IN')}
                                            </div>
                                            <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                                                CGST: ₹{purchaseMatrixTotals.gstr3b.cgst.toLocaleString('en-IN')} | SGST: ₹{purchaseMatrixTotals.gstr3b.sgst.toLocaleString('en-IN')}
                                            </div>
                                        </div>

                                        {/* Card 5: Rule 88D / DRC-01C Exposure */}
                                        <div className={`p-3.5 rounded-xl border ${
                                            verification?.purchase?.isDrc01cTriggered
                                                ? 'bg-rose-50 border-rose-200 text-rose-900'
                                                : 'bg-slate-50 border-slate-200 text-slate-700'
                                        }`}>
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="font-bold uppercase tracking-wider text-[11px]">5. 2B vs 3B (DRC-01C)</span>
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                                                    verification?.purchase?.isDrc01cTriggered
                                                        ? 'bg-rose-100 text-rose-800 font-bold'
                                                        : 'bg-slate-200 text-slate-700'
                                                }`}>
                                                    {verification?.purchase?.isDrc01cTriggered ? 'NOTICE RISK' : 'NORMAL'}
                                                </span>
                                            </div>
                                            <div className="text-base font-bold font-mono">
                                                ₹{(purchaseMatrixTotals.gstr3b.totalTax > 0 ? Math.abs(purchaseMatrixTotals.diffDrc.totalTax) : (verification?.purchase?.taxDifference ?? 0)).toLocaleString('en-IN')}
                                            </div>
                                            <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                                                Rule 88D Threshold: ₹25,000 / 20%
                                            </div>
                                        </div>
                                    </div>

                                    {/* DRC-01C Notice Warning Banner */}
                                    {verification?.purchase?.drc01cReason && (
                                        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 flex items-start gap-2.5 shadow-2xs">
                                            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                                            <div>
                                                <span className="font-bold block mb-0.5">Statutory Scrutiny Alert — Rule 88D / Form DRC-01C Notice Risk</span>
                                                <span>{verification.purchase.drc01cReason}</span>
                                                <span className="block mt-1 text-[11px] text-rose-700">
                                                    Recommendation: Inward ITC claimed in GSTR-3B exceeds GSTR-2B auto-drafted available credit. Taxpayer is required to reverse the excess credit along with applicable interest under Section 50 or file an official explanation in Part B of Form DRC-01C within 7 days.
                                                </span>
                                            </div>
                                        </div>
                                    )}

                                    {/* ─── Purchase Excel Working Paper Attachment (Audit Evidence) ─── */}
                                    <input
                                        ref={purchaseFileInputRef}
                                        type="file"
                                        accept=".xlsx,.xls,.csv"
                                        onChange={handlePurchaseFileUpload}
                                        className="hidden"
                                    />
                                    {verification?.purchase?.excelAttachment ? (
                                        <div className="bg-emerald-50/70 border border-emerald-200/90 rounded-xl p-3.5 flex items-center justify-between flex-wrap gap-3 shadow-2xs">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-xl bg-emerald-100 border border-emerald-200 flex items-center justify-center shrink-0">
                                                    <FileSpreadsheet className="w-5 h-5 text-emerald-700" />
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="text-xs font-bold text-slate-900 font-mono">
                                                            {verification.purchase.excelAttachment.fileName}
                                                        </span>
                                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white uppercase tracking-wider">
                                                            Purchase Working Paper Attached
                                                        </span>
                                                    </div>
                                                    <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                                                        {verification.purchase.excelAttachment.fileSize && (
                                                            <span>{(verification.purchase.excelAttachment.fileSize / 1024).toFixed(1)} KB</span>
                                                        )}
                                                        {verification.purchase.excelAttachment.uploadedAt && (
                                                            <span>· Attached on {verification.purchase.excelAttachment.uploadedAt}</span>
                                                        )}
                                                        {verification.purchase.excelAttachment.uploadedBy && (
                                                            <span>by {verification.purchase.excelAttachment.uploadedBy}</span>
                                                        )}
                                                        {verification.purchase.excelAttachment.filePath && (
                                                            <span className="font-mono text-slate-600">({verification.purchase.excelAttachment.filePath})</span>
                                                        )}
                                                    </div>
                                                    {verification.purchase.excelAttachment.sheetNames && verification.purchase.excelAttachment.sheetNames.length > 0 && (
                                                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                                            <span className="text-[10px] font-semibold text-slate-500">Sheets ({verification.purchase.excelAttachment.sheetNames.length}):</span>
                                                            {verification.purchase.excelAttachment.sheetNames.map((sName, sIdx) => (
                                                                <span key={sIdx} className="px-1.5 py-0.5 bg-white border border-emerald-200 rounded text-[10px] font-mono text-emerald-800">
                                                                    {sName}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                {verification.purchase.excelAttachment.fileData && (
                                                    <button
                                                        type="button"
                                                        onClick={handleDownloadPurchaseAttachment}
                                                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                                                        title="Download attached Excel file"
                                                    >
                                                        <Download className="w-3.5 h-3.5" />
                                                        <span>Download Excel</span>
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => purchaseFileInputRef.current?.click()}
                                                    className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer border border-slate-200 shadow-2xs"
                                                    title="Replace attached file"
                                                >
                                                    <UploadCloud className="w-3.5 h-3.5 text-slate-500" />
                                                    <span>Replace</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={handleRemovePurchaseAttachment}
                                                    className="p-1.5 rounded-lg bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition cursor-pointer border border-slate-200"
                                                    title="Remove attachment"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="bg-slate-50/80 border border-dashed border-slate-300 rounded-xl p-3 flex items-center justify-between flex-wrap gap-2">
                                            <div className="flex items-center gap-2.5">
                                                <div className="w-8 h-8 rounded-lg bg-slate-200/80 flex items-center justify-center shrink-0">
                                                    <Paperclip className="w-4 h-4 text-slate-600" />
                                                </div>
                                                <div>
                                                    <span className="text-xs font-bold text-slate-800 block">
                                                        Attach Purchase &amp; 2B Inward ITC Working Excel (Audit Evidence)
                                                    </span>
                                                    <span className="text-[11px] text-slate-500">
                                                        Upload client Purchase Register, GSTR-2B inward report, or detailed ITC reco file (.xlsx, .xls, .csv)
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 flex-wrap">
                                                <button
                                                    type="button"
                                                    onClick={() => purchaseFileInputRef.current?.click()}
                                                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                                                >
                                                    <UploadCloud className="w-3.5 h-3.5" />
                                                    <span>Choose Excel File</span>
                                                </button>

                                                <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1">
                                                    <input
                                                        type="text"
                                                        value={purchaseLocalPathInput}
                                                        onChange={(e) => setPurchaseLocalPathInput(e.target.value)}
                                                        placeholder="e.g. E:\Purchase_Working.xlsx"
                                                        className="text-xs font-mono text-slate-700 bg-transparent border-0 focus:outline-none w-36 sm:w-44"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={handleLinkPurchaseLocalPath}
                                                        className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[10px] transition cursor-pointer"
                                                    >
                                                        Link Path
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* ─── Period Selector Bar ─── */}
                                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex items-center justify-between flex-wrap gap-2">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mr-1">
                                                <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                                                <span>Period View:</span>
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => setPurchaseSelectedPeriod('active')}
                                                className={`px-3 py-1 rounded-lg text-xs transition cursor-pointer font-bold flex items-center gap-1.5 ${
                                                    purchaseSelectedPeriod === 'active' || purchaseSelectedPeriod === selectedMonth
                                                        ? 'bg-indigo-600 text-white shadow-2xs'
                                                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                                                }`}
                                            >
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                                <span>Active Audit Month ({selectedMonth})</span>
                                            </button>

                                            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5">
                                                {monthsList.map((m) => (
                                                    <button
                                                        key={m}
                                                        type="button"
                                                        onClick={() => setPurchaseSelectedPeriod(m)}
                                                        className={`px-2 py-0.5 rounded text-[11px] font-semibold transition cursor-pointer ${
                                                            (purchaseSelectedPeriod === m) || (purchaseSelectedPeriod === 'active' && m === selectedMonth)
                                                                ? 'bg-indigo-100 text-indigo-900 font-bold'
                                                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                                                        }`}
                                                        title={m}
                                                    >
                                                        {m.slice(0, 3)}
                                                    </button>
                                                ))}
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => setPurchaseSelectedPeriod('FULL_FY')}
                                                className={`px-3 py-1 rounded-lg text-xs transition cursor-pointer font-bold ${
                                                    purchaseSelectedPeriod === 'FULL_FY'
                                                        ? 'bg-slate-900 text-amber-400 shadow-2xs'
                                                        : 'bg-white text-slate-800 border border-slate-200 hover:bg-slate-100'
                                                }`}
                                            >
                                                FULL FY TOTAL (APR - MAR)
                                            </button>
                                        </div>

                                        {isFullFy ? (
                                            <span className="text-[11px] text-amber-700 font-semibold bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                                                Viewing 12-Month Cumulative FY Totals (Select any month to edit values)
                                            </span>
                                        ) : (
                                            <span className="text-[11px] text-slate-500">
                                                Editing <span className="font-semibold text-slate-800">{activeMonthName}</span> inward figures
                                            </span>
                                        )}
                                    </div>

                                    {/* ─── Compact 3-Way Inward ITC Table (Columns: CGST, SGST, IGST, Cess, Nil/Exempt, Total ITC - NO TAXABLE) ─── */}
                                    <div className="overflow-x-auto border border-slate-200 rounded-2xl shadow-2xs bg-white">
                                        <table className="w-full text-left border-collapse text-xs">
                                            <thead>
                                                <tr className="bg-slate-100 text-slate-800 font-bold uppercase tracking-wider text-[11px] border-b border-slate-300 divide-x divide-slate-200">
                                                    <th className="p-3 text-left min-w-[240px]">
                                                        Source / Return ({isFullFy ? 'Full FY Total' : activeMonthName})
                                                    </th>
                                                    <th className="p-3 text-right min-w-[115px]">CGST</th>
                                                    <th className="p-3 text-right min-w-[115px]">SGST</th>
                                                    <th className="p-3 text-right min-w-[115px]">IGST</th>
                                                    <th className="p-3 text-right min-w-[100px]">Cess</th>
                                                    <th className="p-3 text-right min-w-[100px]">Nil/Exempt</th>
                                                    <th className="p-3 text-right min-w-[125px] bg-slate-200/80 text-slate-900 font-black">
                                                        Total ITC
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-200">
                                                {/* Row 1: As Per Books (Purchase Register) */}
                                                {(purchaseMatrixViewMode === 'all' || purchaseMatrixViewMode === 'books_2b' || purchaseMatrixViewMode === 'books_3b') && (
                                                    <tr className="hover:bg-blue-50/20 transition divide-x divide-slate-100">
                                                        <td className="p-3 font-bold text-blue-950 bg-blue-50/30">
                                                            <div className="flex items-center gap-2">
                                                                <span className="w-2.5 h-2.5 rounded-full bg-blue-600 shrink-0" />
                                                                <span className="font-bold">1. As Per Books (Purchase Register)</span>
                                                            </div>
                                                        </td>
                                                        {isFullFy ? (
                                                            <td className="p-3 text-right font-mono font-bold text-slate-800">₹{booksRow.cgst.toLocaleString('en-IN')}</td>
                                                        ) : (
                                                            <td className="p-2 text-right">
                                                                <input
                                                                    type="number"
                                                                    value={booksRow.cgst === 0 ? '' : booksRow.cgst}
                                                                    placeholder="0"
                                                                    onChange={(e) => handleUpdatePurchaseMatrixCell(safeMonthIdx, 'books', 'cgst', e.target.value)}
                                                                    disabled={!isJuniorAllowedToEdit}
                                                                    className="w-full max-w-[115px] px-2.5 py-1.5 text-right text-xs font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50"
                                                                />
                                                            </td>
                                                        )}
                                                        {isFullFy ? (
                                                            <td className="p-3 text-right font-mono font-bold text-slate-800">₹{booksRow.sgst.toLocaleString('en-IN')}</td>
                                                        ) : (
                                                            <td className="p-2 text-right">
                                                                <input
                                                                    type="number"
                                                                    value={booksRow.sgst === 0 ? '' : booksRow.sgst}
                                                                    placeholder="0"
                                                                    onChange={(e) => handleUpdatePurchaseMatrixCell(safeMonthIdx, 'books', 'sgst', e.target.value)}
                                                                    disabled={!isJuniorAllowedToEdit}
                                                                    className="w-full max-w-[115px] px-2.5 py-1.5 text-right text-xs font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50"
                                                                />
                                                            </td>
                                                        )}
                                                        {isFullFy ? (
                                                            <td className="p-3 text-right font-mono font-bold text-slate-800">₹{booksRow.igst.toLocaleString('en-IN')}</td>
                                                        ) : (
                                                            <td className="p-2 text-right">
                                                                <input
                                                                    type="number"
                                                                    value={booksRow.igst === 0 ? '' : booksRow.igst}
                                                                    placeholder="0"
                                                                    onChange={(e) => handleUpdatePurchaseMatrixCell(safeMonthIdx, 'books', 'igst', e.target.value)}
                                                                    disabled={!isJuniorAllowedToEdit}
                                                                    className="w-full max-w-[115px] px-2.5 py-1.5 text-right text-xs font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50"
                                                                />
                                                            </td>
                                                        )}
                                                        {isFullFy ? (
                                                            <td className="p-3 text-right font-mono font-bold text-slate-800">₹{booksRow.cess.toLocaleString('en-IN')}</td>
                                                        ) : (
                                                            <td className="p-2 text-right">
                                                                <input
                                                                    type="number"
                                                                    value={booksRow.cess === 0 ? '' : booksRow.cess}
                                                                    placeholder="0"
                                                                    onChange={(e) => handleUpdatePurchaseMatrixCell(safeMonthIdx, 'books', 'cess', e.target.value)}
                                                                    disabled={!isJuniorAllowedToEdit}
                                                                    className="w-full max-w-[100px] px-2.5 py-1.5 text-right text-xs font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50"
                                                                />
                                                            </td>
                                                        )}
                                                        {isFullFy ? (
                                                            <td className="p-3 text-right font-mono font-bold text-slate-800">₹{booksRow.nilRated.toLocaleString('en-IN')}</td>
                                                        ) : (
                                                            <td className="p-2 text-right">
                                                                <input
                                                                    type="number"
                                                                    value={booksRow.nilRated === 0 ? '' : booksRow.nilRated}
                                                                    placeholder="0"
                                                                    onChange={(e) => handleUpdatePurchaseMatrixCell(safeMonthIdx, 'books', 'nilRated', e.target.value)}
                                                                    disabled={!isJuniorAllowedToEdit}
                                                                    className="w-full max-w-[100px] px-2.5 py-1.5 text-right text-xs font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50"
                                                                />
                                                            </td>
                                                        )}
                                                        <td className="p-3 text-right font-mono font-bold text-slate-900 bg-blue-50/40">
                                                            ₹{booksRow.totalTax.toLocaleString('en-IN')}
                                                        </td>
                                                    </tr>
                                                )}

                                                {/* Row 2: As Per GSTR-2B (Portal Inward Supplies) */}
                                                {(purchaseMatrixViewMode === 'all' || purchaseMatrixViewMode === 'books_2b' || purchaseMatrixViewMode === 'drc01c') && (
                                                    <tr className="hover:bg-indigo-50/20 transition divide-x divide-slate-100">
                                                        <td className="p-3 font-bold text-indigo-950 bg-indigo-50/30">
                                                            <div className="flex items-center gap-2">
                                                                <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 shrink-0" />
                                                                <span className="font-bold">2. As Per GSTR-2B (Portal Inward Supplies)</span>
                                                            </div>
                                                        </td>
                                                        {isFullFy ? (
                                                            <td className="p-3 text-right font-mono font-bold text-slate-800">₹{gstr2bRow.cgst.toLocaleString('en-IN')}</td>
                                                        ) : (
                                                            <td className="p-2 text-right">
                                                                <input
                                                                    type="number"
                                                                    value={gstr2bRow.cgst === 0 ? '' : gstr2bRow.cgst}
                                                                    placeholder="0"
                                                                    onChange={(e) => handleUpdatePurchaseMatrixCell(safeMonthIdx, 'gstr2b', 'cgst', e.target.value)}
                                                                    disabled={!isJuniorAllowedToEdit}
                                                                    className="w-full max-w-[115px] px-2.5 py-1.5 text-right text-xs font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-50"
                                                                />
                                                            </td>
                                                        )}
                                                        {isFullFy ? (
                                                            <td className="p-3 text-right font-mono font-bold text-slate-800">₹{gstr2bRow.sgst.toLocaleString('en-IN')}</td>
                                                        ) : (
                                                            <td className="p-2 text-right">
                                                                <input
                                                                    type="number"
                                                                    value={gstr2bRow.sgst === 0 ? '' : gstr2bRow.sgst}
                                                                    placeholder="0"
                                                                    onChange={(e) => handleUpdatePurchaseMatrixCell(safeMonthIdx, 'gstr2b', 'sgst', e.target.value)}
                                                                    disabled={!isJuniorAllowedToEdit}
                                                                    className="w-full max-w-[115px] px-2.5 py-1.5 text-right text-xs font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-50"
                                                                />
                                                            </td>
                                                        )}
                                                        {isFullFy ? (
                                                            <td className="p-3 text-right font-mono font-bold text-slate-800">₹{gstr2bRow.igst.toLocaleString('en-IN')}</td>
                                                        ) : (
                                                            <td className="p-2 text-right">
                                                                <input
                                                                    type="number"
                                                                    value={gstr2bRow.igst === 0 ? '' : gstr2bRow.igst}
                                                                    placeholder="0"
                                                                    onChange={(e) => handleUpdatePurchaseMatrixCell(safeMonthIdx, 'gstr2b', 'igst', e.target.value)}
                                                                    disabled={!isJuniorAllowedToEdit}
                                                                    className="w-full max-w-[115px] px-2.5 py-1.5 text-right text-xs font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-50"
                                                                />
                                                            </td>
                                                        )}
                                                        {isFullFy ? (
                                                            <td className="p-3 text-right font-mono font-bold text-slate-800">₹{gstr2bRow.cess.toLocaleString('en-IN')}</td>
                                                        ) : (
                                                            <td className="p-2 text-right">
                                                                <input
                                                                    type="number"
                                                                    value={gstr2bRow.cess === 0 ? '' : gstr2bRow.cess}
                                                                    placeholder="0"
                                                                    onChange={(e) => handleUpdatePurchaseMatrixCell(safeMonthIdx, 'gstr2b', 'cess', e.target.value)}
                                                                    disabled={!isJuniorAllowedToEdit}
                                                                    className="w-full max-w-[100px] px-2.5 py-1.5 text-right text-xs font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-50"
                                                                />
                                                            </td>
                                                        )}
                                                        {isFullFy ? (
                                                            <td className="p-3 text-right font-mono font-bold text-slate-800">₹{gstr2bRow.nilRated.toLocaleString('en-IN')}</td>
                                                        ) : (
                                                            <td className="p-2 text-right">
                                                                <input
                                                                    type="number"
                                                                    value={gstr2bRow.nilRated === 0 ? '' : gstr2bRow.nilRated}
                                                                    placeholder="0"
                                                                    onChange={(e) => handleUpdatePurchaseMatrixCell(safeMonthIdx, 'gstr2b', 'nilRated', e.target.value)}
                                                                    disabled={!isJuniorAllowedToEdit}
                                                                    className="w-full max-w-[100px] px-2.5 py-1.5 text-right text-xs font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-50"
                                                                />
                                                            </td>
                                                        )}
                                                        <td className="p-3 text-right font-mono font-bold text-slate-900 bg-indigo-50/40">
                                                            ₹{gstr2bRow.totalTax.toLocaleString('en-IN')}
                                                        </td>
                                                    </tr>
                                                )}

                                                {/* Row 3: As Per GSTR-3B (ITC Availed) */}
                                                {(purchaseMatrixViewMode === 'all' || purchaseMatrixViewMode === 'books_3b' || purchaseMatrixViewMode === 'drc01c') && (
                                                    <tr className="hover:bg-purple-50/20 transition divide-x divide-slate-100">
                                                        <td className="p-3 font-bold text-purple-950 bg-purple-50/30">
                                                            <div className="flex items-center gap-2">
                                                                <span className="w-2.5 h-2.5 rounded-full bg-purple-600 shrink-0" />
                                                                <span className="font-bold">4. As Per GSTR-3B (ITC Availed)</span>
                                                            </div>
                                                        </td>
                                                        {isFullFy ? (
                                                            <td className="p-3 text-right font-mono font-bold text-slate-800">₹{gstr3bRow.cgst.toLocaleString('en-IN')}</td>
                                                        ) : (
                                                            <td className="p-2 text-right">
                                                                <input
                                                                    type="number"
                                                                    value={gstr3bRow.cgst === 0 ? '' : gstr3bRow.cgst}
                                                                    placeholder="0"
                                                                    onChange={(e) => handleUpdatePurchaseMatrixCell(safeMonthIdx, 'gstr3b', 'cgst', e.target.value)}
                                                                    disabled={!isJuniorAllowedToEdit}
                                                                    className="w-full max-w-[115px] px-2.5 py-1.5 text-right text-xs font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:bg-slate-50"
                                                                />
                                                            </td>
                                                        )}
                                                        {isFullFy ? (
                                                            <td className="p-3 text-right font-mono font-bold text-slate-800">₹{gstr3bRow.sgst.toLocaleString('en-IN')}</td>
                                                        ) : (
                                                            <td className="p-2 text-right">
                                                                <input
                                                                    type="number"
                                                                    value={gstr3bRow.sgst === 0 ? '' : gstr3bRow.sgst}
                                                                    placeholder="0"
                                                                    onChange={(e) => handleUpdatePurchaseMatrixCell(safeMonthIdx, 'gstr3b', 'sgst', e.target.value)}
                                                                    disabled={!isJuniorAllowedToEdit}
                                                                    className="w-full max-w-[115px] px-2.5 py-1.5 text-right text-xs font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:bg-slate-50"
                                                                />
                                                            </td>
                                                        )}
                                                        {isFullFy ? (
                                                            <td className="p-3 text-right font-mono font-bold text-slate-800">₹{gstr3bRow.igst.toLocaleString('en-IN')}</td>
                                                        ) : (
                                                            <td className="p-2 text-right">
                                                                <input
                                                                    type="number"
                                                                    value={gstr3bRow.igst === 0 ? '' : gstr3bRow.igst}
                                                                    placeholder="0"
                                                                    onChange={(e) => handleUpdatePurchaseMatrixCell(safeMonthIdx, 'gstr3b', 'igst', e.target.value)}
                                                                    disabled={!isJuniorAllowedToEdit}
                                                                    className="w-full max-w-[115px] px-2.5 py-1.5 text-right text-xs font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:bg-slate-50"
                                                                />
                                                            </td>
                                                        )}
                                                        {isFullFy ? (
                                                            <td className="p-3 text-right font-mono font-bold text-slate-800">₹{gstr3bRow.cess.toLocaleString('en-IN')}</td>
                                                        ) : (
                                                            <td className="p-2 text-right">
                                                                <input
                                                                    type="number"
                                                                    value={gstr3bRow.cess === 0 ? '' : gstr3bRow.cess}
                                                                    placeholder="0"
                                                                    onChange={(e) => handleUpdatePurchaseMatrixCell(safeMonthIdx, 'gstr3b', 'cess', e.target.value)}
                                                                    disabled={!isJuniorAllowedToEdit}
                                                                    className="w-full max-w-[100px] px-2.5 py-1.5 text-right text-xs font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:bg-slate-50"
                                                                />
                                                            </td>
                                                        )}
                                                        {isFullFy ? (
                                                            <td className="p-3 text-right font-mono font-bold text-slate-800">₹{gstr3bRow.nilRated.toLocaleString('en-IN')}</td>
                                                        ) : (
                                                            <td className="p-2 text-right">
                                                                <input
                                                                    type="number"
                                                                    value={gstr3bRow.nilRated === 0 ? '' : gstr3bRow.nilRated}
                                                                    placeholder="0"
                                                                    onChange={(e) => handleUpdatePurchaseMatrixCell(safeMonthIdx, 'gstr3b', 'nilRated', e.target.value)}
                                                                    disabled={!isJuniorAllowedToEdit}
                                                                    className="w-full max-w-[100px] px-2.5 py-1.5 text-right text-xs font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:bg-slate-50"
                                                                />
                                                            </td>
                                                        )}
                                                        <td className="p-3 text-right font-mono font-bold text-slate-900 bg-purple-50/40">
                                                            ₹{gstr3bRow.totalTax.toLocaleString('en-IN')}
                                                        </td>
                                                    </tr>
                                                )}

                                                {/* Row 4: Diff Books vs GSTR-2B */}
                                                {(purchaseMatrixViewMode === 'all' || purchaseMatrixViewMode === 'books_2b') && (
                                                    <tr className="bg-amber-50/20 hover:bg-amber-50/40 transition font-bold divide-x divide-slate-100 border-t-2 border-slate-200">
                                                        <td className="p-3 text-amber-950 bg-amber-50/40">
                                                            <div className="flex items-center gap-2">
                                                                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                                                                <span className="font-bold">3. Comparison: Books vs GSTR-2B (Books - 2B)</span>
                                                            </div>
                                                        </td>
                                                        {renderDiffCell(diff2b.cgst)}
                                                        {renderDiffCell(diff2b.sgst)}
                                                        {renderDiffCell(diff2b.igst)}
                                                        {renderDiffCell(diff2b.cess)}
                                                        {renderDiffCell(diff2b.nilRated)}
                                                        {renderDiffCell(diff2b.totalTax)}
                                                    </tr>
                                                )}

                                                {/* Row 5: Diff Books vs GSTR-3B */}
                                                {(purchaseMatrixViewMode === 'all' || purchaseMatrixViewMode === 'books_3b') && (
                                                    <tr className="bg-rose-50/20 hover:bg-rose-50/40 transition font-bold divide-x divide-slate-100">
                                                        <td className="p-3 text-rose-950 bg-rose-50/40">
                                                            <div className="flex items-center gap-2">
                                                                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
                                                                <span className="font-bold">5. Comparison: Books vs GSTR-3B (Books - 3B)</span>
                                                            </div>
                                                        </td>
                                                        {renderDiffCell(diff3b.cgst)}
                                                        {renderDiffCell(diff3b.sgst)}
                                                        {renderDiffCell(diff3b.igst)}
                                                        {renderDiffCell(diff3b.cess)}
                                                        {renderDiffCell(diff3b.nilRated)}
                                                        {renderDiffCell(diff3b.totalTax)}
                                                    </tr>
                                                )}

                                                {/* Row 6: Rule 88D / DRC-01C Diff: GSTR-3B vs GSTR-2B */}
                                                {(purchaseMatrixViewMode === 'all' || purchaseMatrixViewMode === 'drc01c') && (
                                                    <tr className="bg-red-50/30 hover:bg-red-50/50 transition font-bold divide-x divide-slate-100 border-b">
                                                        <td className="p-3 text-red-950 bg-red-50/50">
                                                            <div className="flex items-center gap-2">
                                                                <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                                                                <span className="font-bold">Rule 88D / DRC-01C Diff: GSTR-3B vs GSTR-2B (3B - 2B)</span>
                                                            </div>
                                                        </td>
                                                        {renderDiffCell(diffDrc.cgst)}
                                                        {renderDiffCell(diffDrc.sgst)}
                                                        {renderDiffCell(diffDrc.igst)}
                                                        {renderDiffCell(diffDrc.cess)}
                                                        {renderDiffCell(diffDrc.nilRated)}
                                                        {renderDiffCell(diffDrc.totalTax)}
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                        {/* Inward Reconciliation Metadata & Field Markers: CGST | SGST | IGST | Cess | Nil/Exempt | Total ITC | Diff CGST | Diff SGST | Diff IGST | Diff Cess | Diff Nil | Diff Total */}
                                    </div>
                                    {/* Statutory Thresholds & Auditor Remarks */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                                        <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-3">
                                            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                                                <ShieldCheck className="w-4 h-4 text-indigo-600" />
                                                <span>Statutory ITC Compliance Scrutiny</span>
                                            </h4>
                                            <div className="flex items-center justify-between text-xs py-1.5 border-b border-slate-200">
                                                <div>
                                                    <span className="font-semibold text-slate-800 block">Sec 16(4) Time-Barred Risk (Deadline Check)</span>
                                                    <span className="text-[11px] text-slate-500">Invoices filed past 30th November deadline of subsequent FY cannot be claimed</span>
                                                </div>
                                                <span className={`px-2.5 py-1 rounded-lg font-bold text-xs ${
                                                    (verification?.purchase?.sec16_4_RiskCount ?? 0) > 0
                                                        ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                                        : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                                }`}>
                                                    {(verification?.purchase?.sec16_4_RiskCount ?? 0) > 0
                                                        ? `${verification.purchase.sec16_4_RiskCount} Invoices at Risk`
                                                        : '0 Time-Barred'}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between text-xs py-1.5">
                                                <div>
                                                    <span className="font-semibold text-slate-800 block">Sec 17(5) Blocked ITC (Ineligible Credit)</span>
                                                    <span className="text-[11px] text-slate-500">Mandatory reversal in GSTR-3B Table 4(B)(1) (Motor vehicles, works contracts, personal use)</span>
                                                </div>
                                                <span className="px-2.5 py-1 rounded-lg font-bold text-xs bg-slate-100 text-slate-800 border border-slate-200 font-mono">
                                                    ₹{(verification?.purchase?.sec17_5_BlockedItcAmount ?? 0).toLocaleString('en-IN')}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-2">
                                            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                                                <FileText className="w-4 h-4 text-blue-600" />
                                                <span>Junior / Senior Auditor Inward ITC Remarks</span>
                                            </h4>
                                            <textarea
                                                rows={3}
                                                value={verification?.purchase?.remarks || ''}
                                                onChange={(e) => handleUpdatePurchaseRemarks(e.target.value)}
                                                disabled={!isJuniorAllowedToEdit}
                                                placeholder="Record notes on missing 2B supplier invoices, debit note timing, Rule 88D response, or ineligible credit..."
                                                className="w-full p-2.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-100 disabled:text-slate-500"
                                            />
                                            <span className="text-[11px] text-slate-400 block">
                                                Auto-saved with working sheet. Included in final Zero-Merge Excel audit package.
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                )}

                        {/* 3.3 TDS Working View (Section-Wise Reconciliation & Statutory Discrepancy Matrix) */}
                        {verificationSubTab === 'journal' && (
                            <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-3.5 space-y-3">
                                {/* Top Header & Action Controls */}
                                <div className="flex items-center justify-between flex-wrap gap-2 pb-2.5 border-b border-slate-100">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="w-2 h-2 rounded-full bg-purple-600 inline-block" />
                                        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                                            3.3 TDS Working &amp; Statutory Section Matrix
                                        </h3>
                                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                                            Books vs Actual vs 26Q/24Q
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-1.5">
                                        <button
                                            type="button"
                                            onClick={() => tdsFileInputRef.current?.click()}
                                            className={`px-2.5 py-1 rounded-lg font-bold text-[11px] flex items-center gap-1 transition cursor-pointer shadow-2xs ${
                                                verification?.journal?.excelAttachment
                                                    ? 'bg-purple-100 hover:bg-purple-200 text-purple-900 border border-purple-300'
                                                    : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'
                                            }`}
                                            title={verification?.journal?.excelAttachment ? `Working attached: ${verification.journal.excelAttachment.fileName}` : 'Attach TDS working excel or computation sheet'}
                                        >
                                            <Paperclip className="w-3 h-3 text-purple-600" />
                                            <span>{verification?.journal?.excelAttachment ? 'Working Attached' : 'Attach Working'}</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleAddTdsSection('194C', 'Contractors / Transporters', 2)}
                                            className="px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold text-[11px] flex items-center gap-1 transition cursor-pointer shadow-2xs"
                                        >
                                            <Plus className="w-3 h-3" />
                                            <span>Add Row</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleResetTdsMatrix}
                                            className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] flex items-center gap-1 transition cursor-pointer border border-slate-200"
                                            title="Reset to standard default statutory sections"
                                        >
                                            <RotateCcw className="w-3 h-3" />
                                            <span>Reset</span>
                                        </button>
                                    </div>
                                </div>

                                {/* 5 Executive KPI Summary Cards - Ultra Compact */}
                                <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 text-xs">
                                    {/* Card 1: Books TDS */}
                                    <div className="bg-slate-50/80 border border-slate-200/90 rounded-lg p-2 flex flex-col justify-between">
                                        <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Books TDS Deducted</span>
                                        <span className="text-sm font-bold font-mono text-slate-900 mt-0.5">
                                            ₹{tdsMatrixTotals.totalBooksTds.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                        </span>
                                        <span className="text-[9.5px] text-slate-400">
                                            Taxable: ₹{tdsMatrixTotals.totalBooksTaxable.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                        </span>
                                    </div>

                                    {/* Card 2: Actual TDS Liable */}
                                    <div className="bg-purple-50/60 border border-purple-200/90 rounded-lg p-2 flex flex-col justify-between">
                                        <span className="text-purple-700 text-[10px] font-bold uppercase tracking-wider">Actual TDS Liable</span>
                                        <span className="text-sm font-bold font-mono text-purple-900 mt-0.5">
                                            ₹{tdsMatrixTotals.totalActualTds.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                        </span>
                                        <span className="text-[9.5px] text-purple-600">
                                            Taxable: ₹{tdsMatrixTotals.totalActualTaxable.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                        </span>
                                    </div>

                                    {/* Card 3: Return TDS Paid */}
                                    <div className="bg-blue-50/60 border border-blue-200/90 rounded-lg p-2 flex flex-col justify-between">
                                        <span className="text-blue-700 text-[10px] font-bold uppercase tracking-wider">Return TDS Paid</span>
                                        <span className="text-sm font-bold font-mono text-blue-900 mt-0.5">
                                            ₹{tdsMatrixTotals.totalReturnTds.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                        </span>
                                        <span className="text-[9.5px] text-blue-600">
                                            26Q / 24Q Deposited
                                        </span>
                                    </div>

                                    {/* Card 4: Booking Pending in Books */}
                                    <div className={`rounded-lg p-2 flex flex-col justify-between border ${
                                        tdsMatrixTotals.totalBookingPending > 0
                                            ? 'bg-amber-50/90 border-amber-300 text-amber-950 shadow-2xs'
                                            : 'bg-emerald-50/60 border-emerald-200 text-emerald-900'
                                    }`}>
                                        <span className="text-[10px] font-bold uppercase tracking-wider flex items-center justify-between">
                                            <span>Booking Pending</span>
                                            {tdsMatrixTotals.totalBookingPending > 0 && (
                                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                            )}
                                        </span>
                                        <span className="text-sm font-bold font-mono mt-0.5">
                                            ₹{tdsMatrixTotals.totalBookingPending.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                        </span>
                                        <span className="text-[9.5px] opacity-80">
                                            {tdsMatrixTotals.totalBookingPending > 0 ? `${tdsMatrixTotals.bookingPendingCount} Sec Unbooked Base` : 'Expenses Fully Booked'}
                                        </span>
                                    </div>

                                    {/* Card 5: Net TDS Payable / Short Deduction */}
                                    <div className={`rounded-lg p-2 flex flex-col justify-between border ${
                                        tdsMatrixTotals.totalTdsPayable > 0
                                            ? 'bg-rose-50/90 border-rose-300 text-rose-950 shadow-2xs'
                                            : 'bg-emerald-50/60 border-emerald-200 text-emerald-900'
                                    }`}>
                                        <span className="text-[10px] font-bold uppercase tracking-wider flex items-center justify-between">
                                            <span>TDS Payable</span>
                                            {tdsMatrixTotals.totalTdsPayable > 0 && (
                                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                                            )}
                                        </span>
                                        <span className="text-sm font-bold font-mono mt-0.5">
                                            ₹{tdsMatrixTotals.totalTdsPayable.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                        </span>
                                        <span className="text-[9.5px] opacity-80">
                                            {tdsMatrixTotals.totalTdsPayable > 0 ? `${tdsMatrixTotals.payableCount} Sec Under-Deposited` : 'Zero TDS Due'}
                                        </span>
                                    </div>
                                </div>

                                {/* Section 40(a)(ia) / 201(1A) Alert Banner - Slim Strip */}
                                {tdsMatrixTotals.totalTdsPayable > 0 && (
                                    <div className="bg-rose-50/90 border border-rose-200 rounded-lg p-2 flex items-center justify-between gap-2 text-xs">
                                        <div className="flex items-center gap-2">
                                            <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                                            <span className="font-bold text-rose-900 text-xs">
                                                Sec 40(a)(ia) 30% Disallowance Exposure: ₹{tdsMatrixTotals.sec40aDisallowance.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                            </span>
                                            <span className="text-[11px] text-rose-700 hidden md:inline">
                                                (Tax Audit Clause 21(b) add-back if not deposited before Sec 139(1) due date)
                                            </span>
                                        </div>
                                        <span className="px-1.5 py-0.5 bg-rose-200/80 text-rose-800 text-[10px] font-bold rounded-sm shrink-0">
                                            + Sec 201(1A) Interest
                                        </span>
                                    </div>
                                )}

                                {/* Filter Navigation Pills & Quick Add */}
                                <div className="flex items-center justify-between flex-wrap gap-1.5 py-0.5">
                                    <div className="flex items-center gap-1">
                                        <span className="text-[11px] font-bold text-slate-500 mr-1 flex items-center gap-1">
                                            <Filter className="w-3 h-3 text-slate-400" />
                                            Filter:
                                        </span>
                                        {[
                                            { id: 'all', label: 'All', count: tdsSectionMatrixData.length },
                                            { id: 'payable', label: 'Payable', count: tdsMatrixTotals.payableCount },
                                            { id: 'pending_booking', label: 'Unbooked', count: tdsMatrixTotals.bookingPendingCount },
                                            { id: 'matched', label: 'Matched', count: tdsMatrixTotals.matchedCount }
                                        ].map(p => {
                                            const isActive = tdsMatrixFilter === p.id;
                                            return (
                                                <button
                                                    key={p.id}
                                                    type="button"
                                                    onClick={() => setTdsMatrixFilter(p.id as any)}
                                                    className={`px-2 py-0.5 rounded text-[11px] font-bold transition flex items-center gap-1 cursor-pointer border ${
                                                        isActive
                                                            ? 'bg-purple-600 text-white border-purple-600 shadow-2xs'
                                                            : 'bg-white text-slate-600 hover:bg-slate-50 border-slate-200'
                                                    }`}
                                                >
                                                    <span>{p.label}</span>
                                                    <span className={`px-1 py-0.1 rounded-full text-[9.5px] font-mono ${
                                                        isActive ? 'bg-purple-800 text-purple-100' : 'bg-slate-100 text-slate-600'
                                                    }`}>
                                                        {p.count}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {/* Quick Presets for Adding Specific Sections */}
                                    <div className="flex items-center gap-1">
                                        <span className="text-[10px] text-slate-400 font-semibold">Quick Add:</span>
                                        {[
                                            { sec: '194C', nat: 'Contractors & Transporters', rate: 2 },
                                            { sec: '194J', nat: 'Professional & Tech Fees', rate: 10 },
                                            { sec: '194I', nat: 'Rent (Land/Bldg/Mach)', rate: 10 },
                                            { sec: '194H', nat: 'Commission & Brokerage', rate: 2 },
                                            { sec: '194Q', nat: 'Purchase of Goods > 50L', rate: 0.1 },
                                            { sec: '194A', nat: 'Interest on Loans', rate: 10 },
                                            { sec: '194R', nat: 'Perquisites & Benefits', rate: 10 }
                                        ].map(item => (
                                            <button
                                                key={item.sec}
                                                type="button"
                                                onClick={() => handleAddTdsSection(item.sec, item.nat, item.rate)}
                                                className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-100 hover:bg-purple-50 hover:text-purple-700 hover:border-purple-300 border border-slate-200 text-slate-600 transition cursor-pointer"
                                                title={`Add ${item.sec} (${item.nat})`}
                                            >
                                                +{item.sec}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* High-Density, Space-Efficient Matrix Table */}
                                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-2xs">
                                    <table className="w-full text-[11px] text-left border-collapse">
                                        <thead>
                                            {/* Header Group Row */}
                                            <tr className="bg-slate-100 text-slate-700 font-bold text-[10px] border-b border-slate-200 text-center uppercase tracking-wider">
                                                <th colSpan={3} className="py-1 px-1.5 border-r border-slate-200 bg-slate-100/90 text-left">
                                                    1. Statutory Section &amp; Nature
                                                </th>
                                                <th colSpan={2} className="py-1 px-1.5 border-r border-slate-200 bg-slate-200/60 text-slate-800">
                                                    2. As Per Books (Tally Accounts)
                                                </th>
                                                <th colSpan={2} className="py-1 px-1.5 border-r border-slate-200 bg-purple-100/60 text-purple-900">
                                                    3. Actual / Liable (Audit Scrutiny)
                                                </th>
                                                <th colSpan={2} className="py-1 px-1.5 border-r border-slate-200 bg-blue-100/60 text-blue-900">
                                                    4. As Per Return (26Q / 24Q)
                                                </th>
                                                <th colSpan={3} className="py-1 px-1.5 border-r border-slate-200 bg-amber-100/50 text-amber-950">
                                                    5. Audit Reconciliations &amp; Variances
                                                </th>
                                                <th className="py-1 px-1 bg-slate-100/90 text-center w-6">
                                                    Act
                                                </th>
                                            </tr>
                                            {/* Sub-Header Column Titles */}
                                            <tr className="bg-slate-50 text-slate-600 font-bold text-[10px] uppercase border-b border-slate-200">
                                                <th className="py-1 px-1.5 w-14">Section</th>
                                                <th className="py-1 px-1.5 min-w-[130px]">Nature of Payment</th>
                                                <th className="py-1 px-1 w-11 text-right border-r border-slate-200">Rate%</th>

                                                <th className="py-1 px-1.5 min-w-[85px] text-right bg-slate-100/40">Taxable (₹)</th>
                                                <th className="py-1 px-1.5 min-w-[75px] text-right border-r border-slate-200 bg-slate-100/40">TDS (₹)</th>

                                                <th className="py-1 px-1.5 min-w-[85px] text-right bg-purple-50/40 text-purple-950">Actual Taxable (₹)</th>
                                                <th className="py-1 px-1.5 min-w-[75px] text-right border-r border-slate-200 bg-purple-50/40 text-purple-950">Actual TDS (₹)</th>

                                                <th className="py-1 px-1.5 min-w-[85px] text-right bg-blue-50/40 text-blue-950">Return Taxable (₹)</th>
                                                <th className="py-1 px-1.5 min-w-[75px] text-right border-r border-slate-200 bg-blue-50/40 text-blue-950">Return TDS (₹)</th>

                                                <th className="py-1 px-1.5 min-w-[85px] text-right bg-amber-50/50 text-amber-900 font-bold">Unbooked (₹)</th>
                                                <th className="py-1 px-1.5 min-w-[85px] text-right bg-rose-50/50 text-rose-900 font-bold">Payable (₹)</th>
                                                <th className="py-1 px-1.5 min-w-[150px] border-r border-slate-200">Status &amp; Notes</th>
                                                <th className="py-1 px-1 w-6 text-center"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {filteredTdsRows.map(row => {
                                                const bookingPending = Math.max(0, Number(row.actualTaxable || 0) - Number(row.booksTaxable || 0));
                                                const tdsPayable = Math.max(0, Number(row.actualTds || 0) - Number(row.returnTds || 0));
                                                const challanPending = Math.max(0, Number(row.booksTds || 0) - Number(row.returnTds || 0));
                                                const isMatched = bookingPending === 0 && tdsPayable === 0 && challanPending === 0;

                                                return (
                                                    <tr key={row.id} className="hover:bg-purple-50/20 transition-colors group">
                                                        {/* Section Code */}
                                                        <td className="py-0.5 px-1">
                                                            <input
                                                                type="text"
                                                                disabled={!isJuniorAllowedToEdit}
                                                                value={row.section}
                                                                onChange={e => handleUpdateTdsSectionRow(row.id, 'section', e.target.value)}
                                                                className="w-full font-mono font-bold text-purple-950 bg-purple-50/60 border border-purple-200 rounded px-1 py-0.5 text-[11px] focus:ring-1 focus:ring-purple-400 focus:outline-hidden"
                                                            />
                                                        </td>

                                                        {/* Nature of Payment */}
                                                        <td className="py-0.5 px-1">
                                                            <input
                                                                type="text"
                                                                disabled={!isJuniorAllowedToEdit}
                                                                value={row.natureOfPayment}
                                                                onChange={e => handleUpdateTdsSectionRow(row.id, 'natureOfPayment', e.target.value)}
                                                                className="w-full text-slate-800 bg-transparent border border-transparent hover:border-slate-200 focus:border-purple-400 focus:bg-white rounded px-1 py-0.5 text-[11px] focus:outline-hidden"
                                                            />
                                                        </td>

                                                        {/* Rate % */}
                                                        <td className="py-0.5 px-0.5 text-right border-r border-slate-200">
                                                            <input
                                                                type="number"
                                                                step="0.01"
                                                                disabled={!isJuniorAllowedToEdit}
                                                                value={row.rate || 0}
                                                                onChange={e => handleUpdateTdsSectionRow(row.id, 'rate', e.target.value)}
                                                                className="w-10 text-right font-mono text-slate-800 bg-transparent border border-transparent hover:border-slate-200 focus:border-purple-400 focus:bg-white rounded px-0.5 py-0.5 text-[11px] focus:outline-hidden [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                            />
                                                        </td>

                                                        {/* Books Taxable */}
                                                        <td className="py-0.5 px-1 text-right bg-slate-50/40 font-mono">
                                                            <input
                                                                type="number"
                                                                disabled={!isJuniorAllowedToEdit}
                                                                value={row.booksTaxable || 0}
                                                                onChange={e => handleUpdateTdsSectionRow(row.id, 'booksTaxable', e.target.value)}
                                                                className="w-full text-right font-mono text-slate-900 bg-transparent border border-transparent hover:border-slate-200 focus:border-purple-400 focus:bg-white rounded px-1 py-0.5 text-[11px] focus:outline-hidden [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                            />
                                                        </td>

                                                        {/* Books TDS */}
                                                        <td className="py-0.5 px-1 text-right border-r border-slate-200 bg-slate-50/40 font-mono">
                                                            <input
                                                                type="number"
                                                                disabled={!isJuniorAllowedToEdit}
                                                                value={row.booksTds || 0}
                                                                onChange={e => handleUpdateTdsSectionRow(row.id, 'booksTds', e.target.value)}
                                                                className="w-full text-right font-mono text-slate-900 bg-transparent border border-transparent hover:border-slate-200 focus:border-purple-400 focus:bg-white rounded px-1 py-0.5 text-[11px] focus:outline-hidden [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                            />
                                                        </td>

                                                        {/* Actual Taxable */}
                                                        <td className="py-0.5 px-1 text-right bg-purple-50/20 font-mono">
                                                            <input
                                                                type="number"
                                                                disabled={!isJuniorAllowedToEdit}
                                                                value={row.actualTaxable || 0}
                                                                onChange={e => handleUpdateTdsSectionRow(row.id, 'actualTaxable', e.target.value)}
                                                                className="w-full text-right font-mono text-purple-950 font-semibold bg-transparent border border-transparent hover:border-purple-200 focus:border-purple-500 focus:bg-white rounded px-1 py-0.5 text-[11px] focus:outline-hidden [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                            />
                                                        </td>

                                                        {/* Actual TDS */}
                                                        <td className="py-0.5 px-1 text-right border-r border-slate-200 bg-purple-50/20 font-mono">
                                                            <input
                                                                type="number"
                                                                disabled={!isJuniorAllowedToEdit}
                                                                value={row.actualTds || 0}
                                                                onChange={e => handleUpdateTdsSectionRow(row.id, 'actualTds', e.target.value)}
                                                                className="w-full text-right font-mono text-purple-950 font-semibold bg-transparent border border-transparent hover:border-purple-200 focus:border-purple-500 focus:bg-white rounded px-1 py-0.5 text-[11px] focus:outline-hidden [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                            />
                                                        </td>

                                                        {/* Return Taxable */}
                                                        <td className="py-0.5 px-1 text-right bg-blue-50/20 font-mono">
                                                            <input
                                                                type="number"
                                                                disabled={!isJuniorAllowedToEdit}
                                                                value={row.returnTaxable || 0}
                                                                onChange={e => handleUpdateTdsSectionRow(row.id, 'returnTaxable', e.target.value)}
                                                                className="w-full text-right font-mono text-blue-950 bg-transparent border border-transparent hover:border-blue-200 focus:border-blue-500 focus:bg-white rounded px-1 py-0.5 text-[11px] focus:outline-hidden [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                            />
                                                        </td>

                                                        {/* Return TDS */}
                                                        <td className="py-0.5 px-1 text-right border-r border-slate-200 bg-blue-50/20 font-mono">
                                                            <input
                                                                type="number"
                                                                disabled={!isJuniorAllowedToEdit}
                                                                value={row.returnTds || 0}
                                                                onChange={e => handleUpdateTdsSectionRow(row.id, 'returnTds', e.target.value)}
                                                                className="w-full text-right font-mono text-blue-950 bg-transparent border border-transparent hover:border-blue-200 focus:border-blue-500 focus:bg-white rounded px-1 py-0.5 text-[11px] focus:outline-hidden [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                            />
                                                        </td>

                                                        {/* Booking Pending in Books */}
                                                        <td className="py-0.5 px-1.5 text-right bg-amber-50/30 font-mono">
                                                            {bookingPending > 0 ? (
                                                                <div className="flex items-center justify-end gap-1 text-amber-900 font-bold">
                                                                    <span>₹{bookingPending.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                                                                </div>
                                                            ) : (
                                                                <span className="text-slate-400 font-normal">₹0</span>
                                                            )}
                                                        </td>

                                                        {/* TDS Payable */}
                                                        <td className="py-0.5 px-1.5 text-right bg-rose-50/30 font-mono">
                                                            {tdsPayable > 0 ? (
                                                                <div className="flex items-center justify-end gap-1 text-rose-700 font-bold">
                                                                    <span>₹{tdsPayable.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                                                                </div>
                                                            ) : (
                                                                <span className="text-emerald-700 font-medium">₹0</span>
                                                            )}
                                                        </td>

                                                        {/* Status & Remarks */}
                                                        <td className="py-0.5 px-1 border-r border-slate-200">
                                                            <div className="flex items-center gap-1">
                                                                {isMatched && (
                                                                    <span className="px-1 py-0.2 rounded text-[9.5px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center shrink-0">
                                                                        Matched
                                                                    </span>
                                                                )}
                                                                {tdsPayable > 0 && (
                                                                    <span className="px-1 py-0.2 rounded text-[9.5px] font-bold bg-rose-50 text-rose-700 border border-rose-200 inline-flex items-center shrink-0">
                                                                        Payable
                                                                    </span>
                                                                )}
                                                                {bookingPending > 0 && (
                                                                    <span className="px-1 py-0.2 rounded text-[9.5px] font-bold bg-amber-50 text-amber-800 border border-amber-200 inline-flex items-center shrink-0">
                                                                        Unbooked
                                                                    </span>
                                                                )}
                                                                {challanPending > 0 && (
                                                                    <span className="px-1 py-0.2 rounded text-[9.5px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 inline-flex items-center shrink-0">
                                                                        Challan
                                                                    </span>
                                                                )}
                                                                <input
                                                                    type="text"
                                                                    disabled={!isJuniorAllowedToEdit}
                                                                    placeholder="Auditor note..."
                                                                    value={row.remarks || ''}
                                                                    onChange={e => handleUpdateTdsSectionRow(row.id, 'remarks', e.target.value)}
                                                                    className="w-full text-[10.5px] text-slate-700 placeholder:text-slate-300 bg-transparent border border-transparent hover:border-slate-200 focus:border-purple-400 focus:bg-white rounded px-1 py-0.5 focus:outline-hidden"
                                                                />
                                                            </div>
                                                        </td>

                                                        {/* Action: Delete */}
                                                        <td className="py-0.5 px-1 text-center">
                                                            {isJuniorAllowedToEdit && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleDeleteTdsSection(row.id)}
                                                                    className="p-0.5 rounded text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                                                                    title="Delete row"
                                                                >
                                                                    <Trash2 className="w-3 h-3" />
                                                                </button>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}

                                            {filteredTdsRows.length === 0 && (
                                                <tr>
                                                    <td colSpan={13} className="py-4 text-center text-slate-400 text-xs">
                                                        No TDS sections match the selected filter.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>

                                        {/* Full Grand Total Row */}
                                        <tfoot>
                                            <tr className="bg-slate-900 text-white font-bold text-[11px] border-t-2 border-slate-900">
                                                <td className="py-1.5 px-1.5 uppercase tracking-wider font-mono">
                                                    TOTAL
                                                </td>
                                                <td className="py-1.5 px-1.5 text-slate-300">
                                                    {tdsSectionMatrixData.length} Sections
                                                </td>
                                                <td className="py-1.5 px-1 text-right border-r border-slate-700 text-slate-400">
                                                    -
                                                </td>

                                                {/* Books Totals */}
                                                <td className="py-1.5 px-1.5 text-right font-mono bg-slate-800/80">
                                                    ₹{tdsMatrixTotals.totalBooksTaxable.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                                </td>
                                                <td className="py-1.5 px-1.5 text-right font-mono border-r border-slate-700 bg-slate-800/80 text-amber-300">
                                                    ₹{tdsMatrixTotals.totalBooksTds.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                                </td>

                                                {/* Actual Totals */}
                                                <td className="py-1.5 px-1.5 text-right font-mono bg-purple-950/70 text-purple-200">
                                                    ₹{tdsMatrixTotals.totalActualTaxable.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                                </td>
                                                <td className="py-1.5 px-1.5 text-right font-mono border-r border-slate-700 bg-purple-950/70 text-purple-300 font-bold">
                                                    ₹{tdsMatrixTotals.totalActualTds.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                                </td>

                                                {/* Return Totals */}
                                                <td className="py-1.5 px-1.5 text-right font-mono bg-blue-950/70 text-blue-200">
                                                    ₹{tdsMatrixTotals.totalReturnTaxable.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                                </td>
                                                <td className="py-1.5 px-1.5 text-right font-mono border-r border-slate-700 bg-blue-950/70 text-blue-300 font-bold">
                                                    ₹{tdsMatrixTotals.totalReturnTds.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                                </td>

                                                {/* Booking Pending Total */}
                                                <td className="py-1.5 px-1.5 text-right font-mono bg-amber-950/80 text-amber-300 font-bold text-xs">
                                                    ₹{tdsMatrixTotals.totalBookingPending.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                                </td>

                                                {/* TDS Payable Total */}
                                                <td className="py-1.5 px-1.5 text-right font-mono bg-rose-950/80 text-rose-300 font-bold text-xs">
                                                    ₹{tdsMatrixTotals.totalTdsPayable.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                                </td>

                                                {/* Overall Badge */}
                                                <td className="py-1.5 px-1.5 border-r border-slate-700">
                                                    <span className={`px-1.5 py-0.2 rounded text-[9.5px] font-bold uppercase ${
                                                        tdsMatrixTotals.totalTdsPayable > 0
                                                            ? 'bg-rose-900 text-rose-200 border border-rose-700'
                                                            : 'bg-emerald-900 text-emerald-200 border border-emerald-700'
                                                    }`}>
                                                        {tdsMatrixTotals.totalTdsPayable > 0 ? `₹${tdsMatrixTotals.totalTdsPayable.toLocaleString('en-IN')} Due` : 'Deposited'}
                                                    </span>
                                                </td>
                                                <td className="py-1.5 px-1 text-center text-slate-500"></td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>

                                {/* Auxiliary Statutory Scrutiny Cards (Transporter 194C & 194Q High Volume) - Compact */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs pt-1">
                                    <div className="bg-slate-50/80 border border-slate-200 rounded-lg p-2 flex items-center justify-between">
                                        <div>
                                            <span className="text-slate-600 font-bold uppercase text-[10px] tracking-wider block">Transporter 194C(6) Missing PAN Scrutiny</span>
                                            <p className="text-[10px] text-slate-400">Without valid PAN subject to 20% TDS u/s 206AA.</p>
                                        </div>
                                        <span className="text-xs font-bold font-mono text-rose-700 px-2 py-0.5 bg-white border border-rose-200 rounded-md shrink-0">
                                            {verification?.journal?.tds194C_MissingPanCount ?? 0} Vouchers
                                        </span>
                                    </div>
                                    <div className="bg-slate-50/80 border border-slate-200 rounded-lg p-2 flex items-center justify-between">
                                        <div>
                                            <span className="text-slate-600 font-bold uppercase text-[10px] tracking-wider block">Section 194Q High Volume Purchase (&gt; ₹50L)</span>
                                            <p className="text-[10px] text-slate-400">Aggregate goods purchase &gt; ₹50L subject to 0.1% TDS.</p>
                                        </div>
                                        <span className="text-xs font-bold font-mono text-blue-700 px-2 py-0.5 bg-white border border-blue-200 rounded-md shrink-0">
                                            {verification?.journal?.tds194Q_HighVolumeCount ?? 0} Vendors
                                        </span>
                                    </div>
                                </div>

                                {/* ─── TDS Excel Working Paper Attachment (Audit Evidence) ─── */}
                                <input
                                    ref={tdsFileInputRef}
                                    type="file"
                                    accept=".xlsx,.xls,.csv"
                                    onChange={handleTdsFileUpload}
                                    className="hidden"
                                />
                                {verification?.journal?.excelAttachment ? (
                                    <div className="bg-purple-50/70 border border-purple-200/90 rounded-lg p-2.5 flex items-center justify-between flex-wrap gap-2 shadow-2xs">
                                        <div className="flex items-center gap-2.5">
                                            <div className="w-7 h-7 rounded-lg bg-purple-100 border border-purple-200 flex items-center justify-center shrink-0">
                                                <FileSpreadsheet className="w-4 h-4 text-purple-700" />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-xs font-bold text-slate-900 font-mono">
                                                        {verification.journal.excelAttachment.fileName}
                                                    </span>
                                                    <span className="px-1.5 py-0.2 rounded-full text-[9.5px] font-bold bg-purple-600 text-white uppercase tracking-wider">
                                                        TDS Working Attached
                                                    </span>
                                                </div>
                                                <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                                                    {verification.journal.excelAttachment.fileSize && (
                                                        <span>{(verification.journal.excelAttachment.fileSize / 1024).toFixed(1)} KB</span>
                                                    )}
                                                    {verification.journal.excelAttachment.uploadedAt && (
                                                        <span>· Attached on {verification.journal.excelAttachment.uploadedAt}</span>
                                                    )}
                                                    {verification.journal.excelAttachment.uploadedBy && (
                                                        <span>by {verification.journal.excelAttachment.uploadedBy}</span>
                                                    )}
                                                    {verification.journal.excelAttachment.filePath && (
                                                        <span className="font-mono text-slate-600">({verification.journal.excelAttachment.filePath})</span>
                                                    )}
                                                </div>
                                                {verification.journal.excelAttachment.sheetNames && verification.journal.excelAttachment.sheetNames.length > 0 && (
                                                    <div className="flex items-center gap-1 mt-1 flex-wrap">
                                                        <span className="text-[9.5px] font-semibold text-slate-500">Sheets ({verification.journal.excelAttachment.sheetNames.length}):</span>
                                                        {verification.journal.excelAttachment.sheetNames.map((sName, sIdx) => (
                                                            <span key={sIdx} className="px-1.5 py-0.2 bg-white border border-purple-200 rounded text-[9.5px] font-mono text-purple-800">
                                                                {sName}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-1.5">
                                            {verification.journal.excelAttachment.fileData && (
                                                <button
                                                    type="button"
                                                    onClick={handleDownloadTdsAttachment}
                                                    className="px-2.5 py-1 rounded-md bg-purple-600 hover:bg-purple-700 text-white font-bold text-[11px] flex items-center gap-1 transition cursor-pointer shadow-2xs"
                                                    title="Download attached TDS Excel file"
                                                >
                                                    <Download className="w-3 h-3" />
                                                    <span>Download</span>
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => tdsFileInputRef.current?.click()}
                                                className="px-2.5 py-1 rounded-md bg-white hover:bg-slate-50 text-slate-700 font-bold text-[11px] flex items-center gap-1 transition cursor-pointer border border-slate-200 shadow-2xs"
                                                title="Replace attached file"
                                            >
                                                <UploadCloud className="w-3 h-3 text-slate-500" />
                                                <span>Replace</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleRemoveTdsAttachment}
                                                className="p-1 rounded-md bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition cursor-pointer border border-slate-200"
                                                title="Remove attachment"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="bg-slate-50/70 border border-dashed border-slate-300 rounded-lg p-2.5 flex items-center justify-between flex-wrap gap-2">
                                        <div className="flex items-center gap-2">
                                            <div className="w-7 h-7 rounded-md bg-purple-50 border border-purple-200 flex items-center justify-center shrink-0">
                                                <Paperclip className="w-3.5 h-3.5 text-purple-600" />
                                            </div>
                                            <div>
                                                <span className="text-[11px] font-bold text-slate-800 block">
                                                    Attach TDS Working Excel (Audit Evidence)
                                                </span>
                                                <span className="text-[10px] text-slate-500">
                                                    Upload Form 26Q / 24Q computation, TRACES 16A matching sheet, or challan working (.xlsx, .xls, .csv)
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <button
                                                type="button"
                                                onClick={() => tdsFileInputRef.current?.click()}
                                                className="px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold text-[11px] flex items-center gap-1 transition cursor-pointer shadow-2xs"
                                            >
                                                <UploadCloud className="w-3 h-3" />
                                                <span>Choose Excel File</span>
                                            </button>
                                            <div className="flex items-center gap-1">
                                                <input
                                                    type="text"
                                                    placeholder="or link file path (E:\TDS_Working.xlsx)..."
                                                    value={tdsLocalPathInput}
                                                    onChange={e => setTdsLocalPathInput(e.target.value)}
                                                    className="w-48 px-2 py-0.5 text-[10.5px] bg-white border border-slate-200 rounded-md focus:outline-hidden focus:border-purple-400"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={handleLinkTdsLocalPath}
                                                    className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10.5px] border border-slate-200 transition cursor-pointer"
                                                >
                                                    Link Path
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* 3.4 Bank, Loans & 26AS View */}
                        {verificationSubTab === 'bank' && (
                            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-6">
                                {/* Top Header & Action Controls */}
                                <div className="flex items-center justify-between flex-wrap gap-4 pb-4 border-b border-slate-100">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 inline-block" />
                                            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                                                3.4 Bank Statements, Loan Interest &amp; Form 26AS / AIS Reco
                                            </h3>
                                        </div>
                                        <p className="text-xs text-slate-500 mt-0.5">
                                            Substantive 4-column reconciliation of all Banking Facilities (Savings/Current), Borrowing Lines (CC/OD/Term Loans), and Investments (FD). Junior auditors can record balances, match statuses, and select or type self comments.
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-2 flex-wrap">
                                        <button
                                            type="button"
                                            onClick={() => handleAddBankFacility('Bank Account')}
                                            className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                                        >
                                            <Plus className="w-3.5 h-3.5" />
                                            <span>Add Bank / Facility</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleResetBankFacilities}
                                            className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer border border-slate-200"
                                            title="Reset to 4 default facilities"
                                        >
                                            <RotateCcw className="w-3.5 h-3.5" />
                                            <span>Reset Defaults</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Summary Stat Chips */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col">
                                        <span className="text-slate-500 text-[11px] font-semibold uppercase">Total Facilities</span>
                                        <span className="text-base font-bold font-mono text-slate-900 mt-0.5">{bankFacilitiesTotals.totalCount} Monitored</span>
                                    </div>
                                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col">
                                        <span className="text-slate-500 text-[11px] font-semibold uppercase">Total Closing Balance</span>
                                        <span className={`text-base font-bold font-mono mt-0.5 ${bankFacilitiesTotals.totalBalance < 0 ? 'text-rose-700' : 'text-slate-900'}`}>
                                            ₹{bankFacilitiesTotals.totalBalance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                    <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-3 flex flex-col">
                                        <span className="text-emerald-700 text-[11px] font-semibold uppercase flex items-center gap-1">
                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                            <span>Matched</span>
                                        </span>
                                        <span className="text-base font-bold font-mono text-emerald-800 mt-0.5">{bankFacilitiesTotals.matchCount} Accounts</span>
                                    </div>
                                    <div className={`rounded-xl p-3 flex flex-col border ${bankFacilitiesTotals.notMatchedCount > 0 ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200'}`}>
                                        <span className={`text-[11px] font-semibold uppercase flex items-center gap-1 ${bankFacilitiesTotals.notMatchedCount > 0 ? 'text-rose-700' : 'text-slate-500'}`}>
                                            <AlertTriangle className={`w-3.5 h-3.5 ${bankFacilitiesTotals.notMatchedCount > 0 ? 'text-rose-600' : 'text-slate-400'}`} />
                                            <span>Unmatched / Review</span>
                                        </span>
                                        <span className={`text-base font-bold font-mono mt-0.5 ${bankFacilitiesTotals.notMatchedCount > 0 ? 'text-rose-800' : 'text-slate-700'}`}>
                                            {bankFacilitiesTotals.notMatchedCount} Discrepant · {bankFacilitiesTotals.selfCommentCount} Comments
                                        </span>
                                    </div>
                                </div>

                                {/* 4-COLUMN RECONCILIATION TABLE */}
                                <div className="overflow-x-auto rounded-xl border border-slate-200">
                                    <table className="w-full text-left border-collapse text-xs">
                                        <thead>
                                            <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]">
                                                <th className="p-3 w-[20%]">1. Type</th>
                                                <th className="p-3 w-[24%] px-4">2. Account / Facility Name</th>
                                                <th className="p-3 w-[20%] text-right px-4">3. Balance (₹)</th>
                                                <th className="p-3 w-[32%] text-left px-4">4. Status (Match / Not Matched / Self Comment) &amp; Comment</th>
                                                <th className="p-3 w-[4%] text-center">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-200">
                                            {bankFacilitiesData.map((item, index) => {
                                                return (
                                                    <tr key={item.id} className="hover:bg-slate-50/60 transition">
                                                        {/* Col 1: Type Dropdown */}
                                                        <td className="p-2.5 align-top">
                                                            <select
                                                                value={item.facilityType}
                                                                onChange={e => handleUpdateBankFacility(item.id, 'facilityType', e.target.value as BankFacilityType)}
                                                                className="w-full text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-2xs"
                                                            >
                                                                {BANK_FACILITY_TYPES.map(ft => (
                                                                    <option key={ft} value={ft}>{ft}</option>
                                                                ))}
                                                            </select>
                                                            <div className="mt-1 flex items-center gap-1.5 text-[10px] text-slate-400">
                                                                <Landmark className="w-3 h-3 text-slate-400" />
                                                                <span>Facility #{index + 1}</span>
                                                            </div>
                                                        </td>

                                                        {/* Col 2: Name / Particulars Input */}
                                                        <td className="p-2.5 align-top">
                                                            <input
                                                                type="text"
                                                                value={item.name}
                                                                onChange={e => handleUpdateBankFacility(item.id, 'name', e.target.value)}
                                                                placeholder="e.g. HDFC Current A/c 502000..., SBI CC A/c, ICICI FD 4921"
                                                                className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-2xs font-medium"
                                                            />
                                                            <span className="text-[10px] text-slate-400 block mt-0.5">
                                                                Bank / Branch / A/c No.
                                                            </span>
                                                        </td>

                                                        {/* Col 3: Balance (₹) Numeric Input */}
                                                        <td className="p-2.5 align-top text-right pr-4">
                                                            <div className="relative">
                                                                <input
                                                                    type="number"
                                                                    step="any"
                                                                    value={item.balance === 0 ? '' : item.balance}
                                                                    onChange={e => handleUpdateBankFacility(item.id, 'balance', e.target.value)}
                                                                    placeholder="0.00"
                                                                    className="w-full text-xs font-mono text-right pr-2 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-2xs font-semibold"
                                                                />
                                                            </div>
                                                            <span className={`text-[10px] font-mono block mt-0.5 ${Number(item.balance || 0) < 0 ? 'text-rose-600 font-bold' : 'text-slate-500'}`}>
                                                                ₹{Number(item.balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                            </span>
                                                        </td>

                                                        {/* Col 4: Status Dropdown & Comment with Quick-Select Dropdown Button */}
                                                        <td className="p-2.5 align-top text-left pl-4 space-y-1.5">
                                                            {/* Top row: Status Dropdown */}
                                                            <div className="flex items-center gap-2">
                                                                <select
                                                                    value={item.status}
                                                                    onChange={e => handleUpdateBankFacility(item.id, 'status', e.target.value as BankMatchStatus)}
                                                                    className={`text-xs font-bold px-2.5 py-1.5 rounded-lg border focus:outline-none shadow-2xs ${
                                                                        item.status === 'Match'
                                                                            ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                                                                            : item.status === 'Not Matched'
                                                                            ? 'bg-rose-50 border-rose-300 text-rose-800'
                                                                            : 'bg-amber-50 border-amber-300 text-amber-800'
                                                                    }`}
                                                                >
                                                                    <option value="Match">✓ Match</option>
                                                                    <option value="Not Matched">✗ Not Matched</option>
                                                                    <option value="Self Comment">✎ Self Comment</option>
                                                                </select>
                                                            </div>

                                                            {/* Bottom row: Free text box + quick-select dropdown button */}
                                                            <div className="flex items-center gap-1.5">
                                                                <input
                                                                    type="text"
                                                                    value={item.comment || ''}
                                                                    onChange={e => handleUpdateBankFacility(item.id, 'comment', e.target.value)}
                                                                    placeholder="Type self comment or pick preset..."
                                                                    className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-2xs"
                                                                />
                                                                <select
                                                                    value=""
                                                                    onChange={e => {
                                                                        if (e.target.value) {
                                                                            handleUpdateBankFacility(item.id, 'comment', e.target.value);
                                                                        }
                                                                    }}
                                                                    className="text-xs px-2 py-1.5 rounded-lg border border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100 font-semibold focus:outline-none cursor-pointer max-w-[130px]"
                                                                    title="Quick-Select Predefined Audit Comment"
                                                                >
                                                                    <option value="" disabled>⚡ Presets...</option>
                                                                    {STANDARD_BANK_AUDIT_COMMENTS.map((comm, cIdx) => (
                                                                        <option key={cIdx} value={comm}>{comm}</option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                        </td>

                                                        {/* Delete Row Action */}
                                                        <td className="p-2.5 align-middle text-center">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDeleteBankFacility(item.id)}
                                                                className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition cursor-pointer"
                                                                title="Delete facility row"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                        <tfoot>
                                            <tr className="bg-slate-900 text-white font-bold text-xs">
                                                <td className="p-3">FULL TOTAL ({bankFacilitiesTotals.totalCount} ACCOUNTS)</td>
                                                <td className="p-3 text-slate-300 text-[11px] font-normal">
                                                    {bankFacilitiesTotals.matchCount} Matched · {bankFacilitiesTotals.notMatchedCount} Discrepancies · {bankFacilitiesTotals.selfCommentCount} Self Comments
                                                </td>
                                                <td className="p-3 text-right font-mono text-emerald-300 text-sm">
                                                    ₹{bankFacilitiesTotals.totalBalance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </td>
                                                <td colSpan={2} className="p-3">
                                                    <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold inline-flex items-center gap-1 ${
                                                        bankFacilitiesTotals.isAllMatched
                                                            ? 'bg-emerald-800 text-emerald-100'
                                                            : 'bg-amber-800 text-amber-100'
                                                    }`}>
                                                        {bankFacilitiesTotals.isAllMatched ? '✓ All Accounts Reconciled' : '⚠ Action / Self Comments Active'}
                                                    </span>
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>

                                {/* Quick Add Buttons Bar */}
                                <div className="flex items-center justify-between flex-wrap gap-2 pt-2">
                                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                        <span>Quick Add:</span>
                                        {BANK_FACILITY_TYPES.map(ft => (
                                            <button
                                                key={ft}
                                                type="button"
                                                onClick={() => handleAddBankFacility(ft)}
                                                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 border border-slate-200 font-semibold transition cursor-pointer text-[11px]"
                                            >
                                                + {ft}
                                            </button>
                                        ))}
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => handleAddBankFacility('Bank Account')}
                                        className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                        <span>Add Row</span>
                                    </button>
                                </div>

                                {/* Statutory Banking Scrutiny & 26AS/AIS Cards */}
                                <div className="pt-4 border-t border-slate-100 space-y-3">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                                        <ShieldAlert className="w-3.5 h-3.5 text-indigo-600" />
                                        <span>Statutory Banking Scrutiny &amp; Form 26AS / AIS SFT Checks</span>
                                    </h4>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                                        <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl">
                                            <span className="text-slate-500 font-bold uppercase tracking-wider block mb-1">Stale Cheques (&gt; 3 Months)</span>
                                            <span className="text-lg font-bold font-mono text-amber-700">{verification?.bankLoans?.staleChequesCount ?? 0} Cheques</span>
                                            <p className="text-[11px] text-slate-500 mt-1">Requires reversal or re-issue under Companies Act</p>
                                        </div>
                                        <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl">
                                            <span className="text-slate-500 font-bold uppercase tracking-wider block mb-1">Loan Interest Servicing</span>
                                            <span className="text-lg font-bold font-mono text-emerald-700">{verification?.bankLoans?.interestServicingCheck || 'Serviced Regularly'}</span>
                                            <p className="text-[11px] text-slate-500 mt-1">Tested against loan agreement EMI schedules</p>
                                        </div>
                                        <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl">
                                            <span className="text-slate-500 font-bold uppercase tracking-wider block mb-1">Form 26AS Tax Discrepancy</span>
                                            <span className="text-lg font-bold font-mono text-rose-700">₹{(verification?.bankLoans?.form26AS_MismatchAmount ?? 0).toLocaleString('en-IN')}</span>
                                            <p className="text-[11px] text-slate-500 mt-1">Difference between Books TDS and 26AS TDS credits</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 3.5 ROC Charges View */}
                        {verificationSubTab === 'roc' && (
                            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-6">
                                {/* Top Header & Action Controls */}
                                <div className="flex items-center justify-between flex-wrap gap-4 pb-4 border-b border-slate-100">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 inline-block" />
                                            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                                                3.5 New Borrowings &amp; ROC Charge Creation / Satisfaction (CHG-1 / CHG-4)
                                            </h3>
                                        </div>
                                        <p className="text-xs text-slate-500 mt-0.5">
                                            Substantive loan-to-charge mapping under Section 77(1) of the Companies Act 2013 and Section 269SS of the Income Tax Act. Junior auditors can map each loan to verify whether charges have been created with the MCA.
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-2 flex-wrap">
                                        <button
                                            type="button"
                                            onClick={() => handleAddRocLoan('Secured Term Loan')}
                                            className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                                        >
                                            <Plus className="w-3.5 h-3.5" />
                                            <span>Add Loan / Borrowing</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleResetRocLoans}
                                            className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer border border-slate-200"
                                            title="Reset to standard default borrowings"
                                        >
                                            <RotateCcw className="w-3.5 h-3.5" />
                                            <span>Reset Defaults</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Summary Stat Chips */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col">
                                        <span className="text-slate-500 text-[11px] font-semibold uppercase">Total Borrowings</span>
                                        <span className="text-base font-bold font-mono text-slate-900 mt-0.5">{rocLoansTotals.totalCount} Monitored</span>
                                    </div>
                                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col">
                                        <span className="text-slate-500 text-[11px] font-semibold uppercase">Total Loan Sanctioned</span>
                                        <span className="text-base font-bold font-mono text-slate-900 mt-0.5">
                                            ₹{rocLoansTotals.totalSanctioned.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                    <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-3 flex flex-col">
                                        <span className="text-emerald-700 text-[11px] font-semibold uppercase flex items-center gap-1">
                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                            <span>Charges Created</span>
                                        </span>
                                        <span className="text-base font-bold font-mono text-emerald-800 mt-0.5">
                                            {rocLoansTotals.createdCount} Registered (CHG-1)
                                        </span>
                                    </div>
                                    <div className={`rounded-xl p-3 flex flex-col border ${
                                        rocLoansTotals.overdueCount > 0 || rocLoansTotals.cashViolationCount > 0
                                            ? 'bg-rose-50 border-rose-200'
                                            : rocLoansTotals.pendingCount > 0
                                            ? 'bg-amber-50 border-amber-200'
                                            : 'bg-slate-50 border-slate-200'
                                    }`}>
                                        <span className={`text-[11px] font-semibold uppercase flex items-center gap-1 ${
                                            rocLoansTotals.overdueCount > 0 || rocLoansTotals.cashViolationCount > 0
                                                ? 'text-rose-700'
                                                : rocLoansTotals.pendingCount > 0
                                                ? 'text-amber-700'
                                                : 'text-slate-500'
                                        }`}>
                                            <AlertTriangle className={`w-3.5 h-3.5 ${
                                                rocLoansTotals.overdueCount > 0 || rocLoansTotals.cashViolationCount > 0
                                                    ? 'text-rose-600'
                                                    : rocLoansTotals.pendingCount > 0
                                                    ? 'text-amber-600'
                                                    : 'text-slate-400'
                                            }`} />
                                            <span>Charge &amp; 269SS Alerts</span>
                                        </span>
                                        <span className={`text-base font-bold font-mono mt-0.5 ${
                                            rocLoansTotals.overdueCount > 0 || rocLoansTotals.cashViolationCount > 0
                                                ? 'text-rose-800'
                                                : rocLoansTotals.pendingCount > 0
                                                ? 'text-amber-800'
                                                : 'text-slate-700'
                                        }`}>
                                            {rocLoansTotals.overdueCount} Overdue · {rocLoansTotals.pendingCount} Pending · {rocLoansTotals.cashViolationCount} Cash
                                        </span>
                                    </div>
                                </div>

                                {/* LOAN-TO-CHARGE MAPPING TABLE */}
                                <div className="overflow-x-auto rounded-xl border border-slate-200">
                                    <table className="w-full text-left border-collapse text-xs">
                                        <thead>
                                            <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]">
                                                <th className="p-3 w-[20%]">1. Lender / Facility Name</th>
                                                <th className="p-3 w-[15%]">2. Category</th>
                                                <th className="p-3 w-[14%] min-w-[120px] text-right">3. Loan Amount (₹)</th>
                                                <th className="p-3 w-[18%]">4. Charge Created Status (CHG-1 / 4)</th>
                                                <th className="p-3 w-[11%]">5. MCA SRN / Ref</th>
                                                <th className="p-3 w-[10%]">6. Sec 269SS</th>
                                                <th className="p-3 w-[8%]">7. Remarks</th>
                                                <th className="p-3 w-[4%] text-center">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-200">
                                            {rocLoansData.map((item, index) => {
                                                return (
                                                    <tr key={item.id} className="hover:bg-slate-50/60 transition">
                                                        {/* Col 1: Lender Name */}
                                                        <td className="p-2.5 align-top">
                                                            <input
                                                                type="text"
                                                                value={item.lenderName}
                                                                onChange={e => handleUpdateRocLoan(item.id, 'lenderName', e.target.value)}
                                                                placeholder="e.g. HDFC Bank Term Loan, SBI CC"
                                                                className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-2xs font-medium"
                                                            />
                                                            <div className="mt-1 flex items-center gap-1.5 text-[10px] text-slate-400">
                                                                <Building2 className="w-3 h-3 text-slate-400" />
                                                                <span>Borrowing #{index + 1}</span>
                                                            </div>
                                                        </td>

                                                        {/* Col 2: Category Dropdown */}
                                                        <td className="p-2.5 align-top">
                                                            <select
                                                                value={item.category}
                                                                onChange={e => handleUpdateRocLoan(item.id, 'category', e.target.value as RocLoanCategory)}
                                                                className="w-full text-xs font-semibold px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-2xs"
                                                            >
                                                                {ROC_LOAN_CATEGORIES.map(cat => (
                                                                    <option key={cat} value={cat}>{cat}</option>
                                                                ))}
                                                            </select>
                                                        </td>

                                                        {/* Col 3: Sanctioned Amount */}
                                                        <td className="p-2.5 align-top text-right min-w-[120px]">
                                                            <input
                                                                type="number"
                                                                step="any"
                                                                value={item.sanctionedAmount === 0 ? '' : item.sanctionedAmount}
                                                                onChange={e => handleUpdateRocLoan(item.id, 'sanctionedAmount', e.target.value)}
                                                                placeholder="0.00"
                                                                className="w-full text-xs font-mono text-right pr-2 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-2xs font-semibold"
                                                            />
                                                            <span className="text-[10px] font-mono block mt-0.5 text-slate-500">
                                                                ₹{Number(item.sanctionedAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                            </span>
                                                        </td>

                                                        {/* Col 4: Charge Creation Status Dropdown */}
                                                        <td className="p-2.5 align-top">
                                                            <select
                                                                value={item.chargeStatus}
                                                                onChange={e => handleUpdateRocLoan(item.id, 'chargeStatus', e.target.value as RocChargeStatus)}
                                                                className={`w-full text-xs font-bold px-2 py-1.5 rounded-lg border focus:outline-none shadow-2xs ${
                                                                    item.chargeStatus.includes('Created')
                                                                        ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                                                                        : item.chargeStatus.includes('Overdue')
                                                                        ? 'bg-rose-50 border-rose-300 text-rose-800'
                                                                        : item.chargeStatus.includes('Pending')
                                                                        ? 'bg-amber-50 border-amber-300 text-amber-800'
                                                                        : item.chargeStatus.includes('Satisfied')
                                                                        ? 'bg-blue-50 border-blue-300 text-blue-800'
                                                                        : 'bg-slate-50 border-slate-300 text-slate-700'
                                                                }`}
                                                            >
                                                                {ROC_CHARGE_STATUSES.map(st => (
                                                                    <option key={st} value={st}>{st}</option>
                                                                ))}
                                                            </select>
                                                            <span className="text-[10px] text-slate-400 block mt-0.5">
                                                                {item.chargeStatus.includes('Created') ? '✓ Form CHG-1 Registered' : item.chargeStatus.includes('Overdue') ? '⚠ Section 77(1) Breach' : 'MCA Status'}
                                                            </span>
                                                        </td>

                                                        {/* Col 5: MCA SRN / Ref */}
                                                        <td className="p-2.5 align-top">
                                                            <input
                                                                type="text"
                                                                value={item.mcaSrnOrChgNumber || ''}
                                                                onChange={e => handleUpdateRocLoan(item.id, 'mcaSrnOrChgNumber', e.target.value)}
                                                                placeholder="SRN: F..."
                                                                className="w-full text-xs font-mono px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-2xs"
                                                            />
                                                        </td>

                                                        {/* Col 6: Sec 269SS Check Dropdown */}
                                                        <td className="p-2.5 align-top">
                                                            <select
                                                                value={item.isCashReceipt ? 'cash' : 'bank'}
                                                                onChange={e => handleUpdateRocLoan(item.id, 'isCashReceipt', e.target.value === 'cash')}
                                                                className={`w-full text-xs font-bold px-2 py-1.5 rounded-lg border focus:outline-none shadow-2xs ${
                                                                    item.isCashReceipt && (item.sanctionedAmount >= 20000)
                                                                        ? 'bg-rose-50 border-rose-300 text-rose-800'
                                                                        : 'bg-slate-50 border-slate-200 text-slate-700'
                                                                }`}
                                                            >
                                                                <option value="bank">Banking Channel</option>
                                                                <option value="cash">Cash ≥ ₹20k (Violation)</option>
                                                            </select>
                                                        </td>

                                                        {/* Col 7: Remarks & Quick Presets */}
                                                        <td className="p-2.5 align-top space-y-1">
                                                            <input
                                                                type="text"
                                                                value={item.remarks || ''}
                                                                onChange={e => handleUpdateRocLoan(item.id, 'remarks', e.target.value)}
                                                                placeholder="Auditor observation..."
                                                                className="w-full text-xs px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-2xs"
                                                            />
                                                            <select
                                                                value=""
                                                                onChange={e => {
                                                                    if (e.target.value) {
                                                                        handleUpdateRocLoan(item.id, 'remarks', e.target.value);
                                                                    }
                                                                }}
                                                                className="w-full text-[11px] px-1.5 py-1 rounded border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 font-semibold focus:outline-none cursor-pointer"
                                                                title="Quick-Select Predefined Audit Comment"
                                                            >
                                                                <option value="" disabled>⚡ Presets...</option>
                                                                {STANDARD_ROC_AUDIT_COMMENTS.map((comm, cIdx) => (
                                                                    <option key={cIdx} value={comm}>{comm}</option>
                                                                ))}
                                                            </select>
                                                        </td>

                                                        {/* Col 8: Action Delete */}
                                                        <td className="p-2.5 align-middle text-center">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDeleteRocLoan(item.id)}
                                                                className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition cursor-pointer"
                                                                title="Delete borrowing record"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                        <tfoot>
                                            <tr className="bg-slate-900 text-white font-bold text-xs">
                                                <td className="p-3">FULL TOTAL ({rocLoansTotals.totalCount} BORROWINGS)</td>
                                                <td className="p-3 text-slate-300 text-[11px] font-normal">
                                                    {rocLoansTotals.createdCount} Charges Created · {rocLoansTotals.pendingCount} Pending · {rocLoansTotals.unsecuredCount} Unsecured
                                                </td>
                                                <td className="p-3 text-right font-mono text-emerald-300 text-sm">
                                                    ₹{rocLoansTotals.totalSanctioned.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </td>
                                                <td colSpan={2} className="p-3">
                                                    <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold inline-flex items-center gap-1 ${
                                                        rocLoansTotals.isFullyCompliant
                                                            ? 'bg-emerald-800 text-emerald-100'
                                                            : 'bg-amber-800 text-amber-100'
                                                    }`}>
                                                        {rocLoansTotals.isFullyCompliant ? '✓ All Charges Registered with MCA' : '⚠ Action Required: Pending Charges / Cash Violations'}
                                                    </span>
                                                </td>
                                                <td colSpan={3} className="p-3 text-right text-slate-400 text-[11px] font-normal">
                                                    Section 77(1) Companies Act &amp; Sec 269SS Verified
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>

                                {/* Quick Add Buttons Bar */}
                                <div className="flex items-center justify-between flex-wrap gap-2 pt-2">
                                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                        <span>Quick Add:</span>
                                        {ROC_LOAN_CATEGORIES.map(cat => (
                                            <button
                                                key={cat}
                                                type="button"
                                                onClick={() => handleAddRocLoan(cat)}
                                                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 border border-slate-200 font-semibold transition cursor-pointer text-[11px]"
                                            >
                                                + {cat}
                                            </button>
                                        ))}
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => handleAddRocLoan('Secured Term Loan')}
                                        className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                        <span>Add Borrowing Row</span>
                                    </button>
                                </div>

                                {/* Statutory Scrutiny Cards */}
                                <div className="pt-4 border-t border-slate-100 space-y-3">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                                        <ShieldAlert className="w-3.5 h-3.5 text-indigo-600" />
                                        <span>ROC Statutory Compliance Cards &amp; MCA Scrutiny Indicators</span>
                                    </h4>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                                        <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl">
                                            <span className="text-slate-500 font-bold uppercase tracking-wider block mb-1">Total Borrowings Monitored</span>
                                            <span className="text-lg font-bold font-mono text-slate-900">
                                                {verification?.rocLoans?.newLoansCount ?? 0} (₹{(verification?.rocLoans?.newLoansTotalAmount ?? 0).toLocaleString('en-IN')})
                                            </span>
                                            <p className="text-[11px] text-slate-500 mt-1">Cross-checked with bank sanction letters</p>
                                        </div>
                                        <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl">
                                            <span className="text-slate-500 font-bold uppercase tracking-wider block mb-1">Sec 269SS Cash Loans Violation</span>
                                            <span className={`text-lg font-bold font-mono ${
                                                (verification?.rocLoans?.cashLoansSec269SS_Count ?? 0) > 0 ? 'text-rose-700' : 'text-emerald-700'
                                            }`}>
                                                {verification?.rocLoans?.cashLoansSec269SS_Count ?? 0} Violations
                                            </span>
                                            <p className="text-[11px] text-slate-500 mt-1">Cash receipt ≥ ₹20,000 carries 100% equivalent penalty</p>
                                        </div>
                                        <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl">
                                            <span className="text-slate-500 font-bold uppercase tracking-wider block mb-1">Pending Form CHG-1 (&gt; 30 Days)</span>
                                            <span className={`text-lg font-bold font-mono ${
                                                (verification?.rocLoans?.formCHG1_PendingCount ?? 0) > 0 ? 'text-amber-700' : 'text-emerald-700'
                                            }`}>
                                                {verification?.rocLoans?.formCHG1_PendingCount ?? 0} Charges Pending
                                            </span>
                                            <p className="text-[11px] text-slate-500 mt-1">Must be registered within 30 days of creation u/s 77(1)</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 3.6 Cash 40A(3) & FA ITC View */}
                        {verificationSubTab === 'cash' && (
                            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-4">
                                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                                    3.6 Cash Compliance u/s 40A(3), Daily Negative Cash &amp; FA Additions
                                </h3>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                                    <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl">
                                        <span className="text-slate-500 font-bold uppercase tracking-wider block mb-1">Cash Paid &gt; ₹10,000 u/s 40A(3)</span>
                                        <span className="text-lg font-bold font-mono text-rose-700">
                                            {verification?.cashCompliance?.cashPaymentsExceeding10kCount ?? 0} (₹{(verification?.cashCompliance?.cashPaymentsExceeding10kAmount ?? 0).toLocaleString('en-IN')})
                                        </span>
                                    </div>
                                    <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl">
                                        <span className="text-slate-500 font-bold uppercase tracking-wider block mb-1">Negative Cash Balance Days</span>
                                        <span className="text-lg font-bold font-mono text-amber-700">{verification?.cashCompliance?.negativeCashDaysCount ?? 0} Days</span>
                                    </div>
                                    <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl">
                                        <span className="text-slate-500 font-bold uppercase tracking-wider block mb-1">Fixed Asset Ineligible ITC u/s 17(5)</span>
                                        <span className="text-lg font-bold font-mono text-rose-700">₹{(verification?.cashCompliance?.fixedAssetIneligibleItcAmount ?? 0).toLocaleString('en-IN')}</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 3.7 Labor Statutory Compliances vs Salary Sheets */}
                        {verificationSubTab === 'labor' && (
                            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-6">
                                <div className="flex items-center justify-between flex-wrap gap-2">
                                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                                        <ShieldCheck className="w-4 h-4 text-emerald-600" />
                                        <span>3.7 Labor Statutory Compliances vs Salary Sheets (PF / ESIC / PT)</span>
                                    </h3>
                                    {verification?.labor?.isPfDelayedSec36_1_va && (
                                        <span className="px-3 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 font-bold text-xs flex items-center gap-1.5">
                                            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                                            <span>Sec 36(1)(va) Permanent Disallowance</span>
                                        </span>
                                    )}
                                </div>

                                {/* Comparative Cards */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-xs">
                                    {/* PF */}
                                    <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl space-y-2.5">
                                        <span className="font-bold text-slate-900 text-sm block">Provident Fund (PF)</span>
                                        <div className="flex justify-between text-slate-600">
                                            <span>Employee Share (12%):</span>
                                            <span className="font-mono font-bold text-slate-900">₹{(verification?.labor?.pfEmployeeShareCalculated ?? 0).toLocaleString('en-IN')}</span>
                                        </div>
                                        <div className="flex justify-between text-slate-600">
                                            <span>Employer Share (12%):</span>
                                            <span className="font-mono font-bold text-slate-900">₹{(verification?.labor?.pfEmployerShareCalculated ?? 0).toLocaleString('en-IN')}</span>
                                        </div>
                                        <div className="flex justify-between text-slate-600">
                                            <span>Admin &amp; EDLI (1%):</span>
                                            <span className="font-mono font-bold text-slate-900">₹{(verification?.labor?.pfAdminEdliCalculated ?? 0).toLocaleString('en-IN')}</span>
                                        </div>
                                        <div className="pt-2 border-t border-slate-200 flex justify-between font-bold text-slate-900 text-sm">
                                            <span>Total PF Due:</span>
                                            <span className="font-mono text-emerald-700">₹{(verification?.labor?.pfTotalCalculated ?? 0).toLocaleString('en-IN')}</span>
                                        </div>
                                    </div>

                                    {/* ESIC */}
                                    <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl space-y-2.5">
                                        <span className="font-bold text-slate-900 text-sm block">Employee State Insurance (ESIC)</span>
                                        <div className="flex justify-between text-slate-600">
                                            <span>Employee Share (0.75%):</span>
                                            <span className="font-mono font-bold text-slate-900">₹{(verification?.labor?.esicEmployeeShareCalculated ?? 0).toLocaleString('en-IN')}</span>
                                        </div>
                                        <div className="flex justify-between text-slate-600">
                                            <span>Employer Share (3.25%):</span>
                                            <span className="font-mono font-bold text-slate-900">₹{(verification?.labor?.esicEmployerShareCalculated ?? 0).toLocaleString('en-IN')}</span>
                                        </div>
                                        <div className="pt-2 border-t border-slate-200 flex justify-between font-bold text-slate-900 text-sm">
                                            <span>Total ESIC Due:</span>
                                            <span className="font-mono text-emerald-700">₹{(verification?.labor?.esicTotalCalculated ?? 0).toLocaleString('en-IN')}</span>
                                        </div>
                                    </div>

                                    {/* PT */}
                                    <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl space-y-2.5">
                                        <span className="font-bold text-slate-900 text-sm block">Professional Tax (PT)</span>
                                        <div className="flex justify-between text-slate-600">
                                            <span>PT Slab Deductions:</span>
                                            <span className="font-mono font-bold text-slate-900">₹{(verification?.labor?.ptDeductedCalculated ?? 0).toLocaleString('en-IN')}</span>
                                        </div>
                                        <div className="pt-2 border-t border-slate-200 flex justify-between font-bold text-slate-900 text-sm">
                                            <span>Total PT Due:</span>
                                            <span className="font-mono text-emerald-700">₹{(verification?.labor?.ptDeductedCalculated ?? 0).toLocaleString('en-IN')}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Section 36(1)(va) Due Date Scrutiny Banner */}
                                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                                    <span className="font-bold text-slate-900 block">Deposit Deadlines vs Actual Challan Deposit Dates (Sec 36(1)(va))</span>
                                    <p className="text-slate-600 text-[11px] leading-relaxed">
                                        As per Supreme Court ruling in <em>Checkmate Services P. Ltd</em>, employee contributions to PF/ESIC deposited after the 15th of the succeeding month are permanently disallowed as expenses and cannot be allowed even if paid before the ITR filing due date.
                                    </p>
                                    {(verification?.labor?.permanentDisallowanceExposure ?? 0) > 0 && (
                                        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 font-bold text-rose-800">
                                            Exposure Identified: ₹{(verification?.labor?.permanentDisallowanceExposure ?? 0).toLocaleString('en-IN')} permanently disallowed u/s 36(1)(va).
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ─── TAB 4: Current Period Observations ─────────────────────────── */}
                {activeTab === 'observations' && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                            <div>
                                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                                    4. Current Period Audit Observations &amp; Deficiencies
                                </h2>
                                <p className="text-xs text-slate-500">
                                    Categorized audit observations with risk severity, financial exposures, and management responses.
                                </p>
                            </div>

                            {/* Observation KPI Badges */}
                            <div className="flex items-center gap-1.5 flex-wrap text-xs">
                                <span className="px-2.5 py-1 rounded-xl bg-slate-100 text-slate-700 font-bold border border-slate-200">
                                    Total: {observations.length}
                                </span>
                                {observations.filter(o => o.severity === 'Critical').length > 0 && (
                                    <span className="px-2.5 py-1 rounded-xl bg-rose-50 text-rose-700 font-bold border border-rose-200">
                                        Critical: {observations.filter(o => o.severity === 'Critical').length}
                                    </span>
                                )}
                                {observations.filter(o => o.severity === 'High').length > 0 && (
                                    <span className="px-2.5 py-1 rounded-xl bg-orange-50 text-orange-700 font-bold border border-orange-200">
                                        High: {observations.filter(o => o.severity === 'High').length}
                                    </span>
                                )}
                                {observations.filter(o => o.severity === 'Medium').length > 0 && (
                                    <span className="px-2.5 py-1 rounded-xl bg-amber-50 text-amber-700 font-bold border border-amber-200">
                                        Medium: {observations.filter(o => o.severity === 'Medium').length}
                                    </span>
                                )}
                                {observations.reduce((acc, o) => acc + (Number(o.financialExposure) || 0), 0) > 0 && (
                                    <span className="px-2.5 py-1 rounded-xl bg-rose-100/70 text-rose-900 font-mono font-bold border border-rose-300">
                                        Total Exposure: ₹{observations.reduce((acc, o) => acc + (Number(o.financialExposure) || 0), 0).toLocaleString('en-IN')}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* ─── Horizontal Line Data Entry Bar (No Popup, Direct Inline Input) ─── */}
                        {isJuniorAllowedToEdit ? (
                            <div className="bg-white rounded-2xl border-2 border-indigo-200/90 shadow-xs p-3.5 space-y-2.5 transition">
                                <div className="flex items-center justify-between text-xs">
                                    <div className="flex items-center gap-2">
                                        <div className="p-1 rounded-md bg-indigo-50 text-indigo-700">
                                            <AlertTriangle className="w-4 h-4" />
                                        </div>
                                        <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                                            Record Observation (Horizontal Entry Line)
                                        </span>
                                    </div>
                                    <span className="text-[11px] text-slate-400 font-medium hidden sm:inline">
                                        Fill details in this horizontal line &amp; press <strong className="text-slate-700">Enter</strong> or click <strong className="text-indigo-600 font-bold">Record</strong>
                                    </span>
                                </div>

                                {/* The Horizontal Line Input Form */}
                                <form
                                    onSubmit={(e) => {
                                        e.preventDefault();
                                        handleAddObservation();
                                    }}
                                    className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-12 gap-2 items-end"
                                >
                                    {/* 1. Section (lg:col-span-2) */}
                                    <div className="lg:col-span-2 space-y-1">
                                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                            Section / Area
                                        </label>
                                        <select
                                            value={newObs.sectionKey}
                                            onChange={(e) => setNewObs(prev => ({ ...prev, sectionKey: e.target.value }))}
                                            className="w-full bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 rounded-xl px-2.5 py-2 text-xs text-slate-900 font-medium focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition cursor-pointer"
                                        >
                                            <option value="sales">3.1 Sales (Reco R1)</option>
                                            <option value="purchase">3.2 Purchase (Reco 2B)</option>
                                            <option value="journal">3.3 TDS Working</option>
                                            <option value="bank">3.4 Bank &amp; Loans</option>
                                            <option value="roc">3.5 ROC Charges</option>
                                            <option value="cash">3.6 Cash &amp; Fixed Assets</option>
                                            <option value="labor">4.1 Labor Compliances</option>
                                            <option value="general">4.2 General / Governance</option>
                                        </select>
                                    </div>

                                    {/* 2. Severity (lg:col-span-1) */}
                                    <div className="lg:col-span-1 space-y-1">
                                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                            Severity
                                        </label>
                                        <select
                                            value={newObs.severity}
                                            onChange={(e) => setNewObs(prev => ({ ...prev, severity: e.target.value as any }))}
                                            className={`w-full border rounded-xl px-2 py-2 text-xs font-bold focus:outline-none transition cursor-pointer ${
                                                newObs.severity === 'Critical' ? 'bg-rose-50 text-rose-700 border-rose-300' :
                                                newObs.severity === 'High' ? 'bg-orange-50 text-orange-700 border-orange-300' :
                                                newObs.severity === 'Medium' ? 'bg-amber-50 text-amber-700 border-amber-300' :
                                                'bg-emerald-50 text-emerald-700 border-emerald-300'
                                            }`}
                                        >
                                            <option value="Critical">Critical</option>
                                            <option value="High">High</option>
                                            <option value="Medium">Medium</option>
                                            <option value="Low">Low</option>
                                        </select>
                                    </div>

                                    {/* 3. Title (lg:col-span-3) */}
                                    <div className="lg:col-span-3 space-y-1">
                                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                            Observation Title <span className="text-rose-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={newObs.title}
                                            onChange={(e) => setNewObs(prev => ({ ...prev, title: e.target.value }))}
                                            placeholder="e.g. Ineligible ITC on motor car / Missing GSTIN..."
                                            className="w-full bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 rounded-xl px-2.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                                        />
                                    </div>

                                    {/* 4. Description (lg:col-span-3) */}
                                    <div className="lg:col-span-3 space-y-1">
                                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                            Finding Details / Description
                                        </label>
                                        <input
                                            type="text"
                                            value={newObs.description}
                                            onChange={(e) => setNewObs(prev => ({ ...prev, description: e.target.value }))}
                                            placeholder="Specific voucher, contravention or shortfall detail..."
                                            className="w-full bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 rounded-xl px-2.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                                        />
                                    </div>

                                    {/* 5. Financial Exposure (lg:col-span-1) */}
                                    <div className="lg:col-span-1 space-y-1">
                                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                            Exposure (₹)
                                        </label>
                                        <input
                                            type="number"
                                            value={newObs.financialExposure || ''}
                                            onChange={(e) => setNewObs(prev => ({ ...prev, financialExposure: Number(e.target.value) || 0 }))}
                                            placeholder="0"
                                            className="w-full bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 rounded-xl px-2 py-2 text-xs text-slate-900 font-mono text-right focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        />
                                    </div>

                                    {/* 6. Recommendation + Add Button (lg:col-span-2) */}
                                    <div className="lg:col-span-2 space-y-1">
                                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                            Suggested Action / Reco
                                        </label>
                                        <div className="flex items-center gap-1.5">
                                            <input
                                                type="text"
                                                value={newObs.auditorRecommendation}
                                                onChange={(e) => setNewObs(prev => ({ ...prev, auditorRecommendation: e.target.value }))}
                                                placeholder="Action recommended..."
                                                className="w-full bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 rounded-xl px-2.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                                            />
                                            <button
                                                type="submit"
                                                className="shrink-0 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition flex items-center gap-1 cursor-pointer"
                                                title="Record Observation (or press Enter)"
                                            >
                                                <Plus className="w-3.5 h-3.5" />
                                                <span className="hidden sm:inline">Record</span>
                                            </button>
                                        </div>
                                    </div>
                                </form>
                            </div>
                        ) : (
                            <div className="bg-slate-50 rounded-2xl border border-slate-200 p-3 text-xs text-slate-500 flex items-center gap-2">
                                <Lock className="w-4 h-4 text-slate-400" />
                                <span>Observations are locked because this audit period is currently in senior review or has been released.</span>
                            </div>
                        )}

                        {/* Observations List */}
                        <div className="space-y-3">
                            {observations.length === 0 ? (
                                <div className="bg-white rounded-2xl border border-slate-200/80 p-8 text-center text-xs text-slate-500 shadow-xs">
                                    No observations recorded for this month. Use the horizontal line above to record observations.
                                </div>
                            ) : (
                                (observations || []).map(obs => (
                                    <div key={obs.id} className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-3 text-xs">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono ${
                                                        obs.severity === 'Critical' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                                                        obs.severity === 'High' ? 'bg-orange-50 text-orange-700 border border-orange-200' :
                                                        obs.severity === 'Medium' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                                                        'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                    }`}>
                                                        {obs.severity}
                                                    </span>
                                                    <span className="text-slate-400 font-mono text-[11px]">{obs.sectionKey.toUpperCase()}</span>
                                                    <h3 className="text-sm font-bold text-slate-900">{obs.title}</h3>
                                                </div>
                                                <p className="text-slate-600 text-xs leading-relaxed">{obs.description}</p>
                                            </div>

                                            <div className="flex items-center gap-2 shrink-0">
                                                <button
                                                    type="button"
                                                    onClick={() => handlePromoteToPendingPoint(obs)}
                                                    className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold transition cursor-pointer"
                                                    title="Push to Cross-Month Work Pending List"
                                                >
                                                    Promote to Pending Point
                                                </button>
                                                {isJuniorAllowedToEdit && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteObservation(obs.id)}
                                                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3 border-t border-slate-100 text-[11px]">
                                            <div>
                                                <span className="text-slate-400 font-semibold block mb-0.5">Financial Exposure</span>
                                                <span className="font-bold font-mono text-rose-700">₹{(obs.financialExposure ?? 0).toLocaleString('en-IN')}</span>
                                            </div>
                                            <div>
                                                <span className="text-slate-400 font-semibold block mb-0.5">Auditor Recommendation</span>
                                                <span className="text-slate-700">{obs.auditorRecommendation}</span>
                                            </div>
                                            <div>
                                                <span className="text-slate-400 font-semibold block mb-0.5">Management Response</span>
                                                {isJuniorAllowedToEdit ? (
                                                    <input
                                                        type="text"
                                                        defaultValue={obs.managementResponse || ''}
                                                        onBlur={(e) => handleUpdateObservationResponse(obs.id, e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                                (e.target as HTMLInputElement).blur();
                                                            }
                                                        }}
                                                        placeholder="Type client / management response..."
                                                        className="w-full bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-700 italic focus:outline-none focus:border-indigo-500 transition text-[11px]"
                                                    />
                                                ) : (
                                                    <span className="text-slate-600 italic">{obs.managementResponse || 'Pending Client Input'}</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}

                {/* ─── TAB 5: Previous Audit Pending Points ────────────────────────── */}
                {activeTab === 'pending' && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                            <div>
                                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                                    5.1 Previous Audit Pending Points Tracker (Work Pending List)
                                </h2>
                                <p className="text-xs text-slate-500">
                                    Cross-month unresolved queries and compliance continuity modeled on CA firm tracker.
                                </p>
                            </div>

                            {/* Filter Chips */}
                            <div className="flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-xl p-1 text-xs font-semibold">
                                {(['All', 'Pending', 'In Progress', 'Cleared'] as const).map(f => (
                                    <button
                                        key={f}
                                        type="button"
                                        onClick={() => setPendingFilter(f)}
                                        className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                                            pendingFilter === f
                                                ? 'bg-white text-slate-900 shadow-xs font-bold'
                                                : 'text-slate-600 hover:text-slate-900'
                                        }`}
                                    >
                                        {f}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Pending Points List */}
                        <div className="space-y-3">
                            {(pendingPoints || [])
                                .filter(p => pendingFilter === 'All' || p.status === pendingFilter)
                                .map(point => (
                                    <div key={point.id} className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-3 text-xs">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono ${
                                                        point.status === 'Cleared'
                                                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                            : point.status === 'In Progress'
                                                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                                                    }`}>
                                                        {point.status}
                                                    </span>
                                                    <span className="text-slate-400 font-mono text-[11px]">{point.originMonth} {point.originFy}</span>
                                                    <h3 className="text-sm font-bold text-slate-900">{point.pointTitle}</h3>
                                                </div>
                                                <p className="text-slate-600 text-xs leading-relaxed">{point.pointDescription}</p>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setSelectedPendingPoint(point);
                                                    setResolveStatus(point.status === 'Cleared' ? 'Cleared' : 'In Progress');
                                                    setResolveRemarks(point.resolutionRemarks || '');
                                                    setResolveModalOpen(true);
                                                }}
                                                className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-xs font-bold transition shadow-2xs cursor-pointer"
                                            >
                                                Update Status
                                            </button>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-3 border-t border-slate-100 text-[11px]">
                                            <div>
                                                <span className="text-slate-400 font-semibold block mb-0.5">Assigned To</span>
                                                <span className="text-slate-900 font-medium">{point.assignedTo || 'Unassigned'}</span>
                                            </div>
                                            <div>
                                                <span className="text-slate-400 font-semibold block mb-0.5">Target Date</span>
                                                <span className="text-slate-700 font-mono">{point.targetDate || 'Immediate'}</span>
                                            </div>
                                            <div>
                                                <span className="text-slate-400 font-semibold block mb-0.5">Resolution Remarks</span>
                                                <span className="text-slate-600 italic">{point.resolutionRemarks || 'Open'}</span>
                                            </div>
                                            <div>
                                                <span className="text-slate-400 font-semibold block mb-0.5">Resolution Trail</span>
                                                <span className="text-emerald-700 font-semibold">
                                                    {point.status === 'Cleared' ? `Cleared in ${point.resolvedInMonth} by ${point.verifiedBy}` : 'Pending Action'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                        </div>
                    </div>
                )}
            </main>

            {/* ─── Modal 0: Submit for Senior Review Modal (Junior -> Senior Selection with Firebase Cloud Sync) ─── */}
            {submitReviewModalOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white border border-slate-200 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <div className="flex items-center gap-2.5">
                                <div className="p-2 bg-gradient-to-br from-amber-500 to-orange-600 text-white rounded-xl shadow-xs">
                                    <Cloud className="w-5 h-5 text-white" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-slate-900">Submit for Senior Partner Review</h3>
                                    <p className="text-xs text-slate-500">Firebase Cloud Remote Maker-Checker Submission</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSubmitReviewModalOpen(false)}
                                className="text-slate-400 hover:text-slate-600 cursor-pointer p-1 rounded-lg hover:bg-slate-100 transition"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-3.5 text-xs">
                            {/* Client & Period Header Card */}
                            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                                <div>
                                    <span className="text-[10px] uppercase font-bold text-slate-400">Client &amp; Period</span>
                                    <div className="font-bold text-slate-900">{activeClient.legalName}</div>
                                    <div className="text-[11px] text-slate-500 font-mono">{selectedClientGstin} | {selectedMonth} {selectedFy}</div>
                                </div>
                                <div className="text-right">
                                    <span className="text-[10px] uppercase font-bold text-slate-400">Total Observations</span>
                                    <div className="font-bold text-amber-700">{observations.length} Findings</div>
                                </div>
                            </div>

                            {/* Senior Selection Dropdown */}
                            <div>
                                <label className="block text-slate-700 font-bold mb-1">
                                    Select Senior CA Reviewer / Partner: <span className="text-rose-500">*</span>
                                </label>
                                <select
                                    value={selectedSenior}
                                    onChange={(e) => setSelectedSenior(e.target.value)}
                                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                                >
                                    {availableSeniorOptions.length > 0 ? (
                                        availableSeniorOptions.map((opt) => (
                                            <option key={opt} value={opt}>{opt}</option>
                                        ))
                                    ) : (
                                        <option value="" disabled>-- No Senior Auditors Configured --</option>
                                    )}
                                    <option value="__custom__">➕ Custom Senior Partner / Manager...</option>
                                </select>

                                {selectedSenior === '__custom__' && (
                                    <input
                                        type="text"
                                        value={customSeniorName}
                                        onChange={(e) => setCustomSeniorName(e.target.value)}
                                        placeholder="Enter Senior CA / Partner Full Name"
                                        className="mt-2 w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                                    />
                                )}
                            </div>

                            {/* Junior Name & Priority */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-slate-700 font-semibold mb-1">Prepared By (Junior Article):</label>
                                    <input
                                        type="text"
                                        value={auditHeader.preparedBy || ''}
                                        onChange={(e) => setAuditHeader(prev => ({ ...prev, preparedBy: e.target.value }))}
                                        placeholder="Junior Article Name"
                                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-slate-700 font-semibold mb-1">Review Urgency:</label>
                                    <select
                                        value={reviewPriority}
                                        onChange={(e) => setReviewPriority(e.target.value as any)}
                                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                                    >
                                        <option value="Normal">🟢 Standard Review</option>
                                        <option value="High">🟠 High Priority (Variances)</option>
                                        <option value="Urgent (GST Deadline)">🔴 Urgent (GST 20th Filing Deadline)</option>
                                    </select>
                                </div>
                            </div>

                            {/* Handover Scrutiny Notes */}
                            <div>
                                <label className="block text-slate-700 font-semibold mb-1">
                                    Handover Notes &amp; Specific Areas for Partner Attention:
                                </label>
                                <textarea
                                    rows={3}
                                    value={submissionNotes}
                                    onChange={(e) => setSubmissionNotes(e.target.value)}
                                    placeholder="e.g. Sales Reco 12M checked with Books; DRC-01B variance of ₹90k observed in October; 2B missing credits listed in OBS-01; please verify before final sign-off."
                                    className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
                                />

                                {/* Quick Presets */}
                                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                    <span className="text-[10px] text-slate-400 font-semibold">Quick Presets:</span>
                                    {[
                                        'All 5 registers vouching completed with zero discrepancies.',
                                        'DRC-01B sales tax variance requires partner review.',
                                        'Inward 2B missing ITC flagged to management.',
                                        'Schedule III P&L numbers cross-verified with client trial balance.'
                                    ].map((preset) => (
                                        <button
                                            key={preset}
                                            type="button"
                                            onClick={() => setSubmissionNotes(prev => prev ? `${prev}\n• ${preset}` : `• ${preset}`)}
                                            className="text-[10px] bg-slate-100 hover:bg-amber-50 hover:text-amber-800 text-slate-600 px-2 py-0.5 rounded-lg border border-slate-200 transition cursor-pointer"
                                        >
                                            + {preset.slice(0, 32)}...
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Remote Notice */}
                            <div className="p-2.5 bg-amber-50/70 border border-amber-200/80 rounded-xl flex items-start gap-2 text-[11px] text-amber-900">
                                <Cloud className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                <span>
                                    Submitting will instantly broadcast this working paper to <strong>Firebase Cloud</strong>. The selected Senior Partner will receive a real-time alert and can review and approve remotely from any device.
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                            <button
                                type="button"
                                onClick={() => setSubmitReviewModalOpen(false)}
                                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmSubmitForReview}
                                disabled={isSubmittingCloud}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white transition shadow-sm cursor-pointer disabled:opacity-50"
                            >
                                {isSubmittingCloud ? (
                                    <>
                                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                        <span>Broadcasting to Firebase...</span>
                                    </>
                                ) : (
                                    <>
                                        <Send className="w-3.5 h-3.5" />
                                        <span>Confirm &amp; Submit to Senior</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Modal 1: Request Revision Modal (Senior) ──────────────────────── */}
            {revisionModalOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white border border-slate-200 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <div className="flex items-center gap-2.5">
                                <div className="p-2 bg-gradient-to-br from-rose-500 to-red-600 text-white rounded-xl shadow-xs">
                                    <AlertCircle className="w-5 h-5 text-white" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-slate-900">Request Working Paper Revision</h3>
                                    <p className="text-xs text-slate-500">Provide structured comments &amp; instructions for the Junior Article</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setRevisionModalOpen(false)}
                                className="text-slate-400 hover:text-slate-600 cursor-pointer p-1 rounded-lg hover:bg-slate-100 transition"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-3.5 text-xs">
                            {/* Target Section & Severity Controls */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-slate-700 font-bold mb-1">Target Section:</label>
                                    <select
                                        value={revisionSection}
                                        onChange={(e) => setRevisionSection(e.target.value)}
                                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
                                    >
                                        <option value="General Scrutiny / Overall Working Paper">General Scrutiny / Overall</option>
                                        <option value="3.1 Sales Reco (Books vs GSTR-1 vs 3B)">3.1 Sales Reco &amp; Turnover</option>
                                        <option value="3.2 Purchase Reco (Books vs GSTR-2B)">3.2 Purchase Reco &amp; 2B ITC</option>
                                        <option value="3.3 TDS Working & Form 26Q">3.3 TDS Working</option>
                                        <option value="3.4 Bank Statements, BRS & AIS/26AS">3.4 Bank Statements &amp; AIS</option>
                                        <option value="3.5 New Loans & ROC Charges CHG-1/4">3.5 Loans &amp; ROC Charges</option>
                                        <option value="3.6 Cash 40A(3) Compliance & Negative Cash">3.6 Cash 40A(3) Compliance</option>
                                        <option value="4.1 PF, ESIC & PT Salary Compliances">4.1 PF, ESIC &amp; PT Deadlines</option>
                                        <option value="4.2 Categorized Audit Observations">4.2 Audit Observations</option>
                                        <option value="5.1 Previous Pending Points">5.1 Pending Points Tracker</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-slate-700 font-bold mb-1">Query Severity:</label>
                                    <select
                                        value={revisionSeverity}
                                        onChange={(e) => setRevisionSeverity(e.target.value as any)}
                                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
                                    >
                                        <option value="Mandatory Fix">🔴 Mandatory Rectification</option>
                                        <option value="Clarification">🟠 Clarification / Vouchers Needed</option>
                                        <option value="Advisory">🟡 Advisory / Client Recommendation</option>
                                    </select>
                                </div>
                            </div>

                            {/* Detailed Instructions Editor */}
                            <div>
                                <label className="block text-slate-700 font-bold mb-1">
                                    Review Instructions &amp; Action Items for Junior: <span className="text-rose-500">*</span>
                                </label>
                                <textarea
                                    rows={4}
                                    value={revisionNotes}
                                    onChange={(e) => setRevisionNotes(e.target.value)}
                                    placeholder="Enter point-by-point instructions for the junior auditor (e.g. • Purchase 2B missing ITC bills must be verified. • Cash payment over ₹10k needs PAN declaration)..."
                                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-xs text-slate-900 focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 resize-none font-mono"
                                />

                                {/* Quick Presets for Senior */}
                                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                    <span className="text-[10px] text-slate-400 font-semibold">Quick Query Presets:</span>
                                    {[
                                        'Inward 2B missing ITC requires vendor tax invoices before claim.',
                                        'Cash payment exceeding ₹10,000 u/s 40A(3) requires justification.',
                                        'DRC-01B turnover variance between Books & GSTR-1 requires reconciliation.',
                                        'PF deposit past 15th flagged for Section 36(1)(va) disallowance.',
                                        'Bank reconciliation statement (BRS) missing supporting confirmation.'
                                    ].map((preset) => (
                                        <button
                                            key={preset}
                                            type="button"
                                            onClick={() => setRevisionNotes(prev => prev ? `${prev}\n• ${preset}` : `• ${preset}`)}
                                            className="text-[10px] bg-slate-100 hover:bg-rose-50 hover:text-rose-800 text-slate-600 px-2 py-0.5 rounded-lg border border-slate-200 transition cursor-pointer"
                                        >
                                            + {preset.slice(0, 32)}...
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-[11px] text-rose-900">
                                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                                <span>
                                    Sending this revision request will automatically update Firebase Cloud, alert the Junior Article, and <strong>unlock the working papers</strong> for data corrections.
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                            <button
                                type="button"
                                onClick={() => setRevisionModalOpen(false)}
                                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-semibold hover:bg-slate-200 cursor-pointer transition"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleRequestRevision}
                                disabled={!revisionNotes.trim()}
                                className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 shadow-sm cursor-pointer disabled:opacity-50 transition"
                            >
                                Send Revision Request
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Modal 1.5: Senior Review Requests Hub (Pending Queue Inbox) ───── */}
            {seniorQueueModalOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white border border-slate-200 rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
                        {/* Header */}
                        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-gradient-to-br from-amber-500 to-orange-600 text-white rounded-xl shadow-xs">
                                    <Inbox className="w-5 h-5 text-white" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-base font-bold text-slate-900">Senior Review Requests Hub</h3>
                                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                                            {pendingReviewsQueue.length} Pending
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-500">
                                        Audits submitted by Junior Articles awaiting senior partner review &amp; sign-off
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSeniorQueueModalOpen(false)}
                                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Search & Senior Filter Toolbar */}
                        <div className="p-3 border-b border-slate-100 bg-white space-y-2.5">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div className="flex items-center gap-2">
                                    <UserCheck className="w-4 h-4 text-indigo-600 shrink-0" />
                                    <span className="text-xs font-bold text-slate-700">Filter By Assigned Senior:</span>
                                    <select
                                        value={activeSeniorReviewer}
                                        onChange={(e) => setActiveSeniorReviewer(e.target.value)}
                                        className="bg-indigo-50/70 border border-indigo-200 text-indigo-950 text-xs font-bold rounded-lg px-2.5 py-1 focus:outline-none cursor-pointer"
                                    >
                                        <option value="ALL">🌟 All Senior Partners (Firm Wide)</option>
                                        {availableSeniorOptions.map(opt => (
                                            <option key={opt} value={opt}>{opt}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="text-xs font-semibold text-slate-500">
                                    {pendingReviewsQueue.length} Audit{pendingReviewsQueue.length === 1 ? '' : 's'} Pending Sign-Off
                                </div>
                            </div>
                            <input
                                type="text"
                                value={queueSearchQuery}
                                onChange={(e) => setQueueSearchQuery(e.target.value)}
                                placeholder="Filter pending reviews by client name, GSTIN, period or article..."
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>

                        {/* Content Body */}
                        <div className="p-5 overflow-y-auto space-y-3.5 flex-1 bg-slate-50/30">
                            {(() => {
                                const q = queueSearchQuery.toLowerCase().trim();
                                const filtered = pendingReviewsQueue.filter(item => {
                                    if (activeSeniorReviewer !== 'ALL') {
                                        if (!isSeniorAssigned(item.reviewedBy, activeSeniorReviewer)) return false;
                                    }
                                    if (!q) return true;
                                    return (item.clientName || '').toLowerCase().includes(q) ||
                                        (item.clientGstin || '').toLowerCase().includes(q) ||
                                        (item.month || '').toLowerCase().includes(q) ||
                                        (item.preparedBy || '').toLowerCase().includes(q) ||
                                        (item.reviewedBy || '').toLowerCase().includes(q);
                                });

                                if (filtered.length === 0) {
                                    return (
                                        <div className="py-12 text-center space-y-3">
                                            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-200">
                                                <FileCheck2 className="w-6 h-6" />
                                            </div>
                                            <div className="font-bold text-slate-700 text-sm">
                                                {pendingReviewsQueue.length === 0 ? 'All Caught Up! No Pending Reviews' : 'No matching audits found'}
                                            </div>
                                            <p className="text-xs text-slate-400 max-w-sm mx-auto">
                                                {pendingReviewsQueue.length === 0
                                                    ? 'When Junior Articles submit monthly audits for your review via Firebase Cloud, they will appear here instantly.'
                                                    : 'Try adjusting your search query filter.'}
                                            </p>
                                        </div>
                                    );
                                }

                                return filtered.map((item) => {
                                    const { targetGstin, targetFy, targetMonth, targetClientName } = resolveAuditIdentifiers(item);
                                    return (
                                    <div
                                        key={item.id}
                                        className="bg-white border border-slate-200 hover:border-amber-300 rounded-2xl p-4 shadow-2xs hover:shadow-sm transition space-y-3"
                                    >
                                        <div className="flex items-start justify-between flex-wrap gap-2">
                                            <div>
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="font-bold text-slate-900 text-sm">
                                                        {targetGstin ? (item.clientName || targetClientName) : (
                                                            <span className="text-amber-800 flex items-center gap-1.5">
                                                                <span>{item.clientName || 'Unassigned Client'}</span>
                                                                <span className="text-[10px] font-bold text-amber-700 bg-amber-100 border border-amber-300 px-1.5 py-0.5 rounded-md">
                                                                    No Client Master
                                                                </span>
                                                            </span>
                                                        )}
                                                    </span>
                                                    <span className={`font-mono text-[11px] px-2 py-0.5 rounded-lg border ${
                                                        targetGstin
                                                            ? 'text-slate-500 bg-slate-100 border-slate-200'
                                                            : 'text-amber-800 bg-amber-50 border-amber-300 font-semibold'
                                                    }`}>
                                                        {targetGstin || 'No GSTIN'}
                                                    </span>
                                                    <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-lg">
                                                        {item.month || targetMonth} {item.fy || targetFy}
                                                    </span>
                                                </div>
                                                <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                                                    <span>Submitted by Article: <strong className="text-slate-800">{item.preparedBy || 'Junior Article'}</strong></span>
                                                    <span>•</span>
                                                    <span>Assigned to: <strong className="text-indigo-900">{item.reviewedBy || 'Senior Partner'}</strong></span>
                                                    {item.preparedAt && (
                                                        <>
                                                            <span>•</span>
                                                            <span className="text-slate-400">{new Date(item.preparedAt).toLocaleDateString()}</span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                                    item.priority?.includes('Urgent')
                                                        ? 'bg-rose-100 text-rose-800 border border-rose-200 animate-pulse'
                                                        : item.priority?.includes('High')
                                                        ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                                        : 'bg-slate-100 text-slate-700'
                                                }`}>
                                                    {item.priority || 'Normal Priority'}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Handover Note */}
                                        {item.submissionNotes && (
                                            <div className="text-xs text-amber-950 bg-amber-50/70 border border-amber-200 rounded-xl p-2.5">
                                                <span className="font-bold text-amber-900">Junior Article Note: </span>
                                                <span>{item.submissionNotes}</span>
                                            </div>
                                        )}

                                        {/* Warning for audits submitted before client creation */}
                                        {(!targetGstin || item.clientName === 'No Client Selected') && (
                                            <div className="text-xs bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-2.5 flex items-center justify-between gap-2 flex-wrap">
                                                <div className="flex items-center gap-2">
                                                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                                                    <span>This draft was submitted without selecting a client. Add a client to review, or dismiss this entry.</span>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setSeniorQueueModalOpen(false);
                                                        setIsAddClientModalOpen(true);
                                                    }}
                                                    className="text-xs font-bold text-indigo-700 hover:text-indigo-900 underline cursor-pointer"
                                                >
                                                    + Add Client Now
                                                </button>
                                            </div>
                                        )}

                                        {/* Metrics and Action Footer */}
                                        <div className="flex items-center justify-between pt-2 border-t border-slate-100 flex-wrap gap-2 text-xs">
                                            <div className="flex items-center gap-3 text-slate-600">
                                                <span>Total Findings: <strong className="text-slate-900">{item.observationsCount || 0}</strong></span>
                                                {Number(item.criticalObsCount || 0) > 0 && (
                                                    <span className="text-rose-700 font-bold">Critical: {item.criticalObsCount}</span>
                                                )}
                                                {Number(item.turnoverVariance || 0) !== 0 && (
                                                    <span className="text-amber-700">Turnover Diff: ₹{Math.abs(item.turnoverVariance || 0).toLocaleString('en-IN')}</span>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => handleDismissCloudAudit(item)}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 shadow-2xs cursor-pointer transition active:scale-95"
                                                    title="Dismiss or delete this invalid request from review inbox"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                    <span>Dismiss</span>
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => handleDirectAcceptAndApprove(item)}
                                                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs cursor-pointer transition active:scale-95"
                                                    title="Accept audit and immediately sign off in cloud & local database"
                                                >
                                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                                    <span>Accept &amp; Sign-Off</span>
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => handleAcceptAndReview(item)}
                                                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 shadow-2xs cursor-pointer transition active:scale-95"
                                                    title="Open working papers in Senior Review mode to inspect substantive verifications"
                                                >
                                                    <Eye className="w-3.5 h-3.5" />
                                                    <span>Open &amp; Review</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            });
                        })()}
                        </div>

                        {/* Footer */}
                        <div className="p-3 border-t border-slate-100 bg-white flex justify-end">
                            <button
                                type="button"
                                onClick={() => setSeniorQueueModalOpen(false)}
                                className="px-4 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Modal 2: Release to Client Modal ──────────────────────────────── */}
            {releaseModalOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
                        <div className="flex items-center justify-between">
                            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                <Send className="w-5 h-5 text-indigo-600" />
                                <span>Release Working Paper to Client</span>
                            </h3>
                            <button type="button" onClick={() => setReleaseModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <p className="text-xs text-slate-500 leading-relaxed">
                            Releasing will auto-save the official Zero-Merge Excel report to the client's <strong>Released to Client</strong> folder and stamp the audit sign-off.
                        </p>

                        <div className="space-y-2 text-xs">
                            <label className="block text-slate-700 font-semibold">Release Channel:</label>
                            <div className="grid grid-cols-3 gap-2">
                                {(['Directory', 'WhatsApp', 'Email'] as const).map(c => (
                                    <button
                                        key={c}
                                        type="button"
                                        onClick={() => setReleaseChannel(c)}
                                        className={`py-2 px-3 rounded-xl border font-bold text-xs transition cursor-pointer ${
                                            releaseChannel === c
                                                ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                                                : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                                        }`}
                                    >
                                        {c}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setReleaseModalOpen(false)}
                                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-semibold hover:bg-slate-200"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleReleaseToClient}
                                className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-600 text-white text-xs font-bold hover:from-indigo-500 hover:to-indigo-500 shadow-md shadow-indigo-200"
                            >
                                Confirm &amp; Release
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Modal 4: Resolve Pending Point Modal ──────────────────────────── */}
            {resolveModalOpen && selectedPendingPoint && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
                        <div className="flex items-center justify-between">
                            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                <Clock className="w-5 h-5 text-indigo-600" />
                                <span>Update Pending Action Item</span>
                            </h3>
                            <button type="button" onClick={() => setResolveModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-3 text-xs">
                            <div>
                                <span className="text-slate-500 font-semibold block mb-0.5">Point:</span>
                                <span className="text-slate-900 font-bold">{selectedPendingPoint.pointTitle}</span>
                            </div>

                            <div>
                                <label className="block text-slate-600 font-semibold mb-1">Status</label>
                                <select
                                    value={resolveStatus}
                                    onChange={(e) => setResolveStatus(e.target.value as any)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:outline-none focus:border-indigo-500"
                                >
                                    <option value="In Progress">In Progress</option>
                                    <option value="Cleared">Cleared</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-slate-600 font-semibold mb-1">Resolution Remarks</label>
                                <textarea
                                    rows={3}
                                    value={resolveRemarks}
                                    onChange={(e) => setResolveRemarks(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:outline-none focus:border-indigo-500"
                                    placeholder="Enter resolution notes and voucher reference..."
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setResolveModalOpen(false)}
                                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-semibold hover:bg-slate-200"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleUpdatePendingPoint}
                                className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 shadow-sm"
                            >
                                Update Item
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Modal: Add New Client Master ─────────────────────────────────── */}
            {isAddClientModalOpen && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl animate-pop-in">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                                    <Building2 className="w-4 h-4" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-slate-900">Add New Monthly Audit Client</h3>
                                    <p className="text-[11px] text-slate-500">Dedicated Client Master for Statutory &amp; Monthly Audit (Independent from GST)</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsAddClientModalOpen(false)}
                                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Tally Live Autofill Banner */}
                        {isTallyOnline && tallyCompanyName && (
                            <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                    <span className="text-[10px] font-bold text-emerald-800 uppercase block tracking-wider flex items-center gap-1">
                                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                        Live Tally Company Detected
                                    </span>
                                    <span className="text-xs font-mono font-bold text-emerald-950 truncate block">{tallyCompanyName}</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setNewClientLegalName(tallyCompanyName);
                                        setNewClientTradeName(tallyCompanyName);
                                        if (tallyGstin) setNewClientGstin(tallyGstin);
                                    }}
                                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-lg transition shrink-0 cursor-pointer shadow-2xs"
                                >
                                    ⚡ Fill from Tally
                                </button>
                            </div>
                        )}

                        <form onSubmit={handleSaveNewClient} className="space-y-3.5 text-xs">
                            <div>
                                <label className="block text-slate-700 font-bold mb-1">
                                    Business / Company Name: <span className="text-rose-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={newClientLegalName}
                                    onChange={(e) => setNewClientLegalName(e.target.value)}
                                    placeholder="e.g. DYP INFRAPROJECTS PVT.LTD."
                                    className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                                    required
                                    autoFocus
                                />
                            </div>

                            <div>
                                <label className="block text-slate-700 font-semibold mb-1">
                                    Trade / Tally Company Name:
                                </label>
                                <input
                                    type="text"
                                    value={newClientTradeName}
                                    onChange={(e) => setNewClientTradeName(e.target.value)}
                                    placeholder="e.g. DYP Infra (Defaults to Company Name)"
                                    className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-slate-700 font-semibold mb-1">
                                        Client GSTIN: <span className="text-slate-400 text-[10px] font-normal">(Optional)</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={newClientGstin}
                                        maxLength={15}
                                        onChange={(e) => setNewClientGstin(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                                        placeholder="e.g. 27AAGCD4105L1ZO"
                                        className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 uppercase focus:outline-none focus:border-indigo-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-slate-700 font-semibold mb-1">
                                        Client PAN: <span className="text-slate-400 text-[10px] font-normal">(Optional)</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={newClientPan}
                                        maxLength={10}
                                        onChange={(e) => setNewClientPan(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                                        placeholder="e.g. AAGCD4105L"
                                        className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 uppercase focus:outline-none focus:border-indigo-500"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-slate-700 font-semibold mb-1">Contact Email:</label>
                                    <input
                                        type="email"
                                        value={newClientEmail}
                                        onChange={(e) => setNewClientEmail(e.target.value)}
                                        placeholder="accounts@dypinfra.com"
                                        className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-slate-700 font-semibold mb-1">Phone / Mobile:</label>
                                    <input
                                        type="text"
                                        value={newClientPhone}
                                        onChange={(e) => setNewClientPhone(e.target.value)}
                                        placeholder="9876543210"
                                        className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 focus:outline-none focus:border-indigo-500"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-slate-700 font-semibold mb-1">Address / Registered Office:</label>
                                <input
                                    type="text"
                                    value={newClientAddress}
                                    onChange={(e) => setNewClientAddress(e.target.value)}
                                    placeholder="e.g. Navi Mumbai, Maharashtra"
                                    className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                                />
                            </div>

                            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => setIsAddClientModalOpen(false)}
                                    className="px-4 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-semibold hover:bg-slate-200 transition cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSavingClient}
                                    className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                >
                                    {isSavingClient ? (
                                        <>
                                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                            <span>Saving...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Check className="w-4 h-4" />
                                            <span>Save &amp; Select Client</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Tally Prime Gateway & Client Sync Modal */}
            {isTallyModalOpen && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
                    <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-pop-in">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                                    <Activity className="w-4 h-4" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-slate-900">Tally Prime Live XML Connection</h3>
                                    <p className="text-[11px] text-slate-500">Port {tallyPort} · Direct Client &amp; Voucher Link</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsTallyModalOpen(false)}
                                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Connection Status Banner */}
                        <div className={`p-4 rounded-xl border ${
                            isTallyOnline 
                                ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950' 
                                : 'bg-rose-50/80 border-rose-200 text-rose-950'
                        }`}>
                            <div className="flex items-center justify-between mb-2">
                                <span className="flex items-center gap-2 text-xs font-bold">
                                    <span className={`w-2.5 h-2.5 rounded-full ${isTallyOnline ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                                    <span>Status: {isTallyOnline ? 'Tally Prime Connected (Online)' : 'Tally Prime Offline'}</span>
                                </span>
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white border border-slate-200 font-bold text-slate-700">
                                    Port {tallyPort}
                                </span>
                            </div>

                            {isTallyOnline ? (
                                <div className="space-y-1.5 text-xs">
                                    <div className="text-slate-600">Active Company in Tally:</div>
                                    <div className="text-sm font-extrabold text-emerald-900 font-mono tracking-tight bg-white/80 p-2 rounded-lg border border-emerald-200">
                                        {tallyCompanyName || 'Unknown / No Company Loaded'}
                                    </div>
                                    {tallyBooksFrom && (
                                        <div className="text-[11px] text-emerald-700 font-mono">
                                            Books Beginning From: <strong>{tallyBooksFrom}</strong>
                                        </div>
                                    )}
                                    {tallyGstin && (
                                        <div className="text-[11px] text-emerald-700 font-mono">
                                            Company GSTIN: <strong>{tallyGstin}</strong>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="text-[11px] text-rose-700 space-y-1">
                                    <p>Cannot connect to Tally Prime on <strong>127.0.0.1:{tallyPort}</strong>.</p>
                                    <ul className="list-disc list-inside space-y-0.5 text-[10px] text-rose-600">
                                        <li>Ensure TallyPrime is open on this computer.</li>
                                        <li>Enable ODBC/XML Server in Tally: <strong>F1 (Help) &gt; Settings &gt; Connectivity &gt; Port 9000</strong>.</li>
                                    </ul>
                                </div>
                            )}
                        </div>

                        {/* Port Config */}
                        <div className="flex items-center gap-2 text-xs">
                            <label className="text-slate-700 font-bold shrink-0">Tally Port:</label>
                            <input
                                type="number"
                                min={9000}
                                max={9010}
                                value={tallyPort}
                                onChange={(e) => setTallyPort(parseInt(e.target.value, 10) || 9000)}
                                className="w-24 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-mono text-xs font-bold text-slate-800"
                            />
                            <button
                                type="button"
                                onClick={() => pingTally(tallyPort)}
                                disabled={isPingingTally}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold transition cursor-pointer"
                            >
                                <RefreshCw className={`w-3.5 h-3.5 ${isPingingTally ? 'animate-spin' : ''}`} />
                                <span>Re-Scan</span>
                            </button>
                        </div>

                        {/* Actions */}
                        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                            <button
                                type="button"
                                onClick={() => setIsTallyModalOpen(false)}
                                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-semibold hover:bg-slate-200 transition cursor-pointer"
                            >
                                Close
                            </button>
                            {isTallyOnline && tallyCompanyName && (
                                <button
                                    type="button"
                                    onClick={async () => {
                                        await syncActiveTallyCompanyAsClient();
                                        setIsTallyModalOpen(false);
                                    }}
                                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer"
                                >
                                    <Check className="w-4 h-4" />
                                    <span>Set as Client on Report</span>
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
