// Google Drive Integration Engine for Audit With Vaswani
// Server-Side Admin Approach: All uploads go to admin's Google Drive via backend
// End users never need to sign in to Google

import type { ReconciliationResult } from './reconciliation';

export interface RecoSnapshotMeta {
  id: string;
  name: string;
  companyName: string;
  financialYear: string;
  mode?: 'input' | 'output';
  moduleType?: 'gst-reco' | 'tds-reco' | 'returns' | 'consolidation' | 'cma';
  moduleName?: string;
  invoiceCount?: number;
  totalVariance?: number;
  createdTime?: string;
  createdAt?: string;
  modifiedTime?: string;
  fileSize?: string;
  userName?: string;
  machineName?: string;
  summary?: any;
}

export interface RecoSnapshotPayload {
  version: '1.0';
  timestamp: string;
  companyName: string;
  financialYear: string;
  mode?: 'input' | 'output';
  moduleType?: 'gst-reco' | 'tds-reco' | 'returns' | 'consolidation' | 'cma';
  moduleName?: string;
  results?: any[];
  debitNotes?: any;
  userName?: string;
  machineName?: string;
  summary: any;
}

// --- Helpers to resolve backend API URL ---
function getApiBase(): string {
  // In dev mode (Vite), use the dev server proxy or direct server URL
  const host = (window as any).__API_HOST || window.location.hostname || 'localhost';
  const port = '3001';
  return `http://${host}:${port}`;
}

// =============================================
// Admin Config Keys (stored locally for admin-only setup)
// =============================================
const ADMIN_CLIENT_ID_KEY = 'np_gdrive_admin_client_id';
const ADMIN_CLIENT_SECRET_KEY = 'np_gdrive_admin_client_secret';

export function getStoredAdminClientId(): string {
  return localStorage.getItem(ADMIN_CLIENT_ID_KEY) || '';
}

export function setStoredAdminClientId(id: string): void {
  localStorage.setItem(ADMIN_CLIENT_ID_KEY, id.trim());
}

export function getStoredAdminClientSecret(): string {
  return localStorage.getItem(ADMIN_CLIENT_SECRET_KEY) || '';
}

export function setStoredAdminClientSecret(secret: string): void {
  localStorage.setItem(ADMIN_CLIENT_SECRET_KEY, secret.trim());
}

// =============================================
// Status Check
// =============================================
export async function checkGDriveStatus(): Promise<{ configured: boolean; configured_at: string | null }> {
  try {
    const res = await fetch(`${getApiBase()}/api/gdrive/status`);
    if (!res.ok) return { configured: false, configured_at: null };
    return await res.json();
  } catch (e) {
    return { configured: false, configured_at: null };
  }
}

// =============================================
// Admin Setup: Exchange auth code for refresh token (one-time)
// =============================================
export async function adminSetupGDrive(
  clientId: string,
  clientSecret: string,
  authCode: string,
  redirectUri?: string
): Promise<{ success: boolean; message?: string; error?: string; details?: any }> {
  const res = await fetch(`${getApiBase()}/api/gdrive/admin-setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      auth_code: authCode,
      redirect_uri: redirectUri || window.location.origin,
    }),
  });

  return await res.json();
}

// =============================================
// Upload Snapshot (server-side, no user login needed)
// =============================================
export async function uploadRecoSnapshotToDrive(
  payload: RecoSnapshotPayload
): Promise<RecoSnapshotMeta> {
  const res = await fetch(`${getApiBase()}/api/gdrive/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(err.error || 'Failed to upload to Google Drive');
  }

  const data = await res.json();
  return data.file;
}

// =============================================
// List Snapshots (server-side)
// =============================================
export async function listDriveRecoSnapshots(): Promise<RecoSnapshotMeta[]> {
  const res = await fetch(`${getApiBase()}/api/gdrive/list`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'List failed' }));
    throw new Error(err.error || 'Failed to list Drive files');
  }
  const data = await res.json();
  return data.files || [];
}

// =============================================
// Download Snapshot (server-side)
// =============================================
export async function downloadDriveRecoSnapshot(
  fileId: string
): Promise<RecoSnapshotPayload> {
  const res = await fetch(`${getApiBase()}/api/gdrive/download/${fileId}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Download failed' }));
    throw new Error(err.error || 'Failed to download snapshot');
  }
  const data = await res.json();
  return data.payload;
}

// =============================================
// Delete Snapshot (server-side)
// =============================================
export async function deleteDriveRecoSnapshot(fileId: string): Promise<void> {
  await fetch(`${getApiBase()}/api/gdrive/delete/${fileId}`, {
    method: 'DELETE',
  });
}

// =============================================
// Disconnect (server-side)
// =============================================
export async function disconnectGoogleDrive(): Promise<void> {
  await fetch(`${getApiBase()}/api/gdrive/disconnect`, {
    method: 'POST',
  });
}

// =============================================
// Build Admin OAuth URL for one-time setup
// =============================================
export function buildAdminOAuthUrl(clientId: string): string {
  const redirectUri = encodeURIComponent(window.location.origin);
  const scope = encodeURIComponent('https://www.googleapis.com/auth/drive.file');
  return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&access_type=offline&prompt=consent`;
}

// Legacy compatibility stubs (for Reconciliation.tsx that may still reference these)
export function getStoredClientId(): string { return ''; }
export function setStoredClientId(_id: string): void {}
export function getStoredAccessToken(): string | null { return null; }
export function setStoredAccessToken(_token: string, _expiresInSec?: number): void {}
export function requestGoogleAccessToken(_clientId?: string): Promise<string> {
  return Promise.reject(new Error('Use admin setup instead'));
}

// =============================================
// Local PC Storage & Snapshot Helpers (Offline)
// =============================================
export async function saveLocalRecoSnapshot(
  payload: RecoSnapshotPayload
): Promise<RecoSnapshotMeta> {
  const res = await fetch(`${getApiBase()}/api/tds/local-snapshots/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to save snapshot locally' }));
    throw new Error(err.error || 'Failed to save snapshot locally');
  }

  return await res.json();
}

export async function listLocalRecoSnapshots(): Promise<RecoSnapshotMeta[]> {
  const res = await fetch(`${getApiBase()}/api/tds/local-snapshots`);
  if (!res.ok) throw new Error('Failed to fetch local PC history');
  return await res.json();
}

export async function downloadLocalRecoSnapshot(id: string): Promise<RecoSnapshotPayload> {
  const res = await fetch(`${getApiBase()}/api/tds/local-snapshots/${id}`);
  if (!res.ok) throw new Error('Failed to load local snapshot payload');
  return await res.json();
}

export async function deleteLocalRecoSnapshot(id: string): Promise<void> {
  const res = await fetch(`${getApiBase()}/api/tds/local-snapshots/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete local snapshot');
}
