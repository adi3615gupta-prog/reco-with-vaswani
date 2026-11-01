# Phase 21: Research — Multi-PC GST Credentials Vault & Client Master LAN Synchronization Engine

## Research Findings & Technical Architecture

### 1. Existing State Analysis
- **Credentials Storage:** Client master data and GST portal credentials (`portal_username`, `portal_password`, `phone`, `email`, `trade_name`, `legal_name`) are currently stored exclusively in the local SQLite table `clients` inside each machine's `network_data.db` (`server.js:224`).
- **Autopilot Consumption:** All autopilot modules (`gstr2b/autopilot.js`, `gstr1/autopilot.js`, `openPortalLoginHelper`) query `db.get('SELECT trade_name, legal_name, portal_username, portal_password FROM clients WHERE gstin = ?')`.
- **Existing LAN Data Path:** `returns_storage_routes.js` already implements `getActiveDataPath()`, querying `app_config` for `returns_data_path` (which can be a network share like `\\SERVER\gst_returns_data` or a shared drive like `D:\gst_returns_data`).
- **Missing Link:** There is currently NO synchronization of the `clients` table with the central `getActiveDataPath()`. When PC 1 adds or edits a client's User ID or password, PC 2 has an empty or outdated local `clients` table.

---

### 2. Architecture for Bidirectional Multi-PC Synchronization

#### A. Central Canonical Vault: `central_clients_vault.json`
- Located at: `path.join(await getActiveDataPath(), 'central_clients_vault.json')`
- Contains a dictionary of clients keyed by normalized GSTIN:
  ```json
  {
    "version": 1,
    "last_synced_at": 1793254800000,
    "clients": {
      "27ABCDE1234F1Z5": {
        "id": "c_27ABCDE1234F1Z5",
        "gstin": "27ABCDE1234F1Z5",
        "trade_name": "ABC ENTERPRISES",
        "legal_name": "ABC ENTERPRISES",
        "phone": "9876543210",
        "email": "abc@example.com",
        "portal_username": "abc_gstin",
        "portal_password": "SecurePassword123!",
        "last_updated": 1793254800000,
        "is_deleted": 0
      }
    }
  }
  ```

#### B. SQLite Table Hardening (`clients`)
- Add two columns safely on startup:
  ```sql
  ALTER TABLE clients ADD COLUMN last_updated INTEGER DEFAULT 0;
  ALTER TABLE clients ADD COLUMN is_deleted INTEGER DEFAULT 0;
  ```
- **Conflict Resolution Rule (Last-Write-Wins):**
  - When comparing a local SQLite client with the central vault client:
    - If `central.last_updated > local.last_updated`: Update local SQLite with central record.
    - If `local.last_updated > central.last_updated`: Update central vault with local record.
    - If `local.last_updated === central.last_updated`: They are in sync.
  - Deletions are soft-deleted with `is_deleted = 1` and timestamped, so a deleted client on PC 1 is marked deleted in central storage and purged/hidden on PC 2 rather than resurrected.

#### C. Dedicated Sync Engine Module: `credentialsVaultSync.js`
Create an isolated, reusable service module:
1. `readCentralVault(dataPath)`: Reads and parses `central_clients_vault.json` safely with try/catch and file-lock recovery.
2. `writeCentralVault(dataPath, vaultData)`: Performs atomic write (write to `.tmp` file and rename, or safe synchronous write with fallback).
3. `syncCredentialsWithCentral(db, dataPath)`:
   - Reads all local rows from `clients` (including `is_deleted`, `last_updated`).
   - Reads `central_clients_vault.json`.
   - Merges bidirectionally using `last_updated`.
   - Updates local SQLite for any incoming changes.
   - Writes updated central vault to disk if local had newer changes.
   - Returns `{ success: true, pulledCount, pushedCount, totalClients, lastSyncTime }`.

#### D. Endpoints Integration
1. `GET /api/ims/credentials`:
   - Auto-triggers `syncCredentialsWithCentral` before returning rows, ensuring PC 2 immediately sees any credentials added on PC 1.
2. `POST /api/ims/credentials/update`:
   - Updates local SQLite with `last_updated = Date.now()`, `is_deleted = 0`.
   - Immediately writes/merges into `central_clients_vault.json`.
3. `POST /api/ims/credentials/bulk-import`:
   - Updates local SQLite in batch with `last_updated = Date.now()`.
   - Immediately writes/merges all imported clients into `central_clients_vault.json`.
4. `DELETE /api/ims/clients/:gstin`:
   - Marks `is_deleted = 1, last_updated = Date.now()` in local SQLite and `central_clients_vault.json`.
5. `POST /api/ims/credentials/sync-vault`:
   - Dedicated endpoint for manual or background sync.

#### E. Frontend Telemetry in `CredentialsVaultModal.tsx`
- Sync status badge: `🟢 Synced Across PCs (N Clients)`
- Action button: `Sync Across PCs` (with spinner while syncing).
- Auto-sync triggers:
  - On modal open (`isOpen === true`).
  - On `window` focus (`focus` event listener).
  - After single save or bulk import.
  - Dispatches `credentials-updated` event so `ReturnsDashboard.tsx` and Client Hub update immediately.

---

## Technical Edge Cases & Safeguards
1. **Network Share Offline / Temporary Disconnect:**
   - If `getActiveDataPath()` is inaccessible, sync fails gracefully and continues using local SQLite cache without breaking UI or throwing unhandled errors.
2. **Concurrent Writes from Multiple PCs:**
   - Atomic file writes using temp file replace + timestamp checks prevent file corruption on Windows SMB shares.
3. **Empty / Default Passwords:**
   - If a record on PC 1 has a password and PC 2 has an older record without a password, PC 1's newer timestamp protects the password from being erased.
4. **Backward Compatibility:**
   - Existing databases without `last_updated` columns get migrated seamlessly without losing any existing client data.
