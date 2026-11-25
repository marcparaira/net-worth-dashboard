import { describe, expect, it } from 'vitest';
import { versionLabel } from './version';

describe('versionLabel', () => {
  it('prefixes release versions and names development builds', () => {
    expect(versionLabel('1.4.0')).toBe('v1.4.0');
    expect(versionLabel('dev')).toBe('development build');
  });
});
