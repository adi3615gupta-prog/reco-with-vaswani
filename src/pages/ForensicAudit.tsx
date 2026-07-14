import React, { useState, useReducer, useMemo } from 'react';
import { Zap, AlertTriangle, Search, FileText, BarChart2, ArrowLeft, Loader2, Download, ShieldCheck, Lock, Wifi, WifiOff, RefreshCw, Server } from 'lucide-react';
import {
    fetchVouchersForForensics,
    fetchLedgerClassifications,
    pingTally,
    fetchCompanyInfo,
    type TallyVoucherType
} from '@/lib/tallyApi';
import {
    detectVoucherNumberGaps,
    applyBenfordsLaw,
    analyzeJournalEntries,
    type ForensicObservation,
    type BenfordAnalysisResult
} from '@/lib/auditEngine';
import { getApiBase, getAuthToken } from '@/lib/api';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const VOUCHER_TYPES: TallyVoucherType[] = ['Sales', 'Purchase', 'Journal', 'Credit Note', 'Debit Note'];

interface ForensicState {
    voucherType: TallyVoucherType;
    fromDate: string;
    toDate: string;
    minAmount: number;
    maxAmountCap: number;
}

type ForensicAction =
    | { type: 'SET_VOUCHER_TYPE'; payload: TallyVoucherType }
    | { type: 'SET_FROM_DATE'; payload: string }
    | { type: 'SET_TO_DATE'; payload: string }
    | { type: 'SET_MIN_AMOUNT'; payload: number }
    | { type: 'SET_MAX_AMOUNT_CAP'; payload: number };

const initialState: ForensicState = {
    voucherType: 'Sales',
    fromDate: '2024-04-01',
    toDate: '2025-03-31',
    minAmount: 0,
    maxAmountCap: 0
};

function reducer(state: ForensicState, action: ForensicAction): ForensicState {
    switch (action.type) {
        case 'SET_VOUCHER_TYPE':
            return { ...state, voucherType: action.payload };
        case 'SET_FROM_DATE':
            return { ...state, fromDate: action.payload };
        case 'SET_TO_DATE':
            return { ...state, toDate: action.payload };
        case 'SET_MIN_AMOUNT':
            return { ...state, minAmount: action.payload };
        case 'SET_MAX_AMOUNT_CAP':
            return { ...state, maxAmountCap: action.payload };
        default:
            return state;
    }
}

export default function ForensicAudit({ 
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
    const [state, dispatch] = useReducer(reducer, initialState);
    const [isLoading, setIsLoading] = useState(false);

    const connectToTally = async () => {
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
            toast.success('Connected to Tally!');
        } catch (err) {
            setConnectionStatus('error');
            toast.error('Connection failed', { description: String(err) });
        }
    };

    // Raw datasets stored in state
    const [rawVouchers, setRawVouchers] = useState<any[]>([]);
    const [rawDetailedAmounts, setRawDetailedAmounts] = useState<number[]>([]);

    // Ledger Classifications cached in state
    const [revenueLedgers, setRevenueLedgers] = useState<string[]>([]);
    const [expenseLedgers, setExpenseLedgers] = useState<string[]>([]);

    // Table sorting configs
    const [gapSort, setGapSort] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
    const [journalSort, setJournalSort] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

    const handleRunAnalysis = async () => {
        setIsLoading(true);
        setRawVouchers([]);
        setRawDetailedAmounts([]);
        toast.info(`Fetching data for '${state.voucherType}' vouchers...`);

        const config = { host: 'localhost', port: tallyPort, company: companyName };

        try {
            // Log audit trail
            try {
                const username = localStorage.getItem('np_username') || 'Unknown';
                await fetch(`${getApiBase()}/audit`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${getAuthToken()}`
                    },
                    body: JSON.stringify({
                        action: `Forensic audit analysis triggered`,
                        details: `User ${username} ran forensic analysis on ${state.voucherType} vouchers for period ${state.fromDate} to ${state.toDate}.`
                    })
                });
            } catch (err) {
                console.error("Failed to log forensic audit trail:", err);
            }

            // 1. Check & Fetch Ledger Classifications if Journal
            if (state.voucherType === 'Journal' && revenueLedgers.length === 0) {
                toast.info('Fetching ledger group structures...');
                const classifications = await fetchLedgerClassifications(config);
                setRevenueLedgers(classifications.revenueLedgers);
                setExpenseLedgers(classifications.expenseLedgers);
            }

            // 2. Fetch data for Gap Detection & Journal Analysis
            const forensicVouchers = await fetchVouchersForForensics(state.voucherType, state.fromDate, state.toDate, config);
            setRawVouchers(forensicVouchers);

            // 3. Extract amounts for Benford's Law (already fetched in forensicVouchers!)
            if (forensicVouchers.length > 0) {
                const amounts = forensicVouchers.map(v => v.amount);
                setRawDetailedAmounts(amounts);
            }

            toast.success('Forensic analysis complete!');
        } catch (error: any) {
            toast.error('Analysis Failed', { description: error.message });
        } finally {
            setIsLoading(false);
        }
    };

    // Advanced memoized observations
    const gapResults = useMemo(() => {
        // Apply minimum amount filter if applicable
        const filtered = state.minAmount > 0
            ? rawVouchers.filter(v => v.amount === 0 || v.amount >= state.minAmount)
            : rawVouchers;
        return detectVoucherNumberGaps(filtered);
    }, [rawVouchers, state.minAmount]);

    const benfordAnalysis = useMemo(() => {
        return applyBenfordsLaw(rawDetailedAmounts, state.maxAmountCap);
    }, [rawDetailedAmounts, state.maxAmountCap]);

    const journalResults = useMemo(() => {
        if (state.voucherType !== 'Journal') return [];
        const filtered = state.minAmount > 0
            ? rawVouchers.filter(v => v.amount === undefined || v.amount >= state.minAmount)
            : rawVouchers;
        return analyzeJournalEntries(filtered, revenueLedgers, expenseLedgers);
    }, [rawVouchers, state.voucherType, revenueLedgers, expenseLedgers, state.minAmount]);

    // Sorting Helper
    const getSortedData = (data: any[], config: { key: string; direction: 'asc' | 'desc' } | null) => {
        if (!config || !config.key) return data;
        const sorted = [...data];
        sorted.sort((a, b) => {
            let aVal = a[config.key];
            let bVal = b[config.key];
            
            if (config.key === 'severity') {
                const map: Record<string, number> = { High: 3, Medium: 2, Low: 1 };
                aVal = map[aVal] || 0;
                bVal = map[bVal] || 0;
            }

            if (aVal === undefined) return 1;
            if (bVal === undefined) return -1;
            if (aVal < bVal) return config.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return config.direction === 'asc' ? 1 : -1;
            return 0;
        });
        return sorted;
    };

    const sortedGapResults = useMemo(() => getSortedData(gapResults, gapSort), [gapResults, gapSort]);
    const sortedJournalResults = useMemo(() => getSortedData(journalResults, journalSort), [journalResults, journalSort]);

    const requestSort = (type: 'gap' | 'journal', key: string) => {
        const setSort = type === 'gap' ? setGapSort : setJournalSort;
        const currentSort = type === 'gap' ? gapSort : journalSort;
        let direction: 'asc' | 'desc' = 'asc';
        if (currentSort && currentSort.key === key && currentSort.direction === 'asc') {
            direction = 'desc';
        }
        setSort({ key, direction });
    };

    // CSV Exporter
    const exportToCSV = (data: any[], headers: string[], filename: string) => {
        if (data.length === 0) {
            toast.warning('No data available to export');
            return;
        }
        const csvRows = [headers.join(',')];
        for (const row of data) {
            const values = headers.map(header => {
                const val = row[header] !== undefined ? row[header] : '';
                // Escape commas and double quotes
                const escaped = ('' + val).replace(/"/g, '""');
                return `"${escaped}"`;
            });
            csvRows.push(values.join(','));
        }
        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `${filename}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success(`Exported ${filename}.csv successfully!`);
    };

    const getSeverityClass = (severity: 'High' | 'Medium' | 'Low') => {
        switch (severity) {
            case 'High': return 'text-rose-500 font-bold bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20';
            case 'Medium': return 'text-amber-500 font-bold bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20';
            case 'Low': return 'text-blue-500 font-bold bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20';
            default: return '';
        }
    };

    const getConformityClass = (conformity: string) => {
        if (conformity.includes('Close') || conformity.includes('Acceptable')) {
            return 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20';
        }
        if (conformity.includes('Marginally')) {
            return 'bg-amber-500/15 text-amber-400 border border-amber-500/20';
        }
        if (conformity.includes('Nonconformity')) {
            return 'bg-rose-500/15 text-rose-400 border border-rose-500/20';
        }
        return 'bg-slate-800 text-slate-400 border border-slate-700';
    };

    return (
        <div className="p-4 sm:p-6 space-y-6 text-slate-200 bg-slate-950 min-h-screen font-sans">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="outline" size="icon" onClick={onBack} className="bg-slate-900 border-slate-800 hover:bg-slate-800">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-black flex items-center gap-2 tracking-wide uppercase">
                            <Zap className="text-rose-500 fill-rose-500/20" /> Data Integrity &amp; Forensic Audit
                        </h1>
                        <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 mt-1">
                            <p className="text-xs text-slate-400">
                                Programmatic risk identification, statistical digit checking, and voucher numbering gap tracer.
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
                                    ? `Linked with active entity: ${companyName}` 
                                    : 'Connect to Tally Prime XML port to scan live ledger books'
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
                            onClick={connectToTally} 
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

            <Card className="bg-slate-900/60 border-slate-800 shadow-2xl">
                <CardContent className="p-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 items-end">
                    <div>
                        <label className="text-[10px] uppercase font-black tracking-widest text-slate-400">Voucher Type</label>
                        <Select value={state.voucherType} onValueChange={(v) => dispatch({ type: 'SET_VOUCHER_TYPE', payload: v as TallyVoucherType })}>
                            <SelectTrigger className="bg-slate-950 border-slate-800 text-white mt-1">
                                <SelectValue placeholder="Select voucher type" />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                                {VOUCHER_TYPES.map(vt => <SelectItem key={vt} value={vt}>{vt}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <label className="text-[10px] uppercase font-black tracking-widest text-slate-400">From Date</label>
                        <Input type="date" value={state.fromDate} onChange={e => dispatch({ type: 'SET_FROM_DATE', payload: e.target.value })} className="bg-slate-950 border-slate-800 text-white mt-1" />
                    </div>
                    <div>
                        <label className="text-[10px] uppercase font-black tracking-widest text-slate-400">To Date</label>
                        <Input type="date" value={state.toDate} onChange={e => dispatch({ type: 'SET_TO_DATE', payload: e.target.value })} className="bg-slate-950 border-slate-800 text-white mt-1" />
                    </div>
                    <div>
                        <label className="text-[10px] uppercase font-black tracking-widest text-slate-400">Min Amt Filter (₹)</label>
                        <Input type="number" placeholder="e.g. 5000" value={state.minAmount || ''} onChange={e => dispatch({ type: 'SET_MIN_AMOUNT', payload: parseFloat(e.target.value) || 0 })} className="bg-slate-950 border-slate-800 text-white mt-1" />
                    </div>
                    <Button onClick={handleRunAnalysis} disabled={isLoading} className="w-full bg-rose-600 hover:bg-rose-500 font-bold transition-all text-xs uppercase tracking-wide">
                        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
                        Run Analysis
                    </Button>
                </CardContent>
            </Card>

            {/* Results Section */}
            <div className="space-y-6">
                {/* Voucher Gap Detection Results */}
                <Card className="bg-slate-900/60 border-slate-800 shadow-2xl">
                    <CardHeader className="flex flex-row items-center justify-between border-b border-slate-800/60 pb-4">
                        <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
                            <Search className="w-4 h-4 text-rose-400" /> Voucher Numbering Gaps
                        </CardTitle>
                        {gapResults.length > 0 && (
                            <Button size="sm" variant="outline" onClick={() => exportToCSV(gapResults, ['voucherNumber', 'date', 'type', 'severity', 'description', 'recommendation'], 'voucher_numbering_gaps')} className="text-[10px] px-2.5 py-1 bg-slate-950 hover:bg-slate-850 text-slate-300 border-slate-800">
                                <Download className="w-3.5 h-3.5 mr-1" /> Export CSV
                            </Button>
                        )}
                    </CardHeader>
                    <CardContent className="pt-4">
                        {sortedGapResults.length > 0 ? (
                            <div className="overflow-x-auto">
                                <Table className="w-full text-left text-xs border-collapse">
                                    <TableHeader className="bg-slate-950 text-slate-400 font-bold uppercase tracking-wider">
                                        <TableRow className="hover:bg-transparent border-slate-850">
                                            <TableHead onClick={() => requestSort('gap', 'voucherNumber')} className="cursor-pointer hover:text-white transition-colors">Voucher No.</TableHead>
                                            <TableHead onClick={() => requestSort('gap', 'severity')} className="cursor-pointer hover:text-white transition-colors">Severity</TableHead>
                                            <TableHead onClick={() => requestSort('gap', 'description')} className="cursor-pointer hover:text-white transition-colors">Description</TableHead>
                                            <TableHead onClick={() => requestSort('gap', 'recommendation')} className="cursor-pointer hover:text-white transition-colors">Recommendation</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody className="divide-y divide-slate-850/60">
                                        {sortedGapResults.map((obs, i) => (
                                            <TableRow key={i} className="hover:bg-slate-900/30 border-slate-850">
                                                <TableCell className="font-semibold text-slate-300">{obs.voucherNumber || 'N/A'}</TableCell>
                                                <TableCell><span className={getSeverityClass(obs.severity)}>{obs.severity}</span></TableCell>
                                                <TableCell className="max-w-md leading-relaxed text-slate-400">{obs.description}</TableCell>
                                                <TableCell className="max-w-md leading-relaxed text-slate-400">{obs.recommendation}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        ) : <p className="text-xs text-slate-500 py-3 text-center">No voucher gaps found or analysis not run.</p>}
                    </CardContent>
                </Card>

                {/* Benford's Law Analysis Results */}
                <Card className="bg-slate-900/60 border-slate-800 shadow-2xl">
                    <CardHeader className="flex flex-row items-center justify-between border-b border-slate-800/60 pb-4">
                        <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
                            <BarChart2 className="w-4 h-4 text-rose-400" /> Benford's Law Statistical Check
                        </CardTitle>
                        <div className="flex items-center gap-3">
                            {benfordAnalysis.results.length > 0 && (
                                <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${getConformityClass(benfordAnalysis.conformity)}`}>
                                    {benfordAnalysis.conformity}
                                </span>
                            )}
                            {benfordAnalysis.results.length > 0 && (
                                <Button size="sm" variant="outline" onClick={() => exportToCSV(benfordAnalysis.results, ['digit', 'actualCount', 'actualPercentage', 'benfordPercentage', 'difference', 'isAnomaly'], 'benfords_law_statistics')} className="text-[10px] px-2.5 py-1 bg-slate-950 hover:bg-slate-850 text-slate-300 border-slate-800">
                                    <Download className="w-3.5 h-3.5 mr-1" /> Export CSV
                                </Button>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent className="pt-5 grid grid-cols-1 lg:grid-cols-5 gap-6">
                        {benfordAnalysis.results.length > 0 ? (
                            <>
                                <div className="lg:col-span-3 h-80 bg-slate-950/40 p-4 border border-slate-850 rounded-xl relative">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <ComposedChart data={benfordAnalysis.results} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b/60" />
                                            <XAxis dataKey="digit" stroke="#64748b" tick={{ fontSize: 10 }} label={{ value: 'First Digit', position: 'insideBottom', offset: -5, fill: '#64748b', fontSize: 10 }} />
                                            <YAxis unit="%" stroke="#64748b" tick={{ fontSize: 10 }} label={{ value: 'Frequency', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 10 }} />
                                            <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc', fontSize: 11 }} formatter={(value: any) => typeof value === 'number' ? `${value.toFixed(2)}%` : value} />
                                            <Legend wrapperStyle={{ fontSize: 11 }} />
                                            <Bar dataKey="actualPercentage" fill="#3b82f6" name="Actual Frequency" barSize={25} radius={[2, 2, 0, 0]} />
                                            <Line type="monotone" dataKey="benfordPercentage" stroke="#f43f5e" strokeWidth={2.5} strokeDasharray="5 5" name="Benford Expected" dot={{ r: 4, stroke: '#f43f5e', fill: '#0f172a', strokeWidth: 2 }} />
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="lg:col-span-2 overflow-x-auto">
                                    <div className="flex justify-between items-center bg-slate-950 p-3 rounded-lg border border-slate-850 mb-3">
                                        <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Computed MAD Value:</span>
                                        <span className="font-mono text-xs font-bold text-slate-200">{benfordAnalysis.mad}</span>
                                    </div>
                                    <Table className="w-full text-left text-xs border-collapse">
                                        <TableHeader className="bg-slate-950 text-slate-400 font-bold uppercase tracking-wider">
                                            <TableRow className="hover:bg-transparent border-slate-850">
                                                <TableHead>Digit</TableHead>
                                                <TableHead>Actual %</TableHead>
                                                <TableHead>Expected %</TableHead>
                                                <TableHead>Difference</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody className="divide-y divide-slate-850/60">
                                            {benfordAnalysis.results.map((res) => (
                                                <TableRow key={res.digit} className={`hover:bg-slate-900/30 border-slate-850 ${res.isAnomaly ? 'bg-rose-500/5' : ''}`}>
                                                    <TableCell className="font-bold text-slate-300">{res.digit}</TableCell>
                                                    <TableCell className="font-mono">{res.actualPercentage.toFixed(2)}% <span className="text-[10px] text-slate-500">({res.actualCount})</span></TableCell>
                                                    <TableCell className="font-mono text-slate-400">{res.benfordPercentage.toFixed(2)}%</TableCell>
                                                    <TableCell className={`font-mono font-bold ${res.isAnomaly ? 'text-rose-400' : 'text-slate-300'}`}>
                                                        {res.difference > 0 ? '+' : ''}{res.difference.toFixed(2)}%
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </>
                        ) : <p className="text-xs text-slate-500 py-3 text-center col-span-5">No data for Benford's Law analysis or analysis not run.</p>}
                    </CardContent>
                </Card>

                {/* Journal Entry Analysis Results */}
                {state.voucherType === 'Journal' && (
                    <Card className="bg-slate-900/60 border-slate-800 shadow-2xl">
                        <CardHeader className="flex flex-row items-center justify-between border-b border-slate-800/60 pb-4">
                            <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
                                <FileText className="w-4 h-4 text-rose-400" /> Journal Entry Anomalies
                            </CardTitle>
                            {journalResults.length > 0 && (
                                <Button size="sm" variant="outline" onClick={() => exportToCSV(journalResults, ['voucherNumber', 'date', 'partyName', 'amount', 'type', 'severity', 'description', 'recommendation'], 'journal_entry_anomalies')} className="text-[10px] px-2.5 py-1 bg-slate-950 hover:bg-slate-850 text-slate-300 border-slate-800">
                                    <Download className="w-3.5 h-3.5 mr-1" /> Export CSV
                                </Button>
                            )}
                        </CardHeader>
                        <CardContent className="pt-4">
                            {sortedJournalResults.length > 0 ? (
                                <div className="overflow-x-auto">
                                    <Table className="w-full text-left text-xs border-collapse">
                                        <TableHeader className="bg-slate-950 text-slate-400 font-bold uppercase tracking-wider">
                                            <TableRow className="hover:bg-transparent border-slate-850">
                                                <TableHead onClick={() => requestSort('journal', 'date')} className="cursor-pointer hover:text-white transition-colors">Date</TableHead>
                                                <TableHead onClick={() => requestSort('journal', 'voucherNumber')} className="cursor-pointer hover:text-white transition-colors">Voucher No.</TableHead>
                                                <TableHead onClick={() => requestSort('journal', 'partyName')} className="cursor-pointer hover:text-white transition-colors">Party Ledger</TableHead>
                                                <TableHead onClick={() => requestSort('journal', 'amount')} className="cursor-pointer hover:text-white transition-colors">Amount (₹)</TableHead>
                                                <TableHead onClick={() => requestSort('journal', 'severity')} className="cursor-pointer hover:text-white transition-colors">Severity</TableHead>
                                                <TableHead onClick={() => requestSort('journal', 'description')} className="cursor-pointer hover:text-white transition-colors">Anomaly Description</TableHead>
                                                <TableHead>Recommendation</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody className="divide-y divide-slate-850/60">
                                            {sortedJournalResults.map((obs, i) => (
                                                <TableRow key={i} className="hover:bg-slate-900/30 border-slate-850">
                                                    <TableCell className="text-slate-300 font-semibold">{obs.date}</TableCell>
                                                    <TableCell className="text-slate-300 font-semibold">{obs.voucherNumber}</TableCell>
                                                    <TableCell className="text-slate-300 font-semibold max-w-[120px] truncate" title={obs.partyName}>{obs.partyName}</TableCell>
                                                    <TableCell className="font-mono text-slate-300 font-semibold">{obs.amount !== undefined ? obs.amount.toLocaleString('en-IN') : '-'}</TableCell>
                                                    <TableCell><span className={getSeverityClass(obs.severity)}>{obs.severity}</span></TableCell>
                                                    <TableCell className="max-w-xs leading-relaxed text-slate-400">{obs.description}</TableCell>
                                                    <TableCell className="max-w-xs leading-relaxed text-slate-400">{obs.recommendation}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            ) : <p className="text-xs text-slate-500 py-3 text-center">No journal anomalies found or analysis not run.</p>}
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}