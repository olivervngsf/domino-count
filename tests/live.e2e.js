const { chromium } = require('playwright');
// Run: python3 -m http.server 8765 (in the repo), then node tests/live.e2e.js. Needs Playwright and internet (PeerJS broker).
const URL = process.env.URL || 'http://localhost:8765/';
(async () => {
  const b = await chromium.launch();
  const errs = [];
  const mk = async name => { const c = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await c.newPage(); p.on('pageerror', e => errs.push(name + ': ' + e.message)); p.on('console', m => m.type() === 'error' && errs.push(name + ' console: ' + m.text())); return p; };
  const H = await mk('host'), G = await mk('guest'), G2 = await mk('guest2');
  await H.goto(URL);
  await H.click('[data-g="host"], [data-g="fresh"]');
  for (const n of ['Lan', 'Jo', 'Mai']) { await H.fill('#playerName', n); await H.click('#addPlayer button'); }
  await H.waitForFunction(() => /^\d{3}$/.test(document.querySelector('#inviteCode').textContent), null, { timeout: 30000 });
  const code = await H.textContent('#inviteCode'); console.log('code', code);
  await H.screenshot({ path: require('os').tmpdir() + '/live_host_setup.png' });
  // guest 1 joins by link, picks name before game starts
  await G.goto(URL + '?join=' + code);
  await G.waitForSelector('[data-g="pick"]', { timeout: 20000 }); console.log('G joined');
  await G.screenshot({ path: require('os').tmpdir() + '/live_guest_pick.png' });
  await G.click('[data-g="pick"]:has-text("Jo")');
  await G.waitForSelector('text=Waiting for the host to start');
  // guest 2 joins by typing code, adds new name
  await G2.goto(URL);
  await G2.fill('#pcode', code); await G2.click('[data-g="join"]');
  await G2.waitForSelector('#pnew', { timeout: 20000 });
  await G2.fill('#pnew', 'Kim'); await G2.click('[data-g="newme"]');
  await G2.waitForSelector('text=Waiting for the host to start', { timeout: 10000 }); console.log('G2 added as Kim');
  console.log('host players', await H.evaluate(() => state.players.map(p => p.name).join(',')));
  await H.click('#startGame');
  await G.waitForSelector('[data-g="key"]', { timeout: 10000 }); console.log('G sees score screen');
  await G.screenshot({ path: require('os').tmpdir() + '/live_guest_type.png' });
  const t0 = Date.now();
  await G.click('[data-g="key"][data-v="1"]'); await G.click('[data-g="key"][data-v="2"]'); await G.click('[data-g="send"]');
  await H.waitForFunction(() => state.scores[state.players.find(p => p.name === 'Jo').id + ':0'] === 12, null, { timeout: 10000 });
  console.log('host got Jo=12 in', Date.now() - t0, 'ms');
  await G.waitForSelector('text=Sent to the host ✓', { timeout: 10000 });
  await G.screenshot({ path: require('os').tmpdir() + '/live_guest_sent.png' });
  console.log('phone icon on host:', await H.$$eval('#roundPlayers .ph', e => e.length));
  await H.screenshot({ path: require('os').tmpdir() + '/live_host_game.png', fullPage: false });
  // G2 goes out
  await G2.click('[data-g="out"]');
  await H.waitForFunction(() => state.scores[state.players.find(p => p.name === 'Kim').id + ':0'] === 0, null, { timeout: 10000 });
  // G changes score
  await G.click('[data-g="change"]'); await G.click('[data-g="key"][data-v="clear"]'); await G.click('[data-g="key"][data-v="9"]'); await G.click('[data-g="send"]');
  await H.waitForFunction(() => state.scores[state.players.find(p => p.name === 'Jo').id + ':0'] === 9, null, { timeout: 10000 }); console.log('change ok');
  // host types the rest, host edit clears phone mark
  await H.evaluate(() => { const id = n => state.players.find(p => p.name === n).id; setScore(id('Lan'), 0, 5); setScore(id('Mai'), 0, 7); save(); });
  await H.click('#finishRound');
  await G.waitForFunction(() => /Round/.test(document.querySelector('.minihero')?.textContent || '') && document.querySelector('.minihero .hn').textContent.startsWith('02'), null, { timeout: 10000 });
  console.log('guest moved to round 2');
  // host browses back to round 1: guests stay on round 2
  await H.click('#prevRound');
  await G.waitForTimeout(800);
  console.log('guest round after host browsed back:', await G.textContent('.minihero .hn'));
  // guest reload -> rejoins as same player
  await G.reload();
  await G.waitForSelector('[data-g="key"]', { timeout: 20000 });
  console.log('guest after reload me:', await G.textContent('.me'));
  // host reload -> guests reconnect
  await H.reload();
  console.log('host reopen shows:', await H.textContent('[data-g="host"], [data-g="fresh"]'));
  await H.click('[data-g="host"], [data-g="fresh"]');
  await H.waitForFunction(() => /^\d{3}$/.test(document.querySelector('#codeChip').textContent.replace('Code ', '').trim()), null, { timeout: 60000 });
  console.log('host back with code', await H.textContent('#codeChip'));
  await G.click('[data-g="key"][data-v="4"]'); await G.click('[data-g="send"]');
  await H.waitForFunction(() => state.scores[state.players.find(p => p.name === 'Jo').id + ':1'] === 4, null, { timeout: 30000 });
  console.log('score after host reload ok');
  // guest leave restores own data
  await G.click('[data-g="leave"]'); await G.click('#askYes');
  await G.waitForSelector('#setupScreen:not(.hidden)');
  console.log('guest left, own players:', await G.evaluate(() => state.players.length));
  console.log('errors', errs);
  await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
