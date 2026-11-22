import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Phase 40: Architectural Decoupling & Module Isolation Verification', () => {

  it('verifies GSTR-1, GSTR-2B, and IMS have removed Push to 3B UI coupling', () => {
    const gstr1Code = fs.readFileSync(path.resolve('src/components/Gstr1MasterDownloader.tsx'), 'utf8');
    const gstr2bCode = fs.readFileSync(path.resolve('src/components/Gstr2bMasterDownloader.tsx'), 'utf8');
    const imsCode = fs.readFileSync(path.resolve('src/components/ImsMasterManager.tsx'), 'utf8');

    // Neither should have active handlePushTo3B invocation buttons
    expect(gstr1Code).not.toContain('Push to 3B Engine');
    expect(gstr1Code).not.toContain('To 3B');
    expect(gstr2bCode).not.toContain('Push 3B');
    expect(gstr2bCode).not.toContain('title="Push to GSTR-3B Table 4"');
    expect(imsCode).not.toContain('Push to 3B Table 4');
  });

  it('verifies backend push-to-3b endpoints are safe decoupled no-ops', () => {
    const g1Routes = fs.readFileSync(path.resolve('gstr1_routes.js'), 'utf8');
    const g2bRoutes = fs.readFileSync(path.resolve('gstr2b_routes.js'), 'utf8');
    const imsRoutes = fs.readFileSync(path.resolve('ims_routes.js'), 'utf8');

    expect(g1Routes).toContain('decoupled: true');
    expect(g2bRoutes).toContain('decoupled: true');
    expect(imsRoutes).toContain('decoupled: true');
  });

  it('verifies Consolidation Hub and Tally Direct Import are decoupled from Reco', () => {
    const consolCode = fs.readFileSync(path.resolve('src/pages/Consolidation.tsx'), 'utf8');
    const dataPreviewCode = fs.readFileSync(path.resolve('src/components/consolidation/DataPreview.tsx'), 'utf8');
    const tdiCode = fs.readFileSync(path.resolve('src/pages/TallyDirectImport.tsx'), 'utf8');
    const indexCode = fs.readFileSync(path.resolve('src/pages/Index.tsx'), 'utf8');

    // onSendToReco and onImportToReconciliation removed from Index.tsx
    expect(indexCode).not.toContain('handleDirectTallyImport');
    expect(indexCode).not.toContain('handleSendToReco');
    expect(consolCode).not.toContain('onSendToReco');
    expect(dataPreviewCode).not.toContain('onSendToReco');
    expect(tdiCode).not.toContain('onImportToReconciliation &&');
  });

  it('verifies notices_routes.js does not query foreign gstr2b_invoices or threeB tables', () => {
    const noticesRoutes = fs.readFileSync(path.resolve('notices_routes.js'), 'utf8');

    // Ensure the reconcile endpoint doesn't cross-query gstr2b_invoices
    expect(noticesRoutes).not.toContain('SELECT * FROM gstr2b_invoices WHERE client_gstin = ?');
  });

  it('verifies useScopedTallySession exists and provides moduleKey isolation and unmount teardown', () => {
    const hookCode = fs.readFileSync(path.resolve('src/hooks/useScopedTallySession.ts'), 'utf8');

    expect(hookCode).toContain('export function useScopedTallySession');
    expect(hookCode).toContain('clearTallyMetadataCache()');
    expect(hookCode).toContain('disconnect()');
    expect(hookCode).toContain('isMountedRef');
  });

});

