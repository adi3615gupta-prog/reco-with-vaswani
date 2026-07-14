import { randomUUID } from 'crypto';
import fs from 'fs';

export default function setupTdsRoutes(app, db) {
    // Initialize TDS Tables
    db.serialize(() => {
        // 1. TDS rules master table
        db.run(`CREATE TABLE IF NOT EXISTS TDS_Rules (
            id TEXT PRIMARY KEY,
            old_section TEXT,
            new_section_2025 TEXT,
            nature_of_payment TEXT,
            single_bill_threshold REAL,
            annual_aggregate_threshold REAL,
            rate_individual_huf REAL,
            rate_company_others REAL,
            rate_missing_pan_206AA REAL
        )`);

        // 2. Tally Ledgers mapping table
        db.run(`CREATE TABLE IF NOT EXISTS Tally_Ledgers (
            id TEXT PRIMARY KEY,
            ledger_name TEXT UNIQUE,
            parent_group TEXT,
            parent_group_path TEXT,
            is_tds_ledger INTEGER DEFAULT 0,
            mapped_section_code TEXT,
            user_validated INTEGER DEFAULT 0
        )`);

        // Safely add parent_group_path column if it doesn't exist on an existing DB
        db.run(`ALTER TABLE Tally_Ledgers ADD COLUMN parent_group_path TEXT`, (err) => {
            // Ignore error if column already exists
        });

        // 3. Party Masters table
        db.run(`CREATE TABLE IF NOT EXISTS Party_Masters (
            id TEXT PRIMARY KEY,
            party_name TEXT UNIQUE,
            pan_number TEXT,
            entity_type TEXT,
            user_edited INTEGER DEFAULT 0
        )`);

        // 4. Tally Transactions table
        db.run(`CREATE TABLE IF NOT EXISTS Tally_Transactions (
            id TEXT PRIMARY KEY,
            party_id TEXT REFERENCES Party_Masters(id),
            ledger_name TEXT,
            voucher_date TEXT,
            voucher_number TEXT,
            amount REAL,
            actual_tds_deducted REAL
        )`);

        // 5. Reconciliation Results table
        db.run(`CREATE TABLE IF NOT EXISTS Recon_Results (
            id TEXT PRIMARY KEY,
            party_id TEXT REFERENCES Party_Masters(id),
            section_code TEXT,
            books_taxable REAL,
            books_required_tds REAL,
            books_actual_tds REAL,
            traces_taxable REAL,
            traces_tds REAL,
            taxable_variance REAL,
            tds_variance REAL,
            reconciliation_status TEXT,
            calculated_at TEXT
        )`);

        // 6. Tally Group Mappings table
        db.run(`CREATE TABLE IF NOT EXISTS Tally_Group_Mappings (
            id TEXT PRIMARY KEY,
            expense_group TEXT NOT NULL,
            sub_group TEXT,
            sub_group_2 TEXT,
            mapped_section_code TEXT NOT NULL,
            created_at TEXT NOT NULL
        )`);

        // Seed & Sync TDS_Rules with latest IT Act 2025 (V2 Corrected Rules Matrix)
        const seedData = [
            { old_section: '192A', new_section_2025: '393(1)_EPF', nature_of_payment: 'EPF Premature Withdrawal', single_bill_threshold: null, annual_aggregate_threshold: 50000, rate_individual_huf: 10.0, rate_company_others: 10.0, rate_missing_pan_206AA: 20.0 },
            { old_section: '193', new_section_2025: '393(1)_Securities', nature_of_payment: 'Interest on Securities', single_bill_threshold: null, annual_aggregate_threshold: 10000, rate_individual_huf: 10.0, rate_company_others: 10.0, rate_missing_pan_206AA: 20.0 },
            { old_section: '194', new_section_2025: '393(1)_Sl_1iii', nature_of_payment: 'Dividend', single_bill_threshold: null, annual_aggregate_threshold: 10000, rate_individual_huf: 10.0, rate_company_others: 10.0, rate_missing_pan_206AA: 20.0 },
            { old_section: '194A', new_section_2025: '393(1)_Sl_1i', nature_of_payment: 'Interest (Other than Banks)', single_bill_threshold: null, annual_aggregate_threshold: 10000, rate_individual_huf: 10.0, rate_company_others: 10.0, rate_missing_pan_206AA: 20.0 },
            { old_section: '194A(Bank)', new_section_2025: '393(1)_Sl_1i_Bank', nature_of_payment: 'Interest (Bank/Post Office - Sr Citizen 1L, Others 50k)', single_bill_threshold: null, annual_aggregate_threshold: 50000, rate_individual_huf: 10.0, rate_company_others: 10.0, rate_missing_pan_206AA: 20.0 },
            { old_section: '194C', new_section_2025: '393(1)_Sl_6i', nature_of_payment: 'Payment to Contractors', single_bill_threshold: 30000, annual_aggregate_threshold: 100000, rate_individual_huf: 1.0, rate_company_others: 2.0, rate_missing_pan_206AA: 20.0 },
            { old_section: '194D', new_section_2025: '393(1)_Sl_3i', nature_of_payment: 'Insurance Commission', single_bill_threshold: null, annual_aggregate_threshold: 20000, rate_individual_huf: 5.0, rate_company_others: 10.0, rate_missing_pan_206AA: 20.0 },
            { old_section: '194DA', new_section_2025: '393(1)_Sl_3ii', nature_of_payment: 'Life Insurance Maturity', single_bill_threshold: null, annual_aggregate_threshold: 100000, rate_individual_huf: 2.0, rate_company_others: 2.0, rate_missing_pan_206AA: 20.0 },
            { old_section: '194G', new_section_2025: '393(1)_Sl_1iv', nature_of_payment: 'Lottery Commission', single_bill_threshold: null, annual_aggregate_threshold: 20000, rate_individual_huf: 2.0, rate_company_others: 2.0, rate_missing_pan_206AA: 20.0 },
            { old_section: '194H', new_section_2025: '393(1)_Sl_1ii', nature_of_payment: 'Commission or Brokerage', single_bill_threshold: null, annual_aggregate_threshold: 20000, rate_individual_huf: 2.0, rate_company_others: 2.0, rate_missing_pan_206AA: 20.0 },
            { old_section: '194I(a)', new_section_2025: '393(1)_Sl_2ii_Da', nature_of_payment: 'Rent for Plant & Machinery', single_bill_threshold: null, annual_aggregate_threshold: 600000, rate_individual_huf: 2.0, rate_company_others: 2.0, rate_missing_pan_206AA: 20.0 },
            { old_section: '194I(b)', new_section_2025: '393(1)_Sl_2ii_Db', nature_of_payment: 'Rent for Land, Building & Furniture', single_bill_threshold: null, annual_aggregate_threshold: 600000, rate_individual_huf: 10.0, rate_company_others: 10.0, rate_missing_pan_206AA: 20.0 },
            { old_section: '194IA', new_section_2025: '393(1)_Sl_2ii_E', nature_of_payment: 'Transfer of Immovable Property', single_bill_threshold: null, annual_aggregate_threshold: 5000000, rate_individual_huf: 1.0, rate_company_others: 1.0, rate_missing_pan_206AA: 20.0 },
            { old_section: '194IB', new_section_2025: '393(1)_Sl_2ii_F', nature_of_payment: 'Payment of Rent by Individual/HUF (Non-Audit)', single_bill_threshold: 50000, annual_aggregate_threshold: 600000, rate_individual_huf: 2.0, rate_company_others: 2.0, rate_missing_pan_206AA: 20.0 },
            { old_section: '194IC', new_section_2025: '393(1)_Sl_2ii_G', nature_of_payment: 'Consideration under Development Agreement', single_bill_threshold: null, annual_aggregate_threshold: 0, rate_individual_huf: 10.0, rate_company_others: 10.0, rate_missing_pan_206AA: 20.0 },
            { old_section: '194J(a)', new_section_2025: '393(1)_Sl_6iii_a', nature_of_payment: 'Fees for Technical Services / Royalty / Call Centres', single_bill_threshold: null, annual_aggregate_threshold: 50000, rate_individual_huf: 2.0, rate_company_others: 2.0, rate_missing_pan_206AA: 20.0 },
            { old_section: '194J(b)', new_section_2025: '393(1)_Sl_6iii_b', nature_of_payment: 'Fees for Professional Services', single_bill_threshold: null, annual_aggregate_threshold: 50000, rate_individual_huf: 10.0, rate_company_others: 10.0, rate_missing_pan_206AA: 20.0 },
            { old_section: '194LA', new_section_2025: '393(1)_Sl_7i', nature_of_payment: 'Compulsory Land Acquisition', single_bill_threshold: null, annual_aggregate_threshold: 500000, rate_individual_huf: 10.0, rate_company_others: 10.0, rate_missing_pan_206AA: 20.0 },
            { old_section: '194M', new_section_2025: '393(1)_Sl_8iii', nature_of_payment: 'Payments by Individual/HUF (Contract/Prof/Commission)', single_bill_threshold: null, annual_aggregate_threshold: 5000000, rate_individual_huf: 2.0, rate_company_others: 2.0, rate_missing_pan_206AA: 20.0 },
            { old_section: '194Q', new_section_2025: '393(1)_Sl_8ii', nature_of_payment: 'Purchase of Goods', single_bill_threshold: null, annual_aggregate_threshold: 5000000, rate_individual_huf: 0.1, rate_company_others: 0.1, rate_missing_pan_206AA: 5.0 },
            { old_section: '194R', new_section_2025: '393(1)_Sl_8iv', nature_of_payment: 'Benefits or Perquisites of Business', single_bill_threshold: null, annual_aggregate_threshold: 20000, rate_individual_huf: 10.0, rate_company_others: 10.0, rate_missing_pan_206AA: 20.0 },
            { old_section: '194S', new_section_2025: '393(1)_Sl_8v', nature_of_payment: 'Virtual Digital Asset (Crypto)', single_bill_threshold: null, annual_aggregate_threshold: 50000, rate_individual_huf: 1.0, rate_company_others: 1.0, rate_missing_pan_206AA: 20.0 },
            { old_section: '194T', new_section_2025: '393(3)', nature_of_payment: 'Payments to Partners by Partnership Firm/LLP', single_bill_threshold: null, annual_aggregate_threshold: 20000, rate_individual_huf: 10.0, rate_company_others: 10.0, rate_missing_pan_206AA: 20.0 },
            { old_section: '194O', new_section_2025: '393(1)_Sl_8i', nature_of_payment: 'Payment by E-Commerce Operator', single_bill_threshold: null, annual_aggregate_threshold: 500000, rate_individual_huf: 0.1, rate_company_others: 0.1, rate_missing_pan_206AA: 5.0 }
        ];

        // Always refresh TDS_Rules table with latest IT Act 2025 (V2 Corrected Rules Matrix)
        db.run('DELETE FROM TDS_Rules', [], (err) => {
            const stmt = db.prepare(`INSERT INTO TDS_Rules (
                id, old_section, new_section_2025, nature_of_payment, 
                single_bill_threshold, annual_aggregate_threshold, 
                rate_individual_huf, rate_company_others, rate_missing_pan_206AA
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);

            seedData.forEach(d => {
                stmt.run(
                    randomUUID(), d.old_section, d.new_section_2025, d.nature_of_payment,
                    d.single_bill_threshold, d.annual_aggregate_threshold,
                    d.rate_individual_huf, d.rate_company_others, d.rate_missing_pan_206AA
                );
            });
            stmt.finalize();
            console.log("Seeded and synchronized updated TDS Rules V2 from IT Act 2025");
        });
    });

    // Get TDS Rules
    app.get('/api/tds/rules', (req, res) => {
        db.all('SELECT * FROM TDS_Rules', [], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
    });

    // Helper PAN Regex & Mapping
    const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i;
    function getEntityTypeFromPan(pan) {
        const cleanPan = (pan || '').trim().toUpperCase();
        if (!PAN_REGEX.test(cleanPan)) {
            return 'Unknown';
        }
        const entityChar = cleanPan.charAt(3);
        const map = { 'P': 'Individual', 'H': 'HUF', 'C': 'Company', 'F': 'Firm', 'A': 'AOP', 'T': 'Trust' };
        return map[entityChar] || 'Unknown';
    }

    function getSectionFromTdsLedgerName(name) {
        const n = (name || '').toUpperCase();
        if (n.includes('194C')) return '194C';
        if (n.includes('194J')) {
            if (n.includes('PROF') || n.includes('194J(B)') || n.includes('194J-B')) return '194J(b)';
            return '194J(a)';
        }
        if (n.includes('194I')) {
            const hasMachinery = n.includes('MACHINERY') || n.includes('MACHINE') || n.includes('PLANT') || n.includes('194I(A)') || n.includes('194I-A');
            if (hasMachinery) return '194I(a)';
            if (n.includes('RENT') || n.includes('LAND') || n.includes('BLDG') || n.includes('BUILDING') || n.includes('194I(B)') || n.includes('194I-B')) return '194I(b)';
            return '194I(a)';
        }
        if (n.includes('194H')) return '194H';
        if (n.includes('194Q')) return '194Q';
        if (n.includes('194R')) return '194R';
        return null;
    }

    function getLedgerHierarchy(l) {
        const path = [];
        if (l.parent_group) path.push(l.parent_group.toUpperCase().trim());
        if (l.parent_group_path) {
            l.parent_group_path.split(',').forEach(g => {
                const clean = g.trim().toUpperCase();
                if (clean && !path.includes(clean)) path.push(clean);
            });
        }
        return path;
    }

    function matchesGroupMapping(hierarchy, m) {
        const normalize = (s) => (s || '').toUpperCase().trim();
        const g1 = normalize(m.expense_group);
        const g2 = m.sub_group ? normalize(m.sub_group) : null;
        const g3 = m.sub_group_2 ? normalize(m.sub_group_2) : null;

        if (!hierarchy.includes(g1)) return false;
        if (g2 && !hierarchy.includes(g2)) return false;
        if (g3 && !hierarchy.includes(g3)) return false;
        return true;
    }

    function findInheritedSection(hierarchy, groupMappings) {
        if (!groupMappings || groupMappings.length === 0) return null;
        const sorted = [...groupMappings].sort((a, b) => {
            const scoreA = (a.sub_group_2 ? 2 : 0) + (a.sub_group ? 1 : 0);
            const scoreB = (b.sub_group_2 ? 2 : 0) + (b.sub_group ? 1 : 0);
            return scoreB - scoreA;
        });
        for (const m of sorted) {
            if (matchesGroupMapping(hierarchy, m)) {
                return {
                    sectionCode: m.mapped_section_code,
                    mappingName: m.sub_group_2 || m.sub_group || m.expense_group
                };
            }
        }
        return null;
    }

    // API: Step 1: Extract Ledgers (Saves to Tally_Ledgers)
    app.post('/api/tds/extract-ledgers', (req, res) => {
        const { ledgers } = req.body; // Array of { ledgerName, parentGroup, parentGroupPath }
        if (!ledgers || !Array.isArray(ledgers)) {
            return res.status(400).json({ error: "Invalid ledgers array" });
        }

        db.serialize(() => {
            const stmt = db.prepare(`INSERT INTO Tally_Ledgers (id, ledger_name, parent_group, parent_group_path, is_tds_ledger, user_validated)
                                     VALUES (?, ?, ?, ?, 0, 0)
                                     ON CONFLICT(ledger_name) DO UPDATE SET 
                                        parent_group = excluded.parent_group,
                                        parent_group_path = excluded.parent_group_path`);
            ledgers.forEach(l => {
                stmt.run(randomUUID(), l.ledgerName, l.parentGroup || 'Expense', l.parentGroupPath || '');
            });
            stmt.finalize((err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, count: ledgers.length });
            });
        });
    });

    // API: Step 2: Auto Map Ledgers (Tally ledgers to TDS Rules mapping suggestions - Disabled as requested)
    app.get('/api/tds/auto-map', (req, res) => {
        res.json([]);
    });

    // API: Step 2b: Tally ledgers to TDS Rules mapping suggestions
    app.get('/api/tds/ledgers/suggestions', (req, res) => {
        db.all('SELECT * FROM Tally_Ledgers WHERE user_validated = 0 OR mapped_section_code IS NULL', [], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            
            const suggestions = [];
            
            rows.forEach(r => {
                const name = r.ledger_name;
                const nameUpper = name.toUpperCase().trim();
                const parent = (r.parent_group || '').toUpperCase().trim();
                const path = (r.parent_group_path || '').toUpperCase().trim();
                
                // Determine if it belongs to Direct/Indirect Expenses or Purchase accounts
                const isExpenseGroup = parent.includes('EXPENSE') || parent.includes('PURCHASE') ||
                                       path.includes('EXPENSE') || path.includes('PURCHASE') ||
                                       parent.includes('DIRECT') || parent.includes('INDIRECT') ||
                                       path.includes('DIRECT') || path.includes('INDIRECT');
                
                if (!isExpenseGroup) return;

                let suggestedSection = null;
                let confidence = false; // High confidence = true, Low confidence = false

                // 194I - Rent
                if (nameUpper.includes('RENT') || nameUpper.includes('LEASE') || nameUpper.includes('HIRE CHARGES') || nameUpper.includes('HECTARE')) {
                    if (nameUpper.includes('MACHINE') || nameUpper.includes('EQUIP') || nameUpper.includes('PLANT') || nameUpper.includes('VEHICLE') || nameUpper.includes('CAR')) {
                        suggestedSection = '194I(a)';
                    } else {
                        suggestedSection = '194I(b)';
                    }
                    confidence = true;
                }
                // 194J - Professional / Technical Fees
                else if (nameUpper.includes('PROFESSIONAL') || nameUpper.includes('LEGAL') || nameUpper.includes('CONSULT') || 
                         nameUpper.includes('AUDIT') || nameUpper.includes('TECHNICAL') || nameUpper.includes('ROYALTY') ||
                         nameUpper.includes('SOFTWARE') || nameUpper.includes('DEVELOPMENT') || nameUpper.includes('FEES') ||
                         nameUpper.includes('DIRECTOR') || nameUpper.includes('ENGINEER')) {
                    suggestedSection = '194J(b)';
                    confidence = true;
                }
                // 194H - Commission / Brokerage
                else if (nameUpper.includes('COMMISSION') || nameUpper.includes('BROKER') || nameUpper.includes('BROKERAGE')) {
                    suggestedSection = '194H';
                    confidence = true;
                }
                // 194Q - Purchase of Goods
                else if (nameUpper.includes('PURCHASE') || nameUpper.includes('GOODS') || nameUpper.includes('RAW MATERIAL')) {
                    suggestedSection = '194Q';
                    confidence = true;
                }
                // 194C - Contractor payments (general default for contracts, transport, advertising, security etc.)
                else if (nameUpper.includes('CONTRACT') || nameUpper.includes('ADVERTIS') || nameUpper.includes('SECURITY') || 
                         nameUpper.includes('TRANSPORT') || nameUpper.includes('COURIER') || nameUpper.includes('FREIGHT') || 
                         nameUpper.includes('LABOUR') || nameUpper.includes('MAINTENANCE') || nameUpper.includes('REPAIR') || 
                         nameUpper.includes('PRINTING') || nameUpper.includes('WORK') || nameUpper.includes('CATERING') || 
                         nameUpper.includes('SERVICE') || nameUpper.includes('OFFICE EXP') || nameUpper.includes('MISC') ||
                         nameUpper.includes('GENERAL') || parent.includes('DIRECT') || parent.includes('PURCHASE')) {
                    suggestedSection = '194C';
                    confidence = nameUpper.includes('CONTRACT') || nameUpper.includes('SECURITY') || nameUpper.includes('TRANSPORT') || nameUpper.includes('ADVERTIS');
                }

                if (suggestedSection) {
                    suggestions.push({
                        ledgerName: name,
                        suggestedSection: suggestedSection,
                        isProbable: confidence
                    });
                }
            });
            
            res.json(suggestions);
        });
    });

    // Confirm Ledger Mapping
    app.post('/api/tds/confirm-mapping', (req, res) => {
        const { mappings } = req.body; // Array of { ledgerName, sectionCode, isTdsLedger }
        if (!mappings || !Array.isArray(mappings)) {
            return res.status(400).json({ error: "Invalid mappings payload" });
        }

        db.serialize(() => {
            let hasError = false;
            let errorMsg = '';
            
            const stmt = db.prepare(`INSERT INTO Tally_Ledgers (id, ledger_name, parent_group, is_tds_ledger, mapped_section_code, user_validated)
                                     VALUES (?, ?, 'Expense', ?, ?, 1)
                                     ON CONFLICT(ledger_name) DO UPDATE SET 
                                        mapped_section_code = excluded.mapped_section_code,
                                        is_tds_ledger = excluded.is_tds_ledger,
                                        user_validated = 1`);
            mappings.forEach(m => {
                if (hasError) return;
                const isTdsVal = m.isTdsLedger ? 1 : 0;
                const secVal = m.isTdsLedger ? null : m.sectionCode;
                stmt.run(randomUUID(), m.ledgerName, isTdsVal, secVal, function(err) {
                    if (err) {
                        hasError = true;
                        errorMsg = err.message;
                    }
                });
            });
            stmt.finalize((err) => {
                if (err || hasError) return res.status(500).json({ error: err ? err.message : errorMsg });
                res.json({ success: true });
            });
        });
    });

    // Get all ledgers (for confirmed list in UI)
    app.get('/api/tds/ledgers', (req, res) => {
        db.all('SELECT * FROM Tally_Group_Mappings', [], (err, groupMappings) => {
            if (err) return res.status(500).json({ error: err.message });
            
            db.all('SELECT * FROM Tally_Ledgers ORDER BY ledger_name ASC', [], (err, rows) => {
                if (err) return res.status(500).json({ error: err.message });
                
                res.json(rows.map(r => {
                    const hierarchy = getLedgerHierarchy(r);
                    const inherited = findInheritedSection(hierarchy, groupMappings);
                    return {
                        id: r.id,
                        ledgerName: r.ledger_name,
                        parentGroup: r.parent_group,
                        isTdsLedger: r.is_tds_ledger === 1,
                        sectionCode: r.mapped_section_code,
                        inheritedSectionCode: inherited ? inherited.sectionCode : null,
                        inheritedGroupName: inherited ? inherited.mappingName : null,
                        userValidated: r.user_validated === 1
                    };
                }));
            });
        });
    });

    // Add manual ledger mapping
    app.post('/api/tds/ledgers', (req, res) => {
        const { ledgerName, sectionCode } = req.body;
        if (!ledgerName || !sectionCode) {
            return res.status(400).json({ error: "ledgerName and sectionCode are required" });
        }
        db.run(
            `INSERT INTO Tally_Ledgers (id, ledger_name, parent_group, is_tds_ledger, mapped_section_code, user_validated)
             VALUES (?, ?, 'Expense', 0, ?, 1)
             ON CONFLICT(ledger_name) DO UPDATE SET mapped_section_code = excluded.mapped_section_code, is_tds_ledger = 0, user_validated = 1`,
            [randomUUID(), ledgerName, sectionCode],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true });
            }
        );
    });

    // Add/Update full ledger configuration
    app.post('/api/tds/ledgers/update', (req, res) => {
        const { ledgerName, sectionCode, isTdsLedger } = req.body;
        if (!ledgerName) {
            return res.status(400).json({ error: "ledgerName is required" });
        }
        db.run(
            `INSERT INTO Tally_Ledgers (id, ledger_name, parent_group, is_tds_ledger, mapped_section_code, user_validated)
             VALUES (?, ?, 'Expense', ?, ?, 1)
             ON CONFLICT(ledger_name) DO UPDATE SET 
                is_tds_ledger = excluded.is_tds_ledger,
                mapped_section_code = excluded.mapped_section_code,
                user_validated = 1`,
            [randomUUID(), ledgerName, isTdsLedger ? 1 : 0, sectionCode || null],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true });
            }
        );
    });

    // Delete manual ledger mapping (removes from database)
    app.delete('/api/tds/ledgers/:name', (req, res) => {
        db.run(
            `DELETE FROM Tally_Ledgers WHERE ledger_name = ?`,
            [req.params.name],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true });
            }
        );
    });

    // API: Step 3: Get/Update Party Masters
    app.post('/api/tds/process-pan', (req, res) => {
        const { parties } = req.body; // Array of { partyName, pan }
        if (!parties || !Array.isArray(parties)) {
            return res.status(400).json({ error: "Invalid parties payload" });
        }

        db.serialize(() => {
            const stmt = db.prepare(`INSERT INTO Party_Masters (id, party_name, pan_number, entity_type, user_edited)
                                     VALUES (?, ?, ?, ?, 0)
                                     ON CONFLICT(party_name) DO UPDATE SET 
                                        pan_number = CASE WHEN user_edited = 0 THEN excluded.pan_number ELSE pan_number END,
                                        entity_type = CASE WHEN user_edited = 0 THEN excluded.entity_type ELSE entity_type END`);
            parties.forEach(p => {
                const entityType = getEntityTypeFromPan(p.pan);
                stmt.run(randomUUID(), p.partyName, p.pan || null, entityType);
            });
            stmt.finalize((err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true });
            });
        });
    });

    app.get('/api/tds/parties', (req, res) => {
        db.all('SELECT * FROM Party_Masters ORDER BY party_name ASC', [], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
    });

    app.put('/api/tds/parties/:id', (req, res) => {
        const { entityType, panNumber } = req.body;
        db.run(
            `UPDATE Party_Masters SET entity_type = ?, pan_number = ?, user_edited = 1 WHERE id = ?`,
            [entityType, panNumber, req.params.id],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true });
            }
        );
    });

    // Confirm name-matched PANs
    app.post('/api/tds/parties/confirm-name-matches', (req, res) => {
        const { matches } = req.body; // Array of { partyName, panNumber }
        if (!matches || !Array.isArray(matches)) {
            return res.status(400).json({ error: "Invalid matches payload" });
        }
        db.serialize(() => {
            const stmt = db.prepare(`UPDATE Party_Masters SET pan_number = ?, user_edited = 1 WHERE party_name = ?`);
            matches.forEach(m => {
                stmt.run(m.panNumber.toUpperCase().trim(), m.partyName);
            });
            stmt.finalize((err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true });
            });
        });
    });


    // API: Step 5: Chronological Calculation & Reconciliation Engine (Reconcile Books vs 26Q)
    app.post('/api/tds/reconcile', (req, res) => {
        const { transactions, form26qRecords, confirmedMatches } = req.body;
        // transactions: Array of { partyName, pan, ledgerName, date, amount, actualTdsDeducted, voucherNumber }
        // form26qRecords: Array of { partyPan, partyName, section, amountPaid, tdsDeducted }

        try {
            fs.writeFileSync('scratch_all_txns.json', JSON.stringify(transactions, null, 2));
            fs.writeFileSync('scratch_all_traces.json', JSON.stringify(form26qRecords, null, 2));
        } catch (e) {
            console.error("Failed to write diagnostic files", e);
        }

        if (!transactions || !Array.isArray(transactions)) {
            return res.status(400).json({ error: "transactions array is required" });
        }

        // Fetch all active TDS rules
        db.all('SELECT * FROM TDS_Rules', [], (err, rules) => {
            if (err) return res.status(500).json({ error: err.message });

            const rulesMap = {};
            rules.forEach(r => {
                rulesMap[r.old_section] = r;
                rulesMap[r.new_section_2025] = r;
            });

            // Fetch validated group mappings first
            db.all('SELECT * FROM Tally_Group_Mappings', [], (err, groupMappings) => {
                if (err) return res.status(500).json({ error: err.message });

                // Fetch validated ledgers (mapped expense ledgers OR TDS tax liability ledgers)
                db.all('SELECT * FROM Tally_Ledgers', [], (err, ledgers) => {
                    if (err) return res.status(500).json({ error: err.message });

                    // Fetch party masters to resolve user-updated PANs/entity types
                    db.all('SELECT party_name, pan_number, entity_type FROM Party_Masters', [], (err, parties) => {
                        if (err) return res.status(500).json({ error: err.message });

                        const partyMap = {};
                        if (parties) {
                             parties.forEach(p => {
                                 partyMap[p.party_name.toUpperCase().trim()] = {
                                     pan: p.pan_number,
                                     entityType: p.entity_type
                                 };
                             });
                        }

                        const normalizeLedger = (name) => (name || '').toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');

                        const ledgerMap = {};
                        const tdsTaxLedgers = new Set();
                        ledgers.forEach(l => {
                            const norm = normalizeLedger(l.ledger_name);
                            if (l.mapped_section_code) {
                                ledgerMap[norm] = l.mapped_section_code;
                            }
                            if (l.is_tds_ledger === 1) {
                                tdsTaxLedgers.add(norm);
                            }
                        });

                        // Resolve section either via direct mapping or inherited group mapping
                        const getSectionForTxn = (txn) => {
                            const normLedger = normalizeLedger(txn.ledgerName);
                            if (ledgerMap[normLedger]) {
                                return ledgerMap[normLedger];
                            }
                            
                            // Check inherited group mappings
                            const hierarchy = [];
                            if (txn.parentGroup) hierarchy.push(txn.parentGroup.toUpperCase().trim());
                            if (txn.parentGroupPath) {
                                txn.parentGroupPath.split(',').forEach(g => {
                                    const clean = g.trim().toUpperCase();
                                    if (clean && !hierarchy.includes(clean)) hierarchy.push(clean);
                                });
                            }
                            const inherited = findInheritedSection(hierarchy, groupMappings);
                            if (inherited) {
                                return inherited.sectionCode;
                            }
                            return null;
                        };

                        // Pre-scan transactions to build a map of party name to its resolved section codes
                        const partySectionMap = {};
                        transactions.forEach(t => {
                            const sectionCode = getSectionForTxn(t);
                            if (sectionCode) {
                                const partyKey = t.partyName.toUpperCase().trim();
                                if (!partySectionMap[partyKey]) {
                                    partySectionMap[partyKey] = new Set();
                                }
                                partySectionMap[partyKey].add(sectionCode);
                            }
                        });

                    // 1. Group transactions by Party & Section
                    const groupedTxns = {}; // "pan_section" -> []
                    const partyNameMap = {}; // groupKey -> partyName

                    transactions.forEach(t => {
                        const normLedger = normalizeLedger(t.ledgerName);
                        const sectionCode = getSectionForTxn(t);
                        
                        const partyKey = t.partyName.toUpperCase().trim();
                        const dbParty = partyMap[partyKey];
                        
                        const cleanLedger = (t.ledgerName || '').toLowerCase().trim();
                        t.isTdsTax = tdsTaxLedgers.has(normLedger) || cleanLedger.includes('tds') || cleanLedger.includes('tax deducted') || cleanLedger.includes('tax payable');
                        
                        let resolvedSection = sectionCode;
                        if (!resolvedSection) {
                            const isTds = t.isTdsTax || (t.actualTdsDeducted > 0 && t.amount === 0);
                            if (isTds) {
                                const cleanName = (t.ledgerName || '').toUpperCase();
                                let extractedSec = '';
                                if (cleanName.includes('194C') || cleanName.includes('194-C')) {
                                    extractedSec = '194C';
                                } else if (cleanName.includes('194I') || cleanName.includes('194-I')) {
                                    if (cleanName.includes('MACHINERY') || cleanName.includes('HIRE') || cleanName.includes('PLANT')) {
                                        extractedSec = '194I(a)';
                                    } else {
                                        extractedSec = '194I(b)';
                                    }
                                } else if (cleanName.includes('194J') || cleanName.includes('194-J')) {
                                    if (cleanName.includes('PROF') || cleanName.includes('SERVICE') || cleanName.includes('FEES')) {
                                        extractedSec = '194J(b)';
                                    } else {
                                        extractedSec = '194J(a)';
                                    }
                                } else if (cleanName.includes('194H') || cleanName.includes('194-H')) {
                                    extractedSec = '194H';
                                } else if (cleanName.includes('194Q') || cleanName.includes('194-Q')) {
                                    extractedSec = '194Q';
                                }

                                if (extractedSec) {
                                    resolvedSection = extractedSec;
                                } else {
                                    const partySections = partySectionMap[partyKey];
                                    if (partySections && partySections.size > 0) {
                                        resolvedSection = Array.from(partySections)[0];
                                    }
                                }
                            }
                        }

                        if (!resolvedSection) return; // Strictly only consider mapped ledgers or resolved TDS adjustments!
                        
                        // Lookup database PAN first, then transaction payload
                        let origPan = (t.partyPan || t.pan || '').toUpperCase().trim();
                        let rawPan = ((dbParty && dbParty.pan) || t.partyPan || t.pan || '').toUpperCase().trim();
                        
                        // Standardize missing PAN values
                        if (rawPan === 'PAN-MISSING' || rawPan === 'PAN MISSING' || rawPan === 'UNREGISTERED') {
                            rawPan = '';
                        }
                        if (origPan === 'PAN-MISSING' || origPan === 'PAN MISSING' || origPan === 'UNREGISTERED') {
                            origPan = '';
                        }

                        // Strip spaces from valid PANs
                        rawPan = rawPan.replace(/\s+/g, '');
                        origPan = origPan.replace(/\s+/g, '');

                        const isPanValid = PAN_REGEX.test(rawPan);
                        const isOrigPanInvalid = origPan === '' || !PAN_REGEX.test(origPan);
                        const isNameMatched = isPanValid && isOrigPanInvalid;
                        
                        // Group by PAN if valid, otherwise group by unique party name to prevent lumping together
                        const groupKey = isPanValid 
                            ? `${rawPan}_${resolvedSection}` 
                            : `NOPAN-${t.partyName.toUpperCase().trim()}_${resolvedSection}`;

                        if (!groupedTxns[groupKey]) {
                            groupedTxns[groupKey] = [];
                        }
                        groupedTxns[groupKey].push(t);
                        partyNameMap[groupKey] = t.partyName;
                        if (!groupedTxns[groupKey].isNameMatched) {
                            groupedTxns[groupKey].isNameMatched = false;
                        }
                        if (isNameMatched) {
                            groupedTxns[groupKey].isNameMatched = true;
                        }
                    });

                    // 2. Compute Books chronological TDS liability per group
                    const booksLiability = {}; // "pan_section" -> { booksTaxable, booksRequiredTds, booksActualTds, ledgers, isNameMatched }

                    for (const [groupKey, txns] of Object.entries(groupedTxns)) {
                        const lastUnderscore = groupKey.lastIndexOf('_');
                        const pan = groupKey.substring(0, lastUnderscore);
                        const sectionCode = groupKey.substring(lastUnderscore + 1);
                        const rule = rulesMap[sectionCode];
                        if (!rule) continue;

                        // Chronological calculation
                        txns.sort((a, b) => new Date(a.date) - new Date(b.date));

                        // Determine Rate: 20% penalty rate for missing PAN (Section 206AA)!
                        let isIndividualOrHuf = false;
                        const isPanValid = PAN_REGEX.test(pan);
                        const isPanMissing = !isPanValid;
                        let rate = 0;

                        if (isPanValid) {
                            const entityChar = pan.charAt(3).toUpperCase();
                            if (entityChar === 'P' || entityChar === 'H') {
                                isIndividualOrHuf = true;
                            }
                            rate = isIndividualOrHuf ? rule.rate_individual_huf : rule.rate_company_others;
                        } else {
                            rate = rule.rate_missing_pan_206AA !== null && rule.rate_missing_pan_206AA !== undefined
                                ? rule.rate_missing_pan_206AA
                                : 20.0;
                        }

                        let cumulativeSpend = 0;
                        let grossSpend = 0;
                        let reversalAmount = 0;
                        let cumulativeTaxable = 0;
                        let breachedAnnual = false;
                        let totalActualTds = 0;
                        const ledgerNames = new Set();
                        const tdsLedgerNames = new Set();
                        let breachedSingleCount = 0;

                        txns.forEach(txn => {
                            cumulativeSpend += txn.amount;
                            if (txn.amount > 0) {
                                grossSpend += txn.amount;
                            } else {
                                reversalAmount += Math.abs(txn.amount);
                            }
                            totalActualTds += txn.actualTdsDeducted || 0;
                            if (txn.tdsLedgerName) {
                                tdsLedgerNames.add(txn.tdsLedgerName);
                            }
                            if (txn.tds_ledger_name) {
                                tdsLedgerNames.add(txn.tds_ledger_name);
                            }
                            if (!txn.isTdsTax) {
                                ledgerNames.add(txn.ledgerName);
                            } else {
                                tdsLedgerNames.add(txn.ledgerName);
                            }

                            let isTaxable = false;
                            let taxableAmountForThisTxn = 0;

                            const breachesSingleBill = rule.single_bill_threshold !== null && txn.amount >= rule.single_bill_threshold;
                            const breachesAnnualAggregate = cumulativeSpend >= rule.annual_aggregate_threshold;

                            if (breachesAnnualAggregate) {
                                isTaxable = true;
                                if (!breachedAnnual) {
                                    taxableAmountForThisTxn = cumulativeSpend - cumulativeTaxable;
                                    breachedAnnual = true;
                                } else {
                                    taxableAmountForThisTxn = txn.amount;
                                }
                            } else if (breachesSingleBill) {
                                isTaxable = true;
                                taxableAmountForThisTxn = txn.amount;
                                breachedSingleCount++;
                            }

                            if (isTaxable) {
                                cumulativeTaxable += taxableAmountForThisTxn;
                            }
                        });

                        let reason = '';
                        if (cumulativeTaxable > 0) {
                            const breachType = [];
                            if (breachedAnnual) {
                                breachType.push(`Annual spend ₹${cumulativeSpend.toLocaleString('en-IN')} > annual limit ₹${rule.annual_aggregate_threshold.toLocaleString('en-IN')}`);
                            } else if (breachedSingleCount > 0) {
                                breachType.push(`${breachedSingleCount} bill(s) > single limit ₹${rule.single_bill_threshold.toLocaleString('en-IN')}`);
                            } else {
                                breachType.push(`Threshold crossed`);
                            }
                            reason = `TDS Status: Applicable (${breachType.join(' or ')})`;
                            if (totalActualTds > 0) {
                                reason += ` | Book TDS: ₹${totalActualTds.toLocaleString('en-IN')}`;
                            }
                        } else {
                            reason = `TDS Status: Not Applicable (Below threshold)`;
                            if (totalActualTds > 0) {
                                reason += ` | Voluntary Book TDS: ₹${totalActualTds.toLocaleString('en-IN')}`;
                            }
                        }

                        if (isPanMissing) {
                            reason += ` | PAN: Missing (${rate}% rate)`;
                        }

                        if (reversalAmount > 0) {
                            reason += ` | Spend: ₹${cumulativeSpend.toLocaleString('en-IN')} (Gross: ₹${grossSpend.toLocaleString('en-IN')} | Reversals: ₹${reversalAmount.toLocaleString('en-IN')})`;
                        } else {
                            reason += ` | Spend: ₹${cumulativeSpend.toLocaleString('en-IN')}`;
                        }

                        const limitParts = [`Annual limit ₹${rule.annual_aggregate_threshold.toLocaleString('en-IN')}`];
                        if (rule.single_bill_threshold) {
                            limitParts.push(`Single limit ₹${rule.single_bill_threshold.toLocaleString('en-IN')}`);
                        }
                        reason += ` | Limits: ${limitParts.join(' / ')}`;

                        const requiredTds = (cumulativeTaxable * rate) / 100;

                        booksLiability[groupKey] = {
                            partyName: partyNameMap[groupKey] || 'Unknown Party',
                            booksSpend: cumulativeSpend,
                            booksTaxable: cumulativeTaxable,
                            booksRequiredTds: Math.round(requiredTds),
                            booksActualTds: totalActualTds,
                            ledgers: Array.from(ledgerNames).join(', '),
                            tdsLedgers: Array.from(tdsLedgerNames).join(', '),
                            rateApplied: rate,
                            reason: reason,
                            isNameMatched: txns.isNameMatched || false
                        };
                    }

                    // 3. Aggregate TRACES (Form 26Q) Data
                    const tracesLiability = {}; // "pan_section" -> { tracesTaxable, tracesTds, partyName }
                    if (form26qRecords && Array.isArray(form26qRecords)) {
                        form26qRecords.forEach(r => {
                            let cleanPan = (r.partyPan || '').toUpperCase().trim();
                            if (cleanPan === 'PAN-MISSING' || cleanPan === 'PAN MISSING' || cleanPan === 'UNREGISTERED') {
                                cleanPan = '';
                            }
                            cleanPan = cleanPan.replace(/\s+/g, '');
                            const cleanSection = (r.section || '').trim();
                            const rule = rulesMap[cleanSection];
                            // Try to align 26Q section code to our system's code (either old or new)
                            const sectionCode = rule ? rule.old_section : cleanSection;
                            const groupKey = `${cleanPan}_${sectionCode}`;

                            if (!tracesLiability[groupKey]) {
                                tracesLiability[groupKey] = {
                                    tracesTaxable: 0,
                                    tracesTds: 0,
                                    partyName: r.partyName || 'Unknown Party',
                                    partyPan: cleanPan,
                                    section: sectionCode
                                };
                            }
                            tracesLiability[groupKey].tracesTaxable += r.amountPaid || 0;
                            tracesLiability[groupKey].tracesTds += r.tdsDeducted || 0;
                        });
                    }

                    // 4. Perform comparison and variance tagging
                    const reconciliationResults = [];
                    const matchedBooks = {};
                    const matchedTraces = {};
                    const matchMethods = {};
                    const unmatchedBooks = new Set(Object.keys(booksLiability));
                    const unmatchedTraces = new Set(Object.keys(tracesLiability));

                    const LOCAL_PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i;
                    const isLocalPanValid = (p) => p && LOCAL_PAN_REGEX.test(p);

                    const normalizePartyName = (name) => {
                        if (!name) return '';
                        let n = name.toUpperCase()
                            .replace(/[-\s\(\)]+(CR|DR)\b$/g, '')
                            .replace(/\b(M\/S\.?|MS\.?|MR\.?|MRS\.?|SHREE|SHRI)\b/g, '')
                            .replace(/\b(PVT|PRIVATE|LTD|LIMITED|LLP|INC|CO|COMPANY|CORP|CORPORATION|ENTERPRISES?|TRADERS?|INDUSTRIES|AGENC(?:Y|IES)|BROTHERS|BROS|SONS|ASSOCIATES|AND|&)\b/g, '')
                            .replace(/[^A-Z0-9]/g, '')
                            .trim();
                        if (n.endsWith('S')) n = n.slice(0, -1);
                        return n;
                    };

                    function levenshteinDistance(s1, s2) {
                        const track = Array(s2.length + 1).fill(null).map(() => Array(s1.length + 1).fill(null));
                        for (let i = 0; i <= s1.length; i += 1) {
                            track[0][i] = i;
                        }
                        for (let j = 0; j <= s2.length; j += 1) {
                            track[j][0] = j;
                        }
                        for (let j = 1; j <= s2.length; j += 1) {
                            for (let i = 1; i <= s1.length; i += 1) {
                                const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1;
                                track[j][i] = Math.min(
                                    track[j][i - 1] + 1, // deletion
                                    track[j - 1][i] + 1, // insertion
                                    track[j - 1][i - 1] + indicator // substitution
                                );
                            }
                        }
                        return track[s2.length][s1.length];
                    }

                    // 1. Match by PAN
                    for (const bKey of unmatchedBooks) {
                        const books = booksLiability[bKey];
                        const lastUnderscore = bKey.lastIndexOf('_');
                        const pan = bKey.substring(0, lastUnderscore);
                        const section = bKey.substring(lastUnderscore + 1);

                        if (isLocalPanValid(pan)) {
                            // First try: exact PAN + exact Section
                            const tKeyExact = `${pan}_${section}`;
                            if (unmatchedTraces.has(tKeyExact)) {
                                matchedBooks[bKey] = tracesLiability[tKeyExact];
                                matchedTraces[tKeyExact] = books;
                                matchMethods[bKey] = 'PAN';
                                unmatchedBooks.delete(bKey);
                                unmatchedTraces.delete(tKeyExact);
                                continue;
                            }

                            // Second try: PAN + empty/dash Section
                            const tKeyEmpty = `${pan}_`;
                            if (unmatchedTraces.has(tKeyEmpty)) {
                                const trace = tracesLiability[tKeyEmpty];
                                trace.section = section;
                                const newTKey = `${pan}_${section}`;
                                tracesLiability[newTKey] = trace;
                                delete tracesLiability[tKeyEmpty];

                                matchedBooks[bKey] = trace;
                                matchedTraces[newTKey] = books;
                                matchMethods[bKey] = 'PAN';
                                unmatchedBooks.delete(bKey);
                                unmatchedTraces.delete(tKeyEmpty);
                                continue;
                            }

                            // Third try: PAN + any section (fallback)
                            let foundTKey = null;
                            for (const tKey of unmatchedTraces) {
                                const lastUnderscoreT = tKey.lastIndexOf('_');
                                const tPan = tKey.substring(0, lastUnderscoreT);
                                if (tPan === pan) {
                                    foundTKey = tKey;
                                    break;
                                }
                            }
                            if (foundTKey) {
                                const trace = tracesLiability[foundTKey];
                                if (!trace.section || trace.section === '—' || trace.section === '') {
                                    trace.section = section;
                                }
                                matchedBooks[bKey] = trace;
                                matchedTraces[foundTKey] = books;
                                matchMethods[bKey] = 'PAN';
                                unmatchedBooks.delete(bKey);
                                unmatchedTraces.delete(foundTKey);
                            }
                        }
                    }

                    // 2. Match by Exact Name
                    for (const bKey of unmatchedBooks) {
                        const books = booksLiability[bKey];
                        const lastUnderscore = bKey.lastIndexOf('_');
                        const section = bKey.substring(lastUnderscore + 1);
                        const booksNormName = normalizePartyName(books.partyName);

                        if (booksNormName) {
                            let foundTKey = null;
                            // First try: exact Name + exact Section
                            for (const tKey of unmatchedTraces) {
                                const traces = tracesLiability[tKey];
                                if (traces.section === section) {
                                    const tracesNormName = normalizePartyName(traces.partyName);
                                    if (booksNormName === tracesNormName) {
                                        let allowed = true;
                                        if (confirmedMatches) {
                                            allowed = confirmedMatches.some(cm => 
                                                cm.booksName.toUpperCase().trim() === books.partyName.toUpperCase().trim() &&
                                                cm.tracesName.toUpperCase().trim() === traces.partyName.toUpperCase().trim()
                                            );
                                        }
                                        if (allowed) {
                                            foundTKey = tKey;
                                            break;
                                        }
                                    }
                                }
                            }
                            // Second try: exact Name + empty/dash Section
                            if (!foundTKey) {
                                for (const tKey of unmatchedTraces) {
                                    const traces = tracesLiability[tKey];
                                    if (!traces.section || traces.section === '—' || traces.section === '') {
                                        const tracesNormName = normalizePartyName(traces.partyName);
                                        if (booksNormName === tracesNormName) {
                                            let allowed = true;
                                            if (confirmedMatches) {
                                                allowed = confirmedMatches.some(cm => 
                                                    cm.booksName.toUpperCase().trim() === books.partyName.toUpperCase().trim() &&
                                                    cm.tracesName.toUpperCase().trim() === traces.partyName.toUpperCase().trim()
                                                );
                                            }
                                            if (allowed) {
                                                foundTKey = tKey;
                                                break;
                                            }
                                        }
                                    }
                                }
                            }
                            // Third try: exact Name + any other Section
                            if (!foundTKey) {
                                for (const tKey of unmatchedTraces) {
                                    const traces = tracesLiability[tKey];
                                    const tracesNormName = normalizePartyName(traces.partyName);
                                    if (booksNormName === tracesNormName) {
                                        let allowed = true;
                                        if (confirmedMatches) {
                                            allowed = confirmedMatches.some(cm => 
                                                cm.booksName.toUpperCase().trim() === books.partyName.toUpperCase().trim() &&
                                                cm.tracesName.toUpperCase().trim() === traces.partyName.toUpperCase().trim()
                                            );
                                        }
                                        if (allowed) {
                                            foundTKey = tKey;
                                            break;
                                        }
                                    }
                                }
                            }

                            if (foundTKey) {
                                const trace = tracesLiability[foundTKey];
                                if (!trace.section || trace.section === '—' || trace.section === '') {
                                    trace.section = section;
                                }
                                matchedBooks[bKey] = trace;
                                matchedTraces[foundTKey] = books;
                                matchMethods[bKey] = 'Name (Exact)';
                                unmatchedBooks.delete(bKey);
                                unmatchedTraces.delete(foundTKey);
                            }
                        }
                    }

                    // 3. Match by Fuzzy Name
                    for (const bKey of unmatchedBooks) {
                        const books = booksLiability[bKey];
                        const lastUnderscore = bKey.lastIndexOf('_');
                        const section = bKey.substring(lastUnderscore + 1);
                        const booksNormName = normalizePartyName(books.partyName);

                        if (booksNormName) {
                            let bestTKey = null;
                            let highestSim = 0.7;

                            // First pass: try fuzzy name with same section
                            for (const tKey of unmatchedTraces) {
                                const traces = tracesLiability[tKey];
                                if (traces.section === section) {
                                    const tracesNormName = normalizePartyName(traces.partyName);
                                    if (tracesNormName) {
                                        let sim = 0;
                                        if (booksNormName.length >= 5 && tracesNormName.length >= 5 && 
                                            (booksNormName.includes(tracesNormName) || tracesNormName.includes(booksNormName))) {
                                            sim = 0.9;
                                        } else {
                                            const maxLen = Math.max(booksNormName.length, tracesNormName.length);
                                            if (maxLen >= 4) {
                                                const dist = levenshteinDistance(booksNormName, tracesNormName);
                                                sim = 1 - dist / maxLen;
                                            }
                                        }

                                        if (sim >= highestSim) {
                                            let allowed = true;
                                            if (confirmedMatches) {
                                                allowed = confirmedMatches.some(cm => 
                                                    cm.booksName.toUpperCase().trim() === books.partyName.toUpperCase().trim() &&
                                                    cm.tracesName.toUpperCase().trim() === traces.partyName.toUpperCase().trim()
                                                );
                                            }
                                            if (allowed) {
                                                highestSim = sim;
                                                bestTKey = tKey;
                                            }
                                        }
                                    }
                                }
                            }

                            // Second pass: if no match, try fuzzy name with any section (fallback)
                            if (!bestTKey) {
                                for (const tKey of unmatchedTraces) {
                                    const traces = tracesLiability[tKey];
                                    const tracesNormName = normalizePartyName(traces.partyName);
                                    if (tracesNormName) {
                                        let sim = 0;
                                        if (booksNormName.length >= 5 && tracesNormName.length >= 5 && 
                                            (booksNormName.includes(tracesNormName) || tracesNormName.includes(booksNormName))) {
                                            sim = 0.9;
                                        } else {
                                            const maxLen = Math.max(booksNormName.length, tracesNormName.length);
                                            if (maxLen >= 4) {
                                                const dist = levenshteinDistance(booksNormName, tracesNormName);
                                                sim = 1 - dist / maxLen;
                                            }
                                        }

                                        if (sim >= highestSim) {
                                            let allowed = true;
                                            if (confirmedMatches) {
                                                allowed = confirmedMatches.some(cm => 
                                                    cm.booksName.toUpperCase().trim() === books.partyName.toUpperCase().trim() &&
                                                    cm.tracesName.toUpperCase().trim() === traces.partyName.toUpperCase().trim()
                                                );
                                            }
                                            if (allowed) {
                                                highestSim = sim;
                                                bestTKey = tKey;
                                            }
                                        }
                                    }
                                }
                            }

                            if (bestTKey) {
                                const trace = tracesLiability[bestTKey];
                                if (!trace.section || trace.section === '—' || trace.section === '') {
                                    trace.section = section;
                                }
                                matchedBooks[bKey] = trace;
                                matchedTraces[bestTKey] = books;
                                matchMethods[bKey] = 'Name (Fuzzy)';
                                unmatchedBooks.delete(bKey);
                                unmatchedTraces.delete(bestTKey);
                            }
                        }
                    }

                    let summary = {
                        total_parties_analyzed: 0,
                        matched_count: 0,
                        short_deducted_count: 0,
                        excess_deducted_count: 0,
                        missing_in_26q_count: 0,
                        missing_in_books_count: 0
                    };

                    const dbInserts = [];

                    // Construct result records for all Books entries (matched and unmatched)
                    for (const bKey of Object.keys(booksLiability)) {
                        const books = booksLiability[bKey];
                        const lastUnderscore = bKey.lastIndexOf('_');
                        const pan = bKey.substring(0, lastUnderscore);
                        const section = bKey.substring(lastUnderscore + 1);
                        const rule = rulesMap[section] || {};

                        const matchedTracesGroup = matchedBooks[bKey];

                        let panInBooks = pan.startsWith('NOPAN-') ? 'PAN-MISSING' : pan;
                        let panIn26Q = (matchedTracesGroup && matchedTracesGroup.partyPan) ? matchedTracesGroup.partyPan : '—';

                        // Rate Determination Hierarchy:
                        // 1. Use 26Q rate if present (and taxable amount > 0)
                        // 2. Else use Book PAN if valid
                        // 3. Else (Book PAN missing/invalid) use individual category rate
                        let rate = books.rateApplied;
                        let rateText = "";

                        if (matchedTracesGroup && matchedTracesGroup.tracesTaxable > 0) {
                            rate = Math.round((matchedTracesGroup.tracesTds / matchedTracesGroup.tracesTaxable) * 10000) / 100;
                            rateText = `Form 26Q`;
                        } else if (panInBooks && panInBooks !== 'PAN-MISSING' && PAN_REGEX.test(panInBooks)) {
                            const entityChar = panInBooks.charAt(3).toUpperCase();
                            const isIndividualOrHuf = (entityChar === 'P' || entityChar === 'H');
                            rate = isIndividualOrHuf ? (rule.rate_individual_huf ?? 1.0) : (rule.rate_company_others ?? 2.0);
                            rateText = `Books PAN`;
                        } else {
                            rate = rule.rate_individual_huf ?? 1.0;
                            rateText = `Individual fallback`;
                        }

                        // Apply the resolved rate
                        books.rateApplied = rate;
                        books.booksRequiredTds = Math.round((books.booksTaxable * rate) / 100);

                        // Clean up explanation message if books PAN was missing
                        if (panInBooks === 'PAN-MISSING') {
                            if (books.reason.includes('PAN: Missing')) {
                                books.reason = books.reason.replace(/\| PAN: Missing \([^)]+\)/g,
                                    `| PAN: Missing (${rate}% rate applied: ${rateText})`);
                            } else {
                                books.reason += ` | PAN: Missing (${rate}% rate applied: ${rateText})`;
                            }
                        }

                        let nameInBooks = books.partyName;
                        let nameIn26Q = matchedTracesGroup ? matchedTracesGroup.partyName : '—';

                        let tracesTaxable = matchedTracesGroup ? matchedTracesGroup.tracesTaxable : 0;
                        let tracesTds = matchedTracesGroup ? matchedTracesGroup.tracesTds : 0;

                        let taxableVariance = books.booksTaxable - tracesTaxable;
                        let tdsVariance = books.booksRequiredTds - tracesTds;

                        let status = 'Matched';
                        // Under Threshold: no taxable amount was computed (below annual/single-bill limits)
                        // This applies even if voluntary TDS was deducted in books
                        if (books.booksTaxable === 0 && books.booksRequiredTds === 0 && tracesTaxable === 0 && tracesTds === 0) {
                            status = 'Under Threshold';
                        } else if (!matchedTracesGroup && books.booksRequiredTds > 0) {
                            status = 'Missing in 26Q';
                        } else {
                            // Primary check: Books vs 26Q variance (the core purpose of reconciliation)
                            if (tdsVariance > 5) {
                                status = 'Short Deducted';   // 26Q has less TDS than books requires
                            } else if (tdsVariance < -5) {
                                status = 'Excess Deducted';  // 26Q has more TDS than books requires
                            } else {
                                status = 'Matched';          // Books and 26Q are in agreement
                            }
                        }

                        if (status !== 'Under Threshold') {
                            summary.total_parties_analyzed++;
                        }
                        if (status === 'Matched') summary.matched_count++;
                        else if (status === 'Short Deducted') summary.short_deducted_count++;
                        else if (status === 'Excess Deducted') summary.excess_deducted_count++;
                        else if (status === 'Missing in 26Q') summary.missing_in_26q_count++;

                        const remark = matchedTracesGroup ? (matchMethods[bKey] === 'Name (Exact)' ? "[Name Match] " : matchMethods[bKey] === 'Name (Fuzzy)' ? "[Fuzzy Name Match] " : "") : "";
                        const reason = remark + books.reason;

                        const resultRecord = {
                            party_name: nameInBooks,
                            party_pan: panInBooks,
                            pan_in_books: panInBooks,
                            pan_in_26q: panIn26Q,
                            name_in_books: nameInBooks,
                            name_in_26q: nameIn26Q,
                            entity_type: (panInBooks && panInBooks !== 'PAN-MISSING') ? getEntityTypeFromPan(panInBooks) : 'Unknown',
                            section_code: section,
                            nature_of_payment: rule.nature_of_payment || 'Unknown Nature',
                            ledgers: books.ledgers,
                            tds_ledgers: books.tdsLedgers,
                            books_spend: books.booksSpend,
                            books_taxable: books.booksTaxable,
                            books_rate_applied: books.rateApplied,
                            books_required_tds: books.booksRequiredTds,
                            books_actual_tds: books.booksActualTds,
                            traces_taxable: tracesTaxable,
                            traces_tds: tracesTds,
                            taxable_variance: taxableVariance,
                            tds_variance: tdsVariance,
                            status: status,
                            reason: reason
                        };

                        reconciliationResults.push(resultRecord);
                        dbInserts.push(resultRecord);
                    }

                    // Construct result records for unmatched TRACES entries
                    for (const tKey of unmatchedTraces) {
                        const traces = tracesLiability[tKey];
                        const rule = rulesMap[traces.section] || {};

                        let panInBooks = '—';
                        let panIn26Q = traces.partyPan;
                        let nameInBooks = '—';
                        let nameIn26Q = traces.partyName;

                        let tracesTaxable = traces.tracesTaxable;
                        let tracesTds = traces.tracesTds;

                        let taxableVariance = 0 - tracesTaxable;
                        let tdsVariance = 0 - tracesTds;

                        let status = 'Missing in Books';
                        summary.total_parties_analyzed++;
                        summary.missing_in_books_count++;

                        const resultRecord = {
                            party_name: nameIn26Q,
                            party_pan: panIn26Q,
                            pan_in_books: panInBooks,
                            pan_in_26q: panIn26Q,
                            name_in_books: nameInBooks,
                            name_in_26q: nameIn26Q,
                            entity_type: (panIn26Q && panIn26Q !== 'PAN-MISSING') ? getEntityTypeFromPan(panIn26Q) : 'Unknown',
                            section_code: traces.section,
                            nature_of_payment: rule.nature_of_payment || 'Unknown Nature',
                            ledgers: '',
                            tds_ledgers: '',
                            books_spend: 0,
                            books_taxable: 0,
                            books_rate_applied: 0,
                            books_required_tds: 0,
                            books_actual_tds: 0,
                            traces_taxable: tracesTaxable,
                            traces_tds: tracesTds,
                            taxable_variance: taxableVariance,
                            tds_variance: tdsVariance,
                            status: status,
                            reason: 'No expense entries found in Books (Directly reported in Form 26Q)'
                        };

                        reconciliationResults.push(resultRecord);
                        dbInserts.push(resultRecord);
                    }


                    // Save results to DB
                    db.serialize(() => {
                        // First clear old Recon_Results
                        db.run('DELETE FROM Recon_Results', [], (err) => {
                            if (err) console.error("Error clearing Recon_Results:", err.message);

                            // Save new records
                            const stmt = db.prepare(`INSERT INTO Recon_Results (
                                id, party_id, section_code, books_taxable, books_required_tds, 
                                books_actual_tds, traces_taxable, traces_tds, taxable_variance, 
                                tds_variance, reconciliation_status, calculated_at
                            ) VALUES (?, (SELECT id FROM Party_Masters WHERE party_name = ? LIMIT 1), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

                            const nowStr = new Date().toISOString();
                            dbInserts.forEach(r => {
                                stmt.run(
                                    randomUUID(), r.party_name, r.section_code, r.books_taxable, 
                                    r.books_required_tds, r.books_actual_tds, r.traces_taxable, 
                                    r.traces_tds, r.taxable_variance, r.tds_variance, r.status, nowStr
                                );
                            });
                            stmt.finalize();
                        });
                    });

                    res.json({
                        success: true,
                        summary,
                        results: reconciliationResults
                    });
                    });
                });
            });
        });
    });

    // Get all group mappings
    app.get('/api/tds/group-mappings', (req, res) => {
        db.all('SELECT * FROM Tally_Group_Mappings ORDER BY created_at DESC', [], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows.map(r => ({
                id: r.id,
                expenseGroup: r.expense_group,
                subGroup: r.sub_group,
                subGroup2: r.sub_group_2,
                sectionCode: r.mapped_section_code,
                createdAt: r.created_at
            })));
        });
    });

    // Add a group mapping
    app.post('/api/tds/group-mappings', (req, res) => {
        const { expenseGroup, subGroup, subGroup2, sectionCode } = req.body;
        if (!expenseGroup || !sectionCode) {
            return res.status(400).json({ error: "expenseGroup and sectionCode are required" });
        }
        const nowStr = new Date().toISOString();
        db.run(
            `INSERT INTO Tally_Group_Mappings (id, expense_group, sub_group, sub_group_2, mapped_section_code, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [randomUUID(), expenseGroup.trim(), subGroup ? subGroup.trim() : null, subGroup2 ? subGroup2.trim() : null, sectionCode.trim(), nowStr],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true });
            }
        );
    });

    // Delete a group mapping
    app.delete('/api/tds/group-mappings/:id', (req, res) => {
        db.run(
            `DELETE FROM Tally_Group_Mappings WHERE id = ?`,
            [req.params.id],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true });
            }
        );
    });

    // API: Reset all TDS Module Tables (except TDS Rules)
    app.post('/api/tds/reset', (req, res) => {
        db.serialize(() => {
            db.run('DELETE FROM Tally_Transactions');
            db.run('DELETE FROM Tally_Ledgers');
            db.run('DELETE FROM Tally_Group_Mappings');
            db.run('DELETE FROM Party_Masters');
            db.run('DELETE FROM Recon_Results', [], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true });
            });
        });
    });
}
