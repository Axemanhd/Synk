import { Client, GatewayIntentBits, REST, Routes, Events, GuildMember } from 'discord.js';
import { config } from './config';
import { logger } from './logger';
import { commands } from './commands';
import { musicService } from './services/music-service';
import { uiManager } from './services/ui-manager';
import { permissionsManager } from './services/permissions';
import { queueManager } from './services/queue-manager';

// Ensure FFmpeg is in PATH (winget installs to a location not always in PATH immediately)
if (process.platform === 'win32') {
  const envPath = process.env.PATH || '';
  const candidates = [
    `${process.env.LOCALAPPDATA}\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg.Essentials_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.1-essentials_build\\bin`,
    `${process.env.LOCALAPPDATA}\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.1-full_build\\bin`,
  ];
  for (const dir of candidates) {
    if (!envPath.includes(dir)) {
      process.env.PATH = `${dir};${process.env.PATH}`;
    }
  }
}

async function registerCommands(): Promise<void> {
  try {
    const rest = new REST({ version: '10' }).setToken(config.discord.token);
    const commandData = commands.map((c) => c.data.toJSON());

    logger.info('Registering slash commands globally...');
    await rest.put(
      Routes.applicationCommands(config.discord.clientId),
      { body: commandData }
    );
    logger.info('Slash commands registered successfully.');
  } catch (error) {
    logger.error({ error }, 'Failed to register slash commands');
    throw error;
  }
}

async function main(): Promise<void> {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  uiManager.setHandlers({
    onPrevious: async (guildId) => {
      await musicService.previous(guildId);
      await uiManager.updatePanel(guildId);
    },
    onPauseResume: async (guildId) => {
      const queue = queueManager.get(guildId);
      if (queue?.paused) {
        musicService.resume(guildId);
      } else {
        musicService.pause(guildId);
      }
      await uiManager.updatePanel(guildId);
    },
    onSkip: async (guildId) => {
      musicService.skip(guildId);
      await uiManager.updatePanel(guildId);
    },
    onShuffle: async (guildId) => {
      musicService.shuffle(guildId);
      await uiManager.updatePanel(guildId);
    },
    onRepeatOne: async (guildId) => {
      const queue = queueManager.get(guildId);
      if (queue) {
        const nextMode = queue.repeatMode === 'one' ? 'off' : 'one';
        musicService.setRepeatMode(guildId, nextMode as any);
        await uiManager.updatePanel(guildId);
      }
    },
    onRepeatQueue: async (guildId) => {
      const queue = queueManager.get(guildId);
      if (queue) {
        const nextMode = queue.repeatMode === 'queue' ? 'off' : 'queue';
        musicService.setRepeatMode(guildId, nextMode as any);
        await uiManager.updatePanel(guildId);
      }
    },
    onStop: async (guildId) => {
      musicService.stop(guildId);
      await uiManager.removePanel(guildId);
    },
    onLeave: async (guildId) => {
      musicService.leave(guildId);
      await uiManager.removePanel(guildId);
    },
    checkSameChannel: (member: GuildMember | null, guildId: string): boolean => {
      const queue = queueManager.get(guildId);
      if (!queue || !queue.voiceChannel) return false;
      if (!member?.voice.channel) return false;
      return member.voice.channel.id === queue.voiceChannel.id;
    },
  });

  client.once(Events.ClientReady, async () => {
    logger.info(`Logged in as ${client.user!.tag}`);
    await registerCommands();
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = commands.find((c) => c.data.name === interaction.commandName);
    if (!command) {
      await interaction.reply({ content: 'Unknown command.', ephemeral: true });
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      logger.error({ error, command: interaction.commandName }, 'Command execution error');
      const reply = interaction.replied || interaction.deferred
        ? interaction.editReply.bind(interaction)
        : interaction.reply.bind(interaction);

      await reply({
        content: 'An error occurred while executing the command.',
        ephemeral: true,
      }).catch(() => {});
    }
  });

  client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    const guildId = newState.guild.id;
    const queue = queueManager.get(guildId);

    if (!queue || !queue.voiceChannel) return;

    const currentChannel = queue.voiceChannel;
    const botId = client.user!.id;

    if (newState.member?.id === botId) {
      if (!newState.channelId) {
        musicService.cleanup(guildId);
        uiManager.removePanel(guildId);
      }
      return;
    }

    const botVoiceState = newState.guild.members.me?.voice;
    if (!botVoiceState?.channel) return;
    if (botVoiceState.channel.id !== currentChannel.id) return;

    const memberCount = currentChannel.members.filter((m) => !m.user.bot).size;
    if (memberCount === 0) {
      musicService.getInactivityManager().startTimers(guildId);
    } else {
      musicService.getInactivityManager().cancelTimers(guildId);
    }
  });

  await client.login(config.discord.token);
}

main().catch((error) => {
  logger.fatal({ error }, 'Bot failed to start');
  process.exit(1);
});
