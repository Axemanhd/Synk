# Synk

A self-hosted Discord music bot. Paste a YouTube/Spotify URL or search by song name. No Spotify API key needed.

## Setup

**Prerequisites:** Node.js 18+, FFmpeg (in PATH), a Discord application.

```bash
# 1. Install FFmpeg
# Windows: winget install FFmpeg
# macOS:   brew install ffmpeg
# Linux:   sudo apt install ffmpeg

# 2. Clone and install
cd synk
npm install
npm run build

# 3. Configure
cp .env.example .env
# Edit .env — add your Discord token and client ID
```

### Getting Discord credentials

1. Go to [Discord Developer Portal](https://discord.com/developers/applications) → New Application
2. **Bot** tab → Reset Token → copy token → enable **Server Members Intent** and **Message Content Intent** under Privileged Gateway Intents
3. **OAuth2 → General** → copy Client ID
4. Paste both into `.env`

### Invite the bot

Replace `CLIENT_ID` in the URL below and open in a browser:

```
https://discord.com/api/oauth2/authorize?client_id=CLIENT_ID&permissions=277025704960&scope=bot%20applications.commands
```

No `Administrator` or `Manage Messages` permission needed. The bot only posts and deletes its own messages, which Discord allows without extra permissions.

**Important:** The bot needs **Send Messages** and **Read Message History** in whatever text channel you use for commands. If you get a `Missing Permissions` error (code 50013), check that the bot's role has these permissions in that channel — channel-specific overrides can block it even if the role has them at the server level.

### Run

Open a terminal in the project folder (`C:\Users\Zhard\Desktop\whatever`) and run:

```bash
npm start
```

### Run in VS Code (debug mode)

1. Open the project folder in VS Code (**File → Open Folder** → select the `whatever` folder)
2. Open the `.env` file and verify your Discord token and client ID are set
3. Press **F5** (or **Run → Start Debugging**)
4. VS Code will auto-build and launch the bot — logs appear in the **Debug Console** panel

If no launch config exists, create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Run Synk",
      "skipFiles": ["<node_internals>/**"],
      "preLaunchTask": "npm: build",
      "program": "${workspaceFolder}/dist/index.js",
      "outFiles": ["${workspaceFolder}/dist/**/*.js"]
    }
  ]
}
```

Build errors appear in the **Terminal** panel; runtime logs appear in the **Debug Console**.

## Commands

| Command | Description |
|---------|-------------|
| `/play <input>` | YouTube/Spotify URL to play, or song name to search Spotify |
| `/playlist <url> [shuffle]` | Queue a playlist with optional shuffle |
| `/shuffle` | Toggle shuffle mode on/off |
| `/pause` / `/resume` | Pause/resume playback |
| `/skip` | Next track |
| `/previous` | Previous track |
| `/stop` | Stop and clear the queue |
| `/leave` | Disconnect the bot |
| `/queue` | Show the upcoming tracks |
| `/nowplaying` | Show current track info |
| `/repeat <off\|one\|queue>` | Set repeat mode |

## Features

- YouTube videos, playlists, and Spotify URL support
- Spotify search by song name — `/play american idiot` finds it on Spotify
- Spotify tracks and playlists (no API key required)
- Shuffle mode — randomize queue, auto-insert new tracks randomly
- Persistent now-playing panel with playback controls
- Repeat modes: off, single track, entire queue
- Auto-pause and auto-leave on voice channel inactivity
- Permission checks — only users in the same voice channel can control playback

## Project structure

```
src/
├── index.ts                     Entry point
├── config.ts                    Environment config
├── logger.ts                    Logging (pino)
├── types.ts                     Type definitions
├── commands/index.ts            Slash commands
├── services/
│   ├── queue-manager.ts         Queue management
│   ├── music-service.ts         Audio playback
│   ├── voice-manager.ts         Voice connections
│   ├── ui-manager.ts            Player embed / buttons
│   ├── permissions.ts           Channel checks
│   └── inactivity-manager.ts    Auto-pause / leave
└── providers/
    ├── youtube.ts               YouTube resolution
    └── spotify.ts               Spotify resolution (scraped, no API key)
```
