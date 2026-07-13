import semver from 'semver';
import {
  composerConstraintsIntersect,
  normalizeComposerConstraint,
} from './constraint';

export { normalizeComposerConstraint } from './constraint';

export interface ConstraintCheckResult {
  satisfied: boolean;
  reason?: string;
}

/**
 * Extracts the minimum PHP version from a constraint.
 * Used to check if project PHP can satisfy package PHP requirements.
 */
export function extractMinVersion(constraint: string): string | null {
  const normalized = normalizeComposerConstraint(constraint);
  if (normalized === '*') return null;

  const orParts = normalized.split(/\s*\|\|\s*/);
  let minVersion: string | null = null;

  for (const part of orParts) {
    const coerced = semver.coerce(part.trim());
    if (coerced) {
      if (!minVersion || semver.lt(coerced.version, minVersion)) {
        minVersion = coerced.version;
      }
    }
  }

  return minVersion;
}

/**
 * Extracts the maximum PHP version allowed by a constraint.
 * Returns null if no upper bound or if constraint allows latest.
 */
export function extractMaxVersion(constraint: string): string | null {
  const normalized = normalizeComposerConstraint(constraint);
  if (normalized === '*') return null;

  const upperBoundMatch = normalized.match(/<(=?)\s*(\d+(?:\.\d+)*)/);
  if (upperBoundMatch) {
    const coerced = semver.coerce(upperBoundMatch[2]);
    return coerced ? coerced.version : null;
  }

  const caretMatch = normalized.match(/\^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (caretMatch) {
    const major = parseInt(caretMatch[1]!, 10);
    return `${major + 1}.0.0`;
  }

  return null;
}

/**
 * Checks if a project's PHP constraint can satisfy a package's PHP requirement.
 *
 * @param projectPhp - PHP constraint from project's composer.json (e.g., "^8.3")
 * @param packagePhp - PHP constraint required by package (e.g., "^7.2.5 || ^8.0")
 * @returns Result indicating if compatible and reason if not
 */
export function checkPhpCompatibility(
  projectPhp: string,
  packagePhp: string,
): ConstraintCheckResult {
  if (!packagePhp || packagePhp === '*') return { satisfied: true };
  if (!projectPhp) return { satisfied: true };

  const intersection = composerConstraintsIntersect(projectPhp, packagePhp);
  if (intersection !== null) {
    return intersection
      ? { satisfied: true }
      : { satisfied: false, reason: `requires php ${packagePhp}` };
  }

  const projectMin = extractMinVersion(projectPhp);
  if (!projectMin) return { satisfied: true };

  const packageNorm = normalizeComposerConstraint(packagePhp);
  const packageParts = packageNorm.split(/\s*\|\|\s*/).filter((p) => p.trim());

  for (const part of packageParts) {
    const partMax = extractMaxVersion(part);
    if (partMax && semver.gte(projectMin, partMax)) continue;

    try {
      const range = semver.validRange(part.trim());
      if (range && semver.satisfies(projectMin, range)) return { satisfied: true };
    } catch {}

    const partMin = extractMinVersion(part);
    if (partMin) {
      const partMajor = semver.major(partMin);
      const projectMajor = semver.major(projectMin);

      if (part.trim().startsWith('^')) {
        if (projectMajor === partMajor && semver.gte(projectMin, partMin)) {
          return { satisfied: true };
        }
      } else if (semver.gte(projectMin, partMin) && !partMax) {
        return { satisfied: true };
      }
    }
  }

  return { satisfied: false, reason: `requires php ${packagePhp}` };
}

/**
 * Checks if a constraint is satisfied by a version.
 * Used for checking if installed package versions satisfy upgrade requirements.
 */
export function isConstraintSatisfied(version: string, constraint: string): boolean {
  if (!constraint || constraint === '*') return true;

  const normalized = normalizeComposerConstraint(constraint);
  const coercedVersion = semver.coerce(version);
  if (!coercedVersion) return true;

  const parts = normalized.split(/\s*\|\|\s*/);

  for (const part of parts) {
    try {
      const range = semver.validRange(part.trim());
      if (range && semver.satisfies(coercedVersion.version, range)) return true;
    } catch {
      const partCoerced = semver.coerce(part);
      if (partCoerced) {
        const partMajor = semver.major(partCoerced.version);
        const versionMajor = semver.major(coercedVersion.version);
        if (part.startsWith('^') && versionMajor === partMajor) return true;
      }
    }
  }

  return false;
}
