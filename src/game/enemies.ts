import * as THREE from 'three';
import type { BotAvatarType } from 'bot-avatars';
import { bakeMascot, blobShadow, NO_WEAR, type Wear } from './textures';

export type EnemyKind = 'scout' | 'zipper' | 'pouncer' | 'sniper' | 'bulwark' | 'blinker';

export interface EnemyDef {
  kind: EnemyKind;
  type: BotAvatarType;
  wear: Wear;
  hp: number;
  speed: number;
  /** world size of the 100-unit body box */
  size: number;
  range: number;
  /** keeps at least this far from its target */
  keep: number;
  interval: number;
  burst: number;
  dartDamage: number;
  dartSpeed: number;
  spread: number;
  melee?: number;
  telegraph?: number;
  blink?: number;
  score: number;
  minWave: number;
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  scout: { kind: 'scout', type: 'clover', wear: NO_WEAR, hp: 90, speed: 4.4, size: 1.75, range: 42, keep: 9, interval: 1.5, burst: 2, dartDamage: 8, dartSpeed: 32, spread: 0.04, score: 100, minWave: 1 },
  zipper: { kind: 'zipper', type: 'star', wear: { ...NO_WEAR, headphones: true, color: '#2b2b33' }, hp: 60, speed: 7.2, size: 1.45, range: 32, keep: 6, interval: 1.05, burst: 1, dartDamage: 7, dartSpeed: 36, spread: 0.06, score: 120, minWave: 1 },
  pouncer: { kind: 'pouncer', type: 'cat', wear: { ...NO_WEAR, bowTie: true, color: '#c23b3b' }, hp: 85, speed: 7.8, size: 1.6, range: 2.4, keep: 0, interval: 0.9, burst: 0, dartDamage: 0, dartSpeed: 0, spread: 0, melee: 17, score: 130, minWave: 2 },
  sniper: { kind: 'sniper', type: 'triangle', wear: { ...NO_WEAR, glasses: 'shades' }, hp: 70, speed: 3.1, size: 1.7, range: 85, keep: 26, interval: 3.4, burst: 1, dartDamage: 26, dartSpeed: 85, spread: 0, telegraph: 1.05, score: 160, minWave: 3 },
  bulwark: { kind: 'bulwark', type: 'mech', wear: { ...NO_WEAR, hat: 'beanie', color: '#e5533d' }, hp: 340, speed: 2.7, size: 2.3, range: 34, keep: 7, interval: 1.9, burst: 3, dartDamage: 9, dartSpeed: 26, spread: 0.18, score: 260, minWave: 4 },
  blinker: { kind: 'blinker', type: 'ghost', wear: { ...NO_WEAR, hat: 'party', color: '#7b4bd1' }, hp: 75, speed: 4.6, size: 1.6, range: 36, keep: 8, interval: 1.3, burst: 2, dartDamage: 8, dartSpeed: 34, spread: 0.05, blink: 4.5, score: 150, minWave: 3 }
};

export type EnemyState = 'pop' | 'chase' | 'attack' | 'aim' | 'lunge' | 'dying';

export interface Enemy {
  id: number;
  def: EnemyDef;
  elite: boolean;
  root: THREE.Group;
  card: THREE.Group;
  front: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  back: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  shadow: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  yaw: number;
  hp: number;
  maxHp: number;
  state: EnemyState;
  t: number;
  fireT: number;
  burstLeft: number;
  burstT: number;
  losT: number;
  canSee: boolean;
  strafe: number;
  strafeT: number;
  stuckT: number;
  detourT: number;
  detour: THREE.Vector3;
  blinkT: number;
  slow: number;
  slowT: number;
  revealT: number;
  flashT: number;
  aimDir: THREE.Vector3;
  lastHitBy: string;
  size: number;
  eyeY: number;
  /** damage dealt to the player since spawn, for the score breakdown */
  dealt: number;
}

interface Bank {
  front: THREE.Texture;
  back: THREE.Texture;
  span: number;
  rise: number;
  faceY: number;
}

/** Baked textures and shared geometry, reused by every enemy of a kind. */
export class EnemyBank {
  private cache = new Map<string, Bank>();
  readonly plane = new THREE.PlaneGeometry(1, 1);
  readonly shadowGeo = new THREE.PlaneGeometry(1, 1);
  readonly standGeo = new THREE.BoxGeometry(0.5, 0.1, 0.32);
  readonly shadowMat: THREE.MeshBasicMaterial;
  readonly standMat = new THREE.MeshBasicMaterial({ color: '#b8854f' });
  private shadowTex = blobShadow();

  constructor() {
    this.shadowMat = new THREE.MeshBasicMaterial({ map: this.shadowTex, transparent: true, depthWrite: false });
    this.shadowGeo.rotateX(-Math.PI / 2);
  }

  get(def: EnemyDef, elite: boolean): Bank {
    const key = `${def.kind}:${elite}`;
    let b = this.cache.get(key);
    if (!b) {
      const wear: Wear = elite ? { ...def.wear, hat: 'crown', color: '#e0a82e' } : def.wear;
      const baked = bakeMascot(def.type, wear);
      b = { front: baked.front, back: baked.back, span: baked.span, rise: baked.bodyCenterBelow, faceY: baked.faceY };
      this.cache.set(key, b);
    }
    return b;
  }

  /** Bake everything up front so the first spawn of a kind never hitches. */
  warm() {
    for (const def of Object.values(ENEMIES)) {
      this.get(def, false);
      this.get(def, true);
    }
  }

  dispose() {
    for (const b of this.cache.values()) {
      b.front.dispose();
      b.back.dispose();
    }
    this.plane.dispose();
    this.shadowGeo.dispose();
    this.standGeo.dispose();
    this.shadowMat.dispose();
    this.shadowTex.dispose();
    this.standMat.dispose();
  }
}

/**
 * The two faces of a sticker card (bots and the player's decoy). One factory, so the
 * shader warm-up in Game.warmShaders compiles exactly the program these will use.
 */
export function cardMaterials(front: THREE.Texture, back: THREE.Texture) {
  return {
    front: new THREE.MeshBasicMaterial({ map: front, alphaTest: 0.5, toneMapped: false }),
    back: new THREE.MeshBasicMaterial({ map: back, alphaTest: 0.5 })
  };
}

let nextId = 1;

export function makeEnemy(bank: EnemyBank, def: EnemyDef, elite: boolean, at: THREE.Vector3, wave: number): Enemy {
  const b = bank.get(def, elite);
  const size = def.size * (elite ? 1.15 : 1);
  const w = b.span * size;
  const root = new THREE.Group();
  const card = new THREE.Group();
  const mats = cardMaterials(b.front, b.back);
  const front = new THREE.Mesh(bank.plane, mats.front);
  const back = new THREE.Mesh(bank.plane, mats.back);
  front.scale.set(w, w, 1);
  back.scale.set(w, w, 1);
  back.rotation.y = Math.PI;
  const cy = size * (0.5 + b.rise);
  front.position.y = cy;
  back.position.y = cy;
  back.position.z = -0.01;
  card.add(front, back);
  const stand = new THREE.Mesh(bank.standGeo, bank.standMat);
  stand.position.y = 0.05;
  card.add(stand);
  const shadow = new THREE.Mesh(bank.shadowGeo, bank.shadowMat);
  shadow.scale.set(size * 1.1, 1, size * 0.8);
  shadow.position.y = 0.03;
  root.add(card, shadow);
  root.position.copy(at);
  // HP scales gently with the wave so late waves bite without becoming sponges
  const hp = Math.round(def.hp * (elite ? 1.8 : 1) * (1 + Math.max(0, wave - 1) * 0.06));
  return {
    id: nextId++,
    def,
    elite,
    root,
    card,
    front,
    back,
    shadow,
    pos: root.position,
    vel: new THREE.Vector3(),
    yaw: 0,
    hp,
    maxHp: hp,
    state: 'pop',
    t: 0,
    fireT: 1 + Math.random() * def.interval,
    burstLeft: 0,
    burstT: 0,
    losT: Math.random() * 0.25,
    canSee: false,
    strafe: Math.random() < 0.5 ? -1 : 1,
    strafeT: 1 + Math.random() * 2,
    stuckT: 0,
    detourT: 0,
    detour: new THREE.Vector3(),
    blinkT: def.blink ?? 0,
    slow: 0,
    slowT: 0,
    revealT: 0,
    flashT: 0,
    aimDir: new THREE.Vector3(),
    lastHitBy: '',
    size,
    eyeY: size * (1 - b.faceY) + size * 0.02,
    dealt: 0
  };
}

export function disposeEnemy(e: Enemy) {
  e.front.material.dispose();
  e.back.material.dispose();
  e.root.removeFromParent();
}

/** Which kinds a wave draws from, and how many. */
export function waveRoster(wave: number): { def: EnemyDef; elite: boolean }[] {
  const count = Math.min(26, 4 + Math.round(wave * 2.2));
  const pool = Object.values(ENEMIES).filter(d => d.minWave <= wave);
  const weights: Record<EnemyKind, number> = { scout: 5, zipper: 3, pouncer: 3, sniper: 1.4, bulwark: 1, blinker: 1.6 };
  const total = pool.reduce((s, d) => s + weights[d.kind], 0);
  const out: { def: EnemyDef; elite: boolean }[] = [];
  let bulwarks = 0;
  for (let i = 0; i < count; i++) {
    let x = Math.random() * total;
    let def = pool[0];
    for (const d of pool) {
      x -= weights[d.kind];
      if (x <= 0) {
        def = d;
        break;
      }
    }
    if (def.kind === 'bulwark' && ++bulwarks > 1 + Math.floor(wave / 4)) def = ENEMIES.scout;
    out.push({ def, elite: wave >= 3 && Math.random() < Math.min(0.25, 0.05 + wave * 0.02) });
  }
  return out;
}
