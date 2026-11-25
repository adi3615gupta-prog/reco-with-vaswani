import { Calculator, FileCheck2, Receipt, ShieldCheck, Download, ArrowRight, Lock } from 'lucide-react';

interface WebLandingProps {
  onEnter: () => void;
}

/**
 * Public landing page for the web build (finpulse.co.in).
 * Only the browser-only tools are offered here. Everything else is desktop-only.
 */
export const WebLanding = ({ onEnter }: WebLandingProps) => (
  <div className="min-h-screen bg-slate-50 text-slate-900">
    {/* Header */}
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="FinPulse" className="h-8 w-8 rounded" />
          <span className="text-lg font-extrabold tracking-tight">FinPulse</span>
        </div>
        <button
          onClick={onEnter}
          className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-500"
        >
          Web tools kholo
        </button>
      </div>
    </header>

    {/* Hero */}
    <section className="mx-auto max-w-4xl px-6 pb-12 pt-20 text-center">
      <p className="mb-4 text-xs font-bold uppercase tracking-widest text-indigo-600">
        Chartered Accountants aur tax professionals ke liye
      </p>
      <h1 className="text-4xl font-extrabold tracking-tight md:text-5xl">
        GST aur Income Tax ka kaam, seedha browser mein.
      </h1>
      <p className="mx-auto mt-5 max-w-2xl text-base text-slate-600">
        Apni files upload karo, result aur Excel report turant paao. Koi installation nahi chahiye.
      </p>
      <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <button
          onClick={onEnter}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-bold uppercase tracking-wider text-white hover:bg-indigo-500"
        >
          Web tools shuru karein <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </section>

    {/* Web tools */}
    <section className="mx-auto max-w-6xl px-6 py-12">
      <h2 className="mb-8 text-center text-2xl font-extrabold">Web par available tools</h2>
      <div className="grid gap-6 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <FileCheck2 className="mb-4 h-8 w-8 text-indigo-600" />
          <h3 className="text-lg font-bold">GST Reconciliation</h3>
          <p className="mt-2 text-sm text-slate-600">
            Purchase register aur GSTR-2B ka matching. Mismatch, missed ITC aur Section 16(2)(aa) risk dikhata hai. Result Excel mein download hota hai.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <Calculator className="mb-4 h-8 w-8 text-indigo-600" />
          <h3 className="text-lg font-bold">Income Tax Calculator</h3>
          <p className="mt-2 text-sm text-slate-600">
            Old aur New regime ka comparison, deductions aur rebate ke saath. Salary, business, capital gains aur other income sab shamil hai.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <Receipt className="mb-4 h-8 w-8 text-slate-400" />
          <h3 className="text-lg font-bold">TDS Reconciliation</h3>
          <p className="mt-2 text-sm text-slate-600">
            Jaldi aa raha hai. Abhi yeh tool desktop app mein available hai.
          </p>
        </div>
      </div>
    </section>

    {/* Privacy */}
    <section className="mx-auto max-w-6xl px-6 py-12">
      <div className="grid gap-6 rounded-2xl bg-white p-8 shadow-sm md:grid-cols-2 md:items-center">
        <div>
          <Lock className="mb-4 h-8 w-8 text-emerald-600" />
          <h2 className="text-2xl font-extrabold">Aapka data aapke browser mein rehta hai</h2>
          <p className="mt-3 text-sm text-slate-600">
            Web tools par upload ki gayi files server par save nahi hoti. Calculation aapke computer mein hoti hai. Result save karna ho to Excel download karke rakho.
          </p>
        </div>
        <div className="flex items-start gap-3 rounded-xl bg-emerald-50 p-5 text-sm text-emerald-900">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
          <p>Client data kisi cloud server par nahi bheja jaata.</p>
        </div>
      </div>
    </section>

    {/* Desktop download */}
    <section className="mx-auto max-w-6xl px-6 py-12">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <Download className="mx-auto mb-4 h-8 w-8 text-indigo-600" />
        <h2 className="text-2xl font-extrabold">Desktop App</h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-600">
          Tally connection, GST portal se automatic download, aur saved client data ke liye Windows desktop app use karo.
        </p>
        <button
          disabled
          className="mt-6 inline-flex cursor-not-allowed items-center gap-2 rounded-xl bg-slate-200 px-6 py-3 text-sm font-bold uppercase tracking-wider text-slate-500"
        >
          <Download className="h-4 w-4" /> Download jaldi aayega
        </button>
      </div>
    </section>

    {/* Footer */}
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl px-6 py-6 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} FinPulse. Sab adhikar surakshit.
      </div>
    </footer>
  </div>
);
