import React, { useEffect, useState } from 'react';
import FinancialReports from '@/components/finstatements/FinancialReports';
import { Eye } from 'lucide-react';

export default function LivePreviewWindow() {
  const [trigger, setTrigger] = useState(0);

  useEffect(() => {
    // Listen for cross-window localStorage changes
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'fs_trial_balance') {
        setTrigger(t => t + 1);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  return (
    <div className="min-h-screen bg-[var(--np-bg)] p-6">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex items-center gap-2 mb-2 px-2 text-cyan-400 font-bold uppercase tracking-widest text-sm">
          <Eye className="w-5 h-5" /> Live Preview - Auto Syncing
        </div>
        {/* Force re-render of FinancialReports on trigger change */}
        <FinancialReports key={trigger} />
      </div>
    </div>
  );
}
