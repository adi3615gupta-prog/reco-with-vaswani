import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import multer from 'multer';

// Dynamically bundle the TypeScript tax engine to ESM for backend use
try {
  console.log('[Tax Engine] Compiling incomeTaxEngine.ts for backend execution...');
  execSync('npx esbuild src/lib/incomeTaxEngine.ts --bundle --platform=node --format=esm --outfile=src/server_lib/incomeTaxEngine.js');
} catch (err) {
  console.warn('[Tax Engine] Warning: Failed to bundle incomeTaxEngine.ts. Make sure esbuild is installed. Proceeding with existing compiled version if available.', err.message);
}

// We use dynamic import because the file was just generated
const loadTaxEngine = async () => {
    // Dynamic import bypasses Node caching if we append a timestamp, but here it's fine
    return await import('./src/server_lib/incomeTaxEngine.js');
};

export default function setupTaxRoutes(app, db) {
    // Enable foreign keys in SQLite for CASCADE deletes
    db.run('PRAGMA foreign_keys = ON;');

    // 1. Initialize SQLite Tables for Tax Engine
    db.serialize(() => {
        // Taxpayer Profiles
        db.run(`CREATE TABLE IF NOT EXISTS Taxpayer_Profiles (
            profile_id TEXT PRIMARY KEY,
            name TEXT,
            pan TEXT,
            age INTEGER,
            opted_for_new_regime INTEGER,
            financial_year TEXT,
            assessment_year TEXT,
            residential_status TEXT,
            entity_type TEXT DEFAULT 'INDIVIDUAL',
            company_turnover_under_400cr INTEGER DEFAULT 0,
            corporate_tax_section TEXT DEFAULT 'NORMAL',
            created_at TEXT,
            updated_at TEXT
        )`);

        // Migrate existing tables if columns are missing
        db.run(`ALTER TABLE Taxpayer_Profiles ADD COLUMN entity_type TEXT DEFAULT 'INDIVIDUAL'`, () => {});
        db.run(`ALTER TABLE Taxpayer_Profiles ADD COLUMN company_turnover_under_400cr INTEGER DEFAULT 0`, () => {});
        db.run(`ALTER TABLE Taxpayer_Profiles ADD COLUMN corporate_tax_section TEXT DEFAULT 'NORMAL'`, () => {});

        // Income Records
        db.run(`CREATE TABLE IF NOT EXISTS Income_Records (
            id TEXT PRIMARY KEY,
            profile_id TEXT,
            income_type TEXT,
            description TEXT,
            gross_amount REAL,
            exempt_amount REAL,
            net_amount REAL,
            section_code TEXT,
            use_indexation INTEGER,
            FOREIGN KEY (profile_id) REFERENCES Taxpayer_Profiles(profile_id) ON DELETE CASCADE
        )`);

        // Deduction Records
        db.run(`CREATE TABLE IF NOT EXISTS Deduction_Records (
            id TEXT PRIMARY KEY,
            profile_id TEXT,
            section_code TEXT,
            claimed_amount REAL,
            eligible_amount REAL,
            FOREIGN KEY (profile_id) REFERENCES Taxpayer_Profiles(profile_id) ON DELETE CASCADE
        )`);

        // Tax Bracket Rules (Custom overrides, otherwise engine defaults are used)
        db.run(`CREATE TABLE IF NOT EXISTS Tax_Bracket_Rules (
            id TEXT PRIMARY KEY,
            regime_type TEXT,
            age_category TEXT,
            lower_limit REAL,
            upper_limit REAL,
            rate_percent REAL,
            financial_year TEXT
        )`);

        // Final Tax Assessments
        db.run(`CREATE TABLE IF NOT EXISTS Tax_Assessments (
            id TEXT PRIMARY KEY,
            profile_id TEXT,
            assessment_year TEXT,
            total_tax_liability REAL,
            effective_tax_rate REAL,
            computed_at TEXT,
            full_json TEXT,
            FOREIGN KEY (profile_id) REFERENCES Taxpayer_Profiles(profile_id) ON DELETE CASCADE
        )`);

        // Staging AIS Data
        db.run(`CREATE TABLE IF NOT EXISTS Staging_AIS_Data (
            id TEXT PRIMARY KEY,
            profile_id TEXT,
            category TEXT,
            source_name TEXT,
            gross_amount REAL,
            tds_deducted REAL,
            status TEXT DEFAULT 'Pending',
            FOREIGN KEY (profile_id) REFERENCES Taxpayer_Profiles(profile_id) ON DELETE CASCADE
        )`);

        // Staging Form 26AS
        db.run(`CREATE TABLE IF NOT EXISTS Staging_Form26AS (
            id TEXT PRIMARY KEY,
            profile_id TEXT,
            tan_of_deductor TEXT,
            section_code TEXT,
            total_amount_credited REAL,
            total_tax_deducted REAL,
            FOREIGN KEY (profile_id) REFERENCES Taxpayer_Profiles(profile_id) ON DELETE CASCADE
        )`);
    });

    // ── Helper functions for SQLite queries ────────────────────────────────

    const runAsync = (query, params = []) => {
        return new Promise((resolve, reject) => {
            db.run(query, params, function (err) {
                if (err) reject(err);
                else resolve(this);
            });
        });
    };

    const getAsync = (query, params = []) => {
        return new Promise((resolve, reject) => {
            db.get(query, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    };

    const allAsync = (query, params = []) => {
        return new Promise((resolve, reject) => {
            db.all(query, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    };

    // ── API Routes ─────────────────────────────────────────────────────────

    /**
     * POST /api/tax/profile
     * Create or update a taxpayer's core profile
     */
    app.post('/api/tax/profile', async (req, res) => {
        try {
            const profile = req.body;
            const profile_id = profile.profile_id || randomUUID();
            const now = new Date().toISOString();

            await runAsync(
                `INSERT INTO Taxpayer_Profiles 
                (profile_id, name, pan, age, opted_for_new_regime, financial_year, assessment_year, residential_status, entity_type, company_turnover_under_400cr, corporate_tax_section, created_at, updated_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(profile_id) DO UPDATE SET 
                name=excluded.name, pan=excluded.pan, age=excluded.age, 
                opted_for_new_regime=excluded.opted_for_new_regime, 
                financial_year=excluded.financial_year, assessment_year=excluded.assessment_year, 
                residential_status=excluded.residential_status,
                entity_type=excluded.entity_type,
                company_turnover_under_400cr=excluded.company_turnover_under_400cr,
                corporate_tax_section=excluded.corporate_tax_section,
                updated_at=excluded.updated_at`,
                [
                    profile_id, profile.name, profile.pan, profile.age, 
                    profile.opted_for_new_regime ? 1 : 0, profile.financial_year, 
                    profile.assessment_year, profile.residential_status || 'ROR',
                    profile.entity_type || 'INDIVIDUAL',
                    profile.company_turnover_under_400cr ? 1 : 0,
                    profile.corporate_tax_section || 'NORMAL',
                    now, now
                ]
            );

            const savedProfile = await getAsync(`SELECT * FROM Taxpayer_Profiles WHERE profile_id = ?`, [profile_id]);
            res.json({ success: true, profile: savedProfile });
        } catch (err) {
            console.error(err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    /**
     * POST /api/tax/income
     * Bulk replace income streams for a profile
     */
    app.post('/api/tax/income', async (req, res) => {
        try {
            const { profile_id, incomes } = req.body;
            if (!profile_id) return res.status(400).json({ error: "Missing profile_id" });

            // Using transaction to replace all incomes
            await runAsync('BEGIN TRANSACTION');
            try {
                await runAsync(`DELETE FROM Income_Records WHERE profile_id = ?`, [profile_id]);

                for (const inc of incomes) {
                    await runAsync(
                        `INSERT INTO Income_Records 
                        (id, profile_id, income_type, description, gross_amount, exempt_amount, net_amount, section_code, use_indexation) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            inc.id || randomUUID(), profile_id, inc.income_type, inc.description,
                            inc.gross_amount, inc.exempt_amount, inc.net_amount, inc.section_code,
                            inc.use_indexation === true ? 1 : (inc.use_indexation === false ? 0 : null)
                        ]
                    );
                }
                await runAsync('COMMIT');
                res.json({ success: true, count: incomes.length });
            } catch (err) {
                await runAsync('ROLLBACK');
                throw err;
            }
        } catch (err) {
            console.error(err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    /**
     * POST /api/tax/deductions
     * Bulk replace deductions for a profile
     */
    app.post('/api/tax/deductions', async (req, res) => {
        try {
            const { profile_id, deductions } = req.body;
            if (!profile_id) return res.status(400).json({ error: "Missing profile_id" });

            await runAsync('BEGIN TRANSACTION');
            try {
                await runAsync(`DELETE FROM Deduction_Records WHERE profile_id = ?`, [profile_id]);

                for (const ded of deductions) {
                    await runAsync(
                        `INSERT INTO Deduction_Records (id, profile_id, section_code, claimed_amount, eligible_amount) 
                        VALUES (?, ?, ?, ?, ?)`,
                        [
                            ded.id || randomUUID(), profile_id, ded.section_code, 
                            ded.claimed_amount, ded.eligible_amount || 0
                        ]
                    );
                }
                await runAsync('COMMIT');
                res.json({ success: true, count: deductions.length });
            } catch (err) {
                await runAsync('ROLLBACK');
                throw err;
            }
        } catch (err) {
            console.error(err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    /**
     * GET /api/tax/assessment/:profileId
     * CORE ENDPOINT: Fetch data, run the TS engine, save result, return JSON
     */
    app.get('/api/tax/assessment/:profileId', async (req, res) => {
        try {
            const { profileId } = req.params;

            // 1. Fetch data from SQLite
            const profileRow = await getAsync(`SELECT * FROM Taxpayer_Profiles WHERE profile_id = ?`, [profileId]);
            if (!profileRow) return res.status(404).json({ error: "Profile not found" });

            const incomesRaw = await allAsync(`SELECT * FROM Income_Records WHERE profile_id = ?`, [profileId]);
            const deductionsRaw = await allAsync(`SELECT * FROM Deduction_Records WHERE profile_id = ?`, [profileId]);

            const profile = {
                profile_id: profileRow.profile_id,
                name: profileRow.name,
                pan: profileRow.pan,
                age: profileRow.age,
                opted_for_new_regime: profileRow.opted_for_new_regime === 1,
                financial_year: profileRow.financial_year,
                assessment_year: profileRow.assessment_year,
                residential_status: profileRow.residential_status,
                entity_type: profileRow.entity_type || 'INDIVIDUAL',
                company_turnover_under_400cr: profileRow.company_turnover_under_400cr === 1,
                corporate_tax_section: profileRow.corporate_tax_section || 'NORMAL'
            };

            const incomes = incomesRaw.map(inc => ({
                id: inc.id,
                profile_id: inc.profile_id,
                income_type: inc.income_type,
                description: inc.description,
                gross_amount: inc.gross_amount,
                exempt_amount: inc.exempt_amount,
                net_amount: inc.net_amount,
                section_code: inc.section_code,
                use_indexation: inc.use_indexation === null ? null : inc.use_indexation === 1
            }));

            const deductions = deductionsRaw.map(ded => ({
                id: ded.id,
                profile_id: ded.profile_id,
                section_code: ded.section_code,
                claimed_amount: ded.claimed_amount,
                eligible_amount: ded.eligible_amount
            }));

            // 2. Dynamically import and run the compiled Engine
            const engine = await loadTaxEngine();
            const { compareRegimes } = engine;

            // Optional: Fetch custom slabs if any exist in Tax_Bracket_Rules for this FY
            const customSlabsRaw = await allAsync(`SELECT * FROM Tax_Bracket_Rules WHERE financial_year = ?`, [profile.financial_year]);
            let customSlabs = undefined;
            if (customSlabsRaw.length > 0) {
                customSlabs = customSlabsRaw.map(s => ({
                    id: s.id,
                    regime_type: s.regime_type,
                    age_category: s.age_category,
                    lower_limit: s.lower_limit,
                    upper_limit: s.upper_limit,
                    rate_percent: s.rate_percent,
                    financial_year: s.financial_year
                }));
            }

            // Run comparison computation
            const comparison = compareRegimes(profile, incomes, deductions, customSlabs);

            // Determine active assessment based on profile selection to save summary to DB
            const activeAssessment = profile.opted_for_new_regime ? comparison.newRegimeAssessment : comparison.oldRegimeAssessment;

            // Convert Decimal values to numbers for SQLite columns
            const totalTax = typeof activeAssessment.totalTaxLiability.toNumber === 'function' 
                ? activeAssessment.totalTaxLiability.toNumber() 
                : activeAssessment.totalTaxLiability;
                
            const effectiveRate = typeof activeAssessment.effectiveTaxRate.toNumber === 'function' 
                ? activeAssessment.effectiveTaxRate.toNumber() 
                : activeAssessment.effectiveTaxRate;

            // 3. Save Final Calculated Values into Tax_Assessments table
            const assessmentId = randomUUID();
            const computedAt = activeAssessment.computedAt || new Date().toISOString();
            
            // To safely store JSON, serialize the comparison object
            const serializeDecimal = (key, value) => {
                if (value && typeof value === 'object' && '_value' in value) {
                    if (typeof value.toNumber === 'function') return value.toNumber();
                    try {
                        const scaled = BigInt(value._value);
                        return Number(scaled) / 10000;
                    } catch(e) {}
                }
                if (typeof value === 'bigint') return value.toString();
                return value;
            };

            const fullJson = JSON.stringify(comparison, serializeDecimal);

            await runAsync(
                `INSERT INTO Tax_Assessments 
                (id, profile_id, assessment_year, total_tax_liability, effective_tax_rate, computed_at, full_json)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    assessmentId, profile.profile_id, profile.assessment_year,
                    totalTax, effectiveRate, computedAt, fullJson
                ]
            );

            // 4. Return comparison breakdown
            res.json({ success: true, assessmentId, data: JSON.parse(fullJson) });

        } catch (err) {
            console.error(err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    const upload = multer({ storage: multer.memoryStorage() });

    app.post('/api/tax/import/ais-json', upload.single('file'), async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ success: false, error: 'No file uploaded.' });
            }
            
            // 1. Read & Parse JSON
            let aisData;
            try {
                aisData = JSON.parse(req.file.buffer.toString('utf8'));
            } catch (parseErr) {
                return res.status(400).json({ success: false, error: 'Invalid JSON file structure.' });
            }

            const profileId = req.query.profile_id || 'CURRENT_USER';
            
            // 2. Fetch client profile for PAN validation
            const profile = await getAsync(`SELECT * FROM Taxpayer_Profiles WHERE profile_id = ?`, [profileId]);
            if (!profile) {
                return res.status(404).json({ success: false, error: 'Taxpayer profile not found.' });
            }

            // PAN Validation Lock
            const filePan = aisData.PartA?.PAN || aisData.PartA?.pan || aisData.pan || aisData.PAN;
            if (filePan && profile.pan && filePan.toUpperCase() !== profile.pan.toUpperCase()) {
                return res.status(400).json({ 
                    success: false, 
                    error: `PAN mismatch! File belongs to ${filePan}, but active profile PAN is ${profile.pan}.` 
                });
            }

            // 3. Process & Map AIS Records
            const suggestedIncomes = [];

            // Helper to clean and convert values
            const getAmountVal = (val) => {
                if (!val) return 0;
                return parseFloat(String(val).replace(/[^0-9.]/g, '')) || 0;
            };

            // Mapping TDS_TCS_Information
            const tdsInfo = aisData.TDS_TCS_Information || aisData.tds_tcs_information || [];
            for (const item of tdsInfo) {
                const rawSec = item.sectionCode || item.Section_Code || item.section_code || '';
                const source = item.deductorName || item.Deductor_Name || item.deductor_name || item.Source || 'Unknown';
                const gross = getAmountVal(item.totalAmountCredited !== undefined ? item.totalAmountCredited : (item.Gross_Amount || item.gross_amount || item.Total_Amount_Credited || 0));
                const tds = getAmountVal(item.totalTaxDeducted !== undefined ? item.totalTaxDeducted : (item.Tds_Amount || item.tds_amount || item.Total_Tax_Deducted || 0));

                // Map using Mapping Dictionary
                let category = 'OTHER_SOURCES'; // default
                let desc = `TDS u/s ${rawSec || 'Unknown Section'} - ${source}`;

                if (rawSec.includes('192')) {
                    category = 'SALARY';
                    desc = `Salary from ${source}`;
                } else if (rawSec.includes('194A')) {
                    category = 'OTHER_SOURCES';
                    desc = `Interest Income u/s 194A - ${source}`;
                } else if (rawSec.includes('194C') || rawSec.includes('194J')) {
                    category = 'BUSINESS';
                    desc = `Business/Professional Receipts u/s ${rawSec} - ${source}`;
                } else if (rawSec.includes('194B')) {
                    category = 'CASUAL_INCOME';
                    desc = `Casual/Winning Income u/s 194B - ${source}`;
                }

                if (gross > 0) {
                    const id = randomUUID();
                    // Save to staging table
                    await runAsync(
                        `INSERT INTO Staging_AIS_Data (id, profile_id, category, source_name, gross_amount, tds_deducted, status)
                         VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        [id, profileId, category, source, gross, tds, 'Pending']
                    );

                    suggestedIncomes.push({
                        id,
                        source: source,
                        amount: gross,
                        tds: tds,
                        suggestedCategory: category,
                        description: desc,
                        sectionCode: rawSec || 'Unknown'
                    });
                }
            }

            // Mapping SFT_Information
            const sftInfo = aisData.SFT_Information || aisData.sft_information || [];
            for (const item of sftInfo) {
                const source = item.sourceName || item.Source_Name || item.source_name || item.Depository_Name || 'Unknown';
                const gross = getAmountVal(item.grossAmount !== undefined ? item.grossAmount : (item.Gross_Amount || item.gross_amount || item.Transaction_Value || 0));
                const desc = item.transactionDescription || item.Description || item.description || 'Unknown Transaction';

                let category = 'OTHER_SOURCES';
                let isCompliance = false;

                const lowerDesc = desc.toLowerCase();
                const lowerSource = source.toLowerCase();

                if (
                    lowerDesc.includes('credit card') ||
                    lowerDesc.includes('cash deposit') ||
                    lowerDesc.includes('cash deposits') ||
                    lowerDesc.includes('sub-registrar') ||
                    lowerSource.includes('credit card') ||
                    lowerSource.includes('cash deposit') ||
                    lowerSource.includes('cash deposits') ||
                    lowerSource.includes('sub-registrar')
                ) {
                    category = 'COMPLIANCE';
                    isCompliance = true;
                } else if (lowerDesc.includes('mutual fund') || lowerDesc.includes('share') || lowerDesc.includes('equity') || lowerDesc.includes('securities')) {
                    category = 'CAPITAL_GAINS';
                } else if (lowerDesc.includes('dividend')) {
                    category = 'OTHER_SOURCES';
                } else if (lowerDesc.includes('salary')) {
                    category = 'SALARY';
                }

                if (gross > 0) {
                    const id = randomUUID();
                    await runAsync(
                        `INSERT INTO Staging_AIS_Data (id, profile_id, category, source_name, gross_amount, tds_deducted, status)
                         VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        [id, profileId, category, source, gross, 0, 'Pending']
                    );

                    suggestedIncomes.push({
                        id,
                        source: `${source} (${desc})`,
                        amount: gross,
                        tds: 0,
                        suggestedCategory: category,
                        description: desc,
                        sectionCode: 'SFT',
                        isCompliance: isCompliance
                    });
                }
            }

            res.json({ success: true, pan: filePan, data: suggestedIncomes });
        } catch (err) {
            console.error('AIS Import Error:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // ── LevitateExtract Proxy ─────────────────────────────────────────────
    // Proxies Form 26AS PDF uploads to the LevitateExtract microservice
    // running on port 8000 and streams the Excel response back.
    // ──────────────────────────────────────────────────────────────────────

    app.post('/api/tax/extract-26as-pdf', upload.single('file'), async (req, res) => {
        try {
            console.log('Received file in Node:', req.file ? {
                fieldname: req.file.fieldname,
                originalname: req.file.originalname,
                mimetype: req.file.mimetype,
                size: req.file.size
            } : 'no file');
            if (!req.file) {
                return res.status(400).json({ success: false, error: 'No file uploaded.' });
            }

            // Quick client-side validation before forwarding to microservice
            const fileBuffer = req.file.buffer;
            const maxSize = 10 * 1024 * 1024; // 10MB
            if (fileBuffer.length > maxSize) {
                return res.status(400).json({
                    success: false,
                    error: `File size (${(fileBuffer.length / (1024 * 1024)).toFixed(1)} MB) exceeds the 10 MB limit.`
                });
            }

            // Forward to LevitateExtract microservice
            const LEVITATE_URL = process.env.LEVITATE_EXTRACT_URL || 'http://localhost:8000/extract';

            // Build multipart/form-data for the Python service
            const FormData = (await import('form-data')).default;
            const formData = new FormData();
            const originalName = req.file.originalname || 'form_26as.pdf';
            const isTxt = originalName.toLowerCase().endsWith('.txt');
            formData.append('file', fileBuffer, {
                filename: originalName,
                contentType: isTxt ? 'text/plain' : 'application/pdf',
            });

            const http = await import('http');
            const { URL } = await import('url');
            const targetUrl = new URL(LEVITATE_URL);

            const proxyReq = http.default.request(
                {
                    hostname: targetUrl.hostname,
                    port: targetUrl.port || 8000,
                    path: targetUrl.pathname,
                    method: 'POST',
                    headers: formData.getHeaders(),
                },
                (proxyRes) => {
                    // Check if the microservice returned an error
                    if (proxyRes.statusCode >= 400) {
                        let body = '';
                        proxyRes.on('data', chunk => (body += chunk));
                        proxyRes.on('end', () => {
                            try {
                                const errorData = JSON.parse(body);
                                return res.status(proxyRes.statusCode).json({
                                    success: false,
                                    error: errorData.detail || 'LevitateExtract service returned an error.'
                                });
                            } catch {
                                return res.status(proxyRes.statusCode).json({
                                    success: false,
                                    error: 'LevitateExtract service returned an error.'
                                });
                            }
                        });
                        return;
                    }

                    // Stream the Excel response back to the client
                    res.set({
                        'Content-Type': proxyRes.headers['content-type'] || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                        'Content-Disposition': proxyRes.headers['content-disposition'] || 'attachment; filename="Form_26AS_Extract.xlsx"',
                        'X-LevitateExtract-Rows': proxyRes.headers['x-levitateextract-rows'] || '0',
                        'X-LevitateExtract-Checksum': proxyRes.headers['x-levitateextract-checksum'] || 'unknown',
                    });
                    proxyRes.pipe(res);
                }
            );

            proxyReq.on('error', (err) => {
                console.error('[LevitateExtract Proxy] Connection failed:', err.message);
                return res.status(503).json({
                    success: false,
                    error: 'The LevitateExtract service is not available. Please ensure the Docker container is running (docker-compose up).'
                });
            });

            formData.pipe(proxyReq);

        } catch (err) {
            console.error('[LevitateExtract Proxy] Error:', err.message);
            res.status(500).json({ success: false, error: err.message });
        }
    });
}
