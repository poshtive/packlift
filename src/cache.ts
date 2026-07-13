import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

function getCacheDir(): string {
  const home = os.homedir();
  const platform = os.platform();
  const overrideDir = process.env.PACKLIFT_CACHE_DIR?.trim();

  if (overrideDir) {
    return overrideDir;
  }

  if (platform === 'win32') {
    return path.join(
      process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'),
      'packlift',
      'Cache',
    );
  }

  if (platform === 'darwin') {
    return path.join(home, 'Library', 'Caches', 'packlift');
  }

  return path.join(process.env.XDG_CACHE_HOME || path.join(home, '.cache'), 'packlift');
}

export interface CacheEntry<T> {
  version: number;
  timestamp: number;
  value: T;
  lastModified?: string;
  etag?: string;
}

function getCacheFilePath(key: string): string {
  return path.join(getCacheDir(), `${key}.json`);
}

export async function getCacheEntry<T>(
  key: string,
  expectedVersion: number,
): Promise<CacheEntry<T> | null> {
  try {
    const filePath = getCacheFilePath(key);

    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content) as CacheEntry<T>;

    if (data.version !== expectedVersion) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

export async function setCache<T>(
  key: string,
  value: T,
  version: number,
  meta: { lastModified?: string; etag?: string } = {},
): Promise<void> {
  try {
    const cacheDir = getCacheDir();
    await fs.mkdir(cacheDir, { recursive: true });

    const filePath = getCacheFilePath(key);
    const data: CacheEntry<T> = {
      version,
      timestamp: Date.now(),
      value,
      lastModified: meta.lastModified,
      etag: meta.etag,
    };

    await fs.writeFile(filePath, JSON.stringify(data), 'utf-8');
  } catch {}
}

export async function touchCache(key: string, version: number): Promise<void> {
  try {
    const entry = await getCacheEntry(key, version);
    if (entry) {
      const now = new Date();
      await fs.utimes(getCacheFilePath(key), now, now);
    }
  } catch {}
}
