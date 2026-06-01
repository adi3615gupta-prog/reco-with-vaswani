import * as XLSX from "xlsx";
import XLSXStyle from "xlsx-js-style";

export interface ParsedFile {
  headers: string[];
  data: Record<string, unknown>[];
  fileName: string;
}

export interface ColumnMapping {
  date: string;
  invoiceNo: string;
  invoiceValue: string;
  taxable: string[];
  cgst: string[];
  sgst: string[];
  igst: string[];
}

export interface ProcessedRow {
  date: string;
  invoiceNo: string;
  partyName: string;
  gstNo: string;
  totalTaxable: number;
  totalCGST: number;
  totalSGST: number;
  totalIGST: number;
  invoiceValue: number;
}

export function parseFile(file: File): Promise<ParsedFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array", cellDates: false });
        const all: Record<string, unknown>[] = [];
        const headerSet: string[] = [];
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
            defval: "",
            raw: true,
          });
          for (const row of json) {
            for (const k of Object.keys(row)) {
              if (!headerSet.includes(k)) headerSet.push(k);
            }
            all.push(row);
          }
        }

        if (!all.length) {
          reject(new Error("The file contains no data rows."));
          return;
        }

        resolve({ headers: headerSet, data: all, fileName: file.name });
      } catch {
        reject(new Error("Could not parse the file. Please upload a valid Excel or CSV file."));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read the file."));
    reader.readAsArrayBuffer(file);
  });
}

export async function parseFiles(files: File[]): Promise<ParsedFile> {
  const parsed = await Promise.all(files.map(parseFile));
  const headerSet: string[] = [];
  const data: Record<string, unknown>[] = [];
  for (const p of parsed) {
    for (const h of p.headers) {
      if (!headerSet.includes(h)) headerSet.push(h);
    }
    data.push(...p.data);
  }
  const fileName =
    files.length === 1
      ? files[0].name
      : `Consolidated_${files.length}_files`;
  return { headers: headerSet, data, fileName };
}

const findFirst = (headers: string[], keywords: string[]): string => {
  const lower = headers.map((h) => h.toLowerCase());
  for (const kw of keywords) {
    const idx = lower.findIndex((h) => h.includes(kw.toLowerCase()));
    if (idx !== -1) return headers[idx];
  }
  return "";
};

const findAll = (headers: string[], keywords: string[]): string[] => {
  return headers.filter((h) => {
    const lower = h.toLowerCase();
    return keywords.some((kw) => lower.includes(kw.toLowerCase()));
  });
};

export function autoMapColumns(headers: string[]): ColumnMapping {
  const safeHeaders = Array.isArray(headers) ? headers : [];
  return {
    date: findFirst(safeHeaders, ["date"]),
    invoiceNo: findFirst(safeHeaders, ["voucher no", "invoice no", "ref no", "voucher", "invoice", "ref"]),
    invoiceValue: findFirst(safeHeaders, ["gross total", "invoice value", "total amount", "grand total", "total", "gross", "value"]),
    taxable: findAll(safeHeaders, ["purchase", "taxable", "assessable"]),
    cgst: findAll(safeHeaders, ["cgst"]),
    sgst: findAll(safeHeaders, ["sgst"]),
    igst: findAll(safeHeaders, ["igst"]),
  };
}

function toNumber(val: unknown): number {
  if (val === null || val === undefined || val === "") return 0;
  const n = Number(String(val).replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

function parseDateString(dateStr: string): Date | null {
  if (!dateStr) return null;

  const dmy = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    let [, d, m, y] = dmy;
    let yearNum = parseInt(y, 10);
    if (yearNum < 100) yearNum += 2000;

    const dayNum = parseInt(d, 10);
    const monthNum = parseInt(m, 10);
    if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) return null;

    const result = new Date(Date.UTC(yearNum, monthNum - 1, dayNum));
    if (result.getUTCDate() !== dayNum || result.getUTCMonth() !== monthNum - 1) return null;
    return result;
  }

  const iso = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const result = new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
    if (result.getUTCDate() !== +iso[3] || result.getUTCMonth() !== +iso[2] - 1) return null;
    return result;
  }

  return null;
}

function formatUtcDate(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const year = date.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

function formatDate(val: unknown): string {
  if (val === null || val === undefined || val === "") return "";
  if (typeof val === "number") return XLSX.SSF.format("dd/mm/yyyy", val);
  if (typeof val === "string") {
    const parsed = parseDateString(val.trim());
    return parsed ? formatUtcDate(parsed) : val;
  }
  if (val instanceof Date) {
    return formatUtcDate(new Date(Date.UTC(val.getFullYear(), val.getMonth(), val.getDate())));
  }
  return String(val);
}

export function processData(
  data: Record<string, unknown>[],
  mapping: ColumnMapping
): ProcessedRow[] {
  const safeMapping: ColumnMapping = {
    date: mapping?.date ?? "",
    invoiceNo: mapping?.invoiceNo ?? "",
    invoiceValue: mapping?.invoiceValue ?? "",
    taxable: Array.isArray(mapping?.taxable) ? mapping.taxable : [],
    cgst: Array.isArray(mapping?.cgst) ? mapping.cgst : [],
    sgst: Array.isArray(mapping?.sgst) ? mapping.sgst : [],
    igst: Array.isArray(mapping?.igst) ? mapping.igst : [],
  };

  return data.map((row) => ({
    date: safeMapping.date ? formatDate(row[safeMapping.date]) : "",
    invoiceNo: safeMapping.invoiceNo ? String(row[safeMapping.invoiceNo] ?? "") : "",
    partyName: String(row["Particulars"] ?? row["particulars"] ?? ""),
    gstNo: String(row["GSTIN/UIN"] ?? row["gstin/uin"] ?? row["GSTIN"] ?? ""),
    totalTaxable: safeMapping.taxable.reduce((sum, col) => sum + toNumber(row[col]), 0),
    totalCGST: safeMapping.cgst.reduce((sum, col) => sum + toNumber(row[col]), 0),
    totalSGST: safeMapping.sgst.reduce((sum, col) => sum + toNumber(row[col]), 0),
    totalIGST: safeMapping.igst.reduce((sum, col) => sum + toNumber(row[col]), 0),
    invoiceValue: safeMapping.invoiceValue ? toNumber(row[safeMapping.invoiceValue]) : 0,
  }));
}

export interface ReportCompanyInfo {
  name: string;
}

export function exportToExcel(
  rows: ProcessedRow[],
  fileName: string,
  company: ReportCompanyInfo
) {
  const headers = [
    "S.No.",
    "Invoice Date",
    "Invoice No.",
    "Party Name",
    "GST No.",
    "Total Purchase/Taxable Value",
    "Total CGST",
    "Total SGST",
    "Total IGST",
    "Invoice Value / Gross Total",
  ];

  const aoa: (string | number)[][] = [headers];
  rows.forEach((r, i) => {
    aoa.push([
      i + 1,
      r.date,
      r.invoiceNo,
      r.partyName,
      r.gstNo,
      r.totalTaxable,
      r.totalCGST,
      r.totalSGST,
      r.totalIGST,
      r.invoiceValue,
    ]);
  });

  const ws = XLSXStyle.utils.aoa_to_sheet(aoa);

  const lastCol = headers.length - 1;
  const headerRowIdx = 1; // 1-based
  const firstDataRow = headerRowIdx + 1;
  const lastDataRow = firstDataRow + rows.length - 1;

  ws["!cols"] = [
    { wch: 6 },
    { wch: 13 },
    { wch: 16 },
    { wch: 32 },
    { wch: 20 },
    { wch: 20 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 20 },
  ];

  ws["!freeze"] = { xSplit: 0, ySplit: headerRowIdx };

  const border = {
    top: { style: "thin", color: { rgb: "D0D7DE" } },
    bottom: { style: "thin", color: { rgb: "D0D7DE" } },
    left: { style: "thin", color: { rgb: "D0D7DE" } },
    right: { style: "thin", color: { rgb: "D0D7DE" } },
  };

  ws["!rows"] = [{ hpt: 26 }];

  // Header row
  for (let c = 0; c <= lastCol; c++) {
    const addr = XLSXStyle.utils.encode_cell({ r: headerRowIdx - 1, c });
    if (!ws[addr]) ws[addr] = { t: "s", v: headers[c] };
    ws[addr].s = {
      font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11, name: "Calibri" },
      fill: { fgColor: { rgb: "2563EB" } },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border,
    };
  }

  const numFmt = '_-₹* #,##0.00_-;[Red]_-₹* (#,##0.00);_-₹* "-"??_-;_-@_-';
  const numericCols = new Set([5, 6, 7, 8, 9]);

  // Data rows
  for (let r = firstDataRow - 1; r <= lastDataRow - 1; r++) {
    const isAlt = (r - (firstDataRow - 1)) % 2 === 1;
    const fillColor = isAlt ? "F8FAFC" : "FFFFFF";
    for (let c = 0; c <= lastCol; c++) {
      const addr = XLSXStyle.utils.encode_cell({ r, c });
      if (!ws[addr]) ws[addr] = { t: "s", v: "" };
      const isNum = numericCols.has(c);
      const isInvoiceValue = c === lastCol;
      ws[addr].s = {
        font: {
          name: "Calibri",
          sz: 10,
          bold: isInvoiceValue,
          color: { rgb: isInvoiceValue ? "0F172A" : "1F2937" },
        },
        fill: { fgColor: { rgb: fillColor } },
        alignment: {
          horizontal: c === 0 ? "center" : isNum ? "right" : "left",
          vertical: "center",
        },
        border,
        ...(isNum ? { numFmt } : {}),
      };
      if (isNum && typeof ws[addr].v === "number") {
        ws[addr].t = "n";
        ws[addr].z = numFmt;
      }
    }
  }

  const wb = XLSXStyle.utils.book_new();
  XLSXStyle.utils.book_append_sheet(wb, ws, "GST Report");

  // Sheet 2 — Report Details (company info only, no grand totals)
  const generatedOn = new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const detailsAoa: (string | number)[][] = [
    ["GST Consolidated Purchase Report"],
    [`Generated on ${generatedOn}`],
    [],
    ["Company Details"],
    ["Company Name", company.name || "—"],
    ["Total Records", rows.length],
  ];

  const ws2 = XLSXStyle.utils.aoa_to_sheet(detailsAoa);
  ws2["!cols"] = [{ wch: 36 }, { wch: 40 }];
  ws2["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 1 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: 1 } },
  ];
  ws2["!rows"] = [{ hpt: 30 }, { hpt: 18 }];

  const labelStyle = {
    font: { bold: true, color: { rgb: "1F2937" }, sz: 11, name: "Calibri" },
    fill: { fgColor: { rgb: "F1F5F9" } },
    alignment: { horizontal: "left" as const, vertical: "center" as const },
    border,
  };
  const valueStyle = {
    font: { color: { rgb: "0F172A" }, sz: 11, name: "Calibri" },
    alignment: { horizontal: "left" as const, vertical: "center" as const },
    border,
  };
  const sectionStyle = {
    font: { bold: true, color: { rgb: "FFFFFF" }, sz: 12, name: "Calibri" },
    fill: { fgColor: { rgb: "2563EB" } },
    alignment: { horizontal: "left" as const, vertical: "center" as const },
  };

  if (ws2["A1"]) {
    ws2["A1"].s = {
      font: { bold: true, sz: 16, color: { rgb: "FFFFFF" }, name: "Calibri" },
      fill: { fgColor: { rgb: "1F2937" } },
      alignment: { horizontal: "center", vertical: "center" },
    };
  }
  if (ws2["A2"]) {
    ws2["A2"].s = {
      font: { italic: true, sz: 10, color: { rgb: "6B7280" }, name: "Calibri" },
      alignment: { horizontal: "center", vertical: "center" },
    };
  }
  if (ws2["A4"]) ws2["A4"].s = sectionStyle;

  const detailRows = [4, 5]; // 0-based
  for (const r of detailRows) {
    const labelAddr = XLSXStyle.utils.encode_cell({ r, c: 0 });
    const valueAddr = XLSXStyle.utils.encode_cell({ r, c: 1 });
    if (ws2[labelAddr]) ws2[labelAddr].s = labelStyle;
    if (ws2[valueAddr]) ws2[valueAddr].s = valueStyle;
  }

  XLSXStyle.utils.book_append_sheet(wb, ws2, "Report Details");

  XLSXStyle.writeFile(wb, fileName);
}
