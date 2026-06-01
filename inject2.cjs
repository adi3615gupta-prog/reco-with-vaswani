const fs = require('fs');
let t = fs.readFileSync('src/lib/tallyApi.ts', 'utf8');

t = t.replace(
  'export async function fetchTallyMetadata(config: TallyConnectionConfig): Promise<{',
  "export async function fetchTallyMetadata(config: TallyConnectionConfig, customInputTaxGroups: string[] = ['ITC', 'DUTIES & TAXES', 'DUTIES AND TAXES'], customOutputTaxGroups: string[] = ['OUTPUT', 'DUTIES & TAXES', 'DUTIES AND TAXES']): Promise<{"
);

t = t.replace(
  'const meta = await fetchTallyMetadata(config);',
  'const meta = await fetchTallyMetadata(config, customInputTaxGroups, customOutputTaxGroups);'
);

fs.writeFileSync('src/lib/tallyApi.ts', t);
