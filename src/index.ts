import { CronExpressionParser } from "cron-parser";
import cron from "node-cron";
import { config, createStorage } from "./config";
import { Storage } from "./storage/interface";
import { logger } from "./utils/logger";
import { createProgressBar } from "./utils/progress";
import { availableStrategies, createScraper } from "./scraper/scraper";
import { Game, GameResult } from "./types";

let storage: Storage;
let isShuttingDown = false;

async function cleanup() {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info("Shutting down gracefully...");

  if (config.storage.type === "github") {
    try {
      const date = new Date().toISOString().split("T")[0];
      const message =
        `feat: Update quiz results [${date}]\n\n` +
        `- Ensure all changes are synchronized`;

      await storage.syncChanges(message);
      logger.info("Successfully synced changes");
    } catch (error) {
      logger.error("Failed to sync changes during shutdown:", error);
    }
  }

  process.exit(0);
}

async function main() {
  try {
    // Initialize storage if not already initialized
    if (!storage) {
      logger.info("Initializing storage...");
      storage = await createStorage();
    }

    const cities = await storage.getCities()
    cities.forEach((city) => {
      const strategy = city.params?.scrape?.strategy
      if ( strategy && !availableStrategies.includes(strategy) ) {
        if (config.cityIds.includes(city._id)) {
          config.cityIds = config.cityIds.filter(id => id !== city._id)
          logger.error(`Strategy ${strategy} for city ${city.name} is not implemented, it will be skipped.`)
        } else {
          logger.warn(`Strategy ${strategy} for city ${city.name} is not implemented.`)
        }
      }
    })

    // Process new games
    const newGames = await processNewGames();
    // return

    // Process results
    const processedResults = await processPendingResults();

    if (
      config.storage.type === "github" &&
      (newGames.length || processedResults.length)
    ) {
      try {
        const date = new Date().toISOString().split("T")[0];
        const message =
          `feat: Update quiz results [${date}]\n\n` +
          `- Add ${newGames.length} newly scraped games\n` +
          `- Process ${processedResults?.length || 0} new results\n`;

        await storage.syncChanges(message);
        logger.info("Successfully synced all changes");
      } catch (error) {
        logger.error("Failed to sync changes:", error);
      }
    }

    return true; // Indicate successful run
  } catch (error) {
    logger.error("Failed to run main process:", error);
    return false; // Indicate failed run
  }
}

async function processNewGames() {
  try {
    const cities = await storage.getCitiesByIds(config.cityIds);
    const rankMappings = await storage.getRankMappings();
    logger.info(`Processing ${cities.length} cities`);

    const games: Game[] = []

    for (let city of cities) {
      try {
        const scraper = createScraper(city, storage, rankMappings)
        logger.info(`Scraping new games in ${city.name} using ${scraper.strategy} strategy`);

        const cityGames = await scraper.scrapeGames();

        if (cityGames.length) {
          games.push(...cityGames)

          await storage.saveGames(cityGames);
          logger.info(`Found ${cityGames.length} new games`);

          // Update last game ID
          const lastGameId = cityGames.at(-1)?._id;
          if (lastGameId)
            await storage.updateCityLastGameId(city._id, lastGameId);
        }
      } catch (e) {
        logger.error(`Failed to process games for city ${city.name}`, e);
        continue
      }
    }
    return games
  } catch (error) {
    logger.error("Failed to process new games:", error);
    return [];
  }
}

async function processPendingResults() {
  try {
    const [allPendingGames, cities, rankMappings] = await Promise.all([
      storage.getGamesWithoutResults(),
      storage.getCitiesByIds(config.cityIds),
      storage.getRankMappings(),
    ]);


    if (!allPendingGames.length) {
      logger.info("No pending games to process");
      return [];
    }

    const progress = createProgressBar(
      allPendingGames.length,
      "Processing pending results"
    );

    const results: GameResult[] = []

    for (let city of cities) {
      const cityGames = allPendingGames.filter(game => game.city_id == city._id);
      const scraper = createScraper(city, storage, rankMappings)

      logger.info(`Scraping game results for city ${city.name} using ${scraper.strategy} strategy`)

      for (let game of cityGames) {
        // Ignore old games
        if (city.params?.scrape?.since && game.date < city.params?.scrape?.since) {
          // logger.info(`Game ${game._id} is old, skipping`);
          progress.increment(`Skipped game ${game._id} (old)`);
          // await storage.markGameAsProcessed(game._id);
          continue;
        }

        // Ignore streams for now
        if (game.is_stream) {
          logger.info(`Game ${game._id} is stream, skipping`);
          progress.increment(`Skipped game ${game._id} (stream)`);
          await storage.markGameAsProcessed(game._id);
          continue;
        }

        try {
          const gameResults = await scraper.scrapeResults(game);
          if (gameResults.length) {
            await storage.saveResults(gameResults);
            await storage.markGameAsProcessed(game._id);
            progress.increment(`Processed game ${game._id}`);
            results.push(...gameResults);
          } else {
            progress.increment(`No results for game ${game._id}`);
          }
        } catch (e) {
          logger.error(`Error scraping results for ${game._id} using ${scraper.strategy} strategy`, e)
          progress.increment(`Scraping error ${game._id}`);
          continue;
        }
      }
    }
    progress.finish();
    return results;
  } catch (error) {
    logger.error("Failed to process pending results:", error);
    return []
  }
}

const runMain = async () => {
  try {
    const success = await main();
    if (success) {
      logger.info("Completed successfully");
      if (config.cronSchedule) {
        if (cron.getTasks().size == 0) {
          logger.info(`Scheduling regular runs: ${config.cronSchedule}`);
          cron.schedule(config.cronSchedule, async () => {
            try {
              await runMain();
            } catch (error) {
              logger.error("Failed to run scheduled task:", error);
            }
          });
        }
        try {
          const expr = CronExpressionParser.parse(config.cronSchedule);
          const nextRun = expr.next().toDate();
          logger.info(`Next scheduled run: ${nextRun.toLocaleString("en-GB")}`);
        } catch (err) {
          logger.error("Failed to calculate next scheduled run time:", err);
        }
      } else {
        logger.info("No schedule is set, shutting down");
        process.exit(0);
      }
    } else {
      logger.error("Main process failed");
      process.exit(1);
    }
  } catch (error) {
    logger.error("Failed to run main process:", error);
    process.exit(1);
  }
};

// Run immediately on start
runMain();

// Handle graceful shutdown
process.on("SIGINT", async () => {
  try {
    await cleanup();
    process.exit(0);
  } catch (error) {
    logger.error("Error during cleanup:", error);
    process.exit(1);
  }
});

process.on("SIGTERM", async () => {
  try {
    await cleanup();
    process.exit(0);
  } catch (error) {
    logger.error("Error during cleanup:", error);
    process.exit(1);
  }
});
