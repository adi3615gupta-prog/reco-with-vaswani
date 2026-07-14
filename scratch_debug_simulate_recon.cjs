const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('network_data.db');

// Simple XML parser
function getTagContent(str, tag) {
    const openTag = `<${tag}`;
    const closeTag = `</${tag}>`;
    const startIdx = str.indexOf(openTag);
    if (startIdx === -1) return '';
    const endOpenIdx = str.indexOf('>', startIdx);
    if (endOpenIdx === -1) return '';
    const endIdx = str.indexOf(closeTag, endOpenIdx);
    if (endIdx === -1) return '';
    return str.substring(endOpenIdx + 1, endIdx).trim();
}

function safeNum(val) {
    if (!val) return 0;
    const cleaned = val.replace(/[₹,\s]/g, '').replace(/Dr|Cr/gi, '').trim();
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : Math.abs(n);
}

function runSimulation() {
    console.log("Loading metadata from SQLite...");
    db.serialize(() => {
        // 1. Get Group Mappings
        db.all("SELECT * FROM Tally_Group_Mappings", [], (err, groupMappings) => {
            if (err) return console.error(err);
            console.log("Group Mappings:", groupMappings);

            // 2. Get Ledgers
            db.all("SELECT * FROM Tally_Ledgers", [], (err, ledgers) => {
                if (err) return console.error(err);
                
                const ledgerMap = {};
                const ledgerParentMap = new Map();
                const groupParentMap = new Map();

                ledgers.forEach(l => {
                    const ln = l.ledger_name.toUpperCase().trim();
                    ledgerParentMap.set(ln, l.parent_group ? l.parent_group.toUpperCase().trim() : '');
                    if (l.is_tds_ledger) {
                        ledgerMap[l.ledger_name.toLowerCase().trim()] = l.mapped_section_code;
                    }

                    // Parse path to construct groupParentMap
                    if (l.parent_group_path) {
                        const parts = l.parent_group_path.split(',').map(s => s.trim().toUpperCase());
                        for (let i = 0; i < parts.length - 1; i++) {
                            groupParentMap.set(parts[i], parts[i+1]);
                        }
                    }
                });

                console.log("Validated Ledgers in DB:", Object.keys(ledgerMap));

                // Helper hierarchy
                const getHierarchy = (ledgerName) => {
                    const path = [];
                    const currentLedgerUpper = ledgerName.replace(/\s+/g, ' ').toUpperCase().trim();
                    let currentGroup = ledgerParentMap.get(currentLedgerUpper);
                    const visited = new Set();
                    while (currentGroup && !visited.has(currentGroup)) {
                        path.push(currentGroup);
                        visited.add(currentGroup);
                        currentGroup = groupParentMap.get(currentGroup);
                    }
                    return path;
                };

                const matchesMapping = (ledgerHierarchy, mapping) => {
                    const normalize = (s) => s.replace(/\s+/g, ' ').toUpperCase().trim();
                    const g1 = normalize(mapping.expense_group);
                    const g2 = mapping.sub_group ? normalize(mapping.sub_group) : null;
                    const g3 = mapping.sub_group_2 ? normalize(mapping.sub_group_2) : null;

                    if (!ledgerHierarchy.includes(g1)) return false;
                    if (g2 && !ledgerHierarchy.includes(g2)) return false;
                    if (g3 && !ledgerHierarchy.includes(g3)) return false;
                    return true;
                };

                // 3. Read and parse XML entries
                console.log("Parsing XML...");
                const data = fs.readFileSync('tally_response.xml', 'utf8');
                const entryRegex = /<LEDGERENTRY[^>]*>([\s\S]*?)<\/LEDGERENTRY>/g;
                let match;
                const entries = [];
                while ((match = entryRegex.exec(data)) !== null) {
                    const block = match[1];
                    const ledgerName = getTagContent(block, 'LEDGERNAME');
                    const partyName = getTagContent(block, 'PARTYNAME');
                    const vchType = getTagContent(block, 'VCHTYPE');
                    const vchNumber = getTagContent(block, 'VCHNUMBER');
                    const amount = getTagContent(block, 'AMOUNT');
                    const isDeemedPositive = getTagContent(block, 'ISDEEMEDPOSITIVE');
                    const guid = getTagContent(block, 'GUID');
                    const date = getTagContent(block, 'VCHDATE');

                    entries.push({
                        ledgerName,
                        partyName,
                        vchType,
                        vchNumber,
                        amount,
                        isDeemedPositive,
                        guid,
                        date
                    });
                }

                const vouchers = {};
                entries.forEach(e => {
                    if (!e.guid) return;
                    if (!vouchers[e.guid]) vouchers[e.guid] = [];
                    vouchers[e.guid].push(e);
                });

                console.log("Total GUIDs parsed:", Object.keys(vouchers).length);

                const results = [];
                let windairCount = 0;
                let windairVch = null;

                for (const guid in vouchers) {
                    const list = vouchers[guid];
                    const firstEntry = list[0];
                    let party = '';
                    let tdsAmount = 0;
                    const expenses = [];

                    for (const entry of list) {
                        const lnRaw = entry.ledgerName;
                        const ln = lnRaw.toUpperCase().trim();
                        const amt = safeNum(entry.amount);
                        const isDebit = entry.isDeemedPositive === 'Yes';

                        if (ln.includes('TDS') || ln.includes('TAX DEDUCTED')) {
                            if (!isDebit) tdsAmount += amt;
                        } else if (isDebit) {
                            if (!ln.includes('CGST') && !ln.includes('SGST') && !ln.includes('IGST') && !ln.includes('TAX')) {
                                expenses.push({ name: lnRaw, amount: amt });
                            }
                        } else if (!isDebit && amt > 0 && !party) {
                            party = lnRaw;
                        }
                    }

                    if (!party) {
                        party = firstEntry.partyName || 'Unknown Party';
                    }

                    if (party.includes("WINDAIR") || party.includes("Windair")) {
                        windairCount++;
                        if (!windairVch) windairVch = { guid, expenses, party, tdsAmount };
                    }

                    if (expenses.length > 0) {
                        expenses.sort((a, b) => b.amount - a.amount);
                        const mainExpense = expenses[0].name;
                        const totalAmount = expenses.reduce((sum, e) => sum + e.amount, 0);

                        if (totalAmount <= 0) continue;

                        const hierarchy = getHierarchy(mainExpense);
                        
                        // Check if matches template group mapping
                        let matchesAny = true;
                        if (groupMappings && groupMappings.length > 0) {
                            const fullPath = [mainExpense.toUpperCase().trim(), ...hierarchy];
                            matchesAny = groupMappings.some(m => matchesMapping(fullPath, m));
                        }

                        if (party.includes("WINDAIR") || party.includes("Windair")) {
                            console.log(`[WINDAIR DEBUG] Guid: ${guid}, Expense: ${mainExpense}, Total Amt: ${totalAmount}, Matches Template: ${matchesAny}, Path:`, [mainExpense.toUpperCase().trim(), ...hierarchy]);
                        }

                        if (!matchesAny) continue;

                        results.push({
                            guid,
                            partyName: party,
                            ledgerName: mainExpense,
                            amount: totalAmount,
                            actualTdsDeducted: tdsAmount
                        });
                    }
                }

                console.log("Total matching transactions processed:", results.length);
                const windairMatching = results.filter(r => r.partyName.includes("WINDAIR"));
                console.log("WINDAIR matching transactions count:", windairMatching.length);
                if (windairMatching.length > 0) {
                    console.log("Sample WINDAIR matching transaction:", windairMatching[0]);
                }
            });
        });
    });
}

runSimulation();
