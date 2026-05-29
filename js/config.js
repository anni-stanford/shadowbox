/*
 * config.js — small global config + OpenAI API key storage.
 * The key lives only in this browser's localStorage. It is never sent
 * anywhere except api.openai.com when the coach asks for commentary.
 */
window.SB = window.SB || {};

SB.config = {
  KEY_STORAGE: "shadowbox_openai_key",

  getKey() {
    return localStorage.getItem(this.KEY_STORAGE) || "";
  },
  setKey(k) {
    if (k) localStorage.setItem(this.KEY_STORAGE, k);
    else localStorage.removeItem(this.KEY_STORAGE);
  },
  hasKey() {
    return !!this.getKey();
  },
};

// The compact move vocabulary the whole game understands.
SB.MOVES = ["jab", "cross", "hook", "slip", "block"];

SB.MOVE_LABEL = {
  jab: "Jab",
  cross: "Cross",
  hook: "Hook",
  slip: "Slip",
  block: "Block",
};
