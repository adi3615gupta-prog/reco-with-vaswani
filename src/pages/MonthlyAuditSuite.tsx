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
    Cloud
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { getApiBase } from '@/lib/api';
import {
    submitAuditForSeniorReviewInFirebase,
    approveAuditInFirebase,
    requestRevisionInFirebase,
    releaseAuditInFirebase,
    subscribeToCloudAudit,
    fetchSeniorAuditorsFromCloud,
    type CloudAuditRecord
} from '../lib/firebaseAuditSync';
import {
    type MonthlyAuditHeader,
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
    createInitialRocLoanCharges
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

const FINANCIAL_YEARS = ['2025-26', '2024-25', '2023-24', '2022-23'];
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
    // ─── Client & Navigation State ──────────────────────────────────────────────
    const [clients, setClients] = useState<Array<{ gstin: string; legalName: string; tradeName?: string }>>([
        { gstin: '27AAGCD4105L1ZO', legalName: 'DYP INFRAPROJECTS PRIVATE LIMITED', tradeName: 'DYP Infra' }
    ]);
    const [selectedClientGstin, setSelectedClientGstin] = useState<string>('27AAGCD4105L1ZO');
    const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
    const [clientSearchQuery, setClientSearchQuery] = useState('');
    const [selectedFy, setSelectedFy] = useState<string>('2025-26');
    const [selectedMonth, setSelectedMonth] = useState<string>('October');
    const [monthStatuses, setMonthStatuses] = useState<Record<string, string>>({});

    // ─── Active Audit Bundle State ──────────────────────────────────────────────
    const [auditHeader, setAuditHeader] = useState<MonthlyAuditHeader>(() => {
        const init = initializeMonthlyAudit('27AAGCD4105L1ZO', 'DYP INFRAPROJECTS PRIVATE LIMITED', '2025-26', 'October');
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
            salaryVariance: 0, remarks: ''
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
    const [currentRole, setCurrentRole] = useState<'junior' | 'senior'>('junior');
    const [activeTab, setActiveTab] = useState<'scope' | 'profitability' | 'verification' | 'observations' | 'pending'>('scope');
    const [verificationSubTab, setVerificationSubTab] = useState<'sales' | 'purchase' | 'journal' | 'bank' | 'roc' | 'cash' | 'labor'>('sales');
    const [salesMatrixViewMode, setSalesMatrixViewMode] = useState<'all' | 'books_r1' | 'books_3b' | 'drc01b'>('all');
    const [purchaseMatrixViewMode, setPurchaseMatrixViewMode] = useState<'all' | 'books_2b' | 'books_3b' | 'drc01c'>('all');
    const [pendingFilter, setPendingFilter] = useState<'All' | 'Pending' | 'In Progress' | 'Cleared'>('All');

    // ─── Excel Attachments State (Sales & Purchase Reco) ──────────────────────
    const salesFileInputRef = React.useRef<HTMLInputElement | null>(null);
    const purchaseFileInputRef = React.useRef<HTMLInputElement | null>(null);
    const [salesLocalPathInput, setSalesLocalPathInput] = useState<string>('');
    const [purchaseLocalPathInput, setPurchaseLocalPathInput] = useState<string>('');

    // ─── Profitability Status (Schedule III P&L Modeled on E:\Book1.xlsx) ──────
    const [profitability, setProfitability] = useState<ProfitabilityStatement>(DEFAULT_PROFITABILITY_STATEMENT);
    const [profitabilityFilePath, setProfitabilityFilePath] = useState<string>('E:\\Book1.xlsx');
    const [loadingProfitability, setLoadingProfitability] = useState<boolean>(false);
    const [showNotesGuidance, setShowNotesGuidance] = useState<boolean>(false);

    // ─── Tally & System State ──────────────────────────────────────────────────
    const [isTallyOnline, setIsTallyOnline] = useState<boolean>(false);
    const [isPingingTally, setIsPingingTally] = useState<boolean>(false);
    const [isLoadingAudit, setIsLoadingAudit] = useState<boolean>(false);
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [isAutoPopulating, setIsAutoPopulating] = useState<boolean>(false);

    // ─── Modals State ──────────────────────────────────────────────────────────
    const [revisionModalOpen, setRevisionModalOpen] = useState(false);
    const [revisionNotes, setRevisionNotes] = useState('');
    const [releaseModalOpen, setReleaseModalOpen] = useState(false);
    const [releaseChannel, setReleaseChannel] = useState<'Directory' | 'WhatsApp' | 'Email'>('Directory');
    const [obsModalOpen, setObsModalOpen] = useState(false);
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
    const [selectedSenior, setSelectedSenior] = useState('CA Ramesh Vaswani (Senior Partner)');
    const [customSeniorName, setCustomSeniorName] = useState('');
    const [submissionNotes, setSubmissionNotes] = useState('');
    const [reviewPriority, setReviewPriority] = useState<'Normal' | 'High' | 'Urgent (GST Deadline)'>('Normal');
    const [isSubmittingCloud, setIsSubmittingCloud] = useState(false);
    const [cloudAuditRecord, setCloudAuditRecord] = useState<CloudAuditRecord | null>(null);
    const [isCloudLive, setIsCloudLive] = useState(false);
    const [cloudSeniors, setCloudSeniors] = useState<Array<{ id: string; name: string; designation?: string; department?: string; role?: string }>>([]);

    // Load Senior Auditors & Reviewers configured in Super Admin Portal
    useEffect(() => {
        let isMounted = true;
        fetchSeniorAuditorsFromCloud().then((seniors) => {
            if (isMounted && Array.isArray(seniors) && seniors.length > 0) {
                setCloudSeniors(seniors);
            }
        }).catch((err) => {
            console.warn('[MonthlyAuditSuite] Could not load senior auditors from cloud:', err);
        });
        return () => { isMounted = false; };
    }, []);

    const activeClient = useMemo(() => {
        return clients.find(c => c.gstin === selectedClientGstin) || clients[0] || {
            gstin: selectedClientGstin,
            legalName: 'DYP INFRAPROJECTS PRIVATE LIMITED'
        };
    }, [clients, selectedClientGstin]);

    const filteredClients = useMemo(() => {
        if (!clientSearchQuery.trim()) return clients;
        const q = clientSearchQuery.toLowerCase();
        return clients.filter(c =>
            c.legalName.toLowerCase().includes(q) ||
            c.gstin.toLowerCase().includes(q) ||
            (c.tradeName && c.tradeName.toLowerCase().includes(q))
        );
    }, [clients, clientSearchQuery]);

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
        // 3. Fallback standard partners
        partners.add('CA Ramesh Vaswani (Senior Partner)');
        partners.add('CA Ankit Shah (Audit Partner)');
        partners.add('CA Suresh Vaswani (Managing Partner)');
        partners.add('CA Senior Partner (General In-Charge)');
        return Array.from(partners);
    }, [auditHeader.partnerName, auditHeader.reviewedBy, auditHeader.teamMembers, cloudSeniors]);

    // ─── Load Clients from DB ──────────────────────────────────────────────────
    useEffect(() => {
        const fetchClients = async () => {
            try {
                const apiBase = getApiBase();
                const token = localStorage.getItem('np_auth_token') || sessionStorage.getItem('np_auth_token');
                const res = await fetch(`${apiBase}/api/clients`, {
                    headers: token ? { Authorization: `Bearer ${token}` } : {}
                });
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data) && data.length > 0) {
                        const mapped = data.map((c: any) => ({
                            gstin: c.gstin,
                            legalName: c.legal_name || c.trade_name || c.gstin,
                            tradeName: c.trade_name
                        }));
                        setClients(mapped);
                    }
                }
            } catch (err) {
                console.warn('[MonthlyAuditSuite] Could not load clients from server:', err);
            }
        };
        fetchClients();
    }, []);

    // ─── Ping Tally Port 9000 ──────────────────────────────────────────────────
    const pingTally = useCallback(async () => {
        setIsPingingTally(true);
        try {
            const apiBase = getApiBase();
            const res = await fetch(`${apiBase}/api/tally/test-connection`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ port: 9000 })
            });
            const data = await res.json();
            setIsTallyOnline(Boolean(data.success));
        } catch {
            setIsTallyOnline(false);
        } finally {
            setIsPingingTally(false);
        }
    }, []);

    useEffect(() => {
        pingTally();
    }, [pingTally]);

    // ─── Fetch Monthly Audit & Pending Points ──────────────────────────────────
    const loadAudit = useCallback(async () => {
        if (!selectedClientGstin) return;
        setIsLoadingAudit(true);
        try {
            const apiBase = getApiBase();
            // 1. Fetch Month Audit Header
            const auditRes = await fetch(`${apiBase}/api/monthly-audits?client_gstin=${encodeURIComponent(selectedClientGstin)}&fy=${encodeURIComponent(selectedFy)}&month=${encodeURIComponent(selectedMonth)}`);
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
                        firmName: parsedMeta.firmName || found.firm_name || 'Vaswani & Associates, Chartered Accountants',
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
                    const detRes = await fetch(`${apiBase}/api/monthly-audits/${found.id}`);
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
                                    journal: { ...prev.journal, ...safeParse(vd.journal_reco_data, prev.journal) },
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
                    setAuditHeader(fresh);
                    setProfitability(createEmptyProfitabilityStatement(activeClient.legalName, '', '', `${selectedMonth} ${selectedFy}`));
                }
            }

            // 2. Fetch Cross-Month Pending Points
            const pendingRes = await fetch(`${apiBase}/api/audit-pending-points?client_gstin=${encodeURIComponent(selectedClientGstin)}`);
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
            const allAuditsRes = await fetch(`${apiBase}/api/monthly-audits?client_gstin=${encodeURIComponent(selectedClientGstin)}&fy=${encodeURIComponent(selectedFy)}`);
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
        const target = customPath || profitabilityFilePath || 'E:/Book1.xlsx';
        setLoadingProfitability(true);
        try {
            const apiBase = getApiBase();
            const resp = await fetch(`${apiBase}/api/monthly-audits/profitability/from-file?filePath=${encodeURIComponent(target)}`);
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
    const handleSaveAudit = async (showNotification = true) => {
        setIsSaving(true);
        try {
            const apiBase = getApiBase();

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
                status: auditHeader.status,
                audit_status: auditHeader.auditStatus,
                auditStatus: auditHeader.auditStatus,
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

            await fetch(`${apiBase}/api/monthly-audits`, {
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
                await fetch(`${apiBase}/api/monthly-audits/${auditHeader.id}/checklists/batch`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ items: normalizedChecklists })
                });
            }

            await fetch(`${apiBase}/api/monthly-audits/${auditHeader.id}/save-verification-data`, {
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
            const dirRes = await fetch(`${apiBase}/api/monthly-audits/${auditHeader.id}/save-directory`, {
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
        } else {
            setSelectedSenior('CA Ramesh Vaswani (Senior Partner)');
        }
        setSubmitReviewModalOpen(true);
    };

    const handleConfirmSubmitForReview = async () => {
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
            const res = await fetch(`${apiBase}/api/monthly-audits/${auditHeader.id}/submit-review`, {
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
        try {
            const apiBase = getApiBase();
            const seniorName = auditHeader.reviewedBy || 'Senior Partner, CA';
            const notes = 'Audit working papers verified and approved for client release.';

            // 1. Update Local SQLite Backend
            const res = await fetch(`${apiBase}/api/monthly-audits/${auditHeader.id}/senior-review`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'APPROVE',
                    reviewedBy: seniorName,
                    seniorReviewNotes: notes
                })
            });

            // 2. Sync Approval to Firebase Cloud
            await approveAuditInFirebase({
                clientGstin: selectedClientGstin,
                fy: selectedFy,
                month: selectedMonth,
                reviewedBy: seniorName,
                seniorReviewNotes: notes
            });

            if (res.ok) {
                toast.success('Audit working paper approved and stamped in Firebase Cloud!');
                setAuditHeader(prev => ({
                    ...prev,
                    auditStatus: 'APPROVED',
                    reviewedBy: seniorName,
                    reviewedAt: Date.now()
                }));
                await handleSaveAudit(false);
            }
        } catch (err: any) {
            toast.error(`Approval failed: ${err.message}`);
        }
    };

    const handleRequestRevision = async () => {
        try {
            const apiBase = getApiBase();
            const seniorName = auditHeader.reviewedBy || 'Senior Partner, CA';

            // 1. Update Local SQLite Backend
            const res = await fetch(`${apiBase}/api/monthly-audits/${auditHeader.id}/senior-review`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'REQUEST_REVISION',
                    reviewedBy: seniorName,
                    reviewed_by: seniorName,
                    reviewNotes: revisionNotes,
                    seniorReviewNotes: revisionNotes,
                    senior_review_notes: revisionNotes
                })
            });

            // 2. Sync Revision Request to Firebase Cloud
            await requestRevisionInFirebase({
                clientGstin: selectedClientGstin,
                fy: selectedFy,
                month: selectedMonth,
                reviewedBy: seniorName,
                revisionNotes
            });

            if (res.ok) {
                toast.info('Revision requested in Firebase Cloud. Working paper unlocked for Junior edits.');
                setAuditHeader(prev => ({
                    ...prev,
                    auditStatus: 'REVISION_REQUESTED',
                    seniorReviewNotes: revisionNotes
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
            const exportBundle: MonthlyAuditExportBundle = {
                header: auditHeader,
                registers,
                checklists,
                verification,
                observations,
                pendingPoints,
                profitability
            };
            const base64Data = generateMonthlyAuditBase64(exportBundle);
            const pdfData = generateMonthlyAuditPdf(exportBundle, { autoDownload: false });

            const res = await fetch(`${apiBase}/api/monthly-audits/${auditHeader.id}/release-client`, {
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
            const apiBase = getApiBase();
            await fetch(`${apiBase}/api/monthly-audits/${auditHeader.id}/observations`, {
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
            setObsModalOpen(false);
            setNewObs({
                sectionKey: 'sales',
                title: '',
                description: '',
                severity: 'Medium',
                riskCategory: 'GST Compliance',
                financialExposure: 0,
                voucherRef: '',
                auditorRecommendation: ''
            });
            toast.success('Observation recorded');
        } catch (err: any) {
            toast.error(`Failed to add observation: ${err.message}`);
        }
    };

    const handleDeleteObservation = async (obsId: string) => {
        try {
            const apiBase = getApiBase();
            await fetch(`${apiBase}/api/monthly-audits/${auditHeader.id}/observations/${obsId}`, {
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
            const apiBase = getApiBase();
            await fetch(`${apiBase}/api/audit-pending-points`, {
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
            const apiBase = getApiBase();
            const payload = {
                status: resolveStatus,
                resolutionRemarks: resolveRemarks,
                resolution_remarks: resolveRemarks,
                resolvedInMonth: resolveStatus === 'Cleared' ? selectedMonth : undefined,
                resolved_in_month: resolveStatus === 'Cleared' ? selectedMonth : undefined,
                verifiedBy: resolveStatus === 'Cleared' ? (auditHeader.reviewedBy || 'Senior Auditor') : undefined,
                verified_by: resolveStatus === 'Cleared' ? (auditHeader.reviewedBy || 'Senior Auditor') : undefined
            };

            await fetch(`${apiBase}/api/audit-pending-points/${selectedPendingPoint.id}`, {
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
        const bundle: MonthlyAuditExportBundle = {
            header: auditHeader,
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

    // ─── Permissions Logic ─────────────────────────────────────────────────────
    const isJuniorAllowedToEdit = canJuniorEdit(auditHeader.auditStatus);
    const isSeniorReviewAllowed = canSeniorReview(auditHeader.auditStatus);
    const isReleaseAllowed = canReleaseToClient(auditHeader.auditStatus);

    return (
        <div className="min-h-screen w-full bg-[#F8FAFC] text-slate-900 font-sans pb-16 animate-fade-in">
            {/* ─── TOP ELEVATED NAVBAR (Refined Executive Style) ─────────────────── */}
            <header className="relative z-20 px-4 sm:px-6 pt-1 pb-1 bg-[#F8FAFC]">
                <div className="max-w-[1520px] mx-auto min-h-16 bg-white/95 backdrop-blur-xl shadow-[0_4px_24px_rgba(0,0,0,0.06)] rounded-2xl px-5 py-2.5 flex flex-wrap items-center justify-between gap-3 border border-slate-200/80">
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
                                <h1 className="text-base sm:text-lg font-bold tracking-wide uppercase text-slate-900 leading-tight truncate">
                                    {activeClient.legalName}
                                </h1>
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
                        <div className="relative">
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
                                    <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white border border-slate-200 rounded-2xl shadow-2xl p-3 z-50 animate-pop-in ring-1 ring-slate-200">
                                        <div className="relative mb-2">
                                            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                            <input
                                                type="text"
                                                value={clientSearchQuery}
                                                onChange={e => setClientSearchQuery(e.target.value)}
                                                placeholder="Search client name or GSTIN..."
                                                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-indigo-500 transition-colors"
                                                autoFocus
                                            />
                                        </div>

                                        <div className="max-h-72 overflow-y-auto py-1 space-y-1 divide-y divide-slate-100 custom-scrollbar">
                                            {filteredClients.length === 0 ? (
                                                <div className="p-4 text-center text-xs text-slate-500">
                                                    No clients match "{clientSearchQuery}".
                                                </div>
                                            ) : (
                                                filteredClients.map(c => {
                                                    const isCurrent = selectedClientGstin === c.gstin;
                                                    return (
                                                        <button
                                                            key={c.gstin}
                                                            type="button"
                                                            onClick={() => {
                                                                setSelectedClientGstin(c.gstin);
                                                                setIsClientDropdownOpen(false);
                                                            }}
                                                            className={`w-full text-left p-2.5 rounded-xl transition-all flex items-center justify-between gap-2.5 ${
                                                                isCurrent
                                                                    ? 'bg-indigo-50 border border-indigo-200 text-indigo-900 font-semibold'
                                                                    : 'hover:bg-slate-50 text-slate-700'
                                                            }`}
                                                        >
                                                            <div className="truncate min-w-0 flex-1">
                                                                <div className="text-xs font-bold text-slate-900 truncate flex items-center gap-1.5">
                                                                    <Building2 className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                                                    <span className="truncate">{c.tradeName || c.legalName}</span>
                                                                </div>
                                                                <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                                                                    {c.gstin}
                                                                </div>
                                                            </div>
                                                        </button>
                                                    );
                                                })
                                            )}
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
                                {FINANCIAL_YEARS.map(fy => (
                                    <option key={fy} value={fy}>FY {fy}</option>
                                ))}
                            </select>
                            <ChevronDown className="w-3.5 h-3.5 pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                        </div>

                        {/* Tally Port 9000 Ping */}
                        <button
                            type="button"
                            onClick={pingTally}
                            disabled={isPingingTally}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                                isTallyOnline
                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100 shadow-2xs'
                                    : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
                            }`}
                            title="Tally Port 9000 XML Connection"
                        >
                            <span className={`w-2 h-2 rounded-full ${isTallyOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                            <span className="hidden sm:inline">Tally Port 9000:</span>
                            <span className="font-bold">{isTallyOnline ? 'Online' : 'Offline'}</span>
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
                    <div className="flex items-center gap-3">
                        {/* Role Switcher */}
                        <div className="flex items-center bg-slate-100 border border-slate-200 rounded-xl p-0.5 text-xs">
                            <button
                                type="button"
                                onClick={() => setCurrentRole('junior')}
                                className={`px-3 py-1 rounded-lg font-semibold transition flex items-center gap-1.5 ${
                                    currentRole === 'junior'
                                        ? 'bg-white text-slate-900 shadow-xs font-bold'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                <User className="w-3 h-3 text-blue-600" />
                                <span>Junior Article</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setCurrentRole('senior')}
                                className={`px-3 py-1 rounded-lg font-semibold transition flex items-center gap-1.5 ${
                                    currentRole === 'senior'
                                        ? 'bg-white text-slate-900 shadow-xs font-bold'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                <UserCheck className="w-3 h-3 text-indigo-600" />
                                <span>Senior CA Partner</span>
                            </button>
                        </div>

                        {/* Junior Actions */}
                        {currentRole === 'junior' && (
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
                        )}

                        {/* Senior Actions */}
                        {currentRole === 'senior' && (
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleApprove}
                                    disabled={!isSeniorReviewAllowed}
                                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition shadow-xs ${
                                        isSeniorReviewAllowed
                                            ? 'bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer'
                                            : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                                    }`}
                                >
                                    <Check className="w-3.5 h-3.5" />
                                    <span>Approve &amp; Sign-Off</span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setRevisionModalOpen(true)}
                                    disabled={!isSeniorReviewAllowed}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                                        isSeniorReviewAllowed
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
                                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs cursor-pointer transition"
                            >
                                <Check className="w-4 h-4" />
                                <span>Approve &amp; Sign-Off</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setRevisionModalOpen(true)}
                                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white hover:bg-rose-50 border border-rose-200 text-rose-700 shadow-2xs cursor-pointer transition"
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
                    <div className="max-w-[1520px] mx-auto mt-2 bg-rose-50 border border-rose-200 rounded-2xl p-3 shadow-2xs flex items-center justify-between flex-wrap gap-2 text-xs text-rose-900">
                        <div className="flex items-center gap-2.5">
                            <div className="p-1.5 bg-rose-100 text-rose-700 rounded-lg">
                                <AlertCircle className="w-4 h-4 text-rose-600" />
                            </div>
                            <div>
                                <span className="font-bold">Senior Revision Requested by {auditHeader.reviewedBy || 'Senior Partner'}: </span>
                                <span>{auditHeader.seniorReviewNotes || 'Please rectify findings and re-submit for review.'}</span>
                            </div>
                        </div>
                        <span className="px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 font-bold text-[11px]">
                            Unlocked for Edits
                        </span>
                    </div>
                )}

                {/* ─── 5 Main Tabs Navigation ────────────────────────────────────── */}
                <nav className="max-w-[1520px] mx-auto mt-2 bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/80 shadow-2xs p-1.5 flex items-center gap-1 text-xs font-bold overflow-x-auto">
                    <button
                        type="button"
                        onClick={() => setActiveTab('scope')}
                        className={`py-2 px-4 rounded-xl flex items-center gap-2 transition cursor-pointer ${
                            activeTab === 'scope'
                                ? 'bg-indigo-50 text-indigo-700 font-bold border border-indigo-200 shadow-2xs'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium'
                        }`}
                    >
                        <Layers className="w-4 h-4 text-indigo-600" />
                        <span>1. Basic Details &amp; Scope</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveTab('profitability')}
                        className={`py-2 px-4 rounded-xl flex items-center gap-2 transition cursor-pointer ${
                            activeTab === 'profitability'
                                ? 'bg-indigo-50 text-indigo-700 font-bold border border-indigo-200 shadow-2xs'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium'
                        }`}
                    >
                        <TrendingUp className="w-4 h-4 text-emerald-600" />
                        <span>2. Profitability Status</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveTab('verification')}
                        className={`py-2 px-4 rounded-xl flex items-center gap-2 transition cursor-pointer ${
                            activeTab === 'verification'
                                ? 'bg-indigo-50 text-indigo-700 font-bold border border-indigo-200 shadow-2xs'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium'
                        }`}
                    >
                        <FileCheck2 className="w-4 h-4 text-indigo-600" />
                        <span>3. Core Verification Workings (3.1–3.7)</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveTab('observations')}
                        className={`py-2 px-4 rounded-xl flex items-center gap-2 transition cursor-pointer ${
                            activeTab === 'observations'
                                ? 'bg-indigo-50 text-indigo-700 font-bold border border-indigo-200 shadow-2xs'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium'
                        }`}
                    >
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                        <span>4. Current Period Observations</span>
                        <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-amber-100 text-amber-800 font-mono">
                            {observations.length}
                        </span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveTab('pending')}
                        className={`py-2 px-4 rounded-xl flex items-center gap-2 transition cursor-pointer ${
                            activeTab === 'pending'
                                ? 'bg-indigo-50 text-indigo-700 font-bold border border-indigo-200 shadow-2xs'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium'
                        }`}
                    >
                        <Clock className="w-4 h-4 text-blue-600" />
                        <span>5. Previous Audit Pending Points</span>
                        <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-blue-100 text-blue-800 font-mono">
                            {pendingPoints.filter(p => p.status !== 'Cleared').length}
                        </span>
                    </button>
                </nav>
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
                                    <label className="block text-slate-600 font-semibold mb-1.5">Auditor / Engagement Partner</label>
                                    <input
                                        type="text"
                                        disabled={!isJuniorAllowedToEdit}
                                        value={auditHeader.auditorName || ''}
                                        onChange={(e) => setAuditHeader(prev => ({ ...prev, auditorName: e.target.value }))}
                                        className="w-full bg-slate-50 hover:bg-white focus:bg-white text-slate-900 font-medium border border-slate-200 rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition"
                                        placeholder="CA Signing Partner Name"
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
                                        placeholder="e.g. Vaswani & Associates, Chartered Accountants"
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
                                    <label className="block text-slate-600 font-semibold mb-1.5">Partner Membership No.</label>
                                    <input
                                        type="text"
                                        disabled={!isJuniorAllowedToEdit}
                                        value={auditHeader.membershipNo || ''}
                                        onChange={(e) => setAuditHeader(prev => ({ ...prev, membershipNo: e.target.value }))}
                                        className="w-full bg-slate-50 hover:bg-white focus:bg-white text-slate-900 font-mono font-medium border border-slate-200 rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition"
                                        placeholder="e.g. 158942"
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
                                        placeholder="e.g. EL/25-26/DYP/04 or UDIN"
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
                                                        placeholder="e.g. Rahul Sharma, Article Assistant"
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

                        {/* 3. 5 Core Registers Vouching Scope Checklist */}
                        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6">
                            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                                <Layers className="w-4 h-4 text-indigo-600" />
                                <span>3. 5 Core Registers Vouching Scope Checklist</span>
                            </h2>

                            <div className="overflow-x-auto rounded-xl border border-slate-200">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[11px] border-b border-slate-200">
                                        <tr>
                                            <th className="py-3 px-4">Register Name</th>
                                            <th className="py-3 px-4">Sampling Technique Used (SA 530)</th>
                                            <th className="py-3 px-4">Sample % Checked</th>
                                            <th className="py-3 px-4">Total Vouchers</th>
                                            <th className="py-3 px-4">Audited Amount (₹)</th>
                                            <th className="py-3 px-4">Auditor Notes &amp; Observations</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {registers.map((r, idx) => (
                                            <tr key={r.key} className="hover:bg-slate-50/80 transition-colors">
                                                <td className="py-3 px-4 font-bold text-slate-900 whitespace-nowrap">{r.registerName}</td>
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
                                                        className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-900 font-mono w-24 focus:outline-none"
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
                                        ))}
                                    </tbody>
                                </table>
                            </div>

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
                        </div>
                    </div>
                )}

                {/* ─── TAB 2: Profitability Status (Schedule III P&L Modeled on E:\Book1.xlsx) ── */}
                {activeTab === 'profitability' && (
                    <div className="space-y-5 animate-in fade-in-50 duration-200">
                        {/* Company & Statement Banner Card */}
                        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-5">
                            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2.5 flex-wrap">
                                        <h2 className="text-lg font-black text-slate-900 tracking-tight">
                                            {profitability.companyName}
                                        </h2>
                                        <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                                            CIN: {profitability.cin}
                                        </span>
                                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                                            <ShieldCheck className="w-3.5 h-3.5" />
                                            <span>Schedule III Part II Compliant</span>
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-500 font-medium">
                                        {profitability.registeredAddress}
                                    </p>
                                    <div className="flex items-center gap-2 pt-1 text-xs text-slate-700 font-bold">
                                        <FileSpreadsheet className="w-4 h-4 text-indigo-600" />
                                        <span>Statement of Profit and loss for the year ended {profitability.periodEndedDate}</span>
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
                                            placeholder="E:\Book1.xlsx"
                                            className="bg-transparent border-0 text-xs font-mono font-semibold text-slate-800 focus:outline-none w-32 sm:w-40"
                                            title="Source Excel file path"
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleLoadProfitabilityFromFile(profitabilityFilePath)}
                                        disabled={loadingProfitability}
                                        className="py-1.5 px-3 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                                        title="Auto-fill figures from E:\Book1.xlsx"
                                    >
                                        <RefreshCw className={`w-3.5 h-3.5 ${loadingProfitability ? 'animate-spin' : ''}`} />
                                        <span>{loadingProfitability ? 'Reading...' : 'Reload from Book1.xlsx'}</span>
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
                                        All statutory Schedule III Part II line items (Particulars) are mentioned below. Juniors should fill up the amounts directly from the client's draft books/trial balance. Subtotals, Total Income, Total Expenses, PBT, EBITDA, and analytical ratios calculate automatically in real-time. Click <strong>Reload from Book1.xlsx</strong> if you want to import from <code>E:\Book1.xlsx</code>.
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
                                        Working Paper: {profitability.sourceFilePath || 'E:\\Book1.xlsx'}
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
                        {/* Sub-tab Navigation Pill Bar */}
                        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-1.5 flex items-center gap-1.5 overflow-x-auto text-xs font-semibold">
                            <button
                                type="button"
                                onClick={() => setVerificationSubTab('sales')}
                                className={`px-3.5 py-1.5 rounded-xl transition cursor-pointer ${
                                    verificationSubTab === 'sales'
                                        ? 'bg-indigo-600 text-white shadow-xs font-bold'
                                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                                }`}
                            >
                                3.1 Sales (Reco R1)
                            </button>
                            <button
                                type="button"
                                onClick={() => setVerificationSubTab('purchase')}
                                className={`px-3.5 py-1.5 rounded-xl transition cursor-pointer ${
                                    verificationSubTab === 'purchase'
                                        ? 'bg-indigo-600 text-white shadow-xs font-bold'
                                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                                }`}
                            >
                                3.2 Purchase (Reco 2B)
                            </button>
                            <button
                                type="button"
                                onClick={() => setVerificationSubTab('journal')}
                                className={`px-3.5 py-1.5 rounded-xl transition cursor-pointer ${
                                    verificationSubTab === 'journal'
                                        ? 'bg-indigo-600 text-white shadow-xs font-bold'
                                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                                }`}
                            >
                                3.3 Journal &amp; TDS
                            </button>
                            <button
                                type="button"
                                onClick={() => setVerificationSubTab('bank')}
                                className={`px-3.5 py-1.5 rounded-xl transition cursor-pointer ${
                                    verificationSubTab === 'bank'
                                        ? 'bg-indigo-600 text-white shadow-xs font-bold'
                                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                                }`}
                            >
                                3.4 Bank, Loans &amp; 26AS
                            </button>
                            <button
                                type="button"
                                onClick={() => setVerificationSubTab('roc')}
                                className={`px-3.5 py-1.5 rounded-xl transition cursor-pointer ${
                                    verificationSubTab === 'roc'
                                        ? 'bg-indigo-600 text-white shadow-xs font-bold'
                                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                                }`}
                            >
                                3.5 ROC Charges
                            </button>
                            <button
                                type="button"
                                onClick={() => setVerificationSubTab('cash')}
                                className={`px-3.5 py-1.5 rounded-xl transition cursor-pointer ${
                                    verificationSubTab === 'cash'
                                        ? 'bg-indigo-600 text-white shadow-xs font-bold'
                                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                                }`}
                            >
                                3.6 Cash 40A(3) &amp; FA
                            </button>
                            <button
                                type="button"
                                onClick={() => setVerificationSubTab('labor')}
                                className={`px-3.5 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
                                    verificationSubTab === 'labor'
                                        ? 'bg-indigo-600 text-white shadow-xs font-bold'
                                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                                }`}
                            >
                                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                                <span>3.7 Labor Compliances</span>
                            </button>
                        </div>

                        {/* 3.1 Sales Reco View */}
                        {verificationSubTab === 'sales' && (() => {
                            const renderDiffCell = (diff: number) => {
                                const isZero = diff === 0;
                                return (
                                    <td className="p-1.5 text-right font-mono text-xs">
                                        <span className={`px-1.5 py-0.5 rounded block ${
                                            isZero
                                                ? 'text-slate-400 font-normal'
                                                : (diff > 0 ? 'text-amber-700 bg-amber-50 font-bold' : 'text-rose-700 bg-rose-50 font-bold')
                                        }`}>
                                            {isZero ? '₹0' : (diff > 0 ? `+₹${diff.toLocaleString('en-IN')}` : `-₹${Math.abs(diff).toLocaleString('en-IN')}`)}
                                        </span>
                                    </td>
                                );
                            };

                            const renderDiffTotalCell = (diff: number) => {
                                const isZero = diff === 0;
                                return (
                                    <td className={`p-2 text-right font-mono ${
                                        isZero ? 'text-slate-400 font-normal' : (diff > 0 ? 'text-amber-400 font-bold' : 'text-rose-400 font-bold')
                                    }`}>
                                        {isZero ? '₹0' : (diff > 0 ? `+₹${diff.toLocaleString('en-IN')}` : `-₹${Math.abs(diff).toLocaleString('en-IN')}`)}
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

                                    {/* The 12-Month 5-Block 3-Way Reconciliation Table */}
                                    <div className="overflow-x-auto border border-slate-200 rounded-2xl shadow-2xs max-h-[640px] relative">
                                        <table className="w-full text-left border-collapse text-xs">
                                            <thead className="sticky top-0 z-30 shadow-xs">
                                                {/* Header Row 1: Block Grouping Titles */}
                                                <tr className="divide-x divide-slate-200 text-center font-bold uppercase tracking-wider text-[11px]">
                                                    <th className="sticky left-0 z-40 bg-slate-100 text-slate-800 p-2.5 text-left min-w-[130px] border-r border-b border-slate-300">
                                                        Month / Period
                                                    </th>
                                                    {(salesMatrixViewMode === 'all' || salesMatrixViewMode === 'books_r1' || salesMatrixViewMode === 'books_3b') && (
                                                        <th colSpan={6} className="bg-blue-100/90 text-blue-950 p-2 border-b border-blue-300">
                                                            <span className="inline-flex items-center gap-1.5">
                                                                <span className="w-2 h-2 rounded-full bg-blue-600" />
                                                                1. As Per Books (Sales Register)
                                                            </span>
                                                        </th>
                                                    )}
                                                    {(salesMatrixViewMode === 'all' || salesMatrixViewMode === 'books_r1' || salesMatrixViewMode === 'drc01b') && (
                                                        <th colSpan={6} className="bg-indigo-100/90 text-indigo-950 p-2 border-b border-indigo-300">
                                                            <span className="inline-flex items-center gap-1.5">
                                                                <span className="w-2 h-2 rounded-full bg-indigo-600" />
                                                                2. As Per GSTR-1 (Portal Outward Supplies)
                                                            </span>
                                                        </th>
                                                    )}
                                                    {(salesMatrixViewMode === 'all' || salesMatrixViewMode === 'books_r1') && (
                                                        <th colSpan={6} className="bg-amber-100/90 text-amber-950 p-2 border-b border-amber-300">
                                                            <span className="inline-flex items-center gap-1.5">
                                                                <span className="w-2 h-2 rounded-full bg-amber-600" />
                                                                3. Comparison: Books vs GSTR-1 (Books - R1)
                                                            </span>
                                                        </th>
                                                    )}
                                                    {(salesMatrixViewMode === 'all' || salesMatrixViewMode === 'books_3b' || salesMatrixViewMode === 'drc01b') && (
                                                        <th colSpan={6} className="bg-purple-100/90 text-purple-950 p-2 border-b border-purple-300">
                                                            <span className="inline-flex items-center gap-1.5">
                                                                <span className="w-2 h-2 rounded-full bg-purple-600" />
                                                                4. As Per GSTR-3B (Summary Return Filed)
                                                            </span>
                                                        </th>
                                                    )}
                                                    {(salesMatrixViewMode === 'all' || salesMatrixViewMode === 'books_3b') && (
                                                        <th colSpan={6} className="bg-rose-100/90 text-rose-950 p-2 border-b border-rose-300">
                                                            <span className="inline-flex items-center gap-1.5">
                                                                <span className="w-2 h-2 rounded-full bg-rose-600" />
                                                                5. Comparison: Books vs GSTR-3B (Books - 3B)
                                                            </span>
                                                        </th>
                                                    )}
                                                    {salesMatrixViewMode === 'drc01b' && (
                                                        <th colSpan={6} className="bg-red-200 text-red-950 p-2 border-b border-red-300">
                                                            <span className="inline-flex items-center gap-1.5">
                                                                <AlertTriangle className="w-3.5 h-3.5 text-red-700" />
                                                                DRC-01B Difference: GSTR-1 vs GSTR-3B (R1 - 3B)
                                                            </span>
                                                        </th>
                                                    )}
                                                </tr>

                                                {/* Header Row 2: Sub-column Labels */}
                                                <tr className="divide-x divide-slate-200 text-center font-semibold text-[10px] text-slate-600 uppercase tracking-tight">
                                                    <th className="sticky left-0 z-40 bg-slate-100 text-slate-700 p-2 text-left border-r border-b border-slate-300">
                                                        FY Month
                                                    </th>
                                                    {/* Books Columns */}
                                                    {(salesMatrixViewMode === 'all' || salesMatrixViewMode === 'books_r1' || salesMatrixViewMode === 'books_3b') && (
                                                        <>
                                                            <th className="bg-blue-50/70 text-blue-900 p-2 min-w-[95px]">Taxable</th>
                                                            <th className="bg-blue-50/70 text-blue-900 p-2 min-w-[85px]">CGST</th>
                                                            <th className="bg-blue-50/70 text-blue-900 p-2 min-w-[85px]">SGST</th>
                                                            <th className="bg-blue-50/70 text-blue-900 p-2 min-w-[85px]">IGST</th>
                                                            <th className="bg-blue-50/70 text-blue-900 p-2 min-w-[85px]">Nil/Exempt</th>
                                                            <th className="bg-blue-50/70 text-blue-900 p-2 min-w-[85px]">Export</th>
                                                        </>
                                                    )}
                                                    {/* GSTR-1 Columns */}
                                                    {(salesMatrixViewMode === 'all' || salesMatrixViewMode === 'books_r1' || salesMatrixViewMode === 'drc01b') && (
                                                        <>
                                                            <th className="bg-indigo-50/70 text-indigo-900 p-2 min-w-[95px]">Taxable</th>
                                                            <th className="bg-indigo-50/70 text-indigo-900 p-2 min-w-[85px]">CGST</th>
                                                            <th className="bg-indigo-50/70 text-indigo-900 p-2 min-w-[85px]">SGST</th>
                                                            <th className="bg-indigo-50/70 text-indigo-900 p-2 min-w-[85px]">IGST</th>
                                                            <th className="bg-indigo-50/70 text-indigo-900 p-2 min-w-[85px]">Nil/Exempt</th>
                                                            <th className="bg-indigo-50/70 text-indigo-900 p-2 min-w-[85px]">Export</th>
                                                        </>
                                                    )}
                                                    {/* Diff Books vs R1 Columns */}
                                                    {(salesMatrixViewMode === 'all' || salesMatrixViewMode === 'books_r1') && (
                                                        <>
                                                            <th className="bg-amber-50/70 text-amber-900 p-2 min-w-[95px]">Diff Taxable</th>
                                                            <th className="bg-amber-50/70 text-amber-900 p-2 min-w-[85px]">Diff CGST</th>
                                                            <th className="bg-amber-50/70 text-amber-900 p-2 min-w-[85px]">Diff SGST</th>
                                                            <th className="bg-amber-50/70 text-amber-900 p-2 min-w-[85px]">Diff IGST</th>
                                                            <th className="bg-amber-50/70 text-amber-900 p-2 min-w-[85px]">Diff Nil</th>
                                                            <th className="bg-amber-50/70 text-amber-900 p-2 min-w-[85px]">Diff Export</th>
                                                        </>
                                                    )}
                                                    {/* GSTR-3B Columns */}
                                                    {(salesMatrixViewMode === 'all' || salesMatrixViewMode === 'books_3b' || salesMatrixViewMode === 'drc01b') && (
                                                        <>
                                                            <th className="bg-purple-50/70 text-purple-900 p-2 min-w-[95px]">Taxable</th>
                                                            <th className="bg-purple-50/70 text-purple-900 p-2 min-w-[85px]">CGST</th>
                                                            <th className="bg-purple-50/70 text-purple-900 p-2 min-w-[85px]">SGST</th>
                                                            <th className="bg-purple-50/70 text-purple-900 p-2 min-w-[85px]">IGST</th>
                                                            <th className="bg-purple-50/70 text-purple-900 p-2 min-w-[85px]">Nil/Exempt</th>
                                                            <th className="bg-purple-50/70 text-purple-900 p-2 min-w-[85px]">Export</th>
                                                        </>
                                                    )}
                                                    {/* Diff Books vs 3B Columns */}
                                                    {(salesMatrixViewMode === 'all' || salesMatrixViewMode === 'books_3b') && (
                                                        <>
                                                            <th className="bg-rose-50/70 text-rose-900 p-2 min-w-[95px]">Diff Taxable</th>
                                                            <th className="bg-rose-50/70 text-rose-900 p-2 min-w-[85px]">Diff CGST</th>
                                                            <th className="bg-rose-50/70 text-rose-900 p-2 min-w-[85px]">Diff SGST</th>
                                                            <th className="bg-rose-50/70 text-rose-900 p-2 min-w-[85px]">Diff IGST</th>
                                                            <th className="bg-rose-50/70 text-rose-900 p-2 min-w-[85px]">Diff Nil</th>
                                                            <th className="bg-rose-50/70 text-rose-900 p-2 min-w-[85px]">Diff Export</th>
                                                        </>
                                                    )}
                                                    {/* DRC-01B Diff Columns */}
                                                    {salesMatrixViewMode === 'drc01b' && (
                                                        <>
                                                            <th className="bg-red-50 text-red-900 p-2 min-w-[95px]">Diff Taxable</th>
                                                            <th className="bg-red-50 text-red-900 p-2 min-w-[85px]">Diff CGST</th>
                                                            <th className="bg-red-50 text-red-900 p-2 min-w-[85px]">Diff SGST</th>
                                                            <th className="bg-red-50 text-red-900 p-2 min-w-[85px]">Diff IGST</th>
                                                            <th className="bg-red-50 text-red-900 p-2 min-w-[85px]">Diff Nil</th>
                                                            <th className="bg-red-50 text-red-900 p-2 min-w-[85px]">Diff Export</th>
                                                        </>
                                                    )}
                                                </tr>
                                            </thead>

                                            <tbody className="divide-y divide-slate-200">
                                                {matrixData.map((row, idx) => {
                                                    const isSelected = row.month.toLowerCase() === selectedMonth.toLowerCase();
                                                    return (
                                                        <tr
                                                            key={row.month}
                                                            className={`divide-x divide-slate-100 transition hover:bg-slate-50/80 ${
                                                                isSelected ? 'bg-indigo-50/30' : ''
                                                            }`}
                                                        >
                                                            {/* Sticky Month Cell */}
                                                            <td className={`sticky left-0 z-20 p-2.5 font-bold border-r border-slate-200 whitespace-nowrap text-xs ${
                                                                isSelected
                                                                    ? 'bg-indigo-100/90 text-indigo-950 ring-1 ring-inset ring-indigo-400'
                                                                    : 'bg-white text-slate-800'
                                                            }`}>
                                                                <div className="flex items-center justify-between gap-1.5">
                                                                    <span>{row.month}</span>
                                                                    {isSelected && (
                                                                        <span className="text-[9px] px-1 py-0.2 rounded bg-indigo-600 text-white font-mono font-bold">
                                                                            ACTIVE
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </td>

                                                            {/* Block 1: Books */}
                                                            {(salesMatrixViewMode === 'all' || salesMatrixViewMode === 'books_r1' || salesMatrixViewMode === 'books_3b') && (
                                                                <>
                                                                    <td className="p-1 text-right bg-blue-50/20">
                                                                        <input
                                                                            type="number"
                                                                            value={row.books?.taxable === 0 ? '' : row.books?.taxable}
                                                                            placeholder="0"
                                                                            onChange={(e) => handleUpdateSalesMatrixCell(idx, 'books', 'taxable', e.target.value)}
                                                                            disabled={!isJuniorAllowedToEdit}
                                                                            className="w-24 px-1.5 py-1 text-right text-xs font-mono bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-500"
                                                                        />
                                                                    </td>
                                                                    <td className="p-1 text-right bg-blue-50/20">
                                                                        <input
                                                                            type="number"
                                                                            value={row.books?.cgst === 0 ? '' : row.books?.cgst}
                                                                            placeholder="0"
                                                                            onChange={(e) => handleUpdateSalesMatrixCell(idx, 'books', 'cgst', e.target.value)}
                                                                            disabled={!isJuniorAllowedToEdit}
                                                                            className="w-20 px-1.5 py-1 text-right text-xs font-mono bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-500"
                                                                        />
                                                                    </td>
                                                                    <td className="p-1 text-right bg-blue-50/20">
                                                                        <input
                                                                            type="number"
                                                                            value={row.books?.sgst === 0 ? '' : row.books?.sgst}
                                                                            placeholder="0"
                                                                            onChange={(e) => handleUpdateSalesMatrixCell(idx, 'books', 'sgst', e.target.value)}
                                                                            disabled={!isJuniorAllowedToEdit}
                                                                            className="w-20 px-1.5 py-1 text-right text-xs font-mono bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-500"
                                                                        />
                                                                    </td>
                                                                    <td className="p-1 text-right bg-blue-50/20">
                                                                        <input
                                                                            type="number"
                                                                            value={row.books?.igst === 0 ? '' : row.books?.igst}
                                                                            placeholder="0"
                                                                            onChange={(e) => handleUpdateSalesMatrixCell(idx, 'books', 'igst', e.target.value)}
                                                                            disabled={!isJuniorAllowedToEdit}
                                                                            className="w-20 px-1.5 py-1 text-right text-xs font-mono bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-500"
                                                                        />
                                                                    </td>
                                                                    <td className="p-1 text-right bg-blue-50/20">
                                                                        <input
                                                                            type="number"
                                                                            value={row.books?.nilRated === 0 ? '' : row.books?.nilRated}
                                                                            placeholder="0"
                                                                            onChange={(e) => handleUpdateSalesMatrixCell(idx, 'books', 'nilRated', e.target.value)}
                                                                            disabled={!isJuniorAllowedToEdit}
                                                                            className="w-20 px-1.5 py-1 text-right text-xs font-mono bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-500"
                                                                        />
                                                                    </td>
                                                                    <td className="p-1 text-right bg-blue-50/20">
                                                                        <input
                                                                            type="number"
                                                                            value={row.books?.export === 0 ? '' : row.books?.export}
                                                                            placeholder="0"
                                                                            onChange={(e) => handleUpdateSalesMatrixCell(idx, 'books', 'export', e.target.value)}
                                                                            disabled={!isJuniorAllowedToEdit}
                                                                            className="w-20 px-1.5 py-1 text-right text-xs font-mono bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-500"
                                                                        />
                                                                    </td>
                                                                </>
                                                            )}

                                                            {/* Block 2: GSTR-1 */}
                                                            {(salesMatrixViewMode === 'all' || salesMatrixViewMode === 'books_r1' || salesMatrixViewMode === 'drc01b') && (
                                                                <>
                                                                    <td className="p-1 text-right bg-indigo-50/20">
                                                                        <input
                                                                            type="number"
                                                                            value={row.gstr1?.taxable === 0 ? '' : row.gstr1?.taxable}
                                                                            placeholder="0"
                                                                            onChange={(e) => handleUpdateSalesMatrixCell(idx, 'gstr1', 'taxable', e.target.value)}
                                                                            disabled={!isJuniorAllowedToEdit}
                                                                            className="w-24 px-1.5 py-1 text-right text-xs font-mono bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-50 disabled:text-slate-500"
                                                                        />
                                                                    </td>
                                                                    <td className="p-1 text-right bg-indigo-50/20">
                                                                        <input
                                                                            type="number"
                                                                            value={row.gstr1?.cgst === 0 ? '' : row.gstr1?.cgst}
                                                                            placeholder="0"
                                                                            onChange={(e) => handleUpdateSalesMatrixCell(idx, 'gstr1', 'cgst', e.target.value)}
                                                                            disabled={!isJuniorAllowedToEdit}
                                                                            className="w-20 px-1.5 py-1 text-right text-xs font-mono bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-50 disabled:text-slate-500"
                                                                        />
                                                                    </td>
                                                                    <td className="p-1 text-right bg-indigo-50/20">
                                                                        <input
                                                                            type="number"
                                                                            value={row.gstr1?.sgst === 0 ? '' : row.gstr1?.sgst}
                                                                            placeholder="0"
                                                                            onChange={(e) => handleUpdateSalesMatrixCell(idx, 'gstr1', 'sgst', e.target.value)}
                                                                            disabled={!isJuniorAllowedToEdit}
                                                                            className="w-20 px-1.5 py-1 text-right text-xs font-mono bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-50 disabled:text-slate-500"
                                                                        />
                                                                    </td>
                                                                    <td className="p-1 text-right bg-indigo-50/20">
                                                                        <input
                                                                            type="number"
                                                                            value={row.gstr1?.igst === 0 ? '' : row.gstr1?.igst}
                                                                            placeholder="0"
                                                                            onChange={(e) => handleUpdateSalesMatrixCell(idx, 'gstr1', 'igst', e.target.value)}
                                                                            disabled={!isJuniorAllowedToEdit}
                                                                            className="w-20 px-1.5 py-1 text-right text-xs font-mono bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-50 disabled:text-slate-500"
                                                                        />
                                                                    </td>
                                                                    <td className="p-1 text-right bg-indigo-50/20">
                                                                        <input
                                                                            type="number"
                                                                            value={row.gstr1?.nilRated === 0 ? '' : row.gstr1?.nilRated}
                                                                            placeholder="0"
                                                                            onChange={(e) => handleUpdateSalesMatrixCell(idx, 'gstr1', 'nilRated', e.target.value)}
                                                                            disabled={!isJuniorAllowedToEdit}
                                                                            className="w-20 px-1.5 py-1 text-right text-xs font-mono bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-50 disabled:text-slate-500"
                                                                        />
                                                                    </td>
                                                                    <td className="p-1 text-right bg-indigo-50/20">
                                                                        <input
                                                                            type="number"
                                                                            value={row.gstr1?.export === 0 ? '' : row.gstr1?.export}
                                                                            placeholder="0"
                                                                            onChange={(e) => handleUpdateSalesMatrixCell(idx, 'gstr1', 'export', e.target.value)}
                                                                            disabled={!isJuniorAllowedToEdit}
                                                                            className="w-20 px-1.5 py-1 text-right text-xs font-mono bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-50 disabled:text-slate-500"
                                                                        />
                                                                    </td>
                                                                </>
                                                            )}

                                                            {/* Block 3: Diff Books vs R1 */}
                                                            {(salesMatrixViewMode === 'all' || salesMatrixViewMode === 'books_r1') && (
                                                                <>
                                                                    {renderDiffCell((row.books?.taxable || 0) - (row.gstr1?.taxable || 0))}
                                                                    {renderDiffCell((row.books?.cgst || 0) - (row.gstr1?.cgst || 0))}
                                                                    {renderDiffCell((row.books?.sgst || 0) - (row.gstr1?.sgst || 0))}
                                                                    {renderDiffCell((row.books?.igst || 0) - (row.gstr1?.igst || 0))}
                                                                    {renderDiffCell((row.books?.nilRated || 0) - (row.gstr1?.nilRated || 0))}
                                                                    {renderDiffCell((row.books?.export || 0) - (row.gstr1?.export || 0))}
                                                                </>
                                                            )}

                                                            {/* Block 4: GSTR-3B */}
                                                            {(salesMatrixViewMode === 'all' || salesMatrixViewMode === 'books_3b' || salesMatrixViewMode === 'drc01b') && (
                                                                <>
                                                                    <td className="p-1 text-right bg-purple-50/20">
                                                                        <input
                                                                            type="number"
                                                                            value={row.gstr3b?.taxable === 0 ? '' : row.gstr3b?.taxable}
                                                                            placeholder="0"
                                                                            onChange={(e) => handleUpdateSalesMatrixCell(idx, 'gstr3b', 'taxable', e.target.value)}
                                                                            disabled={!isJuniorAllowedToEdit}
                                                                            className="w-24 px-1.5 py-1 text-right text-xs font-mono bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500 disabled:bg-slate-50 disabled:text-slate-500"
                                                                        />
                                                                    </td>
                                                                    <td className="p-1 text-right bg-purple-50/20">
                                                                        <input
                                                                            type="number"
                                                                            value={row.gstr3b?.cgst === 0 ? '' : row.gstr3b?.cgst}
                                                                            placeholder="0"
                                                                            onChange={(e) => handleUpdateSalesMatrixCell(idx, 'gstr3b', 'cgst', e.target.value)}
                                                                            disabled={!isJuniorAllowedToEdit}
                                                                            className="w-20 px-1.5 py-1 text-right text-xs font-mono bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500 disabled:bg-slate-50 disabled:text-slate-500"
                                                                        />
                                                                    </td>
                                                                    <td className="p-1 text-right bg-purple-50/20">
                                                                        <input
                                                                            type="number"
                                                                            value={row.gstr3b?.sgst === 0 ? '' : row.gstr3b?.sgst}
                                                                            placeholder="0"
                                                                            onChange={(e) => handleUpdateSalesMatrixCell(idx, 'gstr3b', 'sgst', e.target.value)}
                                                                            disabled={!isJuniorAllowedToEdit}
                                                                            className="w-20 px-1.5 py-1 text-right text-xs font-mono bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500 disabled:bg-slate-50 disabled:text-slate-500"
                                                                        />
                                                                    </td>
                                                                    <td className="p-1 text-right bg-purple-50/20">
                                                                        <input
                                                                            type="number"
                                                                            value={row.gstr3b?.igst === 0 ? '' : row.gstr3b?.igst}
                                                                            placeholder="0"
                                                                            onChange={(e) => handleUpdateSalesMatrixCell(idx, 'gstr3b', 'igst', e.target.value)}
                                                                            disabled={!isJuniorAllowedToEdit}
                                                                            className="w-20 px-1.5 py-1 text-right text-xs font-mono bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500 disabled:bg-slate-50 disabled:text-slate-500"
                                                                        />
                                                                    </td>
                                                                    <td className="p-1 text-right bg-purple-50/20">
                                                                        <input
                                                                            type="number"
                                                                            value={row.gstr3b?.nilRated === 0 ? '' : row.gstr3b?.nilRated}
                                                                            placeholder="0"
                                                                            onChange={(e) => handleUpdateSalesMatrixCell(idx, 'gstr3b', 'nilRated', e.target.value)}
                                                                            disabled={!isJuniorAllowedToEdit}
                                                                            className="w-20 px-1.5 py-1 text-right text-xs font-mono bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500 disabled:bg-slate-50 disabled:text-slate-500"
                                                                        />
                                                                    </td>
                                                                    <td className="p-1 text-right bg-purple-50/20">
                                                                        <input
                                                                            type="number"
                                                                            value={row.gstr3b?.export === 0 ? '' : row.gstr3b?.export}
                                                                            placeholder="0"
                                                                            onChange={(e) => handleUpdateSalesMatrixCell(idx, 'gstr3b', 'export', e.target.value)}
                                                                            disabled={!isJuniorAllowedToEdit}
                                                                            className="w-20 px-1.5 py-1 text-right text-xs font-mono bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500 disabled:bg-slate-50 disabled:text-slate-500"
                                                                        />
                                                                    </td>
                                                                </>
                                                            )}

                                                            {/* Block 5: Diff Books vs 3B */}
                                                            {(salesMatrixViewMode === 'all' || salesMatrixViewMode === 'books_3b') && (
                                                                <>
                                                                    {renderDiffCell((row.books?.taxable || 0) - (row.gstr3b?.taxable || 0))}
                                                                    {renderDiffCell((row.books?.cgst || 0) - (row.gstr3b?.cgst || 0))}
                                                                    {renderDiffCell((row.books?.sgst || 0) - (row.gstr3b?.sgst || 0))}
                                                                    {renderDiffCell((row.books?.igst || 0) - (row.gstr3b?.igst || 0))}
                                                                    {renderDiffCell((row.books?.nilRated || 0) - (row.gstr3b?.nilRated || 0))}
                                                                    {renderDiffCell((row.books?.export || 0) - (row.gstr3b?.export || 0))}
                                                                </>
                                                            )}

                                                            {/* DRC-01B View Diff: R1 vs 3B */}
                                                            {salesMatrixViewMode === 'drc01b' && (
                                                                <>
                                                                    {renderDiffCell((row.gstr1?.taxable || 0) - (row.gstr3b?.taxable || 0))}
                                                                    {renderDiffCell((row.gstr1?.cgst || 0) - (row.gstr3b?.cgst || 0))}
                                                                    {renderDiffCell((row.gstr1?.sgst || 0) - (row.gstr3b?.sgst || 0))}
                                                                    {renderDiffCell((row.gstr1?.igst || 0) - (row.gstr3b?.igst || 0))}
                                                                    {renderDiffCell((row.gstr1?.nilRated || 0) - (row.gstr3b?.nilRated || 0))}
                                                                    {renderDiffCell((row.gstr1?.export || 0) - (row.gstr3b?.export || 0))}
                                                                </>
                                                            )}
                                                        </tr>
                                                    );
                                                })}

                                                {/* 13th Row: Full FY Total */}
                                                <tr className="bg-slate-900 text-white font-bold divide-x divide-slate-800 text-xs">
                                                    <td className="sticky left-0 z-20 bg-slate-950 text-amber-400 p-2.5 font-bold border-r border-slate-800 whitespace-nowrap">
                                                        FULL FY TOTAL (APR - MAR)
                                                    </td>
                                                    {/* Books FY Totals */}
                                                    {(salesMatrixViewMode === 'all' || salesMatrixViewMode === 'books_r1' || salesMatrixViewMode === 'books_3b') && (
                                                        <>
                                                            <td className="p-2 text-right font-mono text-slate-100">₹{matrixTotals.books.taxable.toLocaleString('en-IN')}</td>
                                                            <td className="p-2 text-right font-mono text-slate-100">₹{matrixTotals.books.cgst.toLocaleString('en-IN')}</td>
                                                            <td className="p-2 text-right font-mono text-slate-100">₹{matrixTotals.books.sgst.toLocaleString('en-IN')}</td>
                                                            <td className="p-2 text-right font-mono text-slate-100">₹{matrixTotals.books.igst.toLocaleString('en-IN')}</td>
                                                            <td className="p-2 text-right font-mono text-slate-100">₹{matrixTotals.books.nilRated.toLocaleString('en-IN')}</td>
                                                            <td className="p-2 text-right font-mono text-slate-100">₹{matrixTotals.books.export.toLocaleString('en-IN')}</td>
                                                        </>
                                                    )}
                                                    {/* GSTR-1 FY Totals */}
                                                    {(salesMatrixViewMode === 'all' || salesMatrixViewMode === 'books_r1' || salesMatrixViewMode === 'drc01b') && (
                                                        <>
                                                            <td className="p-2 text-right font-mono text-slate-100">₹{matrixTotals.gstr1.taxable.toLocaleString('en-IN')}</td>
                                                            <td className="p-2 text-right font-mono text-slate-100">₹{matrixTotals.gstr1.cgst.toLocaleString('en-IN')}</td>
                                                            <td className="p-2 text-right font-mono text-slate-100">₹{matrixTotals.gstr1.sgst.toLocaleString('en-IN')}</td>
                                                            <td className="p-2 text-right font-mono text-slate-100">₹{matrixTotals.gstr1.igst.toLocaleString('en-IN')}</td>
                                                            <td className="p-2 text-right font-mono text-slate-100">₹{matrixTotals.gstr1.nilRated.toLocaleString('en-IN')}</td>
                                                            <td className="p-2 text-right font-mono text-slate-100">₹{matrixTotals.gstr1.export.toLocaleString('en-IN')}</td>
                                                        </>
                                                    )}
                                                    {/* Diff Books vs R1 FY Totals */}
                                                    {(salesMatrixViewMode === 'all' || salesMatrixViewMode === 'books_r1') && (
                                                        <>
                                                            {renderDiffTotalCell(matrixTotals.diffR1.taxable)}
                                                            {renderDiffTotalCell(matrixTotals.diffR1.cgst)}
                                                            {renderDiffTotalCell(matrixTotals.diffR1.sgst)}
                                                            {renderDiffTotalCell(matrixTotals.diffR1.igst)}
                                                            {renderDiffTotalCell(matrixTotals.diffR1.nilRated)}
                                                            {renderDiffTotalCell(matrixTotals.diffR1.export)}
                                                        </>
                                                    )}
                                                    {/* GSTR-3B FY Totals */}
                                                    {(salesMatrixViewMode === 'all' || salesMatrixViewMode === 'books_3b' || salesMatrixViewMode === 'drc01b') && (
                                                        <>
                                                            <td className="p-2 text-right font-mono text-slate-100">₹{matrixTotals.gstr3b.taxable.toLocaleString('en-IN')}</td>
                                                            <td className="p-2 text-right font-mono text-slate-100">₹{matrixTotals.gstr3b.cgst.toLocaleString('en-IN')}</td>
                                                            <td className="p-2 text-right font-mono text-slate-100">₹{matrixTotals.gstr3b.sgst.toLocaleString('en-IN')}</td>
                                                            <td className="p-2 text-right font-mono text-slate-100">₹{matrixTotals.gstr3b.igst.toLocaleString('en-IN')}</td>
                                                            <td className="p-2 text-right font-mono text-slate-100">₹{matrixTotals.gstr3b.nilRated.toLocaleString('en-IN')}</td>
                                                            <td className="p-2 text-right font-mono text-slate-100">₹{matrixTotals.gstr3b.export.toLocaleString('en-IN')}</td>
                                                        </>
                                                    )}
                                                    {/* Diff Books vs 3B FY Totals */}
                                                    {(salesMatrixViewMode === 'all' || salesMatrixViewMode === 'books_3b') && (
                                                        <>
                                                            {renderDiffTotalCell(matrixTotals.diff3b.taxable)}
                                                            {renderDiffTotalCell(matrixTotals.diff3b.cgst)}
                                                            {renderDiffTotalCell(matrixTotals.diff3b.sgst)}
                                                            {renderDiffTotalCell(matrixTotals.diff3b.igst)}
                                                            {renderDiffTotalCell(matrixTotals.diff3b.nilRated)}
                                                            {renderDiffTotalCell(matrixTotals.diff3b.export)}
                                                        </>
                                                    )}
                                                    {/* DRC-01B Diff FY Totals */}
                                                    {salesMatrixViewMode === 'drc01b' && (
                                                        <>
                                                            {renderDiffTotalCell(matrixTotals.diffDrc.taxable)}
                                                            {renderDiffTotalCell(matrixTotals.diffDrc.cgst)}
                                                            {renderDiffTotalCell(matrixTotals.diffDrc.sgst)}
                                                            {renderDiffTotalCell(matrixTotals.diffDrc.igst)}
                                                            {renderDiffTotalCell(matrixTotals.diffDrc.nilRated)}
                                                            {renderDiffTotalCell(matrixTotals.diffDrc.export)}
                                                        </>
                                                    )}
                                                </tr>
                                            </tbody>
                                        </table>
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
                        {verificationSubTab === 'purchase' && (() => {
                            const renderDiffCell = (diff: number) => {
                                const isZero = diff === 0;
                                return (
                                    <td className="p-1.5 text-right font-mono text-xs">
                                        <span className={`px-1.5 py-0.5 rounded block ${
                                            isZero
                                                ? 'text-slate-400 font-normal'
                                                : (diff > 0 ? 'text-amber-700 bg-amber-50 font-bold' : 'text-rose-700 bg-rose-50 font-bold')
                                        }`}>
                                            {isZero ? '₹0' : (diff > 0 ? `+₹${diff.toLocaleString('en-IN')}` : `-₹${Math.abs(diff).toLocaleString('en-IN')}`)}
                                        </span>
                                    </td>
                                );
                            };

                            const renderDiffTotalCell = (diff: number) => {
                                const isZero = diff === 0;
                                return (
                                    <td className={`p-2 text-right font-mono ${
                                        isZero ? 'text-slate-400 font-normal' : (diff > 0 ? 'text-amber-400 font-bold' : 'text-rose-400 font-bold')
                                    }`}>
                                        {isZero ? '₹0' : (diff > 0 ? `+₹${diff.toLocaleString('en-IN')}` : `-₹${Math.abs(diff).toLocaleString('en-IN')}`)}
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

                                    {/* The 12-Month 5-Block 3-Way Reconciliation Table (NO TAXABLE COLUMN) */}
                                    <div className="overflow-x-auto border border-slate-200 rounded-2xl shadow-2xs max-h-[640px] relative">
                                        <table className="w-full text-left border-collapse text-xs">
                                            <thead className="sticky top-0 z-30 shadow-xs">
                                                {/* Header Row 1: Block Grouping Titles */}
                                                <tr className="divide-x divide-slate-200 text-center font-bold uppercase tracking-wider text-[11px]">
                                                    <th className="sticky left-0 z-40 bg-slate-100 text-slate-800 p-2.5 text-left min-w-[130px] border-r border-b border-slate-300">
                                                        Month / Period
                                                    </th>
                                                    {(purchaseMatrixViewMode === 'all' || purchaseMatrixViewMode === 'books_2b' || purchaseMatrixViewMode === 'books_3b') && (
                                                        <th colSpan={6} className="bg-blue-100/90 text-blue-950 p-2 border-b border-blue-300">
                                                            <span className="inline-flex items-center gap-1.5">
                                                                <span className="w-2 h-2 rounded-full bg-blue-600" />
                                                                1. As Per Books (Purchase Register)
                                                            </span>
                                                        </th>
                                                    )}
                                                    {(purchaseMatrixViewMode === 'all' || purchaseMatrixViewMode === 'books_2b' || purchaseMatrixViewMode === 'drc01c') && (
                                                        <th colSpan={6} className="bg-indigo-100/90 text-indigo-950 p-2 border-b border-indigo-300">
                                                            <span className="inline-flex items-center gap-1.5">
                                                                <span className="w-2 h-2 rounded-full bg-indigo-600" />
                                                                2. As Per GSTR-2B (Portal Inward Supplies)
                                                            </span>
                                                        </th>
                                                    )}
                                                    {(purchaseMatrixViewMode === 'all' || purchaseMatrixViewMode === 'books_2b') && (
                                                        <th colSpan={6} className="bg-amber-100/90 text-amber-950 p-2 border-b border-amber-300">
                                                            <span className="inline-flex items-center gap-1.5">
                                                                <span className="w-2 h-2 rounded-full bg-amber-600" />
                                                                3. Comparison: Books vs GSTR-2B (Books - 2B)
                                                            </span>
                                                        </th>
                                                    )}
                                                    {(purchaseMatrixViewMode === 'all' || purchaseMatrixViewMode === 'books_3b' || purchaseMatrixViewMode === 'drc01c') && (
                                                        <th colSpan={6} className="bg-purple-100/90 text-purple-950 p-2 border-b border-purple-300">
                                                            <span className="inline-flex items-center gap-1.5">
                                                                <span className="w-2 h-2 rounded-full bg-purple-600" />
                                                                4. As Per GSTR-3B (ITC Availed)
                                                            </span>
                                                        </th>
                                                    )}
                                                    {(purchaseMatrixViewMode === 'all' || purchaseMatrixViewMode === 'books_3b') && (
                                                        <th colSpan={6} className="bg-rose-100/90 text-rose-950 p-2 border-b border-rose-300">
                                                            <span className="inline-flex items-center gap-1.5">
                                                                <span className="w-2 h-2 rounded-full bg-rose-600" />
                                                                5. Comparison: Books vs GSTR-3B (Books - 3B)
                                                            </span>
                                                        </th>
                                                    )}
                                                    {purchaseMatrixViewMode === 'drc01c' && (
                                                        <th colSpan={6} className="bg-red-200 text-red-950 p-2 border-b border-red-300">
                                                            <span className="inline-flex items-center gap-1.5">
                                                                <AlertTriangle className="w-3.5 h-3.5 text-red-700" />
                                                                Rule 88D / DRC-01C Diff: GSTR-3B vs GSTR-2B (3B - 2B)
                                                            </span>
                                                        </th>
                                                    )}
                                                </tr>

                                                {/* Header Row 2: Sub-column Labels (NO TAXABLE) */}
                                                <tr className="divide-x divide-slate-200 text-center font-semibold text-[10px] text-slate-600 uppercase tracking-tight">
                                                    <th className="sticky left-0 z-40 bg-slate-100 text-slate-700 p-2 text-left border-r border-b border-slate-300">
                                                        FY Month
                                                    </th>
                                                    {/* Books Columns */}
                                                    {(purchaseMatrixViewMode === 'all' || purchaseMatrixViewMode === 'books_2b' || purchaseMatrixViewMode === 'books_3b') && (
                                                        <>
                                                            <th className="bg-blue-50/70 text-blue-900 p-2 min-w-[85px]">CGST</th>
                                                            <th className="bg-blue-50/70 text-blue-900 p-2 min-w-[85px]">SGST</th>
                                                            <th className="bg-blue-50/70 text-blue-900 p-2 min-w-[85px]">IGST</th>
                                                            <th className="bg-blue-50/70 text-blue-900 p-2 min-w-[85px]">Cess</th>
                                                            <th className="bg-blue-50/70 text-blue-900 p-2 min-w-[85px]">Nil/Exempt</th>
                                                            <th className="bg-blue-100/90 text-blue-950 p-2 min-w-[95px] font-bold">Total ITC</th>
                                                        </>
                                                    )}
                                                    {/* GSTR-2B Columns */}
                                                    {(purchaseMatrixViewMode === 'all' || purchaseMatrixViewMode === 'books_2b' || purchaseMatrixViewMode === 'drc01c') && (
                                                        <>
                                                            <th className="bg-indigo-50/70 text-indigo-900 p-2 min-w-[85px]">CGST</th>
                                                            <th className="bg-indigo-50/70 text-indigo-900 p-2 min-w-[85px]">SGST</th>
                                                            <th className="bg-indigo-50/70 text-indigo-900 p-2 min-w-[85px]">IGST</th>
                                                            <th className="bg-indigo-50/70 text-indigo-900 p-2 min-w-[85px]">Cess</th>
                                                            <th className="bg-indigo-50/70 text-indigo-900 p-2 min-w-[85px]">Nil/Exempt</th>
                                                            <th className="bg-indigo-100/90 text-indigo-950 p-2 min-w-[95px] font-bold">Total ITC</th>
                                                        </>
                                                    )}
                                                    {/* Diff Books vs 2B Columns */}
                                                    {(purchaseMatrixViewMode === 'all' || purchaseMatrixViewMode === 'books_2b') && (
                                                        <>
                                                            <th className="bg-amber-50/70 text-amber-900 p-2 min-w-[85px]">Diff CGST</th>
                                                            <th className="bg-amber-50/70 text-amber-900 p-2 min-w-[85px]">Diff SGST</th>
                                                            <th className="bg-amber-50/70 text-amber-900 p-2 min-w-[85px]">Diff IGST</th>
                                                            <th className="bg-amber-50/70 text-amber-900 p-2 min-w-[85px]">Diff Cess</th>
                                                            <th className="bg-amber-50/70 text-amber-900 p-2 min-w-[85px]">Diff Nil</th>
                                                            <th className="bg-amber-100/90 text-amber-950 p-2 min-w-[95px] font-bold">Diff Total</th>
                                                        </>
                                                    )}
                                                    {/* GSTR-3B Columns */}
                                                    {(purchaseMatrixViewMode === 'all' || purchaseMatrixViewMode === 'books_3b' || purchaseMatrixViewMode === 'drc01c') && (
                                                        <>
                                                            <th className="bg-purple-50/70 text-purple-900 p-2 min-w-[85px]">CGST</th>
                                                            <th className="bg-purple-50/70 text-purple-900 p-2 min-w-[85px]">SGST</th>
                                                            <th className="bg-purple-50/70 text-purple-900 p-2 min-w-[85px]">IGST</th>
                                                            <th className="bg-purple-50/70 text-purple-900 p-2 min-w-[85px]">Cess</th>
                                                            <th className="bg-purple-50/70 text-purple-900 p-2 min-w-[85px]">Nil/Exempt</th>
                                                            <th className="bg-purple-100/90 text-purple-950 p-2 min-w-[95px] font-bold">Total ITC</th>
                                                        </>
                                                    )}
                                                    {/* Diff Books vs 3B Columns */}
                                                    {(purchaseMatrixViewMode === 'all' || purchaseMatrixViewMode === 'books_3b') && (
                                                        <>
                                                            <th className="bg-rose-50/70 text-rose-900 p-2 min-w-[85px]">Diff CGST</th>
                                                            <th className="bg-rose-50/70 text-rose-900 p-2 min-w-[85px]">Diff SGST</th>
                                                            <th className="bg-rose-50/70 text-rose-900 p-2 min-w-[85px]">Diff IGST</th>
                                                            <th className="bg-rose-50/70 text-rose-900 p-2 min-w-[85px]">Diff Cess</th>
                                                            <th className="bg-rose-50/70 text-rose-900 p-2 min-w-[85px]">Diff Nil</th>
                                                            <th className="bg-rose-100/90 text-rose-950 p-2 min-w-[95px] font-bold">Diff Total</th>
                                                        </>
                                                    )}
                                                    {/* DRC-01C Diff Columns */}
                                                    {purchaseMatrixViewMode === 'drc01c' && (
                                                        <>
                                                            <th className="bg-red-50 text-red-900 p-2 min-w-[85px]">Diff CGST</th>
                                                            <th className="bg-red-50 text-red-900 p-2 min-w-[85px]">Diff SGST</th>
                                                            <th className="bg-red-50 text-red-900 p-2 min-w-[85px]">Diff IGST</th>
                                                            <th className="bg-red-50 text-red-900 p-2 min-w-[85px]">Diff Cess</th>
                                                            <th className="bg-red-50 text-red-900 p-2 min-w-[85px]">Diff Nil</th>
                                                            <th className="bg-red-200 text-red-950 p-2 min-w-[95px] font-bold">Diff Total</th>
                                                        </>
                                                    )}
                                                </tr>
                                            </thead>

                                            <tbody className="divide-y divide-slate-200">
                                                {purchaseMatrixData.map((row, idx) => {
                                                    const isSelected = row.month.toLowerCase() === selectedMonth.toLowerCase();
                                                    const booksRowTotal = (row.books?.cgst || 0) + (row.books?.sgst || 0) + (row.books?.igst || 0) + (row.books?.cess || 0);
                                                    const twoBRowTotal = (row.gstr2b?.cgst || 0) + (row.gstr2b?.sgst || 0) + (row.gstr2b?.igst || 0) + (row.gstr2b?.cess || 0);
                                                    const threeBRowTotal = (row.gstr3b?.cgst || 0) + (row.gstr3b?.sgst || 0) + (row.gstr3b?.igst || 0) + (row.gstr3b?.cess || 0);

                                                    return (
                                                        <tr
                                                            key={row.month}
                                                            className={`divide-x divide-slate-100 transition hover:bg-slate-50/80 ${
                                                                isSelected ? 'bg-indigo-50/30' : ''
                                                            }`}
                                                        >
                                                            {/* Sticky Month Cell */}
                                                            <td className={`sticky left-0 z-20 p-2.5 font-bold border-r border-slate-200 whitespace-nowrap text-xs ${
                                                                isSelected
                                                                    ? 'bg-indigo-100/90 text-indigo-950 ring-1 ring-inset ring-indigo-400'
                                                                    : 'bg-white text-slate-800'
                                                            }`}>
                                                                <div className="flex items-center justify-between gap-1.5">
                                                                    <span>{row.month}</span>
                                                                    {isSelected && (
                                                                        <span className="text-[9px] px-1 py-0.2 rounded bg-indigo-600 text-white font-mono font-bold">
                                                                            ACTIVE
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </td>

                                                            {/* Block 1: Books */}
                                                            {(purchaseMatrixViewMode === 'all' || purchaseMatrixViewMode === 'books_2b' || purchaseMatrixViewMode === 'books_3b') && (
                                                                <>
                                                                    <td className="p-1 text-right bg-blue-50/20">
                                                                        <input
                                                                            type="number"
                                                                            value={row.books?.cgst === 0 ? '' : row.books?.cgst}
                                                                            placeholder="0"
                                                                            onChange={(e) => handleUpdatePurchaseMatrixCell(idx, 'books', 'cgst', e.target.value)}
                                                                            disabled={!isJuniorAllowedToEdit}
                                                                            className="w-20 px-1.5 py-1 text-right text-xs font-mono bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-500"
                                                                        />
                                                                    </td>
                                                                    <td className="p-1 text-right bg-blue-50/20">
                                                                        <input
                                                                            type="number"
                                                                            value={row.books?.sgst === 0 ? '' : row.books?.sgst}
                                                                            placeholder="0"
                                                                            onChange={(e) => handleUpdatePurchaseMatrixCell(idx, 'books', 'sgst', e.target.value)}
                                                                            disabled={!isJuniorAllowedToEdit}
                                                                            className="w-20 px-1.5 py-1 text-right text-xs font-mono bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-500"
                                                                        />
                                                                    </td>
                                                                    <td className="p-1 text-right bg-blue-50/20">
                                                                        <input
                                                                            type="number"
                                                                            value={row.books?.igst === 0 ? '' : row.books?.igst}
                                                                            placeholder="0"
                                                                            onChange={(e) => handleUpdatePurchaseMatrixCell(idx, 'books', 'igst', e.target.value)}
                                                                            disabled={!isJuniorAllowedToEdit}
                                                                            className="w-20 px-1.5 py-1 text-right text-xs font-mono bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-500"
                                                                        />
                                                                    </td>
                                                                    <td className="p-1 text-right bg-blue-50/20">
                                                                        <input
                                                                            type="number"
                                                                            value={row.books?.cess === 0 ? '' : row.books?.cess}
                                                                            placeholder="0"
                                                                            onChange={(e) => handleUpdatePurchaseMatrixCell(idx, 'books', 'cess', e.target.value)}
                                                                            disabled={!isJuniorAllowedToEdit}
                                                                            className="w-20 px-1.5 py-1 text-right text-xs font-mono bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-500"
                                                                        />
                                                                    </td>
                                                                    <td className="p-1 text-right bg-blue-50/20">
                                                                        <input
                                                                            type="number"
                                                                            value={row.books?.nilRated === 0 ? '' : row.books?.nilRated}
                                                                            placeholder="0"
                                                                            onChange={(e) => handleUpdatePurchaseMatrixCell(idx, 'books', 'nilRated', e.target.value)}
                                                                            disabled={!isJuniorAllowedToEdit}
                                                                            className="w-20 px-1.5 py-1 text-right text-xs font-mono bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-500"
                                                                        />
                                                                    </td>
                                                                    <td className="p-1.5 text-right font-mono font-bold text-blue-950 bg-blue-100/30">
                                                                        ₹{booksRowTotal.toLocaleString('en-IN')}
                                                                    </td>
                                                                </>
                                                            )}

                                                            {/* Block 2: GSTR-2B */}
                                                            {(purchaseMatrixViewMode === 'all' || purchaseMatrixViewMode === 'books_2b' || purchaseMatrixViewMode === 'drc01c') && (
                                                                <>
                                                                    <td className="p-1 text-right bg-indigo-50/20">
                                                                        <input
                                                                            type="number"
                                                                            value={row.gstr2b?.cgst === 0 ? '' : row.gstr2b?.cgst}
                                                                            placeholder="0"
                                                                            onChange={(e) => handleUpdatePurchaseMatrixCell(idx, 'gstr2b', 'cgst', e.target.value)}
                                                                            disabled={!isJuniorAllowedToEdit}
                                                                            className="w-20 px-1.5 py-1 text-right text-xs font-mono bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-50 disabled:text-slate-500"
                                                                        />
                                                                    </td>
                                                                    <td className="p-1 text-right bg-indigo-50/20">
                                                                        <input
                                                                            type="number"
                                                                            value={row.gstr2b?.sgst === 0 ? '' : row.gstr2b?.sgst}
                                                                            placeholder="0"
                                                                            onChange={(e) => handleUpdatePurchaseMatrixCell(idx, 'gstr2b', 'sgst', e.target.value)}
                                                                            disabled={!isJuniorAllowedToEdit}
                                                                            className="w-20 px-1.5 py-1 text-right text-xs font-mono bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-50 disabled:text-slate-500"
                                                                        />
                                                                    </td>
                                                                    <td className="p-1 text-right bg-indigo-50/20">
                                                                        <input
                                                                            type="number"
                                                                            value={row.gstr2b?.igst === 0 ? '' : row.gstr2b?.igst}
                                                                            placeholder="0"
                                                                            onChange={(e) => handleUpdatePurchaseMatrixCell(idx, 'gstr2b', 'igst', e.target.value)}
                                                                            disabled={!isJuniorAllowedToEdit}
                                                                            className="w-20 px-1.5 py-1 text-right text-xs font-mono bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-50 disabled:text-slate-500"
                                                                        />
                                                                    </td>
                                                                    <td className="p-1 text-right bg-indigo-50/20">
                                                                        <input
                                                                            type="number"
                                                                            value={row.gstr2b?.cess === 0 ? '' : row.gstr2b?.cess}
                                                                            placeholder="0"
                                                                            onChange={(e) => handleUpdatePurchaseMatrixCell(idx, 'gstr2b', 'cess', e.target.value)}
                                                                            disabled={!isJuniorAllowedToEdit}
                                                                            className="w-20 px-1.5 py-1 text-right text-xs font-mono bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-50 disabled:text-slate-500"
                                                                        />
                                                                    </td>
                                                                    <td className="p-1 text-right bg-indigo-50/20">
                                                                        <input
                                                                            type="number"
                                                                            value={row.gstr2b?.nilRated === 0 ? '' : row.gstr2b?.nilRated}
                                                                            placeholder="0"
                                                                            onChange={(e) => handleUpdatePurchaseMatrixCell(idx, 'gstr2b', 'nilRated', e.target.value)}
                                                                            disabled={!isJuniorAllowedToEdit}
                                                                            className="w-20 px-1.5 py-1 text-right text-xs font-mono bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-50 disabled:text-slate-500"
                                                                        />
                                                                    </td>
                                                                    <td className="p-1.5 text-right font-mono font-bold text-indigo-950 bg-indigo-100/30">
                                                                        ₹{twoBRowTotal.toLocaleString('en-IN')}
                                                                    </td>
                                                                </>
                                                            )}

                                                            {/* Block 3: Diff Books vs 2B */}
                                                            {(purchaseMatrixViewMode === 'all' || purchaseMatrixViewMode === 'books_2b') && (
                                                                <>
                                                                    {renderDiffCell((row.books?.cgst || 0) - (row.gstr2b?.cgst || 0))}
                                                                    {renderDiffCell((row.books?.sgst || 0) - (row.gstr2b?.sgst || 0))}
                                                                    {renderDiffCell((row.books?.igst || 0) - (row.gstr2b?.igst || 0))}
                                                                    {renderDiffCell((row.books?.cess || 0) - (row.gstr2b?.cess || 0))}
                                                                    {renderDiffCell((row.books?.nilRated || 0) - (row.gstr2b?.nilRated || 0))}
                                                                    {renderDiffCell(booksRowTotal - twoBRowTotal)}
                                                                </>
                                                            )}

                                                            {/* Block 4: GSTR-3B */}
                                                            {(purchaseMatrixViewMode === 'all' || purchaseMatrixViewMode === 'books_3b' || purchaseMatrixViewMode === 'drc01c') && (
                                                                <>
                                                                    <td className="p-1 text-right bg-purple-50/20">
                                                                        <input
                                                                            type="number"
                                                                            value={row.gstr3b?.cgst === 0 ? '' : row.gstr3b?.cgst}
                                                                            placeholder="0"
                                                                            onChange={(e) => handleUpdatePurchaseMatrixCell(idx, 'gstr3b', 'cgst', e.target.value)}
                                                                            disabled={!isJuniorAllowedToEdit}
                                                                            className="w-20 px-1.5 py-1 text-right text-xs font-mono bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500 disabled:bg-slate-50 disabled:text-slate-500"
                                                                        />
                                                                    </td>
                                                                    <td className="p-1 text-right bg-purple-50/20">
                                                                        <input
                                                                            type="number"
                                                                            value={row.gstr3b?.sgst === 0 ? '' : row.gstr3b?.sgst}
                                                                            placeholder="0"
                                                                            onChange={(e) => handleUpdatePurchaseMatrixCell(idx, 'gstr3b', 'sgst', e.target.value)}
                                                                            disabled={!isJuniorAllowedToEdit}
                                                                            className="w-20 px-1.5 py-1 text-right text-xs font-mono bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500 disabled:bg-slate-50 disabled:text-slate-500"
                                                                        />
                                                                    </td>
                                                                    <td className="p-1 text-right bg-purple-50/20">
                                                                        <input
                                                                            type="number"
                                                                            value={row.gstr3b?.igst === 0 ? '' : row.gstr3b?.igst}
                                                                            placeholder="0"
                                                                            onChange={(e) => handleUpdatePurchaseMatrixCell(idx, 'gstr3b', 'igst', e.target.value)}
                                                                            disabled={!isJuniorAllowedToEdit}
                                                                            className="w-20 px-1.5 py-1 text-right text-xs font-mono bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500 disabled:bg-slate-50 disabled:text-slate-500"
                                                                        />
                                                                    </td>
                                                                    <td className="p-1 text-right bg-purple-50/20">
                                                                        <input
                                                                            type="number"
                                                                            value={row.gstr3b?.cess === 0 ? '' : row.gstr3b?.cess}
                                                                            placeholder="0"
                                                                            onChange={(e) => handleUpdatePurchaseMatrixCell(idx, 'gstr3b', 'cess', e.target.value)}
                                                                            disabled={!isJuniorAllowedToEdit}
                                                                            className="w-20 px-1.5 py-1 text-right text-xs font-mono bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500 disabled:bg-slate-50 disabled:text-slate-500"
                                                                        />
                                                                    </td>
                                                                    <td className="p-1 text-right bg-purple-50/20">
                                                                        <input
                                                                            type="number"
                                                                            value={row.gstr3b?.nilRated === 0 ? '' : row.gstr3b?.nilRated}
                                                                            placeholder="0"
                                                                            onChange={(e) => handleUpdatePurchaseMatrixCell(idx, 'gstr3b', 'nilRated', e.target.value)}
                                                                            disabled={!isJuniorAllowedToEdit}
                                                                            className="w-20 px-1.5 py-1 text-right text-xs font-mono bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500 disabled:bg-slate-50 disabled:text-slate-500"
                                                                        />
                                                                    </td>
                                                                    <td className="p-1.5 text-right font-mono font-bold text-purple-950 bg-purple-100/30">
                                                                        ₹{threeBRowTotal.toLocaleString('en-IN')}
                                                                    </td>
                                                                </>
                                                            )}

                                                            {/* Block 5: Diff Books vs 3B */}
                                                            {(purchaseMatrixViewMode === 'all' || purchaseMatrixViewMode === 'books_3b') && (
                                                                <>
                                                                    {renderDiffCell((row.books?.cgst || 0) - (row.gstr3b?.cgst || 0))}
                                                                    {renderDiffCell((row.books?.sgst || 0) - (row.gstr3b?.sgst || 0))}
                                                                    {renderDiffCell((row.books?.igst || 0) - (row.gstr3b?.igst || 0))}
                                                                    {renderDiffCell((row.books?.cess || 0) - (row.gstr3b?.cess || 0))}
                                                                    {renderDiffCell((row.books?.nilRated || 0) - (row.gstr3b?.nilRated || 0))}
                                                                    {renderDiffCell(booksRowTotal - threeBRowTotal)}
                                                                </>
                                                            )}

                                                            {/* DRC-01C View Diff: 3B vs 2B (Rule 88D) */}
                                                            {purchaseMatrixViewMode === 'drc01c' && (
                                                                <>
                                                                    {renderDiffCell((row.gstr3b?.cgst || 0) - (row.gstr2b?.cgst || 0))}
                                                                    {renderDiffCell((row.gstr3b?.sgst || 0) - (row.gstr2b?.sgst || 0))}
                                                                    {renderDiffCell((row.gstr3b?.igst || 0) - (row.gstr2b?.igst || 0))}
                                                                    {renderDiffCell((row.gstr3b?.cess || 0) - (row.gstr2b?.cess || 0))}
                                                                    {renderDiffCell((row.gstr3b?.nilRated || 0) - (row.gstr2b?.nilRated || 0))}
                                                                    {renderDiffCell(threeBRowTotal - twoBRowTotal)}
                                                                </>
                                                            )}
                                                        </tr>
                                                    );
                                                })}

                                                {/* 13th Row: Full FY Total */}
                                                <tr className="bg-slate-900 text-white font-bold divide-x divide-slate-800 text-xs">
                                                    <td className="sticky left-0 z-20 bg-slate-950 text-amber-400 p-2.5 font-bold border-r border-slate-800 whitespace-nowrap">
                                                        FULL FY TOTAL (APR - MAR)
                                                    </td>
                                                    {/* Books FY Totals */}
                                                    {(purchaseMatrixViewMode === 'all' || purchaseMatrixViewMode === 'books_2b' || purchaseMatrixViewMode === 'books_3b') && (
                                                        <>
                                                            <td className="p-2 text-right font-mono text-slate-100">₹{purchaseMatrixTotals.books.cgst.toLocaleString('en-IN')}</td>
                                                            <td className="p-2 text-right font-mono text-slate-100">₹{purchaseMatrixTotals.books.sgst.toLocaleString('en-IN')}</td>
                                                            <td className="p-2 text-right font-mono text-slate-100">₹{purchaseMatrixTotals.books.igst.toLocaleString('en-IN')}</td>
                                                            <td className="p-2 text-right font-mono text-slate-100">₹{purchaseMatrixTotals.books.cess.toLocaleString('en-IN')}</td>
                                                            <td className="p-2 text-right font-mono text-slate-100">₹{purchaseMatrixTotals.books.nilRated.toLocaleString('en-IN')}</td>
                                                            <td className="p-2 text-right font-mono text-amber-300 font-bold">₹{purchaseMatrixTotals.books.totalTax.toLocaleString('en-IN')}</td>
                                                        </>
                                                    )}
                                                    {/* GSTR-2B FY Totals */}
                                                    {(purchaseMatrixViewMode === 'all' || purchaseMatrixViewMode === 'books_2b' || purchaseMatrixViewMode === 'drc01c') && (
                                                        <>
                                                            <td className="p-2 text-right font-mono text-slate-100">₹{purchaseMatrixTotals.gstr2b.cgst.toLocaleString('en-IN')}</td>
                                                            <td className="p-2 text-right font-mono text-slate-100">₹{purchaseMatrixTotals.gstr2b.sgst.toLocaleString('en-IN')}</td>
                                                            <td className="p-2 text-right font-mono text-slate-100">₹{purchaseMatrixTotals.gstr2b.igst.toLocaleString('en-IN')}</td>
                                                            <td className="p-2 text-right font-mono text-slate-100">₹{purchaseMatrixTotals.gstr2b.cess.toLocaleString('en-IN')}</td>
                                                            <td className="p-2 text-right font-mono text-slate-100">₹{purchaseMatrixTotals.gstr2b.nilRated.toLocaleString('en-IN')}</td>
                                                            <td className="p-2 text-right font-mono text-amber-300 font-bold">₹{purchaseMatrixTotals.gstr2b.totalTax.toLocaleString('en-IN')}</td>
                                                        </>
                                                    )}
                                                    {/* Diff Books vs 2B FY Totals */}
                                                    {(purchaseMatrixViewMode === 'all' || purchaseMatrixViewMode === 'books_2b') && (
                                                        <>
                                                            {renderDiffTotalCell(purchaseMatrixTotals.diff2b.cgst)}
                                                            {renderDiffTotalCell(purchaseMatrixTotals.diff2b.sgst)}
                                                            {renderDiffTotalCell(purchaseMatrixTotals.diff2b.igst)}
                                                            {renderDiffTotalCell(purchaseMatrixTotals.diff2b.cess)}
                                                            {renderDiffTotalCell(purchaseMatrixTotals.diff2b.nilRated)}
                                                            {renderDiffTotalCell(purchaseMatrixTotals.diff2b.totalTax)}
                                                        </>
                                                    )}
                                                    {/* GSTR-3B FY Totals */}
                                                    {(purchaseMatrixViewMode === 'all' || purchaseMatrixViewMode === 'books_3b' || purchaseMatrixViewMode === 'drc01c') && (
                                                        <>
                                                            <td className="p-2 text-right font-mono text-slate-100">₹{purchaseMatrixTotals.gstr3b.cgst.toLocaleString('en-IN')}</td>
                                                            <td className="p-2 text-right font-mono text-slate-100">₹{purchaseMatrixTotals.gstr3b.sgst.toLocaleString('en-IN')}</td>
                                                            <td className="p-2 text-right font-mono text-slate-100">₹{purchaseMatrixTotals.gstr3b.igst.toLocaleString('en-IN')}</td>
                                                            <td className="p-2 text-right font-mono text-slate-100">₹{purchaseMatrixTotals.gstr3b.cess.toLocaleString('en-IN')}</td>
                                                            <td className="p-2 text-right font-mono text-slate-100">₹{purchaseMatrixTotals.gstr3b.nilRated.toLocaleString('en-IN')}</td>
                                                            <td className="p-2 text-right font-mono text-amber-300 font-bold">₹{purchaseMatrixTotals.gstr3b.totalTax.toLocaleString('en-IN')}</td>
                                                        </>
                                                    )}
                                                    {/* Diff Books vs 3B FY Totals */}
                                                    {(purchaseMatrixViewMode === 'all' || purchaseMatrixViewMode === 'books_3b') && (
                                                        <>
                                                            {renderDiffTotalCell(purchaseMatrixTotals.diff3b.cgst)}
                                                            {renderDiffTotalCell(purchaseMatrixTotals.diff3b.sgst)}
                                                            {renderDiffTotalCell(purchaseMatrixTotals.diff3b.igst)}
                                                            {renderDiffTotalCell(purchaseMatrixTotals.diff3b.cess)}
                                                            {renderDiffTotalCell(purchaseMatrixTotals.diff3b.nilRated)}
                                                            {renderDiffTotalCell(purchaseMatrixTotals.diff3b.totalTax)}
                                                        </>
                                                    )}
                                                    {/* DRC-01C Diff FY Totals */}
                                                    {purchaseMatrixViewMode === 'drc01c' && (
                                                        <>
                                                            {renderDiffTotalCell(purchaseMatrixTotals.diffDrc.cgst)}
                                                            {renderDiffTotalCell(purchaseMatrixTotals.diffDrc.sgst)}
                                                            {renderDiffTotalCell(purchaseMatrixTotals.diffDrc.igst)}
                                                            {renderDiffTotalCell(purchaseMatrixTotals.diffDrc.cess)}
                                                            {renderDiffTotalCell(purchaseMatrixTotals.diffDrc.nilRated)}
                                                            {renderDiffTotalCell(purchaseMatrixTotals.diffDrc.totalTax)}
                                                        </>
                                                    )}
                                                </tr>
                                            </tbody>
                                        </table>
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

                        {/* 3.3 Journal & TDS View */}
                        {verificationSubTab === 'journal' && (
                            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-4">
                                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                                    3.3 Journal Vouchers &amp; TDS Statutory Deductions (194C, 194Q, 194J)
                                </h3>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                                    <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl">
                                        <span className="text-slate-500 font-bold uppercase tracking-wider block mb-1">Suspense Accounts Detected</span>
                                        <span className="text-lg font-bold font-mono text-amber-700">
                                            {verification?.journal?.suspenseEntriesCount ?? 0} (₹{(verification?.journal?.suspenseAmount ?? 0).toLocaleString('en-IN')})
                                        </span>
                                    </div>
                                    <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl">
                                        <span className="text-slate-500 font-bold uppercase tracking-wider block mb-1">Transporter 194C(6) Missing PAN</span>
                                        <span className="text-lg font-bold font-mono text-rose-700">{verification?.journal?.tds194C_MissingPanCount ?? 0} Vouchers</span>
                                    </div>
                                    <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl">
                                        <span className="text-slate-500 font-bold uppercase tracking-wider block mb-1">194Q High Volume (&gt; ₹50L)</span>
                                        <span className="text-lg font-bold font-mono text-blue-700">{verification?.journal?.tds194Q_HighVolumeCount ?? 0} Vendors</span>
                                    </div>
                                </div>
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
                                                <th className="p-3 w-[22%]">1. Type</th>
                                                <th className="p-3 w-[26%]">2. Account / Facility Name</th>
                                                <th className="p-3 w-[18%] text-right">3. Balance (₹)</th>
                                                <th className="p-3 w-[30%]">4. Status (Match / Not Matched / Self Comment) &amp; Comment</th>
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
                                                        <td className="p-2.5 align-top text-right">
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
                                                        <td className="p-2.5 align-top space-y-1.5">
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
                                                <th className="p-3 w-[14%] text-right">3. Loan Amount (₹)</th>
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
                                                        <td className="p-2.5 align-top text-right">
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
                                    Categorized audit observations with risk severity and management responses.
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={() => setObsModalOpen(true)}
                                disabled={!isJuniorAllowedToEdit}
                                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition shadow-xs ${
                                    isJuniorAllowedToEdit
                                        ? 'bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer'
                                        : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                                }`}
                            >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Record Observation</span>
                            </button>
                        </div>

                        {/* Observations List */}
                        <div className="space-y-3">
                            {observations.length === 0 ? (
                                <div className="bg-white rounded-2xl border border-slate-200/80 p-8 text-center text-xs text-slate-500 shadow-xs">
                                    No observations recorded for this month. Click "Record Observation" or "Auto-Populate" to scan.
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
                                                <span className="text-slate-500 italic">{obs.managementResponse || 'Pending Client Input'}</span>
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
                                    {availableSeniorOptions.map((opt) => (
                                        <option key={opt} value={opt}>{opt}</option>
                                    ))}
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
                                        'Schedule III P&L numbers cross-verified with Book1.xlsx.'
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
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
                        <div className="flex items-center justify-between">
                            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                <AlertCircle className="w-5 h-5 text-rose-600" />
                                <span>Request Working Paper Revision</span>
                            </h3>
                            <button type="button" onClick={() => setRevisionModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <p className="text-xs text-slate-500">
                            Provide clear instructions for the junior auditor regarding data mismatches or required vouchers.
                        </p>
                        <textarea
                            rows={4}
                            value={revisionNotes}
                            onChange={(e) => setRevisionNotes(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                            placeholder="Enter senior review feedback..."
                        />
                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setRevisionModalOpen(false)}
                                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-semibold hover:bg-slate-200"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleRequestRevision}
                                className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 shadow-sm"
                            >
                                Send Revision Request
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

            {/* ─── Modal 3: Add Observation Modal ────────────────────────────────── */}
            {obsModalOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
                        <div className="flex items-center justify-between">
                            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5 text-indigo-600" />
                                <span>Record Audit Observation</span>
                            </h3>
                            <button type="button" onClick={() => setObsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-3 text-xs">
                            <div>
                                <label className="block text-slate-600 font-semibold mb-1">Section</label>
                                <select
                                    value={newObs.sectionKey}
                                    onChange={(e) => setNewObs(prev => ({ ...prev, sectionKey: e.target.value }))}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:outline-none focus:border-indigo-500"
                                >
                                    <option value="sales">3.1 Sales (Reco R1)</option>
                                    <option value="purchase">3.2 Purchase (Reco 2B)</option>
                                    <option value="journal">3.3 Journal &amp; TDS</option>
                                    <option value="bank">3.4 Bank &amp; Loans</option>
                                    <option value="roc">3.5 ROC Charges</option>
                                    <option value="cash">3.6 Cash &amp; Fixed Assets</option>
                                    <option value="labor">4.1 Labor Compliances</option>
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="block text-slate-600 font-semibold mb-1">Severity</label>
                                    <select
                                        value={newObs.severity}
                                        onChange={(e) => setNewObs(prev => ({ ...prev, severity: e.target.value as any }))}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:outline-none focus:border-indigo-500"
                                    >
                                        <option value="Critical">Critical</option>
                                        <option value="High">High</option>
                                        <option value="Medium">Medium</option>
                                        <option value="Low">Low</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-slate-600 font-semibold mb-1">Financial Exposure (₹)</label>
                                    <input
                                        type="number"
                                        value={newObs.financialExposure}
                                        onChange={(e) => setNewObs(prev => ({ ...prev, financialExposure: Number(e.target.value) || 0 }))}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 font-mono focus:outline-none focus:border-indigo-500"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-slate-600 font-semibold mb-1">Title</label>
                                <input
                                    type="text"
                                    value={newObs.title}
                                    onChange={(e) => setNewObs(prev => ({ ...prev, title: e.target.value }))}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:outline-none focus:border-indigo-500"
                                    placeholder="Observation title..."
                                />
                            </div>

                            <div>
                                <label className="block text-slate-600 font-semibold mb-1">Description</label>
                                <textarea
                                    rows={3}
                                    value={newObs.description}
                                    onChange={(e) => setNewObs(prev => ({ ...prev, description: e.target.value }))}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:outline-none focus:border-indigo-500"
                                    placeholder="Detailed finding..."
                                />
                            </div>

                            <div>
                                <label className="block text-slate-600 font-semibold mb-1">Auditor Suggested Action</label>
                                <input
                                    type="text"
                                    value={newObs.auditorRecommendation}
                                    onChange={(e) => setNewObs(prev => ({ ...prev, auditorRecommendation: e.target.value }))}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 focus:outline-none focus:border-indigo-500"
                                    placeholder="Action recommended..."
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setObsModalOpen(false)}
                                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-semibold hover:bg-slate-200"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleAddObservation}
                                className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 shadow-sm"
                            >
                                Save Observation
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
        </div>
    );
}
