import { describe, expect, test } from 'bun:test';
import { parseCommand } from '../src/voice';

describe('parseCommand', () => {
  test('english commands', () => {
    expect(parseCommand('reload')).toBe('reload');
    expect(parseCommand('Reload please')).toBe('reload');
    expect(parseCommand('use skill')).toBe('tactical');
    expect(parseCommand('ultimate now')).toBe('ultimate');
    expect(parseCommand('heal me')).toBe('heal');
    expect(parseCommand('switch weapon')).toBe('switch');
    expect(parseCommand('ping that')).toBe('ping');
    expect(parseCommand('pause')).toBe('pause');
  });

  test('thai commands', () => {
    expect(parseCommand('รีโหลด')).toBe('reload');
    expect(parseCommand('เติมกระสุน')).toBe('reload');
    expect(parseCommand('ใช้สกิล')).toBe('tactical');
    expect(parseCommand('อัลติ')).toBe('ultimate');
    expect(parseCommand('ฮีลหน่อย')).toBe('heal');
    expect(parseCommand('เปลี่ยนปืน')).toBe('switch');
    expect(parseCommand('มาร์คตรงนั้น')).toBe('ping');
    expect(parseCommand('หยุดเกม')).toBe('pause');
  });

  test('ultimate wins over the generic word "skill"', () => {
    expect(parseCommand('ultimate skill')).toBe('ultimate');
    expect(parseCommand('สกิลอัลติ')).toBe('ultimate');
  });

  test('unknown speech is null', () => {
    expect(parseCommand('what a nice day')).toBeNull();
    expect(parseCommand('')).toBeNull();
  });
});
