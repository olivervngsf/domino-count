const { chromium } = require('playwright');
// Round rules from the prototype: › is off on the round in play; saved rounds open to fix; guests stay put. Same setup as live.e2e.js.
const URL = process.env.URL || 'http://localhost:8765/';
(async () => { const b = await chromium.launch(); const errs = [];
  const mk = async () => { const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage(); p.on('pageerror', e => errs.push(e.message)); return p; };
  const H = await mk(), G = await mk();
  const gRound = async () => (await G.textContent('#guestScreen .hero2 .hn')).slice(0, 2);
  await H.goto(URL); await H.click('[data-g="host"], [data-g="fresh"]');
  for (const n of ['Tom', 'Nanny', 'Eric']) { await H.fill('#playerName', n); await H.click('#addPlayer button'); }
  await H.waitForFunction(() => /^\d{3}$/.test(document.querySelector('#inviteCode').textContent), null, { timeout: 30000 });
  await H.click('#startGame');
  await G.goto(URL + '?join=' + await H.textContent('#inviteCode')); await G.click('[data-g="pick"]:has-text("Nanny")', { timeout: 20000 });
  await H.evaluate(() => { setScore(state.players[1].id, 0, 39); setScore(state.players[2].id, 0, 60); save(); });
  // like the prototype: › is off on the round in play, so nobody can score ahead
  console.log('› disabled on round in play:', await H.$eval('#nextRound', e => e.disabled));
  // host opens round... only after finishing: finish round 1, open it again to fix, guest stays on 2
  await H.evaluate(() => { setScore(state.players[0].id, 0, 7); save(); }); await H.click('#glanceNext'); await G.waitForTimeout(800);
  console.log('after Finish round (want 02):', await gRound());
  await H.click('#prevRound'); await G.waitForTimeout(800);
  console.log('host fixing round 1 -> label:', await H.textContent('#roundLbl'), '| guest (want 02):', await gRound());
  await H.click('#glanceNext'); console.log('Back to round 2 ->', await H.textContent('#roundNum'));
  console.log('errors', errs); await b.close(); })().catch(e => { console.error('FAIL', e.message); process.exit(1); });
