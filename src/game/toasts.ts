import type { WeaponId } from './weapons';

/**
 * What a pickup turns into on screen: an i18n key, its variables, and an icon id.
 * Pure on purpose — the engine calls it at the moment something is actually gained,
 * and the HUD renders the result (issue #3). A `weapon` variable is a WeaponId; the
 * HUD translates it to the weapon's name.
 */
export type ToastIcon = 'ammo' | 'tape' | 'glue' | 'shield' | 'ult' | 'weapon';

export type PickupEvent =
  | { kind: 'ammo'; weapon: WeaponId; amount: number }
  | { kind: 'tape' | 'glue'; amount: number; total: number }
  | { kind: 'shield'; tier: number; upgraded: boolean }
  | { kind: 'ult'; amount: number }
  | { kind: 'weapon'; weapon: WeaponId; taken: boolean };

export interface ToastSpec {
  key: string;
  vars: Record<string, string | number>;
  icon: ToastIcon;
}

export function pickupToast(e: PickupEvent): ToastSpec {
  switch (e.kind) {
    case 'ammo':
      return { key: 'toast.ammo', vars: { n: e.amount, weapon: e.weapon }, icon: 'ammo' };
    case 'tape':
    case 'glue':
      return { key: `toast.${e.kind}`, vars: { n: e.amount, total: e.total }, icon: e.kind };
    case 'shield':
      return e.upgraded ? { key: 'toast.shield', vars: { tier: e.tier + 1 }, icon: 'shield' } : { key: 'toast.shieldFull', vars: {}, icon: 'shield' };
    case 'ult':
      return { key: 'toast.ult', vars: { pct: Math.round(e.amount * 100) }, icon: 'ult' };
    case 'weapon':
      return { key: e.taken ? 'toast.weapon' : 'toast.weaponDrop', vars: { weapon: e.weapon }, icon: 'weapon' };
  }
}
