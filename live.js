// Live play: guests join the host's phone with a 3-digit code and send their own scores.
// Free and serverless: phones talk directly (WebRTC via PeerJS). The host's phone holds the game;
// guests get a read-only copy of it and send one message per score.
const live = (() => {
  const PFX = 'dtrain-count-v1-', LS = 'domino-train-live';
  const store = {
    get() { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch { return {}; } },
    set(v) { try { localStorage.setItem(LS, JSON.stringify(v)); } catch {} },
  };
  const PHONE = '<svg class="ph" viewBox="0 0 24 24" role="img" aria-label="sent from their phone"><rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18h2"/></svg>';
  const can = () => typeof Peer !== 'undefined';
  const MAX = 12;
  const newCode = () => String(100 + Math.floor(Math.random() * 900));

  const L = {
    guest: false, code: '', status: 'off', // host: off | starting | on | error · guest: join | joining | in | reconnecting
    conns: [], peer: null, hostConn: null,
    // guest-only
    me: null, myName: '', pcode: '', perr: '', pnew: '', pnerr: '', joinName: '',
    pending: null, typed: '', mode: 'type', changing: false, lastAt: 0, notice: '',
  };

  // ---------- shared ----------
  const playRound = () => {
    if (!Object.keys(state.scores).length) return 0;
    const p = Number.isInteger(state.play) ? state.play : state.current;
    return Math.max(0, Math.min(roundCount() - 1, p));
  };
  function snapshot() {
    const { players, scores, set, rounds, blank50, screen, by } = state;
    return { players, scores, set, rounds, blank50, screen, by: by || {}, play: playRound(), at: Date.now() };
  }
  function makePeer(id) {
    try { return id ? new Peer(id, { debug: 0 }) : new Peer({ debug: 0 }); } catch { return null; }
  }

  // ---------- host ----------
  let lastSent = '';
  function sync() {
    if (L.guest || L.status !== 'on') return;
    const s = snapshot(), key = JSON.stringify({ ...s, at: 0 });
    if (key === lastSent) return;
    lastSent = key;
    L.conns.forEach(c => { if (c.open) try { c.send({ t: 'state', s }); } catch {} });
  }
  function startHost(tries = 0) {
    if (!can() || L.guest) { if (!can()) L.status = 'off'; return paint(); }
    const saved = store.get();
    L.code = saved.role === 'host' && saved.code ? saved.code : newCode();
    store.set({ role: 'host', code: L.code });
    L.status = 'starting'; paint();
    try { L.peer?.destroy(); } catch {}
    L.conns = [];
    const peer = L.peer = makePeer(PFX + L.code);
    if (!peer) { L.status = 'error'; return paint(); }
    peer.on('open', () => { L.status = 'on'; lastSent = ''; paint(); sync(); });
    peer.on('error', e => {
      if (peer !== L.peer) return;
      // Our code is still held by the last session for a few seconds after a reload: wait, then try again.
      // A code someone else holds after many tries: pick a new one.
      if (e?.type === 'unavailable-id') {
        if (tries === 12) store.set({ role: 'host', code: newCode() });
        if (tries < 20) setTimeout(() => startHost(tries + 1), 2000);
        else { L.status = 'error'; paint(); }
      } else if (['network', 'server-error', 'socket-error', 'socket-closed', 'browser-incompatible', 'ssl-unavailable'].includes(e?.type)) {
        L.status = 'error'; paint();
        setTimeout(() => { if (peer === L.peer && !L.guest) startHost(); }, 8000);
      }
    });
    peer.on('disconnected', () => { try { peer.reconnect(); } catch {} });
    peer.on('connection', c => {
      L.conns.push(c);
      c.on('open', () => { try { c.send({ t: 'state', s: snapshot() }); } catch {} paint(); });
      c.on('data', m => onGuestMsg(m));
      c.on('close', () => { L.conns = L.conns.filter(x => x !== c); paint(); });
      c.on('error', () => {});
    });
  }
  const applied = {};
  function onGuestMsg(m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'join' && typeof m.name === 'string') {
      const name = m.name.trim().slice(0, 20);
      if (!name || state.screen === 'over' || state.players.length >= MAX) { sync(); return; }
      if (state.players.some(p => p.name.toLowerCase() === name.toLowerCase())) { sync(); return; }
      state.players.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, color: nextColor() });
      save();
    }
    if (m.t === 'score') {
      const { pid, r, v, at } = m;
      const k = `${pid}:${r}`;
      if (!state.players.some(p => p.id === pid) || state.screen !== 'game' || r !== playRound()) return;
      if (!(v === '' || (Number.isInteger(v) && v >= 0 && v < 1000)) || typeof at !== 'number' || at <= (applied[k] || 0)) return;
      applied[k] = at;
      setScore(pid, r, v, true);
      state.by = state.by || {};
      if (v === '') delete state.by[k]; else state.by[k] = 1;
      save();
    }
  }
  async function share() {
    const url = location.href.split(/[?#]/)[0] + '?join=' + L.code;
    try {
      if (navigator.share) { await navigator.share({ title: 'Domino Train', text: `Join my Domino Train game. Code ${L.code}`, url }); return; }
      await navigator.clipboard.writeText(url);
      L.copied = true; paint(); setTimeout(() => { L.copied = false; paint(); }, 2000);
    } catch {}
  }

  // ---------- guest ----------
  function joinGame(code, rejoin) {
    if (!/^\d{3}$/.test(code)) { L.perr = 'Enter the 3-digit code from the host.'; return gpaint(); }
    if (!can()) { L.perr = 'Can’t connect from here. Check your internet, then reload.'; return gpaint(); }
    L.perr = ''; L.code = code; L.status = rejoin ? 'reconnecting' : 'joining'; gpaint();
    clearTimeout(L.joinTimer);
    L.joinTimer = setTimeout(() => {
      if (L.status === 'joining') { L.status = 'join'; L.perr = 'Can’t reach that game. Check the code, and keep the host’s phone open.'; gpaint(); }
    }, 10000);
    if (!L.peer || L.peer.destroyed) {
      const peer = L.peer = makePeer(null);
      if (!peer) { L.status = 'join'; L.perr = 'Can’t connect from here. Check your internet, then reload.'; return gpaint(); }
      peer.on('error', e => {
        if (e?.type !== 'peer-unavailable') return;
        if (L.status === 'joining') { clearTimeout(L.joinTimer); L.status = 'join'; L.perr = 'No game with that code is open. Check the code, and keep the host’s phone on.'; }
        else if (L.status === 'in') L.status = 'reconnecting';
        gpaint();
      });
      peer.on('disconnected', () => { try { peer.reconnect(); } catch {} });
    }
    const go = () => {
      const c = L.peer.connect(PFX + code, { reliable: true });
      L.hostConn = c;
      c.on('data', m => { if (m?.t === 'state' && c === L.hostConn) onState(m.s); });
      c.on('open', () => {
        clearTimeout(L.joinTimer);
        if (L.status !== 'in') { L.status = 'in'; L.perr = ''; }
        store.set({ role: 'guest', code, me: L.me, name: L.myName });
        flush(); gpaint();
      });
      c.on('close', () => { if (c === L.hostConn && L.status === 'in') { L.status = 'reconnecting'; gpaint(); } });
      c.on('error', () => {});
    };
    if (L.peer.open) go(); else L.peer.on('open', go);
  }
  function onState(s) {
    if (!s || !Array.isArray(s.players) || (s.at || 0) < L.lastAt) return;
    L.lastAt = s.at || 0;
    state = { ...defaultState(), ...s, current: s.play, v4: 1, v5: 1 };
    // Find me again by id, or by the name I asked to join with once the host has added it.
    if (L.me && !state.players.some(p => p.id === L.me)) L.me = null;
    if (!L.me && L.joinName) {
      const p = state.players.find(x => x.name.toLowerCase() === L.joinName.toLowerCase());
      if (p) { L.me = p.id; L.myName = p.name; L.joinName = ''; remember(); }
    }
    if (!L.me && L.joinName && state.players.length >= MAX) { L.joinName = ''; L.pnerr = `The game is full (${MAX} players). Ask the host to make room.`; }
    if (L.me) L.myName = playerName(L.me) || L.myName;
    const k = L.pending && `${L.pending.pid}:${L.pending.r}`;
    if (L.pending && (L.pending.r !== s.play || String(state.scores[k] ?? '') === String(L.pending.v))) L.pending = null;
    if (L.round !== s.play) {
      // New round: drop a half-done score for the old one so it can't be sent to the wrong round.
      if (L.round !== undefined) {
        const busy = [...document.querySelectorAll('#keyDlg[open], #scanDlg[open], #tileDlg[open]')];
        busy.forEach(d => d.close());
        if (busy.length) L.notice = `The host started round ${s.play + 1}. Add your score for this round.`;
      }
      L.round = s.play; L.changing = false; L.typed = '';
    }
    render();
  }
  const remember = () => store.set({ role: 'guest', code: L.code, me: L.me, name: L.myName });
  function send(pid, r, v) {
    if (r !== playRound()) { L.notice = `The host started round ${playRound() + 1}. Add your score for this round.`; return gpaint(); }
    L.notice = '';
    v = v === '' || v == null || isNaN(v) ? '' : Math.max(0, Math.round(v));
    L.pending = { pid, r, v, at: Date.now() };
    L.changing = false; L.typed = '';
    flush();
  }
  function flush() {
    const c = L.hostConn;
    if (!c?.open) return;
    try {
      if (L.joinName && !L.me) c.send({ t: 'join', name: L.joinName });
      if (L.pending) c.send({ t: 'score', ...L.pending });
    } catch {}
  }
  // Resend anything not yet confirmed, and reconnect if the host's phone dropped.
  setInterval(() => {
    if (!L.guest) return;
    if (L.status === 'in') flush();
    if (L.status === 'reconnecting' && L.peer?.open && !L.retrying) {
      L.retrying = true; setTimeout(() => { L.retrying = false; }, 3000);
      joinGame(L.code, true);
    }
  }, 1500);

  function enterGuest(code) {
    L.guest = true; L.status = 'join'; L.pcode = code || ''; L.perr = '';
    try { L.peer?.destroy(); } catch {}
    L.peer = null; L.conns = [];
    for (const d of document.querySelectorAll('dialog[open]')) d.close();
    render(); scrollTo({ top: 0 });
    if (code) joinGame(code);
  }
  function leave() {
    try { L.hostConn?.close(); } catch {}
    try { L.peer?.destroy(); } catch {}
    Object.assign(L, { guest: false, peer: null, hostConn: null, me: null, myName: '', joinName: '', pending: null, code: '', lastAt: 0, round: undefined });
    store.set({});
    for (const d of document.querySelectorAll('dialog[open]')) d.close();
    state = load();
    history.replaceState(null, '', location.pathname);
    render(); scrollTo({ top: 0 });
    startHost();
  }

  // ---------- guest screens (same look as the prototype's player phone) ----------
  const S = () => $('#guestScreen');
  function gpaint() { if (L.guest) render(); }
  function head() {
    const meChip = L.me ? `<span class="me"><i>${esc([...L.myName][0] || '?')}</i>${esc(L.myName)}</span>` : '';
    const leaveBtn = L.status === 'join' ? `<button class="chipbtn" type="button" data-g="back">Back</button>` : `<button class="chipbtn" type="button" data-g="leave">Leave</button>`;
    return `<div class="mehead"><span class="brand">Domino Train</span><span class="mehead-r">${leaveBtn}${meChip}</span></div>`
      + (L.status === 'reconnecting' ? `<p class="perr" role="status">Reconnecting to the host’s phone…</p>` : '');
  }
  const intro = (lbl, big, sub = '') => `<div class="intro"><span class="lbl">${lbl}</span><h1 class="big g">${big}</h1>${sub ? `<span class="sub">${sub}</span>` : ''}</div>`;
  function paintGuest() {
    const el = S();
    let h = head();
    if (L.status === 'join' || L.status === 'joining') {
      h += intro('You’re invited', 'Join the game', 'Enter the code the host shared with you.')
        + `<label for="pcode" class="sr-only">Game code</label><input id="pcode" class="pin-in" inputmode="numeric" maxlength="3" autocomplete="off" placeholder="···" value="${esc(L.pcode)}">`
        + (L.perr ? `<p class="perr" role="alert">${esc(L.perr)}</p>` : '')
        + `<button class="btn-ink tall" type="button" data-g="join"${L.status === 'joining' ? ' disabled' : ''}>${L.status === 'joining' ? 'Checking…' : 'Join'}</button>`;
    } else if (!L.me && L.joinName) {
      h += intro(`Joining as ${esc(L.joinName)}`, 'Adding you…', 'Your name shows up as soon as the host’s phone gets it.');
    } else if (!L.me) {
      h += intro('Code accepted ✓', 'Who are you?', 'Pick your name from the host’s list.')
        + `<div class="pick">${state.players.map(p => `<button type="button" data-g="pick" data-id="${p.id}">${esc(p.name)}</button>`).join('')}</div>`
        + `<div class="newme"><span class="lbl">Not on the list?</span>`
        + (state.screen === 'over' ? '<p class="ehint">This game has ended.</p>'
          : state.players.length >= MAX ? `<p class="ehint">The game is full (${MAX} players). Ask the host to make room.</p>`
          : `<div class="inrow"><label for="pnew" class="sr-only">Your name</label><input id="pnew" autocomplete="off" maxlength="20" placeholder="Type your name" value="${esc(L.pnew)}"><button class="btn-ink" type="button" data-g="newme">Join</button></div>`)
        + (L.pnerr ? `<p class="perr" role="alert">${esc(L.pnerr)}</p>` : '') + '</div>';
    } else if (state.screen === 'over') {
      const list = standings(true), mine = list.find(o => o.p.id === L.me), win = list.filter(o => o.rank === 1);
      h += `<span class="lbl">Game over</span><h1 class="big g acc">${esc(win.map(o => o.p.name).join(' & '))} ${win.length > 1 ? 'tie' : 'wins'}</h1>`
        + `<div class="sent"><span class="lbl">You finished</span><b>${ord(mine.rank)}</b><span class="sent-sub">${mine.total} points</span></div>`;
    } else if (state.screen !== 'game') {
      h += intro('You’re in', 'Waiting for the host to start')
        + `<div class="who-sent">${state.players.map(p => `<div><span>${esc(p.name)}${p.id === L.me ? ' (you)' : ''}</span></div>`).join('')}</div>`;
    } else {
      h += scoreScreen();
    }
    const old = document.activeElement?.id;
    el.innerHTML = h;
    if (old === 'pnew' || old === 'pcode') { const i = $('#' + old); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
  }
  function scoreScreen() {
    const r = playRound(), k = `${L.me}:${r}`, R = roundCount();
    const pend = L.pending && L.pending.r === r ? L.pending : null;
    let v = pend ? pend.v : score(L.me, r);
    const mini = `<div class="minihero"><div><span class="lbl">Round</span><span class="hn">${pad(r + 1)}<small>/${R}</small></span></div><div><span class="lbl">Double</span><span class="hn acc">${roundDouble(r) ?? '—'}</span></div></div>`;
    if (v != null && v !== '' && !L.changing) {
      const cnt = state.players.filter(p => score(p.id, r) != null).length;
      const note = pend ? 'Sending to the host…' : state.by?.[k] ? 'Sent to the host ✓' : 'Host added your score';
      return mini + `<div class="sent"><span class="ok">${ICON.check}</span><span class="lbl">${note}</span><b>+${esc(v)}</b>`
        + `<button class="btn-line slim dark" type="button" data-g="change">Change</button></div>`
        + `<div class="sentlist"><span class="lbl">${cnt} of ${state.players.length} sent</span><div class="who-sent">`
        + state.players.map(p => { const d = score(p.id, r) != null || (p.id === L.me && pend); return `<div><span>${esc(p.name)}${p.id === L.me ? ' (you)' : ''}</span><span class="s ${d ? 'y' : 'n'}">${d ? 'Sent' : 'Waiting'}</span></div>`; }).join('')
        + `</div><span class="fine">Other scores stay hidden until the next round starts.</span></div>`;
    }
    const photo = L.mode === 'photo';
    let h = mini + (L.notice ? `<p class="perr" role="alert">${esc(L.notice)}</p>` : '') + `<h1 class="big g s36">Your score</h1>`
      + `<div class="tabs" role="group" aria-label="How to add your score"><button type="button" data-g="mode" data-v="photo" aria-pressed="${photo}">Photo</button><button type="button" data-g="mode" data-v="type" aria-pressed="${!photo}">Type</button></div>`;
    if (photo) {
      h += `<div class="finder"><i></i><i></i><i></i><i></i><b>Lay your tiles face up</b><span>Then take one photo</span></div>`
        + `<button class="btn-ink tall" type="button" data-g="photo">Take photo</button>`;
    } else {
      const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => `<button type="button" data-g="key" data-v="${d}">${d}</button>`).join('')
        + `<button class="fn" type="button" data-g="key" data-v="clear">Clear</button><button type="button" data-g="key" data-v="0">0</button><button class="fn" type="button" data-g="key" data-v="del">Delete</button>`;
      h += `<div class="readout"><span class="v${L.typed === '' ? ' empty' : ''}">${L.typed === '' ? '00' : esc(L.typed)}</span><button class="dash" type="button" data-g="out">Went out · 0</button></div>`
        + `<div class="keys">${keys}</div>`
        + `<button class="btn-acc tall" type="button" data-g="send"${L.typed === '' ? ' disabled' : ''}>${L.typed === '' ? 'Type your points' : `Send ${esc(L.typed)} to the host →`}</button>`;
    }
    return h;
  }
  function addMe() {
    const n = L.pnew.trim();
    if (!n) { L.pnerr = 'Type your name first.'; return gpaint(); }
    const hit = state.players.find(p => p.name.toLowerCase() === n.toLowerCase());
    if (hit) { L.pnerr = `${hit.name} is already in the game. Tap your name above.`; return gpaint(); }
    L.joinName = n; L.pnew = ''; L.pnerr = ''; flush(); gpaint();
  }
  document.addEventListener('input', e => {
    if (e.target.id === 'pnew') L.pnew = e.target.value;
    if (e.target.id === 'pcode') { const c = e.target.value.replace(/\D/g, '').slice(0, 3); L.pcode = c; if (e.target.value !== c) e.target.value = c; }
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    if (e.target.id === 'pnew') { e.preventDefault(); addMe(); }
    if (e.target.id === 'pcode') { e.preventDefault(); joinGame(L.pcode); }
  });
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-g]');
    if (!b || !L.guest) return;
    const a = b.dataset.g, v = b.dataset.v, r = playRound();
    switch (a) {
      case 'back': leave(); return;
      case 'leave': ask('Leave this game? Your scores stay on the host’s phone.').then(ok => ok && leave()); return;
      case 'join': joinGame(L.pcode); return;
      case 'pick': L.me = b.dataset.id; L.myName = playerName(L.me); remember(); break;
      case 'newme': addMe(); return;
      case 'mode': L.mode = v; break;
      case 'key':
        if (v === 'clear') L.typed = ''; else if (v === 'del') L.typed = L.typed.slice(0, -1);
        else if (L.typed.length < 3) L.typed = (L.typed === '0' ? '' : L.typed) + v;
        break;
      case 'out': send(L.me, r, 0); break;
      case 'send': if (L.typed !== '') send(L.me, r, +L.typed); break;
      case 'change': L.changing = true; L.typed = String(score(L.me, r) ?? L.pending?.v ?? ''); L.mode = 'type'; break;
      case 'photo': keyPid = L.me; keyR = r; $('#camInput').click(); return;
    }
    gpaint();
  });

  // ---------- host screens: invite card + code chip ----------
  function paint() {
    if (L.guest) return;
    const on = L.status === 'on', n = L.conns.filter(c => c.open).length;
    const inv = $('#invite');
    if (inv) {
      inv.classList.toggle('hidden', L.status === 'off');
      $('.invite-note').classList.toggle('hidden', L.status === 'off');
      $('#inviteCode').textContent = on ? L.code : '···';
      $('#inviteNote').textContent = on ? (n ? `${n} phone${n === 1 ? '' : 's'} joined` : 'Guests add their own scores')
        : L.status === 'error' ? 'Live join is offline. Retrying…' : 'Starting…';
      $('#inviteShare').disabled = !on;
      $('#inviteShare').textContent = L.copied ? 'Copied ✓' : 'Share link';
    }
    const chip = $('#codeChip');
    if (chip) {
      chip.classList.toggle('hidden', !on);
      chip.innerHTML = `Code ${L.code}${n ? ` <i class="dot" aria-hidden="true"></i>` : ''}`;
      chip.setAttribute('aria-label', `Join code ${L.code}${n ? `, ${n} phone${n === 1 ? '' : 's'} joined` : ''}. Share`);
    }
  }
  $('#inviteShare')?.addEventListener('click', share);
  $('#codeChip')?.addEventListener('click', share);
  $('#joinOther')?.addEventListener('click', () => enterGuest(''));

  // ---------- start ----------
  function boot() {
    const q = new URLSearchParams(location.search).get('join');
    const saved = store.get();
    if (q && /^\d{3}$/.test(q) && !(saved.role === 'host' && saved.code === q)) {
      if (saved.role === 'guest' && saved.code === q) { L.me = saved.me || null; L.myName = saved.name || ''; }
      return enterGuest(q);
    }
    if (saved.role === 'guest' && saved.code) {
      L.me = saved.me || null; L.myName = saved.name || '';
      return enterGuest(saved.code);
    }
    startHost();
  }

  return {
    get guest() { return L.guest; },
    send, sync, paint, boot,
    render: paintGuest,
    phone: (pid, r) => (state.by?.[`${pid}:${r}`] ? PHONE : ''),
    playRound,
  };
})();
live.boot();
