import { z } from 'zod';
import { CsvStorage } from './storage/csv';
import { Storage } from './storage/interface';

const ConfigSchema = z.object({
  cronSchedule: z
    .string()
    .regex(
      /^(\*|([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])) (\*|([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])) (\*|([0-9]|1[0-9]|2[0-3])) (\*|([1-9]|1[0-9]|2[0-9]|3[0-1])) (\*|([1-9]|1[0-2]))$/
    )
    .default('2 3 * * *'),
  cityIds: z.array(z.number().positive()).default([17]),
  storage: z.object({
    type: z.enum(['csv', 'database']),
    path: z.string(),
  }),
  logLevel: z.enum(['ERROR', 'WARN', 'INFO', 'DEBUG']).default('INFO'),
});

export const config = ConfigSchema.parse({
  cronSchedule: process.env.CRON_SCHEDULE,
  cityIds: process.env.CITY_IDS?.split(',').map(Number),
  logLevel: process.env.LOG_LEVEL,
  storage: {
    type: 'csv',
    path: 'data',
  },
});
