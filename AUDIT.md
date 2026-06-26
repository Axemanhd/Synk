# Synk — Codebase Audit

**Date:** 2026-06-26  
**Version:** 1.0.8  
**Files Audited:** 22 source files across bot (src/) and desktop app (desktop/)
**Status:** 14 of 36 issues resolved; 22 open

## Resolution Log

### v1.0.8 (2026-06-26)
- 🆕 **M-11:** Button interaction rate limiting — per-guild 1.5s cooldown on all playback buttons
- 🆕 **Skip guard:** Skip blocked until track has played for 3 seconds minimum to prevent overload
- ✅ **N-2:** Version mismatch fixed — `package.json` and `desktop/package.json` both report 1.0.8

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

## CRITICAL (1 issue)

### C-2: Live Discord token exposed in .env
**File:** `.env:5,8`  
**Status:** STILL PRESENT  
**Evidence:** Real `DISCORD_TOKEN` and `DISCORD_CLIENT_ID` still in plaintext.  
**Impact:** If leaked, attacker gains full control of the bot. Token must be rotated on Discord Dev Portal immediately.

---

## HIGH (3 issues)

### H-2: Spotify playlist resolveBatch does not preserve order
**File:** `src/commands/index.ts:37-70`  
**Status:** STILL PRESENT  
**Evidence:** 15 concurrent workers push to `results[]` — order depends on which YouTube search finishes first. No ordering mechanism (index mapping, sorted insertion) is used.

### H-3: yt-dlp process leaks (no cleanup on skip/stop)
**File:** `src/providers/youtube.ts:75-110`  
**Status:** STILL PRESENT  
**Evidence:** `getStream()` spawns yt-dlp but never kills it on skip/stop. Three call sites create orphan processes.

### H-4: Voice disconnect recovery doesn't notify MusicService/UIManager
**File:** `src/services/voice-manager.ts:30-38`  
**Status:** STILL PRESENT  
**Evidence:** `cleanup()` destroys connection but never calls `musicService.stop()` or `uiManager.removePanel()`.

---

## MEDIUM (7 issues)

| # | File | Line | Issue |
|---|------|------|-------|
| M-3 | `ui-manager.ts` | 143-162 | Button collector 24h expiry doesn't clean panel from Map |
| M-6 | `desktop/main.js` | 81-93 | Token written to .env with no restricted file permissions |
| M-7 | `desktop/main.js` | 456-516 | Update downloader lacks checksum/signature verification |
| M-8 | `inactivity-manager.ts` | 49-56 | `checkVoiceActivity` is dead code, never called |
| M-10 | `commands/index.ts` | 46-65 | Failed YouTube searches silently drop tracks from batch |
| M-11 | `ui-manager.ts` | 105-158 | Button interactions had no rate limiting — user spam could overload bot |
| N-1 | `commands/index.ts` | 483 | `/playlist` command lacks batch progress callback (no `onProgress` passed to `resolveToTrack`) |

---

## LOW (12 issues)

| # | File | Line | Issue |
|---|------|------|-------|
| L-1 | `index.ts` | 13-16 | FFmpeg PATH hardcoded to version 8.1.1 |
| L-3 | `voice-manager.ts` | 26-27 | selfDeaf: false wastes voice bandwidth |
| L-5 | `index.ts` | 166-169 | No graceful shutdown on fatal startup error |
| L-6 | `desktop/main.js` | 547-553 | Update installer launch has empty catch, no macOS/Linux support |
| L-7 | `logger.ts` | 4-14 | pino-pretty forced in all environments |
| L-8 | `desktop/main.js` | 380-390 | Version compare breaks on pre-release suffixes |
| L-9 | `index.ts` | 134-161 | Inactivity timers not started on initial solo-join |
| L-10 | `desktop/main.js` | 478-497 | Download progress resets to 0% on HTTP 302 redirect |
| L-11 | `.env` | - | Inconsistent line endings between saveEnv and dotenv |
| L-12 | `commands/index.ts` | 91-95 | Failed YouTube URL resolves searches raw URL as text query |
| N-2 | `package.json` | 3 | ✅ **RESOLVED v1.0.8** — both package.json files now report 1.0.8 |
| N-3 | `voice-manager.ts` + `index.ts` | 30-38, 143-149 | Race condition on voice disconnect cleanup |
| N-4 | `providers/spotify.ts` | 5 | Inconsistent module system — uses `require()` (CJS) while rest uses ES `import` |

---

## Summary
- **Critical:** 1 (exposed token)
- **High:** 3 (order loss, process leaks, silence on disconnect)
- **Medium:** 7 (permission gaps, dead code, no integrity checks, missing progress callback, button rate limiting)
- **Low:** 12 (hardcoded paths, edge cases, version mismatch, race, style)

**Total: 22 open issues** (14 resolved of 36 total)
