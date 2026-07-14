import { useState, useEffect } from 'react';
import { 
  ArrowLeft, ArrowRight, Upload, Building2, Sparkles, 
  FileSpreadsheet, RotateCcw, Landmark, BarChart3, 
  FileDown, CheckCircle2, AlertTriangle, Info, FileText,
  Wifi, WifiOff, Loader2, Database, Server
} from 'lucide-react';
import { toast } from 'sonner';
import { pingTally, fetchCompanyInfo } from '@/lib/tallyApi';
import { generateTallyGroupRequest, generateTallyLedgerRequest, parseTallyCollectionsToTrialBalance } from '@/lib/tallyParser';

interface Props {
  onBack: () => void;
}

type WizardType = 'existing' | 'greenfield' | null;

// Tally Aggregator for CMA Ingestion Pipeline (rupees to rupees, we divide by 100,000 in handleTallySync)
export function aggregateTallyToCMAPayload(entries: any[]) {
  let shareCapital = 0;
  let reservesSurplus = 0;
  let longTermDebt = 0;
  let sundryCreditors = 0;
  let otherCL = 0;
  let fixedAssetsNet = 0;
  let inventory = 0;
  let debtors = 0;
  let cashAndBank = 0;
  let otherCA = 0;
  let baseSales = 0;
  let basePurchases = 0;

  entries.forEach(entry => {
    const code = entry.mapped_group_code || entry.suggested_group_code;
    const balance = entry.cy_balance; // Current Year closing ledger balance

    if (!code) return;

    // Aggregations based on Schedule III / Tally Mapping codes
    switch (code) {
      case 2001: // Share Capital
        shareCapital += balance;
        break;
      case 2011: // Reserves & Surplus
        reservesSurplus += balance;
        break;
      case 2021: // Long Term Borrowings
        longTermDebt += balance;
        break;
      case 2031: // Trade Payables / Creditors
        sundryCreditors += balance;
        break;
      case 2041: // Other Current Liabilities / Duties & Taxes
      case 2051: // Short-term provisions
      case 2061: // Other Current Liabilities
        otherCL += balance;
        break;
      case 1003: // Property, Plant & Equipment / Fixed Assets
        fixedAssetsNet += balance;
        break;
      case 1101: // Inventories / Stock-in-Hand
        inventory += balance;
        break;
      case 1111: // Trade Receivables / Debtors
      case 1112:
        debtors += balance;
        break;
      case 1121: // Cash-in-hand
      case 1122: // Bank Accounts
        cashAndBank += balance;
        break;
      case 1152: // Other Current Assets / Advances
      case 1051:
        otherCA += balance;
        break;
      case 3001: // Revenue / Sales
        baseSales += balance;
        break;
      case 4001: // Purchases
        basePurchases += balance;
        break;
    }
  });

  return {
    base_year_sales: Math.abs(baseSales),
    share_capital_init: Math.abs(shareCapital),
    reserves_surplus_init: Math.abs(reservesSurplus),
    cash_bank_init: Math.abs(cashAndBank),
    fixed_assets_init: {
      building: Math.abs(fixedAssetsNet) * 0.4, // Estimation fallback
      plant_machinery: Math.abs(fixedAssetsNet) * 0.5,
      computers: Math.abs(fixedAssetsNet) * 0.05,
      office_equipment: Math.abs(fixedAssetsNet) * 0.05
    },
    drawing_power_inputs: {
      stock_value: Math.abs(inventory),
      sundry_creditors: Math.abs(sundryCreditors),
      debtors_under_90_days: Math.abs(debtors) * 0.85,
      debtors_over_90_days: Math.abs(debtors) * 0.15,
    }
  };
}

export default function CmaReport({ onBack }: Props) {
  const [wizardType, setWizardType] = useState<WizardType>(null);
  
  // Greenfield steps: 1: Setup, 2: Cost, 3: Baseline, 4: Forecasting, 5: Report
  // Existing steps: 1: Upload, 2: Validate, 3: Provisional, 4: Forecasting, 5: Project Cost, 6: Report
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Ingestion tab channel selection
  const [ingestChannel, setIngestChannel] = useState<'ITR' | 'TALLY' | 'MANUAL'>('ITR');

  // Tally Sync Connection States
  const [tallyPort, setTallyPort] = useState(9000);
  const [tallyConnectionStatus, setTallyConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [tallyCompany, setTallyCompany] = useState('');
  const [isTallySyncing, setIsTallySyncing] = useState(false);

  // Form State
  const [companyName, setCompanyName] = useState('');
  const [pan, setPan] = useState('');
  const [constitution, setConstitution] = useState('Private Limited Company');
  const [natureOfBusiness, setNatureOfBusiness] = useState('');
  const [purposeOfLoan, setPurposeOfLoan] = useState('');
  const [firstProjectedYear, setFirstProjectedYear] = useState('2025-26');

  // Term Loan details
  const [termLoanAmount, setTermLoanAmount] = useState('15000000');
  const [interestRate, setInterestRate] = useState('10.5');
  const [repaymentMonths, setRepaymentMonths] = useState('60');
  const [moratoriumMonths, setMoratoriumMonths] = useState('6');
  const [ccLimit, setCcLimit] = useState('8000000');

  // Assumptions
  const [taxRate, setTaxRate] = useState('25.17');
  const [deprMethod, setDeprMethod] = useState<'WDV' | 'SLM'>('WDV');
  const [deprBuilding, setDeprBuilding] = useState('10.0');
  const [deprMachinery, setDeprMachinery] = useState('15.0');
  const [deprComputers, setDeprComputers] = useState('40.0');
  const [deprOffice, setDeprOffice] = useState('10.0');

  // Projections parameters over 5 years (Y1-Y5)
  const [capacityUtil, setCapacityUtil] = useState<string[]>(['60', '70', '80', '90', '95']);
  const [salesGrowth, setSalesGrowth] = useState<string[]>(['10', '15', '12', '10', '8']);
  const [rmCostPct, setRmCostPct] = useState<string[]>(['55', '54', '53.5', '53', '53']);
  const [otherExpPct, setOtherExpPct] = useState<string[]>(['12', '11.5', '11', '10.5', '10.5']);

  // Initial Inputs / Estimates
  const [baseSales, setBaseSales] = useState('45000000');
  const [shareCapitalInit, setShareCapitalInit] = useState('12000000');
  const [assetBuildingInit, setAssetBuildingInit] = useState('15000000');
  const [assetMachineryInit, setAssetMachineryInit] = useState('22000000');
  const [assetComputersInit, setAssetComputersInit] = useState('1500000');
  const [assetOfficeInit, setAssetOfficeInit] = useState('2500000');

  // Capex Plan (Asset Additions per year)
  // Each index corresponds to Year 1 to Year 5 capex additions
  const [capexPlan, setCapexPlan] = useState<any[]>([
    { building: 2500000, machinery: 5000000, computers: 250000, office: 400000 }, // Y1 (total gt + lt)
    { building: 0, machinery: 1500000, computers: 100000, office: 200000 },  // Y2
    { building: 0, machinery: 0, computers: 0, office: 0 },   // Y3
    { building: 0, machinery: 1000000, computers: 50000, office: 0 },  // Y4
    { building: 0, machinery: 0, computers: 0, office: 0 }    // Y5
  ]);

  // Drawing power margins
  const [stockMargin, setStockMargin] = useState('25');
  const [debtorsMargin, setDebtorsMargin] = useState('40');

  // Working capital inputs (in ₹)
  const [stockValue, setStockValue] = useState('10000000');
  const [sundryCreditors, setSundryCreditors] = useState('4000000');
  const [debtorsUnder90, setDebtorsUnder90] = useState('65000000');
  const [debtorsOver90, setDebtorsOver90] = useState('15000000');

  // File Upload State
  const [fy1File, setFy1File] = useState<File | null>(null);
  const [fy2File, setFy2File] = useState<File | null>(null);

  const resetForm = () => {
    setWizardType(null);
    setStep(1);
    setCompanyName('');
    setPan('');
    setNatureOfBusiness('');
    setPurposeOfLoan('');
    setFy1File(null);
    setFy2File(null);
    setStockValue('10000000');
    setSundryCreditors('4000000');
    setDebtorsUnder90('65000000');
    setDebtorsOver90('15000000');
    setTallyConnectionStatus('disconnected');
    setTallyCompany('');
    setIngestChannel('ITR');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, fy: 1 | 2) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      toast.error('Please upload a valid JSON file obtained from the Income Tax Portal.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        const root = json.ITR3 || json.ITR5 || json.ITR6 || 
                     (json.ITR && (json.ITR.ITR3 || json.ITR.ITR5 || json.ITR.ITR6)) || 
                     json;
        const bs = root.Schedule_PartA_BS || root.PartA_BS || root.PARTA_BS || {};
        const pl = root.Schedule_PartA_PL || root.PartA_PL || root.PARTA_PL || {};

        // Parse Assessee Name and PAN with robust fallbacks
        const general = root.PartA_GEN || root.General || root.PartA_GEN1 || root.PartA_GEN2 || {};
        let companyNameVal = '';
        
        if (general.PersonalInfo?.AssesseeName) {
          const aName = general.PersonalInfo.AssesseeName;
          if (typeof aName === 'object') {
            companyNameVal = [aName.FirstName, aName.MiddleName, aName.SurNameOrOrgName].filter(Boolean).join(' ');
          } else {
            companyNameVal = String(aName);
          }
        }
        
        if (!companyNameVal && general.AssesseeName) {
          const aName = general.AssesseeName;
          if (typeof aName === 'object') {
            companyNameVal = [aName.FirstName, aName.MiddleName, aName.SurNameOrOrgName].filter(Boolean).join(' ');
          } else {
            companyNameVal = String(aName);
          }
        }

        if (!companyNameVal) {
          companyNameVal = general.CompanyName || general.OrgName || general.SurNameOrOrgName || '';
        }

        if (!companyNameVal && root.Verification?.Declaration?.AssesseeVerName) {
          companyNameVal = root.Verification.Declaration.AssesseeVerName;
        }

        let panVal = general.PAN || general.Pan || general.PersonalInfo?.PAN || '';
        if (!panVal && root.Verification?.Declaration?.AssesseeVerPAN) {
          panVal = root.Verification.Declaration.AssesseeVerPAN;
        }

        if (companyNameVal) setCompanyName(companyNameVal);
        if (panVal) setPan(panVal);

        // Share/Proprietor/Partner Capital
        const shareCapital = Number(
          bs.PartA_BS_Prop_Part_ShareholdersFunds?.ShareCapital || 
          bs.ShareHoldersFunds?.ShareCapital || 
          bs.ShareCapital || 
          bs.FundSrc?.PropFund?.PropCap || 
          bs.FundSrc?.PartnerFund?.PartnerCap ||
          bs.PartnerCapital || 
          bs.PartnerCap || 
          bs.TotPartnerCap ||
          bs.FundSrc?.PropFund?.TotPropFund ||
          bs.FundSrc?.PartnerFund?.TotPartnerFund ||
          bs.TotPropFund ||
          bs.TotPartnerFund || 0
        );

        // Base Year Sales / Revenue
        const baseSalesVal = Number(
          pl.PartA_PL_RevenueFromOperations?.GrossRevenueFromOperations || 
          pl.RevenueFromOperations?.TotalRevenueFromOperations || 
          pl.GrossRevenueFromOperations || 
          root.TradingAccount?.SalesGrossReceiptsTotal ||
          root.TradingAccount?.TotRevenueFrmOperations ||
          root.TradingAccount?.SaleOfGoods || 
          pl.TradingAccount?.SalesGrossReceiptsTotal ||
          pl.TradingAccount?.TotRevenueFrmOperations ||
          pl.TradingAccount?.SaleOfGoods || 0
        );

        // Fixed Assets Net Block
        const fixedAssetsNetBlock = Number(
          bs.NonCurrentAssets?.FixedAssets?.NetFixedAssets || 
          bs.NonCurrentAssets?.FixedAssets?.NetBlock || 
          bs.NetFixedAssets || 
          bs.FundApply?.FixedAsset?.NetBlock || 
          bs.FundApply?.FixedAsset?.TotFixedAsset ||
          bs.FixedAssets?.NetBlock ||
          bs.FixedAssets?.TotFixedAsset || 0
        );

        // Inventories
        const inventories = Number(
          bs.CurrentAssets?.Inventories?.TotInventries ||
          bs.Inventories?.TotInventries ||
          bs.CurrentAssets?.Inventories || 
          bs.Inventories || 
          bs.FundApply?.CurrAssetLoanAdv?.CurrAsset?.Inventories?.TotInventries || 
          bs.CurrAsset?.Inventories?.TotInventries ||
          bs.CurrAsset?.Inventories || 0
        );

        // Debtors
        const debtors = Number(
          bs.CurrentAssets?.TradeReceivables || 
          bs.TradeReceivables || 
          bs.FundApply?.CurrAssetLoanAdv?.CurrAsset?.SndryDebtors || 
          bs.SndryDebtors ||
          bs.SundryDebtors ||
          bs.CurrAsset?.SndryDebtors ||
          bs.CurrAsset?.SundryDebtors || 0
        );

        // Sundry Creditors
        const sundryCreditorsVal = Number(
          bs.CurrentLiabilities?.TradePayables || 
          bs.TradePayables || 
          bs.FundApply?.CurrAssetLoanAdv?.CurrLiabilitiesProv?.CurrLiabilities?.SundryCred ||
          bs.FundApply?.CurrAssetLoanAdv?.CurrLiabilitiesProv?.CurrLiabilities?.TotCurrLiabilities || 
          bs.SundryCred ||
          bs.SundryCreditors ||
          bs.CurrLiabilities?.SundryCred ||
          bs.CurrLiabilities?.SundryCreditors || 0
        );

        // Auto-fill values in form state
        if (shareCapital) setShareCapitalInit(shareCapital.toFixed(2));
        if (baseSalesVal) setBaseSales(baseSalesVal.toFixed(2));
        
        if (fixedAssetsNetBlock) {
          setAssetBuildingInit((fixedAssetsNetBlock * 0.4).toFixed(2));
          setAssetMachineryInit((fixedAssetsNetBlock * 0.5).toFixed(2));
          setAssetComputersInit((fixedAssetsNetBlock * 0.05).toFixed(2));
          setAssetOfficeInit((fixedAssetsNetBlock * 0.05).toFixed(2));
        }
        if (inventories) setStockValue(inventories.toFixed(2));
        if (sundryCreditorsVal) setSundryCreditors(sundryCreditorsVal.toFixed(2));
        if (debtors) {
          setDebtorsUnder90((debtors * 0.85).toFixed(2));
          setDebtorsOver90((debtors * 0.15).toFixed(2));
        }

        if (fy === 1) {
          setFy1File(file);
          toast.success('FY1 ITR JSON parsed and values imported successfully!');
        } else {
          setFy2File(file);
          toast.success('FY2 ITR JSON parsed and values imported successfully!');
        }
      } catch (err) {
        toast.error('Failed to parse ITR JSON file. Invalid format.');
      }
    };
    reader.readAsText(file);
  };

  const handleTallySync = async () => {
    setIsTallySyncing(true);
    setTallyConnectionStatus('connecting');
    const toastId = toast.loading(`Connecting to Tally on port ${tallyPort}...`);
    try {
      const alive = await pingTally({ host: 'localhost', port: tallyPort });
      if (!alive) {
        setTallyConnectionStatus('error');
        toast.error('Cannot reach Tally. Ensure TallyPrime is running and acts as Server (configured on port ' + tallyPort + ').', { id: toastId });
        setIsTallySyncing(false);
        return;
      }

      const info = await fetchCompanyInfo({ host: 'localhost', port: tallyPort });
      setTallyCompany(info.name);
      setCompanyName(info.name);
      setTallyConnectionStatus('connected');

      const groupPayload = generateTallyGroupRequest();
      const ledgerPayload = generateTallyLedgerRequest();
      
      let groupXmlResponse = '';
      let ledgerXmlResponse = '';

      if ((window as any).electronAPI?.fetchTallyData) {
        groupXmlResponse = await (window as any).electronAPI.fetchTallyData(tallyPort, groupPayload);
        ledgerXmlResponse = await (window as any).electronAPI.fetchTallyData(tallyPort, ledgerPayload);
      } else {
        const fetchTally = async (payload: string) => {
          const res = await fetch('/tally-api', {
            method: 'POST',
            headers: { 'Content-Type': 'text/xml;charset=utf-8' },
            body: payload
          });
          if (!res.ok) throw new Error(`Browser fetch failed: ${res.status} ${res.statusText}`);
          return res.text();
        };
        groupXmlResponse = await fetchTally(groupPayload);
        ledgerXmlResponse = await fetchTally(ledgerPayload);
      }

      if (!groupXmlResponse || !ledgerXmlResponse) {
        throw new Error('Received empty response from Tally.');
      }

      const entries = parseTallyCollectionsToTrialBalance(groupXmlResponse, ledgerXmlResponse);
      
      if (entries.length === 0) {
        throw new Error('Could not parse any ledgers from Tally response.');
      }

      const cmaData = aggregateTallyToCMAPayload(entries);

      // Populate form states
      setBaseSales(cmaData.base_year_sales.toFixed(2));
      setShareCapitalInit(cmaData.share_capital_init.toFixed(2));
      setAssetBuildingInit(cmaData.fixed_assets_init.building.toFixed(2));
      setAssetMachineryInit(cmaData.fixed_assets_init.plant_machinery.toFixed(2));
      setAssetComputersInit(cmaData.fixed_assets_init.computers.toFixed(2));
      setAssetOfficeInit(cmaData.fixed_assets_init.office_equipment.toFixed(2));
      
      setStockValue(cmaData.drawing_power_inputs.stock_value.toFixed(2));
      setSundryCreditors(cmaData.drawing_power_inputs.sundry_creditors.toFixed(2));
      setDebtorsUnder90(cmaData.drawing_power_inputs.debtors_under_90_days.toFixed(2));
      setDebtorsOver90(cmaData.drawing_power_inputs.debtors_over_90_days.toFixed(2));

      toast.success(`Successfully imported values from Tally company: ${info.name}`, { id: toastId });
      setStep(2);
    } catch (err: any) {
      setTallyConnectionStatus('error');
      toast.error(`Tally Sync Failed: ${err.message || 'Ensure Tally is active'}`, { id: toastId });
    } finally {
      setIsTallySyncing(false);
    }
  };

  const executeGeneration = async () => {
    if (!companyName.trim()) {
      toast.error('Entity/Company Name is required.');
      return;
    }
    
    setLoading(true);
    const toastId = toast.loading('Compiling formulas and generating styled report...');
    
    try {
      // Assemble request payload matching cma_schema.json
      const payload = {
        client_metadata: {
          company_name: companyName,
          cin_number: "U29100MH2024PTC412345",
          registered_address: "Plot No. 45, MIDC Industrial Area, Andheri East, Mumbai - 400093",
          audit_firm_name: "Vaswani & Associates, Chartered Accountants",
          firm_reg_no: "123456W",
          partner_name: "CA Anish Vaswani",
          membership_no: "089456",
          udin: "26089456AAAAAB1234",
          director_1_name: "Siddharth Malhotra",
          director_2_name: "Neha Sharma"
        },
        assumptions: {
          projection_years: [2026, 2027, 2028, 2029, 2030],
          capacity_utilization_pct: capacityUtil.map(v => parseFloat(v) || 0.0),
          sales_growth_pct: salesGrowth.map(v => parseFloat(v) || 0.0),
          rm_cost_pct: rmCostPct.map(v => parseFloat(v) || 0.0),
          other_expenses_pct: otherExpPct.map(v => parseFloat(v) || 0.0),
          tax_rate_pct: parseFloat(taxRate) || 25.17,
          depreciation_method: deprMethod,
          depreciation_rates: {
            building: parseFloat(deprBuilding) || 10.0,
            plant_machinery: parseFloat(deprMachinery) || 15.0,
            computers: parseFloat(deprComputers) || 40.0,
            office_equipment: parseFloat(deprOffice) || 10.0
          }
        },
        financial_inputs: {
          base_year_sales: parseFloat(baseSales) || 450.0,
          share_capital_init: parseFloat(shareCapitalInit) || 120.0,
          fixed_assets_init: {
            building: parseFloat(assetBuildingInit) || 150.0,
            plant_machinery: parseFloat(assetMachineryInit) || 220.0,
            computers: parseFloat(assetComputersInit) || 15.0,
            office_equipment: parseFloat(assetOfficeInit) || 25.0
          },
          capex_plan: capexPlan.map((val, idx) => ({
            year: idx + 1,
            building: { gt_180_days: val.building * 0.8, lt_180_days: val.building * 0.2 },
            plant_machinery: { gt_180_days: val.machinery * 0.8, lt_180_days: val.machinery * 0.2 },
            computers: { gt_180_days: val.computers * 0.8, lt_180_days: val.computers * 0.2 },
            office_equipment: { gt_180_days: val.office * 0.8, lt_180_days: val.office * 0.2 }
          }))
        },
        loan_details: {
          term_loan_amount: parseFloat(termLoanAmount) || 150.0,
          interest_rate_pct: parseFloat(interestRate) || 10.5,
          repayment_months: parseInt(repaymentMonths) || 60,
          moratorium_months: parseInt(moratoriumMonths) || 6,
          cc_limit: parseFloat(ccLimit) || 80.0
        },
        drawing_power_inputs: {
          stock_value: parseFloat(stockValue) || (parseFloat(assetBuildingInit) * 0.7),
          sundry_creditors: parseFloat(sundryCreditors) || (parseFloat(assetBuildingInit) * 0.2),
          debtors_under_90_days: parseFloat(debtorsUnder90) || (parseFloat(baseSales) * 0.15),
          debtors_over_90_days: parseFloat(debtorsOver90) || (parseFloat(baseSales) * 0.03),
          stock_margin_pct: parseFloat(stockMargin) || 25.0,
          debtors_margin_pct: parseFloat(debtorsMargin) || 40.0
        }
      };

      const token = sessionStorage.getItem('np_token');
      const apiHost = localStorage.getItem('np_app_mode') === 'server' ? 'localhost' : (localStorage.getItem('np_server_ip') || window.location.hostname || '127.0.0.1');

      const response = await fetch(`http://${apiHost}:3001/api/cma/generate`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        let errorMessage = 'Server returned an error compiling the Excel sheets.';
        try {
          const errData = await response.json();
          if (errData && errData.error) {
            errorMessage = errData.error;
          }
        } catch (e) {
          // Fallback if response is not JSON
        }
        throw new Error(errorMessage);
      }

      // Convert response stream to file download blob
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${companyName.replace(/\s+/g, '_')}_CMA_Report.xlsx`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success('Spreadsheet generated successfully!', { id: toastId });
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Failed to generate report', { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full silk-reveal">
      {/* Navigation Header */}
      <button
        onClick={onBack}
        className="text-slate-400 hover:text-white flex items-center gap-2 font-bold uppercase tracking-wider text-[10px] mb-4 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Hub
      </button>

      {/* Title block */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <FileSpreadsheet className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
              CMA Data &amp; Project Report
              <span className="text-[9px] px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 font-bold tracking-widest uppercase">
                Automated
              </span>
            </h1>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">
              Tandon Committee &amp; Bank Amortization Engine
            </p>
          </div>
        </div>
        
        {wizardType && (
          <button
            onClick={resetForm}
            className="px-3 py-1.5 rounded-lg bg-slate-800/40 border border-slate-700/50 hover:bg-slate-800 text-slate-400 hover:text-white text-[9px] font-bold uppercase tracking-wider transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5 inline mr-1" /> Change Project Type
          </button>
        )}
      </div>

      {/* 1. SELECTION LAUNCHER */}
      {!wizardType && (
        <div className="max-w-4xl mx-auto py-12 space-y-8 animate-in fade-in duration-500">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-black text-white tracking-tight">Select Report Profile</h2>
            <p className="text-xs text-slate-500 max-w-md mx-auto">Choose whether to upload historical statements for an existing business or compile a new Greenfield project.</p>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <div 
              onClick={() => { setWizardType('existing'); setStep(1); }}
              className="glass-card-np neon-blue p-8 rounded-2xl cursor-pointer group flex flex-col justify-between min-h-[240px]"
            >
              <div className="flex justify-between items-start">
                <div className="w-12 h-12 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 duration-300">
                  <FileText className="w-6 h-6" />
                </div>
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest bg-slate-900/40 px-2 py-0.5 rounded border border-white/5">Existing Business</span>
              </div>
              <div className="mt-8">
                <h3 className="text-lg font-bold text-white group-hover:text-cyan-400 transition-colors">Existing / Revised Projects</h3>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">Requires historical Statement uploads (ITR-5/6 JSON or Tally Ledgers) to compile comparative base years, forecast provisional periods, and run bank appraisals.</p>
              </div>
            </div>

            <div 
              onClick={() => { setWizardType('greenfield'); setStep(1); }}
              className="glass-card-np neon-emerald p-8 rounded-2xl cursor-pointer group flex flex-col justify-between min-h-[240px]"
            >
              <div className="flex justify-between items-start">
                <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 duration-300">
                  <Building2 className="w-6 h-6" />
                </div>
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest bg-slate-900/40 px-2 py-0.5 rounded border border-white/5">Greenfield</span>
              </div>
              <div className="mt-8">
                <h3 className="text-lg font-bold text-white group-hover:text-emerald-400 transition-colors">New Greenfield Projects</h3>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">No historical data required. Designed for fresh business setups, project cost estimates, term loan repayment sizing, and 5-year projections.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. EXISTING BUSINESS (BROWNFIELD) WIZARD FLOW */}
      {wizardType === 'existing' && (
        <div className="space-y-6">
          {/* Stepper bar */}
          <div className="flex justify-between items-center bg-slate-900/30 border border-slate-800/80 rounded-2xl p-4 max-w-4xl mx-auto">
            {['Upload ITR', 'Validate', 'Provisional', 'Forecasting', 'Project Cost', 'Report'].map((label, i) => {
              const active = step === i + 1;
              const completed = step > i + 1;
              return (
                <div key={label} className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${
                    active ? 'bg-cyan-500 text-slate-950 font-bold' : completed ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-500 border border-slate-700/60'
                  }`}>
                    {i + 1}
                  </div>
                  <span className={`text-[9px] font-bold uppercase tracking-wider hidden md:inline ${active ? 'text-white' : 'text-slate-500'}`}>{label}</span>
                  {i < 5 && <div className="w-8 h-px bg-slate-800 hidden md:block" />}
                </div>
              );
            })}
          </div>

          {/* STEP 1: INGESTION SOURCE SELECTOR & FORMS */}
          {step === 1 && (
            <div className="max-w-4xl mx-auto bg-slate-900/30 border border-slate-800/60 rounded-2xl p-6 space-y-6 animate-in fade-in duration-300">
              {/* Tabs header */}
              <div className="flex border-b border-slate-800 pb-2 gap-4">
                <button
                  onClick={() => setIngestChannel('ITR')}
                  className={`pb-2 text-xs font-bold uppercase tracking-wider transition-colors ${
                    ingestChannel === 'ITR' ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  ITR JSON Upload
                </button>
                <button
                  onClick={() => setIngestChannel('TALLY')}
                  className={`pb-2 text-xs font-bold uppercase tracking-wider transition-colors ${
                    ingestChannel === 'TALLY' ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  Tally Prime Sync
                </button>
                <button
                  onClick={() => setIngestChannel('MANUAL')}
                  className={`pb-2 text-xs font-bold uppercase tracking-wider transition-colors ${
                    ingestChannel === 'MANUAL' ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  Manual Entry
                </button>
              </div>

              {/* Tab Content 1: ITR JSON */}
              {ingestChannel === 'ITR' && (
                <div className="space-y-6 animate-in fade-in duration-200">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <FileText className="w-4 h-4 text-cyan-400" /> Upload ITR JSON Files
                    </h3>
                    <p className="text-xs text-slate-400">Upload ITR-3, ITR-5, or ITR-6 JSON files from the Income Tax Portal for the last 2 financial years. All figures will be parsed and loaded in actual Rupees (₹).</p>
                  </div>
                  <div className="grid md:grid-cols-2 gap-6">
                    {/* FY1 upload */}
                    <div className="border-2 border-dashed border-slate-800 hover:border-cyan-500/40 rounded-2xl p-8 text-center cursor-pointer transition-colors relative">
                      <input 
                        type="file" 
                        accept=".json" 
                        onChange={(e) => handleFileUpload(e, 1)} 
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-12 h-12 bg-slate-800 text-slate-400 rounded-xl flex items-center justify-center">
                          <Upload className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-300">Financial Year 1 (Earlier Year)</p>
                          <p className="text-[10px] text-slate-500 mt-1">Drop ITR JSON file here, or click to browse</p>
                        </div>
                        {fy1File && (
                          <span className="text-[9px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20 font-bold uppercase tracking-widest mt-1">Uploaded: {fy1File.name}</span>
                        )}
                      </div>
                    </div>

                    {/* FY2 upload */}
                    <div className="border-2 border-dashed border-slate-800 hover:border-cyan-500/40 rounded-2xl p-8 text-center cursor-pointer transition-colors relative">
                      <input 
                        type="file" 
                        accept=".json" 
                        onChange={(e) => handleFileUpload(e, 2)} 
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-12 h-12 bg-slate-800 text-slate-400 rounded-xl flex items-center justify-center">
                          <Upload className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-300">Financial Year 2 (Later Year)</p>
                          <p className="text-[10px] text-slate-500 mt-1">Drop ITR JSON file here, or click to browse</p>
                        </div>
                        {fy2File && (
                          <span className="text-[9px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20 font-bold uppercase tracking-widest mt-1">Uploaded: {fy2File.name}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-800 flex justify-end">
                    <button
                      onClick={() => setStep(2)}
                      className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-2 hover:scale-[1.02] transition-transform"
                    >
                      Proceed to Validate <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Tab Content 2: Tally Prime Sync */}
              {ingestChannel === 'TALLY' && (
                <div className="space-y-6 animate-in fade-in duration-200">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center">
                      <Server className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">Direct Sync from TallyPrime</h3>
                      <p className="text-[10px] text-slate-500">Ensure TallyPrime is running locally with the active client company open.</p>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6 items-end bg-slate-950/40 p-6 rounded-xl border border-slate-800/80">
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Tally XML Port</label>
                      <input
                        type="number"
                        value={tallyPort}
                        onChange={(e) => setTallyPort(Number(e.target.value) || 9000)}
                        className="w-full h-10 bg-slate-900 border border-slate-700/60 rounded-lg px-3 text-xs text-white outline-none focus:border-cyan-500/50"
                      />
                    </div>
                    
                    <div className="flex items-center gap-3 justify-end h-10">
                      {tallyConnectionStatus === 'connected' ? (
                        <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg">
                          <Wifi className="w-3.5 h-3.5" /> Connected: {tallyCompany}
                        </span>
                      ) : tallyConnectionStatus === 'connecting' ? (
                        <span className="flex items-center gap-1.5 text-xs text-amber-400 font-bold bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-lg">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Connecting...
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-xs text-slate-500 font-bold bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg">
                          <WifiOff className="w-3.5 h-3.5" /> Disconnected
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
                    <button
                      onClick={handleTallySync}
                      disabled={isTallySyncing}
                      className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-2 active:scale-95 transition-transform disabled:opacity-50"
                    >
                      {isTallySyncing ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Syncing Trial Balance...
                        </>
                      ) : (
                        <>
                          <Database className="w-3.5 h-3.5" /> Sync Trial Balance from Tally
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Tab Content 3: Manual Entry */}
              {ingestChannel === 'MANUAL' && (
                <div className="space-y-6 animate-in fade-in duration-200 text-center py-6">
                  <div className="w-16 h-16 bg-slate-800 text-slate-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Building2 className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-md font-bold text-white">Configure Statement Manually</h3>
                    <p className="text-xs text-slate-400 mt-2 max-w-md mx-auto">No statements file or Tally link required. Skip automatic ingestion and fill in all base year estimates manually inside the setup forms.</p>
                  </div>

                  <div className="pt-6 border-t border-slate-800 flex justify-end">
                    <button
                      onClick={() => setStep(2)}
                      className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-2 hover:scale-[1.02] transition-transform"
                    >
                      Proceed to Forms <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: VALIDATE EXTRACTED HISTORICALS */}
          {step === 2 && (
            <div className="max-w-4xl mx-auto bg-slate-900/30 border border-slate-800/60 rounded-2xl p-6 space-y-6 animate-in fade-in duration-300">
              <div>
                <h2 className="text-md font-bold text-white">Step 2: Validate Extracted Historical Data</h2>
                <p className="text-xs text-slate-400">Review the baseline figures pulled from the files. Edit any fields if necessary to match audited statements.</p>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Client Metadata</h3>
                  <div>
                    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Entity/Company Name</label>
                    <input 
                      type="text" 
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="e.g. Astra Tech Manufacturing Pvt Ltd"
                      className="w-full h-9 bg-slate-950/60 border border-slate-800 rounded-lg px-3 text-xs text-white outline-none focus:border-cyan-500/50"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Income Tax PAN</label>
                    <input 
                      type="text" 
                      value={pan}
                      onChange={(e) => setPan(e.target.value)}
                      placeholder="e.g. AABCA1234Z"
                      className="w-full h-9 bg-slate-950/60 border border-slate-800 rounded-lg px-3 text-xs text-white outline-none focus:border-cyan-500/50"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Base Year Balance Sheet (₹)</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Share Capital</label>
                      <input 
                        type="text" 
                        value={shareCapitalInit}
                        onChange={(e) => setShareCapitalInit(e.target.value)}
                        className="w-full h-9 bg-slate-950/60 border border-slate-800 rounded-lg px-3 text-xs text-white outline-none focus:border-cyan-500/50"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Revenue (Y0)</label>
                      <input 
                        type="text" 
                        value={baseSales}
                        onChange={(e) => setBaseSales(e.target.value)}
                        className="w-full h-9 bg-slate-950/60 border border-slate-800 rounded-lg px-3 text-xs text-white outline-none focus:border-cyan-500/50"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-between items-center">
                <button
                  onClick={() => setStep(1)}
                  className="px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-400 hover:text-white text-[10px] font-bold uppercase tracking-wider"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-2"
                >
                  Next Step <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: PROVISIONAL DATA */}
          {step === 3 && (
            <div className="max-w-4xl mx-auto bg-slate-900/30 border border-slate-800/60 rounded-2xl p-6 space-y-6 animate-in fade-in duration-300">
              <div>
                <h2 className="text-md font-bold text-white">Step 3: Enter Provisional / Current Year Balances</h2>
                <p className="text-xs text-slate-400">Provide estimates for the closing fiscal year. These will bridge the gap between historical files and future capex projections.</p>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Asset Blocks (Closing)</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Plant &amp; Machinery</label>
                      <input 
                        type="text" 
                        value={assetMachineryInit}
                        onChange={(e) => setAssetMachineryInit(e.target.value)}
                        className="w-full h-9 bg-slate-950/60 border border-slate-800 rounded-lg px-3 text-xs text-white outline-none focus:border-cyan-500/50"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Building WDV</label>
                      <input 
                        type="text" 
                        value={assetBuildingInit}
                        onChange={(e) => setAssetBuildingInit(e.target.value)}
                        className="w-full h-9 bg-slate-950/60 border border-slate-800 rounded-lg px-3 text-xs text-white outline-none focus:border-cyan-500/50"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Bank Credit Limits</h3>
                  <div>
                    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Sanctioned Cash Credit (CC) Limit</label>
                    <input 
                      type="text" 
                      value={ccLimit}
                      onChange={(e) => setCcLimit(e.target.value)}
                      className="w-full h-9 bg-slate-950/60 border border-slate-800 rounded-lg px-3 text-xs text-white outline-none focus:border-cyan-500/50"
                    />
                  </div>
                </div>

                {/* Working Capital Balances */}
                <div className="space-y-4 md:col-span-2 border-t border-slate-800/85 pt-6 mt-4 animate-in fade-in duration-200">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Working Capital Balances (₹)</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Stock Value</label>
                      <input 
                        type="text" 
                        value={stockValue}
                        onChange={(e) => setStockValue(e.target.value)}
                        className="w-full h-9 bg-slate-950/60 border border-slate-800 rounded-lg px-3 text-xs text-white outline-none focus:border-cyan-500/50"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Sundry Creditors</label>
                      <input 
                        type="text" 
                        value={sundryCreditors}
                        onChange={(e) => setSundryCreditors(e.target.value)}
                        className="w-full h-9 bg-slate-950/60 border border-slate-800 rounded-lg px-3 text-xs text-white outline-none focus:border-cyan-500/50"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Debtors &lt; 90 Days</label>
                      <input 
                        type="text" 
                        value={debtorsUnder90}
                        onChange={(e) => setDebtorsUnder90(e.target.value)}
                        className="w-full h-9 bg-slate-950/60 border border-slate-800 rounded-lg px-3 text-xs text-white outline-none focus:border-cyan-500/50"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Debtors &gt; 90 Days</label>
                      <input 
                        type="text" 
                        value={debtorsOver90}
                        onChange={(e) => setDebtorsOver90(e.target.value)}
                        className="w-full h-9 bg-slate-950/60 border border-slate-800 rounded-lg px-3 text-xs text-white outline-none focus:border-cyan-500/50"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-between items-center">
                <button
                  onClick={() => setStep(2)}
                  className="px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-400 hover:text-white text-[10px] font-bold uppercase tracking-wider"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(4)}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-2"
                >
                  Next Step <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: FORECASTING ASSUMPTIONS */}
          {step === 4 && (
            <div className="max-w-4xl mx-auto bg-slate-900/30 border border-slate-800/60 rounded-2xl p-6 space-y-6 animate-in fade-in duration-300">
              <div>
                <h2 className="text-md font-bold text-white">Step 4: Projections &amp; Operating Ratios</h2>
                <p className="text-xs text-slate-400">Outline projection parameters over the 5-year forecast horizon. All calculations reference these coordinates directly.</p>
              </div>

              {/* Projections Inputs */}
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Growth Rates (Y1 - Y5)</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Sales Growth Rate % (YoY)</label>
                      <div className="grid grid-cols-5 gap-2">
                        {salesGrowth.map((val, idx) => (
                          <input
                            key={idx}
                            type="text"
                            value={val}
                            onChange={(e) => {
                              const newVals = [...salesGrowth];
                              newVals[idx] = e.target.value;
                              setSalesGrowth(newVals);
                            }}
                            className="w-full h-8 bg-slate-950/60 border border-slate-800 rounded px-2 text-center text-xs text-white"
                          />
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Capacity Utilization %</label>
                      <div className="grid grid-cols-5 gap-2">
                        {capacityUtil.map((val, idx) => (
                          <input
                            key={idx}
                            type="text"
                            value={val}
                            onChange={(e) => {
                              const newVals = [...capacityUtil];
                              newVals[idx] = e.target.value;
                              setCapacityUtil(newVals);
                            }}
                            className="w-full h-8 bg-slate-950/60 border border-slate-800 rounded px-2 text-center text-xs text-white"
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Margins &amp; Tax</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">RM Cost % of Sales</label>
                      <input 
                        type="text" 
                        value={rmCostPct[0]}
                        onChange={(e) => {
                          const newCost = [...rmCostPct];
                          newCost[0] = e.target.value;
                          setRmCostPct(newCost);
                        }}
                        className="w-full h-9 bg-slate-950/60 border border-slate-800 rounded-lg px-3 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Effective Tax Rate %</label>
                      <input 
                        type="text" 
                        value={taxRate}
                        onChange={(e) => setTaxRate(e.target.value)}
                        className="w-full h-9 bg-slate-950/60 border border-slate-800 rounded-lg px-3 text-xs text-white"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-between items-center">
                <button
                  onClick={() => setStep(3)}
                  className="px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-400 hover:text-white text-[10px] font-bold uppercase tracking-wider"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(5)}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-2"
                >
                  Next Step <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 5: PROJECT COST & CAPEX */}
          {step === 5 && (
            <div className="max-w-4xl mx-auto bg-slate-900/30 border border-slate-800/60 rounded-2xl p-6 space-y-6 animate-in fade-in duration-300">
              <div>
                <h2 className="text-md font-bold text-white">Step 5: Project Cost &amp; Term Loan Structure</h2>
                <p className="text-xs text-slate-400">Map capex and loan repayment terms. Principal payments and interest accruals are calculated monthly in the amortization block.</p>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Term Loan Appraisals</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Loan Amount (₹)</label>
                      <input 
                        type="text" 
                        value={termLoanAmount}
                        onChange={(e) => setTermLoanAmount(e.target.value)}
                        className="w-full h-9 bg-slate-950/60 border border-slate-800 rounded-lg px-3 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Interest Rate % (p.a.)</label>
                      <input 
                        type="text" 
                        value={interestRate}
                        onChange={(e) => setInterestRate(e.target.value)}
                        className="w-full h-9 bg-slate-950/60 border border-slate-800 rounded-lg px-3 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Repayment Term (Months)</label>
                      <input 
                        type="text" 
                        value={repaymentMonths}
                        onChange={(e) => setRepaymentMonths(e.target.value)}
                        className="w-full h-9 bg-slate-950/60 border border-slate-800 rounded-lg px-3 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Moratorium (Months)</label>
                      <input 
                        type="text" 
                        value={moratoriumMonths}
                        onChange={(e) => setMoratoriumMonths(e.target.value)}
                        className="w-full h-9 bg-slate-950/60 border border-slate-800 rounded-lg px-3 text-xs text-white"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Year 1 Capex Additions (₹)</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Plant &amp; Machinery capex</label>
                      <input 
                        type="text" 
                        value={capexPlan[0].machinery}
                        onChange={(e) => {
                          const newPlan = [...capexPlan];
                          newPlan[0].machinery = parseFloat(e.target.value) || 0;
                          setCapexPlan(newPlan);
                        }}
                        className="w-full h-9 bg-slate-950/60 border border-slate-800 rounded-lg px-3 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Building capex</label>
                      <input 
                        type="text" 
                        value={capexPlan[0].building}
                        onChange={(e) => {
                          const newPlan = [...capexPlan];
                          newPlan[0].building = parseFloat(e.target.value) || 0;
                          setCapexPlan(newPlan);
                        }}
                        className="w-full h-9 bg-slate-950/60 border border-slate-800 rounded-lg px-3 text-xs text-white"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-between items-center">
                <button
                  onClick={() => setStep(4)}
                  className="px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-400 hover:text-white text-[10px] font-bold uppercase tracking-wider"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(6)}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-2"
                >
                  Next Step <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 6: COMPILE AND DOWNLOAD REPORT */}
          {step === 6 && (
            <div className="max-w-xl mx-auto bg-slate-900/30 border border-slate-800/60 rounded-2xl p-8 space-y-6 text-center animate-in fade-in duration-300">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div className="space-y-2">
                <h2 className="text-lg font-bold text-white">Project Setup &amp; Modeling Complete!</h2>
                <p className="text-xs text-slate-400">All data has been verified. The Excel compiler is ready to generate the dynamic workbook containing detailed charts, ratios, repayment, and depreciation schedules.</p>
              </div>

              <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-4 text-left space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Entity Name:</span>
                  <span className="text-slate-300 font-bold">{companyName}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Term Loan:</span>
                  <span className="text-slate-300 font-bold">₹ {Number(termLoanAmount).toLocaleString('en-IN')} ({interestRate}% interest)</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">CC Limit:</span>
                  <span className="text-slate-300 font-bold">₹ {Number(ccLimit).toLocaleString('en-IN')}</span>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-between items-center">
                <button
                  onClick={() => setStep(5)}
                  className="px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-400 hover:text-white text-[10px] font-bold uppercase tracking-wider"
                >
                  Back
                </button>
                <button
                  onClick={executeGeneration}
                  disabled={loading}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-650 text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-95 disabled:opacity-50"
                >
                  <FileDown className="w-4 h-4" />
                  {loading ? 'Compiling Excel...' : 'Download Excel Report'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. GREENFIELD PROJECT WIZARD FLOW */}
      {wizardType === 'greenfield' && (
        <div className="space-y-6">
          {/* Stepper bar */}
          <div className="flex justify-between items-center bg-slate-900/30 border border-slate-800/80 rounded-2xl p-4 max-w-4xl mx-auto">
            {['Project Setup', 'Project Cost', 'Base Year Estimates', 'Forecasting', 'Report'].map((label, i) => {
              const active = step === i + 1;
              const completed = step > i + 1;
              return (
                <div key={label} className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${
                    active ? 'bg-cyan-500 text-slate-950 font-bold' : completed ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-500 border border-slate-700/60'
                  }`}>
                    {i + 1}
                  </div>
                  <span className={`text-[9px] font-bold uppercase tracking-wider hidden md:inline ${active ? 'text-white' : 'text-slate-500'}`}>{label}</span>
                  {i < 4 && <div className="w-8 h-px bg-slate-800 hidden md:block" />}
                </div>
              );
            })}
          </div>

          {/* GREENFIELD STEP 1: PROJECT SETUP */}
          {step === 1 && (
            <div className="max-w-4xl mx-auto bg-slate-900/30 border border-slate-800/60 rounded-2xl p-6 space-y-6 animate-in fade-in duration-300">
              <div>
                <h2 className="text-md font-bold text-white">Step 1: Project Setup — Greenfield Project</h2>
                <p className="text-xs text-slate-400">Enter the basic details of your new project. Since this is a greenfield project, no historical financial data is required.</p>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Entity / Company Name</label>
                  <input 
                    type="text" 
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="e.g., ABC Private Limited"
                    className="w-full h-10 bg-slate-950/60 border border-slate-800 rounded-lg px-3 text-xs text-white outline-none focus:border-cyan-500/50"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">PAN</label>
                  <input 
                    type="text" 
                    value={pan}
                    onChange={(e) => setPan(e.target.value)}
                    placeholder="e.g., AABCA1234Z"
                    className="w-full h-10 bg-slate-950/60 border border-slate-800 rounded-lg px-3 text-xs text-white outline-none focus:border-cyan-500/50"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Constitution / Type</label>
                  <input 
                    type="text" 
                    value={constitution}
                    onChange={(e) => setConstitution(e.target.value)}
                    placeholder="e.g., Private Limited Company"
                    className="w-full h-10 bg-slate-950/60 border border-slate-800 rounded-lg px-3 text-xs text-white outline-none focus:border-cyan-500/50"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Nature of Business</label>
                  <input 
                    type="text" 
                    value={natureOfBusiness}
                    onChange={(e) => setNatureOfBusiness(e.target.value)}
                    placeholder="e.g., Manufacturing of steel products"
                    className="w-full h-10 bg-slate-950/60 border border-slate-800 rounded-lg px-3 text-xs text-white outline-none focus:border-cyan-500/50"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Purpose of Loan</label>
                  <input 
                    type="text" 
                    value={purposeOfLoan}
                    onChange={(e) => setPurposeOfLoan(e.target.value)}
                    placeholder="e.g., Setting up manufacturing unit"
                    className="w-full h-10 bg-slate-950/60 border border-slate-800 rounded-lg px-3 text-xs text-white outline-none focus:border-cyan-500/50"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">First Projected Financial Year</label>
                  <input 
                    type="text" 
                    value={firstProjectedYear}
                    onChange={(e) => setFirstProjectedYear(e.target.value)}
                    placeholder="2025-26"
                    className="w-full h-10 bg-slate-950/60 border border-slate-800 rounded-lg px-3 text-xs text-white outline-none focus:border-cyan-500/50"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end">
                <button
                  onClick={() => setStep(2)}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-2 hover:scale-[1.02] transition-transform"
                >
                  Proceed to Project Cost <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* GREENFIELD STEP 2: PROJECT COST */}
          {step === 2 && (
            <div className="max-w-4xl mx-auto bg-slate-900/30 border border-slate-800/60 rounded-2xl p-6 space-y-6 animate-in fade-in duration-300">
              <div>
                <h2 className="text-md font-bold text-white">Step 2: Project Cost &amp; Debt Funding</h2>
                <p className="text-xs text-slate-400">Map capex and loan repayment terms. All figures are in actual Rupees (₹).</p>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest font-mono">Term Loan details</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Term Loan Sanctioned</label>
                      <input 
                        type="text" 
                        value={termLoanAmount}
                        onChange={(e) => setTermLoanAmount(e.target.value)}
                        className="w-full h-9 bg-slate-950/60 border border-slate-800 rounded-lg px-3 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Interest Rate % (p.a.)</label>
                      <input 
                        type="text" 
                        value={interestRate}
                        onChange={(e) => setInterestRate(e.target.value)}
                        className="w-full h-9 bg-slate-950/60 border border-slate-800 rounded-lg px-3 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Repayment Period (Months)</label>
                      <input 
                        type="text" 
                        value={repaymentMonths}
                        onChange={(e) => setRepaymentMonths(e.target.value)}
                        className="w-full h-9 bg-slate-950/60 border border-slate-800 rounded-lg px-3 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Moratorium (Months)</label>
                      <input 
                        type="text" 
                        value={moratoriumMonths}
                        onChange={(e) => setMoratoriumMonths(e.target.value)}
                        className="w-full h-9 bg-slate-950/60 border border-slate-800 rounded-lg px-3 text-xs text-white"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest font-mono">Capex Incurred (Year 1)</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Plant &amp; Machinery additions</label>
                      <input 
                        type="text" 
                        value={capexPlan[0].machinery}
                        onChange={(e) => {
                          const newPlan = [...capexPlan];
                          newPlan[0].machinery = parseFloat(e.target.value) || 0;
                          setCapexPlan(newPlan);
                        }}
                        className="w-full h-9 bg-slate-950/60 border border-slate-800 rounded-lg px-3 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Building WDV</label>
                      <input 
                        type="text" 
                        value={capexPlan[0].building}
                        onChange={(e) => {
                          const newPlan = [...capexPlan];
                          newPlan[0].building = parseFloat(e.target.value) || 0;
                          setCapexPlan(newPlan);
                        }}
                        className="w-full h-9 bg-slate-950/60 border border-slate-800 rounded-lg px-3 text-xs text-white"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-between items-center">
                <button
                  onClick={() => setStep(1)}
                  className="px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-400 hover:text-white text-[10px] font-bold uppercase tracking-wider"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-2"
                >
                  Next Step <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* GREENFIELD STEP 3: BASE YEAR ESTIMATES */}
          {step === 3 && (
            <div className="max-w-4xl mx-auto bg-slate-900/30 border border-slate-800/60 rounded-2xl p-6 space-y-6 animate-in fade-in duration-300">
              <div>
                <h2 className="text-md font-bold text-white">Step 3: Base Year Estimates &amp; CC limits</h2>
                <p className="text-xs text-slate-400">Setup assumptions for working capital bank finance limits and promoter equity capital.</p>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest font-mono">Working Capital Limits</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Sanctioned CC Limit</label>
                      <input 
                        type="text" 
                        value={ccLimit}
                        onChange={(e) => setCcLimit(e.target.value)}
                        className="w-full h-9 bg-slate-950/60 border border-slate-800 rounded-lg px-3 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Promoter Share Capital</label>
                      <input 
                        type="text" 
                        value={shareCapitalInit}
                        onChange={(e) => setShareCapitalInit(e.target.value)}
                        className="w-full h-9 bg-slate-950/60 border border-slate-800 rounded-lg px-3 text-xs text-white"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest font-mono">Stipulated Bank Margins</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Stock Margin %</label>
                      <input 
                        type="text" 
                        value={stockMargin}
                        onChange={(e) => setStockMargin(e.target.value)}
                        className="w-full h-9 bg-slate-950/60 border border-slate-800 rounded-lg px-3 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Debtors Margin %</label>
                      <input 
                        type="text" 
                        value={debtorsMargin}
                        onChange={(e) => setDebtorsMargin(e.target.value)}
                        className="w-full h-9 bg-slate-950/60 border border-slate-800 rounded-lg px-3 text-xs text-white"
                      />
                    </div>
                  </div>
                </div>

                {/* Working Capital Balances */}
                <div className="space-y-4 md:col-span-2 border-t border-slate-800/85 pt-6 mt-4 animate-in fade-in duration-200">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Working Capital Balances (₹)</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Stock Value</label>
                      <input 
                        type="text" 
                        value={stockValue}
                        onChange={(e) => setStockValue(e.target.value)}
                        className="w-full h-9 bg-slate-950/60 border border-slate-800 rounded-lg px-3 text-xs text-white outline-none focus:border-cyan-500/50"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Sundry Creditors</label>
                      <input 
                        type="text" 
                        value={sundryCreditors}
                        onChange={(e) => setSundryCreditors(e.target.value)}
                        className="w-full h-9 bg-slate-950/60 border border-slate-800 rounded-lg px-3 text-xs text-white outline-none focus:border-cyan-500/50"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Debtors &lt; 90 Days</label>
                      <input 
                        type="text" 
                        value={debtorsUnder90}
                        onChange={(e) => setDebtorsUnder90(e.target.value)}
                        className="w-full h-9 bg-slate-950/60 border border-slate-800 rounded-lg px-3 text-xs text-white outline-none focus:border-cyan-500/50"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Debtors &gt; 90 Days</label>
                      <input 
                        type="text" 
                        value={debtorsOver90}
                        onChange={(e) => setDebtorsOver90(e.target.value)}
                        className="w-full h-9 bg-slate-950/60 border border-slate-800 rounded-lg px-3 text-xs text-white outline-none focus:border-cyan-500/50"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-between items-center">
                <button
                  onClick={() => setStep(2)}
                  className="px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-400 hover:text-white text-[10px] font-bold uppercase tracking-wider"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(4)}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-2"
                >
                  Next Step <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* GREENFIELD STEP 4: FORECASTING ASSUMPTIONS */}
          {step === 4 && (
            <div className="max-w-4xl mx-auto bg-slate-900/30 border border-slate-800/60 rounded-2xl p-6 space-y-6 animate-in fade-in duration-300">
              <div>
                <h2 className="text-md font-bold text-white">Step 4: Projections &amp; Operating Ratios</h2>
                <p className="text-xs text-slate-400">Outline projection parameters over the 5-year forecast horizon.</p>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest font-mono">Growth Rates (Y1 - Y5)</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Sales Growth Rate % (YoY)</label>
                      <div className="grid grid-cols-5 gap-2">
                        {salesGrowth.map((val, idx) => (
                          <input
                            key={idx}
                            type="text"
                            value={val}
                            onChange={(e) => {
                              const newVals = [...salesGrowth];
                              newVals[idx] = e.target.value;
                              setSalesGrowth(newVals);
                            }}
                            className="w-full h-8 bg-slate-950/60 border border-slate-800 rounded px-2 text-center text-xs text-white"
                          />
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Capacity Utilization %</label>
                      <div className="grid grid-cols-5 gap-2">
                        {capacityUtil.map((val, idx) => (
                          <input
                            key={idx}
                            type="text"
                            value={val}
                            onChange={(e) => {
                              const newVals = [...capacityUtil];
                              newVals[idx] = e.target.value;
                              setCapacityUtil(newVals);
                            }}
                            className="w-full h-8 bg-slate-950/60 border border-slate-800 rounded px-2 text-center text-xs text-white"
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest font-mono">Operating Costs &amp; Taxes</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">RM Cost % of Sales</label>
                      <input 
                        type="text" 
                        value={rmCostPct[0]}
                        onChange={(e) => {
                          const newCost = [...rmCostPct];
                          newCost[0] = e.target.value;
                          setRmCostPct(newCost);
                        }}
                        className="w-full h-9 bg-slate-950/60 border border-slate-800 rounded-lg px-3 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Effective Tax Rate %</label>
                      <input 
                        type="text" 
                        value={taxRate}
                        onChange={(e) => setTaxRate(e.target.value)}
                        className="w-full h-9 bg-slate-950/60 border border-slate-800 rounded-lg px-3 text-xs text-white"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-between items-center">
                <button
                  onClick={() => setStep(3)}
                  className="px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-400 hover:text-white text-[10px] font-bold uppercase tracking-wider"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(5)}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-2"
                >
                  Next Step <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* GREENFIELD STEP 5: REPORT GENERATION */}
          {step === 5 && (
            <div className="max-w-xl mx-auto bg-slate-900/30 border border-slate-800/60 rounded-2xl p-8 space-y-6 text-center animate-in fade-in duration-300">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div className="space-y-2">
                <h2 className="text-lg font-bold text-white">Project Setup &amp; Modeling Complete!</h2>
                <p className="text-xs text-slate-400">All data has been verified. The Excel compiler is ready to generate the dynamic workbook containing detailed charts, ratios, repayment, and depreciation schedules.</p>
              </div>

              <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-4 text-left space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Entity Name:</span>
                  <span className="text-slate-300 font-bold">{companyName || 'Unnamed Greenfield Project'}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Term Loan:</span>
                  <span className="text-slate-300 font-bold">₹ {Number(termLoanAmount).toLocaleString('en-IN')} ({interestRate}% interest)</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">CC Limit:</span>
                  <span className="text-slate-300 font-bold">₹ {Number(ccLimit).toLocaleString('en-IN')}</span>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-between items-center">
                <button
                  onClick={() => setStep(4)}
                  className="px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-400 hover:text-white text-[10px] font-bold uppercase tracking-wider"
                >
                  Back
                </button>
                <button
                  onClick={executeGeneration}
                  disabled={loading}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-650 text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-95 disabled:opacity-50"
                >
                  <FileDown className="w-4 h-4" />
                  {loading ? 'Compiling Excel...' : 'Download Excel Report'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
