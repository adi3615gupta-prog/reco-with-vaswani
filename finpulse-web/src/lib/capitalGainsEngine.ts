import { D, Decimal, ZERO } from './decimal.ts';
import {
  AssetClass,
  TransferType,
  CapitalAssetRecord,
  ComputedCapitalGain,
  TotalCapitalGainsResult
} from './capitalGainsTypes.ts';

/** Helper to parse date and calculate months difference */
function getMonthsDiff(startStr: string, endStr: string): number {
  const start = new Date(startStr);
  const end = new Date(endStr);
  const diffTime = Math.abs(end.getTime() - start.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
  return diffDays / 30.44; // Approx months
}

/** Returns true if date is >= 23rd July 2024 */
function isPostFinanceAct2024(dateStr: string): boolean {
  const cutoff = new Date('2024-07-23');
  const d = new Date(dateStr);
  return d >= cutoff;
}

/** Determines if asset is Long Term */
function determineIsLongTerm(assetClass: AssetClass, monthsHeld: number): boolean {
  if (assetClass === AssetClass.EQUITY_SHARES_LISTED || assetClass === AssetClass.EQUITY_ORIENTED_FUND) {
    return monthsHeld > 12;
  }
  if (assetClass === AssetClass.UNLISTED_SHARES || assetClass === AssetClass.REAL_ESTATE) {
    return monthsHeld > 24;
  }
  if (assetClass === AssetClass.DEBT_MUTUAL_FUND) {
    return false; // Always STCA as per Sec 50AA
  }
  return monthsHeld > 36;
}

export function computeCapitalGains(records: CapitalAssetRecord[]): TotalCapitalGainsResult {
  const globalNotes: string[] = [];
  const assets: ComputedCapitalGain[] = [];
  
  let totalSTCGNormal = ZERO;
  let totalSTCG111A = ZERO;
  let totalLTCG112A = ZERO;
  let totalLTCG112 = ZERO;
  let totalLossToCarryForward = ZERO;

  for (const record of records) {
    const notes: string[] = [];
    const monthsHeld = getMonthsDiff(record.acquisitionDate, record.transferDate);
    const isLongTerm = determineIsLongTerm(record.assetClass, monthsHeld);
    const post24 = isPostFinanceAct2024(record.transferDate);
    
    notes.push(`Asset held for ~${monthsHeld.toFixed(1)} months. Classified as ${isLongTerm ? 'LONG TERM' : 'SHORT TERM'}.`);

    // ─────────────────────────────────────────────────────────────
    // STEP 1: Full Value of Consideration
    // ─────────────────────────────────────────────────────────────
    let fvoc = D(record.fullValueConsideration);

    if (record.transferType === TransferType.BUY_BACK && post24) {
      // W.e.f 1 Oct 2024 buyback is deemed dividend, CG fvoc is NIL
      const octCutoff = new Date('2024-10-01');
      if (new Date(record.transferDate) >= octCutoff) {
        fvoc = ZERO;
        notes.push('Buy-back on/after 1 Oct 2024: FVOC is NIL (Treated as deemed dividend u/s 2(22)(f)). Capital Loss will arise.');
      }
    }

    if (record.assetClass === AssetClass.REAL_ESTATE && record.stampDutyValue) {
      const sdv = D(record.stampDutyValue);
      const oneTenPercent = fvoc.mul(1.10);
      if (sdv.gt(oneTenPercent)) {
        fvoc = sdv;
        notes.push(`Section 50C Applied: SDV (₹${sdv.toFixed(0)}) > 110% of Actual Consideration. FVOC taken as SDV.`);
      }
    }

    const netConsideration = Decimal.max(fvoc.sub(D(record.transferExpenses)), ZERO);

    // ─────────────────────────────────────────────────────────────
    // STEP 2: Cost of Acquisition & Improvement
    // ─────────────────────────────────────────────────────────────
    let coa = D(record.costOfAcquisition);
    const coi = D(record.costOfImprovement);

    // Indexation logic
    if (isLongTerm && !post24 && record.assetClass !== AssetClass.EQUITY_SHARES_LISTED && record.assetClass !== AssetClass.EQUITY_ORIENTED_FUND) {
      // If sold before 23 Jul 2024, indexation is allowed (Mock indexation multiplier of 1.2 used for this simplified engine)
      coa = coa.mul(1.2);
      notes.push('Indexation applied to COA (Transferred before 23rd July 2024).');
    } else if (isLongTerm && post24) {
      notes.push('Indexation NOT applied (Abolished w.e.f 23rd July 2024 for all assets).');
    }

    // Grandfathering 112A
    if (isLongTerm && (record.assetClass === AssetClass.EQUITY_SHARES_LISTED || record.assetClass === AssetClass.EQUITY_ORIENTED_FUND) && record.fmvOn31Jan2018) {
      const step1 = Decimal.min(D(record.fmvOn31Jan2018), fvoc);
      coa = Decimal.max(coa, step1);
      notes.push('Section 55 Grandfathering applied: COA substituted based on FMV as of 31-Jan-2018.');
    }

    let grossCapitalGain = netConsideration.sub(coa).sub(coi);

    // ─────────────────────────────────────────────────────────────
    // STEP 3: Exemptions (Section 54, 54EC, 54F)
    // ─────────────────────────────────────────────────────────────
    let exemption54 = ZERO;
    let exemption54EC = ZERO;
    let exemption54F = ZERO;

    if (grossCapitalGain.gt(0) && isLongTerm) {
      // Sec 54: Sale of residential house
      if (record.assetClass === AssetClass.REAL_ESTATE && record.investmentInNewResidentialHouse54) {
        const invest = D(record.investmentInNewResidentialHouse54);
        const limit = D(100000000); // 10 Crores max cap
        exemption54 = Decimal.min(grossCapitalGain, invest, limit);
        notes.push(`Section 54/54F Exemption claimed: ₹${exemption54.toFixed(0)} (Max ₹10Cr cap enforced).`);
      }

      // Sec 54EC: Bonds
      if (record.investmentInSpecifiedBonds54EC) {
        const invest = D(record.investmentInSpecifiedBonds54EC);
        const limit = D(5000000); // 50 Lakhs max cap
        exemption54EC = Decimal.min(grossCapitalGain.sub(exemption54), invest, limit);
        notes.push(`Section 54EC Exemption claimed: ₹${exemption54EC.toFixed(0)} (Max ₹50L cap enforced).`);
      }
    }

    const netTaxableGain = grossCapitalGain.sub(exemption54).sub(exemption54EC).sub(exemption54F);

    // ─────────────────────────────────────────────────────────────
    // STEP 4: Classification & Bucket Allocation
    // ─────────────────────────────────────────────────────────────
    let applicableSection: ComputedCapitalGain['applicableSection'] = 'STCG_NORMAL';

    if (netTaxableGain.gte(0)) {
      if (isLongTerm) {
        if (record.assetClass === AssetClass.EQUITY_SHARES_LISTED || record.assetClass === AssetClass.EQUITY_ORIENTED_FUND) {
          applicableSection = '112A';
          totalLTCG112A = totalLTCG112A.add(netTaxableGain);
          notes.push(`Taxable u/s 112A @ ${post24 ? '12.5%' : '10%'} (above ₹1,25,000 threshold).`);
        } else {
          applicableSection = '112';
          totalLTCG112 = totalLTCG112.add(netTaxableGain);
          notes.push(`Taxable u/s 112 @ ${post24 ? '12.5%' : '20%'}.`);
        }
      } else {
        if (record.assetClass === AssetClass.EQUITY_SHARES_LISTED || record.assetClass === AssetClass.EQUITY_ORIENTED_FUND) {
          applicableSection = '111A';
          totalSTCG111A = totalSTCG111A.add(netTaxableGain);
          notes.push(`Taxable u/s 111A @ ${post24 ? '20%' : '15%'}.`);
        } else {
          applicableSection = 'STCG_NORMAL';
          totalSTCGNormal = totalSTCGNormal.add(netTaxableGain);
          notes.push('Taxable at Normal Slab Rates (STCG).');
        }
      }
    } else {
      totalLossToCarryForward = totalLossToCarryForward.add(netTaxableGain.abs());
      notes.push('Capital Loss generated. Eligible for set-off and carry forward.');
    }

    assets.push({
      id: record.id,
      assetClass: record.assetClass,
      isLongTerm,
      applicableSection,
      fullValueConsideration: fvoc,
      netConsideration,
      costOfAcquisition: coa,
      costOfImprovement: coi,
      grossCapitalGain,
      exemption54,
      exemption54EC,
      exemption54F,
      netTaxableGain,
      computationNotes: notes
    });
  }

  return {
    assets,
    totalSTCGNormal,
    totalSTCG111A,
    totalLTCG112A,
    totalLTCG112,
    totalLossToCarryForward,
    globalNotes
  };
}
