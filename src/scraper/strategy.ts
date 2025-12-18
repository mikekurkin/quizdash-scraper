import type { Game, GameResult } from "../types";

export interface ScraperStrategy {
  // Constructor signature for implementation strategy classes
  // new (city: City, storage: Storage): ScraperStrategy;

  strategy: string;

  /**
   * Scrapes games for a given city.
   */
  scrapeGames(): Promise<Game[]>;

  /**
   * Scrapes the results for a single game.
   */
  scrapeResults(game: Game): Promise<GameResult[]>;
}
