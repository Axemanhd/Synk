import dotenv from 'dotenv';
dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, defaultValue: string): string {
  return process.env[name] ?? defaultValue;
}

export const config = {
  botName: 'Synk',
  discord: {
    token: required('DISCORD_TOKEN'),
    clientId: required('DISCORD_CLIENT_ID'),
  },
  spotify: {
    clientId: process.env.SPOTIFY_CLIENT_ID || '',
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET || '',
  },
  logLevel: optional('LOG_LEVEL', 'info'),
  inactivity: {
    pauseAfterMs: 5 * 60 * 1000,
    leaveAfterMs: 15 * 60 * 1000,
  },
  maxPlaylistTracks: 700,
} as const;
