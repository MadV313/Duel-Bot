# 🎴 SV13 Duel Bot Backend

> The official backend powering the **SV13 DayZ-Themed Collectible Card Game (CCG)** — built for the SV13 community’s Discord server and connected to a suite of live UIs, persistent data storage, and cinematic gameplay systems.

---

## 🚀 Overview

The **SV13 Duel Bot** is a full-stack collectible card game framework that brings DayZ-inspired tactical combat into Discord.  
Players can **collect cards, build decks, challenge opponents, trade, sell, and open animated packs** — all seamlessly integrated with live web UIs and persistent data storage.

This backend serves as the live controller for:
- Duel logic and real-time state synchronization  
- Card collection and rarity management  
- Persistent player data (decks, coins, stats)  
- Web UI endpoints for duels, summaries, and reveals  
- Admin tools for reward payouts, economy, and leaderboard management  

---

## ✨ Core Features

- 🎮 **Discord Slash Commands** — `/linkdeck`, `/challenge`, `/practice`, `/tradecard`, `/buycard`, `/sellcard`, `/mydeck`, `/mycoin`, `/tradecard`, and more  
- 🧠 **Full Duel Engine** — PvP or Practice vs. AI with real card logic, traps, buffs, and combo systems  
- 🎴 **Rarity-Based Pack System** — weighted draws (Common → Legendary) with animated **Pack Reveal UI**  
- 🧱 **Deck Builder UI** — build 20–40 card decks from your personal collection  
- 💰 **Coin Economy** — buy/sell limits, rarity values, wagers, and automated coin persistence  
- 🧾 **Duel Summary Screen** — displays events, damage logs, and wager results  
- 👁️ **Spectator Mode** — live rotation of duel logs for viewers  
- 🧑‍💼 **Admin Toolkit** — `/duelcard`, `/duelcoin`, `/cardpack`, `/viewlinked`, `/unlinkdeck`, and payout notifications  
- 🔁 **Persistent Data System** — JSON-based remote storage with retry logic, caching, and cron maintenance  

---

## 🗂️ Repository Structure

