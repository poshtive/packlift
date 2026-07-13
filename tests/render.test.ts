import { describe, test, expect, spyOn } from 'bun:test';
import {
  renderTable,
  renderHeader,
  renderFooter,
  formatPackageChoice,
  renderDeprecated,
  renderFetchFailures,
  renderStaleCache,
} from '../src/ui/render';
import type { PackageInfo, DeprecatedPackage, FetchFailure } from '../src/types';

describe('formatPackageChoice', () => {
  test('formats major update correctly', () => {
    const pkg: PackageInfo = {
      name: 'vendor/package',
      currentVersion: '^1.0',
      latestVersion: '2.0.0',
      diffType: 'major',
      releaseTime: new Date().toISOString(),
      age: '1 d',
      ageMonths: 0,
    };
    const result = formatPackageChoice(pkg);
    expect(result).toContain('vendor/package');
    expect(result).toContain('^1.0');
    expect(result).toContain('2.0.0');
    expect(result).toContain('1 d');
  });

  test('formats minor update correctly', () => {
    const pkg: PackageInfo = {
      name: 'vendor/package',
      currentVersion: '^1.0',
      latestVersion: '1.5.0',
      diffType: 'minor',
      releaseTime: new Date().toISOString(),
      age: '2 w',
      ageMonths: 0,
    };
    const result = formatPackageChoice(pkg);
    expect(result).toContain('vendor/package');
    expect(result).toContain('1.5.0');
  });

  test('formats patch update correctly', () => {
    const pkg: PackageInfo = {
      name: 'vendor/package',
      currentVersion: '^1.0.0',
      latestVersion: '1.0.5',
      diffType: 'patch',
      releaseTime: new Date().toISOString(),
      age: '3 mo',
      ageMonths: 3,
    };
    const result = formatPackageChoice(pkg);
    expect(result).toContain('1.0.5');
  });
  test('includes colored age in output', () => {
    const pkg: PackageInfo = {
      name: 'vendor/package',
      currentVersion: '^1.0',
      latestVersion: '2.0.0',
      diffType: 'major',
      releaseTime: new Date().toISOString(),
      age: '1 mo',
      ageMonths: 1,
    };
    const result = formatPackageChoice(pkg);
    expect(result).toContain('1 mo');
  });

  test('includes major version availability info', () => {
    const pkg: PackageInfo = {
      name: 'vendor/package',
      currentVersion: '^1.0',
      latestVersion: '1.5.0',
      diffType: 'minor',
      releaseTime: new Date().toISOString(),
      age: '1 mo',
      ageMonths: 1,
      majorAvailable: '2.0.0',
    };
    const result = formatPackageChoice(pkg);
    expect(result).toContain('2.0.0 available');
  });

  test('includes PHP requirement info', () => {
    const pkg: PackageInfo = {
      name: 'vendor/package',
      currentVersion: '^1.0',
      latestVersion: '1.5.0',
      diffType: 'minor',
      releaseTime: new Date().toISOString(),
      age: '1 mo',
      ageMonths: 1,
      phpRequirement: '>=8.1',
    };
    const result = formatPackageChoice(pkg);
    expect(result).toContain('php >=8.1');
  });

  test('includes deprecated info', () => {
    const pkg: PackageInfo = {
      name: 'vendor/package',
      currentVersion: '^1.0',
      latestVersion: '1.5.0',
      diffType: 'minor',
      releaseTime: new Date().toISOString(),
      age: '1 mo',
      ageMonths: 1,
      deprecated: true,
      replacement: 'vendor/new-package',
    };
    const result = formatPackageChoice(pkg);
    expect(result).toContain('deprecated');
    expect(result).toContain('vendor/new-package');
  });
});

describe('renderTable', () => {
  test('handles empty package list', () => {
    expect(() => renderTable([])).not.toThrow();
  });

  test('renders major update', () => {
    const packages: PackageInfo[] = [
      {
        name: 'vendor/package',
        currentVersion: '^1.0',
        latestVersion: '2.0.0',
        diffType: 'major',
        releaseTime: new Date().toISOString(),
        age: '1 d',
        ageMonths: 0,
      },
    ];
    expect(() => renderTable(packages)).not.toThrow();
  });

  test('renders minor update', () => {
    const packages: PackageInfo[] = [
      {
        name: 'vendor/package',
        currentVersion: '^1.0',
        latestVersion: '1.5.0',
        diffType: 'minor',
        releaseTime: new Date().toISOString(),
        age: '2 w',
        ageMonths: 0,
      },
    ];
    expect(() => renderTable(packages)).not.toThrow();
  });

  test('renders patch update', () => {
    const packages: PackageInfo[] = [
      {
        name: 'vendor/package',
        currentVersion: '^1.0.0',
        latestVersion: '1.0.5',
        diffType: 'patch',
        releaseTime: new Date().toISOString(),
        age: '3 mo',
        ageMonths: 3,
      },
    ];
    expect(() => renderTable(packages)).not.toThrow();
  });

  test('renders deprecated package with replacement', () => {
    const packages: PackageInfo[] = [
      {
        name: 'vendor/package',
        currentVersion: '^1.0.0',
        latestVersion: '1.0.5',
        diffType: 'patch',
        releaseTime: new Date().toISOString(),
        age: '3 mo',
        ageMonths: 3,
        deprecated: true,
        replacement: 'vendor/new-package',
      },
    ];
    expect(() => renderTable(packages)).not.toThrow();
  });
});

import pkg from '../package.json';

describe('renderHeader', () => {
  test('renders without error', () => {
    expect(() => renderHeader(pkg.version)).not.toThrow();
  });
});

describe('renderFooter', () => {
  test('renders with updates', () => {
    expect(() => renderFooter(true)).not.toThrow();
  });

  test('renders without updates', () => {
    expect(() => renderFooter(false)).not.toThrow();
  });
});

describe('renderDeprecated', () => {
  test('renders deprecated packages with replacement', () => {
    const logs: string[] = [];
    const spy = spyOn(console, 'log').mockImplementation((message?: string) => {
      if (typeof message === 'string') logs.push(message);
    });

    const packages: DeprecatedPackage[] = [
      { name: 'vendor/old-package', currentVersion: '^1.0', replacement: 'vendor/new-package' },
    ];

    renderDeprecated(packages);

    expect(logs.join('\n')).toContain('vendor/old-package');
    expect(logs.join('\n')).toContain('vendor/new-package');

    spy.mockRestore();
  });

  test('does nothing when list is empty', () => {
    const spy = spyOn(console, 'log');
    renderDeprecated([]);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('renderFetchFailures', () => {
  test('renders concise fetch diagnostics', () => {
    const logs: string[] = [];
    const spy = spyOn(console, 'log').mockImplementation((message?: string) => {
      if (typeof message === 'string') logs.push(message);
    });

    const failures: FetchFailure[] = [
      { packageName: 'vendor/package', reason: 'timeout', message: 'request timed out' },
    ];

    renderFetchFailures(failures);

    expect(logs.join('\n')).toContain('vendor/package');
    expect(logs.join('\n')).toContain('timed out');

    spy.mockRestore();
  });
});

describe('renderStaleCache', () => {
  test('renders stale cache usage', () => {
    const logs: string[] = [];
    const spy = spyOn(console, 'log').mockImplementation((message?: string) => {
      if (typeof message === 'string') logs.push(message);
    });

    renderStaleCache(['vendor/package']);

    expect(logs.join('\n')).toContain('vendor/package');
    expect(logs.join('\n')).toContain('cached');

    spy.mockRestore();
  });
});
