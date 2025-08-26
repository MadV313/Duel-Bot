# cogs/practice.py — Admin-only /practice command for starting a bot duel
import os
import json
import asyncio
import aiohttp
import discord
from discord.ext import commands
from discord import app_commands

# ── REQUIRED RESTRICTIONS (from your message) ────────────────────────────────
ADMIN_ROLE_ID = 1173049392371085392
BATTLEFIELD_CHANNEL_ID = 1367986446232719484

# ── CONFIG: backend + UI endpoints ──────────────────────────────────────────
# Prefer environment variables; fall back to config.json if present.
# DUEL_BACKEND_URL should expose the /bot/practice route (e.g., https://your-app.onrailway.app)
# DUEL_UI_URL is your duel front-end page (will be opened by users)
def _load_config():
    cfg = {}
    try:
        with open("config.json", "r", encoding="utf-8") as f:
            cfg = json.load(f)
    except Exception:
        pass
    return cfg

_cfg = _load_config()
DUEL_BACKEND_URL = os.getenv("DUEL_BACKEND_URL", _cfg.get("duel_backend_base_url", "")).rstrip("/")
DUEL_UI_URL      = os.getenv("DUEL_UI_URL",      _cfg.get("duel_ui_url", "")).rstrip("/")

# Sensible defaults if nothing configured yet (prevents crashes, shows clear error)
if not DUEL_BACKEND_URL:
    DUEL_BACKEND_URL = "http://localhost:3000"  # adjust if your server uses a different port
if not DUEL_UI_URL:
    DUEL_UI_URL = "http://localhost:5173"       # adjust to your Duel UI host

PRACTICE_ENDPOINT = f"{DUEL_BACKEND_URL}/bot/practice"  # we added an alias to your backend

# ── VIEW WITH URL BUTTON ────────────────────────────────────────────────────
class OpenDuelUIButton(discord.ui.View):
    def __init__(self, url: str, timeout: float | None = 180):
        super().__init__(timeout=timeout)
        self.add_item(discord.ui.Button(label="Open Duel UI", url=url))

# ── COG ─────────────────────────────────────────────────────────────────────
class PracticeDuel(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    # Slash command: /practice
    @app_commands.command(
        name="practice",
        description="(Admin only) Start a practice duel vs the bot and get a private link to the Duel UI."
    )
    async def practice(self, interaction: discord.Interaction):
        # Channel restriction
        if interaction.channel_id != BATTLEFIELD_CHANNEL_ID:
            await interaction.response.send_message(
                "❌ This command can only be used in **#battlefield**.",
                ephemeral=True
            )
            return

        # Role restriction (Admin only)
        user_roles = getattr(interaction.user, "roles", [])
        if not any(getattr(r, "id", None) == ADMIN_ROLE_ID for r in user_roles):
            await interaction.response.send_message(
                "❌ You must have the **Admin** role to use this command.",
                ephemeral=True
            )
            return

        # Let the user know we’re starting the duel
        await interaction.response.defer(ephemeral=True, thinking=True)

        # Call backend to initialize a practice duel (build decks, draw 3, coin flip, etc.)
        try:
            async with aiohttp.ClientSession() as session:
                # 5s connect timeout / 15s read timeout
                timeout = aiohttp.ClientTimeout(total=20)
                async with session.get(PRACTICE_ENDPOINT, timeout=timeout) as resp:
                    if resp.status != 200:
                        text = await resp.text()
                        raise RuntimeError(f"Backend responded {resp.status}: {text[:300]}")
                    _ = await resp.json()  # duelState if you want to inspect/log

        except asyncio.TimeoutError:
            await interaction.edit_original_response(
                content="⚠️ The duel server timed out while starting practice. Try again in a moment."
            )
            return
        except Exception as e:
            await interaction.edit_original_response(
                content=f"⚠️ Failed to start practice duel:\n`{e}`\nCheck DUEL_BACKEND_URL or server logs."
            )
            return

        # Build the Duel UI link. You can append query params for your UI if desired.
        duel_url = f"{DUEL_UI_URL}?mode=practice"

        # Ephemeral confirmation + button to open the UI
        embed = discord.Embed(
            title="Practice Duel Ready",
            description=(
                "A fresh duel vs **Practice Bot** has been initialized.\n\n"
                "• Both sides start at **200 HP**\n"
                "• Each draws **3 cards**\n"
                "• **Coin flip** decides who goes first\n\n"
                "Click the button below to open the Duel UI."
            ),
            color=0x2ecc71
        )
        embed.set_footer(text="This message is visible only to you (ephemeral).")

        await interaction.edit_original_response(
            content=None,
            embed=embed,
            view=OpenDuelUIButton(duel_url)
        )

# ── SETUP ───────────────────────────────────────────────────────────────────
async def setup(bot: commands.Bot):
    await bot.add_cog(PracticeDuel(bot))
