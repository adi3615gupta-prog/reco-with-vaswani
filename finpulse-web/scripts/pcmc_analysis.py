import os, json, sys
from pathlib import Path

# Ensure pyxlsb engine is available via pandas
try:
    import pandas as pd
except ImportError:
    print('pandas not installed', file=sys.stderr)
    sys.exit(1)

base_dir = Path(r'D:\My software\full and final\gst consolidater\reco-with-vaswani-main\public\Vipul Patel & Associates, PCMC')
report = {}

for file_path in base_dir.rglob('*.xlsb'):
    file_report = {}
    try:
        xl = pd.ExcelFile(file_path, engine='pyxlsb')
    except Exception as e:
        file_report['error'] = f'Failed to open with pyxlsb: {e}'
        report[file_path.name] = file_report
        continue
    sheet_names = xl.sheet_names
    file_report['sheets'] = {}
    for sheet in sheet_names:
        try:
            df = xl.parse(sheet)
        except Exception as e:
            file_report['sheets'][sheet] = {'error': f'Parse error: {e}'}
            continue
        # basic metadata
        rows, cols = df.shape
        col_names = list(df.columns)
        sample_rows = df.head(5).fillna('').to_dict(orient='records')
        # missing data
        missing_counts = df.isnull().sum().to_dict()
        # type consistency check per column
        type_issues = {}
        for col in df.columns:
            types = df[col].dropna().apply(lambda x: type(x).__name__).unique()
            if len(types) > 1:
                type_issues[col] = list(types)
        sheet_report = {
            'row_count': rows,
            'column_count': cols,
            'columns': col_names,
            'sample_rows': sample_rows,
            'missing_counts': missing_counts,
            'type_inconsistencies': type_issues,
        }
        file_report['sheets'][sheet] = sheet_report
    report[file_path.name] = file_report

# Output markdown report
md_lines = ['# PCMC Excel Files Deep Analysis', '']
for fname, fdata in report.items():
    md_lines.append(f'## File: `{fname}`')
    if 'error' in fdata:
        md_lines.append(f"*Error:* {fdata['error']}")
        md_lines.append('')
        continue
    for sheet, sdata in fdata['sheets'].items():
        md_lines.append(f'### Sheet: `{sheet}`')
        if 'error' in sdata:
            md_lines.append(f"*Error:* {sdata['error']}")
            md_lines.append('')
            continue
        md_lines.append(f"- Rows: {sdata['row_count']}, Columns: {sdata['column_count']}")
        md_lines.append(f"- Columns: `{', '.join([str(c) for c in sdata['columns']])}`")
        md_lines.append('#### Sample Rows (first 5)')
        md_lines.append('```json')
        md_lines.append(json.dumps(sdata['sample_rows'], indent=2, ensure_ascii=False))
        md_lines.append('```')
        md_lines.append('#### Missing Values Count')
        md_lines.append('```json')
        md_lines.append(json.dumps(sdata['missing_counts'], indent=2, ensure_ascii=False))
        md_lines.append('```')
        if sdata['type_inconsistencies']:
            md_lines.append('#### Type Inconsistencies')
            md_lines.append('```json')
            md_lines.append(json.dumps(sdata['type_inconsistencies'], indent=2, ensure_ascii=False))
            md_lines.append('```')
        else:
            md_lines.append('#### Type Inconsistencies: None')
        md_lines.append('')
    md_lines.append('')

report_path = Path(r'D:\My software\full and final\gst consolidater\reco-with-vaswani-main\public\Vipul Patel & Associates, PCMC\PCMC_Deep_Analysis_Report.md')
report_path.write_text('\n'.join(md_lines), encoding='utf-8')
print('Report generated at', report_path)
