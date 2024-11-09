type LogLevel = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';

const logLevels: Record<LogLevel, number> = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
};

const currentLevel = logLevels[(process.env.LOG_LEVEL as LogLevel) || 'INFO'];

const getTimestamp = () => {
  const now = new Date();
  return `${now.toLocaleString('en-GB')}`;
};

export const logger = {
  error: (message: string, error?: unknown) => {
    if (currentLevel >= logLevels.ERROR) {
      console.error(`[${getTimestamp()}] [ERROR] ${message}`, error);
    }
  },

  warn: (message: string, data?: unknown) => {
    if (currentLevel >= logLevels.WARN) {
      console.warn(`[${getTimestamp()}] [WARN] ${message}`, data);
    }
  },

  info: (message: string) => {
    if (currentLevel >= logLevels.INFO) {
      console.info(`[${getTimestamp()}] [INFO] ${message}`);
    }
  },

  debug: (message: string, data?: unknown) => {
    if (currentLevel >= logLevels.DEBUG) {
      console.debug(`[${getTimestamp()}] [DEBUG] ${message}`, data);
    }
  },
};
