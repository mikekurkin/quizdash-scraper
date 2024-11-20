import { CronExpressionParser } from 'cron-parser';
import cron from 'node-cron';
import { config, createStorage } from './config';
import { scrapeGames } from './scraper/games';
import { scrapeResults } from './scraper/results';
import { Storage } from './storage/interface';
import { logger } from './utils/logger';
import { createProgressBar } from './utils/progress';

let storage: Storage;
let isShuttingDown = false;

async function cleanup() {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info('Shutting down gracefully...');

  if (config.storage.type === 'github') {
    try {
      const date = new Date().toISOString().split('T')[0];
      const message = `feat: Update quiz results [${date}]\n\n` + `- Ensure all changes are synchronized`;

      await storage.syncChanges(message);
      logger.info('Successfully synced changes');
    } catch (error) {
      logger.error('Failed to sync changes during shutdown:', error);
    }
  }

  process.exit(0);
}

async function main() {
  try {
    // Initialize storage if not already initialized
    if (!storage) {
      logger.info('Initializing storage...');
      storage = await createStorage();
    }

    // Process new games
    const newGames = await processNewGames();

    // Process results
    const processedGames = await processPendingResults();

    if (config.storage.type === 'github' && (newGames.length || processedGames?.length)) {
      try {
        const date = new Date().toISOString().split('T')[0];
        const message =
          `feat: Update quiz results [${date}]\n\n` +
          `- Add ${newGames.length} newly scraped games\n` +
          `- Process results for ${processedGames?.length || 0} pending games\n`;

        await storage.syncChanges(message);
        logger.info('Successfully synced all changes');
      } catch (error) {
        logger.error('Failed to sync changes:', error);
      }
    }

    return true; // Indicate successful run
  } catch (error) {
    logger.error('Failed to run main process:', error);
    return false; // Indicate failed run
  }
}

async function processNewGames() {
  try {
    const cities = await storage.getCitiesByIds(config.cityIds);
    logger.info(`Processing ${cities.length} cities`);

    const games = await scrapeGames(cities, storage);
    if (games.length) {
      await storage.saveGames(games);
      logger.info(`Found ${games.length} new games`);

      const progress = createProgressBar(games.length, 'Processing new games');

      for (const game of games) {
        if (isShuttingDown) {
          logger.info('Shutdown signal received, stopping game processing');
          break;
        }

        try {
          const city = cities.find(c => c._id === game.city_id);
          if (!city) {
            progress.increment(`Skipped game ${game._id} (city not found)`);
            continue;
          }

          // Update last game ID for each city
          const cityGames = games.filter(game => game.city_id === city._id);
          if (cityGames.length) {
            const lastGameId = cityGames.at(-1)?._id;
            if (lastGameId) await storage.updateCityLastGameId(city._id, lastGameId);
          }
        } catch (error) {
          logger.error(`Failed to process game ${game._id}:`, error);
          progress.increment(`Failed game ${game._id}`);
        }
      }

      progress.finish();
    }

    return games;
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

    if (!pendingGames.length) {
      logger.info('No pending games to process');
      return;
    }

    const progress = createProgressBar(pendingGames.length, 'Processing pending results');

    for (const game of pendingGames) {
      if (isShuttingDown) {
        logger.info('Shutdown signal received, stopping result processing');
        break;
      }

      try {
        const city = cities.find(c => c._id === game.city_id);
        if (!city) {
          progress.increment(`Skipped game ${game._id} (city not found)`);
          continue;
        }

        const results = await scrapeResults(game._id, city, rankMappings, storage);
        if (results.length) {
          await storage.saveResults(results);
          await storage.markGameAsProcessed(game._id);
          progress.increment(`Processed game ${game._id}`);
        } else {
          progress.increment(`No results for game ${game._id}`);
        }
      } catch (error) {
        logger.error(`Failed to process game ${game._id}:`, error);
        progress.increment(`Failed game ${game._id}`);
      }
    }

    progress.finish();
    return pendingGames;
  } catch (error) {
    logger.error('Failed to process pending results:', error);
  }
}

const runMain = async () => {
  try {
    const success = await main();
    if (success) {
      logger.info('Completed successfully');
      if (config.cronSchedule) {
        if (cron.getTasks().size == 0) {
          logger.info(`Scheduling regular runs: ${config.cronSchedule}`);
          cron.schedule(config.cronSchedule, async () => {
            try {
              await runMain();
            } catch (error) {
              logger.error('Failed to run scheduled task:', error);
            }
          });
        }
        try {
          const expr = CronExpressionParser.parse(config.cronSchedule);
          const nextRun = expr.next().toDate();
          logger.info(`Next scheduled run: ${nextRun.toLocaleString('en-GB')}`);
        } catch (err) {
          logger.error('Failed to calculate next scheduled run time:', err);
        }
      } else {
        logger.info('No schedule is set, shutting down');
        process.exit(0);
      }
    } else {
      logger.error('Main process failed');
      process.exit(1);
    }
  } catch (error) {
    logger.error('Failed to run main process:', error);
    process.exit(1);
  }
};

// Run immediately on start
runMain();

// Handle graceful shutdown
process.on('SIGINT', async () => {
  try {
    await cleanup();
    process.exit(0);
  } catch (error) {
    logger.error('Error during cleanup:', error);
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  try {
    await cleanup();
    process.exit(0);
  } catch (error) {
    logger.error('Error during cleanup:', error);
    process.exit(1);
  }
});
