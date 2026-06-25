import {
  AudioPlayer,
  AudioPlayerStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  StreamType,
  VoiceConnection,
  VoiceConnectionStatus,
} from '@discordjs/voice';
import { VoiceChannel } from 'discord.js';
import { QueueData, Track, RepeatMode } from '../types';
import { logger } from '../logger';
import { queueManager } from './queue-manager';
import { voiceManager } from './voice-manager';
import { getStream } from '../providers/youtube';
import { uiManager } from './ui-manager';
import { InactivityManager } from './inactivity-manager';

export class MusicService {
  private players: Map<string, AudioPlayer> = new Map();
  private inactivityManager: InactivityManager;

  constructor() {
    this.inactivityManager = new InactivityManager(this);
  }

  getInactivityManager(): InactivityManager {
    return this.inactivityManager;
  }

  getPlayer(guildId: string): AudioPlayer | undefined {
    return this.players.get(guildId);
  }

  async playTrack(guildId: string): Promise<void> {
    const queue = queueManager.get(guildId);
    if (!queue) return;

    const player = this.players.get(guildId);
    if (!player) return;

    const track = queueManager.next(queue);
    if (!track) {
      queue.playing = false;
      queue.paused = false;
      return;
    }

    try {
      const result = await getStream(track.url);
      logger.info({ guildId, track: track.title, type: result.type }, 'Stream obtained');

      const inputType = StreamType.Arbitrary;

      result.stream.on('error', (streamErr) => {
        logger.error({ guildId, err: String(streamErr) }, 'Stream error');
      });

      result.stream.once('data', () => {
        logger.info({ guildId }, 'Stream data flowing');
      });

      const resource = createAudioResource(result.stream, { inputType });

      player.play(resource);
      queue.playing = true;
      queue.paused = false;
      logger.info({ guildId, track: track.title }, 'Now playing');
    } catch (error: any) {
      const msg = typeof error === 'string' ? error : error?.message || error?.toString?.() || 'unknown';
      logger.error({ guildId, track: track.title, err: msg }, 'Failed to play track, skipping');
      queueManager.remove(guildId);
      await this.playTrack(guildId);
    }
  }

  async start(guildId: string, voiceChannel: VoiceChannel): Promise<void> {
    const connection = await voiceManager.join(voiceChannel);
    const queue = queueManager.getOrCreate(voiceChannel.guild, voiceChannel);

    connection.on(VoiceConnectionStatus.Signalling, () => {
      logger.info({ guildId }, 'Voice status: Signalling');
    });
    connection.on(VoiceConnectionStatus.Connecting, () => {
      logger.info({ guildId }, 'Voice status: Connecting');
    });
    connection.on(VoiceConnectionStatus.Ready, () => {
      logger.info({ guildId }, 'Voice status: Ready');
    });
    connection.on(VoiceConnectionStatus.Destroyed, () => {
      logger.info({ guildId }, 'Voice status: Destroyed');
    });

    let player = this.players.get(guildId);
    if (!player) {
      player = createAudioPlayer();
      this.players.set(guildId, player);
      connection.subscribe(player);

      player.on(AudioPlayerStatus.Playing, () => {
        queue.playing = true;
        queue.paused = false;
        this.inactivityManager.cancelTimers(guildId);
        logger.info({ guildId, track: queue.currentTrack?.title }, 'Player status: playing');
        uiManager.updatePanel(guildId);
      });

      player.on(AudioPlayerStatus.Paused, () => {
        queue.paused = true;
        logger.info({ guildId }, 'Player status: paused');
        uiManager.updatePanel(guildId);
      });

      player.on(AudioPlayerStatus.Idle, () => {
        logger.info({ guildId, track: queue.currentTrack?.title }, 'Player status: idle');
        if (queue.tracks.length > 0 || queue.repeatMode === 'one' || queue.repeatMode === 'queue') {
          this.playTrack(guildId);
        } else {
          queue.playing = false;
          queue.currentTrack = null;
        }
      });

      player.on('error', (error) => {
        logger.error({ error: String(error), guildId }, 'Audio player error');
        this.playTrack(guildId);
      });
    } else {
      connection.subscribe(player);
    }

    await this.playTrack(guildId);
  }

  pause(guildId: string): boolean {
    const player = this.players.get(guildId);
    if (!player) return false;

    player.pause();
    return true;
  }

  resume(guildId: string): boolean {
    const player = this.players.get(guildId);
    if (!player) return false;

    player.unpause();
    return true;
  }

  skip(guildId: string): boolean {
    const player = this.players.get(guildId);
    if (!player) return false;

    player.stop();
    return true;
  }

  async previous(guildId: string): Promise<boolean> {
    const queue = queueManager.get(guildId);
    if (!queue) return false;

    const track = queueManager.previous(queue);
    if (!track) return false;

    this.skip(guildId);
    return true;
  }

  stop(guildId: string): void {
    const player = this.players.get(guildId);
    if (player) {
      player.stop();
    }

    const queue = queueManager.get(guildId);
    if (queue) {
      queueManager.clear(queue);
      queue.playing = false;
      queue.paused = false;
      queue.currentTrack = null;
    }
  }

  setRepeatMode(guildId: string, mode: RepeatMode): void {
    const queue = queueManager.get(guildId);
    if (queue) {
      queueManager.setRepeatMode(queue, mode);
    }
  }

  shuffle(guildId: string): void {
    const queue = queueManager.get(guildId);
    if (queue && queue.tracks.length > 0) {
      queueManager.shuffle(queue);
    }
  }

  leave(guildId: string): void {
    const player = this.players.get(guildId);
    if (player) {
      player.stop();
      this.players.delete(guildId);
    }

    const queue = queueManager.get(guildId);
    if (queue) {
      queueManager.clear(queue);
      queue.playing = false;
      queue.paused = false;
      queue.currentTrack = null;
    }

    this.inactivityManager.cancelTimers(guildId);
    voiceManager.leave(guildId);
    queueManager.remove(guildId);
  }

  cleanup(guildId: string): void {
    this.leave(guildId);
  }
}

export const musicService = new MusicService();
