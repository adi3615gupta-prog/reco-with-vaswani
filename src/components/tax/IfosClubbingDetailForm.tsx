import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Trash2, ShieldCheck, Heart } from 'lucide-react';
import { IfosRecord, GiftRecord, LifeInsurancePolicyRecord, GiftPropertyType } from '@/lib/ifosTypes';
import { ClubbingRecord, ClubbingSourceCategory } from '@/lib/clubbingTypes';
import { computeIFOS } from '@/lib/ifosEngine';
import { computeClubbing } from '@/lib/clubbingEngine';
import { RegimeType, IncomeType } from '@/lib/incomeTaxTypes';

interface IfosClubbingDetailFormProps {
  isOpen: boolean;
  onClose: () => void;
  regime: RegimeType;
  onSave: (computedIfos: any, rawIfos: IfosRecord, computedClubbing: any, rawClubbing: ClubbingRecord[]) => void;
  initialIfos?: IfosRecord;
  initialClubbing?: ClubbingRecord[];
}

export default function IfosClubbingDetailForm({
  isOpen,
  onClose,
  regime,
  onSave,
  initialIfos,
  initialClubbing
}: IfosClubbingDetailFormProps) {
  const [activeTab, setActiveTab] = useState<'ifos' | 'gifts' | 'lips' | 'clubbing'>('ifos');

  // IFOS State
  const [ifos, setIfos] = useState<IfosRecord>(initialIfos || {
    dividends: 0,
    casualIncomeLotteries: 0,
    familyPensionReceived: 0,
    interestOnCompulsoryAcquisition: 0,
    interestOnBankDeposits: 0,
    interestOnIncomeTaxRefund: 0,
    otherGeneralIncome: 0,
    gifts: [],
    lifeInsurancePolicies: []
  });

  // Clubbing State
  const [clubbing, setClubbing] = useState<ClubbingRecord[]>(initialClubbing || []);

  const updateIfosField = (key: keyof IfosRecord, value: any) => {
    setIfos(prev => ({ ...prev, [key]: value }));
  };

  const addGift = () => {
    const nextGift: GiftRecord = {
      id: `Gift ${ifos.gifts.length + 1}`,
      type: GiftPropertyType.MONEY,
      actualConsiderationPaid: 0,
      isFromRelative: false,
      isOnOccasionOfMarriage: false,
      isUnderWillOrInheritance: false
    };
    setIfos(prev => ({ ...prev, gifts: [...prev.gifts, nextGift] }));
  };

  const updateGift = (giftIdx: number, key: keyof GiftRecord, value: any) => {
    setIfos(prev => {
      const updatedGifts = prev.gifts.map((g, idx) => idx === giftIdx ? { ...g, [key]: value } : g);
      return { ...prev, gifts: updatedGifts };
    });
  };

  const removeGift = (giftIdx: number) => {
    setIfos(prev => ({ ...prev, gifts: prev.gifts.filter((_, idx) => idx !== giftIdx) }));
  };

  const addLip = () => {
    const nextLip: LifeInsurancePolicyRecord = {
      id: `LIP ${ifos.lifeInsurancePolicies.length + 1}`,
      dateOfIssue: '2024-01-01',
      annualPremium: 0,
      sumAssured: 0,
      maturityAmountReceived: 0,
      deductionClaimed80C: 0,
      receivedOnDeath: false
    };
    setIfos(prev => ({ ...prev, lifeInsurancePolicies: [...prev.lifeInsurancePolicies, nextLip] }));
  };

  const updateLip = (lipIdx: number, key: keyof LifeInsurancePolicyRecord, value: any) => {
    setIfos(prev => {
      const updatedLips = prev.lifeInsurancePolicies.map((l, idx) => idx === lipIdx ? { ...l, [key]: value } : l);
      return { ...prev, lifeInsurancePolicies: updatedLips };
    });
  };

  const removeLip = (lipIdx: number) => {
    setIfos(prev => ({ ...prev, lifeInsurancePolicies: prev.lifeInsurancePolicies.filter((_, idx) => idx !== lipIdx) }));
  };

  const addClubbing = () => {
    setClubbing(prev => [
      ...prev,
      {
        id: `Clubbed Item ${prev.length + 1}`,
        sourceCategory: ClubbingSourceCategory.MINOR_CHILD,
        incomeHead: IncomeType.OTHER_SOURCES,
        grossAmount: 0,
        minorChildId: `Child ${prev.length + 1}`,
        isFromManualWork: false,
        isFromSkillOrTalent: false,
        isMinorDisabled: false
      }
    ]);
  };

  const updateClubbing = (idx: number, key: keyof ClubbingRecord, value: any) => {
    setClubbing(prev => prev.map((c, i) => i === idx ? { ...c, [key]: value } : c));
  };

  const removeClubbing = (idx: number) => {
    setClubbing(prev => prev.filter((_, i) => i !== idx));
  };

  const handleApply = () => {
    const computedIfos = computeIFOS(ifos, regime);
    const computedClubbing = computeClubbing(clubbing);
    onSave(computedIfos, ifos, computedClubbing, clubbing);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-[#141419] border-zinc-800 text-white max-w-5xl max-h-[90vh] flex flex-col p-6 rounded-2xl overflow-hidden">
        <DialogHeader className="border-b border-zinc-900 pb-4 flex flex-row items-center justify-between">
          <DialogTitle className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-500" />
            IFOS Registry & Clubbing Provisions
          </DialogTitle>
          <div className="flex items-center gap-3 mr-6">
            <Tabs value={activeTab} onValueChange={v => setActiveTab(v as any)} className="w-fit">
              <TabsList className="bg-zinc-950 border border-zinc-800 p-0.5 rounded-lg h-9">
                <TabsTrigger value="ifos" className="text-xs h-8 rounded-md">General IFOS</TabsTrigger>
                <TabsTrigger value="gifts" className="text-xs h-8 rounded-md">Gifts Registry</TabsTrigger>
                <TabsTrigger value="lips" className="text-xs h-8 rounded-md">LIP Policies</TabsTrigger>
                <TabsTrigger value="clubbing" className="text-xs h-8 rounded-md">Clubbed Incomes</TabsTrigger>
              </TabsList>
            </Tabs>
            {activeTab === 'gifts' && (
              <Button onClick={addGift} className="bg-zinc-900 border border-zinc-855 hover:bg-zinc-800 text-xs px-3 h-8 rounded-lg flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Add Gift
              </Button>
            )}
            {activeTab === 'lips' && (
              <Button onClick={addLip} className="bg-zinc-900 border border-zinc-855 hover:bg-zinc-800 text-xs px-3 h-8 rounded-lg flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Add Policy
              </Button>
            )}
            {activeTab === 'clubbing' && (
              <Button onClick={addClubbing} className="bg-zinc-900 border border-zinc-855 hover:bg-zinc-800 text-xs px-3 h-8 rounded-lg flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Add Item
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 pr-2 py-4 space-y-6">
          {/* TAB 1: GENERAL IFOS */}
          {activeTab === 'ifos' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-xs text-zinc-400">Dividends Received (Gross)</Label>
                <Input
                  type="number"
                  value={ifos.dividends || ''}
                  onChange={e => updateIfosField('dividends', Number(e.target.value))}
                  className="bg-zinc-950 border-zinc-800 font-mono text-right text-sm h-9"
                  placeholder="0"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-zinc-400">Winnings from Lotteries, puzzles, card games</Label>
                <Input
                  type="number"
                  value={ifos.casualIncomeLotteries || ''}
                  onChange={e => updateIfosField('casualIncomeLotteries', Number(e.target.value))}
                  className="bg-zinc-950 border-zinc-800 font-mono text-right text-sm h-9"
                  placeholder="0"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-zinc-400">Family Pension Received</Label>
                <Input
                  type="number"
                  value={ifos.familyPensionReceived || ''}
                  onChange={e => updateIfosField('familyPensionReceived', Number(e.target.value))}
                  className="bg-zinc-950 border-zinc-800 font-mono text-right text-sm h-9"
                  placeholder="0"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-zinc-400">Interest on Compulsory Acquisition Compensation</Label>
                <Input
                  type="number"
                  value={ifos.interestOnCompulsoryAcquisition || ''}
                  onChange={e => updateIfosField('interestOnCompulsoryAcquisition', Number(e.target.value))}
                  className="bg-zinc-950 border-zinc-800 font-mono text-right text-sm h-9"
                  placeholder="0"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-zinc-400">Interest on Bank Savings / FDs</Label>
                <Input
                  type="number"
                  value={ifos.interestOnBankDeposits || ''}
                  onChange={e => updateIfosField('interestOnBankDeposits', Number(e.target.value))}
                  className="bg-zinc-950 border-zinc-800 font-mono text-right text-sm h-9"
                  placeholder="0"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-zinc-400">Interest on Income Tax Refund</Label>
                <Input
                  type="number"
                  value={ifos.interestOnIncomeTaxRefund || ''}
                  onChange={e => updateIfosField('interestOnIncomeTaxRefund', Number(e.target.value))}
                  className="bg-zinc-950 border-zinc-800 font-mono text-right text-sm h-9"
                  placeholder="0"
                />
              </div>
            </div>
          )}

          {/* TAB 2: GIFTS REGISTRY */}
          {activeTab === 'gifts' && (
            ifos.gifts.length === 0 ? (
              <p className="text-zinc-500 text-center py-12">No gifts declared. Use "Add Gift" above.</p>
            ) : (
              ifos.gifts.map((g, giftIdx) => (
                <div key={giftIdx} className="bg-zinc-950/30 border border-zinc-800/80 p-4 rounded-xl space-y-4 relative">
                  <Button variant="ghost" size="icon" onClick={() => removeGift(giftIdx)} className="absolute top-2 right-2 text-zinc-500 hover:text-red-400 h-8 w-8">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label className="text-[10px] text-zinc-400 font-semibold uppercase">Gift ID</Label>
                      <Input
                        type="text"
                        value={g.id}
                        onChange={e => updateGift(giftIdx, 'id', e.target.value)}
                        className="bg-zinc-950 border-zinc-800 text-sm h-8"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] text-zinc-400 font-semibold uppercase">Gift Type</Label>
                      <Select
                        value={g.type}
                        onValueChange={v => updateGift(giftIdx, 'type', v)}
                      >
                        <SelectTrigger className="bg-zinc-950 border-zinc-800 h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-800">
                          <SelectItem value={GiftPropertyType.MONEY}>Sum of Money</SelectItem>
                          <SelectItem value={GiftPropertyType.MOVABLE_PROPERTY}>Movable Property</SelectItem>
                          <SelectItem value={GiftPropertyType.IMMOVABLE_PROPERTY}>Immovable Property</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] text-zinc-400 font-semibold uppercase">Amount / Consideration Paid</Label>
                      <Input
                        type="number"
                        value={g.actualConsiderationPaid || ''}
                        onChange={e => updateGift(giftIdx, 'actualConsiderationPaid', Number(e.target.value))}
                        className="bg-zinc-950 border-zinc-800 font-mono text-right text-sm h-8"
                      />
                    </div>
                    {g.type === GiftPropertyType.MOVABLE_PROPERTY ? (
                      <div className="space-y-2">
                        <Label className="text-[10px] text-zinc-400 font-semibold uppercase">Fair Market Value (FMV)</Label>
                        <Input
                          type="number"
                          value={g.fairMarketValue || ''}
                          onChange={e => updateGift(giftIdx, 'fairMarketValue', Number(e.target.value))}
                          className="bg-zinc-950 border-zinc-800 font-mono text-right text-sm h-8"
                        />
                      </div>
                    ) : g.type === GiftPropertyType.IMMOVABLE_PROPERTY ? (
                      <div className="space-y-2">
                        <Label className="text-[10px] text-zinc-400 font-semibold uppercase">Stamp Duty Value (SDV)</Label>
                        <Input
                          type="number"
                          value={g.stampDutyValue || ''}
                          onChange={e => updateGift(giftIdx, 'stampDutyValue', Number(e.target.value))}
                          className="bg-zinc-950 border-zinc-800 font-mono text-right text-sm h-8"
                        />
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-4 border-t border-zinc-900/60 pt-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={g.isFromRelative}
                        onCheckedChange={v => updateGift(giftIdx, 'isFromRelative', v)}
                        className="scale-75 data-[state=checked]:bg-blue-500"
                      />
                      <span className="text-[10px] text-zinc-400">Received from Relative (Exempt)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={g.isOnOccasionOfMarriage}
                        onCheckedChange={v => updateGift(giftIdx, 'isOnOccasionOfMarriage', v)}
                        className="scale-75 data-[state=checked]:bg-blue-500"
                      />
                      <span className="text-[10px] text-zinc-400">Received on Marriage (Exempt)</span>
                    </div>
                  </div>
                </div>
              ))
            )
          )}

          {/* TAB 3: LIFE INSURANCE POLICIES */}
          {activeTab === 'lips' && (
            ifos.lifeInsurancePolicies.length === 0 ? (
              <p className="text-zinc-500 text-center py-12">No LIP policies declared. Click "Add Policy" above.</p>
            ) : (
              ifos.lifeInsurancePolicies.map((l, lipIdx) => (
                <div key={lipIdx} className="bg-zinc-950/30 border border-zinc-800/80 p-4 rounded-xl space-y-4 relative">
                  <Button variant="ghost" size="icon" onClick={() => removeLip(lipIdx)} className="absolute top-2 right-2 text-zinc-500 hover:text-red-400 h-8 w-8">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pr-8">
                    <div className="space-y-2">
                      <Label className="text-[10px] text-zinc-400">Policy ID</Label>
                      <Input
                        type="text"
                        value={l.id}
                        onChange={e => updateLip(lipIdx, 'id', e.target.value)}
                        className="bg-zinc-950 border-zinc-800 text-sm h-8"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] text-zinc-400">Issue Date</Label>
                      <Input
                        type="date"
                        value={l.dateOfIssue}
                        onChange={e => updateLip(lipIdx, 'dateOfIssue', e.target.value)}
                        className="bg-zinc-950 border-zinc-800 text-sm h-8 font-mono"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] text-zinc-400">Annual Premium</Label>
                      <Input
                        type="number"
                        value={l.annualPremium || ''}
                        onChange={e => updateLip(lipIdx, 'annualPremium', Number(e.target.value))}
                        className="bg-zinc-950 border-zinc-800 font-mono text-right text-sm h-8"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] text-zinc-400">Maturity Amount Received</Label>
                      <Input
                        type="number"
                        value={l.maturityAmountReceived || ''}
                        onChange={e => updateLip(lipIdx, 'maturityAmountReceived', Number(e.target.value))}
                        className="bg-zinc-950 border-zinc-800 font-mono text-right text-sm h-8"
                      />
                    </div>
                  </div>
                </div>
              ))
            )
          )}

          {/* TAB 4: CLUBBED INCOMES */}
          {activeTab === 'clubbing' && (
            clubbing.length === 0 ? (
              <div className="text-zinc-500 text-center py-12">
                <p className="text-sm">No clubbed records registered. Use "Add Item" above to add minor child or spouse income.</p>
              </div>
            ) : (
              clubbing.map((c, idx) => (
                <div key={idx} className="bg-zinc-950/30 border border-zinc-800/80 p-4 rounded-xl space-y-4 relative">
                  <Button variant="ghost" size="icon" onClick={() => removeClubbing(idx)} className="absolute top-2 right-2 text-zinc-500 hover:text-red-400 h-8 w-8">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pr-8">
                    <div className="space-y-2">
                      <Label className="text-[10px] text-zinc-400">Record ID / Source Name</Label>
                      <Input
                        type="text"
                        value={c.id}
                        onChange={e => updateClubbing(idx, 'id', e.target.value)}
                        className="bg-zinc-950 border-zinc-800 text-sm h-8"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] text-zinc-400">Source Category</Label>
                      <Select
                        value={c.sourceCategory}
                        onValueChange={v => updateClubbing(idx, 'sourceCategory', v)}
                      >
                        <SelectTrigger className="bg-zinc-950 border-zinc-800 h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-800">
                          <SelectItem value={ClubbingSourceCategory.MINOR_CHILD}>Minor Child (Sec 64(1A))</SelectItem>
                          <SelectItem value={ClubbingSourceCategory.SPOUSE_ASSET_TRANSFER}>Spouse (Asset Transfer)</SelectItem>
                          <SelectItem value={ClubbingSourceCategory.SPOUSE_REMUNERATION}>Spouse (Remuneration u/s 64(1)(ii))</SelectItem>
                          <SelectItem value={ClubbingSourceCategory.SONS_WIFE}>Son's Wife (Sec 64(1)(vi))</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] text-zinc-400">Original Income Head</Label>
                      <Select
                        value={c.incomeHead}
                        onValueChange={v => updateClubbing(idx, 'incomeHead', v)}
                      >
                        <SelectTrigger className="bg-zinc-950 border-zinc-800 h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-800">
                          <SelectItem value={IncomeType.SALARY}>Salary</SelectItem>
                          <SelectItem value={IncomeType.HOUSE_PROPERTY}>House Property</SelectItem>
                          <SelectItem value={IncomeType.BUSINESS}>PGBP Business</SelectItem>
                          <SelectItem value={IncomeType.OTHER_SOURCES}>Other Sources (IFOS)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] text-zinc-400">Gross Amount</Label>
                      <Input
                        type="number"
                        value={c.grossAmount || ''}
                        onChange={e => updateClubbing(idx, 'grossAmount', Number(e.target.value))}
                        className="bg-zinc-950 border-zinc-800 font-mono text-right text-sm h-8"
                      />
                    </div>
                  </div>

                  {c.sourceCategory === ClubbingSourceCategory.MINOR_CHILD && (
                    <div className="flex flex-wrap gap-4 border-t border-zinc-900/60 pt-3">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={c.isMinorDisabled}
                          onCheckedChange={v => updateClubbing(idx, 'isMinorDisabled', v)}
                          className="scale-75 data-[state=checked]:bg-blue-500"
                        />
                        <span className="text-[10px] text-zinc-400 font-semibold">Disabled (Sec 80U) - Exempt</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={c.isFromSkillOrTalent}
                          onCheckedChange={v => updateClubbing(idx, 'isFromSkillOrTalent', v)}
                          className="scale-75 data-[state=checked]:bg-blue-500"
                        />
                        <span className="text-[10px] text-zinc-400 font-semibold">Earned via Skill / Talent - Exempt</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={c.isFromManualWork}
                          onCheckedChange={v => updateClubbing(idx, 'isFromManualWork', v)}
                          className="scale-75 data-[state=checked]:bg-blue-500"
                        />
                        <span className="text-[10px] text-zinc-400 font-semibold">Earned via Manual Work - Exempt</span>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )
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
