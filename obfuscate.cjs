const fs = require('fs');
const { execSync } = require('child_process');
const JavaScriptObfuscator = require('javascript-obfuscator');

console.log('Bundling server.js to CommonJS...');
execSync('npx esbuild server.js --bundle --platform=node --target=node18 --format=cjs --legal-comments=inline --outfile=server.cjs --external:express --external:cors --external:sqlite3 --external:bcryptjs --external:jsonwebtoken --external:helmet --external:firebase/app --external:firebase/firestore --external:localtunnel --external:playwright --external:node-fetch --external:nodemailer --external:exceljs');

let source = fs.readFileSync('server.cjs', 'utf8');

// Replace all esbuild fileURLToPath / hoisted __filename / __dirname with native CommonJS globals
source = source.replace(/var __filename\d*\s*=\s*[^;\n]+;/g, (match) => {
    const varName = match.split(' ')[1];
    return `var ${varName} = typeof __filename !== 'undefined' ? __filename : '';`;
});
source = source.replace(/var __dirname\d*\s*=\s*[^;\n]+;/g, (match) => {
    const varName = match.split(' ')[1];
    return `var ${varName} = typeof __dirname !== 'undefined' ? __dirname : '';`;
});

fs.writeFileSync('server.cjs', source);

const obfuscated = JavaScriptObfuscator.obfuscate(source, {
    compact: true,
    controlFlowFlattening: false,
    controlFlowFlatteningThreshold: 0.1,
    deadCodeInjection: false,
    deadCodeInjectionThreshold: 0.1,
    debugProtection: false,
    debugProtectionInterval: 4000,
    disableConsoleOutput: false,
    identifierNamesGenerator: 'hexadecimal',
    log: false,
    numbersToExpressions: false,
    renameGlobals: false,
    selfDefending: false,
    simplify: true,
    splitStrings: true,
    splitStringsChunkLength: 5,
    stringArray: true,
    stringArrayCallsTransform: true,
    stringArrayEncoding: ['base64'],
    stringArrayIndexShift: true,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayWrappersCount: 2,
    stringArrayWrappersChainedCalls: true,
    stringArrayWrappersParametersMaxCount: 5,
    stringArrayWrappersType: 'function',
    stringArrayThreshold: 0.75,
    transformObjectKeys: true,
    unicodeEscapeSequence: false
}).getObfuscatedCode();

fs.writeFileSync('server.obfuscated.cjs', obfuscated);
console.log('Obfuscation complete: server.obfuscated.cjs');
