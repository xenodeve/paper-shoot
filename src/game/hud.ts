import { createStore } from '../store';
import type { SkillIcon } from '../skills/balance';
import type { EnemyKind } from './enemies';
import type { WeaponId } from './weapons';
import type { BotAvatarType } from 'bot-avatars';
import type { ToastSpec } from './toasts';

export type Phase = 'loading' | 'ready' | 'playing' | 'paused' | 'dead' | 'over';

export interface SkillHud {
  name: string;
  color: string;
  icon: SkillIcon;
  cd: number;
  cdMax: number;
}

export interface KillItem {
  id: number;
  type: BotAvatarType;
  kind: EnemyKind;
  elite: boolean;
  eye: boolean;
  weapon: string;
  at: number;
}

export interface Popup {
  id: number;
  /** i18n key, rendered by the HUD */
  key: string;
  value: number;
  tone: 'kill' | 'eye' | 'bonus' | 'combo' | 'info' | 'bad';
  at: number;
}

export interface Callout {
  id: number;
  key: string;
  at: number;
}

export interface Summary {
  score: number;
  wave: number;
  kills: number;
  eyeshots: number;
  shots: number;
  hits: number;
  damage: number;
  time: number;
  bestCombo: number;
  breakdown: { key: string; value: number }[];
}

export interface HudState {
  phase: Phase;
  hp: number;
  hpMax: number;
  shield: number;
  shieldMax: number;
  shieldTier: number;
  weapon: WeaponId;
  mag: number;
  magMax: number;
  reserve: number;
  reload: number; // 0 = not reloading, else 0..1 progress
  owned: { id: WeaponId; mag: number; reserve: number }[];
  tape: number;
  glue: number;
  healing: { kind: 'tape' | 'glue'; p: number } | null;
  score: number;
  combo: number;
  comboT: number;
  wave: number;
  enemiesLeft: number;
  kills: number;
  ringPhase: 'hold' | 'shrink' | 'calm';
  ringTime: number;
  outside: boolean;
  intermission: number;
  tactical: SkillHud;
  ultimate: SkillHud;
  buffs: { stat: string; t: number; max: number; color: string }[];
  prompt: { key: string; arg?: string } | null;
  killfeed: KillItem[];
  popups: Popup[];
  callouts: Callout[];
  damageDirs: { id: number; angle: number; at: number }[];
  /** what you just gained, shown at the bottom of the screen (issue #3) */
  toasts: (ToastSpec & { id: number; at: number })[];
  fps: number;
  scale: number;
  lowHp: boolean;
  ads: boolean;
  summary: Summary | null;
  listening: boolean;
}

const skill0: SkillHud = { name: '', color: '#888', icon: 'bolt', cd: 0, cdMax: 1 };

export const initialHud: HudState = {
  phase: 'loading',
  hp: 100,
  hpMax: 100,
  shield: 50,
  shieldMax: 50,
  shieldTier: 0,
  weapon: 'pencil',
  mag: 12,
  magMax: 12,
  reserve: Infinity,
  reload: 0,
  owned: [],
  tape: 0,
  glue: 0,
  healing: null,
  score: 0,
  combo: 1,
  comboT: 0,
  wave: 0,
  enemiesLeft: 0,
  kills: 0,
  ringPhase: 'calm',
  ringTime: 0,
  outside: false,
  intermission: 0,
  tactical: skill0,
  ultimate: skill0,
  buffs: [],
  prompt: null,
  killfeed: [],
  popups: [],
  callouts: [],
  damageDirs: [],
  toasts: [],
  fps: 0,
  scale: 1,
  lowHp: false,
  ads: false,
  summary: null,
  listening: false
};

export const hud = createStore<HudState>({ ...initialHud });
