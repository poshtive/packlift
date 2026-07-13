import semver from 'semver';

/**
 * Normalizes the Composer syntax that is shared by version and PHP constraints
 * into a form understood by semver.
 */
export function normalizeComposerConstraint(constraint: string): string {
  if (!constraint) return '*';

  let normalized = constraint.trim();

  normalized = normalized.replace(/\|\|/g, '<<<OR>>>');
  normalized = normalized.replace(/\|/g, '<<<OR>>>');
  normalized = normalized.replace(/<<<OR>>>/g, ' || ');
  normalized = normalized.replace(/\s*\|\|\s*/g, ' || ');
  normalized = normalized.replace(/,\s*/g, ' ');
  normalized = normalized.replace(/@(dev|alpha|beta|rc|stable)/gi, '');

  if (normalized === '*' || normalized.startsWith('ext-')) {
    return '*';
  }

  return normalized;
}

/**
 * Splits a Composer constraint into normalized OR branches.
 */
export function splitComposerConstraint(constraint: string): string[] {
  return normalizeComposerConstraint(constraint)
    .split(/\s*\|\|\s*/)
    .map((branch) => branch.trim())
    .filter(Boolean);
}

/**
 * Splits a constraint while retaining the original branch syntax for writes.
 */
export function splitRawComposerConstraint(constraint: string): string[] {
  return constraint
    .split(/\s*(?:\|\||\|)\s*/)
    .map((branch) => branch.trim())
    .filter(Boolean);
}

function toSemverRange(branch: string): string | null {
  const normalized = normalizeComposerConstraint(branch).trim();

  if (/^dev-/i.test(normalized) || /\.x-dev$/i.test(normalized)) {
    return '*';
  }

  const alias = normalized.match(/\s+as\s+(.+)$/i);
  const range = alias?.[1]?.trim() ?? normalized;

  try {
    return semver.validRange(range, { includePrerelease: true });
  } catch {
    return null;
  }
}

function toComparableVersion(version: string): string | null {
  const coerced = semver.coerce(version);
  return coerced?.version ?? null;
}

/**
 * Returns whether a version is allowed by one Composer constraint branch.
 */
export function composerBranchIncludesVersion(branch: string, version: string): boolean {
  const range = toSemverRange(branch);
  const normalizedVersion = toComparableVersion(version);

  if (!range || !normalizedVersion) return false;

  try {
    return semver.satisfies(normalizedVersion, range, { includePrerelease: true });
  } catch {
    return false;
  }
}

/**
 * Checks whether two Composer constraints have at least one compatible range.
 * Returns null when neither side can be represented as a semver range.
 */
export function composerConstraintsIntersect(left: string, right: string): boolean | null {
  const leftBranches = splitComposerConstraint(left);
  const rightBranches = splitComposerConstraint(right);
  let hadComparablePair = false;

  for (const leftBranch of leftBranches) {
    const leftRange = toSemverRange(leftBranch);
    if (!leftRange) continue;

    for (const rightBranch of rightBranches) {
      const rightRange = toSemverRange(rightBranch);
      if (!rightRange) continue;

      hadComparablePair = true;

      try {
        if (semver.intersects(leftRange, rightRange, { includePrerelease: true })) {
          return true;
        }
      } catch {
        // Try the remaining branches before falling back to a caller heuristic.
      }
    }
  }

  return hadComparablePair ? false : null;
}
