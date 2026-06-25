# Synk — Agent Instructions

## Project overview
- Self-hosted Discord music bot named **Synk**
- Plays audio from YouTube via Discord voice channels
- Supports Spotify URLs through web scraping (no Spotify API key)
- Slash commands for playback control
- Persistent UI embed with interactive buttons

## Tech stack
- Node.js / TypeScript
- discord.js v14 — Discord API
- @discordjs/voice — audio playback
- play-dl — YouTube search, video info, playlist info
- @distube/ytdl-core — YouTube audio streaming (more reliable than play-dl)
- pino / pino-pretty — logging

## Key patterns
- Singleton services exported from each module (e.g. `export const queueManager = new QueueManager()`)
- Guild-scoped queues stored in `Map<string, QueueData>`
- Spotify provider uses the web player's internal token endpoint (no OAuth API key)
- Player panel buttons use a collector with `ComponentType.Button`
- `/play` accepts URLs (YouTube/Spotify) or plain text (Spotify search with select menu)

## Running
```bash
npm run build    # TypeScript compile
npm run lint     # Type-check only (tsc --noEmit)
npm start        # Run compiled output
npm run dev      # Build + run
```

## Desktop Application
- Electron app in `desktop/` provides a GUI overlay for the bot
- Run: `cd desktop && npm start` (bot must be built first: `npm run build`)
- Build installer: `cd desktop && npm run dist` (creates NSIS installer in `desktop/release/`)
- Bot is spawned as a child process from the Electron main process
- System tray support, close-to-tray behavior, settings management

## Config
Only 2 required env vars: `DISCORD_TOKEN` and `DISCORD_CLIENT_ID`. No Spotify credentials needed.

## Core files
| File | Purpose |
|------|---------|
| `src/index.ts` | Client init, command registration, event wiring |
| `src/commands/index.ts` | All slash command definitions and execute handlers |
| `src/services/music-service.ts` | Audio player lifecycle, play/pause/skip/stop |
| `src/services/queue-manager.ts` | Track queue, repeat mode, shuffle |
| `src/services/ui-manager.ts` | Embed panel, button row, collector |
| `src/services/voice-manager.ts` | Voice connection lifecycle |
| `src/services/inactivity-manager.ts` | Auto-pause/leave timers |
| `src/providers/youtube.ts` | YouTube video/playlist info via play-dl, streaming via @distube/ytdl-core |
| `src/providers/spotify.ts` | Spotify track/playlist/search via web player token (no API key) |
