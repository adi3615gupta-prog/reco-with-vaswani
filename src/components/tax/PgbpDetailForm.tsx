import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Trash2, ShieldCheck, HelpCircle } from 'lucide-react';
import { PresumptiveBusinessRecord, RegularBusinessRecord, AssetBlock, PgbpSection } from '@/lib/pgbpTypes';
import { computePGBP } from '@/lib/pgbpEngine';
import { RegimeType } from '@/lib/incomeTaxTypes';

interface PgbpDetailFormProps {
  isOpen: boolean;
  onClose: () => void;
  regime: RegimeType;
  onSave: (computed: any, presumptive: PresumptiveBusinessRecord[], regular: RegularBusinessRecord[]) => void;
  initialPresumptive?: PresumptiveBusinessRecord[];
  initialRegular?: RegularBusinessRecord[];
}

export default function PgbpDetailForm({
  isOpen,
  onClose,
  regime,
  onSave,
  initialPresumptive,
  initialRegular
}: PgbpDetailFormProps) {
  const [activeTab, setActiveTab] = useState<'presumptive' | 'regular'>('presumptive');

  // Presumptive Business Records State
  const [presumptive, setPresumptive] = useState<PresumptiveBusinessRecord[]>(initialPresumptive || [
    {
      id: 'Business 44AD',
      section: PgbpSection.SEC_44AD,
      totalTurnoverOrReceipts: 0,
      digitalTurnoverOrReceipts: 0,
      cashTurnoverOrReceipts: 0,
      heavyGoodsVehiclesMonths: 0,
      otherVehiclesMonths: 0,
      heavyVehiclesTonnage: [],
      declaredIncome: 0
    }
  ]);

  // Regular PGBP Records State
  const [regular, setRegular] = useState<RegularBusinessRecord[]>(initialRegular || [
    {
      id: 'Regular Business',
      netProfitAsPerBooks: 0,
      depreciationAsPerBooks: 0,
      incomeTaxPaidOrProvided: 0,
      personalExpensesDebited: 0,
      capitalExpenditureDebited: 0,
      cashPaymentsOver10k_40A3: 0,
      unpaidTaxesDutyCess_43B: 0,
      unpaidEmployerPF_43B: 0,
      delayedPaymentsToMSME_43B: 0,
      dividendIncomeCredited: 0,
      agriculturalIncomeCredited: 0,
      capitalGainsCredited: 0,
      housePropertyRentCredited: 0,
      incomeTaxRefundCredited: 0,
      badDebtsRecovered_41_4: 0,
      remissionOfTradingLiability_41_1: 0,
      assetBlocks: []
    }
  ]);

  const updatePresumptive = (index: number, key: keyof PresumptiveBusinessRecord, value: any) => {
    setPresumptive(prev => prev.map((p, idx) => idx === index ? { ...p, [key]: value } : p));
  };

  const addPresumptive = () => {
    setPresumptive(prev => [
      ...prev,
      {
        id: `Presumptive ${prev.length + 1}`,
        section: PgbpSection.SEC_44AD,
        totalTurnoverOrReceipts: 0,
        digitalTurnoverOrReceipts: 0,
        cashTurnoverOrReceipts: 0,
        heavyGoodsVehiclesMonths: 0,
        otherVehiclesMonths: 0,
        heavyVehiclesTonnage: [],
        declaredIncome: 0
      }
    ]);
  };

  const removePresumptive = (index: number) => {
    setPresumptive(prev => prev.filter((_, idx) => idx !== index));
  };

  const updateRegular = (index: number, key: keyof RegularBusinessRecord, value: any) => {
    setRegular(prev => prev.map((r, idx) => idx === index ? { ...r, [key]: value } : r));
  };

  const addAssetBlock = (regIdx: number) => {
    const defaultBlock: AssetBlock = {
      blockId: `Block P&M ${regular[regIdx].assetBlocks.length + 1}`,
      assetClass: 'PLANT_MACHINERY',
      depreciationRate: 15,
      openingWdv: 0,
      additionsMoreThan180Days: 0,
      additionsLessThan180Days: 0,
      moneysPayableFromSales: 0,
      isEligibleForAdditionalDepreciation: false
    };
    setRegular(prev => prev.map((r, idx) => idx === regIdx ? { ...r, assetBlocks: [...r.assetBlocks, defaultBlock] } : r));
  };

  const updateAssetBlock = (regIdx: number, blockIdx: number, key: keyof AssetBlock, value: any) => {
    setRegular(prev => prev.map((r, idx) => {
      if (idx !== regIdx) return r;
      const updatedBlocks = r.assetBlocks.map((b, bIdx) => bIdx === blockIdx ? { ...b, [key]: value } : b);
      return { ...r, assetBlocks: updatedBlocks };
    }));
  };

  const removeAssetBlock = (regIdx: number, blockIdx: number) => {
    setRegular(prev => prev.map((r, idx) => {
      if (idx !== regIdx) return r;
      return { ...r, assetBlocks: r.assetBlocks.filter((_, bIdx) => bIdx !== blockIdx) };
    }));
  };

  const handleApply = () => {
    const activePres = activeTab === 'presumptive' ? presumptive : [];
    const activeReg = activeTab === 'regular' ? regular : [];
    const result = computePGBP(activePres, activeReg, regime);
    onSave(result, activePres, activeReg);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-[#141419] border-zinc-800 text-white max-w-5xl max-h-[90vh] flex flex-col p-6 rounded-2xl overflow-hidden">
        <DialogHeader className="border-b border-zinc-900 pb-4 flex flex-row items-center justify-between">
          <DialogTitle className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-500" />
            Profits and Gains of Business or Profession (PGBP)
          </DialogTitle>
          <div className="flex items-center gap-3 mr-6">
            <Tabs value={activeTab} onValueChange={v => setActiveTab(v as any)} className="w-fit">
              <TabsList className="bg-zinc-950 border border-zinc-800 p-0.5 rounded-lg h-9">
                <TabsTrigger value="presumptive" className="text-xs h-8 rounded-md">Presumptive (44AD/A/E)</TabsTrigger>
                <TabsTrigger value="regular" className="text-xs h-8 rounded-md">Regular P&L Adjustments</TabsTrigger>
              </TabsList>
            </Tabs>
            {activeTab === 'presumptive' && (
              <Button onClick={addPresumptive} className="bg-zinc-900 border border-zinc-850 hover:bg-zinc-800 text-xs px-3 h-8 rounded-lg flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Add
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 pr-2 py-4 space-y-6">
          {/* PRESUMPTIVE TAB */}
          {activeTab === 'presumptive' ? (
            presumptive.length === 0 ? (
              <p className="text-zinc-500 text-center py-12">No presumptive business. Click "Add" above.</p>
            ) : (
              presumptive.map((p, idx) => (
                <div key={idx} className="bg-zinc-950/30 border border-zinc-800/80 p-5 rounded-2xl space-y-4 relative">
                  <Button variant="ghost" size="icon" onClick={() => removePresumptive(idx)} className="absolute top-4 right-4 text-zinc-500 hover:text-red-400">
                    <Trash2 className="w-4 h-4" />
                  </Button>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label className="text-[10px] text-zinc-400 uppercase font-semibold">Business ID</Label>
                      <Input
                        type="text"
                        value={p.id}
                        onChange={e => updatePresumptive(idx, 'id', e.target.value)}
                        className="bg-zinc-950 border-zinc-800 text-sm h-9"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[10px] text-zinc-400 uppercase font-semibold">Statutory Section</Label>
                      <Select
                        value={p.section}
                        onValueChange={v => updatePresumptive(idx, 'section', v)}
                      >
                        <SelectTrigger className="bg-zinc-950 border-zinc-800 h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-800">
                          <SelectItem value={PgbpSection.SEC_44AD}>Sec 44AD (General Business)</SelectItem>
                          <SelectItem value={PgbpSection.SEC_44ADA}>Sec 44ADA (Professional)</SelectItem>
                          <SelectItem value={PgbpSection.SEC_44AE}>Sec 44AE (Transporter)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[10px] text-zinc-400 uppercase font-semibold">Declared Income (Optional Override)</Label>
                      <Input
                        type="number"
                        value={p.declaredIncome || ''}
                        onChange={e => updatePresumptive(idx, 'declaredIncome', Number(e.target.value))}
                        className="bg-zinc-950 border-zinc-800 font-mono text-right text-sm h-9"
                        placeholder="Default Statutory minimum"
                      />
                    </div>
                  </div>

                  {p.section === PgbpSection.SEC_44AD ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 border-t border-zinc-900/60 pt-4">
                      <div className="space-y-2">
                        <Label className="text-[10px] text-zinc-400">Digital / Bank receipts (Taxed @ 6%)</Label>
                        <Input
                          type="number"
                          value={p.digitalTurnoverOrReceipts || ''}
                          onChange={e => updatePresumptive(idx, 'digitalTurnoverOrReceipts', Number(e.target.value))}
                          className="bg-zinc-950 border-zinc-800 font-mono text-right text-sm h-9"
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[10px] text-zinc-400">Cash / Other receipts (Taxed @ 8%)</Label>
                        <Input
                          type="number"
                          value={p.cashTurnoverOrReceipts || ''}
                          onChange={e => updatePresumptive(idx, 'cashTurnoverOrReceipts', Number(e.target.value))}
                          className="bg-zinc-950 border-zinc-800 font-mono text-right text-sm h-9"
                          placeholder="0"
                        />
                      </div>
                    </div>
                  ) : p.section === PgbpSection.SEC_44ADA ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-zinc-900/60 pt-4">
                      <div className="space-y-2">
                        <Label className="text-[10px] text-zinc-400">Gross Receipts (Taxed @ 50%)</Label>
                        <Input
                          type="number"
                          value={p.totalTurnoverOrReceipts || ''}
                          onChange={e => updatePresumptive(idx, 'totalTurnoverOrReceipts', Number(e.target.value))}
                          className="bg-zinc-950 border-zinc-800 font-mono text-right text-sm h-9"
                          placeholder="0"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 border-t border-zinc-900/60 pt-4">
                      <div className="space-y-2">
                        <Label className="text-[10px] text-zinc-400">Heavy Goods Vehicles Month Count</Label>
                        <Input
                          type="number"
                          value={p.heavyGoodsVehiclesMonths || ''}
                          onChange={e => updatePresumptive(idx, 'heavyGoodsVehiclesMonths', Number(e.target.value))}
                          className="bg-zinc-950 border-zinc-800 font-mono text-right text-sm h-9"
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[10px] text-zinc-400">Other Vehicles Month Count</Label>
                        <Input
                          type="number"
                          value={p.otherVehiclesMonths || ''}
                          onChange={e => updatePresumptive(idx, 'otherVehiclesMonths', Number(e.target.value))}
                          className="bg-zinc-950 border-zinc-800 font-mono text-right text-sm h-9"
                          placeholder="0"
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))
            )
          ) : (
            /* REGULAR TAB */
            regular.map((r, regIdx) => (
              <div key={regIdx} className="space-y-6">
                <div className="bg-zinc-950/30 border border-zinc-800/80 p-5 rounded-2xl space-y-4">
                  <h3 className="text-sm font-bold text-blue-400 uppercase tracking-wider">Book Profits & Statutory Additions (Disallowances)</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label className="text-[10px] text-zinc-400">Net Profit as per P&L</Label>
                      <Input
                        type="number"
                        value={r.netProfitAsPerBooks || ''}
                        onChange={e => updateRegular(regIdx, 'netProfitAsPerBooks', Number(e.target.value))}
                        className="bg-zinc-950 border-zinc-800 font-mono text-right text-sm h-9"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] text-zinc-400">Depreciation debited to P&L</Label>
                      <Input
                        type="number"
                        value={r.depreciationAsPerBooks || ''}
                        onChange={e => updateRegular(regIdx, 'depreciationAsPerBooks', Number(e.target.value))}
                        className="bg-zinc-950 border-zinc-800 font-mono text-right text-sm h-9"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] text-zinc-400">Cash Payments &gt; ₹10,000 u/s 40A(3)</Label>
                      <Input
                        type="number"
                        value={r.cashPaymentsOver10k_40A3 || ''}
                        onChange={e => updateRegular(regIdx, 'cashPaymentsOver10k_40A3', Number(e.target.value))}
                        className="bg-zinc-950 border-zinc-800 font-mono text-right text-sm h-9"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] text-zinc-400">Unpaid MSME Dues (Sec 43B(h))</Label>
                      <Input
                        type="number"
                        value={r.delayedPaymentsToMSME_43B || ''}
                        onChange={e => updateRegular(regIdx, 'delayedPaymentsToMSME_43B', Number(e.target.value))}
                        className="bg-zinc-950 border-zinc-800 font-mono text-right text-sm h-9"
                      />
                    </div>
                  </div>
                </div>

                {/* Section 32 Blocks list */}
                <div className="bg-zinc-950/30 border border-zinc-800/80 p-5 rounded-2xl space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-bold text-blue-400 uppercase tracking-wider">Section 32 Asset Blocks (Tax Depreciation)</h3>
                    <Button onClick={() => addAssetBlock(regIdx)} className="bg-zinc-900 border border-zinc-850 hover:bg-zinc-800 text-xs px-3 h-8 rounded-lg">
                      Add Block
                    </Button>
                  </div>

                  {r.assetBlocks.length === 0 ? (
                    <p className="text-zinc-500 text-xs text-center py-4">No asset blocks added. Book depreciation will be added back but no tax depreciation claimed.</p>
                  ) : (
                    r.assetBlocks.map((b, blockIdx) => (
                      <div key={blockIdx} className="bg-zinc-950/50 border border-zinc-800 p-4 rounded-xl space-y-4 relative">
                        <Button variant="ghost" size="icon" onClick={() => removeAssetBlock(regIdx, blockIdx)} className="absolute top-2 right-2 text-zinc-500 hover:text-red-400 h-8 w-8">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pr-8">
                          <div className="space-y-2">
                            <Label className="text-[10px] text-zinc-400">Block ID / Name</Label>
                            <Input
                              type="text"
                              value={b.blockId}
                              onChange={e => updateAssetBlock(regIdx, blockIdx, 'blockId', e.target.value)}
                              className="bg-zinc-950 border-zinc-800 text-sm h-8"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-[10px] text-zinc-400">Rate (%)</Label>
                            <Input
                              type="number"
                              value={b.depreciationRate}
                              onChange={e => updateAssetBlock(regIdx, blockIdx, 'depreciationRate', Number(e.target.value))}
                              className="bg-zinc-950 border-zinc-800 font-mono text-right text-sm h-8"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-[10px] text-zinc-400">Opening WDV</Label>
                            <Input
                              type="number"
                              value={b.openingWdv || ''}
                              onChange={e => updateAssetBlock(regIdx, blockIdx, 'openingWdv', Number(e.target.value))}
                              className="bg-zinc-950 border-zinc-800 font-mono text-right text-sm h-8"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-[10px] text-zinc-400">Additions (&ge;180 Days)</Label>
                            <Input
                              type="number"
                              value={b.additionsMoreThan180Days || ''}
                              onChange={e => updateAssetBlock(regIdx, blockIdx, 'additionsMoreThan180Days', Number(e.target.value))}
                              className="bg-zinc-950 border-zinc-800 font-mono text-right text-sm h-8"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-[10px] text-zinc-400">Additions (&lt;180 Days)</Label>
                            <Input
                              type="number"
                              value={b.additionsLessThan180Days || ''}
                              onChange={e => updateAssetBlock(regIdx, blockIdx, 'additionsLessThan180Days', Number(e.target.value))}
                              className="bg-zinc-950 border-zinc-800 font-mono text-right text-sm h-8"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-[10px] text-zinc-400">Sale Proceeds / Scrapped</Label>
                            <Input
                              type="number"
                              value={b.moneysPayableFromSales || ''}
                              onChange={e => updateAssetBlock(regIdx, blockIdx, 'moneysPayableFromSales', Number(e.target.value))}
                              className="bg-zinc-950 border-zinc-800 font-mono text-right text-sm h-8"
                            />
                          </div>
                          <div className="flex items-center justify-between col-span-2 bg-zinc-950/40 p-2 rounded-lg border border-zinc-800/80">
                            <Label className="text-[10px] text-zinc-300">Eligible for Additional Dep. (20%)</Label>
                            <Switch
                              checked={b.isEligibleForAdditionalDepreciation}
                              onCheckedChange={v => updateAssetBlock(regIdx, blockIdx, 'isEligibleForAdditionalDepreciation', v)}
                              className="data-[state=checked]:bg-blue-500 scale-75"
                            />
                          </div>
                        </div>
                      </div>
                    ))
                  )}
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
