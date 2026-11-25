import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Trash2, Home, Info, AlertTriangle } from 'lucide-react';
import { HousePropertyRecord, PropertyType } from '@/lib/housePropertyTypes';
import { computeHouseProperty } from '@/lib/housePropertyEngine';
import { RegimeType, EntityType } from '@/lib/incomeTaxTypes';

interface HousePropertyDetailFormProps {
  isOpen: boolean;
  onClose: () => void;
  regime: RegimeType;
  entityType: EntityType;
  onSave: (computed: any, raw: HousePropertyRecord[]) => void;
  initialData?: HousePropertyRecord[];
}

export default function HousePropertyDetailForm({
  isOpen,
  onClose,
  regime,
  entityType,
  onSave,
  initialData
}: HousePropertyDetailFormProps) {
  const [properties, setProperties] = useState<HousePropertyRecord[]>(initialData || [
    {
      id: 'Property 1',
      type: PropertyType.SOP,
      ownershipShare: 100,
      municipalValue: 0,
      fairRent: 0,
      standardRent: 0,
      actualRentReceived: 0,
      unrealizedRent: 0,
      vacancyMonths: 0,
      municipalTaxesPaid: 0,
      interestOnLoan: 0,
      preConstructionInterest: 0,
      loanTakenDate: '2020-01-01',
      loanPurpose: 'PURCHASE_CONSTRUCTION'
    }
  ]);

  const addProperty = () => {
    const nextNum = properties.length + 1;
    setProperties(prev => [
      ...prev,
      {
        id: `Property ${nextNum}`,
        type: PropertyType.LOP,
        ownershipShare: 100,
        municipalValue: 0,
        fairRent: 0,
        standardRent: 0,
        actualRentReceived: 0,
        unrealizedRent: 0,
        vacancyMonths: 0,
        municipalTaxesPaid: 0,
        interestOnLoan: 0,
        preConstructionInterest: 0,
        loanTakenDate: '2020-01-01',
        loanPurpose: 'PURCHASE_CONSTRUCTION'
      }
    ]);
  };

  const removeProperty = (index: number) => {
    setProperties(prev => prev.filter((_, idx) => idx !== index));
  };

  const updateProperty = (index: number, key: keyof HousePropertyRecord, value: any) => {
    setProperties(prev => prev.map((p, idx) => idx === index ? { ...p, [key]: value } : p));
  };

  const handleApply = () => {
    const result = computeHouseProperty(properties, entityType, regime);
    onSave(result, properties);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-[#141419] border-zinc-800 text-white max-w-5xl max-h-[90vh] flex flex-col p-6 rounded-2xl overflow-hidden">
        <DialogHeader className="border-b border-zinc-900 pb-4 flex flex-row items-center justify-between">
          <DialogTitle className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <Home className="w-5 h-5 text-blue-500" />
            House Property Portfolio & Deduction u/s 24
          </DialogTitle>
          <Button onClick={addProperty} className="bg-zinc-900 border border-zinc-850 hover:bg-zinc-800 text-xs px-3 h-8 rounded-lg flex items-center gap-1.5 mr-6 text-zinc-300">
            <Plus className="w-3.5 h-3.5" /> Add Property
          </Button>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 pr-2 py-4 space-y-6">
          {properties.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
              <Home className="w-12 h-12 mb-3 stroke-[1.2]" />
              <p className="text-sm">No properties in portfolio. Click "Add Property" to begin.</p>
            </div>
          ) : (
            properties.map((prop, index) => (
              <div key={index} className="bg-zinc-950/30 border border-zinc-800/80 p-5 rounded-2xl space-y-5 relative">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeProperty(index)}
                  className="absolute top-4 right-4 hover:bg-red-950/20 text-zinc-500 hover:text-red-400 rounded-lg h-8 w-8"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] text-zinc-400 uppercase font-semibold">Property ID / Name</Label>
                    <Input
                      type="text"
                      value={prop.id}
                      onChange={e => updateProperty(index, 'id', e.target.value)}
                      className="bg-zinc-950 border-zinc-800 text-sm h-9"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[10px] text-zinc-400 uppercase font-semibold">Property Type</Label>
                    <Select
                      value={prop.type}
                      onValueChange={v => updateProperty(index, 'type', v as PropertyType)}
                    >
                      <SelectTrigger className="bg-zinc-950 border-zinc-800 h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-800">
                        <SelectItem value={PropertyType.SOP}>Self Occupied (SOP)</SelectItem>
                        <SelectItem value={PropertyType.LOP}>Let Out (LOP)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[10px] text-zinc-400 uppercase font-semibold">Ownership Share (%)</Label>
                    <Input
                      type="number"
                      value={prop.ownershipShare}
                      onChange={e => updateProperty(index, 'ownershipShare', Number(e.target.value))}
                      className="bg-zinc-950 border-zinc-800 font-mono text-right text-sm h-9"
                      min="0"
                      max="100"
                    />
                  </div>
                </div>

                {prop.type === PropertyType.LOP ? (
                  <div className="border-t border-zinc-900/60 pt-4 space-y-4">
                    <h4 className="text-xs font-bold text-blue-400 uppercase tracking-wider">Gross Annual Value (GAV) Inputs</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="space-y-2">
                        <Label className="text-[10px] text-zinc-400">Municipal Value (Annual)</Label>
                        <Input
                          type="number"
                          value={prop.municipalValue || ''}
                          onChange={e => updateProperty(index, 'municipalValue', Number(e.target.value))}
                          className="bg-zinc-950 border-zinc-800 font-mono text-right text-sm h-9"
                          placeholder="0"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-[10px] text-zinc-400">Fair Rent (Annual)</Label>
                        <Input
                          type="number"
                          value={prop.fairRent || ''}
                          onChange={e => updateProperty(index, 'fairRent', Number(e.target.value))}
                          className="bg-zinc-950 border-zinc-800 font-mono text-right text-sm h-9"
                          placeholder="0"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-[10px] text-zinc-400">Standard Rent (Annual)</Label>
                        <Input
                          type="number"
                          value={prop.standardRent || ''}
                          onChange={e => updateProperty(index, 'standardRent', Number(e.target.value))}
                          className="bg-zinc-950 border-zinc-800 font-mono text-right text-sm h-9"
                          placeholder="0"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-[10px] text-zinc-400">Actual Rent Received</Label>
                        <Input
                          type="number"
                          value={prop.actualRentReceived || ''}
                          onChange={e => updateProperty(index, 'actualRentReceived', Number(e.target.value))}
                          className="bg-zinc-950 border-zinc-800 font-mono text-right text-sm h-9"
                          placeholder="0"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-[10px] text-zinc-400">Unrealized Rent</Label>
                        <Input
                          type="number"
                          value={prop.unrealizedRent || ''}
                          onChange={e => updateProperty(index, 'unrealizedRent', Number(e.target.value))}
                          className="bg-zinc-950 border-zinc-800 font-mono text-right text-sm h-9"
                          placeholder="0"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-[10px] text-zinc-400">Vacancy (In Months)</Label>
                        <Input
                          type="number"
                          value={prop.vacancyMonths || ''}
                          onChange={e => updateProperty(index, 'vacancyMonths', Number(e.target.value))}
                          className="bg-zinc-950 border-zinc-800 font-mono text-right text-sm h-9"
                          placeholder="0"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-[10px] text-zinc-400">Municipal Taxes Paid</Label>
                        <Input
                          type="number"
                          value={prop.municipalTaxesPaid || ''}
                          onChange={e => updateProperty(index, 'municipalTaxesPaid', Number(e.target.value))}
                          className="bg-zinc-950 border-zinc-800 font-mono text-right text-sm h-9"
                          placeholder="0"
                        />
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="border-t border-zinc-900/60 pt-4 space-y-4">
                  <h4 className="text-xs font-bold text-blue-400 uppercase tracking-wider">Interest on Loan & Sec 24(b) Inputs</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label className="text-[10px] text-zinc-400">Current Year Loan Interest</Label>
                      <Input
                        type="number"
                        value={prop.interestOnLoan || ''}
                        onChange={e => updateProperty(index, 'interestOnLoan', Number(e.target.value))}
                        className="bg-zinc-950 border-zinc-800 font-mono text-right text-sm h-9"
                        placeholder="0"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[10px] text-zinc-400">Pre-construction Interest</Label>
                      <Input
                        type="number"
                        value={prop.preConstructionInterest || ''}
                        onChange={e => updateProperty(index, 'preConstructionInterest', Number(e.target.value))}
                        className="bg-zinc-950 border-zinc-800 font-mono text-right text-sm h-9"
                        placeholder="0"
                      />
                    </div>

                    {prop.type === PropertyType.SOP ? (
                      <>
                        <div className="space-y-2">
                          <Label className="text-[10px] text-zinc-400">Loan Date</Label>
                          <Input
                            type="date"
                            value={prop.loanTakenDate}
                            onChange={e => updateProperty(index, 'loanTakenDate', e.target.value)}
                            className="bg-zinc-950 border-zinc-800 text-sm h-9 font-mono"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label className="text-[10px] text-zinc-400">Loan Purpose</Label>
                          <Select
                            value={prop.loanPurpose}
                            onValueChange={v => updateProperty(index, 'loanPurpose', v)}
                          >
                            <SelectTrigger className="bg-zinc-950 border-zinc-800 h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-zinc-800">
                              <SelectItem value="PURCHASE_CONSTRUCTION">Purchase / Construction</SelectItem>
                              <SelectItem value="REPAIR_RENEWAL">Repair / Renewal</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    ) : null}
                  </div>
                  {prop.type === PropertyType.SOP && regime === RegimeType.NEW ? (
                    <div className="flex items-center gap-2 text-amber-400 bg-amber-950/20 border border-amber-900/30 p-3 rounded-xl">
                      <AlertTriangle className="w-4 h-4" />
                      <p className="text-[10px]"><strong>Notice:</strong> Under the New Regime, interest on Self-Occupied Property is not allowed. This property's interest deduction will count as ₹0.</p>
                    </div>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>

        <DialogFooter className="border-t border-zinc-900 pt-4 flex gap-3">
          <Button variant="outline" onClick={onClose} className="border-zinc-800 text-zinc-400 hover:text-white rounded-xl">
            Cancel
          </Button>
          <Button onClick={handleApply} className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-6">
            Save & Apply calculations
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
