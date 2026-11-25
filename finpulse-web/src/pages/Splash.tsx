import React, { useState, useEffect } from 'react';
import { Building2 } from 'lucide-react';
import { HorizonPageLoader } from '@/components/ui/horizon-page-loader';

interface SplashProps {
  onComplete: () => void;
  themeStyles: string;
}

export default function Splash({ onComplete, themeStyles }: SplashProps) {
  const [isFading, setIsFading] = useState(false);
  const [phaseIndex, setPhaseIndex] = useState(0);

  const phases = [
    "Authenticating filing session...",
    "Mounting GST Reco & Verification Matrix...",
    "Synchronizing Tally & Audit Vaults...",
    "Preparing your workspace..."
  ];

  useEffect(() => {
    // Step through loading phases
    const stepInterval = setInterval(() => {
      setPhaseIndex((prev) => (prev < phases.length - 1 ? prev + 1 : prev));
    }, 700);

    // Fade out slightly before onComplete
    const fadeTimer = setTimeout(() => {
      setIsFading(true);
    }, 2800);

    const finishTimer = setTimeout(() => {
      onComplete();
    }, 3400);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onComplete();
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearInterval(stepInterval);
      clearTimeout(fadeTimer);
      clearTimeout(finishTimer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onComplete, phases.length]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: themeStyles }} />
      <div 
        className={`fixed inset-0 z-[99999] transition-opacity duration-700 ease-in-out ${isFading ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
      >
        <HorizonPageLoader
          mode="fixed"
          accent="#818cf8"
          speed={2200}
          eyebrow="VASWANI ENTERPRISE ASSURANCE"
          label={phases[phaseIndex]}
          className="bg-[#070913]"
        >
          {/* Logo & Headline */}
          <div className="flex flex-col items-center mb-2 animate-pop-in">
            <div className="relative flex items-center justify-center mb-5">
              <div className="absolute inset-0 bg-blue-500/25 blur-[45px] rounded-full scale-150 animate-pulse" />
              <img
                src="./logo.png"
                alt="Logo"
                className="w-20 h-20 object-contain drop-shadow-[0_0_30px_rgba(59,130,246,0.8)] relative z-10"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.nextElementSibling?.classList.remove('hidden');
                }}
              />
              <Building2 className="w-16 h-16 hidden text-indigo-400 drop-shadow-[0_0_25px_rgba(99,102,241,0.8)] relative z-10" />
            </div>

            <h1 className="text-3xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400 tracking-tight drop-shadow-lg">
              AUDIT WITH VASWANI
            </h1>
            <p className="text-[11px] font-mono tracking-[0.25em] text-slate-400 uppercase mt-1">
              Offline Compliance &amp; Reconciliation Engine
            </p>
          </div>
        </HorizonPageLoader>

        {/* Quick Skip button in bottom center */}
        <button
          type="button"
          onClick={onComplete}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100000] text-[10px] font-mono tracking-widest text-slate-500 hover:text-slate-300 transition-colors uppercase cursor-pointer px-3 py-1 rounded-full border border-slate-800/80 bg-slate-900/60 backdrop-blur-xs"
        >
          Skip Transition [ESC]
        </button>
      </div>
    </>
  );
}
