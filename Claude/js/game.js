'use strict';
/* Lightloom game logic. Grid of knots joined by threads; the shuttle weaves
   a thread by running its full length, a square lights when all four of its
   threads are woven, moths hunt the shuttle along the same threads. */

(function () {
  const $ = id => document.getElementById(id);
  if (!GFX) { document.body.classList.add('nogl'); return; }

  /* ------------------------------------------------------------ data */
  const DYES = [
    { name: 'Indigo',    trace: [0.25, 0.80, 1.00], a: [0.10, 0.55, 1.00], b: [0.45, 0.25, 1.00], moth: [1.00, 0.22, 0.40], skyA: [0.04, 0.20, 0.50], skyB: [0.30, 0.06, 0.45], css: '#7ad9ff' },
    { name: 'Saffron',   trace: [1.00, 0.66, 0.16], a: [1.00, 0.50, 0.08], b: [1.00, 0.20, 0.25], moth: [0.50, 0.35, 1.00], skyA: [0.50, 0.20, 0.04], skyB: [0.32, 0.05, 0.30], css: '#ffc76e' },
    { name: 'Verdigris', trace: [0.30, 1.00, 0.70], a: [0.08, 0.90, 0.60], b: [0.10, 0.55, 0.95], moth: [1.00, 0.30, 0.70], skyA: [0.03, 0.36, 0.30], skyB: [0.05, 0.14, 0.45], css: '#86ffcf' },
    { name: 'Madder',    trace: [1.00, 0.36, 0.50], a: [1.00, 0.22, 0.40], b: [0.80, 0.25, 0.95], moth: [0.25, 0.90, 1.00], skyA: [0.48, 0.05, 0.18], skyB: [0.14, 0.10, 0.50], css: '#ff94ab' },
    { name: 'Orchil',    trace: [0.78, 0.52, 1.00], a: [0.62, 0.32, 1.00], b: [0.20, 0.50, 1.00], moth: [1.00, 0.55, 0.12], skyA: [0.24, 0.10, 0.55], skyB: [0.50, 0.14, 0.20], css: '#cfaaff' }
  ];
  const PAL_KEYS = ['trace', 'a', 'b', 'moth', 'skyA', 'skyB'];
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const SIZES = [[6, 4], [7, 4], [7, 5], [8, 5], [9, 5], [9, 6], [10, 6], [10, 7]];
  const PITCH = 0.98;
  const REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FXK = REDUCED ? 0.25 : 1;

  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
  const easeOutBack = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
  const fmt = n => Math.round(n).toLocaleString('de-CH');
  const store = { get() { try { return +localStorage.getItem('lightloom.best') || 0; } catch (e) { return 0; } }, set(v) { try { localStorage.setItem('lightloom.best', v); } catch (e) { } } };
  const prefs = { get(k) { try { return localStorage.getItem('lightloom.' + k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem('lightloom.' + k, v); } catch (e) { } } };
  const LATE = 0.3;        // a turn pressed this far (in threads) past a knot still takes that knot

  /* ------------------------------------------------------------ high scores */
  // The ten best runs in this browser, best first: { n: initials, s: score, w: weave reached, d: 'YYYY-MM-DD' }.
  const TOP = 10;
  const cleanName = v => (String(v || '').toLocaleUpperCase().match(/[\p{L}\p{N}]/gu) || []).slice(0, 3).join('');
  function loadScores() {              // stored data is read as untrusted: wrong shapes are dropped, the rest is normalised
    let a = null; try { a = JSON.parse(prefs.get('scores')); } catch (e) { }
    if (!Array.isArray(a)) a = [];
    a = a.filter(r => r && Number.isFinite(r.s) && r.s > 0)
      .map(r => ({ n: cleanName(r.n), s: Math.round(r.s), w: Number.isInteger(r.w) && r.w > 0 ? r.w : 0, d: /^\d{4}-\d\d-\d\d$/.test(r.d) ? r.d : '' }))
      .sort((x, y) => y.s - x.s).slice(0, TOP);
    if (!a.length && store.get() > 0) a.push({ n: '', s: store.get(), w: 0, d: '' });   // a best score from before the list existed
    return a;
  }
  const scores = loadScores();
  const saveScores = () => prefs.set('scores', JSON.stringify(scores));
  function addScore(s, w) {            // returns the new entry, or null when the score does not make the list
    if (s <= 0 || (scores.length >= TOP && s <= scores[TOP - 1].s)) return null;
    const now = new Date(), two = v => String(v).padStart(2, '0');
    const e = { n: cleanName(prefs.get('name')), s, w, d: `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}` };
    let i = scores.findIndex(r => r.s < s); if (i < 0) i = scores.length;       // an equal score ranks below the older one
    scores.splice(i, 0, e); scores.length = Math.min(scores.length, TOP); saveScores();
    return e;
  }
  let mine = null;                     // the list entry made by the game that just ended

  // The shared list lives on a small web service (see scores-worker/). With no address the game keeps
  // to this device, and the tabs for choosing a list stay hidden.
  const SHARED = 'https://lightloom-scores.iago-swi.workers.dev/';
  let view = SHARED && prefs.get('list') === 'shared' ? 'shared' : 'local';
  const shared = { state: 'idle', top: [], rank: 0, run: null, seq: 0, timer: 0 };   // state: idle, loading, ok or error
  const randomKey = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
  // Without a run this fetches the list. With one it sends the run first; the same key sent again only
  // changes the initials, so a retry or an edit never makes a second entry.
  function sharedLoad(run) {
    if (!SHARED) return;
    const seq = ++shared.seq, opt = AbortSignal.timeout ? { signal: AbortSignal.timeout(8000) } : {};
    if (run) { opt.method = 'POST'; opt.body = JSON.stringify({ k: run.k, n: run.n, s: run.s, w: run.w }); }   // a plain-text body needs no CORS preflight
    if (!shared.top.length) shared.state = 'loading';
    fetch(SHARED + '?game=lightloom', opt)
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(d => {
        if (seq !== shared.seq) return;                // a newer request is on its way
        shared.top = (Array.isArray(d.top) ? d.top : []).slice(0, TOP).filter(r => r && Number.isFinite(r.s))
          .map(r => ({ n: cleanName(r.n), s: Math.round(r.s), w: Number.isInteger(r.w) && r.w > 0 ? r.w : 0, d: /^\d{4}-\d\d-\d\d$/.test(r.d) ? r.d : '', me: r.me === true }));
        shared.rank = Number.isInteger(d.rank) ? d.rank : 0; shared.state = 'ok';
      })
      .catch(() => { if (seq === shared.seq) shared.state = 'error'; })
      .then(refreshLists);
  }

  const G = {
    state: 'title', paused: false, level: 1, score: 0, lives: 3, best: Math.max(store.get(), scores.length ? scores[0].s : 0),
    cols: 7, rows: 5, H: [], V: [], C: [], captured: 0,
    p: null, moths: [], cfg: null, want: [0, 0],
    ctrl: prefs.get('controls') === 'first' ? 'first' : 'third', turn: 0, turnAt: 0,   // first person: queued left (-1) or right (1) turn
    pax: false, practiced: false,
    t: 0, stateT: 0, buildT: 0, levelTime: 0, combo: 0, comboT: 0,
    dye: 0, pal: {}, palFrom: {}, palTo: DYES[0], palT: 1,
    shake: 0, chroma: 0, glitch: 0, flash: 0, fade: 0, fwT: 0
  };
  for (const k of PAL_KEYS) { G.pal[k] = DYES[0][k].slice(); G.palFrom[k] = DYES[0][k].slice(); }

  let light = new Uint8Array(4);
  const fit = { d: 12, z: 0 };
  const boxes = new Float32Array(GFX.BOX_F * GFX.MAX_BOX), bills = new Float32Array(GFX.BILL_F * GFX.MAX_BILL);
  const shockU = new Float32Array(16);
  let nBox = 0, nBill = 0;
  const parts = [], rings = [], shocks = [], dust = [];

  const wx = i => i - G.cols / 2, wz = j => j - G.rows / 2;

  /* ------------------------------------------------------------ DOM */
  const el = {
    hud: $('hud'), score: $('score'), best: $('best'), weaveN: $('weaveN'), weaveName: $('weaveName'), prog: $('prog'), sparks: $('sparks'),
    chain: $('chain'), chainN: $('chainN'), banner: $('banner'), b1: $('b1'), b2: $('b2'), pops: $('pops'),
    title: $('title'), tBest: $('tBest'), pause: $('pause'), over: $('over'), overLine: $('overLine'), overBest: $('overBest'), mute: $('mute'),
    overList: $('overList'), overNote: $('overNote'), nameRow: $('nameRow'), initials: $('initials'),
    scores: $('scores'), scoreList: $('scoreList'), scoreNote: $('scoreNote')
  };
  // Fills a list element with the list on view. Text goes in through textContent only, so a stored or
  // downloaded name can never become markup.
  function drawList(ol, note) {
    const sh = view === 'shared', rows = sh ? shared.top : scores;
    ol.textContent = '';
    rows.forEach((r, i) => {
      const li = document.createElement('li');
      const cell = (cls, text) => { const s = document.createElement('span'); s.className = cls; s.textContent = text; li.appendChild(s); };
      if (sh ? r.me : r === mine) li.className = 'mine';
      cell('rank', i + 1); cell('name', r.n || '—'); cell('pts', fmt(r.s));
      cell('wv', r.w ? 'Weave ' + r.w : ''); cell('day', r.d ? r.d.split('-').reverse().join('.') : '');
      ol.appendChild(li);
    });
    let text = '';
    if (!sh) text = rows.length ? '' : 'No scores yet.';
    else if (shared.state === 'loading') text = 'Fetching the shared list…';
    else if (shared.state === 'error') text = 'The shared list cannot be reached right now.' + (shared.run && mine ? ' Your score is kept on this device.' : '');
    else if (!rows.length) text = 'No scores yet.';
    else if (shared.run && shared.rank > rows.length) text = `Your score is number ${fmt(shared.rank)} on the shared list.`;
    note.textContent = text; note.hidden = !text;
  }
  const scoresOpen = () => el.scores.classList.contains('show');
  function refreshLists() {
    if (el.over.classList.contains('show')) drawList(el.overList, el.overNote);
    if (scoresOpen()) drawList(el.scoreList, el.scoreNote);
  }
  function setView(v) {
    view = v === 'shared' && SHARED ? 'shared' : 'local'; prefs.set('list', view);
    for (const b of document.querySelectorAll('.tabs button')) b.setAttribute('aria-pressed', b.dataset.list === view ? 'true' : 'false');
    if (view === 'shared' && shared.state === 'idle') sharedLoad();
    refreshLists();
  }
  function openScores() {
    if (view === 'shared') sharedLoad();
    el.scores.classList.add('show'); el.title.inert = true; refreshLists();
    setTimeout(() => $('backBtn').focus(), 50);
  }
  function closeScores() { el.scores.classList.remove('show'); el.title.inert = false; $('scoresBtn').focus(); }
  let bannerTimer = 0;
  function banner(big, small, dur) {
    el.b1.textContent = big; el.b2.textContent = small || '';
    el.banner.classList.remove('show'); void el.banner.offsetWidth; el.banner.classList.add('show');
    clearTimeout(bannerTimer); bannerTimer = setTimeout(() => el.banner.classList.remove('show'), dur * 1000);
  }
  function pop(text, X, Y, Z, big) {
    if (G.state === 'title') return;
    const [u, v] = GFX.project(X, Y, Z);
    const d = document.createElement('div'); d.className = 'pop' + (big ? ' big' : ''); d.textContent = text;
    d.style.left = (u * innerWidth) + 'px'; d.style.top = ((1 - v) * innerHeight) + 'px';
    el.pops.appendChild(d); d.addEventListener('animationend', () => d.remove());
  }
  function hudScore() { el.score.textContent = fmt(G.score); if (G.score > G.best && !G.practiced) el.best.textContent = fmt(G.score); }
  function hudLives() { el.sparks.innerHTML = ''; for (let i = 0; i < G.lives; i++) el.sparks.appendChild(document.createElement('i')); el.sparks.setAttribute('aria-label', G.lives + ' sparks left'); }
  function hudProg() { el.prog.style.width = (100 * G.captured / (G.cols * G.rows)) + '%'; }
  function hudLevel() { el.weaveN.textContent = 'Weave ' + G.level; el.weaveName.textContent = DYES[G.dye].name; }
  function setDye(i) {
    G.dye = i; for (const k of PAL_KEYS) G.palFrom[k] = G.pal[k].slice();
    G.palTo = DYES[i]; G.palT = 0; document.documentElement.style.setProperty('--dye', DYES[i].css);
  }

  /* ------------------------------------------------------------ board */
  function newBoard(cols, rows) {
    if (GFX.aspect() < 0.8) [cols, rows] = [rows, cols];
    G.cols = cols; G.rows = rows; G.captured = 0;
    G.H = []; for (let j = 0; j <= rows; j++) { const r = []; for (let i = 0; i < cols; i++) r.push({ on: false, flash: 0 }); G.H.push(r); }
    G.V = []; for (let j = 0; j < rows; j++) { const r = []; for (let i = 0; i <= cols; i++) r.push({ on: false, flash: 0 }); G.V.push(r); }
    G.C = []; for (let j = 0; j < rows; j++) { const r = []; for (let i = 0; i < cols; i++) r.push({ on: false, t: 0, flash: 0, sides: 0 }); G.C.push(r); }
    light = new Uint8Array(cols * rows * 4);
    parts.length = 0; rings.length = 0;
    fitCamera(); seedDust();
  }
  function fitCamera() {
    const P = M4.persp(GFX.FOV, GFX.aspect(), 0.1, 200), hw = G.cols / 2 + 1.0, hh = G.rows / 2 + 1.0;
    const pts = [[-hw, 0, -hh], [hw, 0, -hh], [-hw, 0, hh], [hw, 0, hh], [-hw, .4, -hh], [hw, .4, -hh]];
    const ev = (d, z) => {
      const m = M4.mul(P, M4.look([0, Math.sin(PITCH) * d, z + Math.cos(PITCH) * d], [0, 0, z], [0, 1, 0]).m);
      let xm = 0, y0 = 1e9, y1 = -1e9;
      for (const p of pts) {
        const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
        const x = (m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]) / w, y = (m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]) / w;
        xm = Math.max(xm, Math.abs(x)); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
      return { xm, y0, y1 };
    };
    let d = 12, z = 0;
    for (let it = 0; it < 4; it++) {
      let lo = 2, hi = 150;
      for (let k = 0; k < 28; k++) { d = (lo + hi) / 2; const r = ev(d, z); if (r.xm > 0.9 || r.y1 - r.y0 > 1.46) lo = d; else hi = d; }
      d = hi;
      let zl = -30, zh = 30;
      for (let k = 0; k < 28; k++) { z = (zl + zh) / 2; const r = ev(d, z); if ((r.y0 + r.y1) / 2 > -0.09) zh = z; else zl = z; }
    }
    fit.d = d; fit.z = z;
  }
  function seedDust() {
    dust.length = 0;
    for (let i = 0; i < 70; i++) dust.push({ x: rnd(-G.cols, G.cols), y: rnd(0.3, 4.5), z: rnd(-G.rows, G.rows), s: rnd(0.012, 0.03), f: rnd(0.5, 2), p: rnd(0, 6), v: rnd(0.03, 0.12) });
  }
  const edgeBetween = (x0, y0, x1, y1) => y0 === y1 ? G.H[y0][Math.min(x0, x1)] : G.V[Math.min(y0, y1)][x0];
  const validDir = (ax, ay, dx, dy) => (dx || dy) && ax + dx >= 0 && ay + dy >= 0 && ax + dx <= G.cols && ay + dy <= G.rows;
  const adjCells = (x0, y0, x1, y1) => y0 === y1 ? [[Math.min(x0, x1), y0 - 1], [Math.min(x0, x1), y0]] : [[x0 - 1, Math.min(y0, y1)], [x0, Math.min(y0, y1)]];
  const actor = (ax, ay) => ({ ax, ay, dx: 0, dy: 0, pdx: 0, pdy: 0, s: 1, t: 0, x: ax, y: ay, ox: 0, oy: 0 });

  function levelCfg(n) {
    const [cols, rows] = SIZES[Math.min(n - 1, SIZES.length - 1)];
    const pSpeed = 4.3 + Math.min(n - 1, 8) * 0.11;
    return { cols, rows, moths: n < 3 ? 1 : n < 6 ? 2 : 3, pSpeed, mSpeed: pSpeed * Math.min(0.9, 0.6 + (n - 1) * 0.035), aggro: Math.min(0.95, 0.62 + (n - 1) * 0.05) };
  }
  function spawnActors() {
    const cx = Math.floor(G.cols / 2);
    G.p = actor(cx, G.rows); G.p.invuln = 0; G.p.acc = 0;
    const spots = [[0, 0], [G.cols, 0], [cx, 0]];
    G.moths = [];
    for (let i = 0; i < G.cfg.moths; i++) { const m = actor(spots[i][0], spots[i][1]); m.kind = i; m.stun = 0; m.wake = 1.4 + i * 0.7; m.seed = rnd(0, 6); G.moths.push(m); }
    G.want = [0, 0]; G.turn = 0;
  }

  /* ------------------------------------------------------------ flow */
  function startTitle() {
    G.state = 'title'; G.stateT = 0; G.buildT = 0;
    G.cfg = { pSpeed: 3.4, mSpeed: 1.9, aggro: 0, moths: 1 };
    newBoard(7, 5); setDye((G.dye + 1) % DYES.length); spawnActors();
  }
  function startGame() {
    AudioFX.init();
    G.score = 0; G.lives = 3; G.paused = false; G.practiced = G.pax;
    el.title.classList.remove('show'); el.over.classList.remove('show'); el.pause.classList.remove('show'); el.hud.classList.add('show');
    el.best.textContent = fmt(G.best); hudScore(); hudLives();
    G.dye = -1; startLevel(1); AudioFX.begin();
  }
  function startLevel(n) {
    G.level = n; G.cfg = levelCfg(n);
    newBoard(G.cfg.cols, G.cfg.rows); setDye((n - 1) % DYES.length); spawnActors();
    G.state = 'intro'; G.stateT = 0; G.buildT = 0; G.levelTime = 0; G.combo = 0; G.comboT = 0;
    el.chain.classList.remove('show');
    hudLevel(); hudProg(); banner(DYES[G.dye].name, 'Weave ' + n, 1.7);
    AudioFX.setMode('play', n);
  }
  function kill() {
    const p = G.p; G.lives--; hudLives();
    G.state = 'dying'; G.stateT = 0; G.combo = 0; el.chain.classList.remove('show');
    G.shake = 1; G.chroma = 1; G.glitch = 1; G.flash = 0.5;
    const X = wx(p.x), Z = wz(p.y), c = G.pal.trace;
    for (let i = 0; i < 160; i++) {
      const a = rnd(0, 6.283), e = rnd(-0.3, 1.3), sp = rnd(1, 7);
      spark(X, 0.36, Z, Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp + 1, Math.sin(a) * Math.cos(e) * sp, rnd(0.5, 1.4), rnd(0.05, 0.13), i % 3 ? c : [1, 1, 1], 3, 5);
    }
    rings.push({ x: X, z: Z, r0: 0.2, r1: 3.6, life: 0.9, max: 0.9, c: c, a: 1.1 });
    shocks.push({ X, Z, t: 0, dur: 0.9, str: 2 });
    AudioFX.death();
  }
  function respawn() {
    spawnActors(); G.p.invuln = 2.2; G.state = 'play'; G.stateT = 0;
    for (const m of G.moths) m.wake = 1.2 + m.kind * 0.5;
  }
  function toTitle() {                 // from the game-over screen back to the opening screen and its demo
    if (G.state !== 'over') return;
    el.over.classList.remove('show'); el.title.classList.add('show');
    startTitle();
    setTimeout(() => $('startBtn').focus(), 50);
  }
  function endRun() {                  // give up a paused run: it ends like any other, and its score counts
    if (!G.paused) return;
    el.pause.style.transition = 'none'; togglePause(); void el.pause.offsetWidth; el.pause.style.transition = '';   // no cross-fade: two headings would overlap
    G.combo = 0; el.chain.classList.remove('show'); el.banner.classList.remove('show');
    gameOver();
  }
  function gameOver() {
    const woven = G.level - (G.state === 'clear' ? 0 : 1);      // a run ended during the fireworks has finished that weave too
    G.state = 'over'; G.stateT = 0;
    const record = !G.practiced && G.score > G.best; if (record) { G.best = G.score; store.set(G.best); }
    mine = G.practiced ? null : addScore(G.score, G.level);
    shared.run = SHARED && !G.practiced && G.score > 0 ? { k: randomKey(), n: cleanName(prefs.get('name')), s: G.score, w: G.level } : null;
    for (const r of shared.top) r.me = false;          // the mark of the run before this one
    if (shared.run) sharedLoad(shared.run); else if (view === 'shared') sharedLoad();
    el.overLine.textContent = `You finished ${woven} ${woven === 1 ? 'weave' : 'weaves'} and scored ${fmt(G.score)}.`;
    el.overBest.textContent = G.practiced ? 'Practice runs do not count toward your best.' : record ? 'That is your best yet.'
      : mine ? `That is number ${scores.indexOf(mine) + 1} on this device.` : `Your best is ${fmt(G.best)}.`;
    el.tBest.textContent = fmt(G.best);
    const listed = !!(mine || shared.run), known = cleanName(prefs.get('name'));
    el.nameRow.hidden = !listed; el.initials.value = known;
    el.over.classList.add('show'); el.hud.classList.remove('show'); refreshLists();
    AudioFX.setMode('ambient'); AudioFX.over();
    // a first entry asks for initials; later ones reuse them, so Enter starts the next game straight away
    setTimeout(() => (listed && !known ? el.initials : $('againBtn')).focus(), 50);
  }
  function levelClear() {
    G.state = 'clear'; G.stateT = 0; G.fwT = 0;
    const par = G.cols * G.rows * 2.4, bonus = Math.max(0, Math.round((par - G.levelTime) * 10) * 10);
    G.score += bonus; hudScore();
    let extra = '';
    if (G.level % 3 === 0 && G.lives < 5) { G.lives++; hudLives(); extra = ' and a spare spark'; }
    banner(DYES[G.dye].name + ' is woven', bonus ? `Speed bonus ${fmt(bonus)}${extra}` : (extra ? 'You earned a spare spark' : ''), 2.6);
    for (const m of G.moths) burst(wx(m.x), 0.5, wz(m.y), G.pal.moth, 50, 4);
    G.moths = []; G.flash = 0.35; G.chroma = 0.6;
    AudioFX.clear();
  }

  /* ------------------------------------------------------------ fx */
  function spark(x, y, z, vx, vy, vz, life, size, c, bright, grav) {
    if (parts.length > 4200) return;
    parts.push({ x, y, z, vx, vy, vz, life, max: life, size, r: c[0], g: c[1], b: c[2], k: bright, grav: grav === undefined ? 4 : grav });
  }
  function burst(x, y, z, c, n, sp) {
    for (let i = 0; i < n; i++) {
      const a = rnd(0, 6.283), e = rnd(-1.2, 1.4), s = rnd(0.3, 1) * sp;
      spark(x, y, z, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s, Math.sin(a) * Math.cos(e) * s, rnd(0.5, 1.3), rnd(0.04, 0.1), c, 3, 3);
    }
  }
  function cellColor(i, j) {
    const f = clamp((i / Math.max(1, G.cols - 1)) * 0.6 + (j / Math.max(1, G.rows - 1)) * 0.4 + 0.14 * Math.sin(G.t * 0.7 + i * 0.8 + j * 1.1), 0, 1);
    const a = G.pal.a, b = G.pal.b; return [lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f)];
  }

  /* ------------------------------------------------------------ rules */
  function weave(x0, y0, x1, y1) {
    const e = edgeBetween(x0, y0, x1, y1); if (e.on) return;
    e.on = true; e.flash = 1;
    const quiet = G.state === 'title';
    if (!quiet) { G.score += 10; hudScore(); AudioFX.thread(); }
    const mx = wx((x0 + x1) / 2), mz = wz((y0 + y1) / 2);
    for (let i = 0; i < 10; i++) spark(mx + rnd(-.4, .4) * (y0 === y1 ? 1 : 0), 0.1, mz + rnd(-.4, .4) * (y0 === y1 ? 0 : 1), rnd(-.6, .6), rnd(.8, 2.4), rnd(-.6, .6), rnd(.3, .7), rnd(.03, .06), G.pal.trace, 2.5);
    for (const [i, j] of adjCells(x0, y0, x1, y1)) {
      if (i < 0 || j < 0 || i >= G.cols || j >= G.rows) continue;
      const c = G.C[j][i];
      c.sides = (G.H[j][i].on ? 1 : 0) + (G.H[j + 1][i].on ? 1 : 0) + (G.V[j][i].on ? 1 : 0) + (G.V[j][i + 1].on ? 1 : 0);
      if (c.sides === 4 && !c.on) capture(i, j);
    }
  }
  function capture(i, j) {
    const c = G.C[j][i]; c.on = true; c.t = 0; c.flash = 1; G.captured++;
    const X = wx(i) + 0.5, Z = wz(j) + 0.5, col = cellColor(i, j), quiet = G.state === 'title';
    for (let k = 0; k < 56; k++) {
      const s = (k % 4), u = rnd(-.42, .42);
      const px = s === 0 ? u : s === 1 ? u : s === 2 ? -.42 : .42, pz = s === 0 ? -.42 : s === 1 ? .42 : u;
      spark(X + px, 0.15, Z + pz, px * rnd(.5, 2.5), rnd(1.5, 5), pz * rnd(.5, 2.5), rnd(.5, 1.2), rnd(.04, .09), k % 5 ? col : [1, 1, 1], 3, 5);
    }
    // nothing here may bend or move the picture: the player is tracking the shuttle and the moths.
    // The ring on the ground shows how far the stun reaches.
    rings.push({ x: X, z: Z, r0: 0.4, r1: 2.3, life: 0.6, max: 0.6, c: col, a: 0.7 });
    let stunned = false;
    for (const m of G.moths) if (m.wake <= 0 && Math.hypot(m.x - (i + .5), m.y - (j + .5)) < 2.0) { m.stun = 1.8; stunned = true; burst(wx(m.x), .5, wz(m.y), [.6, .75, 1], 14, 2); }
    if (!quiet) {
      G.combo = G.comboT > 0 ? Math.min(9, G.combo + 1) : 1; G.comboT = 3;
      const pts = 100 * G.combo; G.score += pts; hudScore(); hudProg();
      pop('+' + fmt(pts), X, 0.5, Z, G.combo > 1);
      if (G.combo > 1) { el.chainN.textContent = '×' + G.combo; el.chain.classList.remove('show'); void el.chain.offsetWidth; el.chain.classList.add('show'); }
      AudioFX.capture(G.combo); if (stunned) AudioFX.stun();
    }
    if (G.captured === G.cols * G.rows) { if (quiet) { G.stateT = 0; G.state = 'title-done'; } else levelClear(); }
  }

  function stepActor(e, dist, choose, arrive) {
    let guard = 0;
    while (dist > 1e-6 && guard++ < 8) {
      if (!e.dx && !e.dy) { if (!choose(e)) break; e.s = 1; }
      if (e.s > 0) {
        const rem = 1 - e.t;
        if (dist < rem) { e.t += dist; dist = 0; }
        else {
          dist -= rem; const fx = e.ax, fy = e.ay;
          e.ax += e.dx; e.ay += e.dy; e.pdx = e.dx; e.pdy = e.dy; e.dx = e.dy = 0; e.t = 0;
          if (arrive) arrive(fx, fy, e.ax, e.ay);
        }
      } else {
        if (dist < e.t) { e.t -= dist; dist = 0; }
        else { dist -= e.t; e.pdx = -e.dx; e.pdy = -e.dy; e.dx = e.dy = 0; e.t = 0; }
      }
    }
    e.x = e.ax + e.dx * e.t; e.y = e.ay + e.dy * e.t;
  }
  const leftOf = h => [h[1], -h[0] || 0], rightOf = h => [-h[1] || 0, h[0]];     // on screen, y runs down
  function choosePlayer(e) {
    if (G.ctrl === 'first') {          // steered from the shuttle's point of view: it keeps going, you turn it
      const h = (e.pdx || e.pdy) ? [e.pdx, e.pdy] : [0, -1];
      let d = null;
      if (G.turn && G.t - G.turnAt < 1) { const q = G.turn < 0 ? leftOf(h) : rightOf(h); if (validDir(e.ax, e.ay, q[0], q[1])) { d = q; G.turn = 0; } }
      if (!d && validDir(e.ax, e.ay, h[0], h[1])) d = h;
      if (!d) {                        // wall ahead: round a corner unprompted, wait at a T
        const l = leftOf(h), r = rightOf(h), lv = validDir(e.ax, e.ay, l[0], l[1]), rv = validDir(e.ax, e.ay, r[0], r[1]);
        if (lv !== rv) d = lv ? l : r;
      }
      if (!d) return false;
      e.dx = d[0]; e.dy = d[1]; return true;
    }
    const [a, b] = G.want;
    if (validDir(e.ax, e.ay, a, b)) { e.dx = a; e.dy = b; }
    else if (validDir(e.ax, e.ay, e.pdx, e.pdy)) { e.dx = e.pdx; e.dy = e.pdy; }
    else { e.pdx = e.pdy = 0; return false; }
    return true;
  }
  // A turn pressed just after its knot went by is taken as if it had been pressed in time: the shuttle
  // moves onto the new thread at the same distance from the knot, and the drawn position eases across.
  function lateTurn(p, dx, dy) {
    if (p.s < 0 || p.t > LATE || !validDir(p.ax, p.ay, dx, dy)) return false;
    const x0 = p.x, y0 = p.y;
    p.dx = dx; p.dy = dy; p.x = p.ax + dx * p.t; p.y = p.ay + dy * p.t;
    p.ox += x0 - p.x; p.oy += y0 - p.y;
    return true;
  }
  function chooseBot(e) {            // attract mode: head for the nearest unwoven thread
    const fresh = [];
    for (const [dx, dy] of DIRS) if (validDir(e.ax, e.ay, dx, dy) && !edgeBetween(e.ax, e.ay, e.ax + dx, e.ay + dy).on) fresh.push([dx, dy]);
    let pick = null;
    if (fresh.length) {               // prefer the thread that brings a square closest to closing
      let bs = -1;
      for (const d of fresh) {
        let sc = Math.random() * 0.9 + (d[0] === e.pdx && d[1] === e.pdy ? 0.3 : 0);
        for (const [i, j] of adjCells(e.ax, e.ay, e.ax + d[0], e.ay + d[1])) if (i >= 0 && j >= 0 && i < G.cols && j < G.rows && !G.C[j][i].on) sc = Math.max(sc, G.C[j][i].sides + Math.random() * 0.5);
        if (sc > bs) { bs = sc; pick = d; }
      }
    }
    else {
      const key = (x, y) => y * 32 + x, seen = new Map([[key(e.ax, e.ay), null]]), q = [[e.ax, e.ay, null]];
      while (q.length && !pick) {
        const [x, y, first] = q.shift();
        for (const [dx, dy] of DIRS) {
          if (!validDir(x, y, dx, dy)) continue;
          const f = first || [dx, dy];
          if (!edgeBetween(x, y, x + dx, y + dy).on) { pick = f; break; }
          const k = key(x + dx, y + dy); if (!seen.has(k)) { seen.set(k, 1); q.push([x + dx, y + dy, f]); }
        }
      }
    }
    if (!pick) return false;
    e.dx = pick[0]; e.dy = pick[1]; return true;
  }
  function chooseMoth(m) {
    const p = G.p; let tx = p.x, ty = p.y;
    if (m.kind === 1) { tx += p.dx * p.s * 2.5; ty += p.dy * p.s * 2.5; }
    const chase = Math.random() < G.cfg.aggro * (m.kind === 2 ? 0.6 : 1);
    let best = null, bd = 1e9; const opts = [];
    for (const d of DIRS) {
      if (!validDir(m.ax, m.ay, d[0], d[1]) || (d[0] === -m.pdx && d[1] === -m.pdy)) continue;
      opts.push(d); const dd = (m.ax + d[0] - tx) ** 2 + (m.ay + d[1] - ty) ** 2; if (dd < bd) { bd = dd; best = d; }
    }
    const pick = chase ? best : opts[(Math.random() * opts.length) | 0];
    m.dx = pick[0]; m.dy = pick[1]; return true;
  }
  function updateMoths(dt, lethal) {
    for (const m of G.moths) {
      if (m.wake > 0) { m.wake -= dt; continue; }
      if (m.stun > 0) { m.stun -= dt; continue; }
      stepActor(m, G.cfg.mSpeed * dt, chooseMoth);
      if (lethal && G.state === 'play' && !G.pax && G.p.invuln <= 0 && Math.hypot(m.x - G.p.x, m.y - G.p.y) < 0.42) kill();
    }
  }
  function trail(p, dt) {
    if (!p.dx && !p.dy) return;
    p.acc += dt * 70;
    while (p.acc > 1) { p.acc--; spark(wx(p.x) + rnd(-.05, .05), 0.3 + rnd(-.05, .05), wz(p.y) + rnd(-.05, .05), rnd(-.3, .3), rnd(0, .5), rnd(-.3, .3), rnd(.25, .55), rnd(.05, .1), G.pal.trace, 1.4, 0); }
  }
  function firework() {
    const x = rnd(-G.cols / 2, G.cols / 2), z = rnd(-G.rows / 2, G.rows / 2), y = rnd(1.2, 3);
    const c = [G.pal.a, G.pal.b, G.pal.trace][(Math.random() * 3) | 0];
    burst(x, y, z, c, 70, 4.5); burst(x, y, z, [1, 1, 1], 12, 2);
    shocks.push({ X: x, Z: z, t: 0, dur: 0.6, str: 0.5 });
  }

  /* ------------------------------------------------------------ update */
  function update(dt) {
    G.t += dt; G.stateT += dt;
    G.shake = Math.max(0, G.shake - dt * 2.2); G.chroma = Math.max(0, G.chroma - dt * 1.6);
    G.glitch = Math.max(0, G.glitch - dt * 1.5); G.flash = Math.max(0, G.flash - dt * 2.5);
    G.fade = Math.min(1, G.fade + dt * 0.9);
    if (G.palT < 1) { G.palT = Math.min(1, G.palT + dt / 1.2); for (const k of PAL_KEYS) for (let i = 0; i < 3; i++) G.pal[k][i] = lerp(G.palFrom[k][i], G.palTo[k][i], G.palT); }
    for (const row of G.H) for (const e of row) if (e.flash > 0) e.flash = Math.max(0, e.flash - dt * 2.5);
    for (const row of G.V) for (const e of row) if (e.flash > 0) e.flash = Math.max(0, e.flash - dt * 2.5);
    for (const row of G.C) for (const c of row) if (c.on) { c.t += dt; if (c.flash > 0) c.flash = Math.max(0, c.flash - dt * 2.2); }

    const p = G.p;
    switch (G.state) {
      case 'title':
        G.buildT = Math.min(1, G.buildT + dt / 1.6);
        if (G.buildT > 0.9) { stepActor(p, G.cfg.pSpeed * dt, chooseBot, weave); updateMoths(dt, false); trail(p, dt); }
        break;
      case 'title-done':
        if (G.stateT > 1.6) G.buildT = Math.max(0, G.buildT - dt / 0.7);
        if (G.stateT > 2.5) startTitle();
        break;
      case 'intro':
        G.buildT = Math.min(1, G.buildT + dt / 1.3);
        if (G.stateT > 1.5) { G.state = 'play'; G.stateT = 0; }
        break;
      case 'play':
        G.levelTime += dt; if (p.invuln > 0) p.invuln -= dt;
        if (p.ox || p.oy) { const f = Math.exp(-dt * 30); p.ox *= f; p.oy *= f; if (Math.abs(p.ox) + Math.abs(p.oy) < 0.004) p.ox = p.oy = 0; }
        stepActor(p, G.cfg.pSpeed * dt, choosePlayer, weave);
        if (G.state === 'play') updateMoths(dt, true);
        trail(p, dt);
        if (G.comboT > 0) { G.comboT -= dt; if (G.comboT <= 0) { G.combo = 0; el.chain.classList.remove('show'); } }
        break;
      case 'dying':
        updateMoths(dt, false);
        if (G.stateT > 1.6) { if (G.lives > 0) respawn(); else gameOver(); }
        break;
      case 'clear':
        if (G.stateT < 2.2) { G.fwT -= dt; if (G.fwT <= 0) { G.fwT = 0.22; firework(); } }
        else G.buildT = Math.max(0, G.buildT - dt / 0.7);
        if (G.stateT > 3.1) startLevel(G.level + 1);
        break;
      case 'over':
        updateMoths(dt, false);
        break;
    }

    for (let i = parts.length - 1; i >= 0; i--) {
      const q = parts[i]; q.life -= dt;
      if (q.life <= 0) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
      q.vy -= q.grav * dt; const dr = Math.exp(-dt * 1.4); q.vx *= dr; q.vz *= dr;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
    }
    for (let i = rings.length - 1; i >= 0; i--) { rings[i].life -= dt; if (rings[i].life <= 0) rings.splice(i, 1); }
    for (let i = shocks.length - 1; i >= 0; i--) { shocks[i].t += dt; if (shocks[i].t >= shocks[i].dur) shocks.splice(i, 1); }
    for (const d of dust) { d.y += d.v * dt; if (d.y > 4.6) d.y = 0.3; }
  }

  /* ------------------------------------------------------------ draw */
  function box(cx, cy, cz, sx, sy, sz, c, kind, p1, p2) {
    if (nBox >= GFX.MAX_BOX) return; const o = nBox++ * GFX.BOX_F;
    boxes[o] = cx; boxes[o + 1] = cy; boxes[o + 2] = cz; boxes[o + 3] = sx; boxes[o + 4] = sy; boxes[o + 5] = sz;
    boxes[o + 6] = c[0]; boxes[o + 7] = c[1]; boxes[o + 8] = c[2]; boxes[o + 9] = 1;
    boxes[o + 10] = kind; boxes[o + 11] = p1; boxes[o + 12] = p2; boxes[o + 13] = 0;
  }
  function bill(x, y, z, size, seed, r, g, b, a, type, p1, p2, flat) {
    if (nBill >= GFX.MAX_BILL) return; const o = nBill++ * GFX.BILL_F;
    bills[o] = x; bills[o + 1] = y; bills[o + 2] = z; bills[o + 3] = size; bills[o + 4] = seed;
    bills[o + 5] = r; bills[o + 6] = g; bills[o + 7] = b; bills[o + 8] = a;
    bills[o + 9] = type; bills[o + 10] = p1; bills[o + 11] = p2; bills[o + 12] = flat;
  }
  const ap = dist => easeOutCubic(clamp(G.buildT * 2.25 - dist * 0.18, 0, 1));

  const cam = { yaw: 0.4, pitch: 0.7, dist: 14, cx: 0, cz: 0 };
  function draw(dt) {
    const pal = G.pal, t = G.t, p = G.p, cols = G.cols, rows = G.rows;
    const title = G.state === 'title' || G.state === 'title-done';
    const wide = GFX.aspect() > 1.15;

    // camera
    const k = 1 - Math.exp(-dt * 2.6);
    cam.yaw = lerp(cam.yaw, title ? Math.sin(t * 0.13) * 0.5 : 0, k);
    cam.pitch = lerp(cam.pitch, title ? 0.70 : PITCH, k);
    cam.dist = lerp(cam.dist, fit.d * (title ? (wide ? 1.02 : 1.15) : 1), k);
    cam.cx = lerp(cam.cx, title ? (wide ? -1.1 : 0) : wx(p.x) * 0.05, k);
    cam.cz = lerp(cam.cz, title ? (wide ? 1.3 : 2.4) : fit.z + wz(p.y) * 0.05, k);
    const sh = G.shake * G.shake * 0.22 * FXK;
    const cx = cam.cx + rnd(-sh, sh), cy = rnd(-sh, sh), cz = cam.cz + rnd(-sh, sh);
    const cp = Math.cos(cam.pitch) * cam.dist;
    GFX.setCamera([cx + Math.sin(cam.yaw) * cp, cy + Math.sin(cam.pitch) * cam.dist, cz + Math.cos(cam.yaw) * cp], [cx, cy, cz]);

    nBox = 0; nBill = 0;
    const tr = pal.trace;

    // slab
    const sa = ap(0);
    box(0, -0.16, 0, (cols + 1.5) * sa, 0.3, (rows + 1.5) * sa, tr, 3, 0, 0);

    // threads
    for (let j = 0; j <= rows; j++) for (let i = 0; i < cols; i++) {
      const e = G.H[j][i], X = wx(i) + 0.5, Z = wz(j), a = ap(Math.hypot(X, Z)); if (a <= 0) continue;
      const w = e.on ? 0.085 : 0.055;
      box(X, w / 2 + 0.004, Z, 0.86 * a, w, w, tr, 0, e.on ? 1 : 0, e.flash);
    }
    for (let j = 0; j < rows; j++) for (let i = 0; i <= cols; i++) {
      const e = G.V[j][i], X = wx(i), Z = wz(j) + 0.5, a = ap(Math.hypot(X, Z)); if (a <= 0) continue;
      const w = e.on ? 0.085 : 0.055;
      box(X, w / 2 + 0.004, Z, w, w, 0.86 * a, tr, 0, e.on ? 1 : 0, e.flash);
    }
    // thread being pulled by the shuttle
    const pv = G.state !== 'dying' && G.state !== 'over';
    if (pv && (p.dx || p.dy) && p.t > 0.03 && !edgeBetween(p.ax, p.ay, p.ax + p.dx, p.ay + p.dy).on) {
      const X = wx(p.ax + p.dx * p.t / 2), Z = wz(p.ay + p.dy * p.t / 2);
      box(X, 0.047, Z, p.dx ? p.t : 0.085, 0.085, p.dy ? p.t : 0.085, tr, 0, 1, 0.3);
    }
    // knots
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
      const X = wx(i), Z = wz(j), a = ap(Math.hypot(X, Z)); if (a <= 0) continue;
      const lit = (i > 0 && G.H[j][i - 1].on) || (i < cols && G.H[j][i].on) || (j > 0 && G.V[j - 1][i].on) || (j < rows && G.V[j][i].on);
      box(X, 0.055, Z, 0.125 * a, 0.11 * a, 0.125 * a, tr, 2, lit ? 1 : 0, 0);
    }
    // lit squares + light map
    const waving = G.state === 'clear' && G.stateT < 2.4;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const c = G.C[j][i], o = (j * cols + i) * 4;
      if (!c.on) { light[o] = light[o + 1] = light[o + 2] = 0; light[o + 3] = c.sides * 63; continue; }
      const X = wx(i) + 0.5, Z = wz(j) + 0.5, a = ap(Math.hypot(X, Z));
      const col = cellColor(i, j), glow = clamp(c.t * 4, 0, 1) * a;
      let h = 0.03 + 0.2 * easeOutBack(clamp(c.t / 0.55, 0, 1));
      if (waving) h += 0.22 * Math.max(0, Math.sin(Math.hypot(X - wx(p.x), Z - wz(p.y)) * 0.9 - G.stateT * 7)) * clamp(2.4 - G.stateT, 0, 1);
      light[o] = col[0] * 255 * glow; light[o + 1] = col[1] * 255 * glow; light[o + 2] = col[2] * 255 * glow; light[o + 3] = 255;
      if (a > 0) box(X, h * a / 2, Z, 0.8 * a, h * a, 0.8 * a, col, 1, glow, c.flash);
    }

    // dust
    for (const d of dust) bill(d.x, d.y, d.z, d.s, 0, tr[0] * .6 + .25, tr[1] * .6 + .25, tr[2] * .6 + .25, 0.55 + 0.45 * Math.sin(t * d.f + d.p), 0, 0, 0, 0);
    // rings
    for (const r of rings) { const q = r.life / r.max; bill(r.x, 0.27, r.z, lerp(r.r0, r.r1, easeOutCubic(1 - q)), 0, r.c[0], r.c[1], r.c[2], q * q * r.a, 3, 0.07, 0, 1); }
    // moths
    const mc = pal.moth;
    for (const m of G.moths) {
      const wk = (m.wake > 0 ? clamp(1 - m.wake / 0.7, 0, 1) : 1) * ap(Math.hypot(wx(m.x), wz(m.y)));
      if (wk <= 0) continue;
      const X = wx(m.x), Z = wz(m.y), Y = 0.55 + 0.07 * Math.sin(t * 5 + m.seed), st = m.stun > 0 ? 1 : 0;
      bill(X, Y, Z, 1.1 * wk, 0, mc[0], mc[1], mc[2], st ? 0.12 : 0.45, 0, 0, 0, 0);
      bill(X, Y, Z, 0.56 * wk, m.seed, mc[0], mc[1], mc[2], 1, 2, 0, st, 0);
    }
    // shuttle
    if (pv) {
      const s = ap(Math.hypot(wx(p.x), wz(p.y)));
      const blink = p.invuln > 0 ? 0.45 + 0.55 * Math.abs(Math.sin(t * 16)) : 1;
      if (s > 0) {
        const X = wx(p.x + p.ox), Z = wz(p.y + p.oy), Y = 0.36 + 0.03 * Math.sin(t * 6);
        bill(X, 0.03, Z, 0.9 * s, 0, tr[0], tr[1], tr[2], 0.5 * blink, 0, 0, 0, 1);
        bill(X, Y, Z, 0.62 * s, 0, tr[0] * .7 + .3, tr[1] * .7 + .3, tr[2] * .7 + .3, blink, 1, 0, 0, 0);
      }
    }
    // sparks
    for (const q of parts) { const f = q.life / q.max; bill(q.x, q.y, q.z, q.size * (0.4 + 0.6 * f), 0, q.r, q.g, q.b, q.k * f, 0, 0, 0, 0); }

    // screen-space shockwaves (newest four)
    shockU.fill(0);
    for (let i = 0; i < 4; i++) {
      const s = shocks[shocks.length - 1 - i]; if (!s) break;
      const [u, v] = GFX.project(s.X, 0.2, s.Z), q = s.t / s.dur;
      shockU[i * 4] = u; shockU[i * 4 + 1] = v; shockU[i * 4 + 2] = easeOutCubic(q) * 0.42; shockU[i * 4 + 3] = s.str * (1 - q) * FXK;
    }

    GFX.render({
      time: t, boxes, nBox, bills, nBill, light, dims: [cols, rows], pal: { trace: tr, skyA: pal.skyA, skyB: pal.skyB },
      chroma: G.chroma * FXK, glitch: G.glitch * FXK, fade: G.fade, flash: G.flash * FXK, shocks: shockU
    });
  }

  /* ------------------------------------------------------------ input */
  const KEYS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], KeyA: [-1, 0], KeyD: [1, 0], KeyW: [0, -1], KeyS: [0, 1] };
  const steerable = () => !G.paused && (G.state === 'play' || G.state === 'intro');
  function steer(dx, dy) {             // third person: point where to go
    if (!steerable()) return;
    G.want = [dx, dy];
    const p = G.p;
    if (G.state !== 'play' || (!p.dx && !p.dy)) return;      // standing at a knot: the next update takes it
    const hx = p.dx * p.s, hy = p.dy * p.s;
    if (dx === -hx && dy === -hy) p.s = -p.s;                // straight back: reverse at once
    else if (dx !== hx || dy !== hy) lateTurn(p, dx, dy);    // sideways: take the knot just passed if it was open
  }
  function turn(side) {                // first person: -1 turns left of the heading, 1 turns right
    if (!steerable()) return;
    const p = G.p;
    G.turn = side; G.turnAt = G.t;
    if (G.state !== 'play' || (!p.dx && !p.dy) || p.s < 0) return;
    const q = side < 0 ? leftOf([p.dx, p.dy]) : rightOf([p.dx, p.dy]);
    if (lateTurn(p, q[0], q[1])) G.turn = 0;
  }
  function press(dx, dy) { if (G.ctrl === 'first') { if (dx) turn(dx); } else steer(dx, dy); }
  function setControls(mode) {
    G.ctrl = mode === 'first' ? 'first' : 'third'; prefs.set('controls', G.ctrl);
    G.turn = 0; G.want = [0, 0];
    document.body.dataset.ctrl = G.ctrl;
    for (const b of document.querySelectorAll('.ctrl button')) b.setAttribute('aria-pressed', b.dataset.ctrl === G.ctrl ? 'true' : 'false');
  }
  function togglePax() {               // hidden practice mode: the moths cannot hurt the shuttle
    G.pax = !G.pax; if (G.pax) G.practiced = true;
    document.body.classList.toggle('pax', G.pax);
    if (G.pax) el.best.textContent = fmt(G.best);
  }
  function confirm() {
    if (scoresOpen()) closeScores();
    else if (G.state === 'title' || G.state === 'title-done' || G.state === 'over') startGame();
    else if (G.paused) togglePause();
  }
  function togglePause() {
    if (G.state === 'title' || G.state === 'title-done' || G.state === 'over') return;
    G.paused = !G.paused; el.pause.classList.toggle('show', G.paused); AudioFX.duck(G.paused);
  }
  function toggleMute() { const m = AudioFX.toggleMute(); el.mute.textContent = m ? 'Sound off' : 'Sound on'; el.mute.setAttribute('aria-pressed', m ? 'true' : 'false'); }

  let typed = '', pausedByP = false;
  addEventListener('keydown', e => {
    if (e.target && e.target.tagName === 'INPUT') return;     // typing initials: no game key applies
    if (!e.repeat && e.key && e.key.length === 1) {
      typed = (typed + e.key.toLowerCase()).slice(-3);
      if (typed === 'pax') { typed = ''; togglePax(); if (G.paused && pausedByP) togglePause(); return; }   // the P of PAX had paused the game
    }
    if (e.repeat && !KEYS[e.code]) return;
    if (KEYS[e.code]) { e.preventDefault(); AudioFX.init(); if (!e.repeat) press(KEYS[e.code][0], KEYS[e.code][1]); return; }
    switch (e.code) {
      case 'Enter': case 'Space': if (document.activeElement && document.activeElement.tagName === 'BUTTON') return; e.preventDefault(); confirm(); break;
      case 'KeyP': togglePause(); pausedByP = G.paused; break;
      case 'Escape': if (scoresOpen()) closeScores(); else if (G.state === 'over') toTitle(); else { togglePause(); pausedByP = false; } break;
      case 'KeyM': AudioFX.init(); toggleMute(); break;
      case 'KeyF': if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); break;
    }
  });
  $('startBtn').addEventListener('click', startGame);
  $('againBtn').addEventListener('click', startGame);
  $('titleBtn').addEventListener('click', toTitle);
  $('endBtn').addEventListener('click', endRun);
  $('scoresBtn').addEventListener('click', openScores);
  $('backBtn').addEventListener('click', closeScores);
  for (const b of document.querySelectorAll('.tabs button')) b.addEventListener('click', () => setView(b.dataset.list));
  document.body.classList.toggle('shared', !!SHARED); setView(view);
  el.initials.addEventListener('input', e => {
    if (e.isComposing) return;
    const n = el.initials.value = cleanName(el.initials.value); prefs.set('name', n);
    if (mine) { mine.n = n; saveScores(); }
    const run = shared.run;
    if (run) {                         // show the change at once, send it when the typing stops
      run.n = n; for (const r of shared.top) if (r.me) r.n = n;
      clearTimeout(shared.timer); shared.timer = setTimeout(() => sharedLoad(run), 700);
    }
    refreshLists();
  });
  el.initials.addEventListener('keydown', e => {   // a steering key still held down must not type; Enter hands over to the button
    if (e.repeat) e.preventDefault();
    else if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); $('againBtn').focus(); }
  });
  el.mute.addEventListener('click', () => { AudioFX.init(); toggleMute(); el.mute.blur(); });
  for (const b of document.querySelectorAll('.ctrl button')) b.addEventListener('click', () => { setControls(b.dataset.ctrl); b.blur(); });
  setControls(G.ctrl);

  let touch = null;
  const onButton = e => e.target && e.target.closest && e.target.closest('button');
  addEventListener('touchstart', e => {
    const t = e.changedTouches[0]; touch = { x: t.clientX, y: t.clientY };
    if (G.ctrl === 'first' && !onButton(e)) turn(t.clientX < innerWidth / 2 ? -1 : 1);    // tap a side to turn that way
  }, { passive: true });
  addEventListener('touchmove', e => {
    if (!touch || G.ctrl === 'first') return; const t = e.changedTouches[0], dx = t.clientX - touch.x, dy = t.clientY - touch.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 16) return;
    if (Math.abs(dx) > Math.abs(dy)) steer(Math.sign(dx), 0); else steer(0, Math.sign(dy));
    touch = { x: t.clientX, y: t.clientY };
  }, { passive: true });
  addEventListener('touchend', e => { touch = null; if (G.paused && !onButton(e)) togglePause(); }, { passive: true });
  addEventListener('blur', () => { if (G.state === 'play' && !G.paused) togglePause(); });
  addEventListener('resize', () => { if (GFX.resize()) fitCamera(); });

  /* ------------------------------------------------------------ loop */
  el.tBest.textContent = fmt(G.best);
  G.dye = DYES.length - 1; startTitle();
  let last = performance.now(), slowSum = 0, slowN = 0;
  function frame(now) {
    const raw = (now - last) / 1000, dt = Math.min(0.05, raw); last = now;
    // adaptive quality: if a run of ordinary frames averages under ~45 fps, render at a lower resolution
    if (raw < 0.1) { slowSum += raw; if (++slowN >= 90) { if (slowSum / slowN > 1 / 45) GFX.lowerQuality(); slowSum = 0; slowN = 0; } }
    if (GFX.resize()) fitCamera();
    if (!G.paused) update(dt);
    draw(G.paused ? 0 : dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // handy for debugging from the console: __loom.tick(120) advances two seconds
  window.__loom = { G, scores, shared, setView, steer, turn, setControls, togglePax, startGame, togglePause, tick(n, dt) { for (let i = 0; i < n; i++) update(dt || 1 / 60); draw(dt || 1 / 60); } };
})();
