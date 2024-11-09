import cron from 'node-cron';
import { config } from './config';
import { scrapeGames } from './scraper/games';
import { scrapeResults } from './scraper/results';
import { CsvStorage } from './storage/csv';
import { logger } from './utils/logger';

if (config.storage.type !== 'csv') throw new Error('Storage not implemented');
const storage = new CsvStorage();

async function processNewGames() {
  try {
    const cities = await storage.getCitiesByIds(config.cityIds);
    logger.info(`Processing ${cities.length} cities`);

    const games = await scrapeGames(cities, storage);
    if (games.length) {
      await storage.saveGames([...games.reverse()]);
      logger.info(`Found ${games.length} new games`);

      // Update last game ID for each city
      for (const city of cities) {
        const cityGames = games.filter(game => game.city_id === city._id);
        if (cityGames.length) {
          const lastGameId = cityGames.at(0)?._id;
          if (lastGameId) await storage.updateCityLastGameId(city._id, lastGameId);
        }
      }
    }

    return [...games.reverse()];
  } catch (error) {
    logger.error('Failed to process new games:', error);
    return [];
  }
}

async function processPendingResults() {
  try {
    const [pendingGames, cities, rankMappings] = await Promise.all([
      storage.getGamesWithoutResults(),
      storage.getCities(),
      storage.getRankMappings(),
    ]);

    logger.info(`Found ${pendingGames.length} games pending results`);

    for (const game of pendingGames) {
      try {
        const city = cities.find(c => c._id === game.city_id);
        if (!city) {
          logger.error(`City not found for game ${game._id}`);
          continue;
        }

        const results = await scrapeResults(game._id, city, rankMappings, storage);
        if (results.length) {
          await storage.saveResults(results);
          await storage.markGameAsProcessed(game._id);
          logger.info(`Processed results for game ${game._id}`);
        }
      } catch (error) {
        logger.error(`Failed to process results for game ${game._id}:`, error);
      }
    }
  } catch (error) {
    logger.error('Failed to process pending results:', error);
  }
}

async function main() {
  try {
    logger.info('Starting quiz scraper...');

    // Process games that were pending results
    await processPendingResults();

    // Process new games
    const newGames = await processNewGames();

    // Try to get results for new games
    const [cities, rankMappings] = await Promise.all([storage.getCities(), storage.getRankMappings()]);

    for (const game of newGames) {
      try {
        const city = cities.find(c => c._id === game.city_id);
        if (!city) {
          logger.error(`City not found for game ${game._id}`);
          continue;
        }

        const results = await scrapeResults(game._id, city, rankMappings, storage);
        if (results.length) {
          await storage.saveResults(results);
          await storage.markGameAsProcessed(game._id);
        }
      } catch (error) {
        logger.error(`Failed to fetch results for game ${game._id}:`, error);
      }
    }
  } catch (error) {
    logger.error('Scraper failed:', error);
  }
  logger.info('Finished processing, waiting for the next scheduled run...');
}

// Run immediately on start
main();

// Schedule regular runs
cron.schedule(config.cronSchedule, main);
