// Unit test for api/read.js with Claude's reply faked (no key or network needed). Run: node tests/read-api.test.js
const assert = require('assert');
const handler = require('../api/read.js');
const mkRes = () => { const r = { code: 0, body: null }; r.status = c => { r.code = c; return r; }; r.json = b => { r.body = b; return r; }; r.end = () => r; return r; };
const call = async (req) => { const res = mkRes(); await handler({ headers: { host: 'domino-train.vercel.app' }, ...req }, res); return res; };
(async () => {
  delete process.env.ANTHROPIC_API_KEY;
  let r = await call({ method: 'GET' }); assert.deepStrictEqual(r.body, { ok: false });
  r = await call({ method: 'POST', body: {} }); assert.strictEqual(r.body.code, 'not_configured');
  process.env.ANTHROPIC_API_KEY = 'test-key';
  r = await call({ method: 'GET' }); assert.deepStrictEqual(r.body, { ok: true });
  const img = { type: 'image/jpeg', data: 'AAAA' };
  r = await call({ method: 'POST', headers: { host: 'domino-train.vercel.app', origin: 'https://evil.example' }, body: { prompt: 'x', images: [img] } });
  assert.strictEqual(r.code, 403);
  r = await call({ method: 'POST', body: { prompt: 'x', images: [{ type: 'image/gif', data: 'AAAA' }] } }); assert.strictEqual(r.body.code, 'image_rejected');
  let sent;
  global.fetch = async (url, opt) => { sent = JSON.parse(opt.body); assert.strictEqual(opt.headers['x-api-key'], 'test-key');
    return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: 'Here: {"tiles":[{"ends":[13,14],"box":[0.1,0.1,0.3,0.4],"sure":true}]}' }] }) }; };
  r = await call({ method: 'POST', headers: { host: 'domino-train.vercel.app', origin: 'https://domino-train.vercel.app' }, body: { prompt: 'read', images: [img] } });
  assert.strictEqual(r.code, 200); assert.deepStrictEqual(r.body.tiles[0].ends, [13, 14]);
  assert.strictEqual(sent.messages[0].content[0].source.media_type, 'image/jpeg');
  global.fetch = async () => ({ ok: false, status: 429, json: async () => ({}) });
  r = await call({ method: 'POST', body: { prompt: 'read', images: [img] } }); assert.strictEqual(r.body.code, 'rate_limited');
  global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: 'no json here' }] }) });
  r = await call({ method: 'POST', body: { prompt: 'read', images: [img] } }); assert.strictEqual(r.body.code, 'invalid_json');
  console.log('read api tests passed');
})().catch(e => { console.error(e); process.exit(1); });
