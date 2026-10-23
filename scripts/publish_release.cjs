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

async function uploadAsset(uploadUrlTemplate, filePath, fileName, token, contentType) {
  const uploadUrl = uploadUrlTemplate.replace(/\{(\?name,label|.*)\}/, `?name=${encodeURIComponent(fileName)}`);
  const fileData = fs.readFileSync(filePath);
  const fileSize = fileData.length;

  console.log(`-> Uploading ${fileName} (${(fileSize / (1024 * 1024)).toFixed(2)} MB)...`);

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
    throw new Error(`Failed to upload ${fileName}: HTTP ${res.status} - ${errText}`);
  }

  const result = await res.json();
  console.log(`   [OK] Uploaded ${fileName} (id: ${result.id})`);
  return result;
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

  // Ensure both hyphenated and spaced copies exist
  if (fs.existsSync(spacedExe) && !fs.existsSync(hyphenExe)) {
    console.log(`Creating hyphenated copy: AUDIT-WITH-VASWANI-Setup-${version}.exe`);
    fs.copyFileSync(spacedExe, hyphenExe);
  }
  if (fs.existsSync(blockmap) && !fs.existsSync(hyphenBlockmap)) {
    console.log(`Creating hyphenated copy: AUDIT-WITH-VASWANI-Setup-${version}.exe.blockmap`);
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
    console.log(`Release ${tag} already exists (ID: ${releaseData.id}).`);
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
        body: `### Release ${tag}\n\n- Chrome-First Browser Architecture for GSTR-2B, GSTR-1, and IMS.\n- Client startup stability and auto-update hardening.`,
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

  const filesToUpload = [
    { path: hyphenExe, name: `AUDIT-WITH-VASWANI-Setup-${version}.exe`, type: 'application/octet-stream' },
    { path: hyphenBlockmap, name: `AUDIT-WITH-VASWANI-Setup-${version}.exe.blockmap`, type: 'application/octet-stream' },
    { path: spacedExe, name: `AUDIT WITH VASWANI Setup ${version}.exe`, type: 'application/octet-stream' },
    { path: latestYml, name: 'latest.yml', type: 'text/yaml' }
  ];

  for (const f of filesToUpload) {
    if (!fs.existsSync(f.path)) continue;

    const existing = existingAssets.find(a => a.name === f.name);
    if (existing) {
      console.log(`Overwriting existing asset: ${f.name}...`);
      await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/assets/${existing.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `token ${token}`, 'User-Agent': 'Node-Release-Uploader' }
      });
    }

    await uploadAsset(uploadUrl, f.path, f.name, token, f.type);
  }

  console.log(`\n======================================================`);
  console.log(`RELEASE ${tag} PUBLISHED SUCCESSFULLY!`);
  console.log(`URL: https://github.com/${owner}/${repo}/releases/tag/${tag}`);
  console.log(`======================================================`);
}

main().catch(err => {
  console.error('\n[FATAL ERROR]:', err.message);
  process.exit(1);
});
