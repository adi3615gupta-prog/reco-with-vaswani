import { useState, useEffect, useMemo } from "react";
import { Search, X, ChevronDown } from "lucide-react";
import { autoMapColumns, type ColumnMapping } from "@/lib/gst-processor";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ColumnMapperProps {
  headers: string[];
  onConfirm: (mapping: ColumnMapping, category: string) => void;
  onBack: () => void;
}

const TAX_TYPES = [
  { key: "taxable" as const, label: "Purchase / Taxable Value Ledgers", color: "bg-purple-500" },
  { key: "cgst" as const, label: "CGST Ledgers", color: "bg-blue-500" },
  { key: "sgst" as const, label: "SGST Ledgers", color: "bg-emerald-500" },
  { key: "igst" as const, label: "IGST Ledgers", color: "bg-amber-500" },
];

const SINGLE_FIELDS = [
  { key: "date" as const, label: "Invoice Date" },
  { key: "invoiceNo" as const, label: "Invoice No." },
  { key: "partyName" as const, label: "Party Name" },
  { key: "gstNo" as const, label: "GST No." },
  { key: "invoiceValue" as const, label: "Invoice Value / Gross Total" },
];

function MultiSelect({
  label,
  color,
  options,
  selected,
  onChange,
}: {
  label: string;
  color: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(
    () =>
      options.filter((o) =>
        o.toLowerCase().includes(search.toLowerCase())
      ),
    [options, search]
  );

  const toggle = (col: string) => {
    onChange(
      selected.includes(col)
        ? selected.filter((s) => s !== col)
        : [...selected, col]
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
        <span className="text-sm font-semibold text-foreground">{label}</span>
        <span className="text-xs text-muted-foreground ml-auto">
          {selected.length} selected
        </span>
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="w-full flex items-center justify-between border rounded-lg px-3 py-2.5 text-sm bg-card hover:border-primary/50 transition-colors"
        >
          <span className="text-muted-foreground truncate">
            {selected.length
              ? selected.slice(0, 2).join(", ") +
                (selected.length > 2 ? ` +${selected.length - 2} more` : "")
              : "Select columns…"}
          </span>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        {open && (
          <div className="absolute z-20 mt-1 w-full bg-card border rounded-lg shadow-xl max-h-64 overflow-hidden">
            <div className="p-2 border-b">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search columns…"
                  className="w-full pl-8 pr-3 py-2 text-sm bg-background rounded-md border-0 outline-none focus:ring-1 ring-primary"
                />
              </div>
            </div>
            <div className="overflow-y-auto max-h-48 p-1">
              {filtered.length === 0 && (
                <p className="text-xs text-muted-foreground p-3 text-center">
                  No matching columns
                </p>
              )}
              {filtered.map((col) => (
                <label
                  key={col}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-muted cursor-pointer text-sm"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(col)}
                    onChange={() => toggle(col)}
                    className="rounded border-border text-primary focus:ring-primary"
                  />
                  <span className="truncate">{col}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {selected.map((col) => (
            <span
              key={col}
              className="inline-flex items-center gap-1 bg-secondary text-secondary-foreground rounded-md px-2 py-1 text-xs"
            >
              {col}
              <button onClick={() => toggle(col)} className="hover:text-destructive">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function ColumnMapper({ headers, onConfirm, onBack }: ColumnMapperProps) {
  const safeHeaders = Array.isArray(headers) ? headers : [];
  const [category, setCategory] = useState<string>("PR");
  const [mapping, setMapping] = useState<ColumnMapping>({
    date: "",
    invoiceNo: "",
    partyName: "",
    gstNo: "",
    invoiceValue: "",
    taxable: [],
    cgst: [],
    sgst: [],
    igst: [],
  });

  useEffect(() => {
    const autoMapped = autoMapColumns(safeHeaders) as any;
    
    // Fallback auto-detection in case the backend processor is outdated
    const findFirst = (headers: string[], keywords: string[]) => {
      const lower = headers.map((h) => h.toLowerCase());
      for (const kw of keywords) {
        const idx = lower.findIndex((h) => h.includes(kw.toLowerCase()));
        if (idx !== -1) return headers[idx];
      }
      return "";
    };

    setMapping({
      ...autoMapped,
      partyName: autoMapped.partyName || findFirst(safeHeaders, ["party name", "particulars", "supplier", "customer", "party", "name", "billed to"]),
      gstNo: autoMapped.gstNo || findFirst(safeHeaders, ["gstin/uin", "gstin", "gst no", "gst", "gstin number", "uin"]),
    });
  }, [safeHeaders]);

  const totalSelected =
    (mapping.taxable?.length ?? 0) +
    (mapping.cgst?.length ?? 0) +
    (mapping.sgst?.length ?? 0) +
    (mapping.igst?.length ?? 0);

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      {/* File Category Selection */}
      <div className="bg-card rounded-2xl border p-6 space-y-5 shadow-sm border-blue-500/30 bg-blue-500/5">
        <div>
          <h3 className="text-lg font-semibold text-blue-600 dark:text-blue-400">1. File Category</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Select what type of data this specific file contains. This ensures it routes to the correct tab in Reconciliation.
          </p>
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="bg-background">
            <SelectValue placeholder="Select Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="PR">Purchase / Sales Register (Primary Source)</SelectItem>
            <SelectItem value="JOURNAL">Journal Voucher (Secondary Source)</SelectItem>
            <SelectItem value="2B">Govt Portal Data (GSTR-2B / GSTR-1)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Single-column mapping */}
      <div className="bg-card rounded-2xl border p-6 space-y-5">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Map Invoice Fields</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Choose which column from your file represents each core invoice detail.
          </p>
        </div>

        {SINGLE_FIELDS.map(({ key, label }) => (
          <div key={key} className="space-y-2">
            <label className="text-sm font-semibold text-foreground">{label}</label>
            <Select
              value={mapping[key] || undefined}
              onValueChange={(v) => setMapping((prev) => ({ ...prev, [key]: v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select column…" />
              </SelectTrigger>
              <SelectContent>
                {safeHeaders.map((h) => (
                  <SelectItem key={h} value={h}>
                    {h}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      {/* Multi-select ledgers */}
      <div className="bg-card rounded-2xl border p-6 space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Map Tax & Value Ledgers</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Columns containing relevant keywords have been auto-detected. Adjust as needed.
          </p>
        </div>

        {TAX_TYPES.map(({ key, label, color }) => (
          <MultiSelect
            key={key}
            label={label}
            color={color}
            options={safeHeaders}
            selected={mapping[key] ?? []}
            onChange={(v) => setMapping((prev) => ({ ...prev, [key]: v }))}
          />
        ))}
      </div>

      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button
          onClick={() => onConfirm(mapping, category)}
          disabled={totalSelected === 0}
        >
          Process {totalSelected} ledger column{totalSelected !== 1 ? "s" : ""}
        </Button>
      </div>
    </div>
  );
}
