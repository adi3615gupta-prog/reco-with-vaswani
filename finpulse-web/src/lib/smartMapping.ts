import type { MasterGroupCode } from './finStatements.types';

// Returns a set of character bigrams for a given string
function getBigrams(str: string): Set<string> {
  const s = str.toLowerCase().replace(/[^a-z0-9]/g, '');
  const bigrams = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) {
    bigrams.add(s.substring(i, i + 2));
  }
  return bigrams;
}

// Sorensen-Dice coefficient
function calculateSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  const s1 = str1.toLowerCase().replace(/[^a-z0-9]/g, '');
  const s2 = str2.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (s1 === s2) return 1.0;
  if (s1.length < 2 || s2.length < 2) return 0;
  
  const b1 = getBigrams(str1);
  const b2 = getBigrams(str2);
  
  let intersection = 0;
  for (const bg of b1) {
    if (b2.has(bg)) intersection++;
  }
  
  return (2.0 * intersection) / (b1.size + b2.size);
}

export interface SmartSuggestion {
  group_code: number;
  confidence: number; // 0.0 to 1.0
}

const COMMON_KEYWORDS: Record<string, number> = {
  'bank': 1122,
  'cash': 1121,
  'gst': 2041,
  'igst': 2041,
  'cgst': 2041,
  'sgst': 2041,
  'tds': 2041,
  'tax': 2041,
  'salary': 4061,
  'wages': 4021,
  'discount': 4061,
  'depreciation': 4041,
  'interest': 4051,
  'sales': 3001,
  'purchase': 4001,
  'electricity': 4061,
  'audit fee': 4061,
  'legal fee': 4061,
  'rent': 4061,
  'insurance': 4061,
  'travel': 4061,
};

export function getSmartSuggestion(ledgerName: string, masterCodes: MasterGroupCode[]): SmartSuggestion | null {
  // 1. Keyword check (highest confidence 0.95)
  const lowerName = ledgerName.toLowerCase();
  for (const [kw, code] of Object.entries(COMMON_KEYWORDS)) {
    if (lowerName.includes(kw)) {
      return { group_code: code, confidence: 0.95 };
    }
  }

  // 2. Fuzzy matching against Master Code particulars
  let bestMatch: MasterGroupCode | null = null;
  let highestScore = 0;

  for (const mc of masterCodes) {
    const score = calculateSimilarity(ledgerName, mc.particulars);
    if (score > highestScore) {
      highestScore = score;
      bestMatch = mc;
    }
  }

  // Threshold for suggestion (0.45 is a decent balance for bigrams)
  if (bestMatch && highestScore > 0.45) {
    return { group_code: bestMatch.group_code, confidence: highestScore };
  }

  return null;
}
