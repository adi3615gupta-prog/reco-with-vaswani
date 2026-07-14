import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft, Download, Server, Wifi, WifiOff, RefreshCw, 
  Calculator, FileSpreadsheet, Plus, Trash2, Building2,
  Calendar, Layers, CheckCircle2, TrendingUp, AlertTriangle,
  CloudDownload
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

import * as XLSX from 'xlsx-js-style';
import { fetchFixedAssets, type TallyFixedAsset, type TallyConnectionConfig, pingTally, fetchCompanyInfo } from '@/lib/tallyApi';
import { 
  calculateCompaniesAct, calculateIncomeTax, exportCompaniesAct, exportIncomeTax, 
  exportWorkingTemplate, parseWorkingTemplate, exportComprehensiveReport,
  type CompaniesActAssetRow, type IncomeTaxBlock, type IncomeTaxAddition 
} from '@/lib/depreciationEngine';

interface DepreciationModuleProps {
  onBack: () => void;
}

interface AssetCategoryRule {
  key: string;
  label: string;
  companiesUsefulLife: number; // in Years
  itWdvRate: number; // in Percentage
}

const ASSET_CATEGORY_RULES: AssetCategoryRule[] = [
  // 1. Buildings
  { key: 'building_res_rcc', label: 'Residential Buildings (RCC)', companiesUsefulLife: 60, itWdvRate: 5 },
  { key: 'building_res_other', label: 'Residential Buildings (Other)', companiesUsefulLife: 30, itWdvRate: 5 },
  { key: 'building_nonres_rcc', label: 'Non-Residential / Office (RCC)', companiesUsefulLife: 60, itWdvRate: 10 },
  { key: 'building_nonres_other', label: 'Non-Residential / Office (Other)', companiesUsefulLife: 30, itWdvRate: 10 },
  { key: 'building_factory', label: 'Factory Buildings', companiesUsefulLife: 30, itWdvRate: 10 },
  { key: 'building_fence', label: 'Fences, Wells & Tubewells', companiesUsefulLife: 5, itWdvRate: 10 },
  { key: 'building_temporary', label: 'Temporary Erections (Wooden)', companiesUsefulLife: 3, itWdvRate: 40 },
  { key: 'road_rcc', label: 'Carpeted Roads (RCC)', companiesUsefulLife: 10, itWdvRate: 10 },
  { key: 'road_other', label: 'Carpeted Roads (Other)', companiesUsefulLife: 5, itWdvRate: 10 },
  { key: 'road_noncarpeted', label: 'Non-Carpeted Roads', companiesUsefulLife: 3, itWdvRate: 10 },

  // 2. Furniture & Fittings
  { key: 'furniture_general', label: 'General Furniture & Fittings', companiesUsefulLife: 10, itWdvRate: 10 },
  { key: 'furniture_hotel', label: 'Furniture (Hotels/Schools)', companiesUsefulLife: 8, itWdvRate: 10 },
  { key: 'electrical_fittings', label: 'Electrical Fittings', companiesUsefulLife: 10, itWdvRate: 10 },

  // 3. Computers & Software
  { key: 'computer_device', label: 'End-User Devices (Laptops/Desktops)', companiesUsefulLife: 3, itWdvRate: 40 },
  { key: 'computer_servers', label: 'Servers & Networks', companiesUsefulLife: 6, itWdvRate: 40 },
  { key: 'computer_software', label: 'Computer Software', companiesUsefulLife: 3, itWdvRate: 40 },

  // 4. Vehicles
  { key: 'vehicle_bike', label: 'Motorcycles / Scooters', companiesUsefulLife: 10, itWdvRate: 15 },
  { key: 'vehicle_car', label: 'Motor Cars (Private Use)', companiesUsefulLife: 8, itWdvRate: 15 },
  { key: 'vehicle_hire', label: 'Motor Cars/Buses (Used on Hire)', companiesUsefulLife: 6, itWdvRate: 30 },
  { key: 'vehicle_heavy', label: 'Heavy Commercial Vehicles', companiesUsefulLife: 8, itWdvRate: 30 },
  { key: 'vehicle_aero', label: 'Aeroplanes / Aeroengines', companiesUsefulLife: 20, itWdvRate: 40 },

  // 5. Plant & Machinery (General)
  { key: 'machinery_general', label: 'General Plant & Machinery', companiesUsefulLife: 15, itWdvRate: 15 },
  { key: 'machinery_continuous', label: 'Continuous Process Plants', companiesUsefulLife: 25, itWdvRate: 15 },
  { key: 'machinery_moulds', label: 'Moulds (Rubber/Plastic)', companiesUsefulLife: 8, itWdvRate: 30 },
  { key: 'machinery_lifesaving', label: 'Life-Saving Medical Equipment', companiesUsefulLife: 13, itWdvRate: 40 },
  { key: 'machinery_renewable', label: 'Renewable Energy Devices (Solar/Wind)', companiesUsefulLife: 22, itWdvRate: 40 },
  { key: 'machinery_pollution', label: 'Pollution Control Equipment', companiesUsefulLife: 10, itWdvRate: 40 },
  { key: 'machinery_books', label: 'Books (Professional/Library)', companiesUsefulLife: 3, itWdvRate: 40 },

  // 6. Industry-Specific
  { key: 'machinery_civil', label: 'Civil Construction (Earth-moving)', companiesUsefulLife: 9, itWdvRate: 15 },
  { key: 'machinery_telecom', label: 'Telecom Towers & Cables', companiesUsefulLife: 18, itWdvRate: 15 },
  { key: 'machinery_pharma', label: 'Pharmaceutical Reactors', companiesUsefulLife: 20, itWdvRate: 15 },
  { key: 'machinery_refinery', label: 'Oil/Gas Refineries', companiesUsefulLife: 25, itWdvRate: 15 },
  { key: 'machinery_power', label: 'Power Generation Plants', companiesUsefulLife: 40, itWdvRate: 15 },
  { key: 'machinery_steel', label: 'Steel Manufacturing Plants', companiesUsefulLife: 20, itWdvRate: 15 },

  // 7. Intangibles
  { key: 'intangible_amortized', label: 'Patents / Trademarks / Licenses', companiesUsefulLife: 5, itWdvRate: 25 },
  { key: 'intangible_goodwill', label: 'Goodwill of Business', companiesUsefulLife: 0, itWdvRate: 0 }
];

function guessCategoryFromLedgerName(name: string): string {
  const n = name.toUpperCase();
  if (n.includes('RESIDENTIAL') && (n.includes('RCC') || n.includes('CONCRETE'))) return 'building_res_rcc';
  if (n.includes('RESIDENTIAL')) return 'building_res_other';
  if ((n.includes('OFFICE') || n.includes('ADMIN') || n.includes('FACTORY')) && (n.includes('RCC') || n.includes('CONCRETE'))) return 'building_nonres_rcc';
  if (n.includes('FACTORY')) return 'building_factory';
  if (n.includes('BUILDING') || n.includes('PREMISES') || n.includes('LAND & BUILDING')) return 'building_nonres_rcc';
  if (n.includes('FENCE') || n.includes('WELL') || n.includes('TUBEWELL')) return 'building_fence';
  if (n.includes('TEMPORARY') || n.includes('WOODEN')) return 'building_temporary';
  if (n.includes('ROAD') && (n.includes('RCC') || n.includes('CONCRETE'))) return 'road_rcc';
  if (n.includes('ROAD')) return 'road_other';

  if (n.includes('FURNITURE') && (n.includes('HOTEL') || n.includes('SCHOOL') || n.includes('REST'))) return 'furniture_hotel';
  if (n.includes('FITTING') || n.includes('ELECTRICAL')) return 'electrical_fittings';
  if (n.includes('FURNITURE') || n.includes('FIXTURE')) return 'furniture_general';

  if (n.includes('SERVER') || n.includes('NETWORK')) return 'computer_servers';
  if (n.includes('SOFTWARE')) return 'computer_software';
  if (n.includes('COMPUTER') || n.includes('LAPTOP') || n.includes('DESKTOP') || n.includes('PRINTER') || n.includes('MONITOR') || n.includes('IT ASSET')) return 'computer_device';

  if (n.includes('BIKE') || n.includes('SCOOTER') || n.includes('MOTORCYCLE')) return 'vehicle_bike';
  if (n.includes('CAR') && n.includes('HIRE')) return 'vehicle_hire';
  if (n.includes('CAR')) return 'vehicle_car';
  if (n.includes('BUS') || n.includes('TAXI') || n.includes('CAB')) return 'vehicle_hire';
  if (n.includes('TRUCK') || n.includes('LORRY') || n.includes('HEAVY') || n.includes('COMMERCIAL')) return 'vehicle_heavy';
  if (n.includes('AERO') || n.includes('PLANE') || n.includes('AIRCRAFT')) return 'vehicle_aero';

  if (n.includes('CONTINUOUS') || n.includes('PROCESS')) return 'machinery_continuous';
  if (n.includes('MOULD') || n.includes('RUBBER') || n.includes('PLASTIC')) return 'machinery_moulds';
  if (n.includes('SURGICAL') || n.includes('MEDICAL')) return 'machinery_general';
  if (n.includes('LIFE') && n.includes('SAVING')) return 'machinery_lifesaving';
  if (n.includes('SOLAR') || n.includes('WIND') || n.includes('RENEWABLE')) return 'machinery_renewable';
  if (n.includes('POLLUTION') || n.includes('EMISSION') || n.includes('TREATMENT')) return 'machinery_pollution';
  if (n.includes('BOOK') || n.includes('LIBRARY') || n.includes('JOURNAL')) return 'machinery_books';

  if (n.includes('EARTH') || n.includes('EXCAVATOR') || n.includes('CIVIL') || n.includes('CONSTRUCTION')) return 'machinery_civil';
  if (n.includes('TELECOM') || n.includes('TOWER') || n.includes('CABLE')) return 'machinery_telecom';
  if (n.includes('REACTOR') || n.includes('CHEMICAL') || n.includes('PHARMA')) return 'machinery_pharma';
  if (n.includes('REFINERY') || n.includes('PETRO')) return 'machinery_refinery';
  if (n.includes('POWER') || n.includes('HYDRO') || n.includes('THERMAL') || n.includes('NUCLEAR')) return 'machinery_power';
  if (n.includes('STEEL') || n.includes('FOUNDRY') || n.includes('METAL')) return 'machinery_steel';

  if (n.includes('PATENT') || n.includes('TRADEMARK') || n.includes('COPYRIGHT') || n.includes('LICENSE')) return 'intangible_amortized';
  if (n.includes('GOODWILL')) return 'intangible_goodwill';

  return 'machinery_general';
}

function getItBlockName(ruleKey: string, rate: number): string {
  const ratePct = `${rate}%`;
  if (rate === 0) return "Goodwill 0%";
  if (rate === 25) return "Intangible Assets 25%";
  
  if (ruleKey.startsWith('building') || ruleKey.startsWith('road')) {
    return `Buildings ${ratePct}`;
  }
  if (ruleKey.startsWith('furniture') || ruleKey.startsWith('electrical')) {
    return `Furniture & Fittings ${ratePct}`;
  }
  if (ruleKey.startsWith('computer')) {
    return `Computers & Software ${ratePct}`;
  }
  if (ruleKey.startsWith('vehicle')) {
    return `Vehicles ${ratePct}`;
  }
  if (ruleKey.startsWith('machinery')) {
    return `Plant & Machinery ${ratePct}`;
  }
  return `Plant & Machinery ${ratePct}`;
}

const suggestUsefulLife = (name: string, category: string): number => {
  const catKey = guessCategoryFromLedgerName(`${name} ${category}`);
  const rule = ASSET_CATEGORY_RULES.find(r => r.key === catKey);
  return rule ? rule.companiesUsefulLife : 15;
};

export default function DepreciationModule({ onBack }: DepreciationModuleProps) {
  // --- Tally Connection State ---
  const [tallyPort, setTallyPort] = useState(9000);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [companyName, setCompanyName] = useState('Tally');
  const [isFetching, setIsFetching] = useState(false);
  const [tallyAssets, setTallyAssets] = useState<TallyFixedAsset[]>([]);

  // --- Configuration State ---
  const [fyStart, setFyStart] = useState('2024-04-01');
  const [fyEnd, setFyEnd] = useState('2025-03-31');
  const [entityType, setEntityType] = useState<'company' | 'individual'>('company');
  const [activeTab, setActiveTab] = useState<'companies' | 'incometax' | 'variance'>('companies');

  useEffect(() => {
    if (entityType === 'individual') {
      setActiveTab('incometax');
    }
  }, [entityType]);

  // --- Companies Act State ---
  const [compAssets, setCompAssets] = useState<CompaniesActAssetRow[]>([]);

  // --- Income Tax State ---
  const [itBlocks, setItBlocks] = useState<IncomeTaxBlock[]>([
    { blockName: "Buildings 5%", rate: 0.05, openingWdv: 0, deletions: 0 },
    { blockName: "Buildings 10%", rate: 0.10, openingWdv: 0, deletions: 0 },
    { blockName: "Buildings 40%", rate: 0.40, openingWdv: 0, deletions: 0 },
    { blockName: "Furniture & Fittings 10%", rate: 0.10, openingWdv: 0, deletions: 0 },
    { blockName: "Computers & Software 40%", rate: 0.40, openingWdv: 0, deletions: 0 },
    { blockName: "Vehicles 15%", rate: 0.15, openingWdv: 0, deletions: 0 },
    { blockName: "Vehicles 30%", rate: 0.30, openingWdv: 0, deletions: 0 },
    { blockName: "Vehicles 40%", rate: 0.40, openingWdv: 0, deletions: 0 },
    { blockName: "Plant & Machinery 15%", rate: 0.15, openingWdv: 0, deletions: 0 },
    { blockName: "Plant & Machinery 30%", rate: 0.30, openingWdv: 0, deletions: 0 },
    { blockName: "Plant & Machinery 40%", rate: 0.40, openingWdv: 0, deletions: 0 },
    { blockName: "Intangible Assets 25%", rate: 0.25, openingWdv: 0, deletions: 0 },
    { blockName: "Goodwill 0%", rate: 0.00, openingWdv: 0, deletions: 0 }
  ]);
  const [assetBlockMapping, setAssetBlockMapping] = useState<Record<string, string>>({});

  // ─── Tally Connection ──────────────────────────────────────────────
  const connectToTally = async () => {
    setConnectionStatus('connecting');
    try {
      const config: TallyConnectionConfig = { host: 'localhost', port: tallyPort };
      const alive = await pingTally(config);
      if (!alive) {
        setConnectionStatus('error');
        toast.error('Cannot reach Tally', { description: `TallyPrime not responding on port ${tallyPort}.` });
        return;
      }
      const info = await fetchCompanyInfo(config);
      setCompanyName(info.name);
      setConnectionStatus('connected');
      toast.success('Connected to Tally!');
    } catch (err) {
      setConnectionStatus('error');
      toast.error('Connection failed', { description: String(err) });
    }
  };

  const handleFetchAssets = async () => {
    setIsFetching(true);
    try {
      const config: TallyConnectionConfig = { host: 'localhost', port: tallyPort };
      const assets = await fetchFixedAssets(fyStart, fyEnd, config);
      // Separate asset ledgers and accumulated depreciation ledgers
      const assetLedgers: TallyFixedAsset[] = [];
      const depLedgers: TallyFixedAsset[] = [];
      
      assets.forEach(a => {
        const nameUpper = a.ledgerName.toUpperCase();
        // If the name contains keywords of depreciation, or if it has a negative balance
        const isDep = (
          nameUpper.includes('DEP') || 
          nameUpper.includes('PROV') || 
          nameUpper.includes('ACCUM')
        ) || a.openingBalance < 0;
        
        if (isDep) {
          depLedgers.push(a);
        } else {
          assetLedgers.push(a);
        }
      });

      setTallyAssets(assetLedgers);

      // Helper to clean names for fuzzy matching
      const cleanName = (name: string) => {
        return name
          .toUpperCase()
          .replace(/ACCUMULATED|DEPRECIATION|PROVISION|PROV|FOR|ON|OF|[-_()/]/g, "")
          .replace(/\s+/g, "")
          .trim();
      };

      // Map depreciation ledgers to asset ledgers
      const depMapping: Record<string, number> = {};
      depLedgers.forEach(d => {
        const cleanD = cleanName(d.ledgerName);
        // Find best matching asset ledger
        let bestMatch: TallyFixedAsset | null = null;
        let bestMatchLen = 0;
        
        assetLedgers.forEach(a => {
          const cleanA = cleanName(a.ledgerName);
          if (cleanD.includes(cleanA) || cleanA.includes(cleanD)) {
            if (cleanA.length > bestMatchLen) {
              bestMatch = a;
              bestMatchLen = cleanA.length;
            }
          }
        });
        
        if (bestMatch) {
          const key = (bestMatch as TallyFixedAsset).ledgerName;
          depMapping[key] = (depMapping[key] || 0) + Math.abs(d.openingBalance);
        } else {
          // If no match, we can treat it as a general pool or keep it
          console.warn(`Unmatched accumulated depreciation ledger: ${d.ledgerName}`);
        }
      });

      // Build Companies Act rows, splitting opening balances and additions
      const compRows: CompaniesActAssetRow[] = [];
      const initialMapping: Record<string, string> = { ...assetBlockMapping };
      
      assetLedgers.forEach(a => {
        const matchedDep = depMapping[a.ledgerName] || 0;
        
        const categoryKey = guessCategoryFromLedgerName(a.ledgerName);
        const rule = ASSET_CATEGORY_RULES.find(r => r.key === categoryKey) || ASSET_CATEGORY_RULES[0];
        const isIntangible = rule.key.startsWith('intangible');
        
        const blockName = getItBlockName(rule.key, rule.itWdvRate);
        initialMapping[a.ledgerName] = blockName;

        const usefulLife = rule.companiesUsefulLife;

        // 1. If has opening balance, create a row for Opening
        if (a.openingBalance > 0) {
          const totalDeletions = a.deletions.reduce((sum, del) => sum + del.amount, 0);
          compRows.push({
            name: `${a.ledgerName} (Opening)`,
            type: isIntangible ? "Intangible Asset" : "Tangible Asset",
            category: rule.label,
            costOfPurchase: a.openingBalance,
            residualValue: isIntangible ? 0 : a.openingBalance * 0.05,
            datePutInPlace: fyStart, // default to start of FY
            dateOfRetirement: '',
            usefulLife: usefulLife,
            method: 'WDV',
            dateOfSale: a.deletions.length > 0 ? a.deletions[0].date : '',
            saleValue: totalDeletions,
            openingAccumulatedDep: matchedDep
          });
        }
        
        // 2. Create separate rows for each Addition to capture the EXACT date
        a.additions.forEach(add => {
          compRows.push({
            name: `${a.ledgerName} (Addition - ${add.voucherNumber || 'New'})`,
            type: isIntangible ? "Intangible Asset" : "Tangible Asset",
            category: rule.label,
            costOfPurchase: add.amount,
            residualValue: isIntangible ? 0 : add.amount * 0.05,
            datePutInPlace: add.date, // Exact Voucher Date of Purchase/Put to use
            dateOfRetirement: '',
            usefulLife: usefulLife,
            method: 'WDV',
            dateOfSale: '',
            saleValue: 0,
            openingAccumulatedDep: 0
          });
        });
        
        // 3. Fallback if it has no opening balance and no additions (should not happen, but just in case)
        if (a.openingBalance <= 0 && a.additions.length === 0) {
          compRows.push({
            name: a.ledgerName,
            type: isIntangible ? "Intangible Asset" : "Tangible Asset",
            category: rule.label,
            costOfPurchase: 0,
            residualValue: 0,
            datePutInPlace: fyStart,
            dateOfRetirement: '',
            usefulLife: usefulLife,
            method: 'WDV',
            dateOfSale: '',
            saleValue: 0,
            openingAccumulatedDep: 0
          });
        }
      });

      setAssetBlockMapping(initialMapping);
      setCompAssets(compRows);
      toast.success(`Fetched assets and additions! Split into ${compRows.length} working rows.`);
    } catch (err) {
      toast.error('Fetch failed', { description: String(err) });
    } finally {
      setIsFetching(false);
    }
  };

  const handleImportTemplate = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const sheetData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
        
        const parsedAssets = parseWorkingTemplate(sheetData);
        if (parsedAssets.length === 0) {
          toast.error("No valid asset records found in the template");
          return;
        }

        setCompAssets(parsedAssets);

        // Reconstruct Tally assets so IT Act tab additions list and block mappings are populated
        const reconstructedTally = reconstructTallyAssets(parsedAssets);
        setTallyAssets(reconstructedTally);

        // Auto map blocks on import
        const initialMapping: Record<string, string> = { ...assetBlockMapping };
        reconstructedTally.forEach(a => {
          const categoryKey = guessCategoryFromLedgerName(a.ledgerName);
          const rule = ASSET_CATEGORY_RULES.find(r => r.key === categoryKey) || ASSET_CATEGORY_RULES[0];
          const blockName = getItBlockName(rule.key, rule.itWdvRate);
          initialMapping[a.ledgerName] = blockName;
        });
        setAssetBlockMapping(initialMapping);

        toast.success(`Successfully imported ${parsedAssets.length} assets from template!`);
      } catch (err) {
        toast.error("Failed to parse working template Excel", { description: String(err) });
      }
    };
    reader.readAsArrayBuffer(file);
    // Reset file input value so user can import the same file again if needed
    e.target.value = '';
  };

  const reconstructTallyAssets = (compRows: CompaniesActAssetRow[]): TallyFixedAsset[] => {
    const map = new Map<string, TallyFixedAsset>();
    
    for (const r of compRows) {
      const baseName = r.name
        .replace(/\s*\(Opening\)$/, '')
        .replace(/\s*\(Addition\s*-\s*[^)]+\)$/, '')
        .trim()
        .toUpperCase();
      
      if (!map.has(baseName)) {
        map.set(baseName, {
          ledgerName: baseName,
          parentGroup: r.category,
          openingBalance: 0,
          additions: [],
          deletions: []
        });
      }
      
      const asset = map.get(baseName)!;
      
      if (r.name.includes('(Addition')) {
        const match = r.name.match(/\(Addition\s*-\s*([^)]+)\)/);
        const vNum = match ? match[1] : 'New';
        asset.additions.push({
          date: r.datePutInPlace,
          amount: r.costOfPurchase,
          voucherNumber: vNum
        });
      } else {
        asset.openingBalance += r.costOfPurchase;
        if (r.saleValue > 0) {
          asset.deletions.push({
            date: r.dateOfSale || r.datePutInPlace,
            amount: r.saleValue,
            voucherNumber: 'Sale'
          });
        }
      }
    }
    
    return Array.from(map.values());
  };

  // ─── Updates ───────────────────────────────────────────────────────
  const updateCompAsset = (index: number, field: keyof CompaniesActAssetRow, value: any) => {
    const newAssets = [...compAssets];
    newAssets[index] = { ...newAssets[index], [field]: value };
    setCompAssets(newAssets);
  };

  const addItBlock = () => {
    setItBlocks([...itBlocks, { blockName: "New Block", rate: 0.10, openingWdv: 0, deletions: 0 }]);
  };
  
  const updateItBlock = (index: number, field: keyof IncomeTaxBlock, value: any) => {
    const newBlocks = [...itBlocks];
    newBlocks[index] = { ...newBlocks[index], [field]: value };
    setItBlocks(newBlocks);
  };

  const removeItBlock = (index: number) => {
    const newBlocks = itBlocks.filter((_, i) => i !== index);
    setItBlocks(newBlocks);
  };

  // ─── Calculations ──────────────────────────────────────────────────
  const companiesResults = useMemo(() => {
    if (compAssets.length === 0 || entityType !== 'company') return [];
    return calculateCompaniesAct({ companyName, assets: compAssets, fyStart, fyEnd });
  }, [compAssets, companyName, fyStart, fyEnd, entityType]);

  const totalCompDep = entityType === 'company'
    ? companiesResults.reduce((sum, r) => sum + (r.forPeriodEnded || 0), 0)
    : 0;

  const computedBlocks = useMemo(() => {
    return itBlocks.map(block => {
      let blockDeletions = 0;
      let totalAssetsCount = 0;
      let soldAssetsCount = 0;

      compAssets.forEach(a => {
        const baseName = a.name
          .replace(/\s*\(Opening\)$/, '')
          .replace(/\s*\(Addition\s*-\s*[^)]+\)$/, '')
          .trim();
        const mappedBlock = assetBlockMapping[baseName];
        if (mappedBlock === block.blockName) {
          totalAssetsCount++;
          blockDeletions += a.saleValue || 0;
          if (a.dateOfSale || a.saleValue > 0) {
            soldAssetsCount++;
          }
        }
      });

      const isAllAssetsSold = !!block.isAllAssetsSold || (totalAssetsCount > 0 && soldAssetsCount === totalAssetsCount);

      return {
        ...block,
        deletions: blockDeletions || block.deletions || 0,
        isAllAssetsSold
      };
    });
  }, [itBlocks, compAssets, assetBlockMapping]);

  const itData = useMemo(() => {
    const additions: IncomeTaxAddition[] = [];
    tallyAssets.forEach(a => {
      const blockName = assetBlockMapping[a.ledgerName];
      if (blockName) {
        a.additions.forEach(add => {
          additions.push({
            blockName,
            assetName: a.ledgerName,
            dateOfPurchase: add.date,
            amount: add.amount,
            datePutToUse: add.date,
            additionalDepreciation: 0
          });
        });
      }
    });
    return calculateIncomeTax({ blocks: computedBlocks, additions, fyStart, fyEnd });
  }, [tallyAssets, computedBlocks, fyStart, fyEnd]);

  const totalItDep = itData.totals.totalDep;

  const dtaDtl = entityType === 'company' ? totalCompDep - totalItDep : 0;
  const dtaDtlType = entityType === 'company'
    ? (dtaDtl > 0 ? 'Deferred Tax Asset (DTA)' : (dtaDtl < 0 ? 'Deferred Tax Liability (DTL)' : 'No Variance'))
    : 'N/A (Individual / Firm)';

  // ─── Exports ───────────────────────────────────────────────────────
  const triggerExportCompanies = () => {
    exportCompaniesAct({ companyName, assets: compAssets, fyStart, fyEnd });
    toast.success('Companies Act FAR Exported!');
  };

  const triggerExportIncomeTax = () => {
    const additions: IncomeTaxAddition[] = [];
    tallyAssets.forEach(a => {
      const blockName = assetBlockMapping[a.ledgerName];
      if (blockName) {
        a.additions.forEach(add => {
          additions.push({
            blockName,
            assetName: a.ledgerName,
            dateOfPurchase: add.date,
            amount: add.amount,
            datePutToUse: add.date,
            additionalDepreciation: 0
          });
        });
      }
    });
    exportIncomeTax({ blocks: computedBlocks, additions, fyStart, fyEnd });
    toast.success('Income Tax Schedule Exported!');
  };

  const triggerExportComprehensive = () => {
    const additions: IncomeTaxAddition[] = [];
    tallyAssets.forEach(a => {
      const blockName = assetBlockMapping[a.ledgerName];
      if (blockName) {
        a.additions.forEach(add => {
          additions.push({
            blockName,
            assetName: a.ledgerName,
            dateOfPurchase: add.date,
            amount: add.amount,
            datePutToUse: add.date,
            additionalDepreciation: 0
          });
        });
      }
    });

    exportComprehensiveReport(
      { companyName, assets: compAssets, fyStart, fyEnd },
      { blocks: computedBlocks, additions, fyStart, fyEnd },
      assetBlockMapping
    );
    toast.success('Comprehensive 3-Sheet Depreciation Audit Report Exported!');
  };

  return (
    <div className="min-h-screen w-full bg-[#030712] text-slate-200 p-4 sm:p-8 font-sans selection:bg-cyan-500/30">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="w-10 h-10 bg-slate-800/80 border border-slate-700 rounded-xl flex items-center justify-center hover:bg-slate-700 hover:text-white transition-all text-slate-400"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-3xl font-black tracking-tight">
                <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
                  Dual Depreciation Module
                </span>
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                Automate Schedule II & Section 32 directly from TallyPrime
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            {entityType === 'company' && (
              <>
                <button onClick={triggerExportComprehensive} disabled={compAssets.length === 0} className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white text-sm font-semibold rounded-lg flex items-center gap-2 shadow-lg shadow-cyan-500/10 disabled:opacity-50 transition-all" title="Export Companies Act, Income Tax Act, and Deferred Tax Variance in one single sheet">
                  <Download className="w-4 h-4" />
                  Comprehensive Audit Report
                </button>
                <button onClick={triggerExportCompanies} disabled={compAssets.length === 0} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-400 text-sm font-semibold rounded-lg flex items-center gap-2 border border-slate-700 disabled:opacity-50 transition-all">
                  <Download className="w-4 h-4" />
                  Companies Act
                </button>
              </>
            )}
            <button onClick={triggerExportIncomeTax} disabled={itBlocks.length === 0} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-emerald-400 text-sm font-semibold rounded-lg flex items-center gap-2 border border-slate-700 disabled:opacity-50 transition-all">
              <Download className="w-4 h-4" />
              Income Tax Act
            </button>
          </div>
        </div>

        {/* Tally Connection Panel */}
        <div className="bg-slate-900/50 backdrop-blur-xl border border-white/5 rounded-2xl p-6 shadow-2xl">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 bg-cyan-500/10 border border-cyan-500/20 rounded-lg flex items-center justify-center">
              <Server className="w-4 h-4 text-cyan-400" />
            </div>
            <h2 className="text-lg font-bold text-white">Tally Connection</h2>
          </div>

          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="text-[11px] text-slate-400 font-medium uppercase tracking-wider mb-1.5 block">Tally Port</label>
              <input
                type="number"
                value={tallyPort}
                onChange={(e) => setTallyPort(Number(e.target.value))}
                className="w-28 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/50 transition-all"
              />
            </div>
            
            <button
              onClick={connectToTally}
              disabled={connectionStatus === 'connecting'}
              className="h-[38px] px-6 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold rounded-lg transition-all shadow-[0_0_20px_rgba(8,145,178,0.2)] disabled:opacity-50 flex items-center gap-2"
            >
              {connectionStatus === 'connecting' ? <RefreshCw className="w-4 h-4 animate-spin" /> : (connectionStatus === 'connected' ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />)}
              {connectionStatus === 'connected' ? 'Connected' : 'Connect'}
            </button>

            {connectionStatus === 'connected' && (
              <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-4 py-2 rounded-lg text-sm font-medium animate-in fade-in">
                <Building2 className="w-4 h-4" />
                {companyName}
              </div>
            )}
            
            <div className="ml-auto flex gap-4 items-end">
              <div>
                <label className="text-[11px] text-slate-400 font-medium uppercase tracking-wider mb-1.5 block font-sans">Entity Type</label>
                <select
                  value={entityType}
                  onChange={(e) => setEntityType(e.target.value as 'company' | 'individual')}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/50 h-[38px] [color-scheme:dark]"
                >
                  <option value="company">Company / LLP</option>
                  <option value="individual">Individual / Firm / Proprietorship</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] text-slate-400 font-medium uppercase tracking-wider mb-1.5 block">FY Start</label>
                <input
                  type="date"
                  value={fyStart}
                  onChange={(e) => setFyStart(e.target.value)}
                  className="w-36 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/50 [color-scheme:dark]"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 font-medium uppercase tracking-wider mb-1.5 block">FY End</label>
                <input
                  type="date"
                  value={fyEnd}
                  onChange={(e) => setFyEnd(e.target.value)}
                  className="w-36 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/50 [color-scheme:dark]"
                />
              </div>
              <button
                onClick={handleFetchAssets}
                disabled={connectionStatus !== 'connected' || isFetching}
                className="h-[38px] px-6 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition-all shadow-[0_0_20px_rgba(37,99,235,0.2)] disabled:opacity-50 flex items-center gap-2"
              >
                {isFetching ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CloudDownload className="w-4 h-4" />}
                Fetch Fixed Assets
              </button>

              <button
                onClick={() => exportWorkingTemplate(compAssets)}
                disabled={compAssets.length === 0}
                className="h-[38px] px-4 bg-slate-800 hover:bg-slate-700 text-cyan-400 text-sm font-semibold rounded-lg flex items-center gap-2 border border-slate-700 disabled:opacity-50 transition-all"
                title="Export current grid data to Excel Working Template for manual edits"
              >
                <Download className="w-4 h-4" />
                Export Working Template
              </button>

              <label className="h-[38px] px-4 bg-slate-800 hover:bg-slate-700 text-amber-400 text-sm font-semibold rounded-lg flex items-center gap-2 border border-slate-700 cursor-pointer transition-all" title="Upload edited Excel Working Template back to the app">
                <Plus className="w-4 h-4" />
                Import Working Template
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={handleImportTemplate}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Workspace */}
        {tallyAssets.length > 0 && (
          <div className="bg-slate-900/50 backdrop-blur-xl border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
            {/* Tabs */}
            <div className="flex border-b border-white/5 bg-slate-950/50">
              {entityType === 'company' && (
                <button
                  onClick={() => setActiveTab('companies')}
                  className={`flex-1 py-4 text-sm font-bold tracking-wide uppercase transition-all flex items-center justify-center gap-2 ${activeTab === 'companies' ? 'text-cyan-400 border-b-2 border-cyan-400 bg-cyan-500/5' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  <FileSpreadsheet className="w-4 h-4" /> Companies Act, 2013
                </button>
              )}
              <button
                onClick={() => setActiveTab('incometax')}
                className={`flex-1 py-4 text-sm font-bold tracking-wide uppercase transition-all flex items-center justify-center gap-2 ${activeTab === 'incometax' ? 'text-emerald-400 border-b-2 border-emerald-400 bg-emerald-500/5' : 'text-slate-500 hover:text-slate-300'}`}
              >
                <Calculator className="w-4 h-4" /> Income Tax Act, 1961
              </button>
              {entityType === 'company' && (
                <button
                  onClick={() => setActiveTab('variance')}
                  className={`flex-1 py-4 text-sm font-bold tracking-wide uppercase transition-all flex items-center justify-center gap-2 ${activeTab === 'variance' ? 'text-purple-400 border-b-2 border-purple-400 bg-purple-500/5' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  <TrendingUp className="w-4 h-4" /> Variance & DTA/DTL
                </button>
              )}
            </div>

            {/* Content Area */}
            <div className="p-6">
              <AnimatePresence mode="wait">
                {activeTab === 'companies' && (
                  <motion.div key="companies" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-white font-semibold">Schedule II Working Papers</h3>
                      <p className="text-sm text-slate-400">Total Calculated Dep: <span className="text-cyan-400 font-bold">₹{totalCompDep.toLocaleString('en-IN', {maximumFractionDigits: 0})}</span></p>
                    </div>
                    
                    <div className="overflow-x-auto rounded-xl border border-white/5">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-slate-950/80 text-xs text-slate-400 uppercase">
                          <tr>
                            <th className="px-4 py-3">Asset Name</th>
                            <th className="px-4 py-3">Category</th>
                            <th className="px-4 py-3 text-right">Cost (incl. Adds)</th>
                            <th className="px-4 py-3">Date Put to Use</th>
                            <th className="px-4 py-3 text-right">Residual Val</th>
                            <th className="px-4 py-3 text-center">Life (Yrs)</th>
                            <th className="px-4 py-3 text-center">Method</th>
                            <th className="px-4 py-3 text-right">Opening Dep</th>
                            <th className="px-4 py-3 text-right text-cyan-400">Calc. Dep</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {compAssets.map((asset, i) => (
                            <tr key={i} className="hover:bg-white/[0.02]">
                              <td className="px-4 py-2 font-medium text-slate-200">{asset.name}</td>
                              <td className="px-4 py-2 text-slate-400">
                                <input type="text" value={asset.category} onChange={(e) => updateCompAsset(i, 'category', e.target.value)} className="w-24 bg-transparent border-b border-transparent focus:border-cyan-500 outline-none text-slate-300" />
                              </td>
                              <td className="px-4 py-2 text-right">₹{asset.costOfPurchase.toLocaleString('en-IN', {maximumFractionDigits:0})}</td>
                              <td className="px-4 py-2">
                                <input type="date" value={asset.datePutInPlace} onChange={(e) => updateCompAsset(i, 'datePutInPlace', e.target.value)} className="bg-transparent border-b border-transparent focus:border-cyan-500 outline-none text-slate-300 [color-scheme:dark]" />
                              </td>
                              <td className="px-4 py-2">
                                <input type="number" value={asset.residualValue} onChange={(e) => updateCompAsset(i, 'residualValue', Number(e.target.value))} className="w-24 text-right bg-transparent border-b border-transparent focus:border-cyan-500 outline-none text-slate-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                              </td>
                              <td className="px-4 py-2 text-center">
                                <input type="number" value={asset.usefulLife} onChange={(e) => updateCompAsset(i, 'usefulLife', Number(e.target.value))} className="w-12 text-center bg-transparent border-b border-transparent focus:border-cyan-500 outline-none text-slate-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                              </td>
                              <td className="px-4 py-2 text-center">
                                <select value={asset.method} onChange={(e) => updateCompAsset(i, 'method', e.target.value)} className="bg-transparent text-slate-300 outline-none">
                                  <option className="bg-slate-900" value="WDV">WDV</option>
                                  <option className="bg-slate-900" value="SLM">SLM</option>
                                </select>
                              </td>
                              <td className="px-4 py-2">
                                <input type="number" value={asset.openingAccumulatedDep} onChange={(e) => updateCompAsset(i, 'openingAccumulatedDep', Number(e.target.value))} className="w-24 text-right bg-transparent border-b border-transparent focus:border-cyan-500 outline-none text-slate-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                              </td>
                              <td className="px-4 py-2 text-right font-bold text-cyan-400">
                                ₹{companiesResults[i]?.forPeriodEnded?.toLocaleString('en-IN', {maximumFractionDigits:0}) || 0}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </motion.div>
                )}

                {activeTab === 'incometax' && (
                  <motion.div key="incometax" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                    <div className="grid lg:grid-cols-2 gap-8">
                      {/* Left: Block Setup */}
                      <div>
                        <div className="flex justify-between items-center mb-4">
                          <h3 className="text-white font-semibold flex items-center gap-2"><Layers className="w-4 h-4 text-emerald-400"/> IT Blocks Setup</h3>
                          <button onClick={addItBlock} className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded hover:bg-emerald-500/30 flex items-center gap-1"><Plus className="w-3 h-3"/> Add Block</button>
                        </div>
                        <div className="space-y-3">
                          {itBlocks.map((block, i) => (
                            <div key={i} className="flex gap-2 items-center bg-slate-950/50 p-3 rounded-xl border border-white/5">
                              <input type="text" value={block.blockName} onChange={(e) => updateItBlock(i, 'blockName', e.target.value)} className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-sm outline-none focus:border-emerald-500" placeholder="Block Name" />
                              <div className="relative w-20">
                                <input type="number" value={block.rate * 100} onChange={(e) => updateItBlock(i, 'rate', Number(e.target.value)/100)} className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-sm outline-none focus:border-emerald-500 text-right pr-6" />
                                <span className="absolute right-2 top-1.5 text-slate-500 text-sm">%</span>
                              </div>
                              <input type="number" value={block.openingWdv} onChange={(e) => updateItBlock(i, 'openingWdv', Number(e.target.value))} className="w-28 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-sm outline-none focus:border-emerald-500 text-right" placeholder="Opening WDV" />
                              
                              <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-[11px] text-slate-400">
                                <input
                                  type="checkbox"
                                  checked={!!block.isAllAssetsSold}
                                  onChange={(e) => updateItBlock(i, 'isAllAssetsSold', e.target.checked)}
                                  className="rounded border-slate-700 bg-slate-950 accent-emerald-500 w-3 h-3 cursor-pointer"
                                  title="Flag block as empty / all assets sold or scrapped"
                                />
                                <span className="select-none cursor-pointer" onClick={() => updateItBlock(i, 'isAllAssetsSold', !block.isAllAssetsSold)}>Empty</span>
                              </div>

                              <button onClick={() => removeItBlock(i)} className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded"><Trash2 className="w-4 h-4"/></button>
                            </div>
                          ))}
                        </div>
                        
                        <div className="mt-8 bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4">
                          <h4 className="text-sm font-bold text-emerald-400 mb-3 flex items-center gap-2"><Calculator className="w-4 h-4" /> Section 50 Calculated Results</h4>
                          <div className="space-y-3">
                            {itData.blockResults.map((r: any, i: number) => (
                              <div key={i} className="border-b border-white/5 pb-2 last:border-0 last:pb-0">
                                <div className="flex justify-between text-sm">
                                  <span className="text-slate-300 font-semibold truncate w-48">{r.block}</span>
                                  <span className="text-slate-500">{r.rateStr}</span>
                                  <span className="font-mono text-emerald-300">₹{r.dep.toLocaleString('en-IN', {maximumFractionDigits:0})}</span>
                                </div>
                                {(r.stcg > 0 || r.stcl > 0) && (
                                  <div className="flex justify-end gap-2 mt-1">
                                    {r.stcg > 0 && (
                                      <span className="text-[10px] font-bold text-yellow-500 bg-yellow-500/10 px-2 py-0.5 rounded border border-yellow-500/20">
                                        STCG (Gain): ₹{r.stcg.toLocaleString('en-IN', {maximumFractionDigits:0})}
                                      </span>
                                    )}
                                    {r.stcl > 0 && (
                                      <span className="text-[10px] font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                                        STCL (Loss): ₹{r.stcl.toLocaleString('en-IN', {maximumFractionDigits:0})}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            ))}
                            
                            <div className="border-t border-emerald-500/20 pt-2 space-y-1">
                              <div className="flex justify-between font-bold text-emerald-400 text-sm">
                                <span>Total IT Depreciation</span>
                                <span>₹{totalItDep.toLocaleString('en-IN', {maximumFractionDigits:0})}</span>
                              </div>
                              {itData.totals.totalStcg > 0 && (
                                <div className="flex justify-between text-xs text-yellow-500 font-semibold">
                                  <span>Total Short-Term Capital Gains</span>
                                  <span>₹{itData.totals.totalStcg.toLocaleString('en-IN', {maximumFractionDigits:0})}</span>
                                </div>
                              )}
                              {itData.totals.totalStcl > 0 && (
                                <div className="flex justify-between text-xs text-rose-400 font-semibold">
                                  <span>Total Short-Term Capital Losses</span>
                                  <span>₹{itData.totals.totalStcl.toLocaleString('en-IN', {maximumFractionDigits:0})}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      {/* Right: Asset Mapping */}
                      <div>
                        <h3 className="text-white font-semibold mb-4 flex items-center gap-2">Asset Mapping <span className="text-xs font-normal text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">{tallyAssets.length} Assets</span></h3>
                        <div className="overflow-hidden border border-white/5 rounded-xl bg-slate-950/50">
                          <div className="max-h-[400px] overflow-y-auto p-2 space-y-2">
                            {tallyAssets.map((asset, i) => (
                              <div key={i} className="flex flex-col gap-1 p-2 bg-slate-900/50 rounded-lg">
                                <div className="flex justify-between text-sm">
                                  <span className="font-medium text-slate-200">{asset.ledgerName}</span>
                                  <span className="text-xs text-slate-500">{asset.parentGroup}</span>
                                </div>
                                <select
                                  value={assetBlockMapping[asset.ledgerName] || ''}
                                  onChange={(e) => setAssetBlockMapping(prev => ({ ...prev, [asset.ledgerName]: e.target.value }))}
                                  className={`w-full text-sm bg-slate-950 border rounded px-2 py-1 outline-none transition-colors ${assetBlockMapping[asset.ledgerName] ? 'border-emerald-500/50 text-emerald-400' : 'border-slate-800 text-slate-500'}`}
                                >
                                  <option value="">-- Select IT Block --</option>
                                  {itBlocks.map((b, idx) => (
                                    <option key={idx} value={b.blockName}>{b.blockName} ({b.rate*100}%)</option>
                                  ))}
                                </select>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {activeTab === 'variance' && (
                  <motion.div key="variance" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                    <div className="max-w-2xl mx-auto py-8">
                      <div className="bg-slate-950/80 border border-white/5 rounded-3xl p-8 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/10 blur-[80px] rounded-full pointer-events-none"></div>
                        <div className="absolute bottom-0 left-0 w-64 h-64 bg-cyan-500/10 blur-[80px] rounded-full pointer-events-none"></div>
                        
                        <h2 className="text-2xl font-black text-center mb-8 bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">Variance Dashboard</h2>
                        
                        <div className="space-y-6 relative z-10">
                          <div className="flex justify-between items-center p-4 bg-slate-900/80 rounded-xl border border-slate-800">
                            <div>
                              <p className="text-slate-400 text-sm font-medium">Companies Act Depreciation</p>
                              <p className="text-xs text-slate-500">As per Schedule II</p>
                            </div>
                            <span className="text-2xl font-bold text-cyan-400 font-mono">₹{totalCompDep.toLocaleString('en-IN', {maximumFractionDigits:0})}</span>
                          </div>
                          
                          <div className="flex justify-between items-center p-4 bg-slate-900/80 rounded-xl border border-slate-800">
                            <div>
                              <p className="text-slate-400 text-sm font-medium">Income Tax Depreciation</p>
                              <p className="text-xs text-slate-500">As per Section 32</p>
                            </div>
                            <span className="text-2xl font-bold text-emerald-400 font-mono">₹{totalItDep.toLocaleString('en-IN', {maximumFractionDigits:0})}</span>
                          </div>
                          
                          <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-700 to-transparent my-4"></div>
                          
                          <div className={`flex justify-between items-center p-5 rounded-xl border ${dtaDtl > 0 ? 'bg-green-500/10 border-green-500/30' : (dtaDtl < 0 ? 'bg-red-500/10 border-red-500/30' : 'bg-slate-800 border-slate-700')}`}>
                            <div>
                              <p className="text-white font-bold text-lg">{dtaDtlType}</p>
                              <p className="text-xs opacity-70">Impact on Financials</p>
                            </div>
                            <span className={`text-3xl font-black font-mono ${dtaDtl > 0 ? 'text-green-400' : (dtaDtl < 0 ? 'text-red-400' : 'text-slate-400')}`}>
                              {dtaDtl < 0 ? '-' : ''}₹{Math.abs(dtaDtl).toLocaleString('en-IN', {maximumFractionDigits:0})}
                            </span>
                          </div>
                        </div>
                        
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}

      </div>
      {/* Lucide icon component to fix undeclared component errors if any */}
      <CloudDownload className="hidden" />
    </div>
  );
}

const CloudDownload = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M12 13v8"/><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="m8 17 4 4 4-4"/></svg>
);
