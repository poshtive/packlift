import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { readFile, writeFile, rm, mkdir, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { readComposerJson, writeComposerJson, runComposerUpdate } from '../src/writer';
import type { PackageInfo } from '../src/types';

const TEST_DIR = join(import.meta.dir, '.test-tmp');
const TEST_COMPOSER = join(TEST_DIR, 'composer.json');

describe('readComposerJson', () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  test('reads valid composer.json', async () => {
    const content = {
      require: {
        php: '^8.1',
        'vendor/package': '^1.0',
      },
    };
    await writeFile(TEST_COMPOSER, JSON.stringify(content, null, 4));

    const result = await readComposerJson(TEST_COMPOSER);
    expect(result).not.toBeNull();
    expect(result?.content.require).toEqual(content.require);
    expect(result?.indent).toBe('    ');
  });

  test('returns null for non-existent file', async () => {
    const result = await readComposerJson('/nonexistent/composer.json');
    expect(result).toBeNull();
  });

  test('returns null for invalid JSON', async () => {
    await writeFile(TEST_COMPOSER, 'not valid json {{{');
    const result = await readComposerJson(TEST_COMPOSER);
    expect(result).toBeNull();
  });

  test('detects 2-space indent', async () => {
    const content = JSON.stringify({ require: {} }, null, 2);
    await writeFile(TEST_COMPOSER, content);

    const result = await readComposerJson(TEST_COMPOSER);
    expect(result?.indent).toBe('  ');
  });

  test('detects tab indent', async () => {
    const content = '{\n\t"require": {}\n}';
    await writeFile(TEST_COMPOSER, content);

    const result = await readComposerJson(TEST_COMPOSER);
    expect(result?.indent).toBe('\t');
  });
});

describe('writeComposerJson', () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  test('updates require section', async () => {
    const content = {
      require: {
        'vendor/package': '^1.0',
      },
    };
    await writeFile(TEST_COMPOSER, JSON.stringify(content, null, 4));

    const updates: PackageInfo[] = [
      {
        name: 'vendor/package',
        currentVersion: '^1.0',
        latestVersion: '1.5.0',
        diffType: 'minor',
        releaseTime: new Date().toISOString(),
        age: '1 d',
        ageMonths: 0,
      },
    ];

    await writeComposerJson(TEST_COMPOSER, updates, false);

    const newContent = JSON.parse(await readFile(TEST_COMPOSER, 'utf-8'));
    expect(newContent.require['vendor/package']).toBe('^1.5.0');
  });

  test('updates require-dev section', async () => {
    const content = {
      'require-dev': {
        'vendor/dev-package': '~2.0',
      },
    };
    await writeFile(TEST_COMPOSER, JSON.stringify(content, null, 4));

    const updates: PackageInfo[] = [
      {
        name: 'vendor/dev-package',
        currentVersion: '~2.0',
        latestVersion: '2.5.0',
        diffType: 'minor',
        releaseTime: new Date().toISOString(),
        age: '2 d',
        ageMonths: 0,
      },
    ];

    await writeComposerJson(TEST_COMPOSER, updates, false);

    const newContent = JSON.parse(await readFile(TEST_COMPOSER, 'utf-8'));
    expect(newContent['require-dev']['vendor/dev-package']).toBe('~2.5.0');
  });

  test('preserves OR constraint branches when writing', async () => {
    const content = {
      require: {
        'vendor/package': '^1.0 || ^2.0',
      },
    };
    await writeFile(TEST_COMPOSER, JSON.stringify(content, null, 4));

    const updates: PackageInfo[] = [
      {
        name: 'vendor/package',
        currentVersion: '^1.0 || ^2.0',
        latestVersion: '2.5.0',
        diffType: 'minor',
        releaseTime: new Date().toISOString(),
        age: '1 d',
        ageMonths: 0,
      },
    ];

    await writeComposerJson(TEST_COMPOSER, updates, false);

    const newContent = JSON.parse(await readFile(TEST_COMPOSER, 'utf-8'));
    expect(newContent.require['vendor/package']).toBe('^1.0 || ^2.5.0');
  });

  test('preserves indentation', async () => {
    const content = '{\n  "require": {\n    "vendor/package": "^1.0"\n  }\n}';
    await writeFile(TEST_COMPOSER, content);

    const updates: PackageInfo[] = [
      {
        name: 'vendor/package',
        currentVersion: '^1.0',
        latestVersion: '1.5.0',
        diffType: 'minor',
        releaseTime: new Date().toISOString(),
        age: '1 d',
        ageMonths: 0,
      },
    ];

    await writeComposerJson(TEST_COMPOSER, updates, false);

    const newContent = await readFile(TEST_COMPOSER, 'utf-8');
    expect(newContent.includes('  "require"')).toBe(true);
  });

  test('preserves extra.packlift.exclude config', async () => {
    const content = {
      require: {
        'vendor/package': '^1.0',
      },
      extra: {
        packlift: {
          exclude: ['vendor/ignored-package'],
        },
      },
    };
    await writeFile(TEST_COMPOSER, JSON.stringify(content, null, 4));

    const updates: PackageInfo[] = [
      {
        name: 'vendor/package',
        currentVersion: '^1.0',
        latestVersion: '1.5.0',
        diffType: 'minor',
        releaseTime: new Date().toISOString(),
        age: '1 d',
        ageMonths: 0,
      },
    ];

    await writeComposerJson(TEST_COMPOSER, updates, false);

    const newContent = JSON.parse(await readFile(TEST_COMPOSER, 'utf-8'));
    expect(newContent.extra.packlift.exclude).toEqual(['vendor/ignored-package']);
  });

  test('dry run does not write file', async () => {
    const content = {
      require: {
        'vendor/package': '^1.0',
      },
    };
    await writeFile(TEST_COMPOSER, JSON.stringify(content, null, 4));

    const updates: PackageInfo[] = [
      {
        name: 'vendor/package',
        currentVersion: '^1.0',
        latestVersion: '1.5.0',
        diffType: 'minor',
        releaseTime: new Date().toISOString(),
        age: '1 d',
        ageMonths: 0,
      },
    ];

    await writeComposerJson(TEST_COMPOSER, updates, true);

    const newContent = JSON.parse(await readFile(TEST_COMPOSER, 'utf-8'));
    expect(newContent.require['vendor/package']).toBe('^1.0');
  });

  test('returns false for non-existent file', async () => {
    const updates: PackageInfo[] = [];
    const result = await writeComposerJson('/nonexistent/composer.json', updates, false);
    expect(result).toBe(false);
  });

  test('does not leave temporary files behind after writing', async () => {
    const content = {
      require: {
        'vendor/package': '^1.0',
      },
    };
    await writeFile(TEST_COMPOSER, JSON.stringify(content, null, 4));

    const updates: PackageInfo[] = [
      {
        name: 'vendor/package',
        currentVersion: '^1.0',
        latestVersion: '1.5.0',
        diffType: 'minor',
        releaseTime: new Date().toISOString(),
        age: '1 d',
        ageMonths: 0,
      },
    ];

    const result = await writeComposerJson(TEST_COMPOSER, updates, false);
    const files = await readdir(TEST_DIR);

    expect(result).toBe(true);
    expect(files.some((file) => file.endsWith('.tmp'))).toBe(false);
  });
});

describe('runComposerUpdate', () => {
  test('returns false when composer is not available', async () => {
    const result = await runComposerUpdate('/nonexistent/directory');
    expect(result).toBe(false);
  });
});
