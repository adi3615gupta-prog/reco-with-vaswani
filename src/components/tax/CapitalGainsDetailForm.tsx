import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Trash2, ShieldCheck, AlertCircle } from 'lucide-react';
import { CapitalAssetRecord, AssetClass, TransferType } from '@/lib/capitalGainsTypes';
import { computeCapitalGains } from '@/lib/capitalGainsEngine';

interface CapitalGainsDetailFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (computed: any, raw: CapitalAssetRecord[]) => void;
  initialData?: CapitalAssetRecord[];
}

export default function CapitalGainsDetailForm({
  isOpen,
  onClose,
  onSave,
  initialData
}: CapitalGainsDetailFormProps) {
  const [assets, setAssets] = useState<CapitalAssetRecord[]>(initialData || [
    {
      id: 'Asset 1',
      assetClass: AssetClass.EQUITY_SHARES_LISTED,
      transferType: TransferType.NORMAL_SALE,
      acquisitionDate: '2023-01-01',
      transferDate: '2025-06-01',
      fullValueConsideration: 0,
      transferExpenses: 0,
      costOfAcquisition: 0,
      costOfImprovement: 0
    }
  ]);

  const addAsset = () => {
    setAssets(prev => [
      ...prev,
      {
        id: `Asset ${prev.length + 1}`,
        assetClass: AssetClass.REAL_ESTATE,
        transferType: TransferType.NORMAL_SALE,
        acquisitionDate: '2022-01-01',
        transferDate: '2025-06-01',
        fullValueConsideration: 0,
        transferExpenses: 0,
        costOfAcquisition: 0,
        costOfImprovement: 0
      }
    ]);
  };

  const removeAsset = (index: number) => {
    setAssets(prev => prev.filter((_, idx) => idx !== index));
  };

  const updateAsset = (index: number, key: keyof CapitalAssetRecord, value: any) => {
    setAssets(prev => prev.map((a, idx) => idx === index ? { ...a, [key]: value } : a));
  };

  const handleApply = () => {
    const result = computeCapitalGains(assets);
    onSave(result, assets);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-[#141419] border-zinc-800 text-white max-w-5xl max-h-[90vh] flex flex-col p-6 rounded-2xl overflow-hidden">
        <DialogHeader className="border-b border-zinc-900 pb-4 flex flex-row items-center justify-between">
          <DialogTitle className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-500" />
            Capital Gains Transactions Registry (Finance Act 2024 Audit)
          </DialogTitle>
          <Button onClick={addAsset} className="bg-zinc-900 border border-zinc-850 hover:bg-zinc-800 text-xs px-3 h-8 rounded-lg flex items-center gap-1 mr-6">
            <Plus className="w-3.5 h-3.5" /> Add Transaction
          </Button>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 pr-2 py-4 space-y-6">
          <div className="flex items-center gap-2 text-amber-400 bg-amber-950/20 border border-amber-900/30 p-3 rounded-xl mb-4">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <p className="text-[10px]"><strong>Compliance Rule:</strong> Indexation is automatically disallowed for all asset transfers occurring on or after 23rd July 2024. Please input precise dates.</p>
          </div>

          {assets.length === 0 ? (
            <p className="text-zinc-500 text-center py-12">No transactions recorded. Click "Add Transaction" above to start.</p>
          ) : (
            assets.map((asset, index) => (
              <div key={index} className="bg-zinc-950/30 border border-zinc-800/80 p-5 rounded-2xl space-y-4 relative">
                <Button variant="ghost" size="icon" onClick={() => removeAsset(index)} className="absolute top-4 right-4 text-zinc-500 hover:text-red-400">
                  <Trash2 className="w-4 h-4" />
                </Button>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] text-zinc-400 uppercase font-semibold">Asset ID / Name</Label>
                    <Input
                      type="text"
                      value={asset.id}
                      onChange={e => updateAsset(index, 'id', e.target.value)}
                      className="bg-zinc-950 border-zinc-800 text-sm h-9"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[10px] text-zinc-400 uppercase font-semibold">Asset Class</Label>
                    <Select
                      value={asset.assetClass}
                      onValueChange={v => updateAsset(index, 'assetClass', v)}
                    >
                      <SelectTrigger className="bg-zinc-950 border-zinc-800 h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-800">
                        <SelectItem value={AssetClass.EQUITY_SHARES_LISTED}>Listed Shares (111A/112A)</SelectItem>
                        <SelectItem value={AssetClass.EQUITY_ORIENTED_FUND}>Equity oriented Fund (111A/112A)</SelectItem>
                        <SelectItem value={AssetClass.UNLISTED_SHARES}>Unlisted Shares (112)</SelectItem>
                        <SelectItem value={AssetClass.REAL_ESTATE}>Real Estate (Land/Bldg)</SelectItem>
                        <SelectItem value={AssetClass.DEBT_MUTUAL_FUND}>Debt Mutual Fund (STCG 50AA)</SelectItem>
                        <SelectItem value={AssetClass.OTHER_ASSET}>Other Capital Assets</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[10px] text-zinc-400 uppercase font-semibold">Acquisition Date</Label>
                    <Input
                      type="date"
                      value={asset.acquisitionDate}
                      onChange={e => updateAsset(index, 'acquisitionDate', e.target.value)}
                      className="bg-zinc-950 border-zinc-800 text-sm h-9 font-mono"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[10px] text-zinc-400 uppercase font-semibold">Transfer Date</Label>
                    <Input
                      type="date"
                      value={asset.transferDate}
                      onChange={e => updateAsset(index, 'transferDate', e.target.value)}
                      className="bg-zinc-950 border-zinc-800 text-sm h-9 font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 border-t border-zinc-900/60 pt-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] text-zinc-400">Sale Consideration (FVOC)</Label>
                    <Input
                      type="number"
                      value={asset.fullValueConsideration || ''}
                      onChange={e => updateAsset(index, 'fullValueConsideration', Number(e.target.value))}
                      className="bg-zinc-950 border-zinc-800 font-mono text-right text-sm h-9"
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] text-zinc-400">Cost of Acquisition (COA)</Label>
                    <Input
                      type="number"
                      value={asset.costOfAcquisition || ''}
                      onChange={e => updateAsset(index, 'costOfAcquisition', Number(e.target.value))}
                      className="bg-zinc-950 border-zinc-800 font-mono text-right text-sm h-9"
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] text-zinc-400">Transfer Expenses</Label>
                    <Input
                      type="number"
                      value={asset.transferExpenses || ''}
                      onChange={e => updateAsset(index, 'transferExpenses', Number(e.target.value))}
                      className="bg-zinc-950 border-zinc-800 font-mono text-right text-sm h-9"
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] text-zinc-400">Cost of Improvement</Label>
                    <Input
                      type="number"
                      value={asset.costOfImprovement || ''}
                      onChange={e => updateAsset(index, 'costOfImprovement', Number(e.target.value))}
                      className="bg-zinc-950 border-zinc-800 font-mono text-right text-sm h-9"
                      placeholder="0"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 border-t border-zinc-900/60 pt-4">
                  {asset.assetClass === AssetClass.REAL_ESTATE && (
                    <div className="space-y-2">
                      <Label className="text-[10px] text-zinc-400">Stamp Duty Value (Sec 50C)</Label>
                      <Input
                        type="number"
                        value={asset.stampDutyValue || ''}
                        onChange={e => updateAsset(index, 'stampDutyValue', Number(e.target.value))}
                        className="bg-zinc-950 border-zinc-800 font-mono text-right text-sm h-9"
                        placeholder="0"
                      />
                    </div>
                  )}

                  {asset.assetClass === AssetClass.REAL_ESTATE && (
                    <div className="space-y-2">
                      <Label className="text-[10px] text-zinc-400">New House Investment (Sec 54)</Label>
                      <Input
                        type="number"
                        value={asset.investmentInNewResidentialHouse54 || ''}
                        onChange={e => updateAsset(index, 'investmentInNewResidentialHouse54', Number(e.target.value))}
                        className="bg-zinc-950 border-zinc-800 font-mono text-right text-sm h-9"
                        placeholder="0"
                      />
                    </div>
                  )}

                  {(asset.assetClass === AssetClass.EQUITY_SHARES_LISTED || asset.assetClass === AssetClass.EQUITY_ORIENTED_FUND) && (
                    <div className="space-y-2">
                      <Label className="text-[10px] text-zinc-400">FMV on 31-Jan-2018 (Grandfathering)</Label>
                      <Input
                        type="number"
                        value={asset.fmvOn31Jan2018 || ''}
                        onChange={e => updateAsset(index, 'fmvOn31Jan2018', Number(e.target.value))}
                        className="bg-zinc-950 border-zinc-800 font-mono text-right text-sm h-9"
                        placeholder="0"
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label className="text-[10px] text-zinc-400">Sec 54EC Bonds Investment</Label>
                    <Input
                      type="number"
                      value={asset.investmentInSpecifiedBonds54EC || ''}
                      onChange={e => updateAsset(index, 'investmentInSpecifiedBonds54EC', Number(e.target.value))}
                      className="bg-zinc-950 border-zinc-800 font-mono text-right text-sm h-9"
                      placeholder="0"
                    />
                  </div>
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
