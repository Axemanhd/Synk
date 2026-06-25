import {
  VoiceConnection,
  VoiceConnectionStatus,
  entersState,
  joinVoiceChannel,
} from '@discordjs/voice';
import { VoiceChannel, Guild } from 'discord.js';
import { logger } from '../logger';

export class VoiceManager {
  private connections: Map<string, VoiceConnection> = new Map();

  async join(channel: VoiceChannel): Promise<VoiceConnection> {
    const existing = this.connections.get(channel.guild.id);
    if (existing) {
      if (existing.joinConfig.channelId === channel.id) {
        return existing;
      }
      existing.destroy();
    }

    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator as any,
      selfDeaf: false,
      selfMute: false,
    });

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        this.cleanup(channel.guild.id);
      }
    });

    connection.on(VoiceConnectionStatus.Destroyed, () => {
      this.connections.delete(channel.guild.id);
    });

    connection.on(VoiceConnectionStatus.Ready, () => {
      logger.info({ guildId: channel.guild.id }, 'Voice connection ready');
    });

    this.connections.set(channel.guild.id, connection);
    logger.info({ guildId: channel.guild.id, channelId: channel.id }, 'Joined voice channel');
    return connection;
  }

  getConnection(guildId: string): VoiceConnection | undefined {
    return this.connections.get(guildId);
  }

  leave(guildId: string): void {
    const connection = this.connections.get(guildId);
    if (connection) {
      connection.destroy();
      this.connections.delete(guildId);
      logger.info({ guildId }, 'Left voice channel');
    }
  }

  cleanup(guildId: string): void {
    this.leave(guildId);
  }
}

export const voiceManager = new VoiceManager();
