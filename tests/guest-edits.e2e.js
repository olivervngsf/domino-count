const { chromium } = require('playwright');
// Fix-last-round and score-for-someone-else. Same setup as live.e2e.js.
const URL = process.env.URL || 'http://localhost:8765/';
(async () => {
  const b = await chromium.launch(); const errs = [];
  const mk = async n => { const c = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await c.newPage(); p.on('pageerror', e => errs.push(n + e.message)); return p; };
  const H = await mk('H'), G = await mk('G'), G2 = await mk('G2');
  const sc = (n, r) => H.evaluate(([n, r]) => state.scores[state.players.find(p => p.name === n).id + ':' + r], [n, r]);
  await H.goto(URL);
  await H.click('[data-g="host"]');
  for (const n of ['Lan', 'Jo', 'Mai', 'Kim']) { await H.fill('#playerName', n); await H.click('#addPlayer button'); }
  await H.waitForFunction(() => /^\d{3}$/.test(document.querySelector('#inviteCode').textContent), null, { timeout: 30000 });
  const code = await H.textContent('#inviteCode');
  await H.click('#startGame');
  await G.goto(URL + '?join=' + code); await G.click('[data-g="pick"]:has-text("Jo")', { timeout: 20000 });
  await G2.goto(URL + '?join=' + code); await G2.click('[data-g="pick"]:has-text("Kim")', { timeout: 20000 });
  // Jo scores for Mai (no phone)
  await G.click('[data-g="others"]');
  await G.click('[data-g="other"]:has-text("Mai")');
  await G.click('[data-g="key"][data-v="7"]'); await G.click('[data-g="send"]');
  await H.waitForFunction(() => state.scores[state.players.find(p => p.name === 'Mai').id + ':0'] === 7, null, { timeout: 10000 });
  console.log('Jo scored 7 for Mai; toast:', await H.textContent('#toast'));
  await G.waitForSelector('.gflash.ok', { timeout: 5000 }); console.log('guest flash:', await G.textContent('.gflash'));
  console.log('Mai row has phone icon:', await H.$$eval('#roundPlayers .srow', rows => rows.some(r => /Mai/.test(r.textContent) && r.querySelector('.ph'))));
  // Kim can no longer pick Mai (already scored) — list excludes her
  await G2.click('[data-g="others"]');
  const kimList = await G2.$$eval('[data-g="other"]', e => e.map(x => x.textContent));
  console.log('Kim sees to-score list:', kimList);
  // Kim tries to overwrite Mai via forged message: host must reject
  await G2.evaluate(() => live.send(state.players.find(p => p.name === 'Mai').id, 0, 99));
  await G2.waitForTimeout(800);
  console.log('Mai after forged overwrite:', await sc('Mai', 0));
  await G2.click('[data-g="cancel"]').catch(() => {});
  // Jo, Kim, Lan score; host finishes round
  await G.click('[data-g="key"][data-v="1"]'); await G.click('[data-g="key"][data-v="2"]'); await G.click('[data-g="send"]');
  await G2.click('[data-g="out"]');
  await H.waitForFunction(() => Object.keys(state.scores).length === 3, null, { timeout: 10000 });
  await H.evaluate(() => { setScore(state.players[0].id, 0, 5); save(); advance(); });
  // Jo fixes round 1: 12 -> 9
  await G.waitForSelector('[data-g="fix"]', { timeout: 10000 });
  console.log('fix link:', (await G.textContent('[data-g="fix"]')).replace(/\s+/g, ' '));
  await G.click('[data-g="fix"]');
  await G.click('[data-g="key"][data-v="clear"]'); await G.click('[data-g="key"][data-v="9"]'); await G.click('[data-g="send"]');
  await H.waitForFunction(() => state.scores[state.players.find(p => p.name === 'Jo').id + ':0'] === 9, null, { timeout: 10000 });
  console.log('fix applied; toast:', await H.textContent('#toast'));
  await G.waitForSelector('.gflash.ok', { timeout: 5000 }); console.log('guest flash:', await G.textContent('.gflash'));
  await G.screenshot({ path: require('os').tmpdir() + '/edit_guest.png' }); await H.screenshot({ path: require('os').tmpdir() + '/edit_host.png' });
  // Kim can't fix Jo's last round (forged)
  await G2.evaluate(() => live.send(state.players.find(p => p.name === 'Jo').id, 0, 50));
  await G2.waitForTimeout(800);
  console.log('Jo r1 after Kim forged fix:', await sc('Jo', 0));
  // Fix of round 2-ago rejected
  await H.evaluate(() => { state.players.forEach(p => setScore(p.id, 1, 1)); save(); advance(); });
  await G.waitForTimeout(800);
  await G.evaluate(() => live.send(state.players.find(p => p.name === 'Jo').id, 0, 1));
  await G.waitForTimeout(800);
  console.log('Jo r1 after 2-rounds-old fix try:', await sc('Jo', 0));
  console.log('errors', errs); await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
