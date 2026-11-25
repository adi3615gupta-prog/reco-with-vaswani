const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Computes the hex SHA-256 digest of a file on disk.
 * @param {string} filePath
 * @returns {string}
 */
function computeFileSha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

/**
 * Verifies an RSA-SHA256 signed integrity manifest and checks each listed file's SHA-256 digest.
 * @param {{ baseDir: string, manifestPath?: string, publicKeyPem: string }} opts
 * @returns {{ ok: boolean, reason?: string, verifiedFiles?: string[] }}
 */
function verifyIntegrityManifest({ baseDir, manifestPath, publicKeyPem }) {
  const resolvedManifest = manifestPath || path.join(baseDir, 'integrity.manifest.json');
  if (!publicKeyPem || !String(publicKeyPem).includes('BEGIN PUBLIC KEY')) {
    return { ok: false, reason: 'Missing or invalid integrity public key' };
  }
  if (!fs.existsSync(resolvedManifest)) {
    return { ok: false, reason: 'Missing integrity.manifest.json' };
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(resolvedManifest, 'utf8'));
  } catch (err) {
    return { ok: false, reason: `Malformed integrity.manifest.json: ${err.message}` };
  }

  if (!manifest || typeof manifest.payload !== 'string' || typeof manifest.signature !== 'string') {
    return { ok: false, reason: 'Integrity manifest is missing payload or signature' };
  }

  let signatureValid = false;
  try {
    signatureValid = crypto.verify(
      'sha256',
      Buffer.from(manifest.payload, 'utf8'),
      publicKeyPem,
      Buffer.from(manifest.signature, 'base64')
    );
  } catch (err) {
    return { ok: false, reason: `Signature verification error: ${err.message}` };
  }

  if (!signatureValid) {
    return { ok: false, reason: 'RSA-SHA256 manifest signature mismatch' };
  }

  let parsed;
  try {
    parsed = JSON.parse(manifest.payload);
  } catch (err) {
    return { ok: false, reason: `Corrupt manifest payload: ${err.message}` };
  }

  const files = parsed && parsed.files;
  if (!files || typeof files !== 'object' || Object.keys(files).length === 0) {
    return { ok: false, reason: 'Manifest contains no file digests' };
  }

  const verifiedFiles = [];
  for (const [relPath, expectedHex] of Object.entries(files)) {
    const absPath = path.resolve(baseDir, relPath);
    if (!absPath.startsWith(path.resolve(baseDir))) {
      return { ok: false, reason: `Unsafe manifest file path: ${relPath}` };
    }
    if (!fs.existsSync(absPath)) {
      return { ok: false, reason: `Missing protected file: ${relPath}` };
    }
    const actualHex = computeFileSha256(absPath);
    if (actualHex !== expectedHex) {
      return { ok: false, reason: `File tampered or modified: ${relPath}` };
    }
    verifiedFiles.push(relPath);
  }

  return { ok: true, verifiedFiles };
}

module.exports = {
  computeFileSha256,
  verifyIntegrityManifest
};

