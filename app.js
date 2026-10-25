const $ = s => document.querySelector(s);
const KEY = 'domino-train-count';

const defaultState = () => ({ players: [], set: 12, blank50: false, current: 0, scores: {} });
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
const roundCount = () => state.set + 1;
const roundDouble = i => state.set - i;
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
  $('#roundTitle').textContent = `Round ${r + 1} of ${roundCount()}`;
  $('#roundSub').textContent = `Engine: double-${roundDouble(r)}`;
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
    `<th class="${i === r ? 'cur' : ''}">${roundDouble(i)}</th>`).join('')}<th>Total</th></tr>`;
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
$('#playerList').addEventListener('click', e => {
  const id = e.target.dataset.del;
  if (!id) return;
  const p = state.players.find(p => p.id === id);
  if (!confirm(`Remove ${p.name}?`)) return;
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
  $('#blank50').checked = state.blank50;
  $('#settingsDlg').showModal();
};
$('#setSize').onchange = e => {
  if (Object.keys(state.scores).length && !confirm('Changing the set clears all scores. Continue?')) {
    e.target.value = state.set; return;
  }
  state.set = +e.target.value; state.scores = {}; state.current = 0; save();
};
$('#blank50').onchange = e => { state.blank50 = e.target.checked; save(); };
$('#newGame').onclick = () => {
  if (!confirm('Start a new game? Scores reset, players stay.')) return;
  state.scores = {}; state.current = 0; save(); $('#settingsDlg').close();
};

// ---------- tile picker ----------
let tilePid, picked = [], half = null;
const tileValue = ([a, b]) => (a === 0 && b === 0 && state.blank50 ? 50 : a + b);
function openTiles(pid) {
  tilePid = pid; picked = []; half = null;
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
let scanPid, scanImg = null, pips = [];
const canvas = $('#scanCanvas'), ctx = canvas.getContext('2d');
function openScan(pid) {
  scanPid = pid; scanImg = null; pips = [];
  $('#scanWho').textContent = playerName(pid);
  $('#scanArea').classList.add('hidden');
  $('#scanSave').disabled = true;
  $('#scanTotal').textContent = 0;
  $('#scanDlg').showModal();
}
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
    URL.revokeObjectURL(img.src);
    $('#scanArea').classList.remove('hidden');
    $('#scanSave').disabled = false;
    runDetect();
  };
  img.src = URL.createObjectURL(file);
}
$('#camInput').onchange = onFile;
$('#fileInput').onchange = onFile;
$('#sens').oninput = () => scanImg && runDetect();
$('#darkTiles').onchange = () => scanImg && runDetect();

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
  setScore(scanPid, state.current, pips.length);
  $('#scanDlg').close(); save();
};

render();
