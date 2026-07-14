import { D, Decimal, ZERO } from './decimal.ts';
import { RegimeType } from './incomeTaxTypes.ts';
import {
  GiftPropertyType,
  IfosRecord,
  ComputedIfosResult
} from './ifosTypes.ts';

export function computeIFOS(record: IfosRecord, regime: RegimeType): ComputedIfosResult {
  const notes: string[] = [];
  let totalIfosIncome = ZERO;

  // 1. General & Fully Taxable Incomes
  const dividends = D(record.dividends);
  if (dividends.gt(0)) {
    totalIfosIncome = totalIfosIncome.add(dividends);
    notes.push(`Dividend Income: ₹${dividends.toFixed(0)}`);
  }

  const casualIncome = D(record.casualIncomeLotteries);
  if (casualIncome.gt(0)) {
    totalIfosIncome = totalIfosIncome.add(casualIncome);
    notes.push(`Casual Income (Lotteries/Puzzles): ₹${casualIncome.toFixed(0)} (Taxable at flat 30%)`);
  }

  const bankInt = D(record.interestOnBankDeposits);
  if (bankInt.gt(0)) {
    totalIfosIncome = totalIfosIncome.add(bankInt);
    notes.push(`Interest on Bank Deposits: ₹${bankInt.toFixed(0)}`);
  }

  const refundInt = D(record.interestOnIncomeTaxRefund);
  if (refundInt.gt(0)) {
    totalIfosIncome = totalIfosIncome.add(refundInt);
    notes.push(`Interest on Income Tax Refund: ₹${refundInt.toFixed(0)}`);
  }
  
  const otherGen = D(record.otherGeneralIncome);
  if (otherGen.gt(0)) {
    totalIfosIncome = totalIfosIncome.add(otherGen);
    notes.push(`Other General IFOS Income: ₹${otherGen.toFixed(0)}`);
  }

  // 2. Specific Deductions (Section 57)
  const familyPension = D(record.familyPensionReceived);
  if (familyPension.gt(0)) {
    const oneThird = familyPension.div(3);
    const statutoryLimit = regime === RegimeType.NEW ? D(25000) : D(15000);
    const deduction = Decimal.min(oneThird, statutoryLimit);
    const taxablePension = familyPension.sub(deduction);
    totalIfosIncome = totalIfosIncome.add(taxablePension);
    notes.push(`Family Pension: Gross ₹${familyPension.toFixed(0)}. Deduction u/s 57 allowed: ₹${deduction.toFixed(0)} (Cap: ₹${statutoryLimit.toFixed(0)}). Taxable: ₹${taxablePension.toFixed(0)}`);
  }

  const compInterest = D(record.interestOnCompulsoryAcquisition);
  if (compInterest.gt(0)) {
    const deduction = compInterest.percent(50); // Flat 50% deduction
    const taxableCompInt = compInterest.sub(deduction);
    totalIfosIncome = totalIfosIncome.add(taxableCompInt);
    notes.push(`Interest on Compulsory Acquisition: Gross ₹${compInterest.toFixed(0)}. Flat 50% Deduction allowed. Taxable: ₹${taxableCompInt.toFixed(0)}`);
  }

  // 3. Gift Taxation (Section 56(2)(x))
  let totalMonetaryGifts = ZERO;
  let totalMovableGiftsBenefit = ZERO;
  
  // Aggregate movable and monetary separately to check 50k threshold
  for (const gift of record.gifts) {
    if (gift.isFromRelative || gift.isOnOccasionOfMarriage || gift.isUnderWillOrInheritance) {
      notes.push(`Gift ${gift.id} is Exempt (Relative/Marriage/Inheritance).`);
      continue;
    }

    if (gift.type === GiftPropertyType.MONEY) {
      // Money without consideration
      totalMonetaryGifts = totalMonetaryGifts.add(D(gift.actualConsiderationPaid)); // the "consideration" field is the gift amount here
    } else if (gift.type === GiftPropertyType.MOVABLE_PROPERTY) {
      const fmv = D(gift.fairMarketValue || 0);
      const consid = D(gift.actualConsiderationPaid || 0);
      if (consid.eq(ZERO)) {
        totalMovableGiftsBenefit = totalMovableGiftsBenefit.add(fmv);
      } else if (fmv.gt(consid)) {
        totalMovableGiftsBenefit = totalMovableGiftsBenefit.add(fmv.sub(consid));
      }
    } else if (gift.type === GiftPropertyType.IMMOVABLE_PROPERTY) {
      // Per property basis
      const sdv = D(gift.stampDutyValue || 0);
      const consid = D(gift.actualConsiderationPaid || 0);
      
      if (consid.eq(ZERO)) {
        if (sdv.gt(50000)) {
          totalIfosIncome = totalIfosIncome.add(sdv);
          notes.push(`Immovable Property Gift (Without Consideration): SDV ₹${sdv.toFixed(0)} > 50k. Taxable.`);
        }
      } else {
        const diff = sdv.sub(consid);
        const safeHarbor = consid.mul(1.10);
        if (diff.gt(50000) && sdv.gt(safeHarbor)) {
          totalIfosIncome = totalIfosIncome.add(diff);
          notes.push(`Immovable Property Gift (Inadequate Consideration): SDV exceeds consideration by >50k AND >110%. Taxable diff: ₹${diff.toFixed(0)}`);
        }
      }
    }
  }

  if (totalMonetaryGifts.gt(50000)) {
    totalIfosIncome = totalIfosIncome.add(totalMonetaryGifts);
    notes.push(`Aggregate Monetary Gifts exceed ₹50,000. Taxable: ₹${totalMonetaryGifts.toFixed(0)}`);
  } else if (totalMonetaryGifts.gt(0)) {
    notes.push(`Aggregate Monetary Gifts (₹${totalMonetaryGifts.toFixed(0)}) <= ₹50,000. Exempt.`);
  }

  if (totalMovableGiftsBenefit.gt(50000)) {
    totalIfosIncome = totalIfosIncome.add(totalMovableGiftsBenefit);
    notes.push(`Aggregate Movable Property Gifts exceed ₹50,000 threshold. Taxable: ₹${totalMovableGiftsBenefit.toFixed(0)}`);
  } else if (totalMovableGiftsBenefit.gt(0)) {
    notes.push(`Aggregate Movable Property Gifts benefit (₹${totalMovableGiftsBenefit.toFixed(0)}) <= ₹50,000. Exempt.`);
  }

  // 4. Life Insurance Policies (Section 10(10D) & 56(2)(xiii))
  for (const lip of record.lifeInsurancePolicies) {
    if (lip.receivedOnDeath) {
      notes.push(`LIP ${lip.id}: Exempt u/s 10(10D) as proceeds received on death.`);
      continue;
    }

    const issueDate = new Date(lip.dateOfIssue);
    const cutoffDate = new Date('2023-04-01');

    if (issueDate >= cutoffDate && D(lip.annualPremium).gt(500000)) {
      const maturity = D(lip.maturityAmountReceived);
      const totalPaidNet = D(lip.annualPremium).mul(10).sub(D(lip.deductionClaimed80C)); // Approximation of term based on premium or provided by user. 
      // Actually we just need "Premium paid not claimed u/s 80C". 
      // Assuming UI gives us Total Premium Paid in the 'annualPremium' field if it's over the term, or we use a separate field.
      // Let's assume annualPremium is just the annual amount. Total premiums paid needs to be calculated.
      // Since we don't have policy term, let's treat annualPremium * (years elapsed) as cost. 
      // For precision, let's just assume `lip.annualPremium` is actually `totalPremiumPaid` for this mathematical model if we simplify.
      // Wait, let's assume `lip.annualPremium` is the annual amount.
      // Rule: Taxable if Annual Premium > 5,00,000.
      const totalPremiumPaid = D(lip.annualPremium).mul(Math.max(1, new Date().getFullYear() - issueDate.getFullYear())); 
      const cost = totalPremiumPaid.sub(D(lip.deductionClaimed80C));
      const taxableLip = Decimal.max(maturity.sub(cost), ZERO);
      
      totalIfosIncome = totalIfosIncome.add(taxableLip);
      notes.push(`LIP ${lip.id}: Issued on/after 1-Apr-2023 with Annual Premium > ₹5 Lakhs. Taxable Maturity Proceeds: ₹${taxableLip.toFixed(0)}`);
    } else {
      // Check 10% / 20% limit for policies before 2023 if needed (Simplified)
      const tenPercentSA = D(lip.sumAssured).percent(10);
      if (D(lip.annualPremium).gt(tenPercentSA)) {
         notes.push(`LIP ${lip.id}: Premium exceeds 10% of Sum Assured. Exemption u/s 10(10D) denied. Needs manual P&L entry or UI enhancement to specify total term cost.`);
         // Adding to income if data available, otherwise just warn.
      } else {
         notes.push(`LIP ${lip.id}: Exempt u/s 10(10D).`);
      }
    }
  }

  return {
    totalIfosIncome,
    casualIncome,
    dividendIncome: dividends,
    computationNotes: notes
  };
}
