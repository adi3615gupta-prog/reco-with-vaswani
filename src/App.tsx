import React, { Component, ErrorInfo, ReactNode, lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Route, Routes } from "react-router-dom";
import { AlertTriangle, Copy, Check, RotateCcw, Home } from "lucide-react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/authContext";
import Index from "./pages/Index.tsx";

// Route-level code splitting via React.lazy
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const LivePreviewWindow = lazy(() => import("./pages/LivePreviewWindow.tsx"));
const TBImportFullscreen = lazy(() => import("./pages/TBImportFullscreen.tsx"));
const IncomeTaxDashboard = lazy(() => import("./pages/IncomeTaxDashboard.tsx"));
const ClientImsReview = lazy(() => import("./pages/ClientImsReview.tsx"));
const GstNoticesDashboard = lazy(() => import("./pages/GstNoticesDashboard.tsx"));

const RouteLoadingFallback = () => (
  <div className="flex h-screen w-screen items-center justify-center bg-[var(--np-bg,#F8FAFC)] text-slate-700 font-sans">
    <div className="flex flex-col items-center gap-3.5 p-6 rounded-2xl bg-white/90 border border-slate-200 shadow-sm">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      <div className="text-xs font-bold tracking-wider text-slate-600 uppercase">Loading Enterprise Suite...</div>
    </div>
  </div>
);

const queryClient = new QueryClient();

class GlobalErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; errorMsg: string; copied: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMsg: "", copied: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorMsg: error.message + "\n" + error.stack, copied: false };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Caught by boundary:", error, errorInfo);
  }

  handleCopy = () => {
    navigator.clipboard.writeText(this.state.errorMsg);
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
                <p className="text-xs text-slate-400 mt-0.5">A runtime error occurred in the active view. You can reload or copy diagnostic details.</p>
              </div>
            </div>

            <pre className="max-h-64 overflow-y-auto p-4 rounded-xl bg-slate-900/90 border border-slate-800 text-xs font-mono text-rose-300 leading-relaxed whitespace-pre-wrap select-all">
              {this.state.errorMsg}
            </pre>

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
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </HashRouter>
          </div>
        </TooltipProvider>
      </QueryClientProvider>
    </AuthProvider>
  </GlobalErrorBoundary>
);

export default App;
