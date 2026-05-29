/*
 * game.js — Single-player fight vs a reactive AI opponent.
 *
 * The game-design trick that makes webcam boxing actually work: the opponent
 * TELEGRAPHS attacks ("JAB INCOMING") and gives you a reaction beat to slip or
 * block. Timing windows hide webcam/processing latency, and we only need the
 * move *category* (not perfect form), which single-cam pose does reliably.
 *
 *   - You attack (jab/cross/hook) -> damages the AI unless it's guarding.
 *   - AI telegraphs -> you must slip or block in the window or you take damage.
 *   - 90s round, most HP wins (or KO at 0 HP).
 *
 * SB.Single owns the loop; the scoring helpers are reused by multiplayer.
 */
window.SB = window.SB || {};

SB.Single = {
  pose: null, gestures: null, active: false,
  hpYou: 100, hpAI: 100, timeLeft: 90,
  aiState: "idle", // idle | telegraph | striking
  aiGuard: false,
  defended: false,
  loopId: null, tickId: null,

  async start() {
    this.video = document.getElementById("single-video");
    this.canvas = document.getElementById("single-canvas");
    this.coachEl = document.getElementById("single-coach");
    this.foeEl = document.getElementById("single-foe");
    this.telEl = document.getElementById("single-telegraph");
    this.overlay = document.getElementById("single-overlay");
    this.stage = this.video.parentElement;

    this.hpYou = 100; this.hpAI = 100; this.timeLeft = 90;
    this._renderHP(); this._renderTime();
    this.overlay.classList.remove("show");

    this.pose = new SB.Pose(this.video, this.canvas);
    this.gestures = new SB.Gestures();
    this.gestures.onMove = (m, meta) => this._onPlayerMove(m, meta);

    this.coachEl.textContent = "Starting camera…";
    try {
      await this.pose.start((kp) => this.gestures.feed(kp));
    } catch (e) {
      this.coachEl.textContent = "Camera access is required to fight. Allow it and reopen.";
      return;
    }

    this.active = true;
    SB.Coach.say("intro", "single player round vs AI starting", (t) => (this.coachEl.textContent = t));
    this.tickId = setInterval(() => this._tick(), 1000);
    this._aiBrain();
  },

  _onPlayerMove(move) {
    if (!this.active) return;
    if (move === "jab" || move === "cross" || move === "hook") {
      const base = move === "jab" ? 5 : move === "cross" ? 9 : 12;
      const dmg = this.aiGuard ? Math.round(base * 0.2) : base;
      this.hpAI = Math.max(0, this.hpAI - dmg);
      this._float(this.aiGuard ? "block" : "-" + dmg, this.aiGuard ? "#8fa" : "var(--accent2)", 0.7, 0.4);
      this.foeEl.classList.add("hit");
      setTimeout(() => this.foeEl.classList.remove("hit"), 300);
      this._renderHP();
      if (this.hpAI <= 0) this._end(true);
    } else if (move === "slip" || move === "block") {
      if (this.aiState === "telegraph" || this.aiState === "striking") {
        this.defended = true;
        this._float("✓ " + SB.MOVE_LABEL[move], "var(--green)", 0.3, 0.5);
      }
    }
  },

  // The AI cycles: think -> telegraph -> strike, with adaptive aggression.
  async _aiBrain() {
    while (this.active) {
      await this._sleep(900 + Math.random() * 1400);
      if (!this.active) break;

      // Telegraph
      this.aiState = "telegraph";
      this.defended = false;
      const attack = Math.random() < 0.5 ? "JAB" : Math.random() < 0.5 ? "CROSS" : "HOOK";
      this.telEl.textContent = attack + " INCOMING";
      this.telEl.classList.add("show");
      this.foeEl.classList.add("attack");

      await this._sleep(1100); // reaction beat for the player
      if (!this.active) break;

      // Strike resolves
      this.aiState = "striking";
      this.telEl.classList.remove("show");
      this.foeEl.classList.remove("attack");
      if (!this.defended) {
        const dmg = 6 + Math.floor(Math.random() * 8);
        this.hpYou = Math.max(0, this.hpYou - dmg);
        this._float("-" + dmg, "var(--accent)", 0.5, 0.7);
        this.stage.animate(
          [{ filter: "brightness(2.2)" }, { filter: "brightness(1)" }],
          { duration: 220 }
        );
        this._renderHP();
        if (Math.random() < 0.4) SB.Coach.say("fix", "took a clean shot, guard slipped", (t) => (this.coachEl.textContent = t));
        if (this.hpYou <= 0) { this._end(false); break; }
      } else {
        if (Math.random() < 0.4) SB.Coach.say("good", "great defense, slipped the shot", (t) => (this.coachEl.textContent = t));
      }
      this.aiState = "idle";

      // Brief guard window where AI defends your shots.
      if (Math.random() < 0.5) {
        this.aiGuard = true; this.foeEl.textContent = "🛡️";
        await this._sleep(700);
        this.aiGuard = false; this.foeEl.textContent = "🤖";
      }
    }
  },

  _tick() {
    if (!this.active) return;
    this.timeLeft--;
    this._renderTime();
    if (this.timeLeft <= 0) this._end(this.hpYou >= this.hpAI);
  },

  _end(won) {
    if (!this.active) return;
    this.active = false;
    clearInterval(this.tickId);
    this.overlay.innerHTML = won
      ? `🏆 You Win!<div class="sub">You out-boxed the AI. HP left: ${Math.round(this.hpYou)}.</div>`
      : `💥 Knocked Down<div class="sub">The AI took this one. Reset your guard and run it back.</div>`;
    this.overlay.classList.add("show");
    SB.Coach.say(won ? "win" : "lose", won ? "player won the round" : "player lost the round",
      (t) => { const s = document.createElement("div"); s.className = "sub"; s.textContent = t; this.overlay.appendChild(s); });
  },

  _renderHP() {
    document.getElementById("single-hp-you").style.width = this.hpYou + "%";
    document.getElementById("single-hp-ai").style.width = this.hpAI + "%";
  },
  _renderTime() { document.getElementById("single-timer").textContent = Math.max(0, this.timeLeft); },

  _float(text, color, xr, yr) {
    const el = document.createElement("div");
    el.className = "hit-float"; el.textContent = text; el.style.color = color;
    el.style.left = (xr * 100) + "%"; el.style.top = (yr * 100) + "%";
    this.stage.appendChild(el);
    setTimeout(() => el.remove(), 800);
  },
  _sleep(ms) { return new Promise((r) => setTimeout(r, ms)); },

  stop() {
    this.active = false;
    clearInterval(this.tickId);
    if (this.pose) this.pose.stop();
    this.pose = null;
  },
};
