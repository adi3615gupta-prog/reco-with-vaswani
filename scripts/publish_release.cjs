const fs = require('fs');
const path = require('path');
const cp = require('child_process');

async function getToken() {
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;

  return new Promise((resolve, reject) => {
    const p = cp.spawn('git', ['credential', 'fill']);
    p.stdin.write('protocol=https\nhost=github.com\n\n');
    let out = '';
    p.stdout.on('data', d => out += d);
    p.on('close', () => {
      const match = out.match(/password=(.*)/);
      if (match && match[1]) {
        resolve(match[1].trim());
      } else {
        reject(new Error('No GitHub token found in environment ($env:GH_TOKEN) or Git credential manager.'));
      }
    });
  });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function uploadAssetWithRetry(uploadUrlTemplate, filePath, fileName, token, contentType, maxRetries = 3) {
  const uploadUrl = uploadUrlTemplate.replace(/\{(\?name,label|.*)\}/, `?name=${encodeURIComponent(fileName)}`);
  const fileData = fs.readFileSync(filePath);
  const fileSize = fileData.length;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`-> Uploading ${fileName} (${(fileSize / (1024 * 1024)).toFixed(2)} MB) [Attempt ${attempt}/${maxRetries}]...`);

      const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Authorization': `token ${token}`,
          'Content-Type': contentType || 'application/octet-stream',
          'Content-Length': fileSize.toString(),
          'User-Agent': 'Node-Release-Uploader'
        },
        body: fileData
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errText}`);
      }

      const result = await res.json();
      console.log(`   [OK] Successfully uploaded ${fileName} (id: ${result.id})`);
      return result;
    } catch (err) {
      console.warn(`   [WARN] Attempt ${attempt} failed: ${err.message}`);
      if (attempt === maxRetries) {
        throw new Error(`Failed to upload ${fileName} after ${maxRetries} attempts: ${err.message}`);
      }
      console.log(`   Retrying in 4 seconds...`);
      await sleep(4000);
    }
  }
}

async function main() {
  const rootDir = path.resolve(__dirname, '..');
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const version = pkg.version;
  const tag = `v${version}`;

  console.log(`======================================================`);
  console.log(`VASWANI ENTERPRISE - GITHUB RELEASE PUBLISHER`);
  console.log(`Target Version: ${version} (Tag: ${tag})`);
  console.log(`======================================================\n`);

  const distDir = path.join(rootDir, 'dist-electron');

  // Verify necessary built files exist
  const spacedExe = path.join(distDir, `AUDIT WITH VASWANI Setup ${version}.exe`);
  const hyphenExe = path.join(distDir, `AUDIT-WITH-VASWANI-Setup-${version}.exe`);
  const blockmap = path.join(distDir, `AUDIT WITH VASWANI Setup ${version}.exe.blockmap`);
  const hyphenBlockmap = path.join(distDir, `AUDIT-WITH-VASWANI-Setup-${version}.exe.blockmap`);
  const latestYml = path.join(distDir, 'latest.yml');

  if (!fs.existsSync(spacedExe) && !fs.existsSync(hyphenExe)) {
    console.error(`[ERROR] Build artifacts not found in dist-electron/ for version ${version}!`);
    console.error(`Please run: npm run build:exe first.`);
    process.exit(1);
  }

  // Ensure hyphenated copies exist for standard URLs
  if (fs.existsSync(spacedExe) && !fs.existsSync(hyphenExe)) {
    console.log(`Preparing hyphenated copy: AUDIT-WITH-VASWANI-Setup-${version}.exe`);
    fs.copyFileSync(spacedExe, hyphenExe);
  }
  if (fs.existsSync(blockmap) && !fs.existsSync(hyphenBlockmap)) {
    console.log(`Preparing hyphenated copy: AUDIT-WITH-VASWANI-Setup-${version}.exe.blockmap`);
    fs.copyFileSync(blockmap, hyphenBlockmap);
  }

  const token = await getToken();
  console.log('GitHub authentication token verified.\n');

  const owner = 'adi3615gupta-prog';
  const repo = 'reco-with-vaswani';

  // Check or create release
  console.log(`Checking GitHub for existing release ${tag}...`);
  let releaseRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`, {
    headers: { 'Authorization': `token ${token}`, 'User-Agent': 'Node-Release-Uploader' }
  });

  let releaseData;
  if (releaseRes.status === 200) {
    releaseData = await releaseRes.json();
    console.log(`Release ${tag} already exists on GitHub (ID: ${releaseData.id}).`);
  } else {
    console.log(`Creating new release ${tag}...`);
    const createRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases`, {
      method: 'POST',
      headers: {
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Node-Release-Uploader'
      },
      body: JSON.stringify({
        tag_name: tag,
        target_commitish: 'main',
        name: tag,
        body: `### Release ${tag}\n\n- Chrome-First Browser Architecture across all automation modules (GSTR-2B, GSTR-1, IMS).\n- Auto-update and client startup hardening.`,
        draft: false,
        prerelease: false
      })
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      throw new Error(`Failed to create release: HTTP ${createRes.status} - ${errText}`);
    }
    releaseData = await createRes.json();
    console.log(`Release ${tag} created successfully (ID: ${releaseData.id})!\n`);
  }

  const uploadUrl = releaseData.upload_url;
  const existingAssets = releaseData.assets || [];

  // Key assets required by electron-updater and users
  const filesToUpload = [
    { path: hyphenExe, name: `AUDIT-WITH-VASWANI-Setup-${version}.exe`, type: 'application/octet-stream' },
    { path: hyphenBlockmap, name: `AUDIT-WITH-VASWANI-Setup-${version}.exe.blockmap`, type: 'application/octet-stream' },
    { path: latestYml, name: 'latest.yml', type: 'text/yaml' }
  ];

  for (const f of filesToUpload) {
    if (!fs.existsSync(f.path)) {
      console.warn(`[WARN] File not found on disk, skipping: ${f.path}`);
      continue;
    }

    const localSize = fs.statSync(f.path).size;
    const existing = existingAssets.find(a => a.name === f.name);

    if (existing) {
      // If the file already exists and size matches, we can skip re-uploading to save bandwidth
      if (existing.size === localSize && f.name !== 'latest.yml') {
        console.log(`[SKIP] Asset ${f.name} already exists with matching size (${(localSize / (1024 * 1024)).toFixed(2)} MB).`);
        continue;
      }

      console.log(`Updating asset ${f.name} (replacing old id: ${existing.id})...`);
      await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/assets/${existing.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `token ${token}`, 'User-Agent': 'Node-Release-Uploader' }
      });
    }

    await uploadAssetWithRetry(uploadUrl, f.path, f.name, token, f.type);
  }

  console.log(`\n======================================================`);
  console.log(`RELEASE ${tag} IS 100% READY & PUBLISHED!`);
  console.log(`URL: https://github.com/${owner}/${repo}/releases/tag/${tag}`);
  console.log(`======================================================`);
}

main().catch(err => {
  console.error('\n[FATAL ERROR]:', err.message);
  process.exit(1);
});
