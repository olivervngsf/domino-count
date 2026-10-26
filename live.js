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
    outbox: {}, typed: '', mode: (() => { try { return localStorage.getItem('domino-train-mode') === 'photo' ? 'photo' : 'type'; } catch { return 'type'; } })(), view: null, changing: false, lastAt: 0, notice: '', target: null, flash: null,
  };

  // ---------- shared ----------
  const playRound = () => {
    if (!Object.keys(state.scores).length) return 0;
    // Never ahead of the first round that isn't fully scored: a stray score in a later round can't pull guests forward.
    const p = Number.isInteger(state.play) ? state.play : state.current;
    let open = 0; while (open < roundCount() - 1 && roundFull(open)) open++;
    return Math.max(0, Math.min(roundCount() - 1, p, open));
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
      c.on('data', m => onGuestMsg(m, c));
      c.on('close', () => { L.conns = L.conns.filter(x => x !== c); if (c.pid) render(); else paint(); });
      c.on('error', () => {});
    });
  }
  const applied = {};
  function onGuestMsg(m, c) {
    if (!m || typeof m !== 'object') return;
    // A guest that hasn't got the game yet asks for it (the first message after connecting can be lost).
    if (m.t === 'hello') { try { c.send({ t: 'state', s: snapshot() }); } catch {} return; }
    // A guest says which player they are: the host shows them as checked in.
    if (m.t === 'me') { const pid = typeof m.pid === 'string' ? m.pid : null; if (c.pid !== pid) { c.pid = pid; render(); } return; }
    if (m.t === 'join' && typeof m.name === 'string') {
      const name = m.name.trim().slice(0, 20);
      if (!name || state.screen === 'over' || state.players.length >= MAX) { sync(); return; }
      if (state.players.some(p => p.name.toLowerCase() === name.toLowerCase())) { sync(); return; }
      state.players.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, color: nextColor() });
      save();
    }
    if (m.t === 'score') {
      const { pid, r, v, at } = m, from = m.from || pid;
      const k = `${pid}:${r}`, play = playRound(), own = pid === from, before = score(pid, r);
      const has = id => state.players.some(p => p.id === id);
      if (!has(pid) || !has(from) || state.screen !== 'game') return;
      if (!(v === '' || (Number.isInteger(v) && v >= 0 && v < 1000)) || typeof at !== 'number' || at <= (applied[k] || 0)) return;
      // In play: your own score, or someone's with no score yet (or one you sent for them).
      // Last round: only your own, only to fix it.
      const ok = r === play ? own || before == null || state.by?.[k] === from
        : r === play - 1 && own && before != null && v !== '';
      if (!ok) { sync(); return; }
      applied[k] = at;
      setScore(pid, r, v, true);
      state.by = state.by || {};
      if (v === '') delete state.by[k]; else state.by[k] = from;
      if (r !== play && before !== v) toast(`${playerName(from)} fixed round ${pad(r + 1)}: ${before} → ${v}`);
      else if (!own && v !== '' && before !== v) toast(`${playerName(from)} added ${v} for ${playerName(pid)}`);
      save();
    }
  }
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    if (!t) return;
    t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), 5000);
  }
  async function share() {
    // Invite links always open the website, so friends without the app can join from any phone.
    const url = (window.Capacitor?.isNativePlatform?.() ? 'https://domino-train.vercel.app/' : location.href.split(/[?#]/)[0]) + '?join=' + L.code;
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
        clearTimeout(L.joinTimer); L.toldMe = undefined;
        if (L.status !== 'in') { L.status = 'in'; L.perr = ''; }
        store.set({ role: 'guest', code, me: L.me, name: L.myName });
        // Keep the code in the address, so a reload goes straight back into this game.
        if (new URLSearchParams(location.search).get('join') !== code) history.replaceState(null, '', location.pathname + '?join=' + code);
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
      if (p) { L.me = p.id; L.myName = p.name; L.joinName = ''; remember(); flush(); }
    }
    if (!L.me && L.joinName && state.players.length >= MAX) { L.joinName = ''; L.pnerr = `The game is full (${MAX} players). Ask the host to make room.`; }
    if (L.me) L.myName = playerName(L.me) || L.myName;
    // Drop sent scores once the host has them, or once their round has passed.
    for (const [k, o] of Object.entries(L.outbox)) {
      const now = state.scores[k], stale = o.fix ? o.r !== s.play - 1 : o.r !== s.play;
      const taken = !o.fix && o.pid !== L.me && now != null && state.by?.[k] !== L.me;
      if (String(now ?? '') === String(o.v) || stale || taken) delete L.outbox[k];
      if (taken && String(now) !== String(o.v)) L.notice = `${playerName(o.pid)} already has a score this round.`;
    }
    // Scoring for someone who just sent their own: stop.
    if (L.target?.kind === 'other' && score(L.target.pid, s.play) != null && !L.outbox[`${L.target.pid}:${s.play}`]) {
      L.notice = `${playerName(L.target.pid)} just sent their own score.`; L.target = null; L.typed = '';
    }
    if (L.round !== s.play) {
      // New round: drop a half-done score for the old one so it can't be sent to the wrong round.
      if (L.round !== undefined) {
        const busy = [...document.querySelectorAll('#keyDlg[open], #scanDlg[open], #tileDlg[open]')];
        busy.forEach(d => d.close());
        if (busy.length) L.notice = `The host started round ${s.play + 1}. Add your score for this round.`;
      }
      L.round = s.play; L.changing = false; L.typed = ''; L.target = null; L.flash = null; L.view = null;
    }
    render();
  }
  const remember = () => store.set({ role: 'guest', code: L.code, me: L.me, name: L.myName });
  // `fix` is only true from the Fix button, so a stale photo for the old round can't pass as a fix.
  function send(pid, r, v, wantFix = false) {
    const play = playRound(), fix = wantFix && r === play - 1 && pid === L.me;
    if (r !== play && !fix) { L.notice = `The host started round ${play + 1}. Add your score for this round.`; L.target = null; return gpaint(); }
    L.notice = '';
    v = v === '' || v == null || isNaN(v) ? '' : Math.max(0, Math.round(v));
    const k = `${pid}:${r}`;
    L.outbox[k] = { pid, r, v, at: Date.now(), from: L.me, fix };
    L.flash = pid === L.me && !fix ? null : { k, pid, r, v, fix };
    L.changing = false; L.typed = ''; L.target = null;
    flush(); gpaint();
  }
  function flush() {
    const c = L.hostConn;
    if (!c?.open) return;
    try {
      if (!L.lastAt) c.send({ t: 'hello' });
      if (L.me !== L.toldMe) { c.send({ t: 'me', pid: L.me }); L.toldMe = L.me; }
      if (L.joinName && !L.me) c.send({ t: 'join', name: L.joinName });
      Object.values(L.outbox).forEach(o => c.send({ t: 'score', ...o }));
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
  // mode 'fresh' = Host a new game: empty players list and scores, a new join code (old names stay as Recent).
  function leave(mode) {
    try { L.hostConn?.close(); } catch {}
    try { L.peer?.destroy(); } catch {}
    Object.assign(L, { guest: false, peer: null, hostConn: null, me: null, myName: '', joinName: '', outbox: {}, target: null, flash: null, code: '', lastAt: 0, round: undefined });
    // Keep this phone's host code so guests already joined stay connected; a guest's link is dropped.
    const prev = store.get(); store.set(prev.role === 'host' && mode !== 'fresh' ? prev : {});
    for (const d of document.querySelectorAll('dialog[open]')) d.close();
    state = load();
    if (mode === 'fresh') {
      const recent = [...state.players.map(p => p.name), ...(state.recent || [])].filter((n, i, a) => a.findIndex(x => x.toLowerCase() === n.toLowerCase()) === i).slice(0, 8);
      Object.assign(state, { players: [], scores: {}, by: {}, play: 0, current: 0, screen: 'setup', recent });
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
    }
    history.replaceState(null, '', location.pathname);
    render(); scrollTo({ top: 0 });
    startHost();
  }

  // ---------- guest screens (same look as the prototype's player phone) ----------
  const S = () => $('#guestScreen');
  function gpaint() { if (L.guest) render(); }
  function head() {
    const meChip = L.me ? `<span class="me"><i>${esc([...L.myName][0] || '?')}</i>${esc(L.myName)}</span>` : '';
    const leaveBtn = L.status === 'join' || L.status === 'joining' ? '' : `<button class="chipbtn" type="button" data-g="leave">Leave</button>`;
    return `<div class="mehead"><span class="brand">Domino Train</span><span class="mehead-r">${leaveBtn}${meChip}</span></div>`
      + (L.status === 'reconnecting' ? `<p class="perr" role="status">Reconnecting to the host’s phone…</p>` : '');
  }
  const intro = (lbl, big, sub = '') => `<div class="intro"><span class="lbl">${lbl}</span><h1 class="big g">${big}</h1>${sub ? `<span class="sub">${sub}</span>` : ''}</div>`;
  function paintGuest() {
    const el = S();
    let h = head();
    if (L.status === 'join' || L.status === 'joining') {
      h += intro('You’re invited', 'Join the game', 'Enter the code the host shared with you.')
        + `<label for="pcode" class="sr-only">Game code</label><input id="pcode" name="game-code" class="pin-in" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="3" autocomplete="one-time-code" data-1p-ignore data-lpignore="true" placeholder="···" value="${esc(L.pcode)}">`
        + (L.perr ? `<p class="perr" role="alert">${esc(L.perr)}</p>` : '')
        + `<button class="btn-ink tall" type="button" data-g="join"${L.status === 'joining' ? ' disabled' : ''}>${L.status === 'joining' ? 'Checking…' : 'Join'}</button>`
        + `<div class="ordiv">or</div>`
        + (hasOwnGame() ? `<button class="btn-acc tall" type="button" data-g="host">Back to my game</button><button class="linkbtn center" type="button" data-g="fresh">Host a new game instead</button>`
          : `<button class="btn-acc tall" type="button" data-g="fresh">Host a new game</button>`);
    } else if (!L.lastAt) {
      h += intro('Code accepted ✓', 'Getting the game…', 'One moment while the host’s phone sends the players.');
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
  const mini = r => `<div class="minihero"><div><span class="lbl">Round</span><span class="hn">${pad(r + 1)}<small>/${roundCount()}</small></span></div><div><span class="lbl">Double</span><span class="hn acc">${roundDouble(r) ?? '—'}</span></div></div>`;
  // Guests can look back through saved rounds (‹ ›); Back to Round N returns to where the host is.
  const ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
  function nav(r, live) {
    const past = r < live;
    return `<div class="hero2 g${past ? ' past' : ''}"><button class="harr" type="button" data-g="gprev" aria-label="Previous round"${r === 0 ? ' disabled' : ''}>${ARROW}</button>`
      + `<div class="hc"><span class="lbl">${past ? 'Saved round' : 'Round'}</span><span class="hn">${pad(r + 1)}<small>/${roundCount()}</small></span></div>`
      + `<div class="hc hc2"><span class="lbl">Double</span><span class="hn acc">${roundDouble(r) ?? '—'}</span></div>`
      + `<button class="harr" type="button" data-g="gnext" aria-label="Next round"${past ? '' : ' disabled'}><span class="flip">${ARROW}</span></button></div>`;
  }
  function pastScreen(r, live) {
    const rows = state.players.map(p => { const v = score(p.id, r); return `<div${p.id === L.me ? ' class="mine"' : ''}><span>${esc(p.name)}${p.id === L.me ? ' (you)' : ''}</span><b>${v ?? '–'}</b></div>`; }).join('');
    const mine = score(L.me, r);
    return nav(r, live)
      + `<div class="sentlist"><span class="lbl">Saved scores · round ${pad(r + 1)}</span><div class="who-sent scores">${rows}</div></div>`
      + (r === live - 1 && mine != null ? `<button class="btn-line" type="button" data-g="fix">Fix my score · +${esc(mine)}</button>` : '')
      + `<button class="btn-ink tall" type="button" data-g="greset">Back to Round ${pad(live + 1)} →</button>`;
  }
  const sentVal = (pid, r) => { const o = L.outbox[`${pid}:${r}`]; return o ? o.v : score(pid, r); };
  // Players with no score yet this round (not me): a guest can score for them, e.g. someone without a phone.
  const others = r => state.players.filter(p => p.id !== L.me && sentVal(p.id, r) == null);
  function flashLine() {
    const f = L.flash;
    if (!f) return '';
    const sending = !!L.outbox[f.k];
    const txt = f.fix ? `Round ${pad(f.r + 1)} ${sending ? 'fix sending…' : 'fixed'}: you +${f.v}` : `+${f.v} for ${playerName(f.pid)} ${sending ? 'sending…' : 'sent'}`;
    return `<p class="gflash${sending ? '' : ' ok'}" role="status">${sending ? '' : ICON.check}${esc(txt)}</p>`;
  }
  function moreLinks(r) {
    const last = r > 0 ? sentVal(L.me, r - 1) : null, list = others(r);
    if (last == null && !list.length) return '';
    return `<div class="gmore">`
      + (last != null && last !== '' ? `<button class="gm" type="button" data-g="fix"><span><em>Last round · ${pad(r)}</em><b>You +${esc(last)}</b></span><span class="go">Fix</span></button>` : '')
      + (list.length ? `<button class="gm" type="button" data-g="others"><span><em>No phone? ${list.length} still to score</em><b>Score for someone else</b></span><span class="go">→</span></button>` : '')
      + `</div>`;
  }
  function entry({ pid, r, title, sub = '', photoOk = true, label, empty = 'Type the points' }) {
    const photo = photoOk && L.mode === 'photo';
    let h = `<div class="intro"><h1 class="big g s36">${title}</h1>${sub ? `<span class="sub">${sub}</span>` : ''}</div>`;
    if (photoOk) h += `<div class="tabs" role="group" aria-label="How to add the score"><button type="button" data-g="mode" data-v="photo" aria-pressed="${photo}">Photo</button><button type="button" data-g="mode" data-v="type" aria-pressed="${!photo}">Type</button></div>`;
    if (photo) {
      return h + `<button class="finder tap" type="button" data-g="photo"><i></i><i></i><i></i><i></i><b>Lay the tiles face up</b><span>Tap here to take the photo</span></button>`
        + `<button class="btn-ink tall" type="button" data-g="photo">Take photo</button>`;
    }
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => `<button type="button" data-g="key" data-v="${d}">${d}</button>`).join('')
      + `<button class="fn" type="button" data-g="key" data-v="clear">Clear</button><button type="button" data-g="key" data-v="0">0</button><button class="fn" type="button" data-g="key" data-v="del">Delete</button>`;
    return h + `<div class="readout"><span class="v${L.typed === '' ? ' empty' : ''}">${L.typed === '' ? '00' : esc(L.typed)}</span><button class="dash" type="button" data-g="out">Went out · 0</button></div>`
      + `<div class="keys">${keys}</div>`
      + `<button class="btn-acc tall" type="button" data-g="send"${L.typed === '' ? ' disabled' : ''}>${L.typed === '' ? empty : label(esc(L.typed))}</button>`;
  }
  const cancel = `<button class="btn-line" type="button" data-g="cancel">Cancel</button>`;
  function scoreScreen() {
    const r = playRound(), k = `${L.me}:${r}`, t = L.target;
    const notice = L.notice ? `<p class="perr" role="alert">${esc(L.notice)}</p>` : '';
    if (L.view != null && L.view < r && !t) return pastScreen(L.view, r);
    if (t?.kind === 'fix') {
      return mini(t.r) + notice + entry({ pid: L.me, r: t.r, title: `Fix round ${pad(t.r + 1)}`, sub: `You have +${esc(sentVal(L.me, t.r))}. Type the right points; the host sees the change.`, photoOk: false, label: v => `Save fix · +${v} →` }) + cancel;
    }
    if (t?.kind === 'pick') {
      return mini(r) + notice + `<div class="intro"><h1 class="big g s36">Score for…</h1><span class="sub">Players who haven’t sent a score this round.</span></div>`
        + `<div class="pick">${others(r).map(p => `<button type="button" data-g="other" data-id="${p.id}">${esc(p.name)}</button>`).join('')}</div>` + cancel;
    }
    if (t?.kind === 'other') {
      const n = esc(playerName(t.pid));
      return mini(r) + notice + entry({ pid: t.pid, r, title: `Score for ${n}`, sub: 'For a player without a phone. It goes to the host with their name.', label: v => `Send ${v} for ${n} →` }) + cancel;
    }
    const pend = L.outbox[k], v = sentVal(L.me, r);
    if (v != null && v !== '' && !L.changing) {
      const cnt = state.players.filter(p => sentVal(p.id, r) != null).length, by = state.by?.[k];
      const note = pend ? 'Sending to the host…' : by === L.me || by === 1 ? 'Sent to the host ✓' : by ? `${esc(playerName(by))} added your score` : 'Host added your score';
      return nav(r, r) + notice + flashLine() + `<div class="sent"><span class="ok">${ICON.check}</span><span class="lbl">${note}</span><b>+${esc(v)}</b>`
        + `<button class="btn-line slim dark" type="button" data-g="change">Change</button></div>`
        + `<div class="sentlist"><span class="lbl">${cnt} of ${state.players.length} sent</span><div class="who-sent">`
        + state.players.map(p => { const d = sentVal(p.id, r) != null; return `<div><span>${esc(p.name)}${p.id === L.me ? ' (you)' : ''}</span><span class="s ${d ? 'y' : 'n'}">${d ? 'Sent' : 'Waiting'}</span></div>`; }).join('')
        + `</div><span class="fine">Other scores stay hidden until the next round starts.</span></div>` + moreLinks(r);
    }
    return nav(r, r) + notice + flashLine() + entry({ pid: L.me, r, title: 'Your score', label: v => `Send ${v} to the host →`, empty: 'Type your points' }) + moreLinks(r);
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
  // Who and which round the keypad / photo is scoring right now.
  const tgt = () => {
    const t = L.target, r = playRound();
    return t?.kind === 'fix' ? { pid: L.me, r: t.r, fix: true } : t?.kind === 'other' ? { pid: t.pid, r } : { pid: L.me, r };
  };
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-g]');
    if (!b || !L.guest) return;
    const a = b.dataset.g, v = b.dataset.v, r = playRound();
    switch (a) {
      case 'host': leave(); return;
      case 'fresh':
        if (!hasOwnGame()) { leave('fresh'); return; }
        ask('Start a new game? The game saved on this phone will be cleared. Names stay under Recent players.').then(ok => ok && leave('fresh'));
        return;
      case 'leave': ask('Leave this game? Your scores stay on the host’s phone.').then(ok => ok && leave()); return;
      case 'join': joinGame(L.pcode); return;
      case 'pick': L.me = b.dataset.id; L.myName = playerName(L.me); remember(); flush(); break;
      case 'newme': addMe(); return;
      case 'mode': L.mode = v; try { localStorage.setItem('domino-train-mode', v); } catch {} break;
      case 'key':
        if (v === 'clear') L.typed = ''; else if (v === 'del') L.typed = L.typed.slice(0, -1);
        else if (L.typed.length < 3) L.typed = (L.typed === '0' ? '' : L.typed) + v;
        break;
      case 'out': { const t = tgt(); send(t.pid, t.r, 0, t.fix); return; }
      case 'send': if (L.typed !== '') { const t = tgt(); send(t.pid, t.r, +L.typed, t.fix); } return;
      case 'change': L.changing = true; L.typed = String(sentVal(L.me, r) ?? ''); L.mode = 'type'; L.flash = null; break;
      case 'photo': { const t = tgt(); keyPid = t.pid; keyR = t.r; $('#camInput').click(); return; }
      case 'fix': L.view = null; L.target = { kind: 'fix', r: r - 1 }; L.typed = String(sentVal(L.me, r - 1) ?? ''); L.notice = ''; L.flash = null; break;
      case 'others': L.target = { kind: 'pick' }; L.notice = ''; L.flash = null; break;
      case 'other': L.target = { kind: 'other', pid: b.dataset.id }; L.typed = ''; break;
      case 'gprev': L.view = Math.max(0, (L.view ?? r) - 1); L.target = null; break;
      case 'gnext': L.view = (L.view ?? r) + 1; if (L.view >= r) L.view = null; break;
      case 'greset': L.view = null; break;
      case 'cancel': L.target = null; L.typed = ''; L.notice = ''; break;
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
    // Like the prototype's "This round" card: how many phones are linked.
    const lt = $('#liveTxt');
    if (lt) lt.textContent = on ? ` · ${n} phone${n === 1 ? '' : 's'} connected` : '';
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
  // The app opens on Join / Host, unless a game is under way on this phone: then it goes straight back to it.
  // Anything saved on this phone (names added or scores in) counts as "my game".
  const hasOwnGame = () => {
    try { const g = JSON.parse(localStorage.getItem(KEY)) || {}; return (g.players || []).length > 0 || Object.keys(g.scores || {}).length > 0; }
    catch { return false; }
  };
  function boot() {
    const q = new URLSearchParams(location.search).get('join');
    const saved = store.get();
    if (q && /^\d{3}$/.test(q) && !(saved.role === 'host' && saved.code === q)) {
      if (saved.role === 'guest' && saved.code === q) { L.me = saved.me || null; L.myName = saved.name || ''; }
      return enterGuest(q);
    }
    if (q && saved.role === 'host' && saved.code === q) return startHost(); // the host opened their own share link
    // The plain link always opens on Join or Host: we don't know who is who.
    // A guest's last code is filled in, so Join puts them back as the same player.
    if (saved.role === 'guest' && saved.code) { L.me = saved.me || null; L.myName = saved.name || ''; }
    enterGuest('');
    if (saved.role === 'guest') L.pcode = saved.code || '';
    gpaint();
  }

  return {
    get guest() { return L.guest; },
    send, sync, paint, boot,
    render: paintGuest,
    here: pid => !L.guest && L.conns.some(c => c.open && c.pid === pid),
    phone: (pid, r) => (state.by?.[`${pid}:${r}`] ? PHONE : ''),
    playRound,
  };
})();
live.boot();
