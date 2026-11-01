# Phase 21: GST Client Credentials Vault & Master Directory Multi-PC LAN Synchronization Engine

## Phase Goal
Enable seamless, real-time multi-PC synchronization of GST Portal credentials (GSTIN, Username/User ID, Password, Phone, Email, Trade Name, Legal Name, Address) and the Client Master Directory across all workstations connected to the office network storage path (`dataPath` / `\\SERVER\gst_returns_data`).

Ensure that:
1. When any client's portal username, password, or contact information is added, updated, or imported on **PC 1**, it is immediately synchronized to the central shared network storage (`central_clients_vault.json`) and local SQLite databases.
2. Any other workstation (**PC 2**, **PC 3**, etc.) automatically reads from the central vault on application startup, client hub query, or opening the Credentials Vault modal, completely eliminating the need to manually re-enter or import credentials across different computers.
3. Bulk imports from Excel (`parseCredentialsImportExcel`) on any workstation update both local and central vaults with bidirectional merging (`last_updated` timestamp tracking to prevent overwriting newer credentials with older ones).
4. Deletion of a client or clearing credentials propagates cleanly across the LAN without resurrected ghost records.
5. All 5 Autopilot modules (GSTR-1, GSTR-2B, GST IMS, GST Notices, and Returns Tracking) automatically consume synced credentials on any connected PC for zero-friction portal login and automated downloads.

---

## Architectural & User Context

### 1. User Problem Statement
Currently, GST portal User IDs and passwords are saved in the local SQLite table `clients` inside `network_data.db` on each individual machine:
1. **Isolated Workstations:** When a CA or accountant enters or imports GST credentials on PC 1, PC 2 has its own isolated `network_data.db`. PC 2 shows missing credentials and cannot run Autopilot downloaders or autofill portal logins without manually re-typing or importing the same Excel sheet again.
2. **Double Work & Inconsistencies:** When a client changes their GST portal password, staff on PC 1 update it, but staff on PC 2 continue using the old password, leading to portal account lockouts after consecutive failed attempts.
3. **Multi-PC Office Environment:** Accounting firms and CA practices operate across multiple staff workstations sharing a common LAN network folder (`returns_data_path`). Client return data is already shared, but client credentials are not synchronized.

---

## Architectural Decisions & Sync Protocol

### 1. Central Vault Repository on Network Storage (`central_clients_vault.json`)
- The central server/shared storage folder (`getActiveDataPath()`, e.g., `\\SERVER\gst_returns_data` or `D:\gst_returns_data`) maintains a canonical file:
  ```
  <getActiveDataPath()>/central_clients_vault.json
  ```
- **Structure:**
  ```json
  {
    "version": 1,
    "last_sync_timestamp": 1793254800000,
    "clients": {
      "27ABCDE1234F1Z5": {
        "id": "c_27ABCDE1234F1Z5",
        "gstin": "27ABCDE1234F1Z5",
        "trade_name": "ABC ENTERPRISES",
        "legal_name": "ABC ENTERPRISES",
        "portal_username": "abc_gstin",
        "portal_password": "SecurePassword123!",
        "phone": "9876543210",
        "email": "abc@example.com",
        "address": "123 Business Park, Mumbai",
        "last_updated": 1793254800000,
        "is_deleted": 0
      }
    }
  }
  ```

### 2. SQLite Schema Hardening (`clients` Table)
- Add `last_updated INTEGER DEFAULT 0` and `is_deleted INTEGER DEFAULT 0` columns to `clients` table in SQLite (`network_data.db`).
- This guarantees timestamp-based conflict resolution ("last write wins" per client record) during bidirectional sync between local SQLite and central storage.

### 3. Bidirectional Synchronization Pipeline
- **Push on Write:**
  - Whenever `/api/ims/credentials/update` or `/api/ims/credentials/bulk-import` is called, the backend updates local SQLite AND immediately reads, merges, and writes to `<dataPath>/central_clients_vault.json`.
- **Pull on Read / Connect:**
  - Whenever `/api/ims/credentials` or `/api/returns/clients-hub` is requested, the backend performs a fast check of `central_clients_vault.json` against local SQLite. Any new or updated records in `central_clients_vault.json` are merged into local SQLite before returning to the frontend.
- **Dedicated Sync Endpoint:**
  - `POST /api/ims/credentials/sync-vault`: Explicitly reconciles local SQLite with `central_clients_vault.json` and returns the unified list of clients with telemetry (`pulledCount`, `pushedCount`, `lastSyncTime`).

### 4. UI Telemetry & Feedback in `CredentialsVaultModal.tsx`
- Display network sync status chip in the Credentials Vault header:
  - `🟢 Network Synced` (Live sync active to shared path)
  - `🟡 Local Cache (Syncing...)` (Active transfer)
  - `ℹ️ Central Storage Path` badge showing current data path
- 1-click **"Sync Across PCs"** button to force immediate full bidirectional reconciliation.
- Auto-sync on modal open and window focus.

---

## Scope Fences

### In-Scope
1. **Central File Vault Management**: Canonical `central_clients_vault.json` in `getActiveDataPath()` with atomic write and error fallbacks.
2. **SQLite Migration**: Automatic schema upgrade of `clients` table (`last_updated`, `is_deleted`).
3. **Backend API Endpoints**:
   - `GET /api/ims/credentials`: Auto-pulls newer records from central vault into local SQLite before returning.
   - `POST /api/ims/credentials/update`: Writes to SQLite and syncs to central vault.
   - `POST /api/ims/credentials/bulk-import`: Merges bulk imports with central vault.
   - `DELETE /api/ims/clients/:gstin`: Soft-deletes in central vault (`is_deleted = 1`) to propagate deletion across LAN without ghost resurrection.
   - `POST /api/ims/credentials/sync-vault`: Force manual or background bidirectional reconciliation.
4. **UI Integration**:
   - `CredentialsVaultModal.tsx`: Visual network sync badge, "Sync Across PCs" button, and auto-sync on open.
   - `ReturnsDashboard.tsx`: Client Hub dropdown reflects synced clients immediately.
5. **Autopilot Integration**:
   - Autopilot login helpers (`openPortalLoginHelper`, Playwright credentials resolution) seamlessly access synced credentials on any machine.

### Out-of-Scope (Deferred)
- External cloud sync (Google Drive / AWS S3) — this phase focuses on local office LAN multi-PC network storage path.
- Client biometric authentication.

---

## Success Criteria & Verification Gates
1. Updating a client's GST credentials on PC 1 updates `central_clients_vault.json` in the configured data directory.
2. PC 2 fetches `/api/ims/credentials` and immediately receives the updated credentials.
3. Bulk Excel import on one machine syncs to the central vault without overwriting newer credentials.
4. Client deletion on one machine propagates across LAN and does not reappear as a ghost client.
5. Unit and API tests pass verifying bidirectional sync, conflict resolution, and offline fallback resilience.
