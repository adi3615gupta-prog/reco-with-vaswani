import { D, Decimal, ZERO } from './decimal.ts';
import { IncomeType } from './incomeTaxTypes.ts';
import {
  ClubbingSourceCategory,
  ClubbingRecord,
  ComputedClubbingResult,
  TotalClubbingAggregation
} from './clubbingTypes.ts';

export function computeClubbing(records: ClubbingRecord[]): TotalClubbingAggregation {
  const globalNotes: string[] = [];
  const results: ComputedClubbingResult[] = [];
  
  let totalSalaryClubbed = ZERO;
  let totalHousePropertyClubbed = ZERO;
  let totalPgbpClubbed = ZERO;
  let totalCapitalGainsClubbed = ZERO;
  let totalIfosClubbed = ZERO;
  
  // Track exemption usage per minor child. Limit is 1500 per child per year.
  const minorChildExemptionUsage: Record<string, Decimal> = {};

  for (const record of records) {
    const notes: string[] = [];
    const grossAmount = D(record.grossAmount);
    let netClubbedAmount = grossAmount;
    let exemptionAllowed = ZERO;

    // ─────────────────────────────────────────────────────────────
    // Minor Child (Sec 64(1A))
    // ─────────────────────────────────────────────────────────────
    if (record.sourceCategory === ClubbingSourceCategory.MINOR_CHILD) {
      if (record.isMinorDisabled) {
        notes.push('Exclusion: Minor child suffers from disability. Income NOT clubbed.');
        netClubbedAmount = ZERO;
      } else if (record.isFromManualWork) {
        notes.push('Exclusion: Income derived from minor\'s manual work. Income NOT clubbed.');
        netClubbedAmount = ZERO;
      } else if (record.isFromSkillOrTalent) {
        notes.push('Exclusion: Income derived from minor\'s skill/talent. Income NOT clubbed.');
        netClubbedAmount = ZERO;
      } else {
        // Apply 10(32) Exemption up to 1500 per child
        const childId = record.minorChildId || 'UNKNOWN_CHILD';
        if (!minorChildExemptionUsage[childId]) {
          minorChildExemptionUsage[childId] = ZERO;
        }

        const currentUsage = minorChildExemptionUsage[childId];
        const remainingLimit = Decimal.max(D(1500).sub(currentUsage), ZERO);
        
        if (remainingLimit.gt(0)) {
          exemptionAllowed = Decimal.min(grossAmount, remainingLimit);
          minorChildExemptionUsage[childId] = currentUsage.add(exemptionAllowed);
          notes.push(`Section 10(32) Exemption claimed: ₹${exemptionAllowed.toFixed(0)}`);
        } else {
          notes.push(`Section 10(32) Exemption exhausted for minor child ${childId}.`);
        }
        
        netClubbedAmount = grossAmount.sub(exemptionAllowed);
        notes.push(`Minor child income clubbed: ₹${netClubbedAmount.toFixed(0)}`);
      }
    }

    // ─────────────────────────────────────────────────────────────
    // Spouse Remuneration (Sec 64(1)(ii))
    // ─────────────────────────────────────────────────────────────
    else if (record.sourceCategory === ClubbingSourceCategory.SPOUSE_REMUNERATION) {
      if (record.hasProfessionalQualification) {
        notes.push('Exclusion: Spouse has technical/professional qualification. Remuneration NOT clubbed.');
        netClubbedAmount = ZERO;
      } else {
        notes.push(`Spouse remuneration clubbed due to substantial interest: ₹${netClubbedAmount.toFixed(0)}`);
      }
    }
    
    // ─────────────────────────────────────────────────────────────
    // Other Categories (Spouse Asset, Son's Wife, HUF, etc.)
    // ─────────────────────────────────────────────────────────────
    else {
      notes.push(`Income clubbed under category ${record.sourceCategory}: ₹${netClubbedAmount.toFixed(0)}`);
    }

    // Accumulate to the specific Head of Income
    if (netClubbedAmount.gt(0) || grossAmount.lt(0)) { // Clubbing applies to losses too!
      switch (record.incomeHead) {
        case IncomeType.SALARY:
          totalSalaryClubbed = totalSalaryClubbed.add(netClubbedAmount);
          break;
        case IncomeType.HOUSE_PROPERTY:
          totalHousePropertyClubbed = totalHousePropertyClubbed.add(netClubbedAmount);
          break;
        case IncomeType.BUSINESS:
          totalPgbpClubbed = totalPgbpClubbed.add(netClubbedAmount);
          break;
        case IncomeType.CAPITAL_GAINS:
          totalCapitalGainsClubbed = totalCapitalGainsClubbed.add(netClubbedAmount);
          break;
        case IncomeType.OTHER_SOURCES:
          totalIfosClubbed = totalIfosClubbed.add(netClubbedAmount);
          break;
      }
    }

    results.push({
      id: record.id,
      sourceCategory: record.sourceCategory,
      incomeHead: record.incomeHead,
      grossAmount,
      exemptionAllowed,
      netClubbedAmount,
      computationNotes: notes
    });
  }

  return {
    results,
    totalSalaryClubbed,
    totalHousePropertyClubbed,
    totalPgbpClubbed,
    totalCapitalGainsClubbed,
    totalIfosClubbed,
    globalNotes
  };
}
