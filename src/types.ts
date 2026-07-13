/**
 * Package update information displayed in the table
 */
export interface PackageInfo {
  name: string;
  currentVersion: string;
  latestVersion: string;
  diffType: 'major' | 'minor' | 'patch';
  releaseTime: string;
  age: string;
  ageMonths: number;
  majorAvailable?: string;
  phpRequirement?: string;
  deprecated?: boolean;
  replacement?: string;
  phpIncompatible?: boolean;
  skippedVersion?: string;
}

/**
 * Deprecated package info displayed in warnings
 */
export interface DeprecatedPackage {
  name: string;
  currentVersion: string;
  replacement?: string;
}

/**
 * CLI options parsed from command line arguments
 */
export interface CLIOptions {
  write: boolean;
  install: boolean;
  interactive: boolean;
  major: boolean;
  minor: boolean;
  patch: boolean;
  exclude: string[];
  dryRun: boolean;
  noCache: boolean;
}

export interface PackliftConfig {
  exclude?: string[];
  [key: string]: unknown;
}

export interface ComposerExtra {
  packlift?: PackliftConfig;
  [key: string]: unknown;
}

/**
 * Composer stability levels in order from least to most stable
 * @see https://getcomposer.org/doc/04-schema.md#minimum-stability
 */
export type Stability = 'dev' | 'alpha' | 'beta' | 'RC' | 'stable';

/**
 * Stability level weights for comparison
 */
export const STABILITY_ORDER: Record<Stability, number> = {
  dev: 0,
  alpha: 1,
  beta: 2,
  RC: 3,
  stable: 4,
};

/**
 * Version metadata from Packagist API
 */
export interface PackagistVersion {
  version: string;
  version_normalized: string;
  time: string;
  require?: Record<string, string>;
  abandoned?: boolean | string;
}

/**
 * Packagist V2 API response format
 */
export interface PackagistResponse {
  packages: {
    [key: string]: PackagistVersion[];
  };
}

/**
 * Parsed composer.json structure
 */
export interface ComposerJson {
  require?: Record<string, string>;
  'require-dev'?: Record<string, string>;
  'minimum-stability'?: Stability;
  'prefer-stable'?: boolean;
  extra?: ComposerExtra;
  [key: string]: unknown;
}
