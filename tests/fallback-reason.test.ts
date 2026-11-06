import { describe, expect, test } from 'bun:test';
import { fallbackKind } from '../src/ui/fallbackReason';

describe('fallbackKind: why the forge fell back offline, as an i18n key suffix', () => {
  test('a busy provider (429, 5xx) is "busy", not "the answer could not be used"', () => {
    expect(fallbackKind('http-429:server_error')).toBe('busy');
    expect(fallbackKind('http-429')).toBe('busy');
    expect(fallbackKind('http-503')).toBe('busy');
  });

  test('known reasons keep their own key', () => {
    expect(fallbackKind('no-key')).toBe('no-key');
    expect(fallbackKind('timeout')).toBe('timeout');
  });

  test('anything else, including a 4xx and a bad AI answer, is "other"', () => {
    expect(fallbackKind('http-400:MissingSessionID')).toBe('other');
    expect(fallbackKind('no-json')).toBe('other');
    expect(fallbackKind('http-4290')).toBe('other');
  });
});
