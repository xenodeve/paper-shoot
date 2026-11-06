import { describe, expect, test } from 'bun:test';
import { ALL_CTX, ctxFrom, ctxIndex, skillRow } from '../src/skills/program';
import { balanceSkill, checkProgram, pricedPower, skillPower } from '../src/skills/balance';

const row = (...fx: object[]) => fx;
const table = (fill: (i: number) => object[]) => ALL_CTX.map((_, i) => fill(i));

describe('contexts', () => {
  test('24 discrete contexts, each with its own index', () => {
    expect(ALL_CTX.length).toBe(24);
    expect(new Set(ALL_CTX.map(ctxIndex)).size).toBe(24);
    ALL_CTX.forEach((c, i) => expect(ctxIndex(c)).toBe(i));
  });

  test('ctxFrom buckets the live game state', () => {
    expect(ctxFrom(20, 0, 0, 99)).toEqual({ hpLow: true, shieldUp: false, enemiesNear: 0, hitRecently: false });
    expect(ctxFrom(90, 30, 2, 0.5)).toEqual({ hpLow: false, shieldUp: true, enemiesNear: 1, hitRecently: true });
    expect(ctxFrom(90, 0, 7, 5).enemiesNear).toBe(3);
  });
});

describe('skillRow: what the game plays at cast', () => {
  test('a program plays the row for the live context; a plain skill plays its effects now', () => {
    const program = { source: '', votes: [], table: ALL_CTX.map((c, i) => [{ type: 'shield' as const, amount: 10 + i, at: c.hpLow ? 1 : 0 }]) };
    const low = ctxFrom(20, 0, 0, 99);
    expect(skillRow({ effects: [], program }, low)).toEqual([{ type: 'shield', amount: 10 + ctxIndex(low), at: 1 }]);
    expect(skillRow({ effects: [{ type: 'dash', distance: 8 }] }, low)).toEqual([{ type: 'dash', distance: 8, at: 0 }]);
  });
});

describe('checkProgram', () => {
  const ok = () => ({ source: 'function onCast(api){api.shield({amount:40})}', table: table(() => row({ type: 'shield', amount: 40, at: 0 })), votes: [] });

  test('a valid table passes and its power is the worst row', () => {
    const p = ok();
    p.table[5] = row({ type: 'shield', amount: 40, at: 0 }, { type: 'dash', distance: 10, at: 1 });
    const r = checkProgram(p, 'tactical');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.power).toBeCloseTo(40 * 0.35 + 10 * 1.2);
  });

  test('one row over the slot budget rejects the whole program', () => {
    const p = ok();
    p.table[23] = row({ type: 'projectile', damage: 120, count: 5, radius: 6, at: 0 });
    expect(checkProgram(p, 'tactical')).toEqual({ ok: false, error: 'over-budget' });
  });

  test('wrong row count, bad delay, too many effects, nothing at all', () => {
    expect(checkProgram({ ...ok(), table: ok().table.slice(1) }, 'tactical').ok).toBe(false);
    const late = ok();
    late.table[0] = row({ type: 'shield', amount: 20, at: 11 });
    expect(checkProgram(late, 'tactical').ok).toBe(false);
    const many = ok();
    many.table[0] = Array.from({ length: 13 }, () => ({ type: 'reveal', radius: 10, duration: 2, at: 0 }));
    expect(checkProgram(many, 'ultimate').ok).toBe(false);
    expect(checkProgram({ ...ok(), table: table(() => []) }, 'tactical')).toEqual({ ok: false, error: 'does-nothing' });
  });

  test('an inherited key as an effect type ("constructor") cannot make a row cost NaN and slip past the budget', () => {
    const p = ok();
    const nuke = Array.from({ length: 11 }, () => ({ type: 'projectile', damage: 120, count: 5, radius: 6, at: 0 }));
    p.table = table(i => (i === 0 ? row({ type: 'shield', amount: 20, at: 0 }) : [{ type: 'constructor', at: 0 }, ...nuke]));
    expect(checkProgram(p, 'tactical').ok).toBe(false);
    for (const type of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      const r = balanceSkill({ name: 'x', effects: [{ type }, { type: 'dash', distance: 8 }] }, 'tactical');
      expect(r.ok && Number.isFinite(r.power) && Number.isFinite(r.skill.cooldown)).toBe(true);
      expect(r.ok && r.skill.effects.map(e => e.type)).toEqual(['dash']);
    }
  });

  test('values are clamped to the effect ranges before power is measured', () => {
    const p = ok();
    p.table = table(() => row({ type: 'shield', amount: 999, at: 0 }));
    const r = checkProgram(p, 'tactical');
    expect(r.ok && r.program.table[0][0]).toMatchObject({ type: 'shield', amount: 75 });
  });

  test('vote reasons are cleaned and capped', () => {
    const p = { ...ok(), votes: [{ model: 'glm-5.3-flash', vote: 'pass', reason: '<script>x</script>'.repeat(20) }, { model: 'x', vote: 'maybe', reason: '' }] };
    const r = checkProgram(p, 'tactical');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.program.votes.length).toBe(1);
      expect(r.program.votes[0].reason).not.toContain('<');
      expect(r.program.votes[0].reason.length).toBeLessThanOrEqual(120);
    }
  });
});

describe('balanceSkill with a program', () => {
  const base = { name: 'Fold Shield', effects: [{ type: 'shield', amount: 40 }] };

  test('keeps a valid program and prices the cooldown from its worst row', () => {
    const program = { source: 'x', votes: [], table: table(i => (i === 7 ? row({ type: 'shield', amount: 40, at: 0 }, { type: 'dash', distance: 14, at: 0.5 }) : row({ type: 'shield', amount: 20, at: 0 }))) };
    const r = balanceSkill({ ...base, program }, 'tactical');
    expect(r.ok && r.skill.program?.table.length).toBe(24);
    const plain = balanceSkill(base, 'tactical');
    expect(r.ok && plain.ok && r.skill.cooldown > plain.skill.cooldown).toBe(true);
  });

  test('pricedPower: the card shows the strongest row, not the 3-effect preview', () => {
    const big = Array.from({ length: 5 }, () => ({ type: 'reveal' as const, radius: 20, duration: 4, at: 0 }));
    const program = { source: 'x', votes: [], table: table(i => (i === 3 ? big : row({ type: 'reveal', radius: 10, duration: 2, at: 0 }))) };
    const r = balanceSkill({ name: 'Eyes', program }, 'tactical');
    expect(r.ok && r.skill.effects.length).toBe(3);
    expect(r.ok && pricedPower(r.skill)).toBeCloseTo(5 * 20 * 4 * 0.05);
    expect(r.ok && skillPower(r.skill)).toBeCloseTo(3 * 20 * 4 * 0.05);
  });

  test('drops an invalid program and keeps the plain effects, with a note', () => {
    const r = balanceSkill({ ...base, program: { source: 'x', votes: [], table: [] } }, 'tactical');
    expect(r.ok && r.skill.program).toBeUndefined();
    expect(r.ok && r.notes.some(n => n.field === 'program')).toBe(true);
  });
});
