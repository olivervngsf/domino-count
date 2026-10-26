// Browser test: a confirmed AI read is sent to /api/learn (faked) with the photo and checked ends; unticking stops it.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => { const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const sent = [];
  await ctx.route('**/api/read', r => r.request().method() === 'GET' ? r.fulfill({ json: { ok: true } })
    : r.fulfill({ json: { tiles: [{ ends: [13, 14], box: [.15, .25, .3, .42], sure: true }, { ends: [4, 1], box: [.03, .38, .2, .55], sure: true }] } }));
  await ctx.route('**/api/learn', r => { if (r.request().method() === 'GET') return r.fulfill({ json: { ok: true } }); sent.push(JSON.parse(r.request().postData())); r.fulfill({ json: { ok: true } }); });
  const H = await ctx.newPage(); H.on('pageerror', e => errs.push(e.message));
  await H.goto('http://localhost:8765/'); await H.click('[data-g="fresh"]');
  for (const n of ['Hass', 'Mal']) { await H.fill('#playerName', n); await H.click('#addPlayer button'); }
  await H.click('#startGame');
  const shoot = async nth => {
    await H.click(`#glanceCards .rk:nth-child(${nth})`); await H.click('#tabPhoto').catch(() => {});
    await H.setInputFiles('#fileInput', { name: 't.jpg', mimeType: 'image/jpeg', buffer: fs.readFileSync(path.join(__dirname, 'fixtures/tiles.jpg')) });
    await H.waitForFunction(() => /tiles found/.test(document.querySelector('#scanFound')?.textContent || ''), null, { timeout: 10000 });
  };
  await shoot(1);
  console.log('share line shown:', await H.isVisible('#shareRow'), '| ticked:', await H.isChecked('#shareLearn'));
  await H.click('#scanSave'); await H.waitForTimeout(400);
  const s = sent[0];
  console.log('sent:', sent.length, '| jpeg:', s && Buffer.from(s.image, 'base64')[0] === 0xff, '| tiles:', JSON.stringify(s?.tiles.map(t => t.ends)), '| box:', !!s?.tiles[0].box);
  await shoot(2); await H.uncheck('#shareLearn'); await H.click('#scanSave'); await H.waitForTimeout(400);
  console.log('after opt-out, sent:', sent.length, '| remembered off:', await H.evaluate(() => localStorage.getItem('domino-train-share')));
  console.log('errors', errs); await b.close();
  if (sent.length !== 1 || errs.length) process.exit(1);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
