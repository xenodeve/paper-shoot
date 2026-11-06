import type { BotAvatarType } from 'bot-avatars';
import { balanceSkill, type Skill } from './skills/balance';
import { createStore, load, save } from './store';
import type { Wear } from './game/textures';

export type Lang = 'th' | 'en';
export type Quality = 'auto' | 'low' | 'medium' | 'high';

export interface Settings {
  lang: Lang;
  quality: Quality;
  sensitivity: number;
  fov: number;
  volume: number;
  showFps: boolean;
  invertY: boolean;
  lineBoil: boolean;
  voice: boolean;
}

export const settings = createStore<Settings>(
  load('ps.settings', {
    lang: (navigator.language || '').startsWith('th') ? 'th' : 'en',
    quality: 'auto',
    sensitivity: 1,
    fov: 80,
    volume: 0.7,
    showFps: true,
    invertY: false,
    lineBoil: true,
    voice: true
  } as Settings)
);
settings.subscribe(() => save('ps.settings', settings.get()));

export interface Look extends Wear {
  type: BotAvatarType;
  body: string;
  name: string;
}

export interface ScoreEntry {
  name: string;
  score: number;
  wave: number;
  kills: number;
  at: number;
  type: BotAvatarType;
}

export interface Profile {
  look: Look;
  library: Skill[];
  favorites: string[];
  loadout: { tactical: string; ultimate: string };
  scores: ScoreEntry[];
  totalKills: number;
}

export const BUILTIN: Skill[] = [
  {
    id: 'sk_builtin_dash',
    name: 'Ink Dash',
    description: 'Slip across the page in a smear of ink.',
    slot: 'tactical',
    icon: 'wind',
    color: '#2bb3a3',
    cooldown: 9,
    effects: [{ type: 'dash', distance: 10 }, { type: 'shield', amount: 15 }],
    source: 'builtin'
  },
  {
    id: 'sk_builtin_storm',
    name: 'Paper Storm',
    description: 'A squadron of folded planes dives on the spot you point at.',
    slot: 'ultimate',
    icon: 'flame',
    color: '#f08a24',
    cooldown: 75,
    effects: [
      { type: 'projectile', damage: 85, count: 5, radius: 4, speed: 42 },
      { type: 'area', radius: 6, damage: 0, slow: 0.4, duration: 3 }
    ],
    source: 'builtin'
  }
];

const initial: Profile = {
  look: { type: 'clover', body: '', name: 'Doodle', hat: 'none', glasses: 'none', headphones: false, bowTie: false, color: '#2b2b33' },
  library: [],
  favorites: [],
  loadout: { tactical: BUILTIN[0].id, ultimate: BUILTIN[1].id },
  scores: [],
  totalKills: 0
};

function restore(): Profile {
  const p = load<Profile>('ps.profile', initial);
  // Saved skills are re-refereed on load: an edited localStorage can't smuggle in a god skill.
  p.library = (Array.isArray(p.library) ? p.library : [])
    .map(s => {
      const r = balanceSkill(s, s?.slot === 'ultimate' ? 'ultimate' : 'tactical', s?.source === 'offline' ? 'offline' : 'ai');
      return r.ok ? { ...r.skill, id: s.id } : null;
    })
    .filter((s): s is Skill => Boolean(s))
    .slice(0, 40);
  p.look = { ...initial.look, ...p.look };
  p.loadout = { ...initial.loadout, ...p.loadout };
  p.scores = Array.isArray(p.scores) ? p.scores.slice(0, 10) : [];
  return p;
}

export const profile = createStore<Profile>(restore());
profile.subscribe(() => save('ps.profile', profile.get()));

export function allSkills(): Skill[] {
  return [...BUILTIN, ...profile.get().library];
}

export function skillById(id: string, slot: Skill['slot']): Skill {
  return allSkills().find(s => s.id === id && s.slot === slot) ?? BUILTIN.find(s => s.slot === slot)!;
}

/** Hats and glasses unlock as you play: a reason to come back. */
export const UNLOCKS: { item: string; need: { best?: number; kills?: number } }[] = [
  { item: 'hat:beanie', need: {} },
  { item: 'hat:beret', need: { kills: 25 } },
  { item: 'hat:party', need: { best: 5000 } },
  { item: 'hat:crown', need: { best: 20000 } },
  { item: 'glasses:round', need: {} },
  { item: 'glasses:square', need: { kills: 50 } },
  { item: 'glasses:shades', need: { best: 10000 } },
  { item: 'headphones', need: { kills: 10 } },
  { item: 'bowTie', need: {} }
];

export function bestScore(p = profile.get()) {
  return p.scores.reduce((m, s) => Math.max(m, s.score), 0);
}

export function isUnlocked(item: string, p = profile.get()) {
  const u = UNLOCKS.find(x => x.item === item);
  if (!u) return true;
  return (u.need.best === undefined || bestScore(p) >= u.need.best) && (u.need.kills === undefined || p.totalKills >= u.need.kills);
}
