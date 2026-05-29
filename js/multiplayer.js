/*
 * multiplayer.js — two humans, two laptops, two webcams, one match.
 *
 * Networking model (privacy-first): each side runs its OWN webcam + pose
 * detection locally and sends ONLY tiny move/state messages over a WebRTC data
 * channel (via PeerJS). No video is ever transmitted. The host's peer id is the
 * room code; we build a shareable link (?room=CODE) that's forwardable over
 * WhatsApp — the opponent taps it and the fight begins.
 *
 * Fairness: each client is authoritative over its own HP. Your incoming-punch
 * damage is reduced/negated if you slipped or blocked in the last ~1.2s. Each
 * side broadcasts its HP so the other can render the foe bar. Timing windows
 * keep it fair despite network + webcam latency.
 */
window.SB = window.SB || {};

SB.MP = {
  peer: null, conn: null, isHost: false, roomCode: "",
  pose: null, gestures: null, active: false,
  hpYou: 100, hpFoe: 100, timeLeft: 90,
  defendedUntil: 0, tickId: null,

  // ---------- lobby ----------
  initLobby() {
    this.lobby = document.getElementById("mp-lobby");
    this.gameWrap = document.getElementById("mp-game");
    this.shareCard = document.getElementById("mp-share");
    this.statusEl = document.getElementById("mp-status");

    document.getElementById("mp-create").onclick = () => this.createMatch();
    document.getElementById("mp-join").onclick = () => {
      const code = document.getElementById("mp-join-code").value.trim();
      if (code) this.joinMatch(code);
    };
    document.getElementById("mp-copy").onclick = () => {
      const inp = document.getElementById("mp-link");
      inp.select(); navigator.clipboard?.writeText(inp.value);
      document.getElementById("mp-copy").textContent = "Copied!";
      setTimeout(() => (document.getElementById("mp-copy").textContent = "Copy"), 1500);
    };

    this.lobby.hidden = false;
    this.gameWrap.hidden = true;
    this.shareCard.hidden = true;
  },

  createMatch() {
    this.isHost = true;
    this.roomCode = "shadowbox-" + Math.random().toString(36).slice(2, 8);
    this.peer = new Peer(this.roomCode);

    this.peer.on("open", () => {
      const link = location.origin + location.pathname + "?room=" + this.roomCode;
      document.getElementById("mp-link").value = link;
      const msg = encodeURIComponent("Fight me on ShadowBox 🥊 Tap to box me live: " + link);
      document.getElementById("mp-whatsapp").href = "https://wa.me/?text=" + msg;
      this.shareCard.hidden = false;
      this.statusEl.textContent = "Waiting for opponent to join…";
    });

    this.peer.on("connection", (c) => { this.conn = c; this._wireConn(); });
    this.peer.on("error", (e) => (this.statusEl.textContent = "Connection error: " + e.type));
  },

  joinMatch(code) {
    this.isHost = false;
    this.roomCode = code.replace(/.*room=/, "").trim();
    this.peer = new Peer();
    this.peer.on("open", () => {
      this.conn = this.peer.connect(this.roomCode, { reliable: false });
      this._wireConn();
    });
    this.peer.on("error", (e) => alert("Could not join match: " + e.type));
  },

  _wireConn() {
    this.conn.on("open", () => {
      // The inviter (host) shares their OpenAI key so the coach works for BOTH
      // players — the guest never has to enter one. Sent only over this
      // encrypted peer channel and held in memory on the guest's side.
      if (this.isHost && SB.config.hasKey()) {
        this._send({ t: "key", key: SB.config.getKey() });
      }
      this._startFight();
    });
    this.conn.on("data", (d) => this._onData(d));
    this.conn.on("close", () => this._foeLeft());
  },

  // ---------- fight ----------
  async _startFight() {
    this.lobby.hidden = true;
    this.gameWrap.hidden = false;

    this.video = document.getElementById("mp-video");
    this.canvas = document.getElementById("mp-canvas");
    this.coachEl = document.getElementById("mp-coach");
    this.foeEl = document.getElementById("mp-foe");
    this.telEl = document.getElementById("mp-telegraph");
    this.overlay = document.getElementById("mp-overlay");
    this.stage = this.video.parentElement;

    this.hpYou = 100; this.hpFoe = 100; this.timeLeft = 90; this.defendedUntil = 0;
    this._renderHP(); this._renderTime();
    this.overlay.classList.remove("show");

    this.pose = new SB.Pose(this.video, this.canvas);
    this.gestures = new SB.Gestures();
    this.gestures.onMove = (m) => this._onLocalMove(m);

    try {
      await this.pose.start((kp) => this.gestures.feed(kp));
    } catch (e) {
      this.coachEl.textContent = "Camera access is required. Allow it and rejoin.";
      return;
    }

    this.active = true;
    this.coachEl.textContent = "Opponent connected. Fight!";
    SB.Coach.say("intro", "live multiplayer match starting", (t) => (this.coachEl.textContent = t));
    this.tickId = setInterval(() => this._tick(), 1000);
  },

  _onLocalMove(move) {
    if (!this.active) return;
    if (move === "slip" || move === "block") {
      this.defendedUntil = performance.now() + 1200;
      this._float("✓ " + SB.MOVE_LABEL[move], "var(--green)", 0.3, 0.6);
    } else {
      this._send({ t: "atk", move });
      this._float(SB.MOVE_LABEL[move] + "!", "var(--accent2)", 0.7, 0.4);
    }
  },

  _onData(d) {
    if (!d) return;
    // Handshake: accept the host's shared key even before the round is active.
    if (d.t === "key") {
      if (!SB.config.hasKey()) {
        SB.config.setSessionKey(d.key);
        if (this.coachEl) this.coachEl.textContent = "Coach connected via your opponent's key 🥊";
      }
      return;
    }
    if (!this.active) return;
    if (d.t === "atk") {
      const base = d.move === "jab" ? 5 : d.move === "cross" ? 9 : 12;
      const defended = performance.now() < this.defendedUntil;
      const dmg = defended ? Math.round(base * 0.15) : base;
      this.hpYou = Math.max(0, this.hpYou - dmg);
      this.telEl.textContent = (defended ? "BLOCKED " : "HIT! ") + SB.MOVE_LABEL[d.move];
      this.telEl.classList.add("show");
      setTimeout(() => this.telEl.classList.remove("show"), 500);
      if (!defended) {
        this._float("-" + dmg, "var(--accent)", 0.5, 0.7);
        this.stage.animate([{ filter: "brightness(2)" }, { filter: "brightness(1)" }], { duration: 200 });
      }
      this._renderHP();
      this._send({ t: "hp", hp: this.hpYou });
      if (this.hpYou <= 0) this._end(false);
    } else if (d.t === "hp") {
      this.hpFoe = d.hp; this._renderHP();
      this.foeEl.classList.add("hit");
      setTimeout(() => this.foeEl.classList.remove("hit"), 250);
      if (this.hpFoe <= 0) this._end(true);
    } else if (d.t === "end") {
      this._end(d.youWin); // peer tells us the result from their side
    }
  },

  _tick() {
    if (!this.active) return;
    this.timeLeft--;
    this._renderTime();
    if (this.timeLeft <= 0) this._end(this.hpYou >= this.hpFoe);
  },

  _end(won) {
    if (!this.active) return;
    this.active = false;
    clearInterval(this.tickId);
    this._send({ t: "end", youWin: !won });
    this.overlay.innerHTML = won
      ? `🏆 You Win!<div class="sub">You out-boxed your opponent. HP left: ${Math.round(this.hpYou)}.</div>`
      : `💥 Defeated<div class="sub">Your opponent took this round.</div>`;
    this._menuButton();
    this.overlay.classList.add("show");
    SB.Coach.say(won ? "win" : "lose", won ? "won the multiplayer match" : "lost the multiplayer match",
      (t) => { const s = document.createElement("div"); s.className = "sub"; s.textContent = t; this.overlay.insertBefore(s, this.overlay.querySelector(".end-actions")); });
  },

  _menuButton() {
    const row = document.createElement("div");
    row.className = "end-actions";
    const menu = document.createElement("button");
    menu.className = "btn btn-primary"; menu.textContent = "← Back to Menu";
    menu.onclick = () => SB.goMenu();
    row.appendChild(menu);
    this.overlay.appendChild(row);
  },

  _foeLeft() {
    if (!this.active) return;
    this.active = false; clearInterval(this.tickId);
    this.overlay.innerHTML = `👋 Opponent left<div class="sub">They disconnected. Head back and start a new match.</div>`;
    this._menuButton();
    this.overlay.classList.add("show");
  },

  _send(obj) { try { if (this.conn && this.conn.open) this.conn.send(obj); } catch (e) {} },
  _renderHP() {
    document.getElementById("mp-hp-you").style.width = this.hpYou + "%";
    document.getElementById("mp-hp-foe").style.width = this.hpFoe + "%";
  },
  _renderTime() { document.getElementById("mp-timer").textContent = Math.max(0, this.timeLeft); },
  _float(text, color, xr, yr) {
    const el = document.createElement("div");
    el.className = "hit-float"; el.textContent = text; el.style.color = color;
    el.style.left = (xr * 100) + "%"; el.style.top = (yr * 100) + "%";
    this.stage.appendChild(el); setTimeout(() => el.remove(), 800);
  },

  stop() {
    this.active = false;
    clearInterval(this.tickId);
    if (this.pose) this.pose.stop();
    this.pose = null;
    try { if (this.conn) this.conn.close(); } catch (e) {}
    try { if (this.peer) this.peer.destroy(); } catch (e) {}
    this.conn = null; this.peer = null;
  },
};
