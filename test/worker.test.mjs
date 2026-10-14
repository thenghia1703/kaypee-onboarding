import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { handleRequest } from '../worker.mjs';

const tokenA = 'a'.repeat(64);
const tokenB = 'b'.repeat(64);
const sessions = new Map([
  [createHash('sha256').update(tokenA).digest('hex'), { user_sub: 'google-sub-a', name: 'A', email: 'a@example.com' }],
  [createHash('sha256').update(tokenB).digest('hex'), { user_sub: 'google-sub-b', name: 'B', email: 'b@example.com' }]
]);
const stateRows = new Map();
const env = {
  GOOGLE_CLIENT_ID: 'public-client-id',
  DB: { prepare(sql) {
    return { bind(...args) {
      return {
        async first() {
          if (sql.includes('FROM kaypee_sessions')) return sessions.get(args[0]) || null;
          if (sql.includes('FROM kaypee_user_state')) return stateRows.get(args[0]) || null;
          throw new Error('Unexpected query');
        },
        async run() {
          if (sql.startsWith('DELETE FROM kaypee_sessions')) {
            const existed = sessions.delete(args[0]);
            return { meta: { changes: existed ? 1 : 0 } };
          }
          if (sql.startsWith('INSERT INTO kaypee_user_state')) {
            if (stateRows.has(args[0])) return { meta: { changes: 0 } };
            stateRows.set(args[0], { state_json: args[1], revision: 1 });
            return { meta: { changes: 1 } };
          }
          if (sql.startsWith('UPDATE kaypee_user_state')) {
            const row = stateRows.get(args[2]);
            if (!row || row.revision !== args[3]) return { meta: { changes: 0 } };
            stateRows.set(args[2], { state_json: args[0], revision: row.revision + 1 });
            return { meta: { changes: 1 } };
          }
          throw new Error('Unexpected write');
        }
      };
    } };
  } }
};

function request(path, token, method = 'GET', body, origin = 'https://kaypee.example') {
  return new Request(`https://kaypee.example${path}`, {
    method,
    headers: { ...(token ? { cookie: `kaypee_session=${token}` } : {}), ...(method !== 'GET' ? { origin, 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}

test('deployed AI route requires a verified session', async () => {
  const response = await handleRequest(request('/api/ask', null, 'POST', { question: 'Hi' }), env);
  assert.equal(response.status, 401);
});

test('sign-out invalidates the server session and expires the cookie', async () => {
  const before = await handleRequest(request('/api/auth/session', tokenB), env);
  assert.equal((await before.json()).authenticated, true);
  const response = await handleRequest(request('/api/auth/logout', tokenB, 'POST'), env);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
  const after = await handleRequest(request('/api/auth/session', tokenB), env);
  assert.equal((await after.json()).authenticated, false);
  sessions.set(createHash('sha256').update(tokenB).digest('hex'), { user_sub: 'google-sub-b', name: 'B', email: 'b@example.com' });
});

test('D1 user state is isolated by Google sub and rejects stale writes', async () => {
  const empty = await handleRequest(request('/api/user-state', tokenB), env);
  assert.deepEqual(await empty.json(), { state: null, revision: 0 });
  const saved = await handleRequest(request('/api/user-state', tokenA, 'PUT', { state: { read: ['day-1'] }, revision: 0 }), env);
  assert.deepEqual(await saved.json(), { revision: 1 });
  const a = await handleRequest(request('/api/user-state', tokenA), env);
  assert.deepEqual(await a.json(), { state: { read: ['day-1'] }, revision: 1 });
  const b = await handleRequest(request('/api/user-state', tokenB), env);
  assert.deepEqual(await b.json(), { state: null, revision: 0 });
  const stale = await handleRequest(request('/api/user-state', tokenA, 'PUT', { state: { read: ['day-2'] }, revision: 0 }), env);
  assert.equal(stale.status, 409);
  const crossOrigin = await handleRequest(request('/api/user-state', tokenA, 'PUT', { state: { read: [] }, revision: 1 }, 'https://evil.example'), env);
  assert.equal(crossOrigin.status, 403);
});
