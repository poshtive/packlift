import { resolve } from 'path';
import pc from 'picocolors';
import type { PackageInfo, CLIOptions, Stability, DeprecatedPackage } from './types';
import { fetchAllPackagesDetailed } from './fetcher';
import { readComposerJson, writeComposerJson, runComposerUpdate } from './writer';
import { getDiffType } from './utils/version';
import { formatAge, getAgeMonths } from './utils/time';
import {
  renderHeader,
  renderTable,
  renderFooter,
  renderDeprecated,
  renderFetchFailures,
  renderStaleCache,
} from './ui/render';
import { selectPackages } from './interactive';
import { getComposerExcludeList, mergeExcludeLists, filterComposerPackages } from './config';
import pkg from '../package.json';

export async function run(options: CLIOptions): Promise<void> {
  renderHeader(pkg.version);

  const composerPath = resolve(process.cwd(), 'composer.json');
  const composer = await readComposerJson(composerPath);

  if (!composer) {
    console.error(pc.red('  ✗ Could not read composer.json'));
    process.exit(1);
  }

  const minStability: Stability = composer.content['minimum-stability'] ?? 'stable';
  const preferStable: boolean = composer.content['prefer-stable'] === true;

  const allPackages = {
    ...composer.content.require,
    ...composer.content['require-dev'],
  };

  const fileExcludes = getComposerExcludeList(composer.content);
  const excludes = mergeExcludeLists(fileExcludes, options.exclude);
  const { filteredPackages, ignoredPackages } = filterComposerPackages(allPackages, excludes);

  console.log(pc.gray(`  Checking ${Object.keys(filteredPackages).length} packages...`));
  if (ignoredPackages.length > 0) {
    console.log(pc.gray(`  Ignoring ${ignoredPackages.length} package${ignoredPackages.length === 1 ? '' : 's'} from exclude list...`));
  }
  console.log(pc.gray(`  Stability: ${minStability}${preferStable ? ' (prefer-stable)' : ''}\n`));

  const projectPhp = allPackages['php'];

  const fetchBatch = await fetchAllPackagesDetailed(
    filteredPackages,
    minStability,
    preferStable,
    options.major,
    options.noCache,
    projectPhp,
  );
  const results = fetchBatch.results;

  const updates: PackageInfo[] = [];
  const deprecatedPackages: DeprecatedPackage[] = [];

  for (const [name, currentVersion] of Object.entries(filteredPackages)) {
    const result = results.get(name);
    if (!result) continue;

    if (result.deprecated) {
      deprecatedPackages.push({
        name,
        currentVersion,
        replacement: result.replacement,
      });
    }

    const diffType = getDiffType(currentVersion, result.latestVersion);
    if (!diffType) continue;

    if (diffType === 'major' && !options.major) continue;
    if (diffType === 'minor' && !options.minor) continue;
    if (diffType === 'patch' && !options.patch) continue;

    const majorAvailable = !options.major && result.majorVersion ? result.majorVersion : undefined;

    updates.push({
      name,
      currentVersion,
      latestVersion: result.latestVersion,
      diffType,
      releaseTime: result.releaseTime,
      age: formatAge(result.releaseTime),
      ageMonths: getAgeMonths(result.releaseTime),
      majorAvailable,
      phpRequirement: result.phpRequirement,
      deprecated: result.deprecated,
      replacement: result.replacement,
      phpIncompatible: result.phpIncompatible,
      skippedVersion: result.skippedVersion,
    });
  }

  const order = { major: 0, minor: 1, patch: 2 };
  updates.sort((a, b) => order[a.diffType] - order[b.diffType]);

  if (updates.length > 0 || fetchBatch.failures.length === 0) {
    renderTable(updates);
  }
  renderDeprecated(deprecatedPackages);
  renderFetchFailures(fetchBatch.failures);
  renderStaleCache(fetchBatch.stalePackages);

  if (updates.length === 0) return;

  let selectedUpdates = updates;
  if (options.interactive) {
    selectedUpdates = await selectPackages(updates);
    if (selectedUpdates.length === 0) {
      console.log(pc.gray('  No packages selected.\n'));
      return;
    }
  }

  if (options.write || options.install) {
    const success = await writeComposerJson(composerPath, selectedUpdates, options.dryRun);
    if (!success) {
      console.error(pc.red('  ✗ Failed to update composer.json'));
      process.exit(1);
    }

    if (!options.dryRun) {
      console.log(pc.green('  ✓ Updated composer.json'));
      if (options.write && !options.install) {
        console.log(pc.gray('\n  Run "composer update" to install the new versions\n'));
      } else {
        console.log('');
      }
    }
  }

  if (options.install && !options.dryRun) {
    console.log(pc.gray('  Running composer update...\n'));
    const success = await runComposerUpdate(process.cwd());
    if (success) {
      console.log(pc.green('\n  ✓ Dependencies updated successfully!\n'));
    } else {
      console.error(pc.red('\n  ✗ Failed to run composer update\n'));
      process.exit(1);
    }
  }

  if (!options.write && !options.install) {
    renderFooter(true);
  }
}
