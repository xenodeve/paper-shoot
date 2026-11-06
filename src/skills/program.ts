import type { Effect } from './balance';

/**
 * A code skill (issue #18, ADR 0003). The AI writes a script; the server runs it in a
 * sandbox once per context and keeps only the effects it produced. What reaches the game
 * is this table: plain data, re-checked by `checkProgram` in `balance.ts` on the server,
 * in the browser and on load from storage. The game never runs AI code.
 */

/** Everything a script may know when it is cast. Small and discrete, so the table is exact. */
export interface Ctx {
  hpLow: boolean;
  shieldUp: boolean;
  enemiesNear: 0 | 1 | 3;
  hitRecently: boolean;
}

const NEAR = [0, 1, 3] as const;

export const ALL_CTX: readonly Ctx[] = (() => {
  const out: Ctx[] = [];
  for (const hpLow of [false, true])
    for (const shieldUp of [false, true])
      for (const enemiesNear of NEAR) for (const hitRecently of [false, true]) out.push({ hpLow, shieldUp, enemiesNear, hitRecently });
  return out;
})();

/** The row of the table for a context; matches the order of `ALL_CTX`. */
export function ctxIndex(c: Ctx): number {
  return ((+c.hpLow * 2 + +c.shieldUp) * 3 + NEAR.indexOf(c.enemiesNear)) * 2 + +c.hitRecently;
}

export const LOW_HP = 35;
export const NEAR_RADIUS = 12;
export const RECENT_HIT_S = 2;

/** The live game state, bucketed into a context. */
export function ctxFrom(hp: number, shield: number, enemiesWithinRadius: number, secondsSinceHurt: number): Ctx {
  return {
    hpLow: hp < LOW_HP,
    shieldUp: shield > 0,
    enemiesNear: enemiesWithinRadius >= 3 ? 3 : enemiesWithinRadius >= 1 ? 1 : 0,
    hitRecently: secondsSinceHurt < RECENT_HIT_S
  };
}

export type TimedEffect = Effect & { at: number };

export interface Vote {
  model: string;
  vote: 'pass' | 'reject';
  reason: string;
}

export interface Program {
  /** The script, kept to show the player; never executed outside the server sandbox. */
  source: string;
  /** One row per context, in `ALL_CTX` order. */
  table: TimedEffect[][];
  votes: Vote[];
}

/** What the game plays at cast: a program's row for the live context, or the plain effects now. */
export function skillRow(s: { effects: Effect[]; program?: Program }, ctx: Ctx): readonly TimedEffect[] {
  return s.program ? (s.program.table[ctxIndex(ctx)] ?? []) : s.effects.map(e => ({ ...e, at: 0 }));
}

export const MAX_ROW_EFFECTS = 12;
/** Any number a script emits outside 0..MAX_NUMBER rejects the program (clamping is for small slips). */
export const MAX_NUMBER = 1000;
export const MAX_DELAY_S = 10;
