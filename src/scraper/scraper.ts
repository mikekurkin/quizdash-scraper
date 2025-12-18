import { ScraperStrategy } from "./strategy";
import { V1Scraper } from "./v1";
import { V2Scraper } from "./v2";
import type { City, RankMapping } from "../types";
import { logger } from "../utils/logger";
import type { Storage } from "../storage/interface";

const strategies: { [key: string]: new (city: City, storage: Storage, rankMappings: RankMapping[]) => ScraperStrategy } = {
  v1: V1Scraper,
  v2: V2Scraper,
};

export const availableStrategies = Object.keys(strategies);

export function createScraper(city: City, storage: Storage, rankMappings: RankMapping[]): ScraperStrategy {
  const strategyKey = city.params?.scrape?.strategy ?? "v1"; // Default to 'v1'
  const ScraperClass = strategies[strategyKey];

  if (ScraperClass) {
    return new ScraperClass(city, storage, rankMappings);
  }

  logger.warn(`Unknown scraper strategy '${strategyKey}'. Falling back to v1.`);
  return new V1Scraper(city, storage, rankMappings);
}
