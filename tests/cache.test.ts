import { describe, test, expect, afterAll } from 'bun:test';
import { stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getCacheEntry, setCache, touchCache } from '../src/cache';

const TEST_CACHE_KEY = 'test_key';
const TEST_CACHE_DIR = path.join(
  os.tmpdir(),
  `packlift-test-cache-${Math.random().toString(36).slice(2)}`,
);

process.env.PACKLIFT_CACHE_DIR = TEST_CACHE_DIR;

describe('Cache', () => {
  test('can write and read cache', async () => {
    const data = { foo: 'bar' };
    await setCache(TEST_CACHE_KEY, data, 1);

    const cached = await getCacheEntry<{ foo: string }>(TEST_CACHE_KEY, 1);
    expect(cached).not.toBeNull();
    expect(cached?.value).toEqual(data);
  });

  test('returns null for missing key', async () => {
    const cached = await getCacheEntry('non_existent_key', 1);
    expect(cached).toBeNull();
  });

  test('touchCache refreshes file mtime without changing cached value', async () => {
    const data = { foo: 'bar' };
    await setCache(TEST_CACHE_KEY, data, 1, {
      lastModified: 'Mon, 01 Jan 2024 12:00:00 GMT',
      etag: '"etag-1"',
    });

    const filePath = path.join(TEST_CACHE_DIR, `${TEST_CACHE_KEY}.json`);
    const before = await stat(filePath);

    await new Promise((resolve) => setTimeout(resolve, 20));
    await touchCache(TEST_CACHE_KEY, 1);

    const after = await stat(filePath);
    const cached = await getCacheEntry<{ foo: string }>(TEST_CACHE_KEY, 1);

    expect(after.mtimeMs).toBeGreaterThan(before.mtimeMs);
    expect(cached?.value).toEqual(data);
    expect(cached?.etag).toBe('"etag-1"');
  });

  afterAll(async () => {
    try {
      await import('node:fs/promises').then((fs) =>
        fs.rm(TEST_CACHE_DIR, { recursive: true, force: true }),
      );
    } catch {}
  });
});
