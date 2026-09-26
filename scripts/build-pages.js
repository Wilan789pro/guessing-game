import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist');
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
await writeFile(path.join(output, 'config.json'), `${JSON.stringify(config, null, 2)}\n`);
await writeFile(path.join(output, '.nojekyll'), '');

console.log(`GitHub Pages artifact created at ${output}`);
