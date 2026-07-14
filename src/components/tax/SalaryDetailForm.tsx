import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { IndianRupee, ShieldCheck, HelpCircle } from 'lucide-react';
import { RawSalaryComponents, SalaryProfile, EmployeeType, CityType } from '@/lib/salaryTypes';
import { computeSalary } from '@/lib/salaryEngine';
import { RegimeType } from '@/lib/incomeTaxTypes';

interface SalaryFormState {
  basicSalary: number;
  dearnessAllowanceTerms: number;
  dearnessAllowanceOthers: number;
  commission: number;
  bonus: number;
  advanceSalary: number;
  arrearsSalary: number;
  hraReceived: number;
  actualRentPaid: number;
  isMetroCity: boolean;
  childrenEducationAllowance: number;
  childrenCount: number;
  transportAllowance: number;
  isHandicapped: boolean;
  gratuityReceived: number;
  gratuityServiceYears: number;
  isCoveredUnderPOGA: boolean;
  leaveSalaryReceived: number;
  avgSalaryLast10Months: number;
  leaveCreditDays: number;
  uncommutedPension: number;
  commutedPension: number;
  totalPensionValue: number;
  professionalTaxPaid: number;
  entertainmentAllowanceReceived: number;
  rentFreeAccommodation?: RawSalaryComponents['rentFreeAccommodation'];
  motorCar?: RawSalaryComponents['motorCar'];
}

interface SalaryDetailFormProps {
  isOpen: boolean;
  onClose: () => void;
  regime: RegimeType;
  employeeType: string;
  onSave: (computed: any, raw: RawSalaryComponents) => void;
  initialData?: RawSalaryComponents;
}

export default function SalaryDetailForm({
  isOpen,
  onClose,
  regime,
  employeeType,
  onSave,
  initialData
}: SalaryDetailFormProps) {
  const [formData, setFormData] = useState<SalaryFormState>(() => ({
    basicSalary: initialData?.basicSalary || 0,
    dearnessAllowanceTerms: initialData?.dearnessAllowance || 0,
    dearnessAllowanceOthers: 0,
    commission: initialData?.commission || 0,
    bonus: initialData?.bonus || 0,
    advanceSalary: initialData?.advanceSalary || 0,
    arrearsSalary: initialData?.arrearsSalary || 0,
    hraReceived: initialData?.hraReceived || 0,
    actualRentPaid: initialData?.rentPaid || 0,
    isMetroCity: true,
    childrenEducationAllowance: initialData?.childrenEducationAllowance || 0,
    childrenCount: initialData?.childrenCount || 0,
    transportAllowance: initialData?.transportAllowance || 0,
    isHandicapped: initialData?.isHandicapped || false,
    gratuityReceived: initialData?.gratuityReceived || 0,
    gratuityServiceYears: 0,
    isCoveredUnderPOGA: true,
    leaveSalaryReceived: initialData?.leaveSalaryReceived || 0,
    avgSalaryLast10Months: initialData?.avgSalaryLast10Months || 0,
    leaveCreditDays: initialData?.leaveCreditDays || 0,
    uncommutedPension: initialData?.uncommutedPension || 0,
    commutedPension: initialData?.commutedPension || 0,
    totalPensionValue: initialData?.totalPensionValue || 0,
    professionalTaxPaid: initialData?.professionalTaxPaid || 0,
    entertainmentAllowanceReceived: initialData?.entertainmentAllowanceReceived || 0,
    rentFreeAccommodation: initialData?.rentFreeAccommodation,
    motorCar: initialData?.motorCar
  }));

  const updateField = <K extends keyof SalaryFormState>(key: K, value: SalaryFormState[K]) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const handleApply = () => {
    const empTypeEnum = employeeType === 'GOVERNMENT'
      ? EmployeeType.GOVERNMENT
      : formData.isCoveredUnderPOGA
        ? EmployeeType.NON_GOVT_POGA
        : EmployeeType.NON_GOVT_NON_POGA;

    const profile: SalaryProfile = {
      employeeType: empTypeEnum,
      cityType: formData.isMetroCity ? CityType.METRO : CityType.NON_METRO,
      populationInLakhs: 45,
      completedYearsOfService: formData.gratuityServiceYears
    };

    const rawComponents: RawSalaryComponents = {
      basicSalary: formData.basicSalary || 0,
      dearnessAllowance: (formData.dearnessAllowanceTerms || 0) + (formData.dearnessAllowanceOthers || 0),
      daFormsPart: (formData.dearnessAllowanceTerms || 0) > 0,
      commission: formData.commission || 0,
      bonus: formData.bonus || 0,
      advanceSalary: formData.advanceSalary || 0,
      arrearsSalary: formData.arrearsSalary || 0,
      hraReceived: formData.hraReceived || 0,
      rentPaid: formData.actualRentPaid || 0,
      childrenEducationAllowance: formData.childrenEducationAllowance || 0,
      childrenCount: formData.childrenCount || 0,
      transportAllowance: formData.transportAllowance || 0,
      isHandicapped: formData.isHandicapped || false,
      gratuityReceived: formData.gratuityReceived || 0,
      leaveSalaryReceived: formData.leaveSalaryReceived || 0,
      leaveCreditDays: formData.leaveCreditDays || 0,
      avgSalaryLast10Months: formData.avgSalaryLast10Months || 0,
      uncommutedPension: formData.uncommutedPension || 0,
      commutedPension: formData.commutedPension || 0,
      totalPensionValue: formData.totalPensionValue || 0,
      professionalTaxPaid: formData.professionalTaxPaid || 0,
      entertainmentAllowanceReceived: formData.entertainmentAllowanceReceived || 0,
      rentFreeAccommodation: formData.rentFreeAccommodation,
      motorCar: formData.motorCar
    };

    const result = computeSalary(profile, rawComponents, regime);
    onSave(result, rawComponents);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-[#141419] border-zinc-800 text-white max-w-4xl max-h-[90vh] flex flex-col p-6 rounded-2xl overflow-hidden">
        <DialogHeader className="border-b border-zinc-900 pb-4">
          <DialogTitle className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-500" />
            Detailed Salary Components & Section 10 Exemptions
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 pr-2 py-4">
          <Tabs defaultValue="core" className="w-full">
            <TabsList className="bg-zinc-950 border border-zinc-800 p-1 rounded-xl mb-6">
              <TabsTrigger value="core" className="rounded-lg">Core Salary & Allowances</TabsTrigger>
              <TabsTrigger value="retirement" className="rounded-lg">Retirement Benefits</TabsTrigger>
              <TabsTrigger value="perquisites" className="rounded-lg">Perquisites (RFA/Car)</TabsTrigger>
            </TabsList>

            {/* TAB 1: CORE SALARY & ALLOWANCES */}
            <TabsContent value="core" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-xs text-zinc-400 uppercase tracking-wider font-semibold">Basic Salary (Annual)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-zinc-500 text-xs">₹</span>
                    <Input
                      type="number"
                      value={formData.basicSalary || ''}
                      onChange={e => updateField('basicSalary', Number(e.target.value))}
                      className="pl-8 bg-zinc-950 border-zinc-800 font-mono text-right text-sm"
                      placeholder="0"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-zinc-400 uppercase tracking-wider font-semibold">Dearness Allowance (Retirement Benefits Portion)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-zinc-500 text-xs">₹</span>
                    <Input
                      type="number"
                      value={formData.dearnessAllowanceTerms || ''}
                      onChange={e => updateField('dearnessAllowanceTerms', Number(e.target.value))}
                      className="pl-8 bg-zinc-950 border-zinc-800 font-mono text-right text-sm"
                      placeholder="0"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-zinc-400 uppercase tracking-wider font-semibold">Dearness Allowance (Other Portions)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-zinc-500 text-xs">₹</span>
                    <Input
                      type="number"
                      value={formData.dearnessAllowanceOthers || ''}
                      onChange={e => updateField('dearnessAllowanceOthers', Number(e.target.value))}
                      className="pl-8 bg-zinc-950 border-zinc-800 font-mono text-right text-sm"
                      placeholder="0"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-zinc-400 uppercase tracking-wider font-semibold">Bonus (Annual)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-zinc-500 text-xs">₹</span>
                    <Input
                      type="number"
                      value={formData.bonus || ''}
                      onChange={e => updateField('bonus', Number(e.target.value))}
                      className="pl-8 bg-zinc-950 border-zinc-800 font-mono text-right text-sm"
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-zinc-900 pt-6 space-y-4">
                <h3 className="text-sm font-bold text-blue-400 uppercase tracking-wider">House Rent Allowance (HRA) u/s 10(13A)</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-xs text-zinc-400 uppercase tracking-wider font-semibold">HRA Received (Annual)</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-zinc-500 text-xs">₹</span>
                      <Input
                        type="number"
                        value={formData.hraReceived || ''}
                        onChange={e => updateField('hraReceived', Number(e.target.value))}
                        className="pl-8 bg-zinc-950 border-zinc-800 font-mono text-right text-sm"
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs text-zinc-400 uppercase tracking-wider font-semibold">Actual Rent Paid (Annual)</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-zinc-500 text-xs">₹</span>
                      <Input
                        type="number"
                        value={formData.actualRentPaid || ''}
                        onChange={e => updateField('actualRentPaid', Number(e.target.value))}
                        className="pl-8 bg-zinc-950 border-zinc-800 font-mono text-right text-sm"
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between col-span-2 bg-zinc-950/40 border border-zinc-800 p-4 rounded-xl">
                    <div>
                      <Label className="text-xs text-zinc-300 font-semibold">Metro City Resident</Label>
                      <p className="text-[10px] text-zinc-500 mt-0.5">Applies 50% HRA cap for Delhi, Mumbai, Kolkata, Chennai. Otherwise 40%.</p>
                    </div>
                    <Switch
                      checked={formData.isMetroCity}
                      onCheckedChange={v => updateField('isMetroCity', v)}
                      className="data-[state=checked]:bg-blue-500"
                    />
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* TAB 2: RETIREMENT BENEFITS */}
            <TabsContent value="retirement" className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-blue-400 uppercase tracking-wider">Gratuity u/s 10(10)</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-xs text-zinc-400 uppercase tracking-wider font-semibold">Gratuity Received</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-zinc-500 text-xs">₹</span>
                      <Input
                        type="number"
                        value={formData.gratuityReceived || ''}
                        onChange={e => updateField('gratuityReceived', Number(e.target.value))}
                        className="pl-8 bg-zinc-950 border-zinc-800 font-mono text-right text-sm"
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs text-zinc-400 uppercase tracking-wider font-semibold">Completed Years of Service</Label>
                    <Input
                      type="number"
                      value={formData.gratuityServiceYears || ''}
                      onChange={e => updateField('gratuityServiceYears', Number(e.target.value))}
                      className="bg-zinc-950 border-zinc-800 font-mono text-right text-sm"
                      placeholder="0"
                    />
                  </div>

                  <div className="flex items-center justify-between col-span-2 bg-zinc-950/40 border border-zinc-800 p-4 rounded-xl">
                    <div>
                      <Label className="text-xs text-zinc-300 font-semibold">Covered Under Payment of Gratuity Act (POGA)</Label>
                      <p className="text-[10px] text-zinc-500 mt-0.5">Applies POGA 15/26 calculation formula if enabled. Otherwise Non-POGA 1/2 avg salary formula.</p>
                    </div>
                    <Switch
                      checked={formData.isCoveredUnderPOGA}
                      onCheckedChange={v => updateField('isCoveredUnderPOGA', v)}
                      className="data-[state=checked]:bg-blue-500"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-zinc-900 pt-6 space-y-4">
                <h3 className="text-sm font-bold text-blue-400 uppercase tracking-wider">Leave Encashment u/s 10(10AA)</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-xs text-zinc-400 uppercase tracking-wider font-semibold">Leave Encashment Received</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-zinc-500 text-xs">₹</span>
                      <Input
                        type="number"
                        value={formData.leaveSalaryReceived || ''}
                        onChange={e => updateField('leaveSalaryReceived', Number(e.target.value))}
                        className="pl-8 bg-zinc-950 border-zinc-800 font-mono text-right text-sm"
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs text-zinc-400 uppercase tracking-wider font-semibold">Average Salary (Last 10 Months)</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-zinc-500 text-xs">₹</span>
                      <Input
                        type="number"
                        value={formData.avgSalaryLast10Months || ''}
                        onChange={e => updateField('avgSalaryLast10Months', Number(e.target.value))}
                        className="pl-8 bg-zinc-950 border-zinc-800 font-mono text-right text-sm"
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <div className="space-y-2 col-span-2">
                    <Label className="text-xs text-zinc-400 uppercase tracking-wider font-semibold">Leave Balance Credit (In Days)</Label>
                    <Input
                      type="number"
                      value={formData.leaveCreditDays || ''}
                      onChange={e => updateField('leaveCreditDays', Number(e.target.value))}
                      className="bg-zinc-950 border-zinc-800 font-mono text-right text-sm"
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* TAB 3: PERQUISITES */}
            <TabsContent value="perquisites" className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-blue-400 uppercase tracking-wider">Rent Free Accommodation (RFA)</h3>
                <div className="bg-zinc-950/40 border border-zinc-800 p-4 rounded-xl space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-zinc-400 uppercase tracking-wider font-semibold">Accommodation Type</Label>
                      <Select
                        value={formData.rentFreeAccommodation?.type || 'NONE'}
                        onValueChange={v => {
                          if (v === 'NONE') {
                            updateField('rentFreeAccommodation', undefined);
                          } else {
                            updateField('rentFreeAccommodation', {
                              type: v,
                              rentPaidByEmployer: 0,
                              amountRecoveredFromEmployee: 0
                            });
                          }
                        }}
                      >
                        <SelectTrigger className="bg-zinc-950 border-zinc-800">
                          <SelectValue placeholder="No RFA Provided" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-800">
                          <SelectItem value="NONE">No RFA Provided</SelectItem>
                          <SelectItem value="OWNED_BY_EMPLOYER">Owned by Employer</SelectItem>
                          <SelectItem value="HIRED_BY_EMPLOYER">Hired by Employer</SelectItem>
                          <SelectItem value="HOTEL">Hotel Accommodation</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {formData.rentFreeAccommodation && (
                      <>
                        <div className="space-y-2">
                          <Label className="text-xs text-zinc-400 uppercase tracking-wider font-semibold">Rent Paid by Employer (If Hired)</Label>
                          <Input
                            type="number"
                            value={formData.rentFreeAccommodation.rentPaidByEmployer || ''}
                            onChange={e => {
                              const rfa = formData.rentFreeAccommodation!;
                              updateField('rentFreeAccommodation', { ...rfa, rentPaidByEmployer: Number(e.target.value) });
                            }}
                            className="bg-zinc-950 border-zinc-800 font-mono text-right text-sm"
                            placeholder="0"
                          />
                        </div>

                        <div className="space-y-2 col-span-2">
                          <Label className="text-xs text-zinc-400 uppercase tracking-wider font-semibold">Amount Recovered from Employee</Label>
                          <Input
                            type="number"
                            value={formData.rentFreeAccommodation.amountRecoveredFromEmployee || ''}
                            onChange={e => {
                              const rfa = formData.rentFreeAccommodation!;
                              updateField('rentFreeAccommodation', { ...rfa, amountRecoveredFromEmployee: Number(e.target.value) });
                            }}
                            className="bg-zinc-950 border-zinc-800 font-mono text-right text-sm"
                            placeholder="0"
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="border-t border-zinc-900 pt-6 space-y-4">
                <h3 className="text-sm font-bold text-blue-400 uppercase tracking-wider">Motor Car Perquisite u/s 17</h3>
                <div className="bg-zinc-950/40 border border-zinc-800 p-4 rounded-xl space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-zinc-400 uppercase tracking-wider font-semibold">Car Purpose</Label>
                      <Select
                        value={formData.motorCar?.purpose || 'NONE'}
                        onValueChange={v => {
                          if (v === 'NONE') {
                            updateField('motorCar', undefined);
                          } else {
                            updateField('motorCar', {
                              purpose: v,
                              ownedBy: 'EMPLOYER',
                              expensesPaidBy: 'EMPLOYER',
                              cubicCapacityExceeds1_6L: false,
                              chauffeurProvided: false,
                              amountRecoveredFromEmployee: 0,
                              costOfCar: 0
                            });
                          }
                        }}
                      >
                        <SelectTrigger className="bg-zinc-950 border-zinc-800">
                          <SelectValue placeholder="No Car Provided" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-800">
                          <SelectItem value="NONE">No Car Provided</SelectItem>
                          <SelectItem value="FULLY_OFFICE">Fully Office Purpose (Exempt)</SelectItem>
                          <SelectItem value="FULLY_PERSONAL">Fully Personal Purpose</SelectItem>
                          <SelectItem value="PARTLY_OFFICE_PERSONAL">Partly Office & Personal (Mixed)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {formData.motorCar && formData.motorCar.purpose === 'PARTLY_OFFICE_PERSONAL' && (
                      <>
                        <div className="flex items-center justify-between col-span-2 bg-zinc-950/60 p-3 rounded-lg border border-zinc-800/80">
                          <div>
                            <Label className="text-xs text-zinc-300 font-semibold">Engine Capacity Exceeds 1.6 Litres</Label>
                            <p className="text-[10px] text-zinc-500 mt-0.5">Uses higher perquisite value (₹2,400/mo instead of ₹1,800/mo).</p>
                          </div>
                          <Switch
                            checked={formData.motorCar.cubicCapacityExceeds1_6L}
                            onCheckedChange={v => {
                              const car = formData.motorCar!;
                              updateField('motorCar', { ...car, cubicCapacityExceeds1_6L: v });
                            }}
                            className="data-[state=checked]:bg-blue-500"
                          />
                        </div>

                        <div className="flex items-center justify-between col-span-2 bg-zinc-950/60 p-3 rounded-lg border border-zinc-800/80">
                          <div>
                            <Label className="text-xs text-zinc-300 font-semibold">Chauffeur / Driver Provided by Employer</Label>
                            <p className="text-[10px] text-zinc-500 mt-0.5">Adds flat ₹900 per month perquisite value.</p>
                          </div>
                          <Switch
                            checked={formData.motorCar.chauffeurProvided}
                            onCheckedChange={v => {
                              const car = formData.motorCar!;
                              updateField('motorCar', { ...car, chauffeurProvided: v });
                            }}
                            className="data-[state=checked]:bg-blue-500"
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
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
