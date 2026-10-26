const { chromium } = require('playwright');
// Start screen: plain link opens Join or Host; reopen keeps the host code; guests come back. Same setup as live.e2e.js.
const URL = process.env.URL || 'http://localhost:8765/';
(async () => { const b = await chromium.launch(); const errs = [];
  const mk = async () => { const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage(); p.on('pageerror', e => errs.push(e.message)); return p; };
  const H = await mk(), G = await mk();
  await H.goto(URL); console.log('1 start screen:', await H.isVisible('[data-g="host"], [data-g="fresh"]'), await H.textContent('[data-g="host"], [data-g="fresh"]'));
  await H.click('[data-g="host"], [data-g="fresh"]'); for (const n of ['Lan', 'Jo']) { await H.fill('#playerName', n); await H.click('#addPlayer button'); }
  await H.waitForFunction(() => /^\d{3}$/.test(document.querySelector('#inviteCode').textContent), null, { timeout: 30000 });
  const code = await H.textContent('#inviteCode'); console.log('2 names + code', code);
  await H.screenshot({ path: require('os').tmpdir() + '/flow_host.png' });
  await G.goto(URL + '?join=' + code); await G.click('[data-g="pick"]:has-text("Jo")', { timeout: 20000 });
  // host reopens before starting: start screen, Host -> same code, guest still connected
  await H.reload(); console.log('3 reopen before start -> start screen:', await H.isVisible('[data-g="host"], [data-g="fresh"]'));
  await H.click('[data-g="host"], [data-g="fresh"]');
  await H.waitForFunction(() => /^\d{3}$/.test(document.querySelector('#inviteCode').textContent), null, { timeout: 60000 });
  console.log('4 same code:', (await H.textContent('#inviteCode')) === code, '| players kept:', await H.evaluate(() => state.players.length));
  await H.click('#startGame'); await G.waitForSelector('[data-g="key"]', { timeout: 45000 }); console.log('5 guest reconnected and sees game');
  // reopen mid-game -> straight to game
  await H.reload(); await H.waitForSelector('[data-g="host"], [data-g="fresh"]'); console.log('6 reopen mid-game -> start screen, button:', await H.textContent('[data-g="host"], [data-g="fresh"]'));
  await H.click('[data-g="host"], [data-g="fresh"]'); console.log('6b back in game:', await H.isVisible('#gameScreen'));
  await G.goto(URL); await G.waitForSelector('#pcode'); console.log('6c guest on plain link -> start, code prefilled:', await G.inputValue('#pcode'));
  await G.click('[data-g="join"]'); await G.waitForSelector('[data-g="key"]', { timeout: 30000 }); console.log('6d guest back as', await G.textContent('.me'), '| url', G.url().split('/').pop());
  console.log('7 learned tiles hidden in settings:', !(await H.isVisible('#exGrid')));
  console.log('errors', errs); await b.close(); })().catch(e => { console.error('FAIL', e.message); process.exit(1); });
