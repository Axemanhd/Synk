import { logger } from '../logger';
import { SpotifyTrackInfo, SpotifyPlaylistInfo } from '../types';
import { config } from '../config';

const spotifyUrlInfo = require('spotify-url-info');
const spotifyEmbed = spotifyUrlInfo(fetch);

function parseDurationSec(ms: number): number {
  return Math.floor(ms / 1000);
}

function mapArtist(artists: string | { name: string }[]): string {
  if (typeof artists === 'string') return artists;
  if (Array.isArray(artists)) return artists.map((a: any) => a.name || a).join(', ');
  return 'Unknown';
}

function extractPlaylistId(url: string): string | null {
  const match = url.match(/playlist\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

let accessToken: string | null = null;
let tokenExpiresAt: number = 0;

async function getSpotifyToken(): Promise<string | null> {
  if (!config.spotify.clientId || !config.spotify.clientSecret) return null;

  if (accessToken && Date.now() < tokenExpiresAt) return accessToken;

  try {
    const auth = Buffer.from(`${config.spotify.clientId}:${config.spotify.clientSecret}`).toString('base64');
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    const data = await res.json() as any;
    if (data.access_token) {
      accessToken = data.access_token;
      tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
      return accessToken;
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchPlaylistTracksViaApi(playlistId: string, limit: number): Promise<SpotifyTrackInfo[]> {
  const token = await getSpotifyToken();
  if (!token) return [];

  const tracks: SpotifyTrackInfo[] = [];
  let offset = 0;

  while (tracks.length < limit) {
    const res = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100&offset=${offset}`,
      { headers: { 'Authorization': `Bearer ${token}` } },
    );
    const data = await res.json() as any;
    if (!data.items || data.items.length === 0) break;

    for (const item of data.items) {
      if (!item.track) continue;
      const t = item.track;
      tracks.push({
        title: t.name || 'Unknown',
        artist: (t.artists || []).map((a: any) => a.name).join(', ') || 'Unknown',
        duration: parseDurationSec(t.duration_ms || 0),
        thumbnail: t.album?.images?.[0]?.url || '',
      });
    }

    offset += data.items.length;
    if (!data.next || data.items.length < 100) break;
  }

  return tracks.slice(0, limit);
}

export async function getSpotifyTrack(url: string): Promise<SpotifyTrackInfo | null> {
  try {
    const data = await spotifyEmbed.getPreview(url);
    if (!data) return null;

    return {
      title: data.title || 'Unknown',
      artist: mapArtist(data.artist || data.artists || 'Unknown'),
      duration: data.duration ? parseDurationSec(data.duration) : 0,
      thumbnail: data.image || data.cover || data.thumbnail || '',
    };
  } catch (error) {
    logger.warn({ error, url }, 'Failed to get Spotify track info');
    return null;
  }
}

export async function getSpotifyPlaylist(url: string): Promise<SpotifyPlaylistInfo | null> {
  const playlistId = extractPlaylistId(url);
  const hasApi = !!(config.spotify.clientId && config.spotify.clientSecret && playlistId);

  if (hasApi) {
    try {
      const tracks = await fetchPlaylistTracksViaApi(playlistId!, config.maxPlaylistTracks);
      if (tracks.length > 0) {
        logger.info({ url, count: tracks.length }, 'Spotify playlist fetched via Web API');
        return { title: 'Playlist', tracks };
      }
    } catch (error) {
      logger.warn({ error, url }, 'Spotify Web API failed, falling back to embed');
    }
  }

  try {
    const [preview, tracks] = await Promise.all([
      spotifyEmbed.getPreview(url).catch(() => null),
      spotifyEmbed.getTracks(url).catch(() => [] as any[]),
    ]);

    const playlistName = preview?.title || 'Unknown Playlist';

    const result: SpotifyTrackInfo[] = tracks
      .filter((t: any) => t && (t.title || t.name))
      .map((t: any) => ({
        title: t.title || t.name || 'Unknown',
        artist: mapArtist(t.artist || t.artists || 'Unknown'),
        duration: t.duration ? parseDurationSec(t.duration) : 0,
        thumbnail: t.image || t.cover || t.thumbnail || preview?.image || '',
      }));

    return {
      title: playlistName,
      tracks: result.slice(0, config.maxPlaylistTracks),
    };
  } catch (error) {
    logger.warn({ error, url }, 'Failed to get Spotify playlist info');
    return null;
  }
}

export function isSpotifyUrl(url: string): boolean {
  return /open\.spotify\.com/i.test(url);
}

export function isSpotifyPlaylistUrl(url: string): boolean {
  return /open\.spotify\.com\/playlist/i.test(url);
}

export function isSpotifyTrackUrl(url: string): boolean {
  return /open\.spotify\.com\/track/i.test(url);
}
