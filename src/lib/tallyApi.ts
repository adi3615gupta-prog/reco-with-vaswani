export {};
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
  | 'Debit Note'
  | 'Payment';

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
  // New field: list of ledger names involved in this voucher (for UI filtering)
  ledgerNames?: string[];
}

export interface TallyCompanyInfo {
  name: string;
  address: string;
  gstin: string;
  state: string;
  financialYear: string;
}

export function extractLedgerNameFromBlock(tagHeader: string, blockContent: string): string {
  const attrMatch = tagHeader.match(/NAME="([^"]+)"/i);
  if (attrMatch && attrMatch[1].trim()) {
    return unescapeXml(attrMatch[1]).replace(/\s+/g, ' ').trim();
  }
  const listMatch = blockContent.match(/<NAME\.LIST[^>]*>[\s\S]*?<NAME\b[^>]*>([^<]+)<\/NAME>/i);
  if (listMatch && listMatch[1].trim()) {
    return unescapeXml(listMatch[1]).replace(/\s+/g, ' ').trim();
  }
  const tagMatch = blockContent.match(/<NAME\b[^>]*>([^<]+)<\/NAME>/i);
  if (tagMatch && tagMatch[1].trim()) {
    return unescapeXml(tagMatch[1]).replace(/\s+/g, ' ').trim();
  }
  return '';
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

export function formatToTallyDate(dateStr: string): string {
  if (!dateStr) return '';
  const clean = dateStr.trim();
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(clean)) {
    const parts = clean.split(/[-/]/);
    return `${parts[0]}${parts[1].padStart(2, '0')}${parts[2].padStart(2, '0')}`;
  }
  if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(clean)) {
    const parts = clean.split(/[-/]/);
    return `${parts[2]}${parts[1].padStart(2, '0')}${parts[0].padStart(2, '0')}`;
  }
  return clean.replace(/[^0-9]/g, '');
}

function buildVoucherNumberQueryXml(voucherType: string, fromDate: string, toDate: string): string {
  const from = formatToTallyDate(fromDate);
  const to = formatToTallyDate(toDate);
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
  const from = formatToTallyDate(fromDate);
  const to = formatToTallyDate(toDate);
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
  // Convert any date format to YYYYMMDD for Tally
  const from = formatToTallyDate(fromDate);
  const to = formatToTallyDate(toDate);

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
    throw new Error("XML parsing failed: " + errorNode.textContent);
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
        const nameTagMatch = block.match(/<NAME\b[^>]*>([^<]+)<\/NAME>/i);
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
      const normName = ledgerName.replace(/\s+/g, ' ').toUpperCase();
      // Check ledger name first
      if (normName.includes('IGST') || normName.includes('INTEGRATED') || normName.includes('I GST')) return 'IGST';
      if (normName.includes('CGST') || normName.includes('CENTRAL') || normName.includes('C GST')) return 'CGST';
      if (normName.includes('SGST') || normName.includes('STATE') || normName.includes('UTGST') || normName.includes('S GST')) return 'SGST';

      // Check parent groups in hierarchy
      const hierarchy = getGroupHierarchy(startGroup);
      for (const current of hierarchy) {
        const normGroup = current.replace(/\s+/g, ' ').toUpperCase();
        if (normGroup.includes('IGST') || normGroup.includes('INTEGRATED') || normGroup.includes('I GST')) return 'IGST';
        if (normGroup.includes('CGST') || normGroup.includes('CENTRAL') || normGroup.includes('C GST')) return 'CGST';
        if (normGroup.includes('SGST') || normGroup.includes('STATE') || normGroup.includes('UTGST') || normGroup.includes('S GST')) return 'SGST';
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
    const ledgerBlockRegex = /<LEDGER([^>]*)>([\s\S]*?)<\/LEDGER>/gi;
    let match: RegExpExecArray | null;
    while ((match = ledgerBlockRegex.exec(ledgerResp)) !== null) {
      const ledgerName = extractLedgerNameFromBlock(match[1], match[2]);
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
      if (panMatch && ledgerName) {
        panMap.set(ledgerName.toUpperCase(), panMatch[1].replace(/\s+/g, '').trim());
      }

      let parentMatch = block.match(/<PARENT[^>]*>([^<]+)<\/PARENT>/i);
      if (parentMatch && ledgerName) {
        ledgerParentMap.set(ledgerName.toUpperCase(), unescapeXml(parentMatch[1]).replace(/\s+/g, ' ').trim().toUpperCase());
      }
    }

    console.log(`[TallyAPI] Regex GSTIN extraction: ${gstinMap.size} entries`);

    // ── Tax Map: Parse via Regex instead of DOMParser ──
    const taxMap = new Map<string, TaxLedgerInfo>();
    ledgerBlockRegex.lastIndex = 0;
    while ((match = ledgerBlockRegex.exec(ledgerResp)) !== null) {
      const ledgerName = extractLedgerNameFromBlock(match[1], match[2]);
      const normLedgerName = ledgerName.replace(/\s+/g, ' ').trim().toUpperCase();
      const block = match[0];

      const parentMatch = block.match(/<PARENT[^>]*>([^<]+)<\/PARENT>/i);
      const parent = parentMatch ? unescapeXml(parentMatch[1]).replace(/\s+/g, ' ').trim() : '';

      const customLedger = customTaxLedgers.find(cl => cl.name.replace(/\s+/g, ' ').trim().toUpperCase() === normLedgerName);

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

        const hasInputKeyword = hierarchy.some(g => g.includes('INPUT') || g.includes('IN PUT') || g === 'ITC' || g.includes('INWARD')) ||
          normLedgerName.includes('INPUT') ||
          normLedgerName.includes('IN PUT') ||
          normLedgerName.includes('ITC') ||
          normLedgerName.includes('INWARD');

        const hasOutputKeyword = hierarchy.some(g => g.includes('OUTPUT') || g.includes('OUTWARD')) ||
          normLedgerName.includes('OUTPUT') ||
          normLedgerName.includes('OUTWARD');

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

        taxCategory = getTaxCategory(normLedgerName, parent.toUpperCase());
      }

      if (isITC || isOutput || isRCM) {
        const gstin = gstinMap.get(ledgerName.toUpperCase()) || '';
        const info = {
          gstin,
          isOutput,
          isRCM,
          isITC,
          taxCategory,
        };
        taxMap.set(normLedgerName, info);
        taxMap.set(ledgerName.toUpperCase(), info);
        taxMap.set(ledgerName.trim().toUpperCase(), info);
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
  fixedAssetGroups.add('FIXED ASSETS');
  for (const [groupName, parentName] of meta.groupParentMap.entries()) {
    let current = groupName;
    const visited = new Set<string>();
    while (current && !visited.has(current)) {
      visited.add(current);
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
    const parentUpper = parentName.toUpperCase().trim();
    let isFA = parentUpper === 'FIXED ASSETS' || fixedAssetGroups.has(parentUpper);
    if (!isFA) {
      let current = parentUpper;
      const visited = new Set<string>();
      while (current && !visited.has(current)) {
        visited.add(current);
        if (current === 'FIXED ASSETS' || fixedAssetGroups.has(current)) {
          isFA = true;
          break;
        }
        current = (meta.groupParentMap.get(current) || '').toUpperCase().trim();
      }
    }
    if (isFA) {
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
        name: name,
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
  const resp = await sendTallyRequest(xml, config, 120000);
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
  let ledgerParentMap: Map<string, string> = new Map();
  let groupParentMap: Map<string, string> = new Map();
  try {
    const meta = await fetchTallyMetadata(config, customInputTaxGroups, customOutputTaxGroups, customTaxLedgers);
    gstinMap = meta.gstinMap;
    taxMap = meta.taxMap;
    ledgerParentMap = meta.ledgerParentMap;
    groupParentMap = meta.groupParentMap;
  } catch (err) {
    console.error("Failed to fetch Tally metadata:", err);
    gstinMap = new Map();
    taxMap = new Map();
  }

  const getLedgerHierarchy = (lName: string): string[] => {
    const path: string[] = [];
    let currentGroup = ledgerParentMap.get(lName.toUpperCase());
    const visited = new Set<string>();
    while (currentGroup && !visited.has(currentGroup)) {
      path.push(currentGroup.toUpperCase());
      visited.add(currentGroup.toUpperCase());
      currentGroup = groupParentMap.get(currentGroup.toUpperCase()) || '';
    }
    return path;
  };

  const isMainSalesOrPurchaseLedger = (lName: string, vType: string): boolean => {
    const lUpper = lName.toUpperCase().trim();
    const hierarchy = getLedgerHierarchy(lUpper);

    if (hierarchy.length > 0) {
      if (vType === 'Sales' || vType === 'Credit Note') {
        return hierarchy.some(g => g === 'SALES ACCOUNTS' || g === 'SALES ACCOUNT' || g === 'SALES');
      } else if (vType === 'Purchase' || vType === 'Debit Note') {
        return hierarchy.some(g => g === 'PURCHASE ACCOUNTS' || g === 'PURCHASE ACCOUNT' || g === 'PURCHASE');
      }
    }

    // Secondary fallback ONLY if group hierarchy is completely missing:
    const isExcl = lUpper.includes('FREIGHT') ||
      lUpper.includes('INSURANCE') ||
      lUpper.includes('PACKING') ||
      lUpper.includes('ROUND') ||
      lUpper.includes('TCS') ||
      lUpper.includes('TRANSPORT') ||
      lUpper.includes('DISCOUNT') ||
      lUpper.includes('EXPENSE') ||
      lUpper.includes('CHARGE') ||
      lUpper.includes('DUTY') ||
      lUpper.includes('TAX');

    if (isExcl) return false;

    if (vType === 'Sales' || vType === 'Credit Note') {
      return lUpper.includes('SALE') || lUpper.includes('SALES');
    } else if (vType === 'Purchase' || vType === 'Debit Note') {
      return lUpper.includes('PURCHASE') || lUpper.includes('BUY');
    }
    return true;
  };

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

      let partyAmount = 0;
      let nonTaxRevenueAmount = 0;

      for (const entry of entries) {
        const ledgerNameRaw = getTextContent(entry, 'LEDGERNAME');
        const ledgerName = ledgerNameRaw.replace(/\s+/g, ' ').toUpperCase().trim();
        const amountStr = getTextContent(entry, 'AMOUNT');
        const amount = safeNum(amountStr);
        const isDeemedPositiveStr = getTextContent(entry, 'ISDEEMEDPOSITIVE');
        const isDebit = isDeemedPositiveStr === 'Yes';

        let taxInfo = undefined;

        const customMapping = customTaxLedgers.find(l => l.name.replace(/\s+/g, ' ').trim().toUpperCase() === ledgerName);

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
          taxInfo = taxMap.get(ledgerName) || taxMap.get(ledgerNameRaw.toUpperCase().trim()) || taxMap.get(ledgerNameRaw.replace(/\s+/g, ' ').trim().toUpperCase());

          // Hard fallback: ONLY if it's NOT a Sales/Purchase/Service/Supply/Income/Expense ledger!
          if (
            !taxInfo &&
            ledgerName !== knownPartyName &&
            !ledgerName.includes('SALE') &&
            !ledgerName.includes('SALES') &&
            !ledgerName.includes('PURCHASE') &&
            !ledgerName.includes('SERVICE') &&
            !ledgerName.includes('SUPPLY') &&
            !ledgerName.includes('INCOME') &&
            !ledgerName.includes('EXPENSE') &&
            !ledgerName.includes('DISCOUNT') &&
            !ledgerName.includes('ROUND')
          ) {
            const isOut = voucherType === 'Sales' || ledgerName.includes('OUTPUT');
            const isIn = voucherType === 'Purchase' || voucherType === 'Journal' || voucherType === 'Debit Note' || voucherType === 'Credit Note' || ledgerName.includes('INPUT') || ledgerName.includes('IN PUT') || ledgerName.includes('ITC') || ledgerName.includes('INWARD');
            if (ledgerName.includes('IGST') || ledgerName.includes('INTEGRATED TAX') || ledgerName.includes('I GST')) {
              taxInfo = { gstin: '', isOutput: isOut, isRCM: false, isITC: !isOut, taxCategory: 'IGST' as const };
            } else if (ledgerName.includes('CGST') || ledgerName.includes('CENTRAL TAX') || ledgerName.includes('C GST')) {
              taxInfo = { gstin: '', isOutput: isOut, isRCM: false, isITC: !isOut, taxCategory: 'CGST' as const };
            } else if (ledgerName.includes('SGST') || ledgerName.includes('STATE TAX') || ledgerName.includes('UTGST') || ledgerName.includes('S GST')) {
              taxInfo = { gstin: '', isOutput: isOut, isRCM: false, isITC: !isOut, taxCategory: 'SGST' as const };
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
              effectiveAmount = amount;
              if (taxInfo.isITC) {
                anomalies.push(`Input Tax on Sales: ${category} ₹${amount.toFixed(2)}`);
              }
            }
          } else if (voucherType === 'Credit Note') {
            isValidTax = taxInfo.isITC || taxInfo.isOutput || taxInfo.isRCM;
            if (isValidTax) {
              if (taxInfo.isITC) {
                effectiveAmount = !isDebit ? -amount : amount;
              } else {
                effectiveAmount = isDebit ? -amount : amount;
              }
            }
          } else if (voucherType === 'Debit Note') {
            isValidTax = taxInfo.isITC || taxInfo.isOutput || taxInfo.isRCM;
            if (isValidTax) {
              if (taxInfo.isITC) {
                effectiveAmount = !isDebit ? -amount : amount;
                if (!isDebit) {
                  anomalies.push(`Input Tax Reversal on Debit Note: ${category} ₹${amount.toFixed(2)}`);
                }
              } else {
                effectiveAmount = !isDebit ? amount : -amount;
              }
            }
          } else if (voucherType === 'Journal' || voucherType === 'Payment') {
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

          // ── Party vs Sales/Purchase detection ──
          // PRIORITY 1: If the ledger name matches the known party name from the voucher header,
          // it is ALWAYS the party ledger — even if its group hierarchy includes Purchase/Sales Accounts.
          // This prevents doubling when party ledgers (e.g. Sundry Creditors) are under Purchase Accounts.
          const isExplicitPartyMatch = ledgerName === knownPartyName;

          // Check if ledger belongs to a party-type group (Sundry Creditors, Sundry Debtors, etc.)
          const ledgerGroupHierarchy = getLedgerHierarchy(ledgerName);
          const isUnderPartyGroup = ledgerGroupHierarchy.some(g =>
            g === 'SUNDRY CREDITORS' || g === 'SUNDRY DEBTORS' ||
            g === 'CURRENT LIABILITIES' || g === 'CURRENT ASSETS' ||
            g === 'LOANS & ADVANCES (ASSET)' || g === 'LOANS (LIABILITY)' ||
            g === 'BANK ACCOUNTS' || g === 'BANK OD A/C' || g === 'CASH-IN-HAND' ||
            g === 'SECURED LOANS' || g === 'UNSECURED LOANS'
          );

          const isSalesOrPurchase = isExplicitPartyMatch ? false :
            (isUnderPartyGroup ? false : isMainSalesOrPurchaseLedger(ledgerName, voucherType));

          const isPartyLedger = isExplicitPartyMatch || (!isSalesOrPurchase && (
            (voucherType === 'Sales' || voucherType === 'Credit Note') ? isDebit :
            (voucherType === 'Purchase' || voucherType === 'Debit Note') ? !isDebit :
            amount > maxAmount
          ));

          if (isPartyLedger && (isExplicitPartyMatch || amount >= partyAmount)) {
            partyAmount = amount;
            if (amount > maxAmount) {
              maxAmount = amount;
              fallbackPartyName = ledgerNameRaw;
            }
          } else if (isSalesOrPurchase) {
            // Only add to nonTaxRevenueAmount if it belongs to SALES ACCOUNTS or PURCHASE ACCOUNTS
            nonTaxRevenueAmount += amount;
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

      // For Payment vouchers, ONLY keep vouchers that actually contain GST tax!
      if (voucherType === 'Payment' && Math.abs(igst) < 0.01 && Math.abs(cgst) < 0.01 && Math.abs(sgst) < 0.01) {
        continue;
      }

      if (Math.abs(cgst - sgst) > 1.00 && (cgst > 0 || sgst > 0)) {
        anomalies.push(`CGST and SGST mismatch: CGST ₹${cgst.toFixed(2)}, SGST ₹${sgst.toFixed(2)}`);
      }

      let totalAmount = partyAmount > 0 ? partyAmount : (nonTaxRevenueAmount + totalGst);
      taxableValue = nonTaxRevenueAmount > 0 ? nonTaxRevenueAmount : Math.max(0, totalAmount - totalGst);

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
  isPayment?: boolean;
  paymentAmount?: number;
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

    const isBankOrTaxLedger = (name: string, h: string[]): boolean => {
      const u = name.toUpperCase().trim();
      if (u.includes('BANK') || u.includes('CASH') || u.includes('TDS') || u.includes('CGST') || u.includes('SGST') || u.includes('IGST') || u.includes('ROUND OFF')) return true;
      return h.some(g =>
        g.includes('BANK ACCOUNTS') || g.includes('BANK OCC') || g.includes('BANK OD') ||
        g.includes('CASH-IN-HAND') || g.includes('DUTIES & TAXES') || g.includes('DUTIES AND TAXES')
      );
    };

    const isPartyLedger = (name: string, h: string[]): boolean => {
      const nameUpper = name.toUpperCase().trim();
      if (isBankOrTaxLedger(nameUpper, h)) return false;
      if (panMap.has(nameUpper)) return true;
      const clean = nameUpper.replace(/\s*\([^)]*\)/g, '').trim();
      if (clean && panMap.has(clean)) return true;
      const alpha = nameUpper.replace(/[^A-Z0-9]/g, '');
      if (alpha && panMap.has(alpha)) return true;
      return h.some(g =>
        g.includes('SUNDRY CREDITORS') || g.includes('SUNDRY DEBTORS') ||
        g.includes('CREDITOR') || g.includes('DEBTOR') || g.includes('VENDOR') ||
        g.includes('SUPPLIER') || g.includes('PARTY') || g.includes('TRANSPORTER') ||
        g.includes('CONTRACT DRIVERS')
      );
    };

    // Pre-classify entries in this voucher
    interface EntryInfo {
      ledgerNameRaw: string;
      ledgerNameUpper: string;
      hierarchy: string[];
      amount: number;
      isDebit: boolean;
      isParty: boolean;
      isBankOrTax: boolean;
      isTds: boolean;
    }

    const processedEntries: EntryInfo[] = entries.map(entry => {
      const ledgerNameRaw = getTextContent(entry, 'LEDGERNAME');
      const ledgerNameUpper = ledgerNameRaw.toUpperCase().trim();
      const hierarchy = getHierarchy(ledgerNameRaw);
      const amountStr = getTextContent(entry, 'AMOUNT');
      const amount = safeNum(amountStr);
      const isDebit = getTextContent(entry, 'ISDEEMEDPOSITIVE') === 'Yes';
      const isBankOrTax = isBankOrTaxLedger(ledgerNameUpper, hierarchy);
      const isParty = isPartyLedger(ledgerNameUpper, hierarchy);
      const isTds = tdsLedgersSet.has(ledgerNameUpper) || ledgerNameUpper.includes('TDS') || ledgerNameUpper.includes('TAX DEDUCTED');

      return {
        ledgerNameRaw,
        ledgerNameUpper,
        hierarchy,
        amount,
        isDebit,
        isParty,
        isBankOrTax,
        isTds
      };
    });

    // 1. Identify Party ledgers in voucher (never treat a party ledger as an expense of another party)
    const partyLedgerEntries = processedEntries.filter(e => e.isParty && !e.isBankOrTax);

    // 2. Identify Non-Party Expense ledgers in voucher
    const expenseEntries = processedEntries.filter(e => !e.isParty && !e.isBankOrTax && !e.isTds && e.amount > 0);

    // 3. Identify TDS ledgers
    const tdsEntries = processedEntries.filter(e => e.isTds);
    let totalTdsAmount = 0;
    let mainTdsLedgerName = '';
    for (const t of tdsEntries) {
      if (!t.isDebit) {
        totalTdsAmount += t.amount;
        mainTdsLedgerName = t.ledgerNameRaw;
      } else {
        totalTdsAmount -= t.amount;
      }
    }

    // Determine target parties in voucher
    const targetPartiesMap = new Map<string, { name: string; pan: string; creditAmount: number; debitAmount: number }>();

    if (partyLedgerEntries.length > 0) {
      for (const p of partyLedgerEntries) {
        const key = p.ledgerNameUpper;
        if (!targetPartiesMap.has(key)) {
          const cleanName = key.replace(/\s*\([^)]*\)/g, '').trim();
          const alphaName = key.replace(/[^A-Z0-9]/g, '');
          const pan = panMap.get(key) || panMap.get(cleanName) || panMap.get(alphaName) || '';
          targetPartiesMap.set(key, { name: p.ledgerNameRaw, pan, creditAmount: 0, debitAmount: 0 });
        }
        const partyObj = targetPartiesMap.get(key)!;
        if (p.isDebit) {
          partyObj.debitAmount += p.amount;
        } else {
          partyObj.creditAmount += p.amount;
        }
      }
    } else {
      // Fallback if no party ledger recognized
      const rawXmlParty = (
        getTextContent(firstEntry, 'PARTYLEDGERNAME') ||
        getTextContent(firstEntry, 'PARTYNAME') ||
        getTextContent(firstEntry, 'BASICBUYERNAME')
      ).replace(/\s+/g, ' ').trim();

      if (rawXmlParty && !isBankOrTaxLedger(rawXmlParty, getHierarchy(rawXmlParty))) {
        const key = rawXmlParty.toUpperCase().trim();
        const cleanName = key.replace(/\s*\([^)]*\)/g, '').trim();
        const alphaName = key.replace(/[^A-Z0-9]/g, '');
        const pan = panMap.get(key) || panMap.get(cleanName) || panMap.get(alphaName) || '';
        targetPartiesMap.set(key, { name: rawXmlParty, pan, creditAmount: 0, debitAmount: 0 });
      }
    }

    const targetParties = Array.from(targetPartiesMap.values());
    if (targetParties.length === 0) continue;

    const totalPartyWeight = targetParties.reduce((sum, p) => sum + (p.creditAmount || p.debitAmount || 1), 0);

    const hasBankOrCash = processedEntries.some(e =>
      e.hierarchy.some(g => g.includes('BANK ACCOUNTS') || g.includes('BANK OCC') || g.includes('BANK OD') || g.includes('CASH-IN-HAND')) ||
      e.ledgerNameUpper.includes('BANK') || e.ledgerNameUpper.includes('CASH')
    );

    for (const party of targetParties) {
      const partyWeight = totalPartyWeight > 0 ? (party.creditAmount || party.debitAmount || 1) / totalPartyWeight : 1;

      // Scenario 1: Bank Payment / Disbursement
      if (hasBankOrCash && party.debitAmount > 0) {
        const allocatedPaymentTds = Math.round((totalTdsAmount * partyWeight) * 100) / 100;
        results.push({
          date,
          partyName: party.name,
          partyPan: party.pan,
          ledgerName: 'Payment / Disbursement',
          amount: 0,
          actualTdsDeducted: allocatedPaymentTds,
          tdsLedgerName: allocatedPaymentTds > 0 ? (mainTdsLedgerName || 'TDS') : '',
          isPayment: true,
          paymentAmount: party.debitAmount
        });
      }
      // Scenario 2: Invoice / Expense Voucher
      else if (expenseEntries.length > 0) {
        const totalVoucherExpense = expenseEntries.reduce((sum, e) => sum + e.amount, 0);

        for (const exp of expenseEntries) {
          const expAmountForParty = exp.amount * partyWeight;
          if (expAmountForParty === 0) continue;

          const allocatedTds = totalVoucherExpense > 0
            ? Math.round(((exp.amount / totalVoucherExpense) * (totalTdsAmount * partyWeight)) * 100) / 100
            : 0;

          results.push({
            date,
            partyName: party.name,
            partyPan: party.pan,
            ledgerName: exp.ledgerNameRaw,
            amount: exp.isDebit ? expAmountForParty : -expAmountForParty,
            actualTdsDeducted: allocatedTds,
            tdsLedgerName: allocatedTds > 0 ? (mainTdsLedgerName || 'TDS') : '',
            parentGroup: exp.hierarchy[0] || 'Expense',
            parentGroupPath: exp.hierarchy.join(', ')
          });
        }
      }
      // Scenario 3: Pure TDS Adjustment / Journal Voucher (No bank/cash, no expense lines)
      else if (totalTdsAmount > 0 || party.creditAmount > 0) {
        const partyCreditExp = party.creditAmount;
        const allocatedTds = Math.round((totalTdsAmount * partyWeight) * 100) / 100;

        results.push({
          date,
          partyName: party.name,
          partyPan: party.pan,
          ledgerName: mainTdsLedgerName || 'Vehicle Hire / Journal Entry',
          amount: partyCreditExp,
          actualTdsDeducted: allocatedTds,
          tdsLedgerName: allocatedTds > 0 ? (mainTdsLedgerName || 'TDS') : '',
          parentGroup: 'Direct Expenses',
          parentGroupPath: 'Direct Expenses'
        });
      }
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
  if (partyNames && partyNames.length > 0 && partyNames.length <= 250) {
    const escapedNames = partyNames.map(name => escapeXml(name.replace(/\s+/g, ' ').trim()));
    const conditions = escapedNames.map(name => `$Name = "${name}"`).join(' OR ');
    collectionXml = `
          <COLLECTION NAME="PartyBalances">
            <TYPE>Ledger</TYPE>
            <FILTER>IsTargetParty</FILTER>
            <FETCH>Name, Parent, OpeningBalance, ClosingBalance</FETCH>
          </COLLECTION>
          <SYSTEM TYPE="FORMULAS" NAME="IsTargetParty">${conditions}</SYSTEM>`;
  } else {
    // Fetch all ledgers without restricted TDL filter to ensure no ledger balance is missed regardless of parent group
    collectionXml = `
          <COLLECTION NAME="PartyBalances">
            <TYPE>Ledger</TYPE>
            <FETCH>Name, Parent, OpeningBalance, ClosingBalance</FETCH>
          </COLLECTION>`;
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
  const openingBalanceCrMap = new Map<string, number>();

  // Parse using regex for robustness
  const ledgerBlockRegex = /<LEDGER([^>]*)>([\s\S]*?)<\/LEDGER>/gi;
  let match: RegExpExecArray | null;
  while ((match = ledgerBlockRegex.exec(resp)) !== null) {
    const ledgerName = extractLedgerNameFromBlock(match[1], match[2]);
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
      
      const nameUpper = ledgerName.toUpperCase().trim();
      balanceMap.set(nameUpper, balance);

      // Store normalized keys to ensure matching even if party names have extra suffixes like (Vendor)
      const cleanName = nameUpper.replace(/\s*\([^)]*\)/g, '').trim();
      if (cleanName && !balanceMap.has(cleanName)) {
        balanceMap.set(cleanName, balance);
      }
      const alphaKey = nameUpper.replace(/[^A-Z0-9]/g, '');
      if (alphaKey && !balanceMap.has(alphaKey)) {
        balanceMap.set(alphaKey, balance);
      }
    }

    const opMatch = block.match(/<OPENINGBALANCE[^>]*>([^<]+)<\/OPENINGBALANCE>/i);
    if (ledgerName && opMatch) {
      const opStr = opMatch[1].replace(/[₹,\s]/g, '').replace(/Dr|Cr/gi, '').trim();
      let opBal = parseFloat(opStr);
      if (isNaN(opBal)) opBal = 0;
      const isOpCredit = opMatch[1].toUpperCase().includes('CR') || parseFloat(opStr) < 0;
      const nameUpper = ledgerName.toUpperCase().trim();
      const cleanName = nameUpper.replace(/\s*\([^)]*\)/g, '').trim();
      const alphaKey = nameUpper.replace(/[^A-Z0-9]/g, '');
      const opVal = isOpCredit ? Math.abs(opBal) : 0;

      openingBalanceCrMap.set(nameUpper, opVal);
      if (cleanName && !openingBalanceCrMap.has(cleanName)) openingBalanceCrMap.set(cleanName, opVal);
      if (alphaKey && !openingBalanceCrMap.has(alphaKey)) openingBalanceCrMap.set(alphaKey, opVal);
    }
  }

  (balanceMap as any).openingBalancesCr = openingBalanceCrMap;

  console.log(`[TallyAPI] Party balances fetched: ${balanceMap.size} entries (filtered by: ${partyNames ? partyNames.length : 'All Ledgers'})`);
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

    const meta = await fetchTallyMetadata(config);
    const fixedAssetGroups = new Set<string>();
    fixedAssetGroups.add('FIXED ASSETS');
    for (const [groupName, parentName] of meta.groupParentMap.entries()) {
      let current = groupName;
      const visited = new Set<string>();
      while (current && !visited.has(current)) {
        visited.add(current);
        if (current.toUpperCase().trim() === 'FIXED ASSETS') {
          fixedAssetGroups.add(groupName.toUpperCase().trim());
          break;
        }
        current = meta.groupParentMap.get(current) || '';
      }
    }

    ledgerNodes.forEach(node => {
      let name = getTextContent(node, 'NAME') || node.getAttribute('NAME') || '';
      name = unescapeXml(name).replace(/\s+/g, ' ').trim();
      if (!name) return;

      const parent = unescapeXml(getTextContent(node, 'PARENT')).replace(/\s+/g, ' ').trim();
      const parentUpper = parent.toUpperCase().trim();

      let isFA = parentUpper === 'FIXED ASSETS' || fixedAssetGroups.has(parentUpper);
      if (!isFA) {
        let current = parentUpper;
        const visited = new Set<string>();
        while (current && !visited.has(current)) {
          visited.add(current);
          if (current === 'FIXED ASSETS' || fixedAssetGroups.has(current)) {
            isFA = true;
            break;
          }
          current = (meta.groupParentMap.get(current) || '').toUpperCase().trim();
        }
      }

      if (!isFA) return;

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
  } catch (err) {
    console.error('[TallyAPI] Error fetching fixed assets:', err);
    return [];
  }
}

// ─── Direct Tally Finalisation Scrutiny API ─────────────────

export interface TallyFinalisationParty {
  partyName: string;
  parentGroup: string;
  openingBalance: number;
  closingBalance: number;
  vouchers: {
    date: string;
    voucherType: string;
    voucherNumber: string;
    amount: number;
    isDebit: boolean;
    counterpartyLedger: string;
    narration: string;
  }[];
}

export interface TallyFinalisationData {
  parties: Map<string, TallyFinalisationParty>;
  allVouchers: {
    guid: string;
    date: string;
    voucherType: string;
    voucherNumber: string;
    narration: string;
    entries: {
      ledgerName: string;
      amount: number;
      isDebit: boolean;
    }[];
  }[];
}

export async function fetchFinalisationDataFromTally(
  fromDate: string,
  toDate: string,
  config: TallyConnectionConfig = DEFAULT_CONFIG
): Promise<TallyFinalisationData> {
  const meta = await fetchTallyMetadata(config);

  // 1. Identify all Sundry Creditors & Sundry Debtors ledgers
  const targetGroups = new Set<string>();
  for (const [groupName, parentName] of meta.groupParentMap.entries()) {
    let current = groupName;
    while (current) {
      const cu = current.toUpperCase().trim();
      if (cu === 'SUNDRY CREDITORS' || cu === 'SUNDRY DEBTORS') {
        targetGroups.add(groupName.toUpperCase().trim());
        break;
      }
      current = meta.groupParentMap.get(current) || '';
    }
  }
  targetGroups.add('SUNDRY CREDITORS');
  targetGroups.add('SUNDRY DEBTORS');

  const partyGroupMap = new Map<string, string>(); // Party -> 'Sundry Creditors' | 'Sundry Debtors'
  for (const [ledgerName, parentName] of meta.ledgerParentMap.entries()) {
    let current = parentName;
    while (current) {
      const cu = current.toUpperCase().trim();
      if (cu === 'SUNDRY CREDITORS') {
        partyGroupMap.set(ledgerName.toUpperCase().trim(), 'Sundry Creditors');
        break;
      }
      if (cu === 'SUNDRY DEBTORS') {
        partyGroupMap.set(ledgerName.toUpperCase().trim(), 'Sundry Debtors');
        break;
      }
      current = meta.groupParentMap.get(current) || '';
    }
  }

  // 2. Fetch Opening & Closing Balances for these ledgers
  const ledgerXml = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>PartyScrutinyLedgers</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="PartyScrutinyLedgers">
            <TYPE>Ledger</TYPE>
            <FILTER>IsTargetPartyLedger</FILTER>
            <FETCH>Name, Parent, OpeningBalance, ClosingBalance</FETCH>
          </COLLECTION>
          <SYSTEM TYPE="FORMULAS" NAME="IsTargetPartyLedger">
            $$IsBelongsTo:$$GroupSundryCreditors OR $$IsBelongsTo:$$GroupSundryDebtors
          </SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;

  const partyMap = new Map<string, TallyFinalisationParty>();

  try {
    const ledgerResp = await sendTallyRequest(ledgerXml, config, 20000);
    const ledgerDoc = parseXml(ledgerResp);
    const ledgerNodes = getAllElements(ledgerDoc, 'LEDGER');

    for (const node of ledgerNodes) {
      let name = getTextContent(node, 'NAME') || node.getAttribute('NAME') || '';
      name = unescapeXml(name).replace(/\s+/g, ' ').trim();
      if (!name) continue;

      const nameUpper = name.toUpperCase();
      const parent = unescapeXml(getTextContent(node, 'PARENT')).trim();
      const groupType = partyGroupMap.get(nameUpper) || (parent.toUpperCase().includes('DEBTOR') ? 'Sundry Debtors' : 'Sundry Creditors');

      const opStr = getTextContent(node, 'OPENINGBALANCE').replace(/[₹,\s]/g, '').trim();
      let openingBalance = parseFloat(opStr);
      if (isNaN(openingBalance)) openingBalance = 0;
      if (getTextContent(node, 'OPENINGBALANCE').toUpperCase().includes('CR')) openingBalance = -Math.abs(openingBalance);
      else openingBalance = Math.abs(openingBalance);

      const clStr = getTextContent(node, 'CLOSINGBALANCE').replace(/[₹,\s]/g, '').trim();
      let closingBalance = parseFloat(clStr);
      if (isNaN(closingBalance)) closingBalance = 0;
      if (getTextContent(node, 'CLOSINGBALANCE').toUpperCase().includes('CR')) closingBalance = -Math.abs(closingBalance);
      else closingBalance = Math.abs(closingBalance);

      partyMap.set(nameUpper, {
        partyName: name,
        parentGroup: groupType,
        openingBalance,
        closingBalance,
        vouchers: []
      });
    }
  } catch (err) {
    console.error('[TallyAPI] Error fetching party ledger balances for finalisation scrutiny:', err);
  }

  // 3. Fetch Vouchers for the period
  const from = fromDate.replace(/-/g, '');
  const to = toDate.replace(/-/g, '');

  const vchXml = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>ScrutinyVouchers</ID>
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
          <COLLECTION NAME="MyScrutinyVch">
            <TYPE>Voucher</TYPE>
            <FILTER>IsScrutinyVch</FILTER>
          </COLLECTION>
          <SYSTEM TYPE="FORMULAS" NAME="IsScrutinyVch">
            NOT $IsCancelled AND NOT $IsOptional
          </SYSTEM>

          <COLLECTION NAME="ScrutinyVouchers">
            <SOURCECOLLECTION>MyScrutinyVch</SOURCECOLLECTION>
            <WALK>AllLedgerEntries</WALK>
            <COMPUTE>Guid : $..GUID</COMPUTE>
            <COMPUTE>VchDate : $..Date</COMPUTE>
            <COMPUTE>VchNumber : $..VoucherNumber</COMPUTE>
            <COMPUTE>VchType : $..VoucherTypeName</COMPUTE>
            <COMPUTE>Narration : $..Narration</COMPUTE>
            <COMPUTE>LedgerName : $LedgerName</COMPUTE>
            <COMPUTE>Amount : $Amount</COMPUTE>
            <COMPUTE>IsDeemedPositive : $IsDeemedPositive</COMPUTE>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;

  const allVouchers: TallyFinalisationData['allVouchers'] = [];

  try {
    const vchResp = await sendTallyRequest(vchXml, config, 60000);
    const vchDoc = parseXml(vchResp);
    const vchNodes = getAllElements(vchDoc, 'VOUCHER');

    const vchMap = new Map<string, { guid: string; date: string; voucherType: string; voucherNumber: string; narration: string; entries: { ledgerName: string; amount: number; isDebit: boolean }[] }>();

    vchNodes.forEach(node => {
      const guid = getTextContent(node, 'GUID') || getTextContent(node, 'VCHNUMBER');
      if (!guid) return;

      if (!vchMap.has(guid)) {
        vchMap.set(guid, {
          guid,
          date: tallyDateToISO(getTextContent(node, 'VCHDATE')),
          voucherType: getTextContent(node, 'VCHTYPE'),
          voucherNumber: getTextContent(node, 'VCHNUMBER'),
          narration: unescapeXml(getTextContent(node, 'NARRATION')),
          entries: []
        });
      }

      const vch = vchMap.get(guid)!;
      let ledgerName = unescapeXml(getTextContent(node, 'LEDGERNAME')).replace(/\s+/g, ' ').trim();
      const amtStr = getTextContent(node, 'AMOUNT').replace(/[₹,\s]/g, '').trim();
      let amount = parseFloat(amtStr);
      if (isNaN(amount)) amount = 0;
      const isDebit = getTextContent(node, 'ISDEEMEDPOSITIVE').toUpperCase() === 'YES' || amount < 0;

      if (ledgerName) {
        vch.entries.push({ ledgerName, amount: Math.abs(amount), isDebit });
      }
    });

    for (const [, vch] of vchMap.entries()) {
      allVouchers.push(vch);

      // Link voucher entries to parties
      vch.entries.forEach(entry => {
        const partyKey = entry.ledgerName.toUpperCase().trim();
        let party = partyMap.get(partyKey);

        if (!party && (partyGroupMap.has(partyKey) || entry.ledgerName.toLowerCase().includes('enterprise') || entry.ledgerName.toLowerCase().includes('trader') || entry.ledgerName.toLowerCase().includes('pvt ltd'))) {
          party = {
            partyName: entry.ledgerName,
            parentGroup: partyGroupMap.get(partyKey) || 'Sundry Creditors',
            openingBalance: 0,
            closingBalance: 0,
            vouchers: []
          };
          partyMap.set(partyKey, party);
        }

        if (party) {
          const counterparty = vch.entries.find(e => e.ledgerName.toUpperCase().trim() !== partyKey)?.ledgerName || 'General Account';
          party.vouchers.push({
            date: vch.date,
            voucherType: vch.voucherType,
            voucherNumber: vch.voucherNumber,
            amount: entry.amount,
            isDebit: entry.isDebit,
            counterpartyLedger: counterparty,
            narration: vch.narration
          });
        }
      });
    }
  } catch (err) {
    console.error('[TallyAPI] Error fetching vouchers for finalisation scrutiny:', err);
  }

  return { parties: partyMap, allVouchers };
}


// ─── Clause 44 (Form 3CD) ────────────────────────────────────

export interface Clause44Row {
  ledgerName: string;
  amount: number;
  primaryGroup?: string;
  subGroup1?: string;
  subGroup2?: string;
  /** Per-voucher breakdown for drill-down detail sheet */
  voucherBreakdown?: { voucherNumber: string; date: string; voucherType: string; amount: number; taxLedgersFound: string[] }[];
}

export interface Clause44ManualReview {
  voucherNumber: string;
  date: string;
  voucherType: string;
  expenseLedgers: { name: string; amount: number }[];
  taxLedgersFound: string[];
  reason: string;
}

export interface Clause44Result {
  /** Table A: Expenses where GST-tagged tax ledger found in same voucher */
  gstApplicable: Clause44Row[];
  /** Table B: Expenses where no tax ledger was found in voucher */
  nonGst: Clause44Row[];
  /** Table C: Composite vouchers that require human review */
  manualReview: Clause44ManualReview[];
  companyName: string;
}

/**
 * fetchClause44Data — Form 3CD, Clause 44 bifurcation engine.
 *
 * Queries TallyPrime for all vouchers in the date range, then:
 * 1. Builds a recursive ledger-hierarchy to identify ALL ledgers under
 *    "Direct Expenses", "Indirect Expenses", and "Purchase Accounts".
 * 2. For each voucher, reads ALLLEDGERENTRIES.LIST to get exact ledger names.
 * 3. Checks the user's custom tax-ledger list (strict trimmed match) against
 *    every entry in the same voucher.
 * 4. Bifurcates into GST-applicable, Non-GST, and Manual Review buckets.
 */
export async function fetchClause44Data(
  fromDate: string,
  toDate: string,
  taxLedgersRaw: string,    // comma-separated list of "Duties & Taxes" ledger names
  config: TallyConnectionConfig = DEFAULT_CONFIG
): Promise<Clause44Result> {
  // ── FIX 1: Bulletproof date → YYYYMMDD converter ─────────────────────────
  const toTallyDate = (d: string): string => {
    const s = d.replace(/[^0-9\/\-]/g, '').trim();
    if (/^\d{8}$/.test(s)) return s;
    if (/^\d{4}[\-\/]\d{2}[\-\/]\d{2}$/.test(s)) return s.replace(/[\-\/]/g, '');
    if (/^\d{2}[\-\/]\d{2}[\-\/]\d{4}$/.test(s)) {
      const p = s.split(/[\-\/]/);
      return `${p[2]}${p[1]}${p[0]}`;
    }
    return s.replace(/[\-\/]/g, '');
  };

  // ── FIX 2: Parse & normalise tax-ledger template with strict trimming ─────
  const userTaxLedgers = new Set<string>(
    taxLedgersRaw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
  );

  const cleanName = (str: string): string =>
    unescapeXml(str)
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();


  // ── 2. Fetch all ledger master with parent groups ─────────────
  const ledgerMasterXml = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>Clause44LedgerMaster</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="Clause44LedgerMaster">
            <TYPE>Ledger</TYPE>
            <FETCH>Name, Parent</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;

  // ── Step B: Fetch group hierarchy and ledger master in parallel ───────────
  const groupsXml = buildGroupsXml();

  let companyInfo: TallyCompanyInfo = { name: 'Unknown', address: '', gstin: '', state: '', financialYear: '' };
  try { companyInfo = await fetchCompanyInfo(config); } catch { /* non-fatal */ }

  const [groupResp, ledgerResp] = await Promise.all([
    sendTallyRequest(groupsXml, config, 15000),
    sendTallyRequest(ledgerMasterXml, config, 30000),
  ]);

  console.log('[Clause44] RAW TALLY RESPONSE (Groups, first 400 chars):', groupResp.substring(0, 400));
  console.log('[Clause44] RAW TALLY RESPONSE (Ledgers, first 400 chars):', ledgerResp.substring(0, 400));

  // ── Step C: Build group → parent map via parseXml (FIX 3) ────────────────
  const groupParentMap = new Map<string, string>();
  try {
    const groupDoc = parseXml(groupResp);
    const groupNodes = getAllElements(groupDoc, 'GROUP');
    for (const node of groupNodes) {
      const name = cleanName(node.getAttribute('NAME') || getTextContent(node, 'NAME') || '');
      const parent = cleanName(getTextContent(node, 'PARENT'));
      if (name) groupParentMap.set(name, parent);
    }
  } catch {
    const groupBlockRegex = /<GROUP([^>]*)>([\s\S]*?)<\/GROUP>/g;
    let gMatch: RegExpExecArray | null;
    while ((gMatch = groupBlockRegex.exec(groupResp)) !== null) {
      const block = gMatch[1] + gMatch[2];
      let rawName = '';
      const nameAttrMatch = gMatch[0].match(/<GROUP\s+NAME="([^"]*)"/i);
      if (nameAttrMatch) rawName = nameAttrMatch[1];
      else { const nt = block.match(/<NAME\b[^>]*>([^<]+)<\/NAME>/i); if (nt) rawName = nt[1]; }
      const name = cleanName(rawName);
      const pm = block.match(/<PARENT[^>]*>([^<]+)<\/PARENT>/i);
      const parent = pm ? cleanName(pm[1]) : '';
      if (name) groupParentMap.set(name, parent);
    }
  }

  console.log('[Clause44] Groups loaded:', groupParentMap.size);

  // Helper: walk parent chain to see if a group is under a target root
  const isUnder = (groupName: string, target: string): boolean => {
    let current = cleanName(groupName);
    const targetClean = cleanName(target);
    const visited = new Set<string>();
    while (current && !visited.has(current)) {
      if (current === targetClean) return true;
      visited.add(current);
      current = groupParentMap.get(current) || '';
    }
    return false;
  };

  // ── Step D: Collect all expense groups recursively ────────────────────────
  const EXPENSE_ROOTS = new Set(['DIRECT EXPENSES', 'INDIRECT EXPENSES', 'PURCHASE ACCOUNTS', 'FIXED ASSETS']);
  const expenseGroups = new Set<string>(EXPENSE_ROOTS);
  for (const [grp] of groupParentMap.entries()) {
    for (const root of EXPENSE_ROOTS) {
      if (isUnder(grp, root)) { expenseGroups.add(grp); break; }
    }
  }
  console.log('[Clause44] Expense groups (total incl sub-groups):', expenseGroups.size);

  // ── Step E: Build expense ledger set via parseXml (FIX 3) ────────────────
  const expenseLedgerSet = new Set<string>();
  const ledgerParentMap = new Map<string, string>();
  try {
    const ledgerDoc = parseXml(ledgerResp);
    const ledgerNodes = getAllElements(ledgerDoc, 'LEDGER');
    for (const node of ledgerNodes) {
      const name = cleanName(node.getAttribute('NAME') || getTextContent(node, 'NAME') || '');
      const parent = cleanName(getTextContent(node, 'PARENT'));
      if (name && (expenseGroups.has(parent) || isUnder(parent, 'DIRECT EXPENSES') || isUnder(parent, 'INDIRECT EXPENSES') || isUnder(parent, 'PURCHASE ACCOUNTS') || isUnder(parent, 'FIXED ASSETS'))) {
        expenseLedgerSet.add(name);
        ledgerParentMap.set(name, parent);
      }
    }
  } catch {
    const ledgerBlockRegex = /<LEDGER([^>]*)>([\s\S]*?)<\/LEDGER>/gi;
    let lMatch: RegExpExecArray | null;
    while ((lMatch = ledgerBlockRegex.exec(ledgerResp)) !== null) {
      const ledgerName = extractLedgerNameFromBlock(lMatch[1], lMatch[2]);
      const pm = lMatch[2].match(/<PARENT[^>]*>([^<]+)<\/PARENT>/i);
      if (ledgerName && pm) {
        const n = cleanName(ledgerName);
        const p = cleanName(pm[1]);
        if (expenseGroups.has(p) || isUnder(p, 'DIRECT EXPENSES') || isUnder(p, 'INDIRECT EXPENSES') || isUnder(p, 'PURCHASE ACCOUNTS') || isUnder(p, 'FIXED ASSETS')) {
          expenseLedgerSet.add(n);
          ledgerParentMap.set(n, p);
        }
      }
    }
  }
  console.log('[Clause44] Expense ledgers identified:', expenseLedgerSet.size, '— first 10:', [...expenseLedgerSet].slice(0, 10));

  // ── Step F: Fetch all voucher line-items via WALK on AllLedgerEntries ──────
  // FIX 4: Use YYYYMMDD date (via toTallyDate), correct collection ID,
  //         remove VchGuid COMPUTE (unreliable in WALK), use VoucherNumber as key.
  const from = toTallyDate(fromDate);
  const to   = toTallyDate(toDate);

  console.log('[Clause44] Date range sent to Tally:', from, '->', to);
  console.log('[Clause44] Tax ledgers to match:', [...userTaxLedgers]);

  const voucherXml = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>Clause44LedgerEntries</ID>
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
          <COLLECTION NAME="Clause44Vouchers">
            <TYPE>Voucher</TYPE>
            <FILTER>IsClause44Vch</FILTER>
          </COLLECTION>
          <SYSTEM TYPE="FORMULAS" NAME="IsClause44Vch">NOT $IsCancelled AND NOT $IsOptional</SYSTEM>

          <COLLECTION NAME="Clause44LedgerEntries">
            <SOURCECOLLECTION>Clause44Vouchers</SOURCECOLLECTION>
            <WALK>AllLedgerEntries</WALK>
            <COMPUTE>VchGuid    : $..GUID</COMPUTE>
            <COMPUTE>VchDate    : $..Date</COMPUTE>
            <COMPUTE>VchNumber  : $..VoucherNumber</COMPUTE>
            <COMPUTE>VchType    : $..VoucherTypeName</COMPUTE>
            <COMPUTE>LedgerName : $LedgerName</COMPUTE>
            <COMPUTE>Amount     : $Amount</COMPUTE>
            <COMPUTE>IsDeemedPositive : $IsDeemedPositive</COMPUTE>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;

  console.log('[Clause44] SENDING XML TO TALLY:', voucherXml);

  const voucherResp = await sendTallyRequest(voucherXml, config, 90000);

  console.log('[Clause44] RAW TALLY RESPONSE (Vouchers, first 1000 chars):', voucherResp.substring(0, 1000));

  // ── Step G: Parse LEDGERENTRY nodes ──────────────────────────────────────
  type VchEntry = { ledgerName: string; amount: number; isDebit: boolean };
  type VchRecord = {
    key: string;
    date: string;
    voucherNumber: string;
    voucherType: string;
    entries: VchEntry[];
  };

  const voucherMap = new Map<string, VchRecord>();

  const vchDoc = parseXml(voucherResp);
  // FIX: Tally WALK returns <LEDGERENTRY> elements
  const entryNodes = getAllElements(vchDoc, 'LEDGERENTRY');

  console.log('[Clause44] LEDGERENTRY nodes found in response:', entryNodes.length);

  for (const node of entryNodes) {
    const vchGuid    = getTextContent(node, 'VCHGUID').trim();
    const vchNumber  = getTextContent(node, 'VCHNUMBER').trim();
    const vchDate    = tallyDateToISO(getTextContent(node, 'VCHDATE'));
    const vchType    = getTextContent(node, 'VCHTYPE').trim();
    const ledgerName = unescapeXml(getTextContent(node, 'LEDGERNAME')).replace(/\s+/g, ' ').trim().toUpperCase();
    const amtStr     = getTextContent(node, 'AMOUNT').replace(/[₹,\s]/g, '').trim();
    const amount     = Math.abs(parseFloat(amtStr) || 0);
    // FIX 5: Exact same isDebit logic
    const isDebit    = getTextContent(node, 'ISDEEMEDPOSITIVE').toUpperCase() === 'YES' || parseFloat(amtStr) < 0;

    if (!ledgerName || amount === 0) continue;

    // Group by GUID (or fallback to VoucherNumber+Date if GUID is somehow missing)
    const key = vchGuid || `${vchNumber}||${vchDate}`;
    if (!voucherMap.has(key)) {
      voucherMap.set(key, { key, date: vchDate, voucherNumber: vchNumber, voucherType: vchType, entries: [] });
    }
    voucherMap.get(key)!.entries.push({ ledgerName, amount, isDebit });
  }

  console.log('[Clause44] Distinct vouchers assembled:', voucherMap.size);

  // ── Step H: Bifurcate into Table A, B, C ─────────────────────────────────
  const gstMap    = new Map<string, number>();
  const nonGstMap = new Map<string, number>();
  const manualReview: Clause44ManualReview[] = [];
  // Per-voucher detail for each ledger
  const gstVoucherMap    = new Map<string, { voucherNumber: string; date: string; voucherType: string; amount: number; taxLedgersFound: string[] }[]>();
  const nonGstVoucherMap = new Map<string, { voucherNumber: string; date: string; voucherType: string; amount: number; taxLedgersFound: string[] }[]>();

  let vouchersWithExpenses = 0;

  for (const [, vch] of voucherMap.entries()) {
    // Include both DR and CR entries so credits are correctly subtracted
    const expenseEntries = vch.entries.filter(e => 
      expenseLedgerSet.has(e.ledgerName) && 
      e.amount > 0 &&
      !e.ledgerName.includes('ROUND OFF') &&
      !e.ledgerName.includes('ROUNDING')
    );
    if (expenseEntries.length === 0) continue;
    vouchersWithExpenses++;

    const foundTaxLedgers = vch.entries
      .filter(e => userTaxLedgers.has(e.ledgerName))
      .map(e => e.ledgerName);

    const hasTax = foundTaxLedgers.length > 0;

    const uniqueLedgers = Array.from(new Set(expenseEntries.map(e => e.ledgerName)));

    if (!hasTax) {
      for (const entry of expenseEntries) {
        const netAmt = entry.isDebit ? entry.amount : -entry.amount;
        nonGstMap.set(entry.ledgerName, (nonGstMap.get(entry.ledgerName) || 0) + netAmt);
        if (!nonGstVoucherMap.has(entry.ledgerName)) nonGstVoucherMap.set(entry.ledgerName, []);
        nonGstVoucherMap.get(entry.ledgerName)!.push({
          voucherNumber: vch.voucherNumber,
          date: vch.date,
          voucherType: vch.voucherType,
          amount: netAmt,
          taxLedgersFound: [],
        });
      }
    } else {
      // GST-Applicable (both single and composite)
      for (const entry of expenseEntries) {
        const netAmt = entry.isDebit ? entry.amount : -entry.amount;
        gstMap.set(entry.ledgerName, (gstMap.get(entry.ledgerName) || 0) + netAmt);
        if (!gstVoucherMap.has(entry.ledgerName)) gstVoucherMap.set(entry.ledgerName, []);
        gstVoucherMap.get(entry.ledgerName)!.push({
          voucherNumber: vch.voucherNumber,
          date: vch.date,
          voucherType: vch.voucherType,
          amount: netAmt,
          taxLedgersFound: foundTaxLedgers,
        });
      }

      if (uniqueLedgers.length > 1) {
        manualReview.push({
          voucherNumber: vch.voucherNumber,
          date: vch.date,
          voucherType: vch.voucherType,
          expenseLedgers: expenseEntries.map(e => ({ name: e.ledgerName, amount: e.isDebit ? e.amount : -e.amount })),
          taxLedgersFound: foundTaxLedgers,
          reason: `Composite voucher: ${uniqueLedgers.length} unique expense ledgers. All expense lines have been automatically aggregated into Table A, but are listed here for audit reference.`,
        });
      }
    }
  }

  const getGroupLevels = (groupName: string): { primary: string; sub1: string; sub2: string } => {
    let current = cleanName(groupName);
    const path: string[] = [];
    const visited = new Set<string>();
    while (current && !visited.has(current)) {
      if (current && current !== 'PRIMARY') {
        path.unshift(current);
      }
      visited.add(current);
      current = groupParentMap.get(current) || '';
    }
    return {
      primary: path[0] || '',
      sub1: path[1] || '',
      sub2: path.length > 2 ? path[path.length - 1] : ''
    };
  };

  const toRows = (m: Map<string, number>, vMap: Map<string, { voucherNumber: string; date: string; voucherType: string; amount: number; taxLedgersFound: string[] }[]>): Clause44Row[] =>
    Array.from(m.entries())
      .map(([ledgerName, amount]) => {
        const parent = ledgerParentMap.get(ledgerName) || '';
        const lvls = parent ? getGroupLevels(parent) : { primary: '', sub1: '', sub2: '' };
        return {
          ledgerName,
          amount,
          primaryGroup: lvls.primary,
          subGroup1: lvls.sub1,
          subGroup2: lvls.sub2,
          voucherBreakdown: (vMap.get(ledgerName) || []).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
        };
      })
      .sort((a, b) => b.amount - a.amount);

  return {
    gstApplicable: toRows(gstMap, gstVoucherMap),
    nonGst: toRows(nonGstMap, nonGstVoucherMap),
    manualReview: manualReview.sort((a, b) => b.expenseLedgers.reduce((s, e) => s + e.amount, 0) - a.expenseLedgers.reduce((s, e) => s + e.amount, 0)),
    companyName: companyInfo.name,
  };
}
