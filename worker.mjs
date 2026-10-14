import content from './content.json' with { type: 'json' };
import { createAsk } from './ask-core.mjs';
import { MAX_STATE_BYTES, serializeUserState } from './user-state.mjs';

const enc = new TextEncoder();
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }
});
const cookieValue = (request, name) => request.headers.get('cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
const b64url = (value) => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0));
const hex = (bytes) => [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
const hash = async (value) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(value))));
const sameOrigin = (request) => !request.headers.get('origin') || request.headers.get('origin') === new URL(request.url).origin;
const securityHeaders = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'content-security-policy': "default-src 'self'; img-src 'self' data: https://*.googleusercontent.com https://accounts.google.com; connect-src 'self' https://accounts.google.com; script-src 'self' https://accounts.google.com; frame-src https://accounts.google.com; style-src 'self' https://accounts.google.com; base-uri 'none'; form-action 'self'"
};

let googleKeys = { expires: 0, keys: [] };
async function verifyGoogleCredential(token, clientId, fetcher = fetch) {
  const parts = String(token).split('.');
  if (parts.length !== 3) throw new Error('Invalid Google credential.');
  let header, claims;
  try {
    header = JSON.parse(new TextDecoder().decode(b64url(parts[0])));
    claims = JSON.parse(new TextDecoder().decode(b64url(parts[1])));
  } catch { throw new Error('Invalid Google credential.'); }
  const now = Math.floor(Date.now() / 1000);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !clientId || claims.aud !== clientId
    || !['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss)
    || typeof claims.exp !== 'number' || claims.exp <= now || typeof claims.iat !== 'number' || claims.iat > now + 60
    || claims.email_verified !== true || typeof claims.email !== 'string' || !claims.email.includes('@')
    || typeof claims.sub !== 'string' || !claims.sub) throw new Error('Invalid Google credential.');
  if (googleKeys.expires < Date.now()) {
    const response = await fetcher('https://www.googleapis.com/oauth2/v3/certs', { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('Google verification is temporarily unavailable.');
    const body = await response.json();
    googleKeys = { expires: Date.now() + 30 * 60 * 1000, keys: Array.isArray(body.keys) ? body.keys : [] };
  }
  const jwk = googleKeys.keys.find((key) => key.kid === header.kid && key.kty === 'RSA' && key.use === 'sig');
  if (!jwk) throw new Error('Invalid Google credential.');
  const publicKey = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, b64url(parts[2]), enc.encode(`${parts[0]}.${parts[1]}`));
  if (!valid) throw new Error('Invalid Google credential.');
  return { sub: claims.sub, name: String(claims.name || claims.email.split('@')[0]).slice(0, 100), email: claims.email.slice(0, 200) };
}

async function sessionFor(request, env) {
  const sid = cookieValue(request, 'kaypee_session');
  if (!sid || !/^[a-f0-9]{64}$/.test(sid)) return null;
  return env.DB.prepare('SELECT user_sub, name, email FROM kaypee_sessions WHERE token_hash = ? AND expires_at > ?')
    .bind(await hash(sid), Date.now()).first();
}

async function readJson(request, maxBytes = 20_000) {
  const body = await request.text();
  if (enc.encode(body).byteLength > maxBytes) throw new Error('REQUEST_TOO_LARGE');
  return JSON.parse(body);
}

export async function handleRequest(request, env) {
  const path = new URL(request.url).pathname;
  if (path.startsWith('/api/')) {
    if (path === '/api/health' && request.method === 'GET') return json({ ready: true, aiConfigured: Boolean(env.DEEPSEEK_API_KEY?.trim()), authRequiredForAI: true });
    if (path === '/api/auth/config' && request.method === 'GET') return json({ googleClientId: env.GOOGLE_CLIENT_ID || '' });
    if (path === '/api/auth/session' && request.method === 'GET') {
      const session = await sessionFor(request, env);
      return json({ authenticated: Boolean(session), profile: session ? { name: session.name, email: session.email } : null });
    }
    if (path === '/api/auth/google' && request.method === 'POST') {
      if (!sameOrigin(request)) return json({ error: 'Invalid sign-in origin.' }, 403);
      if (!env.GOOGLE_CLIENT_ID) return json({ error: 'Google sign-in is not configured yet.' }, 503);
      let body;
      try { body = await readJson(request); } catch { return json({ error: 'Invalid sign-in request.' }, 400); }
      if (typeof body.credential !== 'string' || body.credential.length > 12000) return json({ error: 'Missing Google credential.' }, 400);
      try {
        const profile = await verifyGoogleCredential(body.credential, env.GOOGLE_CLIENT_ID);
        const sid = hex(crypto.getRandomValues(new Uint8Array(32)));
        await env.DB.prepare('INSERT INTO kaypee_sessions (token_hash, user_sub, name, email, expires_at) VALUES (?, ?, ?, ?, ?)')
          .bind(await hash(sid), profile.sub, profile.name, profile.email, Date.now() + 86400000).run();
        return json({ profile: { name: profile.name, email: profile.email } }, 200, { 'set-cookie': `kaypee_session=${sid}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400` });
      } catch (error) {
        console.error('Google sign-in failed:', error.message);
        return json({ error: error.message === 'Google verification is temporarily unavailable.' ? error.message : 'Google sign-in could not be verified.' }, 401);
      }
    }
    if (path === '/api/auth/logout' && request.method === 'POST') {
      if (!sameOrigin(request)) return json({ error: 'Invalid sign-out origin.' }, 403);
      const sid = cookieValue(request, 'kaypee_session');
      if (sid && /^[a-f0-9]{64}$/.test(sid)) await env.DB.prepare('DELETE FROM kaypee_sessions WHERE token_hash = ?').bind(await hash(sid)).run();
      return json({ signedOut: true }, 200, { 'set-cookie': 'kaypee_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0' });
    }
    if (path === '/api/user-state' && ['GET', 'PUT'].includes(request.method)) {
      const session = await sessionFor(request, env);
      if (!session) return json({ error: 'Sign in with Google to sync your activity.' }, 401);
      if (request.method === 'GET') {
        const row = await env.DB.prepare('SELECT state_json, revision FROM kaypee_user_state WHERE user_sub = ?').bind(session.user_sub).first();
        return json({ state: row ? JSON.parse(row.state_json) : null, revision: row?.revision || 0 });
      }
      if (!sameOrigin(request)) return json({ error: 'Invalid save origin.' }, 403);
      let body, stateJson;
      try {
        body = await readJson(request, MAX_STATE_BYTES + 1000);
        stateJson = serializeUserState(body.state);
        if (!Number.isInteger(body.revision) || body.revision < 0) throw new Error('Invalid revision.');
      } catch (error) {
        return json({ error: error.message === 'User state is too large.' ? error.message : 'Invalid user state.' }, ['REQUEST_TOO_LARGE', 'User state is too large.'].includes(error.message) ? 413 : 400);
      }
      const now = Date.now();
      const result = body.revision === 0
        ? await env.DB.prepare('INSERT INTO kaypee_user_state (user_sub, state_json, revision, updated_at) VALUES (?, ?, 1, ?) ON CONFLICT(user_sub) DO NOTHING').bind(session.user_sub, stateJson, now).run()
        : await env.DB.prepare('UPDATE kaypee_user_state SET state_json = ?, revision = revision + 1, updated_at = ? WHERE user_sub = ? AND revision = ?').bind(stateJson, now, session.user_sub, body.revision).run();
      if (result.meta.changes !== 1) return json({ error: 'Activity changed in another tab. Reload before saving again.', code: 'STATE_CONFLICT' }, 409);
      return json({ revision: body.revision + 1 });
    }
    if (path === '/api/ask' && request.method === 'POST') {
      if (!sameOrigin(request)) return json({ error: 'Invalid request origin.' }, 403);
      const session = await sessionFor(request, env);
      if (!session) return json({ error: 'Sign in with Google to ask Keypee.' }, 401);
      let input;
      try { input = await readJson(request); } catch { return json({ error: 'Invalid request body.' }, 400); }
      const result = await createAsk(content, env).answer(input);
      return json(result.body, result.status);
    }
    return json({ error: 'Not found.' }, 404);
  }
  if (!['GET', 'HEAD'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405);
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request, env) {
    try {
      const response = await handleRequest(request, env);
      const headers = new Headers(response.headers);
      for (const [key, value] of Object.entries(securityHeaders)) headers.set(key, value);
      return new Response(response.body, { status: response.status, headers });
    } catch (error) {
      console.error('Keypee Worker error:', error.message);
      return json({ error: 'Keypee could not complete the request.' }, 500, securityHeaders);
    }
  }
};
