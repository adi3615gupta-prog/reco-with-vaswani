import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface RecoContextType {
  mode: any; setMode: any;
  step: any; setStep: any;
  companyName: any; setCompanyName: any;
  tolerance: any; setTolerance: any;
  fuzzyStrictness: any; setFuzzyStrictness: any;
  processing: any; setProcessing: any;
  progressValue: any; setProgressValue: any;
  results: any[]; setResults: any;
  summary: any; setSummary: any;
  parsedDebitNotes: any[]; setParsedDebitNotes: any;
  gstr3bData: any; setGstr3bData: any;
}

const RecoContext = createContext<RecoContextType | undefined>(undefined);

export function RecoProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<any>(() => (sessionStorage.getItem('np_reco_mode') as any) || null);
  const [step, setStep] = useState<any>(() => (sessionStorage.getItem('np_reco_step') as any) || 'upload');
  const [companyName, setCompanyName] = useState<string>(() => sessionStorage.getItem('np_reco_company') || '');
  const [tolerance, setTolerance] = useState<number>(() => parseFloat(sessionStorage.getItem('np_reco_tolerance') || '2'));
  const [fuzzyStrictness, setFuzzyStrictness] = useState<any>(() => sessionStorage.getItem('np_reco_fuzzy') || 'medium');
  const [processing, setProcessing] = useState(false);
  const [progressValue, setProgressValue] = useState(0);
  const [results, setResults] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({ total: 0, perfectMatch: 0, valueMismatch: 0, missingInPortal: 0, missingInBooks: 0 });
  const [parsedDebitNotes, setParsedDebitNotes] = useState<any[]>([]);
  const [gstr3bData, setGstr3bData] = useState<any>(null);

  useEffect(() => { sessionStorage.setItem('np_reco_mode', mode || ''); }, [mode]);
  useEffect(() => { sessionStorage.setItem('np_reco_step', step); }, [step]);
  useEffect(() => { sessionStorage.setItem('np_reco_company', companyName); }, [companyName]);
  useEffect(() => { sessionStorage.setItem('np_reco_tolerance', tolerance.toString()); }, [tolerance]);
  useEffect(() => { sessionStorage.setItem('np_reco_fuzzy', fuzzyStrictness); }, [fuzzyStrictness]);

  return (
    <RecoContext.Provider value={{
      mode, setMode, step, setStep, companyName, setCompanyName,
      tolerance, setTolerance, fuzzyStrictness, setFuzzyStrictness,
      processing, setProcessing, progressValue, setProgressValue,
      results, setResults, summary, setSummary,
      parsedDebitNotes, setParsedDebitNotes, gstr3bData, setGstr3bData
    }}>
      {children}
    </RecoContext.Provider>
  );
}

export const useReco = () => {
  const context = useContext(RecoContext);
  if (!context) throw new Error('useReco must be used within RecoProvider');
  return context;
};
