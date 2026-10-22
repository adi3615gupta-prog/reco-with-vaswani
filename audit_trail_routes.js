import crypto from 'crypto';

/**
 * Statutory Reconciliation Override Audit Trail Routes
 * Manages persistent, immutable records of all user reconciliation overrides
 * (Force Match, Manual Match, Batch Match, Unlink, Auto Match) per requirement AUDIT-01.
 */
export default function setupAuditTrailRoutes(app, db, userDataPath = '.') {
  const VALID_ACTION_TYPES = new Set([
    'FORCE_MATCH',
    'MANUAL_MATCH',
    'BATCH_MATCH',
    'UNLINK',
    'AUTO_MATCH_PARTY',
  ]);

  // 1. Initialize SQLite Database Schema & Indexes
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS reconciliation_audit_log (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        iso_timestamp TEXT NOT NULL,
        practitioner_username TEXT NOT NULL,
        client_gstin TEXT,
        company_name TEXT,
        action_type TEXT NOT NULL,
        invoice_no_pr TEXT,
        invoice_no_2b TEXT,
        original_status TEXT,
        new_status TEXT NOT NULL,
        taxable_diff REAL,
        gst_diff REAL,
        justification TEXT NOT NULL,
        metadata TEXT
      )
    `);

    db.run(`CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON reconciliation_audit_log (timestamp DESC)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_audit_gstin ON reconciliation_audit_log (client_gstin)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_audit_company ON reconciliation_audit_log (company_name)`);
  });

  // 2. Record an Override Action (POST /api/audit/reconciliation-override)
  app.post('/api/audit/reconciliation-override', (req, res) => {
    const {
      id,
      timestamp,
      iso_timestamp,
      practitioner_username,
      client_gstin,
      company_name,
      action_type,
      invoice_no_pr,
      invoice_no_2b,
      original_status,
      new_status,
      taxable_diff,
      gst_diff,
      justification,
      metadata,
    } = req.body || {};

    // Validate Action Type
    if (!action_type || !VALID_ACTION_TYPES.has(action_type)) {
      return res.status(400).json({
        error: `Invalid action_type: '${action_type}'. Allowed types: ${Array.from(VALID_ACTION_TYPES).join(', ')}`,
      });
    }

    // Validate Mandatory Statutory Justification (minimum 5 non-whitespace characters)
    if (!justification || typeof justification !== 'string' || justification.trim().length < 5) {
      return res.status(400).json({
        error: 'Statutory justification requires minimum 5 characters',
      });
    }

    // Validate new_status
    if (!new_status || typeof new_status !== 'string' || !new_status.trim()) {
      return res.status(400).json({
        error: 'new_status is required',
      });
    }

    const recordId = id || crypto.randomUUID();
    const recordTime = timestamp ? Number(timestamp) : Date.now();
    const isoTime = iso_timestamp || new Date(recordTime).toISOString();
    const practitioner =
      (req.user && req.user.username) ||
      (practitioner_username && String(practitioner_username).trim()) ||
      'Local Practitioner';

    const cleanGstin = client_gstin ? String(client_gstin).trim().toUpperCase() : null;
    const cleanCompany = company_name ? String(company_name).trim() : null;
    const cleanInvPR = invoice_no_pr ? String(invoice_no_pr).trim() : null;
    const cleanInv2B = invoice_no_2b ? String(invoice_no_2b).trim() : null;
    const cleanOrigStatus = original_status ? String(original_status).trim() : null;
    const cleanNewStatus = String(new_status).trim();
    const numTaxableDiff = taxable_diff !== undefined && taxable_diff !== null ? Number(taxable_diff) : 0;
    const numGstDiff = gst_diff !== undefined && gst_diff !== null ? Number(gst_diff) : 0;
    const cleanJustification = justification.trim();
    const metadataStr = typeof metadata === 'object' ? JSON.stringify(metadata) : metadata ? String(metadata) : null;

    const sql = `
      INSERT INTO reconciliation_audit_log (
        id, timestamp, iso_timestamp, practitioner_username, client_gstin, company_name,
        action_type, invoice_no_pr, invoice_no_2b, original_status, new_status,
        taxable_diff, gst_diff, justification, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      recordId,
      recordTime,
      isoTime,
      practitioner,
      cleanGstin,
      cleanCompany,
      action_type,
      cleanInvPR,
      cleanInv2B,
      cleanOrigStatus,
      cleanNewStatus,
      numTaxableDiff,
      numGstDiff,
      cleanJustification,
      metadataStr,
    ];

    db.run(sql, params, function (err) {
      if (err) {
        console.error('[Audit Trail] Insert error:', err);
        return res.status(500).json({ error: 'Failed to persist audit log to SQLite', details: err.message });
      }

      res.status(201).json({
        success: true,
        id: recordId,
        record: {
          id: recordId,
          timestamp: recordTime,
          iso_timestamp: isoTime,
          practitioner_username: practitioner,
          client_gstin: cleanGstin,
          company_name: cleanCompany,
          action_type,
          invoice_no_pr: cleanInvPR,
          invoice_no_2b: cleanInv2B,
          original_status: cleanOrigStatus,
          new_status: cleanNewStatus,
          taxable_diff: numTaxableDiff,
          gst_diff: numGstDiff,
          justification: cleanJustification,
        },
      });
    });
  });

  // 3. Query Override Audit Trail (GET /api/audit/reconciliation-override)
  app.get('/api/audit/reconciliation-override', (req, res) => {
    const { company_name, client_gstin, action_type, limit = 500, offset = 0 } = req.query;

    const clauses = [];
    const params = [];

    if (company_name) {
      clauses.push('company_name = ?');
      params.push(String(company_name).trim());
    }
    if (client_gstin) {
      clauses.push('client_gstin = ?');
      params.push(String(client_gstin).trim().toUpperCase());
    }
    if (action_type) {
      clauses.push('action_type = ?');
      params.push(String(action_type).trim());
    }

    const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 500, 1), 2000);
    const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);

    const query = `
      SELECT * FROM reconciliation_audit_log
      ${whereSql}
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `;
    params.push(safeLimit, safeOffset);

    db.all(query, params, (err, rows) => {
      if (err) {
        console.error('[Audit Trail] Query error:', err);
        return res.status(500).json({ error: 'Failed to retrieve audit trail records', details: err.message });
      }
      res.json(rows || []);
    });
  });

  // 4. Tabular Export Data of Audit Trail (GET /api/audit/reconciliation-override/export)
  app.get('/api/audit/reconciliation-override/export', (req, res) => {
    const { company_name, client_gstin } = req.query;
    const clauses = [];
    const params = [];

    if (company_name) {
      clauses.push('company_name = ?');
      params.push(String(company_name).trim());
    }
    if (client_gstin) {
      clauses.push('client_gstin = ?');
      params.push(String(client_gstin).trim().toUpperCase());
    }

    const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const query = `
      SELECT 
        id, iso_timestamp, practitioner_username, action_type, company_name, client_gstin,
        invoice_no_pr, invoice_no_2b, original_status, new_status, taxable_diff, gst_diff, justification
      FROM reconciliation_audit_log
      ${whereSql}
      ORDER BY timestamp DESC
      LIMIT 5000
    `;

    db.all(query, params, (err, rows) => {
      if (err) {
        console.error('[Audit Trail] Export query error:', err);
        return res.status(500).json({ error: 'Failed to fetch audit records for export', details: err.message });
      }

      const headers = [
        'Audit ID',
        'Timestamp (ISO)',
        'Practitioner',
        'Action',
        'Company',
        'GSTIN',
        'Invoice No (PR)',
        'Invoice No (2B)',
        'Original Status',
        'New Status',
        'Taxable Diff',
        'GST Diff',
        'Statutory Justification',
      ];

      const dataRows = (rows || []).map((r) => [
        r.id,
        r.iso_timestamp,
        r.practitioner_username,
        r.action_type,
        r.company_name || 'N/A',
        r.client_gstin || 'N/A',
        r.invoice_no_pr || 'N/A',
        r.invoice_no_2b || 'N/A',
        r.original_status || 'N/A',
        r.new_status,
        r.taxable_diff,
        r.gst_diff,
        r.justification,
      ]);

      res.json({
        headers,
        rows: dataRows,
        count: dataRows.length,
      });
    });
  });
}
