# Firebase Firestore AI Key Distribution Guide
## AUDIT WITH VASWANI — Central Office-Wise & Global Gemini Sync

> **Purpose:** This guide explains how to centrally configure the Google Gemini API key in your Firebase licensing portal (`reco-vaswani-license`) so all client workstations across an office automatically inherit and activate the **Sourav** AI Assistant without each user needing to generate or paste an API key.

---

## 1. Architecture & Multi-Tier Resolution Cascade

When the desktop software starts or a user opens the Sourav AI Assistant, the backend resolves the Gemini API key in this hierarchical order:

```mermaid
flowchart TD
    A[Desktop Client / Server Starts] --> B[Check Local SQLite app_config]
    B --> C{Firestore Online?}
    C -->|Yes| D[Query serial_keys by office_id]
    D --> E{gemini_api_key found in serial_keys?}
    E -->|Yes| F[Cache in SQLite app_config<br>origin: cloud_office]
    E -->|No| G[Query system_config/ai_settings doc]
    G --> H{gemini_api_key found in system_config?}
    H -->|Yes| I[Cache in SQLite app_config<br>origin: cloud_global]
    H -->|No| J[Retain Existing SQLite / Manual Key<br>origin: local_manual]
    C -->|No / Offline| J
    F --> K[Sourav AI Active & Ready]
    I --> K
    J --> K
```

### Origin Telemetry Badges
- `🟢 Active (Office Cloud License)` — Specific key assigned to that office's serial key in Firestore.
- `🟢 Active (Global Master)` — Master key from `system_config/ai_settings` shared across all licensed offices.
- `🟢 Active (Custom Local Key)` — Key manually entered by the user in Settings.
- `🟢 Active (Environment)` — Loaded from `process.env.GEMINI_API_KEY`.

---

## 2. Firebase Firestore Data Schema

### A. Level 1: Per-Office Override (`serial_keys` collection)
Assigns a dedicated Gemini API key to a specific client office/branch.

- **Collection:** `serial_keys`
- **Document ID:** `{serial_key_string}` (e.g., `VASWANI-ENTERPRISE-2025-XXXX`)
- **Fields:**
  ```json
  {
    "office_id": "PC-10",
    "key_type": "server",
    "is_active": 1,
    "gemini_api_key": "AIzaSyDfE2DBpfE5Oj5nwtErub8X0tvBfMsi9QA...",
    "gemini_key_updated_at": 1730225000000
  }
  ```

### B. Level 2: Global Master Fallback (`system_config` collection)
Used as the default Gemini API key for all client offices that do not have an explicit key in their `serial_keys` document.

- **Collection:** `system_config`
- **Document ID:** `ai_settings`
- **Fields:**
  ```json
  {
    "gemini_api_key": "AIzaSyDfE2DBpfE5Oj5nwtErub8X0tvBfMsi9QA...",
    "updated_at": 1730225000000,
    "model_tier": "gemini-3.5-flash-lite",
    "updated_by": "super_admin"
  }
  ```

---

## 3. Ready-to-Copy Code Snippets for Web Admin Portal

### A. React / Next.js Component for Serial Key Generator Modal
Add this field to your existing license key issuance/edit form in your web portal:

```tsx
import React, { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from './firebaseConfig'; // Your Firestore instance

interface SerialKeyRecord {
  id: string; // Document ID (serial key)
  office_id: string;
  client_name: string;
  gemini_api_key?: string;
}

export function EditOfficeAiKeyModal({ 
  serialRecord, 
  onClose 
}: { 
  serialRecord: SerialKeyRecord; 
  onClose: () => void;
}) {
  const [apiKey, setApiKey] = useState(serialRecord.gemini_api_key || '');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const docRef = doc(db, 'serial_keys', serialRecord.id);
      await updateDoc(docRef, {
        gemini_api_key: apiKey.trim(),
        gemini_key_updated_at: Date.now()
      });
      alert(`Gemini API Key updated for Office: ${serialRecord.office_id}`);
      onClose();
    } catch (err: any) {
      alert(`Error saving to Firebase: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content" style={{ padding: '24px', maxWidth: '480px' }}>
        <h3>Configure Office AI Key</h3>
        <p style={{ fontSize: '13px', color: '#666' }}>
          Office ID: <strong>{serialRecord.office_id}</strong> ({serialRecord.client_name})
        </p>

        <div style={{ margin: '16px 0' }}>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '6px' }}>
            Google Gemini API Key:
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="AIzaSy..."
            style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ccc' }}
          />
          <small style={{ color: '#888' }}>
            All workstations under this office_id will sync this key automatically via live Firestore snapshot.
          </small>
        </div>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={isSaving}>Cancel</button>
          <button onClick={handleSave} disabled={isSaving} style={{ background: '#f59e0b', color: '#000', fontWeight: 'bold' }}>
            {isSaving ? 'Saving...' : 'Save & Distribute'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

### B. Global Master Key Settings Component (Super Admin)
Add this component to your admin dashboard to set the global fallback key:

```tsx
import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebaseConfig';

export function GlobalAiConfigPanel() {
  const [globalKey, setGlobalKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadGlobalKey() {
      try {
        const snap = await getDoc(doc(db, 'system_config', 'ai_settings'));
        if (snap.exists() && snap.data().gemini_api_key) {
          setGlobalKey(snap.data().gemini_api_key);
        }
      } catch (e) {
        console.error('Failed to load global AI key:', e);
      } finally {
        setLoading(false);
      }
    }
    loadGlobalKey();
  }, []);

  const handleSaveGlobalKey = async () => {
    if (!globalKey.trim()) return;
    setSaving(true);
    try {
      await setDoc(doc(db, 'system_config', 'ai_settings'), {
        gemini_api_key: globalKey.trim(),
        updated_at: Date.now(),
        updated_by: 'super_admin'
      }, { merge: true });
      alert('Global Gemini API Key updated! All licensed offices without an override will inherit this key.');
    } catch (err: any) {
      alert(`Failed to save: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div>Loading AI Config...</div>;

  return (
    <div style={{ padding: '20px', border: '1px solid #e2e8f0', borderRadius: '12px', background: '#fff' }}>
      <h3 style={{ margin: 0 }}>Global Master Gemini AI Key</h3>
      <p style={{ fontSize: '13px', color: '#64748b' }}>
        This key is pushed as default to every client software installation worldwide. Individual offices can still override this if they have an office-specific key.
      </p>

      <div style={{ margin: '14px 0' }}>
        <input
          type="password"
          value={globalKey}
          onChange={(e) => setGlobalKey(e.target.value)}
          placeholder="Paste master AIzaSy... key"
          style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
        />
      </div>

      <button
        onClick={handleSaveGlobalKey}
        disabled={saving || !globalKey.trim()}
        style={{ padding: '10px 18px', background: '#4f46e5', color: '#fff', borderRadius: '8px', border: 'none', cursor: 'pointer' }}
      >
        {saving ? 'Updating Global Cloud Key...' : 'Update Global Master Key'}
      </button>
    </div>
  );
}
```

---

## 4. Recommended Firestore Security Rules

Ensure your Firebase security rules allow licensed desktop installations to read their assigned key:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Serial keys: allow authenticated or authorized offices to read their own license
    match /serial_keys/{keyId} {
      allow read: if true; // Or restrict to matching office_id
      allow write: if request.auth != null; // Super admin only
    }

    // System config: allow read for all licensed clients; write for super admin
    match /system_config/ai_settings {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

---

## 5. Desktop Client Automatic Sync Channels

The desktop software automatically synchronizes the key through three independent channels:

1. **Automatic on Boot:**  
   5 seconds after startup, the server resolves `office_id` and executes `syncCloudGeminiKey()`. If a key is present in either `serial_keys` or `system_config/ai_settings`, it is cached in local SQLite `app_config`.

2. **Live Realtime Snapshot (`onSnapshot`):**  
   The active Firebase listener on `serial_keys` continuously monitors changes. As soon as you update `gemini_api_key` in the web portal, the live listener receives the payload and writes it to SQLite within 1-2 seconds.

3. **1-Click UI Sync:**  
   - Users can click **"⚡ 1-Click Sync from Office License"** directly inside the Sourav AI Chatbot drawer.
   - Admins can open **Settings → Sourav AI** and click **"Sync from Cloud"** or **"Push to Cloud"**.
