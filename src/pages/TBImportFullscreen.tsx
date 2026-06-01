import React from 'react';
import TBImportMapping from '@/components/finstatements/TBImportMapping';
import { Building2 } from 'lucide-react';

export default function TBImportFullscreen() {
  return (
    <div className="min-h-screen bg-[#090d16] flex flex-col font-sans text-slate-200">
      {/* Minimal Header */}
      <div className="h-14 border-b border-white/5 bg-[rgba(15,23,42,0.6)] backdrop-blur-md flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.3)]">
            <Building2 className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-black tracking-widest text-white uppercase flex items-center gap-2">
              Reco With Vaswani <span className="text-[10px] bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded">FULLSCREEN</span>
            </h1>
          </div>
        </div>
        <div className="text-xs text-slate-500 font-medium">
          Trial Balance Mapping Mode
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-6 flex flex-col overflow-hidden">
        {/* We wrap TBImportMapping in a container that forces it to take remaining height. 
            Since TBImportMapping internally uses a fixed height class, we might need to override it 
            or just let it render. We will adjust TBImportMapping's internal height to flex-1. */}
        <div className="flex-1 flex flex-col min-h-0 [&>div]:flex-1 [&>div]:min-h-0">
          <TBImportMapping onDataChanged={() => {}} fullScreen={true} />
        </div>
      </div>
    </div>
  );
}
