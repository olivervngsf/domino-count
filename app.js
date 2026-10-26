const $ = s => document.querySelector(s);
const KEY = 'domino-train-count';

const defaultState = () => ({ players: [], set: 15, rounds: 15, blank50: false, current: 0, scores: {}, screen: 'setup', recent: [] });
let state = load();
// Rounds run from the set's top double down to double-1 (15…1 = 15 rounds).
// Scores are keyed by round index; keep each one on the same engine double when the set changes.
function changeSet(newSet) {
  const shift = newSet - state.set, scores = {};
  Object.entries(state.scores).forEach(([k, v]) => {
    const [pid, r] = k.split(':'); const nr = +r + shift;
    if (nr >= 0 && nr <= newSet) scores[`${pid}:${nr}`] = v;
  });
  const by = {};
  Object.keys(state.by || {}).forEach(k => { const [pid, r] = k.split(':'); const nr = +r + shift; if (nr >= 0 && nr <= newSet) by[`${pid}:${nr}`] = 1; });
  if (Number.isInteger(state.play)) state.play = Math.max(0, state.play + shift);
  state.scores = scores; state.by = by; state.set = newSet; state.rounds = newSet;
  state.current = Math.min(Math.max(0, state.current + shift), state.rounds - 1);
}
// Older saves defaulted to double-12 or 15 → 0; this game is double-15, 15 → 1.
if (!state.v4) { if (state.set !== 15) changeSet(15); state.rounds = 15; state.current = Math.min(state.current, 14); state.v4 = 1; }
// Saves from before the players screen existed: go straight to the game if one is under way.
if (!Number.isInteger(state.play)) state.play = state.current;
if (!state.v5) { state.screen = state.players.length >= 2 && Object.keys(state.scores).length ? 'game' : 'setup'; state.recent = state.recent || []; state.v5 = 1; }

// A brand-new game is already in the current format, so the upgrades above must not touch it.
function load() {
  const fresh = () => ({ ...defaultState(), v4: 1, v5: 1 });
  try { const saved = JSON.parse(localStorage.getItem(KEY)); return saved ? { ...defaultState(), ...saved } : fresh(); }
  catch { return fresh(); }
}
// Live play (live.js): on a guest's phone `state` is a copy of the host's game, so it is never saved here.
const isGuest = () => typeof live !== 'undefined' && live.guest;
function save() {
  if (!isGuest()) try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
  render();
  if ($('#boardDlg').open) renderBoard();
  if (typeof live !== 'undefined') live.sync();
}

const roundCount = () => state.rounds;
// Engine double for a round counts down from the set's highest double.
const roundDouble = i => (state.set - i >= 0 ? state.set - i : null);
const roundLabel = i => (roundDouble(i) === null ? `Round ${i + 1}` : `Double-${roundDouble(i)}`);
const score = (pid, r) => state.scores[`${pid}:${r}`];
// A guest's score goes to the host's phone. On the host, a score typed here clears the "from their phone" mark,
// Guests move to the next round only when the host does (Finish round, or the › arrow after a full round).
const setScore = (pid, r, v, fromGuest) => {
  if (isGuest()) return live.send(pid, r, v);
  const k = `${pid}:${r}`;
  if (v === '' || v == null || isNaN(v)) delete state.scores[k]; else state.scores[k] = Math.max(0, Math.round(v));
  if (!fromGuest && state.by) delete state.by[k];
};
const total = pid => Array.from({ length: roundCount() }, (_, r) => score(pid, r) || 0).reduce((a, b) => a + b, 0);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pad = n => (n < 10 ? '0' + n : '' + n);
const ord = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');

// ---------- icons ----------
const ICON = {
  cam: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  grip: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="6" r="1.7"/><circle cx="15" cy="6" r="1.7"/><circle cx="9" cy="12" r="1.7"/><circle cx="15" cy="12" r="1.7"/><circle cx="9" cy="18" r="1.7"/><circle cx="15" cy="18" r="1.7"/></svg>',
};

// Kept so older saves keep their colour; the prototype look shows no avatars.
const AVATAR_COLORS = ['#ff9500', '#007aff', '#af52de', '#ff2d55', '#32ade6', '#5856d6', '#ff3b30', '#34c759', '#a2845e', '#ffcc00'];
function nextColor() {
  const used = new Set(state.players.map(p => p.color));
  const free = AVATAR_COLORS.findIndex((_, i) => !used.has(i));
  return free >= 0 ? free : state.players.length % AVATAR_COLORS.length;
}
state.players.forEach(p => { if (p.color == null) p.color = nextColor(); });

// The round in play (the prototype's S.round). Rounds before it are saved and can be opened to fix.
const latest = () => Math.max(0, Math.min(roundCount() - 1, Number.isInteger(state.play) ? state.play : state.current));
const isPast = () => state.current < latest();
const played = pid => Array.from({ length: roundCount() }, (_, r) => score(pid, r)).filter(v => v != null);
// Standard competition ranking: ties share a rank.
// While playing, rank on finished rounds only (a half-scored round would put unscored players in the lead).
// Totals count saved rounds only (like the prototype's history); the round in play adds once it's finished.
const doneTotal = pid => Array.from({ length: latest() }, (_, r) => score(pid, r) || 0).reduce((a, b) => a + b, 0);
const anyDone = () => latest() > 0;
// Lowest total first; ties keep playing order. Places are 01, 02, 03… as in the prototype.
function standings(all = state.screen === 'over') {
  const list = state.players.map((p, i) => ({ p, i, total: all ? total(p.id) : doneTotal(p.id), played: played(p.id).length }))
    .sort((a, b) => a.total - b.total || a.i - b.i);
  list.forEach((o, i) => { o.rank = i + 1; });
  return list;
}
const anyScore = () => (state.screen === 'over' ? Object.keys(state.scores).length > 0 : anyDone());
const playerName = id => state.players.find(p => p.id === id)?.name || '';
const roundFull = r => state.players.length > 0 && state.players.every(p => score(p.id, r) != null);
const firstOpen = r => state.players.findIndex(p => score(p.id, r) == null);
const lastScoredRound = () => Object.keys(state.scores).reduce((m, k) => Math.max(m, +k.split(':')[1]), -1);
// Checked in on their own phone (live play).
const here = pid => typeof live !== 'undefined' && live.here(pid);
const PHONE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18h2"/></svg>';
const fromPhone = (pid, r) => (typeof live !== 'undefined' ? live.phone(pid, r) : '');
const totalBefore = pid => doneTotal(pid);

// ---------- render ----------
let editPlayers = false, editGame = false, landed = null;

function render() {
  $('#guestScreen').classList.toggle('hidden', !isGuest());
  if (isGuest()) {
    ['#setupScreen', '#gameScreen', '#overScreen', '#fab'].forEach(id => $(id).classList.add('hidden'));
    return live.render();
  }
  const scr = state.players.length < 2 && state.screen !== 'setup' ? 'setup' : state.screen;
  $('#setupScreen').classList.toggle('hidden', scr !== 'setup');
  $('#gameScreen').classList.toggle('hidden', scr !== 'game');
  $('#overScreen').classList.toggle('hidden', scr !== 'over');
  $('#fab').classList.toggle('hidden', scr !== 'game');
  if (scr === 'setup') renderSetup();
  if (scr === 'game') renderGame();
  if (scr === 'over') renderOver();
  landed = null;
  if (typeof live !== 'undefined') live.paint();
}

function editRows(ctx) {
  return state.players.map((p, i) => `
    <div class="erow${landed === i ? ' landed' : ''}">
      <button class="handle" type="button" data-drag="${i}" aria-label="Reorder ${esc(p.name)}: drag, or use arrow keys">${ICON.grip}</button>
      <span class="ord">${pad(i + 1)}</span>
      <label class="sr-only" for="nm-${ctx}-${i}">Name, player ${i + 1}</label>
      <input class="nmin" id="nm-${ctx}-${i}" data-rename="${p.id}" value="${esc(p.name)}" maxlength="20" autocomplete="off">
      ${ctx === 'setup' ? `<button class="sq clear" type="button" data-del="${p.id}" aria-label="Remove ${esc(p.name)}">${ICON.x}</button>` : ''}
    </div>`).join('');
}

function renderSetup() {
  const n = state.players.length;
  const names = new Set(state.players.map(p => p.name.toLowerCase()));
  const recent = (state.recent || []).filter(x => !names.has(x.toLowerCase()));
  $('#recentWrap').classList.toggle('hidden', !recent.length);
  $('#recentList').innerHTML = recent.map(x => `<button class="chip" type="button" data-recent="${esc(x)}">+ ${esc(x)}</button>`).join('');
  $('#reorderBtn').textContent = editPlayers ? 'Done' : 'Edit';
  $('#reorderBtn').setAttribute('aria-pressed', editPlayers);
  $('#reorderBtn').classList.toggle('hidden', !n);
  $('#orderHint').classList.toggle('hidden', !editPlayers);
  $('#playerList').innerHTML = !n ? '<p class="empty-note">No players yet. Add names above.</p>'
    : editPlayers ? editRows('setup')
    : state.players.map((p, i) => `<div class="prow"><span class="ord">${pad(i + 1)}</span><span class="nm">${esc(p.name)}</span>${here(p.id) ? `<span class="here">${PHONE_ICON}Here</span>` : ''}</div>`).join('');
  const going = Object.keys(state.scores).length > 0;
  $('#gameSub').textContent = going ? `Domino Train · game in progress` : 'Domino Train · new game';
  $('#startGame').disabled = n < 2;
  $('#startGame').textContent = n < 2 ? 'Add at least 2 players' : going ? `Back to the game · ${n} players →` : `Start game · ${n} players →`;
}

// Progress bar: saved rounds white, the round in play orange.
function segs() {
  const L = latest();
  return Array.from({ length: roundCount() }, (_, i) => `<i class="${i === L ? 'c' : i < L ? 'd' : ''}"></i>`).join('');
}

function nextLabel(r) {
  if (r >= roundCount() - 1) return 'Finish game →';
  const d = roundDouble(r + 1);
  return d === null ? `Next round · Round ${r + 2} →` : `Next round · Double‑${d} →`;
}
function finishLabel(r) {
  if (r >= roundCount() - 1) return 'Finish game →';
  const d = roundDouble(r + 1);
  return d === null ? `Finish round · next is Round ${r + 2} →` : `Finish round · next is Double‑${d} →`;
}

function renderGame() {
  const r = state.current, n = state.players.length, R = roundCount(), past = isPast(), L = latest();
  const full = roundFull(r), open = past ? -1 : firstOpen(r);
  const done = state.players.filter(p => score(p.id, r) != null).length;
  const back = `Back to Round ${pad(L + 1)} →`;

  // round header: ‹ opens saved rounds; › only steps back toward the round in play
  $('#roundCard').classList.toggle('past', past);
  $('#roundLbl').textContent = past ? 'Saved round' : 'Round';
  $('#roundNum').textContent = pad(r + 1);
  $('#roundOf').textContent = '/' + R;
  $('#roundTitle').textContent = roundDouble(r) ?? '—';
  $('#prevRound').disabled = r === 0;
  $('#nextRound').disabled = !past;

  // this round (dark card)
  $('#glanceLbl').textContent = past ? 'Fixing this round' : 'This round';
  $('#segs').innerHTML = segs(r);
  $('#roundSub').innerHTML = `<b class="cnt">${done} of ${n}</b> scored<span id="liveTxt"></span>`;
  $('#glanceCards').innerHTML = state.players.map((p, i) => {
    const v = score(p.id, r), has = v != null, next = i === open;
    return `<button class="rk ${has ? 'has' : 'todo'}${next ? ' next' : ''}" type="button" data-key="${p.id}" aria-label="${esc(p.name)}: ${has ? v + ' points this round. Change' : 'no score yet. Add score'}">
      <span class="rk-l"><span class="rk-n">${esc(p.name)}${past ? '' : fromPhone(p.id, r)}</span><em>Total ${totalBefore(p.id)}</em></span>
      <span class="rk-r">${has ? `<i class="ok-dot" aria-hidden="true">${ICON.check}</i><b>+${v}</b>` : ''}</span></button>`;
  }).join('');
  $('#glanceNext').classList.toggle('hidden', !past && !full);
  $('#glanceNext').classList.toggle('alt', past);
  $('#glanceNext').textContent = past ? back : nextLabel(r);

  // score this round / fix a saved round
  $('#scoreH').textContent = past ? `Fix round ${pad(r + 1)}` : 'Score this round';
  $('#scoreBlock').classList.toggle('hidden', !editGame);
  $('#glanceEdit').textContent = editGame ? 'Done' : 'Edit';
  $('#glanceEdit').setAttribute('aria-pressed', editGame);
  $('#editBtn').textContent = editGame ? 'Done' : 'Edit';
  $('#editBtn').setAttribute('aria-pressed', editGame);
  $('#rotateBtn').classList.toggle('hidden', !editGame);
  $('#finishRound').classList.toggle('hidden', editGame);
  $('#roundHint').textContent = editGame
    ? 'Drag ⋮⋮ to change who plays when. Tap a name to rename. Scores move with each player.'
    : past ? 'Saved scores. Tap a score to fix it. Totals update right away.'
    : `${done} of ${n} scored · ${state.players.map(p => p.name).join(' → ')}`;
  $('#roundPlayers').innerHTML = editGame ? editRows('game') : state.players.map((p, i) => {
    const v = score(p.id, r), on = i === open;
    return `<div class="srow${on ? ' on' : ''}">
      <button class="who" type="button" data-key="${p.id}"><span class="o">${pad(i + 1)}${on ? ' · up next' : ''}${past ? ' · saved' : ''}</span><span class="n">${esc(p.name)}${past ? '' : fromPhone(p.id, r)}</span>
        <span class="t">${totalBefore(p.id)} total ${v != null && !past ? `<b>+${v}</b>` : ''}</span></button>
      <button class="cam" type="button" data-scan="${p.id}" aria-label="Photo of ${esc(p.name)}'s tiles">${ICON.cam}</button>
      <button class="box${v == null ? ' empty' : ''}" type="button" data-key="${p.id}" aria-label="Type score for ${esc(p.name)}">${v ?? '00'}</button>
    </div>`;
  }).join('');
  $('#finishRound').classList.toggle('ink', past);
  $('#finishRound').disabled = !past && !full;
  $('#finishRound').textContent = past ? back : full ? finishLabel(r) : `Finish round · ${n - done} left`;

  // scoreboard: saved rounds + the round in play, lowest total on top
  renderTable($('#board'), L + 1, r, true);
  const list = standings();
  $('#boardHint').textContent = !anyScore() || n < 2 ? `Round 1: everyone starts at 0. Lowest total after ${R} rounds wins.`
    : `${list[0].p.name} leads by ${list[1].total - list[0].total}. ${list[1].p.name} is next closest.`;

  // floating standings
  $('#fabLead').innerHTML = anyScore() && list.length ? ` · <b>${esc(list[0].p.name)} ${list[0].total}</b>` : '';
}

// Box score, lowest total on top (as in the prototype). Tap a round to open it, a score to edit it.
function renderTable(el, cols, curR, live) {
  const list = standings(), rankOf = Object.fromEntries(list.map(o => [o.p.id, o]));
  const lead = anyScore();
  const tmpl = `minmax(96px,1fr) repeat(${cols},36px) 60px`, minw = 96 + cols * 36 + 60;
  const head = `<div class="tr th" style="grid-template-columns:${tmpl}"><span>PLAYER</span>${Array.from({ length: cols }, (_, i) =>
    `<span class="c${live && i === curR ? ' cur' : ''}">${live ? `<button class="colbtn" type="button" data-col="${i}" aria-label="Go to ${roundLabel(i)}">${roundDouble(i) ?? i + 1}</button>` : `<span>${roundDouble(i) ?? i + 1}</span>`}</span>`).join('')}<span style="text-align:right">TOTAL</span></div>`;
  const rows = list.map(({ p }) => {
    const o = rankOf[p.id], first = lead && o.rank === 1;
    const cells = Array.from({ length: cols }, (_, i) => {
      const v = score(p.id, i);
      return `<span class="c${live && i === curR ? ' cur' : ''}">${live ? `<button class="cellbtn" type="button" data-cell="${p.id}" data-r="${i}" aria-label="${esc(p.name)}, ${roundLabel(i)}">${v ?? '·'}</button>` : (v ?? '·')}</span>`;
    }).join('');
    return `<div class="tr" style="grid-template-columns:${tmpl}"><span class="pn${first ? ' lead' : ''}"><small>${pad(o.rank)}</small>${esc(p.name)}</span>${cells}<span class="tot${first ? ' lead' : ''}">${o.total}</span></div>`;
  }).join('');
  el.style.minWidth = minw + 'px';
  el.innerHTML = head + rows;
  if (live) {
    const cur = el.querySelector('.th .c.cur'), wrap = el.parentElement;
    if (cur) wrap.scrollLeft = Math.max(0, cur.offsetLeft - wrap.clientWidth / 2 + cur.offsetWidth / 2);
  }
}

function renderOver() {
  const list = standings(), R = roundCount();
  $("#overLbl").textContent = `Game over · ${R} round${R === 1 ? "" : "s"}`;
  const tied = list.filter(o => o.rank === 1);
  $('#overTitle').textContent = tied.length > 1 ? `${tied.map(o => o.p.name).join(' & ')} tie` : `${list[0]?.p.name || ''} wins`;
  $('#overList').innerHTML = list.map(o => `<div class="final"><span class="r">${pad(o.rank)}</span><span class="n">${esc(o.p.name)}</span><b${o.rank === 1 ? ' class="lead"' : ''}>${o.total}</b></div>`).join('');
  renderTable($('#overBoard'), R, -1, false);
  $('#overHint').textContent = list.length > 1 ? `${list[0].p.name} leads by ${list[1].total - list[0].total}. ${list[1].p.name} is next closest.` : '';
}

function renderBoard() {
  const list = standings(), lead = list[0]?.total ?? 0, r = state.current, any = anyScore();
  const last = latest() - 1;
  $('#boardLbl').textContent = `Round ${pad(latest() + 1)} of ${roundCount()} · lowest total on top`;
  $('#boardSegs').innerHTML = segs(latest());
  $('#standings').innerHTML = list.length ? list.map(o => {
    const gap = !any ? 'No rounds yet' : o.rank === 1 ? 'Leading' : `+${o.total - lead} behind`;
    const ls = last >= 0 && score(o.p.id, last) != null ? ` · last ${score(o.p.id, last)}` : '';
    const first = any && o.rank === 1;
    return `<button class="brow" type="button" data-player="${o.p.id}"><span class="r">${pad(o.rank)}</span><span class="n${first ? ' lead' : ''}">${esc(o.p.name)}</span><span class="g">${gap}${ls}</span><span class="t${first ? ' lead' : ''}">${o.total}</span></button>`;
  }).join('') : '<p class="empty-note">Add players to see the standings.</p>';
}

// ---------- navigation ----------
// Like the prototype: you can open any saved round, but only Finish round moves the game forward.
const goRound = i => { state.current = Math.max(0, Math.min(latest(), i)); editGame = false; save(); scrollTo({ top: 0, behavior: 'smooth' }); };
function advance() {
  if (isPast()) return goRound(latest());
  const r = state.current;
  if (!roundFull(r)) return;
  if (r >= roundCount() - 1) { state.screen = 'over'; save(); scrollTo({ top: 0 }); return; }
  state.play = r + 1;
  goRound(r + 1);
}
$('#prevRound').onclick = () => goRound(state.current - 1);
$('#nextRound').onclick = () => goRound(state.current + 1);
$('#glanceNext').onclick = advance;
$('#finishRound').onclick = advance;
$('#startGame').onclick = () => { if (state.players.length < 2) return; editPlayers = false; state.screen = 'game'; save(); scrollTo({ top: 0 }); };
$('#endBtn').onclick = () => { editGame = false; state.screen = 'setup'; save(); scrollTo({ top: 0 }); };
$('#backToGame').onclick = () => { state.screen = 'game'; save(); };
$('#overNew').onclick = async () => {
  if (!await ask('Start a new game? Scores reset, players stay.')) return;
  state.scores = {}; state.by = {}; state.play = 0; state.current = 0; state.screen = 'setup'; save(); scrollTo({ top: 0 });
};
$('#fab').onclick = () => openBoard();
$('#fullBoardBtn').onclick = () => openBoard();
function openBoard() { renderBoard(); $('#boardDlg').showModal(); }
$('#standings').addEventListener('click', e => {
  const b = e.target.closest('[data-player]');
  if (b) openPlayer(b.dataset.player);
});
$('#board').addEventListener('click', e => {
  const col = e.target.closest('[data-col]');
  if (col) return goRound(+col.dataset.col);
  const cell = e.target.closest('[data-cell]');
  if (cell) openKey(cell.dataset.cell, +cell.dataset.r, 'type');
});
$('#glanceCards').addEventListener('click', e => {
  const b = e.target.closest('[data-key]');
  if (b) openKey(b.dataset.key, state.current);
});

// ---------- players ----------
function addPlayer(name) {
  name = name.trim();
  if (!name) return;
  state.players.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, color: nextColor() });
  state.recent = [name, ...(state.recent || []).filter(x => x.toLowerCase() !== name.toLowerCase())].slice(0, 8);
  save();
}
$('#addPlayer').addEventListener('submit', e => {
  e.preventDefault();
  addPlayer($('#playerName').value);
  $('#playerName').value = '';
  $('#playerName').focus();
});
$('#recentList').addEventListener('click', e => {
  const b = e.target.closest('[data-recent]');
  if (b) addPlayer(b.dataset.recent);
});
$('#reorderBtn').onclick = () => { editPlayers = !editPlayers; render(); };
$('#editBtn').onclick = () => { editGame = !editGame; render(); };
$('#glanceEdit').onclick = () => { editGame = !editGame; render(); if (editGame) $('#scoreBlock').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
$('#rotateBtn').onclick = () => { if (state.players.length > 1) { state.players.push(state.players.shift()); save(); } };

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
  const id = e.target.closest('[data-del]')?.dataset.del;
  if (!id) return;
  const p = state.players.find(p => p.id === id);
  if (!await ask(`Remove ${p.name}?`)) return;
  state.players = state.players.filter(p => p.id !== id);
  Object.keys(state.scores).forEach(k => k.startsWith(id + ':') && delete state.scores[k]);
  save();
});
document.addEventListener('change', e => {
  const id = e.target.dataset?.rename;
  if (!id) return;
  const p = state.players.find(x => x.id === id), v = e.target.value.trim();
  if (p && v) { p.name = v; try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} }
  else if (p) e.target.value = p.name;
});
document.addEventListener('keydown', e => {
  if (e.target.dataset?.rename && e.key === 'Enter') { e.preventDefault(); e.target.blur(); return; }
  const h = e.target.closest?.('[data-drag]');
  if (!h || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
  e.preventDefault();
  const from = +h.dataset.drag, to = from + (e.key === 'ArrowUp' ? -1 : 1);
  if (to < 0 || to >= state.players.length) return;
  const list = h.closest('#playerList, #roundPlayers');
  moveTo(from, to);
  list.querySelector(`[data-drag="${to}"]`)?.focus();
});
function moveTo(from, to) {
  if (from === to) return;
  const [p] = state.players.splice(from, 1);
  state.players.splice(to, 0, p);
  landed = to;
  save();
}
// Drag a row's ⋮⋮ handle: the row lifts, the others slide out of the way.
document.addEventListener('pointerdown', e => {
  const h = e.target.closest('[data-drag]');
  if (!h) return;
  e.preventDefault();
  const row = h.closest('.erow'), rows = [...row.parentNode.querySelectorAll('.erow')];
  const from = rows.indexOf(row), hgt = row.getBoundingClientRect().height, y0 = e.clientY;
  let to = from;
  row.classList.add('dragging');
  try { h.setPointerCapture(e.pointerId); } catch {}
  const mv = ev => {
    const dy = Math.max(-from * hgt, Math.min((rows.length - 1 - from) * hgt, ev.clientY - y0));
    row.style.transform = `translateY(${dy}px)`;
    to = Math.round(from + dy / hgt);
    rows.forEach((r, k) => {
      if (r === row) return;
      const s = from < to && k > from && k <= to ? -hgt : from > to && k < from && k >= to ? hgt : 0;
      r.style.transform = s ? `translateY(${s}px)` : '';
    });
  };
  const up = () => {
    h.removeEventListener('pointermove', mv); h.removeEventListener('pointerup', up); h.removeEventListener('pointercancel', up);
    if (to === from) render(); else moveTo(from, to);
  };
  h.addEventListener('pointermove', mv); h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
});

// ---------- score rows ----------
$('#roundPlayers').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.scan) openKey(b.dataset.scan, state.current, 'photo');
  else if (b.dataset.key) openKey(b.dataset.key, state.current, 'type');
});

// ---------- score sheet (Photo / Type) ----------
let keyPid, keyR, typed = '', keyMode = 'type';
// Photo or Type: the last one used is remembered on this phone.
const MODE_KEY = 'domino-train-mode';
const lastMode = () => { try { return localStorage.getItem(MODE_KEY) === 'photo' ? 'photo' : 'type'; } catch { return 'type'; } };
const rememberMode = m => { try { localStorage.setItem(MODE_KEY, m); } catch {} };
function openKey(pid, r, mode = lastMode()) {
  keyPid = pid; keyR = r; keyMode = mode;
  const v = score(pid, r);
  typed = v != null ? String(v) : '';
  const i = state.players.findIndex(p => p.id === pid);
  $('#keyLbl').textContent = `${pad(i + 1)} · Round ${pad(r + 1)}${r !== state.current ? ' · fixing' : ''}`;
  $('#keyName').textContent = playerName(pid);
  $('#finderMsg').textContent = `Lay ${playerName(pid)}’s tiles face up`;
  renderKey();
  if (!$('#keyDlg').open) $('#keyDlg').showModal();
}
function renderKey() {
  const photo = keyMode === 'photo';
  $('#tabPhoto').setAttribute('aria-pressed', photo);
  $('#tabType').setAttribute('aria-pressed', !photo);
  $('#photoPane').classList.toggle('hidden', !photo);
  $('#typePane').classList.toggle('hidden', photo);
  $('#keyVal').textContent = typed === '' ? '00' : typed;
  $('#keyVal').classList.toggle('empty', typed === '');
  $('#keySave').disabled = false;
  $('#keySave').textContent = `Save ${typed === '' ? '0' : typed} for ${playerName(keyPid)} →`;
  $('#keyRemove').classList.toggle('hidden', score(keyPid, keyR) == null);
}
$('#tabPhoto').onclick = () => { keyMode = 'photo'; rememberMode('photo'); renderKey(); };
$('#tabType').onclick = () => { keyMode = 'type'; rememberMode('type'); renderKey(); };
$('#keypad').addEventListener('click', e => {
  const k = e.target.closest('[data-k]')?.dataset.k;
  if (k == null) return;
  if (k === 'clear') typed = '';
  else if (k === 'del') typed = typed.slice(0, -1);
  else if (typed.length < 3) typed = (typed === '0' ? '' : typed) + k;
  renderKey();
});
function commitKey(v) {
  setScore(keyPid, keyR, v);
  $('#keyDlg').close(); save(); refreshPlayer();
}
$('#keySave').onclick = () => commitKey(typed === '' ? 0 : +typed);
$('#keyOut').onclick = () => commitKey(0);
$('#keyRemove').onclick = () => commitKey('');
$('#keyTiles').onclick = () => { $('#keyDlg').close(); openTiles(keyPid, keyR); };

let detailPid = null;
function openPlayer(pid) {
  detailPid = pid;
  refreshPlayer();
  $('#playerDlg').showModal();
}
function refreshPlayer() {
  if (!detailPid) return;
  const p = state.players.find(x => x.id === detailPid);
  if (!p) return;
  const o = standings().find(x => x.p.id === p.id);
  const vals = played(p.id);
  const avg = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : '–';
  const best = vals.length ? Math.min(...vals) : '–';
  $('#pdName').textContent = p.name;
  $('#pdRank').textContent = vals.length ? `${ord(o.rank)} place of ${state.players.length}` : 'No rounds scored yet';
  $('#pdStats').innerHTML = [['Total', o.total], ['Place', vals.length ? o.rank : '–'], ['Average', avg], ['Best', best]]
    .map(([k, v]) => `<div class="stat"><b>${v}</b><span>${k}</span></div>`).join('');
  const max = Math.max(1, ...vals);
  $('#pdBars').innerHTML = Array.from({ length: roundCount() }, (_, i) => {
    const v = score(p.id, i);
    return `<button class="bar${v == null ? ' none' : ''}${i === state.current ? ' cur' : ''}" type="button" data-bar="${i}" aria-label="${roundLabel(i)}: ${v ?? 'no score'}">
      <i style="height:${v == null ? 0 : Math.max(3, (v / max) * 100)}%"></i><em>${v ?? ''}</em><small>${roundDouble(i) ?? i + 1}</small></button>`;
  }).join('');
}
$('#pdBars').addEventListener('click', e => {
  const b = e.target.closest('[data-bar]');
  if (b) openKey(detailPid, +b.dataset.bar, 'type');
});
$('#playerDlg').addEventListener('close', () => { detailPid = null; });

// ---------- dialogs ----------
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
// Tap outside a sheet closes it.
document.querySelectorAll('dialog.sheet').forEach(d => d.addEventListener('click', e => { if (e.target === d) { const r = d.getBoundingClientRect(); if (e.clientY < r.top) d.close(); } }));

function openSettings() {
  $('#setSize').value = state.set;
  $('#roundsIn').value = state.rounds;
  $('#blank50').checked = state.blank50;
  $('#settingsDlg').showModal();
}
$('#settingsBtn').onclick = openSettings;
$('#setupSettings').onclick = openSettings;
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
  state.scores = {}; state.by = {}; state.play = 0; state.current = 0; state.screen = 'setup'; save(); $('#settingsDlg').close(); scrollTo({ top: 0 });
};

// ---------- tile picker ----------
let tilePid, tileR = 0, picked = [], half = null;
const tileValue = ([a, b]) => (a === 0 && b === 0 && state.blank50 ? 50 : a + b);
// Live working, one tile per segment: "5 + 1 | 0 + 3 = 9".
function mathLine(tiles) {
  if (!tiles.length) return '';
  const total = tiles.reduce((s, t) => s + tileValue(t), 0);
  const parts = tiles.map(t => (tileValue(t) === 50 ? '50' : `${t[0]} + ${t[1]}`));
  return `${parts.join(' | ')} = ${total}`;
}
function openTiles(pid, r = state.current, start = []) {
  tilePid = pid; tileR = r; picked = start.map(t => [...t]); half = null;
  $('#tileWho').textContent = playerName(pid);
  renderTiles();
  $('#tileDlg').showModal();
}
function renderTiles() {
  $('#halfGrid').innerHTML = Array.from({ length: state.set + 1 }, (_, n) =>
    `<button type="button" data-n="${n}" class="${half === n ? 'sel' : ''}">${n}</button>`).join('');
  $('#pickedTiles').innerHTML = picked.map((t, i) =>
    `<span class="tchip">${t[0]} + ${t[1]}<button type="button" data-rm="${i}" aria-label="Remove tile ${t[0]} + ${t[1]}">✕</button></span>`).join('')
    + (half !== null ? `<span class="tchip q">${half} + ?</span>` : '');
  const tot = picked.reduce((s, t) => s + tileValue(t), 0);
  $('#tileTotal').textContent = tot;
  $('#tileMath').textContent = mathLine(picked) || 'No tiles yet';
  $('#tileSave').textContent = `Add ${tot} to ${playerName(tilePid)} →`;
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
  setScore(tilePid, tileR, +$('#tileTotal').textContent);
  $('#tileDlg').close(); save(); refreshPlayer();
};

// ---------- camera scan ----------
// Two ways to read a photo: Claude reads printed numbers (when the page runs
// inside Claude), or the local pip counter counts dots.
let scanPid, scanR = 0, scanImg = null, scanFile = null, pips = [];
let scanMode = 'dots', readTiles = [], readPos = [], readFixed = [], readSure = [], readOpen = -1, readBusy = false, readFailed = false, readCtl = null, sampleFn = null, sampleLimits = null;
const canvas = $('#scanCanvas'), ctx = canvas.getContext('2d');

// 'ok' | 'checking' | 'none' (not inside Claude) | 'no-images' | 'declined'
let readerState = 'checking';
// On the hosted site there is no built-in Claude, so the same request goes to our own
// /api/read function, which calls Claude with the site's API key. Same prompt, same answer shape.
const blobB64 = b => new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1]); fr.onerror = no; fr.readAsDataURL(b); });
const serverReader = {
  async json(prompt, { images, signal }) {
    const imgs = await Promise.all(images.map(async b => ({ type: b.type || 'image/jpeg', data: await blobB64(b) })));
    let r;
    try { r = await fetch('api/read', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt, images: imgs }), signal }); }
    catch (e) { throw Object.assign(new Error('network'), { code: e?.name === 'AbortError' ? 'cancelled' : 'network' }); }
    const j = await r.json().catch(() => null);
    if (!r.ok) throw Object.assign(new Error('read failed'), { code: j?.code || 'server_error' });
    return j;
  },
};
const SERVER_LIMITS = { images: { mediaTypes: ['image/jpeg', 'image/png', 'image/webp'], maxInputBytes: 2_200_000, maxCount: 2 } };
const readerReady = (async () => {
  const s = window.claude?.use ? await window.claude.use('sample').catch(() => null) : null;
  sampleLimits = s && await s.limits().catch(() => null);
  if (sampleLimits?.images) sampleFn = s;
  if (!s) {
    try {
      const j = await (await fetch('api/read', { cache: 'no-store' })).json();
      if (j?.ok) { sampleFn = serverReader; sampleLimits = SERVER_LIMITS; }
    } catch {}
  }
  readerState = sampleFn ? 'ok' : s ? 'no-images' : 'none';
})();
const READER_HELP = {
  none: 'Reading numbers works when this page is opened in Claude (claude.ai or the Claude app). Count dots, or pick tiles by hand.',
  'no-images': 'This Claude app view cannot send photos. Open the page at claude.ai in a browser, or pick tiles by hand.',
  declined: 'Photo reading was not allowed. Reload the page and tap Allow when asked, or pick tiles by hand.',
};

const readPrompt = () => `This photo shows Mexican Train dominoes left in a player's hand at the end of a round.
Read the two ends of every tile. Ends show printed numerals (often colored, 0 to ${Math.max(state.set, 12)}) or pip dots; a blank end is 0. A line across the middle splits each tile into its two ends.
Tiles and numerals are often rotated sideways or upside down. All numerals on one tile face the same way: find which way is up from unambiguous digits on that tile or nearby tiles (1, 2, 3, 4, 5, 7, two-digit numbers), then read 6 versus 9 with that orientation. An underline under a numeral marks its bottom.
Count each tile once. Ignore face-down tiles (plain backs with no dividing line), tiles in other players' areas far in the background, and anything that is not a domino. Skip a tile cut off by the photo edge if one of its ends cannot be seen.
For each tile also give its bounding box as fractions of the image width and height (0 to 1, from the top-left corner): box = [left, top, right, bottom]. The page draws these boxes on the photo.
Set "sure" to false for a tile when you are not confident about either end (6 versus 9, glare, blur, partly hidden); otherwise true. The player double-checks the unsure ones.
Reply with only JSON like {"tiles": [{"ends": [3, 12], "box": [0.20, 0.40, 0.42, 0.70], "sure": true}, {"ends": [0, 7], "box": [0.50, 0.38, 0.71, 0.66], "sure": false}]}.`;
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
  $('#exCount').textContent = examples.length ? `${examples.length} learned` : 'None yet';
  $('#exGrid').innerHTML = examples.map((e, i) =>
    `<figure><img src="${e.img}" alt="Tile ${e.ends[0]} + ${e.ends[1]}"><figcaption>${e.ends[0]} + ${e.ends[1]}</figcaption><button type="button" data-ex="${i}" aria-label="Forget this tile">✕</button></figure>`).join('');
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

function onFile(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  scanPid = keyPid; scanR = keyR; pips = []; readTiles = []; readPos = []; readFixed = []; readSure = []; readOpen = -1;
  scanMode = readerState === 'none' || readerState === 'no-images' || readerState === 'declined' ? 'dots' : 'read';
  const img = new Image();
  img.onload = () => {
    const scale = Math.min(1, 900 / Math.max(img.width, img.height));
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    scanImg = ctx.getImageData(0, 0, canvas.width, canvas.height);
    scanFile = file;
    URL.revokeObjectURL(img.src);
    const i = state.players.findIndex(p => p.id === scanPid);
    $('#scanWho').textContent = `${pad(i + 1)} · ${playerName(scanPid)} · Round ${pad(scanR + 1)}`;
    $('#scanArea').classList.remove('hidden');
    $('#keyDlg').close();
    $('#scanDlg').showModal();
    readerReady.then(runScan);
  };
  img.src = URL.createObjectURL(file);
}
$('#scanDlg').addEventListener('close', () => readCtl?.abort());
$('#camInput').onchange = onFile;
$('#fileInput').onchange = onFile;
$('#sens').oninput = () => scanImg && runDetect();
$('#darkTiles').onchange = () => scanImg && runDetect();
$('#modeRead').onclick = () => { scanMode = 'read'; runScan(); };
$('#modeDots').onclick = () => { scanMode = 'dots'; runScan(); };
$('#readAgain').onclick = () => readWithClaude(true);
$('#readTap').onclick = () => { $('#scanDlg').close(); openTiles(scanPid, scanR, readerState === 'ok' ? readTiles : []); };
const backToCamera = () => { $('#scanDlg').close(); openKey(scanPid, scanR, 'photo'); };
$('#scanBack').onclick = backToCamera;
$('#scanRetake').onclick = backToCamera;

function runScan() {
  $('#modeRead').setAttribute('aria-pressed', scanMode === 'read');
  $('#modeDots').setAttribute('aria-pressed', scanMode === 'dots');
  $('#readBox').classList.toggle('hidden', scanMode !== 'read');
  $('#dotBox').classList.toggle('hidden', scanMode !== 'dots');
  const canRead = readerState === 'ok';
  $('#readAgain').classList.toggle('hidden', !canRead);
  $('#readAdd').classList.toggle('hidden', !canRead);
  if (scanMode === 'read' && !canRead) { scanMode = 'dots'; return runScan(); }
  else if (scanMode === 'read') readWithClaude();
  else { readCtl?.abort(); readBusy = false; runDetect(); }
}

function scanFoot() {
  const name = playerName(scanPid), tot = +$('#scanTotal').textContent;
  const save = $('#scanSave');
  if (scanMode === 'dots') { save.disabled = false; save.textContent = `Add ${tot} to ${name} →`; return; }
  const q = readSure.filter(s => !s).length;
  if (readBusy || readerState !== 'ok' || (readFailed && !readTiles.length)) { save.disabled = true; save.textContent = readBusy ? 'Reading…' : 'Use score'; return; }
  save.disabled = q > 0;
  save.textContent = q ? `Check ${q} more first` : `Add ${tot} to ${name} →`;
}

function renderRead(status) {
  const q = readSure.filter(s => !s).length;
  $('#scanFound').textContent = readBusy ? 'Reading tiles…' : `${readTiles.length} tile${readTiles.length === 1 ? '' : 's'} found`;
  const flag = $('#readStatus');
  flag.textContent = readBusy ? '' : q ? `${q} to double‑check` : (status || (readTiles.length ? 'All checked ✓' : ''));
  flag.classList.toggle('ok', !q);
  $('#readTiles').innerHTML = readTiles.map((t, i) => {
    const sure = readSure[i] !== false, open = readOpen === i;
    return `<div class="trow"><button type="button" data-tog="${i}" aria-expanded="${open}"><span class="pin${sure ? '' : ' q'}">${i + 1}</span>
      <span class="eq">${t[0]} + ${t[1]}</span><span class="tag${sure ? '' : ' q'}">${sure ? 'OK' : 'Check'}</span><span class="s">${tileValue(t)}</span></button>
      ${open ? `<div class="editor"><div class="halves">
        <div class="half"><small>TOP</small><div><button class="step" type="button" data-adj="${i}" data-v="0-" aria-label="Top minus one">−</button><b>${t[0]}</b><button class="step" type="button" data-adj="${i}" data-v="0+" aria-label="Top plus one">+</button></div></div>
        <div class="half"><small>BOTTOM</small><div><button class="step" type="button" data-adj="${i}" data-v="1-" aria-label="Bottom minus one">−</button><b>${t[1]}</b><button class="step" type="button" data-adj="${i}" data-v="1+" aria-label="Bottom plus one">+</button></div></div></div>
        <div class="two"><button class="btn-line" type="button" data-notile="${i}">Not a tile</button><button class="btn-acc" type="button" data-ok="${i}">Looks right ✓</button></div></div>` : ''}</div>`;
  }).join('');
  drawRead(readBusy);
  $('#scanTotal').textContent = readTiles.reduce((s, t) => s + tileValue(t), 0);
  $('#readMath').textContent = mathLine(readTiles);
  scanFoot();
}
$('#readTiles').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  const d = b.dataset;
  if (d.tog !== undefined) readOpen = readOpen === +d.tog ? -1 : +d.tog;
  if (d.adj !== undefined) {
    const i = +d.adj, end = +d.v[0], dir = d.v[1] === '+' ? 1 : -1, max = Math.max(state.set, 15);
    readTiles[i][end] = Math.max(0, Math.min(max, readTiles[i][end] + dir));
    readFixed[i] = true;
  }
  if (d.ok !== undefined) { readSure[+d.ok] = true; readOpen = readSure.findIndex(s => s === false); }
  if (d.notile !== undefined) { const i = +d.notile; readTiles.splice(i, 1); readPos.splice(i, 1); readFixed.splice(i, 1); readSure.splice(i, 1); readOpen = -1; }
  renderRead();
});
$('#readAdd').onclick = () => {
  readTiles.push([0, 0]); readPos.push(null); readFixed.push(true); readSure.push(false);
  readOpen = readTiles.length - 1; renderRead();
};

// Number each tile on the photo; unsure ones are ringed in orange so they match the list.
let labelBoxes = [];
function drawRead(busy) {
  if (!scanImg) return;
  ctx.putImageData(scanImg, 0, 0);
  labelBoxes = [];
  const fs = Math.round(Math.max(canvas.width / 24, 13 * canvas.width / Math.max(1, canvas.clientWidth)));
  if (busy) {
    ctx.fillStyle = 'rgba(17,17,17,.5)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#F4F1EA'; ctx.font = `700 ${fs}px "Inter Tight", system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Reading tiles…', canvas.width / 2, canvas.height / 2);
    return;
  }
  readTiles.forEach((t, i) => {
    const p = readPos[i];
    if (!p) return;
    const sure = readSure[i] !== false;
    const bx = p.l * canvas.width, by = p.t * canvas.height, bw = (p.r - p.l) * canvas.width, bh = (p.b - p.t) * canvas.height;
    ctx.strokeStyle = sure ? '#F4F1EA' : '#D64A12'; ctx.lineWidth = Math.max(3, fs / 4);
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, fs / 3); ctx.stroke();
    // Numbered pin on the tile's top-left corner, like the list.
    const r = fs * 0.85, cx = Math.min(Math.max(bx + r * 0.6, r), canvas.width - r), cy = Math.min(Math.max(by + r * 0.6, r), canvas.height - r);
    ctx.fillStyle = sure ? '#111111' : '#D64A12';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FFFFFF'; ctx.font = `800 ${Math.round(fs * 0.95)}px "Inter Tight", system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), cx, cy + 1);
    labelBoxes.push({ i, x: bx, y: by, w: bw, h: bh });
  });
}

const READ_ERRORS = {
  rate_limited: 'Too many reads right now. Wait a moment, then tap Retake.',
  session_expired: 'Sign in to Claude again, then tap Retake.',
  image_rejected: 'That photo could not be used. Tap Retake and try another photo.',
  refused: 'The photo could not be read. Tap Retake and try another photo.',
  invalid_json: 'The answer came back garbled. Tap Retake.',
  network: 'No connection to the reader. Check your internet, then tap Retake.',
  server_error: 'The reader had a problem. Tap Retake to try again.',
};
async function readWithClaude(again = false) {
  readCtl?.abort();
  const ctl = readCtl = new AbortController();
  readTiles = []; readPos = []; readFixed = []; readSure = []; readOpen = -1; readBusy = true; readFailed = false;
  renderRead();
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
      return { t: [Number(ends?.[0]), Number(ends?.[1])], p: ok ? { l: b[0], t: b[1], r: b[2], b: b[3] } : null, s: t?.sure !== false };
    }).filter(o => o.t.every(n => Number.isInteger(n) && n >= 0 && n <= 20));
    readTiles = items.map(o => o.t); readPos = items.map(o => o.p); readFixed = items.map(() => false); readSure = items.map(o => o.s);
    readOpen = readSure.findIndex(s => !s);
    readBusy = false;
    renderRead(readTiles.length ? '' : 'No tiles found. Try a closer, brighter photo.');
  } catch (e) {
    if (e?.code === 'cancelled') return;
    readBusy = false; readFailed = true;
    if (['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed', 'images_unavailable', 'not_configured', 'forbidden'].includes(e?.code)) {
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
  ctx.strokeStyle = '#D64A12';
  pips.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, p.r + ctx.lineWidth * 1.5, 0, Math.PI * 2); ctx.stroke(); });
  $('#scanTotal').textContent = pips.length;
  $('#scanFound').textContent = `${pips.length} pip${pips.length === 1 ? '' : 's'} counted`;
  $('#readStatus').textContent = 'Tap the photo to fix any miss';
  $('#readStatus').classList.add('ok');
  scanFoot();
}
canvas.addEventListener('click', e => {
  const rect = canvas.getBoundingClientRect();
  // object-fit: contain — map the tap into the drawn image.
  const k = Math.min(rect.width / canvas.width, rect.height / canvas.height);
  const ox = (rect.width - canvas.width * k) / 2, oy = (rect.height - canvas.height * k) / 2;
  const x = (e.clientX - rect.left - ox) / k, y = (e.clientY - rect.top - oy) / k;
  if (scanMode === 'read') {
    const hit = labelBoxes.find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
    if (hit) { readOpen = hit.i; renderRead(); $('#readTiles').children[hit.i]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    return;
  }
  const tapR = Math.max(12, 14 / k);
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
  setScore(scanPid, scanR, +$('#scanTotal').textContent);
  $('#scanDlg').close(); save(); refreshPlayer();
};

render();
