import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ColumnMapping } from '@/lib/fileParser';

interface ColumnMapperProps {
  title: string;
  headers: string[];
  mapping: Partial<ColumnMapping>;
  onChange: (mapping: Partial<ColumnMapping>) => void;
  labelOverrides?: Partial<Record<keyof ColumnMapping, string>>;
  requireTaxable?: boolean;
}

const FIELD_LABELS: Record<keyof ColumnMapping, string> = {
  supplierName: 'Supplier Name',
  gstin: 'GSTIN',
  invoiceNo: 'Invoice Number',
  invoiceDate: 'Invoice Date',
  igst: 'IGST',
  cgst: 'CGST',
  sgst: 'SGST',
  taxableValue: 'Taxable Value',
  filingStatus: 'GSTR-1 Status (optional)',
  filingDate: 'Filing Date (optional)',
};

export function ColumnMapper({ title, headers, mapping, onChange, labelOverrides, requireTaxable }: ColumnMapperProps) {
  const required: (keyof ColumnMapping)[] = requireTaxable
    ? ['gstin', 'invoiceNo', 'taxableValue']
    : ['gstin', 'invoiceNo'];
  const baseLabel = (f: keyof ColumnMapping) => {
    if (f === 'taxableValue' && !requireTaxable) return 'Taxable Value (optional)';
    return FIELD_LABELS[f];
  };
  const labelFor = (f: keyof ColumnMapping) => labelOverrides?.[f] ?? baseLabel(f);
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(Object.keys(FIELD_LABELS) as (keyof ColumnMapping)[]).map((field) => (
            <div key={field}>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                {labelFor(field)}
                {required.includes(field) && <span className="text-destructive ml-0.5">*</span>}
              </label>
              <Select
                value={mapping[field] || ''}
                onValueChange={(val) => onChange({ ...mapping, [field]: val })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select column" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None —</SelectItem>
                  {headers.map((h) => (
                    <SelectItem key={h} value={h}>{h}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function isMappingComplete(mapping: Partial<ColumnMapping>, requireTaxable = false): mapping is ColumnMapping {
  const required: (keyof ColumnMapping)[] = requireTaxable
    ? ['gstin', 'invoiceNo', 'taxableValue']
    : ['gstin', 'invoiceNo'];
  return required.every((f) => mapping[f] && mapping[f] !== '__none__');
}
