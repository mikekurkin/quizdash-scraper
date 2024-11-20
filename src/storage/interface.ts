import type { City, Game, GameResult, RankMapping, Series, Team } from '../types';

export interface Storage {
  // Initialization
  initialize(): Promise<void>;

  // City operations
  findCityByName(name: string): Promise<City | null>;
  getCities(): Promise<City[]>;
  getCitiesByIds(ids: number[]): Promise<City[]>;
  updateCityLastGameId(cityId: number, lastGameId: number): Promise<void>;

  // Series operations
  findSeriesByName(name: string): Promise<Series | null>;
  saveSeries(series: Series): Promise<void>;

  // Rank operations
  getRankMappings(): Promise<RankMapping[]>;

  // Game operations
  saveGames(games: Game[]): Promise<void>;
  getLastGameId(): Promise<number | null>;
  getGamesWithoutResults(): Promise<Game[]>;
  markGameAsProcessed(gameId: number): Promise<void>;

  // Result operations
  saveResults(results: GameResult[]): Promise<void>;
  hasResultsForGame(gameId: number): Promise<boolean>;

  // Team operations
  findTeamByNameAndCity(name: string, cityId: number): Promise<Team | null>;
  saveTeam(team: Team): Promise<void>;
  findTeamBySlugAndCity(slug: string, cityId: number): Promise<Team | null>;

  // Sync changes
  syncChanges(message?: string): Promise<void>;
}

export class StorageError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = 'StorageError';
  }
}
