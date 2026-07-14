import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Save } from 'lucide-react';
import type { ColumnMapping } from '@/lib/fileParser';

interface ColumnMapperProps {
  title: string;
  headers: string[];
  mapping: Partial<ColumnMapping>;
  onChange: (mapping: Partial<ColumnMapping>) => void;
  labelOverrides?: Partial<Record<keyof ColumnMapping, string>>;
  requireTaxable?: boolean;
  visibleFields?: (keyof ColumnMapping)[];
  onSaveDefault?: () => void;
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
  nilRated: 'Nil Rated Value (optional)',
  nonTaxable: 'Non Taxable / Exempt (optional)',
  pos: 'Place of Supply (POS)',
  returnPeriod: 'Return Period (Month)',
  filingStatus: 'GSTR-1 Status (optional)',
  filingDate: 'Filing Date (optional)',
};

export function ColumnMapper({ title, headers, mapping, onChange, labelOverrides, requireTaxable, visibleFields, onSaveDefault }: ColumnMapperProps) {
  const required: (keyof ColumnMapping)[] = requireTaxable
    ? ['gstin', 'invoiceNo', 'taxableValue']
    : ['gstin', 'invoiceNo'];
  const baseLabel = (f: keyof ColumnMapping) => {
    if (f === 'taxableValue' && !requireTaxable) return 'Taxable Value (optional)';
    return FIELD_LABELS[f];
  };
  const labelFor = (f: keyof ColumnMapping) => labelOverrides?.[f] ?? baseLabel(f);
  
  const fields = (Object.keys(FIELD_LABELS) as (keyof ColumnMapping)[]);
  const filteredFields = visibleFields ? fields.filter(f => visibleFields.includes(f)) : fields;

  return (
    <Card className="bg-transparent border-0 shadow-none">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-base">{title}</CardTitle>
        {onSaveDefault && (
          <Button variant="outline" size="sm" onClick={onSaveDefault} className="h-8 bg-transparent text-white border-white/20 hover:bg-white/10 hover:text-white">
            <Save className="w-4 h-4 mr-2" />
            Save as Default
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredFields.map((field) => (
            <div key={field}>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                {labelFor(field)}
                {required.includes(field) && <span className="text-destructive ml-0.5">*</span>}
              </label>
              <Select
                value={mapping[field] || ''}
                onValueChange={(val) => onChange({ ...mapping, [field]: val })}
              >
                <SelectTrigger className="h-8 text-xs bg-black/40 border-white/10 text-white">
                  <SelectValue placeholder="Select column" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-white/10 text-white">
                  <SelectItem value="__none__" className="focus:bg-slate-800 focus:text-white cursor-pointer">— None —</SelectItem>
                  {headers.map((h) => (
                    <SelectItem key={h} value={h} className="focus:bg-slate-800 focus:text-white cursor-pointer">{h}</SelectItem>
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
