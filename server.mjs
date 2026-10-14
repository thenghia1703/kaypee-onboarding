import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicKey, randomBytes, verify } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { MAX_STATE_BYTES, serializeUserState } from './user-state.mjs';
import { createAsk } from './ask-core.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const content = JSON.parse(await readFile(path.join(root, 'content.json'), 'utf8'));
const workbook = JSON.parse(await readFile(path.join(root, 'workbook-sources.json'), 'utf8'));
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/onboarding.css', ['onboarding.css', 'text/css; charset=utf-8']],
  ['/onboarding.js', ['onboarding.js', 'text/javascript; charset=utf-8']],
  ['/content.json', ['content.json', 'application/json; charset=utf-8']],
  ['/workbook-sources.json', ['workbook-sources.json', 'application/json; charset=utf-8']],
  ['/assets/kaypee-expressions.png', ['assets/kaypee-expressions.png', 'image/png']],
  ['/assets/keypee-mark.svg', ['assets/keypee-mark.svg', 'image/svg+xml']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']]
]);
for (const image of workbook.images) files.set(image.path, [image.path.slice(1), 'image/png']);
const { retrieve, answer: answerCore } = createAsk(content, process.env);
export { retrieve };
const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim() || '';
const sessions = new Map();
const databasePath = process.env.KEYPEE_DB_PATH || path.join(root, '.data', 'kaypee.sqlite');
if (databasePath !== ':memory:') mkdirSync(path.dirname(databasePath), { recursive: true });
const stateDb = new DatabaseSync(databasePath);
stateDb.exec(`CREATE TABLE IF NOT EXISTS kaypee_user_state (
  user_sub TEXT PRIMARY KEY,
  state_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
)`);
let googleKeys = { expires: 0, keys: [] };

async function verifyGoogleCredential(token) {
  const [headerPart, payloadPart, signaturePart, extra] = String(token).split('.');
  if (!headerPart || !payloadPart || !signaturePart || extra) throw new Error('Malformed Google credential.');
  let header;
  let claims;
  try {
    header = JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf8'));
    claims = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
  } catch { throw new Error('Malformed Google credential.'); }
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error('Unsupported Google credential.');
  const now = Math.floor(Date.now() / 1000);
  if (claims.aud !== googleClientId || !['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss)
    || typeof claims.exp !== 'number' || claims.exp <= now || typeof claims.iat !== 'number' || claims.iat > now + 60
    || claims.email_verified !== true || typeof claims.email !== 'string' || !claims.email.includes('@')
    || typeof claims.sub !== 'string' || !claims.sub) {
    throw new Error('Google credential could not be verified.');
  }
  if (googleKeys.expires < Date.now()) {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/certs', { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('Google verification is temporarily unavailable.');
    const body = await response.json();
    googleKeys = { expires: Date.now() + 30 * 60 * 1000, keys: Array.isArray(body.keys) ? body.keys : [] };
  }
  const jwk = googleKeys.keys.find((key) => key.kid === header.kid && key.kty === 'RSA' && key.use === 'sig');
  if (!jwk || !verify('RSA-SHA256', Buffer.from(`${headerPart}.${payloadPart}`), createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(signaturePart, 'base64url'))) {
    throw new Error('Google credential could not be verified.');
  }
  return { sub: claims.sub, name: String(claims.name || claims.email.split('@')[0]).slice(0, 100), email: claims.email.slice(0, 200) };
}

function sessionForRequest(req) {
  const sid = req.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith('kaypee_session='))?.slice(15);
  const session = sid && sessions.get(sid);
  if (!session || session.expires < Date.now()) { if (sid) sessions.delete(sid); return null; }
  return session;
}

function json(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(value));
}

async function readBody(req, maxLength = 20000) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > maxLength) throw new Error('REQUEST_TOO_LARGE');
  }
  return JSON.parse(body);
}

async function answer(req, res) {
  let input;
  try { input = await readBody(req); }
  catch (error) { return json(res, error.message === 'REQUEST_TOO_LARGE' ? 413 : 400, { error: 'Invalid request body.' }); }
  const result = await answerCore(input);
  return json(res, result.status, result.body);
}

export const server = http.createServer(async (req, res) => {
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('content-security-policy', "default-src 'self'; img-src 'self' data: https://*.googleusercontent.com https://accounts.google.com; connect-src 'self' https://accounts.google.com; script-src 'self' https://accounts.google.com; frame-src https://accounts.google.com; style-src 'self' https://accounts.google.com; base-uri 'none'; form-action 'self'");
  let pathname;
  try { pathname = new URL(req.url, 'http://localhost').pathname; }
  catch { return json(res, 400, { error: 'Invalid URL.' }); }
  if (pathname === '/api/health' && req.method === 'GET') {
    return json(res, 200, { ready: true, aiConfigured: Boolean(process.env.DEEPSEEK_API_KEY?.trim()) });
  }
  if (pathname === '/api/auth/config' && req.method === 'GET') return json(res, 200, { googleClientId });
  if (pathname === '/api/auth/session' && req.method === 'GET') {
    const profile = sessionForRequest(req)?.profile || null;
    return json(res, 200, { authenticated: Boolean(profile), profile });
  }
  if (pathname === '/api/auth/google' && req.method === 'POST') {
    if (!googleClientId) return json(res, 503, { error: 'Google sign-in is not configured yet.' });
    const origin = req.headers.origin;
    const host = req.headers.host;
    try { if (origin && new URL(origin).host !== host) return json(res, 403, { error: 'Invalid sign-in origin.' }); }
    catch { return json(res, 403, { error: 'Invalid sign-in origin.' }); }
    let body;
    try { body = await readBody(req); } catch { return json(res, 400, { error: 'Invalid sign-in request.' }); }
    if (typeof body.credential !== 'string' || body.credential.length > 12000) return json(res, 400, { error: 'Missing Google credential.' });
    try {
      const profile = await verifyGoogleCredential(body.credential);
      const sid = randomBytes(32).toString('base64url');
      sessions.set(sid, { userSub: profile.sub, profile: { name: profile.name, email: profile.email }, expires: Date.now() + 24 * 60 * 60 * 1000 });
      res.setHeader('set-cookie', `kaypee_session=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`);
      return json(res, 200, { profile: { name: profile.name, email: profile.email } });
    } catch (error) {
      console.error('Google sign-in failed:', error.message);
      return json(res, 401, { error: error.message === 'Google verification is temporarily unavailable.' ? error.message : 'Google sign-in could not be verified.' });
    }
  }
  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) return json(res, 403, { error: 'Invalid sign-out origin.' });
    const sid = req.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith('kaypee_session='))?.slice(15);
    if (sid) sessions.delete(sid);
    res.setHeader('set-cookie', 'kaypee_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
    return json(res, 200, { signedOut: true });
  }
  if (pathname === '/api/user-state' && (req.method === 'GET' || req.method === 'PUT')) {
    const session = sessionForRequest(req);
    if (!session) return json(res, 401, { error: 'Sign in with Google to sync your activity.' });
    if (req.method === 'GET') {
      const row = stateDb.prepare('SELECT state_json, revision FROM kaypee_user_state WHERE user_sub = ?').get(session.userSub);
      return json(res, 200, { state: row ? JSON.parse(row.state_json) : null, revision: row?.revision || 0 });
    }
    if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) return json(res, 403, { error: 'Invalid save origin.' });
    let body;
    let stateJson;
    try {
      body = await readBody(req, MAX_STATE_BYTES + 1000);
      stateJson = serializeUserState(body.state);
      if (!Number.isInteger(body.revision) || body.revision < 0) throw new Error('Invalid revision.');
    } catch (error) {
      return json(res, error.message === 'REQUEST_TOO_LARGE' || error.message === 'User state is too large.' ? 413 : 400, { error: error.message === 'User state is too large.' ? error.message : 'Invalid user state.' });
    }
    const now = Date.now();
    const result = body.revision === 0
      ? stateDb.prepare('INSERT INTO kaypee_user_state (user_sub, state_json, revision, updated_at) VALUES (?, ?, 1, ?) ON CONFLICT(user_sub) DO NOTHING').run(session.userSub, stateJson, now)
      : stateDb.prepare('UPDATE kaypee_user_state SET state_json = ?, revision = revision + 1, updated_at = ? WHERE user_sub = ? AND revision = ?').run(stateJson, now, session.userSub, body.revision);
    if (result.changes !== 1) return json(res, 409, { error: 'Activity changed in another tab. Reload before saving again.', code: 'STATE_CONFLICT' });
    return json(res, 200, { revision: body.revision + 1 });
  }
  if (pathname === '/api/ask' && req.method === 'POST') return answer(req, res);
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Method not allowed.' });
  const file = files.get(pathname);
  if (!file) return json(res, 404, { error: 'Not found.' });
  try {
    const bytes = await readFile(path.join(root, file[0]));
    res.writeHead(200, { 'content-type': file[1], 'cache-control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch {
    json(res, 500, { error: 'Could not load the page.' });
  }
});

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number.parseInt(process.env.PORT || '4173', 10);
  server.on('error', (error) => {
    console.error(`Keypee could not start: ${error.message}`);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`Keypee is running at http://127.0.0.1:${port}`);
  });
}
