import { z } from 'zod';

const UrlConfigSchema = z.object({
  baseUrl: z.string().url(),
  paths: z.object({
    gameResultsPage: z.string(),
    gamesApi: z.string(),
  }),
});

const urlConfig = UrlConfigSchema.parse({
  baseUrl: process.env.API_BASE_URL || 'https://quizplease.ru',
  paths: {
    gameResultsPage: '/game-page',
    gamesApi: '/api/game',
  },
});

export function buildGamesApiUrl(): string {
  return `${urlConfig.baseUrl}${urlConfig.paths.gamesApi}`;
}

export function buildGameUrl(citySlug: string): string {
  return `https://${citySlug}.quizplease.ru${urlConfig.paths.gameResultsPage}`;
}
