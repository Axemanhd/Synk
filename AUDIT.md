# Synk — Codebase Audit

**Date:** 2026-06-24  
**Version:** 1.0.6  
**Files Audited:** 22 source files across bot (src/) and desktop app (desktop/)
**Status:** 13 of 31 issues resolved in v1.0.6

## Resolution Log

### v1.0.7 (2026-06-25)
- 🆕 **Themes:** Light / Dark / Original selector in General tab, persists across restarts
- 🆕 **Icon:** User-provided custom icon for window, tray, start menu, installer
- 🆕 **Auto-start:** Windows startup toggle in General tab
- 🆕 **Local cleanup:** Old installers purged, only current + 1 prior kept
- ✅ **C-1/C-3:** `playTrack` error handler no longer deletes queue; added recursion depth guard (max 50)
- ✅ **H-1:** `/previous` rewritten with direct playback — plays previous track immediately
- ✅ **H-5:** `InactivityManager` now uses typed `IMusicService` interface
- ✅ **H-6:** `removePanel` guards against null `messageId` before fetch
- ✅ **M-1:** `requireVoiceChannel` rejects when bot is not in any voice channel
- ✅ **M-2:** Unsupported Spotify URLs (album/artist) log a warning and return empty
- ✅ **M-4:** Dead `require('discord.js')` removed from `removePanel`
- ✅ **M-5:** `pause()/resume()` now check for active queue + currentTrack
- ✅ **M-9:** yt-dlp stderr logged as `logger.warn`, process errors logged as `logger.error`
- ✅ **L-4:** `/skip` and `/previous` slash commands now call `uiManager.updatePanel`
- 🆕 **Desktop:** Token/client ID persisted in `desktop-settings.json` (survives updates)
- 🆕 **Desktop:** Dashboard layout — controls stay fixed at top, log scrolls independently
- 🆕 **Desktop:** Info page under General with Axeman/Custum/Deepseek V4 Pro credits

---

---

## CRITICAL (3 issues)

### C-1: Single track failure destroys entire queue
**File:** `src/services/music-service.ts:73`  
**Evidence:**
```ts
queueManager.remove(guildId);   // deletes the ENTIRE queue from the Map
await this.playTrack(guildId);  // queue is gone, returns immediately
```
**Impact:** When any track fails to stream, all queued songs are lost. The bot goes silent with no recovery.

### C-2: Live Discord token exposed in .env
**File:** `.env:5,8`  
**Evidence:** Real `DISCORD_TOKEN` and `DISCORD_CLIENT_ID` in plaintext.  
**Impact:** If leaked, attacker gains full control of the bot. Token must be rotated on Discord Dev Portal immediately.

### C-3: PlayTrack error handler can stack-overflow
**File:** `src/services/music-service.ts:70-75`  
**Evidence:** No guard against infinite recursion when `getStream` throws persistently.  
**Impact:** Stack overflow + queue destruction on any persistent streaming error.

---

## HIGH (6 issues)

### H-1: `/previous` command is fundamentally broken
**File:** `src/services/music-service.ts:160-169`, `src/services/queue-manager.ts:56-78`  
**Evidence:** `previous()` re-buries the target track in history via `next()` before it plays. `/previous` is a no-op.  
**Trace:** previous() → queueManager.previous() → this.skip() → player.stop() → Idle → playTrack() → next() → track goes back to history.

### H-2: Spotify playlist resolveBatch does not preserve order
**File:** `src/commands/index.ts:46-64`  
**Evidence:** 15 concurrent workers push to `results[]` — order depends on which YouTube search finishes first.

### H-3: yt-dlp process leaks (no cleanup on skip/stop)
**File:** `src/providers/youtube.ts:75-110`  
**Evidence:** yt-dlp child process is never killed. Skipping a track leaves an orphan process consuming CPU/network. Error events are silently swallowed.

### H-4: Voice disconnect recovery doesn't notify MusicService/UIManager
**File:** `src/services/voice-manager.ts:30-38`  
**Evidence:** `cleanup()` destroys connection but never calls `musicService.stop()` or `uiManager.removePanel()`.

### H-5: InactivityManager stores musicService as `any`
**File:** `src/services/inactivity-manager.ts:9`  
**Evidence:** `private musicService: any` defeats all TypeScript safety for pause/stop/cleanup calls.

### H-6: removePanel throws on null messageId
**File:** `src/services/ui-manager.ts:256-274`  
**Evidence:** `channel.messages.fetch(null)` if `messageId` is null but `channel` is defined.

---

## MEDIUM (10 issues)

| # | File | Line | Issue |
|---|------|------|-------|
| M-1 | `permissions.ts` | 28 | Permission check passes when bot is not in voice |
| M-2 | `commands/index.ts` | 117-144 | Spotify album/artist URLs silently fall to broken YouTube text search |
| M-3 | `ui-manager.ts` | 143-162 | Button collector 24h expiry doesn't clean panel from Map |
| M-4 | `ui-manager.ts` | 261 | Dead `require('discord.js')` in removePanel |
| M-5 | `music-service.ts` | 136-142 | pause() returns true when nothing is playing |
| M-6 | `desktop/main.js` | 79-91 | Token written to .env with no restricted file permissions |
| M-7 | `desktop/main.js` | 423-483 | Update downloader lacks checksum/signature verification |
| M-8 | `inactivity-manager.ts` | 49-56 | `checkVoiceActivity` is dead code, never called |
| M-9 | `youtube.ts` | 98-100 | yt-dlp stderr and errors silently discarded |
| M-10 | `commands/index.ts` | 46-65 | Failed YouTube searches silently drop tracks from batch |

---

## LOW (12 issues)

| # | File | Line | Issue |
|---|------|------|-------|
| L-1 | `index.ts` | 13-16 | FFmpeg PATH hardcoded to version 8.1.1 |
| L-2 | `AGENTS.md` | - | @distube/ytdl-core documented but not in dependencies |
| L-3 | `voice-manager.ts` | 26-27 | selfDeaf: false wastes voice bandwidth |
| L-4 | `commands/index.ts` | 306, 324 | /skip and /previous slash commands don't update UI panel |
| L-5 | `index.ts` | 166-169 | No graceful shutdown on fatal startup error |
| L-6 | `desktop/main.js` | 513-520 | Update installer launch has empty catch, no macOS/Linux support |
| L-7 | `logger.ts` | 4-14 | pino-pretty forced in all environments |
| L-8 | `desktop/main.js` | 358-368 | Version compare breaks on pre-release suffixes |
| L-9 | `index.ts` | 134-161 | Inactivity timers not started on initial solo-join |
| L-10 | `desktop/main.js` | 453-456 | Download progress resets to 0% on HTTP 302 redirect |
| L-11 | `.env` | - | Inconsistent line endings between saveEnv and dotenv |
| L-12 | `commands/index.ts` | 91-95 | Failed YouTube URL resolves searches raw URL as text query |

---

## Summary
- **Critical:** 3 (queue destruction, exposed token, stack overflow)
- **High:** 6 (broken /previous, order loss, process leaks, type safety, null safety)
- **Medium:** 10 (permission gaps, dead code, no integrity checks)
- **Low:** 12 (hardcoded paths, missing UI updates, edge cases)

**Total: 31 issues**
