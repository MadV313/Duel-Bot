// scripts/config.js

/**
 * Core front-end configuration constants for the SV13 Duel Bot system.
 * All UIs and backends reference this file to ensure consistent URLs
 * and environment behavior across modules.
 */

export const config = {
  // 🌐 Main backend API (Node/Express on Railway)
  backend_url: 'https://duel-bot-backend-production.up.railway.app',

  // 🃏 Maximum collectible cards (master CCG count)
  max_cards: 127,

  // 🧩 External UIs — keep synced with GitHub Pages deploys
  pack_reveal_ui: 'https://madv313.github.io/Pack-Reveal-UI/',
  duel_ui: 'https://madv313.github.io/Duel-UI/',
  stats_ui: 'https://madv313.github.io/Stats-Leaderboard-UI/',
  collection_ui: 'https://madv313.github.io/Collection-UI/',

  // 🧱 Optional reserved keys for future expansion
  // e.g., hub_ui, rulebook_ui, tournament_ui, etc.
};
