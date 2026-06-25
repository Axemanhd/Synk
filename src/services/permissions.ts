import { CommandInteraction, ButtonInteraction, GuildMember, VoiceChannel, ChannelType } from 'discord.js';

export class PermissionsManager {
  isUserInVoiceChannel(member: GuildMember | null): member is GuildMember & { voice: { channel: VoiceChannel } } {
    if (!member) return false;
    if (!member.voice.channel) return false;
    return member.voice.channel.type === ChannelType.GuildVoice;
  }

  isInSameVoiceChannel(member: GuildMember | null, botMember: GuildMember | null): boolean {
    if (!member || !botMember) return false;
    if (!member.voice.channel || !botMember.voice.channel) return false;
    return member.voice.channel.id === botMember.voice.channel.id;
  }

  async requireVoiceChannel(interaction: CommandInteraction | ButtonInteraction): Promise<boolean> {
    const member = interaction.member as GuildMember | null;
    const botMember = interaction.guild?.members.me ?? null;

    if (!this.isUserInVoiceChannel(member)) {
      await interaction.reply({
        content: 'You must be connected to a voice channel to use this command.',
        ephemeral: true,
      });
      return false;
    }

    if (botMember?.voice.channel && !this.isInSameVoiceChannel(member, botMember)) {
      await interaction.reply({
        content: 'You must be in the same voice channel as the bot to control playback.',
        ephemeral: true,
      });
      return false;
    }

    if (!botMember?.voice.channel) {
      await interaction.reply({
        content: 'The bot is not connected to a voice channel. Use /play first.',
        ephemeral: true,
      });
      return false;
    }

    return true;
  }

  async requireSameChannel(interaction: CommandInteraction | ButtonInteraction): Promise<boolean> {
    return this.requireVoiceChannel(interaction);
  }
}

export const permissionsManager = new PermissionsManager();
