import { describe, test, expect } from 'bun:test';
import {
  normalizeComposerConstraint,
  extractMinVersion,
  extractMaxVersion,
  checkPhpCompatibility,
  isConstraintSatisfied,
} from '../src/utils/php';

describe('normalizeComposerConstraint', () => {
  test('handles caret constraints', () => {
    expect(normalizeComposerConstraint('^8.0')).toBe('^8.0');
    expect(normalizeComposerConstraint('^7.2.5')).toBe('^7.2.5');
  });

  test('handles OR constraints with ||', () => {
    expect(normalizeComposerConstraint('^7.0 || ^8.0')).toBe('^7.0 || ^8.0');
  });

  test('handles OR constraints with single |', () => {
    expect(normalizeComposerConstraint('^7.0|^8.0')).toBe('^7.0 || ^8.0');
  });

  test('handles comma-separated AND constraints', () => {
    expect(normalizeComposerConstraint('>=7.2.5, <8.0')).toBe('>=7.2.5 <8.0');
  });

  test('removes stability flags', () => {
    expect(normalizeComposerConstraint('^8.0@dev')).toBe('^8.0');
    expect(normalizeComposerConstraint('^8.0@stable')).toBe('^8.0');
  });

  test('handles wildcards', () => {
    expect(normalizeComposerConstraint('*')).toBe('*');
  });
});

describe('extractMinVersion', () => {
  test('extracts minimum from caret constraint', () => {
    expect(extractMinVersion('^8.0')).toBe('8.0.0');
    expect(extractMinVersion('^7.2.5')).toBe('7.2.5');
  });

  test('extracts minimum from OR constraint', () => {
    expect(extractMinVersion('^7.0 || ^8.0')).toBe('7.0.0');
  });

  test('extracts minimum from range constraint', () => {
    expect(extractMinVersion('>=7.2.5')).toBe('7.2.5');
  });

  test('returns null for wildcard', () => {
    expect(extractMinVersion('*')).toBeNull();
  });
});

describe('extractMaxVersion', () => {
  test('extracts max from explicit upper bound', () => {
    expect(extractMaxVersion('<8.4')).toBe('8.4.0');
    expect(extractMaxVersion('>=7.2.5 <8.0')).toBe('8.0.0');
  });

  test('calculates implied max from caret', () => {
    expect(extractMaxVersion('^8.0')).toBe('9.0.0');
    expect(extractMaxVersion('^7.2')).toBe('8.0.0');
  });

  test('returns null for no upper bound', () => {
    expect(extractMaxVersion('>=8.0')).toBeNull();
  });
});

describe('checkPhpCompatibility', () => {
  test('compatible when project constraint satisfies package', () => {
    const result = checkPhpCompatibility('^8.1', '^8.0');
    expect(result.satisfied).toBe(true);
  });

  test('compatible with OR constraint when one matches', () => {
    const result = checkPhpCompatibility('^8.3', '^7.2.5 || ^8.0');
    expect(result.satisfied).toBe(true);
  });

  test('compatible when one project OR branch intersects the package range', () => {
    const result = checkPhpCompatibility('^7.4 || ^8.2', '^8.0');
    expect(result.satisfied).toBe(true);
  });

  test('incompatible when project PHP is too high', () => {
    // ^8.5 min is 8.5, package ^8.0 allows 8.0-8.x, so 8.5 is compatible
    // Use a constraint that explicitly doesn't support 8.5
    const result = checkPhpCompatibility('^8.5', '^7.2.5 <8.4');
    expect(result.satisfied).toBe(false);
    expect(result.reason).toContain('requires php');
  });

  test('incompatible when package has upper limit', () => {
    const result = checkPhpCompatibility('^8.5', '>=7.4 <8.4');
    expect(result.satisfied).toBe(false);
  });

  test('compatible when no package PHP constraint', () => {
    const result = checkPhpCompatibility('^8.5', '');
    expect(result.satisfied).toBe(true);
  });

  test('compatible when no project PHP constraint', () => {
    const result = checkPhpCompatibility('', '^8.0');
    expect(result.satisfied).toBe(true);
  });
});

describe('isConstraintSatisfied', () => {
  test('version satisfies caret constraint', () => {
    expect(isConstraintSatisfied('8.1.0', '^8.0')).toBe(true);
    expect(isConstraintSatisfied('8.0.5', '^8.0')).toBe(true);
  });

  test('version does not satisfy different major', () => {
    expect(isConstraintSatisfied('9.0.0', '^8.0')).toBe(false);
  });

  test('version satisfies OR constraint', () => {
    expect(isConstraintSatisfied('7.4.0', '^7.0 || ^8.0')).toBe(true);
    expect(isConstraintSatisfied('8.1.0', '^7.0 || ^8.0')).toBe(true);
  });

  test('isConstraintSatisfied > version satisfies OR constraint', () => {
    expect(isConstraintSatisfied('8.1.0', '^7.4 || ^8.0')).toBe(true);
  });

  test('isConstraintSatisfied > version does not satisfy OR constraint', () => {
    expect(isConstraintSatisfied('7.3.0', '^7.4 || ^8.0')).toBe(false);
  });

  test('isConstraintSatisfied > handles invalid version', () => {
    expect(isConstraintSatisfied('invalid-version', '^8.0')).toBe(true);
  });

  test('isConstraintSatisfied > handles invalid constraint', () => {
    expect(isConstraintSatisfied('8.1.0', 'not-a-version')).toBe(false);
  });

  test('isConstraintSatisfied > wildcard always satisfied', () => {
    expect(isConstraintSatisfied('10.0.0', '*')).toBe(true);
  });
});
