import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { exportClientAdditionTemplate } from '../lib/excel/builders/templates';
import { parseCredentialsImportExcel } from '../lib/imsEngine';
import fs from 'fs';
import path from 'path';

describe('Client Addition Template & System Settings Integration', () => {
  it('generates an audit-grade Excel template adhering to Zero-Merge architecture', () => {
    const wb = exportClientAdditionTemplate('test_clients_template.xlsx', false);
    expect(wb).toBeDefined();
    expect(wb.SheetNames).toContain('Client Master Addition');

    const ws = wb.Sheets['Client Master Addition'];
    expect(ws).toBeDefined();

    // Zero-Merge check
    const merges = ws['!merges'] || [];
    expect(merges.length).toBe(0);

    // Read back rows as JSON
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });
    expect(rows.length).toBeGreaterThanOrEqual(3);

    // Verify expected columns exist in row 0
    const firstRow = rows[0];
    expect(firstRow).toHaveProperty('GSTIN');
    expect(firstRow).toHaveProperty('Trade Name');
    expect(firstRow).toHaveProperty('Legal Name');
    expect(firstRow).toHaveProperty('Email Address');
    expect(firstRow).toHaveProperty('Phone Number');
    expect(firstRow).toHaveProperty('Portal Username');
    expect(firstRow).toHaveProperty('Portal Password');

    // Verify sample data format
    expect(firstRow['GSTIN']).toMatch(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/);
  });

  it('correctly parses the client addition template using parseCredentialsImportExcel', async () => {
    // Generate the template
    exportClientAdditionTemplate();
    const filePath = path.resolve(process.cwd(), 'GST_Client_Addition_Template.xlsx');
    const fileBuf = fs.readFileSync(filePath);
    const arrayBuffer = fileBuf.buffer.slice(fileBuf.byteOffset, fileBuf.byteOffset + fileBuf.byteLength);

    const mockFile = {
      arrayBuffer: async () => arrayBuffer,
      name: 'GST_Client_Addition_Template.xlsx'
    } as unknown as File;

    const parsed = await parseCredentialsImportExcel(mockFile);
    expect(parsed.length).toBeGreaterThanOrEqual(3);

    const client1 = parsed[0];
    expect(client1.gstin).toBe('27AADCB2230M1Z4');
    expect(client1.trade_name).toContain('Vaswani Enterprises');
    expect(client1.legal_name).toContain('Vaswani Enterprises Private Limited');
    expect(client1.email).toContain('@');
    expect(client1.phone).toContain('98230');
    expect(client1.portal_username).toBe('vaswani_portal');
    expect(client1.portal_password).toBe('Pass#2026');
  });

  it('verifies Suite 08 MonthlyAuditSuite header no longer contains Settings button', () => {
    const suitePath = path.resolve(__dirname, '../pages/MonthlyAuditSuite.tsx');
    const content = fs.readFileSync(suitePath, 'utf8');

    // Should NOT have the Settings button in the action deck
    expect(content).not.toContain('title="Audit System Settings"');
    expect(content).not.toContain('handleOpenSettings');
    expect(content).not.toContain('setIsSettingsModalOpen');

    // Should have dispatch of open-settings with tab: "clients" in Switch Client dropdown
    expect(content).toContain("window.dispatchEvent(new CustomEvent('open-settings', { detail: { tab: 'clients' } }))");
  });

  it('verifies SettingsModal contains Client Master tab and template download capability', () => {
    const settingsPath = path.resolve(__dirname, '../components/SettingsModal.tsx');
    const content = fs.readFileSync(settingsPath, 'utf8');

    // Tab key exists
    expect(content).toContain("'clients'");
    expect(content).toContain('Client Master');

    // Template download handler exists
    expect(content).toContain('exportClientAdditionTemplate');
    expect(content).toContain('handleDownloadClientAdditionTemplate');
    expect(content).toContain('handleImportClientAdditionExcel');

    // Add and Edit client modal handles exist
    expect(content).toContain('isAddClientModalOpen');
    expect(content).toContain('editingClient');
  });

  it('verifies Client Master in SettingsModal is linked to Monthly Audit Suite with audit selection and navigation', () => {
    const settingsPath = path.resolve(__dirname, '../components/SettingsModal.tsx');
    const content = fs.readFileSync(settingsPath, 'utf8');

    // Active audit GSTIN state and listeners
    expect(content).toContain('activeAuditGstin');
    expect(content).toContain("localStorage.getItem('monthly_audit_selected_client')");
    expect(content).toContain("window.addEventListener('client-selected'");

    // Audit selection handler
    expect(content).toContain('handleSelectClientForAudit');
    expect(content).toContain("localStorage.setItem('monthly_audit_selected_client'");
    expect(content).toContain("new CustomEvent('client-selected'");
    expect(content).toContain("new CustomEvent('app-navigate'");

    // UI Buttons
    expect(content).toContain('Select for Audit');
    expect(content).toContain('Active in Audit');
    expect(content).toContain('Open in Suite 08');
  });

  it('verifies MonthlyAuditSuite listens to client-selected and app-navigate events and syncs active client', () => {
    const suitePath = path.resolve(__dirname, '../pages/MonthlyAuditSuite.tsx');
    const content = fs.readFileSync(suitePath, 'utf8');

    expect(content).toContain("window.addEventListener('client-selected', handleClientSelected)");
    expect(content).toContain("window.addEventListener('app-navigate', handleAppNav)");
    expect(content).toContain("monthly_audit_selected_client");
    expect(content).toContain("Switch Client");
  });
});

