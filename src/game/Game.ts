import * as THREE from 'three';
import type { Effect, Skill } from '../skills/balance';
import { audio } from './audio';
import { cardMaterials, disposeEnemy, EnemyBank, ENEMIES, makeEnemy, waveRoster, type Enemy } from './enemies';
import { Decals, InstancePool, Particles, Tracers } from './effects';
import { hud, initialHud, type HudState, type KillItem, type Popup, type Summary } from './hud';
import { bakeMascot, crateFace, inkSplat, INK, type Wear } from './textures';
import { pickupToast, type PickupEvent } from './toasts';
import { weaponTouch } from './pickup';
import { buildViewModel, falloff, WEAPON_ORDER, WEAPONS, type WeaponDef, type WeaponId } from './weapons';
import { ARENA_R, buildWorld, paperAtmosphere, type World } from './world';
import type { Look, Quality } from '../profile';

/* ------------------------------------------------------------------ *
 *  Paper Shoot — the engine.
 *
 *  React never runs inside the frame. The loop owns the simulation and
 *  the renderer; the HUD store is written ~15 times a second, and the few
 *  things that must move every frame (crosshair, hit marker, damage
 *  numbers) are DOM nodes the engine touches directly.
 * ------------------------------------------------------------------ */

export interface GameOptions {
  canvas: HTMLCanvasElement;
  look: Look;
  tactical: Skill;
  ultimate: Skill;
  quality: Quality;
  sensitivity: number;
  fov: number;
  invertY: boolean;
  lineBoil: boolean;
  hooks: { crosshair?: HTMLElement | null; sight?: HTMLElement | null; hit?: HTMLElement | null; dmgLayer?: HTMLElement | null; minimap?: HTMLCanvasElement | null };
  onVoiceKey?: (down: boolean) => void;
}

export type Command = 'reload' | 'heal' | 'tactical' | 'ultimate' | 'switch' | 'ping' | 'pause' | 'jump' | 'crouch';

// ---- scratch (never allocate in the loop) ----
const V = () => new THREE.Vector3();
const _a = V(),
  _b = V(),
  _c = V(),
  _d = V(),
  _n = V(),
  _fwd = V(),
  _right = V(),
  _o = V();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = V();
const _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);
const ZP = new THREE.Vector3(0, 0, 1);

const SHIELD_TIERS = [50, 75, 100];
const SHIELD_COLORS = ['#f4f1ea', '#3b82c4', '#8a5cc8'];
const PLAYER_R = 0.4;
const STAND_H = 1.75;
const CROUCH_H = 1.05;
const EYE = 0.12; // eye below the top of the head

interface Dart {
  alive: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  dmg: number;
  big: boolean;
  from: Enemy | null;
}
interface Ball {
  alive: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  dmg: number;
  radius: number;
  color: THREE.Color;
  spin: number;
}
interface Crate {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  gold: boolean;
  open: boolean;
  fallV: number;
  chute: THREE.Object3D | null;
}
type PickupKind = 'ammo' | 'tape' | 'glue' | 'shield' | 'weapon' | 'ult';
interface Pickup {
  kind: PickupKind;
  weapon?: WeaponId;
  amount: number;
  obj: THREE.Object3D;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  t: number;
  alive: boolean;
}
interface Area {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  r: number;
  dps: number;
  slow: number;
  t: number;
  max: number;
  tick: number;
  color: THREE.Color;
}
interface WallFx {
  mesh: THREE.Object3D;
  colliders: import('./collision').Collider[];
  t: number;
}
interface Pull {
  pos: THREE.Vector3;
  r: number;
  strength: number;
  t: number;
  color: THREE.Color;
}
interface Ping {
  obj: THREE.Object3D;
  pos: THREE.Vector3;
  t: number;
  enemy: boolean;
}
interface DmgNum {
  el: HTMLSpanElement;
  pos: THREE.Vector3;
  value: number;
  t: number;
  eye: boolean;
  target: Enemy | null;
  shield: boolean;
}
interface Shock {
  mesh: THREE.Mesh;
  t: number;
  max: number;
  r: number;
}

export class Game {
  // ---- rendering ----
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private vmScene = new THREE.Scene();
  private vmCamera = new THREE.PerspectiveCamera(58, 1, 0.01, 10);
  private world: World;
  private particles: Particles;
  private decals: Decals;
  private tracers: Tracers;
  private darts: InstancePool<Dart>;
  private balls: InstancePool<Ball>;
  private bank = new EnemyBank();
  private raf = 0;
  private last = 0;
  private time = 0;
  private timeScale = 1;
  private hitStop = 0;
  private pixelScale = 1;
  private fpsAcc = 0;
  private fpsFrames = 0;
  private fps = 60;
  private lowFpsFor = 0;
  private hudT = 0;
  private mapT = 0;
  private disposed = false;

  // ---- input ----
  private keys = new Set<string>();
  private mouseDown = false;
  private adsHeld = false;
  private firedThisPress = false;
  private locked = false;

  // ---- player ----
  private p = {
    pos: V(),
    vel: V(),
    yaw: Math.PI,
    pitch: 0,
    onGround: true,
    height: STAND_H,
    crouch: false,
    sliding: 0,
    coyote: 0,
    jumpBuf: 0,
    hp: 100,
    shield: 50,
    tier: 0,
    alive: true,
    dashT: 0,
    dashDir: V(),
    bob: 0,
    stepT: 0,
    landDip: 0,
    lastHurt: -99,
    healing: null as null | { kind: 'tape' | 'glue'; t: number; dur: number },
    tape: 1,
    glue: 1,
    deathT: 0,
    recoilPitch: 0,
    recoilYaw: 0,
    shake: 0,
    fovKick: 0,
    ads: 0,
    wasOnGround: true,
    airT: 0
  };

  // ---- weapons ----
  private owned = new Map<WeaponId, { mag: number; reserve: number }>();
  private weapon: WeaponId = 'pencil';
  private fireCd = 0;
  private reloadT = 0;
  private swapT = 0;
  private bloom = 0;
  private vm = new Map<WeaponId, { group: THREE.Group; muzzle: THREE.Object3D }>();
  private flashT = 0;
  private vmKick = 0;

  // ---- skills ----
  private tactical: Skill;
  private ultimate: Skill;
  private tacCd = 0;
  private ultCd: number;
  private buffs: { stat: string; mult: number; t: number; max: number; color: string }[] = [];
  private areas: Area[] = [];
  private walls: WallFx[] = [];
  private pulls: Pull[] = [];
  private decoy: { obj: THREE.Group; pos: THREE.Vector3; t: number } | null = null;
  private decoyTex: { front: THREE.Texture; back: THREE.Texture; span: number; rise: number } | null = null;
  private splatTex: THREE.Texture;
  private shocks: Shock[] = [];
  private warmMaterials: THREE.Material[] = [];

  // ---- world state ----
  private enemies: Enemy[] = [];
  private spawnQueue: { def: Enemy['def']; elite: boolean; at: number }[] = [];
  private crates: Crate[] = [];
  private pickups: Pickup[] = [];
  private pings: Ping[] = [];
  private telegraphs: THREE.LineSegments;
  private ring: THREE.Mesh<THREE.CylinderGeometry, THREE.ShaderMaterial>;
  private ringState = { cx: 0, cz: 0, r: ARENA_R, r0: ARENA_R, r1: ARENA_R, tx: 0, tz: 0, phase: 'calm' as 'hold' | 'shrink' | 'calm', t: 0, holdT: 0, shrinkT: 0 };
  private wave = 0;
  private intermission = 0;
  private plane: { obj: THREE.Object3D; from: THREE.Vector3; to: THREE.Vector3; t: number; dropAt: number; dropped: boolean; target: THREE.Vector3 } | null = null;
  private crateMat: THREE.MeshToonMaterial;
  private goldMat: THREE.MeshToonMaterial;
  private crateGeo = new THREE.BoxGeometry(1.1, 1.1, 1.1);
  private shared: { [k: string]: THREE.BufferGeometry | THREE.Material } = {};

  // ---- score ----
  private score = 0;
  private combo = 1;
  private comboT = 0;
  private bestCombo = 1;
  private kills = 0;
  private eyeshots = 0;
  private shots = 0;
  private hits = 0;
  private damage = 0;
  private waveDamageTaken = 0;
  private breakdown = new Map<string, number>();
  private killfeed: KillItem[] = [];
  private popups: Popup[] = [];
  private callouts: HudState['callouts'] = [];
  private toasts: HudState['toasts'] = [];
  private damageDirs: HudState['damageDirs'] = [];
  private uid = 1;
  private runTime = 0;

  // ---- dom hooks ----
  private dmg: DmgNum[] = [];
  private crossSpread = -1;
  private sightAds = -1;
  private sightWeapon = '';

  private opts: GameOptions;

  constructor(opts: GameOptions) {
    this.opts = opts;
    const q = opts.quality;
    this.renderer = new THREE.WebGLRenderer({ canvas: opts.canvas, antialias: q !== 'low', powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.pixelScale = q === 'low' ? 0.7 : q === 'medium' ? 1 : q === 'high' ? 1.5 : 1.25;
    this.applyPixelRatio();

    paperAtmosphere(this.scene);
    this.camera = new THREE.PerspectiveCamera(opts.fov, 1, 0.08, 260);
    this.vmScene.add(new THREE.HemisphereLight('#fff8ea', '#b8a27a', 1.5));
    const vsun = new THREE.DirectionalLight('#ffffff', 1.4);
    vsun.position.set(1, 2, 1.5);
    this.vmScene.add(vsun);

    this.world = buildWorld(this.scene);
    this.world.materials.ink.uniforms.uBoil.value = opts.lineBoil ? 1 : 0;
    this.addClouds();

    this.particles = new Particles(q === 'low' ? 350 : 800);
    this.particles.density = q === 'low' ? 0.5 : 1;
    this.decals = new Decals(q === 'low' ? 40 : 100);
    this.tracers = new Tracers(48);
    this.scene.add(this.particles.mesh, this.decals.mesh, this.tracers.mesh);

    // darts: little folded paper planes
    const planeGeo = paperPlaneGeometry();
    this.darts = new InstancePool<Dart>(planeGeo, new THREE.MeshBasicMaterial({ color: '#fffdf7', side: THREE.DoubleSide }), 160, () => ({ alive: false, pos: V(), vel: V(), life: 0, dmg: 0, big: false, from: null }));
    this.scene.add(this.darts.mesh);
    // skill projectiles: crumpled balls
    const ballGeo = new THREE.IcosahedronGeometry(0.32, 0);
    this.balls = new InstancePool<Ball>(ballGeo, new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap: this.world.ramp }), 40, () => ({ alive: false, pos: V(), vel: V(), life: 0, dmg: 0, radius: 0, color: new THREE.Color(), spin: 0 }));
    this.balls.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(40 * 3).fill(1), 3);
    this.scene.add(this.balls.mesh);

    // sniper telegraph lines
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(16 * 6), 3).setUsage(THREE.DynamicDrawUsage));
    this.telegraphs = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ color: '#e5533d', transparent: true, opacity: 0.85, depthWrite: false }));
    this.telegraphs.frustumCulled = false;
    this.scene.add(this.telegraphs);

    // the Eraser Storm wall
    this.ring = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 60, 96, 1, true), ringMaterial());
    this.ring.position.y = 30;
    this.ring.renderOrder = 2;
    this.scene.add(this.ring);

    this.crateMat = new THREE.MeshToonMaterial({ map: crateFace(false), gradientMap: this.world.ramp });
    this.goldMat = new THREE.MeshToonMaterial({ map: crateFace(true), gradientMap: this.world.ramp });
    this.splatTex = inkSplat('#ffffff', 21);
    this.makeShared();

    for (const id of WEAPON_ORDER) {
      const v = buildViewModel(id, this.world.ramp);
      v.group.visible = false;
      v.group.scale.setScalar(0.72);
      this.vmScene.add(v.group);
      this.vm.set(id, v);
    }

    this.tactical = opts.tactical;
    this.ultimate = opts.ultimate;
    this.ultCd = opts.ultimate.cooldown * 0.6;
    this.bank.warm();
    this.buildDmgPool();

    this.bind();
    this.resize();
    this.reset();
    hud.set({ ...initialHud, phase: 'loading' });
    // the ready card appears only when every shader is linked: no compile stall mid-match
    this.warmShaders()
      .catch(() => undefined)
      .then(() => {
        if (!this.disposed && hud.get().phase === 'loading') hud.set({ phase: 'ready' });
      });
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  // ================================================================= setup

  private applyPixelRatio() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(Math.max(0.5, Math.min(2, dpr * this.pixelScale * (dpr > 1.5 ? 0.8 : 1))));
  }

  private makeShared() {
    const ramp = this.world.ramp;
    const toon = (c: string) => new THREE.MeshToonMaterial({ color: c, gradientMap: ramp });
    this.shared = {
      tapeGeo: new THREE.TorusGeometry(0.22, 0.09, 6, 12),
      tapeMat: toon('#9fd8ff'),
      glueGeo: new THREE.CylinderGeometry(0.11, 0.11, 0.5, 8),
      glueMat: toon('#8a5cc8'),
      ammoGeo: new THREE.BoxGeometry(0.42, 0.18, 0.28),
      ammoMat: toon('#d0d4da'),
      shieldGeo: new THREE.OctahedronGeometry(0.32, 0),
      ultGeo: new THREE.OctahedronGeometry(0.28, 0),
      ultMat: toon('#ffd84a'),
      pinGeo: new THREE.ConeGeometry(0.14, 0.9, 6),
      pinHeadGeo: new THREE.SphereGeometry(0.26, 8, 6),
      pinMat: toon('#e5533d'),
      pinMatB: toon('#3b82c4'),
      chuteGeo: new THREE.ConeGeometry(1.6, 1, 8, 1, true),
      chuteMat: new THREE.MeshToonMaterial({ color: '#fffdf7', gradientMap: ramp, side: THREE.DoubleSide }),
      shockGeo: new THREE.RingGeometry(0.85, 1, 40),
      puddleGeo: new THREE.CircleGeometry(1, 28),
      wallGeo: new THREE.BoxGeometry(1, 1, 1),
      wallMat: new THREE.MeshToonMaterial({ color: '#fbf8ef', gradientMap: ramp, map: this.world.materials.toon.map })
    };
    for (let tier = 0; tier < 3; tier++) this.shared[`shieldMat${tier}`] = toon(SHIELD_COLORS[tier]);
    (this.shared.puddleGeo as THREE.BufferGeometry).rotateX(-Math.PI / 2);
    (this.shared.shockGeo as THREE.BufferGeometry).rotateX(-Math.PI / 2);
  }

  private addClouds() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fffdf7';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 5;
    const blobs: [number, number, number][] = [
      [70, 80, 34],
      [118, 60, 44],
      [170, 76, 34],
      [130, 90, 30],
      [96, 92, 26]
    ];
    ctx.beginPath();
    for (const [x, y, r] of blobs) ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    for (const [x, y, r] of blobs) {
      ctx.beginPath();
      ctx.arc(x, y, r - 2, 0, Math.PI * 2);
      ctx.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.4, fog: false, depthWrite: false });
    const geo = new THREE.PlaneGeometry(1, 0.5);
    const mesh = new THREE.InstancedMesh(geo, mat, 14);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + Math.random() * 0.3;
      const d = 150 + Math.random() * 40;
      _a.set(Math.cos(a) * d, 32 + Math.random() * 26, Math.sin(a) * d);
      _q.setFromRotationMatrix(_m.lookAt(_a, _b.set(0, _a.y, 0), UP));
      const s = 30 + Math.random() * 22;
      _m.compose(_a, _q, _s.set(s, s, s));
      mesh.setMatrixAt(i, _m);
    }
    mesh.renderOrder = -1;
    this.scene.add(mesh);
    this.shared.cloudTex = t as unknown as THREE.Material;
  }

  /**
   * Compile every shader program a match can need, now, while the player is on the
   * ready card. On Windows/ANGLE each program is compiled through D3D the first time
   * it is drawn, and that costs tens to hundreds of ms — which showed up as stutter on
   * the first shots, the first kill, the first bot dart (issue #4). Program reuse is
   * keyed on material parameters, so one stand-in per material shape covers every
   * later instance of it.
   */
  private warmShaders(): Promise<unknown> {
    const card = this.bank.get(ENEMIES.scout, false);
    const faces = cardMaterials(card.front, card.back);
    // per-use materials come from the same factories their spawn sites call
    const temp: THREE.Material[] = [faces.front, faces.back, puddleMaterial(this.splatTex, new THREE.Color()), shockMaterial(new THREE.Color())];
    const shared = Object.values(this.shared).filter((v): v is THREE.Material => v instanceof THREE.Material);
    const stand = new THREE.Group();
    for (const m of [...temp, ...shared, this.crateMat, this.goldMat, this.bank.shadowMat, this.bank.standMat]) stand.add(new THREE.Mesh(this.crateGeo, m));
    this.scene.add(stand);
    // pooled meshes start empty; give each one instance so its (instanced) program compiles
    const pools = [this.particles.mesh, this.decals.mesh, this.darts.mesh, this.balls.mesh].map(p => [p, p.count] as const);
    pools.forEach(([p]) => (p.count = 1));
    // the muzzle flash and the weapons not in hand are hidden until used
    const hidden: THREE.Object3D[] = [];
    this.vmScene.traverse(o => {
      if (!o.visible) {
        hidden.push(o);
        o.visible = true;
      }
    });
    // compileAsync starts every compile now (in parallel where KHR_parallel_shader_compile
    // exists) and resolves once the driver has finished linking, so the wait happens
    // behind the ready card instead of in the first frames of play.
    const done = Promise.all([this.renderer.compileAsync(this.scene, this.camera), this.renderer.compileAsync(this.vmScene, this.vmCamera)]);
    hidden.forEach(o => (o.visible = false));
    pools.forEach(([p, n]) => (p.count = n));
    stand.removeFromParent();
    // keep the stand-ins alive: disposing the last user of a program deletes it
    this.warmMaterials = temp;
    return done;
  }

  /** Dev/test helper: how many shader programs exist. The issue #4 play-test reads it via window.__game: it must not grow during a match. */
  debugPrograms() {
    return this.renderer.info.programs?.length ?? 0;
  }

  private buildDmgPool() {
    const layer = this.opts.hooks.dmgLayer;
    if (!layer) return;
    layer.textContent = '';
    for (let i = 0; i < 18; i++) {
      const el = document.createElement('span');
      el.className = 'dmg-num';
      el.style.opacity = '0';
      layer.appendChild(el);
      this.dmg.push({ el, pos: V(), value: 0, t: 0, eye: false, target: null, shield: false });
    }
  }

  private reset() {
    const p = this.p;
    p.pos.copy(this.world.spawnPoint);
    p.vel.set(0, 0, 0);
    p.yaw = Math.PI; // facing the tower
    p.pitch = -0.05;
    p.hp = 100;
    p.shield = 50;
    p.tier = 0;
    p.alive = true;
    p.tape = 1;
    p.glue = 1;
    this.owned.clear();
    this.owned.set('pencil', { mag: WEAPONS.pencil.mag, reserve: Infinity });
    this.setWeapon('pencil', true);
    for (const s of this.world.crateSpots) this.addCrate(s, false);
  }

  // ================================================================= input

  private bind() {
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMouse);
    window.addEventListener('mousedown', this.onDown);
    window.addEventListener('mouseup', this.onUp);
    window.addEventListener('wheel', this.onWheel, { passive: true });
    window.addEventListener('resize', this.resize);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('pointerlockchange', this.onLock);
    document.addEventListener('visibilitychange', this.onVis);
    window.addEventListener('contextmenu', this.noMenu);
  }

  private noMenu = (e: Event) => {
    if (this.locked) e.preventDefault();
  };

  private onVis = () => {
    if (document.hidden && hud.get().phase === 'playing') this.pause();
  };

  private onBlur = () => {
    this.keys.clear();
    this.mouseDown = false;
    this.adsHeld = false;
  };

  private onLock = () => {
    this.locked = document.pointerLockElement === this.opts.canvas;
    if (!this.locked && hud.get().phase === 'playing') this.pause();
  };

  private onKey = (e: KeyboardEvent) => {
    const phase = hud.get().phase;
    if (phase !== 'playing') return;
    if (e.code === 'Tab') e.preventDefault();
    if (e.repeat) return;
    this.keys.add(e.code);
    switch (e.code) {
      case 'Space':
        this.p.jumpBuf = 0.14;
        break;
      case 'KeyR':
        this.command('reload');
        break;
      case 'KeyQ':
        this.command('tactical');
        break;
      case 'KeyZ':
      case 'KeyX':
        this.command('ultimate');
        break;
      case 'KeyH':
      case 'Digit5':
        this.command('heal');
        break;
      case 'KeyE':
      case 'KeyF':
        this.interact();
        break;
      case 'KeyG':
        this.command('ping');
        break;
      case 'KeyV':
        this.opts.onVoiceKey?.(true);
        break;
      case 'ControlLeft':
      case 'KeyC':
        this.tryCrouch(true);
        break;
      case 'Digit1':
      case 'Digit2':
      case 'Digit3':
      case 'Digit4': {
        const id = WEAPON_ORDER[Number(e.code.slice(5)) - 1];
        if (this.owned.has(id)) this.setWeapon(id);
        break;
      }
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
    if (e.code === 'KeyV') this.opts.onVoiceKey?.(false);
    if (e.code === 'ControlLeft' || e.code === 'KeyC') this.tryCrouch(false);
  };

  private onMouse = (e: MouseEvent) => {
    if (!this.locked || hud.get().phase !== 'playing') return;
    const zoom = 1 - this.p.ads * (1 - WEAPONS[this.weapon].adsFov) * 0.85;
    const k = 0.0022 * this.opts.sensitivity * zoom;
    this.p.yaw -= e.movementX * k;
    this.p.pitch -= e.movementY * k * (this.opts.invertY ? -1 : 1);
    this.p.pitch = Math.max(-1.52, Math.min(1.52, this.p.pitch));
  };

  private onDown = (e: MouseEvent) => {
    if (hud.get().phase !== 'playing') return;
    if (!this.locked) {
      this.lock();
      return;
    }
    audio.unlock();
    if (e.button === 0) {
      this.mouseDown = true;
      this.firedThisPress = false;
    } else if (e.button === 2) this.adsHeld = true;
    else if (e.button === 1) this.command('ping');
  };

  private onUp = (e: MouseEvent) => {
    if (e.button === 0) this.mouseDown = false;
    else if (e.button === 2) this.adsHeld = false;
  };

  private onWheel = (e: WheelEvent) => {
    if (hud.get().phase !== 'playing' || !this.locked) return;
    this.cycleWeapon(e.deltaY > 0 ? 1 : -1);
  };

  private lock() {
    const c = this.opts.canvas;
    // Raw mouse input where the browser allows it, plain lock otherwise; a refusal
    // (no user gesture, embedded frame) just leaves the "click to aim" path open.
    const plain = () => {
      try {
        const r = c.requestPointerLock() as unknown as Promise<void> | undefined;
        r?.catch?.(() => {});
      } catch {
        /* lock refused */
      }
    };
    try {
      const r = c.requestPointerLock({ unadjustedMovement: true } as never) as unknown as Promise<void> | undefined;
      r?.catch?.(plain);
    } catch {
      plain();
    }
  }

  /** Voice commands and on-screen buttons come in through here. */
  command(cmd: Command) {
    if (hud.get().phase !== 'playing' && cmd !== 'pause') return;
    switch (cmd) {
      case 'reload':
        this.startReload();
        break;
      case 'tactical':
        this.useSkill('tactical');
        break;
      case 'ultimate':
        this.useSkill('ultimate');
        break;
      case 'heal':
        this.startHeal();
        break;
      case 'switch':
        this.cycleWeapon(1);
        break;
      case 'ping':
        this.ping();
        break;
      case 'pause':
        this.pause();
        break;
      case 'jump':
        this.p.jumpBuf = 0.14;
        break;
      case 'crouch':
        this.tryCrouch(!this.p.crouch);
        break;
    }
  }

  /** Dev/test helper: turn to face the nearest live bot (used by the automated play-test). */
  debugAimNearest(): boolean {
    let best: Enemy | null = null;
    let bd = Infinity;
    for (const e of this.enemies) {
      if (e.state === 'dying' || e.state === 'pop') continue;
      const d = e.pos.distanceTo(this.p.pos);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    if (!best) return false;
    const eye = this.eyePos(_o);
    const dx = best.pos.x - eye.x;
    const dz = best.pos.z - eye.z;
    const dy = best.pos.y + best.size * 0.5 - eye.y;
    this.p.yaw = Math.atan2(-dx, -dz);
    this.p.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    return true;
  }

  /** Dev/test helper: pull one trigger. */
  debugFire() {
    const w = WEAPONS[this.weapon];
    const a = this.owned.get(this.weapon)!;
    if (a.mag <= 0) return;
    a.mag--;
    this.fire(w);
  }

  debugState() {
    return { score: this.score, kills: this.kills, hits: this.hits, shots: this.shots, enemies: this.enemies.length, wave: this.wave, hp: this.p.hp, fps: Math.round(this.fps) };
  }

  // ================================================================= lifecycle

  start() {
    audio.unlock();
    this.lock();
    hud.set({ phase: 'playing' });
    if (this.wave === 0) this.beginWave(1);
    this.last = performance.now();
  }

  pause() {
    if (hud.get().phase !== 'playing') return;
    this.keys.clear();
    this.mouseDown = false;
    this.adsHeld = false;
    hud.set({ phase: 'paused' });
    if (document.pointerLockElement) document.exitPointerLock();
  }

  resume() {
    if (hud.get().phase !== 'paused') return;
    hud.set({ phase: 'playing' });
    this.lock();
    this.last = performance.now();
  }

  setOptions(o: Partial<Pick<GameOptions, 'sensitivity' | 'fov' | 'invertY' | 'lineBoil'>>) {
    Object.assign(this.opts, o);
    this.world.materials.ink.uniforms.uBoil.value = this.opts.lineBoil ? 1 : 0;
  }

  setListening(on: boolean) {
    hud.set({ listening: on });
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousemove', this.onMouse);
    window.removeEventListener('mousedown', this.onDown);
    window.removeEventListener('mouseup', this.onUp);
    window.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('contextmenu', this.noMenu);
    document.removeEventListener('pointerlockchange', this.onLock);
    document.removeEventListener('visibilitychange', this.onVis);
    if (document.pointerLockElement) document.exitPointerLock();
    for (const e of this.enemies) disposeEnemy(e);
    this.world.dispose();
    this.particles.dispose();
    this.decals.dispose();
    this.tracers.dispose();
    this.darts.dispose();
    this.balls.dispose();
    this.bank.dispose();
    this.decoyTex?.front.dispose();
    this.decoyTex?.back.dispose();
    this.splatTex.dispose();
    this.warmMaterials.forEach(m => m.dispose());
    this.crateMat.map?.dispose();
    this.goldMat.map?.dispose();
    this.crateMat.dispose();
    this.goldMat.dispose();
    this.crateGeo.dispose();
    this.ring.geometry.dispose();
    this.ring.material.dispose();
    this.telegraphs.geometry.dispose();
    for (const v of Object.values(this.shared)) (v as { dispose?: () => void }).dispose?.();
    this.scene.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.geometry) m.geometry.dispose();
    });
    this.vmScene.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | undefined;
      mat?.dispose?.();
    });
    this.renderer.dispose();
    for (const d of this.dmg) d.el.remove();
  }

  private resize = () => {
    const c = this.opts.canvas;
    const w = c.clientWidth || window.innerWidth;
    const h = c.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.vmCamera.aspect = w / h;
    this.vmCamera.updateProjectionMatrix();
  };

  // ================================================================= loop

  private frame = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const raw = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.measure(raw);
    const phase = hud.get().phase;
    if (phase === 'playing' || phase === 'dead') {
      if (this.hitStop > 0) {
        this.hitStop -= raw;
        this.timeScale = 0.12;
      } else this.timeScale += (1 - this.timeScale) * Math.min(1, raw * 12);
      const dt = raw * this.timeScale;
      // two half-steps keep fast movement from tunnelling through thin props
      const half = dt / 2;
      this.update(half);
      this.update(half);
      this.updateVisuals(dt, raw);
    } else {
      this.world.update(this.time + now / 1000);
    }
    this.renderer.autoClear = true;
    this.renderer.render(this.scene, this.camera);
    if (this.p.alive && phase !== 'loading') {
      this.renderer.autoClear = false;
      this.renderer.clearDepth();
      this.renderer.render(this.vmScene, this.vmCamera);
    }
    this.hudT -= raw;
    if (this.hudT <= 0) {
      this.hudT = 1 / 15;
      this.syncHud();
    }
  };

  /** Frame-time watchdog: on "auto", resolution follows the frame rate. */
  private measure(raw: number) {
    this.fpsAcc += raw;
    this.fpsFrames++;
    if (this.fpsAcc < 0.5) return;
    this.fps = this.fpsFrames / this.fpsAcc;
    this.fpsAcc = 0;
    this.fpsFrames = 0;
    if (this.opts.quality !== 'auto' || hud.get().phase !== 'playing') return;
    if (this.fps < 52) {
      this.lowFpsFor += 0.5;
      if (this.lowFpsFor >= 1.5 && this.pixelScale > 0.55) {
        this.pixelScale = Math.max(0.55, this.pixelScale - 0.12);
        this.applyPixelRatio();
        this.resize();
        this.lowFpsFor = 0;
      }
    } else {
      this.lowFpsFor = 0;
      if (this.fps > 75 && this.pixelScale < 1.25) {
        this.pixelScale = Math.min(1.25, this.pixelScale + 0.05);
        this.applyPixelRatio();
        this.resize();
      }
    }
  }

  private update(dt: number) {
    if (dt <= 0) return;
    this.time += dt;
    this.runTime += dt;
    if (this.p.alive) {
      this.updatePlayer(dt);
      this.updateWeapon(dt);
      this.updateSkills(dt);
    } else {
      this.p.deathT += dt;
      if (this.p.deathT > 1.6 && hud.get().phase === 'dead') this.finish();
    }
    this.updateRing(dt);
    this.updateWaves(dt);
    this.updateEnemies(dt);
    this.updateDarts(dt);
    this.updateBalls(dt);
    this.updateLoot(dt);
    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) this.combo = 1;
    }
  }

  // ================================================================= player

  private tryCrouch(down: boolean) {
    const p = this.p;
    if (down && !p.crouch) {
      const speed = Math.hypot(p.vel.x, p.vel.z);
      if (p.onGround && speed > 7.4) {
        // slide: a burst along the run, then low friction
        p.sliding = 0.85;
        _a.set(p.vel.x, 0, p.vel.z).normalize();
        p.vel.x += _a.x * 3.2;
        p.vel.z += _a.z * 3.2;
        audio.play('land');
      }
    }
    p.crouch = down;
  }

  private buff(stat: string) {
    let m = 1;
    for (const b of this.buffs) if (b.stat === stat) m = Math.max(m, b.mult);
    return m;
  }

  private updatePlayer(dt: number) {
    const p = this.p;
    const k = this.keys;
    const fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const str = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const sprint = (k.has('ShiftLeft') || k.has('ShiftRight')) && fwd > 0 && !p.crouch && p.ads < 0.5 && !p.healing;
    _fwd.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
    _right.set(-_fwd.z, 0, _fwd.x);
    _a.set(0, 0, 0).addScaledVector(_fwd, fwd).addScaledVector(_right, str);
    if (_a.lengthSq() > 1) _a.normalize();

    const w = WEAPONS[this.weapon];
    let max = sprint ? 9.4 : p.crouch ? 3.6 : 6.6;
    max *= w.mobility * this.buff('speed');
    if (p.ads > 0.5) max *= 0.62;
    if (p.healing) max *= 0.45;

    if (p.dashT > 0) {
      p.dashT -= dt;
      p.vel.x = p.dashDir.x;
      p.vel.z = p.dashDir.z;
      p.vel.y = Math.max(p.vel.y, 0);
      if (Math.random() < 0.6) this.particles.burst(_b.copy(p.pos).setY(p.pos.y + 0.8), 2, { color: [this.tactical.color, INK], speed: 1, size: 0.18, life: 0.5, gravity: 1 });
    } else if (p.onGround) {
      if (p.sliding > 0) {
        p.sliding -= dt;
        const drag = Math.exp(-1.1 * dt);
        p.vel.x *= drag;
        p.vel.z *= drag;
        if (!p.crouch || Math.hypot(p.vel.x, p.vel.z) < 4) p.sliding = 0;
      } else {
        // accelerate toward the wished velocity
        const tx = _a.x * max;
        const tz = _a.z * max;
        const accel = _a.lengthSq() > 0 ? 70 : 48;
        const dx = tx - p.vel.x;
        const dz = tz - p.vel.z;
        const dl = Math.hypot(dx, dz);
        const step = Math.min(dl, accel * dt);
        if (dl > 1e-5) {
          p.vel.x += (dx / dl) * step;
          p.vel.z += (dz / dl) * step;
        }
      }
    } else {
      // air control: steer, don't brake
      p.vel.x += _a.x * 14 * dt;
      p.vel.z += _a.z * 14 * dt;
      const hs = Math.hypot(p.vel.x, p.vel.z);
      const cap = Math.max(max, 9.6) * 1.15;
      if (hs > cap) {
        p.vel.x *= cap / hs;
        p.vel.z *= cap / hs;
      }
    }

    // jump with coyote time and a buffer
    p.coyote = p.onGround ? 0.11 : p.coyote - dt;
    p.jumpBuf -= dt;
    if (p.jumpBuf > 0 && p.coyote > 0) {
      p.vel.y = 7.4;
      p.onGround = false;
      p.coyote = 0;
      p.jumpBuf = 0;
      p.sliding = 0;
      audio.play('jump');
    }
    p.vel.y -= 22 * dt;

    // move & collide
    p.pos.x += p.vel.x * dt;
    p.pos.z += p.vel.z * dt;
    p.pos.y += p.vel.y * dt;
    const targetH = p.crouch || p.sliding > 0 ? CROUCH_H : STAND_H;
    p.height += (targetH - p.height) * Math.min(1, dt * 14);
    const ground = this.world.collision.resolve(p.pos, PLAYER_R, p.height, 0.55, p.vel.y);
    const r = Math.hypot(p.pos.x, p.pos.z);
    if (r > ARENA_R) {
      p.pos.x *= ARENA_R / r;
      p.pos.z *= ARENA_R / r;
    }
    if (p.pos.y <= ground + 0.001 && p.vel.y <= 0) {
      if (!p.wasOnGround && p.airT > 0.25) {
        p.landDip = Math.min(0.22, -p.vel.y * 0.02);
        audio.play('land');
      }
      p.pos.y = ground;
      p.vel.y = 0;
      p.onGround = true;
      p.airT = 0;
    } else {
      p.onGround = p.pos.y - ground < 0.05 && p.vel.y <= 0;
      if (p.onGround) {
        p.pos.y = ground;
        p.vel.y = 0;
      } else p.airT += dt;
    }
    p.wasOnGround = p.onGround;

    // footsteps + head bob
    const hs = Math.hypot(p.vel.x, p.vel.z);
    if (p.onGround && hs > 1 && p.sliding <= 0) {
      p.bob += dt * hs * 1.25;
      p.stepT -= dt * hs;
      if (p.stepT <= 0) {
        p.stepT = 2.6;
        audio.play('step');
      }
    } else p.bob += (Math.round(p.bob / Math.PI) * Math.PI - p.bob) * Math.min(1, dt * 6);
    p.fovKick += ((sprint && hs > 7 ? 6 : 0) + (p.sliding > 0 ? 8 : 0) + (p.dashT > 0 ? 12 : 0) - p.fovKick) * Math.min(1, dt * 7);
    p.landDip *= Math.exp(-dt * 7);

    // heal channel
    if (p.healing) {
      p.healing.t += dt;
      if (this.mouseDown) p.healing = null; // shooting cancels
      else if (p.healing.t >= p.healing.dur) {
        if (p.healing.kind === 'tape') {
          p.tape--;
          p.shield = Math.min(SHIELD_TIERS[p.tier], p.shield + 50);
        } else {
          p.glue--;
          p.hp = Math.min(100, p.hp + 50);
        }
        audio.play('heal');
        this.particles.burst(_b.copy(p.pos).setY(p.pos.y + 1), 14, { color: p.healing.kind === 'tape' ? SHIELD_COLORS[p.tier] : '#e5533d', speed: 2.5, size: 0.14, life: 0.9, up: 2, gravity: -1 });
        p.healing = null;
      }
    }
  }

  private startHeal() {
    const p = this.p;
    if (p.healing) return;
    const needShield = p.shield < SHIELD_TIERS[p.tier];
    const needHp = p.hp < 100;
    if (needShield && p.tape > 0) p.healing = { kind: 'tape', t: 0, dur: 1.4 };
    else if (needHp && p.glue > 0) p.healing = { kind: 'glue', t: 0, dur: 2.6 };
    else {
      this.callout(p.tape + p.glue === 0 ? 'call.noHeals' : 'call.full');
      return;
    }
    this.reloadT = 0;
  }

  // ================================================================= weapons

  private setWeapon(id: WeaponId, instant = false) {
    if (id === this.weapon && !instant) return;
    this.vm.get(this.weapon)!.group.visible = false;
    this.weapon = id;
    this.vm.get(id)!.group.visible = true;
    this.reloadT = 0;
    this.swapT = instant ? 0 : 0.32;
    this.bloom = 0;
    if (!instant) audio.play('reload');
  }

  private cycleWeapon(dir: number) {
    const list = WEAPON_ORDER.filter(w => this.owned.has(w));
    if (list.length < 2) return;
    const i = list.indexOf(this.weapon);
    this.setWeapon(list[(i + dir + list.length) % list.length]);
  }

  private startReload() {
    const w = WEAPONS[this.weapon];
    const a = this.owned.get(this.weapon)!;
    if (this.reloadT > 0 || a.mag >= w.mag || a.reserve <= 0 || this.swapT > 0) return;
    this.reloadT = w.reload / this.buff('reload');
    this.p.healing = null;
    audio.play('reload');
  }

  private updateWeapon(dt: number) {
    const p = this.p;
    const w = WEAPONS[this.weapon];
    const a = this.owned.get(this.weapon)!;
    this.fireCd -= dt;
    this.bloom = Math.max(0, this.bloom - dt * 0.09);
    if (this.swapT > 0) this.swapT -= dt;
    const canAds = this.reloadT <= 0 && this.swapT <= 0 && !p.healing && p.sliding <= 0;
    p.ads += ((this.adsHeld && canAds ? 1 : 0) - p.ads) * Math.min(1, dt / w.adsTime * 2.2);

    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        const need = w.mag - a.mag;
        const take = Math.min(need, a.reserve);
        a.mag += take;
        if (a.reserve !== Infinity) a.reserve -= take;
        this.reloadT = 0;
      }
    }

    const wantFire = this.mouseDown && (w.auto || !this.firedThisPress);
    if (!wantFire || this.fireCd > 0 || this.reloadT > 0 || this.swapT > 0 || p.healing || p.dashT > 0) return;
    if (a.mag <= 0) {
      if (!this.firedThisPress) audio.play('empty');
      this.firedThisPress = true;
      this.startReload();
      return;
    }
    this.firedThisPress = true;
    this.fireCd = w.interval / this.buff('fireRate');
    a.mag--;
    this.fire(w);
    if (a.mag === 0) this.startReload();
  }

  private eyePos(out: THREE.Vector3) {
    return out.set(this.p.pos.x, this.p.pos.y + this.p.height - EYE, this.p.pos.z);
  }

  private aimDir(out: THREE.Vector3) {
    const p = this.p;
    const cp = Math.cos(p.pitch);
    return out.set(-Math.sin(p.yaw) * cp, Math.sin(p.pitch), -Math.cos(p.yaw) * cp);
  }

  private spread(w: WeaponDef) {
    const p = this.p;
    const moving = Math.min(1, Math.hypot(p.vel.x, p.vel.z) / 7);
    const base = w.spreadHip + (w.spreadAds - w.spreadHip) * p.ads;
    return base + this.bloom + moving * 0.012 * (1 - p.ads * 0.7) + (p.onGround ? 0 : 0.03);
  }

  private fire(w: WeaponDef) {
    const p = this.p;
    this.shots++;
    audio.play(w.sfx);
    this.flashT = 0.05;
    this.vmKick = 1;
    p.recoilPitch += w.recoil * (1 - p.ads * 0.35);
    p.recoilYaw += (Math.random() - 0.5) * w.recoil * 0.5;
    p.shake = Math.max(p.shake, w.pellets > 1 ? 0.25 : 0.08);
    const origin = this.eyePos(_o);
    const muzzle = _c.copy(origin).addScaledVector(this.aimDir(_d), 0.55);
    _right.set(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
    muzzle.addScaledVector(_right, 0.16).y -= 0.12;
    const spread = this.spread(w);
    let anyHit = false;
    let eyeHit = false;
    let killed = false;
    for (let i = 0; i < w.pellets; i++) {
      this.aimDir(_d);
      // a cone: random point on a disc, uniform-ish
      const ang = Math.random() * Math.PI * 2;
      const rad = Math.sqrt(Math.random()) * spread;
      _a.crossVectors(_d, UP).normalize();
      _b.crossVectors(_a, _d).normalize();
      _d.addScaledVector(_a, Math.cos(ang) * rad).addScaledVector(_b, Math.sin(ang) * rad).normalize();
      const tw = this.world.collision.raycast(origin, _d, w.range, _n);
      const hit = this.hitEnemies(origin, _d, Math.min(tw, w.range));
      const end = _a.copy(origin).addScaledVector(_d, hit ? hit.t : Math.min(tw, w.range));
      this.tracers.add(muzzle, end, w.tracerWidth);
      if (hit) {
        anyHit = true;
        const dmg = w.damage * falloff(w, hit.t) * this.buff('damage') * (hit.eye ? w.eyeMult : 1);
        eyeHit ||= hit.eye;
        killed = this.damageEnemy(hit.e, dmg, hit.eye, end, w.id) || killed;
      } else if (tw !== Infinity) {
        this.decals.add(end, _n, 0.22 + Math.random() * 0.15);
        if (i % 3 === 0) this.particles.burst(end, 3, { color: ['#fbf8ef', '#d8cfb8'], speed: 3, size: 0.09, life: 0.6, dir: _n, cone: 0.8 });
      }
    }
    this.bloom = Math.min(0.06, this.bloom + w.bloom);
    if (anyHit) {
      this.hits++;
      this.hitMark(killed ? 'kill' : eyeHit ? 'eye' : 'hit');
      audio.play(eyeHit ? 'eyeshot' : 'hit');
    }
  }

  /** Ray against every live enemy's body (a vertical cylinder) and its eyes. */
  private hitEnemies(o: THREE.Vector3, d: THREE.Vector3, maxT: number): { e: Enemy; t: number; eye: boolean } | null {
    let best: { e: Enemy; t: number; eye: boolean } | null = null;
    let bestT = maxT;
    const a = d.x * d.x + d.z * d.z;
    if (a < 1e-8) return null;
    for (const e of this.enemies) {
      if (e.state === 'dying') continue;
      const ox = o.x - e.pos.x;
      const oz = o.z - e.pos.z;
      const r = 0.36 * e.size;
      const b = 2 * (ox * d.x + oz * d.z);
      const c = ox * ox + oz * oz - r * r;
      const disc = b * b - 4 * a * c;
      if (disc < 0) continue;
      const sq = Math.sqrt(disc);
      const t0 = (-b - sq) / (2 * a);
      const t1 = (-b + sq) / (2 * a);
      const tEntry = t0 >= 0 ? t0 : t1 >= 0 ? 0 : -1;
      if (tEntry < 0 || tEntry >= bestT) continue;
      const y = o.y + d.y * tEntry - e.pos.y;
      const yExit = o.y + d.y * t1 - e.pos.y;
      const top = e.size * 1.02;
      if ((y < 0 && yExit < 0) || (y > top && yExit > top)) continue;
      // closest approach to the body axis: where the shot actually crosses the card
      const tc = Math.max(0, -(ox * d.x + oz * d.z) / a);
      const cx = ox + d.x * tc;
      const cz = oz + d.z * tc;
      const yc = o.y + d.y * tc - e.pos.y;
      if (yc < -0.05 || yc > top) continue;
      const eye = Math.hypot(cx, cz) < 0.24 * e.size && Math.abs(yc - e.eyeY) < 0.17 * e.size;
      bestT = tc;
      best = { e, t: tc, eye };
    }
    return best;
  }

  private hitMark(kind: 'hit' | 'eye' | 'kill') {
    const el = this.opts.hooks.hit;
    if (!el) return;
    el.dataset.kind = kind;
    el.classList.remove('on');
    void el.offsetWidth; // restart the CSS animation
    el.classList.add('on');
  }

  // ================================================================= damage & score

  private damageEnemy(e: Enemy, dmg: number, eye: boolean, at: THREE.Vector3, by: string): boolean {
    if (e.state === 'dying') return false;
    dmg = Math.max(1, Math.round(dmg));
    e.hp -= dmg;
    e.flashT = 0.09;
    e.lastHitBy = by;
    this.damage += dmg;
    this.addScore('score.damage', Math.round(dmg / 5), false);
    // shooting a bot makes it notice you, even from behind
    e.canSee = true;
    this.ultCd = Math.max(0, this.ultCd - dmg * 0.012);
    this.showDamage(e, dmg, eye, at);
    this.particles.burst(at, eye ? 8 : 4, { color: [e.front.material.map ? botColor(e) : '#fff', '#fffdf7'], speed: 4, size: 0.12, life: 0.7, up: 1.5 });
    if (e.hp <= 0) {
      this.killEnemy(e, eye);
      return true;
    }
    return false;
  }

  private killEnemy(e: Enemy, eye: boolean) {
    e.state = 'dying';
    e.t = 0;
    this.kills++;
    if (eye) this.eyeshots++;
    this.combo = this.comboT > 0 ? Math.min(4, this.combo + 0.25) : 1;
    this.comboT = 4;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const base = e.def.score * (e.elite ? 2 : 1) * (eye ? 1.5 : 1);
    this.addScore(e.elite ? 'score.eliteKill' : eye ? 'score.eyeKill' : 'score.kill', base, true, eye ? 'eye' : 'kill');
    if (this.combo > 1) this.popup('score.combo', Math.round(this.combo * 100) / 100, 'combo');
    audio.play('kill');
    if (eye) this.hitStop = 0.06;
    this.killfeed.unshift({ id: this.uid++, type: e.def.type, kind: e.def.kind, elite: e.elite, eye, weapon: e.lastHitBy, at: this.runTime });
    if (this.killfeed.length > 5) this.killfeed.pop();
    // confetti: the bot's own colour plus paper scraps
    _a.copy(e.pos).setY(e.pos.y + e.size * 0.6);
    this.particles.burst(_a, 30, { color: [botColor(e), '#fffdf7', '#fffdf7', INK], speed: 6, size: 0.18, life: 1.6, up: 3.5, gravity: 7 });
    this.decals.add(_b.copy(e.pos).setY(0.01), UP, e.size * 0.9);
    // drops
    const roll = Math.random();
    if (roll < 0.55) this.dropPickup('ammo', e.pos);
    else if (roll < 0.68) this.dropPickup('tape', e.pos);
    else if (roll < 0.76) this.dropPickup('glue', e.pos);
    if (e.elite) this.dropPickup(Math.random() < 0.5 ? 'shield' : 'ult', e.pos);
  }

  private addScore(key: string, value: number, show: boolean, tone: Popup['tone'] = 'kill') {
    const v = Math.round(value * (show ? this.combo : 1));
    this.score += v;
    this.breakdown.set(key, (this.breakdown.get(key) ?? 0) + v);
    if (show) this.popup(key, v, tone);
  }

  private popup(key: string, value: number, tone: Popup['tone']) {
    this.popups.push({ id: this.uid++, key, value, tone, at: this.runTime });
    if (this.popups.length > 6) this.popups.shift();
  }

  private toast(e: PickupEvent) {
    this.toasts.push({ ...pickupToast(e), id: this.uid++, at: this.runTime });
    if (this.toasts.length > 5) this.toasts.shift();
  }

  private callout(key: string) {
    this.callouts.push({ id: this.uid++, key, at: this.runTime });
    if (this.callouts.length > 3) this.callouts.shift();
  }

  private hurtPlayer(dmg: number, from: THREE.Vector3 | null, bypassShield = false) {
    const p = this.p;
    if (!p.alive || p.dashT > 0) return;
    this.waveDamageTaken += dmg;
    p.lastHurt = this.time;
    if (!bypassShield && p.shield > 0) {
      const absorbed = Math.min(p.shield, dmg);
      p.shield -= absorbed;
      dmg -= absorbed;
      if (p.shield <= 0) {
        audio.play('shieldBreak');
        this.callout('call.shieldBroken');
      }
    }
    p.hp -= dmg;
    p.shake = Math.max(p.shake, 0.18);
    if (from) {
      const ang = Math.atan2(from.x - p.pos.x, from.z - p.pos.z);
      // relative to where we look: 0 = ahead
      const rel = ang - Math.atan2(-Math.sin(p.yaw), -Math.cos(p.yaw));
      this.damageDirs.push({ id: this.uid++, angle: -rel, at: this.runTime });
      if (this.damageDirs.length > 4) this.damageDirs.shift();
      audio.play('hurt', Math.max(-1, Math.min(1, Math.sin(-rel))));
    }
    if (p.hp <= 0) {
      p.hp = 0;
      p.alive = false;
      p.deathT = 0;
      p.healing = null;
      hud.set({ phase: 'dead' });
      if (document.pointerLockElement) document.exitPointerLock();
    }
  }

  private finish() {
    const summary: Summary = {
      score: this.score,
      wave: this.wave,
      kills: this.kills,
      eyeshots: this.eyeshots,
      shots: this.shots,
      hits: this.hits,
      damage: this.damage,
      time: this.runTime,
      bestCombo: this.bestCombo,
      breakdown: [...this.breakdown.entries()].map(([key, value]) => ({ key, value })).sort((a, b) => b.value - a.value)
    };
    hud.set({ phase: 'over', summary });
  }

  // ================================================================= waves & ring

  private beginWave(n: number) {
    this.wave = n;
    this.waveDamageTaken = 0;
    const roster = waveRoster(n);
    // trickle them in over the first stretch of the wave
    roster.forEach((r, i) => this.spawnQueue.push({ ...r, at: this.runTime + 1.5 + i * (14 / roster.length) + Math.random() }));
    const rs = this.ringState;
    const ang = Math.random() * Math.PI * 2;
    const off = Math.random() * Math.min(28, 10 + n * 3);
    rs.tx = Math.cos(ang) * off;
    rs.tz = Math.sin(ang) * off;
    rs.r0 = rs.r;
    rs.r1 = Math.max(22, 62 - n * 5);
    rs.phase = 'hold';
    rs.holdT = n === 1 ? 25 : 14;
    rs.shrinkT = 45;
    rs.t = rs.holdT;
    audio.play('wave');
    this.callout('call.wave');
  }

  private updateRing(dt: number) {
    const rs = this.ringState;
    if (rs.phase === 'hold') {
      rs.t -= dt;
      if (rs.t <= 0) {
        rs.phase = 'shrink';
        rs.t = rs.shrinkT;
        audio.play('ring');
        this.callout('call.ringMoving');
      }
    } else if (rs.phase === 'shrink') {
      rs.t -= dt;
      const k = 1 - Math.max(0, rs.t) / rs.shrinkT;
      const e = k * k * (3 - 2 * k);
      rs.r = rs.r0 + (rs.r1 - rs.r0) * e;
      rs.cx += (rs.tx - rs.cx) * Math.min(1, dt * 0.08);
      rs.cz += (rs.tz - rs.cz) * Math.min(1, dt * 0.08);
      if (rs.t <= 0) rs.phase = 'calm';
    } else if (this.intermission > 0) {
      // between waves the storm rolls back
      rs.r += (ARENA_R - rs.r) * Math.min(1, dt * 0.5);
      rs.cx *= 1 - Math.min(1, dt * 0.5);
      rs.cz *= 1 - Math.min(1, dt * 0.5);
    }
    this.ring.scale.set(rs.r, 1, rs.r);
    this.ring.position.x = rs.cx;
    this.ring.position.z = rs.cz;
    this.ring.material.uniforms.uTime.value = this.time;
    // at full size the storm sits outside the arena: a whisper; closing in: loud
    const want = rs.phase === 'shrink' ? 1 : rs.r < ARENA_R - 2 ? 0.6 : 0.12;
    const u = this.ring.material.uniforms.uAlpha;
    u.value += (want - u.value) * Math.min(1, dt * 2);
    // outside: the eraser rubs you out, shields don't help
    const p = this.p;
    if (p.alive && Math.hypot(p.pos.x - rs.cx, p.pos.z - rs.cz) > rs.r) this.hurtPlayer((3 + this.wave * 1.4) * dt, null, true);
  }

  private outside() {
    const rs = this.ringState;
    return Math.hypot(this.p.pos.x - rs.cx, this.p.pos.z - rs.cz) > rs.r;
  }

  private updateWaves(dt: number) {
    // spawn the queue
    for (let i = this.spawnQueue.length - 1; i >= 0; i--) {
      const s = this.spawnQueue[i];
      if (s.at > this.runTime) continue;
      this.spawnQueue.splice(i, 1);
      this.spawnEnemy(s.def, s.elite);
    }
    const alive = this.enemies.some(e => e.state !== 'dying') || this.spawnQueue.length > 0;
    if (!alive && this.wave > 0 && this.intermission <= 0) {
      // wave cleared
      this.intermission = 10;
      this.addScore('score.wave', 400 * this.wave, true, 'bonus');
      if (this.waveDamageTaken < 1) this.addScore('score.flawless', 1000, true, 'bonus');
      this.callout('call.cleared');
      audio.play('wave');
      this.ringState.phase = 'calm';
      this.launchSupply();
      // a little mercy: shields top up
      this.p.shield = Math.min(SHIELD_TIERS[this.p.tier], this.p.shield + 25);
    }
    if (this.intermission > 0) {
      this.intermission -= dt;
      if (this.intermission <= 0) this.beginWave(this.wave + 1);
    }
  }

  private spawnEnemy(def: Enemy['def'], elite: boolean) {
    const rs = this.ringState;
    const p = this.p.pos;
    for (let tries = 0; tries < 30; tries++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * (Math.min(rs.r, ARENA_R) - 4);
      _a.set(rs.cx + Math.cos(a) * d, 0, rs.cz + Math.sin(a) * d);
      if (Math.hypot(_a.x, _a.z) > ARENA_R - 3) continue;
      if (_a.distanceTo(p) < 22) continue;
      // not inside a prop
      _b.copy(_a);
      this.world.collision.resolve(_b, 0.5, 2, 0, 0);
      if (_b.distanceTo(_a) > 0.01) continue;
      const e = makeEnemy(this.bank, def, elite, _a, this.wave);
      e.card.scale.y = 0.01;
      e.yaw = Math.atan2(p.x - _a.x, p.z - _a.z);
      this.scene.add(e.root);
      this.enemies.push(e);
      this.particles.burst(_c.copy(_a).setY(0.3), 10, { color: ['#fffdf7', '#d8cfb8'], speed: 3, size: 0.2, life: 0.8, up: 2 });
      return;
    }
  }

  // ================================================================= enemies

  private target(e: Enemy, out: THREE.Vector3): boolean {
    if (this.decoy && this.decoy.pos.distanceTo(e.pos) < 40) {
      out.copy(this.decoy.pos);
      return true;
    }
    out.copy(this.p.pos);
    return false;
  }

  private updateEnemies(dt: number) {
    const tg = this.telegraphs.geometry.getAttribute('position') as THREE.BufferAttribute;
    let lines = 0;
    const player = this.p;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.t += dt;
      e.flashT -= dt;
      e.revealT -= dt;
      if (e.state === 'dying') {
        // fold flat onto the floor, then crumple away
        const k = Math.min(1, e.t / 0.35);
        e.card.rotation.x = -k * k * (Math.PI / 2) * 0.98;
        e.card.scale.setScalar(e.t > 0.6 ? Math.max(0.001, 1 - (e.t - 0.6) / 0.4) : 1);
        if (e.t > 1) {
          disposeEnemy(e);
          this.enemies.splice(i, 1);
        }
        continue;
      }
      if (e.state === 'pop') {
        // a pop-up book page standing up
        const k = Math.min(1, e.t / 0.5);
        const s = 1 - Math.pow(1 - k, 3);
        e.card.scale.y = Math.max(0.01, s + Math.sin(k * Math.PI) * 0.18);
        if (k >= 1) {
          e.state = 'chase';
          e.card.scale.y = 1;
        }
        continue;
      }
      if (e.slowT > 0) e.slowT -= dt;
      else e.slow = 0;
      const toDecoy = this.target(e, _a);
      _b.subVectors(_a, e.pos);
      _b.y = 0;
      const dist = _b.length();
      const dir = dist > 1e-4 ? _b.multiplyScalar(1 / dist) : _b.set(0, 0, 1);

      // line of sight, a few times a second
      e.losT -= dt;
      if (e.losT <= 0) {
        e.losT = 0.22 + Math.random() * 0.08;
        _c.copy(e.pos).setY(e.pos.y + e.eyeY);
        _d.copy(_a).setY(_a.y + (toDecoy ? 1 : player.height - EYE));
        e.canSee = dist < e.def.range * 1.6 && this.world.collision.visible(_c, _d) && (toDecoy || player.alive);
      }

      // where to go
      const def = e.def;
      let speed = def.speed * (1 - e.slow);
      _c.set(0, 0, 0);
      const rs = this.ringState;
      const fromCentre = Math.hypot(e.pos.x - rs.cx, e.pos.z - rs.cz);
      if (fromCentre > rs.r - 3) {
        _c.set(rs.cx - e.pos.x, 0, rs.cz - e.pos.z).normalize();
      } else if (e.state === 'lunge') {
        speed = 15;
        _c.copy(e.aimDir);
        if (e.t > 0.38) {
          e.state = 'chase';
          e.fireT = def.interval;
        }
        if (!toDecoy && player.alive && dist < 1.3 && e.burstLeft > 0) {
          e.burstLeft = 0;
          this.hurtPlayer(def.melee ?? 10, e.pos);
          e.dealt += def.melee ?? 10;
          audio.play('hit');
        }
      } else if (def.melee) {
        _c.copy(dir);
        if (e.canSee && dist < 7 && e.fireT <= 0) {
          e.state = 'lunge';
          e.t = 0;
          e.aimDir.copy(dir);
          e.burstLeft = 1;
          audio.play('enemyShot', 0, Math.min(1, dist / 40));
        }
      } else if (!e.canSee || dist > def.range * 0.85) {
        _c.copy(dir);
      } else {
        // in range: hold distance and strafe
        e.strafeT -= dt;
        if (e.strafeT <= 0) {
          e.strafeT = 1 + Math.random() * 2.2;
          e.strafe *= -1;
        }
        _c.set(-dir.z * e.strafe, 0, dir.x * e.strafe);
        if (dist < def.keep) _c.addScaledVector(dir, -1.2);
        else if (dist > def.keep * 1.6) _c.addScaledVector(dir, 0.6);
        _c.normalize();
        speed *= def.kind === 'sniper' ? 0.5 : 0.75;
      }
      if (e.detourT > 0) {
        e.detourT -= dt;
        _c.lerp(e.detour, 0.7).normalize();
      }
      // pull vortices
      for (const pl of this.pulls) {
        _d.subVectors(pl.pos, e.pos).setY(0);
        const dd = _d.length();
        if (dd < pl.r && dd > 0.3) e.vel.addScaledVector(_d.normalize(), pl.strength * 26 * dt);
      }
      const ox = e.pos.x;
      const oz = e.pos.z;
      e.pos.x += (_c.x * speed + e.vel.x) * dt;
      e.pos.z += (_c.z * speed + e.vel.z) * dt;
      e.vel.multiplyScalar(Math.exp(-dt * 3));
      this.world.collision.resolve(e.pos, 0.34 * e.size, e.size, 0.4, 0);
      for (const o of this.enemies) {
        if (o === e || o.state === 'dying') continue;
        const dx = e.pos.x - o.pos.x;
        const dz = e.pos.z - o.pos.z;
        const md = 0.36 * (e.size + o.size);
        const d2 = dx * dx + dz * dz;
        if (d2 < md * md && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          e.pos.x += (dx / d) * (md - d) * 0.5;
          e.pos.z += (dz / d) * (md - d) * 0.5;
        }
      }
      const moved = Math.hypot(e.pos.x - ox, e.pos.z - oz);
      if (speed > 0.5 && moved < speed * dt * 0.3) {
        e.stuckT += dt;
        if (e.stuckT > 0.35) {
          e.stuckT = 0;
          e.detourT = 0.9;
          const side = Math.random() < 0.5 ? -1 : 1;
          e.detour.set(-_c.z * side, 0, _c.x * side);
        }
      } else e.stuckT = Math.max(0, e.stuckT - dt);

      // blink (ghost): vanish and reappear nearby
      if (def.blink) {
        e.blinkT -= dt;
        if (e.blinkT <= 0 && e.canSee) {
          e.blinkT = def.blink + Math.random() * 2;
          this.particles.burst(_d.copy(e.pos).setY(1), 12, { color: ['#f4f2fa', '#7b4bd1'], speed: 3, size: 0.2, life: 0.6, gravity: -2 });
          const a = Math.random() * Math.PI * 2;
          const d = 9 + Math.random() * 6;
          _d.set(_a.x + Math.cos(a) * d, 0, _a.z + Math.sin(a) * d);
          if (Math.hypot(_d.x - rs.cx, _d.z - rs.cz) < rs.r - 3 && Math.hypot(_d.x, _d.z) < ARENA_R - 3) {
            e.pos.copy(_d);
            this.world.collision.resolve(e.pos, 0.4, 2, 0, 0);
            this.particles.burst(_d.copy(e.pos).setY(1), 12, { color: ['#f4f2fa', '#7b4bd1'], speed: 3, size: 0.2, life: 0.6, gravity: -2 });
          }
        }
      }

      // facing: turn like a cardboard cut-out, with a waddle
      const want = Math.atan2(dir.x, dir.z);
      let dy = want - e.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      e.yaw += dy * Math.min(1, dt * 7);
      e.card.rotation.y = e.yaw;
      const step = moved / Math.max(dt, 1e-4);
      e.card.rotation.z = Math.sin(e.t * 11) * Math.min(0.09, step * 0.014);
      e.card.position.y = Math.abs(Math.sin(e.t * 11)) * Math.min(0.12, step * 0.02);

      // shooting
      if (def.melee) {
        e.fireT -= dt;
      } else if (e.state === 'aim') {
        // sniper: a red pencil line tracks you, then the shot
        _c.copy(e.pos).setY(e.pos.y + e.eyeY);
        _d.copy(_a).setY(_a.y + (toDecoy ? 1 : player.height * 0.7));
        e.aimDir.lerp(_b.subVectors(_d, _c).normalize(), Math.min(1, dt * 5));
        if (lines < 16) {
          const end = _d.copy(_c).addScaledVector(e.aimDir, Math.min(dist + 2, def.range));
          tg.setXYZ(lines * 2, _c.x, _c.y, _c.z);
          tg.setXYZ(lines * 2 + 1, end.x, end.y, end.z);
          lines++;
        }
        e.burstT -= dt;
        if (e.burstT <= 0) {
          this.shootDart(e, e.aimDir, true);
          e.state = 'chase';
          e.fireT = def.interval * (0.85 + Math.random() * 0.3);
        }
      } else {
        e.fireT -= dt;
        if (e.burstLeft > 0) {
          e.burstT -= dt;
          if (e.burstT <= 0) {
            e.burstLeft--;
            e.burstT = 0.14;
            _c.copy(e.pos).setY(e.pos.y + e.eyeY);
            _d.copy(_a).setY(_a.y + (toDecoy ? 1 : player.height * 0.65));
            this.shootDart(e, _b.subVectors(_d, _c).normalize(), false);
          }
        } else if (e.fireT <= 0 && e.canSee && dist < def.range) {
          if (def.telegraph) {
            e.state = 'aim';
            e.burstT = def.telegraph;
            _c.copy(e.pos).setY(e.pos.y + e.eyeY);
            e.aimDir.subVectors(_d.copy(_a).setY(_a.y + 1.2), _c).normalize();
          } else {
            e.burstLeft = def.burst;
            e.burstT = 0;
            e.fireT = def.interval * (0.8 + Math.random() * 0.4);
          }
        }
      }
    }
    for (let i = lines * 2; i < 32; i++) tg.setXYZ(i, 0, -100, 0);
    tg.needsUpdate = true;
  }

  private shootDart(e: Enemy, dir: THREE.Vector3, big: boolean) {
    const d = this.darts.spawn();
    if (!d) return;
    const def = e.def;
    _a.copy(dir);
    if (def.spread > 0) {
      _a.x += (Math.random() - 0.5) * def.spread * 2;
      _a.y += (Math.random() - 0.5) * def.spread;
      _a.z += (Math.random() - 0.5) * def.spread * 2;
      _a.normalize();
    }
    d.pos.copy(e.pos).setY(e.pos.y + e.eyeY);
    d.vel.copy(_a).multiplyScalar(def.dartSpeed);
    d.life = 3.2;
    d.dmg = def.dartDamage * (e.elite ? 1.3 : 1) * (1 + Math.max(0, this.wave - 1) * 0.04);
    d.big = big;
    d.from = e;
    const dist = e.pos.distanceTo(this.p.pos);
    _b.subVectors(e.pos, this.p.pos);
    const pan = Math.max(-1, Math.min(1, _b.dot(_right.set(Math.cos(this.p.yaw), 0, -Math.sin(this.p.yaw))) / Math.max(1, dist)));
    audio.play('enemyShot', pan, Math.min(1, dist / 60));
  }

  private updateDarts(dt: number) {
    const p = this.p;
    const px = p.pos.x;
    const pz = p.pos.z;
    for (const d of this.darts.items) {
      if (!d.alive) continue;
      d.life -= dt;
      if (d.life <= 0) {
        d.alive = false;
        continue;
      }
      const step = d.vel.length() * dt;
      _a.copy(d.vel).multiplyScalar(1 / Math.max(1e-6, d.vel.length()));
      const tw = this.world.collision.raycast(d.pos, _a, step, _n);
      // the player: closest approach of this step's segment to the body axis
      if (p.alive) {
        const t = Math.max(0, Math.min(step, (px - d.pos.x) * _a.x + (pz - d.pos.z) * _a.z));
        const hx = d.pos.x + _a.x * t - px;
        const hz = d.pos.z + _a.z * t - pz;
        const hy = d.pos.y + _a.y * t - p.pos.y;
        if (t < tw && hx * hx + hz * hz < 0.5 * 0.5 && hy > -0.1 && hy < p.height + 0.1) {
          this.hurtPlayer(d.dmg, d.from ? d.from.pos : d.pos);
          if (d.from) d.from.dealt += d.dmg;
          d.alive = false;
          continue;
        }
      }
      if (this.decoy && d.pos.distanceTo(_c.copy(this.decoy.pos).setY(this.decoy.pos.y + 1)) < 1.2) {
        d.alive = false;
        this.particles.burst(d.pos, 4, { color: '#fffdf7', speed: 2, size: 0.12, life: 0.5 });
        continue;
      }
      if (tw !== Infinity) {
        d.alive = false;
        _b.copy(d.pos).addScaledVector(_a, tw);
        this.particles.burst(_b, 4, { color: ['#fffdf7', '#d8cfb8'], speed: 2, size: 0.12, life: 0.6, dir: _n });
        continue;
      }
      d.pos.addScaledVector(_a, step);
      d.vel.y -= 1.2 * dt; // a slight glide-drop: it's a paper plane
    }
    this.darts.commit((d, m) => {
      _q.setFromUnitVectors(ZP, _a.copy(d.vel).normalize());
      const s = d.big ? 1.7 : 1;
      m.compose(d.pos, _q, _s.set(s, s, s));
    });
  }

  // ================================================================= skills

  private useSkill(slot: 'tactical' | 'ultimate') {
    const s = slot === 'tactical' ? this.tactical : this.ultimate;
    const cd = slot === 'tactical' ? this.tacCd : this.ultCd;
    if (cd > 0 || !this.p.alive) {
      if (cd > 0) this.callout(slot === 'tactical' ? 'call.tacticalCd' : 'call.ultCd');
      return;
    }
    if (slot === 'tactical') this.tacCd = s.cooldown;
    else this.ultCd = s.cooldown;
    audio.play(slot === 'tactical' ? 'skill' : 'ult');
    for (const fx of s.effects) this.applyEffect(fx, s);
    this.p.shake = Math.max(this.p.shake, slot === 'ultimate' ? 0.3 : 0.1);
  }

  /** Where the crosshair lands on the world, up to `max` away. */
  private aimPoint(out: THREE.Vector3, max: number) {
    const o = this.eyePos(_o);
    const d = this.aimDir(_d);
    const t = Math.min(max, this.world.collision.raycast(o, d, max));
    out.copy(o).addScaledVector(d, t);
    out.y = Math.max(0, out.y);
    // drop to the ground under that point
    _b.copy(out).setY(out.y + 0.1);
    const g = this.world.collision.raycast(_b, _n.set(0, -1, 0), 40);
    if (g !== Infinity) out.y = _b.y - g;
    return out;
  }

  private applyEffect(fx: Effect, s: Skill) {
    const p = this.p;
    const color = new THREE.Color(s.color);
    switch (fx.type) {
      case 'dash': {
        const k = this.keys;
        const f = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
        const r = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
        _fwd.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
        _right.set(-_fwd.z, 0, _fwd.x);
        _a.set(0, 0, 0).addScaledVector(_fwd, f || (r ? 0 : 1)).addScaledVector(_right, r).normalize();
        const dur = 0.2;
        p.dashT = dur;
        p.dashDir.copy(_a).multiplyScalar(fx.distance / dur);
        break;
      }
      case 'heal':
        p.hp = Math.min(100, p.hp + fx.amount);
        this.particles.burst(_a.copy(p.pos).setY(1), 16, { color: ['#e5533d', '#fffdf7'], speed: 2.5, size: 0.14, life: 1, up: 2, gravity: -1 });
        break;
      case 'shield':
        p.shield = Math.min(SHIELD_TIERS[p.tier], p.shield + fx.amount);
        this.particles.burst(_a.copy(p.pos).setY(1), 16, { color: [SHIELD_COLORS[p.tier], '#fffdf7'], speed: 2.5, size: 0.14, life: 1, up: 2, gravity: -1 });
        break;
      case 'projectile': {
        const o = this.eyePos(_o);
        this.aimDir(_d);
        for (let i = 0; i < fx.count; i++) {
          const b = this.balls.spawn();
          if (!b) break;
          const fan = fx.count > 1 ? (i / (fx.count - 1) - 0.5) * 0.42 : 0;
          _a.copy(_d).applyAxisAngle(UP, fan);
          _a.y += 0.06;
          b.pos.copy(o).addScaledVector(_a, 0.8);
          b.vel.copy(_a.normalize()).multiplyScalar(fx.speed);
          b.life = 4;
          b.dmg = fx.damage;
          b.radius = fx.radius;
          b.color.copy(color);
          b.spin = Math.random() * 6;
        }
        break;
      }
      case 'area': {
        const at = this.aimPoint(new THREE.Vector3(), 28);
        const mat = puddleMaterial(this.splatTex, color);
        const mesh = new THREE.Mesh(this.shared.puddleGeo as THREE.BufferGeometry, mat);
        mesh.position.copy(at).setY(at.y + 0.03);
        mesh.scale.setScalar(0.01);
        this.scene.add(mesh);
        this.areas.push({ mesh, pos: at.clone(), r: fx.radius, dps: fx.damage, slow: fx.slow, t: 0, max: fx.duration, tick: 0, color });
        break;
      }
      case 'buff':
        this.buffs.push({ stat: fx.stat, mult: fx.multiplier, t: fx.duration, max: fx.duration, color: s.color });
        break;
      case 'decoy': {
        this.decoy?.obj.removeFromParent();
        if (!this.decoyTex) {
          const look = this.opts.look;
          const wear: Wear = { hat: look.hat, glasses: look.glasses, headphones: look.headphones, bowTie: look.bowTie, color: look.color };
          const b = bakeMascot(look.type, wear, { color: look.body || undefined });
          this.decoyTex = { front: b.front, back: b.back, span: b.span, rise: b.bodyCenterBelow };
        }
        const t = this.decoyTex;
        const g = new THREE.Group();
        const w = t.span * 1.7;
        const mats = cardMaterials(t.front, t.back);
        const front = new THREE.Mesh(this.bank.plane, mats.front);
        front.scale.set(w, w, 1);
        front.position.y = 1.7 * (0.5 + t.rise);
        const back = front.clone();
        back.material = mats.back;
        back.rotation.y = Math.PI;
        g.add(front, back);
        _fwd.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
        g.position.copy(p.pos).addScaledVector(_fwd, 3);
        g.rotation.y = p.yaw + Math.PI;
        g.scale.y = 0.01;
        this.scene.add(g);
        this.decoy = { obj: g, pos: g.position, t: fx.duration };
        break;
      }
      case 'wall': {
        _fwd.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
        _right.set(-_fwd.z, 0, _fwd.x);
        const centre = _a.copy(p.pos).addScaledVector(_fwd, 3.2);
        centre.y = p.pos.y;
        const g = new THREE.Group();
        const panels = Math.max(2, Math.round(fx.width / 1.6));
        const pw = fx.width / panels;
        const colliders = [];
        for (let i = 0; i < panels; i++) {
          // a folding screen: panels zig-zag
          const m = new THREE.Mesh(this.shared.wallGeo as THREE.BufferGeometry, this.shared.wallMat as THREE.Material);
          const off = (i - (panels - 1) / 2) * pw;
          m.position.set(off, 1.5, i % 2 ? 0.18 : -0.18);
          m.rotation.y = i % 2 ? 0.35 : -0.35;
          m.scale.set(pw * 1.02, 3, 0.12);
          g.add(m);
        }
        g.position.copy(centre);
        g.rotation.y = p.yaw;
        g.scale.y = 0.01;
        this.scene.add(g);
        for (let x = -fx.width / 2 + 0.3; x <= fx.width / 2 - 0.3 + 1e-6; x += 0.55) {
          const cx = centre.x + _right.x * x;
          const cz = centre.z + _right.z * x;
          colliders.push(this.world.collision.addCyl(cx, cz, 0.32, centre.y, centre.y + 3, true));
        }
        this.walls.push({ mesh: g, colliders, t: fx.duration });
        break;
      }
      case 'reveal':
        for (const e of this.enemies) if (e.pos.distanceTo(p.pos) < fx.radius) e.revealT = fx.duration;
        this.spawnShock(p.pos, fx.radius, color, 0.8);
        this.callout('call.revealed');
        break;
      case 'pull': {
        const at = this.aimPoint(new THREE.Vector3(), 26);
        this.pulls.push({ pos: at, r: fx.radius, strength: fx.strength, t: 1.4, color });
        this.spawnShock(at, fx.radius, color, 1.2);
        break;
      }
    }
  }

  private spawnShock(at: THREE.Vector3, r: number, color: THREE.Color, life: number) {
    const mat = shockMaterial(color);
    const mesh = new THREE.Mesh(this.shared.shockGeo as THREE.BufferGeometry, mat);
    mesh.position.copy(at).setY(at.y + 0.08);
    this.scene.add(mesh);
    this.shocks.push({ mesh, t: 0, max: life, r });
  }

  private updateSkills(dt: number) {
    this.tacCd = Math.max(0, this.tacCd - dt);
    this.ultCd = Math.max(0, this.ultCd - dt);
    for (let i = this.buffs.length - 1; i >= 0; i--) if ((this.buffs[i].t -= dt) <= 0) this.buffs.splice(i, 1);

    for (let i = this.areas.length - 1; i >= 0; i--) {
      const a = this.areas[i];
      a.t += dt;
      const grow = Math.min(1, a.t / 0.25);
      const fade = a.t > a.max - 0.4 ? Math.max(0, (a.max - a.t) / 0.4) : 1;
      a.mesh.scale.setScalar(a.r * 1.15 * grow * (1 + Math.sin(a.t * 4) * 0.02));
      (a.mesh.material as THREE.MeshBasicMaterial).opacity = 0.75 * fade;
      a.tick -= dt;
      if (a.tick <= 0) {
        a.tick = 0.25;
        for (const e of this.enemies) {
          if (e.state === 'dying' || e.state === 'pop') continue;
          if (Math.hypot(e.pos.x - a.pos.x, e.pos.z - a.pos.z) > a.r) continue;
          if (a.slow > 0) {
            e.slow = Math.max(e.slow, a.slow);
            e.slowT = 0.4;
          }
          if (a.dps > 0) this.damageEnemy(e, a.dps * 0.25, false, _b.copy(e.pos).setY(e.size * 0.5), 'skill');
        }
        if (Math.random() < 0.8) this.particles.burst(_b.copy(a.pos).add(_c.set((Math.random() - 0.5) * a.r, 0.1, (Math.random() - 0.5) * a.r)), 2, { color: a.color, speed: 1, size: 0.15, life: 0.8, up: 1.6, gravity: 2 });
      }
      if (a.t >= a.max) {
        (a.mesh.material as THREE.Material).dispose();
        a.mesh.removeFromParent();
        this.areas.splice(i, 1);
      }
    }

    for (let i = this.walls.length - 1; i >= 0; i--) {
      const w = this.walls[i];
      w.t -= dt;
      w.mesh.scale.y += (1 - w.mesh.scale.y) * Math.min(1, dt * 12);
      if (w.t < 0.3) w.mesh.scale.y = Math.max(0.01, w.t / 0.3);
      if (w.t <= 0) {
        for (const c of w.colliders) this.world.collision.remove(c);
        w.mesh.removeFromParent();
        this.walls.splice(i, 1);
      }
    }

    for (let i = this.pulls.length - 1; i >= 0; i--) {
      const pl = this.pulls[i];
      pl.t -= dt;
      if (Math.random() < 0.7) {
        const a = Math.random() * Math.PI * 2;
        _b.set(pl.pos.x + Math.cos(a) * pl.r, 0.4, pl.pos.z + Math.sin(a) * pl.r);
        _c.subVectors(pl.pos, _b).normalize();
        this.particles.burst(_b, 1, { color: pl.color, speed: pl.r * 1.6, size: 0.14, life: 0.5, dir: _c, cone: 0.1, gravity: 0, drag: 0.2 });
      }
      if (pl.t <= 0) this.pulls.splice(i, 1);
    }

    if (this.decoy) {
      const d = this.decoy;
      d.t -= dt;
      d.obj.scale.y += (1 - d.obj.scale.y) * Math.min(1, dt * 10);
      if (d.t < 0.3) d.obj.scale.y = Math.max(0.01, d.t / 0.3);
      if (d.t <= 0) {
        d.obj.traverse(o => {
          const m = o as THREE.Mesh;
          if (m.isMesh) (m.material as THREE.Material).dispose();
        });
        d.obj.removeFromParent();
        this.decoy = null;
      }
    }

    for (let i = this.shocks.length - 1; i >= 0; i--) {
      const s = this.shocks[i];
      s.t += dt;
      const k = s.t / s.max;
      s.mesh.scale.setScalar(Math.max(0.01, s.r * (1 - Math.pow(1 - Math.min(1, k * 1.4), 3))));
      (s.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k);
      if (k >= 1) {
        (s.mesh.material as THREE.Material).dispose();
        s.mesh.removeFromParent();
        this.shocks.splice(i, 1);
      }
    }
  }

  private updateBalls(dt: number) {
    for (const b of this.balls.items) {
      if (!b.alive) continue;
      b.life -= dt;
      b.vel.y -= 6 * dt;
      b.spin += dt * 9;
      const sp = b.vel.length();
      _a.copy(b.vel).multiplyScalar(1 / Math.max(1e-6, sp));
      const step = sp * dt;
      const tw = this.world.collision.raycast(b.pos, _a, step, _n, true);
      const he = this.hitEnemies(b.pos, _a, Math.min(step + 0.3, tw));
      if (he || tw !== Infinity || b.life <= 0 || b.pos.y < 0.1) {
        _b.copy(b.pos).addScaledVector(_a, he ? he.t : tw === Infinity ? 0 : tw);
        this.explode(_b, b, he?.e ?? null);
        b.alive = false;
        continue;
      }
      b.pos.addScaledVector(_a, step);
      if (Math.random() < 0.5) this.particles.burst(b.pos, 1, { color: b.color, speed: 0.5, size: 0.1, life: 0.4, gravity: 0 });
    }
    let n = 0;
    this.balls.commit((b, m) => {
      _q.setFromEuler(_e.set(b.spin, b.spin * 0.7, 0));
      m.compose(b.pos, _q, _s.set(1, 1, 1));
      this.balls.mesh.instanceColor!.setXYZ(n++, b.color.r, b.color.g, b.color.b);
    });
    this.balls.mesh.instanceColor!.needsUpdate = true;
  }

  private explode(at: THREE.Vector3, b: Ball, direct: Enemy | null) {
    if (b.radius < 0.5) {
      if (direct) {
        const killed = this.damageEnemy(direct, b.dmg, false, at, 'skill');
        this.hitMark(killed ? 'kill' : 'hit');
      }
      this.particles.burst(at, 8, { color: [b.color, '#fffdf7'], speed: 4, size: 0.16, life: 0.6 });
      return;
    }
    let any = false;
    let killed = false;
    for (const e of this.enemies) {
      if (e.state === 'dying') continue;
      const d = Math.hypot(e.pos.x - at.x, e.pos.z - at.z);
      if (d > b.radius) continue;
      any = true;
      const k = 1 - (d / b.radius) * 0.5;
      killed = this.damageEnemy(e, b.dmg * k, false, _c.copy(e.pos).setY(e.size * 0.6), 'skill') || killed;
      _c.subVectors(e.pos, at).setY(0).normalize();
      e.vel.addScaledVector(_c, 8 * k);
    }
    if (any) this.hitMark(killed ? 'kill' : 'hit');
    // you can catch yourself in it, a little: keeps rockets honest
    const pd = at.distanceTo(this.p.pos);
    if (pd < b.radius * 0.6) this.hurtPlayer(b.dmg * 0.15 * (1 - pd / (b.radius * 0.6)), at);
    this.spawnShock(at, b.radius, b.color, 0.5);
    this.particles.burst(at, 26, { color: [b.color, '#fffdf7', INK], speed: b.radius * 2.2, size: 0.2, life: 1, up: 3 });
    this.decals.add(_c.copy(at).setY(Math.max(0.01, at.y)), UP, b.radius * 0.8);
    this.p.shake = Math.max(this.p.shake, Math.max(0, 0.4 - pd * 0.015));
    audio.play('boom', 0, Math.min(1, pd / 50));
  }

  // ================================================================= loot

  private addCrate(at: THREE.Vector3, gold: boolean, falling = false) {
    const mesh = new THREE.Mesh(this.crateGeo, gold ? this.goldMat : this.crateMat);
    mesh.position.copy(at).setY(at.y + 0.55);
    mesh.rotation.y = Math.random() * Math.PI;
    this.scene.add(mesh);
    let chute: THREE.Object3D | null = null;
    if (falling) {
      chute = new THREE.Mesh(this.shared.chuteGeo as THREE.BufferGeometry, this.shared.chuteMat as THREE.Material);
      chute.position.y = 2.4;
      mesh.add(chute);
    }
    this.crates.push({ mesh, pos: mesh.position, gold, open: false, fallV: falling ? 3 : 0, chute });
  }

  private launchSupply() {
    const p = this.p.pos;
    const a = Math.random() * Math.PI * 2;
    const target = new THREE.Vector3(p.x + Math.cos(a) * 8, 0, p.z + Math.sin(a) * 8);
    const tr = Math.hypot(target.x, target.z);
    if (tr > ARENA_R - 6) target.multiplyScalar((ARENA_R - 6) / tr);
    this.world.collision.resolve(target, 1, 2, 0, 0);
    const dir = new THREE.Vector3(Math.cos(a + 1.3), 0, Math.sin(a + 1.3));
    const from = target.clone().addScaledVector(dir, -120).setY(30);
    const to = target.clone().addScaledVector(dir, 120).setY(30);
    const obj = new THREE.Mesh(paperPlaneGeometry(), this.shared.chuteMat as THREE.Material); // same white folded paper as the parachute
    obj.scale.setScalar(9);
    obj.position.copy(from);
    obj.lookAt(to);
    this.scene.add(obj);
    this.plane = { obj, from, to, t: 0, dropAt: 0.5, dropped: false, target };
    this.callout('call.supply');
  }

  private openCrate(c: Crate) {
    c.open = true;
    audio.play('crate');
    this.particles.burst(_a.copy(c.pos), 18, { color: c.gold ? ['#e8c25a', '#fffdf7'] : ['#c79a63', '#fffdf7'], speed: 5, size: 0.2, life: 1.2, up: 3 });
    c.mesh.removeFromParent();
    const missing = WEAPON_ORDER.filter(w => !this.owned.has(w));
    const drops: [PickupKind, WeaponId?][] = [];
    if (missing.length && (c.gold || Math.random() < 0.45)) drops.push(['weapon', missing[(Math.random() * missing.length) | 0]]);
    drops.push(['ammo']);
    if (Math.random() < 0.6) drops.push(['tape']);
    if (Math.random() < 0.4) drops.push(['glue']);
    if (c.gold || Math.random() < 0.18) drops.push(['shield']);
    if (c.gold) drops.push(['ult'], ['tape'], ['glue']);
    for (const [k, w] of drops) {
      this.dropPickup(k, c.pos, w);
      // a gun waits on the floor for E: say so now, the rest toast when collected
      if (k === 'weapon' && w) this.toast({ kind: 'weapon', weapon: w, taken: false });
    }
    this.addScore('score.crate', c.gold ? 150 : 25, false);
  }

  private dropPickup(kind: PickupKind, at: THREE.Vector3, weapon?: WeaponId) {
    let obj: THREE.Object3D;
    const S = this.shared;
    if (kind === 'weapon' && weapon) {
      const v = buildViewModel(weapon, this.world.ramp);
      v.group.scale.setScalar(2.2);
      obj = v.group;
    } else if (kind === 'tape') obj = new THREE.Mesh(S.tapeGeo as THREE.BufferGeometry, S.tapeMat as THREE.Material);
    else if (kind === 'glue') obj = new THREE.Mesh(S.glueGeo as THREE.BufferGeometry, S.glueMat as THREE.Material);
    else if (kind === 'shield') obj = new THREE.Mesh(S.shieldGeo as THREE.BufferGeometry, S[`shieldMat${Math.min(2, this.p.tier + 1)}`] as THREE.Material);
    else if (kind === 'ult') obj = new THREE.Mesh(S.ultGeo as THREE.BufferGeometry, S.ultMat as THREE.Material);
    else obj = new THREE.Mesh(S.ammoGeo as THREE.BufferGeometry, S.ammoMat as THREE.Material);
    const pos = obj.position.copy(at).setY(at.y + 0.8);
    this.scene.add(obj);
    const a = Math.random() * Math.PI * 2;
    this.pickups.push({ kind, weapon, amount: 1, obj, pos, vel: new THREE.Vector3(Math.cos(a) * 2.5, 4.5, Math.sin(a) * 2.5), t: 0, alive: true });
  }

  private collect(pk: Pickup): boolean {
    const p = this.p;
    switch (pk.kind) {
      case 'ammo': {
        const list = WEAPON_ORDER.filter(w => w !== 'pencil' && this.owned.has(w));
        if (!list.length) return false;
        // feed the gun that's hungriest
        list.sort((a, b) => this.owned.get(a)!.reserve / WEAPONS[a].reserveMax - this.owned.get(b)!.reserve / WEAPONS[b].reserveMax);
        const w = list[0];
        const s = this.owned.get(w)!;
        if (s.reserve >= WEAPONS[w].reserveMax) return false;
        const before = s.reserve;
        s.reserve = Math.min(WEAPONS[w].reserveMax, s.reserve + WEAPONS[w].mag * 2);
        this.toast({ kind: 'ammo', weapon: w, amount: s.reserve - before });
        break;
      }
      case 'tape':
        if (p.tape >= 6) return false;
        p.tape++;
        this.toast({ kind: 'tape', amount: 1, total: p.tape });
        break;
      case 'glue':
        if (p.glue >= 4) return false;
        p.glue++;
        this.toast({ kind: 'glue', amount: 1, total: p.glue });
        break;
      case 'shield':
        if (p.tier < 2) p.tier++;
        p.shield = SHIELD_TIERS[p.tier];
        this.toast({ kind: 'shield', tier: p.tier });
        break;
      case 'ult':
        this.ultCd = Math.max(0, this.ultCd - this.ultimate.cooldown * 0.5);
        this.toast({ kind: 'ult', amount: 0.5 });
        break;
      case 'weapon':
        return false; // guns go through touchWeapon
    }
    audio.play('pickup');
    return true;
  }

  private updateLoot(dt: number) {
    const p = this.p;
    // falling supply crates
    for (const c of this.crates) {
      if (c.fallV <= 0) continue;
      c.pos.y -= c.fallV * dt;
      c.mesh.rotation.z = Math.sin(this.time * 2) * 0.1;
      if (c.pos.y <= 0.55) {
        c.pos.y = 0.55;
        c.fallV = 0;
        c.mesh.rotation.z = 0;
        if (c.chute) {
          c.mesh.remove(c.chute);
          c.chute = null;
        }
        this.particles.burst(_a.copy(c.pos).setY(0.2), 20, { color: ['#fffdf7', '#e8c25a'], speed: 4, size: 0.2, life: 1, up: 1 });
        audio.play('land');
      }
    }
    // supply plane
    if (this.plane) {
      const pl = this.plane;
      pl.t += dt / 8;
      pl.obj.position.lerpVectors(pl.from, pl.to, pl.t);
      if (!pl.dropped && pl.t >= pl.dropAt) {
        pl.dropped = true;
        this.addCrate(pl.target.clone().setY(28), true, true);
      }
      if (pl.t >= 1) {
        pl.obj.removeFromParent();
        (pl.obj as THREE.Mesh).geometry.dispose(); // the material is shared
        this.plane = null;
      }
    }
    // pickups: pop out, settle, then rest and turn
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pk = this.pickups[i];
      pk.t += dt;
      pk.vel.y -= 14 * dt;
      pk.pos.addScaledVector(pk.vel, dt);
      _a.copy(pk.pos);
      this.world.collision.resolve(_a, 0.2, 0.4, 0.3, pk.vel.y);
      pk.pos.x = _a.x;
      pk.pos.z = _a.z;
      const floor = this.groundAt(pk.pos) + 0.45;
      if (pk.pos.y < floor) {
        pk.pos.y = floor;
        pk.vel.set(pk.vel.x * 0.5, Math.abs(pk.vel.y) > 2 ? -pk.vel.y * 0.3 : 0, pk.vel.z * 0.5);
        pk.vel.x *= Math.exp(-dt * 8);
        pk.vel.z *= Math.exp(-dt * 8);
      }
      // rest where they land and turn slowly (#11): no bob, no drift toward the player
      pk.obj.rotation.y += dt * 0.9;
      pk.obj.position.y = pk.pos.y;
      if (!p.alive || pk.t < 0.4) continue;
      // taken by walking into it
      const dx = pk.pos.x - p.pos.x;
      const dz = pk.pos.z - p.pos.z;
      if (dx * dx + dz * dz > 1.3 * 1.3 || Math.abs(pk.pos.y - (p.pos.y + 0.6)) > 1.6) continue;
      if (pk.kind === 'weapon' ? this.touchWeapon(pk) : this.collect(pk)) this.removePickup(i);
    }
    // the prompt for E
    const near = this.nearestInteractable();
    const want = near ? { key: near.gold ? 'prompt.gold' : 'prompt.crate' } : null;
    this.prompt = want;
  }

  private prompt: { key: string } | null = null;

  private removePickup(i: number) {
    const pk = this.pickups[i];
    pk.obj.removeFromParent();
    if (pk.kind === 'weapon') {
      pk.obj.traverse(o => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        (m.material as THREE.Material | undefined)?.dispose?.();
      });
    }
    this.pickups.splice(i, 1);
  }

  private groundAt(pos: THREE.Vector3) {
    _d.copy(pos).setY(pos.y + 0.6);
    const t = this.world.collision.raycast(_d, _n.set(0, -1, 0), 30);
    return t === Infinity ? 0 : Math.max(0, _d.y - t);
  }

  /** Crates are the only thing E opens; guns are taken by walking into them (#11). */
  private nearestInteractable(): { kind: 'crate'; gold: boolean; c: Crate } | null {
    const p = this.p;
    const eye = this.eyePos(_o);
    this.aimDir(_d);
    let best: ReturnType<Game['nearestInteractable']> = null;
    let bestScore = -Infinity;
    const consider = (pos: THREE.Vector3, make: () => NonNullable<ReturnType<Game['nearestInteractable']>>) => {
      _a.subVectors(pos, eye);
      const dist = _a.length();
      if (dist > 3.4) return;
      const facing = _a.normalize().dot(_d);
      const score = facing * 2 - dist * 0.3;
      if (facing > 0.55 && score > bestScore) {
        bestScore = score;
        best = make();
      }
    };
    for (const c of this.crates) if (!c.open && c.fallV <= 0) consider(c.pos, () => ({ kind: 'crate', gold: c.gold, c }));
    if (!p.alive) return null;
    return best;
  }

  private interact() {
    const it = this.nearestInteractable();
    if (it) this.openCrate(it.c);
  }

  /** Walking into a dropped gun: take and equip it, or top up the one you have. True when it was used up. */
  private touchWeapon(pk: Pickup): boolean {
    const w = pk.weapon!;
    const def = WEAPONS[w];
    const s = this.owned.get(w);
    const act = weaponTouch({ owned: Boolean(s), reserve: s?.reserve ?? 0, reserveMax: def.reserveMax });
    if (act === 'none') return false;
    if (act === 'equip') {
      this.owned.set(w, { mag: def.mag, reserve: def.mag * 2 });
      this.setWeapon(w);
      this.toast({ kind: 'weapon', weapon: w, taken: true });
    } else {
      const before = s!.reserve;
      s!.reserve = Math.min(def.reserveMax, s!.reserve + def.mag * 2);
      this.toast({ kind: 'ammo', weapon: w, amount: s!.reserve - before });
    }
    audio.play('pickup');
    return true;
  }

  // ================================================================= pings

  private ping() {
    const o = this.eyePos(_o);
    const d = this.aimDir(_d);
    const tw = this.world.collision.raycast(o, d, 120);
    const he = this.hitEnemies(o, d, Math.min(tw, 120));
    const at = new THREE.Vector3().copy(o).addScaledVector(d, he ? he.t : Math.min(tw, 60));
    if (!he) at.y = this.groundAt(at);
    else at.y = he.e.pos.y;
    if (this.pings.length >= 3) {
      const old = this.pings.shift()!;
      old.obj.removeFromParent();
    }
    const g = new THREE.Group();
    const S = this.shared;
    const mat = (he ? S.pinMat : S.pinMatB) as THREE.Material;
    const stick = new THREE.Mesh(S.pinGeo as THREE.BufferGeometry, mat);
    stick.rotation.x = Math.PI;
    stick.position.y = 0.45;
    const head = new THREE.Mesh(S.pinHeadGeo as THREE.BufferGeometry, mat);
    head.position.y = 1.0;
    g.add(stick, head);
    g.position.copy(at);
    if (he) g.position.y += he.e.size + 0.4;
    this.scene.add(g);
    this.pings.push({ obj: g, pos: g.position, t: 12, enemy: Boolean(he) });
    if (he) he.e.revealT = 4;
    audio.play('ping');
    this.callout(he ? 'call.pingEnemy' : 'call.pingHere');
  }

  // ================================================================= visuals

  private updateVisuals(dt: number, raw: number) {
    const p = this.p;
    this.world.update(this.time);
    this.particles.update(dt);
    this.tracers.update(raw);

    // pings fade
    for (let i = this.pings.length - 1; i >= 0; i--) {
      const pg = this.pings[i];
      pg.t -= dt;
      pg.obj.rotation.y += dt * 2;
      const s = Math.max(0.6, Math.min(2.4, this.camera.position.distanceTo(pg.pos) * 0.05));
      pg.obj.scale.setScalar(s);
      if (pg.t <= 0) {
        pg.obj.removeFromParent();
        this.pings.splice(i, 1);
      }
    }

    // enemies: hit flash, reveal glow
    for (const e of this.enemies) {
      const f = e.flashT > 0 ? 2.2 : e.revealT > 0 ? 1.4 : 1;
      e.front.material.color.setRGB(f, e.revealT > 0 ? f * 0.75 : f, e.revealT > 0 ? f * 0.75 : f);
      e.front.material.depthTest = !(e.revealT > 0);
      e.front.renderOrder = e.revealT > 0 ? 5 : 0;
    }

    // camera
    const shake = p.shake;
    p.shake *= Math.exp(-dt * 9);
    p.recoilPitch *= Math.exp(-dt * 10);
    p.recoilYaw *= Math.exp(-dt * 10);
    const bobY = Math.abs(Math.sin(p.bob)) * 0.05 * (1 - p.ads * 0.8);
    const eyeY = p.pos.y + p.height - EYE - bobY - p.landDip;
    let pitch = p.pitch + p.recoilPitch;
    let roll = Math.sin(p.bob) * 0.004 + (p.sliding > 0 ? 0.04 : 0);
    if (!p.alive) {
      const k = Math.min(1, p.deathT / 0.8);
      roll += k * 1.1;
      pitch -= k * 0.3;
    }
    this.camera.position.set(p.pos.x + (Math.random() - 0.5) * shake * 0.1, (p.alive ? eyeY : p.pos.y + Math.max(0.3, p.height - p.deathT * 2)) + (Math.random() - 0.5) * shake * 0.1, p.pos.z + (Math.random() - 0.5) * shake * 0.1);
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = p.yaw + p.recoilYaw;
    this.camera.rotation.x = pitch;
    this.camera.rotation.z = roll;
    const w = WEAPONS[this.weapon];
    const fov = (this.opts.fov + p.fovKick) * (1 - p.ads * (1 - w.adsFov));
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }

    // viewmodel: sway, bob, kick, reload dip, ADS centre
    const v = this.vm.get(this.weapon)!;
    this.vmKick *= Math.exp(-dt * 16);
    const ads = p.ads;
    const hs = Math.min(1, Math.hypot(p.vel.x, p.vel.z) / 9);
    const reload = this.reloadT > 0 ? Math.sin(Math.min(1, 1 - this.reloadT / (w.reload / this.buff('reload'))) * Math.PI) : 0;
    const swap = this.swapT > 0 ? this.swapT / 0.32 : 0;
    const heal = p.healing ? 1 : 0;
    v.group.position.set(
      0.2 * (1 - ads) + Math.sin(p.bob) * 0.012 * hs * (1 - ads),
      -0.2 * (1 - ads) - 0.135 * ads + Math.abs(Math.cos(p.bob)) * 0.01 * hs - reload * 0.08 - swap * 0.3 - heal * 0.35 - (p.sliding > 0 ? 0.03 : 0),
      -0.36 + this.vmKick * 0.05 - ads * 0.1
    );
    v.group.rotation.set(this.vmKick * 0.12 + reload * 0.6 + swap * 0.8, reload * 0.3, (p.sliding > 0 ? 0.25 : 0) + reload * 0.4);
    this.flashT -= raw;
    const flash = v.muzzle.getObjectByName('flash')!;
    flash.visible = this.flashT > 0;
    if (flash.visible) flash.rotation.z = Math.random() * 6;
    v.group.visible = p.alive && !(w.id === 'ruler' && ads > 0.92);

    this.updateDomHooks(raw);
  }

  private showDamage(e: Enemy, value: number, eye: boolean, at: THREE.Vector3) {
    if (!this.dmg.length) return;
    // stack hits on the same target into one number, like a tally
    let d = this.dmg.find(x => x.target === e && x.t > 0.45);
    if (!d) {
      d = this.dmg.reduce((a, b) => (a.t < b.t ? a : b));
      d.value = 0;
      d.pos.copy(at);
    }
    d.target = e;
    d.value += value;
    d.eye = d.eye && d.t > 0 ? d.eye || eye : eye;
    d.t = 0.9;
    d.pos.lerp(at, 0.5);
    d.el.textContent = String(Math.round(d.value));
    d.el.dataset.eye = eye ? '1' : '';
  }

  private updateDomHooks(raw: number) {
    const w = this.renderer.domElement.clientWidth;
    const h = this.renderer.domElement.clientHeight;
    for (const d of this.dmg) {
      if (d.t <= 0) continue;
      d.t -= raw;
      _a.copy(d.pos);
      _a.y += (0.9 - d.t) * 0.9;
      _a.project(this.camera);
      if (d.t <= 0 || _a.z > 1) {
        d.el.style.opacity = '0';
        if (d.t <= 0) d.target = null;
        continue;
      }
      const x = (_a.x * 0.5 + 0.5) * w;
      const y = (-_a.y * 0.5 + 0.5) * h;
      const pop = d.t > 0.78 ? 1 + (d.t - 0.78) * 4 : 1;
      d.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%) scale(${pop.toFixed(2)})`;
      d.el.style.opacity = String(Math.min(1, d.t * 3));
    }
    const ch = this.opts.hooks.crosshair;
    if (ch) {
      const sp = Math.round((this.spread(WEAPONS[this.weapon]) / Math.tan((this.camera.fov * Math.PI) / 360)) * h * 0.5 + 6);
      if (sp !== this.crossSpread) {
        this.crossSpread = sp;
        ch.style.setProperty('--spread', `${sp}px`);
      }
      // the weapon's own sight takes over from the plain crosshair while aiming (#8)
      ch.dataset.hidden = this.p.ads > 0.35 ? 'ads' : '';
    }
    const sight = this.opts.hooks.sight;
    if (sight) {
      const ads = Math.round(this.p.ads * 50) / 50;
      if (ads !== this.sightAds) {
        this.sightAds = ads;
        sight.style.setProperty('--ads', String(ads));
      }
      if (this.weapon !== this.sightWeapon) {
        this.sightWeapon = this.weapon;
        sight.dataset.weapon = this.weapon;
      }
    }
    this.mapT -= raw;
    if (this.mapT <= 0) {
      this.mapT = 0.1;
      this.drawMinimap();
    }
  }

  private drawMinimap() {
    const c = this.opts.hooks.minimap;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const S = c.width;
    const scale = S / 2 / 48; // 48 world units from centre to edge
    const p = this.p;
    ctx.save();
    ctx.clearRect(0, 0, S, S);
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#f6f0e1';
    ctx.fillRect(0, 0, S, S);
    // rotate the page around the player: up is where you look
    ctx.translate(S / 2, S / 2);
    ctx.rotate(p.yaw);
    ctx.scale(scale, scale);
    ctx.translate(-p.pos.x, -p.pos.z);
    // grid
    ctx.strokeStyle = 'rgba(86,140,196,0.25)';
    ctx.lineWidth = 1 / scale;
    const g0x = Math.floor((p.pos.x - 70) / 8) * 8;
    const g0z = Math.floor((p.pos.z - 70) / 8) * 8;
    ctx.beginPath();
    for (let x = g0x; x < p.pos.x + 70; x += 8) {
      ctx.moveTo(x, p.pos.z - 70);
      ctx.lineTo(x, p.pos.z + 70);
    }
    for (let z = g0z; z < p.pos.z + 70; z += 8) {
      ctx.moveTo(p.pos.x - 70, z);
      ctx.lineTo(p.pos.x + 70, z);
    }
    ctx.stroke();
    // props: the static colliders as ink shapes
    ctx.fillStyle = 'rgba(31,42,68,0.22)';
    this.world.collision.near(p.pos.x - 60, p.pos.z - 60, p.pos.x + 60, p.pos.z + 60, col => {
      if (col.kind === 'box') ctx.fillRect(col.minX, col.minZ, col.maxX - col.minX, col.maxZ - col.minZ);
      else {
        ctx.beginPath();
        ctx.arc(col.x, col.z, col.r, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    // storm
    const rs = this.ringState;
    ctx.strokeStyle = '#e5533d';
    ctx.lineWidth = 2.5 / scale;
    ctx.beginPath();
    ctx.arc(rs.cx, rs.cz, rs.r, 0, Math.PI * 2);
    ctx.stroke();
    if (rs.phase === 'hold') {
      ctx.setLineDash([3 / scale, 3 / scale]);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2 / scale;
      ctx.beginPath();
      ctx.arc(rs.tx, rs.tz, rs.r1, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // crates
    for (const cr of this.crates) {
      if (cr.open) continue;
      ctx.fillStyle = cr.gold ? '#e0a82e' : '#a87843';
      ctx.fillRect(cr.pos.x - 1, cr.pos.z - 1, 2, 2);
    }
    // pings + revealed bots
    for (const pg of this.pings) {
      ctx.fillStyle = pg.enemy ? '#e5533d' : '#3b82c4';
      ctx.beginPath();
      ctx.arc(pg.pos.x, pg.pos.z, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#e5533d';
    for (const e of this.enemies) {
      if (e.revealT <= 0 || e.state === 'dying') continue;
      ctx.beginPath();
      ctx.arc(e.pos.x, e.pos.z, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // the player arrow, fixed at the centre pointing up
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.moveTo(S / 2, S / 2 - 7);
    ctx.lineTo(S / 2 + 5, S / 2 + 5);
    ctx.lineTo(S / 2, S / 2 + 2);
    ctx.lineTo(S / 2 - 5, S / 2 + 5);
    ctx.closePath();
    ctx.fill();
  }

  // ================================================================= hud

  private syncHud() {
    const p = this.p;
    const a = this.owned.get(this.weapon)!;
    const w = WEAPONS[this.weapon];
    const t = this.runTime;
    const rs = this.ringState;
    const alive = this.enemies.filter(e => e.state !== 'dying').length + this.spawnQueue.length;
    hud.set({
      hp: Math.ceil(p.hp),
      hpMax: 100,
      shield: Math.ceil(p.shield),
      shieldMax: SHIELD_TIERS[p.tier],
      shieldTier: p.tier,
      weapon: this.weapon,
      mag: a.mag,
      magMax: w.mag,
      reserve: a.reserve,
      reload: this.reloadT > 0 ? 1 - this.reloadT / (w.reload / this.buff('reload')) : 0,
      owned: WEAPON_ORDER.filter(id => this.owned.has(id)).map(id => ({ id, ...this.owned.get(id)! })),
      tape: p.tape,
      glue: p.glue,
      healing: p.healing ? { kind: p.healing.kind, p: p.healing.t / p.healing.dur } : null,
      score: this.score,
      combo: this.combo,
      comboT: Math.max(0, this.comboT / 4),
      wave: this.wave,
      enemiesLeft: alive,
      kills: this.kills,
      ringPhase: rs.phase,
      ringTime: Math.max(0, Math.ceil(rs.t)),
      outside: p.alive && this.outside(),
      intermission: Math.max(0, Math.ceil(this.intermission)),
      tactical: { name: this.tactical.name, color: this.tactical.color, icon: this.tactical.icon, cd: this.tacCd, cdMax: this.tactical.cooldown },
      ultimate: { name: this.ultimate.name, color: this.ultimate.color, icon: this.ultimate.icon, cd: this.ultCd, cdMax: this.ultimate.cooldown },
      buffs: this.buffs.map(b => ({ stat: b.stat, t: b.t, max: b.max, color: b.color })),
      prompt: this.prompt,
      killfeed: this.killfeed.filter(k => t - k.at < 6),
      popups: this.popups.filter(x => t - x.at < 1.6),
      callouts: this.callouts.filter(x => t - x.at < 2.6),
      toasts: this.toasts.filter(x => t - x.at < 2.6),
      damageDirs: this.damageDirs.filter(x => t - x.at < 1.2),
      fps: Math.round(this.fps),
      scale: this.renderer.getPixelRatio(),
      lowHp: p.hp < 35,
      ads: p.ads > 0.5
    });
  }
}

// ---------------------------------------------------------------- helpers

function botColor(e: Enemy) {
  return BOT_COLORS[e.def.type] ?? '#ffffff';
}

const BOT_COLORS: Record<string, string> = {
  clover: '#41C4FF',
  star: '#EFDB8E',
  cat: '#EAA06F',
  triangle: '#DC48FF',
  mech: '#95A6C4',
  ghost: '#F4F2FA'
};

/** A folded paper plane, nose along +z. */
function paperPlaneGeometry() {
  const g = new THREE.BufferGeometry();
  // prettier-ignore
  const v = new Float32Array([
    // left wing
    0, 0, 0.45, -0.32, 0.02, -0.3, 0, 0, -0.25,
    // right wing
    0, 0, 0.45, 0, 0, -0.25, 0.32, 0.02, -0.3,
    // keel
    0, 0, 0.45, 0, -0.1, -0.28, 0, 0, -0.25
  ]);
  g.setAttribute('position', new THREE.BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

/** An ink puddle for area skills. Shared with the shader warm-up so both compile one program. */
function puddleMaterial(map: THREE.Texture, color: THREE.Color) {
  return new THREE.MeshBasicMaterial({ map, color, transparent: true, opacity: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
}

/** The expanding ring for blasts, reveals and pulls. Shared with the shader warm-up. */
function shockMaterial(color: THREE.Color) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
}

/** The Eraser Storm: scribbled red hatching, scrolling, translucent. */
function ringMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uAlpha: { value: 0.12 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uAlpha;
      varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
      void main(){
        float u = vUv.x * 160.0;
        float t = floor(uTime * 6.0);
        // diagonal pencil hatching that wobbles a little every redraw
        float wob = (h(vec2(floor(u), t)) - 0.5) * 0.35;
        float hatch = abs(fract(u + vUv.y * 22.0 + wob + uTime * 0.6) - 0.5);
        float line = smoothstep(0.18, 0.05, hatch);
        float fadeTop = smoothstep(1.0, 0.25, vUv.y);
        float base = smoothstep(0.0, 0.02, vUv.y);
        vec3 col = mix(vec3(0.95, 0.45, 0.4), vec3(0.85, 0.2, 0.2), line);
        float a = (0.06 + line * 0.5) * fadeTop * base * uAlpha;
        gl_FragColor = vec4(col, a);
      }`
  });
}
