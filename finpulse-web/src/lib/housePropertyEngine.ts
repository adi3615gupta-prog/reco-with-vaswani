import { D, Decimal, ZERO } from './decimal.ts';
import { EntityType, RegimeType } from './incomeTaxTypes.ts';
import {
  PropertyType,
  HousePropertyRecord,
  HousePropertyComputation,
  TotalHousePropertyResult
} from './housePropertyTypes.ts';

export function computeHouseProperty(
  records: HousePropertyRecord[],
  entityType: EntityType,
  regime: RegimeType
): TotalHousePropertyResult {
  const globalNotes: string[] = [];
  const computations: HousePropertyComputation[] = [];

  // Step 1: Handle SOP Limits (Max 2 SOPs allowed for Individual/HUF)
  const sopAllowed = (entityType === EntityType.INDIVIDUAL || entityType === EntityType.HUF) ? 2 : 0;
  
  // Sort SOPs by least income (beneficial to assessee to claim the ones with higher NAV as DLOP? 
  // Actually, beneficial to claim SOP for those with highest GAV/NAV to make them NIL. 
  // For simplicity, we just take the first 2 as SOP).
  let sopCount = 0;
  
  for (const record of records) {
    let finalType = record.type;

    if (finalType === PropertyType.SOP) {
      if (sopCount < sopAllowed) {
        sopCount++;
      } else {
        finalType = PropertyType.DLOP;
        globalNotes.push(`Property ${record.id} treated as DLOP because maximum SOP limit (${sopAllowed}) exceeded.`);
      }
    }

    const notes: string[] = [];
    let gav = ZERO;
    let municipalTaxesDeducted = ZERO;
    let nav = ZERO;
    let standardDeduction24a = ZERO;
    let interestDeduction24b = ZERO;
    let netIncome = ZERO;

    const share = D(record.ownershipShare || 100).div(100);

    if (finalType === PropertyType.SOP) {
      // For SOP, GAV and NAV are NIL.
      gav = ZERO;
      municipalTaxesDeducted = ZERO;
      nav = ZERO;
      standardDeduction24a = ZERO;

      if (regime === RegimeType.NEW) {
        interestDeduction24b = ZERO;
        notes.push('Interest on Loan for SOP is NOT allowed under New Tax Regime (Sec 115BAC).');
      } else {
        // Calculate max limit based on loan date & purpose
        const totalInterestPaid = D(record.interestOnLoan).add(D(record.preConstructionInterest));
        
        // Default limit is 30,000
        let limit = D(30000);
        
        if (record.loanPurpose === 'PURCHASE_CONSTRUCTION') {
          const loanDate = new Date(record.loanTakenDate);
          const cutoff = new Date('1999-04-01');
          if (loanDate >= cutoff) {
            limit = D(200000); // 2 Lakh limit
          }
        }
        
        interestDeduction24b = Decimal.min(totalInterestPaid, limit).mul(share);
        notes.push(`Interest deduction for SOP capped at ${limit.toNumber()} due to loan purpose/date.`);
      }

      netIncome = nav.sub(standardDeduction24a).sub(interestDeduction24b);
      
    } else {
      // LOP / DLOP Calculation
      const municipalVal = D(record.municipalValue);
      const fairRent = D(record.fairRent);
      const standardRent = D(record.standardRent);
      const actualRent = D(record.actualRentReceived).sub(D(record.unrealizedRent)); // ER > AR+VR check not fully detailed, assuming simple

      // Step 1: Higher of Municipal Value or Fair Rent
      const step1 = Decimal.max(municipalVal, fairRent);
      
      // Step 2: Lower of Step 1 or Standard Rent (Expected Rent)
      const expectedRent = standardRent.gt(0) ? Decimal.min(step1, standardRent) : step1;

      // Step 3: Higher of Expected Rent or Actual Rent
      if (finalType === PropertyType.DLOP) {
        gav = expectedRent;
      } else {
        // LOP
        if (actualRent.gt(expectedRent)) {
          gav = actualRent;
        } else {
          // If ER > AR, check vacancy. If ER > AR+VR, GAV = ER. If ER <= AR+VR, GAV = AR
          const monthlyRent = D(record.actualRentReceived).div(12 - record.vacancyMonths); // approximate
          const vacancyRent = monthlyRent.mul(D(record.vacancyMonths));
          if (expectedRent.lte(actualRent.add(vacancyRent))) {
            gav = actualRent;
          } else {
            gav = expectedRent;
          }
        }
      }

      municipalTaxesDeducted = D(record.municipalTaxesPaid);
      nav = Decimal.max(gav.sub(municipalTaxesDeducted), ZERO);

      standardDeduction24a = nav.percent(30);

      // No limit on interest for LOP/DLOP
      const totalInterestPaid = D(record.interestOnLoan).add(D(record.preConstructionInterest));
      interestDeduction24b = totalInterestPaid;

      netIncome = nav.sub(standardDeduction24a).sub(interestDeduction24b).mul(share);
    }

    computations.push({
      id: record.id,
      finalType,
      grossAnnualValue: gav,
      municipalTaxesDeducted,
      netAnnualValue: nav,
      standardDeduction24a,
      interestDeduction24b,
      netIncome,
      computationNotes: notes
    });
  }

  // Aggregate Total Income and Cap HP Loss set-off
  let totalComputed = ZERO;
  for (const c of computations) {
    totalComputed = totalComputed.add(c.netIncome);
  }

  let totalIncome = ZERO;
  let totalLossToSetOff = ZERO;
  let carriedForwardLoss = ZERO;

  if (totalComputed.gte(0)) {
    totalIncome = totalComputed;
  } else {
    // Loss from House Property. Max set-off against other heads is 2,00,000.
    const absLoss = totalComputed.abs();
    if (absLoss.gt(200000)) {
      totalLossToSetOff = D(200000);
      carriedForwardLoss = absLoss.sub(D(200000));
      globalNotes.push(`House property loss exceeds ₹2,00,000. Set-off capped at ₹2L. Remaining ₹${carriedForwardLoss.toFixed(0)} will be carried forward.`);
    } else {
      totalLossToSetOff = absLoss;
    }
    totalIncome = ZERO; // Actual income is 0, loss will be set off elsewhere.
  }

  return {
    properties: computations,
    totalIncome,
    totalLossToSetOff,
    carriedForwardLoss,
    globalNotes
  };
}
