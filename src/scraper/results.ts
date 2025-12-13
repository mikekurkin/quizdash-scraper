import axios from "axios";
import { load } from "cheerio";
import https from "https";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import type { Storage } from "../storage/interface";
import type { City, GameResult, RankMapping, Team } from "../types";
import { columnMatchers } from "../utils/columnMatcher";
import { logger } from "../utils/logger";
import { normalizeText } from "../utils/normalize";
import { generateUniqueTeamSlug } from "../utils/slug";
import { buildGameResultsApiUrl } from "../urls";

const GameResultSchema = z.object({
  _id: z.string().uuid(),
  game_id: z.string(),
  team_id: z.string().uuid(),
  rounds: z.array(z.number()),
  sum: z.number(),
  place: z.number().int().min(0),
  rank_id: z.string().uuid().optional(),
  has_errors: z.boolean(),
});

interface ColumnIndexes {
  team: number;
  rounds: number[];
  total: number;
  place?: number;
  rank?: number;
  team_city?: number;
}

function findColumnIndexes(
  $: cheerio.Root,
  headerRow: cheerio.Cheerio
): ColumnIndexes {
  const indexes: Partial<ColumnIndexes> = {
    rounds: [],
  };

  $(headerRow)
    .find("td")
    .each((colIndex, cell) => {
      const cellText = $(cell).text().trim().toLowerCase();

      if (columnMatchers.team.findColumn(cellText)) {
        indexes.team = colIndex;
      } else if (columnMatchers.round.findColumn(cellText)) {
        indexes.rounds!.push(colIndex);
      } else if (columnMatchers.total.findColumn(cellText)) {
        indexes.total = colIndex;
      } else if (columnMatchers.place.findColumn(cellText)) {
        indexes.place = colIndex;
      } else if (columnMatchers.team_city.findColumn(cellText)) {
        indexes.team_city = colIndex;
      } else if (columnMatchers.rank.findColumn(cellText)) {
        indexes.rank = colIndex;
      }
    });

  if (
    indexes.place === undefined &&
    $(headerRow).find("td").first().text() === ""
  ) {
    indexes.place = 0;
  }

  if (indexes.team === undefined) {
    throw new Error("Team name column not found");
  }
  if (!indexes.rounds?.length) {
    throw new Error("No round columns found");
  }
  if (indexes.total === undefined) {
    throw new Error("Total score column not found");
  }

  return indexes as ColumnIndexes;
}

export async function scrapeResults(
  gameId: string,
  city: City,
  rankMappings: RankMapping[],
  storage: Storage
): Promise<GameResult[]> {
  logger.info(`Processing game ${gameId} in ${city.name}`);

  try {
    const response = await axios.get(buildGameResultsApiUrl(gameId));
    const results: GameResult[] = [];
    const teamsToUpdate: Team[] = [];

    const responseResults = response.data.data.results;
    if (!Array.isArray(responseResults)) {
      logger.info(`No results found for game ${gameId}`);
      return results;
    }

    for (const result of responseResults) {
      const teamName = result.team.title;
      const teamQpId = result.team.id;

      let rank_id: string | undefined;
      const rankMapping = rankMappings.find(
        (r) => r.name === result.rank?.title
      );
      rank_id = rankMapping?._id;

      // Find or create team
      // const team_city = (await storage.findCityByName(teamCity)) ?? city; // TODO: implement finding team city for streams, not in api yet
      const team_city = city;
      let team = await storage.findTeamByQpId(teamQpId);
      if (!team) {
        team = await storage.findTeamByNameAndCity(teamName, team_city._id);
        if (team) {
          team.qp_id = teamQpId;
          teamsToUpdate.push(team);
        }
      }

      if (!team) {
        team = {
          _id: uuidv4(),
          qp_id: teamQpId,
          city_id: team_city._id,
          name: normalizeText(teamName),
          slug: await generateUniqueTeamSlug(teamName, team_city._id, storage),
          inconsistent_rank: !!rank_id,
        };

        await storage.saveTeam(team);
      }

      const rounds: number[] = Object.values<string>(result.rounds).map(
        (round: string) => parseFloat(round) || 0
      );

      const calculatedSum = rounds.reduce((a, b) => a + b, 0);
      const apiSum = parseFloat(result.total) || 0;
      const apiPlace = parseInt(result.place) || 0;

      const parsedResult = GameResultSchema.parse({
        _id: uuidv4(),
        game_id: gameId,
        team_id: team._id,
        rounds,
        sum: apiSum,
        place: apiPlace,
        rank_id,
        has_errors: Math.abs(calculatedSum - apiSum) > 0.01,
      });

      results.push(parsedResult);
    }

    await storage.updateTeams(teamsToUpdate);
    logger.info(`Game ${gameId} processing completed`);

    if (results.some((r) => r.has_errors)) {
      logger.warn(`Found results with calculation errors in game ${gameId}`);
    }

    return results;
  } catch (error) {
    logger.error(`Failed to scrape results for game ${gameId}:`, error);
    return [];
  }
}
