import { VoiceChannel } from 'discord.js';
import { InactivityState } from '../types';
import { config } from '../config';
import { logger } from '../logger';
import { queueManager } from './queue-manager';

export class InactivityManager {
  private states: Map<string, InactivityState> = new Map();
  private musicService: any;

  constructor(musicService: any) {
    this.musicService = musicService;
  }

  startTimers(guildId: string): void {
    this.cancelTimers(guildId);

    const state: InactivityState = {
      pauseTimer: setTimeout(() => this.handlePauseTimeout(guildId), config.inactivity.pauseAfterMs),
      leaveTimer: setTimeout(() => this.handleLeaveTimeout(guildId), config.inactivity.leaveAfterMs),
    };

    this.states.set(guildId, state);
    logger.info({ guildId }, 'Inactivity timers started');
  }

  cancelTimers(guildId: string): void {
    const state = this.states.get(guildId);
    if (state) {
      if (state.pauseTimer) clearTimeout(state.pauseTimer);
      if (state.leaveTimer) clearTimeout(state.leaveTimer);
      this.states.delete(guildId);
      logger.info({ guildId }, 'Inactivity timers cancelled');
    }
  }

  private handlePauseTimeout(guildId: string): void {
    logger.info({ guildId }, 'Inactivity pause timeout');
    this.musicService.pause(guildId);
  }

  private handleLeaveTimeout(guildId: string): void {
    logger.info({ guildId }, 'Inactivity leave timeout');
    this.musicService.stop(guildId);
    this.musicService.cleanup(guildId);
    this.states.delete(guildId);
  }

  checkVoiceActivity(guildId: string, voiceChannel: VoiceChannel): void {
    const members = voiceChannel.members.filter((m) => !m.user.bot);
    if (members.size === 0) {
      this.startTimers(guildId);
    } else {
      this.cancelTimers(guildId);
    }
  }
}
