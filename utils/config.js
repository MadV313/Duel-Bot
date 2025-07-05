// utils/config.js

export const config = {
  token_env: process.env.TOKEN_ENV || 'DISCORD_TOKEN',
  client_id: process.env.CLIENT_ID,
  guild_id: process.env.GUILD_ID,
  ui_urls: {
    hub_ui: process.env.HUB_UI || 'https://madv313.github.io/HUB-UI/',
  },
  pack_reveal_ui: process.env.PACK_REVEAL_UI || 'https://madv313.github.io/Pack-Reveal-UI/',
};
