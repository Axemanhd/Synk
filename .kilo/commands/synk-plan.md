# Synk Bot - Overhaul Plan

## Goals
1. **Rename** project to "Synk"
2. **Remove Spotify API key requirement** — use web scraping instead
3. **Minimal setup** — zero optional config, one-command launch
4. **Preserve all existing features**: playlist support (YouTube + Spotify), shuffle, repeat modes, UI buttons, inactivity timers, queue management, permissions

## Steps

### 1. Project Rename
- `package.json`: name `synk-bot`, description, update scripts
- `INSTALL.md` → delete (merged into README.md)
- Config: add `botName: 'Synk'`

### 2. Remove Spotify API Dependency
- **`src/config.ts`**: remove `spotify` block (no more `SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET`)
- **`src/providers/spotify.ts`**: replace OAuth-based API calls with web scraping. Fetch the public Spotify page, extract embedded JSON (`__NEXT_DATA__`), parse track/playlist metadata.
- **`.env.example`**: remove Spotify vars, simplify

### 3. Simplify Setup
- `README.md`: clear single-page guide covering prerequisites, `.env` setup (only 2 vars), install, run
- `AGENTS.md`: agent instructions for this project
- `PROGRESS.md`: track completed milestones
- Remove `INSTALL.md`

### 4. Preserve All Features (already done from prior session)
- `/play` with YouTube/Spotify URLs (tracks + playlists)
- `/playlist` dedicated playlist command with optional shuffle
- `/shuffle` toggle + shuffle button on UI panel
- Repeat modes (One/Queue), skip, previous, stop, leave, pause/resume
- Now playing embed with buttons
- Inactivity auto-pause/leave
- Voice channel permission checks
