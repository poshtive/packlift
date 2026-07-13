import { describe, test, expect } from 'bun:test';
import {
  parseConstraint,
  normalizeVersion,
  getDiffType,
  formatNewVersion,
  isDevVersion,
  normalizeVersionString,
  getVersionStability,
  meetsStabilityRequirement,
} from '../src/utils/version';

describe('parseConstraint', () => {
  describe('dev versions', () => {
    test('parses dev-main', () => {
      const result = parseConstraint('dev-main');
      expect(result.type).toBe('dev');
      expect(result.prefix).toBe('dev-');
      expect(result.baseVersion).toBe('main');
      expect(result.isDev).toBe(true);
    });

    test('parses dev-master', () => {
      const result = parseConstraint('dev-master');
      expect(result.type).toBe('dev');
      expect(result.baseVersion).toBe('master');
    });

    test('parses dev-feature/xyz', () => {
      const result = parseConstraint('dev-feature/my-branch');
      expect(result.type).toBe('dev');
      expect(result.baseVersion).toBe('feature/my-branch');
    });

    test('parses 1.x-dev', () => {
      const result = parseConstraint('1.x-dev');
      expect(result.type).toBe('dev');
      expect(result.isDev).toBe(true);
    });

    test('parses v2.x-dev', () => {
      const result = parseConstraint('v2.x-dev');
      expect(result.type).toBe('dev');
    });

    test('parses inline alias: dev-main as 1.0.0', () => {
      const result = parseConstraint('dev-main as 1.0.0');
      expect(result.type).toBe('dev');
      expect(result.baseVersion).toBe('1.0.0');
      expect(result.isDev).toBe(true);
    });
  });

  describe('caret constraints', () => {
    test('parses ^1.2.3', () => {
      const result = parseConstraint('^1.2.3');
      expect(result.type).toBe('caret');
      expect(result.prefix).toBe('^');
      expect(result.baseVersion).toBe('1.2.3');
    });

    test('parses ^0.3', () => {
      const result = parseConstraint('^0.3');
      expect(result.type).toBe('caret');
      expect(result.baseVersion).toBe('0.3');
    });

    test('parses ^10.0', () => {
      const result = parseConstraint('^10.0');
      expect(result.type).toBe('caret');
      expect(result.baseVersion).toBe('10.0');
    });
  });

  describe('tilde constraints', () => {
    test('parses ~1.2', () => {
      const result = parseConstraint('~1.2');
      expect(result.type).toBe('tilde');
      expect(result.prefix).toBe('~');
      expect(result.baseVersion).toBe('1.2');
    });

    test('parses ~1.2.3', () => {
      const result = parseConstraint('~1.2.3');
      expect(result.type).toBe('tilde');
      expect(result.baseVersion).toBe('1.2.3');
    });
  });

  describe('wildcard constraints', () => {
    test('parses 1.0.*', () => {
      const result = parseConstraint('1.0.*');
      expect(result.type).toBe('wildcard');
      expect(result.baseVersion).toBe('1.0');
    });

    test('parses 2.*', () => {
      const result = parseConstraint('2.*');
      expect(result.type).toBe('wildcard');
      expect(result.baseVersion).toBe('2');
    });

    test('parses 1.*.*', () => {
      const result = parseConstraint('1.*.*');
      expect(result.type).toBe('wildcard');
      expect(result.baseVersion).toBe('1');
    });
  });

  describe('hyphenated range constraints', () => {
    test('parses 1.0 - 2.0', () => {
      const result = parseConstraint('1.0 - 2.0');
      expect(result.type).toBe('hyphen');
      expect(result.baseVersion).toBe('1.0');
    });

    test('parses 1.0.0 - 2.1.0', () => {
      const result = parseConstraint('1.0.0 - 2.1.0');
      expect(result.type).toBe('hyphen');
      expect(result.baseVersion).toBe('1.0.0');
    });
  });

  describe('range constraints', () => {
    test('parses >=1.0', () => {
      const result = parseConstraint('>=1.0');
      expect(result.type).toBe('range');
      expect(result.prefix).toBe('>=');
      expect(result.baseVersion).toBe('1.0');
    });

    test('parses >=1.0 <2.0', () => {
      const result = parseConstraint('>=1.0 <2.0');
      expect(result.type).toBe('range');
      expect(result.baseVersion).toBe('1.0');
    });

    test('parses >1.0', () => {
      const result = parseConstraint('>1.0');
      expect(result.type).toBe('range');
      expect(result.prefix).toBe('>');
    });

    test('parses <2.0', () => {
      const result = parseConstraint('<2.0');
      expect(result.type).toBe('range');
      expect(result.prefix).toBe('<');
    });

    test('parses !=1.5.0', () => {
      const result = parseConstraint('!=1.5.0');
      expect(result.type).toBe('range');
      expect(result.prefix).toBe('!=');
    });
  });

  describe('exact constraints', () => {
    test('parses 1.0.2', () => {
      const result = parseConstraint('1.0.2');
      expect(result.type).toBe('exact');
      expect(result.prefix).toBe('');
      expect(result.baseVersion).toBe('1.0.2');
    });

    test('parses v1.0.2', () => {
      const result = parseConstraint('v1.0.2');
      expect(result.type).toBe('exact');
      expect(result.baseVersion).toBe('1.0.2');
    });
  });
});

describe('normalizeVersionString', () => {
  test('removes v prefix', () => {
    expect(normalizeVersionString('v1.2.3')).toBe('1.2.3');
  });

  test('removes V prefix (uppercase)', () => {
    expect(normalizeVersionString('V1.2.3')).toBe('1.2.3');
  });

  test('removes @dev suffix', () => {
    expect(normalizeVersionString('1.2.3@dev')).toBe('1.2.3');
  });

  test('removes @stable suffix', () => {
    expect(normalizeVersionString('1.2.3@stable')).toBe('1.2.3');
  });

  test('removes @beta suffix', () => {
    expect(normalizeVersionString('1.2.3@beta')).toBe('1.2.3');
  });

  test('trims whitespace', () => {
    expect(normalizeVersionString('  1.2.3  ')).toBe('1.2.3');
  });
});

describe('isDevVersion', () => {
  test('returns true for dev-main', () => {
    expect(isDevVersion('dev-main')).toBe(true);
  });

  test('returns true for dev-master', () => {
    expect(isDevVersion('dev-master')).toBe(true);
  });

  test('returns true for 1.x-dev', () => {
    expect(isDevVersion('1.x-dev')).toBe(true);
  });

  test('returns true for version with -dev suffix', () => {
    expect(isDevVersion('2.0-dev')).toBe(true);
  });

  test('returns true for inline alias', () => {
    expect(isDevVersion('dev-main as 1.0.0')).toBe(true);
  });

  test('returns true for alpha version', () => {
    expect(isDevVersion('1.0.0-alpha')).toBe(true);
  });

  test('returns true for beta version', () => {
    expect(isDevVersion('1.0.0-beta')).toBe(true);
  });

  test('returns true for RC version', () => {
    expect(isDevVersion('1.0.0-rc1')).toBe(true);
  });

  test('returns false for stable version', () => {
    expect(isDevVersion('1.0.0')).toBe(false);
  });

  test('returns false for caret constraint', () => {
    expect(isDevVersion('^1.0.0')).toBe(false);
  });
});

describe('normalizeVersion', () => {
  test('normalizes caret constraint', () => {
    expect(normalizeVersion('^1.2.3')).toBe('1.2.3');
  });

  test('normalizes tilde constraint', () => {
    expect(normalizeVersion('~1.2')).toBe('1.2.0');
  });

  test('normalizes v prefix', () => {
    expect(normalizeVersion('v2.0.0')).toBe('2.0.0');
  });

  test('returns null for dev-main', () => {
    expect(normalizeVersion('dev-main')).toBeNull();
  });

  test('handles inline alias', () => {
    expect(normalizeVersion('dev-main as 1.0.0')).toBe('1.0.0');
  });

  test('normalizes wildcard constraint', () => {
    expect(normalizeVersion('1.0.*')).toBe('1.0.0');
  });

  test('normalizes range constraint', () => {
    expect(normalizeVersion('>=1.0')).toBe('1.0.0');
  });
});

describe('getDiffType', () => {
  test('returns major for major version bump', () => {
    expect(getDiffType('^1.0', '2.0.0')).toBe('major');
  });

  test('returns minor for minor version bump', () => {
    expect(getDiffType('^1.0', '1.5.0')).toBe('minor');
  });

  test('returns patch for patch version bump', () => {
    expect(getDiffType('^1.0.0', '1.0.5')).toBe('patch');
  });

  test('returns null for no update needed', () => {
    expect(getDiffType('^1.0.0', '1.0.0')).toBeNull();
  });

  test('returns null for dev versions', () => {
    expect(getDiffType('dev-main', '2.0.0')).toBeNull();
  });

  test('handles v prefix in latest version', () => {
    expect(getDiffType('^10.0', 'v12.0.0')).toBe('major');
  });

  test('handles tilde constraint', () => {
    expect(getDiffType('~1.2', '1.3.0')).toBe('minor');
  });

  test('uses the matching branch for an OR constraint', () => {
    expect(getDiffType('^1.0 || ^2.0', '2.5.0')).toBe('minor');
  });
});

describe('formatNewVersion', () => {
  test('preserves caret prefix', () => {
    expect(formatNewVersion('^1.0', '1.5.0')).toBe('^1.5.0');
  });

  test('preserves OR branches while updating the matching branch', () => {
    expect(formatNewVersion('^1.0 || ^2.0', '2.5.0')).toBe('^1.0 || ^2.5.0');
  });

  test('preserves a single-pipe OR separator', () => {
    expect(formatNewVersion('~1.0 | ~2.0', '2.5.0')).toBe('~1.0 | ~2.5.0');
  });

  test('preserves tilde prefix', () => {
    expect(formatNewVersion('~1.2', '1.3.0')).toBe('~1.3.0');
  });

  test('keeps exact version without prefix', () => {
    expect(formatNewVersion('1.0.0', '1.5.0')).toBe('1.5.0');
  });

  test('returns original for dev versions', () => {
    expect(formatNewVersion('dev-main', '2.0.0')).toBe('dev-main');
  });

  test('updates wildcard constraint to major.minor.*', () => {
    expect(formatNewVersion('1.0.*', '1.5.3')).toBe('1.5.*');
  });

  test('updates major wildcard constraint', () => {
    expect(formatNewVersion('1.*', '2.3.0')).toBe('2.*');
  });

  test('preserves multi-segment wildcard shape', () => {
    expect(formatNewVersion('1.*.*', '2.3.0')).toBe('2.*.*');
  });

  test('preserves an unrestricted wildcard', () => {
    expect(formatNewVersion('*', '2.3.0')).toBe('*');
  });

  test('preserves stability flags', () => {
    expect(formatNewVersion('^1.0@stable', '1.5.0')).toBe('^1.5.0@stable');
  });

  test('preserves range constraint shape', () => {
    expect(formatNewVersion('>=1.0 <2.0', '1.5.0')).toBe('>=1.5.0 <2.0');
  });

  test('preserves spaced range operators', () => {
    expect(formatNewVersion('>= 1.0 < 2.0', '1.5.0')).toBe('>= 1.5.0 < 2.0');
  });

  test('updates hyphenated range', () => {
    expect(formatNewVersion('1.0 - 2.0', '2.5.0')).toBe('1.0 - 2.5.0');
  });

  test('strips v prefix from new version', () => {
    expect(formatNewVersion('^1.0', 'v1.5.0')).toBe('^1.5.0');
  });

  test('returns original for invalid wildcard version', () => {
    expect(formatNewVersion('1.*.*', 'not-a-version')).toBe('1.*.*');
  });
});

describe('getDiffType edge cases', () => {
  test('returns null for invalid semver', () => {
    expect(getDiffType('invalid', 'also-invalid')).toBeNull();
  });
});

describe('getVersionStability', () => {
  test('returns dev for dev-main', () => {
    expect(getVersionStability('dev-main')).toBe('dev');
  });

  test('returns dev for 1.0-dev', () => {
    expect(getVersionStability('1.0-dev')).toBe('dev');
  });

  test('returns dev for @dev suffix', () => {
    expect(getVersionStability('1.0.0@dev')).toBe('dev');
  });

  test('returns alpha for alpha version', () => {
    expect(getVersionStability('1.0.0-alpha')).toBe('alpha');
  });

  test('returns alpha for @alpha suffix', () => {
    expect(getVersionStability('1.0.0@alpha')).toBe('alpha');
  });

  test('returns beta for beta version', () => {
    expect(getVersionStability('1.0.0-beta')).toBe('beta');
  });

  test('returns beta for @beta suffix', () => {
    expect(getVersionStability('1.0.0@beta')).toBe('beta');
  });

  test('returns RC for rc version', () => {
    expect(getVersionStability('1.0.0-rc1')).toBe('RC');
  });

  test('returns RC for @rc suffix', () => {
    expect(getVersionStability('1.0.0@rc')).toBe('RC');
  });

  test('returns stable for stable version', () => {
    expect(getVersionStability('1.0.0')).toBe('stable');
  });

  test('returns stable for version with v prefix', () => {
    expect(getVersionStability('v1.0.0')).toBe('stable');
  });
});

describe('meetsStabilityRequirement', () => {
  test('stable meets stable requirement', () => {
    expect(meetsStabilityRequirement('1.0.0', 'stable')).toBe(true);
  });

  test('beta does not meet stable requirement', () => {
    expect(meetsStabilityRequirement('1.0.0-beta', 'stable')).toBe(false);
  });

  test('beta meets beta requirement', () => {
    expect(meetsStabilityRequirement('1.0.0-beta', 'beta')).toBe(true);
  });

  test('alpha meets dev requirement', () => {
    expect(meetsStabilityRequirement('1.0.0-alpha', 'dev')).toBe(true);
  });

  test('RC meets beta requirement', () => {
    expect(meetsStabilityRequirement('1.0.0-rc1', 'beta')).toBe(true);
  });

  test('dev does not meet alpha requirement', () => {
    expect(meetsStabilityRequirement('dev-main', 'alpha')).toBe(false);
  });

  test('dev meets dev requirement', () => {
    expect(meetsStabilityRequirement('dev-main', 'dev')).toBe(true);
  });

  test('stable meets dev requirement', () => {
    expect(meetsStabilityRequirement('1.0.0', 'dev')).toBe(true);
  });
});
