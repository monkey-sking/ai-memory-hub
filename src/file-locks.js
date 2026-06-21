// File Lock Implementation for Concurrent Access Control

import { writeFileSync, readFileSync, existsSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import os from 'os';

const LOCK_DIR = join(os.homedir(), '.ai-memory', 'locks');
const LOCK_TIMEOUT = 30000; // 30 seconds
const RETRY_DELAY = 100; // 100ms

// Ensure lock directory exists
try {
  mkdirSync(LOCK_DIR, { recursive: true });
} catch (e) {
  // Directory already exists
}

export class FileLock {
  constructor(resourceId, options = {}) {
    this.resourceId = resourceId;
    this.lockPath = join(LOCK_DIR, `${resourceId.replace(/[^a-zA-Z0-9_-]/g, '_')}.lock`);
    this.timeout = options.timeout || LOCK_TIMEOUT;
    this.retries = options.retries || 300; // 30 seconds / 100ms
    this.acquired = false;
  }

  async acquire() {
    for (let attempt = 0; attempt < this.retries; attempt++) {
      if (this.tryAcquire()) {
        this.acquired = true;
        return true;
      }

      // Check if lock is stale
      if (this.isStale()) {
        this.forceRelease();
        continue;
      }

      await this.sleep(RETRY_DELAY);
    }

    throw new Error(`Failed to acquire lock for ${this.resourceId} after ${this.retries} attempts`);
  }

  tryAcquire() {
    try {
      if (existsSync(this.lockPath)) {
        return false;
      }

      const lockData = {
        pid: process.pid,
        hostname: os.hostname(),
        resourceId: this.resourceId,
        acquiredAt: new Date().toISOString(),
        timeout: this.timeout
      };

      writeFileSync(this.lockPath, JSON.stringify(lockData), { flag: 'wx' });
      return true;
    } catch (error) {
      if (error.code === 'EEXIST') {
        return false;
      }
      throw error;
    }
  }

  release() {
    if (!this.acquired) {
      return false;
    }

    try {
      if (existsSync(this.lockPath)) {
        const lockData = JSON.parse(readFileSync(this.lockPath, 'utf-8'));

        // Only release if we own it
        if (lockData.pid === process.pid && lockData.hostname === os.hostname()) {
          unlinkSync(this.lockPath);
          this.acquired = false;
          return true;
        }
      }
    } catch (error) {
      console.error(`Failed to release lock: ${error.message}`);
    }

    return false;
  }

  forceRelease() {
    try {
      if (existsSync(this.lockPath)) {
        unlinkSync(this.lockPath);
      }
    } catch (error) {
      console.error(`Failed to force release lock: ${error.message}`);
    }
  }

  isStale() {
    try {
      if (!existsSync(this.lockPath)) {
        return false;
      }

      const lockData = JSON.parse(readFileSync(this.lockPath, 'utf-8'));
      const acquiredAt = new Date(lockData.acquiredAt);
      const elapsed = Date.now() - acquiredAt.getTime();

      return elapsed > (lockData.timeout || LOCK_TIMEOUT);
    } catch (error) {
      return true; // Treat read errors as stale
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getLockInfo() {
    try {
      if (existsSync(this.lockPath)) {
        return JSON.parse(readFileSync(this.lockPath, 'utf-8'));
      }
    } catch (error) {
      return null;
    }
    return null;
  }
}

// Utility function for automatic lock management
export async function withLock(resourceId, fn, options = {}) {
  const lock = new FileLock(resourceId, options);

  try {
    await lock.acquire();
    return await fn();
  } finally {
    lock.release();
  }
}

// Cleanup stale locks on startup
export function cleanupStaleLocks() {
  try {
    import('fs').then(fs => {
      const files = fs.readdirSync(LOCK_DIR);

      let cleaned = 0;
      for (const file of files) {
        if (file.endsWith('.lock')) {
          const lockPath = join(LOCK_DIR, file);
          try {
            const lockData = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
            const acquiredAt = new Date(lockData.acquiredAt);
            const elapsed = Date.now() - acquiredAt.getTime();

            if (elapsed > (lockData.timeout || LOCK_TIMEOUT)) {
              fs.unlinkSync(lockPath);
              cleaned++;
            }
          } catch (e) {
            // Invalid lock file, remove it
            fs.unlinkSync(lockPath);
            cleaned++;
          }
        }
      }

      if (cleaned > 0) {
        console.log(`[FileLock] Cleaned up ${cleaned} stale locks`);
      }
    });
  } catch (error) {
    console.error('[FileLock] Cleanup error:', error.message);
  }
}

export default FileLock;
