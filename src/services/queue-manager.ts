import { Guild, User, VoiceChannel } from 'discord.js';
import { QueueData, Track, RepeatMode } from '../types';
import { logger } from '../logger';

export class QueueManager {
  private queues: Map<string, QueueData> = new Map();

  getOrCreate(guild: Guild, voiceChannel: VoiceChannel | null): QueueData {
    const existing = this.queues.get(guild.id);
    if (existing) {
      if (voiceChannel) {
        existing.voiceChannel = voiceChannel;
      }
      return existing;
    }

    const queue: QueueData = {
      guildId: guild.id,
      guild,
      voiceChannel,
      tracks: [],
      history: [],
      currentTrack: null,
      repeatMode: 'off',
      playing: false,
      paused: false,
      position: 0,
      shuffled: false,
    };

    this.queues.set(guild.id, queue);
    return queue;
  }

  get(guildId: string): QueueData | undefined {
    return this.queues.get(guildId);
  }

  addTrack(queue: QueueData, track: Track): void {
    queue.tracks.push(track);
    logger.info({ guildId: queue.guildId, track: track.title }, 'Track added to queue');
  }

  addTracks(queue: QueueData, tracks: Track[]): void {
    if (queue.shuffled) {
      for (const track of tracks) {
        const pos = Math.floor(Math.random() * (queue.tracks.length + 1));
        queue.tracks.splice(pos, 0, track);
      }
    } else {
      queue.tracks.push(...tracks);
    }
    logger.info({ guildId: queue.guildId, count: tracks.length }, 'Tracks added to queue');
  }

  next(queue: QueueData): Track | null {
    if (queue.repeatMode === 'one' && queue.currentTrack) {
      return queue.currentTrack;
    }

    if (queue.currentTrack) {
      queue.history.push(queue.currentTrack);
    }

    if (queue.repeatMode === 'queue' && queue.tracks.length === 0 && queue.history.length > 0) {
      queue.tracks.push(...queue.history);
      queue.history = [];
    }

    if (queue.tracks.length === 0) {
      queue.currentTrack = null;
      return null;
    }

    const track = queue.tracks.shift()!;
    queue.currentTrack = track;
    return track;
  }

  previous(queue: QueueData): Track | null {
    if (queue.history.length === 0) return null;

    if (queue.currentTrack) {
      queue.tracks.unshift(queue.currentTrack);
    }

    const track = queue.history.pop()!;
    queue.currentTrack = track;
    return track;
  }

  clear(queue: QueueData): void {
    queue.tracks = [];
    queue.history = [];
    queue.currentTrack = null;
  }

  remove(guildId: string): void {
    this.queues.delete(guildId);
    logger.info({ guildId }, 'Queue removed');
  }

  setRepeatMode(queue: QueueData, mode: RepeatMode): void {
    queue.repeatMode = mode;
    logger.info({ guildId: queue.guildId, mode }, 'Repeat mode changed');
  }

  getQueueList(queue: QueueData): Track[] {
    return queue.tracks;
  }

  getHistory(queue: QueueData): Track[] {
    return queue.history;
  }

  shuffle(queue: QueueData): void {
    for (let i = queue.tracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [queue.tracks[i], queue.tracks[j]] = [queue.tracks[j], queue.tracks[i]];
    }
    queue.shuffled = true;
    logger.info({ guildId: queue.guildId }, 'Queue shuffled');
  }

  setShuffled(queue: QueueData, shuffled: boolean): void {
    queue.shuffled = shuffled;
    logger.info({ guildId: queue.guildId, shuffled }, 'Shuffle mode changed');
  }
}

export const queueManager = new QueueManager();
