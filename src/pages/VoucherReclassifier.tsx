import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, RefreshCw, Search, CheckSquare, Square, ChevronRight,
  AlertTriangle, CheckCircle2, Loader2, ArrowRightLeft, Zap,
  Download, Eye, X, Building2
} from 'lucide-react';
import { toast } from 'sonner';
import {
  sendTallyRequest,
  fetchCompanyInfo,
  pingTally,
  type TallyConnectionConfig,
} from '@/lib/tallyApi';

/* ─── Types ───────────────────────────────────────────────────── */

interface TallyLedger {
  name: string;
  parent: string;
  closingBalance: number;
}

interface TallyVoucherEntry {
  guid: string;
  date: string;
  voucherNumber: string;
  voucherTypeName: string;
  narration: string;
  amount: number;
  counterLedger: string;
}

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

const DEFAULT_CONFIG: TallyConnectionConfig = { host: 'localhost', port: 9000 };

/* ─── Tally XML Builders ──────────────────────────────────────── */

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function buildLedgerListXml(): string {
  return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>VRCLedgerList</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="VRCLedgerList">
            <TYPE>Ledger</TYPE>
            <FETCH>Name, Parent, ClosingBalance</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
}

function unescapeXml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function buildVouchersForLedgerXml(ledgerName: string, fromDate: string, toDate: string): string {
  return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>VRCVouchersForLedger</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVFROMDATE>${fromDate}</SVFROMDATE>
        <SVTODATE>${toDate}</SVTODATE>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="VRCVouchersForLedger">
            <TYPE>Voucher</TYPE>
            <FETCH>GUID, Date, VoucherNumber, VoucherTypeName, Narration, Amount, PartyLedgerName, AllLedgerEntries.*</FETCH>
            <FILTER>VRCNotCancelled</FILTER>
          </COLLECTION>
          <SYSTEM TYPE="FORMULAS" NAME="VRCNotCancelled">
            NOT $IsCancelled AND NOT $IsOptional
          </SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
}

function buildAlterVoucherXml(
  guid: string,
  voucherType: string,
  date: string,
  oldLedger: string,
  newLedger: string,
  amount: number
): string {
  return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Import</TALLYREQUEST>
    <TYPE>Data</TYPE>
    <ID>VRCAlterVoucher</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVCURRENTCOMPANY/>
      </STATICVARIABLES>
    </DESC>
    <DATA>
      <TALLYMESSAGE>
        <VOUCHER REMOTEID="${escapeXml(guid)}" VCHTYPE="${escapeXml(voucherType)}" ACTION="Alter">
          <GUID>${escapeXml(guid)}</GUID>
          <DATE>${date}</DATE>
          <ALLLEDGERENTRIES.LIST>
            <OLDAUDITENTRYIDS.LIST TYPE="Number">
              <OLDAUDITENTRYIDS>-1</OLDAUDITENTRYIDS>
            </OLDAUDITENTRYIDS.LIST>
            <OLDLEDGERNAME>${escapeXml(oldLedger)}</OLDLEDGERNAME>
            <LEDGERNAME>${escapeXml(newLedger)}</LEDGERNAME>
          </ALLLEDGERENTRIES.LIST>
        </VOUCHER>
      </TALLYMESSAGE>
    </DATA>
  </BODY>
</ENVELOPE>`;
}

/* ─── Parsers ─────────────────────────────────────────────────── */

function parseLedgerList(xml: string): TallyLedger[] {
  const ledgers: TallyLedger[] = [];
  const regex = /<LEDGER\b[^>]*>([\s\S]*?)<\/LEDGER>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    const block = match[1];
    const name = (block.match(/<NAME>([^<]*)<\/NAME>/i) || [])[1]?.trim() || '';
    const parent = (block.match(/<PARENT>([^<]*)<\/PARENT>/i) || [])[1]?.trim() || '';
    const bal = parseFloat((block.match(/<CLOSINGBALANCE>([^<]*)<\/CLOSINGBALANCE>/i) || [])[1] || '0') || 0;
    if (name) ledgers.push({ name: unescapeXml(name), parent: unescapeXml(parent), closingBalance: bal });
  }
  return ledgers;
}

function parseVoucherEntries(xml: string, sourceLedger: string): TallyVoucherEntry[] {
  const entries: TallyVoucherEntry[] = [];
  const cleanSourceLedger = sourceLedger.trim().toLowerCase();

  const regex = /<VOUCHER\b[^>]*>([\s\S]*?)<\/VOUCHER>/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(xml)) !== null) {
    const block = match[1];

    const guid = (block.match(/<GUID\b[^>]*>([^<]*)<\/GUID>/i) || [])[1]?.trim() || '';
    const rawDate = (block.match(/<DATE\b[^>]*>([^<]*)<\/DATE>/i) || [])[1]?.trim() || '';
    const voucherNumber = unescapeXml((block.match(/<VOUCHERNUMBER\b[^>]*>([^<]*)<\/VOUCHERNUMBER>/i) || [])[1]?.trim() || '');
    const voucherTypeName = unescapeXml((block.match(/<VOUCHERTYPENAME\b[^>]*>([^<]*)<\/VOUCHERTYPENAME>/i) || [])[1]?.trim() || '');
    const rawNarration = (block.match(/<NARRATION\b[^>]*>([\s\S]*?)<\/NARRATION>/i) || [])[1] || '';
    const narration = unescapeXml(rawNarration.replace(/<[^>]+>/g, '').trim());

    // Parse all ledger entry lines in this voucher
    const leRegex = /<(?:ALLLEDGERENTRIES|LEDGERENTRIES)\.LIST\b[^>]*>([\s\S]*?)<\/(?:ALLLEDGERENTRIES|LEDGERENTRIES)\.LIST>/gi;
    let leMatch: RegExpExecArray | null;

    let hasSourceLedger = false;
    let sourceAmount = 0;
    const counterLedgersSet = new Set<string>();

    while ((leMatch = leRegex.exec(block)) !== null) {
      const leBlock = leMatch[1];
      const lNameRaw = (leBlock.match(/<LEDGERNAME\b[^>]*>([^<]*)<\/LEDGERNAME>/i) || [])[1]?.trim() || '';
      const lName = unescapeXml(lNameRaw);
      const amtStr = (leBlock.match(/<AMOUNT\b[^>]*>([^<]*)<\/AMOUNT>/i) || [])[1] || '0';
      const amt = Math.abs(parseFloat(amtStr) || 0);

      if (lName.toLowerCase() === cleanSourceLedger) {
        hasSourceLedger = true;
        if (amt > 0) sourceAmount = amt;
      } else if (lName) {
        counterLedgersSet.add(lName);
      }
    }

    // STRICT FILTER: Discard any voucher that doesn't actually contain the source ledger!
    if (!hasSourceLedger) continue;

    // Fallback amount if line amount was zero
    if (sourceAmount === 0) {
      const topAmtStr = (block.match(/<AMOUNT\b[^>]*>([^<]*)<\/AMOUNT>/i) || [])[1] || '0';
      sourceAmount = Math.abs(parseFloat(topAmtStr) || 0);
    }

    // Format date as DD/MM/YYYY
    let date = rawDate;
    if (/^\d{8}$/.test(rawDate)) {
      date = `${rawDate.slice(6, 8)}/${rawDate.slice(4, 6)}/${rawDate.slice(0, 4)}`;
    }

    const counterLedger = Array.from(counterLedgersSet).join(', ');

    if (guid || voucherNumber) {
      entries.push({
        guid,
        date: date || '—',
        voucherNumber: voucherNumber || '—',
        voucherTypeName: voucherTypeName || '—',
        narration: narration || '—',
        amount: sourceAmount,
        counterLedger: counterLedger || '—',
      });
    }
  }

  return entries;
}

/* ─── Component ───────────────────────────────────────────────── */

interface Props {
  onBack: () => void;
}

export default function VoucherReclassifier({ onBack }: Props) {
  // Connection
  const [connStatus, setConnStatus] = useState<ConnectionStatus>('disconnected');
  const [companyName, setCompanyName] = useState('');

  // Ledger lists
  const [allLedgers, setAllLedgers] = useState<TallyLedger[]>([]);
  const [sourceLedger, setSourceLedger] = useState('');
  const [targetLedger, setTargetLedger] = useState('');
  const [sourceLedgerSearch, setSourceLedgerSearch] = useState('');
  const [targetLedgerSearch, setTargetLedgerSearch] = useState('');

  // Date range
  const [fromDate, setFromDate] = useState('20250401');
  const [toDate, setToDate] = useState('20260331');

  // Voucher entries
  const [vouchers, setVouchers] = useState<TallyVoucherEntry[]>([]);
  const [selectedGuids, setSelectedGuids] = useState<Set<string>>(new Set());
  const [loadingVouchers, setLoadingVouchers] = useState(false);
  const [voucherSearch, setVoucherSearch] = useState('');

  // Processing
  const [processing, setProcessing] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [results, setResults] = useState<{ guid: string; success: boolean; message: string }[]>([]);
  const [showResults, setShowResults] = useState(false);

  /* ── Connect to Tally (uses existing proxy-aware sendTallyRequest) ── */
  const connectToTally = useCallback(async () => {
    setConnStatus('connecting');
    try {
      const alive = await pingTally(DEFAULT_CONFIG);
      if (!alive) throw new Error('Ping failed');

      const compInfo = await fetchCompanyInfo(DEFAULT_CONFIG);
      setCompanyName(compInfo.name);

      // Fetch all ledgers via the proxy-aware sendTallyRequest
      const ledgerResp = await sendTallyRequest(buildLedgerListXml(), DEFAULT_CONFIG, 15000);
      const parsed = parseLedgerList(ledgerResp);
      setAllLedgers(parsed);
      setConnStatus('connected');
      toast.success(`Connected to "${compInfo.name}" — ${parsed.length} ledgers loaded`);
    } catch (err) {
      setConnStatus('error');
      toast.error('Cannot connect to Tally. Ensure TallyPrime is running on port 9000.');
      console.error('[VRC] Connection error:', err);
    }
  }, []);

  useEffect(() => {
    connectToTally();
  }, [connectToTally]);

  /* ── Fetch Vouchers ───────────────────────────────────── */
  const fetchVouchers = useCallback(async () => {
    if (!sourceLedger) {
      toast.error('Select a source ledger first');
      return;
    }
    setLoadingVouchers(true);
    setVouchers([]);
    setSelectedGuids(new Set());
    try {
      const xml = buildVouchersForLedgerXml(sourceLedger, fromDate, toDate);
      const resp = await sendTallyRequest(xml, DEFAULT_CONFIG, 30000);
      const parsed = parseVoucherEntries(resp, sourceLedger);
      setVouchers(parsed);
      if (parsed.length === 0) {
        toast.info('No vouchers found for this ledger in the selected period.');
      } else {
        toast.success(`Found ${parsed.length} voucher(s) for "${sourceLedger}"`);
      }
    } catch (err) {
      toast.error('Failed to fetch vouchers from Tally.');
      console.error('[VRC] Fetch error:', err);
    }
    setLoadingVouchers(false);
  }, [sourceLedger, fromDate, toDate]);

  /* ── Selection helpers ────────────────────────────────── */
  const toggleSelect = (guid: string) => {
    setSelectedGuids(prev => {
      const next = new Set(prev);
      if (next.has(guid)) next.delete(guid);
      else next.add(guid);
      return next;
    });
  };

  const filteredVouchers = useMemo(() => {
    if (!voucherSearch.trim()) return vouchers;
    const q = voucherSearch.toLowerCase();
    return vouchers.filter(v =>
      v.voucherNumber.toLowerCase().includes(q) ||
      v.narration.toLowerCase().includes(q) ||
      v.counterLedger.toLowerCase().includes(q) ||
      v.date.includes(q)
    );
  }, [vouchers, voucherSearch]);

  const toggleSelectAll = () => {
    if (selectedGuids.size === filteredVouchers.length) {
      setSelectedGuids(new Set());
    } else {
      setSelectedGuids(new Set(filteredVouchers.map(v => v.guid)));
    }
  };

  /* ── Filtered ledger lists ────────────────────────────── */
  const filteredSourceLedgers = useMemo(() => {
    if (!sourceLedgerSearch.trim()) return allLedgers;
    const q = sourceLedgerSearch.toLowerCase();
    return allLedgers.filter(l => l.name.toLowerCase().includes(q) || l.parent.toLowerCase().includes(q));
  }, [allLedgers, sourceLedgerSearch]);

  const filteredTargetLedgers = useMemo(() => {
    if (!targetLedgerSearch.trim()) return allLedgers;
    const q = targetLedgerSearch.toLowerCase();
    return allLedgers.filter(l => l.name.toLowerCase().includes(q) || l.parent.toLowerCase().includes(q));
  }, [allLedgers, targetLedgerSearch]);

  /* ── Apply reclassification ───────────────────────────── */
  const applyReclassification = useCallback(async () => {
    if (selectedGuids.size === 0) {
      toast.error('No vouchers selected');
      return;
    }
    if (!targetLedger) {
      toast.error('Select a target ledger');
      return;
    }
    if (targetLedger === sourceLedger) {
      toast.error('Target ledger cannot be the same as source');
      return;
    }

    setProcessing(true);
    setProcessedCount(0);
    setResults([]);
    setShowResults(false);

    const selectedVouchers = vouchers.filter(v => selectedGuids.has(v.guid));
    const batchResults: { guid: string; success: boolean; message: string }[] = [];

    for (let i = 0; i < selectedVouchers.length; i++) {
      const v = selectedVouchers[i];
      try {
        const rawDate = v.date.includes('/') ? v.date.split('/').reverse().join('') : v.date;
        const alterXml = buildAlterVoucherXml(
          v.guid,
          v.voucherTypeName,
          rawDate,
          sourceLedger,
          targetLedger,
          v.amount
        );
        const resp = await sendTallyRequest(alterXml, DEFAULT_CONFIG, 10000);
        const hasError = resp.includes('LINEERROR') || resp.includes('ERROR') || resp.includes('error');
        batchResults.push({
          guid: v.guid,
          success: !hasError,
          message: hasError ? 'Tally reported an error during alteration' : 'Successfully reclassified'
        });
      } catch (err) {
        batchResults.push({
          guid: v.guid,
          success: false,
          message: 'Network error: could not reach Tally'
        });
      }
      setProcessedCount(i + 1);
    }

    setResults(batchResults);
    setShowResults(true);
    setProcessing(false);

    const successCount = batchResults.filter(r => r.success).length;
    const failCount = batchResults.filter(r => !r.success).length;

    if (failCount === 0) {
      toast.success(`All ${successCount} voucher(s) reclassified successfully!`);
    } else {
      toast.warning(`${successCount} succeeded, ${failCount} failed. Review results.`);
    }
  }, [selectedGuids, vouchers, sourceLedger, targetLedger]);

  /* ── Totals ───────────────────────────────────────────── */
  const selectedTotal = useMemo(() => {
    return vouchers.filter(v => selectedGuids.has(v.guid)).reduce((s, v) => s + v.amount, 0);
  }, [vouchers, selectedGuids]);

  /* ── Render ─────────────────────────────────────────── */
  const statusColors: Record<ConnectionStatus, string> = {
    disconnected: 'text-slate-400 border-slate-600',
    connecting: 'text-amber-400 border-amber-500/40',
    connected: 'text-emerald-400 border-emerald-500/40',
    error: 'text-rose-400 border-rose-500/40',
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-white">
      <style>{`
        .vrc-glass { background: rgba(15, 23, 42, 0.55); backdrop-filter: blur(24px); border: 1px solid rgba(255,255,255,0.06); }
        .vrc-row:hover { background: rgba(99, 102, 241, 0.06); }
        .vrc-selected { background: rgba(99, 102, 241, 0.12) !important; border-left: 3px solid rgba(99, 102, 241, 0.6); }
        .vrc-scrollbar::-webkit-scrollbar { width: 6px; }
        .vrc-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .vrc-scrollbar::-webkit-scrollbar-thumb { background: rgba(100,116,139,0.3); border-radius: 3px; }
      `}</style>

      {/* Header */}
      <div className="sticky top-0 z-50 bg-[#090d16]/90 backdrop-blur-xl border-b border-indigo-500/10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="p-2 rounded-xl bg-slate-800/60 hover:bg-slate-700/80 border border-slate-700 transition-all hover:scale-105">
              <ArrowLeft className="w-4 h-4 text-slate-300" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-indigo-400" />
                <h1 className="text-xl font-black tracking-tight">Voucher Re-classifier</h1>
                <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-[9px] font-black uppercase tracking-widest">Module 1.8</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">Batch reclassify Tally voucher entries from one ledger to another</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {companyName && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/50 border border-slate-700/50">
                <Building2 className="w-3.5 h-3.5 text-indigo-400" />
                <span className="text-xs font-semibold text-slate-300">{companyName}</span>
              </div>
            )}

            {/* Connection Status + Retry Button */}
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border ${statusColors[connStatus]} bg-slate-800/50`}>
              {connStatus === 'connecting' ? <Loader2 className="w-3 h-3 animate-spin" /> : <div className={`w-2 h-2 rounded-full ${connStatus === 'connected' ? 'bg-emerald-400' : connStatus === 'error' ? 'bg-rose-400' : 'bg-slate-500'}`} />}
              <span className="text-[10px] font-bold uppercase tracking-wider">{connStatus}</span>
            </div>

            <button
              onClick={connectToTally}
              disabled={connStatus === 'connecting'}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 text-indigo-400 text-[10px] font-bold uppercase tracking-wider transition-all disabled:opacity-40"
              title="Reconnect to Tally"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${connStatus === 'connecting' ? 'animate-spin' : ''}`} />
              Retry
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">

        {/* Connection Error Banner */}
        {connStatus === 'error' && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3 px-5 py-4 rounded-2xl bg-rose-500/10 border border-rose-500/20">
            <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-bold text-rose-300">Cannot connect to TallyPrime</p>
              <p className="text-xs text-rose-400/70 mt-0.5">Ensure TallyPrime is running on port 9000 with Client/Server mode set to "Both" or "Server". Then click <strong>Retry</strong>.</p>
            </div>
            <button
              onClick={connectToTally}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/40 border border-rose-500/30 text-rose-300 text-xs font-bold transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Retry Connection
            </button>
          </motion.div>
        )}

        {/* Step 1: Source & Target Ledger Selection */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Source Ledger */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="vrc-glass rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
                <span className="text-rose-400 font-black text-sm">S</span>
              </div>
              <div>
                <h3 className="text-sm font-bold">Source Ledger</h3>
                <p className="text-[10px] text-slate-500">Ledger to move entries FROM</p>
              </div>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search ledgers..."
                value={sourceLedgerSearch}
                onChange={e => setSourceLedgerSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-900/60 border border-slate-700/50 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500/50 transition"
              />
            </div>

            <div className="max-h-[200px] overflow-y-auto vrc-scrollbar space-y-1">
              {filteredSourceLedgers.slice(0, 100).map(l => (
                <div
                  key={l.name}
                  onClick={() => setSourceLedger(l.name)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-all text-xs ${
                    sourceLedger === l.name
                      ? 'bg-rose-500/15 border border-rose-500/30 text-rose-300'
                      : 'hover:bg-slate-800/60 text-slate-300'
                  }`}
                >
                  <div className="truncate">
                    <span className="font-semibold">{l.name}</span>
                    <span className="text-slate-500 ml-2">({l.parent})</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 whitespace-nowrap ml-2">
                    ₹{Math.abs(l.closingBalance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
              {allLedgers.length > 0 && filteredSourceLedgers.length === 0 && (
                <p className="text-xs text-slate-500 text-center py-4">No ledgers match your search</p>
              )}
              {allLedgers.length === 0 && (
                <p className="text-xs text-slate-500 text-center py-4">
                  {connStatus === 'connected' ? 'No ledgers loaded' : 'Connect to Tally first'}
                </p>
              )}
            </div>

            {sourceLedger && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20">
                <CheckCircle2 className="w-3.5 h-3.5 text-rose-400" />
                <span className="text-xs font-semibold text-rose-300">{sourceLedger}</span>
              </div>
            )}
          </motion.div>

          {/* Target Ledger */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="vrc-glass rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <span className="text-emerald-400 font-black text-sm">T</span>
              </div>
              <div>
                <h3 className="text-sm font-bold">Target Ledger</h3>
                <p className="text-[10px] text-slate-500">Ledger to move entries TO</p>
              </div>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search ledgers..."
                value={targetLedgerSearch}
                onChange={e => setTargetLedgerSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-900/60 border border-slate-700/50 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/50 transition"
              />
            </div>

            <div className="max-h-[200px] overflow-y-auto vrc-scrollbar space-y-1">
              {filteredTargetLedgers.slice(0, 100).map(l => (
                <div
                  key={l.name}
                  onClick={() => setTargetLedger(l.name)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-all text-xs ${
                    targetLedger === l.name
                      ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                      : 'hover:bg-slate-800/60 text-slate-300'
                  }`}
                >
                  <div className="truncate">
                    <span className="font-semibold">{l.name}</span>
                    <span className="text-slate-500 ml-2">({l.parent})</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 whitespace-nowrap ml-2">
                    ₹{Math.abs(l.closingBalance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
              {allLedgers.length > 0 && filteredTargetLedgers.length === 0 && (
                <p className="text-xs text-slate-500 text-center py-4">No ledgers match your search</p>
              )}
              {allLedgers.length === 0 && (
                <p className="text-xs text-slate-500 text-center py-4">
                  {connStatus === 'connected' ? 'No ledgers loaded' : 'Connect to Tally first'}
                </p>
              )}
            </div>

            {targetLedger && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-xs font-semibold text-emerald-300">{targetLedger}</span>
              </div>
            )}
          </motion.div>
        </div>

        {/* Transfer Arrow */}
        {sourceLedger && targetLedger && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-center gap-4 py-2">
            <div className="px-4 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20">
              <span className="text-xs font-bold text-rose-400">{sourceLedger}</span>
            </div>
            <div className="flex items-center gap-1 text-indigo-400">
              <div className="w-12 h-[2px] bg-gradient-to-r from-rose-500 to-indigo-500 rounded-full" />
              <ArrowRightLeft className="w-5 h-5" />
              <div className="w-12 h-[2px] bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full" />
            </div>
            <div className="px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <span className="text-xs font-bold text-emerald-400">{targetLedger}</span>
            </div>
          </motion.div>
        )}

        {/* Fetch Vouchers Button */}
        {sourceLedger && connStatus === 'connected' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-center gap-4">
            <div className="flex items-center gap-3 bg-slate-800/40 rounded-xl p-2 border border-slate-700/40">
              <label className="text-[10px] text-slate-400 font-bold uppercase">From</label>
              <input
                type="text"
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
                placeholder="YYYYMMDD"
                className="w-24 px-2 py-1.5 rounded-lg bg-slate-900/60 border border-slate-700/50 text-xs text-white text-center focus:outline-none focus:border-indigo-500/50"
              />
              <label className="text-[10px] text-slate-400 font-bold uppercase">To</label>
              <input
                type="text"
                value={toDate}
                onChange={e => setToDate(e.target.value)}
                placeholder="YYYYMMDD"
                className="w-24 px-2 py-1.5 rounded-lg bg-slate-900/60 border border-slate-700/50 text-xs text-white text-center focus:outline-none focus:border-indigo-500/50"
              />
            </div>
            <button
              onClick={fetchVouchers}
              disabled={loadingVouchers}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
            >
              {loadingVouchers ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Fetch Vouchers
            </button>
          </motion.div>
        )}

        {/* Voucher Table */}
        {vouchers.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="vrc-glass rounded-2xl overflow-hidden">
            {/* Table Header */}
            <div className="px-6 py-4 border-b border-slate-700/40 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-bold">Voucher Entries</h3>
                <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-[10px] font-bold">
                  {vouchers.length} found
                </span>
                {selectedGuids.size > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold">
                    {selectedGuids.size} selected • ₹{selectedTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Filter..."
                    value={voucherSearch}
                    onChange={e => setVoucherSearch(e.target.value)}
                    className="pl-7 pr-3 py-1.5 rounded-lg bg-slate-900/60 border border-slate-700/50 text-[11px] text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500/50 w-40"
                  />
                </div>
                <button onClick={toggleSelectAll} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-700/80 border border-slate-700 text-xs text-slate-300 transition-all">
                  {selectedGuids.size === filteredVouchers.length ? <CheckSquare className="w-3.5 h-3.5 text-indigo-400" /> : <Square className="w-3.5 h-3.5" />}
                  {selectedGuids.size === filteredVouchers.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>
            </div>

            {/* Table Body */}
            <div className="max-h-[400px] overflow-y-auto vrc-scrollbar">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-900/90 backdrop-blur-sm">
                  <tr className="text-slate-500 uppercase text-[10px] tracking-wider">
                    <th className="px-4 py-3 text-left w-10"></th>
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Voucher #</th>
                    <th className="px-4 py-3 text-left">Type</th>
                    <th className="px-4 py-3 text-left">Counter Ledger</th>
                    <th className="px-4 py-3 text-left">Narration</th>
                    <th className="px-4 py-3 text-right">Amount (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVouchers.map(v => (
                    <tr
                      key={v.guid}
                      onClick={() => toggleSelect(v.guid)}
                      className={`vrc-row cursor-pointer transition-all border-b border-slate-800/30 ${selectedGuids.has(v.guid) ? 'vrc-selected' : ''}`}
                    >
                      <td className="px-4 py-3">
                        {selectedGuids.has(v.guid)
                          ? <CheckSquare className="w-4 h-4 text-indigo-400" />
                          : <Square className="w-4 h-4 text-slate-600" />
                        }
                      </td>
                      <td className="px-4 py-3 text-slate-300 font-mono">{v.date}</td>
                      <td className="px-4 py-3 text-white font-semibold">{v.voucherNumber}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-md bg-slate-800/60 border border-slate-700/40 text-slate-300 text-[10px]">
                          {v.voucherTypeName}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-300 truncate max-w-[200px]">{v.counterLedger}</td>
                      <td className="px-4 py-3 text-slate-400 truncate max-w-[200px]">{v.narration || '—'}</td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-white">
                        {v.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Action Bar */}
            <div className="px-6 py-4 border-t border-slate-700/40 flex items-center justify-between bg-slate-900/40">
              <div className="text-xs text-slate-400">
                <span className="font-bold text-white">{selectedGuids.size}</span> of {vouchers.length} voucher(s) selected
                {selectedGuids.size > 0 && (
                  <> • Total: <span className="font-bold text-indigo-400">₹{selectedTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowPreview(true)}
                  disabled={selectedGuids.size === 0 || !targetLedger}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-700/80 border border-slate-700 text-xs font-bold text-slate-300 transition-all disabled:opacity-30"
                >
                  <Eye className="w-3.5 h-3.5" /> Preview
                </button>
                <button
                  onClick={applyReclassification}
                  disabled={selectedGuids.size === 0 || !targetLedger || processing}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-black uppercase tracking-wider transition-all hover:scale-105 disabled:opacity-40 disabled:hover:scale-100 shadow-lg shadow-indigo-500/20"
                >
                  {processing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processing {processedCount}/{selectedGuids.size}
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4" />
                      Reclassify {selectedGuids.size} Voucher(s)
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Results Panel */}
        <AnimatePresence>
          {showResults && results.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="vrc-glass rounded-2xl p-6 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Reclassification Results
                </h3>
                <button onClick={() => setShowResults(false)} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
                  <div className="text-2xl font-black text-emerald-400">{results.filter(r => r.success).length}</div>
                  <div className="text-[10px] text-emerald-500 font-bold uppercase">Succeeded</div>
                </div>
                <div className="px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-center">
                  <div className="text-2xl font-black text-rose-400">{results.filter(r => !r.success).length}</div>
                  <div className="text-[10px] text-rose-500 font-bold uppercase">Failed</div>
                </div>
              </div>
              {results.filter(r => !r.success).length > 0 && (
                <div className="space-y-1">
                  {results.filter(r => !r.success).map(r => {
                    const v = vouchers.find(vv => vv.guid === r.guid);
                    return (
                      <div key={r.guid} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-500/5 border border-rose-500/10 text-xs">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
                        <span className="text-rose-300 font-semibold">{v?.voucherNumber || r.guid}</span>
                        <span className="text-rose-400/70">{r.message}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Preview Modal */}
        <AnimatePresence>
          {showPreview && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
              onClick={() => setShowPreview(false)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                onClick={e => e.stopPropagation()}
                className="w-full max-w-2xl vrc-glass rounded-2xl p-6 space-y-4 max-h-[80vh] overflow-y-auto vrc-scrollbar"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold">Preview Reclassification</h3>
                  <button onClick={() => setShowPreview(false)} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-3 py-3 px-4 rounded-xl bg-indigo-500/5 border border-indigo-500/10">
                  <span className="text-xs text-rose-400 font-bold">{sourceLedger}</span>
                  <ArrowRightLeft className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs text-emerald-400 font-bold">{targetLedger}</span>
                </div>

                <div className="space-y-1">
                  {vouchers.filter(v => selectedGuids.has(v.guid)).map(v => (
                    <div key={v.guid} className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-800/30 border border-slate-700/20 text-xs">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-slate-400">{v.date}</span>
                        <span className="font-semibold text-white">{v.voucherNumber}</span>
                        <span className="text-slate-500 truncate max-w-[200px]">{v.narration || v.counterLedger}</span>
                      </div>
                      <span className="font-mono font-bold text-indigo-400">₹{v.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-700/30">
                  <span className="text-xs text-slate-400">{selectedGuids.size} voucher(s) • Total ₹{selectedTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  <button
                    onClick={() => { setShowPreview(false); applyReclassification(); }}
                    className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-black uppercase transition-all"
                  >
                    <Zap className="w-4 h-4" /> Confirm & Apply
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
