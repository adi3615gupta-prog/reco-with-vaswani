/**
 * useScopedTallySession.ts
 *
 * Scoped Tally Port 9000 Session Lifecycle Hook.
 * Guarantees that:
 * 1. Each module (TDS, Bank CMA, Clause 44, Financial Statements, Audit, Suite 09) owns its separate Tally session.
 * 2. Connection is alive while the user is inside the module.
 * 3. Navigating away / unmounting the component IMMEDIATELY disconnects and purges cached Tally metadata.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  pingTally,
  fetchCompanyInfo,
  clearTallyMetadataCache,
  type TallyConnectionConfig,
  type TallyCompanyInfo
} from '@/lib/tallyApi';

export type TallySessionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ScopedTallySession {
  moduleKey: string;
  port: number;
  setPort: (port: number) => void;
  status: TallySessionStatus;
  isConnected: boolean;
  companyInfo: TallyCompanyInfo | null;
  errorMessage: string | null;
  config: TallyConnectionConfig;
  connect: () => Promise<boolean>;
  disconnect: () => void;
  ping: () => Promise<boolean>;
}

export function useScopedTallySession(moduleKey: string, initialPort: number = 9000): ScopedTallySession {
  const [port, setPortState] = useState<number>(() => {
    try {
      const stored = localStorage.getItem(`tally_port_${moduleKey}`);
      if (stored) {
        const parsed = parseInt(stored, 10);
        if (!isNaN(parsed) && parsed > 0 && parsed <= 65535) return parsed;
      }
    } catch {
      // Storage unavailable fallback
    }
    return initialPort;
  });

  const [status, setStatus] = useState<TallySessionStatus>('disconnected');
  const [companyInfo, setCompanyInfo] = useState<TallyCompanyInfo | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isMountedRef = useRef<boolean>(true);

  const setPort = useCallback((newPort: number) => {
    setPortState(newPort);
    try {
      localStorage.setItem(`tally_port_${moduleKey}`, String(newPort));
    } catch {
      // Safe fallback
    }
  }, [moduleKey]);

  const config: TallyConnectionConfig = useMemo(() => ({
    host: 'localhost',
    port
  }), [port]);

  const disconnect = useCallback(() => {
    setStatus('disconnected');
    setCompanyInfo(null);
    setErrorMessage(null);
    clearTallyMetadataCache();
  }, []);

  const ping = useCallback(async (): Promise<boolean> => {
    try {
      return await pingTally(config);
    } catch {
      return false;
    }
  }, [config]);

  const connect = useCallback(async (): Promise<boolean> => {
    setStatus('connecting');
    setErrorMessage(null);
    try {
      const isAlive = await pingTally(config);
      if (!isAlive) {
        if (isMountedRef.current) {
          setStatus('error');
          setErrorMessage(`TallyPrime server not reachable on port ${port}. Ensure Tally is open with XML API enabled.`);
        }
        return false;
      }

      const info = await fetchCompanyInfo(config);
      if (isMountedRef.current) {
        setCompanyInfo(info);
        setStatus('connected');
        setErrorMessage(null);
      }
      return true;
    } catch (err: any) {
      if (isMountedRef.current) {
        setStatus('error');
        setErrorMessage(err?.message || `Failed to connect to Tally on port ${port}.`);
      }
      return false;
    }
  }, [config, port]);

  // ─── STRICT UNMOUNT TEARDOWN LIFECYCLE ──────────────────────────────────────
  // When user navigates away from this module, the component unmounts.
  // We instantly sever the connection, wipe local company state and metadata caches.
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      disconnect();
    };
  }, [moduleKey, disconnect]);

  return {
    moduleKey,
    port,
    setPort,
    status,
    isConnected: status === 'connected',
    companyInfo,
    errorMessage,
    config,
    connect,
    disconnect,
    ping
  };
}

