/**
 * rule88aOptimizer.ts
 * 
 * Rule 88A Mathematical Cash Liability Set-Off Optimizer.
 * Reverse-engineered from TaxPower GST GSTR3BOffSetLiabilityGSTNRequest (OpLiab2, UtilITCReqVO, UtilCsshReqVO).
 * 
 * Mathematical Guarantee:
 * Strictly enforces Section 49 / Rule 88A legal sequence while optimizing the distribution of
 * remaining IGST credit between CGST and SGST liabilities to minimize cash payout.
 */

export interface TaxLiability {
  igst: number;
  cgst: number;
  sgst: number;
  cess?: number;
}

export interface ItcBalances {
  igst: number;
  cgst: number;
  sgst: number;
  cess?: number;
}

export interface Rule88ASetOffResult {
  // Utilization matrix matching TaxPower OpLiab2
  utilization: {
    igst_igst_amt: number;
    igst_cgst_amt: number;
    igst_sgst_amt: number;
    cgst_cgst_amt: number;
    cgst_igst_amt: number;
    sgst_sgst_amt: number;
    sgst_igst_amt: number;
    cess_cess_amt: number;
  };
  // Net cash liability to be discharged via cash ledger (UtilCsshReqVO)
  cashPayable: {
    igst: number;
    cgst: number;
    sgst: number;
    cess: number;
    totalCash: number;
  };
  // Closing ITC balances carried forward to next return
  closingItc: {
    igst: number;
    cgst: number;
    sgst: number;
    cess: number;
    totalClosing: number;
  };
}

/**
 * Optimizes the set-off sequence under Rule 88A to minimize net cash outflow.
 */
export function optimizeRule88ASetOff(
  liability: TaxLiability,
  itc: ItcBalances
): Rule88ASetOffResult {
  const round2 = (num: number) => Math.round(num * 100) / 100;

  let liabIgst = Math.max(0, liability.igst || 0);
  let liabCgst = Math.max(0, liability.cgst || 0);
  let liabSgst = Math.max(0, liability.sgst || 0);
  let liabCess = Math.max(0, liability.cess || 0);

  let balIgst = Math.max(0, itc.igst || 0);
  let balCgst = Math.max(0, itc.cgst || 0);
  let balSgst = Math.max(0, itc.sgst || 0);
  let balCess = Math.max(0, itc.cess || 0);

  // Step 1: Exhaust IGST credit against IGST liability first
  const igst_igst_amt = round2(Math.min(liabIgst, balIgst));
  liabIgst = round2(liabIgst - igst_igst_amt);
  balIgst = round2(balIgst - igst_igst_amt);

  // Step 2: Optimal distribution of remaining IGST credit between CGST and SGST
  // Calculate uncovered liabilities (liability that cannot be covered by own credit)
  const uncoveredCgst = Math.max(0, round2(liabCgst - balCgst));
  const uncoveredSgst = Math.max(0, round2(liabSgst - balSgst));

  let igst_cgst_amt = 0;
  let igst_sgst_amt = 0;

  if (balIgst > 0) {
    // Priority 2a: Cover uncovered liabilities to avoid cash payout
    const allocToUncoveredCgst = round2(Math.min(balIgst, uncoveredCgst));
    igst_cgst_amt += allocToUncoveredCgst;
    balIgst = round2(balIgst - allocToUncoveredCgst);

    const allocToUncoveredSgst = round2(Math.min(balIgst, uncoveredSgst));
    igst_sgst_amt += allocToUncoveredSgst;
    balIgst = round2(balIgst - allocToUncoveredSgst);

    // Priority 2b: If IGST credit still remains, allocate to remaining CGST liability
    if (balIgst > 0 && liabCgst > igst_cgst_amt) {
      const remainingCgstLiab = round2(liabCgst - igst_cgst_amt);
      const alloc = round2(Math.min(balIgst, remainingCgstLiab));
      igst_cgst_amt = round2(igst_cgst_amt + alloc);
      balIgst = round2(balIgst - alloc);
    }

    // Priority 2c: If IGST credit still remains, allocate to remaining SGST liability
    if (balIgst > 0 && liabSgst > igst_sgst_amt) {
      const remainingSgstLiab = round2(liabSgst - igst_sgst_amt);
      const alloc = round2(Math.min(balIgst, remainingSgstLiab));
      igst_sgst_amt = round2(igst_sgst_amt + alloc);
      balIgst = round2(balIgst - alloc);
    }
  }

  liabCgst = round2(Math.max(0, liabCgst - igst_cgst_amt));
  liabSgst = round2(Math.max(0, liabSgst - igst_sgst_amt));

  // Step 3: Utilize CGST credit against remaining CGST liability, then remaining IGST liability
  const cgst_cgst_amt = round2(Math.min(liabCgst, balCgst));
  liabCgst = round2(liabCgst - cgst_cgst_amt);
  balCgst = round2(balCgst - cgst_cgst_amt);

  let cgst_igst_amt = 0;
  if (balCgst > 0 && liabIgst > 0) {
    cgst_igst_amt = round2(Math.min(liabIgst, balCgst));
    liabIgst = round2(liabIgst - cgst_igst_amt);
    balCgst = round2(balCgst - cgst_igst_amt);
  }

  // Step 4: Utilize SGST credit against remaining SGST liability, then remaining IGST liability
  const sgst_sgst_amt = round2(Math.min(liabSgst, balSgst));
  liabSgst = round2(liabSgst - sgst_sgst_amt);
  balSgst = round2(balSgst - sgst_sgst_amt);

  let sgst_igst_amt = 0;
  if (balSgst > 0 && liabIgst > 0) {
    sgst_igst_amt = round2(Math.min(liabIgst, balSgst));
    liabIgst = round2(liabIgst - sgst_igst_amt);
    balSgst = round2(balSgst - sgst_igst_amt);
  }

  // Step 5: Cess Set-off (Cess credit can only offset Cess liability)
  const cess_cess_amt = round2(Math.min(liabCess, balCess));
  liabCess = round2(liabCess - cess_cess_amt);
  balCess = round2(balCess - cess_cess_amt);

  const totalCash = round2(liabIgst + liabCgst + liabSgst + liabCess);
  const totalClosing = round2(balIgst + balCgst + balSgst + balCess);

  return {
    utilization: {
      igst_igst_amt,
      igst_cgst_amt,
      igst_sgst_amt,
      cgst_cgst_amt,
      cgst_igst_amt,
      sgst_sgst_amt,
      sgst_igst_amt,
      cess_cess_amt
    },
    cashPayable: {
      igst: liabIgst,
      cgst: liabCgst,
      sgst: liabSgst,
      cess: liabCess,
      totalCash
    },
    closingItc: {
      igst: balIgst,
      cgst: balCgst,
      sgst: balSgst,
      cess: balCess,
      totalClosing
    }
  };
}
