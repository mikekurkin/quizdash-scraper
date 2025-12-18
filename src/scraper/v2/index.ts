import { ScraperStrategy } from "../strategy";
import { scrapeGames as scrapeGamesV2 } from "./games";
import { scrapeResults as scrapeResultsV2 } from "./results";
import type { Storage } from "../../storage/interface";
import type { City, Game, GameResult, RankMapping } from "../../types";

export class V2Scraper implements ScraperStrategy {
  private readonly city: City;
  private readonly storage: Storage;
  private readonly rankMappings: RankMapping[];
  readonly strategy: string = 'v2';

  constructor(city: City, storage: Storage, rankMappings: RankMapping[]) {
    this.city = city;
    this.storage = storage;
    this.rankMappings = rankMappings;
  }

  async scrapeGames(): Promise<Game[]> {
    return scrapeGamesV2([this.city], this.storage);
  }

  async scrapeResults(
    game: Game,
  ): Promise<GameResult[]> {
    return scrapeResultsV2(game._id, this.city, this.rankMappings, this.storage);
  }
}
