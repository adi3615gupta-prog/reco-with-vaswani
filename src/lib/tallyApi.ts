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
  originalVoucherType?: string;
  cgstLedger?: string;
  sgstLedger?: string;
  igstLedger?: string;
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

function buildVoucherNumberQueryXml(voucherType: string, fromDate: string, toDate: string): string {
  const from = fromDate.replace(/-/g, '');
  const to = toDate.replace(/-/g, '');
  const baseName = voucherType.replace(/[\s&]/g, '');
  const collName = `VoucherNumbers_${baseName}`;

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
          <COLLECTION NAME="${collName}">
            <TYPE>Voucher</TYPE>
            <FILTER>IsMyVoucherType</FILTER>
            <FETCH>VoucherNumber, Date, VoucherTypeName, GUID, Narration, PartyLedgerName</FETCH>
          </COLLECTION>
          <SYSTEM TYPE="FORMULAS" NAME="IsMyVoucherType">
            $VoucherTypeName = "${escapeXml(voucherType)}" AND NOT $IsCancelled AND NOT $IsOptional
          </SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
}

function buildForensicVoucherQueryXml(voucherType: string, fromDate: string, toDate: string): string {
  const from = fromDate.replace(/-/g, '');
  const to = toDate.replace(/-/g, '');
  const baseName = voucherType.replace(/[\s&]/g, '');
  const collName = `VoucherNumbers_Forensic_${baseName}`;

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
          <COLLECTION NAME="${collName}">
            <TYPE>Voucher</TYPE>
            <FILTER>IsMyVoucherTypeForensic</FILTER>
            <FETCH>VoucherNumber, Date, VoucherTypeName, GUID, Narration, PartyLedgerName, Amount, IsCancelled, IsOptional, IsDeemedPositive</FETCH>
          </COLLECTION>
          <SYSTEM TYPE="FORMULAS" NAME="IsMyVoucherTypeForensic">
            $VoucherTypeName = "${escapeXml(voucherType)}"
          </SYSTEM>
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

  const typesCondition = voucherTypes.map(t => {
    const tUpper = t.toUpperCase();
    if (tUpper === 'PURCHASE') return `($$IsPurchase:$VoucherTypeName OR $VoucherTypeName = "${t}")`;
    if (tUpper === 'JOURNAL') return `($$IsJournal:$VoucherTypeName OR $VoucherTypeName = "${t}")`;
    if (tUpper === 'PAYMENT') return `($$IsPayment:$VoucherTypeName OR $VoucherTypeName = "${t}")`;
    if (tUpper === 'SALES') return `($$IsSales:$VoucherTypeName OR $VoucherTypeName = "${t}")`;
    if (tUpper === 'RECEIPT') return `($$IsReceipt:$VoucherTypeName OR $VoucherTypeName = "${t}")`;
    if (tUpper === 'CREDIT NOTE') return `($$IsCreditNote:$VoucherTypeName OR $VoucherTypeName = "${t}")`;
    if (tUpper === 'DEBIT NOTE') return `($$IsDebitNote:$VoucherTypeName OR $VoucherTypeName = "${t}")`;
    if (tUpper === 'CONTRA') return `($$IsContra:$VoucherTypeName OR $VoucherTypeName = "${t}")`;
    return `$VoucherTypeName = "${t}"`;
  }).join(' OR ');

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
            <TYPE>Group</TYPE>
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
                    <FETCH>Name, Parent, PartyGSTIN, GSTRegistrationType, IncomeTaxNumber, PartxPan, LEDGSTREGDETAILS.LIST.*</FETCH>
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
  let sanitized = xmlStr.replace(/&(?!amp;|lt;|gt;|quot;|apos;|#x?\d+;)/g, '&amp;');

  // Clean invalid XML 1.0 control character entities (like &#4;)
  // XML 1.0 permits only 0x09, 0x0A, 0x0D, and 0x20-0xD7FF, 0xE000-0xFFFD, 0x10000-0x10FFFF.
  // We strip character entities representing character codes < 32 except 9, 10, and 13.
  sanitized = sanitized.replace(/&#(\d+);/g, (_, dec) => {
    const num = parseInt(dec, 10);
    if (num === 9 || num === 10 || num === 13 || num >= 32) return `&#${dec};`;
    return '';
  }).replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
    const num = parseInt(hex, 16);
    if (num === 9 || num === 10 || num === 13 || num >= 32) return `&#x${hex};`;
    return '';
  });

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

function escapeXml(unsafe: string): string {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}


function getTextContent(el: Element | null, tag: string): string {
  if (!el) return '';
  // Tally native collections often export Name as an attribute rather than a child tag
  if (el.hasAttribute(tag)) {
    return el.getAttribute(tag) || '';
  }
  let child = el.getElementsByTagName(tag)[0];
  if (!child) {
    child = el.getElementsByTagName(tag.toUpperCase())[0];
  }
  if (!child) {
    child = el.getElementsByTagName(tag.toLowerCase())[0];
  }
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

import { getApiBase } from '@/lib/api';

export async function sendTallyRequest(
  xml: string,
  config: TallyConnectionConfig = DEFAULT_CONFIG,
  timeoutMs = 15000
): Promise<string> {
  // In Electron, make the request via IPC to the Node.js main process to bypass CORS restrictions (webSecurity is enabled).
  // For Web Clients, we proxy the request through the Express backend so it can hit Tally running on the Server PC.
  const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;

  if (isElectron && (window as any).electronAPI?.fetchTallyData) {
    try {
      const responseText = await (window as any).electronAPI.fetchTallyData(config.port, xml);
      return responseText;
    } catch (err) {
      throw new Error(`Tally connection failed. Is TallyPrime running on port ${config.port}? Error: ${err}`);
    }
  }

  const isDev = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.DEV : true;
  let url = `http://${config.host || 'localhost'}:${config.port}`;

  if (!isElectron) {
    const isBrowser = typeof window !== 'undefined' && typeof process === 'undefined';
    if (isBrowser) {
      if (isDev) {
        // Use Vite proxy in development
        url = '/tally-api';
      } else {
        // Use Express backend proxy in production
        url = `${getApiBase()}/api/tally-proxy`;
      }
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'x-tally-port': config.port.toString()
      },
      body: xml,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Tally connection failed (HTTP ${response.status}). Is TallyPrime running on port ${config.port}?`);
    }

    return response.text();
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      const limitSec = Math.round(timeoutMs / 1000);
      throw new Error(`Tally connection timed out (${limitSec}s limit). Ensure TallyPrime is open, responsive, and no dialog popups are active.`);
    }
    throw err;
  }
}

/** Check if Tally is reachable */
export async function pingTally(config: TallyConnectionConfig = DEFAULT_CONFIG): Promise<boolean> {
  try {
    const xml = buildCompanyInfoXml();
    const resp = await sendTallyRequest(xml, config, 3000);
    return resp.includes('COMPANY') || resp.includes('NAME');
  } catch {
    return false;
  }
}

/** Fetch company info from the active Tally company */
export async function fetchCompanyInfo(config: TallyConnectionConfig = DEFAULT_CONFIG): Promise<TallyCompanyInfo> {
  const xml = buildCompanyInfoXml();
  const resp = await sendTallyRequest(xml, config, 5000);
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
  panMap: Map<string, string>;
  groupParentMap: Map<string, string>;
  ledgerParentMap: Map<string, string>;
}

/** Fetch GSTIN and Tax Classification mapping for all ledgers */
let metadataCachePromise: Promise<TallyMetadata> | null = null;

export async function fetchTallyMetadata(
  config: TallyConnectionConfig = DEFAULT_CONFIG,
  customInputTaxGroups: string[] = ['ITC', 'DUTIES & TAXES', 'DUTIES AND TAXES', 'INPUT'],
  customOutputTaxGroups: string[] = ['OUTPUT', 'DUTIES & TAXES', 'DUTIES AND TAXES'],
  customTaxLedgers: { name: string, category: 'CGST' | 'SGST' | 'IGST', type: 'Input' | 'Output' | 'RCM' }[] = []
): Promise<TallyMetadata> {
  if (metadataCachePromise) {
    return metadataCachePromise;
  }

  metadataCachePromise = (async () => {
    // 1. Fetch Groups
    const groupXml = buildGroupsXml();
    const groupResp = await sendTallyRequest(groupXml, config, 10000);

    const groupParentMap = new Map<string, string>();

    // Parse groups using robust regex instead of DOMParser
    const groupBlockRegex = /<GROUP[^>]*>([\s\S]*?)<\/GROUP>/g;
    let gMatch: RegExpExecArray | null;
    while ((gMatch = groupBlockRegex.exec(groupResp)) !== null) {
      const block = gMatch[1];
      let name = '';
      const nameAttrMatch = gMatch[0].match(/<GROUP\s+NAME="([^"]*)"/i);
      if (nameAttrMatch) {
        name = unescapeXml(nameAttrMatch[1]);
      } else {
        const nameTagMatch = block.match(/<NAME[^>]*>([^<]+)<\/NAME>/i);
        if (nameTagMatch) name = unescapeXml(nameTagMatch[1]);
      }
      name = name.replace(/\s+/g, ' ').trim().toUpperCase();

      const parentMatch = block.match(/<PARENT[^>]*>([^<]+)<\/PARENT>/i);
      const parent = parentMatch ? unescapeXml(parentMatch[1]).replace(/\s+/g, ' ').trim().toUpperCase() : '';

      if (name) {
        groupParentMap.set(name, parent);
      }
    }

    // Helper to get full parent group hierarchy for a group
    const getGroupHierarchy = (groupName: string): string[] => {
      let current = groupName.toUpperCase();
      const path: string[] = [];
      const visited = new Set<string>();

      while (current && !visited.has(current)) {
        path.push(current);
        visited.add(current);
        current = groupParentMap.get(current) || '';
      }
      return path;
    };

    const belongsTo = (groupName: string, targetGroup: string): boolean => {
      return getGroupHierarchy(groupName).includes(targetGroup.toUpperCase());
    };

    const getTaxCategory = (ledgerName: string, startGroup: string): 'CGST' | 'SGST' | 'IGST' | null => {
      // Check ledger name first
      if (ledgerName.includes('IGST') || ledgerName.includes('INTEGRATED')) return 'IGST';
      if (ledgerName.includes('CGST') || ledgerName.includes('CENTRAL')) return 'CGST';
      if (ledgerName.includes('SGST') || ledgerName.includes('STATE') || ledgerName.includes('UTGST')) return 'SGST';

      // Check parent groups in hierarchy
      const hierarchy = getGroupHierarchy(startGroup);
      for (const current of hierarchy) {
        if (current.includes('IGST') || current.includes('INTEGRATED')) return 'IGST';
        if (current.includes('CGST') || current.includes('CENTRAL')) return 'CGST';
        if (current.includes('SGST') || current.includes('STATE') || current.includes('UTGST')) return 'SGST';
      }
      return null;
    };

    // 2. Fetch Ledgers
    const ledgerXml = buildLedgerGstinXml();
    const ledgerResp = await sendTallyRequest(ledgerXml, config, 20000);

    // ── GSTIN Map: Use regex on raw XML ──
    const gstinMap = new Map<string, string>();
    const panMap = new Map<string, string>();
    const ledgerParentMap = new Map<string, string>();

    // Extract GSTIN and Parent from each <LEDGER> block using regex
    const ledgerBlockRegex = /<LEDGER\s+NAME="([^"]*)"[^>]*>([\s\S]*?)<\/LEDGER>/g;
    let match: RegExpExecArray | null;
    while ((match = ledgerBlockRegex.exec(ledgerResp)) !== null) {
      const ledgerName = unescapeXml(match[1]).replace(/\s+/g, ' ').trim();
      const block = match[0];

      let gstinMatch = block.match(/<PARTYGSTIN[^>]*>([^<]+)<\/PARTYGSTIN>/i);
      let gstin = gstinMatch ? gstinMatch[1].replace(/\s+/g, '').trim() : '';

      if (!gstin || gstin.length < 15) {
        const regDetailMatch = block.match(/<LEDGSTREGDETAILS\.LIST>[\s\S]*?<GSTIN[^>]*>([^<]+)<\/GSTIN>[\s\S]*?<\/LEDGSTREGDETAILS\.LIST>/i);
        if (regDetailMatch) {
          gstin = regDetailMatch[1].replace(/\s+/g, '').trim();
        }
      }

      if (!gstin || gstin.length < 15) {
        const directMatch = block.match(/<GSTIN[^>]*>([^<]{15,})<\/GSTIN>/i);
        if (directMatch) {
          gstin = directMatch[1].replace(/\s+/g, '').trim();
        }
      }

      if (ledgerName && gstin && gstin.length >= 15) {
        gstinMap.set(ledgerName.toUpperCase(), gstin.toUpperCase());
      }

      let panMatch = block.match(/<INCOMETAXNUMBER[^>]*>([^<]+)<\/INCOMETAXNUMBER>/i) || block.match(/<PARTXPAN[^>]*>([^<]+)<\/PARTXPAN>/i);
      if (panMatch) {
        panMap.set(ledgerName.toUpperCase(), panMatch[1].replace(/\s+/g, '').trim());
      }

      let parentMatch = block.match(/<PARENT[^>]*>([^<]+)<\/PARENT>/i);
      if (parentMatch) {
        ledgerParentMap.set(ledgerName.toUpperCase(), unescapeXml(parentMatch[1]).replace(/\s+/g, ' ').trim().toUpperCase());
      }
    }

    console.log(`[TallyAPI] Regex GSTIN extraction: ${gstinMap.size} entries`);

    // ── Tax Map: Parse via Regex instead of DOMParser ──
    const taxMap = new Map<string, TaxLedgerInfo>();
    ledgerBlockRegex.lastIndex = 0;
    while ((match = ledgerBlockRegex.exec(ledgerResp)) !== null) {
      const ledgerName = unescapeXml(match[1]).replace(/\s+/g, ' ').trim();
      const block = match[0];

      const parentMatch = block.match(/<PARENT[^>]*>([^<]+)<\/PARENT>/i);
      const parent = parentMatch ? unescapeXml(parentMatch[1]).replace(/\s+/g, ' ').trim() : '';

      const customLedger = customTaxLedgers.find(cl => cl.name.trim().toUpperCase() === ledgerName.toUpperCase());

      let isITC = false, isOutput = false, isRCM = false, taxCategory: any = null;

      if (customLedger) {
        const typeUpper = (customLedger.type || '').toUpperCase();
        isITC = typeUpper === 'INPUT';
        isOutput = typeUpper === 'OUTPUT';
        isRCM = typeUpper === 'RCM';
        taxCategory = (customLedger.category || '').toUpperCase() as any;
      } else {
        const hierarchy = getGroupHierarchy(parent);
        isRCM = hierarchy.some(g => g === 'RCM' || g.includes('REVERSE'));

        const hasInputKeyword = hierarchy.some(g => g.includes('INPUT') || g === 'ITC' || g.includes('INWARD')) ||
          ledgerName.toUpperCase().includes('INPUT') ||
          ledgerName.toUpperCase().includes('ITC') ||
          ledgerName.toUpperCase().includes('INWARD');

        const hasOutputKeyword = hierarchy.some(g => g.includes('OUTPUT') || g.includes('OUTWARD')) ||
          ledgerName.toUpperCase().includes('OUTPUT') ||
          ledgerName.toUpperCase().includes('OUTWARD');

        if (hasInputKeyword) {
          isITC = true;
        } else if (hasOutputKeyword) {
          isOutput = true;
        } else {
          const underDuties = hierarchy.some(g => g === 'DUTIES & TAXES' || g === 'DUTIES AND TAXES' || g === 'GST');
          if (underDuties) {
            isITC = true; // default
          }
        }

        taxCategory = getTaxCategory(ledgerName.toUpperCase(), parent.toUpperCase());
      }

      if (isITC || isOutput || isRCM) {
        const gstin = gstinMap.get(ledgerName.toUpperCase()) || '';
        taxMap.set(ledgerName.toUpperCase(), {
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

    return { gstinMap, taxMap, panMap, groupParentMap, ledgerParentMap };
  })();

  return metadataCachePromise.catch(err => {
    metadataCachePromise = null;
    throw err;
  });
}

export interface LedgerClassifications {
  revenueLedgers: string[];
  expenseLedgers: string[];
  allLedgers: { name: string; parent: string }[];
}

/**
 * Fetches all ledgers and classifies them into Revenue and Expense categories
 * by tracing their parent group hierarchy.
 */
export async function fetchLedgerClassifications(
  config: TallyConnectionConfig = DEFAULT_CONFIG
): Promise<LedgerClassifications> {
  const { ledgerParentMap, groupParentMap } = await fetchTallyMetadata(config);

  const revenueLedgers: string[] = [];
  const expenseLedgers: string[] = [];
  const allLedgers: { name: string; parent: string }[] = [];

  const REVENUE_GROUPS = new Set(['SALES ACCOUNTS', 'DIRECT INCOMES', 'INDIRECT INCOMES']);
  const EXPENSE_GROUPS = new Set(['PURCHASE ACCOUNTS', 'DIRECT EXPENSES', 'INDIRECT EXPENSES']);

  for (const [ledgerName, parentGroup] of ledgerParentMap.entries()) {
    allLedgers.push({ name: ledgerName, parent: parentGroup });
    let currentGroup = parentGroup.toUpperCase();
    const visited = new Set<string>();

    while (currentGroup && !visited.has(currentGroup)) {
      visited.add(currentGroup);

      if (REVENUE_GROUPS.has(currentGroup)) {
        revenueLedgers.push(ledgerName);
        break;
      }
      if (EXPENSE_GROUPS.has(currentGroup)) {
        expenseLedgers.push(ledgerName);
        break;
      }
      currentGroup = groupParentMap.get(currentGroup) || '';
    }
  }
  return { revenueLedgers, expenseLedgers, allLedgers };
}

// ─── Fixed Assets API ───────────────────────────────────────

export interface TallyFixedAsset {
  ledgerName: string;
  name: string; // for compatibility
  openingBalance: number; // positive = debit
  closingBalance?: number;
  additions: any[];
  deletions: any[];
  parentGroup: string;
}

export async function fetchFixedAssets(
  fromDate: string,
  toDate: string,
  config: TallyConnectionConfig = DEFAULT_CONFIG
): Promise<TallyFixedAsset[]> {
  const meta = await fetchTallyMetadata(config);

  // Find all groups under Fixed Assets (case-insensitive)
  const fixedAssetGroups = new Set<string>();
  for (const [groupName, parentName] of meta.groupParentMap.entries()) {
    let current = groupName;
    while (current) {
      if (current.toUpperCase().trim() === 'FIXED ASSETS') {
        fixedAssetGroups.add(groupName.toUpperCase().trim());
        break;
      }
      current = meta.groupParentMap.get(current) || '';
    }
  }

  // Find all ledgers under those groups (case-insensitive)
  const fixedAssetLedgers = new Set<string>();
  for (const [ledgerName, parentName] of meta.ledgerParentMap.entries()) {
    if (fixedAssetGroups.has(parentName.toUpperCase().trim())) {
      fixedAssetLedgers.add(ledgerName.toUpperCase().trim());
    }
  }

  // Fetch opening balances for these ledgers
  const ledgerXml = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>FALedgers</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="FALedgers">
            <TYPE>Ledger</TYPE>
            <FETCH>Name, Parent, OpeningBalance</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;

  const ledgerResp = await sendTallyRequest(ledgerXml, config, 15000);
  const ledgerDoc = parseXml(ledgerResp);

  const faMap = new Map<string, TallyFixedAsset>();

  const ledgerNodes = getAllElements(ledgerDoc, 'LEDGER');
  for (const node of ledgerNodes) {
    const name = unescapeXml(node.getAttribute('NAME') || '').trim().toUpperCase();
    if (fixedAssetLedgers.has(name)) {
      const parent = unescapeXml(getTextContent(node, 'PARENT')).trim().toUpperCase();
      const obStr = getTextContent(node, 'OPENINGBALANCE');
      // In Tally, Debit balance is positive for assets. Often it has "Dr" suffix or just negative in XML.
      // We will parse safely.
      let ob = 0;
      if (obStr) {
        ob = parseFloat(obStr.replace(/[^0-9.-]/g, ''));
        // If it ends with Cr, it's credit (negative asset).
        if (obStr.includes('Cr')) ob = -Math.abs(ob);
        else if (obStr.includes('Dr')) ob = Math.abs(ob);
        // Sometimes Tally outputs negative for Debit. We'll use Math.abs if it's typical.
        // Actually, Tally XML opening balance: negative = Debit, positive = Credit.
        if (!obStr.includes('Dr') && !obStr.includes('Cr')) {
          ob = -ob; // Debit is negative in Tally XML
        }
      }

      faMap.set(name, {
        ledgerName: name,
        parentGroup: parent,
        openingBalance: ob,
        additions: [],
        deletions: []
      });
    }
  }

  // Now fetch vouchers for these ledgers to get additions/deletions
  const from = fromDate.replace(/-/g, '');
  const to = toDate.replace(/-/g, '');
  const ledgerNames = Array.from(faMap.keys());
  if (ledgerNames.length === 0) {
    return Array.from(faMap.values());
  }

  const allVoucherEntries: { date: string; vNum: string; ledgerName: string; amount: number; isDeemedPos: boolean }[] = [];

  const xml = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>MyLedgerEntries_FA</ID>
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
          <COLLECTION NAME="MyVouchers_FA">
            <TYPE>Voucher</TYPE>
            <FILTER>IsFAVch</FILTER>
          </COLLECTION>
          <SYSTEM TYPE="FORMULAS" NAME="IsFAVch">
            ($$IsJournal:$VoucherTypeName OR $$IsPayment:$VoucherTypeName OR $$IsPurchase:$VoucherTypeName OR $$IsReceipt:$VoucherTypeName OR $VoucherTypeName = "Journal" OR $VoucherTypeName = "Payment" OR $VoucherTypeName = "Purchase" OR $VoucherTypeName = "Receipt") AND NOT $IsCancelled AND NOT $IsOptional
          </SYSTEM>
          
          <COLLECTION NAME="MyLedgerEntries_FA">
            <SOURCECOLLECTION>MyVouchers_FA</SOURCECOLLECTION>
            <WALK>AllLedgerEntries</WALK>
            <COMPUTE>VchDate : $..Date</COMPUTE>
            <COMPUTE>VchNumber : $..VoucherNumber</COMPUTE>
            <COMPUTE>LedgerName : $LedgerName</COMPUTE>
            <COMPUTE>Amount : $Amount</COMPUTE>
            <COMPUTE>IsDeemedPositive : $IsDeemedPositive</COMPUTE>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;

  try {
    // Single request for the period (increased timeout to 30s as it fetches the full company data in one go)
    const resp = await sendTallyRequest(xml, config, 30000);
    const doc = parseXml(resp);
    const entryNodes = getAllElements(doc, 'LEDGERENTRY');

    for (const node of entryNodes) {
      const lName = unescapeXml(getTextContent(node, 'LEDGERNAME')).trim().toUpperCase();
      if (faMap.has(lName)) {
        const vDate = tallyDateToISO(getTextContent(node, 'VCHDATE'));
        // Discard any entries that fall outside our targeted date range
        if (vDate >= fromDate && vDate <= toDate) {
          const vNum = getTextContent(node, 'VCHNUMBER');
          const amtStr = getTextContent(node, 'AMOUNT');
          const isDeemedPos = getTextContent(node, 'ISDEEMEDPOSITIVE') === 'Yes';
          const amt = safeNum(amtStr);
          if (amt > 0) {
            allVoucherEntries.push({ date: vDate, vNum, ledgerName: lName, amount: amt, isDeemedPos });
          }
        }
      }
    }
  } catch (err) {
    console.warn(`Failed to fetch FA vouchers:`, err);
  }

  // Populate additions/deletions in faMap
  for (const entry of allVoucherEntries) {
    const asset = faMap.get(entry.ledgerName)!;
    if (entry.isDeemedPos) {
      asset.additions.push({ date: entry.date, amount: entry.amount, voucherNumber: entry.vNum });
    } else {
      asset.deletions.push({ date: entry.date, amount: entry.amount, voucherNumber: entry.vNum });
    }
  }

  return Array.from(faMap.values());
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
  customTaxLedgers: { name: string, category: 'CGST' | 'SGST' | 'IGST', type: 'Input' | 'Output' | 'RCM' }[] = [],
  strictMode: boolean = false
): Promise<TallyFlatVoucher[]> {
  clearTallyMetadataCache();
  const xml = buildVoucherQueryXml(customVoucherTypes, fromDate, toDate);
  const resp = await sendTallyRequest(xml, config);
  return parseTallyVouchers([resp], config, baseVoucherType, customInputTaxGroups, customOutputTaxGroups, customTaxLedgers, strictMode);
}

export async function parseTallyVouchers(
  xmlStrings: string[],
  config: TallyConnectionConfig = DEFAULT_CONFIG,
  baseVoucherTypeOverride?: TallyVoucherType,
  customInputTaxGroups: string[] = ['ITC', 'DUTIES & TAXES', 'DUTIES AND TAXES', 'INPUT'],
  customOutputTaxGroups: string[] = ['OUTPUT', 'DUTIES & TAXES', 'DUTIES AND TAXES'],
  customTaxLedgers: { name: string, category: 'CGST' | 'SGST' | 'IGST', type: 'Input' | 'Output' | 'RCM' }[] = [],
  strictMode: boolean = false
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

    // Group ledger entries by Guid (or VchNumber if Guid is missing)
    const vouchersByGuid = new Map<string, Element[]>();
    for (const entry of ledgerEntries) {
      let guid = getTextContent(entry, 'GUID');
      if (!guid) {
        guid = getTextContent(entry, 'VCHNUMBER');
      }
      if (!guid) continue;
      if (!vouchersByGuid.has(guid)) vouchersByGuid.set(guid, []);
      vouchersByGuid.get(guid)!.push(entry);
    }

    for (const [guid, entries] of vouchersByGuid.entries()) {
      // The first entry has all the voucher-level compute fields
      const firstEntry = entries[0];

      const date = tallyDateToISO(getTextContent(firstEntry, 'VCHDATE'));
      const voucherNumber = getTextContent(firstEntry, 'VCHNUMBER');
      let originalVoucherType = getTextContent(firstEntry, 'VCHTYPE') || '';
      let voucherType = originalVoucherType;
      if (baseVoucherTypeOverride) {
        voucherType = baseVoucherTypeOverride;
      }

      let partyName = (getTextContent(firstEntry, 'PARTYNAME') || getTextContent(firstEntry, 'PARTYLEDGERNAME')).replace(/\s+/g, ' ').trim();
      const reference = getTextContent(firstEntry, 'REFERENCE');
      // NOTE: We do NOT read PARTYGSTIN/CONSIGNEEGSTIN from the voucher XML here because
      // Tally stores the COMPANY'S OWN GSTIN in those fields, not the supplier's GSTIN.
      // The correct GSTIN is fetched from the Ledger Master (gstinMap) by party name below.
      let partyGstin = '';
      const knownPartyName = (partyName || getTextContent(firstEntry, 'BASICBUYERNAME') || '').toUpperCase().trim();

      // Parse all ledger entries for tax classification and amounts
      let igst = 0, cgst = 0, sgst = 0, taxableValue = 0, maxAmount = 0;
      let cgstLedgers: string[] = [];
      let sgstLedgers: string[] = [];
      let igstLedgers: string[] = [];
      let fallbackPartyName = '';
      const debugLog: string[] = [];
      const anomalies: string[] = [];
      const taxLedgersBreakdown: { ledgerName: string; amount: number; category: string; type: string }[] = [];

      for (const entry of entries) {
        const ledgerNameRaw = getTextContent(entry, 'LEDGERNAME');
        const ledgerName = ledgerNameRaw.toUpperCase().trim();
        const amountStr = getTextContent(entry, 'AMOUNT');
        const amount = safeNum(amountStr);
        const isDeemedPositiveStr = getTextContent(entry, 'ISDEEMEDPOSITIVE');
        const isDebit = isDeemedPositiveStr === 'Yes';

        let taxInfo = undefined;

        const customMapping = customTaxLedgers.find(l => l.name.trim().toUpperCase() === ledgerName);

        if (customMapping) {
          const typeUpper = (customMapping.type || '').toUpperCase();
          taxInfo = {
            gstin: '',
            isOutput: typeUpper === 'OUTPUT',
            isRCM: typeUpper === 'RCM',
            isITC: typeUpper === 'INPUT',
            taxCategory: (customMapping.category || '').toUpperCase() as any
          };
        } else if (!strictMode) {
          // Auto-detection Mode: Rely on Tally Group inheritance and aggressive string matching
          taxInfo = taxMap.get(ledgerName);

          // Hard fallback: if it wasn't mapped by group or exact name, but contains GST keywords, force it!
          // (We ensure we don't accidentally match the primary party name just because it has "GST" in it)
          if (!taxInfo && ledgerName !== knownPartyName && !ledgerName.includes('PURCHASE') && !ledgerName.includes('SALES') && !ledgerName.includes('DISCOUNT') && !ledgerName.includes('ROUND')) {
            if (ledgerName.includes('IGST') || ledgerName.includes('INTEGRATED TAX')) {
              taxInfo = { gstin: '', isOutput: ledgerName.includes('OUTPUT'), isRCM: false, isITC: !ledgerName.includes('OUTPUT'), taxCategory: 'IGST' };
            } else if (ledgerName.includes('CGST') || ledgerName.includes('CENTRAL TAX')) {
              taxInfo = { gstin: '', isOutput: ledgerName.includes('OUTPUT'), isRCM: false, isITC: !ledgerName.includes('OUTPUT'), taxCategory: 'CGST' };
            } else if (ledgerName.includes('SGST') || ledgerName.includes('STATE TAX') || ledgerName.includes('UTGST')) {
              taxInfo = { gstin: '', isOutput: ledgerName.includes('OUTPUT'), isRCM: false, isITC: !ledgerName.includes('OUTPUT'), taxCategory: 'SGST' };
            }
          }
        }

        if (taxInfo) {
          debugLog.push(`Found tax ledger: ${ledgerName} (Amt: ${amountStr}, isDebit: ${isDebit})`);

          let isValidTax = false;
          let effectiveAmount = amount;
          const category = taxInfo.taxCategory;

          if (voucherType === 'Purchase') {
            isValidTax = taxInfo.isITC || taxInfo.isOutput || taxInfo.isRCM;
            if (isValidTax) {
              effectiveAmount = !isDebit ? -amount : amount;
              if (taxInfo.isOutput) {
                anomalies.push(`Output Tax on Purchase: ${category} ₹${amount.toFixed(2)}`);
              } else if (!isDebit) {
                anomalies.push(`Input Tax Reversal (Credit Balance): ${category} ₹${amount.toFixed(2)}`);
              }
            }
          } else if (voucherType === 'Sales') {
            isValidTax = taxInfo.isITC || taxInfo.isOutput || taxInfo.isRCM;
            if (isValidTax) {
              effectiveAmount = isDebit ? -amount : amount;
              if (taxInfo.isITC) {
                anomalies.push(`Input Tax on Sales: ${category} ₹${amount.toFixed(2)}`);
              } else if (isDebit) {
                anomalies.push(`Output Tax Reversal (Debit Balance): ${category} ₹${amount.toFixed(2)}`);
              }
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
          } else if (voucherType === 'Journal') {
            isValidTax = taxInfo.isITC || taxInfo.isOutput || taxInfo.isRCM;
            if (isValidTax) {
              effectiveAmount = !isDebit ? -amount : amount;
            }
          } else {
            isValidTax = taxInfo.isITC || taxInfo.isOutput || taxInfo.isRCM;
            effectiveAmount = amount;
          }

          if (isValidTax) {
            debugLog.push(` -> Valid for ${voucherType}, Category: ${category}, Eff Amt: ${effectiveAmount}`);
            if (category === 'IGST') { igst += effectiveAmount; igstLedgers.push(ledgerNameRaw); }
            else if (category === 'CGST') { cgst += effectiveAmount; cgstLedgers.push(ledgerNameRaw); }
            else if (category === 'SGST') { sgst += effectiveAmount; sgstLedgers.push(ledgerNameRaw); }

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
        debugLog: debugLog.join('\n'),
        originalVoucherType,
        cgstLedger: Array.from(new Set(cgstLedgers)).join(', '),
        sgstLedger: Array.from(new Set(sgstLedgers)).join(', '),
        igstLedger: Array.from(new Set(igstLedgers)).join(', ')
      });
    } // End vouchers loop
  } // End xml loop

  return results;
}

export interface TallyTdsTransaction {
  date: Date;
  partyName: string;
  partyPan: string;
  ledgerName: string;
  amount: number;
  actualTdsDeducted: number;
  tdsLedgerName?: string;
  parentGroup?: string;
  parentGroupPath?: string;
}

export async function fetchTdsTransactions(
  fromDate: string,
  toDate: string,
  config: TallyConnectionConfig = DEFAULT_CONFIG,
  groupMappings?: { expenseGroup: string; subGroup?: string; subGroup2?: string; sectionCode: string }[],
  customPurchaseTypes: string[] = [],
  customJournalTypes: string[] = [],
  tdsLedgerNames: string[] = []
): Promise<TallyTdsTransaction[]> {
  const meta = await fetchTallyMetadata(config);
  const panMap = meta.panMap;

  const tdsLedgersSet = new Set(
    (tdsLedgerNames || []).map(name => name.toUpperCase().trim())
  );

  const purchaseList = ['Purchase', ...customPurchaseTypes];
  const journalList = ['Journal', ...customJournalTypes];
  const paymentList = ['Payment', 'Debit Note', 'Credit Note'];

  // Fetch Purchase, Journal, Payment, and Debit/Credit Note vouchers (which carry expense reversals)
  const xml = buildVoucherQueryXml([...purchaseList, ...journalList, ...paymentList], fromDate, toDate);
  const resp = await sendTallyRequest(xml, config, 60000);
  const doc = parseXml(resp);
  const ledgerEntries = getAllElements(doc, 'LEDGERENTRY');

  const vouchersByGuid = new Map<string, Element[]>();
  for (const entry of ledgerEntries) {
    let guid = getTextContent(entry, 'GUID') || getTextContent(entry, 'VCHNUMBER');
    if (!guid) continue;
    if (!vouchersByGuid.has(guid)) vouchersByGuid.set(guid, []);
    vouchersByGuid.get(guid)!.push(entry);
  }

  const results: TallyTdsTransaction[] = [];

  const getHierarchy = (ledgerName: string): string[] => {
    const path: string[] = [];
    const currentLedgerUpper = ledgerName.replace(/\s+/g, ' ').toUpperCase().trim();
    let currentGroup = meta.ledgerParentMap.get(currentLedgerUpper);
    const visited = new Set<string>();

    while (currentGroup && !visited.has(currentGroup)) {
      path.push(currentGroup);
      visited.add(currentGroup);
      currentGroup = meta.groupParentMap.get(currentGroup);
    }
    return path;
  };

  const matchesMapping = (ledgerHierarchy: string[], mapping: { expenseGroup: string; subGroup?: string; subGroup2?: string }) => {
    const normalize = (s: string) => s.replace(/\s+/g, ' ').toUpperCase().trim();
    const g1 = normalize(mapping.expenseGroup);
    const g2 = mapping.subGroup ? normalize(mapping.subGroup) : null;
    const g3 = mapping.subGroup2 ? normalize(mapping.subGroup2) : null;

    if (!ledgerHierarchy.includes(g1)) return false;
    if (g2 && !ledgerHierarchy.includes(g2)) return false;
    if (g3 && !ledgerHierarchy.includes(g3)) return false;
    return true;
  };

  for (const [guid, entries] of vouchersByGuid.entries()) {
    const firstEntry = entries[0];
    const dateStr = getTextContent(firstEntry, 'VCHDATE');
    const date = new Date(tallyDateToISO(dateStr));

    let partyName = '';

    const isPartyLedger = (name: string, h: string[]): boolean => {
      const nameUpper = name.toUpperCase().trim();
      if (panMap.has(nameUpper)) return true;
      if (partyName && nameUpper === partyName.toUpperCase().trim()) return true;
      return h.some(g => g.includes('SUNDRY CREDITORS') || g.includes('SUNDRY DEBTORS'));
    };

    // Step 1: Pre-scan to identify the Party Ledger
    for (const entry of entries) {
      const ledgerNameRaw = getTextContent(entry, 'LEDGERNAME');
      const hierarchy = getHierarchy(ledgerNameRaw);
      if (isPartyLedger(ledgerNameRaw, hierarchy)) {
        partyName = ledgerNameRaw;
        break;
      }
    }

    // Fallback if no Sundry Creditor/Debtor found:
    if (!partyName) {
      for (const entry of entries) {
        const ledgerNameRaw = getTextContent(entry, 'LEDGERNAME');
        const ledgerName = ledgerNameRaw.toUpperCase().trim();
        const amountStr = getTextContent(entry, 'AMOUNT');
        const amount = safeNum(amountStr);
        const isDebit = getTextContent(entry, 'ISDEEMEDPOSITIVE') === 'Yes';

        const isTds = tdsLedgersSet.has(ledgerName) || ledgerName.includes('TDS') || ledgerName.includes('TAX DEDUCTED');
        const isGst = ledgerName.includes('CGST') || ledgerName.includes('SGST') || ledgerName.includes('IGST') || ledgerName.includes('TAX');

        if (!isTds && !isGst && !isDebit && amount > 0) {
          partyName = ledgerNameRaw;
          break;
        }
      }
    }

    if (!partyName) partyName = getTextContent(firstEntry, 'PARTYNAME') || getTextContent(firstEntry, 'PARTYLEDGERNAME') || 'Unknown Party';

    const partyNameUpper = partyName.toUpperCase().trim();
    const partyPan = panMap.get(partyNameUpper) || '';

    let tdsAmount = 0;
    let tdsLedgerName = '';
    const expenses: { name: string, amount: number }[] = [];

    // Step 2: Scan for Expense lines and TDS
    for (const entry of entries) {
      const ledgerNameRaw = getTextContent(entry, 'LEDGERNAME');
      const ledgerName = ledgerNameRaw.toUpperCase().trim();
      const amountStr = getTextContent(entry, 'AMOUNT');
      const amount = safeNum(amountStr);
      const isDebit = getTextContent(entry, 'ISDEEMEDPOSITIVE') === 'Yes';

      const isTdsLedger = tdsLedgersSet.has(ledgerName) || ledgerName.includes('TDS') || ledgerName.includes('TAX DEDUCTED');

      if (isTdsLedger) {
        if (!isDebit) {
          tdsAmount += amount;
          tdsLedgerName = ledgerNameRaw;
        } else {
          tdsAmount -= amount;
        }
      } else if (ledgerName !== partyNameUpper) {
        if (!ledgerName.includes('CGST') && !ledgerName.includes('SGST') && !ledgerName.includes('IGST') && !ledgerName.includes('TAX') && !ledgerName.includes('ROUND OFF') && !ledgerName.includes('ROUNDING')) {
          const expenseAmount = isDebit ? amount : -amount;
          expenses.push({ name: ledgerNameRaw, amount: expenseAmount });
        }
      }
    }

    if (expenses.length > 0) {
      expenses.sort((a, b) => b.amount - a.amount);
      const mainExpenseLedger = expenses[0].name;
      const hierarchyForMain = getHierarchy(mainExpenseLedger);

      // Check if this is a separate TDS deduction adjustment voucher (debits party, credits TDS)
      if (isPartyLedger(mainExpenseLedger, hierarchyForMain) && tdsAmount > 0) {
        let adjTdsLedgerName = 'TDS';
        for (const entry of entries) {
          const lnRaw = getTextContent(entry, 'LEDGERNAME');
          const ln = lnRaw.toUpperCase().trim();
          const isTds = tdsLedgersSet.has(ln) || ln.includes('TDS') || ln.includes('TAX DEDUCTED');
          if (isTds) {
            adjTdsLedgerName = lnRaw;
            break;
          }
        }

        results.push({
          date,
          partyName: mainExpenseLedger, // The party is the one debited
          partyPan: panMap.get(mainExpenseLedger.toUpperCase().trim()) || '',
          ledgerName: adjTdsLedgerName, // The TDS ledger name
          amount: 0,
          actualTdsDeducted: tdsAmount,
          tdsLedgerName: adjTdsLedgerName,
          parentGroup: 'TDS Tax Liability',
          parentGroupPath: 'TDS Tax Liability'
        });
        continue;
      }

      // Otherwise, it is a normal expense voucher. We process each expense ledger line separately!
      const isExpenseOrPurchaseGroup = (hierarchy: string[]): boolean => {
        return hierarchy.some(g => {
          const gu = g.toUpperCase().trim();
          return gu === 'INDIRECT EXPENSES' || gu === 'DIRECT EXPENSES' || gu === 'PURCHASE ACCOUNTS' ||
            gu.includes('EXPENSES') || gu.includes('PURCHASE ACCOUNTS') ||
            gu === 'DIRECT EXPENSE' || gu === 'INDIRECT EXPENSE';
        });
      };

      const mappedExpenses = expenses.filter(e => {
        const hierarchy = getHierarchy(e.name);
        if (!isExpenseOrPurchaseGroup(hierarchy)) return false;
        const fullPath = [e.name.replace(/\s+/g, ' ').toUpperCase().trim(), ...hierarchy];
        return !groupMappings || groupMappings.length === 0 || groupMappings.some(m => matchesMapping(fullPath, m));
      });

      if (mappedExpenses.length === 0) {
        continue; // Discard since none of the expense lines match the expense groups or templates
      }

      const targetExpenses = mappedExpenses;
      const totalTargetAmount = targetExpenses.reduce((sum, e) => sum + Math.abs(e.amount), 0);

      for (const expense of targetExpenses) {
        if (expense.amount === 0) continue;
        const hierarchy = getHierarchy(expense.name);
        const allocatedTds = totalTargetAmount > 0 ? (Math.abs(expense.amount) / totalTargetAmount) * tdsAmount : 0;

        results.push({
          date,
          partyName,
          partyPan,
          ledgerName: expense.name,
          amount: expense.amount,
          actualTdsDeducted: Math.round(allocatedTds * 100) / 100,
          tdsLedgerName: allocatedTds > 0 ? (tdsLedgerName || 'TDS') : '',
          parentGroup: hierarchy[0] || 'Expense',
          parentGroupPath: hierarchy.join(', ')
        });
      }
    } else if (tdsAmount > 0 && partyName) {
      // Separate TDS adjustment voucher (e.g. debits party, credits TDS) with no other expense lines
      results.push({
        date,
        partyName,
        partyPan: panMap.get(partyName.toUpperCase().trim()) || '',
        ledgerName: tdsLedgerName || 'TDS',
        amount: 0,
        actualTdsDeducted: tdsAmount,
        tdsLedgerName: tdsLedgerName || 'TDS',
        parentGroup: 'TDS Tax Liability',
        parentGroupPath: 'TDS Tax Liability'
      });
    }
  }
  return results;
}

// ─── Forensic Audit Functions ────────────────────────────────

export interface TallyVoucherInfo {
  voucherNumber: string;
  date: string;
  voucherType: string;
  guid: string;
  narration: string;
  partyName: string;
  amount: number;
}

export interface ForensicVoucher {
  voucherNumber: string;
  date: string;
  narration: string;
  partyName: string;
  amount: number;
  isCancelled: boolean;
  isOptional: boolean;
  isDebit?: boolean;
}

function splitDateRangeIntoMonths(fromDate: string, toDate: string): { start: string; end: string }[] {
  const chunks: { start: string; end: string }[] = [];
  const start = new Date(fromDate);
  const end = new Date(toDate);
  
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
    return [{ start: fromDate, end: toDate }];
  }
  
  let currentStart = new Date(start);
  while (currentStart <= end) {
    const chunkStartStr = currentStart.toISOString().split('T')[0];
    
    // Set to the end of the current month
    const currentEnd = new Date(currentStart.getFullYear(), currentStart.getMonth() + 1, 0);
    let chunkEndStr: string;
    if (currentEnd >= end) {
      chunkEndStr = end.toISOString().split('T')[0];
      chunks.push({ start: chunkStartStr, end: chunkEndStr });
      break;
    } else {
      chunkEndStr = currentEnd.toISOString().split('T')[0];
      chunks.push({ start: chunkStartStr, end: chunkEndStr });
    }
    
    // Move to next month
    currentStart = new Date(currentStart.getFullYear(), currentStart.getMonth() + 1, 1);
  }
  return chunks;
}

/**
 * Fetches basic voucher information (number, date, etc.) for a specific voucher type.
 * This is optimized for gap detection and forensic analysis.
 */
export async function fetchVouchersForForensics(
  voucherType: string,
  fromDate: string,
  toDate: string,
  config: TallyConnectionConfig = DEFAULT_CONFIG
): Promise<ForensicVoucher[]> {
  const xml = buildForensicVoucherQueryXml(voucherType, fromDate, toDate);
  try {
    const resp = await sendTallyRequest(xml, config, 60000);
    const doc = parseXml(resp);
    const voucherNodes = getAllElements(doc, 'VOUCHER');
    return voucherNodes.map(node => {
      const amtStr = getTextContent(node, 'AMOUNT').replace(/[₹,\s]/g, '').trim();
      let amount = parseFloat(amtStr);
      if (isNaN(amount)) amount = 0;

      const isCancelledStr = getTextContent(node, 'ISCANCELLED').toUpperCase();
      const isCancelled = isCancelledStr === 'YES' || isCancelledStr === 'TRUE';

      const isOptionalStr = getTextContent(node, 'ISOPTIONAL').toUpperCase();
      const isOptional = isOptionalStr === 'YES' || isOptionalStr === 'TRUE';

      const isDeemedPositiveStr = getTextContent(node, 'ISDEEMEDPOSITIVE').toUpperCase();
      const isDebit = isDeemedPositiveStr === 'YES' || isDeemedPositiveStr === 'TRUE' || amount < 0;

      return {
        voucherNumber: getTextContent(node, 'VOUCHERNUMBER'),
        date: tallyDateToISO(getTextContent(node, 'DATE')),
        narration: unescapeXml(getTextContent(node, 'NARRATION')),
        partyName: unescapeXml(getTextContent(node, 'PARTYLEDGERNAME')),
        amount: Math.abs(amount),
        isCancelled,
        isOptional,
        isDebit
      };
    });
  } catch (error) {
    console.error(`Failed to fetch forensic vouchers for period ${fromDate} to ${toDate}:`, error);
    return [];
  }
}



// ─── Party Balance Functions ─────────────────────────────────

function buildLedgerBalanceXml(partyNames?: string[]): string {
  let collectionXml = '';
  if (partyNames && partyNames.length > 0) {
    const escapedNames = partyNames.map(name => escapeXml(name.replace(/\s+/g, ' ').trim()));
    const conditions = escapedNames.map(name => `$Name = "${name}"`).join(' OR ');
    collectionXml = `
          <COLLECTION NAME="PartyBalances">
            <TYPE>Ledger</TYPE>
            <FILTER>IsTargetParty</FILTER>
            <FETCH>Name, Parent, ClosingBalance</FETCH>
          </COLLECTION>
          <SYSTEM TYPE="FORMULAS" NAME="IsTargetParty">${conditions}</SYSTEM>`;
  } else {
    collectionXml = `
          <COLLECTION NAME="PartyBalances">
            <TYPE>Ledger</TYPE>
            <FILTER>IsPartyLedger</FILTER>
            <FETCH>Name, Parent, ClosingBalance</FETCH>
          </COLLECTION>
          <SYSTEM TYPE="FORMULAS" NAME="IsPartyLedger">$$IsBelongsTo:$$GroupSundryCreditors OR $$IsBelongsTo:$$GroupSundryDebtors</SYSTEM>`;
  }

  return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>PartyBalances</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>${collectionXml}</TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
}

/** Fetch closing balances for specified parties or all Sundry Creditor parties from Tally */
export async function fetchPartyBalances(
  fromDate: string,
  toDate: string,
  config: TallyConnectionConfig = DEFAULT_CONFIG,
  partyNames?: string[]
): Promise<Map<string, number>> {
  const xml = buildLedgerBalanceXml(partyNames);
  const resp = await sendTallyRequest(xml, config, 15000);

  const balanceMap = new Map<string, number>();

  // Parse using regex for robustness
  const ledgerBlockRegex = /<LEDGER\s+NAME="([^"]*)"[^>]*>([\s\S]*?)<\/LEDGER>/g;
  let match: RegExpExecArray | null;
  while ((match = ledgerBlockRegex.exec(resp)) !== null) {
    const ledgerName = unescapeXml(match[1]).replace(/\s+/g, ' ').trim();
    const block = match[0];

    const balMatch = block.match(/<CLOSINGBALANCE[^>]*>([^<]+)<\/CLOSINGBALANCE>/i);
    if (ledgerName && balMatch) {
      const balStr = balMatch[1].replace(/[₹,\s]/g, '').replace(/Dr|Cr/gi, '').trim();
      let balance = parseFloat(balStr);
      if (isNaN(balance)) balance = 0;

      // In Tally: credit balances end with "Cr" or are negative
      const isCredit = balMatch[1].toUpperCase().includes('CR') || parseFloat(balStr) < 0;
      if (isCredit) {
        balance = -Math.abs(balance);
      } else {
        balance = Math.abs(balance);
      }
      balanceMap.set(ledgerName.toUpperCase(), balance);
    }
  }

  console.log(`[TallyAPI] Party balances fetched: ${balanceMap.size} entries (filtered by: ${partyNames ? partyNames.length : 'Sundry Creditors'})`);
  return balanceMap;
}

// ─── Dual Depreciation API Functions ─────────────────────────

export interface TallyFixedAssetAdditions {
  date: string;
  voucherNo: string;
  voucherType: string;
  amount: number;
  type: 'Addition' | 'Deletion';
  narration: string;
}

// TallyFixedAsset is defined globally at line 744

function buildFixedAssetBalancesXml(): string {
  return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>FixedAssetBalances</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="FixedAssetBalances">
            <TYPE>Ledger</TYPE>
            <CHILDOF>Fixed Assets</CHILDOF>
            <FETCH>Name, Parent, OpeningBalance, ClosingBalance</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
}

function buildFixedAssetEntriesXml(fromDate: string, toDate: string): string {
  const from = fromDate.replace(/-/g, '');
  const to = toDate.replace(/-/g, '');

  return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>FixedAssetEntries</ID>
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
          <COLLECTION NAME="FixedAssetEntries">
            <TYPE>Voucher</TYPE>
            <WALK>AllLedgerEntries</WALK>
            <FILTER>IsFixedAssetLedgerEntry</FILTER>
            <COMPUTE>VchDate : $..Date</COMPUTE>
            <COMPUTE>VchNumber : $..VoucherNumber</COMPUTE>
            <COMPUTE>VchType : $..VoucherTypeName</COMPUTE>
            <COMPUTE>AssetLedger : $LedgerName</COMPUTE>
            <COMPUTE>Amount : $Amount</COMPUTE>
            <COMPUTE>IsDeemedPositive : $IsDeemedPositive</COMPUTE>
            <COMPUTE>Narration : $..Narration</COMPUTE>
          </COLLECTION>
          <SYSTEM TYPE="FORMULAS" NAME="IsFixedAssetLedgerEntry">
            $$IsGroupOF:$$LedgerParent:$LedgerName:"Fixed Assets"
          </SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
}

export async function fetchFixedAssetsFromTally(
  fromDate: string,
  toDate: string,
  config: TallyConnectionConfig = DEFAULT_CONFIG
): Promise<TallyFixedAsset[]> {
  try {
    // 1. Fetch ledgers and their balances
    const balancesXml = buildFixedAssetBalancesXml();
    const balancesResp = await sendTallyRequest(balancesXml, config, 20000);
    const balancesDoc = parseXml(balancesResp);
    const ledgerNodes = getAllElements(balancesDoc, 'LEDGER');

    const assetsMap = new Map<string, TallyFixedAsset>();

    ledgerNodes.forEach(node => {
      let name = getTextContent(node, 'NAME') || node.getAttribute('NAME') || '';
      name = unescapeXml(name).replace(/\s+/g, ' ').trim();
      if (!name) return;

      const parent = unescapeXml(getTextContent(node, 'PARENT')).replace(/\s+/g, ' ').trim();
      
      const opStr = getTextContent(node, 'OPENINGBALANCE').replace(/[₹,\s]/g, '').trim();
      let openingBalance = parseFloat(opStr);
      if (isNaN(openingBalance)) openingBalance = 0;
      // In Tally: credit balances end with "Cr" or are negative
      const isOpCredit = getTextContent(node, 'OPENINGBALANCE').toUpperCase().includes('CR');
      if (isOpCredit) openingBalance = -Math.abs(openingBalance);
      else openingBalance = Math.abs(openingBalance);

      const clStr = getTextContent(node, 'CLOSINGBALANCE').replace(/[₹,\s]/g, '').trim();
      let closingBalance = parseFloat(clStr);
      if (isNaN(closingBalance)) closingBalance = 0;
      const isClCredit = getTextContent(node, 'CLOSINGBALANCE').toUpperCase().includes('CR');
      if (isClCredit) closingBalance = -Math.abs(closingBalance);
      else closingBalance = Math.abs(closingBalance);

      assetsMap.set(name.toUpperCase(), {
        name,
        ledgerName: name,
        parentGroup: parent || 'Fixed Assets',
        openingBalance,
        closingBalance,
        additions: [],
        deletions: []
      });
    });

    // 2. Fetch ledger transaction entries (Additions/Deletions)
    const entriesXml = buildFixedAssetEntriesXml(fromDate, toDate);
    const entriesResp = await sendTallyRequest(entriesXml, config, 30000);
    const entriesDoc = parseXml(entriesResp);
    const voucherNodes = getAllElements(entriesDoc, 'VOUCHER');

    voucherNodes.forEach(node => {
      // Find all ledger entries inside this voucher node
      const entries = getAllElements(node, 'LEDGERENTRY');
      entries.forEach(entry => {
        let assetLedger = getTextContent(entry, 'ASSETLEDGER');
        assetLedger = unescapeXml(assetLedger).replace(/\s+/g, ' ').trim();
        if (!assetLedger) return;

        const asset = assetsMap.get(assetLedger.toUpperCase());
        if (!asset) return;

        const date = tallyDateToISO(getTextContent(entry, 'VCHDATE'));
        const voucherNo = getTextContent(entry, 'VCHNUMBER');
        const voucherType = getTextContent(entry, 'VCHTYPE');
        const narration = unescapeXml(getTextContent(entry, 'NARRATION'));

        const amtStr = getTextContent(entry, 'AMOUNT').replace(/[₹,\s]/g, '').trim();
        let amount = parseFloat(amtStr);
        if (isNaN(amount)) amount = 0;

        const isDeemedPositiveStr = getTextContent(entry, 'ISDEEMEDPOSITIVE').toUpperCase();
        // For Assets, Debit increases balance (Addition), Credit decreases (Deletion)
        // In Tally: $IsDeemedPositive = Yes means Debit. Credit amounts are negative in xml sometimes.
        const isDebit = isDeemedPositiveStr === 'YES' || isDeemedPositiveStr === 'TRUE' || amount < 0;

        asset.additions.push({
          date,
          voucherNo,
          voucherType,
          amount: Math.abs(amount),
          type: isDebit ? 'Addition' : 'Deletion',
          narration
        });
      });
    });

    return Array.from(assetsMap.values());
  } catch (error) {
    console.error('[TallyAPI] Failed to fetch Fixed Asset details:', error);
    return [];
  }
}

// fetchFixedAssets is defined at line 752
