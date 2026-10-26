// Guest round browsing + reset, remembered Photo/Type, tap-to-photo finder, fixed scoreboard columns, Edit in the card.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8765/';
(async () => { const b = await chromium.launch(); const errs = [];
  const mk = async () => { const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage(); p.on('pageerror', e => errs.push(e.message)); return p; };
  const H = await mk(), G = await mk();
  await H.goto(URL); await H.click('[data-g="host"], [data-g="fresh"]');
  for (const n of ['Tom', 'Nanny', 'Eric', 'Hass']) { await H.fill('#playerName', n); await H.click('#addPlayer button'); }
  await H.waitForFunction(() => /^\d{3}$/.test(document.querySelector('#inviteCode').textContent), null, { timeout: 30000 });
  await H.click('#startGame');
  await G.goto(URL + '?join=' + await H.textContent('#inviteCode')); await G.click('[data-g="pick"]:has-text("Tom")', { timeout: 20000 });
  // play 9 rounds so the board needs to scroll
  await H.evaluate(() => { for (let r = 0; r < 9; r++) { state.players.forEach((p, i) => setScore(p.id, r, (r * 7 + i * 5) % 23)); state.play = r + 1; state.current = r + 1; } save(); });
  await G.waitForTimeout(800);
  // 5. score section hidden; Edit lives in the card
  console.log('5 score section hidden:', await H.isHidden('#scoreBlock'));
  await H.click('#glanceEdit'); console.log('5 Edit opens it:', await H.isVisible('#scoreBlock'), await H.textContent('#glanceEdit')); await H.click('#glanceEdit');
  // 4. sticky columns
  await H.evaluate(() => document.querySelector('#boardSection').scrollIntoView());
  await H.screenshot({ path: require('os').tmpdir() + '/nf_board_start.png' });
  await H.evaluate(() => { const w = document.querySelector('#gridCard'); w.scrollLeft = 0; });
  await H.waitForTimeout(200); await H.screenshot({ path: require('os').tmpdir() + '/nf_board_scrolled.png' });
  const pos = await H.evaluate(() => { const w = document.querySelector('#gridCard'); const pn = () => document.querySelector('#board .tr:not(.th) .pn').getBoundingClientRect().left; const tot = () => document.querySelector('#board .tr:not(.th) .tot').getBoundingClientRect().right;
    w.scrollLeft = w.scrollWidth; const after = [pn(), tot()]; w.scrollLeft = 0; return { start: [pn(), tot()], after, scrollable: w.scrollWidth > w.clientWidth }; });
  console.log('4 sticky player/total (same x before/after scroll):', JSON.stringify(pos));
  // 2. remembered Photo/Type on host
  await H.evaluate(() => scrollTo(0, 0));
  await H.click('#glanceCards .rk:nth-child(2)'); await H.click('#tabPhoto'); await H.keyboard.press('Escape'); await H.waitForTimeout(200);
  await H.click('#glanceCards .rk:nth-child(3)'); console.log('2 host sheet opens on:', await H.getAttribute('#tabPhoto', 'aria-pressed') === 'true' ? 'Photo' : 'Type');
  // 3. tap the black finder -> camera/file picker opens
  const [fc] = await Promise.all([H.waitForEvent('filechooser', { timeout: 3000 }).catch(() => null), H.click('#photoPane .finder')]);
  console.log('3 tapping the finder opens the camera:', !!fc);
  await H.keyboard.press('Escape');
  // 1. guest browses back / forward / reset
  const gr = async () => (await G.textContent('#guestScreen .hero2 .hn')).slice(0, 2);
  console.log('1 guest on round', await gr());
  await G.click('[data-g="gprev"]'); await G.click('[data-g="gprev"]'); console.log('1 after ‹‹:', await gr(), await G.textContent('#guestScreen .hero2 .lbl'));
  await G.screenshot({ path: require('os').tmpdir() + '/nf_guest_past.png' });
  await G.click('[data-g="gnext"]'); console.log('1 after ›:', await gr());
  await G.click('[data-g="greset"]'); console.log('1 after Back to Round:', await gr());
  // 2. guest remembers Photo
  await G.click('[data-g="mode"][data-v="photo"]'); await G.reload(); await G.waitForSelector('[data-g="mode"]', { timeout: 20000 });
  console.log('2 guest remembers:', await G.getAttribute('[data-g="mode"][data-v="photo"]', 'aria-pressed') === 'true' ? 'Photo' : 'Type');
  await G.screenshot({ path: require('os').tmpdir() + '/nf_guest_photo.png' });
  await H.evaluate(() => scrollTo(0, 0)); await H.screenshot({ path: require('os').tmpdir() + '/nf_host_top.png' });
  console.log('errors', errs); await b.close(); })().catch(e => { console.error('FAIL', e.message); process.exit(1); });
