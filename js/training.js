/*
 * training.js — Training mode.
 *
 * Walks the player through the move vocabulary one prompt at a time. It asks
 * for a move ("THROW A JAB"), opens a timing window, and grades whether the
 * right move arrived in time. Tracks reps + accuracy and pipes occasional
 * coach lines through SB.Coach. This is the "boxing tutor" layer.
 */
window.SB = window.SB || {};

SB.Training = {
  pose: null,
  gestures: null,
  active: false,
  drill: [],
  idx: 0,
  awaiting: null,
  windowTimer: null,
  reps: 0,
  attempts: 0,
  hits: 0,

  async start() {
    const video = document.getElementById("training-video");
    const canvas = document.getElementById("training-canvas");
    this.coachEl = document.getElementById("training-coach");
    this.promptEl = document.getElementById("training-prompt");
    this.scoreEl = document.getElementById("training-score");
    this.accEl = document.getElementById("training-acc");

    this.reps = 0; this.attempts = 0; this.hits = 0;
    this._renderScore();
    this._buildDrill();

    this.pose = new SB.Pose(video, canvas);
    this.gestures = new SB.Gestures();
    this.gestures.onMove = (m) => this._onMove(m);

    this.coachEl.textContent = "Starting camera…";
    try {
      await this.pose.start((kp) => this.gestures.feed(kp));
    } catch (e) {
      this.coachEl.textContent = "Camera access is required to train. Please allow it and reopen.";
      return;
    }
    this.active = true;
    SB.Coach.say("intro", "training session starting", (t) => (this.coachEl.textContent = t));
    setTimeout(() => this._next(), 1500);
  },

  _buildDrill() {
    // A friendly progression, repeated.
    const base = ["jab", "cross", "jab", "hook", "slip", "block", "cross", "hook"];
    this.drill = [];
    for (let r = 0; r < 4; r++) this.drill = this.drill.concat(base);
    this.idx = 0;

    const list = document.getElementById("training-movelist");
    list.innerHTML = "";
    SB.MOVES.forEach((m) => {
      const chip = document.createElement("div");
      chip.className = "move-chip"; chip.id = "tc-" + m;
      chip.innerHTML = `<span>${SB.MOVE_LABEL[m]}</span><span class="cnt" id="tcc-${m}">0</span>`;
      list.appendChild(chip);
    });
  },

  _next() {
    if (!this.active) return;
    if (this.idx >= this.drill.length) {
      this.promptEl.textContent = "Drill complete! 🥊";
      SB.Coach.say("win", `finished training, ${this.hits} clean reps`, (t) => (this.coachEl.textContent = t));
      return;
    }
    const move = this.drill[this.idx];
    this.awaiting = move;
    this.promptEl.textContent = "THROW: " + SB.MOVE_LABEL[move].toUpperCase();
    clearTimeout(this.windowTimer);
    this.windowTimer = setTimeout(() => this._miss(), 2600);
  },

  _onMove(move) {
    if (!this.active || !this.awaiting) return;
    this.attempts++;
    // Front-on, a jab and a cross look almost identical to a single camera,
    // so accept either straight punch when a straight punch is requested.
    const straight = (m) => m === "jab" || m === "cross";
    const correct = move === this.awaiting || (straight(move) && straight(this.awaiting));
    if (correct) {
      this.hits++; this.reps++;
      const c = document.getElementById("tcc-" + move);
      if (c) c.textContent = (parseInt(c.textContent) || 0) + 1;
      document.getElementById("tc-" + move)?.classList.add("done");
      this._flash("✓ " + SB.MOVE_LABEL[move], "var(--green)");
      if (Math.random() < 0.4) SB.Coach.say("good", `clean ${move}`, (t) => (this.coachEl.textContent = t));
      this._advance();
    } else {
      this._flash("✗ that was a " + SB.MOVE_LABEL[move], "var(--accent)");
      if (Math.random() < 0.5) SB.Coach.say("fix", `threw ${move} instead of ${this.awaiting}`, (t) => (this.coachEl.textContent = t));
    }
    this._renderScore();
  },

  _miss() {
    if (!this.awaiting) return;
    this.attempts++;
    this._flash("⏱ too slow", "var(--accent2)");
    this._renderScore();
    this._advance();
  },

  _advance() {
    this.awaiting = null;
    clearTimeout(this.windowTimer);
    this.idx++;
    setTimeout(() => this._next(), 700);
  },

  _flash(text, color) {
    this.promptEl.textContent = text;
    this.promptEl.style.borderColor = color;
    setTimeout(() => (this.promptEl.style.borderColor = "var(--accent)"), 500);
  },

  _renderScore() {
    this.scoreEl.textContent = this.reps;
    this.accEl.textContent = this.attempts ? Math.round((this.hits / this.attempts) * 100) + "%" : "—";
  },

  stop() {
    this.active = false;
    clearTimeout(this.windowTimer);
    if (this.pose) this.pose.stop();
    this.pose = null;
  },
};
