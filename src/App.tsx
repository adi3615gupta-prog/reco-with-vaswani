import React, { Component, ErrorInfo, ReactNode, lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Route, Routes } from "react-router-dom";
import { AlertTriangle, Copy, Check, RotateCcw, Home } from "lucide-react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { AuthProvider } from "@/lib/authContext";
import Index from "./pages/Index.tsx";
import ClothingRailHeroDemo from "@/components/ui/product-rail-gallery.demo";
import CommandHubPreview from "./pages/CommandHubPreview";

// Route-level code splitting via React.lazy
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const LivePreviewWindow = lazy(() => import("./pages/LivePreviewWindow.tsx"));
const TBImportFullscreen = lazy(() => import("./pages/TBImportFullscreen.tsx"));
const IncomeTaxDashboard = lazy(() => import("./pages/IncomeTaxDashboard.tsx"));
const ClientImsReview = lazy(() => import("./pages/ClientImsReview.tsx"));
const GstNoticesDashboard = lazy(() => import("./pages/GstNoticesDashboard.tsx"));
const TallyXmlSuite = lazy(() => import("./pages/TallyXmlSuite.tsx"));
const MonthlyAuditSuite = lazy(() => import("./pages/MonthlyAuditSuite.tsx"));
const LandingPage = lazy(() => import("./pages/LandingPage.tsx"));
const PerspectiveTunnelDemo = lazy(() => import("./pages/PerspectiveTunnelDemo.tsx"));
const Splash = lazy(() => import("./pages/Splash.tsx"));

const RouteLoadingFallback = () => (
  <div className="flex h-screen w-screen items-center justify-center bg-[var(--np-bg,#F8FAFC)] text-slate-700 font-sans">
    <div className="flex flex-col items-center gap-3.5 p-6 rounded-2xl bg-white/90 border border-slate-200 shadow-sm">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      <div className="text-xs font-bold tracking-wider text-slate-600 uppercase">Loading Enterprise Suite...</div>
    </div>
  </div>
);

const queryClient = new QueryClient();

function scrubSensitivePaths(str: string): string {
  return (str || '').replace(/([A-Za-z]:)?(\\|\/)(Users|home|root)(\\|\/)[^\\\/]+/gi, '[PATH_REDACTED]');
}

class GlobalErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; errorMessage: string; errorStack: string; copied: boolean; showDiagnostics: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: "", errorStack: "", copied: false, showDiagnostics: false };
  }

  static getDerivedStateFromError(error: Error) {
    const scrubbedMsg = scrubSensitivePaths(error.message || 'An unexpected runtime error occurred.');
    const scrubbedStack = scrubSensitivePaths(error.stack || '');
    return { hasError: true, errorMessage: scrubbedMsg, errorStack: scrubbedStack, copied: false, showDiagnostics: false };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Caught by boundary:", error, errorInfo);
  }

  handleCopy = () => {
    const fullLog = `${this.state.errorMessage}\n\nTechnical Stack:\n${this.state.errorStack}`;
    navigator.clipboard.writeText(fullLog);
    this.setState({ copied: true });
    setTimeout(() => this.setState({ copied: false }), 2000);
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-6 font-sans">
          <div className="max-w-2xl w-full bg-slate-950 border border-slate-800 rounded-3xl p-8 shadow-2xl space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white tracking-tight">Application Interface Interrupted</h1>
                <p className="text-xs text-slate-400 mt-0.5">A runtime error occurred in the active view. You can reload or inspect diagnostic details.</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 text-xs font-mono text-rose-300 leading-relaxed whitespace-pre-wrap select-all">
              {this.state.errorMessage}
            </div>

            <details className="group">
              <summary className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer font-medium select-none list-none flex items-center gap-1.5">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">▶ Toggle Technical Stack Trace</span>
              </summary>
              <pre className="mt-2 max-h-48 overflow-y-auto p-3 rounded-lg bg-black/40 border border-slate-800 text-[11px] font-mono text-slate-400 leading-relaxed whitespace-pre-wrap select-all">
                {this.state.errorStack || 'No stack trace available.'}
              </pre>
            </details>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/80">
              <button
                type="button"
                onClick={this.handleCopy}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
              >
                {this.state.copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                {this.state.copied ? "Copied Diagnostics" : "Copy Error Details"}
              </button>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    sessionStorage.clear();
                    localStorage.removeItem('np_auth');
                    window.location.reload();
                  }}
                  className="px-4 py-2.5 rounded-xl border border-slate-700 hover:bg-slate-800/80 text-slate-400 hover:text-white text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Home className="w-4 h-4" /> Reset Session
                </button>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition-all cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" /> Reload Page
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const App = () => (
  <GlobalErrorBoundary>
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ConfirmProvider>
            <Toaster />
            <Sonner />
            <div className="min-h-screen bg-[var(--np-bg)] text-[var(--np-text)] selection:bg-[var(--np-sky)]/30 selection:text-white">
              <HashRouter>
                <Suspense fallback={<RouteLoadingFallback />}>
                  <Routes>
                    <Route path="/" element={<Index />} />
                    <Route path="/live-preview" element={<LivePreviewWindow />} />
                    <Route path="/mapping-fullscreen" element={<TBImportFullscreen />} />
                    <Route path="/income-tax-calculator" element={<IncomeTaxDashboard />} />
                    <Route path="/gst-notices" element={<GstNoticesDashboard />} />
                    <Route path="/ims-review/:token" element={<ClientImsReview />} />
                    <Route path="/tally-xml" element={<TallyXmlSuite onBack={() => { window.location.hash = '#/'; }} />} />
                    <Route path="/monthly-audit" element={<MonthlyAuditSuite onBack={() => { window.location.hash = '#/'; }} />} />
                    <Route path="/landing" element={<LandingPage />} />
                    <Route path="/tunnel-demo" element={<PerspectiveTunnelDemo />} />
                    <Route path="/rail-demo" element={<ClothingRailHeroDemo />} />
                    <Route path="/command-hub-preview" element={<CommandHubPreview />} />
                    <Route path="/splash"element={<Splash themeStyles="" onComplete={() => { window.location.hash = '#/'; }} />} />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Suspense>
              </HashRouter>
            </div>
          </ConfirmProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </AuthProvider>
  </GlobalErrorBoundary>
);

export default App;
