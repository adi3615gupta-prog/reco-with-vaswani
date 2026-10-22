# Context and Background Notes

**Source:** `gst_debit_note_reconciliation_engine_spec.md`

## Domain Background: Agricultural & Chemical Supply Chains
In Indian agricultural input and chemical supply chains (e.g. suppliers like UPL, GSP Crop Science, Biostadt, Bayer), suppliers routinely issue multiple credit notes for volume discounts, rate differences, and seed return schemes on a single date.
Buyers' ERPs and accounting systems (e.g. TallyPrime) often record these as a single cumulative debit note voucher tagged with a generic reference like "DN" or internal voucher sequence numbers.
Off-the-shelf reconciliation tools fail because they assume 1-to-1 invoice number parity. The 6-pass waterfall with a subset-sum batch solver bridges this structural mismatch while strictly preserving accounting totals and zero double-counting invariants.
