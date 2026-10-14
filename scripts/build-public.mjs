import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'public');
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const file of ['index.html', 'styles.css', 'app.js', 'onboarding.css', 'onboarding.js', 'content.json', 'workbook-sources.json', 'favicon.svg']) {
  await cp(path.join(root, file), path.join(out, file));
}
await cp(path.join(root, 'assets'), path.join(out, 'assets'), { recursive: true, filter: (source) => !source.endsWith('.DS_Store') });
const html = await readFile(path.join(out, 'index.html'), 'utf8');
for (const pathName of ['app.js', 'onboarding.js', 'styles.css', 'onboarding.css']) {
  if (!html.includes(pathName)) throw new Error(`Missing asset reference: ${pathName}`);
}
console.log('Built Kaypee public assets.');
