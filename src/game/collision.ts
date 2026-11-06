import * as THREE from 'three';

/**
 * Static collision world: axis-aligned boxes and vertical cylinders on a
 * uniform grid. Movement and raycasts query the grid, never the meshes, and
 * nothing here allocates per call (scratch objects are reused).
 */
export interface Box {
  kind: 'box';
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  id: number;
  /** temporary colliders (skill walls) */
  dynamic?: boolean;
  stamp: number;
}
export interface Cyl {
  kind: 'cyl';
  x: number;
  z: number;
  r: number;
  minY: number;
  maxY: number;
  id: number;
  dynamic?: boolean;
  stamp: number;
}
export type Collider = Box | Cyl;

const CELL = 8;
const HALF = 16; // grid covers [-128, 128]
const DIM = HALF * 2;

export class CollisionWorld {
  readonly all: Collider[] = [];
  private grid: Collider[][] = Array.from({ length: DIM * DIM }, () => []);
  private stamp = 0;
  private nextId = 1;

  private cellsFor(c: Collider, cb: (i: number) => void) {
    const [x0, z0, x1, z1] = c.kind === 'box' ? [c.minX, c.minZ, c.maxX, c.maxZ] : [c.x - c.r, c.z - c.r, c.x + c.r, c.z + c.r];
    const i0 = Math.max(0, Math.floor(x0 / CELL) + HALF);
    const i1 = Math.min(DIM - 1, Math.floor(x1 / CELL) + HALF);
    const j0 = Math.max(0, Math.floor(z0 / CELL) + HALF);
    const j1 = Math.min(DIM - 1, Math.floor(z1 / CELL) + HALF);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) cb(i * DIM + j);
  }

  addBox(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number, dynamic = false): Box {
    const b: Box = { kind: 'box', minX, minY, minZ, maxX, maxY, maxZ, id: this.nextId++, dynamic, stamp: 0 };
    this.all.push(b);
    this.cellsFor(b, i => this.grid[i].push(b));
    return b;
  }

  addCyl(x: number, z: number, r: number, minY: number, maxY: number, dynamic = false): Cyl {
    const c: Cyl = { kind: 'cyl', x, z, r, minY, maxY, id: this.nextId++, dynamic, stamp: 0 };
    this.all.push(c);
    this.cellsFor(c, i => this.grid[i].push(c));
    return c;
  }

  remove(c: Collider) {
    const k = this.all.indexOf(c);
    if (k >= 0) this.all.splice(k, 1);
    this.cellsFor(c, i => {
      const list = this.grid[i];
      const j = list.indexOf(c);
      if (j >= 0) list.splice(j, 1);
    });
  }

  /** Visit each collider near an xz rectangle exactly once. */
  near(x0: number, z0: number, x1: number, z1: number, cb: (c: Collider) => void) {
    const s = ++this.stamp;
    const i0 = Math.max(0, Math.floor(x0 / CELL) + HALF);
    const i1 = Math.min(DIM - 1, Math.floor(x1 / CELL) + HALF);
    const j0 = Math.max(0, Math.floor(z0 / CELL) + HALF);
    const j1 = Math.min(DIM - 1, Math.floor(z1 / CELL) + HALF);
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++) {
        const list = this.grid[i * DIM + j];
        for (let n = 0; n < list.length; n++) {
          const c = list[n];
          if (c.stamp === s) continue;
          c.stamp = s;
          cb(c);
        }
      }
  }

  /**
   * Move a vertical capsule (approximated as a cylinder) and resolve it out
   * of the world. `pos` is the feet position and is modified in place.
   * Returns the height of the ground the body stands on, or -Infinity.
   */
  resolve(pos: THREE.Vector3, radius: number, height: number, stepUp: number, vy: number): number {
    let ground = 0; // the floor plane
    const feet = pos.y;
    this.near(pos.x - radius - 1, pos.z - radius - 1, pos.x + radius + 1, pos.z + radius + 1, c => {
      if (feet - c.maxY > 0.02) {
        // fully above: it may become the ground if we are over it
        if (overlapXZ(c, pos.x, pos.z, radius * 0.7)) ground = Math.max(ground, c.maxY);
        return;
      }
      if (feet + height <= c.minY) return;
      // within the vertical band: can we step onto it?
      if (c.maxY - feet <= stepUp && vy <= 0.5 && overlapXZ(c, pos.x, pos.z, radius * 0.7)) {
        ground = Math.max(ground, c.maxY);
        return;
      }
      pushOut(c, pos, radius);
    });
    return ground;
  }

  /** Nearest hit along a ray, or Infinity. Writes the hit normal into `normal`. */
  raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number, normal?: THREE.Vector3, ignoreDynamic = false): number {
    let best = maxDist;
    let hit = false;
    const ex = origin.x + dir.x * maxDist;
    const ez = origin.z + dir.z * maxDist;
    // floor plane
    if (dir.y < -1e-6) {
      const t = -origin.y / dir.y;
      if (t >= 0 && t < best) {
        best = t;
        hit = true;
        normal?.set(0, 1, 0);
      }
    }
    this.near(Math.min(origin.x, ex), Math.min(origin.z, ez), Math.max(origin.x, ex), Math.max(origin.z, ez), c => {
      if (ignoreDynamic && c.dynamic) return;
      const t = c.kind === 'box' ? rayBox(origin, dir, c, best, normal) : rayCyl(origin, dir, c, best, normal);
      if (t < best) {
        best = t;
        hit = true;
      }
    });
    return hit ? best : Infinity;
  }

  /** True if nothing static blocks the segment. */
  visible(a: THREE.Vector3, b: THREE.Vector3): boolean {
    _d.subVectors(b, a);
    const len = _d.length();
    if (len < 1e-4) return true;
    _d.multiplyScalar(1 / len);
    return this.raycast(a, _d, len) === Infinity;
  }
}

const _d = new THREE.Vector3();
const _n = new THREE.Vector3();

function overlapXZ(c: Collider, x: number, z: number, r: number) {
  if (c.kind === 'box') {
    const cx = Math.max(c.minX, Math.min(x, c.maxX));
    const cz = Math.max(c.minZ, Math.min(z, c.maxZ));
    return (x - cx) ** 2 + (z - cz) ** 2 < r * r || (x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ);
  }
  return (x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + r) ** 2;
}

function pushOut(c: Collider, pos: THREE.Vector3, r: number) {
  if (c.kind === 'cyl') {
    const dx = pos.x - c.x;
    const dz = pos.z - c.z;
    const d = Math.hypot(dx, dz);
    const min = c.r + r;
    if (d >= min) return;
    if (d < 1e-5) {
      pos.x += min;
      return;
    }
    pos.x = c.x + (dx / d) * min;
    pos.z = c.z + (dz / d) * min;
    return;
  }
  const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
  const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
  const dx = pos.x - cx;
  const dz = pos.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 > 1e-8) {
    if (d2 >= r * r) return;
    const d = Math.sqrt(d2);
    pos.x = cx + (dx / d) * r;
    pos.z = cz + (dz / d) * r;
    return;
  }
  // centre inside the box: leave by the shallowest side
  const l = pos.x - c.minX;
  const rr = c.maxX - pos.x;
  const b = pos.z - c.minZ;
  const f = c.maxZ - pos.z;
  const m = Math.min(l, rr, b, f);
  if (m === l) pos.x = c.minX - r;
  else if (m === rr) pos.x = c.maxX + r;
  else if (m === b) pos.z = c.minZ - r;
  else pos.z = c.maxZ + r;
}

function rayBox(o: THREE.Vector3, d: THREE.Vector3, b: Box, maxT: number, normal?: THREE.Vector3) {
  let tmin = 0;
  let tmax = maxT;
  let axis = -1;
  let sign = 0;
  const lo = [b.minX, b.minY, b.minZ];
  const hi = [b.maxX, b.maxY, b.maxZ];
  const oo = [o.x, o.y, o.z];
  const dd = [d.x, d.y, d.z];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(dd[i]) < 1e-9) {
      if (oo[i] < lo[i] || oo[i] > hi[i]) return Infinity;
      continue;
    }
    const inv = 1 / dd[i];
    let t1 = (lo[i] - oo[i]) * inv;
    let t2 = (hi[i] - oo[i]) * inv;
    let s = -1;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
      s = 1;
    }
    if (t1 > tmin) {
      tmin = t1;
      axis = i;
      sign = s;
    }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }
  if (axis < 0) return Infinity; // started inside
  if (normal) {
    _n.set(0, 0, 0);
    _n.setComponent(axis, sign);
    normal.copy(_n);
  }
  return tmin;
}

function rayCyl(o: THREE.Vector3, d: THREE.Vector3, c: Cyl, maxT: number, normal?: THREE.Vector3) {
  const ox = o.x - c.x;
  const oz = o.z - c.z;
  const a = d.x * d.x + d.z * d.z;
  let best = Infinity;
  if (a > 1e-9) {
    const b = 2 * (ox * d.x + oz * d.z);
    const cc = ox * ox + oz * oz - c.r * c.r;
    const disc = b * b - 4 * a * cc;
    if (disc >= 0) {
      const t = (-b - Math.sqrt(disc)) / (2 * a);
      if (t >= 0 && t < maxT) {
        const y = o.y + d.y * t;
        if (y >= c.minY && y <= c.maxY) {
          best = t;
          normal?.set(ox + d.x * t, 0, oz + d.z * t).normalize();
        }
      }
    }
  }
  // top cap
  if (Math.abs(d.y) > 1e-9) {
    const t = (c.maxY - o.y) / d.y;
    if (t >= 0 && t < Math.min(best, maxT)) {
      const x = ox + d.x * t;
      const z = oz + d.z * t;
      if (x * x + z * z <= c.r * c.r) {
        best = t;
        normal?.set(0, 1, 0);
      }
    }
  }
  return best;
}
