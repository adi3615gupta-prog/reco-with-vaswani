const fs = require('fs');

console.log("=== Matches in server.js ===");
const serverContent = fs.readFileSync('server.js', 'utf8').split('\n');
serverContent.forEach((line, idx) => {
    if (line.includes('Tally_Transactions') || line.includes('INSERT INTO')) {
        console.log(`server.js:${idx+1}: ${line.trim()}`);
    }
});

console.log("=== Matches in tds_routes.js ===");
const routesContent = fs.readFileSync('tds_routes.js', 'utf8').split('\n');
routesContent.forEach((line, idx) => {
    if (line.includes('Tally_Transactions') || line.includes('INSERT INTO')) {
        console.log(`tds_routes.js:${idx+1}: ${line.trim()}`);
    }
});
