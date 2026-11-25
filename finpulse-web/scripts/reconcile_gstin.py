#!/usr/bin/env python3
import argparse
import csv
import os
import re
from collections import defaultdict
from rapidfuzz import fuzz, process


def normalize_name(n: str) -> str:
    if not n:
        return ""
    s = n.lower()
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    s = re.sub(r"\b(ltd|pvt|private|limited|llp|co|company|inc)\b", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def normalize_gstin(g: str) -> str:
    if not g:
        return ""
    g = g.upper()
    g = re.sub(r"[^A-Z0-9]", "", g)
    return g


def read_csv(path: str):
    rows = []
    with open(path, newline='', encoding='utf-8') as fh:
        reader = csv.DictReader(fh)
        for r in reader:
            rows.append(r)
    return rows


def write_csv(path: str, rows, fieldnames):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', newline='', encoding='utf-8') as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        for r in rows:
            writer.writerow(r)


def extract_from_files(root: str):
    pairs = []
    party_re = re.compile(r"<DBCPARTY>(.*?)</DBCPARTY>", re.IGNORECASE|re.DOTALL)
    gst_re = re.compile(r"<DBCGSTIN>(.*?)</DBCGSTIN>", re.IGNORECASE|re.DOTALL)
    for dirpath, _, filenames in os.walk(root):
        for fn in filenames:
            if fn.endswith(('.xml', '.md', '.txt')):
                path = os.path.join(dirpath, fn)
                try:
                    with open(path, encoding='utf-8', errors='ignore') as fh:
                        data = fh.read()
                except Exception:
                    continue
                parties = party_re.findall(data)
                gstins = gst_re.findall(data)
                # pair by order where possible
                if parties and gstins and len(parties) == len(gstins):
                    for p,g in zip(parties, gstins):
                        pairs.append({'party': p.strip(), 'gstin': g.strip()})
                else:
                    # fallback: take any party with any gstin
                    for p in parties:
                        for g in gstins:
                            pairs.append({'party': p.strip(), 'gstin': g.strip()})
    return pairs


def detect_duplicates_in_books(rows):
    gst_map = defaultdict(set)
    for r in rows:
        g = normalize_gstin(r.get('gstin',''))
        name = normalize_name(r.get('party','') or r.get('supplier','') or r.get('name',''))
        if g:
            gst_map[g].add(name)
    duplicates = []
    for g, names in gst_map.items():
        if len([n for n in names if n]) > 1:
            duplicates.append({'gstin': g, 'party_names': " | ".join(sorted(names))})
    return duplicates


def find_wrong_gstin(books, gov, threshold=85):
    gov_names = [normalize_name(r.get('party','') or r.get('supplier','') or r.get('name','')) for r in gov]
    gov_map = {normalize_name(r.get('party','') or r.get('supplier','') or r.get('name','')): normalize_gstin(r.get('gstin','')) for r in gov}
    results = []
    for r in books:
        name = normalize_name(r.get('party','') or r.get('supplier','') or r.get('name',''))
        g_books = normalize_gstin(r.get('gstin',''))
        if not name or not gov_names:
            continue
        match = process.extractOne(name, gov_names, scorer=fuzz.token_set_ratio)
        if match:
            matched_name, score, _ = match
            gstin_gov = gov_map.get(matched_name, '')
            if score >= threshold and gstin_gov and gstin_gov != g_books:
                results.append({
                    'party': r.get('party') or r.get('supplier') or r.get('name'),
                    'name_norm': name,
                    'gstin_books': g_books,
                    'gstin_gov': gstin_gov,
                    'score': score
                })
    return results


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--root', default='.', help='repo root to scan for sample tags')
    p.add_argument('--books', help='CSV file with books invoices (party, gstin, ... )')
    p.add_argument('--gov', help='CSV file with govt/2B supplier list (party, gstin, ... )')
    p.add_argument('--extract-sample', action='store_true', help='extract sample pairs from repo into sample CSVs')
    p.add_argument('--threshold', type=int, default=85, help='fuzzy match threshold')
    args = p.parse_args()

    if args.extract_sample:
        pairs = extract_from_files(args.root)
        if not pairs:
            print('No sample pairs found in repo files.')
            return
        # write both books and gov as the same sample for demonstration
        sample_books = os.path.join('outputs','sample_books.csv')
        sample_gov = os.path.join('outputs','sample_gov.csv')
        write_csv(sample_books, pairs, fieldnames=['party','gstin'])
        write_csv(sample_gov, pairs, fieldnames=['party','gstin'])
        print(f'Wrote {len(pairs)} sample pairs to {sample_books} and {sample_gov}')
        return

    if not args.books or not args.gov:
        print('Provide --books and --gov CSV files, or run --extract-sample first.')
        return

    books = read_csv(args.books)
    gov = read_csv(args.gov)

    dup = detect_duplicates_in_books(books)
    wrong = find_wrong_gstin(books, gov, threshold=args.threshold)

    write_csv('outputs/duplicates_in_books.csv', dup, fieldnames=['gstin','party_names'])
    write_csv('outputs/wrong_gstin.csv', wrong, fieldnames=['party','name_norm','gstin_books','gstin_gov','score'])

    print(f'Duplicates found: {len(dup)}')
    print(f'Wrong-GSTIN candidates: {len(wrong)}')

if __name__ == '__main__':
    main()
