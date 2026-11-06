import { describe, expect, test } from 'bun:test';
import { orbitPose } from '../src/game/orbit';
import { ARENA_R } from '../src/game/arena';

describe('orbitPose (menu backdrop camera)', () => {
  const samples = Array.from({ length: 240 }, (_, i) => orbitPose(i * 0.75));

  test('stays inside the arena and above the props', () => {
    for (const p of samples) {
      expect(Math.hypot(p.x, p.z)).toBeLessThan(ARENA_R - 10);
      expect(p.y).toBeGreaterThan(4);
    }
  });

  test('always looks at the Book Tower', () => {
    for (const p of samples) {
      expect(Math.hypot(p.lookX, p.lookZ)).toBeLessThan(3);
      expect(p.lookY).toBeGreaterThan(0);
    }
  });

  test('actually moves, slowly', () => {
    const a = orbitPose(0);
    const b = orbitPose(1);
    const step = Math.hypot(b.x - a.x, b.z - a.z);
    expect(step).toBeGreaterThan(0.1);
    expect(step).toBeLessThan(3);
  });
});
