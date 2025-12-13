import "dotenv/config";
import { z } from "zod";
import { CsvStorage } from "./storage/csv";
import { GitHubStorage } from "./storage/github";
import { Storage } from "./storage/interface";
import { logger } from "./utils/logger";

const ConfigSchema = z.object({
  cronSchedule: z
    .string()
    .regex(
      /^(\*|([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])) (\*|([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])) (\*|([0-9]|1[0-9]|2[0-3])) (\*|([1-9]|1[0-9]|2[0-9]|3[0-1])) (\*|([1-9]|1[0-2]))$/
    )
    .optional(),
  cityIds: z.array(z.number().positive()).default([11]),
  storage: z.object({
    type: z.enum(["csv", "github"]),
    path: z.string(),
    github: z
      .object({
        token: z.string().optional(),
        owner: z.string().optional(),
        repo: z.string().optional(),
        branch: z.string().optional(),
      })
      .optional(),
  }),
  logLevel: z.enum(["ERROR", "WARN", "INFO", "DEBUG"]).default("INFO"),
});

export type Config = z.infer<typeof ConfigSchema>;

export const config = ConfigSchema.parse({
  cronSchedule: process.env.CRON_SCHEDULE,
  cityIds: process.env.CITY_IDS?.split(",").map(Number),
  logLevel: process.env.LOG_LEVEL,
  storage: {
    type: (process.env.STORAGE_TYPE as Config["storage"]["type"]) || "csv",
    path: process.env.STORAGE_PATH || "data",
    github:
      process.env.STORAGE_TYPE === "github"
        ? {
            token: process.env.GITHUB_TOKEN,
            owner: process.env.GITHUB_OWNER,
            repo: process.env.GITHUB_REPO,
            branch: process.env.GITHUB_BRANCH,
          }
        : undefined,
  },
});

export async function createStorage(): Promise<Storage> {
  switch (config.storage.type) {
    case "csv":
      return new CsvStorage();
    case "github":
      const storage = new GitHubStorage();
      // Initialize synchronously
      await storage.initialize();
      return storage;
    default:
      throw new Error(`Unsupported storage type: ${config.storage.type}`);
  }
}
