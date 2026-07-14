/**
 * GST Pipeline Interface
 * 
 * Manages missing and duplicate GSTIN issues across PR (books) and 2B (GSTR-2B) data.
 * Provides refined interface for editing and applying GSTIN corrections.
 */

import { ReconciliationResult } from './reconciliation';

export interface GSTIssue {
  id: string;
  gstin: string;
  partyName: string;
  source: 'PR' | '2B' | 'BOTH';
  issueType: 'MISSING' | 'DUPLICATE' | 'MISMATCH';
  prNames: string[];
  twoBNames: string[];
  prCount: number;
  twoBCount: number;
  totalInvoices: number;
  suggestedGstin?: string;
  suggestedName?: string;
  resolved: boolean;
  resolutionNotes?: string;
}

export interface GSTIssueResolution {
  issueId: string;
  action: 'APPLY_FROM_2B' | 'APPLY_FROM_PR' | 'MANUAL_EDIT' | 'MARK_DUPLICATE';
  oldGstin: string;
  newGstin: string;
  affectedRecords: number;
  timestamp: Date;
}

/**
 * Analyzes reconciliation results to identify GSTIN issues
 * Returns parties with missing, duplicate, or mismatched GSTINs
 */
export function analyzeGSTIssues(results: ReconciliationResult[]): GSTIssue[] {
  const issues = new Map<string, GSTIssue>();
  const gstinMap = new Map<string, { prNames: Set<string>; twoBNames: Set<string>; prCount: number; twoBCount: number; totalInvoices: number; }>();
  const missingGstins = new Set<string>();

  for (const r of results) {
    const prGstin = r.prRecord?.gstin?.toUpperCase().trim();
    const twoBGstin = r.twoBRecord?.gstin?.toUpperCase().trim();
    const prName = r.prRecord?.supplierName || '';
    const twoBName = r.twoBRecord?.supplierName || '';

    // Track PR GSTIN
    if (prGstin) {
      if (!gstinMap.has(prGstin)) {
        gstinMap.set(prGstin, { prNames: new Set(), twoBNames: new Set(), prCount: 0, twoBCount: 0, totalInvoices: 0 });
      }
      const info = gstinMap.get(prGstin)!;
      if (prName) info.prNames.add(prName);
      info.prCount++;
      info.totalInvoices++;
    } else if (r.prRecord) {
      // Missing GSTIN in PR
      missingGstins.add(`PR::${prName || 'UNKNOWN'}`);
    }

    // Track 2B GSTIN
    if (twoBGstin) {
      if (!gstinMap.has(twoBGstin)) {
        gstinMap.set(twoBGstin, { prNames: new Set(), twoBNames: new Set(), prCount: 0, twoBCount: 0, totalInvoices: 0 });
      }
      const info = gstinMap.get(twoBGstin)!;
      if (twoBName) info.twoBNames.add(twoBName);
      info.twoBCount++;
      info.totalInvoices++;
    } else if (r.twoBRecord) {
      // Missing GSTIN in 2B
      missingGstins.add(`2B::${twoBName || 'UNKNOWN'}`);
    }
  }

  // Detect duplicate GSTINs (same GSTIN, multiple party names)
  for (const [gstin, info] of gstinMap.entries()) {
    const prNameCount = info.prNames.size;
    const twoBNameCount = info.twoBNames.size;
    const isDuplicate = prNameCount > 1; // Strictly multiple parties in books
    const isMismatch = prNameCount > 0 && twoBNameCount > 0 && !setEquals(info.prNames, info.twoBNames);

    if (isDuplicate || isMismatch) {
      const issue: GSTIssue = {
        id: `GSTIN::${gstin}`,
        gstin,
        partyName: Array.from(new Set([...Array.from(info.prNames), ...Array.from(info.twoBNames)]))[0] || 'UNKNOWN',
        source: info.prCount > 0 && info.twoBCount > 0 ? 'BOTH' : (info.prCount > 0 ? 'PR' : '2B'),
        issueType: isDuplicate ? 'DUPLICATE' : 'MISMATCH',
        prNames: Array.from(info.prNames),
        twoBNames: Array.from(info.twoBNames),
        prCount: info.prCount,
        twoBCount: info.twoBCount,
        totalInvoices: info.totalInvoices,
        resolved: false,
      };
      issues.set(issue.id, issue);
    }
  }

  // Add missing GSTIN issues
  for (const key of missingGstins) {
    const [source, name] = key.split('::');
    const id = `MISSING::${source}::${name}`;
    if (!issues.has(id)) {
      issues.set(id, {
        id,
        gstin: '',
        partyName: name,
        source: source as 'PR' | '2B',
        issueType: 'MISSING',
        prNames: source === 'PR' ? [name] : [],
        twoBNames: source === '2B' ? [name] : [],
        prCount: source === 'PR' ? 1 : 0,
        twoBCount: source === '2B' ? 1 : 0,
        totalInvoices: 1,
        resolved: false,
      });
    }
  }

  return Array.from(issues.values());
}

/**
 * Builds a consolidated party list with GSTIN status for the pipeline interface
 */
export interface PipelineParty {
  id: string;
  partyName: string;
  prPartyName?: string;
  twoBPartyName?: string;
  prGstin: string;
  twoBGstin: string;
  gstinStatus: 'MATCHED' | 'MISSING_PR' | 'MISSING_2B' | 'DUPLICATE' | 'MISMATCH';
  prInvoiceCount: number;
  twoBInvoiceCount: number;
  suggestedAction: string;
}

export function buildPipelineParties(results: ReconciliationResult[]): PipelineParty[] {
  const partyMap = new Map<string, PipelineParty>();

  for (const r of results) {
    const prGstin = r.prRecord?.gstin?.toUpperCase().trim() || '';
    const twoBGstin = r.twoBRecord?.gstin?.toUpperCase().trim() || '';
    const prName = r.prRecord?.supplierName || '';
    const twoBName = r.twoBRecord?.supplierName || '';

    // Create unique key
    const key = prGstin || twoBGstin || `${prName}::${twoBName}`;

    if (!partyMap.has(key)) {
      let gstinStatus: 'MATCHED' | 'MISSING_PR' | 'MISSING_2B' | 'DUPLICATE' | 'MISMATCH' = 'MATCHED';
      let suggestedAction = '';

      if (!prGstin && twoBGstin) {
        gstinStatus = 'MISSING_PR';
        suggestedAction = `Apply GSTIN from 2B: ${twoBGstin}`;
      } else if (prGstin && !twoBGstin) {
        gstinStatus = 'MISSING_2B';
        suggestedAction = `GSTIN in books but missing in 2B: ${prGstin}`;
      } else if (prGstin && twoBGstin && prGstin !== twoBGstin) {
        gstinStatus = 'MISMATCH';
        suggestedAction = `GSTIN mismatch: PR=${prGstin} vs 2B=${twoBGstin}`;
      }

      partyMap.set(key, {
        id: key,
        partyName: prName || twoBName || 'UNKNOWN',
        prPartyName: prName || undefined,
        twoBPartyName: twoBName || undefined,
        prGstin,
        twoBGstin,
        gstinStatus,
        prInvoiceCount: 0,
        twoBInvoiceCount: 0,
        suggestedAction,
      });
    }

    const party = partyMap.get(key)!;
    if (r.prRecord) party.prInvoiceCount++;
    if (r.twoBRecord) party.twoBInvoiceCount++;
  }

  return Array.from(partyMap.values());
}

/**
 * Creates a refined, user-friendly GSTIN correction interface
 */
export interface GSTNCorrectionUI {
  section: string;
  title: string;
  description: string;
  actions: CorrectionAction[];
}

export interface CorrectionAction {
  id: string;
  partyName: string;
  currentGstin: string;
  suggestedGstin: string;
  source: string;
  actionType: 'ACCEPT' | 'MANUAL_EDIT' | 'SKIP';
  confidence: number; // 0-100
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

/**
 * Generates correction recommendations with confidence scores
 */
export function generateCorrectionRecommendations(issues: GSTIssue[]): GSTNCorrectionUI[] {
  const sections: GSTNCorrectionUI[] = [];

  // Section 1: Missing GSTINs - Can be filled from 2B
  const missingInPR = issues.filter(i => i.issueType === 'MISSING' && i.source === '2B');
  if (missingInPR.length > 0) {
    sections.push({
      section: 'MISSING_IN_PR',
      title: 'Missing GSTINs in Books - Auto-Apply from 2B',
      description: `${missingInPR.length} parties have GSTIN in 2B but missing in books. Recommended: Apply automatically.`,
      actions: missingInPR.map(issue => ({
        id: issue.id,
        partyName: issue.partyName,
        currentGstin: '',
        suggestedGstin: issue.suggestedGstin || issue.twoBNames[0] || 'UNKNOWN',
        source: '2B (GSTR-2B)',
        actionType: 'ACCEPT' as const,
        confidence: 95,
        riskLevel: 'LOW' as const,
      })),
    });
  }

  // Section 2: Duplicate GSTINs - Need manual review
  const duplicates = issues.filter(i => i.issueType === 'DUPLICATE');
  if (duplicates.length > 0) {
    sections.push({
      section: 'DUPLICATE_GSTINS',
      title: 'Duplicate GSTINs - Same GSTIN, Multiple Party Names',
      description: `${duplicates.length} GSTINs are used by multiple parties. These need manual review to ensure data accuracy.`,
      actions: duplicates.map(issue => ({
        id: issue.id,
        partyName: `${issue.prNames.join(' | ')} <-> ${issue.twoBNames.join(' | ')}`,
        currentGstin: issue.gstin,
        suggestedGstin: '', // Requires manual resolution
        source: 'Manual Review Required',
        actionType: 'MANUAL_EDIT' as const,
        confidence: 30,
        riskLevel: 'HIGH' as const,
      })),
    });
  }

  // Section 3: GSTIN Mismatches - Check if valid PAN match
  const mismatches = issues.filter(i => i.issueType === 'MISMATCH');
  if (mismatches.length > 0) {
    sections.push({
      section: 'GSTIN_MISMATCHES',
      title: 'GSTIN Mismatches - Books vs 2B',
      description: `${mismatches.length} parties have different GSTINs in books vs 2B. Review if they're cross-state or require correction.`,
      actions: mismatches.map(issue => ({
        id: issue.id,
        partyName: issue.partyName,
        currentGstin: issue.prNames.length > 0 ? issue.gstin : (issue.twoBNames[0] || 'UNKNOWN'),
        suggestedGstin: issue.twoBNames.length > 0 ? issue.gstin : (issue.prNames[0] || 'UNKNOWN'),
        source: 'Books vs 2B Mismatch',
        actionType: 'MANUAL_EDIT' as const,
        confidence: 50,
        riskLevel: 'MEDIUM' as const,
      })),
    });
  }

  return sections;
}

// ============================================================================
// Helper Functions
// ============================================================================

function setEquals(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

/**
 * Simulates applying a GSTIN correction to reconciliation results
 */
export function applyGSTINCorrection(
  results: ReconciliationResult[],
  gstinCorrections: Map<string, string> // oldGstin -> newGstin
): ReconciliationResult[] {
  return results.map(r => {
    const prGstin = r.prRecord?.gstin;
    const twoBGstin = r.twoBRecord?.gstin;
    const correctedResult = { ...r };

    if (prGstin && gstinCorrections.has(prGstin)) {
      if (correctedResult.prRecord) {
        correctedResult.prRecord = { ...correctedResult.prRecord };
        correctedResult.prRecord.gstin = gstinCorrections.get(prGstin)!;
      }
    }

    if (twoBGstin && gstinCorrections.has(twoBGstin)) {
      if (correctedResult.twoBRecord) {
        correctedResult.twoBRecord = { ...correctedResult.twoBRecord };
        correctedResult.twoBRecord.gstin = gstinCorrections.get(twoBGstin)!;
      }
    }

    return correctedResult;
  });
}

/**
 * Exports GSTIN issues in a simple format for spreadsheet display
 */
export function exportGSTIssuesForSpreadsheet(issues: GSTIssue[]) {
  const headers = [
    'GSTIN', 'Party Name', 'Issue Type', 'Source', 
    'PR Count', '2B Count', 'PR Names', '2B Names', 'Suggested Action'
  ];

  const rows = issues.map(issue => [
    issue.gstin || '(Missing)',
    issue.partyName,
    issue.issueType,
    issue.source,
    issue.prCount,
    issue.twoBCount,
    issue.prNames.join('; '),
    issue.twoBNames.join('; '),
    issue.issueType === 'MISSING' ? `Use: ${issue.suggestedGstin}` :
    issue.issueType === 'DUPLICATE' ? 'Review & Consolidate' :
    'Review & Correct'
  ]);

  return { headers, rows };
}
