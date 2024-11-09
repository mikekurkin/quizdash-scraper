import axios from 'axios';
import { parse } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';
import https from 'https';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import type { Storage } from '../storage/interface';
import type { City, Game } from '../types';
import { buildGamesApiUrl } from '../urls';
import { logger } from '../utils/logger';
import { normalizeText } from '../utils/normalize';
import { generateSlug } from '../utils/slug';

const GameSchema = z.object({
  id: z.number(),
  city_id: z.number(),
  title: z.string(),
  name: z.string(),
  datetime: z.string(),
  price: z.number(),
  place: z.string(),
  address: z.string().nullish(),
  is_stream: z.boolean(),
});

export async function scrapeGames(cities: City[], storage: Storage): Promise<Game[]> {
  const games: Game[] = [];

  for (const city of cities) {
    let page = 1;
    let hasMore = true;
    let shouldStop = false;

    logger.info(`Processing games for ${city.name} (ID: ${city._id})`);

    while (hasMore && !shouldStop) {
      logger.info(`Processing page ${page}`);

      try {
        const response = await axios.get(buildGamesApiUrl(), {
          params: {
            status: 6,
            city_id: city._id,
            page,
          },
        });

        for (const gameData of response.data.data.data) {
          const localDate = parse(gameData.datetime, 'dd.MM.yy HH:mm', new Date());
          const utcDate = fromZonedTime(localDate, city.timezone);

          // Find or create series
          let series = await storage.findSeriesByName(gameData.title);
          if (!series) {
            series = {
              _id: uuidv4(),
              name: normalizeText(gameData.title),
              slug: generateSlug(gameData.title),
            };
            await storage.saveSeries(series);
          }

          const game = {
            _id: gameData.id,
            city_id: city._id,
            series_id: series._id,
            number: gameData.name.replace(/^#(\d+)$/, '$1'),
            date: utcDate,
            price: gameData.price,
            location: gameData.place,
            address: gameData.game_type === 1 ? null : gameData.address,
            is_stream: gameData.game_type === 1,
          };

          // Check if we've reached the last page
          const isDuplicate = games.some(existingGame => existingGame._id === game._id);

          if (isDuplicate) {
            hasMore = false;
            logger.info(`Reached the end at page ${page - 1}`);
            shouldStop = true;
            break;
          }

          // Stop if we encounter a game we've already processed previously
          if (city.last_game_id && game._id === city.last_game_id) {
            logger.info(`Reached previously saved game ${city.last_game_id}`);
            shouldStop = true;
            break;
          }

          try {
            GameSchema.parse({
              id: game._id,
              city_id: game.city_id,
              title: gameData.title,
              name: game.number,
              datetime: game.date.toISOString(),
              price: game.price,
              place: game.location,
              address: game.address,
              is_stream: game.is_stream,
            });
            games.push(game);
          } catch (error) {
            logger.warn(`Invalid game data for ID ${game._id}:`, error);
          }
        }

        hasMore = response.data.data.count > 0 && !shouldStop;
        page++;
      } catch (error) {
        logger.error(`Failed to fetch games for city ${city.name}, page ${page}:`, error);
        hasMore = false;
      }
    }
  }

  return games;
}
