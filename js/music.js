/*
 * music.js — original, royalty-free fight-music loop (Web Audio API).
 *
 * Rather than ship a copyrighted track, ShadowBox synthesizes its own dark,
 * driving techno loop (kick / hat / snare + a minor bassline and synth stabs)
 * in the spirit of an arcade fighting game. A small 🔊/🔇 button toggles it,
 * and the preference is remembered. Browsers only allow audio after a user
 * gesture, so it starts on the first tap/click.
 */
window.SB = window.SB || {};

SB.Music = {
  KEY: "shadowbox_music_off",
  ctx: null, master: null, noiseBuf: null,
  on: false, _timer: null, _step: 0, _next: 0,
  TEMPO: 130,

  enabled() { return localStorage.getItem(this.KEY) !== "1"; },

  init() {
    this.btn = document.getElementById("music-toggle");
    if (this.btn) this.btn.addEventListener("click", () => this.toggle());
    this._render();
    // Audio can only start after a user gesture — hook the first interaction.
    const startOnGesture = () => { this._ensure(); window.removeEventListener("pointerdown", startOnGesture); };
    window.addEventListener("pointerdown", startOnGesture, { once: true });
  },

  _ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.0;
      this.master.connect(this.ctx.destination);
      // one reusable white-noise buffer for drums
      const len = this.ctx.sampleRate * 1;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    if (this.enabled()) this.play();
  },

  toggle() {
    const turnOn = !this.enabled();          // flip the saved preference
    localStorage.setItem(this.KEY, turnOn ? "0" : "1");
    if (!this.ctx) { this._ensure(); }
    else if (turnOn) { this.play(); }
    else { this.stop(); }
    this._render();
  },

  play() {
    if (!this.ctx) { this._ensure(); return; }
    if (this.ctx.state === "suspended") this.ctx.resume();
    this.on = true;
    this.master.gain.setTargetAtTime(0.16, this.ctx.currentTime, 0.2);
    if (!this._timer) { this._step = 0; this._next = this.ctx.currentTime + 0.1; this._loop(); }
    this._render();
  },

  stop() {
    this.on = false;
    if (this.master) this.master.gain.setTargetAtTime(0.0, this.ctx.currentTime, 0.1);
    clearTimeout(this._timer); this._timer = null;
    this._render();
  },

  _render() { if (this.btn) this.btn.textContent = this.enabled() ? "🔊" : "🔇"; },

  _loop() {
    if (!this.on) { this._timer = null; return; }
    const sixteenth = 60 / this.TEMPO / 4;
    while (this._next < this.ctx.currentTime + 0.2) {
      this._schedule(this._step, this._next);
      this._next += sixteenth;
      this._step = (this._step + 1) % 32;
    }
    this._timer = setTimeout(() => this._loop(), 45);
  },

  _schedule(step, t) {
    const s16 = step % 16;
    // Drums — four-on-the-floor kick, backbeat snare, driving hats.
    if (step % 4 === 0) this._kick(t);
    if (s16 === 4 || s16 === 12) this._snare(t);
    this._hat(t, step % 2 === 0 ? 0.18 : 0.1);

    // Dark minor bassline (offsets in semitones from A1 = 55Hz).
    const bass = [0, 0, 12, 0, 3, 0, 0, 10, 5, 0, 3, 0, 0, 0, -2, 7];
    if (bass[s16] !== undefined && (step % 2 === 0)) {
      this._bass(t, 55 * Math.pow(2, bass[s16] / 12));
    }

    // Ominous synth stab to open each bar (minor chord).
    if (s16 === 0 || s16 === 11) this._stab(t);
  },

  _kick(t) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(1.0, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.22);
  },

  _snare(t) {
    const n = this.ctx.createBufferSource(); n.buffer = this.noiseBuf;
    const bp = this.ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1800;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    n.connect(bp).connect(g).connect(this.master); n.start(t); n.stop(t + 0.2);
  },

  _hat(t, amp) {
    const n = this.ctx.createBufferSource(); n.buffer = this.noiseBuf;
    const hp = this.ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 7000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(amp, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    n.connect(hp).connect(g).connect(this.master); n.start(t); n.stop(t + 0.06);
  },

  _bass(t, freq) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(), lp = this.ctx.createBiquadFilter();
    o.type = "sawtooth"; o.frequency.value = freq;
    lp.type = "lowpass"; lp.frequency.value = 600; lp.Q.value = 6;
    g.gain.setValueAtTime(0.0, t);
    g.gain.linearRampToValueAtTime(0.32, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.connect(lp).connect(g).connect(this.master); o.start(t); o.stop(t + 0.18);
  },

  _stab(t) {
    // A minor triad (A, C, E) detuned saws with a quick filter sweep.
    const freqs = [220, 261.6, 329.6];
    const lp = this.ctx.createBiquadFilter(); lp.type = "lowpass";
    lp.frequency.setValueAtTime(2400, t); lp.frequency.exponentialRampToValueAtTime(500, t + 0.3); lp.Q.value = 8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0, t);
    g.gain.linearRampToValueAtTime(0.12, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    g.connect(this.master); lp.connect(g);
    freqs.forEach((f) => {
      const o = this.ctx.createOscillator(); o.type = "sawtooth";
      o.frequency.value = f; o.detune.value = (Math.random() * 12 - 6);
      o.connect(lp); o.start(t); o.stop(t + 0.36);
    });
  },
};
