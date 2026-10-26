const { chromium } = require('playwright');
// Check-in tags: a guest who picks or adds their name shows as Here on the host. Same setup as live.e2e.js.
const URL = process.env.URL || 'http://localhost:8765/';
(async () => { const b = await chromium.launch(); const errs = [];
  const mk = async () => { const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage(); p.on('pageerror', e => errs.push(e.message)); return p; };
  const H = await mk(), G = await mk(), G2 = await mk();
  const tags = () => H.$$eval('#playerList .prow', rows => rows.filter(r => r.querySelector('.here')).map(r => r.querySelector('.nm').textContent));
  await H.goto(URL); await H.click('[data-g="host"], [data-g="fresh"]');
  for (const n of ['Tom', 'Nanny', 'Hass']) { await H.fill('#playerName', n); await H.click('#addPlayer button'); }
  await H.waitForFunction(() => /^\d{3}$/.test(document.querySelector('#inviteCode').textContent), null, { timeout: 30000 });
  const code = await H.textContent('#inviteCode');
  await G.goto(URL + '?join=' + code); await G.click('[data-g="pick"]:has-text("Tom")', { timeout: 20000 });
  await H.waitForFunction(() => document.querySelectorAll('#playerList .here').length === 1, null, { timeout: 10000 });
  console.log('after Tom picks:', await tags());
  await G2.goto(URL + '?join=' + code); await G2.waitForSelector('#pnew', { timeout: 20000 });
  await G2.fill('#pnew', 'Eric'); await G2.click('[data-g="newme"]');
  await H.waitForFunction(() => document.querySelectorAll('#playerList .here').length === 2, null, { timeout: 10000 });
  console.log('after Eric adds himself:', await tags());
  await H.screenshot({ path: require('os').tmpdir() + '/here.png' });
  await G.click('[data-g="leave"]'); await G.click('#askYes');
  await H.waitForFunction(() => document.querySelectorAll('#playerList .here').length === 1, null, { timeout: 15000 });
  console.log('after Tom leaves:', await tags());
  console.log('errors', errs); await b.close(); })().catch(e => { console.error('FAIL', e.message); process.exit(1); });
