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
        <CardTitle className="text-base font-bold text-slate-900">{title}</CardTitle>
        {onSaveDefault && (
          <Button variant="outline" size="sm" onClick={onSaveDefault} className="h-8 bg-white text-slate-700 hover:text-slate-900 border-slate-200 hover:bg-slate-50 font-semibold shadow-2xs rounded-lg">
            <Save className="w-3.5 h-3.5 mr-1.5 text-indigo-600" />
            Save as Default
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredFields.map((field) => (
            <div key={field}>
              <label className="text-[11px] font-bold text-slate-600 mb-1 block uppercase tracking-wider">
                {labelFor(field)}
                {required.includes(field) && <span className="text-rose-500 ml-0.5">*</span>}
              </label>
              <Select
                value={mapping[field] || ''}
                onValueChange={(val) => onChange({ ...mapping, [field]: val })}
              >
                <SelectTrigger className="h-9 text-xs bg-slate-50 hover:bg-white focus:bg-white border-slate-200 focus:border-indigo-500 text-slate-900 rounded-xl shadow-2xs font-medium">
                  <SelectValue placeholder="Select column" />
                </SelectTrigger>
                <SelectContent className="bg-white border-slate-200 text-slate-900 shadow-xl rounded-xl">
                  <SelectItem value="__none__" className="focus:bg-indigo-50 focus:text-indigo-900 cursor-pointer font-medium text-slate-500">— None —</SelectItem>
                  {(headers || []).map((h) => (
                    <SelectItem key={h} value={h} className="focus:bg-indigo-50 focus:text-indigo-900 cursor-pointer font-medium">{h}</SelectItem>
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

export function isMappingComplete(mapping: Partial<ColumnMapping>, requireTaxable = false, docType?: string): mapping is ColumnMapping {
  if (!mapping) return false;
  let required: (keyof ColumnMapping)[] = requireTaxable
    ? ['gstin', 'invoiceNo', 'taxableValue']
    : ['gstin', 'invoiceNo'];

  if (docType === 'nil') {
    required = ['nilRated'];
  } else if (docType === 'b2c') {
    required = ['taxableValue'];
  }

  return required.every((f) => mapping[f] !== undefined && mapping[f] !== '' && mapping[f] !== '__none__');
}
