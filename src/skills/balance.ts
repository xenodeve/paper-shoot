/**
 * The skill DSL and its referee.
 *
 * A skill is data, never code: a name, a slot, a cooldown and one to three
 * effects from a closed list. Whatever an AI model returns goes through
 * `balanceSkill`, which clamps every number into its range, then spends a
 * power budget per slot. Over budget, the magnitudes shrink until it fits,
 * and the cooldown always grows with the power that is left. Every change
 * is recorded as a note, so the player sees exactly what was trimmed.
 *
 * Shared by the server (forge endpoint) and the client (offline forge,
 * saved skills loaded from storage) — the same rules on both sides.
 */

export type Slot = 'tactical' | 'ultimate';

export type BuffStat = 'speed' | 'damage' | 'fireRate' | 'reload';

export type Effect =
  | { type: 'dash'; distance: number }
  | { type: 'heal'; amount: number }
  | { type: 'shield'; amount: number }
  | { type: 'projectile'; damage: number; count: number; radius: number; speed: number }
  | { type: 'area'; radius: number; damage: number; slow: number; duration: number }
  | { type: 'buff'; stat: BuffStat; multiplier: number; duration: number }
  | { type: 'decoy'; duration: number }
  | { type: 'wall'; width: number; duration: number }
  | { type: 'reveal'; radius: number; duration: number }
  | { type: 'pull'; radius: number; strength: number };

export type EffectType = Effect['type'];

export const ICONS = ['bolt', 'flame', 'shield', 'heart', 'wind', 'eye', 'star', 'magnet', 'wall', 'ghost', 'target', 'spark'] as const;
export type SkillIcon = (typeof ICONS)[number];

export interface Skill {
  id: string;
  name: string;
  description: string;
  slot: Slot;
  icon: SkillIcon;
  color: string;
  cooldown: number;
  effects: Effect[];
  source: 'ai' | 'offline' | 'builtin';
}

export interface BalanceNote {
  /** what changed: `effects[0].damage`, `cooldown`, `effects[3]` … */
  field: string;
  reason: 'range' | 'budget' | 'cooldown' | 'dropped' | 'unknown';
  from?: number | string;
  to?: number | string;
}

export type BalanceResult = { ok: true; skill: Skill; power: number; notes: BalanceNote[] } | { ok: false; error: string };

type Range = readonly [min: number, max: number];

/** Every numeric field of every effect, with its legal range and default. */
const FIELDS: Record<EffectType, Record<string, { range: Range; def: number; scales?: boolean }>> = {
  dash: { distance: { range: [3, 14], def: 8, scales: true } },
  heal: { amount: { range: [10, 60], def: 30, scales: true } },
  shield: { amount: { range: [10, 75], def: 35, scales: true } },
  projectile: {
    damage: { range: [10, 120], def: 40, scales: true },
    count: { range: [1, 5], def: 1, scales: true },
    radius: { range: [0, 6], def: 0, scales: true },
    speed: { range: [20, 80], def: 45 }
  },
  area: {
    radius: { range: [2, 10], def: 5, scales: true },
    damage: { range: [0, 80], def: 20, scales: true },
    slow: { range: [0, 0.6], def: 0, scales: true },
    duration: { range: [1, 6], def: 3, scales: true }
  },
  buff: {
    multiplier: { range: [1.1, 1.6], def: 1.25, scales: true },
    duration: { range: [2, 8], def: 5, scales: true }
  },
  decoy: { duration: { range: [2, 8], def: 4, scales: true } },
  wall: {
    width: { range: [2, 8], def: 5, scales: true },
    duration: { range: [2, 10], def: 6, scales: true }
  },
  reveal: {
    radius: { range: [10, 60], def: 35, scales: true },
    duration: { range: [2, 6], def: 4, scales: true }
  },
  pull: {
    radius: { range: [3, 10], def: 6, scales: true },
    strength: { range: [0.2, 1], def: 0.6, scales: true }
  }
};

const BUFF_STATS: readonly BuffStat[] = ['speed', 'damage', 'fireRate', 'reload'];

export const EFFECT_TYPES = Object.keys(FIELDS) as EffectType[];

export const POWER_CAP: Record<Slot, number> = { tactical: 40, ultimate: 100 };
const COOLDOWN: Record<Slot, { base: number; perPower: number; min: number; max: number }> = {
  tactical: { base: 4, perPower: 0.45, min: 5, max: 40 },
  ultimate: { base: 45, perPower: 0.6, min: 45, max: 150 }
};
const MAX_EFFECTS = 3;

/** How strong one effect is, in budget points. */
export function effectPower(e: Effect): number {
  switch (e.type) {
    case 'dash':
      return e.distance * 1.2;
    case 'heal':
      return e.amount * 0.4;
    case 'shield':
      return e.amount * 0.35;
    case 'projectile':
      return e.damage * e.count * (1 + e.radius / 4) * 0.12;
    case 'area':
      return e.damage * e.duration * (e.radius / 5) * 0.08 + e.slow * e.duration * e.radius * 1.2;
    case 'buff':
      return (e.multiplier - 1) * e.duration * 10;
    case 'decoy':
      return e.duration * 3;
    case 'wall':
      return e.width * e.duration * 0.6;
    case 'reveal':
      return e.radius * e.duration * 0.05;
    case 'pull':
      return e.radius * e.strength * 2;
  }
}

export function skillPower(s: Pick<Skill, 'effects'>): number {
  return s.effects.reduce((sum, e) => sum + effectPower(e), 0);
}

const round = (v: number, step: number) => Math.round(v / step) * step;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const precision = (r: Range) => (r[1] <= 1.6 ? 0.05 : r[1] <= 14 ? 0.5 : 1);

function cleanText(v: unknown, max: number, fallback: string): string {
  const s = typeof v === 'string' ? v : '';
  const t = s
    .replace(/[<>{}`\\]/g, '')
    .replace(/[\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
  return t || fallback;
}

const DEFAULT_COLOR: Record<EffectType, string> = {
  dash: '#2bb3a3',
  heal: '#e5533d',
  shield: '#3b82c4',
  projectile: '#f08a24',
  area: '#7b4bd1',
  buff: '#e0a82e',
  decoy: '#8a8f99',
  wall: '#a0703f',
  reveal: '#2f9e5b',
  pull: '#c2418b'
};

const DEFAULT_ICON: Record<EffectType, SkillIcon> = {
  dash: 'wind',
  heal: 'heart',
  shield: 'shield',
  projectile: 'flame',
  area: 'spark',
  buff: 'bolt',
  decoy: 'ghost',
  wall: 'wall',
  reveal: 'eye',
  pull: 'magnet'
};

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function readEffect(raw: unknown, i: number, notes: BalanceNote[]): Effect | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const type = r.type as EffectType;
  const spec = FIELDS[type];
  if (!spec) {
    notes.push({ field: `effects[${i}]`, reason: 'unknown', from: String(r.type ?? '?').slice(0, 24) });
    return null;
  }
  const out: Record<string, unknown> = { type };
  for (const [key, f] of Object.entries(spec)) {
    const given = num(r[key]);
    const v = given === null ? f.def : given;
    const c = round(clamp(v, f.range[0], f.range[1]), precision(f.range));
    if (given !== null && Math.abs(c - given) > 1e-6) notes.push({ field: `effects[${i}].${key}`, reason: 'range', from: given, to: c });
    out[key] = c;
  }
  if (type === 'projectile') out.count = Math.round(out.count as number);
  if (type === 'buff') {
    const stat = r.stat as BuffStat;
    out.stat = BUFF_STATS.includes(stat) ? stat : 'damage';
  }
  return out as Effect;
}

/** Shrink the scalable magnitudes of every effect by `k`, respecting minimums. */
function shrink(effects: Effect[], k: number) {
  for (const e of effects) {
    const spec = FIELDS[e.type];
    const rec = e as unknown as Record<string, number>;
    for (const [key, f] of Object.entries(spec)) {
      if (!f.scales) continue;
      const lo = f.range[0];
      // multiplier shrinks toward 1, not toward 0
      const v = key === 'multiplier' ? 1 + (rec[key] - 1) * k : rec[key] * k;
      rec[key] = Math.max(lo, v);
    }
    if (e.type === 'projectile') e.count = Math.max(1, Math.floor(e.count));
  }
}

function snap(effects: Effect[]) {
  for (const e of effects) {
    const rec = e as unknown as Record<string, number>;
    for (const [key, f] of Object.entries(FIELDS[e.type])) {
      rec[key] = round(clamp(rec[key], f.range[0], f.range[1]), precision(f.range));
    }
  }
}

let counter = 0;
const makeId = () => `sk_${Date.now().toString(36)}_${(counter++).toString(36)}`;

export function balanceSkill(input: unknown, slot: Slot, source: Skill['source'] = 'ai'): BalanceResult {
  if (!input || typeof input !== 'object') return { ok: false, error: 'not-an-object' };
  const raw = input as Record<string, unknown>;
  const notes: BalanceNote[] = [];

  const list = Array.isArray(raw.effects) ? raw.effects : [];
  const effects: Effect[] = [];
  list.forEach((e, i) => {
    if (effects.length >= MAX_EFFECTS) {
      notes.push({ field: `effects[${i}]`, reason: 'dropped' });
      return;
    }
    const fx = readEffect(e, i, notes);
    if (fx) effects.push(fx);
  });
  if (!effects.length) return { ok: false, error: 'no-valid-effects' };

  // Spend the budget: shrink until it fits; if the floors alone overflow, drop the last effect.
  const cap = POWER_CAP[slot];
  const before = skillPower({ effects });
  if (before > cap) {
    const snapshot = JSON.stringify(effects);
    for (let guard = 0; guard < 60 && skillPower({ effects }) > cap; guard++) {
      shrink(effects, 0.92);
      if (guard > 40 && effects.length > 1 && skillPower({ effects }) > cap) {
        notes.push({ field: `effects[${effects.length - 1}]`, reason: 'dropped' });
        effects.pop();
      }
    }
    snap(effects);
    // Rounding may have nudged a hair over the cap; trim the biggest scalable field down one step.
    for (let guard = 0; guard < 20 && skillPower({ effects }) > cap; guard++) {
      shrink(effects, 0.97);
      snap(effects);
    }
    const old = JSON.parse(snapshot) as Effect[];
    effects.forEach((e, i) => {
      const o = old[i] as unknown as Record<string, number>;
      const n = e as unknown as Record<string, number>;
      for (const key of Object.keys(FIELDS[e.type])) {
        if (o && Math.abs(o[key] - n[key]) > 1e-6) notes.push({ field: `effects[${i}].${key}`, reason: 'budget', from: o[key], to: n[key] });
      }
    });
  }

  const power = skillPower({ effects });
  const cd = COOLDOWN[slot];
  const floor = clamp(cd.base + power * cd.perPower, cd.min, cd.max);
  const asked = num(raw.cooldown);
  const cooldown = round(clamp(Math.max(asked ?? floor, floor), cd.min, cd.max), 0.5);
  if (asked !== null && Math.abs(asked - cooldown) > 1e-6) notes.push({ field: 'cooldown', reason: 'cooldown', from: asked, to: cooldown });

  const first = effects[0].type;
  const icon = ICONS.includes(raw.icon as SkillIcon) ? (raw.icon as SkillIcon) : DEFAULT_ICON[first];
  const color = typeof raw.color === 'string' && /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color : DEFAULT_COLOR[first];

  return {
    ok: true,
    power,
    notes,
    skill: {
      id: typeof raw.id === 'string' && /^sk_[\w]+$/.test(raw.id) ? raw.id : makeId(),
      name: cleanText(raw.name, 28, 'Untitled Scribble'),
      description: cleanText(raw.description, 140, ''),
      slot,
      icon,
      color,
      cooldown,
      effects,
      source
    }
  };
}
