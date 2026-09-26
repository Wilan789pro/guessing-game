import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist');
const buildId = process.env.GITHUB_SHA || Date.now().toString(36);
const config = {
  appName: process.env.PUBLIC_APP_NAME || 'Agent Prism Mission',
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  hasSupabase: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY),
};

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(path.join(root, 'public'), output, { recursive: true });
await cp(path.join(root, 'lib'), path.join(output, 'lib'), { recursive: true });

for (const [fileName, replacements] of Object.entries({
  'index.html': [
    ['href="./styles.css"', `href="./styles.css?v=${buildId}"`],
    ['src="./app.js"', `src="./app.js?v=${buildId}"`],
  ],
  'admin.html': [
    ['href="./styles.css"', `href="./styles.css?v=${buildId}"`],
    ['src="./admin.js"', `src="./admin.js?v=${buildId}"`],
  ],
  'app.js': [
    ["from './supabase-client.js'", `from './supabase-client.js?v=${buildId}'`],
    ["from './lib/missionLogic.js'", `from './lib/missionLogic.js?v=${buildId}'`],
  ],
  'admin.js': [
    ["from './supabase-client.js'", `from './supabase-client.js?v=${buildId}'`],
  ],
})) {
  const filePath = path.join(output, fileName);
  let content = await readFile(filePath, 'utf8');
  for (const [oldValue, newValue] of replacements) content = content.replace(oldValue, newValue);
  await writeFile(filePath, content);
}

await writeFile(path.join(output, 'config.json'), `${JSON.stringify(config, null, 2)}\n`);
await writeFile(path.join(output, '.nojekyll'), '');

console.log(`GitHub Pages artifact created at ${output}`);
