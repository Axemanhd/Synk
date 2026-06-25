import { logger } from '../logger';
import { SpotifyTrackInfo, SpotifyPlaylistInfo } from '../types';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const spotifyUrlInfo = require('spotify-url-info');
const spotify = spotifyUrlInfo(fetch);

function parseDurationSec(ms: number): number {
  return Math.floor(ms / 1000);
}

function mapArtist(artists: string | { name: string }[]): string {
  if (typeof artists === 'string') return artists;
  if (Array.isArray(artists)) return artists.map((a: any) => a.name || a).join(', ');
  return 'Unknown';
}

export async function getSpotifyTrack(url: string): Promise<SpotifyTrackInfo | null> {
  try {
    const data = await spotify.getPreview(url);
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
  try {
    const [preview, tracks] = await Promise.all([
      spotify.getPreview(url).catch(() => null),
      spotify.getTracks(url).catch(() => [] as any[]),
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
      tracks: result,
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
