/*
 * gestures.js — turns a stream of pose keypoints into boxing moves.
 *
 * Design philosophy (the honest part): a single webcam can't measure depth,
 * so we don't try to grade millimetre-perfect technique. For a *game* we only
 * need a reliable category + timing: jab, cross, hook, slip, block. We use
 * velocity + relative-position heuristics with per-move cooldowns, which is
 * robust on an ordinary laptop camera and hides latency behind timing windows.
 *
 * Coordinates are in video pixels. Because the view is mirrored, the player's
 * physical right hand appears on the left of the frame; we classify by lead vs
 * rear hand rather than literal left/right so it works for any stance.
 *
 * Emits SB.Gestures.onMove(moveName, meta) at most once per cooldown window.
 */
window.SB = window.SB || {};

SB.Gestures = class {
  constructor() {
    this.onMove = null;
    this.prev = null;          // previous frame keypoints
    this.prevT = 0;
    this.lastMoveAt = {};      // per-move cooldown timestamps
    this.cooldownMs = 450;
    this.guardUpSince = 0;
    this.shoulderWidth = 120;  // running estimate for normalization
  }

  feed(kp) {
    const t = performance.now();
    const need = ["left_wrist", "right_wrist", "left_shoulder", "right_shoulder", "nose"];
    for (const n of need) if (!kp[n] || kp[n].score < 0.25) { this.prev = kp; this.prevT = t; return; }

    const ls = kp.left_shoulder, rs = kp.right_shoulder;
    const sw = Math.hypot(ls.x - rs.x, ls.y - rs.y) || this.shoulderWidth;
    this.shoulderWidth = this.shoulderWidth * 0.9 + sw * 0.1;
    const SW = this.shoulderWidth;
    const shoulderMidX = (ls.x + rs.x) / 2;
    const shoulderMidY = (ls.y + rs.y) / 2;

    // ---- BLOCK: both wrists raised near the face (guard up) ----
    const lw = kp.left_wrist, rw = kp.right_wrist, nose = kp.nose;
    const lwUp = lw.y < nose.y + SW * 0.4;
    const rwUp = rw.y < nose.y + SW * 0.4;
    const wristsNarrow = Math.abs(lw.x - rw.x) < SW * 1.3;
    if (lwUp && rwUp && wristsNarrow) {
      if (!this.guardUpSince) this.guardUpSince = t;
      if (t - this.guardUpSince > 180) this._emit("block", t, { hold: true });
    } else {
      this.guardUpSince = 0;
    }

    // ---- SLIP: head shifts laterally well off the shoulder midline ----
    const headOffset = (nose.x - shoulderMidX) / SW;
    if (Math.abs(headOffset) > 0.55) {
      this._emit("slip", t, { dir: headOffset > 0 ? "right" : "left" });
    }

    // velocity needs a previous frame
    if (this.prev && this.prevT) {
      const dt = Math.max(1, t - this.prevT);
      for (const side of ["left", "right"]) {
        const w = kp[side + "_wrist"];
        const pw = this.prev[side + "_wrist"];
        const sh = kp[side + "_shoulder"];
        if (!w || !pw || !sh || w.score < 0.3) continue;

        const vx = (w.x - pw.x) / dt; // px per ms
        const vy = (w.y - pw.y) / dt;
        const speed = Math.hypot(vx, vy);
        const reach = Math.hypot(w.x - sh.x, w.y - sh.y) / SW; // arm extension in shoulder-widths
        const atHeadHeight = w.y < shoulderMidY + SW * 0.2;

        // Fast extension forward/up = straight punch (jab/cross).
        if (speed > 0.9 && reach > 1.0 && atHeadHeight) {
          // lead hand (closer to camera centre horizontally) => jab, rear => cross
          const isLead = Math.abs(w.x - shoulderMidX) < Math.abs((this.prev[side + "_wrist"].x) - shoulderMidX) + SW;
          // hook = large horizontal velocity with arm bent across at head height
          const horizontal = Math.abs(vx) > Math.abs(vy) * 1.3;
          if (horizontal && reach > 0.8 && reach < 1.7) {
            this._emit("hook", t, { side });
          } else {
            this._emit(isLead ? "jab" : "cross", t, { side });
          }
        }
      }
    }

    this.prev = kp;
    this.prevT = t;
  }

  _emit(move, t, meta) {
    if (t - (this.lastMoveAt[move] || 0) < this.cooldownMs) return;
    this.lastMoveAt[move] = t;
    if (this.onMove) this.onMove(move, meta || {});
  }

  reset() {
    this.prev = null; this.prevT = 0; this.lastMoveAt = {}; this.guardUpSince = 0;
  }
};
