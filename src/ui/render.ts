import pc from 'picocolors';
import type { PackageInfo, DeprecatedPackage } from '../types';

/**
 * Colors the age based on how old the release is.
 */
function colorAge(age: string, ageMonths: number): string {
  if (ageMonths < 3) {
    return pc.green(age.padStart(6));
  } else if (ageMonths < 12) {
    return pc.yellow(age.padStart(6));
  } else {
    return pc.red(age.padStart(6));
  }
}

/**
 * Renders the package update table to stdout.
 */
export function renderTable(packages: PackageInfo[]): void {
  if (packages.length === 0) {
    console.log(pc.green('\n  ✓ All packages are up to date!\n'));
    return;
  }

  const nameWidth = Math.max(...packages.map((p) => p.name.length), 10);
  const oldWidth = Math.max(...packages.map((p) => p.currentVersion.length), 8);
  const newWidth = Math.max(...packages.map((p) => p.latestVersion.length), 8);

  console.log('');

  for (const pkg of packages) {
    const name = pc.bold(pkg.name.padEnd(nameWidth));
    const oldVer = pkg.currentVersion.padStart(oldWidth);
    const arrow = '→';
    const newVer = pkg.latestVersion.padEnd(newWidth);
    const age = colorAge(pkg.age, pkg.ageMonths);

    let diffLabel: string;
    let coloredNewVer: string;

    switch (pkg.diffType) {
      case 'major':
        diffLabel = pc.red('! major');
        coloredNewVer = pc.red(newVer);
        break;
      case 'minor':
        diffLabel = pc.cyan('~ minor');
        coloredNewVer = pc.cyan(newVer);
        break;
      case 'patch':
        diffLabel = pc.green('. patch');
        coloredNewVer = pc.green(newVer);
        break;
    }

    let extra = '';
    if (pkg.majorAvailable) {
      extra += pc.magenta(`  ${pkg.majorAvailable} available`);
    }
    if (pkg.phpRequirement) {
      extra += pc.gray(`  php ${pkg.phpRequirement}`);
    }
    if (pkg.phpIncompatible && pkg.skippedVersion) {
      extra += pc.yellow(`  ${pkg.skippedVersion} skipped (php)`);
    }
    if (pkg.deprecated) {
      extra += pc.red('  deprecated');
      if (pkg.replacement) {
        extra += pc.yellow(` → ${pkg.replacement}`);
      }
    }

    console.log(`  ${name}  ${oldVer}  ${arrow}  ${coloredNewVer}  ${diffLabel}  ${age}${extra}`);
  }

  const skippedPackages = packages.filter((p) => p.phpIncompatible && p.skippedVersion);
  if (skippedPackages.length > 0) {
    console.log(pc.yellow('\n  Some versions skipped due to PHP constraints:'));
    for (const pkg of skippedPackages) {
      console.log(`    ${pc.bold(pkg.name)} ${pkg.skippedVersion} requires higher PHP version`);
    }
    console.log(pc.gray('    Update the php constraint in composer.json to use these versions.'));
  }

  console.log('');
}

export function renderHeader(version: string): void {
  console.log('');
  console.log(pc.bold(`  packlift v${version}`), pc.gray(' —  Check for updates for composer.json'));
  console.log('');
}

export function renderFooter(hasUpdates: boolean): void {
  if (hasUpdates) {
    console.log(pc.gray('  Run "packlift -w" to write to composer.json'));
    console.log(pc.gray('  Run "packlift -i" to write and install'));
    console.log('');
  }
}

export function formatPackageChoice(pkg: PackageInfo): string {
  const arrow = '→';
  let diffLabel: string;
  let coloredNewVer: string;

  switch (pkg.diffType) {
    case 'major':
      diffLabel = pc.red('! major');
      coloredNewVer = pc.red(pkg.latestVersion);
      break;
    case 'minor':
      diffLabel = pc.cyan('~ minor');
      coloredNewVer = pc.cyan(pkg.latestVersion);
      break;
    case 'patch':
      diffLabel = pc.green('. patch');
      coloredNewVer = pc.green(pkg.latestVersion);
      break;
  }

  const age = colorAge(pkg.age, pkg.ageMonths);
  let extra = '';
  if (pkg.majorAvailable) {
    extra += pc.magenta(` ${pkg.majorAvailable} available`);
  }
  if (pkg.phpRequirement) {
    extra += pc.gray(` php ${pkg.phpRequirement}`);
  }
  if (pkg.phpIncompatible && pkg.skippedVersion) {
    extra += pc.yellow(` ${pkg.skippedVersion} skipped`);
  }
  if (pkg.deprecated) {
    extra += pc.red(' deprecated');
    if (pkg.replacement) {
      extra += pc.yellow(` → ${pkg.replacement}`);
    }
  }

  return `${pc.bold(pkg.name)} ${pkg.currentVersion} ${arrow} ${coloredNewVer} ${diffLabel} ${age}${extra}`;
}

export function renderDeprecated(packages: DeprecatedPackage[]): void {
  if (packages.length === 0) return;

  console.log(pc.yellow('  Deprecated packages detected:'));

  for (const pkg of packages) {
    const replacement = pkg.replacement ? pc.yellow(` → ${pkg.replacement}`) : '';
    console.log(
      `  ${pc.red('!')} ${pc.bold(pkg.name)} ${pc.gray(pkg.currentVersion)}${replacement}`,
    );
  }

  console.log('');
}
