import { getActiveBar, withoutProgressBar } from './progress';
import fs from 'fs';
import path from 'path';

const LOG_LEVEL = (process.env.LOG_LEVEL || 'INFO').toUpperCase();

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
} as const;

type LogLevel = keyof typeof LOG_LEVELS;

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// Create a log file for this session
const now = new Date();
const logFileName = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}.log`;
const logFile = fs.createWriteStream(path.join(logsDir, logFileName), { flags: 'a' });

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] <= LOG_LEVELS[LOG_LEVEL as LogLevel];
}

function getTimestamp() {
  return new Date().toLocaleString('en-GB');
}

function log(level: string, color: string, ...args: unknown[]) {
  const timestamp = getTimestamp();
  const message = `[${timestamp}] [${level}] ${args.join(' ')}`;
  
  // Write to console with color
  process.stdout.write(`[${timestamp}] \x1b[${color}m[${level}]\x1b[0m ${args.join(' ')}\n`);
  
  // Write to file without color
  logFile.write(message + '\n');
}

export const logger = {
  error(...args: unknown[]) {
    if (shouldLog('ERROR')) {
      withoutProgressBar(() => log('ERROR', '31', ...args));
    }
  },

  warn(...args: unknown[]) {
    if (shouldLog('WARN')) {
      withoutProgressBar(() => log('WARN', '33', ...args));
    }
  },

  info(...args: unknown[]) {
    if (shouldLog('INFO')) {
      withoutProgressBar(() => log('INFO', '36', ...args));
    }
  },

  debug(...args: unknown[]) {
    if (shouldLog('DEBUG')) {
      withoutProgressBar(() => log('DEBUG', '90', ...args));
    }
  },
};
