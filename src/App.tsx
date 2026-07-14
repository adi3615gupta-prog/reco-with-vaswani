import React, { Component, ErrorInfo, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/authContext";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import LivePreviewWindow from "./pages/LivePreviewWindow.tsx";
import TBImportFullscreen from "./pages/TBImportFullscreen.tsx";
import IncomeTaxDashboard from "./pages/IncomeTaxDashboard.tsx";

const queryClient = new QueryClient();

class GlobalErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; errorMsg: string }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMsg: "" };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorMsg: error.message + "\n" + error.stack };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Caught by boundary:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "40px", background: "#1e1e1e", color: "#ff4a4a", minHeight: "100vh", fontFamily: "monospace", zIndex: 999999, position: "relative" }}>
          <h1 style={{ fontSize: "2rem", marginBottom: "20px" }}>UI Crash Detected</h1>
          <p>Please send this exact error text to the developer:</p>
          <pre style={{ background: "#000", padding: "20px", borderRadius: "8px", overflowX: "auto", whiteSpace: "pre-wrap" }}>
            {this.state.errorMsg}
          </pre>
          <button 
            onClick={() => {
               sessionStorage.clear();
               localStorage.removeItem('np_auth');
               window.location.reload();
            }}
            style={{ marginTop: "20px", padding: "10px 20px", background: "#ff4a4a", color: "white", border: "none", cursor: "pointer" }}>
            Hard Reset Session
          </button>
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
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/live-preview" element={<LivePreviewWindow />} />
                <Route path="/mapping-fullscreen" element={<TBImportFullscreen />} />
                <Route path="/income-tax-calculator" element={<IncomeTaxDashboard />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </HashRouter>
          </div>
        </TooltipProvider>
      </QueryClientProvider>
    </AuthProvider>
  </GlobalErrorBoundary>
);

export default App;
