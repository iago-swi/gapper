'use strict';
/* Lightloom audio: everything is synthesized with WebAudio, no samples.
   A 16th-note sequencer drives a pad / bass / arp in A minor; tracing a
   thread plays the next note of a pentatonic run so play itself is melodic. */

const AudioFX = (function () {
  let ctx = null, master, sfxBus, musicBus, send, noiseBuf;
  let muted = false, mode = 'ambient', ducked = false;
  let step = 0, nextT = 0, bpm = 92, noteIdx = 0, lastThread = 0;

  const mtof = n => 440 * Math.pow(2, (n - 69) / 12);
  const PENTA = [0, 3, 5, 7, 10];
  const CHORDS = [[57, 60, 64], [53, 57, 60], [60, 64, 67], [55, 59, 62]]; // Am F C G

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.85;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 5;
    master.connect(comp); comp.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = 0.0001; musicBus.connect(master);
    musicBus.gain.exponentialRampToValueAtTime(0.7, ctx.currentTime + 2.5);

    const delay = ctx.createDelay(1); delay.delayTime.value = 0.326;
    const fb = ctx.createGain(); fb.gain.value = 0.42;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
    delay.connect(lp); lp.connect(fb); fb.connect(delay); lp.connect(master);
    send = ctx.createGain(); send.gain.value = 1; send.connect(delay);

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    nextT = ctx.currentTime + 0.1;
    setInterval(tick, 50);
  }

  function env(g, t, a, d, peak) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  function tone(f, t, dur, type, vol, bus, wet, f2) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    env(g, t, 0.006, dur, vol); o.connect(g); g.connect(bus);
    if (wet) { const w = ctx.createGain(); w.gain.value = wet; g.connect(w); w.connect(send); }
    o.start(t); o.stop(t + dur + 0.08);
  }
  function noise(t, dur, vol, type, freq, bus, f2) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t);
    if (f2) f.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = ctx.createGain(); env(g, t, 0.004, dur, vol);
    s.connect(f); f.connect(g); g.connect(bus); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.08);
  }
  function pad(notes, t, dur) {
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 0.7;
    const top = mode === 'play' ? 1250 : 780;
    f.frequency.setValueAtTime(320, t); f.frequency.linearRampToValueAtTime(top, t + dur * 0.5); f.frequency.linearRampToValueAtTime(320, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.045, t + dur * 0.3); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.5);
    f.connect(g); g.connect(musicBus);
    for (const n of notes) for (const det of [-8, 8]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(n); o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + dur + 0.6);
    }
  }

  function sched(s, t, spb) {
    const bar = s >> 4, k = s & 15, ch = CHORDS[bar];
    if (k === 0) pad(ch, t, spb * 16);
    if (mode === 'play') {
      if (k % 4 === 0) tone(118, t, 0.24, 'sine', 0.34, musicBus, 0, 42);
      if (k % 4 === 2) noise(t, 0.04, 0.045, 'highpass', 7200, musicBus);
      if (k === 0 || k === 3 || k === 6 || k === 10 || k === 12) tone(mtof(ch[0] - 24), t, spb * 1.9, 'triangle', 0.17, musicBus, 0);
      if (k % 2 === 0) { const i = k / 2; tone(mtof(ch[i % 3] + 12 + 12 * ((i >> 1) % 2)), t, spb * 1.6, 'triangle', 0.032, musicBus, 0.5); }
    } else if (k % 4 === 0) {
      const i = k / 4; tone(mtof(ch[(i * 2) % 3] + 24), t, spb * 7, 'sine', 0.028, musicBus, 0.7);
    }
  }
  function tick() {
    if (!ctx || ctx.state !== 'running') return;
    if (nextT < ctx.currentTime) nextT = ctx.currentTime + 0.05;
    const spb = 60 / bpm / 4;
    while (nextT < ctx.currentTime + 0.25) { if (!ducked) sched(step, nextT, spb); nextT += spb; step = (step + 1) % 64; }
  }

  /* ---- game sounds ---- */
  function thread() {
    if (!ctx) return; const t = ctx.currentTime;
    if (t - lastThread > 1.1) noteIdx = 0; lastThread = t;
    const i = noteIdx++ % 10;
    const n = 69 + PENTA[i % 5] + 12 * (i >= 5 ? 1 : 0);
    tone(mtof(n), t, 0.16, 'triangle', 0.16, sfxBus, 0.35);
    tone(mtof(n + 12), t, 0.06, 'sine', 0.05, sfxBus, 0);
  }
  function capture(combo) {
    if (!ctx) return; const t = ctx.currentTime;
    const root = 69 + PENTA[(combo - 1) % 5] + 12 * Math.min(1, Math.floor((combo - 1) / 5));
    [0, 7, 12, 19].forEach((iv, i) => tone(mtof(root + iv), t + i * 0.045, 0.34, i % 2 ? 'sine' : 'triangle', 0.15, sfxBus, 0.6));
    noise(t, 0.3, 0.07, 'bandpass', 3000, sfxBus, 9000);
    tone(90, t, 0.22, 'sine', 0.3, sfxBus, 0, 45);
  }
  function stun() { if (!ctx) return; const t = ctx.currentTime; tone(660, t, 0.25, 'square', 0.035, sfxBus, 0.4, 220); }
  function death() {
    if (!ctx) return; const t = ctx.currentTime;
    tone(520, t, 0.9, 'sawtooth', 0.2, sfxBus, 0.5, 38);
    tone(262, t, 0.7, 'square', 0.1, sfxBus, 0.3, 30);
    noise(t, 0.7, 0.3, 'lowpass', 5000, sfxBus, 180);
  }
  function clear() {
    if (!ctx) return; const t = ctx.currentTime;
    [57, 60, 64, 69, 72, 76, 81, 84].forEach((n, i) => tone(mtof(n + 12), t + i * 0.085, 0.5, 'triangle', 0.14, sfxBus, 0.7));
    noise(t + 0.6, 0.9, 0.05, 'highpass', 5000, sfxBus);
  }
  function begin() {
    if (!ctx) return; const t = ctx.currentTime;
    [69, 76, 81].forEach((n, i) => tone(mtof(n), t + i * 0.07, 0.4, 'triangle', 0.14, sfxBus, 0.6));
  }
  function over() {
    if (!ctx) return; const t = ctx.currentTime;
    [72, 67, 64, 57].forEach((n, i) => tone(mtof(n), t + 0.5 + i * 0.22, 0.9, 'sine', 0.13, sfxBus, 0.7));
  }

  return {
    init, thread, capture, stun, death, clear, begin, over,
    setMode(m, level) { mode = m; bpm = m === 'play' ? Math.min(132, 96 + (level || 1) * 3) : 84; },
    duck(b) { ducked = b; if (ctx) musicBus.gain.setTargetAtTime(b ? 0.12 : 0.7, ctx.currentTime, 0.15); },
    toggleMute() { muted = !muted; if (ctx) master.gain.setTargetAtTime(muted ? 0 : 0.85, ctx.currentTime, 0.03); return muted; }
  };
})();
