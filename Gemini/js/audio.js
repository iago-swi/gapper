window.Gapper = window.Gapper || {};

(function (G) {
  'use strict';

  const SCALE_HZ = [
    261.63, 293.66, 329.63, 392.00, 440.00,
    523.25, 587.33, 659.25, 783.99, 880.00,
    1046.50, 1174.66, 1318.51
  ];

  class SoundEngine {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.muted = false;
      this.droneOscA = null;
      this.droneOscB = null;
      this.droneGain = null;
      this.droneFilter = null;
      this.paintStep = 0;
      this.lastPaintAt = 0;
      this.noiseBuffer = null;
    }

    init() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') {
          this.ctx.resume().catch(() => {});
        }
        return;
      }
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      this.ctx = new AudioCtx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.42;

      // Subtle master limiter/compressor for punchy clean headroom
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 18;
      comp.ratio.value = 6;
      comp.attack.value = 0.004;
      comp.release.value = 0.16;

      this.master.connect(comp);
      comp.connect(this.ctx.destination);

      // Pre-generate 1s white noise buffer for plasma arcs & impacts
      const sr = this.ctx.sampleRate;
      this.noiseBuffer = this.ctx.createBuffer(1, sr, sr);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < sr; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      this._setupDrone();
    }

    _setupDrone() {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      this.droneFilter = this.ctx.createBiquadFilter();
      this.droneFilter.type = 'lowpass';
      this.droneFilter.frequency.value = 260;
      this.droneFilter.Q.value = 2.5;

      this.droneGain = this.ctx.createGain();
      this.droneGain.gain.value = 0.0001;

      this.droneOscA = this.ctx.createOscillator();
      this.droneOscB = this.ctx.createOscillator();
      this.droneOscA.type = 'sawtooth';
      this.droneOscB.type = 'triangle';
      this.droneOscA.frequency.setValueAtTime(65.41, now); // C2
      this.droneOscB.frequency.setValueAtTime(98.00, now); // G2

      const subGainA = this.ctx.createGain();
      const subGainB = this.ctx.createGain();
      subGainA.gain.value = 0.35;
      subGainB.gain.value = 0.25;

      this.droneOscA.connect(subGainA);
      this.droneOscB.connect(subGainB);
      subGainA.connect(this.droneFilter);
      subGainB.connect(this.droneFilter);
      this.droneFilter.connect(this.droneGain);
      this.droneGain.connect(this.master);

      this.droneOscA.start(now);
      this.droneOscB.start(now);
    }

    setAmbientIntensity(active, progress01, overdrive) {
      if (!this.ctx || !this.droneGain || !this.droneFilter) return;
      const now = this.ctx.currentTime;
      const targetGain = active ? (overdrive ? 0.14 : 0.075 + progress01 * 0.045) : 0.0001;
      const targetFreq = active ? (overdrive ? 760 : 210 + progress01 * 340) : 140;
      this.droneGain.gain.setTargetAtTime(targetGain, now, 0.22);
      this.droneFilter.frequency.setTargetAtTime(targetFreq, now, 0.25);
    }

    toggleMute() {
      this.muted = !this.muted;
      if (this.master && this.ctx) {
        this.master.gain.setTargetAtTime(this.muted ? 0 : 0.42, this.ctx.currentTime, 0.03);
      }
      return this.muted;
    }

    _tone(freq, startTime, duration, type, peakGain, endFreq) {
      if (!this.ctx || this.muted) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, startTime);
      if (endFreq) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), startTime + duration);
      }
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(startTime);
      osc.stop(startTime + duration + 0.02);
    }

    _noise(startTime, duration, filterType, freqStart, freqEnd, peakGain, q = 2.0) {
      if (!this.ctx || this.muted || !this.noiseBuffer) return;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = filterType;
      filter.frequency.setValueAtTime(freqStart, startTime);
      filter.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), startTime + duration);
      filter.Q.value = q;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      src.start(startTime);
      src.stop(startTime + duration + 0.02);
    }

    playEdgePainted() {
      if (!this.ctx || this.muted) return;
      const now = this.ctx.currentTime;
      if (now - this.lastPaintAt < 0.06) return;
      this.lastPaintAt = now;
      const note = SCALE_HZ[(this.paintStep++) % 8];
      this._tone(note, now, 0.14, 'triangle', 0.11, note * 1.005);
      this._tone(note * 2, now, 0.08, 'sine', 0.05);
    }

    playCellSeal(combo = 1, multi = 1) {
      if (!this.ctx || this.muted) return;
      const now = this.ctx.currentTime;
      const baseIdx = Math.min(combo - 1, 5);
      const root = SCALE_HZ[baseIdx + 2];
      const chord = [root, root * 1.25, root * 1.5, root * 2.0];
      if (multi > 1) chord.push(root * 2.5);

      chord.forEach((hz, i) => {
        const t = now + i * 0.032;
        this._tone(hz, t, 0.42, 'triangle', 0.14);
        this._tone(hz * 2, t, 0.24, 'sine', 0.06);
      });
      // Sub warmth punch
      this._tone(root * 0.5, now, 0.28, 'sine', 0.18, root * 0.49);
    }

    playGapCreate() {
      if (!this.ctx || this.muted) return;
      const now = this.ctx.currentTime;
      this._noise(now, 0.22, 'bandpass', 4200, 700, 0.28, 3.5);
      this._tone(960, now, 0.18, 'sawtooth', 0.16, 170);
      this._tone(1840, now + 0.015, 0.12, 'square', 0.08, 420);
    }

    playGapBlock() {
      if (!this.ctx || this.muted) return;
      const now = this.ctx.currentTime;
      this._noise(now, 0.16, 'highpass', 2400, 1100, 0.24, 2.0);
      this._tone(520, now, 0.14, 'sawtooth', 0.16, 880);
      this._tone(1046.5, now + 0.04, 0.22, 'triangle', 0.15, 1318.5);
    }

    playSeekerShatter() {
      if (!this.ctx || this.muted) return;
      const now = this.ctx.currentTime;
      this._noise(now, 0.35, 'bandpass', 3200, 260, 0.34, 1.4);
      this._tone(240, now, 0.32, 'sawtooth', 0.22, 55);
      [523.25, 659.25, 783.99, 1046.5].forEach((hz, i) => {
        this._tone(hz, now + 0.03 + i * 0.035, 0.28, 'sine', 0.12);
      });
    }

    playShardPickup() {
      if (!this.ctx || this.muted) return;
      const now = this.ctx.currentTime;
      [659.25, 880, 1174.66, 1567.98].forEach((hz, i) => {
        this._tone(hz, now + i * 0.045, 0.26, 'sine', 0.13);
      });
    }

    playOverdrive() {
      if (!this.ctx || this.muted) return;
      const now = this.ctx.currentTime;
      const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.5];
      notes.forEach((hz, i) => {
        this._tone(hz, now + i * 0.045, 0.55, 'sawtooth', 0.09);
        this._tone(hz * 2, now + i * 0.045, 0.45, 'sine', 0.08);
      });
    }

    playPlayerHit() {
      if (!this.ctx || this.muted) return;
      const now = this.ctx.currentTime;
      this._noise(now, 0.42, 'lowpass', 1800, 120, 0.36, 1.5);
      this._tone(280, now, 0.45, 'sawtooth', 0.24, 48);
      this._tone(190, now + 0.05, 0.42, 'square', 0.14, 42);
    }

    playLevelClear() {
      if (!this.ctx || this.muted) return;
      const now = this.ctx.currentTime;
      const arp = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50, 1318.51];
      arp.forEach((hz, i) => {
        const t = now + i * 0.06;
        this._tone(hz, t, 0.65, 'triangle', 0.14);
        this._tone(hz * 1.5, t + 0.02, 0.5, 'sine', 0.07);
      });
      this._tone(130.81, now, 0.8, 'sine', 0.22);
    }
  }

  G.SoundEngine = SoundEngine;
})(window.Gapper);
