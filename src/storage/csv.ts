import { parse } from "csv-parse/sync";
import { createObjectCsvWriter } from "csv-writer";
import fs from "fs/promises";
import path from "path";
import { config } from "../config";
import type {
  City,
  Game,
  GameResult,
  RankMapping,
  Series,
  Team,
} from "../types";
import { logger } from "../utils/logger";
import { normalizeText } from "../utils/normalize";
import type { Storage } from "./interface";
import { StorageError } from "./interface";

type TeamCacheKey = string;
type TeamCache = {
  key: Map<TeamCacheKey, Team>;
  qp_id: Map<TeamCacheKey, Team>;
};

export class CsvStorage implements Storage {
  protected readonly gamesFile: string;
  protected readonly resultsFile: string;
  protected readonly citiesFile: string;
  protected readonly ranksFile: string;
  protected readonly teamsFile: string;
  protected readonly seriesFile: string;

  private teamCache: TeamCache | null = null;

  constructor(
    gamesFile = path.join(config.storage.path, "games.csv"),
    resultsFile = path.join(config.storage.path, "results.csv"),
    citiesFile = path.join(config.storage.path, "cities.csv"),
    ranksFile = path.join(config.storage.path, "ranks.csv"),
    teamsFile = path.join(config.storage.path, "teams.csv"),
    seriesFile = path.join(config.storage.path, "series.csv")
  ) {
    this.gamesFile = gamesFile;
    this.resultsFile = resultsFile;
    this.citiesFile = citiesFile;
    this.ranksFile = ranksFile;
    this.teamsFile = teamsFile;
    this.seriesFile = seriesFile;
  }

  private getCacheKey(name: string, cityId: number): TeamCacheKey {
    return `${normalizeText(name).toLowerCase()}_${cityId}`;
  }

  private async loadTeamCache(): Promise<TeamCache> {
    if (this.teamCache) {
      return this.teamCache;
    }

    logger.info("Loading teams into memory cache...");
    const startTime = performance.now();

    try {
      const content = await fs.readFile(this.teamsFile, "utf-8");
      const records = parse(content, {
        columns: true,
        skip_empty_lines: true,
      });

      this.teamCache = { key: new Map(), qp_id: new Map() };

      for (const record of records) {
        const team: Team = {
          _id: record._id,
          qp_id: record.qp_id === "" ? undefined : record.qp_id,
          city_id: parseInt(record.city_id),
          name: record.name,
          slug: record.slug,
          previous_team_id: record.previous_team_id || undefined,
          inconsistent_rank: record.inconsistent_rank === "true",
        };
        const key = this.getCacheKey(team.name, team.city_id);
        this.teamCache.key.set(key, team);
        if (team.qp_id !== undefined)
          this.teamCache.qp_id.set(team.qp_id, team);
      }

      const loadTime = performance.now() - startTime;
      logger.info(`Teams cache loaded in ${loadTime.toFixed(2)}ms`);

      return this.teamCache;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        this.teamCache = { key: new Map(), qp_id: new Map() };
        return this.teamCache;
      }
      throw new StorageError("Failed to load team cache", error);
    }
  }

  async findCityByName(name: string): Promise<City | null> {
    try {
      const content = await fs.readFile(this.citiesFile, "utf-8");
      const records = parse(content, {
        columns: true,
        skip_empty_lines: true,
      });

      const normalizedName = normalizeText(name).toLowerCase();
      const city = records.find(
        (record: any) =>
          normalizeText(record.name).toLowerCase() === normalizedName
      );

      if (!city) return null;

      return {
        _id: parseInt(city._id),
        name: city.name,
        slug: city.slug,
        timezone: city.timezone,
        last_game_id: city.last_game_id
          ? parseInt(city.last_game_id)
          : undefined,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw new StorageError("Failed to find city", error);
    }
  }

  async getCities(): Promise<City[]> {
    try {
      const content = await fs.readFile(this.citiesFile, "utf-8");
      const records = parse(content, {
        columns: true,
        skip_empty_lines: true,
      });

      return records.map((record: any) => ({
        _id: parseInt(record._id),
        name: record.name,
        slug: record.slug,
        timezone: record.timezone,
        latitude: record.latitude,
        longitude: record.longitude,
        last_game_id: record.last_game_id,
      }));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw new StorageError("Failed to get cities", error);
    }
  }

  async getCitiesByIds(ids: number[]): Promise<City[]> {
    const allCities = await this.getCities();
    return allCities.filter((city) => ids.includes(city._id));
  }

  async updateCityLastGameId(
    cityId: number,
    lastGameId: string
  ): Promise<void> {
    try {
      const cities = await this.getCities();
      const updatedCities = cities.map((city) => ({
        ...city,
        last_game_id: city._id === cityId ? lastGameId : city.last_game_id,
      }));

      const csvWriter = createObjectCsvWriter({
        path: this.citiesFile,
        header: [
          "_id",
          "name",
          "slug",
          "timezone",
          "latitude",
          "longitude",
          "last_game_id",
        ].map((key) => ({
          id: key,
          title: key,
        })),
      });

      await csvWriter.writeRecords(updatedCities);
    } catch (error) {
      throw new StorageError(
        `Failed to update last game ID for city ${cityId}`,
        error
      );
    }
  }

  async findSeriesByName(name: string): Promise<Series | null> {
    try {
      const content = await fs.readFile(this.seriesFile, "utf-8");
      const records = parse(content, {
        columns: true,
        skip_empty_lines: true,
      });

      const normalizedName = normalizeText(name).toLowerCase();
      const series = records.find(
        (record: any) =>
          normalizeText(record.name).toLowerCase() === normalizedName
      );

      if (!series) return null;

      return {
        _id: series._id,
        name: series.name,
        slug: series.slug,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      logger.info(JSON.stringify(error, null, 2));
      throw new StorageError("Failed to find series", error);
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
        header: Object.keys(series).map((key) => ({
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
      const content = await fs.readFile(this.ranksFile, "utf-8");
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
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw new StorageError("Failed to get rank mappings", error);
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
        header: Object.keys({ ...games[0], processed: false }).map((key) => ({
          id: key,
          title: key,
        })),
      });

      const gamesWithProcessedFlag = games.map((game) => ({
        ...game,
        processed: false,
      }));

      await csvWriter.writeRecords(gamesWithProcessedFlag);
      logger.debug(`Saved ${games.length} games to ${this.gamesFile}`);
    } catch (error) {
      throw new StorageError(
        `Failed to save games to ${this.gamesFile}`,
        error
      );
    }
  }

  async getLastGameId(): Promise<number | null> {
    try {
      const content = await fs.readFile(this.gamesFile, "utf-8");
      const records = parse(content, {
        columns: true,
        skip_empty_lines: true,
      });

      if (!records.length) return null;

      return parseInt(records[records.length - 1]._id);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw new StorageError("Failed to get last game ID", error);
    }
  }

  async getGamesWithoutResults(): Promise<Game[]> {
    try {
      const content = await fs.readFile(this.gamesFile, "utf-8");
      const records = parse(content, {
        columns: true,
        skip_empty_lines: true,
      });

      return (
        records
          // .slice(11875)
          .filter((record: any) => record.processed !== "true")
          .map((record: any) => ({
            ...record,
            // _id: parseInt(record._id),
            city_id: parseInt(record.city_id),
            price: parseFloat(record.price),
            date: new Date(record.date),
            is_stream: record.is_stream === "true",
            processed: record.processed === "true",
          }))
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw new StorageError("Failed to get games without results", error);
    }
  }

  async markGameAsProcessed(gameId: string): Promise<void> {
    try {
      const content = await fs.readFile(this.gamesFile, "utf-8");
      const records = parse(content, {
        columns: true,
        skip_empty_lines: true,
      });

      const updatedRecords = records.map((record: any) => ({
        ...record,
        processed: record._id === gameId.toString() ? "true" : record.processed,
      }));

      const csvWriter = createObjectCsvWriter({
        path: this.gamesFile,
        header: Object.keys(updatedRecords[0]).map((key) => ({
          id: key,
          title: key,
        })),
      });

      await csvWriter.writeRecords(updatedRecords);
    } catch (error) {
      throw new StorageError(
        `Failed to mark game ${gameId} as processed`,
        error
      );
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
        header: Object.keys(results[0]).map((key) => ({
          id: key,
          title: key,
        })),
      });

      await csvWriter.writeRecords(results);
      logger.debug(`Saved ${results.length} results to ${this.resultsFile}`);
    } catch (error) {
      throw new StorageError(
        `Failed to save results to ${this.resultsFile}`,
        error
      );
    }
  }

  async hasResultsForGame(gameId: number): Promise<boolean> {
    try {
      const content = await fs.readFile(this.resultsFile, "utf-8");
      const records = parse(content, {
        columns: true,
        skip_empty_lines: true,
      });

      return records.some((record: any) => parseInt(record.game_id) === gameId);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return false;
      }
      throw new StorageError(
        `Failed to check results for game ${gameId}`,
        error
      );
    }
  }

  async findTeamByNameAndCity(
    name: string,
    cityId: number
  ): Promise<Team | null> {
    const startTime = performance.now();
    try {
      const cache = (await this.loadTeamCache()).key;
      const key = this.getCacheKey(name, cityId);
      const team = cache.get(key) || null;

      const lookupTime = performance.now() - startTime;
      logger.debug(`Team lookup took ${lookupTime.toFixed(2)}ms`);

      return team;
    } catch (error) {
      throw new StorageError("Failed to find team", error);
    }
  }

  async findTeamByQpId(qpId: string): Promise<Team | null> {
    const startTime = performance.now();
    try {
      const cache = (await this.loadTeamCache()).qp_id;
      const team = cache.get(qpId) || null;

      return team;
    } catch (error) {
      throw new StorageError("Failed to find team", error);
    }
  }

  async saveTeam(team: Team): Promise<void> {
    try {
      // Update cache first
      if (this.teamCache) {
        const key = this.getCacheKey(team.name, team.city_id);
        this.teamCache.key.set(key, team);
        if (team.qp_id !== undefined)
          this.teamCache.qp_id.set(team.qp_id, team);
      }

      // Then update file
      const content = await fs.readFile(this.teamsFile, "utf-8");
      const records = parse(content, {
        columns: true,
        skip_empty_lines: true,
      });

      records.push({
        _id: team._id,
        qp_id: team.qp_id,
        city_id: team.city_id,
        name: team.name,
        slug: team.slug,
        previous_team_id: team.previous_team_id || "",
        inconsistent_rank: team.inconsistent_rank,
      });

      const csvWriter = createObjectCsvWriter({
        path: this.teamsFile,
        header: [
          "_id",
          "qp_id",
          "city_id",
          "name",
          "slug",
          "previous_team_id",
          "inconsistent_rank",
        ].map((key) => ({
          id: key,
          title: key,
        })),
      });

      await csvWriter.writeRecords(records);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw new StorageError("Failed to save team", error);
      }

      // File doesn't exist, create it
      const csvWriter = createObjectCsvWriter({
        path: this.teamsFile,
        header: [
          "_id",
          "qp_id",
          "city_id",
          "name",
          "slug",
          "previous_team_id",
          "inconsistent_rank",
        ].map((key) => ({
          id: key,
          title: key,
        })),
      });

      await csvWriter.writeRecords([
        {
          _id: team._id,
          city_id: team.city_id,
          name: team.name,
          slug: team.slug,
          previous_team_id: team.previous_team_id || "",
          inconsistent_rank: team.inconsistent_rank,
        },
      ]);
    }
  }

  async updateTeams(teams: Team[]): Promise<void> {
    try {
      // Update in-memory cache first
      const cache = await this.loadTeamCache();
      teams.forEach((team) => {
        cache.key.set(team._id, team);
        if (team.qp_id) {
          cache.qp_id.set(team.qp_id, team);
        }
      });

      // Update on-disk CSV
      const idsToUpdate = teams.map((team) => team._id);
      const content = await fs.readFile(this.teamsFile, "utf-8");
      const records = parse(content, {
        columns: true,
        skip_empty_lines: true,
      }) as any[];

      const updatedRecords = records.map((record: any) => {
        const wasUpdated = idsToUpdate.includes(record._id);
        return {
          _id: record._id,
          qp_id: wasUpdated ? cache.key.get(record._id)?.qp_id : record.qp_id,
          city_id: wasUpdated
            ? cache.key.get(record._id)?.city_id
            : record.city_id,
          name: wasUpdated ? cache.key.get(record._id)?.name : record.name,
          slug: wasUpdated ? cache.key.get(record._id)?.slug : record.slug,
          previous_team_id: wasUpdated
            ? cache.key.get(record._id)?.previous_team_id
            : record.previous_team_id ?? "",
          inconsistent_rank: wasUpdated
            ? cache.key.get(record._id)?.inconsistent_rank
            : record.inconsistent_rank,
        };
      });

      const csvWriter = createObjectCsvWriter({
        path: this.teamsFile,
        header: [
          "_id",
          "qp_id",
          "city_id",
          "name",
          "slug",
          "previous_team_id",
          "inconsistent_rank",
        ].map((key) => ({
          id: key,
          title: key,
        })),
      });

      await csvWriter.writeRecords(updatedRecords);
    } catch (error) {
      throw new StorageError("Failed to update team qp_id", error);
    }
  }

  async findTeamBySlugAndCity(
    slug: string,
    cityId: number
  ): Promise<Team | null> {
    try {
      const content = await fs.readFile(this.teamsFile, "utf-8");
      const records = parse(content, {
        columns: true,
        skip_empty_lines: true,
      });

      const team = records.find(
        (record: any) =>
          record.slug === slug && parseInt(record.city_id) === cityId
      );

      if (!team) return null;

      return {
        _id: team._id,
        qp_id: team.qp_id,
        city_id: parseInt(team.city_id),
        name: team.name,
        slug: team.slug,
        previous_team_id: team.previous_team_id || undefined,
        inconsistent_rank: team.inconsistent_rank === "true",
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw new StorageError("Failed to find team by slug", error);
    }
  }

  async initialize(): Promise<void> {
    // Create storage directory if it doesn't exist
    await fs.mkdir(config.storage.path, { recursive: true });
    logger.info(`Initialized CSV storage in ${config.storage.path}`);
  }

  async syncChanges(_message?: string): Promise<void> {
    // CSV storage is synchronous, no need to sync changes
    return;
  }
}
