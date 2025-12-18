import { z } from "zod";

const UrlConfigSchema = z.object({
  baseUrl: z.string().url(),
  paths: z.object({
    gameResultsApi: z.function(z.tuple([z.string()]), z.string()),
    gamesApi: z.function(z.tuple([z.number()]), z.string()),
  }),
});

const urlConfig = UrlConfigSchema.parse({
  baseUrl: process.env.API_BASE_URL || "https://api.quizplease.ru/api",
  paths: {
    gameResultsApi: (gameId: string) => `/games/${gameId}/results`,
    gamesApi: (cityId: number) => `/games/finished/${cityId}`,
  },
});

export function buildGamesApiUrl(cityId: number): string {
  return `${urlConfig.baseUrl}${urlConfig.paths.gamesApi(cityId)}`;
}

export function buildGameResultsApiUrl(gameId: string): string {
  return `${urlConfig.baseUrl}${urlConfig.paths.gameResultsApi(gameId)}`;
  // return `https://${citySlug}.quizplease.ru${urlConfig.paths.gameResultsPage}`;
}
