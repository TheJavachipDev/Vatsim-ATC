# @vatsim-atc/bot

Discord bot scaffold (discord.js v14) for vatsim-atc.com. Phase 1 ships a single
working slash command; subscription/alert features are stubbed as TODOs.

## Commands

- `/coverage station:<prefix> facility:<DEL|GND|TWR|APP|DEP|CTR>` — replies with an
  embed showing live status and the next 12 hours of coverage probabilities, pulled
  from the web app's public API.

## Setup

1. Create a Discord application and bot, and copy the token and client (application) ID.
2. Set `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, and `WEB_API_URL` (defaults to
   `http://localhost:3000`) in the repo-root `.env`.
3. Register the slash commands (once, and after any command change):

   ```bash
   pnpm --filter @vatsim-atc/bot deploy-commands
   ```

4. Start the bot:

   ```bash
   pnpm --filter @vatsim-atc/bot dev
   ```

## Roadmap (phase 2)

- `/watch` to subscribe to coverage or booking alerts via DM.
- Per-guild default station and facility.
