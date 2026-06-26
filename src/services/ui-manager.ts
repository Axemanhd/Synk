import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  TextChannel,
  Message,
  ComponentType,
  GuildMember,
} from 'discord.js';
import { QueueData, Track, RepeatMode, PlayerPanel } from '../types';
import { logger } from '../logger';
import { queueManager } from './queue-manager';

const EMBED_COLOR = 0x5865f2;

export interface ButtonHandlers {
  onPrevious: (guildId: string) => Promise<void> | void;
  onPauseResume: (guildId: string) => Promise<void> | void;
  onSkip: (guildId: string) => Promise<void> | void;
  onRepeatOne: (guildId: string) => Promise<void> | void;
  onRepeatQueue: (guildId: string) => Promise<void> | void;
  onShuffle: (guildId: string) => Promise<void> | void;
  onStop: (guildId: string) => Promise<void> | void;
  onLeave: (guildId: string) => Promise<void> | void;
  checkSameChannel: (member: GuildMember | null, guildId: string) => boolean;
}

export class UIManager {
  private panels: Map<string, PlayerPanel> = new Map();
  private handlers: ButtonHandlers | null = null;
  private lastActionTime: Map<string, number> = new Map();

  private static readonly ACTION_COOLDOWN_MS = 1500;
  private static readonly MIN_PLAY_TIME_MS = 3000;

  setHandlers(handlers: ButtonHandlers): void {
    this.handlers = handlers;
  }

  private formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;

    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  private getRepeatIcon(mode: RepeatMode): string {
    switch (mode) {
      case 'one': return '🔂';
      case 'queue': return '🔁';
      default: return '➡️';
    }
  }

  async updatePanel(guildId: string): Promise<void> {
    const queue = queueManager.get(guildId);
    if (!queue) return;

    const panel = this.panels.get(guildId);
    if (!panel || !panel.messageId) return;

    const channel = queue.guild.client.channels.cache.get(panel.channelId) as TextChannel | undefined;
    if (!channel) return;

    let message: Message;
    try {
      message = await channel.messages.fetch(panel.messageId);
    } catch {
      this.panels.delete(guildId);
      return;
    }

    const embed = this.buildEmbed(queue);
    const components = this.buildComponents(queue);

    try {
      await message.edit({ embeds: [embed], components });
    } catch (error) {
      logger.error({ error, guildId }, 'Failed to update player panel');
    }
  }

  async createPanel(queue: QueueData, channel: TextChannel): Promise<void> {
    const embed = this.buildEmbed(queue);
    const components = this.buildComponents(queue);

    const message = await channel.send({ embeds: [embed], components });

    this.panels.set(queue.guildId, {
      messageId: message.id,
      channelId: channel.id,
      guildId: queue.guildId,
    });

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 24 * 60 * 60 * 1000,
    });

    collector.on('collect', async (interaction) => {
      if (!this.handlers) return;

      const member = interaction.member as GuildMember | null;
      if (!this.handlers.checkSameChannel(member, queue.guildId)) {
        await interaction.reply({
          content: 'You must be in the same voice channel as the bot to use these buttons.',
          ephemeral: true,
        });
        return;
      }

      const now = Date.now();
      const lastAction = this.lastActionTime.get(queue.guildId) ?? 0;
      const elapsed = now - lastAction;

      if (elapsed < UIManager.ACTION_COOLDOWN_MS) {
        await interaction.deferUpdate().catch(() => {});
        return;
      }

      if (interaction.customId === 'skip') {
        const q = queueManager.get(queue.guildId);
        if (q && q.trackStartedAt > 0) {
          const trackElapsed = now - q.trackStartedAt;
          if (trackElapsed < UIManager.MIN_PLAY_TIME_MS) {
            await interaction.deferUpdate().catch(() => {});
            return;
          }
        }
      }

      this.lastActionTime.set(queue.guildId, now);
      await interaction.deferUpdate();

      switch (interaction.customId) {
        case 'previous':
          await this.handlers.onPrevious(queue.guildId);
          break;
        case 'pause_resume':
          await this.handlers.onPauseResume(queue.guildId);
          break;
        case 'skip':
          await this.handlers.onSkip(queue.guildId);
          break;
        case 'repeat_one':
          await this.handlers.onRepeatOne(queue.guildId);
          break;
        case 'repeat_queue':
          await this.handlers.onRepeatQueue(queue.guildId);
          break;
        case 'shuffle':
          await this.handlers.onShuffle(queue.guildId);
          break;
        case 'stop':
          await this.handlers.onStop(queue.guildId);
          break;
        case 'leave':
          await this.handlers.onLeave(queue.guildId);
          break;
      }
    });

    collector.on('end', async () => {
      try {
        const msg = await channel.messages.fetch(message.id);
        if (msg.editable) {
          const rows = msg.components.map((row) => {
            const builder = new ActionRowBuilder<ButtonBuilder>();
            if ('components' in row) {
              for (const component of (row as any).components) {
                if (component.type === ComponentType.Button) {
                  builder.addComponents(ButtonBuilder.from(component).setDisabled(true));
                }
              }
            }
            return builder;
          });
          await msg.edit({ components: rows });
        }
      } catch {
      }
    });
  }

  buildEmbed(queue: QueueData): EmbedBuilder {
    const track = queue.currentTrack;
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR);

    if (track) {
      embed
        .setTitle(track.title)
        .setURL(track.url)
        .setDescription(`by ${track.artist}`)
        .setThumbnail(track.thumbnail)
        .addFields(
          { name: 'Duration', value: this.formatDuration(track.duration), inline: true },
          { name: 'Requested by', value: track.requestedBy.toString(), inline: true },
          { name: 'Repeat', value: `${this.getRepeatIcon(queue.repeatMode)} ${queue.repeatMode}`, inline: true },
          { name: 'Queue', value: `${queue.tracks.length} tracks queued`, inline: true },
          { name: 'Status', value: queue.paused ? '⏸️ Paused' : '▶️ Playing', inline: true },
          { name: 'Shuffle', value: queue.shuffled ? '🔀 On' : '➡️ Off', inline: true }
        );
    } else {
      embed
        .setTitle('No track playing')
        .setDescription('Add songs to the queue with `/play`')
        .addFields(
          { name: 'Repeat', value: `${this.getRepeatIcon(queue.repeatMode)} ${queue.repeatMode}`, inline: true },
          { name: 'Queue', value: '0 tracks queued', inline: true },
          { name: 'Shuffle', value: queue.shuffled ? '🔀 On' : '➡️ Off', inline: true }
        )
        .setFooter({ text: 'Synk' });
    }

    return embed;
  }

  buildComponents(queue: QueueData): ActionRowBuilder<ButtonBuilder>[] {
    const previousBtn = new ButtonBuilder()
      .setCustomId('previous')
      .setEmoji('⏮️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!queue.currentTrack && queue.history.length === 0);

    const pauseResumeBtn = new ButtonBuilder()
      .setCustomId('pause_resume')
      .setEmoji(queue.paused ? '▶️' : '⏸️')
      .setStyle(queue.paused ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(!queue.currentTrack);

    const skipBtn = new ButtonBuilder()
      .setCustomId('skip')
      .setEmoji('⏭️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!queue.currentTrack);

    const repeatOneBtn = new ButtonBuilder()
      .setCustomId('repeat_one')
      .setEmoji('🔂')
      .setStyle(queue.repeatMode === 'one' ? ButtonStyle.Primary : ButtonStyle.Secondary);

    const repeatQueueBtn = new ButtonBuilder()
      .setCustomId('repeat_queue')
      .setEmoji('🔁')
      .setStyle(queue.repeatMode === 'queue' ? ButtonStyle.Primary : ButtonStyle.Secondary);

    const shuffleBtn = new ButtonBuilder()
      .setCustomId('shuffle')
      .setEmoji('🔀')
      .setStyle(queue.shuffled ? ButtonStyle.Primary : ButtonStyle.Secondary);

    const stopBtn = new ButtonBuilder()
      .setCustomId('stop')
      .setEmoji('⏹️')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!queue.currentTrack);

    const leaveBtn = new ButtonBuilder()
      .setCustomId('leave')
      .setEmoji('👋')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!queue.voiceChannel);

    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      previousBtn, pauseResumeBtn, skipBtn, repeatOneBtn, repeatQueueBtn
    );

    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      shuffleBtn, stopBtn, leaveBtn
    );

    return [row1, row2];
  }

  async removePanel(guildId: string): Promise<void> {
    const panel = this.panels.get(guildId);
    if (!panel || !panel.messageId) {
      this.panels.delete(guildId);
      return;
    }

    try {
      const guild = queueManager.get(guildId)?.guild;
      if (guild) {
        const channel = guild.client.channels.cache.get(panel.channelId) as TextChannel | undefined;
        if (channel) {
          const message = await channel.messages.fetch(panel.messageId);
          await message.delete().catch(() => {});
        }
      }
    } catch {
    }

    this.panels.delete(guildId);
    this.lastActionTime.delete(guildId);
  }
}

export const uiManager = new UIManager();
