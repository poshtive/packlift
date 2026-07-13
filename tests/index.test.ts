import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import os from 'node:os';
import path from 'node:path';
import { run } from '../src/index';
import type { CLIOptions } from '../src/types';

const DEFAULT_OPTIONS: CLIOptions = {
  write: false,
  install: false,
  interactive: false,
  major: false,
  minor: true,
  patch: true,
  exclude: [],
  dryRun: false,
  noCache: true,
};

describe('run', () => {
  const originalFetch = globalThis.fetch;
  const originalCwd = process.cwd();
  const originalPath = process.env.PATH;

  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'packlift-run-'));
    process.chdir(tempDir);
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    process.env.PATH = originalPath;
    process.chdir(originalCwd);
    await rm(tempDir, { recursive: true, force: true });
  });

  test('does not implicitly prefer stable releases when prefer-stable is absent', async () => {
    await writeFile(
      path.join(tempDir, 'composer.json'),
      JSON.stringify(
        {
          require: {
            'vendor/package': '^1.0.0',
          },
          'minimum-stability': 'beta',
        },
        null,
        2,
      ),
    );

    // @ts-expect-error test mock typing
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () =>
          Promise.resolve({
            packages: {
              'vendor/package': [
                {
                  version: '1.6.0-beta',
                  version_normalized: '1.6.0.0-beta',
                  time: '2024-02-01T12:00:00+00:00',
                },
                {
                  version: '1.5.0',
                  version_normalized: '1.5.0.0',
                  time: '2024-01-01T12:00:00+00:00',
                },
              ],
            },
          }),
      }),
    );

    const logSpy = spyOn(console, 'log').mockImplementation(() => {});

    await run(DEFAULT_OPTIONS);

    const output = logSpy.mock.calls
      .flatMap((call) => call.map((value) => String(value)))
      .join('\n');

    expect(output).toContain('1.6.0-beta');
    expect(output).not.toContain('1.5.0');

    logSpy.mockRestore();
  });

  test('stops before composer update when composer.json cannot be written', async () => {
    const lockedDir = path.join(tempDir, 'locked');
    await mkdir(lockedDir, { recursive: true });

    const composerPath = path.join(lockedDir, 'composer.json');
    await writeFile(
      composerPath,
      JSON.stringify(
        {
          require: {
            'vendor/package': '^1.0.0',
          },
        },
        null,
        2,
      ),
    );
    process.chdir(lockedDir);
    await chmod(lockedDir, 0o555);

    const binDir = path.join(tempDir, 'bin');
    const markerPath = path.join(tempDir, 'composer-ran');
    await mkdir(binDir, { recursive: true });
    await writeFile(
      path.join(binDir, 'composer'),
      `#!/bin/sh\necho ran > "${markerPath}"\nexit 0\n`,
      { mode: 0o755 },
    );
    process.env.PATH = `${binDir}:${originalPath}`;

    // @ts-expect-error test mock typing
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () =>
          Promise.resolve({
            packages: {
              'vendor/package': [
                {
                  version: '1.5.0',
                  version_normalized: '1.5.0.0',
                  time: '2024-01-01T12:00:00+00:00',
                },
              ],
            },
          }),
      }),
    );

    const exitSpy = spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`EXIT:${code ?? 0}`);
    }) as never);
    const logSpy = spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      run({
        ...DEFAULT_OPTIONS,
        write: true,
        install: true,
      }),
    ).rejects.toThrow('EXIT:1');

    await expect(readFile(markerPath, 'utf-8')).rejects.toThrow();

    await chmod(lockedDir, 0o755);

    exitSpy.mockRestore();
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
