import { describe, expect, test } from 'bun:test';
import { balanceSkill, skillPower, POWER_CAP } from '../src/skills/balance';

describe('balanceSkill', () => {
  test('rejects things that are not a skill', () => {
    expect(balanceSkill(null, 'tactical').ok).toBe(false);
    expect(balanceSkill({ name: 'x', effects: [] }, 'tactical').ok).toBe(false);
    expect(balanceSkill({ name: 'x', effects: [{ type: 'nuke_everything' }] }, 'tactical').ok).toBe(false);
  });

  test('clamps absurd numbers into range and reports each clamp', () => {
    const r = balanceSkill(
      {
        name: 'God Beam',
        cooldown: 0,
        effects: [{ type: 'projectile', damage: 99999, speed: 9999, count: 50, radius: 100 }]
      },
      'tactical'
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const fx = r.skill.effects[0];
    expect(fx.type).toBe('projectile');
    if (fx.type !== 'projectile') return;
    expect(fx.damage).toBeLessThanOrEqual(120);
    expect(fx.count).toBeLessThanOrEqual(5);
    expect(fx.radius).toBeLessThanOrEqual(6);
    expect(r.notes.length).toBeGreaterThan(0);
  });

  test('total power never exceeds the slot cap, and cooldown grows with power', () => {
    const strong = balanceSkill(
      {
        name: 'Everything',
        effects: [
          { type: 'projectile', damage: 120, count: 5, radius: 6, speed: 80 },
          { type: 'heal', amount: 60 },
          { type: 'shield', amount: 75 }
        ]
      },
      'tactical'
    );
    const weak = balanceSkill({ name: 'Hop', effects: [{ type: 'dash', distance: 5 }] }, 'tactical');
    expect(strong.ok && weak.ok).toBe(true);
    if (!strong.ok || !weak.ok) return;
    expect(skillPower(strong.skill)).toBeLessThanOrEqual(POWER_CAP.tactical + 0.001);
    expect(strong.skill.cooldown).toBeGreaterThan(weak.skill.cooldown);
  });

  test('ultimate slot allows more power but needs a long cooldown', () => {
    const spec = { name: 'Big', effects: [{ type: 'area', radius: 10, damage: 80, duration: 4 }] };
    const t = balanceSkill(spec, 'tactical');
    const u = balanceSkill(spec, 'ultimate');
    expect(t.ok && u.ok).toBe(true);
    if (!t.ok || !u.ok) return;
    expect(skillPower(u.skill)).toBeGreaterThanOrEqual(skillPower(t.skill));
    expect(u.skill.cooldown).toBeGreaterThanOrEqual(45);
  });

  test('keeps at most three effects and sanitises text', () => {
    const r = balanceSkill(
      {
        name: '<b>' + 'a'.repeat(200),
        description: 'x'.repeat(999),
        color: 'javascript:alert(1)',
        effects: [
          { type: 'dash', distance: 6 },
          { type: 'heal', amount: 20 },
          { type: 'shield', amount: 20 },
          { type: 'reveal', radius: 30, duration: 3 }
        ]
      },
      'tactical'
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.skill.effects.length).toBe(3);
    expect(r.skill.name.length).toBeLessThanOrEqual(28);
    expect(r.skill.name).not.toContain('<');
    expect(r.skill.description.length).toBeLessThanOrEqual(140);
    expect(r.skill.color).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
