const $ = s => document.querySelector(s);
const KEY = 'domino-train-count';

const defaultState = () => ({ players: [], set: 15, rounds: 15, blank50: false, current: 0, scores: {} });
let state = load();

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
$('#setSize').onchange = e => { state.set = +e.target.value; save(); };
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
    `<span class="chip tile-chip">${t[0]}|${t[1]}<button data-rm="${i}">✕</button></span>`).join('')
    + (half !== null ? `<span class="chip tile-chip">${half}|?</span>` : '');
  $('#tileTotal').textContent = picked.reduce((s, t) => s + tileValue(t), 0);
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
let scanMode = 'dots', readTiles = [], readCtl = null, sampleFn = null, sampleLimits = null;
const canvas = $('#scanCanvas'), ctx = canvas.getContext('2d');

(async () => {
  const s = window.claude?.use ? await window.claude.use('sample').catch(() => null) : null;
  sampleLimits = s && await s.limits().catch(() => null);
  if (sampleLimits?.images) sampleFn = s;
})();

const readPrompt = () => `This photo shows Mexican Train dominoes left in a player's hand at the end of a round.
Read the two ends of every tile. Ends show printed numerals (often colored, 0 to ${Math.max(state.set, 12)}) or pip dots; a blank end is 0. A line across the middle splits each tile into its two ends.
Tiles and numerals are often rotated sideways or upside down. All numerals on one tile face the same way: find which way is up from unambiguous digits on that tile or nearby tiles (1, 2, 3, 4, 5, 7, two-digit numbers), then read 6 versus 9 with that orientation. An underline under a numeral marks its bottom.
Count each tile once; ignore anything that is not a domino.
Reply with only JSON like {"tiles": [[3, 12], [0, 7]]}.`;

function openScan(pid) {
  scanPid = pid; scanImg = null; scanFile = null; pips = []; readTiles = [];
  scanMode = sampleFn ? 'read' : 'dots';
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
    runScan();
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
$('#readFix').onclick = () => { $('#scanDlg').close(); openTiles(scanPid, readTiles); };

function runScan() {
  if (!sampleFn) scanMode = 'dots';
  $('#modeRow').classList.toggle('hidden', !sampleFn);
  $('#modeRead').classList.toggle('sel', scanMode === 'read');
  $('#modeDots').classList.toggle('sel', scanMode === 'dots');
  $('#readBox').classList.toggle('hidden', scanMode !== 'read');
  $('#dotBox').classList.toggle('hidden', scanMode !== 'dots');
  if (scanMode === 'read') { ctx.putImageData(scanImg, 0, 0); readWithClaude(); }
  else { readCtl?.abort(); $('#scanSave').disabled = false; runDetect(); }
}

function renderRead(status) {
  $('#readStatus').textContent = status;
  $('#readTiles').innerHTML = readTiles.map((t, i) =>
    `<span class="chip tile-chip">${t[0]}|${t[1]}<button data-rm="${i}" aria-label="Remove tile">✕</button></span>`).join('');
  $('#scanTotal').textContent = readTiles.reduce((s, t) => s + tileValue(t), 0);
}
$('#readTiles').addEventListener('click', e => {
  const i = e.target.dataset.rm;
  if (i !== undefined) { readTiles.splice(+i, 1); renderRead($('#readStatus').textContent); }
});

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
  readTiles = [];
  renderRead('Reading tiles…');
  $('#scanSave').disabled = true;
  try {
    const okType = sampleLimits.images.mediaTypes.includes(scanFile.type) && scanFile.size <= sampleLimits.images.maxInputBytes;
    const image = okType ? scanFile : await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.92));
    const res = await sampleFn.json(readPrompt(), { images: [image], signal: ctl.signal, ...(again ? { cache: false } : {}) });
    readTiles = (Array.isArray(res?.tiles) ? res.tiles : [])
      .map(t => [Number(t?.[0]), Number(t?.[1])])
      .filter(t => t.every(n => Number.isInteger(n) && n >= 0 && n <= 20));
    renderRead(readTiles.length ? 'Check the tiles below. Tap ✕ to drop one, or fix / add tiles.' : 'No tiles found. Try a closer, brighter photo.');
    $('#scanSave').disabled = false;
  } catch (e) {
    if (e?.code === 'cancelled') return;
    if (['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed', 'images_unavailable'].includes(e?.code)) {
      sampleFn = null; runScan(); return;
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
  if (scanMode !== 'dots') return;
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * canvas.width / rect.width;
  const y = (e.clientY - rect.top) * canvas.height / rect.height;
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
  setScore(scanPid, state.current, +$('#scanTotal').textContent);
  $('#scanDlg').close(); save();
};

render();
