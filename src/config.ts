import type { ComposerJson } from './types';

function normalizeExcludeList(excludes: string[]): string[] {
  return [...new Set(excludes.map((value) => value.trim().toLowerCase()).filter(Boolean))];
}

export function getComposerExcludeList(composer: ComposerJson): string[] {
  const excludes = composer.extra?.packlift?.exclude;
  if (!Array.isArray(excludes)) return [];

  const validExcludes = excludes.filter((value): value is string => typeof value === 'string');
  return normalizeExcludeList(validExcludes);
}

export function mergeExcludeLists(fileExcludes: string[], cliExcludes: string[]): string[] {
  return normalizeExcludeList([...fileExcludes, ...cliExcludes]);
}

export function filterComposerPackages(
  allPackages: Record<string, string>,
  excludes: string[],
): {
  filteredPackages: Record<string, string>;
  ignoredPackages: string[];
} {
  const excludeSet = new Set(normalizeExcludeList(excludes));
  const filteredPackages: Record<string, string> = {};
  const ignoredPackages: string[] = [];

  for (const [name, version] of Object.entries(allPackages)) {
    if (name === 'php' || name.startsWith('ext-')) continue;

    if (excludeSet.has(name.toLowerCase())) {
      ignoredPackages.push(name);
      continue;
    }

    filteredPackages[name] = version;
  }

  return { filteredPackages, ignoredPackages };
}
