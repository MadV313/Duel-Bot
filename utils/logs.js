// utils/logs.js
export const L = {
  duel:   (...a)=>console.log("[DUEL]", ...a),
  trade:  (...a)=>console.log("[TRADE]", ...a),
  storage:(...a)=>console.log("[STORAGE]", ...a),
  role:   (...a)=>console.log("[ROLE]", ...a),
  econ:   (...a)=>console.log("[ECONOMY]", ...a),
  err:    (...a)=>console.error("[ERROR]", ...a),
};
