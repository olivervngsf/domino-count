// Browser test: the hosted site (no window.claude) reads numbers through /api/read (faked here).
const { chromium } = require('playwright');
const fs = require('fs');
(async () => { const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  let posted = null;
  await ctx.route('**/api/read', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { ok: true } });
    posted = JSON.parse(route.request().postData());
    route.fulfill({ json: { tiles: [
      { ends: [13, 14], box: [.15, .25, .3, .42], sure: true }, { ends: [14, 3], box: [.33, .2, .47, .38], sure: true },
      { ends: [4, 4], box: [.52, .17, .66, .36], sure: true }, { ends: [4, 1], box: [.03, .38, .2, .55], sure: false },
      { ends: [10, 11], box: [.17, .48, .3, .66], sure: true }, { ends: [15, 15], box: [.3, .48, .44, .66], sure: true },
      { ends: [10, 10], box: [.44, .45, .57, .62], sure: true }, { ends: [1, 14], box: [.57, .45, .72, .63], sure: true }] } });
  });
  const H = await ctx.newPage(); H.on('pageerror', e => errs.push(e.message));
  await H.goto('http://localhost:8765/'); await H.click('[data-g="fresh"]');
  for (const n of ['Hass', 'Mal']) { await H.fill('#playerName', n); await H.click('#addPlayer button'); }
  await H.click('#startGame');
  await H.click('#glanceCards .rk:nth-child(1)'); await H.click('#tabPhoto');
  await H.setInputFiles('#fileInput', { name: 'tiles.jpg', mimeType: 'image/jpeg', buffer: fs.readFileSync(require('path').join(__dirname, 'fixtures/tiles.jpg')) });
  await H.waitForFunction(() => /tiles found/.test(document.querySelector('#scanFound')?.textContent || ''), null, { timeout: 10000 });
  console.log('sent to reader:', posted.images.length, 'image(s),', posted.images[0].type, Math.round(posted.images[0].data.length / 1024) + 'KB b64');
  console.log('found:', await H.textContent('#scanFound'), '| flag:', await H.textContent('#readStatus'), '| total:', await H.textContent('#scanTotal'));
  console.log('save:', await H.textContent('#scanSave'));
  await H.screenshot({ path: require('os').tmpdir() + '/check-tiles-ai.png' });
  // confirm the unsure one, then save
  for (let g = 0; g < 4 && await H.$eval('#scanSave', e => e.disabled); g++) { const ok = await H.$('#scanDlg [data-ok]'); if (ok) await ok.click(); else { const t = await H.$('#scanDlg .trow.q > button, #scanDlg [data-tog]'); if (t) await t.click(); } }
  await H.click('#scanSave'); await H.waitForTimeout(300);
  console.log('Hass round 1 =', await H.evaluate(() => state.scores[state.players[0].id + ':0']));
  console.log('errors', errs); await b.close(); })().catch(e => { console.error('FAIL', e.message); process.exit(1); });
