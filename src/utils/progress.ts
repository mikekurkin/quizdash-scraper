import cliProgress from 'cli-progress';
import { logger } from './logger';

// GitHub Actions (and other CI/piped contexts) are not TTYs. cli-progress
// relies on carriage returns and ANSI escapes to redraw the bar in place,
// which don't work there, producing concatenated bar lines. In that case we
// fall back to throttled plain-text progress lines instead.
const isInteractive = Boolean(process.stdout.isTTY);

export interface ProgressBar {
  increment(status?: string): void;
  finish(): void;
  updateStatus(status: string): void;
  readonly value: number;
}

let activeBar: cliProgress.SingleBar | null = null;

export function createProgressBar(total: number, description: string): ProgressBar {
  return isInteractive
    ? createInteractiveBar(total, description)
    : createPlainBar(total, description);
}

function createInteractiveBar(total: number, description: string): ProgressBar {
  const bar = new cliProgress.SingleBar({
    format: `${description} |{bar}| {percentage}% | {value}/{total} games | {status}`,
    barCompleteChar: '█',
    barIncompleteChar: '░',
    hideCursor: true,
    clearOnComplete: false,
    stopOnComplete: true,
    linewrap: false,
    etaBuffer: 100,
    fps: 10,
    synchronousUpdate: true,
    forceRedraw: true
  });

  activeBar = bar;
  bar.start(total, 0, { status: 'Starting...' });

  let currentValue = 0;

  return {
    increment(status = '') {
      if (activeBar === bar) {
        currentValue++;
        bar.increment(1, { status });
      }
    },
    finish() {
      if (activeBar === bar) {
        bar.update(total, { status: 'Complete' });
        bar.stop();
        activeBar = null;
        process.stdout.write('\n');
      }
    },
    updateStatus(status: string) {
      if (activeBar === bar) {
        bar.update(currentValue, { status });
      }
    },
    get value() {
      return currentValue;
    }
  };
}

function createPlainBar(total: number, description: string): ProgressBar {
  let currentValue = 0;
  let lastLoggedPercent = -1;

  const percent = () => (total > 0 ? Math.floor((currentValue / total) * 100) : 100);

  // Emit a progress line at most once per 10% step (plus on completion) so CI
  // logs stay readable rather than one line per game.
  const maybeLog = (status: string, force = false) => {
    const pct = percent();
    if (force || pct >= lastLoggedPercent + 10) {
      lastLoggedPercent = pct - (pct % 10);
      const suffix = status ? ` | ${status}` : '';
      logger.info(`${description}: ${pct}% | ${currentValue}/${total} games${suffix}`);
    }
  };

  logger.info(`${description}: started | 0/${total} games`);

  return {
    increment(status = '') {
      currentValue++;
      maybeLog(status);
    },
    finish() {
      logger.info(`${description}: complete | ${currentValue}/${total} games`);
    },
    updateStatus(status: string) {
      maybeLog(status);
    },
    get value() {
      return currentValue;
    }
  };
}

// Helper function to temporarily hide and restore the progress bar. Only the
// interactive bar needs hiding; without a TTY there's no in-place bar to clear.
export function withoutProgressBar<T>(fn: () => T): T {
  const currentBar = activeBar;
  if (currentBar) {
    process.stdout.write('\r\x1b[K');
  }
  const result = fn();
  if (currentBar && activeBar === currentBar) {
    currentBar.render();
  }
  return result;
}

export function getActiveBar() {
  return activeBar;
}
