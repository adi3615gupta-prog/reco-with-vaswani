import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Calculator, IndianRupee, PieChart, ShieldCheck, TrendingUp, Landmark, FileText, Download, ArrowLeft, Info, FileSpreadsheet, Upload, X } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { IncomeType, RegimeType, EntityType } from '@/lib/incomeTaxTypes';
import { apiPost, apiGet } from '@/lib/api';
import { jsPDF } from 'jspdf';
import ExcelJS from 'exceljs';

// Sub-form Imports
import SalaryDetailForm from '@/components/tax/SalaryDetailForm';
import HousePropertyDetailForm from '@/components/tax/HousePropertyDetailForm';
import PgbpDetailForm from '@/components/tax/PgbpDetailForm';
import CapitalGainsDetailForm from '@/components/tax/CapitalGainsDetailForm';
import IfosClubbingDetailForm from '@/components/tax/IfosClubbingDetailForm';

// Engine types
import { RawSalaryComponents } from '@/lib/salaryTypes';
import { HousePropertyRecord } from '@/lib/housePropertyTypes';
import { PresumptiveBusinessRecord, RegularBusinessRecord, PgbpSection } from '@/lib/pgbpTypes';
import { CapitalAssetRecord } from '@/lib/capitalGainsTypes';
import { IfosRecord } from '@/lib/ifosTypes';
import { ClubbingRecord } from '@/lib/clubbingTypes';

// ─── HELPER COMPONENTS ─────────────────────────────────────────

interface CurrencyInputProps {
  value: number;
  onChange: (val: number) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

/**
 * CurrencyInput - Dynamically formats numeric input values to Indian Grouping style.
 * Displays formatted currency (e.g. 1,25,000) when blurred, and raw numbers (e.g. 125000) when focused.
 */
const CurrencyInput = ({ value, onChange, disabled, placeholder, className }: CurrencyInputProps) => {
  const [focused, setFocused] = useState(false);
  const [localValue, setLocalValue] = useState(value ? value.toString() : '');

  useEffect(() => {
    if (!focused) {
      setLocalValue(value ? value.toString() : '');
    }
  }, [value, focused]);

  const displayValue = focused
    ? localValue
    : (value ? new Intl.NumberFormat('en-IN').format(value) : '');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9.]/g, '');
    setLocalValue(raw);
    const num = parseFloat(raw) || 0;
    onChange(num);
  };

  return (
    <div className="relative flex items-center w-full">
      <span className="absolute left-3 text-zinc-500 text-xs font-semibold select-none">₹</span>
      <Input
        type="text"
        value={displayValue}
        onChange={handleChange}
        onFocus={() => {
          setFocused(true);
          setLocalValue(value ? value.toString() : '');
        }}
        onBlur={() => setFocused(false)}
        disabled={disabled}
        placeholder={placeholder || '0'}
        className={`pl-7 text-right font-mono tracking-tight bg-zinc-950/40 border-zinc-800 focus:border-blue-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
      />
    </div>
  );
};

/**
 * StatutoryTooltip - Inline info tooltip next to technical section codes.
 */
const StatutoryTooltip = ({ section, explanation }: { section: string; explanation: string }) => {
  return (
    <span className="group relative inline-flex items-center ml-1.5 cursor-help select-none">
      <span className="text-[9px] font-bold text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded hover:bg-blue-500/20 hover:text-blue-300 transition-colors uppercase tracking-wider">
        {section}
      </span>
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-2 bg-zinc-950 border border-zinc-800 text-zinc-300 text-[10px] rounded-lg shadow-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-all duration-200 z-50 normal-case font-normal leading-relaxed text-center">
        {explanation}
        <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-950"></span>
      </span>
    </span>
  );
};

export default function IncomeTaxDashboard({ onBack }: { onBack?: () => void }) {
  const { toast } = useToast();

  // ─── STATE MANAGEMENT ──────────────────────────────────────────

  // Profile
  const [profile, setProfile] = useState<any>({
    financial_year: 'FY2025-26',
    assessment_year: 'AY2026-27',
    age: 35,
    opted_for_new_regime: true,
    residential_status: 'ROR',
    entity_type: 'INDIVIDUAL',
    company_turnover_under_400cr: false,
    corporate_tax_section: 'NORMAL'
  });

  // Income States
  const [salary, setSalary] = useState({ gross: 0, exemptions: 0 });
  const [houseProperty, setHouseProperty] = useState({ gav: 0, municipalTaxes: 0, interest24b: 0 });
  const [business, setBusiness] = useState({ netProfit: 0, depreciation: 0 });
  const [capitalGains, setCapitalGains] = useState({ stcg111A: 0, stcgOther: 0, ltcg112A: 0, ltcg112: 0 });
  const [otherSources, setOtherSources] = useState({ interest: 0, dividend: 0, casual: 0 });

  // Detailed raw component states
  const [salaryRaw, setSalaryRaw] = useState<RawSalaryComponents | undefined>(undefined);
  const [hpRaw, setHpRaw] = useState<HousePropertyRecord[] | undefined>(undefined);
  const [pgbpPresumptiveRaw, setPgbpPresumptiveRaw] = useState<PresumptiveBusinessRecord[] | undefined>(undefined);
  const [pgbpRegularRaw, setPgbpRegularRaw] = useState<RegularBusinessRecord[] | undefined>(undefined);
  const [cgRaw, setCgRaw] = useState<CapitalAssetRecord[] | undefined>(undefined);
  const [ifosRaw, setIfosRaw] = useState<IfosRecord | undefined>(undefined);
  const [clubbingRaw, setClubbingRaw] = useState<ClubbingRecord[] | undefined>(undefined);

  // Dialog toggle states
  const [isSalaryOpen, setIsSalaryOpen] = useState(false);
  const [isHpOpen, setIsHpOpen] = useState(false);
  const [isPgbpOpen, setIsPgbpOpen] = useState(false);
  const [isCgOpen, setIsCgOpen] = useState(false);
  const [isIfosOpen, setIsIfosOpen] = useState(false);

  // Save Handlers
  const handleSaveSalary = (computed: any, raw: RawSalaryComponents) => {
    setSalaryRaw(raw);
    setSalary({
      gross: computed.grossSalary.toNumber(),
      exemptions: computed.exemptions.hra.toNumber() +
                  computed.exemptions.gratuity.toNumber() +
                  computed.exemptions.leaveSalary.toNumber() +
                  computed.exemptions.commutedPension.toNumber() +
                  computed.exemptions.childrenEducation.toNumber() +
                  computed.exemptions.transport.toNumber()
    });
    toast({ title: 'Salary components calculated successfully!' });
  };

  const handleSaveHP = (computed: any, raw: HousePropertyRecord[]) => {
    setHpRaw(raw);
    setHouseProperty({
      gav: computed.properties.reduce((acc: number, p: any) => acc + p.grossAnnualValue.toNumber(), 0),
      municipalTaxes: computed.properties.reduce((acc: number, p: any) => acc + p.municipalTaxesDeducted.toNumber(), 0),
      interest24b: computed.properties.reduce((acc: number, p: any) => acc + p.interestDeduction24b.toNumber(), 0)
    });
    toast({ title: 'Property portfolio updated!' });
  };

  const handleSavePgbp = (computed: any, presumptive: PresumptiveBusinessRecord[], regular: RegularBusinessRecord[]) => {
    setPgbpPresumptiveRaw(presumptive);
    setPgbpRegularRaw(regular);
    setBusiness({
      netProfit: computed.totalPgbpIncome.toNumber() - computed.totalLossToSetOff.toNumber(),
      depreciation: 0
    });
    toast({ title: 'PGBP Business Income calculated!' });
  };

  const handleSaveCG = (computed: any, raw: CapitalAssetRecord[]) => {
    setCgRaw(raw);
    setCapitalGains({
      stcg111A: computed.totalSTCG111A.toNumber(),
      stcgOther: computed.totalSTCGNormal.toNumber(),
      ltcg112A: computed.totalLTCG112A.toNumber(),
      ltcg112: computed.totalLTCG112.toNumber()
    });
    toast({ title: 'Asset transfers computed u/s 45!' });
  };

  const handleSaveIfos = (computedIfos: any, rawIfos: IfosRecord, computedClubbing: any, rawClubbing: ClubbingRecord[]) => {
    setIfosRaw(rawIfos);
    setClubbingRaw(rawClubbing);
    setOtherSources({
      interest: rawIfos.interestOnBankDeposits + rawIfos.interestOnIncomeTaxRefund + rawIfos.interestOnCompulsoryAcquisition * 0.5 + computedClubbing.totalIfosClubbed.toNumber(),
      dividend: rawIfos.dividends,
      casual: rawIfos.casualIncomeLotteries
    });
    
    if (computedClubbing.totalSalaryClubbed.gt(0)) {
      setSalary(prev => ({ ...prev, gross: prev.gross + computedClubbing.totalSalaryClubbed.toNumber() }));
    }
    if (computedClubbing.totalHousePropertyClubbed.gt(0)) {
      setHouseProperty(prev => ({ ...prev, gav: prev.gav + computedClubbing.totalHousePropertyClubbed.toNumber() }));
    }
    if (computedClubbing.totalPgbpClubbed.gt(0)) {
      setBusiness(prev => ({ ...prev, netProfit: prev.netProfit + computedClubbing.totalPgbpClubbed.toNumber() }));
    }
    if (computedClubbing.totalCapitalGainsClubbed.gt(0)) {
      setCapitalGains(prev => ({ ...prev, stcgOther: prev.stcgOther + computedClubbing.totalCapitalGainsClubbed.toNumber() }));
    }
    toast({ title: 'IFOS & Clubbing synced successfully!' });
  };

  // Deductions
  const [deductions, setDeductions] = useState<Record<string, number>>({
    '80C': 0, '80D': 0, '80CCD1B': 0, '80CCD2': 0, '80TTA': 0, '80TTB': 0
  });

  // Assessment Result
  const [assessment, setAssessment] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [showNotes, setShowNotes] = useState(true);
  const [summaryView, setSummaryView] = useState<'statement' | 'worksheet'>('statement');

  // AIS Import Staged Data & Modal
  const [aisImportModalOpen, setAisImportModalOpen] = useState(false);
  const [aisImportData, setAisImportData] = useState<any[]>([]);
  const [selectedAisIds, setSelectedAisIds] = useState<string[]>([]);
  const [uploadingAis, setUploadingAis] = useState(false);
  const [importedFingerprints, setImportedFingerprints] = useState<string[]>([]);
  const [complianceDisclosures, setComplianceDisclosures] = useState<any[]>([]);

  // ── LevitateExtract: Form 26AS PDF → Excel ──────────────────────────
  const [levitateStatus, setLevitateStatus] = useState<'idle' | 'validating' | 'parsing' | 'downloading' | 'done' | 'error'>('idle');
  const [levitateError, setLevitateError] = useState<string>('');
  const [levitateRows, setLevitateRows] = useState<number>(0);
  const [levitateChecksum, setLevitateChecksum] = useState<string>('');

  const handleLevitateExtract = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // Reset input

    setLevitateError('');
    setLevitateRows(0);
    setLevitateChecksum('');

    // Client-side pre-validation
    if (file.size > 10 * 1024 * 1024) {
      setLevitateStatus('error');
      setLevitateError(`File size (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds the 10 MB limit.`);
      return;
    }

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'pdf' && ext !== 'txt') {
      setLevitateStatus('error');
      setLevitateError('Please upload a .pdf or .txt file.');
      return;
    }

    setLevitateStatus('validating');

    try {
      const formData = new FormData();
      formData.append('file', file);

      setLevitateStatus('parsing');

      const res = await fetch('/api/tax/extract-26as-pdf', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errData.error || `Server returned ${res.status}`);
      }

      // Extract metadata headers
      const rowCount = parseInt(res.headers.get('X-LevitateExtract-Rows') || '0', 10);
      const checksumStatus = res.headers.get('X-LevitateExtract-Checksum') || 'unknown';
      setLevitateRows(rowCount);
      setLevitateChecksum(checksumStatus);

      setLevitateStatus('downloading');

      // Stream the blob and trigger download
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const disposition = res.headers.get('Content-Disposition');
      const filenameMatch = disposition?.match(/filename="?([^"]+)"?/);
      a.download = filenameMatch?.[1] || `Form_26AS_Extract_${Date.now()}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();

      setLevitateStatus('done');
      toast({
        title: '✅ Form 26AS Extracted',
        description: `${rowCount} TDS records extracted and downloaded. Checksum: ${checksumStatus}.`,
      });

      // Reset after 5s
      setTimeout(() => setLevitateStatus('idle'), 5000);

    } catch (err: any) {
      console.error('[LevitateExtract]', err);
      setLevitateStatus('error');
      setLevitateError(err.message || String(err));
      toast({
        title: '❌ LevitateExtract Failed',
        description: err.message || String(err),
        variant: 'destructive',
      });
    }
  };

  const handleAisUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAis(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      // Post file to Express backend
      const res = await fetch(`/api/tax/import/ais-json?profile_id=CURRENT_USER`, {
        method: 'POST',
        body: formData,
      });

      const resData = await res.json();
      if (!res.ok || !resData.success) {
        throw new Error(resData.error || 'Failed to import AIS JSON');
      }

      setAisImportData(resData.data);
      
      // Auto-select only non-duplicate rows by default
      const nonDuplicates = resData.data.filter((item: any) => {
        const fp = `${(item.source || '').trim()}_${Number(item.amount)}_${(item.sectionCode || '').trim()}`;
        return !importedFingerprints.includes(fp);
      });
      setSelectedAisIds(nonDuplicates.map((item: any) => item.id));
      
      setAisImportModalOpen(true);
      toast({
        title: 'AIS JSON Parsed Successfully',
        description: `Successfully loaded ${resData.data.length} transactions from the document.`
      });
    } catch (err: any) {
      console.error(err);
      toast({
        title: 'AIS Import Failed',
        description: err.message || String(err),
        variant: 'destructive'
      });
    } finally {
      setUploadingAis(false);
      // Clear input so same file can be uploaded again
      e.target.value = '';
    }
  };

  const handleApproveAisImport = () => {
    // 1. Filter out the selected items
    const selectedItems = aisImportData.filter(item => selectedAisIds.includes(item.id));
    if (selectedItems.length === 0) {
      setAisImportModalOpen(false);
      return;
    }

    // 2. Secondary Filter: Strict Merge Guard (with batch / intra-file checks)
    const uniqueItemsToImport = [];
    let duplicateCount = 0;
    const seenFingerprintsInBatch = new Set<string>();
    const newFingerprints = [...importedFingerprints];

    selectedItems.forEach(item => {
      const fp = `${(item.source || '').trim()}_${Number(item.amount)}_${(item.sectionCode || '').trim()}`;
      if (importedFingerprints.includes(fp) || seenFingerprintsInBatch.has(fp)) {
        duplicateCount++;
      } else {
        seenFingerprintsInBatch.add(fp);
        uniqueItemsToImport.push(item);
        newFingerprints.push(fp);
      }
    });

    if (uniqueItemsToImport.length === 0) {
      setAisImportModalOpen(false);
      toast({
        title: 'Import Blocked',
        description: `Blocked all ${duplicateCount} duplicate transaction(s). No new data was imported.`,
        variant: 'destructive'
      });
      return;
    }

    // 3. Clear existing states before writing the new arrays (Frontend State Flushing)
    let updatedSalary = { gross: 0, exemptions: 0 };
    let updatedHouseProperty = { gav: 0, municipalTaxes: 0, interest24b: 0 };
    let updatedBusiness = { netProfit: 0, depreciation: 0 };
    let updatedCapitalGains = { stcg111A: 0, stcgOther: 0, ltcg112A: 0, ltcg112: 0 };
    let updatedOtherSources = { interest: 0, dividend: 0, casual: 0 };
    let updatedDeductions = {
      '80C': 0, '80D': 0, '80CCD1B': 0, '80CCD2': 0, '80TTA': 0, '80TTB': 0
    };
    const updatedCompliance: any[] = [];

    // 4. Map the new transactions
    uniqueItemsToImport.forEach(item => {
      const amt = Number(item.amount);
      const desc = (item.transactionDescription || item.description || '').toLowerCase();
      const sec = (item.sectionCode || '').toUpperCase();

      // Rule 1. Chapter VI-A Deductions (Intercept First):
      // If sectionCode or transactionDescription includes "80C" or "ELSS", add the amount to deductions['80C'].
      // If it includes "80D" or "Health Insurance", add the amount to deductions['80D'].
      // (Do NOT add these to any income arrays).
      if (sec.includes('80C') || desc.includes('80c') || desc.includes('elss')) {
        updatedDeductions['80C'] += amt;
        return;
      }
      if (sec.includes('80D') || desc.includes('80d') || desc.includes('health insurance')) {
        updatedDeductions['80D'] += amt;
        return;
      }

      // Rule 2. Informational Disclosures (Do not aggregate into income):
      // If it includes "Sub-Registrar", "Credit Card", or "Forex / Remittance", ignore it (or push to a disclosures array). Do not add to any income state.
      const isDisclosure =
        sec.includes('SUB-REGISTRAR') || desc.includes('sub-registrar') ||
        sec.includes('CREDIT CARD') || desc.includes('credit card') ||
        sec.includes('FOREX') || desc.includes('forex') ||
        sec.includes('REMITTANCE') || desc.includes('remittance') ||
        item.suggestedCategory === 'COMPLIANCE';

      if (isDisclosure) {
        updatedCompliance.push({
          source: item.source || 'AIS SFT Disclosure',
          description: item.transactionDescription || item.description || 'Informational Disclosure',
          amount: amt
        });
        return;
      }

      // Rule 3. Specific Income Head Routing:
      // Salary: 192 -> salary.gross.
      if (sec === '192' || sec.includes('192') || desc.includes('192')) {
        updatedSalary.gross += amt;
        return;
      }

      // House Property: 194I -> houseProperty.gav.
      if (sec === '194I' || sec.includes('194I') || desc.includes('194i')) {
        updatedHouseProperty.gav += amt;
        return;
      }

      // Business (PGBP): 194C, 194J, OR 194T -> business.netProfit.
      if (
        sec === '194C' || sec.includes('194C') || desc.includes('194c') ||
        sec === '194J' || sec.includes('194J') || desc.includes('194j') ||
        sec === '194T' || sec.includes('194T') || desc.includes('194t')
      ) {
        updatedBusiness.netProfit += amt;
        return;
      }

      // Capital Gains:
      // * If includes "111A" -> capitalGains.stcg111A.
      // * If includes "112A" -> capitalGains.ltcg112A.
      if (sec.includes('111A') || desc.includes('111a')) {
        updatedCapitalGains.stcg111A += amt;
        return;
      }
      if (sec.includes('112A') || desc.includes('112a')) {
        updatedCapitalGains.ltcg112A += amt;
        return;
      }
      // General Capital Gains fallback (if suggested category is CAPITAL_GAINS or it includes 111/112)
      if (item.suggestedCategory === 'CAPITAL_GAINS' || sec.includes('112') || sec.includes('111') || desc.includes('112') || desc.includes('111')) {
        if (desc.includes('immovable property') || desc.includes('immovable') || desc.includes('property')) {
          updatedCapitalGains.ltcg112 += amt;
        } else {
          updatedCapitalGains.stcgOther += amt;
        }
        return;
      }

      // Casual Income (30%): 194B, 194BA, 194BB, OR 194S -> otherSources.casual.
      if (
        sec === '194B' || sec.includes('194B') || desc.includes('194b') ||
        sec === '194BA' || sec.includes('194BA') || desc.includes('194ba') ||
        sec === '194BB' || sec.includes('194BB') || desc.includes('194bb') ||
        sec === '194S' || sec.includes('194S') || desc.includes('194s')
      ) {
        updatedOtherSources.casual += amt;
        return;
      }

      // Other Sources (Normal): 194A, 194 (Dividend) -> otherSources.interest / dividend.
      if (sec === '194A' || sec.includes('194A') || desc.includes('194a')) {
        updatedOtherSources.interest += amt;
        return;
      }
      if (sec === '194' || desc.includes('dividend')) {
        updatedOtherSources.dividend += amt;
        return;
      }

      // Default routing fallback based on suggestedCategory if none of the explicit rules match
      switch (item.suggestedCategory) {
        case 'SALARY':
          updatedSalary.gross += amt;
          break;
        case 'BUSINESS':
          updatedBusiness.netProfit += amt;
          break;
        case 'CASUAL_INCOME':
          updatedOtherSources.casual += amt;
          break;
        case 'OTHER_SOURCES':
        default:
          if (desc.includes('dividend')) {
            updatedOtherSources.dividend += amt;
          } else {
            updatedOtherSources.interest += amt;
          }
          break;
      }
    });

    // Save states
    setSalary(updatedSalary);
    setHouseProperty(updatedHouseProperty);
    setBusiness(updatedBusiness);
    setCapitalGains(updatedCapitalGains);
    setOtherSources(updatedOtherSources);
    setDeductions(updatedDeductions);
    setComplianceDisclosures(updatedCompliance);
    
    // Save new fingerprints to state
    setImportedFingerprints(newFingerprints);

    setAisImportModalOpen(false);

    if (duplicateCount > 0) {
      toast({
        title: 'AIS Items Imported with Guard',
        description: `Imported ${uniqueItemsToImport.length} new items. Safely blocked ${duplicateCount} duplicate records.`,
        variant: 'default'
      });
    } else {
      toast({
        title: 'AIS Items Imported',
        description: `Imported ${uniqueItemsToImport.length} transactions successfully. Triggering recalculation...`
      });
    }

    // Trigger tax recalculation after state update.
    setTimeout(() => {
      handleCalculate();
    }, 100);
  };

  // ─── COMPUTED INPUTS ───────────────────────────────────────────

  const netSalary = Math.max(0, salary.gross - salary.exemptions);
  const netHouseProperty = Math.max(0, houseProperty.gav - houseProperty.municipalTaxes) * 0.7 - houseProperty.interest24b;
  const netBusiness = business.netProfit - business.depreciation;

  // ─── API HANDLER ───────────────────────────────────────────────

  const handleCalculate = async () => {
    setLoading(true);
    try {
      // 1. Save Profile
      const profileRes = await apiPost('/api/tax/profile', {
        profile_id: 'CURRENT_USER',
        name: 'Demo User',
        pan: 'ABCDE1234F',
        age: profile.age,
        opted_for_new_regime: profile.opted_for_new_regime,
        financial_year: profile.financial_year,
        assessment_year: profile.assessment_year,
        residential_status: profile.residential_status,
        entity_type: profile.entity_type,
        company_turnover_under_400cr: profile.company_turnover_under_400cr,
        corporate_tax_section: profile.corporate_tax_section
      });
      if (!profileRes.ok) throw new Error('Failed to save profile');

      // 2. Format & Save Incomes
      const incomes = [];
      if (netSalary > 0) incomes.push({ income_type: IncomeType.SALARY, description: 'Salary Income', gross_amount: salary.gross, exempt_amount: salary.exemptions, net_amount: netSalary });
      if (netHouseProperty !== 0) incomes.push({ income_type: IncomeType.HOUSE_PROPERTY, description: 'House Property', gross_amount: houseProperty.gav, exempt_amount: 0, net_amount: netHouseProperty });
      if (netBusiness !== 0) incomes.push({ income_type: IncomeType.BUSINESS, description: 'Business Income', gross_amount: business.netProfit, exempt_amount: business.depreciation, net_amount: netBusiness });

      // Cap Gains
      if (capitalGains.stcg111A > 0) incomes.push({ income_type: IncomeType.STCG_111A, description: 'STCG 111A', gross_amount: capitalGains.stcg111A, exempt_amount: 0, net_amount: capitalGains.stcg111A });
      if (capitalGains.stcgOther > 0) incomes.push({ income_type: IncomeType.CAPITAL_GAINS, description: 'Normal STCG', gross_amount: capitalGains.stcgOther, exempt_amount: 0, net_amount: capitalGains.stcgOther });
      if (capitalGains.ltcg112A > 0) incomes.push({ income_type: IncomeType.LTCG_112A, description: 'LTCG 112A', gross_amount: capitalGains.ltcg112A, exempt_amount: 0, net_amount: capitalGains.ltcg112A });
      if (capitalGains.ltcg112 > 0) incomes.push({ income_type: IncomeType.LTCG_112, description: 'LTCG 112', gross_amount: capitalGains.ltcg112, exempt_amount: 0, net_amount: capitalGains.ltcg112, use_indexation: false });

      // Other Sources
      const otherNormal = otherSources.interest + otherSources.dividend;
      if (otherNormal > 0) incomes.push({ income_type: IncomeType.OTHER_SOURCES, description: 'Interest & Dividend', gross_amount: otherNormal, exempt_amount: 0, net_amount: otherNormal });
      if (otherSources.casual > 0) incomes.push({ income_type: IncomeType.CASUAL_INCOME, description: 'Lottery/Crypto', gross_amount: otherSources.casual, exempt_amount: 0, net_amount: otherSources.casual });

      const incomeRes = await apiPost('/api/tax/income', { profile_id: 'CURRENT_USER', incomes });
      if (!incomeRes.ok) throw new Error('Failed to save incomes');

      // 3. Format & Save Deductions
      const deds = [];
      Object.entries(deductions).forEach(([code, amt]) => {
        if (amt > 0) deds.push({ section_code: code, claimed_amount: amt });
      });

      const dedRes = await apiPost('/api/tax/deductions', { profile_id: 'CURRENT_USER', deductions: deds });
      if (!dedRes.ok) throw new Error('Failed to save deductions');

      // 4. Fetch Computed Assessment
      const assessRes = await apiGet('/api/tax/assessment/CURRENT_USER');
      if (!assessRes.ok) throw new Error('Failed to compute tax');
      const assessData = await assessRes.json();

      setAssessment(assessData.data);
      toast({ title: 'Calculation Complete', description: 'Comparative tax audit models resolved successfully.', variant: 'default' });

    } catch (err: any) {
      toast({ title: 'Calculation Failed', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // ─── PDF EXPORT HANDLER ────────────────────────────────────────

  const handleDownloadPDF = () => {
    if (!assessment) return;
    const { oldRegimeAssessment: oldRes, newRegimeAssessment: newRes, recommendation, savings } = assessment;

    const doc = new jsPDF();

    // Color Palette
    const primaryColor = [15, 23, 42]; // Slate-900
    const accentColor = [37, 99, 235]; // Blue-600
    const lightBg = [241, 245, 249]; // Slate-100
    const textDark = [30, 41, 59]; // Slate-800

    // Header Panel
    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.rect(0, 0, 210, 42, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text("TAX COMPUTATION STATEMENT", 14, 18);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(148, 163, 184); // Slate-400
    doc.text(`Financial Year: ${profile.financial_year} | Assessment Year: ${profile.assessment_year}`, 14, 26);
    doc.text(`Generated offline via RECO WITH VASWANI Compliance Engine`, 14, 32);

    // Profile Details Section
    doc.setTextColor(textDark[0], textDark[1], textDark[2]);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Taxpayer Profile Details", 14, 52);

    // Draw horizontal separator line
    doc.setDrawColor(226, 232, 240); // Slate-200
    doc.setLineWidth(0.5);
    doc.line(14, 55, 196, 55);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`PAN: ABCDE1234F`, 14, 62);
    if (isNonIndividual) {
      doc.text(`Entity: ${profile.entity_type}`, 65, 62);
      if (profile.entity_type === 'DOMESTIC_COMPANY') {
        doc.text(`Provision: ${profile.corporate_tax_section} | Turnover < 400cr: ${profile.company_turnover_under_400cr ? 'Yes' : 'No'}`, 110, 62);
      }
    } else {
      doc.text(`Age: ${profile.age} Years`, 65, 62);
      doc.text(`Residential Status: ${profile.residential_status}`, 125, 62);
    }

    // Table Setup
    let y = 72;

    // Table Header
    doc.setFillColor(accentColor[0], accentColor[1], accentColor[2]);
    doc.rect(14, y, 182, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Computation Component / Tax Head", 16, y + 5.5);
    if (isNonIndividual) {
      doc.text("Statutory Tax Liability (INR)", 140, y + 5.5);
    } else {
      doc.text("Old Regime (INR)", 110, y + 5.5);
      doc.text("New Regime (115BAC)", 155, y + 5.5);
    }

    y += 8;
    doc.setTextColor(textDark[0], textDark[1], textDark[2]);

    const formatVal = (v: any) => {
      const val = typeof v?.toNumber === 'function' ? v.toNumber() : (v || 0);
      return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(val);
    };

    // Prepare Comparison Data
    const rows = [
      ["Gross Salary", salary.gross, salary.gross],
      ["Less: Exemptions / Allowances", salary.exemptions, 0],
      ["Less: Standard Deduction u/s 16(ia)", oldRes.standardDeductionAmount, newRes.standardDeductionAmount],
      ["Net Salary Income", oldRes.incomeBreakdown?.salary || 0, newRes.incomeBreakdown?.salary || 0],
      ["Income from House Property", oldRes.incomeBreakdown?.houseProperty || 0, newRes.incomeBreakdown?.houseProperty || 0],
      ["Business / Profession (PGBP)", netBusiness, netBusiness],
      ["Capital Gains (Special & Normal)",
        (capitalGains.stcg111A + capitalGains.stcgOther + capitalGains.ltcg112A + capitalGains.ltcg112),
        (capitalGains.stcg111A + capitalGains.stcgOther + capitalGains.ltcg112A + capitalGains.ltcg112)
      ],
      ["Income from Other Sources",
        (otherSources.interest + otherSources.dividend + otherSources.casual),
        (otherSources.interest + otherSources.dividend + otherSources.casual)
      ],
      ["Gross Total Income (GTI)", oldRes.grossTotalIncome, newRes.grossTotalIncome],
      ["Less: Chapter VI-A Deductions", oldRes.totalDeductions, newRes.totalDeductions],
      ["Net Taxable Income", oldRes.totalNetTaxableIncome, newRes.totalNetTaxableIncome],
      [isNonIndividual ? "Tax on Normal Income (Flat)" : "Tax on Normal Income (Slabs)", oldRes.taxOnNormalIncome, newRes.taxOnNormalIncome],
      ["Tax on Special Income (111A/112A etc.)", oldRes.totalTaxOnSpecialIncome, newRes.totalTaxOnSpecialIncome],
      ["Less: Rebate u/s 87A", oldRes.rebate87AAmount, newRes.rebate87AAmount],
      ["Add: Surcharge (net of relief)", oldRes.surchargeAmount, newRes.surchargeAmount],
      ["Add: Health & Ed. Cess (4%)", oldRes.cessAmount, newRes.cessAmount],
      ["Total Tax Liability", oldRes.totalTaxLiability, newRes.totalTaxLiability],
    ];

    rows.forEach((row, idx) => {
      const isTotal = row[0] === "Gross Total Income (GTI)" || row[0] === "Net Taxable Income" || row[0] === "Total Tax Liability";

      if (isTotal) {
        doc.setFont("helvetica", "bold");
        doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
        doc.rect(14, y, 182, 8, 'F');
      } else {
        doc.setFont("helvetica", "normal");
      }

      // Draw horizontal line
      doc.setDrawColor(241, 245, 249);
      doc.setLineWidth(0.3);
      doc.line(14, y + 8, 196, y + 8);

      // Write values
      doc.text(row[0] as string, 16, y + 5.5);
      if (isNonIndividual) {
        doc.text(formatVal(row[2]), 140, y + 5.5);
      } else {
        doc.text(formatVal(row[1]), 110, y + 5.5);
        doc.text(formatVal(row[2]), 155, y + 5.5);
      }

      y += 8;
    });

    if (isNonIndividual) {
      y += 8;
      doc.setFillColor(239, 246, 255); // Blue-50 bg
      doc.setDrawColor(191, 219, 254); // Blue-200 border
      doc.setLineWidth(0.5);
      doc.rect(14, y, 182, 16, 'FD');

      doc.setTextColor(29, 78, 216); // Blue-700
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("STATUTORY TAX SUMMARY", 18, y + 5);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(30, 41, 59);
      doc.text(`Total Statutory Tax Liability resolved to INR ${formatVal(newRes.totalTaxLiability)} with an Effective Tax Rate of ${newRes.effectiveTaxRate.toFixed(2)}%.`, 18, y + 11);
    } else {
      // Symmetrical Recommendation Card
      y += 8;
      doc.setFillColor(240, 253, 244); // Green-50 bg
      doc.setDrawColor(187, 247, 208); // Green-200 border
      doc.setLineWidth(0.5);
      doc.rect(14, y, 182, 16, 'FD');

      doc.setTextColor(21, 128, 61); // Green-700
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("RECOMMENDATION SUMMARY", 18, y + 5);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(30, 41, 59);

      const recoText = recommendation === 'NEW' ? 'New Tax Regime (u/s 115BAC)' : 'Old Tax Regime';
      doc.text(`The ${recoText} is highly optimal for your profile, resulting in immediate tax savings of INR ${formatVal(savings)}.`, 18, y + 11);
    }

    // ── Schedule N: Disclosures & Notes ────────────────────────
    doc.addPage();

    // Page Header for Schedule N
    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.rect(0, 0, 210, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("SCHEDULE N: DISCLOSURES & NOTES", 14, 18);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(148, 163, 184);
    doc.text(`Tax Computation Explanatory Notes forming part of the Assessment`, 14, 25);

    doc.setTextColor(textDark[0], textDark[1], textDark[2]);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Statutory Disclosures & Computation Rationale", 14, 42);

    doc.setDrawColor(226, 232, 240); // Slate-200
    doc.setLineWidth(0.5);
    doc.line(14, 45, 196, 45);

    // List statutory notes
    const activeNotes = newRes.computationNotes || [];
    let ny = 52;
    doc.setFontSize(9);

    if (activeNotes.length === 0) {
      doc.setFont("helvetica", "italic");
      doc.text("No statutory explanatory notes required for this calculation profile.", 14, ny);
    } else {
      activeNotes.forEach((note: any) => {
        if (ny > 260) {
          doc.addPage();
          ny = 20;
        }

        // Header
        doc.setFont("helvetica", "bold");
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.text(`${note.lineItem} [${note.applicableSection}]`, 14, ny);

        // Rationale text wrapping
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 116, 139); // Slate-500
        const splitRationale = doc.splitTextToSize(note.rationaleString, 180);
        doc.text(splitRationale, 14, ny + 5);

        doc.setDrawColor(241, 245, 249);
        doc.setLineWidth(0.3);
        doc.line(14, ny + 5 + (splitRationale.length * 4) + 2, 196, ny + 5 + (splitRationale.length * 4) + 2);

        ny += 12 + (splitRationale.length * 4);
      });
    }

    // ── Annexure I: Detailed Computation Sheet ─────────────────
    doc.addPage();

    // Page Header
    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.rect(0, 0, 210, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("ANNEXURE I: DETAILED COMPUTATION SHEET", 14, 18);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(148, 163, 184);
    doc.text(isNonIndividual ? "Flat rate statutory tax & surcharge formulation details" : "Mathematical Verification & progressive slab computation breakdown", 14, 25);

    let ay = 42;
    doc.setTextColor(textDark[0], textDark[1], textDark[2]);

    if (isNonIndividual) {
      // Single block statutory breakdown
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("STATUTORY FLAT RATE COMPUTATION BREAKDOWN", 14, ay);
      ay += 5;

      // Draw Table Header for corporate/firm flat rate
      doc.setFillColor(203, 213, 225); // Slate-300
      doc.rect(14, ay, 182, 6, 'F');
      doc.setFontSize(8);
      doc.text("Rate Provision / Description", 16, ay + 4.5);
      doc.text("Rate", 90, ay + 4.5);
      doc.text("Net Taxable Income", 120, ay + 4.5);
      doc.text("Base Tax Computed", 160, ay + 4.5);
      ay += 6;

      doc.setFont("helvetica", "normal");
      const flatSlab = newRes.calculationSheet.slabBreakdown[0];
      doc.text(flatSlab.slabRange, 16, ay + 4.5);
      doc.text(`${flatSlab.ratePercentage}%`, 90, ay + 4.5);
      doc.text(formatVal(flatSlab.taxableAmountInSlab), 120, ay + 4.5);
      doc.text(formatVal(flatSlab.taxGenerated), 160, ay + 4.5);

      doc.setDrawColor(241, 245, 249);
      doc.line(14, ay + 6, 196, ay + 6);
      ay += 12;

      // Statutory Formulations
      doc.setFont("helvetica", "bold");
      doc.text("Statutory Formulations & Cess Calculations:", 14, ay);
      doc.setFont("helvetica", "normal");
      const newSurch = newRes.calculationSheet.surchargeDetails;
      const newCess = newRes.calculationSheet.cessDetails;
      doc.text(`Surcharge = (Base Tax ${formatVal(newSurch.baseTaxAmount)} x ${newSurch.appliedRate}%) - Relief ${formatVal(newSurch.marginalReliefSubtracted)} = Net Surcharge ${formatVal(newSurch.netSurcharge)}`, 14, ay + 5);
      doc.text(`Cess (4%) = (Net Tax + Surcharge) ${formatVal(newCess.taxPlusSurcharge)} x 4% = Cess ${formatVal(newCess.cessAmount)}`, 14, ay + 10);
      doc.setFont("helvetica", "bold");
      doc.text(`Total Statutory Tax Liability = INR ${formatVal(newRes.totalTaxLiability)}`, 14, ay + 17);
    } else {
      // ── OLD REGIME DETAILS ──
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("1. OLD REGIME MATHEMATICAL BREAKDOWN", 14, ay);
      ay += 5;

      // Draw Table Header
      doc.setFillColor(203, 213, 225); // Slate-300
      doc.rect(14, ay, 182, 6, 'F');
      doc.setFontSize(8);
      doc.text("Slab Bracket (INR)", 16, ay + 4.5);
      doc.text("Rate", 90, ay + 4.5);
      doc.text("Income in Slab", 120, ay + 4.5);
      doc.text("Tax Computed", 160, ay + 4.5);
      ay += 6;

      doc.setFont("helvetica", "normal");
      oldRes.calculationSheet.slabBreakdown.forEach((slab: any) => {
        const sanitizedRange = typeof slab.slabRange === 'string' ? slab.slabRange.replace(/₹/g, '').trim() : '';
        doc.text(sanitizedRange, 16, ay + 4.5);
        doc.text(`${slab.ratePercentage}%`, 90, ay + 4.5);
        doc.text(formatVal(slab.taxableAmountInSlab), 120, ay + 4.5);

        // Cosmetic Fallback if the backend sent 0 for a known special income row
        let displayTax = slab.taxGenerated || 0;
        if (displayTax === 0 && slab.taxableAmountInSlab > 0) {
            const rowName = String(slab.slabRange).toUpperCase();
            if (rowName.includes('115BB')) {
                displayTax = slab.taxableAmountInSlab * 0.30;
            } else if (rowName.includes('111A')) {
                displayTax = slab.taxableAmountInSlab * 0.20;
            } else if (rowName.includes('112A')) {
                // Exclude the 1.25L limit for 112A display
                displayTax = Math.max(0, (slab.taxableAmountInSlab - 125000)) * 0.125;
            } else if (rowName.includes('112')) {
                displayTax = slab.taxableAmountInSlab * 0.125;
            }
        }
        doc.text(formatVal(displayTax), 160, ay + 4.5);

        doc.setDrawColor(241, 245, 249);
        doc.line(14, ay + 6, 196, ay + 6);
        ay += 6;
      });

      // Surcharge & Cess Audit Row for Old Regime
      ay += 2;
      doc.setFont("helvetica", "bold");
      doc.text("Old Regime Statutory Formulations:", 14, ay + 4);
      doc.setFont("helvetica", "normal");
      const oldSurch = oldRes.calculationSheet.surchargeDetails;
      const oldCess = oldRes.calculationSheet.cessDetails;
      doc.text(`Surcharge u/s 2(3) = (Base Tax ${formatVal(oldSurch.baseTaxAmount)} x ${oldSurch.appliedRate}%) - Relief ${formatVal(oldSurch.marginalReliefSubtracted)} = Net ${formatVal(oldSurch.netSurcharge)}`, 14, ay + 9);
      doc.text(`Cess (4%) = (Net Tax + Surcharge) ${formatVal(oldCess.taxPlusSurcharge)} x 4% = Cess ${formatVal(oldCess.cessAmount)}`, 14, ay + 14);

      ay += 22;

      // ── NEW REGIME DETAILS ──
      if (ay > 190) {
        doc.addPage();
        ay = 20;
      }
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("2. NEW REGIME (u/s 115BAC) MATHEMATICAL BREAKDOWN", 14, ay);
      ay += 5;

      // Draw Table Header
      doc.setFillColor(203, 213, 225); // Slate-300
      doc.rect(14, ay, 182, 6, 'F');
      doc.setFontSize(8);
      doc.text("Slab Bracket (INR)", 16, ay + 4.5);
      doc.text("Rate", 90, ay + 4.5);
      doc.text("Income in Slab", 120, ay + 4.5);
      doc.text("Tax Computed", 160, ay + 4.5);
      ay += 6;

      doc.setFont("helvetica", "normal");
      newRes.calculationSheet.slabBreakdown.forEach((slab: any) => {
        const sanitizedRange = typeof slab.slabRange === 'string' ? slab.slabRange.replace(/₹/g, '').trim() : '';
        doc.text(sanitizedRange, 16, ay + 4.5);
        doc.text(`${slab.ratePercentage}%`, 90, ay + 4.5);
        doc.text(formatVal(slab.taxableAmountInSlab), 120, ay + 4.5);

        // Cosmetic Fallback if the backend sent 0 for a known special income row
        let displayTax = slab.taxGenerated || 0;
        if (displayTax === 0 && slab.taxableAmountInSlab > 0) {
            const rowName = String(slab.slabRange).toUpperCase();
            if (rowName.includes('115BB')) {
                displayTax = slab.taxableAmountInSlab * 0.30;
            } else if (rowName.includes('111A')) {
                displayTax = slab.taxableAmountInSlab * 0.20;
            } else if (rowName.includes('112A')) {
                // Exclude the 1.25L limit for 112A display
                displayTax = Math.max(0, (slab.taxableAmountInSlab - 125000)) * 0.125;
            } else if (rowName.includes('112')) {
                displayTax = slab.taxableAmountInSlab * 0.125;
            }
        }
        doc.text(formatVal(displayTax), 160, ay + 4.5);

        doc.setDrawColor(241, 245, 249);
        doc.line(14, ay + 6, 196, ay + 6);
        ay += 6;
      });

      // Surcharge & Cess Audit Row for New Regime
      ay += 2;
      doc.setFont("helvetica", "bold");
      doc.text("New Regime Statutory Formulations:", 14, ay + 4);
      doc.setFont("helvetica", "normal");
      const newSurch = newRes.calculationSheet.surchargeDetails;
      const newCess = newRes.calculationSheet.cessDetails;
      doc.text(`Surcharge u/s 2(3) = (Base Tax ${formatVal(newSurch.baseTaxAmount)} x ${newSurch.appliedRate}%) - Relief ${formatVal(newSurch.marginalReliefSubtracted)} = Net ${formatVal(newSurch.netSurcharge)}`, 14, ay + 9);
      doc.text(`Cess (4%) = (Net Tax + Surcharge) ${formatVal(newCess.taxPlusSurcharge)} x 4% = Cess ${formatVal(newCess.cessAmount)}`, 14, ay + 14);
    }

    // Save PDF
    doc.save(`Tax_Computation_${profile.financial_year}.pdf`);
    toast({ title: 'PDF Export Complete', description: 'Tax computation statement downloaded successfully.' });
  };

  // ─── EXCEL EXPORT HANDLER ──────────────────────────────────────

  const handleDownloadExcel = async () => {
    if (!assessment) return;
    try {
      // Polyfill Buffer in browser if missing
      if (typeof window !== 'undefined' && !(window as any).Buffer) {
        try {
          const { Buffer: BufferPolyfill } = await import('buffer');
          (window as any).Buffer = BufferPolyfill;
        } catch (e) {
          console.warn("Could not polyfill Buffer:", e);
        }
      }

      const { oldRegimeAssessment: oldRes, newRegimeAssessment: newRes, recommendation, savings } = assessment;
      const activeRes = isNonIndividual ? newRes : (isNewRegime ? newRes : oldRes);

      const getNum = (v: any): number => {
        if (v === null || v === undefined) return 0;
        if (typeof v.toNumber === 'function') return v.toNumber();
        const n = Number(v);
        return isNaN(n) ? 0 : n;
      };

      const ExcelJSWorkbook = ExcelJS.Workbook || (ExcelJS as any).default?.Workbook;
      if (!ExcelJSWorkbook) {
        throw new Error("ExcelJS.Workbook constructor not found. Please verify library integration.");
      }
      const wb = new ExcelJSWorkbook();
    wb.creator = 'RECO WITH VASWANI Tax Engine';
    wb.created = new Date();

    // ─── Indian currency format mask ───
    const inrFmt = '₹##,##,##,##0';
    const inrFmtDec = '₹##,##,##,##0.00';
    const pctFmt = '0.00%';

    // ─── Color Palette ───
    const headerFill: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } }; // Slate-900
    const subHeaderFill: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }; // Slate-800
    const accentFill: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }; // Blue-600
    const totalFill: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }; // Slate-100
    const grandTotalFill: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } }; // Blue-100
    const whiteFont: Partial<ExcelJS.Font> = { color: { argb: 'FFFFFFFF' }, bold: true };
    const darkFont: Partial<ExcelJS.Font> = { color: { argb: 'FF1E293B' } };
    const boldDarkFont: Partial<ExcelJS.Font> = { color: { argb: 'FF1E293B' }, bold: true };
    const thinBorder: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FFE2E8F0' } };
    const medBorder: Partial<ExcelJS.Border> = { style: 'medium', color: { argb: 'FF94A3B8' } };
    const borderAll: Partial<ExcelJS.Borders> = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
    const borderMedAll: Partial<ExcelJS.Borders> = { top: medBorder, bottom: medBorder, left: medBorder, right: medBorder };

    // ═══════════════════════════════════════════════════════
    // SHEET 1: TAX COMPUTATION STATEMENT
    // ═══════════════════════════════════════════════════════
    const ws = wb.addWorksheet('Tax Computation', { properties: { defaultColWidth: 18 } });
    ws.columns = [
      { key: 'label', width: 50 },
      { key: 'value', width: 24 },
    ];

    // ── TITLE BLOCK (Rows 1-4) ──
    ws.mergeCells('A1:B1');
    const titleCell = ws.getCell('A1');
    titleCell.value = 'TAX COMPUTATION STATEMENT';
    titleCell.font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = headerFill;
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 36;
    ws.getCell('B1').fill = headerFill;

    ws.mergeCells('A2:B2');
    const subTitleCell = ws.getCell('A2');
    subTitleCell.value = `Financial Year: ${profile.financial_year} | Assessment Year: ${profile.assessment_year}`;
    subTitleCell.font = { size: 9, color: { argb: 'FF94A3B8' } };
    subTitleCell.fill = headerFill;
    subTitleCell.alignment = { horizontal: 'center' };
    ws.getCell('B2').fill = headerFill;

    ws.mergeCells('A3:B3');
    const genCell = ws.getCell('A3');
    genCell.value = `Generated by RECO WITH VASWANI Compliance Engine on ${new Date().toLocaleDateString('en-IN')}`;
    genCell.font = { size: 8, italic: true, color: { argb: 'FF64748B' } };
    genCell.fill = headerFill;
    genCell.alignment = { horizontal: 'center' };
    ws.getCell('B3').fill = headerFill;

    // Row 4: blank spacer
    ws.getRow(4).height = 8;

    // ── PROFILE DETAILS (Row 5) ──
    ws.mergeCells('A5:B5');
    const profileHeader = ws.getCell('A5');
    profileHeader.value = 'TAXPAYER PROFILE DETAILS';
    profileHeader.font = { size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    profileHeader.fill = accentFill;
    profileHeader.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getCell('B5').fill = accentFill;
    ws.getRow(5).height = 24;

    const profileRows: [string, string | number][] = isNonIndividual
      ? [
          ['Entity Type', profile.entity_type],
          ['PAN', 'ABCDE1234F'],
          ...(profile.entity_type === 'DOMESTIC_COMPANY'
            ? [
                ['Corporate Provision', profile.corporate_tax_section] as [string, string],
                ['Turnover ≤ ₹400 Crore', profile.company_turnover_under_400cr ? 'Yes' : 'No'] as [string, string],
              ]
            : []),
        ]
      : [
          ['Entity Type', profile.entity_type],
          ['Age', `${profile.age} Years`],
          ['PAN', 'ABCDE1234F'],
          ['Residential Status', profile.residential_status],
          ['Tax Regime', isNewRegime ? 'New Regime (u/s 115BAC)' : 'Old Regime'],
        ];

    let r = 6;
    profileRows.forEach(([lbl, val]) => {
      const row = ws.getRow(r);
      row.getCell(1).value = lbl;
      row.getCell(1).font = { size: 9, color: { argb: 'FF64748B' } };
      row.getCell(2).value = val;
      row.getCell(2).font = { size: 9, bold: true, ...darkFont };
      row.getCell(2).alignment = { horizontal: 'right' };
      row.getCell(1).border = borderAll;
      row.getCell(2).border = borderAll;
      r++;
    });

    // ── SPACER ──
    r++;

    // ── INCOME BREAKDOWN TABLE HEADER ──
    const tblHeaderRow = r;
    ws.mergeCells(`A${r}:B${r}`);
    const incHeader = ws.getCell(`A${r}`);
    incHeader.value = isNonIndividual
      ? 'STATUTORY TAX LIABILITY COMPUTATION'
      : `TAX LIABILITY COMPUTATION — ${isNewRegime ? 'NEW REGIME' : 'OLD REGIME'}`;
    incHeader.font = { size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    incHeader.fill = accentFill;
    incHeader.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getCell(`B${r}`).fill = accentFill;
    ws.getRow(r).height = 24;
    r++;

    // Column Sub-Headers
    ws.getCell(`A${r}`).value = 'Computation Head / Component';
    ws.getCell(`A${r}`).font = { size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getCell(`A${r}`).fill = subHeaderFill;
    ws.getCell(`B${r}`).value = 'Amount (INR)';
    ws.getCell(`B${r}`).font = { size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getCell(`B${r}`).fill = subHeaderFill;
    ws.getCell(`B${r}`).alignment = { horizontal: 'right' };
    ws.getRow(r).height = 22;
    r++;

    // ═══════════════════════════════════════════════════════
    // DATA ROWS WITH LIVE FORMULAS
    // ═══════════════════════════════════════════════════════

    // Helper to set a data row (static value)
    const addDataRow = (label: string, value: number, opts?: { bold?: boolean; fill?: ExcelJS.FillPattern; borderStyle?: Partial<ExcelJS.Borders> }) => {
      const row = ws.getRow(r);
      row.getCell(1).value = label;
      row.getCell(1).font = opts?.bold ? boldDarkFont : { size: 9, ...darkFont };
      row.getCell(1).border = opts?.borderStyle || borderAll;
      if (opts?.fill) row.getCell(1).fill = opts.fill;

      row.getCell(2).value = value;
      row.getCell(2).numFmt = inrFmt;
      row.getCell(2).font = opts?.bold ? { size: 10, bold: true, ...darkFont } : { size: 9, ...darkFont };
      row.getCell(2).alignment = { horizontal: 'right' };
      row.getCell(2).border = opts?.borderStyle || borderAll;
      if (opts?.fill) row.getCell(2).fill = opts.fill;
      const currentRow = r;
      r++;
      return currentRow;
    };

    // Helper to set a formula row
    const addFormulaRow = (label: string, formula: string, result: number, opts?: { bold?: boolean; fill?: ExcelJS.FillPattern; borderStyle?: Partial<ExcelJS.Borders> }) => {
      const row = ws.getRow(r);
      row.getCell(1).value = label;
      row.getCell(1).font = opts?.bold ? boldDarkFont : { size: 9, ...darkFont };
      row.getCell(1).border = opts?.borderStyle || borderAll;
      if (opts?.fill) row.getCell(1).fill = opts.fill;

      row.getCell(2).value = { formula, result };
      row.getCell(2).numFmt = inrFmt;
      row.getCell(2).font = opts?.bold ? { size: 10, bold: true, ...darkFont } : { size: 9, ...darkFont };
      row.getCell(2).alignment = { horizontal: 'right' };
      row.getCell(2).border = opts?.borderStyle || borderAll;
      if (opts?.fill) row.getCell(2).fill = opts.fill;
      const currentRow = r;
      r++;
      return currentRow;
    };

    // ── HEAD 1: SALARY ──
    const salaryRow = addDataRow('1. Income from Salary (Gross)', salary.gross);
    const exemptRow = addDataRow('    Less: Exemptions / Allowances', salary.exemptions);
    const stdDedLimit = isNewRegime ? 75000 : 50000;
    const stdDedRow = addFormulaRow(
      '    Less: Standard Deduction u/s 16(ia)',
      `MIN(MAX(0, B${salaryRow}-B${exemptRow}), ${stdDedLimit})`,
      getNum(activeRes.standardDeductionAmount)
    );
    const netSalaryRow = addFormulaRow(
      '    Net Salary Income',
      `B${salaryRow}-B${exemptRow}-B${stdDedRow}`,
      getNum(activeRes.incomeBreakdown.salary)
    );

    // ── HEAD 2: HOUSE PROPERTY ──
    const hpRow = addDataRow('2. Income from House Property', netHouseProperty);

    // ── HEAD 3: BUSINESS ──
    const bizRow = addDataRow('3. Business / Profession (PGBP)', netBusiness);

    // ── HEAD 4: CAPITAL GAINS ──
    const cgRow = addDataRow('4. Capital Gains (all heads)', capitalGains.stcg111A + capitalGains.stcgOther + capitalGains.ltcg112A + capitalGains.ltcg112);

    // ── HEAD 5: OTHER SOURCES ──
    const osRow = addDataRow('5. Income from Other Sources', otherSources.interest + otherSources.dividend + otherSources.casual);

    // ── GROSS TOTAL INCOME (LIVE SUM FORMULA) ──
    const gtiRow = addFormulaRow(
      'GROSS TOTAL INCOME (GTI)',
      `B${netSalaryRow}+B${hpRow}+B${bizRow}+B${cgRow}+B${osRow}`,
      activeRes.grossTotalIncome,
      { bold: true, fill: totalFill, borderStyle: borderMedAll }
    );

    // ── DEDUCTIONS ──
    const dedRow = addDataRow('Less: Chapter VI-A Deductions', activeRes.totalDeductions);

    // ── NET TAXABLE INCOME (LIVE FORMULA) ──
    const ntiRow = addFormulaRow(
      'NET TAXABLE INCOME',
      `B${gtiRow}-B${dedRow}`,
      activeRes.totalNetTaxableIncome,
      { bold: true, fill: totalFill, borderStyle: borderMedAll }
    );

    // ── TAX ON NORMAL INCOME (LIVE FORMULA) ──
    let taxRow: number;
    if (isNonIndividual) {
      // Flat rate for firms/companies
      let rate = 0.30;
      if (profile.entity_type === 'DOMESTIC_COMPANY') {
        const prov = profile.corporate_tax_section || 'NORMAL';
        if (prov === 'SEC_115BAA') rate = 0.22;
        else if (prov === 'SEC_115BAB') rate = 0.15;
        else rate = profile.company_turnover_under_400cr ? 0.25 : 0.30;
      }
      taxRow = addFormulaRow(
        `Tax on Normal Income (Flat ${(rate * 100).toFixed(0)}%)`,
        `B${ntiRow}*${rate}`,
        activeRes.taxOnNormalIncome
      );
    } else {
      // Progressive slab formula for individuals
      if (isNewRegime) {
        // New Regime FY2025-26 slabs: 0-4L nil, 4-8L 5%, 8-12L 10%, 12-16L 15%, 16-20L 20%, 20-24L 25%, >24L 30%
        taxRow = addFormulaRow(
          'Tax on Normal Income (Slabs)',
          `IF(B${ntiRow}>2400000,(B${ntiRow}-2400000)*0.3+300000,IF(B${ntiRow}>2000000,(B${ntiRow}-2000000)*0.25+200000,IF(B${ntiRow}>1600000,(B${ntiRow}-1600000)*0.2+120000,IF(B${ntiRow}>1200000,(B${ntiRow}-1200000)*0.15+60000,IF(B${ntiRow}>800000,(B${ntiRow}-800000)*0.1+20000,IF(B${ntiRow}>400000,(B${ntiRow}-400000)*0.05,0))))))`,
          activeRes.taxOnNormalIncome
        );
      } else {
        // Old Regime progressive slabs (age < 60 default)
        taxRow = addFormulaRow(
          'Tax on Normal Income (Slabs)',
          `IF(B${ntiRow}>1000000,(B${ntiRow}-1000000)*0.3+112500,IF(B${ntiRow}>500000,(B${ntiRow}-500000)*0.2+12500,IF(B${ntiRow}>250000,(B${ntiRow}-250000)*0.05,0)))`,
          activeRes.taxOnNormalIncome
        );
      }
    }

    // ── SPECIAL INCOME TAX ──
    const specialTaxRow = addDataRow('Tax on Special Income (111A/112A etc.)', activeRes.totalTaxOnSpecialIncome);

    // ── REBATE 87A (LIVE FORMULA) ──
    let rebateRow: number;
    if (isNonIndividual) {
      // No rebate for non-individuals
      rebateRow = addDataRow('Less: Rebate u/s 87A', 0);
    } else if (isNewRegime) {
      // New Regime: Full rebate up to ₹60,000 if NTI ≤ ₹12,00,000
      rebateRow = addFormulaRow(
        'Less: Rebate u/s 87A',
        `IF(B${ntiRow}<=1200000,MIN(B${taxRow}+B${specialTaxRow},60000),0)`,
        activeRes.rebate87AAmount
      );
    } else {
      // Old Regime: Full rebate up to ₹12,500 if NTI ≤ ₹5,00,000
      rebateRow = addFormulaRow(
        'Less: Rebate u/s 87A',
        `IF(B${ntiRow}<=500000,MIN(B${taxRow}+B${specialTaxRow},12500),0)`,
        activeRes.rebate87AAmount
      );
    }

    // ── TAX AFTER REBATE (LIVE FORMULA) ──
    const taxAfterRebateRow = addFormulaRow(
      'Tax After Rebate',
      `MAX(0, B${taxRow}+B${specialTaxRow}-B${rebateRow})`,
      activeRes.taxAfterRebate
    );

    // ── SURCHARGE (LIVE FORMULA) ──
    let surchargeRow: number;
    if (isNonIndividual && profile.entity_type === 'DOMESTIC_COMPANY') {
      const prov = profile.corporate_tax_section || 'NORMAL';
      if (prov === 'SEC_115BAA' || prov === 'SEC_115BAB') {
        // Fixed 10% surcharge
        surchargeRow = addFormulaRow(
          'Add: Surcharge (Fixed 10%)',
          `B${taxAfterRebateRow}*0.10`,
          activeRes.surchargeAmount
        );
      } else {
        // Normal company: 7% > 1Cr, 12% > 10Cr
        surchargeRow = addFormulaRow(
          'Add: Surcharge (net of relief)',
          `IF(B${ntiRow}>100000000,B${taxAfterRebateRow}*0.12,IF(B${ntiRow}>10000000,B${taxAfterRebateRow}*0.07,0))`,
          activeRes.surchargeAmount
        );
      }
    } else if (isNonIndividual) {
      // Partnership/LLP: 12% above 1Cr
      surchargeRow = addFormulaRow(
        'Add: Surcharge (net of relief)',
        `IF(B${ntiRow}>10000000,B${taxAfterRebateRow}*0.12,0)`,
        activeRes.surchargeAmount
      );
    } else if (isNewRegime) {
      // New Regime individual surcharge: capped at 25%
      surchargeRow = addFormulaRow(
        'Add: Surcharge (net of relief)',
        `IF(B${ntiRow}>50000000,B${taxAfterRebateRow}*0.25,IF(B${ntiRow}>20000000,B${taxAfterRebateRow}*0.25,IF(B${ntiRow}>10000000,B${taxAfterRebateRow}*0.15,IF(B${ntiRow}>5000000,B${taxAfterRebateRow}*0.10,0))))`,
        activeRes.surchargeAmount
      );
    } else {
      // Old Regime individual surcharge: highest tier 37%
      surchargeRow = addFormulaRow(
        'Add: Surcharge (net of relief)',
        `IF(B${ntiRow}>50000000,B${taxAfterRebateRow}*0.37,IF(B${ntiRow}>20000000,B${taxAfterRebateRow}*0.25,IF(B${ntiRow}>10000000,B${taxAfterRebateRow}*0.15,IF(B${ntiRow}>5000000,B${taxAfterRebateRow}*0.10,0))))`,
        activeRes.surchargeAmount
      );
    }

    // ── CESS (LIVE FORMULA) ──
    const cessRow = addFormulaRow(
      'Add: Health & Education Cess (4%)',
      `(B${taxAfterRebateRow}+B${surchargeRow})*0.04`,
      activeRes.cessAmount
    );

    // ── TOTAL TAX LIABILITY (LIVE FORMULA) ──
    const totalRow = addFormulaRow(
      'TOTAL TAX LIABILITY',
      `B${taxAfterRebateRow}+B${surchargeRow}+B${cessRow}`,
      activeRes.totalTaxLiability,
      { bold: true, fill: grandTotalFill, borderStyle: borderMedAll }
    );

    // ── EFFECTIVE TAX RATE (LIVE FORMULA) ──
    addFormulaRow(
      'Effective Tax Rate',
      `IF(B${ntiRow}=0,0,B${totalRow}/B${ntiRow})`,
      activeRes.effectiveTaxRate / 100
    );
    // Override the format for this percentage row
    ws.getCell(`B${r - 1}`).numFmt = pctFmt;

    // ── SPACER ──
    r += 2;

    // ── COMPUTATION NOTES SECTION ──
    ws.mergeCells(`A${r}:B${r}`);
    const notesHeader = ws.getCell(`A${r}`);
    notesHeader.value = 'STATUTORY PROVISIONS & EXPLANATORY NOTES';
    notesHeader.font = { size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    notesHeader.fill = accentFill;
    notesHeader.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getCell(`B${r}`).fill = accentFill;
    ws.getRow(r).height = 24;
    r++;

    const notes = activeRes.computationNotes || [];
    if (notes.length === 0) {
      ws.mergeCells(`A${r}:B${r}`);
      const noNotesCell = ws.getCell(`A${r}`);
      noNotesCell.value = 'No special statutory overrides triggered for this computation.';
      noNotesCell.font = { size: 9, italic: true, color: { argb: 'FF94A3B8' } };
      r++;
    } else {
      notes.forEach((note: any) => {
        const noteRow = ws.getRow(r);
        noteRow.getCell(1).value = `${note.lineItem} [${note.applicableSection}]`;
        noteRow.getCell(1).font = { size: 9, bold: true, ...darkFont };
        noteRow.getCell(1).border = borderAll;
        noteRow.getCell(2).value = note.rationaleString;
        noteRow.getCell(2).font = { size: 8, color: { argb: 'FF64748B' } };
        noteRow.getCell(2).alignment = { wrapText: true, horizontal: 'left' };
        noteRow.getCell(2).border = borderAll;
        r++;
      });
    }

    // ── FOOTER ──
    r += 2;
    ws.mergeCells(`A${r}:B${r}`);
    const footerCell = ws.getCell(`A${r}`);
    footerCell.value = '⚠ This spreadsheet contains LIVE FORMULAS. Changing any income or deduction cell will dynamically recalculate the full tax liability.';
    footerCell.font = { size: 8, italic: true, color: { argb: 'FFEF4444' } };
    footerCell.alignment = { horizontal: 'center', wrapText: true };

    // ── PRINT SETTINGS ──
    ws.pageSetup = { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    ws.headerFooter = { oddFooter: '&C&8Page &P of &N — Generated by RECO WITH VASWANI' };

    // ── DOWNLOAD ──
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Tax_Computation_${profile.financial_year}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);

    toast({ title: 'Excel Export Complete', description: 'Live-formula tax workbook downloaded successfully.' });
    } catch (err: any) {
      console.error("Excel export error:", err);
      toast({
        title: 'Excel Export Failed',
        description: err.message || String(err),
        variant: 'destructive'
      });
    }
  };

  // ─── RENDER HELPERS ───────────────────────────────────────────

  const formatINR = (val: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val || 0);
  };

  const isNewRegime = profile.opted_for_new_regime;
  const isNonIndividual = profile.entity_type !== 'INDIVIDUAL' && profile.entity_type !== 'HUF' && profile.entity_type !== 'AOP_BOI';

  return (
    <div className="container mx-auto p-6 max-w-7xl animate-in fade-in zoom-in-95 duration-500">

      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 border-b border-zinc-800 pb-6">
        <div className="flex items-center gap-4">
          {onBack && (
            <Button
              variant="outline"
              size="icon"
              onClick={onBack}
              className="border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:text-white rounded-xl h-10 w-10 hover:border-zinc-700 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
          )}
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
              <Landmark className="w-8 h-8 text-blue-500" />
              Tax Liability Computation
            </h1>
            <p className="text-zinc-400 mt-1 text-sm">Professional Indian Income Tax Engine for {profile.financial_year}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {assessment && (
            <>
              <Button onClick={handleDownloadExcel} variant="outline" size="lg" className="border-emerald-700/50 hover:bg-emerald-900/30 text-emerald-400 rounded-xl px-6 transition-all">
                <FileSpreadsheet className="mr-2 h-5 w-5" /> Export Excel
              </Button>
              <Button onClick={handleDownloadPDF} variant="outline" size="lg" className="border-zinc-700 hover:bg-zinc-800 text-zinc-300 rounded-xl px-6 transition-all">
                <Download className="mr-2 h-5 w-5" /> Download Report
              </Button>
            </>
          )}
          <Button onClick={handleCalculate} disabled={loading} size="lg" className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20 rounded-xl px-8 transition-all hover:scale-105 active:scale-95">
            {loading ? 'Computing...' : (
              <>
                <Calculator className="mr-2 h-5 w-5" /> Calculate Tax
              </>
            )}
          </Button>
        </div>
      </div>

      {/* AIS/26AS JSON Import Dropzone */}
      <div className="mb-8">
        <label className="group flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-zinc-800/80 hover:border-blue-500/50 rounded-2xl bg-zinc-950/20 hover:bg-zinc-950/40 transition-all cursor-pointer relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
          <div className="flex items-center justify-center space-x-4 select-none relative z-10">
            <div className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 group-hover:text-blue-400 group-hover:border-blue-500/20 transition-all">
              <Upload className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-zinc-300 group-hover:text-white transition-colors uppercase tracking-wider">
                {uploadingAis ? 'Uploading & Ingesting...' : 'Drag & Drop AIS / 26AS (JSON)'}
              </p>
              <p className="text-[9px] text-zinc-500 mt-0.5">
                Only authentic JSON schemas supported. Real-time PAN lock validation active.
              </p>
            </div>
          </div>
          <input 
            type="file" 
            accept=".json" 
            className="hidden" 
            onChange={handleAisUpload} 
            disabled={uploadingAis}
          />
        </label>
      </div>

      {/* ── LevitateExtract: Form 26AS PDF → Excel Converter ──────────── */}
      <div className="mb-8">
        <label className={`group flex flex-col items-center justify-center w-full border-2 border-dashed rounded-2xl transition-all cursor-pointer relative overflow-hidden ${
          levitateStatus === 'error' 
            ? 'border-red-500/50 bg-red-950/10 h-32' 
            : levitateStatus === 'done'
            ? 'border-emerald-500/50 bg-emerald-950/10 h-32'
            : levitateStatus !== 'idle'
            ? 'border-amber-500/50 bg-amber-950/10 h-32 animate-pulse'
            : 'border-zinc-800/80 hover:border-emerald-500/50 bg-zinc-950/20 hover:bg-zinc-950/40 h-24'
        }`}>
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 to-teal-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
          <div className="flex items-center justify-center space-x-4 select-none relative z-10">
            <div className={`p-2 rounded-xl border transition-all ${
              levitateStatus === 'error'
                ? 'bg-red-950 border-red-500/30 text-red-400'
                : levitateStatus === 'done'
                ? 'bg-emerald-950 border-emerald-500/30 text-emerald-400'
                : levitateStatus !== 'idle'
                ? 'bg-amber-950 border-amber-500/30 text-amber-400'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 group-hover:text-emerald-400 group-hover:border-emerald-500/20'
            }`}>
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <p className={`text-[11px] font-bold transition-colors uppercase tracking-wider ${
                levitateStatus === 'error' ? 'text-red-300'
                : levitateStatus === 'done' ? 'text-emerald-300'
                : levitateStatus !== 'idle' ? 'text-amber-300'
                : 'text-zinc-300 group-hover:text-white'
              }`}>
                {levitateStatus === 'idle' && 'Form 26AS PDF / TXT → Excel (Secure In-Memory Converter)'}
                {levitateStatus === 'validating' && '🔒 Validating File...'}
                {levitateStatus === 'parsing' && '⚙️ Parsing TDS Records...'}
                {levitateStatus === 'downloading' && '📥 Generating Excel...'}
                {levitateStatus === 'done' && `✅ Done — ${levitateRows} records extracted (${levitateChecksum})`}
                {levitateStatus === 'error' && '❌ Extraction Failed'}
              </p>
              <p className={`text-[9px] mt-0.5 ${
                levitateStatus === 'error' ? 'text-red-400' : 'text-zinc-500'
              }`}>
                {levitateStatus === 'error' 
                  ? levitateError 
                  : levitateStatus === 'idle'
                  ? 'Powered by LevitateExtract. Zero-retention · In-memory only · Checksum verified.'
                  : 'Processing securely in RAM. No data written to disk.'
                }
              </p>
            </div>
          </div>
          <input 
            type="file" 
            accept=".pdf,.txt" 
            className="hidden" 
            onChange={handleLevitateExtract} 
            disabled={levitateStatus !== 'idle' && levitateStatus !== 'error' && levitateStatus !== 'done'}
          />
        </label>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* LEFT COLUMN: INPUTS */}
        <div className="lg:col-span-7 space-y-8">

          {/* PROFILE CARD */}
          <Card className="bg-[#141419] border-zinc-800 shadow-xl overflow-hidden relative">
            <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
            <CardHeader className="pb-4 border-b border-zinc-900">
              <CardTitle className="text-md flex items-center gap-2 font-bold tracking-wide uppercase text-zinc-400 text-xs">
                <ShieldCheck className="w-4.5 h-4.5 text-zinc-500" /> Profile & Regime Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Entity Type Selection */}
              <div className="space-y-2">
                <Label className="text-xs text-zinc-400 uppercase tracking-wider font-semibold">Entity Type</Label>
                <Select value={profile.entity_type} onValueChange={(v) => setProfile({ ...profile, entity_type: v })}>
                  <SelectTrigger className="bg-zinc-950 border-zinc-800 focus:ring-1 focus:ring-blue-500"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    <SelectItem value="INDIVIDUAL">Individual</SelectItem>
                    <SelectItem value="HUF">HUF</SelectItem>
                    <SelectItem value="PARTNERSHIP_FIRM">Partnership Firm</SelectItem>
                    <SelectItem value="LLP">LLP</SelectItem>
                    <SelectItem value="DOMESTIC_COMPANY">Domestic Company</SelectItem>
                    <SelectItem value="AOP_BOI">AOP / BOI</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Financial Year */}
              <div className="space-y-2">
                <Label className="text-xs text-zinc-400 uppercase tracking-wider font-semibold">Financial Year</Label>
                <Select value={profile.financial_year} onValueChange={(v) => setProfile({ ...profile, financial_year: v })}>
                  <SelectTrigger className="bg-zinc-950 border-zinc-800 focus:ring-1 focus:ring-blue-500"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    <SelectItem value="FY2025-26">FY 2025-26 (AY 2026-27)</SelectItem>
                    <SelectItem value="FY2026-27">FY 2026-27 (AY 2027-28)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Taxpayer Age (Conditional) */}
              {profile.entity_type !== 'PARTNERSHIP_FIRM' && profile.entity_type !== 'LLP' && profile.entity_type !== 'DOMESTIC_COMPANY' && (
                <div className="space-y-2">
                  <Label className="text-xs text-zinc-400 uppercase tracking-wider font-semibold">Taxpayer Age</Label>
                  <Input type="number" value={profile.age} onChange={(e) => setProfile({ ...profile, age: Number(e.target.value) })} className="bg-zinc-950 border-zinc-800 text-right font-mono" />
                </div>
              )}

              {/* Tax Regime Switch (Conditional) */}
              {profile.entity_type !== 'PARTNERSHIP_FIRM' && profile.entity_type !== 'LLP' && profile.entity_type !== 'DOMESTIC_COMPANY' && (
                <div className="space-y-2 col-span-1">
                  <Label className="text-xs text-zinc-400 uppercase tracking-wider font-semibold flex justify-between">
                    Regime
                    <span className={isNewRegime ? 'text-green-400 font-extrabold' : 'text-orange-400 font-extrabold'}>
                      {isNewRegime ? 'NEW' : 'OLD'}
                    </span>
                  </Label>
                  <div className="flex items-center justify-between bg-zinc-950 border border-zinc-800 px-4 rounded-lg h-10">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Old</span>
                    <Switch checked={isNewRegime} onCheckedChange={(v) => setProfile({ ...profile, opted_for_new_regime: v })} className="data-[state=checked]:bg-green-500" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">New</span>
                  </div>
                </div>
              )}

              {/* Company Turnover < 400cr Switch (Conditional) */}
              {profile.entity_type === 'DOMESTIC_COMPANY' && (
                <div className="space-y-2">
                  <Label className="text-xs text-zinc-400 uppercase tracking-wider font-semibold">
                    Turnover &lt; ₹400 Cr
                  </Label>
                  <div className="flex items-center justify-between bg-zinc-950 border border-zinc-800 px-4 rounded-lg h-10">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">No</span>
                    <Switch checked={profile.company_turnover_under_400cr} onCheckedChange={(v) => setProfile({ ...profile, company_turnover_under_400cr: v })} className="data-[state=checked]:bg-blue-500" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Yes</span>
                  </div>
                </div>
              )}

              {/* Company Tax Provision Select (Conditional) */}
              {profile.entity_type === 'DOMESTIC_COMPANY' && (
                <div className="space-y-2 col-span-1">
                  <Label className="text-xs text-zinc-400 uppercase tracking-wider font-semibold">Tax Provision</Label>
                  <Select value={profile.corporate_tax_section} onValueChange={(v) => setProfile({ ...profile, corporate_tax_section: v })}>
                    <SelectTrigger className="bg-zinc-950 border-zinc-800 focus:ring-1 focus:ring-blue-500"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800">
                      <SelectItem value="NORMAL">Normal Corporate Rates</SelectItem>
                      <SelectItem value="SEC_115BAA">Section 115BAA (22%)</SelectItem>
                      <SelectItem value="SEC_115BAB">Section 115BAB (15%)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardContent>
          </Card>

          {/* INCOME HEADS (TABS) */}
          <Card className="bg-[#141419] border-zinc-800 shadow-xl overflow-hidden">
            <CardHeader className="pb-0 border-b border-zinc-900">
              <div className="flex items-center gap-2 mb-4">
                <IndianRupee className="w-5 h-5 text-emerald-500" />
                <CardTitle className="text-sm font-bold tracking-wide uppercase text-zinc-400 text-xs">Five Heads of Income</CardTitle>
              </div>
              <Tabs defaultValue="salary" className="w-full">
                <TabsList className="bg-zinc-950 p-1 w-full justify-start overflow-x-auto rounded-none border-b border-zinc-800 h-11">
                  <TabsTrigger value="salary" className="rounded-md text-xs px-4 py-2 data-[state=active]:bg-zinc-900 data-[state=active]:text-white">Salary</TabsTrigger>
                  <TabsTrigger value="hp" className="rounded-md text-xs px-4 py-2 data-[state=active]:bg-zinc-900 data-[state=active]:text-white">House Property</TabsTrigger>
                  <TabsTrigger value="business" className="rounded-md text-xs px-4 py-2 data-[state=active]:bg-zinc-900 data-[state=active]:text-white">Business (PGBP)</TabsTrigger>
                  <TabsTrigger value="cg" className="rounded-md text-xs px-4 py-2 data-[state=active]:bg-zinc-900 data-[state=active]:text-white">Capital Gains</TabsTrigger>
                  <TabsTrigger value="other" className="rounded-md text-xs px-4 py-2 data-[state=active]:bg-zinc-900 data-[state=active]:text-white">Other Sources</TabsTrigger>
                </TabsList>

                <div className="p-6 bg-zinc-900/10">

                  {/* SALARY TAB */}
                  <TabsContent value="salary" className="space-y-6 mt-0">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-2">
                      <div>
                        <h3 className="text-sm font-bold text-white uppercase tracking-wider">Salary Ledger</h3>
                        <p className="text-[10px] text-zinc-500">Calculate section 16 deductions, HRA & retirement exemptions.</p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsSalaryOpen(true)}
                        className="border-blue-500/30 hover:border-blue-500 hover:bg-blue-500/10 text-blue-400 text-xs rounded-xl px-4 h-9 transition-all"
                      >
                        <Calculator className="w-3.5 h-3.5 mr-2" />
                        Enter Details
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border border-zinc-800/40 p-4 rounded-xl bg-zinc-950/20">
                      <div className="space-y-2">
                        <Label className="text-zinc-400 text-xs font-semibold flex items-center">
                          Gross Salary
                          <StatutoryTooltip section="u/s 17(1)" explanation="Includes basic salary, dearness allowance, bonus, gratuity, and all taxable perquisites." />
                        </Label>
                        <CurrencyInput value={salary.gross} onChange={(v) => setSalary({ ...salary, gross: v })} />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-zinc-400 text-xs font-semibold flex items-center">
                          Less: Exempt Allowances
                          <StatutoryTooltip section="u/s 10" explanation="Includes House Rent Allowance (HRA), Leave Travel Allowance (LTA), and other statutory allowances." />
                        </Label>
                        <CurrencyInput value={salary.exemptions} onChange={(v) => setSalary({ ...salary, exemptions: v })} />
                      </div>
                    </div>

                    <div className="bg-blue-950/20 border border-blue-900/30 rounded-xl p-4 flex justify-between items-center shadow-inner">
                      <span className="text-blue-300 text-xs font-bold uppercase tracking-wider">Net Salary (before Standard Deduction)</span>
                      <span className="font-mono text-lg font-bold text-blue-400">{formatINR(netSalary)}</span>
                    </div>
                  </TabsContent>

                  {/* HOUSE PROPERTY TAB */}
                  <TabsContent value="hp" className="space-y-6 mt-0">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-2">
                      <div>
                        <h3 className="text-sm font-bold text-white uppercase tracking-wider">House Property Ledger</h3>
                        <p className="text-[10px] text-zinc-500">Manage multiple SOP/LOP properties, NAV calculations, & Section 24 limits.</p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsHpOpen(true)}
                        className="border-blue-500/30 hover:border-blue-500 hover:bg-blue-500/10 text-blue-400 text-xs rounded-xl px-4 h-9 transition-all"
                      >
                        <Calculator className="w-3.5 h-3.5 mr-2" />
                        Enter Details
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 border border-zinc-800/40 p-4 rounded-xl bg-zinc-950/20">
                      <div className="space-y-2">
                        <Label className="text-zinc-400 text-xs font-semibold">Gross Annual Value (GAV)</Label>
                        <CurrencyInput value={houseProperty.gav} onChange={(v) => setHouseProperty({ ...houseProperty, gav: v })} />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-zinc-400 text-xs font-semibold">Municipal Taxes Paid</Label>
                        <CurrencyInput value={houseProperty.municipalTaxes} onChange={(v) => setHouseProperty({ ...houseProperty, municipalTaxes: v })} />
                      </div>
                      <div className={`space-y-2 p-3 rounded-lg border transition-colors ${isNewRegime && houseProperty.gav === 0 ? 'bg-zinc-950/50 border-dashed border-zinc-800 opacity-60' : 'bg-transparent border-transparent'}`}>
                        <Label className="text-zinc-400 text-xs font-semibold flex items-center">
                          Interest on Loan
                          <StatutoryTooltip section="u/s 24(b)" explanation="Deduction for interest paid on home loan. Self-occupied property deduction is capped at Rs. 2 Lakhs (Old regime only)." />
                        </Label>
                        <CurrencyInput value={houseProperty.interest24b} disabled={isNewRegime && houseProperty.gav === 0} onChange={(v) => setHouseProperty({ ...houseProperty, interest24b: v })} />
                        {isNewRegime && houseProperty.gav === 0 && (
                          <span className="text-[9px] bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded font-medium mt-1 inline-block">
                            Not applicable under New Regime (Self-occupied)
                          </span>
                        )}
                      </div>
                    </div>
                  </TabsContent>

                  {/* BUSINESS TAB */}
                  <TabsContent value="business" className="space-y-6 mt-0">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-2">
                      <div>
                        <h3 className="text-sm font-bold text-white uppercase tracking-wider">Business & Profession (PGBP) Ledger</h3>
                        <p className="text-[10px] text-zinc-500">Resolve presumptive taxation (44AD/ADA/AE) or regular business books with Sec 32 depreciation.</p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsPgbpOpen(true)}
                        className="border-blue-500/30 hover:border-blue-500 hover:bg-blue-500/10 text-blue-400 text-xs rounded-xl px-4 h-9 transition-all"
                      >
                        <Calculator className="w-3.5 h-3.5 mr-2" />
                        Enter Details
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border border-zinc-800/40 p-4 rounded-xl bg-zinc-950/20">
                      <div className="space-y-2">
                        <Label className="text-zinc-400 text-xs font-semibold flex items-center">
                          Net Profit as per P&L
                          <StatutoryTooltip section="Sec 28" explanation="Net profits and gains from business or profession before adjusting for Income Tax depreciation." />
                        </Label>
                        <CurrencyInput value={business.netProfit} onChange={(v) => setBusiness({ ...business, netProfit: v })} />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-zinc-400 text-xs font-semibold flex items-center">
                          Depreciation Adjustment
                          <StatutoryTooltip section="Sec 32" explanation="Depreciation calculated as per Income Tax Rules, 1962 (to be reduced from book profits)." />
                        </Label>
                        <CurrencyInput value={business.depreciation} onChange={(v) => setBusiness({ ...business, depreciation: v })} />
                      </div>
                    </div>
                  </TabsContent>

                  {/* CAPITAL GAINS TAB */}
                  <TabsContent value="cg" className="space-y-6 mt-0">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-2">
                      <div>
                        <h3 className="text-sm font-bold text-white uppercase tracking-wider">Capital Gains Ledger</h3>
                        <p className="text-[10px] text-zinc-500">Add transactions, auto-abolish indexation post Finance Act 2024, & check SDV limits.</p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsCgOpen(true)}
                        className="border-blue-500/30 hover:border-blue-500 hover:bg-blue-500/10 text-blue-400 text-xs rounded-xl px-4 h-9 transition-all"
                      >
                        <Calculator className="w-3.5 h-3.5 mr-2" />
                        Enter Details
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 border border-zinc-800/40 p-4 rounded-xl bg-zinc-950/20">
                      <div className="space-y-4">
                        <h3 className="font-bold text-emerald-400 border-b border-zinc-800 pb-2 text-xs uppercase tracking-wider">Short-Term (STCG)</h3>
                        <div className="space-y-2">
                          <Label className="text-zinc-400 text-xs font-semibold flex items-center">
                            Equity Shares / Units
                            <StatutoryTooltip section="Sec 111A" explanation="Short-term capital gains on equity shares/units subject to STT. Taxed at flat 20% (increased in Budget 2024)." />
                          </Label>
                          <CurrencyInput value={capitalGains.stcg111A} onChange={(v) => setCapitalGains({ ...capitalGains, stcg111A: v })} />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-zinc-400 text-xs font-semibold">Other Assets (Taxed at Slabs)</Label>
                          <CurrencyInput value={capitalGains.stcgOther} onChange={(v) => setCapitalGains({ ...capitalGains, stcgOther: v })} />
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h3 className="font-bold text-purple-400 border-b border-zinc-800 pb-2 text-xs uppercase tracking-wider">Long-Term (LTCG)</h3>
                        <div className="space-y-2">
                          <Label className="text-zinc-400 text-xs font-semibold flex items-center">
                            Equity Shares / Units
                            <StatutoryTooltip section="Sec 112A" explanation="Taxed at flat 12.5% on gains exceeding Rs. 1.25 Lakhs without indexation benefit (Budget 2024 update)." />
                          </Label>
                          <CurrencyInput value={capitalGains.ltcg112A} onChange={(v) => setCapitalGains({ ...capitalGains, ltcg112A: v })} />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-zinc-400 text-xs font-semibold flex items-center">
                            Other Assets (No Indexation)
                            <StatutoryTooltip section="Sec 112" explanation="Taxed at flat 12.5% for all assets without indexation benefit under the revised Budget rules." />
                          </Label>
                          <CurrencyInput value={capitalGains.ltcg112} onChange={(v) => setCapitalGains({ ...capitalGains, ltcg112: v })} />
                        </div>
                      </div>
                    </div>
                  </TabsContent>

                  {/* OTHER SOURCES TAB */}
                  <TabsContent value="other" className="space-y-6 mt-0">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-2">
                      <div>
                        <h3 className="text-sm font-bold text-white uppercase tracking-wider">Other Sources & Clubbing Ledger</h3>
                        <p className="text-[10px] text-zinc-500">Manage interest, dividends, gifts, taxable LIPs, and minor/spouse clubbing u/s 64.</p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsIfosOpen(true)}
                        className="border-blue-500/30 hover:border-blue-500 hover:bg-blue-500/10 text-blue-400 text-xs rounded-xl px-4 h-9 transition-all"
                      >
                        <Calculator className="w-3.5 h-3.5 mr-2" />
                        Enter Details
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 border border-zinc-800/40 p-4 rounded-xl bg-zinc-950/20">
                      <div className="space-y-2">
                        <Label className="text-zinc-400 text-xs font-semibold">Interest Income</Label>
                        <CurrencyInput value={otherSources.interest} onChange={(v) => setOtherSources({ ...otherSources, interest: v })} />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-zinc-400 text-xs font-semibold">Dividend Income</Label>
                        <CurrencyInput value={otherSources.dividend} onChange={(v) => setOtherSources({ ...otherSources, dividend: v })} />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-zinc-400 text-xs font-semibold flex items-center">
                          Casual Income
                          <StatutoryTooltip section="Sec 115BB/H" explanation="Includes Winnings from Lotteries, Game Shows, and Crypto Asset Transfers. Taxed at flat 30% without deductions." />
                        </Label>
                        <CurrencyInput value={otherSources.casual} onChange={(v) => setOtherSources({ ...otherSources, casual: v })} />
                      </div>
                    </div>
                  </TabsContent>

                </div>
              </Tabs>
            </CardHeader>
          </Card>

          {/* DEDUCTIONS CARD */}
          <Card className="bg-[#141419] border-zinc-800 shadow-xl overflow-hidden relative">
            <div className={`absolute top-0 left-0 w-1 h-full ${isNewRegime ? 'bg-orange-500/60' : 'bg-purple-600'}`}></div>
            <CardHeader className="pb-4 border-b border-zinc-900">
              <CardTitle className="text-md flex justify-between items-center font-bold tracking-wide uppercase text-zinc-400 text-xs">
                <div className="flex items-center gap-2">
                  <FileText className="w-4.5 h-4.5 text-zinc-500" /> Chapter VI-A Deductions
                </div>
                {isNewRegime && <span className="text-[10px] font-extrabold bg-orange-500/10 border border-orange-500/20 text-orange-400 px-3 py-1 rounded-full uppercase tracking-wider">Restricted (New Regime)</span>}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[
                  { key: '80C', label: 'Sec 80C (PPF, LIC, ELSS)', limit: 'Max ₹1.5L', exp: 'Deductions for tax-saving mutual funds, EPF, PPF, life insurance premium.' },
                  { key: '80D', label: 'Sec 80D (Health Insurance)', limit: 'Max ₹25K/50K', exp: 'Premium paid for health insurance policies for self, family, and parents.' },
                  { key: '80CCD1B', label: 'Sec 80CCD(1B) (NPS)', limit: 'Max ₹50K', exp: 'Additional voluntary contribution to National Pension System.' },
                  { key: '80CCD2', label: 'Sec 80CCD(2) (Employer NPS)', limit: 'Allowed in New Regime', exp: 'Employer contribution to NPS. Allowed under both old and new tax regimes.', allowedInNew: true },
                  { key: '80TTA', label: 'Sec 80TTA (Savings Interest)', limit: 'Max ₹10K', exp: 'Deductions on interest earned from savings bank accounts (non-senior citizens).' },
                  { key: '80TTB', label: 'Sec 80TTB (Senior Interest)', limit: 'Max ₹50K', exp: 'Deductions on interest earned from FD/Savings accounts for senior citizens.' }
                ].map((item) => {
                  const isNonIndividual = profile.entity_type !== 'INDIVIDUAL' && profile.entity_type !== 'HUF' && profile.entity_type !== 'AOP_BOI';
                  const isItemDisabled = isNonIndividual || (isNewRegime && !item.allowedInNew);
                  return (
                    <div
                      key={item.key}
                      className={`space-y-2 p-3 rounded-xl border transition-all ${isItemDisabled
                          ? 'bg-zinc-950/50 border-dashed border-zinc-800/80 opacity-40'
                          : 'bg-zinc-950/20 border-zinc-800/40 hover:border-zinc-800'
                        }`}
                    >
                      <Label className="text-zinc-400 text-xs font-semibold flex items-center justify-between">
                        <span className="flex items-center">
                          {item.key}
                          <StatutoryTooltip section={item.key} explanation={item.exp} />
                        </span>
                        <span className="text-[9px] text-zinc-500 font-mono">{item.limit}</span>
                      </Label>
                      <CurrencyInput
                        value={deductions[item.key] || 0}
                        disabled={isItemDisabled}
                        onChange={(v) => setDeductions({ ...deductions, [item.key]: v })}
                      />
                      {isItemDisabled && (
                        <span className="text-[8px] bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded font-medium mt-1 inline-block select-none">
                          {isNonIndividual ? 'Not applicable for this entity' : 'Not applicable under New Regime'}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* COMPLIANCE DISCLOSURES CARD (INFORMATION ONLY) */}
          {complianceDisclosures.length > 0 && (
            <Card className="bg-[#141419] border-zinc-800 shadow-xl overflow-hidden mt-6 relative border-dashed">
              <div className="absolute top-0 left-0 w-1 h-full bg-amber-500/50"></div>
              <CardHeader className="pb-4 border-b border-zinc-900">
                <CardTitle className="text-md flex justify-between items-center font-bold tracking-wide uppercase text-zinc-400 text-xs">
                  <div className="flex items-center gap-2">
                    <Info className="w-4.5 h-4.5 text-amber-500" /> Statutory Compliance Disclosures (Information Only)
                  </div>
                  <span className="text-[9px] font-extrabold bg-amber-500/10 border border-amber-500/20 text-amber-500 px-3 py-1 rounded-full uppercase tracking-wider">
                    Excluded from GTI
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="space-y-4 text-xs">
                  <p className="text-zinc-500 text-[10px]">
                    The following high-value financial transactions were reported in the SFT node of your AIS document. Under statutory rules, these are reported for monitoring and are not mapped to taxable income heads:
                  </p>
                  <div className="divide-y divide-zinc-900 border border-zinc-800 rounded-lg overflow-hidden bg-zinc-950/20">
                    {complianceDisclosures.map((disc, index) => (
                      <div key={index} className="flex justify-between items-center p-3 hover:bg-zinc-900/10 transition-colors">
                        <div>
                          <div className="font-bold text-zinc-300">{disc.source}</div>
                          <div className="text-[9px] text-zinc-500 font-mono mt-0.5">{disc.description}</div>
                        </div>
                        <div className="font-mono text-zinc-400 font-bold">
                          {formatINR(disc.amount)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* RIGHT COLUMN: COMPUTATION SUMMARY (STICKY) */}
        <div className="lg:col-span-5">
          <div className="sticky top-6">
            <Card className="bg-[#141419] border-zinc-800 shadow-2xl overflow-hidden relative">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 to-indigo-600"></div>

              <CardHeader className="p-4 border-b border-zinc-900 bg-zinc-950/40 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 space-y-0">
                <div className="flex items-center gap-2">
                  <PieChart className="w-5 h-5 text-blue-500" />
                  <div>
                    <h2 className="text-sm font-bold text-white uppercase tracking-wider">Computation Statement</h2>
                    <p className="text-[10px] text-zinc-500 mt-0.5">Symmetrical Comparison Model</p>
                  </div>
                </div>
                {assessment && (
                  <div className="flex items-center gap-2">
                    <div className="bg-zinc-950 p-1 rounded-lg border border-zinc-800 flex">
                      <button
                        type="button"
                        onClick={() => setSummaryView('statement')}
                        className={`text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-md transition-colors ${summaryView === 'statement' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:text-zinc-300'
                          }`}
                      >
                        Statement
                      </button>
                      <button
                        type="button"
                        onClick={() => setSummaryView('worksheet')}
                        className={`text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-md transition-colors ${summaryView === 'worksheet' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:text-zinc-300'
                          }`}
                      >
                        Worksheet
                      </button>
                    </div>
                    <Button
                      onClick={handleDownloadExcel}
                      size="sm"
                      className="bg-emerald-950 border border-emerald-800/50 hover:bg-emerald-900 text-emerald-400 rounded-lg text-xs h-8 px-3"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" /> Excel
                    </Button>
                    <Button
                      onClick={handleDownloadPDF}
                      size="sm"
                      className="bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 rounded-lg text-xs h-8 px-3"
                    >
                      <Download className="w-3.5 h-3.5 mr-1.5" /> Export PDF
                    </Button>
                  </div>
                )}
              </CardHeader>

              <CardContent className="p-0">
                {assessment ? (
                  summaryView === 'statement' ? (
                    <div>
                      {/* Optimal Regime Banner */}
                      {!isNonIndividual && (
                        <div className="bg-emerald-950/40 border border-emerald-500/20 px-4 py-3 rounded-xl mx-4 mt-4 flex items-center justify-between shadow-[0_0_15px_rgba(16,185,129,0.05)]">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 text-emerald-400">
                              <TrendingUp className="w-4 h-4" />
                            </div>
                            <div>
                              <span className="text-[9px] font-bold text-emerald-400/80 uppercase tracking-widest block">Optimal Choice</span>
                              <span className="text-xs font-bold text-white">
                                {assessment.recommendation === 'NEW' ? 'New Regime u/s 115BAC' : 'Old Regime'}
                              </span>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-[9px] font-bold text-emerald-400/80 uppercase tracking-widest block">Net Savings</span>
                            <span className="text-xs font-mono font-bold text-emerald-400">
                              {formatINR(assessment.savings)}
                            </span>
                          </div>
                        </div>
                      )}

                      <ScrollArea className="h-[calc(100vh-270px)] max-h-[580px] px-4 py-4">
                        <table className="w-full text-xs text-zinc-300 border-collapse">
                          <thead>
                            <tr className="text-zinc-500 border-b border-zinc-900 uppercase tracking-widest text-[9px] font-bold">
                              <th className="pb-2 text-left font-semibold">Tax Head / Component</th>
                              {isNonIndividual ? (
                                <th className="pb-2 text-right font-semibold pr-2">Statutory Tax Liability</th>
                              ) : (
                                <>
                                  <th className="pb-2 text-right font-semibold">Old</th>
                                  <th className="pb-2 text-right font-semibold">New</th>
                                  <th className="pb-2 text-center font-semibold w-8">Δ</th>
                                </>
                              )}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-900">
                            {(() => {
                              const stmtRows = [];
                              
                              stmtRows.push({ label: '1. Income from Salary (Gross)', oldVal: salary.gross, newVal: salary.gross });
                              if (salary.exemptions > 0) stmtRows.push({ label: '  Less: Exemptions/Allowances', oldVal: -salary.exemptions, newVal: 0, red: true, indent: true });
                              stmtRows.push({ label: '  Less: Standard Deduction u/s 16(ia)', oldVal: -assessment.oldRegimeAssessment.standardDeductionAmount, newVal: -assessment.newRegimeAssessment.standardDeductionAmount, red: true, indent: true });
                              
                              if (houseProperty.gav > 0 || houseProperty.interest24b > 0 || assessment.oldRegimeAssessment.incomeBreakdown?.houseProperty) {
                                stmtRows.push({ label: '2. Income from House Property (Net)', oldVal: assessment.oldRegimeAssessment.incomeBreakdown?.houseProperty || 0, newVal: assessment.newRegimeAssessment.incomeBreakdown?.houseProperty || 0 });
                              } else {
                                stmtRows.push({ label: '2. Income from House Property (Net)', oldVal: 0, newVal: 0 });
                              }
                              
                              stmtRows.push({ label: '3. Business / Profession (Net)', oldVal: netBusiness, newVal: netBusiness });
                              
                              const totalCG = capitalGains.stcg111A + capitalGains.stcgOther + capitalGains.ltcg112A + capitalGains.ltcg112;
                              stmtRows.push({ label: '4. Capital Gains (All Heads)', oldVal: totalCG, newVal: totalCG });
                              if (capitalGains.stcg111A > 0) stmtRows.push({ label: '  - STCG u/s 111A (Equity)', oldVal: capitalGains.stcg111A, newVal: capitalGains.stcg111A, indent: true });
                              if (capitalGains.stcgOther > 0) stmtRows.push({ label: '  - STCG (Normal/Other)', oldVal: capitalGains.stcgOther, newVal: capitalGains.stcgOther, indent: true });
                              if (capitalGains.ltcg112A > 0) stmtRows.push({ label: '  - LTCG u/s 112A (Equity)', oldVal: capitalGains.ltcg112A, newVal: capitalGains.ltcg112A, indent: true });
                              if (capitalGains.ltcg112 > 0) stmtRows.push({ label: '  - LTCG u/s 112 (Other)', oldVal: capitalGains.ltcg112, newVal: capitalGains.ltcg112, indent: true });
                              
                              const totalOS = otherSources.interest + otherSources.dividend + otherSources.casual;
                              stmtRows.push({ label: '5. Income from Other Sources', oldVal: totalOS, newVal: totalOS });
                              if (otherSources.interest > 0) stmtRows.push({ label: '  - Interest Income', oldVal: otherSources.interest, newVal: otherSources.interest, indent: true });
                              if (otherSources.dividend > 0) stmtRows.push({ label: '  - Dividend Income', oldVal: otherSources.dividend, newVal: otherSources.dividend, indent: true });
                              if (otherSources.casual > 0) stmtRows.push({ label: '  - Casual Income (Lottery/Crypto)', oldVal: otherSources.casual, newVal: otherSources.casual, indent: true });

                              stmtRows.push({ label: 'Gross Total Income (GTI)', oldVal: assessment.oldRegimeAssessment.grossTotalIncome, newVal: assessment.newRegimeAssessment.grossTotalIncome, highlight: true });
                              
                              stmtRows.push({ label: 'Less: Chapter VI-A Deductions', oldVal: -assessment.oldRegimeAssessment.totalDeductions, newVal: -assessment.newRegimeAssessment.totalDeductions, orange: true });
                              Object.entries(deductions).forEach(([key, val]) => {
                                if (val > 0) {
                                  stmtRows.push({ label: `  - Claimed u/s ${key}`, oldVal: -val, newVal: (key === '80CCD2' ? -val : 0), orange: true, indent: true });
                                }
                              });
                              
                              stmtRows.push({ label: 'Net Taxable Income', oldVal: assessment.oldRegimeAssessment.totalNetTaxableIncome, newVal: assessment.newRegimeAssessment.totalNetTaxableIncome, grandTotal: true, green: true });

                              stmtRows.push({ label: 'Tax on Normal Income (Slab Rate)', oldVal: assessment.oldRegimeAssessment.taxOnNormalIncome, newVal: assessment.newRegimeAssessment.taxOnNormalIncome });
                              if (assessment.oldRegimeAssessment.totalTaxOnSpecialIncome > 0 || assessment.newRegimeAssessment.totalTaxOnSpecialIncome > 0) {
                                stmtRows.push({ label: 'Tax on Special Income (111A/112A etc.)', oldVal: assessment.oldRegimeAssessment.totalTaxOnSpecialIncome, newVal: assessment.newRegimeAssessment.totalTaxOnSpecialIncome });
                              }
                              
                              if (assessment.oldRegimeAssessment.rebate87AAmount > 0 || assessment.newRegimeAssessment.rebate87AAmount > 0) {
                                stmtRows.push({ label: 'Less: Rebate u/s 87A', oldVal: -assessment.oldRegimeAssessment.rebate87AAmount, newVal: -assessment.newRegimeAssessment.rebate87AAmount, greenText: true });
                              }
                              if (assessment.oldRegimeAssessment.surchargeAmount > 0 || assessment.newRegimeAssessment.surchargeAmount > 0) {
                                stmtRows.push({ label: 'Add: Surcharge (Net)', oldVal: assessment.oldRegimeAssessment.surchargeAmount, newVal: assessment.newRegimeAssessment.surchargeAmount });
                              }
                              stmtRows.push({ label: 'Add: HEC Cess (4%)', oldVal: assessment.oldRegimeAssessment.cessAmount, newVal: assessment.newRegimeAssessment.cessAmount });
                              
                              return stmtRows;
                            })().map((row, idx) => {
                              const hasVariance = row.oldVal !== row.newVal;

                              let rowBg = '';
                              if (row.grandTotal) {
                                rowBg = 'bg-zinc-950 font-bold border-y-2 border-zinc-800';
                              } else if (row.highlight) {
                                rowBg = 'bg-zinc-900/60 font-semibold border-y border-zinc-900';
                              } else if (hasVariance) {
                                rowBg = 'bg-orange-500/[0.02]';
                              }

                              return (
                                <tr key={idx} className={`${rowBg} text-[11px] group transition-colors hover:bg-zinc-900/30`}>
                                  <td className={`py-2.5 text-zinc-400 pl-1 ${row.indent ? 'pl-4 text-zinc-500' : ''}`} style={{ whiteSpace: 'pre' }}>{row.label}</td>
                                  {isNonIndividual ? (
                                    <td className={`py-2.5 text-right font-mono pr-2 ${row.red ? 'text-red-400' : row.orange ? 'text-orange-400' : row.green ? 'text-emerald-400' : row.greenText ? 'text-emerald-500' : ''}`}>
                                      {formatINR(row.newVal)}
                                    </td>
                                  ) : (
                                    <>
                                      <td className={`py-2.5 text-right font-mono pr-2 ${row.red ? 'text-red-400' : row.orange ? 'text-orange-400' : row.green ? 'text-emerald-400' : row.greenText ? 'text-emerald-500' : ''}`}>
                                        {formatINR(row.oldVal)}
                                      </td>
                                      <td className={`py-2.5 text-right font-mono pr-2 ${row.red ? 'text-red-400' : row.orange ? 'text-orange-400' : row.green ? 'text-emerald-400' : row.greenText ? 'text-emerald-500' : ''}`}>
                                        {formatINR(row.newVal)}
                                      </td>
                                      <td className="py-2.5 text-center">
                                        {hasVariance && (
                                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-orange-500" title="Variance detected" />
                                        )}
                                      </td>
                                    </>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>

                        {/* Collapsible Accordion: Statutory Notes */}
                        <div className="mt-6 border-t border-zinc-800/80 pt-4">
                          <button
                            type="button"
                            onClick={() => setShowNotes(!showNotes)}
                            className="w-full flex items-center justify-between text-zinc-400 hover:text-white transition-colors py-2 text-xs font-bold uppercase tracking-wider"
                          >
                            <span className="flex items-center gap-1.5">
                              <FileText className="w-4 h-4 text-blue-500" />
                              Statutory Notes & Disclosures
                            </span>
                            <span className="text-[10px] text-zinc-500">{showNotes ? 'Hide [▲]' : 'Show [▼]'}</span>
                          </button>

                          {showNotes && (
                            <div className="mt-3 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                              {(() => {
                                const mergedNotes: any[] = [];
                                const seen = new Set();

                                const addNotes = (notesList: any[]) => {
                                  if (!notesList) return;
                                  notesList.forEach(n => {
                                    const key = `${n.applicableSection}-${n.lineItem}`;
                                    if (!seen.has(key)) {
                                      seen.add(key);
                                      mergedNotes.push(n);
                                    }
                                  });
                                };

                                addNotes(assessment.oldRegimeAssessment.computationNotes);
                                addNotes(assessment.newRegimeAssessment.computationNotes);

                                if (mergedNotes.length === 0) {
                                  return (
                                    <p className="text-[10px] text-zinc-500 italic p-2 border border-zinc-800/50 border-dashed rounded-lg text-center">
                                      No special statutory overrides or rebates triggered for this calculation.
                                    </p>
                                  );
                                }

                                return mergedNotes.map((note: any, idx: number) => (
                                  <div key={idx} className="bg-zinc-950/60 border border-zinc-800/50 p-2.5 rounded-lg flex flex-col gap-1.5">
                                    <div className="flex items-center justify-between">
                                      <span className="text-[10px] font-bold text-white leading-none">{note.lineItem}</span>
                                      <span className="text-[8px] bg-blue-500/10 text-blue-400 font-extrabold px-1.5 py-0.5 rounded tracking-wide uppercase leading-none border border-blue-500/20">
                                        {note.applicableSection}
                                      </span>
                                    </div>
                                    <p className="text-[10px] text-zinc-400 leading-relaxed font-normal">{note.rationaleString}</p>
                                  </div>
                                ));
                              })()}
                            </div>
                          )}
                        </div>
                      </ScrollArea>
                    </div>
                  ) : (
                    /* Detailed Computation Worksheet Tab */
                    <div className="p-4 space-y-6 animate-in fade-in duration-200">
                      <ScrollArea className="h-[calc(100vh-270px)] max-h-[580px] pr-2">

                        {/* Old Regime Audit */}
                        <div className="space-y-4">
                          <div className="border-l-2 border-orange-500 pl-3">
                            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Old Tax Regime Worksheet</h3>
                            <p className="text-[10px] text-zinc-500 mt-0.5">Slab & statutory surcharge math audit</p>
                          </div>

                          <table className="w-full text-[10px] text-zinc-400 border-collapse">
                            <thead>
                              <tr className="border-b border-zinc-800 text-zinc-500 font-semibold uppercase tracking-wider text-[8px]">
                                <th className="pb-1.5 text-left">Slab Range</th>
                                <th className="pb-1.5 text-right">Rate</th>
                                <th className="pb-1.5 text-right">Income in Slab</th>
                                <th className="pb-1.5 text-right">Tax Generated</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-900 font-mono">
                              {assessment.oldRegimeAssessment.calculationSheet.slabBreakdown.map((row: any, idx: number) => (
                                <tr key={idx} className="hover:bg-zinc-900/20">
                                  <td className="py-2 text-left font-sans">{row.slabRange}</td>
                                  <td className="py-2 text-right">{row.ratePercentage}%</td>
                                  <td className="py-2 text-right">{formatINR(row.taxableAmountInSlab)}</td>
                                  <td className="py-2 text-right text-white">{formatINR(row.taxGenerated)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>

                          {/* Surcharge & Cess Verification block */}
                          <div className="bg-zinc-950/50 border border-zinc-900/40 p-3 rounded-xl space-y-2.5 text-[10px]">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1">
                              <span className="text-zinc-500 font-bold uppercase tracking-wider text-[8px]">Surcharge Formula u/s 2(3):</span>
                              <span className="font-mono text-zinc-300 text-right leading-relaxed">
                                (Base Tax {formatINR(assessment.oldRegimeAssessment.calculationSheet.surchargeDetails.baseTaxAmount)} × {assessment.oldRegimeAssessment.calculationSheet.surchargeDetails.appliedRate}%)
                                - {formatINR(assessment.oldRegimeAssessment.calculationSheet.surchargeDetails.marginalReliefSubtracted)}
                                = <strong className="text-emerald-400">{formatINR(assessment.oldRegimeAssessment.calculationSheet.surchargeDetails.netSurcharge)}</strong>
                              </span>
                            </div>
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1 border-t border-zinc-900/80 pt-2">
                              <span className="text-zinc-500 font-bold uppercase tracking-wider text-[8px]">Health & Ed. Cess (4%):</span>
                              <span className="font-mono text-zinc-300 text-right leading-relaxed">
                                {formatINR(assessment.oldRegimeAssessment.calculationSheet.cessDetails.taxPlusSurcharge)} × 4%
                                = <strong className="text-emerald-400">{formatINR(assessment.oldRegimeAssessment.calculationSheet.cessDetails.cessAmount)}</strong>
                              </span>
                            </div>
                          </div>
                        </div>

                        <Separator className="my-6 bg-zinc-900" />

                        {/* New Regime Audit */}
                        <div className="space-y-4">
                          <div className="border-l-2 border-green-500 pl-3">
                            <h3 className="text-xs font-bold text-white uppercase tracking-wider">New Tax Regime Worksheet (115BAC)</h3>
                            <p className="text-[10px] text-zinc-500 mt-0.5">Slab & statutory surcharge math audit</p>
                          </div>

                          <table className="w-full text-[10px] text-zinc-400 border-collapse">
                            <thead>
                              <tr className="border-b border-zinc-800 text-zinc-500 font-semibold uppercase tracking-wider text-[8px]">
                                <th className="pb-1.5 text-left">Slab Range</th>
                                <th className="pb-1.5 text-right">Rate</th>
                                <th className="pb-1.5 text-right">Income in Slab</th>
                                <th className="pb-1.5 text-right">Tax Generated</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-900 font-mono">
                              {assessment.newRegimeAssessment.calculationSheet.slabBreakdown.map((row: any, idx: number) => (
                                <tr key={idx} className="hover:bg-zinc-900/20">
                                  <td className="py-2 text-left font-sans">{row.slabRange}</td>
                                  <td className="py-2 text-right">{row.ratePercentage}%</td>
                                  <td className="py-2 text-right">{formatINR(row.taxableAmountInSlab)}</td>
                                  <td className="py-2 text-right text-white">{formatINR(row.taxGenerated)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>

                          {/* Surcharge & Cess Verification block */}
                          <div className="bg-zinc-950/50 border border-zinc-900/40 p-3 rounded-xl space-y-2.5 text-[10px]">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1">
                              <span className="text-zinc-500 font-bold uppercase tracking-wider text-[8px]">Surcharge Formula u/s 2(3):</span>
                              <span className="font-mono text-zinc-300 text-right leading-relaxed">
                                (Base Tax {formatINR(assessment.newRegimeAssessment.calculationSheet.surchargeDetails.baseTaxAmount)} × {assessment.newRegimeAssessment.calculationSheet.surchargeDetails.appliedRate}%)
                                - {formatINR(assessment.newRegimeAssessment.calculationSheet.surchargeDetails.marginalReliefSubtracted)}
                                = <strong className="text-emerald-400">{formatINR(assessment.newRegimeAssessment.calculationSheet.surchargeDetails.netSurcharge)}</strong>
                              </span>
                            </div>
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1 border-t border-zinc-900/80 pt-2">
                              <span className="text-zinc-500 font-bold uppercase tracking-wider text-[8px]">Health & Ed. Cess (4%):</span>
                              <span className="font-mono text-zinc-300 text-right leading-relaxed">
                                {formatINR(assessment.newRegimeAssessment.calculationSheet.cessDetails.taxPlusSurcharge)} × 4%
                                = <strong className="text-emerald-400">{formatINR(assessment.newRegimeAssessment.calculationSheet.cessDetails.cessAmount)}</strong>
                              </span>
                            </div>
                          </div>
                        </div>

                      </ScrollArea>
                    </div>
                  )) : (
                  <div className="flex flex-col items-center justify-center h-72 text-zinc-600 p-6 text-center select-none">
                    <Calculator className="w-10 h-10 mb-3 opacity-20" />
                    <p className="text-xs">Enter financial streams and click Calculate to resolve the regime comparison statement.</p>
                  </div>
                )}
              </CardContent>

              {assessment && (
                <div className="bg-zinc-950 border-t border-zinc-900 p-5 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] z-10 relative">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-zinc-500 text-[10px] font-bold uppercase tracking-wider">Final Statutory Tax Liability</span>
                    <span className="text-[10px] bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded text-blue-400 font-bold">
                      FY {profile.financial_year}
                    </span>
                  </div>

                  {isNonIndividual ? (
                    <div className="p-4 rounded-xl border border-blue-500/30 bg-blue-950/10 text-center">
                      <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Total Statutory Tax Liability</div>
                      <div className="text-2xl font-black font-mono mt-1.5 text-blue-400">
                        {formatINR(assessment.newRegimeAssessment.totalTaxLiability)}
                      </div>
                      <div className="text-[10px] text-zinc-500 mt-1 font-medium">Effective Tax Rate: {assessment.newRegimeAssessment.effectiveTaxRate.toFixed(2)}%</div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      {/* Old Regime Summary */}
                      <div className={`p-3 rounded-xl border transition-all ${assessment.recommendation === 'OLD' ? 'bg-emerald-950/20 border-emerald-500/30' : 'bg-zinc-900/30 border-zinc-800/80'}`}>
                        <div className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider flex justify-between">
                          Old Regime
                          {assessment.recommendation === 'OLD' && <span className="text-emerald-400 font-black">Best</span>}
                        </div>
                        <div className={`text-lg font-bold font-mono mt-1 ${assessment.recommendation === 'OLD' ? 'text-emerald-400' : 'text-zinc-400'}`}>
                          {formatINR(assessment.oldRegimeAssessment.totalTaxLiability)}
                        </div>
                        <div className="text-[9px] text-zinc-500 mt-0.5 font-medium">Eff. Rate: {assessment.oldRegimeAssessment.effectiveTaxRate.toFixed(2)}%</div>
                      </div>

                      {/* New Regime Summary */}
                      <div className={`p-3 rounded-xl border transition-all ${assessment.recommendation === 'NEW' ? 'bg-emerald-950/20 border-emerald-500/30' : 'bg-zinc-900/30 border-zinc-800/80'}`}>
                        <div className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider flex justify-between">
                          New Regime
                          {assessment.recommendation === 'NEW' && <span className="text-emerald-400 font-black">Best</span>}
                        </div>
                        <div className={`text-lg font-bold font-mono mt-1 ${assessment.recommendation === 'NEW' ? 'text-emerald-400' : 'text-zinc-400'}`}>
                          {formatINR(assessment.newRegimeAssessment.totalTaxLiability)}
                        </div>
                        <div className="text-[9px] text-zinc-500 mt-0.5 font-medium">Eff. Rate: {assessment.newRegimeAssessment.effectiveTaxRate.toFixed(2)}%</div>
                      </div>
                    </div>
                  )}

                  <div className="mt-4 flex gap-3">
                    <Button onClick={handleDownloadExcel} variant="outline" className="flex-1 border-emerald-800/50 hover:bg-emerald-900/30 text-emerald-400 rounded-xl text-xs h-10 font-bold tracking-wide">
                      <FileSpreadsheet className="w-4 h-4 mr-2" /> Excel
                    </Button>
                    <Button onClick={handleDownloadPDF} variant="outline" className="flex-1 border-zinc-800 hover:bg-zinc-900 rounded-xl text-xs h-10 font-bold tracking-wide">
                      <Download className="w-4 h-4 mr-2" /> Export PDF
                    </Button>
                    <Button onClick={handleCalculate} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs h-10 font-black uppercase tracking-wide transition-all shadow-lg shadow-blue-600/20">
                      Recalculate
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>

      {/* Annexure I: Step-by-Step Mathematical Breakdown */}
      {assessment && (
        <Card className="bg-[#141419] border-zinc-800 shadow-2xl overflow-hidden mt-8 relative">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 to-indigo-600"></div>
          <CardHeader className="p-5 border-b border-zinc-900 bg-zinc-950/40">
            <CardTitle className="text-md flex justify-between items-center font-bold tracking-wide uppercase text-white">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-500" />
                Annexure I: Step-by-Step Mathematical Breakdown
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            {isNonIndividual ? (
              <div className="grid grid-cols-1 gap-8">
                {/* Flat Rate Tax calculation card */}
                <div className="space-y-4">
                  <div className="border-l-2 border-blue-500 pl-3">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">Statutory Tax Calculation Worksheet</h3>
                    <p className="text-[10px] text-zinc-500 mt-0.5">Flat tax rate & statutory surcharge verification</p>
                  </div>

                  <div className="bg-zinc-950/50 border border-zinc-800/50 p-5 rounded-xl space-y-4 text-xs font-mono text-zinc-300">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center text-sm font-bold text-white border-b border-zinc-900 pb-3 gap-2">
                      <span className="font-sans text-xs sm:text-sm">Flat Rate Formula:</span>
                      <span>
                        Net Income {formatINR(assessment.newRegimeAssessment.totalNetTaxableIncome)} × {assessment.newRegimeAssessment.calculationSheet.slabBreakdown[0].ratePercentage}%
                        = Base Tax {formatINR(assessment.newRegimeAssessment.calculationSheet.slabBreakdown[0].taxGenerated)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center pt-1.5">
                      <span className="text-zinc-500 font-sans font-medium">Base Tax:</span>
                      <span className="font-bold">{formatINR(assessment.newRegimeAssessment.calculationSheet.surchargeDetails.baseTaxAmount)}</span>
                    </div>
                    <div className="flex justify-between items-center border-t border-zinc-900/80 pt-3">
                      <span className="text-zinc-500 font-sans font-medium flex items-center gap-1.5">
                        Surcharge ({assessment.newRegimeAssessment.calculationSheet.surchargeDetails.appliedRate}%):
                        {assessment.newRegimeAssessment.calculationSheet.surchargeDetails.marginalReliefSubtracted > 0 && (
                          <span className="text-[9px] bg-amber-500/10 border border-amber-500/20 text-amber-400 px-1.5 py-0.2 rounded">Marginal Relief Applied</span>
                        )}
                      </span>
                      <span className="font-bold">
                        {formatINR(assessment.newRegimeAssessment.calculationSheet.surchargeDetails.netSurcharge)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center border-t border-zinc-900/80 pt-3">
                      <span className="text-zinc-500 font-sans font-medium">Health & Education Cess (4%):</span>
                      <span className="font-bold">{formatINR(assessment.newRegimeAssessment.calculationSheet.cessDetails.cessAmount)}</span>
                    </div>
                    <div className="flex justify-between items-center border-t border-zinc-800 pt-3 text-sm font-bold text-white">
                      <span className="font-sans">Total Tax Liability:</span>
                      <span className="text-emerald-400">{formatINR(assessment.newRegimeAssessment.totalTaxLiability)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Old Regime Slab Breakdowns */}
                <div className="space-y-4">
                  <div className="border-l-2 border-orange-500 pl-3">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">Old Tax Regime Worksheet</h3>
                    <p className="text-[10px] text-zinc-500 mt-0.5">Slab & statutory surcharge math audit</p>
                  </div>

                  <div className="border border-zinc-800/80 rounded-xl overflow-hidden">
                    <table className="w-full text-xs text-zinc-400 border-collapse">
                      <thead>
                        <tr className="bg-zinc-950 border-b border-zinc-800 text-zinc-500 font-semibold uppercase tracking-wider text-[9px]">
                          <th className="p-3 text-left">Slab Bracket</th>
                          <th className="p-3 text-right">Tax Rate</th>
                          <th className="p-3 text-right">Income in Slab</th>
                          <th className="p-3 text-right">Computed Tax</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-900 font-mono text-[11px]">
                        {assessment.oldRegimeAssessment.calculationSheet.slabBreakdown.map((row: any, idx: number) => (
                          <tr key={idx} className="hover:bg-zinc-900/20">
                            <td className="p-3 text-left font-sans text-zinc-300">{row.slabRange}</td>
                            <td className="p-3 text-right text-zinc-300">{row.ratePercentage}%</td>
                            <td className="p-3 text-right text-zinc-300">{formatINR(row.taxableAmountInSlab)}</td>
                            <td className="p-3 text-right text-white font-bold">{formatINR(row.taxGenerated)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Surcharge & Cess Verification block */}
                  <div className="bg-zinc-950/50 border border-zinc-800/50 p-4 rounded-xl space-y-3 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-zinc-500 font-medium">Base Tax:</span>
                      <span className="font-mono text-zinc-300 font-bold">{formatINR(assessment.oldRegimeAssessment.calculationSheet.surchargeDetails.baseTaxAmount)}</span>
                    </div>
                    <div className="flex justify-between items-center border-t border-zinc-900/80 pt-2.5">
                      <span className="text-zinc-500 font-medium">Surcharge ({assessment.oldRegimeAssessment.calculationSheet.surchargeDetails.appliedRate}%):</span>
                      <span className="font-mono text-zinc-300 font-bold">
                        {formatINR(assessment.oldRegimeAssessment.calculationSheet.surchargeDetails.netSurcharge)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center border-t border-zinc-900/80 pt-2.5">
                      <span className="text-zinc-500 font-medium">Health & Education Cess (4%):</span>
                      <span className="font-mono text-zinc-300 font-bold">{formatINR(assessment.oldRegimeAssessment.calculationSheet.cessDetails.cessAmount)}</span>
                    </div>
                  </div>
                </div>

                {/* New Regime Slab Breakdowns */}
                <div className="space-y-4">
                  <div className="border-l-2 border-green-500 pl-3">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">New Tax Regime Worksheet (115BAC)</h3>
                    <p className="text-[10px] text-zinc-500 mt-0.5">Slab & statutory surcharge math audit</p>
                  </div>

                  <div className="border border-zinc-800/80 rounded-xl overflow-hidden">
                    <table className="w-full text-xs text-zinc-400 border-collapse">
                      <thead>
                        <tr className="bg-zinc-950 border-b border-zinc-800 text-zinc-500 font-semibold uppercase tracking-wider text-[9px]">
                          <th className="p-3 text-left">Slab Bracket</th>
                          <th className="p-3 text-right">Tax Rate</th>
                          <th className="p-3 text-right">Income in Slab</th>
                          <th className="p-3 text-right">Computed Tax</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-900 font-mono text-[11px]">
                        {assessment.newRegimeAssessment.calculationSheet.slabBreakdown.map((row: any, idx: number) => (
                          <tr key={idx} className="hover:bg-zinc-900/20">
                            <td className="p-3 text-left font-sans text-zinc-300">{row.slabRange}</td>
                            <td className="p-3 text-right text-zinc-300">{row.ratePercentage}%</td>
                            <td className="p-3 text-right text-zinc-300">{formatINR(row.taxableAmountInSlab)}</td>
                            <td className="p-3 text-right text-white font-bold">{formatINR(row.taxGenerated)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Surcharge & Cess Verification block */}
                  <div className="bg-zinc-950/50 border border-zinc-800/50 p-4 rounded-xl space-y-3 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-zinc-500 font-medium">Base Tax:</span>
                      <span className="font-mono text-zinc-300 font-bold">{formatINR(assessment.newRegimeAssessment.calculationSheet.surchargeDetails.baseTaxAmount)}</span>
                    </div>
                    <div className="flex justify-between items-center border-t border-zinc-900/80 pt-2.5">
                      <span className="text-zinc-500 font-medium">Surcharge ({assessment.newRegimeAssessment.calculationSheet.surchargeDetails.appliedRate}%):</span>
                      <span className="font-mono text-zinc-300 font-bold">
                        {formatINR(assessment.newRegimeAssessment.calculationSheet.surchargeDetails.netSurcharge)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center border-t border-zinc-900/80 pt-2.5">
                      <span className="text-zinc-500 font-medium">Health & Education Cess (4%):</span>
                      <span className="font-mono text-zinc-300 font-bold">{formatINR(assessment.newRegimeAssessment.calculationSheet.cessDetails.cessAmount)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Reconciliation Modal */}
      {aisImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <Card className="w-full max-w-4xl bg-[#141419] border-zinc-800 shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-indigo-500"></div>
            
            <CardHeader className="pb-4 border-b border-zinc-900 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-md font-bold uppercase tracking-wider text-white">AIS/26AS Ingestion & Reconciliation Screen</CardTitle>
                <p className="text-[10px] text-zinc-500 mt-1">Verify suggested income head mapping before committing to ledger records.</p>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setAisImportModalOpen(false)}
                className="text-zinc-400 hover:text-white rounded-xl h-8 w-8 hover:bg-zinc-900"
              >
                <X className="w-4 h-4" />
              </Button>
            </CardHeader>
            
            <CardContent className="pt-6 space-y-6">
              <ScrollArea className="h-[400px] rounded-lg border border-zinc-800/80 bg-zinc-950/20">
                <table className="w-full text-xs text-zinc-300 border-collapse">
                  <thead>
                    <tr className="text-zinc-500 border-b border-zinc-900 uppercase tracking-widest text-[9px] font-bold bg-zinc-950/40">
                      <th className="py-3 px-4 text-center w-12">
                        <input
                          type="checkbox"
                          className="accent-blue-600 rounded bg-zinc-950 border-zinc-800"
                          checked={selectedAisIds.length === aisImportData.length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedAisIds(aisImportData.map(i => i.id));
                            } else {
                              setSelectedAisIds([]);
                            }
                          }}
                        />
                      </th>
                      <th className="py-3 px-2 text-left font-semibold">Information Source / Section</th>
                      <th className="py-3 px-2 text-right font-semibold">Amount (INR)</th>
                      <th className="py-3 px-2 text-right font-semibold">TDS</th>
                      <th className="py-3 px-4 text-center w-56 font-semibold">Suggested Income Head</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-900 font-normal">
                    {aisImportData.map((row, idx) => {
                      const fp = `${(row.source || '').trim()}_${Number(row.amount)}_${(row.sectionCode || '').trim()}`;
                      const isDuplicate = importedFingerprints.includes(fp);
                      return (
                        <tr key={row.id} className="hover:bg-zinc-900/30 transition-colors">
                          <td className="py-2.5 px-4 text-center">
                            <input
                              type="checkbox"
                              className="accent-blue-600 rounded bg-zinc-950 border-zinc-800"
                              checked={selectedAisIds.includes(row.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedAisIds([...selectedAisIds, row.id]);
                                } else {
                                  setSelectedAisIds(selectedAisIds.filter(id => id !== row.id));
                                }
                              }}
                            />
                          </td>
                          <td className="py-2.5 px-2">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white text-[11px]">{row.source}</span>
                              {isDuplicate && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20 animate-pulse">
                                  ⚠️ Potential Duplicate (Already Imported)
                                </span>
                              )}
                            </div>
                            <div className="text-[9px] text-zinc-500 font-mono mt-0.5">{row.description}</div>
                          </td>
                        <td className="py-2.5 px-2 text-right font-mono text-[11px] font-bold text-zinc-300">
                          {formatINR(row.amount)}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono text-[11px] text-red-400">
                          {row.tds > 0 ? formatINR(row.tds) : '-'}
                        </td>
                        <td className="py-2.5 px-4">
                          <Select 
                            value={row.suggestedCategory} 
                            onValueChange={(val) => {
                              const updated = [...aisImportData];
                              updated[idx].suggestedCategory = val;
                              setAisImportData(updated);
                            }}
                          >
                            <SelectTrigger className="bg-zinc-950 border-zinc-800 h-8 text-[11px] focus:ring-1 focus:ring-blue-500">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-zinc-800 text-[11px]">
                              <SelectItem value="SALARY">Salary Income</SelectItem>
                              <SelectItem value="BUSINESS">Business (PGBP)</SelectItem>
                              <SelectItem value="CAPITAL_GAINS">Capital Gains</SelectItem>
                              <SelectItem value="CASUAL_INCOME">Casual Income</SelectItem>
                              <SelectItem value="OTHER_SOURCES">Other Sources</SelectItem>
                              <SelectItem value="COMPLIANCE">Compliance Disclosure (Info Only)</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </ScrollArea>
              
              <div className="flex justify-end gap-3 pt-2">
                <Button 
                  variant="outline" 
                  onClick={() => setAisImportModalOpen(false)}
                  className="border-zinc-800 hover:bg-zinc-900 text-zinc-400 rounded-xl"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleApproveAisImport}
                  className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20 rounded-xl px-6"
                >
                  Approve & Import ({selectedAisIds.length} Selected)
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Detailed Component Modals */}
      <SalaryDetailForm
        isOpen={isSalaryOpen}
        onClose={() => setIsSalaryOpen(false)}
        regime={profile.opted_for_new_regime ? RegimeType.NEW : RegimeType.OLD}
        employeeType="PRIVATE"
        onSave={handleSaveSalary}
        initialData={salaryRaw}
      />

      <HousePropertyDetailForm
        isOpen={isHpOpen}
        onClose={() => setIsHpOpen(false)}
        regime={profile.opted_for_new_regime ? RegimeType.NEW : RegimeType.OLD}
        entityType={profile.entity_type as EntityType}
        onSave={handleSaveHP}
        initialData={hpRaw}
      />

      <PgbpDetailForm
        isOpen={isPgbpOpen}
        onClose={() => setIsPgbpOpen(false)}
        regime={profile.opted_for_new_regime ? RegimeType.NEW : RegimeType.OLD}
        onSave={handleSavePgbp}
        initialPresumptive={pgbpPresumptiveRaw}
        initialRegular={pgbpRegularRaw}
      />

      <CapitalGainsDetailForm
        isOpen={isCgOpen}
        onClose={() => setIsCgOpen(false)}
        onSave={handleSaveCG}
        initialData={cgRaw}
      />

      <IfosClubbingDetailForm
        isOpen={isIfosOpen}
        onClose={() => setIsIfosOpen(false)}
        regime={profile.opted_for_new_regime ? RegimeType.NEW : RegimeType.OLD}
        onSave={handleSaveIfos}
        initialIfos={ifosRaw}
        initialClubbing={clubbingRaw}
      />
    </div>
  );
}
