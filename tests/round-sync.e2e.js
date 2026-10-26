const { chromium } = require('playwright');
// A stray score in a later round must not pull guests ahead. Same setup as live.e2e.js.
const URL = process.env.URL || 'http://localhost:8765/';
(async () => { const b = await chromium.launch(); const errs = [];
  const mk = async () => { const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage(); p.on('pageerror', e => errs.push(e.message)); return p; };
  const H = await mk(), G = await mk();
  const gRound = async () => (await G.textContent('.minihero .hn')).slice(0, 2);
  await H.goto(URL); await H.click('[data-g="host"]');
  for (const n of ['Tom', 'Nanny', 'Eric']) { await H.fill('#playerName', n); await H.click('#addPlayer button'); }
  await H.waitForFunction(() => /^\d{3}$/.test(document.querySelector('#inviteCode').textContent), null, { timeout: 30000 });
  await H.click('#startGame');
  await G.goto(URL + '?join=' + await H.textContent('#inviteCode')); await G.click('[data-g="pick"]:has-text("Nanny")', { timeout: 20000 });
  await H.evaluate(() => { setScore(state.players[1].id, 0, 39); setScore(state.players[2].id, 0, 60); save(); });
  // host steps ahead and scores Tom in round 2, then goes back
  await H.click('#nextRound'); await H.evaluate(() => { setScore(state.players[0].id, 1, 5); save(); }); await H.click('#prevRound');
  await G.waitForTimeout(1000); console.log('guest round after stray score (want 01):', await gRound());
  // an old save that already had play=1 is pulled back too
  await H.evaluate(() => { state.play = 1; save(); }); await G.waitForTimeout(800);
  console.log('guest round with stale play=1 (want 01):', await gRound());
  // finish round 1 properly -> guest moves
  await H.evaluate(() => { setScore(state.players[0].id, 0, 7); state.play = 0; save(); advance(); }); await G.waitForTimeout(800);
  console.log('after Finish round (want 02):', await gRound());
  // the › arrow after a full round also moves guests
  await H.evaluate(() => { state.players.forEach(p => setScore(p.id, 1, 1)); save(); }); await H.click('#nextRound'); await G.waitForTimeout(800);
  console.log('after › on full round (want 03):', await gRound());
  console.log('errors', errs); await b.close(); })().catch(e => { console.error('FAIL', e.message); process.exit(1); });
