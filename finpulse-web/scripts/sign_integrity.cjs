const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { computeFileSha256 } = require('../integrityGuard.cjs');

const ROOT = path.resolve(__dirname, '..');
const PRIVATE_KEY_PATH = path.join(ROOT, '.integrity_private.pem');
const PUBLIC_KEY_MODULE_PATH = path.join(ROOT, 'integrityPublicKey.cjs');
const MANIFEST_PATH = path.join(ROOT, 'integrity.manifest.json');

const PROTECTED_FILES = [
  'server.obfuscated.cjs',
  'preload.js',
  'dist/index.html'
];

function loadOrCreateSigningKeys() {
  if (process.env.INTEGRITY_PRIVATE_KEY) {
    const priv = process.env.INTEGRITY_PRIVATE_KEY.replace(/\\n/g, '\n');
    const pub = crypto.createPublicKey(priv).export({ type: 'spki', format: 'pem' });
    return { privateKeyPem: priv, publicKeyPem: pub };
  }

  if (fs.existsSync(PRIVATE_KEY_PATH)) {
    const priv = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
    const pub = crypto.createPublicKey(priv).export({ type: 'spki', format: 'pem' });
    return { privateKeyPem: priv, publicKeyPem: pub };
  }

  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  fs.writeFileSync(PRIVATE_KEY_PATH, privateKey, { mode: 0o600 });
  console.log('[Integrity] Generated new 2048-bit RSA signing key at .integrity_private.pem (gitignored).');
  return { privateKeyPem: privateKey, publicKeyPem: publicKey };
}

function main() {
  const files = {};
  for (const relPath of PROTECTED_FILES) {
    const fullPath = path.join(ROOT, relPath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Cannot sign integrity manifest: missing required build artifact "${relPath}"`);
    }
    files[relPath] = computeFileSha256(fullPath);
  }

  const { privateKeyPem, publicKeyPem } = loadOrCreateSigningKeys();

  const payload = JSON.stringify({
    algorithm: 'sha256',
    generatedAt: new Date().toISOString(),
    files
  });

  const signature = crypto
    .sign('sha256', Buffer.from(payload, 'utf8'), privateKeyPem)
    .toString('base64');

  fs.writeFileSync(
    PUBLIC_KEY_MODULE_PATH,
    `module.exports = ${JSON.stringify(publicKeyPem)};\n`,
    'utf8'
  );

  fs.writeFileSync(
    MANIFEST_PATH,
    JSON.stringify({ payload, signature }, null, 2),
    'utf8'
  );

  console.log(`[Integrity] Signed ${Object.keys(files).length} files -> integrity.manifest.json`);
}

main();

