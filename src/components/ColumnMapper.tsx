import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ColumnMapping } from '@/lib/fileParser';

interface ColumnMapperProps {
  title: string;
  headers: string[];
  mapping: Partial<ColumnMapping>;
  onChange: (mapping: Partial<ColumnMapping>) => void;
  labelOverrides?: Partial<Record<keyof ColumnMapping, string>>;
}

const FIELD_LABELS: Record<keyof ColumnMapping, string> = {
  supplierName: 'Supplier Name',
  gstin: 'GSTIN',
  invoiceNo: 'Invoice Number',
  invoiceDate: 'Invoice Date',
  igst: 'IGST',
  cgst: 'CGST',
  sgst: 'SGST',
  taxableValue: 'Taxable Value (optional)',
  filingStatus: 'GSTR-1 Status (optional)',
  filingDate: 'Filing Date (optional)',
};

const REQUIRED_FIELDS: (keyof ColumnMapping)[] = ['gstin', 'invoiceNo'];

export function ColumnMapper({ title, headers, mapping, onChange, labelOverrides }: ColumnMapperProps) {
  const labelFor = (f: keyof ColumnMapping) => labelOverrides?.[f] ?? FIELD_LABELS[f];
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
                {REQUIRED_FIELDS.includes(field) && <span className="text-destructive ml-0.5">*</span>}
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

export function isMappingComplete(mapping: Partial<ColumnMapping>): mapping is ColumnMapping {
  const required: (keyof ColumnMapping)[] = ['gstin', 'invoiceNo'];
  return required.every((f) => mapping[f] && mapping[f] !== '__none__');
}
