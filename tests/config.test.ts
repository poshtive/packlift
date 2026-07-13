import { describe, test, expect } from 'bun:test';
import {
  filterComposerPackages,
  getComposerExcludeList,
  mergeExcludeLists,
} from '../src/config';
import type { ComposerJson } from '../src/types';

describe('getComposerExcludeList', () => {
  test('returns excludes from composer extra config', () => {
    const composer: ComposerJson = {
      extra: {
        packlift: {
          exclude: ['vendor/package-a', ' vendor/package-b '],
        },
      },
    };

    expect(getComposerExcludeList(composer)).toEqual(['vendor/package-a', 'vendor/package-b']);
  });

  test('returns empty array for missing config', () => {
    expect(getComposerExcludeList({})).toEqual([]);
  });

  test('returns empty array for invalid config shape', () => {
    const composer = {
      extra: {
        packlift: {
          exclude: 'vendor/package-a',
        },
      },
    } as unknown as ComposerJson;

    expect(getComposerExcludeList(composer)).toEqual([]);
  });
});

describe('mergeExcludeLists', () => {
  test('merges and deduplicates file and cli excludes', () => {
    expect(
      mergeExcludeLists(['vendor/package-a', 'Vendor/Package-B'], ['vendor/package-b', 'vendor/package-c']),
    ).toEqual(['vendor/package-a', 'vendor/package-b', 'vendor/package-c']);
  });
});

describe('filterComposerPackages', () => {
  test('filters excluded packages before fetch and ignores php platform packages', () => {
    const { filteredPackages, ignoredPackages } = filterComposerPackages(
      {
        php: '^8.2',
        'ext-json': '*',
        'vendor/package-a': '^1.0',
        'vendor/package-b': '^2.0',
        'vendor/package-c': '^3.0',
      },
      ['vendor/package-b', 'vendor/missing'],
    );

    expect(filteredPackages).toEqual({
      'vendor/package-a': '^1.0',
      'vendor/package-c': '^3.0',
    });
    expect(ignoredPackages).toEqual(['vendor/package-b']);
  });
});
