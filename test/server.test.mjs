import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, test } from 'node:test';
import { server, retrieve } from '../server.mjs';

let appURL;
let mockURL;
let mock;
let lastRequest;
let responseSourceIds = ['status-visibility'];
async function listen(target) {
  await new Promise((resolve) => target.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${target.address().port}`;
}
async function ask(input) {
  const response = await fetch(`${appURL}/api/ask`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
  return { response, body: await response.json() };
}
before(async () => {
  mock = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    lastRequest = JSON.parse(Buffer.concat(chunks).toString());
    const question = lastRequest.messages.at(-1)?.content || '';
    const message = question.includes('plain citation')
      ? 'Normal is visible in search [status-visibility].'
      : lastRequest.response_format
      ? JSON.stringify({ answer: 'The workbook says Normal is visible in search [1].', sourceIds: responseSourceIds, nextAction: 'Check the item status.' })
      : 'I do not know that company-specific detail yet.';
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: message } }] }));
  });
  mockURL = await listen(mock);
  appURL = await listen(server);
  process.env.DEEPSEEK_BASE_URL = mockURL;
  process.env.DEEPSEEK_API_KEY = 'local-test-key';
});
after(async () => {
  server.closeAllConnections();
  mock.closeAllConnections();
  await Promise.all([new Promise((resolve) => server.close(resolve)), new Promise((resolve) => mock.close(resolve))]);
  delete process.env.DEEPSEEK_BASE_URL;
  delete process.env.DEEPSEEK_API_KEY;
});

test('retrieval uses checked workbook excerpts', () => {
  assert.equal(retrieve('item status visibility')[0].id, 'status-visibility');
  assert.equal(retrieve('available stock')[0].id, 'stock-basics');
  assert.equal(retrieve('unrelated invented topic').length, 0);
});
test('serves workbook originals and blocks secrets', async () => {
  assert.equal((await fetch(appURL)).status, 200);
  const workbookResponse = await fetch(`${appURL}/workbook-sources.json`);
  assert.equal(workbookResponse.status, 200);
  const workbook = await workbookResponse.json();
  assert.equal(workbook.images.length, 26);
  assert.ok(workbook.images[0].ocr.includes('Upload Validation'));
  assert.equal((await fetch(`${appURL}/assets/workbook/image-01.png`)).status, 200);
  assert.equal((await fetch(`${appURL}/.env`)).status, 404);
  assert.equal((await fetch(`${appURL}/onboarding.js`)).status, 200);
  assert.equal((await fetch(`${appURL}/onboarding.css`)).status, 200);
});
test('Google setup exposes only public configuration and starts signed out', async () => {
  const config = await fetch(`${appURL}/api/auth/config`).then((response) => response.json());
  assert.equal(typeof config.googleClientId, 'string');
  assert.deepEqual(await fetch(`${appURL}/api/auth/session`).then((response) => response.json()), { authenticated: false, profile: null });
  const signIn = await fetch(`${appURL}/api/auth/google`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ credential: 'fake' }) });
  assert.notEqual(signIn.status, 200);
  const signOut = await fetch(`${appURL}/api/auth/logout`, { method: 'POST' });
  assert.equal(signOut.status, 200);
  assert.match(signOut.headers.get('set-cookie'), /Max-Age=0/);
});
test('explicit checked source is sent as a bounded excerpt and cited', async () => {
  const { response, body } = await ask({ question: 'What does normal status mean?', sourceIds: ['status-visibility'] });
  assert.equal(response.status, 200);
  assert.deepEqual(body.sources.map((source) => source.id), ['status-visibility']);
  assert.match(body.sources[0].sourceRef, /image-06/);
  assert.match(lastRequest.messages[1].content, /status-visibility/);
  assert.ok(lastRequest.messages[1].content.length < 10000);
});
test('local notes can be context and citations, but invented citations are rejected', async () => {
  responseSourceIds = ['note-test-1'];
  const localNote = { id: 'note-test-1', title: 'My note', text: 'I checked this with my mentor.' };
  const cited = await ask({ question: 'What does my note say?', localNotes: [localNote] });
  assert.equal(cited.response.status, 200);
  assert.deepEqual(cited.body.sources.map((source) => source.id), [localNote.id]);
  assert.match(lastRequest.messages[1].content, /I checked this with my mentor/);
  responseSourceIds = ['invented-source'];
  const rejected = await ask({ question: 'What does normal status mean?', sourceIds: ['status-visibility'] });
  assert.equal(rejected.response.status, 502);
  assert.equal(rejected.body.code, 'INVALID_CITATION');
  responseSourceIds = ['status-visibility'];
});
test('accepts DeepSeek plain text only with validated source markers', async () => {
  const { response, body } = await ask({ question: 'plain citation for item status', sourceIds: ['status-visibility'] });
  assert.equal(response.status, 200);
  assert.match(body.answer, /\[1\]/);
  assert.deepEqual(body.sources.map((source) => source.id), ['status-visibility']);
});
test('unsupported question still calls AI and says unknown', async () => {
  const { response, body } = await ask({ question: 'unrelated invented topic' });
  assert.equal(response.status, 200);
  assert.deepEqual(body.sources, []);
  assert.match(body.answer, /do not know/);
  assert.equal(lastRequest.response_format, undefined);
});
test('missing key is an explicit unavailable state', async () => {
  delete process.env.DEEPSEEK_API_KEY;
  try {
    const { response, body } = await ask({ question: 'What does normal status mean?' });
    assert.equal(response.status, 503);
    assert.equal(body.code, 'AI_NOT_CONFIGURED');
  } finally {
    process.env.DEEPSEEK_API_KEY = 'local-test-key';
  }
});
