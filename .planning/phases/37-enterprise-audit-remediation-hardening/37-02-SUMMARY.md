---
phase: 37-enterprise-audit-remediation-hardening
plan: 02
subsystem: credentials-and-secrets
tags: [aes-256-gcm, crypto-vault, portal-passwords, smtp-passwords, bcrypt, firestore-rules, gemini-proxy, zero-merge]

requires:
  - 37-01
provides:
  - AES-256-GCM encryption at rest for GST portal passwords and Gmail SMTP app passwords
  - Transparent legacy plaintext password migration on startup and synchronization
  - Masked credential projections (has_password, has_app_password) across all APIs
  - Admin authorization guards and explicit confirmation on destructive client deletions
  - Safe default mirrorMode=false and deleteMissing=false in bulk import
  - Server-side Gemini notice analysis proxy eliminating browser API key exposure
  - Localhost dev server binding and removal of localtunnel
  - Hardened firestore.rules locking serial_keys collection from direct public reads
affects:
  - 37-05
  - 37-06

actuals:
  tasks: 4
  test_suites_passed: 8
  total_tests_passed: 67

key-files:
  created:
    - cryptoVault.js
    - src/test/vaultEncryption.test.ts
    - .env.example
  modified:
    - credentialsVaultSync.js
    - server.js
    - ims_routes.js
    - gemini_routes.js
    - syncModules.js
    - reset_admin.js
    - firestore.rules
    - package.json
    - vite.config.ts
    - .gitignore
    - src/components/CredentialsVaultModal.tsx
    - src/components/ImsMasterManager.tsx
    - src/components/SettingsModal.tsx
    - src/lib/imsEngine.ts
    - src/lib/geminiTaxEngine.ts
    - src/lib/firebaseClient.ts
    - gstr1/autopilot.js
    - gstr2b/autopilot.js
    - notices/autopilot.js

key-decisions:
  - "Standardized on AES-256-GCM format `enc:v1:<iv_b64>:<tag_b64>:<ciphertext_b64>` with 96-bit random IVs and 128-bit auth tags"
  - "Stored .vault_key strictly on local disk with 0o600 permissions, never inside network SMB shared folders"
  - "Implemented transparent legacy fallback so unencrypted credentials decrypt cleanly and auto-upgrade to enc:v1 on sync"
  - "Defaulted mirrorMode to false in both frontend and backend, requiring admin role and explicit confirmation to delete missing clients"
  - "Masked portal passwords across GET /api/ims/credentials and GET /api/clients, returning `has_password: boolean`"
  - "Proxied Gemini notice analysis through server-side POST /api/gemini/analyze-notice to eliminate client localStorage and URL query key exposure"
  - "Proxied browser Firebase serial_keys queries through authenticated GET /api/network/servers"
  - "Generated random 16-hex char temporary password in reset_admin.js instead of static 'admin'"
  - "Bound Vite dev server to 127.0.0.1 by default and removed localtunnel dependency"

requirements-completed:
  - SEC-01
  - SEC-02
  - SEC-03
  - SEC-04
  - SEC-05
  - SEC-08
  - SEC-09
  - SEC-10
  - SEC-13
  - FE-02
  - FE-04
  - FE-05
---

# Plan 37-02 Summary: Credentials & Secrets Hardening

## Overview
Plan 37-02 permanently eliminated plaintext credential storage across the application. All taxpayer portal passwords and Gmail SMTP credentials are encrypted at rest with AES-256-GCM (`enc:v1:...`). API endpoints return masked `has_password` boolean projections, bulk imports default to non-destructive modes (`mirrorMode = false`, `deleteMissing = false`), Gemini calls are proxied server-side, and legacy user passwords are automatically upgraded to bcrypt.

All 67 tests across 8 security and backend test files passed with 100% success.

