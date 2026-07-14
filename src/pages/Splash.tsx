import { useState, useEffect, useMemo } from 'react';
import { Building2 } from 'lucide-react';

interface SplashProps {
  onComplete: () => void;
  themeStyles: string;
}

export default function Splash({ onComplete, themeStyles }: SplashProps) {
  const [isFadingSplash, setIsFadingSplash] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [loadingPercent, setLoadingPercent] = useState(0);

  const particles = useMemo(() => {
    return [...Array(40)].map((_, i) => {
      const size = Math.random() * 4 + 1;
      return {
        left: `${Math.random() * 100}%`,
        size: `${size}px`,
        duration: `${Math.random() * 4 + 3}s`,
        delay: `${Math.random() * 3}s`,
        opacity: Math.random() * 0.5 + 0.3,
        shadow: `0 0 ${size * 3}px rgba(255, 255, 255, 0.9)`
      };
    });
  }, []);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setIsFadingSplash(true), 5000);
    const removeTimer = setTimeout(() => onComplete(), 6000);
    
    const counterTimer = setTimeout(() => {
      const start = Date.now();
      const duration = 3500;
      const animate = () => {
        const elapsed = Date.now() - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = Math.pow(progress, 4);
        setLoadingPercent(Math.floor(eased * 100));
        if (progress < 1) requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
    }, 1500);

    return () => { clearTimeout(fadeTimer); clearTimeout(removeTimer); clearTimeout(counterTimer); };
  }, [onComplete]);

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: themeStyles}} />
      <div 
        className={`fixed inset-0 z-[99999] bg-slate-950 flex flex-col items-center justify-center overflow-hidden transition-opacity duration-1000 ease-in-out ${isFadingSplash ? 'opacity-0' : 'opacity-100'}`}
        onMouseMove={(e) => {
          const x = (e.clientX / window.innerWidth - 0.5) * 35;
          const y = (e.clientY / window.innerHeight - 0.5) * -35;
          setTilt({ x, y });
        }}
        onMouseLeave={() => setTilt({ x: 0, y: 0 })}
      >
        <video autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover opacity-50 mix-blend-screen pointer-events-none" style={{ filter: 'contrast(1.2) saturate(1.2)' }}>
          <source src="./intro.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-gradient-to-tr from-[#090d16]/90 via-[#090d16]/60 to-purple-950/40 pointer-events-none"></div>
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          {particles.map((p, i) => <div key={i} className="particle" style={{ left: p.left, width: p.size, height: p.size, animationDuration: p.duration, animationDelay: p.delay, opacity: p.opacity, boxShadow: p.shadow }} />)}
        </div>
        <div className="relative z-10 flex flex-col items-center animate-pop-in">
          <div className="relative flex items-center justify-center mb-8 transition-transform duration-200 ease-out" style={{ transform: `perspective(1000px) rotateX(${tilt.y}deg) rotateY(${tilt.x}deg) scale3d(1.05, 1.05, 1.05)` }}>
            <div className="absolute inset-0 bg-blue-500/20 blur-[50px] rounded-full scale-150 animate-pulse"></div>
            <img src="./logo.png" alt="Logo" className="w-28 h-28 object-contain drop-shadow-[0_0_25px_rgba(59,130,246,0.8)]" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }} />
            <Building2 className="w-24 h-24 hidden text-blue-400 drop-shadow-[0_0_25px_rgba(59,130,246,0.8)]" />
          </div>
          <h1 className="text-4xl md:text-6xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400 tracking-tight mb-6 drop-shadow-lg animate-tracking-in" style={{ animationDelay: '0.2s' }}>RECO WITH VASWANI</h1>
          <div className="h-px w-32 bg-gradient-to-r from-transparent via-slate-400 to-transparent mb-6 opacity-50"></div>
          <div className="mt-2"><p className="text-white text-lg md:text-xl font-medium tracking-wide flex items-center gap-2 animate-slow-reveal" style={{ animationDelay: '1.2s' }}>Made by <span className="font-black tracking-widest uppercase">Sourav Vaswani</span></p></div>
          <div className="w-64 max-w-[80vw] h-1 bg-slate-800/60 rounded-full mt-12 overflow-hidden relative backdrop-blur-md shadow-inner animate-slow-reveal" style={{ animationDelay: '1.5s' }}><div className="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-500 via-indigo-400 to-purple-500 rounded-full animate-progress-fill shadow-[0_0_15px_rgba(99,102,241,1)]"></div></div>
          <div className="mt-3 text-blue-400/80 font-mono text-[10px] tracking-[0.3em] uppercase font-bold animate-slow-reveal flex items-center justify-between w-64 px-1" style={{ animationDelay: '1.5s' }}><span>Initializing Engine</span><span className="text-white">{loadingPercent}%</span></div>
        </div>
      </div>
    </>
  );
}