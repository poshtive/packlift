import semver from 'semver';
import type {
  FetchFailure,
  FetchFailureReason,
  PackagistResponse,
  PackagistVersion,
  Stability,
} from './types';
import { STABILITY_ORDER } from './types';
import { getVersionStability, normalizeVersion } from './utils/version';
import { getCacheEntry, setCache, touchCache, type CacheEntry } from './cache';
import { checkPhpCompatibility } from './utils/php';

const PACKAGIST_API = 'https://repo.packagist.org/p2';
const CACHE_VERSION = 1;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 250;

export interface FetchResult {
  latestVersion: string;
  releaseTime: string;
  phpRequirement?: string;
  majorVersion?: string;
  deprecated?: boolean;
  replacement?: string;
  phpIncompatible?: boolean;
  skippedVersion?: string;
  require?: Record<string, string>;
}

export interface FetchRequestOptions {
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
}

export interface FetchPackageOutcome {
  result: FetchResult | null;
  failure?: FetchFailure;
  usedStaleCache?: boolean;
}

export interface FetchBatchResult {
  results: Map<string, FetchResult>;
  failures: FetchFailure[];
  stalePackages: string[];
}

interface PackagistRequestSuccess {
  data?: PackagistResponse;
  notModified?: boolean;
  headers?: Headers;
}

interface PackagistRequestFailure {
  failure: FetchFailure;
}

type PackagistRequestResult = PackagistRequestSuccess | PackagistRequestFailure;

function createFailure(
  packageName: string,
  reason: FetchFailureReason,
  message: string,
): FetchFailure {
  return { packageName, reason, message };
}

function isRetryableReason(reason: FetchFailureReason): boolean {
  return reason === 'timeout' || reason === 'network' || reason === 'rate-limited' || reason === 'server-error';
}

function isPackagistResponse(value: unknown): value is PackagistResponse {
  if (!value || typeof value !== 'object') return false;

  const packages = (value as { packages?: unknown }).packages;
  return Boolean(packages && typeof packages === 'object' && !Array.isArray(packages));
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'network request failed';
}

function isAbortError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'name' in error && error.name === 'AbortError');
}

function getRetryDelay(response: Response, defaultDelay: number): number {
  const retryAfter = response.headers.get('Retry-After');
  if (!retryAfter) return defaultDelay;

  const seconds = Number(retryAfter);
  if (!Number.isFinite(seconds)) return defaultDelay;

  return Math.min(10_000, Math.max(0, seconds * 1_000));
}

async function wait(delayMs: number): Promise<void> {
  if (delayMs <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function requestPackagist(
  packageName: string,
  url: string,
  headers: Record<string, string>,
  options: FetchRequestOptions,
): Promise<PackagistRequestResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = Math.max(0, options.maxRetries ?? DEFAULT_MAX_RETRIES);
  const retryDelayMs = Math.max(0, options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS);

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { headers, signal: controller.signal });

      if (response.status === 304) {
        return { notModified: true };
      }

      if (response.ok) {
        let body: unknown;
        try {
          body = await response.json();
        } catch {
          return {
            failure: createFailure(
              packageName,
              'invalid-response',
              'Packagist returned invalid JSON',
            ),
          };
        }

        if (!isPackagistResponse(body)) {
          return {
            failure: createFailure(
              packageName,
              'invalid-response',
              'Packagist returned an unexpected response shape',
            ),
          };
        }

        return { data: body, headers: response.headers };
      }

      const reason: FetchFailureReason =
        response.status === 429
          ? 'rate-limited'
          : response.status >= 500
            ? 'server-error'
            : response.status === 404
              ? 'not-found'
              : 'http-error';
      const failure = createFailure(
        packageName,
        reason,
        `Packagist returned HTTP ${response.status}`,
      );

      if (isRetryableReason(reason) && attempt < maxRetries) {
        await wait(getRetryDelay(response, retryDelayMs));
        continue;
      }

      return { failure };
    } catch (error) {
      const reason: FetchFailureReason = isAbortError(error) ? 'timeout' : 'network';
      const failure = createFailure(
        packageName,
        reason,
        isAbortError(error) ? `Request timed out after ${timeoutMs} ms` : getErrorMessage(error),
      );

      if (attempt < maxRetries) {
        await wait(retryDelayMs);
        continue;
      }

      return { failure };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return {
    failure: createFailure(packageName, 'network', 'network request failed'),
  };
}

function canUseStaleCache(failure: FetchFailure): boolean {
  return isRetryableReason(failure.reason);
}

/**
 * Fetches package metadata and retains the reason when retrieval fails.
 */
export async function fetchPackageDetailed(
  packageName: string,
  minStability: Stability = 'stable',
  preferStable: boolean = true,
  currentVersion?: string,
  allowMajor: boolean = true,
  noCache: boolean = false,
  projectPhp?: string,
  requestOptions: FetchRequestOptions = {},
): Promise<FetchPackageOutcome> {
  const cacheKey = packageName.replace('/', '_');
  let cachedEntry: CacheEntry<PackagistResponse> | null = null;
  const headers: Record<string, string> = {};

  if (!noCache) {
    cachedEntry = await getCacheEntry<PackagistResponse>(cacheKey, CACHE_VERSION);
    if (cachedEntry?.lastModified) {
      headers['If-Modified-Since'] = cachedEntry.lastModified;
    }
    if (cachedEntry?.etag) {
      headers['If-None-Match'] = cachedEntry.etag;
    }
  }

  try {
    const url = `${PACKAGIST_API}/${packageName}.json`;
    const request = await requestPackagist(packageName, url, headers, requestOptions);
    let data: PackagistResponse;
    let usedStaleCache = false;

    if ('notModified' in request && request.notModified) {
      if (!cachedEntry) {
        return {
          result: null,
          failure: createFailure(packageName, 'invalid-response', 'Packagist returned 304 without cached metadata'),
        };
      }
      data = cachedEntry.value;
      await touchCache(cacheKey, CACHE_VERSION);
    } else if ('data' in request && request.data) {
      data = request.data;
      if (!noCache) {
        const lastModified = request.headers?.get('Last-Modified') || undefined;
        const etag = request.headers?.get('ETag') || undefined;
        await setCache(cacheKey, data, CACHE_VERSION, { lastModified, etag });
      }
    } else if ('failure' in request && cachedEntry && canUseStaleCache(request.failure)) {
      data = cachedEntry.value;
      usedStaleCache = true;
    } else if ('failure' in request) {
      return { result: null, failure: request.failure };
    } else {
      return {
        result: null,
        failure: createFailure(packageName, 'invalid-response', 'Packagist returned no metadata'),
      };
    }

    const rawVersions = data.packages?.[packageName];
    if (rawVersions !== undefined && !Array.isArray(rawVersions)) {
      return {
        result: null,
        failure: createFailure(packageName, 'invalid-response', 'Packagist returned invalid package versions'),
      };
    }

    const versions: PackagistVersion[] = rawVersions ?? [];
    if (versions.length === 0) {
      return {
        result: null,
        failure: createFailure(packageName, 'no-versions', 'No package versions were found in Packagist metadata'),
      };
    }

    const minLevel = STABILITY_ORDER[minStability];
    const eligibleVersions = versions.filter((version) => {
      const stability = getVersionStability(version.version);
      return STABILITY_ORDER[stability] >= minLevel;
    });

    if (eligibleVersions.length === 0) {
      const first = versions[0];
      if (!first) {
        return {
          result: null,
          failure: createFailure(packageName, 'no-versions', 'No eligible package versions were found'),
        };
      }
      return {
        result: { latestVersion: first.version, releaseTime: first.time },
        usedStaleCache,
      };
    }

    let selectedVersion: PackagistVersion | null = null;

    if (preferStable) {
      const stableVersions = eligibleVersions.filter(
        (version) => getVersionStability(version.version) === 'stable',
      );
      if (stableVersions.length > 0) {
        selectedVersion = stableVersions[0] ?? null;
      }
    }

    if (!selectedVersion) {
      selectedVersion = eligibleVersions[0] ?? null;
    }

    if (!selectedVersion) {
      return {
        result: null,
        failure: createFailure(packageName, 'no-versions', 'No eligible package versions were found'),
      };
    }

    let phpIncompatible = false;
    let skippedVersion: string | undefined;

    if (projectPhp && selectedVersion.require?.php) {
      const phpCheck = checkPhpCompatibility(projectPhp, selectedVersion.require.php);
      if (!phpCheck.satisfied) {
        phpIncompatible = true;
        skippedVersion = selectedVersion.version;

        const versionsToCheck = preferStable
          ? eligibleVersions.filter((version) => getVersionStability(version.version) === 'stable')
          : eligibleVersions;

        const compatibleVersion = versionsToCheck.find((version) => {
          if (!version.require?.php) return true;
          return checkPhpCompatibility(projectPhp, version.require.php).satisfied;
        });

        if (compatibleVersion && compatibleVersion !== selectedVersion) {
          selectedVersion = compatibleVersion;
        }
      }
    }

    const phpRequirement = selectedVersion.require?.php;
    let majorDetected: string | undefined;

    if (currentVersion) {
      const currentNorm = normalizeVersion(currentVersion);
      const selectedNorm = normalizeVersion(selectedVersion.version);

      if (currentNorm && selectedNorm) {
        const currentMajor = semver.major(currentNorm);
        const selectedMajor = semver.major(selectedNorm);

        if (selectedMajor > currentMajor) {
          majorDetected = selectedVersion.version;

          if (!allowMajor) {
            const versionsToCheck = preferStable
              ? eligibleVersions.filter((version) => getVersionStability(version.version) === 'stable')
              : eligibleVersions;

            const sameMajorVersion = versionsToCheck.find((version) => {
              const norm = normalizeVersion(version.version);
              return norm && semver.major(norm) === currentMajor;
            });

            if (sameMajorVersion) {
              selectedVersion = sameMajorVersion;
            }
          }
        }
      }
    }

    const deprecatedInfo: { deprecated?: boolean; replacement?: string } = {};

    if (typeof selectedVersion.abandoned === 'string') {
      deprecatedInfo.deprecated = true;
      deprecatedInfo.replacement = selectedVersion.abandoned;
    } else if (selectedVersion.abandoned) {
      deprecatedInfo.deprecated = true;
    }

    return {
      result: {
        latestVersion: selectedVersion.version,
        releaseTime: selectedVersion.time,
        phpRequirement: selectedVersion.require?.php ?? phpRequirement,
        majorVersion: majorDetected,
        deprecated: deprecatedInfo.deprecated,
        replacement: deprecatedInfo.replacement,
        phpIncompatible: phpIncompatible || undefined,
        skippedVersion,
        require: selectedVersion.require,
      },
      usedStaleCache,
    };
  } catch (error) {
    return {
      result: null,
      failure: createFailure(packageName, 'network', getErrorMessage(error)),
    };
  }
}

/**
 * Fetches package metadata from the Packagist V2 API.
 */
export async function fetchPackage(
  packageName: string,
  minStability: Stability = 'stable',
  preferStable: boolean = true,
  currentVersion?: string,
  allowMajor: boolean = true,
  noCache: boolean = false,
  projectPhp?: string,
  requestOptions: FetchRequestOptions = {},
): Promise<FetchResult | null> {
  const outcome = await fetchPackageDetailed(
    packageName,
    minStability,
    preferStable,
    currentVersion,
    allowMajor,
    noCache,
    projectPhp,
    requestOptions,
  );
  return outcome.result;
}

/**
 * Fetches updates for all packages with bounded concurrency and diagnostics.
 */
export async function fetchAllPackagesDetailed(
  packages: Record<string, string>,
  minStability: Stability = 'stable',
  preferStable: boolean = true,
  allowMajor: boolean = true,
  noCache: boolean = false,
  projectPhp?: string,
  requestOptions: FetchRequestOptions = {},
): Promise<FetchBatchResult> {
  const results = new Map<string, FetchResult>();
  const failures: FetchFailure[] = [];
  const stalePackages: string[] = [];
  const entries = Object.entries(packages);
  const CONCURRENCY = 5;

  for (let i = 0; i < entries.length; i += CONCURRENCY) {
    const batch = entries.slice(i, i + CONCURRENCY);
    const outcomes = await Promise.all(
      batch.map(async ([name, version]) => ({
        name,
        outcome: await fetchPackageDetailed(
          name,
          minStability,
          preferStable,
          version,
          allowMajor,
          noCache,
          projectPhp,
          requestOptions,
        ),
      })),
    );

    for (const { name, outcome } of outcomes) {
      if (outcome.result) results.set(name, outcome.result);
      if (outcome.failure) failures.push(outcome.failure);
      if (outcome.usedStaleCache) stalePackages.push(name);
    }
  }

  return { results, failures, stalePackages };
}

/**
 * Backwards-compatible map-only wrapper for callers that do not need diagnostics.
 */
export async function fetchAllPackages(
  packages: Record<string, string>,
  minStability: Stability = 'stable',
  preferStable: boolean = true,
  allowMajor: boolean = true,
  noCache: boolean = false,
  projectPhp?: string,
  requestOptions: FetchRequestOptions = {},
): Promise<Map<string, FetchResult>> {
  const batch = await fetchAllPackagesDetailed(
    packages,
    minStability,
    preferStable,
    allowMajor,
    noCache,
    projectPhp,
    requestOptions,
  );
  return batch.results;
}
