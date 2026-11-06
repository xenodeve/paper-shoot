import { describe, expect, test } from 'bun:test';
import { weaponTouch } from '../src/game/pickup';

describe('weaponTouch (walking into a dropped gun)', () => {
  test('a gun you do not own is taken and equipped', () => {
    expect(weaponTouch({ owned: false, reserve: 0, reserveMax: 210 })).toBe('equip');
  });

  test('a gun you own tops up its ammo when it has room', () => {
    expect(weaponTouch({ owned: true, reserve: 40, reserveMax: 210 })).toBe('ammo');
  });

  test('a gun you own with full ammo stays on the floor', () => {
    expect(weaponTouch({ owned: true, reserve: 210, reserveMax: 210 })).toBe('none');
  });

  test('the pencil (infinite reserve) is never topped up', () => {
    expect(weaponTouch({ owned: true, reserve: Infinity, reserveMax: Infinity })).toBe('none');
  });
});
