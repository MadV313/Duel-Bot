// utils/config.js

export const config = {
  token_env: process.env.TOKEN_ENV || 'DISCORD_TOKEN',

  // 🔐 Sensitive env-only fields
  admin_api_key: process.env.ADMIN_API_KEY,
  admin_payout_channel_id: process.env.ADMIN_PAYOUT_CHANNEL_ID,
  admin_role_ids: (process.env.ADMIN_ROLE_IDS || '').split(','),
  battlefield_channel_id: process.env.BATTLEFIELD_CHANNEL_ID,
  economy_channel_id: process.env.ECONOMY_CHANNEL_ID,
  founder_role_id: process.env.FOUNDER_ROLE_ID,
  manage_cards_channel_id: process.env.MANAGE_CARDS_CHANNEL_ID,
  manage_deck_channel_id: process.env.MANAGE_DECK_CHANNEL_ID,

  // 🔗 External data files (still local paths)
  linked_decks_file: './data/linked_decks.json',
  duel_summary_file: './public/data/duel_summary.json',

  // 🌐 UI URLs
  ui_urls: {
    hub_ui: process.env.HUB_UI || 'https://madv313.github.io/HUB-UI/',
    card_collection_ui: process.env.CARD_COLLECTION_UI || 'https://madv313.github.io/Card-Collection-UI/',
    pack_reveal_ui: process.env.PACK_REVEAL_UI || 'https://madv313.github.io/Pack-Reveal-UI/',
    deck_builder_ui: process.env.DECK_BUILDER_UI || 'https://madv313.github.io/Deck-Builder-UI/',
    stats_leaderboard_ui: process.env.STATS_LEADERBOARD_UI || 'https://madv313.github.io/Stats-Leaderboard-UI/',
    duel_summary_ui: process.env.DUEL_SUMMARY_UI || 'https://madv313.github.io/Duel-Summary-UI/',
    spectator_view_ui: process.env.SPECTATOR_VIEW_UI || 'https://madv313.github.io/Spectator-View-UI/',
    duel_ui: process.env.DUEL_UI || 'https://madv313.github.io/Duel-UI/',
  },

  // 💰 Coin system logic
  coin_system: {
    card_pack_cost: parseFloat(process.env.CARD_PACK_COST || '3'),
    card_sell_values: {
      common: parseFloat(process.env.SELL_VALUE_COMMON || '0.5'),
      uncommon: parseFloat(process.env.SELL_VALUE_UNCOMMON || '0.5'),
      rare: parseFloat(process.env.SELL_VALUE_RARE || '0.5'),
      legendary: parseFloat(process.env.SELL_VALUE_LEGENDARY || '1'),
    },
    buy_limit_per_day: parseInt(process.env.BUY_LIMIT_PER_DAY || '5'),
    sell_limit_per_day: parseInt(process.env.SELL_LIMIT_PER_DAY || '5'),
    max_card_collection_size: parseInt(process.env.MAX_COLLECTION_SIZE || '250'),
    rarity_weights: {
      common: parseInt(process.env.WEIGHT_COMMON || '5'),
      uncommon: parseInt(process.env.WEIGHT_UNCOMMON || '3'),
      rare: parseInt(process.env.WEIGHT_RARE || '2'),
      legendary: parseInt(process.env.WEIGHT_LEGENDARY || '1'),
    },
    buycard_message: process.env.BUYCARD_MESSAGE || 'Your new card pack is ready! View it here: https://madv313.github.io/Pack-Reveal-UI/',
  }
};
