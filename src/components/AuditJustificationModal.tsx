import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  AuditActionType,
  AuditOverrideRecord,
  recordOverrideLog,
  getActivePractitioner,
} from '@/lib/auditTrailService';
import { ShieldCheck, AlertCircle, Clock, User, ArrowRight } from 'lucide-react';

export const STATUTORY_PRESETS = [
  'Vendor confirmed invoice typo in GSTR-1 (Statutory correction acknowledged)',
  'Rounding difference under statutory tolerance accepted by recipient (Rule 37 compliant)',
  'Credit/Debit note adjusted against previous period invoice',
  'Party legal name variation verified against PAN master records',
  'Custom practitioner note...',
] as const;

export interface AuditJustificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (justification: string, auditRecord: AuditOverrideRecord) => void;
  actionType: AuditActionType;
  targetStatus: string;
  originalStatus?: string;
  prRecord?: any;
  twoBRecord?: any;
  companyName?: string;
  clientGstin?: string;
  taxableDiff?: number;
  gstDiff?: number;
}

export const AuditJustificationModal: React.FC<AuditJustificationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  actionType,
  targetStatus,
  originalStatus,
  prRecord,
  twoBRecord,
  companyName,
  clientGstin,
  taxableDiff = 0,
  gstDiff = 0,
}) => {
  const [selectedPreset, setSelectedPreset] = useState<string>(STATUTORY_PRESETS[0]);
  const [customJustification, setCustomJustification] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [practitioner, setPractitioner] = useState<string>('Practitioner');
  const [currentTimestamp, setCurrentTimestamp] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setPractitioner(getActivePractitioner());
      setCurrentTimestamp(new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }));
      setSelectedPreset(STATUTORY_PRESETS[0]);
      setCustomJustification('');
      setIsSubmitting(false);
    }
  }, [isOpen]);

  const activeJustification =
    selectedPreset === 'Custom practitioner note...' ? customJustification.trim() : selectedPreset;

  const isValid = activeJustification.length >= 5;

  const handlePresetSelect = (preset: string) => {
    setSelectedPreset(preset);
    if (preset !== 'Custom practitioner note...') {
      setCustomJustification('');
    }
  };

  const handleConfirm = async () => {
    if (!isValid || isSubmitting) return;

    try {
      setIsSubmitting(true);
      const prInv = prRecord?.invoiceNo || prRecord?.invoiceNoPR || prRecord?.voucherNo || null;
      const tbInv = twoBRecord?.invoiceNo || twoBRecord?.invoiceNo2B || null;

      const record = await recordOverrideLog({
        action_type: actionType,
        new_status: targetStatus,
        original_status: originalStatus || 'Mismatch',
        justification: activeJustification,
        company_name: companyName,
        client_gstin: clientGstin || prRecord?.gstin || twoBRecord?.gstin,
        invoice_no_pr: prInv,
        invoice_no_2b: tbInv,
        taxable_diff: taxableDiff,
        gst_diff: gstDiff,
        practitioner_username: practitioner,
        metadata: {
          prRecord: prRecord ? { invoiceNo: prInv, taxable: prRecord.taxableValue, tax: prRecord.cgst } : null,
          twoBRecord: twoBRecord ? { invoiceNo: tbInv, taxable: twoBRecord.taxableValue, tax: twoBRecord.cgst } : null,
        },
      });

      onConfirm(activeJustification, record);
      onClose();
    } catch (err: any) {
      console.error('[Audit Modal] Override record error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl bg-slate-900 border border-slate-700 text-slate-100 shadow-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
            <DialogTitle className="text-lg font-semibold tracking-wide text-white">
              Statutory Reconciliation Override & Audit Log
            </DialogTitle>
          </div>
          <DialogDescription className="text-slate-400 text-xs">
            Section 16(2)(aa) CGST Compliance: Manual status mutations require a verifiable statutory justification and are permanently recorded in the immutable audit trail.
          </DialogDescription>
        </DialogHeader>

        {/* Practitioner Metadata Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-md bg-slate-800/80 border border-slate-700/60 text-xs text-slate-300">
          <div className="flex items-center gap-1.5">
            <User className="h-3.5 w-3.5 text-sky-400" />
            <span>Practitioner:</span>
            <span className="font-semibold text-white">{practitioner}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-amber-400" />
            <span>Timestamp:</span>
            <span className="font-mono text-slate-200">{currentTimestamp}</span>
          </div>
          <Badge variant="outline" className="bg-emerald-950/60 text-emerald-400 border-emerald-700/60 font-mono text-[10px]">
            {actionType}
          </Badge>
        </div>

        {/* Before vs After Record Comparison */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-md bg-slate-800/50 border border-slate-700/70 space-y-1.5">
            <div className="text-[11px] font-semibold text-sky-300 uppercase tracking-wider flex items-center justify-between">
              <span>Books (PR) Record</span>
              <Badge variant="secondary" className="text-[10px] bg-slate-700 text-slate-300">
                {originalStatus || 'Original Status'}
              </Badge>
            </div>
            <div className="text-slate-300">
              <span className="text-slate-500">Invoice:</span>{' '}
              <span className="font-mono text-white">{prRecord?.invoiceNo || prRecord?.invoiceNoPR || 'N/A'}</span>
            </div>
            <div className="text-slate-300">
              <span className="text-slate-500">Taxable:</span>{' '}
              <span className="font-mono">₹{(prRecord?.taxableValue || prRecord?.taxableValuePR || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="text-slate-300">
              <span className="text-slate-500">GST:</span>{' '}
              <span className="font-mono">
                ₹{((prRecord?.igst || prRecord?.igstPR || 0) + (prRecord?.cgst || prRecord?.cgstPR || 0) + (prRecord?.sgst || prRecord?.sgstPR || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <div className="p-3 rounded-md bg-slate-800/50 border border-slate-700/70 space-y-1.5">
            <div className="text-[11px] font-semibold text-emerald-300 uppercase tracking-wider flex items-center justify-between">
              <span>Govt (2B) Record</span>
              <Badge variant="secondary" className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-700/60">
                <ArrowRight className="h-2.5 w-2.5 mr-1 inline" />
                {targetStatus}
              </Badge>
            </div>
            <div className="text-slate-300">
              <span className="text-slate-500">Invoice:</span>{' '}
              <span className="font-mono text-white">{twoBRecord?.invoiceNo || twoBRecord?.invoiceNo2B || 'N/A'}</span>
            </div>
            <div className="text-slate-300">
              <span className="text-slate-500">Taxable:</span>{' '}
              <span className="font-mono">₹{(twoBRecord?.taxableValue || twoBRecord?.taxableValue2B || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="text-slate-300">
              <span className="text-slate-500">GST:</span>{' '}
              <span className="font-mono">
                ₹{((twoBRecord?.igst || twoBRecord?.igst2B || 0) + (twoBRecord?.cgst || twoBRecord?.cgst2B || 0) + (twoBRecord?.sgst || twoBRecord?.sgst2B || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        {/* Variance Summary */}
        {(Math.abs(taxableDiff) > 0 || Math.abs(gstDiff) > 0) && (
          <div className="flex items-center justify-between px-3 py-1.5 rounded bg-amber-950/30 border border-amber-800/50 text-[11px] text-amber-300">
            <div className="flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
              <span>Overriding Active Discrepancy:</span>
            </div>
            <div className="space-x-3 font-mono">
              <span>Taxable Diff: ₹{taxableDiff.toFixed(2)}</span>
              <span>GST Diff: ₹{gstDiff.toFixed(2)}</span>
            </div>
          </div>
        )}

        {/* Statutory Justification Selection */}
        <div className="space-y-2 text-xs">
          <label className="font-medium text-slate-200">
            Statutory Justification <span className="text-rose-400">*</span>
          </label>
          <div className="space-y-1.5">
            {STATUTORY_PRESETS.map((preset) => (
              <label
                key={preset}
                className={`flex items-start gap-2 p-2 rounded cursor-pointer border transition-colors ${
                  selectedPreset === preset
                    ? 'bg-sky-950/40 border-sky-600 text-sky-200'
                    : 'bg-slate-800/40 border-slate-700/70 text-slate-300 hover:bg-slate-800'
                }`}
                onClick={() => handlePresetSelect(preset)}
              >
                <input
                  type="radio"
                  name="audit_preset"
                  checked={selectedPreset === preset}
                  onChange={() => handlePresetSelect(preset)}
                  className="mt-0.5 accent-sky-500"
                />
                <span className="text-xs leading-tight">{preset}</span>
              </label>
            ))}
          </div>

          {selectedPreset === 'Custom practitioner note...' && (
            <div className="space-y-1 pt-1">
              <Textarea
                placeholder="Enter detailed statutory/audit reason for this override..."
                value={customJustification}
                onChange={(e) => setCustomJustification(e.target.value)}
                className="bg-slate-800 border-slate-700 text-slate-100 text-xs min-h-[70px]"
                rows={3}
              />
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>Required for statutory audit defense</span>
                <span className={customJustification.trim().length >= 5 ? 'text-emerald-400' : 'text-amber-400 font-medium'}>
                  {customJustification.trim().length} / 5 chars minimum
                </span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="pt-2 flex items-center justify-between border-t border-slate-800">
          <span className="text-[11px] text-slate-400">
            Action will be logged permanently with ID & timestamp
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
              className="border-slate-700 text-slate-300 hover:bg-slate-800 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirm}
              disabled={!isValid || isSubmitting}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs px-4"
            >
              {isSubmitting ? 'Recording...' : 'Confirm & Log Override'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
