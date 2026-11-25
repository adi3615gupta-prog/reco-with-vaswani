import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Save, KeyRound, Coins, FileText, CheckCircle2, ChevronDown } from 'lucide-react';
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

type ChannelDef = {
  id: 'keys' | 'tax' | 'meta';
  title: string;
  badge: string;
  icon: typeof KeyRound;
  collapsible?: boolean;
  fields: (keyof ColumnMapping)[];
};

// Field grouping per the pipeline redesign plan. Any field not listed here falls into the metadata channel.
const CHANNELS: ChannelDef[] = [
  {
    id: 'keys',
    title: 'Channel 1 · Mandatory Audit Keys',
    badge: 'Section 16(2)(aa) Mandatory Keys',
    icon: KeyRound,
    fields: ['supplierName', 'gstin', 'invoiceNo', 'invoiceDate'],
  },
  {
    id: 'tax',
    title: 'Channel 2 · Tax & Valuation Stream',
    badge: 'Numeric Reconciler Stream',
    icon: Coins,
    fields: ['taxableValue', 'igst', 'cgst', 'sgst'],
  },
  {
    id: 'meta',
    title: 'Channel 3 · Statutory & Return Metadata',
    badge: 'Optional',
    icon: FileText,
    collapsible: true,
    fields: ['pos', 'returnPeriod', 'nilRated', 'nonTaxable', 'filingStatus', 'filingDate'],
  },
];

const isSet = (v: unknown) => v !== undefined && v !== null && v !== '' && v !== '__none__';

export function ColumnMapper({ title, headers, mapping, onChange, labelOverrides, requireTaxable, visibleFields, onSaveDefault }: ColumnMapperProps) {
  const [metaOpen, setMetaOpen] = useState(true);

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

  // Assign visible fields to channels; anything not in a channel goes to the last (metadata) channel.
  const knownFields = new Set(CHANNELS.flatMap(c => c.fields));
  const strayFields = filteredFields.filter(f => !knownFields.has(f));
  const groups = CHANNELS.map(c => ({
    ...c,
    fields: [
      ...c.fields.filter(f => filteredFields.includes(f)),
      ...(c.id === 'meta' ? strayFields : []),
    ],
  })).filter(c => c.fields.length > 0);

  const renderField = (field: keyof ColumnMapping) => {
    const mapped = isSet(mapping[field]);
    const isRequired = required.includes(field);
    return (
      <div
        key={field}
        className={
          'rounded-xl border p-2 transition-all duration-300 ' +
          (mapped
            ? 'bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-emerald-500/5 border-emerald-400/50 shadow-[0_0_16px_rgba(16,185,129,0.10)]'
            : 'border-slate-200/80 bg-white/60')
        }
      >
        <div className="flex items-center justify-between gap-2 mb-1">
          <label className="text-[11px] font-bold text-slate-600 block uppercase tracking-wider">
            {labelFor(field)}
            {isRequired && <span className="text-rose-500 ml-0.5">*</span>}
          </label>
          {mapped ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 whitespace-nowrap">
              <CheckCircle2 className="w-3 h-3" /> Mapped
            </span>
          ) : isRequired ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Missing
            </span>
          ) : null}
        </div>
        <Select
          value={mapping[field] || ''}
          onValueChange={(val) => onChange({ ...mapping, [field]: val })}
        >
          <SelectTrigger
            className={
              'h-9 text-xs text-slate-900 rounded-xl shadow-2xs font-medium transition-colors duration-300 ' +
              (mapped
                ? 'border-emerald-400 bg-white hover:bg-white focus:bg-white focus:border-emerald-500'
                : 'bg-slate-50 hover:bg-white focus:bg-white border-slate-200 focus:border-indigo-500')
            }
          >
            <SelectValue placeholder="Select column" />
          </SelectTrigger>
          <SelectContent className="bg-white border-slate-200 text-slate-900 shadow-xl rounded-xl">
            <SelectItem value="__none__" className="focus:bg-indigo-50 focus:text-indigo-900 cursor-pointer font-medium text-slate-500">— None —</SelectItem>
            {(headers || []).map((h, idx) => (
              <SelectItem key={`${h || 'col'}_${idx}`} value={h || `__col_${idx}__`} className="focus:bg-indigo-50 focus:text-indigo-900 cursor-pointer font-medium">
                {h || `(Column ${idx + 1})`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  };

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
      <CardContent className="space-y-5">
        {groups.map((group) => {
          const Icon = group.icon;
          const mappedCount = group.fields.filter(f => isSet(mapping[f])).length;
          const isOpen = group.collapsible ? metaOpen : true;
          const countBadge = (
            <span className={'text-[10px] font-bold px-2 py-0.5 rounded-full border ' +
              (mappedCount === group.fields.length
                ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                : 'text-slate-600 bg-slate-50 border-slate-200')}>
              {mappedCount} of {group.fields.length} mapped
            </span>
          );

          return (
            <section key={group.id} className="space-y-2">
              {group.collapsible ? (
                <button
                  type="button"
                  onClick={() => setMetaOpen(o => !o)}
                  aria-expanded={isOpen}
                  className="w-full flex items-center justify-between gap-2 pb-1 border-b border-slate-200 text-left cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Icon className="w-3.5 h-3.5 text-slate-500" />
                    <span className="text-[11px] font-extrabold text-slate-800 uppercase tracking-widest">{group.title}</span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden sm:inline">· {group.badge}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {countBadge}
                    <ChevronDown className={'w-4 h-4 text-slate-500 transition-transform duration-200 ' + (isOpen ? 'rotate-180' : '')} />
                  </span>
                </button>
              ) : (
                <div className="flex items-center justify-between gap-2 pb-1 border-b border-slate-200">
                  <span className="flex items-center gap-2">
                    <Icon className="w-3.5 h-3.5 text-indigo-600" />
                    <span className="text-[11px] font-extrabold text-slate-800 uppercase tracking-widest">{group.title}</span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden sm:inline">· {group.badge}</span>
                  </span>
                  {countBadge}
                </div>
              )}
              {isOpen && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
                  {group.fields.map(renderField)}
                </div>
              )}
            </section>
          );
        })}
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
