# Phase 30 Research: Monthly Audit Multi-User Maker-Checker Review & Approval Workflow

## 1. Domain & Codebase Analysis

### Existing Architecture & Strengths
1. **Firebase Configuration & Firestore Client:**
   - Initialized in `src/lib/firebaseClient.ts` with project `reco-vaswani-license`.
   - Firestore exports `firestore` and helper queries.
2. **Cloud Sync Engine (`src/lib/firebaseAuditSync.ts`):**
   - Implements `CloudAuditRecord`, `buildCloudAuditDocId`, `submitAuditForSeniorReviewInFirebase`, `approveAuditInFirebase`, `requestRevisionInFirebase`, `releaseAuditInFirebase`.
   - Provides real-time reactive listeners: `subscribeToCloudAudit` (per-audit doc) and `subscribeToSeniorPendingQueue` (querying `auditStatus == 'SUBMITTED_FOR_REVIEW'`).
   - Implements `fetchSeniorAuditorsFromCloud()` which reads active users from `network_users` where role/designation contains `senior`, `partner`, `manager`, `admin`.
3. **Backend API (`monthly_audit_routes.js`):**
   - SQLite tables: `monthly_audits`, `audit_checklists`, `audit_observations`, `audit_pending_points`.
   - Endpoints:
     - `POST /api/monthly-audits/:id/submit-review`: Sets `audit_status = 'SUBMITTED_FOR_REVIEW'`, stores `prepared_by`, `reviewed_by`, `general_summary` (notes).
     - `POST /api/monthly-audits/:id/senior-review`: Handles `action: 'APPROVE'` (status `APPROVED`) and `action: 'REQUEST_REVISION'` (status `REVISION_REQUESTED`), stores `senior_review_notes`.
     - `POST /api/monthly-audits/:id/release-client`: Releases approved audit and exports to client folder.
4. **Frontend UI (`src/pages/MonthlyAuditSuite.tsx`):**
   - Has `currentRole` switcher (`junior` | `senior`).
   - Has `submitReviewModalOpen` allowing junior to pick a senior, write notes, and submit.
   - Has `handleApprove` and `handleRequestRevision`.
   - Has status banners for `SUBMITTED_FOR_REVIEW`, `APPROVED`, `REVISION_REQUESTED`.

### Key Enhancements Needed for Flawless User Experience
1. **Senior Review Requests Hub (Notification Drawer / Inbox):**
   - Currently, a Senior CA Partner has to manually select the client and month to see that an audit is submitted.
   - We must connect `subscribeToSeniorPendingQueue` to a visible **Review Inbox Badge** in the top bar: e.g. `📥 Pending Reviews (3)`.
   - Clicking it opens an off-canvas drawer / modal showing all pending review assignments across all clients.
   - Clicking "Accept & Review" on any pending card automatically navigates to that client and month with senior review context active.
2. **Logged-in User Role Auto-Detection:**
   - When the user is logged into the app, detect their user profile from Firebase `network_users` or local session.
   - If user is a Junior Article, auto-set `currentRole = 'junior'` and pre-fill `preparedBy`.
   - If user is a Senior CA Partner, auto-set `currentRole = 'senior'` and pre-fill `reviewedBy`.
3. **Structured Revision Comments & Action Items:**
   - When Senior requests revision, instead of just a flat string, allow adding section-tagged bullet points:
     - Target Section (e.g., "3.1 Sales Reco", "3.2 Purchase Reco", "3.6 Cash 40A(3)", "4.2 Observations").
     - Comment Text (what needs correction).
     - Urgency (Mandatory vs Recommendation).
   - In the Junior's view when `REVISION_REQUESTED`, display this feedback clearly with checklist checkboxes so Junior can systematically resolve each point before resubmitting.
4. **Audit Sign-off Watermark & Stamp in Zero-Merge Excel & PDF:**
   - When exported, verify that the senior partner's name, review notes, and sign-off timestamp are stamped in the Zero-Merge Excel Cover Sheet and PDF sign-off section.

---

## 2. Recommendations & Best Practices

1. **Reactive Wakeup with `onSnapshot`:**
   - Both Senior and Junior PCs receive updates instantly without polling or page refresh.
2. **Permission Guarding:**
   - `canJuniorEdit(auditStatus)`: Returns `true` only when status is `DRAFT` or `REVISION_REQUESTED`.
   - `isSeniorReviewAllowed`: Returns `true` when status is `SUBMITTED_FOR_REVIEW`.
   - `isReleaseAllowed`: Returns `true` only when status is `APPROVED`.
3. **Non-Blocking Fallback:**
   - If internet is temporarily offline, SQLite local backend persists the transition and queues cloud sync gracefully.
