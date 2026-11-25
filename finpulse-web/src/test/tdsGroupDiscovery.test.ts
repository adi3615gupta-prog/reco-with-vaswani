/* eslint-disable @typescript-eslint/no-explicit-any -- loosely typed Express/SQLite harness; handlers are plain JS */
import { describe, it, expect, beforeAll } from 'vitest';
import sqlite3 from 'sqlite3';
import setupTdsRoutes from '../../tds_routes.js';

// Minimal Express-like router: captures handlers so they can be invoked directly against a real SQLite db.
type Handler = (req: any, res: any) => void;
function createRouter() {
    const routes: Record<string, Handler> = {};
    const app: any = {
        use: () => app,
        get: (p: string, h: Handler) => { routes[`GET ${p}`] = h; return app; },
        post: (p: string, h: Handler) => { routes[`POST ${p}`] = h; return app; },
        delete: (p: string, h: Handler) => { routes[`DELETE ${p}`] = h; return app; },
        put: (p: string, h: Handler) => { routes[`PUT ${p}`] = h; return app; },
        patch: (p: string, h: Handler) => { routes[`PATCH ${p}`] = h; return app; },
    };
    return { app, routes };
}

function call(routes: Record<string, Handler>, key: string, body?: any): Promise<{ status: number; data: any }> {
    return new Promise((resolve) => {
        const res = {
            statusCode: 200,
            status(c: number) { this.statusCode = c; return this; },
            json(d: any) { resolve({ status: this.statusCode, data: d }); return this; },
        };
        routes[key]({ body: body ?? {}, params: {}, query: {} }, res);
    });
}

function dbAll(db: sqlite3.Database, sql: string): Promise<any[]> {
    return new Promise((resolve, reject) => db.all(sql, [], (err, rows) => (err ? reject(err) : resolve(rows))));
}

describe('Tally group hierarchy auto-discovery & TDS section inheritance', () => {
    let db: sqlite3.Database;
    let routes: Record<string, Handler>;

    beforeAll(async () => {
        db = new sqlite3.Database(':memory:');
        const router = createRouter();
        routes = router.routes;
        setupTdsRoutes(router.app, db, null);
        // Wait for the setup's CREATE TABLE / ALTER / seed statements to finish
        await new Promise<void>((resolve) => db.serialize(() => db.get('SELECT 1', () => resolve())));
    });

    it('discovers a section for each group whose own name implies one (top-down paths, any depth)', async () => {
        const { status, data } = await call(routes, 'POST /api/tds/auto-discover-groups', {
            hierarchies: [
                ['Advocate Fees', 'Legal & Professional Charges', 'Indirect Expenses'],
                ['Freight & Cartage', 'Direct Expenses'],
                ['Plant Hire Charges', 'Rent Paid', 'Indirect Expenses'],
                ['Office Rent', 'Indirect Expenses'],
                ['Current Assets Misc', 'Indirect Expenses'], // 'CURRENT' must not be mistaken for RENT
            ],
        });
        expect(status).toBe(200);
        // Legal (194J(b)), Freight (194C), Rent Paid (194I(b)), Plant Hire (194I(a)), Office Rent (194I(b))
        expect(data.discovered).toBe(5);

        const rows = await dbAll(db, 'SELECT expense_group, sub_group, sub_group_2, mapped_section_code, full_path, source FROM Tally_Group_Mappings');
        const find = (path: string[]) => rows.find(r => JSON.parse(r.full_path).join('>') === path.join('>'));

        expect(find(['Indirect Expenses', 'Legal & Professional Charges'])?.mapped_section_code).toBe('194J(b)');
        expect(find(['Direct Expenses', 'Freight & Cartage'])?.mapped_section_code).toBe('194C');
        expect(find(['Indirect Expenses', 'Rent Paid'])?.mapped_section_code).toBe('194I(b)');
        expect(find(['Indirect Expenses', 'Rent Paid', 'Plant Hire Charges'])?.mapped_section_code).toBe('194I(a)');
        expect(find(['Indirect Expenses', 'Office Rent'])?.mapped_section_code).toBe('194I(b)');
        expect(rows.every(r => r.source === 'auto')).toBe(true);
        // No keyword hit for 'Current Assets Misc' or 'Advocate Fees' (the latter inherits from Legal)
        expect(rows.some(r => (r.sub_group || '').includes('Current'))).toBe(false);
        expect(rows.some(r => (r.sub_group_2 || '') === 'Advocate Fees')).toBe(false);
    });

    it('does not create duplicate templates on repeated discovery', async () => {
        const hierarchies = [['Advocate Fees', 'Legal & Professional Charges', 'Indirect Expenses']];
        const first = await call(routes, 'POST /api/tds/auto-discover-groups', { hierarchies });
        const second = await call(routes, 'POST /api/tds/auto-discover-groups', { hierarchies });
        expect(first.data.inserted).toBe(0); // already inserted by the previous test
        expect(second.data.inserted).toBe(0);
        const rows = await dbAll(db, 'SELECT id FROM Tally_Group_Mappings');
        expect(rows.length).toBe(5);
    });

    it('rejects a payload without a hierarchies array', async () => {
        const { status } = await call(routes, 'POST /api/tds/auto-discover-groups', {});
        expect(status).toBe(400);
    });

    it('inherits the group section at any depth, while explicit ledger mappings take precedence', async () => {
        // 4 levels deep: Indirect Expenses > Legal & Professional Charges > Advocate Fees > Senior Advocates > Advocate Ramesh
        await call(routes, 'POST /api/tds/extract-ledgers', {
            ledgers: [
                { ledgerName: 'Advocate Ramesh', parentGroup: 'Senior Advocates', parentGroupPath: 'Senior Advocates, Advocate Fees, Legal & Professional Charges, Indirect Expenses' },
                { ledgerName: 'Freight Charges Ltd', parentGroup: 'Freight & Cartage', parentGroupPath: 'Freight & Cartage, Direct Expenses' },
            ],
        });

        const before = (await call(routes, 'GET /api/tds/ledgers')).data;
        const ramesh = before.find((l: any) => l.ledgerName === 'Advocate Ramesh');
        expect(ramesh.sectionCode).toBeNull();
        expect(ramesh.inheritedSectionCode).toBe('194J(b)');
        expect(ramesh.inheritedGroupName).toBe('Legal & Professional Charges');

        const freight = before.find((l: any) => l.ledgerName === 'Freight Charges Ltd');
        expect(freight.inheritedSectionCode).toBe('194C');

        // Explicit user mapping overrides the inherited group section
        await call(routes, 'POST /api/tds/ledgers', { ledgerName: 'Advocate Ramesh', sectionCode: '194H' });
        const after = (await call(routes, 'GET /api/tds/ledgers')).data;
        const overridden = after.find((l: any) => l.ledgerName === 'Advocate Ramesh');
        expect(overridden.sectionCode).toBe('194H');
        expect(overridden.userValidated).toBe(true);
    });

    it('group tree nests every ledger under its groups and shows effective sections per node', async () => {
        const { status, data } = await call(routes, 'GET /api/tds/group-tree');
        expect(status).toBe(200);
        expect(data.totalLedgers).toBe(2);

        const indirect = data.roots.find((n: any) => n.name === 'Indirect Expenses');
        expect(indirect.explicitSectionCode).toBeNull();
        const legal = indirect.children.find((n: any) => n.name === 'Legal & Professional Charges');
        expect(legal.explicitSectionCode).toBe('194J(b)');
        expect(legal.source).toBe('auto');
        const advocateFees = legal.children.find((n: any) => n.name === 'Advocate Fees');
        expect(advocateFees.effectiveSectionCode).toBe('194J(b)'); // inherited from Legal
        expect(advocateFees.inheritedFromPath).toEqual(['Indirect Expenses', 'Legal & Professional Charges']);
        const seniors = advocateFees.children.find((n: any) => n.name === 'Senior Advocates');
        expect(seniors.ledgers[0].ledgerName).toBe('Advocate Ramesh');
        expect(seniors.ledgers[0].effectiveSectionCode).toBe('194H'); // explicit override wins

        const direct = data.roots.find((n: any) => n.name === 'Direct Expenses');
        const freight = direct.children.find((n: any) => n.name === 'Freight & Cartage');
        expect(freight.ledgers[0].effectiveSectionCode).toBe('194C');
    });

    it('sets and clears the section of any group at any depth from the tree', async () => {
        const path = ['Indirect Expenses', 'Office & Admin', 'Courier Charges'];
        const set = await call(routes, 'PUT /api/tds/group-tree/section', { path, sectionCode: '194C' });
        expect(set.data.created).toBe(true);

        const rows = await dbAll(db, 'SELECT full_path, source FROM Tally_Group_Mappings');
        expect(rows.some(r => r.full_path === JSON.stringify(path) && r.source === 'manual')).toBe(true);

        const cleared = await call(routes, 'PUT /api/tds/group-tree/section', { path, sectionCode: '' });
        expect(cleared.data.removed).toBe(true);
    });
it('keeps non-expense ledgers (bank, sales, incomes) out of the TDS scope', async () => {
        await call(routes, 'POST /api/tds/extract-ledgers', {
            ledgers: [
                { ledgerName: 'HDFC Bank', parentGroup: 'Bank Accounts', parentGroupPath: 'Bank Accounts, Current Assets' },
                { ledgerName: 'Sales A/c 1', parentGroup: 'Sales Accounts', parentGroupPath: 'Sales Accounts' },
                { ledgerName: 'Interest Recd', parentGroup: 'Indirect Incomes', parentGroupPath: 'Indirect Incomes' },
            ],
        });
        const names = (await call(routes, 'GET /api/tds/ledgers')).data.map((l: any) => l.ledgerName);
        expect(names).not.toContain('HDFC Bank');
        expect(names).not.toContain('Sales A/c 1');
        expect(names).not.toContain('Interest Recd');

        const tree = (await call(routes, 'GET /api/tds/group-tree')).data;
        const rootNames: string[] = tree.roots.map((r: any) => r.name);
        for (const g of ['Current Assets', 'Sales Accounts', 'Indirect Incomes']) expect(rootNames).not.toContain(g);
        expect(tree.totalLedgers).toBe(2); // only the two expense ledgers from the earlier tests
    });
    it('bulk-imports group sections by path: creates new, updates existing, skips blanks', async () => {
        const { status, data } = await call(routes, 'POST /api/tds/group-tree/import', {
            items: [
                { path: ['Indirect Expenses', 'Office & Admin', 'Courier Charges'], sectionCode: '194C' },
                { path: ['Indirect Expenses', 'Legal & Professional Charges'], sectionCode: '194J(a)' },
                { path: [], sectionCode: '194C' }, // no path: skipped
            ],
        });
        expect(status).toBe(200);
        expect(data.created).toBe(1);
        expect(data.updated).toBe(1);
        expect(data.skipped).toBe(1);

        const rows = await dbAll(db, 'SELECT full_path, mapped_section_code FROM Tally_Group_Mappings');
        expect(rows.find(r => r.full_path === JSON.stringify(['Indirect Expenses', 'Legal & Professional Charges']))?.mapped_section_code).toBe('194J(a)');
        expect(rows.some(r => r.full_path === JSON.stringify(['Indirect Expenses', 'Office & Admin', 'Courier Charges']))).toBe(true);
    });
    it('template import sets ledger overrides and INHERIT returns them to the group', async () => {
        const { data } = await call(routes, 'POST /api/tds/group-tree/import', {
            items: [{ path: ['Direct Expenses', 'Freight & Cartage'], sectionCode: null }],
            ledgers: [
                { ledgerName: 'Advocate Ramesh', sectionCode: '194C' },
                { ledgerName: 'Freight Charges Ltd', sectionCode: null },
            ],
        });
        expect(data.removed).toBe(1);
        expect(data.ledgersSet).toBe(1);
        expect(data.ledgersCleared).toBe(1);

        const ledgers = (await call(routes, 'GET /api/tds/ledgers')).data;
        const ramesh = ledgers.find((l: any) => l.ledgerName === 'Advocate Ramesh');
        expect(ramesh.sectionCode).toBe('194C');
        const freight = ledgers.find((l: any) => l.ledgerName === 'Freight Charges Ltd');
        expect(freight.sectionCode).toBeNull();
        expect(freight.inheritedSectionCode).toBeNull(); // group's own section was removed above
    });
    it('EXCLUDE moves a ledger out of its group into the Excluded bucket', async () => {
        await call(routes, 'POST /api/tds/ledgers/update', { ledgerName: 'Freight Charges Ltd', sectionCode: 'EXCLUDE', isTdsLedger: false });
        const tree = (await call(routes, 'GET /api/tds/group-tree')).data;
        const bucket = tree.roots.find((n: any) => n.name === 'Excluded from TDS');
        expect(bucket.virtual).toBe(true);
        expect(bucket.ledgers.map((l: any) => l.ledgerName)).toContain('Freight Charges Ltd');
        // Direct Expenses held only this ledger in the fixture, so its root is gone from the tree
        expect(tree.roots.find((n: any) => n.name === 'Direct Expenses')).toBeUndefined();
        expect(tree.totalLedgers).toBe(2);
    });
    it('Duties & Taxes ledgers live on the TAX side, separate from the expense tree, and can be ticked as TDS', async () => {
        const withSide = (key: string, side: string) => new Promise<any>((resolve) => {
            routes[key]({ body: {}, params: {}, query: { side } }, { status() { return this; }, json: resolve });
        });
        await call(routes, 'POST /api/tds/extract-ledgers', {
            ledgers: [
                { ledgerName: 'TDS Payable 194C Contractor', parentGroup: 'TDS', parentGroupPath: 'TDS, Duties & Taxes' },
                { ledgerName: 'Plain Tax Ledger', parentGroup: 'Duties & Taxes', parentGroupPath: 'Duties & Taxes' },
            ],
        });
        const taxTree = await withSide('GET /api/tds/group-tree', 'TAX');
        const taxNames = JSON.stringify(taxTree.roots);
        expect(taxNames).toContain('TDS Payable 194C Contractor');
        expect(taxNames).toContain('Plain Tax Ledger');

        const expenseTree = await withSide('GET /api/tds/group-tree', 'EXPENSE');
        expect(JSON.stringify(expenseTree.roots)).not.toContain('TDS Payable 194C Contractor');
        expect(expenseTree.roots.map((r: any) => r.name)).not.toContain('Duties & Taxes');

        // Ticking TDS keeps the ledger on the TAX side and flags it
        await call(routes, 'POST /api/tds/ledgers/update', { ledgerName: 'Plain Tax Ledger', sectionCode: null, isTdsLedger: true });
        const taxList = await withSide('GET /api/tds/ledgers', 'TAX');
        expect(taxList.find((l: any) => l.ledgerName === 'Plain Tax Ledger')?.isTdsLedger).toBe(true);
    });
});
