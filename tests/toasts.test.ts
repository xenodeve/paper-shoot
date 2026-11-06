import { describe, expect, test } from 'bun:test';
import { pickupToast } from '../src/game/toasts';

describe('pickupToast', () => {
  test('ammo names the gun it fed and how much', () => {
    expect(pickupToast({ kind: 'ammo', weapon: 'stapler', amount: 60 })).toEqual({ key: 'toast.ammo', vars: { n: 60, weapon: 'stapler' }, icon: 'ammo' });
  });

  test('tape and glue say +1 and show the new total', () => {
    expect(pickupToast({ kind: 'tape', amount: 1, total: 3 })).toEqual({ key: 'toast.tape', vars: { n: 1, total: 3 }, icon: 'tape' });
    expect(pickupToast({ kind: 'glue', amount: 1, total: 2 })).toEqual({ key: 'toast.glue', vars: { n: 1, total: 2 }, icon: 'glue' });
  });

  test('shield names the tier it reached (1-based for players); at max it says refilled', () => {
    expect(pickupToast({ kind: 'shield', tier: 2, upgraded: true })).toEqual({ key: 'toast.shield', vars: { tier: 3 }, icon: 'shield' });
    expect(pickupToast({ kind: 'shield', tier: 2, upgraded: false })).toEqual({ key: 'toast.shieldFull', vars: {}, icon: 'shield' });
  });

  test('ult charge is a percentage', () => {
    expect(pickupToast({ kind: 'ult', amount: 0.5 })).toEqual({ key: 'toast.ult', vars: { pct: 50 }, icon: 'ult' });
  });

  test('a weapon on the floor says to press E; a weapon taken says you got it', () => {
    expect(pickupToast({ kind: 'weapon', weapon: 'ruler', taken: false })).toEqual({ key: 'toast.weaponDrop', vars: { weapon: 'ruler' }, icon: 'weapon' });
    expect(pickupToast({ kind: 'weapon', weapon: 'ruler', taken: true })).toEqual({ key: 'toast.weapon', vars: { weapon: 'ruler' }, icon: 'weapon' });
  });
});
