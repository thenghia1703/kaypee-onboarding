import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const base = 'https://kaypee-onboarding.focus-companion-extension.workers.dev';
const token = randomBytes(32).toString('hex');
const tokenHash = createHash('sha256').update(token).digest('hex');
const userSub = `kaypee-smoke-${randomBytes(8).toString('hex')}`;
const runSql = (sql) => execFileSync('npx', ['wrangler', 'd1', 'execute', 'kaypee-user-state', '--remote', '--command', sql], { cwd: root, stdio: 'pipe' });
const request = (route, options = {}) => fetch(base + route, { ...options, headers: { cookie: `kaypee_session=${token}`, origin: base, 'content-type': 'application/json', ...options.headers } });

try {
  runSql(`INSERT INTO kaypee_sessions (token_hash, user_sub, name, email, expires_at) VALUES ('${tokenHash}', '${userSub}', 'Smoke Test', 'smoke@example.invalid', ${Date.now() + 300000})`);
  const empty = await request('/api/user-state');
  assert.equal(empty.status, 200);
  assert.equal((await empty.json()).state, null);
  const saved = await request('/api/user-state', { method: 'PUT', body: JSON.stringify({ revision: 0, state: { read: ['day-1'] } }) });
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).revision, 1);
  const loaded = await request('/api/user-state');
  assert.deepEqual((await loaded.json()).state, { read: ['day-1'] });
  const ai = await request('/api/ask', { method: 'POST', body: JSON.stringify({ question: 'What can you do? Answer in one sentence.' }) });
  const answer = await ai.json();
  assert.equal(ai.status, 200, `AI failed: ${answer.code || answer.error || ai.status}`);
  assert.equal(answer.usedAI, true);
  assert.ok(answer.answer);
  const signedOut = await request('/api/auth/logout', { method: 'POST' });
  assert.equal(signedOut.status, 200);
  assert.match(signedOut.headers.get('set-cookie'), /Max-Age=0/);
  const blocked = await request('/api/user-state');
  assert.equal(blocked.status, 401);
  console.log('Cloud smoke test passed: D1 state persisted, DeepSeek answered, and sign-out revoked the session.');
} finally {
  runSql(`DELETE FROM kaypee_user_state WHERE user_sub = '${userSub}'`);
  runSql(`DELETE FROM kaypee_sessions WHERE token_hash = '${tokenHash}'`);
}
