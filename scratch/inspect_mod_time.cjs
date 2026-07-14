const fs = require('fs');
if (fs.existsSync('scratch_reconcile_payload.json')) {
    const stats = fs.statSync('scratch_reconcile_payload.json');
    console.log("Last modified:", stats.mtime);
    console.log("Current time:", new Date());
} else {
    console.log("scratch_reconcile_payload.json does not exist.");
}
