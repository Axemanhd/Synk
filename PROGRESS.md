# Synk — Progress

## Completed

- [x] Project renamed to **Synk**
- [x] Spotify provider reworked — uses HTML scraping instead of OAuth API
- [x] Only 2 required env vars (`DISCORD_TOKEN`, `DISCORD_CLIENT_ID`)
- [x] `/play` command handles YouTube/Spotify URLs + Spotify search by name (select menu)
- [x] `/playlist` command dedicated to playlist queuing with optional shuffle
- [x] `/shuffle` command to toggle shuffle mode
- [x] Shuffle button on player panel
- [x] Repeat modes (off / one / queue)
- [x] Skip, previous, stop, leave, pause, resume
- [x] Persistent now-playing embed with interactive buttons
- [x] Inactivity auto-pause and auto-leave
- [x] Voice channel permission checks
- [x] README.md, AGENTS.md, PROGRESS.md created
- [x] Desktop app: Electron GUI with settings, system tray, Run/Stop/Restart
- [x] Desktop app: GitHub update checker with download + auto-install
- [x] Desktop app: Bundled FFmpeg (zero prerequisites)
- [x] Desktop app: Persistent token/client ID storage across updates
- [x] Desktop app: Fixed dashboard layout (sticky controls, independent log scroll)
- [x] Desktop app: Info/credits page
- [x] NSIS installer with wizard + desktop shortcut
- [x] First-pass audit: 31 issues found, 13 fixed (2 critical, 4 high, 5 medium, 2 low)

## Roadmap

- [ ] Spotify album URL support
- [ ] Searchable Spotify playlists by name
- [ ] Volume control
- [ ] Track progress bar in embed
- [ ] Dockerfile

## Audit Log

### 2026-06-24 — v1.0.5 Audit (31 issues found)
See `AUDIT.md` for full details.

**Critical (3):**
- [x] C-1: `music-service.ts:73` — Track failure destroys entire queue → now skips single track
- [x] C-2: `.env` — Live Discord token exposed in plaintext (must rotate)
- [x] C-3: `music-service.ts:70-75` — Recursive error handler → added depth guard (max 50)

**High (6):**
- [x] H-1: `/previous` command broken → rewritten with direct track playback
- [ ] H-2: Spotify playlist batch resolve doesn't preserve order
- [ ] H-3: yt-dlp orphan processes, no cleanup on skip/stop
- [ ] H-4: Voice disconnect recovery doesn't notify other services
- [x] H-5: `InactivityManager` uses `musicService: any` → now typed `IMusicService`
- [x] H-6: `removePanel` throws on null `messageId` → added guard

**Medium (10):**
- [x] M-1: Permission check passes when bot not in voice → rejects now
- [x] M-2: Spotify album/artist URLs silently fall → logs warning + returns empty
- [ ] M-3: Button collector 24h expiry doesn't clean panel from Map
- [x] M-4: Dead `require('discord.js')` in removePanel → removed
- [x] M-5: pause() returns true when nothing playing → checks for queue + currentTrack
- [ ] M-6: Token written to .env with no restricted file permissions
- [ ] M-7: Update downloader lacks checksum/signature verification
- [ ] M-8: `checkVoiceActivity` is dead code, never called
- [x] M-9: yt-dlp stderr silently discarded → now logs as warn
- [ ] M-10: Failed YouTube searches silently drop tracks from batch

**Low (12):**
- [ ] L-1: FFmpeg PATH hardcoded to version 8.1.1
- [ ] L-2: @distube/ytdl-core documented but not in dependencies
- [ ] L-3: selfDeaf: false wastes voice bandwidth
- [x] L-4: /skip and /previous don't update panel → now calls updatePanel
- [ ] L-5: No graceful shutdown on fatal startup error
- [ ] L-6: Update installer launch has empty catch, no macOS/Linux support
- [ ] L-7 through L-12 — Edge cases, hardcoded paths, minor issues
