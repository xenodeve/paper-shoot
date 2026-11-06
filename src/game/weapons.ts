import * as THREE from 'three';
import { INK } from './textures';
import type { Sfx } from './audio';

export type WeaponId = 'pencil' | 'stapler' | 'punch' | 'ruler';

export interface WeaponDef {
  id: WeaponId;
  /** seconds between shots */
  interval: number;
  auto: boolean;
  damage: number;
  pellets: number;
  mag: number;
  reserveMax: number; // Infinity = never runs dry
  reload: number;
  spreadHip: number;
  spreadAds: number;
  /** extra spread per shot, decays */
  bloom: number;
  range: number;
  eyeMult: number;
  recoil: number;
  adsFov: number; // multiplier on base fov
  adsTime: number;
  falloff: [start: number, end: number, min: number];
  sfx: Sfx;
  color: string;
  tracerWidth: number;
  /** movement speed while holding it */
  mobility: number;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pencil: {
    id: 'pencil',
    interval: 0.17,
    auto: false,
    damage: 24,
    pellets: 1,
    mag: 12,
    reserveMax: Infinity,
    reload: 1.15,
    spreadHip: 0.012,
    spreadAds: 0.002,
    bloom: 0.006,
    range: 120,
    eyeMult: 2,
    recoil: 0.018,
    adsFov: 0.85,
    adsTime: 0.14,
    falloff: [30, 70, 0.6],
    sfx: 'pistol',
    color: '#f2c230',
    tracerWidth: 0.035,
    mobility: 1.05
  },
  stapler: {
    id: 'stapler',
    interval: 0.072,
    auto: true,
    damage: 13,
    pellets: 1,
    mag: 30,
    reserveMax: 210,
    reload: 1.6,
    spreadHip: 0.028,
    spreadAds: 0.011,
    bloom: 0.0035,
    range: 90,
    eyeMult: 1.6,
    recoil: 0.009,
    adsFov: 0.88,
    adsTime: 0.16,
    falloff: [18, 45, 0.55],
    sfx: 'smg',
    color: '#c23b3b',
    tracerWidth: 0.025,
    mobility: 1
  },
  punch: {
    id: 'punch',
    interval: 0.82,
    auto: false,
    damage: 11,
    pellets: 9,
    mag: 5,
    reserveMax: 40,
    reload: 2.05,
    spreadHip: 0.075,
    spreadAds: 0.055,
    bloom: 0,
    range: 45,
    eyeMult: 1.4,
    recoil: 0.06,
    adsFov: 0.92,
    adsTime: 0.18,
    falloff: [7, 22, 0.25],
    sfx: 'shotgun',
    color: '#8a8f99',
    tracerWidth: 0.02,
    mobility: 0.96
  },
  ruler: {
    id: 'ruler',
    interval: 0.9,
    auto: false,
    damage: 64,
    pellets: 1,
    mag: 5,
    reserveMax: 30,
    reload: 2.1,
    spreadHip: 0.045,
    spreadAds: 0,
    bloom: 0,
    range: 220,
    eyeMult: 2.5,
    recoil: 0.07,
    adsFov: 0.42,
    adsTime: 0.26,
    falloff: [200, 220, 1],
    sfx: 'rifle',
    color: '#e0a82e',
    tracerWidth: 0.055,
    mobility: 0.9
  }
};

export const WEAPON_ORDER: WeaponId[] = ['pencil', 'stapler', 'punch', 'ruler'];

export function falloff(def: WeaponDef, dist: number) {
  const [a, b, min] = def.falloff;
  if (dist <= a) return 1;
  if (dist >= b) return min;
  return 1 - ((dist - a) / (b - a)) * (1 - min);
}

/** Build the first-person model of a weapon out of folded-paper blocks. */
export function buildViewModel(id: WeaponId, ramp: THREE.Texture): { group: THREE.Group; muzzle: THREE.Object3D } {
  const g = new THREE.Group();
  const lines: number[] = [];
  const mat = (c: string) => new THREE.MeshToonMaterial({ color: c, gradientMap: ramp });
  const part = (geo: THREE.BufferGeometry, color: string, pos: [number, number, number], rot: [number, number, number] = [0, 0, 0]) => {
    const m = new THREE.Mesh(geo, mat(color));
    m.position.set(...pos);
    m.rotation.set(...rot);
    g.add(m);
    m.updateMatrix();
    const e = new THREE.EdgesGeometry(geo, 25);
    e.applyMatrix4(m.matrix);
    const a = e.getAttribute('position').array;
    for (let i = 0; i < a.length; i++) lines.push(a[i]);
    e.dispose();
    return m;
  };
  const B = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
  const C = (r: number, h: number, s = 6) => new THREE.CylinderGeometry(r, r, h, s);
  const muzzle = new THREE.Object3D();

  if (id === 'pencil') {
    part(C(0.045, 0.42, 6), '#f2c230', [0, 0.02, -0.12], [Math.PI / 2, 0, 0]);
    part(new THREE.ConeGeometry(0.045, 0.1, 6), '#ecc79a', [0, 0.02, -0.38], [-Math.PI / 2, 0, 0]);
    part(new THREE.ConeGeometry(0.016, 0.035, 6), '#3a3a44', [0, 0.02, -0.44], [-Math.PI / 2, 0, 0]);
    part(C(0.047, 0.05, 6), '#b9bfc8', [0, 0.02, 0.11], [Math.PI / 2, 0, 0]);
    part(B(0.07, 0.17, 0.09), '#f29bb0', [0, -0.09, 0.07], [0.25, 0, 0]);
    part(B(0.02, 0.05, 0.05), INK, [0, -0.03, -0.01]);
    muzzle.position.set(0, 0.02, -0.47);
  } else if (id === 'stapler') {
    part(B(0.11, 0.07, 0.42), '#c23b3b', [0, 0.03, -0.12]);
    part(B(0.1, 0.05, 0.4), '#9b2b2b', [0, -0.03, -0.11]);
    part(B(0.115, 0.025, 0.44), '#3a3a44', [0, -0.065, -0.12]);
    part(B(0.06, 0.16, 0.07), '#2b2b33', [0, -0.13, 0.02], [0.2, 0, 0]);
    part(B(0.05, 0.13, 0.06), '#d0d4da', [0, -0.13, -0.15]);
    muzzle.position.set(0, 0.0, -0.36);
  } else if (id === 'punch') {
    part(B(0.2, 0.06, 0.34), '#5b6270', [0, -0.05, -0.12]);
    part(B(0.18, 0.05, 0.3), '#8a8f99', [0, 0.02, -0.1], [-0.12, 0, 0]);
    part(C(0.03, 0.09, 8), '#2b2b33', [-0.05, -0.02, -0.28], [Math.PI / 2, 0, 0]);
    part(C(0.03, 0.09, 8), '#2b2b33', [0.05, -0.02, -0.28], [Math.PI / 2, 0, 0]);
    part(B(0.07, 0.15, 0.08), '#3a3a44', [0, -0.15, 0.03], [0.25, 0, 0]);
    muzzle.position.set(0, -0.02, -0.34);
  } else {
    part(B(0.09, 0.018, 0.8), '#e8c25a', [0, 0.02, -0.25]);
    for (let i = 0; i < 9; i++) part(B(0.035, 0.02, 0.006), INK, [0.025, 0.031, -0.6 + i * 0.08]);
    part(C(0.035, 0.24, 8), '#f4f1ea', [0, 0.085, -0.15], [Math.PI / 2, 0, 0]);
    part(C(0.04, 0.03, 8), INK, [0, 0.085, -0.28], [Math.PI / 2, 0, 0]);
    part(B(0.06, 0.15, 0.08), '#a0703f', [0, -0.08, 0.06], [0.3, 0, 0]);
    part(B(0.07, 0.07, 0.24), '#a0703f', [0, -0.02, 0.18]);
    muzzle.position.set(0, 0.02, -0.66);
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
  g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: INK })));

  // muzzle burst: a cut-paper star that flashes for a frame or two
  const star = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const r = i % 2 ? 0.022 : 0.06;
    if (i === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const flash = new THREE.Mesh(new THREE.ShapeGeometry(star), new THREE.MeshBasicMaterial({ color: '#ffd84a', side: THREE.DoubleSide, toneMapped: false }));
  flash.name = 'flash';
  flash.visible = false;
  muzzle.add(flash);
  g.add(muzzle);
  return { group: g, muzzle };
}
