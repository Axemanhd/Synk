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
- [ ] C-1: `music-service.ts:73` — Track failure destroys entire queue
- [ ] C-2: `.env` — Live Discord token exposed in plaintext (must rotate)
- [ ] C-3: `music-service.ts:70-75` — Recursive error handler, potential stack overflow

**High (6):**
- [ ] H-1: `/previous` command broken — track re-buried in history
- [ ] H-2: Spotify playlist batch resolve doesn't preserve order
- [ ] H-3: yt-dlp orphan processes, no cleanup on skip/stop
- [ ] H-4: Voice disconnect recovery doesn't notify other services
- [ ] H-5: `InactivityManager` uses `musicService: any` (no type safety)
- [ ] H-6: `removePanel` throws on null `messageId`

**Medium (10):**
- [ ] M-1 through M-10 — Permission gaps, dead code, integrity/security gaps

**Low (12):**
- [ ] L-1 through L-12 — Hardcoded paths, missing UI updates, edge cases
