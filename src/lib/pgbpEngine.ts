import { D, Decimal, ZERO } from './decimal.ts';
import { RegimeType } from './incomeTaxTypes.ts';
import {
  PgbpSection,
  PresumptiveBusinessRecord,
  RegularBusinessRecord,
  ComputedPgbpDetails,
  TotalPgbpResult,
  AssetBlock
} from './pgbpTypes.ts';

/**
 * PHASE 3: Calculate Tax Depreciation u/s 32
 */
function calculateSection32Depreciation(blocks: AssetBlock[], regime: RegimeType): { totalDepreciation: Decimal, notes: string[] } {
  let totalDepreciation = ZERO;
  const notes: string[] = [];

  for (const block of blocks) {
    const openingWdv = D(block.openingWdv);
    const add180 = D(block.additionsMoreThan180Days);
    const addLess180 = D(block.additionsLessThan180Days);
    const saleValue = D(block.moneysPayableFromSales);
    const rate = D(block.depreciationRate).div(100);

    let grossBlock = openingWdv.add(add180).add(addLess180);
    
    // If sale value exceeds gross block, no depreciation (Capital Gains applies)
    if (saleValue.gte(grossBlock)) {
      notes.push(`Block ${block.blockId} (${block.assetClass}): Sale value exceeds gross block. Depreciation is NIL.`);
      continue;
    }

    const netBlock = grossBlock.sub(saleValue);
    
    // Allocate sale value to opening & >180 days first
    const availableFullRateBase = openingWdv.add(add180);
    let fullRateAmount = ZERO;
    let halfRateAmount = ZERO;

    if (saleValue.gte(availableFullRateBase)) {
      // Sale wiped out all opening and >180 days additions
      // Remaining block consists entirely of <180 days additions
      halfRateAmount = netBlock;
      fullRateAmount = ZERO;
    } else {
      // Sale did not wipe out full rate base
      halfRateAmount = addLess180;
      fullRateAmount = netBlock.sub(halfRateAmount);
    }

    let blockDep = fullRateAmount.mul(rate).add(halfRateAmount.mul(rate).div(2));

    // Additional Depreciation (20%) for eligible Plant & Machinery
    if (block.isEligibleForAdditionalDepreciation && regime === RegimeType.OLD) {
      const addlRate = D(0.20);
      const eligibleFull = D(block.additionsMoreThan180DaysEligibleForAddlDep || 0);
      const eligibleHalf = D(block.additionsLessThan180DaysEligibleForAddlDep || 0);

      blockDep = blockDep.add(eligibleFull.mul(addlRate));
      blockDep = blockDep.add(eligibleHalf.mul(addlRate).div(2));
      notes.push(`Block ${block.blockId} claimed Additional Depreciation.`);
    } else if (block.isEligibleForAdditionalDepreciation && regime === RegimeType.NEW) {
      notes.push(`Block ${block.blockId} is eligible for Additional Depreciation but disallowed under New Regime (Sec 115BAC).`);
    }

    // Check if block ceased to exist
    // If openingWdv + additions - saleValue > 0 but all assets sold, dep is NIL. 
    // We don't have the exact asset count, assuming netBlock > 0 means assets exist.

    totalDepreciation = totalDepreciation.add(blockDep);
    notes.push(`Block ${block.blockId}: Normal Depreciation allowed = ₹${blockDep.toFixed(0)}`);
  }

  return { totalDepreciation, notes };
}

/**
 * PHASE 1 & 2: Main PGBP Engine
 */
export function computePGBP(
  presumptiveRecords: PresumptiveBusinessRecord[],
  regularRecords: RegularBusinessRecord[],
  regime: RegimeType
): TotalPgbpResult {
  const globalNotes: string[] = [];
  const businesses: ComputedPgbpDetails[] = [];
  let totalPgbpIncome = ZERO;

  // ─────────────────────────────────────────────────────────────
  // PHASE 1: PRESUMPTIVE TAXATION
  // ─────────────────────────────────────────────────────────────
  for (const record of presumptiveRecords) {
    const notes: string[] = [];
    let computedIncome = ZERO;

    if (record.section === PgbpSection.SEC_44AD) {
      const digitalInc = D(record.digitalTurnoverOrReceipts).percent(6);
      const cashInc = D(record.cashTurnoverOrReceipts).percent(8);
      let statutoryIncome = digitalInc.add(cashInc);
      
      computedIncome = Decimal.max(statutoryIncome, D(record.declaredIncome || 0));
      notes.push(`Sec 44AD applied: 6% on Digital (₹${record.digitalTurnoverOrReceipts}), 8% on Cash (₹${record.cashTurnoverOrReceipts}).`);

    } else if (record.section === PgbpSection.SEC_44ADA) {
      const statutoryIncome = D(record.totalTurnoverOrReceipts).percent(50);
      computedIncome = Decimal.max(statutoryIncome, D(record.declaredIncome || 0));
      notes.push(`Sec 44ADA applied: 50% on Gross Receipts (₹${record.totalTurnoverOrReceipts}).`);

    } else if (record.section === PgbpSection.SEC_44AE) {
      const heavyInc = D(record.heavyGoodsVehiclesMonths).mul(D(1000)).mul(D(record.heavyVehiclesTonnage.reduce((a,b) => a+b, 0) || 0)); // Simplified: 1000 per ton per month
      // Actually 44AE heavy vehicle is 1000 per ton per month. 
      // Simplified here: sum of tonnages * months * 1000 (Assuming all owned for same months for simplicity, UI will aggregate)
      const otherInc = D(record.otherVehiclesMonths).mul(D(7500));
      let statutoryIncome = heavyInc.add(otherInc);
      
      computedIncome = Decimal.max(statutoryIncome, D(record.declaredIncome || 0));
      notes.push(`Sec 44AE applied: Heavy Vehicles Income (₹${heavyInc.toFixed(0)}), Other Vehicles Income (₹${otherInc.toFixed(0)}).`);
    }

    businesses.push({
      id: record.id,
      section: record.section,
      computedIncome,
      computationNotes: notes
    });
    totalPgbpIncome = totalPgbpIncome.add(computedIncome);
  }

  // ─────────────────────────────────────────────────────────────
  // PHASE 2 & 3: REGULAR BUSINESS (INDIRECT METHOD)
  // ─────────────────────────────────────────────────────────────
  for (const record of regularRecords) {
    const notes: string[] = [];
    let netProfit = D(record.netProfitAsPerBooks);

    notes.push(`Starting Net Profit as per books: ₹${netProfit.toFixed(0)}`);

    // Additions (Disallowances)
    const additions = D(record.depreciationAsPerBooks)
      .add(D(record.incomeTaxPaidOrProvided))
      .add(D(record.personalExpensesDebited))
      .add(D(record.capitalExpenditureDebited))
      .add(D(record.cashPaymentsOver10k_40A3))
      .add(D(record.unpaidTaxesDutyCess_43B))
      .add(D(record.unpaidEmployerPF_43B))
      .add(D(record.delayedPaymentsToMSME_43B));

    if (additions.gt(0)) {
      netProfit = netProfit.add(additions);
      notes.push(`Additions (Disallowances u/s 40, 40A, 43B, etc): +₹${additions.toFixed(0)}`);
    }

    // Subtractions (Incomes credited to P&L but taxable under other heads)
    const subtractions = D(record.dividendIncomeCredited)
      .add(D(record.agriculturalIncomeCredited))
      .add(D(record.capitalGainsCredited))
      .add(D(record.housePropertyRentCredited))
      .add(D(record.incomeTaxRefundCredited));

    if (subtractions.gt(0)) {
      netProfit = netProfit.sub(subtractions);
      notes.push(`Subtractions (Incomes taxable elsewhere): -₹${subtractions.toFixed(0)}`);
    }

    // Section 32 Depreciation
    if (record.assetBlocks && record.assetBlocks.length > 0) {
      const depResult = calculateSection32Depreciation(record.assetBlocks, regime);
      netProfit = netProfit.sub(depResult.totalDepreciation);
      notes.push(...depResult.notes);
      notes.push(`Less: Total Sec 32 Tax Depreciation: -₹${depResult.totalDepreciation.toFixed(0)}`);
    }

    // Deemed Incomes
    const deemedIncomes = D(record.badDebtsRecovered_41_4)
      .add(D(record.remissionOfTradingLiability_41_1));
    
    if (deemedIncomes.gt(0)) {
      netProfit = netProfit.add(deemedIncomes);
      notes.push(`Add: Deemed Incomes u/s 41: +₹${deemedIncomes.toFixed(0)}`);
    }

    businesses.push({
      id: record.id,
      section: PgbpSection.REGULAR,
      computedIncome: netProfit,
      computationNotes: notes
    });
    totalPgbpIncome = totalPgbpIncome.add(netProfit);
  }

  // ─────────────────────────────────────────────────────────────
  // AGGREGATION & LOSS CAPPING
  // ─────────────────────────────────────────────────────────────
  let totalIncome = ZERO;
  let totalLossToSetOff = ZERO;
  let carriedForwardLoss = ZERO;

  if (totalPgbpIncome.gte(0)) {
    totalIncome = totalPgbpIncome;
  } else {
    // PGBP Loss can be set off against any head EXCEPT Salary.
    // We will pass the full loss up to the main engine to handle inter-head setoff vs salary restriction.
    totalLossToSetOff = totalPgbpIncome.abs();
    totalIncome = ZERO;
    globalNotes.push(`Net PGBP is a loss of ₹${totalLossToSetOff.toFixed(0)}. This can be set off against any head EXCEPT Salary.`);
  }

  return {
    businesses,
    totalPgbpIncome: totalIncome,
    totalLossToSetOff,
    carriedForwardLoss,
    globalNotes
  };
}
