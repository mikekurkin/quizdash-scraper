import { parse } from 'csv-parse/sync';
import { createObjectCsvWriter } from 'csv-writer';
import fs from 'fs/promises';
import path from 'path';
import { config } from '../config';
import type { City, Game, GameResult, RankMapping, Series, Team } from '../types';
import { logger } from '../utils/logger';
import { normalizeText } from '../utils/normalize';
import type { Storage } from './interface';
import { StorageError } from './interface';

export class CsvStorage implements Storage {
  private readonly gamesFile: string;
  private readonly resultsFile: string;
  private readonly citiesFile: string;
  private readonly ranksFile: string;
  private readonly teamsFile: string;
  private readonly seriesFile: string;

  constructor(
    gamesFile = path.join(config.storage.path, 'games.csv'),
    resultsFile = path.join(config.storage.path, 'results.csv'),
    citiesFile = path.join(config.storage.path, 'cities.csv'),
    ranksFile = path.join(config.storage.path, 'ranks.csv'),
    teamsFile = path.join(config.storage.path, 'teams.csv'),
    seriesFile = path.join(config.storage.path, 'series.csv')
  ) {
    this.gamesFile = gamesFile;
    this.resultsFile = resultsFile;
    this.citiesFile = citiesFile;
    this.ranksFile = ranksFile;
    this.teamsFile = teamsFile;
    this.seriesFile = seriesFile;
  }
  async findCityByName(name: string): Promise<City | null> {
    try {
      const content = await fs.readFile(this.citiesFile, 'utf-8');
      const records = parse(content, {
        columns: true,
        skip_empty_lines: true,
      });

      const normalizedName = normalizeText(name).toLowerCase();
      const city = records.find((record: any) => normalizeText(record.name).toLowerCase() === normalizedName);

      if (!city) return null;

      return {
        _id: parseInt(city._id),
        name: city.name,
        slug: city.slug,
        timezone: city.timezone,
        last_game_id: city.last_game_id ? parseInt(city.last_game_id) : undefined,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw new StorageError('Failed to find city', error);
    }
  }

  async getCities(): Promise<City[]> {
    try {
      const content = await fs.readFile(this.citiesFile, 'utf-8');
      const records = parse(content, {
        columns: true,
        skip_empty_lines: true,
      });

      return records.map((record: any) => ({
        _id: parseInt(record._id),
        name: record.name,
        slug: record.slug,
        timezone: record.timezone,
        last_game_id: record.last_game_id ? parseInt(record.last_game_id) : undefined,
      }));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw new StorageError('Failed to get cities', error);
    }
  }

  async getCitiesByIds(ids: number[]): Promise<City[]> {
    const allCities = await this.getCities();
    return allCities.filter(city => ids.includes(city._id));
  }

  async updateCityLastGameId(cityId: number, lastGameId: number): Promise<void> {
    try {
      const cities = await this.getCities();
      const updatedCities = cities.map(city => ({
        ...city,
        last_game_id: city._id === cityId ? lastGameId : city.last_game_id,
      }));

      const csvWriter = createObjectCsvWriter({
        path: this.citiesFile,
        header: ['_id', 'name', 'slug', 'timezone', 'last_game_id'].map(key => ({
          id: key,
          title: key,
        })),
      });

      await csvWriter.writeRecords(updatedCities);
    } catch (error) {
      throw new StorageError(`Failed to update last game ID for city ${cityId}`, error);
    }
  }

  async findSeriesByName(name: string): Promise<Series | null> {
    try {
      const content = await fs.readFile(this.seriesFile, 'utf-8');
      const records = parse(content, {
        columns: true,
        skip_empty_lines: true,
      });

      const normalizedName = normalizeText(name).toLowerCase();
      const series = records.find((record: any) => normalizeText(record.name).toLowerCase() === normalizedName);

      if (!series) return null;

      return {
        _id: series._id,
        name: series.name,
        slug: series.slug,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw new StorageError('Failed to find series', error);
    }
  }

  async saveSeries(series: Series): Promise<void> {
    try {
      let fileExists = false;
      try {
        await fs.access(this.seriesFile);
        fileExists = true;
      } catch {
        // File doesn't exist
      }

      const csvWriter = createObjectCsvWriter({
        path: this.seriesFile,
        append: fileExists,
        header: ['_id', 'name', 'slug'].map(key => ({
          id: key,
          title: key,
        })),
      });

      await csvWriter.writeRecords([series]);
      logger.debug(`Saved series ${series.name} to ${this.seriesFile}`);
    } catch (error) {
      throw new StorageError(`Failed to save series ${series.name}`, error);
    }
  }

  async getRankMappings(): Promise<RankMapping[]> {
    try {
      const content = await fs.readFile(this.ranksFile, 'utf-8');
      const records = parse(content, {
        columns: true,
        skip_empty_lines: true,
      });

      return records.map((record: any) => ({
        _id: record._id,
        name: record.name,
        image_urls: record.image_urls,
        description: record.description,
      }));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw new StorageError('Failed to get rank mappings', error);
    }
  }

  async saveGames(games: Game[]): Promise<void> {
    if (!games.length) return;

    try {
      let fileExists = false;
      try {
        await fs.access(this.gamesFile);
        fileExists = true;
      } catch {
        // File doesn't exist
      }

      const csvWriter = createObjectCsvWriter({
        path: this.gamesFile,
        append: fileExists,
        header: Object.keys({ ...games[0], processed: false }).map(key => ({
          id: key,
          title: key,
        })),
      });

      const gamesWithProcessedFlag = games.map(game => ({
        ...game,
        processed: false,
      }));

      await csvWriter.writeRecords(gamesWithProcessedFlag);
      logger.debug(`Saved ${games.length} games to ${this.gamesFile}`);
    } catch (error) {
      throw new StorageError(`Failed to save games to ${this.gamesFile}`, error);
    }
  }

  async getLastGameId(): Promise<number | null> {
    try {
      const content = await fs.readFile(this.gamesFile, 'utf-8');
      const records = parse(content, {
        columns: true,
        skip_empty_lines: true,
      });

      if (!records.length) return null;

      return parseInt(records[records.length - 1]._id);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw new StorageError('Failed to get last game ID', error);
    }
  }

  async getGamesWithoutResults(): Promise<Game[]> {
    try {
      const content = await fs.readFile(this.gamesFile, 'utf-8');
      const records = parse(content, {
        columns: true,
        skip_empty_lines: true,
      });

      return records
        .filter((record: any) => record.processed !== 'true')
        .map((record: any) => ({
          ...record,
          _id: parseInt(record._id),
          city_id: parseInt(record.city_id),
          price: parseFloat(record.price),
          date: new Date(record.date),
          processed: record.processed === 'true',
        }));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw new StorageError('Failed to get games without results', error);
    }
  }

  async markGameAsProcessed(gameId: number): Promise<void> {
    try {
      const content = await fs.readFile(this.gamesFile, 'utf-8');
      const records = parse(content, {
        columns: true,
        skip_empty_lines: true,
      });

      const updatedRecords = records.map((record: any) => ({
        ...record,
        processed: record._id === gameId.toString() ? 'true' : record.processed,
      }));

      const csvWriter = createObjectCsvWriter({
        path: this.gamesFile,
        header: Object.keys(updatedRecords[0]).map(key => ({
          id: key,
          title: key,
        })),
      });

      await csvWriter.writeRecords(updatedRecords);
    } catch (error) {
      throw new StorageError(`Failed to mark game ${gameId} as processed`, error);
    }
  }

  async saveResults(results: GameResult[]): Promise<void> {
    if (!results.length) return;
    try {
      let fileExists = false;
      try {
        await fs.access(this.resultsFile);
        fileExists = true;
      } catch {
        // File doesn't exist
      }

      const csvWriter = createObjectCsvWriter({
        path: this.resultsFile,
        append: fileExists,
        header: Object.keys(results[0]).map(key => ({
          id: key,
          title: key,
        })),
      });

      await csvWriter.writeRecords(results);
      logger.debug(`Saved ${results.length} results to ${this.resultsFile}`);
    } catch (error) {
      throw new StorageError(`Failed to save results to ${this.resultsFile}`, error);
    }
  }

  async hasResultsForGame(gameId: number): Promise<boolean> {
    try {
      const content = await fs.readFile(this.resultsFile, 'utf-8');
      const records = parse(content, {
        columns: true,
        skip_empty_lines: true,
      });

      return records.some((record: any) => parseInt(record.game_id) === gameId);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return false;
      }
      throw new StorageError(`Failed to check results for game ${gameId}`, error);
    }
  }

  async findTeamByNameAndCity(name: string, cityId: number): Promise<Team | null> {
    try {
      const content = await fs.readFile(this.teamsFile, 'utf-8');
      const records = parse(content, {
        columns: true,
        skip_empty_lines: true,
      });

      const normalizedName = normalizeText(name).toLowerCase();
      const team = records.find(
        (record: any) =>
          normalizeText(record.name).toLowerCase() === normalizedName && parseInt(record.city_id) === cityId
      );

      if (!team) return null;

      return {
        _id: team._id,
        city_id: parseInt(team.city_id),
        name: team.name,
        slug: team.slug,
        previous_team_id: team.previous_team_id || undefined,
        inconsistent_rank: team.inconsistent_rank === 'true',
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw new StorageError('Failed to find team', error);
    }
  }

  async saveTeam(team: Team): Promise<void> {
    try {
      let fileExists = false;
      try {
        await fs.access(this.teamsFile);
        fileExists = true;
      } catch {
        // File doesn't exist
      }

      const csvWriter = createObjectCsvWriter({
        path: this.teamsFile,
        append: fileExists,
        header: ['_id', 'city_id', 'name', 'slug', 'previous_team_id', 'inconsistent_rank'].map(key => ({
          id: key,
          title: key,
        })),
      });

      await csvWriter.writeRecords([team]);
      logger.debug(`Saved team ${team.name} to ${this.teamsFile}`);
    } catch (error) {
      throw new StorageError(`Failed to save team ${team.name}`, error);
    }
  }

  async findTeamBySlugAndCity(slug: string, cityId: number): Promise<Team | null> {
    try {
      const content = await fs.readFile(this.teamsFile, 'utf-8');
      const records = parse(content, {
        columns: true,
        skip_empty_lines: true,
      });

      const team = records.find((record: any) => record.slug === slug && parseInt(record.city_id) === cityId);

      if (!team) return null;

      return {
        _id: team._id,
        city_id: parseInt(team.city_id),
        name: team.name,
        slug: team.slug,
        previous_team_id: team.previous_team_id || undefined,
        inconsistent_rank: team.inconsistent_rank === 'true',
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw new StorageError('Failed to find team by slug', error);
    }
  }
}
