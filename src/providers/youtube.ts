import playdl from 'play-dl';
import { exec as ytDlpExec } from 'youtube-dl-exec';
import { PassThrough, Readable } from 'stream';
import { logger } from '../logger';
import { YouTubeSearchResult } from '../types';

export async function searchYouTubeVideo(query: string): Promise<YouTubeSearchResult | null> {
  try {
    const result = await playdl.search(query, { limit: 1, source: { youtube: 'video' } });
    if (result.length === 0) return null;

    const video = result[0];
    return {
      url: video.url,
      title: video.title ?? 'Unknown',
      artist: video.channel?.name ?? 'Unknown',
      duration: video.durationInSec,
      thumbnail: video.thumbnails?.[0]?.url ?? '',
    };
  } catch (error) {
    logger.error({ error, query }, 'YouTube search failed');
    return null;
  }
}

export async function getYouTubeVideoInfo(url: string): Promise<YouTubeSearchResult | null> {
  try {
    const video = await playdl.video_info(url);
    const details = video.video_details;

    return {
      url: details.url,
      title: details.title ?? 'Unknown',
      artist: details.channel?.name ?? 'Unknown',
      duration: details.durationInSec,
      thumbnail: details.thumbnails?.[0]?.url ?? '',
    };
  } catch (error) {
    logger.error({ error, url }, 'Failed to get YouTube video info');
    return null;
  }
}

export async function getYouTubePlaylist(url: string): Promise<YouTubeSearchResult[]> {
  try {
    const playlist = await playdl.playlist_info(url, { incomplete: true });
    const videos = await playlist.all_videos();

    return videos.map((v) => ({
      url: v.url,
      title: v.title ?? 'Unknown',
      artist: v.channel?.name ?? 'Unknown',
      duration: v.durationInSec,
      thumbnail: v.thumbnails?.[0]?.url ?? '',
    }));
  } catch (error) {
    logger.error({ error, url }, 'Failed to get YouTube playlist');
    return [];
  }
}

export function isYouTubeUrl(url: string): boolean {
  return /(?:youtube\.com|youtu\.be)/i.test(url);
}

export function isYouTubePlaylistUrl(url: string): boolean {
  return /(?:youtube\.com|youtu\.be).*[?&]list=/i.test(url);
}

export interface StreamResult {
  stream: Readable;
  type: 'arbitrary';
}

export async function getStream(url: string): Promise<StreamResult> {
  // Buffer yt-dlp output through a PassThrough so FFmpeg (created later by
  // @discordjs/voice) has data to read immediately without pipe races.
  const buffer = new PassThrough({ highWaterMark: 1024 * 1024 * 5 });

  const ytProc = ytDlpExec(
    url,
    {
      output: '-',
      format: '251',
      noWarnings: true,
      extractorArgs: 'youtube:player_client=android_creator;skip=webpage',
    } as any,
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );

  if (!ytProc || !ytProc.stdout) {
    buffer.destroy();
    throw new Error('Failed to spawn yt-dlp process');
  }

  ytProc.stdout.pipe(buffer);

  ytProc.stderr?.on('data', (data) => {
    logger.warn({ url, stderr: data.toString().trim() }, 'yt-dlp stderr');
  });

  ytProc.on('error', (err) => {
    logger.error({ url, err: String(err) }, 'yt-dlp process error');
  });

  ytProc.on('close', (code: number | null) => {
    if (code !== 0 && code !== null) {
      buffer.destroy();
    }
  });

  logger.info({ url }, 'yt-dlp streaming started');
  return { stream: buffer, type: 'arbitrary' };
}
