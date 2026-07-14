import React, { useState, useMemo, useEffect } from 'react';
import { 
    FileSpreadsheet, ArrowLeft, Loader2, Download, Zap, 
    AlertTriangle, Server, Wifi, WifiOff, RefreshCw, CheckCircle2, 
    Settings, Info, TrendingUp, TrendingDown, DollarSign, Calculator 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { toast } from 'sonner';
import { 
    fetchFixedAssetsFromTally, 
    pingTally, 
    fetchCompanyInfo, 
    type TallyFixedAsset, 
    type TallyFixedAssetAdditions 
} from '@/lib/tallyApi';
import * as XLSX from 'xlsx-js-style';

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
    if (n.includes('BUILDING') || n.includes('LAND & BUILDING')) return 'building_nonres_rcc';
    if (n.includes('FENCE') || n.includes('WELL') || n.includes('TUBEWELL')) return 'building_fence';
    if (n.includes('TEMPORARY') || n.includes('WOODEN')) return 'building_temporary';
    if (n.includes('ROAD') && (n.includes('RCC') || n.includes('CONCRETE'))) return 'road_rcc';
    if (n.includes('ROAD')) return 'road_other';

    if (n.includes('FURNITURE') && (n.includes('HOTEL') || n.includes('SCHOOL') || n.includes('REST'))) return 'furniture_hotel';
    if (n.includes('FITTING') || n.includes('ELECTRICAL')) return 'electrical_fittings';
    if (n.includes('FURNITURE') || n.includes('FIXTURE')) return 'furniture_general';

    if (n.includes('SERVER') || n.includes('NETWORK')) return 'computer_servers';
    if (n.includes('SOFTWARE')) return 'computer_software';
    if (n.includes('COMPUTER') || n.includes('LAPTOP') || n.includes('DESKTOP') || n.includes('PRINTER') || n.includes('MONITOR')) return 'computer_device';

    if (n.includes('BIKE') || n.includes('SCOOTER') || n.includes('CYCLE') || n.includes('MOTORCYCLE')) return 'vehicle_bike';
    if (n.includes('TAXI') || n.includes('BUS') || n.includes('HIRE') || n.includes('CAB')) return 'vehicle_hire';
    if (n.includes('TRUCK') || n.includes('LORRY') || n.includes('TEMPO') || n.includes('HEAVY') || n.includes('CARRIER')) return 'vehicle_heavy';
    if (n.includes('AERO') || n.includes('PLANE') || n.includes('AIRCRAFT')) return 'vehicle_aero';
    if (n.includes('CAR') || n.includes('VEHICLE')) return 'vehicle_car';

    if (n.includes('EARTH') || n.includes('DIGGER') || n.includes('EXCAVATOR') || n.includes('CRANE') || n.includes('CONSTRUCTION')) return 'machinery_civil';
    if (n.includes('TOWER') || n.includes('CABLE') || n.includes('TELECOM') || n.includes('FIBER')) return 'machinery_telecom';
    if (n.includes('PHARMA') || n.includes('CHEMICAL') || n.includes('REACTOR')) return 'machinery_pharma';
    if (n.includes('REFINERY') || n.includes('PETRO')) return 'machinery_refinery';
    if (n.includes('POWER') || n.includes('TURBINE') || n.includes('GENERATOR')) return 'machinery_power';
    if (n.includes('STEEL') || n.includes('FOUNDRY')) return 'machinery_steel';

    if (n.includes('CONTINUOUS') || n.includes('PROCESS')) return 'machinery_continuous';
    if (n.includes('MOULD') || n.includes('MOLD')) return 'machinery_moulds';
    if (n.includes('LIFE') || n.includes('SURGICAL') || n.includes('MEDICAL') || n.includes('CLINIC') || n.includes('XRAY')) return 'machinery_lifesaving';
    if (n.includes('WIND') || n.includes('SOLAR') || n.includes('RENEW') || n.includes('PHOTOVOLT')) return 'machinery_renewable';
    if (n.includes('POLLUTION') || n.includes('SCRUBBER') || n.includes('FILTER')) return 'machinery_pollution';
    if (n.includes('BOOK') || n.includes('LIBRARY') || n.includes('JOURNAL')) return 'machinery_books';

    if (n.includes('PATENT') || n.includes('TRADEMARK') || n.includes('BRAND') || n.includes('COPYRIGHT') || n.includes('LICENSE')) return 'intangible_amortized';
    if (n.includes('GOODWILL')) return 'intangible_goodwill';

    return 'machinery_general'; // Default fallback
}

interface ProcessedAsset {
    id: string;
    name: string;
    parentGroup: string;
    categoryKey: string;
    openingBalance: number;
    closingBalance: number;
    additions: { date: string; amount: number; isLessThan180: boolean }[];
    deletions: number;
    
    // Companies Act calculations
    compAnnualRate: number; // WDV or SLM
    compDepr: number;
    compClosingWDV: number;

    // IT Act calculations
    itWdvRate: number;
    itDepr: number;
    itClosingWDV: number;

    // Variance
    variance: number;
    deferredTaxImpact: number;
    type: 'DTA' | 'DTL' | 'NIL';
}

const MOCK_ASSETS: TallyFixedAsset[] = [
    {
        name: 'HDFC Office Building RCC',
        parentGroup: 'Buildings',
        openingBalance: 12000000,
        closingBalance: 12000000,
        additions: []
    },
    {
        name: 'MacBook Pro Lab (10 Units)',
        parentGroup: 'Computers',
        openingBalance: 600000,
        closingBalance: 1050000,
        additions: [
            { date: '2024-06-12', voucherNo: 'JRN/09', voucherType: 'Journal', amount: 450000, type: 'Addition', narration: 'Purchased 3 new Macs for research lab' }
        ]
    },
    {
        name: 'Lenovo ThinkPad additions',
        parentGroup: 'Computers',
        openingBalance: 0,
        closingBalance: 280000,
        additions: [
            { date: '2024-11-15', voucherNo: 'JRN/42', voucherType: 'Journal', amount: 280000, type: 'Addition', narration: 'Purchased laptops for new recruits (Mid-year additions)' }
        ]
    },
    {
        name: 'CNC Milling Machine Model-X',
        parentGroup: 'Plant & Machinery',
        openingBalance: 3200000,
        closingBalance: 3200000,
        additions: []
    },
    {
        name: 'Executive Boardroom Furniture',
        parentGroup: 'Furniture & Fittings',
        openingBalance: 400000,
        closingBalance: 485000,
        additions: [
            { date: '2024-10-10', voucherNo: 'JRN/22', voucherType: 'Journal', amount: 85000, type: 'Addition', narration: 'Added ergonomic chairs to boardroom' }
        ]
    },
    {
        name: 'Solar Power Installation',
        parentGroup: 'Plant & Machinery',
        openingBalance: 1800000,
        closingBalance: 1800000,
        additions: []
    },
    {
        name: 'Sales Force CRM Customization License',
        parentGroup: 'Intangible Assets',
        openingBalance: 350000,
        closingBalance: 350000,
        additions: []
    }
];

export default function DepreciationAuditor({
    onBack,
    tallyPort = 9000,
    companyName = '',
    connectionStatus = 'disconnected',
    setTallyPort,
    setCompanyName,
    setConnectionStatus
}: {
    onBack: () => void;
    tallyPort?: number;
    companyName?: string;
    connectionStatus?: 'disconnected' | 'connecting' | 'connected' | 'error';
    setTallyPort: (port: number) => void;
    setCompanyName: (name: string) => void;
    setConnectionStatus: (status: 'disconnected' | 'connecting' | 'connected' | 'error') => void;
}) {
    const [fromDate, setFromDate] = useState('2024-04-01');
    const [toDate, setToDate] = useState('2025-03-31');
    const [entityType, setEntityType] = useState<'company' | 'individual'>('company');
    const [compActMethod, setCompActMethod] = useState<'SLM' | 'WDV'>('WDV');
    const [taxRate, setTaxRate] = useState(25);
    const [residualValuePct, setResidualValuePct] = useState(5);
    
    const [isLoading, setIsLoading] = useState(false);
    const [isDemoData, setIsDemoData] = useState(true);
    const [assets, setAssets] = useState<TallyFixedAsset[]>(MOCK_ASSETS);
    const [userCategoryMappings, setUserCategoryMappings] = useState<Record<string, string>>({});

    const handleRunAnalysis = async () => {
        setIsLoading(true);
        setIsDemoData(false);
        toast.info('Fetching Fixed Asset ledgers and transactions from Tally...');

        const config = { host: 'localhost', port: tallyPort, company: companyName };

        try {
            const fetched = await fetchFixedAssetsFromTally(fromDate, toDate, config);
            if (fetched.length === 0) {
                toast.warning('No Fixed Asset ledgers found in Tally', { description: 'Reverting to simulation mode.' });
                setAssets(MOCK_ASSETS);
                setIsDemoData(true);
            } else {
                setAssets(fetched);
                toast.success('Successfully loaded Fixed Assets from Tally!');
            }
        } catch (error: any) {
            toast.error('Sync Failed', { description: error.message });
            setAssets(MOCK_ASSETS);
            setIsDemoData(true);
        } finally {
            setIsLoading(false);
        }
    };

    const triggerTallySync = async () => {
        setConnectionStatus('connecting');
        try {
            const config = { host: 'localhost', port: tallyPort };
            const alive = await pingTally(config);
            if (!alive) {
                setConnectionStatus('error');
                toast.error('Cannot reach Tally', { description: `TallyPrime not responding on port ${tallyPort}.` });
                return;
            }
            const info = await fetchCompanyInfo(config);
            setCompanyName(info.name);
            setConnectionStatus('connected');
            toast.success(`Connected to Tally Prime: ${info.name}`);

            setIsLoading(true);
            const fetched = await fetchFixedAssetsFromTally(fromDate, toDate, config);
            if (fetched && fetched.length > 0) {
                setAssets(fetched);
                setIsDemoData(false);
                toast.success('Synced Fixed Asset ledgers successfully!');
            } else {
                toast.info('No Fixed Asset ledgers found in synced company.', { description: 'Running in simulation mode.' });
                setAssets(MOCK_ASSETS);
                setIsDemoData(true);
            }
            setIsLoading(false);
        } catch (e: any) {
            setConnectionStatus('error');
            toast.error('Connection failed', { description: String(e) });
            setIsLoading(false);
        }
    };

    const handleMappingChange = (assetName: string, categoryKey: string) => {
        setUserCategoryMappings(prev => ({
            ...prev,
            [assetName]: categoryKey
        }));
    };

    const processedAssets: ProcessedAsset[] = useMemo(() => {
        return assets.map((asset, idx) => {
            const mappedKey = userCategoryMappings[asset.name] || guessCategoryFromLedgerName(asset.name);
            const rule = ASSET_CATEGORY_RULES.find(r => r.key === mappedKey) || ASSET_CATEGORY_RULES[0];
            
            const openingBalance = asset.openingBalance;
            const closingBalance = asset.closingBalance;

            // Separate additions and deletions
            const additionsList: { date: string; amount: number; isLessThan180: boolean }[] = [];
            let totalDeletions = 0;

            asset.additions.forEach(tx => {
                if (tx.type === 'Addition') {
                    // Check 180 day rule
                    const purchaseDate = new Date(tx.date);
                    const fiscalEnd = new Date(toDate);
                    const diffTime = fiscalEnd.getTime() - purchaseDate.getTime();
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // inclusive of purchase date
                    const isLessThan180 = diffDays < 180;

                    additionsList.push({
                        date: tx.date,
                        amount: tx.amount,
                        isLessThan180
                    });
                } else if (tx.type === 'Deletion') {
                    totalDeletions += tx.amount;
                }
            });

            // 1. Companies Act depreciation calculation
            const life = rule.companiesUsefulLife;
            let compRate = 0;
            let compDepr = 0;

            if (entityType === 'company' && life > 0) {
                if (compActMethod === 'WDV') {
                    // WDV rate = 1 - (residualPct / 100)^(1/life)
                    compRate = 1 - Math.pow(residualValuePct / 100, 1 / life);
                } else {
                    // SLM rate = (1 - residualPct / 100) / life
                    compRate = (1 - residualValuePct / 100) / life;
                }

                // Compute Depr on Opening Balance (pro-rata full year, capped to avoid going past residual)
                const deprOnOpening = Math.max(0, (openingBalance - totalDeletions) * compRate);
                compDepr += deprOnOpening;

                // Compute Depr on Additions (pro-rata from addition date)
                additionsList.forEach(add => {
                    const purchaseDate = new Date(add.date);
                    const fiscalEnd = new Date(toDate);
                    const diffTime = fiscalEnd.getTime() - purchaseDate.getTime();
                    const activeDays = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1);
                    const fraction = Math.min(1, activeDays / 365);
                    compDepr += add.amount * compRate * fraction;
                });
            }

            const compClosingWDV = entityType === 'company'
                ? Math.max(0, openingBalance + additionsList.reduce((acc, a) => acc + a.amount, 0) - totalDeletions - compDepr)
                : 0;

            // 2. Income Tax Act WDV block depreciation
            const itWdvRate = rule.itWdvRate;
            let itDepr = 0;
            let rowStcg = 0;
            let rowStcl = 0;

            if (itWdvRate > 0) {
                const totalCost = openingBalance + additionsList.reduce((acc, a) => acc + a.amount, 0);
                const blockBase = totalCost - totalDeletions;
                
                if (blockBase < 0) {
                    rowStcg = Math.abs(blockBase);
                    itDepr = 0;
                } else if (closingBalance <= 0 && totalCost > 0) {
                    // Fully sold/retired ledger (Scenario C)
                    rowStcl = blockBase;
                    itDepr = 0;
                } else {
                    // Scenario A: Normal block calculations
                    let baseForFullDep = openingBalance - totalDeletions;
                    let baseForHalfDep = 0;
                    
                    additionsList.forEach(add => {
                        if (add.isLessThan180) {
                            baseForHalfDep += add.amount;
                        } else {
                            baseForFullDep += add.amount;
                        }
                    });
                    
                    if (baseForFullDep < 0) {
                        baseForHalfDep += baseForFullDep;
                        baseForFullDep = 0;
                    }
                    if (baseForHalfDep < 0) {
                        baseForHalfDep = 0;
                    }
                    
                    itDepr = (baseForFullDep * (itWdvRate / 100)) + (baseForHalfDep * (itWdvRate / 100) * 0.5);
                }
            }

            const itClosingWDV = Math.max(0, openingBalance + additionsList.reduce((acc, a) => acc + a.amount, 0) - totalDeletions - itDepr);

            // 3. Deferred Tax Analysis
            const variance = entityType === 'company' ? compDepr - itDepr : 0;
            const deferredTaxImpact = entityType === 'company' ? Math.abs(variance) * (taxRate / 100) : 0;
            const type = entityType === 'company'
                ? (variance > 0.01 ? 'DTA' : (variance < -0.01 ? 'DTL' : 'NIL'))
                : 'NIL';

            return {
                id: `${idx}-${asset.name}`,
                name: asset.name,
                parentGroup: asset.parentGroup,
                categoryKey: rule.key,
                openingBalance,
                closingBalance,
                additions: additionsList,
                deletions: totalDeletions,
                compAnnualRate: compRate * 100,
                compDepr: parseFloat(compDepr.toFixed(2)),
                compClosingWDV: parseFloat(compClosingWDV.toFixed(2)),
                itWdvRate,
                itDepr: parseFloat(itDepr.toFixed(2)),
                itClosingWDV: parseFloat(itClosingWDV.toFixed(2)),
                variance: parseFloat(variance.toFixed(2)),
                deferredTaxImpact: parseFloat(deferredTaxImpact.toFixed(2)),
                type
            };
        });
    }, [assets, userCategoryMappings, compActMethod, taxRate, residualValuePct, toDate, entityType]);

    // Aggregate statistics
    const totals = useMemo(() => {
        let totalOpening = 0;
        let totalAdditions = 0;
        let totalDeletions = 0;
        let totalCompDepr = 0;
        let totalItDepr = 0;
        let totalDta = 0;
        let totalDtl = 0;

        processedAssets.forEach(a => {
            totalOpening += a.openingBalance;
            totalAdditions += a.additions.reduce((sum, item) => sum + item.amount, 0);
            totalDeletions += a.deletions;
            totalCompDepr += a.compDepr;
            totalItDepr += a.itDepr;
            if (a.type === 'DTA') totalDta += a.deferredTaxImpact;
            if (a.type === 'DTL') totalDtl += a.deferredTaxImpact;
        });

        const netTaxImpact = totalCompDepr - totalItDepr;
        const netDtaVal = netTaxImpact * (taxRate / 100);

        return {
            totalOpening,
            totalAdditions,
            totalDeletions,
            totalCompDepr,
            totalItDepr,
            totalDta,
            totalDtl,
            netTaxImpact,
            netDtaVal
        };
    }, [processedAssets, taxRate]);

    const chartData = useMemo(() => {
        return processedAssets.slice(0, 7).map(a => {
            const dataPoint: any = {
                name: a.name.length > 18 ? a.name.slice(0, 15) + '...' : a.name,
                'Income Tax Act': a.itDepr
            };
            if (entityType === 'company') {
                dataPoint['Companies Act'] = a.compDepr;
            }
            return dataPoint;
        });
    }, [processedAssets, entityType]);

    // XLSX Style Exporter
    const exportDepreciationReport = () => {
        if (processedAssets.length === 0) {
            toast.warning('No asset data to export');
            return;
        }

        const wb = XLSX.utils.book_new();

        // 1. Executive Summary Sheet
        const summaryRows = [
            ["Fixed Asset Dual Depreciation Audit Report"],
            [`Evaluation Period: ${fromDate} to ${toDate}`],
            [`Companies Act Method: ${compActMethod} | Corporate Tax Rate: ${taxRate}%`],
            [],
            ["Summary Metrics", "Value"],
            ["Total Opening WDV", totals.totalOpening],
            ["Total Additions during Year", totals.totalAdditions],
            ["Total Disposals during Year", totals.totalDeletions],
            ["Total Companies Act Depreciation", totals.totalCompDepr],
            ["Total Income Tax WDV Depreciation", totals.totalItDepr],
            ["Depreciation Variance (Companies - IT)", totals.netTaxImpact],
            [totals.netTaxImpact > 0 ? "Deferred Tax Asset Created" : "Deferred Tax Liability Created", Math.abs(totals.netDtaVal)]
        ];

        const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
        
        const titleStyle = { font: { name: "Inter", sz: 14, bold: true }, alignment: { horizontal: "left" } };
        const headerStyle = { font: { name: "Inter", sz: 10, bold: true }, fill: { fgColor: { rgb: "F1F5F9" } }, border: { bottom: { style: "thin" } } };
        
        wsSummary["A1"].s = titleStyle;
        wsSummary["A5"].s = headerStyle;
        wsSummary["B5"].s = headerStyle;

        XLSX.utils.book_append_sheet(wb, wsSummary, "Executive Summary");

        // 2. Asset Comparison Register
        const registerHeaders = [
            "Asset Ledger Name", "Tally Group", "Category Mapping", "Opening Balance", 
            "Additions", "Deletions", "Comp Act Rate (%)", "Comp Act Depr", "Comp Closing WDV",
            "IT Act Rate (%)", "IT Act Depr", "IT Closing WDV", "Depr Variance", "Deferred Tax Impact", "Type"
        ];

        const registerRows = [
            ["Fixed Asset Comparison Register (Schedule II vs Appendix I)"],
            [],
            registerHeaders
        ];

        processedAssets.forEach(a => {
            const rule = ASSET_CATEGORY_RULES.find(r => r.key === a.categoryKey);
            registerRows.push([
                a.name,
                a.parentGroup,
                rule ? rule.label : 'General',
                a.openingBalance,
                a.additions.reduce((sum, item) => sum + item.amount, 0),
                a.deletions,
                a.compAnnualRate,
                a.compDepr,
                a.compClosingWDV,
                a.itWdvRate,
                a.itDepr,
                a.itClosingWDV,
                a.variance,
                a.deferredTaxImpact,
                a.type
            ]);
        });

        const wsRegister = XLSX.utils.aoa_to_sheet(registerRows);
        wsRegister["A1"].s = titleStyle;

        for (let c = 0; c < registerHeaders.length; c++) {
            const cellRef = XLSX.utils.encode_cell({ r: 2, c });
            if (wsRegister[cellRef]) wsRegister[cellRef].s = headerStyle;
        }

        wsRegister["!cols"] = [
            { wch: 25 }, { wch: 15 }, { wch: 25 }, { wch: 15 }, { wch: 12 },
            { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 12 },
            { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 10 }
        ];

        XLSX.utils.book_append_sheet(wb, wsRegister, "Depreciation Comparison");

        const filename = `${companyName.replace(/\s+/g, '_')}_Dual_Depreciation_Audit_Report.xlsx`;
        XLSX.writeFile(wb, filename);
        toast.success("Excel report exported successfully!");
    };

    return (
        <div className="p-4 sm:p-6 space-y-6 text-slate-200 bg-slate-950 min-h-screen font-sans">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="outline" size="icon" onClick={onBack} className="bg-slate-900 border-slate-800 hover:bg-slate-800">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-black flex items-center gap-2 tracking-wide uppercase">
                            <Calculator className="text-rose-500 fill-rose-500/20" /> Fixed Assets Depreciation Auditor
                        </h1>
                        <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 mt-1">
                            <p className="text-xs text-slate-400">
                                Dual-compliance depreciation comparative engine matching Companies Act Schedule II and Income Tax Appendix I.
                            </p>
                            <div className="flex items-center gap-2 md:border-l md:border-slate-800 md:pl-4">
                                <span className={`w-2 h-2 rounded-full ${connectionStatus === 'connected' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                                <span className="text-[10px] uppercase font-black tracking-widest text-slate-500">
                                    {connectionStatus === 'connected' 
                                        ? `Tally: ${companyName} (Port: ${tallyPort})` 
                                        : `Tally Offline (Port: ${tallyPort})`
                                    }
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Tally Live Connection Panel */}
            <Card className="bg-slate-900/60 border-slate-800 shadow-2xl">
                <CardContent className="p-4 flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center justify-center">
                            <Server className="w-5 h-5 text-rose-450" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold uppercase tracking-wider text-white">Tally ERP 9 / Prime Live Connector</h3>
                            <p className="text-xs text-slate-400 mt-0.5">
                                {connectionStatus === 'connected' 
                                    ? `Linked with active entity: ${companyName || 'Synced Company'}` 
                                    : 'Connect to Tally Prime XML port to scan live Fixed Asset ledgers'
                                }
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 w-full md:w-auto">
                        <div className="flex items-center gap-2 bg-slate-950 border border-slate-850 px-3 py-1.5 rounded-lg w-full md:w-40">
                            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Port</span>
                            <input
                                type="number"
                                value={tallyPort}
                                onChange={(e) => setTallyPort(Number(e.target.value))}
                                className="bg-transparent border-none text-xs text-white outline-none w-full font-mono text-right"
                            />
                        </div>
                        <Button 
                            onClick={triggerTallySync} 
                            disabled={connectionStatus === 'connecting'} 
                            className="bg-slate-800 hover:bg-slate-700 border border-slate-700/80 text-white text-xs font-semibold h-[34px] px-4 flex items-center gap-2 w-full md:w-auto"
                        >
                            {connectionStatus === 'connecting' ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : connectionStatus === 'connected' ? (
                                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                                <WifiOff className="w-3.5 h-3.5 text-rose-400" />
                            )}
                            {connectionStatus === 'connected' ? 'Connected' : 'Connect'}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Configurations & Filters */}
            <Card className="bg-slate-900/60 border-slate-800 shadow-2xl">
                <CardContent className="p-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-7 gap-4 items-end">
                    <div>
                        <label className="text-[10px] uppercase font-black tracking-widest text-slate-400 font-sans">Entity Type</label>
                        <Select value={entityType} onValueChange={(v) => setEntityType(v as 'company' | 'individual')}>
                            <SelectTrigger className="bg-slate-950 border-slate-800 text-white mt-1">
                                <SelectValue placeholder="Entity Type" />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-800 text-slate-200 font-sans">
                                <SelectItem value="company">Company / LLP</SelectItem>
                                <SelectItem value="individual">Individual / Firm / Proprietorship</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <label className="text-[10px] uppercase font-black tracking-widest text-slate-400">Companies Act Method</label>
                        <Select value={compActMethod} onValueChange={(v) => setCompActMethod(v as 'SLM' | 'WDV')}>
                            <SelectTrigger className="bg-slate-950 border-slate-800 text-white mt-1">
                                <SelectValue placeholder="Method" />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-800 text-slate-200 font-sans">
                                <SelectItem value="WDV">Written Down Value (WDV)</SelectItem>
                                <SelectItem value="SLM">Straight Line Method (SLM)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <label className="text-[10px] uppercase font-black tracking-widest text-slate-400">Corporate Tax Rate (%)</label>
                        <Input type="number" value={taxRate} onChange={e => setTaxRate(parseFloat(e.target.value) || 0)} className="bg-slate-950 border-slate-800 text-white mt-1" />
                    </div>
                    <div>
                        <label className="text-[10px] uppercase font-black tracking-widest text-slate-400">Salvage Value Factor (%)</label>
                        <Input type="number" value={residualValuePct} onChange={e => setResidualValuePct(parseFloat(e.target.value) || 0)} className="bg-slate-950 border-slate-800 text-white mt-1" />
                    </div>
                    <div>
                        <label className="text-[10px] uppercase font-black tracking-widest text-slate-400">Books From</label>
                        <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="bg-slate-950 border-slate-800 text-white mt-1" />
                    </div>
                    <div>
                        <label className="text-[10px] uppercase font-black tracking-widest text-slate-400">Books To</label>
                        <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="bg-slate-950 border-slate-800 text-white mt-1" />
                    </div>
                    <Button onClick={handleRunAnalysis} disabled={isLoading} className="w-full bg-rose-600 hover:bg-rose-500 font-bold transition-all text-xs uppercase tracking-wide h-[36px]">
                        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
                        Scan FA Ledgers
                    </Button>
                </CardContent>
            </Card>

            {/* Aggregate Statistics Row */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="bg-slate-900/40 border-slate-800/80 p-5 flex items-center justify-between shadow-xl">
                    <div className="space-y-1">
                        <span className="text-[9px] uppercase font-black tracking-wider text-slate-400">Total FA Additions</span>
                        <h3 className="text-2xl font-black text-white font-mono">₹{totals.totalAdditions.toLocaleString('en-IN')}</h3>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 border border-indigo-500/20">
                        <DollarSign className="w-5 h-5" />
                    </div>
                </Card>

                <Card className="bg-slate-900/40 border-slate-800/80 p-5 flex items-center justify-between shadow-xl">
                    <div className="space-y-1">
                        <span className="text-[9px] uppercase font-black tracking-wider text-slate-400">Companies Act Depr</span>
                        <h3 className="text-2xl font-black text-slate-300 font-mono">
                            {entityType === 'company' 
                                ? `₹${totals.totalCompDepr.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` 
                                : 'N/A'
                            }
                        </h3>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 border border-blue-500/20">
                        <Calculator className="w-5 h-5" />
                    </div>
                </Card>

                <Card className="bg-slate-900/40 border-slate-800/80 p-5 flex items-center justify-between shadow-xl">
                    <div className="space-y-1">
                        <span className="text-[9px] uppercase font-black tracking-wider text-slate-400">Income Tax Depr</span>
                        <h3 className="text-2xl font-black text-rose-400 font-mono">₹{totals.totalItDepr.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</h3>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-455 border border-rose-500/20">
                        <Zap className="w-5 h-5" />
                    </div>
                </Card>

                <Card className={`p-5 flex items-center justify-between shadow-xl border ${entityType === 'individual' ? 'bg-slate-900/40 border-slate-800' : totals.netTaxImpact > 0 ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-rose-500/5 border-rose-500/20'}`}>
                    <div className="space-y-1">
                        <span className="text-[9px] uppercase font-black tracking-wider text-slate-400">
                            {entityType === 'individual' ? 'DTA / DTL Estimator' : totals.netTaxImpact > 0 ? 'Deferred Tax Asset (DTA)' : 'Deferred Tax Liability (DTL)'}
                        </span>
                        <h3 className={`text-2xl font-black font-mono ${entityType === 'individual' ? 'text-slate-500' : totals.netTaxImpact > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {entityType === 'individual' ? 'N/A' : `₹${Math.abs(totals.netDtaVal).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
                        </h3>
                    </div>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${entityType === 'individual' ? 'bg-slate-800 text-slate-650 border-slate-700/30' : totals.netTaxImpact > 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
                        {entityType === 'individual' ? <Calculator className="w-5 h-5" /> : totals.netTaxImpact > 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                    </div>
                </Card>
            </div>

            {/* Dashboard Comparison Visuals & Action Bar */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* Recharts Depreciation Chart */}
                <Card className="lg:col-span-3 bg-slate-900/60 border-slate-800 shadow-2xl p-5 space-y-4">
                    <div className="flex justify-between items-center border-b border-slate-850 pb-3">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-1.5 font-sans">
                            <TrendingUp className="w-4 h-4 text-rose-500" /> Depreciation Cost Comparison (Schedule II vs WDV)
                        </h3>
                    </div>
                    <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b/60" />
                                <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 9 }} />
                                <YAxis stroke="#64748b" tick={{ fontSize: 9 }} />
                                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc', fontSize: 11 }} />
                                <Legend wrapperStyle={{ fontSize: 11 }} />
                                {entityType === 'company' && (
                                    <Bar dataKey="Companies Act" fill="#3b82f6" name="Companies Act (Schedule II)" barSize={16} radius={[2, 2, 0, 0]} />
                                )}
                                <Bar dataKey="Income Tax Act" fill="#ec4899" name="Income Tax Act (Block WDV)" barSize={16} radius={[2, 2, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </Card>

                {/* Info and Checklist Notes */}
                <Card className="lg:col-span-2 bg-slate-900/60 border-slate-800 shadow-2xl p-5 flex flex-col justify-between">
                    <div>
                        <div className="flex items-center gap-2 border-b border-slate-850 pb-3 mb-4">
                            <Info className="w-4 h-4 text-rose-455" />
                            <h3 className="text-sm font-bold uppercase tracking-wider text-white">Dual-Compliance Checklist</h3>
                        </div>
                        <ul className="space-y-3.5 text-xs text-slate-400 font-sans">
                            <li className="flex gap-2">
                                <span className="font-bold text-rose-400">1.</span>
                                <div>
                                    <strong className="text-slate-200 font-sans">Block WDV vs Component Accounting:</strong> The IT Act groups assets into blocks. Under Companies Act, verify if critical components have been capitalized separately.
                                </div>
                            </li>
                            <li className="flex gap-2">
                                <span className="font-bold text-rose-400">2.</span>
                                <div>
                                    <strong className="text-slate-200 font-sans">180-Day Rule Audit:</strong> Assets added on or after **October 4th** receive 50% block depreciation under Income Tax regulations.
                                </div>
                            </li>
                            <li className="flex gap-2">
                                <span className="font-bold text-rose-400">3.</span>
                                <div>
                                    <strong className="text-slate-200 font-sans">Salvage Value Cap:</strong> Residual salvage values should typically not exceed 5% of cost under Companies Act by default.
                                </div>
                            </li>
                        </ul>
                    </div>
                    <Button onClick={exportDepreciationReport} className="w-full bg-emerald-600 hover:bg-emerald-500 font-bold transition-all text-xs uppercase tracking-wide mt-6 h-9">
                        <FileSpreadsheet className="w-4 h-4 mr-2" /> Export Dual Depreciation Book
                    </Button>
                </Card>
            </div>

            {/* Assets Comparison Grid Table */}
            <Card className="bg-slate-900/60 border-slate-800 shadow-2xl">
                <CardHeader className="flex flex-row items-center justify-between border-b border-slate-800/60 pb-4">
                    <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2 font-sans">
                        <Calculator className="w-4 h-4 text-rose-400" /> Asset Depreciation Register
                    </CardTitle>
                    {isDemoData && (
                        <span className="px-2.5 py-1 rounded bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 text-[10px] font-black uppercase tracking-wider animate-pulse">
                            Simulation Mode
                        </span>
                    )}
                </CardHeader>
                <CardContent className="pt-4">
                    <div className="overflow-x-auto">
                        <Table className="w-full text-left text-xs border-collapse">
                            <TableHeader className="bg-slate-950 text-slate-400 font-bold uppercase tracking-wider font-sans">
                                <TableRow className="hover:bg-transparent border-slate-850">
                                    <TableHead>Asset Ledger Name</TableHead>
                                    <TableHead>Category Mappings</TableHead>
                                    <TableHead className="text-right font-sans">Opening Balance</TableHead>
                                    <TableHead className="text-right font-sans">Additions (Qty/Amt)</TableHead>
                                    <TableHead className="text-right font-sans">Co. Act Rate</TableHead>
                                    <TableHead className="text-right font-sans">Co. Act Depr</TableHead>
                                    <TableHead className="text-right font-sans">IT Act Rate</TableHead>
                                    <TableHead className="text-right font-sans">IT Act Depr</TableHead>
                                    <TableHead className="text-right font-sans">Variance</TableHead>
                                    <TableHead className="text-center font-sans">Tax Effect</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody className="divide-y divide-slate-850/60 font-sans">
                                {processedAssets.map((asset) => (
                                    <TableRow key={asset.id} className="hover:bg-slate-900/30 border-slate-850">
                                        <TableCell className="font-semibold text-slate-200">{asset.name}</TableCell>
                                        <TableCell className="min-w-[180px]">
                                            <Select value={asset.categoryKey} onValueChange={(v) => handleMappingChange(asset.name, v)}>
                                                <SelectTrigger className="bg-slate-950 border-slate-850 text-slate-300 h-7 text-[11px] font-sans">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent className="bg-slate-900 border-slate-855 text-slate-200 max-h-56 font-sans">
                                                    {ASSET_CATEGORY_RULES.map(rule => (
                                                        <SelectItem key={rule.key} value={rule.key} className="text-xs">
                                                            {rule.label}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </TableCell>
                                        <TableCell className="text-right font-mono text-slate-350">₹{asset.openingBalance.toLocaleString('en-IN')}</TableCell>
                                        <TableCell className="text-right">
                                            {asset.additions.length > 0 ? (
                                                <div className="space-y-1">
                                                    {asset.additions.map((add, i) => (
                                                        <div key={i} className="text-[10px] text-slate-300 font-sans">
                                                            <span className="font-mono font-semibold">₹{add.amount.toLocaleString('en-IN')}</span>
                                                            <span className={`ml-1.5 px-1 py-0.2 rounded text-[8px] font-black uppercase tracking-wider ${add.isLessThan180 ? 'bg-amber-500/10 border border-amber-500/20 text-amber-400' : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'}`}>
                                                                {add.isLessThan180 ? '< 180 Days' : '>= 180 Days'}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="text-slate-600 font-sans">-</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right font-mono text-slate-400">{entityType === 'company' ? `${asset.compAnnualRate.toFixed(2)}%` : 'N/A'}</TableCell>
                                        <TableCell className="text-right font-mono font-bold text-slate-300">{entityType === 'company' ? `₹${asset.compDepr.toLocaleString('en-IN')}` : 'N/A'}</TableCell>
                                        <TableCell className="text-right font-mono text-slate-400">{asset.itWdvRate}%</TableCell>
                                        <TableCell className="text-right font-mono font-bold text-slate-350">₹{asset.itDepr.toLocaleString('en-IN')}</TableCell>
                                        <TableCell className={`text-right font-mono font-semibold ${entityType === 'individual' ? 'text-slate-650' : asset.variance > 0 ? 'text-blue-400' : (asset.variance < 0 ? 'text-pink-400' : 'text-slate-500')}`}>
                                            {entityType === 'individual' ? 'N/A' : `${asset.variance > 0 ? '+' : ''}₹${asset.variance.toLocaleString('en-IN')}`}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            {entityType === 'individual' ? (
                                                <span className="text-slate-650 font-bold uppercase tracking-wider text-[10px] font-sans">N/A</span>
                                            ) : asset.type !== 'NIL' ? (
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider inline-block ${asset.type === 'DTA' ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' : 'bg-amber-500/10 border border-amber-500/20 text-amber-400'}`}>
                                                    {asset.type}: ₹{asset.deferredTaxImpact.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                                </span>
                                            ) : (
                                                <span className="text-slate-600 font-bold uppercase tracking-wider text-[10px] font-sans">-</span>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
