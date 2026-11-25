/**
 * TallyXmlSuite.tsx — Suite 09: Tally Entries Maker & Automation Engine.
 * 
 * Replaces external macro workbooks (EasyTally) with a native, zero-telemetry,
 * high-performance React studio for tabular voucher entry, clipboard paste from Excel,
 * real-time validation, automatic balancing, ledger extraction, impact analysis,
 * offline XML download, and direct HTTP Port 9000 push to TallyPrime.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Server,
  Download,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Zap,
  Plus,
  Trash2,
  Copy,
  FileSpreadsheet,
  Eye,
  Sparkles,
  Layers,
  FileCode2,
  Search,
  Check,
  ChevronRight,
  ChevronLeft,
  FileUp,
  FileDown,
  Info,
  DollarSign,
  Send,
  HelpCircle,
  Settings2,
  Edit3,
  SlidersHorizontal,
  History,
  RotateCcw,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  DualEntryVoucher,
  MultiEntryVoucher,
  MultiEntryLeg,
  MasterLedger,
  ImpactSummaryRow,
  ValidationIssue,
  STANDARD_VOUCHER_TYPES,
  STANDARD_MASTER_GROUPS,
  validateMultiEntryVouchers,
  validateMasterLedgers,
  autoBalanceMultiEntry,
  fetchLedgersFromVouchers,
  computePreImportImpact,
  generateMultiEntryXml,
  generateMasterLedgersXml,
  generateVoucherAlterationXml,
  generateVoucherAlterationMultiXml,
  buildTallyDayBookExportXml,
  parseTallyDayBookXml,
  parseTallyDayBookMultiXml,
  parseUniversalVouchersFromRows,
  parseUniversalVouchersFromClipboard,
  cleanNumericAmount,
  formatTallyDate,
} from '@/lib/tallyXmlEngine';
import { pingTally, fetchCompanyInfo, sendTallyRequest, fetchAllLedgerNames, TallyCompanyInfo, clearTallyMetadataCache } from '@/lib/tallyApi';
import { Gstr2bDirectEntryTab } from '@/components/Gstr2bDirectEntryTab';

interface TallyXmlSuiteProps {
  onBack?: () => void;
}

type ActiveTab = 'vouchers' | 'gstr2b' | 'masters' | 'impact';

export const TallyXmlSuite: React.FC<TallyXmlSuiteProps> = ({ onBack }) => {
  const confirm = useConfirm();
  // Tab State - Universal Multi-Entry Voucher Studio
  const [activeTab, setActiveTab] = useState<ActiveTab>('vouchers');

  // Company Name
  const [companyName, setCompanyName] = useState<string>('');

  // Tally Connection Status & Config
  const [isTallyConnected, setIsTallyConnected] = useState<boolean>(false);
  const [isCheckingTally, setIsCheckingTally] = useState<boolean>(false);
  const [tallyCompany, setTallyCompany] = useState<TallyCompanyInfo | null>(null);
  const getStoredPort = (): number => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = window.localStorage.getItem('tallyPort');
        if (saved) return parseInt(saved, 10);
      }
    } catch {}
    return 9000;
  };

  const [tallyPort, setTallyPort] = useState<number>(getStoredPort);
  const [tallyHost, setTallyHost] = useState<string>('localhost');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [customPortInput, setCustomPortInput] = useState<string>(() => getStoredPort().toString());
  const [connectionDiagnosticMessage, setConnectionDiagnosticMessage] = useState<string | null>(null);

  // Missing Ledgers Auto-Creation Dialog State
  const [missingLedgers, setMissingLedgers] = useState<{ ledgerName: string; parentGroup: string }[]>([]);
  const [isMissingLedgersOpen, setIsMissingLedgersOpen] = useState<boolean>(false);
  const [isCreatingMissingLedgers, setIsCreatingMissingLedgers] = useState<boolean>(false);

  // Top-Level Module Switcher: 'entry' (Data Entry Studio) vs 'modifier' (Data Modifier Studio)
  const [suiteMode, setSuiteMode] = useState<'entry' | 'modifier'>('entry');

  // Data Modifier Studio State
  const [modifierVouchers, setModifierVouchers] = useState<DualEntryVoucher[]>([]);
  const [modifierSearch, setModifierSearch] = useState<string>('');
  const [modifierPage, setModifierPage] = useState<number>(1);
  const [modifierPageSize, setModifierPageSize] = useState<number>(100);
  const [isFetchingDayBook, setIsFetchingDayBook] = useState<boolean>(false);
  const [dayBookFromDate, setDayBookFromDate] = useState<string>('');
  const [dayBookToDate, setDayBookToDate] = useState<string>('');
  const modifierFileInputRef = React.useRef<HTMLInputElement | null>(null);

  // Bulk Find & Replace and Batch Modifiers
  const [findLedger, setFindLedger] = useState<string>('');
  const [replaceLedger, setReplaceLedger] = useState<string>('');
  const [findReplaceTarget, setFindReplaceTarget] = useState<'both' | 'debit' | 'credit'>('both');
  const [bulkDate, setBulkDate] = useState<string>('');
  const [bulkNarration, setBulkNarration] = useState<string>('');
  const [bulkNarrationMode, setBulkNarrationMode] = useState<'replace' | 'append'>('append');

  // File Input Ref for Excel Upload
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  // Validation State
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [isValidated, setIsValidated] = useState<boolean>(false);

  // Universal Vouchers & Masters Data (Clean Zero-Dummy Production State)
  const [multiVouchers, setMultiVouchers] = useState<MultiEntryVoucher[]>([]);
  const [masters, setMasters] = useState<MasterLedger[]>([]);

  // Search, Filter & Pagination for Universal Vouchers (handles 10,000+ entries with 60 FPS performance)
  const [vouchersSearch, setVouchersSearch] = useState<string>('');
  const [vouchersTypeFilter, setVouchersTypeFilter] = useState<string>('ALL');
  const [vouchersStatusFilter, setVouchersStatusFilter] = useState<'all' | 'balanced' | 'unbalanced'>('all');
  const [vouchersPage, setVouchersPage] = useState<number>(1);
  const [vouchersPageSize, setVouchersPageSize] = useState<number>(50);

  // Impact Report Data
  const impactData = useMemo<ImpactSummaryRow[]>(() => {
    return computePreImportImpact({
      multiVouchers,
    });
  }, [multiVouchers]);

  // Check Tally Status on mount or port change
  const checkTallyConnection = useCallback(async (portToTest?: number, hostToTest?: string) => {
    const p = portToTest ?? tallyPort;
    const h = hostToTest ?? tallyHost;
    setIsCheckingTally(true);
    setConnectionDiagnosticMessage(null);
    try {
      const isOnline = await pingTally({ host: h, port: p });
      setIsTallyConnected(isOnline);
      if (isOnline) {
        try {
          const info = await fetchCompanyInfo({ host: h, port: p });
          setTallyCompany(info);
          const cName = info.name || info.companyName;
          if (cName && cName !== 'Unknown') {
            setCompanyName(cName);
          }
          setConnectionDiagnosticMessage(`Connected to TallyPrime! Active Company: "${info.name || 'Open'}"`);
          toast.success(`Connected to TallyPrime! Company: ${info.name || 'Active'}`);
        } catch {
          setConnectionDiagnosticMessage(`TallyPrime responded on port ${p}, but company details could not be read. Please ensure a Company is open in Tally.`);
          toast.warning(`Tally responded on port ${p}, but no company is open.`);
        }
      } else {
        setTallyCompany(null);
        setConnectionDiagnosticMessage(`Cannot reach TallyPrime on ${h}:${p}. Ensure Tally is open and Server mode is enabled.`);
        toast.error(`Cannot reach Tally on port ${p}. Make sure TallyPrime is open.`);
      }
      return isOnline;
    } catch (err: any) {
      setIsTallyConnected(false);
      setTallyCompany(null);
      setConnectionDiagnosticMessage(`Connection failed: ${err.message || 'Cannot connect to port ' + p}`);
      return false;
    } finally {
      setIsCheckingTally(false);
    }
  }, [tallyHost, tallyPort]);

  const handleApplyPort = (newPort: number) => {
    setTallyPort(newPort);
    setCustomPortInput(newPort.toString());
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('tallyPort', newPort.toString());
      }
    } catch {}
    checkTallyConnection(newPort);
    toast.success(`Port updated to ${newPort}. Testing connection...`);
  };

// No automatic connection on mount/focus - purely manual on user click


  // Validation Handler
  const handleValidate = useCallback(() => {
    let currentIssues: ValidationIssue[] = [];

    if (activeTab === 'vouchers') {
      currentIssues = validateMultiEntryVouchers(multiVouchers);
    } else if (activeTab === 'masters') {
      currentIssues = validateMasterLedgers(masters);
    }

    setIssues(currentIssues);
    setIsValidated(true);

    if (currentIssues.length === 0) {
      toast.success('All records validated successfully with 0 errors!');
    } else {
      const errCount = currentIssues.filter((i) => i.severity === 'error').length;
      toast.error(`Found ${errCount} validation errors. Review highlighted rows.`);
    }
  }, [activeTab, multiVouchers, masters]);

  // Automated Ledger Extraction
  const handleFetchLedgers = useCallback(() => {
    const updatedMasters = fetchLedgersFromVouchers({
      multiVouchers,
      existingLedgers: masters,
    });

    const newCount = updatedMasters.length - masters.length;
    setMasters(updatedMasters);
    setActiveTab('masters');

    if (newCount > 0) {
      toast.success(`Extracted ${newCount} new unique ledger(s) into Masters table!`);
    } else {
      toast.info('All ledgers in vouchers already exist in the Masters table.');
    }
  }, [multiVouchers, masters]);

  // Auto-Balance Multi Entry Vouchers
  const handleAutoBalance = useCallback(() => {
    let balancedCount = 0;
    const updated = multiVouchers.map((v) => {
      let sum = 0;
      (v.legs || []).forEach((l) => (sum += cleanNumericAmount(l.amount)));
      if (Math.abs(Math.round(sum * 100) / 100) > 0.005) {
        balancedCount++;
        return autoBalanceMultiEntry(v, 'Round Off');
      }
      return v;
    });

    setMultiVouchers(updated);
    if (balancedCount > 0) {
      toast.success(`Auto-balanced ${balancedCount} voucher(s) with Round Off adjustments.`);
      setIssues([]);
      setIsValidated(false);
    } else {
      toast.info('All vouchers are already algebraically balanced.');
    }
  }, [multiVouchers]);

  // Download XML Handler
  const handleDownloadXml = useCallback(() => {
    let xml = '';
    let filename = 'Universal_Vouchers.xml';

    if (activeTab === 'vouchers') {
      xml = generateMultiEntryXml(multiVouchers, companyName);
      filename = 'Universal_Vouchers.xml';
    } else if (activeTab === 'masters') {
      xml = generateMasterLedgersXml(masters, companyName);
      filename = 'Masters.xml';
    } else {
      xml = generateMultiEntryXml(multiVouchers, companyName);
    }

    if (!xml) {
      toast.error('No XML data generated. Please check your voucher rows.');
      return;
    }

    const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success(`Generated & downloaded ${filename} successfully!`);
  }, [activeTab, multiVouchers, masters, companyName]);

  // Intelligent Ledger Parent Group Inference
  const inferLedgerGroup = (name: string): string => {
    if (/bank|hdfc|icici|sbi|idfc|axis|kotak|pnb|cbin/i.test(name)) {
      return 'Bank Accounts';
    } else if (/cash/i.test(name)) {
      return 'Cash-in-Hand';
    } else if (/gst|cgst|sgst|igst|tax|tds|cess/i.test(name)) {
      return 'Duties & Taxes';
    } else if (/sales|revenue|turnover/i.test(name)) {
      return 'Sales Accounts';
    } else if (/purchase/i.test(name)) {
      return 'Purchase Accounts';
    } else if (/round\s*off/i.test(name)) {
      return 'Indirect Expenses';
    } else if (/rent|salary|wages|interest|freight|audit|legal/i.test(name)) {
      return 'Indirect Expenses';
    }
    return 'Sundry Creditors';
  };

  // Helper to extract candidate ledgers from active vouchers
  const getCandidateLedgerNames = useCallback((): string[] => {
    const names = new Set<string>();
    multiVouchers.forEach((v) => {
      (v.legs || []).forEach((l) => {
        if (l.ledgerName && l.ledgerName.trim()) names.add(l.ledgerName.trim());
      });
    });
    return Array.from(names);
  }, [multiVouchers]);

  // Execute Core Voucher XML Push
  const executeVoucherPush = useCallback(async () => {
    // ── High-Volume Chunked Push (Optimized for 1,000 to 10,000+ entries) ──
    const BATCH_SIZE = 500;
    if (activeTab === 'vouchers' && multiVouchers.length > BATCH_SIZE) {
      const chunks: MultiEntryVoucher[][] = [];
      for (let i = 0; i < multiVouchers.length; i += BATCH_SIZE) {
        chunks.push(multiVouchers.slice(i, i + BATCH_SIZE));
      }

      let totalCreated = 0;
      let totalAltered = 0;
      const toastId = toast.loading(`Pushing ${multiVouchers.length.toLocaleString('en-IN')} vouchers in ${chunks.length} batches to TallyPrime...`);

      try {
        for (let bIdx = 0; bIdx < chunks.length; bIdx++) {
          const currentChunk = chunks[bIdx];
          toast.loading(`Pushing batch ${bIdx + 1} of ${chunks.length} (${currentChunk.length} vouchers)...`, { id: toastId });
          const chunkXml = generateMultiEntryXml(currentChunk, companyName);
          const response = await sendTallyRequest(chunkXml, { host: tallyHost, port: tallyPort }, 45000);

          const createdMatch = response.match(/<CREATED>(\d+)<\/CREATED>/i);
          const alteredMatch = response.match(/<ALTERED>(\d+)<\/ALTERED>/i);
          const lineErrorMatch = response.match(/<LINEERROR>([^<]+)<\/LINEERROR>/i);

          const c = createdMatch ? parseInt(createdMatch[1], 10) : 0;
          const a = alteredMatch ? parseInt(alteredMatch[1], 10) : 0;
          const lineError = lineErrorMatch ? lineErrorMatch[1].replace(/&apos;/g, "'").replace(/&amp;/g, '&').trim() : '';

          totalCreated += c;
          totalAltered += a;

          const missingLedgerMatch = lineError.match(/Ledger\s+['"]?([^'"]+?)['"]?\s+does not exist/i);
          if (missingLedgerMatch) {
            toast.dismiss(toastId);
            const missingName = missingLedgerMatch[1].trim();
            const guessedGroup = inferLedgerGroup(missingName);
            setMissingLedgers([{ ledgerName: missingName, parentGroup: guessedGroup }]);
            setIsMissingLedgersOpen(true);
            toast.info(`Paused at batch ${bIdx + 1}: Ledger "${missingName}" does not exist in Tally. Auto-create it below to resume!`);
            return;
          }
        }

        toast.dismiss(toastId);
        toast.success(`Success! Created: ${totalCreated.toLocaleString('en-IN')}, Altered: ${totalAltered.toLocaleString('en-IN')} vouchers in TallyPrime!`, {
          duration: 6000,
        });
        return;
      } catch (batchErr: any) {
        toast.dismiss(toastId);
        toast.error(`Push interrupted: ${batchErr.message || 'Cannot reach Tally on port 9000.'}`);
        return;
      }
    }

    // Standard Push for <= 500 vouchers or Masters
    let xml = '';
    if (activeTab === 'vouchers') {
      xml = generateMultiEntryXml(multiVouchers, companyName);
    } else if (activeTab === 'masters') {
      xml = generateMasterLedgersXml(masters, companyName);
    }

    if (!xml) {
      toast.error('No XML to push.');
      return;
    }

    const toastId = toast.loading(`Sending XML directly to TallyPrime (Port ${tallyPort})...`);
    try {
      const response = await sendTallyRequest(xml, { host: tallyHost, port: tallyPort });
      toast.dismiss(toastId);

      // Parse response summary
      const createdMatch = response.match(/<CREATED>(\d+)<\/CREATED>/i);
      const alteredMatch = response.match(/<ALTERED>(\d+)<\/ALTERED>/i);
      const errorsMatch = response.match(/<ERRORS>(\d+)<\/ERRORS>/i);
      const exceptionsMatch = response.match(/<EXCEPTIONS>(\d+)<\/EXCEPTIONS>/i);
      const lineErrorMatch = response.match(/<LINEERROR>([^<]+)<\/LINEERROR>/i);

      const created = createdMatch ? parseInt(createdMatch[1], 10) : 0;
      const altered = alteredMatch ? parseInt(alteredMatch[1], 10) : 0;
      const errors = errorsMatch ? parseInt(errorsMatch[1], 10) : 0;
      const exceptions = exceptionsMatch ? parseInt(exceptionsMatch[1], 10) : 0;
      const lineError = lineErrorMatch ? lineErrorMatch[1].replace(/&apos;/g, "'").replace(/&amp;/g, '&').trim() : '';

      // Reactive Catch: If Tally rejected because a ledger doesn't exist, open auto-creation dialog!
      const missingLedgerMatch = lineError.match(/Ledger\s+['"]?([^'"]+?)['"]?\s+does not exist/i);
      if (missingLedgerMatch) {
        const missingName = missingLedgerMatch[1].trim();
        const guessedGroup = inferLedgerGroup(missingName);
        setMissingLedgers([{ ledgerName: missingName, parentGroup: guessedGroup }]);
        setIsMissingLedgersOpen(true);
        toast.info(`Tally requires ledger "${missingName}". Choose its parent group below to auto-create and push.`);
        return;
      }

      if (errors > 0 || exceptions > 0 || lineError || (created === 0 && altered === 0)) {
        const errorDetail = lineError || (exceptions > 0 ? `${exceptions} exception(s) encountered in Tally.` : 'No vouchers were created.');
        toast.error(`Tally Push Incomplete (Created: ${created}): ${errorDetail}`, {
          duration: 8000,
        });
      } else {
        toast.success(`Success! Created: ${created}, Altered: ${altered} in TallyPrime.`, {
          duration: 5000,
        });
      }
    } catch (err: any) {
      toast.dismiss(toastId);
      toast.error(`Push failed: ${err.message || 'Cannot reach Tally on port 9000.'}`);
    }
  }, [activeTab, multiVouchers, masters, companyName, tallyHost, tallyPort]);

  // Direct Push to TallyPrime with Proactive Missing Ledgers Check
  const handlePushToTally = useCallback(async () => {
    if (activeTab === 'masters') {
      await executeVoucherPush();
      return;
    }

    const candidateNames = getCandidateLedgerNames();
    if (candidateNames.length === 0) {
      toast.error('No vouchers with valid ledgers found to push.');
      return;
    }

    // Proactively verify existing ledgers in TallyPrime to catch missing ones in advance
    try {
      const tallyLedgers = await fetchAllLedgerNames({ host: tallyHost, port: tallyPort });
      const tallyLedgerSet = new Set(tallyLedgers.map((l) => l.name.trim().toLowerCase()));

      const missing = candidateNames.filter((name) => !tallyLedgerSet.has(name.toLowerCase()));
      if (missing.length > 0) {
        const items = missing.map((name) => ({
          ledgerName: name,
          parentGroup: inferLedgerGroup(name),
        }));
        setMissingLedgers(items);
        setIsMissingLedgersOpen(true);
        return; // Prompt user to auto-create!
      }
    } catch {
      // If fetching ledgers times out, continue directly and let reactive catch handle it
    }

    await executeVoucherPush();
  }, [activeTab, getCandidateLedgerNames, tallyHost, tallyPort, executeVoucherPush]);

  // Auto-Create Missing Ledgers in Tally, then Push Vouchers
  const handleAutoCreateAndPush = useCallback(async () => {
    if (missingLedgers.length === 0) {
      setIsMissingLedgersOpen(false);
      await executeVoucherPush();
      return;
    }

    setIsCreatingMissingLedgers(true);
    const toastId = toast.loading(`Creating ${missingLedgers.length} ledger(s) in TallyPrime...`);
    try {
      const mastersToCreate: MasterLedger[] = missingLedgers.map((item) => ({
        ledgerName: item.ledgerName,
        parentGroup: item.parentGroup,
        country: 'India',
        openingBalance: 0,
      }));

      const ledgerXml = generateMasterLedgersXml(mastersToCreate, companyName);
      const ledgerResp = await sendTallyRequest(ledgerXml, { host: tallyHost, port: tallyPort });

      const createdMatch = ledgerResp.match(/<CREATED>(\d+)<\/CREATED>/i);
      const createdCount = createdMatch ? parseInt(createdMatch[1], 10) : missingLedgers.length;

      // Merge into local masters state for persistence
      setMasters((prev) => {
        const existingNames = new Set(prev.map((m) => m.ledgerName.toLowerCase()));
        const toAdd = mastersToCreate.filter((m) => !existingNames.has(m.ledgerName.toLowerCase()));
        return [...prev, ...toAdd];
      });

      toast.dismiss(toastId);
      toast.success(`Created ${createdCount} ledger(s) in Tally! Now pushing vouchers...`, { duration: 3000 });
      setIsMissingLedgersOpen(false);

      // Now immediately push the actual vouchers!
      await executeVoucherPush();
    } catch (err: any) {
      toast.dismiss(toastId);
      toast.error(`Failed to auto-create ledgers in Tally: ${err.message || 'Cannot reach Tally.'}`);
    } finally {
      setIsCreatingMissingLedgers(false);
    }
  }, [missingLedgers, companyName, tallyHost, tallyPort, executeVoucherPush]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey) {
        const key = e.key.toUpperCase();
        if (key === 'V') {
          e.preventDefault();
          handleValidate();
        } else if (key === 'G') {
          e.preventDefault();
          handleDownloadXml();
        } else if (key === 'T') {
          e.preventDefault();
          handleFetchLedgers();
        } else if (key === 'I') {
          e.preventDefault();
          setActiveTab('impact');
        } else if (key === 'B' && activeTab === 'multi') {
          e.preventDefault();
          handleAutoBalance();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleValidate, handleDownloadXml, handleFetchLedgers, handleAutoBalance, activeTab]);

  // Clipboard Paste Parser for Universal Multi-Entry Vouchers
  const handlePasteUniversalFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text || !text.trim()) {
        toast.error('Clipboard is empty! Copy rows from Excel first.');
        return;
      }

      const parsed = parseUniversalVouchersFromClipboard(text);
      if (parsed.length > 0) {
        setMultiVouchers((prev) => [...prev, ...parsed]);
        toast.success(`Successfully pasted ${parsed.length} universal voucher(s) from Excel!`);
        setIsValidated(false);
        setVouchersPage(1);
      } else {
        toast.error('Could not parse valid vouchers from clipboard. Verify column layout.');
      }
    } catch (err: any) {
      toast.error(`Clipboard read error: ${err.message}. Please allow clipboard permissions.`);
    }
  };

  // Direct Excel / CSV File Upload Parser (Supports 10,000+ entries)
  const handleExcelFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    const toastId = toast.loading(`Parsing ${file.name}...`);

    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        const workbook = XLSX.read(data, { type: 'binary', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rawJson: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });

        if (!rawJson || rawJson.length === 0) {
          toast.dismiss(toastId);
          toast.error('The selected Excel file is empty.');
          return;
        }

        const parsed = parseUniversalVouchersFromRows(rawJson);
        toast.dismiss(toastId);

        if (parsed.length > 0) {
          setMultiVouchers((prev) => [...prev, ...parsed]);
          toast.success(`Successfully imported ${parsed.length.toLocaleString('en-IN')} voucher(s) from Excel!`, {
            duration: 5000,
          });
          setIsValidated(false);
          setVouchersPage(1);
        } else {
          toast.error('Could not find valid voucher rows. Please verify your Excel file headers.');
        }
      } catch (err: any) {
        toast.dismiss(toastId);
        toast.error(`Excel parse error: ${err.message}`);
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };

    reader.onerror = () => {
      toast.dismiss(toastId);
      toast.error('Failed to read the file.');
      if (fileInputRef.current) fileInputRef.current.value = '';
    };

    reader.readAsBinaryString(file);
  };

  // Download Sample Universal Excel Template (Zero Merges Rule)
  const handleDownloadSampleTemplate = () => {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Universal Multi-Line Template (Purchase, Sales, Journal, Payroll, Payments)
    const multiLineHeaders = [
      'Date',
      'Voucher Type',
      'Voucher Number',
      'Reference Number',
      'Ledger Name',
      'Dr / Cr',
      'Amount',
      'Narration',
    ];

    const multiLineSampleRows = [
      // Purchase Voucher with GST
      ['2026-04-01', 'Purchase', 'PUR-001', 'INV-9021', 'ABC Suppliers', 'Cr', 11800, 'Raw material purchase 18%'],
      ['2026-04-01', 'Purchase', 'PUR-001', 'INV-9021', 'Purchase 18%', 'Dr', 10000, 'Raw material purchase 18%'],
      ['2026-04-01', 'Purchase', 'PUR-001', 'INV-9021', 'Input CGST 9%', 'Dr', 900, 'Raw material purchase 18%'],
      ['2026-04-01', 'Purchase', 'PUR-001', 'INV-9021', 'Input SGST 9%', 'Dr', 900, 'Raw material purchase 18%'],

      // Sales Voucher with IGST
      ['2026-04-02', 'Sales', 'SAL-001', 'INV-1001', 'XYZ Global Corp', 'Dr', 59000, 'Finished goods supply'],
      ['2026-04-02', 'Sales', 'SAL-001', 'INV-1001', 'Sales 18%', 'Cr', 50000, 'Finished goods supply'],
      ['2026-04-02', 'Sales', 'SAL-001', 'INV-1001', 'Output IGST 18%', 'Cr', 9000, 'Finished goods supply'],

      // Payment Voucher
      ['2026-04-03', 'Payment', 'PAY-001', '', 'Office Rent A/c', 'Dr', 25000, 'Office rent for April via NEFT'],
      ['2026-04-03', 'Payment', 'PAY-001', '', 'HDFC Bank A/c', 'Cr', 25000, 'Office rent for April via NEFT'],

      // Receipt Voucher
      ['2026-04-04', 'Receipt', 'REC-001', '', 'State Bank of India', 'Dr', 50000, 'Customer payment received'],
      ['2026-04-04', 'Receipt', 'REC-001', '', 'XYZ Global Corp', 'Cr', 50000, 'Customer payment received'],

      // Journal / Payroll Voucher
      ['2026-04-05', 'Journal', 'JRN-001', '', 'Salary Expenses', 'Dr', 100000, 'April 2026 staff salary'],
      ['2026-04-05', 'Journal', 'JRN-001', '', 'TDS Payable', 'Cr', 10000, 'April 2026 staff salary'],
      ['2026-04-05', 'Journal', 'JRN-001', '', 'HDFC Bank A/c', 'Cr', 90000, 'April 2026 staff salary'],
    ];

    const ws1 = XLSX.utils.aoa_to_sheet([multiLineHeaders, ...multiLineSampleRows]);
    ws1['!merges'] = [];
    XLSX.utils.book_append_sheet(wb, ws1, 'Universal_Vouchers');

    // Sheet 2: Flat 2-Leg Template (For Bank Statements & Simple Cash Book)
    const flatHeaders = [
      'Date',
      'Voucher Type',
      'Voucher Number',
      'Reference Number',
      'Debit Ledger',
      'Credit Ledger',
      'Amount',
      'Narration',
    ];

    const flatSampleRows = [
      ['2026-04-01', 'Payment', 'PAY-101', 'INV-55', 'Electricity Charges', 'HDFC Bank A/c', 12450, 'Monthly electricity bill'],
      ['2026-04-02', 'Receipt', 'REC-101', 'INV-90', 'State Bank of India', 'Client ABC Ltd', 85000, 'Payment against bill 90'],
      ['2026-04-03', 'Contra', 'CON-101', '', 'Cash', 'State Bank of India', 20000, 'Cash withdrawal for petty cash'],
    ];

    const ws2 = XLSX.utils.aoa_to_sheet([flatHeaders, ...flatSampleRows]);
    ws2['!merges'] = [];
    XLSX.utils.book_append_sheet(wb, ws2, 'Flat_2_Leg_Vouchers');

    XLSX.writeFile(wb, 'Universal_Tally_Vouchers_Template.xlsx');
    toast.success('Downloaded Universal_Tally_Vouchers_Template.xlsx successfully!');
  };

  // Clear all Universal Vouchers
  const handleClearAllVouchers = async () => {
    if (multiVouchers.length === 0) return;
    const ok = await confirm({
      title: 'Clear Voucher Entries',
      description: `Are you sure you want to clear all ${multiVouchers.length.toLocaleString('en-IN')} voucher entries?`,
      confirmText: 'Clear All',
      variant: 'destructive',
    });
    if (ok) {
      setMultiVouchers([]);
      setIssues([]);
      setIsValidated(false);
      setVouchersPage(1);
      toast.info('All voucher rows cleared.');
    }
  };

  // Filtered and Paginated Universal Vouchers
  const filteredMultiVouchers = useMemo(() => {
    return multiVouchers.filter((v) => {
      // Type filter
      if (vouchersTypeFilter !== 'ALL' && v.voucherType.toLowerCase() !== vouchersTypeFilter.toLowerCase()) {
        return false;
      }

      // Balance filter
      let sum = 0;
      (v.legs || []).forEach((l) => (sum += cleanNumericAmount(l.amount)));
      const isBalanced = Math.abs(Math.round(sum * 100) / 100) <= 0.005;
      if (vouchersStatusFilter === 'balanced' && !isBalanced) return false;
      if (vouchersStatusFilter === 'unbalanced' && isBalanced) return false;

      // Search query
      if (vouchersSearch.trim()) {
        const q = vouchersSearch.toLowerCase().trim();
        const matchesVch =
          (v.voucherNumber && v.voucherNumber.toLowerCase().includes(q)) ||
          (v.referenceNumber && v.referenceNumber.toLowerCase().includes(q)) ||
          (v.narration && v.narration.toLowerCase().includes(q)) ||
          (v.date && v.date.includes(q)) ||
          (v.voucherType && v.voucherType.toLowerCase().includes(q));
        const matchesLeg = (v.legs || []).some(
          (l) => l.ledgerName && l.ledgerName.toLowerCase().includes(q)
        );
        if (!matchesVch && !matchesLeg) return false;
      }

      return true;
    });
  }, [multiVouchers, vouchersTypeFilter, vouchersStatusFilter, vouchersSearch]);

  const totalVouchersPages = Math.max(1, Math.ceil(filteredMultiVouchers.length / vouchersPageSize));
  const currentVouchersPage = Math.min(Math.max(1, vouchersPage), totalVouchersPages);

  const paginatedMultiVouchers = useMemo(() => {
    const start = (currentVouchersPage - 1) * vouchersPageSize;
    return filteredMultiVouchers.slice(start, start + vouchersPageSize);
  }, [filteredMultiVouchers, currentVouchersPage, vouchersPageSize]);

  // Overall KPI Stats
  const vouchersStats = useMemo(() => {
    let totalDr = 0;
    let totalCr = 0;
    let unbalancedCount = 0;

    multiVouchers.forEach((v) => {
      let vSum = 0;
      (v.legs || []).forEach((l) => {
        const amt = cleanNumericAmount(l.amount);
        vSum += amt;
        if (amt < 0) totalDr += Math.abs(amt);
        else if (amt > 0) totalCr += amt;
      });
      if (Math.abs(Math.round(vSum * 100) / 100) > 0.005) {
        unbalancedCount++;
      }
    });

    return {
      totalCount: multiVouchers.length,
      totalDebit: Math.round(totalDr * 100) / 100,
      totalCredit: Math.round(totalCr * 100) / 100,
      unbalancedCount,
    };
  }, [multiVouchers]);

  // Filtered and Paginated Modifier Vouchers
  const filteredModifierVouchers = useMemo(() => {
    if (!modifierSearch.trim()) return modifierVouchers;
    const q = modifierSearch.toLowerCase().trim();
    return modifierVouchers.filter(
      (v) =>
        (v.debitLedger && v.debitLedger.toLowerCase().includes(q)) ||
        (v.creditLedger && v.creditLedger.toLowerCase().includes(q)) ||
        (v.voucherNumber && v.voucherNumber.toLowerCase().includes(q)) ||
        (v.referenceNumber && v.referenceNumber.toLowerCase().includes(q)) ||
        (v.narration && v.narration.toLowerCase().includes(q)) ||
        (v.voucherType && v.voucherType.toLowerCase().includes(q)) ||
        (v.date && v.date.includes(q)) ||
        v.amount.toString().includes(q)
    );
  }, [modifierVouchers, modifierSearch]);

  const totalModifierPages = Math.max(1, Math.ceil(filteredModifierVouchers.length / modifierPageSize));
  const currentModifierPage = Math.min(Math.max(1, modifierPage), totalModifierPages);

  const paginatedModifierVouchers = useMemo(() => {
    const start = (currentModifierPage - 1) * modifierPageSize;
    return filteredModifierVouchers.slice(start, start + modifierPageSize);
  }, [filteredModifierVouchers, currentModifierPage, modifierPageSize]);

  const totalModifierDebit = useMemo(() => {
    return modifierVouchers.reduce((acc, v) => acc + (cleanNumericAmount(v.amount) || 0), 0);
  }, [modifierVouchers]);

  const uniqueModifierDebits = useMemo(() => {
    return new Set(modifierVouchers.map((v) => v.debitLedger?.trim()).filter(Boolean)).size;
  }, [modifierVouchers]);

  const uniqueModifierCredits = useMemo(() => {
    return new Set(modifierVouchers.map((v) => v.creditLedger?.trim()).filter(Boolean)).size;
  }, [modifierVouchers]);

  // Modifier Row Handlers
  const handleModifierAddRow = () => {
    const newRow: DualEntryVoucher = {
      id: `mod-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      date: new Date().toISOString().split('T')[0],
      voucherType: 'Payment',
      voucherNumber: '',
      debitLedger: '',
      creditLedger: '',
      amount: 0,
      narration: '',
    };
    setModifierVouchers((prev) => [newRow, ...prev]);
    toast.success('Added new alteration row at top of list.');
  };

  const handleModifierUpdateRow = (id: string, field: keyof DualEntryVoucher, val: any) => {
    setModifierVouchers((prev) =>
      prev.map((v) => (v.id === id ? { ...v, [field]: val } : v))
    );
  };

  const handleModifierDeleteRow = (id: string) => {
    setModifierVouchers((prev) => prev.filter((v) => v.id !== id));
    toast.info('Row removed from modifier list.');
  };

  const handleModifierDuplicateRow = (id: string) => {
    const item = modifierVouchers.find((v) => v.id === id);
    if (!item) return;
    const dup: DualEntryVoucher = {
      ...item,
      id: `mod-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    };
    setModifierVouchers((prev) => [dup, ...prev]);
    toast.success('Row duplicated.');
  };

  const handleClearAllModifier = () => {
    setModifierVouchers([]);
    setModifierPage(1);
    toast.info('Modifier grid cleared.');
  };

  // Bulk Find & Replace Ledger
  const handleBulkReplaceLedger = () => {
    const find = findLedger.trim();
    const replace = replaceLedger.trim();
    if (!find) {
      toast.error('Please enter the ledger name to find.');
      return;
    }
    if (!replace) {
      toast.error('Please enter the replacement ledger name.');
      return;
    }

    let count = 0;
    const findLower = find.toLowerCase();
    const updated = modifierVouchers.map((v) => {
      let debit = v.debitLedger;
      let credit = v.creditLedger;
      let matched = false;

      if ((findReplaceTarget === 'both' || findReplaceTarget === 'debit') && debit.toLowerCase() === findLower) {
        debit = replace;
        matched = true;
      }
      if ((findReplaceTarget === 'both' || findReplaceTarget === 'credit') && credit.toLowerCase() === findLower) {
        credit = replace;
        matched = true;
      }
      if (matched) count++;
      return { ...v, debitLedger: debit, creditLedger: credit };
    });

    if (count === 0) {
      toast.info(`No ledgers matching "${find}" were found in ${modifierVouchers.length} vouchers.`);
      return;
    }

    setModifierVouchers(updated);
    toast.success(`Successfully replaced ${count} occurrence(s) of "${find}" with "${replace}"!`);
    setFindLedger('');
    setReplaceLedger('');
  };

  // Bulk Apply Date
  const handleBulkApplyDate = () => {
    if (!bulkDate) {
      toast.error('Please select a valid date.');
      return;
    }
    if (modifierVouchers.length === 0) {
      toast.error('No vouchers in modifier list to update.');
      return;
    }

    setModifierVouchers((prev) => prev.map((v) => ({ ...v, date: bulkDate })));
    toast.success(`Applied date ${bulkDate} to all ${modifierVouchers.length} vouchers!`);
  };

  // Bulk Apply Narration
  const handleBulkApplyNarration = () => {
    if (!bulkNarration.trim()) {
      toast.error('Please enter narration text.');
      return;
    }
    if (modifierVouchers.length === 0) {
      toast.error('No vouchers in modifier list to update.');
      return;
    }

    const text = bulkNarration.trim();
    setModifierVouchers((prev) =>
      prev.map((v) => ({
        ...v,
        narration:
          bulkNarrationMode === 'replace'
            ? text
            : v.narration
            ? `${v.narration} ${text}`
            : text,
      }))
    );
    toast.success(`Updated narration for all ${modifierVouchers.length} vouchers!`);
    setBulkNarration('');
  };

  // Copy Vouchers from Entry Studio
  const handleCopyFromEntryToModifier = () => {
    if (multiVouchers.length === 0) {
      toast.info('No vouchers in Data Entry Studio to copy.');
      return;
    }
    const cloned: DualEntryVoucher[] = multiVouchers.map((v) => {
      let debitLedger = '';
      let creditLedger = '';
      let debitAmt = 0;
      let creditAmt = 0;
      const allEntries = (v.legs || []).map((l) => {
        const isDebit = l.amount < 0;
        const absAmt = Math.abs(l.amount);
        if (isDebit && !debitLedger) {
          debitLedger = l.ledgerName;
          debitAmt = absAmt;
        } else if (!isDebit && !creditLedger) {
          creditLedger = l.ledgerName;
          creditAmt = absAmt;
        }
        return { ledgerName: l.ledgerName, amount: absAmt, isDebit };
      });

      return {
        id: `mod-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        originalVoucherNumber: v.voucherNumber || undefined,
        originalDate: v.date,
        date: v.date,
        voucherType: v.voucherType,
        voucherNumber: v.voucherNumber,
        referenceNumber: v.referenceNumber,
        referenceDate: v.referenceDate,
        debitLedger: debitLedger || 'Suspense',
        creditLedger: creditLedger || 'Suspense',
        amount: debitAmt || creditAmt || 0,
        narration: v.narration,
        allEntries,
        legs: v.legs,
      };
    });
    setModifierVouchers(cloned);
    setModifierPage(1);
    toast.success(`Copied ${cloned.length} vouchers from Data Entry Studio to Modifier Studio!`);
  };

  // Fetch DayBook from TallyPrime
  const handleFetchFromTallyDayBook = async () => {
    if (!isTallyConnected) {
      const isOnline = await checkTallyConnection();
      if (!isOnline) {
        toast.error(`Cannot connect to TallyPrime on port ${tallyPort}. Ensure Tally is open.`);
        return;
      }
    }

    setIsFetchingDayBook(true);
    const toastId = toast.loading('Querying DayBook vouchers from TallyPrime via Port ' + tallyPort + '...');
    try {
      const queryXml = buildTallyDayBookExportXml(dayBookFromDate, dayBookToDate);
      const response = await sendTallyRequest(queryXml, { host: tallyHost, port: tallyPort }, 60000);
      const parsed = parseTallyDayBookXml(response);

      toast.dismiss(toastId);
      if (parsed.length > 0) {
        setModifierVouchers(parsed);
        setModifierPage(1);
        toast.success(`Successfully fetched ${parsed.length} vouchers from Tally DayBook! Ready for modification.`);
      } else {
        toast.info('No active vouchers found in Tally for the specified period.');
      }
    } catch (err: any) {
      toast.dismiss(toastId);
      toast.error(`Failed to fetch DayBook: ${err.message || 'Error communicating with Tally.'}`);
    } finally {
      setIsFetchingDayBook(false);
    }
  };

  // Upload Excel / CSV for Modification
  const handleUploadModifierExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    const toastId = toast.loading(`Parsing ${file.name} for modification...`);

    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        const workbook = XLSX.read(data, { type: 'binary', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rawJson: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });

        if (!rawJson || rawJson.length === 0) {
          toast.dismiss(toastId);
          toast.error('The selected file is empty.');
          return;
        }

        const parsed: DualEntryVoucher[] = [];
        rawJson.forEach((row, idx) => {
          const keys = Object.keys(row);
          const getVal = (patterns: string[]): string => {
            for (const p of patterns) {
              const matchedKey = keys.find((k) => new RegExp(p, 'i').test(k.trim()));
              if (matchedKey && row[matchedKey] !== undefined && row[matchedKey] !== '') {
                return String(row[matchedKey]).trim();
              }
            }
            return '';
          };

          const rawDate = getVal(['^date', 'voucher\\s*date', 'vch\\s*date']);
          const vchType = getVal(['^type', 'voucher\\s*type', 'vch\\s*type']) || 'Payment';
          const vchNo = getVal(['voucher\\s*no', 'vch\\s*no', '^number', '^no']);
          const refNo = getVal(['reference', 'ref\\s*no', 'invoice\\s*no']);
          const debit = getVal(['debit\\s*ledger', '^debit', '^dr\\b', 'dr\\s*ledger', 'particulars']);
          const credit = getVal(['credit\\s*ledger', '^credit', '^cr\\b', 'cr\\s*ledger', 'account']);
          const amountRaw = getVal(['amount', 'debit\\s*amount', 'credit\\s*amount', 'value', 'total']);
          const narration = getVal(['narration', 'remarks', 'description', 'notes']);

          const amt = cleanNumericAmount(amountRaw);

          let cleanDate = rawDate;
          if (rawDate && /^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(rawDate)) {
            const parts = rawDate.split(/[-/]/);
            cleanDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
          }

          if (cleanDate && (debit || credit || vchNo)) {
            parsed.push({
              id: `mod-up-${Date.now()}-${idx}`,
              originalVoucherNumber: vchNo || undefined,
              originalDate: cleanDate,
              date: cleanDate,
              voucherType: vchType,
              voucherNumber: vchNo,
              referenceNumber: refNo,
              debitLedger: debit,
              creditLedger: credit,
              amount: amt,
              narration,
            });
          }
        });

        toast.dismiss(toastId);
        if (parsed.length > 0) {
          setModifierVouchers(parsed);
          setModifierPage(1);
          toast.success(`Successfully loaded ${parsed.length} voucher(s) into Modifier Studio!`);
        } else {
          toast.error('Could not parse valid vouchers from file. Check column headers.');
        }
      } catch (err: any) {
        toast.dismiss(toastId);
        toast.error(`File parsing error: ${err.message}`);
      }
    };

    reader.readAsBinaryString(file);
    if (e.target) e.target.value = '';
  };

  // Download Alteration Template (Zero Merges Rule)
  const handleDownloadModifierTemplate = () => {
    const wb = XLSX.utils.book_new();
    const headers = [
      'Date',
      'Voucher Type',
      'Voucher Number',
      'Debit Ledger',
      'Credit Ledger',
      'Amount',
      'Narration',
    ];
    const sampleRows = [
      ['2026-04-15', 'Payment', 'PV-2026-001', 'Office Rent A/c', 'HDFC Bank A/c', 25000, 'Rent payment altered'],
      ['2026-04-18', 'Receipt', 'REC-2026-001', 'ICICI Bank A/c', 'Sundry Debtors', 50000, 'Payment received'],
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);
    ws['!cols'] = [{ wch: 15 }, { wch: 15 }, { wch: 18 }, { wch: 25 }, { wch: 25 }, { wch: 15 }, { wch: 30 }];
    ws['!merges'] = []; // Zero merge rule
    XLSX.utils.book_append_sheet(wb, ws, 'Vouchers_To_Alter');
    XLSX.writeFile(wb, 'Tally_Voucher_Alteration_Template.xlsx');
    toast.success('Downloaded Tally_Voucher_Alteration_Template.xlsx');
  };

  // Download Alteration XML
  const handleDownloadAlterationXml = () => {
    if (modifierVouchers.length === 0) {
      toast.error('No vouchers in modifier list to export.');
      return;
    }
    const xml = generateVoucherAlterationXml(modifierVouchers, companyName);
    const blob = new Blob([xml], { type: 'application/xml;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'Vouchers_Alteration.xml');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`Generated Vouchers_Alteration.xml (${modifierVouchers.length} vouchers with ACTION="Alter")`);
  };

  // Push Alterations to TallyPrime (Port 9000)
  const handlePushAlterationsToTally = async () => {
    if (modifierVouchers.length === 0) {
      toast.error('No vouchers in modifier list to push.');
      return;
    }
    if (!isTallyConnected) {
      const isOnline = await checkTallyConnection();
      if (!isOnline) {
        toast.error(`Cannot connect to TallyPrime on port ${tallyPort}. Ensure Tally is open.`);
        return;
      }
    }

    // Check missing ledgers proactively
    const candidateLedgers = Array.from(
      new Set(
        modifierVouchers
          .flatMap((v) => [v.debitLedger?.trim(), v.creditLedger?.trim()])
          .filter(Boolean)
      )
    );

    try {
      const tallyLedgers = await fetchAllLedgerNames({ host: tallyHost, port: tallyPort });
      const tallyLedgerSet = new Set(tallyLedgers.map((l) => l.name.trim().toLowerCase()));
      const missing = candidateLedgers.filter((name) => !tallyLedgerSet.has(name.toLowerCase()));

      if (missing.length > 0) {
        const items = missing.map((name) => ({
          ledgerName: name,
          parentGroup: inferLedgerGroup(name),
        }));
        setMissingLedgers(items);
        setIsMissingLedgersOpen(true);
        toast.info(`Found ${missing.length} missing ledger(s) required for alteration. Auto-create them below.`);
        return;
      }
    } catch {
      // Proceed if ledger check times out
    }

    // Push with chunking (500 vouchers per chunk)
    const chunkSize = 500;
    const chunks: DualEntryVoucher[][] = [];
    for (let i = 0; i < modifierVouchers.length; i += chunkSize) {
      chunks.push(modifierVouchers.slice(i, i + chunkSize));
    }

    const toastId = toast.loading(`Pushing alterations to TallyPrime (Port ${tallyPort})...`);
    let totalAltered = 0;
    let totalCreated = 0;

    try {
      for (let bIdx = 0; bIdx < chunks.length; bIdx++) {
        const chunk = chunks[bIdx];
        if (chunks.length > 1) {
          toast.loading(`Pushing alteration batch ${bIdx + 1} of ${chunks.length} (${chunk.length} vouchers)...`, { id: toastId });
        }
        const xml = generateVoucherAlterationXml(chunk, companyName);
        const response = await sendTallyRequest(xml, { host: tallyHost, port: tallyPort }, 45000);

        const alteredMatch = response.match(/<ALTERED>(\d+)<\/ALTERED>/i);
        const createdMatch = response.match(/<CREATED>(\d+)<\/CREATED>/i);
        const lineErrorMatch = response.match(/<LINEERROR>([^<]+)<\/LINEERROR>/i);

        const a = alteredMatch ? parseInt(alteredMatch[1], 10) : 0;
        const c = createdMatch ? parseInt(createdMatch[1], 10) : 0;
        const lineError = lineErrorMatch ? lineErrorMatch[1].replace(/&apos;/g, "'").replace(/&amp;/g, '&').trim() : '';

        totalAltered += a;
        totalCreated += c;

        if (lineError && !lineError.includes('Successfully')) {
          const missingLedgerMatch = lineError.match(/Ledger\s+['"]?([^'"]+?)['"]?\s+does not exist/i);
          if (missingLedgerMatch) {
            toast.dismiss(toastId);
            const missingName = missingLedgerMatch[1].trim();
            const guessedGroup = inferLedgerGroup(missingName);
            setMissingLedgers([{ ledgerName: missingName, parentGroup: guessedGroup }]);
            setIsMissingLedgersOpen(true);
            toast.info(`Paused: Ledger "${missingName}" does not exist in Tally. Auto-create it to resume!`);
            return;
          }
        }
      }

      toast.dismiss(toastId);
      setModifierVouchers((prev) =>
        prev.map((v) => ({
          ...v,
          originalVoucherNumber: v.voucherNumber,
          originalDate: v.date,
        }))
      );
      toast.success(`Success! Altered: ${totalAltered.toLocaleString('en-IN')}, Created: ${totalCreated.toLocaleString('en-IN')} in TallyPrime!`, {
        duration: 6000,
      });
    } catch (err: any) {
      toast.dismiss(toastId);
      toast.error(`Push alterations interrupted: ${err.message || 'Cannot reach Tally.'}`);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans">
      {/* 1. TOP EXECUTIVE HEADER */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/90 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                onClick={onBack}
                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors"
                title="Back to Hub"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-rose-500 to-pink-600 text-white flex items-center justify-center shadow-xs">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
                  SUITE 09
                </span>
                <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                  Tally Entries Maker
                </h1>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">
                High-speed tabular voucher ingestion, auto-balancing, and direct Port 9000 XML push
              </p>
            </div>
          </div>

          {/* Manual Tally Connection Controls */}
          <div className="flex items-center gap-2">
            {isTallyConnected ? (
              <div
                onClick={() => setIsSettingsOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-medium cursor-pointer transition-all hover:bg-emerald-100/80 shadow-2xs"
                title="Click to view Tally connection settings"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-mono text-[11px] font-semibold">
                  Tally Connected: {tallyCompany?.name || tallyCompany?.companyName || 'Port ' + tallyPort}
                </span>
                <Settings2 className="w-3.5 h-3.5 text-emerald-600 ml-0.5" />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => checkTallyConnection()}
                disabled={isCheckingTally}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-all hover:border-slate-300 cursor-pointer"
                title="Click to manually connect to TallyPrime on port 9000"
              >
                <Server className="w-3.5 h-3.5 text-slate-500" />
                <span className="font-mono text-[11px]">
                  {isCheckingTally ? 'Connecting...' : `Connect Tally (${tallyPort})`}
                </span>
                <RefreshCw className={`w-3 h-3 text-slate-400 ${isCheckingTally ? 'animate-spin text-rose-600' : ''}`} />
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="p-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-800 shadow-2xs transition-all cursor-pointer"
              title="Tally Port Settings & Diagnostics"
            >
              <Settings2 className="w-3.5 h-3.5" />
            </button>

            {/* Quick XML Actions */}
            <button
              onClick={suiteMode === 'entry' ? handleDownloadXml : handleDownloadAlterationXml}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition-all hover:scale-[1.02] cursor-pointer"
              title={suiteMode === 'entry' ? "Download Vouchers XML (Ctrl+Shift+G)" : "Download Vouchers_Alteration.xml (ACTION=Alter)"}
            >
              <Download className="w-3.5 h-3.5" />
              <span>{suiteMode === 'entry' ? 'Download XML' : 'Download Alteration XML'}</span>
            </button>

            <button
              onClick={suiteMode === 'entry' ? handlePushToTally : handlePushAlterationsToTally}
              disabled={!isTallyConnected}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold shadow-xs transition-all cursor-pointer ${
                isTallyConnected
                  ? suiteMode === 'entry'
                    ? 'bg-rose-600 hover:bg-rose-700 text-white hover:scale-[1.02]'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white hover:scale-[1.02]'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
              title={suiteMode === 'entry' ? "Push directly into active TallyPrime company via Port 9000 (ACTION=Create)" : "Push alterations into active TallyPrime company via Port 9000 (ACTION=Alter)"}
            >
              <Send className="w-3.5 h-3.5" />
              <span>{suiteMode === 'entry' ? 'Push to Tally' : 'Push Alterations'}</span>
            </button>
          </div>
        </div>

        {/* TOP LEVEL MODE SWITCHER: DATA ENTRY STUDIO vs DATA MODIFIER STUDIO */}
        <div className="bg-slate-100/80 border-t border-slate-200/90 px-4 sm:px-6 lg:px-8 py-2">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center p-1 bg-slate-200/90 rounded-xl border border-slate-300/70 shadow-inner">
              <button
                type="button"
                onClick={() => setSuiteMode('entry')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  suiteMode === 'entry'
                    ? 'bg-white text-rose-700 shadow-xs border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Plus className="w-3.5 h-3.5 text-rose-600" />
                <span>Data Entry Studio</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full font-mono bg-rose-50 text-rose-800 border border-rose-200">
                  {multiVouchers.length + masters.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSuiteMode('modifier')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  suiteMode === 'modifier'
                    ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5 text-indigo-600" />
                <span>Data Modifier Studio</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full font-mono bg-indigo-50 text-indigo-800 border border-indigo-200">
                  {modifierVouchers.length}
                </span>
              </button>
            </div>

            <div className="flex items-center gap-3">
              {suiteMode === 'entry' ? (
                <div className="hidden sm:flex items-center gap-2 text-xs text-slate-600">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                  <span className="font-medium">Mode: <strong className="text-slate-800">Universal Multi-Entry Ingestion (ACTION=&quot;Create&quot;)</strong></span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-indigo-900 bg-indigo-50 px-3 py-1 rounded-xl border border-indigo-200">
                  <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" />
                  <span className="font-semibold">Voucher Alteration Studio (ACTION=&quot;Alter&quot;)</span>
                  <span className="text-indigo-300">|</span>
                  <span className="text-[11px] text-indigo-700">Modifies in-place by Date, Vch No &amp; Type</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 2. SUB-NAVIGATION TABS (ENTRY MODE - UNIFIED UNIVERSAL MULTI-ENTRY) */}
        {suiteMode === 'entry' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 border-t border-slate-100 flex items-center justify-between gap-2 overflow-x-auto">
            <nav className="flex space-x-1 py-1.5">
              <button
                onClick={() => {
                  setActiveTab('vouchers');
                  setIssues([]);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  activeTab === 'vouchers'
                    ? 'bg-rose-50 text-rose-700 border border-rose-200/80 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
                }`}
              >
                <span>Universal Vouchers (Multi-Entry)</span>
                <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-white border border-slate-200 font-bold">
                  {multiVouchers.length}
                </span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('gstr2b');
                  setIssues([]);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  activeTab === 'gstr2b'
                    ? 'bg-rose-50 text-rose-700 border border-rose-200/80 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>GSTR-2B Direct Entry</span>
                <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
                  2B
                </span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('masters');
                  setIssues([]);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  activeTab === 'masters'
                    ? 'bg-rose-50 text-rose-700 border border-rose-200/80 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
                }`}
              >
                <span>Masters (Ledgers)</span>
                <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-white border border-slate-200 font-bold">
                  {masters.length}
                </span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('impact');
                  setIssues([]);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  activeTab === 'impact'
                    ? 'bg-rose-50 text-rose-700 border border-rose-200/80 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
                }`}
              >
                <Eye className="w-3.5 h-3.5 text-slate-500" />
                <span>Impact Report</span>
              </button>
            </nav>

            {/* Quick Shortcuts Help Legend */}
            <div className="hidden lg:flex items-center gap-2 text-[11px] text-slate-400 font-mono">
              <span>Ctrl+Shift+V (Validate)</span>
              <span>•</span>
              <span>Ctrl+Shift+T (Fetch Ledgers)</span>
              <span>•</span>
              <span>Ctrl+Shift+G (XML)</span>
            </div>
          </div>
        )}

        {/* 2B. STATUS STRIP (MODIFIER MODE) */}
        {suiteMode === 'modifier' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 border-t border-indigo-100 bg-indigo-50/40 py-2 flex flex-wrap items-center justify-between gap-3 text-xs text-indigo-900">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 font-bold text-[10px] uppercase tracking-wide">
                Live DayBook &amp; Alteration Hub
              </span>
              <span className="text-slate-600">
                {modifierVouchers.length > 0
                  ? `${modifierVouchers.length.toLocaleString('en-IN')} voucher(s) staged for alteration`
                  : 'Fetch existing vouchers from Tally DayBook or upload an Excel to bulk alter ledgers, dates, or narrations.'}
              </span>
            </div>
            <div className="flex items-center gap-2 font-mono text-[11px] text-indigo-700">
              <span>Zero-Merge Alteration Architecture</span>
              <span>•</span>
              <span>Direct Port {tallyPort} Sync</span>
            </div>
          </div>
        )}
      </header>

      {/* 3. MAIN WORKSPACE */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 space-y-4">
        {/* ========================================================================= */}
        {/* MODULE 1: DATA ENTRY STUDIO */}
        {/* ========================================================================= */}
        {suiteMode === 'entry' && (
          <>
            {/* ACTION TOOLBAR */}
        {activeTab !== 'gstr2b' && (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-3 sm:p-4 shadow-2xs flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleValidate}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-800 text-xs font-bold border border-rose-200/80 shadow-2xs transition-all hover:scale-[1.02]"
              title="Shortcut: Ctrl+Shift+V"
            >
              <CheckCircle2 className="w-4 h-4 text-rose-600" />
              <span>Validate Rows</span>
            </button>

            <button
              onClick={handleFetchLedgers}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-800 text-xs font-bold border border-slate-200 shadow-2xs transition-all hover:scale-[1.02]"
              title="Shortcut: Ctrl+Shift+T"
            >
              <Sparkles className="w-4 h-4 text-amber-600" />
              <span>Fetch Ledgers to Masters</span>
            </button>

            {activeTab === 'vouchers' && (
              <>
                <button
                  type="button"
                  onClick={handleAutoBalance}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-200 shadow-2xs transition-all hover:scale-[1.02] cursor-pointer"
                  title="Auto-balance all discrepancies with Round Off legs (Ctrl+Shift+B)"
                >
                  <Zap className="w-4 h-4 text-emerald-600" />
                  <span>Auto-Balance Discrepancies</span>
                </button>

                {/* Hidden File Input for Excel / CSV */}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleExcelFileUpload}
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-200 shadow-2xs transition-all hover:scale-[1.02] cursor-pointer"
                  title="Upload Excel or CSV file (supports both flat 2-leg and multi-line vouchers)"
                >
                  <FileUp className="w-4 h-4 text-emerald-600" />
                  <span>Upload Excel / CSV</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadSampleTemplate}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-200 shadow-2xs transition-all cursor-pointer"
                  title="Download blank sample Excel template with 2-sheet universal layout"
                >
                  <FileDown className="w-4 h-4 text-slate-500" />
                  <span>Download Template</span>
                </button>

                <button
                  type="button"
                  onClick={handlePasteUniversalFromClipboard}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-800 text-xs font-bold border border-blue-200 shadow-2xs transition-all hover:scale-[1.02] cursor-pointer"
                  title="Paste tabular Excel rows from clipboard"
                >
                  <Copy className="w-4 h-4 text-blue-600" />
                  <span>Paste from Excel</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMultiVouchers((prev) => [
                      {
                        id: `vch-${Date.now()}`,
                        date: new Date().toISOString().slice(0, 10),
                        voucherType: 'Purchase',
                        voucherNumber: `VCH-${multiVouchers.length + 1}`,
                        narration: '',
                        legs: [
                          { ledgerName: '', amount: 0 },
                          { ledgerName: '', amount: 0 },
                        ],
                        checkTotal: 0,
                      },
                      ...prev,
                    ]);
                    setVouchersPage(1);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs transition-all hover:scale-[1.02] cursor-pointer"
                  title="Add new voucher"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Voucher</span>
                </button>

                {multiVouchers.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAllVouchers}
                    className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-slate-400 hover:text-rose-600 text-xs font-medium hover:bg-rose-50 transition-all cursor-pointer"
                    title="Clear all voucher rows"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear ({multiVouchers.length.toLocaleString('en-IN')})</span>
                  </button>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">Company:</span>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-800 bg-slate-50 focus:bg-white focus:outline-rose-500 w-48 shadow-2xs"
              placeholder="Tally Target Company"
            />
          </div>
        </div>
        )}

        {/* VALIDATION ISSUES BANNER */}
        {isValidated && issues.length > 0 && (
          <div className="bg-rose-50/90 border border-rose-200 rounded-xl p-3 text-xs text-rose-900 shadow-2xs animate-fadeIn space-y-1">
            <div className="flex items-center gap-2 font-bold text-rose-800">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>Found {issues.length} validation item(s) to review:</span>
            </div>
            <ul className="list-disc pl-5 space-y-0.5 text-[11.5px] max-h-32 overflow-y-auto">
              {issues.slice(0, 10).map((issue, idx) => (
                <li key={idx} className={issue.severity === 'error' ? 'text-rose-700' : 'text-amber-700'}>
                  {issue.message}
                </li>
              ))}
              {issues.length > 10 && (
                <li className="font-semibold text-rose-800">...and {issues.length - 10} more errors.</li>
              )}
            </ul>
          </div>
        )}

        {/* 4. TAB CONTENTS */}

        {/* TAB 1: UNIVERSAL MULTI-ENTRY VOUCHERS STUDIO */}
        {activeTab === 'vouchers' && (
          <div className="space-y-4">
            {/* KPI Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Total Vouchers</p>
                  <p className="text-xl font-bold text-slate-900 mt-0.5">{vouchersStats.totalCount.toLocaleString('en-IN')}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Across all voucher types</p>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-100 text-slate-700">
                  <Layers className="w-5 h-5" />
                </div>
              </div>

              <div className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Balanced Vouchers</p>
                  <p className="text-xl font-bold text-emerald-600 mt-0.5">
                    {(vouchersStats.totalCount - vouchersStats.unbalancedCount).toLocaleString('en-IN')}
                  </p>
                  <p className="text-[11px] text-emerald-600/80 mt-0.5 font-medium">Dr = Cr (Ready to Post)</p>
                </div>
                <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
              </div>

              <div className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Unbalanced Vouchers</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className={`text-xl font-bold ${vouchersStats.unbalancedCount > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                      {vouchersStats.unbalancedCount.toLocaleString('en-IN')}
                    </p>
                    {vouchersStats.unbalancedCount > 0 && (
                      <button
                        type="button"
                        onClick={handleAutoBalance}
                        className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-amber-100 hover:bg-amber-200 text-amber-800 transition-colors"
                        title="Auto-adjust rounding difference across all vouchers"
                      >
                        Auto-Balance
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {vouchersStats.unbalancedCount > 0 ? 'Requires debit/credit adjustment' : 'All vouchers in equilibrium'}
                  </p>
                </div>
                <div className={`p-2.5 rounded-xl ${vouchersStats.unbalancedCount > 0 ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-400'}`}>
                  <AlertTriangle className="w-5 h-5" />
                </div>
              </div>

              <div className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Debit / Credit Totals</p>
                  <p className="text-xs font-mono font-bold text-slate-800 mt-0.5">
                    Dr: ₹{vouchersStats.totalDebit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs font-mono font-bold text-slate-800">
                    Cr: ₹{vouchersStats.totalCredit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </p>
                  {Math.abs(vouchersStats.totalDebit - vouchersStats.totalCredit) > 0.005 ? (
                    <p className="text-[10px] font-mono font-bold text-rose-600">
                      Diff: ₹{Math.abs(vouchersStats.totalDebit - vouchersStats.totalCredit).toFixed(2)}
                    </p>
                  ) : (
                    <p className="text-[10px] text-emerald-600 font-semibold">Perfect Equilibrium</p>
                  )}
                </div>
                <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600">
                  <DollarSign className="w-5 h-5" />
                </div>
              </div>
            </div>

            {/* Filter, Search & Controls Bar */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-3 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
              <div className="flex flex-wrap items-center gap-2.5">
                {/* Search */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={vouchersSearch}
                    onChange={(e) => {
                      setVouchersSearch(e.target.value);
                      setVouchersPage(1);
                    }}
                    placeholder="Search voucher no, ledger, narration..."
                    className="pl-8 pr-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-rose-500 w-60 shadow-2xs"
                  />
                  {vouchersSearch && (
                    <button
                      type="button"
                      onClick={() => setVouchersSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-[10px]"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Voucher Type Filter */}
                <select
                  value={vouchersTypeFilter}
                  onChange={(e) => {
                    setVouchersTypeFilter(e.target.value);
                    setVouchersPage(1);
                  }}
                  className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-rose-500 shadow-2xs"
                >
                  <option value="ALL">All Voucher Types</option>
                  <option value="Purchase">Purchase</option>
                  <option value="Sales">Sales</option>
                  <option value="Payment">Payment</option>
                  <option value="Receipt">Receipt</option>
                  <option value="Journal">Journal</option>
                  <option value="Contra">Contra</option>
                  <option value="Debit Note">Debit Note</option>
                  <option value="Credit Note">Credit Note</option>
                </select>

                {/* Status Filter */}
                <select
                  value={vouchersStatusFilter}
                  onChange={(e) => {
                    setVouchersStatusFilter(e.target.value as any);
                    setVouchersPage(1);
                  }}
                  className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-rose-500 shadow-2xs"
                >
                  <option value="all">All Status</option>
                  <option value="balanced">Balanced Only (Dr = Cr)</option>
                  <option value="unbalanced">Unbalanced Only</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const newVch: MultiEntryVoucher = {
                      id: `m-${Date.now()}`,
                      date: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
                      voucherType: vouchersTypeFilter !== 'ALL' ? vouchersTypeFilter : 'Journal',
                      voucherNumber: `VCH-${(multiVouchers.length + 1).toString().padStart(4, '0')}`,
                      narration: '',
                      legs: [
                        { ledgerName: '', amount: 0 },
                        { ledgerName: '', amount: 0 },
                      ],
                    };
                    setMultiVouchers((prev) => [newVch, ...prev]);
                    setVouchersPage(1);
                    toast.success('Added new multi-leg voucher');
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-2xs transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Voucher</span>
                </button>
              </div>
            </div>

            {/* Vouchers Container */}
            {multiVouchers.length === 0 ? (
              <div className="bg-white border border-slate-200/90 rounded-2xl p-12 text-center shadow-2xs">
                <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4 border border-rose-100 shadow-2xs">
                  <FileSpreadsheet className="w-7 h-7" />
                </div>
                <h3 className="text-base font-bold text-slate-800">No Vouchers in Studio</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto mt-1.5 leading-relaxed">
                  Import bank statements, purchase/sales registers, or payroll entries from Excel, paste directly from clipboard, or create your first voucher manually.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2.5 mt-6">
                  <button
                    type="button"
                    onClick={() => {
                      const newVch: MultiEntryVoucher = {
                        id: `m-${Date.now()}`,
                        date: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
                        voucherType: 'Journal',
                        voucherNumber: 'VCH-0001',
                        narration: '',
                        legs: [
                          { ledgerName: '', amount: 0 },
                          { ledgerName: '', amount: 0 },
                        ],
                      };
                      setMultiVouchers([newVch]);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-2xs transition-all cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Create First Voucher</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold border border-slate-200 shadow-2xs transition-all cursor-pointer"
                  >
                    <FileUp className="w-4 h-4 text-emerald-600" />
                    <span>Upload Excel File</span>
                  </button>
                  <button
                    type="button"
                    onClick={handlePasteUniversalFromClipboard}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold border border-slate-200 shadow-2xs transition-all cursor-pointer"
                  >
                    <Copy className="w-4 h-4 text-blue-600" />
                    <span>Paste from Clipboard</span>
                  </button>
                </div>
              </div>
            ) : filteredMultiVouchers.length === 0 ? (
              <div className="bg-white border border-slate-200/90 rounded-2xl p-10 text-center shadow-2xs">
                <Search className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-700">No Vouchers Match Filters</p>
                <p className="text-xs text-slate-400 mt-1">Try clearing your search query or changing the voucher type / status filter.</p>
                <button
                  type="button"
                  onClick={() => {
                    setVouchersSearch('');
                    setVouchersTypeFilter('ALL');
                    setVouchersStatusFilter('all');
                  }}
                  className="mt-4 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
                >
                  Reset Filters
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {paginatedMultiVouchers.map((vch, vIdx) => {
                  let vSum = 0;
                  let vDr = 0;
                  let vCr = 0;
                  (vch.legs || []).forEach((l) => {
                    const amt = cleanNumericAmount(l.amount);
                    vSum += amt;
                    if (amt < 0) vDr += Math.abs(amt);
                    else if (amt > 0) vCr += amt;
                  });
                  const isBalanced = Math.abs(Math.round(vSum * 100) / 100) <= 0.005;
                  const diff = Math.abs(Math.round(vSum * 100) / 100);

                  const voucherTypeBadgeColors: Record<string, string> = {
                    Purchase: 'bg-blue-50 text-blue-700 border-blue-200',
                    Sales: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                    Payment: 'bg-rose-50 text-rose-700 border-rose-200',
                    Receipt: 'bg-teal-50 text-teal-700 border-teal-200',
                    Journal: 'bg-amber-50 text-amber-700 border-amber-200',
                    Contra: 'bg-purple-50 text-purple-700 border-purple-200',
                    'Debit Note': 'bg-orange-50 text-orange-700 border-orange-200',
                    'Credit Note': 'bg-cyan-50 text-cyan-700 border-cyan-200',
                  };

                  return (
                    <div
                      key={vch.id}
                      className={`bg-white border rounded-2xl shadow-2xs overflow-hidden transition-all ${
                        isBalanced ? 'border-slate-200 hover:border-slate-300' : 'border-amber-300 ring-1 ring-amber-200/50'
                      }`}
                    >
                      {/* Voucher Card Header */}
                      <div className="p-3 bg-slate-50/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2.5 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono font-bold text-slate-400 text-[11px] px-1.5 py-0.5 rounded bg-slate-200/60">
                            #{(currentVouchersPage - 1) * vouchersPageSize + vIdx + 1}
                          </span>

                          {/* Voucher Type Selector */}
                          <select
                            value={vch.voucherType || 'Journal'}
                            onChange={(e) => {
                              const newType = e.target.value;
                              setMultiVouchers((prev) =>
                                prev.map((item) => (item.id === vch.id ? { ...item, voucherType: newType } : item))
                              );
                            }}
                            className={`px-2 py-0.5 rounded-lg text-xs font-bold border ${
                              voucherTypeBadgeColors[vch.voucherType] || 'bg-slate-100 text-slate-700 border-slate-200'
                            }`}
                          >
                            <option value="Purchase">Purchase</option>
                            <option value="Sales">Sales</option>
                            <option value="Payment">Payment</option>
                            <option value="Receipt">Receipt</option>
                            <option value="Journal">Journal</option>
                            <option value="Contra">Contra</option>
                            <option value="Debit Note">Debit Note</option>
                            <option value="Credit Note">Credit Note</option>
                          </select>

                          {/* Voucher Date */}
                          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-0.5">
                            <span className="text-[10px] uppercase font-bold text-slate-400">Date:</span>
                            <input
                              type="text"
                              value={vch.date || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setMultiVouchers((prev) =>
                                  prev.map((item) => (item.id === vch.id ? { ...item, date: val } : item))
                                );
                              }}
                              placeholder="YYYYMMDD"
                              className="font-mono text-xs text-slate-800 bg-transparent focus:outline-none w-24"
                            />
                          </div>

                          {/* Voucher Number */}
                          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-0.5">
                            <span className="text-[10px] uppercase font-bold text-slate-400">Vch No:</span>
                            <input
                              type="text"
                              value={vch.voucherNumber || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setMultiVouchers((prev) =>
                                  prev.map((item) => (item.id === vch.id ? { ...item, voucherNumber: val } : item))
                                );
                              }}
                              placeholder="e.g. PUR/001"
                              className="font-mono text-xs text-slate-800 bg-transparent focus:outline-none w-24"
                            />
                          </div>

                          {/* Ref Number (Optional) */}
                          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-0.5">
                            <span className="text-[10px] uppercase font-bold text-slate-400">Ref:</span>
                            <input
                              type="text"
                              value={vch.referenceNumber || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setMultiVouchers((prev) =>
                                  prev.map((item) => (item.id === vch.id ? { ...item, referenceNumber: val } : item))
                                );
                              }}
                              placeholder="Bill / Chq No"
                              className="font-mono text-xs text-slate-800 bg-transparent focus:outline-none w-20"
                            />
                          </div>
                        </div>

                        {/* Balance Status & Actions */}
                        <div className="flex items-center gap-2">
                          {isBalanced ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Balanced: ₹{vDr.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                            </span>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                <span>Diff: ₹{diff.toFixed(2)}</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setMultiVouchers((prev) =>
                                    prev.map((item) =>
                                      item.id === vch.id ? autoBalanceMultiEntry(item, 'Round Off') : item
                                    )
                                  );
                                  toast.success('Auto-balanced voucher with Round Off');
                                }}
                                className="px-2 py-0.5 rounded-md bg-amber-500 hover:bg-amber-600 text-white font-bold text-[10px] transition-all cursor-pointer"
                                title="Auto add or adjust Round Off leg to balance"
                              >
                                Auto-Balance
                              </button>
                            </div>
                          )}

                          {/* Duplicate Voucher */}
                          <button
                            type="button"
                            onClick={() => {
                              const cloned: MultiEntryVoucher = {
                                ...vch,
                                id: `m-${Date.now()}`,
                                voucherNumber: `${vch.voucherNumber || 'VCH'}-COPY`,
                                legs: (vch.legs || []).map((l) => ({ ...l })),
                              };
                              setMultiVouchers((prev) => [cloned, ...prev]);
                              toast.success('Duplicated voucher');
                            }}
                            className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-200/60"
                            title="Duplicate voucher"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete Voucher */}
                          <button
                            type="button"
                            onClick={() => {
                              setMultiVouchers((prev) => prev.filter((item) => item.id !== vch.id));
                              toast.info('Deleted voucher');
                            }}
                            className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                            title="Delete voucher"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Legs Table */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left border-collapse">
                          <thead className="bg-slate-100/70 text-slate-500 border-b border-slate-200 text-[11px] font-semibold">
                            <tr>
                              <th className="py-2 px-3 w-10 text-center">#</th>
                              <th className="py-2 px-3 w-28">Type (Dr / Cr)</th>
                              <th className="py-2 px-3">Ledger Name</th>
                              <th className="py-2 px-3 w-40 text-right">Debit (₹)</th>
                              <th className="py-2 px-3 w-40 text-right">Credit (₹)</th>
                              <th className="py-2 px-3 w-12 text-center"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {(vch.legs || []).map((leg, lIdx) => {
                              const legAmt = cleanNumericAmount(leg.amount);
                              const isDebit = legAmt < 0;
                              const absAmt = Math.abs(legAmt);

                              return (
                                <tr key={lIdx} className="hover:bg-slate-50/50 transition-colors">
                                  <td className="py-2 px-3 text-center text-slate-400 font-mono text-[11px]">
                                    {lIdx + 1}
                                  </td>

                                  {/* Dr / Cr Selector */}
                                  <td className="py-2 px-3">
                                    <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-100">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const newAmt = absAmt === 0 ? 0 : -absAmt;
                                          setMultiVouchers((prev) =>
                                            prev.map((item) =>
                                              item.id === vch.id
                                                ? {
                                                    ...item,
                                                    legs: item.legs.map((l, i) =>
                                                      i === lIdx ? { ...l, amount: newAmt } : l
                                                    ),
                                                  }
                                                : item
                                            )
                                          );
                                        }}
                                        className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all ${
                                          isDebit
                                            ? 'bg-blue-600 text-white shadow-2xs'
                                            : 'text-slate-600 hover:text-slate-900'
                                        }`}
                                      >
                                        Dr
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const newAmt = absAmt === 0 ? 0 : absAmt;
                                          setMultiVouchers((prev) =>
                                            prev.map((item) =>
                                              item.id === vch.id
                                                ? {
                                                    ...item,
                                                    legs: item.legs.map((l, i) =>
                                                      i === lIdx ? { ...l, amount: newAmt } : l
                                                    ),
                                                  }
                                                : item
                                            )
                                          );
                                        }}
                                        className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all ${
                                          !isDebit
                                            ? 'bg-emerald-600 text-white shadow-2xs'
                                            : 'text-slate-600 hover:text-slate-900'
                                        }`}
                                      >
                                        Cr
                                      </button>
                                    </div>
                                  </td>

                                  {/* Ledger Name Input with Datalist */}
                                  <td className="py-2 px-3">
                                    <div className="relative">
                                      <input
                                        type="text"
                                        value={leg.ledgerName || ''}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          setMultiVouchers((prev) =>
                                            prev.map((item) =>
                                              item.id === vch.id
                                                ? {
                                                    ...item,
                                                    legs: item.legs.map((l, i) =>
                                                      i === lIdx ? { ...l, ledgerName: val } : l
                                                    ),
                                                  }
                                                : item
                                            )
                                          );
                                        }}
                                        placeholder="Type or select ledger name..."
                                        list={`ledgers-list-${vch.id}-${lIdx}`}
                                        className="w-full px-2.5 py-1 text-xs rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-rose-500 font-medium"
                                      />
                                      <datalist id={`ledgers-list-${vch.id}-${lIdx}`}>
                                        {masters.map((m) => (
                                          <option key={m.id} value={m.ledgerName}>
                                            {m.ledgerName} ({m.parentGroup})
                                          </option>
                                        ))}
                                      </datalist>
                                    </div>
                                  </td>

                                  {/* Debit Amount */}
                                  <td className="py-2 px-3 text-right">
                                    {isDebit ? (
                                      <input
                                        type="number"
                                        step="0.01"
                                        value={absAmt === 0 ? '' : absAmt}
                                        onChange={(e) => {
                                          const val = parseFloat(e.target.value) || 0;
                                          setMultiVouchers((prev) =>
                                            prev.map((item) =>
                                              item.id === vch.id
                                                ? {
                                                    ...item,
                                                    legs: item.legs.map((l, i) =>
                                                      i === lIdx ? { ...l, amount: -Math.abs(val) } : l
                                                    ),
                                                  }
                                                : item
                                            )
                                          );
                                        }}
                                        placeholder="0.00"
                                        className="w-full text-right px-2.5 py-1 text-xs font-mono font-bold rounded-lg border border-blue-200 bg-blue-50/40 text-blue-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                      />
                                    ) : (
                                      <span className="text-slate-300 font-mono text-xs pr-2">-</span>
                                    )}
                                  </td>

                                  {/* Credit Amount */}
                                  <td className="py-2 px-3 text-right">
                                    {!isDebit ? (
                                      <input
                                        type="number"
                                        step="0.01"
                                        value={absAmt === 0 ? '' : absAmt}
                                        onChange={(e) => {
                                          const val = parseFloat(e.target.value) || 0;
                                          setMultiVouchers((prev) =>
                                            prev.map((item) =>
                                              item.id === vch.id
                                                ? {
                                                    ...item,
                                                    legs: item.legs.map((l, i) =>
                                                      i === lIdx ? { ...l, amount: Math.abs(val) } : l
                                                    ),
                                                  }
                                                : item
                                            )
                                          );
                                        }}
                                        placeholder="0.00"
                                        className="w-full text-right px-2.5 py-1 text-xs font-mono font-bold rounded-lg border border-emerald-200 bg-emerald-50/40 text-emerald-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                      />
                                    ) : (
                                      <span className="text-slate-300 font-mono text-xs pr-2">-</span>
                                    )}
                                  </td>

                                  {/* Delete Leg */}
                                  <td className="py-2 px-3 text-center">
                                    <button
                                      type="button"
                                      disabled={(vch.legs || []).length <= 2}
                                      onClick={() => {
                                        setMultiVouchers((prev) =>
                                          prev.map((item) =>
                                            item.id === vch.id
                                              ? {
                                                  ...item,
                                                  legs: item.legs.filter((_, i) => i !== lIdx),
                                                }
                                              : item
                                          )
                                        );
                                      }}
                                      className={`p-1 rounded transition-colors ${
                                        (vch.legs || []).length > 2
                                          ? 'text-slate-300 hover:text-rose-500 hover:bg-rose-50'
                                          : 'text-slate-200 cursor-not-allowed'
                                      }`}
                                      title={(vch.legs || []).length > 2 ? 'Delete line' : 'A voucher requires at least 2 legs'}
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Voucher Card Footer (Narration & Totals) */}
                      <div className="p-3 bg-slate-50/50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                        {/* Narration & Add Leg */}
                        <div className="flex-1 min-w-[280px] flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setMultiVouchers((prev) =>
                                prev.map((item) =>
                                  item.id === vch.id
                                    ? {
                                        ...item,
                                        legs: [...(item.legs || []), { ledgerName: '', amount: 0 }],
                                      }
                                    : item
                                )
                              );
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-200/80 hover:bg-slate-300 text-slate-800 text-[11px] font-bold transition-all shrink-0 cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Add Line</span>
                          </button>

                          <div className="flex-1 flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1 shadow-2xs">
                            <span className="text-[10px] font-bold uppercase text-slate-400 shrink-0">Narration:</span>
                            <input
                              type="text"
                              value={vch.narration || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setMultiVouchers((prev) =>
                                  prev.map((item) => (item.id === vch.id ? { ...item, narration: val } : item))
                                );
                              }}
                              placeholder="e.g. Being payment towards invoice..."
                              className="w-full text-xs text-slate-700 bg-transparent focus:outline-none"
                            />
                          </div>
                        </div>

                        {/* Summary Totals */}
                        <div className="flex items-center gap-3 font-mono text-[11px] shrink-0">
                          <span className="text-blue-700 font-bold">
                            Total Dr: ₹{vDr.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                          <span className="text-slate-300">|</span>
                          <span className="text-emerald-700 font-bold">
                            Total Cr: ₹{vCr.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                          <span className="text-slate-300">|</span>
                          <span className={`font-bold ${diff > 0.005 ? 'text-amber-600' : 'text-slate-500'}`}>
                            Diff: ₹{diff.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Bottom Pagination */}
                {totalVouchersPages > 1 && (
                  <div className="bg-white border border-slate-200/90 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 shadow-2xs">
                    <div>
                      Showing {(currentVouchersPage - 1) * vouchersPageSize + 1} to{' '}
                      {Math.min(currentVouchersPage * vouchersPageSize, filteredMultiVouchers.length)} of{' '}
                      {filteredMultiVouchers.length.toLocaleString('en-IN')} vouchers
                      {vouchersSearch && ` (filtered from ${multiVouchers.length.toLocaleString('en-IN')} total)`}
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-400">Rows per page:</span>
                        <select
                          value={vouchersPageSize}
                          onChange={(e) => {
                            setVouchersPageSize(parseInt(e.target.value, 10));
                            setVouchersPage(1);
                          }}
                          className="px-2 py-0.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold"
                        >
                          <option value="25">25</option>
                          <option value="50">50</option>
                          <option value="100">100</option>
                          <option value="250">250</option>
                        </select>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={currentVouchersPage <= 1}
                          onClick={() => setVouchersPage((p) => Math.max(1, p - 1))}
                          className="p-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700"
                          title="Previous page"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>

                        <span className="font-semibold text-slate-800 px-2">
                          Page {currentVouchersPage} of {totalVouchersPages}
                        </span>

                        <button
                          type="button"
                          disabled={currentVouchersPage >= totalVouchersPages}
                          onClick={() => setVouchersPage((p) => Math.min(totalVouchersPages, p + 1))}
                          className="p-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700"
                          title="Next page"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: GSTR-2B DIRECT INWARD ENTRY */}
        {activeTab === 'gstr2b' && (
          <Gstr2bDirectEntryTab
            tallyHost={tallyHost}
            tallyPort={tallyPort}
            isTallyConnected={isTallyConnected}
            tallyCompany={tallyCompany}
            onLoadIntoStudio={(vchs, mstrs) => {
              setMultiVouchers(vchs);
              setMasters((prev) => {
                const existing = new Set(prev.map((m) => m.ledgerName.toLowerCase().trim()));
                const newMasters = mstrs.filter((m) => !existing.has(m.ledgerName.toLowerCase().trim()));
                return [...prev, ...newMasters];
              });
              setActiveTab('vouchers');
            }}
          />
        )}

        {/* TAB 4: MASTERS (LEDGERS) TABLE */}
        {activeTab === 'masters' && (
          <div className="bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-hidden">
            <div className="p-3.5 bg-slate-50/60 border-b border-slate-200 flex items-center justify-between text-xs text-slate-600">
              <span className="font-semibold">
                Ledger Masters (Bulk create parties, groups, opening balances & GSTINs)
              </span>
              <button
                onClick={() =>
                  setMasters((prev) => [
                    ...prev,
                    {
                      id: `l-${Date.now()}`,
                      ledgerName: 'New Master Ledger',
                      parentGroup: 'Sundry Creditors',
                      country: 'India',
                      openingBalance: 0,
                    },
                  ])
                }
                className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 hover:text-rose-700"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Ledger</span>
              </button>
            </div>

            <div className="overflow-x-auto max-h-[580px]">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100/80 sticky top-0 z-10 text-[11px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2.5 w-12 text-center">#</th>
                    <th className="px-3 py-2.5 w-56">Ledger Name*</th>
                    <th className="px-3 py-2.5 w-44">Parent Group*</th>
                    <th className="px-3 py-2.5 w-36">GSTIN</th>
                    <th className="px-3 py-2.5 w-32">State</th>
                    <th className="px-3 py-2.5 w-24">PIN</th>
                    <th className="px-3 py-2.5 w-32 text-right">Opening Bal (₹)</th>
                    <th className="px-2 py-2.5 w-10 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11.5px]">
                  {masters.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-16 text-center text-slate-400 font-sans">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Server className="w-10 h-10 text-slate-300 stroke-[1.5]" />
                          <span className="font-semibold text-slate-700 text-sm">No Ledger Masters Defined</span>
                          <span className="text-xs text-slate-400 max-w-sm">
                            Click <strong className="text-rose-600 font-bold">+ Add Ledger</strong> or use <strong className="text-amber-600 font-bold">Fetch Ledgers to Masters</strong> to auto-extract missing ledgers from your voucher rows.
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    masters.map((m, idx) => (
                    <tr key={m.id || idx} className="hover:bg-slate-50/80">
                      <td className="px-3 py-2 text-center text-slate-400">{idx + 1}</td>
                      <td className="px-2 py-1.5 font-sans font-semibold text-slate-900">
                        <input
                          type="text"
                          value={m.ledgerName}
                          onChange={(e) => {
                            const updated = [...masters];
                            updated[idx].ledgerName = e.target.value;
                            setMasters(updated);
                          }}
                          className="w-full px-2 py-1 bg-transparent border border-transparent hover:border-slate-300 focus:bg-white rounded"
                        />
                      </td>
                      <td className="px-2 py-1.5 font-sans">
                        <select
                          value={m.parentGroup}
                          onChange={(e) => {
                            const updated = [...masters];
                            updated[idx].parentGroup = e.target.value;
                            setMasters(updated);
                          }}
                          className="w-full px-2 py-1 bg-transparent border border-transparent hover:border-slate-300 focus:bg-white rounded font-sans text-xs"
                        >
                          {STANDARD_MASTER_GROUPS.map((g) => (
                            <option key={g} value={g}>
                              {g}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="text"
                          value={m.gstin || ''}
                          onChange={(e) => {
                            const updated = [...masters];
                            updated[idx].gstin = e.target.value.toUpperCase();
                            setMasters(updated);
                          }}
                          className="w-full px-2 py-1 bg-transparent border border-transparent hover:border-slate-300 focus:bg-white rounded"
                          placeholder="15-digit GSTIN"
                        />
                      </td>
                      <td className="px-2 py-1.5 font-sans">
                        <input
                          type="text"
                          value={m.state || ''}
                          onChange={(e) => {
                            const updated = [...masters];
                            updated[idx].state = e.target.value;
                            setMasters(updated);
                          }}
                          className="w-full px-2 py-1 bg-transparent border border-transparent hover:border-slate-300 focus:bg-white rounded"
                          placeholder="State"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="text"
                          value={m.pincode || ''}
                          onChange={(e) => {
                            const updated = [...masters];
                            updated[idx].pincode = e.target.value;
                            setMasters(updated);
                          }}
                          className="w-full px-2 py-1 bg-transparent border border-transparent hover:border-slate-300 focus:bg-white rounded"
                          placeholder="6-digit PIN"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right font-bold text-slate-800">
                        <input
                          type="number"
                          value={m.openingBalance || ''}
                          onChange={(e) => {
                            const updated = [...masters];
                            updated[idx].openingBalance = parseFloat(e.target.value) || 0;
                            setMasters(updated);
                          }}
                          className="w-full px-2 py-1 text-right bg-transparent border border-transparent hover:border-slate-300 focus:bg-white rounded"
                          placeholder="0.00"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <button
                          onClick={() => {
                            setMasters((prev) => prev.filter((_, i) => i !== idx));
                          }}
                          className="text-slate-300 hover:text-rose-500"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {/* TAB 5: PRE-IMPORT IMPACT REPORT */}
        {activeTab === 'impact' && (
          <div className="bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-hidden p-4 space-y-4">
            <div className="flex items-center justify-between text-xs text-slate-600 border-b pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  Pre-Import Financial Scrutiny & Ledger Impact
                </h3>
                <p className="text-slate-500 text-[11.5px]">
                  Simulates the net financial impact on each Tally ledger before pushing XML.
                </p>
              </div>

              {/* Total double entry invariant badge */}
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs px-3 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold">
                  Double-Entry Parity: Guaranteed (Sum = ₹0.00)
                </span>
              </div>
            </div>

            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100/80 sticky top-0 z-10 text-[11px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2.5">Ledger Name</th>
                    <th className="px-3 py-2.5 text-center w-20">Txn Count</th>
                    <th className="px-3 py-2.5 text-right w-36">Total Debit (₹)</th>
                    <th className="px-3 py-2.5 text-right w-36">Total Credit (₹)</th>
                    <th className="px-3 py-2.5 text-right w-36">Net Impact (Dr - Cr)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11.5px]">
                  {impactData.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-16 text-center text-slate-400 font-sans">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <DollarSign className="w-10 h-10 text-slate-300 stroke-[1.5]" />
                          <span className="font-semibold text-slate-700 text-sm">No Ledger Activity to Analyze</span>
                          <span className="text-xs text-slate-400 max-w-sm">
                            Add transactions in Dual Entry, Multi Entry, or Quick Columnar tabs to view the simulated pre-import financial impact.
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    impactData.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/80">
                      <td className="px-3 py-2 font-sans font-semibold text-slate-800">
                        {row.ledgerName}
                      </td>
                      <td className="px-3 py-2 text-center text-slate-500">{row.count}</td>
                      <td className="px-3 py-2 text-right font-medium text-blue-700">
                        ₹{row.totalDebit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-emerald-700">
                        ₹{row.totalCredit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td
                        className={`px-3 py-2 text-right font-bold ${
                          row.netImpact > 0
                            ? 'text-blue-900'
                            : row.netImpact < 0
                            ? 'text-emerald-900'
                            : 'text-slate-400'
                        }`}
                      >
                        ₹{row.netImpact.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
          </>
        )}

        {/* ========================================================================= */}
        {/* MODULE 2: DATA MODIFIER STUDIO (ACTION="Alter") */}
        {/* ========================================================================= */}
        {suiteMode === 'modifier' && (
          <div className="space-y-4">
            {/* Hidden file input for Modifier Excel / CSV */}
            <input
              type="file"
              ref={modifierFileInputRef}
              onChange={handleUploadModifierExcel}
              accept=".xlsx,.xls,.csv"
              className="hidden"
            />

            {/* 1. TOP MODIFIER ACTIONS TOOLBAR */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-3 sm:p-4 shadow-2xs flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleFetchFromTallyDayBook}
                  disabled={isFetchingDayBook}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-xs font-bold border border-indigo-200/80 shadow-2xs transition-all hover:scale-[1.02] cursor-pointer"
                  title="Query and pull existing vouchers from TallyPrime DayBook via Port 9000"
                >
                  <RefreshCw className={`w-4 h-4 text-indigo-600 ${isFetchingDayBook ? 'animate-spin' : ''}`} />
                  <span>{isFetchingDayBook ? 'Fetching DayBook...' : 'Fetch from Tally DayBook'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => modifierFileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-200 shadow-2xs transition-all hover:scale-[1.02] cursor-pointer"
                  title="Upload Excel or CSV file containing vouchers to modify"
                >
                  <FileUp className="w-4 h-4 text-emerald-600" />
                  <span>Upload Excel to Modify</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopyFromEntryToModifier}
                  disabled={multiVouchers.length === 0}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border shadow-2xs transition-all cursor-pointer ${
                    multiVouchers.length > 0
                      ? 'bg-blue-50 hover:bg-blue-100 text-blue-800 border-blue-200 hover:scale-[1.02]'
                      : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                  }`}
                  title="Copy active vouchers from Data Entry Studio into Modifier Studio"
                >
                  <Copy className="w-4 h-4 text-blue-600" />
                  <span>Copy from Entry Studio ({multiVouchers.length})</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadModifierTemplate}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-200 shadow-2xs transition-all cursor-pointer"
                  title="Download blank alteration Excel template"
                >
                  <FileDown className="w-4 h-4 text-slate-500" />
                  <span>Alteration Template</span>
                </button>

                <button
                  type="button"
                  onClick={handleModifierAddRow}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold border border-slate-200 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-slate-600" />
                  <span>Add Row</span>
                </button>

                {modifierVouchers.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAllModifier}
                    className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-slate-400 hover:text-rose-600 text-xs font-medium hover:bg-rose-50 transition-all cursor-pointer"
                    title="Clear all modifier rows"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear Grid</span>
                  </button>
                )}
              </div>

              {/* Right Side Push & XML Export */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadAlterationXml}
                  disabled={modifierVouchers.length === 0}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold shadow-xs transition-all ${
                    modifierVouchers.length > 0
                      ? 'bg-slate-900 hover:bg-slate-800 text-white hover:scale-[1.02] cursor-pointer'
                      : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  }`}
                  title="Download Vouchers_Alteration.xml (ACTION=Alter)"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Alteration XML</span>
                </button>

                <button
                  type="button"
                  onClick={handlePushAlterationsToTally}
                  disabled={modifierVouchers.length === 0 || !isTallyConnected}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold shadow-xs transition-all ${
                    modifierVouchers.length > 0 && isTallyConnected
                      ? 'bg-indigo-600 hover:bg-indigo-700 text-white hover:scale-[1.02] cursor-pointer'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                  title="Push alterations directly into active TallyPrime company via Port 9000 (ACTION=Alter)"
                >
                  <Send className="w-4 h-4" />
                  <span>Push Alterations to Tally</span>
                </button>
              </div>
            </div>

            {/* 2. BULK BATCH MODIFIERS TOOLBAR (Find & Replace, Bulk Date, Bulk Narration) */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                  <SlidersHorizontal className="w-4 h-4 text-indigo-600" />
                  <span>Bulk Find &amp; Replace &amp; Batch Modifiers</span>
                </div>
                <span className="text-[11px] text-slate-400 font-normal">
                  Applies instantly in memory across all {modifierVouchers.length.toLocaleString('en-IN')} rows
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
                {/* Find & Replace Ledger */}
                <div className="lg:col-span-6 flex flex-wrap sm:flex-nowrap items-center gap-2 p-2 bg-slate-50/80 rounded-xl border border-slate-200/80">
                  <div className="text-[11px] font-bold text-slate-700 whitespace-nowrap">Replace Ledger:</div>
                  <input
                    type="text"
                    value={findLedger}
                    onChange={(e) => setFindLedger(e.target.value)}
                    placeholder="Find Ledger (e.g. Suspense)"
                    className="flex-1 min-w-[130px] px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <input
                    type="text"
                    value={replaceLedger}
                    onChange={(e) => setReplaceLedger(e.target.value)}
                    placeholder="Replace With (e.g. HDFC Bank)"
                    className="flex-1 min-w-[130px] px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <select
                    value={findReplaceTarget}
                    onChange={(e) => setFindReplaceTarget(e.target.value as any)}
                    className="px-2 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-700"
                  >
                    <option value="both">Both Dr &amp; Cr</option>
                    <option value="debit">Debit Only</option>
                    <option value="credit">Credit Only</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleBulkReplaceLedger}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white whitespace-nowrap shadow-2xs transition-all cursor-pointer"
                  >
                    Replace All
                  </button>
                </div>

                {/* Bulk Date */}
                <div className="lg:col-span-3 flex items-center gap-2 p-2 bg-slate-50/80 rounded-xl border border-slate-200/80">
                  <div className="text-[11px] font-bold text-slate-700 whitespace-nowrap">Bulk Date:</div>
                  <input
                    type="date"
                    value={bulkDate}
                    onChange={(e) => setBulkDate(e.target.value)}
                    className="flex-1 px-2 py-1.5 text-xs rounded-lg border border-slate-200 bg-white font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleBulkApplyDate}
                    className="px-2.5 py-1.5 text-xs font-bold rounded-lg bg-slate-800 hover:bg-slate-900 text-white whitespace-nowrap transition-all cursor-pointer"
                  >
                    Apply
                  </button>
                </div>

                {/* Bulk Narration */}
                <div className="lg:col-span-3 flex items-center gap-2 p-2 bg-slate-50/80 rounded-xl border border-slate-200/80">
                  <input
                    type="text"
                    value={bulkNarration}
                    onChange={(e) => setBulkNarration(e.target.value)}
                    placeholder="Narration update..."
                    className="flex-1 min-w-[100px] px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <select
                    value={bulkNarrationMode}
                    onChange={(e) => setBulkNarrationMode(e.target.value as any)}
                    className="px-1.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-700"
                  >
                    <option value="append">Append</option>
                    <option value="replace">Replace</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleBulkApplyNarration}
                    className="px-2.5 py-1.5 text-xs font-bold rounded-lg bg-slate-800 hover:bg-slate-900 text-white whitespace-nowrap transition-all cursor-pointer"
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>

            {/* 3. KPI SUMMARY & METRICS CARDS */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white border border-slate-200/80 rounded-xl p-3 shadow-2xs">
                <div className="text-[11px] text-slate-500 font-medium">Vouchers to Alter</div>
                <div className="text-lg font-bold text-slate-900 font-mono">
                  {modifierVouchers.length.toLocaleString('en-IN')}
                </div>
              </div>
              <div className="bg-white border border-slate-200/80 rounded-xl p-3 shadow-2xs">
                <div className="text-[11px] text-slate-500 font-medium">Total Value to Alter</div>
                <div className="text-lg font-bold text-indigo-700 font-mono">
                  ₹{totalModifierDebit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div className="bg-white border border-slate-200/80 rounded-xl p-3 shadow-2xs">
                <div className="text-[11px] text-slate-500 font-medium">Unique Debit Ledgers</div>
                <div className="text-lg font-bold text-slate-800 font-mono">
                  {uniqueModifierDebits}
                </div>
              </div>
              <div className="bg-white border border-slate-200/80 rounded-xl p-3 shadow-2xs">
                <div className="text-[11px] text-slate-500 font-medium">Unique Credit Ledgers</div>
                <div className="text-lg font-bold text-slate-800 font-mono">
                  {uniqueModifierCredits}
                </div>
              </div>
            </div>

            {/* 4. SEARCH & PAGINATION HEADER */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-3 shadow-2xs flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-1 max-w-md">
                <div className="relative w-full">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={modifierSearch}
                    onChange={(e) => {
                      setModifierSearch(e.target.value);
                      setModifierPage(1);
                    }}
                    placeholder="Search by Voucher No, Ledger, Narration, Amount..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  />
                </div>
                {modifierSearch && (
                  <button
                    type="button"
                    onClick={() => {
                      setModifierSearch('');
                      setModifierPage(1);
                    }}
                    className="text-[11px] text-slate-500 hover:text-slate-800 whitespace-nowrap cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs text-slate-600">
                  <span>Rows:</span>
                  <select
                    value={modifierPageSize}
                    onChange={(e) => {
                      setModifierPageSize(Number(e.target.value));
                      setModifierPage(1);
                    }}
                    className="px-2 py-1 text-xs rounded-lg border border-slate-200 bg-white font-mono"
                  >
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={250}>250</option>
                    <option value={500}>500</option>
                  </select>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setModifierPage((p) => Math.max(1, p - 1))}
                    disabled={currentModifierPage <= 1}
                    className="p-1 rounded-lg border border-slate-200 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-50 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4 text-slate-600" />
                  </button>
                  <span className="text-xs font-mono px-2 text-slate-700">
                    Page {currentModifierPage} of {totalModifierPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setModifierPage((p) => Math.min(totalModifierPages, p + 1))}
                    disabled={currentModifierPage >= totalModifierPages}
                    className="p-1 rounded-lg border border-slate-200 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-50 cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4 text-slate-600" />
                  </button>
                </div>
              </div>
            </div>

            {/* 5. HIGH PERFORMANCE EDITABLE TABLE */}
            <div className="bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-hidden">
              <div className="overflow-x-auto max-h-[580px]">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-slate-100/80 sticky top-0 z-10 border-b border-slate-200 text-slate-700 font-semibold tracking-wider uppercase text-[10px]">
                    <tr>
                      <th className="px-3 py-2.5 w-12 text-center">#</th>
                      <th className="px-3 py-2.5 w-28">Date</th>
                      <th className="px-3 py-2.5 w-28">Vch Type</th>
                      <th className="px-3 py-2.5 w-32 font-bold text-indigo-900">Voucher No. *</th>
                      <th className="px-3 py-2.5 min-w-[160px]">Debit Ledger</th>
                      <th className="px-3 py-2.5 min-w-[160px]">Credit Ledger</th>
                      <th className="px-3 py-2.5 w-28 text-right">Amount (₹)</th>
                      <th className="px-3 py-2.5 min-w-[200px]">Narration</th>
                      <th className="px-2 py-2.5 w-16 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedModifierVouchers.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-12 text-center text-slate-400">
                          <div className="max-w-md mx-auto space-y-3">
                            <Edit3 className="w-10 h-10 mx-auto text-slate-300" />
                            <div className="text-sm font-semibold text-slate-700">No vouchers in Data Modifier Studio</div>
                            <p className="text-xs text-slate-500">
                              Fetch existing vouchers from Tally DayBook via Port 9000, upload an Excel/CSV file to modify, or copy vouchers from Data Entry Studio.
                            </p>
                            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                              <button
                                type="button"
                                onClick={handleFetchFromTallyDayBook}
                                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-2xs cursor-pointer"
                              >
                                Fetch from Tally DayBook
                              </button>
                              <button
                                type="button"
                                onClick={() => modifierFileInputRef.current?.click()}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-2xs cursor-pointer"
                              >
                                Upload Excel to Modify
                              </button>
                              {multiVouchers.length > 0 && (
                                <button
                                  type="button"
                                  onClick={handleCopyFromEntryToModifier}
                                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-2xs cursor-pointer"
                                >
                                  Copy from Entry Studio
                                </button>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      paginatedModifierVouchers.map((row, idx) => {
                        const globalIndex = (currentModifierPage - 1) * modifierPageSize + idx + 1;
                        return (
                          <tr key={row.id || idx} className="hover:bg-slate-50/80 transition-colors">
                            <td className="px-3 py-2 text-center font-mono text-[11px] text-slate-400">
                              {globalIndex}
                            </td>
                            <td className="px-3 py-1.5">
                              <input
                                type="text"
                                value={row.date}
                                onChange={(e) => handleModifierUpdateRow(row.id!, 'date', e.target.value)}
                                placeholder="YYYY-MM-DD"
                                className="w-full px-2 py-1 text-xs font-mono rounded border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                            </td>
                            <td className="px-3 py-1.5">
                              <select
                                value={row.voucherType}
                                onChange={(e) => handleModifierUpdateRow(row.id!, 'voucherType', e.target.value)}
                                className="w-full px-2 py-1 text-xs rounded border border-slate-200 bg-white"
                              >
                                {STANDARD_VOUCHER_TYPES.map((t) => (
                                  <option key={t} value={t}>{t}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-1.5">
                              <input
                                type="text"
                                value={row.voucherNumber || ''}
                                onChange={(e) => handleModifierUpdateRow(row.id!, 'voucherNumber', e.target.value)}
                                placeholder="Vch No. (Key)"
                                className="w-full px-2 py-1 text-xs font-mono font-bold text-indigo-900 rounded border border-indigo-200 bg-indigo-50/30 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                            </td>
                            <td className="px-3 py-1.5">
                              <input
                                type="text"
                                value={row.debitLedger}
                                onChange={(e) => handleModifierUpdateRow(row.id!, 'debitLedger', e.target.value)}
                                placeholder="Debit Ledger"
                                className="w-full px-2 py-1 text-xs rounded border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                            </td>
                            <td className="px-3 py-1.5">
                              <input
                                type="text"
                                value={row.creditLedger}
                                onChange={(e) => handleModifierUpdateRow(row.id!, 'creditLedger', e.target.value)}
                                placeholder="Credit Ledger"
                                className="w-full px-2 py-1 text-xs rounded border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                            </td>
                            <td className="px-3 py-1.5">
                              <input
                                type="number"
                                step="0.01"
                                value={row.amount || ''}
                                onChange={(e) => handleModifierUpdateRow(row.id!, 'amount', parseFloat(e.target.value) || 0)}
                                placeholder="0.00"
                                className="w-full px-2 py-1 text-xs font-mono text-right rounded border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                            </td>
                            <td className="px-3 py-1.5">
                              <input
                                type="text"
                                value={row.narration || ''}
                                onChange={(e) => handleModifierUpdateRow(row.id!, 'narration', e.target.value)}
                                placeholder="Narration..."
                                className="w-full px-2 py-1 text-xs rounded border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                            </td>
                            <td className="px-2 py-1.5 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleModifierDuplicateRow(row.id!)}
                                  className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 cursor-pointer"
                                  title="Duplicate row"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleModifierDeleteRow(row.id!)}
                                  className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                                  title="Delete row"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
      {/* Tally Connection & Diagnostics Dialog */}
      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="max-w-md bg-white border-slate-200 text-slate-900 shadow-2xl p-6 rounded-2xl">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div className={`p-2 rounded-xl ${isTallyConnected ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                <Server className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-slate-900">
                  Tally Connection & Diagnostics
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500">
                  Configure local XML socket and verify TallyPrime communication
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Status Card */}
            <div className={`p-3.5 rounded-xl border flex flex-col gap-2 ${
              isTallyConnected
                ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                : 'bg-rose-50/70 border-rose-200 text-rose-900'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold">
                  {isTallyConnected ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>TallyPrime Online & Ready</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-4 h-4 text-rose-600" />
                      <span>TallyPrime Not Reachable</span>
                    </>
                  )}
                </div>
                <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-white/80 border border-current">
                  Port {tallyPort}
                </span>
              </div>

              {isTallyConnected && tallyCompany && (
                <div className="text-xs space-y-1 pt-1 border-t border-emerald-200/60 font-medium">
                  <div className="flex justify-between">
                    <span className="text-emerald-700">Company:</span>
                    <span className="font-bold text-emerald-950">{tallyCompany.name || tallyCompany.companyName}</span>
                  </div>
                  {tallyCompany.gstin && (
                    <div className="flex justify-between">
                      <span className="text-emerald-700">GSTIN:</span>
                      <span className="font-mono font-semibold">{tallyCompany.gstin}</span>
                    </div>
                  )}
                  {tallyCompany.financialYear && (
                    <div className="flex justify-between">
                      <span className="text-emerald-700">Financial Year:</span>
                      <span>{tallyCompany.financialYear}</span>
                    </div>
                  )}
                </div>
              )}

              {connectionDiagnosticMessage && (
                <p className="text-[11px] text-slate-600 leading-relaxed pt-1">
                  {connectionDiagnosticMessage}
                </p>
              )}
            </div>

            {/* Port Selection Controls */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                <span>Tally HTTP XML Port</span>
                <span className="text-[11px] text-slate-400 font-normal">Default: 9000</span>
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[9000, 9001, 9002, 9005].map((presetPort) => (
                  <button
                    key={presetPort}
                    type="button"
                    onClick={() => handleApplyPort(presetPort)}
                    className={`py-1.5 text-xs font-bold rounded-lg border transition-all ${
                      tallyPort === presetPort
                        ? 'bg-rose-600 border-rose-600 text-white shadow-xs'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {presetPort}
                  </button>
                ))}
              </div>

              {/* Custom Port Input */}
              <div className="flex gap-2 pt-1">
                <input
                  type="number"
                  min="1000"
                  max="65535"
                  value={customPortInput}
                  onChange={(e) => setCustomPortInput(e.target.value)}
                  placeholder="Custom Port (e.g. 9000)"
                  className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-rose-500 font-mono"
                />
                <button
                  type="button"
                  onClick={() => {
                    const parsed = parseInt(customPortInput, 10);
                    if (!isNaN(parsed) && parsed > 0 && parsed <= 65535) {
                      handleApplyPort(parsed);
                    } else {
                      toast.error('Invalid port number');
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold"
                >
                  Apply
                </button>
              </div>
            </div>

            {/* Troubleshooting Guide */}
            {!isTallyConnected && (
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-xs space-y-1.5">
                <div className="font-bold flex items-center gap-1.5 text-amber-950">
                  <Info className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>How to enable XML Server in TallyPrime:</span>
                </div>
                <ol className="list-decimal pl-4 space-y-1 text-[11px] text-amber-800">
                  <li>Open <strong>TallyPrime</strong> on this computer.</li>
                  <li>Press <strong>F1 (Help)</strong> → <strong>Settings</strong> → <strong>Connectivity</strong>.</li>
                  <li>Set <strong>"TallyPrime is acting as"</strong> to <strong>Both</strong> or <strong>Server</strong>.</li>
                  <li>Set <strong>"Port"</strong> to <strong>{tallyPort}</strong>.</li>
                  <li>If asked to restart, click <strong>Yes</strong> to apply changes.</li>
                  <li>Make sure a <strong>Company</strong> is loaded/open in Tally.</li>
                </ol>
              </div>
            )}
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => checkTallyConnection()}
              disabled={isCheckingTally}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isCheckingTally ? 'animate-spin text-emerald-600' : ''}`} />
              <span>{isCheckingTally ? 'Testing...' : 'Test Connection'}</span>
            </button>

            <button
              type="button"
              onClick={() => setIsSettingsOpen(false)}
              className="px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs"
            >
              Done
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Missing Ledgers Auto-Creation Dialog */}
      <Dialog open={isMissingLedgersOpen} onOpenChange={setIsMissingLedgersOpen}>
        <DialogContent className="max-w-xl bg-white border-slate-200 text-slate-900 shadow-2xl p-6 rounded-2xl">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 rounded-xl bg-amber-100 text-amber-800">
                <Sparkles className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-slate-900">
                  Missing Ledgers Detected in TallyPrime
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500">
                  Yeh ledgers Tally company <strong className="text-slate-800 font-semibold">"{tallyCompany?.name || companyName || 'Active'}"</strong> me nahi hain. Kya inhe create karke voucher push karein?
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-3 py-3">
            <div className="text-xs text-slate-600 bg-amber-50/80 border border-amber-200/80 rounded-xl p-3 flex items-start gap-2">
              <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                TallyPrime voucher create karne se pehle ledgers ka exist hona mandatory hai. Neeche har ledger ka <strong>Parent Group</strong> check karein, fir <strong>"Create Ledgers & Push Vouchers"</strong> dabayein — pehle ledgers create honge aur fir voucher automatically push ho jayega!
              </span>
            </div>

            <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 shadow-2xs">
              <div className="grid grid-cols-12 bg-slate-50/90 px-3 py-2 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                <div className="col-span-6">Ledger Name</div>
                <div className="col-span-6">Parent Group in Tally</div>
              </div>
              {missingLedgers.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 px-3 py-2.5 items-center gap-2 text-xs hover:bg-slate-50/50 transition-colors">
                  <div className="col-span-6 font-semibold text-slate-800 truncate" title={item.ledgerName}>
                    {item.ledgerName}
                  </div>
                  <div className="col-span-6">
                    <select
                      value={item.parentGroup}
                      onChange={(e) => {
                        const newGrp = e.target.value;
                        setMissingLedgers((prev) =>
                          prev.map((it, i) => (i === idx ? { ...it, parentGroup: newGrp } : it))
                        );
                      }}
                      className="w-full text-xs py-1.5 px-2 rounded-lg border border-slate-200 bg-white text-slate-800 font-medium focus:ring-1 focus:ring-rose-500 focus:outline-none"
                    >
                      {STANDARD_MASTER_GROUPS.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsMissingLedgersOpen(false)}
              className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isCreatingMissingLedgers}
              onClick={handleAutoCreateAndPush}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs hover:scale-[1.02] transition-all cursor-pointer"
            >
              {isCreatingMissingLedgers ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Creating & Pushing...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-white" />
                  <span>Create Ledgers & Push Vouchers</span>
                </>
              )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TallyXmlSuite;
