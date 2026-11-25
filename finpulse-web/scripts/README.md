This folder contains `reconcile_gstin.py` — a small utility to detect:

- Duplicate GSTIN used by multiple distinct party names in books
- Possible wrong GSTINs by fuzzy-matching party names against a govt/2B supplier list

Quick usage:

1. Create sample CSVs (if your repo contains `<DBCPARTY>`/`<DBCGSTIN>` tags):

```bash
python scripts/reconcile_gstin.py --extract-sample --root .
```

This writes `outputs/sample_books.csv` and `outputs/sample_gov.csv`.

2. Run scan with your CSVs:

```bash
python scripts/reconcile_gstin.py --books outputs/sample_books.csv --gov outputs/sample_gov.csv --threshold 85
```

Results are written to `outputs/duplicates_in_books.csv` and `outputs/wrong_gstin.csv`.
