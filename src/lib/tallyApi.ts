/**
 * tallyApi.ts — Standalone Tally XML HTTP API connector.
 * 
 * Connects to TallyPrime running on localhost via its XML API (default port 9000).
 * Fetches Purchase / Sales / Journal / Credit Note / Debit Note vouchers
 * and transforms them into a flat array that can be directly fed into the 
 * GST Consolidator's reconciliation engine.
 * 
 * ═══════════════════════════════════════════════════════════════
 * THIS FILE IS A COMPLETELY NEW MODULE.
 * IT DOES NOT MODIFY ANY EXISTING FILE.
 * ═══════════════════════════════════════════════════════════════
 */

// ─── Types ───────────────────────────────────────────────────

export type TallyVoucherType =
  | 'Purchase'
  | 'Sales'
  | 'Journal'
  | 'Credit Note'
  | 'Debit Note';

export interface TallyConnectionConfig {
  host: string;   // e.g. "localhost"
  port: number;   // e.g. 9000
  company?: string; // optional company name filter
}

export interface TallyFlatVoucher {
  voucherType: string;
  voucherNumber: string;
  date: string;
  partyName: string;
  gstin: string;
  invoiceNo: string;
  igst: number;
  cgst: number;
  sgst: number;
  taxableValue: number;
  totalAmount: number;
  anomalies: string[];
  taxLedgersBreakdown: { ledgerName: string; amount: number; category: string; type: string }[];
  debugLog?: string;
}

export interface TallyCompanyInfo {
  name: string;
  address: string;
  gstin: string;
  state: string;
  financialYear: string;
}

// ─── XML Request Builders ────────────────────────────────────

function buildCompanyInfoXml(): string {
  return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>ListOfCompanies</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="ListOfCompanies">
            <TYPE>Company</TYPE>
            <NATIVEMETHOD>Name</NATIVEMETHOD>
            <NATIVEMETHOD>Address</NATIVEMETHOD>
            <NATIVEMETHOD>GSTIN</NATIVEMETHOD>
            <NATIVEMETHOD>State</NATIVEMETHOD>
            <NATIVEMETHOD>BooksFrom</NATIVEMETHOD>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
}

function buildVoucherQueryXml(voucherTypes: string[], fromDate: string, toDate: string): string {
  // Convert YYYY-MM-DD to YYYYMMDD for Tally
  const from = fromDate.replace(/-/g, '');
  const to = toDate.replace(/-/g, '');
  
  const baseName = voucherTypes[0].replace(/[\s&]/g, '');
  const collName = `MyLedgerEntries_${baseName}`;
  const srcCollName = `MyVouchers_${baseName}`;
  const filterName = `Is${baseName}`;

  const typesCondition = voucherTypes.map(t => `$VoucherTypeName = "${t}"`).join(' OR ');

  return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>${collName}</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVFROMDATE>${from}</SVFROMDATE>
        <SVTODATE>${to}</SVTODATE>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="${srcCollName}">
            <TYPE>Voucher</TYPE>
            <FILTER>${filterName}</FILTER>
          </COLLECTION>
          <SYSTEM TYPE="FORMULAS" NAME="${filterName}">(${typesCondition}) AND NOT $IsCancelled AND NOT $IsOptional</SYSTEM>
          
          <COLLECTION NAME="${collName}">
            <SOURCECOLLECTION>${srcCollName}</SOURCECOLLECTION>
            <WALK>AllLedgerEntries</WALK>
            <COMPUTE>Guid : $..GUID</COMPUTE>
            <COMPUTE>VchDate : $..Date</COMPUTE>
            <COMPUTE>VchNumber : $..VoucherNumber</COMPUTE>
            <COMPUTE>VchType : $..VoucherTypeName</COMPUTE>
            <COMPUTE>PartyGSTIN : $..PartyGSTIN</COMPUTE>
            <COMPUTE>ConsigneeGSTIN : $..ConsigneeGSTIN</COMPUTE>
            <COMPUTE>BasicBuyerName : $..BasicBuyerName</COMPUTE>
            <COMPUTE>PartyName : $..PartyLedgerName</COMPUTE>
            <COMPUTE>Reference : $..Reference</COMPUTE>
            <COMPUTE>LedgerName : $LedgerName</COMPUTE>
            <COMPUTE>Amount : $Amount</COMPUTE>
            <COMPUTE>IsDeemedPositive : $IsDeemedPositive</COMPUTE>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
}

function buildGroupsXml(): string {
  return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>List of Groups</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="List of Groups">
            <FETCH>Name, Parent</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
}

function buildLedgerGstinXml(): string {
  return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>MyLedgerMaster</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="MyLedgerMaster">
            <TYPE>Ledger</TYPE>
            <FETCH>Name, Parent, PartyGSTIN, GSTRegistrationType, LEDGSTREGDETAILS.LIST.*</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
}

// ─── XML Response Parsers ────────────────────────────────────

function parseXml(xmlStr: string): Document {
  // Tally often exports unescaped '&' in ledger names, which breaks DOMParser.
  // We need to escape them properly without breaking valid XML entities
  const sanitized = xmlStr.replace(/&(?!amp;|lt;|gt;|quot;|apos;|#x?\d+;)/g, '&amp;');
  const parser = new DOMParser();
  const doc = parser.parseFromString(sanitized, 'text/xml');
  const errorNode = doc.querySelector('parsererror');
  if (errorNode) {
    console.error("XML Parsing Error detected:", errorNode.textContent);
    console.error("Snippet of failed XML:", sanitized.substring(0, 500) + "...");
  }
  return doc;
}

function unescapeXml(safe: string): string {
  if (!safe) return '';
  return safe
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}


function getTextContent(el: Element | null, tag: string): string {
  if (!el) return '';
  // Tally native collections often export Name as an attribute rather than a child tag
  if (el.hasAttribute(tag)) {
    return el.getAttribute(tag) || '';
  }
  const child = el.getElementsByTagName(tag)[0];
  return child?.textContent?.trim() || '';
}

function getAllElements(el: Element | Document, tag: string): Element[] {
  return Array.from(el.getElementsByTagName(tag));
}

function tallyDateToISO(tallyDate: string): string {
  // Tally returns dates like "20260415" → "2026-04-15"
  if (!tallyDate || tallyDate.length < 8) return tallyDate;
  const clean = tallyDate.replace(/[^0-9]/g, '');
  if (clean.length >= 8) {
    return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`;
  }
  return tallyDate;
}

function safeNum(val: string | undefined | null): number {
  if (!val) return 0;
  const cleaned = val.replace(/[₹,\s]/g, '').replace(/Dr|Cr/gi, '').trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : Math.abs(n);
}

// ─── Core API Functions ──────────────────────────────────────

const DEFAULT_CONFIG: TallyConnectionConfig = {
  host: 'localhost',
  port: 9000,
};

async function sendTallyRequest(xml: string, config: TallyConnectionConfig = DEFAULT_CONFIG): Promise<string> {
  // Route through Vite dev proxy to avoid CORS in browser.
  // In Electron, webSecurity is disabled so we can hit the local port directly.
  const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;
  const url = (!isElectron && typeof window !== 'undefined') ? '/tally-api' : `http://${config.host || 'localhost'}:${config.port}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
    body: xml,
  });

  if (!response.ok) {
    throw new Error(`Tally connection failed (HTTP ${response.status}). Is TallyPrime running on port ${config.port}?`);
  }

  return response.text();
}

/** Check if Tally is reachable */
export async function pingTally(config: TallyConnectionConfig = DEFAULT_CONFIG): Promise<boolean> {
  try {
    const xml = buildCompanyInfoXml();
    const resp = await sendTallyRequest(xml, config);
    return resp.includes('COMPANY') || resp.includes('NAME');
  } catch {
    return false;
  }
}

/** Fetch company info from the active Tally company */
export async function fetchCompanyInfo(config: TallyConnectionConfig = DEFAULT_CONFIG): Promise<TallyCompanyInfo> {
  const xml = buildCompanyInfoXml();
  const resp = await sendTallyRequest(xml, config);
  const doc = parseXml(resp);

  const companies = getAllElements(doc, 'COMPANY');
  const co = companies.find(c => c.getAttribute('NAME')) || companies[0];

  return {
    name: getTextContent(co, 'NAME') || getTextContent(co, 'COMPANYNAME') || co?.getAttribute('NAME') || 'Unknown',
    address: getTextContent(co, 'ADDRESS') || '',
    gstin: getTextContent(co, 'GSTIN') || '',
    state: getTextContent(co, 'STATE') || '',
    financialYear: getTextContent(co, 'BOOKSFROM') || '',
  };
}

export interface TaxLedgerInfo {
  gstin: string;
  isITC: boolean;
  isOutput: boolean;
  isRCM: boolean;
  taxCategory: 'CGST' | 'SGST' | 'IGST' | null;
}

export interface TallyMetadata {
  gstinMap: Map<string, string>;
  taxMap: Map<string, TaxLedgerInfo>;
}

/** Fetch GSTIN and Tax Classification mapping for all ledgers */
let metadataCachePromise: Promise<{ gstinMap: Map<string, string>; taxMap: Map<string, TaxLedgerInfo> }> | null = null;

export async function fetchTallyMetadata(
  config: TallyConnectionConfig = DEFAULT_CONFIG,
  customInputTaxGroups: string[] = ['ITC', 'DUTIES & TAXES', 'DUTIES AND TAXES', 'INPUT'],
  customOutputTaxGroups: string[] = ['OUTPUT', 'DUTIES & TAXES', 'DUTIES AND TAXES'],
  customTaxLedgers: {name: string, category: 'CGST'|'SGST'|'IGST', type: 'Input'|'Output'|'RCM'}[] = []
): Promise<{ gstinMap: Map<string, string>; taxMap: Map<string, TaxLedgerInfo> }> {
  if (metadataCachePromise) {
    return metadataCachePromise;
  }

  metadataCachePromise = (async () => {
    // 1. Fetch Groups
  const groupXml = buildGroupsXml();
  const groupResp = await sendTallyRequest(groupXml, config);
  const groupDoc = parseXml(groupResp);
  
  const groupParentMap = new Map<string, string>();
  const groups = getAllElements(groupDoc, 'GROUP');
  for (const g of groups) {
    const name = getTextContent(g, 'NAME').toUpperCase();
    const parent = getTextContent(g, 'PARENT').toUpperCase();
    groupParentMap.set(name, parent);
  }

  // Helper to check if a group falls under a target group
  const belongsTo = (groupName: string, targetGroup: string): boolean => {
    let current = groupName.toUpperCase();
    const target = targetGroup.toUpperCase();
    const visited = new Set<string>();
    
    while (current && !visited.has(current)) {
      if (current === target) return true;
      visited.add(current);
      current = groupParentMap.get(current) || '';
    }
    return false;
  };

  const getTaxCategory = (ledgerName: string, startGroup: string): 'CGST' | 'SGST' | 'IGST' | null => {
    // Check ledger name first
    if (ledgerName.includes('IGST') || ledgerName.includes('INTEGRATED')) return 'IGST';
    if (ledgerName.includes('CGST') || ledgerName.includes('CENTRAL')) return 'CGST';
    if (ledgerName.includes('SGST') || ledgerName.includes('STATE') || ledgerName.includes('UTGST')) return 'SGST';

    // Check parent groups
    let current = startGroup.toUpperCase();
    const visited = new Set<string>();
    while (current && !visited.has(current)) {
      if (current.includes('IGST') || current.includes('INTEGRATED')) return 'IGST';
      if (current.includes('CGST') || current.includes('CENTRAL')) return 'CGST';
      if (current.includes('SGST') || current.includes('STATE') || current.includes('UTGST')) return 'SGST';
      
      visited.add(current);
      current = groupParentMap.get(current) || '';
    }
    return null;
  };

  // 2. Fetch Ledgers
  const ledgerXml = buildLedgerGstinXml();
  const ledgerResp = await sendTallyRequest(ledgerXml, config);
  
  // ── GSTIN Map: Use regex on raw XML (DOMParser chokes on large Tally XML) ──
  const gstinMap = new Map<string, string>();
  
  // Extract GSTIN from each <LEDGER> block using regex (bulletproof against XML parse errors)
  const ledgerBlockRegex = /<LEDGER\s+NAME="([^"]*)"[^>]*>[\s\S]*?<\/LEDGER>/g;
  let match: RegExpExecArray | null;
  while ((match = ledgerBlockRegex.exec(ledgerResp)) !== null) {
    const ledgerName = unescapeXml(match[1]).replace(/\s+/g, ' ').trim();
    const block = match[0];
    
    // Try PARTYGSTIN first (works in TallyPrime and some Tally GOLD entries)
    let gstinMatch = block.match(/<PARTYGSTIN[^>]*>([^<]+)<\/PARTYGSTIN>/);
    let gstin = gstinMatch ? gstinMatch[1].replace(/\s+/g, '').trim() : '';
    
    // Fallback: GSTIN inside LEDGSTREGDETAILS.LIST (Tally GOLD / ERP 9)
    if (!gstin || gstin.length < 15) {
      const regDetailMatch = block.match(/<LEDGSTREGDETAILS\.LIST>[\s\S]*?<GSTIN[^>]*>([^<]+)<\/GSTIN>[\s\S]*?<\/LEDGSTREGDETAILS\.LIST>/);
      if (regDetailMatch) {
        gstin = regDetailMatch[1].replace(/\s+/g, '').trim();
      }
    }
    
    // Fallback: Direct GSTIN child
    if (!gstin || gstin.length < 15) {
      const directMatch = block.match(/<GSTIN[^>]*>([^<]{15,})<\/GSTIN>/);
      if (directMatch) {
        gstin = directMatch[1].replace(/\s+/g, '').trim();
      }
    }
    
    if (ledgerName && gstin && gstin.length >= 15) {
      gstinMap.set(ledgerName.toUpperCase(), gstin.toUpperCase());
    }
  }
  
  console.log(`[TallyAPI] Regex GSTIN extraction: ${gstinMap.size} entries`);
  
  // ── Tax Map: Use DOMParser (only needs tax ledgers which are fewer) ──
  const ledgerDoc = parseXml(ledgerResp);
  const taxMap = new Map<string, TaxLedgerInfo>();
  const ledgers = getAllElements(ledgerDoc, 'LEDGER');

  for (const ledger of ledgers) {
    const name = (getTextContent(ledger, 'NAME') || ledger.getAttribute('NAME') || '').replace(/\s+/g, ' ').trim();
    const parent = (getTextContent(ledger, 'PARENT') || '').replace(/\s+/g, ' ').trim();

    const customLedger = customTaxLedgers.find(cl => cl.name.trim().toUpperCase() === name.toUpperCase());

    let isITC = false, isOutput = false, isRCM = false, taxCategory: any = null;

    if (customLedger) {
      isITC = customLedger.type === 'Input';
      isOutput = customLedger.type === 'Output';
      isRCM = customLedger.type === 'RCM';
      taxCategory = customLedger.category;
    } else {
      isITC = customInputTaxGroups.some(g => belongsTo(parent.toUpperCase(), g.trim().toUpperCase()));
      isOutput = customOutputTaxGroups.some(g => belongsTo(parent.toUpperCase(), g.trim().toUpperCase()));
      isRCM = belongsTo(parent.toUpperCase(), 'RCM');
      taxCategory = getTaxCategory(name.toUpperCase(), parent.toUpperCase());
    }
    
    if (isITC || isOutput || isRCM) {
      const gstin = gstinMap.get(name.toUpperCase()) || '';
      taxMap.set(name.toUpperCase(), {
        gstin,
        isOutput,
        isRCM,
        isITC,
        taxCategory,
      });
    }
  }

    // @ts-ignore
    window.tallyDebugTaxMapSize = taxMap.size;
    // @ts-ignore
    window.tallyDebugGstinMapSize = gstinMap.size;
    // @ts-ignore
    window.tallyDebugGstinMap = Object.fromEntries(gstinMap);
    console.log(`[TallyAPI] GSTIN Map loaded: ${gstinMap.size} entries, Tax Map: ${taxMap.size} entries`);
    console.log(`[TallyAPI] Sample entries:`, Array.from(gstinMap.entries()).slice(0, 5));
    
    return { gstinMap, taxMap };
  })();

  return metadataCachePromise.catch(err => {
    metadataCachePromise = null;
    throw err;
  });
}

/** Call this when switching companies to force a fresh ledger metadata fetch */
export function clearTallyMetadataCache() {
  metadataCachePromise = null;
}

export function getTallyMetadataStats() {
  if (!metadataCachePromise) return { status: 'Not fetched' };
  return metadataCachePromise.then(meta => ({
    status: 'Fetched',
    groups: meta.gstinMap.size, // Note: gstinMap isn't groups, but we can return taxMap size
    taxLedgers: meta.taxMap.size
  })).catch(err => ({
    status: 'Failed',
    error: String(err)
  }));
}

export async function fetchVouchers(
  baseVoucherType: TallyVoucherType,
  customVoucherTypes: string[],
  fromDate: string,
  toDate: string,
  config: TallyConnectionConfig = DEFAULT_CONFIG,
  customInputTaxGroups: string[] = ['ITC', 'DUTIES & TAXES', 'DUTIES AND TAXES', 'INPUT'],
  customOutputTaxGroups: string[] = ['OUTPUT', 'DUTIES & TAXES', 'DUTIES AND TAXES'],
  customTaxLedgers: {name: string, category: 'CGST'|'SGST'|'IGST', type: 'Input'|'Output'|'RCM'}[] = []
): Promise<TallyFlatVoucher[]> {
  clearTallyMetadataCache();
  const xml = buildVoucherQueryXml(customVoucherTypes, fromDate, toDate);
  const resp = await sendTallyRequest(xml, config);
  return parseTallyVouchers([resp], config, baseVoucherType, customInputTaxGroups, customOutputTaxGroups, customTaxLedgers);
}

export async function parseTallyVouchers(
  xmlStrings: string[],
  config: TallyConnectionConfig = DEFAULT_CONFIG,
  baseVoucherTypeOverride?: TallyVoucherType,
  customInputTaxGroups: string[] = ['ITC', 'DUTIES & TAXES', 'DUTIES AND TAXES', 'INPUT'],
  customOutputTaxGroups: string[] = ['OUTPUT', 'DUTIES & TAXES', 'DUTIES AND TAXES'],
  customTaxLedgers: {name: string, category: 'CGST'|'SGST'|'IGST', type: 'Input'|'Output'|'RCM'}[] = []
): Promise<TallyFlatVoucher[]> {
  let gstinMap: Map<string, string>;
  let taxMap: Map<string, TaxLedgerInfo>;
  try {
    const meta = await fetchTallyMetadata(config, customInputTaxGroups, customOutputTaxGroups, customTaxLedgers);
    gstinMap = meta.gstinMap;
    taxMap = meta.taxMap;
  } catch (err) {
    console.error("Failed to fetch Tally metadata:", err);
    gstinMap = new Map();
    taxMap = new Map();
  }

  const results: TallyFlatVoucher[] = [];

  for (const xml of xmlStrings) {
    const doc = parseXml(xml);
    const ledgerEntries = getAllElements(doc, 'LEDGERENTRY');
    
    // Group ledger entries by Guid
    const vouchersByGuid = new Map<string, Element[]>();
    for (const entry of ledgerEntries) {
      const guid = getTextContent(entry, 'GUID');
      if (!guid) continue;
      if (!vouchersByGuid.has(guid)) vouchersByGuid.set(guid, []);
      vouchersByGuid.get(guid)!.push(entry);
    }

    for (const [guid, entries] of vouchersByGuid.entries()) {
      // The first entry has all the voucher-level compute fields
      const firstEntry = entries[0];
      
      const date = tallyDateToISO(getTextContent(firstEntry, 'VCHDATE'));
      const voucherNumber = getTextContent(firstEntry, 'VCHNUMBER');
      let voucherType = getTextContent(firstEntry, 'VCHTYPE') || '';
      if (baseVoucherTypeOverride) {
        voucherType = baseVoucherTypeOverride;
      }
      
      let partyName = (getTextContent(firstEntry, 'PARTYNAME') || getTextContent(firstEntry, 'PARTYLEDGERNAME')).replace(/\s+/g, ' ').trim();
      const reference = getTextContent(firstEntry, 'REFERENCE');
      // NOTE: We do NOT read PARTYGSTIN/CONSIGNEEGSTIN from the voucher XML here because
      // Tally stores the COMPANY'S OWN GSTIN in those fields, not the supplier's GSTIN.
      // The correct GSTIN is fetched from the Ledger Master (gstinMap) by party name below.
      let partyGstin = '';
      const knownPartyName = (partyName || getTextContent(firstEntry, 'BASICBUYERNAME') || '').toUpperCase();

      // Parse all ledger entries for tax classification and amounts
      let igst = 0, cgst = 0, sgst = 0, taxableValue = 0, maxAmount = 0;
      let fallbackPartyName = '';
      const debugLog: string[] = [];
      const anomalies: string[] = [];
      const taxLedgersBreakdown: { ledgerName: string; amount: number; category: string; type: string }[] = [];

    for (const entry of entries) {
      const ledgerNameRaw = getTextContent(entry, 'LEDGERNAME');
      const ledgerName = ledgerNameRaw.toUpperCase();
      const amountStr = getTextContent(entry, 'AMOUNT');
      const amount = safeNum(amountStr);
      const isDeemedPositiveStr = getTextContent(entry, 'ISDEEMEDPOSITIVE');
      const isDebit = isDeemedPositiveStr === 'Yes';

      let taxInfo = undefined;
      
      const customMapping = customTaxLedgers.find(l => l.name.trim().toUpperCase() === ledgerName);
      
      if (customTaxLedgers.length > 0) {
          // Strict Mode: If the user provided ANY custom mappings, ONLY those mappings are considered as tax ledgers.
          if (customMapping) {
             taxInfo = {
                gstin: '',
                isOutput: customMapping.type === 'Output',
                isRCM: customMapping.type === 'RCM',
                isITC: customMapping.type === 'Input',
                taxCategory: customMapping.category
             };
          }
      } else {
          // Auto-detection Mode: Rely on Tally Group inheritance and aggressive string matching
          taxInfo = taxMap.get(ledgerName);
          
          // Hard fallback: if it wasn't mapped by group or exact name, but contains GST keywords, force it!
          // (We ensure we don't accidentally match the primary party name just because it has "GST" in it)
          if (!taxInfo && ledgerName !== knownPartyName && !ledgerName.includes('PURCHASE') && !ledgerName.includes('SALES') && !ledgerName.includes('DISCOUNT') && !ledgerName.includes('ROUND')) {
             if (ledgerName.includes('IGST') || ledgerName.includes('INTEGRATED TAX')) {
                taxInfo = { gstin: '', isOutput: ledgerName.includes('OUTPUT'), isRCM: true, isITC: !ledgerName.includes('OUTPUT'), taxCategory: 'IGST' };
             } else if (ledgerName.includes('CGST') || ledgerName.includes('CENTRAL TAX')) {
                taxInfo = { gstin: '', isOutput: ledgerName.includes('OUTPUT'), isRCM: true, isITC: !ledgerName.includes('OUTPUT'), taxCategory: 'CGST' };
             } else if (ledgerName.includes('SGST') || ledgerName.includes('STATE TAX') || ledgerName.includes('UTGST')) {
                taxInfo = { gstin: '', isOutput: ledgerName.includes('OUTPUT'), isRCM: true, isITC: !ledgerName.includes('OUTPUT'), taxCategory: 'SGST' };
             }
          }
      }

      if (taxInfo) {
        debugLog.push(`Found tax ledger: ${ledgerName} (Amt: ${amountStr}, isDebit: ${isDebit})`);
        
        let isValidTax = false;
        let effectiveAmount = amount;
        const category = taxInfo.taxCategory;

        if (voucherType === 'Purchase') {
           if (taxInfo.isOutput) {
               // Output tax on Purchase voucher is an anomaly. We subtract it from Input tax.
               effectiveAmount = -amount;
               isValidTax = true; // We want to capture it to subtract it
               anomalies.push(`Output Tax on Purchase: ${category} ₹${amount.toFixed(2)}`);
           } else if (taxInfo.isITC || taxInfo.isRCM) {
               if (!isDebit) {
                   // Input Tax in Credit Balance (Reversal) -> subtract
                   effectiveAmount = -amount;
                   anomalies.push(`Input Tax Reversal (Credit Balance): ${category} ₹${amount.toFixed(2)}`);
               } else {
                   // Normal Input Tax -> add
                   effectiveAmount = amount;
               }
               isValidTax = true;
           }
        } else if (voucherType === 'Sales') {
           if (taxInfo.isITC) {
               // Input tax on Sales voucher is an anomaly. We subtract it from Output tax.
               effectiveAmount = -amount;
               isValidTax = true;
               anomalies.push(`Input Tax on Sales: ${category} ₹${amount.toFixed(2)}`);
           } else if (taxInfo.isOutput || taxInfo.isRCM) {
               if (isDebit) {
                   // Output Tax in Debit Balance (Reversal) -> subtract
                   effectiveAmount = -amount;
                   anomalies.push(`Output Tax Reversal (Debit Balance): ${category} ₹${amount.toFixed(2)}`);
               } else {
                   // Normal Output Tax (Credit) -> add
                   effectiveAmount = amount;
               }
               isValidTax = true;
           }
        } else if (voucherType === 'Credit Note') {
           // ONLY import ledgers that are explicitly mentioned in the mapping table
           isValidTax = !!customMapping;
           effectiveAmount = amount;
           if (isValidTax && taxInfo.isITC) {
               effectiveAmount = -amount;
               anomalies.push(`Input Tax on Credit Note: ${category} ₹${amount.toFixed(2)}`);
           }
        } else if (voucherType === 'Debit Note') {
           // ONLY import ledgers that are explicitly mentioned in the mapping table
           isValidTax = !!customMapping;
           effectiveAmount = amount;
           if (isValidTax && taxInfo.isOutput) {
               effectiveAmount = -amount;
               anomalies.push(`Output Tax on Debit Note: ${category} ₹${amount.toFixed(2)}`);
           }
        } else {
           // For Journal, assume absolute amount for now.
           isValidTax = taxInfo.isITC || taxInfo.isOutput || taxInfo.isRCM;
           effectiveAmount = amount; 
        }

        if (isValidTax) {
           debugLog.push(` -> Valid for ${voucherType}, Category: ${category}, Eff Amt: ${effectiveAmount}`);
           if (category === 'IGST') igst += effectiveAmount;
           else if (category === 'CGST') cgst += effectiveAmount;
           else if (category === 'SGST') sgst += effectiveAmount;
           
           taxLedgersBreakdown.push({
               ledgerName: ledgerNameRaw,
               amount: effectiveAmount,
               category,
               type: taxInfo.isITC ? 'Input' : taxInfo.isOutput ? 'Output' : 'RCM'
           });
        } else {
           debugLog.push(` -> INVALID for ${voucherType} (isITC:${taxInfo.isITC}, isOutput:${taxInfo.isOutput})`);
        }
      } else {
        // If it's not in the tax map, log it just in case it contains GST in the name
        if (ledgerName.includes('GST')) {
           debugLog.push(`Unmapped GST ledger: ${ledgerName} (Amt: ${amountStr})`);
        }
        // Non-tax ledger
        if (
          !ledgerName.includes('PURCHASE') && 
          !ledgerName.includes('SALES') && 
          !ledgerName.includes('DISCOUNT') && 
          !ledgerName.includes('ROUND')
        ) {
          // If it's not a known tax, purchase, or sales ledger, it's likely the Party ledger!
          if (amount > maxAmount) {
            maxAmount = amount;
            fallbackPartyName = ledgerNameRaw;
          }
        }
      }
    }

    // Party Name: Try explicit fields first, fallback to largest non-tax ledger
    if (!partyName) {
      partyName = (getTextContent(firstEntry, 'BASICBUYERNAME').replace(/\s+/g, ' ').trim()) || fallbackPartyName || 'Unknown Party';
    }

    const searchPartyName = partyName.toUpperCase().replace(/\s+/g, ' ');
    const searchFallbackName = fallbackPartyName ? fallbackPartyName.toUpperCase().replace(/\s+/g, ' ') : '';

    // Primary: look up GSTIN from ledger master map using party name
    if (gstinMap.has(searchPartyName)) {
      partyGstin = gstinMap.get(searchPartyName) || '';
    }
    // Secondary: try the fallback party name (largest non-tax ledger detected)
    if (!partyGstin && searchFallbackName && gstinMap.has(searchFallbackName)) {
      partyGstin = gstinMap.get(searchFallbackName) || '';
    }

    // Log unmatched for debugging
    if (!partyGstin) {
      console.log(`[TallyAPI] GSTIN not found for: '${searchPartyName}'`);
    }

    // Determine invoice number: prefer Reference (supplier invoice), fallback to VoucherNumber
    const invoiceNo = reference || voucherNumber;

    const totalGst = igst + cgst + sgst;
    
    if (Math.abs(cgst - sgst) > 1.00 && (cgst > 0 || sgst > 0)) {
      anomalies.push(`CGST and SGST mismatch: CGST ₹${cgst.toFixed(2)}, SGST ₹${sgst.toFixed(2)}`);
    }

    // Total amount: fallback to maxAmount (Party ledger amount)
    let totalAmount = maxAmount;
    
    // If there are NO GST values at all, don't calculate taxable value or total
    // (these are non-GST entries like TDS journals, plain payments, etc.)
    if (totalGst === 0) {
      taxableValue = 0;
      totalAmount = 0;
    } else if (totalAmount === 0) {
       // If totalAmount is still 0 but there IS GST, sum up purchase/sales ledgers
       for (const entry of entries) {
         const ln = getTextContent(entry, 'LEDGERNAME').toUpperCase();
         if (ln.includes('PURCHASE') || ln.includes('SALES')) {
            taxableValue += safeNum(getTextContent(entry, 'AMOUNT'));
         }
       }
       totalAmount = taxableValue + igst + cgst + sgst;
    } else {
       // Since igst, cgst, sgst already have the anomalies subtracted mathematically, we just subtract them from totalAmount!
       taxableValue = Math.max(0, totalAmount - (igst + cgst + sgst));
    }

    results.push({
      voucherType,
      voucherNumber,
      date,
      partyName,
      gstin: partyGstin,
      invoiceNo,
      igst: +igst.toFixed(2),
      cgst: +cgst.toFixed(2),
      sgst: +sgst.toFixed(2),
      taxableValue: +taxableValue.toFixed(2),
      totalAmount: +Math.abs(totalAmount).toFixed(2),
      anomalies,
      taxLedgersBreakdown,
      debugLog: debugLog.join('\n')
    });
  } // End vouchers loop
  } // End xml loop

  return results;
}
