import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Returns Storage: Reliability & Fault-Tolerance Mechanisms', () => {
  const tmpBase = path.join(os.tmpdir(), `returns_storage_test_${Date.now()}`);

  beforeEach(() => {
    if (!fs.existsSync(tmpBase)) fs.mkdirSync(tmpBase, { recursive: true });
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tmpBase)) fs.rmSync(tmpBase, { recursive: true, force: true });
    } catch {}
  });

  describe('1. Windows Sanitization & Reserved Name Hardening', () => {
    function sanitizeFolderName(name: string): string {
      if (!name) return '';
      const clean = String(name)
        .replace(/[<>:"/\\|?*]/g, '')
        .replace(/[\r\n\t]/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/[.\s]+$/, '')
        .trim();

      if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(clean)) {
        return `${clean}_dir`;
      }
      return clean;
    }

    it('strips trailing periods that cause Windows folder creation errors', () => {
      const sanitized = sanitizeFolderName('XYZ PHARMACEUTICALS PVT. LTD.');
      expect(sanitized).toBe('XYZ PHARMACEUTICALS PVT. LTD');
      expect(sanitized.endsWith('.')).toBe(false);
    });

    it('removes Windows forbidden characters', () => {
      const sanitized = sanitizeFolderName('TATA:MOTORS/COMMERCIAL*SERVICES?');
      expect(sanitized).toBe('TATAMOTORSCOMMERCIALSERVICES');
    });

    it('appends suffix to Windows reserved device names', () => {
      expect(sanitizeFolderName('CON')).toBe('CON_dir');
      expect(sanitizeFolderName('aux')).toBe('aux_dir');
      expect(sanitizeFolderName('PRN')).toBe('PRN_dir');
      expect(sanitizeFolderName('COM1')).toBe('COM1_dir');
    });
  });

  describe('2. Write Canary Verification with Safe Finally Cleanup', () => {
    it('verifies writeability and safely cleans up temporary test file', () => {
      const testDir = path.join(tmpBase, 'canary_dir');
      fs.mkdirSync(testDir, { recursive: true });

      const testFile = path.join(testDir, `.write_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.tmp`);
      let writeOk = false;
      try {
        fs.writeFileSync(testFile, 'OK');
        writeOk = true;
      } finally {
        if (writeOk) {
          try {
            if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
          } catch {}
        }
      }

      expect(writeOk).toBe(true);
      expect(fs.existsSync(testFile)).toBe(false);
    });
  });

  describe('3. Storage Path Failover Simulation', () => {
    it('falls back to local storage directory when remote network path fails', () => {
      const defaultPath = path.join(tmpBase, 'local_fallback');
      const badRemotePath = 'Z:\\unmapped_network_drive_12345\\shared';

      let effectivePath = badRemotePath;
      let usedFallback = false;

      const performSave = (targetDir: string) => {
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }
        const filePath = path.join(targetDir, 'annual_gstr3b_working.json');
        fs.writeFileSync(filePath, JSON.stringify({ test: 'ok' }));
        return filePath;
      };

      let savedFile = '';
      try {
        savedFile = performSave(badRemotePath);
      } catch {
        if (effectivePath !== defaultPath) {
          usedFallback = true;
          effectivePath = defaultPath;
          savedFile = performSave(defaultPath);
        }
      }

      expect(usedFallback).toBe(true);
      expect(effectivePath).toBe(defaultPath);
      expect(fs.existsSync(savedFile)).toBe(true);
      const content = JSON.parse(fs.readFileSync(savedFile, 'utf8'));
      expect(content.test).toBe('ok');
    });
  });
});
