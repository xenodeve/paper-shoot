/**
 * What walking into a dropped gun does (issue #11). Pure, so the rule is tested
 * apart from the engine: a new gun is taken and equipped, a gun you already own
 * tops up its ammo, and a gun with nothing to give stays where it lies.
 */
export type WeaponTouch = 'equip' | 'ammo' | 'none';

export function weaponTouch(s: { owned: boolean; reserve: number; reserveMax: number }): WeaponTouch {
  if (!s.owned) return 'equip';
  if (s.reserve < s.reserveMax) return 'ammo';
  return 'none';
}
