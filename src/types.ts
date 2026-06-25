import { Guild, VoiceChannel, User } from 'discord.js';

export type RepeatMode = 'off' | 'one' | 'queue';

export interface Track {
  url: string;
  title: string;
  artist: string;
  duration: number;
  thumbnail: string;
  requestedBy: User;
  source: 'youtube' | 'spotify';
}

export interface QueueData {
  guildId: string;
  guild: Guild;
  voiceChannel: VoiceChannel | null;
  tracks: Track[];
  history: Track[];
  currentTrack: Track | null;
  repeatMode: RepeatMode;
  playing: boolean;
  paused: boolean;
  position: number;
  shuffled: boolean;
}

export interface PlayerPanel {
  messageId: string | null;
  channelId: string;
  guildId: string;
}

export interface InactivityState {
  pauseTimer: ReturnType<typeof setTimeout> | null;
  leaveTimer: ReturnType<typeof setTimeout> | null;
}

export interface SpotifyTrackInfo {
  title: string;
  artist: string;
  duration: number;
  thumbnail: string;
}

export interface SpotifyPlaylistInfo {
  title: string;
  tracks: SpotifyTrackInfo[];
}

export interface YouTubeSearchResult {
  url: string;
  title: string;
  artist: string;
  duration: number;
  thumbnail: string;
}
