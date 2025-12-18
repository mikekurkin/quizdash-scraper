import { ScraperStrategy } from "../strategy";
import { scrapeGames as scrapeGamesV1 } from "./games";
import { scrapeResults as scrapeResultsV1 } from "./results";
import type { Storage } from "../../storage/interface";
import type { City, Game, GameResult, RankMapping } from "../../types";

export class V1Scraper implements ScraperStrategy {
  private readonly city: City;
  // private readonly originalId: number;
  private readonly storage: Storage;
  private readonly rankMappings: RankMapping[];
  readonly strategy: string = 'v1';

  constructor(city: City, storage: Storage, rankMappings: RankMapping[]) {
    this.city = {
      ...city,
      // _id: city.params?.scrape?._id !== undefined ? city.params.scrape._id : city._id
    };
    // this.originalId = city._id;
    this.storage = storage;
    this.rankMappings = rankMappings;
  }

  async scrapeGames(): Promise<Game[]> {
    // const scrapedGames = await scrapeGamesV1([this.city], this.storage);
    // return scrapedGames.map(game => ({...game,
    //   city_id: this.originalId
    // }))
    return scrapeGamesV1([this.city], this.storage);
  }

  async scrapeResults(
    game: Game,
  ): Promise<GameResult[]> {
    return scrapeResultsV1(game._id, this.city, this.rankMappings, this.storage);
  }
}
