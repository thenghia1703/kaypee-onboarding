import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => readFile(path.join(root, name), 'utf8');
const imageData = async (name) => `data:image/png;base64,${(await readFile(path.join(root, name))).toString('base64')}`;
const inlineScript = (source) => `<script>\n${source.replaceAll('</script', '<\\/script')}\n</script>`;

const [html, style, onboardingStyle, app, onboarding, content, workbook, favicon] = await Promise.all([
  read('index.html'), read('styles.css'), read('onboarding.css'), read('app.js'), read('onboarding.js'),
  read('content.json').then(JSON.parse), read('workbook-sources.json').then(JSON.parse), read('favicon.svg')
]);

const images = new Map();
for (const imagePath of new Set([
  'assets/kaypee-expressions.png',
  ...content.docs.map((doc) => doc.imagePath).filter(Boolean).map((value) => value.replace(/^\//, '')),
  ...workbook.images.map((image) => image.path.replace(/^\//, ''))
])) images.set(`/${imagePath}`, await imageData(imagePath));

for (const doc of content.docs) if (doc.imagePath) doc.imagePath = images.get(doc.imagePath);
for (const image of workbook.images) image.path = images.get(image.path);

const embeddedData = JSON.stringify({ content, workbook }).replaceAll('<', '\\u003c');
const standaloneApp = app
  .replace("fetch('/content.json').then((response) => response.json())", 'Promise.resolve(window.__KAYPEE_EXPORT_DATA__.content)')
  .replace("fetch('/workbook-sources.json').then((response) => response.json())", 'Promise.resolve(window.__KAYPEE_EXPORT_DATA__.workbook)')
  .replace("'Add DEEPSEEK_API_KEY to .env and restart Kaypee.'", "'AI chat needs the Kaypee server. Open this app through its running localhost URL.'");
const standaloneOnboarding = onboarding
  .replace('<h1>Sign in with Google</h1>', '<h1>${location.protocol === \'file:\' ? \'Preview Kaypee\' : \'Sign in with Google\'}</h1>')
  .replace('<p>Use your Google account to set up your Kaypee profile.</p>', '<p>${location.protocol === \'file:\' ? \'This file is an offline demo. Open Kaypee through localhost to use Google sign-in.\' : \'Use your Google account to set up your Kaypee profile.\'}</p>')
  .replace('googleClientId ? \'<div id="google-button"', 'googleClientId && location.protocol !== \'file:\' ? \'<div id="google-button"')
  .replace("googleClientId ? 'Choose your Google account to continue.' : 'Google sign-in needs a Google OAuth client ID. You can preview the setup below.'", "location.protocol === 'file:' ? 'Google sign-in cannot run from a file:// page.' : googleClientId ? 'Choose your Google account to continue.' : 'Google sign-in needs a Google OAuth client ID. You can preview the setup below.'")
  .replace('googleClientId ? \'<div class="ob-divider"', 'googleClientId && location.protocol !== \'file:\' ? \'<div class="ob-divider"');
if (standaloneApp === app || standaloneApp.includes("fetch('/content.json')") || standaloneApp.includes("fetch('/workbook-sources.json')")) {
  throw new Error('Could not embed app content; review the fetch calls before exporting.');
}

let output = html
  .replace('<link rel="icon" href="/favicon.svg" type="image/svg+xml">', `<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(favicon)}" type="image/svg+xml">`)
  .replace('<link rel="stylesheet" href="/styles.css">', `<style>\n${style.replace("url('/assets/kaypee-expressions.png')", `url('${images.get('/assets/kaypee-expressions.png')}')`)}\n</style>`)
  .replace('<link rel="stylesheet" href="/onboarding.css">', `<style>\n${onboardingStyle}\n</style>`)
  .replace('<script src="/app.js" defer></script>', '')
  .replace('<script src="/onboarding.js" defer></script>', '')
  .replace('</body>', () => `${inlineScript(`window.__KAYPEE_EXPORT_DATA__ = ${embeddedData};`)}\n${inlineScript(standaloneApp)}\n${inlineScript(standaloneOnboarding)}\n</body>`);

if (output.includes('src="/app.js"') || output.includes('href="/styles.css"') || output.includes('src="/onboarding.js"')) {
  throw new Error('The HTML still references external app files.');
}
if (output.indexOf('<script>') < output.lastIndexOf('</dialog>')) {
  throw new Error('Inline scripts must run after the page elements have been created.');
}

const exportDir = path.join(root, 'exports');
await mkdir(exportDir, { recursive: true });
const destination = path.join(exportDir, 'Kaypee-demo.html');
await writeFile(destination, output);
console.log(`${destination} (${(Buffer.byteLength(output) / 1024 / 1024).toFixed(1)} MB)`);
