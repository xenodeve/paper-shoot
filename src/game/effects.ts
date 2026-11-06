import * as THREE from 'three';
import { inkSplat, INK } from './textures';

/**
 * Pooled effects. Each kind is ONE InstancedMesh (one draw call) with a
 * fixed capacity; spawning writes into the next free slot, so a big fight
 * costs no allocation and no extra draw calls.
 */

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();
const _up = new THREE.Vector3(0, 0, 1);
const _q2 = new THREE.Quaternion();

export class Particles {
  readonly mesh: THREE.InstancedMesh;
  private n = 0;
  private readonly cap: number;
  private pos: Float32Array;
  private vel: Float32Array;
  private rot: Float32Array;
  private spin: Float32Array;
  private life: Float32Array;
  private max: Float32Array;
  private size: Float32Array;
  private drag: Float32Array;
  private grav: Float32Array;
  private col: Float32Array;
  density = 1;

  constructor(cap = 700) {
    this.cap = cap;
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.pos = new Float32Array(cap * 3);
    this.vel = new Float32Array(cap * 3);
    this.rot = new Float32Array(cap * 3);
    this.spin = new Float32Array(cap * 3);
    this.life = new Float32Array(cap);
    this.max = new Float32Array(cap);
    this.size = new Float32Array(cap);
    this.drag = new Float32Array(cap);
    this.grav = new Float32Array(cap);
    this.col = new Float32Array(cap * 3);
  }

  /** Spawn `count` bits at `at`, flung along `dir` (or all round) with `speed`. */
  burst(at: THREE.Vector3, count: number, opts: { color: THREE.ColorRepresentation | THREE.ColorRepresentation[]; speed: number; size: number; life: number; up?: number; dir?: THREE.Vector3; cone?: number; gravity?: number; drag?: number }) {
    const k = Math.max(1, Math.round(count * this.density));
    const colors = Array.isArray(opts.color) ? opts.color : [opts.color];
    for (let i = 0; i < k; i++) {
      if (this.n >= this.cap) this.kill(0); // recycle the oldest
      const j = this.n++;
      const j3 = j * 3;
      this.pos[j3] = at.x;
      this.pos[j3 + 1] = at.y;
      this.pos[j3 + 2] = at.z;
      let vx = Math.random() * 2 - 1;
      let vy = Math.random() * 2 - 1;
      let vz = Math.random() * 2 - 1;
      if (opts.dir) {
        const cone = opts.cone ?? 0.6;
        vx = opts.dir.x + vx * cone;
        vy = opts.dir.y + vy * cone;
        vz = opts.dir.z + vz * cone;
      }
      const l = Math.hypot(vx, vy, vz) || 1;
      const sp = opts.speed * (0.4 + Math.random() * 0.8);
      this.vel[j3] = (vx / l) * sp;
      this.vel[j3 + 1] = (vy / l) * sp + (opts.up ?? 0);
      this.vel[j3 + 2] = (vz / l) * sp;
      this.rot[j3] = Math.random() * 6;
      this.rot[j3 + 1] = Math.random() * 6;
      this.rot[j3 + 2] = Math.random() * 6;
      this.spin[j3] = (Math.random() - 0.5) * 16;
      this.spin[j3 + 1] = (Math.random() - 0.5) * 16;
      this.spin[j3 + 2] = (Math.random() - 0.5) * 16;
      this.max[j] = this.life[j] = opts.life * (0.6 + Math.random() * 0.6);
      this.size[j] = opts.size * (0.6 + Math.random() * 0.8);
      this.drag[j] = opts.drag ?? 1.6;
      this.grav[j] = opts.gravity ?? 9;
      _c.set(colors[(Math.random() * colors.length) | 0]);
      this.col[j3] = _c.r;
      this.col[j3 + 1] = _c.g;
      this.col[j3 + 2] = _c.b;
    }
  }

  private kill(j: number) {
    const last = --this.n;
    if (j === last) return;
    const a = j * 3;
    const b = last * 3;
    for (let k = 0; k < 3; k++) {
      this.pos[a + k] = this.pos[b + k];
      this.vel[a + k] = this.vel[b + k];
      this.rot[a + k] = this.rot[b + k];
      this.spin[a + k] = this.spin[b + k];
      this.col[a + k] = this.col[b + k];
    }
    this.life[j] = this.life[last];
    this.max[j] = this.max[last];
    this.size[j] = this.size[last];
    this.drag[j] = this.drag[last];
    this.grav[j] = this.grav[last];
  }

  update(dt: number) {
    for (let j = 0; j < this.n; j++) {
      this.life[j] -= dt;
      if (this.life[j] <= 0) {
        this.kill(j--);
        continue;
      }
      const j3 = j * 3;
      const dr = Math.exp(-this.drag[j] * dt);
      this.vel[j3] *= dr;
      this.vel[j3 + 2] *= dr;
      this.vel[j3 + 1] = this.vel[j3 + 1] * dr - this.grav[j] * dt;
      // paper flutters: falling bits drift sideways
      const flutter = Math.sin(this.rot[j3] * 2) * 0.6 * dt * (this.grav[j] > 0 ? 1 : 0);
      this.pos[j3] += this.vel[j3] * dt + flutter;
      this.pos[j3 + 1] += this.vel[j3 + 1] * dt;
      this.pos[j3 + 2] += this.vel[j3 + 2] * dt;
      if (this.pos[j3 + 1] < 0.02) {
        this.pos[j3 + 1] = 0.02;
        this.vel[j3 + 1] = 0;
        this.vel[j3] *= 0.5;
        this.vel[j3 + 2] *= 0.5;
        this.spin[j3] *= 0.8;
        this.spin[j3 + 1] *= 0.8;
        this.spin[j3 + 2] *= 0.8;
      }
      this.rot[j3] += this.spin[j3] * dt;
      this.rot[j3 + 1] += this.spin[j3 + 1] * dt;
      this.rot[j3 + 2] += this.spin[j3 + 2] * dt;
    }
    for (let j = 0; j < this.n; j++) {
      const j3 = j * 3;
      const t = this.life[j] / this.max[j];
      const s = this.size[j] * Math.min(1, t * 3);
      _m.compose(_p.set(this.pos[j3], this.pos[j3 + 1], this.pos[j3 + 2]), _q.setFromEuler(_e.set(this.rot[j3], this.rot[j3 + 1], this.rot[j3 + 2])), _s.set(s, s, s));
      this.mesh.setMatrixAt(j, _m);
      this.mesh.instanceColor!.setXYZ(j, this.col[j3], this.col[j3 + 1], this.col[j3 + 2]);
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

/** Ink splats left where shots land. A ring buffer: the oldest fades out. */
export class Decals {
  readonly mesh: THREE.InstancedMesh;
  private next = 0;
  private filled = 0;
  private readonly tex: THREE.Texture;
  private readonly cap: number;
  constructor(cap = 90) {
    this.cap = cap;
    this.tex = inkSplat(INK, 9);
    const mat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, cap);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
  }
  add(at: THREE.Vector3, normal: THREE.Vector3, size: number) {
    _q.setFromUnitVectors(_up, normal);
    _e.set(0, 0, Math.random() * 6);
    _q.multiply(_q2.setFromEuler(_e));
    _p.copy(at).addScaledVector(normal, 0.02);
    _m.compose(_p, _q, _s.set(size, size, size));
    this.mesh.setMatrixAt(this.next, _m);
    this.next = (this.next + 1) % this.cap;
    this.filled = Math.min(this.cap, this.filled + 1);
    this.mesh.count = this.filled;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  clear() {
    this.next = this.filled = 0;
    this.mesh.count = 0;
  }
  dispose() {
    this.tex.dispose();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

/** Ink tracer strokes: stretched boxes that thin out in ~0.1 s. */
export class Tracers {
  readonly mesh: THREE.InstancedMesh;
  private a: { from: THREE.Vector3; to: THREE.Vector3; life: number; max: number; w: number }[] = [];
  private next = 0;
  private readonly cap: number;
  constructor(cap = 48, color: THREE.ColorRepresentation = INK) {
    this.cap = cap;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0, 0.5);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color, toneMapped: false }), cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < cap; i++) this.a.push({ from: new THREE.Vector3(), to: new THREE.Vector3(), life: 0, max: 1, w: 0.03 });
    this.mesh.count = cap;
    for (let i = 0; i < cap; i++) this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
  }
  add(from: THREE.Vector3, to: THREE.Vector3, width = 0.035, life = 0.09) {
    const t = this.a[this.next];
    this.next = (this.next + 1) % this.cap;
    t.from.copy(from);
    t.to.copy(to);
    t.life = t.max = life;
    t.w = width;
  }
  update(dt: number) {
    for (let i = 0; i < this.cap; i++) {
      const t = this.a[i];
      if (t.life <= 0) continue;
      t.life -= dt;
      const k = Math.max(0, t.life / t.max);
      _p.subVectors(t.to, t.from);
      const len = _p.length();
      _q.setFromUnitVectors(_up, _p.normalize());
      // the stroke shortens from the shooter's end as it fades
      _s.set(t.w * k, t.w * k, len * (0.35 + 0.65 * k));
      _p.copy(t.to).addScaledVector(_p, -len * (0.35 + 0.65 * k));
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

/** Generic pooled instanced objects (darts, paper balls, pickups glints). */
export class InstancePool<T extends { alive: boolean }> {
  readonly mesh: THREE.InstancedMesh;
  readonly items: T[] = [];
  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, cap: number, make: () => T) {
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    for (let i = 0; i < cap; i++) this.items.push(make());
  }
  spawn(): T | null {
    for (const it of this.items) if (!it.alive) return (it.alive = true), it;
    return null;
  }
  /** Writes the matrix of each live item, packed at the front. */
  commit(write: (it: T, m: THREE.Matrix4) => void) {
    let n = 0;
    for (const it of this.items) {
      if (!it.alive) continue;
      write(it, _m);
      this.mesh.setMatrixAt(n++, _m);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  clear() {
    for (const it of this.items) it.alive = false;
    this.mesh.count = 0;
  }
  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
