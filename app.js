const $ = s => document.querySelector(s);
const KEY = 'domino-train-count';

const defaultState = () => ({ players: [], set: 15, rounds: 16, blank50: false, current: 0, scores: {} });
let state = load();
// Rounds run from the set's top double down to double-blank (15…0 = 16 rounds).
// Scores are keyed by round index; keep each one on the same engine double when the set changes.
function changeSet(newSet) {
  const shift = newSet - state.set, scores = {};
  Object.entries(state.scores).forEach(([k, v]) => {
    const [pid, r] = k.split(':'); const nr = +r + shift;
    if (nr >= 0 && nr <= newSet) scores[`${pid}:${nr}`] = v;
  });
  state.scores = scores; state.set = newSet; state.rounds = newSet + 1;
  state.current = Math.min(Math.max(0, state.current + shift), state.rounds - 1);
}
// Older saves defaulted to double-12 / 15 rounds; this game is double-15, 15 → 0.
if (!state.v3) { if (state.set !== 15) changeSet(15); state.rounds = 16; state.v3 = 1; }

function load() {
  try { return { ...defaultState(), ...JSON.parse(localStorage.getItem(KEY)) }; }
  catch { return defaultState(); }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
  render();
}

// Rounds run from the highest double down to double-blank.
const roundCount = () => state.rounds;
// Engine double for a round counts down from the set's highest double.
const roundDouble = i => (state.set - i >= 0 ? state.set - i : null);
const roundLabel = i => (roundDouble(i) === null ? `Round ${i + 1}` : `Double-${roundDouble(i)}`);
const score = (pid, r) => state.scores[`${pid}:${r}`];
const setScore = (pid, r, v) => {
  const k = `${pid}:${r}`;
  if (v === '' || v == null || isNaN(v)) delete state.scores[k]; else state.scores[k] = Math.max(0, Math.round(v));
};
const total = pid => Array.from({ length: roundCount() }, (_, r) => score(pid, r) || 0).reduce((a, b) => a + b, 0);
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- render ----------
function render() {
  $('#playerList').innerHTML = state.players.map(p =>
    `<li class="chip">${esc(p.name)}<button data-del="${p.id}" aria-label="Remove ${esc(p.name)}">✕</button></li>`).join('');

  const r = state.current;
  $('#roundTitle').textContent = roundLabel(r);
  $('#roundSub').textContent = `Round ${r + 1} of ${roundCount()}`;
  $('#prevRound').disabled = r === 0;
  $('#nextRound').disabled = r === roundCount() - 1;

  $('#roundPlayers').innerHTML = state.players.length ? state.players.map(p => `
    <div class="player-row">
      <div><div class="name">${esc(p.name)}</div><div class="muted small">Total ${total(p.id)}</div></div>
      <div class="actions">
        <button data-scan="${p.id}" title="Scan with camera">📷</button>
        <button class="ghost" data-tiles="${p.id}" title="Tap tiles">🁣</button>
        <input type="number" inputmode="numeric" min="0" data-score="${p.id}" value="${score(p.id, r) ?? ''}" placeholder="–">
      </div>
    </div>`).join('') : '<p class="muted">Add players to start.</p>';

  const leaderTotal = Math.min(...state.players.map(p => total(p.id)));
  const anyScore = Object.keys(state.scores).length > 0;
  const head = `<tr><th>Player</th>${Array.from({ length: roundCount() }, (_, i) =>
    `<th class="${i === r ? 'cur' : ''}" title="Round ${i + 1}">${roundDouble(i) ?? '–'}</th>`).join('')}<th>Total</th></tr>`;
  const rows = [...state.players].sort((a, b) => total(a.id) - total(b.id)).map(p => `
    <tr class="${anyScore && total(p.id) === leaderTotal ? 'leader' : ''}">
      <td>${esc(p.name)}</td>
      ${Array.from({ length: roundCount() }, (_, i) => `<td class="${i === r ? 'cur' : ''}">${score(p.id, i) ?? ''}</td>`).join('')}
      <td class="total">${total(p.id)}</td>
    </tr>`).join('');
  $('#board').innerHTML = head + rows;
}

// ---------- players & rounds ----------
$('#addPlayer').addEventListener('submit', e => {
  e.preventDefault();
  const name = $('#playerName').value.trim();
  if (!name) return;
  state.players.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name });
  $('#playerName').value = '';
  save();
});
// In-page confirm (native confirm() is blocked in some embeds).
function ask(msg) {
  return new Promise(resolve => {
    const dlg = $('#askDlg');
    $('#askMsg').textContent = msg;
    const done = v => { dlg.close(); resolve(v); };
    $('#askYes').onclick = () => done(true);
    $('#askNo').onclick = () => done(false);
    dlg.oncancel = () => resolve(false);
    dlg.showModal();
  });
}

$('#playerList').addEventListener('click', async e => {
  const id = e.target.dataset.del;
  if (!id) return;
  const p = state.players.find(p => p.id === id);
  if (!await ask(`Remove ${p.name}?`)) return;
  state.players = state.players.filter(p => p.id !== id);
  Object.keys(state.scores).forEach(k => k.startsWith(id + ':') && delete state.scores[k]);
  save();
});
$('#prevRound').onclick = () => { state.current = Math.max(0, state.current - 1); save(); };
$('#nextRound').onclick = () => { state.current = Math.min(roundCount() - 1, state.current + 1); save(); };
$('#roundPlayers').addEventListener('change', e => {
  const id = e.target.dataset.score;
  if (id) { setScore(id, state.current, e.target.value === '' ? '' : +e.target.value); save(); }
});
$('#roundPlayers').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (b?.dataset.scan) openScan(b.dataset.scan);
  if (b?.dataset.tiles) openTiles(b.dataset.tiles);
});
const playerName = id => state.players.find(p => p.id === id).name;

// ---------- dialogs ----------
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));

$('#settingsBtn').onclick = () => {
  $('#setSize').value = state.set;
  $('#roundsIn').value = state.rounds;
  $('#blank50').checked = state.blank50;
  $('#settingsDlg').showModal();
};
$('#setSize').onchange = e => {
  changeSet(+e.target.value);
  $('#roundsIn').value = state.rounds; save();
};
$('#roundsIn').onchange = e => {
  state.rounds = Math.min(30, Math.max(1, Math.round(+e.target.value) || 15));
  e.target.value = state.rounds;
  state.current = Math.min(state.current, state.rounds - 1);
  save();
};
$('#blank50').onchange = e => { state.blank50 = e.target.checked; save(); };
$('#newGame').onclick = async () => {
  if (!await ask('Start a new game? Scores reset, players stay.')) return;
  state.scores = {}; state.current = 0; save(); $('#settingsDlg').close();
};

// ---------- tile picker ----------
let tilePid, picked = [], half = null;
const tileValue = ([a, b]) => (a === 0 && b === 0 && state.blank50 ? 50 : a + b);
// Live working, one tile per segment: "5 + 1 | 0 + 3 = 9".
function mathLine(tiles) {
  if (!tiles.length) return '';
  const total = tiles.reduce((s, t) => s + tileValue(t), 0);
  const parts = tiles.map(t => (tileValue(t) === 50 ? '50' : `${t[0]} + ${t[1]}`));
  return `${parts.join(' | ')} = ${total}`;
}
function openTiles(pid, start = []) {
  tilePid = pid; picked = start.map(t => [...t]); half = null;
  $('#tileWho').textContent = playerName(pid);
  renderTiles();
  $('#tileDlg').showModal();
}
function renderTiles() {
  $('#halfGrid').innerHTML = Array.from({ length: state.set + 1 }, (_, n) =>
    `<button data-n="${n}" class="${half === n ? 'sel' : ''}">${n}</button>`).join('');
  $('#pickedTiles').innerHTML = picked.map((t, i) =>
    `<span class="chip tile-chip">${t[0]} + ${t[1]}<button data-rm="${i}">✕</button></span>`).join('')
    + (half !== null ? `<span class="chip tile-chip">${half} + ?</span>` : '');
  $('#tileTotal').textContent = picked.reduce((s, t) => s + tileValue(t), 0);
  $('#tileMath').textContent = mathLine(picked);
}
$('#halfGrid').addEventListener('click', e => {
  const n = e.target.dataset.n;
  if (n === undefined) return;
  if (half === null) half = +n; else { picked.push([half, +n]); half = null; }
  renderTiles();
});
$('#pickedTiles').addEventListener('click', e => {
  const i = e.target.dataset.rm;
  if (i !== undefined) { picked.splice(+i, 1); renderTiles(); }
});
$('#tileSave').onclick = () => {
  setScore(tilePid, state.current, +$('#tileTotal').textContent);
  $('#tileDlg').close(); save();
};

// ---------- camera scan ----------
// Two ways to read a photo: Claude reads printed numbers (when the page runs
// inside Claude), or the local pip counter counts dots.
let scanPid, scanImg = null, scanFile = null, pips = [];
let scanMode = 'dots', readTiles = [], readPos = [], readFixed = [], readCtl = null, sampleFn = null, sampleLimits = null;
const canvas = $('#scanCanvas'), ctx = canvas.getContext('2d');

// 'ok' | 'checking' | 'none' (not inside Claude) | 'no-images' | 'declined'
let readerState = 'checking';
const readerReady = (async () => {
  const s = window.claude?.use ? await window.claude.use('sample').catch(() => null) : null;
  sampleLimits = s && await s.limits().catch(() => null);
  if (sampleLimits?.images) sampleFn = s;
  readerState = sampleFn ? 'ok' : s ? 'no-images' : 'none';
})();
const READER_HELP = {
  none: 'Reading numbers works when this page is opened in Claude (claude.ai or the Claude app). Use Tap tiles for now.',
  'no-images': 'This Claude app view cannot send photos. Open the page at claude.ai in a browser, or use Tap tiles.',
  declined: 'Photo reading was not allowed. Reload the page and tap Allow when asked, or use Tap tiles.',
};

const readPrompt = () => `This photo shows Mexican Train dominoes left in a player's hand at the end of a round.
Read the two ends of every tile. Ends show printed numerals (often colored, 0 to ${Math.max(state.set, 12)}) or pip dots; a blank end is 0. A line across the middle splits each tile into its two ends.
Tiles and numerals are often rotated sideways or upside down. All numerals on one tile face the same way: find which way is up from unambiguous digits on that tile or nearby tiles (1, 2, 3, 4, 5, 7, two-digit numbers), then read 6 versus 9 with that orientation. An underline under a numeral marks its bottom.
Count each tile once. Ignore face-down tiles (plain backs with no dividing line), tiles in other players' areas far in the background, and anything that is not a domino. Skip a tile cut off by the photo edge if one of its ends cannot be seen.
For each tile also give its bounding box as fractions of the image width and height (0 to 1, from the top-left corner): box = [left, top, right, bottom]. The page draws these boxes on the photo.
Reply with only JSON like {"tiles": [{"ends": [3, 12], "box": [0.20, 0.40, 0.42, 0.70]}, {"ends": [0, 7], "box": [0.50, 0.38, 0.71, 0.66]}]}.`;
const SHEET_NOTE = `
The SECOND image is a reference sheet of tiles from this same set, each captioned underneath with its correct ends. Use it to learn how this set prints each number (font, colors, orientation marks), then read the tiles in the FIRST image only. Never list reference-sheet tiles in your answer; boxes refer to the first image.`;

// ---------- learned tiles ----------
// Confirmed tile crops from past scans, sent to Claude as a reference sheet
// so it learns how this particular set prints its numbers.
const EX_KEY = 'domino-train-examples', EX_MAX = 16;
let examples = [];
try { examples = JSON.parse(localStorage.getItem(EX_KEY)) || []; } catch {}
function saveExamplesStore() {
  try { localStorage.setItem(EX_KEY, JSON.stringify(examples)); }
  catch { examples = examples.slice(0, Math.max(0, examples.length - 4)); } // storage full: drop oldest
  renderExamples();
}
function cropTile(p) {
  const pad = 0.04;
  const l = Math.max(0, p.l - pad), t = Math.max(0, p.t - pad), r = Math.min(1, p.r + pad), b = Math.min(1, p.b + pad);
  const sx = l * canvas.width, sy = t * canvas.height, sw = (r - l) * canvas.width, sh = (b - t) * canvas.height;
  const k = Math.min(1, 160 / Math.max(sw, sh));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(sw * k)); c.height = Math.max(1, Math.round(sh * k));
  const src = document.createElement('canvas');
  src.width = scanImg.width; src.height = scanImg.height;
  src.getContext('2d').putImageData(scanImg, 0, 0);
  c.getContext('2d').drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.8);
}
function learnFromScan() {
  const fresh = readTiles.map((t, i) => (readPos[i] ? { img: cropTile(readPos[i]), ends: [...t], fixed: !!readFixed[i], at: Date.now() } : null)).filter(Boolean);
  if (!fresh.length) return;
  // Corrected tiles teach the most, so they're kept first; then newest.
  examples = [...fresh, ...examples].sort((a, b) => (b.fixed - a.fixed) || (b.at - a.at)).slice(0, EX_MAX);
  saveExamplesStore();
}
async function buildSheet() {
  if (!examples.length) return null;
  const imgs = await Promise.all(examples.map(e => new Promise(res => {
    const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = e.img;
  })));
  const cols = Math.min(4, examples.length), cell = 180, cap = 34;
  const c = document.createElement('canvas');
  c.width = cols * cell; c.height = Math.ceil(examples.length / cols) * (cell + cap);
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.font = '700 24px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  examples.forEach((e, i) => {
    const x = (i % cols) * cell, y = Math.floor(i / cols) * (cell + cap), im = imgs[i];
    if (im) {
      const k = Math.min((cell - 10) / im.width, (cell - 10) / im.height);
      g.drawImage(im, x + (cell - im.width * k) / 2, y + (cell - im.height * k) / 2, im.width * k, im.height * k);
    }
    g.fillStyle = '#000';
    g.fillText(`${e.ends[0]} + ${e.ends[1]}`, x + cell / 2, y + cell + cap / 2);
  });
  return new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
}
function renderExamples() {
  $('#exCount').textContent = examples.length ? `${examples.length} learned tile${examples.length > 1 ? 's' : ''}` : 'No learned tiles yet';
  $('#exGrid').innerHTML = examples.map((e, i) =>
    `<figure><img src="${e.img}" alt="Tile ${e.ends[0]} + ${e.ends[1]}"><figcaption>${e.ends[0]} + ${e.ends[1]}</figcaption><button data-ex="${i}" aria-label="Forget this tile">✕</button></figure>`).join('');
  $('#exClear').disabled = !examples.length;
}
$('#exGrid').addEventListener('click', e => {
  const i = e.target.dataset.ex;
  if (i !== undefined) { examples.splice(+i, 1); saveExamplesStore(); }
});
$('#exClear').onclick = async () => {
  if (!await ask('Forget all learned tiles?')) return;
  examples = []; saveExamplesStore();
};
renderExamples();

function openScan(pid) {
  scanPid = pid; scanImg = null; scanFile = null; pips = []; readTiles = []; readPos = []; readFixed = [];
  scanMode = 'read';
  $('#scanWho').textContent = playerName(pid);
  $('#scanArea').classList.add('hidden');
  $('#scanSave').disabled = true;
  $('#scanTotal').textContent = 0;
  $('#scanDlg').showModal();
}
$('#scanDlg').addEventListener('close', () => readCtl?.abort());

function onFile(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const img = new Image();
  img.onload = () => {
    const scale = Math.min(1, 900 / Math.max(img.width, img.height));
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    scanImg = ctx.getImageData(0, 0, canvas.width, canvas.height);
    scanFile = file;
    URL.revokeObjectURL(img.src);
    $('#scanArea').classList.remove('hidden');
    readerReady.then(runScan);
  };
  img.src = URL.createObjectURL(file);
}
$('#camInput').onchange = onFile;
$('#fileInput').onchange = onFile;
$('#sens').oninput = () => scanImg && runDetect();
$('#darkTiles').onchange = () => scanImg && runDetect();
$('#modeRead').onclick = () => { scanMode = 'read'; runScan(); };
$('#modeDots').onclick = () => { scanMode = 'dots'; runScan(); };
$('#readAgain').onclick = () => readWithClaude(true);
$('#readTap').onclick = () => { $('#scanDlg').close(); openTiles(scanPid); };
$('#readFix').onclick = () => { $('#scanDlg').close(); openTiles(scanPid, readTiles); };

function runScan() {
  $('#modeRead').classList.toggle('sel', scanMode === 'read');
  $('#modeDots').classList.toggle('sel', scanMode === 'dots');
  $('#readBox').classList.toggle('hidden', scanMode !== 'read');
  $('#dotBox').classList.toggle('hidden', scanMode !== 'dots');
  const canRead = readerState === 'ok';
  $('#readAgain').classList.toggle('hidden', !canRead);
  $('#readFix').classList.toggle('hidden', !canRead);
  $('#readTap').classList.toggle('hidden', canRead);
  if (scanMode === 'read' && !canRead) {
    readTiles = []; readPos = []; readFixed = [];
    renderRead(READER_HELP[readerState] || READER_HELP.none);
    $('#scanSave').disabled = true;
  } else if (scanMode === 'read') readWithClaude();
  else { readCtl?.abort(); $('#scanSave').disabled = false; runDetect(); }
}

function renderRead(status) {
  $('#readStatus').textContent = status;
  $('#readTiles').innerHTML = readTiles.map((t, i) =>
    `<span class="chip tile-chip${readFixed[i] ? ' fixed' : ''}"><button class="chip-edit" data-ed="${i}">${t[0]} + ${t[1]}</button><button data-rm="${i}" aria-label="Remove tile ${i + 1}">✕</button></span>`).join('');
  drawRead(status === 'Reading tiles…');
  $('#scanTotal').textContent = readTiles.reduce((s, t) => s + tileValue(t), 0);
  $('#readMath').textContent = mathLine(readTiles);
}
$('#readTiles').addEventListener('click', e => {
  const { rm, ed } = e.target.dataset;
  if (rm !== undefined) removeRead(+rm);
  if (ed !== undefined) openFix(+ed);
});
function removeRead(i) {
  readTiles.splice(i, 1); readPos.splice(i, 1); readFixed.splice(i, 1);
  renderRead($('#readStatus').textContent);
}

// Correct one tile in place; it keeps its spot on the photo and is learned on save.
let fixIdx = -1;
function openFix(i) {
  fixIdx = i;
  const opts = Array.from({ length: Math.max(state.set, 15) + 1 }, (_, n) => `<option value="${n}">${n}</option>`).join('');
  $('#fixA').innerHTML = opts; $('#fixB').innerHTML = opts;
  $('#fixA').value = readTiles[i][0]; $('#fixB').value = readTiles[i][1];
  $('#fixDlg').showModal();
}
$('#fixSave').onclick = () => {
  const t = [+$('#fixA').value, +$('#fixB').value];
  if (t[0] !== readTiles[fixIdx][0] || t[1] !== readTiles[fixIdx][1]) { readTiles[fixIdx] = t; readFixed[fixIdx] = true; }
  $('#fixDlg').close();
  renderRead($('#readStatus').textContent);
};
$('#fixRemove').onclick = () => { $('#fixDlg').close(); removeRead(fixIdx); };

// Label each tile on the photo with what was read, so it can be checked at a glance.
let labelBoxes = [];
function drawRead(busy) {
  if (!scanImg) return;
  ctx.putImageData(scanImg, 0, 0);
  labelBoxes = [];
  // ~15 CSS px on screen whatever the photo's size.
  const fs = Math.round(Math.max(canvas.width / 22, 15 * canvas.width / Math.max(1, canvas.clientWidth)));
  if (busy) {
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff'; ctx.font = `600 ${fs}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Reading tiles…', canvas.width / 2, canvas.height / 2);
    return;
  }
  readTiles.forEach((t, i) => {
    const p = readPos[i];
    if (!p) return;
    const bx = p.l * canvas.width, by = p.t * canvas.height;
    const bw = (p.r - p.l) * canvas.width, bh = (p.b - p.t) * canvas.height;
    ctx.strokeStyle = '#3ad18a'; ctx.lineWidth = Math.max(2, fs / 6);
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, fs / 3); ctx.stroke();
    // Label sits just above the tile (below if there's no room), never over its numbers.
    const label = `${t[0]} + ${t[1]}`;
    ctx.font = `700 ${fs}px system-ui, sans-serif`;
    const w = ctx.measureText(label).width + fs * 0.8, h = fs * 1.5;
    const x = Math.min(Math.max(bx + bw / 2 - w / 2, 2), canvas.width - w - 2);
    const hits = y => labelBoxes.some(o => x < o.x + o.w && x + w > o.x && y < o.y + o.h && y + h > o.y);
    let y = by - h - 4;
    while (y >= 2 && hits(y)) y -= h + 4; // stack above neighbours' labels
    if (y < 2) { y = by + bh + 4; while (hits(y)) y += h + 4; }
    y = Math.min(y, canvas.height - h - 2);
    ctx.fillStyle = 'rgba(15,40,28,.9)';
    ctx.beginPath(); ctx.roundRect(x, y, w, h, fs / 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + h / 2 + 1);
    labelBoxes.push({ i, x, y, w, h });
  });
}

const READ_ERRORS = {
  rate_limited: 'Too many reads right now. Wait a moment, then tap Read again.',
  session_expired: 'Sign in to Claude again, then tap Read again.',
  image_rejected: 'That photo could not be used. Try another photo.',
  refused: 'Claude could not read this photo. Try another photo.',
  invalid_json: 'The answer came back garbled. Tap Read again.',
};
async function readWithClaude(again = false) {
  readCtl?.abort();
  const ctl = readCtl = new AbortController();
  readTiles = []; readPos = []; readFixed = [];
  renderRead('Reading tiles…');
  $('#scanSave').disabled = true;
  try {
    const okType = sampleLimits.images.mediaTypes.includes(scanFile.type) && scanFile.size <= sampleLimits.images.maxInputBytes;
    const image = okType ? scanFile : await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.92));
    const sheet = sampleLimits.images.maxCount >= 2 ? await buildSheet() : null;
    const res = await sampleFn.json(readPrompt() + (sheet ? SHEET_NOTE : ''),
      { images: sheet ? [image, sheet] : [image], signal: ctl.signal, ...(again ? { cache: false } : {}) });
    const frac = v => (Number.isFinite(+v) ? Math.min(1, Math.max(0, +v)) : null);
    const items = (Array.isArray(res?.tiles) ? res.tiles : []).map(t => {
      const ends = Array.isArray(t) ? t : t?.ends;
      const b = Array.isArray(t?.box) ? t.box.map(frac) : [];
      const ok = b.length === 4 && b.every(v => v !== null) && b[2] > b[0] && b[3] > b[1];
      return { t: [Number(ends?.[0]), Number(ends?.[1])], p: ok ? { l: b[0], t: b[1], r: b[2], b: b[3] } : null };
    }).filter(o => o.t.every(n => Number.isInteger(n) && n >= 0 && n <= 20));
    readTiles = items.map(o => o.t); readPos = items.map(o => o.p); readFixed = items.map(() => false);
    renderRead(readTiles.length ? 'Check the labels. Tap a wrong one to correct it — the app learns your tiles when you use the score.' : 'No tiles found. Try a closer, brighter photo.');
    $('#scanSave').disabled = false;
  } catch (e) {
    if (e?.code === 'cancelled') return;
    if (['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed', 'images_unavailable'].includes(e?.code)) {
      sampleFn = null;
      readerState = ['not_granted', 'sampling_disabled'].includes(e.code) ? 'declined' : 'no-images';
      runScan(); return;
    }
    renderRead(READ_ERRORS[e?.code] || 'Could not read the photo. Tap Read again, or count dots.');
  }
}

function runDetect() {
  pips = detectPips(scanImg, { sensitivity: +$('#sens').value, darkTiles: $('#darkTiles').checked });
  drawScan();
}
function drawScan() {
  ctx.putImageData(scanImg, 0, 0);
  ctx.lineWidth = Math.max(2, canvas.width / 300);
  ctx.strokeStyle = '#ff2d2d';
  pips.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, p.r + ctx.lineWidth * 1.5, 0, Math.PI * 2); ctx.stroke(); });
  $('#scanTotal').textContent = pips.length;
}
canvas.addEventListener('click', e => {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * canvas.width / rect.width;
  const y = (e.clientY - rect.top) * canvas.height / rect.height;
  if (scanMode === 'read') {
    const hit = labelBoxes.find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
    if (hit) openFix(hit.i);
    return;
  }
  const tapR = Math.max(12, 14 * canvas.width / rect.width);
  const hit = pips.findIndex(p => Math.hypot(p.x - x, p.y - y) < Math.max(p.r * 1.5, tapR));
  if (hit >= 0) pips.splice(hit, 1);
  else {
    const r = pips.length ? pips.map(p => p.r).sort((a, b) => a - b)[pips.length >> 1] : canvas.width / 80;
    pips.push({ x, y, r });
  }
  drawScan();
});
$('#scanSave').onclick = () => {
  if (scanMode === 'read' && readerState === 'ok') learnFromScan();
  setScore(scanPid, state.current, +$('#scanTotal').textContent);
  $('#scanDlg').close(); save();
};

render();
