const { chromium } = require('playwright');
// Host a new game starts fresh; a phone with a saved game offers Back to my game or a new one.
const URL = process.env.URL || 'http://localhost:8765/';
(async () => { const b = await chromium.launch(); const errs = [];
  const H = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage(); H.on('pageerror', e => errs.push(e.message));
  await H.goto(URL); console.log('empty phone button:', await H.textContent('[data-g="fresh"]'));
  await H.click('[data-g="fresh"]');
  for (const n of ['Tom', 'Nanny']) { await H.fill('#playerName', n); await H.click('#addPlayer button'); }
  await H.waitForFunction(() => /^\d{3}$/.test(document.querySelector('#inviteCode').textContent), null, { timeout: 30000 });
  const code1 = await H.textContent('#inviteCode');
  await H.click('#startGame'); await H.evaluate(() => { state.players.forEach(p => setScore(p.id, 0, 5)); save(); }); await H.click('#endBtn');
  await H.goto(URL); // your case: game saved, back on the plain link
  console.log('saved game buttons:', await H.textContent('[data-g="host"]'), '|', await H.textContent('[data-g="fresh"]'));
  await H.click('[data-g="fresh"]'); await H.click('#askYes');
  await H.waitForSelector('#setupScreen:not(.hidden)');
  await H.waitForFunction(() => /^\d{3}$/.test(document.querySelector('#inviteCode').textContent), null, { timeout: 60000 });
  console.log('new game: players', await H.evaluate(() => state.players.length), '| scores', await H.evaluate(() => Object.keys(state.scores).length),
    '| button:', await H.textContent('#startGame'), '| recent:', await H.$$eval('#recentList .chip', e => e.map(x => x.textContent)), '| new code:', (await H.textContent('#inviteCode')) !== code1);
  console.log('errors', errs); await b.close(); })().catch(e => { console.error('FAIL', e.message); process.exit(1); });
