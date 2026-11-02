const fs = require('fs');
const { execSync } = require('child_process');
const JavaScriptObfuscator = require('javascript-obfuscator');

console.log('Bundling server.js to CommonJS...');
execSync('npx esbuild server.js --bundle --platform=node --target=node18 --format=cjs --legal-comments=inline --outfile=server.cjs --external:express --external:cors --external:sqlite3 --external:bcryptjs --external:jsonwebtoken --external:helmet --external:firebase/app --external:firebase/firestore --external:localtunnel --external:playwright --external:node-fetch --external:nodemailer --external:exceljs --external:pdf-parse');

let source = fs.readFileSync('server.cjs', 'utf8');

// Prepend DOM Matrix and Canvas polyfills for headless Node runtime environments
const polyfills = `
if (typeof globalThis.DOMMatrix === 'undefined') {
  globalThis.DOMMatrix = class DOMMatrix {
    constructor() {
      this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
      this.m11 = 1; this.m12 = 0; this.m13 = 0; this.m14 = 0;
      this.m21 = 0; this.m22 = 1; this.m23 = 0; this.m24 = 0;
      this.m31 = 0; this.m32 = 0; this.m33 = 1; this.m34 = 0;
      this.m41 = 0; this.m42 = 0; this.m43 = 0; this.m44 = 1;
      this.is2D = true;
    }
    translate() { return this; }
    scale() { return this; }
    preMultiplySelf() { return this; }
    invertSelf() { return this; }
    multiplySelf() { return this; }
  };
}
if (typeof globalThis.ImageData === 'undefined') {
  globalThis.ImageData = class ImageData {
    constructor(w = 0, h = 0) { this.width = w; this.height = h; this.data = new Uint8ClampedArray(w * h * 4); }
  };
}
if (typeof globalThis.Path2D === 'undefined') {
  globalThis.Path2D = class Path2D {
    addPath() {}
  };
}
`;
source = polyfills + source;

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
