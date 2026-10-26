// Browser test: the on-phone reader (a stand-in ONNX model) runs in the page through onnxruntime-web.
//  - mode "on" + sure: tiles come from the phone, the AI is never called.
//  - mode "shadow": the AI decides, and the phone's answer rides along with the training save.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const model = fs.readFileSync(path.join(__dirname, 'fixtures/model/reader.onnx'));
async function run(mode) {
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  let aiCalls = 0; const saved = [];
  await ctx.route('**/model/meta.json', r => r.fulfill({ json: { file: 'reader.onnx', input: 640, classes: [...Array(19).keys()], minScore: 0.9, mode } }));
  await ctx.route('**/model/reader.onnx', r => r.fulfill({ body: model, contentType: 'application/octet-stream' }));
  await ctx.route('**/api/read', r => { if (r.request().method() === 'GET') return r.fulfill({ json: { ok: true } }); aiCalls++;
    r.fulfill({ json: { tiles: [{ ends: [6, 9], box: [.4, .4, .5, .5], sure: true }, { ends: [12, 3], box: [.6, .4, .65, .55], sure: true }] } }); });
  await ctx.route('**/api/learn', r => { if (r.request().method() === 'GET') return r.fulfill({ json: { ok: true } }); saved.push(JSON.parse(r.request().postData())); r.fulfill({ json: { ok: true } }); });
  const H = await ctx.newPage(); H.on('pageerror', e => errs.push(e.message));
  await H.goto('http://localhost:8765/'); await H.click('[data-g="fresh"]');
  for (const n of ['Hass', 'Mal']) { await H.fill('#playerName', n); await H.click('#addPlayer button'); }
  await H.click('#startGame'); await H.click('#glanceCards .rk:nth-child(1)'); await H.click('#tabPhoto').catch(() => {});
  await H.setInputFiles('#fileInput', { name: 't.jpg', mimeType: 'image/jpeg', buffer: fs.readFileSync(path.join(__dirname, 'fixtures/tiles.jpg')) });
  await H.waitForFunction(() => /tiles found/.test(document.querySelector('#scanFound')?.textContent || ''), null, { timeout: 30000 });
  const flag = await H.textContent('#readStatus'), total = await H.textContent('#scanTotal');
  await H.click('#scanSave'); await H.waitForTimeout(500);
  console.log(`[${mode}] AI calls: ${aiCalls} | flag: ${flag} | total: ${total} | saved source: ${saved[0]?.source} | phone in save: ${JSON.stringify(saved[0]?.phone)}`);
  await b.close();
  return { aiCalls, flag, total, saved, errs };
}
(async () => {
  const on = await run('on');
  if (on.aiCalls !== 0 || on.total !== '30' || on.saved[0]?.source !== 'phone' || !/phone/.test(on.flag) || on.errs.length) throw new Error('on mode: ' + JSON.stringify(on.errs));
  const sh = await run('shadow');
  if (sh.aiCalls !== 1 || sh.saved[0]?.source !== 'ai' || !sh.saved[0]?.phone?.confident || sh.errs.length) throw new Error('shadow mode: ' + JSON.stringify(sh.errs));
  console.log('phone reader e2e passed');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
