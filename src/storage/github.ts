import { Octokit } from '@octokit/rest';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { config } from '../config';
import { Game, GameResult, Series, Team } from '../types';
import { logger } from '../utils/logger';
import { CsvStorage } from './csv';
import { StorageError } from './interface';

export class GitHubStorage extends CsvStorage {
  private octokit: Octokit;
  private owner: string;
  private repo: string;
  private branch: string;
  private modifiedFiles: Set<string>;
  private dataRepoPath: string;

  constructor() {
    super();

    const token = process.env.GITHUB_TOKEN;
    this.owner = process.env.GITHUB_OWNER || '';
    this.repo = process.env.GITHUB_REPO || '';
    this.branch = process.env.GITHUB_BRANCH || 'main';
    this.dataRepoPath = config.storage.path;
    this.modifiedFiles = new Set();

    if (!token || !this.owner || !this.repo) {
      throw new StorageError('GitHub configuration is incomplete. Please check environment variables.');
    }

    this.octokit = new Octokit({ auth: token });
    logger.info(`Initialized GitHub storage for repository ${this.owner}/${this.repo} (${this.branch})`);
  }

  async initialize(): Promise<void> {
    logger.info('Initializing GitHub storage...');

    // Create data directory if it doesn't exist
    await fs.mkdir(this.dataRepoPath, { recursive: true });

    // Clean any existing Git locks before proceeding
    await this.cleanGitLocks();

    // Check if directory is empty (excluding .git and .gitattributes)
    let dirFiles: string[] = [];
    try {
      dirFiles = await fs.readdir(this.dataRepoPath);
    } catch {
      dirFiles = [];
    }
    const nonMetaFiles = dirFiles.filter(f => f !== '.git' && f !== '.gitattributes' && !f.startsWith('.DS_'));
    if (nonMetaFiles.length === 0) {
      logger.info('Data directory is empty, attempting to clone from GitHub...');
      try {
        await this.runGitCommand(
          'clone',
          `https://${process.env.GITHUB_TOKEN}@github.com/${this.owner}/${this.repo}.git`,
          '.'
        );
        logger.info('Successfully cloned repository from GitHub.');
        return;
      } catch (err) {
        logger.warn('Could not clone from GitHub, proceeding with initialization.', err);
      }
    }

    // Check if data repo is already cloned
    const isRepo = await fs
      .access(path.join(this.dataRepoPath, '.git'))
      .then(() => true)
      .catch(() => false);

    if (!isRepo) {
      // Check if remote repository is empty
      const isEmpty = await this.checkGitHubEmpty();

      // Initialize new repository with existing data
      logger.info('Initializing new Git repository with existing data...');
      await this.runGitCommand('init');

      // Configure Git remote
      await this.ensureGitRemote();

      // Configure Git
      await this.runGitCommand('config', '--local', 'user.name', 'QuizDash Scraper');
      await this.runGitCommand('config', '--local', 'user.email', 'scraper@quizdash.ru');

      // Create .gitattributes first
      const gitattributesPath = path.join(this.dataRepoPath, '.gitattributes');
      try {
        await fs.access(gitattributesPath);
      } catch {
        const gitattributesContent = '*.csv filter=lfs diff=lfs merge=lfs -text';
        await fs.writeFile(gitattributesPath, gitattributesContent);
      }

      // Add and commit .gitattributes first
      await this.runGitCommand('add', '.gitattributes');
      await this.runGitCommand('commit', '-m', '"Configure Git LFS"');

      // Now configure Git LFS
      logger.info('Configuring Git LFS...');
      await this.runGitCommand('lfs', 'install');

      // Add all existing files
      await this.runGitCommand('add', '.');

      // Create initial commit
      await this.runGitCommand('commit', '-m', '"Initial commit with existing data"');

      // Create main branch
      await this.runGitCommand('branch', '-M', 'main');

      if (!isEmpty) {
        // If remote is not empty, try to merge with remote changes
        try {
          await this.runGitCommand('fetch', 'origin');
          await this.runGitCommand('merge', '--allow-unrelated-histories', 'origin/main');
          // Handle any merge conflicts
          await this.handleMergeConflicts();
        } catch (error) {
          // logger.warn('Could not merge with remote repository, will push local data');
          // Force push if we can't merge
          // await this.runGitCommand('push', '-u', 'origin', 'main', '--force');
          return;
        }
      }

      // Push our changes
      await this.runGitCommand('push', '-u', 'origin', 'main');
    } else {
      // If repo exists, fetch latest but don't reset
      logger.info('Fetching latest changes...');

      // Ensure remote is configured correctly
      await this.ensureGitRemote();

      await this.runGitCommand('fetch', 'origin');

      // Try to merge remote changes
      try {
        await this.runGitCommand('merge', 'origin/main');
        // Handle any merge conflicts
        await this.handleMergeConflicts();
      } catch (error) {
        // logger.warn('Could not merge remote changes, keeping local data');
        // // Reset any failed merge
        // await this.runGitCommand('reset', '--hard', 'HEAD');
        // // Force push if we can't merge
        // await this.runGitCommand('push', 'origin', 'main', '--force');
      }

      // Configure Git
      await this.runGitCommand('config', '--local', 'user.name', 'QuizDash Bot');
      await this.runGitCommand('config', '--local', 'user.email', 'bot@quizdash.local');

      // Configure Git LFS
      await this.runGitCommand('lfs', 'install');
      await this.runGitCommand('lfs', 'pull');
    }

    // Ensure our files exist but NEVER overwrite them
    const files = [this.gamesFile, this.resultsFile, this.citiesFile, this.ranksFile, this.teamsFile, this.seriesFile];

    for (const file of files) {
      await fs.mkdir(path.dirname(file), { recursive: true });
      try {
        await fs.access(file);
      } catch {
        // Only create if file doesn't exist
        await fs.writeFile(file, '');
        await this.runGitCommand('add', path.relative(this.dataRepoPath, file));
      }
    }

    // Commit any new files
    try {
      await this.runGitCommand('diff', '--staged', '--quiet');
    } catch (error) {
      // There are staged changes
      await this.runGitCommand('commit', '-m', '"Add missing data files"');
      await this.runGitCommand('push', 'origin', this.branch);
    }

    logger.info('GitHub storage initialized');
  }

  async pullFromGitHub(): Promise<void> {
    const files = [this.gamesFile, this.resultsFile, this.citiesFile, this.ranksFile, this.teamsFile, this.seriesFile];

    try {
      // Pull latest changes
      await this.runGitCommand('fetch', 'origin');
      await this.runGitCommand('reset', '--hard', `origin/${this.branch}`);

      // Ensure directories exist
      for (const file of files) {
        await fs.mkdir(path.dirname(file), { recursive: true });
      }
    } catch (error: any) {
      throw new StorageError('Failed to pull latest changes from GitHub', error);
    }
  }

  private async cleanGitLocks(): Promise<void> {
    // Clean up any stale Git locks
    const lockFiles = [
      path.join(this.dataRepoPath, '.git', 'index.lock'),
      path.join(this.dataRepoPath, '.git', 'config.lock'),
    ];

    for (const lockFile of lockFiles) {
      try {
        await fs.unlink(lockFile);
      } catch (error) {
        // Ignore if lock file doesn't exist
      }
    }
  }

  private async runGitCommand(command: string, ...args: string[]): Promise<string> {
    // Convert any file paths in args to absolute paths relative to repo root
    const mappedArgs = args;
    // args.map(arg => {
    //   // Skip non-path arguments like command flags or URLs
    //   if (
    //     arg.startsWith('-') ||
    //     arg === '.' ||
    //     !arg.includes('/') ||
    //     arg.startsWith('http://') ||
    //     arg.startsWith('https://')
    //   ) {
    //     return arg;
    //   }
    //   return path.resolve(this.dataRepoPath, arg);
    // });

    return new Promise<string>((resolve, reject) => {
      const cmd = `git ${command} ${mappedArgs.join(' ')}`;
      logger.debug(`Running Git command: ${cmd}`);

      const childProcess = spawn('git', [command, ...mappedArgs], {
        cwd: this.dataRepoPath,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
        },
      });

      let stdout = '';
      let stderr = '';

      childProcess.stdout.on('data', data => {
        stdout += data;
      });

      childProcess.stderr.on('data', data => {
        stderr += data;
      });

      childProcess.on('close', code => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Command failed: ${cmd}\n${stderr}`));
        }
      });

      childProcess.on('error', error => {
        reject(error);
      });
    });
  }

  async pushFileToGitHub(file: string, commitMessage: string): Promise<void> {
    const relativePath = path.relative(config.storage.path, file);
    logger.debug(`Pushing file to GitHub: ${relativePath}`);

    try {
      // Check if file exists and has changes
      try {
        const status = await this.runGitCommand('status', '--porcelain', relativePath);
        if (!status) {
          logger.debug(`No changes in file: ${relativePath}`);
          return;
        }
      } catch (error) {
        logger.warn(`Failed to check status for ${relativePath}:`, error);
        return;
      }

      // Add and commit
      await this.runGitCommand('add', relativePath);

      // Check if there are staged changes
      try {
        await this.runGitCommand('diff', '--staged', '--quiet');
        logger.debug(`No staged changes for ${relativePath}`);
        return;
      } catch {
        // There are staged changes, proceed with commit
        await this.runGitCommand('commit', '-m', `${commitMessage} [${new Date().toISOString()}]`);
      }

      // Pull and rebase before pushing
      try {
        await this.runGitCommand('pull', '--rebase', 'origin', this.branch);
      } catch (error) {
        logger.warn('Failed to pull latest changes:', error);
        // Try to abort rebase if it failed
        try {
          await this.runGitCommand('rebase', '--abort');
        } catch (abortError) {
          logger.warn('Failed to abort rebase:', abortError);
        }
      }

      // Push changes
      await this.runGitCommand('push', 'origin', this.branch);
    } catch (error) {
      // Try to clean up
      try {
        await this.runGitCommand('reset', '--hard', 'HEAD');
        await this.cleanGitLocks();
      } catch (cleanupError) {
        logger.warn('Failed to clean up after push error:', cleanupError);
      }
      throw new StorageError(`Failed to push file to GitHub: ${file}`, error);
    }
  }

  async checkGitHubEmpty(): Promise<boolean> {
    try {
      // Try to get the repository contents
      const response = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: '', // Root path
        ref: this.branch,
      });

      // If we get an array, the repository has contents
      if (Array.isArray(response.data)) {
        return response.data.length === 0;
      }

      // If we get here, something unexpected happened
      logger.warn('Unexpected response when checking repository contents');
      return false;
    } catch (error: any) {
      if (error.status === 404) {
        return true; // Repository is empty
      }
      throw error; // Other error, should be handled by caller
    }
  }

  private async ensureGitRemote(): Promise<void> {
    // Check if remote exists
    try {
      await this.runGitCommand('remote', 'get-url', 'origin');
    } catch (error) {
      // Remote doesn't exist or has wrong URL, try to remove and add
      try {
        await this.runGitCommand('remote', 'remove', 'origin');
      } catch {
        // Ignore if remote doesn't exist
      }

      await this.runGitCommand(
        'remote',
        'add',
        'origin',
        `https://${process.env.GITHUB_TOKEN}@github.com/${this.owner}/${this.repo}.git`
      );
    }
  }

  private async handleMergeConflicts(): Promise<void> {
    // Get list of unmerged files
    const status = await this.runGitCommand('status', '--porcelain');
    const lines = status.split('\n');
    const unmergedFiles = lines.filter(line => line.startsWith('UU')).map(line => line.substring(3));

    for (const file of unmergedFiles) {
      // For now, we'll keep our version of the file
      await this.runGitCommand('checkout', '--ours', file);
      await this.runGitCommand('add', file);
    }

    // Commit the resolution
    await this.runGitCommand('commit', '-m', '"Resolve merge conflicts keeping local changes"');
  }

  // Override save methods to track modified files instead of pushing immediately
  async saveGames(games: Game[]): Promise<void> {
    await super.saveGames(games);
    this.modifiedFiles.add(this.gamesFile);
    logger.debug(`Marked games file for sync: ${path.relative(config.storage.path, this.gamesFile)}`);
  }

  async saveResults(results: GameResult[]): Promise<void> {
    await super.saveResults(results);
    this.modifiedFiles.add(this.resultsFile);
    logger.debug(`Marked results file for sync: ${path.relative(config.storage.path, this.resultsFile)}`);
  }

  async saveSeries(series: Series): Promise<void> {
    await super.saveSeries(series);
    this.modifiedFiles.add(this.seriesFile);
    logger.debug(`Marked series file for sync: ${path.relative(config.storage.path, this.seriesFile)}`);
  }

  async saveTeam(team: Team): Promise<void> {
    await super.saveTeam(team);
    this.modifiedFiles.add(this.teamsFile);
    logger.debug(`Marked teams file for sync: ${path.relative(config.storage.path, this.teamsFile)}`);
  }

  async updateCityLastGameId(cityId: number, lastGameId: number): Promise<void> {
    await super.updateCityLastGameId(cityId, lastGameId);
    this.modifiedFiles.add(this.citiesFile);
    logger.debug(`Marked cities file for sync: ${path.relative(config.storage.path, this.citiesFile)}`);
  }

  // New method to push all changes at once
  async syncChanges(message: string = 'update data files'): Promise<void> {
    // Clean any stale Git locks first
    await this.cleanGitLocks();

    // Check Git status for any changes
    const status = await this.runGitCommand('status', '--porcelain');
    const hasGitChanges = status.length > 0;
    const hasTrackedChanges = this.modifiedFiles.size > 0;

    if (!hasGitChanges && !hasTrackedChanges) {
      logger.info('No changes to sync');
      return;
    }

    if (hasGitChanges) {
      logger.info('Found unsynced changes from previous run');
    }

    // // Add all modified files we know about
    // for (const file of this.modifiedFiles) {
    //   try {
    //     await this.runGitCommand('add', file);
    //   } catch (error) {
    //     logger.error(`Failed to add file ${file}:`, error);
    //   }
    // }

    // Add any untracked changes from previous runs
    if (hasGitChanges) {
      try {
        await this.runGitCommand('add', '.');
      } catch (error) {
        logger.error('Failed to add untracked changes:', error);
      }
    }

    // Check if we have any staged changes
    try {
      await this.runGitCommand('diff', '--staged', '--quiet');
      logger.info('No staged changes to commit');
      this.modifiedFiles.clear();
      return;
    } catch {
      // There are staged changes, proceed with commit
    }

    try {
      // Create commit
      await this.runGitCommand('commit', '-m', `${message} [${new Date().toISOString()}]`);

      // Pull and rebase
      try {
        await this.runGitCommand('pull', '--rebase', 'origin', this.branch);
      } catch (error) {
        logger.warn('Failed to pull latest changes:', error);
        // Try to abort rebase if it failed
        try {
          await this.runGitCommand('rebase', '--abort');
        } catch {}
      }

      // Push changes
      await this.runGitCommand('push', 'origin', this.branch);
      logger.info('Successfully synced all changes');
      this.modifiedFiles.clear();
    } catch (error) {
      // On error, try to clean up
      try {
        await this.runGitCommand('reset', '--hard', 'HEAD');
        await this.cleanGitLocks();
      } catch {}
      throw error;
    }
  }
}
