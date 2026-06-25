import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  TextChannel,
  GuildMember,
  ChannelType,
  User,
} from 'discord.js';
import { logger } from '../logger';
import { queueManager } from '../services/queue-manager';
import { musicService } from '../services/music-service';
import { permissionsManager } from '../services/permissions';
import { uiManager } from '../services/ui-manager';
import {
  isYouTubeUrl,
  isYouTubePlaylistUrl,
  getYouTubeVideoInfo,
  getYouTubePlaylist,
  searchYouTubeVideo,
} from '../providers/youtube';
import {
  isSpotifyUrl,
  isSpotifyPlaylistUrl,
  isSpotifyTrackUrl,
  getSpotifyTrack,
  getSpotifyPlaylist,
} from '../providers/spotify';
import { Track } from '../types';

export interface Command {
  data: SlashCommandBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

const SEARCH_CONCURRENCY = 15;

async function resolveBatch(
  items: { title: string; artist: string; thumbnail: string; duration: number }[],
  requestedBy: User,
  onProgress?: (done: number, total: number) => void,
): Promise<Track[]> {
  const results: Track[] = [];
  const queue = [...items];
  let completed = 0;

  const worker = async () => {
    while (queue.length > 0) {
      const item = queue.shift()!;
      const query = `${item.title} ${item.artist}`;
      const searched = await searchYouTubeVideo(query);
      if (searched) {
        results.push({
          url: searched.url,
          title: item.title,
          artist: item.artist,
          duration: item.duration,
          thumbnail: item.thumbnail || searched.thumbnail,
          requestedBy,
          source: 'spotify' as const,
        });
      }
      completed++;
      onProgress?.(completed, items.length);
    }
  };

  const workers = Array.from({ length: Math.min(SEARCH_CONCURRENCY, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function resolveToTrack(
  url: string,
  requestedBy: User,
  onProgress?: (done: number, total: number) => void,
): Promise<Track[]> {
  if (isYouTubeUrl(url)) {
    if (isYouTubePlaylistUrl(url)) {
      const videos = await getYouTubePlaylist(url);
      return videos.map((v) => ({
        url: v.url,
        title: v.title,
        artist: v.artist,
        duration: v.duration,
        thumbnail: v.thumbnail,
        requestedBy,
        source: 'youtube' as const,
      }));
    }

    const info = await getYouTubeVideoInfo(url);
    if (!info) {
      const searched = await searchYouTubeVideo(url);
      if (!searched) return [];
      return [{
        url: searched.url,
        title: searched.title,
        artist: searched.artist,
        duration: searched.duration,
        thumbnail: searched.thumbnail,
        requestedBy,
        source: 'youtube' as const,
      }];
    }

    return [{
      url: info.url,
      title: info.title,
      artist: info.artist,
      duration: info.duration,
      thumbnail: info.thumbnail,
      requestedBy,
      source: 'youtube' as const,
    }];
  }

  if (isSpotifyUrl(url)) {
    if (isSpotifyPlaylistUrl(url)) {
      const spotifyPlaylist = await getSpotifyPlaylist(url);
      if (!spotifyPlaylist) return [];
      return resolveBatch(spotifyPlaylist.tracks, requestedBy, onProgress);
    }

    if (isSpotifyTrackUrl(url)) {
      const spotifyTrack = await getSpotifyTrack(url);
      if (!spotifyTrack) return [];

      const query = `${spotifyTrack.title} ${spotifyTrack.artist}`;
      const searched = await searchYouTubeVideo(query);
      if (!searched) return [];

      return [{
        url: searched.url,
        title: spotifyTrack.title,
        artist: spotifyTrack.artist,
        duration: spotifyTrack.duration,
        thumbnail: spotifyTrack.thumbnail || searched.thumbnail,
        requestedBy,
        source: 'spotify' as const,
      }];
    }
  }

  const searched = await searchYouTubeVideo(url);
  if (!searched) return [];

  return [{
    url: searched.url,
    title: searched.title,
    artist: searched.artist,
    duration: searched.duration,
    thumbnail: searched.thumbnail,
    requestedBy,
    source: 'youtube' as const,
  }];
}

export const commands: Command[] = [
  {
    data: new SlashCommandBuilder()
      .setName('play')
      .setDescription('Play a song, playlist, or search Spotify by name')
      .addStringOption((option) =>
        option.setName('input')
          .setDescription('YouTube/Spotify URL or song name to search on Spotify')
          .setRequired(true)
      ) as SlashCommandBuilder,
    execute: async (interaction) => {
      const member = interaction.member as GuildMember | null;
      if (!member || !member.voice.channel) {
        await interaction.reply({ content: 'You must be connected to a voice channel first.', ephemeral: true });
        return;
      }

      const input = interaction.options.getString('input', true);
      const voiceChannel = member.voice.channel;
      const guild = interaction.guild!;

      if (voiceChannel.type !== ChannelType.GuildVoice) {
        await interaction.reply({ content: 'You must be in a regular voice channel.', ephemeral: true });
        return;
      }

      if (isYouTubeUrl(input) || isSpotifyUrl(input)) {
        await interaction.deferReply();

        let lastProgressUpdate = 0;
        const tracks = await resolveToTrack(input, member.user, (done, total) => {
          if (total > 20 && done - lastProgressUpdate >= 10) {
            lastProgressUpdate = done;
            interaction.editReply({ content: `Processing playlist... ${done}/${total} tracks resolved.` }).catch(() => {});
          }
        });
        if (tracks.length === 0) {
          await interaction.editReply({ content: 'Could not find any playable tracks from that URL.' });
          return;
        }

        const queue = queueManager.getOrCreate(guild, voiceChannel);

        const wasEmpty = queue.tracks.length === 0 && !queue.currentTrack;
        const isFirstTrack = !queue.currentTrack;

        queueManager.addTracks(queue, tracks);

        if (wasEmpty || isFirstTrack) {
          await musicService.start(guild.id, voiceChannel);
          const channel = interaction.channel;
          if (channel instanceof TextChannel) {
            await uiManager.createPanel(queue, channel);
          }
        } else {
          await uiManager.updatePanel(guild.id);
        }

        const word = tracks.length === 1 ? 'track' : 'tracks';
        await interaction.editReply({
          content: `Added **${tracks.length}** ${word} to the queue.`,
        });
      } else {
        await interaction.deferReply();

        const tracks = await resolveToTrack(input, member.user);
        if (tracks.length === 0) {
          await interaction.editReply({ content: `Could not find anything for "${input}".` });
          return;
        }

        const queue = queueManager.getOrCreate(guild, voiceChannel);

        const wasEmpty = queue.tracks.length === 0 && !queue.currentTrack;
        const isFirstTrack = !queue.currentTrack;

        queueManager.addTracks(queue, tracks);

        if (wasEmpty || isFirstTrack) {
          await musicService.start(guild.id, voiceChannel);
          const channel = interaction.channel;
          if (channel instanceof TextChannel) {
            await uiManager.createPanel(queue, channel);
          }
        } else {
          await uiManager.updatePanel(guild.id);
        }

        const word = tracks.length === 1 ? 'track' : 'tracks';
        await interaction.editReply({
          content: `Added **${tracks.length}** ${word} to the queue.`,
        });
      }
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('pause')
      .setDescription('Pause the current playback'),
    execute: async (interaction) => {
      if (!(await permissionsManager.requireVoiceChannel(interaction))) return;

      const guildId = interaction.guildId!;
      const success = musicService.pause(guildId);

      if (!success) {
        await interaction.reply({ content: 'Nothing is currently playing.', ephemeral: true });
        return;
      }

      await interaction.reply({ content: '⏸️ Paused playback.' });
      await uiManager.updatePanel(guildId);
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('resume')
      .setDescription('Resume paused playback'),
    execute: async (interaction) => {
      if (!(await permissionsManager.requireVoiceChannel(interaction))) return;

      const guildId = interaction.guildId!;
      const success = musicService.resume(guildId);

      if (!success) {
        await interaction.reply({ content: 'Playback is not paused.', ephemeral: true });
        return;
      }

      await interaction.reply({ content: '▶️ Resumed playback.' });
      await uiManager.updatePanel(guildId);
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('skip')
      .setDescription('Skip to the next track'),
    execute: async (interaction) => {
      if (!(await permissionsManager.requireVoiceChannel(interaction))) return;

      const guildId = interaction.guildId!;
      const success = musicService.skip(guildId);

      if (!success) {
        await interaction.reply({ content: 'Nothing to skip.', ephemeral: true });
        return;
      }

      await interaction.reply({ content: '⏭️ Skipped track.' });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('previous')
      .setDescription('Go back to the previous track'),
    execute: async (interaction) => {
      if (!(await permissionsManager.requireVoiceChannel(interaction))) return;

      const guildId = interaction.guildId!;
      const success = await musicService.previous(guildId);

      if (!success) {
        await interaction.reply({ content: 'No previous track available.', ephemeral: true });
        return;
      }

      await interaction.reply({ content: '⏮️ Going back to previous track.' });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('stop')
      .setDescription('Stop playback and clear the queue'),
    execute: async (interaction) => {
      if (!(await permissionsManager.requireVoiceChannel(interaction))) return;

      const guildId = interaction.guildId!;
      musicService.stop(guildId);

      await interaction.reply({ content: '⏹️ Stopped playback and cleared queue.' });
      await uiManager.removePanel(guildId);
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('leave')
      .setDescription('Make the bot leave the voice channel'),
    execute: async (interaction) => {
      if (!(await permissionsManager.requireVoiceChannel(interaction))) return;

      const guildId = interaction.guildId!;
      musicService.leave(guildId);

      await interaction.reply({ content: '👋 Left the voice channel.' });
      await uiManager.removePanel(guildId);
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('queue')
      .setDescription('Display the current music queue'),
    execute: async (interaction) => {
      const guildId = interaction.guildId!;
      const queue = queueManager.get(guildId);

      if (!queue || (queue.tracks.length === 0 && !queue.currentTrack)) {
        await interaction.reply({ content: 'The queue is empty.', ephemeral: true });
        return;
      }

      const trackList = queue.tracks
        .slice(0, 20)
        .map((t, i) => `${i + 1}. **${t.title}** - ${t.artist} (requested by ${t.requestedBy})`)
        .join('\n');

      const current = queue.currentTrack
        ? `🎵 **Now Playing:** ${queue.currentTrack.title} - ${queue.currentTrack.artist}`
        : 'Nothing currently playing.';

      const more = queue.tracks.length > 20
        ? `\n\n...and ${queue.tracks.length - 20} more tracks.`
        : '';

      const repeatInfo = queue.repeatMode !== 'off'
        ? `\n🔁 Repeat: ${queue.repeatMode}`
        : '';

      await interaction.reply({
        content: `${current}\n\n**Up Next:**\n${trackList}${more}${repeatInfo}`,
        ephemeral: true,
      });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('nowplaying')
      .setDescription('Show the currently playing track'),
    execute: async (interaction) => {
      const guildId = interaction.guildId!;
      const queue = queueManager.get(guildId);

      if (!queue || !queue.currentTrack) {
        await interaction.reply({ content: 'Nothing is currently playing.', ephemeral: true });
        return;
      }

      const track = queue.currentTrack;
      const status = queue.paused ? '⏸️ Paused' : '▶️ Playing';

      await interaction.reply({
        embeds: [uiManager.buildEmbed(queue)],
        ephemeral: true,
      });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('repeat')
      .setDescription('Set the repeat mode')
      .addStringOption((option) =>
        option.setName('mode')
          .setDescription('Repeat mode')
          .setRequired(true)
          .addChoices(
            { name: 'Off', value: 'off' },
            { name: 'One', value: 'one' },
            { name: 'Queue', value: 'queue' }
          )
      ) as SlashCommandBuilder,
    execute: async (interaction) => {
      if (!(await permissionsManager.requireVoiceChannel(interaction))) return;

      const guildId = interaction.guildId!;
      const mode = interaction.options.getString('mode', true) as 'off' | 'one' | 'queue';

      musicService.setRepeatMode(guildId, mode);

      const labels: Record<string, string> = {
        off: '➡️ Repeat turned off',
        one: '🔂 Repeat one enabled',
        queue: '🔁 Repeat queue enabled',
      };

      await interaction.reply({ content: labels[mode] });
      await uiManager.updatePanel(guildId);
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('playlist')
      .setDescription('Queue a Spotify or YouTube playlist')
      .addStringOption((option) =>
        option.setName('url')
          .setDescription('Spotify or YouTube playlist URL')
          .setRequired(true)
      )
      .addBooleanOption((option) =>
        option.setName('shuffle')
          .setDescription('Shuffle the playlist tracks')
          .setRequired(false)
      ) as SlashCommandBuilder,
    execute: async (interaction) => {
      const member = interaction.member as GuildMember | null;
      if (!member || !member.voice.channel) {
        await interaction.reply({ content: 'You must be connected to a voice channel first.', ephemeral: true });
        return;
      }

      await interaction.deferReply();

      const url = interaction.options.getString('url', true);
      const shuffleOption = interaction.options.getBoolean('shuffle') ?? false;
      const voiceChannel = member.voice.channel;
      const guild = interaction.guild!;

      if (!isSpotifyPlaylistUrl(url) && !isYouTubePlaylistUrl(url)) {
        await interaction.editReply({ content: 'Please provide a valid Spotify or YouTube playlist URL.' });
        return;
      }

      const tracks = await resolveToTrack(url, member.user);
      if (tracks.length === 0) {
        await interaction.editReply({ content: 'Could not find any playable tracks from that playlist.' });
        return;
      }

      if (voiceChannel.type !== ChannelType.GuildVoice) {
        await interaction.editReply({ content: 'You must be in a regular voice channel.' });
        return;
      }

      const queue = queueManager.getOrCreate(guild, voiceChannel);

      if (shuffleOption) {
        queueManager.setShuffled(queue, true);
        queueManager.addTracks(queue, tracks);
      } else {
        queueManager.addTracks(queue, tracks);
      }

      const wasEmpty = queue.tracks.length === tracks.length && !queue.currentTrack;

      if (wasEmpty || !queue.currentTrack) {
        await musicService.start(guild.id, voiceChannel);
        const channel = interaction.channel;
        if (channel instanceof TextChannel) {
          await uiManager.createPanel(queue, channel);
        }
      } else {
        await uiManager.updatePanel(guild.id);
      }

      await interaction.editReply({
        content: `Added **${tracks.length}** tracks from the playlist to the queue.${shuffleOption ? ' 🔀 Shuffled.' : ''}`,
      });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('shuffle')
      .setDescription('Toggle shuffle mode for the queue'),
    execute: async (interaction) => {
      if (!(await permissionsManager.requireVoiceChannel(interaction))) return;

      const guildId = interaction.guildId!;
      const queue = queueManager.get(guildId);

      if (!queue) {
        await interaction.reply({ content: 'No active queue.', ephemeral: true });
        return;
      }

      const newState = !queue.shuffled;
      if (newState) {
        musicService.shuffle(guildId);
      } else {
        queueManager.setShuffled(queue, false);
      }

      await interaction.reply({ content: newState ? '🔀 Shuffle enabled and queue shuffled.' : '➡️ Shuffle disabled.' });
      await uiManager.updatePanel(guildId);
    },
  },
];
