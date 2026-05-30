/*
 * music.js — background fight music.
 *
 * Plays a looping audio track (assets/theme.mp3, supplied by the project owner)
 * with a small 🔊/🔇 toggle whose state is remembered. Browsers block autoplay
 * with sound until a user gesture, so playback begins on the first tap/click.
 */
window.SB = window.SB || {};

SB.Music = {
  KEY: "shadowbox_music_off",
  TRACK: "assets/theme.mp3",
  audio: null,
  _started: false,

  enabled() { return localStorage.getItem(this.KEY) !== "1"; },

  init() {
    this.btn = document.getElementById("music-toggle");
    this.audio = new Audio(this.TRACK);
    this.audio.loop = true;
    this.audio.volume = 0.55;
    this.audio.preload = "auto";

    if (this.btn) this.btn.addEventListener("click", () => this.toggle());
    this._render();

    // Audio can only start after a user gesture — start on the first interaction.
    const startOnGesture = () => {
      this._started = true;
      if (this.enabled()) this.play();
      window.removeEventListener("pointerdown", startOnGesture);
    };
    window.addEventListener("pointerdown", startOnGesture, { once: true });
  },

  play() {
    if (!this.audio) return;
    const p = this.audio.play();
    if (p && p.catch) p.catch(() => {}); // ignore autoplay-policy rejections
    this._render();
  },

  stop() {
    if (!this.audio) return;
    this.audio.pause();
    this._render();
  },

  toggle() {
    const turnOn = !this.enabled();
    localStorage.setItem(this.KEY, turnOn ? "0" : "1");
    if (turnOn) this.play();
    else this.stop();
    this._render();
  },

  _render() { if (this.btn) this.btn.textContent = this.enabled() ? "🔊" : "🔇"; },
};
