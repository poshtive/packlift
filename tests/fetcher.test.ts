import { describe, test, expect, mock, afterEach, afterAll } from 'bun:test';
import { setCache, getCacheEntry } from '../src/cache';
import path from 'node:path';
import os from 'node:os';
import type { Stability } from '../src/types';
import { fetchPackage, fetchAllPackages } from '../src/fetcher';

const NO_CACHE = true;

const fetchPackageNoCache = (
  packageName: string,
  minStability: Stability = 'stable',
  preferStable: boolean = true,
  currentVersion?: string,
  allowMajor: boolean = true,
) => fetchPackage(packageName, minStability, preferStable, currentVersion, allowMajor, true);

const fetchAllPackagesNoCache = (
  packages: Record<string, string>,
  minStability: Stability = 'stable',
  preferStable: boolean = true,
  allowMajor: boolean = true,
) => fetchAllPackages(packages, minStability, preferStable, allowMajor, NO_CACHE);

const TEST_CACHE_DIR = path.join(
  os.tmpdir(),
  `packlift-fetcher-test-${Math.random().toString(36).slice(2)}`,
);
process.env.PACKLIFT_CACHE_DIR = TEST_CACHE_DIR;

describe('fetchPackage', () => {
  const originalFetch = globalThis.fetch;

  const mockFetch = (response: object, ok = true, status = 200) => {
    // @ts-expect-error
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok,
        status,
        headers: new Map(),
        json: () => Promise.resolve(response),
      }),
    );
  };

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  afterAll(async () => {
    try {
      await import('node:fs/promises').then((fs) =>
        fs.rm(TEST_CACHE_DIR, { recursive: true, force: true }),
      );
    } catch {}
  });

  test('returns package info for valid package', async () => {
    const mockResponse = {
      packages: {
        'vendor/package': [
          {
            version: '2.0.0',
            version_normalized: '2.0.0.0',
            time: '2024-01-01T12:00:00+00:00',
          },
          {
            version: '1.0.0',
            version_normalized: '1.0.0.0',
            time: '2023-01-01T12:00:00+00:00',
          },
        ],
      },
    };

    mockFetch(mockResponse);

    const result = await fetchPackageNoCache('vendor/package');
    expect(result).not.toBeNull();
    expect(result?.latestVersion).toBe('2.0.0');
    expect(result?.releaseTime).toBe('2024-01-01T12:00:00+00:00');
  });

  test('returns null for non-existent package', async () => {
    mockFetch({}, false, 404);

    const result = await fetchPackageNoCache('nonexistent/package');
    expect(result).toBeNull();
  });

  test('returns null for empty versions', async () => {
    mockFetch({ packages: { 'vendor/package': [] } });

    const result = await fetchPackageNoCache('vendor/package');
    expect(result).toBeNull();
  });

  test('skips dev versions and returns latest stable', async () => {
    const mockResponse = {
      packages: {
        'vendor/package': [
          {
            version: 'dev-main',
            version_normalized: 'dev-main',
            time: '2024-02-01T12:00:00+00:00',
          },
          {
            version: '2.0.0-beta',
            version_normalized: '2.0.0.0-beta',
            time: '2024-01-15T12:00:00+00:00',
          },
          {
            version: '1.5.0',
            version_normalized: '1.5.0.0',
            time: '2024-01-01T12:00:00+00:00',
          },
        ],
      },
    };

    mockFetch(mockResponse);

    const result = await fetchPackageNoCache('vendor/package');
    expect(result?.latestVersion).toBe('1.5.0');
  });

  test('falls back to first version if no stable versions', async () => {
    const mockResponse = {
      packages: {
        'vendor/package': [
          {
            version: 'dev-main',
            version_normalized: 'dev-main',
            time: '2024-02-01T12:00:00+00:00',
          },
          {
            version: 'dev-develop',
            version_normalized: 'dev-develop',
            time: '2024-01-15T12:00:00+00:00',
          },
        ],
      },
    };

    mockFetch(mockResponse);

    const result = await fetchPackageNoCache('vendor/package');
    expect(result?.latestVersion).toBe('dev-main');
  });

  test('returns null on fetch error', async () => {
    // @ts-expect-error
    globalThis.fetch = mock(() => Promise.reject(new Error('Network error')));

    const result = await fetchPackageNoCache('vendor/package');
    expect(result).toBeNull();
  });

  test('returns null when packages object is missing', async () => {
    mockFetch({});

    const result = await fetchPackageNoCache('vendor/package');
    expect(result).toBeNull();
  });

  test('returns first eligible when preferStable is false', async () => {
    const mockResponse = {
      packages: {
        'vendor/package': [
          {
            version: '2.0.0-beta',
            version_normalized: '2.0.0.0-beta',
            time: '2024-02-01T12:00:00+00:00',
          },
          {
            version: '1.5.0',
            version_normalized: '1.5.0.0',
            time: '2024-01-01T12:00:00+00:00',
          },
        ],
      },
    };

    mockFetch(mockResponse);

    const result = await fetchPackageNoCache('vendor/package', 'beta', false);
    expect(result?.latestVersion).toBe('2.0.0-beta');
  });
  test('parses PHP requirement from package', async () => {
    const mockResponse = {
      packages: {
        'vendor/package': [
          {
            version: '1.5.0',
            version_normalized: '1.5.0.0',
            time: '2024-01-01T12:00:00+00:00',
            require: { php: '>=8.1' },
          },
        ],
      },
    };

    mockFetch(mockResponse);

    const result = await fetchPackageNoCache('vendor/package');
    expect(result?.phpRequirement).toBe('>=8.1');
  });

  test('detects available major version when current version is provided', async () => {
    const mockResponse = {
      packages: {
        'vendor/package': [
          {
            version: '2.0.0',
            version_normalized: '2.0.0.0',
            time: '2024-02-01T12:00:00+00:00',
          },
          {
            version: '1.5.0',
            version_normalized: '1.5.0.0',
            time: '2024-01-01T12:00:00+00:00',
          },
        ],
      },
    };

    mockFetch(mockResponse);

    const result = await fetchPackageNoCache('vendor/package', 'stable', true, '1.0.0', false);
    expect(result?.latestVersion).toBe('1.5.0');
    expect(result?.majorVersion).toBe('2.0.0');
  });

  test('does not report major version if already on latest major', async () => {
    const mockResponse = {
      packages: {
        'vendor/package': [
          {
            version: '2.5.0',
            version_normalized: '2.5.0.0',
            time: '2024-02-01T12:00:00+00:00',
          },
        ],
      },
    };

    mockFetch(mockResponse);

    const result = await fetchPackageNoCache('vendor/package', 'stable', true, '^2.0.0');
    expect(result?.latestVersion).toBe('2.5.0');
    expect(result?.majorVersion).toBeUndefined();
  });

  test('detects deprecated package and replacement', async () => {
    mockFetch({
      packages: {
        'vendor/package': [
          {
            version: '1.5.0',
            version_normalized: '1.5.0.0',
            time: '2024-01-01T12:00:00+00:00',
            abandoned: 'vendor/new-package',
          },
        ],
      },
    });

    const result = await fetchPackageNoCache('vendor/package');
    expect(result?.deprecated).toBe(true);
    expect(result?.replacement).toBe('vendor/new-package');
  });

  test('detects deprecated package without replacement', async () => {
    mockFetch({
      packages: {
        'vendor/package': [
          {
            version: '1.5.0',
            version_normalized: '1.5.0.0',
            time: '2024-01-01T12:00:00+00:00',
            abandoned: true,
          },
        ],
      },
    });

    const result = await fetchPackageNoCache('vendor/package');
    expect(result?.deprecated).toBe(true);
    expect(result?.replacement).toBeUndefined();
  });
  test('uses If-Modified-Since header when cached version exists', async () => {
    const cachedValue = {
      packages: {
        'vendor/package': [
          {
            version: '1.0.0',
            version_normalized: '1.0.0.0',
            time: '2023-01-01T12:00:00+00:00',
          },
        ],
      },
    };

    await setCache('vendor_package', cachedValue, 1, {
      lastModified: 'Mon, 01 Jan 2024 12:00:00 GMT',
      etag: '"etag-1"',
    });

    // @ts-expect-error
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        status: 304,
        json: () => Promise.resolve({}),
      }),
    );

    const result = await fetchPackage('vendor/package', 'stable', true, undefined, true, false);

    // @ts-expect-error
    const fetchCall = globalThis.fetch.mock.calls[0];
    const headers = fetchCall[1]?.headers;
    expect(headers).toHaveProperty('If-Modified-Since', 'Mon, 01 Jan 2024 12:00:00 GMT');
    expect(headers).toHaveProperty('If-None-Match', '"etag-1"');

    expect(result?.latestVersion).toBe('1.0.0');
  });

  test('updates cache with Last-Modified on 200 OK', async () => {
    const mockResponse = {
      packages: {
        'vendor/package': [
          {
            version: '2.0.0',
            version_normalized: '2.0.0.0',
            time: '2024-01-01T12:00:00+00:00',
          },
        ],
      },
    };

    // @ts-expect-error
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        headers: new Map([
          ['Last-Modified', 'Tue, 02 Jan 2024 12:00:00 GMT'],
          ['ETag', '"etag-2"'],
        ]),
        json: () => Promise.resolve(mockResponse),
      }),
    );

    await fetchPackage('vendor/package', 'stable', true, undefined, true, false);

    const cached = await getCacheEntry<any>('vendor_package', 1);
    expect(cached).not.toBeNull();
    expect(cached?.value.packages?.['vendor/package'][0]?.version).toBe('2.0.0');
    expect(cached?.lastModified).toBe('Tue, 02 Jan 2024 12:00:00 GMT');
    expect(cached?.etag).toBe('"etag-2"');
  });

  test('falls back to compatible PHP version', async () => {
    const mockResponse = {
      packages: {
        'vendor/package': [
          { version: '2.0.0', time: '2023-01-01', require: { php: '^8.1' } },
          { version: '1.5.0', time: '2022-01-01', require: { php: '^8.0' } },
          { version: '1.0.0', time: '2021-01-01', require: { php: '^7.4' } },
        ],
      },
    };
    mockFetch(mockResponse);

    const result = await fetchPackage(
      'vendor/package',
      'stable',
      true,
      undefined,
      true,
      false,
      '8.0.0',
    );

    expect(result?.latestVersion).toBe('1.5.0');
    expect(result?.phpIncompatible).toBe(true);
    expect(result?.skippedVersion).toBe('2.0.0');
  });
});

describe('fetchAllPackages', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('fetches multiple packages', async () => {
    // @ts-expect-error
    globalThis.fetch = mock((url: string) => {
      const packageName = url.replace('https://repo.packagist.org/p2/', '').replace('.json', '');
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            packages: {
              [packageName]: [
                {
                  version: '1.0.0',
                  version_normalized: '1.0.0.0',
                  time: '2024-01-01T12:00:00+00:00',
                },
              ],
            },
          }),
      });
    });

    const packages = {
      'vendor/package1': '^1.0',
      'vendor/package2': '^2.0',
    };

    const results = await fetchAllPackagesNoCache(packages);
    expect(results.size).toBe(2);
    expect(results.has('vendor/package1')).toBe(true);
    expect(results.has('vendor/package2')).toBe(true);
  });

  test('handles failed fetches gracefully', async () => {
    let callCount = 0;
    // @ts-expect-error
    globalThis.fetch = mock(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({ ok: false });
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            packages: {
              'vendor/package2': [
                {
                  version: '2.0.0',
                  version_normalized: '2.0.0.0',
                  time: '2024-01-01T12:00:00+00:00',
                },
              ],
            },
          }),
      });
    });

    const packages = {
      'vendor/package1': '^1.0',
      'vendor/package2': '^2.0',
    };

    const results = await fetchAllPackagesNoCache(packages);
    expect(results.size).toBe(1);
    expect(results.has('vendor/package2')).toBe(true);
  });

  test('returns empty map for empty input', async () => {
    const results = await fetchAllPackagesNoCache({});
    expect(results.size).toBe(0);
  });
});
