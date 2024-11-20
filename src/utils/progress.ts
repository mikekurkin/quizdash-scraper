import cliProgress from 'cli-progress';
import { logger } from './logger';

let activeBar: cliProgress.SingleBar | null = null;

export function createProgressBar(total: number, description: string) {
  const bar = new cliProgress.SingleBar({
    format: `${description} |{bar}| {percentage}% | {value}/{total} games | {status}`,
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
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

// Helper function to temporarily hide and restore the progress bar
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
